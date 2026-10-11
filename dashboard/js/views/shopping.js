// Shared Ring shopping list. Every edit is confirmed by a server readback.
(function () {
 'use strict';
 var H = App.household, D = window.DATA, V = { el: null, query: '', checked: false };
 function error(e) { App.toast(App.esc(e.message), { tone: 'error', ms: 6000 }); }
 function row(g) { var pending = H.pending.shopping[g.id]; return '<div class="s-row"><button class="s-hit" data-check="' + App.esc(g.id) + '" ' + (pending ? 'disabled' : '') + '><span class="s-box live-shopping-check' + (g.checked ? ' is-done' : '') + '">' + (pending ? '…' : g.checked ? '✓' : '') + '</span><span class="s-name"><b>' + App.esc(g.name) + '</b><small>' + (pending ? 'Saving…' : App.esc(g.note || g.unit || '')) + '</small></span></button><div class="s-qty"><button data-qty="-1" data-id="' + App.esc(g.id) + '" aria-label="Decrease quantity" ' + (pending || g.quantity <= 1 ? 'disabled' : '') + '>' + App.icon('minus', 22) + '</button><span class="num">' + g.quantity + '</span><button data-qty="1" data-id="' + App.esc(g.id) + '" aria-label="Increase quantity" ' + (pending || g.quantity >= 999 ? 'disabled' : '') + '>' + App.icon('plus', 22) + '</button></div></div>'; }
 function usualHTML() {
  var q = V.query.trim().toLowerCase(), matches = D.usuals.filter(function (g) { return !q || g.name.toLowerCase().indexOf(q) >= 0; }).slice(0, q ? 8 : 12);
  return '<div class="label">' + (q ? 'Saved items' : 'Usuals · tap to add') + '</div><div class="live-usuals">' + matches.map(function (g) { return '<button class="s-tile" data-usual="' + App.esc(g.id) + '" ' + (H.pending.shopping['usual:' + g.id] ? 'disabled' : '') + '><b>' + App.esc(g.name) + '</b><span>' + App.esc(g.unit || g.category) + ' · ×' + g.defaultQuantity + '</span></button>'; }).join('') + (!matches.length ? '<p class="live-note">' + (q ? 'No matching saved items. Press Enter to add your item.' : 'No usual items saved yet.') + '</p>' : '') + '</div>';
 }
 function paint() {
  if (!V.el) return; var sc = V.el.querySelector('.s-list'), top = sc ? sc.scrollTop : 0;
  var items = D.groceries.filter(function (g) { return g.checked === V.checked; });
  var groups = D.catOrder.all.map(function (cat) { return { cat: cat, items: items.filter(function (g) { return g.category === cat; }) }; }).filter(function (group) { return group.items.length; });
  V.el.querySelector('.live-shopping-list').innerHTML = H.statusHTML('shopping') + (items.length ? groups.map(function (group) { return '<div class="s-cat"><div class="s-cat-h"><span class="label">' + App.esc(group.cat) + '</span><span class="label">' + group.items.length + '</span></div>' + group.items.map(row).join('') + '</div>'; }).join('') : '<p class="live-empty serif">' + (H.states.shopping.data ? V.checked ? 'No checked items.' : 'Your shopping list is empty.' : 'Shopping not connected yet.') + '</p>');
  V.el.querySelector('.s-count').textContent = H.states.shopping.data ? D.groceries.filter(function (g) { return !g.checked; }).length + ' items to get' : '';
  V.el.querySelector('.s-suggest').innerHTML = usualHTML();
  V.el.querySelector('[data-checked]').textContent = V.checked ? 'Show unfinished' : 'Checked items';
  var form = V.el.querySelector('form'); form.querySelector('[type=submit]').disabled = !H.states.shopping.data || !!H.pending.shopping.add;
  if (sc) sc.scrollTop = top;
 }
 function render() {
  if (!V.el.firstChild) {
   V.el.innerHTML = '<div class="shop"><header class="s-head"><div><div class="label">Shared shopping list</div><h1 class="serif">Shopping</h1></div><div class="s-count"></div><button class="btn" data-checked>Checked items</button></header><div class="s-list live-shopping-list"></div><aside class="s-side"><form class="s-add live-shopping-add"><label class="s-input-wrap">' + App.icon('plus', 26) + '<input class="s-input" maxlength="240" placeholder="Add an item…" required autocomplete="off"></label><button class="btn btn--solid" type="submit">Add item</button></form><div class="s-suggest live-usual-scroll"></div></aside></div>';
   var input = V.el.querySelector('input'); input.value = V.query;
   input.oninput = function () { V.query = input.value; V.el.querySelector('.s-suggest').innerHTML = usualHTML(); };
   V.el.querySelector('form').onsubmit = function (e) { e.preventDefault(); var name = input.value.trim(); if (!name) return;
    H.write('shopping', 'add', { name: name, quantity: 1 }, 'add').then(function () { input.value = ''; V.query = ''; paint(); App.toast('Item saved to shopping list', { icon: 'cart' }); }, error);
   };
  }
  paint();
 }
 function click(e) { var b = e.target.closest('button'); if (!b) return;
  if (b.hasAttribute('data-checked')) { V.checked = !V.checked; return paint(); }
  if (b.dataset.usual) { var u = D.usuals.filter(function (u) { return u.id === b.dataset.usual; })[0]; if (u) H.write('shopping', 'add', { usualItemId: u.id, quantity: u.defaultQuantity }, 'usual:' + u.id).catch(error); return; }
  var id = b.dataset.check || b.dataset.id, g = D.groceries.filter(function (g) { return g.id === id; })[0]; if (!g) return;
  var body = { id: g.id }; if (b.dataset.check) body.checked = !g.checked; else if (b.dataset.qty) body.quantity = Math.max(1, Math.min(999, g.quantity + +b.dataset.qty)); else return;
  H.write('shopping', 'update', body, g.id).catch(error);
 }
 App.register('shopping', { show: function (el) { if (!V.el) { V.el = el; el.addEventListener('click', click); } render(); } });
 App.on('household:shopping', function () { if (App.current === 'shopping') paint(); else App.views.shopping._dirty = true; });
})();
