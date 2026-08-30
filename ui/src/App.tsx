import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { decide, loadCase, loadConfig, loadCurrentCase, loadHealth, resetDemo, retryApproval, returnToEmptyState, startCase } from './api';
import { ForgeCanaryBrand } from './components/ForgeCanaryBrand';
import { GlassConduit } from './components/GlassConduit';
import { GlossyWorkerTask } from './components/GlossyWorkerTask';
import { MachineChassis } from './components/MachineChassis';
import type { CaseJobRow, CaseStage, ForgeCanaryCase, HealthState, PublicConfig } from './types';

const ACTIVE_STAGES = new Set<CaseStage>(['preflight', 'replaying_baseline', 'replaying_candidate', 'analyzing', 'regression_detected', 'proposing_repair', 'awaiting_approval', 'applying_repair', 'verifying_repair']);
const PHASES = ['Setup', 'Replay', 'Compare', 'Decide', 'Proof'] as const;

function phaseIndex(stage: CaseStage): number {
  if (stage === 'idle' || stage === 'preflight') return 0;
  if (stage === 'replaying_baseline' || stage === 'replaying_candidate') return 1;
  if (stage === 'analyzing' || stage === 'regression_detected') return 2;
  if (stage === 'proposing_repair' || stage === 'awaiting_approval' || stage === 'applying_repair') return 3;
  return 4;
}

function short(value?: string, size = 10): string { return value ? `${value.slice(0, size)}${value.length > size ? '…' : ''}` : '—'; }
function time(value: string): string { return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(value)); }

function Icon({ name }: { name: 'agent' | 'run' | 'worker' | 'activity' | 'proof' | 'history' | 'tool' }) {
  const paths: Record<typeof name, ReactNode> = {
    agent: <><path d="M7 7h10v10H7z"/><path d="M10 4h4M10 20h4M4 10v4M20 10v4"/><circle cx="11" cy="12" r="1"/><circle cx="15" cy="12" r="1"/></>,
    run: <><rect x="4" y="5" width="16" height="14" rx="2"/><path d="M8 9h8M8 13h5M16 13l2 2-2 2"/></>,
    worker: <><path d="M12 3 4 7v10l8 4 8-4V7z"/><path d="m4 7 8 4 8-4M12 11v10"/></>,
    activity: <path d="M3 12h4l2-6 4 12 2-6h6"/>,
    proof: <><path d="M5 3h11l3 3v15H5z"/><path d="M16 3v4h4M8 13l2 2 5-5"/></>,
    history: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2M3 12H1"/></>,
    tool: <><path d="m14 6 4-3 3 3-3 4M10 14l-5 5M8 12l4 4"/><path d="M5 15 2 12l6-6 3 3"/></>
  };
  return <svg className="icon" aria-hidden="true" viewBox="0 0 24 24">{paths[name]}</svg>;
}

function StatusDot({ status }: { status: string }) { return <span className={`status-dot is-${status}`} aria-hidden="true"/>; }

function eventStatus(type: string): string {
  if (type.includes('approval_required') || type.includes('regression')) return 'held';
  if (type.includes('done') || type.includes('verified') || type.includes('response') || type.includes('complete')) return 'verified';
  return 'running';
}

type MachinePoint = { x: number; y: number };
type MachineGeometry = {
  width: number;
  height: number;
  savedOutput?: MachinePoint;
  parentInput?: MachinePoint;
  parentOutput?: MachinePoint;
  workers: Record<string, MachinePoint>;
};

function roundedMachineRoute(start: MachinePoint, end: MachinePoint, busX: number): string {
  const verticalDirection = end.y < start.y ? -1 : 1;
  const radius = Math.min(12, Math.abs(end.y - start.y) / 2, Math.max(0, busX - start.x) / 2);
  if (radius < 1) return `M ${start.x} ${start.y} H ${end.x}`;
  return `M ${start.x} ${start.y} H ${busX - radius} Q ${busX} ${start.y} ${busX} ${start.y + verticalDirection * radius} V ${end.y - verticalDirection * radius} Q ${busX} ${end.y} ${busX + radius} ${end.y} H ${end.x}`;
}

