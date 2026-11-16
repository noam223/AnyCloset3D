// ==========================================
// EGGER melamine decors — collapsed under one "צבעי EGGER" button.
// Built-in EGGER keys already used in the app keep their original keys (u727, H1367…).
// Extra catalogue decors use eg_* keys. Source: lgegger.co.il.
// ==========================================
(function() {
    'use strict';
    var V = '20261104';

    // EGGER colours that used to sit in the main solid/texture grids
    var BUILTIN = [
        { key: 'u727',  code: 'U727',  hex: '#a79786', noSandwich: true, noMdf: true },
        { key: 'w1200', code: 'W1200', hex: '#e7e1da', noSandwich: true, noMdf: true },
        { key: 'u232',  code: 'U232',  hex: '#c59578', noSandwich: true, noMdf: true },
        { key: 'u604',  code: 'U604',  hex: '#8f8e76', noSandwich: true, noMdf: true },
        { key: 'u638',  code: 'U638',  hex: '#c0b598', noSandwich: true, noMdf: true },
        { key: 'H1367', code: 'H1367', img: 'textures/H1367.jpg', noSandwich: true, noMdf: true },
        { key: 'H1307', code: 'H1307', img: 'textures/H1307.jpg', noSandwich: true, noMdf: true },
        { key: 'H1227', code: 'H1227', img: 'textures/H1227.jpg', noSandwich: true, noMdf: true }
    ];

    // Additional EGGER decors (not already in the built-in list above)
    var EXTRA_LIST = [
        ['W930', '#efeced'], ['W980', '#f9f5f2'], ['W1000', '#f8f9f6'], ['W1100', '#fefffa'],
        ['U104', '#fefbda'], ['U156', '#e0cab3'], ['U328', '#fb251a'], ['U329', '#f49b03'],
        ['U336', '#feacea'], ['U337', '#aa3e62'], ['U400', '#d8cbe5'], ['U625', '#e1e076'],
        ['U702', '#d6bfad'], ['U708', '#d1cdca'], ['U741', '#5a5349'],
        ['H1122', '#e5dfcc'], ['H1176', '#c3ae94'], ['H1180', '#b2926e'], ['H1181', '#7f664e'],
        ['H1215', '#8e6b4c'], ['H1298', '#dcc2ad'], ['H2033', '#734c29'], ['H3012', '#c8a782'],
        ['H3303', '#b79565'], ['H3453', '#464645'],
        ['F160', '#252c2e'], ['F186', '#899592'], ['F275', '#605555'], ['F381', '#ddd6cc'],
        ['F424', '#7f7e6f'], ['F425', '#cdbead'], ['F426', '#c6bfb9'], ['F433', '#68716e'],
        ['F638', '#9c9d95'], ['F812', '#ebeae4']
    ];

    window.EGGER_BUILTIN_COLORS = BUILTIN.map(function(c) {
        return {
            key: c.key, code: c.code, label: c.code, hex: c.hex || null,
            img: c.img || null, noSandwich: !!c.noSandwich, noMdf: !!c.noMdf
        };
    });
    window.EGGER_EXTRA_COLORS = EXTRA_LIST.map(function(e) {
        return {
            key: 'eg_' + e[0], code: e[0], label: e[0], hex: e[1],
            img: 'textures/egger/' + e[0] + '.jpg?v=' + V,
            noSandwich: true, noMdf: true
        };
    });
    window.EGGER_ALL_COLORS = window.EGGER_BUILTIN_COLORS.concat(window.EGGER_EXTRA_COLORS);
    window.EGGER_EXTRA_KEYS = window.EGGER_EXTRA_COLORS.map(function(c) { return c.key; });
    window.EGGER_BUILTIN_KEYS = window.EGGER_BUILTIN_COLORS.map(function(c) { return c.key; });
    window.EGGER_ALL_KEYS = window.EGGER_ALL_COLORS.map(function(c) { return c.key; });
    window._isEggerExtraColor = function(key) {
        return window.EGGER_EXTRA_KEYS.indexOf(String(key)) >= 0;
    };
    window._isEggerColor = function(key) {
        return window.EGGER_ALL_KEYS.indexOf(String(key)) >= 0;
    };

    function _swatchHtml(c, mobile) {
        var attrs = '';
        if (c.noSandwich) attrs += ' data-no-sandwich="true"';
        if (c.noMdf) attrs += ' data-no-mdf="true"';
        var bg = c.img
            ? "background-image:url('" + c.img + "');background-size:cover;"
            : 'background-color:' + (c.hex || '#ccc') + ';';
        var title = mobile ? '' : ' title="EGGER ' + c.code + '"';
        return '<div class="mat-item"' + attrs + '>' +
            '<button class="material-btn" data-mat="' + c.key + '" style="' + bg + '"' + title + '></button>' +
            '<span onclick="this.previousElementSibling.click()">' + c.label + '</span></div>';
    }

    function _panelHtml(mobile) {
        return window.EGGER_ALL_COLORS.map(function(c) { return _swatchHtml(c, mobile); }).join('');
    }

    function _removeLegacyExtra(parent) {
        if (!parent) return;
        parent.querySelectorAll('.egger-extra-grid').forEach(function(el) {
            var prev = el.previousElementSibling;
            if (prev && /EGGER/.test(prev.textContent || '')) prev.remove();
            el.remove();
        });
    }

    /** Strip built-in EGGER swatches from the main solid/texture grids (left outside = non-EGGER only). */
    function _stripBuiltinFromMainGrids() {
        var keys = window.EGGER_BUILTIN_KEYS;
        keys.forEach(function(key) {
            document.querySelectorAll('.material-btn[data-mat="' + key + '"]').forEach(function(btn) {
                // Keep buttons that already live inside the EGGER panel
                if (btn.closest('.egger-palette-panel')) return;
                var item = btn.closest('.mat-item');
                if (item) item.remove();
            });
        });
    }

    function _injectBlock(afterGrid, mobile) {
        if (!afterGrid) return;
        var parent = afterGrid.parentNode;
        _removeLegacyExtra(parent);
        if (parent.querySelector('.egger-palette-wrap')) return;

        var wrap = document.createElement('div');
        wrap.className = 'egger-palette-wrap';
        wrap.style.margin = mobile ? '0 0 12px' : '14px 0 10px';

        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn-toggle-egger-palette';
        btn.title = 'כל צבעי EGGER שבמערכת';
        btn.innerHTML = '<i class="fa-solid fa-layer-group"></i> צבעי EGGER' +
            '<span class="egger-palette-count">(' + window.EGGER_ALL_COLORS.length + ')</span>' +
            '<i class="fa-solid fa-chevron-down egger-palette-chevron"></i>';

        var panel = document.createElement('div');
        panel.className = 'egger-palette-panel';
        panel.hidden = true;
        panel.innerHTML = '<div class="materials-flat-grid egger-all-grid">' + _panelHtml(mobile) + '</div>';

        btn.addEventListener('click', function() {
            var open = panel.hidden;
            panel.hidden = !open;
            wrap.classList.toggle('open', open);
        });

        wrap.appendChild(btn);
        wrap.appendChild(panel);
        // Place after the texture grid (before tambour / other palette buttons)
        if (afterGrid.nextSibling) parent.insertBefore(wrap, afterGrid.nextSibling);
        else parent.appendChild(wrap);
    }

    window._injectEggerExtraGrids = function() {
        _stripBuiltinFromMainGrids();
        _injectBlock(document.getElementById('mat-texture-grid'), false);
        _injectBlock(document.getElementById('mob-mat-texture-grid'), true);
        // Re-strip after inject so any duplicate builtin left outside is gone.
        _stripBuiltinFromMainGrids();
    };

    /** Highlight EGGER toggle when current material is an EGGER colour; optionally open panel. */
    window._syncEggerPaletteActive = function(matKey, opts) {
        var isEgger = window._isEggerColor(matKey);
        var openPanel = opts && opts.open;
        document.querySelectorAll('.egger-palette-wrap').forEach(function(wrap) {
            wrap.classList.toggle('has-selection', isEgger);
            if (isEgger && openPanel) {
                var panel = wrap.querySelector('.egger-palette-panel');
                if (panel) {
                    panel.hidden = false;
                    wrap.classList.add('open');
                }
            }
        });
    };

    // Must run before ui.js binds .material-btn click handlers
    window._injectEggerExtraGrids();
    document.addEventListener('DOMContentLoaded', window._injectEggerExtraGrids);
})();
