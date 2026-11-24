// ==========================================
// floating-shelf-preset.js
// Standalone floating shelf board as a space unit.
// Dimensions: אורך (width), רוחב (depth), עובי (mm → globalHeight cm).
// ==========================================

const FS_DEFAULT_LENGTH_CM = 80;
const FS_DEFAULT_WIDTH_CM = 30;
const FS_DEFAULT_THICK_MM = 17;
const FS_MIN_THICK_MM = 10;
const FS_MAX_THICK_MM = 40;

function _getFSWing() {
    return state && state.wings && state.wings.center ? state.wings.center : null;
}

window._fsThicknessMm = function(wing) {
    const cw = wing || _getFSWing();
    if (cw && cw.floatingShelf && cw.floatingShelf.thicknessMm != null) {
        return Math.round(cw.floatingShelf.thicknessMm);
    }
    const hCm = (cw && cw.globalHeight) || (state && state.globalHeight) || (FS_DEFAULT_THICK_MM / 10);
    const fromH = Math.round(hCm * 10);
    if (fromH >= FS_MIN_THICK_MM && fromH <= FS_MAX_THICK_MM) return fromH;
    return FS_DEFAULT_THICK_MM;
};

window._fsThicknessCm = function(wing) {
    return window._fsThicknessMm(wing) / 10;
};

function _syncFSThickInputs(mm) {
    const cm = Math.round(mm) / 10;
    ['inp-height', 'inp-num-height', 'ep-inp-height', 'ep-inp-num-height',
     'dim-pill-height', 'inp-slider-height'].forEach(function(id) {
        const el = document.getElementById(id);
        if (!el) return;
        // Height card shows mm while floating-shelf is active
        el.value = Math.round(mm);
    });
    const lbl = document.getElementById('val-height');
    if (lbl) lbl.innerText = Math.round(mm);
    // Keep internal state in cm
    if (state) state.globalHeight = cm;
    const cw = _getFSWing();
    if (cw) {
        cw.globalHeight = cm;
        if (!cw.floatingShelf) cw.floatingShelf = {};
        cw.floatingShelf.thicknessMm = Math.round(mm);
        (cw.columns || []).forEach(function(col) {
            if (col) col.height = cm;
        });
    }
}

function _fsSyncDimIds(ids, val) {
    ids.forEach(function(id) {
        const el = document.getElementById(id);
        if (el) el.value = val;
    });
}

window._applyFloatingShelfPreset = function(host) {
    const cw = _getFSWing();
    if (!cw) return;

    const thickMm = FS_DEFAULT_THICK_MM;
    const thickCm = thickMm / 10;
    const lengthCm = (host && host.width > 20) ? Math.min(120, Math.round(host.width * 0.5)) : FS_DEFAULT_LENGTH_CM;
    const depthCm = (host && host.depth > 10) ? Math.min(60, Math.round(host.depth * 0.55)) : FS_DEFAULT_WIDTH_CM;

    cw.columns = [{
        type: 'normal',
        width: Math.max(1, lengthCm - (cw.thickness || 1.7) * 2),
        height: thickCm,
        shelves: 0,
        splitY: null,
        shelvesY: [],
        compartments: [],
        doors: [],
        floorOffset: 0,
        noPlinth: true,
        spaceBottomPanel: false
    }];
    cw.hasDoors = false;
    cw.desk = { side: 'none', width: 100, height: 75, hasDrawers: false, drawerHeight: 12, drawerCount: null };
    cw.corner = { side: 'none', width: 60, height: 90, depth: 54, type: 'shelves', shelves: 3, drawerCount: 4 };
    cw.sideCabinet = null;
    cw.plinthHeight = 0;
    cw.cabinetModel = 'c9';
    cw.boardMaterial = 'melamine';
    cw.floatingShelf = { thicknessMm: thickMm };
    cw.activeColorPart = 'materialBody';
    cw.width = lengthCm;
    cw.depth = depthCm;
    cw.globalHeight = thickCm;

    if (state) {
        state.width = lengthCm;
        state.depth = depthCm;
        state.globalHeight = thickCm;
        state.hasDoors = false;
        state.plinthHeight = 0;
    }

    _fsSyncDimIds(['inp-width', 'inp-num-width', 'dim-pill-width', 'inp-slider-width'], lengthCm);
    _fsSyncDimIds(['inp-depth', 'inp-num-depth', 'dim-pill-depth', 'inp-slider-depth'], depthCm);
    _syncFSThickInputs(thickMm);
    if (typeof window._syncAllRangeFills === 'function') window._syncAllRangeFills();
    window._updateFloatingShelfSectionVisibility();
};

