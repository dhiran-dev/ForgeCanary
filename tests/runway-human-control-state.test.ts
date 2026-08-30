import { describe, expect, it } from 'vitest';
import {
  deriveHumanControlState,
  type HumanControlView
} from '../ui/src/runway/sections/human-control-state.js';

const readyView: HumanControlView = {
  phase: 'ready',
  changesFound: 0,
  needsOperator: false,
  isRunning: false
};

function state(overrides: Partial<HumanControlView> = {}, illustrative = false, reducedMotion = false) {
  return deriveHumanControlState({ ...readyView, ...overrides }, illustrative, reducedMotion);
}

describe('Human control story state', () => {
  it('labels the no-case canonical story as a demo hold', () => {
    const demo = state({}, true);

    expect(demo.mismatchKnown).toBe(true);
    expect(demo.gateHeld).toBe(true);
    expect(demo.status).toBe('DEMO HOLD / NO CHANGE IN PRODUCTION');
    expect(demo.mismatchIsMoving).toBe(true);
  });

  it('does not invent a mismatch when a clean comparison starts', () => {
    const comparison = state({ phase: 'compare', isRunning: true });

    expect(comparison.mismatchKnown).toBe(false);
    expect(comparison.status).toBe('NO BEHAVIOR CHANGE FOUND');
    expect(comparison.gateLabel).toBe('NO CHANGE FOUND');
    expect(comparison.mismatchIsMoving).toBe(false);
    expect(comparison.signalIsMoving).toBe(true);
  });

  it('announces a real mismatch and holds it for the operator', () => {
    const blocked = state({ phase: 'blocked', changesFound: 1, needsOperator: true });

    expect(blocked.mismatchKnown).toBe(true);
    expect(blocked.gateHeld).toBe(true);
    expect(blocked.status).toBe('RELEASE HELD / AWAITING OPERATOR');
    expect(blocked.gateLabel).toBe('DECISION REQUIRED');
    expect(blocked.signalIsMoving).toBe(false);
    expect(blocked.mismatchIsMoving).toBe(false);
  });

  it('stops explanatory flow after a failed run', () => {
    const failed = state({ phase: 'failed', changesFound: 1, needsOperator: true });

    expect(failed.signalIsMoving).toBe(false);
    expect(failed.mismatchIsMoving).toBe(false);
  });

  it('removes every moving packet for reduced motion', () => {
    const reduced = state({ phase: 'compare', changesFound: 1, isRunning: true }, false, true);

    expect(reduced.signalIsMoving).toBe(false);
    expect(reduced.mismatchIsMoving).toBe(false);
  });
});
