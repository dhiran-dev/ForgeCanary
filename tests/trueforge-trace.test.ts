import { describe, expect, it } from 'vitest';
import {
  normalizeTrueForgeEvent,
  readApprovalRequest,
  readSandboxCreated,
  readThreadCreated,
  readThreadDone,
  readToolCalls
} from '../src/trueforge-trace.js';

describe('TrueForge trace normalization', () => {
  it('extracts a persisted MCP tool call without leaking its full arguments into the event title', () => {
    const event = {
      id: 'event_1',
      type: 'model.message',
      threadId: 'thread_1',
      toolCalls: [
        {
          id: 'call_1',
          function: {
            name: 'reserve_inventory',
            arguments: JSON.stringify({ order_id: 'FC-1001', sku: 'COLD-A', quantity: 4 })
          }
        }
      ]
    };

    expect(readToolCalls(event)).toEqual([
      {
        id: 'call_1',
        name: 'reserve_inventory',
        arguments: { order_id: 'FC-1001', sku: 'COLD-A', quantity: 4 }
      }
    ]);
    expect(normalizeTrueForgeEvent(event, 'session_1')).toMatchObject({
      title: 'Agent requested tool: reserve_inventory',
      sessionId: 'session_1',
      threadId: 'thread_1'
    });
  });

  it('tracks sandbox and dynamic-subagent lifecycle events', () => {
    expect(readSandboxCreated({ type: 'sandbox.created', sandboxId: 'sandbox_1' })).toBe('sandbox_1');
    expect(readThreadCreated({ type: 'thread.created', threadId: 'thread_1', title: 'Outcome auditor' })).toEqual({
      threadId: 'thread_1',
      title: 'Outcome auditor'
    });
    expect(readThreadDone({ type: 'thread.done', threadId: 'thread_1' })).toBe('thread_1');
  });

  it('links an approval event to a separately persisted tool call', () => {
    expect(
      readApprovalRequest({
        type: 'tool.approval_required',
        threadId: 'main',
        toolCalls: [{ id: 'call_1', sourceEventId: 'event_1' }]
      })
    ).toEqual({ threadId: 'main', toolCallIds: ['call_1'] });
  });
});
