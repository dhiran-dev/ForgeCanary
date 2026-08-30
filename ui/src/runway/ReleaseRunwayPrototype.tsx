import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState
} from 'react';
import { loadCase, loadConfig, loadCurrentCase, loadHealth } from '../api';
import type { ForgeCanaryCase, HealthState, PublicConfig } from '../types';
import ReleaseRunwayLayeredScene from './ReleaseRunwayLayeredScene';
import ReleaseRunwaySections from './ReleaseRunwaySections';
import {
  activeRunwayError,
  initialRunwayErrorState,
  reduceRunwayErrors
} from './runway-errors';
import { deriveRunwayView, isLiveCase } from './runway-state';
import './release-runway.css';

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  return reduced;
}

export default function ReleaseRunwayPrototype() {
  const [config, setConfig] = useState<PublicConfig | null>(null);
  const [health, setHealth] = useState<HealthState | null>(null);
  const [currentCase, setCurrentCase] = useState<ForgeCanaryCase | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [errors, dispatchError] = useReducer(reduceRunwayErrors, initialRunwayErrorState);
  const [sceneReady, setSceneReady] = useState(false);
  const refreshTimer = useRef<number | null>(null);
  const reducedMotion = useReducedMotion();

  const refreshCase = useCallback(async (caseId?: string) => {
    try {
      const next = caseId ? await loadCase(caseId) : await loadCurrentCase();
      setCurrentCase(next);
      dispatchError({ type: 'refresh-succeeded' });
      return next;
    } catch (caught) {
      dispatchError({ type: 'refresh-failed', reason: caught });
      throw caught;
    }
  }, []);

  useEffect(() => {
    document.documentElement.classList.add('dark');
    Promise.allSettled([loadConfig(), loadHealth(), loadCurrentCase()]).then(results => {
      const [configResult, healthResult, caseResult] = results;
      if (configResult.status === 'fulfilled') setConfig(configResult.value);
      if (healthResult.status === 'fulfilled') setHealth(healthResult.value);
      if (caseResult.status === 'fulfilled') setCurrentCase(caseResult.value);
      dispatchError({ type: 'initialization-completed', results });
      setInitializing(false);
    });
  }, []);

  useEffect(() => {
    if (!currentCase || !isLiveCase(currentCase)) return;
    const caseId = currentCase.id;
    const lastEventId = currentCase.events.at(-1)?.id ?? 0;
    const source = new EventSource(`/api/cases/${encodeURIComponent(caseId)}/events?after=${lastEventId}`);
    const scheduleRefresh = () => {
      if (refreshTimer.current !== null) window.clearTimeout(refreshTimer.current);
      refreshTimer.current = window.setTimeout(() => {
        void refreshCase(caseId).catch(() => undefined);
      }, 100);
    };
    source.addEventListener('trace', scheduleRefresh);
    const poll = window.setInterval(scheduleRefresh, 1_500);
    return () => {
      source.close();
      window.clearInterval(poll);
      if (refreshTimer.current !== null) window.clearTimeout(refreshTimer.current);
    };
  }, [currentCase?.id, currentCase?.stage, refreshCase]);

  const view = useMemo(() => deriveRunwayView(currentCase), [currentCase]);
  const error = activeRunwayError(errors);
  const servicesReady = Boolean(config && health?.ok && !error);

  const readyScene = useCallback(() => setSceneReady(true), []);

  return (
    <div className={`runway-page runway-phase-${view.phase}`}>
      <header className="runway-nav">
        <a className="runway-brand" href="/runway" aria-label="ForgeCanary home">ForgeCanary</a>
        <div className="runway-nav-actions">
          <div
            className={`runway-connection ${servicesReady ? 'online' : ''}`}
            role="status"
            aria-live="polite"
          >
            <i />
            <span>{initializing ? 'CONNECTING TRUEFORGE' : servicesReady ? 'TRUEFORGE CONNECTED' : 'TRUEFORGE ATTENTION'}</span>
            {(error || config?.model) && (
              <small className={error ? 'is-error' : ''} title={error ?? undefined}>{error ?? config?.model}</small>
            )}
          </div>
        </div>
      </header>

      <main className="runway-hero">
        <div className="runway-copy">
          <span className="runway-eyebrow">LIVE RELEASE CHECK</span>
          <h1>
            Test the upgrade on<span className="runway-title-break"><br /></span>
            yesterday’s work before it<span className="runway-title-break"><br /></span>
            touches tomorrow.
          </h1>
          <p>ForgeCanary replays the same jobs, checks what really happened, and stops silent changes.</p>
          <a className="runway-scroll-cue" href="#replay">
            <span>SCROLL BELOW</span>
            <i aria-hidden="true" />
          </a>
        </div>

        <section className={`runway-stage ${sceneReady ? 'scene-ready' : ''}`} aria-label="Live release compatibility check">
          <div className="runway-model-poster" role="img" aria-label="ForgeCanary release runway with Current, Replay, Upgrade, and Safe to Ship stages" />
          <ReleaseRunwayLayeredScene
            reducedMotion={reducedMotion}
            changesFound={view.changesFound}
            onReady={readyScene}
          />
        </section>

        <ol className="runway-steps" id="how">
          <li className="active"><strong>CURRENT</strong></li>
          <li className={view.phaseIndex >= 1 ? 'active' : ''}><strong>REPLAY</strong></li>
          <li className={`${view.phaseIndex >= 2 ? 'active' : ''} ${view.changesFound > 0 ? 'caught' : ''}`}><strong>UPGRADE</strong></li>
          <li className={`${view.phaseIndex >= 3 ? 'active' : ''} ${view.phase === 'complete' ? 'safe' : view.phase === 'blocked' || view.phase === 'failed' ? 'held' : ''}`}><strong>DECIDE</strong></li>
        </ol>
      </main>
      <ReleaseRunwaySections
        view={view}
        reducedMotion={reducedMotion}
        illustrative={!currentCase && !error}
        trueforgeUrl={config?.trueforgeUiUrl}
      />
    </div>
  );
}
