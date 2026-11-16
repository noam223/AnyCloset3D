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
const KIT_UPPER_H = 70;
const KIT_UPPER_D = 35;
const KIT_UPPER_Y = 145; // floor → bottom of upper (tutorial)

/**
 * Leading stone / porcelain / quartz countertop brands commonly sold in Israel (UI examples).
 * texture = stone-like preview map shown on the worktop (local egger samples); colorHex soft-tints the map.
 */
window.KITCHEN_COUNTERTOP_BRANDS = [
    { id: 'caesarstone', label: 'אבן קיסר', kind: 'קוורץ', colorHex: 0xe8e6e1, texture: 'textures/egger/F426.jpg' },
    { id: 'silestone', label: 'Silestone', kind: 'קוורץ', colorHex: 0xf2efe8, texture: 'textures/egger/F425.jpg' },
    { id: 'dekton', label: 'Dekton', kind: 'פורצלן', colorHex: 0xc8cbcf, texture: 'textures/egger/F433.jpg' },
    { id: 'neolith', label: 'Neolith', kind: 'פורצלן', colorHex: 0xf5f5f3, texture: 'textures/egger/F381.jpg' },
    { id: 'laminam', label: 'Laminam', kind: 'פורצלן', colorHex: 0xebe4d8, texture: 'textures/egger/F275.jpg' },
    { id: 'infinity', label: 'Infinity', kind: 'פורצלן', colorHex: 0xdde1e5, texture: 'textures/egger/F424.jpg' },
    { id: 'sensa', label: 'Sensa', kind: 'שיש טבעי', colorHex: 0xd4c4a8, texture: 'textures/egger/F186.jpg' },
    { id: 'corian', label: 'Corian', kind: 'אקריל', colorHex: 0xf7f7f5, texture: 'textures/egger/W980.jpg' },
    { id: 'compac', label: 'Compac', kind: 'קוורץ', colorHex: 0xefe8dc, texture: 'textures/egger/F160.jpg' },
    { id: 'technistone', label: 'Technistone', kind: 'קוורץ', colorHex: 0xd5d2cc, texture: 'textures/egger/F638.jpg' }
];
// Back-compat alias if anything still reads the old name
window.KITCHEN_BRAND_EXAMPLES = window.KITCHEN_COUNTERTOP_BRANDS;

function _getKitWing() {
    // Prefer the active arm (center / left / right) so +60 extends the selected L leg
    if (typeof getWing === 'function') {
        const aw = getWing();
        if (aw && !aw._isUpperUnit) return aw;
    }
    return state && state.wings && state.wings.center ? state.wings.center : null;
}

/** True when this kitchen cabinet is a full L (ר) corner with a side arm. */
window._isKitchenCornerL = function() {
    if (!window._isKitchenPreset || !window._isKitchenPreset()) return false;
    const cw = state && state.wings && state.wings.center;
    if (!cw || !cw.kitchenCornerL) return false;
    return !!(state.wings.left || state.wings.right);
};

function _kitInitColumnsOnWing(wing, opts) {
    if (!wing) return;
    opts = opts || {};
    const t = wing.thickness || _kitThickness();
    const n = Math.max(1, opts.numCols != null ? opts.numCols : 2);
    const unitH = opts.height != null ? opts.height : KIT_HEIGHT;
    const topPanel = opts.topPanel !== false;
    const noPlinth = !!opts.noPlinth;
    const cols = [];
    for (let i = 0; i < n; i++) {
        const col = typeof _blankColumn === 'function'
            ? _blankColumn(KIT_UNIT_W, null)
            : {
                type: 'normal', width: KIT_UNIT_W, height: unitH,
                shelves: 0, splitY: null, shelvesY: [], compartments: [], doors: []
            };
        col.width = KIT_UNIT_W;
        col.height = unitH;
        col.topPanel = topPanel;
        col.sinkPanel = false;
        col.noPlinth = noPlinth;
        col.spaceBottomPanel = !!opts.spaceBottomPanel;
        col.floorOffset = 0;
        if (typeof distributeShelves === 'function') distributeShelves(col);
        cols.push(col);
    }
    wing.columns = cols;
    wing.width = window._kitchenTotalWidth(n, KIT_UNIT_W, t);
}

