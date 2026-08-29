import type { NewTraceEvent } from './case-store.js';

interface EventRecord {
  id?: string;
  type?: string;
  createdAt?: string;
  threadId?: string | null;
  title?: string;
  sandboxId?: string;
  mcpServers?: Array<{ name?: string; status?: string }>;
  toolCalls?: Array<{
    id?: string;
    function?: { name?: string; arguments?: string };
    toolInfo?: { mcpServerName?: string; name?: string; type?: string };
  }>;
  content?: unknown;
  toolCallId?: string;
  state?: unknown;
}

function flattenText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(flattenText).filter(Boolean).join(' ');
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return [record.text, record.content, record.value].map(flattenText).filter(Boolean).join(' ');
  }
  return '';
}

function compact(value: unknown, limit = 220): string | undefined {
  const text = typeof value === 'string' ? value : flattenText(value) || JSON.stringify(value);
  if (!text) return undefined;
  const normalized = text.replace(/\s+/g, ' ').trim();
  return normalized.length > limit ? `${normalized.slice(0, limit - 1)}…` : normalized;
}

export function normalizeTrueForgeEvent(event: unknown, sessionId: string): NewTraceEvent | null {
  const value = event as EventRecord;
  const common = {
    source: 'trueforge' as const,
    type: value.type ?? 'unknown',
    createdAt: value.createdAt,
    trueforgeEventId: value.id,
    sessionId,
    threadId: value.threadId
  };

  switch (value.type) {
    case 'turn.created':
      return { ...common, title: 'TrueForge turn started' };
    case 'mcp.initialize':
      return {
        ...common,
        title: 'MCP connector initialized',
        detail: value.mcpServers?.map(server => server.name).filter(Boolean).join(', ') || 'Connector ready'
      };
    case 'sandbox.created':
      return { ...common, title: 'TrueForge sandbox created', detail: value.sandboxId };
    case 'thread.created':
      return { ...common, title: `Subagent started: ${value.title ?? 'Untitled agent'}` };
    case 'thread.done':
      return { ...common, title: 'Subagent completed', detail: compact(value.state) };
    case 'model.message': {
      const calls = value.toolCalls ?? [];
      if (calls.length > 0) {
        const names = calls.map(call => call.function?.name ?? call.toolInfo?.name ?? 'tool').join(', ');
        return { ...common, title: `Agent requested tool: ${names}` };
      }
      const detail = compact(value.content);
      return detail ? { ...common, title: 'Agent analysis', detail } : null;
    }
    case 'tool.approval_required':
      return { ...common, title: 'Human approval required', detail: 'TrueForge paused before the write tool.' };
    case 'tool.response':
      return { ...common, title: 'Tool response received', detail: compact(value.content) };
    case 'turn.done':
      return { ...common, title: 'TrueForge turn completed', detail: compact(value.state) };
    default:
      return value.type?.endsWith('.delta') ? null : { ...common, title: value.type ?? 'TrueForge event' };
  }
}

export function readToolCalls(event: unknown): Array<{
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}> {
  const value = event as EventRecord;
  if (value.type !== 'model.message') return [];
  return (value.toolCalls ?? []).flatMap(call => {
    const id = call.id;
    const name = call.function?.name ?? call.toolInfo?.name;
    if (!id || !name) return [];
    let args: Record<string, unknown> = {};
    try {
      args = JSON.parse(call.function?.arguments ?? '{}') as Record<string, unknown>;
    } catch {
      args = { unparsed: true };
    }
    return [{ id, name, arguments: args }];
  });
}

export function readThreadCreated(event: unknown): { threadId: string; title: string } | null {
  const value = event as EventRecord;
  if (value.type !== 'thread.created' || typeof value.threadId !== 'string') return null;
  return { threadId: value.threadId, title: value.title ?? 'Dynamic subagent' };
}

export function readSandboxCreated(event: unknown): string | null {
  const value = event as EventRecord;
  return value.type === 'sandbox.created' && typeof value.sandboxId === 'string' ? value.sandboxId : null;
}

export function readThreadDone(event: unknown): string | null {
  const value = event as EventRecord;
  return value.type === 'thread.done' && typeof value.threadId === 'string' ? value.threadId : null;
}
