export type CaseStage =
  | 'idle'
  | 'preflight'
  | 'replaying_baseline'
  | 'replaying_candidate'
  | 'analyzing'
  | 'regression_detected'
  | 'proposing_repair'
  | 'awaiting_approval'
  | 'denied_verified'
  | 'applying_repair'
  | 'verifying_repair'
  | 'complete'
  | 'failed';

export interface OracleResult {
  orderId: string;
  passed: boolean;
  invariant: string;
  expectedLotId: string | null;
  actualLotId: string | null;
  reservationId: string | null;
  reason: string;
}

export interface JobRunEvidence {
  sessionId: string;
  turnId?: string;
  toolName: string;
  toolArguments: Record<string, unknown>;
  toolResponse: Record<string, unknown>;
  oracle: OracleResult;
}

export interface CaseJobRow {
  replayJobId: string;
  orderId: string;
  sku: string;
  quantity: number;
  perishable: boolean;
  productLabel: string;
  baseline?: JobRunEvidence;
  candidate?: JobRunEvidence;
  repaired?: JobRunEvidence;
  protocolEqual?: boolean;
  repairedProtocolEqual?: boolean;
  workerStatus: 'queued' | 'spawning' | 'running' | 'held' | 'verified' | 'closed' | 'failed';
  currentTask: string;
  finalVerdict?: 'pass' | 'regression' | 'repaired';
}

export interface CaseTraceEvent {
  id: number;
  caseId: string;
  source: 'forgecanary' | 'trueforge';
  type: string;
  title: string;
  detail?: string;
  createdAt: string;
  sessionId?: string;
  threadId?: string | null;
}

export interface CaseApproval {
  status: 'not_requested' | 'pending' | 'denied' | 'allowed';
  sessionId?: string;
  toolName?: string;
  arguments?: Record<string, unknown>;
  zeroMutation?: boolean;
  scopedMutation?: boolean;
  adapterStateHashBefore?: string;
  adapterStateHashAfter?: string;
  candidateStateHashBefore?: string;
  candidateStateHashAfter?: string;
  reviewedEvidenceHash?: string;
  reviewedSchemaHash?: string;
  expectedArgumentsHash?: string;
}

export interface ForgeCanaryCase {
  id: string;
  stage: CaseStage;
  mode: 'live' | 'test';
  model: string;
  savedAgentId: string;
  parentRunId?: string;
  parentSessionId?: string;
  baselineVersion: string;
  candidateVersion: string;
  historyTitle: string;
  finalVerdict?: 'blocked' | 'denied_zero_mutation' | 'safe_to_ship';
  createdAt: string;
  updatedAt: string;
  dismissedAt?: string;
  sequence: number;
  summary: string;
  schema?: { v1Hash: string; v2Hash: string; equal: boolean };
  jobs: CaseJobRow[];
  sessionIds: string[];
  analysisSessionId?: string;
  approval: CaseApproval;
  approvalHistory: CaseApproval[];
  receiptHistory: Array<{ receiptHash: string; outcome: string }>;
  releaseHistory: Array<{
    caseId: string;
    historyTitle: string;
    parentRunId: string | null;
    candidateVersion: string;
    finalVerdict?: 'blocked' | 'denied_zero_mutation' | 'safe_to_ship';
    completedAt: string;
    receiptHash: string | null;
  }>;
  capabilities: {
    sandboxCreated: boolean;
    sandboxId?: string;
    subagents: Array<{ threadId: string; title: string; status: 'running' | 'done' }>;
  };
  events: CaseTraceEvent[];
  receipt?: { receiptHash: string; outcome: string };
  retention: {
    releaseSummary: 'keep';
    receipt: 'keep';
    workerDetail: 'archive_after_receipt';
    childRuns: 'hidden';
    archivedWorkerEventCount: number;
  };
  error?: { message: string; stage: CaseStage; occurredAt: string };
}

export interface PublicConfig {
  mode: 'live' | 'test';
  model: string;
  reasoningEffort?: string;
  savedAgentId?: string;
  savedAgentName?: string;
  trueforgeBaseUrl: string;
  trueforgeUiUrl: string;
  connectors: string[];
  note: string;
  operatorToken: string;
}

export interface HealthState {
  ok: boolean;
  mode: 'live' | 'test';
  services: Record<string, { ok: boolean; detail: string }>;
}