/** Build a kitchen side arm for the L corner (ר). */
function _makeKitchenCornerArm(side, opts) {
    opts = opts || {};
    const c = state.wings.center;
    const w = typeof createWingData === 'function' ? createWingData() : {};
    w.globalHeight = (c && c.globalHeight) || KIT_HEIGHT;
    w.depth = (c && c.depth) || KIT_DEPTH;
    w.thickness = (c && c.thickness) || 1.7;
    w.plinthHeight = KIT_PLINTH;
    w.boardMaterial = 'sandwich';
    w.cabinetModel = 'c9';
    w.cabinetTypeId = 'c9';
    w.kitchenRole = 'corner';
    w.kitchenCornerL = true;
    w.wingPosition = 'side';
    w.slidingDoor = w.slidingDoor || {};
    w.slidingDoor.enabled = false;
    w.orderOpts = Object.assign({}, w.orderOpts || {}, { levelingFeet: 'yes' });
    const src = opts.host || c || {};
    ['materialBody', 'materialInternal', 'materialExternal', 'materialOpenCell', 'materialBack',
        'materialTopPanel', 'handleType', 'handleStyle', 'handleVariant', 'ridingColor', 'countertopBrand'
    ].forEach(function(f) {
        if (src[f] !== undefined) w[f] = JSON.parse(JSON.stringify(src[f]));
    });
    _kitInitColumnsOnWing(w, { numCols: opts.numCols || 2, height: KIT_HEIGHT, topPanel: true });
    return w;
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

/** Each kitchen unit is a separate carcass → 2 side walls per unit (double wall between units). */
window._kitchenWallCount = function(numCols) {
    const n = Math.max(1, numCols || 1);
    return 2 * n;
};

window._kitchenTotalWidth = function(numCols, unitW, thickness) {
    const n = Math.max(1, numCols || 1);
    const t = thickness != null ? thickness : _kitThickness();
    const uw = unitW != null ? unitW : KIT_UNIT_W;
    return Math.round((n * uw + window._kitchenWallCount(n) * t) * 10) / 10;
};

window._kitchenGapBetweenUnits = function() {
    return 2 * _kitThickness();
};

function _kitInitColumns(opts) {
    opts = opts || {};
    const cw = _getKitWing();
    if (!cw) return;
    const t = _kitThickness();
    const n = Math.max(1, opts.numCols != null ? opts.numCols : 3);
    const unitH = opts.height != null ? opts.height : KIT_HEIGHT;
    const topPanel = opts.topPanel !== false;
    const noPlinth = !!opts.noPlinth;
    const cols = [];
    for (let i = 0; i < n; i++) {
        const col = typeof _blankColumn === 'function'
            ? _blankColumn(KIT_UNIT_W, null)
            : {
                type: 'normal', width: KIT_UNIT_W, height: unitH,
                shelves: 0, splitY: null, shelvesY: [], compartments: [], doors: []
            };
        col.width = KIT_UNIT_W;
        col.height = unitH;
        col.topPanel = topPanel;
        col.sinkPanel = false;
        col.noPlinth = noPlinth;
        col.spaceBottomPanel = !!opts.spaceBottomPanel;
        col.floorOffset = 0;
        if (typeof distributeShelves === 'function') distributeShelves(col);
        cols.push(col);
    }
    cw.columns = cols;
    state.columns = cols;
    _applyKitDim('width', window._kitchenTotalWidth(n, KIT_UNIT_W, t));
    if (typeof _syncColumnCountInputs === 'function') _syncColumnCountInputs(n);
}

window._isKitchenPreset = function() {
    return !!(state && state.presetId === 'kitchen');
};

window._kitchenRole = function() {
    if (!window._isKitchenPreset()) return null;
    const cw = _getKitWing();
    return (cw && cw.kitchenRole) || 'base';
};

window._isKitchenUpper = function() {
    return window._kitchenRole() === 'upper';
};

window._isKitchenCorner = function() {
    return window._kitchenRole() === 'corner';
};

/** Shared kitchen carcass setup (base / upper / corner / extra base in space). */
window._configureKitchenCarcass = function(role, opts) {
    opts = opts || {};
    role = role || 'base';
    if (!window._kitchenAdminUnlocked) {
        if (typeof _showToast === 'function') _showToast('Preset מטבח זמין רק למנהל מערכת', 3500);
        return false;
    }
    const cw = _getKitWing();
    if (!cw) return false;

    state.presetId = 'kitchen';
    cw.kitchenRole = role;
    cw.cabinetModel = 'c9';
    cw.cabinetTypeId = 'c9';
    cw.boardMaterial = 'sandwich';
    cw.slidingDoor = cw.slidingDoor || {};
    cw.slidingDoor.enabled = false;
    // Kitchen base/corner: leveling feet under carcass + external kick plinth (order note)
    if (role !== 'upper') {
        cw.orderOpts = Object.assign({}, cw.orderOpts || {}, { levelingFeet: 'yes' });
        if (typeof window._syncOrderOptsUI === 'function') window._syncOrderOptsUI();
    }

    if (opts.host) {
        ['materialBody', 'materialInternal', 'materialExternal', 'materialOpenCell', 'materialBack',
            'handleType', 'handleStyle', 'handleVariant', 'ridingColor', 'thickness', 'countertopBrand'
        ].forEach(function(f) {
            if (opts.host[f] !== undefined) cw[f] = JSON.parse(JSON.stringify(opts.host[f]));
        });
    }

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

    if (role === 'upper') {
        cw.plinthHeight = 0;
        const hostW = opts.host && opts.host.width > 0 ? opts.host.width : KIT_WIDTH;
        const t = _kitThickness();
        const n = Math.max(1, Math.round(hostW / (KIT_UNIT_W + 2 * t)) || 3);
        _applyKitDim('height', KIT_UPPER_H);
        _applyKitDim('depth', KIT_UPPER_D);
        _kitInitColumns({
            numCols: n,
            height: KIT_UPPER_H,
            topPanel: false,
            noPlinth: true,
            spaceBottomPanel: true
        });
    } else if (role === 'corner') {
        // Center arm of the L — side arm is added by _configureKitchenCornerL
        cw.plinthHeight = KIT_PLINTH;
        cw.kitchenCornerL = true;
        _applyKitDim('height', KIT_HEIGHT);
        _applyKitDim('depth', KIT_DEPTH);
        _kitInitColumns({ numCols: opts.numCols || 2, height: KIT_HEIGHT, topPanel: true });
    } else {
        cw.plinthHeight = KIT_PLINTH;
        _applyKitDim('height', KIT_HEIGHT);
        _applyKitDim('depth', KIT_DEPTH);
        if (opts.matchHostWidth && opts.host && opts.host.width > 0) {
            const t = _kitThickness();
            const n = Math.max(1, Math.round(opts.host.width / (KIT_UNIT_W + 2 * t)) || 3);
            _kitInitColumns({ numCols: n, height: KIT_HEIGHT, topPanel: true });
        } else {
            _kitInitColumns({ numCols: opts.numCols || 3, height: KIT_HEIGHT, topPanel: true });
        }
    }
    return true;
};

window._applyKitchenPreset = function() {
    if (!window._configureKitchenCarcass('base', { numCols: 3 })) {
        if (state) state.presetId = 'linear';
        return;
    }
    // Straight base run — clear any leftover L arms
    if (state.wings) {
        state.wings.left = null;
        state.wings.right = null;
        if (typeof _hideWingTab === 'function') {
            _hideWingTab('left');
            _hideWingTab('right');
        }
    }
    const cw0 = _getKitWing();
    if (cw0) delete cw0.kitchenCornerL;
    _applyKitchenRoomView();
    _updateKitchenSectionUI();
    if (typeof window._syncKitchenApplianceToolbar === 'function') {
        window._syncKitchenApplianceToolbar();
    }
};

/**
 * Full kitchen corner in ר / L shape: center arm + perpendicular side arm.
 * After creation, click an arm in 3D and use +60 to extend that arm.
 */
window._configureKitchenCornerL = function(side, opts) {
    opts = opts || {};
    side = side === 'left' ? 'left' : 'right';
    const armCols = opts.numCols != null ? opts.numCols : 2;
    if (!window._configureKitchenCarcass('corner', {
        host: opts.host,
        numCols: armCols
    })) return false;

    const cw = state.wings.center;
    if (cw) {
        cw.kitchenRole = 'corner';
        cw.kitchenCornerL = true;
        cw.kitchenCornerSide = side;
    }

    // Clear opposite arm if switching
    const other = side === 'left' ? 'right' : 'left';
    if (state.wings[other]) {
        state.wings[other] = null;
        if (typeof _hideWingTab === 'function') _hideWingTab(other);
    }

    const arm = _makeKitchenCornerArm(side, { host: opts.host || cw, numCols: armCols });
    arm.kitchenCornerSide = side;
    state.wings[side] = arm;
    if (typeof _showWingTab === 'function') _showWingTab(side);

    state.activeWing = 'center';
    state.viewMode = '3d';
    window._forceCameraAnim = true;
    window._corner3dCamPositioned = false;
    return true;
};

window.KIT_UPPER_Y = KIT_UPPER_Y;
window.KIT_UPPER_H = KIT_UPPER_H;
window.KIT_UPPER_D = KIT_UPPER_D;

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
    const t = cw.thickness || _kitThickness();
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
    const isCenterArm = state.activeWing === 'center' || (!state.wings.left && !state.wings.right);
    if (isCenterArm) state.columns = cw.columns;
    // Separate carcass: +unit width + 2 side walls
    const newW = (cw.width || KIT_WIDTH) + KIT_UNIT_W + 2 * t;
    cw.width = Math.round(newW * 10) / 10;
    if (isCenterArm) {
        _applyKitDim('width', cw.width);
    } else if (typeof updateDim === 'function') {
        // Keep wing width in sync with sidebar when editing a side arm
        updateDim('width', null, cw.width);
    }

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
    const t = cw.thickness || _kitThickness();
    cw.columns = side === 'left' ? cw.columns.slice(1) : cw.columns.slice(0, -1);
    if (state.activeWing === 'center' || (!state.wings.left && !state.wings.right)) {
        state.columns = cw.columns;
    }
    const newW = Math.max(KIT_UNIT_W + 2 * t, (cw.width || KIT_WIDTH) - remW - 2 * t);
    cw.width = Math.round(newW * 10) / 10;
    if (state.activeWing === 'center' || (!state.wings.left && !state.wings.right)) {
        _applyKitDim('width', cw.width);
    } else if (typeof updateDim === 'function') {
        updateDim('width', null, cw.width);
    }
    if (typeof _fixEdgeColumnMerges === 'function') _fixEdgeColumnMerges();
    if (typeof _syncColumnCountInputs === 'function') _syncColumnCountInputs(cw.columns.length);
    _updateKitchenSectionUI();
    if (typeof buildCabinet === 'function') buildCabinet();
    if (typeof calculatePrice === 'function') calculatePrice();
    if (typeof saveHistoryState === 'function') saveHistoryState();
};