function DetailPanel({ value, selected, busy, onDecision, onRetry }: { value: ForgeCanaryCase | null; selected?: CaseJobRow; busy: boolean; onDecision: (decision: 'deny' | 'allow') => void; onRetry: () => void }) {
  const stage = value?.stage ?? 'idle';
  const events = value?.events.slice(-7).reverse() ?? [];
  const failed = value?.jobs.find(job => job.finalVerdict === 'regression');

  if (stage === 'awaiting_approval' && value) return <aside className="context-panel approval-panel" aria-live="polite">
    <div className="panel-kicker"><Icon name="tool"/> Human checkpoint</div><h2>Repair is ready.<br/>Nothing has changed.</h2>
    <p>TrueForge paused the adapter write inside this release run. Review its exact scope, then deny or allow.</p>
    <div className="scope-card"><span>PROPOSED TOOL CALL</span><strong><code>{value.approval.toolName ?? 'activate_compatibility_adapter'}</code></strong><dl><div><dt>Adapter</dt><dd>{String(value.approval.arguments?.adapter_id ?? '—')}</dd></div><div><dt>Scope</dt><dd>{String(value.approval.arguments?.scope ?? '—')}</dd></div><div><dt>Candidate hash</dt><dd><code>{short(String(value.approval.arguments?.candidate_schema_hash ?? ''), 14)}</code></dd></div><div><dt>Reversible</dt><dd>Yes</dd></div></dl></div>
    <div className="approval-actions"><button className="button secondary" disabled={busy} onClick={() => onDecision('deny')}>Deny & prove no change</button><button className="button primary" disabled={busy} onClick={() => onDecision('allow')}>Allow & verify repair</button></div>
    <small className="panel-note">Decision resumes this same parent workflow.</small>
  </aside>;

  if (stage === 'denied_verified' && value) return <aside className="context-panel proof-panel">
    <div className="panel-kicker"><Icon name="proof"/> Denial proof</div><div className="verdict-mark">✓</div><h2>“No” changed nothing.</h2><p>Adapter and candidate hashes are unchanged. The release run is still open and can continue.</p>
    <div className="hash-row"><span>BEFORE</span><code>{short(value.approval.adapterStateHashBefore, 16)}</code></div><div className="hash-row"><span>AFTER</span><code>{short(value.approval.adapterStateHashAfter, 16)}</code></div>
    <button className="button primary" disabled={busy} onClick={onRetry}>Request repair again</button>
  </aside>;

  if (stage === 'complete' && value) {
    const passed = value.jobs.filter(job => job.repaired?.oracle.passed).length;
    return <aside className="context-panel proof-panel"><div className="panel-kicker"><Icon name="proof"/> Release proof</div><div className="verdict-mark">✓</div><h2>Safe to ship.</h2><p>The approved adapter was applied and all six jobs were replayed from fresh state.</p><div className="metric-pair"><div><strong>{passed}/6</strong><span>outcomes correct</span></div><div><strong>1</strong><span>scoped mutation</span></div></div><a className="button primary" href={`/api/cases/${encodeURIComponent(value.id)}/receipt`} download>Download release receipt</a></aside>;
  }

  if (stage === 'failed' && value) return <aside className="context-panel failure-panel" role="alert"><div className="panel-kicker"><Icon name="proof"/> Safe stop</div><div className="failure-mark">!</div><h2>Release check stopped.</h2><p>{value.error?.message ?? 'No unapproved change was applied.'}</p><div className="hash-row"><span>FAILED AT</span><code>{value.error?.stage ?? 'unknown'}</code></div></aside>;

  return <aside className="context-panel">
    <div className="panel-kicker"><Icon name="activity"/> {selected ? 'Worker inspection' : 'Live activity'}</div>
    {selected ? (() => { const latest = selected.repaired ?? selected.candidate ?? selected.baseline; return <><div className="selected-worker"><StatusDot status={selected.workerStatus}/><div><span>{selected.replayJobId}</span><h2>{selected.orderId}</h2></div></div><p>{selected.currentTask}</p><div className="inspection-grid"><div><span>CURRENT MCP</span><strong>{selected.baseline ? 'Captured' : 'Waiting'}</strong></div><div><span>LATEST OUTCOME</span><strong>{latest ? (latest.oracle.passed ? 'Correct' : 'Regression') : 'Waiting'}</strong></div><div><span>TOOL</span><code>{latest?.toolName ?? 'reserve_inventory'}</code></div><div><span>RESULT</span><code>{latest ? short(JSON.stringify(latest.toolResponse), 46) : 'Awaiting response'}</code></div></div></>; })() : <><h2>{failed ? 'One worker is held.' : value?.summary ?? 'Ready for a release check.'}</h2><p>{failed ? `${failed.orderId} returned the same protocol response but changed the real inventory outcome.` : 'Start one parent run. The saved agent dispatches six isolated replay workers and closes each job with evidence.'}</p></>}
    <ol className="activity-log" aria-live="polite">{events.length ? events.map(event => <li key={event.id}><time>{time(event.createdAt)}</time><StatusDot status={eventStatus(event.type)}/><span><strong>{event.title}</strong><small>{event.detail ?? event.type}</small></span></li>) : <li className="empty-log">Activity will appear here in real time.</li>}</ol>
  </aside>;
}

