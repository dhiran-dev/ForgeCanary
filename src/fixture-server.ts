import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import * as z from 'zod/v4';
import { readArg, readIntegerArg } from './args.js';
import {
  evaluateReservation,
  initialAdapterState,
  initialFixtureState,
  readJsonFile,
  reserveInventory,
  sha256,
  writeJsonFile,
  type AdapterState,
  type FixtureState,
  type FixtureVersion
} from './domain.js';
import { sendError, sendJson } from './http.js';

const version = readArg('version', 'v1') as FixtureVersion;
if (version !== 'v1' && version !== 'v2') throw new Error('--version must be v1 or v2');

const port = readIntegerArg('port', version === 'v1' ? 9101 : 9102);
const statePath = resolve(readArg('state', `.data/${version}-state.json`));
const adapterPath = resolve(readArg('adapter', '.data/adapter.json'));

function getState(): FixtureState {
  return readJsonFile(statePath, initialFixtureState);
}

function getAdapter(): AdapterState {
  return readJsonFile(adapterPath, initialAdapterState);
}

function buildMcpServer(): McpServer {
  const server = new McpServer({ name: `forgecanary-inventory-${version}`, version: '1.0.0' });

  server.registerTool(
    'reserve_inventory',
    {
      title: 'Reserve inventory',
      description:
        'Reserve inventory for an existing order. The optional allocation_policy makes allocation behavior explicit.',
      inputSchema: {
        order_id: z.string().describe('Existing order identifier.'),
        sku: z.string().describe('Inventory SKU from the order.'),
        quantity: z.number().int().positive().describe('Units to reserve.'),
        allocation_policy: z
          .enum(['fefo', 'lowest_cost'])
          .optional()
          .describe('Optional explicit allocation policy. If omitted, the server default is used.')
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      }
    },
    async input => {
      const current = getState();
      const { result, state } = reserveInventory(version, current, getAdapter(), input);
      writeJsonFile(statePath, state);
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    }
  );

  return server;
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? '/', `http://${request.headers.host ?? `127.0.0.1:${port}`}`);

    if (url.pathname === '/health' && request.method === 'GET') {
      sendJson(response, 200, { status: 'ok', version, statePath });
      return;
    }
    if (url.pathname === '/state' && request.method === 'GET') {
      const state = getState();
      sendJson(response, 200, { version, state, stateHash: sha256(state) });
      return;
    }
    if (url.pathname.startsWith('/oracle/') && request.method === 'GET') {
      const orderId = decodeURIComponent(url.pathname.slice('/oracle/'.length));
      sendJson(response, 200, evaluateReservation(getState(), orderId));
      return;
    }
    if (url.pathname === '/reset' && request.method === 'POST') {
      const state = initialFixtureState();
      writeJsonFile(statePath, state);
      sendJson(response, 200, { reset: true, version, stateHash: sha256(state) });
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
  console.log(`ForgeCanary ${version} fixture listening at http://127.0.0.1:${port}`);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => server.close(() => process.exit(0)));
}

