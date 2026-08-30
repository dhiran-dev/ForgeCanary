export interface RunwayErrorState {
  initialization: string | null;
  refresh: string | null;
}

export type InitialLoadResults = readonly [
  PromiseSettledResult<unknown>,
  PromiseSettledResult<unknown>,
  PromiseSettledResult<unknown>
];

export type RunwayErrorAction =
  | { type: 'initialization-completed'; results: InitialLoadResults }
  | { type: 'refresh-failed'; reason: unknown }
  | { type: 'refresh-succeeded' };

const INITIAL_REQUEST_LABELS = [
  'configuration',
  'health status',
  'current release case'
] as const;

export const initialRunwayErrorState: RunwayErrorState = {
  initialization: null,
  refresh: null
};

function errorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}

function initializationError(results: InitialLoadResults): string | null {
  const failures = results.flatMap((result, index) =>
    result.status === 'rejected'
      ? [`Unable to load ${INITIAL_REQUEST_LABELS[index]}: ${errorMessage(result.reason)}`]
      : []
  );

  return failures.length > 0 ? failures.join('; ') : null;
}

export function reduceRunwayErrors(
  state: RunwayErrorState,
  action: RunwayErrorAction
): RunwayErrorState {
  switch (action.type) {
    case 'initialization-completed':
      return { ...state, initialization: initializationError(action.results) };
    case 'refresh-failed':
      return { ...state, refresh: errorMessage(action.reason) };
    case 'refresh-succeeded':
      return { ...state, refresh: null };
  }
}

export function activeRunwayError(state: RunwayErrorState): string | null {
  return state.initialization ?? state.refresh;
}
