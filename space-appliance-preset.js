// ==========================================
// space-appliance-preset.js
// Freestanding electrical appliance as a shared-space unit (gizmo + rotation).
// ==========================================

function _getSAWing() {
    return state && state.wings && state.wings.center ? state.wings.center : null;
}

window._spaceApplianceType = function(wing) {
    const cw = wing || _getSAWing();
    const t = cw && cw.spaceAppliance && cw.spaceAppliance.type;
    return t || 'washer';
};

window._spaceApplianceLabel = function(type) {
    const cat = (window.SPACE_APPLIANCE_CATALOG || []).find(function(c) { return c.id === type; });
    return (cat && cat.label) || type || 'מוצר חשמל';
};

window._applySpaceAppliancePreset = function(type, opts) {
    const cw = _getSAWing();
    if (!cw) return;
    opts = opts || {};
    type = type || 'washer';
    const inch = opts.inch || (window.TV_DEFAULT_INCH || 43);
    const dims = (typeof window._spaceApplianceDims === 'function')
        ? window._spaceApplianceDims(type, { inch: inch })
        : { W: 60, H: 85, D: 60 };

    cw.columns = [];
    cw.hasDoors = false;
    cw.desk = { side: 'none', width: 100, height: 75, hasDrawers: false, drawerHeight: 12, drawerCount: null };
    cw.corner = { side: 'none', width: 60, height: 90, depth: 54, type: 'shelves', shelves: 3, drawerCount: 4 };
    cw.sideCabinet = null;
    cw.plinthHeight = 0;
    cw.cabinetModel = 'c9';
    cw.boardMaterial = 'melamine';
    cw.spaceAppliance = { type: type, inch: type === 'tv' ? inch : undefined };
    cw.activeColorPart = 'materialBody';
    cw.width = Math.round(dims.W * 10) / 10;
    cw.depth = Math.round(dims.D * 10) / 10;
    cw.globalHeight = Math.round(dims.H * 10) / 10;

    if (state) {
        state.width = cw.width;
        state.depth = cw.depth;
        state.globalHeight = cw.globalHeight;
        state.hasDoors = false;
        state.plinthHeight = 0;
        state.presetId = 'space-appliance';
    }

    const _sync = function(ids, val) {
        ids.forEach(function(id) {
            const el = document.getElementById(id);
            if (el) el.value = val;
        });
    };
    _sync(['inp-width', 'inp-num-width', 'dim-pill-width', 'inp-slider-width'], cw.width);
    _sync(['inp-depth', 'inp-num-depth', 'dim-pill-depth', 'inp-slider-depth'], cw.depth);
    _sync(['inp-height', 'inp-num-height', 'dim-pill-height', 'inp-slider-height'], Math.round(cw.globalHeight));
    if (typeof window._syncAllRangeFills === 'function') window._syncAllRangeFills();
    window._updateSpaceApplianceSectionVisibility();
};

window._setSpaceApplianceType = function(type) {
    if (state.presetId !== 'space-appliance') return;
    const cw = _getSAWing();
    if (!cw) return;
    const inch = (cw.spaceAppliance && cw.spaceAppliance.inch) || (window.TV_DEFAULT_INCH || 43);
    window._applySpaceAppliancePreset(type, { inch: inch });
    if (typeof buildCabinet === 'function') buildCabinet();
    if (typeof calculatePrice === 'function') calculatePrice();
    if (typeof saveHistoryState === 'function') saveHistoryState();
};

window._setSpaceApplianceTvInch = function(inch) {
    if (state.presetId !== 'space-appliance') return;
    const cw = _getSAWing();
    if (!cw) return;
    inch = Math.round(parseFloat(inch) || (window.TV_DEFAULT_INCH || 43));
    window._applySpaceAppliancePreset('tv', { inch: inch });
    if (typeof buildCabinet === 'function') buildCabinet();
    if (typeof calculatePrice === 'function') calculatePrice();
    if (typeof saveHistoryState === 'function') saveHistoryState();
};

