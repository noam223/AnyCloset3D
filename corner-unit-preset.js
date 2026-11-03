// ==========================================
// corner-unit-preset.js
// Standalone "corner unit" cabinet (corner drawers / corner desk) that lives as its own
// cabinet in a shared space. Data stays in wing.corner (flagged standalone) so the existing
// corner controls, renderer, pricing and print helpers keep working.
// The engine turns the unit so its open side faces the front, so header dims map straight:
// width = corner.width (front face), depth = corner.depth, height = corner.height.
// Also owns the add-ons tab: the "add unit to space" buttons and the legacy embedded add-on sections.
// Loaded after writing-desk-preset.js in index.html.
// ==========================================

const CU_DEFAULTS = {
    drawers: { width: 60, height: 90, depth: 54 },
    desk:    { width: 60, height: 75, depth: 54 }
};

function _getCUWing() {
    return state && state.wings && state.wings.center ? state.wings.center : null;
}

function _isCornerUnitPreset() {
    return state.presetId === 'corner-unit';
}

/** Mirrors the corner dims onto the wing so footprint, camera and blueprint frames see the real size. */
function _cuSyncWingDims(cw) {
    if (!cw || !cw.corner) return;
    const cu = cw.corner;
    cw.width = cu.width || 60;
    cw.depth = cu.depth || 54;
    cw.globalHeight = cu.height || 90;
    const sync = (ids, val) => ids.forEach(id => { const el = document.getElementById(id); if (el) el.value = val; });
    sync(['inp-width', 'inp-num-width', 'dim-pill-width', 'inp-slider-width', 'ep-inp-width', 'ep-inp-num-width'], cw.width);
    sync(['inp-depth', 'inp-num-depth', 'dim-pill-depth', 'inp-slider-depth', 'ep-inp-depth', 'ep-inp-num-depth'], cw.depth);
    sync(['inp-height', 'inp-num-height', 'dim-pill-height', 'inp-slider-height', 'ep-inp-height', 'ep-inp-num-height'], cw.globalHeight);
    const lbl = document.getElementById('val-height');
    if (lbl) lbl.innerText = cw.globalHeight;
    if (typeof window._syncAllRangeFills === 'function') window._syncAllRangeFills();
}

window._applyCornerUnitPreset = function(type) {
    const cw = _getCUWing();
    if (!cw) return;
    const prev = cw.corner && cw.corner.standalone ? cw.corner : null;
    const t = (type === 'desk' || type === 'drawers') ? type : ((prev && prev.type === 'desk') ? 'desk' : 'drawers');
    const d = CU_DEFAULTS[t];

    cw.columns = [];
    cw.hasDoors = false;
    cw.desk = { side: 'none', width: 100, height: 80, hasDrawers: true, drawerHeight: 12, drawerCount: null, mergeDrawers: false };
    cw.writingDesk = null;
    cw.sideCabinet = null;
    cw.corner = {
        side: 'right', standalone: true, type: t,
        width: d.width, height: d.height, depth: d.depth,
        shelves: 3, drawerCount: 4,
        deskDrawerCount: 0, deskDrawerHeight: 13, deskFloating: false
    };
    cw.activeColorPart = 'materialBody';
    _cuSyncWingDims(cw);
    window._updateExtrasSections();
};

/** Called by _applyPresetCore when converting a corner unit into another cabinet type. */
window._leaveCornerUnitPreset = function() {
    const cw = _getCUWing();
    if (!cw) return;
    cw.corner = { side: 'none', width: 60, height: 90, depth: 54, type: 'shelves', shelves: 3, drawerCount: 4 };
    if (!cw.columns || !cw.columns.length) {
        cw.width = 160; cw.depth = 54; cw.globalHeight = 240;
        cw.hasDoors = true;
        const t = cw.thickness || 1.7;
        const colW = (cw.width - t * 3) / 2;
        cw.columns = [0, 1].map(function() {
            const col = {
                type: 'normal', width: colW, height: cw.globalHeight,
                shelves: 0, splitY: null, shelvesY: [], compartments: [], doors: [], floorOffset: 0
            };
            _distributeShelves(col, cw);
            return col;
        });
    }
};

