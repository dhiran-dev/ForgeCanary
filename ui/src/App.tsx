import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ApprovalCard from '@/components/primitives/ApprovalCard';
import LoadingState from '@/components/primitives/LoadingState';
import TaskRows, { type TaskRow } from '@/components/primitives/TaskRows';
import ToolChips, { type ToolStep } from '@/components/primitives/ToolChips';
import {
  decide,
  loadCase,
  loadConfig,
  loadCurrentCase,
  loadHealth,
  resetDemo,
  retryApproval,
  startCase
} from './api';
import type { CaseJobRow, CaseStage, CaseTraceEvent, ForgeCanaryCase, HealthState, PublicConfig } from './types';

const ACTIVE_STAGES = new Set<CaseStage>([
  'preflight',
  'replaying_baseline',
  'replaying_candidate',
  'analyzing',
  'regression_detected',
  'proposing_repair',
  'awaiting_approval',
  'applying_repair',
  'verifying_repair'
]);

const STAGE_META: Record<CaseStage, { label: string; tone: string }> = {
  idle: { label: 'Ready', tone: 'neutral' },
  preflight: { label: 'Connecting', tone: 'working' },
  replaying_baseline: { label: 'Replaying current', tone: 'working' },
  replaying_candidate: { label: 'Replaying proposed', tone: 'working' },
  analyzing: { label: 'Agent analysis', tone: 'working' },
  regression_detected: { label: 'Regression found', tone: 'danger' },
  proposing_repair: { label: 'Preparing repair', tone: 'working' },
  awaiting_approval: { label: 'Awaiting human', tone: 'warning' },
  denied_verified: { label: 'Denied safely', tone: 'safe' },
  applying_repair: { label: 'Applying repair', tone: 'working' },
  verifying_repair: { label: 'Verifying repair', tone: 'working' },
  complete: { label: 'Safe to ship', tone: 'safe' },
  failed: { label: 'Stopped safely', tone: 'danger' }
};

function stageIndex(value: ForgeCanaryCase | null): number {
  if (!value) return -1;
  if (value.stage === 'complete') return 5;
  if (value.stage === 'denied_verified') return 4;
  if (value.stage === 'failed') return Math.max(0, stageIndex({ ...value, stage: value.error?.stage ?? 'preflight' }));
  if (value.stage === 'applying_repair' || value.stage === 'verifying_repair') return 4;
  if (value.stage === 'regression_detected' || value.stage === 'proposing_repair' || value.stage === 'awaiting_approval') return 3;
  if (value.stage === 'analyzing') return 2;
  if (value.stage === 'replaying_baseline' || value.stage === 'replaying_candidate') return 1;
  return 0;
}

function progressRows(value: ForgeCanaryCase | null): TaskRow[] {
  const current = stageIndex(value);
  const definitions = [
    ['connect', 'Connect TrueForge', '3 MCP connectors', ['Model and connectors', value?.model ?? 'Waiting']],
    ['replay', 'Replay successful work', '6 jobs × 2 versions', ['Current MCP → proposed MCP', `${value?.jobs.filter(row => row.candidate).length ?? 0}/6 compared`]],
    ['analyze', 'Audit the outcomes', 'Sandbox + subagents', ['Protocol contract', 'Independent business state']],
    ['approve', 'Review the repair', 'Human-controlled', ['TrueForge tool approval', 'Stale-state protection']],
    ['verify', 'Replay after repair', 'Fresh state', ['No cached result', `${value?.jobs.filter(row => row.repaired?.oracle.passed).length ?? 0}/6 verified`]]
  ] as const;

  return definitions.map(([key, label, amount, detail], index) => {
    let status: TaskRow['status'] = index < current ? 'done' : index === current ? 'running' : 'pending';
    if (value?.stage === 'complete') status = 'done';
    if (value?.stage === 'denied_verified') status = index < 4 ? 'done' : 'pending';
    if (value?.stage === 'failed' && index === current) status = 'failed';
    return {
      key,
      label,
      amount,
      status,
      step: index + 1,
      details: [
        { label: detail[0], meta: index < current || status === 'done' ? 'done' : 'queued' },
        { label: detail[1], meta: status === 'running' ? 'active' : status === 'done' ? 'verified' : '—' }
      ]
    };
  });
}

function traceIcon(event: CaseTraceEvent): ToolStep['icon'] {
  if (event.type.includes('thread') || event.type.includes('model') || event.type.includes('analysis')) return 'think';
  if (event.type.includes('tool') || event.type.includes('approval')) return 'run';
  if (event.type.includes('mcp') || event.type.includes('sandbox')) return 'read';
  return 'write';
}

