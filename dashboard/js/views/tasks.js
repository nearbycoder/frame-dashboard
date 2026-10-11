// Chore occurrences are identified by both chore ID and their Central calendar date.
(function () {
 'use strict';
 var H = App.household, D = window.DATA, V = { el: null, day: null };
 function selected() { return V.day || H.dateKey(App.now()); }
 function row(c) { var pending = H.pending.chores[c.id]; return '<button class="live-chore' + (c.completed ? ' is-done' : '') + '" data-chore="' + App.esc(c.id) + '" ' + (pending ? 'disabled' : '') + '><span class="live-check">' + (pending ? '…' : c.completed ? '✓' : '') + '</span><span><b>' + App.esc(c.title) + '</b><small>' + (pending ? 'Saving…' : c.overdue ? 'Overdue · ' + c.date : c.notes ? App.esc(c.notes) : c.repeat === 'once' ? 'One time' : c.repeat) + '</small></span></button>'; }
 function render() {
  if (!V.el) return; var s = H.states.chores, data = s.data, day = selected();
  var list = D.chores.filter(function (c) { return c.date === day || c.overdue; });
  var completed = list.filter(function (c) { return c.completed; }).length;
  var start = data ? App.toCentralDate(data.weekStart) : App.dayStart(App.now());
  V.el.innerHTML = '<div class="live-page"><header class="live-head"><div><div class="label">Shared chores · Central time</div><h1 class="serif">Chores</h1></div><button class="icon-btn" data-week="-1" aria-label="Previous week">' + App.icon('left', 24) + '</button><button class="btn" data-today>Today</button><button class="icon-btn" data-week="1" aria-label="Next week">' + App.icon('right', 24) + '</button><span class="live-count">' + (data ? completed + ' / ' + list.length + ' done' : '') + '</span><button class="btn btn--solid" data-create ' + (!data || !D.people.length ? 'disabled' : '') + '>Add chore</button></header>' + H.statusHTML('chores') +
   '<div class="live-week">' + [0, 1, 2, 3, 4, 5, 6].map(function (i) { var d = App.addDays(start, i), key = H.dateKey(d); return '<button data-date="' + key + '" class="' + (key === day ? 'is-on' : '') + '"><b>' + App.fmt.dayShort(d) + '</b><span>' + d.getDate() + '</span></button>'; }).join('') + '</div>' +
   '<div class="live-chore-lanes">' + D.people.map(function (p) { var chores = list.filter(function (c) { return c.personId === p.id; }); return '<section class="live-person-lane"><header style="' + App.pstyle(p) + '"><b>' + App.esc(p.name) + '</b><span>' + chores.filter(function (c) { return c.completed; }).length + ' / ' + chores.length + '</span></header><div class="live-person-list">' + (chores.length ? chores.map(row).join('') : '<p class="live-note">Nothing assigned for this date.</p>') + '</div></section>'; }).join('') + (!D.people.length ? '<p class="live-empty serif">' + (data ? 'Add participants in Ring OS to assign chores.' : 'Chores not connected yet.') + '</p>' : '') + '</div></div>';
 }
 function addSheet() {
  App.sheet('<form class="sheet-pad live-form"><div class="label">Shared chores</div><h2 class="serif sheet-h">Add chore</h2><label>Chore<input name="title" maxlength="160" required placeholder="What needs doing?"></label><label>Assigned to<select name="person">' + D.people.map(function (p) { return '<option value="' + App.esc(p.id) + '">' + App.esc(p.name) + '</option>'; }).join('') + '</select></label><div class="live-form-row"><label>Start date<input name="date" type="date" value="' + selected() + '" required></label><label>Repeat<select name="repeat"><option value="once">One time</option><option value="daily">Daily</option><option value="weekly">Weekly</option></select></label></div><label class="live-weekday-field" hidden>Weekly days<div class="live-weekday-options">' + ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(function (day, i) { return '<label><input type="checkbox" name="weekday" value="' + (i + 1) + '">' + day + '</label>'; }).join('') + '</div></label><label>Notes<input name="notes" maxlength="1000" placeholder="Optional"></label><p class="live-warning" data-error role="status"></p><div class="sheet-actions"><button type="button" class="btn" data-close>Cancel</button><button class="btn btn--solid" type="submit">Save chore</button></div></form>', {
   cls: 'sheet--wide', onMount: function (sheet, close) {
    var form = sheet.querySelector('form'), repeat = form.elements.repeat;
    repeat.onchange = function () { sheet.querySelector('.live-weekday-field').hidden = repeat.value !== 'weekly'; };
    form.onsubmit = function (e) {
     e.preventDefault(); var schedule = { repeat: repeat.value, startDate: form.elements.date.value };
     if (schedule.repeat === 'weekly') { schedule.weekdays = Array.prototype.filter.call(form.querySelectorAll('[name=weekday]'), function (x) { return x.checked; }).map(function (x) { return +x.value; }); if (!schedule.weekdays.length) { sheet.querySelector('[data-error]').textContent = 'Choose at least one weekly day.'; return; } }
     var button = form.querySelector('[type=submit]'); button.disabled = true;
     H.write('chores', 'create', { personId: form.elements.person.value, title: form.elements.title.value.trim(), notes: form.elements.notes.value.trim(), schedule: schedule }, 'create').then(function () { close(); App.toast('Chore saved', { icon: 'check' }); }, function (error) { button.disabled = false; sheet.querySelector('[data-error]').textContent = error.message; });
    };
   }
  });
 }
 function click(e) { var b = e.target.closest('button'); if (!b) return;
  if (b.dataset.chore) { var c = D.chores.filter(function (c) { return c.id === b.dataset.chore; })[0]; if (c) H.write('chores', 'complete', { choreId: c.choreId, date: c.date, completed: !c.completed }, c.id).catch(function (e) { App.toast(App.esc(e.message), { tone: 'error' }); }); return; }
  if (b.dataset.date) { V.day = b.dataset.date; return render(); }
  if (b.dataset.week) { var week = H.states.chores.data ? App.toCentralDate(H.states.chores.data.weekStart) : App.now(); V.day = H.dateKey(App.addDays(week, +b.dataset.week * 7)); H.refresh('chores', V.day); return render(); }
  if (b.hasAttribute('data-today')) { V.day = null; H.refresh('chores', null); return render(); }
  if (b.hasAttribute('data-create')) addSheet();
 }
 App.register('tasks', { show: function (el) { if (!V.el) { V.el = el; el.addEventListener('click', click); } render(); } });
 App.on('household:chores', function () { if (App.current === 'tasks') render(); else App.views.tasks._dirty = true; });
})();
