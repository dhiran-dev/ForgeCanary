import type { TrueForge } from '@truefoundry/trueforge-sdk';

export type ForgeCanaryMode = 'live' | 'test';

export interface ForgeCanaryConfig {
  mode: ForgeCanaryMode;
  trueforgeBaseUrl: string;
  requestedModel: string | null;
  modelReasoningEffort: string;
  v1BaseUrl: string;
  v2BaseUrl: string;
  controlBaseUrl: string;
  caseStatePath: string;
}

const TEST_MODEL = 'forgecanary-local/forgecanary-deterministic';
const LIVE_MODEL_PREFERENCES = [
  'openai/gpt-5-6-terra',
  'openai/gpt-5-6-luna',
  'openai/gpt-5-6-sol'
] as const;

export function readForgeCanaryConfig(): ForgeCanaryConfig {
  const mode = process.env.FORGECANARY_MODE === 'test' ? 'test' : 'live';
  return {
    mode,
    trueforgeBaseUrl: process.env.TRUEFORGE_BASE_URL ?? 'http://localhost:8790',
    requestedModel: process.env.FORGECANARY_MODEL ?? (mode === 'test' ? TEST_MODEL : null),
    modelReasoningEffort: process.env.FORGECANARY_REASONING_EFFORT ?? 'low',
    v1BaseUrl: process.env.V1_FIXTURE_BASE_URL ?? 'http://127.0.0.1:9101',
    v2BaseUrl: process.env.V2_FIXTURE_BASE_URL ?? 'http://127.0.0.1:9102',
    controlBaseUrl: process.env.CONTROL_BASE_URL ?? 'http://127.0.0.1:9200',
    caseStatePath: process.env.FORGECANARY_CASE_STATE ?? '.data/live-case.json'
  };
}

export async function resolveConfiguredModel(client: TrueForge, config: ForgeCanaryConfig): Promise<string> {
  const response = await client.models.list();
  const available = response.data.map(model => model.name);
  const requested = config.requestedModel;
  if (requested) {
    if (!available.includes(requested)) {
      throw new Error(
        `Configured model ${requested} is unavailable. Available model names: ${available.join(', ') || 'none'}`
      );
    }
    return requested;
  }

  const preferred = LIVE_MODEL_PREFERENCES.find(name => available.includes(name));
  const selected = preferred ?? available[0];
  if (!selected) {
    throw new Error('TrueForge has no configured model. Add a provider in TrueForge Settings → Models.');
  }
  return selected;
}

export const FORGECANARY_MCP_NAMES = {
  v1: 'forgecanary-inventory-v1',
  v2: 'forgecanary-inventory-v2',
  control: 'forgecanary-adapter-control'
} as const;

export const FORGECANARY_TEST_MODEL = TEST_MODEL;
