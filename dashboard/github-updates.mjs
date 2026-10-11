import { createHash, randomBytes } from 'node:crypto';
import { readFile, writeFile, mkdir, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { readDashboardRelease } from './dashboard-release.mjs';

export const RELEASE_REPO = 'nearbycoder/frame-dashboard';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const safeFile = name => name === 'index.html' || /^assets\/[a-zA-Z0-9_.-]+$/.test(name)
  || ['icon-192.png', 'icon-512.png', 'manifest.webmanifest'].includes(name);

export async function bundleDashboard(root, tag) {
  if (!/^v\d+\.\d+\.\d+$/.test(tag)) throw new Error('Use a v1.2.3 release tag.');
  const release = await readDashboardRelease(root);
  const files = [];
  for (const name of ['index.html', ...release.assets.map(asset => asset.slice(1)),
    'icon-192.png', 'icon-512.png', 'manifest.webmanifest']) {
    const bytes = await readFile(path.join(root, name));
    files.push({ name, sha256: hash(bytes), data: bytes.toString('base64') });
  }
  return { schema: 1, tag, version: release.version, builtAt: new Date().toISOString(), files };
}

export async function stageBundle(bundle, cache) {
  if (!bundle || bundle.schema !== 1 || !/^v\d+\.\d+\.\d+$/.test(bundle.tag)
    || !/^[a-f0-9]{16}$/.test(bundle.version) || !Array.isArray(bundle.files)
    || bundle.files.length < 3 || bundle.files.length > 45) throw new Error('Invalid release bundle.');
  const files = new Map(); let total = 0;
  for (const file of bundle.files) {
    if (!file || !safeFile(file.name) || files.has(file.name) || typeof file.data !== 'string'
      || !/^[a-f0-9]{64}$/.test(file.sha256) || file.data.length > 8 * 1024 * 1024) throw new Error('Invalid release file.');
    const bytes = Buffer.from(file.data, 'base64'); total += bytes.length;
    if (!bytes.length || total > 10 * 1024 * 1024 || hash(bytes) !== file.sha256) throw new Error('Release checksum mismatch.');
    files.set(file.name, bytes);
  }
  if (!files.has('index.html') || hash(files.get('index.html')).slice(0, 16) !== bundle.version) throw new Error('Release version mismatch.');
  await mkdir(cache, { recursive: true });
  const temp = path.join(cache, '.stage-' + randomBytes(8).toString('hex'));
  const root = path.join(cache, bundle.version);
  try {
    for (const [name, bytes] of files) {
      await mkdir(path.dirname(path.join(temp, name)), { recursive: true });
      await writeFile(path.join(temp, name), bytes);
    }
    const release = await readDashboardRelease(temp);
    await writeFile(path.join(temp, 'release.json'), JSON.stringify({ tag: bundle.tag, version: bundle.version, builtAt: bundle.builtAt }));
    try { await rename(temp, root); }
    catch (error) {
      if (!['EEXIST', 'ENOTEMPTY'].includes(error.code)) throw error;
      // Reuse only a complete cached copy; do not replace files in a live release.
      const cached = await readDashboardRelease(root);
      if (cached.version !== release.version) throw new Error('Invalid cached release.');
    }
    return { root, ...release, tag: bundle.tag, builtAt: bundle.builtAt };
  } finally { await rm(temp, { recursive: true, force: true }); }
}

async function download(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(30000), headers: { 'User-Agent': 'FrameDashboardUpdates/1.0' } });
  if (!response.ok) throw new Error('GitHub release unavailable.');
  const chunks = []; let total = 0;
  for await (const chunk of response.body) {
    total += chunk.length;
    if (total > 15 * 1024 * 1024) throw new Error('Release exceeds download limit.');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

export function githubUpdates({ fallback, cache, tag = process.env.FRAME_RELEASE_TAG, transport = download, interval = 60000 }) {
  if (tag && !/^v\d+\.\d+\.\d+$/.test(tag)) throw new Error('Invalid pinned release tag.');
  let active = null, pending = null, expires = 0;
  const url = `https://github.com/${RELEASE_REPO}/releases/` + (tag ? `download/${tag}/` : 'latest/download/') + 'dashboard-bundle.json';
  return {
    async current() {
      if (!active) {
        try {
          const saved = JSON.parse(await readFile(path.join(cache, 'active.json'), 'utf8'));
          if (/^[a-f0-9]{16}$/.test(saved.version)) {
            const root = path.join(cache, saved.version);
            const release = await readDashboardRelease(root);
            if (release.version === saved.version) active = { root, ...release, ...saved };
          }
        } catch { /* First start uses the local build. */ }
        if (!active) active = { root: fallback, ...await readDashboardRelease(fallback) };
      }
      return active;
    },
    async check() {
      await this.current();
      if (pending) return pending;
      if (Date.now() < expires) return active;
      expires = Date.now() + interval;
      pending = (async () => {
        try {
          const bundle = await transport(url);
          if (tag && bundle.tag !== tag) throw new Error('Pinned release mismatch.');
          const next = await stageBundle(bundle, cache);
          await writeFile(path.join(cache, 'active.json.tmp'), JSON.stringify({ version: next.version, tag: next.tag, builtAt: next.builtAt }));
          await rename(path.join(cache, 'active.json.tmp'), path.join(cache, 'active.json'));
          active = next;
        } catch {
          active = { ...active, updateError: 'Could not check GitHub. Your current dashboard is still available.' };
        }
        return active;
      })().finally(() => { pending = null; });
      return pending;
    }
  };
}
