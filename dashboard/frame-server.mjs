// Local dashboard + bounded demo-image proxy for legacy Android frames.
// Upstream TLS is checked by Node; the frame receives assets over Wi-Fi or its USB localhost link.
import http from 'node:http';
import { readFile, stat, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRingBridge, keyringAuthorization } from './ringos.mjs';
import { readDashboardRelease, stampDashboardRelease } from './dashboard-release.mjs';
import { githubUpdates } from './github-updates.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), 'dist');
const releaseCache = path.join(path.dirname(fileURLToPath(import.meta.url)), '.release-cache');
const releases = githubUpdates({ fallback: root, cache: releaseCache });
const port = Number(process.env.FRAME_PORT || 4173);
const hosts = new Set(['picsum.photos', 'fastly.picsum.photos']);
const cache = new Map();
const pending = new Map();
const lights = createRingBridge({ authorization: keyringAuthorization() });
let cacheBytes = 0;
const CACHE_LIMIT = 8 * 1024 * 1024;
const IMAGE_LIMIT = 4 * 1024 * 1024;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webmanifest': 'application/manifest+json' };

async function image(key) {
  if (cache.has(key)) {
    const value = cache.get(key);
    cache.delete(key);
    cache.set(key, value);
    return value;
  }
  if (pending.has(key)) return pending.get(key);
  if (pending.size >= 4) throw new Error('Image request limit reached');
  const task = (async () => {
    let url = new URL('https://picsum.photos/seed/' + key);
    let response;
    const signal = AbortSignal.timeout(20000);
    for (let hop = 0; hop < 5; hop++) {
      if (url.protocol !== 'https:' || !hosts.has(url.hostname) || url.port || url.username || url.password) {
        throw new Error('Unexpected image redirect');
      }
      response = await fetch(url, { redirect: 'manual', signal });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const next = response.headers.get('location');
        await response.body?.cancel();
        if (!next) throw new Error('Missing redirect');
        url = new URL(next, url);
      } else break;
    }
    const type = response.headers.get('content-type')?.split(';')[0];
    if (!response.ok || !['image/jpeg', 'image/png'].includes(type)) {
      await response.body?.cancel();
      throw new Error('Invalid image response');
    }
    const chunks = [];
    let length = 0;
    for await (const chunk of response.body) {
      length += chunk.length;
      if (length > IMAGE_LIMIT) throw new Error('Image too large');
      chunks.push(chunk);
    }
    const value = { bytes: Buffer.concat(chunks), type };
    while (cache.size && cacheBytes + length > CACHE_LIMIT) {
      const oldest = cache.keys().next().value;
      cacheBytes -= cache.get(oldest).bytes.length;
      cache.delete(oldest);
    }
    cache.set(key, value);
    cacheBytes += length;
    return value;
  })();
  pending.set(key, task);
  try { return await task; }
  finally { pending.delete(key); }
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://localhost');
    if (await lights.handle(request, response, url)) return;
    if (!['GET', 'HEAD'].includes(request.method)) {
      response.writeHead(405, { Allow: 'GET, HEAD' }).end();
      return;
    }
    if (url.pathname === '/api/dashboard-update') {
      const { version, builtAt, assets, tag, updateError } = await releases.check();
      response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      response.end(request.method === 'HEAD' ? undefined : JSON.stringify({ version, builtAt, assets, tag, updateError }));
      return;
    }
    if (url.pathname === '/' || url.pathname === '/index.html') {
      let release = await releases.current();
      const build = url.searchParams.get('build');
      if (build && /^[a-f0-9]{16}$/.test(build)) {
        try { release = await readDashboardRelease(path.join(releaseCache, build)); }
        catch { /* Local build or removed cache: use the current complete release. */ }
      }
      const bytes = Buffer.from(stampDashboardRelease(release));
      response.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store',
        'Content-Length': bytes.length, 'X-Dashboard-Build': release.version });
      response.end(request.method === 'HEAD' ? undefined : bytes);
      return;
    }
    if (url.pathname.startsWith('/demo-images/')) {
      const m = url.pathname.match(/^\/demo-images\/([a-zA-Z0-9_-]{1,64})\/(\d{1,4})\/(\d{1,4})$/);
      if (!m || Number(m[2]) < 1 || Number(m[3]) < 1
          || Number(m[2]) > 1600 || Number(m[3]) > 1200
          || Number(m[2]) * Number(m[3]) > 1920000) {
        response.writeHead(400).end('Invalid demo image');
        return;
      }
      const asset = await image(m.slice(1).join('/'));
      response.writeHead(200, { 'Content-Type': asset.type, 'Content-Length': asset.bytes.length,
        'Cache-Control': 'public, max-age=21600', 'X-Content-Type-Options': 'nosniff' });
      response.end(request.method === 'HEAD' ? undefined : asset.bytes);
      return;
    }
    const relative = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
    const active = await releases.current();
    let file = path.resolve(active.root, '.' + relative);
    if (!file.startsWith(active.root + path.sep)) {
      response.writeHead(403).end();
      return;
    }
    let info;
    try { info = await stat(file); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      // A display may keep its old page open after a newer release is staged.
      const roots = [root, ...(await readdir(releaseCache).catch(() => []))
        .filter(name => /^[a-f0-9]{16}$/.test(name)).map(name => path.join(releaseCache, name))];
      for (const directory of roots) {
        const candidate = path.resolve(directory, '.' + relative);
        if (!candidate.startsWith(directory + path.sep)) continue;
        try { info = await stat(candidate); file = candidate; break; } catch { /* Next cache. */ }
      }
      if (!info) throw error;
    }
    if (!info.isFile()) { response.writeHead(404).end(); return; }
    response.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream',
      'Content-Length': info.size, 'Cache-Control': relative.startsWith('/assets/')
        ? 'public, max-age=31536000, immutable' : 'no-cache', 'X-Content-Type-Options': 'nosniff' });
    response.end(request.method === 'HEAD' ? undefined : await readFile(file));
  } catch (error) {
    if (response.headersSent) { response.destroy(); return; }
    const status = error.code === 'ENOENT' ? 404 : error instanceof URIError ? 400 : 502;
    response.writeHead(status).end(status === 404 ? 'Not found' : 'Asset unavailable');
  }
});
server.listen(port, '0.0.0.0', () => console.log(`Frame dashboard listening on port ${port}`));
