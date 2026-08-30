export type ReleaseProofView = {
  phase: 'ready' | 'current' | 'replay' | 'compare' | 'blocked' | 'repair' | 'complete' | 'failed';
  jobsReplayed: number;
  repairedJobs: number;
};

export type ReleaseProofState = {
  displayJobs: number;
  verifiedCells: number;
  sceneState: 'demo' | 'pending' | 'verifying' | 'verified';
  receiptReady: boolean;
  signalIsMoving: boolean;
  receiptHeader: string;
  lede: string;
  upgradeStatus: string;
  safetyStatus: string;
  realityStatus: string;
  gateLabel: string;
  figureLabel: string;
};

export function deriveReleaseProofState(
  view: ReleaseProofView,
  illustrative: boolean,
  reducedMotion: boolean
): ReleaseProofState {
  const observedJobs = Math.min(6, Math.max(view.jobsReplayed, view.repairedJobs));
  const displayJobs = illustrative ? 6 : observedJobs;
  const verifiedCells = illustrative
    ? 6
    : view.phase === 'repair'
      ? Math.min(6, view.repairedJobs)
      : view.phase === 'complete'
        ? observedJobs
        : 0;
  const receiptReady = illustrative || (view.phase === 'complete' && verifiedCells === 6);
  const sceneState = illustrative
    ? 'demo'
    : receiptReady
      ? 'verified'
      : view.phase === 'repair'
        ? 'verifying'
        : 'pending';
  const signalIsMoving = !reducedMotion && view.phase !== 'failed';

  const receiptHeader = illustrative
    ? 'DEMO / PROOF RECEIPT READY'
    : receiptReady
      ? 'PROOF RECEIPT READY'
      : view.phase === 'repair'
        ? 'PROOF VERIFICATION RUNNING'
        : 'PROOF RECEIPT PENDING';

  const lede = illustrative || receiptReady
    ? 'The reviewed repair preserved every expected outcome and changed nothing outside scope.'
    : view.phase === 'repair'
      ? 'The repaired upgrade is replaying now. The receipt stays pending until every expected outcome is verified.'
      : 'The release receipt remains pending until replay, reality evidence, and operator review are complete.';

  const upgradeStatus = receiptReady
    ? `${displayJobs} OF 6 CORRECT`
    : view.phase === 'repair'
      ? `${verifiedCells} OF 6 VERIFIED`
      : `${displayJobs} OF 6 REPLAYED`;
  const safetyStatus = receiptReady ? 'APPROVED' : view.phase === 'repair' ? 'REVIEWING' : 'PENDING';
  const realityStatus = receiptReady ? 'INVENTORY VERIFIED' : view.phase === 'repair' ? 'VERIFYING INVENTORY' : 'PENDING';
  const gateLabel = receiptReady ? 'SAFE TO\nSHIP' : view.phase === 'repair' ? 'VERIFYING' : 'PROOF\nPENDING';
  const figureLabel = receiptReady
    ? `${illustrative ? 'Illustrative TrueForge' : 'TrueForge'} execution graph with four approved specialists, six verified outcomes, and a safe-to-ship gate`
    : `TrueForge execution graph with ${verifiedCells} of 6 outcomes verified and the release proof still pending`;

  return {
    displayJobs,
    verifiedCells,
    sceneState,
    receiptReady,
    signalIsMoving,
    receiptHeader,
    lede,
    upgradeStatus,
    safetyStatus,
    realityStatus,
    gateLabel,
    figureLabel
  };
}
