export type ReplayStoryView = {
  phase: 'ready' | 'current' | 'replay' | 'compare' | 'blocked' | 'repair' | 'complete' | 'failed';
  phaseIndex: 0 | 1 | 2 | 3;
  jobsReplayed: number;
  replayExecutions: number;
  changesFound: number;
  repairedJobs: number;
  isRunning: boolean;
};

export type ReplayStoryState = {
  completed: number;
  hasMismatch: boolean;
  replayMoving: boolean;
  mismatchMoving: boolean;
  narrative: { label: string; copy: string };
  baselineCompleted: number;
  upgradeCompleted: number;
  baselineActive: boolean;
  upgradeActive: boolean;
  activeStage: 0 | 1 | 2 | 3;
  heldChanges: number;
};

function replayProgress(view: ReplayStoryView, illustrative: boolean): number {
  if (illustrative) return 4;
  if (view.phase === 'ready' || view.phase === 'current') return 0;
  if (view.phase === 'replay') return Math.min(6, Math.ceil(view.replayExecutions / 2));
  if (view.phase === 'repair') return Math.min(6, view.repairedJobs);
  return Math.min(6, Math.max(view.jobsReplayed, Math.ceil(view.replayExecutions / 2)));
}

function replayNarrative(view: ReplayStoryView, illustrative: boolean): { label: string; copy: string } {
  if (illustrative) {
    return {
      label: 'DEMO / CANONICAL RUN',
      copy: 'Two replay agents run the same six pharmacy orders while two specialists inspect the evidence.'
    };
  }

  switch (view.phase) {
    case 'current':
      return { label: 'LIVE / PREFLIGHT', copy: 'The current version is connected. Replay begins after preflight.' };
    case 'replay':
      return {
        label: 'LIVE / REPLAYING',
        copy: `${Math.min(12, view.replayExecutions)} of 12 versioned executions are complete.`
      };
    case 'compare':
      return { label: 'LIVE / COMPARING', copy: 'Replay is complete. The specialists are checking the real outcomes.' };
    case 'blocked':
      return { label: 'LIVE / HELD', copy: 'Replay is stopped. The detected change remains held for a human decision.' };
    case 'repair':
      return {
        label: 'LIVE / VERIFYING REPAIR',
        copy: `${Math.min(6, view.repairedJobs)} of 6 repaired outcomes are verified.`
      };
    case 'complete':
      return { label: 'LIVE / COMPLETE', copy: 'All six replay jobs completed and their real outcomes were verified.' };
    case 'failed':
      return { label: 'LIVE / STOPPED', copy: 'The check stopped safely. No further replay work is running.' };
    default:
      return { label: 'LIVE / READY', copy: 'Replay has not started. The system is waiting for a release check.' };
  }
}

export function statusCount(count: number, active: boolean): string {
  const suffix = count === 6 ? 'COMPLETE' : active ? (count === 0 ? 'STARTING' : 'RUNNING') : 'WAITING';
  return `${String(count).padStart(2, '0')} / 06 ${suffix}`;
}

export function deriveReplayStoryState(
  view: ReplayStoryView,
  illustrative: boolean,
  reducedMotion: boolean
): ReplayStoryState {
  const baselineCompleted = illustrative ? 6 : Math.min(6, view.replayExecutions);
  const upgradeCompleted = illustrative
    ? 4
    : view.phase === 'repair'
      ? Math.min(6, view.repairedJobs)
      : Math.min(6, Math.max(0, view.replayExecutions - 6));
  const explanatoryFlowIsMoving = !reducedMotion && (illustrative || view.isRunning);

  return {
    completed: replayProgress(view, illustrative),
    hasMismatch: illustrative || view.changesFound > 0,
    replayMoving: explanatoryFlowIsMoving,
    mismatchMoving: explanatoryFlowIsMoving
      && (illustrative || ((view.phase === 'compare' || view.phase === 'blocked') && view.changesFound > 0)),
    narrative: replayNarrative(view, illustrative),
    baselineCompleted,
    upgradeCompleted,
    baselineActive: !illustrative && view.phase === 'replay' && baselineCompleted < 6,
    upgradeActive: illustrative || view.phase === 'repair' || (view.phase === 'replay' && baselineCompleted === 6),
    activeStage: illustrative ? 1 : view.phaseIndex,
    heldChanges: illustrative ? 1 : view.changesFound
  };
}
