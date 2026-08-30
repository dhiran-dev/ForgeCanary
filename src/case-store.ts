import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { resolve } from 'node:path';
import { readJsonFile, stableJson, writeJsonFile } from './domain.js';
import type { CaseJobRow, CaseStage, CaseTraceEvent, ForgeCanaryCase } from './case-types.js';

const TERMINAL_STAGES = new Set<CaseStage>(['complete', 'denied_verified', 'failed']);

const DEFAULT_RETENTION: ForgeCanaryCase['retention'] = {
  releaseSummary: 'keep',
  receipt: 'keep',
  workerDetail: 'archive_after_receipt',
  childRuns: 'hidden',
  archivedWorkerEventCount: 0
};

const ALLOWED_TRANSITIONS: Record<CaseStage, readonly CaseStage[]> = {
  idle: ['preflight'],
  preflight: ['replaying_baseline', 'failed'],
  replaying_baseline: ['replaying_candidate', 'failed'],
  replaying_candidate: ['analyzing', 'failed'],
  analyzing: ['regression_detected', 'failed'],
  regression_detected: ['proposing_repair', 'failed'],
  proposing_repair: ['awaiting_approval', 'failed'],
  awaiting_approval: ['denied_verified', 'applying_repair', 'failed'],
  denied_verified: ['proposing_repair', 'preflight'],
  applying_repair: ['verifying_repair', 'failed'],
  verifying_repair: ['complete', 'failed'],
  complete: ['preflight'],
  failed: ['preflight']
};

export interface NewCaseInput {
  mode: 'live' | 'test';
  model: string;
  savedAgentId?: string;
  baselineVersion?: string;
  candidateVersion?: string;
}

export interface NewTraceEvent {
  source: CaseTraceEvent['source'];
  type: string;
  title: string;
  detail?: string;
  createdAt?: string;
  trueforgeEventId?: string;
  sessionId?: string;
  threadId?: string | null;
}

function normalizeJob(caseId: string, job: CaseJobRow): CaseJobRow {
  const workerStatus = job.workerStatus ?? (
    job.repaired?.oracle.passed
      ? 'closed'
      : job.candidate && !job.candidate.oracle.passed
        ? 'held'
        : job.candidate || job.baseline
          ? 'verified'
          : 'queued'
  );
  const finalVerdict = job.finalVerdict ?? (
    job.repaired?.oracle.passed
      ? 'repaired'
      : job.candidate && !job.candidate.oracle.passed
        ? 'regression'
        : job.candidate?.oracle.passed
          ? 'pass'
          : undefined
  );
  const currentTask = job.currentTask ?? (
    workerStatus === 'closed'
      ? 'Repair verified · receipt ready'
      : workerStatus === 'held'
        ? 'Business outcome held for review'
        : workerStatus === 'verified'
          ? 'Comparison verified'
          : 'Waiting for run'
  );
  return {
    ...job,
    replayJobId: job.replayJobId ?? `${caseId}:${job.orderId}`,
    workerStatus,
    currentTask,
    ...(finalVerdict ? { finalVerdict } : {})
  };
}

