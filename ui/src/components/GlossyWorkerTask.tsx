import type { CSSProperties, Ref } from 'react';
import type { CaseJobRow } from '../types';

type PipelineKey = 'current' | 'upgrade' | 'evidence' | 'result';

function pipelineState(job: CaseJobRow, step: PipelineKey): string {
  if (step === 'current') return job.baseline ? 'done' : job.workerStatus === 'running' ? 'active' : 'queued';
  if (step === 'upgrade') return job.candidate ? 'done' : job.baseline && job.workerStatus === 'running' ? 'active' : 'queued';
  if (step === 'evidence') return job.candidate ? 'done' : 'queued';
  if (job.workerStatus === 'held' || job.workerStatus === 'failed') return job.workerStatus;
  return job.finalVerdict ? 'done' : 'queued';
}

function WorkerCube() {
  return <svg className="icon worker-cube" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 4 7v10l8 4 8-4V7z"/><path d="m4 7 8 4 8-4M12 11v10"/></svg>;
}

function Chevron() {
  return <svg className="pipeline-arrow" viewBox="0 0 12 12" aria-hidden="true"><path d="m4 2.5 3.5 3.5L4 9.5"/></svg>;
}

function PixelActivity({ label }: { label: string }) {
  return <span className="pixel-activity" role="status" aria-label={label}>{Array.from({ length: 9 }, (_, index) => <i key={index} style={{ '--pixel-index': index } as CSSProperties}/>)}</span>;
}

function StateMark({ status }: { status: string }) {
  if (status === 'spawning' || status === 'running') return <PixelActivity label={status === 'spawning' ? 'Worker spawning' : 'Worker running'}/>;
  if (status === 'held' || status === 'failed') return <svg className="state-mark is-held" viewBox="0 0 20 20" aria-hidden="true"><path d="M10 2.5 17.5 10 10 17.5 2.5 10z"/><path d="M10 6.5v4.2M10 13.6v.1"/></svg>;
  if (status === 'verified' || status === 'closed') return <svg className="state-mark is-done" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="7.5"/><path d="m6.5 10.2 2.2 2.2 4.8-5"/></svg>;
  return <span className="state-mark is-queued" aria-hidden="true"/>;
}

const PIPELINE: Array<{ key: PipelineKey; label: string }> = [
  { key: 'current', label: 'Current' },
  { key: 'upgrade', label: 'Upgrade' },
  { key: 'evidence', label: 'Evidence' },
  { key: 'result', label: 'Result' }
];

export function GlossyWorkerTask({
  job,
  index,
  selected,
  nodeRef,
  onSelect
}: {
  job: CaseJobRow;
  index: number;
  selected: boolean;
  nodeRef: Ref<HTMLButtonElement>;
  onSelect: () => void;
}) {
  const working = job.workerStatus === 'spawning' || job.workerStatus === 'running';
  return <button
    ref={nodeRef}
    type="button"
    aria-pressed={selected}
    className={`worker-module glossy-task-row is-${job.workerStatus} ${selected ? 'selected' : ''}`}
    style={{ '--worker-index': index } as CSSProperties}
    onClick={onSelect}
  >
    <img className="worker-plate" src="/images/operator-machine/worker-cartridge-v4.png?rev=2" alt="" width="2048" height="200"/>
    <span className="worker-sheen" aria-hidden="true"/>
    <span className="worker-icon"><WorkerCube/></span>
    <span className="worker-copy"><strong>Worker {String(index + 1).padStart(2, '0')} · {job.orderId}</strong><small>{job.productLabel}</small></span>
    <span className="worker-pipeline" aria-label={`Job pipeline: ${job.currentTask}`}>
      {PIPELINE.map((step, stepIndex) => <span className="pipeline-fragment" key={step.key}><i className={`tool-chip is-${pipelineState(job, step.key)}`}>{step.label}</i>{stepIndex < PIPELINE.length - 1 && <Chevron/>}</span>)}
    </span>
    <span className="worker-status"><StateMark status={job.workerStatus}/><b>{job.workerStatus}</b></span>
    {working && <span className="work-pulse" aria-hidden="true"/>}
  </button>;
}

