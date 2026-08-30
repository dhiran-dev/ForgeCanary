import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import { loadCase, loadConfig, loadCurrentCase, loadHealth } from '../api';
import type { ForgeCanaryCase, HealthState, PublicConfig } from '../types';
import ReleaseRunwayLayeredScene from './ReleaseRunwayLayeredScene';
import ReleaseRunwaySections from './ReleaseRunwaySections';
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
  const [error, setError] = useState<string | null>(null);
  const [sceneReady, setSceneReady] = useState(false);
  const refreshTimer = useRef<number | null>(null);
  const reducedMotion = useReducedMotion();

  const refreshCase = useCallback(async (caseId?: string) => {
    const next = caseId ? await loadCase(caseId) : await loadCurrentCase();
    setCurrentCase(next);
    return next;
  }, []);

  useEffect(() => {
    document.documentElement.classList.add('dark');
    Promise.allSettled([loadConfig(), loadHealth(), loadCurrentCase()]).then(results => {
      const [configResult, healthResult, caseResult] = results;
      if (configResult.status === 'fulfilled') setConfig(configResult.value);
      else setError(configResult.reason instanceof Error ? configResult.reason.message : String(configResult.reason));
      if (healthResult.status === 'fulfilled') setHealth(healthResult.value);
      if (caseResult.status === 'fulfilled') setCurrentCase(caseResult.value);
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
        void refreshCase(caseId).catch(caught => setError(caught instanceof Error ? caught.message : String(caught)));
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
  const servicesReady = Boolean(config && health?.ok);

  const readyScene = useCallback(() => setSceneReady(true), []);
  const statusLabel = error ? 'Replay system standing by' : view.label;
  const statusDetail = error ? 'Release remains untouched' : view.detail;
  const liveLabel = error
    ? 'LIVE CHECK STOPPED SAFELY'
    : view.isRunning
      ? 'LIVE CHECK IN PROGRESS'
      : view.phase === 'complete'
        ? 'LIVE CHECK COMPLETE'
        : 'LIVE RELEASE CHECK READY';

  return (
    <div className={`runway-page runway-phase-${view.phase}`}>
      <header className="runway-nav">
        <a className="runway-brand" href="/runway" aria-label="ForgeCanary home">ForgeCanary</a>
        <div className="runway-nav-actions">
          <div className={`runway-connection ${servicesReady ? 'online' : ''}`}>
            <i />
            <span>{initializing ? 'CONNECTING TRUEFORGE' : servicesReady ? 'TRUEFORGE CONNECTED' : 'TRUEFORGE ATTENTION'}</span>
            {config?.model && <small>{config.model}</small>}
          </div>
          <span className="runway-nav-rule" aria-hidden="true" />
          <a className="runway-menu" href="/" aria-label="Open the live operator console"><i /><i /><i /></a>
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
          <a className="runway-scroll-cue" href="#how">
            <span>SCROLL BELOW</span>
            <i aria-hidden="true" />
          </a>
          <div
            className="runway-live-row"
            aria-live="polite"
            aria-label={`${liveLabel}. ${statusLabel}. ${statusDetail}`}
          >
            <span className="runway-play" aria-hidden="true"><i /></span>
            <div className="runway-live-status">
              <strong>{view.isRunning ? 'Live check in progress' : statusLabel}</strong>
              <div className="runway-meter" aria-hidden="true">
                {[0, 1, 2, 3].map(index => <i key={index} className={index <= view.phaseIndex ? 'active' : ''} />)}
              </div>
            </div>
            <span className="runway-live-divider" aria-hidden="true" />
            <div className="runway-live-summary">
              <span className="runway-target" aria-hidden="true"><i /></span>
              <code>
                <strong>{view.jobsReplayed} JOBS REPLAYED</strong>
                <b>{view.changesFound} CHANGE{view.changesFound === 1 ? '' : 'S'} FOUND</b>
              </code>
            </div>
          </div>
        </div>

        <section className={`runway-stage ${sceneReady ? 'scene-ready' : ''}`} aria-label="Live release compatibility check">
          <div className="runway-model-poster" role="img" aria-label="ForgeCanary release runway with Current, Replay, Upgrade, and Safe to Ship stages" />
          <ReleaseRunwayLayeredScene
            reducedMotion={reducedMotion}
            changesFound={view.changesFound}
            onReady={readyScene}
          />
          <div className="runway-stage-caption">
            <strong>
              {view.jobsReplayed} JOBS REPLAYED <em>/</em>{' '}
              <b>{view.phase === 'complete' ? 'SAFE TO SHIP' : `${view.changesFound} CHANGE${view.changesFound === 1 ? '' : 'S'} FOUND`}</b>
            </strong>
          </div>
        </section>

        <ol className="runway-steps" id="how">
          <li className="active"><strong>CURRENT</strong></li>
          <li className={view.phaseIndex >= 1 ? 'active' : ''}><strong>REPLAY</strong></li>
          <li className={`${view.phaseIndex >= 2 ? 'active' : ''} ${view.changesFound > 0 ? 'caught' : ''}`}><strong>UPGRADE</strong></li>
          <li className={`${view.phaseIndex >= 3 ? 'active' : ''} ${view.phase === 'complete' ? 'safe' : view.phase === 'blocked' || view.phase === 'failed' ? 'held' : ''}`}><strong>DECIDE</strong></li>
        </ol>
      </main>
      <ReleaseRunwaySections view={view} reducedMotion={reducedMotion} />
    </div>
  );
}
