// ==========================================
// 1. ניהול מצב (State), היסטוריה, תמחור ראשי
// ==========================================
const MAX_COL_WIDTH = 120;
const MIN_COL_WIDTH = 1;
const MIN_WARDROBE_WIDTH = 10;
window.MIN_WARDROBE_WIDTH = MIN_WARDROBE_WIDTH;
const MIN_SHELF_GAP = 12;
const MAX_GLOBAL_HEIGHT = 370;
window.MAX_GLOBAL_HEIGHT = MAX_GLOBAL_HEIGHT;
const MAX_COLUMNS = 10;
window.MAX_COLUMNS = MAX_COLUMNS;

// ---- Wing factory ----
function createWingData(overrides) {
    const base = {
        cabinetModel: 'c9',
        placement: 'wall',
        width: 160, globalHeight: 240, depth: 54,
        thickness: 1.7,
        plinthHeight: 8.75,
        hasDoors: true,
        handleType: '',
        handleStyle: 'pipe',
        cabinetName: '',
        cabinetNotes: '',
        boardMaterial: 'melamine',
        materialBody: 'white_matte',
        materialInternal: 'white_matte',
        materialExternal: 'white_matte',
        materialDesk: 'white_matte',
        materialOpenCell: 'white_matte',
        materialBack: 'white_matte',
        materialSideCabinet: 'white_matte',
        materialTopPanel: 'white_matte',
        activeColorPart: 'materialBody',
        columns: [],
        wingPosition: 'side',
        desk: { side: 'none', width: 100, height: 80, hasDrawers: true, drawerHeight: 12, drawerCount: null },
        writingDesk: { height: 75, hasDrawers: true, drawerCount: 2, drawerHeight: 12 },
        corner: { side: 'none', width: 60, height: 90, depth: 54, type: 'shelves', shelves: 3, drawerCount: 4 },
        fullCorner: { size: 100, shelves: 2, shelvesY: [], compartments: [] },
        sideCabinet: null,
        manualPrice: null,
        // ---- Bathroom cabinet data (enabled only when presetId === 'bathroom') ----
        bathroomStyle: 'standing',    // 'standing' | 'hanging'
        countertopType: 'integral',   // 'integral' | 'butcher26' | 'butcher40' | 'corian12'
        doorGrooveStyle: 'plain',     // 'plain' | 'h_grooves' | 'v_grooves' | 'waves'
        vesselSinkOffsetX: 0,         // cm offset from column center (for vessel sink drag)
        // ---- Sliding wardrobe data (enabled only when presetId === 'sliding') ----
        slidingDoor: {
            enabled: false,
            profileColor: 'nickel',   // 'black' | 'cream' | 'white' | 'nickel' | 'gold_matte'
            doorPanelType: 'solid',   // 'solid' | 'glass' | 'mirror' — global fallback
            doorPanels: [],           // per-door panel type: ['solid','glass','mirror',...] indexed by door number
            numDoors: 2,              // auto-calculated, can be overridden
            manualNumDoors: false     // true when user has manually set numDoors
        }
    };
    return Object.assign(base, overrides || {});
}

// ---- Helper: auto-calculate sliding door count from width ----
function _calcSlidingDoorCount(widthCm) {
    // Every 110 cm = 1 door, minimum 2
    return Math.max(2, Math.ceil(widthCm / 110));
}

// ---- Sync sliding wardrobe: numDoors + numColumns must always match ----
// Each door gets its own column. Partitions fall between every 2 doors.
function _syncSlidingColumns(wing) {
    if (!wing || !wing.slidingDoor || !wing.slidingDoor.enabled) return;
    const numDoors = wing.slidingDoor.numDoors || 2;
    const t = wing.thickness || 1.7;
    // Inner width = total width minus 2 outer walls minus (numDoors-1) partition walls
    const innerWidth = wing.width - t * 2 - t * (numDoors - 1);
    const colWidth = innerWidth / numDoors;
    wing.columns = Array.from({ length: numDoors }, () => {
        const col = {
            type: 'normal',
            width: colWidth,
            height: wing.globalHeight,
            shelves: 0,
            splitY: null,
            shelvesY: [],
            compartments: [],
            doors: [],
            floorOffset: 0,
            topPanel: false,
            sinkPanel: false
        };
        _distributeShelves(col, wing);
        return col;
    });
    // Sync doorPanels array length to numDoors — preserve existing per-door types
    const sd = wing.slidingDoor;
    if (!sd.doorPanels) sd.doorPanels = [];
    while (sd.doorPanels.length < numDoors) sd.doorPanels.push(sd.doorPanelType || 'solid');
    if (sd.doorPanels.length > numDoors) sd.doorPanels.length = numDoors;
}

// ---- Helper: get sliding door data for active wing ----
window.getSlidingDoor = function() {
    const w = getWing();
    if (!w) return { enabled: false, profileColor: 'nickel', doorPanelType: 'solid', doorPanels: [], doorColors: [], numDoors: 2, manualNumDoors: false };
    return w.slidingDoor || { enabled: false, profileColor: 'nickel', doorPanelType: 'solid', doorPanels: [], doorColors: [], numDoors: 2, manualNumDoors: false };
};

// ---- Update sliding door property ----
window.updateSlidingDoor = function(key, value) {
    const w = getWing();
    if (!w || !w.slidingDoor) return;
    if (key === 'numDoors') {
        const n = Math.max(2, Math.min(8, parseInt(value) || 2));
        w.slidingDoor.numDoors = n;
        w.slidingDoor.manualNumDoors = true;
        const el = document.getElementById('inp-sd-doors');
        if (el) el.value = n;
        const lbl = document.getElementById('val-sd-doors');
        if (lbl) lbl.innerText = n;
        // Sync columns to match new door count
        _syncSlidingColumns(w);
        const colInput = document.getElementById('inp-columns');
        const colLbl = document.getElementById('val-columns');
        if (colInput) colInput.value = n;
        if (colLbl) colLbl.innerText = n;
    } else if (key === 'profileColor') {
        w.slidingDoor.profileColor = value;
        // Update button highlights
        document.querySelectorAll('.sd-profile-btn').forEach(b => {
            b.style.outline = b.dataset.color === value ? '2.5px solid var(--accent)' : '';
            b.style.outlineOffset = b.dataset.color === value ? '2px' : '';
        });
    } else if (key === 'doorPanelType') {
        w.slidingDoor.doorPanelType = value;
        document.querySelectorAll('.sd-panel-btn').forEach(b => {
            b.classList.toggle('active', b.dataset.panel === value);
        });
    }
    buildCabinet(); calculatePrice(); saveHistoryState();
    // Rebuild per-door panel tabs UI after any change
    if (typeof window._rebuildDoorPanelTabs === 'function') window._rebuildDoorPanelTabs();
};

// ---- Update per-door panel type ----
window.updateSlidingDoorPanel = function(doorIndex, panelType) {
    const w = getWing();
    if (!w || !w.slidingDoor) return;
    if (!w.slidingDoor.doorPanels) w.slidingDoor.doorPanels = [];
    w.slidingDoor.doorPanels[doorIndex] = panelType;
    buildCabinet(); calculatePrice(); saveHistoryState();
    if (typeof window._rebuildDoorPanelTabs === 'function') window._rebuildDoorPanelTabs();
};

// ---- Update per-door color (for solid panel type) ----
window.updateSlidingDoorColor = function(doorIndex, colorKey) {
    const w = getWing();
    if (!w || !w.slidingDoor) return;
    if (!w.slidingDoor.doorColors) w.slidingDoor.doorColors = [];
    w.slidingDoor.doorColors[doorIndex] = colorKey;
    buildCabinet(); calculatePrice(); saveHistoryState();
    if (typeof window._rebuildDoorPanelTabs === 'function') window._rebuildDoorPanelTabs();
};

// ---- Helper: create a fresh sideCabinet wing-like object ----
function _createSideCabinetData(mainWing) {
    const w = mainWing || getWing();
    const scWidth = 40; // default protrusion width (cm)
    const innerW = scWidth - (w.thickness || 1.7) * 2;
    const col = {
        type: 'normal', width: innerW, height: w.globalHeight || 240,
        shelves: 3, splitY: null, shelvesY: [], compartments: [], doors: [], floorOffset: 0
    };
    _distributeShelves(col, w);
    return {
        side: 'none',          // 'left' | 'right' | 'both'
        width: scWidth,        // legacy / shared width (kept for backward compat)
        widthRight: scWidth,   // protrusion of the RIGHT side cabinet
        widthLeft: scWidth,    // protrusion of the LEFT side cabinet
        globalHeight: w.globalHeight || 240,
        depth: w.depth || 54,
        thickness: w.thickness || 1.7,
        plinthHeight: w.plinthHeight || 8.75,
        hasDoors: w.hasDoors !== false,
        handleType: w.handleType || '',
        handleStyle: w.handleStyle || 'pipe',
        cabinetModel: w.cabinetModel || 'c9',
        boardMaterial: w.boardMaterial || 'melamine',
        materialBody: w.materialSideCabinet || 'white_matte',
        materialInternal: w.materialSideCabinet || 'white_matte',
        materialExternal: w.materialExternal || 'white_matte',
        materialDesk: w.materialSideCabinet || 'white_matte',
        materialOpenCell: w.materialSideCabinet || 'white_matte',
        materialBack: w.materialSideCabinet || 'white_matte',
        activeColorPart: 'materialBody',
        columns: [col],
        wingPosition: 'side',
        desk: { side: 'none', width: 100, height: 80, hasDrawers: false, drawerHeight: 12, drawerCount: null },
        corner: { side: 'none', width: 60, height: 90, depth: 54, type: 'shelves', shelves: 3, drawerCount: 4 },
        fullCorner: { size: 100, shelves: 2, shelvesY: [], compartments: [] },
        manualPrice: null,
        manualInstallPrice: null
    };
}

const state = {
    // ---- Global (not per-wing) ----
    presetId: 'linear',
    viewMode: 'front',
    selection: { colIndex: -1, rows: [] },
    hoveredColIndex: -1,
    activeEditCol: -1,
    dimData: [],
    bpData: [],
    blueprintCutouts: [],
    blueprintCellDimOffsets: {},
    blueprintDimOffsets: {},
    // Selective blueprint dims: default show all; per-item overrides + hide-all toggles
    blueprintInternalDimsDefault: true,
    blueprintCellDimShown: {},
    blueprintColWidthDimsDefault: true,
    blueprintColWidthDimShown: {},
    customer: { name: '', phone: '', orderNum: '', address: '', deliveryDate: '' },
    // Editable title + intro text on order/factory print forms
    orderForm: { factory: { title: '', notes: '' }, customer: { title: '', notes: '' } },
    orderCart: [],
    editingCartIndex: -1,
    currentInstallPrice: 0,
    currentCostPrice: 0,
    history: [],
    historyIndex: -1,
    isRestoring: false,
    // ---- Per-part color overrides (part-paint mode): fullPartId → colorKey ----
    partColors: {},
    // ---- Room wall position: 'center' | 'left' | 'right' (linear/sliding only) ----
    roomWall: 'center',

    // ---- Wing system ----
    activeWing: 'center',
    wingEditMode: false,
    wingEditSnapshot: null,
    wings: {
        center: null, // will be set below
        left: null,
        right: null
    },
    // ---- Inline upper unit editing (no separate wing edit mode) ----
    _activeUpperUnit: null,       // e.g. 'upperUnit_center' when editing inline
    _activeUpperUnitParent: null  // e.g. 'center'
};

// Initialize center wing with default columns
(function() {
    const w = createWingData();
    // distribute 2 columns
    const innerWidth = w.width - (w.thickness * 2) - w.thickness;
    const colWidth = innerWidth / 2;
    w.columns = [0, 1].map(() => {
        const col = { type: 'normal', width: colWidth, height: w.globalHeight, shelves: 0, splitY: null, shelvesY: [], compartments: [], doors: [], floorOffset: 0 };
        _distributeShelves(col, w);
        return col;
    });
    state.wings.center = w;
})();

// ---- Helper: get active wing data ----
// When state._activeUpperUnit is set, returns the upper unit wing for sidebar editing.
window.getWing = function() {
    if (state._activeUpperUnit) return state.wings[state._activeUpperUnit] || null;
    const aw = state.activeWing;
    if (aw === 'full_corner_right') return state.wings.right;
    if (aw === 'full_corner_left')  return state.wings.left;
    if (aw === 'sideCabinetRight' || aw === 'sideCabinetLeft') return state.wings.center ? state.wings.center.sideCabinet : null;
    return state.wings[aw];
};

// ---- Proxy: read per-wing fields from active wing ----
// These getters/setters make existing code like state.width work transparently
const _wingFields = [
    'cabinetModel','placement','width','globalHeight','depth','thickness','plinthHeight',
    'hasDoors','handleType','handleStyle','cabinetName','cabinetNotes','boardMaterial',
    'materialBody','materialInternal','materialExternal','materialDesk','materialOpenCell','materialBack',
    'materialSideCabinet','materialTopPanel',
    'activeColorPart','columns','desk','corner','fullCorner','sideCabinet','manualPrice','manualInstallPrice',
    'slidingDoor'
];

_wingFields.forEach(field => {
    Object.defineProperty(state, field, {
        get() {
            // When editing upper unit inline, proxy reads go to the upper unit wing
            if (state._activeUpperUnit) {
                const uuW = state.wings[state._activeUpperUnit];
                return uuW ? uuW[field] : undefined;
            }
            // full_corner_right / full_corner_left → resolve to the real side's wing data
            const aw = state.activeWing;
            if (aw === 'full_corner_right') return state.wings.right ? state.wings.right[field] : undefined;
            if (aw === 'full_corner_left')  return state.wings.left  ? state.wings.left[field]  : undefined;
            if (aw === 'sideCabinetRight' || aw === 'sideCabinetLeft') {
                const sc = state.wings.center ? state.wings.center.sideCabinet : null;
                return sc ? sc[field] : undefined;
            }
            return state.wings[aw] ? state.wings[aw][field] : undefined;
        },
        set(v) {
            // When editing upper unit inline, proxy writes go to the upper unit wing
            if (state._activeUpperUnit) {
                const uuW = state.wings[state._activeUpperUnit];
                if (uuW) uuW[field] = v;
                return;
            }
            const aw = state.activeWing;
            if (aw === 'full_corner_right') { if (state.wings.right)  state.wings.right[field]  = v; return; }
            if (aw === 'full_corner_left')  { if (state.wings.left)   state.wings.left[field]   = v; return; }
            if (aw === 'sideCabinetRight' || aw === 'sideCabinetLeft') {
                const sc = state.wings.center ? state.wings.center.sideCabinet : null;
                if (sc) sc[field] = v;
                return;
            }
            if (state.wings[aw]) state.wings[aw][field] = v;
        },
        enumerable: true,
        configurable: true
    });
});

// ---- Wing switching ----
window.switchWing = function(wingId) {
    if (state.activeWing === wingId) return;
    if (!state.wings[wingId]) return;
    state.activeWing = wingId;
    // Update tab UI
    document.querySelectorAll('.wing-tab-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.wing === wingId);
    });
    // Sync all sidebar inputs to new wing
    syncSidebarToWing();
    buildCabinet(); updateCameraView(); calculatePrice();
};

// ---- Add a wing (left or right) ----
window.addWing = function(side) {
    if (state.wings[side]) { switchWing(side); return; }
    const newWing = createWingData();
    // Copy dimensions from center for convenience
    const center = state.wings.center;
    newWing.globalHeight = center.globalHeight;
    newWing.depth = center.depth;
    newWing.thickness = center.thickness;
    newWing.plinthHeight = center.plinthHeight;
    newWing.boardMaterial = center.boardMaterial;
    newWing.materialBody = center.materialBody;
    newWing.materialInternal = center.materialInternal;
    newWing.materialExternal = center.materialExternal;
    newWing.materialBack = center.materialBack;
    newWing.cabinetModel = center.cabinetModel;
    // Default width for side wing: ensure visible opening is at least 30cm
    // visible = innerW - centerD, so innerW = centerD + 30, width = innerW + thickness*3
    const centerD = (state.wings.center && state.wings.center.depth) || newWing.depth;
    const minInnerW = centerD + 30;
    newWing.width = Math.round(minInnerW + newWing.thickness * 3);
    const innerW = newWing.width - newWing.thickness * 3;
    newWing.columns = [{
        type: 'normal', width: innerW, height: newWing.globalHeight,
        shelves: 0, splitY: null, shelvesY: [], compartments: [], doors: [], floorOffset: 0
    }];
    // Run distributeShelves on each col
    newWing.columns.forEach(col => _distributeShelves(col, newWing));
    state.wings[side] = newWing;
    // Show tab
    _showWingTab(side);
    switchWing(side);
};

// ---- Remove a wing ----
window.removeWing = function(side) {
    if (side === 'center') return;
    if (!state.wings[side]) return;
    if (!confirm('למחוק דופן זו?')) return;
    state.wings[side] = null;
    _hideWingTab(side);
    if (state.activeWing === side) switchWing('center');
    else { buildCabinet(); updateCameraView(); calculatePrice(); }
};

// ---- Upper Unit helpers ----
// Each wing can have its own upper unit stored as state.wings['upperUnit_'+wingId]

function _showUpperUnitTab(wingId) {
    // No-op: upper unit editing is now inline, no separate tab needed
}
function _hideUpperUnitTab(wingId) {
    // No-op: upper unit editing is now inline
}

// Enter inline upper unit edit mode (no wing edit mode banner)
// Optional parentId: if provided, use it directly (e.g. when clicking the upper unit 3D model).
// If omitted, falls back to state.activeWing (e.g. when clicking the sidebar button).
window._enterUpperUnitEdit = function(parentId) {
    const resolvedParent = parentId || state.activeWing || 'center';
    const key = 'upperUnit_' + resolvedParent;
    if (state.wings[key]) {
        state._activeUpperUnit = key;
        state._activeUpperUnitParent = resolvedParent;
        // Show on-screen banner
        const banner = document.getElementById('upper-unit-edit-banner');
        if (banner) banner.style.display = 'flex';
        syncSidebarToWing();
        buildCabinet();
    }
};

// Exit inline upper unit edit mode
window._exitUpperUnitEdit = function() {
    state._activeUpperUnit = null;
    state._activeUpperUnitParent = null;
    // Hide on-screen banner
    const banner = document.getElementById('upper-unit-edit-banner');
    if (banner) banner.style.display = 'none';
    syncSidebarToWing();
    buildCabinet();
};

window.toggleUpperUnit = function(wingId) {
    // Default to the currently active parent wing
    if (!wingId) {
        wingId = state._activeUpperUnitParent || state.activeWing || 'center';
    }
    const parentWing = state.wings[wingId];
    if (!parentWing) return;
    const key = 'upperUnit_' + wingId;
    if (state.wings[key]) {
        // Remove upper unit
        delete state.wings[key];
        _hideUpperUnitTab(wingId);
        // If we were editing this upper unit inline, exit inline edit mode
        if (state._activeUpperUnit === key) {
            state._activeUpperUnit = null;
            state._activeUpperUnitParent = null;
            const _uuBanner3 = document.getElementById('upper-unit-edit-banner');
            if (_uuBanner3) _uuBanner3.style.display = 'none';
        }
    } else {
        // Create full wing for upper unit
        const uuWing = createWingData({
            globalHeight: 40,
            width: parentWing.width,
            depth: parentWing.depth,
            thickness: parentWing.thickness || 1.7,
            plinthHeight: parentWing.thickness || 1.7,
            boardMaterial: parentWing.boardMaterial || 'melamine',
            materialBody: parentWing.materialBody || 'white_matte',
            materialInternal: parentWing.materialInternal || 'white_matte',
            materialExternal: parentWing.materialExternal || 'white_matte',
            materialBack: parentWing.materialBack || 'white_matte',
            cabinetModel: parentWing.cabinetModel || 'c9',
            hasDoors: true,
            wingPosition: 'front', // not a side wing — prevents door/side clipping treating UU as side
            _isUpperUnit: true,
            _upperGap: 60,
            _upperOffsetX: 0,
            _parentWingId: wingId
        });
        // Distribute 1 column
        const t = uuWing.thickness || 1.7;
        const innerW = uuWing.width - t * 2;
        uuWing.columns = [{
            type: 'normal', width: innerW, height: uuWing.globalHeight,
            shelves: 0, splitY: null, shelvesY: [], compartments: [], doors: [], floorOffset: 0,
            noPlinth: true
        }];
        uuWing.columns.forEach(col => _distributeShelves(col, uuWing));
        state.wings[key] = uuWing;
        _showUpperUnitTab(wingId);
    }
    // Sync checkbox + toggle-wrap UI
    const _uuEnabled = !!state.wings['upperUnit_' + wingId];
    const cb = document.getElementById('inp-upper-unit-enabled');
    if (cb) cb.checked = _uuEnabled;
    const wrap = document.getElementById('wrap-upper-unit');
    const btn  = document.getElementById('btn-upper-unit-toggle');
    if (wrap) wrap.classList.toggle('open', _uuEnabled);
    if (btn)  btn.classList.toggle('active', _uuEnabled);
    buildCabinet(); calculatePrice(); saveHistoryState();
};

