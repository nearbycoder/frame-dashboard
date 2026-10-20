// Same-origin bridge only. Ring credentials remain in the private on-device runtime.
(function () {
  'use strict';
  var D = window.DATA;
  var names = ['calendar', 'chores', 'shopping', 'weather', 'time', 'forecast', 'photos'];
  var H = App.household = { key: null, states: {}, pending: {}, params: {}, clock: null };
  names.forEach(function (name) { H.states[name] = { data: null, loading: false, error: null, generation: 0, synced: null }; H.pending[name] = {}; });
  var queues = {}, inflight = {}, reads = {}, mono = function () { return performance.now(); };
  var central = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
  App.toCentralDate = function (value) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) { var a = String(value).split('-'); return new Date(+a[0], +a[1] - 1, +a[2]); }
    var instant = new Date(value), parts = {};
    central.formatToParts(instant).forEach(function (part) { parts[part.type] = part.value; });
    return new Date(+parts.year, +parts.month - 1, +parts.day, +parts.hour % 24, +parts.minute, +parts.second);
  };
  H.instant = function () { return H.clock ? H.clock.epoch + mono() - H.clock.received : Date.now(); };
  App.now = function () { return App.toCentralDate(H.instant()); };
  H.dateKey = function (d) { return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); };
  function request(method, domain, action, body, week, force) {
    var requestedWeek = arguments.length >= 5 ? week : H.params[domain];
    var query = requestedWeek ? '?weekStart=' + encodeURIComponent(requestedWeek) : '';
    if (domain === 'forecast' && force) query = '?refresh=1';
    return new Promise(function (resolve, reject) {
      var xhr = new XMLHttpRequest();
      if (method === 'GET') (reads[domain] || (reads[domain] = [])).push(xhr);
      function untrack() { if (method === 'GET') reads[domain] = (reads[domain] || []).filter(function (r) { return r !== xhr; }); }
      xhr.onabort = function () { untrack(); reject(new Error('Read cancelled for a newer change.')); };
      xhr.open(method, '/api/household/' + domain + (action ? '/' + action : '') + query); xhr.timeout = 60000;
      if (body) { xhr.setRequestHeader('Content-Type', 'application/json'); xhr.setRequestHeader('X-Household-Control', H.key || ''); if (domain === 'shopping') xhr.setRequestHeader('X-Household-Compact', '1'); }
      xhr.onload = function () {
        untrack();
        var result; try { result = JSON.parse(xhr.responseText); } catch (_) { return reject(new Error('Live data returned an invalid response.')); }
        if (xhr.status !== 200 || !result.data) return reject(new Error(result.error || 'Live data is unavailable.'));
        if (result.partial === true) {
          var previous = H.states[domain].data;
          if (domain !== 'shopping' || method !== 'POST' || !previous || !Array.isArray(previous.usualItems) || !Array.isArray(result.data.items)) return reject(new Error('Saved shopping state was incomplete. Refresh before retrying.'));
          result.data = Object.assign({}, previous, result.data, { usualItems: previous.usualItems });
        }
        if (typeof result.controlKey === 'string') H.key = result.controlKey;
        resolve(result.data);
      };
      xhr.onerror = xhr.ontimeout = function () { untrack(); reject(new Error(body ? 'The change was not confirmed. Refresh before retrying.' : 'Connection lost. Showing the last confirmed data.')); };
      xhr.send(body ? JSON.stringify(body) : null);
    });
  }
  var palette = ['#3b82f6', '#b34c9a', '#10a36f', '#a97414', '#8b5cf6', '#14a6a6'];
  H.personStyle = function (p, i) { var color = /^#[a-f0-9]{6}$/i.test(p.color || '') ? p.color : palette[i % palette.length]; return { id: p.id, name: p.name, color: color, rgb: [1, 3, 5].map(function (n) { return parseInt(color.slice(n, n + 2), 16); }).join(' '), ink: '#FFFFFF' }; };
  function sync(domain, value, started) {
    if (domain === 'time') {
      if (typeof value.unixMs !== 'number' || value.timeZone !== 'America/Chicago') throw new Error('Time service returned invalid data.');
      H.clock = { epoch: value.unixMs, received: (started + mono()) / 2 };
    }
    if (domain === 'calendar') {
      if (!Array.isArray(value.events) || !Array.isArray(value.sources)) throw new Error('Calendar returned invalid data.');
      D.sources = value.sources.map(H.personStyle);
      D.events = value.events.map(function (e) { var start = App.toCentralDate(e.start), end = App.toCentralDate(e.end); if (!isFinite(+start) || !isFinite(+end) || end < start) throw new Error('Calendar contains an invalid date.'); return { id: e.id, title: e.title, start: start, end: end, allDay: !!e.allDay, loc: e.location || '', sourceId: e.sourceId, people: [e.sourceId] }; });
    }
    if (domain === 'chores') {
      if (!Array.isArray(value.people) || !Array.isArray(value.occurrences) || !Array.isArray(value.overdue)) throw new Error('Chores returned invalid data.');
      if (value.weekStart <= H.dateKey(App.now()) && value.weekEnd >= H.dateKey(App.now())) H.todayChores = value;
      D.people = value.people.map(H.personStyle); D.ALL = D.people.map(function (p) { return p.id; });
      D.chores = value.occurrences.concat(value.overdue).map(function (c) { return Object.assign({}, c, { id: c.choreId + ':' + c.date, who: c.personId, done: c.completed, r: 'today', overdue: c.date < H.dateKey(App.now()) && !c.completed }); });
    }
    if (domain === 'shopping') {
      if (!Array.isArray(value.items) || !Array.isArray(value.usualItems)) throw new Error('Shopping returned invalid data.');
      D.groceries = value.items.map(function (g) { return Object.assign({}, g, { done: g.checked, qty: g.quantity, cat: g.category }); });
      D.usuals = value.usualItems;
    }
    if (domain === 'photos') {
      if (!Array.isArray(value.photos) || !Array.isArray(value.sources) || value.photos.length > 100 || value.photos.some(function (p) { return !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(p.id || '') || p.imagePath !== '/api/photos/items/' + p.id + '/image'; })) throw new Error('Photos returned invalid data.');
      D.photos = value.photos; D.photoGallery = value;
    }
    if (domain === 'forecast') { if (!Array.isArray(value.periods) || value.temperatureUnit !== 'F') throw new Error('Forecast returned invalid data.'); D.forecast = value; }
    if (domain === 'weather') { if (!Array.isArray(value.periods) || value.temperatureUnit !== 'F') throw new Error('Weather returned invalid data.'); D.weather = value; }
  }
  function emit(domain) { App.emit('household:' + domain); App.emit('household', domain); }
  H.hasPending = function () { return names.some(function (name) { return Object.keys(H.pending[name]).length > 0; }); };
  function cancelReads(domain) { (reads[domain] || []).slice().forEach(function (xhr) { if (xhr.abort) xhr.abort(); }); }
  H.refresh = function (domain, week, force) {
    if (week !== undefined && H.params[domain] !== week) { H.params[domain] = week; H.states[domain].generation++; }
    if (Object.keys(H.pending[domain]).length) return Promise.resolve();
    var state = H.states[domain];
    if (force) { state.generation++; cancelReads(domain); }
    var generation = state.generation, signature = domain + ':' + (H.params[domain] || '') + ':' + generation;
    if (inflight[signature]) return inflight[signature];
    state.loading = true; if (!state.data || state.error) emit(domain); var started = mono();
    var task = request('GET', domain, '', null, H.params[domain], force).then(function (data) {
      if (generation !== state.generation) return;
      sync(domain, data, started); state.data = data; state.error = null; state.synced = Date.now();
    }).catch(function (e) { if (generation === state.generation) state.error = e.message; }).then(function () { delete inflight[signature]; if (generation === state.generation) { state.loading = false; emit(domain); } });
    inflight[signature] = task; return task;
  };
  H.write = function (domain, action, body, id) {
    if (!H.key) return Promise.reject(new Error('Wait for live data to connect before making changes.'));
    var state = H.states[domain], key = id || action;
    if (H.pending[domain][key]) return Promise.reject(new Error('This change is still being saved.'));
    H.pending[domain][key] = action; state.generation++; state.loading = false;
    // Invalidating a poll is not enough: cancel its network work so a queued edit
    // cannot sit behind a discarded full-list download in the runtime's lock.
    cancelReads(domain);
    emit(domain);
    var task = (queues[domain] || Promise.resolve()).then(function () {
      var started = mono(), requestWeek = H.params[domain];
      return request('POST', domain, action, body).then(function (data) { if (requestWeek === H.params[domain]) { sync(domain, data, started); state.data = data; state.error = null; state.synced = Date.now(); } });
    });
    var finished = task.then(function () { delete H.pending[domain][key]; emit(domain); if (!Object.keys(H.pending[domain]).length && domain === 'chores') { H.refresh(domain); H.refreshTodayChores(); } }, function (e) { state.error = e.message; delete H.pending[domain][key]; emit(domain); throw e; });
    queues[domain] = finished.catch(function () {}); return finished;
  };
  H.refreshTodayChores = function () {
    if (!H.params.chores || Object.keys(H.pending.chores).length) return Promise.resolve();
    var generation = H.states.chores.generation;
    return request('GET', 'chores', '', null, null).then(function (data) {
      if (generation !== H.states.chores.generation) return;
      if (Array.isArray(data.occurrences) && Array.isArray(data.overdue)) { H.todayChores = data; App.emit('household', 'chores'); }
    }).catch(function () {});
  };
  H.status = function (domain) { var s = H.states[domain]; return s.error || (!s.data ? (s.loading ? 'Connecting…' : 'Not connected') : ''); };
  H.statusHTML = function (domain, refreshButton) { var text = H.status(domain); return '<div class="live-status" role="status"><span>' + App.esc(text) + '</span>' + (text && refreshButton !== false ? '<button class="live-refresh" data-refresh="' + domain + '">Refresh</button>' : '') + '</div>'; };
  App.events = function () { return D.events.slice().sort(function (a, b) { return a.start - b.start; }); };
  App.evColor = function (e) { return D.sources.filter(function (s) { return s.id === e.sourceId; })[0] || D.family; };
  App.isFamily = function () { return false; };
  App.person = function (id) { return D.people.concat(D.sources).filter(function (p) { return p.id === id; })[0] || D.family; };
  H.weatherIcon = function (s, day) { return /snow|rain|shower|storm/i.test(s || '') ? 'rain' : /partly|mostly sunny/i.test(s || '') ? 'partly' : /cloud|fog/i.test(s || '') ? 'cloud' : day ? 'sun' : 'moon'; };
  App.weatherNow = function () {
    var w = D.weather, now = H.instant(), p = w && w.periods.filter(function (p) { return Date.parse(p.start) <= now && Date.parse(p.end) > now; })[0];
    if (!p && w) p = w.periods.filter(function (p) { return Date.parse(p.end) > now; })[0];
    return { temp: p ? p.temperature : '—', cond: H.weatherIcon(p && p.summary, p && p.isDaytime), label: p ? p.name + ' forecast' : 'Forecast unavailable', hi: w && w.high != null ? w.high : '—', lo: w && w.low != null ? w.low : '—', summary: p ? p.summary : 'Weather unavailable', advice: p ? p.windSpeed + ' ' + p.windDirection : '', unit: 'F' };
  };
  App.hourly = function () { return []; }; // The API provides daily periods, not hourly observations.
  App.on('ready', function () {
    names.forEach(function (name) { H.refresh(name); });
    var seconds = 0;
    setInterval(function () { if (document.hidden) return; seconds += 300; ['time', 'chores', 'shopping', 'photos', 'calendar'].forEach(function (name) { H.refresh(name); }); H.refreshTodayChores(); if (seconds % 900 === 0) { H.refresh('weather'); H.refresh('forecast'); } }, 5 * 60 * 1000);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) names.forEach(function (name) { H.refresh(name); }); });
    document.addEventListener('click', function (e) { var b = e.target.closest('[data-refresh]'); if (b) H.refresh(b.dataset.refresh); });
  });
})();