window._setFloatingShelfThicknessMm = function(mm) {
    if (state.presetId !== 'floating-shelf') return;
    mm = Math.max(FS_MIN_THICK_MM, Math.min(FS_MAX_THICK_MM, Math.round(parseFloat(mm) || FS_DEFAULT_THICK_MM)));
    _syncFSThickInputs(mm);
    window._updateFloatingShelfSectionVisibility();
    if (typeof buildCabinet === 'function') buildCabinet();
    if (typeof calculatePrice === 'function') calculatePrice();
    if (typeof saveHistoryState === 'function') saveHistoryState();
};

window._updateFloatingShelfSectionVisibility = function() {
    const isFS = state.presetId === 'floating-shelf';
    const section = document.getElementById('floating-shelf-section');
    if (section) section.style.display = isFS ? '' : 'none';

    const plinthGrid = document.getElementById('plinth-placement-grid');
    if (plinthGrid && isFS) plinthGrid.style.display = 'none';

    const boardMatRow = document.getElementById('board-mat-row');
    if (boardMatRow && isFS) boardMatRow.style.display = 'none';

    const suSection = document.getElementById('side-unit-section');
    if (suSection && isFS) suSection.style.display = 'none';

    const cuSection = document.getElementById('corner-unit-section');
    if (cuSection && isFS) cuSection.style.display = 'none';

    const wdSection = document.getElementById('writing-desk-section');
    if (wdSection && isFS) wdSection.style.display = 'none';

    const unitsSection = document.getElementById('units-content-section');
    if (unitsSection && isFS) unitsSection.style.display = 'none';

    const colsCard = document.getElementById('header-columns-card');
    if (colsCard) colsCard.style.display = isFS ? 'none' : '';

    const plinthCard = document.querySelector('#header-dims-row .header-dim-card[data-dim="plinth"]');
    if (plinthCard) plinthCard.style.display = isFS ? 'none' : '';

    const widthLabel = document.querySelector('label[for="dim-pill-width"]');
    const heightLabel = document.querySelector('label[for="dim-pill-height"]');
    const depthLabel = document.querySelector('label[for="dim-pill-depth"]');
    const widthHsr = document.querySelector('#header-dims-row .header-dim-card[data-dim="width"] .hsr-title');
    const heightHsr = document.querySelector('#header-dims-row .header-dim-card[data-dim="height"] .hsr-title');
    const depthHsr = document.querySelector('#header-dims-row .header-dim-card[data-dim="depth"] .hsr-title');
    const heightUnit = document.querySelector('#header-dims-row .header-dim-card[data-dim="height"] .header-dim-val > span');

    if (isFS) {
        if (widthLabel) widthLabel.textContent = 'אורך';
        if (widthHsr) widthHsr.textContent = 'אורך';
        if (depthLabel) depthLabel.textContent = 'רוחב';
        if (depthHsr) depthHsr.textContent = 'רוחב';
        if (heightLabel) heightLabel.textContent = 'עובי';
        if (heightHsr) heightHsr.textContent = 'עובי';
        if (heightUnit) heightUnit.textContent = 'מ"מ';

        const ph = document.getElementById('dim-pill-height');
        const sh = document.getElementById('inp-height');
        if (ph) { ph.min = FS_MIN_THICK_MM; ph.max = FS_MAX_THICK_MM; ph.step = 1; }
        if (sh) { sh.min = FS_MIN_THICK_MM; sh.max = FS_MAX_THICK_MM; sh.step = 1; }

        const mm = window._fsThicknessMm();
        _syncFSThickInputs(mm);

        document.querySelectorAll('.fs-thick-preset').forEach(function(btn) {
            const v = parseInt(btn.getAttribute('data-mm'), 10);
            btn.classList.toggle('active', v === mm);
        });
        const thickLbl = document.getElementById('fs-thick-label');
        if (thickLbl) thickLbl.textContent = mm + ' מ"מ';
    } else {
        if (widthLabel) widthLabel.textContent = 'רוחב';
        if (widthHsr) widthHsr.textContent = 'רוחב';
        if (depthLabel) depthLabel.textContent = 'עומק';
        if (depthHsr) depthHsr.textContent = 'עומק';
        if (heightLabel && state.presetId !== 'writing-desk') heightLabel.textContent = 'גובה';
        if (heightHsr && state.presetId !== 'writing-desk') heightHsr.textContent = 'גובה';
        if (heightUnit) heightUnit.textContent = 'ס"מ';

        const ph = document.getElementById('dim-pill-height');
        const sh = document.getElementById('inp-height');
        if (ph) { ph.min = 40; ph.max = (window.MAX_GLOBAL_HEIGHT || 370); ph.step = 1; }
        if (sh) { sh.min = 40; sh.max = (window.MAX_GLOBAL_HEIGHT || 370); sh.step = 1; }
    }
};

