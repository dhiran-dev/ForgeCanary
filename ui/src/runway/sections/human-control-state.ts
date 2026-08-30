export type HumanControlView = {
  phase: 'ready' | 'current' | 'replay' | 'compare' | 'blocked' | 'repair' | 'complete' | 'failed';
  changesFound: number;
  needsOperator: boolean;
};

export type HumanControlState = {
  mismatchKnown: boolean;
  gateHeld: boolean;
  signalIsMoving: boolean;
  mismatchIsMoving: boolean;
  status: string;
  lede: string;
  gateLabel: string;
};

export function deriveHumanControlState(
  view: HumanControlView,
  illustrative: boolean,
  reducedMotion: boolean
): HumanControlState {
  const mismatchKnown = illustrative || view.changesFound > 0;
  const gateHeld = illustrative || view.phase === 'blocked' || view.phase === 'failed' || view.needsOperator;
  const signalIsMoving = !reducedMotion && (illustrative || view.phase === 'compare' || view.phase === 'repair');
  const mismatchIsMoving = signalIsMoving && mismatchKnown && (illustrative || view.phase === 'compare');

  const status = illustrative
    ? 'DEMO HOLD / NO CHANGE IN PRODUCTION'
    : gateHeld
      ? 'RELEASE HELD / AWAITING OPERATOR'
      : view.phase === 'complete'
        ? 'RELEASE VERIFIED / READY TO SHIP'
        : mismatchKnown
          ? 'CHANGE CAUGHT BEFORE PRODUCTION'
          : view.phase === 'compare'
            ? 'NO BEHAVIOR CHANGE FOUND'
            : 'RELEASE GATE READY / NO CHANGE IN PRODUCTION';

  const lede = illustrative || mismatchKnown
    ? 'The upgrade reserved the same four units, but chose later-expiring stock. ForgeCanary holds the release before anything changes.'
    : view.phase === 'complete'
      ? 'The reviewed release passed its replay and evidence checks. The operator remains in control of what ships.'
      : 'ForgeCanary keeps the release gate closed while replay and evidence checks establish whether an operator decision is needed.';

  const gateLabel = gateHeld
    ? 'DECISION REQUIRED'
    : view.phase === 'complete'
      ? 'RELEASE APPROVED'
      : view.phase === 'compare' && !mismatchKnown
        ? 'NO CHANGE FOUND'
        : 'RELEASE GATE READY';

  return {
    mismatchKnown,
    gateHeld,
    signalIsMoving,
    mismatchIsMoving,
    status,
    lede,
    gateLabel
  };
}
