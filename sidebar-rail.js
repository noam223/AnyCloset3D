// Right sidebar: side icon rail (one settings group at a time), color-part dots,
// and keyboard behaviour for the compact header dimension chips.
(function() {
    'use strict';

    var STORAGE_KEY = 'sbRailTab';
    var GROUPS = ['customer', 'cabinet', 'room', 'extras', 'colors'];
    var NEEDS_CABINET = { cabinet: true, extras: true, colors: true };

    function $(id) { return document.getElementById(id); }

    function _layout() { return $('sb-rail-layout'); }

    function _isShown(el, stopAt) {
        for (var n = el; n && n !== stopAt; n = n.parentElement) {
            if (n.style && n.style.display === 'none') return false;
        }
        return true;
    }

    function _isEditing() {
        var ec = $('sidebar-edit-content');
        return !!ec && ec.style.display !== 'none';
    }

    function _groupHasContent(group) {
        var panels = $('sb-rail-panels');
        if (!panels) return false;
        var els = panels.querySelectorAll('[data-sbgroup="' + group + '"]');
        for (var i = 0; i < els.length; i++) {
            if (_isShown(els[i], panels)) return true;
        }
        return false;
    }

    function _groupAvailable(group) {
        if (group === 'customer') return true;
        if (NEEDS_CABINET[group] && !_isEditing()) return true; // shows the "select a cabinet" placeholder
        return _groupHasContent(group);
    }

    window._sbRailSelect = function(group, opts) {
        var layout = _layout();
        if (!layout || GROUPS.indexOf(group) === -1) return;
        var changed = layout.getAttribute('data-active') !== group;
        layout.setAttribute('data-active', group);
        layout.querySelectorAll('.sb-rail-btn').forEach(function(b) {
            b.classList.toggle('active', b.getAttribute('data-sbtab') === group);
        });
        if (!(opts && opts.silent)) {
            try { localStorage.setItem(STORAGE_KEY, group); } catch (e) {}
        }
        if (changed) {
            var scroller = layout.closest('.sidebar-scroll-area');
            if (scroller && scroller.scrollTop > layout.offsetTop) scroller.scrollTop = layout.offsetTop;
        }
    };

    window._sbRailRevealFor = function(el) {
        if (!el || !el.closest) return;
        if (el.id === 'sidebar-edit-content') { window._sbRailSelect('cabinet', { silent: true }); return; }
        var holder = el.closest('[data-sbgroup]');
        if (holder) window._sbRailSelect(holder.getAttribute('data-sbgroup'), { silent: true });
    };

    var _refreshQueued = false;
    function _refresh() {
        _refreshQueued = false;
        var layout = _layout();
        if (!layout) return;
        layout.querySelectorAll('.sb-rail-btn').forEach(function(b) {
            b.style.display = _groupAvailable(b.getAttribute('data-sbtab')) ? '' : 'none';
        });
        var active = layout.getAttribute('data-active');
        if (!_groupAvailable(active)) window._sbRailSelect('colors', { silent: true });
    }
    function _queueRefresh() {
        if (_refreshQueued) return;
        _refreshQueued = true;
        requestAnimationFrame(_refresh);
    }
    window._sbRailRefresh = _queueRefresh;

    // ── Color-part dots: show each part's current finish on its tab ──
    function _swatchFor(key) {
        if (!key) return null;
        var btn = null;
        try {
            btn = document.querySelector('#materials-section .material-btn[data-mat="' + CSS.escape(String(key)) + '"]');
        } catch (e) {}
        if (btn) {
            var bi = btn.style.backgroundImage;
            if (bi && bi !== 'none') return { image: bi };
            if (btn.style.backgroundColor) return { color: btn.style.backgroundColor };
        }
        var m = window.materials && window.materials[key];
        if (m && m.color && !m.map && typeof m.color.getHexString === 'function') {
            return { color: '#' + m.color.getHexString() };
        }
        return null;
    }

    function _partMaterial(part) {
        if (typeof state === 'undefined' || typeof getWing !== 'function') return null;
        var w = getWing();
        if (!w) return null;
        if (part === 'materialSideCabinet') {
            var sc = (state.wings && state.wings.center && state.wings.center.sideCabinet) || w.sideCabinet;
            return sc ? (sc.materialBody || 'white_matte') : null;
        }
        if (part === 'materialUpperUnit') {
            var uu = state.wings && state.wings['upperUnit_' + state.activeWing];
            return uu ? (uu.materialBody || 'white_matte') : null;
        }
        return w[part] || w.materialBody || 'white_matte';
    }

    window._syncPartTabDots = function() {
        document.querySelectorAll('#materials-section .part-tab-btn[data-part]').forEach(function(btn) {
            var dot = btn.querySelector('.ptb-dot');
            if (!dot) return;
            var sw = _swatchFor(_partMaterial(btn.getAttribute('data-part')));
            if (!sw) { dot.classList.remove('has'); return; }
            dot.style.backgroundImage = sw.image || 'none';
            dot.style.backgroundColor = sw.color || '#fff';
            dot.classList.add('has');
        });
    };

    var _dotTimer = null;
    function _queueDots() {
        clearTimeout(_dotTimer);
        _dotTimer = setTimeout(window._syncPartTabDots, 120);
    }

    // ── Header dimension chips ──
    function _initDimChips() {
        var row = $('header-dims-row');
        if (!row) return;
        row.addEventListener('keydown', function(e) {
            var t = e.target;
            if (!t || t.tagName !== 'INPUT' || t.type !== 'number') return;
            if (e.key === 'Enter' || e.key === 'Escape') t.blur();
        });
        row.addEventListener('focusin', function(e) {
            var t = e.target;
            if (t && t.tagName === 'INPUT' && t.type === 'number' && typeof t.select === 'function') {
                setTimeout(function() { try { t.select(); } catch (err) {} }, 0);
            }
        });
    }

    function _init() {
        var layout = _layout();
        if (layout) {
            var saved = null;
            try { saved = localStorage.getItem(STORAGE_KEY); } catch (e) {}
            window._sbRailSelect(GROUPS.indexOf(saved) !== -1 ? saved : 'colors', { silent: true });

            layout.querySelector('#sb-rail').addEventListener('click', function(e) {
                var b = e.target.closest('.sb-rail-btn');
                if (b) window._sbRailSelect(b.getAttribute('data-sbtab'));
            });

            var panels = $('sb-rail-panels');
            if (panels && 'MutationObserver' in window) {
                new MutationObserver(_queueRefresh).observe(panels, {
                    subtree: true, attributes: true, attributeFilter: ['style']
                });
            }
            _refresh();
        }
        _initDimChips();
        document.addEventListener('click', _queueDots, true);
        _queueDots();
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', _init);
    else _init();
})();