// Update gap for an upper unit
window.setUpperUnitGap = function(value) {
    // Use _activeUpperUnitParent if set (inline edit mode), otherwise fall back to activeWing
    const parentId = state._activeUpperUnitParent || state.activeWing;
    const key = 'upperUnit_' + parentId;
    const uuWing = state.wings[key];
    if (!uuWing) return;
    const parsed = parseFloat(value);
    if (isNaN(parsed)) return;
    uuWing._upperGap = Math.max(0, Math.min(200, Math.round(parsed)));
    const gapSlider = document.getElementById('inp-upper-gap');
    const gapNum = document.getElementById('inp-num-upper-gap');
    if (gapSlider) gapSlider.value = uuWing._upperGap;
    if (gapNum) gapNum.value = uuWing._upperGap;
    buildCabinet(); calculatePrice(); saveHistoryState();
};
window.updateUpperUnitGap = function(delta) {
    const parentId = state._activeUpperUnitParent || state.activeWing;
    const key = 'upperUnit_' + parentId;
    const uuWing = state.wings[key];
    if (!uuWing) return;
    window.setUpperUnitGap((uuWing._upperGap || 60) + delta);
};

// ---- Update wing position mode ----
window.updateWingPosition = function(value) {
    const w = getWing();
    if (!w) return;
    w.wingPosition = value;
    // If switching to full_corner, ensure the opposite wing exists
    if (value === 'full_corner') {
        _ensureFullCornerOppositeWing(state.activeWing);
    }
    buildCabinet(); updateCameraView(); saveHistoryState();
};

// ---- Helper: when a wing becomes full_corner, auto-create the opposite wing ----
function _ensureFullCornerOppositeWing(side) {
    if (side === 'center') return;
    const oppSide = (side === 'left') ? 'right' : 'left';
    if (!state.wings[oppSide]) {
        const newWing = _makeWing(160, oppSide);
        newWing.wingPosition = 'side';
        state.wings[oppSide] = newWing;
        _showWingTab(oppSide);
    }
}

// ---- Helper: distribute fullCorner shelves evenly ----
window._distributeFullCornerShelves = function(wing) {
    if (!wing) wing = getWing();
    if (!wing || !wing.fullCorner) return;
    const fc = wing.fullCorner;
    const size = fc.size || 100;
    const t = wing.thickness || 1.7;
    const plinthH = wing.plinthHeight || 7;
    const colH = wing.globalHeight || 240;
    const innerH = colH - plinthH - t * 2;
    const n = fc.shelves || 0;
    fc.shelvesY = [];
    if (n > 0) {
        const spacing = innerH / (n + 1);
        for (let i = 1; i <= n; i++) {
            fc.shelvesY.push(Math.round((plinthH + t + spacing * i) * 10) / 10);
        }
    }
    // Ensure compartments array has n+1 entries
    const numComps = n + 1;
    while (fc.compartments.length < numComps) fc.compartments.push({ type: 'empty' });
    while (fc.compartments.length > numComps) fc.compartments.pop();
    // Update splitY for this full corner unit
    _checkFCSplit(wing);
};

// ---- Full corner split (קושרת) logic ----
// When the full corner height exceeds the threshold (240 sandwich / 270–275 melamine),
// a split board (L-shaped) is added at the threshold position.
function _checkFCSplit(wing) {
    if (!wing || !wing.fullCorner) return;
    const fc = wing.fullCorner;
    const colH = wing.globalHeight || 240;
    const threshold = getSplitThreshold(wing);
    if (colH > threshold) {
        // Use existing splitY if already set, otherwise default to threshold - 40
        if (!fc.splitY) fc.splitY = threshold === 240 ? 200 : 240;
    } else {
        fc.splitY = null;
    }
}

// Expose so engine can call after height changes
window._checkFCSplit = _checkFCSplit;

// ---- Update fullCorner shelves count ----
window.updateFullCornerShelves = function(delta) {
    const w = getWing();
    if (!w || !w.fullCorner) return;
    const fc = w.fullCorner;
    const newS = Math.max(0, Math.min(6, (fc.shelves || 0) + delta));
    fc.shelves = newS;
    window._distributeFullCornerShelves(w);
    buildCabinet(); calculatePrice(); saveHistoryState();
};

// ---- Update fullCorner compartment content (תוכן פנימי) ----
// rows: single rowIndex (number) or array of row indices
window.updateFullCornerContent = function(rows, contentType) {
    const w = getWing();
    if (!w || !w.fullCorner) return;
    const fc = w.fullCorner;
    const rowArr = Array.isArray(rows) ? rows : [rows];
    rowArr.forEach(r => {
        if (!fc.compartments[r]) fc.compartments[r] = {};
        // migrate legacy type field
        _fcMigrateComp(fc.compartments[r]);
        fc.compartments[r].content = contentType;
    });
    buildCabinet(); calculatePrice(); saveHistoryState();
};

// ---- Update fullCorner compartment door (דלת חיצונית) ----
window.updateFullCornerDoor = function(rows, doorType) {
    const w = getWing();
    if (!w || !w.fullCorner) return;
    const fc = w.fullCorner;
    const rowArr = Array.isArray(rows) ? rows : [rows];
    rowArr.forEach(r => {
        if (!fc.compartments[r]) fc.compartments[r] = {};
        _fcMigrateComp(fc.compartments[r]);
        fc.compartments[r].door = doorType;
    });
    buildCabinet(); calculatePrice(); saveHistoryState();
};

// ---- Update fullCorner door style ----
window.updateFullCornerDoorStyle = function(rows, style) {
    const w = getWing();
    if (!w || !w.fullCorner) return;
    const fc = w.fullCorner;
    const rowArr = Array.isArray(rows) ? rows : [rows];
    rowArr.forEach(r => {
        if (!fc.compartments[r]) fc.compartments[r] = {};
        _fcMigrateComp(fc.compartments[r]);
        fc.compartments[r].doorStyle = style;
    });
    buildCabinet(); calculatePrice(); saveHistoryState();
};

// ---- Migration helper: convert legacy { type } to { content, door } ----
function _fcMigrateComp(comp) {
    if (!comp) return;
    if (comp.content !== undefined) return; // already migrated
    const t = comp.type || 'empty';
    if (t === 'cross_hanging') {
        comp.content = 'cross_hanging';
        comp.door = comp.door || 'empty';
    } else if (t === 'door_regular') {
        comp.content = comp.content || 'empty';
        comp.door = comp.door || 'right';
        comp.doorStyle = comp.doorStyle || 'solid';
    } else if (t === 'door_glass') {
        comp.content = comp.content || 'empty';
        comp.door = comp.door || 'right';
        comp.doorStyle = comp.doorStyle || 'glass_melamine';
    } else {
        comp.content = 'empty';
        comp.door = comp.door || 'empty';
    }
    delete comp.type;
    delete comp.doorSpan;
}

// ---- Legacy updateFullCornerComp — kept for backward compat ----
window.updateFullCornerComp = function(rowIndex, type, span) {
    const w = getWing();
    if (!w || !w.fullCorner) return;
    const fc = w.fullCorner;
    if (!fc.compartments[rowIndex]) fc.compartments[rowIndex] = {};
    const comp = fc.compartments[rowIndex];
    _fcMigrateComp(comp);
    // Map legacy types to new fields
    if (type === 'cross_hanging') {
        comp.content = 'cross_hanging';
    } else if (type === 'door_regular') {
        comp.door = comp.door && comp.door !== 'empty' ? comp.door : 'right';
        comp.doorStyle = comp.doorStyle || 'solid';
    } else if (type === 'door_glass') {
        comp.door = comp.door && comp.door !== 'empty' ? comp.door : 'right';
        comp.doorStyle = comp.doorStyle || 'glass_melamine';
    } else if (type === 'empty') {
        comp.content = 'empty';
        comp.door = 'empty';
    }
    buildCabinet(); calculatePrice(); saveHistoryState();
};

// ---- Cabinet presets ----
let _pendingPresetId = null;
let _pendingWingPositions = { left: 'side', right: 'side' };

// Helper: create a fresh wing with shared settings from center
function _makeWing(widthCm, side) {
    const c = state.wings.center;
    const w = createWingData();
    w.globalHeight = c.globalHeight;
    w.depth = c.depth;
    w.thickness = c.thickness;
    w.plinthHeight = c.plinthHeight;
    w.boardMaterial = c.boardMaterial;
    w.materialBody = c.materialBody;
    w.materialInternal = c.materialInternal;
    w.materialExternal = c.materialExternal;
    w.materialBack = c.materialBack;
    w.cabinetModel = c.cabinetModel;
    w.width = widthCm;
    // For wings wider than 120 cm, start with 2 columns so the hidden zone is visible
    const innerW = w.width - w.thickness * 3;
    const centerDep = w.depth;
    const minHiddenW = centerDep + 30;
    if (widthCm >= 100 && innerW > minHiddenW + 30) {
        const hiddenW = Math.max(minHiddenW, innerW / 2);
        const visibleW = innerW - hiddenW;
        const hiddenCol = { type: 'normal', width: hiddenW,  height: w.globalHeight, shelves: 0, splitY: null, shelvesY: [], compartments: [], doors: [], floorOffset: 0 };
        const visibleCol = { type: 'normal', width: visibleW, height: w.globalHeight, shelves: 0, splitY: null, shelvesY: [], compartments: [], doors: [], floorOffset: 0 };
        // Left wing: hidden column is LAST (rightmost in local coords = toward center cabinet)
        // Right wing: hidden column is FIRST (leftmost in local coords = toward center cabinet)
        w.columns = (side === 'left') ? [visibleCol, hiddenCol] : [hiddenCol, visibleCol];
    } else {
        w.columns = [{
            type: 'normal', width: innerW, height: w.globalHeight,
            shelves: 0, splitY: null, shelvesY: [], compartments: [], doors: [], floorOffset: 0
        }];
    }
    w.columns.forEach(col => _distributeShelves(col, w));
    return w;
}

function _applyPresetCore(presetId, rightPos, leftPos) {
    // Exit edit mode if active
    if (state.wingEditMode) {
        state.wingEditMode = false;
        state.wingEditSnapshot = null;
        const banner = document.getElementById('wing-edit-banner');
        if (banner) banner.style.display = 'none';
    }
    // Reset wings
    state.wings.left = null;
    state.wings.right = null;
    _hideWingTab('left');
    _hideWingTab('right');
    state.activeWing = 'center';
    window._orbitFree = false;
    window._forceCameraAnim = true;
    window._corner3dCamPositioned = false;
    window._frontCamPositioned = false;
    window._wingEditCamInit = false;

    // Reset room wall position when switching presets
    state.roomWall = 'center';
    window._roomWall = 'center';

    state.presetId = presetId;

    if (presetId === 'corner-right') {
        const w = _makeWing(160, 'right');
        w.wingPosition = rightPos || 'side';
        state.wings.right = w;
        _showWingTab('right');
    } else if (presetId === 'corner-left') {
        const w = _makeWing(160, 'left');
        w.wingPosition = leftPos || 'side';
        state.wings.left = w;
        _showWingTab('left');
    } else if (presetId === 'walkin') {
        const wR = _makeWing(160, 'right'); wR.wingPosition = rightPos || 'side';
        const wL = _makeWing(160, 'left'); wL.wingPosition = leftPos || 'side';
        state.wings.right = wR;
        state.wings.left = wL;
        _showWingTab('right');
        _showWingTab('left');
    } else if (presetId === 'sliding') {
        // Sliding wardrobe: single center wing with sliding door enabled
        const cw = state.wings.center;
        if (cw) {
            if (!cw.slidingDoor) cw.slidingDoor = {};
            cw.slidingDoor.enabled = true;
            cw.slidingDoor.profileColor = cw.slidingDoor.profileColor || 'nickel';
            cw.slidingDoor.doorPanelType = cw.slidingDoor.doorPanelType || 'solid';
            cw.slidingDoor.manualNumDoors = false;
            cw.slidingDoor.numDoors = _calcSlidingDoorCount(cw.width);
            // Sliding wardrobe uses 7cm plinth (צוקל) and 60cm default depth
            cw.plinthHeight = 7;
            cw.depth = 60;
            // Sync depth slider/input in sidebar
            const depthSlider = document.getElementById('inp-depth');
            const depthNum = document.getElementById('inp-num-depth');
            if (depthSlider) depthSlider.value = 60;
            if (depthNum) depthNum.value = 60;
            const mDepthSlider = document.getElementById('ep-inp-depth');
            const mDepthNum = document.getElementById('ep-inp-num-depth');
            if (mDepthSlider) mDepthSlider.value = 60;
            if (mDepthNum) mDepthNum.value = 60;
            // Sync columns to match door count (1 column per door)
            _syncSlidingColumns(cw);
        }
    } else if (presetId === 'bathroom') {
        // Bathroom cabinet — handled by bathroom-preset.js
        if (typeof window._applyBathroomPreset === 'function') window._applyBathroomPreset();
    } else if (presetId === 'writing-desk') {
        // Standalone writing desk — handled by writing-desk-preset.js
        if (typeof window._applyWritingDeskPreset === 'function') window._applyWritingDeskPreset();
    }

    // If switching away from sliding, disable it
    if (presetId !== 'sliding') {
        const cw = state.wings.center;
        if (cw && cw.slidingDoor) cw.slidingDoor.enabled = false;
    }

    // Highlight active preset button
    document.querySelectorAll('.preset-btn').forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.querySelector(`.preset-btn[onclick="applyPreset('${presetId}')"]`);
    if (activeBtn) activeBtn.classList.add('active');
    // Also highlight the sliding button (it has id, not just onclick selector)
    const slidingBtn = document.getElementById('preset-btn-sliding');
    if (slidingBtn) slidingBtn.classList.toggle('active', presetId === 'sliding');

    // Always show multi-view blueprint button for all presets
    const mvBtn = document.getElementById('btn-multiview-blueprint');
    if (mvBtn) mvBtn.style.display = '';

    // Show/hide sliding door section and corner/side-unit sections
    const sdSection = document.getElementById('sliding-door-section');
    const sideUnitSection = document.getElementById('side-unit-section');
    const cornerSection = document.getElementById('corner-unit-section');
    const cabinetSettingsSection = document.querySelector('.section .section-title .fa-cubes')?.closest('.section');
    const plinthModelRow = document.getElementById('plinth-model-row');
    const mobilePlinthModelRow = document.getElementById('mobile-plinth-model-row');
    const _hasWings = presetId === 'corner-right' || presetId === 'corner-left' || presetId === 'walkin';
    const _isSliding = presetId === 'sliding';
    if (sdSection) sdSection.style.display = _isSliding ? '' : 'none';
    if (sideUnitSection) sideUnitSection.style.display = _isSliding ? 'none' : '';
    if (cornerSection) cornerSection.style.display = (_isSliding || _hasWings) ? 'none' : '';
    if (plinthModelRow) plinthModelRow.style.display = _isSliding ? 'none' : '';
    if (mobilePlinthModelRow) mobilePlinthModelRow.style.display = _isSliding ? 'none' : '';

    // Linear/bathroom cabinet: go directly to front/edit view (no wings to orbit around)
    // Corner/walkin: stay in 3D so user sees the full layout
    state.viewMode = (presetId === 'linear' || presetId === 'sliding' || presetId === 'bathroom' || presetId === 'writing-desk') ? 'front' : '3d';
    _setFreeTabActive(true);
    syncSidebarToWing();
    buildCabinet(); updateCameraView(); calculatePrice(); saveHistoryState();
}

// Restore preset UI state after loading a project (without resetting wing data)
window._restorePresetUI = function() {
    const presetId = state.presetId || 'linear';

    // Also restore _pendingPresetId so position buttons work correctly
    _pendingPresetId = presetId;
    if (state.wings.right) _pendingWingPositions.right = state.wings.right.wingPosition || 'side';
    if (state.wings.left)  _pendingWingPositions.left  = state.wings.left.wingPosition  || 'side';

    // Show/hide wing tabs based on actual wing data (do NOT create new wings)
    ['left', 'right'].forEach(side => {
        if (state.wings[side]) _showWingTab(side); else _hideWingTab(side);
    });

    // Update active wing tab highlight
    document.querySelectorAll('.wing-tab-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.wing === state.activeWing);
    });

    // Highlight active preset button
    document.querySelectorAll('.preset-btn').forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.querySelector(`.preset-btn[onclick="applyPreset('${presetId}')"]`);
    if (activeBtn) activeBtn.classList.add('active');
    const slidingBtn = document.getElementById('preset-btn-sliding');
    if (slidingBtn) slidingBtn.classList.toggle('active', presetId === 'sliding');

    // Show/hide sidebar sections
    const sdSection = document.getElementById('sliding-door-section');
    const sideUnitSection = document.getElementById('side-unit-section');
    const cornerSection = document.getElementById('corner-unit-section');
    const plinthModelRow = document.getElementById('plinth-model-row');
    const mobilePlinthModelRow = document.getElementById('mobile-plinth-model-row');
    const _hasWings = presetId === 'corner-right' || presetId === 'corner-left' || presetId === 'walkin';
    const _isSliding = presetId === 'sliding';
    if (sdSection) sdSection.style.display = _isSliding ? '' : 'none';
    if (sideUnitSection) sideUnitSection.style.display = _isSliding ? 'none' : '';
    if (cornerSection) cornerSection.style.display = (_isSliding || _hasWings) ? 'none' : '';
    if (plinthModelRow) plinthModelRow.style.display = _isSliding ? 'none' : '';
    if (mobilePlinthModelRow) mobilePlinthModelRow.style.display = _isSliding ? 'none' : '';

    // Show/hide preset position menu for corner presets
    const ppm = document.getElementById('preset-position-menu');
    const ppmSingle = document.getElementById('ppm-single');
    const ppmWalkin = document.getElementById('ppm-walkin');
    if (ppm) {
        if (_hasWings) {
            ppm.style.display = 'block';
            if (ppmSingle) ppmSingle.style.display = (presetId === 'corner-right' || presetId === 'corner-left') ? 'block' : 'none';
            if (ppmWalkin) ppmWalkin.style.display = presetId === 'walkin' ? 'block' : 'none';
            // Highlight the correct position button(s)
            document.querySelectorAll('.ppm-btn').forEach(b => b.classList.remove('active'));
            if (presetId === 'corner-right' && state.wings.right) {
                const pos = state.wings.right.wingPosition || 'side';
                const btn = document.getElementById(`ppm-single-${pos}`);
                if (btn) btn.classList.add('active');
            } else if (presetId === 'corner-left' && state.wings.left) {
                const pos = state.wings.left.wingPosition || 'side';
                const btn = document.getElementById(`ppm-single-${pos}`);
                if (btn) btn.classList.add('active');
            } else if (presetId === 'walkin') {
                if (state.wings.right) {
                    const rPos = state.wings.right.wingPosition || 'side';
                    const rBtn = document.getElementById(`ppm-right-${rPos}`);
                    if (rBtn) rBtn.classList.add('active');
                }
                if (state.wings.left) {
                    const lPos = state.wings.left.wingPosition || 'side';
                    const lBtn = document.getElementById(`ppm-left-${lPos}`);
                    if (lBtn) lBtn.classList.add('active');
                }
            }
        } else {
            ppm.style.display = 'none';
        }
    }

    // Sync sidebar visibility (show edit content for linear/sliding, placeholder for corner/walkin in free mode)
    if (typeof window.syncSidebarToWing === 'function') window.syncSidebarToWing();
};

/** Restore center/left/right AND upperUnit_* (and any other extra wing keys) from saved data.
 *  Older loaders only restored center/left/right, so upper units vanished on project reload. */
window._restoreWingsFromSaved = function(savedWings, options) {
    if (!savedWings || typeof savedWings !== 'object' || typeof state === 'undefined' || !state.wings) return;
    options = options || {};

    // Drop existing extra wing keys (upperUnit_*, etc.) so stale UUs don't survive a load
    Object.keys(state.wings).forEach(function(k) {
        if (k !== 'center' && k !== 'left' && k !== 'right') delete state.wings[k];
    });

    if (savedWings.center) state.wings.center = savedWings.center;
    state.wings.left = savedWings.left || null;
    state.wings.right = savedWings.right || null;

    Object.keys(savedWings).forEach(function(k) {
        if (k === 'center' || k === 'left' || k === 'right') return;
        if (savedWings[k]) state.wings[k] = savedWings[k];
    });

    // Exit inline upper-unit edit — loaded cabinet should show the parent view
    state._activeUpperUnit = null;
    state._activeUpperUnitParent = null;
    const banner = document.getElementById('upper-unit-edit-banner');
    if (banner) banner.style.display = 'none';
};