export function normalizeLoadedCase(raw: ForgeCanaryCase | null): ForgeCanaryCase | null {
  if (!raw) return null;
  const approval = raw.approval ?? { status: 'not_requested' as const };
  const legacyParentSessionId = raw.parentSessionId ?? raw.parentRunId ?? approval.sessionId;
  const baselineVersion = raw.baselineVersion ?? 'MCP v1';
  const candidateVersion = raw.candidateVersion ?? 'MCP v2';
  const jobs = Array.isArray(raw.jobs) ? raw.jobs.map(job => normalizeJob(raw.id, job)) : [];
  const events = Array.isArray(raw.events) ? raw.events : [];
  const sessionIds = Array.isArray(raw.sessionIds) ? [...raw.sessionIds] : [];
  const finalVerdict = raw.finalVerdict ?? (raw.stage === 'denied_verified' ? 'denied_zero_mutation' : undefined);
  if (legacyParentSessionId && !sessionIds.includes(legacyParentSessionId)) sessionIds.unshift(legacyParentSessionId);
  return {
    ...raw,
    version: 1,
    savedAgentId: raw.savedAgentId ?? 'legacy-inline-agent',
    ...(legacyParentSessionId ? { parentRunId: raw.parentRunId ?? legacyParentSessionId, parentSessionId: legacyParentSessionId } : {}),
    baselineVersion,
    candidateVersion,
    historyTitle: raw.historyTitle ?? `Release check: ${baselineVersion} → ${candidateVersion}`,
    ...(finalVerdict ? { finalVerdict } : {}),
    sequence: Number.isFinite(raw.sequence) ? raw.sequence : events.reduce((max, event) => Math.max(max, event.id), 0),
    jobs,
    sessionIds,
    approval,
    approvalHistory: Array.isArray(raw.approvalHistory) ? raw.approvalHistory : [],
    receiptHistory: Array.isArray(raw.receiptHistory) ? raw.receiptHistory : [],
    releaseHistory: Array.isArray(raw.releaseHistory) ? raw.releaseHistory : [],
    capabilities: {
      sandboxCreated: raw.capabilities?.sandboxCreated ?? false,
      ...(raw.capabilities?.sandboxId ? { sandboxId: raw.capabilities.sandboxId } : {}),
      subagents: Array.isArray(raw.capabilities?.subagents) ? raw.capabilities.subagents : []
    },
    events,
    retention: { ...DEFAULT_RETENTION, ...(raw.retention ?? {}) }
  };
}

export class CaseStore {
  private readonly path: string;
  private readonly emitter = new EventEmitter();
  private current: ForgeCanaryCase | null;

  constructor(path: string) {
    this.path = resolve(path);
    const loaded = readJsonFile<ForgeCanaryCase | null>(this.path, () => null);
    this.current = normalizeLoadedCase(loaded);
    if (this.current && stableJson(loaded) !== stableJson(this.current)) writeJsonFile(this.path, this.current);
    if (this.current && !TERMINAL_STAGES.has(this.current.stage)) {
      const interruptedStage = this.current.stage;
      this.current.stage = 'failed';
      this.current.error = {
        message: `The ForgeCanary process stopped while the case was in ${interruptedStage}. Reset and run again.`,
        stage: interruptedStage,
        occurredAt: new Date().toISOString()
      };
      this.current.updatedAt = new Date().toISOString();
      writeJsonFile(this.path, this.current);
    }
  }

  get(): ForgeCanaryCase | null {
    return this.current ? structuredClone(this.current) : null;
  }

  getVisible(): ForgeCanaryCase | null {
    return this.current?.dismissedAt ? null : this.get();
  }

  require(caseId: string): ForgeCanaryCase {
    const current = this.current;
    if (!current || current.id !== caseId) throw new Error(`Unknown or stale case: ${caseId}`);
    return structuredClone(current);
  }

  create(input: NewCaseInput): ForgeCanaryCase {
    if (this.current && !TERMINAL_STAGES.has(this.current.stage)) {
      throw new Error(`Case ${this.current.id} is already running in stage ${this.current.stage}`);
    }
    const releaseHistory = this.current?.releaseHistory ? [...this.current.releaseHistory] : [];
    if (this.current && TERMINAL_STAGES.has(this.current.stage) && !releaseHistory.some(item => item.caseId === this.current?.id)) {
      releaseHistory.push({
        caseId: this.current.id,
        historyTitle: this.current.historyTitle ?? 'Release check',
        parentRunId: this.current.parentRunId ?? null,
        candidateVersion: this.current.candidateVersion ?? 'MCP v2',
        finalVerdict: this.current.finalVerdict,
        completedAt: this.current.updatedAt,
        receiptHash: this.current.receipt?.receiptHash ?? null
      });
    }
    const now = new Date().toISOString();
    this.current = {
      version: 1,
      id: `fc_${randomUUID()}`,
      stage: 'idle',
      mode: input.mode,
      model: input.model,
      savedAgentId: input.savedAgentId ?? 'agent_test',
      baselineVersion: input.baselineVersion ?? 'MCP v1',
      candidateVersion: input.candidateVersion ?? 'MCP v2',
      historyTitle: `Release check: ${input.baselineVersion ?? 'MCP v1'} → ${input.candidateVersion ?? 'MCP v2'}`,
      createdAt: now,
      updatedAt: now,
      sequence: 0,
      summary: 'Ready to verify an MCP upgrade.',
      jobs: [],
      sessionIds: [],
      approval: { status: 'not_requested' },
      approvalHistory: [],
      receiptHistory: [],
      releaseHistory,
      capabilities: { sandboxCreated: false, subagents: [] },
      events: [],
      retention: { ...DEFAULT_RETENTION }
    };
    this.persist();
    return this.get() as ForgeCanaryCase;
  }

