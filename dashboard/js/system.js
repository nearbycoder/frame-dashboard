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
  App.openDisplaySettings = function () {
    App.sheet('<div class="sheet-pad"><div class="label">Display</div><h2 class="serif sheet-h">Display settings</h2>' +
      '<div class="display-modes">' +
      '<button data-mode="day" aria-pressed="' + (App.theme === 'light') + '" class="' + (App.theme === 'light' ? 'is-on' : '') + '">Light</button>' +
      '<button data-mode="dark" aria-pressed="' + (App.theme === 'dark') + '" class="' + (App.theme === 'dark' ? 'is-on' : '') + '">Dark</button>' +
      '<button data-mode="ambient">Ambient</button><button data-mode="night">Night</button></div></div>', {
      cls: 'sheet--display', onMount: function (sheet, close) {
        sheet.setAttribute('role', 'dialog'); sheet.setAttribute('aria-modal', 'true'); sheet.setAttribute('aria-label', 'Display settings');
        sheet.addEventListener('click', function (e) {
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