/** Fully reset the editor to a fresh default linear cabinet (dims, materials, columns, notes). */
window._resetEditorToDefaultLinearCabinet = function() {
    state.wingEditMode = false;
    state.wingEditSnapshot = null;
    state._activeUpperUnit = null;
    state._activeUpperUnitParent = null;
    window._orbitFree = false;
    window._forceCameraAnim = true;
    window._corner3dCamPositioned = false;
    window._frontCamPositioned = false;
    window._wingEditCamInit = false;

    // Drop any upper-unit / extra wing keys
    Object.keys(state.wings || {}).forEach(function(k) {
        if (k !== 'center' && k !== 'left' && k !== 'right') {
            delete state.wings[k];
        }
    });

    const w = createWingData();
    const innerWidth = w.width - (w.thickness * 2) - w.thickness;
    const colWidth = innerWidth / 2;
    w.columns = [0, 1].map(function() {
        const col = {
            type: 'normal', width: colWidth, height: w.globalHeight,
            shelves: 0, splitY: null, shelvesY: [], compartments: [], doors: [], floorOffset: 0
        };
        _distributeShelves(col, w);
        return col;
    });
    state.wings.center = w;
    state.wings.left = null;
    state.wings.right = null;
    state.activeWing = 'center';
    state.presetId = 'linear';
    state.viewMode = 'front';
    state.selection = { colIndex: -1, rows: [] };
    state.hoveredColIndex = -1;
    state.activeEditCol = -1;
    state.blueprintCutouts = [];
    state.blueprintCellDimOffsets = {};
    state.blueprintDimOffsets = {};
    state.blueprintInternalDimsDefault = true;
    state.blueprintCellDimShown = {};
    state.blueprintColWidthDimsDefault = true;
    state.blueprintColWidthDimShown = {};
    state.roomWall = 'center';
    window._roomWall = 'center';

    window._closureEnabled = true;
    window._closureWidth = 1.8;
    window._closureWidthRight = 1.8;
    window._closureCeilWidth = 1.8;
    window._closureDepthWidth = 1.8;
    window._closureFrontLine = 'cabinet';

    // Clear draft part-color overrides (cart scopes are kept per other cabinets)
    if (state.partColors) {
        Object.keys(state.partColors).forEach(function(k) {
            if (k.indexOf('draft::') === 0) delete state.partColors[k];
        });
    }

    if (typeof _hideWingTab === 'function') {
        _hideWingTab('left');
        _hideWingTab('right');
    }

    const cabNameInp = document.getElementById('inp-cabinet-name');
    if (cabNameInp) cabNameInp.value = '';
    const cabNotesInp = document.getElementById('inp-cabinet-notes');
    if (cabNotesInp) cabNotesInp.value = '';
    const mNotes = document.getElementById('mobile-inp-cabinet-notes');
    if (mNotes) mNotes.value = '';
    const mName = document.getElementById('mobile-inp-cabinet-name');
    if (mName) mName.value = '';

    // Highlight linear preset + sync sidebar sections like applyPreset('linear')
    document.querySelectorAll('.preset-btn').forEach(function(btn) { btn.classList.remove('active'); });
    const linearBtn = document.querySelector('.preset-btn[onclick="applyPreset(\'linear\')"]');
    if (linearBtn) linearBtn.classList.add('active');
    const slidingBtn = document.getElementById('preset-btn-sliding');
    if (slidingBtn) slidingBtn.classList.remove('active');
    const ppm = document.getElementById('preset-position-menu');
    if (ppm) ppm.style.display = 'none';
    const sdSection = document.getElementById('sliding-door-section');
    const sideUnitSection = document.getElementById('side-unit-section');
    const cornerSection = document.getElementById('corner-unit-section');
    const plinthModelRow = document.getElementById('plinth-model-row');
    const mobilePlinthModelRow = document.getElementById('mobile-plinth-model-row');
    if (sdSection) sdSection.style.display = 'none';
    if (sideUnitSection) sideUnitSection.style.display = '';
    if (cornerSection) cornerSection.style.display = '';
    if (plinthModelRow) plinthModelRow.style.display = '';
    if (mobilePlinthModelRow) mobilePlinthModelRow.style.display = '';

    if (typeof _setFreeTabActive === 'function') _setFreeTabActive(true);
    if (typeof window._updateRoomWallUI === 'function') window._updateRoomWallUI();
    if (typeof syncSidebarToWing === 'function') syncSidebarToWing();
    if (typeof buildCabinet === 'function') buildCabinet();
    if (typeof updateCameraView === 'function') updateCameraView();
    if (typeof calculatePrice === 'function') calculatePrice();
};

window.applyPreset = function(presetId) {
    _pendingPresetId = presetId;
    _pendingWingPositions = { left: 'side', right: 'side' };

    if (presetId === 'linear' || presetId === 'sliding' || presetId === 'bathroom' || presetId === 'writing-desk') {
        // No position needed — apply immediately
        _applyPresetCore(presetId, null, null);
        const ppm = document.getElementById('preset-position-menu');
        if (ppm) ppm.style.display = 'none';
        return;
    }

    // Apply immediately with default 'side' position, then show sub-menu for adjustment
    _applyPresetCore(presetId, 'side', 'side');

    // Show position sub-menu
    const ppm = document.getElementById('preset-position-menu');
    const ppmSingle = document.getElementById('ppm-single');
    const ppmWalkin = document.getElementById('ppm-walkin');
    if (!ppm) return;

    // Reset button highlights
    document.querySelectorAll('.ppm-btn').forEach(b => b.classList.remove('active'));

    if (presetId === 'corner-right' || presetId === 'corner-left') {
        if (ppmSingle) ppmSingle.style.display = 'block';
        if (ppmWalkin) ppmWalkin.style.display = 'none';
        // Default: side active
        const sideBtn = document.getElementById('ppm-single-side');
        if (sideBtn) sideBtn.classList.add('active');
    } else if (presetId === 'walkin') {
        if (ppmSingle) ppmSingle.style.display = 'none';
        if (ppmWalkin) ppmWalkin.style.display = 'block';
        // Default: both side active
        const rs = document.getElementById('ppm-right-side');
        const ls = document.getElementById('ppm-left-side');
        if (rs) rs.classList.add('active');
        if (ls) ls.classList.add('active');
    }
    ppm.style.display = 'block';
};

// Called when user picks position for single-corner preset
window.applyPresetPosition = function(pos) {
    // Highlight selected button
    document.querySelectorAll('#ppm-single .ppm-btn').forEach(b => b.classList.remove('active'));
    const btn = document.getElementById(`ppm-single-${pos}`);
    if (btn) btn.classList.add('active');
    // Apply immediately — _applyPresetCore no longer hides the menu
    _applyPresetCore(_pendingPresetId, pos, pos);
    // Re-show the menu (it stays open while corner preset is selected)
    const ppm = document.getElementById('preset-position-menu');
    const ppmSingle = document.getElementById('ppm-single');
    const ppmWalkin = document.getElementById('ppm-walkin');
    if (ppm) ppm.style.display = 'block';
    if (ppmSingle) ppmSingle.style.display = 'block';
    if (ppmWalkin) ppmWalkin.style.display = 'none';
};

// Called when user picks position for one wing in walkin — applies immediately
window.setPendingWingPos = function(side, pos) {
    _pendingWingPositions[side] = pos;
    // Highlight selected button
    document.querySelectorAll(`#ppm-${side}-side, #ppm-${side}-front, #ppm-${side}-full_corner`).forEach(b => b.classList.remove('active'));
    const btn = document.getElementById(`ppm-${side}-${pos}`);
    if (btn) btn.classList.add('active');
    // Apply immediately with current pending positions
    _applyPresetCore('walkin', _pendingWingPositions.right, _pendingWingPositions.left);
    // If full_corner selected, ensure opposite wing exists
    if (pos === 'full_corner') {
        _ensureFullCornerOppositeWing(side);
    }
    // Re-show the walkin menu
    const ppm = document.getElementById('preset-position-menu');
    const ppmSingle = document.getElementById('ppm-single');
    const ppmWalkin = document.getElementById('ppm-walkin');
    if (ppm) ppm.style.display = 'block';
    if (ppmSingle) ppmSingle.style.display = 'none';
    if (ppmWalkin) ppmWalkin.style.display = 'block';
    // Restore button highlights (they get cleared by _applyPresetCore's querySelectorAll reset)
    document.querySelectorAll('.ppm-btn').forEach(b => b.classList.remove('active'));
    const rs = document.getElementById(`ppm-right-${_pendingWingPositions.right}`);
    const ls = document.getElementById(`ppm-left-${_pendingWingPositions.left}`);
    if (rs) rs.classList.add('active');
    if (ls) ls.classList.add('active');
    buildCabinet(); updateCameraView(); calculatePrice();
};

// Legacy: kept for backward compat (no longer shown in UI)
window.applyWalkinPositions = function() {
    _applyPresetCore('walkin', _pendingWingPositions.right, _pendingWingPositions.left);
};

// ---- Wing edit mode helpers ----
function _setFreeTabActive(isFree) {
    const freeTab = document.getElementById('wing-tab-free');
    if (freeTab) {
        freeTab.style.background = isFree ? 'var(--accent)' : 'var(--bg-light)';
        freeTab.style.color = isFree ? '#fff' : 'var(--text-dark)';
        freeTab.style.borderColor = isFree ? 'var(--accent)' : 'var(--border)';
    }
    document.querySelectorAll('.wing-tab-btn').forEach(b => {
        b.style.background = 'var(--bg-light)';
        b.style.color = 'var(--text-dark)';
        b.style.borderColor = 'var(--border)';
    });
    // When entering free mode, hide edit sections and show placeholder
    // (but not for linear/sliding — those are always in "edit" mode)
    if (isFree) {
        const _isSingle = (state.presetId === 'linear' || state.presetId === 'sliding');
        if (!_isSingle) {
            const _ec = document.getElementById('sidebar-edit-content');
            const _ph = document.getElementById('sidebar-edit-placeholder');
            if (_ec) _ec.style.display = 'none';
            if (_ph) _ph.style.display = 'flex';
        }
    }
}

function _setWingTabActive(wingId) {
    const freeTab = document.getElementById('wing-tab-free');
    if (freeTab) {
        freeTab.style.background = 'var(--bg-light)';
        freeTab.style.color = 'var(--text-dark)';
        freeTab.style.borderColor = 'var(--border)';
    }
    // For upperUnit_* wingIds, the tab has data-wing="upperUnit"
    const tabDataWing = (wingId && wingId.startsWith('upperUnit_')) ? 'upperUnit' : wingId;
    document.querySelectorAll('.wing-tab-btn').forEach(b => {
        const isActive = b.dataset.wing === tabDataWing;
        b.style.background = isActive ? 'var(--accent)' : 'var(--bg-light)';
        b.style.color = isActive ? '#fff' : 'var(--text-dark)';
        b.style.borderColor = isActive ? 'var(--accent)' : 'var(--border)';
    });
}

// ---- Wing edit mode ----
window.enterWingEditMode = function(wingId) {
    // Support full_corner_right / full_corner_left as special wingIds for the L-unit
    const isFCEdit = wingId === 'full_corner_right' || wingId === 'full_corner_left';
    const isSCEdit = wingId === 'sideCabinetRight' || wingId === 'sideCabinetLeft';

    if (isSCEdit) {
        // Delegate to enterSideCabinetEditMode with the correct side
        const scSide = wingId === 'sideCabinetRight' ? 'right' : 'left';
        enterSideCabinetEditMode(scSide);
        return;
    }

    // upperUnit_* are now handled inline — redirect to _enterUpperUnitEdit
    if (wingId && wingId.startsWith('upperUnit_')) {
        window._enterUpperUnitEdit();
        return;
    }

    const realSide = isFCEdit ? wingId.replace('full_corner_', '') : wingId;
    if (!state.wings[realSide]) return;

    // Save snapshot only when first entering edit mode (not when switching wings within edit mode)
    if (!state.wingEditMode) {
        state.wingEditSnapshot = JSON.parse(JSON.stringify({
            wings: state.wings,
            activeWing: state.activeWing
        }));
    }
    state.wingEditMode = true;
    state.activeWing = wingId;  // store full_corner_right / full_corner_left
    window._wingEditCamInit = true;
    // Hide room when entering wing edit mode (for performance and clarity)
    if (window._roomGroup) window._roomGroup.visible = false;
    // Switch to front view (3D for full corner so camera can orbit)
    state.viewMode = isFCEdit ? '3d' : 'front';
    window._orbitFree = false;
    // Update tab UI — highlight the active wing tab, deactivate free tab
    _setWingTabActive(isFCEdit ? realSide : wingId);
    // Show edit mode banner with appropriate label
    const banner = document.getElementById('wing-edit-banner');
    if (banner) {
        banner.style.display = 'flex';
        const bannerLabel = banner.querySelector('span');
        if (bannerLabel) {
            bannerLabel.innerHTML = isFCEdit
                ? '<i class="fa-solid fa-pen-to-square" style="margin-left:6px;color:#7eb8f7;"></i>מצב עריכת פינה מלאה'
                : '<i class="fa-solid fa-pen-to-square" style="margin-left:6px;color:#7eb8f7;"></i>מצב עריכת כנף';
        }
    }
    if (!isFCEdit) syncSidebarToWing();
    buildCabinet(); updateCameraView(); calculatePrice();
};

// Exit edit mode (free tab clicked)
window.exitWingEditMode = function() {
    if (state.wingEditMode) {
        window.confirmWingEdit();
    }
    // Restore room visibility when exiting wing edit mode (respect user toggle)
    if (window._roomGroup && window._roomVisible !== false) {
        window._roomGroup.visible = true;
    }
    // Activate free tab
    _setFreeTabActive(true);
};

window.confirmWingEdit = function() {
    // If we were editing a full_corner_*, restore activeWing to the real side
    if (state.activeWing === 'full_corner_right') state.activeWing = 'right';
    else if (state.activeWing === 'full_corner_left') state.activeWing = 'left';
    else if (state.activeWing === 'sideCabinetRight' || state.activeWing === 'sideCabinetLeft') state.activeWing = 'center';
    // Note: upperUnit_* are no longer set as activeWing — they use state._activeUpperUnit instead
    state.wingEditMode = false;
    state.wingEditSnapshot = null;
    const banner = document.getElementById('wing-edit-banner');
    if (banner) banner.style.display = 'none';
    // Restore free tab as active
    _setFreeTabActive(true);
    // Clear inline upper unit edit state
    state._activeUpperUnit = null;
    state._activeUpperUnitParent = null;
    const _uuBanner1 = document.getElementById('upper-unit-edit-banner');
    if (_uuBanner1) _uuBanner1.style.display = 'none';
    // Reset viewMode to 3d BEFORE buildCabinet so buildDimensionsAndButtonsUI
    // doesn't populate dimLayer with stale wing-edit dimensions
    state.viewMode = '3d';
    // Force camera animation back to default position (reset _orbitFree so updateCameraView animates)
    window._orbitFree = false;
    window._forceCameraAnim = true;
    window._corner3dCamPositioned = false;
    window._wingEditCamInit = false;
    saveHistoryState();
    buildCabinet(); calculatePrice();
    // Animate camera back to free/front view
    updateCameraView();
};

window.cancelWingEdit = function() {
    if (!state.wingEditSnapshot) { window.confirmWingEdit(); return; }
    // Restore snapshot — copy all keys from snapshot (includes upperUnit_* wings)
    const snapWings = state.wingEditSnapshot.wings;
    // Remove any upperUnit_* keys that didn't exist in snapshot
    Object.keys(state.wings).forEach(function(k) {
        if (k.startsWith('upperUnit_') && !snapWings[k]) delete state.wings[k];
    });
    // Restore all snapshot keys
    state.wings.center = snapWings.center;
    state.wings.left = snapWings.left;
    state.wings.right = snapWings.right;
    Object.keys(snapWings).forEach(function(k) {
        if (k.startsWith('upperUnit_')) state.wings[k] = snapWings[k];
    });
    state.activeWing = state.wingEditSnapshot.activeWing;
    state.wingEditMode = false;
    state.wingEditSnapshot = null;
    // Clear inline upper unit edit state
    state._activeUpperUnit = null;
    state._activeUpperUnitParent = null;
    const _uuBanner2 = document.getElementById('upper-unit-edit-banner');
    if (_uuBanner2) _uuBanner2.style.display = 'none';
    const banner = document.getElementById('wing-edit-banner');
    if (banner) banner.style.display = 'none';
    // Restore free tab as active
    _setFreeTabActive(true);
    syncSidebarToWing();
    buildCabinet(); updateCameraView(); calculatePrice();
};

function _showWingTab(side) {
    const tab = document.getElementById(`wing-tab-${side}`);
    if (tab) tab.style.display = '';
}
function _hideWingTab(side) {
    const tab = document.getElementById(`wing-tab-${side}`);
    if (tab) tab.style.display = 'none';
}

