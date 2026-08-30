import type { TrueForge } from '@truefoundry/trueforge-sdk';
import { CaseStore } from './case-store.js';
import type {
  CaseApproval,
  CaseJobRow,
  CaseReceipt,
  ForgeCanaryCase,
  JobRunEvidence
} from './case-types.js';
import {
  FORGECANARY_MCP_NAMES,
  readForgeCanaryConfig,
  resolveConfiguredModel,
  type ForgeCanaryConfig
} from './config.js';
import {
  ORDERS,
  sha256,
  type AdapterState,
  type OracleResult
} from './domain.js';
import { reserveInventorySchema } from './mcp-introspection.js';
import {
  configureMcp,
  configureModel,
  makeClient,
  promptForOrder,
  approvalAgentSpec,
  toolFreeAgentSpec,
  runInventoryJob,
  type JobTranscript
} from './trueforge-harness.js';
import { ensureSavedReplayAgent, REPLAY_AGENT_DISPLAY_NAME, type SavedReplayAgent } from './saved-agent.js';
import {
  normalizeTrueForgeEvent,
  readApprovalRequest,
  readSandboxCreated,
  readThreadCreated,
  readThreadDone,
  readToolCalls
} from './trueforge-trace.js';

interface StateSnapshot<T> {
  state: T;
  stateHash: string;
}

interface PendingToolApproval {
  threadId: string;
  toolCallId: string;
  toolName: string;
  arguments: Record<string, unknown>;
}

interface ApprovalReference {
  threadId: string;
  toolCallIds: string[];
}

function resolvePendingApproval(
  calls: Map<string, { name: string; arguments: Record<string, unknown> }>,
  approvals: ApprovalReference[]
): PendingToolApproval | null {
  for (const approval of approvals) {
    for (const toolCallId of approval.toolCallIds) {
      const call = calls.get(toolCallId);
      if (call) {
        return {
          threadId: approval.threadId,
          toolCallId,
          toolName: call.name,
          arguments: call.arguments
        };
      }
    }
  }
  return null;
}

const PRODUCT_LABELS: Record<string, string> = {
  'COLD-A': 'Temperature-sensitive medicine',
  'DRY-B': 'Shelf-stable nutrition pack',
  'DRY-C': 'Dry medical supply',
  'DRY-D': 'Shelf-stable consumable',
  'DRY-E': 'Packaged clinic supply',
  'DRY-F': 'Bulk dry inventory'
};

const TEST_WORKER_DWELL_MS = 260;

const ACTIVE_STAGES = new Set([
  'preflight',
  'replaying_baseline',
  'replaying_candidate',
  'analyzing',
  'regression_detected',
  'proposing_repair',
  'awaiting_approval',
  'applying_repair',
  'verifying_repair'
]);

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

async function oracle(baseUrl: string, orderId: string): Promise<OracleResult> {
  const response = await requireOk(await fetch(`${baseUrl}/oracle/${encodeURIComponent(orderId)}`), `${baseUrl} oracle`);
  return (await response.json()) as OracleResult;
}

async function serviceHealth(url: string): Promise<{ ok: boolean; detail: string }> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(3_000) });
    return { ok: response.ok, detail: response.ok ? 'ready' : `HTTP ${response.status}` };
  } catch (error) {
    return { ok: false, detail: error instanceof Error ? error.message : String(error) };
  }
}

function isTerminal(caseState: ForgeCanaryCase | null): boolean {
  return !caseState || !ACTIVE_STAGES.has(caseState.stage);
}

export class ForgeCanaryService {
  readonly config: ForgeCanaryConfig;
  readonly store: CaseStore;
  private readonly client: TrueForge;
  private initializePromise: Promise<string> | null = null;
  private savedAgent: SavedReplayAgent | null = null;
  private activeTask: Promise<void> | null = null;
  private decisionTask: Promise<ForgeCanaryCase> | null = null;

  constructor(config = readForgeCanaryConfig()) {
    this.config = config;
    this.store = new CaseStore(config.caseStatePath);
    this.client = makeClient();
  }

  async initialize(): Promise<string> {
    this.initializePromise ??= this.initializeRuntime();
    try {
      return await this.initializePromise;
    } catch (error) {
      this.initializePromise = null;
      throw error;
    }
  }

