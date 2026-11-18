// A minimal static file server for site/, used by the playthrough. Node only, no dependencies.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, normalize, extname } from 'node:path';

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png' };

/**
 * Serves dir on a free local port. Resolves to { url, close }.
 * overrides: { 'cases/007.json': '/abs/path/to/file' } serves another file at that path.
 */
export function serve(dir, overrides = {}) {
  const server = createServer(async (req, res) => {
    const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const own = overrides[path.replace(/^\//, '')];
    const file = own || normalize(join(dir, path.endsWith('/') ? path + 'index.html' : path));
    if (!own && !file.startsWith(normalize(dir))) { res.writeHead(403).end(); return; }
    try {
      const body = await readFile(file);
      res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' }).end(body);
    } catch {
      res.writeHead(404).end('not found');
    }
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => {
    resolve({ url: `http://127.0.0.1:${server.address().port}/`, close: () => new Promise((r) => server.close(r)) });
  }));
}
