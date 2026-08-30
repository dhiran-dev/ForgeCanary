import { TrueForgeError, type TrueForge } from '@truefoundry/trueforge-sdk';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { ForgeCanaryConfig } from '../src/config.js';
import { ensureSavedReplayAgent, REPLAY_AGENT_NAME } from '../src/saved-agent.js';

function config(path: string): ForgeCanaryConfig {
  return {
    mode: 'test',
    trueforgeBaseUrl: 'http://trueforge.test',
    requestedModel: 'provider/model',
    modelReasoningEffort: 'low',
    v1BaseUrl: 'http://v1.test',
    v2BaseUrl: 'http://v2.test',
    controlBaseUrl: 'http://control.test',
    caseStatePath: join(path, 'case.json'),
    savedAgentRefPath: join(path, 'agent.json'),
    baselineVersion: 'MCP v1',
    candidateVersion: 'MCP v2'
  };
}

describe('saved replay agent', () => {
  it('creates the named agent once and stores only its immutable id', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'forgecanary-agent-'));
    const create = vi.fn().mockResolvedValue({ data: { id: 'agent_123', name: REPLAY_AGENT_NAME } });
    const client = {
      agents: {
        list: vi.fn().mockResolvedValue({ data: [] }),
        create,
        get: vi.fn()
      }
    } as unknown as TrueForge;

    const saved = await ensureSavedReplayAgent(client, config(directory), 'provider/model');

    expect(saved).toMatchObject({ id: 'agent_123', name: REPLAY_AGENT_NAME, manifest: { model: { name: 'provider/model' } } });
    expect(create).toHaveBeenCalledOnce();
    expect(create.mock.calls[0]?.[0]).toMatchObject({
      name: REPLAY_AGENT_NAME,
      manifest: { model: { name: 'provider/model' }, config: { dynamicSubAgents: { enabled: true } } }
    });
    expect(JSON.parse(readFileSync(join(directory, 'agent.json'), 'utf8'))).toEqual({ savedAgentId: 'agent_123' });
  });

  it('reuses the stored id without creating another agent', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'forgecanary-agent-'));
    const firstConfig = config(directory);
    const create = vi.fn().mockResolvedValue({ data: { id: 'agent_123', name: REPLAY_AGENT_NAME } });
    const firstClient = { agents: { list: vi.fn().mockResolvedValue({ data: [] }), create, get: vi.fn() } } as unknown as TrueForge;
    await ensureSavedReplayAgent(firstClient, firstConfig, 'provider/model');

    const secondCreate = vi.fn();
    const update = vi.fn().mockImplementation(async (id, request) => ({
      data: { id, name: REPLAY_AGENT_NAME, manifest: request.manifest }
    }));
    const secondClient = {
      agents: {
        get: vi.fn().mockResolvedValue({ data: { id: 'agent_123', name: REPLAY_AGENT_NAME, manifest: { model: { name: 'stale/model' } } } }),
        list: vi.fn(),
        create: secondCreate,
        update
      }
    } as unknown as TrueForge;

    await expect(ensureSavedReplayAgent(secondClient, firstConfig, 'provider/model')).resolves.toMatchObject({
      id: 'agent_123',
      name: REPLAY_AGENT_NAME,
      manifest: { model: { name: 'provider/model' } }
    });
    expect(secondCreate).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith('agent_123', expect.objectContaining({
      manifest: expect.objectContaining({ model: { name: 'provider/model', params: expect.any(Object) } })
    }));
  });

  it('recovers a deleted stored agent id and rewrites the reference', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'forgecanary-agent-'));
    const agentPath = join(directory, 'agent.json');
    writeFileSync(agentPath, JSON.stringify({ savedAgentId: 'agent_deleted' }), 'utf8');
    const create = vi.fn().mockResolvedValue({ data: { id: 'agent_replacement', name: REPLAY_AGENT_NAME } });
    const client = {
      agents: {
        get: vi.fn().mockRejectedValue(new TrueForgeError({ statusCode: 404 })),
        list: vi.fn().mockResolvedValue({ data: [] }),
        create,
        update: vi.fn()
      }
    } as unknown as TrueForge;

    await expect(ensureSavedReplayAgent(client, config(directory), 'provider/model')).resolves.toMatchObject({
      id: 'agent_replacement',
      name: REPLAY_AGENT_NAME
    });
    expect(create).toHaveBeenCalledOnce();
    expect(JSON.parse(readFileSync(agentPath, 'utf8'))).toEqual({ savedAgentId: 'agent_replacement' });
  });

  it('does not hide non-recoverable saved-agent lookup failures', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'forgecanary-agent-'));
    writeFileSync(join(directory, 'agent.json'), JSON.stringify({ savedAgentId: 'agent_unavailable' }), 'utf8');
    const list = vi.fn();
    const create = vi.fn();
    const client = {
      agents: {
        get: vi.fn().mockRejectedValue(new TrueForgeError({ statusCode: 503 })),
        list,
        create,
        update: vi.fn()
      }
    } as unknown as TrueForge;

    await expect(ensureSavedReplayAgent(client, config(directory), 'provider/model')).rejects.toMatchObject({ statusCode: 503 });
    expect(list).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });
});
