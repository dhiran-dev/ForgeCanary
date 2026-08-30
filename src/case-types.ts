import type { OracleResult } from './domain.js';

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

export type ApprovalStatus = 'not_requested' | 'pending' | 'denied' | 'allowed';

export interface CaseTraceEvent {
  id: number;
  caseId: string;
  source: 'forgecanary' | 'trueforge';
  type: string;
  title: string;
  detail?: string;
  createdAt: string;
  trueforgeEventId?: string;
  sessionId?: string;
  threadId?: string | null;
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

export interface CaseApproval {
  status: ApprovalStatus;
  sessionId?: string;
  threadId?: string;
  toolCallId?: string;
  toolName?: string;
  arguments?: Record<string, unknown>;
  adapterStateHashBefore?: string;
  adapterStateHashAfter?: string;
  candidateStateHashBefore?: string;
  candidateStateHashAfter?: string;
  zeroMutation?: boolean;
  scopedMutation?: boolean;
  reviewedEvidenceHash?: string;
  reviewedSchemaHash?: string;
  expectedArgumentsHash?: string;
  decisionAt?: string;
}

export interface CaseCapabilities {
  sandboxCreated: boolean;
  sandboxId?: string;
  subagents: Array<{ threadId: string; title: string; status: 'running' | 'done' }>;
}

export interface CaseReceipt {
  version: 1;
  caseId: string;
  outcome: 'denied_zero_mutation' | 'approved_and_verified';
  createdAt: string;
  model: string;
  trueforgeBaseUrl: string;
  savedAgentId: string;
  parentRunId: string;
  baselineVersion: string;
  candidateVersion: string;
  finalVerdict: ForgeCanaryCase['finalVerdict'];
  sessionIds: string[];
  schema: { v1Hash: string; v2Hash: string; equal: boolean };
  jobs: Array<{
    replayJobId: string;
    orderId: string;
    baselineTurnId: string | null;
    candidateTurnId: string | null;
    repairedTurnId: string | null;
    protocolEqual: boolean;
    repairedProtocolEqual: boolean | null;
    candidatePassed: boolean;
    repairedPassed: boolean | null;
    expectedLotId: string | null;
    candidateLotId: string | null;
    repairedLotId: string | null;
  }>;
  approval: CaseApproval;
  approvalHistory: CaseApproval[];
  receiptHash: string;
}

export interface ReleaseHistoryEntry {
  caseId: string;
  historyTitle: string;
  parentRunId: string | null;
  candidateVersion: string;
  finalVerdict: ForgeCanaryCase['finalVerdict'];
  completedAt: string;
  receiptHash: string | null;
}

export interface ForgeCanaryCase {
  version: 1;
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
  receiptHistory: CaseReceipt[];
  releaseHistory: ReleaseHistoryEntry[];
  capabilities: CaseCapabilities;
  events: CaseTraceEvent[];
  receipt?: CaseReceipt;
  retention: {
    releaseSummary: 'keep';
    receipt: 'keep';
    workerDetail: 'archive_after_receipt';
    childRuns: 'hidden';
    archivedWorkerEventCount: number;
  };
  error?: { message: string; stage: CaseStage; occurredAt: string };
}
