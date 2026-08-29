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
  toolName: string;
  toolArguments: Record<string, unknown>;
  toolResponse: Record<string, unknown>;
  oracle: OracleResult;
}

export interface CaseJobRow {
  orderId: string;
  sku: string;
  quantity: number;
  perishable: boolean;
  productLabel: string;
  baseline?: JobRunEvidence;
  candidate?: JobRunEvidence;
  repaired?: JobRunEvidence;
  protocolEqual?: boolean;
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
  sessionIds: string[];
  schema: { v1Hash: string; v2Hash: string; equal: boolean };
  jobs: Array<{
    orderId: string;
    protocolEqual: boolean;
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

export interface ForgeCanaryCase {
  version: 1;
  id: string;
  stage: CaseStage;
  mode: 'live' | 'test';
  model: string;
  createdAt: string;
  updatedAt: string;
  sequence: number;
  summary: string;
  schema?: { v1Hash: string; v2Hash: string; equal: boolean };
  jobs: CaseJobRow[];
  sessionIds: string[];
  analysisSessionId?: string;
  approval: CaseApproval;
  approvalHistory: CaseApproval[];
  capabilities: CaseCapabilities;
  events: CaseTraceEvent[];
  receipt?: CaseReceipt;
  error?: { message: string; stage: CaseStage; occurredAt: string };
}
