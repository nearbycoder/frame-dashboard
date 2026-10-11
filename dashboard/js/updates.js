// Small HTTP release checks work on Android 6 without service workers or ADB.
(function () {
  'use strict';
  var meta = document.querySelector('meta[name="dashboard-build"]');
  var U = App.updates = { current: meta ? meta.content : null, currentTag: null, available: null, applying: false, error: null };
  var checking = null, dismissVersion = null, bannerClose = null, pointers = {}, sheet = null;
  function get(url, binary) {
    return new Promise(function (resolve, reject) {
      var xhr = new XMLHttpRequest(); xhr.open('GET', url); xhr.timeout = 20000;
      if (binary) xhr.responseType = 'arraybuffer';
      xhr.onload = function () {
        if (xhr.status !== 200) return reject(new Error('Updates are unavailable. Try again when Wi-Fi is connected.'));
        if (binary) return xhr.response && xhr.response.byteLength ? resolve(xhr.response) : reject(new Error('An update file is incomplete. Try again.'));
        try { resolve(JSON.parse(xhr.responseText)); } catch (err) { reject(new Error('The dashboard update is invalid.')); }
      };
      xhr.onerror = xhr.ontimeout = function () { reject(new Error('Could not check for updates. Your current dashboard is still open.')); };
      xhr.send();
    });
  }
  function valid(release) {
    return release && /^[a-f0-9]{16}$/.test(release.version) && Array.isArray(release.assets) && release.assets.length > 0
      && release.assets.length <= 40 && release.assets.every(function (asset) { return /^\/assets\/[a-zA-Z0-9_.-]+$/.test(asset); });
  }
  function render() {
    var button = document.querySelector('#dashboardUpdates');
    if (button) button.querySelector('.update-dot').hidden = !U.available;
    if (sheet) {
      sheet.querySelector('[data-update-status]').textContent = U.applying ? 'Preparing update…' : U.error || (U.available ? 'A new dashboard is ready' + (U.available.tag ? ': ' + U.available.tag : '.') : checking ? 'Checking for updates…' : 'Your dashboard is up to date.');
      sheet.querySelector('[data-update-version]').textContent = U.current ? 'Installed dashboard: ' + (U.currentTag ? U.currentTag + ' · ' : '') + U.current.slice(0, 8) : '';
      sheet.querySelector('[data-update-apply]').hidden = !U.available;
      sheet.querySelector('[data-update-apply]').disabled = U.applying;
      sheet.querySelector('[data-update-check]').disabled = U.applying || !!checking;
    }
    if (U.available && U.available.version !== dismissVersion && !bannerClose && !U.applying) {
      bannerClose = App.banner({ icon: 'bolt', title: 'Dashboard update available', sub: 'A new release is ready', action: 'Update', dismiss: 'Later',
        onAction: function () { bannerClose = null; U.apply(); } });
      // The existing banner's dismiss control removes it; track dismissal too.
      var banners = document.querySelector('#banners');
      var banner = banners.lastElementChild;
      banner.querySelector('[data-x]').addEventListener('click', function () { dismissVersion = U.available.version; bannerClose = null; });
    }
    if (!U.available && bannerClose) { bannerClose(); bannerClose = null; }
  }
  U.check = function () {
    if (checking) return checking;
    U.error = null;
    checking = get('/api/dashboard-update?t=' + Date.now()).then(function (release) {
      if (!valid(release)) throw new Error('The dashboard update is incomplete. Try again shortly.');
      if (!U.current) U.current = release.version;
      if (release.tag && !/^v\d+\.\d+\.\d+$/.test(release.tag)) throw new Error('The dashboard release tag is invalid.');
      if (release.version === U.current) U.currentTag = release.tag || null;
      U.available = release.version === U.current ? null : release;
      if (release.updateError) U.error = release.updateError;
    }).catch(function (error) { U.error = error.message; }).then(function () { checking = null; render(); });
    render(); return checking;
  };
  function waitForIdle() {
    return new Promise(function (resolve, reject) {
      var started = Date.now();
      function check() {
        if (!Object.keys(pointers).length && (!App.lights || !Object.keys(App.lights.pending).length)) return resolve();
        if (sheet) sheet.querySelector('[data-update-status]').textContent = 'Waiting for your light changes to finish…';
        if (Date.now() - started > 90000) return reject(new Error('A light change is still pending. Try Update again after it finishes.'));
        setTimeout(check, 200);
      }
      check();
    });
  }
  U.apply = function () {
    if (U.applying || !U.available) return;
    U.applying = true; U.error = null;
    if (bannerClose) { bannerClose(); bannerClose = null; }
    U.open();
    var release = U.available;
    // Download files before navigating. A failed download leaves the current page usable.
    Promise.all(release.assets.map(function (asset) { return get(asset, true); })).then(waitForIdle).then(function () {
      return get('/api/dashboard-update?t=' + Date.now());
    }).then(function (latest) {
      if (!valid(latest) || latest.version !== release.version) throw new Error('A newer update arrived. Check again before applying it.');
      // Block new gestures only for the navigation itself, after current writes finish.
      if (Object.keys(pointers).length || (App.lights && Object.keys(App.lights.pending).length)) return waitForIdle().then(function () { navigate(release); });
      navigate(release);
    }).catch(function (error) { U.applying = false; U.error = error.message; render(); });
  };
  function navigate(release) {
    var url = new URL(location.href); url.searchParams.set('build', release.version);
    location.replace(url.href); // Same Activity, same section, no APK install or app restart.
  }
  U.open = function () {
    App.sheet('<div class="sheet-pad"><div class="label">Dashboard</div><h2 class="serif sheet-h">Updates</h2><p class="update-status" data-update-status role="status"></p><p class="update-version" data-update-version></p><div class="sheet-actions"><button class="btn" data-update-check>Check for updates</button><button class="btn btn--solid" data-update-apply hidden>Update now</button></div></div>', {
      cls: 'sheet--updates', onMount: function (element) {
        sheet = element; element.setAttribute('role', 'dialog'); element.setAttribute('aria-modal', 'true'); element.setAttribute('aria-label', 'Dashboard updates');
        element.querySelector('[data-update-check]').onclick = U.check;
        element.querySelector('[data-update-apply]').onclick = U.apply;
        render();
      }, onClose: function () { sheet = null; }
    });
    render();
  };
  App.on('ready', function () {
    document.querySelector('#dashboardUpdates').onclick = function () { U.open(); U.check(); };
    document.addEventListener('pointerdown', function (event) { pointers[event.pointerId] = true; }, true);
    ['pointerup', 'pointercancel'].forEach(function (name) { document.addEventListener(name, function (event) { delete pointers[event.pointerId]; }, true); });
    window.addEventListener('blur', function () { pointers = {}; });
    U.check(); setInterval(function () { if (!document.hidden && !U.applying) U.check(); }, 15000);
    document.addEventListener('visibilitychange', function () { if (!document.hidden && !U.applying) U.check(); });
  });
})();