function traceSteps(events: CaseTraceEvent[]): ToolStep[] {
  return events.slice(-9).map(event => ({
    icon: traceIcon(event),
    label: event.title,
    chip: event.type,
    mono: true,
    detailMono: false,
    detail: [{ text: event.detail ?? `${event.source === 'trueforge' ? 'TrueForge' : 'ForgeCanary'} event persisted` }]
  }));
}

function short(value: string | undefined, length = 9): string {
  return value ? `${value.slice(0, length)}…` : '—';
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(value));
}

function lotCopy(lotId: string | null | undefined): { title: string; detail: string } {
  if (lotId === 'LOT-COLD-EARLY') return { title: 'Expires Sep 05', detail: 'Correct · oldest eligible stock ships first' };
  if (lotId === 'LOT-COLD-CHEAP') return { title: 'Expires Dec 01', detail: 'Wrong · cheaper stock was chosen instead' };
  if (!lotId) return { title: 'Waiting…', detail: 'External-state check pending' };
  return { title: lotId.replace(/^LOT-/, '').replaceAll('-', ' '), detail: 'Reservation exists for the ordered quantity' };
}

function responseCopy(row: CaseJobRow | undefined, version: 'baseline' | 'candidate'): string {
  const result = row?.[version]?.toolResponse;
  if (!result) return 'Waiting for tool response';
  const quantity = Number(result.quantity ?? row.quantity);
  return `${String(result.status ?? 'reserved')} · ${quantity} ${quantity === 1 ? 'unit' : 'units'}`;
}

function quantityCopy(quantity: number): string {
  return `${quantity} ${quantity === 1 ? 'unit' : 'units'}`;
}

function ErrorNotice({ message }: { message: string }) {
  return (
    <div className="error-notice" role="alert">
      <span>!</span>
      <div><strong>ForgeCanary stopped safely</strong><p>{message}</p></div>
    </div>
  );
}

function OutcomeChip({ state }: { state: 'waiting' | 'pass' | 'fail' | 'fixed' }) {
  const label = { waiting: 'Queued', pass: 'Correct', fail: 'Wrong batch', fixed: 'Verified' }[state];
  return <span className={`outcome-chip ${state}`}><i></i>{label}</span>;
}