  async publicConfig(): Promise<Record<string, unknown>> {
    const model = await this.initialize();
    return {
      mode: this.config.mode,
      model,
      savedAgentId: this.savedAgent?.id,
      savedAgentName: REPLAY_AGENT_DISPLAY_NAME,
      trueforgeBaseUrl: this.config.trueforgeBaseUrl,
      trueforgeUiUrl: this.config.trueforgeBaseUrl,
      connectors: [FORGECANARY_MCP_NAMES.v1, FORGECANARY_MCP_NAMES.v2, FORGECANARY_MCP_NAMES.control],
      note:
        this.config.mode === 'live'
          ? 'Model credentials stay in TrueForge Settings and are never returned by ForgeCanary.'
          : 'Deterministic test mode uses the local model shim.'
    };
  }

  async health(): Promise<Record<string, unknown>> {
    const targets = [
      ['trueforge', `${this.config.trueforgeBaseUrl}/healthz`],
      ['inventoryV1', `${this.config.v1BaseUrl}/health`],
      ['inventoryV2', `${this.config.v2BaseUrl}/health`],
      ['adapterControl', `${this.config.controlBaseUrl}/health`],
      ...(this.config.mode === 'test' ? [['deterministicModel', 'http://127.0.0.1:9100/health']] : [])
    ] as const;
    const checks = await Promise.all(targets.map(([, url]) => serviceHealth(url)));
    const services = Object.fromEntries(targets.map(([name], index) => [name, checks[index]]));
    return { ok: checks.every(check => check?.ok), mode: this.config.mode, services };
  }

  async startCase(): Promise<ForgeCanaryCase> {
    if (this.activeTask) throw new Error('A ForgeCanary run is already active');
    const model = await this.initialize();
    if (!this.savedAgent) throw new Error('ForgeCanary saved agent was not initialized');
    const created = this.store.create({
      mode: this.config.mode,
      model,
      savedAgentId: this.savedAgent.id,
      baselineVersion: this.config.baselineVersion,
      candidateVersion: this.config.candidateVersion
    });
    this.store.append(created.id, {
      source: 'forgecanary',
      type: 'case.created',
      title: created.historyTitle,
      detail: 'ForgeCanary will replay the same work against the current and proposed MCP versions.'
    });
    this.activeTask = this.runCase(created.id)
      .catch(error => {
        this.store.fail(created.id, error);
      })
      .finally(() => {
        this.activeTask = null;
      });
    return this.store.require(created.id);
  }

  async resetDemo(): Promise<Record<string, unknown>> {
    const current = this.store.get();
    if (!isTerminal(current)) throw new Error(`Cannot reset while case ${current?.id} is ${current?.stage}`);
    await Promise.all([
      reset(this.config.v1BaseUrl),
      reset(this.config.v2BaseUrl),
      reset(this.config.controlBaseUrl)
    ]);
    return { reset: true, resetAt: new Date().toISOString() };
  }

  async retryApproval(caseId: string): Promise<ForgeCanaryCase> {
    await this.initialize();
    const current = this.store.require(caseId);
    if (current.stage !== 'denied_verified' || current.approval.status !== 'denied' || !current.approval.sessionId) {
      throw new Error('A fresh approval can only be requested after a verified denial');
    }
    this.store.update(caseId, value => {
      if (value.receipt) (value.receiptHistory ??= []).push(value.receipt);
      value.approval = { status: 'not_requested' };
      delete value.receipt;
    });
    this.store.transition(caseId, 'proposing_repair', 'Requesting the same scoped repair again.');
    this.store.append(caseId, {
      source: 'forgecanary',
      type: 'approval.retry_requested',
      title: 'Approval requested again',
      detail: 'The denied call remains denied. The existing parent release run is continuing with a new proposal.'
    });
    try {
      await this.requestApproval(caseId);
      return this.store.require(caseId);
    } catch (error) {
      this.store.fail(caseId, error);
      throw error;
    }
  }

  async decideApproval(caseId: string, decision: 'allow' | 'deny'): Promise<ForgeCanaryCase> {
    if (this.decisionTask) throw new Error('An approval decision is already being processed');
    const task = this.performApprovalDecision(caseId, decision);
    this.decisionTask = task;
    try {
      return await task;
    } finally {
      if (this.decisionTask === task) this.decisionTask = null;
    }
  }

