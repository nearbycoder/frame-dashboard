// Shared Ring shopping list. Every edit is confirmed by a server readback.
(function () {
 'use strict';
 var H = App.household, D = window.DATA;
 var V = { el: null, query: '', checked: false, picker: null, search: '', category: '', page: 0, catalog: [], listSignature: null, refreshing: false };
 var pageSize = 18;
 function error(e) { App.toast(App.esc(e.message), { tone: 'error', ms: 6000 }); }
 function usual(id) { return D.usuals.filter(function (u) { return u.id === id; })[0]; }
 function photo(g, cls) {
  var source = g.imageUrl || (g.usualItemId && usual(g.usualItemId) || {}).imageUrl;
  return '<span class="product-photo ' + cls + '" aria-hidden="true">' + App.icon('cart', 28)
   + (source ? '<img src="/product-image?url=' + App.esc(encodeURIComponent(source)) + '" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">' : '') + '</span>';
 }
 function imageError(e) { if (e.target.tagName === 'IMG') e.target.remove(); }
 function row(g) {
  var pending = H.pending.shopping[g.id];
  return '<div class="s-row" data-row-id="' + App.esc(g.id) + '"><button class="s-hit" data-check="' + App.esc(g.id) + '" ' + (pending ? 'disabled' : '') + '><span class="s-box live-shopping-check' + (g.checked ? ' is-done' : '') + '">' + (pending ? '…' : g.checked ? '✓' : '') + '</span>' + photo(g, 'product-photo--list') + '<span class="s-name"><b>' + App.esc(g.name) + '</b><small>' + (pending ? pending === 'remove' ? 'Removing…' : 'Saving…' : App.esc(g.note || g.unit || '')) + '</small></span></button><div class="s-qty"><button data-qty="-1" data-id="' + App.esc(g.id) + '" aria-label="Decrease quantity" ' + (pending || g.quantity <= 1 ? 'disabled' : '') + '>' + App.icon('minus', 22) + '</button><span class="num">' + g.quantity + '</span><button data-qty="1" data-id="' + App.esc(g.id) + '" aria-label="Increase quantity" ' + (pending || g.quantity >= 999 ? 'disabled' : '') + '>' + App.icon('plus', 22) + '</button></div><button class="s-remove" data-remove="' + App.esc(g.id) + '" aria-label="Remove ' + App.esc(g.name) + '" ' + (pending ? 'disabled' : '') + '>' + App.icon('trash', 25) + '</button></div>';
 }
 function quantity(id) { return D.groceries.reduce(function (sum, g) { return sum + (!g.checked && g.usualItemId === id ? g.quantity : 0); }, 0); }
 function tileState(button) {
  var id = button.dataset.usual, pending = !!H.pending.shopping['usual:' + id], count = quantity(id);
  button.disabled = !H.states.shopping.data || pending || count > 0;
  button.classList.toggle('is-added', count > 0);
  button.querySelector('.usual-state').textContent = pending ? 'Saving…' : count ? 'In list · ×' + count : 'Add to list';
 }
 function paintPicker(rebuild) {
  if (!V.picker) return;
  // Update confirmations in place: saving never resets scroll, focus or image loads.
  if (!rebuild) { V.picker.querySelectorAll('[data-usual]').forEach(tileState); return; }
  var q = V.search.trim().toLowerCase();
  var matches = V.catalog.filter(function (u) { return (!V.category || u.category === V.category) && (!q || (u.name + ' ' + (u.unit || '')).toLowerCase().indexOf(q) >= 0); });
  var pages = Math.max(1, Math.ceil(matches.length / pageSize));
  V.page = Math.min(V.page, pages - 1);
  V.picker.querySelector('.usual-grid').innerHTML = matches.slice(V.page * pageSize, (V.page + 1) * pageSize).map(function (u) {
   return '<button class="usual-product" data-usual="' + App.esc(u.id) + '" aria-label="Add ' + App.esc(u.name) + '">' + photo(u, 'product-photo--picker') + '<b>' + App.esc(u.name) + '</b><span class="usual-state" aria-live="polite"></span></button>';
  }).join('') || '<p class="live-empty serif">No matching usual items.</p>';
  V.picker.querySelector('.usual-grid').scrollTop = 0;
  V.picker.querySelector('.usual-pages').textContent = matches.length + ' items · Page ' + (V.page + 1) + ' of ' + pages;
  V.picker.querySelector('[data-page="-1"]').disabled = !V.page;
  V.picker.querySelector('[data-page="1"]').disabled = V.page >= pages - 1;
  paintPicker(false);
 }
 function openPicker() {
  V.search = ''; V.category = ''; V.page = 0; V.catalog = D.usuals.slice();
  var categories = V.catalog.map(function (u) { return u.category; }).filter(function (c, i, a) { return c && a.indexOf(c) === i; }).sort();
  App.sheet('<header class="usual-header"><h1 class="serif">Usual items</h1><div class="usual-filters"><input type="search" class="usual-search" placeholder="Search usual items…" aria-label="Search usual items" autocomplete="off"><select class="usual-category" aria-label="Category"><option value="">All categories</option>' + categories.map(function (c) { return '<option value="' + App.esc(c) + '">' + App.esc(c) + '</option>'; }).join('') + '</select></div></header><div class="usual-grid"></div><footer class="usual-footer"><span class="usual-pages"></span><button class="btn" data-page="-1">Previous</button><button class="btn" data-page="1">Next</button><button class="btn btn--solid" data-close>Done</button></footer>', {
   cls: 'sheet--usuals',
   onClose: function () { V.picker = null; },
   onMount: function (el) {
    V.picker = el;
    el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', 'Usual items');
    el.addEventListener('error', imageError, true);
    el.querySelector('.usual-search').oninput = function (e) { V.search = e.target.value; V.page = 0; paintPicker(true); };
    el.querySelector('.usual-category').onchange = function (e) { V.category = e.target.value; V.page = 0; paintPicker(true); };
    el.addEventListener('click', function (e) {
     var b = e.target.closest('button'); if (!b || b.disabled) return;
     if (b.dataset.page) { V.page += +b.dataset.page; paintPicker(true); }
     if (b.dataset.usual) { var u = V.catalog.filter(function (u) { return u.id === b.dataset.usual; })[0]; if (u) H.write('shopping', 'add', { usualItemId: u.id, quantity: u.defaultQuantity }, 'usual:' + u.id).catch(error); }
    });
    paintPicker(true);
   }
  });
 }
 function paint() {
  if (!V.el) return; var sc = V.el.querySelector('.s-list'), top = sc ? sc.scrollTop : 0;
  var items = D.groceries.filter(function (g) { return g.checked === V.checked; });
  var groups = D.catOrder.all.map(function (cat) { return { cat: cat, items: items.filter(function (g) { return g.category === cat; }) }; }).filter(function (group) { return group.items.length; });
  V.el.querySelector('.live-shopping-status').innerHTML = H.statusHTML('shopping');
  // Keep existing product images, focus and row nodes during pending/quantity edits.
  var signature = JSON.stringify([V.checked, !!H.states.shopping.data, groups.map(function (group) { return [group.cat, group.items.map(function (g) { return [g.id, g.imageUrl || (g.usualItemId && usual(g.usualItemId) || {}).imageUrl]; })]; })]);
  if (signature !== V.listSignature) {
   V.el.querySelector('.live-shopping-items').innerHTML = items.length ? groups.map(function (group) { return '<div class="s-cat"><div class="s-cat-h"><span class="label">' + App.esc(group.cat) + '</span><span class="label">' + group.items.length + '</span></div>' + group.items.map(row).join('') + '</div>'; }).join('') : '<p class="live-empty serif">' + (H.states.shopping.data ? V.checked ? 'No checked items.' : 'Your shopping list is empty.' : 'Shopping not connected yet.') + '</p>';
   V.listSignature = signature;
  } else {
   V.el.querySelectorAll('[data-row-id]').forEach(function (el) {
    var g = items.filter(function (g) { return g.id === el.dataset.rowId; })[0]; if (!g) return;
    var pending = H.pending.shopping[g.id];
    el.querySelector('[data-check]').disabled = !!pending;
    el.querySelector('.s-box').textContent = pending ? '…' : g.checked ? '✓' : '';
    el.querySelector('.s-box').classList.toggle('is-done', g.checked);
    el.querySelector('.s-name b').textContent = g.name;
    el.querySelector('.s-name small').textContent = pending ? pending === 'remove' ? 'Removing…' : 'Saving…' : g.note || g.unit || '';
    el.querySelector('.s-qty .num').textContent = g.quantity;
    el.querySelector('[data-qty="-1"]').disabled = !!pending || g.quantity <= 1;
    el.querySelector('[data-qty="1"]').disabled = !!pending || g.quantity >= 999;
    el.querySelector('[data-remove]').disabled = !!pending;
    el.querySelector('[data-remove]').setAttribute('aria-label', 'Remove ' + g.name);
   });
  }
  V.el.querySelector('.s-count').textContent = H.states.shopping.data ? D.groceries.filter(function (g) { return !g.checked; }).length + ' items to get' : '';
  var refresh = V.el.querySelector('[data-shopping-refresh]');
  refresh.textContent = V.refreshing ? 'Refreshing…' : 'Refresh';
  refresh.disabled = V.refreshing || Object.keys(H.pending.shopping).length > 0;
  refresh.setAttribute('aria-busy', String(V.refreshing));
  V.el.querySelector('[data-checked]').textContent = V.checked ? 'Show unfinished' : 'Checked items';
  V.el.querySelector('[data-open-usuals]').disabled = !H.states.shopping.data || !D.usuals.length;
  V.el.querySelector('.usual-catalog-count').textContent = D.usuals.length + ' usual items';
  var form = V.el.querySelector('form'); form.querySelector('[type=submit]').disabled = !H.states.shopping.data || !!H.pending.shopping.add;
  if (sc) sc.scrollTop = top;
  paintPicker(false);
 }
 function render() {
  if (!V.el.firstChild) {
   V.el.innerHTML = '<div class="shop"><header class="s-head"><div><div class="label">Shared shopping list</div><h1 class="serif">Shopping</h1></div><div class="s-count"></div><button class="btn" data-shopping-refresh aria-label="Refresh shopping list">Refresh</button><button class="btn" data-checked>Checked items</button></header><div class="s-list live-shopping-list"><div class="live-shopping-status"></div><div class="live-shopping-items"></div></div><aside class="s-side"><form class="s-add live-shopping-add"><label class="s-input-wrap">' + App.icon('plus', 26) + '<input class="s-input" maxlength="240" placeholder="Add an item…" required autocomplete="off"></label><button class="btn btn--solid" type="submit">Add item</button></form><button class="usual-open" data-open-usuals>' + App.icon('cart', 40) + '<b>Add usual items</b><span class="usual-catalog-count"></span>' + App.icon('plus', 28) + '</button></aside></div>';
   var input = V.el.querySelector('input'); input.value = V.query;
   input.oninput = function () { V.query = input.value; };
   V.el.addEventListener('error', imageError, true);
   V.el.querySelector('form').onsubmit = function (e) { e.preventDefault(); var name = input.value.trim(); if (!name) return;
    H.write('shopping', 'add', { name: name, quantity: 1 }, 'add').then(function () { input.value = ''; V.query = ''; paint(); App.toast('Item saved to shopping list', { icon: 'cart' }); }, error);
   };
  }
  paint();
 }
 function click(e) { var b = e.target.closest('button'); if (!b || b.disabled) return;
  if (b.hasAttribute('data-shopping-refresh')) {
   V.refreshing = true; paint();
   var task = H.refresh('shopping', undefined, true), generation = H.states.shopping.generation;
   task.then(function () {
    V.refreshing = false; paint();
    if (generation !== H.states.shopping.generation) return; // An edit cancelled the read.
    if (H.states.shopping.error) return error({ message: H.states.shopping.error });
    App.toast('Shopping refreshed', { icon: 'cart' });
   });
   return;
  }
  if (b.hasAttribute('data-open-usuals')) return openPicker();
  if (b.hasAttribute('data-checked')) { V.checked = !V.checked; return paint(); }
  var id = b.dataset.remove || b.dataset.check || b.dataset.id, g = D.groceries.filter(function (g) { return g.id === id; })[0]; if (!g) return;
  if (b.dataset.remove) { H.write('shopping', 'remove', { id: g.id }, g.id).then(function () { App.toast('Item removed from shopping list', { icon: 'cart' }); }, error); return; }
  var body = { id: g.id }; if (b.dataset.check) body.checked = !g.checked; else if (b.dataset.qty) body.quantity = Math.max(1, Math.min(999, g.quantity + +b.dataset.qty)); else return;
  H.write('shopping', 'update', body, g.id).catch(error);
 }
 App.register('shopping', { show: function (el) { if (!V.el) { V.el = el; el.addEventListener('click', click); } render(); } });
 App.on('household:shopping', function () { if (App.current === 'shopping') paint(); else App.views.shopping._dirty = true; });
})();