function _syncKitchenModeClass() {
    const isKit = window._isKitchenPreset && window._isKitchenPreset();
    if (document.body) document.body.classList.toggle('kitchen-mode', !!isKit);
}

function _updateKitchenSectionUI() {
    const isKit = window._isKitchenPreset();
    _syncKitchenModeClass();
    const section = document.getElementById('kitchen-section');
    if (section) section.style.display = isKit ? '' : 'none';

    const kitTabs = document.getElementById('kitchen-unit-tabs');
    if (kitTabs) kitTabs.style.display = isKit ? '' : 'none';
    const mKitTabs = document.getElementById('mobile-kitchen-unit-tabs');
    if (mKitTabs) mKitTabs.style.display = isKit ? '' : 'none';
    // Space-cab tabs stay available in kitchen (upper / corner / extra runs)

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

    const cw = _getKitWing();
    const nUnits = (cw && cw.columns) ? cw.columns.length : 0;
    let nTotal = nUnits;
    if (window._isKitchenCornerL && window._isKitchenCornerL()) {
        nTotal = 0;
        ['center', 'left', 'right'].forEach(function(s) {
            const w = state.wings && state.wings[s];
            if (w && w.columns) nTotal += w.columns.length;
        });
    }
    ['kitchen-unit-count', 'kitchen-unit-count-header'].forEach(function(id) {
        const countEl = document.getElementById(id);
        if (countEl) countEl.textContent = String(nTotal || 0);
    });
    const kitHint = document.getElementById('kitchen-l-hint');
    if (kitHint) {
        const isL = window._isKitchenCornerL && window._isKitchenCornerL();
        kitHint.style.display = isL ? '' : 'none';
    }
    // Hide old mobile add block if still present
    const mobileKitBlock = document.getElementById('mobile-kitchen-block');
    if (mobileKitBlock) mobileKitBlock.style.display = 'none';

    // Soft height clamp for floor base cabinets only (not upper wall units)
    const role = (cw && cw.kitchenRole) || 'base';
    if (isKit && cw && (role === 'base' || role === 'corner')) {
        const h = cw.globalHeight || state.height;
        if (h != null && (h < 80 || h > 95)) {
            _applyKitDim('height', Math.max(80, Math.min(95, h)));
        }
    }

    if (typeof window._syncKitchenApplianceToolbar === 'function') {
        window._syncKitchenApplianceToolbar();
    }
    _syncKitchenCountertopBrandsPanel();
    if (isKit) {
        // Keep bedroom furniture hidden; never force a floor kind
        if (window._bedVisible !== false || window._chairVisible !== false) {
            _applyKitchenRoomView();
        } else {
            _syncKitchenRoomFurnitureUI();
        }
    } else {
        _syncKitchenRoomFurnitureUI();
        const brandPanel = document.getElementById('kitchen-countertop-brands-panel');
        if (brandPanel) brandPanel.style.display = 'none';
    }
}