// ---- Sync sidebar inputs to current wing ----
window.syncSidebarToWing = function() {
    const w = getWing();
    if (!w) return;

    const _aw = state.activeWing;
    // _isUUEdit: true when the user is editing the upper unit inline (state._activeUpperUnit is set)
    const _isUUEdit = !!state._activeUpperUnit;
    const _parentWingId = _isUUEdit ? (state._activeUpperUnitParent || _aw) : _aw;

    // Show/hide edit content vs placeholder based on edit mode.
    // For linear/sliding presets there are no wing tabs — always show edit content.
    const _isSingleCabinet = (state.presetId === 'linear' || state.presetId === 'sliding' || state.presetId === 'bathroom' || state.presetId === 'writing-desk');
    const _editContent = document.getElementById('sidebar-edit-content');
    const _placeholder = document.getElementById('sidebar-edit-placeholder');
    const _isEditing = !!state.wingEditMode || _isSingleCabinet || _isUUEdit;
    if (_editContent) _editContent.style.display = _isEditing ? '' : 'none';
    if (_placeholder) _placeholder.style.display = _isEditing ? 'none' : 'flex';
    if (!_isEditing) return; // nothing to sync in free mode

    // Show/hide units-content-section (יחידות ותכולה)
    const _unitsSection = document.getElementById('units-content-section');
    const _isLinearOrSliding = (state.presetId === 'linear' || state.presetId === 'sliding');
    if (_unitsSection) {
        _unitsSection.style.display = (_isLinearOrSliding && !_isUUEdit) ? '' : 'none';
    }
    const _wrapUU = document.getElementById('wrap-upper-unit');
    if (_wrapUU) {
        _wrapUU.style.display = (_isLinearOrSliding && state.presetId !== 'sliding' && !_isUUEdit) ? '' : 'none';
    }
    if (_isLinearOrSliding && state.presetId !== 'sliding') {
            // Sync checkbox and sub-menu visibility
            const _uuKey = 'upperUnit_' + _parentWingId;
            const _uuExists = !!state.wings[_uuKey];
            const cb = document.getElementById('inp-upper-unit-enabled');
            if (cb) cb.checked = _uuExists;
            const wrap = document.getElementById('wrap-upper-unit');
            const btn = document.getElementById('btn-upper-unit-toggle');
            if (wrap) wrap.classList.toggle('open', _uuExists);
            if (btn) btn.classList.toggle('active', _uuExists);
            if (_uuExists) {
                const uuW = state.wings[_uuKey];
                const gapSlider = document.getElementById('inp-upper-gap');
                const gapNum = document.getElementById('inp-num-upper-gap');
                if (gapSlider) gapSlider.value = uuW._upperGap || 60;
                if (gapNum) gapNum.value = uuW._upperGap || 60;
            }
            // Sync the edit button text based on whether we're currently editing the upper unit
            const editBtn = document.getElementById('btn-edit-upper-unit');
            if (editBtn && _uuExists) {
                if (_isUUEdit) {
                    editBtn.innerHTML = '<i class="fa-solid fa-arrow-left"></i> חזור לארון תחתון';
                    editBtn.onclick = function() { window._exitUpperUnitEdit(); };
                    editBtn.style.background = 'linear-gradient(135deg,#fff0f0,#ffe0e0)';
                    editBtn.style.borderColor = '#e05050';
                    editBtn.style.color = '#e05050';
                } else {
                    editBtn.innerHTML = '<i class="fa-solid fa-pen-to-square"></i> ערוך יחידה עליונה';
                    editBtn.onclick = function() { window._enterUpperUnitEdit(); };
                    editBtn.style.background = 'linear-gradient(135deg,#f0f9ff,#e0f0ff)';
                    editBtn.style.borderColor = 'var(--accent)';
                    editBtn.style.color = 'var(--accent)';
                }
            }
    }
    if (typeof window._updateRoomWallUI === 'function') window._updateRoomWallUI();

    // Hide drawer-related UI when editing upper unit inline (no drawers for upper unit)
    const _drawerCountSection = document.getElementById('drawer-count-section');
    if (_drawerCountSection) _drawerCountSection.style.display = _isUUEdit ? 'none' : '';

    // When editing upper unit inline: update section title to indicate context
    const _cabinetSettingsTitle = document.querySelector('#sidebar-edit-content .section-title');
    if (_cabinetSettingsTitle) {
        _cabinetSettingsTitle.innerHTML = _isUUEdit
            ? '<i class="fa-solid fa-layer-group"></i> הגדרות יחידה עליונה'
            : '<i class="fa-solid fa-cubes"></i> הגדרות ארון';
    }

    // Hide plinth/placement/board-mat/handle-type rows when editing upper unit (not relevant)
    const _ppGrid = document.getElementById('plinth-placement-grid');
    if (_ppGrid) _ppGrid.style.display = _isUUEdit ? 'none' : '';
    const _boardMatRow = document.getElementById('board-mat-row');
    if (_boardMatRow) _boardMatRow.style.display = _isUUEdit ? 'none' : '';
    const _handleTypeRow = document.getElementById('handle-type-row');
    if (_handleTypeRow) _handleTypeRow.style.display = _isUUEdit ? 'none' : '';

    const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
    const setChecked = (id, v) => {
        const el = document.getElementById(id);
        if (el) el.checked = v;
        // Visual doors toggle is independent of hasDoors (saved design flag)
        if (id === 'inp-has-doors') {
            const mobileChk = document.getElementById('mobile-inp-has-doors');
            // Keep mobile "הצג חזיתות" aligned with display visibility, not hasDoors
            if (mobileChk && typeof window._doorsVisible === 'boolean') {
                mobileChk.checked = window._doorsVisible;
            }
            const doorsBtn = document.getElementById('btn-toggle-doors');
            if (doorsBtn && typeof window._doorsVisible === 'boolean') {
                doorsBtn.classList.toggle('toggled-off', !window._doorsVisible);
            }
        }
    };

    setVal('inp-num-width', w.width); setVal('inp-width', w.width);
    setVal('inp-num-height', w.globalHeight); setVal('inp-height', w.globalHeight);
    setVal('inp-num-depth', w.depth); setVal('inp-depth', w.depth);
    setVal('inp-plinth', w.cabinetModel || 'maya');
    setVal('inp-placement', w.placement || 'wall');
    setVal('inp-board-mat', w.boardMaterial);
    setVal('inp-columns', w.columns.length);
    const valCols = document.getElementById('val-columns'); if (valCols) valCols.innerText = w.columns.length;
    // For sliding wardrobes: hide the column slider (columns are auto-managed = 1 per door)
    const _isSlidingWard = state.presetId === 'sliding' && w.slidingDoor && w.slidingDoor.enabled;
    const colGroup = document.getElementById('header-columns-card');
    if (colGroup) colGroup.style.display = _isSlidingWard ? 'none' : '';
    setChecked('inp-has-doors', w.hasDoors !== false);
    // Soft-repair projects saved with visual-hide wrongly stored as hasDoors=false
    if (w.hasDoors === false && Array.isArray(w.columns) &&
        w.columns.some(function(c) { return c && c.doors && c.doors.length > 0; })) {
        w.hasDoors = true;
        setChecked('inp-has-doors', true);
    }
    setVal('inp-handle-type', w.handleType || '');
    const _hs = w.handleStyle || 'pipe';
    document.querySelectorAll('.handle-style-btn:not(.corner-desk-handle-btn)').forEach(b => {
        b.classList.toggle('active', b.dataset.style === _hs);
    });
    document.querySelectorAll('.mobile-handle-style-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.style === _hs);
    });
    setVal('inp-cabinet-name', w.cabinetName || '');
    setVal('inp-cabinet-notes', w.cabinetNotes || '');
    setVal('inp-wing-position', w.wingPosition || 'side');
    // Show/hide wing position selector only for left/right wings (not for upper unit edit)
    const wingPosRow = document.getElementById('wing-position-row');
    const _showWingPos = !_isUUEdit && (state.activeWing === 'left' || state.activeWing === 'right');
    if (wingPosRow) wingPosRow.style.display = _showWingPos ? 'block' : 'none';

    // Side unit type selector (שולחן צד / ארון צד הפוך)
    const hasSC = w.sideCabinet && w.sideCabinet.side !== 'none';
    const hasDeskSide = w.desk && w.desk.side !== 'none';
    // Determine which type is active
    let sideUnitType = 'none';
    if (hasDeskSide) sideUnitType = 'desk';
    else if (hasSC) sideUnitType = 'side_cabinet';
    setVal('inp-side-unit-type', sideUnitType);
    const deskSection = document.getElementById('desk-section');
    const scSection = document.getElementById('side-cabinet-section');
    if (deskSection) deskSection.style.display = (sideUnitType === 'desk') ? 'block' : 'none';
    if (scSection) scSection.style.display = (sideUnitType === 'side_cabinet') ? 'block' : 'none';
    // Update side-unit-btn active states (for undo/redo/autosave restore)
    document.querySelectorAll('.side-unit-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.type === sideUnitType);
    });
    // Update desk-side-btn active states
    if (hasDeskSide) {
        document.querySelectorAll('.desk-side-btn').forEach(b => {
            b.classList.toggle('active', b.dataset.side === w.desk.side);
        });
    }
    // Update sc-side checkboxes
    if (hasSC) {
        const sc = w.sideCabinet;
        const scSide = sc.side || 'right';
        const chkRight = document.getElementById('sc-chk-right');
        const chkLeft  = document.getElementById('sc-chk-left');
        if (chkRight) chkRight.checked = (scSide === 'right' || scSide === 'both');
        if (chkLeft)  chkLeft.checked  = (scSide === 'left'  || scSide === 'both');
        if (typeof window._syncSCsideBtns === 'function') window._syncSCsideBtns();
    }

    // Desk
    setVal('inp-desk-side', w.desk ? w.desk.side : 'none');
    setChecked('inp-desk-drawers', w.desk ? w.desk.hasDrawers : false);
    // Sync desk drawers button-style UI (CSS handles styling via .active class)
    (function() {
        const hasD = w.desk ? !!w.desk.hasDrawers : false;
        document.querySelectorAll('.desk-drawers-btn').forEach(function(b) {
            b.classList.toggle('active', (b.dataset.drawers === 'true') === hasD);
        });
    })();
    setVal('inp-num-desk-width', w.desk ? w.desk.width : 100);
    setVal('inp-desk-width', w.desk ? w.desk.width : 100);
    // Sync side desk drawer count
    (function() {
        const dc = (w.desk && w.desk.drawerCount != null) ? w.desk.drawerCount : _autoSideDeskDrawerCount(w.desk ? w.desk.width : 100);
        setVal('inp-side-desk-drawer-count', dc);
        const valEl = document.getElementById('val-side-desk-drawer-count');
        if (valEl) valEl.textContent = dc;
        const dcRow = document.getElementById('side-desk-drawer-count-row');
        if (dcRow) dcRow.style.display = (w.desk && w.desk.hasDrawers && w.desk.side !== 'none') ? 'block' : 'none';
    })();
    const deskControls = document.getElementById('desk-controls');
    if (deskControls) deskControls.style.display = (w.desk && w.desk.side !== 'none') ? 'block' : 'none';

    // Side Cabinet
    if (hasSC) {
        _syncSideCabinetDoorMaterial(w);
        _syncSideCabinetUI(w.sideCabinet);
    }

    // Corner — sync icon buttons + controls
    const cuSide = (w.corner && w.corner.side) || 'none';
    setVal('inp-corner-side', cuSide);
    document.querySelectorAll('.corner-side-btn').forEach(b => {
        const isActive = b.dataset.side === cuSide;
        b.classList.toggle('active', isActive);
        b.style.background = isActive ? 'var(--accent)' : 'var(--bg-light)';
        b.style.color = isActive ? 'white' : 'var(--text-dark)';
        b.style.borderColor = isActive ? 'var(--accent)' : 'var(--border)';
    });
    const cuControls = document.getElementById('corner-controls');
    if (cuControls) cuControls.style.display = (cuSide !== 'none') ? 'block' : 'none';
    if (w.corner && cuSide !== 'none') {
        const cuType = w.corner.type || 'drawers';
        setVal('inp-corner-type', cuType);
        document.querySelectorAll('.corner-type-btn').forEach(b => {
            const isActive = b.dataset.type === cuType;
            b.classList.toggle('active', isActive);
            b.style.background = isActive ? 'var(--accent)' : 'var(--bg-light)';
            b.style.color = isActive ? 'white' : 'var(--text-dark)';
            b.style.borderColor = isActive ? 'var(--accent)' : 'var(--border)';
        });
        setVal('inp-corner-width', w.corner.width || 60); setVal('inp-num-corner-width', w.corner.width || 60);
        setVal('inp-corner-height', w.corner.height || 90); setVal('inp-num-corner-height', w.corner.height || 90);
        setVal('inp-corner-depth', w.corner.depth || 54); setVal('inp-num-corner-depth', w.corner.depth || 54);
        const cuDrawerSection = document.getElementById('corner-drawer-section');
        if (cuDrawerSection) cuDrawerSection.style.display = (cuType === 'drawers') ? 'block' : 'none';
        if (cuType === 'drawers') {
            const cuDCEl = document.getElementById('val-corner-drawers');
            if (cuDCEl) cuDCEl.innerText = w.corner.drawerCount || 4;
            setVal('inp-corner-drawers', w.corner.drawerCount || 4);
        }
        const cuDeskDrawerSection = document.getElementById('corner-desk-drawer-section');
        if (cuDeskDrawerSection) cuDeskDrawerSection.style.display = (cuType === 'desk') ? 'block' : 'none';
        if (cuType === 'desk') {
            const cuDDCEl = document.getElementById('val-corner-desk-drawers');
            if (cuDDCEl) cuDDCEl.innerText = w.corner.deskDrawerCount || 0;
            setVal('inp-corner-desk-drawers', w.corner.deskDrawerCount || 0);
            const ddCount = w.corner.deskDrawerCount || 0;
            const ddHRow = document.getElementById('corner-desk-drawer-height-row');
            if (ddHRow) ddHRow.style.display = ddCount > 0 ? 'block' : 'none';
            const ddH = w.corner.deskDrawerHeight || 13;
            const ddHEl = document.getElementById('val-corner-desk-drawer-height');
            if (ddHEl) ddHEl.innerText = ddH + ' ס"מ';
            setVal('inp-corner-desk-drawer-height', ddH);
            const floatBtn = document.getElementById('corner-desk-float-btn');
            if (floatBtn) {
                const isFloat = !!w.corner.deskFloating;
                floatBtn.classList.toggle('active', isFloat);
                floatBtn.style.background = isFloat ? 'var(--accent)' : 'var(--bg-light)';
                floatBtn.style.color = isFloat ? 'white' : 'var(--text-dark)';
                floatBtn.style.borderColor = isFloat ? 'var(--accent)' : 'var(--border)';
            }
            if (typeof window._syncCornerDeskHandleUI === 'function') window._syncCornerDeskHandleUI(w);
        }
    }

    // ---- Sliding door UI sync ----
    const isSliding = state.presetId === 'sliding';
    const isWingPreset = state.presetId === 'corner-right' || state.presetId === 'corner-left' || state.presetId === 'walkin';
    const sdSection = document.getElementById('sliding-door-section');
    const sideUnitSectionEl = document.getElementById('side-unit-section');
    const cornerSectionEl = document.getElementById('corner-unit-section');
    const mobileSlidingSection = document.getElementById('mobile-sliding-section');
    const plinthModelRowEl = document.getElementById('plinth-model-row');
    const mobilePlinthModelRowEl = document.getElementById('mobile-plinth-model-row');
    if (sdSection) sdSection.style.display = (isSliding && !_isUUEdit) ? '' : 'none';
    if (sideUnitSectionEl) sideUnitSectionEl.style.display = (isSliding || _isUUEdit) ? 'none' : '';
    if (cornerSectionEl) cornerSectionEl.style.display = (isSliding || isWingPreset || _isUUEdit) ? 'none' : '';
    if (mobileSlidingSection) mobileSlidingSection.style.display = isSliding ? '' : 'none';
    if (plinthModelRowEl) plinthModelRowEl.style.display = isSliding ? 'none' : '';
    if (mobilePlinthModelRowEl) mobilePlinthModelRowEl.style.display = isSliding ? 'none' : '';
    if (isSliding && w.slidingDoor) {
        const sd = w.slidingDoor;
        // Auto-recalculate door count if not manually set
        if (!sd.manualNumDoors) {
            sd.numDoors = _calcSlidingDoorCount(w.width);
        }
        const sdDoorEl = document.getElementById('inp-sd-doors');
        const sdDoorLbl = document.getElementById('val-sd-doors');
        const mobileSdDoorLbl = document.getElementById('mobile-val-sd-doors');
        if (sdDoorEl) sdDoorEl.value = sd.numDoors;
        if (sdDoorLbl) sdDoorLbl.innerText = sd.numDoors;
        if (mobileSdDoorLbl) mobileSdDoorLbl.innerText = sd.numDoors;
        // Profile color buttons
        document.querySelectorAll('.sd-profile-btn').forEach(b => {
            const isActive = b.dataset.color === sd.profileColor;
            b.style.outline = isActive ? '2.5px solid var(--accent)' : '';
            b.style.outlineOffset = isActive ? '2px' : '';
        });
        // Per-door panel tabs — rebuild dynamically
        if (typeof window._rebuildDoorPanelTabs === 'function') window._rebuildDoorPanelTabs();
    }
    // Highlight sliding preset buttons (desktop + mobile)
    const slidingPresetBtn = document.getElementById('preset-btn-sliding');
    if (slidingPresetBtn) slidingPresetBtn.classList.toggle('active', isSliding);
    const mobileSlidingPresetBtn = document.getElementById('mobile-preset-btn-sliding');
    if (mobileSlidingPresetBtn) mobileSlidingPresetBtn.classList.toggle('active', isSliding);
    // Also sync all mobile preset buttons
    if (isSliding) {
        document.querySelectorAll('.preset-btn').forEach(b => {
            const isThisSliding = b.id === 'preset-btn-sliding' || b.id === 'mobile-preset-btn-sliding';
            b.classList.toggle('active', isThisSliding);
        });
    }

    // Materials
    document.querySelectorAll('.part-tab-btn').forEach(b => b.classList.remove('active'));
    const activePartBtn = document.querySelector(`.part-tab-btn[data-part="${w.activeColorPart || 'materialBody'}"]`);
    if (activePartBtn) activePartBtn.classList.add('active');
    document.querySelectorAll('.material-btn').forEach(b => b.classList.remove('active'));
    const currentMat = w[w.activeColorPart || 'materialBody'];
    const matBtn = document.querySelector(`.material-btn[data-mat="${currentMat}"]`);
    if (matBtn) matBtn.classList.add('active');

    // Dynamic tab visibility: show/hide tabs based on what's in the cabinet
    _updateMaterialTabVisibility(w);
    // Show/hide sandwich-only colors based on board material
    if (typeof window._updateSandwichColorVisibility === 'function') window._updateSandwichColorVisibility();

    _syncDimPills();
    if (typeof window._syncAllRangeFills === 'function') window._syncAllRangeFills();
};

function _compHasOpenCell(comp) {
    if (!comp) return false;
    if (comp.type === 'open_cell' || comp.type === 'side_open_cell') return true;
    if (Array.isArray(comp.zoneDoorGroups) &&
        comp.zoneDoorGroups.some(g => g && g.type === 'honeycomb')) return true;
    if (!Array.isArray(comp.subCells)) return false;
    return comp.subCells.some(sub => {
        if (!sub) return false;
        if (sub.type === 'honeycomb' || sub.type === 'open_cell' || sub.type === 'side_open_cell') return true;
        return Array.isArray(sub.zonesType) &&
            sub.zonesType.some(zt => zt === 'honeycomb' || zt === 'open_cell' || zt === 'side_open_cell');
    });
}

