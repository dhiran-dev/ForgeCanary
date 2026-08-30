import type { CaseStage, ForgeCanaryCase } from '../types';

export type RunwayPhase =
  | 'ready'
  | 'current'
  | 'replay'
  | 'compare'
  | 'blocked'
  | 'repair'
  | 'complete'
  | 'failed';

export type RunwayView = {
  phase: RunwayPhase;
  phaseIndex: 0 | 1 | 2 | 3;
  label: string;
  detail: string;
  jobsReplayed: number;
  replayExecutions: number;
  changesFound: number;
  repairedJobs: number;
  isRunning: boolean;
  needsOperator: boolean;
};

export const ACTIVE_CASE_STAGES = new Set<CaseStage>([
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

export function isLiveCase(caseState: ForgeCanaryCase | null): boolean {
  return Boolean(caseState && ACTIVE_CASE_STAGES.has(caseState.stage));
}

export function deriveRunwayView(caseState: ForgeCanaryCase | null): RunwayView {
  const jobsReplayed = caseState?.jobs.filter(job => job.baseline || job.candidate).length ?? 0;
  const replayExecutions = caseState?.jobs.reduce(
    (total, job) => total + Number(Boolean(job.baseline)) + Number(Boolean(job.candidate)),
    0
  ) ?? 0;
  const changesFound = caseState?.jobs.filter(job => job.candidate && !job.candidate.oracle.passed).length ?? 0;
  const repairedJobs = caseState?.jobs.filter(job => job.repaired?.oracle.passed).length ?? 0;
  const shared = { jobsReplayed, replayExecutions, changesFound, repairedJobs };

  if (!caseState || caseState.stage === 'idle') {
    return {
      ...shared,
      phase: 'ready',
      phaseIndex: 0,
      label: 'Ready for a live release check',
      detail: 'Current version connected',
      isRunning: false,
      needsOperator: false
    };
  }

  switch (caseState.stage) {
    case 'preflight':
      return {
        ...shared,
        phase: 'current',
        phaseIndex: 0,
        label: 'Sending proven work',
        detail: `Preflight running on ${caseState.model}`,
        isRunning: true,
        needsOperator: false
      };
    case 'replaying_baseline':
    case 'replaying_candidate':
      return {
        ...shared,
        phase: 'replay',
        phaseIndex: 1,
        label: caseState.stage === 'replaying_baseline' ? 'Replaying the current version' : 'Replaying the upgrade',
        detail: `${replayExecutions}/12 versioned executions complete`,
        isRunning: true,
        needsOperator: false
      };
    case 'analyzing':
    case 'regression_detected':
    case 'proposing_repair':
      return {
        ...shared,
        phase: 'compare',
        phaseIndex: 2,
        label: changesFound > 0 ? 'Silent behavior change caught' : 'Checking the real outcomes',
        detail: changesFound > 0 ? `${changesFound} business-outcome regression found` : 'Looking beyond matching tool replies',
        isRunning: true,
        needsOperator: false
      };
    case 'awaiting_approval':
      return {
        ...shared,
        phase: 'blocked',
        phaseIndex: 3,
        label: 'Release held for a human decision',
        detail: 'TrueForge paused before the scoped repair',
        isRunning: true,
        needsOperator: true
      };
    case 'denied_verified':
      return {
        ...shared,
        phase: 'blocked',
        phaseIndex: 3,
        label: 'Denied safely — zero mutation proved',
        detail: 'The release remains untouched',
        isRunning: false,
        needsOperator: true
      };
    case 'applying_repair':
    case 'verifying_repair':
      return {
        ...shared,
        phase: 'repair',
        phaseIndex: 3,
        label: caseState.stage === 'applying_repair' ? 'Applying the scoped repair' : 'Replaying after the repair',
        detail: `${repairedJobs}/6 repaired outcomes verified`,
        isRunning: true,
        needsOperator: false
      };
    case 'complete':
      return {
        ...shared,
        phase: 'complete',
        phaseIndex: 3,
        label: 'Safe to ship',
        detail: `${repairedJobs}/6 business outcomes correct`,
        isRunning: false,
        needsOperator: false
      };
    case 'failed':
      return {
        ...shared,
        phase: 'failed',
        phaseIndex: 3,
        label: 'Stopped safely',
        detail: caseState.error?.message ?? 'The release remains untouched',
        isRunning: false,
        needsOperator: true
      };
  }
}