function ParentRunInspectorModal({ value, jobs, onClose }: { value: ForgeCanaryCase | null; jobs: CaseJobRow[]; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();
    return () => { if (dialog.open) dialog.close(); };
  }, []);

  return <dialog
    ref={dialogRef}
    className="parent-run-modal"
    aria-labelledby="parent-run-modal-title"
    onClose={onClose}
    onClick={event => { if (event.target === event.currentTarget) event.currentTarget.close(); }}
  >
    <header className="parent-run-modal-header">
      <div><span className="eyebrow">PARENT RELEASE RUN</span><h2 id="parent-run-modal-title">{value?.historyTitle ?? 'Release check history'}</h2><p>{value ? `${jobs.length} replay jobs · ${value.events.length} persisted events · ${value.releaseHistory?.length ?? 0} prior checks` : 'One meaningful entry per release check'}</p></div>
      <button className="parent-run-modal-close" type="button" aria-label="Close parent run inspector" onClick={() => dialogRef.current?.close()} autoFocus>×</button>
    </header>
    <div className="parent-run-modal-body">
      <div className="inspector-grid">{jobs.map(job => { const latest = job.repaired ?? job.candidate ?? job.baseline; return <article key={job.replayJobId}><header><StatusDot status={job.workerStatus}/><strong>{job.orderId}</strong><span>{job.finalVerdict ?? 'queued'}</span></header><dl><div><dt>Replay job ID</dt><dd>{job.replayJobId}</dd></div><div><dt>Tool calls</dt><dd>{[job.baseline, job.candidate, job.repaired].filter(Boolean).length}</dd></div><div><dt>Tool</dt><dd>{latest?.toolName ?? '—'}</dd></div><div><dt>Final result</dt><dd>{job.currentTask}</dd></div></dl>{latest && <details className="job-payload"><summary>Arguments & result</summary><code>{JSON.stringify(latest.toolArguments)}</code><code>{JSON.stringify(latest.toolResponse)}</code></details>}</article>; })}{value && value.approvalHistory.length > 0 && <article className="approval-history"><header><StatusDot status="verified"/><strong>Approval history</strong><span>{value.approvalHistory.length} decisions</span></header>{value.approvalHistory.map((approval, index) => <p key={`${approval.status}-${index}`}><b>{approval.status}</b><code>{approval.toolName ?? 'activate_compatibility_adapter'}</code></p>)}</article>}</div>
    </div>
  </dialog>;
}

