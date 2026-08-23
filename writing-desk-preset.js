// ==========================================
// writing-desk-preset.js
// Logic for the standalone "writing desk" cabinet preset.
// Loaded after state.js in index.html.
// ==========================================

const WD_DEFAULT_WIDTH  = 120;
const WD_DEFAULT_DEPTH  = 60;
const WD_DEFAULT_HEIGHT = 75;

function _getWDWing() {
    return state && state.wings && state.wings.center ? state.wings.center : null;
}

function _wdDeskHeight() {
    const cw = _getWDWing();
    return (cw && cw.writingDesk && cw.writingDesk.height != null)
        ? cw.writingDesk.height
        : WD_DEFAULT_HEIGHT;
}

function _syncWDHeightInputs(h) {
    ['inp-height', 'inp-num-height', 'ep-inp-height', 'ep-inp-num-height',
     'dim-pill-height', 'inp-slider-height'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = h;
    });
    const lbl = document.getElementById('val-height');
    if (lbl) lbl.innerText = h;
}

window._applyWritingDeskPreset = function() {
    const cw = _getWDWing();
    if (!cw) return;

    cw.columns = [];
    cw.hasDoors = false;
    cw.desk = { side: 'none', width: 100, height: WD_DEFAULT_HEIGHT, hasDrawers: true, drawerHeight: 12, drawerCount: null };
    cw.corner = { side: 'none', width: 60, height: 90, depth: 54, type: 'shelves', shelves: 3, drawerCount: 4 };
    cw.sideCabinet = null;
    cw.plinthHeight = 0;
    cw.cabinetModel = 'c9';
    cw.boardMaterial = 'melamine';
    cw.writingDesk = {
        height: WD_DEFAULT_HEIGHT,
        hasDrawers: true,
        drawerCount: 2,
        drawerHeight: 12
    };
    cw.activeColorPart = 'materialBody';
    cw.materialDesk = cw.materialBody || 'white_matte';

    if (typeof updateDim === 'function') {
        // Set dims directly — avoid updateDim here (it calls updateCameraView before debounced buildCabinet).
        cw.width = WD_DEFAULT_WIDTH;
        cw.depth = WD_DEFAULT_DEPTH;
        cw.globalHeight = WD_DEFAULT_HEIGHT;
        cw.writingDesk.height = WD_DEFAULT_HEIGHT;
        const _wdSync = (ids, val) => ids.forEach(id => { const el = document.getElementById(id); if (el) el.value = val; });
        _wdSync(['inp-width', 'inp-num-width', 'dim-pill-width', 'inp-slider-width'], WD_DEFAULT_WIDTH);
        _wdSync(['inp-depth', 'inp-num-depth', 'dim-pill-depth', 'inp-slider-depth'], WD_DEFAULT_DEPTH);
        _syncWDHeightInputs(WD_DEFAULT_HEIGHT);
        if (typeof window._syncAllRangeFills === 'function') window._syncAllRangeFills();
    } else {
        cw.width = WD_DEFAULT_WIDTH;
        cw.depth = WD_DEFAULT_DEPTH;
        cw.globalHeight = WD_DEFAULT_HEIGHT;
        cw.writingDesk.height = WD_DEFAULT_HEIGHT;
    }

    _updateWritingDeskSectionUI();
};

window._setWritingDeskDrawers = function(enabled) {
    const cw = _getWDWing();
    if (!cw) return;
    if (!cw.writingDesk) cw.writingDesk = {};
    cw.writingDesk.hasDrawers = !!enabled;
    _updateWritingDeskSectionUI();
    if (typeof buildCabinet === 'function') buildCabinet();
    if (typeof calculatePrice === 'function') calculatePrice();
    if (typeof saveHistoryState === 'function') saveHistoryState();
};

window._setWritingDeskDrawerCount = function(delta) {
    const cw = _getWDWing();
    if (!cw || !cw.writingDesk) return;
    const current = cw.writingDesk.drawerCount != null
        ? cw.writingDesk.drawerCount
        : ((state.width || WD_DEFAULT_WIDTH) <= 80 ? 1 : 2);
    cw.writingDesk.drawerCount = Math.max(1, Math.min(4, current + delta));
    const inp = document.getElementById('wd-inp-drawer-count');
    if (inp) inp.value = cw.writingDesk.drawerCount;
    const lbl = document.getElementById('wd-val-drawer-count');
    if (lbl) lbl.innerText = cw.writingDesk.drawerCount;
    if (typeof buildCabinet === 'function') buildCabinet();
    if (typeof calculatePrice === 'function') calculatePrice();
    if (typeof saveHistoryState === 'function') saveHistoryState();
};