window._activateColorPartTab = function(part) {
    const w = getWing();
    if (!w || !part) return;
    w.activeColorPart = part;
    document.querySelectorAll('.part-tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll(`.part-tab-btn[data-part="${part}"]`).forEach(b => b.classList.add('active'));
    if (typeof window._updateSandwichColorVisibility === 'function') window._updateSandwichColorVisibility();
    document.querySelectorAll('.material-btn').forEach(b => b.classList.remove('active'));
    const currentMat = w[part];
    const matBtn = document.querySelector(`.material-btn[data-mat="${currentMat}"]`);
    if (matBtn) matBtn.classList.add('active');
    else if (currentMat === 'custom') {
        const uploadBtn = document.getElementById('btn-upload-texture');
        if (uploadBtn) uploadBtn.classList.add('active');
    }
};

window._updateMaterialTabVisibility = function(w) {
    if (!w) w = getWing();
    if (!w) return;

    const _partTabDefaultLabels = {
        materialBody:     ['גוף וצוקל', 'גוף'],
        materialInternal: ['מדפים ופנים', 'פנים'],
        materialBack:     ['גב ארון', 'גב'],
        materialExternal: ['חזיתות', 'חזיתות'],
        materialDesk:     ['שולחן', 'שולחן'],
        materialOpenCell: ['כוורת', 'כוורת'],
        materialSideCabinet: ['ארון צד', 'ארון צד'],
        materialTopPanel: ['משטח', 'משטח'],
        materialUpperUnit: ['חלק עליון', 'חלק עליון'],
    };
    const _applyPartTabLabels = (labelMap) => {
        document.querySelectorAll('.part-tab-btn[data-part]').forEach(btn => {
            const part = btn.getAttribute('data-part');
            const lbl = labelMap[part];
            if (!lbl) return;
            const isMobile = !!btn.closest('.mobile-panel-body');
            btn.textContent = isMobile ? lbl[1] : lbl[0];
        });
    };

    // Writing desk: only body (legs + surface) and drawers
    if (state.presetId === 'writing-desk') {
        _applyPartTabLabels({
            materialBody: ['גוף', 'גוף'],
            materialExternal: ['מגירות', 'מגירות'],
        });
        document.querySelectorAll('.part-tab-btn[data-part]').forEach(btn => {
            const part = btn.getAttribute('data-part');
            btn.style.display = (part === 'materialBody' || part === 'materialExternal') ? '' : 'none';
        });
        const activePart = (w.activeColorPart === 'materialExternal') ? 'materialExternal' : 'materialBody';
        w.activeColorPart = activePart;
        document.querySelectorAll('.part-tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll(`.part-tab-btn[data-part="${activePart}"]`).forEach(b => b.classList.add('active'));
        document.querySelectorAll('.material-btn').forEach(b => b.classList.remove('active'));
        const currentMat = w[activePart] || w.materialBody || 'white_matte';
        const matBtn = document.querySelector(`.material-btn[data-mat="${currentMat}"]`);
        if (matBtn) matBtn.classList.add('active');
        return;
    }

    _applyPartTabLabels(_partTabDefaultLabels);

    // _isUUEdit: true when editing upper unit inline
    const _isUUEdit = !!state._activeUpperUnit;
    const _aw = state.activeWing;

    // Check what features exist
    const hasDesk = (w.desk && w.desk.side !== 'none') ||
                    (w.columns && w.columns.some(c => c.type === 'desk')) ||
                    (w.corner && w.corner.side !== 'none' && w.corner.type === 'desk');
    const hasOpenCell = w.columns && w.columns.some(col =>
        col.compartments && col.compartments.some(comp => _compHasOpenCell(comp)));
    const hasDoors = w.hasDoors;
    const hasExternalDrawers = w.columns && w.columns.some(col =>
        col.compartments && col.compartments.some(comp =>
            comp && comp.type === 'external_drawers'));
    const hasFronts = hasDoors || hasExternalDrawers;

    const hasSideCabinet = !!(w.sideCabinet && w.sideCabinet.side !== 'none' && w.sideCabinet.side !== undefined);

    // Top panel color tab: show when any column has topPanel enabled
    const hasTopPanel = !!(w.columns && w.columns.some(col => col.topPanel));

    // Upper unit color tab: show when NOT editing the upper unit inline and an upper unit exists for current wing
    const hasUpperUnit = !_isUUEdit && !!state.wings['upperUnit_' + _aw];

    // Tab IDs: desktop and mobile
    const tabMap = {
        'tab-materialExternal':     hasFronts,
        'mob-tab-materialExternal': hasFronts,
        'tab-materialDesk':         hasDesk,
        'mob-tab-materialDesk':     hasDesk,
        'tab-materialOpenCell':     hasOpenCell,
        'mob-tab-materialOpenCell': hasOpenCell,
        'tab-materialSideCabinet':     hasSideCabinet,
        'mob-tab-materialSideCabinet': hasSideCabinet,
        'tab-materialTopPanel':     hasTopPanel,
        'mob-tab-materialTopPanel': hasTopPanel,
        'tab-materialUpperUnit':    hasUpperUnit,
    };

    Object.entries(tabMap).forEach(([id, visible]) => {
        const el = document.getElementById(id);
        if (el) el.style.display = visible ? '' : 'none';
    });

    // If active tab is now hidden, switch to materialBody
    const activePart = w.activeColorPart || 'materialBody';
    const activeTabEl = document.querySelector(`.part-tab-btn[data-part="${activePart}"]`);
    if (activeTabEl && activeTabEl.style.display === 'none') {
        w.activeColorPart = 'materialBody';
        document.querySelectorAll('.part-tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll(`.part-tab-btn[data-part="materialBody"]`).forEach(b => b.classList.add('active'));
        document.querySelectorAll('.material-btn').forEach(b => b.classList.remove('active'));
        const fallbackMat = w.materialBody;
        const fallbackBtn = document.querySelector(`.material-btn[data-mat="${fallbackMat}"]`);
        if (fallbackBtn) fallbackBtn.classList.add('active');
    }
};

// ---- Apply material to upper unit (both body and external) ----
window.applyUpperUnitMaterial = function(matKey) {
    // Use _activeUpperUnit if set, otherwise fall back to activeWing
    const uuKey = state._activeUpperUnit || ('upperUnit_' + state.activeWing);
    const uuWing = state.wings[uuKey];
    if (!uuWing) return;
    uuWing.materialBody = matKey;
    uuWing.materialExternal = matKey;
    uuWing.materialInternal = matKey;
    uuWing.materialBack = matKey;
    buildCabinet(); calculatePrice(); saveHistoryState();
};

// ==========================================
// History
// ==========================================
const MAX_HISTORY = 20;

const _COMP_TYPE_LABELS = {
    empty: 'ריק',
    hanging: 'תלייה',
    internal_drawers: 'מגירות פנימיות',
    external_drawers: 'מגירות חיצוניות',
    open_cell: 'תא פתוח',
    side_open_cell: 'תא פתוח צד',
    honeycomb: 'כוורת',
    partition: 'מחיצה',
    flap: 'דלת קיפ',
    sliding: 'דלת הזזה',
    door: 'דלת'
};

function _historyWingSnap(snap, wingKey) {
    if (!snap || !snap.wings) return null;
    return snap.wings[wingKey || snap.activeWing || 'center'] || snap.wings.center || null;
}

function _computeHistoryLabel(prevSnap, nextSnap) {
    if (!prevSnap) return 'מצב התחלתי';

    const pw = _historyWingSnap(prevSnap, 'center');
    const nw = _historyWingSnap(nextSnap, 'center');

    if (pw && nw) {
        if (Math.round(pw.width || 0) !== Math.round(nw.width || 0)) {
            return 'שינוי רוחב ל-' + Math.round(nw.width) + ' ס"מ';
        }
        if (Math.round(pw.globalHeight || 0) !== Math.round(nw.globalHeight || 0)) {
            return 'שינוי גובה ל-' + Math.round(nw.globalHeight) + ' ס"מ';
        }
        if (Math.round(pw.depth || 0) !== Math.round(nw.depth || 0)) {
            return 'שינוי עומק ל-' + Math.round(nw.depth) + ' ס"מ';
        }
        if ((pw.columns || []).length !== (nw.columns || []).length) {
            return 'שינוי ל-' + (nw.columns || []).length + ' עמודות';
        }
        if (pw.hasDoors !== nw.hasDoors) return nw.hasDoors ? 'הצגת דלתות' : 'הסתרת דלתות';
        if (pw.handleStyle !== nw.handleStyle) return 'שינוי סגנון ידית';
        if (pw.boardMaterial !== nw.boardMaterial) return 'שינוי חומר לוח';
        if (pw.materialBody !== nw.materialBody || pw.materialExternal !== nw.materialExternal) return 'שינוי חומר';
        if (JSON.stringify(pw.desk || {}) !== JSON.stringify(nw.desk || {})) return 'שינוי שולחן';
        if (JSON.stringify(pw.corner || {}) !== JSON.stringify(nw.corner || {})) return 'שינוי יחידה פינתית';
        if (JSON.stringify(pw.sideCabinet || {}) !== JSON.stringify(nw.sideCabinet || {})) return 'שינוי ארון צד';

        for (let ci = 0; ci < (nw.columns || []).length; ci++) {
            const pc = (pw.columns || [])[ci];
            const nc = nw.columns[ci];
            if (!pc || !nc) continue;
            if (pc.type !== nc.type) {
                if (nc.type === 'desk') return 'הוספת שולחן פנימי';
                return 'שינוי עמודה';
            }
            const ps = (pc.shelvesY || []).length;
            const ns = (nc.shelvesY || []).length;
            if (ps !== ns) return ns > ps ? 'הוספת מדף' : 'הסרת מדף';
            for (let ri = 0; ri < (nc.compartments || []).length; ri++) {
                const pComp = (pc.compartments || [])[ri];
                const nComp = (nc.compartments || [])[ri];
                if (pComp && nComp && pComp.type !== nComp.type) {
                    return 'שינוי תא: ' + (_COMP_TYPE_LABELS[nComp.type] || nComp.type);
                }
            }
        }
    }

    if (prevSnap.presetId !== nextSnap.presetId) return 'שינוי פריסה';
    if (prevSnap.activeWing !== nextSnap.activeWing) return 'שינוי כנף פעילה';
    if (JSON.stringify(prevSnap.partColors || {}) !== JSON.stringify(nextSnap.partColors || {})) return 'שינוי צבע';
    if (!prevSnap.wings.left && nextSnap.wings.left) return 'הוספת כנף שמאל';
    if (prevSnap.wings.left && !nextSnap.wings.left) return 'הסרת כנף שמאל';
    if (!prevSnap.wings.right && nextSnap.wings.right) return 'הוספת כנף ימין';
    if (prevSnap.wings.right && !nextSnap.wings.right) return 'הסרת כנף ימין';

    return 'עריכה';
}

function _makeHistorySnapshot() {
    return JSON.parse(JSON.stringify({
        activeWing: state.activeWing,
        presetId: state.presetId,
        wings: state.wings,
        partColors: state.partColors || {}
    }));
}

function saveHistoryState(optionalLabel) {
    if (state.isRestoring) return;
    if (state.historyIndex < state.history.length - 1) {
        state.history = state.history.slice(0, state.historyIndex + 1);
    }

    const prevSnap = state.historyIndex >= 0 ? state.history[state.historyIndex] : null;
    const snapshot = _makeHistorySnapshot();
    snapshot._historyLabel = optionalLabel || _computeHistoryLabel(prevSnap, snapshot);

    state.history.push(snapshot);
    if (state.history.length > MAX_HISTORY) state.history.shift();
    state.historyIndex = state.history.length - 1;
    updateUndoRedoUI();
}

window.saveHistoryState = saveHistoryState;

function _updateHistoryPanelUI() {
    const list = document.getElementById('history-list');
    const countEl = document.getElementById('history-panel-count');
    if (!list) return;

    list.innerHTML = '';
    if (!state.history.length) {
        list.innerHTML = '<div class="history-empty">אין פעולות עדיין</div>';
        if (countEl) countEl.textContent = '';
        return;
    }

    if (countEl) {
        countEl.textContent = (state.historyIndex + 1) + ' / ' + state.history.length;
    }

    state.history.forEach(function(snap, i) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'history-item' +
            (i === state.historyIndex ? ' active' : '') +
            (i > state.historyIndex ? ' future' : '');
        btn.textContent = snap._historyLabel || ('פעולה ' + (i + 1));
        btn.title = snap._historyLabel || '';
        btn.onclick = function(ev) {
            ev.stopPropagation();
            window.jumpToHistory(i);
        };
        list.appendChild(btn);
    });

    const activeEl = list.querySelector('.history-item.active');
    if (activeEl) activeEl.scrollIntoView({ block: 'nearest' });
}

function _positionHistoryPanel(anchorEl) {
    const panel = document.getElementById('history-panel');
    if (!panel || !anchorEl) return;
    const r = anchorEl.getBoundingClientRect();
    const panelW = 280;
    let left = r.left + (r.width / 2) - (panelW / 2);
    left = Math.max(8, Math.min(left, window.innerWidth - panelW - 8));
    panel.style.top = (r.bottom + 8) + 'px';
    panel.style.left = left + 'px';
    panel.style.width = panelW + 'px';
}

function _historyOutsideClick(e) {
    const panel = document.getElementById('history-panel');
    if (!panel || !panel.classList.contains('open')) return;
    const anchors = ['btn-history', 'mbtn-history', 'mbtn-history2'];
    if (anchors.some(function(id) {
        const el = document.getElementById(id);
        return el && (el === e.target || el.contains(e.target));
    })) return;
    if (!panel.contains(e.target)) window.closeHistoryPanel();
}

window.toggleHistoryPanel = function(ev) {
    if (ev && ev.stopPropagation) ev.stopPropagation();
    const panel = document.getElementById('history-panel');
    if (!panel) return;

    if (panel.classList.contains('open')) {
        window.closeHistoryPanel();
        return;
    }

    _updateHistoryPanelUI();
    const anchor = document.getElementById('btn-history') ||
        document.getElementById('mbtn-history2') ||
        document.getElementById('mbtn-history');
    _positionHistoryPanel(anchor);
    panel.classList.add('open');

    ['btn-history', 'mbtn-history', 'mbtn-history2'].forEach(function(id) {
        const el = document.getElementById(id);
        if (el) el.classList.add('active');
    });

    setTimeout(function() {
        document.addEventListener('click', _historyOutsideClick, true);
    }, 0);
};

window.closeHistoryPanel = function() {
    const panel = document.getElementById('history-panel');
    if (panel) panel.classList.remove('open');
    document.removeEventListener('click', _historyOutsideClick, true);
    ['btn-history', 'mbtn-history', 'mbtn-history2'].forEach(function(id) {
        const el = document.getElementById(id);
        if (el) el.classList.remove('active');
    });
};

window.jumpToHistory = function(index) {
    if (index < 0 || index >= state.history.length) return;
    if (index === state.historyIndex) {
        window.closeHistoryPanel();
        return;
    }
    state.historyIndex = index;
    restoreHistoryState();
    window.closeHistoryPanel();
};

// No-op: localStorage autosave is disabled. Projects are saved to Supabase only.
window._restoreFromLocalStorage = function() { return false; };

// Clean up any old autosave keys left in localStorage from previous versions
try {
    Object.keys(localStorage).forEach(function(k) {
        if (k === 'cabinet_autosave' || k.startsWith('cabinet_autosave_')) {
            localStorage.removeItem(k);
        }
    });
} catch(e) {}

window.undo = function() {
    if (state.historyIndex > 0) { state.historyIndex--; restoreHistoryState(); }
};

window.redo = function() {
    if (state.historyIndex < state.history.length - 1) { state.historyIndex++; restoreHistoryState(); }
};

window.resetCurrentCabinet = function() {
    if(!confirm('האם לאפס את הארון הנוכחי? כל המידות והחלוקות הפנימיות יימחקו.')) return;
    
    const w = getWing();
    w.cabinetModel = 'c9';
    w.placement = 'wall';
    w.width = 160; w.globalHeight = 240; w.depth = 54;
    w.plinthHeight = 8.75; w.hasDoors = true; w.handleType = ''; w.handleStyle = 'pipe'; w.cabinetName = ''; w.cabinetNotes = '';
    w.boardMaterial = 'melamine'; w.materialBody = 'white_matte'; w.materialInternal = 'white_matte';
    w.materialExternal = 'white_matte'; w.materialDesk = 'white_matte'; w.materialOpenCell = 'white_matte'; w.materialBack = 'white_matte';
    w.materialSideCabinet = 'white_matte';
    w.desk = { side: 'none', width: 100, height: 80, hasDrawers: true, drawerHeight: 12, drawerCount: null };
    w.corner = { side: 'none', width: 60, height: 90, depth: 54, type: 'shelves', shelves: 3, drawerCount: 4 };
    w.sideCabinet = null;
    w.manualPrice = null;
    
    distributeColumns(2);
    syncSidebarToWing();

    // Reset corner unit UI — sync icon buttons to 'none'
    document.querySelectorAll('.corner-side-btn').forEach(b => {
        const isActive = b.dataset.side === 'none';
        b.classList.toggle('active', isActive);
        b.style.background = isActive ? 'var(--accent)' : 'var(--bg-light)';
        b.style.color = isActive ? 'white' : 'var(--text-dark)';
        b.style.borderColor = isActive ? 'var(--accent)' : 'var(--border)';
    });
    const cuSideEl2 = document.getElementById('inp-corner-side');
    if (cuSideEl2) cuSideEl2.value = 'none';
    const cuControls2 = document.getElementById('corner-controls');
    if (cuControls2) cuControls2.style.display = 'none';

    // Reset side unit UI
    const suTypeEl = document.getElementById('inp-side-unit-type');
    if (suTypeEl) suTypeEl.value = 'none';
    const deskSec = document.getElementById('desk-section');
    if (deskSec) deskSec.style.display = 'none';
    const scSec = document.getElementById('side-cabinet-section');
    if (scSec) scSec.style.display = 'none';

    // Reset room wall position
    state.roomWall   = 'center';
    window._roomWall = 'center';
    if (typeof window._updateRoomWallUI === 'function') window._updateRoomWallUI();

    buildCabinet(); updateCameraView(); calculatePrice(); saveHistoryState();
};

function restoreHistoryState() {
    state.isRestoring = true;
    const snapshot = JSON.parse(JSON.stringify(state.history[state.historyIndex]));
    
    // Always exit wing edit mode when restoring history (prevents stale wingEditMode)
    state.wingEditMode = false;
    state.wingEditSnapshot = null;
    // Clear inline upper unit edit state
    state._activeUpperUnit = null;
    state._activeUpperUnitParent = null;
    const _uuBanner4 = document.getElementById('upper-unit-edit-banner');
    if (_uuBanner4) _uuBanner4.style.display = 'none';

    // Restore wings (including any upperUnit_* wings)
    // First remove any upperUnit_* keys not in snapshot
    Object.keys(state.wings).forEach(function(k) {
        if (k.startsWith('upperUnit_') && !snapshot.wings[k]) delete state.wings[k];
    });
    state.wings.center = snapshot.wings.center;
    state.wings.left = snapshot.wings.left;
    state.wings.right = snapshot.wings.right;
    // Restore upperUnit_* wings from snapshot
    Object.keys(snapshot.wings).forEach(function(k) {
        if (k.startsWith('upperUnit_')) state.wings[k] = snapshot.wings[k];
    });
    state.activeWing = snapshot.activeWing || 'center';
    // Restore presetId (needed for sliding wardrobe)
    if (snapshot.presetId) state.presetId = snapshot.presetId;
    // Restore per-part color overrides
    state.partColors = snapshot.partColors ? JSON.parse(JSON.stringify(snapshot.partColors)) : {};

    // Reset viewMode based on preset type (prevents stale 3d view when undoing to a linear cabinet)
    const _snapPreset = state.presetId || 'linear';
    const _snapIsLinear = (_snapPreset === 'linear' || _snapPreset === 'sliding');
    state.viewMode = _snapIsLinear ? 'front' : '3d';
    window._orbitFree = false;
    window._forceCameraAnim = true;
    window._corner3dCamPositioned = false;
    window._frontCamPositioned = false;
    window._wingEditCamInit = false;
    // Sync view button highlights
    document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
    const _snapViewBtn = document.getElementById('btn-front-view');
    if (_snapViewBtn) _snapViewBtn.classList.add('active');
    const _snapResetBtn = document.getElementById('btn-reset-view');
    if (_snapResetBtn) _snapResetBtn.style.display = 'none';

    // Show/hide wing tabs
    ['left','right'].forEach(side => {
        if (state.wings[side]) _showWingTab(side); else _hideWingTab(side);
    });
    // Show/hide upper unit tab
    // wing-tab-upperUnit is kept hidden — upper unit editing is inline via btn-edit-upper-unit
    const _uuTab = document.getElementById('wing-tab-upperUnit');
    if (_uuTab) _uuTab.style.display = 'none';
    // Update active tab highlight
    document.querySelectorAll('.wing-tab-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.wing === state.activeWing);
    });

    syncSidebarToWing();
    // Restore preset UI (button highlights, section visibility, position menu)
    if (typeof window._restorePresetUI === 'function') window._restorePresetUI();
    buildCabinet(); updateCameraView(); calculatePrice();
    updateUndoRedoUI();
    setTimeout(() => state.isRestoring = false, 50);
}

// ---- Side Cabinet (ארון צד הפוך) ----
window.updateSideUnitType = function(type) {
    const w = getWing();
    if (!w) return;

    if (type === 'none') {
        // Disable both desk and side cabinet
        w.desk.side = 'none';
        w.sideCabinet = null;
    } else if (type === 'desk') {
        // Enable desk, disable side cabinet
        w.sideCabinet = null;
        if (!w.desk) w.desk = { side: 'none', width: 100, height: 80, hasDrawers: true, drawerHeight: 12, drawerCount: null };
        // Default desk side to right if currently none
        if (w.desk.side === 'none') w.desk.side = 'right';
    } else if (type === 'side_cabinet') {
        // Enable side cabinet, disable desk
        w.desk.side = 'none';
        if (!w.sideCabinet) {
            w.sideCabinet = _createSideCabinetData(w);
            w.sideCabinet.side = 'right'; // default side
        }
        _syncSideCabinetDoorMaterial(w);
    }

    // Update side-unit-btn highlights
    document.querySelectorAll('.side-unit-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.type === type);
    });

    // Update UI visibility
    const deskSection = document.getElementById('desk-section');
    const scSection = document.getElementById('side-cabinet-section');
    if (deskSection) deskSection.style.display = (type === 'desk') ? 'block' : 'none';
    if (scSection) scSection.style.display = (type === 'side_cabinet') ? 'block' : 'none';

    // Sync desk side selector if desk
    if (type === 'desk') {
        const deskSideEl = document.getElementById('inp-desk-side');
        if (deskSideEl) deskSideEl.value = w.desk.side;
        const deskControls = document.getElementById('desk-controls');
        if (deskControls) deskControls.style.display = 'block';
    }

    // Sync side cabinet UI if side_cabinet
    if (type === 'side_cabinet' && w.sideCabinet) {
        _syncSideCabinetUI(w.sideCabinet);
    }

    _updateMaterialTabVisibility(w);
    buildCabinet(); updateCameraView(); calculatePrice(); saveHistoryState();
};

function _syncSideCabinetDoorMaterial(mainWing) {
    if (!mainWing || !mainWing.sideCabinet || mainWing.sideCabinet.side === 'none') return;
    mainWing.sideCabinet.materialExternal = mainWing.materialExternal || 'white_matte';
}
window._syncSideCabinetDoorMaterial = _syncSideCabinetDoorMaterial;

function _syncSideCabinetUI(sc) {
    const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
    // Sync per-side width sliders
    const wR = sc.widthRight || sc.width || 40;
    const wL = sc.widthLeft  || sc.width || 40;
    setVal('inp-sc-width-right',     wR);
    setVal('inp-num-sc-width-right', wR);
    setVal('inp-sc-width-left',      wL);
    setVal('inp-num-sc-width-left',  wL);
    // Show/hide per-side slider rows based on which sides are active
    const scSide = sc.side || 'right';
    const hasRight = (scSide === 'right' || scSide === 'both');
    const hasLeft  = (scSide === 'left'  || scSide === 'both');
    const rowR = document.getElementById('sc-width-row-right');
    const rowL = document.getElementById('sc-width-row-left');
    if (rowR) rowR.style.display = hasRight ? '' : 'none';
    if (rowL) rowL.style.display = hasLeft  ? '' : 'none';
    // Update side checkboxes (desktop + mobile)
    ['sc-chk-right', 'mobile-sc-chk-right'].forEach(id => {
        const el = document.getElementById(id); if (el) el.checked = hasRight;
    });
    ['sc-chk-left', 'mobile-sc-chk-left'].forEach(id => {
        const el = document.getElementById(id); if (el) el.checked = hasLeft;
    });
    // Sync the new button-style UI (desktop)
    if (typeof window._syncSCsideBtns === 'function') window._syncSCsideBtns();
}

window.updateSideCabinet = function(field, value) {
    const w = getWing();
    if (!w) return;
    if (!w.sideCabinet) {
        w.sideCabinet = _createSideCabinetData(w);
    }
    const sc = w.sideCabinet;

    if (field === 'sideRight') {
        // Toggle right side on/off
        const hasLeft = (sc.side === 'left' || sc.side === 'both');
        if (value) {
            sc.side = hasLeft ? 'both' : 'right';
            // Ensure widthRight is explicitly set (don't rely on sc.width fallback)
            if (!sc.widthRight) sc.widthRight = sc.width || 40;
            // Ensure widthLeft is also explicit so right-side changes don't affect it
            if (!sc.widthLeft) sc.widthLeft = sc.width || 40;
        } else {
            sc.side = hasLeft ? 'left' : 'none';
        }
        _syncSideCabinetUI(sc);
    } else if (field === 'sideLeft') {
        // Toggle left side on/off
        const hasRight = (sc.side === 'right' || sc.side === 'both');
        if (value) {
            sc.side = hasRight ? 'both' : 'left';
            // Ensure widthLeft is explicitly set (don't rely on sc.width fallback)
            if (!sc.widthLeft) sc.widthLeft = sc.width || 40;
            // Ensure widthRight is also explicit so left-side changes don't affect it
            if (!sc.widthRight) sc.widthRight = sc.width || 40;
        } else {
            sc.side = hasRight ? 'right' : 'none';
        }
        _syncSideCabinetUI(sc);
    } else if (field === 'widthRight') {
        const newW = Math.max(20, Math.min(80, parseInt(value) || 40));
        sc.widthRight = newW;
        // Do NOT sync sc.width here — that would affect the left side via fallback
        // Ensure widthLeft is explicitly set so it doesn't fall back to sc.width
        if (!sc.widthLeft) sc.widthLeft = sc.width || 40;
        const el  = document.getElementById('inp-sc-width-right');
        const num = document.getElementById('inp-num-sc-width-right');
        if (el)  el.value  = newW;
        if (num) num.value = newW;
    } else if (field === 'widthLeft') {
        const newW = Math.max(20, Math.min(80, parseInt(value) || 40));
        sc.widthLeft = newW;
        // Do NOT sync sc.width here — that would affect the right side via fallback
        // Ensure widthRight is explicitly set so it doesn't fall back to sc.width
        if (!sc.widthRight) sc.widthRight = sc.width || 40;
        const el  = document.getElementById('inp-sc-width-left');
        const num = document.getElementById('inp-num-sc-width-left');
        if (el)  el.value  = newW;
        if (num) num.value = newW;
    } else if (field === 'width') {
        // Legacy: set both sides together
        const newW = Math.max(20, Math.min(80, parseInt(value) || 40));
        sc.width = newW;
        sc.widthRight = newW;
        sc.widthLeft  = newW;
        _syncSideCabinetUI(sc);
    }

    buildCabinet(); updateCameraView(); calculatePrice(); saveHistoryState();
};

