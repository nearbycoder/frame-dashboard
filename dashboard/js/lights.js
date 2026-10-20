// Per-light request queues. Credentials stay outside the WebView, in the private runtime.
(function () {
  'use strict';
  var L = App.lights = { items: [], error: null, loaded: false, pending: {}, versions: {}, key: null, syncedAt: null, lastLevels: {} };
  var refreshing = null;
  function request(method, path, body) {
    return new Promise(function (resolve, reject) {
      var xhr = new XMLHttpRequest();
      xhr.open(method, path); xhr.timeout = 70000;
      if (body) {
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.setRequestHeader('X-Light-Control', L.key || '');
      }
      xhr.onload = function () {
        var value;
        try { value = JSON.parse(xhr.responseText); } catch (err) { return reject(new Error('Lighting server returned an invalid response.')); }
        if (xhr.status < 200 || xhr.status >= 300) return reject(new Error(value.error || 'Lighting request failed.'));
        resolve(value);
      };
      xhr.onerror = xhr.ontimeout = function () { reject(new Error('Lighting connection lost. Check the light before retrying.')); };
      xhr.send(body ? JSON.stringify(body) : null);
    });
  }
  function emit() { App.emit('lights'); App.emit('data'); }
  function bump(id) { L.versions[id] = (L.versions[id] || 0) + 1; }
  function confirmed(id) { return L.items.filter(function (light) { return light.id === id; })[0]; }
  function remember(items) {
    items.forEach(function (light) { if (light.on && light.level > 0) L.lastLevels[light.id] = light.level; });
  }
  L.view = function (id) { return L.pending[id] ? L.pending[id].desired : confirmed(id); };
  L.refresh = function () {
    if (refreshing) return refreshing;
    var versions = Object.assign({}, L.versions);
    refreshing = request('GET', '/api/lights').then(function (result) {
      var before = JSON.stringify(L.items), hadError = !!L.error;
      var next = result.lights.map(function (light) {
        return L.pending[light.id] || versions[light.id] !== L.versions[light.id] ? confirmed(light.id) || light : light;
      });
      L.items.forEach(function (light) {
        if (L.pending[light.id] && !next.some(function (entry) { return entry.id === light.id; })) next.push(light);
      });
      L.items = next; remember(next); L.key = result.controlKey; L.syncedAt = result.syncedAt;
      L.loaded = true; L.error = null; App.emit('lights');
      if (hadError || before !== JSON.stringify(next)) App.emit('data');
    }).catch(function (error) {
      L.error = error.message; emit();
    }).then(function () { refreshing = null; });
    return refreshing;
  };
  function mergeSettings(previous, settings) {
    var next = Object.assign({}, previous, settings);
    if (settings.power === 'off') return { power: 'off' };
    if (settings.brightness === 0) return { brightness: 0 };
    if (settings.power === 'on' && next.brightness === 0) delete next.brightness;
    if (settings.color !== undefined && next.brightness === 0) delete next.brightness;
    if (settings.brightness !== undefined || settings.color !== undefined) delete next.power;
    return next;
  }
  function preview(light, settings) {
    var next = Object.assign({}, light);
    if (settings.power !== undefined) {
      next.on = settings.power === 'on';
      if (next.on && !(next.level > 0)) next.level = L.lastLevels[next.id] || null;
    }
    if (settings.brightness !== undefined) { next.level = settings.brightness; next.on = settings.brightness > 0; }
    if (settings.color) {
      next.on = true;
      next.rgb = [1, 3, 5].map(function (start) { return parseInt(settings.color.slice(start, start + 2), 16); });
    }
    return next;
  }
  function pump(id, job) {
    if (job.running) return;
    job.running = true;
    var settings = job.queued, waiters = job.waiters;
    job.queued = {}; job.waiters = [];
    function finish(result, error) {
      if (result) {
        if (!result.light || result.light.id !== id || typeof result.light.on !== 'boolean') {
          error = new Error('Lighting server could not verify this light. Refresh to check its state.'); result = null;
        } else {
          L.items = L.items.map(function (light) { return light.id === id ? result.light : light; });
          remember([result.light]); L.syncedAt = result.confirmedAt || L.syncedAt;
          if (result.settled === false && !Object.keys(job.queued).length) {
            App.toast(App.esc(result.light.name) + ': the light reports a different setting. Showing its actual state.', { tone: 'error', ms: 6000 });
          }
        }
      }
      job.running = false; bump(id);
      if (Object.keys(job.queued).length) pump(id, job);
      else delete L.pending[id];
      emit();
      waiters.forEach(function (waiter) { if (error) waiter.reject(error); else waiter.resolve(result.light); });
    }
    request('POST', '/api/lights/control', Object.assign({ entityId: id }, settings)).then(function (result) {
      finish(result, null);
    }, function (error) {
      // Clear pending before rejecting so the caller's readback can apply fresh state.
      // No automatic retry of an uncertain write. A later queued user action is distinct.
      finish(null, error);
    });
  }

  L.control = function (id, settings) {
    var light = L.view(id);
    if (!light || !light.available || !L.key) return Promise.reject(new Error('This light is not reachable. Refresh to check its connection.'));
    remember([confirmed(id)]);
    var job = L.pending[id];
    if (!job) job = L.pending[id] = { desired: light, queued: {}, waiters: [], running: false };
    job.desired = preview(job.desired, settings);
    job.queued = mergeSettings(job.queued, settings); bump(id);
    var result = new Promise(function (resolve, reject) { job.waiters.push({ resolve: resolve, reject: reject }); });
    emit(); pump(id, job);
    return result;
  };
  App.on('ready', function () {
    L.refresh();
    setInterval(function () { if (!document.hidden) L.refresh(); }, 5 * 60 * 1000);
  });
})();
