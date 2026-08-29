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
  repairedProtocolEqual?: boolean;
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
  capabilities: {
    sandboxCreated: boolean;
    sandboxId?: string;
    subagents: Array<{ threadId: string; title: string; status: 'running' | 'done' }>;
  };
  events: CaseTraceEvent[];
  receipt?: { receiptHash: string; outcome: string };
  error?: { message: string; stage: CaseStage; occurredAt: string };
}

export interface PublicConfig {
  mode: 'live' | 'test';
  model: string;
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