/** Add-ons tab: space add buttons + legacy embedded add-ons (edit / remove only). */
window._updateExtrasSections = function() {
    const pid = state.presetId || 'linear';
    const cw = _getCUWing();
    const isCU = pid === 'corner-unit';
    const isWD = pid === 'writing-desk';
    const isSliding = pid === 'sliding';
    const hasWings = pid === 'corner-right' || pid === 'corner-left' || pid === 'walkin';
    const w = (typeof getWing === 'function' ? getWing() : null) || cw;

    const hasLegacySide = !!(w && ((w.desk && w.desk.side && w.desk.side !== 'none') ||
        (w.sideCabinet && w.sideCabinet.side && w.sideCabinet.side !== 'none')));
    const hasLegacyCorner = !!(w && w.corner && w.corner.side && w.corner.side !== 'none' && !w.corner.standalone);

    const showSide = !isSliding && !isWD && !isCU && hasLegacySide;
    const showCorner = isCU || (!isSliding && !hasWings && !isWD && hasLegacyCorner);

    const suSection = document.getElementById('side-unit-section');
    if (suSection) suSection.style.display = showSide ? '' : 'none';
    const cuSection = document.getElementById('corner-unit-section');
    if (cuSection) cuSection.style.display = showCorner ? '' : 'none';

    // Legacy side unit: only the active type + "remove"
    const curSide = (w && w.desk && w.desk.side !== 'none') ? 'desk'
        : ((w && w.sideCabinet && w.sideCabinet.side !== 'none') ? 'side_cabinet' : 'none');
    document.querySelectorAll('.side-unit-btn').forEach(function(b) {
        const tp = b.dataset.type;
        b.style.display = (tp === 'none' || tp === curSide) ? '' : 'none';
    });
    document.querySelectorAll('.side-unit-btn[data-type="none"] span').forEach(function(s) { s.textContent = 'הסר'; });
    const mSideBlock = document.getElementById('mobile-side-unit-block');
    if (mSideBlock) mSideBlock.style.display = showSide ? '' : 'none';

    // Corner section: standalone hides side picker + dims (header dims drive the unit)
    const sideBtns = document.getElementById('corner-side-btns');
    const dimsGroup = document.getElementById('corner-dims-group');
    const cuTitle = document.getElementById('corner-unit-title');
    if (isCU) {
        if (sideBtns) sideBtns.style.display = 'none';
        if (dimsGroup) dimsGroup.style.display = 'none';
        const cc = document.getElementById('corner-controls');
        if (cc) cc.style.display = 'block';
        if (cuTitle) cuTitle.textContent = (cw && cw.corner && cw.corner.type === 'desk') ? 'הגדרות שולחן פינתי' : 'הגדרות שידה פינתית';
    } else {
        if (sideBtns) sideBtns.style.display = 'flex';
        if (dimsGroup) dimsGroup.style.display = '';
        if (cuTitle) cuTitle.textContent = 'יחידה פינתית';
        // Legacy corner: only the active side + "remove"
        const curCorner = (w && w.corner && w.corner.side) || 'none';
        document.querySelectorAll('.corner-side-btn').forEach(function(b) {
            const sd = b.dataset.side;
            b.style.display = (sd === 'none' || sd === curCorner) ? '' : 'none';
        });
        document.querySelectorAll('.corner-side-btn[data-side="none"] span').forEach(function(s) { s.textContent = 'הסר'; });
    }

    // Space add buttons
    const canUse = typeof window._spacePairCanUse === 'function' && window._spacePairCanUse();
    const info = typeof window._getSpacePairInfo === 'function' ? window._getSpacePairInfo() : null;
    const planLocked = !!(info && info.planLimitReached);
    const canAdd = canUse && (!info || info.canAddMore || planLocked);
    ['space-units-section', 'mobile-space-units-block'].forEach(function(id) {
        const el = document.getElementById(id);
        if (el) el.style.display = canAdd ? '' : 'none';
    });
    document.querySelectorAll('.space-unit-add-btn').forEach(function(b) {
        b.classList.toggle('plan-locked', planLocked);
    });

    // Plinth / board material rows are meaningless for a corner unit
    if (isCU) {
        const plinthGrid = document.getElementById('plinth-placement-grid');
        if (plinthGrid) plinthGrid.style.display = 'none';
        const boardMatRow = document.getElementById('board-mat-row');
        if (boardMatRow) boardMatRow.style.display = 'none';
        const unitsSection = document.getElementById('units-content-section');
        if (unitsSection) unitsSection.style.display = 'none';
        const plinthCard = document.querySelector('#header-dims-row .header-dim-card:nth-child(3)');
        if (plinthCard) plinthCard.style.display = 'none';
        const ph = document.getElementById('dim-pill-height');
        const sh = document.getElementById('inp-height');
        if (ph) ph.max = 280;
        if (sh) sh.max = 280;
    }
};

