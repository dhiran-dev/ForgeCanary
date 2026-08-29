import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { TrueForge } from '@truefoundry/trueforge-sdk';
import { sha256, type AdapterState, type OracleResult } from './domain.js';
import {
  configureMcp,
  configureModel,
  makeClient,
  readInventoryJob,
  runInventoryJob,
  TRUEFORGE_BASE_URL
} from './trueforge-harness.js';

const CONTROL_BASE_URL = process.env.CONTROL_BASE_URL ?? 'http://127.0.0.1:9200';
const V2_BASE_URL = process.env.V2_FIXTURE_BASE_URL ?? 'http://127.0.0.1:9102';
const CONTROL_MCP = 'forgecanary-adapter-control';
const V2_MCP = 'forgecanary-inventory-v2';
const REPLAY_PATH = resolve('evidence/replay.json');

interface StateSnapshot<T> {
  state: T;
  stateHash: string;
}

interface ReplayEvidence {
  schema: { v2Hash: string };
  matrix: Array<{ orderId: string; baselineSessionId: string }>;
}

interface PendingApproval {
  threadId: string;
  toolCallId: string;
}

interface ApprovalAttempt {
  sessionId: string;
  requestEventTypes: string[];
  resumeEventTypes: string[];
  persistedEventTypes: string[];
}

async function requireOk(response: Response, label: string): Promise<Response> {
  if (!response.ok) throw new Error(`${label} failed (${response.status}): ${await response.text()}`);
  return response;
}

async function snapshot<T>(baseUrl: string): Promise<StateSnapshot<T>> {
  const response = await requireOk(await fetch(`${baseUrl}/state`), `${baseUrl} state`);
  return (await response.json()) as StateSnapshot<T>;
}

async function reset(baseUrl: string): Promise<void> {
  await requireOk(await fetch(`${baseUrl}/reset`, { method: 'POST' }), `${baseUrl} reset`);
}

async function eventTypes(client: TrueForge, sessionId: string): Promise<string[]> {
  const types: string[] = [];
  for await (const item of await client.sessions.listEvents(sessionId, { limit: 100 })) {
    types.push(item.event.type);
  }
  return types;
}

