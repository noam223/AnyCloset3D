// ==========================================
// kitchen-preset.js
// Base kitchen run preset (admin-only UI).
// Loaded after state.js in index.html.
// ==========================================

const KIT_WIDTH  = 200;
const KIT_HEIGHT = 88;
const KIT_DEPTH  = 56;
const KIT_UNIT_W = 60;
const KIT_PLINTH = 10; // c9-ish

/**
 * Leading stone / porcelain / quartz countertop brands commonly sold in Israel (UI examples only).
 * colorHex = soft preview tint for the worktop mesh (not a real material library).
 */
window.KITCHEN_COUNTERTOP_BRANDS = [
    { id: 'caesarstone', label: 'אבן קיסר', kind: 'קוורץ', colorHex: 0xe8e6e1 },
    { id: 'silestone', label: 'Silestone', kind: 'קוורץ', colorHex: 0xf2efe8 },
    { id: 'dekton', label: 'Dekton', kind: 'פורצלן', colorHex: 0xc8cbcf },
    { id: 'neolith', label: 'Neolith', kind: 'פורצלן', colorHex: 0xf5f5f3 },
    { id: 'laminam', label: 'Laminam', kind: 'פורצלן', colorHex: 0xebe4d8 },
    { id: 'infinity', label: 'Infinity', kind: 'פורצלן', colorHex: 0xdde1e5 },
    { id: 'sensa', label: 'Sensa', kind: 'שיש טבעי', colorHex: 0xd4c4a8 },
    { id: 'corian', label: 'Corian', kind: 'אקריל', colorHex: 0xf7f7f5 },
    { id: 'compac', label: 'Compac', kind: 'קוורץ', colorHex: 0xefe8dc },
    { id: 'technistone', label: 'Technistone', kind: 'קוורץ', colorHex: 0xd5d2cc }
];
// Back-compat alias if anything still reads the old name
window.KITCHEN_BRAND_EXAMPLES = window.KITCHEN_COUNTERTOP_BRANDS;

function _getKitWing() {
    return state && state.wings && state.wings.center ? state.wings.center : null;
}

function _applyKitDim(dim, value) {
    if (typeof updateDim === 'function') {
        updateDim(dim, null, value);
        return;
    }
    const cw = _getKitWing();
    if (!cw) return;
    if (dim === 'width') cw.width = value;
    if (dim === 'height') cw.globalHeight = value;
    if (dim === 'depth') cw.depth = value;
}

function _kitThickness() {
    const cw = _getKitWing();
    return (cw && cw.thickness) || (state && state.thickness) || 1.7;
}

function _kitInitColumns() {
    const cw = _getKitWing();
    if (!cw || typeof distributeColumns !== 'function') return;
    // ~3 units into 200cm run
    distributeColumns(3);
    if (cw.columns) {
        cw.columns.forEach(col => {
            col.topPanel = true;
            col.sinkPanel = false;
            col.noPlinth = false;
            col.floorOffset = 0;
        });
    }
}

window._isKitchenPreset = function() {
    return !!(state && state.presetId === 'kitchen');
};

window._applyKitchenPreset = function() {
    if (!window._kitchenAdminUnlocked) {
        if (typeof _showToast === 'function') _showToast('Preset מטבח זמין רק למנהל מערכת', 3500);
        if (state) state.presetId = 'linear';
        return;
    }
    const cw = _getKitWing();
    if (!cw) return;

    cw.cabinetModel = 'c9';
    cw.cabinetTypeId = 'c9';
    cw.plinthHeight = KIT_PLINTH;
    cw.boardMaterial = 'sandwich';
    cw.slidingDoor = cw.slidingDoor || {};
    cw.slidingDoor.enabled = false;

    const plinthSel = document.getElementById('inp-plinth');
    if (plinthSel) {
        plinthSel.value = typeof window.cabinetTypeSelectValue === 'function'
            ? window.cabinetTypeSelectValue('c9')
            : 'c9';
    }
    const boardSel = document.getElementById('inp-board-mat');
    if (boardSel) {
        boardSel.value = 'sandwich';
        boardSel.disabled = true;
    }
    const mobileBoard = document.getElementById('mobile-inp-board-mat');
    if (mobileBoard) {
        mobileBoard.value = 'sandwich';
        mobileBoard.disabled = true;
    }

    _applyKitDim('width', KIT_WIDTH);
    _applyKitDim('depth', KIT_DEPTH);
    _applyKitDim('height', KIT_HEIGHT);
    _kitInitColumns();
    _applyKitchenRoomView();
    _updateKitchenSectionUI();
    if (typeof window._syncKitchenApplianceToolbar === 'function') {
        window._syncKitchenApplianceToolbar();
    }
};

