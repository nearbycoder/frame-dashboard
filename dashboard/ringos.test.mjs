import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createRingBridge, normalizeLight, validateControl } from './ringos.mjs';

const light = { entityId: 'light.office', name: 'Office', state: 'on', brightness: 128,
  supportedColorModes: ['hs'], rgbColor: [255, 255, 255] };
function fixture({ offline = false, failure = false } = {}) {
  const calls = [];
  let state = { ...light, state: offline ? 'unavailable' : 'on' };
  const transport = async (_url, options) => {
    const request = JSON.parse(options.body); calls.push(request.params);
    assert.equal(options.headers.Authorization, 'Bearer test-only');
    if (failure && request.params.name === 'home_assistant_light_control') {
      throw new Error('Network failure after dispatch');
    }
    if (request.params.name === 'home_assistant_light_control') state = { ...state, state: 'off' };
    const value = request.params.name === 'home_assistant_lights_list'
      ? [state]
      : { accepted: true, entityId: light.entityId, at: new Date().toISOString(),
        state: { ...light, state: 'off' } };
    return new Response(JSON.stringify({ result: { content: [{ type: 'text', text: JSON.stringify(value) }] } }));
  };
  return { bridge: createRingBridge({ authorization: 'Bearer test-only', transport }), calls };
}
test('HA brightness is 0–255; commands are 0–100 and reject extra tool arguments', () => {
  assert.equal(normalizeLight(light).level, 50);
  for (const body of [{ entityId: light.entityId, brightness: 255 },
    { entityId: light.entityId, power: 'off', color: '#ffffff' },
    { entityId: light.entityId, power: 'on', tool: 'notes_list' }]) {
    assert.throws(() => validateControl(body));
  }
});
test('only listed, available lights can be changed', async () => {
  const { bridge, calls } = fixture({ offline: true });
  await assert.rejects(bridge.control({ entityId: light.entityId, power: 'off' }), /not reachable/);
  await assert.rejects(bridge.control({ entityId: 'light.unknown', power: 'on' }), /not reachable/);
  assert.equal(calls.filter(call => call.name === 'home_assistant_light_control').length, 0);
});
test('uncertain control failures are never automatically retried', async () => {
  const { bridge, calls } = fixture({ failure: true });
  await assert.rejects(bridge.control({ entityId: light.entityId, power: 'off' }));
  assert.equal(calls.filter(call => call.name === 'home_assistant_light_control').length, 1);
});
test('HTTP rejects cross-origin and missing control keys, exposes no RingOS token, confirms state', async t => {
  const { bridge, calls } = fixture();
  const server = http.createServer((req, res) => bridge.handle(req, res, new URL(req.url, 'http://localhost')));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const origin = 'http://127.0.0.1:' + server.address().port;
  const snapshotText = await (await fetch(origin + '/api/lights')).text();
  assert.equal(snapshotText.includes('test-only'), false);
  const snapshot = JSON.parse(snapshotText);
  const body = JSON.stringify({ entityId: light.entityId, power: 'off' });
  const missing = await fetch(origin + '/api/lights/control', { method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' }, body });
  assert.equal(missing.status, 403);
  const hostile = await fetch(origin + '/api/lights/control', { method: 'POST',
    headers: { Origin: 'https://hostile.invalid', 'Content-Type': 'application/json', 'X-Light-Control': snapshot.controlKey }, body });
  assert.equal(hostile.status, 403);
  assert.equal(calls.filter(call => call.name === 'home_assistant_light_control').length, 0);
  const valid = await fetch(origin + '/api/lights/control', { method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json', 'X-Light-Control': snapshot.controlKey }, body });
  assert.equal(valid.status, 200);
  assert.equal((await valid.json()).light.state, 'off');
});

test('different lights run concurrently while the same light preserves request order', async () => {
  const raw = ['office', 'couch'].map(name => ({ ...light, entityId: 'light.' + name, name }));
  let release, started;
  const began = new Promise(resolve => { started = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  const writes = [];
  const bridge = createRingBridge({ authorization: 'test-only', transport: async (_url, options) => {
    const { name, arguments: args } = JSON.parse(options.body).params;
    let value;
    if (name === 'home_assistant_lights_list') value = raw;
    else {
      writes.push([args.entityId, args.brightness]);
      if (args.entityId === 'light.office' && args.brightness === 20) { started(); await gate; }
      const item = raw.find(item => item.entityId === args.entityId);
      item.brightness = Math.round(args.brightness * 255 / 100);
      value = { accepted: true, entityId: args.entityId, state: { ...item } };
    }
    return new Response(JSON.stringify({ result: { content: [{ type: 'text', text: JSON.stringify(value) }] } }));
  } });
  await bridge.list();
  const first = bridge.control({ entityId: 'light.office', brightness: 20 });
  await began;
  const second = bridge.control({ entityId: 'light.office', brightness: 60 });
  const other = await bridge.control({ entityId: 'light.couch', brightness: 30 });
  assert.equal(other.light.level, 30);
  assert.deepEqual(writes, [['light.office', 20], ['light.couch', 30]]);
  release(); await Promise.all([first, second]);
  assert.deepEqual(writes, [['light.office', 20], ['light.couch', 30], ['light.office', 60]]);
});

test('an inventory read started before a confirmed write cannot restore stale state', async () => {
  let reads = 0, releaseRead, startRead, releaseWrite, startWrite;
  let current = light;
  const readStarted = new Promise(resolve => { startRead = resolve; });
  const writeStarted = new Promise(resolve => { startWrite = resolve; });
  const readGate = new Promise(resolve => { releaseRead = resolve; });
  const writeGate = new Promise(resolve => { releaseWrite = resolve; });
  const bridge = createRingBridge({ authorization: 'test-only', transport: async (_url, options) => {
    const { name } = JSON.parse(options.body).params;
    let value;
    if (name === 'home_assistant_lights_list') {
      reads++;
      const snapshot = current;
      if (reads === 2) { startRead(); await readGate; }
      value = [snapshot];
    } else {
      startWrite(); await writeGate;
      current = { ...light, brightness: 51 };
      value = { accepted: true, entityId: light.entityId, state: current };
    }
    return new Response(JSON.stringify({ result: { content: [{ type: 'text', text: JSON.stringify(value) }] } }));
  } });
  await bridge.list();
  const write = bridge.control({ entityId: light.entityId, brightness: 20 });
  await writeStarted;
  const read = bridge.list(); await readStarted;
  releaseWrite(); await write; releaseRead();
  const final = await read;
  assert.equal(final.lights[0].level, 20);
});


test('stale service acknowledgment and delayed HA state are read again before brightness is confirmed', async () => {
  let writes = 0, afterReads = 0;
  const bridge = createRingBridge({ authorization: 'test-only', wait: async () => {}, transport: async (_url, options) => {
    const { name } = JSON.parse(options.body).params;
    let value;
    if (name === 'home_assistant_light_control') { writes++; value = { accepted: true, entityId: light.entityId, state: light }; }
    else { if (writes) afterReads++; value = [{ ...light, brightness: afterReads >= 3 ? 51 : 128 }]; }
    return new Response(JSON.stringify({ result: { content: [{ type: 'text', text: JSON.stringify(value) }] } }));
  } });
  const result = await bridge.control({ entityId: light.entityId, brightness: 20 });
  assert.equal(result.light.level, 20); assert.equal(result.settled, true);
  assert.equal(afterReads, 3); assert.equal(writes, 1);
});

test('toggle waits for real off state; a target that never settles returns observed state without retrying the write', async () => {
  for (const settles of [true, false]) {
    let writes = 0, reads = 0;
    const bridge = createRingBridge({ authorization: 'test-only', wait: async () => {}, transport: async (_url, options) => {
      const { name } = JSON.parse(options.body).params;
      let value;
      if (name === 'home_assistant_light_control') { writes++; value = { accepted: true, entityId: light.entityId, state: light }; }
      else { if (writes) reads++; value = [{ ...light, state: settles && reads >= 2 ? 'off' : 'on' }]; }
      return new Response(JSON.stringify({ result: { content: [{ type: 'text', text: JSON.stringify(value) }] } }));
    } });
    const result = await bridge.control({ entityId: light.entityId, power: 'off' });
    assert.equal(result.light.on, !settles); assert.equal(result.settled, settles); assert.equal(writes, 1);
  }
});
