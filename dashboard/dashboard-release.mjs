import { readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

export async function readDashboardRelease(root) {
  const html = await readFile(path.join(root, 'index.html'), 'utf8');
  const assets = [...new Set([...html.matchAll(/(?:src|href)="(\/assets\/[a-zA-Z0-9_.-]+)"/g)].map(match => match[1]))];
  if (!assets.length) throw new Error('Dashboard build is incomplete.');
  // Never announce a build until every referenced script and stylesheet exists.
  for (const asset of assets) {
    const info = await stat(path.join(root, asset));
    if (!info.isFile() || !info.size) throw new Error('Dashboard build is incomplete.');
  }
  const info = await stat(path.join(root, 'index.html'));
  return { html, version: createHash('sha256').update(html).digest('hex').slice(0, 16),
    builtAt: info.mtime.toISOString(), assets };
}
export function stampDashboardRelease(release) {
  return release.html.replace('</head>', '<meta name="dashboard-build" content="' + release.version + '"></head>');
}