window._updateSpaceApplianceSectionVisibility = function() {
    const isSA = state.presetId === 'space-appliance';
    const section = document.getElementById('space-appliance-section');
    if (section) section.style.display = isSA ? '' : 'none';

    if (!isSA) return;

    const cw = _getSAWing();
    const type = window._spaceApplianceType();
    const labelEl = document.getElementById('sa-type-label');
    if (labelEl) labelEl.textContent = window._spaceApplianceLabel(type);

    document.querySelectorAll('.sa-type-btn').forEach(function(btn) {
        btn.classList.toggle('active', btn.getAttribute('data-sa-type') === type);
    });

    const tvRow = document.getElementById('sa-tv-size-row');
    if (tvRow) tvRow.style.display = type === 'tv' ? '' : 'none';
    if (type === 'tv') {
        const inch = (cw && cw.spaceAppliance && cw.spaceAppliance.inch) || (window.TV_DEFAULT_INCH || 43);
        const inchLbl = document.getElementById('sa-tv-inch-label');
        if (inchLbl) inchLbl.textContent = inch + '″';
        document.querySelectorAll('.sa-tv-inch-btn').forEach(function(btn) {
            btn.classList.toggle('active', parseInt(btn.getAttribute('data-inch'), 10) === inch);
        });
    }

    // Dim cards stay readable but columns/plinth/units are irrelevant
    const colsCard = document.getElementById('header-columns-card');
    if (colsCard) colsCard.style.display = 'none';
    const plinthCard = document.querySelector('#header-dims-row .header-dim-card[data-dim="plinth"]');
    if (plinthCard) plinthCard.style.display = 'none';
    const plinthGrid = document.getElementById('plinth-placement-grid');
    if (plinthGrid) plinthGrid.style.display = 'none';
    const unitsSection = document.getElementById('units-content-section');
    if (unitsSection) unitsSection.style.display = 'none';
    const suSection = document.getElementById('side-unit-section');
    if (suSection) suSection.style.display = 'none';
    const cuSection = document.getElementById('corner-unit-section');
    if (cuSection) cuSection.style.display = 'none';
    const wdSection = document.getElementById('writing-desk-section');
    if (wdSection) wdSection.style.display = 'none';
    const fsSection = document.getElementById('floating-shelf-section');
    if (fsSection) fsSection.style.display = 'none';
};

/** Popup: pick which freestanding appliance to add into the shared space. */
window._askSpaceApplianceType = function() {
    const old = document.getElementById('_space-appliance-popup');
    if (old) old.remove();
    const catalog = window.SPACE_APPLIANCE_CATALOG || [];
    if (!catalog.length) {
        if (typeof _showToast === 'function') _showToast('אין מוצרי חשמל זמינים', 2500);
        return;
    }
    const popup = document.createElement('div');
    popup.id = '_space-appliance-popup';
    popup.className = 'corner-side-popup';
    const btns = catalog.map(function(c) {
        return '<button type="button" data-sa-type="' + c.id + '">' +
            '<i class="' + (c.icon || 'fa-solid fa-plug') + '"></i> ' + c.label +
            '</button>';
    }).join('');
    popup.innerHTML =
        '<div class="corner-side-popup-title">הוספת מוצר חשמל למרחב</div>' +
        '<div class="corner-side-popup-btns sa-picker-btns">' + btns + '</div>' +
        '<button type="button" class="corner-side-popup-cancel">ביטול</button>';
    document.body.appendChild(popup);
    const close = function() {
        popup.remove();
        document.removeEventListener('mousedown', outside, true);
    };
    const outside = function(e) { if (!popup.contains(e.target)) close(); };
    popup.querySelectorAll('button[data-sa-type]').forEach(function(b) {
        b.addEventListener('click', function() {
            const type = b.getAttribute('data-sa-type');
            close();
            if (typeof window.addSpaceUnit === 'function') {
                window.addSpaceUnit('spaceAppliance', { applianceType: type });
            }
        });
    });
    popup.querySelector('.corner-side-popup-cancel').addEventListener('click', close);
    setTimeout(function() { document.addEventListener('mousedown', outside, true); }, 0);
};

(function() {
    const _origApplyPreset = window.applyPreset;
    window.applyPreset = function(presetId) {
        if (typeof _origApplyPreset === 'function') _origApplyPreset(presetId);
        window._updateSpaceApplianceSectionVisibility();
    };
})();

(function() {
    const _origRestore = window._restorePresetUI;
    window._restorePresetUI = function() {
        if (typeof _origRestore === 'function') _origRestore();
        window._updateSpaceApplianceSectionVisibility();
    };
})();

(function() {
    const _origSync = window.syncSidebarToWing;
    window.syncSidebarToWing = function() {
        if (typeof _origSync === 'function') _origSync();
        window._updateSpaceApplianceSectionVisibility();
    };
})();

document.addEventListener('DOMContentLoaded', function() {
    window._updateSpaceApplianceSectionVisibility();
});
