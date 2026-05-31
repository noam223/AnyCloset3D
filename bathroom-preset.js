// ==========================================
// bathroom-preset.js
// Logic for the "bathroom" cabinet preset.
// Loaded after state.js in index.html.
// ==========================================

// ---- Height constants ----
// Target: 90 cm from floor to top of sink/countertop
// Cabinet body height = 90 - slab_thickness - vessel_height (if applicable)
const BATH_HEIGHTS = {
    integral:  88,    // 90 - 2cm slab (integral sink, no vessel on top)
    butcher26: 72.4,  // 90 - 2.6cm slab - 15cm vessel
    butcher40: 71,    // 90 - 4cm slab - 15cm vessel
    corian12:  73.8   // 90 - 1.2cm slab - 15cm vessel
};
const BATH_DEPTH        = 50;   // cm
const BATH_PLINTH_STAND = 15;   // cm — legs/plinth height for standing cabinet
const BATH_PLINTH_HANG  = 0;    // cm — no plinth for hanging cabinet
const BATH_HANG_FLOOR_OFFSET = 50; // cm — hanging cabinet floats 50cm above floor
const BATH_HANG_BODY_H       = 54; // cm — hanging cabinet body is always 54cm tall

// ---- Helper: get current wing ----
function _getBathWing() {
    return state && state.wings && state.wings.center ? state.wings.center : null;
}

// ---- Helper: apply height via updateDim (updates globalHeight + column heights + sliders) ----
function _applyBathHeight(h) {
    if (typeof updateDim === 'function') {
        updateDim('height', null, h);
    } else {
        const cw = _getBathWing();
        if (cw) cw.globalHeight = h;
        const ids = ['inp-height', 'inp-num-height', 'ep-inp-height', 'ep-inp-num-height'];
        ids.forEach(id => { const el = document.getElementById(id); if (el) el.value = h; });
    }
}

// ---- Helper: apply depth via updateDim ----
function _applyBathDepth(d) {
    if (typeof updateDim === 'function') {
        updateDim('depth', null, d);
    } else {
        const cw = _getBathWing();
        if (cw) cw.depth = d;
        const ids = ['inp-depth', 'inp-num-depth', 'ep-inp-depth', 'ep-inp-num-depth'];
        ids.forEach(id => { const el = document.getElementById(id); if (el) el.value = d; });
    }
}

// ---- Apply bathroom preset defaults ----
window._applyBathroomPreset = function() {
    const cw = _getBathWing();
    if (!cw) return;

    cw.bathroomStyle  = 'standing';
    cw.countertopType = 'integral';
    cw.plinthHeight   = BATH_PLINTH_STAND;
    cw.cabinetModel   = 'regalim';   // standing bathroom uses nickel legs (no solid plinth block)
    cw.boardMaterial  = 'sandwich';  // bathroom always uses sandwich board material

    // Set integral sink on all columns
    if (cw.columns) {
        cw.columns.forEach(col => {
            col.sinkPanel   = true;
            col.topPanel    = false;
            col.noPlinth    = false;
            col.floorOffset = 0;
        });
    }

    // Sync plinth model selector
    const plinthSel = document.getElementById('inp-plinth');
    if (plinthSel) plinthSel.value = 'regalim';

    // Use updateDim so column heights + sliders are all updated correctly
    _applyBathDepth(BATH_DEPTH);
    _applyBathHeight(BATH_HEIGHTS.integral);
    _updateBathroomSectionUI();
};

