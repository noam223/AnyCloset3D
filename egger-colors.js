// ==========================================
// Additional EGGER melamine decors (separate category from the built-in colors).
// Source: lgegger.co.il melamine boards catalogue. Decors already offered in the
// built-in palette (U727, H1367, H1307, H1227, W1200, U232, U604, U638) are not repeated.
// ==========================================
(function() {
    'use strict';
    var V = '20261104';
    var LIST = [
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

    window.EGGER_EXTRA_COLORS = LIST.map(function(e) {
        return { key: 'eg_' + e[0], code: e[0], label: e[0], hex: e[1], img: 'textures/egger/' + e[0] + '.jpg?v=' + V };
    });
    window.EGGER_EXTRA_KEYS = window.EGGER_EXTRA_COLORS.map(function(c) { return c.key; });
    window._isEggerExtraColor = function(key) { return window.EGGER_EXTRA_KEYS.indexOf(String(key)) >= 0; };

    function _gridHtml(mobile) {
        return window.EGGER_EXTRA_COLORS.map(function(c) {
            return '<div class="mat-item" data-no-sandwich="true" data-no-mdf="true">' +
                '<button class="material-btn" data-mat="' + c.key + '" style="background-image:url(\'' + c.img + '\');background-size:cover;"' +
                (mobile ? '' : ' title="EGGER ' + c.code + '"') + '></button>' +
                '<span onclick="this.previousElementSibling.click()">' + c.label + '</span></div>';
        }).join('');
    }

    /** Inserts the "צבעי EGGER נוספים" block after an existing texture grid (desktop + mobile sidebars). */
    function _injectGrid(afterGrid, mobile) {
        if (!afterGrid || afterGrid.parentNode.querySelector('.egger-extra-grid')) return;
        var title = document.createElement('div');
        if (mobile) title.className = 'mobile-section-title';
        else title.style.cssText = 'font-size: 0.9rem; font-weight: bold; margin: 25px 0 12px; color: var(--text-dark);';
        title.textContent = mobile ? 'צבעי EGGER נוספים' : 'צבעי EGGER נוספים:';
        var grid = document.createElement('div');
        grid.className = 'materials-flat-grid egger-extra-grid';
        grid.style.marginBottom = '15px';
        grid.innerHTML = _gridHtml(mobile);
        afterGrid.parentNode.insertBefore(title, afterGrid.nextSibling);
        afterGrid.parentNode.insertBefore(grid, title.nextSibling);
    }

    window._injectEggerExtraGrids = function() {
        _injectGrid(document.getElementById('mat-texture-grid'), false);
        var mob = document.getElementById('mob-mat-texture-grid');
        if (mob) _injectGrid(mob, true);
    };
    if (document.readyState !== 'loading') window._injectEggerExtraGrids();
    else document.addEventListener('DOMContentLoaded', window._injectEggerExtraGrids);
})();
