import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import * as z from 'zod/v4';
import { readArg, readIntegerArg } from './args.js';
import {
  initialAdapterState,
  readJsonFile,
  sha256,
  writeJsonFile,
  type AdapterState
} from './domain.js';
import { sendError, sendJson } from './http.js';

const port = readIntegerArg('port', 9200);
const adapterPath = resolve(readArg('adapter', '.data/adapter.json'));

function getState(): AdapterState {
  return readJsonFile(adapterPath, initialAdapterState);
}

function setState(value: AdapterState): void {
  writeJsonFile(adapterPath, value);
}

function buildMcpServer(): McpServer {
  const server = new McpServer({ name: 'forgecanary-adapter-control', version: '1.0.0' });

  server.registerTool(
    'get_adapter_status',
    {
      title: 'Get adapter status',
      description: 'Read the active compatibility adapter and its state hash.',
      inputSchema: {},
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
    },
    async () => {
      const state = getState();
      return { content: [{ type: 'text', text: JSON.stringify({ state, state_hash: sha256(state) }) }] };
    }
  );

  server.registerTool(
    'activate_compatibility_adapter',
    {
      title: 'Activate compatibility adapter',
      description:
        'Activate a narrowly scoped, reversible compatibility adapter after evidence review. Uses a stale-state guard.',
      inputSchema: {
        adapter_id: z.literal('explicit-fefo-v1'),
        scope: z.literal('reserve_inventory:perishable-default'),
        candidate_schema_hash: z.string().regex(/^[a-f0-9]{64}$/),
        evidence_receipt_hash: z.string().regex(/^[a-f0-9]{64}$/),
        expected_current_state_hash: z.string().regex(/^[a-f0-9]{64}$/)
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false }
    },
    async input => {
      const before = getState();
      const beforeHash = sha256(before);
      if (input.expected_current_state_hash !== beforeHash) {
        throw new Error(`Adapter state changed: expected ${input.expected_current_state_hash}, found ${beforeHash}`);
      }
      const after: AdapterState = {
        active: true,
        adapterId: input.adapter_id,
        scope: input.scope,
        candidateSchemaHash: input.candidate_schema_hash,
        approvedEvidenceHash: input.evidence_receipt_hash,
        activatedAt: new Date().toISOString()
      };
      setState(after);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              activated: true,
              adapter_id: after.adapterId,
              scope: after.scope,
              previous_state_hash: beforeHash,
              current_state_hash: sha256(after),
              candidate_schema_hash: input.candidate_schema_hash,
              evidence_receipt_hash: input.evidence_receipt_hash
            })
          }
        ]
      };
    }
  );

  return server;
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? '/', `http://${request.headers.host ?? `127.0.0.1:${port}`}`);
    if (url.pathname === '/health' && request.method === 'GET') {
      sendJson(response, 200, { status: 'ok', adapterPath });
      return;
    }
    if (url.pathname === '/state' && request.method === 'GET') {
      const state = getState();
      sendJson(response, 200, { state, stateHash: sha256(state) });
      return;
    }
    if (url.pathname === '/reset' && request.method === 'POST') {
      const state = initialAdapterState();
      setState(state);
      sendJson(response, 200, { reset: true, state, stateHash: sha256(state) });
      return;
    }
    if (url.pathname === '/mcp') {
      const mcpServer = buildMcpServer();
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      response.on('close', () => {
        void transport.close();
        void mcpServer.close();
      });
      await mcpServer.connect(transport);
      await transport.handleRequest(request, response);
      return;
    }
    sendJson(response, 404, { error: 'not_found' });
  } catch (error) {
    sendError(response, error);
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`ForgeCanary adapter control listening at http://127.0.0.1:${port}`);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
