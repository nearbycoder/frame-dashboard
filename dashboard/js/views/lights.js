import { moveLightGesture } from '../light-gesture.js';
(function () {
  'use strict';
  var L = App.lights, el = null, members = '', gestures = {}, dragging = {}, buttons = {};
  var colors = [['Warm', '#ffd6a3'], ['White', '#ffffff'], ['Red', '#ff4040'], ['Green', '#45ffb4'], ['Blue', '#4090ff'], ['Purple', '#b060ff']];
  function light(id) { return L.view(id); }
  function label(item) { return !item.available ? 'Unavailable' : item.on ? (item.level == null ? 'On' : item.level + '%') : 'Off'; }
  function level(item) { return item.on ? (item.level == null ? 100 : item.level) : 0; }
  function row(item) {
    return '<section class="light-line" data-light="' + item.id + '"><div class="light-bar" role="slider" tabindex="0" aria-label="' + App.esc(item.name) + ' power and brightness" aria-valuemin="0" aria-valuemax="100">' +
      '<span class="light-line-fill"></span><span class="light-line-icon">' + App.icon('bulb', 24) + '</span><span class="light-line-name">' + App.esc(item.name) + '</span><span class="light-line-sync" aria-label="Updating">Syncing</span><span class="light-line-value num"></span></div>' +
      (item.color ? '<button class="light-color" aria-label="Colors for ' + App.esc(item.name) + '"><i></i><span>Color</span></button>' : '') + '</section>';
  }
  function paintRow(item, line) {
    if (dragging[item.id]) return;
    var bar = line.querySelector('.light-bar');
    var value = level(item);
    line.classList.toggle('is-on', item.on); line.classList.toggle('is-offline', !item.available);
    line.classList.toggle('is-pending', !!L.pending[item.id]);
    line.style.setProperty('--level', value + '%');
    bar.setAttribute('aria-valuenow', value);
    bar.setAttribute('aria-valuetext', label(item) + (L.pending[item.id] ? ', syncing' : ''));
    bar.setAttribute('aria-disabled', !item.available);
    bar.tabIndex = item.available ? 0 : -1;
    line.querySelector('.light-line-value').textContent = label(item);
    var button = line.querySelector('.light-color');
    if (button) { button.disabled = !item.available; button.querySelector('i').style.background = item.rgb ? 'rgb(' + item.rgb.join(',') + ')' : '#fff'; }
  }
  function paint() {
    if (!el || App.current !== 'control') return;
    var ids = L.items.map(function (item) { return item.id; }).join('|');
    if (ids !== members && !Object.keys(gestures).length) {
      members = ids;
      el.querySelector('.light-lines').innerHTML = L.items.map(row).join('');
      buttons = {}; App.$$('[data-light]', el).forEach(function (line) { buttons[line.dataset.light] = line; });
    }
    L.items.forEach(function (item) { if (buttons[item.id]) paintRow(light(item.id), buttons[item.id]); });
    var views = L.items.map(function (item) { return light(item.id); });
    var status = el.querySelector('[data-light-status]');
    status.textContent = L.error || '';
    status.hidden = !L.error;
    el.querySelector('[data-all-off]').disabled = !L.key || !views.some(function (item) { return item.on && item.available; });
    el.querySelector('[data-light-stamp]').textContent = L.syncedAt ? 'Updated ' + new Date(L.syncedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '';
  }
  function action(id, settings) {
    return L.control(id, settings).catch(function (error) {
      App.toast(App.esc(light(id).name) + ': ' + App.esc(error.message), { tone: 'error', icon: 'bolt', ms: 6000 });
      L.refresh();
      throw error;
    });
  }
  function send(id, settings) { action(id, settings).catch(function () {}); }
  function colorSheet(id) {
    var item = light(id);
    if (!item.available) return;
    App.sheet('<div class="sheet-pad"><div class="label">Light color</div><h2 class="serif sheet-h">' + App.esc(item.name) + '</h2><div class="light-color-options">' + colors.map(function (color) {
      return '<button data-color="' + color[1] + '" style="--swatch:' + color[1] + '"><i></i><span>' + color[0] + '</span></button>';
    }).join('') + '</div><p class="light-color-hint">Choose a color to apply it. You can keep using other lights while it syncs.</p></div>', {
      cls: 'sheet--light-color',
      onMount: function (sheet, close) {
        sheet.setAttribute('role', 'dialog'); sheet.setAttribute('aria-modal', 'true'); sheet.setAttribute('aria-label', 'Color for ' + item.name);
        sheet.addEventListener('click', function (event) {
          var button = event.target.closest('[data-color]');
          if (button) { close(); send(id, { color: button.dataset.color }); }
        });
        sheet.addEventListener('keydown', function (event) { if (event.key === 'Escape') close(); });
        sheet.querySelector('[data-color]').focus();
      }
    });
  }
  function bind() {
    el.addEventListener('click', function (event) {
      var button = event.target.closest('button');
      if (!button || button.disabled) return;
      if (button.hasAttribute('data-refresh')) return L.refresh();
      if (button.hasAttribute('data-all-off')) {
        var targets = L.items.map(function (item) { return light(item.id); }).filter(function (item) { return item.available && item.on; });
        Promise.all(targets.map(function (item) { return action(item.id, { power: 'off' }).then(function (state) { return !state.on; }, function () { return false; }); })).then(function (results) {
          var count = results.filter(Boolean).length;
          App.toast('Confirmed off: ' + count + ' of ' + targets.length + ' lighting entries', { icon: 'bulb' });
        });
        return;
      }
      if (button.classList.contains('light-color')) colorSheet(button.closest('[data-light]').dataset.light);
    });
    el.addEventListener('pointerdown', function (event) {
      var bar = event.target.closest('.light-bar');
      if (!bar || (event.button !== undefined && event.button !== 0)) return;
      var id = bar.parentNode.dataset.light, item = light(id);
      if (!item.available) return;
      if (Object.keys(gestures).some(function (pointer) { return gestures[pointer].id === id; })) return;
      var bounds = bar.getBoundingClientRect();
      gestures[event.pointerId] = { id: id, bar: bar, x: event.clientX, y: event.clientY, left: bounds.left, width: bounds.width, value: level(item), slide: false, cancel: false };
      dragging[id] = true;
      try { bar.setPointerCapture(event.pointerId); } catch (err) {}
    });
    el.addEventListener('pointermove', function (event) {
      var gesture = gestures[event.pointerId]; if (!gesture || gesture.cancel) return;
      moveLightGesture(gesture, event.clientX, event.clientY);
      if (gesture.cancel || !gesture.slide || !light(gesture.id).dimmable) return;
      gesture.bar.parentNode.style.setProperty('--level', gesture.value + '%');
      gesture.bar.parentNode.classList.toggle('is-on', gesture.value > 0);
      gesture.bar.querySelector('.light-line-value').textContent = gesture.value ? gesture.value + '%' : 'Off';
    });
    function finish(event) {
      var gesture = gestures[event.pointerId]; if (!gesture) return;
      if (event.type === 'pointerup') moveLightGesture(gesture, event.clientX, event.clientY);
      delete gestures[event.pointerId]; delete dragging[gesture.id];
      if (event.type !== 'pointercancel' && !gesture.cancel) {
        var item = light(gesture.id);
        if (gesture.slide && item.dimmable) send(gesture.id, { brightness: gesture.value });
        else if (!gesture.slide) send(gesture.id, { power: item.on ? 'off' : 'on' });
      }
      paint();
    }
    el.addEventListener('pointerup', finish); el.addEventListener('pointercancel', finish);
    el.addEventListener('keydown', function (event) {
      var bar = event.target.closest('.light-bar'); if (!bar) return;
      var id = bar.parentNode.dataset.light, item = light(id); if (!item.available) return;
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); send(id, { power: item.on ? 'off' : 'on' }); }
      if (item.dimmable && ['ArrowLeft', 'ArrowRight', 'Home', 'End'].indexOf(event.key) !== -1) {
        event.preventDefault();
        var value = event.key === 'Home' ? 0 : event.key === 'End' ? 100 : Math.max(0, Math.min(100, level(item) + (event.key === 'ArrowRight' ? 5 : -5)));
        send(id, { brightness: value });
      }
    });
  }
  App.register('control', {
    show: function (root) {
      if (!el) {
        el = root;
        el.innerHTML = '<div class="real-lights"><header class="real-lights-header"><div><div class="label">Home Assistant</div><h1 class="serif">Lights</h1></div><div class="real-lights-actions"><button class="btn" data-refresh>Refresh</button><button class="btn btn--solid" data-all-off>All lights off</button></div></header><p class="real-lights-status" data-light-status role="alert" hidden></p><div class="real-light-scroll"><div class="light-lines"></div><p class="real-light-footer"><span data-light-stamp></span></p></div></div>';
        bind();
      }
      paint(); L.refresh();
    },
    resume: function () { paint(); L.refresh(); },
    hide: function () { gestures = {}; dragging = {}; }
  });
  App.on('lights', paint);
})();
