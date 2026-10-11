import { execFileSync } from 'node:child_process';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { networkInterfaces } from 'node:os';

const endpoint = 'https://ring-mcp.nearbycoder.workers.dev/mcp';
export function normalizeLight(light) {
  if (!light || !/^light\.[a-z0-9_]+$/.test(light.entityId)
      || !['on', 'off', 'unknown', 'unavailable'].includes(light.state)) {
    throw new Error('RingOS returned an invalid light.');
  }
  const modes = Array.isArray(light.supportedColorModes) ? light.supportedColorModes : [];
  return {
    id: light.entityId, name: String(light.name || light.entityId).slice(0, 120),
    state: light.state, on: light.state === 'on',
    available: light.state === 'on' || light.state === 'off',
    level: Number.isFinite(light.brightness) ? Math.round(light.brightness / 255 * 100) : null,
    dimmable: modes.some(mode => !['onoff', 'unknown'].includes(mode)),
    color: modes.some(mode => ['hs', 'xy', 'rgb', 'rgbw', 'rgbww'].includes(mode)),
    rgb: Array.isArray(light.rgbColor) ? light.rgbColor.slice(0, 3) : null,
  };
}

export function validateControl(body) {
  if (!body || Array.isArray(body) || typeof body !== 'object'
      || Object.keys(body).some(key => !['entityId', 'power', 'brightness', 'color'].includes(key))
      || !/^light\.[a-z0-9_]+$/.test(body.entityId)) throw new Error('Choose a listed light.');
  if (body.power !== undefined && !['on', 'off'].includes(body.power)) throw new Error('Invalid power setting.');
  if (body.brightness !== undefined && (!Number.isInteger(body.brightness)
      || body.brightness < 0 || body.brightness > 100)) throw new Error('Brightness must be 0–100.');
  if (body.color !== undefined && (typeof body.color !== 'string'
      || !/^#[a-f0-9]{6}$/i.test(body.color))) throw new Error('Choose a valid color.');
  if (body.power === undefined && body.brightness === undefined && body.color === undefined) {
    throw new Error('Choose power, brightness, or color.');
  }
  if (body.power === 'off' && (body.brightness !== undefined || body.color !== undefined)) {
    throw new Error('Power off cannot be combined with brightness or color.');
  }
  return body;
}

export function createRingBridge({ authorization, transport = fetch,
  wait = ms => new Promise(resolve => setTimeout(resolve, ms)) } = {}) {
  const csrf = randomBytes(32).toString('hex');
  const hosts = new Set(['localhost', '127.0.0.1', '[::1]']);
  for (const list of Object.values(networkInterfaces())) for (const address of list || []) {
    if (address.family === 'IPv4') hosts.add(address.address);
  }
  let inventory = [], syncedAt = null, expires = 0, loading = null;
  const queues = new Map(), active = new Set(), versions = new Map();
  const serialize = (id, task) => {
    const queue = queues.get(id) || Promise.resolve();
    const result = queue.then(task);
    const tail = result.catch(() => {});
    queues.set(id, tail);
    tail.finally(() => { if (queues.get(id) === tail) queues.delete(id); });
    return result;
  };
  async function rpc(name, args, timeout = 30000) {
    if (!authorization) throw new Error('RingOS credential is unavailable. Unlock the computer’s keyring and restart the dashboard server.');
    const response = await transport(endpoint, {
      method: 'POST', signal: AbortSignal.timeout(timeout), redirect: 'error',
      headers: { Authorization: authorization, 'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream', Origin: new URL(endpoint).origin,
        'User-Agent': 'FrameDashboard/1.0', 'MCP-Protocol-Version': '2025-03-26' },
      body: JSON.stringify({ jsonrpc: '2.0', id: randomBytes(8).toString('hex'),
        method: 'tools/call', params: { name, arguments: args } }),
    });
    if (!response.ok) throw new Error(response.status === 401 || response.status === 403
      ? 'RingOS rejected the credential or its lighting permissions.' : 'RingOS could not complete the request. Check the light before retrying.');
    const text = await response.text();
    if (text.length > 512000) throw new Error('RingOS response is too large.');
    const data = text.trim().startsWith('{') ? JSON.parse(text)
      : text.split('\n').filter(line => line.startsWith('data:')).map(line => JSON.parse(line.slice(5)))
        .find(item => item.id);
    if (!data || data.error || !data.result || data.result.isError) {
      throw new Error('RingOS could not confirm the request. Check the light before retrying.');
    }
    const content = data.result.content.find(item => item.type === 'text');
    if (!content) throw new Error('RingOS returned no light state.');
    return JSON.parse(content.text);
  }
  async function fetchInventory() {
    const before = new Map(versions), startedActive = new Set(active);
    const values = await rpc('home_assistant_lights_list', {});
    if (!Array.isArray(values)) throw new Error('RingOS returned an invalid inventory.');
    const raw = values.map(normalizeLight);
    const previous = new Map(inventory.map(light => [light.id, light]));
    inventory = raw.map(light => active.has(light.id) || startedActive.has(light.id)
      || before.get(light.id) !== versions.get(light.id) ? previous.get(light.id) || light : light);
    for (const [id, light] of previous) {
      if (!inventory.some(item => item.id === id) && (active.has(id) || startedActive.has(id)
          || before.get(id) !== versions.get(id))) inventory.push(light);
    }
    syncedAt = new Date().toISOString(); expires = Date.now() + 5000;
    return raw;
  }
  function loadInventory() {
    if (!loading) loading = fetchInventory().finally(() => { loading = null; });
    return loading;
  }
  async function list() {
    if (Date.now() >= expires) await loadInventory();
    return { lights: inventory, syncedAt, controlKey: csrf };
  }
  function matches(light, settings) {
    const on = !(settings.power === 'off' || settings.brightness === 0);
    if (!light.available || light.on !== on) return false;
    if (on && settings.brightness !== undefined
        && (light.level === null || Math.abs(light.level - settings.brightness) > 1)) return false;
    if (on && settings.color !== undefined) {
      const rgb = settings.color.slice(1).match(/../g).map(value => parseInt(value, 16));
      if (!light.rgb || rgb.some((value, index) => Math.abs(value - light.rgb[index]) > 8)) return false;
    }
    return true;
  }
  async function verify(body) {
    // These reads start AFTER the write, bypassing both our cache and a read
    // that may already be in flight. Service acknowledgments can contain old state.
    const deadline = Date.now() + 12000;
    let observed;
    for (const delay of [0, 250, 500, 1000, 1500, 2000]) {
      if (Date.now() + delay >= deadline) break;
      if (delay) await wait(delay);
      const values = await rpc('home_assistant_lights_list', {}, Math.max(1, deadline - Date.now()));
      if (!Array.isArray(values)) throw new Error('RingOS returned an invalid inventory.');
      observed = values.map(normalizeLight).find(item => item.id === body.entityId);
      if (!observed) throw new Error('This light is no longer listed in RingOS.');
      if (matches(observed, body)) return { light: observed, settled: true };
    }
    if (!observed) throw new Error('RingOS could not verify the light state. Check it before retrying.');
    // Show the actual state rather than manufacture confirmation of a failed target.
    return { light: observed, settled: false };
  }
  async function control(body) {
    validateControl(body);
    return serialize(body.entityId, async () => {
      // Different lights run concurrently; commands for one light keep their order.
      const current = Date.now() < expires ? inventory : await loadInventory();
      const light = current.find(item => item.id === body.entityId);
      if (!light || !light.available) throw new Error('This light is not reachable in RingOS.');
      if (body.brightness !== undefined && !light.dimmable) throw new Error('This light does not support dimming.');
      if (body.color !== undefined && !light.color) throw new Error('This light does not support color.');
      expires = 0;
      active.add(body.entityId);
      versions.set(body.entityId, (versions.get(body.entityId) || 0) + 1);
      try {
        const result = await rpc('home_assistant_light_control', body);
        if (!result.accepted || result.entityId !== body.entityId || result.state?.entityId !== body.entityId) {
          throw new Error('RingOS did not confirm the light state. Check it before retrying.');
        }
        normalizeLight(result.state);
        const verified = await verify(body);
        inventory = inventory.map(item => item.id === verified.light.id ? verified.light : item);
        syncedAt = new Date().toISOString();
        return { ...verified, confirmedAt: syncedAt };
      } finally {
        active.delete(body.entityId);
        versions.set(body.entityId, (versions.get(body.entityId) || 0) + 1);
        expires = 0;
      }
    });
  }
  async function handle(request, response, url) {
    if (!url.pathname.startsWith('/api/lights')) return false;
    const send = (status, data) => {
      response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff' }).end(JSON.stringify(data));
    };
    try {
      const own = new URL('http://' + request.headers.host);
      if (!hosts.has(own.hostname)) { send(403, { error: 'Host not allowed.' }); return true; }
      if (url.pathname === '/api/lights' && request.method === 'GET') {
        send(200, await list()); return true;
      }
      if (url.pathname !== '/api/lights/control' || request.method !== 'POST') {
        send(405, { error: 'Unsupported lighting request.' }); return true;
      }
      const key = Buffer.from(String(request.headers['x-light-control'] || ''));
      if (request.headers.origin !== own.origin || key.length !== csrf.length
          || !timingSafeEqual(key, Buffer.from(csrf))) {
        send(403, { error: 'Refresh the dashboard before changing lights.' }); return true;
      }
      if (request.headers['content-type']?.split(';')[0] !== 'application/json') {
        send(415, { error: 'Expected JSON.' }); return true;
      }
      let text = '';
      for await (const chunk of request) {
        text += chunk.toString();
        if (text.length > 4096) { send(413, { error: 'Request too large.' }); return true; }
      }
      let body;
      try { body = validateControl(JSON.parse(text)); }
      catch (error) { send(400, { error: error.message }); return true; }
      send(200, await control(body));
    } catch (error) {
      // Never return upstream request headers, credentials, or arbitrary response bodies.
      const message = /^(RingOS |This light |Choose |Brightness |Power off |Invalid )/.test(error.message)
        ? error.message : 'Lighting connection failed. Check the light before retrying.';
      send(503, { error: message });
    }
    return true;
  }
  return { list, control, handle };
}

export function keyringAuthorization() {
  try {
    return execFileSync('secret-tool', ['lookup', 'application', 'photo-frame-dashboard', 'service', 'ringos'],
      { encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch { return ''; }
}