function EmptyWorkbench({ config, busy, servicesReady, onStart }: { config: PublicConfig | null; busy: boolean; servicesReady: boolean; onStart: () => void }) {
  return <section className="studio-empty-state" aria-labelledby="empty-state-title">
    <article className="machine-node saved-agent-machine empty-saved-agent" aria-label="Reusable saved agent configuration">
      <MachineChassis ports={['right']}/>
      <div className="machine-copy saved-agent-copy"><div className="module-label"><Icon name="agent"/> SAVED AGENT</div><div className="agent-core"><span className="agent-glyph"><Icon name="agent"/></span><div><h2>{config?.savedAgentName ?? 'ForgeCanary Replay Worker'}</h2><p>Reusable configuration</p></div></div><dl className="module-spec"><div><dt>MODEL</dt><dd>{short(config?.model, 20)}</dd></div><div><dt>REASONING</dt><dd>low</dd></div><div><dt>CONNECTORS</dt><dd>{config?.connectors.length ?? 3} armed</dd></div><div><dt>APPROVAL</dt><dd>writes pause</dd></div></dl><div className="persistent-tag"><StatusDot status="verified"/> Preserved between runs</div></div>
    </article>
    <div className="empty-state-link" aria-hidden="true"><span/><i>READY</i><span/></div>
    <article className="empty-release-card">
      <div className="empty-state-mark"><Icon name="run"/></div>
      <span className="eyebrow">NO PARENT RUN</span>
      <h2 id="empty-state-title">Ready for a fresh release check.</h2>
      <p>The saved agent is configured. Starting creates one new parent session, then workers appear only as their replay jobs are dispatched.</p>
      <button className="button primary" disabled={busy || !servicesReady} onClick={onStart}>Start release check <span>→</span></button>
      <div className="empty-state-sequence"><span>01 FRESH PARENT</span><span>02 SIX REPLAYS</span><span>03 HUMAN DECISION</span><span>04 RECEIPT</span></div>
    </article>
  </section>;
}