/** Kitchen room scenery: hide bedroom furniture. Do not change floor — kitchens may use parquet or tile. */
function _applyKitchenRoomView() {
    if (!window._kitchenRoomSnapshot) {
        window._kitchenRoomSnapshot = {
            bedVisible: window._bedVisible !== false,
            chairVisible: window._chairVisible !== false
        };
    }
    window._bedVisible = false;
    window._chairVisible = false;
    if (typeof window._updateRoomPropsUI === 'function') window._updateRoomPropsUI();
    _syncKitchenRoomFurnitureUI();
    if (typeof _buildRoom === 'function' && window._roomVisible) _buildRoom();
    else if (typeof buildCabinet === 'function') buildCabinet();
}

function _leaveKitchenRoomView() {
    const snap = window._kitchenRoomSnapshot;
    if (!snap) return;
    window._kitchenRoomSnapshot = null;
    window._bedVisible = snap.bedVisible !== false;
    window._chairVisible = snap.chairVisible !== false;
    if (typeof window._updateRoomPropsUI === 'function') window._updateRoomPropsUI();
    _syncKitchenRoomFurnitureUI();
    if (typeof _buildRoom === 'function' && window._roomVisible) _buildRoom();
    else if (typeof buildCabinet === 'function') buildCabinet();
}

function _syncKitchenRoomFurnitureUI() {
    const isKit = window._isKitchenPreset && window._isKitchenPreset();
    ['room-btn-toggle-bed', 'room-btn-toggle-chair', 'bed-handles', 'room-props-row'].forEach(function(id) {
        const el = document.getElementById(id);
        if (!el) return;
        if (id === 'room-props-row') {
            // room-props-row also depends on room visibility — only force-hide in kitchen
            if (isKit) el.style.display = 'none';
            return;
        }
        el.style.display = isKit ? 'none' : '';
    });
}

window._applyKitchenRoomView = _applyKitchenRoomView;
window._leaveKitchenRoomView = _leaveKitchenRoomView;

window._kitchenAddUnit = function(side) {
    if (!window._isKitchenPreset()) return;
    const cw = _getKitWing();
    if (!cw) return;
    side = side === 'left' ? 'left' : 'right';
    const cols = cw.columns || state.columns || [];
    if (!cols.length) {
        if (typeof distributeColumns === 'function') distributeColumns(1);
    }
    const liveCols = cw.columns || state.columns || [];
    const template = side === 'left' ? liveCols[0] : liveCols[liveCols.length - 1];
    const t = _kitThickness();
    const newCol = typeof _blankColumn === 'function'
        ? _blankColumn(KIT_UNIT_W, template)
        : {
            type: 'normal', width: KIT_UNIT_W, height: cw.globalHeight || KIT_HEIGHT,
            shelves: 0, splitY: null, shelvesY: [], compartments: [], doors: [],
            floorOffset: 0, topPanel: true, sinkPanel: false, noPlinth: false
        };
    newCol.width = KIT_UNIT_W;
    newCol.topPanel = true;
    newCol.sinkPanel = !!newCol.sinkPanel;
    newCol.height = cw.globalHeight || KIT_HEIGHT;

    cw.columns = side === 'left' ? [newCol].concat(liveCols) : liveCols.concat([newCol]);
    state.columns = cw.columns;
    const newW = (cw.width || KIT_WIDTH) + KIT_UNIT_W + t;
    _applyKitDim('width', Math.round(newW * 10) / 10);

    if (typeof _fixEdgeColumnMerges === 'function') _fixEdgeColumnMerges();
    if (typeof _syncColumnCountInputs === 'function') _syncColumnCountInputs(cw.columns.length);
    _updateKitchenSectionUI();
    if (typeof buildCabinet === 'function') buildCabinet();
    if (typeof calculatePrice === 'function') calculatePrice();
    if (typeof saveHistoryState === 'function') saveHistoryState();
};

