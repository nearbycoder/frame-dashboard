import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { bundleDashboard, stageBundle, githubUpdates } from './github-updates.mjs';

async function fixture(t) {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'frame-release-'));
  t.after(() => rm(temp, { recursive: true, force: true }));
  const root = path.join(temp, 'dist'), cache = path.join(temp, 'cache');
  await mkdir(path.join(root, 'assets'), { recursive: true });
  await writeFile(path.join(root, 'index.html'), '<head></head><script src="/assets/app-a.js"></script>');
  await writeFile(path.join(root, 'assets/app-a.js'), 'console.log("one");');
  for (const file of ['icon-192.png', 'icon-512.png', 'manifest.webmanifest']) await writeFile(path.join(root, file), '{}');
  return { root, cache, bundle: await bundleDashboard(root, 'v1.0.0') };
}
test('reject corrupt files, missing referenced assets, traversal and duplicate names before publication', async t => {
  const { cache, bundle } = await fixture(t);
  for (const change of [b => b.files[1].data = 'Y29ycnVwdA==', b => b.files.splice(1, 1),
    b => b.files[1].name = '../secret', b => b.files.push(b.files[1])]) {
    const bad = structuredClone(bundle); change(bad);
    await assert.rejects(stageBundle(bad, cache));
  }
});
test('GitHub outage or failed release keeps the last complete release; cache survives restart', async t => {
  const { root, cache, bundle } = await fixture(t);
  let fail = false;
  const updates = githubUpdates({ fallback: root, cache, interval: 0, transport: async url => {
    assert.match(url, /^https:\/\/github.com\/nearbycoder\/frame-dashboard\/releases\/latest\/download\//);
    if (fail) throw new Error('offline'); return bundle;
  } });
  const good = await updates.check();
  assert.equal(good.tag, 'v1.0.0'); assert.notEqual(good.root, root);
  fail = true;
  const offline = await updates.check();
  assert.equal(offline.version, good.version); assert.ok(offline.updateError);
  const restarted = githubUpdates({ fallback: root, cache });
  assert.equal((await restarted.current()).tag, 'v1.0.0');
});
test('rollback tag is pinned and cannot silently select another release', async t => {
  const { root, cache, bundle } = await fixture(t);
  const updates = githubUpdates({ fallback: root, cache, tag: 'v0.9.0', transport: async url => {
    assert.ok(url.includes('/download/v0.9.0/')); return bundle;
  } });
  const result = await updates.check(); assert.ok(result.updateError); assert.equal(result.root, root);
});
