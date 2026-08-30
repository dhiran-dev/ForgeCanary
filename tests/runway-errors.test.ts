import { describe, expect, it } from 'vitest';
import {
  activeRunwayError,
  initialRunwayErrorState,
  reduceRunwayErrors,
  type InitialLoadResults
} from '../ui/src/runway/runway-errors.js';

const fulfilled = (value: unknown): PromiseFulfilledResult<unknown> => ({
  status: 'fulfilled',
  value
});

const rejected = (reason: unknown): PromiseRejectedResult => ({
  status: 'rejected',
  reason
});

describe('release runway errors', () => {
  it('clears a transient refresh failure after the next successful poll', () => {
    const failed = reduceRunwayErrors(initialRunwayErrorState, {
      type: 'refresh-failed',
      reason: new Error('network unavailable')
    });

    expect(activeRunwayError(failed)).toBe('network unavailable');

    const recovered = reduceRunwayErrors(failed, { type: 'refresh-succeeded' });
    expect(activeRunwayError(recovered)).toBeNull();
  });

  it('records rejected health and current-case initialization requests', () => {
    const results: InitialLoadResults = [
      fulfilled({ model: 'demo' }),
      rejected(new Error('health endpoint failed')),
      rejected(new Error('case endpoint failed'))
    ];

    const state = reduceRunwayErrors(initialRunwayErrorState, {
      type: 'initialization-completed',
      results
    });

    expect(activeRunwayError(state)).toContain('Unable to load health status: health endpoint failed');
    expect(activeRunwayError(state)).toContain('Unable to load current release case: case endpoint failed');
  });

  it('keeps a successful null current-case response as a valid ready state', () => {
    const results: InitialLoadResults = [
      fulfilled({ model: 'demo' }),
      fulfilled({ ok: true }),
      fulfilled(null)
    ];

    const state = reduceRunwayErrors(initialRunwayErrorState, {
      type: 'initialization-completed',
      results
    });

    expect(activeRunwayError(state)).toBeNull();
  });
});
