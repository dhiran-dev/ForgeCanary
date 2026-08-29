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
});
