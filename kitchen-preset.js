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
/** Temporary kitchen quote: ₪ per linear meter (customer price). Appliances not priced. */
const KIT_PRICE_PER_METER = 1300;
window.KIT_PRICE_PER_METER = KIT_PRICE_PER_METER;

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

/** Near-zero width for the empty corner stub — wide stubs left a visible gap beside the main run. */
const KIT_CORNER_STUB_W = 0.2;

function _getKitWing() {
    // Prefer the active arm (center / left / right) so +60 extends the selected L leg
    if (typeof getWing === 'function') {
        const aw = getWing();
        if (aw && !aw._isUpperUnit) {
            // Empty corner stub is only an L anchor — +60 / delete must hit the L arm
            if (aw.kitchenCornerL && (!aw.columns || !aw.columns.length) && state.activeWing === 'center') {
                if (state.wings.right && state.wings.right.kitchenCornerL) return state.wings.right;
                if (state.wings.left && state.wings.left.kitchenCornerL) return state.wings.left;
            }
            return aw;
        }
    }
    return state && state.wings && state.wings.center ? state.wings.center : null;
}

/** Shrink legacy empty stubs (width≈56) so the ר sits flush against adjacent runs. */
window._normalizeKitchenCornerStub = function() {
    if (!window._isKitchenPreset || !window._isKitchenPreset()) return false;
    const cw = state && state.wings && state.wings.center;
    if (!cw || !cw.kitchenCornerL) return false;
    if (cw.columns && cw.columns.length) return false;
    if (cw.width != null && cw.width <= 1) return false;
    const prevW = cw.width;
    cw.width = KIT_CORNER_STUB_W;
    if (state.activeWing === 'center') {
        try { state.columns = []; } catch (e) { /* proxy */ }
    }
    // Pull the corner toward its space neighbor by ~half the removed stub width
    if (prevW > 10 && typeof window._getSpacePairInfo === 'function' && typeof window._setSpaceOffset === 'function') {
        const info = window._getSpacePairInfo();
        if (info && info.count >= 2 && info.activeSlot > 0) {
            const side = (state.wings.right && state.wings.right.kitchenCornerL) ? 'right'
                : (state.wings.left && state.wings.left.kitchenCornerL) ? 'left' : null;
            const cur = (typeof window._spaceOffsetForSlot === 'function')
                ? window._spaceOffsetForSlot(info.activeSlot) : { x: 0, y: 0, z: 0 };
            const dx = (prevW - KIT_CORNER_STUB_W) / 2;
            const nextX = (cur.x || 0) - (side === 'left' ? -dx : dx);
            window._setSpaceOffset(nextX, cur.y || 0, {
                z: cur.z || 0,
                rot: cur.rot || 0,
                silent: true
            });
        }
    }
    return true;
};

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
    // Israeli-typical kitchen corner: full L corner carcass with shelves
    w.wingPosition = 'full_corner';
    w.fullCorner = {
        size: 90,
        shelves: 2,
        shelvesY: [],
        compartments: []
    };
    w.slidingDoor = w.slidingDoor || {};
    w.slidingDoor.enabled = false;
    w.orderOpts = Object.assign({}, w.orderOpts || {}, { levelingFeet: 'yes' });
    const src = opts.host || c || {};
    ['materialBody', 'materialInternal', 'materialExternal', 'materialOpenCell', 'materialBack',
        'materialTopPanel', 'handleType', 'handleStyle', 'handleVariant', 'ridingColor', 'countertopBrand'
    ].forEach(function(f) {
        if (src[f] !== undefined) w[f] = JSON.parse(JSON.stringify(src[f]));
    });
    // No return units by default — only the full corner; user extends with +60
    const nArm = opts.numCols != null ? opts.numCols : 0;
    if (nArm <= 0) {
        w.columns = [];
        w.width = (w.fullCorner && w.fullCorner.size) || 90;
    } else {
        _kitInitColumnsOnWing(w, { numCols: nArm, height: KIT_HEIGHT, topPanel: true });
    }
    if (typeof window._distributeFullCornerShelves === 'function') {
        window._distributeFullCornerShelves(w);
    }
    return w;
}

