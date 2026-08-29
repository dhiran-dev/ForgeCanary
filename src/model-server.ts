import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { readIntegerArg } from './args.js';
import { readJsonBody, sendError, sendJson } from './http.js';

interface ChatMessage {
  role?: string;
  content?: unknown;
  tool_calls?: unknown[];
}

interface ChatTool {
  type?: string;
  function?: { name?: string };
}

interface ChatCompletionRequest {
  model?: string;
  messages?: ChatMessage[];
  tools?: ChatTool[];
  stream?: boolean;
}

const port = readIntegerArg('port', 9100);

function flattenText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(flattenText).join(' ');
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return [record.text, record.content, record.value].map(flattenText).join(' ');
  }
  return '';
}

function latestUserText(messages: ChatMessage[]): string {
  return [...messages].reverse().find(message => message.role === 'user')?.content
    ? flattenText([...messages].reverse().find(message => message.role === 'user')?.content)
    : '';
}

function findTool(tools: ChatTool[], fragment: string): string | undefined {
  return tools.map(tool => tool.function?.name).find(name => name?.includes(fragment));
}

function deterministicCallId(seed: string): string {
  return `call_${createHash('sha256').update(seed).digest('hex').slice(0, 20)}`;
}

function planResponse(body: ChatCompletionRequest): {
  content?: string;
  toolCall?: { id: string; name: string; arguments: string };
} {
  const messages = body.messages ?? [];
  const tools = body.tools ?? [];
  const latest = messages.at(-1);

  if (latest?.role === 'tool') {
    return { content: 'The requested operation completed. Its external state must be verified independently.' };
  }

  const prompt = latestUserText(messages);
  const activateTool = findTool(tools, 'activate_compatibility_adapter');
  if (activateTool) {
    const adapterId = /ADAPTER=([A-Za-z0-9._-]+)/.exec(prompt)?.[1];
    const scope = /SCOPE=([A-Za-z0-9._:-]+)/.exec(prompt)?.[1];
    const candidateSchemaHash = /SCHEMA_HASH=([a-f0-9]{64})/.exec(prompt)?.[1];
    const evidenceReceiptHash = /EVIDENCE_HASH=([a-f0-9]{64})/.exec(prompt)?.[1];
    const expectedCurrentStateHash = /EXPECTED_STATE_HASH=([a-f0-9]{64})/.exec(prompt)?.[1];
    if (!adapterId || !scope || !candidateSchemaHash || !evidenceReceiptHash || !expectedCurrentStateHash) {
      return { content: 'The adapter request is missing required evidence or stale-state fields.' };
    }
    return {
      toolCall: {
        id: deterministicCallId(`${activateTool}:${adapterId}:${expectedCurrentStateHash}`),
        name: activateTool,
        arguments: JSON.stringify({
          adapter_id: adapterId,
          scope,
          candidate_schema_hash: candidateSchemaHash,
          evidence_receipt_hash: evidenceReceiptHash,
          expected_current_state_hash: expectedCurrentStateHash
        })
      }
    };
  }

  const reserveTool = findTool(tools, 'reserve_inventory');
  if (reserveTool) {
    const orderId = /ORDER=([A-Z0-9-]+)/.exec(prompt)?.[1];
    const sku = /SKU=([A-Z0-9-]+)/.exec(prompt)?.[1];
    const quantity = Number.parseInt(/QTY=(\d+)/.exec(prompt)?.[1] ?? '', 10);
    if (!orderId || !sku || !Number.isInteger(quantity)) {
      return { content: 'The order request is missing ORDER, SKU, or QTY.' };
    }
    return {
      toolCall: {
        id: deterministicCallId(`${reserveTool}:${orderId}`),
        name: reserveTool,
        arguments: JSON.stringify({ order_id: orderId, sku, quantity })
      }
    };
  }

  return { content: 'No supported ForgeCanary test tool was available.' };
}

function completionChunk(body: ChatCompletionRequest, plan: ReturnType<typeof planResponse>): Record<string, unknown> {
  const delta = plan.toolCall
    ? {
        role: 'assistant',
        tool_calls: [
          {
            index: 0,
            id: plan.toolCall.id,
            type: 'function',
            function: { name: plan.toolCall.name, arguments: plan.toolCall.arguments }
          }
        ]
      }
    : { role: 'assistant', content: plan.content ?? '' };
  return {
    id: `chatcmpl-${deterministicCallId(JSON.stringify(body.messages ?? []))}`,
    object: 'chat.completion.chunk',
    created: Math.floor(Date.now() / 1000),
    model: body.model ?? 'forgecanary-deterministic',
    choices: [{ index: 0, delta, finish_reason: plan.toolCall ? 'tool_calls' : 'stop' }],
    usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 }
  };
}

function completion(body: ChatCompletionRequest, plan: ReturnType<typeof planResponse>): Record<string, unknown> {
  const message = plan.toolCall
    ? {
        role: 'assistant',
        content: null,
        tool_calls: [
          {
            id: plan.toolCall.id,
            type: 'function',
            function: { name: plan.toolCall.name, arguments: plan.toolCall.arguments }
          }
        ]
      }
    : { role: 'assistant', content: plan.content ?? '' };
  return {
    id: `chatcmpl-${deterministicCallId(JSON.stringify(body.messages ?? []))}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: body.model ?? 'forgecanary-deterministic',
    choices: [{ index: 0, message, finish_reason: plan.toolCall ? 'tool_calls' : 'stop' }],
    usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 }
  };
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? '/', `http://${request.headers.host ?? `127.0.0.1:${port}`}`);
    if (url.pathname === '/health' && request.method === 'GET') {
      sendJson(response, 200, { status: 'ok', model: 'forgecanary-deterministic' });
      return;
    }
    if (url.pathname === '/v1/models' && request.method === 'GET') {
      sendJson(response, 200, {
        object: 'list',
        data: [{ id: 'forgecanary-deterministic', object: 'model', owned_by: 'forgecanary' }]
      });
      return;
    }
    if (url.pathname !== '/v1/chat/completions' || request.method !== 'POST') {
      sendJson(response, 404, { error: { message: 'not_found', type: 'invalid_request_error' } });
      return;
    }

    const body = await readJsonBody<ChatCompletionRequest>(request);
    const plan = planResponse(body);
    const chosen = plan.toolCall?.name ?? 'assistant-response';
    console.log(`deterministic model request: ${chosen}`);

    if (!body.stream) {
      sendJson(response, 200, completion(body, plan));
      return;
    }

    response.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache',
      connection: 'keep-alive'
    });
    response.write(`data: ${JSON.stringify(completionChunk(body, plan))}\n\n`);
    response.write('data: [DONE]\n\n');
    response.end();
  } catch (error) {
    sendError(response, error);
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`ForgeCanary deterministic model listening at http://127.0.0.1:${port}/v1`);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