// ---- Enter side cabinet edit mode ----
// scSide: 'right' or 'left' — which side cabinet to focus on
window.enterSideCabinetEditMode = function(scSide) {
    const w = getWing();
    if (!w || !w.sideCabinet || w.sideCabinet.side === 'none') return;
    const sc = w.sideCabinet;
    const scSideVal = sc.side || 'right';
    // Determine which side to edit: prefer the requested side, fall back to available side
    let editSide = scSide;
    if (!editSide) {
        editSide = (scSideVal === 'left') ? 'left' : 'right';
    }
    // Make sure the requested side actually exists
    if (editSide === 'right' && scSideVal !== 'right' && scSideVal !== 'both') editSide = 'left';
    if (editSide === 'left'  && scSideVal !== 'left'  && scSideVal !== 'both') editSide = 'right';

    const wingId = (editSide === 'left') ? 'sideCabinetLeft' : 'sideCabinetRight';

    if (!state.wingEditMode) {
        state.wingEditSnapshot = JSON.parse(JSON.stringify({
            wings: state.wings,
            activeWing: state.activeWing
        }));
    }
    state.wingEditMode = true;
    state.activeWing = wingId;
    window._wingEditCamInit = true;
    state.viewMode = 'front';
    window._orbitFree = false;
    const banner = document.getElementById('wing-edit-banner');
    if (banner) {
        banner.style.display = 'flex';
        const bannerLabel = banner.querySelector('span');
        if (bannerLabel) bannerLabel.innerHTML = '<i class="fa-solid fa-pen-to-square" style="margin-left:6px;color:#7eb8f7;"></i>מצב עריכת ארון צד';
    }
    buildCabinet(); updateCameraView(); calculatePrice();
};

window.updateCorner = function(field, value) {
    const w = getWing();
    if (!w.corner) w.corner = { side: 'none', width: 60, height: 90, depth: 54, type: 'drawers', shelves: 3, drawerCount: 4 };
    if (field === 'side') {
        w.corner.side = value;
        // Sync side buttons
        document.querySelectorAll('.corner-side-btn').forEach(b => {
            const isActive = b.dataset.side === value;
            b.classList.toggle('active', isActive);
            b.style.background = isActive ? 'var(--accent)' : 'var(--bg-light)';
            b.style.color = isActive ? 'white' : 'var(--text-dark)';
            b.style.borderColor = isActive ? 'var(--accent)' : 'var(--border)';
        });
        const cuControls = document.getElementById('corner-controls');
        if (cuControls) cuControls.style.display = (value !== 'none') ? 'block' : 'none';
    } else if (field === 'type') {
        w.corner.type = value;
        // Sync type buttons
        document.querySelectorAll('.corner-type-btn').forEach(b => {
            const isActive = b.dataset.type === value;
            b.classList.toggle('active', isActive);
            b.style.background = isActive ? 'var(--accent)' : 'var(--bg-light)';
            b.style.color = isActive ? 'white' : 'var(--text-dark)';
            b.style.borderColor = isActive ? 'var(--accent)' : 'var(--border)';
        });
        const cuDrawerSection = document.getElementById('corner-drawer-section');
        if (cuDrawerSection) cuDrawerSection.style.display = (value === 'drawers') ? 'block' : 'none';
        const cuDeskDrawerSection = document.getElementById('corner-desk-drawer-section');
        if (cuDeskDrawerSection) cuDeskDrawerSection.style.display = (value === 'desk') ? 'block' : 'none';
    } else if (field === 'width') {
        w.corner.width = parseInt(value) || 60;
        const cuWEl = document.getElementById('inp-corner-width'); const cuWNum = document.getElementById('inp-num-corner-width');
        if (cuWEl) cuWEl.value = w.corner.width; if (cuWNum) cuWNum.value = w.corner.width;
    } else if (field === 'height') {
        w.corner.height = parseInt(value) || 90;
        const cuHEl = document.getElementById('inp-corner-height'); const cuHNum = document.getElementById('inp-num-corner-height');
        if (cuHEl) cuHEl.value = w.corner.height; if (cuHNum) cuHNum.value = w.corner.height;
    } else if (field === 'depth') {
        w.corner.depth = Math.max(30, Math.min(80, parseInt(value) || 54));
        const cuDpEl = document.getElementById('inp-corner-depth'); const cuDpNum = document.getElementById('inp-num-corner-depth');
        if (cuDpEl) cuDpEl.value = w.corner.depth; if (cuDpNum) cuDpNum.value = w.corner.depth;
    } else if (field === 'shelves') {
        w.corner.shelves = Math.max(0, Math.min(8, parseInt(value) || 3));
        const cuSHEl = document.getElementById('val-corner-shelves');
        if (cuSHEl) cuSHEl.innerText = w.corner.shelves;
    } else if (field === 'drawerCount') {
        w.corner.drawerCount = Math.max(1, Math.min(8, parseInt(value) || 4));
        const cuDCEl = document.getElementById('val-corner-drawers');
        if (cuDCEl) cuDCEl.innerText = w.corner.drawerCount;
    } else if (field === 'deskDrawerCount') {
        w.corner.deskDrawerCount = Math.max(0, Math.min(3, parseInt(value) || 0));
        const el = document.getElementById('val-corner-desk-drawers');
        if (el) el.innerText = w.corner.deskDrawerCount;
        const ddHRow = document.getElementById('corner-desk-drawer-height-row');
        if (ddHRow) ddHRow.style.display = w.corner.deskDrawerCount > 0 ? 'block' : 'none';
    } else if (field === 'deskDrawerHeight') {
        w.corner.deskDrawerHeight = Math.max(8, Math.min(30, parseInt(value) || 13));
        const el = document.getElementById('val-corner-desk-drawer-height');
        if (el) el.innerText = w.corner.deskDrawerHeight + ' ס"מ';
        setVal('inp-corner-desk-drawer-height', w.corner.deskDrawerHeight);
    } else if (field === 'deskFloating') {
        w.corner.deskFloating = !!value;
        const floatBtn = document.getElementById('corner-desk-float-btn');
        if (floatBtn) {
            floatBtn.classList.toggle('active', w.corner.deskFloating);
            floatBtn.style.background = w.corner.deskFloating ? 'var(--accent)' : 'var(--bg-light)';
            floatBtn.style.color = w.corner.deskFloating ? 'white' : 'var(--text-dark)';
            floatBtn.style.borderColor = w.corner.deskFloating ? 'var(--accent)' : 'var(--border)';
        }
    }
    buildCabinet(); calculatePrice(); saveHistoryState();
    updateCameraView();
};

// Helper: called by corner-side-btn onclick
window._syncCornerDeskHandleUI = function(w) {
    if (!w) w = getWing();
    if (!w || !w.corner) return;
    let hs = w.corner.deskHandleStyle || w.handleStyle || 'pipe';
    if (w.cabinetModel === 'ab2') hs = 'touch';
    document.querySelectorAll('.corner-desk-handle-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.style === hs);
    });
};

window.updateCornerDeskHandleStyle = function(style) {
    const w = getWing();
    if (!w || !w.corner || w.corner.side === 'none' || w.corner.type !== 'desk') return;
    if (w.cabinetModel === 'ab2') style = 'touch';
    if (style !== 'pipe' && style !== 'riding' && style !== 'touch') return;
    w.corner.deskHandleStyle = style;
    window._syncCornerDeskHandleUI(w);
    buildCabinet();
    calculatePrice();
    saveHistoryState();
};

window.updateHandleStyle = function(style) {
    const w = getWing();
    if (!w) return;
    if (style !== 'pipe' && style !== 'riding' && style !== 'touch') return;
    w.handleStyle = style;
    document.querySelectorAll('.handle-style-btn:not(.corner-desk-handle-btn), .mobile-handle-style-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.style === style);
    });
    if (typeof window._syncCornerDeskHandleUI === 'function') window._syncCornerDeskHandleUI(w);
    buildCabinet();
    saveHistoryState();
};

window.updateCornerSide = function(side) {
    updateCorner('side', side);
};

// Helper: called by corner-type-btn onclick
window.updateCornerType = function(type) {
    updateCorner('type', type);
};

function updateUndoRedoUI() {
    const btnUndo = document.getElementById('btn-undo');
    const btnRedo = document.getElementById('btn-redo');
    if(btnUndo) btnUndo.disabled = state.historyIndex <= 0;
    if(btnRedo) btnRedo.disabled = state.historyIndex >= state.history.length - 1;
    _updateHistoryPanelUI();
}

window.updateUndoRedoUI = updateUndoRedoUI;

// Melamine body colors that allow up to 275 cm without upper split / surcharge
const MELAMINE_EXTENDED_HEIGHT_COLORS = new Set([
    'w1200', 'H1367', 'H1307', 'H1227', 'u727', 'u232', 'u604', 'u638'
]);

function _materialAllowsExtendedMelamineHeight(materialKey) {
    return !!materialKey && MELAMINE_EXTENDED_HEIGHT_COLORS.has(String(materialKey));
}

function getSplitThreshold(wingData) {
    const w = wingData || (typeof getWing === 'function' ? getWing() : null);
    const mat = (w && w.boardMaterial) || state.boardMaterial || 'melamine';
    if (mat === 'sandwich') return 240;
    const bodyColor = w ? w.materialBody : state.materialBody;
    if (_materialAllowsExtendedMelamineHeight(bodyColor)) return 275;
    return 270;
}
window.getSplitThreshold = getSplitThreshold;

// ── Partition data migration: convert legacy comp.partitionX → comp.partitions[] ──
function _migratePartitions(col) {
    if (!col || !col.compartments) return;
    col.compartments.forEach(comp => {
        if (!comp || !comp.partition) return;
        // Already migrated
        if (Array.isArray(comp.partitions)) return;
        // Legacy: single partitionX
        const px = (typeof comp.partitionX === 'number') ? comp.partitionX : 0.5;
        comp.partitions = [px];
        delete comp.partitionX;
        // Ensure subCells has exactly partitions.length+1 entries
        if (!Array.isArray(comp.subCells)) {
            comp.subCells = [{ type: 'empty', shelves: 0 }, { type: 'empty', shelves: 0 }];
        } else if (comp.subCells.length < 2) {
            while (comp.subCells.length < 2) comp.subCells.push({ type: 'empty', shelves: 0 });
        }
    });
}
window._migratePartitions = _migratePartitions;

function checkSplits() {
    if (!state.columns || state.columns.length === 0) return;
    const threshold = getSplitThreshold();
    let maxColHeight = Math.max(...state.columns.map(c => c.height));
    let shouldHaveSplit = maxColHeight > threshold;
    
    if (shouldHaveSplit) {
        let existingSplit = state.columns.find(col => col.splitY)?.splitY;
        let newSplitY = existingSplit || (threshold === 240 ? 200 : 240);
        
        state.columns.forEach(col => {
            if (col.height > newSplitY + state.thickness) {
                if (col.splitY !== newSplitY) { col.splitY = newSplitY; distributeShelves(col); }
            } else {
                if (col.splitY) { col.splitY = null; distributeShelves(col); }
            }
        });
    } else {
        state.columns.forEach(col => {
            if (col.splitY) { col.splitY = null; distributeShelves(col); }
        });
    }

    // Also update splitY for full corner units on all wings — sync to the same newSplitY as columns
    ['left', 'right'].forEach(side => {
        const fw = state.wings[side];
        if (!fw || !fw.fullCorner) return;
        if (fw.wingPosition === 'full_corner') {
            const fcColH = fw.globalHeight || state.globalHeight;
            const fcThreshold = getSplitThreshold(fw);
            if (fcColH > fcThreshold) {
                // Use the same splitY as the columns (if any column has one), otherwise use default
                const colSplitY = shouldHaveSplit
                    ? (state.columns.find(c => c.splitY)?.splitY || (threshold === 240 ? 200 : 240))
                    : null;
                fw.fullCorner.splitY = colSplitY;
            } else {
                fw.fullCorner.splitY = null;
            }
        }
    });
}

// Internal helper that works on any wing's data (not just active)
function _distributeShelves(col, wingData) {
    col.shelvesY = [];
    let numShelves = col.shelves;
    const plinthH = wingData ? wingData.plinthHeight : state.plinthHeight;
    const t = wingData ? wingData.thickness : state.thickness;
    
    const fo = col.floorOffset || 0;
    // noPlinth (upper unit / ביטול צוקל): shelf math starts at floor/fo so it matches
    // engine startShelvesY = t (not plinthHeight + t).
    const baseY = (col.type === 'desk')
        ? col.deskHeight + col.deskClearance
        : (col.noPlinth ? fo : Math.max(plinthH, fo));

    if (col.splitY && col.splitY > baseY + t + MIN_SHELF_GAP) {
        const h1 = col.splitY - t - (baseY + t);
        const h2 = col.height - t - (col.splitY + t);
        const totalH = h1 + h2;
        
        const bottomShelves = Math.round(numShelves * (h1 / totalH));
        const topShelves = numShelves - bottomShelves;

        const space1 = h1 / (bottomShelves + 1);
        for (let i = 1; i <= bottomShelves; i++) col.shelvesY.push(Math.round((baseY + t + space1 * i) * 10) / 10);
        
        const space2 = h2 / (topShelves + 1);
        for (let i = 1; i <= topShelves; i++) col.shelvesY.push(Math.round((col.splitY + t + space2 * i) * 10) / 10);
        
    } else {
        const innerH = col.height - baseY - (t * 2);
        const spacing = innerH / (numShelves + 1);
        for (let i = 1; i <= numShelves; i++) col.shelvesY.push(Math.round((baseY + t + (spacing * i)) * 10) / 10);
    }
    
    const numComps = col.shelves + ((col.splitY && col.splitY > baseY + t + MIN_SHELF_GAP) ? 2 : 1);
    while(col.compartments.length < numComps) col.compartments.push({ type: 'empty', count: 2 });
    while(col.compartments.length > numComps) col.compartments.pop();

    // Clamp drawer count for each compartment based on its new cell height
    for (let r = 0; r < col.compartments.length; r++) {
        const comp = col.compartments[r];
        if (comp && (comp.type === 'internal_drawers' || comp.type === 'external_drawers')) {
            const bottomY = (r === 0) ? baseY + t : col.shelvesY[r - 1] + t;
            const topY    = (r >= col.shelvesY.length) ? col.height - t : col.shelvesY[r] - t;
            const cellH   = Math.max(0, topY - bottomY);
            if (cellH < 23) {
                // Cell too short for drawers — reset to empty
                comp.type = 'empty';
            } else {
                const minCount = Math.ceil(cellH / 60);
                const autoCount = Math.floor((cellH - 22) / 20) + 1; // 23→1, 42→2, 62→3
                if (comp.count < minCount) comp.count = minCount;
                if (comp.count > autoCount) comp.count = autoCount;
                if (comp.count < 1) comp.count = 1;
            }
        }
    }

    if (col.doors) col.doors = col.doors.filter(d => d.endRow <= numComps);
}

function distributeShelves(col) {
    _distributeShelves(col, null); // uses state.* via getters
}

function distributeColumns(numCols) {
    const innerWidth = state.width - (state.thickness * 2) - (state.thickness * (numCols - 1));

    // For external (side) wings: the first column is hidden behind the center cabinet.
    // It must be at least centerD + 50 cm wide before a second column can appear.
    const activeWingData = state.wings[state.activeWing];
    const wingPos = activeWingData ? (activeWingData.wingPosition || 'side') : null;
    const centerWingData = state.wings.center;
    const centerD = centerWingData ? centerWingData.depth : state.depth;
    const minHiddenColW = (wingPos === 'side' && state.activeWing !== 'center') ? (centerD + 30) : 0;
    // For left wing: hidden column is at the RIGHT (last index) because local X+ → world Z+
    // For right wing: hidden column is at the LEFT (first index, index 0)
    const hiddenColIsLast = (state.activeWing === 'left');

    let colWidths;
    if (minHiddenColW > 0 && numCols > 1) {
        // Hidden column gets at least minHiddenColW; remaining width split evenly
        const hiddenW = Math.max(minHiddenColW, innerWidth / numCols);
        const remainW = innerWidth - hiddenW;
        const otherW = remainW / (numCols - 1);
        if (hiddenColIsLast) {
            colWidths = [...Array(numCols - 1).fill(otherW), hiddenW];
        } else {
            colWidths = [hiddenW, ...Array(numCols - 1).fill(otherW)];
        }
    } else {
        const colWidth = innerWidth / numCols;
        colWidths = Array(numCols).fill(colWidth);
    }

    state.columns = colWidths.map(colWidth => {
        const col = {
            type: 'normal',
            width: colWidth, height: state.globalHeight, shelves: 0, splitY: null, shelvesY: [], compartments: [], doors: [],
            floorOffset: 0,
            topPanel: false,
            sinkPanel: false
        };
        distributeShelves(col);
        return col;
    });
    
    state.activeEditCol = -1;
    state.hoveredColIndex = -1;
    checkSplits();
    if(typeof clearSelection === 'function') clearSelection();
}

window.updateQE = function(field, delta) {
    const cIndex = state.activeEditCol;
    if (cIndex === -1 || !state.columns[cIndex]) return;
    const col = state.columns[cIndex];

    if (field === 'height') {
        const baseY = col.type === 'desk' ? col.deskHeight + col.deskClearance : state.plinthHeight;
        let minH = col.shelves > 0 ? col.shelvesY[col.shelves-1] + MIN_SHELF_GAP + state.thickness : baseY + MIN_SHELF_GAP;
        // Auto-remove splitY for this column if reducing height below split threshold
        if (col.splitY && delta < 0) {
            const splitMinH = col.splitY + MIN_SHELF_GAP + 2*state.thickness;
            const rawDesired = col.height + delta;
            if (rawDesired <= splitMinH) {
                col.splitY = null;
                distributeShelves(col);
            }
        }
        if (col.splitY) minH = Math.max(minH, col.splitY + MIN_SHELF_GAP + 2*state.thickness);
        col.height = Math.max(minH, Math.min(MAX_GLOBAL_HEIGHT, Math.round(col.height + delta)));
    }
    if (field === 'width') {
        let neighborIndex = (cIndex === state.columns.length - 1) ? cIndex - 1 : cIndex + 1;
        if (neighborIndex >= 0 && neighborIndex < state.columns.length) {
            let neighbor = state.columns[neighborIndex];
            let newW = Math.round(col.width + delta);
            let newNeighborW = Math.round(neighbor.width - delta);
            if (newW >= MIN_COL_WIDTH && newNeighborW >= MIN_COL_WIDTH) {
                col.width = newW; neighbor.width = newNeighborW;
            }
        }
    }
    if (field === 'shelves') {
        let newS = col.shelves + delta;
        if (newS >= 0 && newS <= 8) {
            col.shelves = newS; distributeShelves(col); clearSelection();
        }
    }
    checkSplits(); buildCabinet(); calculatePrice(); saveHistoryState();
}

window.updateQEInput = function(field, value) {
    const col = state.columns[state.activeEditCol];
    if (!col) return;
    let val = parseInt(value);
    if(isNaN(val) || state.activeEditCol === -1) return;
    if (field === 'height') updateQE('height', val - col.height);
    else if (field === 'width') updateQE('width', val - col.width);
    else if (field === 'shelves') updateQE('shelves', val - col.shelves);
}

/** Set column width in cm from the green label above the column. Returns applied width. */
window._setColumnWidthCm = function(cIndex, desiredCm) {
    const cols = state.columns;
    if (!cols || cIndex < 0 || cIndex >= cols.length) return null;
    const col = cols[cIndex];
    if (!col) return null;
    const minW = (typeof MIN_COL_WIDTH !== 'undefined') ? MIN_COL_WIDTH : 20;
    let desired = Math.round(desiredCm);
    if (isNaN(desired)) return Math.round(col.width);

    if (cols.length === 1) {
        // Single column: changing width changes total cabinet width
        const t = state.thickness || 1.7;
        const newTotal = Math.max(40, Math.min(600, desired + t * 2));
        desired = Math.max(minW, Math.round(newTotal - t * 2));
        state.width = desired + t * 2;
        col.width = desired;
        const pill = document.getElementById('dim-pill-width');
        if (pill) pill.value = Math.round(state.width);
        const inp = document.getElementById('inp-num-width');
        if (inp) inp.value = Math.round(state.width);
    } else {
        // Multi-column: keep total width — steal/give from neighbor (same as updateQE width)
        let neighborIndex = (cIndex === cols.length - 1) ? cIndex - 1 : cIndex + 1;
        const neighbor = cols[neighborIndex];
        if (!neighbor) return Math.round(col.width);
        const delta = desired - Math.round(col.width);
        let newW = Math.round(col.width + delta);
        let newNeighborW = Math.round(neighbor.width - delta);
        if (newW < minW) {
            newNeighborW -= (minW - newW);
            newW = minW;
        }
        if (newNeighborW < minW) {
            newW -= (minW - newNeighborW);
            newNeighborW = minW;
        }
        if (newW < minW || newNeighborW < minW) return Math.round(col.width);
        col.width = newW;
        neighbor.width = newNeighborW;
        desired = newW;
    }

    checkSplits();
    if (typeof buildCabinet === 'function') buildCabinet();
    if (typeof updateCameraView === 'function') updateCameraView();
    if (typeof calculatePrice === 'function') calculatePrice();
    if (typeof saveHistoryState === 'function') saveHistoryState();
    return desired;
};