  transition(caseId: string, next: CaseStage, summary: string): ForgeCanaryCase {
    const current = this.requireMutable(caseId);
    if (!ALLOWED_TRANSITIONS[current.stage].includes(next)) {
      throw new Error(`Invalid case transition: ${current.stage} → ${next}`);
    }
    current.stage = next;
    current.summary = summary;
    current.updatedAt = new Date().toISOString();
    this.persist();
    return this.get() as ForgeCanaryCase;
  }

  update(caseId: string, mutate: (value: ForgeCanaryCase) => void): ForgeCanaryCase {
    const current = this.requireMutable(caseId);
    mutate(current);
    current.updatedAt = new Date().toISOString();
    this.persist();
    return this.get() as ForgeCanaryCase;
  }

  append(caseId: string, input: NewTraceEvent): CaseTraceEvent {
    const current = this.requireMutable(caseId);
    const event: CaseTraceEvent = {
      id: current.sequence + 1,
      caseId,
      source: input.source,
      type: input.type,
      title: input.title,
      createdAt: input.createdAt ?? new Date().toISOString(),
      ...(input.detail ? { detail: input.detail } : {}),
      ...(input.trueforgeEventId ? { trueforgeEventId: input.trueforgeEventId } : {}),
      ...(input.sessionId ? { sessionId: input.sessionId } : {}),
      ...(input.threadId !== undefined ? { threadId: input.threadId } : {})
    };
    current.sequence = event.id;
    current.events.push(event);
    current.updatedAt = new Date().toISOString();
    this.persist();
    this.emitter.emit(caseId, structuredClone(event));
    return event;
  }

  fail(caseId: string, error: unknown): ForgeCanaryCase {
    const current = this.requireMutable(caseId);
    const failedAtStage = current.stage;
    current.stage = 'failed';
    current.summary = 'The canary stopped safely. No unapproved repair was applied.';
    current.finalVerdict = 'blocked';
    for (const job of current.jobs) {
      if (job.workerStatus === 'running') {
        job.workerStatus = 'failed';
        job.currentTask = 'Stopped safely';
      }
    }
    current.error = {
      message: error instanceof Error ? error.message : String(error),
      stage: failedAtStage,
      occurredAt: new Date().toISOString()
    };
    current.updatedAt = new Date().toISOString();
    this.persist();
    this.append(caseId, {
      source: 'forgecanary',
      type: 'case.failed',
      title: 'Canary stopped safely',
      detail: current.error.message
    });
    return this.get() as ForgeCanaryCase;
  }

  dismiss(caseId: string): void {
    const current = this.requireMutable(caseId);
    if (!TERMINAL_STAGES.has(current.stage)) {
      throw new Error(`Cannot dismiss case ${caseId} while it is ${current.stage}`);
    }
    current.dismissedAt = new Date().toISOString();
    current.updatedAt = current.dismissedAt;
    this.persist();
  }

  subscribe(caseId: string, listener: (event: CaseTraceEvent) => void): () => void {
    this.require(caseId);
    this.emitter.on(caseId, listener);
    return () => this.emitter.off(caseId, listener);
  }

  private requireMutable(caseId: string): ForgeCanaryCase {
    if (!this.current || this.current.id !== caseId) throw new Error(`Unknown or stale case: ${caseId}`);
    return this.current;
  }

  private persist(): void {
    writeJsonFile(this.path, this.current);
  }
}

export function isCaseConflict(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes('already running') ||
    message.includes('Unknown or stale') ||
    message.includes('Invalid case') ||
    message.includes('Cannot dismiss case') ||
    message.includes('Cannot return to empty state')
  );
}