  private async performApprovalDecision(
    caseId: string,
    decision: 'allow' | 'deny'
  ): Promise<ForgeCanaryCase> {
    const current = this.store.require(caseId);
    const pending = current.approval;
    if (
      current.stage !== 'awaiting_approval' ||
      pending.status !== 'pending' ||
      !pending.sessionId ||
      !pending.threadId ||
      !pending.toolCallId
    ) {
      throw new Error('This case has no pending TrueForge approval');
    }

    if (decision === 'allow') {
      this.store.transition(caseId, 'applying_repair', 'TrueForge is applying the approved, scoped compatibility repair.');
    }

    try {
      const stream = await this.client.sessions.createTurnStream(pending.sessionId, {
        input: [
          {
            type: 'user.tool_approval',
            threadId: pending.threadId,
            toolCallId: pending.toolCallId,
            approval:
              decision === 'allow'
                ? { status: 'allow' }
                : {
                    status: 'deny',
                    reason: 'Operator denied the production-facing adapter activation to verify zero mutation.'
                  }
          }
        ]
      });
      for await (const { data: event } of stream.withMetadata()) {
        this.recordTrueForgeEvent(caseId, pending.sessionId, event);
      }

      if (decision === 'deny') {
        await this.verifyDenial(caseId);
        return this.store.require(caseId);
      }

      await this.verifyApprovalAndRepair(caseId);
      return this.store.require(caseId);
    } catch (error) {
      let workflowError: unknown = error;
      const latest = this.store.require(caseId);
      if (decision === 'allow' && latest.stage === 'applying_repair') {
        try {
          const adapterAfter = await snapshot<AdapterState>(this.config.controlBaseUrl);
          const candidateAfter = await snapshot<unknown>(this.config.v2BaseUrl);
          if (this.isReviewedMutation(latest, adapterAfter, candidateAfter)) {
            this.store.append(caseId, {
              source: 'forgecanary',
              type: 'approval.stream_reconciled',
              title: 'Approved write reconciled from external state',
              detail: 'The TrueForge stream ended unexpectedly after the exact reviewed mutation completed.'
            });
            await this.verifyApprovalAndRepair(caseId);
            return this.store.require(caseId);
          }
        } catch (reconciliationError) {
          workflowError = new AggregateError(
            [error, reconciliationError],
            'Approval failed and external-state reconciliation also failed'
          );
        }
      }
      if (this.store.require(caseId).stage !== 'failed') this.store.fail(caseId, workflowError);
      throw workflowError;
    }
  }

  private async initializeRuntime(): Promise<string> {
    if (this.config.mode === 'test') await configureModel(this.client);
    await Promise.all([
      configureMcp(
        this.client,
        FORGECANARY_MCP_NAMES.v1,
        this.config.v1BaseUrl,
        'Current inventory MCP used as the historical behavior baseline.'
      ),
      configureMcp(
        this.client,
        FORGECANARY_MCP_NAMES.v2,
        this.config.v2BaseUrl,
        'Proposed inventory MCP tested for silent business-state regression.'
      ),
      configureMcp(
        this.client,
        FORGECANARY_MCP_NAMES.control,
        this.config.controlBaseUrl,
        'Approval-gated control plane for the reversible FEFO compatibility adapter.'
      )
    ]);
    const model = await resolveConfiguredModel(this.client, this.config);
    this.savedAgent = await ensureSavedReplayAgent(this.client, this.config, model);
    return model;
  }

