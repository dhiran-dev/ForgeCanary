import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { TrueForge } from '@truefoundry/trueforge-sdk';
import type { OracleResult } from './domain.js';

const TRUEFORGE_BASE_URL = process.env.TRUEFORGE_BASE_URL ?? 'http://127.0.0.1:8790';
const FIXTURE_BASE_URL = process.env.FIXTURE_BASE_URL ?? 'http://127.0.0.1:9101';
const MODEL_BASE_URL = process.env.MODEL_BASE_URL ?? 'http://127.0.0.1:9100/v1';
const PROVIDER_NAME = 'forgecanary-local';
const MODEL_NAME = 'forgecanary-deterministic';
const MCP_NAME = 'forgecanary-inventory-v1';

async function requireOk(response: Response, label: string): Promise<Response> {
  if (!response.ok) throw new Error(`${label} failed (${response.status}): ${await response.text()}`);
  return response;
}

async function main(): Promise<void> {
  await requireOk(await fetch(`${TRUEFORGE_BASE_URL}/healthz`), 'TrueForge health check');
  await requireOk(await fetch(`${FIXTURE_BASE_URL}/health`), 'fixture health check');
  await requireOk(await fetch(MODEL_BASE_URL.replace(/\/v1$/, '/health')), 'model health check');
  await requireOk(await fetch(`${FIXTURE_BASE_URL}/reset`, { method: 'POST' }), 'fixture reset');

  const client = new TrueForge({ baseUrl: TRUEFORGE_BASE_URL, timeoutInSeconds: 120 });
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
  await client.settings.mcpServers.createOrUpdate({
    manifest: {
      type: 'remote',
      name: MCP_NAME,
      description: 'Project-owned v1 inventory fixture for ForgeCanary replay tests.',
      url: `${FIXTURE_BASE_URL}/mcp`
    }
  });

  const { data: session } = await client.sessions.create({
    agent: {
      spec: {
        model: {
          name: `${PROVIDER_NAME}/${MODEL_NAME}`,
          params: { temperature: 0, parallelToolCalls: false, maxTokens: 512 }
        },
        instructions:
          'Execute the requested inventory reservation exactly once using reserve_inventory. Do not add an allocation policy unless the user explicitly supplies one.',
        mcpServers: [
          {
            name: MCP_NAME,
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
    input: [
      {
        type: 'user.message',
        content: 'Reserve inventory for ORDER=FC-1001 SKU=COLD-A QTY=4. Preserve the historical workflow.'
      }
    ]
  });
  for await (const { data: event } of stream.withMetadata()) streamedEventTypes.push(event.type);

  const persistedEventTypes: string[] = [];
  let persistedToolCallCount = 0;
  for await (const item of await client.sessions.listEvents(session.id, { limit: 100 })) {
    persistedEventTypes.push(item.event.type);
    if (item.event.type === 'model.message') persistedToolCallCount += item.event.toolCalls?.length ?? 0;
  }

  const oracleResponse = await requireOk(
    await fetch(`${FIXTURE_BASE_URL}/oracle/FC-1001`),
    'independent state oracle'
  );
  const oracle = (await oracleResponse.json()) as OracleResult;

  const requiredPersistedEvents = ['turn.created', 'mcp.initialize', 'model.message', 'tool.response', 'turn.done'];
  const missing = requiredPersistedEvents.filter(type => !persistedEventTypes.includes(type));
  if (missing.length > 0) throw new Error(`Missing persisted TrueForge events: ${missing.join(', ')}`);
  if (persistedToolCallCount !== 1) throw new Error(`Expected one persisted MCP tool call, saw ${persistedToolCallCount}`);
  if (!oracle.passed) throw new Error(`v1 external-state oracle failed: ${oracle.reason}`);

  const evidence = {
    status: 'PASS',
    scope: 'vertical-smoke-only',
    testInfrastructure: {
      model: 'deterministic local OpenAI-compatible shim',
      limitation: 'A real configured model is still required for live release evidence.'
    },
    trueforge: {
      baseUrl: TRUEFORGE_BASE_URL,
      sessionId: session.id,
      streamedEventTypes,
      persistedEventTypes,
      persistedToolCallCount
    },
    fixture: { version: 'v1', oracle }
  };
  const evidencePath = resolve('evidence/smoke.json');
  writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ evidencePath, ...evidence }, null, 2));
}

await main();
