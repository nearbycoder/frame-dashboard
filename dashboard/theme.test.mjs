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
  assert.equal(f.app.festive, 'harvest');
  assert.equal(f.root.dataset.festive, 'harvest');
  assert.equal(f.meta.content, '#F7F1E5');
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
  assert.equal(reloaded.app.festive, 'harvest');
  assert.equal(reloaded.meta.content, '#1A110B');
  reloaded.app.setMode('day');
  assert.equal(boot(storage).app.theme, 'light');
});

test('Thanksgiving themes persist across overlays and page reloads, and classic restores neutral palette', () => {
  const values = new Map();
  const storage = { getItem: k => values.get(k), setItem: (k, v) => values.set(k, v) };
  const f = boot(storage);
  f.app.setFestive('cranberry');
  assert.equal(f.root.dataset.festive, 'cranberry');
  assert.equal(f.meta.content, '#F8F0E7');
  f.app.setMode('dark');
  assert.equal(f.meta.content, '#1A0E10');
  f.app.setMode('ambient');
  f.app.resumeDashboard();
  const reloaded = boot(storage);
  assert.equal(reloaded.app.festive, 'cranberry');
  assert.equal(reloaded.root.dataset.festive, 'cranberry');
  assert.equal(reloaded.app.theme, 'dark');
  assert.equal(reloaded.meta.content, '#1A0E10');

  reloaded.app.setFestive('autumn');
  assert.equal(boot(storage).app.festive, 'autumn');
  assert.equal(boot(storage).meta.content, '#111812');

  reloaded.app.setFestive('classic');
  const classicDark = boot(storage);
  assert.equal(classicDark.app.festive, 'classic');
  assert.equal(classicDark.meta.content, '#17191D');
  classicDark.app.setMode('day');
  assert.equal(boot(storage).meta.content, '#F2EEE6');
});

test('unavailable storage still permits theme changes and invalid modes or festive themes do nothing', () => {
  const f = boot({ getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); } });
  assert.equal(f.app.theme, 'light');
  assert.equal(f.app.festive, 'harvest');
  f.app.setMode('dark');
  f.app.setMode('unknown');
  f.app.setFestive('autumn');
  f.app.setFestive('evergreen');
  assert.equal(f.root.dataset.theme, 'dark');
  assert.equal(f.root.dataset.festive, 'autumn');
  assert.equal(f.app.mode, 'day');
});

test('Thanksgiving label handles Thanksgiving Day, Eve, weekend, countdown, and next year rollover', () => {
  const f = boot({ getItem() { return null; }, setItem() {} });
  assert.equal(f.app.thanksgivingLabel(new Date(2026, 10, 26, 12, 0)), 'Happy Thanksgiving!');
  assert.equal(f.app.thanksgivingLabel(new Date(2026, 10, 25, 9, 0)), 'Thanksgiving Eve');
  assert.equal(f.app.thanksgivingLabel(new Date(2026, 10, 24, 18, 0)), '2 days to Thanksgiving');
  assert.equal(f.app.thanksgivingLabel(new Date(2026, 10, 28, 15, 0)), 'Thankful Weekend');
  assert.equal(f.app.thanksgivingLabel(new Date(2026, 11, 1, 10, 0)), '359 days to Thanksgiving');
  assert.equal(f.app.thanksgivingLabel(new Date(2027, 10, 25, 10, 0)), 'Happy Thanksgiving!');
});
