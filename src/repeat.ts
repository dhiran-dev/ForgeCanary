import { spawn } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { sha256 } from './domain.js';

const CONTROL_BASE_URL = process.env.CONTROL_BASE_URL ?? 'http://127.0.0.1:9200';
const V1_BASE_URL = process.env.V1_FIXTURE_BASE_URL ?? 'http://127.0.0.1:9101';
const V2_BASE_URL = process.env.V2_FIXTURE_BASE_URL ?? 'http://127.0.0.1:9102';

interface ReplayEvidence {
  status: string;
  schema: { v1Hash: string; v2Hash: string; identical: boolean };
  summary: {
    historicalJobs: number;
    candidateJobs: number;
    protocolGreen: number;
    semanticGreen: number;
    semanticRed: number;
    affectedOrders: string[];
  };
  matrix: Array<{
    orderId: string;
    callArgumentsEqual: boolean;
    toolResponsesEqual: boolean;
    protocolTranscriptEqual: boolean;
    baselineOracle: { passed: boolean; actualLotId: string | null };
    candidateOracle: { passed: boolean; actualLotId: string | null; expectedLotId: string | null };
  }>;
}

interface ApprovalEvidence {
  status: string;
  deny: { zeroMutation: boolean };
  approve: { scopedMutation: boolean };
  repairedMatrix: Array<{
    orderId: string;
    callArgumentsEqual: boolean;
    toolResponsesEqual: boolean;
    oracle: { passed: boolean; actualLotId: string | null };
  }>;
  rollback: { reversible: boolean };
}

interface CommandResult {
  stdout: string;
  stderr: string;
}

function run(command: string, args: string[]): Promise<CommandResult> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', chunk => {
      stdout += chunk;
    });
    child.stderr.setEncoding('utf8').on('data', chunk => {
      stderr += chunk;
    });
    child.once('error', reject);
    child.once('close', code => {
      if (code === 0) resolvePromise({ stdout, stderr });
      else reject(new Error(`${command} ${args.join(' ')} exited ${code}\n${stdout}\n${stderr}`));
    });
  });
}

async function reset(baseUrl: string): Promise<void> {
  const response = await fetch(`${baseUrl}/reset`, { method: 'POST' });
  if (!response.ok) throw new Error(`Reset failed for ${baseUrl}: ${response.status} ${await response.text()}`);
}

function normalize(replay: ReplayEvidence, approval: ApprovalEvidence): unknown {
  return {
    replayStatus: replay.status,
    schema: replay.schema,
    summary: replay.summary,
    changedMatrix: replay.matrix.map(row => ({
      orderId: row.orderId,
      callArgumentsEqual: row.callArgumentsEqual,
      toolResponsesEqual: row.toolResponsesEqual,
      protocolTranscriptEqual: row.protocolTranscriptEqual,
      baselinePassed: row.baselineOracle.passed,
      candidatePassed: row.candidateOracle.passed,
      candidateActualLotId: row.candidateOracle.actualLotId,
      expectedLotId: row.candidateOracle.expectedLotId
    })),
    approvalStatus: approval.status,
    denyZeroMutation: approval.deny.zeroMutation,
    approvalScopedMutation: approval.approve.scopedMutation,
    repairedMatrix: approval.repairedMatrix.map(row => ({
      orderId: row.orderId,
      callArgumentsEqual: row.callArgumentsEqual,
      toolResponsesEqual: row.toolResponsesEqual,
      passed: row.oracle.passed,
      actualLotId: row.oracle.actualLotId
    })),
    reversible: approval.rollback.reversible
  };
}

async function main(): Promise<void> {
  const runDirectory = resolve('evidence', `triple-${new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-')}`);
  mkdirSync(runDirectory, { recursive: true });
  const loops = [];

  for (let index = 1; index <= 3; index += 1) {
    await Promise.all([reset(CONTROL_BASE_URL), reset(V1_BASE_URL), reset(V2_BASE_URL)]);
    const startedAt = Date.now();
    const replayCommand = await run('npm', ['run', 'replay']);
    copyFileSync(resolve('evidence/replay.json'), resolve(runDirectory, `run-${index}-replay.json`));
    const approvalCommand = await run('npm', ['run', 'approval']);
    copyFileSync(resolve('evidence/approval.json'), resolve(runDirectory, `run-${index}-approval.json`));
    const durationMs = Date.now() - startedAt;
    const replay = JSON.parse(readFileSync(resolve('evidence/replay.json'), 'utf8')) as ReplayEvidence;
    const approval = JSON.parse(readFileSync(resolve('evidence/approval.json'), 'utf8')) as ApprovalEvidence;
    const normalized = normalize(replay, approval);
    const outcomeHash = sha256(normalized);
    const passed =
      replay.status === 'PASS' &&
      replay.schema.identical &&
      replay.summary.protocolGreen === 6 &&
      replay.summary.semanticRed === 1 &&
      replay.summary.affectedOrders.length === 1 &&
      replay.summary.affectedOrders[0] === 'FC-1001' &&
      approval.status === 'PASS' &&
      approval.deny.zeroMutation &&
      approval.approve.scopedMutation &&
      approval.repairedMatrix.every(row => row.oracle.passed) &&
      approval.rollback.reversible &&
      durationMs < 150_000;
    if (!passed) throw new Error(`Repeat loop ${index} failed its gate`);
    loops.push({
      run: index,
      passed,
      durationMs,
      outcomeHash,
      replayStdout: replayCommand.stdout.trim().split(/\r?\n/).slice(-12),
      approvalStdout: approvalCommand.stdout.trim().split(/\r?\n/).slice(-14),
      warnings: [replayCommand.stderr, approvalCommand.stderr].filter(Boolean)
    });
    console.log(`loop ${index}: PASS in ${(durationMs / 1000).toFixed(2)}s (${outcomeHash.slice(0, 12)})`);
  }

  const hashes = new Set(loops.map(loop => loop.outcomeHash));
  const deterministic = hashes.size === 1;
  if (!deterministic) throw new Error(`Consecutive loops produced ${hashes.size} normalized outcome hashes`);
  const evidence = {
    status: 'PASS',
    scope: 'three-consecutive-reset-complete-loops',
    generatedAt: new Date().toISOString(),
    testInfrastructure: {
      model: 'deterministic local OpenAI-compatible shim',
      limitation: 'Repeat with a real configured model before presenting live release evidence.'
    },
    runDirectory,
    requiredLoops: 3,
    completedLoops: loops.length,
    deterministic,
    demoTimeLimitMs: 150_000,
    maxLoopDurationMs: Math.max(...loops.map(loop => loop.durationMs)),
    normalizedOutcomeHash: loops[0]?.outcomeHash,
    loops
  };
  const evidencePath = resolve('evidence/triple-run.json');
  writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  console.log(
    JSON.stringify(
      {
        evidencePath,
        completedLoops: evidence.completedLoops,
        deterministic,
        maxLoopDurationMs: evidence.maxLoopDurationMs,
        normalizedOutcomeHash: evidence.normalizedOutcomeHash
      },
      null,
      2
    )
  );
}

await main();