  private async runCase(caseId: string): Promise<void> {
    this.store.transition(caseId, 'preflight', 'Checking TrueForge, MCP connectors, and clean demo state.');
    this.store.append(caseId, {
      source: 'forgecanary',
      type: 'case.preflight',
      title: 'Preflight started',
      detail: 'No repair can execute before a fresh replay and human approval.'
    });

    const health = await this.health();
    if (!health.ok) throw new Error(`Preflight failed: ${JSON.stringify(health.services)}`);
    await Promise.all([
      reset(this.config.v1BaseUrl),
      reset(this.config.v2BaseUrl),
      reset(this.config.controlBaseUrl)
    ]);
    const [v1Schema, v2Schema] = await Promise.all([
      reserveInventorySchema(this.config.v1BaseUrl),
      reserveInventorySchema(this.config.v2BaseUrl)
    ]);
    await this.createParentRun(caseId);
    this.store.update(caseId, value => {
      value.schema = { v1Hash: v1Schema.hash, v2Hash: v2Schema.hash, equal: v1Schema.hash === v2Schema.hash };
      value.jobs = [];
    });

    this.store.transition(caseId, 'replaying_baseline', 'Replaying six successful jobs against the current MCP.');
    for (const order of ORDERS) {
      const evidence = await this.executeInventoryJob(
        caseId,
        FORGECANARY_MCP_NAMES.v1,
        this.config.v1BaseUrl,
        order.id,
        'baseline'
      );
      this.store.update(caseId, value => {
        const row = value.jobs.find(item => item.orderId === order.id);
        if (row) row.baseline = evidence;
      });
    }

    this.store.transition(caseId, 'replaying_candidate', 'Replaying the same jobs against the proposed MCP.');
    for (const order of ORDERS) {
      const evidence = await this.executeInventoryJob(
        caseId,
        FORGECANARY_MCP_NAMES.v2,
        this.config.v2BaseUrl,
        order.id,
        'candidate'
      );
      this.store.update(caseId, value => {
        const row = value.jobs.find(item => item.orderId === order.id);
        if (!row) return;
        row.candidate = evidence;
        row.protocolEqual =
          row.baseline !== undefined &&
          sha256(row.baseline.toolArguments) === sha256(evidence.toolArguments) &&
          sha256(row.baseline.toolResponse) === sha256(evidence.toolResponse);
      });
    }

    this.store.transition(caseId, 'analyzing', 'TrueForge agents are checking protocol compatibility and business outcomes.');
    await this.runAnalysis(caseId);
    const afterAnalysis = this.store.require(caseId);
    const failedRows = afterAnalysis.jobs.filter(row => row.candidate && !row.candidate.oracle.passed);
    if (failedRows.length === 0) {
      throw new Error('The candidate produced no semantic divergence; the fixed demo fixture did not behave as expected.');
    }
    const hero = failedRows[0] as CaseJobRow;
    this.store.transition(
      caseId,
      'regression_detected',
      'Protocol checks passed, but the proposed MCP selected the wrong perishable batch.'
    );
    this.store.update(caseId, value => {
      value.finalVerdict = 'blocked';
    });
    this.store.append(caseId, {
      source: 'forgecanary',
      type: 'semantic.regression_detected',
      title: 'Silent business regression detected',
      detail: `${hero.productLabel}: the proposed tool chose the cheaper later-expiring batch instead of the batch expiring first.`
    });
    this.store.transition(caseId, 'proposing_repair', 'Preparing a reversible compatibility repair for human review.');
    await this.requestApproval(caseId);
  }

  private async executeInventoryJob(
    caseId: string,
    mcpName: string,
    oracleBaseUrl: string,
    orderId: string,
    phase: 'baseline' | 'candidate' | 'repaired'
  ): Promise<JobRunEvidence> {
    const current = this.store.require(caseId);
    if (!this.savedAgent) throw new Error('Saved replay agent is unavailable');
    const order = ORDERS.find(item => item.id === orderId);
    if (!order) throw new Error(`Unknown order ${orderId}`);
    if (!current.parentSessionId) throw new Error('Replay cannot start without a parent release run');
    let spawned = false;
    this.store.update(caseId, value => {
      let row = value.jobs.find(item => item.orderId === orderId);
      if (!row) {
        row = {
          replayJobId: `${caseId}:${order.id}`,
          orderId: order.id,
          sku: order.sku,
          quantity: order.quantity,
          perishable: order.perishable,
          productLabel: PRODUCT_LABELS[order.sku] ?? order.sku,
          workerStatus: 'spawning',
          currentTask: 'Worker allocated · connecting to replay'
        };
        value.jobs.push(row);
        spawned = true;
      }
      if (row) {
        row.workerStatus = 'running';
        row.currentTask = phase === 'baseline'
          ? 'Replaying current MCP'
          : phase === 'candidate'
            ? 'Comparing proposed MCP'
            : 'Verifying approved repair';
      }
    });
    if (spawned) {
      this.store.append(caseId, {
        source: 'forgecanary',
        type: 'job.worker_spawned',
        title: `Replay worker spawned · ${orderId}`,
        detail: `${PRODUCT_LABELS[order.sku] ?? order.sku}, isolated inside the parent release run`
      });
    }
    this.store.append(caseId, {
      source: 'forgecanary',
      type: `job.${phase}.started`,
      title: `${phase === 'baseline' ? 'Current' : phase === 'candidate' ? 'Proposed' : 'Repaired'} MCP · ${orderId}`,
      detail: `${PRODUCT_LABELS[order.sku] ?? order.sku}, ${order.quantity} units`
    });
    if (this.config.mode === 'test') {
      await new Promise(resolve => setTimeout(resolve, TEST_WORKER_DWELL_MS));
    }
    const transcript = await runInventoryJob(
      this.client,
      mcpName,
      `Use only the ${mcpName} connector for this isolated replay. TARGET_MCP=${mcpName}\n${promptForOrder(order)}`,
      {
      modelName: current.model,
      reasoningEffort: this.config.modelReasoningEffort,
      parentSessionId: current.parentSessionId,
      agentSpec: this.savedAgent.manifest,
      onEvent: (event, sessionId) => this.recordTrueForgeEvent(caseId, sessionId, event)
      }
    );
    this.registerSession(caseId, transcript.sessionId);
    const result = await oracle(oracleBaseUrl, orderId);
    this.store.append(caseId, {
      source: 'forgecanary',
      type: `job.${phase}.verified`,
      title: `${orderId} external state ${result.passed ? 'verified' : 'failed'}`,
      detail: result.reason
    });
    this.store.update(caseId, value => {
      const row = value.jobs.find(item => item.orderId === orderId);
      if (!row) return;
      if (phase === 'baseline') {
        row.workerStatus = 'verified';
        row.currentTask = 'Current behavior captured';
      } else if (!result.passed && phase === 'candidate') {
        row.workerStatus = 'held';
        row.currentTask = 'Business outcome held for review';
        row.finalVerdict = 'regression';
      } else {
        row.workerStatus = phase === 'repaired' ? 'closed' : 'verified';
        row.currentTask = phase === 'repaired' ? 'Repair verified · receipt ready' : 'Comparison verified';
        row.finalVerdict = phase === 'repaired' ? 'repaired' : 'pass';
      }
    });
    return {
      sessionId: transcript.sessionId,
      ...(transcript.turnId ? { turnId: transcript.turnId } : {}),
      toolName: transcript.toolName,
      toolArguments: transcript.toolArguments,
      toolResponse: transcript.toolResponse,
      oracle: result
    };
  }

