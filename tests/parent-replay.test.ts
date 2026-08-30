import type { TrueForge } from '@truefoundry/trueforge-sdk';
import { describe, expect, it, vi } from 'vitest';
import { runInventoryJob } from '../src/trueforge-harness.js';

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
    expect(listEvents).toHaveBeenCalledWith('parent_1', { limit: 100, lastTurnId: turnId });
  });

  it('surfaces the TrueForge terminal error instead of masking it as a transcript error', async () => {
    const client = {
      sessions: {
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
});
