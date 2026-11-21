/**
 * AnyCloset 3D — Accessibility toolbar (Israeli SI 5568 / WCAG 2.0 AA helpers)
 * Loaded on marketing + app pages. Preferences persist in localStorage.
 */
(function () {
  'use strict';
  if (window.__acA11yLoaded) return;
  window.__acA11yLoaded = true;

  var KEY = 'anycloset_a11y_v1';
  var defaults = {
    fontScale: 1,
    contrast: false,
    underline: false,
    readable: false,
    noMotion: false,
    bigCursor: false
  };

  function load() {
    try {
      return Object.assign({}, defaults, JSON.parse(localStorage.getItem(KEY) || '{}'));
    } catch (e) {
      return Object.assign({}, defaults);
    }
  }
  function save(state) {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
  }

  var state = load();

  var css = [
    '#ac-a11y-skip{position:absolute;right:-9999px;top:auto;width:1px;height:1px;overflow:hidden;z-index:100000}',
    '#ac-a11y-skip:focus{position:fixed;right:16px;top:16px;width:auto;height:auto;padding:12px 18px;background:#0a1628;color:#fff;border:2px solid #00d4ff;border-radius:10px;font:700 1rem Heebo,Arial,sans-serif;text-decoration:none;outline:none}',
    '#ac-a11y-root{position:fixed;z-index:99990;left:16px;bottom:16px;font-family:Heebo,Arial,sans-serif;direction:rtl}',
    '#ac-a11y-btn{width:56px;height:56px;border-radius:50%;border:2px solid #fff;background:#005CBC;color:#fff;cursor:pointer;box-shadow:0 8px 28px rgba(0,92,188,.4);display:flex;align-items:center;justify-content:center;padding:0;transition:transform .2s,box-shadow .2s}',
    '#ac-a11y-btn svg{display:block;width:34px;height:34px}',
    '#ac-a11y-btn:hover,#ac-a11y-btn:focus{transform:scale(1.06);box-shadow:0 10px 32px rgba(0,92,188,.55);outline:3px solid #fff;outline-offset:2px}',
    '#ac-a11y-btn[aria-expanded="true"]{background:#004a96}',
    '#ac-a11y-panel{display:none;position:absolute;left:0;bottom:68px;width:min(320px,calc(100vw - 32px));background:#fff;color:#1e293b;border:1px solid #e2e8f0;border-radius:16px;box-shadow:0 18px 50px rgba(15,31,53,.22);padding:14px;max-height:min(70vh,520px);overflow:auto}',
    '#ac-a11y-panel.open{display:block}',
    '#ac-a11y-panel h2{margin:0 0 10px;font-size:1.05rem;font-weight:800;color:#1e3a5f}',
    '#ac-a11y-panel .ac-a11y-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}',
    '#ac-a11y-panel button.ac-opt{appearance:none;border:1px solid #e2e8f0;background:#f8fafc;color:#1e293b;border-radius:12px;padding:10px 8px;font:700 .82rem Heebo,Arial,sans-serif;cursor:pointer;text-align:center;line-height:1.35;min-height:64px}',
    '#ac-a11y-panel button.ac-opt.on{background:#e0f7ff;border-color:#00b8e0;color:#0a4a5c;box-shadow:inset 0 0 0 1px #00b8e0}',
    '#ac-a11y-panel button.ac-opt:focus{outline:3px solid #00d4ff;outline-offset:1px}',
    '#ac-a11y-panel .ac-row{display:flex;gap:8px;margin-top:8px}',
    '#ac-a11y-panel .ac-row button{flex:1;min-height:44px}',
    '#ac-a11y-panel .ac-links{margin-top:12px;display:flex;flex-direction:column;gap:6px}',
    '#ac-a11y-panel .ac-links a{color:#1e3a5f;font-weight:700;font-size:.85rem;text-decoration:underline}',
    '#ac-a11y-panel .ac-note{margin-top:10px;font-size:.75rem;color:#64748b;line-height:1.5}',
    'html.ac-a11y-contrast{filter:contrast(1.25)!important}',
    'html.ac-a11y-contrast body{background:#fff!important;color:#000!important}',
    'html.ac-a11y-underline a{text-decoration:underline!important}',
    'html.ac-a11y-readable,html.ac-a11y-readable body,html.ac-a11y-readable button,html.ac-a11y-readable input,html.ac-a11y-readable select,html.ac-a11y-readable textarea{font-family:Arial,Helvetica,sans-serif!important;letter-spacing:.02em!important;line-height:1.7!important}',
    'html.ac-a11y-nomotion *,html.ac-a11y-nomotion *::before,html.ac-a11y-nomotion *::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}',
    'html.ac-a11y-bigcursor,html.ac-a11y-bigcursor *{cursor:url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'48\' height=\'48\' viewBox=\'0 0 24 24\'%3E%3Cpath fill=\'%23000\' stroke=\'%23fff\' stroke-width=\'1.2\' d=\'M4 3l1 16 4-4 3 7 2-1-3-7h5z\'/%3E%3C/svg%3E") 4 4, auto!important}',
    /* Keyboard-only focus ring — avoid cyan stroke on every mouse click */
    'html.ac-a11y-focus *:focus{outline:none}',
    'html.ac-a11y-focus *:focus-visible{outline:3px solid #00d4ff!important;outline-offset:3px!important}',
    'html.ac-a11y-focus *:focus:not(:focus-visible){outline:none!important}',
    '@media(max-width:480px){#ac-a11y-root{left:10px;bottom:10px}#ac-a11y-btn{width:50px;height:50px}}'
  ].join('');

  function apply() {
    var root = document.documentElement;
    root.style.fontSize = (state.fontScale * 100) + '%';
    root.classList.toggle('ac-a11y-contrast', !!state.contrast);
    root.classList.toggle('ac-a11y-underline', !!state.underline);
    root.classList.toggle('ac-a11y-readable', !!state.readable);
    root.classList.toggle('ac-a11y-nomotion', !!state.noMotion);
    root.classList.toggle('ac-a11y-bigcursor', !!state.bigCursor);
    root.classList.add('ac-a11y-focus');
    syncButtons();
  }

  function syncButtons() {
    var map = {
      contrast: state.contrast,
      underline: state.underline,
      readable: state.readable,
      noMotion: state.noMotion,
      bigCursor: state.bigCursor
    };
    Object.keys(map).forEach(function (k) {
      var el = document.querySelector('#ac-a11y-panel [data-opt="' + k + '"]');
      if (el) {
        el.classList.toggle('on', !!map[k]);
        el.setAttribute('aria-pressed', map[k] ? 'true' : 'false');
      }
    });
    var scaleEl = document.getElementById('ac-a11y-scale');
    if (scaleEl) scaleEl.textContent = Math.round(state.fontScale * 100) + '%';
  }

  function toggle(key) {
    state[key] = !state[key];
    save(state);
    apply();
  }

  function changeFont(delta) {
    state.fontScale = Math.min(1.6, Math.max(0.9, Math.round((state.fontScale + delta) * 10) / 10));
    save(state);
    apply();
  }

  function reset() {
    state = Object.assign({}, defaults);
    save(state);
    apply();
  }

  function mount() {
    var style = document.createElement('style');
    style.id = 'ac-a11y-style';
    style.textContent = css;
    document.head.appendChild(style);

    var skip = document.createElement('a');
    skip.id = 'ac-a11y-skip';
    skip.href = '#main-content';
    skip.textContent = 'דלג לתוכן הראשי';
    skip.addEventListener('click', function (e) {
      var main = document.getElementById('main-content') || document.querySelector('main') || document.querySelector('.hero, .content-wrap, .auth-card, #app, .projects-page');
      if (!main) return;
      e.preventDefault();
      if (!main.hasAttribute('tabindex')) main.setAttribute('tabindex', '-1');
      main.focus({ preventScroll: false });
      main.scrollIntoView({ behavior: state.noMotion ? 'auto' : 'smooth', block: 'start' });
    });
    document.body.prepend(skip);

    if (!document.getElementById('main-content')) {
      var candidate = document.querySelector('main, .hero, .content-wrap, .auth-container, #app-root, .projects-wrap');
      if (candidate) candidate.id = candidate.id || 'main-content';
      else {
        var wrap = document.createElement('span');
        wrap.id = 'main-content';
        wrap.setAttribute('tabindex', '-1');
        wrap.style.cssText = 'position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)';
        wrap.setAttribute('aria-hidden', 'true');
        document.body.insertBefore(wrap, document.body.firstChild.nextSibling);
      }
    }

    var root = document.createElement('div');
    root.id = 'ac-a11y-root';
    root.innerHTML =
      // International Symbol of Access (wheelchair) — do not put a /* */ comment between + concatenations (becomes unary + → NaN)
      '<button type="button" id="ac-a11y-btn" aria-expanded="false" aria-controls="ac-a11y-panel" title="תפריט נגישות" aria-label="פתח תפריט נגישות">' +
        '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
          '<circle cx="14.2" cy="4.2" r="2.1" fill="#fff"/>' +
          '<path fill="#fff" d="M7.6 20.6a4.4 4.4 0 1 1 0-8.8 4.4 4.4 0 0 1 0 8.8zm0-2a2.4 2.4 0 1 0 0-4.8 2.4 2.4 0 0 0 0 4.8z"/>' +
          '<path fill="#fff" d="M9.8 8.6h5.1c.9 0 1.5.4 1.9 1.2l2.4 4.8c.2.5 0 1.1-.5 1.3-.5.2-1.1 0-1.3-.5l-2.2-4.3h-2.4l1 4.2c.1.5-.2 1-.7 1.1l-4 .9c-.5.1-1-.2-1.1-.7-.1-.5.2-1 .7-1.1l2.9-.6-1.2-5.3H9.8c-.6 0-1-.5-1-1s.4-1 1-1z"/>' +
        '</svg>' +
      '</button>' +
      '<div id="ac-a11y-panel" role="dialog" aria-label="הגדרות נגישות" aria-modal="false">' +
        '<h2>תפריט נגישות</h2>' +
        '<div class="ac-row">' +
          '<button type="button" class="ac-opt" id="ac-a11y-font-minus" aria-label="הקטן טקסט">א−</button>' +
          '<button type="button" class="ac-opt" id="ac-a11y-scale" aria-live="polite">100%</button>' +
          '<button type="button" class="ac-opt" id="ac-a11y-font-plus" aria-label="הגדל טקסט">א+</button>' +
        '</div>' +
        '<div class="ac-a11y-grid" style="margin-top:8px">' +
          '<button type="button" class="ac-opt" data-opt="contrast" aria-pressed="false">ניגודיות גבוהה</button>' +
          '<button type="button" class="ac-opt" data-opt="underline" aria-pressed="false">הדגשת קישורים</button>' +
          '<button type="button" class="ac-opt" data-opt="readable" aria-pressed="false">גופן קריא</button>' +
          '<button type="button" class="ac-opt" data-opt="noMotion" aria-pressed="false">עצירת אנימציה</button>' +
          '<button type="button" class="ac-opt" data-opt="bigCursor" aria-pressed="false">סמן גדול</button>' +
          '<button type="button" class="ac-opt" id="ac-a11y-reset">איפוס</button>' +
        '</div>' +
        '<div class="ac-links">' +
          '<a href="accessibility.html">הצהרת נגישות</a>' +
          '<a href="mailto:anycloset3d@gmail.com?subject=' + encodeURIComponent('פנייה בנושא נגישות — AnyCloset 3D') + '">דיווח על בעיית נגישות</a>' +
          '<a href="https://wa.me/972546659798?text=' + encodeURIComponent('שלום, פנייה בנושא נגישות באתר AnyCloset 3D') + '" target="_blank" rel="noopener">וואטסאפ לרכז הנגישות</a>' +
        '</div>' +
        '<p class="ac-note">ההגדרות נשמרות במכשיר שלך. עורך התלת-ממד מוגבל לנגישות מלאה במקלדת/קורא מסך — ראו בהצהרה.</p>' +
      '</div>';
    document.body.appendChild(root);

    var btn = document.getElementById('ac-a11y-btn');
    var panel = document.getElementById('ac-a11y-panel');
    btn.addEventListener('click', function () {
      var open = panel.classList.toggle('open');
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      btn.setAttribute('aria-label', open ? 'סגור תפריט נגישות' : 'פתח תפריט נגישות');
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && panel.classList.contains('open')) {
        panel.classList.remove('open');
        btn.setAttribute('aria-expanded', 'false');
        btn.focus();
      }
    });
    document.addEventListener('click', function (e) {
      if (!root.contains(e.target) && panel.classList.contains('open')) {
        panel.classList.remove('open');
        btn.setAttribute('aria-expanded', 'false');
      }
    });

    document.getElementById('ac-a11y-font-plus').addEventListener('click', function () { changeFont(0.1); });
    document.getElementById('ac-a11y-font-minus').addEventListener('click', function () { changeFont(-0.1); });
    document.getElementById('ac-a11y-reset').addEventListener('click', reset);
    panel.querySelectorAll('[data-opt]').forEach(function (el) {
      el.addEventListener('click', function () { toggle(el.getAttribute('data-opt')); });
    });

    apply();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();