export default function App() {
  const [config, setConfig] = useState<PublicConfig | null>(null);
  const [health, setHealth] = useState<HealthState | null>(null);
  const [currentCase, setCurrentCase] = useState<ForgeCanaryCase | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<string | null>(null);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [busy, setBusy] = useState(false); const [initializing, setInitializing] = useState(true); const [error, setError] = useState<string | null>(null);
  const refreshTimer = useRef<number | null>(null);
  const workbenchRef = useRef<HTMLElement | null>(null);
  const savedAgentRef = useRef<HTMLElement | null>(null);
  const parentControllerRef = useRef<HTMLElement | null>(null);
  const workerRefs = useRef(new Map<string, HTMLButtonElement>());
  const [machineGeometry, setMachineGeometry] = useState<MachineGeometry>({ width: 1540, height: 600, workers: {} });
  const refreshCase = useCallback(async (caseId?: string) => { const next = caseId ? await loadCase(caseId) : await loadCurrentCase(); setCurrentCase(next); return next; }, []);

  useEffect(() => { Promise.allSettled([loadConfig(), loadHealth(), loadCurrentCase()]).then(([a, b, c]) => { if (a.status === 'fulfilled') setConfig(a.value); else setError(a.reason instanceof Error ? a.reason.message : String(a.reason)); if (b.status === 'fulfilled') setHealth(b.value); if (c.status === 'fulfilled') setCurrentCase(c.value); setInitializing(false); }); }, []);
  useEffect(() => { if (!currentCase || !ACTIVE_STAGES.has(currentCase.stage)) return; const caseId = currentCase.id; const source = new EventSource(`/api/cases/${encodeURIComponent(caseId)}/events?after=${currentCase.sequence}`); const schedule = () => { if (refreshTimer.current) window.clearTimeout(refreshTimer.current); refreshTimer.current = window.setTimeout(() => void refreshCase(caseId).catch(caught => setError(String(caught))), 90); }; source.addEventListener('trace', schedule); const poll = window.setInterval(schedule, 1_500); return () => { source.close(); window.clearInterval(poll); if (refreshTimer.current) window.clearTimeout(refreshTimer.current); }; }, [currentCase?.id, currentCase?.stage, refreshCase]);
  useLayoutEffect(() => {
    const workbench = workbenchRef.current;
    const savedAgent = savedAgentRef.current;
    const parentController = parentControllerRef.current;
    if (!workbench || !savedAgent || !parentController) return;
    const measure = () => {
      const root = workbench.getBoundingClientRect();
      const side = (element: Element, edge: 'left' | 'right'): MachinePoint => {
        const rect = element.getBoundingClientRect();
        return {
          x: (edge === 'left' ? rect.left : rect.right) - root.left,
          y: rect.top + rect.height / 2 - root.top
        };
      };
      const workerPoints: Record<string, MachinePoint> = {};
      for (const [jobId, element] of workerRefs.current) workerPoints[jobId] = side(element, 'left');
      setMachineGeometry({
        width: root.width,
        height: root.height,
        savedOutput: side(savedAgent, 'right'),
        parentInput: side(parentController, 'left'),
        parentOutput: side(parentController, 'right'),
        workers: workerPoints
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(workbench);
    observer.observe(savedAgent);
    observer.observe(parentController);
    for (const element of workerRefs.current.values()) observer.observe(element);
    return () => observer.disconnect();
  }, [currentCase?.jobs.map(job => job.replayJobId).join('|')]);

  const begin = async () => { setBusy(true); setError(null); setSelectedOrder(null); try { if (currentCase && ['complete', 'denied_verified', 'failed'].includes(currentCase.stage)) await resetDemo(); setCurrentCase(await startCase()); } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); } finally { setBusy(false); } };
  const showEmptyState = async () => { setBusy(true); setError(null); try { await returnToEmptyState(); setCurrentCase(null); setSelectedOrder(null); setInspectorOpen(false); } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); } finally { setBusy(false); } };
  const requestAgain = async () => { if (!currentCase) return; setBusy(true); setError(null); try { setCurrentCase(await retryApproval(currentCase.id)); } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); } finally { setBusy(false); } };
  const submitDecision = async (decision: 'deny' | 'allow') => { if (!currentCase) return; setBusy(true); setError(null); try { setCurrentCase(await decide(currentCase.id, decision)); } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); await refreshCase(currentCase.id).catch(() => undefined); } finally { setBusy(false); } };

  const stage = currentCase?.stage ?? 'idle'; const activePhase = phaseIndex(stage); const active = ACTIVE_STAGES.has(stage); const jobs = currentCase?.jobs ?? [];
  const selected = useMemo(() => jobs.find(job => job.orderId === selectedOrder), [jobs, selectedOrder]); const servicesReady = health?.ok ?? false;
  const parentStatus = stage === 'awaiting_approval' || stage === 'denied_verified'
    ? 'held'
    : stage === 'failed'
      ? 'failed'
      : stage === 'complete'
        ? 'closed'
        : active
          ? 'running'
          : 'queued';
  const runLabel = busy ? 'Starting…' : stage === 'awaiting_approval' ? 'Waiting for approval' : active ? 'Release check running' : currentCase ? 'Start fresh release check' : 'Start release check';
  const canReturnToEmpty = Boolean(currentCase) && !busy && (stage === 'awaiting_approval' || !active);
  const anyWorkerWorking = jobs.some(job => job.workerStatus === 'spawning' || job.workerStatus === 'running');
  const measuredWorkers = jobs.flatMap(job => {
    const point = machineGeometry.workers[job.replayJobId];
    return point ? [{ job, point }] : [];
  });
  const parentOutput = machineGeometry.parentOutput;
  const conduitBusX = parentOutput && measuredWorkers.length > 0
    ? parentOutput.x + Math.min(44, Math.max(26, (measuredWorkers[0].point.x - parentOutput.x) * .44))
    : undefined;

  return <div className="forge-shell">
    <header className="studio-topbar">
      <div className="app-header"><ForgeCanaryBrand className="brand" href="/" ariaLabel="ForgeCanary landing page"/><div className="release-identity"><span className="eyebrow">AGENT WORKBENCH</span><h1>Release check: <b>{currentCase?.baselineVersion ?? 'MCP v1'}</b> <em>→</em> <b>{currentCase?.candidateVersion ?? 'MCP v2'}</b></h1></div><div className="header-status"><StatusDot status={servicesReady ? 'verified' : 'failed'}/><span>{initializing ? 'Connecting' : servicesReady ? 'TrueForge connected' : 'Services need attention'}</span><code>{short(config?.model, 22)}</code></div><nav className="studio-actions">{currentCase && <button className="empty-state-action" type="button" disabled={!canReturnToEmpty} title={canReturnToEmpty ? 'Safely close this run and return to the empty Studio' : 'Available at approval or after the run finishes'} onClick={showEmptyState}><Icon name="history"/><span>Return to empty</span></button>}<a href={config?.trueforgeUiUrl ?? 'http://localhost:8790'} target="_blank" rel="noreferrer">TrueForge ↗</a><button className="button primary start-button" disabled={busy || active || initializing || !servicesReady} onClick={begin}>{runLabel}<span>→</span></button></nav></div>
      <nav className={`phase-rail${currentCase ? '' : ' is-empty'}`} aria-label="Release phases">{PHASES.map((phase, index) => <div className={currentCase ? (index < activePhase ? 'done' : index === activePhase ? 'active' : '') : ''} key={phase}><span>{currentCase && index < activePhase ? '✓' : String(index + 1).padStart(2, '0')}</span><strong>{phase}</strong></div>)}</nav>
    </header>
    <main className={`release-page${currentCase ? '' : ' is-empty'}`}>
      {error && <div className="error-banner" role="alert"><strong>{stage === 'failed' ? 'Stopped safely.' : 'Runtime notice.'}</strong><span>{error}</span></div>}
      {!currentCase ? <EmptyWorkbench config={config} busy={busy || initializing} servicesReady={servicesReady} onStart={begin}/> : <>
      <section ref={workbenchRef} className={`workbench machine-workbench phase-${activePhase}`}>
        <svg className="machine-conduits" viewBox={`0 0 ${machineGeometry.width} ${machineGeometry.height}`} aria-hidden="true">
          {machineGeometry.savedOutput && machineGeometry.parentInput && <GlassConduit
            d={roundedMachineRoute(machineGeometry.savedOutput, machineGeometry.parentInput, (machineGeometry.savedOutput.x + machineGeometry.parentInput.x) / 2)}
            active={Boolean(currentCase?.parentRunId)}
            flowing={anyWorkerWorking}
            packetCount={1}
            duration={.95}
          />}
          {parentOutput && conduitBusX !== undefined && measuredWorkers.length > 0 && <>
            <GlassConduit d={`M ${parentOutput.x} ${parentOutput.y} H ${conduitBusX} M ${conduitBusX} ${measuredWorkers[0].point.y} V ${measuredWorkers[measuredWorkers.length - 1].point.y}`}/>
            {measuredWorkers.map(({ job, point }, index) => {
              const moving = job.workerStatus === 'spawning' || job.workerStatus === 'running';
              const held = job.workerStatus === 'held' || job.workerStatus === 'failed';
              return <g key={job.replayJobId}>
                <GlassConduit d={`M ${conduitBusX} ${point.y} H ${point.x}`}/>
                <GlassConduit d={roundedMachineRoute(parentOutput, point, conduitBusX)} structure={false} active flowing={moving} tone={held ? 'coral' : 'green'} packetCount={3} duration={.95 + index * .035}/>
              </g>;
            })}
            <g className="conduit-junctions">
              {measuredWorkers.map(({ job, point }) => <g key={job.replayJobId} transform={`translate(${conduitBusX} ${point.y})`}><circle className="junction-shell" r="6"/><circle className="junction-glass" r="3.2"/></g>)}
            </g>
          </>}
        </svg>
        <article ref={savedAgentRef} className="machine-node saved-agent-machine" aria-label="Reusable saved agent configuration">
          <MachineChassis ports={['right']}/>
          <div className="machine-copy saved-agent-copy"><div className="module-label"><Icon name="agent"/> SAVED AGENT</div><div className="agent-core"><span className="agent-glyph"><Icon name="agent"/></span><div><h2>{config?.savedAgentName ?? 'ForgeCanary Replay Worker'}</h2><p>Reusable configuration</p></div></div><dl className="module-spec"><div><dt>MODEL</dt><dd>{short(config?.model, 20)}</dd></div><div><dt>REASONING</dt><dd>low</dd></div><div><dt>CONNECTORS</dt><dd>{config?.connectors.length ?? 3} armed</dd></div><div><dt>APPROVAL</dt><dd>writes pause</dd></div></dl><div className="persistent-tag"><StatusDot status="verified"/> Preserved between runs</div></div>
        </article>
        <article ref={parentControllerRef} className={`machine-node parent-controller-machine ${currentCase?.parentRunId ? 'is-live' : ''}`} aria-label="Parent release run">
          <MachineChassis ports={['left', 'right']}/>
          <div className="machine-copy parent-controller-copy"><div className="module-label"><Icon name="run"/> PARENT RELEASE RUN</div><div className="parent-core"><span><Icon name="run"/></span><div><h2>{currentCase?.historyTitle ?? 'New release check'}</h2><p>{currentCase?.parentRunId ? `Run ${short(currentCase.parentRunId, 12)}` : 'Created only after start'}</p></div></div><div className="parent-state"><StatusDot status={parentStatus}/><span>{currentCase?.summary ?? 'Waiting for operator'}</span></div><div className="parent-meta"><span>ONE PARENT</span><span>{jobs.length}/6 SPAWNED</span></div></div>
        </article>
        <section className="worker-bank" aria-label="Spawned replay workers" aria-live="polite"><header><div><span className="eyebrow">LIVE REPLAY BANK</span><h2>Workers appear as TrueForge spawns them.</h2></div><span className="worker-count">{jobs.length}/6 spawned · {jobs.filter(job => job.workerStatus === 'closed').length}/6 closed</span></header><div className="worker-stack">{jobs.length === 0 && <div className="worker-empty"><Icon name="worker"/><span><strong>No replay workers spawned</strong><small>Starting a release check creates each isolated worker when its job is dispatched.</small></span></div>}{jobs.map((job, index) => <GlossyWorkerTask nodeRef={node => { if (node) workerRefs.current.set(job.replayJobId, node); else workerRefs.current.delete(job.replayJobId); }} job={job} index={index} selected={selectedOrder === job.orderId} key={job.replayJobId} onSelect={() => setSelectedOrder(selectedOrder === job.orderId ? null : job.orderId)}/>)}</div></section>
        <DetailPanel value={currentCase} selected={selected} busy={busy} onDecision={submitDecision} onRetry={requestAgain}/>
      </section>
      <section className="run-inspector" aria-label="Parent run inspection"><span className="run-inspector-meta"><Icon name="history"/><span><strong>{currentCase?.historyTitle ?? 'Release check history'}</strong><small>{currentCase ? `${jobs.length} replay jobs · ${currentCase.events.length} persisted events · ${currentCase.releaseHistory?.length ?? 0} prior checks` : 'One meaningful entry per release check'}</small></span></span><button className="run-inspector-trigger" type="button" onClick={() => setInspectorOpen(true)}>Inspect parent run <span aria-hidden="true">↗</span></button></section>
      </>}
    </main>
    {inspectorOpen && <ParentRunInspectorModal value={currentCase} jobs={jobs} onClose={() => setInspectorOpen(false)}/>}
  </div>;
}