function _kitCountertopBrandId() {
    const cw = _getKitWing();
    return (cw && cw.countertopBrand) || (state && state.countertopBrand) || '';
}

function _syncKitchenCountertopBrandsPanel() {
    const panel = document.getElementById('kitchen-countertop-brands-panel');
    if (!panel) return;
    const isKit = window._isKitchenPreset && window._isKitchenPreset();
    const role = window._kitchenRole ? window._kitchenRole() : 'base';
    const onTopTab = !!(state && state.activeColorPart === 'materialTopPanel');
    const show = isKit && onTopTab && role !== 'upper';
    panel.style.display = show ? '' : 'none';
    if (show) _renderKitchenBrandExamples();
}

function _renderKitchenBrandExamples() {
    const host = document.getElementById('kitchen-brand-examples');
    if (!host) return;
    const brands = window.KITCHEN_COUNTERTOP_BRANDS || [];
    if (host.dataset.ready !== 'countertop-v3') {
        host.innerHTML = brands.map(function(b) {
            const thumb = b.texture
                ? '<img src="' + b.texture + '" alt="" style="width:22px;height:22px;border-radius:5px;object-fit:cover;border:1px solid rgba(0,0,0,0.12);flex-shrink:0;">'
                : '<span style="width:22px;height:22px;border-radius:5px;background:#' +
                    (b.colorHex != null ? b.colorHex.toString(16).padStart(6, '0') : 'ddd') +
                    ';border:1px solid rgba(0,0,0,0.12);flex-shrink:0;"></span>';
            return '<button type="button" class="kit-brand-chip" data-brand="' + b.id + '" ' +
                'onclick="window._setKitchenCountertopBrand(\'' + b.id + '\')" ' +
                'title="' + (b.kind || 'משטח') + '" ' +
                'style="padding:5px 9px;border-radius:10px;border:1.5px solid var(--border);background:var(--bg-light);' +
                'color:var(--text-dark);font-size:0.72rem;font-weight:700;cursor:pointer;font-family:inherit;display:inline-flex;align-items:center;gap:6px;">' +
                thumb + b.label +
                (b.kind ? '<span style="font-size:0.62rem;font-weight:600;opacity:0.65;">' + b.kind + '</span>' : '') +
                '</button>';
        }).join('');
        host.dataset.ready = 'countertop-v3';
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

function _kitApplyBrandToAllArms(brandId, clear) {
    ['center', 'left', 'right'].forEach(function(s) {
        const w = state && state.wings && state.wings[s];
        if (!w) return;
        if (clear) delete w.countertopBrand;
        else w.countertopBrand = brandId;
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
        _kitApplyBrandToAllArms(brandId, true);
        if (state) delete state.countertopBrand;
    } else {
        _kitApplyBrandToAllArms(brandId, false);
        if (state) state.countertopBrand = brandId;
        // Switch colors UI to משטח and clear competing material highlight
        state.activeColorPart = 'materialTopPanel';
        document.querySelectorAll('.part-tab-btn').forEach(b => {
            b.classList.toggle('active', b.getAttribute('data-part') === 'materialTopPanel');
        });
        document.querySelectorAll('.material-btn').forEach(b => b.classList.remove('active'));
    }
    _syncKitchenCountertopBrandsPanel();
    _renderKitchenBrandExamples();
    if (typeof buildCabinet === 'function') buildCabinet();
    if (typeof saveHistoryState === 'function') saveHistoryState();
};

window._clearKitchenCountertopBrand = function() {
    _kitApplyBrandToAllArms(null, true);
    if (state) delete state.countertopBrand;
    _renderKitchenBrandExamples();
};

window._kitchenCountertopBrand = function() {
    const id = _kitCountertopBrandId();
    return (window.KITCHEN_COUNTERTOP_BRANDS || []).find(b => b.id === id) || null;
};

window._kitchenBrandLabel = function(brandId) {
    const hit = (window.KITCHEN_COUNTERTOP_BRANDS || []).find(b => b.id === brandId);
    return hit ? hit.label : '';
};

/** Load / cache a repeating stone preview map for a brand example. */
window._kitchenBrandTexture = function(brand) {
    if (!brand || !brand.texture || typeof THREE === 'undefined') return null;
    if (!window._kitCtTexCache) window._kitCtTexCache = {};
    const key = brand.texture;
    const hit = window._kitCtTexCache[key];
    if (hit && hit.map) return hit.map;
    if (hit && hit.loading) return null;
    window._kitCtTexCache[key] = { loading: true, map: null };
    const loader = new THREE.TextureLoader();
    loader.load(brand.texture + (brand.texture.indexOf('?') >= 0 ? '' : '?v=20261116ct'), function(tex) {
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(2.2, 2.2);
        if (tex.colorSpace !== undefined && THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
        else if (tex.encoding !== undefined && THREE.sRGBEncoding) tex.encoding = THREE.sRGBEncoding;
        window._kitCtTexCache[key] = { loading: false, map: tex };
        // Rebuild so the worktop picks up the loaded map
        if (window._isKitchenPreset && window._isKitchenPreset() && typeof buildCabinet === 'function') {
            buildCabinet();
        }
    }, undefined, function() {
        window._kitCtTexCache[key] = { loading: false, map: null };
    });
    return null;
};

/** Preview material for kitchen worktop when a countertop brand example is selected. */
window._kitchenCountertopMaterial = function(fallbackMat) {
    const brand = window._kitchenCountertopBrand && window._kitchenCountertopBrand();
    if (!brand || typeof THREE === 'undefined') return fallbackMat;
    if (!window._kitCtMatCache) window._kitCtMatCache = {};
    const map = window._kitchenBrandTexture(brand);
    const key = brand.id + '-' + brand.colorHex + (map ? '-tex' : '-solid');
    if (!window._kitCtMatCache[key]) {
        const mat = new THREE.MeshStandardMaterial({
            // Keep a light tint over the texture so brands stay distinct
            color: map ? 0xffffff : brand.colorHex,
            map: map || null,
            roughness: brand.kind === 'פורצלן' ? 0.28 : (brand.kind === 'שיש טבעי' ? 0.5 : 0.38),
            metalness: brand.kind === 'פורצלן' ? 0.08 : 0.03,
            envMap: window._studioEnvMap || null,
            envMapIntensity: brand.kind === 'פורצלן' ? 0.55 : 0.25
        });
        if (map && brand.colorHex != null) {
            // Soft brand tint without killing the texture detail
            mat.color.setHex(brand.colorHex);
            mat.color.lerp(new THREE.Color(0xffffff), 0.55);
        }
        window._kitCtMatCache[key] = mat;
    } else {
        const mat = window._kitCtMatCache[key];
        if (map && mat.map !== map) {
            mat.map = map;
            mat.needsUpdate = true;
        }
        if (window._studioEnvMap && mat.envMap !== window._studioEnvMap) {
            mat.envMap = window._studioEnvMap;
            mat.needsUpdate = true;
        }
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
window._syncKitchenCountertopBrandsPanel = _syncKitchenCountertopBrandsPanel;

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
    _syncKitchenModeClass();
});
