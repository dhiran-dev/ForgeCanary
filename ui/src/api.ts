import type { ForgeCanaryCase, HealthState, PublicConfig } from './types';

let operatorToken = '';

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const method = init?.method?.toUpperCase() ?? 'GET';
  if (method !== 'GET' && !operatorToken) throw new Error('The operator session is not initialized');
  const response = await fetch(url, {
    cache: 'no-store',
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(method !== 'GET' ? { 'x-forgecanary-token': operatorToken } : {}),
      ...init?.headers
    }
  });
  const body = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(body.error ?? `${response.status} ${response.statusText}`);
  return body;
}

export async function loadConfig(): Promise<PublicConfig> {
  const config = await json<PublicConfig>('/api/config');
  operatorToken = config.operatorToken;
  return config;
}

export async function loadHealth(): Promise<HealthState> {
  return json<HealthState>('/api/health');
}

export async function loadCurrentCase(): Promise<ForgeCanaryCase | null> {
  return (await json<{ case: ForgeCanaryCase | null }>('/api/cases/current')).case;
}

export async function loadCase(caseId: string): Promise<ForgeCanaryCase> {
  return (await json<{ case: ForgeCanaryCase }>(`/api/cases/${encodeURIComponent(caseId)}`)).case;
}

export async function startCase(): Promise<ForgeCanaryCase> {
  return (await json<{ case: ForgeCanaryCase }>('/api/cases', { method: 'POST', body: '{}' })).case;
}

export async function resetDemo(): Promise<void> {
  await json('/api/demo/reset', { method: 'POST', body: '{}' });
}

export async function returnToEmptyState(): Promise<null> {
  return (await json<{ case: null }>('/api/demo/empty', { method: 'POST', body: '{}' })).case;
}

export async function decide(caseId: string, decision: 'allow' | 'deny'): Promise<ForgeCanaryCase> {
  return (
    await json<{ case: ForgeCanaryCase }>(`/api/cases/${encodeURIComponent(caseId)}/approval`, {
      method: 'POST',
      body: JSON.stringify({ decision })
    })
  ).case;
}

export async function retryApproval(caseId: string): Promise<ForgeCanaryCase> {
  return (
    await json<{ case: ForgeCanaryCase }>(`/api/cases/${encodeURIComponent(caseId)}/retry-approval`, {
      method: 'POST',
      body: '{}'
    })
  ).case;
}
