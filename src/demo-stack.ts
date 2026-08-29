import { spawn, type ChildProcess } from 'node:child_process';
import { resolve } from 'node:path';

interface ManagedService {
  name: string;
  command: string;
  args: string[];
  readyUrl: string;
  env?: NodeJS.ProcessEnv;
}

const mode = process.env.FORGECANARY_MODE === 'test' ? 'test' : 'live';
const trueforgeBaseUrl = process.env.TRUEFORGE_BASE_URL ?? 'http://localhost:8790';
const tsxPath = resolve('node_modules/.bin/tsx');
const trueforgePath = resolve('node_modules/.bin/trueforge');
const children: ChildProcess[] = [];
let stopping = false;

async function isReady(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(1_500) });
    return response.ok;
  } catch {
    return false;
  }
}

async function waitUntilReady(service: ManagedService, child: ChildProcess, timeoutMs = 20_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`${service.name} exited before it became ready`);
    if (await isReady(service.readyUrl)) return;
    await new Promise(resolveWait => setTimeout(resolveWait, 250));
  }
  throw new Error(`${service.name} did not become ready at ${service.readyUrl}`);
}

function start(service: ManagedService): ChildProcess {
  const child = spawn(service.command, service.args, {
    cwd: process.cwd(),
    env: { ...process.env, ...service.env },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  children.push(child);
  child.stdout?.on('data', chunk => process.stdout.write(`[${service.name}] ${String(chunk)}`));
  child.stderr?.on('data', chunk => process.stderr.write(`[${service.name}] ${String(chunk)}`));
  child.on('error', error => {
    if (!stopping) {
      console.error(`[${service.name}] failed to start: ${error.message}`);
      void stop(1);
    }
  });
  child.on('exit', code => {
    if (!stopping) {
      console.error(`[${service.name}] stopped unexpectedly with exit code ${code ?? 'signal'}`);
      void stop(1);
    }
  });
  return child;
}

async function startAndWait(service: ManagedService): Promise<void> {
  if (await isReady(service.readyUrl)) {
    throw new Error(`${service.name} is already responding at ${service.readyUrl}. Stop the old demo stack first.`);
  }
  const child = start(service);
  await waitUntilReady(service, child);
  console.log(`[${service.name}] ready`);
}

async function stop(exitCode: number): Promise<void> {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (child.exitCode === null) child.kill('SIGTERM');
  }
  await Promise.all(
    children.map(
      child =>
        new Promise<void>(resolveExit => {
          if (child.exitCode !== null) return resolveExit();
          child.once('exit', () => resolveExit());
          setTimeout(resolveExit, 3_000).unref();
        })
    )
  );
  process.exit(exitCode);
}

async function main(): Promise<void> {
  if (mode === 'live') {
    if (!(await isReady(`${trueforgeBaseUrl}/healthz`))) {
      throw new Error(`TrueForge is not ready at ${trueforgeBaseUrl}. Launch it and configure a model first.`);
    }
    console.log(`[trueforge] using configured live runtime at ${trueforgeBaseUrl}`);
  } else {
    await startAndWait({
      name: 'model',
      command: tsxPath,
      args: ['src/model-server.ts'],
      readyUrl: 'http://127.0.0.1:9100/v1/models'
    });
    await startAndWait({
      name: 'trueforge',
      command: trueforgePath,
      args: ['--port', '8790'],
      readyUrl: `${trueforgeBaseUrl}/healthz`,
      env: { SQLITE_PATH: '.data/trueforge.sqlite' }
    });
  }

  const services: ManagedService[] = [
    {
      name: 'inventory-v1',
      command: tsxPath,
      args: ['src/fixture-server.ts', '--version', 'v1', '--port', '9101', '--state', '.data/v1-state.json', '--adapter', '.data/adapter.json'],
      readyUrl: 'http://127.0.0.1:9101/health'
    },
    {
      name: 'inventory-v2',
      command: tsxPath,
      args: ['src/fixture-server.ts', '--version', 'v2', '--port', '9102', '--state', '.data/v2-state.json', '--adapter', '.data/adapter.json'],
      readyUrl: 'http://127.0.0.1:9102/health'
    },
    {
      name: 'adapter-control',
      command: tsxPath,
      args: ['src/adapter-control-server.ts', '--port', '9200', '--adapter', '.data/adapter.json'],
      readyUrl: 'http://127.0.0.1:9200/health'
    }
  ];

  for (const service of services) await startAndWait(service);

  await startAndWait({
    name: 'operator-ui',
    command: tsxPath,
    args: ['src/evidence-server.ts', '--port', '9300'],
    readyUrl: 'http://127.0.0.1:9300/health',
    env: { FORGECANARY_MODE: mode, TRUEFORGE_BASE_URL: trueforgeBaseUrl }
  });

  console.log('');
  console.log('ForgeCanary is ready: http://127.0.0.1:9300');
  console.log(`TrueForge is ready:  ${trueforgeBaseUrl}`);
  console.log('Press Ctrl+C to stop the ForgeCanary services.');
  await new Promise<void>(() => undefined);
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => void stop(0));
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  void stop(1);
});