window._setWritingDeskDrawerHeight = function(val) {
    const cw = _getWDWing();
    if (!cw) return;
    if (!cw.writingDesk) cw.writingDesk = {};
    const h = Math.max(8, Math.min(40, parseInt(val, 10) || 12));
    cw.writingDesk.drawerHeight = h;
    const slider = document.getElementById('wd-inp-drawer-height');
    const lbl = document.getElementById('wd-val-drawer-height');
    if (slider) slider.value = h;
    if (lbl) lbl.innerText = h + ' ס\'\'מ';
    if (typeof buildCabinet === 'function') buildCabinet();
    if (typeof calculatePrice === 'function') calculatePrice();
    if (typeof saveHistoryState === 'function') saveHistoryState();
};

function _updateWritingDeskSectionUI() {
    const cw = _getWDWing();
    const wd = (cw && cw.writingDesk) || {};
    const hasDrawers = wd.hasDrawers !== false;

    const toggle = document.getElementById('wd-inp-drawers');
    if (toggle) toggle.checked = hasDrawers;

    const drawersBlock = document.getElementById('wd-drawers-block');
    if (drawersBlock) drawersBlock.style.display = hasDrawers ? '' : 'none';

    const count = wd.drawerCount != null
        ? wd.drawerCount
        : ((state.width || WD_DEFAULT_WIDTH) <= 80 ? 1 : 2);
    const countInp = document.getElementById('wd-inp-drawer-count');
    const countLbl = document.getElementById('wd-val-drawer-count');
    if (countInp) countInp.value = count;
    if (countLbl) countLbl.innerText = count;

    const dh = wd.drawerHeight != null ? wd.drawerHeight : 12;
    const dhSlider = document.getElementById('wd-inp-drawer-height');
    const dhLbl = document.getElementById('wd-val-drawer-height');
    if (dhSlider) dhSlider.value = dh;
    if (dhLbl) dhLbl.innerText = dh + ' ס\'\'מ';
}

window._updateWritingDeskSectionVisibility = function() {
    const section = document.getElementById('writing-desk-section');
    if (!section) return;
    const isWD = (state.presetId === 'writing-desk');
    section.style.display = isWD ? '' : 'none';

    const plinthGrid = document.getElementById('plinth-placement-grid');
    if (plinthGrid) plinthGrid.style.display = isWD ? 'none' : '';

    const boardMatRow = document.getElementById('board-mat-row');
    if (boardMatRow) boardMatRow.style.display = (isWD || state.presetId === 'bathroom') ? 'none' : '';

    const suSection = document.getElementById('side-unit-section');
    if (suSection) suSection.style.display = isWD ? 'none' : '';

    const cuSection = document.getElementById('corner-unit-section');
    if (cuSection) cuSection.style.display = isWD ? 'none' : '';

    const unitsSection = document.getElementById('units-content-section');
    if (unitsSection && isWD) unitsSection.style.display = 'none';

    const plinthCard = document.querySelector('#header-dims-row .header-dim-card:nth-child(3)');
    if (plinthCard) plinthCard.style.display = isWD ? 'none' : '';

    const heightLabel = document.querySelector('label[for="dim-pill-height"]');
    if (heightLabel) heightLabel.textContent = isWD ? 'גובה שולחן' : 'גובה';

    if (isWD) {
        const ph = document.getElementById('dim-pill-height');
        const sh = document.getElementById('inp-height');
        const h = _wdDeskHeight();
        if (ph) ph.max = 120;
        if (sh) sh.max = 120;
        _syncWDHeightInputs(h);
        _updateWritingDeskSectionUI();
    } else {
        const ph = document.getElementById('dim-pill-height');
        const sh = document.getElementById('inp-height');
        if (ph) ph.max = (window.MAX_GLOBAL_HEIGHT || 370);
        if (sh) sh.max = (window.MAX_GLOBAL_HEIGHT || 370);
    }
};

