import { createServer, type ServerResponse } from 'node:http';
import { readFileSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import { readIntegerArg } from './args.js';
import { isCaseConflict } from './case-store.js';
import type { CaseTraceEvent } from './case-types.js';
import { ForgeCanaryService } from './forgecanary-service.js';
import { readJsonBody, sendJson } from './http.js';

const port = readIntegerArg('port', 9300);
const root = resolve('.');
const service = new ForgeCanaryService();
const publicFiles = new Map([
  ['/', 'web/index.html'],
  ['/index.html', 'web/index.html'],
  ['/styles.css', 'web/styles.css'],
  ['/app.js', 'web/app.js']
]);
const contentTypes: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8'
};

function sendApiError(response: ServerResponse, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  const status =
    isCaseConflict(error) ||
    message.includes('approval') ||
    message.includes('reset while') ||
    message.includes('already active')
      ? 409
      : 500;
  sendJson(response, status, { error: message });
}

function sendSse(response: ServerResponse, event: CaseTraceEvent): void {
  response.write(`id: ${event.id}\n`);
  response.write('event: trace\n');
  response.write(`data: ${JSON.stringify(event)}\n\n`);
}

function serveStatic(pathname: string, response: ServerResponse): boolean {
  const relativePath = publicFiles.get(pathname);
  if (!relativePath) return false;
  const body = readFileSync(resolve(root, relativePath));
  response.writeHead(200, {
    'content-type': contentTypes[extname(relativePath)] ?? 'application/octet-stream',
    'content-length': body.length,
    'cache-control': 'no-store'
  });
  response.end(body);
  return true;
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? '/', `http://${request.headers.host ?? `127.0.0.1:${port}`}`);
    const method = request.method ?? 'GET';

    if (url.pathname === '/health' && method === 'GET') {
      sendJson(response, 200, { status: 'ok' });
      return;
    }
    if (url.pathname === '/api/health' && method === 'GET') {
      const health = await service.health();
      sendJson(response, health.ok ? 200 : 503, health);
      return;
    }
    if (url.pathname === '/api/config' && method === 'GET') {
      sendJson(response, 200, await service.publicConfig());
      return;
    }
    if (url.pathname === '/api/cases/current' && method === 'GET') {
      sendJson(response, 200, { case: service.store.get() });
      return;
    }
    if (url.pathname === '/api/cases' && method === 'POST') {
      sendJson(response, 202, { case: await service.startCase() });
      return;
    }
    if (url.pathname === '/api/demo/reset' && method === 'POST') {
      sendJson(response, 200, await service.resetDemo());
      return;
    }

    const caseMatch = /^\/api\/cases\/([^/]+)$/.exec(url.pathname);
    if (caseMatch && method === 'GET') {
      sendJson(response, 200, { case: service.store.require(decodeURIComponent(caseMatch[1] ?? '')) });
      return;
    }

    const eventsMatch = /^\/api\/cases\/([^/]+)\/events$/.exec(url.pathname);
    if (eventsMatch && method === 'GET') {
      const caseId = decodeURIComponent(eventsMatch[1] ?? '');
      const current = service.store.require(caseId);
      const rawLastEventId = request.headers['last-event-id'] ?? url.searchParams.get('after') ?? '0';
      const lastEventId = Number.parseInt(Array.isArray(rawLastEventId) ? rawLastEventId[0] ?? '0' : rawLastEventId, 10);
      response.writeHead(200, {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache, no-transform',
        connection: 'keep-alive',
        'x-accel-buffering': 'no'
      });
      response.write('retry: 1500\n\n');
      for (const event of current.events.filter(item => item.id > (Number.isFinite(lastEventId) ? lastEventId : 0))) {
        sendSse(response, event);
      }
      const unsubscribe = service.store.subscribe(caseId, event => sendSse(response, event));
      const heartbeat = setInterval(() => response.write(': keepalive\n\n'), 15_000);
      request.on('close', () => {
        clearInterval(heartbeat);
        unsubscribe();
      });
      return;
    }

    const approvalMatch = /^\/api\/cases\/([^/]+)\/approval$/.exec(url.pathname);
    if (approvalMatch && method === 'POST') {
      const caseId = decodeURIComponent(approvalMatch[1] ?? '');
      const body = await readJsonBody<{ decision?: string }>(request);
      if (body.decision !== 'allow' && body.decision !== 'deny') {
        sendJson(response, 400, { error: 'decision must be allow or deny' });
        return;
      }
      sendJson(response, 200, { case: await service.decideApproval(caseId, body.decision) });
      return;
    }

    const retryMatch = /^\/api\/cases\/([^/]+)\/retry-approval$/.exec(url.pathname);
    if (retryMatch && method === 'POST') {
      const caseId = decodeURIComponent(retryMatch[1] ?? '');
      sendJson(response, 200, { case: await service.retryApproval(caseId) });
      return;
    }

    const receiptMatch = /^\/api\/cases\/([^/]+)\/receipt$/.exec(url.pathname);
    if (receiptMatch && method === 'GET') {
      const caseId = decodeURIComponent(receiptMatch[1] ?? '');
      const current = service.store.require(caseId);
      if (!current.receipt) {
        sendJson(response, 404, { error: 'No receipt exists for this case yet' });
        return;
      }
      const body = `${JSON.stringify(current.receipt, null, 2)}\n`;
      response.writeHead(200, {
        'content-type': 'application/json; charset=utf-8',
        'content-length': Buffer.byteLength(body),
        'content-disposition': `attachment; filename="forgecanary-${caseId}.json"`,
        'cache-control': 'no-store'
      });
      response.end(body);
      return;
    }

    if (method === 'GET' && serveStatic(url.pathname, response)) return;
    sendJson(response, 404, { error: 'not_found' });
  } catch (error) {
    sendApiError(response, error);
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`ForgeCanary operator console listening at http://127.0.0.1:${port}`);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