function _applyKitDim(dim, value) {
    // Width never goes through updateDim for kitchen — that path rescales units.
    if (dim === 'width') {
        const cw = _getKitWing();
        if (!cw) return;
        if (!cw.columns || !cw.columns.length) cw.width = value;
        window._kitchenCommitRunWidth(cw);
        return;
    }
    if (typeof updateDim === 'function') {
        updateDim(dim, null, value);
        return;
    }
    const cw = _getKitWing();
    if (!cw) return;
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

/** Total run width from actual column carcass widths (double side walls per unit). */
window._kitchenWidthFromColumns = function(cols, thickness) {
    const list = Array.isArray(cols) ? cols : [];
    const t = thickness != null ? thickness : _kitThickness();
    if (!list.length) return 0;
    const inner = list.reduce(function(sum, col) {
        return sum + ((col && col.width) || KIT_UNIT_W);
    }, 0);
    return Math.round((inner + window._kitchenWallCount(list.length) * t) * 10) / 10;
};

window._kitchenGapBetweenUnits = function() {
    return 2 * _kitThickness();
};

/**
 * Commit kitchen run width from columns without proportional rescale.
 * Wardrobe updateDim rescale was crushing fixed 60cm units.
 */
window._kitchenCommitRunWidth = function(wing) {
    wing = wing || _getKitWing();
    if (!wing) return 0;
    const t = wing.thickness || _kitThickness();
    const cols = wing.columns || [];
    let newW;
    if (!cols.length) {
        newW = wing.kitchenCornerL ? KIT_CORNER_STUB_W : (KIT_UNIT_W + 2 * t);
    } else {
        newW = window._kitchenWidthFromColumns(cols, t);
    }
    wing.width = newW;
    try {
        const wEl = document.getElementById('inp-width');
        const nEl = document.getElementById('inp-num-width');
        const pill = document.getElementById('dim-pill-width');
        const mobile = document.getElementById('mobile-inp-num-width');
        if (wEl) wEl.value = newW;
        if (nEl) nEl.value = newW;
        if (pill) pill.value = Math.round(newW);
        if (mobile) mobile.value = newW;
    } catch (e) { /* DOM may be unavailable during early init */ }
    return newW;
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
    window._kitchenCommitRunWidth(cw);
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
        // Center anchors the L; may keep an existing straight run or stay an empty stub.
        cw.plinthHeight = KIT_PLINTH;
        cw.kitchenCornerL = true;
        _applyKitDim('height', KIT_HEIGHT);
        _applyKitDim('depth', KIT_DEPTH);
        if (opts.columns && opts.columns.length) {
            // In-place convert: keep the cabinets the user already built
            cw.columns = JSON.parse(JSON.stringify(opts.columns));
            state.columns = cw.columns;
            window._kitchenCommitRunWidth(cw);
            if (typeof _syncColumnCountInputs === 'function') _syncColumnCountInputs(cw.columns.length);
        } else {
            const nCorner = opts.numCols != null ? opts.numCols : 0;
            if (nCorner <= 0) {
                cw.columns = [];
                state.columns = [];
                // Tiny stub so only the full-corner L is visible and sits flush next to adjacent runs.
                cw.kitchenCornerL = true;
                window._kitchenCommitRunWidth(cw);
                // Re-clear in case anything still tried to seed a column
                cw.columns = [];
                state.columns = [];
                if (typeof _syncColumnCountInputs === 'function') _syncColumnCountInputs(0);
            } else {
                _kitInitColumns({ numCols: nCorner, height: KIT_HEIGHT, topPanel: true });
            }
        }
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
 * Convert the current kitchen cabinet into a corner L (in place).
 * Does NOT add a second space cabinet next to the existing run.
 */
window._kitchenMakeCorner = function() {
    if (!window._kitchenAdminUnlocked) {
        if (typeof _showToast === 'function') _showToast('Preset מטבח זמין רק למנהל מערכת', 3500);
        return;
    }
    const old = document.getElementById('_corner-side-popup');
    if (old) old.remove();
    const popup = document.createElement('div');
    popup.id = '_corner-side-popup';
    popup.className = 'corner-side-popup';
    popup.innerHTML =
        '<div class="corner-side-popup-title">פינת מטבח — ר מלאה עם מדפים</div>' +
        '<div class="corner-side-popup-btns">' +
        '<button type="button" data-side="right"><i class="fa-solid fa-arrow-right"></i> ר ימין</button>' +
        '<button type="button" data-side="left"><i class="fa-solid fa-arrow-left"></i> ר שמאל</button>' +
        '</div>' +
        '<button type="button" class="corner-side-popup-cancel">ביטול</button>';
    document.body.appendChild(popup);
    const close = function() {
        popup.remove();
        document.removeEventListener('mousedown', outside, true);
    };
    const outside = function(e) { if (!popup.contains(e.target)) close(); };
    popup.querySelectorAll('button[data-side]').forEach(function(b) {
        b.addEventListener('click', function() {
            close();
            const side = b.dataset.side === 'left' ? 'left' : 'right';
            // Convert the main run in place — never wipe existing units
            if (state.wings && state.wings.center) {
                state.activeWing = 'center';
                if (typeof syncSidebarToWing === 'function') syncSidebarToWing();
            }
            const host = (state.wings && state.wings.center) || _getKitWing();
            const cols = host && host.columns && host.columns.length
                ? JSON.parse(JSON.stringify(host.columns))
                : [];
            if (typeof window._configureKitchenCornerL === 'function') {
                window._configureKitchenCornerL(side, {
                    host: host,
                    columns: cols
                });
            }
            if (typeof buildCabinet === 'function') buildCabinet();
            if (typeof calculatePrice === 'function') calculatePrice();
            if (typeof saveHistoryState === 'function') saveHistoryState();
            if (typeof window._updateKitchenSectionUI === 'function') window._updateKitchenSectionUI();
            if (typeof window._syncKitchenApplianceToolbar === 'function') window._syncKitchenApplianceToolbar();
        });
    });
    popup.querySelector('.corner-side-popup-cancel').addEventListener('click', close);
    setTimeout(function() { document.addEventListener('mousedown', outside, true); }, 0);
};

/**
 * Kitchen corner (ר): full corner with shelves (IL standard).
 * Pass opts.columns to keep an existing straight run on center; arm stays empty for +60.
 * Fresh space kitchenCorner uses empty stub (no columns).
 */
window._configureKitchenCornerL = function(side, opts) {
    opts = opts || {};
    side = side === 'left' ? 'left' : 'right';
    const preserved = opts.columns && opts.columns.length
        ? JSON.parse(JSON.stringify(opts.columns))
        : null;
    const armCols = opts.armCols != null ? opts.armCols : 0;
    if (!window._configureKitchenCarcass('corner', {
        host: opts.host,
        columns: preserved || undefined,
        numCols: preserved ? preserved.length : (opts.numCols != null ? opts.numCols : 0)
    })) return false;

    const cw = state.wings.center;
    if (cw) {
        cw.kitchenRole = 'corner';
        cw.kitchenCornerL = true;
        cw.kitchenCornerSide = side;
        // Carcass may have cleared/rebuilt — restore exact units if we had them
        if (preserved && preserved.length) {
            cw.columns = preserved;
            state.columns = preserved;
            if (typeof window._kitchenCommitRunWidth === 'function') {
                window._kitchenCommitRunWidth(cw);
            }
        }
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

    // Keep focus on the preserved run when converting in place; otherwise the L arm
    const hasRun = !!(cw && cw.columns && cw.columns.length);
    state.activeWing = hasRun ? 'center' : side;
    state.viewMode = '3d';
    window._forceCameraAnim = true;
    window._corner3dCamPositioned = false;
    if (typeof syncSidebarToWing === 'function') syncSidebarToWing();
    if (typeof _showToast === 'function') {
        _showToast(hasRun
            ? 'פינת ר נוספה — היחידות הקיימות נשמרו. הוסיפו לזרוע עם +60'
            : 'פינת ר מלאה עם מדפים — הוסיפו יחידות עם +60 להמשך הזרועות', 4000);
    }
    return true;
};

/** Linear meters of the active kitchen (all arms). */
window._kitchenLinearMeters = function() {
    if (!window._isKitchenPreset || !window._isKitchenPreset()) return 0;
    let cm = 0;
    ['center', 'left', 'right'].forEach(function(s) {
        const w = state.wings && state.wings[s];
        if (!w) return;
        // Empty corner stub is only an L anchor — do not bill its width
        if (s === 'center' && w.kitchenCornerL && (!w.columns || !w.columns.length)) return;
        // Full-corner arm: count L block + return units (empty arm stores size as width only once)
        if (w.wingPosition === 'full_corner' && w.fullCorner) {
            const fc = w.fullCorner.size || 90;
            const hasCols = !!(w.columns && w.columns.length);
            cm += hasCols ? (fc + (w.width || 0)) : fc;
            return;
        }
        cm += w.width || 0;
    });
    return Math.round((cm / 100) * 100) / 100;
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
    if (!Array.isArray(cw.columns)) cw.columns = [];
    const liveCols = cw.columns;
    const template = liveCols.length
        ? (side === 'left' ? liveCols[0] : liveCols[liveCols.length - 1])
        : null;
    const newCol = typeof _blankColumn === 'function'
        ? _blankColumn(KIT_UNIT_W, template)
        : {
            type: 'normal', width: KIT_UNIT_W, height: cw.globalHeight || KIT_HEIGHT,
            shelves: 0, splitY: null, shelvesY: [], compartments: [], doors: [],
            floorOffset: 0, topPanel: true, sinkPanel: false, noPlinth: false
        };
    newCol.width = KIT_UNIT_W;
    newCol.sinkPanel = false;
    newCol.height = cw.globalHeight || KIT_HEIGHT;
    // Preserve upper-unit flags — do not force base plinth/worktop onto wall cabinets
    const isUpper = cw.kitchenRole === 'upper' ||
        (typeof window._isKitchenUpper === 'function' && window._isKitchenUpper());
    if (isUpper) {
        newCol.topPanel = false;
        newCol.noPlinth = true;
        newCol.spaceBottomPanel = true;
    } else {
        newCol.topPanel = true;
        newCol.noPlinth = false;
        newCol.spaceBottomPanel = false;
    }

    cw.columns = side === 'left' ? [newCol].concat(liveCols) : liveCols.concat([newCol]);
    const isCenterArm = state.activeWing === 'center' || (!state.wings.left && !state.wings.right);
    if (isCenterArm) state.columns = cw.columns;
    // Keep unit carcass widths intact — grow the run by 2 side walls + unit
    window._kitchenCommitRunWidth(cw);

    if (typeof _fixEdgeColumnMerges === 'function') _fixEdgeColumnMerges();
    if (typeof _syncColumnCountInputs === 'function') _syncColumnCountInputs(cw.columns.length);
    _updateKitchenSectionUI();
    if (typeof buildCabinet === 'function') buildCabinet();
    if (typeof calculatePrice === 'function') calculatePrice();
    if (typeof saveHistoryState === 'function') saveHistoryState();
};

/** Remove one kitchen unit by column index (middle units allowed — run stays one cabinet). */
window._kitchenRemoveUnitAt = function(idx) {
    if (!window._isKitchenPreset()) return false;
    const cw = _getKitWing();
    if (!cw || !cw.columns) return false;
    const cols = cw.columns;
    if (cols.length <= 1) {
        if (typeof _showToast === 'function') _showToast('חייבת להישאר לפחות יחידה אחת', 3000);
        return false;
    }
    idx = parseInt(idx, 10);
    if (isNaN(idx) || idx < 0 || idx >= cols.length) return false;

    cw.columns = cols.slice(0, idx).concat(cols.slice(idx + 1));
    const isCenterArm = state.activeWing === 'center' || (!state.wings.left && !state.wings.right);
    if (isCenterArm) state.columns = cw.columns;
    window._kitchenCommitRunWidth(cw);

    // Clear selection so UI doesn't point at a removed column
    if (state.selection) {
        if (state.selection.colIndex === idx) {
            state.selection = { colIndex: -1, rows: [] };
        } else if (state.selection.colIndex > idx) {
            state.selection.colIndex -= 1;
        }
    }
    if (state.activeEditCol === idx) state.activeEditCol = -1;
    else if (state.activeEditCol > idx) state.activeEditCol -= 1;

    if (typeof _fixEdgeColumnMerges === 'function') _fixEdgeColumnMerges();
    if (typeof _syncColumnCountInputs === 'function') _syncColumnCountInputs(cw.columns.length);
    _updateKitchenSectionUI();
    if (typeof window._syncKitchenDeleteSelectedUI === 'function') window._syncKitchenDeleteSelectedUI();
    if (typeof updateQuickEditPanelUI === 'function') updateQuickEditPanelUI();
    if (typeof buildCabinet === 'function') buildCabinet();
    if (typeof calculatePrice === 'function') calculatePrice();
    if (typeof saveHistoryState === 'function') saveHistoryState();
    return true;
};

/** Remove the currently selected kitchen unit (any position in the run). */
window._kitchenRemoveSelectedUnit = function() {
    if (!window._isKitchenPreset()) return;
    let idx = -1;
    if (state.selection && state.selection.colIndex >= 0) idx = state.selection.colIndex;
    else if (state.activeEditCol >= 0) idx = state.activeEditCol;
    if (idx < 0) {
        if (typeof _showToast === 'function') {
            _showToast('בחרו יחידה (לחיצה על העמודה) ואז מחקו אותה', 3500);
        }
        return;
    }
    window._kitchenRemoveUnitAt(idx);
};

window._kitchenRemoveUnit = function(side) {
    if (!window._isKitchenPreset()) return;
    const cw = _getKitWing();
    if (!cw || !cw.columns || cw.columns.length <= 1) {
        if (typeof _showToast === 'function') _showToast('חייבת להישאר לפחות יחידה אחת', 3000);
        return;
    }
    // Prefer deleting the selected unit when one is selected
    const sel = (state.selection && state.selection.colIndex >= 0)
        ? state.selection.colIndex
        : (state.activeEditCol >= 0 ? state.activeEditCol : -1);
    if (sel >= 0 && sel < cw.columns.length) {
        window._kitchenRemoveUnitAt(sel);
        return;
    }
    side = side === 'left' ? 'left' : 'right';
    const idx = side === 'left' ? 0 : cw.columns.length - 1;
    window._kitchenRemoveUnitAt(idx);
};

window._syncKitchenDeleteSelectedUI = function() {
    const isKit = window._isKitchenPreset && window._isKitchenPreset();
    const hasSel = isKit && (
        (state.selection && state.selection.colIndex >= 0) ||
        (state.activeEditCol >= 0)
    );
    const qeGroup = document.getElementById('qe-kitchen-delete-group');
    if (qeGroup) qeGroup.style.display = hasSel ? '' : 'none';
    ['btn-kitchen-remove-selected', 'mobile-btn-kitchen-remove-selected'].forEach(function(id) {
        const btn = document.getElementById(id);
        if (!btn) return;
        btn.style.display = isKit ? 'inline-flex' : 'none';
        btn.disabled = !hasSel;
        btn.style.opacity = hasSel ? '1' : '0.45';
        btn.title = hasSel
            ? 'מחק את היחידה הנבחרת מהשורה'
            : 'בחרו יחידה בהדמיה כדי למחוק אותה';
    });
};

function _syncKitchenModeClass() {
    const isKit = window._isKitchenPreset && window._isKitchenPreset();
    if (document.body) document.body.classList.toggle('kitchen-mode', !!isKit);
}

function _updateKitchenSectionUI() {
    const isKit = window._isKitchenPreset();
    _syncKitchenModeClass();
    // Kitchen must stay in free edit — wing-edit isolates an arm and drops cell overlays
    if (isKit && state && state.wingEditMode && typeof window.confirmWingEdit === 'function') {
        window.confirmWingEdit();
    }
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
    if (typeof window._syncKitchenDeleteSelectedUI === 'function') {
        window._syncKitchenDeleteSelectedUI();
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

/** One 60cm kitchen bay — optional appliance + door. */
function _kitMakeShowcaseCol(spec) {
    spec = spec || {};
    const baseH = KIT_HEIGHT;
    const col = typeof _blankColumn === 'function'
        ? _blankColumn(KIT_UNIT_W, null)
        : {
            type: 'normal', width: KIT_UNIT_W, height: baseH,
            shelves: 0, splitY: null, shelvesY: [], compartments: [], doors: [],
            floorOffset: 0
        };
    col.width = KIT_UNIT_W;
    col.height = baseH;
    col.topPanel = true;
    col.sinkPanel = false;
    col.noPlinth = false;
    col.floorOffset = 0;
    if (typeof distributeShelves === 'function') distributeShelves(col);
    if (!col.compartments || !col.compartments.length) {
        col.compartments = [{ type: 'empty' }];
    }
    const appliance = spec.appliance || null;
    if (appliance) {
        const comp = col.compartments[0];
        comp.type = 'empty';
        comp.appliances = [appliance];
        delete comp.partition;
        delete comp.partitions;
        delete comp.subCells;
        delete comp.tv;
        if (appliance === 'fridge') {
            col._kitFridgePrev = { height: baseH, topPanel: true };
            col.height = (window.KITCHEN_RULES && window.KITCHEN_RULES.dims && window.KITCHEN_RULES.dims.fridge)
                ? window.KITCHEN_RULES.dims.fridge.H : 177;
            col.topPanel = false;
        }
    }
    const blocksDoor = !!(appliance && window.KITCHEN_RULES && window.KITCHEN_RULES.blocksDoor
        && window.KITCHEN_RULES.blocksDoor[appliance]);
    if (spec.door && !blocksDoor && col.compartments.length) {
        col.doors = [{
            startRow: 0,
            endRow: Math.max(0, col.compartments.length - 1),
            type: spec.door
        }];
    } else {
        col.doors = [];
    }
    return col;
}

/** Kitchen wall cabinets above a base/corner arm. */
function _kitAttachShowcaseUpper(parentId) {
    const parent = state.wings && state.wings[parentId];
    if (!parent || !parent.columns || !parent.columns.length) return null;
    const key = 'upperUnit_' + parentId;
    const gap = Math.max(20, KIT_UPPER_Y - (parent.globalHeight || KIT_HEIGHT));
    const uu = typeof createWingData === 'function' ? createWingData() : {};
    uu.globalHeight = KIT_UPPER_H;
    uu.depth = KIT_UPPER_D;
    uu.thickness = parent.thickness || _kitThickness();
    uu.plinthHeight = 0;
    uu.boardMaterial = 'sandwich';
    uu.cabinetModel = 'c9';
    uu.cabinetTypeId = 'c9';
    uu.kitchenRole = 'upper';
    uu.hasDoors = true;
    uu.wingPosition = 'front';
    uu._isUpperUnit = true;
    uu._upperGap = gap;
    uu._upperOffsetX = 0;
    uu._parentWingId = parentId;
    uu.slidingDoor = { enabled: false };
    ['materialBody', 'materialInternal', 'materialExternal', 'materialOpenCell', 'materialBack',
        'handleType', 'handleStyle', 'handleVariant', 'ridingColor'
    ].forEach(function(f) {
        if (parent[f] !== undefined) uu[f] = JSON.parse(JSON.stringify(parent[f]));
    });
    const cols = [];
    parent.columns.forEach(function(pc, i) {
        const col = typeof _blankColumn === 'function'
            ? _blankColumn(KIT_UNIT_W, null)
            : {
                type: 'normal', width: KIT_UNIT_W, height: KIT_UPPER_H,
                shelves: 1, splitY: null, shelvesY: [], compartments: [], doors: []
            };
        col.width = KIT_UNIT_W;
        col.height = KIT_UPPER_H;
        col.topPanel = false;
        col.noPlinth = true;
        col.spaceBottomPanel = true;
        col.floorOffset = 0;
        if (typeof distributeShelves === 'function') distributeShelves(col);
        if (!col.compartments || !col.compartments.length) {
            col.compartments = [{ type: 'empty' }];
        }
        // No upper bay above the fridge tower
        const isFridge = !!(pc && (pc._kitFridgePrev || (pc.height || 0) > (parent.globalHeight || KIT_HEIGHT) + 20));
        if (!isFridge) {
            col.doors = [{
                startRow: 0,
                endRow: Math.max(0, col.compartments.length - 1),
                type: (i % 2) ? 'left' : 'right'
            }];
        } else {
            col.doors = [];
            // Keep open carcass above fridge so width still matches the run
            col.compartments.forEach(function(c) { if (c) c.type = 'empty'; });
        }
        cols.push(col);
    });
    uu.columns = cols;
    uu.width = window._kitchenWidthFromColumns(cols, uu.thickness);
    state.wings[key] = uu;
    return uu;
}

function _kitApplyShowcaseMaterials(wing) {
    if (!wing) return;
    wing.boardMaterial = 'sandwich';
    wing.cabinetModel = 'c9';
    wing.cabinetTypeId = 'c9';
    wing.materialBody = wing.materialBody || 'white_matte';
    wing.materialInternal = wing.materialInternal || 'white_matte';
    wing.materialExternal = wing.materialExternal || 'white_matte';
    wing.materialOpenCell = wing.materialOpenCell || 'white_matte';
    wing.materialBack = wing.materialBack || 'white_matte';
    wing.handleType = 'standard';
    wing.handleStyle = 'pipe';
    wing.handleVariant = 'pipe_black';
    wing.hasDoors = true;
    wing.orderOpts = Object.assign({}, wing.orderOpts || {}, { levelingFeet: 'yes' });
}

/**
 * Build a complete ~4m × 4m L kitchen in place:
 * fridge · cabinet · oven · cabinet · dishwasher · sink · ר + return run,
 * wall uppers on both arms, coloured stone worktop.
 */
window._buildKitchenShowcase4x4 = function() {
    window._kitchenAdminUnlocked = true;
    if (typeof window._setKitchenPresetButtonsVisible === 'function') {
        window._setKitchenPresetButtonsVisible(true);
    }
    // Seed a kitchen carcass so wings / materials exist
    if (!window._configureKitchenCarcass('base', { numCols: 1 })) {
        if (typeof _showToast === 'function') _showToast('לא ניתן לבנות מטבח לדוגמה', 3500);
        return false;
    }

    const cw = state.wings.center;
    _kitApplyShowcaseMaterials(cw);
    cw.globalHeight = KIT_HEIGHT;
    cw.depth = KIT_DEPTH;
    cw.plinthHeight = KIT_PLINTH;
    cw.cabinetName = 'מטבח 4×4';
    state.cabinetName = 'מטבח 4×4';
    state.presetId = 'kitchen';

    // Main wall ≈ 3.8m (6×60 + walls) ending at the corner; return ≈ 4.1m (ר 90 + 5×60)
    // Door types must be engine ids: left | right | double | flap
    const centerPlan = [
        { appliance: 'fridge' },
        { door: 'right' },
        { appliance: 'oven' },
        { door: 'left' },
        { appliance: 'dishwasher' },
        { appliance: 'sink', door: 'right' }
    ];
    const armPlan = [
        { door: 'left' },
        { door: 'right' },
        { door: 'left' },
        { door: 'right' },
        { door: 'left' }
    ];
    const centerCols = centerPlan.map(function(spec) { return _kitMakeShowcaseCol(spec); });

    if (!window._configureKitchenCornerL('right', {
        host: cw,
        columns: centerCols,
        armCols: 0
    })) return false;

    const arm = state.wings.right;
    if (!arm) return false;
    _kitApplyShowcaseMaterials(arm);
    arm.columns = armPlan.map(function(spec) { return _kitMakeShowcaseCol(spec); });
    window._kitchenCommitRunWidth(arm);

    // Recenter materials / brand after corner rebuild
    ['center', 'right'].forEach(function(s) {
        _kitApplyShowcaseMaterials(state.wings[s]);
    });
    if (state.wings.center) {
        state.wings.center.columns = centerCols;
        state.columns = centerCols;
        window._kitchenCommitRunWidth(state.wings.center);
    }

    _kitApplyBrandToAllArms('sensa', false);
    state.countertopBrand = 'sensa';
    state.activeColorPart = 'materialTopPanel';

    // Clear leftover uppers then attach kitchen wall cabinets
    Object.keys(state.wings || {}).forEach(function(k) {
        if (k.indexOf('upperUnit_') === 0) delete state.wings[k];
    });
    _kitAttachShowcaseUpper('center');
    _kitAttachShowcaseUpper('right');

    state.activeWing = 'center';
    state._activeUpperUnit = null;
    state._activeUpperUnitParent = null;
    state.viewMode = '3d';
    state.selection = { colIndex: -1, rows: [] };
    window._orbitFree = false;
    window._forceCameraAnim = true;
    window._corner3dCamPositioned = false;

    // Keep preset chips in sync (kitchen active, not linear)
    const kitBtn = document.getElementById('preset-btn-kitchen');
    const mobileKit = document.getElementById('mobile-preset-btn-kitchen');
    document.querySelectorAll('.preset-btn').forEach(function(b) { b.classList.remove('active'); });
    if (kitBtn) kitBtn.classList.add('active');
    if (mobileKit) mobileKit.classList.add('active');

    if (typeof syncSidebarToWing === 'function') syncSidebarToWing();
    if (typeof buildCabinet === 'function') buildCabinet();
    if (typeof updateCameraView === 'function') updateCameraView();
    if (typeof calculatePrice === 'function') calculatePrice();
    if (typeof updateLeftSidebar === 'function') updateLeftSidebar();
    if (typeof saveHistoryState === 'function') saveHistoryState();
    if (typeof window._updateKitchenSectionUI === 'function') window._updateKitchenSectionUI();
    if (typeof window._syncKitchenApplianceToolbar === 'function') window._syncKitchenApplianceToolbar();
    if (typeof _showToast === 'function') {
        const meters = (typeof window._kitchenLinearMeters === 'function')
            ? window._kitchenLinearMeters() : 0;
        _showToast('מטבח 4×4 נבנה — כיור, מדיח, תנור, מקרר, עליונים ושיש (' + meters + ' מ׳)', 5000);
    }
    return true;
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

/** Built-in bay presets for the end "+" → פריסט menu. */
window.KITCHEN_UNIT_PRESETS = [
    { id: 'cabinet', label: 'ארון מדפים', icon: 'fa-solid fa-table-columns', spec: { door: 'left' } },
    { id: 'drawers', label: 'מגירות', icon: 'fa-solid fa-bars', spec: { drawers: 3 } },
    { id: 'sink', label: 'כיור', icon: 'fa-solid fa-sink', spec: { appliance: 'sink', door: 'right' } },
    { id: 'dishwasher', label: 'מדיח', icon: 'fa-solid fa-dishwasher', faFallback: 'fa-solid fa-plate-wheat', spec: { appliance: 'dishwasher' } },
    { id: 'oven', label: 'תנור', icon: 'fa-solid fa-temperature-high', spec: { appliance: 'oven' } },
    { id: 'fridge', label: 'מקרר', icon: 'fa-solid fa-refrigerator', faFallback: 'fa-solid fa-snowflake', spec: { appliance: 'fridge' } }
];

function _kitMidHeight(wing) {
    if (!wing) return KIT_HEIGHT / 2;
    if (wing.columns && wing.columns.length) {
        return Math.max.apply(null, wing.columns.map(function(c) { return (c && c.height) || wing.globalHeight || KIT_HEIGHT; })) / 2;
    }
    return (wing.globalHeight || KIT_HEIGHT) / 2;
}

/**
 * Free kitchen ends where a "+" can extend the run.
 * Center free ends sit on world X; after a corner the free tip sits on world Z.
 */
window._kitchenComputeEndAddAnchors = function() {
    if (!window._isKitchenPreset || !window._isKitchenPreset()) return [];
    if (state._activeUpperUnit) return []; // base-run ends only while not editing uppers
    const cw = state.wings && state.wings.center;
    if (!cw) return [];
    const left = state.wings.left;
    const right = state.wings.right;
    const hasLeftFC = !!(left && left.wingPosition === 'full_corner' && left.kitchenCornerL);
    const hasRightFC = !!(right && right.wingPosition === 'full_corner' && right.kitchenCornerL);
    const centerCols = (cw.columns && cw.columns.length) ? cw.columns.length : 0;
    const centerIsStub = !!(cw.kitchenCornerL && !centerCols);
    const centerD = cw.depth || KIT_DEPTH;
    const gap = 22;
    const anchors = [];

    function push(a) {
        if (!a || !isFinite(a.worldX) || !isFinite(a.worldY) || !isFinite(a.worldZ)) return;
        anchors.push(a);
    }

    // Straight / main run on center — free X ends where no corner consumes them
    if (centerCols > 0) {
        const y = _kitMidHeight(cw);
        const zFront = centerD / 2;
        // Corner option only while the run is still straight — L convert clears the other arm
        const canMakeCorner = !hasLeftFC && !hasRightFC;
        if (!hasLeftFC) {
            push({
                id: 'center-left',
                wingId: 'center',
                end: 'left',
                axis: 'x',
                canUnit: true,
                canCorner: canMakeCorner,
                worldX: -cw.width / 2 - gap,
                worldY: y,
                worldZ: zFront
            });
        }
        if (!hasRightFC) {
            push({
                id: 'center-right',
                wingId: 'center',
                end: 'right',
                axis: 'x',
                canUnit: true,
                canCorner: canMakeCorner,
                worldX: cw.width / 2 + gap,
                worldY: y,
                worldZ: zFront
            });
        }
    } else if (centerIsStub) {
        // Empty L stub: free tip opposite the corner, still on X
        const y = _kitMidHeight(cw);
        const zFront = centerD / 2;
        if (hasRightFC && !hasLeftFC) {
            push({
                id: 'stub-left',
                wingId: 'center',
                end: 'left',
                axis: 'x',
                canUnit: true,
                canCorner: false,
                worldX: -Math.max(cw.width, KIT_CORNER_STUB_W) / 2 - gap,
                worldY: y,
                worldZ: zFront
            });
        }
        if (hasLeftFC && !hasRightFC) {
            push({
                id: 'stub-right',
                wingId: 'center',
                end: 'right',
                axis: 'x',
                canUnit: true,
                canCorner: false,
                worldX: Math.max(cw.width, KIT_CORNER_STUB_W) / 2 + gap,
                worldY: y,
                worldZ: zFront
            });
        }
    }

    // Corner return arms — free tip on Z
    function armFarAnchor(side, wing) {
        if (!wing) return;
        const fcSize = (wing.fullCorner && wing.fullCorner.size) || 90;
        const wingD = wing.depth || KIT_DEPTH;
        const wingW = (wing.columns && wing.columns.length) ? (wing.width || 0) : 0;
        const y = _kitMidHeight(wing.columns && wing.columns.length ? wing : cw);
        const edgeX = side === 'right'
            ? (cw.width / 2)
            : (-cw.width / 2);
        const sign = side === 'right' ? 1 : -1;
        // Match engine-core full_corner placement
        const armX = edgeX + sign * fcSize - sign * wingD / 2;
        const armStartZ = -centerD / 2 + fcSize;
        const farZ = wingW > 0
            ? (armStartZ + wingW + gap)
            : (armStartZ + gap);
        push({
            id: side + '-far',
            wingId: side,
            end: side === 'right' ? 'right' : 'left',
            axis: 'z',
            canUnit: true,
            canCorner: false,
            worldX: armX,
            worldY: y,
            worldZ: farZ
        });
    }
    if (hasRightFC) armFarAnchor('right', right);
    if (hasLeftFC) armFarAnchor('left', left);

    return anchors;
};

/** Add a 60cm bay on a specific wing/end (does not redirect empty center stub to the L arm). */
window._kitchenAddUnitOnWing = function(wingId, end, presetSpec) {
    if (!window._isKitchenPreset || !window._isKitchenPreset()) return false;
    wingId = wingId || 'center';
    end = end === 'left' ? 'left' : 'right';
    const wing = state.wings && state.wings[wingId];
    if (!wing) return false;

    state.activeWing = wingId;
    if (typeof syncSidebarToWing === 'function') syncSidebarToWing();

    if (!Array.isArray(wing.columns)) wing.columns = [];
    const liveCols = wing.columns;
    let newCol;
    if (presetSpec && typeof _kitMakeShowcaseCol === 'function') {
        newCol = _kitMakeShowcaseCol(presetSpec);
        // Drawer preset: one external_drawers bay
        if (presetSpec.drawers) {
            const n = Math.max(2, Math.min(5, presetSpec.drawers | 0));
            newCol.compartments = [{ type: 'external_drawers', count: n }];
            newCol.shelves = 0;
            newCol.shelvesY = [];
            newCol.doors = [];
        }
    } else {
        const template = liveCols.length
            ? (end === 'left' ? liveCols[0] : liveCols[liveCols.length - 1])
            : null;
        newCol = typeof _blankColumn === 'function'
            ? _blankColumn(KIT_UNIT_W, template)
            : {
                type: 'normal', width: KIT_UNIT_W, height: wing.globalHeight || KIT_HEIGHT,
                shelves: 0, splitY: null, shelvesY: [], compartments: [], doors: [],
                floorOffset: 0, topPanel: true, sinkPanel: false, noPlinth: false
            };
        newCol.width = KIT_UNIT_W;
        newCol.sinkPanel = false;
        newCol.height = wing.globalHeight || KIT_HEIGHT;
        newCol.topPanel = true;
        newCol.noPlinth = false;
        newCol.spaceBottomPanel = false;
        if (typeof distributeShelves === 'function') distributeShelves(newCol);
    }

    wing.columns = end === 'left' ? [newCol].concat(liveCols) : liveCols.concat([newCol]);
    // Leaving empty-stub mode: center becomes a real run beside the L
    if (wingId === 'center' && wing.kitchenCornerL) {
        // keep kitchenCornerL so the L arm stays attached
    }
    if (wingId === 'center') {
        try { state.columns = wing.columns; } catch (e) { /* proxy */ }
    }
    window._kitchenCommitRunWidth(wing);

    if (typeof _fixEdgeColumnMerges === 'function') _fixEdgeColumnMerges();
    if (typeof _syncColumnCountInputs === 'function') _syncColumnCountInputs(wing.columns.length);
    if (typeof _updateKitchenSectionUI === 'function') _updateKitchenSectionUI();
    if (typeof buildCabinet === 'function') buildCabinet();
    if (typeof calculatePrice === 'function') calculatePrice();
    if (typeof saveHistoryState === 'function') saveHistoryState();
    return true;
};

/** Turn a free center end into a kitchen L corner (ר). */
window._kitchenAddCornerAtEnd = function(wingId, end) {
    if (!window._isKitchenPreset || !window._isKitchenPreset()) return false;
    if (wingId !== 'center') {
        if (typeof _showToast === 'function') _showToast('פינה נוספת בקצה הזרוע עדיין לא נתמכת', 3200);
        return false;
    }
    const side = end === 'left' ? 'left' : 'right';
    if ((side === 'left' && state.wings.left) || (side === 'right' && state.wings.right)) {
        if (typeof _showToast === 'function') _showToast('כבר יש פינה בצד הזה', 2800);
        return false;
    }
    const host = state.wings.center;
    if (!host) return false;
    const cols = host.columns && host.columns.length
        ? JSON.parse(JSON.stringify(host.columns))
        : [];
    state.activeWing = 'center';
    if (typeof syncSidebarToWing === 'function') syncSidebarToWing();
    if (typeof window._configureKitchenCornerL === 'function') {
        window._configureKitchenCornerL(side, { host: host, columns: cols });
    }
    if (typeof buildCabinet === 'function') buildCabinet();
    if (typeof calculatePrice === 'function') calculatePrice();
    if (typeof saveHistoryState === 'function') saveHistoryState();
    if (typeof window._updateKitchenSectionUI === 'function') window._updateKitchenSectionUI();
    if (typeof window._syncKitchenApplianceToolbar === 'function') window._syncKitchenApplianceToolbar();
    return true;
};

/** Floating menu for a kitchen end "+" button. */
window._kitchenOpenEndAddMenu = function(anchor, clientX, clientY) {
    const old = document.getElementById('kit-end-add-menu');
    if (old) old.remove();
    if (!anchor) return;

    const menu = document.createElement('div');
    menu.id = 'kit-end-add-menu';
    menu.className = 'kit-end-add-menu';
    menu.setAttribute('role', 'menu');

    const mkBtn = function(act, label, icon, disabled) {
        return '<button type="button" class="kit-end-add-item" data-act="' + act + '"' +
            (disabled ? ' disabled' : '') + '>' +
            '<i class="' + icon + '"></i><span>' + label + '</span></button>';
    };

    let html = '<div class="kit-end-add-menu-title">הוספה</div>';
    html += mkBtn('unit', 'יחידה', 'fa-solid fa-plus', !anchor.canUnit);
    html += mkBtn('corner', 'פינה', 'fa-solid fa-vector-square', !anchor.canCorner);
    html += mkBtn('preset', 'פריסט', 'fa-solid fa-layer-group', !anchor.canUnit);
    html += '<div class="kit-end-preset-list" hidden>';
    (window.KITCHEN_UNIT_PRESETS || []).forEach(function(p) {
        const ic = p.icon || p.faFallback || 'fa-solid fa-cube';
        html += '<button type="button" class="kit-end-add-item kit-end-preset-item" data-preset="' + p.id + '">' +
            '<i class="' + ic + '"></i><span>' + p.label + '</span></button>';
    });
    html += '</div>';
    html += '<button type="button" class="kit-end-add-cancel">ביטול</button>';
    menu.innerHTML = html;
    document.body.appendChild(menu);

    const pad = 10;
    const mw = menu.offsetWidth || 200;
    const mh = menu.offsetHeight || 180;
    let left = (clientX != null ? clientX : window.innerWidth / 2) - mw / 2;
    let top = (clientY != null ? clientY : window.innerHeight / 2) + 14;
    left = Math.max(pad, Math.min(window.innerWidth - mw - pad, left));
    top = Math.max(pad, Math.min(window.innerHeight - mh - pad, top));
    menu.style.left = left + 'px';
    menu.style.top = top + 'px';

    const close = function() {
        menu.remove();
        document.removeEventListener('mousedown', outside, true);
    };
    const outside = function(e) {
        if (!menu.contains(e.target) && !(e.target.closest && e.target.closest('.kit-end-add-btn'))) close();
    };

    menu.querySelector('.kit-end-add-cancel').addEventListener('click', close);
    menu.querySelectorAll('.kit-end-add-item[data-act]').forEach(function(btn) {
        btn.addEventListener('click', function() {
            const act = btn.getAttribute('data-act');
            if (act === 'preset') {
                const list = menu.querySelector('.kit-end-preset-list');
                if (list) list.hidden = !list.hidden;
                return;
            }
            close();
            if (act === 'unit') window._kitchenAddUnitOnWing(anchor.wingId, anchor.end);
            else if (act === 'corner') window._kitchenAddCornerAtEnd(anchor.wingId, anchor.end);
        });
    });
    menu.querySelectorAll('.kit-end-preset-item').forEach(function(btn) {
        btn.addEventListener('click', function() {
            const id = btn.getAttribute('data-preset');
            const preset = (window.KITCHEN_UNIT_PRESETS || []).find(function(p) { return p.id === id; });
            close();
            window._kitchenAddUnitOnWing(anchor.wingId, anchor.end, preset ? preset.spec : null);
        });
    });
    setTimeout(function() { document.addEventListener('mousedown', outside, true); }, 0);
};

document.addEventListener('DOMContentLoaded', function() {
    window._setKitchenPresetButtonsVisible(false);
    if (window._initKitchenAdminGate) window._initKitchenAdminGate();
    _syncKitchenModeClass();
});
