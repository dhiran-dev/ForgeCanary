import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import { readIntegerArg } from './args.js';
import { sendError, sendJson } from './http.js';

const port = readIntegerArg('port', 9300);
const root = resolve('.');
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

function readEvidence(path: string): unknown {
  return JSON.parse(readFileSync(resolve(root, path), 'utf8')) as unknown;
}

const server = createServer((request, response) => {
  try {
    const url = new URL(request.url ?? '/', `http://${request.headers.host ?? `127.0.0.1:${port}`}`);
    if (url.pathname === '/health' && request.method === 'GET') {
      sendJson(response, 200, { status: 'ok' });
      return;
    }
    if (url.pathname === '/api/evidence' && request.method === 'GET') {
      sendJson(response, 200, {
        replay: readEvidence('evidence/replay.json'),
        approval: readEvidence('evidence/approval.json'),
        repeat: readEvidence('evidence/triple-run.json'),
        preflight: readEvidence('decision/evidence-gated-preflight.json')
      });
      return;
    }
    const relativePath = publicFiles.get(url.pathname);
    if (!relativePath || request.method !== 'GET') {
      sendJson(response, 404, { error: 'not_found' });
      return;
    }
    const body = readFileSync(resolve(root, relativePath));
    response.writeHead(200, {
      'content-type': contentTypes[extname(relativePath)] ?? 'application/octet-stream',
      'content-length': body.length,
      'cache-control': 'no-store'
    });
    response.end(body);
  } catch (error) {
    sendError(response, error);
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`ForgeCanary evidence console listening at http://127.0.0.1:${port}`);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => server.close(() => process.exit(0)));
}