  private async runAnalysis(caseId: string): Promise<void> {
    const current = this.store.require(caseId);
    if (!current.parentSessionId) throw new Error('Analysis cannot start without a parent release run');
    if (!this.savedAgent) throw new Error('Saved replay agent is unavailable');
    const sessionId = current.parentSessionId;
    this.store.update(caseId, value => {
      value.analysisSessionId = sessionId;
    });
    const evidence = {
      schemaEqual: current.schema?.equal,
      jobs: current.jobs.map(row => ({
        orderId: row.orderId,
        perishable: row.perishable,
        protocolEqual: row.protocolEqual,
        expectedLot: row.candidate?.oracle.expectedLotId,
        actualLot: row.candidate?.oracle.actualLotId,
        outcomePassed: row.candidate?.oracle.passed
      }))
    };
    const prompt = [
      'Analyze this MCP upgrade evidence.',
      '1. Spawn a dynamic subagent named contract-analyst to inspect schema/protocol equivalence.',
      '2. Spawn a dynamic subagent named outcome-auditor to inspect the external-state invariant.',
      '3. Use the TrueForge sandbox to run a small Python program that counts protocol-green and outcome-failed jobs from the JSON.',
      '4. Return a concise release recommendation. Do not call any external tools or propose unreviewed mutations.',
      `EVIDENCE_JSON=${JSON.stringify(evidence)}`
    ].join('\n');
    try {
      await this.client.sessions.update(sessionId, {
        agent: { spec: toolFreeAgentSpec(this.savedAgent.manifest, true) }
      });
      const stream = await this.client.sessions.createTurnStream(sessionId, {
        input: [{ type: 'user.message', content: prompt }],
        previousTurnId: 'none'
      });
      for await (const { data: event } of stream.withMetadata()) {
        this.recordTrueForgeEvent(caseId, sessionId, event);
      }
    } catch (error) {
      this.store.append(caseId, {
        source: 'forgecanary',
        type: 'analysis.capability_limited',
        title: 'Agent analysis reported a limitation',
        detail: error instanceof Error ? error.message : String(error)
      });
    }
  }