function _columnHasInterior(col) {
    if (!col) return false;
    if ((col.shelves || 0) > 0) return true;
    if (col.type && col.type !== 'normal') return true;
    if (col.floorOffset) return true;
    if (col.topPanel || col.sinkPanel) return true;
    if (col.doors && col.doors.length) return true;
    const comps = col.compartments || [];
    for (let i = 0; i < comps.length; i++) {
        const c = comps[i];
        if (!c) continue;
        if (c.type && c.type !== 'empty') return true;
        if (c.mergeLeft || c.mergeRight) return true;
        if (c.partition || (c.partitions && c.partitions.length)) return true;
    }
    return false;
}

function _cabinetHasColumnInterior() {
    return (state.columns || []).some(_columnHasInterior);
}

function _blankColumn(width, template) {
    const col = {
        type: 'normal',
        width: width,
        height: (template && template.height) || state.globalHeight,
        shelves: 0,
        splitY: (template && template.splitY) || null,
        shelvesY: [],
        compartments: [],
        doors: [],
        floorOffset: 0,
        topPanel: false,
        sinkPanel: false,
        noPlinth: !!(template && template.noPlinth)
    };
    distributeShelves(col);
    return col;
}

function _fixEdgeColumnMerges() {
    const cols = state.columns || [];
    if (!cols.length) return;
    const strip = (col, key) => {
        (col.compartments || []).forEach(c => { if (c) c[key] = false; });
        (col.doors || []).forEach(d => { if (d) d[key] = false; });
    };
    strip(cols[0], 'mergeLeft');
    strip(cols[cols.length - 1], 'mergeRight');
}

function _syncColumnCountInputs(n) {
    n = parseInt(n, 10);
    if (isNaN(n)) return;
    const inp = document.getElementById('inp-columns');
    if (inp) inp.value = n;
    const valEl = document.getElementById('val-columns');
    if (valEl) valEl.innerText = n;
    const mobileVal = document.getElementById('mobile-val-columns');
    if (mobileVal) mobileVal.textContent = n;
    if (typeof window._previewColumnsSlider === 'function') {
        window._previewColumnsSlider(n);
    } else {
        const slider = document.getElementById('dfm-slider-columns');
        if (slider) slider.value = n;
        const dfmVal = document.getElementById('dfm-val-columns');
        if (dfmVal) dfmVal.textContent = n;
        const dfmTlbl = document.getElementById('dfm-tlbl-columns');
        if (dfmTlbl) dfmTlbl.textContent = n;
    }
}

function _applyColumnCountChange(newCount, side, skipSave) {
    newCount = parseInt(newCount, 10);
    const cols = state.columns || [];
    const n = cols.length;
    if (!newCount || newCount === n) {
        _syncColumnCountInputs(n);
        return;
    }

    state.manualPrice = null;
    state.activeEditCol = -1;
    state.hoveredColIndex = -1;

    if (n === 0) {
        distributeColumns(newCount);
    } else if (newCount > n) {
        const add = newCount - n;
        const template = side === 'left' ? cols[0] : cols[n - 1];
        const seedW = (template && template.width) || 40;
        const extras = [];
        for (let i = 0; i < add; i++) extras.push(_blankColumn(seedW, template));
        state.columns = side === 'left' ? extras.concat(cols) : cols.concat(extras);
        _rescaleColumnWidths(state.width);
    } else {
        const remove = Math.min(n - newCount, n - 1);
        state.columns = side === 'left' ? cols.slice(remove) : cols.slice(0, n - remove);
        _rescaleColumnWidths(state.width);
    }

    _fixEdgeColumnMerges();
    _syncColumnCountInputs(state.columns.length);
    if (skipSave) return;
    if (typeof buildCabinet === 'function') buildCabinet();
    if (typeof calculatePrice === 'function') calculatePrice();
    if (typeof saveHistoryState === 'function') saveHistoryState();
}

function _closeColumnSideDialog() {
    const el = document.getElementById('_col-side-dialog');
    if (el) el.remove();
}

window._onColumnSidePick = function(side) {
    const pending = window._pendingColumnCount;
    _closeColumnSideDialog();
    window._pendingColumnCount = null;
    if (!pending) return;
    _applyColumnCountChange(pending.newCount, side);
};

window._cancelColumnSideDialog = function() {
    _closeColumnSideDialog();
    window._pendingColumnCount = null;
    _syncColumnCountInputs((state.columns || []).length);
};

function _askColumnSide(newCount) {
    const current = (state.columns || []).length;
    const isAdd = newCount > current;
    const delta = Math.abs(newCount - current);
    window._pendingColumnCount = { newCount: newCount };

    _closeColumnSideDialog();
    const toast = document.createElement('div');
    toast.id = '_col-side-dialog';
    toast.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.45);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);';

    let title, leftLbl, rightLbl;
    if (isAdd) {
        title = delta === 1 ? 'איפה להוסיף את העמודה?' : `איפה להוסיף ${delta} עמודות?`;
        leftLbl = 'בצד שמאל';
        rightLbl = 'בצד ימין';
    } else {
        title = delta === 1 ? 'איזו עמודה למחוק?' : `מאיזה צד למחוק ${delta} עמודות?`;
        leftLbl = delta === 1 ? 'העמודה השמאלית' : 'מצד שמאל';
        rightLbl = delta === 1 ? 'העמודה הימנית' : 'מצד ימין';
    }

    toast.innerHTML = `
        <div style="background:#1e2840;color:white;padding:32px 36px;border-radius:20px;font-size:1.1rem;font-weight:600;box-shadow:0 8px 48px rgba(0,0,0,0.55);display:flex;flex-direction:column;align-items:center;gap:22px;min-width:300px;max-width:92vw;text-align:center;" onclick="event.stopPropagation()">
            <div style="font-size:1.2rem;font-weight:700;line-height:1.45;">${title}</div>
            <div style="display:flex;gap:12px;width:100%;direction:ltr;">
                <button type="button" onclick="window._onColumnSidePick('left')" style="flex:1;background:rgba(255,255,255,0.12);color:white;border:1px solid rgba(255,255,255,0.22);border-radius:10px;padding:14px 8px;font-size:1.02rem;font-weight:700;cursor:pointer;">${leftLbl}</button>
                <button type="button" onclick="window._onColumnSidePick('right')" style="flex:1;background:rgba(255,255,255,0.12);color:white;border:1px solid rgba(255,255,255,0.22);border-radius:10px;padding:14px 8px;font-size:1.02rem;font-weight:700;cursor:pointer;">${rightLbl}</button>
            </div>
            <button type="button" onclick="window._cancelColumnSideDialog()" style="width:100%;background:transparent;color:rgba(255,255,255,0.75);border:none;padding:6px 0;font-size:0.95rem;font-weight:600;cursor:pointer;">ביטול</button>
        </div>
    `;
    toast.addEventListener('click', () => window._cancelColumnSideDialog());
    document.body.appendChild(toast);
}

window._requestColumnCountChange = function(newCount) {
    newCount = parseInt(newCount, 10);
    if (isNaN(newCount)) return;
    newCount = Math.max(1, Math.min(MAX_COLUMNS, newCount));

    const current = (state.columns || []).length;
    if (newCount === current) {
        _syncColumnCountInputs(current);
        return;
    }

    if (window._pendingColumnCount) {
        _syncColumnCountInputs(current);
        return;
    }

    if (_cabinetHasColumnInterior()) {
        _askColumnSide(newCount);
        return;
    }

    _applyColumnCountChange(newCount, 'right');
};

window.updateColumns = function(delta) {
    const inp = document.getElementById('inp-columns');
    const currentVal = inp ? parseInt(inp.value) : (state.columns || []).length;
    const minVal = inp ? (parseInt(inp.min) || 2) : 2;
    const maxVal = inp ? (parseInt(inp.max) || MAX_COLUMNS) : MAX_COLUMNS;
    const newVal = currentVal + delta;
    if (newVal >= minVal && newVal <= maxVal) {
        window._requestColumnCountChange(newVal);
    }
};

// ---- Rescale existing column widths proportionally when total width changes ----
// Preserves all internal structure (shelves, compartments, doors, splitY, shelvesY).
// After rescaling, shelvesY positions are clamped to remain valid within the new column height.
function _rescaleColumnWidths(newTotalWidth) {
    const t = state.thickness;
    const numCols = state.columns.length;
    const oldInnerWidth = state.columns.reduce((sum, col) => sum + col.width, 0);
    const newInnerWidth = newTotalWidth - t * 2 - t * (numCols - 1);

    if (oldInnerWidth <= 0 || newInnerWidth <= 0) {
        // Fallback: full redistribute
        distributeColumns(numCols);
        return;
    }

    const ratio = newInnerWidth / oldInnerWidth;

    state.columns.forEach(col => {
        // Rescale column width
        col.width = Math.max(MIN_COL_WIDTH, Math.round(col.width * ratio * 10) / 10);
    });

    // Fix floating-point drift: adjust last column so total inner width is exact
    const actualInner = state.columns.reduce((sum, col) => sum + col.width, 0);
    const drift = Math.round((newInnerWidth - actualInner) * 10) / 10;
    if (Math.abs(drift) > 0.01 && state.columns.length > 0) {
        const lastCol = state.columns[state.columns.length - 1];
        lastCol.width = Math.max(MIN_COL_WIDTH, Math.round((lastCol.width + drift) * 10) / 10);
    }

    // Clamp splitY and shelvesY to remain valid within each column's height
    state.columns.forEach(col => {
        const fo = col.floorOffset || 0;
        const baseY = col.type === 'desk'
            ? (col.deskHeight || 0) + (col.deskClearance || 0)
            : Math.max(state.plinthHeight, fo);
        const maxY = col.height - t * 2 - MIN_SHELF_GAP;

        if (col.splitY && (col.splitY < baseY + t + MIN_SHELF_GAP || col.splitY > maxY)) {
            col.splitY = null;
        }
        if (col.shelvesY && col.shelvesY.length > 0) {
            col.shelvesY = col.shelvesY.filter(y => y > baseY + t && y < col.height - t);
        }
        // Ensure compartments array length matches shelves count
        const numComps = col.shelves + ((col.splitY && col.splitY > baseY + t + MIN_SHELF_GAP) ? 2 : 1);
        while (col.compartments.length < numComps) col.compartments.push({ type: 'empty', count: 2 });
        while (col.compartments.length > numComps) col.compartments.pop();
    });

    checkSplits();
    if (typeof clearSelection === 'function') clearSelection();
}

// ---- Rescale shelf Y positions proportionally when total height changes ----
// Preserves relative shelf positions within each column.
function _rescaleColumnHeights(newHeight) {
    const t = state.thickness;
    state.columns.forEach(col => {
        const oldHeight = col.height;
        const fo = col.floorOffset || 0;
        const oldBaseY = col.type === 'desk'
            ? (col.deskHeight || 0) + (col.deskClearance || 0) + t
            : Math.max(state.plinthHeight + t, fo > 0 ? fo + t : state.plinthHeight + t);
        const newBaseY = col.type === 'desk'
            ? (col.deskHeight || 0) + (col.deskClearance || 0) + t
            : Math.max(state.plinthHeight + t, fo > 0 ? fo + t : state.plinthHeight + t);

        const oldInnerH = oldHeight - t - oldBaseY;
        const newInnerH = newHeight - t - newBaseY;

        col.height = newHeight;

        if (oldInnerH > 0 && newInnerH > 0 && col.shelvesY && col.shelvesY.length > 0) {
            col.shelvesY = col.shelvesY.map(y => {
                const relPos = (y - oldBaseY) / oldInnerH;
                const newY = Math.round((newBaseY + relPos * newInnerH) * 10) / 10;
                return newY;
            }).filter(y => y > newBaseY && y < newHeight - t - MIN_SHELF_GAP);

            // If some shelves were filtered out, trim compartments to match
            const actualShelves = col.shelvesY.length;
            if (actualShelves !== col.shelves) {
                col.shelves = actualShelves;
                const fo2 = col.floorOffset || 0;
                const baseY2 = col.type === 'desk'
                    ? (col.deskHeight || 0) + (col.deskClearance || 0) + t
                    : Math.max(state.plinthHeight + t, fo2 > 0 ? fo2 + t : state.plinthHeight + t);
                const numComps = col.shelves + ((col.splitY && col.splitY > baseY2 + MIN_SHELF_GAP) ? 2 : 1);
                while (col.compartments.length < numComps) col.compartments.push({ type: 'empty', count: 2 });
                while (col.compartments.length > numComps) col.compartments.pop();
            }
        } else if (col.shelvesY && col.shelvesY.length > 0) {
            // Can't rescale — fall back to redistribute
            distributeShelves(col);
        }

        // Rescale splitY proportionally
        if (col.splitY) {
            if (oldInnerH > 0 && newInnerH > 0) {
                const relSplit = (col.splitY - oldBaseY) / oldInnerH;
                col.splitY = Math.round((newBaseY + relSplit * newInnerH) * 10) / 10;
            }
        }
    });
    checkSplits();
}

window.updateDim = function(dim, delta, absoluteValue = null) {
    let val;
    if (absoluteValue !== null) {
        val = parseInt(absoluteValue);
    } else {
        if (dim === 'width') val = state.width + delta;
        if (dim === 'height') val = state.globalHeight + delta;
        if (dim === 'depth') val = state.depth + delta;
        if (dim === 'deskWidth') val = state.desk.width + delta;
    }
    if (isNaN(val)) return;

    state.manualPrice = null;

    if (dim === 'width') {
        // Clamp to room width if set by user
        const _maxW = (window._roomWidth && window._roomWidth > 0) ? window._roomWidth : 600;
        val = Math.max(MIN_WARDROBE_WIDTH, Math.min(_maxW, val));
        state.width = val;
        document.getElementById('inp-width').value = val;
        document.getElementById('inp-num-width').value = val;

        // For sliding wardrobes: auto-recalculate doors AND columns together
        if (state.presetId === 'sliding') {
            const cw = state.wings.center;
            if (cw && cw.slidingDoor) {
                if (!cw.slidingDoor.manualNumDoors) {
                    cw.slidingDoor.numDoors = _calcSlidingDoorCount(val);
                }
                // Always sync columns to match door count
                _syncSlidingColumns(cw);
                const sdDoorEl = document.getElementById('inp-sd-doors');
                const sdDoorLbl = document.getElementById('val-sd-doors');
                if (sdDoorEl) sdDoorEl.value = cw.slidingDoor.numDoors;
                if (sdDoorLbl) sdDoorLbl.innerText = cw.slidingDoor.numDoors;
                const colInput = document.getElementById('inp-columns');
                const colLbl = document.getElementById('val-columns');
                if (colInput) colInput.value = cw.slidingDoor.numDoors;
                if (colLbl) colLbl.innerText = cw.slidingDoor.numDoors;
            }
        } else {
            // Normal wardrobe: rescale existing columns proportionally (preserves internal structure)
            const activeWingData = state.wings[state.activeWing];
            const _wingPos = activeWingData ? (activeWingData.wingPosition || 'side') : null;
            const effectiveMaxColW = (_wingPos === 'front' || (_wingPos === 'side' && state.activeWing !== 'center')) ? 160 : MAX_COL_WIDTH;
            const minCols = Math.ceil((state.width - state.thickness*2) / effectiveMaxColW);
            const colInput = document.getElementById('inp-columns');
            if(colInput) colInput.min = minCols;
            if(state.columns.length < minCols) {
                // Add extra columns on the right without wiping existing interiors
                _applyColumnCountChange(minCols, 'right', true);
            } else {
                // Same number of columns — rescale widths proportionally, preserve structure
                _rescaleColumnWidths(val);
            }
        }
    }
    else if (dim === 'height') {
        // Clamp to room height (ceiling) if set by user
        const _maxH = (window._roomHeight && window._roomHeight > 0) ? window._roomHeight : MAX_GLOBAL_HEIGHT;
        val = Math.max(40, Math.min(_maxH, val));
        const oldHeight = state.globalHeight;
        state.globalHeight = val;
        document.getElementById('inp-height').value = val;
        document.getElementById('inp-num-height').value = val;
        // Rescale shelf positions proportionally instead of redistributing from scratch
        _rescaleColumnHeights(val);
        checkSplits();
    }
    else if (dim === 'depth') {
        val = Math.max(10, Math.min(80, val));
        state.depth = val;
        document.getElementById('inp-depth').value = val;
        document.getElementById('inp-num-depth').value = val;
    }
    else if (dim === 'deskWidth') {
        val = Math.max(40, Math.min(200, val));
        state.desk.width = val;
        document.getElementById('inp-desk-width').value = val;
        document.getElementById('inp-num-desk-width').value = val;
    }
    _syncDimPills();
    if (typeof window._syncAllRangeFills === 'function') window._syncAllRangeFills();
    buildCabinetDebounced(); updateCameraView(); calculatePrice();
}

function _syncDimPills() {
    const w = getWing();
    const pw = document.getElementById('dim-pill-width');
    const ph = document.getElementById('dim-pill-height');
    const pd = document.getElementById('dim-pill-depth');
    const pp = document.getElementById('dim-pill-plinth');
    const sw = document.getElementById('inp-width');
    const sh = document.getElementById('inp-height');
    const sd = document.getElementById('inp-depth');
    const sp = document.getElementById('inp-plinth-height');
    const roundW = Math.round(state.width || (w && w.width) || 160);
    const roundH = Math.round(state.globalHeight || (w && w.globalHeight) || 240);
    const roundD = Math.round(state.depth || (w && w.depth) || 54);
    const plinthV = parseFloat((state.plinthHeight || (w && w.plinthHeight) || 8.75).toFixed(1));
    if (pw) pw.value = roundW;
    if (ph) ph.value = roundH;
    if (pd) pd.value = roundD;
    if (pp) pp.value = plinthV.toFixed(1);
    if (sw) sw.value = roundW;
    if (sh) sh.value = roundH;
    if (sd) sd.value = roundD;
    if (sp) sp.value = plinthV;
    if (typeof window._syncRangeFill === 'function') {
        [sw, sh, sd, sp].forEach(function(el) { if (el) window._syncRangeFill(el); });
    }
}

window._setPlinthHeight = function(val, skipSave) {
    const v = Math.max(0, Math.min(30, parseFloat(val) || 8.75));
    const w = getWing();
    if (w) w.plinthHeight = v;
    state.plinthHeight = v;
    const pill = document.getElementById('dim-pill-plinth');
    if (pill) pill.value = v.toFixed(1);
    const plinthSlider = document.getElementById('inp-plinth-height');
    if (plinthSlider) {
        plinthSlider.value = v;
        if (typeof window._syncRangeFill === 'function') window._syncRangeFill(plinthSlider);
    }
    state.manualPrice = null;
    buildCabinetDebounced();
    calculatePrice();
    if (!skipSave) saveHistoryState();
};

// ── Side desk drawer count ────────────────────────────────────────────────────
function _autoSideDeskDrawerCount(deskWidth) {
    return (deskWidth || 100) <= 80 ? 1 : 2;
}

function updateSideDeskDrawerCount(delta) {
    const w = getWing();
    if (!w.desk) return;
    const auto = _autoSideDeskDrawerCount(w.desk.width);
    const current = (w.desk.drawerCount != null) ? w.desk.drawerCount : auto;
    const next = Math.max(1, Math.min(4, current + delta));
    w.desk.drawerCount = next;
    setVal('inp-side-desk-drawer-count', next);
    const valEl = document.getElementById('val-side-desk-drawer-count');
    if (valEl) valEl.textContent = next;
    buildCabinetDebounced();
}

function updateSideDeskDrawerCountInput(val) {
    const w = getWing();
    if (!w.desk) return;
    const next = Math.max(1, Math.min(4, parseInt(val) || 1));
    w.desk.drawerCount = next;
    setVal('inp-side-desk-drawer-count', next);
    const valEl = document.getElementById('val-side-desk-drawer-count');
    if (valEl) valEl.textContent = next;
    buildCabinetDebounced();
}

