import type { TrueForge } from '@truefoundry/trueforge-sdk';
import { describe, expect, it, vi } from 'vitest';
import { agentManifest } from '../src/saved-agent.js';
import { approvalAgentSpec, runInventoryJob, toolFreeAgentSpec } from '../src/trueforge-harness.js';

function stream(events: unknown[]) {
  return {
    withMetadata: async function* () {
      for (const event of events) yield { data: event };
    }
  };
}

describe('parent session replay turns', () => {
  it('reads the persisted transcript from the exact isolated root turn', async () => {
    const turnId = 'turn_replay_1';
    const listEvents = vi.fn().mockResolvedValue([
      { event: { type: 'turn.created', input: [{ type: 'user.message', content: 'ORDER=FC-1001' }] } },
      { event: { type: 'model.message', toolCalls: [{ function: { name: 'reserve_inventory1', arguments: '{"order_id":"FC-1001"}' } }] } },
      { event: { type: 'tool.response', content: '{"status":"reserved"}' } }
    ]);
    const client = {
      sessions: {
        update: vi.fn().mockResolvedValue({ data: { id: 'parent_1' } }),
        createTurnStream: vi.fn().mockResolvedValue(stream([
          { type: 'turn.created', turnId },
          { type: 'model.message' },
          { type: 'model.message.delta' },
          { type: 'turn.done', state: { status: 'done' } }
        ])),
        listEvents
      }
    } as unknown as TrueForge;

    const transcript = await runInventoryJob(client, 'forgecanary-inventory-v2', 'ORDER=FC-1001', {
      parentSessionId: 'parent_1'
    });

    expect(transcript).toMatchObject({ sessionId: 'parent_1', turnId, toolName: 'reserve_inventory1' });
    expect(client.sessions.update).toHaveBeenCalledWith('parent_1', {
      agent: {
        spec: expect.objectContaining({
          mcpServers: [{
            name: 'forgecanary-inventory-v2',
            enableTools: ['reserve_inventory'],
            preload: true,
            requireApprovalForTools: []
          }],
          model: expect.objectContaining({ params: expect.objectContaining({ parallelToolCalls: false }) })
        })
      }
    });
    expect(listEvents).toHaveBeenCalledWith('parent_1', { limit: 100, lastTurnId: turnId });
  });

  it('surfaces the TrueForge terminal error instead of masking it as a transcript error', async () => {
    const client = {
      sessions: {
        update: vi.fn().mockResolvedValue({ data: { id: 'parent_1' } }),
        createTurnStream: vi.fn().mockResolvedValue(stream([
          { type: 'turn.created', turnId: 'turn_error' },
          { type: 'turn.done', state: { status: 'error', message: 'model unavailable' } }
        ])),
        listEvents: vi.fn()
      }
    } as unknown as TrueForge;

    await expect(runInventoryJob(client, 'forgecanary-inventory-v1', 'ORDER=FC-1001', {
      parentSessionId: 'parent_1'
    })).rejects.toThrow('TrueForge replay turn error: model unavailable');
  });

  it('removes MCP capabilities for analysis and scopes approval to the control tool', () => {
    const base = agentManifest('provider/model', 'low');
    const analysis = toolFreeAgentSpec(base, true);
    const approval = approvalAgentSpec(base);

    expect(analysis.mcpServers).toEqual([]);
    expect(analysis.config?.dynamicSubAgents).toEqual({ enabled: true });
    expect(approval.mcpServers).toEqual([{
      name: 'forgecanary-adapter-control',
      enableTools: ['activate_compatibility_adapter'],
      preload: true,
      requireApprovalForTools: ['activate_compatibility_adapter']
    }]);
    expect(approval.config?.dynamicSubAgents).toEqual({ enabled: false });
  });

  it('rejects an unknown inventory connector before changing the parent session', async () => {
    const update = vi.fn();
    const client = { sessions: { update } } as unknown as TrueForge;

    await expect(runInventoryJob(client, 'unexpected-connector', 'ORDER=FC-1001', {
      parentSessionId: 'parent_1'
    })).rejects.toThrow('Unsupported ForgeCanary inventory connector');
    expect(update).not.toHaveBeenCalled();
  });
});