  private async requestApproval(caseId: string): Promise<void> {
    const current = this.store.require(caseId);
    const adapterBefore = await snapshot<AdapterState>(this.config.controlBaseUrl);
    const candidateBefore = await snapshot<unknown>(this.config.v2BaseUrl);
    const evidenceHash = sha256({
      schema: current.schema,
      jobs: current.jobs.map(row => ({
        orderId: row.orderId,
        protocolEqual: row.protocolEqual,
        oracle: row.candidate?.oracle
      }))
    });
    const schemaHash = current.schema?.v2Hash;
    if (!schemaHash) throw new Error('Cannot request approval without the reviewed candidate schema hash');
    const expectedArguments = {
      adapter_id: 'explicit-fefo-v1',
      scope: 'reserve_inventory:perishable-default',
      candidate_schema_hash: schemaHash,
      evidence_receipt_hash: evidenceHash,
      expected_current_state_hash: adapterBefore.stateHash
    };
    const expectedArgumentsHash = sha256(expectedArguments);
    if (!current.parentSessionId) throw new Error('Approval cannot start without a parent release run');
    if (!this.savedAgent) throw new Error('Saved replay agent is unavailable');
    const sessionId = current.parentSessionId;
    const prompt = [
      'Request activation of the reviewed compatibility adapter.',
      'Use exactly these arguments without changing, omitting, or adding any field:',
      `ADAPTER=${expectedArguments.adapter_id}`,
      `SCOPE=${expectedArguments.scope}`,
      `SCHEMA_HASH=${expectedArguments.candidate_schema_hash}`,
      `EVIDENCE_HASH=${expectedArguments.evidence_receipt_hash}`,
      `EXPECTED_STATE_HASH=${expectedArguments.expected_current_state_hash}`,
      JSON.stringify(expectedArguments)
    ].join(' ');
    const calls = new Map<string, { name: string; arguments: Record<string, unknown> }>();
    const approvals: ApprovalReference[] = [];
    await this.client.sessions.update(sessionId, {
      agent: { spec: approvalAgentSpec(this.savedAgent.manifest) }
    });
    const stream = await this.client.sessions.createTurnStream(sessionId, {
      input: [{ type: 'user.message', content: prompt }],
      previousTurnId: 'none'
    });
    for await (const { data: event } of stream.withMetadata()) {
      this.recordTrueForgeEvent(caseId, sessionId, event);
      for (const call of readToolCalls(event)) calls.set(call.id, { name: call.name, arguments: call.arguments });
      const approval = readApprovalRequest(event);
      if (approval) approvals.push(approval);
    }
    let pending = resolvePendingApproval(calls, approvals);
    if (!pending) {
      const persistedEvents: unknown[] = [];
      for await (const item of await this.client.sessions.listEvents(sessionId, { limit: 100 })) {
        persistedEvents.push(item.event);
        this.recordTrueForgeEvent(caseId, sessionId, item.event);
      }
      for (const event of persistedEvents) {
        for (const call of readToolCalls(event)) calls.set(call.id, { name: call.name, arguments: call.arguments });
        const approval = readApprovalRequest(event);
        if (approval) approvals.push(approval);
      }
      pending = resolvePendingApproval(calls, approvals);
    }
    if (!pending) throw new Error(`TrueForge session ${sessionId} did not pause for adapter approval`);
    const approval = pending as PendingToolApproval;
    if (
      approval.toolName !== 'activate_compatibility_adapter' ||
      sha256(approval.arguments) !== expectedArgumentsHash
    ) {
      throw new Error('TrueForge proposed an approval that does not exactly match the reviewed evidence');
    }
    this.store.update(caseId, value => {
      value.approval = {
        status: 'pending',
        sessionId,
        threadId: approval.threadId,
        toolCallId: approval.toolCallId,
        toolName: approval.toolName,
        arguments: approval.arguments,
        adapterStateHashBefore: adapterBefore.stateHash,
        candidateStateHashBefore: candidateBefore.stateHash,
        reviewedEvidenceHash: evidenceHash,
        reviewedSchemaHash: schemaHash,
        expectedArgumentsHash
      };
    });
    this.store.transition(caseId, 'awaiting_approval', 'TrueForge paused before changing the compatibility adapter.');
  }

  private async verifyDenial(caseId: string): Promise<void> {
    const current = this.store.require(caseId);
    const adapterAfter = await snapshot<AdapterState>(this.config.controlBaseUrl);
    const candidateAfter = await snapshot<unknown>(this.config.v2BaseUrl);
    const zeroMutation =
      current.approval.adapterStateHashBefore === adapterAfter.stateHash &&
      current.approval.candidateStateHashBefore === candidateAfter.stateHash &&
      !adapterAfter.state.active;
    if (!zeroMutation) throw new Error('Denied approval changed adapter or candidate state');
    const decided: CaseApproval = {
      ...current.approval,
      status: 'denied',
      adapterStateHashAfter: adapterAfter.stateHash,
      candidateStateHashAfter: candidateAfter.stateHash,
      zeroMutation,
      decisionAt: new Date().toISOString()
    };
    this.store.update(caseId, value => {
      value.approval = decided;
      value.approvalHistory.push(decided);
      value.finalVerdict = 'denied_zero_mutation';
    });
    this.store.transition(caseId, 'denied_verified', 'Denied. Independent hashes prove that nothing changed.');
    this.store.append(caseId, {
      source: 'forgecanary',
      type: 'approval.denied_verified',
      title: 'Denial verified: zero mutation',
      detail: 'Adapter and candidate state hashes are byte-for-byte unchanged.'
    });
    this.buildReceipt(caseId, 'denied_zero_mutation');
  }