function _highlightWritingDeskPresetButtons(presetId) {
    const isWD = presetId === 'writing-desk';
    const btn = document.getElementById('preset-btn-writing-desk');
    const mBtn = document.getElementById('mobile-preset-btn-writing-desk');
    if (btn) btn.classList.toggle('active', isWD);
    if (mBtn) mBtn.classList.toggle('active', isWD);
}

(function() {
    const _origApplyPreset = window.applyPreset;
    window.applyPreset = function(presetId) {
        if (typeof _origApplyPreset === 'function') _origApplyPreset(presetId);
        _highlightWritingDeskPresetButtons(presetId);
        window._updateWritingDeskSectionVisibility();
    };
})();

(function() {
    const _origRestore = window._restorePresetUI;
    window._restorePresetUI = function() {
        if (typeof _origRestore === 'function') _origRestore();
        const presetId = state.presetId || 'linear';
        _highlightWritingDeskPresetButtons(presetId);
        window._updateWritingDeskSectionVisibility();
    };
})();

(function() {
    const _origSync = window.syncSidebarToWing;
    window.syncSidebarToWing = function() {
        if (typeof _origSync === 'function') _origSync();
        window._updateWritingDeskSectionVisibility();
    };
})();

(function() {
    const _origUpdateDim = window.updateDim;
    window.updateDim = function(dim, delta, absoluteValue) {
        if (state.presetId !== 'writing-desk') {
            if (typeof _origUpdateDim === 'function') _origUpdateDim(dim, delta, absoluteValue);
            return;
        }

        const cw = _getWDWing();
        if (!cw) return;
        if (!cw.writingDesk) cw.writingDesk = { height: WD_DEFAULT_HEIGHT, hasDrawers: true, drawerCount: 2, drawerHeight: 12 };

        let val;
        if (absoluteValue !== null) {
            val = parseInt(absoluteValue, 10);
        } else if (dim === 'width') {
            val = state.width + delta;
        } else if (dim === 'height') {
            val = _wdDeskHeight() + delta;
        } else if (dim === 'depth') {
            val = state.depth + delta;
        } else {
            if (typeof _origUpdateDim === 'function') _origUpdateDim(dim, delta, absoluteValue);
            return;
        }
        if (isNaN(val)) return;

        state.manualPrice = null;

        if (dim === 'width') {
            const _maxW = (window._roomWidth && window._roomWidth > 0) ? window._roomWidth : 600;
            val = Math.max(typeof MIN_WARDROBE_WIDTH !== 'undefined' ? MIN_WARDROBE_WIDTH : 10, Math.min(_maxW, val));
            state.width = val;
            cw.width = val;
            const wEl = document.getElementById('inp-width');
            const wNum = document.getElementById('inp-num-width');
            if (wEl) wEl.value = val;
            if (wNum) wNum.value = val;
            const pw = document.getElementById('dim-pill-width');
            if (pw) pw.value = val;
        } else if (dim === 'height') {
            const _maxH = (window._roomHeight && window._roomHeight > 0) ? window._roomHeight : (window.MAX_GLOBAL_HEIGHT || 370);
            val = Math.max(50, Math.min(120, val));
            cw.writingDesk.height = val;
            cw.globalHeight = val;
            state.globalHeight = val;
            _syncWDHeightInputs(val);
        } else if (dim === 'depth') {
            val = Math.max(10, Math.min(80, val));
            state.depth = val;
            cw.depth = val;
            const dEl = document.getElementById('inp-depth');
            const dNum = document.getElementById('inp-num-depth');
            if (dEl) dEl.value = val;
            if (dNum) dNum.value = val;
        } else {
            if (typeof _origUpdateDim === 'function') _origUpdateDim(dim, delta, absoluteValue);
            return;
        }

        if (typeof window._syncAllRangeFills === 'function') window._syncAllRangeFills();
        const pw = document.getElementById('dim-pill-width');
        const pd = document.getElementById('dim-pill-depth');
        if (pw && dim === 'width') pw.value = state.width;
        if (pd && dim === 'depth') pd.value = state.depth;
        if (typeof buildCabinet === 'function') buildCabinet();
        else if (typeof buildCabinetDebounced === 'function') buildCabinetDebounced();
        if (typeof updateCameraView === 'function') updateCameraView();
        if (typeof calculatePrice === 'function') calculatePrice();
    };
})();

document.addEventListener('DOMContentLoaded', function() {
    window._updateWritingDeskSectionVisibility();
});
