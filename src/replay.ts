import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  ORDERS,
  sha256,
  type OracleResult
} from './domain.js';
import { reserveInventorySchema } from './mcp-introspection.js';
import {
  configureMcp,
  configureModel,
  makeClient,
  promptForOrder,
  runInventoryJob,
  TRUEFORGE_BASE_URL,
  type JobTranscript
} from './trueforge-harness.js';

const V1_BASE_URL = process.env.V1_FIXTURE_BASE_URL ?? 'http://127.0.0.1:9101';
const V2_BASE_URL = process.env.V2_FIXTURE_BASE_URL ?? 'http://127.0.0.1:9102';
const V1_MCP = 'forgecanary-inventory-v1';
const V2_MCP = 'forgecanary-inventory-v2';

async function requireOk(response: Response, label: string): Promise<Response> {
  if (!response.ok) throw new Error(`${label} failed (${response.status}): ${await response.text()}`);
  return response;
}

async function reset(baseUrl: string): Promise<void> {
  await requireOk(await fetch(`${baseUrl}/reset`, { method: 'POST' }), `${baseUrl} reset`);
}

async function oracle(baseUrl: string, orderId: string): Promise<OracleResult> {
  const response = await requireOk(await fetch(`${baseUrl}/oracle/${orderId}`), `${baseUrl} oracle`);
  return (await response.json()) as OracleResult;
}

function transcriptProtocolHash(transcript: JobTranscript): string {
  return sha256({
    toolName: transcript.toolName,
    toolArguments: transcript.toolArguments,
    toolResponse: transcript.toolResponse
  });
}

async function main(): Promise<void> {
  await requireOk(await fetch(`${TRUEFORGE_BASE_URL}/healthz`), 'TrueForge health check');
  await Promise.all([
    requireOk(await fetch(`${V1_BASE_URL}/health`), 'v1 fixture health check'),
    requireOk(await fetch(`${V2_BASE_URL}/health`), 'v2 fixture health check')
  ]);

  const client = makeClient();
  await configureModel(client);
  await configureMcp(client, V1_MCP, V1_BASE_URL, 'Project-owned v1 inventory fixture for historical jobs.');
  await configureMcp(client, V2_MCP, V2_BASE_URL, 'Project-owned v2 inventory fixture for semantic replay.');
  await Promise.all([reset(V1_BASE_URL), reset(V2_BASE_URL)]);

  const [v1Schema, v2Schema] = await Promise.all([
    reserveInventorySchema(V1_BASE_URL),
    reserveInventorySchema(V2_BASE_URL)
  ]);
  if (v1Schema.hash !== v2Schema.hash) throw new Error('The v1/v2 MCP schemas are not identical');

  const historical: JobTranscript[] = [];
  for (const order of ORDERS) historical.push(await runInventoryJob(client, V1_MCP, promptForOrder(order)));

  // This is a deterministic full-census selection: every successful historical
  // job is replayed, sorted by the persisted order id in its tool arguments.
  const selected = historical.toSorted((left, right) =>
    String(left.toolArguments.order_id).localeCompare(String(right.toolArguments.order_id))
  );
  const candidate: JobTranscript[] = [];
  for (const source of selected) candidate.push(await runInventoryJob(client, V2_MCP, source.userMessage));

  const matrix = [];
  for (let index = 0; index < selected.length; index += 1) {
    const baseline = selected[index];
    const changed = candidate[index];
    if (!baseline || !changed) throw new Error('Replay matrix pairing failed');
    const orderId = String(baseline.toolArguments.order_id);
    const [baselineOracle, candidateOracle] = await Promise.all([
      oracle(V1_BASE_URL, orderId),
      oracle(V2_BASE_URL, orderId)
    ]);
    matrix.push({
      orderId,
      baselineSessionId: baseline.sessionId,
      candidateSessionId: changed.sessionId,
      callArgumentsEqual: sha256(baseline.toolArguments) === sha256(changed.toolArguments),
      toolResponsesEqual: sha256(baseline.toolResponse) === sha256(changed.toolResponse),
      protocolTranscriptEqual: transcriptProtocolHash(baseline) === transcriptProtocolHash(changed),
      baselineOracle,
      candidateOracle
    });
  }

  const red = matrix.filter(row => !row.candidateOracle.passed);
  const allProtocolGreen = matrix.every(
    row => row.callArgumentsEqual && row.toolResponsesEqual && row.protocolTranscriptEqual
  );
  const allHistoricalGreen = matrix.every(row => row.baselineOracle.passed);
  const expectedBlastRadius = red.length === 1 && red[0]?.orderId === 'FC-1001';
  if (!allProtocolGreen || !allHistoricalGreen || !expectedBlastRadius) {
    throw new Error('Replay did not produce the expected protocol-green, semantic-red matrix');
  }

  const evidence = {
    status: 'PASS',
    scope: 'historical-session-semantic-replay-spike',
    generatedAt: new Date().toISOString(),
    testInfrastructure: {
      model: 'deterministic local OpenAI-compatible shim',
      limitation: 'Repeat with a real configured model before presenting live release evidence.'
    },
    selection: {
      strategy: 'deterministic full census of six successful v1 TrueForge sessions',
      sourceSessionIds: selected.map(item => item.sessionId),
      replayedUserMessagesWereReadFromPersistedEvents: true
    },
    schema: {
      v1Hash: v1Schema.hash,
      v2Hash: v2Schema.hash,
      identical: v1Schema.hash === v2Schema.hash
    },
    summary: {
      historicalJobs: selected.length,
      candidateJobs: candidate.length,
      protocolGreen: matrix.filter(row => row.protocolTranscriptEqual).length,
      semanticGreen: matrix.filter(row => row.candidateOracle.passed).length,
      semanticRed: red.length,
      affectedOrders: red.map(row => row.orderId)
    },
    matrix
  };
  mkdirSync(resolve('evidence'), { recursive: true });
  const evidencePath = resolve('evidence/replay.json');
  writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ evidencePath, ...evidence.summary, schemaHash: v1Schema.hash }, null, 2));
}

await main();