(function() {
    const _origApplyPreset = window.applyPreset;
    window.applyPreset = function(presetId) {
        if (typeof _origApplyPreset === 'function') _origApplyPreset(presetId);
        window._updateFloatingShelfSectionVisibility();
    };
})();

(function() {
    const _origRestore = window._restorePresetUI;
    window._restorePresetUI = function() {
        if (typeof _origRestore === 'function') _origRestore();
        window._updateFloatingShelfSectionVisibility();
    };
})();

(function() {
    const _origSync = window.syncSidebarToWing;
    window.syncSidebarToWing = function() {
        if (typeof _origSync === 'function') _origSync();
        window._updateFloatingShelfSectionVisibility();
    };
})();

(function() {
    const _origUpdateDim = window.updateDim;
    window.updateDim = function(dim, delta, absoluteValue) {
        if (state.presetId !== 'floating-shelf') {
            if (typeof _origUpdateDim === 'function') _origUpdateDim(dim, delta, absoluteValue);
            return;
        }

        const cw = _getFSWing();
        if (!cw) return;
        if (!cw.floatingShelf) cw.floatingShelf = { thicknessMm: FS_DEFAULT_THICK_MM };

        let val;
        if (absoluteValue !== null && absoluteValue !== undefined) {
            val = parseFloat(absoluteValue);
        } else if (dim === 'width') {
            val = state.width + delta;
        } else if (dim === 'height') {
            val = window._fsThicknessMm(cw) + delta;
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
            val = Math.max(10, Math.min(_maxW, Math.round(val)));
            state.width = val;
            cw.width = val;
            if (cw.columns && cw.columns[0]) {
                cw.columns[0].width = Math.max(1, val - (cw.thickness || 1.7) * 2);
            }
            _fsSyncDimIds(['inp-width', 'inp-num-width', 'dim-pill-width', 'inp-slider-width'], val);
        } else if (dim === 'height') {
            val = Math.max(FS_MIN_THICK_MM, Math.min(FS_MAX_THICK_MM, Math.round(val)));
            _syncFSThickInputs(val);
            window._updateFloatingShelfSectionVisibility();
        } else if (dim === 'depth') {
            val = Math.max(8, Math.min(110, Math.round(val)));
            state.depth = val;
            cw.depth = val;
            _fsSyncDimIds(['inp-depth', 'inp-num-depth', 'dim-pill-depth', 'inp-slider-depth'], val);
        }

        if (typeof window._syncAllRangeFills === 'function') window._syncAllRangeFills();
        if (typeof buildCabinet === 'function') buildCabinet();
        else if (typeof buildCabinetDebounced === 'function') buildCabinetDebounced();
        if (typeof updateCameraView === 'function') updateCameraView();
        if (typeof calculatePrice === 'function') calculatePrice();
    };
})();

document.addEventListener('DOMContentLoaded', function() {
    window._updateFloatingShelfSectionVisibility();
});