(function() {
    const _origApplyPreset = window.applyPreset;
    window.applyPreset = function(presetId) {
        if (typeof _origApplyPreset === 'function') _origApplyPreset(presetId);
        window._updateExtrasSections();
    };
})();

(function() {
    const _origRestore = window._restorePresetUI;
    window._restorePresetUI = function() {
        if (typeof _origRestore === 'function') _origRestore();
        window._updateExtrasSections();
    };
})();

(function() {
    const _origSync = window.syncSidebarToWing;
    window.syncSidebarToWing = function() {
        if (typeof _origSync === 'function') _origSync();
        window._updateExtrasSections();
    };
})();

(function() {
    ['updateSideUnitType', 'updateCorner'].forEach(function(fn) {
        const orig = window[fn];
        if (typeof orig !== 'function') return;
        window[fn] = function(field) {
            // A standalone corner unit always stays attached to its own frame
            if (fn === 'updateCorner' && _isCornerUnitPreset() && field === 'side') return;
            const r = orig.apply(this, arguments);
            if (fn === 'updateCorner' && _isCornerUnitPreset()) {
                const cw = _getCUWing();
                if (cw && cw.corner) {
                    // Switching type resets the height to that type's default
                    if (field === 'type') cw.corner.height = CU_DEFAULTS[cw.corner.type === 'desk' ? 'desk' : 'drawers'].height;
                    _cuSyncWingDims(cw);
                    if (field === 'type') {
                        if (typeof buildCabinet === 'function') buildCabinet();
                        if (typeof updateCameraView === 'function') updateCameraView();
                    }
                }
            }
            window._updateExtrasSections();
            return r;
        };
    });
    window.updateCornerSide = function(side) { window.updateCorner('side', side); };
    window.updateCornerType = function(type) { window.updateCorner('type', type); };
})();

(function() {
    const _origUpdateDim = window.updateDim;
    window.updateDim = function(dim, delta, absoluteValue) {
        if (!_isCornerUnitPreset() || (dim !== 'width' && dim !== 'height' && dim !== 'depth')) {
            if (typeof _origUpdateDim === 'function') _origUpdateDim(dim, delta, absoluteValue);
            return;
        }
        const cw = _getCUWing();
        if (!cw || !cw.corner) return;
        const cu = cw.corner;
        const key = dim;
        const limits = { width: [30, 120], depth: [30, 80], height: [40, 280] }[key];
        const cur = cu[key] || CU_DEFAULTS.drawers[key];
        let val = (absoluteValue !== null && absoluteValue !== undefined) ? parseInt(absoluteValue, 10) : cur + (delta || 0);
        if (isNaN(val)) return;
        val = Math.max(limits[0], Math.min(limits[1], val));
        cu[key] = val;
        state.manualPrice = null;
        _cuSyncWingDims(cw);
        if (typeof buildCabinet === 'function') buildCabinet();
        if (typeof updateCameraView === 'function') updateCameraView();
        if (typeof calculatePrice === 'function') calculatePrice();
        if (typeof saveHistoryState === 'function') saveHistoryState();
    };
})();

document.addEventListener('DOMContentLoaded', function() {
    window._updateExtrasSections();
});