async function requestAdapterApproval(
  client: TrueForge,
  prompt: string
): Promise<{ sessionId: string; eventTypes: string[]; pending: PendingApproval }> {
  const { data: session } = await client.sessions.create({
    agent: {
      spec: {
        model: {
          name: 'forgecanary-local/forgecanary-deterministic',
          params: { temperature: 0, parallelToolCalls: false, maxTokens: 512 }
        },
        instructions:
          'Propose the requested compatibility adapter exactly once. Activation is a human-controlled operation and must never be bypassed.',
        mcpServers: [
          {
            name: CONTROL_MCP,
            enableTools: ['activate_compatibility_adapter'],
            preload: true,
            requireApprovalForTools: ['activate_compatibility_adapter']
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

  const types: string[] = [];
  let pending: PendingApproval | undefined;
  const stream = await client.sessions.createTurnStream(session.id, {
    input: [{ type: 'user.message', content: prompt }]
  });
  for await (const { data: event } of stream.withMetadata()) {
    types.push(event.type);
    if (event.type === 'tool.approval_required') {
      const call = event.toolCalls[0];
      if (call) pending = { threadId: event.threadId, toolCallId: call.id };
    }
  }
  if (!pending) throw new Error(`TrueForge session ${session.id} did not pause for adapter approval`);
  return { sessionId: session.id, eventTypes: types, pending };
}

async function respondToApproval(
  client: TrueForge,
  request: Awaited<ReturnType<typeof requestAdapterApproval>>,
  decision: 'allow' | 'deny'
): Promise<ApprovalAttempt> {
  const resumeEventTypes: string[] = [];
  const stream = await client.sessions.createTurnStream(request.sessionId, {
    input: [
      {
        type: 'user.tool_approval',
        threadId: request.pending.threadId,
        toolCallId: request.pending.toolCallId,
        approval:
          decision === 'allow'
            ? { status: 'allow' }
            : { status: 'deny', reason: 'Operator requires proof that denial leaves all state unchanged.' }
      }
    ]
  });
  for await (const { data: event } of stream.withMetadata()) resumeEventTypes.push(event.type);
  return {
    sessionId: request.sessionId,
    requestEventTypes: request.eventTypes,
    resumeEventTypes,
    persistedEventTypes: await eventTypes(client, request.sessionId)
  };
}

async function oracle(orderId: string): Promise<OracleResult> {
  const response = await requireOk(await fetch(`${V2_BASE_URL}/oracle/${orderId}`), `oracle ${orderId}`);
  return (await response.json()) as OracleResult;
}

async function main(): Promise<void> {
  await Promise.all([
    requireOk(await fetch(`${TRUEFORGE_BASE_URL}/healthz`), 'TrueForge health check'),
    requireOk(await fetch(`${CONTROL_BASE_URL}/health`), 'adapter control health check'),
    requireOk(await fetch(`${V2_BASE_URL}/health`), 'v2 fixture health check')
  ]);

  const replayRaw = readFileSync(REPLAY_PATH, 'utf8');
  const replay = JSON.parse(replayRaw) as ReplayEvidence;
  const replayEvidenceHash = sha256(replayRaw);
  const client = makeClient();
  await configureModel(client);
  await configureMcp(
    client,
    CONTROL_MCP,
    CONTROL_BASE_URL,
    'Approval-gated control plane for the scoped ForgeCanary compatibility adapter.'
  );
  await configureMcp(client, V2_MCP, V2_BASE_URL, 'Project-owned v2 inventory fixture for repaired replay.');

  await Promise.all([reset(CONTROL_BASE_URL), reset(V2_BASE_URL)]);
  const adapterBeforeDeny = await snapshot<AdapterState>(CONTROL_BASE_URL);
  const candidateBeforeDeny = await snapshot<unknown>(V2_BASE_URL);
  const activationPrompt = [
    'Activate the reviewed compatibility adapter.',
    'ADAPTER=explicit-fefo-v1',
    'SCOPE=reserve_inventory:perishable-default',
    `SCHEMA_HASH=${replay.schema.v2Hash}`,
    `EVIDENCE_HASH=${replayEvidenceHash}`,
    `EXPECTED_STATE_HASH=${adapterBeforeDeny.stateHash}`
  ].join(' ');

  const denyRequest = await requestAdapterApproval(client, activationPrompt);
  const denyAttempt = await respondToApproval(client, denyRequest, 'deny');
  const adapterAfterDeny = await snapshot<AdapterState>(CONTROL_BASE_URL);
  const candidateAfterDeny = await snapshot<unknown>(V2_BASE_URL);
  const denyZeroMutation =
    adapterBeforeDeny.stateHash === adapterAfterDeny.stateHash &&
    candidateBeforeDeny.stateHash === candidateAfterDeny.stateHash;
  if (!denyZeroMutation || adapterAfterDeny.state.active) {
    throw new Error('Deny did not preserve adapter and candidate external state');
  }

  const approveRequest = await requestAdapterApproval(client, activationPrompt);
  const approveAttempt = await respondToApproval(client, approveRequest, 'allow');
  const adapterAfterApprove = await snapshot<AdapterState>(CONTROL_BASE_URL);
  const candidateAfterApprove = await snapshot<unknown>(V2_BASE_URL);
  const approvalScopedMutation =
    adapterAfterApprove.stateHash !== adapterBeforeDeny.stateHash &&
    adapterAfterApprove.state.active &&
    adapterAfterApprove.state.adapterId === 'explicit-fefo-v1' &&
    adapterAfterApprove.state.scope === 'reserve_inventory:perishable-default' &&
    candidateAfterApprove.stateHash === candidateBeforeDeny.stateHash;
  if (!approvalScopedMutation) throw new Error('Allow did not produce exactly the scoped adapter mutation');

  await reset(V2_BASE_URL);
  const repairedMatrix = [];
  for (const row of replay.matrix) {
    const baseline = await readInventoryJob(client, row.baselineSessionId);
    const repaired = await runInventoryJob(client, V2_MCP, baseline.userMessage);
    const stateOracle = await oracle(row.orderId);
    repairedMatrix.push({
      orderId: row.orderId,
      baselineSessionId: baseline.sessionId,
      repairedSessionId: repaired.sessionId,
      callArgumentsEqual: sha256(baseline.toolArguments) === sha256(repaired.toolArguments),
      toolResponsesEqual: sha256(baseline.toolResponse) === sha256(repaired.toolResponse),
      oracle: stateOracle
    });
  }
  const repairedGreen = repairedMatrix.every(
    row => row.callArgumentsEqual && row.toolResponsesEqual && row.oracle.passed
  );
  if (!repairedGreen) throw new Error('Approval-gated adapter did not turn every replay green');

  const activeAdapterSnapshot = await snapshot<AdapterState>(CONTROL_BASE_URL);
  await reset(CONTROL_BASE_URL);
  const adapterAfterRollback = await snapshot<AdapterState>(CONTROL_BASE_URL);
  const reversible = adapterAfterRollback.stateHash === adapterBeforeDeny.stateHash;
  if (!reversible) throw new Error('Adapter reset did not restore the exact initial state');

  const deterministicReceipt = {
    schemaHash: replay.schema.v2Hash,
    replayEvidenceHash,
    denyZeroMutation,
    approvalScopedMutation,
    repaired: repairedMatrix.map(row => ({
      orderId: row.orderId,
      callArgumentsEqual: row.callArgumentsEqual,
      toolResponsesEqual: row.toolResponsesEqual,
      oraclePassed: row.oracle.passed,
      actualLotId: row.oracle.actualLotId
    })),
    reversible
  };
  const evidence = {
    status: 'PASS',
    scope: 'approval-gated-compatibility-repair-spike',
    generatedAt: new Date().toISOString(),
    testInfrastructure: {
      model: 'deterministic local OpenAI-compatible shim',
      limitation: 'Repeat with a real configured model before presenting live release evidence.'
    },
    sourceReplayEvidenceHash: replayEvidenceHash,
    deny: {
      ...denyAttempt,
      adapterStateHashBefore: adapterBeforeDeny.stateHash,
      adapterStateHashAfter: adapterAfterDeny.stateHash,
      candidateStateHashBefore: candidateBeforeDeny.stateHash,
      candidateStateHashAfter: candidateAfterDeny.stateHash,
      zeroMutation: denyZeroMutation
    },
    approve: {
      ...approveAttempt,
      adapterStateHashAfter: activeAdapterSnapshot.stateHash,
      candidateStateHashBefore: candidateBeforeDeny.stateHash,
      candidateStateHashAfter: candidateAfterApprove.stateHash,
      scopedMutation: approvalScopedMutation
    },
    repairedMatrix,
    rollback: {
      activeStateHash: activeAdapterSnapshot.stateHash,
      restoredStateHash: adapterAfterRollback.stateHash,
      reversible
    },
    receiptHash: sha256(deterministicReceipt)
  };
  const evidencePath = resolve('evidence/approval.json');
  writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  console.log(
    JSON.stringify(
      {
        evidencePath,
        denyZeroMutation,
        approvalScopedMutation,
        repairedGreen: repairedMatrix.filter(row => row.oracle.passed).length,
        repairedTotal: repairedMatrix.length,
        reversible,
        receiptHash: evidence.receiptHash
      },
      null,
      2
    )
  );
}

await main();
