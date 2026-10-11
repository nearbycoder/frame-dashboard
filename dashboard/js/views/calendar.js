// Live subscribed calendars. MCP subscriptions are read-only.
(function () {
 'use strict';
 var H = App.household, D = window.DATA, V = { el: null, date: null, mode: 'day', source: 'all' };
 function dates() { var start = App.dayStart(V.date), end = App.addDays(start, V.mode === 'week' ? 7 : 1); if (V.mode === 'month') { start = new Date(start.getFullYear(), start.getMonth(), 1); end = new Date(start.getFullYear(), start.getMonth() + 1, 1); } return [start, end]; }
 function eventRow(e) { var p = App.evColor(e); return '<button class="live-event" data-ev="' + App.esc(e.id) + '" style="' + App.pstyle(p) + '"><span class="live-event-time">' + (e.allDay ? 'All day' : App.sameDay(e.start, e.end) ? App.fmt.range(e.start, e.end) : App.fmt.dayShort(e.start) + ' ' + App.fmt.time(e.start) + ' – ' + App.fmt.dayShort(e.end) + ' ' + App.fmt.time(e.end)) + '</span><span><b>' + App.esc(e.title) + '</b><small>' + App.esc(p.name) + (e.loc ? ' · ' + App.esc(e.loc) : '') + '</small></span></button>'; }
 App.liveEventRow = eventRow;
 App.eventSheet = function (e) { if (!e) return; App.sheet('<div class="sheet-pad"><div class="label">' + App.esc(App.evColor(e).name) + '</div><h2 class="serif sheet-h">' + App.esc(e.title) + '</h2><p class="sheet-p">' + App.fmt.day(e.start) + ', ' + App.fmt.month(e.start) + ' ' + e.start.getDate() + ' · ' + (e.allDay ? 'All day' : App.sameDay(e.start, e.end) ? App.fmt.range(e.start, e.end) : App.fmt.dayShort(e.start) + ' ' + App.fmt.time(e.start) + ' – ' + App.fmt.dayShort(e.end) + ' ' + App.fmt.time(e.end)) + '</p>' + (e.loc ? '<p>' + App.esc(e.loc) + '</p>' : '') + '</div>'); };
 function render() {
  if (!V.el) return; var range = dates(), state = H.states.calendar;
  var events = App.events().filter(function (e) { return e.start < range[1] && e.end > range[0] && (V.source === 'all' || e.sourceId === V.source); });
  var grouped = '';
  for (var d = new Date(range[0]); d < range[1]; d = App.addDays(d, 1)) {
   var tomorrow = App.addDays(d, 1), list = events.filter(function (e) { return e.start < tomorrow && e.end > d; });
   if (!list.length && V.mode !== 'day') continue;
   grouped += '<div class="live-agenda-day"><div class="label">' + App.fmt.day(d) + ' · ' + App.fmt.month(d) + ' ' + d.getDate() + '</div>' + list.map(eventRow).join('') + '</div>';
  }
  var errors = state.data ? state.data.sources.filter(function (s) { return s.error; }).map(function (s) { return App.esc(s.name) + ': calendar sync unavailable'; }).join(' · ') : '';
  var rangeNote = state.data ? 'Available calendar window: ' + state.data.rangeStart.slice(0, 10) + ' – ' + state.data.rangeEnd.slice(0, 10) : '';
  V.el.innerHTML = '<div class="live-page"><header class="live-head"><div><div class="label">Subscribed calendars</div><h1 class="serif">Calendar</h1></div><button class="icon-btn" data-nav="-1" aria-label="Previous">' + App.icon('left', 24) + '</button><b class="live-date">' + App.fmt.month(V.date) + ' ' + V.date.getDate() + ', ' + V.date.getFullYear() + '</b><button class="icon-btn" data-nav="1" aria-label="Next">' + App.icon('right', 24) + '</button><button class="btn" data-today>Today</button><div class="seg">' + ['day', 'week', 'month'].map(function (m) { return '<button data-mode="' + m + '" class="' + (m === V.mode ? 'is-on' : '') + '">' + m + '</button>'; }).join('') + '</div></header>' +
   H.statusHTML('calendar') + (errors ? '<p class="live-warning" role="status">' + errors + '</p>' : '') +
   '<div class="chips live-source-chips"><button class="chip' + (V.source === 'all' ? ' is-on' : '') + '" data-source="all">All calendars</button>' + D.sources.map(function (s) { return '<button class="chip' + (V.source === s.id ? ' is-on' : '') + '" data-source="' + App.esc(s.id) + '">' + App.esc(s.name) + '</button>'; }).join('') + '</div>' +
   '<div class="live-scroll">' + (events.length ? grouped : '<p class="live-empty serif">' + (!state.data ? 'Calendar not connected yet.' : 'No events in this view.') + '</p>') + '</div><p class="live-note">' + App.esc(rangeNote) + '</p></div>';
 }
 function click(e) { var b = e.target.closest('button'); if (!b) return; if (b.dataset.ev) return App.eventSheet(App.findEvent(b.dataset.ev)); if (b.dataset.source) V.source = b.dataset.source; if (b.dataset.mode) V.mode = b.dataset.mode; if (b.hasAttribute('data-today')) V.date = App.dayStart(App.now()); if (b.dataset.nav) { var dir = +b.dataset.nav; V.date = V.mode === 'month' ? new Date(V.date.getFullYear(), V.date.getMonth() + dir, 1) : App.addDays(V.date, dir * (V.mode === 'week' ? 7 : 1)); } render(); }
 App.register('calendar', { show: function (el) { if (!V.el) { V.el = el; el.addEventListener('click', click); } if (!V.date) V.date = App.dayStart(App.now()); render(); } });
 App.on('household:calendar', function () { if (App.current === 'calendar') render(); else App.views.calendar._dirty = true; });
})();
