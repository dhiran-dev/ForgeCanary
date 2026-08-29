const $ = selector => document.querySelector(selector);

function shortHash(value, length = 12) {
  return value ? `${value.slice(0, length)}…` : '—';
}

function setText(selector, value) {
  const node = $(selector);
  if (node) node.textContent = String(value);
}

function eventClass(type) {
  if (type === 'tool.approval_required') return 'approval';
  if (type === 'tool.response') return 'response';
  return '';
}

function render(data) {
  const { replay, approval, repeat, preflight } = data;
  const failed = replay.matrix.find(row => !row.candidateOracle.passed);
  setText('#technical-status', preflight.status);
  setText('#schema-hash', shortHash(replay.schema.v1Hash, 18));
  setText('#protocol-count', `${replay.summary.protocolGreen} / ${replay.summary.candidateJobs} GREEN`);
  setText('#expected-lot', failed?.candidateOracle.expectedLotId ?? '—');
  setText('#actual-lot', failed?.candidateOracle.actualLotId ?? '—');
  setText('#invariant-text', failed?.candidateOracle.invariant ?? 'No failed invariant found.');

  const repairedByOrder = new Map(approval.repairedMatrix.map(row => [row.orderId, row]));
  const matrix = $('#job-matrix');
  matrix.replaceChildren();

  function selectJob(row, button) {
    matrix.querySelectorAll('.job-row').forEach(item => item.setAttribute('aria-pressed', 'false'));
    button.setAttribute('aria-pressed', 'true');
    const repaired = repairedByOrder.get(row.orderId);
    setText('#detail-order', row.orderId);
    setText('#detail-protocol', row.protocolTranscriptEqual ? 'IDENTICAL / GREEN' : 'CHANGED');
    setText(
      '#detail-before',
      row.candidateOracle.passed ? `PASS / ${row.candidateOracle.actualLotId}` : `FAIL / ${row.candidateOracle.actualLotId}`
    );
    setText('#detail-after', repaired?.oracle.passed ? `PASS / ${repaired.oracle.actualLotId}` : 'FAIL');
    setText('#detail-reason', row.candidateOracle.reason);
  }

  replay.matrix.forEach((row, index) => {
    const repaired = repairedByOrder.get(row.orderId);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'job-row';
    button.setAttribute('aria-pressed', 'false');
    button.innerHTML = `
      <strong>${row.orderId}</strong>
      <span class="cell-status ${row.protocolTranscriptEqual ? 'pass' : 'fail'}">${row.protocolTranscriptEqual ? 'GREEN' : 'CHANGED'}</span>
      <span class="cell-status ${row.candidateOracle.passed ? 'pass' : 'fail'}">${row.candidateOracle.passed ? 'CORRECT' : 'WRONG LOT'}</span>
      <span class="cell-status ${repaired?.oracle.passed ? 'pass' : 'fail'}">${repaired?.oracle.passed ? 'VERIFIED' : 'FAILED'}</span>
    `;
    button.addEventListener('click', () => selectJob(row, button));
    matrix.append(button);
    if (index === 0) selectJob(row, button);
  });

  setText('#deny-status', approval.deny.zeroMutation ? '0 MUTATIONS' : 'FAILED');
  setText('#allow-status', approval.approve.scopedMutation ? '1 SCOPED CHANGE' : 'FAILED');
  setText('#rollback-status', approval.rollback.reversible ? 'EXACT RESTORE' : 'FAILED');
  setText('#approval-session', `SESSION ${shortHash(approval.approve.sessionId, 10)}`);
  const eventList = $('#event-sequence');
  eventList.replaceChildren();
  [...approval.approve.requestEventTypes, ...approval.approve.resumeEventTypes]
    .filter(type => !type.endsWith('.delta'))
    .forEach(type => {
      const item = document.createElement('li');
      item.className = eventClass(type);
      item.textContent = type;
      eventList.append(item);
    });

  setText('#loop-count', repeat.completedLoops);
  setText('#outcome-hash', shortHash(repeat.normalizedOutcomeHash, 22));
  setText('#loop-duration', `${(repeat.maxLoopDurationMs / 1000).toFixed(2)} SEC`);
  setText('#repaired-count', `${approval.repairedMatrix.filter(row => row.oracle.passed).length} / ${approval.repairedMatrix.length}`);
  setText('#final-status', preflight.status);
}

async function main() {
  const response = await fetch('/api/evidence', { cache: 'no-store' });
  if (!response.ok) throw new Error(`Evidence API returned ${response.status}`);
  render(await response.json());
}

main().catch(error => {
  console.error(error);
  const mainNode = document.querySelector('main');
  const notice = document.createElement('p');
  notice.className = 'load-error';
  notice.textContent = `Evidence could not be loaded: ${error.message}`;
  mainNode.prepend(notice);
});