  private async verifyApprovalAndRepair(caseId: string): Promise<void> {
    const current = this.store.require(caseId);
    const adapterAfter = await snapshot<AdapterState>(this.config.controlBaseUrl);
    const candidateAfter = await snapshot<unknown>(this.config.v2BaseUrl);
    const scopedMutation = this.isReviewedMutation(current, adapterAfter, candidateAfter);
    if (!scopedMutation) throw new Error('Approved activation did not produce exactly the scoped adapter mutation');
    const decided: CaseApproval = {
      ...current.approval,
      status: 'allowed',
      adapterStateHashAfter: adapterAfter.stateHash,
      candidateStateHashAfter: candidateAfter.stateHash,
      scopedMutation,
      decisionAt: new Date().toISOString()
    };
    this.store.update(caseId, value => {
      value.approval = decided;
      value.approvalHistory.push(decided);
    });
    this.store.transition(caseId, 'verifying_repair', 'Replaying the same jobs from fresh candidate state.');
    await reset(this.config.v2BaseUrl);
    for (const order of ORDERS) {
      const repaired = await this.executeInventoryJob(
        caseId,
        FORGECANARY_MCP_NAMES.v2,
        this.config.v2BaseUrl,
        order.id,
        'repaired'
      );
      this.store.update(caseId, value => {
        const row = value.jobs.find(item => item.orderId === order.id);
        if (!row) return;
        row.repaired = repaired;
        row.repairedProtocolEqual =
          row.baseline !== undefined &&
          sha256(row.baseline.toolArguments) === sha256(repaired.toolArguments) &&
          sha256(row.baseline.toolResponse) === sha256(repaired.toolResponse);
      });
    }
    const repairedCase = this.store.require(caseId);
    const allGreen = repairedCase.jobs.every(row => row.repaired?.oracle.passed && row.repairedProtocolEqual);
    if (!allGreen) throw new Error('The approved repair did not make every replayed business outcome green');
    this.store.transition(caseId, 'complete', 'Approved repair verified. All replayed outcomes are now correct.');
    this.store.update(caseId, value => {
      value.finalVerdict = 'safe_to_ship';
    });
    this.store.append(caseId, {
      source: 'forgecanary',
      type: 'case.complete',
      title: 'Repair verified across the replay corpus',
      detail: `${repairedCase.jobs.length} of ${repairedCase.jobs.length} external-state checks passed.`
    });
    this.buildReceipt(caseId, 'approved_and_verified');
  }

  private isReviewedMutation(
    current: ForgeCanaryCase,
    adapterAfter: StateSnapshot<AdapterState>,
    candidateAfter: StateSnapshot<unknown>
  ): boolean {
    return (
      adapterAfter.stateHash !== current.approval.adapterStateHashBefore &&
      adapterAfter.state.active &&
      adapterAfter.state.adapterId === 'explicit-fefo-v1' &&
      adapterAfter.state.scope === 'reserve_inventory:perishable-default' &&
      adapterAfter.state.candidateSchemaHash === current.approval.reviewedSchemaHash &&
      adapterAfter.state.approvedEvidenceHash === current.approval.reviewedEvidenceHash &&
      current.approval.expectedArgumentsHash === sha256(current.approval.arguments ?? {}) &&
      candidateAfter.stateHash === current.approval.candidateStateHashBefore
    );
  }

