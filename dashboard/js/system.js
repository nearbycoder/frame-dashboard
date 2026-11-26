// Alerts, banners and display settings.
(function () {
  'use strict';
  var $ = App.$;

  // ------------------------------------------------------------ banners (amber, actionable)
  App.banner = function (opts) {
    var box = $('#banners');
    var b = document.createElement('div');
    b.className = 'banner banner--' + (opts.tone || 'amber');
    b.innerHTML = App.icon(opts.icon || 'bell', 30) + '<div class="banner-text"><b>' + opts.title + '</b><span>' + (opts.sub || '') + '</span></div>' +
      (opts.action ? '<button class="banner-btn banner-btn--solid" data-act>' + opts.action + '</button>' : '') +
      '<button class="banner-btn" data-x>' + (opts.dismiss || 'Dismiss') + '</button>';
    box.appendChild(b);
    b.classList.add('is-in');
    function kill() { b.remove(); }
    b.querySelector('[data-x]').onclick = kill;
    if (opts.action) b.querySelector('[data-act]').onclick = function () { kill(); opts.onAction(); };
    if (opts.ms) setTimeout(kill, opts.ms);
    return kill;
  };

  // ------------------------------------------------------------ display settings
  var FESTIVE_OPTIONS = [
    { id: 'harvest', name: 'Harvest Gold', sub: 'Pumpkin, wheat & chestnut', swatches: ['#3B2010', '#C2531A', '#D19122'] },
    { id: 'cranberry', name: 'Cranberry Cider', sub: 'Mulled berry & spiced amber', swatches: ['#54171D', '#9E2430', '#C98824'] },
    { id: 'autumn', name: 'Autumn Sage', sub: 'Woodland sage & maple rust', swatches: ['#263626', '#B8521E', '#C49328'] },
    { id: 'classic', name: 'Classic', sub: 'Neutral year-round', swatches: ['#F2EEE6', '#17191D', '#7A756B'] }
  ];
  App.openDisplaySettings = function () {
    App.sheet('<div class="sheet-pad"><div class="label">Display</div><h2 class="serif sheet-h">Display settings</h2>' +
      '<div class="display-modes">' +
      '<button data-mode="day" aria-pressed="' + (App.theme === 'light') + '" class="' + (App.theme === 'light' ? 'is-on' : '') + '">Light</button>' +
      '<button data-mode="dark" aria-pressed="' + (App.theme === 'dark') + '" class="' + (App.theme === 'dark' ? 'is-on' : '') + '">Dark</button>' +
      '<button data-mode="ambient">Ambient</button><button data-mode="night">Night</button></div>' +
      '<div class="label display-section-label">Thanksgiving theme</div>' +
      '<div class="festive-modes">' + FESTIVE_OPTIONS.map(function (opt) {
        var on = App.festive === opt.id;
        return '<button data-festive="' + opt.id + '" aria-pressed="' + on + '" class="' + (on ? 'is-on' : '') + '">' +
          '<span class="festive-mode-top"><b>' + opt.name + '</b><span class="festive-swatches">' +
          opt.swatches.map(function (hex) { return '<i style="background:' + hex + '"></i>'; }).join('') +
          '</span></span><small>' + opt.sub + '</small></button>';
      }).join('') + '</div></div>', {
      cls: 'sheet--display', onMount: function (sheet, close) {
        sheet.setAttribute('role', 'dialog'); sheet.setAttribute('aria-modal', 'true'); sheet.setAttribute('aria-label', 'Display settings');
        sheet.addEventListener('click', function (e) {
          var f = e.target.closest('[data-festive]');
          if (f) {
            App.setFestive(f.dataset.festive);
            App.$$('[data-festive]', sheet).forEach(function (btn) {
              var on = btn.dataset.festive === App.festive;
              btn.classList.toggle('is-on', on);
              btn.setAttribute('aria-pressed', String(on));
            });
            return;
          }
          var b = e.target.closest('[data-mode]');
          if (!b) return;
          close(); App.setMode(b.dataset.mode);
        });
      }
    });
  };
  App.on('ready', function () {
    $('#displaySettings').onclick = App.openDisplaySettings;
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') App.closeSheet();
    });
  });
})();
