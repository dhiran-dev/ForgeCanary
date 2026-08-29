import { TrueForge } from '@truefoundry/trueforge-sdk';
import type { Order } from './domain.js';

export const TRUEFORGE_BASE_URL = process.env.TRUEFORGE_BASE_URL ?? 'http://localhost:8790';
export const MODEL_BASE_URL = process.env.MODEL_BASE_URL ?? 'http://127.0.0.1:9100/v1';
export const PROVIDER_NAME = 'forgecanary-local';
export const MODEL_NAME = 'forgecanary-deterministic';

export interface JobTranscript {
  sessionId: string;
  userMessage: string;
  streamedEventTypes: string[];
  persistedEventTypes: string[];
  toolName: string;
  toolArguments: Record<string, unknown>;
  toolResponse: Record<string, unknown>;
}

interface EventShape {
  type: string;
  input?: Array<{ type?: string; content?: string }>;
  toolCalls?: Array<{
    function?: { name?: string; arguments?: string };
  }>;
  content?: string;
}

export interface InventoryJobOptions {
  modelName?: string;
  reasoningEffort?: string;
  onEvent?: (event: unknown, sessionId: string) => void | Promise<void>;
}

export function makeClient(): TrueForge {
  return new TrueForge({ baseUrl: TRUEFORGE_BASE_URL, timeoutInSeconds: 120 });
}

export async function configureModel(client: TrueForge): Promise<void> {
  await client.settings.modelProviders.createOrUpdate({
    manifest: {
      type: 'custom',
      name: PROVIDER_NAME,
      baseUrl: MODEL_BASE_URL,
      models: [
        {
          modelId: MODEL_NAME,
          name: MODEL_NAME,
          properties: { contextLength: 16_384, maxOutputTokens: 2_048 }
        }
      ]
    }
  });
}

export async function configureMcp(
  client: TrueForge,
  name: string,
  baseUrl: string,
  description: string
): Promise<void> {
  await client.settings.mcpServers.createOrUpdate({
    manifest: { type: 'remote', name, description, url: `${baseUrl}/mcp` }
  });
}

export function promptForOrder(order: Order): string {
  return `Reserve inventory for ORDER=${order.id} SKU=${order.sku} QTY=${order.quantity}. Preserve the historical workflow.`;
}

export async function runInventoryJob(
  client: TrueForge,
  mcpName: string,
  userMessage: string,
  options: InventoryJobOptions = {}
): Promise<JobTranscript> {
  const { data: session } = await client.sessions.create({
    agent: {
      spec: {
        model: {
          name: options.modelName ?? `${PROVIDER_NAME}/${MODEL_NAME}`,
          params: {
            temperature: 0,
            parallelToolCalls: false,
            maxTokens: 512,
            ...(options.reasoningEffort ? { reasoningEffort: options.reasoningEffort } : {})
          }
        },
        instructions:
          'Execute the requested inventory reservation exactly once using reserve_inventory. Do not add an allocation policy unless the user explicitly supplies one.',
        mcpServers: [
          {
            name: mcpName,
            enableTools: ['reserve_inventory'],
            preload: true,
            requireApprovalForTools: []
          }
        ],
        config: {
          askUserQuestions: { enabled: false },
          dynamicSubAgents: { enabled: false },
          generativeUi: { enabled: false },
          iterationLimit: 8
        }
      }
    }
  });

  const streamedEventTypes: string[] = [];
  const stream = await client.sessions.createTurnStream(session.id, {
    input: [{ type: 'user.message', content: userMessage }]
  });
  for await (const { data: event } of stream.withMetadata()) {
    streamedEventTypes.push(event.type);
    await options.onEvent?.(event, session.id);
  }

  return readInventoryJob(client, session.id, streamedEventTypes);
}

export async function readInventoryJob(
  client: TrueForge,
  sessionId: string,
  streamedEventTypes: string[] = []
): Promise<JobTranscript> {
  const events: EventShape[] = [];
  for await (const item of await client.sessions.listEvents(sessionId, { limit: 100 })) {
    events.push(item.event as unknown as EventShape);
  }
  const created = events.find(event => event.type === 'turn.created');
  const toolMessage = events.find(event => event.type === 'model.message' && (event.toolCalls?.length ?? 0) > 0);
  const toolResponse = events.find(event => event.type === 'tool.response');
  const call = toolMessage?.toolCalls?.[0];
  const persistedUserMessage = created?.input?.find(item => item.type === 'user.message')?.content;
  if (!persistedUserMessage || !call?.function?.name || !call.function.arguments || !toolResponse?.content) {
    throw new Error(`TrueForge session ${sessionId} did not persist a complete MCP transcript`);
  }

  return {
    sessionId,
    userMessage: persistedUserMessage,
    streamedEventTypes,
    persistedEventTypes: events.map(event => event.type),
    toolName: call.function.name,
    toolArguments: JSON.parse(call.function.arguments) as Record<string, unknown>,
    toolResponse: JSON.parse(toolResponse.content) as Record<string, unknown>
  };
}
