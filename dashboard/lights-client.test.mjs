import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const tick = () => new Promise(resolve => setImmediate(resolve));
function client() {
  const requests = [];
  class XHR {
    open(method, path) { this.method = method; this.path = path; }
    setRequestHeader() {}
    send(body) { this.body = body ? JSON.parse(body) : null; requests.push(this); }
    reply(value, status = 200) { this.status = status; this.responseText = JSON.stringify(value); this.onload(); }
  }
  const App = { on() {}, emit() {}, toast() {}, esc: String };
  const context = { App, XMLHttpRequest: XHR, Promise, setInterval() {}, document: { hidden: false } };
  vm.runInNewContext(readFileSync(new URL('./js/lights.js', import.meta.url), 'utf8'), context);
  const lights = App.lights;
  lights.items = ['a', 'b'].map(id => ({ id: 'light.' + id, name: id, on: true, available: true, level: 100 }));
  lights.key = 'test'; lights.loaded = true;
  return { lights, requests };
}
function response(id, level) { return { light: { id: 'light.' + id, name: id, available: true, on: level > 0, level } }; }

test('two lights send concurrently, repeated same-light gestures coalesce, old polling cannot overwrite them', async () => {
  const { lights, requests } = client();
  const refresh = lights.refresh();
  const first = lights.control('light.a', { brightness: 20 });
  const second = lights.control('light.a', { brightness: 40 });
  const third = lights.control('light.a', { brightness: 60 });
  const other = lights.control('light.b', { brightness: 30 });
  assert.equal(requests.length, 3); // one read and two concurrent writes
  assert.equal(lights.view('light.a').level, 60);
  requests[2].reply(response('b', 30)); await tick();
  requests[1].reply(response('a', 20)); await tick();
  assert.equal(requests.length, 4);
  assert.equal(requests[3].body.brightness, 60); // 40 never goes upstream
  requests[0].reply({ lights: [response('a', 100).light, response('b', 100).light], controlKey: 'test', syncedAt: 'now' });
  await refresh;
  assert.equal(lights.view('light.a').level, 60);
  assert.equal(lights.view('light.b').level, 30);
  requests[3].reply(response('a', 60));
  await Promise.all([first, second, third, other]); await tick();
  assert.equal(Object.keys(lights.pending).length, 0);
  assert.equal(lights.view('light.a').level, 60);
});

test('failed writes roll back, do not retry, and do not block another light', async () => {
  const { lights, requests } = client();
  const failed = lights.control('light.a', { brightness: 20 });
  const rejection = assert.rejects(failed);
  const other = lights.control('light.b', { brightness: 30 });
  requests[0].reply({ error: 'Not confirmed' }, 503);
  requests[1].reply(response('b', 30));
  await Promise.all([rejection, other]); await tick();
  assert.equal(requests.length, 2);
  assert.equal(lights.view('light.a').level, 100);
  assert.equal(lights.view('light.b').level, 30);
});

test('a queued zero-brightness intent followed by color turns on, not off', async () => {
  const { lights, requests } = client();
  const first = lights.control('light.a', { brightness: 20 });
  const zero = lights.control('light.a', { brightness: 0 });
  const color = lights.control('light.a', { color: '#45ffb4' });
  requests[0].reply(response('a', 20)); await tick();
  assert.equal(requests[1].body.color, '#45ffb4');
  assert.equal(requests[1].body.brightness, undefined);
  requests[1].reply(response('a', 20));
  await Promise.all([first, zero, color]); await tick();
});


test('a queued zero-brightness intent followed by power on drops the stale off intent', async () => {
  const { lights, requests } = client();
  const first = lights.control('light.a', { brightness: 20 });
  const zero = lights.control('light.a', { brightness: 0 });
  const on = lights.control('light.a', { power: 'on' });
  requests[0].reply(response('a', 20)); await tick();
  assert.equal(requests[1].body.power, 'on');
  assert.equal(requests[1].body.brightness, undefined);
  requests[1].reply(response('a', 20));
  await Promise.all([first, zero, on]);
  assert.equal(lights.view('light.a').on, true);
});

test('failure readback started by the caller can replace uncertain state immediately', async () => {
  const { lights, requests } = client();
  const failure = lights.control('light.a', { brightness: 20 }).catch(() => lights.refresh());
  requests[0].reply({ error: 'Not confirmed' }, 503); await tick();
  requests[1].reply({ lights: [response('a', 20).light, response('b', 100).light], controlKey: 'test', syncedAt: 'now' });
  await failure;
  assert.equal(lights.view('light.a').level, 20);
  assert.equal(Object.keys(lights.pending).length, 0);
});


test('rapid off/on keeps latest intent visible and restores brightness from observed state', async () => {
  const { lights, requests } = client();
  const off = lights.control('light.a', { power: 'off' });
  assert.equal(lights.view('light.a').on, false);
  const on = lights.control('light.a', { power: 'on' });
  assert.equal(lights.view('light.a').on, true);
  requests[0].reply(response('a', 0)); await tick();
  assert.equal(lights.view('light.a').on, true); // Earlier off cannot repaint latest on.
  assert.equal(requests[1].body.power, 'on');
  requests[1].reply(response('a', 65)); await Promise.all([off, on]);
  assert.equal(lights.view('light.a').level, 65);
  const offAgain = lights.control('light.a', { brightness: 0 });
  requests[2].reply(response('a', 0)); await offAgain;
  const restored = lights.control('light.a', { power: 'on' });
  assert.equal(lights.view('light.a').level, 65);
  requests[3].reply(response('a', 65)); await restored;
});

test('a mismatched light response cannot replace this light with fabricated confirmation', async () => {
  const { lights, requests } = client();
  const write = lights.control('light.a', { power: 'off' });
  const rejected = assert.rejects(write, /could not verify/);
  requests[0].reply(response('b', 0)); await rejected;
  assert.equal(lights.view('light.a').on, true);
});