// ── Default pricing config ────────────────────────────────────────────────────
var DEFAULT_PRICING_CONFIG = {
    pricingMode: 'ranges',
    sqmPrice: 800, sqmPriceNonMel: 1040,
    lmPrice: 1200, lmPriceNonMel: 1560,
    lmHeightBase: 1200, lmHeightBaseNonMel: 1560,
    lmHeightThresholdCm: 240, lmHeightStepCm: 30, lmHeightStepPct: 0.10,
    materialsBoardPrice: 180, materialsBoardsPerSqm: 1.4, materialsMultiplier: 2.5,
    profitMultiplier: 1.7,
    installPricePerUnit: 110, installUnitCm: 42.5, installHeightSurcharge: 0.20,
    heightSurcharge: 0.20, depthSurcharge: 0.20, sandwichSurcharge: 0.15,
    cabinetTypes: [
        { id: 'maya', label: 'צוקל נסתר', engine: 'maya' },
        { id: 'c9', label: 'צוקל רגיל', engine: 'c9' },
        { id: 'regalim', label: 'ארון על רגליים', engine: 'regalim' },
        { id: 'sliding', label: 'ארון הזזה', engine: 'sliding' }
    ],
    ranges: {
        c9:      { melamine: {80:970, 120:1340,160:1500,200:1870,240:2250}, nonMelamine: {80:1250,120:1600,160:1945,200:2433,240:2920} },
        regalim: { melamine: {80:1050,120:1462,160:1658,200:2073,240:2487}, nonMelamine: {80:1360,120:1900,160:2155,200:2700,240:3233} },
        maya:    { melamine: {80:1050,120:1462,160:1658,200:2073,240:2487}, nonMelamine: {80:1360,120:1900,160:2155,200:2700,240:3233} }
    },
    extras: {
        internalDrawer: 150, externalDrawer: 200,
        openCell: 400, partition: 150,
        shelfFreePerMeter: 3, extraShelfMel: 60, extraShelfNonMel: 80,
        deskUnit: 900,
        doorFramedMel: 80, doorGlassMel: 400, doorGlassBlack: 600, doorMirror: 350,
        upperUnit160: 600, upperUnit240: 900, upperUnitPerCm: 3.75,
        cornerDrawers3: 832, cornerDrawers4: 907, cornerDrawerExtra: 200,
        cornerDesk: 900, fullCornerBase: 2800, fullCornerShelf: 120,
        wingConnection: 400,
        sideCabMel: 12, sideCabNonMel: 15, sideCabDoors: 300,
        slidingBase: 800, slidingDoor: 350, slidingGlass: 200, slidingMirror: 350,
        slidingGold: 80, slidingBlack: 50, slidingHeightSurcharge: 0.15,
        nickelLegPrice: 100,
        ledPair: 650
    }
};
window.DEFAULT_PRICING_CONFIG = DEFAULT_PRICING_CONFIG;

function _getPricingCfg() { return window._pricingConfig || DEFAULT_PRICING_CONFIG; }

function _priceNum(v, fb) {
    if (v === '' || v == null) return fb;
    var n = Number(v);
    return isFinite(n) ? n : fb;
}

function _pricingRangeKey(cfg, engine) {
    const cfgR = (cfg && cfg.ranges) || DEFAULT_PRICING_CONFIG.ranges;
    const types = (cfg && Array.isArray(cfg.cabinetTypes)) ? cfg.cabinetTypes : [];
    const hit = types.find(function(t) {
        return t && t.engine !== 'sliding' && (t.engine === engine || t.id === engine) && cfgR[t.id];
    });
    if (hit) return hit.id;
    if (cfgR[engine]) return engine;
    if (engine === 'ab2_nohoney') {
        const c9t = types.find(function(t) { return t && t.engine === 'c9' && cfgR[t.id]; });
        if (c9t) return c9t.id;
        if (cfgR.c9) return 'c9';
    }
    const first = types.find(function(t) { return t && t.engine !== 'sliding' && cfgR[t.id]; });
    if (first) return first.id;
    const keys = Object.keys(cfgR).filter(function(k) {
        return k !== 'melamine' && k !== 'nonMelamine' && k !== 'sliding' && k !== 'other';
    });
    if (cfgR.maya && (!keys.length || keys.indexOf('maya') !== -1)) return 'maya';
    return keys[0] || 'maya';
}

function _calcWingBasePrice(cfg, ww, wh, wd, wMelamine, wEffectiveModel) {
    const mode  = cfg.pricingMode || 'ranges';
    const hS    = cfg.heightSurcharge != null ? cfg.heightSurcharge : 0.20;
    const dS    = cfg.depthSurcharge  != null ? cfg.depthSurcharge  : 0.20;
    if (mode === 'sqm') {
        const p = wMelamine ? _priceNum(cfg.sqmPrice, 800) : _priceNum(cfg.sqmPriceNonMel, _priceNum(cfg.sqmPrice, 800) * 1.3);
        let bp = p*(ww/100)*(wh/100); if(wd>54) bp*=(1+dS); return bp;
    }
    if (mode === 'lm') {
        const p = wMelamine ? _priceNum(cfg.lmPrice, 1200) : _priceNum(cfg.lmPriceNonMel, _priceNum(cfg.lmPrice, 1200) * 1.3);
        let bp = p*(ww/100); if(wh>=241) bp*=(1+hS); if(wd>54) bp*=(1+dS); return bp;
    }
    if (mode === 'lm_height') {
        const base  = wMelamine ? _priceNum(cfg.lmHeightBase, 1200) : _priceNum(cfg.lmHeightBaseNonMel, _priceNum(cfg.lmHeightBase, 1200) * 1.3);
        const steps = Math.max(0, Math.floor((wh-_priceNum(cfg.lmHeightThresholdCm, 240))/_priceNum(cfg.lmHeightStepCm, 30)));
        let bp = base*(ww/100)*(1+steps*_priceNum(cfg.lmHeightStepPct, 0.10));
        if(wd>54) bp*=(1+dS); return bp;
    }
    if (mode === 'materials') {
        const sqm = (ww/100)*(wh/100);
        let bp = sqm*_priceNum(cfg.materialsBoardsPerSqm, 1.4)*_priceNum(cfg.materialsBoardPrice, 180)*_priceNum(cfg.materialsMultiplier, 2.5);
        if(wd>54) bp*=(1+dS); return bp;
    }
    // ranges
    const cfgR = cfg.ranges || DEFAULT_PRICING_CONFIG.ranges;
    let rt;
    if (cfgR.melamine && !cfgR.maya && !cfgR.c9) {
        rt = wMelamine ? cfgR.melamine : (cfgR.nonMelamine||cfgR.melamine);
    } else {
        const mk = _pricingRangeKey(cfg, wEffectiveModel);
        const mr = cfgR[mk] || DEFAULT_PRICING_CONFIG.ranges.maya || DEFAULT_PRICING_CONFIG.ranges.c9;
        rt = wMelamine ? mr.melamine : (mr.nonMelamine||mr.melamine);
    }
    rt = rt || {};
    const p240 = _priceNum(rt['240'], 2487);
    let bp;
    if (ww <= 80) bp = _priceNum(rt['80'], 1050);
    else if (ww <= 120) bp = _priceNum(rt['120'], 1462);
    else if (ww <= 160) bp = _priceNum(rt['160'], 1658);
    else if (ww <= 200) bp = _priceNum(rt['200'], 2073);
    else if (ww <= 240) bp = p240;
    else bp = (p240 / 240) * ww;
    if (wh >= 241) bp *= (1 + hS);
    if (wd > 54) bp *= (1 + dS);
    return bp;
}

var SANDWICH_COLORS = new Set(['2025','2044','2041','456','2024','2049','2062','2047','7180','c3110','2040','2020']);

function _calcIncludedShelves(ww, wh, wModel) {
    const isC9Like = (wModel === 'c9' || wModel === 'ab2_nohoney');
    let allowed = 0;
    if (!isC9Like) {
        if (ww <= 80) allowed = 5; else if (ww <= 160) allowed = 8; else allowed = 13;
    } else {
        if (ww <= 80) allowed = 2; else if (ww <= 160) allowed = 7; else allowed = 12;
    }
    if (ww > 240) allowed += Math.ceil((ww - 240) / 80) * 5;
    if (wh > 240) allowed += Math.ceil(ww / 80);
    return allowed;
}

function _calcAllowedShelves(cfg, ww, wh, wModel) {
    const mode = cfg.pricingMode || 'ranges';
    const ex = cfg.extras || DEFAULT_PRICING_CONFIG.extras;
    if (mode === 'ranges') return _calcIncludedShelves(ww, wh, wModel);
    const freePerM = ex.shelfFreePerMeter != null ? ex.shelfFreePerMeter : 3;
    return Math.round(freePerM * (ww / 100));
}

function _calcWingInstallPrice(cfg, ww, wh) {
    const instUnit = _priceNum(cfg.installUnitCm, 42.5);
    const instPer  = _priceNum(cfg.installPricePerUnit, 110);
    const instHS   = cfg.installHeightSurcharge != null ? cfg.installHeightSurcharge : 0.20;
    let inst = Math.ceil(ww / instUnit) * instPer;
    if (wh > 240) inst *= (1 + instHS);
    return Math.round(inst);
}

function _calcWingCost(cfg, wing) {
    const ex  = cfg.extras || DEFAULT_PRICING_CONFIG.extras;
    const ww = wing.width, wh = wing.globalHeight, wd = wing.depth;
    const wMelamine = wing.boardMaterial === 'melamine';
    const sandwichPct = cfg.sandwichSurcharge != null ? cfg.sandwichSurcharge : 0.15;

    if (state.presetId === 'writing-desk') {
        const wd = wing.writingDesk || {};
        let cost = _priceNum(ex.deskUnit, 900);
        if (wd.hasDrawers !== false) {
            const n = wd.drawerCount != null ? wd.drawerCount : ((ww || 120) <= 80 ? 1 : 2);
            cost += n * _priceNum(ex.internalDrawer, 150);
        }
        if (SANDWICH_COLORS.has(wing.materialBody)) cost *= (1 + sandwichPct);
        return cost;
    }

    const wModel = wing.cabinetModel || 'maya';
    const wHasSideOpenCell = wModel === 'ab2_nohoney' && wing.columns && wing.columns.some(col =>
        col.compartments && col.compartments.some(comp => comp && comp.type === 'side_open_cell'));
    const wEffectiveModel = (wModel === 'ab2_nohoney' && wHasSideOpenCell) ? 'ab2' : wModel;

    let basePrice = _calcWingBasePrice(cfg, ww, wh, wd, wMelamine, wEffectiveModel);
    if (SANDWICH_COLORS.has(wing.materialBody)) basePrice *= (1 + sandwichPct);
    if (wEffectiveModel === 'regalim' && (cfg.pricingMode||'ranges') === 'ranges') {
        const legCount = ww<=110 ? 4 : ww<=180 ? 6 : 8;
        basePrice += legCount * (ex.nickelLegPrice!=null ? ex.nickelLegPrice : 100);
    }

    let finalCost = basePrice;

    const allowedShelves = _calcAllowedShelves(cfg, ww, wh, wModel);
    let actualShelves = 0;
    wing.columns.forEach(col => { actualShelves += (col.shelves||0); });
    if (actualShelves > allowedShelves)
        finalCost += (actualShelves-allowedShelves) * (wMelamine ? _priceNum(ex.extraShelfMel, 60) : _priceNum(ex.extraShelfNonMel, 80));

    let hasAnyDesk = (wing.desk && wing.desk.side !== 'none') || wing.columns.some(col => col.type === 'desk');
    if (hasAnyDesk) finalCost += _priceNum(ex.deskUnit, 900);

    let openCellBlocks = 0, partitionBlocks = 0;
    wing.columns.forEach(col => {
        let inBlock = false;
        col.compartments.forEach(comp => {
            if (comp.type === 'internal_drawers') finalCost += comp.count*_priceNum(ex.internalDrawer, 150);
            else if (comp.type === 'external_drawers') finalCost += comp.count*_priceNum(ex.externalDrawer, 200);
            if (comp && comp.partition && Array.isArray(comp.subCells)) {
                comp.subCells.forEach(sub => {
                    if (!sub || !Array.isArray(sub.zonesType)) return;
                    sub.zonesType.forEach((zt, z) => {
                        const n = (Array.isArray(sub.zonesDrawerCount) && sub.zonesDrawerCount[z] > 0)
                            ? sub.zonesDrawerCount[z]
                            : (sub.count || 1);
                        if (zt === 'internal_drawers') finalCost += n * _priceNum(ex.internalDrawer, 150);
                        else if (zt === 'external_drawers') finalCost += n * _priceNum(ex.externalDrawer, 200);
                    });
                });
            }
            if (comp && (comp.type==='open_cell'||comp.type==='side_open_cell')) { if(!inBlock){openCellBlocks++;inBlock=true;} } else { inBlock=false; }
            if (comp && comp.partition) { partitionBlocks += Array.isArray(comp.partitions)?comp.partitions.length:1; }
        });
    });
    if ((wModel==='ab2'||wEffectiveModel==='ab2') && openCellBlocks>0) openCellBlocks--;
    finalCost += openCellBlocks*_priceNum(ex.openCell, 400);
    finalCost += partitionBlocks*_priceNum(ex.partition, 150);

    if (wing.hasDoors) {
        wing.columns.forEach(col => {
            if (!col.doors) return;
            col.doors.forEach(door => {
                const style  = door.style || 'solid';
                const leaves = (door.type === 'double') ? 2 : 1;
                let styleExtra = 0;
                if      (style === 'framed_melamine')                       styleExtra = _priceNum(ex.doorFramedMel, 80);
                else if (style === 'glass_melamine')                        styleExtra = _priceNum(ex.doorGlassMel, 400);
                else if (style === 'glass_black' || style === 'glass_gold') styleExtra = _priceNum(ex.doorGlassBlack, 600);
                else if (style === 'glass_mirror')                          styleExtra = _priceNum(ex.doorMirror, 350);
                finalCost += styleExtra * leaves;
            });
        });
    }

    const splitThreshold = getSplitThreshold(wing);
    if (wh > splitThreshold) {
        let topUnitCost = 0;
        if      (ww <= 160) topUnitCost = _priceNum(ex.upperUnit160, 600);
        else if (ww <= 240) topUnitCost = _priceNum(ex.upperUnit240, 900);
        else                topUnitCost = ww * _priceNum(ex.upperUnitPerCm, 3.75);
        finalCost += topUnitCost;
    }

    if (wing.corner && wing.corner.side !== 'none') {
        const cu = wing.corner;
        let cuCost = 0;
        if (cu.type === 'desk') {
            cuCost = _priceNum(ex.cornerDesk, 900);
        } else {
            const n = cu.drawerCount || 4;
            if      (n <= 3)  cuCost = _priceNum(ex.cornerDrawers3, 832);
            else if (n === 4) cuCost = _priceNum(ex.cornerDrawers4, 907);
            else              cuCost = _priceNum(ex.cornerDrawers4, 907) + (n-4)*_priceNum(ex.cornerDrawerExtra, 200);
        }
        finalCost += cuCost;
    }

    if (wing.wingPosition === 'full_corner') {
        const fc = wing.fullCorner || {};
        finalCost += _priceNum(ex.fullCornerBase, 2800);
        finalCost += (fc.shelves || 0) * _priceNum(ex.fullCornerShelf, 120);
    }

    if (wing.sideCabinet && wing.sideCabinet.side !== 'none') {
        const sc    = wing.sideCabinet;
        const scH   = wing.globalHeight || 240;
        const scMel = (sc.boardMaterial || wing.boardMaterial) === 'melamine';
        let scShelves = 0;
        if (sc.columns) sc.columns.forEach(col => { scShelves += (col.shelves||0); });
        const _calcOneSC = (scW) => {
            let base = scMel ? scW*_priceNum(ex.sideCabMel, 12) : scW*_priceNum(ex.sideCabNonMel, 15);
            if (scH > 240) base *= 1.2;
            base += scShelves * (scMel ? _priceNum(ex.extraShelfMel, 60) : _priceNum(ex.extraShelfNonMel, 80));
            if (sc.hasDoors) base += _priceNum(ex.sideCabDoors, 300);
            return Math.round(base);
        };
        if (sc.side === 'right' || sc.side === 'both') finalCost += _calcOneSC(sc.widthRight || sc.width || 40);
        if (sc.side === 'left'  || sc.side === 'both') finalCost += _calcOneSC(sc.widthLeft  || sc.width || 40);
    }

    if (wing.slidingDoor && wing.slidingDoor.enabled) {
        const sd       = wing.slidingDoor;
        const numDoors = sd.numDoors || _calcSlidingDoorCount(ww);
        let sdBase     = _priceNum(ex.slidingBase, 800) + numDoors * _priceNum(ex.slidingDoor, 350);
        if (sd.doorPanelType === 'glass')  sdBase += numDoors * _priceNum(ex.slidingGlass, 200);
        else if (sd.doorPanelType === 'mirror') sdBase += numDoors * _priceNum(ex.slidingMirror, 350);
        if (sd.profileColor === 'gold_matte') sdBase += numDoors * _priceNum(ex.slidingGold, 80);
        else if (sd.profileColor === 'black') sdBase += numDoors * _priceNum(ex.slidingBlack, 50);
        if (wh > 240) sdBase *= (1 + _priceNum(ex.slidingHeightSurcharge, 0.15));
        finalCost += Math.round(sdBase);
    }

    if (wing.columns && wing.columns.some(col => col.topPanel)) {
        const t = wing.thickness || 1.7;
        const pricePerCm = ex.topPanelPerCm != null ? ex.topPanelPerCm : 8;
        const colLeftEdges = [];
        let _cx = 0;
        for (let ci = 0; ci < wing.columns.length; ci++) {
            colLeftEdges.push(_cx);
            _cx += wing.columns[ci].width + t;
        }
        let spanStart = -1;
        for (let ci = 0; ci <= wing.columns.length; ci++) {
            const col = wing.columns[ci];
            const inSpan = col && col.topPanel;
            if (inSpan && spanStart === -1) {
                spanStart = ci;
            } else if ((!inSpan || ci === wing.columns.length) && spanStart !== -1) {
                const lastIdx = ci - 1;
                const panelW = (colLeftEdges[lastIdx] + wing.columns[lastIdx].width + t / 2) - (colLeftEdges[spanStart] - t / 2);
                finalCost += Math.round(panelW * pricePerCm);
                spanStart = -1;
            }
        }
    }

    return finalCost;
}

function _buildQuickCalcWing(w, h, d, model, isMelamine, shelves, intDrawers, extDrawers, openCells, hasDesk) {
    const compartments = [];
    if (intDrawers > 0) compartments.push({ type: 'internal_drawers', count: intDrawers });
    if (extDrawers > 0) compartments.push({ type: 'external_drawers', count: extDrawers });
    const cellType = (model === 'ab2_nohoney') ? 'side_open_cell' : 'open_cell';
    for (let i = 0; i < openCells; i++) compartments.push({ type: cellType });
    return {
        width: w,
        globalHeight: h,
        depth: d,
        boardMaterial: isMelamine ? 'melamine' : 'sandwich',
        materialBody: isMelamine ? 'white' : 'sandwich',
        cabinetModel: model,
        thickness: 1.7,
        columns: [{
            type: hasDesk ? 'desk' : 'normal',
            width: w,
            height: h,
            shelves: shelves,
            compartments: compartments,
            doors: []
        }],
        desk: { side: 'none' },
        hasDoors: false,
        corner: { side: 'none' },
        wingPosition: 'center',
        sideCabinet: { side: 'none' },
        slidingDoor: { enabled: false },
        fullCorner: {}
    };
}

function calculatePrice() {
    const cfg = _getPricingCfg();
    const ex  = cfg.extras || DEFAULT_PRICING_CONFIG.extras;

    // Sum cost across all active wings
    let totalCost = 0;
    let totalInstall = 0;
    ['center','left','right'].forEach(side => {
        const wing = state.wings[side];
        if (!wing) return;
        totalCost += _calcWingCost(cfg, wing);
        totalInstall += _calcWingInstallPrice(cfg, wing.width, wing.globalHeight);
    });

    // Wing connection surcharge
    const hasLeftWing  = state.wings.left  && state.wings.left.wingPosition  !== 'full_corner';
    const hasRightWing = state.wings.right && state.wings.right.wingPosition !== 'full_corner';
    const numRegularWings = (hasLeftWing ? 1 : 0) + (hasRightWing ? 1 : 0);
    if (numRegularWings >= 1) totalCost += numRegularWings * _priceNum(ex.wingConnection, 400);

    state.currentCostPrice    = Math.round(totalCost);
    state.currentInstallPrice = Math.round(totalInstall);

    const activeWing       = getWing();
    const profitMult       = cfg.profitMultiplier != null ? cfg.profitMultiplier : 1.7;
    const priceToCustomer  = totalCost * profitMult;
    const finalDisplayPrice = activeWing.manualPrice !== null ? activeWing.manualPrice : Math.round(priceToCustomer);

    const priceDisplayEl = document.getElementById('price-display');
    if (priceDisplayEl) priceDisplayEl.value = finalDisplayPrice;
    const resetBtn = document.getElementById('btn-reset-price');
    if (resetBtn) resetBtn.style.display = activeWing.manualPrice !== null ? 'block' : 'none';

    const hasManualInstall  = activeWing.manualInstallPrice != null;
    const finalInstallPrice = hasManualInstall ? activeWing.manualInstallPrice : state.currentInstallPrice;
    const installDisplayEl  = document.getElementById('install-price-display');
    if (installDisplayEl) installDisplayEl.value = finalInstallPrice;
    const resetInstallBtn = document.getElementById('btn-reset-install-price');
    if (resetInstallBtn) resetInstallBtn.style.display = hasManualInstall ? 'block' : 'none';
}

