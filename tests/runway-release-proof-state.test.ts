import { describe, expect, it } from 'vitest';
import {
  deriveReleaseProofState,
  type ReleaseProofView
} from '../ui/src/runway/sections/release-proof-state.js';

const readyView: ReleaseProofView = {
  phase: 'ready',
  jobsReplayed: 0,
  repairedJobs: 0,
  isRunning: false
};

function state(overrides: Partial<ReleaseProofView> = {}, illustrative = false, reducedMotion = false) {
  return deriveReleaseProofState({ ...readyView, ...overrides }, illustrative, reducedMotion);
}

describe('Release proof story state', () => {
  it('labels the no-case six-order result as an illustrative receipt', () => {
    const demo = state({}, true);

    expect(demo.sceneState).toBe('demo');
    expect(demo.receiptHeader).toBe('DEMO / PROOF RECEIPT READY');
    expect(demo.displayJobs).toBe(6);
    expect(demo.verifiedCells).toBe(6);
    expect(demo.receiptReady).toBe(true);
  });

  it('keeps an idle release pending with zero verified outcomes', () => {
    const ready = state();

    expect(ready.sceneState).toBe('pending');
    expect(ready.receiptHeader).toBe('PROOF RECEIPT PENDING');
    expect(ready.displayJobs).toBe(0);
    expect(ready.verifiedCells).toBe(0);
    expect(ready.receiptReady).toBe(false);
    expect(ready.gateLabel).toBe('PROOF\nPENDING');
    expect(ready.signalIsMoving).toBe(false);
  });

  it('shows only actually repaired outcomes during verification', () => {
    const repair = state({ phase: 'repair', jobsReplayed: 6, repairedJobs: 2, isRunning: true });

    expect(repair.sceneState).toBe('verifying');
    expect(repair.verifiedCells).toBe(2);
    expect(repair.upgradeStatus).toBe('2 OF 6 VERIFIED');
    expect(repair.receiptReady).toBe(false);
    expect(repair.signalIsMoving).toBe(true);
  });

  it('only opens the safe gate after all six outcomes complete', () => {
    const incomplete = state({ phase: 'complete', jobsReplayed: 4, repairedJobs: 4 });
    const complete = state({ phase: 'complete', jobsReplayed: 6, repairedJobs: 6 });

    expect(incomplete.receiptReady).toBe(false);
    expect(incomplete.gateLabel).toBe('PROOF\nPENDING');
    expect(complete.receiptReady).toBe(true);
    expect(complete.gateLabel).toBe('SAFE TO\nSHIP');
    expect(complete.safetyStatus).toBe('APPROVED');
    expect(complete.realityStatus).toBe('INVENTORY VERIFIED');
    expect(complete.signalIsMoving).toBe(false);
  });

  it('stops proof flow after a failed run', () => {
    expect(state({ phase: 'failed' }).signalIsMoving).toBe(false);
  });

  it('removes proof motion when reduced motion is requested', () => {
    expect(state({ phase: 'repair', repairedJobs: 3, isRunning: true }, false, true).signalIsMoving).toBe(false);
  });
});
