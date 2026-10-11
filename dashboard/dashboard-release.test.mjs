import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { readDashboardRelease, stampDashboardRelease } from './dashboard-release.mjs';
test('complete releases get a content version and stamp; an incomplete publish is never announced', async t => {
 const root = await mkdtemp(path.join(os.tmpdir(), 'frame-release-')); t.after(()=>rm(root,{recursive:true,force:true}));
 await mkdir(path.join(root,'assets'));
 await writeFile(path.join(root,'index.html'),'<head><script src="/assets/a.js"></script><link href="/assets/a.css"></head>');
 await writeFile(path.join(root,'assets/a.js'),'app();');
 await assert.rejects(readDashboardRelease(root));
 await writeFile(path.join(root,'assets/a.css'),'body{}');
 const first=await readDashboardRelease(root); assert.equal(first.assets.length,2);
 assert.ok(stampDashboardRelease(first).includes('content="'+first.version+'"'));
 await writeFile(path.join(root,'assets/b.js'),'updated();');
 await writeFile(path.join(root,'index.html'),'<head><script src="/assets/b.js"></script><link href="/assets/a.css"></head>');
 const next=await readDashboardRelease(root); assert.notEqual(next.version,first.version);
 // The previous release stays downloadable while a frame is awaiting Update.
 assert.ok((await readDashboardRelease(root)).assets.includes('/assets/b.js'));
});