export default function App() {
  const [config, setConfig] = useState<PublicConfig | null>(null);
  const [health, setHealth] = useState<HealthState | null>(null);
  const [currentCase, setCurrentCase] = useState<ForgeCanaryCase | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refreshTimer = useRef<number | null>(null);

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
    if (!currentCase || !ACTIVE_STAGES.has(currentCase.stage)) return;
    const caseId = currentCase.id;
    const source = new EventSource(`/api/cases/${encodeURIComponent(caseId)}/events?after=${currentCase.sequence}`);
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

  const begin = async () => {
    setBusy(true);
    setError(null);
    try {
      if (currentCase && ['complete', 'denied_verified', 'failed'].includes(currentCase.stage)) await resetDemo();
      setCurrentCase(await startCase());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  };

  const requestAgain = async () => {
    if (!currentCase) return;
    setBusy(true);
    setError(null);
    try {
      setCurrentCase(await retryApproval(currentCase.id));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  };

  const submitDecision = async (answers: Record<number, number[]>) => {
    if (!currentCase) return;
    const selected = answers[0]?.[0];
    if (selected !== 0 && selected !== 1) return;
    setBusy(true);
    setError(null);
    try {
      setCurrentCase(await decide(currentCase.id, selected === 0 ? 'deny' : 'allow'));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      await refreshCase(currentCase.id).catch(() => undefined);
    } finally {
      setBusy(false);
    }
  };

  const heroRow = useMemo(
    () => currentCase?.jobs.find(row => row.candidate && !row.candidate.oracle.passed) ?? currentCase?.jobs[0],
    [currentCase?.jobs]
  );
  const taskRows = useMemo(() => progressRows(currentCase), [currentCase]);
  const tools = useMemo(() => traceSteps(currentCase?.events ?? []), [currentCase?.events]);
  const stage = currentCase?.stage ?? 'idle';
  const meta = STAGE_META[stage];
  const active = ACTIVE_STAGES.has(stage);
  const compared = currentCase?.jobs.filter(row => row.candidate).length ?? 0;
  const candidatePassed = currentCase?.jobs.filter(row => row.candidate?.oracle.passed).length ?? 0;
  const repairedPassed = currentCase?.jobs.filter(row => row.repaired?.oracle.passed).length ?? 0;
  const baselineLot = lotCopy(heroRow?.baseline?.oracle.actualLotId);
  const candidateLot = lotCopy(heroRow?.candidate?.oracle.actualLotId);
  const hasRegression = currentCase?.jobs.some(row => row.candidate && !row.candidate.oracle.passed) ?? false;
  const priorDenial = currentCase?.approvalHistory.some(item => item.status === 'denied') ?? false;
  const servicesReady = health?.ok ?? false;

  let primaryLabel = 'Run the canary';
  if (busy) primaryLabel = 'Working…';
  else if (active) primaryLabel = meta.label;
  else if (stage === 'denied_verified') primaryLabel = 'Request approval again';
  else if (stage === 'complete') primaryLabel = 'Run a fresh case';
  else if (stage === 'failed') primaryLabel = 'Reset and retry';

  return (
    <div className="forge-app">
      <header className="topbar">
        <a className="brand" href="/" aria-label="ForgeCanary home">
          <svg aria-hidden="true" viewBox="0 0 42 42"><path d="M4 4h34v34H4zM12 13h18M12 21h12M12 29h18" /><path d="m27 17 7 4-7 4" /></svg>
          <span>Forge<b>Canary</b></span>
        </a>
        <div className="runtime-status">
          <i className={servicesReady ? 'online' : ''}></i>
          <span>{initializing ? 'Connecting' : servicesReady ? 'TrueForge connected' : 'Service attention needed'}</span>
          <em>/</em>
          <small>{config?.model ?? 'model —'}</small>
        </div>
        <nav>
          <a href={config?.trueforgeUiUrl ?? 'http://localhost:8790'} target="_blank" rel="noreferrer">Open TrueForge ↗</a>
          {currentCase?.receipt && <a href={`/api/cases/${encodeURIComponent(currentCase.id)}/receipt`} download>Receipt ↓</a>}
        </nav>
      </header>

      <main className="workspace">
        <aside className="control-rail">
          <div className="rail-label"><span>RELEASE CASE</span><code>{currentCase ? short(currentCase.id, 11) : 'FC / NEW'}</code></div>
          <h1>Can this MCP upgrade ship?</h1>
          <p>Replay real agent work against both versions. Verify the business outcome—not only the tool transcript.</p>

          <button
            className={`primary-run ${active ? 'running' : ''}`}
            type="button"
            onClick={stage === 'denied_verified' ? requestAgain : begin}
            disabled={busy || active || initializing || !servicesReady}
          >
            <span>01</span>
            <strong>{primaryLabel}</strong>
            {busy || active ? <LoadingState label="" variant="Drive" /> : <b aria-hidden="true">→</b>}
          </button>

          <div className="sequence-heading"><span>RUN SEQUENCE</span><span>{Math.min(5, Math.max(0, stageIndex(currentCase)))} / 5</span></div>
          <div className="sequence-component">
            <TaskRows variant="List" rows={taskRows} labels={{ completed: 'Done', failed: 'Stopped' }} />
          </div>

          <div className="capability-heading"><span>TRUEFORGE CAPABILITIES</span><span>LIVE</span></div>
          <div className="capabilities">
            <div className="ready"><i></i><span><strong>MCP tools</strong><small>{config?.connectors.length ?? 3} connectors</small></span></div>
            <div className={currentCase?.capabilities.sandboxCreated ? 'ready' : ''}><i></i><span><strong>Sandbox</strong><small>{currentCase?.capabilities.sandboxCreated ? 'observed' : 'waiting'}</small></span></div>
            <div className={(currentCase?.capabilities.subagents.length ?? 0) > 0 ? 'ready' : ''}><i></i><span><strong>Subagents</strong><small>{currentCase?.capabilities.subagents.length ?? 0} observed</small></span></div>
            <div className={stage === 'awaiting_approval' || currentCase?.approval.status === 'allowed' ? 'ready' : ''}><i></i><span><strong>Approval</strong><small>{stage === 'awaiting_approval' ? 'paused' : 'armed'}</small></span></div>
          </div>
        </aside>

        <section className="comparison-pane">
          <div className="pane-heading">
            <div><span>SEMANTIC REPLAY</span><h2>Same answer. Different reality.</h2></div>
            <div className={`stage-pill ${meta.tone}`}><i></i>{meta.label}</div>
          </div>

          {error && <ErrorNotice message={error} />}
          {!currentCase ? (
            <div className="empty-stage">
              <div className="radar" aria-hidden="true"><span></span><span></span><span></span><i></i></div>
              <div><span>DEMO PATH · 2–3 MINUTES</span><h3>One click becomes a release decision.</h3><p>Six successful jobs go through TrueForge. One invisible behavior change is exposed before it reaches users.</p></div>
            </div>
          ) : (
            <>
              <div className="protocol-summary">
                <div><span>WHAT THE AGENT SAW</span><strong>{compared === 0 ? 'Waiting for both versions' : `${compared} matching tool transcripts`}</strong></div>
                <div className="protocol-chips">
                  <span className={currentCase.schema?.equal ? 'pass' : ''}>Schema {currentCase.schema ? (currentCase.schema.equal ? 'same' : 'changed') : '—'}</span>
                  <span className={heroRow?.protocolEqual ? 'pass' : ''}>Arguments {heroRow?.protocolEqual ? 'same' : '—'}</span>
                  <span className={heroRow?.protocolEqual ? 'pass' : ''}>Response {heroRow?.protocolEqual ? 'same' : '—'}</span>
                </div>
              </div>

              <div className="version-grid">
                <article className="version-card">
                  <header><span>CURRENT MCP</span><b>v1</b></header>
                  <div className="call-line"><span>reserve_inventory</span><code>{heroRow ? `${heroRow.orderId} · ${quantityCopy(heroRow.quantity)}` : 'waiting'}</code></div>
                  <div className="response-line"><span>TOOL RESPONSE</span><strong>{responseCopy(heroRow, 'baseline')}</strong></div>
                  <div className="reality-line"><span>ACTUAL BATCH</span><strong>{baselineLot.title}</strong><small>{baselineLot.detail}</small></div>
                </article>
                <div className="same-marker"><strong>=</strong><span>SAME<br />PROTOCOL</span></div>
                <article className={`version-card candidate ${hasRegression ? 'has-failure' : ''}`}>
                  <header><span>PROPOSED MCP</span><b>v2</b></header>
                  <div className="call-line"><span>reserve_inventory</span><code>{heroRow ? `${heroRow.orderId} · ${quantityCopy(heroRow.quantity)}` : 'waiting'}</code></div>
                  <div className="response-line"><span>TOOL RESPONSE</span><strong>{responseCopy(heroRow, 'candidate')}</strong></div>
                  <div className="reality-line"><span>ACTUAL BATCH</span><strong>{candidateLot.title}</strong><small>{candidateLot.detail}</small></div>
                </article>
              </div>

              <div className={`divergence ${hasRegression ? 'found' : ''}`}>
                <b>≠</b>
                <div><span>WHAT ACTUALLY HAPPENED</span><strong>{hasRegression ? 'The upgrade silently broke inventory rotation.' : 'Independent state check in progress'}</strong><p>{hasRegression ? 'Both tools said “reserved.” The proposed version chose cheaper stock expiring three months later, leaving the older medicine to expire.' : currentCase.summary}</p></div>
                <aside><span>BUSINESS RULE</span><strong>Ship the batch that expires first</strong><small>FEFO · First Expired, First Out</small></aside>
              </div>

              {stage === 'denied_verified' && (
                <div className="denial-proof">
                  <span className="proof-check">✓</span>
                  <div><span>DENIAL PROOF</span><strong>“No” changed nothing.</strong><p>Adapter and candidate state hashes are byte-for-byte unchanged.</p></div>
                  <code>{short(currentCase.approval.adapterStateHashAfter, 16)}</code>
                  <button type="button" onClick={requestAgain} disabled={busy}>Request the repair again →</button>
                </div>
              )}

              {stage === 'complete' && (
                <div className="completion-proof">
                  <span>✓</span><div><small>RELEASE VERDICT</small><strong>Approved repair verified · {repairedPassed}/6 outcomes correct</strong></div><a href={`/api/cases/${encodeURIComponent(currentCase.id)}/receipt`} download>Download receipt ↓</a>
                </div>
              )}

              <div className="jobs-block">
                <div className="jobs-heading"><span>HISTORICAL JOB CORPUS</span><span>{compared}/6 compared · {candidatePassed}/6 candidate-correct</span></div>
                <div className="job-table" role="table" aria-label="Historical replay results">
                  <div className="job-row job-header" role="row"><span>Job</span><span>Workload</span><span>Protocol</span><span>Business outcome</span><span>After repair</span></div>
                  {currentCase.jobs.map(row => (
                    <div className={`job-row ${row.candidate && !row.candidate.oracle.passed ? 'hero-failure' : ''}`} role="row" key={row.orderId}>
                      <strong>{row.orderId}</strong>
                      <span><b>{row.productLabel}</b><small>{quantityCopy(row.quantity)}</small></span>
                      <OutcomeChip state={row.protocolEqual ? 'pass' : 'waiting'} />
                      <OutcomeChip state={!row.candidate ? 'waiting' : row.candidate.oracle.passed ? 'pass' : 'fail'} />
                      <OutcomeChip
                        state={
                          !row.repaired
                            ? 'waiting'
                            : row.repaired.oracle.passed && row.repairedProtocolEqual
                              ? 'fixed'
                              : 'fail'
                        }
                      />
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </section>

        <aside className="trace-rail">
          <div className="trace-heading"><div><span>LIVE FLIGHT RECORDER</span><h2>TrueForge trace</h2></div><b>{currentCase?.events.length ?? 0} events</b></div>
          <div className="trace-legend"><span><i className="agent"></i>Agent</span><span><i className="tool"></i>Tool</span><span><i className="system"></i>System</span></div>
          <div className="trace-tools">
            {tools.length > 0 ? (
              <ToolChips
                key={`${currentCase?.id}-${currentCase?.events.length ?? 0}`}
                steps={tools}
                diffs={[]}
                labels={{ header: `${currentCase?.events.length ?? 0} persisted events`, more: '' }}
              />
            ) : (
              <div className="trace-empty"><span>00</span><div><strong>No run yet</strong><p>Tool calls, sandbox work, and subagents will appear here.</p></div></div>
            )}
          </div>
          <ol className="raw-events">
            {[...(currentCase?.events ?? []).slice(-8)].reverse().map(event => (
              <li key={event.id}><time>{formatTime(event.createdAt)}</time><i className={event.source}></i><span><strong>{event.title}</strong><small>{event.type}</small></span></li>
            ))}
          </ol>
          <footer><span>{currentCase?.sessionIds.length ?? 0} TrueForge sessions</span><span>{currentCase?.capabilities.subagents.length ?? 0} subagents</span></footer>
        </aside>
      </main>

      {stage === 'awaiting_approval' && currentCase && (
        <div className="approval-overlay" role="dialog" aria-modal="true" aria-labelledby="approval-heading">
          <div className="approval-backdrop"></div>
          <section className="approval-window">
            <header><div><span><i></i>TRUEFORGE PAUSED THE WRITE</span><h2 id="approval-heading">A human decides what changes.</h2></div><code>SESSION {short(currentCase.approval.sessionId, 12)}</code></header>
            <div className="approval-layout">
              <div className="approval-context">
                <span>PROPOSED TOOL CALL</span><code>activate_compatibility_adapter</code>
                <dl>
                  <div><dt>Change</dt><dd>Restore “expires first” for perishable inventory</dd></div>
                  <div><dt>Scope</dt><dd>Only reserve_inventory defaults</dd></div>
                  <div><dt>Candidate code</dt><dd>Untouched</dd></div>
                  <div><dt>Reversible</dt><dd>Yes</dd></div>
                </dl>
                <ul><li><b>01</b><span><strong>Fresh evidence</strong>Six jobs, one verified regression</span></li><li><b>02</b><span><strong>Stale-state guard</strong>Reject if state changed since analysis</span></li><li><b>03</b><span><strong>After-state proof</strong>Hash every result independently</span></li></ul>
              </div>
              <div className="beautiful-approval">
                {busy ? (
                  <div className="decision-loading"><LoadingState label="TrueForge is processing the decision" variant="Orbit" /><p>The UI will update from persisted session events.</p></div>
                ) : (
                  <ApprovalCard
                    key={`${currentCase.id}-${currentCase.approval.sessionId}-${currentCase.approvalHistory.length}`}
                    questions={[{
                      q: priorDenial ? 'The denial is proven. Apply the scoped repair now?' : 'What should TrueForge do with this repair?',
                      type: 'radio',
                      options: ['Deny — prove zero mutation', 'Allow — apply, then replay all six jobs']
                    }]}
                    labels={{ skip: 'Keep paused', continue: 'Submit decision', send: 'Submit decision', sentMessage: 'Decision sent to TrueForge' }}
                    autoAdvanceRadio={false}
                    resettable={false}
                    onSubmitted={submitDecision}
                  />
                )}
              </div>
            </div>
            <footer><p>{priorDenial ? 'The first denial is already proven. Choose Allow to complete the demo.' : 'Recommended demo path: deny first, prove zero mutation, then request and allow a fresh call.'}</p><span>Human-in-the-loop · TrueForge native approval</span></footer>
          </section>
        </div>
      )}
    </div>
  );
}