// ---- Set bathroom style: 'standing' | 'hanging' ----
window._setBathroomStyle = function(style) {
    const cw = _getBathWing();
    if (!cw) return;

    cw.bathroomStyle = style;

    if (style === 'hanging') {
        cw.plinthHeight  = BATH_PLINTH_HANG;
        cw.cabinetModel  = 'maya'; // hanging: no legs, no plinth — use plain model
        // All columns: floorOffset=50 so cabinet floats 50cm above floor
        if (cw.columns) {
            cw.columns.forEach(col => {
                col.noPlinth    = false; // don't use noPlinth — use floorOffset instead
                col.floorOffset = BATH_HANG_FLOOR_OFFSET; // 50cm from floor (wall-mounted height)
            });
        }
        // Always set height so body = BATH_HANG_BODY_H (54cm) regardless of countertop type
        // col.height = floorOffset + body_height = 50 + 54 = 104
        _applyBathHeight(BATH_HANG_FLOOR_OFFSET + BATH_HANG_BODY_H);
    } else {
        // standing — nickel legs, restore plinth height and correct body height
        cw.plinthHeight  = BATH_PLINTH_STAND;
        cw.cabinetModel  = 'regalim'; // standing: nickel legs (no solid plinth block)
        if (cw.columns) {
            cw.columns.forEach(col => {
                col.noPlinth    = false;
                col.floorOffset = 0;
            });
        }
        const ct = cw.countertopType || 'integral';
        _applyBathHeight(BATH_HEIGHTS[ct] || BATH_HEIGHTS.integral);
    }

    // Sync the plinth model selector in sidebar
    const plinthSel = document.getElementById('inp-plinth');
    if (plinthSel) plinthSel.value = cw.cabinetModel;

    _updateBathroomSectionUI();
    if (typeof buildCabinet === 'function') buildCabinet();
    if (typeof calculatePrice === 'function') calculatePrice();
    if (typeof saveHistoryState === 'function') saveHistoryState();
};

// ---- Set countertop type ----
window._setBathroomCountertop = function(type) {
    const cw = _getBathWing();
    if (!cw) return;

    cw.countertopType = type;

    // Update sink panel on all columns
    const isIntegral = (type === 'integral');
    if (cw.columns) {
        cw.columns.forEach(col => {
            col.sinkPanel = isIntegral;
            if (isIntegral) col.topPanel = false;
        });
    }

    // Update height only for standing cabinets
    if (cw.bathroomStyle !== 'hanging') {
        _applyBathHeight(BATH_HEIGHTS[type] || BATH_HEIGHTS.integral);
    }

    _updateBathroomSectionUI();
    if (typeof buildCabinet === 'function') buildCabinet();
    if (typeof calculatePrice === 'function') calculatePrice();
    if (typeof saveHistoryState === 'function') saveHistoryState();
};

// ---- Set door groove style ----
window._setBathroomDoorStyle = function(grooveStyle) {
    const cw = _getBathWing();
    if (!cw) return;
    cw.doorGrooveStyle = grooveStyle || 'plain';
    _updateBathroomSectionUI();
    if (typeof buildCabinet === 'function') buildCabinet();
    if (typeof saveHistoryState === 'function') saveHistoryState();
};

// ---- Update bathroom section UI (button highlights) ----
function _updateBathroomSectionUI() {
    const cw = _getBathWing();
    const style      = (cw && cw.bathroomStyle)    || 'standing';
    const ct         = (cw && cw.countertopType)   || 'integral';
    const grooveSt   = (cw && cw.doorGrooveStyle)  || 'plain';

    // Style buttons — set individual properties to avoid cssText conflicts
    const standBtn = document.getElementById('bath-btn-standing');
    const hangBtn  = document.getElementById('bath-btn-hanging');
    function _setBathStyleBtn(btn, isActive) {
        if (!btn) return;
        btn.style.background   = isActive ? 'var(--accent)'    : 'var(--bg-light)';
        btn.style.color        = isActive ? 'white'            : 'var(--text-dark)';
        btn.style.borderColor  = isActive ? 'var(--accent)'    : 'var(--border)';
    }
    _setBathStyleBtn(standBtn, style === 'standing');
    _setBathStyleBtn(hangBtn,  style === 'hanging');

    // Countertop buttons
    const topIds = ['integral', 'butcher26', 'butcher40', 'corian12'];
    topIds.forEach(id => {
        const btn = document.getElementById('bath-top-' + id);
        if (!btn) return;
        if (id === ct) {
            btn.style.border = '1.5px solid var(--accent)';
            btn.style.background = 'rgba(99,102,241,0.1)';
            btn.style.color = 'var(--accent)';
        } else {
            btn.style.border = '1.5px solid var(--border)';
            btn.style.background = 'var(--bg-light)';
            btn.style.color = 'var(--text-dark)';
        }
    });

    // Groove style dropdown
    const grooveSel = document.getElementById('bath-groove-select');
    if (grooveSel) grooveSel.value = grooveSt;
}

