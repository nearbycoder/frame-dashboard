import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const bootstrap = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const core = readFileSync(new URL('./js/app.js', import.meta.url), 'utf8');

function boot(storage) {
  const root = { dataset: {}, classList: { toggle() {} } };
  const stage = { dataset: { mode: 'day' } }, meta = {};
  const context = {
    window: { DATA: {} }, localStorage: storage,
    document: { documentElement: root, addEventListener() {}, querySelector: s => s === '#stage' ? stage : meta },
    location: { search: '?lite=1' }, navigator: { userAgent: 'Android 6 HomeHQKiosk' },
  };
  vm.createContext(context);
  vm.runInContext(bootstrap, context);
  vm.runInContext(core, context);
  return { app: context.window.App, root, stage, meta };
}

test('dark dashboard preference survives overlays and a new page boot', () => {
  const values = new Map();
  const storage = { getItem: k => values.get(k), setItem: (k, v) => values.set(k, v) };
  const f = boot(storage);
  f.app.setMode('dark');
  assert.equal(f.root.dataset.theme, 'dark');
  assert.equal(f.app.mode, 'day'); // Normal interactive dashboard and idle behaviour.
  for (const mode of ['ambient', 'night', 'nightdash']) {
    f.app.setMode(mode);
    assert.equal(f.app.theme, 'dark');
    f.app.resumeDashboard();
    assert.equal(f.stage.dataset.mode, 'day');
    assert.equal(f.root.dataset.theme, 'dark');
  }
  const reloaded = boot(storage);
  assert.equal(reloaded.app.theme, 'dark');
  assert.equal(reloaded.root.dataset.theme, 'dark');
  assert.equal(reloaded.meta.content, '#17191D');
  reloaded.app.setMode('day');
  assert.equal(boot(storage).app.theme, 'light');
});

test('unavailable storage still permits theme changes and invalid modes do nothing', () => {
  const f = boot({ getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); } });
  assert.equal(f.app.theme, 'light');
  f.app.setMode('dark');
  f.app.setMode('unknown');
  assert.equal(f.root.dataset.theme, 'dark');
  assert.equal(f.app.mode, 'day');
});
