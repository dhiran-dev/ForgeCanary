import { describe, expect, it } from 'vitest';
import {
  deriveReplayStoryState,
  statusCount,
  type ReplayStoryView
} from '../ui/src/runway/sections/replay-section-state.js';

const readyView: ReplayStoryView = {
  phase: 'ready',
  phaseIndex: 0,
  jobsReplayed: 0,
  replayExecutions: 0,
  changesFound: 0,
  repairedJobs: 0
};

function state(overrides: Partial<ReplayStoryView> = {}, illustrative = false, reducedMotion = false) {
  return deriveReplayStoryState({ ...readyView, ...overrides }, illustrative, reducedMotion);
}

describe('Replay story state', () => {
  it('keeps the no-case reference explicitly illustrative', () => {
    const demo = state({}, true);

    expect(demo.narrative.label).toBe('DEMO / CANONICAL RUN');
    expect(demo.completed).toBe(4);
    expect(statusCount(demo.upgradeCompleted, demo.upgradeActive)).toBe('04 / 06 RUNNING');
    expect(demo.hasMismatch).toBe(true);
    expect(demo.heldChanges).toBe(1);
    expect(demo.replayMoving).toBe(true);
  });

  it('shows zero progress and no motion before replay starts', () => {
    const ready = state();

    expect(ready.narrative.label).toBe('LIVE / READY');
    expect(ready.completed).toBe(0);
    expect(statusCount(ready.upgradeCompleted, ready.upgradeActive)).toBe('00 / 06 WAITING');
    expect(ready.hasMismatch).toBe(false);
    expect(ready.heldChanges).toBe(0);
    expect(ready.replayMoving).toBe(false);
    expect(ready.activeStage).toBe(0);
  });

  it('does not mark a zero-execution replay complete', () => {
    const replay = state({ phase: 'replay', phaseIndex: 1 });

    expect(replay.completed).toBe(0);
    expect(replay.baselineCompleted).toBe(0);
    expect(replay.baselineActive).toBe(true);
    expect(statusCount(replay.baselineCompleted, replay.baselineActive)).toBe('00 / 06 STARTING');
  });

  it('only exposes mismatch motion after an observed comparison change', () => {
    const cleanCompare = state({ phase: 'compare', phaseIndex: 2, jobsReplayed: 6 });
    const changedCompare = state({
      phase: 'compare',
      phaseIndex: 2,
      jobsReplayed: 6,
      changesFound: 1
    });

    expect(cleanCompare.hasMismatch).toBe(false);
    expect(cleanCompare.mismatchMoving).toBe(false);
    expect(changedCompare.hasMismatch).toBe(true);
    expect(changedCompare.mismatchMoving).toBe(true);
  });

  it('stops all packets in terminal and reduced-motion states', () => {
    const complete = state({
      phase: 'complete',
      phaseIndex: 3,
      jobsReplayed: 6,
      replayExecutions: 12,
      repairedJobs: 6,
      changesFound: 1
    });
    const reduced = state({ phase: 'replay', phaseIndex: 1 }, false, true);

    expect(complete.replayMoving).toBe(false);
    expect(complete.mismatchMoving).toBe(false);
    expect(reduced.replayMoving).toBe(false);
    expect(reduced.mismatchMoving).toBe(false);
  });
});