// ---- Show/hide bathroom section based on preset ----
window._updateBathroomSectionVisibility = function() {
    const bathSection = document.getElementById('bathroom-section');
    if (!bathSection) return;
    const isBathroom = (state.presetId === 'bathroom');
    bathSection.style.display = isBathroom ? '' : 'none';

    // Hide "דגם בסיס" + "התקנה" dropdowns — not relevant for bathroom cabinets
    const plinthGrid = document.getElementById('plinth-placement-grid');
    if (plinthGrid) plinthGrid.style.display = isBathroom ? 'none' : '';

    // Hide "חומר גוף" dropdown — bathroom always uses sandwich
    const boardMatRow = document.getElementById('board-mat-row');
    if (boardMatRow) boardMatRow.style.display = isBathroom ? 'none' : '';

    // Hide "יחידת צד" and "יחידה פינתית" sections — not relevant for bathroom cabinets
    const suSection = document.getElementById('side-unit-section');
    if (suSection) suSection.style.display = isBathroom ? 'none' : '';
    const cuSection = document.getElementById('corner-unit-section');
    if (cuSection) cuSection.style.display = isBathroom ? 'none' : '';

    if (isBathroom) _updateBathroomSectionUI();
};

// ---- Show/hide sink panel button based on preset ----
window._updateSinkPanelVisibility = function() {
    const sinkGroup = document.getElementById('qe-sink-panel-group');
    if (!sinkGroup) return;
    const isBathroom = (state.presetId === 'bathroom');
    sinkGroup.style.display = isBathroom ? '' : 'none';
};

// ---- Patch applyPreset ----
(function() {
    const _origApplyPreset = window.applyPreset;
    window.applyPreset = function(presetId) {
        if (typeof _origApplyPreset === 'function') _origApplyPreset(presetId);
        // Highlight bathroom buttons
        const bathroomBtn       = document.getElementById('preset-btn-bathroom');
        const mobileBathroomBtn = document.getElementById('mobile-preset-btn-bathroom');
        if (bathroomBtn)       bathroomBtn.classList.toggle('active', presetId === 'bathroom');
        if (mobileBathroomBtn) mobileBathroomBtn.classList.toggle('active', presetId === 'bathroom');
        window._updateSinkPanelVisibility();
        window._updateBathroomSectionVisibility();
    };
})();

// ---- Patch _restorePresetUI ----
(function() {
    const _origRestore = window._restorePresetUI;
    window._restorePresetUI = function() {
        if (typeof _origRestore === 'function') _origRestore();
        const presetId = state.presetId || 'linear';
        const bathroomBtn       = document.getElementById('preset-btn-bathroom');
        const mobileBathroomBtn = document.getElementById('mobile-preset-btn-bathroom');
        if (bathroomBtn)       bathroomBtn.classList.toggle('active', presetId === 'bathroom');
        if (mobileBathroomBtn) mobileBathroomBtn.classList.toggle('active', presetId === 'bathroom');
        window._updateSinkPanelVisibility();
        window._updateBathroomSectionVisibility();
    };
})();

// ---- Patch syncSidebarToWing ----
(function() {
    const _origSync = window.syncSidebarToWing;
    window.syncSidebarToWing = function() {
        if (typeof _origSync === 'function') _origSync();
        window._updateSinkPanelVisibility();
        window._updateBathroomSectionVisibility();
    };
})();

// ---- Patch updateQuickEditPanelUI ----
(function() {
    const _origQE = window.updateQuickEditPanelUI;
    window.updateQuickEditPanelUI = function() {
        if (typeof _origQE === 'function') _origQE();
        window._updateSinkPanelVisibility();
    };
})();

// ---- Initial call on load ----
document.addEventListener('DOMContentLoaded', function() {
    window._updateSinkPanelVisibility();
    window._updateBathroomSectionVisibility();
});