window._kitchenRemoveUnit = function(side) {
    if (!window._isKitchenPreset()) return;
    const cw = _getKitWing();
    if (!cw || !cw.columns || cw.columns.length <= 1) {
        if (typeof _showToast === 'function') _showToast('חייבת להישאר לפחות יחידה אחת', 3000);
        return;
    }
    side = side === 'left' ? 'left' : 'right';
    const removed = side === 'left' ? cw.columns[0] : cw.columns[cw.columns.length - 1];
    const remW = (removed && removed.width) || KIT_UNIT_W;
    const t = _kitThickness();
    cw.columns = side === 'left' ? cw.columns.slice(1) : cw.columns.slice(0, -1);
    state.columns = cw.columns;
    const newW = Math.max(KIT_UNIT_W + 2 * t, (cw.width || KIT_WIDTH) - remW - t);
    _applyKitDim('width', Math.round(newW * 10) / 10);
    if (typeof _fixEdgeColumnMerges === 'function') _fixEdgeColumnMerges();
    if (typeof _syncColumnCountInputs === 'function') _syncColumnCountInputs(cw.columns.length);
    _updateKitchenSectionUI();
    if (typeof buildCabinet === 'function') buildCabinet();
    if (typeof calculatePrice === 'function') calculatePrice();
    if (typeof saveHistoryState === 'function') saveHistoryState();
};

function _updateKitchenSectionUI() {
    const isKit = window._isKitchenPreset();
    const section = document.getElementById('kitchen-section');
    if (section) section.style.display = isKit ? '' : 'none';

    const bathSection = document.getElementById('bathroom-section');
    if (isKit && bathSection) bathSection.style.display = 'none';

    const boardSel = document.getElementById('inp-board-mat');
    if (boardSel) {
        if (isKit) {
            boardSel.value = 'sandwich';
            boardSel.disabled = true;
        } else if (state && state.presetId !== 'bathroom') {
            boardSel.disabled = false;
        }
    }
    const mobileBoard = document.getElementById('mobile-inp-board-mat');
    if (mobileBoard) {
        if (isKit) {
            mobileBoard.value = 'sandwich';
            mobileBoard.disabled = true;
        } else if (state && state.presetId !== 'bathroom') {
            mobileBoard.disabled = false;
        }
    }

    const boardMatRow = document.getElementById('board-mat-row');
    if (boardMatRow) {
        const hideBoard = isKit || (state && state.presetId === 'bathroom');
        boardMatRow.style.display = hideBoard ? 'none' : '';
    }
    const plinthGrid = document.getElementById('plinth-placement-grid');
    if (plinthGrid && isKit) plinthGrid.style.display = 'none';
    else if (plinthGrid && state && state.presetId !== 'bathroom' && state.presetId !== 'writing-desk') {
        plinthGrid.style.display = '';
    }

    const suSection = document.getElementById('side-unit-section');
    if (suSection && isKit) suSection.style.display = 'none';
    const cuSection = document.getElementById('corner-unit-section');
    if (cuSection && isKit) cuSection.style.display = 'none';

    // Hide equal-column redistribute controls; kitchen uses +60 add-unit buttons
    const headerCols = document.getElementById('header-columns-card');
    if (headerCols) headerCols.style.display = isKit ? 'none' : '';
    const mobileCols = document.getElementById('mobile-columns-block');
    if (mobileCols) mobileCols.style.display = isKit ? 'none' : '';
    const mobileKit = document.getElementById('mobile-kitchen-block');
    if (mobileKit) mobileKit.style.display = isKit ? '' : 'none';

    const countEl = document.getElementById('kitchen-unit-count');
    const cw = _getKitWing();
    if (countEl && cw && cw.columns) countEl.textContent = String(cw.columns.length);

    // Soft height clamp for base cabinets
    if (isKit && cw) {
        const h = cw.globalHeight || state.height;
        if (h != null && (h < 80 || h > 95)) {
            _applyKitDim('height', Math.max(80, Math.min(95, h)));
        }
    }

    if (typeof window._syncKitchenApplianceToolbar === 'function') {
        window._syncKitchenApplianceToolbar();
    }
    _renderKitchenBrandExamples();
    if (isKit) {
        // Keep bedroom furniture hidden; never force a floor kind
        if (window._bedVisible !== false || window._chairVisible !== false) {
            _applyKitchenRoomView();
        } else {
            _syncKitchenRoomFurnitureUI();
        }
    } else {
        _syncKitchenRoomFurnitureUI();
    }
}

