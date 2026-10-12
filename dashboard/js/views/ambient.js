// Quiet clock modes use live calendar and weather, without sample photos or house status.
(function () {
 'use strict';
 var H = App.household, $ = App.$, shiftTimer;
 function paint() {
  var n = App.now(), w = App.weatherNow(), e = App.nextEvent();
  if (App.mode === 'ambient') App.photos.mount($('#ambient .amb-photo'));
  if (App.mode === 'ambient') $('#ambient .amb-info').innerHTML = '<div class="amb-clock"><div class="amb-time num">' + App.fmt.time(n, false) + '</div><div class="amb-date">' + App.fmt.day(n) + ', ' + App.fmt.month(n) + ' ' + n.getDate() + '</div></div><div class="amb-right"><div class="amb-wx">' + App.icon(w.cond, 38) + '<span class="num">' + w.temp + '°F</span><small>' + App.esc(w.label) + '</small></div>' + (e ? '<div class="amb-next">' + App.esc(e.title) + ' · ' + App.fmt.time(e.start) + '</div>' : '') + '<small>' + App.esc(H.status('calendar') || H.status('weather') || '') + '</small></div>';
  if (App.mode === 'night') $('#night .nt-inner').innerHTML = '<div class="nt-time num">' + App.fmt.time(n, false) + '</div><div class="nt-line">' + App.fmt.day(n) + ' · Central time' + (e ? ' · Next: ' + App.esc(e.title) + ' ' + App.fmt.time(e.start) : '') + '</div>';
 }
 App.on('ready', function () { $('#ambient').innerHTML = '<div class="amb-live-background"></div><div class="amb-photo"></div><div class="amb-scrim"></div><div class="amb-info"></div>'; $('#night').innerHTML = '<div class="nt-inner"></div>'; $('#ambient').onclick = function () { App.resumeDashboard(); App.go('home'); }; $('#night').onclick = function () { App.setMode('nightdash'); }; });
 App.on('mode', function (m) { clearInterval(shiftTimer); if (m === 'ambient' || m === 'night') { paint(); shiftTimer = setInterval(function () { App.$$('.amb-info, .nt-inner').forEach(function (el) { el.style.transform = 'translate(' + Math.round(Math.random() * 8 - 4) + 'px,' + Math.round(Math.random() * 8 - 4) + 'px)'; }); }, 60000); } App.resetIdle(); });
 App.on('photo', function () { if (App.mode === 'ambient') paint(); });
 App.on('minute', paint); App.on('household', paint);
})();
