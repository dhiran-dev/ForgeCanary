import { sha256 } from './domain.js';

interface JsonRpcResponse {
  result?: { tools?: Array<{ name?: string; inputSchema?: unknown }> };
  error?: unknown;
}

async function mcpPost(baseUrl: string, body: Record<string, unknown>): Promise<JsonRpcResponse> {
  const response = await fetch(`${baseUrl}/mcp`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      'mcp-protocol-version': '2025-11-25'
    },
    body: JSON.stringify(body)
  });
  if (!response.ok) throw new Error(`MCP request failed (${response.status}): ${await response.text()}`);
  const payload = await response.text();
  const dataLine = payload
    .split(/\r?\n/)
    .find(line => line.startsWith('data: '));
  if (!dataLine) throw new Error(`MCP response did not contain an SSE data event: ${payload}`);
  return JSON.parse(dataLine.slice('data: '.length)) as JsonRpcResponse;
}

export async function reserveInventorySchema(baseUrl: string): Promise<{ schema: unknown; hash: string }> {
  const response = await mcpPost(baseUrl, {
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/list',
    params: {}
  });
  const tool = response.result?.tools?.find(candidate => candidate.name === 'reserve_inventory');
  if (!tool?.inputSchema) throw new Error(`reserve_inventory schema missing from ${baseUrl}`);
  return { schema: tool.inputSchema, hash: sha256(tool.inputSchema) };
}