function _kitCountertopBrandId() {
    const cw = _getKitWing();
    return (cw && cw.countertopBrand) || (state && state.countertopBrand) || '';
}

function _renderKitchenBrandExamples() {
    const host = document.getElementById('kitchen-brand-examples');
    if (!host) return;
    const brands = window.KITCHEN_COUNTERTOP_BRANDS || [];
    // Rebuild when switching from appliance brands → countertop brands
    if (host.dataset.ready !== 'countertop-v1') {
        host.innerHTML = brands.map(b =>
            '<button type="button" class="kit-brand-chip" data-brand="' + b.id + '" ' +
            'onclick="window._setKitchenCountertopBrand(\'' + b.id + '\')" ' +
            'title="' + (b.kind || 'משטח') + ' — להמחשה בלבד" ' +
            'style="padding:5px 9px;border-radius:999px;border:1.5px solid var(--border);background:var(--bg-light);' +
            'color:var(--text-dark);font-size:0.72rem;font-weight:700;cursor:pointer;font-family:inherit;display:inline-flex;align-items:center;gap:5px;">' +
            '<span style="width:10px;height:10px;border-radius:50%;background:#' +
            (b.colorHex != null ? b.colorHex.toString(16).padStart(6, '0') : 'ddd') +
            ';border:1px solid rgba(0,0,0,0.12);flex-shrink:0;"></span>' +
            b.label + '</button>'
        ).join('');
        host.dataset.ready = 'countertop-v1';
    }
    const current = _kitCountertopBrandId();
    host.querySelectorAll('.kit-brand-chip').forEach(btn => {
        const on = btn.dataset.brand === current;
        btn.classList.toggle('active', on);
        btn.style.borderColor = on ? 'var(--accent)' : 'var(--border)';
        btn.style.background = on ? 'rgba(99,102,241,0.12)' : 'var(--bg-light)';
        btn.style.color = on ? 'var(--accent)' : 'var(--text-dark)';
    });
}

window._setKitchenCountertopBrand = function(brandId) {
    if (!window._isKitchenPreset()) return;
    const brands = window.KITCHEN_COUNTERTOP_BRANDS || [];
    const hit = brands.find(b => b.id === brandId);
    if (!hit) return;
    const cw = _getKitWing();
    if (!cw) return;
    if (cw.countertopBrand === brandId) {
        delete cw.countertopBrand;
        if (state) delete state.countertopBrand;
    } else {
        cw.countertopBrand = brandId;
        if (state) state.countertopBrand = brandId;
    }
    _renderKitchenBrandExamples();
    if (typeof buildCabinet === 'function') buildCabinet();
    if (typeof saveHistoryState === 'function') saveHistoryState();
};

window._kitchenCountertopBrand = function() {
    const id = _kitCountertopBrandId();
    return (window.KITCHEN_COUNTERTOP_BRANDS || []).find(b => b.id === id) || null;
};

window._kitchenBrandLabel = function(brandId) {
    const hit = (window.KITCHEN_COUNTERTOP_BRANDS || []).find(b => b.id === brandId);
    return hit ? hit.label : '';
};