  private buildReceipt(caseId: string, outcome: CaseReceipt['outcome']): void {
    const current = this.store.require(caseId);
    if (!current.schema) throw new Error('Cannot build a receipt without schema evidence');
    const body = {
      version: 1 as const,
      caseId,
      outcome,
      createdAt: new Date().toISOString(),
      model: current.model,
      trueforgeBaseUrl: this.config.trueforgeBaseUrl,
      savedAgentId: current.savedAgentId,
      parentRunId: current.parentRunId ?? current.parentSessionId ?? 'unknown',
      baselineVersion: current.baselineVersion,
      candidateVersion: current.candidateVersion,
      finalVerdict: current.finalVerdict,
      sessionIds: [...current.sessionIds],
      schema: current.schema,
      jobs: current.jobs.map(row => ({
        replayJobId: row.replayJobId,
        orderId: row.orderId,
        baselineTurnId: row.baseline?.turnId ?? null,
        candidateTurnId: row.candidate?.turnId ?? null,
        repairedTurnId: row.repaired?.turnId ?? null,
        protocolEqual: row.protocolEqual ?? false,
        repairedProtocolEqual: row.repaired ? (row.repairedProtocolEqual ?? false) : null,
        candidatePassed: row.candidate?.oracle.passed ?? false,
        repairedPassed: row.repaired?.oracle.passed ?? null,
        expectedLotId: row.candidate?.oracle.expectedLotId ?? null,
        candidateLotId: row.candidate?.oracle.actualLotId ?? null,
        repairedLotId: row.repaired?.oracle.actualLotId ?? null
      })),
      approval: current.approval,
      approvalHistory: current.approvalHistory
    };
    const receipt: CaseReceipt = { ...body, receiptHash: sha256(body) };
    this.store.update(caseId, value => {
      value.receipt = receipt;
      const before = value.events.length;
      value.events = value.events.filter(event =>
        event.source === 'forgecanary' &&
        (event.type.startsWith('case.') ||
          event.type.startsWith('parent_run.') ||
          event.type.startsWith('semantic.') ||
          event.type.startsWith('approval.') ||
          event.type.endsWith('.verified'))
      );
      value.retention.archivedWorkerEventCount += before - value.events.length;
    });
  }

  private registerSession(caseId: string, sessionId: string): void {
    this.store.update(caseId, value => {
      if (!value.sessionIds.includes(sessionId)) value.sessionIds.push(sessionId);
    });
  }

  private async createParentRun(caseId: string): Promise<void> {
    if (!this.savedAgent) throw new Error('Saved replay agent is unavailable');
    const current = this.store.require(caseId);
    const { data: session } = await this.client.sessions.create({
      agent: { spec: toolFreeAgentSpec(this.savedAgent.manifest, false) }
    });
    this.store.update(caseId, value => {
      value.parentRunId = session.id;
      value.parentSessionId = session.id;
      value.sessionIds = [session.id];
    });
    const stream = await this.client.sessions.createTurnStream(session.id, {
      input: [{
        type: 'user.message',
        content: `${current.historyTitle}. Initialize this parent release run. Do not call tools; acknowledge the run title only.`
      }],
      previousTurnId: 'none'
    });
    for await (const { data: event } of stream.withMetadata()) {
      this.recordTrueForgeEvent(caseId, session.id, event);
      const terminal = event as unknown as { type?: string; state?: { status?: string; message?: string } };
      if (terminal.type === 'turn.done' && terminal.state?.status !== 'done') {
        throw new Error(`TrueForge parent run failed to initialize: ${terminal.state?.message ?? terminal.state?.status}`);
      }
    }
    this.store.append(caseId, {
      source: 'forgecanary',
      type: 'parent_run.ready',
      title: 'Parent release run ready',
      detail: 'Six isolated replay workers will report into this single release history entry.'
    });
  }

  private recordTrueForgeEvent(caseId: string, sessionId: string, event: unknown): void {
    this.registerSession(caseId, sessionId);
    const trace = normalizeTrueForgeEvent(event, sessionId);
    if (trace) {
      const duplicate =
        trace.trueforgeEventId !== undefined &&
        this.store.require(caseId).events.some(item => item.trueforgeEventId === trace.trueforgeEventId);
      if (!duplicate) this.store.append(caseId, trace);
    }
    const sandboxId = readSandboxCreated(event);
    if (sandboxId) {
      this.store.update(caseId, value => {
        value.capabilities.sandboxCreated = true;
        value.capabilities.sandboxId = sandboxId;
      });
    }
    const thread = readThreadCreated(event);
    if (thread) {
      this.store.update(caseId, value => {
        if (!value.capabilities.subagents.some(item => item.threadId === thread.threadId)) {
          value.capabilities.subagents.push({ ...thread, status: 'running' });
        }
      });
    }
    const finishedThread = readThreadDone(event);
    if (finishedThread) {
      this.store.update(caseId, value => {
        const child = value.capabilities.subagents.find(item => item.threadId === finishedThread);
        if (child) child.status = 'done';
      });
    }
  }
}
