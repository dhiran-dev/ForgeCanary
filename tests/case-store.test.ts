import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { CaseStore } from '../src/case-store.js';
import type { ForgeCanaryConfig } from '../src/config.js';
import { ForgeCanaryService } from '../src/forgecanary-service.js';

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

  it('dismisses a terminal case from the Studio without losing its next-run history', () => {
    const { path, store } = newStore();
    const first = store.create({ mode: 'test', model: 'fixture/model' });
    store.transition(first.id, 'preflight', 'preflight');
    store.fail(first.id, new Error('Stopped safely'));

    store.dismiss(first.id);

    expect(store.getVisible()).toBeNull();
    expect(store.require(first.id).dismissedAt).toBeTruthy();
    expect(new CaseStore(path).getVisible()).toBeNull();

    const second = store.create({ mode: 'test', model: 'fixture/model' });
    expect(second.releaseHistory).toContainEqual(expect.objectContaining({
      caseId: first.id,
      finalVerdict: 'blocked'
    }));
    expect(store.getVisible()?.id).toBe(second.id);
  });

  it('normalizes legacy denied cases before retry paths read new metadata', () => {
    const directory = mkdtempSync(join(tmpdir(), 'forgecanary-store-'));
    const path = join(directory, 'case.json');
    writeFileSync(path, JSON.stringify({
      version: 1,
      id: 'fc_legacy',
      stage: 'denied_verified',
      mode: 'live',
      model: 'provider/legacy-model',
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-08-01T00:05:00.000Z',
      sequence: 0,
      summary: 'Denied. Nothing changed.',
      jobs: [{
        orderId: 'FC-1001',
        sku: 'COLD-A',
        quantity: 4,
        perishable: true,
        productLabel: 'Temperature-sensitive medicine',
        candidate: { oracle: { passed: false } }
      }],
      sessionIds: [],
      approval: { status: 'denied', sessionId: 'session_legacy_parent' },
      events: [],
      receipt: { receiptHash: 'legacy-hash' }
    }), 'utf8');

    const normalized = new CaseStore(path).require('fc_legacy');
    expect(normalized).toMatchObject({
      savedAgentId: 'legacy-inline-agent',
      parentRunId: 'session_legacy_parent',
      parentSessionId: 'session_legacy_parent',
      baselineVersion: 'MCP v1',
      candidateVersion: 'MCP v2',
      historyTitle: 'Release check: MCP v1 → MCP v2',
      finalVerdict: 'denied_zero_mutation',
      receiptHistory: [],
      releaseHistory: [],
      retention: { workerDetail: 'archive_after_receipt', archivedWorkerEventCount: 0 }
    });
    expect(normalized.jobs[0]).toMatchObject({
      replayJobId: 'fc_legacy:FC-1001',
      workerStatus: 'held',
      currentTask: 'Business outcome held for review',
      finalVerdict: 'regression'
    });
    expect(normalized.sessionIds).toContain('session_legacy_parent');
    expect(normalized.receipt).toEqual({ receiptHash: 'legacy-hash' });

    const once = readFileSync(path, 'utf8');
    new CaseStore(path);
    expect(readFileSync(path, 'utf8')).toBe(once);
  });

  it('archives a legacy denial receipt before requesting approval again', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'forgecanary-store-'));
    const path = join(directory, 'case.json');
    writeFileSync(path, JSON.stringify({
      version: 1,
      id: 'fc_legacy_retry',
      stage: 'denied_verified',
      mode: 'test',
      model: 'provider/model',
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-08-01T00:05:00.000Z',
      sequence: 0,
      summary: 'Denied. Nothing changed.',
      jobs: [],
      sessionIds: [],
      approval: { status: 'denied', sessionId: 'session_legacy_parent' },
      events: [],
      receipt: { receiptHash: 'legacy-hash' }
    }), 'utf8');
    const config: ForgeCanaryConfig = {
      mode: 'test',
      trueforgeBaseUrl: 'http://trueforge.test',
      requestedModel: 'provider/model',
      modelReasoningEffort: 'low',
      v1BaseUrl: 'http://v1.test',
      v2BaseUrl: 'http://v2.test',
      controlBaseUrl: 'http://control.test',
      caseStatePath: path,
      savedAgentRefPath: join(directory, 'agent.json'),
      baselineVersion: 'MCP v1',
      candidateVersion: 'MCP v2'
    };
    const service = new ForgeCanaryService(config);
    vi.spyOn(service, 'initialize').mockResolvedValue('provider/model');
    Reflect.set(service, 'requestApproval', async (caseId: string) => {
      service.store.transition(caseId, 'awaiting_approval', 'Approval requested again.');
    });

    const retried = await service.retryApproval('fc_legacy_retry');

    expect(retried.stage).toBe('awaiting_approval');
    expect(retried.receipt).toBeUndefined();
    expect(retried.receiptHistory).toEqual([{ receiptHash: 'legacy-hash' }]);
    expect(retried.parentSessionId).toBe('session_legacy_parent');
  });

  it('denies a pending repair before returning the Studio to its empty state', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'forgecanary-store-'));
    const path = join(directory, 'case.json');
    const service = new ForgeCanaryService({
      mode: 'test',
      trueforgeBaseUrl: 'http://trueforge.test',
      requestedModel: 'provider/model',
      modelReasoningEffort: 'low',
      v1BaseUrl: 'http://v1.test',
      v2BaseUrl: 'http://v2.test',
      controlBaseUrl: 'http://control.test',
      caseStatePath: path,
      savedAgentRefPath: join(directory, 'agent.json'),
      baselineVersion: 'MCP v1',
      candidateVersion: 'MCP v2'
    });
    const created = service.store.create({ mode: 'test', model: 'provider/model' });
    for (const [stage, summary] of [
      ['preflight', 'preflight'],
      ['replaying_baseline', 'baseline'],
      ['replaying_candidate', 'candidate'],
      ['analyzing', 'analysis'],
      ['regression_detected', 'regression'],
      ['proposing_repair', 'repair'],
      ['awaiting_approval', 'approval']
    ] as const) service.store.transition(created.id, stage, summary);
    const decision = vi.spyOn(service, 'decideApproval').mockImplementation(async caseId => {
      service.store.transition(caseId, 'denied_verified', 'Denied safely.');
      return service.store.require(caseId);
    });
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(service.returnToEmptyState()).resolves.toEqual({ case: null });

    expect(decision).toHaveBeenCalledWith(created.id, 'deny');
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(service.store.getVisible()).toBeNull();
    expect(service.store.require(created.id).stage).toBe('denied_verified');
    vi.unstubAllGlobals();
  });
});