/** Preview material for kitchen worktop when a countertop brand example is selected. */
window._kitchenCountertopMaterial = function(fallbackMat) {
    const brand = window._kitchenCountertopBrand && window._kitchenCountertopBrand();
    if (!brand || typeof THREE === 'undefined') return fallbackMat;
    if (!window._kitCtMatCache) window._kitCtMatCache = {};
    const key = brand.id + '-' + brand.colorHex;
    if (!window._kitCtMatCache[key]) {
        window._kitCtMatCache[key] = new THREE.MeshStandardMaterial({
            color: brand.colorHex,
            roughness: 0.42,
            metalness: 0.04,
            envMap: window._studioEnvMap || null
        });
    }
    return window._kitCtMatCache[key];
};

// Kitchen mode: grow/shrink width instead of equal redistribute
(function() {
    const _origUpdateColumns = window.updateColumns;
    window.updateColumns = function(delta) {
        if (window._isKitchenPreset && window._isKitchenPreset()) {
            if (delta > 0) window._kitchenAddUnit('right');
            else if (delta < 0) window._kitchenRemoveUnit('right');
            return;
        }
        if (typeof _origUpdateColumns === 'function') return _origUpdateColumns(delta);
    };
})();

window._updateKitchenSectionUI = _updateKitchenSectionUI;
window._renderKitchenBrandExamples = _renderKitchenBrandExamples;

window._setKitchenPresetButtonsVisible = function(visible) {
    ['preset-btn-kitchen', 'mobile-preset-btn-kitchen'].forEach(function(id) {
        const el = document.getElementById(id);
        if (el) el.style.display = visible ? '' : 'none';
    });
};

window._initKitchenAdminGate = async function() {
    let ok = false;
    try {
        if (window.Auth && typeof Auth.isAppAdmin === 'function') {
            ok = !!(await Auth.isAppAdmin());
        }
    } catch (e) {
        ok = false;
    }
    window._kitchenAdminUnlocked = ok;
    window._setKitchenPresetButtonsVisible(ok);
    // If a non-admin somehow has kitchen loaded, fall back to linear
    if (!ok && state && state.presetId === 'kitchen' && typeof window.applyPreset === 'function') {
        window.applyPreset('linear');
    }
};

// Hook applyPreset — admin guard + UI sync
(function() {
    const _origApplyPreset = window.applyPreset;
    window.applyPreset = function(presetId) {
        if (presetId === 'kitchen' && !window._kitchenAdminUnlocked) {
            if (typeof _showToast === 'function') _showToast('Preset מטבח זמין רק למנהל מערכת', 3500);
            return;
        }
        const wasKitchen = !!(state && state.presetId === 'kitchen');
        if (typeof _origApplyPreset === 'function') _origApplyPreset(presetId);
        if (wasKitchen && presetId !== 'kitchen') _leaveKitchenRoomView();
        const kitBtn = document.getElementById('preset-btn-kitchen');
        const mobileKit = document.getElementById('mobile-preset-btn-kitchen');
        if (kitBtn) kitBtn.classList.toggle('active', presetId === 'kitchen');
        if (mobileKit) mobileKit.classList.toggle('active', presetId === 'kitchen');
        _updateKitchenSectionUI();
    };
})();

// Hook restore
(function() {
    const _origRestore = window._restorePresetUI;
    window._restorePresetUI = function() {
        if (typeof _origRestore === 'function') _origRestore();
        // Non-admins must not keep a kitchen run loaded from a saved project
        if (state && state.presetId === 'kitchen' && !window._kitchenAdminUnlocked) {
            if (typeof window.applyPreset === 'function') {
                window.applyPreset('linear');
                return;
            }
        }
        _updateKitchenSectionUI();
        const kitBtn = document.getElementById('preset-btn-kitchen');
        const mobileKit = document.getElementById('mobile-preset-btn-kitchen');
        if (kitBtn) kitBtn.classList.toggle('active', !!(state && state.presetId === 'kitchen'));
        if (mobileKit) mobileKit.classList.toggle('active', !!(state && state.presetId === 'kitchen'));
    };
})();

(function() {
    const _origSync = window.syncSidebarToWing;
    window.syncSidebarToWing = function() {
        if (typeof _origSync === 'function') _origSync();
        _updateKitchenSectionUI();
    };
})();

document.addEventListener('DOMContentLoaded', function() {
    window._setKitchenPresetButtonsVisible(false);
    if (window._initKitchenAdminGate) window._initKitchenAdminGate();
});
