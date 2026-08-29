import { createServer, type ServerResponse } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, relative, resolve, sep } from 'node:path';
import { readIntegerArg } from './args.js';
import { isCaseConflict } from './case-store.js';
import type { CaseTraceEvent } from './case-types.js';
import { ForgeCanaryService } from './forgecanary-service.js';
import { readJsonBody, sendJson } from './http.js';
import {
  createOperatorToken,
  OPERATOR_TOKEN_HEADER,
  validateOperatorMutation
} from './operator-security.js';

const port = readIntegerArg('port', 9300);
const staticRoot = resolve('dist/ui');
const service = new ForgeCanaryService();
const operatorToken = createOperatorToken();
const activeSseConnections = new Map<ServerResponse, () => void>();
const contentTypes: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
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
  const requested = pathname === '/' ? 'index.html' : decodeURIComponent(pathname).replace(/^\/+/, '');
  const candidate = resolve(staticRoot, requested);
  const candidateRelative = relative(staticRoot, candidate);
  if (candidateRelative.startsWith('..') || candidateRelative.includes(`..${sep}`)) return false;
  const filePath = existsSync(candidate) && statSync(candidate).isFile() ? candidate : resolve(staticRoot, 'index.html');
  if (!existsSync(filePath)) return false;
  const body = readFileSync(filePath);
  response.writeHead(200, {
    'content-type': contentTypes[extname(filePath)] ?? 'application/octet-stream',
    'content-length': body.length,
    'cache-control': filePath.endsWith('index.html') ? 'no-store' : 'public, max-age=31536000, immutable',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer'
  });
  response.end(body);
  return true;
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? '/', `http://${request.headers.host ?? `127.0.0.1:${port}`}`);
    const method = request.method ?? 'GET';

    if (method === 'POST') {
      const rawToken = request.headers[OPERATOR_TOKEN_HEADER];
      const rejection = validateOperatorMutation(
        {
          contentType: request.headers['content-type'],
          origin: request.headers.origin,
          expectedOrigin: `http://${request.headers.host ?? `127.0.0.1:${port}`}`,
          operatorToken: Array.isArray(rawToken) ? rawToken[0] : rawToken
        },
        operatorToken
      );
      if (rejection) {
        sendJson(response, rejection.status, { error: rejection.error });
        return;
      }
    }

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
      sendJson(response, 200, { ...(await service.publicConfig()), operatorToken });
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
      let closed = false;
      const close = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        unsubscribe();
        activeSseConnections.delete(response);
        if (!response.writableEnded) response.end();
      };
      activeSseConnections.set(response, close);
      request.on('close', close);
      response.on('error', close);
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

    if (url.pathname.startsWith('/api/')) {
      sendJson(response, 404, { error: 'not_found' });
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

let shuttingDown = false;
function shutdown(): void {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const close of activeSseConnections.values()) close();
  const forcedExit = setTimeout(() => process.exit(1), 3_000);
  forcedExit.unref();
  server.close(() => {
    clearTimeout(forcedExit);
    process.exit(0);
  });
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, shutdown);
}
