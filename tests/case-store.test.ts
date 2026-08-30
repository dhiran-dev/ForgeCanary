import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CaseStore } from '../src/case-store.js';

function newStore(): { path: string; store: CaseStore } {
  const directory = mkdtempSync(join(tmpdir(), 'forgecanary-store-'));
  const path = join(directory, 'case.json');
  return { path, store: new CaseStore(path) };
}

describe('CaseStore', () => {
  it('persists ordered transitions and trace sequence numbers', () => {
    const { path, store } = newStore();
    const created = store.create({ mode: 'test', model: 'fixture/model' });
    expect(created).toMatchObject({
      savedAgentId: 'agent_test',
      historyTitle: 'Release check: MCP v1 → MCP v2',
      retention: { workerDetail: 'archive_after_receipt', childRuns: 'hidden' }
    });

    store.transition(created.id, 'preflight', 'Checking services.');
    store.append(created.id, {
      source: 'forgecanary',
      type: 'case.preflight',
      title: 'Preflight started'
    });

    const reloaded = new CaseStore(path).require(created.id);
    expect(reloaded).toMatchObject({ stage: 'failed', sequence: 1 });
    expect(reloaded.events[0]).toMatchObject({ id: 1, type: 'case.preflight' });
    expect(reloaded.error?.message).toContain('process stopped');
  });

  it('rejects an invalid state transition', () => {
    const { store } = newStore();
    const created = store.create({ mode: 'live', model: 'provider/model' });

    expect(() => store.transition(created.id, 'complete', 'Skipped work.')).toThrow(
      'Invalid case transition: idle → complete'
    );
  });

  it('carries a compact terminal release summary into the next fresh case', () => {
    const { store } = newStore();
    const first = store.create({ mode: 'test', model: 'fixture/model' });
    store.transition(first.id, 'preflight', 'preflight');
    store.transition(first.id, 'replaying_baseline', 'baseline');
    store.transition(first.id, 'replaying_candidate', 'candidate');
    store.transition(first.id, 'analyzing', 'analysis');
    store.transition(first.id, 'regression_detected', 'regression');
    store.transition(first.id, 'proposing_repair', 'repair');
    store.transition(first.id, 'awaiting_approval', 'approval');
    store.transition(first.id, 'denied_verified', 'denied');
    store.update(first.id, value => { value.finalVerdict = 'denied_zero_mutation'; });

    const second = store.create({ mode: 'test', model: 'fixture/model', candidateVersion: 'MCP v3' });

    expect(second.releaseHistory).toContainEqual(expect.objectContaining({
      caseId: first.id,
      finalVerdict: 'denied_zero_mutation',
      historyTitle: 'Release check: MCP v1 → MCP v2'
    }));
    expect(second.historyTitle).toBe('Release check: MCP v1 → MCP v3');
  });
});
