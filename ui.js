// ==========================================
// 3. ממשק משתמש (UI), אירועים ופעולות
// ==========================================

// ── Debounced buildCabinet for drag operations ──────────────────────────────
// Uses requestAnimationFrame so at most one rebuild fires per display frame,
// preventing the renderer from being called dozens of times per second while
// the user is dragging a handle.
let _buildCabinetRafId = null;
function buildCabinetDebounced() {
    if (_buildCabinetRafId) cancelAnimationFrame(_buildCabinetRafId);
    _buildCabinetRafId = requestAnimationFrame(() => {
        _buildCabinetRafId = null;
        buildCabinet();
    });
}

// ── Drag-mode build: hides room (floor + walls) during pointer drag ──
// Call this from pointermove handlers instead of buildCabinetDebounced().
// Call _endDrag() from pointerup to restore the room.
window._isDragging = false;
function buildCabinetDragging() {
    window._isDragging = true;
    // Hide room immediately — walls/floor textures are the main perf bottleneck
    if (window._roomGroup) window._roomGroup.visible = false;
    buildCabinetDebounced();
}
function _endDrag() {
    if (!window._isDragging) return;
    window._isDragging = false;
    if (window._roomGroup) window._roomGroup.visible = true;
    buildCabinet(); // full rebuild restores room
}
// Safety net: slider nudged by keyboard / touch cancel / focus loss never fires its own pointerup,
// which would leave _isDragging stuck and the room permanently empty.
(function() {
    function _releaseStuckDrag(ev) {
        setTimeout(function() {
            if (!window._isDragging) return;
            if (typeof window._roomDbg === 'function') window._roomDbg('releasing stuck drag on ' + ev.type);
            _endDrag();
        }, 0);
    }
    window.addEventListener('pointerup', _releaseStuckDrag, true);
    window.addEventListener('pointercancel', _releaseStuckDrag, true);
    window.addEventListener('blur', _releaseStuckDrag);
    window.addEventListener('keyup', function(ev) {
        const el = ev.target;
        if (el && el.tagName === 'INPUT' && el.type === 'range') _releaseStuckDrag(ev);
    }, true);
})();
// ────────────────────────────────────────────────────────────────────────────

/** Format clear cell height for on-screen labels: cm with 1 decimal (36.65 → "36.7"). */
function _fmtCellHeightCm(h) {
    const n = Math.round((Number(h) || 0) * 10) / 10;
    return n.toFixed(1);
}
window._fmtCellHeightCm = _fmtCellHeightCm;

/**
 * Cell pill shared by regular cells and full-corner cells.
 * Selected → green ✓ circle; otherwise [trash |] [icon |] editable height | +.
 * opts: { selected, hasContent, heightCm, onToggle, onTrash, onHeightChange(desiredCm) → false to reset, iconHtml }
 * The pill variant exposes its height input as `el._heightInput`.
 */
function _buildCellPill(opts) {
    if (opts.selected) {
        const checkCircle = document.createElement('div');
        checkCircle.innerHTML = '<i class="fa-solid fa-check" style="font-size:0.75rem;pointer-events:none;"></i>';
        checkCircle.style.cssText = 'display:flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:50%;background:linear-gradient(135deg,#10b981,#059669);color:white;cursor:pointer;flex-shrink:0;transition:transform 0.15s,box-shadow 0.15s;box-shadow:0 2px 8px rgba(16,185,129,0.55);';
        checkCircle.addEventListener('mouseenter', () => { checkCircle.style.transform = 'scale(1.15)'; checkCircle.style.boxShadow = '0 3px 12px rgba(16,185,129,0.7)'; });
        checkCircle.addEventListener('mouseleave', () => { checkCircle.style.transform = 'scale(1)'; checkCircle.style.boxShadow = '0 2px 8px rgba(16,185,129,0.55)'; });
        checkCircle.addEventListener('click', (e) => { e.stopPropagation(); opts.onToggle(); });
        return checkCircle;
    }

    // direction:ltr so internal order is predictable — in the RTL page: + on the visual left, trash on the right
    const pill = document.createElement('div');
    pill.style.cssText = 'display:flex;align-items:center;gap:0;direction:ltr;background:rgba(30,30,40,0.82);border-radius:15px;padding:2px 6px 2px 5px;box-shadow:0 1px 6px rgba(0,0,0,0.3);flex-shrink:0;line-height:1;';
    const addDivider = () => {
        const div = document.createElement('div');
        div.style.cssText = 'width:1px;height:11px;background:rgba(255,255,255,0.2);margin:0 4px;flex-shrink:0;';
        pill.appendChild(div);
    };

    if (opts.hasContent) {
        const trashBtn = document.createElement('div');
        trashBtn.innerHTML = '<i class="fa-solid fa-trash" style="font-size:0.6rem;pointer-events:none;"></i>';
        trashBtn.style.cssText = 'display:flex;align-items:center;justify-content:center;width:17px;height:17px;border-radius:50%;color:rgba(255,255,255,0.55);cursor:pointer;transition:color 0.15s,background 0.15s;flex-shrink:0;';
        trashBtn.title = 'מחק תכולה מאיזור זה';
        trashBtn.addEventListener('mouseenter', () => { trashBtn.style.color = '#ef4444'; trashBtn.style.background = 'rgba(239,68,68,0.15)'; });
        trashBtn.addEventListener('mouseleave', () => { trashBtn.style.color = 'rgba(255,255,255,0.55)'; trashBtn.style.background = 'transparent'; });
        trashBtn.addEventListener('click', (e) => { e.stopPropagation(); opts.onTrash(); });
        pill.appendChild(trashBtn);
        addDivider();
    }

    if (opts.iconHtml) {
        const ic = document.createElement('div');
        ic.innerHTML = opts.iconHtml;
        ic.style.cssText = 'display:flex;align-items:center;justify-content:center;flex-shrink:0;';
        pill.appendChild(ic);
        addDivider();
    }

    // Height text only (no ▲▼) — keeps the pill short so it doesn't cover shelf drag handles
    const shown = _fmtCellHeightCm(opts.heightCm);
    const heightInput = document.createElement('input');
    heightInput.type = 'number';
    heightInput.step = '0.1';
    heightInput.value = shown;
    heightInput.title = 'לחץ לעריכת גובה התא';
    heightInput.setAttribute('aria-label', 'גובה תא בס״מ');
    heightInput.style.cssText = 'width:2.8em;min-width:2.4em;height:17px;border:none;background:transparent;font-size:calc(0.7rem + 2pt);font-weight:700;color:rgba(255,255,255,0.95);line-height:17px;text-align:center;outline:none;padding:0;margin:0;font-family:inherit;-moz-appearance:textfield;cursor:text;';
    heightInput.addEventListener('mousedown', (e) => { e.stopPropagation(); });
    heightInput.addEventListener('click', (e) => { e.stopPropagation(); heightInput.select(); });
    heightInput.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter') { e.preventDefault(); heightInput.blur(); }
    });
    heightInput.addEventListener('change', (e) => {
        e.stopPropagation();
        const desired = parseFloat(e.target.value);
        if (isNaN(desired) || opts.onHeightChange(desired) === false) e.target.value = heightInput._shown;
    });
    heightInput._shown = shown;
    pill.appendChild(heightInput);
    addDivider();

    const plusBtn = document.createElement('div');
    plusBtn.innerHTML = '<i class="fa-solid fa-plus" style="font-size:0.68rem;pointer-events:none;"></i>';
    plusBtn.style.cssText = 'display:flex;align-items:center;justify-content:center;width:17px;height:17px;border-radius:50%;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:white;cursor:pointer;flex-shrink:0;transition:transform 0.15s,box-shadow 0.15s;box-shadow:0 1px 4px rgba(99,102,241,0.45);';
    plusBtn.addEventListener('mouseenter', () => { plusBtn.style.transform = 'scale(1.12)'; plusBtn.style.boxShadow = '0 2px 8px rgba(99,102,241,0.65)'; });
    plusBtn.addEventListener('mouseleave', () => { plusBtn.style.transform = 'scale(1)'; plusBtn.style.boxShadow = '0 1px 4px rgba(99,102,241,0.45)'; });
    plusBtn.addEventListener('click', (e) => { e.stopPropagation(); opts.onToggle(); });
    pill.appendChild(plusBtn);

    pill._heightInput = heightInput;
    return pill;
}
/** @deprecated alias — display is cm, not mm */
function _fmtCellHeightMm(hCm) { return _fmtCellHeightCm(hCm); }
window._fmtCellHeightMm = _fmtCellHeightMm;

const colorNamesHebrew = {
    white_matte: 'לבן מט 2100', c3110: '3110', c795: '759', c705: '705', u727: 'U727',
    w1200: 'W1200', u232: 'U232', u604: 'U604', u638: 'U638',
    c3207: '3207', black_matte: 'שחור מט', custom: 'מותאם אישית',
    '2020': 'גוון 2020', '2024': 'גוון 2024', 'H1367': 'H1367', 'H1307': 'H1307', 'H1227': 'H1227', 'A427': 'A427',
    '2025': 'גוון 2025', '2040': 'גוון 2040', '2041': 'גוון 2041', '2044': 'גוון 2044',
    '2047': 'גוון 2047', '2049': 'גוון 2049', '2062': 'גוון 2062', '5600': 'גוון 5600',
    '7180': 'גוון 7180', '456': 'גוון 456', '462': 'גוון 462', '463': 'גוון 463',
    '464': 'גוון 464', '480': 'גוון 480'
};

/** Human label for a material color key — never collapses unknown codes to "ברירת מחדל". */
function _colorKeyLabel(key) {
    if (key == null || key === '') return 'ברירת מחדל';
    if (colorNamesHebrew[key]) return colorNamesHebrew[key];
    const s = String(key);
    if (/^c\d+$/i.test(s)) return s.slice(1);
    if (/^[uw]\d+$/i.test(s)) return s.toUpperCase();
    return s;
}

function _compHasOpenCellContent(comp) {
    if (!comp) return false;
    if (comp.type === 'open_cell' || comp.type === 'side_open_cell') return true;
    if (comp.partition && Array.isArray(comp.subCells)) {
        return comp.subCells.some(function(sub) {
            if (!sub) return false;
            if (sub.type === 'honeycomb' || sub.type === 'open_cell' || sub.type === 'side_open_cell') return true;
            if (Array.isArray(sub.zonesType)) {
                return sub.zonesType.some(function(zt) {
                    return zt === 'honeycomb' || zt === 'open_cell' || zt === 'side_open_cell';
                });
            }
            return false;
        });
    }
    return false;
}

function _wingHasOpenCellContent(wing) {
    if (!wing || !Array.isArray(wing.columns)) return false;
    return wing.columns.some(function(col) {
        if (col && col.type === 'desk' && col.deskHoneycomb) return true;
        return col && Array.isArray(col.compartments) && col.compartments.some(_compHasOpenCellContent);
    });
}

/** Open-cell / honeycomb color from every wing that actually has that content (corner/walk-in safe). */
function _resolveOpenCellColorLabel(wings, fallbackKey) {
    const labels = [];
    const seen = new Set();
    const addWing = function(wing) {
        if (!_wingHasOpenCellContent(wing)) return;
        const label = _colorKeyLabel(wing.materialOpenCell || fallbackKey);
        if (!seen.has(label)) {
            seen.add(label);
            labels.push(label);
        }
    };
    if (wings && typeof wings === 'object') {
        ['center', 'left', 'right'].forEach(function(side) { addWing(wings[side]); });
        Object.keys(wings).forEach(function(k) {
            if (k.indexOf('upperUnit_') === 0) addWing(wings[k]);
        });
        if (wings.center && wings.center.sideCabinet && wings.center.sideCabinet.side && wings.center.sideCabinet.side !== 'none') {
            addWing(wings.center.sideCabinet);
        }
    }
    if (labels.length) return labels.join(', ');
    return _colorKeyLabel(fallbackKey);
}

/** Glass tint of every wing that has glass doors (e.g. "מושחר"), or null when there is no glass. */
function _resolveGlassTintLabel(rawState) {
    const wings = rawState && rawState.wings;
    if (!wings || typeof window._wingHasGlass !== 'function') return null;
    const labels = [];
    const addWing = function(wing) {
        if (!wing || !window._wingHasGlass(wing)) return;
        const label = window._glassTintLabel(wing);
        if (labels.indexOf(label) < 0) labels.push(label);
    };
    Object.keys(wings).forEach(function(k) { addWing(wings[k]); });
    const sc = wings.center && wings.center.sideCabinet;
    if (sc && sc.side && sc.side !== 'none') addWing(sc);
    return labels.length ? labels.join(', ') : null;
}

function _wingHasTopPanel(wing) {
    return !!(wing && Array.isArray(wing.columns) && wing.columns.some(function(col) { return col && col.topPanel; }));
}

function _wingTopPanelColorLabel(wing, rawState) {
    const rs = rawState || {};
    return _colorKeyLabel((wing && wing.materialTopPanel) || rs.materialTopPanel
        || (wing && wing.materialBody) || rs.materialBody || 'white_matte');
}

/** Top-panel (משטח עליון) color from every wing that has one; null when the cabinet has no top panel. */
function _resolveTopPanelColorLabel(rawState, sides) {
    const wings = rawState && rawState.wings;
    if (!wings || typeof wings !== 'object') return null;
    const labels = [];
    const addWing = function(wing) {
        if (!_wingHasTopPanel(wing)) return;
        const label = _wingTopPanelColorLabel(wing, rawState);
        if (labels.indexOf(label) === -1) labels.push(label);
    };
    const keys = sides || ['center', 'left', 'right'].concat(Object.keys(wings).filter(function(k) { return k.indexOf('upperUnit_') === 0; }));
    keys.forEach(function(k) { addWing(wings[k]); });
    if (!sides && wings.center && wings.center.sideCabinet && wings.center.sideCabinet.side && wings.center.sideCabinet.side !== 'none') {
        addWing(wings.center.sideCabinet);
    }
    return labels.length ? labels.join(', ') : null;
}

const placementHebrew = {
    'wall': 'ארון קיר חופשי',
    'between_walls': 'ארון בין קירות',
    'niche': 'ארון בנישה'
};

// ── Drawer count helpers ──────────────────────────────────────────────────────
// Internal: 22cm for 1 drawer, +20cm per extra → 1→22, 2→42, 3→62, ...
// External: 12cm per drawer minimum → 1→12, 2→24, 3→36, 4→48, ...
// Auto-fill (default count) keeps a 20cm step so tall cells don't get many tiny external fronts.
window.MIN_DRAWER_CELL_H = 22;
window.DRAWER_EXTRA_H = 20;
window.MIN_EXTERNAL_DRAWER_CELL_H = 12;
window.EXTERNAL_DRAWER_EXTRA_H = 12;
window.EXTERNAL_DRAWER_AUTO_STEP_H = 20;

function _drawerHeightRules(drawerType) {
    const isExt = drawerType === 'external_drawers';
    return {
        minH: isExt ? window.MIN_EXTERNAL_DRAWER_CELL_H : window.MIN_DRAWER_CELL_H,
        extraH: isExt ? window.EXTERNAL_DRAWER_EXTRA_H : window.DRAWER_EXTRA_H,
        autoStepH: isExt ? window.EXTERNAL_DRAWER_AUTO_STEP_H : window.DRAWER_EXTRA_H
    };
}
window._drawerHeightRules = _drawerHeightRules;

function minHeightForDrawerCount(n, drawerType) {
    const count = Math.max(0, Math.round(Number(n) || 0));
    if (count < 1) return 0;
    const { minH, extraH } = _drawerHeightRules(drawerType);
    return minH + extraH * (count - 1);
}
window.minHeightForDrawerCount = minHeightForDrawerCount;

function calcAutoDrawerCount(cellHeightCm, drawerType) {
    const h = Number(cellHeightCm) || 0;
    const { minH, autoStepH } = _drawerHeightRules(drawerType);
    if (h < minH) return 0;
    return Math.min(8, Math.floor((h - minH) / autoStepH) + 1);
}
window.calcAutoDrawerCount = calcAutoDrawerCount;

function calcMaxDrawerCount(cellHeightCm, drawerType) {
    const h = Number(cellHeightCm) || 0;
    const { minH, extraH } = _drawerHeightRules(drawerType);
    if (h < minH) return 0;
    return Math.min(8, Math.floor((h - minH) / extraH + 1e-6) + 1);
}
window.calcMaxDrawerCount = calcMaxDrawerCount;

// Minimum drawers for a cell: always allow 1 when the cell is tall enough
function calcMinDrawerCount(cellHeightCm, drawerType) {
    const { minH } = _drawerHeightRules(drawerType);
    return (Number(cellHeightCm) || 0) >= minH ? 1 : 0;
}
window.calcMinDrawerCount = calcMinDrawerCount;

function _toastDrawerHeightBlocked(neededCm, forCount) {
    const n = forCount || 1;
    const msg = n > 1
        ? `ל-${n} מגירות נדרש גובה תא מינימלי של ${neededCm} ס"מ`
        : `גובה התא קטן מ-${neededCm} ס"מ — לא ניתן להוסיף מגירה`;
    if (typeof _showToast === 'function') _showToast(msg, 4000);
    else if (typeof window._showToast === 'function') window._showToast(msg, 4000);
    else {
        const toast = document.createElement('div');
        toast.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:rgba(239,68,68,0.95);color:white;padding:10px 20px;border-radius:12px;font-weight:600;font-size:0.9rem;z-index:9999;box-shadow:0 4px 16px rgba(0,0,0,0.2);pointer-events:none;';
        toast.innerText = msg;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    }
}
window._toastDrawerHeightBlocked = _toastDrawerHeightBlocked;

/** Sync drawer count (or clear) after a cell height change. Returns true if cleared. */
function _syncDrawerCompAfterHeight(col, r) {
    const comp = col && col.compartments && col.compartments[r];
    if (!comp || (comp.type !== 'internal_drawers' && comp.type !== 'external_drawers')) return false;
    const cellH = _cellHeight(col, r);
    const { minH } = _drawerHeightRules(comp.type);
    if (cellH < minH) {
        // Keep desk-merged drawer pinned — height is owned by merge shelves
        if (comp.mergeWithDesk) return false;
        comp.type = 'empty';
        return true;
    }
    // Auto-fit drawer count to cell height (enlarge → more drawers, shrink → fewer),
    // but keep a manual count as long as it still fits the per-drawer minimum
    const auto = calcAutoDrawerCount(cellH, comp.type);
    const maxCount = calcMaxDrawerCount(cellH, comp.type);
    const minCount = calcMinDrawerCount(cellH, comp.type);
    comp.count = Math.max(minCount, Math.min(maxCount, Math.max(auto, comp.count || 0)));
    return false;
}
window._syncDrawerCompAfterHeight = _syncDrawerCompAfterHeight;

function _onCompartmentTypeChangedForDeskMerge(comp, row, colIndex) {
    if (!state.desk || !state.desk.mergeDrawers) return;
    const indices = state.desk.mergeColIndices || (state.desk.mergeColIndex != null ? [state.desk.mergeColIndex] : []);
    if (state.desk.mergeRow !== row || indices.indexOf(colIndex) < 0) return;
    const stillDrawer = comp && (comp.type === 'external_drawers' || comp.type === 'internal_drawers');
    if (!stillDrawer || !comp.mergeWithDesk) {
        if (typeof _clearDeskMergeFlags === 'function') _clearDeskMergeFlags();
    }
}
window._onCompartmentTypeChangedForDeskMerge = _onCompartmentTypeChangedForDeskMerge;

// Returns the displayed cell height (cm) of compartment row r in column col.
// Rounded to 0.01 cm (= 0.1 mm) to match blueprint mm labels.
function _cellHeight(col, r, wingData) {
    if (typeof _compartmentBounds === 'function') {
        return Math.round(_compartmentBounds(col, r, wingData).h * 100) / 100;
    }
    const plinthH = wingData ? wingData.plinthHeight : state.plinthHeight;
    const t       = wingData ? wingData.thickness    : state.thickness;
    const fo      = col.floorOffset || 0;
    const startY  = fo > 0 ? fo + t : ((col.type === 'desk') ? col.deskHeight + col.deskClearance + t : (col.noPlinth ? t : plinthH + t));
    const bottomY = (r === 0) ? startY : col.shelvesY[r - 1] + t / 2;
    const topY    = (r >= col.shelvesY.length) ? col.height - t : col.shelvesY[r] - t / 2;
    return Math.round(Math.max(0, topY - bottomY) * 100) / 100;
}
// ─────────────────────────────────────────────────────────────────────────────

function updateQuickEditPanelUI() {
    const panel = document.getElementById('column-quick-edit');
    const fcPanel = document.getElementById('full-corner-quick-edit');
    // In viewer mode these panels don't exist — bail out silently
    if (!panel && !fcPanel) return;

    // ---- Full corner quick edit panel ----
    const isFCEditMode = state.activeWing === 'full_corner_right' || state.activeWing === 'full_corner_left';
    const fcRealSide = isFCEditMode ? state.activeWing.replace('full_corner_', '') : null;
    const activeWingData = isFCEditMode
        ? state.wings[fcRealSide]
        : (state.activeWing && state.activeWing !== 'center' ? state.wings[state.activeWing] : null);
    const isFullCornerEdit = state.wingEditMode && isFCEditMode && activeWingData;

    if (fcPanel) {
        if (isFullCornerEdit) {
            const fc = activeWingData.fullCorner || {};
            // Update shelf count display
            const fcSVal = document.getElementById('fc-qe-s-val');
            if (fcSVal) fcSVal.value = fc.shelves || 0;
            fcPanel.classList.add('visible');
        } else {
            fcPanel.classList.remove('visible');
        }
    }

    if (state.activeEditCol === -1 || state.viewMode !== 'front' || !state.columns[state.activeEditCol]) {
        // Full-column select-all should still open quick-edit (incl. split columns >270)
        if (state.viewMode === 'front' && _isFullColumnSelected()) {
            state.activeEditCol = state.selection.colIndex;
        } else {
            _updateCopyPasteGroupVisibility();
            panel.classList.remove('visible');
            return;
        }
    }
    const col = state.columns[state.activeEditCol];

    const counts = (typeof getSplitUnitCounts === 'function') ? getSplitUnitCounts(col) : { lower: col.shelves || 0, upper: 0 };
    const hasSplit = !!col.splitY;
    const shelvesGroup = document.getElementById('qe-shelves-group');
    const shelvesSplitGroup = document.getElementById('qe-shelves-split-group');
    if (shelvesGroup) shelvesGroup.style.display = hasSplit ? 'none' : '';
    if (shelvesSplitGroup) shelvesSplitGroup.style.display = hasSplit ? 'flex' : 'none';
    const sVal = document.getElementById('qe-s-val');
    if (sVal) sVal.value = col.shelves;
    const sLower = document.getElementById('qe-s-val-lower');
    const sUpper = document.getElementById('qe-s-val-upper');
    if (sLower) sLower.value = counts.lower;
    if (sUpper) sUpper.value = counts.upper;

    // No-plinth toggle button
    const btnNoplinth = document.getElementById('qe-btn-noplinth');
    if (btnNoplinth) {
        const isNoplinth = col.noPlinth || (col.floorOffset > 0);
        btnNoplinth.classList.toggle('active', !!isNoplinth);
    }

    // Top panel toggle button
    const btnTopPanel = document.getElementById('qe-btn-top-panel');
    if (btnTopPanel) {
        btnTopPanel.classList.toggle('active', !!col.topPanel);
    }

    // Sink panel toggle button
    const btnSinkPanel = document.getElementById('qe-btn-sink-panel');
    if (btnSinkPanel) {
        btnSinkPanel.classList.toggle('active', !!col.sinkPanel);
    }

    // Internal desk toggle — only show for normal/desk columns (not drawers-only)
    const deskGroup = document.getElementById('qe-desk-group');
    const deskDrawersGroup = document.getElementById('qe-desk-drawers-group');
    const btnDesk = document.getElementById('qe-btn-desk');
    const isDesk = col.type === 'desk';
    const showDesk = col.type === 'desk' || col.type === 'normal' || !col.type;
    if (deskGroup) deskGroup.style.display = showDesk ? '' : 'none';
    if (btnDesk) btnDesk.classList.toggle('active', isDesk);
    if (deskDrawersGroup) {
        deskDrawersGroup.style.display = isDesk ? '' : 'none';
        const cb = document.getElementById('qe-desk-drawers-cb');
        if (cb) cb.checked = !!col.hasDrawers;
    }

    // Desk drawer count stepper — only when desk is active AND drawers are enabled
    const deskDrawerCountGroup = document.getElementById('qe-desk-drawer-count-group');
    if (deskDrawerCountGroup) {
        const showCount = isDesk && !!col.hasDrawers;
        deskDrawerCountGroup.style.display = showCount ? '' : 'none';
        if (showCount) {
            const autoDefault = col.width <= 80 ? 1 : 2;
            const inp = document.getElementById('qe-desk-drawer-count-val');
            if (inp) inp.value = col.deskDrawerCount != null ? col.deskDrawerCount : autoDefault;
        }
    }

    _updateCopyPasteGroupVisibility();

    panel.classList.add('visible');
}

window.toggleNoPlinth = function() {
    if (state.activeEditCol === -1 || !state.columns[state.activeEditCol]) return;
    const col = state.columns[state.activeEditCol];
    const isActive = col.noPlinth || (col.floorOffset > 0);
    if (isActive) {
        col.noPlinth = false;
        col.floorOffset = 0;
        col.spaceBottomPanel = false;
    } else {
        col.noPlinth = true;
        col.spaceBottomPanel = false;
    }
    buildCabinet(); calculatePrice(); updateQuickEditPanelUI();
    saveHistoryState();
}

window.toggleTopPanel = function() {
    if (state.activeEditCol === -1 || !state.columns[state.activeEditCol]) return;
    const col = state.columns[state.activeEditCol];
    col.topPanel = !col.topPanel;
    // Sink panel and top panel are mutually exclusive
    if (col.topPanel) col.sinkPanel = false;
    buildCabinet(); calculatePrice(); updateQuickEditPanelUI();
    if (typeof syncUIFromState === 'function') syncUIFromState();
    saveHistoryState();
}

window.toggleSinkPanel = function() {
    if (state.activeEditCol === -1 || !state.columns[state.activeEditCol]) return;
    const col = state.columns[state.activeEditCol];
    col.sinkPanel = !col.sinkPanel;
    // Sink panel and top panel are mutually exclusive
    if (col.sinkPanel) col.topPanel = false;
    buildCabinet(); calculatePrice(); updateQuickEditPanelUI();
    if (typeof syncUIFromState === 'function') syncUIFromState();
    saveHistoryState();
}

window.resetFloorOffset = function() {
    if (state.activeEditCol === -1 || !state.columns[state.activeEditCol]) return;
    const col = state.columns[state.activeEditCol];
    col.floorOffset = 0;
    col.noPlinth = false;
    buildCabinet(); calculatePrice(); updateQuickEditPanelUI();
    saveHistoryState();
}

window.updateQEFloorOffset = function(delta) {
    if (state.activeEditCol === -1 || !state.columns[state.activeEditCol]) return;
    const col = state.columns[state.activeEditCol];
    const newFO = Math.round(Math.max(0, Math.min(col.height - 10, (col.floorOffset || 0) + delta)));
    col.floorOffset = newFO;
    col.noPlinth = newFO > 0;
    buildCabinet(); calculatePrice();
    if (typeof updateMobileColSheetUI === 'function') updateMobileColSheetUI();
    updateQuickEditPanelUI();
    saveHistoryState();
}

window.toggleInternalDesk = function() {
    if (state.activeEditCol === -1 || !state.columns[state.activeEditCol]) return;
    const col = state.columns[state.activeEditCol];
    if (col.type === 'desk') {
        col.type = 'normal';
        delete col.deskHeight; delete col.deskClearance; delete col.hasDrawers; delete col.drawerHeight; delete col.deskLeds; delete col.deskHoneycomb;
    } else {
        col.type = 'desk';
        col.deskHeight = 80;
        col.deskClearance = 80;
        col.hasDrawers = true;
        col.drawerHeight = 12;
    }
    distributeShelves(col);
    buildCabinet(); calculatePrice(); updateQuickEditPanelUI();
    saveHistoryState();
}

window.toggleInternalDeskDrawers = function(isChecked) {
    if (state.activeEditCol === -1 || !state.columns[state.activeEditCol]) return;
    const col = state.columns[state.activeEditCol];
    if (col.type === 'desk') {
        col.hasDrawers = isChecked;
        buildCabinet(); calculatePrice();
        updateQuickEditPanelUI();
        saveHistoryState();
    }
}

window.updateDeskDrawerCount = function(delta) {
    if (state.activeEditCol === -1 || !state.columns[state.activeEditCol]) return;
    const col = state.columns[state.activeEditCol];
    if (col.type !== 'desk' || !col.hasDrawers) return;
    const autoDefault = col.width <= 80 ? 1 : 2;
    const current = col.deskDrawerCount != null ? col.deskDrawerCount : autoDefault;
    col.deskDrawerCount = Math.max(1, Math.min(4, current + delta));
    const inp = document.getElementById('qe-desk-drawer-count-val');
    if (inp) inp.value = col.deskDrawerCount;
    buildCabinet(); calculatePrice();
    saveHistoryState();
}

window.updateDeskDrawerCountInput = function(val) {
    if (state.activeEditCol === -1 || !state.columns[state.activeEditCol]) return;
    const col = state.columns[state.activeEditCol];
    if (col.type !== 'desk' || !col.hasDrawers) return;
    const n = parseInt(val);
    if (isNaN(n)) return;
    col.deskDrawerCount = Math.max(1, Math.min(4, n));
    buildCabinet(); calculatePrice();
    saveHistoryState();
}

// ---- Per-door panel type tabs for sliding wardrobe sidebar ----
window._rebuildDoorPanelTabs = function() {
    const container = document.getElementById('sd-door-panels-container');
    if (!container) return;
    const sd = getSlidingDoor();
    if (!sd || !sd.enabled) { container.innerHTML = ''; return; }
    const numDoors = sd.numDoors || 2;
    if (!sd.doorPanels || sd.doorPanels.length < numDoors) {
        if (!sd.doorPanels) sd.doorPanels = [];
        while (sd.doorPanels.length < numDoors) sd.doorPanels.push(sd.doorPanelType || 'solid');
    }
    if (!sd.doorColors) sd.doorColors = [];

    const panelOptions = [
        { value: 'solid',  icon: 'fa-solid fa-square',            label: 'חלק' },
        { value: 'glass',  icon: 'fa-regular fa-square',          label: 'זכוכית' },
        { value: 'mirror', icon: 'fa-solid fa-circle-half-stroke', label: 'מראה' }
    ];
    // mirror sub-types: shown below the main buttons when mirror/mirror_dark is active
    const mirrorSubOptions = [
        { value: 'mirror',      label: 'מראה רגילה' },
        { value: 'mirror_dark', label: 'מראה כהה' }
    ];

    // All colors available for door coloring (solid + textures)
    const solidColors = [
        { key: 'white_matte', bg: '#f7f7f7',  border: '#ccc', label: 'לבן מט 2100' },
        { key: 'c3110',       bg: '#f0ede9',  border: '#bbb', label: '3110' },
        { key: 'c795',        bg: '#ece0d4',  border: '#bbb', label: '759' },
        { key: 'c705',        bg: '#dbd6c6',  border: '#bbb', label: '705' },
        { key: 'u727',        bg: '#a79786',  border: '#bbb', label: 'U727' },
        { key: 'w1200',       bg: '#e7e1da',  border: '#bbb', label: 'W1200' },
        { key: 'u232',        bg: '#c59578',  border: '#bbb', label: 'U232' },
        { key: 'u604',        bg: '#8f8e76',  border: '#bbb', label: 'U604' },
        { key: 'u638',        bg: '#c0b598',  border: '#bbb', label: 'U638' },
        { key: 'c3207',       bg: '#F7ECD9',  border: '#bbb', label: '3207' },
        { key: 'black_matte', bg: '#2a2a2a',  border: '#444', label: 'שחור מט' },
        // Wood / texture colors
        { key: '2020',  img: 'textures/2020.jpg',  border: '#bbb', label: '2020' },
        { key: '2024',  img: 'textures/2024.jpg',  border: '#bbb', label: '2024' },
        { key: 'H1367', img: 'textures/H1367.jpg', border: '#bbb', label: 'H1367' },
        { key: 'H1307', img: 'textures/H1307.jpg', border: '#bbb', label: 'H1307' },
        { key: 'H1227', img: 'textures/H1227.jpg', border: '#bbb', label: 'H1227' },
        { key: 'A427',  img: 'textures/A427.jpg?v=20260914fix',  border: '#bbb', label: 'A427' },
        { key: '2025',  img: 'textures/2025.jpg',  border: '#bbb', label: '2025' },
        { key: '2040',  img: 'textures/2040.jpg',  border: '#bbb', label: '2040' },
        { key: '2041',  img: 'textures/2041.jpg',  border: '#bbb', label: '2041' },
        { key: '2044',  img: 'textures/2044.jpg',  border: '#bbb', label: '2044' },
        { key: '2047',  img: 'textures/2047.jpg',  border: '#bbb', label: '2047' },
        { key: '2049',  img: 'textures/2049.jpg',  border: '#bbb', label: '2049' },
        { key: '2062',  img: 'textures/2062.jpg',  border: '#bbb', label: '2062' },
        { key: '5600',  img: 'textures/5600.jpg',  border: '#bbb', label: '5600' },
        { key: '7180',  img: 'textures/7180.jpg',  border: '#bbb', label: '7180' },
        { key: '456',   img: 'textures/456.jpg',   border: '#bbb', label: '456' },
        { key: '462',   img: 'textures/462.jpg',   border: '#bbb', label: '462' },
        { key: '463',   img: 'textures/463.jpg',   border: '#bbb', label: '463' },
        { key: '464',   img: 'textures/464.jpg',   border: '#bbb', label: '464' },
        { key: '480',   img: 'textures/480.jpg',   border: '#bbb', label: '480' },
    ];

    let html = `<div style="font-size:0.78rem;color:var(--text-light);margin-bottom:6px;">סוג פנל לכל דלת</div>`;

    // Get body material key for default color display
    const bodyMatKey = (state.wings && state.wings.center && state.wings.center.materialBody) || 'white_matte';

    for (let i = 0; i < numDoors; i++) {
        const current = sd.doorPanels[i] || 'solid';
        const isMirrorActive = current === 'mirror' || current === 'mirror_dark';
        const currentColor = sd.doorColors[i] || null; // null = use body color
        const effectiveColor = currentColor || bodyMatKey; // what engine actually uses
        const mainRowMargin = (current === 'solid' || isMirrorActive) ? '8px' : '0';
        html += `<div style="margin-bottom:10px;padding:8px;background:var(--bg-light);border-radius:10px;border:1px solid var(--border);">`;
        html += `<div style="font-size:0.72rem;font-weight:700;color:var(--text-dark);margin-bottom:6px;">דלת ${i + 1}</div>`;
        html += `<div style="display:flex;gap:5px;margin-bottom:${mainRowMargin};">`;
        panelOptions.forEach(opt => {
            // "מראה" button is active when current is mirror OR mirror_dark
            const isActive = opt.value === 'mirror' ? isMirrorActive : current === opt.value;
            html += `<button onclick="updateSlidingDoorPanel(${i},'${opt.value}')"
                style="flex:1;padding:6px 3px;border-radius:8px;border:${isActive ? '2px solid var(--accent)' : '1.5px solid var(--border)'};
                background:${isActive ? 'var(--accent-light,#e8f0fe)' : 'white'};
                color:${isActive ? 'var(--accent)' : 'var(--text-dark)'};
                font-size:0.72rem;font-weight:600;cursor:pointer;transition:all 0.15s;
                display:flex;flex-direction:column;align-items:center;gap:2px;">
                <i class="${opt.icon}" style="font-size:1rem;"></i>
                <span>${opt.label}</span>
            </button>`;
        });
        html += `</div>`;
        // Mirror sub-row — shown when mirror or mirror_dark is active
        if (isMirrorActive) {
            html += `<div style="display:flex;gap:5px;margin-bottom:0;padding:6px 0 2px 0;border-top:1px solid var(--border);">`;
            mirrorSubOptions.forEach(sub => {
                const isSubActive = current === sub.value;
                html += `<button onclick="updateSlidingDoorPanel(${i},'${sub.value}')"
                    style="flex:1;padding:5px 4px;border-radius:7px;border:${isSubActive ? '2px solid var(--accent)' : '1.5px solid var(--border)'};
                    background:${isSubActive ? 'var(--accent-light,#e8f0fe)' : 'white'};
                    color:${isSubActive ? 'var(--accent)' : 'var(--text-dark)'};
                    font-size:0.7rem;font-weight:600;cursor:pointer;transition:all 0.15s;">
                    ${sub.label}
                </button>`;
            });
            html += `</div>`;
        }
        // Color swatches — only shown when panel type is 'solid'
        if (current === 'solid') {
            html += `<div style="font-size:0.7rem;color:var(--text-light);margin-bottom:5px;">צבע דלת:</div>`;
            html += `<div style="display:flex;flex-wrap:wrap;gap:5px;">`;
            solidColors.forEach(c => {
                const isColorActive = c.key === effectiveColor;
                const bgStyle = c.img
                    ? `background-image:url('${c.img}');background-size:cover;background-color:#ccc;`
                    : `background:${c.bg};`;
                html += `<button onclick="updateSlidingDoorColor(${i},'${c.key}')" title="${c.label}"
                    style="width:26px;height:26px;border-radius:50%;${bgStyle}
                    border:${isColorActive ? '2.5px solid var(--accent)' : `1.5px solid ${c.border}`};
                    cursor:pointer;transition:all 0.15s;outline:${isColorActive ? '2px solid var(--accent)' : 'none'};outline-offset:1px;">
                </button>`;
            });
            html += `</div>`;
        }
        html += `</div>`;
    }

    container.innerHTML = html;
};

window._toggleHoneycombColumnMerge = function(leftColIdx, startR, endR) {
    const col = state.columns && state.columns[leftColIdx];
    if (!col || !col.compartments) return;
    const s = Math.max(0, startR | 0);
    const e = Math.max(s, endR | 0);
    let currentlySplit = false;
    for (let r = s; r <= e; r++) {
        const comp = col.compartments[r];
        if (comp && (comp.type === 'open_cell' || comp.type === 'side_open_cell') && comp.honeycombNoMergeRight) {
            currentlySplit = true;
            break;
        }
    }
    const nextSplit = !currentlySplit;
    for (let r = s; r <= e; r++) {
        const comp = col.compartments[r];
        if (!comp || (comp.type !== 'open_cell' && comp.type !== 'side_open_cell')) continue;
        if (nextSplit) comp.honeycombNoMergeRight = true;
        else delete comp.honeycombNoMergeRight;
    }
    if (typeof buildCabinet === 'function') buildCabinet();
    if (typeof calculatePrice === 'function') calculatePrice();
    if (typeof saveHistoryState === 'function') saveHistoryState();
};

/** Lamp badge at the top corner of every LED group — own layer so it stays visible without hover. */
function _renderLedCellIcons() {
    let layer = document.getElementById('led-icons-layer');
    if (!layer && dimLayer && dimLayer.parentNode) {
        layer = document.createElement('div');
        layer.id = 'led-icons-layer';
        dimLayer.parentNode.insertBefore(layer, dimLayer);
    }
    if (!layer) return;
    layer.innerHTML = '';
    if (state.viewMode !== 'front' || !Array.isArray(state.columns)) return;

    const cellEntry = (c, r) => state.dimData.find(d => d.colIndex === c && d.rowIndex === r &&
        typeof d.h === 'number' && !d.isCellSelectBtn && !d.isSubCellBtn && !d.isPartSubWidth && !d.isColWidth);
    const centerOf = d => (d.isPartitionedCell ? d.y - 15 : d.y);

    state.columns.forEach((col, c) => {
        if (!col || !Array.isArray(col.leds) || !col.leds.length) return;
        col.leds.forEach(g => {
            const top = cellEntry(c, g.endRow);
            const bot = cellEntry(c, g.startRow);
            if (!top || !bot) return;
            const yTop = centerOf(top) + top.h / 2;
            const el = document.createElement('div');
            el.className = 'led-cell-icon';
            el.dataset.x3d = top.x + col.width / 2 - 7;
            el.dataset.y3d = yTop - 7;
            el.title = g.startRow === g.endRow ? 'זוג לדים' : 'זוג לדים — ' + (g.endRow - g.startRow + 1) + ' תאים';
            el.innerHTML = '<i class="fa-solid fa-lightbulb"></i>';
            layer.appendChild(el);
        });
    });
}

function buildDimensionsAndButtonsUI() {
    dimLayer.innerHTML = '';
    buttonsLayer.innerHTML = '';
    // ---- Column and partition widths (same hover fade as cell dimensions) ----
    const colWidthsLayer = document.getElementById('col-widths-layer');
    if (colWidthsLayer) colWidthsLayer.innerHTML = '';
    _renderLedCellIcons();
    if (state.viewMode !== 'front') return;

    state.dimData.forEach(d => {
        // isSubCellBtn and isCellSelectBtn entries are handled separately below — skip here
        if (d.isSubCellBtn) return;
        if (d.isCellSelectBtn) return;
        if (d.isHoneycombMergeBtn) return;
        if (d.isDeskDrawerMergeBtn) return;
        if (d.isTvSizeBtn) return;
        if (d.isDeskZoneCell) return;

        // ---- Column width label above each column (editable) ----
        if (d.isColWidth) {
            if (!colWidthsLayer) return;
            const colWidthEl = document.createElement('div');
            colWidthEl.className = 'col-width-label';
            colWidthEl.dataset.x3d = d.x;
            colWidthEl.dataset.y3d = d.y;
            colWidthEl.title = 'לחץ לעריכת רוחב העמודה';
            const input = document.createElement('input');
            input.className = 'col-width-input';
            input.type = 'number';
            input.step = '1';
            input.min = String(typeof MIN_COL_WIDTH !== 'undefined' ? MIN_COL_WIDTH : 20);
            input.value = Math.round(d.h);
            input.setAttribute('aria-label', 'רוחב עמודה בס״מ');
            const unitSpan = document.createElement('span');
            unitSpan.className = 'col-width-unit';
            unitSpan.innerText = 'ס"מ';
            colWidthEl.appendChild(input);
            colWidthEl.appendChild(unitSpan);

            input.addEventListener('mousedown', function(e) { e.stopPropagation(); });
            input.addEventListener('click', function(e) { e.stopPropagation(); input.select(); });
            input.addEventListener('keydown', function(e) {
                if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
                e.stopPropagation();
            });
            input.addEventListener('change', function(e) {
                const desired = parseInt(e.target.value, 10);
                if (isNaN(desired)) {
                    e.target.value = Math.round(d.h);
                    return;
                }
                if (typeof window._setColumnWidthCm === 'function') {
                    const applied = window._setColumnWidthCm(d.colIndex, desired);
                    e.target.value = applied != null ? applied : Math.round(d.h);
                }
            });

            colWidthsLayer.appendChild(colWidthEl);
            return;
        }

        // ---- Partition sub-cell widths (left / right) — same band as column widths ----
        if (d.isPartSubWidth) {
            if (!colWidthsLayer) return;
            const partWidthEl = document.createElement('div');
            partWidthEl.className = 'col-width-label part-sub-width-label';
            partWidthEl.dataset.x3d = d.x;
            partWidthEl.dataset.y3d = d.y;
            partWidthEl.title = 'לחץ לעריכת רוחב המחיצה';
            const input = document.createElement('input');
            input.className = 'col-width-input part-sub-width-input';
            input.type = 'number';
            input.step = '1';
            input.min = '8';
            input.value = Math.round(d.h);
            input.setAttribute('aria-label', 'רוחב תא מחיצה בס״מ');
            const unitSpan = document.createElement('span');
            unitSpan.className = 'col-width-unit part-sub-width-unit';
            unitSpan.innerText = 'ס"מ';
            partWidthEl.appendChild(input);
            partWidthEl.appendChild(unitSpan);

            input.addEventListener('mousedown', function(e) { e.stopPropagation(); });
            input.addEventListener('click', function(e) { e.stopPropagation(); input.select(); });
            input.addEventListener('keydown', function(e) {
                if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
                e.stopPropagation();
            });
            input.addEventListener('change', function(e) {
                const desired = parseInt(e.target.value, 10);
                if (isNaN(desired)) {
                    e.target.value = Math.round(d.h);
                    return;
                }
                if (typeof window._setPartSubWidthCm === 'function') {
                    const applied = window._setPartSubWidthCm(d.colIndex, d.rowIndex, d.subCellIdx, desired);
                    e.target.value = applied != null ? applied : Math.round(d.h);
                }
            });

            colWidthsLayer.appendChild(partWidthEl);
            return;
        }

        const dimEl = document.createElement('div');
        dimEl.className = 'dim-container';
        dimEl.dataset.x3d = d.x; dimEl.dataset.y3d = d.y;
        
        const input = document.createElement('input');
        input.className = 'dim-input';
        input.type = 'number'; input.step = '0.1';
        input.value = _fmtCellHeightCm(d.h);

        // Wing open-width label: two-line layout — "פתח גלוי" on top, "30 ס"מ" below
        if (d.isWingOpenWidth) {
            input.readOnly = true;
            input.title = 'רוחב פתח גלוי';
            dimEl.style.pointerEvents = 'none';
            dimEl.style.background = 'rgba(30,100,220,0.13)';
            dimEl.style.border = '1.5px solid rgba(30,100,220,0.45)';
            dimEl.style.borderRadius = '8px';
            dimEl.style.padding = '3px 8px';
            dimEl.style.width = 'fit-content';
            dimEl.style.minWidth = '0';
            dimEl.style.flexDirection = 'column';
            dimEl.style.alignItems = 'center';
            dimEl.style.gap = '1px';
            input.style.color = '#1a5fd4';
            input.style.fontWeight = '700';
            input.style.width = '3.5em';
            input.style.minWidth = '2.5em';
            input.style.textAlign = 'center';
            input.step = '1';
            input.value = String(Math.round(d.h));
            const openLabel = document.createElement('div');
            openLabel.style.cssText = 'font-size:10px;color:#1a5fd4;font-weight:600;text-align:center;white-space:nowrap;line-height:1.2;';
            openLabel.innerText = 'פתח גלוי';
            dimEl.appendChild(openLabel);
            const row2 = document.createElement('div');
            row2.style.cssText = 'display:flex;align-items:baseline;gap:2px;white-space:nowrap;';
            dimEl.appendChild(row2);
            dimEl._wingOpenRow2 = row2;
        }
        
        input.addEventListener('change', (e) => {
            let desiredH = parseFloat(e.target.value);
            if(isNaN(desiredH)) return;
            
            if (d.isDeskWidth) {
                state.desk.width = Math.max(40, Math.min(200, desiredH));
                if (document.getElementById('inp-num-desk-width')) document.getElementById('inp-num-desk-width').value = state.desk.width;
                if (document.getElementById('inp-desk-width')) document.getElementById('inp-desk-width').value = state.desk.width;
            } else if (d.isDeskHeight) {
                state.desk.height = Math.max(50, Math.min(120, desiredH));
                if (typeof window._resyncDeskMergeBandCells === 'function') window._resyncDeskMergeBandCells();
            } else if (d.isDeskDrawer) {
                state.desk.drawerHeight = Math.max(12, Math.min(40, desiredH));
                if (typeof window._resyncDeskMergeBandCells === 'function') window._resyncDeskMergeBandCells();
            } else if (d.isInternalDeskSurface) {
                const col = state.columns[d.colIndex];
                if(col) col.deskHeight = Math.max(50, Math.min(col.deskHeight + col.deskClearance - MIN_SHELF_GAP, desiredH));
                distributeShelves(col);
            } else if (d.isInternalDeskClearance) {
                const col = state.columns[d.colIndex];
                if(col) col.deskClearance = Math.max(30, desiredH);
                distributeShelves(col);
            } else if (d.isInternalDeskDrawer) {
                if(state.columns[d.colIndex]) state.columns[d.colIndex].drawerHeight = Math.max(8, Math.min(40, desiredH));
            } else {
                const diff = Math.round((desiredH - d.h) * 100) / 100;
                const col = state.columns[d.colIndex];
                if(!col) return;
                const t = state.thickness;
                const cBaseY = col.type === 'desk' ? col.deskHeight + col.deskClearance : state.plinthHeight;
                if (d.isTop) {
                    if (col.shelves > 0) {
                        const shelfIdx = col.shelves - 1;
                        const currentY = col.shelvesY[shelfIdx];
                        const obs = [cBaseY + t / 2, col.height - t / 2];
                        if (col.splitY) { obs.push(col.splitY - t); obs.push(col.splitY + t); }
                        col.shelvesY.forEach((y, i) => { if (i !== shelfIdx) obs.push(y); });
                        const limitMin = Math.max(...obs.filter(y => y < currentY)) + MIN_SHELF_GAP + t;
                        const limitMax = Math.min(...obs.filter(y => y > currentY)) - MIN_SHELF_GAP - t;
                        col.shelvesY[shelfIdx] = Math.round(Math.max(limitMin, Math.min(limitMax, currentY - diff)) * 100) / 100;
                        e.target.value = _fmtCellHeightCm(col.height - t - col.shelvesY[shelfIdx] - t / 2);
                    }
                } else {
                    const div = d.divAbove;
                    if (!div) return;
                    if (div.type === 'split') {
                        let newSplitY = col.splitY + diff;
                        let maxAllowable = Math.min(getSplitThreshold(), ...state.columns.filter(c => c.splitY).map(c => c.height - 2*state.thickness - MIN_SHELF_GAP));
                        if (newSplitY > maxAllowable) newSplitY = maxAllowable;
                        _setActiveWingSplitY(newSplitY);
                    } else {
                        const shelfIdx = div.idx;
                        const currentY = col.shelvesY[shelfIdx];
                        const obs = [cBaseY + t / 2, col.height - t / 2];
                        if (col.splitY) { obs.push(col.splitY - t); obs.push(col.splitY + t); }
                        col.shelvesY.forEach((y, i) => { if (i !== shelfIdx) obs.push(y); });
                        const limitMin = Math.max(...obs.filter(y => y < currentY)) + MIN_SHELF_GAP + t;
                        const limitMax = Math.min(...obs.filter(y => y > currentY)) - MIN_SHELF_GAP - t;
                        col.shelvesY[shelfIdx] = Math.round(Math.max(limitMin, Math.min(limitMax, currentY + diff)) * 100) / 100;
                        e.target.value = _fmtCellHeightCm(col.shelvesY[shelfIdx] - (shelfIdx === 0 ? cBaseY + t : col.shelvesY[shelfIdx - 1] + t / 2) - t / 2);
                    }
                }
                checkSplits();
            }
            buildCabinet(); updateCameraView(); calculatePrice(); saveHistoryState();
        });

        // Append input (and suffix for wing-open-width)
        if (dimEl._wingOpenRow2) {
            const suffix = document.createElement('span');
            suffix.className = 'dim-suffix'; suffix.innerText = 'ס"מ';
            suffix.style.marginRight = '0';
            suffix.style.fontSize = '0.8rem';
            dimEl._wingOpenRow2.appendChild(input);
            dimEl._wingOpenRow2.appendChild(suffix);
        } else {
            input.style.fontSize = '0.78rem';
            input.style.width = '3.3em';
            input.style.minWidth = '2.5em';
            input.title = input.title || 'לחץ לעריכת המידה';
            input.addEventListener('mousedown', (e) => e.stopPropagation());
            input.addEventListener('click', (e) => { e.stopPropagation(); input.select(); });
            input.addEventListener('keydown', (e) => {
                e.stopPropagation();
                if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
            });
            dimEl.appendChild(input);
        }

        // For regular cell dims: embed the action button(s) directly inside the dim-container
        // Skip action buttons for partitioned cells — sub-cell buttons handle interaction instead
        if (!d.isDeskWidth && !d.isDeskHeight && !d.isDeskDrawer && !d.isInternalDeskSurface && !d.isInternalDeskClearance && !d.isInternalDeskDrawer && !d.isWingOpenWidth && !d.isSubCellBtn && !d.isPartitionedCell) {
            const isSelectedRow = state.selection.colIndex === d.colIndex && state.selection.rows.includes(d.rowIndex);
            const col = state.columns[d.colIndex];
            const comp = col.compartments[d.rowIndex];
            const hasContent = comp && comp.type !== 'empty';

            // Helper: adjust cell height by delta cm (moves the shelf boundary)
            const _adjustCellHeight = (delta) => {
                const t = state.thickness;
                const cBaseY = col.type === 'desk' ? col.deskHeight + col.deskClearance : state.plinthHeight;
                if (d.isTop) {
                    if (col.shelves > 0) {
                        const shelfIdx = col.shelves - 1;
                        const currentY = col.shelvesY[shelfIdx];
                        const obs = [cBaseY + t / 2, col.height - t / 2];
                        if (col.splitY) { obs.push(col.splitY - t); obs.push(col.splitY + t); }
                        col.shelvesY.forEach((y, i) => { if (i !== shelfIdx) obs.push(y); });
                        const limitMin = Math.max(...obs.filter(y => y < currentY)) + MIN_SHELF_GAP + t;
                        const limitMax = Math.min(...obs.filter(y => y > currentY)) - MIN_SHELF_GAP - t;
                        col.shelvesY[shelfIdx] = Math.round(Math.max(limitMin, Math.min(limitMax, currentY - delta)) * 100) / 100;
                    }
                } else {
                    const div = d.divAbove;
                    if (!div) return;
                    if (div.type === 'split') {
                        let newSplitY = col.splitY + delta;
                        let maxAllowable = Math.min(getSplitThreshold(), ...state.columns.filter(c => c.splitY).map(c => c.height - 2*state.thickness - MIN_SHELF_GAP));
                        if (newSplitY > maxAllowable) newSplitY = maxAllowable;
                        _setActiveWingSplitY(newSplitY);
                    } else {
                        const shelfIdx = div.idx;
                        const currentY = col.shelvesY[shelfIdx];
                        const obs = [cBaseY + t / 2, col.height - t / 2];
                        if (col.splitY) { obs.push(col.splitY - t); obs.push(col.splitY + t); }
                        col.shelvesY.forEach((y, i) => { if (i !== shelfIdx) obs.push(y); });
                        const limitMin = Math.max(...obs.filter(y => y < currentY)) + MIN_SHELF_GAP + t;
                        const limitMax = Math.min(...obs.filter(y => y > currentY)) - MIN_SHELF_GAP - t;
                        col.shelvesY[shelfIdx] = Math.round(Math.max(limitMin, Math.min(limitMax, currentY + delta)) * 100) / 100;
                    }
                }
                // Keep drawer counts in sync with the new cell heights (and clear below type min)
                if (col.compartments) {
                    for (let ri = 0; ri < col.compartments.length; ri++) {
                        _syncDrawerCompAfterHeight(col, ri);
                    }
                }
                checkSplits();
                buildCabinet(); updateCameraView(); calculatePrice(); saveHistoryState();
            };

            // Remove the plain input from dimEl — we'll show height inside the pill instead
            if (dimEl.contains(input)) dimEl.removeChild(input);

            // Strip dim-container's own frame — the pill IS the visual container
            dimEl.classList.add('pill-mode');
            dimEl.addEventListener('pointerdown', (e) => { e.stopPropagation(); });
            dimEl.addEventListener('pointerup', (e) => { e.stopPropagation(); });

            // Pill IS the visual container: [trash |] height | + — or the green ✓ when selected
            dimEl.insertBefore(_buildCellPill({
                selected: isSelectedRow,
                hasContent: hasContent,
                heightCm: Math.round((Number(d.h) || 0) * 10) / 10,
                onToggle: () => toggleSelection(d.colIndex, d.rowIndex),
                onTrash: () => {
                    const c = state.columns[d.colIndex].compartments[d.rowIndex];
                    if (c) {
                        c.type = 'empty';
                        delete c.partition;
                        delete c.partitions;
                        delete c.subCells;
                        _clearSubCellSelection();
                    }
                    buildCabinet(); calculatePrice(); saveHistoryState();
                },
                onHeightChange: (desired) => {
                    const delta = Math.round((desired - d.h) * 100) / 100;
                    if (Math.abs(delta) < 0.001) return false;
                    _adjustCellHeight(delta);
                }
            }), dimEl.firstChild);

            dimEl.style.cursor = 'default';
        }

        dimLayer.appendChild(dimEl);
    });

    // Cell-select button: one per partitioned cell, at cell center (shifted down)
    // Clicking it selects the whole cell so the user can add doors or change partition count
    state.dimData.filter(d => d.isCellSelectBtn).forEach(d => {
        const col = state.columns[d.colIndex];
        if (!col) return;

        // Cell-select button shows as selected only when the whole cell is selected AND no sub-cell is active
        const isSelected = state.selection.colIndex === d.colIndex &&
                           state.selection.rows.includes(d.rowIndex) &&
                           _activeSubCellIdxs.size === 0;

        const btn = document.createElement('div');
        // Use position:absolute directly — bypass dim-container class to avoid CSS overrides
        btn.className = 'cell-select-btn';
        btn.style.cssText = 'position:absolute;transform:translate(-50%,-50%);pointer-events:auto;';
        btn.dataset.x3d = d.x;
        btn.dataset.y3d = d.y;
        btn.title = isSelected ? 'בטל בחירת תא' : 'בחר תא שלם (להוספת דלת / שינוי מחיצות)';

        if (isSelected) {
            // Selected state: green check circle
            btn.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:50%;background:linear-gradient(135deg,#10b981,#059669);box-shadow:0 2px 8px rgba(16,185,129,0.55);cursor:pointer;transition:transform 0.15s,box-shadow 0.15s;"><i class="fa-solid fa-check" style="font-size:0.8rem;color:white;pointer-events:none;"></i></div>';
        } else {
            // Unselected: purple + circle (same style as other + buttons)
            btn.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:50%;background:linear-gradient(135deg,#6366f1,#8b5cf6);box-shadow:0 2px 8px rgba(99,102,241,0.55);cursor:pointer;transition:transform 0.15s,box-shadow 0.15s;"><i class="fa-solid fa-plus" style="font-size:0.9rem;color:white;pointer-events:none;font-weight:700;"></i></div>';
            const circle = btn.querySelector('div');
            btn.addEventListener('mouseenter', () => { circle.style.transform = 'scale(1.18)'; circle.style.boxShadow = '0 3px 12px rgba(99,102,241,0.75)'; });
            btn.addEventListener('mouseleave', () => { circle.style.transform = 'scale(1)'; circle.style.boxShadow = '0 2px 8px rgba(99,102,241,0.55)'; });
        }

        btn.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            e.stopPropagation();
        });
        btn.addEventListener('pointerup', (e) => {
            e.stopPropagation();
        });
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            // Clear sub-cell mode so toolbar operates on the whole cell
            _clearSubCellSelection();
            toggleSelection(d.colIndex, d.rowIndex);
        });

        dimLayer.appendChild(btn);
    });

    if (!window._VIEWER_MODE) {
        state.dimData.filter(d => d.isHoneycombMergeBtn).forEach(d => {
            const btn = document.createElement('div');
            btn.className = 'honeycomb-merge-btn';
            btn.style.cssText = 'position:absolute;transform:translate(-50%,-50%);pointer-events:auto;z-index:6;';
            btn.dataset.x3d = d.x;
            btn.dataset.y3d = d.y;
            const merged = !!d.merged;
            btn.title = merged ? 'בטל איחוד כוורות' : 'אחד כוורות';
            const bg = merged
                ? 'linear-gradient(135deg,#f59e0b,#d97706)'
                : 'linear-gradient(135deg,#0ea5e9,#0284c7)';
            const shadow = merged
                ? '0 2px 8px rgba(245,158,11,0.5)'
                : '0 2px 8px rgba(14,165,233,0.5)';
            const icon = merged ? 'fa-link-slash' : 'fa-link';
            btn.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:50%;background:' + bg + ';box-shadow:' + shadow + ';cursor:pointer;transition:transform 0.15s,box-shadow 0.15s;"><i class="fa-solid ' + icon + '" style="font-size:0.78rem;color:white;pointer-events:none;"></i></div>';
            const circle = btn.querySelector('div');
            btn.addEventListener('mouseenter', function() { circle.style.transform = 'scale(1.16)'; });
            btn.addEventListener('mouseleave', function() { circle.style.transform = 'scale(1)'; });
            btn.addEventListener('pointerdown', function(e) { e.preventDefault(); e.stopPropagation(); });
            btn.addEventListener('pointerup', function(e) { e.stopPropagation(); });
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                if (typeof window._toggleHoneycombColumnMerge === 'function') {
                    window._toggleHoneycombColumnMerge(d.leftCol, d.startR, d.endR);
                }
            });
            dimLayer.appendChild(btn);
        });

        state.dimData.filter(d => d.isDeskDrawerMergeBtn).forEach(d => {
            const btn = document.createElement('div');
            btn.className = 'desk-drawer-merge-btn';
            btn.style.cssText = 'position:absolute;transform:translate(-50%,-50%);pointer-events:auto;z-index:6;';
            btn.dataset.x3d = d.x;
            btn.dataset.y3d = d.y;
            const merged = !!d.merged;
            btn.title = merged ? 'בטל מיזוג מגירות' : 'מזג מגירה עם הארון';
            const bg = merged
                ? 'linear-gradient(135deg,#f59e0b,#d97706)'
                : 'linear-gradient(135deg,#10b981,#059669)';
            const shadow = merged
                ? '0 2px 8px rgba(245,158,11,0.5)'
                : '0 2px 8px rgba(16,185,129,0.5)';
            const icon = merged ? 'fa-link-slash' : 'fa-link';
            btn.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:50%;background:' + bg + ';box-shadow:' + shadow + ';cursor:pointer;transition:transform 0.15s,box-shadow 0.15s;"><i class="fa-solid ' + icon + '" style="font-size:0.78rem;color:white;pointer-events:none;"></i></div>';
            const circle = btn.querySelector('div');
            btn.addEventListener('mouseenter', function() { circle.style.transform = 'scale(1.16)'; });
            btn.addEventListener('mouseleave', function() { circle.style.transform = 'scale(1)'; });
            btn.addEventListener('pointerdown', function(e) { e.preventDefault(); e.stopPropagation(); });
            btn.addEventListener('pointerup', function(e) { e.stopPropagation(); });
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                if (typeof window.toggleDeskDrawerMerge === 'function') window.toggleDeskDrawerMerge();
            });
            dimLayer.appendChild(btn);
        });

        // Knee space above an internal desk: same cell pill as a regular cell, selects pseudo-row -1
        state.dimData.filter(d => d.isDeskZoneCell).forEach(d => {
            const col = state.columns[d.colIndex];
            if (!col) return;
            const dimEl = document.createElement('div');
            dimEl.className = 'dim-container pill-mode';
            dimEl.dataset.x3d = d.x;
            dimEl.dataset.y3d = d.y;
            dimEl.addEventListener('pointerdown', e => e.stopPropagation());
            dimEl.addEventListener('pointerup', e => e.stopPropagation());
            dimEl.appendChild(_buildCellPill({
                selected: state.selection.colIndex === d.colIndex && state.selection.rows.includes(-1),
                hasContent: !!(col.deskLeds || col.deskHoneycomb),
                heightCm: Math.round((Number(d.h) || 0) * 10) / 10,
                onToggle: () => toggleSelection(d.colIndex, -1),
                onTrash: () => {
                    delete col.deskLeds;
                    delete col.deskHoneycomb;
                    buildCabinet(); calculatePrice(); saveHistoryState();
                },
                onHeightChange: (desired) => {
                    let maxTop = col.shelvesY.length > 0 ? col.shelvesY[0] - MIN_SHELF_GAP : col.height - MIN_SHELF_GAP;
                    if (col.splitY) maxTop = Math.min(maxTop, col.splitY - MIN_SHELF_GAP);
                    const clr = Math.round(Math.max(30, Math.min(maxTop - col.deskHeight, desired)) * 10) / 10;
                    if (Math.abs(clr - col.deskClearance) < 0.001) return false;
                    col.deskClearance = clr;
                    distributeShelves(col);
                    buildCabinet(); updateCameraView(); calculatePrice(); saveHistoryState();
                }
            }));
            dimEl.style.cursor = 'default';
            dimLayer.appendChild(dimEl);
        });

        state.dimData.filter(d => d.isTvSizeBtn).forEach(d => {
            const btn = document.createElement('div');
            btn.className = 'tv-size-btn';
            btn.dataset.x3d = d.x;
            btn.dataset.y3d = d.y;
            btn.title = 'שינוי גודל הטלוויזיה';
            btn.innerHTML = '<i class="fa-solid fa-up-right-and-down-left-from-center"></i><span>' + d.inch + '″</span>';
            btn.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); });
            btn.addEventListener('pointerup', e => e.stopPropagation());
            btn.addEventListener('click', e => {
                e.stopPropagation();
                _openTvSizeMenu(d.colIndex, d.rowIndex, btn);
            });
            dimLayer.appendChild(btn);
        });
    }

    // Sub-cell + buttons: one per zone in partitioned cells (per-zone composite key "si:z")
    state.dimData.filter(d => d.isSubCellBtn).forEach(d => {
        const col = state.columns[d.colIndex];
        if (!col) return;
        const comp = col.compartments[d.rowIndex];
        if (!comp || !comp.partition) return;

        // Composite key for this zone button
        const zoneKey = _subKey(d.subCellIdx, d.zoneIdx !== undefined ? d.zoneIdx : 0);

        const isSelected = _subCellUiSelected(d.colIndex, d.rowIndex, zoneKey);

        // Determine zone content: interior and/or door (both can coexist)
        const sub = comp.subCells && comp.subCells[d.subCellIdx];
        const zoneIdx = d.zoneIdx !== undefined ? d.zoneIdx : 0;
        if (sub) _ensureZoneDoorSplit(sub);
        const hasSubContent = !!(sub && _zoneHasAnyContent(comp, sub, zoneIdx, zoneKey));

        const btn = document.createElement('div');
        btn.className = 'sub-cell-btn';
        btn.style.cssText = 'position:absolute;transform:translate(-50%,-50%);pointer-events:auto;background:transparent;border:none;box-shadow:none;padding:0;cursor:pointer;';
        btn.dataset.x3d = d.x;
        btn.dataset.y3d = d.y;
        // Show zone label if multiple zones exist in this sub-cell
        const zoneLabel = (d.numZones && d.numZones > 1) ? `תא ${d.subCellIdx + 1} אזור ${zoneIdx + 1}` : `תא ${d.subCellIdx + 1}`;
        btn.title = zoneLabel + ' — לחץ לבחירה (ניתן לבחור כמה אזורים)';

        // Stop pointer events from bubbling to canvas (prevents canvas pointerup from clearing state.selection)
        btn.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); });
        btn.addEventListener('pointerup', e => e.stopPropagation());

        const zoneHDisp = Math.round((Number(d.h) || 0) * 10) / 10;
        const heightHtml = zoneHDisp > 0
            ? `<span class="sub-zone-h" style="font-size:0.72rem;font-weight:700;color:rgba(255,255,255,0.95);line-height:1;min-width:2.2em;text-align:center;pointer-events:none;">${_fmtCellHeightCm(zoneHDisp)}</span>
               <div style="width:1px;height:12px;background:rgba(255,255,255,0.2);margin:0 2px;flex-shrink:0;pointer-events:none;"></div>`
            : '';

        if (isSelected) {
            // Selected: green check — click again to remove from multi-selection
            btn.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:50%;background:linear-gradient(135deg,#10b981,#059669);box-shadow:0 0 0 2px rgba(16,185,129,0.35),0 2px 8px rgba(16,185,129,0.55);cursor:pointer;"><i class="fa-solid fa-check" style="font-size:0.75rem;color:white;pointer-events:none;"></i></div>`;
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                // Select the cell first if not selected — clear zones when switching column/row
                if (!(state.selection.colIndex === d.colIndex && state.selection.rows.includes(d.rowIndex))) {
                    state.selection = { colIndex: d.colIndex, rows: [d.rowIndex] };
                }
                _setSubCellOwner(d.colIndex, d.rowIndex);
                window.setActiveSubCell(zoneKey);
            });
        } else if (hasSubContent) {
            // Has content: pill with height + pen + trash
            btn.innerHTML = `<div class="sub-cell-pill" style="display:flex;align-items:center;gap:4px;direction:ltr;background:rgba(30,30,40,0.82);border-radius:20px;padding:3px 8px 3px 6px;box-shadow:0 2px 8px rgba(0,0,0,0.3);cursor:pointer;">
                ${heightHtml}
                <i class="fa-solid fa-pen sub-btn-edit" style="font-size:9px;color:rgba(255,255,255,0.8);pointer-events:none;" title="הוסף לבחירה"></i>
                <div style="width:1px;height:10px;background:rgba(255,255,255,0.25);pointer-events:none;"></div>
                <i class="fa-solid fa-trash sub-btn-trash" style="font-size:9px;color:rgba(255,255,255,0.6);cursor:pointer;transition:color 0.15s;" title="נקה תא"></i>
            </div>`;
            const pill = btn.querySelector('.sub-cell-pill');
            pill.addEventListener('mouseenter', () => { pill.style.background = 'rgba(40,40,55,0.92)'; });
            pill.addEventListener('mouseleave', () => { pill.style.background = 'rgba(30,30,40,0.82)'; });
            btn.querySelector('.sub-btn-trash').addEventListener('mouseenter', e => { e.target.style.color = '#ef4444'; });
            btn.querySelector('.sub-btn-trash').addEventListener('mouseleave', e => { e.target.style.color = 'rgba(255,255,255,0.6)'; });
            btn.addEventListener('click', (e) => {
                if (e.target.closest('.sub-btn-trash')) return;
                e.stopPropagation();
                if (!(state.selection.colIndex === d.colIndex && state.selection.rows.includes(d.rowIndex))) {
                    state.selection = { colIndex: d.colIndex, rows: [d.rowIndex] };
                }
                _setSubCellOwner(d.colIndex, d.rowIndex);
                window.setActiveSubCell(zoneKey);
            });
            btn.querySelector('.sub-btn-trash').addEventListener('click', (e) => {
                e.stopPropagation();
                const keysToClear = (_activeSubCellOwner.col === d.colIndex && _activeSubCellOwner.row === d.rowIndex && _activeSubCellIdxs.size > 0)
                    ? new Set(_activeSubCellIdxs)
                    : new Set([zoneKey]);
                keysToClear.forEach(key => {
                    const { si, z } = _parseSubKey(key);
                    const sub = comp.subCells && comp.subCells[si];
                    if (!sub) return;
                    _clearSubZoneContent(sub, z);
                });
                _removeZoneDoorGroupsForKeys(comp, [...keysToClear]);
                _clearSubCellSelection();
                buildCabinet(); calculatePrice(); saveHistoryState();
                updateToolbarButtonHighlights();
            });
        } else {
            // Empty zone: height + teal + (same idea as purple cell pill)
            btn.innerHTML = `<div class="sub-cell-pill" style="display:flex;align-items:center;gap:0;direction:ltr;background:rgba(30,30,40,0.82);border-radius:20px;padding:3px 6px 3px 6px;box-shadow:0 2px 10px rgba(0,0,0,0.35);cursor:pointer;">
                ${heightHtml}
                <div class="sub-plus-circle" style="display:flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:50%;background:linear-gradient(135deg,#06b6d4,#0891b2);transition:all 0.18s cubic-bezier(.4,0,.2,1);box-shadow:0 2px 6px rgba(6,182,212,0.5);"><i class="fa-solid fa-plus" style="font-size:10px;color:white;pointer-events:none;font-weight:700;"></i></div>
            </div>`;
            const pill = btn.querySelector('.sub-cell-pill');
            const circle = btn.querySelector('.sub-plus-circle');
            btn.addEventListener('mouseenter', () => {
                circle.style.background = 'linear-gradient(135deg,#0891b2,#0e7490)';
                circle.style.transform = 'scale(1.15)';
                circle.style.boxShadow = '0 3px 10px rgba(6,182,212,0.7)';
                pill.style.background = 'rgba(40,40,55,0.92)';
            });
            btn.addEventListener('mouseleave', () => {
                circle.style.background = 'linear-gradient(135deg,#06b6d4,#0891b2)';
                circle.style.transform = 'scale(1)';
                circle.style.boxShadow = '0 2px 6px rgba(6,182,212,0.5)';
                pill.style.background = 'rgba(30,30,40,0.82)';
            });
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (!(state.selection.colIndex === d.colIndex && state.selection.rows.includes(d.rowIndex))) {
                    state.selection = { colIndex: d.colIndex, rows: [d.rowIndex] };
                }
                _setSubCellOwner(d.colIndex, d.rowIndex);
                window.setActiveSubCell(zoneKey);
            });
        }

        dimLayer.appendChild(btn);
    });

    // Select-all-column buttons: one per column, centered on the plinth
    if (dragHandlesData && dragHandlesData.selectAll) {
        dragHandlesData.selectAll.forEach(item => {
            const col = state.columns[item.colIndex];
            if (!col) return;
            const numRows = _getColumnRowCount(col);
            const allSelected = state.selection.colIndex === item.colIndex && state.selection.rows.length === numRows;

            const btn = document.createElement('div');
            btn.className = 'select-all-col-btn' + (allSelected ? ' all-selected' : '');
            btn.dataset.x3d = item.x;
            btn.dataset.y3d = item.y;
            btn.dataset.colIndex = item.colIndex;
            btn.title = allSelected ? 'בטל בחירת כל התאים' : 'בחר את כל התאים בעמודה';
            btn.innerHTML = allSelected ? '<i class="fa-solid fa-check-double"></i>' : '<i class="fa-solid fa-table-cells"></i>';

            btn.addEventListener('pointerdown', (e) => {
                e.preventDefault();
                e.stopPropagation();
            });
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                selectAllColumn(item.colIndex);
            });
            buttonsLayer.appendChild(btn);

            // Magic-wand: column templates (skip in viewer)
            if (!window._VIEWER_MODE) {
                const wand = document.createElement('div');
                wand.className = 'col-template-btn';
                wand.dataset.x3d = item.x + 10;
                wand.dataset.y3d = item.y;
                wand.dataset.colIndex = String(item.colIndex);
                wand.title = 'תבניות עמודה';
                wand.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i>';
                wand.addEventListener('pointerdown', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                });
                wand.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (typeof window.openColumnTemplatesSheet === 'function') {
                        window.openColumnTemplatesSheet(item.colIndex);
                    }
                });
                buttonsLayer.appendChild(wand);
            }
        });
    }

    updateOverlaysPosition();
}

// ── Handle Picker Popup ─────────────────────────────────────────────────────

const HANDLE_CATALOG = [
    {
        id: 'touch',
        label: 'ללא ידית',
        sub: 'פתיחה בלחיצה',
        svgPath: `<svg viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg" width="28" height="28">
            <rect x="4" y="10" width="28" height="16" rx="8" fill="currentColor" opacity="0.15"/>
            <path d="M12 18h12" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-dasharray="3 3"/>
            <circle cx="18" cy="18" r="3" fill="currentColor"/>
        </svg>`
    },
    {
        id: 'pipe',
        label: 'חיצונית',
        sub: 'ידית חיצונית אופקית',
        svgPath: `<svg viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg" width="28" height="28">
            <rect x="6" y="15" width="24" height="6" rx="3" fill="currentColor"/>
            <rect x="9" y="12" width="2" height="12" rx="1" fill="currentColor" opacity="0.5"/>
            <rect x="25" y="12" width="2" height="12" rx="1" fill="currentColor" opacity="0.5"/>
        </svg>`
    },
    {
        id: 'riding',
        label: 'רוכבת',
        sub: 'ידית רוכבת',
        svgPath: `<svg viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg" width="28" height="28">
            <rect x="4" y="16" width="28" height="4" rx="2" fill="currentColor"/>
            <rect x="4" y="16" width="28" height="4" rx="2" fill="currentColor" opacity="0.3" transform="translate(0,6)"/>
        </svg>`
    },
];

window._handlePickerApply = null;

/**
 * finish ({ handleVariant, ridingColor }) enables the second step: after picking external / riding,
 * the sheet shows that type's finishes and onSelect(style, choice) runs only once a finish is chosen.
 */
function _openHandlePickerSheet(currentStyle, descText, onSelect, finish) {
    window._handlePickerApply = onSelect;
    _renderHandleTypeStep(currentStyle, descText, finish);

    const overlay = document.getElementById('handle-picker-overlay');
    const sheet = document.getElementById('handle-picker-sheet');
    if (!overlay || !sheet) return;
    overlay.style.display = 'flex';
    sheet.style.transform = 'translateY(100%)';
    requestAnimationFrame(() => {
        requestAnimationFrame(() => { sheet.style.transform = ''; });
    });
    document.body.style.overflow = 'hidden';
}

function _renderHandleTypeStep(currentStyle, descText, finish) {
    const descEl = document.getElementById('handle-picker-desc-text');
    if (descEl) descEl.textContent = descText;
    const grid = document.getElementById('handle-picker-grid');
    if (!grid) return;
    grid.innerHTML = '';
    grid.style.gridTemplateColumns = 'repeat(3,1fr)';
    HANDLE_CATALOG.forEach(h => {
        const card = document.createElement('div');
        card.className = 'handle-picker-card' + (h.id === currentStyle ? ' active' : '');
        card.innerHTML = `
            <div class="handle-picker-icon" style="color:${h.id === currentStyle ? '#fff' : 'var(--primary)'};">${h.svgPath}</div>
            <div class="handle-picker-name">${h.label}</div>
            <div class="handle-picker-sub">${h.sub}</div>
        `;
        card.addEventListener('click', () => {
            if (finish && h.id !== 'touch') {
                _renderHandleFinishStep(h.id, currentStyle, descText, finish);
                return;
            }
            if (typeof window._handlePickerApply === 'function') window._handlePickerApply(h.id);
            closeHandlePicker();
        });
        grid.appendChild(card);
    });
}

function _renderHandleFinishStep(style, currentStyle, descText, finish) {
    const descEl = document.getElementById('handle-picker-desc-text');
    if (descEl) descEl.textContent = style === 'riding' ? 'בחרו גוון לידית הרוכבת' : 'בחרו דגם לידית החיצונית';
    const grid = document.getElementById('handle-picker-grid');
    if (!grid) return;
    grid.innerHTML = '';
    grid.style.gridTemplateColumns = 'repeat(4,1fr)';

    const back = document.createElement('button');
    back.type = 'button';
    back.className = 'handle-picker-back';
    back.innerHTML = '<i class="fa-solid fa-arrow-right"></i> חזרה לסוגי הידיות';
    back.addEventListener('click', () => _renderHandleTypeStep(currentStyle, descText, finish));
    grid.appendChild(back);

    const isRiding = style === 'riding';
    const src = isRiding ? window.RIDING_COLORS : window.HANDLE_VARIANTS;
    const activeId = currentStyle !== style ? null
        : isRiding ? window._ridingColorId(finish.ridingColor) : window._handleVariantId(finish.handleVariant);
    Object.keys(src).filter(id => !src[id].wingOnly).forEach(id => {
        const card = document.createElement('div');
        card.className = 'handle-picker-card handle-finish-card' + (id === activeId ? ' active' : '');
        const thumb = isRiding
            ? `<span class="riding-swatch"><i class="rs-${id}"></i></span>`
            : `<img src="${src[id].thumb}" alt="">`;
        card.innerHTML = `<div class="handle-finish-thumb">${thumb}</div><div class="handle-picker-name">${src[id].label}</div>`;
        card.addEventListener('click', () => {
            if (typeof window._handlePickerApply === 'function') {
                window._handlePickerApply(style, isRiding ? { ridingColor: id } : { handleVariant: id });
            }
            closeHandlePicker();
        });
        grid.appendChild(card);
    });
}

function _applyHandleChoice(target, style, choice) {
    target.handleStyle = style;
    if (choice && choice.handleVariant) target.handleVariant = choice.handleVariant;
    if (choice && choice.ridingColor) target.ridingColor = choice.ridingColor;
}

function _getZoneDoorHandleStyle(comp, sub, z, zoneKey) {
    if (comp && zoneKey) {
        const grp = _zoneDoorGroupForKey(comp, zoneKey);
        if (grp && _isDoorZoneType(grp.type) && grp.handleStyle) return grp.handleStyle;
    }
    if (sub && Array.isArray(sub.zonesDoorHandleStyle) && sub.zonesDoorHandleStyle[z]) {
        return sub.zonesDoorHandleStyle[z];
    }
    return null;
}

function _setZoneArrayValue(sub, key, z, value) {
    if (!Array.isArray(sub[key])) sub[key] = [];
    while (sub[key].length <= z) sub[key].push(null);
    sub[key][z] = value;
}

function _setZoneDoorHandleStyle(comp, sub, z, zoneKey, style, choice) {
    if (comp && zoneKey) {
        const grp = _zoneDoorGroupForKey(comp, zoneKey);
        if (grp && _isDoorZoneType(grp.type)) {
            _applyHandleChoice(grp, style, choice);
            return true;
        }
    }
    if (!sub) return false;
    if (!_isDoorZoneType(_zoneDoorAt(sub, z))) return false;
    _setZoneArrayValue(sub, 'zonesDoorHandleStyle', z, style);
    if (choice && choice.handleVariant) _setZoneArrayValue(sub, 'zonesDoorHandleVariant', z, choice.handleVariant);
    if (choice && choice.ridingColor) _setZoneArrayValue(sub, 'zonesDoorRidingColor', z, choice.ridingColor);
    return true;
}

/** Current finish of a handle owner (door / drawer cell / zone group), falling back to the wing default. */
function _handleFinishOf(obj) {
    return {
        handleVariant: (obj && obj.handleVariant) || state.handleVariant,
        ridingColor: (obj && obj.ridingColor) || state.ridingColor
    };
}

window.openHandlePicker = function() {
    const selCol = state.selection.colIndex;
    const col = selCol >= 0 ? state.columns[selCol] : null;
    if (!col || state.selection.rows.length === 0) return;

    const firstComp = col.compartments[state.selection.rows[0]];
    const existingDoor = col.doors.find(d =>
        d.type !== 'empty' && state.selection.rows.some(r => r >= d.startRow && r <= d.endRow)
    );

    const isExtDrawer = firstComp && firstComp.type === 'external_drawers';

    // Resolve current style for this cell (override or wing default)
    let currentStyle = state.handleStyle || 'pipe';
    let finish = _handleFinishOf(null);
    let descText = 'ידית לדלת';

    // Partition zone doors / external drawers take priority when zones are selected
    if (_activeSubCellIdxs.size > 0 && firstComp && firstComp.partition && Array.isArray(firstComp.subCells)) {
        let foundDoor = false;
        let foundExt = false;
        _activeSubCellIdxs.forEach(key => {
            const { si, z } = _parseSubKey(key);
            const sub = firstComp.subCells[si];
            if (!sub) return;
            if (_zoneInteriorAt(sub, z) === 'external_drawers') {
                foundExt = true;
                if (sub.handleStyle) { currentStyle = sub.handleStyle; finish = _handleFinishOf(sub); }
            }
            const hs = _getZoneDoorHandleStyle(firstComp, sub, z, key);
            const grp = _zoneDoorGroupForKey(firstComp, key);
            const hasDoor = (grp && _isDoorZoneType(grp.type)) || _isDoorZoneType(_zoneDoorAt(sub, z));
            if (hasDoor) {
                foundDoor = true;
                if (hs) {
                    currentStyle = hs;
                    finish = (grp && _isDoorZoneType(grp.type)) ? _handleFinishOf(grp) : _handleFinishOf({
                        handleVariant: (sub.zonesDoorHandleVariant || [])[z],
                        ridingColor: (sub.zonesDoorRidingColor || [])[z]
                    });
                }
            }
        });
        if (foundExt && foundDoor) descText = 'ידית למגירות החיצוניות ולדלת במחיצה';
        else if (foundExt) descText = 'ידית למגירות החיצוניות במחיצה';
        else if (foundDoor) descText = 'ידית לדלת במחיצה';
        else if (isExtDrawer && firstComp.handleStyle) { currentStyle = firstComp.handleStyle; finish = _handleFinishOf(firstComp); }
        else if (existingDoor && existingDoor.handleStyle) { currentStyle = existingDoor.handleStyle; finish = _handleFinishOf(existingDoor); }
    } else {
        if (isExtDrawer && firstComp.handleStyle) { currentStyle = firstComp.handleStyle; finish = _handleFinishOf(firstComp); }
        else if (existingDoor && existingDoor.handleStyle) { currentStyle = existingDoor.handleStyle; finish = _handleFinishOf(existingDoor); }
        if (isExtDrawer && existingDoor) descText = 'ידית למגירות החיצוניות ולדלת';
        else if (isExtDrawer) descText = 'ידית למגירות החיצוניות בתא';
    }

    _openHandlePickerSheet(currentStyle, descText, applyHandleStyleToCell, finish);
};

window.openCornerDeskHandlePicker = function() {
    const w = getWing();
    if (!w || !w.corner || w.corner.side === 'none' || w.corner.type !== 'desk') return;
    const cu = w.corner;
    let currentStyle = cu.deskHandleStyle || state.handleStyle || 'pipe';
    if (state.cabinetModel === 'ab2') currentStyle = 'touch';
    _openHandlePickerSheet(currentStyle, 'ידית למגירות שולחן פינתי', function(style) {
        cu.deskHandleStyle = style;
        if (typeof window._syncCornerDeskHandleUI === 'function') window._syncCornerDeskHandleUI(w);
        buildCabinet();
        calculatePrice();
        saveHistoryState();
    });
};

window.closeHandlePicker = function() {
    const overlay = document.getElementById('handle-picker-overlay');
    const sheet = document.getElementById('handle-picker-sheet');
    if (!overlay || !sheet) return;
    sheet.style.transform = 'translateY(100%)';
    setTimeout(() => {
        overlay.style.display = 'none';
        sheet.style.transform = '';
    }, 280);
    document.body.style.overflow = '';
};

window.applyHandleStyleToCell = function(style, choice) {
    const selCol = state.selection.colIndex;
    const col = selCol >= 0 ? state.columns[selCol] : null;
    if (!col || state.selection.rows.length === 0) return;

    let changed = false;
    // Partition zone external drawers + partition doors
    if (_activeSubCellIdxs.size > 0) {
        const r = state.selection.rows[0];
        const comp = col.compartments[r];
        if (comp && comp.partition && Array.isArray(comp.subCells)) {
            _activeSubCellIdxs.forEach(key => {
                const { si, z } = _parseSubKey(key);
                const sub = comp.subCells[si];
                if (!sub) return;
                if (_zoneInteriorAt(sub, z) === 'external_drawers') {
                    _applyHandleChoice(sub, style, choice);
                    changed = true;
                }
                if (_setZoneDoorHandleStyle(comp, sub, z, key, style, choice)) {
                    changed = true;
                }
            });
        }
    }
    // Apply to external_drawers compartments in selected rows
    state.selection.rows.forEach(r => {
        const comp = col.compartments[r];
        if (comp && comp.type === 'external_drawers') {
            _applyHandleChoice(comp, style, choice);
            changed = true;
        }
    });
    // Apply to column overlay doors that cover any selected row
    col.doors.forEach(door => {
        if (door.type === 'empty') return;
        if (state.selection.rows.some(r => r >= door.startRow && r <= door.endRow)) {
            _applyHandleChoice(door, style, choice);
            changed = true;
        }
    });

    if (changed) {
        buildCabinet();
        calculatePrice();
        saveHistoryState();
        updateToolbarButtonHighlights();
        if (typeof updateMobileCellSheetState === 'function') updateMobileCellSheetState();
    }
};

// ── End Handle Picker ────────────────────────────────────────────────────────

function updateToolbarState() {
    const toolbar = document.getElementById('bottom-floating-toolbar');
    if(!toolbar) return;
    // Desk knee-zone selection outlives its desk (desk removed / undo) → drop it
    if (state.selection.rows.includes(-1) && !_isDeskZoneSelection()) state.selection = { colIndex: -1, rows: [] };
    
    const hasSelection = (state.selection.colIndex > -1 && state.selection.rows.length > 0);
    const viewModeOK = (state.viewMode === 'front');

    if (hasSelection && viewModeOK) {
        toolbar.classList.add('show-toolbar');
        updateToolbarButtonHighlights();
        
        const colIndex = state.selection.colIndex;
        const col = state.columns[colIndex];
        const midRow = state.selection.rows[Math.floor(state.selection.rows.length / 2)];
        
        // For partitioned cells, regular dimData entry is suppressed — fall back to isSubCellBtn entry
        const dim = state.dimData.find(d => d.colIndex === colIndex && d.rowIndex === midRow && !d.isSubCellBtn)
                 || state.dimData.find(d => d.colIndex === colIndex && d.rowIndex === midRow && d.isSubCellBtn);
        
        if (dim) {
            const rightEdgeX = dim.x + (col.width / 4);
            const vector = new THREE.Vector3(rightEdgeX, dim.y, state.depth / 2);
            // Apply wing group transform so wing columns project correctly
            if (window._activeWingGroup) {
                window._activeWingGroup.updateMatrixWorld(true);
                vector.applyMatrix4(window._activeWingGroup.matrixWorld);
            } else if (window.cabinetGroup) {
                window.cabinetGroup.updateMatrixWorld(true);
                vector.applyMatrix4(window.cabinetGroup.matrixWorld);
            }
            vector.project(camera);

            const cw = container.clientWidth;
            const ch = container.clientHeight;
            
            let x = (vector.x * 0.5 + 0.5) * cw;
            let y = (-(vector.y * 0.5) + 0.5) * ch;
            
            // Clamp toolbar within canvas
            const w = toolbar.offsetWidth || 380;
            const h = toolbar.offsetHeight || 150;

            x = Math.max(w/2 + 10, Math.min(cw - w/2 - 10, x));
            y = Math.max(h/2 + 10, Math.min(ch - h/2 - 10, y));
            
            toolbar.style.left = `${x}px`;
            toolbar.style.top = `${y}px`;
            // Sub-panels are now inline inside the toolbar — no separate positioning needed
        }
    } else {
        toolbar.classList.remove('show-toolbar');
        // Close content sub-panels when toolbar hides
        closeContentSubPanels();
    }
    // Sync room wall selector visibility and highlights
    if (typeof window._updateRoomWallUI === 'function') window._updateRoomWallUI();
}

function updateToolbarButtonHighlights() {
    const toolbar = document.getElementById('bottom-floating-toolbar');
    if(!toolbar) return;
    const deskZone = _isDeskZoneSelection();
    toolbar.classList.toggle('desk-zone-mode', deskZone);
    toolbar.querySelectorAll('button.toolbar-btn').forEach(b => b.classList.remove('active'));
    const hcBtn = document.getElementById('tb-btn-honeycomb');
    if (hcBtn) {
        const removable = !!_selectionHoneycombType();
        hcBtn.classList.toggle('is-removable', removable);
        hcBtn.title = removable ? 'לחץ להסרת הכוורת' : '';
    }
    // Also clear sub-panel button highlights
    ['hanging-sub-panel','drawer-sub-panel','honeycomb-sub-panel','appliances-sub-panel'].forEach(id => {
        const p = document.getElementById(id);
        if (p) p.querySelectorAll('button.toolbar-btn').forEach(b => b.classList.remove('active'));
    });

    // Re-sync sub-panel-open highlight: whichever sub-panel is currently visible
    const _subPanelMap = { 'hanging-sub-panel': 'tb-btn-hanging', 'drawer-sub-panel': 'tb-btn-drawer', 'honeycomb-sub-panel': 'tb-btn-honeycomb', 'appliances-sub-panel': 'tb-btn-appliances' };
    Object.entries(_subPanelMap).forEach(([panelId, btnId]) => {
        const panel = document.getElementById(panelId);
        const btn = document.getElementById(btnId);
        if (!btn) return;
        if (panel && panel.style.display !== 'none') {
            btn.classList.add('sub-panel-open');
        } else {
            btn.classList.remove('sub-panel-open');
        }
    });

    if (state.selection.colIndex === -1 || state.selection.rows.length === 0) {
        // Do NOT clear _activeSubCellIdxs here — it is managed by setActiveSubCell/clearSelection
        // Hide partition counter
        const pc = document.getElementById('tb-partition-counter');
        if (pc) pc.style.display = 'none';
        return;
    }
    const col = state.columns[state.selection.colIndex];
    const startR = Math.min(...state.selection.rows);
    const endR = Math.max(...state.selection.rows);

    const ledBtn = document.getElementById('tb-btn-led');
    if (ledBtn) ledBtn.classList.toggle('active', _ledGroupIndexForSelection(col) !== -1);
    // Desk knee zone: only כוורת + לדים apply (CSS hides the rest of the toolbar)
    if (deskZone) return;

    // "תאים שווים" button: show only when 2+ consecutive rows are selected
    const equalCellsBtn = document.getElementById('tb-btn-equal-cells');
    if (equalCellsBtn) {
        const selRows = state.selection.rows.slice().sort((a, b) => a - b);
        const isConsecutive = selRows.length >= 2 &&
            selRows[selRows.length - 1] - selRows[0] + 1 === selRows.length;
        equalCellsBtn.style.display = isConsecutive ? '' : 'none';
    }

    // For sliding wardrobes: hide כוורת, מגירות חיצוניות, דלתות, door-style-panel
    const _isSliding = state.presetId === 'sliding' && state.slidingDoor && state.slidingDoor.enabled;
    const btnHoneycomb = document.getElementById('tb-btn-honeycomb');
    const btnDrawer = document.getElementById('tb-btn-drawer');
    const extDrawerBtn = document.querySelector('#drawer-sub-panel button[data-drawer-type="external_drawers"]');
    const honeycombSubPanel = document.getElementById('honeycomb-sub-panel');
    // Door section: the toolbar-section containing door buttons (ללא/ימין/שמאל/כפול)
    const doorSection = document.querySelector('.toolbar-section:has(button[onclick="applyDoor(\'empty\')"])');
    const _doorStylePanels = {
        right: document.getElementById('door-style-panel-right'),
        left:  document.getElementById('door-style-panel-left'),
        double: document.getElementById('door-style-panel-double'),
        flap:  document.getElementById('door-style-panel-flap'),
    };

    const firstComp = col.compartments[state.selection.rows[0]];

    if (doorSection) {
        const applBlocked = state.selection.rows.some(r => _cellApplianceBlocksDoor(col, r));
        doorSection.classList.toggle('appl-door-blocked', applBlocked);
        doorSection.title = applBlocked ? 'המכשיר בולט מחזית הארון — לא ניתן להתקין דלת על התא' : '';
    }

    // ── Partition counter UI: show [−] N [+] next to מחיצה button when partition is active ──
    const hasPartition = firstComp && firstComp.partition &&
                         firstComp.type !== 'open_cell' && firstComp.type !== 'side_open_cell' &&
                         state.selection.rows.length === 1;
    const partCounter = document.getElementById('tb-partition-counter');
    const partCountDisplay = document.getElementById('tb-partition-count');
    if (partCounter) {
        if (hasPartition) {
            const nBoards = Array.isArray(firstComp.partitions) ? firstComp.partitions.length : 1;
            partCounter.style.display = 'flex';
            if (partCountDisplay) partCountDisplay.innerText = nBoards;
        } else {
            partCounter.style.display = 'none';
        }
    }

    // ── Sub-cell mode: when sub-cells are selected, show sub-cell title and highlight content ──
    const subCellTitleEl = document.getElementById('tb-subcell-title');
    const _hasActiveSubCells = _activeSubCellIdxs.size > 0;
    if (subCellTitleEl) {
        if (_hasActiveSubCells && hasPartition) {
            subCellTitleEl.style.display = '';
            if (_activeSubCellIdxs.size === 1) {
                const { si: _tSi, z: _tZ } = _parseSubKey(_activeSubCellIdxs.values().next().value);
                const _activeSub = firstComp.subCells && firstComp.subCells[_tSi];
                const _numZones = _activeSub && Array.isArray(_activeSub.zonesType) ? _activeSub.zonesType.length : 1;
                if (_numZones > 1) {
                    subCellTitleEl.innerText = `תא ${_tSi + 1} אזור ${_tZ + 1}`;
                } else {
                    subCellTitleEl.innerText = `תא ${_tSi + 1}`;
                }
            } else {
                subCellTitleEl.innerText = `${_activeSubCellIdxs.size} אזורים נבחרו`;
            }
        } else if (hasPartition && state.selection.rows.length === 1) {
            subCellTitleEl.style.display = '';
            subCellTitleEl.innerText = 'לחץ על + בכל אזור — ניתן לבחור כמה';
        } else {
            subCellTitleEl.style.display = 'none';
        }
    }

    const shelfSection = document.getElementById('tb-subcell-shelf-section');
    const selectAllRow = document.getElementById('tb-subcell-select-row');
    if (hasPartition && state.selection.rows.length === 1) {
        if (shelfSection) shelfSection.style.display = 'flex';
        if (selectAllRow) selectAllRow.style.display = 'flex';
        const nSubs = Array.isArray(firstComp.subCells) ? firstComp.subCells.length : 2;
        for (let si = 0; si < 4; si++) {
            const sideBtn = document.getElementById('tb-select-subcell-' + si);
            if (sideBtn) sideBtn.style.display = si < nSubs ? '' : 'none';
        }
    } else if (shelfSection && !_hasActiveSubCells) {
        shelfSection.style.display = 'none';
        if (selectAllRow) selectAllRow.style.display = 'none';
    }

    // In sub-cell mode: highlight interior AND door independently (they coexist)
    if (_hasActiveSubCells && hasPartition && Array.isArray(firstComp.subCells)) {
        const selectedKeysArr = _sortedSubKeys(_activeSubCellIdxs);
        const mergedGroup = _findZoneDoorGroup(firstComp, selectedKeysArr);
        const { si: _activeSi, z: _activeZ } = _parseSubKey(selectedKeysArr[0]);
        const activeSub = firstComp.subCells[_activeSi];
        if (activeSub) _ensureZoneDoorSplit(activeSub);

        // Interior highlight
        let interiorType = 'empty';
        if (activeSub) {
            const honeyGrp = mergedGroup && (mergedGroup.type === 'honeycomb' || mergedGroup.type === 'open_cell' || mergedGroup.type === 'side_open_cell');
            if (honeyGrp && _subKeysEqual(mergedGroup.keys, selectedKeysArr)) {
                interiorType = mergedGroup.type === 'side_open_cell' ? 'side_open_cell' : 'honeycomb';
            } else {
                interiorType = _zoneInteriorAt(activeSub, _activeZ);
            }
        }
        if (interiorType === 'hanging' || interiorType === 'sorbet') {
            const btn = document.getElementById('tb-btn-hanging');
            if (btn) btn.classList.add('active');
            const subBtn = document.querySelector(`#hanging-sub-panel button[data-hanging-type="${interiorType}"]`);
            if (subBtn) subBtn.classList.add('active');
        } else if (interiorType === 'internal_drawers' || interiorType === 'external_drawers') {
            const btn = document.getElementById('tb-btn-drawer');
            if (btn) btn.classList.add('active');
            const subBtn = document.querySelector(`#drawer-sub-panel button[data-drawer-type="${interiorType}"]`);
            if (subBtn) subBtn.classList.add('active');
        } else if (interiorType === 'honeycomb' || interiorType === 'open_cell' || interiorType === 'side_open_cell') {
            const btn = document.getElementById('tb-btn-honeycomb');
            if (btn) btn.classList.add('active');
            const subBtn = document.querySelector(`#honeycomb-sub-panel button[data-honeycomb-type="${interiorType === 'honeycomb' ? 'open_cell' : interiorType}"]`);
            if (subBtn) subBtn.classList.add('active');
        }

        // Door highlight (merged group or per-zone zonesDoor)
        let doorType = 'empty';
        if (mergedGroup && _subKeysEqual(mergedGroup.keys, selectedKeysArr) && _isDoorZoneType(mergedGroup.type)) {
            doorType = mergedGroup.type;
        } else if (activeSub) {
            const partialGroup = _zoneDoorGroupForKey(firstComp, selectedKeysArr[0]);
            if (partialGroup && _isDoorZoneType(partialGroup.type)) doorType = partialGroup.type;
            else doorType = _zoneDoorAt(activeSub, _activeZ);
        }
        const _subTypeToDoor = { door_right: 'right', door_left: 'left', door_double: 'double', door_flap: 'flap' };
        const _subDoorParam = _subTypeToDoor[doorType];
        if (_subDoorParam) {
            const btnDoor = toolbar.querySelector(`button[onclick="applyDoor('${_subDoorParam}')"]`);
            if (btnDoor) btnDoor.classList.add('active');
        } else {
            const btnNoDoor = toolbar.querySelector(`button[onclick="applyDoor('empty')"]`);
            if (btnNoDoor) btnNoDoor.classList.add('active');
        }
        // Update shelf counter for active sub-cell
        const shelfCountEl = document.getElementById('tb-subcell-shelf-count');
        if (shelfCountEl && activeSub) shelfCountEl.innerText = activeSub.shelves || 0;
        const shelfSection = document.getElementById('tb-subcell-shelf-section');
        if (shelfSection) shelfSection.style.display = 'flex';
        // Show door section + style panel for sub-cell doors
        if (!_isSliding && doorSection) doorSection.style.display = '';
        if (!_isSliding && _subDoorParam) {
            const activeStyle = mergedGroup && _subKeysEqual(mergedGroup.keys, selectedKeysArr) && _isDoorZoneType(mergedGroup.type)
                ? (mergedGroup.style || 'solid')
                : ((Array.isArray(activeSub.zonesDoorStyle) && activeSub.zonesDoorStyle[_activeZ])
                    ? activeSub.zonesDoorStyle[_activeZ] : 'solid');
            Object.entries(_doorStylePanels).forEach(([type, panel]) => {
                if (!panel) return;
                const show = type === _subDoorParam;
                panel.style.display = show ? 'flex' : 'none';
                if (show) {
                    panel.querySelectorAll('button[data-door-style]').forEach(btn => {
                        btn.classList.toggle('active', btn.dataset.doorStyle === activeStyle);
                    });
                }
            });
        } else {
            Object.values(_doorStylePanels).forEach(p => { if (p) p.style.display = 'none'; });
        }
        // Drawer count + handle picker for selected partition zones
        const drawerSection = document.getElementById('drawer-count-section');
        const drawerDisplay = document.getElementById('floating-drawer-count');
        const drawerMinLabel = document.getElementById('floating-drawer-min');
        let isZoneDrawer = interiorType === 'internal_drawers' || interiorType === 'external_drawers';
        let zoneDrawerCount = 2;
        let zoneMinCount = 1;
        if (isZoneDrawer && activeSub) {
            const zoneH = _getSubZoneHeightCm(col, state.selection.rows[0], activeSub, _activeZ);
            zoneMinCount = calcMinDrawerCount(zoneH, interiorType);
            zoneDrawerCount = _zoneDrawerCountAt(activeSub, _activeZ, zoneH, interiorType);
        }
        if (drawerSection && drawerDisplay) {
            if (isZoneDrawer) {
                drawerSection.style.display = 'flex';
                drawerDisplay.innerText = zoneDrawerCount;
                if (drawerMinLabel) drawerMinLabel.innerText = `מינ׳ ${zoneMinCount}`;
            } else {
                drawerSection.style.display = 'none';
            }
        }
        const tbHandlePickerRow = document.getElementById('tb-handle-picker-row');
        const tbHandlePickerDoorRow = document.getElementById('tb-handle-picker-door-row');
        const _handleLabelsSub = { pipe: 'חיצונית', riding: 'רוכבת', touch: 'ללא ידית' };
        const showHandleExt = interiorType === 'external_drawers' && !_isSliding;
        if (tbHandlePickerRow) tbHandlePickerRow.style.display = showHandleExt ? '' : 'none';
        if (tbHandlePickerDoorRow) {
            tbHandlePickerDoorRow.style.display = (_subDoorParam && !_isSliding) ? '' : 'none';
        }
        if (showHandleExt && activeSub) {
            const resolvedCell = activeSub.handleStyle || state.handleStyle || 'pipe';
            const labelEl = document.getElementById('tb-handle-picker-label');
            if (labelEl) labelEl.textContent = 'ידית: ' + (_handleLabelsSub[resolvedCell] || 'חיצונית');
            const tbHandleBtn = document.getElementById('tb-btn-handle-picker');
            if (tbHandleBtn) tbHandleBtn.classList.toggle('active', !!activeSub.handleStyle);
        }
        if (_subDoorParam && !_isSliding) {
            let resolvedDoor = state.handleStyle || 'pipe';
            let hasDoorOverride = false;
            if (mergedGroup && _subKeysEqual(mergedGroup.keys, selectedKeysArr) && _isDoorZoneType(mergedGroup.type) && mergedGroup.handleStyle) {
                resolvedDoor = mergedGroup.handleStyle;
                hasDoorOverride = true;
            } else if (activeSub) {
                const zoneKey = selectedKeysArr[0];
                const hs = _getZoneDoorHandleStyle(firstComp, activeSub, _activeZ, zoneKey);
                if (hs) {
                    resolvedDoor = hs;
                    hasDoorOverride = true;
                }
            }
            const doorLabelEl = document.getElementById('tb-handle-picker-door-label');
            if (doorLabelEl) doorLabelEl.textContent = 'ידית: ' + (_handleLabelsSub[resolvedDoor] || 'חיצונית');
            const tbHandleDoorBtn = document.getElementById('tb-btn-handle-picker-door');
            if (tbHandleDoorBtn) tbHandleDoorBtn.classList.toggle('active', hasDoorOverride);
        }
        return;
    }

    // Not in sub-cell mode — hide sub-cell panel unless partition cell is selected
    if (!hasPartition || state.selection.rows.length !== 1) {
        const shelfSectionHide = document.getElementById('tb-subcell-shelf-section');
        const selectAllRowHide = document.getElementById('tb-subcell-select-row');
        if (shelfSectionHide) shelfSectionHide.style.display = 'none';
        if (selectAllRowHide) selectAllRowHide.style.display = 'none';
    }

    if (_isSliding) {
        if (btnHoneycomb) btnHoneycomb.style.display = 'none';
        if (extDrawerBtn) extDrawerBtn.style.display = 'none';
        if (honeycombSubPanel) honeycombSubPanel.style.display = 'none';
        if (doorSection) doorSection.style.display = 'none';
        Object.values(_doorStylePanels).forEach(p => { if (p) p.style.display = 'none'; });
    } else {
        if (btnHoneycomb) btnHoneycomb.style.display = '';
        if (extDrawerBtn) extDrawerBtn.style.display = '';
        // Do NOT restore honeycomb sub-panel here — its open/closed state is managed
        // exclusively by toggleContentSubPanel() and closeContentSubPanels().
        // Restoring display='' here caused the panel to appear on every toolbar update.
        if (doorSection) doorSection.style.display = '';
    }

    if (firstComp && firstComp.type !== 'empty') {
        const t = firstComp.type;
        // Grouped button highlighting
        if (t === 'hanging' || t === 'sorbet') {
            const btn = document.getElementById('tb-btn-hanging');
            if (btn) btn.classList.add('active');
            // Highlight sub-panel button
            const subBtn = document.querySelector(`#hanging-sub-panel button[data-hanging-type="${t}"]`);
            if (subBtn) subBtn.classList.add('active');
        } else if (t === 'internal_drawers' || t === 'external_drawers') {
            const btn = document.getElementById('tb-btn-drawer');
            if (btn) btn.classList.add('active');
            const subBtn = document.querySelector(`#drawer-sub-panel button[data-drawer-type="${t}"]`);
            if (subBtn) subBtn.classList.add('active');
        } else if (!_isSliding && (t === 'open_cell' || t === 'side_open_cell')) {
            const btn = document.getElementById('tb-btn-honeycomb');
            if (btn) btn.classList.add('active');
            const subBtn = document.querySelector(`#honeycomb-sub-panel button[data-honeycomb-type="${t}"]`);
            if (subBtn) subBtn.classList.add('active');
        } else {
            // Fallback for any direct onclick buttons
            const btnContent = toolbar.querySelector(`button[onclick="applyContent('${t}')"]`);
            if (btnContent) btnContent.classList.add('active');
        }
    }
    // Highlight partition button if partition is active
    if(firstComp && firstComp.partition) {
        const btnPartition = toolbar.querySelector(`button[onclick="applyContent('partition')"]`);
        if(btnPartition) btnPartition.classList.add('active');
    }

    const _appl = (firstComp && !firstComp.partition && Array.isArray(firstComp.appliances)) ? firstComp.appliances : [];
    const _hasTv = !!(firstComp && !firstComp.partition && firstComp.tv);
    const btnAppl = document.getElementById('tb-btn-appliances');
    if (btnAppl && (_appl.length || _hasTv)) btnAppl.classList.add('active');
    document.querySelectorAll('#appliances-sub-panel button[data-appliance-type]').forEach(b => {
        const t = b.dataset.applianceType;
        b.classList.toggle('active', t === 'tv' ? _hasTv : _appl.includes(t));
    });

    const existingDoor = col.doors.find(door => {
        return state.selection.rows.some(r => r >= door.startRow && r <= door.endRow);
    });

    if(existingDoor) {
        const btnDoor = toolbar.querySelector(`button[onclick="applyDoor('${existingDoor.type}')"]`);
        if(btnDoor) btnDoor.classList.add('active');
    } else {
        const btnNoDoor = toolbar.querySelector(`button[onclick="applyDoor('empty')"]`);
        if(btnNoDoor) btnNoDoor.classList.add('active');
    }

    // Door style panels: show the panel matching the active door type
    if (!_isSliding) {
        const showDoor = !!existingDoor;
        const activeDoorType = existingDoor ? existingDoor.type : null;
        const activeStyle = existingDoor ? (existingDoor.style || 'solid') : null;
        Object.entries(_doorStylePanels).forEach(([type, panel]) => {
            if (!panel) return;
            const show = showDoor && type === activeDoorType;
            panel.style.display = show ? 'flex' : 'none';
            if (show && activeStyle) {
                panel.querySelectorAll('button[data-door-style]').forEach(btn => {
                    btn.classList.toggle('active', btn.dataset.doorStyle === activeStyle);
                });
            }
        });
    }

    const drawerSection = document.getElementById('drawer-count-section');
    const drawerDisplay = document.getElementById('floating-drawer-count');
    const drawerMinLabel = document.getElementById('floating-drawer-min');

    let isDrawerSelected = false;
    let currentCount = 2;
    let minCount = 1;

    state.selection.rows.forEach(r => {
        const comp = col.compartments[r];
        if (comp && (comp.type === 'internal_drawers' || comp.type === 'external_drawers')) {
            isDrawerSelected = true;
            currentCount = comp.count;
            minCount = calcMinDrawerCount(_cellHeight(col, r), comp.type);
        }
    });

    if (drawerSection && drawerDisplay) {
        if (isDrawerSelected) {
            drawerSection.style.display = 'flex';
            drawerDisplay.innerText = currentCount;
            if (drawerMinLabel) drawerMinLabel.innerText = `מינ׳ ${minCount}`;
        } else {
            drawerSection.style.display = 'none';
        }
    }

    // ── Handle picker button visibility ──
    const _handleLabels = { pipe: 'חיצונית', riding: 'רוכבת', touch: 'ללא ידית' };
    const tbHandlePickerRow = document.getElementById('tb-handle-picker-row');
    const tbHandlePickerDoorRow = document.getElementById('tb-handle-picker-door-row');

    let _showHandleForCell = false;
    let _cellHandleStyle = null;
    state.selection.rows.forEach(r => {
        const comp = col.compartments[r];
        if (comp && comp.type === 'external_drawers') {
            _showHandleForCell = true;
            _cellHandleStyle = comp.handleStyle || null;
        }
    });
    const _showHandleForDoor = !!(existingDoor && existingDoor.type !== 'empty');

    if (tbHandlePickerRow) tbHandlePickerRow.style.display = (_showHandleForCell && !_isSliding) ? '' : 'none';
    if (tbHandlePickerDoorRow) tbHandlePickerDoorRow.style.display = (_showHandleForDoor && !_isSliding) ? '' : 'none';

    // Update cell handle button label
    if (_showHandleForCell && !_isSliding) {
        const resolvedCell = _cellHandleStyle || state.handleStyle || 'pipe';
        const labelEl = document.getElementById('tb-handle-picker-label');
        if (labelEl) labelEl.textContent = 'ידית: ' + (_handleLabels[resolvedCell] || 'חיצונית');
        const tbHandleBtn = document.getElementById('tb-btn-handle-picker');
        if (tbHandleBtn) tbHandleBtn.classList.toggle('active', !!_cellHandleStyle);
    }
    // Update door handle button label
    if (_showHandleForDoor && !_isSliding && existingDoor) {
        const resolvedDoor = existingDoor.handleStyle || state.handleStyle || 'pipe';
        const doorLabelEl = document.getElementById('tb-handle-picker-door-label');
        if (doorLabelEl) doorLabelEl.textContent = 'ידית: ' + (_handleLabels[resolvedDoor] || 'חיצונית');
        const tbHandleDoorBtn = document.getElementById('tb-btn-handle-picker-door');
        if (tbHandleDoorBtn) tbHandleDoorBtn.classList.toggle('active', !!existingDoor.handleStyle);
    }
}

function _getColumnRowCount(col) {
    if (!col) return 0;
    return col.compartments ? col.compartments.length : (col.shelves + 1);
}

function selectAllColumn(colIndex) {
    _clearSubCellSelection();
    const col = state.columns[colIndex];
    if (!col) return;
    const numRows = _getColumnRowCount(col);
    // If all rows already selected → deselect
    if (state.selection.colIndex === colIndex && state.selection.rows.length === numRows) {
        state.selection = { colIndex: -1, rows: [] };
        buildCabinet();
        return;
    }
    // Allow selection always — height check moved to applyDoor
    state.selection = { colIndex, rows: Array.from({ length: numRows }, (_, i) => i) };
    state.activeEditCol = colIndex;
    buildCabinet();
}

// ── Column Copy / Paste ──────────────────────────────────────────────────────
// Clipboard: stores a deep-copy of the last copied column structure
let _copiedColumn = null;
let _copiedUpperColumn = null; // matching upper-unit wing column (if any)

function _updateCopyPasteGroupVisibility() {
    const copyPasteGroup = document.getElementById('qe-copypaste-group');
    if (!copyPasteGroup) return;
    const selCol = state.selection.colIndex;
    const selColData = selCol !== -1 ? state.columns[selCol] : null;
    const isFullColSelected = state.viewMode === 'front' && selColData &&
        state.selection.rows.length === _getColumnRowCount(selColData);
    copyPasteGroup.style.display = isFullColSelected ? '' : 'none';
    const pasteBtn = document.getElementById('qe-btn-paste');
    if (pasteBtn) pasteBtn.style.display = (_copiedColumn && isFullColSelected) ? '' : 'none';
}

// Helper: check if the entire column is currently selected
function _isFullColumnSelected() {
    if (state.selection.colIndex === -1 || state.selection.rows.length === 0) return false;
    const col = state.columns[state.selection.colIndex];
    if (!col) return false;
    const numRows = _getColumnRowCount(col);
    return state.selection.rows.length === numRows;
}

function _parentWingIdForColumnCopy() {
    if (state._activeUpperUnitParent) return state._activeUpperUnitParent;
    const aw = state.activeWing;
    if (aw === 'full_corner_right') return 'right';
    if (aw === 'full_corner_left') return 'left';
    return aw || 'center';
}

function _upperUnitColumnIndex(colIdx, parentColumns, uuColumns) {
    if (!uuColumns || !uuColumns.length) return null;
    if (uuColumns.length === parentColumns.length) return colIdx;
    if (uuColumns.length === 1) return 0;
    return null;
}

function _serializeColumnForClipboard(col) {
    return {
        shelves:      col.shelves,
        shelvesY:     col.shelvesY,
        compartments: col.compartments,
        doors:        col.doors,
        leds:         col.leds || [],
        type:         col.type,
        splitY:       col.splitY,
        floorOffset:  col.floorOffset || 0,
        noPlinth:     col.noPlinth || false,
        spaceBottomPanel: col.spaceBottomPanel || false,
        topPanel:     col.topPanel || false,
        sinkPanel:    col.sinkPanel || false,
        _height:      col.height,
        deskHeight:    col.deskHeight,
        deskClearance: col.deskClearance,
        hasDrawers:    col.hasDrawers,
        drawerHeight:  col.drawerHeight,
        deskDrawerCount: col.deskDrawerCount,
        deskLeds:      !!col.deskLeds,
        deskHoneycomb: !!col.deskHoneycomb,
    };
}

function _applyColumnClipboard(target, src) {
    const savedWidth  = target.width;
    const savedHeight = target.height;
    const srcCopy = JSON.parse(JSON.stringify(src));

    target.shelves      = srcCopy.shelves;
    target.compartments = srcCopy.compartments;
    if (Array.isArray(target.compartments)) {
        target.compartments.forEach(comp => {
            if (comp && comp.partition && !Array.isArray(comp.partitions)) {
                comp.partitions = [typeof comp.partitionX === 'number' ? comp.partitionX : 0.5];
                delete comp.partitionX;
                if (!Array.isArray(comp.subCells)) {
                    comp.subCells = [{ type: 'empty', shelves: 0 }, { type: 'empty', shelves: 0 }];
                }
            }
        });
    }
    target.doors        = srcCopy.doors;
    target.leds         = srcCopy.leds || [];
    target.type         = srcCopy.type;
    target.floorOffset  = srcCopy.floorOffset;
    target.noPlinth     = srcCopy.noPlinth;
    target.spaceBottomPanel = !!srcCopy.spaceBottomPanel;
    target.topPanel     = srcCopy.topPanel || false;
    target.sinkPanel    = srcCopy.sinkPanel || false;
    if (srcCopy.type === 'desk') {
        target.deskHeight     = srcCopy.deskHeight;
        target.deskClearance  = srcCopy.deskClearance;
        target.hasDrawers     = srcCopy.hasDrawers;
        target.drawerHeight   = srcCopy.drawerHeight;
        target.deskDrawerCount = srcCopy.deskDrawerCount;
        if (srcCopy.deskLeds) target.deskLeds = true; else delete target.deskLeds;
        if (srcCopy.deskHoneycomb) target.deskHoneycomb = true; else delete target.deskHoneycomb;
    } else {
        delete target.deskLeds;
        delete target.deskHoneycomb;
        delete target.deskHeight;
        delete target.deskClearance;
        delete target.hasDrawers;
        delete target.drawerHeight;
        delete target.deskDrawerCount;
    }

    target.width  = savedWidth;
    target.height = savedHeight;

    const srcHeight = srcCopy._height || savedHeight;
    if (srcCopy.shelvesY && srcCopy.shelvesY.length > 0 && srcHeight > 0) {
        const scale = savedHeight / srcHeight;
        target.shelvesY = srcCopy.shelvesY.map(y => Math.round(y * scale * 10) / 10);
    } else {
        target.shelvesY = srcCopy.shelvesY ? srcCopy.shelvesY.slice() : [];
    }

    target.splitY = srcCopy.splitY
        ? Math.round(srcCopy.splitY * (savedHeight / srcHeight) * 10) / 10
        : null;

    for (let r = 0; r < target.compartments.length; r++) {
        const comp = target.compartments[r];
        if (!comp || (comp.type !== 'internal_drawers' && comp.type !== 'external_drawers')) continue;
        const cellH = _cellHeight(target, r);
        const { minH } = _drawerHeightRules(comp.type);
        if (cellH < minH) {
            comp.type = 'empty';
        } else {
            const minCount = calcMinDrawerCount(cellH, comp.type);
            const maxCount = calcMaxDrawerCount(cellH, comp.type);
            comp.count = Math.max(minCount, Math.min(maxCount, comp.count || 1));
        }
    }
}

window.copyColumn = function() {
    if (!_isFullColumnSelected()) return;
    const srcIdx = state.selection.colIndex;
    const col = state.columns[srcIdx];
    if (!col) return;

    _copiedColumn = JSON.parse(JSON.stringify(_serializeColumnForClipboard(col)));
    _copiedUpperColumn = null;

    // When copying from the main wing, also snapshot the floating upper-unit column above
    if (!state._activeUpperUnit) {
        const parentId = _parentWingIdForColumnCopy();
        const uuWing = state.wings['upperUnit_' + parentId];
        if (uuWing && uuWing.columns) {
            const uuIdx = _upperUnitColumnIndex(srcIdx, state.columns, uuWing.columns);
            if (uuIdx !== null && uuWing.columns[uuIdx]) {
                _copiedUpperColumn = JSON.parse(JSON.stringify(
                    _serializeColumnForClipboard(uuWing.columns[uuIdx])
                ));
            }
        }
    }

    const pasteBtn = document.getElementById('qe-btn-paste');
    if (pasteBtn) pasteBtn.style.display = '';
    const hasSplit = !!(col.splitY && col.height > getSplitThreshold());
    const hasUpper = !!_copiedUpperColumn;
    let msg = 'עמודה הועתקה ✓';
    if (hasSplit && hasUpper) msg = 'עמודה מפוצלת + יחידה עליונה הועתקו ✓';
    else if (hasSplit) msg = 'עמודה מפוצלת הועתקה ✓';
    else if (hasUpper) msg = 'עמודה + יחידה עליונה הועתקו ✓';
    _showToast(msg, 1800);
};

window.pasteColumn = function() {
    if (!_copiedColumn) return;
    if (!_isFullColumnSelected()) return;
    const targetIdx = state.selection.colIndex;
    const target = state.columns[targetIdx];
    if (!target) return;

    _applyColumnClipboard(target, _copiedColumn);

    if (_copiedUpperColumn && !state._activeUpperUnit) {
        const parentId = _parentWingIdForColumnCopy();
        const uuWing = state.wings['upperUnit_' + parentId];
        if (uuWing && uuWing.columns) {
            const uuIdx = _upperUnitColumnIndex(targetIdx, state.columns, uuWing.columns);
            const uuTarget = uuIdx !== null ? uuWing.columns[uuIdx] : null;
            if (uuTarget) _applyColumnClipboard(uuTarget, _copiedUpperColumn);
        }
    }

    checkSplits();
    buildCabinet(); calculatePrice(); saveHistoryState();
    const hasSplit = !!(_copiedColumn.splitY);
    const hasUpper = !!_copiedUpperColumn;
    let msg = 'עמודה הודבקה ✓';
    if (hasSplit && hasUpper) msg = 'עמודה מפוצלת + יחידה עליונה הודבקו ✓';
    else if (hasSplit) msg = 'עמודה מפוצלת הודבקה ✓';
    else if (hasUpper) msg = 'עמודה + יחידה עליונה הודבקו ✓';
    _showToast(msg, 1800);
};

// Keyboard shortcut: Ctrl+C / Ctrl+V when full column is selected
document.addEventListener('keydown', function(e) {
    // Ignore when typing in an input/textarea
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;
    if (!_isFullColumnSelected()) return;
    if (e.ctrlKey && e.key === 'c') {
        e.preventDefault();
        window.copyColumn();
    } else if (e.ctrlKey && e.key === 'v') {
        e.preventDefault();
        window.pasteColumn();
    }
});

// ==========================================
// Column templates (magic wand)
// ==========================================
const _COL_TPL_DESIGN_HEIGHT = 240;

// ── Shared template store (Supabase `design_templates`, visible to all users) ──
const _TPL_LEGACY_KEYS = { column: 'anycloset_column_templates_v1', cabinet: 'anycloset_cabinet_templates_v1' };
const _tplCache = { column: null, cabinet: null };
const _tplLoading = { column: null, cabinet: null };
let _tplUserId = null;

function _tplLegacyList(kind) {
    try {
        const raw = localStorage.getItem(_TPL_LEGACY_KEYS[kind]);
        const list = raw ? JSON.parse(raw) : [];
        return Array.isArray(list) ? list : [];
    } catch (e) {
        return [];
    }
}

function _tplToRow(kind, tpl) {
    const data = Object.assign({}, tpl);
    delete data.id; delete data.name; delete data.thumbnail; delete data.createdAt; delete data.createdBy;
    const row = { id: tpl.id, kind: kind, name: tpl.name || '', data: data, thumbnail: tpl.thumbnail || null };
    if (tpl.createdAt) row.created_at = new Date(tpl.createdAt).toISOString();
    return row;
}

function _tplFromRow(row) {
    return Object.assign({}, row.data || {}, {
        id: row.id,
        name: row.name,
        thumbnail: row.thumbnail || null,
        createdAt: Date.parse(row.created_at) || 0,
        createdBy: row.created_by || null
    });
}

async function _tplClient() {
    const sb = window._supabase;
    if (!sb) return null;
    if (!_tplUserId) {
        try {
            const { data } = await sb.auth.getUser();
            _tplUserId = data && data.user ? data.user.id : null;
        } catch (e) {}
    }
    return _tplUserId ? sb : null;
}

async function _tplMigrateLegacy(sb, kind) {
    const legacy = _tplLegacyList(kind);
    if (!legacy.length) return;
    const rows = legacy.filter(function(t) { return t && t.id; }).map(function(t) { return _tplToRow(kind, t); });
    const { error } = await sb.from('design_templates').upsert(rows, { onConflict: 'id', ignoreDuplicates: true });
    if (error) { console.warn('[templates] legacy upload failed', error.message); return; }
    try { localStorage.removeItem(_TPL_LEGACY_KEYS[kind]); } catch (e) {}
}

window._refreshTemplates = function(kind) {
    if (_tplLoading[kind]) return _tplLoading[kind];
    _tplLoading[kind] = (async function() {
        try {
            const sb = await _tplClient();
            if (!sb) return _tplCache[kind] || [];
            await _tplMigrateLegacy(sb, kind);
            const { data, error } = await sb.from('design_templates')
                .select('id, name, data, thumbnail, created_by, created_at')
                .eq('kind', kind)
                .order('created_at', { ascending: true });
            if (error) throw error;
            _tplCache[kind] = (data || []).map(_tplFromRow);
        } catch (e) {
            console.warn('[templates] load failed', e && e.message);
        } finally {
            _tplLoading[kind] = null;
        }
        return _tplCache[kind] || [];
    })();
    return _tplLoading[kind];
};

window._listTemplates = function(kind) {
    return _tplCache[kind] || _tplLegacyList(kind);
};

window._canDeleteTemplate = function(tpl) {
    return !!tpl && (!tpl.createdBy || tpl.createdBy === _tplUserId);
};

window._addTemplate = async function(kind, tpl) {
    const sb = await _tplClient();
    if (!sb) {
        if (typeof _showToast === 'function') _showToast('⚠️ יש להתחבר כדי לשמור תבנית', 3500);
        return false;
    }
    const { data, error } = await sb.from('design_templates')
        .insert(_tplToRow(kind, tpl))
        .select('id, name, data, thumbnail, created_by, created_at')
        .single();
    if (error) {
        console.warn('[templates] save failed', error.message);
        if (typeof _showToast === 'function') _showToast('⚠️ שמירת התבנית נכשלה', 3500);
        return false;
    }
    _tplCache[kind] = (_tplCache[kind] || []).concat([_tplFromRow(data)]);
    return true;
};

window._deleteTemplate = async function(kind, id) {
    const sb = await _tplClient();
    if (!sb) return false;
    const { data, error } = await sb.from('design_templates').delete().eq('id', id).select('id');
    if (error || !data || !data.length) {
        if (typeof _showToast === 'function') _showToast('⚠️ אפשר למחוק רק תבנית שיצרת', 3500);
        return false;
    }
    _tplCache[kind] = (_tplCache[kind] || []).filter(function(t) { return t.id !== id; });
    return true;
};

window._loadColumnTemplates = function() { return window._listTemplates('column'); };

function _colTplIsLockedComp(comp) {
    if (!comp) return false;
    const t = comp.type;
    if (t === 'internal_drawers' || t === 'external_drawers' || t === 'hanging' ||
        t === 'sorbet' || t === 'cross_hanging') return true;
    if (t === 'partition' && Array.isArray(comp.subCells)) {
        return comp.subCells.some(function(sub) {
            if (!sub) return false;
            if (_colTplIsLockedComp(sub)) return true;
            const zones = sub.zones || [];
            return zones.some(function(z) {
                return z && (z.type === 'hanging' || z.type === 'sorbet' || z.type === 'internal_drawers' ||
                    z.type === 'external_drawers' || z.type === 'cross_hanging');
            });
        });
    }
    return false;
}

function _colTplStartY(col) {
    const fo = col.floorOffset || 0;
    const t = state.thickness;
    if (fo > 0) return fo + t;
    if (col.type === 'desk') return (col.deskHeight || 0) + (col.deskClearance || 0) + t;
    if (col.noPlinth) return t;
    return state.plinthHeight + t;
}

function _colTplBuildShelvesY(col, cells) {
    const t = state.thickness;
    const startY = _colTplStartY(col);
    const n = cells.length;
    const shelvesY = [];
    if (n <= 1) return shelvesY;
    let bottom = startY;
    for (let i = 0; i < n - 1; i++) {
        const h = Math.max(1, cells[i].h || 1);
        const top = bottom + h;
        shelvesY.push(Math.round((top + t / 2) * 10) / 10);
        bottom = shelvesY[i] + t / 2;
    }
    return shelvesY;
}

function _colTplMeasureCells(srcCol) {
    const col = JSON.parse(JSON.stringify(srcCol));
    const comps = col.compartments || [];
    const cells = [];
    for (let r = 0; r < comps.length; r++) {
        cells.push({
            h: Math.max(1, _cellHeight(col, r)),
            locked: _colTplIsLockedComp(comps[r]),
            comp: JSON.parse(JSON.stringify(comps[r] || { type: 'empty' }))
        });
    }
    if (!cells.length) cells.push({ h: 50, locked: false, comp: { type: 'empty' } });
    return cells;
}

function _colTplCompHasSorbet(comp) {
    if (!comp) return false;
    if (comp.type === 'sorbet') return true;
    if (comp.type === 'partition' && Array.isArray(comp.subCells)) {
        return comp.subCells.some(function(sub) {
            if (!sub) return false;
            if (sub.type === 'sorbet') return true;
            const zones = sub.zones || [];
            return zones.some(function(z) { return z && z.type === 'sorbet'; });
        });
    }
    const zones = comp.zones || [];
    return zones.some(function(z) { return z && z.type === 'sorbet'; });
}

/** Apply template to target column with >240 extra-shelf / empty-cell rules.
 *  Default: add empty cell at top. If top cell is sorbet — add empty cell at bottom so sorbet stays upper. */
window._applyColumnTemplateToCol = function(target, tplData) {
    if (!target || !tplData || !tplData.column) return;
    const src = JSON.parse(JSON.stringify(tplData.column));
    const Hs = Math.round(Number(src._height || tplData.sourceHeight || _COL_TPL_DESIGN_HEIGHT) || _COL_TPL_DESIGN_HEIGHT);
    const Ht = target.height;
    const savedWidth = target.width;
    const savedFo = target.floorOffset || 0;
    const savedNoPlinth = !!target.noPlinth;
    const savedSpaceBottom = !!target.spaceBottomPanel;

    // Base structural copy (doors, type flags) without height scaling
    target.doors = src.doors ? JSON.parse(JSON.stringify(src.doors)) : [];
    target.leds = Array.isArray(src.leds) ? JSON.parse(JSON.stringify(src.leds)) : [];
    target.type = src.type || 'normal';
    target.topPanel = !!src.topPanel;
    target.sinkPanel = !!src.sinkPanel;
    target.splitY = null; // templates are single-span for now
    if (src.type === 'desk') {
        target.deskHeight = src.deskHeight;
        target.deskClearance = src.deskClearance;
        target.hasDrawers = src.hasDrawers;
        target.drawerHeight = src.drawerHeight;
        target.deskDrawerCount = src.deskDrawerCount;
        if (src.deskLeds) target.deskLeds = true; else delete target.deskLeds;
        if (src.deskHoneycomb) target.deskHoneycomb = true; else delete target.deskHoneycomb;
    } else {
        delete target.deskLeds;
        delete target.deskHoneycomb;
        delete target.deskHeight;
        delete target.deskClearance;
        delete target.hasDrawers;
        delete target.drawerHeight;
        delete target.deskDrawerCount;
    }
    // Keep target floor/plinth behaviour
    target.floorOffset = savedFo;
    target.noPlinth = savedNoPlinth;
    target.spaceBottomPanel = savedSpaceBottom;
    target.width = savedWidth;
    target.height = Ht;

    // Measure cells from template at its design height
    const measureCol = JSON.parse(JSON.stringify(src));
    measureCol.height = Hs;
    measureCol.width = savedWidth;
    measureCol.floorOffset = savedFo;
    measureCol.noPlinth = savedNoPlinth;
    let cells = _colTplMeasureCells(measureCol);

    const addExtraShelf = Ht > Hs;
    // cells[0] = bottom, cells[n-1] = top
    const topHasSorbet = cells.length > 0 && _colTplCompHasSorbet(cells[cells.length - 1].comp);
    if (addExtraShelf) {
        const extra = { h: 0, locked: false, comp: { type: 'empty' } };
        if (topHasSorbet) {
            cells.unshift(extra); // grow from bottom — keep sorbet at top
            target.leds.forEach(function(g) { g.startRow++; g.endRow++; });
        } else {
            cells.push(extra); // default: grow from top
        }
    }

    const t = state.thickness;
    const startY = _colTplStartY(target);
    const spanTop = Ht - t;
    const spanH = Math.max(0, spanTop - startY);
    const n = cells.length;
    const nShelves = Math.max(0, n - 1);
    const lockedSum = cells.reduce(function(s, c) { return s + (c.locked ? c.h : 0); }, 0);
    const emptyCount = cells.filter(function(c) { return !c.locked; }).length || 1;
    // spanH = sum(cellH) + nShelves * t  (approx from _compartmentBounds geometry)
    let emptyBudget = spanH - (nShelves * t) - lockedSum;
    if (emptyBudget < emptyCount * 12) emptyBudget = emptyCount * 12;
    const emptyEach = Math.round((emptyBudget / emptyCount) * 10) / 10;

    cells.forEach(function(c) {
        if (!c.locked) c.h = emptyEach;
    });

    // If exact design height and no extra shelf — prefer original shelvesY
    if (!addExtraShelf && Math.abs(Ht - Hs) < 0.5 && Array.isArray(src.shelvesY)) {
        target.compartments = cells.map(function(c) { return c.comp; });
        target.shelvesY = src.shelvesY.slice();
        target.shelves = target.shelvesY.length;
    } else {
        target.compartments = cells.map(function(c) { return c.comp; });
        target.shelvesY = _colTplBuildShelvesY(target, cells);
        target.shelves = target.shelvesY.length;
    }

    // Normalize partition shape (same as paste)
    if (Array.isArray(target.compartments)) {
        target.compartments.forEach(function(comp) {
            if (comp && comp.partition && !Array.isArray(comp.partitions)) {
                comp.partitions = [typeof comp.partitionX === 'number' ? comp.partitionX : 0.5];
                delete comp.partitionX;
                if (!Array.isArray(comp.subCells)) {
                    comp.subCells = [{ type: 'empty', shelves: 0 }, { type: 'empty', shelves: 0 }];
                }
            }
        });
    }

    // Clamp drawer counts to new cell heights
    for (let r = 0; r < target.compartments.length; r++) {
        const comp = target.compartments[r];
        if (!comp || (comp.type !== 'internal_drawers' && comp.type !== 'external_drawers')) continue;
        const cellH = _cellHeight(target, r);
        const rules = (typeof _drawerHeightRules === 'function') ? _drawerHeightRules(comp.type) : { minH: 20 };
        if (cellH < (rules.minH || 20)) {
            comp.type = 'empty';
        } else if (typeof calcMinDrawerCount === 'function' && typeof calcMaxDrawerCount === 'function') {
            const minCount = calcMinDrawerCount(cellH, comp.type);
            const maxCount = calcMaxDrawerCount(cellH, comp.type);
            comp.count = Math.max(minCount, Math.min(maxCount, comp.count || 1));
        }
    }
};

window._captureColumnThumbnail = function(colIndex) {
    const ren = (typeof renderer !== 'undefined') ? renderer : null;
    const cam = (typeof camera !== 'undefined') ? camera : null;
    const scn = (typeof scene !== 'undefined') ? scene : null;
    const ctrl = (typeof controls !== 'undefined') ? controls : (window.controls || null);
    const col = state.columns && state.columns[colIndex];
    if (!ren || !cam || !scn || !col) return null;

    const _hlSaved = [];
    let savedCamPos = null;
    let savedTarget = null;
    let savedFov = null;

    function _hideCaptureHighlights() {
        const lists = [];
        if (typeof hitBoxes !== 'undefined' && hitBoxes) lists.push(hitBoxes);
        if (window.hitBoxes && window.hitBoxes !== hitBoxes) lists.push(window.hitBoxes);
        lists.forEach(function(arr) {
            arr.forEach(function(hb) {
                if (!hb || !hb.material) return;
                _hlSaved.push({
                    mesh: hb,
                    opacity: hb.material.opacity,
                    visible: hb.visible !== false
                });
                hb.material.opacity = 0;
                hb.visible = false;
            });
        });
    }
    function _restoreCaptureHighlights() {
        _hlSaved.forEach(function(s) {
            if (!s.mesh) return;
            if (s.mesh.material) s.mesh.material.opacity = s.opacity;
            s.mesh.visible = s.visible;
        });
    }

    try {
        _hideCaptureHighlights();

        let centerX = 0;
        const sel = (typeof dragHandlesData !== 'undefined' && dragHandlesData && dragHandlesData.selectAll)
            ? dragHandlesData.selectAll.find(function(s) { return s.colIndex === colIndex; })
            : null;
        if (sel) centerX = sel.x - 5;
        else {
            const t = state.thickness;
            let x = -state.width / 2 + t;
            for (let i = 0; i < colIndex; i++) {
                x += (state.columns[i].width || 0) + t;
            }
            centerX = x + col.width / 2;
        }

        const halfW = (col.width || 40) / 2 + 6;
        const fo = col.floorOffset || 0;
        const y0 = Math.min(0, fo) - 4;
        const y1 = (col.height || 240) + 8;
        const zFront = (state.depth || 54) / 2 + 2;
        const zBack = -(state.depth || 54) / 2 - 2;

        const corners = [
            new THREE.Vector3(centerX - halfW, y0, zFront),
            new THREE.Vector3(centerX + halfW, y0, zFront),
            new THREE.Vector3(centerX - halfW, y1, zFront),
            new THREE.Vector3(centerX + halfW, y1, zFront),
            new THREE.Vector3(centerX - halfW, y0, zBack),
            new THREE.Vector3(centerX + halfW, y0, zBack),
            new THREE.Vector3(centerX - halfW, y1, zBack),
            new THREE.Vector3(centerX + halfW, y1, zBack)
        ];
        const group = window._activeWingGroup || window.cabinetGroup;
        if (group) {
            group.updateMatrixWorld(true);
            corners.forEach(function(p) { p.applyMatrix4(group.matrixWorld); });
        }

        savedCamPos = cam.position.clone();
        savedTarget = ctrl && ctrl.target ? ctrl.target.clone() : null;
        savedFov = cam.fov;
        const box = new THREE.Box3().setFromPoints(corners);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const fitH = Math.max(size.y, 40) * 1.18;
        const fitW = Math.max(size.x, 20) * 1.35;
        cam.fov = 40;
        cam.updateProjectionMatrix();
        const distY = (fitH / 2) / Math.tan(Math.PI * cam.fov / 360);
        const distX = (fitW / 2) / Math.tan(Math.PI * cam.fov / 360) / Math.max(cam.aspect, 0.1);
        const dist = Math.max(distY, distX, 80);
        let camOffset = new THREE.Vector3(0, 0, dist);
        if (group) {
            const front = new THREE.Vector3(0, 0, 1).transformDirection(group.matrixWorld).normalize();
            camOffset = front.multiplyScalar(dist);
        }
        cam.position.copy(center).add(camOffset);
        cam.position.y = center.y;
        if (ctrl) {
            ctrl.target.copy(center);
            ctrl.update();
        } else {
            cam.lookAt(center);
        }

        ren.render(scn, cam);
        ren.render(scn, cam);
        const canvas = ren.domElement;
        const cw = canvas.width;
        const ch = canvas.height;
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        corners.forEach(function(p) {
            const ndc = p.clone().project(cam);
            const sx = (ndc.x * 0.5 + 0.5) * cw;
            const sy = (-ndc.y * 0.5 + 0.5) * ch;
            minX = Math.min(minX, sx);
            maxX = Math.max(maxX, sx);
            minY = Math.min(minY, sy);
            maxY = Math.max(maxY, sy);
        });
        const padX = Math.max(12, (maxX - minX) * 0.08);
        const padY = Math.max(16, (maxY - minY) * 0.06);
        minX = Math.max(0, Math.floor(minX - padX));
        maxX = Math.min(cw, Math.ceil(maxX + padX));
        minY = Math.max(0, Math.floor(minY - padY));
        maxY = Math.min(ch, Math.ceil(maxY + padY));
        const w = Math.max(8, maxX - minX);
        const h = Math.max(8, maxY - minY);

        const out = document.createElement('canvas');
        const tw = 140;
        const th = 260;
        out.width = tw;
        out.height = th;
        const ctx = out.getContext('2d');
        ctx.fillStyle = '#f1f5f9';
        ctx.fillRect(0, 0, tw, th);
        const scale = Math.min(tw / w, th / h) * 0.92;
        const dw = w * scale;
        const dh = h * scale;
        const dx = (tw - dw) / 2;
        const dy = (th - dh) / 2;
        ctx.drawImage(canvas, minX, minY, w, h, dx, dy, dw, dh);
        return out.toDataURL('image/jpeg', 0.78);
    } catch (e) {
        console.warn('[col-templates] thumbnail failed', e);
        return null;
    } finally {
        try {
            if (savedFov != null) {
                cam.fov = savedFov;
                cam.updateProjectionMatrix();
            }
            if (savedCamPos) cam.position.copy(savedCamPos);
            if (ctrl && savedTarget) {
                ctrl.target.copy(savedTarget);
                ctrl.update();
            }
            _restoreCaptureHighlights();
            ren.render(scn, cam);
        } catch (_e) { /* ignore restore errors */ }
    }
};

window.openColumnTemplatesSheet = function(colIndex) {
    if (window._VIEWER_MODE) return;
    const col = state.columns && state.columns[colIndex];
    if (!col) return;
    window._colTplTargetIndex = colIndex;

    const overlay = document.getElementById('col-templates-overlay');
    if (!overlay) return;
    overlay.style.display = 'flex';
    requestAnimationFrame(function() {
        const sheet = document.getElementById('col-templates-sheet');
        if (sheet) sheet.style.transform = 'translateY(0)';
    });
    window._renderColumnTemplatesSheet();
};

window.closeColumnTemplatesSheet = function() {
    const overlay = document.getElementById('col-templates-overlay');
    const sheet = document.getElementById('col-templates-sheet');
    if (sheet) sheet.style.transform = 'translateY(110%)';
    setTimeout(function() {
        if (overlay) overlay.style.display = 'none';
    }, 220);
};

window._renderColumnTemplatesSheet = function(skipRefresh) {
    const grid = document.getElementById('col-templates-grid');
    const emptyEl = document.getElementById('col-templates-empty');
    if (!grid) return;
    if (!skipRefresh) {
        window._refreshTemplates('column').then(function() { window._renderColumnTemplatesSheet(true); });
    }
    const list = window._loadColumnTemplates();
    grid.innerHTML = '';

    if (!list.length) {
        if (emptyEl) emptyEl.style.display = '';
    } else if (emptyEl) {
        emptyEl.style.display = 'none';
    }

    list.forEach(function(tpl, idx) {
        const card = document.createElement('div');
        card.className = 'col-tpl-card';
        card.title = 'החל על העמודה';
        const name = String(tpl.name || ('תבנית ' + (idx + 1))).trim() || ('תבנית ' + (idx + 1));
        const safeName = name
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
        const thumb = tpl.thumbnail
            ? '<div class="col-tpl-thumb-wrap"><img class="col-tpl-thumb" src="' + tpl.thumbnail + '" alt=""></div>'
            : '<div class="col-tpl-thumb-wrap"><div class="col-tpl-thumb col-tpl-thumb--empty"><i class="fa-solid fa-table-columns"></i></div></div>';
        card.innerHTML =
            thumb +
            '<div class="col-tpl-card-meta">' +
                '<div class="col-tpl-card-name">' + safeName + '</div>' +
            '</div>' +
            (window._canDeleteTemplate(tpl) ? '<button type="button" class="col-tpl-del" title="מחק תבנית"><i class="fa-solid fa-trash"></i></button>' : '');
        card.addEventListener('click', function(e) {
            if (e.target.closest('.col-tpl-del')) return;
            window.applyColumnTemplate(tpl.id);
        });
        const delBtn = card.querySelector('.col-tpl-del');
        if (delBtn) {
            delBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                window.deleteColumnTemplate(tpl.id);
            });
        }
        grid.appendChild(card);
    });
};

window.addCurrentColumnAsTemplate = async function() {
    const idx = (typeof window._colTplTargetIndex === 'number')
        ? window._colTplTargetIndex
        : state.selection.colIndex;
    const col = state.columns && state.columns[idx];
    if (!col) {
        if (typeof _showToast === 'function') _showToast('לא נבחרה עמודה', 2500);
        return;
    }

    const list = window._loadColumnTemplates();
    const defaultName = 'תבנית ' + (list.length + 1);
    const typed = window.prompt('שם סוג העמודה לתבנית:', defaultName);
    if (typed === null) return; // cancelled
    const name = String(typed).trim() || defaultName;

    const serialized = _serializeColumnForClipboard(col);
    serialized._height = col.height;
    const thumb = window._captureColumnThumbnail(idx);
    const tpl = {
        id: 'ct_' + Date.now().toString(36) + Math.floor(Math.random() * 1000).toString(36),
        name: name,
        createdAt: Date.now(),
        sourceHeight: Math.round(col.height),
        thumbnail: thumb,
        column: serialized
    };
    if (!(await window._addTemplate('column', tpl))) return;
    window._renderColumnTemplatesSheet(true);
    if (typeof _showToast === 'function') _showToast('התבנית "' + name + '" נשמרה ✓', 2800);
};

window.deleteColumnTemplate = async function(id) {
    if (!(await window._deleteTemplate('column', id))) return;
    window._renderColumnTemplatesSheet(true);
    if (typeof _showToast === 'function') _showToast('התבנית נמחקה', 2000);
};

window.applyColumnTemplate = function(id) {
    const list = window._loadColumnTemplates();
    const tpl = list.find(function(t) { return t.id === id; });
    const idx = (typeof window._colTplTargetIndex === 'number')
        ? window._colTplTargetIndex
        : state.selection.colIndex;
    const target = state.columns && state.columns[idx];
    if (!tpl || !target) return;

    window._applyColumnTemplateToCol(target, tpl);
    if (typeof checkSplits === 'function') checkSplits();
    if (typeof buildCabinet === 'function') buildCabinet();
    if (typeof calculatePrice === 'function') calculatePrice();
    if (typeof saveHistoryState === 'function') saveHistoryState();
    window.closeColumnTemplatesSheet();
    if (typeof _showToast === 'function') _showToast('התבנית הוחלה על העמודה ✓', 2500);
};

// ── Cabinet templates (full wardrobe) ───────────────────────────────────────
window._loadCabinetTemplates = function() { return window._listTemplates('cabinet'); };

/** Serialize current editor cabinet (rawState shape) — no space-pair / no heavy blueprints. */
window._serializeCabinetForTemplate = function() {
    return JSON.parse(JSON.stringify({
        cabinetModel: state.cabinetModel,
        placement: state.placement,
        width: state.width,
        globalHeight: state.globalHeight,
        depth: state.depth,
        thickness: state.thickness,
        plinthHeight: state.plinthHeight,
        hasDoors: state.hasDoors,
        handleType: state.handleType,
        handleStyle: state.handleStyle, handleVariant: state.handleVariant, ridingColor: state.ridingColor,
        cabinetName: '',
        cabinetModelLabel: (state.wings && state.wings.center && state.wings.center.cabinetModelLabel) || state.cabinetModelLabel || '',
        cabinetNotes: '',
        manualPrice: state.manualPrice,
        manualInstallPrice: (typeof getWing === 'function' && getWing() && getWing().manualInstallPrice != null)
            ? getWing().manualInstallPrice : null,
        boardMaterial: state.boardMaterial,
        materialBody: state.materialBody,
        materialInternal: state.materialInternal,
        materialExternal: state.materialExternal,
        materialDesk: state.materialDesk,
        materialOpenCell: state.materialOpenCell,
        materialBack: state.materialBack,
        columns: state.columns,
        desk: state.desk,
        wings: state.wings,
        activeWing: state.activeWing,
        presetId: state.presetId || 'linear',
        roomWall: window._roomWall || state.roomWall || 'center',
        closureEnabled: (window._closureEnabled !== undefined) ? window._closureEnabled : true,
        closureWidth: window._closureWidth || 1.8,
        closureWidthRight: window._closureWidthRight || 1.8,
        closureCeilWidth: window._closureCeilWidth || 1.8,
        closureDepthWidth: window._closureDepthWidth || 1.8,
        closureFrontLine: window._closureFrontLine || 'cabinet',
        blueprintCutouts: state.blueprintCutouts || [],
        blueprintCellDimOffsets: state.blueprintCellDimOffsets || {},
        blueprintDimOffsets: state.blueprintDimOffsets || {},
        blueprintInternalDimsDefault: state.blueprintInternalDimsDefault !== false,
        blueprintCellDimShown: state.blueprintCellDimShown || {},
        blueprintColWidthDimsDefault: state.blueprintColWidthDimsDefault !== false,
        blueprintColWidthDimShown: state.blueprintColWidthDimShown || {},
        blueprintHeightDimsDefault: state.blueprintHeightDimsDefault !== false,
        partColors: (typeof window._exportLocalPartColors === 'function')
            ? window._exportLocalPartColors()
            : JSON.parse(JSON.stringify(state.partColors || {}))
    }));
};

window._captureCabinetTemplateThumbnail = function() {
    const cam = window.camera;
    const ctrl = window.controls;
    const ren = window.renderer;
    const scn = window.scene;
    if (!cam || !ctrl || !ren || !scn || typeof _captureFrameAtView !== 'function') return null;

    const savedCamPos = cam.position.clone();
    const savedTarget = ctrl.target.clone();
    const savedCamAnim = window._camAnim;
    const savedCamFov = cam.fov;
    const originalViewMode = state.viewMode;
    const originalDoorsVisible = window._doorsVisible;
    window._doorsVisible = true;

    const snapCenterWing = state.wings && state.wings.center;
    const snapCols = snapCenterWing && snapCenterWing.columns && snapCenterWing.columns.length > 0
        ? snapCenterWing.columns : null;
    const snapW = snapCenterWing ? snapCenterWing.width : state.width;
    const snapH = snapCols ? Math.max.apply(null, snapCols.map(function(c) { return c.height || 0; })) : state.globalHeight;
    let focusX = 0;
    let focusY = snapH / 2;
    try {
        const pairInfoFocus = (typeof window._getSpacePairInfo === 'function') ? window._getSpacePairInfo() : null;
        if (pairInfoFocus && pairInfoFocus.count >= 2 && typeof window._spaceOffsetForSlot === 'function') {
            const off = window._spaceOffsetForSlot(pairInfoFocus.activeSlot) || { x: 0, y: 0 };
            focusX = off.x || 0;
            focusY = (snapH / 2) + (off.y || 0);
        }
    } catch (e) { /* keep origin */ }

    const view = {
        camPos: [focusX, focusY, 1],
        camTarget: [focusX, focusY, 0],
        fitH: snapH + 120,
        fitW: snapW + 150
    };

    // Hide selection highlights during capture
    const _hlSaved = [];
    try {
        const lists = [];
        if (typeof hitBoxes !== 'undefined' && hitBoxes) lists.push(hitBoxes);
        if (window.hitBoxes && window.hitBoxes !== hitBoxes) lists.push(window.hitBoxes);
        lists.forEach(function(arr) {
            arr.forEach(function(hb) {
                if (!hb || !hb.material) return;
                _hlSaved.push({ mesh: hb, opacity: hb.material.opacity, visible: hb.visible !== false });
                hb.material.opacity = 0;
                hb.visible = false;
            });
        });
    } catch (e) { /* ignore */ }

    let thumb = null;
    try {
        window._spaceCaptureCompanionOpacity = 0.08;
        thumb = _captureFrameAtView(cam, ctrl, ren, scn, view, true);
    } catch (e) {
        console.warn('[cab-templates] thumb capture failed', e);
    } finally {
        window._spaceCaptureCompanionOpacity = null;
        _hlSaved.forEach(function(s) {
            if (!s.mesh) return;
            if (s.mesh.material) s.mesh.material.opacity = s.opacity;
            s.mesh.visible = s.visible;
        });
        cam.fov = savedCamFov;
        cam.updateProjectionMatrix();
        cam.position.copy(savedCamPos);
        ctrl.target.copy(savedTarget);
        ctrl.update();
        window._camAnim = savedCamAnim;
        state.viewMode = originalViewMode;
        window._doorsVisible = originalDoorsVisible;
        if (typeof updateCameraView === 'function') updateCameraView();
        if (typeof buildCabinet === 'function') buildCabinet();
        ren.render(scn, cam);
    }
    return thumb;
};

/** Apply template rawState into the current editor without changing cart index / space pair. */
window._applyCabinetTemplateRawState = function(rawState) {
    if (!rawState) return false;
    const rs = JSON.parse(JSON.stringify(rawState));
    const savedName = state.cabinetName;
    const savedNotes = state.cabinetNotes;
    const savedEditIdx = state.editingCartIndex;

    if (rs.wings) {
        if (typeof window._restoreWingsFromSaved === 'function') {
            window._restoreWingsFromSaved(rs.wings);
        } else {
            state.wings.center = rs.wings.center || state.wings.center;
            state.wings.left = rs.wings.left || null;
            state.wings.right = rs.wings.right || null;
        }
        state.activeWing = rs.activeWing || 'center';
        state.presetId = rs.presetId || 'linear';
    } else {
        state.presetId = rs.presetId || 'linear';
        state.activeWing = 'center';
        state.wings.left = null;
        state.wings.right = null;
        const flatFields = ['cabinetModel','placement','width','globalHeight','depth','thickness',
            'plinthHeight','hasDoors','handleType','handleStyle','cabinetModelLabel','manualPrice','boardMaterial',
            'materialBody','materialInternal','materialExternal','materialDesk','materialOpenCell',
            'materialBack','columns','desk'];
        flatFields.forEach(function(f) { if (rs[f] !== undefined) state[f] = rs[f]; });
    }

    // Keep the cabinet name / notes / cart slot of the project item being edited
    state.cabinetName = savedName;
    if (state.wings && state.wings.center) state.wings.center.cabinetName = savedName;
    state.cabinetNotes = savedNotes;
    state.editingCartIndex = savedEditIdx;

    state.wingEditMode = false;
    state.wingEditSnapshot = null;

    const loadedPreset = state.presetId || 'linear';
    const isLinearPreset = (loadedPreset === 'linear' || loadedPreset === 'sliding');
    if (isLinearPreset) {
        state.viewMode = 'front';
        window._orbitFree = false;
    } else {
        state.viewMode = '3d';
        window._orbitFree = false;
    }
    document.querySelectorAll('.view-btn').forEach(function(b) { b.classList.remove('active'); });
    const activeViewBtn = document.getElementById('btn-front-view');
    if (activeViewBtn) activeViewBtn.classList.add('active');

    window._roomWall = rs.roomWall || 'center';
    state.roomWall = window._roomWall;
    window._closureEnabled = true;
    window._closureWidth = rs.closureWidth || 1.8;
    window._closureWidthRight = rs.closureWidthRight || 1.8;
    window._closureCeilWidth = rs.closureCeilWidth || 1.8;
    window._closureDepthWidth = rs.closureDepthWidth || 1.8;
    window._closureFrontLine = rs.closureFrontLine || 'cabinet';
    if (typeof window._updateRoomWallUI === 'function') window._updateRoomWallUI();

    state.blueprintCutouts = rs.blueprintCutouts ? JSON.parse(JSON.stringify(rs.blueprintCutouts)) : [];
    state.blueprintCellDimOffsets = rs.blueprintCellDimOffsets ? JSON.parse(JSON.stringify(rs.blueprintCellDimOffsets)) : {};
    state.blueprintDimOffsets = rs.blueprintDimOffsets ? JSON.parse(JSON.stringify(rs.blueprintDimOffsets)) : {};
    state.blueprintInternalDimsDefault = rs.blueprintInternalDimsDefault !== false;
    state.blueprintCellDimShown = rs.blueprintCellDimShown ? JSON.parse(JSON.stringify(rs.blueprintCellDimShown)) : {};
    state.blueprintColWidthDimsDefault = rs.blueprintColWidthDimsDefault !== false;
    state.blueprintColWidthDimShown = rs.blueprintColWidthDimShown ? JSON.parse(JSON.stringify(rs.blueprintColWidthDimShown)) : {};
    state.blueprintHeightDimsDefault = rs.blueprintHeightDimsDefault !== false;

    if (typeof window._syncPartColorScope === 'function') window._syncPartColorScope();
    if (typeof window._importLocalPartColors === 'function' && savedEditIdx >= 0) {
        window._importLocalPartColors('cart' + savedEditIdx, rs.partColors);
    } else if (rs.partColors) {
        state.partColors = JSON.parse(JSON.stringify(rs.partColors));
    }

    if (typeof window._restorePresetUI === 'function') window._restorePresetUI();
    if (typeof window._syncSpacePairTabs === 'function') window._syncSpacePairTabs();
    if (typeof clearSelection === 'function') clearSelection();
    if (typeof buildCabinet === 'function') buildCabinet();
    if (typeof updateCameraView === 'function') updateCameraView();
    if (typeof calculatePrice === 'function') calculatePrice();
    if (typeof updateLeftSidebar === 'function') updateLeftSidebar({ scrollToActive: true });
    if (typeof saveHistoryState === 'function') saveHistoryState();
    return true;
};

window.openCabinetTemplatesSheet = function() {
    if (window._VIEWER_MODE) return;
    const overlay = document.getElementById('cab-templates-overlay');
    if (!overlay) return;
    overlay.style.display = 'flex';
    requestAnimationFrame(function() {
        const sheet = document.getElementById('cab-templates-sheet');
        if (sheet) sheet.style.transform = 'translateY(0)';
    });
    window._renderCabinetTemplatesSheet();
};

window.closeCabinetTemplatesSheet = function() {
    const overlay = document.getElementById('cab-templates-overlay');
    const sheet = document.getElementById('cab-templates-sheet');
    if (sheet) sheet.style.transform = 'translateY(110%)';
    setTimeout(function() {
        if (overlay) overlay.style.display = 'none';
    }, 220);
};

window._renderCabinetTemplatesSheet = function(skipRefresh) {
    const grid = document.getElementById('cab-templates-grid');
    const emptyEl = document.getElementById('cab-templates-empty');
    if (!grid) return;
    if (!skipRefresh) {
        window._refreshTemplates('cabinet').then(function() { window._renderCabinetTemplatesSheet(true); });
    }
    const list = window._loadCabinetTemplates();
    grid.innerHTML = '';

    if (!list.length) {
        if (emptyEl) emptyEl.style.display = '';
    } else if (emptyEl) {
        emptyEl.style.display = 'none';
    }

    list.forEach(function(tpl, idx) {
        const card = document.createElement('div');
        card.className = 'col-tpl-card';
        card.title = 'החל על הארון הנוכחי';
        const name = String(tpl.name || ('תבנית ארון ' + (idx + 1))).trim() || ('תבנית ארון ' + (idx + 1));
        const safeName = name
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
        const dims = (tpl.sourceWidth && tpl.sourceHeight)
            ? (Math.round(tpl.sourceWidth) + '×' + Math.round(tpl.sourceHeight) + ' ס״מ')
            : '';
        const thumb = tpl.thumbnail
            ? '<div class="col-tpl-thumb-wrap"><img class="col-tpl-thumb" src="' + tpl.thumbnail + '" alt=""></div>'
            : '<div class="col-tpl-thumb-wrap"><div class="col-tpl-thumb col-tpl-thumb--empty"><i class="fa-solid fa-warehouse"></i></div></div>';
        card.innerHTML =
            thumb +
            '<div class="col-tpl-card-meta">' +
                '<div class="col-tpl-card-name">' + safeName + '</div>' +
                (dims ? '<div style="font-size:0.72rem;color:#94a3b8;margin-top:2px;">' + dims + '</div>' : '') +
            '</div>' +
            (window._canDeleteTemplate(tpl) ? '<button type="button" class="col-tpl-del" title="מחק תבנית"><i class="fa-solid fa-trash"></i></button>' : '');
        card.addEventListener('click', function(e) {
            if (e.target.closest('.col-tpl-del')) return;
            window.applyCabinetTemplate(tpl.id);
        });
        const delBtn = card.querySelector('.col-tpl-del');
        if (delBtn) {
            delBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                window.deleteCabinetTemplate(tpl.id);
            });
        }
        grid.appendChild(card);
    });
};

window.addCurrentCabinetAsTemplate = async function() {
    if (!state || !state.wings) {
        if (typeof _showToast === 'function') _showToast('אין ארון לשמירה', 2500);
        return;
    }

    const list = window._loadCabinetTemplates();
    const defaultName = 'תבנית ארון ' + (list.length + 1);
    const typed = window.prompt('שם תבנית הארון:', defaultName);
    if (typed === null) return;
    const name = String(typed).trim() || defaultName;

    const rawState = window._serializeCabinetForTemplate();
    const thumb = window._captureCabinetTemplateThumbnail();
    const tpl = {
        id: 'cab_' + Date.now().toString(36) + Math.floor(Math.random() * 1000).toString(36),
        name: name,
        createdAt: Date.now(),
        sourceWidth: Math.round(state.width || 0),
        sourceHeight: Math.round(state.globalHeight || 0),
        sourceDepth: Math.round(state.depth || 0),
        presetId: state.presetId || 'linear',
        thumbnail: thumb,
        rawState: rawState
    };
    if (!(await window._addTemplate('cabinet', tpl))) return;
    window._renderCabinetTemplatesSheet(true);
    if (typeof _showToast === 'function') _showToast('תבנית הארון "' + name + '" נשמרה ✓', 2800);
};

window.deleteCabinetTemplate = async function(id) {
    if (!(await window._deleteTemplate('cabinet', id))) return;
    window._renderCabinetTemplatesSheet(true);
    if (typeof _showToast === 'function') _showToast('התבנית נמחקה', 2000);
};

window.applyCabinetTemplate = function(id) {
    const list = window._loadCabinetTemplates();
    const tpl = list.find(function(t) { return t.id === id; });
    if (!tpl || !tpl.rawState) return;
    window._applyCabinetTemplateRawState(tpl.rawState);
    window.closeCabinetTemplatesSheet();
    if (typeof _showToast === 'function') _showToast('תבנית הארון הוחלה ✓', 2500);
};
// ─────────────────────────────────────────────────────────────────────────────

function toggleSelection(c, r) {
    _clearSubCellSelection();
    // The desk knee zone (pseudo-row -1) is never combined with regular rows
    if (state.selection.colIndex !== c || r === -1 || state.selection.rows.includes(-1)) {
        const deselect = state.selection.colIndex === c && state.selection.rows.length === 1 && state.selection.rows[0] === r;
        state.selection = deselect ? { colIndex: -1, rows: [] } : { colIndex: c, rows: [r] };
    } else {
        if (state.selection.rows.includes(r)) {
            state.selection.rows = state.selection.rows.filter(row => row !== r);
            if(state.selection.rows.length === 0) state.selection.colIndex = -1;
        } else {
            state.selection.rows.push(r);
        }
    }
    buildCabinet(); 
}

function clearSelection() {
    const hadSomething = _activeSubCellIdxs.size > 0
        || state.selection.colIndex !== -1
        || state.selection.rows.length > 0;
    _clearSubCellSelection();
    state.selection = { colIndex: -1, rows: [] };
    if (hadSomething) {
        closeContentSubPanels();
        buildCabinet();
    }
}

// ---- FC cell selection + toolbar (shown in 3D FC edit mode) ----
// Persistent DOM: only recreate when structure changes, update positions every frame.
let _fcCellBtnSide = null;
let _fcCellBtnCount = 0;
let _fcCellBtnStateKey = '';
let _fcShelfDragSide = null;
let _fcShelfDragCount = 0;
let _fcSelection = { rows: [] };  // selected row indices in the full corner unit

function _fcActiveSide() {
    const aw = state.activeWing || '';
    return aw.indexOf('full_corner_') === 0 ? aw.replace('full_corner_', '') : null;
}

function _fcActiveData() {
    const side = _fcActiveSide();
    const wingData = side ? state.wings[side] : null;
    if (!wingData || !wingData.fullCorner) return null;
    return { side, wingData, fc: wingData.fullCorner };
}

/** Cell boundaries as drawn: [bottom inner face, ...shelf centres, top inner face]. */
function _fcAllY(wingData, fc) {
    const t = wingData.thickness || 1.7;
    return [(wingData.plinthHeight || 7) + t, ...(fc.shelvesY || []), (wingData.globalHeight || 240) - t];
}

/** Local anchor (front-arm centre) where the FC overlays are projected. */
function _fcLocalAnchor(side, wingData, fc) {
    const sign = (side === 'right') ? 1 : -1;
    const centerWing = state.wings.center;
    const bodyD = centerWing ? centerWing.depth : (wingData.depth || 54);
    return { x: -sign * ((fc.size || 100) / 2), z: bodyD / 2 };
}

/** Screen pixels per cm along the FC's vertical axis at height y. */
function _fcPxPerCm(fcGroup, anchor, y) {
    fcGroup.updateMatrixWorld(true);
    const a = new THREE.Vector3(anchor.x, y, anchor.z).applyMatrix4(fcGroup.matrixWorld).project(camera);
    const b = new THREE.Vector3(anchor.x, y + 10, anchor.z).applyMatrix4(fcGroup.matrixWorld).project(camera);
    const px = Math.abs((b.y - a.y) * 0.5 * container.clientHeight) / 10;
    return px > 0.05 ? px : container.clientHeight / 240;
}

function _fcCompView(fc, r) {
    const comp = (fc && fc.compartments && fc.compartments[r]) || {};
    return {
        content: comp.content !== undefined ? comp.content : (comp.type === 'cross_hanging' ? 'cross_hanging' : 'empty'),
        // Legacy 'right' was the only "door on" value and is drawn as the double layout
        door: (function(d) { return d === 'right' ? 'double' : d; })(
            comp.door !== undefined ? comp.door : (comp.type === 'door_regular' || comp.type === 'door_glass' ? 'double' : 'empty')),
        doorStyle: comp.doorStyle || 'solid'
    };
}

function _fcRowHasLed(fc, r) {
    return Array.isArray(fc.leds) && fc.leds.some(g => r >= g.startRow && r <= g.endRow);
}

// Toggle selection of a FC cell row
function _toggleFCSelection(r) {
    const idx = _fcSelection.rows.indexOf(r);
    if (idx === -1) _fcSelection.rows.push(r);
    else _fcSelection.rows.splice(idx, 1);
    _renderAllFCCellBtns();
    updateFCToolbarState();
}

window._clearFCSelection = function _clearFCSelection() {
    _fcSelection.rows = [];
    _renderAllFCCellBtns();
    updateFCToolbarState();
}

/** Fill one FC cell wrapper with the shared regular-cabinet pill. */
function _renderFCCellBtn(wrap, r) {
    const d = _fcActiveData();
    if (!d) return;
    const allY = _fcAllY(d.wingData, d.fc);
    const view = _fcCompView(d.fc, r);
    const pill = _buildCellPill({
        selected: _fcSelection.rows.includes(r),
        hasContent: view.content !== 'empty' || view.door !== 'empty',
        heightCm: (allY[r + 1] || 0) - (allY[r] || 0),
        iconHtml: _fcRowHasLed(d.fc, r)
            ? '<i class="fa-solid fa-lightbulb" style="font-size:0.62rem;color:#fcd34d;pointer-events:none;" title="לדים"></i>'
            : '',
        onToggle: () => _toggleFCSelection(r),
        onTrash: () => {
            const d2 = _fcActiveData();
            if (d2 && d2.fc.compartments[r]) {
                d2.fc.compartments[r] = { content: 'empty', door: 'empty' };
            }
            buildCabinet(); calculatePrice(); saveHistoryState();
        },
        onHeightChange: (desired) => window.setFullCornerCellHeight(r, desired)
    });
    wrap.innerHTML = '';
    wrap.appendChild(pill);
    wrap._heightInput = pill._heightInput || null;
}

function _renderAllFCCellBtns() {
    document.querySelectorAll('.fc-cell-btn').forEach(wrap => _renderFCCellBtn(wrap, parseInt(wrap.dataset.fcRow)));
}

function _rebuildFCCellButtons(fcRealSide, rowCount) {
    const structural = (_fcCellBtnSide !== fcRealSide || _fcCellBtnCount !== rowCount);
    document.querySelectorAll('.fc-cell-btn').forEach(el => el.remove());
    _fcCellBtnSide = fcRealSide;
    _fcCellBtnCount = rowCount;
    if (structural) _fcSelection.rows = [];

    for (let r = 0; r < rowCount; r++) {
        const wrap = document.createElement('div');
        wrap.className = 'fc-cell-btn';
        wrap.dataset.fcRow = r;
        wrap.style.cssText = 'position:absolute;left:0;top:0;transform:translate(-50%,-50%);z-index:40;pointer-events:auto;';
        wrap.addEventListener('pointerdown', e => e.stopPropagation());
        wrap.addEventListener('pointerup', e => e.stopPropagation());
        wrap.addEventListener('mousedown', e => e.stopPropagation());
        _renderFCCellBtn(wrap, r);
        container.appendChild(wrap);
    }
    updateFCToolbarState();
}

// ---- FC Toolbar state update ----
window.updateFCToolbarState = function() {
    const toolbar = document.getElementById('fc-toolbar');
    if (!toolbar) return;

    const isFCEditMode = state.wingEditMode && !!_fcActiveSide();
    if (!isFCEditMode || _fcSelection.rows.length === 0) {
        toolbar.classList.remove('show-toolbar');
        const dsp = document.getElementById('fc-door-style-panel');
        if (dsp) dsp.style.display = 'none';
        return;
    }

    toolbar.classList.add('show-toolbar');

    const d = _fcActiveData();

    // Highlight buttons based on first selected row
    const fc2 = d && d.fc;
    const view = _fcCompView(fc2, _fcSelection.rows[0]);
    const hasDoor = view.door !== 'empty';

    document.getElementById('fc-btn-hanging')?.classList.toggle('active', view.content === 'cross_hanging');
    document.getElementById('fc-btn-empty-content')?.classList.toggle('active', view.content === 'empty');
    document.querySelectorAll('#fc-toolbar [data-fc-door]').forEach(b => {
        b.classList.toggle('active', b.dataset.fcDoor === view.door);
    });
    document.getElementById('fc-btn-door-empty')?.classList.toggle('active', !hasDoor);
    document.getElementById('fc-btn-led')?.classList.toggle('active',
        typeof window._fcLedGroupIndex === 'function' && window._fcLedGroupIndex(_fcSelection.rows) !== -1);

    const equalBtn = document.getElementById('fc-btn-equal-cells');
    if (equalBtn) equalBtn.style.display = (fc2 && (fc2.shelvesY || []).length > 0) ? '' : 'none';

    const handleRow = document.getElementById('fc-handle-row');
    if (handleRow) handleRow.style.display = hasDoor ? '' : 'none';
    const handleBtn = document.getElementById('fc-btn-handle');
    if (handleBtn) handleBtn.classList.toggle('active', !!(fc2 && fc2.handleStyle));

    const shelfCount = document.getElementById('fc-shelf-count');
    if (shelfCount) shelfCount.textContent = fc2 ? (fc2.shelvesY || []).length : 0;

    // Door style inline sub-panel — show when door is active, hide otherwise
    const dsp = document.getElementById('fc-door-style-panel');
    if (dsp) {
        dsp.style.display = hasDoor ? 'flex' : 'none';
        if (hasDoor) {
            const activeRow = document.querySelector(`#fc-toolbar [data-fc-door="${view.door}"]`)?.parentElement;
            if (activeRow && dsp.parentElement !== activeRow) activeRow.appendChild(dsp);
            dsp.querySelectorAll('button[data-fc-door-style]').forEach(b => {
                b.classList.toggle('active', b.dataset.fcDoorStyle === view.doorStyle);
            });
        }
    }

    // Position last so the measured height includes the open sub-panels
    const fcGroup = d && window[`_fullCornerGroup_${d.side}`];
    if (d && fcGroup) {
        const cw_px = container.clientWidth;
        const ch_px = container.clientHeight;
        const anchor = _fcLocalAnchor(d.side, d.wingData, d.fc);
        const allY2 = _fcAllY(d.wingData, d.fc);
        const midRow = _fcSelection.rows[Math.floor(_fcSelection.rows.length / 2)];
        const midY = allY2.length > midRow + 1 ? (allY2[midRow] + allY2[midRow + 1]) / 2 : (d.wingData.globalHeight || 240) / 2;
        fcGroup.updateMatrixWorld(true);
        const projected = new THREE.Vector3(anchor.x, midY, anchor.z).applyMatrix4(fcGroup.matrixWorld).project(camera);
        // Nudged right so the toolbar doesn't cover the "+" select pills of neighbouring cells
        let tx = (projected.x * 0.5 + 0.5) * cw_px + 16;
        let ty = (-projected.y * 0.5 + 0.5) * ch_px;
        const tw = toolbar.offsetWidth || 300;
        const th = toolbar.offsetHeight || 60;
        tx = Math.max(tw / 2 + 10, Math.min(cw_px - tw / 2 - 10, tx));
        ty = Math.max(th / 2 + 10, Math.min(ch_px - th / 2 - 10, ty));
        toolbar.style.left = `${tx}px`;
        toolbar.style.top = `${ty}px`;
    }
};

// ---- FC apply functions ----
window.applyFCContent = function(contentType) {
    if (!_fcActiveSide()) return;
    window.updateFullCornerContent(_fcSelection.rows, contentType);
    _clearFCSelection(); // close toolbar after applying
};

/** doorType: 'empty' | 'hinge_right' | 'hinge_left' | 'double' | 'flap' — always applied to the door pair. */
window.applyFCDoor = function(doorType) {
    if (!_fcActiveSide()) return;
    window.updateFullCornerDoor(_fcSelection.rows, doorType);
    if (doorType === 'empty') {
        _clearFCSelection();
    } else {
        // Keep the toolbar open so the style list under the chosen type can be picked, like the regular cabinet
        _renderAllFCCellBtns();
        updateFCToolbarState();
    }
};

window.applyFCDoorStyle = function(style) {
    if (!_fcActiveSide()) return;
    window.updateFullCornerDoorStyle(_fcSelection.rows, style);
    _clearFCSelection(); // close toolbar after applying
};

window.applyFCLed = function() {
    if (!_fcActiveSide() || !_fcSelection.rows.length) return;
    window.toggleFullCornerLed(_fcSelection.rows);
    _renderAllFCCellBtns();
    updateFCToolbarState();
};

window.applyFCEqualCells = function() {
    if (!_fcActiveSide()) return;
    window.fcEqualizeCells();
    _renderAllFCCellBtns();
    updateFCToolbarState();
};

/** +1 splits every selected cell with a new shelf, -1 merges each selected cell with its neighbour. */
window.fcShelvesStep = function(delta) {
    if (!_fcActiveSide() || !_fcSelection.rows.length) return;
    const rows = _fcSelection.rows.slice();
    if (delta > 0) window.fcAddShelfInCells(rows);
    else window.fcRemoveShelfInCells(rows);
    _clearFCSelection();
};

window.openFCHandlePicker = function() {
    const d = _fcActiveData();
    if (!d) return;
    const current = d.fc.handleStyle || state.handleStyle || 'pipe';
    _openHandlePickerSheet(current, 'ידית לדלתות הפינה המלאה', function(style) {
        window.setFullCornerHandleStyle(style);
        updateFCToolbarState();
    });
};

// ── Per-unit splitY ──────────────────────────────────────────────────────────
// The קושרת is independent per wing. Columns inside the same wing stay aligned
// (one cabinet body). Other wings and the full-corner L-unit are never copied.
function _setActiveWingSplitY(newSplitY) {
    const t = state.thickness;
    state.columns.forEach(c => {
        if (!c.splitY) return;
        c.splitY = newSplitY;
        if (typeof _clampDrawerCompartments === 'function') {
            const baseY = c.type === 'desk' ? c.deskHeight + c.deskClearance : state.plinthHeight;
            _clampDrawerCompartments(c, baseY, t);
        }
    });
}

// ── FC Split (קושרת) drag handle ────────────────────────────────────────────
let _fcSplitDragSide = null;

function _rebuildFCSplitDragHandle(fcRealSide, wingData, fc) {
    document.querySelectorAll('.fc-split-drag').forEach(el => el.remove());
    _fcSplitDragSide = fcRealSide;

    if (!fc.splitY) return; // no split board → no handle

    const MIN_GAP = 20;

    const handle = document.createElement('div');
    handle.className = 'fc-split-drag drag-handle';
    handle.style.cssText = [
        'position:absolute;left:0;top:0;transform:translate(-50%,-50%);z-index:46;',
        'width:27px;height:27px;border-radius:50%;background:white;',
        'border:2px solid #e74c3c;display:flex;align-items:center;justify-content:center;',
        'cursor:ns-resize;box-shadow:0 2px 10px rgba(231,76,60,0.4);'
    ].join('');
    handle.innerHTML = '<i class="fa-solid fa-arrows-up-down" style="font-size:0.55rem;color:#e74c3c;"></i>';
    handle.title = 'גרור להזזת קושרת';

    let _dragStartY = 0;
    let _dragStartSplitY = 0;
    let _pxPerCm = 1;
    let _isDragging = false;

    handle.addEventListener('pointerdown', e => {
        e.stopPropagation();
        e.preventDefault();
        const d = _fcActiveData();
        const fcGroup = d && window[`_fullCornerGroup_${d.side}`];
        if (!d || !d.fc.splitY || !fcGroup) return;
        _isDragging = true;
        _dragStartY = e.clientY;
        _dragStartSplitY = d.fc.splitY;
        _pxPerCm = _fcPxPerCm(fcGroup, _fcLocalAnchor(d.side, d.wingData, d.fc), d.fc.splitY);
        handle.setPointerCapture(e.pointerId);
    });

    handle.addEventListener('pointermove', e => {
        if (!_isDragging) return;
        e.stopPropagation();
        const d = _fcActiveData();
        if (!d) return;
        const wd2 = d.wingData;
        const t = wd2.thickness || 1.7;
        const plinthH = wd2.plinthHeight || 7;
        const colH = wd2.globalHeight || 240;
        const threshold = typeof getSplitThreshold === 'function'
            ? getSplitThreshold(wd2)
            : ((wd2.boardMaterial || 'melamine') === 'sandwich' ? 240 : 270);
        let newSplitY = _dragStartSplitY - (e.clientY - _dragStartY) / _pxPerCm;
        // The board occupies splitY-t..splitY+t and must leave MIN_GAP to the carcass boards
        const minSplitY = plinthH + t + 2 * t + MIN_GAP;
        const maxSplitY = Math.min(threshold, colH - t - MIN_GAP);
        newSplitY = Math.max(minSplitY, Math.min(maxSplitY, newSplitY));
        d.fc.splitY = Math.round(newSplitY * 10) / 10;
        buildCabinetDragging();
    });

    handle.addEventListener('pointerup', e => {
        if (!_isDragging) return;
        _isDragging = false;
        e.stopPropagation();
        _endDrag();
        calculatePrice();
        saveHistoryState();
    });

    container.appendChild(handle);
}
// ─────────────────────────────────────────────────────────────────────────────

function _rebuildFCShelfDragHandles(fcRealSide, shelfCount) {
    document.querySelectorAll('.fc-shelf-drag').forEach(el => el.remove());
    _fcShelfDragSide = fcRealSide;
    _fcShelfDragCount = shelfCount;

    const MIN_GAP = 20; // minimum cell height in cm

    for (let si = 0; si < shelfCount; si++) {
        const handle = document.createElement('div');
        handle.className = 'fc-shelf-drag drag-handle';
        handle.dataset.fcShelfIdx = si;
        handle.style.cssText = 'position:absolute;left:0;top:0;transform:translate(-50%,-50%);z-index:45;width:25px;height:25px;border-radius:50%;background:white;border:2px solid var(--secondary);display:flex;align-items:center;justify-content:center;cursor:ns-resize;box-shadow:0 2px 6px rgba(0,0,0,0.2);';
        handle.innerHTML = '<i class="fa-solid fa-arrows-up-down" style="font-size:0.55rem;color:var(--secondary);"></i>';
        handle.title = 'גרור להזזת מדף';

        let _dragStartY = 0;
        let _dragStartSy = 0;
        let _pxPerCm = 1;
        let _isDragging = false;

        handle.addEventListener('pointerdown', e => {
            e.stopPropagation();
            e.preventDefault();
            const d = _fcActiveData();
            const fcGroup = d && window[`_fullCornerGroup_${d.side}`];
            if (!d || !fcGroup || d.fc.shelvesY[si] == null) return;
            _isDragging = true;
            _dragStartY = e.clientY;
            _dragStartSy = d.fc.shelvesY[si];
            _pxPerCm = _fcPxPerCm(fcGroup, _fcLocalAnchor(d.side, d.wingData, d.fc), _dragStartSy);
            handle.setPointerCapture(e.pointerId);
        });

        handle.addEventListener('pointermove', e => {
            if (!_isDragging) return;
            e.stopPropagation();
            const d = _fcActiveData();
            if (!d) return;
            const allY2 = _fcAllY(d.wingData, d.fc);
            let newSy = _dragStartSy - (e.clientY - _dragStartY) / _pxPerCm;
            // Clamp between neighbours (allY2[si] is the boundary below shelf si, allY2[si+2] the one above)
            newSy = Math.max(allY2[si] + MIN_GAP, Math.min(allY2[si + 2] - MIN_GAP, newSy));
            d.fc.shelvesY[si] = Math.round(newSy * 10) / 10;
            buildCabinetDragging();
        });

        handle.addEventListener('pointerup', e => {
            if (!_isDragging) return;
            _isDragging = false;
            e.stopPropagation();
            _endDrag();
            calculatePrice();
            saveHistoryState();
        });

        container.appendChild(handle);
    }
}

function _fcProjectToScreen(fcGroup, x, y, z, cw_px, ch_px) {
    const projected = new THREE.Vector3(x, y, z).applyMatrix4(fcGroup.matrixWorld).project(camera);
    return {
        x: Math.max(20, Math.min(cw_px - 20, (projected.x * 0.5 + 0.5) * cw_px)),
        y: Math.max(20, Math.min(ch_px - 20, (-projected.y * 0.5 + 0.5) * ch_px))
    };
}

function _updateFCCellButtons() {
    const isFCEditMode = !!_fcActiveSide();
    if (!state.wingEditMode || !isFCEditMode) {
        document.querySelectorAll('.fc-cell-btn').forEach(el => el.remove());
        document.querySelectorAll('.fc-shelf-drag').forEach(el => el.remove());
        document.querySelectorAll('.fc-split-drag').forEach(el => el.remove());
        _fcCellBtnSide = null; _fcCellBtnCount = 0; _fcCellBtnStateKey = '';
        _fcShelfDragSide = null; _fcShelfDragCount = 0;
        _fcSplitDragSide = null;
        return;
    }

    const d = _fcActiveData();
    if (!d) return;
    const fcRealSide = d.side;
    const wingData = d.wingData;
    const fc = d.fc;

    const fcGroup = window[`_fullCornerGroup_${fcRealSide}`];
    if (!fcGroup) return;

    const cw_px = container.clientWidth;
    const ch_px = container.clientHeight;
    const shelvesY = fc.shelvesY || [];
    const allY = _fcAllY(wingData, fc);
    const rowCount = allY.length - 1;
    const anchor = _fcLocalAnchor(fcRealSide, wingData, fc);

    fcGroup.updateMatrixWorld(true);

    // Rebuild cell pills when the structure, cell contents or LEDs change
    const stateKey = [];
    for (let r = 0; r < rowCount; r++) {
        const v = _fcCompView(fc, r);
        stateKey.push(v.content + ':' + v.door + ':' + v.doorStyle + ':' + (_fcRowHasLed(fc, r) ? 1 : 0));
    }
    const stateKeyStr = stateKey.join(',');
    if (_fcCellBtnSide !== fcRealSide || _fcCellBtnCount !== rowCount || _fcCellBtnStateKey !== stateKeyStr) {
        _fcCellBtnStateKey = stateKeyStr;
        _rebuildFCCellButtons(fcRealSide, rowCount);
    }

    if (_fcShelfDragSide !== fcRealSide || _fcShelfDragCount !== shelvesY.length) {
        _rebuildFCShelfDragHandles(fcRealSide, shelvesY.length);
    }

    const hasSplit = !!fc.splitY;
    const splitHandleExists = !!document.querySelector('.fc-split-drag');
    if (_fcSplitDragSide !== fcRealSide || hasSplit !== splitHandleExists) {
        _rebuildFCSplitDragHandle(fcRealSide, wingData, fc);
    }

    // Positions + live cell heights (they change while a shelf is dragged)
    const cellBtns = document.querySelectorAll('.fc-cell-btn');
    for (let r = 0; r < rowCount; r++) {
        const wrap = cellBtns[r];
        if (!wrap) continue;
        const p = _fcProjectToScreen(fcGroup, anchor.x, (allY[r] + allY[r + 1]) / 2, anchor.z, cw_px, ch_px);
        wrap.style.left = `${p.x}px`;
        wrap.style.top = `${p.y}px`;
        const inp = wrap._heightInput;
        if (inp && document.activeElement !== inp) {
            const txt = _fmtCellHeightCm(allY[r + 1] - allY[r]);
            if (inp.value !== txt) { inp.value = txt; inp._shown = txt; }
        }
    }

    const dragHandles = document.querySelectorAll('.fc-shelf-drag');
    shelvesY.forEach((sy, si) => {
        const handle = dragHandles[si];
        if (!handle) return;
        const p = _fcProjectToScreen(fcGroup, anchor.x, sy, anchor.z, cw_px, ch_px);
        handle.style.left = `${p.x}px`;
        handle.style.top = `${p.y}px`;
    });

    const splitHandle = document.querySelector('.fc-split-drag');
    if (splitHandle && fc.splitY) {
        const p = _fcProjectToScreen(fcGroup, anchor.x, fc.splitY, anchor.z, cw_px, ch_px);
        splitHandle.style.left = `${p.x}px`;
        splitHandle.style.top = `${p.y}px`;
    }
}

function updateOverlaysPosition() {
    // In 3D mode: only handle FC cell buttons and FC panel (if in FC edit mode)
    const isFCEditMode3d = state.wingEditMode &&
        (state.activeWing === 'full_corner_right' || state.activeWing === 'full_corner_left');

    if (state.viewMode === '3d') {
        _updateFCCellButtons();
        // Position FC panel in 3D mode
        const fcPanel = document.getElementById('full-corner-quick-edit');
        if (fcPanel && fcPanel.classList.contains('visible') && isFCEditMode3d) {
            const fcRealSide = state.activeWing.replace('full_corner_', '');
            const activeWingData = state.wings[fcRealSide];
            if (activeWingData) {
                const fcGroup = window[`_fullCornerGroup_${fcRealSide}`];
                const fcSize = (activeWingData.fullCorner && activeWingData.fullCorner.size) || 100;
                const centerWingData = state.wings.center;
                const mainW = centerWingData ? centerWingData.width : (state.width || 200);
                const bodyD = centerWingData ? centerWingData.depth : (state.depth || 60);
                const wingD = activeWingData.depth || 54;
                const sign = (fcRealSide === 'right') ? 1 : -1;
                const originX = sign * (mainW / 2 + fcSize);
                const originZ = -bodyD / 2;
                const fcCenterX = originX - sign * fcSize / 2;
                const fcCenterZ = originZ + bodyD / 2;
                const worldPt = new THREE.Vector3(fcCenterX, 0, fcCenterZ);
                const projected = worldPt.clone().project(camera);
                const cw_px = container.clientWidth;
                const ch_px = container.clientHeight;
                let fcX = (projected.x * 0.5 + 0.5) * cw_px;
                let fcY = (-projected.y * 0.5 + 0.5) * ch_px;
                const pw = fcPanel.offsetWidth || 200;
                const ph = fcPanel.offsetHeight || 50;
                fcX = Math.max(pw / 2 + 10, Math.min(cw_px - pw / 2 - 10, fcX));
                fcY = Math.min(ch_px - ph - 10, Math.max(ph / 2 + 10, fcY));
                fcPanel.style.left = `${fcX}px`;
                fcPanel.style.top = `${fcY}px`;
            }
        }
        return;
    }

    // Remove FC cell buttons when not in 3D
    document.querySelectorAll('.fc-cell-btn').forEach(el => el.remove());

    const cw = container.clientWidth;
    const ch = container.clientHeight;

    // Helper: convert local wing coords (x, y) to world 3D, then project to 2D screen
    const projectWingPoint = (localX, localY) => {
        const localPt = new THREE.Vector3(localX, localY, state.depth / 2);
        if (window._activeWingGroup) {
            window._activeWingGroup.updateMatrixWorld(true);
            localPt.applyMatrix4(window._activeWingGroup.matrixWorld);
        } else if (window.cabinetGroup) {
            window.cabinetGroup.updateMatrixWorld(true);
            localPt.applyMatrix4(window.cabinetGroup.matrixWorld);
        }
        return localPt.project(camera);
    };

    document.querySelectorAll('.dim-container, .select-all-col-btn, .col-template-btn, .sub-cell-btn, .cell-select-btn, .honeycomb-merge-btn, .desk-drawer-merge-btn, .led-cell-icon, .tv-size-btn').forEach(el => {
        const pos = projectWingPoint(parseFloat(el.dataset.x3d), parseFloat(el.dataset.y3d));
        let x = (pos.x * .5 + .5) * cw;
        let y = (-(pos.y * .5) + .5) * ch;

        const w = el.offsetWidth || 50;
        const h = el.offsetHeight || 24;

        x = Math.max(w/2 + 5, Math.min(cw - w/2 - 5, x));
        y = Math.max(h/2 + 5, Math.min(ch - h/2 - 5, y));

        el.style.left = `${x}px`;
        el.style.top = `${y}px`;
    });

    // ---- Column width labels (always-visible layer) ----
    document.querySelectorAll('#col-widths-layer .col-width-label').forEach(el => {
        if (!el.dataset.x3d) return;
        const pos = projectWingPoint(parseFloat(el.dataset.x3d), parseFloat(el.dataset.y3d));
        let x = (pos.x * .5 + .5) * cw;
        let y = (-(pos.y * .5) + .5) * ch;
        const w = el.offsetWidth || 50;
        const h = el.offsetHeight || 22;
        x = Math.max(w/2 + 5, Math.min(cw - w/2 - 5, x));
        y = Math.max(h/2 + 5, Math.min(ch - h/2 - 5, y));
        el.style.left = `${x}px`;
        el.style.top = `${y}px`;
    });

    if (state.activeEditCol !== -1 && state.columns[state.activeEditCol] && state.viewMode === 'front') {
        const panel = document.getElementById('column-quick-edit');
        if(!panel) return;
        let currentX = -state.width/2 + state.thickness;
        for (let c = 0; c < state.activeEditCol; c++) {
            if(state.columns[c]) currentX += state.columns[c].width + state.thickness;
        }
        const colCenterX = currentX + state.columns[state.activeEditCol].width/2;
        // Position panel below the plinth: y=0 is the bottom of the cabinet (floor level)
        const pos = projectWingPoint(colCenterX, 0);
        
        let x = (pos.x * .5 + .5) * cw;
        let y = (-(pos.y * .5) + .5) * ch;
        
        // גבולות גזרה לפאנל העריכה המהירה
        const pw = panel.offsetWidth || 200;
        x = Math.max(pw/2 + 10, Math.min(cw - pw/2 - 10, x));
        // Clamp so panel doesn't go below canvas bottom
        const ph = panel.offsetHeight || 50;
        y = Math.min(ch - ph - 10, y);
        
        panel.style.left = `${x}px`;
        panel.style.top = `${y}px`;
    }

    // ---- Full corner quick edit panel positioning ----
    const fcPanel = document.getElementById('full-corner-quick-edit');
    if (fcPanel && fcPanel.classList.contains('visible') && state.wingEditMode) {
        const isFCEditMode = state.activeWing === 'full_corner_right' || state.activeWing === 'full_corner_left';
        const fcRealSide = isFCEditMode ? state.activeWing.replace('full_corner_', '') : null;
        const activeWingData = isFCEditMode ? state.wings[fcRealSide] : null;
        if (activeWingData) {
            const fcSize = (activeWingData.fullCorner && activeWingData.fullCorner.size) || 100;
            const centerWingData = state.wings.center;
            const mainW = centerWingData ? centerWingData.width : (state.width || 200);
            const bodyD = centerWingData ? centerWingData.depth : (state.depth || 60);
            const wingD = activeWingData.depth || 54;
            const cd = bodyD + wingD;
            const sign = (fcRealSide === 'right') ? 1 : -1;
            // L origin: back-outer corner at (sign*(mainW/2+fcSize), 0, -bodyD/2)
            const originX = sign * (mainW / 2 + fcSize);
            const originZ = -bodyD / 2;
            const fcCenterX = originX - sign * fcSize / 2;
            const fcCenterZ = originZ + cd / 2;
            const worldPt = new THREE.Vector3(fcCenterX, 0, fcCenterZ);
            const projected = worldPt.clone().project(camera);
            let fcX = (projected.x * 0.5 + 0.5) * cw;
            let fcY = (-projected.y * 0.5 + 0.5) * ch;
            const pw = fcPanel.offsetWidth || 260;
            const ph = fcPanel.offsetHeight || 60;
            fcX = Math.max(pw / 2 + 10, Math.min(cw - pw / 2 - 10, fcX));
            fcY = Math.min(ch - ph - 10, fcY);
            fcPanel.style.left = `${fcX}px`;
            fcPanel.style.top = `${fcY}px`;
        }
    }
}

/** Column-level hitboxes also use rowIndex -1; only the desk knee-zone one shows the selection tint. */
function _hitBoxSelected(hb) {
    const u = hb.userData;
    if (u.colIndex !== state.selection.colIndex || !state.selection.rows.includes(u.rowIndex)) return false;
    return u.rowIndex !== -1 || !!u.deskZone;
}

/** True when the selection is the knee space above an internal desk (pseudo-row -1). */
function _isDeskZoneSelection() {
    const sel = state.selection;
    if (sel.colIndex === -1 || sel.rows.length !== 1 || sel.rows[0] !== -1) return false;
    const col = state.columns[sel.colIndex];
    return !!(col && col.type === 'desk');
}
window._isDeskZoneSelection = _isDeskZoneSelection;

/** 'open_cell' | 'side_open_cell' when the current selection holds a honeycomb, else null. */
function _selectionHoneycombType() {
    if (state.selection.colIndex === -1 || state.selection.rows.length === 0) return null;
    const col = state.columns[state.selection.colIndex];
    if (_isDeskZoneSelection()) return col.deskHoneycomb ? 'open_cell' : null;
    const comp = col && col.compartments[state.selection.rows[0]];
    if (!comp) return null;
    if (_activeSubCellIdxs.size > 0 && comp.partition && Array.isArray(comp.subCells)) {
        const keys = _sortedSubKeys(_activeSubCellIdxs);
        const group = _findZoneDoorGroup(comp, keys);
        let t;
        if (group && _subKeysEqual(group.keys, keys) &&
            (group.type === 'honeycomb' || group.type === 'open_cell' || group.type === 'side_open_cell')) {
            t = group.type;
        } else {
            const { si, z } = _parseSubKey(keys[0]);
            const sub = comp.subCells[si];
            t = sub ? _zoneInteriorAt(sub, z) : null;
        }
        if (t === 'side_open_cell') return 'side_open_cell';
        return (t === 'honeycomb' || t === 'open_cell') ? 'open_cell' : null;
    }
    return (comp.type === 'open_cell' || comp.type === 'side_open_cell') ? comp.type : null;
}

/** כוורת button: removes the honeycomb when the selection already has one, otherwise opens its sub-panel. */
window.onHoneycombBtnClick = function(btn) {
    if (_isDeskZoneSelection()) {
        closeContentSubPanels();
        window.toggleDeskHoneycomb(state.selection.colIndex);
        updateToolbarButtonHighlights();
        return;
    }
    const current = _selectionHoneycombType();
    if (!current) {
        toggleContentSubPanel('honeycomb', btn);
        return;
    }
    closeContentSubPanels();
    if (_activeSubCellIdxs.size > 0) {
        setSubCellType(current);
        updateToolbarButtonHighlights();
        return;
    }
    const col = state.columns[state.selection.colIndex];
    state.selection.rows.forEach(r => {
        const comp = col.compartments[r];
        if (!comp || (comp.type !== 'open_cell' && comp.type !== 'side_open_cell')) return;
        comp.type = 'empty';
        delete comp.honeycombNoMergeRight;
    });
    buildCabinet(); calculatePrice(); saveHistoryState();
    updateToolbarButtonHighlights();
};

window.toggleContentSubPanel = function(panelKey, triggerBtn) {
    const panels = { hanging: 'hanging-sub-panel', drawer: 'drawer-sub-panel', honeycomb: 'honeycomb-sub-panel', appliances: 'appliances-sub-panel' };
    const triggerBtnIds = { hanging: 'tb-btn-hanging', drawer: 'tb-btn-drawer', honeycomb: 'tb-btn-honeycomb', appliances: 'tb-btn-appliances' };
    const defaultTypes = { hanging: 'hanging', drawer: 'internal_drawers', honeycomb: 'open_cell' };
    const targetId = panels[panelKey];
    if (!targetId) return;

    // When opening a content panel on a partitioned cell / zone, apply default type once.
    // (Skip when panel is already open — that click only closes it.)
    if (defaultTypes[panelKey] && state.selection.colIndex >= 0 && state.selection.rows.length > 0) {
        const target = document.getElementById(targetId);
        const alreadyOpen = target && target.style.display !== 'none';
        if (!alreadyOpen) {
            const _comp = state.columns[state.selection.colIndex] &&
                state.columns[state.selection.colIndex].compartments[state.selection.rows[0]];
            if (_activeSubCellIdxs.size > 0 || (_comp && _comp.partition)) {
                _dbgHang('toggleContentSubPanel auto-apply', panelKey, defaultTypes[panelKey]);
                window.applyContentForce(defaultTypes[panelKey]);
            }
        }
    }

    // Check if this panel is already open
    const target = document.getElementById(targetId);
    const isOpen = target && target.style.display !== 'none';

    // Hide all content sub-panels and remove trigger highlights
    Object.keys(panels).forEach(key => {
        const el = document.getElementById(panels[key]);
        if (el) el.style.display = 'none';
        const btn = document.getElementById(triggerBtnIds[key]);
        if (btn) btn.classList.remove('sub-panel-open');
    });

    if (!isOpen) {
        // Open the target panel inline and highlight its trigger button
        if (target) target.style.display = 'flex';
        const trigBtn = document.getElementById(triggerBtnIds[panelKey]);
        if (trigBtn) trigBtn.classList.add('sub-panel-open');
        updateToolbarButtonHighlights();
    }
};

// IDs that are managed separately (not touched by subcell open/close)
const _SUBCELL_SKIP_IDS = new Set(['drawer-count-section']);

// ── Sub-cell editing state ──
// _activeSubCellIdxs: Set of selected composite keys "si:z" (sub-cell index : zone index)
// Scoped to one compartment via _activeSubCellOwner { col, row } — prevents parallel-column ghost selection
// _activeSubCellIdx: convenience getter — first selected sub-cell index (integer), or -1 if none
let _activeSubCellIdxs = new Set();
let _activeSubCellOwner = { col: -1, row: -1 };

/** Debug flag — set window._DEBUG_HANG = false to silence */
window._DEBUG_HANG = true;
function _dbgHang() {
    if (!window._DEBUG_HANG) return;
    const args = Array.prototype.slice.call(arguments);
    args.unshift('[HANG/PARTITION]');
    console.log.apply(console, args);
}
function _dbgHangSnapshot(label) {
    if (!window._DEBUG_HANG) return;
    const c = state.selection.colIndex;
    const rows = state.selection.rows || [];
    const r = rows.length ? rows[0] : -1;
    const col = (c >= 0 && state.columns[c]) ? state.columns[c] : null;
    const comp = (col && r >= 0) ? col.compartments[r] : null;
    const subs = (comp && Array.isArray(comp.subCells))
        ? comp.subCells.map(function (s, i) {
            return {
                i: i,
                type: s && s.type,
                shelves: s && s.shelves,
                zonesType: s && s.zonesType ? s.zonesType.slice() : null,
                zonesDoor: s && s.zonesDoor ? s.zonesDoor.slice() : null
            };
        })
        : null;
    const payload = {
        selection: { col: c, rows: rows.slice() },
        owner: { col: _activeSubCellOwner.col, row: _activeSubCellOwner.row },
        activeZones: [..._activeSubCellIdxs],
        partition: !!(comp && comp.partition),
        parentType: comp && comp.type,
        zoneDoorGroups: (comp && comp.zoneDoorGroups) ? JSON.parse(JSON.stringify(comp.zoneDoorGroups)) : null,
        subCells: subs
    };
    console.log('[HANG/PARTITION]', label, JSON.stringify(payload, null, 2));
}

Object.defineProperty(window, '_activeSubCellIdx', {
    get() {
        const v = _activeSubCellIdxs.values().next();
        if (v.done) return -1;
        const key = v.value;
        // key may be "si:z" or legacy integer
        if (typeof key === 'string' && key.includes(':')) return parseInt(key.split(':')[0], 10);
        return typeof key === 'number' ? key : parseInt(key, 10);
    },
    set(v) {
        _activeSubCellIdxs = v >= 0 ? new Set([String(v) + ':0']) : new Set();
        if (v < 0) _activeSubCellOwner = { col: -1, row: -1 };
    }
});

function _setSubCellOwner(col, row) {
    if (_activeSubCellOwner.col !== col || _activeSubCellOwner.row !== row) {
        _dbgHang('owner switch', { from: { ..._activeSubCellOwner }, to: { col: col, row: row } });
        _activeSubCellIdxs = new Set();
        _activeSubCellOwner = { col: col, row: row };
    } else {
        _activeSubCellOwner = { col: col, row: row };
    }
}

function _clearSubCellSelection() {
    _activeSubCellIdxs = new Set();
    _activeSubCellOwner = { col: -1, row: -1 };
}

function _subCellUiSelected(colIndex, rowIndex, zoneKey) {
    return _activeSubCellOwner.col === colIndex &&
        _activeSubCellOwner.row === rowIndex &&
        state.selection.colIndex === colIndex &&
        state.selection.rows.includes(rowIndex) &&
        _activeSubCellIdxs.has(zoneKey);
}

// Helper: parse composite key "si:z" → { si, z }
function _parseSubKey(key) {
    if (typeof key === 'string' && key.includes(':')) {
        const parts = key.split(':');
        return { si: parseInt(parts[0], 10), z: parseInt(parts[1], 10) };
    }
    return { si: parseInt(key, 10), z: 0 };
}

// Helper: build composite key from si and z
function _subKey(si, z) { return `${si}:${z}`; }

const _DOOR_ZONE_TYPES = new Set(['door_right', 'door_left', 'door_double', 'door_flap']);
const _MERGE_ZONE_TYPES = new Set([..._DOOR_ZONE_TYPES, 'honeycomb', 'side_open_cell']);
const _INTERIOR_ZONE_TYPES = new Set(['hanging', 'sorbet', 'internal_drawers', 'external_drawers', 'honeycomb', 'open_cell', 'side_open_cell']);

/** Whether a column can open its left/right carcass wall at a given Y (air / short neighbor / floating). */
function _sideOpenExposure(c, bottomY) {
    const leftNeighbor = state.columns[c - 1];
    const rightNeighbor = state.columns[c + 1];
    const opensLeft = c === 0
        || (leftNeighbor && leftNeighbor.height <= bottomY + 0.5)
        || (leftNeighbor && (leftNeighbor.floorOffset || 0) > bottomY + 0.5);
    const opensRight = c === state.columns.length - 1
        || (rightNeighbor && rightNeighbor.height <= bottomY + 0.5)
        || (rightNeighbor && (rightNeighbor.floorOffset || 0) > bottomY + 0.5);
    return { opensLeft, opensRight };
}

function _sortedSubKeys(keys) {
    return [...keys].sort((a, b) => {
        const pa = _parseSubKey(a), pb = _parseSubKey(b);
        return pa.si - pb.si || pa.z - pb.z;
    });
}

function _subKeysEqual(a, b) {
    const sa = _sortedSubKeys(a), sb = _sortedSubKeys(b);
    return sa.length === sb.length && sa.every((k, i) => k === sb[i]);
}

function _findZoneDoorGroup(comp, keys) {
    if (!comp || !Array.isArray(comp.zoneDoorGroups)) return null;
    return comp.zoneDoorGroups.find(g => _subKeysEqual(g.keys, keys)) || null;
}

function _removeZoneDoorGroupsForKeys(comp, keys) {
    if (!comp || !Array.isArray(comp.zoneDoorGroups)) return;
    const keySet = new Set(keys);
    comp.zoneDoorGroups = comp.zoneDoorGroups.filter(g => !g.keys.some(k => keySet.has(k)));
}

/** Remove only honeycomb merge groups (keep door groups when applying interior content) */
function _removeHoneycombGroupsForKeys(comp, keys) {
    if (!comp || !Array.isArray(comp.zoneDoorGroups)) return;
    const keySet = new Set(keys);
    comp.zoneDoorGroups = comp.zoneDoorGroups.filter(g => {
        if (!g.keys.some(k => keySet.has(k))) return true;
        return g.type !== 'honeycomb' && g.type !== 'open_cell' && g.type !== 'side_open_cell';
    });
}

function _zoneDoorGroupForKey(comp, key) {
    if (!comp || !Array.isArray(comp.zoneDoorGroups)) return null;
    return comp.zoneDoorGroups.find(g => g.keys.includes(key)) || null;
}

/** Normalize a sub-zone type; invalid values → empty */
function _normalizeZoneType(t) {
    if (!t || t === 'empty' || t === 'partition') return 'empty';
    return t;
}

function _isDoorZoneType(t) {
    return !!(t && _DOOR_ZONE_TYPES.has(t));
}

/**
 * Migrate legacy data where doors were stored in zonesType/sub.type
 * into zonesDoor[], leaving zonesType for interior content only.
 */
function _ensureZoneDoorSplit(sub) {
    if (!sub) return;
    if (!Array.isArray(sub.zonesType)) {
        sub.zonesType = [_normalizeZoneType(sub.type || 'empty')];
    }
    if (!Array.isArray(sub.zonesDoor)) sub.zonesDoor = [];
    const n = Math.max(sub.zonesType.length, sub.zonesDoor.length, 1);
    while (sub.zonesType.length < n) sub.zonesType.push('empty');
    while (sub.zonesDoor.length < n) sub.zonesDoor.push('empty');
    for (let z = 0; z < n; z++) {
        const t = sub.zonesType[z];
        if (_isDoorZoneType(t)) {
            if (!_isDoorZoneType(sub.zonesDoor[z])) sub.zonesDoor[z] = t;
            sub.zonesType[z] = 'empty';
        } else {
            sub.zonesType[z] = _normalizeZoneType(t);
        }
        if (!_isDoorZoneType(sub.zonesDoor[z])) {
            sub.zonesDoor[z] = _normalizeZoneType(sub.zonesDoor[z]);
            if (sub.zonesDoor[z] !== 'empty' && !_isDoorZoneType(sub.zonesDoor[z])) {
                sub.zonesDoor[z] = 'empty';
            }
        }
    }
    if (_isDoorZoneType(sub.type)) {
        if (!_isDoorZoneType(sub.zonesDoor[0])) sub.zonesDoor[0] = sub.type;
        sub.type = 'empty';
    } else if (sub.type && _INTERIOR_ZONE_TYPES.has(sub.type)) {
        // keep
    } else if (sub.type === 'partition') {
        sub.type = 'empty';
    }
}

/** Interior content only (hanging / drawers / honeycomb / empty) */
function _zoneInteriorAt(sub, z) {
    if (!sub) return 'empty';
    _ensureZoneDoorSplit(sub);
    if (z >= 0 && z < sub.zonesType.length) {
        const t = _normalizeZoneType(sub.zonesType[z]);
        return _isDoorZoneType(t) ? 'empty' : t;
    }
    if ((sub.shelves || 0) <= 0) {
        const t = _normalizeZoneType(sub.type || 'empty');
        return _isDoorZoneType(t) ? 'empty' : t;
    }
    return 'empty';
}

/** Per-zone door only (door_right / … / empty). Does not include merged zoneDoorGroups. */
function _zoneDoorAt(sub, z) {
    if (!sub) return 'empty';
    _ensureZoneDoorSplit(sub);
    if (z >= 0 && z < sub.zonesDoor.length) {
        const t = sub.zonesDoor[z];
        return _isDoorZoneType(t) ? t : 'empty';
    }
    return 'empty';
}

/** @deprecated use _zoneInteriorAt — kept as alias for call sites expecting content */
function _zoneTypeAt(sub, z) {
    return _zoneInteriorAt(sub, z);
}

function _zoneHasAnyContent(comp, sub, z, zoneKey) {
    if (_zoneInteriorAt(sub, z) !== 'empty') return true;
    if (_zoneDoorAt(sub, z) !== 'empty') return true;
    if (comp && zoneKey && _zoneDoorGroupForKey(comp, zoneKey)) return true;
    return false;
}

/** Select every shelf-zone in a partitioned compartment (returns true if any) */
function _selectAllZonesInComp(comp) {
    if (!comp || !comp.partition || !Array.isArray(comp.subCells)) return false;
    const c = state.selection.colIndex;
    const r = state.selection.rows[0];
    _setSubCellOwner(c, r);
    const keys = new Set();
    comp.subCells.forEach((sub, si) => {
        _ensureZoneDoorSplit(sub);
        const numZones = Math.max(
            1,
            (sub && sub.shelves ? sub.shelves + 1 : 0),
            (sub && Array.isArray(sub.zonesType) ? sub.zonesType.length : 0),
            (sub && Array.isArray(sub.zonesDoor) ? sub.zonesDoor.length : 0)
        );
        for (let z = 0; z < numZones; z++) keys.add(_subKey(si, z));
    });
    _activeSubCellIdxs = keys;
    _dbgHangSnapshot('_selectAllZonesInComp');
    return keys.size > 0;
}

function _clearSubZoneContent(sub, z) {
    if (!sub) return;
    _ensureZoneDoorSplit(sub);
    while (sub.zonesType.length <= z) sub.zonesType.push('empty');
    while (sub.zonesDoor.length <= z) sub.zonesDoor.push('empty');
    sub.zonesType[z] = 'empty';
    sub.zonesDoor[z] = 'empty';
    if (Array.isArray(sub.zonesDoorStyle)) sub.zonesDoorStyle[z] = 'solid';
    if (Array.isArray(sub.zonesDoorHandleStyle) && z < sub.zonesDoorHandleStyle.length) {
        sub.zonesDoorHandleStyle[z] = null;
    }
    if (Array.isArray(sub.zonesDrawerCount) && z < sub.zonesDrawerCount.length) sub.zonesDrawerCount[z] = 0;
    const nonEmpty = sub.zonesType.filter(t => _normalizeZoneType(t) !== 'empty' && !_isDoorZoneType(t));
    sub.type = nonEmpty.length ? _normalizeZoneType(nonEmpty[0]) : 'empty';
}

/** Zone clear-height (cm) inside a partitioned sub-cell, matching engine-core zone bounds. */
function _getSubZoneHeightCm(col, r, sub, z) {
    const t = state.thickness;
    const { prevY, compH } = _getSubCellCompBounds(col, r);
    const numShelves = (sub && sub.shelves) || 0;
    if (numShelves <= 0) return Math.round(Math.max(0, compH));
    let subShelvesY;
    if (Array.isArray(sub.shelvesY) && sub.shelvesY.length === numShelves) {
        subShelvesY = sub.shelvesY;
    } else {
        subShelvesY = [];
        const zoneH = compH / (numShelves + 1);
        for (let s = 1; s <= numShelves; s++) subShelvesY.push(prevY + zoneH * s);
    }
    const compTopY = prevY + compH;
    const rawBounds = [prevY, ...subShelvesY, compTopY];
    if (z < 0 || z >= rawBounds.length - 1) return Math.round(Math.max(0, compH));
    const zoneBottomY = (z === 0) ? rawBounds[0] : (rawBounds[z] + t / 2);
    const zoneTopY = (z < subShelvesY.length) ? (rawBounds[z + 1] - t / 2) : compTopY;
    return Math.round(Math.max(0, zoneTopY - zoneBottomY));
}

function _zoneDrawerCountAt(sub, z, zoneH, drawerType) {
    if (sub && Array.isArray(sub.zonesDrawerCount) && z >= 0 && sub.zonesDrawerCount[z] > 0) {
        return sub.zonesDrawerCount[z];
    }
    const dtype = drawerType || (sub && _zoneInteriorAt(sub, z)) || 'internal_drawers';
    if (zoneH != null) {
        const auto = calcAutoDrawerCount(zoneH, dtype);
        const min = calcMinDrawerCount(zoneH, dtype);
        return Math.max(min, auto || 1);
    }
    return (sub && sub.count) || 2;
}

function _setZoneDrawerCount(sub, z, count) {
    if (!sub) return;
    if (!Array.isArray(sub.zonesDrawerCount)) sub.zonesDrawerCount = [];
    while (sub.zonesDrawerCount.length <= z) sub.zonesDrawerCount.push(0);
    sub.zonesDrawerCount[z] = count;
    sub.count = count;
}

function _syncSubTypeFromInterior(sub) {
    if (!sub || !Array.isArray(sub.zonesType)) {
        if (sub) sub.type = 'empty';
        return;
    }
    const nonEmpty = sub.zonesType.filter(t => {
        const n = _normalizeZoneType(t);
        return n !== 'empty' && !_isDoorZoneType(n);
    });
    if (nonEmpty.length === 0) sub.type = 'empty';
    else if (nonEmpty.every(t => _normalizeZoneType(t) === _normalizeZoneType(nonEmpty[0]))) {
        sub.type = _normalizeZoneType(nonEmpty[0]);
    } else {
        sub.type = _normalizeZoneType(nonEmpty[0]);
    }
}

function _finishSubCellApply(opts) {
    buildCabinet();
    if (opts && opts.activateOpenCellTab && typeof window._activateColorPartTab === 'function') {
        window._activateColorPartTab('materialOpenCell');
    }
    calculatePrice();
    saveHistoryState();
    buildDimensionsAndButtonsUI();
    updateOverlaysPosition();
    updateToolbarState();
    updateToolbarButtonHighlights();
}

function _applyMergedZoneGroup(comp, selectedKeys, subType) {
    if (!Array.isArray(comp.zoneDoorGroups)) comp.zoneDoorGroups = [];
    const existing = _findZoneDoorGroup(comp, selectedKeys);
    if (existing && existing.type === subType) {
        _removeZoneDoorGroupsForKeys(comp, selectedKeys);
        return;
    }
    _removeZoneDoorGroupsForKeys(comp, selectedKeys);
    selectedKeys.forEach(key => {
        const { si, z } = _parseSubKey(key);
        const sub = comp.subCells[si];
        if (!sub) return;
        _ensureZoneDoorSplit(sub);
        while (sub.zonesDoor.length <= z) sub.zonesDoor.push('empty');
        // Door/honeycomb merge owns the front — clear per-zone door only.
        // Keep interior content (hanging etc.) so rods stay behind doors.
        sub.zonesDoor[z] = 'empty';
        if (subType === 'honeycomb' || subType === 'open_cell' || subType === 'side_open_cell') {
            while (sub.zonesType.length <= z) sub.zonesType.push('empty');
            sub.zonesType[z] = 'empty';
            _syncSubTypeFromInterior(sub);
        }
    });
    comp.zoneDoorGroups.push({
        keys: selectedKeys,
        type: subType,
        style: subType.startsWith('door_') ? 'solid' : undefined
    });
}

window.setActiveSubCell = function(key) {
    // key is a composite string "si:z" or legacy integer si
    const compositeKey = (typeof key === 'number') ? _subKey(key, 0) : String(key);
    // Ensure owner matches current selection
    if (state.selection.colIndex >= 0 && state.selection.rows.length === 1) {
        _setSubCellOwner(state.selection.colIndex, state.selection.rows[0]);
    }
    // Every click toggles the zone in/out of the selection (multi-select by default)
    if (_activeSubCellIdxs.has(compositeKey)) {
        _activeSubCellIdxs.delete(compositeKey);
        _dbgHang('deselect zone', compositeKey);
    } else {
        _activeSubCellIdxs.add(compositeKey);
        _dbgHang('select zone', compositeKey);
    }
    _dbgHangSnapshot('after setActiveSubCell');
    buildDimensionsAndButtonsUI();
    updateOverlaysPosition();
    updateToolbarState();
    updateToolbarButtonHighlights();
};

// Select all shelf-zones within one sub-cell side (תא 1 / תא 2)
window.selectSubCellSide = function(si) {
    if (state.selection.colIndex === -1 || state.selection.rows.length !== 1) return;
    const c = state.selection.colIndex;
    const r = state.selection.rows[0];
    const comp = state.columns[c] && state.columns[c].compartments[r];
    if (!comp || !comp.partition || !Array.isArray(comp.subCells) || !comp.subCells[si]) return;
    _setSubCellOwner(c, r);
    const sub = comp.subCells[si];
    const numZones = Math.max(1, (sub.shelves || 0) + 1,
        (Array.isArray(sub.zonesType) ? sub.zonesType.length : 0));
    const next = new Set();
    // Keep selections from other sub-cell sides; replace zones on this side
    _activeSubCellIdxs.forEach(k => {
        const { si: kSi } = _parseSubKey(k);
        if (kSi !== si) next.add(k);
    });
    for (let z = 0; z < numZones; z++) next.add(_subKey(si, z));
    _activeSubCellIdxs = next;
    _dbgHangSnapshot('selectSubCellSide ' + si);
    buildDimensionsAndButtonsUI();
    updateOverlaysPosition();
    updateToolbarState();
    updateToolbarButtonHighlights();
};

// Select every shelf-zone inside the active partitioned cell
window.selectAllSubCellZones = function() {
    if (state.selection.colIndex === -1 || state.selection.rows.length !== 1) return;
    const c = state.selection.colIndex;
    const r = state.selection.rows[0];
    const comp = state.columns[c] && state.columns[c].compartments[r];
    if (!comp || !comp.partition || !Array.isArray(comp.subCells)) return;
    _setSubCellOwner(c, r);
    const keys = new Set();
    comp.subCells.forEach((sub, si) => {
        const numZones = Math.max(1, (sub && sub.shelves ? sub.shelves + 1 : 0),
            (sub && Array.isArray(sub.zonesType) ? sub.zonesType.length : 0));
        for (let z = 0; z < numZones; z++) keys.add(_subKey(si, z));
    });
    _activeSubCellIdxs = keys;
    _dbgHangSnapshot('selectAllSubCellZones');
    buildDimensionsAndButtonsUI();
    updateOverlaysPosition();
    updateToolbarState();
    updateToolbarButtonHighlights();
};

window.clearActiveSubCell = function() {
    _clearSubCellSelection();
    buildDimensionsAndButtonsUI();
    updateOverlaysPosition();
    updateToolbarState();
    updateToolbarButtonHighlights();
};

// Add one partition board to the selected cell (max 4 sub-cells = 3 boards)
window.addPartition = function() {
    if (state.selection.colIndex === -1 || state.selection.rows.length === 0) return;
    const c = state.selection.colIndex;
    const r = state.selection.rows[0];
    const comp = state.columns[c] && state.columns[c].compartments[r];
    if (!comp || !comp.partition) return;
    if (!Array.isArray(comp.partitions)) comp.partitions = [0.5];
    const n = comp.partitions.length;
    if (n >= 3) return; // max 3 boards = 4 sub-cells
    // Insert new partition evenly spaced
    const newPartitions = [];
    for (let i = 0; i <= n; i++) {
        newPartitions.push((i + 1) / (n + 2));
    }
    comp.partitions = newPartitions;
    // Ensure subCells array has n+2 entries
    if (!Array.isArray(comp.subCells)) comp.subCells = [];
    while (comp.subCells.length < n + 2) comp.subCells.push({ type: 'empty', shelves: 0 });
    buildCabinet(); calculatePrice(); saveHistoryState();
    updateToolbarButtonHighlights();
};

// Remove last partition board from the selected cell (min 1 board)
window.removePartition = function() {
    if (state.selection.colIndex === -1 || state.selection.rows.length === 0) return;
    const c = state.selection.colIndex;
    const r = state.selection.rows[0];
    const comp = state.columns[c] && state.columns[c].compartments[r];
    if (!comp || !comp.partition || !Array.isArray(comp.partitions)) return;
    if (comp.partitions.length <= 1) {
        // Remove partition entirely
        delete comp.partition;
        delete comp.partitions;
        delete comp.subCells;
        delete comp.zoneDoorGroups;
        _clearSubCellSelection();
        buildCabinet(); calculatePrice(); saveHistoryState();
        updateToolbarButtonHighlights();
        return;
    }
    comp.partitions.pop();
    if (Array.isArray(comp.subCells) && comp.subCells.length > comp.partitions.length + 1) {
        comp.subCells.length = comp.partitions.length + 1;
    }
    // Clear selection if the active sub-cell no longer exists
    const maxSi = comp.partitions.length;
    _activeSubCellIdxs.forEach(k => {
        const { si } = _parseSubKey(k);
        if (si > maxSi) _activeSubCellIdxs.delete(k);
    });
    buildCabinet(); calculatePrice(); saveHistoryState();
    updateToolbarButtonHighlights();
};

// Set content type for all active sub-cell zones (per-zone composite key "si:z" support)
// Maps open_cell → honeycomb for sub-cell context; keeps side_open_cell so the side wall can open
// opts.force: set type without toggle (used by applyContentForce)
window.setSubCellType = function(type, opts) {
    _dbgHangSnapshot('setSubCellType IN type=' + type + ' force=' + !!(opts && opts.force));
    if (state.selection.colIndex === -1 || state.selection.rows.length === 0) {
        _dbgHang('setSubCellType ABORT: no selection');
        return;
    }
    if (_activeSubCellIdxs.size === 0) {
        _dbgHang('setSubCellType ABORT: no active zones');
        return;
    }
    // 'partition' is a cell-level flag — never store it as zone content
    if (type === 'partition') {
        _dbgHang('setSubCellType ABORT: partition is cell-level only');
        return;
    }
    const c = state.selection.colIndex;
    const r = state.selection.rows[0];
    if (_activeSubCellOwner.col >= 0 && (_activeSubCellOwner.col !== c || _activeSubCellOwner.row !== r)) {
        _dbgHang('setSubCellType WARN: owner≠selection (applying to selection anyway)', {
            owner: { ..._activeSubCellOwner }, selection: { c, r }, zones: [..._activeSubCellIdxs]
        });
    }
    // Keep owner in sync with the cell we actually mutate
    _activeSubCellOwner = { col: c, row: r };
    const comp = state.columns[c] && state.columns[c].compartments[r];
    if (!comp || !comp.partition) {
        _dbgHang('setSubCellType ABORT: no partition on target cell', { c, r, hasComp: !!comp });
        return;
    }
    // Auto-create subCells if missing (e.g. legacy open_cell partitions)
    if (!Array.isArray(comp.subCells)) {
        const nSubs = Array.isArray(comp.partitions) ? comp.partitions.length + 1 : 2;
        comp.subCells = Array.from({ length: nSubs }, () => ({ type: 'empty', shelves: 0 }));
    }

    // Regular כוורת → honeycomb frame inside partition (no carcass wall punch).
    // כוורת צד stays side_open_cell so the engine opens the exposed side wall.
    const subType = (type === 'open_cell') ? 'honeycomb' : type;
    const force = !!(opts && opts.force);
    const selectedKeys = _sortedSubKeys(_activeSubCellIdxs);
    const isDoorType = _isDoorZoneType(subType);
    const isInteriorType = _INTERIOR_ZONE_TYPES.has(subType) || subType === 'empty';

    if (subType === 'side_open_cell') {
        const col = state.columns[c];
        const { prevY } = _getSubCellCompBounds(col, r);
        const { opensLeft, opensRight } = _sideOpenExposure(c, prevY);
        const nSubs = comp.subCells.length;
        const selectedSis = [...new Set(selectedKeys.map(k => _parseSubKey(k).si))];
        const canPlace = selectedSis.every(si =>
            (opensLeft && si === 0) || (opensRight && si === nSubs - 1)
        );
        if ((!opensLeft && !opensRight) || !canPlace) {
            alert('לא ניתן למקם כוורת צד כאן. הכוורת חייבת להיות בתא החיצוני של המחיצה, חשופה לאוויר (בקצה הארון או מעל גובה העמודה הסמוכה).');
            return;
        }
    }

    let activateOpenCellTab = false;

    // Clear content on selected zones (+ remove merged door groups)
    if (subType === 'empty') {
        selectedKeys.forEach(key => {
            const { si, z } = _parseSubKey(key);
            _clearSubZoneContent(comp.subCells[si], z);
        });
        _removeZoneDoorGroupsForKeys(comp, selectedKeys);
        _finishSubCellApply();
        return;
    }

    // Multiple zones + door/honeycomb → one merged unit spanning the combined area
    if (_MERGE_ZONE_TYPES.has(subType) && selectedKeys.length > 1) {
        const existingMerged = _findZoneDoorGroup(comp, selectedKeys);
        const togglingOff = !force && existingMerged && existingMerged.type === subType;
        _applyMergedZoneGroup(comp, selectedKeys, subType);
        activateOpenCellTab = (subType === 'honeycomb' || subType === 'side_open_cell') && !togglingOff;
        _finishSubCellApply({ activateOpenCellTab });
        return;
    }

    // Applying door: only touch zonesDoor / door groups — keep hanging & drawers
    if (isDoorType) {
        _removeZoneDoorGroupsForKeys(comp, selectedKeys);
        selectedKeys.forEach(key => {
            const { si, z } = _parseSubKey(key);
            const sub = comp.subCells[si];
            if (!sub) return;
            _ensureZoneDoorSplit(sub);
            while (sub.zonesDoor.length <= z) sub.zonesDoor.push('empty');
            const current = _zoneDoorAt(sub, z);
            let newDoor;
            if (force) {
                newDoor = subType;
            } else if (subType === 'door_right' && current === 'door_left') {
                newDoor = 'door_double';
            } else if (subType === 'door_left' && current === 'door_right') {
                newDoor = 'door_double';
            } else if ((subType === 'door_right' || subType === 'door_left') && current === 'door_double') {
                newDoor = 'empty';
            } else {
                newDoor = (current === subType) ? 'empty' : subType;
            }
            _dbgHang('zone door apply', JSON.stringify({ key: key, current: current, newDoor: newDoor, interior: _zoneInteriorAt(sub, z) }));
            sub.zonesDoor[z] = newDoor;
            if (newDoor === 'empty') {
                if (Array.isArray(sub.zonesDoorStyle)) sub.zonesDoorStyle[z] = 'solid';
            } else {
                if (!Array.isArray(sub.zonesDoorStyle)) sub.zonesDoorStyle = [];
                while (sub.zonesDoorStyle.length <= z) sub.zonesDoorStyle.push('solid');
            }
        });
        _dbgHangSnapshot('setSubCellType OUT (door)');
        _finishSubCellApply({ activateOpenCellTab });
        return;
    }

    // Interior content (hanging / drawers / honeycomb / …): keep doors
    if (isInteriorType) {
        // Only strip honeycomb merge groups — never strip door groups
        _removeHoneycombGroupsForKeys(comp, selectedKeys);
        selectedKeys.forEach(key => {
            const { si, z } = _parseSubKey(key);
            const sub = comp.subCells[si];
            if (!sub) return;
            _ensureZoneDoorSplit(sub);
            while (sub.zonesType.length <= z) sub.zonesType.push('empty');
            const current = _zoneInteriorAt(sub, z);
            let newType;
            if (force) {
                newType = subType;
            } else {
                newType = (current === subType) ? 'empty' : subType;
            }
            _dbgHang('zone interior apply', JSON.stringify({
                key: key, current: current, subType: subType, newType: newType,
                doorKept: _zoneDoorAt(sub, z), force: force
            }));
            if ((subType === 'honeycomb' || subType === 'side_open_cell') &&
                (newType === 'honeycomb' || newType === 'side_open_cell')) {
                activateOpenCellTab = true;
            }
            sub.zonesType[z] = newType;
            if (newType === 'internal_drawers' || newType === 'external_drawers') {
                const zoneH = _getSubZoneHeightCm(state.columns[c], r, sub, z);
                const { minH } = _drawerHeightRules(newType);
                if (zoneH < minH) {
                    sub.zonesType[z] = current;
                    _toastDrawerHeightBlocked(minH, 1);
                } else {
                    const auto = calcAutoDrawerCount(zoneH, newType);
                    const min = calcMinDrawerCount(zoneH, newType);
                    _setZoneDrawerCount(sub, z, Math.max(min, auto || 1));
                }
            } else if (Array.isArray(sub.zonesDrawerCount) && z < sub.zonesDrawerCount.length) {
                sub.zonesDrawerCount[z] = 0;
            }
            _syncSubTypeFromInterior(sub);
        });
        _dbgHangSnapshot('setSubCellType OUT (interior)');
        _finishSubCellApply({ activateOpenCellTab });
        return;
    }

    _dbgHang('setSubCellType ABORT: unknown type', subType);
};

// Helper: distribute sub-cell shelvesY evenly within a compartment's Y range
function _distributeSubCellShelves(sub, prevY, compH, numShelves) {
    if (numShelves <= 0) { sub.shelvesY = []; return; }
    const zoneH = compH / (numShelves + 1);
    sub.shelvesY = [];
    for (let s = 1; s <= numShelves; s++) {
        sub.shelvesY.push(prevY + zoneH * s);
    }
}

// Helper: get prevY and compH for a compartment row
function _getSubCellCompBounds(col, r) {
    if (typeof _compartmentBounds === 'function') {
        const b = _compartmentBounds(col, r);
        return { prevY: b.bottomY, compH: b.h };
    }
    const t = state.thickness;
    const baseY = col.type === 'desk' ? col.deskHeight + col.deskClearance : state.plinthHeight;
    const prevY = r === 0 ? baseY + t/2 : (col.shelvesY[r - 1] + t/2);
    const nextY = r >= col.compartments.length - 1 ? col.height - t/2 : (col.shelvesY[r] - t/2);
    return { prevY, compH: nextY - prevY };
}

// Update shelf count for the active sub-cell
window.updateSubCellShelves = function(delta) {
    if (state.selection.colIndex === -1 || state.selection.rows.length === 0) return;
    if (_activeSubCellIdxs.size === 0) return;
    const c = state.selection.colIndex;
    const r = state.selection.rows[0];
    const col = state.columns[c];
    const comp = col && col.compartments[r];
    if (!comp || !comp.partition || !Array.isArray(comp.subCells)) return;
    // Use the first active zone's sub-cell index
    const { si: activeSi } = _parseSubKey(_activeSubCellIdxs.values().next().value);
    const sub = comp.subCells[activeSi];
    if (!sub) return;
    const newCount = Math.max(0, Math.min(8, (sub.shelves || 0) + delta));
    sub.shelves = newCount;
    // Redistribute shelvesY evenly
    const { prevY, compH } = _getSubCellCompBounds(col, r);
    _distributeSubCellShelves(sub, prevY, compH, newCount);
    // After shelf count changes, resize zone arrays (preserve existing values)
    _ensureZoneDoorSplit(sub);
    const newZones = newCount + 1;
    while (sub.zonesType.length < newZones) sub.zonesType.push('empty');
    while (sub.zonesDoor.length < newZones) sub.zonesDoor.push('empty');
    if (!Array.isArray(sub.zonesDrawerCount)) sub.zonesDrawerCount = [];
    while (sub.zonesDrawerCount.length < newZones) sub.zonesDrawerCount.push(0);
    if (sub.zonesType.length > newZones) sub.zonesType.length = newZones;
    if (sub.zonesDoor.length > newZones) sub.zonesDoor.length = newZones;
    if (sub.zonesDrawerCount.length > newZones) sub.zonesDrawerCount.length = newZones;
    // Update active key to zone 0 of same sub-cell (shelf zones reset)
    _activeSubCellIdxs = new Set([_subKey(activeSi, 0)]);
    buildCabinet(); calculatePrice(); saveHistoryState();
};

// Legacy stubs — kept for backward compatibility with any saved HTML onclick references
window.closeSubcellToolbarUser = function() {
    _clearSubCellSelection();
    updateToolbarButtonHighlights();
};
window.openSubcellToolbar = function() {};
window.closeSubcellToolbar = function() {};

window.closeContentSubPanels = function() {
    ['hanging-sub-panel','drawer-sub-panel','honeycomb-sub-panel','appliances-sub-panel',
     'door-style-panel-right','door-style-panel-left','door-style-panel-double'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });
    // Clear trigger button highlights
    ['tb-btn-hanging','tb-btn-drawer','tb-btn-honeycomb','tb-btn-appliances'].forEach(id => {
        const btn = document.getElementById(id);
        if (btn) btn.classList.remove('sub-panel-open');
    });
    // Also restore main toolbar section if subcell toolbar is open
    closeSubcellToolbar();
};

function _laundryFrontInset() {
    if (state.presetId === 'sliding' && state.slidingDoor && state.slidingDoor.enabled) return 6;
    return (state.cabinetModel === 'ab2' || state.cabinetModel === 'ab2_nohoney') ? (state.thickness || 1.7) : 0;
}

/** True when the cell's washer/dryer sticks out past the cabinet front, so no door can close over it. */
function _cellApplianceBlocksDoor(col, r) {
    const comp = col && col.compartments && col.compartments[r];
    if (!comp || comp.partition || !Array.isArray(comp.appliances) || !comp.appliances.length) return false;
    if (typeof window._laundryProtrudes !== 'function') return false;
    return window._laundryProtrudes(comp.appliances, col.width, _cellHeight(col, r), state.depth || 54, _laundryFrontInset());
}
window._cellApplianceBlocksDoor = _cellApplianceBlocksDoor;

/** Drop doors covering cells whose appliances protrude. Returns the number of doors removed. */
function _removeDoorsBlockedByAppliances(colIndex) {
    let removed = 0;
    state.columns.forEach((col, c) => {
        if (colIndex != null && c !== colIndex) return;
        if (!col || !Array.isArray(col.doors) || !col.doors.length) return;
        const before = col.doors.length;
        col.doors = col.doors.filter(d => {
            for (let r = d.startRow; r <= d.endRow; r++) if (_cellApplianceBlocksDoor(col, r)) return false;
            return true;
        });
        removed += before - col.doors.length;
    });
    return removed;
}
window._removeDoorsBlockedByAppliances = _removeDoorsBlockedByAppliances;

// Toggle a laundry appliance in the selected cell(s). Both can be marked only when the
// cell is tall enough to stack them; otherwise the new pick replaces the old one.
// Selection is kept so the user can mark the second appliance right away.
window.toggleCellAppliance = function(type) {
    const R = window.LAUNDRY_RULES;
    if (!R || !R.dims[type]) return;
    if (state.selection.colIndex === -1 || state.selection.rows.length === 0) return;
    const col = state.columns[state.selection.colIndex];
    if (!col) return;
    const names = { washer: 'מכונת כביסה', dryer: 'מייבש' };
    const fmt = v => (Math.round(v * 10) / 10).toString();

    if (col.width < R.minWidth) {
        _showToast(`רוחב התא ${fmt(col.width)} ס"מ — ל${names[type]} נדרש רוחב פנימי של ${R.minWidth} ס"מ לפחות`, 4500);
        return;
    }

    const rows = state.selection.rows;
    const first = col.compartments[rows[0]];
    const turnOn = !(first && !first.partition && Array.isArray(first.appliances) && first.appliances.includes(type));
    let changed = 0, tooShortH = null, swappedH = null, clearedPartition = false;

    rows.forEach(r => {
        const comp = col.compartments[r];
        if (!comp) return;
        const others = (!comp.partition && Array.isArray(comp.appliances)) ? comp.appliances.filter(t => t !== type) : [];
        if (!turnOn) {
            if (others.length) comp.appliances = others; else delete comp.appliances;
            changed++;
            return;
        }
        const h = _cellHeight(col, r);
        if (h < R.singleHeight) { tooShortH = h; return; }
        let next = others.concat(type);
        if (next.length > 1 && h < R.stackHeight) { next = [type]; swappedH = h; }
        comp.appliances = ['washer', 'dryer'].filter(t => next.includes(t));
        delete comp.tv;
        comp.type = 'empty';
        if (comp.partition) clearedPartition = true;
        delete comp.partition;
        delete comp.partitions;
        delete comp.subCells;
        delete comp.zoneDoorGroups;
        if (typeof _onCompartmentTypeChangedForDeskMerge === 'function') {
            _onCompartmentTypeChangedForDeskMerge(comp, r, state.selection.colIndex);
        }
        changed++;
    });

    if (tooShortH !== null) {
        _showToast(`גובה התא ${fmt(tooShortH)} ס"מ — ל${names[type]} נדרש גובה של ${R.singleHeight} ס"מ לפחות`, 4500);
    } else if (swappedH !== null) {
        _showToast(`גובה התא ${fmt(swappedH)} ס"מ — מכונה ומייבש יחד דורשים ${R.stackHeight} ס"מ לפחות, לכן הוכנס רק ${names[type]}`, 5000);
    }
    if (!changed) return;
    if (turnOn && tooShortH === null && rows.some(r => _cellApplianceBlocksDoor(col, r))) {
        const removedDoors = _removeDoorsBlockedByAppliances(state.selection.colIndex);
        if (swappedH === null) {
            _showToast(`עומק הארון ${fmt(state.depth || 54)} ס"מ — המכשיר בולט מחזית הארון, לכן לא ניתן להתקין דלת על התא` +
                (removedDoors ? ' (הדלת הוסרה)' : ''), 5000);
        }
    }
    if (clearedPartition && typeof _clearSubCellSelection === 'function') _clearSubCellSelection();
    buildCabinet(); calculatePrice(); saveHistoryState();
    updateToolbarButtonHighlights();
};

const _isHoneycombCompType = tp => tp === 'open_cell' || tp === 'side_open_cell';

/** Clear space for a TV: inside the honeycomb frame boards when the cell has a honeycomb (matches the 3D frame). */
function _tvCellSpace(col, r) {
    const comp = col.compartments[r];
    let w = col.width, h = _cellHeight(col, r);
    if (comp && _isHoneycombCompType(comp.type)) {
        const t = state.thickness || 1.7;
        const below = col.compartments[r - 1], above = col.compartments[r + 1];
        w -= 2 * t;
        h -= (below && below.type === comp.type ? 0 : t) + (above && above.type === comp.type ? 0 : t);
    }
    return { w, h };
}

/** Whole-cell items (TV) replace the cell interior, except a honeycomb frame which they sit inside. */
function _clearCompForWholeCellItem(comp, r, colIndex) {
    if (!_isHoneycombCompType(comp.type)) comp.type = 'empty';
    const hadPartition = !!comp.partition;
    delete comp.partition;
    delete comp.partitions;
    delete comp.subCells;
    delete comp.zoneDoorGroups;
    if (typeof _onCompartmentTypeChangedForDeskMerge === 'function') {
        _onCompartmentTypeChangedForDeskMerge(comp, r, colIndex);
    }
    return hadPartition;
}

// Toggle a TV in the selected cell(s); inserted at the largest size that fits.
window.toggleCellTv = function() {
    if (state.selection.colIndex === -1 || state.selection.rows.length === 0) return;
    if (typeof window._tvLargestFit !== 'function') return;
    const c = state.selection.colIndex;
    const col = state.columns[c];
    if (!col) return;
    const rows = state.selection.rows;
    const first = col.compartments[rows[0]];
    const turnOn = !(first && !first.partition && first.tv);
    let changed = 0, noFit = false, inserted = null, clearedPartition = false;

    rows.forEach(r => {
        const comp = col.compartments[r];
        if (!comp) return;
        if (!turnOn) { delete comp.tv; changed++; return; }
        const sp = _tvCellSpace(col, r);
        const inch = window._tvLargestFit(sp.w, sp.h);
        if (!inch) { noFit = true; return; }
        comp.tv = { inch: inch };
        delete comp.appliances;
        if (_clearCompForWholeCellItem(comp, r, c)) clearedPartition = true;
        inserted = inch;
        changed++;
    });

    if (noFit) {
        const need = window._tvDims(window.TV_SIZES[0]);
        _showToast(`התא קטן מדי לטלוויזיה — לטלוויזיה ${window.TV_SIZES[0]}″ נדרש רוחב פנימי של ${Math.ceil(need.W + 1)} ס"מ וגובה של ${Math.ceil(need.totalH + 0.5)} ס"מ לפחות`, 5000);
    } else if (inserted) {
        _showToast(`הוכנסה טלוויזיה ${inserted}″ — לשינוי הגודל לחץ על האייקון שעל המסך`, 4000);
    }
    if (!changed) return;
    if (clearedPartition && typeof _clearSubCellSelection === 'function') _clearSubCellSelection();
    buildCabinet(); calculatePrice(); saveHistoryState();
    updateToolbarButtonHighlights();
};

function _closeTvSizeMenu() {
    const m = document.getElementById('tv-size-menu');
    if (m) m.remove();
    document.removeEventListener('pointerdown', _tvMenuOutside, true);
}
function _tvMenuOutside(e) {
    const m = document.getElementById('tv-size-menu');
    if (m && !m.contains(e.target) && !(e.target.closest && e.target.closest('.tv-size-btn'))) _closeTvSizeMenu();
}

function _openTvSizeMenu(colIndex, rowIndex, anchor) {
    const wasOpen = document.getElementById('tv-size-menu');
    _closeTvSizeMenu();
    if (wasOpen && wasOpen.dataset.key === colIndex + ':' + rowIndex) return;
    const col = state.columns[colIndex];
    const comp = col && col.compartments[rowIndex];
    if (!comp || !comp.tv) return;
    const sp = _tvCellSpace(col, rowIndex);
    const shown = window._tvFits(comp.tv.inch, sp.w, sp.h) ? comp.tv.inch : window._tvLargestFit(sp.w, sp.h);

    const menu = document.createElement('div');
    menu.id = 'tv-size-menu';
    menu.dataset.key = colIndex + ':' + rowIndex;
    menu.innerHTML = '<div class="tv-size-title">גודל מסך (אינץ׳)</div>';
    const grid = document.createElement('div');
    grid.className = 'tv-size-grid';
    window.TV_SIZES.forEach(s => {
        const d = window._tvDims(s);
        const fits = window._tvFits(s, sp.w, sp.h);
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'tv-size-opt' + (s === shown ? ' active' : '');
        b.disabled = !fits;
        b.textContent = s + '″';
        b.title = fits
            ? `${Math.round(d.W)} × ${Math.round(d.totalH)} ס"מ (כולל מעמד)`
            : `דורש תא ברוחב ${Math.ceil(d.W + 1)} ס"מ ובגובה ${Math.ceil(d.totalH + 0.5)} ס"מ`;
        b.addEventListener('click', e => {
            e.stopPropagation();
            comp.tv = { inch: s, floating: !!comp.tv.floating };
            _closeTvSizeMenu();
            buildCabinet(); calculatePrice(); saveHistoryState();
        });
        grid.appendChild(b);
    });
    menu.appendChild(grid);
    const floatBtn = document.createElement('button');
    floatBtn.type = 'button';
    floatBtn.className = 'tv-float-opt' + (comp.tv.floating ? ' active' : '');
    floatBtn.innerHTML = '<i class="fa-solid ' + (comp.tv.floating ? 'fa-square-check' : 'fa-square') + '"></i><span>מרחפת (ללא רגליים)</span>';
    floatBtn.title = 'מסתיר את הרגליים — המסך נשאר באותו גובה, כאילו מחובר בזרוע נסתרת מאחור';
    floatBtn.addEventListener('click', e => {
        e.stopPropagation();
        comp.tv = { inch: comp.tv.inch, floating: !comp.tv.floating };
        _closeTvSizeMenu();
        buildCabinet(); calculatePrice(); saveHistoryState();
    });
    if (window.TV_SIZES.some(s => !window._tvFits(s, col.width, cellH))) {
        const note = document.createElement('div');
        note.className = 'tv-size-note';
        note.textContent = 'גדלים מושבתים דורשים תא גדול יותר';
        menu.appendChild(note);
    }
    menu.appendChild(floatBtn);
    document.body.appendChild(menu);
    const rect = anchor.getBoundingClientRect();
    const mw = menu.offsetWidth, mh = menu.offsetHeight;
    let left = rect.left + rect.width / 2 - mw / 2;
    let top = rect.bottom + 8;
    if (top + mh > window.innerHeight - 8) top = rect.top - mh - 8;
    left = Math.max(8, Math.min(window.innerWidth - mw - 8, left));
    menu.style.left = left + 'px';
    menu.style.top = Math.max(8, top) + 'px';
    setTimeout(() => document.addEventListener('pointerdown', _tvMenuOutside, true), 0);
}
window._openTvSizeMenu = _openTvSizeMenu;

// applyContentForce: always sets the type (no toggle) — used by sub-panel buttons
// When _activeSubCellIdx is set, routes to setSubCellType instead
window.applyContentForce = function(type) {
    _dbgHangSnapshot('applyContentForce IN type=' + type);
    if (state.selection.colIndex === -1 || state.selection.rows.length === 0) {
        _dbgHang('applyContentForce ABORT: no selection');
        return;
    }
    if (_isDeskZoneSelection()) {
        if (type === 'open_cell' && !state.columns[state.selection.colIndex].deskHoneycomb) window.toggleDeskHoneycomb(state.selection.colIndex);
        return;
    }

    // Partition is cell-level only — never apply as zone content
    if (type === 'partition') {
        window.applyContent('partition');
        return;
    }

    // Route to sub-cell if a sub-cell is active
    if (_activeSubCellIdxs.size > 0) {
        _dbgHang('applyContentForce → setSubCellType (active zones)');
        setSubCellType(type, { force: true });
        _dbgHangSnapshot('applyContentForce OUT after setSubCellType');
        return;
    }

    // Guard: partitioned cell without zone selection → apply to all zones (don't destroy partition)
    const _guardComp = state.columns[state.selection.colIndex] &&
                       state.columns[state.selection.colIndex].compartments[state.selection.rows[0]];
    const _isHoneycombType = (type === 'open_cell' || type === 'side_open_cell');
    if (_guardComp && _guardComp.partition && !_isHoneycombType) {
        _dbgHang('applyContentForce: partitioned cell, auto-select all zones');
        if (_selectAllZonesInComp(_guardComp)) {
            setSubCellType(type, { force: true });
            _dbgHangSnapshot('applyContentForce OUT after auto-all zones');
            return;
        }
        _showToast('יש לבחור אזור אחד או יותר במחיצה (לחץ על + בכל אזור, או "בחר הכל")', 4500);
        return;
    }

    const c = state.selection.colIndex;

    // side_open_cell: validate that the cell is exposed to air on at least one side
    if (type === 'side_open_cell') {
        const col = state.columns[c];
        const startR = Math.min(...state.selection.rows);
        const baseY = (col.type === 'desk') ? col.deskHeight + col.deskClearance : state.plinthHeight;
        const bottomY = (startR === 0) ? baseY + state.thickness : col.shelvesY[startR - 1] + state.thickness / 2;
        const canOpenLeft  = (c === 0) || (state.columns[c - 1] && state.columns[c - 1].height <= bottomY + 0.5);
        const canOpenRight = (c === state.columns.length - 1) || (state.columns[c + 1] && state.columns[c + 1].height <= bottomY + 0.5);
        if (!canOpenLeft && !canOpenRight) {
            alert('לא ניתן למקם כוורת צד כאן. הכוורת חייבת להיות חשופה לאוויר (או בקצה הארון, או ממוקמת מעל גובה העמודה הסמוכה לה).');
            return;
        }
    }

    // Sorbet: minimum cell height 110cm
    if (type === 'sorbet') {
        const col = state.columns[c];
        const blocked = state.selection.rows.some(r => _cellHeight(col, r) < 110);
        if (blocked) {
            alert('סורבטו דורש גובה תא מינימלי של 110 ס"מ. הגדל את גובה התא ונסה שוב.');
            return;
        }
    }

    const col = state.columns[c];
    let blockedCount = 0;

    state.selection.rows.forEach(r => {
        if (!col.compartments[r]) return;
        const newType = type;

        if ((newType === 'internal_drawers' || newType === 'external_drawers')) {
            const cellH = _cellHeight(col, r);
            const { minH } = _drawerHeightRules(newType);
            if (cellH < minH) {
                blockedCount++;
                return;
            }
            col.compartments[r].type = newType;
            col.compartments[r].count = calcAutoDrawerCount(cellH, newType);
        } else {
            col.compartments[r].type = newType;
        }
        delete col.compartments[r].appliances;
        if (!_isHoneycombCompType(newType)) delete col.compartments[r].tv;

        // Clear partition data when switching to types that are incompatible with partitions
        if (newType === 'external_drawers' || newType === 'hanging' || newType === 'sorbet' || newType === 'empty' ||
            newType === 'open_cell' || newType === 'side_open_cell') {
            delete col.compartments[r].partition;
            delete col.compartments[r].partitions;
            delete col.compartments[r].subCells;
        }

        const finalType = col.compartments[r].type;
        if (finalType === 'external_drawers' || finalType === 'open_cell' || finalType === 'side_open_cell') {
            col.doors = col.doors.filter(door => (r < door.startRow || r > door.endRow));
        }
        if (typeof _onCompartmentTypeChangedForDeskMerge === 'function') {
            _onCompartmentTypeChangedForDeskMerge(col.compartments[r], r, state.selection.colIndex);
        }
    });

    if (blockedCount > 0) {
        const { minH } = _drawerHeightRules(type);
        _toastDrawerHeightBlocked(minH, 1);
    }

    // Clear selection BEFORE buildCabinet so the render has no highlight
    // Keep selection for drawer types so the drawer-count section stays visible
    const _keepsSelSCT = ['internal_drawers', 'external_drawers'];
    if (!_keepsSelSCT.includes(type)) {
        state.selection = { colIndex: -1, rows: [] };
        closeContentSubPanels();
    }
    buildCabinet(); calculatePrice(); saveHistoryState();
};

/** Enable partition on a compartment (migrate hanging/drawers into both sides when possible). */
function _enablePartitionOnComp(comp) {
    if (!comp) return;
    delete comp.appliances;
    delete comp.tv;
    if (comp.partition) {
        if (!Array.isArray(comp.partitions) || !comp.partitions.length) comp.partitions = [0.5];
        if (!Array.isArray(comp.subCells) || comp.subCells.length < comp.partitions.length + 1) {
            const n = comp.partitions.length + 1;
            if (!Array.isArray(comp.subCells)) comp.subCells = [];
            while (comp.subCells.length < n) comp.subCells.push({ type: 'empty', shelves: 0 });
        }
        return;
    }
    const prevType = comp.type || 'empty';
    const migratable = (prevType === 'hanging' || prevType === 'sorbet' ||
        prevType === 'internal_drawers' || prevType === 'external_drawers');
    comp.partition = true;
    comp.partitions = [0.5];
    if (migratable) {
        const left = { type: prevType, shelves: 0, zonesType: [prevType] };
        const right = { type: prevType, shelves: 0, zonesType: [prevType] };
        if (typeof comp.count === 'number' && comp.count > 0 &&
            (prevType === 'internal_drawers' || prevType === 'external_drawers')) {
            left.count = comp.count;
            right.count = comp.count;
        }
        if (comp.handleStyle) {
            left.handleStyle = comp.handleStyle;
            right.handleStyle = comp.handleStyle;
        }
        comp.subCells = [left, right];
        comp.type = 'empty';
    } else {
        comp.subCells = [{ type: 'empty', shelves: 0 }, { type: 'empty', shelves: 0 }];
    }
}

/** Dividers in compartment order (shelves + optional קושרת), matching _compartmentBounds. */
function _partitionDividerMeta(col) {
    const t = state.thickness || 1.7;
    const baseY = (typeof _columnBaseY === 'function') ? _columnBaseY(col) : (state.plinthHeight || 0);
    const items = [];
    (col.shelvesY || []).forEach((y, shelfIdx) => {
        items.push({ y: y, kind: 'shelf', shelfIdx: shelfIdx });
    });
    if (typeof _hasActiveSplit === 'function' ? _hasActiveSplit(col, baseY, t) : !!(col.splitY)) {
        items.push({ y: col.splitY, kind: 'split', shelfIdx: -1 });
    }
    items.sort((a, b) => a.y - b.y);
    return items;
}

/**
 * Merge consecutive selected rows into one cell, delete shelves between them, apply partition.
 * @returns {{ ok: true, row: number } | { ok: false, reason: string }}
 */
function _mergeAdjacentRowsIntoPartition(col, rows) {
    if (!col || !rows || rows.length < 2) return { ok: false, reason: 'too-few' };
    const sel = rows.slice().sort((a, b) => a - b);
    const startR = sel[0];
    const endR = sel[sel.length - 1];
    if (endR - startR + 1 !== sel.length) return { ok: false, reason: 'not-consecutive' };

    if (!Array.isArray(col.compartments)) col.compartments = [];
    while (col.compartments.length <= endR) col.compartments.push(
        (typeof _emptyCompartment === 'function') ? _emptyCompartment() : { type: 'empty' }
    );

    const dividers = _partitionDividerMeta(col);
    for (let i = startR; i < endR; i++) {
        if (!dividers[i]) return { ok: false, reason: 'missing-divider' };
        if (dividers[i].kind === 'split') return { ok: false, reason: 'crosses-split' };
    }

    // Prefer migratable / already-partitioned content from the selection (clone before splice)
    const _MIG = new Set(['hanging', 'sorbet', 'internal_drawers', 'external_drawers']);
    let seedComp = col.compartments[startR];
    for (let r = startR; r <= endR; r++) {
        const comp = col.compartments[r];
        if (comp && comp.partition && Array.isArray(comp.subCells)) {
            seedComp = comp;
            break;
        }
    }
    if (!(seedComp && seedComp.partition)) {
        for (let r = startR; r <= endR; r++) {
            const comp = col.compartments[r];
            if (comp && _MIG.has(comp.type)) {
                seedComp = comp;
                break;
            }
        }
    }
    const seedClone = JSON.parse(JSON.stringify(seedComp || { type: 'empty' }));

    // Expand doors that touch the span so they shrink onto the merged row
    if (Array.isArray(col.doors)) {
        col.doors.forEach(d => {
            if (!d) return;
            if (d.endRow < startR || d.startRow > endR) return;
            d.startRow = Math.min(d.startRow, startR);
            d.endRow = Math.max(d.endRow, endR);
        });
    }

    // Remove compartments from top of span down (keep startR)
    for (let r = endR; r > startR; r--) {
        col.compartments.splice(r, 1);
        if (typeof _shiftDoorsRemove === 'function') _shiftDoorsRemove(col, r);
    }

    // Remove shelves between the cells (high shelf index first)
    const shelfIdxs = [];
    for (let i = startR; i < endR; i++) {
        if (dividers[i] && dividers[i].kind === 'shelf') shelfIdxs.push(dividers[i].shelfIdx);
    }
    shelfIdxs.sort((a, b) => b - a);
    if (!Array.isArray(col.shelvesY)) col.shelvesY = [];
    shelfIdxs.forEach(si => {
        if (si >= 0 && si < col.shelvesY.length) col.shelvesY.splice(si, 1);
    });
    col.shelves = col.shelvesY.length;

    col.compartments[startR] = seedClone;
    _enablePartitionOnComp(seedClone);

    const t = state.thickness || 1.7;
    const baseY = (typeof _columnBaseY === 'function') ? _columnBaseY(col) : (state.plinthHeight || 0);
    if (typeof _syncCompartmentCount === 'function') _syncCompartmentCount(col, baseY, t);
    if (typeof _clampDrawerCompartments === 'function') _clampDrawerCompartments(col, baseY, t);
    if (typeof _migratePartitions === 'function') _migratePartitions(col);

    _dbgHang('partition MERGE rows', { startR, endR, shelvesLeft: col.shelves });
    return { ok: true, row: startR };
}

window.applyContent = function(type) {
    _dbgHangSnapshot('applyContent IN type=' + type);
    if (state.selection.colIndex === -1 || state.selection.rows.length === 0) {
        _dbgHang('applyContent ABORT: no selection');
        return;
    }
    if (_isDeskZoneSelection()) {
        if (type === 'open_cell') window.toggleDeskHoneycomb(state.selection.colIndex);
        return;
    }

    const c = state.selection.colIndex;

    // Partition is always cell-level — never store as zone content via setSubCellType
    if (type === 'partition') {
        _dbgHang('applyContent partition toggle on col', c, 'rows', state.selection.rows.slice());
        const col = state.columns[c];
        if (!col) return;

        // 2+ adjacent cells → remove shelves between them and make ONE partitioned cell
        if (state.selection.rows.length >= 2) {
            const merged = _mergeAdjacentRowsIntoPartition(col, state.selection.rows);
            if (!merged.ok) {
                if (merged.reason === 'not-consecutive') {
                    _showToast('יש לבחור תאים רצופים באותה עמודה כדי לאחד למחיצה', 4000);
                } else if (merged.reason === 'crosses-split') {
                    _showToast('לא ניתן לאחד תאים מעל ומתחת לקושרת', 4000);
                }
                return;
            }
            state.selection.rows = [merged.row];
            _clearSubCellSelection();
            buildCabinet(); calculatePrice(); saveHistoryState();
            updateToolbarButtonHighlights();
            return;
        }

        state.selection.rows.forEach(r => {
            const comp = state.columns[c].compartments[r];
            if (!comp) return;
            if (comp.partition) {
                delete comp.partition;
                delete comp.partitions;
                delete comp.subCells;
                delete comp.zoneDoorGroups;
                _clearSubCellSelection();
                _dbgHang('partition OFF', { c, r });
                } else {
                    _enablePartitionOnComp(comp);
                    _dbgHang('partition ON', { c, r, prevType: comp.type, onlyThisCol: true });
                }
        });
        // Sanity: log neighboring columns' partition flags (detect accidental multi-col apply)
        state.columns.forEach(function (colScan, ci) {
            (colScan.compartments || []).forEach(function (comp, ri) {
                if (comp && comp.partition) _dbgHang('partition present at', { col: ci, row: ri });
            });
        });
        buildCabinet(); calculatePrice(); saveHistoryState();
        updateToolbarButtonHighlights();
        return;
    }

    // Route to sub-cell if a sub-cell is active
    if (_activeSubCellIdxs.size > 0) {
        _dbgHang('applyContent → setSubCellType (active zones)');
        setSubCellType(type);
        return;
    }

    // Partitioned cell without zone selection → apply to all zones (keep partition)
    if (type !== 'open_cell' && type !== 'side_open_cell') {
        const _guardComp2 = state.columns[c] && state.columns[c].compartments[state.selection.rows[0]];
        if (_guardComp2 && _guardComp2.partition) {
            _dbgHang('applyContent: partitioned cell, auto-select all zones');
            if (_selectAllZonesInComp(_guardComp2)) {
                setSubCellType(type);
                return;
            }
            _showToast('יש לבחור אזור אחד או יותר במחיצה (לחץ על + בכל אזור, או "בחר הכל")', 4500);
            return;
        }
    }

    if (type === 'side_open_cell') {
        const col = state.columns[c];
        const startR = Math.min(...state.selection.rows);
        const baseY = (col.type === 'desk') ? col.deskHeight + col.deskClearance : state.plinthHeight;
        let bottomY = (startR === 0) ? baseY + state.thickness : col.shelvesY[startR - 1] + state.thickness/2;
        
        let canOpenLeft = (c === 0) || (state.columns[c-1] && state.columns[c-1].height <= bottomY + 0.5);
        let canOpenRight = (c === state.columns.length - 1) || (state.columns[c+1] && state.columns[c+1].height <= bottomY + 0.5);

        if (!canOpenLeft && !canOpenRight) {
            alert('לא ניתן למקם כוורת צד כאן. הכוורת חייבת להיות חשופה לאוויר (או בקצה הארון, או ממוקמת מעל גובה העמודה הסמוכה לה).');
            return;
        }
    }

    // Sorbet: minimum cell height 110cm
    if (type === 'sorbet') {
        const col = state.columns[c];
        const blocked = state.selection.rows.some(r => _cellHeight(col, r) < 110);
        if (blocked) {
            alert('סורבטו דורש גובה תא מינימלי של 110 ס"מ. הגדל את גובה התא ונסה שוב.');
            return;
        }
    }
    
    const col = state.columns[c];
    let blockedCount = 0;

    state.selection.rows.forEach(r => {
        if (!col.compartments[r]) return;
        const currentType = col.compartments[r].type;
        const newType = (currentType === type) ? 'empty' : type;

        // Block drawer assignment if cell is too short
        if ((newType === 'internal_drawers' || newType === 'external_drawers') && newType !== 'empty') {
            const cellH = _cellHeight(col, r);
            const { minH } = _drawerHeightRules(newType);
            if (cellH < minH) {
                blockedCount++;
                return; // skip this row
            }
            // Auto-set drawer count based on cell height
            col.compartments[r].type = newType;
            col.compartments[r].count = calcAutoDrawerCount(cellH, newType);
        } else {
            col.compartments[r].type = newType;
        }
        if (newType !== 'empty') {
            delete col.compartments[r].appliances;
            if (!_isHoneycombCompType(newType)) delete col.compartments[r].tv;
        }

        // Clear partition when switching to incompatible types
        if (newType === 'external_drawers' || newType === 'hanging' || newType === 'sorbet' || newType === 'empty') {
            delete col.compartments[r].partition;
            delete col.compartments[r].partitions;
            delete col.compartments[r].subCells;
        }

        const finalType = col.compartments[r].type;
        if (finalType === 'external_drawers' || finalType === 'open_cell' || finalType === 'side_open_cell') {
            col.doors = col.doors.filter(door => (r < door.startRow || r > door.endRow));
        }
        if (typeof _onCompartmentTypeChangedForDeskMerge === 'function') {
            _onCompartmentTypeChangedForDeskMerge(col.compartments[r], r, state.selection.colIndex);
        }
    });

    if (blockedCount > 0) {
        const { minH } = _drawerHeightRules(type);
        _toastDrawerHeightBlocked(minH, 1);
    }

    // Clear selection BEFORE buildCabinet for simple types; keep for types that open sub-panels
    // 'partition' keeps selection so subcell panel stays visible
    // 'hanging', 'external_drawers', 'honeycomb' keep selection so style sub-panel can be used
    // 'internal_drawers' keeps selection so drawer-count section stays visible
    const keepsSelection = ['partition', 'hanging', 'external_drawers', 'honeycomb', 'internal_drawers'];
    if (!keepsSelection.includes(type)) {
        state.selection = { colIndex: -1, rows: [] };
        closeContentSubPanels();
    }
    buildCabinet(); calculatePrice(); saveHistoryState();
};

// Legacy stub — kept for backward compatibility
window.applySubCellContent = function(side, type) {
    const idx = (side === 'left') ? 0 : 1;
    const prevKeys = new Set(_activeSubCellIdxs);
    _activeSubCellIdxs = new Set([_subKey(idx, 0)]);
    setSubCellType(type);
    _activeSubCellIdxs = prevKeys;
};

window.applyDoor = function(type) {
    if (state.selection.colIndex === -1 || state.selection.rows.length === 0) return;
    const c = state.selection.colIndex;

    // Route to sub-cell zones when partition sub-cells are selected
    if (_activeSubCellIdxs.size > 0) {
        const _subDoorMap = { empty: 'empty', right: 'door_right', left: 'door_left', double: 'door_double', flap: 'door_flap' };
        const _partRow = Math.min(...state.selection.rows);
        state.columns[c].doors = state.columns[c].doors.filter(door => _partRow < door.startRow || _partRow > door.endRow);
        if (type === 'empty') {
            // Clear doors only — keep hanging / drawers inside
            const comp = state.columns[c].compartments[_partRow];
            const keys = _sortedSubKeys(_activeSubCellIdxs);
            keys.forEach(key => {
                const { si, z } = _parseSubKey(key);
                const sub = comp && comp.subCells && comp.subCells[si];
                if (!sub) return;
                _ensureZoneDoorSplit(sub);
                while (sub.zonesDoor.length <= z) sub.zonesDoor.push('empty');
                sub.zonesDoor[z] = 'empty';
                if (Array.isArray(sub.zonesDoorStyle)) sub.zonesDoorStyle[z] = 'solid';
            });
            if (comp) _removeZoneDoorGroupsForKeys(comp, keys);
            _finishSubCellApply();
            return;
        }
        setSubCellType(_subDoorMap[type] || type);
        return;
    }

    // When a whole partitioned cell is selected (no specific zones), apply a normal
    // column overlay door that covers the partition — same as multi-cell spans.
    // Per-zone doors are only used when the user explicitly selected partition zones (+).

    let startR = Math.min(...state.selection.rows);
    let endR = Math.max(...state.selection.rows);

    // Minimum column width for a door is 20 cm
    const MIN_DOOR_WIDTH = 20;
    if (type !== 'empty' && state.columns[c].width < MIN_DOOR_WIDTH) {
        alert(`לא ניתן להתקין דלת על פתח פחות מ-${MIN_DOOR_WIDTH} ס"מ (רוחב נוכחי: ${Math.round(state.columns[c].width)} ס"מ).`);
        return;
    }

    // Overlay doors are independent of the internal קושרת — they may span upper and
    // lower units together. The only limit is a 270 cm maximum door height.
    if (type !== 'empty') {
        const col = state.columns[c];
        const doorH = (typeof overlayDoorHeightCm === 'function')
            ? overlayDoorHeightCm(col, startR, endR)
            : (endR - startR + 1) * 30;
        const maxDoorH = (typeof MAX_OVERLAY_DOOR_HEIGHT !== 'undefined') ? MAX_OVERLAY_DOOR_HEIGHT : 270;
        if (doorH > maxDoorH + 0.05) {
            alert(`לא ניתן להתקין דלת מעל ${maxDoorH} ס"מ (גובה נוכחי: ${Math.round(doorH)} ס"מ).`);
            return;
        }
    }

    let hasOpenCell = false;
    for(let r = startR; r <= endR; r++) {
        const compType = state.columns[c].compartments[r] && state.columns[c].compartments[r].type;
        if(compType === 'open_cell' || compType === 'side_open_cell') hasOpenCell = true;
    }
    if (hasOpenCell && type !== 'empty') {
        alert('לא ניתן להתקין דלתות על אזור שמוגדר ככוורת.');
        return;
    }

    if (type !== 'empty') {
        for (let r = startR; r <= endR; r++) {
            if (_cellApplianceBlocksDoor(state.columns[c], r)) {
                _showToast(`לא ניתן להתקין דלת על תא עם מכונת כביסה / מייבש שבולטים מחזית הארון (עומק הארון ${state.depth} ס"מ)`, 5000);
                return;
            }
        }
    }

    const existingDoorIdx = state.columns[c].doors.findIndex(door => {
        return state.selection.rows.some(r => r >= door.startRow && r <= door.endRow);
    });
    
    const isSameType = existingDoorIdx > -1 && state.columns[c].doors[existingDoorIdx].type === type;

    state.columns[c].doors = state.columns[c].doors.filter(door => {
        return !state.selection.rows.some(r => r >= door.startRow && r <= door.endRow);
    });
    
    if (type !== 'empty' && !isSameType) {
        state.columns[c].doors.push({ startRow: startR, endRow: endR, type: type });
        state.selection.rows.forEach(r => {
            if (state.columns[c].compartments[r] && state.columns[c].compartments[r].type === 'external_drawers') {
                state.columns[c].compartments[r].type = 'empty';
            }
            // Clear per-zone doors inside partitioned cells covered by this overlay door
            const _pComp = state.columns[c].compartments[r];
            if (_pComp && _pComp.partition && Array.isArray(_pComp.subCells)) {
                _pComp.subCells.forEach(function(sub) {
                    if (!sub) return;
                    if (Array.isArray(sub.zonesDoor)) {
                        for (let zi = 0; zi < sub.zonesDoor.length; zi++) sub.zonesDoor[zi] = 'empty';
                    }
                    if (Array.isArray(sub.zonesDoorStyle)) {
                        for (let zi = 0; zi < sub.zonesDoorStyle.length; zi++) sub.zonesDoorStyle[zi] = 'solid';
                    }
                });
                _pComp.zoneDoorGroups = [];
            }
        });
    }
    buildCabinet(); calculatePrice(); saveHistoryState();
    // Keep selection open — door style panel will open for style selection
};

/** Index of the LED group that fully contains the current selection, or -1. */
function _ledGroupIndexForSelection(col) {
    if (_isDeskZoneSelection()) return col && col.deskLeds ? 0 : -1;
    if (!col || !Array.isArray(col.leds) || state.selection.rows.length === 0) return -1;
    const s = Math.min(...state.selection.rows);
    const e = Math.max(...state.selection.rows);
    return col.leds.findIndex(g => s >= g.startRow && e <= g.endRow);
}
window._ledGroupIndexForSelection = _ledGroupIndexForSelection;

/** Toggle a pair of LED strips spanning the selected cells (priced per group). */
window.toggleLedPair = function() {
    if (state.selection.colIndex === -1 || state.selection.rows.length === 0) return;
    if (_isDeskZoneSelection()) {
        window.toggleDeskLeds(state.selection.colIndex);
        updateToolbarButtonHighlights();
        return;
    }
    const col = state.columns[state.selection.colIndex];
    if (!col) return;
    if (!Array.isArray(col.leds)) col.leds = [];
    const hit = _ledGroupIndexForSelection(col);
    if (hit !== -1) {
        col.leds.splice(hit, 1);
    } else {
        let s = Math.min(...state.selection.rows);
        let e = Math.max(...state.selection.rows);
        col.leds = col.leds.filter(g => {
            if (g.endRow < s || g.startRow > e) return true;
            s = Math.min(s, g.startRow);
            e = Math.max(e, g.endRow);
            return false;
        });
        col.leds.push({ startRow: s, endRow: e });
        col.leds.sort((a, b) => a.startRow - b.startRow);
    }
    buildCabinet(); calculatePrice(); saveHistoryState();
    updateToolbarButtonHighlights();
};

/** LED pair in the knee space above an internal desk (selected as pseudo-row -1). */
window.toggleDeskLeds = function(colIndex) {
    const col = state.columns[colIndex];
    if (!col || col.type !== 'desk') return;
    if (col.deskLeds) delete col.deskLeds; else col.deskLeds = true;
    buildCabinet(); calculatePrice(); saveHistoryState();
};

/** Regular כוורת lining frame in the knee space above an internal desk (priced/counted as one honeycomb unit). */
window.toggleDeskHoneycomb = function(colIndex) {
    const col = state.columns[colIndex];
    if (!col || col.type !== 'desk') return;
    if (col.deskHoneycomb) delete col.deskHoneycomb; else col.deskHoneycomb = true;
    buildCabinet(); calculatePrice(); saveHistoryState();
};

window.applyDoorStyle = function(style) {
    if (state.selection.colIndex === -1 || state.selection.rows.length === 0) return;
    const c = state.selection.colIndex;
    const col = state.columns[c];

    // Apply door style to selected partition sub-cell zones
    if (_activeSubCellIdxs.size > 0) {
        const r = state.selection.rows[0];
        const comp = col.compartments[r];
        if (!comp || !comp.partition) return;
        const selectedKeys = _sortedSubKeys(_activeSubCellIdxs);
        const mergedGroup = _findZoneDoorGroup(comp, selectedKeys);
        if (mergedGroup && _subKeysEqual(mergedGroup.keys, selectedKeys)) {
            mergedGroup.style = style;
        } else {
            selectedKeys.forEach(key => {
                const { si, z } = _parseSubKey(key);
                const sub = comp.subCells && comp.subCells[si];
                if (!sub) return;
                const grp = _zoneDoorGroupForKey(comp, key);
                if (grp) { grp.style = style; return; }
                _ensureZoneDoorSplit(sub);
                const doorType = _zoneDoorAt(sub, z);
                if (!doorType || !doorType.startsWith('door_')) return;
                if (!Array.isArray(sub.zonesDoorStyle)) sub.zonesDoorStyle = [];
                while (sub.zonesDoorStyle.length <= z) sub.zonesDoorStyle.push('solid');
                sub.zonesDoorStyle[z] = style;
            });
        }
        buildCabinet(); calculatePrice(); saveHistoryState();
        updateToolbarButtonHighlights();
        return;
    }

    const door = col.doors.find(door => {
        return state.selection.rows.some(r => r >= door.startRow && r <= door.endRow);
    });
    if (!door) return;
    door.style = style;
    // Clear selection BEFORE buildCabinet so the render has no highlight
    state.selection = { colIndex: -1, rows: [] };
    closeContentSubPanels();
    buildCabinet(); calculatePrice(); saveHistoryState();
};

window.applyEqualCells = function() {
    if (state.selection.colIndex === -1 || state.selection.rows.length < 2) return;
    const c = state.selection.colIndex;
    const col = state.columns[c];
    if (!col) return;

    // Sort selected rows and verify they are consecutive
    const selRows = state.selection.rows.slice().sort((a, b) => a - b);
    const startR = selRows[0];
    const endR = selRows[selRows.length - 1];
    if (endR - startR + 1 !== selRows.length) return; // not consecutive — do nothing

    const t = state.thickness;
    const fo = col.floorOffset || 0;
    const baseY = (col.type === 'desk')
        ? ((col.deskHeight || 0) + (col.deskClearance || 0))
        : (col.noPlinth ? 0 : state.plinthHeight);
    const splitY = col.splitY;
    const hasSplit = splitY && splitY > baseY + t && splitY < col.height - t;
    const bottomShelves = hasSplit
        ? (col.shelvesY || []).filter(y => y < splitY).length
        : ((col.shelvesY || []).length);
    const splitRowBoundary = hasSplit ? bottomShelves + 1 : -1;
    const lastRow = (col.compartments && col.compartments.length)
        ? col.compartments.length - 1
        : ((col.shelves || 0) + (hasSplit ? 1 : 0));

    /** Equalize CLEAR cell heights at 0.01 cm (= 0.1 mm, blueprint precision)
     *  between interior spanBottom..spanTop.
     *  Shelf centers stay at underside + t/2 (no 0.1 snap) so clear heights stay exact. */
    const _equalizeBetween = (spanBottom, spanTop, shelfIndices) => {
        if (!shelfIndices.length) return;
        const numCells = shelfIndices.length + 1;
        const numShelves = shelfIndices.length;
        // Work in 0.01 cm units (= 0.1 mm)
        const botU = Math.round(spanBottom * 100);
        const topU = Math.round(spanTop * 100);
        const tU = Math.round(t * 100);
        const pureU = topU - botU - numShelves * tU;
        if (pureU <= 0) return;
        const floorCellU = Math.floor(pureU / numCells);
        const rem = pureU % numCells;
        let cursor = botU; // interior bottom of current cell
        for (let k = 0; k < numShelves; k++) {
            const cellU = floorCellU + (k < rem ? 1 : 0);
            cursor += cellU; // underside of shelf
            col.shelvesY[shelfIndices[k]] = cursor / 100 + t / 2;
            cursor += tU; // top of shelf = next cell bottom
        }
    };

    const _interiorBottom = (rowStart) => {
        if (rowStart === 0) {
            if (fo > 0) return fo + t;
            if (col.type === 'desk') return baseY + t;
            if (col.noPlinth) return t;
            return baseY + t;
        }
        if (hasSplit && rowStart === splitRowBoundary) return splitY + t;
        if (hasSplit && rowStart > splitRowBoundary) {
            const shelfIdx = rowStart - 2;
            if (col.shelvesY[shelfIdx] !== undefined) return col.shelvesY[shelfIdx] + t / 2;
            return splitY + t;
        }
        if (col.shelvesY[rowStart - 1] !== undefined) return col.shelvesY[rowStart - 1] + t / 2;
        return baseY + t;
    };

    const _interiorTop = (rowEnd) => {
        if (hasSplit && rowEnd >= bottomShelves && rowEnd < splitRowBoundary) {
            return splitY - t; // underside of קושרת (2t)
        }
        if (rowEnd >= lastRow) return col.height - t;
        if (hasSplit && rowEnd >= splitRowBoundary) {
            if (rowEnd >= lastRow) return col.height - t;
            if (col.shelvesY[rowEnd - 1] !== undefined) return col.shelvesY[rowEnd - 1] - t / 2;
            return col.height - t;
        }
        if (col.shelvesY[rowEnd] !== undefined) return col.shelvesY[rowEnd] - t / 2;
        return col.height - t;
    };

    const _equalizeLower = (rowStart, rowEnd) => {
        if (rowEnd <= rowStart) return;
        const idxs = [];
        const shelfTo = Math.min(rowEnd, bottomShelves) - 1;
        for (let i = rowStart; i <= shelfTo; i++) idxs.push(i);
        if (!idxs.length) return;
        _equalizeBetween(_interiorBottom(rowStart), _interiorTop(rowEnd), idxs);
    };

    const _equalizeUpper = (rowStart, rowEnd) => {
        if (!hasSplit || rowEnd <= rowStart) return;
        const idxs = [];
        for (let r = rowStart; r < rowEnd; r++) {
            const shelfIdx = r - 1;
            if (shelfIdx >= bottomShelves && shelfIdx < col.shelvesY.length) idxs.push(shelfIdx);
        }
        if (!idxs.length) return;
        _equalizeBetween(_interiorBottom(rowStart), _interiorTop(rowEnd), idxs);
    };

    if (!hasSplit) {
        _equalizeLower(startR, endR);
    } else if (endR < splitRowBoundary) {
        _equalizeLower(startR, endR);
    } else if (startR >= splitRowBoundary) {
        _equalizeUpper(startR, endR);
    } else {
        _equalizeLower(startR, splitRowBoundary - 1);
        _equalizeUpper(splitRowBoundary, endR);
    }

    buildCabinet(); calculatePrice(); saveHistoryState();
};

window.updateDrawerCount = function(delta) {
    if (state.selection.colIndex === -1 || state.selection.rows.length === 0) return;
    const c = state.selection.colIndex;
    const col = state.columns[c];
    let changed = false;
    let blockedWant = 0;
    let blockedNeed = 0;

    // Partition zone drawers
    if (_activeSubCellIdxs.size > 0) {
        const r = state.selection.rows[0];
        const comp = col && col.compartments[r];
        if (comp && comp.partition && Array.isArray(comp.subCells)) {
            _activeSubCellIdxs.forEach(key => {
                const { si, z } = _parseSubKey(key);
                const sub = comp.subCells[si];
                if (!sub) return;
                const interior = _zoneInteriorAt(sub, z);
                if (interior !== 'internal_drawers' && interior !== 'external_drawers') return;
                const zoneH = _getSubZoneHeightCm(col, r, sub, z);
                const minCount = calcMinDrawerCount(zoneH, interior);
                const maxCount = calcMaxDrawerCount(zoneH, interior);
                const cur = _zoneDrawerCountAt(sub, z, zoneH, interior);
                const want = cur + delta;
                if (delta > 0 && want > maxCount) {
                    blockedWant = want;
                    blockedNeed = minHeightForDrawerCount(want, interior);
                    return;
                }
                const newCount = Math.max(minCount, Math.min(8, Math.min(maxCount, want)));
                if (newCount !== cur) {
                    _setZoneDrawerCount(sub, z, newCount);
                    changed = true;
                }
            });
            if (blockedNeed > 0) _toastDrawerHeightBlocked(blockedNeed, blockedWant);
            if (changed) {
                buildCabinet(); calculatePrice(); saveHistoryState();
                updateToolbarButtonHighlights();
            }
            return;
        }
    }

    state.selection.rows.forEach(r => {
        const comp = col.compartments[r];
        if (comp && (comp.type === 'internal_drawers' || comp.type === 'external_drawers')) {
            const cellH = _cellHeight(col, r);
            const minCount = calcMinDrawerCount(cellH, comp.type);
            const maxCount = calcMaxDrawerCount(cellH, comp.type);
            const want = (comp.count || 1) + delta;
            if (delta > 0 && want > maxCount) {
                blockedWant = want;
                blockedNeed = minHeightForDrawerCount(want, comp.type);
                return;
            }
            let newCount = Math.max(minCount, Math.min(8, Math.min(maxCount, want)));
            if (newCount !== comp.count) {
                comp.count = newCount;
                changed = true;
            }
        }
    });
    if (blockedNeed > 0) _toastDrawerHeightBlocked(blockedNeed, blockedWant);
    if (!changed) return;
    buildCabinet(); calculatePrice(); saveHistoryState();
    updateToolbarButtonHighlights();
};

// Global vertical shelf / split / desk-surface drag — survives buildDragHandlesUI rebuilds
window._vShelfDrag = null;

function _endVShelfDrag() {
    if (!window._vShelfDrag) return;
    window._vShelfDrag = null;
    window._snapHighlight = null;
    controls.enabled = true;
    document.body.classList.remove('dragging');
    document.querySelectorAll('.drag-handle.vertical.active').forEach(h => h.classList.remove('active', 'snapped'));
    _endDrag();
    saveHistoryState();
}

window.addEventListener('pointermove', e => {
    const d = window._vShelfDrag;
    if (!d) return;
    e.preventDefault();

    const col = state.columns[d.colIndex];
    if (!col) return;

    const pxToCm = 100 / (Math.abs(new THREE.Vector3(0, 100, 0).project(camera).y - new THREE.Vector3(0, 0, 0).project(camera).y) * container.clientHeight / 2);
    const deltaCm = -(e.clientY - d.startMouseY) * pxToCm;
    const t = state.thickness;
    const startY = d.startY;

    const _findLiveHandleTooltip = () => {
        const handles = document.querySelectorAll('#drag-handles-layer .drag-handle.vertical');
        for (let i = 0; i < handles.length; i++) {
            const h = handles[i];
            if (d.isSubCellShelf && h.dataset.subShelf === '1' &&
                +h.dataset.colIndex === d.colIndex &&
                +h.dataset.rowIndex === d.rowIndex &&
                +h.dataset.subCellIdx === d.subCellIdx &&
                +h.dataset.subShelfIdx === d.subShelfIdx) {
                return h.querySelector('.drag-tooltip');
            }
            if (!d.isSubCellShelf && !d.isSplit && h.dataset.shelfIdx != null &&
                +h.dataset.colIndex === d.colIndex && +h.dataset.shelfIdx === d.shelfIdx) {
                return h.querySelector('.drag-tooltip');
            }
        }
        return null;
    };

    if (d.isSubCellShelf) {
        const _comp = col.compartments[d.rowIndex];
        const _sub = _comp && _comp.subCells && _comp.subCells[d.subCellIdx];
        if (!_sub || !Array.isArray(_sub.shelvesY)) return;
        const { prevY: compPrevY, compH } = _getSubCellCompBounds(col, d.rowIndex);
        const compTopY = compPrevY + compH;
        const obs = [compPrevY + t / 2, compTopY - t / 2];
        _sub.shelvesY.forEach((y, i) => { if (i !== d.subShelfIdx) obs.push(y); });
        const limitMin = Math.max(...obs.filter(y => y < startY)) + MIN_SHELF_GAP + t;
        const limitMax = Math.min(...obs.filter(y => y > startY)) - MIN_SHELF_GAP - t;
        const newY = Math.round(Math.max(limitMin, Math.min(limitMax, startY + deltaCm)) * 10) / 10;
        _sub.shelvesY[d.subShelfIdx] = newY;
        const aboveH = newY - (d.subShelfIdx > 0 ? _sub.shelvesY[d.subShelfIdx - 1] : compPrevY);
        const belowH = (d.subShelfIdx < _sub.shelvesY.length - 1 ? _sub.shelvesY[d.subShelfIdx + 1] : compTopY) - newY;
        const tip = _findLiveHandleTooltip();
        if (tip) tip.innerText = `מעל: ${Math.round(aboveH)} ס"מ | מתחת: ${Math.round(belowH)} ס"מ`;
        buildCabinetDragging();
        return;
    }

    if (d.isSplit) {
        let minLimits = [], maxLimits = [];
        state.columns.forEach(c => {
            if (c.splitY) {
                const cBaseY = c.type === 'desk' ? c.deskHeight + c.deskClearance : state.plinthHeight;
                minLimits.push(Math.max(...c.shelvesY.filter(y => y < startY), cBaseY + t) + t + MIN_SHELF_GAP + t);
                maxLimits.push(Math.min(...c.shelvesY.filter(y => y > startY), c.height - t) - t - MIN_SHELF_GAP - t);
            }
        });
        const limitMin = Math.max(...minLimits);
        const limitMax = Math.min(getSplitThreshold(), ...maxLimits);
        const newSplitY = Math.round(Math.max(limitMin, Math.min(limitMax, startY + deltaCm)));
        _setActiveWingSplitY(newSplitY);
        buildCabinetDragging();
        return;
    }

    if (d.isInternalDeskSurface) {
        col.deskHeight = Math.round(Math.max(50, Math.min(col.deskHeight + col.deskClearance - MIN_SHELF_GAP, startY + deltaCm)));
        distributeShelves(col);
        buildCabinetDragging();
        return;
    }

    if (d.isInternalDeskClearance) {
        let maxLimits = col.shelvesY.length > 0 ? col.shelvesY[0] - MIN_SHELF_GAP : col.height - MIN_SHELF_GAP;
        if (col.splitY) maxLimits = Math.min(maxLimits, col.splitY - MIN_SHELF_GAP);
        let desiredY = Math.round(Math.max(col.deskHeight + 30, Math.min(maxLimits, startY + deltaCm)));
        col.deskClearance = desiredY - col.deskHeight;
        distributeShelves(col);
        buildCabinetDragging();
        return;
    }

    if (d.isInternalDeskDrawer) {
        col.drawerHeight = Math.round(Math.max(8, Math.min(40, startY - deltaCm)));
        buildCabinetDragging();
        return;
    }

    // Regular column shelf
    const cBaseY = col.type === 'desk' ? col.deskHeight + col.deskClearance : state.plinthHeight;
    const pin = (typeof window._getDeskMergePinInfo === 'function')
        ? window._getDeskMergePinInfo(col) : null;
    const EPS = 0.15;

    // Desk-merge bounding shelves stay pinned
    if (pin && (d.shelfIdx === pin.botShelfIdx || d.shelfIdx === pin.topShelfIdx)) {
        return;
    }

    const desired = startY + deltaCm;
    const bandLo = (pin && pin.pinBottomY != null) ? pin.pinBottomY : null;
    const bandHi = (pin && pin.pinTopY != null) ? pin.pinTopY : null;
    const canJump = !!(bandLo != null && bandHi != null && bandHi > bandLo + EPS);
    const curY = (col.shelvesY && col.shelvesY[d.shelfIdx] != null) ? col.shelvesY[d.shelfIdx] : startY;

    let newY;
    let relocated = false;

    if (canJump) {
        const wasAbove = curY > bandHi + EPS;
        const wasBelow = curY < bandLo - EPS;

        const zoneLimits = (floorY, ceilY, refY, zoneShelves) => {
            const obs = [floorY, ceilY];
            if (col.splitY) {
                if (col.splitY > floorY + EPS && col.splitY < ceilY - EPS) {
                    obs.push(col.splitY - t);
                    obs.push(col.splitY + t);
                }
            }
            zoneShelves.forEach(y => obs.push(y));
            const below = obs.filter(y => y < refY - 0.01);
            const above = obs.filter(y => y > refY + 0.01);
            const zMin = (below.length ? Math.max(...below) : floorY) + MIN_SHELF_GAP + t;
            const zMax = (above.length ? Math.min(...above) : ceilY) - MIN_SHELF_GAP - t;
            return { limitMin: zMin, limitMax: zMax };
        };

        if (wasAbove) {
            const aboveShelves = col.shelvesY.filter((y, i) => i !== d.shelfIdx && y > bandHi + EPS);
            const a = zoneLimits(bandHi, col.height - t / 2, curY, aboveShelves);
            if (desired >= a.limitMin - 0.01) {
                newY = Math.round(Math.max(a.limitMin, Math.min(a.limitMax, desired)) * 10) / 10;
            } else {
                // Jump below the merged drawer (once)
                const belowShelves = col.shelvesY.filter((y, i) => i !== d.shelfIdx && y < bandLo - EPS);
                const b = zoneLimits(cBaseY + t / 2, bandLo, bandLo - MIN_SHELF_GAP - t, belowShelves);
                if (b.limitMax >= b.limitMin) {
                    const target = Math.min(b.limitMax, Math.max(b.limitMin, desired < bandLo ? desired : b.limitMax));
                    newY = Math.round(target * 10) / 10;
                    relocated = true;
                } else {
                    newY = Math.round(Math.max(a.limitMin, Math.min(a.limitMax, desired)) * 10) / 10;
                }
            }
        } else if (wasBelow) {
            const belowShelves = col.shelvesY.filter((y, i) => i !== d.shelfIdx && y < bandLo - EPS);
            const b = zoneLimits(cBaseY + t / 2, bandLo, curY, belowShelves);
            if (desired <= b.limitMax + 0.01) {
                newY = Math.round(Math.max(b.limitMin, Math.min(b.limitMax, desired)) * 10) / 10;
            } else {
                // Jump above the merged drawer (once)
                const aboveShelves = col.shelvesY.filter((y, i) => i !== d.shelfIdx && y > bandHi + EPS);
                const a = zoneLimits(bandHi, col.height - t / 2, bandHi + MIN_SHELF_GAP + t, aboveShelves);
                if (a.limitMax >= a.limitMin) {
                    const target = Math.max(a.limitMin, Math.min(a.limitMax, desired > bandHi ? desired : a.limitMin));
                    newY = Math.round(target * 10) / 10;
                    relocated = true;
                } else {
                    newY = Math.round(Math.max(b.limitMin, Math.min(b.limitMax, desired)) * 10) / 10;
                }
            }
        } else {
            // Between pins — push back out
            newY = curY;
        }
    } else {
        let obs = [cBaseY + t / 2, col.height - t / 2];
        if (col.splitY) { obs.push(col.splitY - t); obs.push(col.splitY + t); }
        col.shelvesY.forEach((y, i) => { if (i !== d.shelfIdx) obs.push(y); });

        const zMin = Math.max(...obs.filter(y => y < startY)) + MIN_SHELF_GAP + t;
        const zMax = Math.min(...obs.filter(y => y > startY)) - MIN_SHELF_GAP - t;
        newY = Math.round(Math.max(zMin, Math.min(zMax, desired)) * 10) / 10;
    }

    // Keep limitMin/limitMax for sorbet confirm path
    let limitMin = newY;
    let limitMax = newY;
    {
        let obs = [cBaseY + t / 2, col.height - t / 2];
        if (col.splitY) { obs.push(col.splitY - t); obs.push(col.splitY + t); }
        col.shelvesY.forEach((y, i) => { if (i !== d.shelfIdx) obs.push(y); });
        if (canJump && bandLo != null && bandHi != null) {
            if (curY > bandHi + EPS) {
                obs = obs.filter(y => y >= bandHi - EPS);
                obs.push(bandHi);
            } else if (curY < bandLo - EPS) {
                obs = obs.filter(y => y <= bandLo + EPS);
                obs.push(bandLo);
            }
        }
        const below = obs.filter(y => y < curY);
        const above = obs.filter(y => y > curY);
        if (below.length) limitMin = Math.max(...below) + MIN_SHELF_GAP + t;
        if (above.length) limitMax = Math.min(...above) - MIN_SHELF_GAP - t;
    }

    const SNAP_THRESHOLD = 0.5;
    let highlightNeighborColIdx = -1;
    let highlightNeighborShelfIdx = -1;
    let bestDist = SNAP_THRESHOLD + 1;
    if (!relocated) {
        [-1, 1].forEach(offset => {
            const nc = d.colIndex + offset;
            if (nc < 0 || nc >= state.columns.length) return;
            const neighbor = state.columns[nc];
            if (!neighbor || !neighbor.shelvesY) return;
            neighbor.shelvesY.forEach((ny, ni) => {
                const dist = Math.abs(ny - newY);
                if (dist <= SNAP_THRESHOLD && dist < bestDist) {
                    if (ny >= limitMin && ny <= limitMax) {
                        bestDist = dist;
                        highlightNeighborColIdx = nc;
                        highlightNeighborShelfIdx = ni;
                        newY = ny;
                    }
                }
            });
        });
    }

    if (relocated && typeof window._relocatePhysicalShelf === 'function') {
        const newIdx = window._relocatePhysicalShelf(col, d.shelfIdx, newY);
        if (newIdx >= 0) d.shelfIdx = newIdx;
        // Reset drag baseline so the next frames stay in the new zone
        d.startY = (col.shelvesY[d.shelfIdx] != null) ? col.shelvesY[d.shelfIdx] : newY;
        d.startMouseY = e.clientY;
    } else {
        col.shelvesY[d.shelfIdx] = newY;
    }

    if (highlightNeighborColIdx !== -1) {
        window._snapHighlight = {
            colIdx: d.colIndex,
            shelfIdx: d.shelfIdx,
            neighborColIdx: highlightNeighborColIdx,
            neighborShelfIdx: highlightNeighborShelfIdx
        };
    } else {
        window._snapHighlight = null;
    }

    const _checkSorbetRow = (r) => {
        const comp = col.compartments[r];
        if (!comp || comp.type !== 'sorbet') return false;
        return _cellHeight(col, r) < 110;
    };
    if (_checkSorbetRow(d.shelfIdx) || _checkSorbetRow(d.shelfIdx + 1)) {
        if (relocated) {
            // Undo is hard after relocate — skip sorbet auto-delete mid-jump
            window._snapHighlight = null;
        } else {
            col.shelvesY[d.shelfIdx] = startY;
            window._snapHighlight = null;
            const blockedR = (_checkSorbetRow(d.shelfIdx)) ? d.shelfIdx : d.shelfIdx + 1;
            // End drag before modal (confirm steals pointer events)
            window._vShelfDrag = null;
            controls.enabled = true;
            document.body.classList.remove('dragging');
            if (confirm('הסורבטו דורש גובה תא מינימלי של 110 ס"מ.\nלמחוק את הסורבטו ולהמשיך?')) {
                col.compartments[blockedR].type = 'empty';
                col.shelvesY[d.shelfIdx] = Math.round(Math.max(limitMin, Math.min(limitMax, startY + deltaCm)) * 10) / 10;
            }
            _endDrag();
            buildCabinet();
            saveHistoryState();
            return;
        }
    }

    const _autoDrawerRow = (r) => {
        _syncDrawerCompAfterHeight(col, r);
    };
    _autoDrawerRow(d.shelfIdx);
    _autoDrawerRow(d.shelfIdx + 1);

    buildCabinetDragging();
    {
        const snap = window._snapHighlight;
        document.querySelectorAll('.drag-handle.vertical').forEach(h => {
            const hCol = parseInt(h.dataset.colIndex);
            const hShelf = parseInt(h.dataset.shelfIdx);
            h.classList.remove('snapped');
            if (snap) {
                if (hCol === snap.colIdx && hShelf === snap.shelfIdx) {
                    h.classList.add('snapped', 'active');
                }
                if (hCol === snap.neighborColIdx && hShelf === snap.neighborShelfIdx) {
                    h.classList.add('snapped');
                }
            }
        });
    }
    updateToolbarButtonHighlights();
});

window.addEventListener('pointerup', _endVShelfDrag);
window.addEventListener('pointercancel', _endVShelfDrag);

// Global horizontal drag state — survives buildDragHandlesUI() rebuilds
// tooltipText: kept in sync so newly-rebuilt handles show current value
window._hDrag = null; // { index, startMouseX, startWLeft, startWRight, activeWing, wingEditMode, tooltipText }

// Single global pointermove/pointerup for horizontal column drag handles
// Registered once at module load — not inside buildDragHandlesUI() to avoid accumulation
window.addEventListener('pointermove', e => {
    const d = window._hDrag;
    if (!d) return;
    e.preventDefault();
    let pxToCm;
    if (d.wingEditMode && d.activeWing !== 'center') {
        const hw = state.width / 2;
        const pxA = ((new THREE.Vector3(0, 0,  hw).project(camera).x + 1) / 2 * container.clientWidth);
        const pxB = ((new THREE.Vector3(0, 0, -hw).project(camera).x + 1) / 2 * container.clientWidth);
        pxToCm = (d.activeWing === 'left')
            ? state.width / (pxB - pxA)
            : state.width / (pxA - pxB);
    } else {
        pxToCm = state.width / (((new THREE.Vector3(state.width/2,0,0).project(camera).x + 1)/2 * container.clientWidth) - ((new THREE.Vector3(-state.width/2,0,0).project(camera).x + 1)/2 * container.clientWidth));
    }
    const idx = d.index;
    let newL = Math.round(d.startWLeft  + (e.clientX - d.startMouseX) * pxToCm);
    let newR = Math.round(d.startWRight - (e.clientX - d.startMouseX) * pxToCm);

    const _activeWingData = state.wings[state.activeWing];
    const _wingPos = _activeWingData ? (_activeWingData.wingPosition || 'side') : null;
    const _centerD = state.wings.center ? state.wings.center.depth : state.depth;
    const _numCols = state.columns.length;
    const _hiddenIsLast = (state.activeWing === 'left');
    const _isHiddenSide = (_wingPos === 'side' && state.activeWing !== 'center');
    const _minFirst  = (_isHiddenSide && !_hiddenIsLast && idx === 0)              ? (_centerD + 30) : MIN_COL_WIDTH;
    const _minSecond = (_isHiddenSide && _hiddenIsLast  && idx + 1 === _numCols - 1) ? (_centerD + 30) : MIN_COL_WIDTH;

    if (newL < _minFirst)  { newL = _minFirst;  newR = Math.round(d.startWLeft + d.startWRight - _minFirst); }
    if (newR < _minSecond) { newR = _minSecond; newL = Math.round(d.startWLeft + d.startWRight - _minSecond); }
    if (newL < MIN_COL_WIDTH) { newL = MIN_COL_WIDTH; newR = Math.round(d.startWLeft + d.startWRight - MIN_COL_WIDTH); }
    if (newR < MIN_COL_WIDTH) { newR = MIN_COL_WIDTH; newL = Math.round(d.startWLeft + d.startWRight - MIN_COL_WIDTH); }

    state.columns[idx].width = newL; state.columns[idx+1].width = newR;
    // Store tooltip text in drag state so rebuilt handles can pick it up
    d.tooltipText = `ימין: ${newR} ס"מ | שמאל: ${newL} ס"מ`;
    // Update tooltip on the currently active handle (if still in DOM after rebuild)
    const activeHandle = dragLayer.querySelector(`.drag-handle.horizontal[data-idx="${idx}"]`);
    if (activeHandle) activeHandle.querySelector('.drag-tooltip').innerText = d.tooltipText;
    buildCabinetDragging();
});

window.addEventListener('pointerup', () => {
    if (!window._hDrag) return;
    window._hDrag = null;
    controls.enabled = true;
    document.body.classList.remove('dragging', 'dragging-h', 'dragging-v');
    _endDrag();
    calculatePrice();
    saveHistoryState();
});

// ── Global floor-offset drag state — survives buildDragHandlesUI() rebuilds ──
window._floorDrag = null; // { colIndex, startMouseY, startFO }
window._floorSnapActive = false; // true when snap is engaged during floor drag

window.addEventListener('pointermove', e => {
    const d = window._floorDrag;
    if (!d) return;
    e.preventDefault();
    const col = state.columns[d.colIndex];
    if (!col) return;
    const pxToCm = 100 / (Math.abs(new THREE.Vector3(0,100,0).project(camera).y - new THREE.Vector3(0,0,0).project(camera).y) * container.clientHeight / 2);
    const deltaCm = -(e.clientY - d.startMouseY) * pxToCm;
    const maxFO = col.height - 10;
    let _desiredFO = Math.max(0, Math.min(maxFO, d.startFO + deltaCm));

    // Snap to adjacent column floorOffset within 2cm
    let _floorSnapped = false;
    {
        const SNAP_THRESHOLD = 2;
        const cols = state.columns;
        let bestDist = SNAP_THRESHOLD + 1;
        // Also snap to 0 (floor level)
        const snapTargets = [0];
        [-1, 1].forEach(offset => {
            const nc = d.colIndex + offset;
            if (nc < 0 || nc >= cols.length) return;
            const neighbor = cols[nc];
            if (neighbor) snapTargets.push(neighbor.floorOffset || 0);
        });
        snapTargets.forEach(target => {
            const dist = Math.abs(_desiredFO - target);
            if (dist <= SNAP_THRESHOLD && dist < bestDist) {
                bestDist = dist;
                _desiredFO = target;
                _floorSnapped = true;
            }
        });
    }
    window._floorSnapActive = _floorSnapped;

    col.floorOffset = Math.round(_desiredFO);
    col.noPlinth = col.floorOffset > 0;
    d.tooltipText = col.floorOffset > 0 ? `תחתית: ${col.floorOffset} ס"מ` : 'גרור למעלה ליחידה תלויה';
    buildCabinetDragging();
    updateQuickEditPanelUI();
});

window.addEventListener('pointerup', () => {
    if (!window._floorDrag) return;
    window._floorDrag = null;
    window._floorSnapActive = false;
    controls.enabled = true;
    document.body.classList.remove('dragging');
    _endDrag();
    calculatePrice();
    saveHistoryState();
});

// ── Global roof (column height) drag state — survives buildDragHandlesUI() rebuilds ──
window._roofDrag = null; // { colIndex, startMouseY, startHeight }

window.addEventListener('pointermove', e => {
    const d = window._roofDrag;
    if (!d) return;
    e.preventDefault();
    const col = state.columns[d.colIndex];
    if (!col) return;
    const pxToCm = 100 / (Math.abs(new THREE.Vector3(0,100,0).project(camera).y - new THREE.Vector3(0,0,0).project(camera).y) * container.clientHeight / 2);
    const deltaCm = -(e.clientY - d.startMouseY) * pxToCm;

    let baseY = col.type === 'desk' ? col.deskHeight + col.deskClearance : state.plinthHeight;
    let minH = col.shelves > 0 ? col.shelvesY[col.shelves-1] + MIN_SHELF_GAP + state.thickness : baseY + MIN_SHELF_GAP;
    if (col.splitY && deltaCm < 0) {
        const splitMinH = col.splitY + MIN_SHELF_GAP + 2*state.thickness;
        if (d.startHeight + deltaCm <= splitMinH) {
            col.splitY = null;
            distributeShelves(col);
        }
    }
    if (col.splitY) minH = Math.max(minH, col.splitY + MIN_SHELF_GAP + 2*state.thickness);

    let _desiredH = Math.round(Math.max(minH, Math.min(MAX_GLOBAL_HEIGHT, d.startHeight + deltaCm)));

    // Snap to adjacent column height (always — regardless of topPanel)
    let _snapNeighborIdx = -1;
    {
        const SNAP_THRESHOLD = 0.5; // cm (5mm)
        const cols = state.columns;
        let bestDist = SNAP_THRESHOLD + 1;
        [-1, 1].forEach(offset => {
            const nc = d.colIndex + offset;
            if (nc < 0 || nc >= cols.length) return;
            const neighbor = cols[nc];
            if (!neighbor) return;
            const dist = Math.abs(_desiredH - neighbor.height);
            if (dist <= SNAP_THRESHOLD && dist < bestDist) {
                bestDist = dist;
                _desiredH = neighbor.height;
                _snapNeighborIdx = nc;
            }
        });
    }
    window._topPanelSnapHighlight = _snapNeighborIdx !== -1
        ? { colIdx: d.colIndex, neighborColIdx: _snapNeighborIdx }
        : null;

    // Check sorbet minimum height
    let _roofSorbetBlocked = false;
    if (col.compartments && col.compartments.length > 0) {
        const topR = col.compartments.length - 1;
        const topComp = col.compartments[topR];
        if (topComp && topComp.type === 'sorbet') {
            const _prevH = col.height;
            col.height = _desiredH;
            checkSplits();
            const cellH = _cellHeight(col, topR);
            if (cellH < 110) {
                col.height = _prevH;
                _roofSorbetBlocked = true;
                window._roofDrag = null;
                controls.enabled = true;
                window._topPanelSnapHighlight = null;
                document.body.classList.remove('dragging');
                if (confirm('הסורבטו דורש גובה תא מינימלי של 110 ס"מ.\nלמחוק את הסורבטו ולהמשיך?')) {
                    topComp.type = 'empty';
                    col.height = _desiredH;
                    checkSplits();
                }
                buildCabinet(); saveHistoryState();
                return;
            }
        }
    }
    if (!_roofSorbetBlocked) {
        col.height = _desiredH;
        checkSplits();
    }

    d.tooltipText = `גובה: ${col.height} ס"מ`;
    buildCabinetDragging();
    // Restore active + snap highlight on newly-rebuilt handles
    document.querySelectorAll('.drag-handle.vertical[data-colindex]').forEach(h => {
        const hCol = parseInt(h.dataset.colindex);
        const snap = window._topPanelSnapHighlight;
        if (hCol === d.colIndex) h.classList.add('active');
        if (snap && (hCol === snap.colIdx || hCol === snap.neighborColIdx)) {
            h.classList.add('snapped');
        } else {
            h.classList.remove('snapped');
        }
    });
});

window.addEventListener('pointerup', () => {
    if (!window._roofDrag) return;
    window._roofDrag = null;
    window._topPanelSnapHighlight = null;
    controls.enabled = true;
    document.body.classList.remove('dragging');
    state.globalHeight = Math.max(...state.columns.map(c => c.height));
    _endDrag();
    calculatePrice();
    saveHistoryState();
});

function buildDragHandlesUI() {
    dragLayer.innerHTML = '';
    if(state.viewMode !== 'front') return;

    dragHandlesData.horizontal.forEach((x3d, index) => {
        const colLeft = state.columns[index];
        const colRight = state.columns[index + 1];
        if (!colLeft || !colRight) return;
        // Tooltip convention (same for all wings):
        //   ימין = columns[index+1] (higher local X = screen right)
        //   שמאל = columns[index]   (lower  local X = screen left)
        // If a drag is in progress for this index, show the live tooltip text
        const d = window._hDrag;
        const isActiveDrag = d && d.index === index;
        const initialText = isActiveDrag && d.tooltipText
            ? d.tooltipText
            : `ימין: ${Math.round(colRight.width)} ס"מ | שמאל: ${Math.round(colLeft.width)} ס"מ`;
        const handle = createHandle('horizontal', x3d, null, initialText);
        handle.dataset.idx = index; // used by pointermove to find handle after rebuild
        if (isActiveDrag) handle.classList.add('active'); // restore active class after rebuild
        dragLayer.appendChild(handle);
        
        handle.addEventListener('pointerdown', e => {
            e.preventDefault();
            handle.setPointerCapture(e.pointerId); // keep pointer events on this element
            handle.classList.add('active');
            controls.enabled = false;
            document.body.classList.add('dragging', 'dragging-h');
            window._hDrag = {
                index,
                startMouseX: e.clientX,
                startWLeft:  colLeft.width,
                startWRight: colRight.width,
                activeWing:  state.activeWing,
                wingEditMode: state.wingEditMode,
                tooltipText: null
            };
        });
    });

    dragHandlesData.desk.forEach(d => {
        if (d.type === 'deskWidth') {
            const handle = createHandle('horizontal', d.x, d.y, 'רוחב שולחן');
            dragLayer.appendChild(handle);
            let startMouseX = 0, startW = 0, isDragging = false;
            handle.addEventListener('pointerdown', e => {
                isDragging = true; startMouseX = e.clientX;
                startW = (state.presetId === 'writing-desk' || d.writingDesk) ? state.width : state.desk.width;
                handle.classList.add('active'); controls.enabled = false; document.body.classList.add('dragging');
            });
            window.addEventListener('pointermove', e => {
                if (!isDragging) return;
                e.preventDefault();
                const pxToCm = state.width / (((new THREE.Vector3(state.width/2,0,0).project(camera).x + 1)/2 * container.clientWidth) - ((new THREE.Vector3(-state.width/2,0,0).project(camera).x + 1)/2 * container.clientWidth));
                const deltaX = (e.clientX - startMouseX) * pxToCm;
                let delta = d.side === 'left' ? -deltaX : deltaX;
                if (state.presetId === 'writing-desk' || d.writingDesk) {
                    state.width = Math.round(Math.max(40, Math.min(200, startW + delta)));
                    const wInp = document.getElementById('inp-width');
                    const wNum = document.getElementById('inp-num-width');
                    if (wInp) wInp.value = state.width;
                    if (wNum) wNum.value = state.width;
                    if (typeof window._syncDimPills === 'function') window._syncDimPills();
                } else {
                    state.desk.width = Math.round(Math.max(40, Math.min(200, startW + delta)));
                    if (document.getElementById('inp-num-desk-width')) document.getElementById('inp-num-desk-width').value = state.desk.width;
                    if (document.getElementById('inp-desk-width')) document.getElementById('inp-desk-width').value = state.desk.width;
                }

                const _wShow = (state.presetId === 'writing-desk' || d.writingDesk) ? state.width : state.desk.width;
                handle.querySelector('.drag-tooltip').innerText = `רוחב: ${_wShow} ס"מ`;
                buildCabinetDragging(); updateCameraView();
            });
            window.addEventListener('pointerup', () => { if(isDragging){ isDragging = false; handle.classList.remove('active'); controls.enabled = true; document.body.classList.remove('dragging'); _endDrag(); calculatePrice(); saveHistoryState(); }});
        }
        else if (d.type === 'deskHeight') {
            const handle = createHandle('vertical', d.x, d.y, 'גובה שולחן');
            dragLayer.appendChild(handle);
            let startMouseY = 0, startH = 0, isDragging = false;
            handle.addEventListener('pointerdown', e => {
                isDragging = true; startMouseY = e.clientY;
                if (state.presetId === 'writing-desk' || d.writingDesk) {
                    const cw = state.wings && state.wings.center;
                    startH = (cw && cw.writingDesk && cw.writingDesk.height != null) ? cw.writingDesk.height : state.globalHeight;
                } else {
                    startH = state.desk.height;
                }
                handle.classList.add('active'); controls.enabled = false; document.body.classList.add('dragging');
            });
            window.addEventListener('pointermove', e => {
                if (!isDragging) return;
                e.preventDefault();
                const pxToCm = 100 / (Math.abs(new THREE.Vector3(0,100,0).project(camera).y - new THREE.Vector3(0,0,0).project(camera).y) * container.clientHeight / 2);
                const deltaCm = -(e.clientY - startMouseY) * pxToCm;
                const newH = Math.round(Math.max(50, Math.min(120, startH + deltaCm)));
                if (state.presetId === 'writing-desk' || d.writingDesk) {
                    const cw = state.wings && state.wings.center;
                    if (cw) {
                        if (!cw.writingDesk) cw.writingDesk = {};
                        cw.writingDesk.height = newH;
                        cw.globalHeight = newH;
                    }
                    state.globalHeight = newH;
                } else {
                    state.desk.height = newH;
                    if (typeof window._resyncDeskMergeBandCells === 'function') window._resyncDeskMergeBandCells();
                }
                handle.querySelector('.drag-tooltip').innerText = `גובה: ${newH} ס"מ`;
                buildCabinetDragging(); updateCameraView();
            });
            window.addEventListener('pointerup', () => { if(isDragging){ isDragging = false; handle.classList.remove('active'); controls.enabled = true; document.body.classList.remove('dragging'); _endDrag(); calculatePrice(); saveHistoryState(); }});
        }
        else if (d.type === 'deskDrawer') {
            const handle = createHandle('vertical', d.x, d.y, 'גובה מגירה');
            dragLayer.appendChild(handle);
            let startMouseY = 0, startH = 0, isDragging = false;
            handle.addEventListener('pointerdown', e => {
                isDragging = true; startMouseY = e.clientY;
                if (state.presetId === 'writing-desk' || d.writingDesk) {
                    const cw = state.wings && state.wings.center;
                    startH = (cw && cw.writingDesk) ? cw.writingDesk.drawerHeight : 12;
                } else {
                    startH = state.desk.drawerHeight;
                }
                handle.classList.add('active'); controls.enabled = false; document.body.classList.add('dragging');
            });
            window.addEventListener('pointermove', e => {
                if (!isDragging) return;
                e.preventDefault();
                const pxToCm = 100 / (Math.abs(new THREE.Vector3(0,100,0).project(camera).y - new THREE.Vector3(0,0,0).project(camera).y) * container.clientHeight / 2);
                const deltaCm = -(e.clientY - startMouseY) * pxToCm;
                const newDH = Math.round(Math.max(12, Math.min(40, startH - deltaCm)));
                if (state.presetId === 'writing-desk' || d.writingDesk) {
                    const cw = state.wings && state.wings.center;
                    if (cw) {
                        if (!cw.writingDesk) cw.writingDesk = {};
                        cw.writingDesk.drawerHeight = newDH;
                    }
                } else {
                    state.desk.drawerHeight = newDH;
                    if (typeof window._resyncDeskMergeBandCells === 'function') window._resyncDeskMergeBandCells();
                }
                handle.querySelector('.drag-tooltip').innerText = `מגירה: ${newDH} ס"מ`;
                buildCabinetDragging();
            });
            window.addEventListener('pointerup', () => { if(isDragging){ isDragging = false; handle.classList.remove('active'); controls.enabled = true; document.body.classList.remove('dragging'); _endDrag(); calculatePrice(); saveHistoryState(); }});
        }
    });

    // Determine which column to show roof/floor/shelf handles for:
    // During an active roof, floor, or vertical-shelf drag, always show that column's handles
    // (even if hover moved away) so pointerup / rebuild cannot strand the drag.
    const _roofDragActive = window._roofDrag;
    const _floorDragActiveGlobal = window._floorDrag;
    const _vShelfDragActive = window._vShelfDrag;
    const _roofColIndex = _roofDragActive ? _roofDragActive.colIndex
        : _floorDragActiveGlobal ? _floorDragActiveGlobal.colIndex
        : _vShelfDragActive ? _vShelfDragActive.colIndex
        : state.hoveredColIndex;

    if (_roofColIndex !== -1 && state.columns[_roofColIndex]) {
        const cIndex = _roofColIndex; const col = state.columns[cIndex];

        const roof = dragHandlesData.roofs.find(r => r.colIndex === cIndex);
        if (roof) {
            const tooltipText = _roofDragActive ? (_roofDragActive.tooltipText || `גובה: ${Math.round(col.height)} ס"מ`) : `גובה עמודה: ${Math.round(col.height)}`;
            const rHandle = createHandle('vertical', roof.x, roof.y, tooltipText);
            rHandle.dataset.colindex = cIndex; // lowercase — matches HTML attribute
            // Restore active class if drag is in progress
            if (_roofDragActive) rHandle.classList.add('active');
            // Restore snap highlight
            const snap = window._topPanelSnapHighlight;
            if (snap && (cIndex === snap.colIdx || cIndex === snap.neighborColIdx)) rHandle.classList.add('snapped');
            dragLayer.appendChild(rHandle);

            rHandle.addEventListener('pointerdown', e => {
                e.preventDefault();
                window._roofDrag = { colIndex: cIndex, startMouseY: e.clientY, startHeight: col.height, tooltipText: null };
                rHandle.classList.add('active');
                controls.enabled = false;
                document.body.classList.add('dragging');
            });
        }

        // Also show neighbor's roof handle with snap highlight during drag
        const _snapNow = window._topPanelSnapHighlight;
        if (_roofDragActive && _snapNow) {
            const nIdx = _snapNow.neighborColIdx;
            const nCol = state.columns[nIdx];
            const nRoof = nIdx !== cIndex && nCol && dragHandlesData.roofs.find(r => r.colIndex === nIdx);
            if (nRoof) {
                const nHandle = createHandle('vertical', nRoof.x, nRoof.y, `גובה: ${Math.round(nCol.height)} ס"מ`);
                nHandle.dataset.colindex = nIdx;
                nHandle.classList.add('snapped');
                dragLayer.appendChild(nHandle);
            }
        }

        // Floor offset drag handle — orange, at bottom of column (always visible on hover)
        const floorH = dragHandlesData.floors && dragHandlesData.floors.find(f => f.colIndex === cIndex);
        if (floorH) {
            const _floorDragActive = window._floorDrag;
            const fo = floorH.fo !== undefined ? floorH.fo : (col.floorOffset || 0);
            const tooltipText = _floorDragActive && _floorDragActive.colIndex === cIndex
                ? (_floorDragActive.tooltipText || (fo > 0 ? `תחתית: ${fo} ס"מ` : 'גרור למעלה ליחידה תלויה'))
                : (fo > 0 ? `תחתית: ${fo} ס"מ` : 'גרור למעלה ליחידה תלויה');
            const fHandle = createHandle('vertical', floorH.x, floorH.y, tooltipText);
            fHandle.style.borderColor = '#f97316';
            fHandle.style.boxShadow = '0 2px 10px rgba(249,115,22,0.4)';
            if (_floorDragActive && _floorDragActive.colIndex === cIndex) fHandle.classList.add('active');
            if (_floorDragActive && _floorDragActive.colIndex === cIndex && window._floorSnapActive) fHandle.classList.add('snapped');
            dragLayer.appendChild(fHandle);
            fHandle.addEventListener('pointerdown', e => {
                e.preventDefault();
                window._floorDrag = { colIndex: cIndex, startMouseY: e.clientY, startFO: col.floorOffset || 0, tooltipText: null };
                fHandle.classList.add('active');
                controls.enabled = false;
                document.body.classList.add('dragging');
            });
        }

        dragHandlesData.vertical.filter(v => v.colIndex === cIndex).forEach(v => {
            let text = 'הזז מדף';
            if(v.isSplit) text = 'הזז הפרדת יחידות';
            if(v.isInternalDeskSurface) text = 'משטח שולחן פנימי';
            if(v.isInternalDeskClearance) text = 'גובה חלל עבודה';
            if(v.isInternalDeskDrawer) text = 'גובה מגירה פנימית';
            if(v.isSubCellShelf) text = 'הזז מדף תא';

            const sHandle = createHandle('vertical', v.x, v.y, text);
            if(v.isSplit) { sHandle.style.borderColor = '#e74c3c'; sHandle.style.boxShadow = '0 2px 10px rgba(231, 76, 60, 0.4)'; }
            if(v.isInternalDeskSurface || v.isInternalDeskClearance) sHandle.style.borderColor = '#f1c40f';
            if(v.isSubCellShelf) { sHandle.style.borderColor = '#06b6d4'; sHandle.style.boxShadow = '0 2px 10px rgba(6,182,212,0.4)'; }
            // Store identity so shelf-delete trash can sit next to this handle
            if (!v.isSplit && !v.isInternalDeskSurface && !v.isInternalDeskClearance && !v.isInternalDeskDrawer) {
                sHandle.dataset.colIndex = v.colIndex;
                if (v.isSubCellShelf) {
                    sHandle.dataset.subShelf = '1';
                    sHandle.dataset.rowIndex = v.rowIndex;
                    sHandle.dataset.subCellIdx = v.subCellIdx;
                    sHandle.dataset.subShelfIdx = v.subShelfIdx;
                } else {
                    sHandle.dataset.shelfIdx = v.shelfIdx;
                }
            }
            dragLayer.appendChild(sHandle);

            // Restore active class if this shelf is the one currently being dragged
            if (_vShelfDragActive &&
                _vShelfDragActive.colIndex === v.colIndex &&
                ((_vShelfDragActive.isSubCellShelf && v.isSubCellShelf &&
                    _vShelfDragActive.rowIndex === v.rowIndex &&
                    _vShelfDragActive.subCellIdx === v.subCellIdx &&
                    _vShelfDragActive.subShelfIdx === v.subShelfIdx) ||
                 (!_vShelfDragActive.isSubCellShelf && !v.isSubCellShelf &&
                    !_vShelfDragActive.isSplit && !v.isSplit &&
                    !_vShelfDragActive.isInternalDeskSurface && !v.isInternalDeskSurface &&
                    !_vShelfDragActive.isInternalDeskClearance && !v.isInternalDeskClearance &&
                    !_vShelfDragActive.isInternalDeskDrawer && !v.isInternalDeskDrawer &&
                    _vShelfDragActive.shelfIdx === v.shelfIdx) ||
                 (_vShelfDragActive.isSplit && v.isSplit) ||
                 (_vShelfDragActive.isInternalDeskSurface && v.isInternalDeskSurface) ||
                 (_vShelfDragActive.isInternalDeskClearance && v.isInternalDeskClearance) ||
                 (_vShelfDragActive.isInternalDeskDrawer && v.isInternalDeskDrawer))) {
                sHandle.classList.add('active');
            }

            sHandle.addEventListener('pointerdown', e => {
                e.preventDefault();
                e.stopPropagation();
                try { sHandle.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }

                let startY = 0;
                if (v.isSplit) startY = col.splitY;
                else if (v.isInternalDeskSurface) startY = col.deskHeight;
                else if (v.isInternalDeskClearance) startY = col.deskHeight + col.deskClearance;
                else if (v.isInternalDeskDrawer) startY = col.drawerHeight;
                else if (v.isSubCellShelf) {
                    const _comp = col.compartments[v.rowIndex];
                    const _sub = _comp && _comp.subCells && _comp.subCells[v.subCellIdx];
                    startY = _sub && _sub.shelvesY ? _sub.shelvesY[v.subShelfIdx] : v.y;
                } else {
                    startY = col.shelvesY[v.shelfIdx];
                }

                window._vShelfDrag = {
                    colIndex: v.colIndex,
                    shelfIdx: v.shelfIdx,
                    rowIndex: v.rowIndex,
                    subCellIdx: v.subCellIdx,
                    subShelfIdx: v.subShelfIdx,
                    isSplit: !!v.isSplit,
                    isSubCellShelf: !!v.isSubCellShelf,
                    isInternalDeskSurface: !!v.isInternalDeskSurface,
                    isInternalDeskClearance: !!v.isInternalDeskClearance,
                    isInternalDeskDrawer: !!v.isInternalDeskDrawer,
                    startMouseY: e.clientY,
                    startY: startY,
                    pointerId: e.pointerId
                };
                sHandle.classList.add('active');
                controls.enabled = false;
                document.body.classList.add('dragging');
            });
        });
    }

    // Partition drag handles — horizontal handles inside partitioned cells (N boards support)
    // Each handle sits on the partition board and drags left/right to resize sub-cells.
    // Pattern mirrors horizontal column handles: uses window._partDrag for state,
    // and window.addEventListener for move/up so the handle survives dragLayer rebuilds.
    if (dragHandlesData.partitions) {
        dragHandlesData.partitions.forEach(p => {
            const col = state.columns[p.colIndex];
            if (!col) return;
            const comp = p.comp;
            if (!Array.isArray(comp.partitions)) return;
            const pi = p.partIdx;
            const partitions = comp.partitions;

            // Compute sub-cell widths for tooltip
            const _getSubWidths = (pxArr) => {
                const colW = col.width;
                const boundaries = [0, ...pxArr.map(px => colW * px), colW];
                return boundaries.slice(1).map((b, i) => Math.round(b - boundaries[i]));
            };

            const subWidths = _getSubWidths(partitions);
            const tooltipText = subWidths.map((w, i) => `תא ${i+1}: ${w}`).join(' | ');

            // Check if this is the currently active drag (survives dragLayer rebuild)
            const activeDrag = window._partDrag;
            const isActiveDrag = activeDrag &&
                activeDrag.colIndex === p.colIndex &&
                activeDrag.rowIndex === p.rowIndex &&
                activeDrag.pi === pi;

            const pHandle = createHandle('horizontal', p.x, p.y, tooltipText);
            pHandle.dataset.colIndex = p.colIndex;
            pHandle.dataset.rowIndex = p.rowIndex;
            pHandle.dataset.partIdx = pi;
            pHandle.style.borderColor = '#f97316';
            pHandle.style.boxShadow = '0 2px 10px rgba(249,115,22,0.4)';
            if (isActiveDrag) {
                pHandle.classList.add('active');
                // Update the drag state to point to the new handle element
                activeDrag.tooltipEl = pHandle.querySelector('.drag-tooltip');
            }
            dragLayer.appendChild(pHandle);

            const MIN_SUB_WIDTH_RATIO = 8 / col.width; // minimum 8cm sub-cell

            pHandle.addEventListener('pointerdown', e => {
                e.preventDefault();
                pHandle.classList.add('active');
                controls.enabled = false;
                document.body.classList.add('dragging');
                window._partDrag = {
                    colIndex: p.colIndex,
                    rowIndex: p.rowIndex,
                    pi,
                    col,
                    startMouseX: e.clientX,
                    startPX: partitions[pi],
                    getSubWidths: _getSubWidths,
                    minRatio: MIN_SUB_WIDTH_RATIO,
                    tooltipEl: pHandle.querySelector('.drag-tooltip'),
                };
            });
        });

        // Single window-level pointermove/pointerup for all partition handles
        // (added once per buildDragHandlesUI call — old ones are replaced by the rebuild)
        window._partMoveHandler && window.removeEventListener('pointermove', window._partMoveHandler);
        window._partUpHandler   && window.removeEventListener('pointerup',   window._partUpHandler);

        window._partMoveHandler = (e) => {
            const d = window._partDrag;
            if (!d) return;
            e.preventDefault();
            // Always read live partitions from state (avoids stale reference after addPartition replaces array)
            const _liveCol = state.columns[d.colIndex];
            if (!_liveCol) return;
            const _liveComp = _liveCol.compartments[d.rowIndex];
            if (!_liveComp || !Array.isArray(_liveComp.partitions)) return;
            const livePartitions = _liveComp.partitions;

            const leftPx  = (new THREE.Vector3(-state.width/2, 0, 0).project(camera).x + 1) / 2 * container.clientWidth;
            const rightPx = (new THREE.Vector3( state.width/2, 0, 0).project(camera).x + 1) / 2 * container.clientWidth;
            const totalPxWidth = rightPx - leftPx;
            const pxToCm = totalPxWidth > 0 ? state.width / totalPxWidth : 1;
            const deltaCm = (e.clientX - d.startMouseX) * pxToCm;
            const rawNewPX = d.startPX + deltaCm / d.col.width;

            const lowerBound = (d.pi === 0) ? d.minRatio : (livePartitions[d.pi - 1] + d.minRatio);
            const upperBound = (d.pi === livePartitions.length - 1) ? (1 - d.minRatio) : (livePartitions[d.pi + 1] - d.minRatio);
            livePartitions[d.pi] = Math.max(lowerBound, Math.min(upperBound, rawNewPX));

            if (d.tooltipEl) {
                const newSubWidths = d.getSubWidths(livePartitions);
                d.tooltipEl.innerText = newSubWidths.map((w, i) => `תא ${i+1}: ${w}`).join(' | ');
            }
            buildCabinetDragging();
        };

        window._partUpHandler = () => {
            if (!window._partDrag) return;
            window._partDrag = null;
            controls.enabled = true;
            document.body.classList.remove('dragging');
            // Find and deactivate any active partition handle
            document.querySelectorAll('.drag-handle.horizontal').forEach(h => {
                if (h.dataset.partIdx !== undefined) h.classList.remove('active');
            });
            _endDrag();
            calculatePrice();
            saveHistoryState();
        };

        window.addEventListener('pointermove', window._partMoveHandler);
        window.addEventListener('pointerup',   window._partUpHandler);
    }

    // ---- Vessel sink single centered drag handle (bathroom countertop) ----
    // Always rendered when bathroom preset is active — not dependent on column hover.
    // Appears on hover over the handle itself (CSS :hover on .drag-handle).
    if (dragHandlesData.vesselSink && dragHandlesData.vesselSink.length > 0 && state.presetId === 'bathroom') {
        const vsHandle = dragHandlesData.vesselSink[0]; // always drawn at c===0
        if (vsHandle) {
            const sHandle = createHandle('horizontal', vsHandle.centerX, vsHandle.y, 'גרור כיור ימינה/שמאלה');
            sHandle.style.borderColor = '#06b6d4';
            sHandle.style.boxShadow = '0 2px 10px rgba(6,182,212,0.4)';
            sHandle.dataset.colIndex = vsHandle.colIndex;
            dragLayer.appendChild(sHandle);

            sHandle.addEventListener('pointerdown', e => {
                e.preventDefault();
                controls.enabled = false;
                document.body.classList.add('dragging');
                window._vesselSinkDragging = true; // disable butcher texture during drag for performance
                const startX = e.clientX;
                const startOffset = vsHandle.currentOffsetX;
                // Compute pixels-per-cm from projected slab width
                const _slabLeftPt  = new THREE.Vector3(vsHandle.slabLeftX,  vsHandle.y, state.depth / 2);
                const _slabRightPt = new THREE.Vector3(vsHandle.slabRightX, vsHandle.y, state.depth / 2);
                if (window._activeWingGroup) {
                    window._activeWingGroup.updateMatrixWorld(true);
                    _slabLeftPt.applyMatrix4(window._activeWingGroup.matrixWorld);
                    _slabRightPt.applyMatrix4(window._activeWingGroup.matrixWorld);
                }
                const _lProj = _slabLeftPt.clone().project(camera);
                const _rProj = _slabRightPt.clone().project(camera);
                const _slabPxW = (_rProj.x - _lProj.x) * container.clientWidth / 2;
                const _slabCmW = vsHandle.slabRightX - vsHandle.slabLeftX;
                const _pxPerCm = _slabPxW / _slabCmW;

                const _onMove = (me) => {
                    const dx = me.clientX - startX;
                    const dCm = _pxPerCm > 0 ? dx / _pxPerCm : 0;
                    const newOffset = startOffset + dCm;
                    const maxOff = (_slabCmW / 2) - vsHandle.vesselW / 2 - 1;
                    const clamped = Math.max(-maxOff, Math.min(maxOff, newOffset));
                    const cw = state.wings && state.wings.center;
                    if (cw) {
                        cw.vesselSinkOffsetX = clamped;
                        buildCabinetDragging(); // fast rebuild — no texture load during drag
                        updateDragHandlesPosition();
                    }
                };
                const _onUp = () => {
                    window._vesselSinkDragging = false; // restore butcher texture
                    controls.enabled = true;
                    document.body.classList.remove('dragging');
                    window.removeEventListener('pointermove', _onMove);
                    window.removeEventListener('pointerup', _onUp);
                    buildCabinet(); // full rebuild with texture restored
                    if (typeof saveHistoryState === 'function') saveHistoryState();
                };
                window.addEventListener('pointermove', _onMove);
                window.addEventListener('pointerup', _onUp);
            });
        }
    }

    // ---- Upper unit horizontal drag handles (reposition left/right) ----
    // Restore active class if drag is in progress (handle was rebuilt during drag)
    if (dragHandlesData.upperUnit && dragHandlesData.upperUnit.length > 0) {
        dragHandlesData.upperUnit.forEach(d => {
            const uuWing = state.wings[d.uuKey];
            if (!uuWing) return;
            const offsetX = uuWing._upperOffsetX || 0;
            const handle = document.createElement('div');
            handle.className = 'drag-handle horizontal uu-move-handle';
            handle.dataset.uuKey = d.uuKey;
            handle.dataset.worldX = d.worldX;
            handle.dataset.worldY = d.worldY;
            handle.dataset.world = '1'; // flag: use world-space projection
            handle.innerHTML = `<div class="drag-tooltip">הזזה: ${Math.round(offsetX)} ס"מ</div>`;
            handle.style.display = 'flex';
            // Restore active class if this handle's drag is in progress
            if (window._uuDrag && window._uuDrag.uuKey === d.uuKey) handle.classList.add('active');
            dragLayer.appendChild(handle);

            handle.addEventListener('pointerdown', e => {
                e.preventDefault();
                controls.enabled = false;
                document.body.classList.add('dragging', 'dragging-h');
                window._uuDrag = {
                    uuKey: d.uuKey,
                    startMouseX: e.clientX,
                    startOffsetX: uuWing._upperOffsetX || 0
                };
                handle.classList.add('active');
            });
        });

        // Global move/up handlers — survive handle rebuild
        if (window._uuMoveHandler) window.removeEventListener('pointermove', window._uuMoveHandler);
        if (window._uuUpHandler)   window.removeEventListener('pointerup',   window._uuUpHandler);

        window._uuMoveHandler = e => {
            if (!window._uuDrag) return;
            e.preventDefault();
            const { uuKey, startMouseX, startOffsetX } = window._uuDrag;
            const uuW2 = state.wings[uuKey];
            if (!uuW2) return;
            // Convert pixel delta to cm using a fixed 100cm reference span
            const cw = container.clientWidth;
            const leftPx  = (new THREE.Vector3(-50, 0, 0).project(camera).x * 0.5 + 0.5) * cw;
            const rightPx = (new THREE.Vector3( 50, 0, 0).project(camera).x * 0.5 + 0.5) * cw;
            const pxPerCm = Math.max(1, (rightPx - leftPx) / 100);
            const deltaCm = (e.clientX - startMouseX) / pxPerCm;
            // Clamp so upper unit stays within the lower cabinet's left/right edges
            // Lower cabinet width from center wing (direct access, not proxy)
            const lowerW = (state.wings.center && state.wings.center.width) || 200;
            const uuWidth = uuW2.width || 160;
            const maxOffset = Math.max(0, (lowerW - uuWidth) / 2);
            let newOffset = Math.max(-maxOffset, Math.min(maxOffset, startOffsetX + deltaCm));
            // Snap to center (offset=0) when within 3cm
            const SNAP_THRESHOLD = 3;
            const snapped = Math.abs(newOffset) < SNAP_THRESHOLD;
            if (snapped) newOffset = 0;
            uuW2._upperOffsetX = Math.round(newOffset);
            // Update tooltip on the active handle
            const activeHandle = dragLayer.querySelector(`.uu-move-handle[data-uu-key="${uuKey}"]`);
            if (activeHandle) {
                activeHandle.querySelector('.drag-tooltip').innerText = snapped ? 'מרכז ✓' : `הזזה: ${uuW2._upperOffsetX} ס"מ`;
                if (snapped) activeHandle.classList.add('snapped'); else activeHandle.classList.remove('snapped');
            }
            buildCabinetDragging();
        };
        window._uuUpHandler = () => {
            if (!window._uuDrag) return;
            window._uuDrag = null;
            controls.enabled = true;
            document.body.classList.remove('dragging', 'dragging-h');
            _endDrag();
            saveHistoryState();
        };
        window.addEventListener('pointermove', window._uuMoveHandler);
        window.addEventListener('pointerup',   window._uuUpHandler);
    }

    if (typeof window._buildSpaceCabMoveHandle === 'function') window._buildSpaceCabMoveHandle();

    updateOverlaysPosition();
    updateDragHandlesPosition();
}

window._spaceSlot1Height = function() {
    const info = typeof window._getSpacePairInfo === 'function' ? window._getSpacePairInfo() : null;
    if (!info) return 240;
    const slot = info.activeSlot > 0 ? info.activeSlot : 1;
    if (info.activeSlot === slot) {
        if (state.columns && state.columns.length) {
            return Math.max.apply(null, state.columns.map(function(c) { return c.height || 0; }));
        }
        return state.globalHeight || 240;
    }
    const item = state.orderCart[info.slotIndices[slot]];
    const rs = item && item.rawState;
    if (rs && rs.columns && rs.columns.length) {
        return Math.max.apply(null, rs.columns.map(function(c) { return c.height || rs.globalHeight || 240; }));
    }
    return (rs && rs.globalHeight) || 240;
};

/** Screen px → cm scale measured at the moving cabinet's actual position (it may sit forward on Z). */
function _spaceDragCmPerPx(off) {
    const base = new THREE.Vector3(off.x, off.y, off.z || 0);
    const v0 = base.clone().project(camera);
    const vx = base.clone().add(new THREE.Vector3(100, 0, 0)).project(camera);
    const vy = base.clone().add(new THREE.Vector3(0, 100, 0)).project(camera);
    const dxPx = ((vx.x - v0.x) * 0.5) * container.clientWidth;
    const dyPx = ((v0.y - vy.y) * 0.5) * container.clientHeight;
    return { x: dxPx !== 0 ? 100 / dxPx : 1, y: dyPx !== 0 ? 100 / dyPx : 1 };
}

window._buildSpaceCabMoveHandle = function() {
    const info = typeof window._getSpacePairInfo === 'function' ? window._getSpacePairInfo() : null;
    if (!info || info.activeSlot <= 0 || state.viewMode !== 'front') return;
    const item = window._getSpaceMovableItem();
    const off = window._getSpaceOffset(item);
    const h = window._spaceSlot1Height();
    const n = info.activeSlot + 1;
    const handle = document.createElement('div');
    handle.className = 'drag-handle space-move-handle';
    handle.dataset.worldY = String(h);
    handle.innerHTML = `<div class="drag-tooltip">הזז ארון ${n}: ${off.x}, ${off.y} ס"מ</div>`;
    handle.style.display = 'flex';
    if (window._spaceCabDrag && window._spaceCabDrag.axis === 'xy') handle.classList.add('active');
    dragLayer.appendChild(handle);

    const zHandle = document.createElement('div');
    zHandle.className = 'drag-handle space-z-handle';
    zHandle.title = 'גרירה למעלה/למטה מזיזה את הארון אחורה/קדימה (ציר Z)';
    zHandle.innerHTML = `<div class="drag-tooltip">עומק ארון ${n}: ${off.z} ס"מ</div>`;
    zHandle.style.display = 'flex';
    if (window._spaceCabDrag && window._spaceCabDrag.axis === 'z') zHandle.classList.add('active');
    dragLayer.appendChild(zHandle);

    function startDrag(e, axis, el) {
        e.preventDefault();
        e.stopPropagation();
        el.setPointerCapture(e.pointerId);
        controls.enabled = false;
        document.body.classList.add('dragging');
        const cur = window._getSpaceOffset(window._getSpaceMovableItem());
        window._spaceCabDrag = {
            axis: axis,
            el: el,
            startMouseX: e.clientX,
            startMouseY: e.clientY,
            startX: cur.x,
            startY: cur.y,
            startZ: cur.z,
            scale: _spaceDragCmPerPx(cur),
            slot: info.activeSlot
        };
        el.classList.add('active');
    }
    handle.addEventListener('pointerdown', function(e) { startDrag(e, 'xy', handle); });
    zHandle.addEventListener('pointerdown', function(e) { startDrag(e, 'z', zHandle); });

    if (window._spaceCabMoveHandler) window.removeEventListener('pointermove', window._spaceCabMoveHandler);
    if (window._spaceCabUpHandler) window.removeEventListener('pointerup', window._spaceCabUpHandler);

    window._spaceCabMoveHandler = function(e) {
        const d = window._spaceCabDrag;
        if (!d) return;
        const dxMouse = e.clientX - d.startMouseX;
        const dyMouse = e.clientY - d.startMouseY;
        if (d.axis === 'z') {
            // Front view looks straight down -Z, so depth uses the horizontal cm/px scale; dragging down = forward
            const nz = d.startZ + dyMouse * d.scale.x;
            window._setSpaceOffset(d.startX, d.startY, { dragging: true, preferAxis: 'z', z: nz, slot: d.slot });
        } else {
            const nx = d.startX + dxMouse * d.scale.x;
            const ny = d.startY + dyMouse * d.scale.y;
            window._setSpaceOffset(nx, ny, { dragging: true, preferAxis: undefined, slot: d.slot });
        }
        const cur = window._getSpaceOffset(window._getSpaceMovableItem());
        const tip = handle.querySelector('.drag-tooltip');
        if (tip) tip.innerText = `הזז ארון ${n}: ${cur.x}, ${cur.y} ס"מ`;
        const zTip = zHandle.querySelector('.drag-tooltip');
        if (zTip) zTip.innerText = `עומק ארון ${n}: ${cur.z} ס"מ`;
        if (typeof updateDragHandlesPosition === 'function') updateDragHandlesPosition();
    };
    window._spaceCabUpHandler = function() {
        const d = window._spaceCabDrag;
        if (!d) return;
        window._spaceCabDrag = null;
        controls.enabled = true;
        document.body.classList.remove('dragging');
        handle.classList.remove('active');
        zHandle.classList.remove('active');
        if (typeof saveHistoryState === 'function') saveHistoryState();
    };
    window.addEventListener('pointermove', window._spaceCabMoveHandler);
    window.addEventListener('pointerup', window._spaceCabUpHandler);
};

function createHandle(dir, x3d, y3d = null, text = 'גרירה') {
    const el = document.createElement('div');
    el.className = `drag-handle ${dir}`;
    el.dataset.x3d = x3d; if(y3d) el.dataset.y3d = y3d;
    // For vertical handles add a larger invisible hit area for easier grabbing
    const hitArea = dir === 'vertical' ? '<div class="drag-hit-area"></div>' : '';
    el.innerHTML = `<div class="drag-tooltip">${text}</div>${hitArea}`;
    el.style.display = 'flex';
    return el;
}

function updateDragHandlesPosition() {
    if(state.viewMode !== 'front') return;
    const cw = container.clientWidth;
    const ch = container.clientHeight;

    document.querySelectorAll('.drag-handle').forEach(handle => {
        let worldPt;
        if (handle.dataset.world === '1') {
            // World-space handle (e.g. upper unit move handle): use worldX/worldY directly
            const wx = parseFloat(handle.dataset.worldX);
            const wy = parseFloat(handle.dataset.worldY);
            // Update worldX from current upper unit position (it may have moved during drag)
            const uuKey = handle.dataset.uuKey;
            const uuWing = uuKey && state.wings[uuKey];
            let currentWX = wx;
            if (uuWing) {
                // Recompute world X from current _upperOffsetX
                const parentId = uuWing._parentWingId || 'center';
                const centerWing = state.wings.center;
                if (parentId === 'left') {
                    const leftEdgeX = centerWing ? -centerWing.width / 2 : -80;
                    const parentWing = state.wings[parentId];
                    const parentD = parentWing ? (parentWing.depth || 54) : 54;
                    currentWX = leftEdgeX - parentD / 2 + (uuWing._upperOffsetX || 0);
                } else if (parentId === 'right') {
                    const rightEdgeX = centerWing ? centerWing.width / 2 : 80;
                    const parentWing = state.wings[parentId];
                    const parentD = parentWing ? (parentWing.depth || 54) : 54;
                    currentWX = rightEdgeX + parentD / 2 + (uuWing._upperOffsetX || 0);
                } else {
                    currentWX = (uuWing._upperOffsetX || 0);
                }
            }
            worldPt = new THREE.Vector3(currentWX, wy, state.depth / 2);
        } else if (handle.classList.contains('space-move-handle')) {
            const item = typeof window._getSpaceMovableItem === 'function' ? window._getSpaceMovableItem()
                : (typeof window._getSpaceSlot1Item === 'function' ? window._getSpaceSlot1Item() : null);
            const off = typeof window._getSpaceOffset === 'function' ? window._getSpaceOffset(item) : { x: 0, y: 0 };
            const hy = parseFloat(handle.dataset.worldY) || 0;
            worldPt = new THREE.Vector3(off.x, off.y + hy, (off.z || 0) + (state.depth || 54) / 2);
        } else if (handle.classList.contains('space-z-handle')) {
            // Front edge of the side panel facing away from the anchor cabinet, at mid height
            const info = typeof window._getSpacePairInfo === 'function' ? window._getSpacePairInfo() : null;
            const slot = info && info.activeSlot > 0 ? info.activeSlot : 1;
            const off = window._getSpaceOffset(window._getSpaceMovableItem());
            const fp = window._spaceCabinetFootprint(slot);
            const side = off.x >= 0 ? 1 : -1;
            const fo = fp.floorOffset || 0;
            worldPt = new THREE.Vector3(off.x + side * fp.w / 2, off.y + fo + (fp.h - fo) / 2, (off.z || 0) + fp.d / 2);
        } else {
            const x3d = parseFloat(handle.dataset.x3d);
            const y3d = handle.dataset.y3d ? parseFloat(handle.dataset.y3d) : Math.max(...state.columns.map(c => c.height));
            worldPt = new THREE.Vector3(x3d, y3d, state.depth / 2);
            if (window._activeWingGroup) {
                window._activeWingGroup.updateMatrixWorld(true);
                worldPt.applyMatrix4(window._activeWingGroup.matrixWorld);
            } else if (window.cabinetGroup) {
                window.cabinetGroup.updateMatrixWorld(true);
                worldPt.applyMatrix4(window.cabinetGroup.matrixWorld);
            }
        }
        const pos = worldPt.project(camera);
        
        let x = (pos.x * .5 + .5) * cw;
        let y = (-(pos.y * .5) + .5) * ch;

        // גבולות גזרה לידיות הגרירה
        const w = handle.offsetWidth || 24;
        const h = handle.offsetHeight || 24;
        x = Math.max(w/2 + 5, Math.min(cw - w/2 - 5, x));
        y = Math.max(h/2 + 5, Math.min(ch - h/2 - 5, y));

        handle.style.left = `${x}px`;
        // Upper unit move handle: raise 20px above projected position
        handle.style.top = `${handle.classList.contains('uu-move-handle') ? y - 20 : y}px`;
    });
    if (typeof window._updateShelfTrashPos === 'function') window._updateShelfTrashPos();
}

// ── Bed controls toolbar ──────────────────────────────────────────────────────
// A compact grouped toolbar appears near the bed when:
//   - Room is visible AND bed is loaded
//   - Mouse is hovering over the bed area (within ~80px of projected bed center)
//   - OR a drag is in progress
//
// Buttons:
//   #bed-handle-x      — drag left/right  → changes window._bedPos.x
//   #bed-handle-z      — drag up/down     → changes window._bedPos.z
//   #bed-handle-rotate — click to rotate 90°
//
// Wall clamping: bed position is clamped to window._roomBounds so it can't
// pass through walls. Half-size of bed (~100cm) is used as margin.

window._bedDrag      = null;   // { axis:'x'|'z', startMouseX, startMouseY, startVal }
window._bedHovered   = false;  // true when mouse is near bed center on screen
const BED_HALF = 100;          // fallback half-size (cm) when mesh not yet built

// Clamp bed position to room bounds using actual bed footprint when available
function _clampBedPos(bp) {
    const b = window._roomBounds;
    if (!b) return bp;
    const ext = (typeof window._getBedClampHalfExtents === 'function')
        ? window._getBedClampHalfExtents()
        : { halfX: BED_HALF, halfZ: BED_HALF };
    bp.x = Math.max(b.leftX + ext.halfX, Math.min(b.rightX - ext.halfX, bp.x));
    bp.z = Math.max(b.backZ + ext.halfZ, Math.min(b.frontZ - ext.halfZ, bp.z));
    return bp;
}

// Project bed center to screen coords; returns {sx, sy} or null if behind camera
function _projectBedCenter() {
    const bp = window._bedPos || { x: 100, z: 200 };
    const bedY = 50;
    // _bedPos is in room coordinates; the room group is placed around the open cabinet
    const worldPt = new THREE.Vector3(bp.x, bedY, bp.z);
    if (window._roomGroup) {
        window._roomGroup.updateMatrixWorld(true);
        worldPt.applyMatrix4(window._roomGroup.matrixWorld);
    }
    const pos = worldPt.project(camera);
    if (pos.z > 1) return null; // behind camera
    const cw = container.clientWidth;
    const ch = container.clientHeight;
    return {
        sx: (pos.x *  0.5 + 0.5) * cw,
        sy: (pos.y * -0.5 + 0.5) * ch
    };
}

window._updateBedHandles = function() {
    const tb = document.getElementById('bed-toolbar');
    if (!tb) return;

    const shouldShow = (window._roomVisible || state.viewMode === 'room-plan') && window._bedGroup && window._bedVisible !== false &&
                       (state.viewMode !== 'room-plan' || window._roomPlanSubview === '3d') &&
                       (window._bedHovered || window._bedDrag);
    if (!shouldShow) { tb.style.display = 'none'; return; }

    const proj = _projectBedCenter();
    if (!proj) { tb.style.display = 'none'; return; }

    const cw = container.clientWidth;
    const ch = container.clientHeight;
    // Position toolbar just above the projected bed center
    const tbW = 120; // approximate toolbar width
    const tbH = 40;  // approximate toolbar height
    const left = Math.max(tbW / 2, Math.min(cw - tbW / 2, proj.sx));
    const top  = Math.max(tbH / 2 + 10, proj.sy - 50);

    tb.style.display = 'block';
    tb.style.left = left + 'px';
    tb.style.top  = top  + 'px';
};

// Wire up bed toolbar events (runs once after DOM is ready)
(function _bindBedHandles() {
    const tb = document.getElementById('bed-toolbar');
    const hx = document.getElementById('bed-handle-x');
    const hz = document.getElementById('bed-handle-z');
    if (!tb || !hx || !hz) { setTimeout(_bindBedHandles, 300); return; }

    // Show toolbar on hover near bed center
    container.addEventListener('pointermove', function(e) {
        if (window._bedDrag) return; // keep visible during drag
        if (!window._roomVisible || !window._bedGroup) {
            window._bedHovered = false;
            return;
        }
        // Also stay visible when hovering over the toolbar itself
        const overToolbar = e.target.closest('#bed-toolbar');
        if (overToolbar) { window._bedHovered = true; return; }
        const proj = _projectBedCenter();
        if (!proj) { window._bedHovered = false; return; }
        // Convert client coords to canvas-relative coords for distance check
        const rect = container.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        const dx = mx - proj.sx;
        const dy = my - proj.sy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        window._bedHovered = dist < 90;
    });

    // Hide toolbar when mouse leaves canvas (unless dragging)
    container.addEventListener('pointerleave', function() {
        if (!window._bedDrag) window._bedHovered = false;
    });

    // Drag materials — floor warm brown, walls white, bed keeps original
    const _dragMatFloor = new THREE.MeshLambertMaterial({ color: 0xc8966a });
    const _dragMatWall  = new THREE.MeshLambertMaterial({ color: 0xf0ede8 });
    window._roomMatBackup = null;

    function _stripRoomTextures() {
        if (window._roomMatBackup) return;
        window._roomMatBackup = new Map();
        if (!window._roomGroup) return;
        window._roomGroup.traverse(function(obj) {
            if (!obj.isMesh || !obj.material) return;
            // Keep bed meshes with their original material
            var isBedMesh = false;
            var p = obj.parent;
            while (p) { if (p === window._bedMesh) { isBedMesh = true; break; } p = p.parent; }
            if (isBedMesh) return;

            window._roomMatBackup.set(obj, obj.material);
            // Floor: rotated -90° on X axis (PlaneGeometry facing up)
            var isFloor = obj.userData.roomPart === 'floor' ||
                          (obj.geometry && obj.geometry.type === 'PlaneGeometry' &&
                           Math.abs(obj.rotation.x + Math.PI / 2) < 0.01);
            obj.material = isFloor ? _dragMatFloor : _dragMatWall;
        });
    }

    function _restoreRoomTextures() {
        if (!window._roomMatBackup) return;
        window._roomMatBackup.forEach(function(mat, obj) { obj.material = mat; });
        window._roomMatBackup = null;
    }

    function onBedPointerDown(e) {
        e.preventDefault();
        e.stopPropagation();
        const axis = this.dataset.axis; // 'x' or 'z'
        const bp = window._bedPos || { x: 100, z: 200 };
        window._bedDrag = {
            axis,
            startMouseX: e.clientX,
            startMouseY: e.clientY,
            startVal: axis === 'x' ? bp.x : bp.z,
            startX: bp.x,
            startZ: bp.z
        };
        this.classList.add('dragging');
        if (typeof controls !== 'undefined') controls.enabled = false;
        document.body.classList.add('dragging');
        _stripRoomTextures();
    }

    hx.addEventListener('pointerdown', onBedPointerDown);
    hz.addEventListener('pointerdown', onBedPointerDown);

    // Prevent toolbar button clicks from bubbling to canvas (would toggle bed hide)
    tb.querySelectorAll('button').forEach(function(btn) {
        btn.addEventListener('pointerdown', function(e) { e.stopPropagation(); });
        btn.addEventListener('pointerup', function(e) { e.stopPropagation(); });
    });

    const furnBar = document.getElementById('room-furniture-toolbar');
    if (furnBar) {
        furnBar.querySelectorAll('button').forEach(function(btn) {
            btn.addEventListener('pointerdown', function(e) { e.stopPropagation(); });
            btn.addEventListener('pointerup', function(e) { e.stopPropagation(); });
        });
    }

    window.addEventListener('pointermove', function(e) {
        const d = window._bedDrag;
        if (!d) return;
        const bp = window._bedPos || { x: 100, z: 200 };

        // Convert pixel delta to cm using camera projection
        const cw = container.clientWidth;
        const ch = container.clientHeight;
        const refPt  = new THREE.Vector3(0, 50, 100).project(camera);
        const refPt2 = new THREE.Vector3(1, 50, 100).project(camera);
        const pxPerCmX = Math.abs((refPt2.x - refPt.x) * cw / 2) || 1;
        const refPt3 = new THREE.Vector3(0, 50, 101).project(camera);
        const pxPerCmZ = Math.abs((refPt3.y - refPt.y) * ch / 2) || 1;

        // Screen drag → scene-frame delta → room-frame delta (room may be rotated around the cabinet)
        const wdx = d.axis === 'x' ? (e.clientX - d.startMouseX) / pxPerCmX : 0;
        // Z axis: drag up = move toward camera (smaller Z), drag down = away
        const wdz = d.axis === 'x' ? 0 : (e.clientY - d.startMouseY) / pxPerCmZ;
        const rd = (typeof window._worldToRoomDir === 'function') ? window._worldToRoomDir(wdx, wdz) : { x: wdx, z: wdz };
        bp.x = (d.startX != null ? d.startX : bp.x) + rd.x;
        bp.z = (d.startZ != null ? d.startZ : bp.z) + rd.z;
        // Clamp to room walls
        _clampBedPos(bp);
        window._bedPos = bp;

        if (typeof _buildRoom === 'function') {
            _buildRoom();
            // Re-strip textures since _buildRoom creates new objects
            window._roomMatBackup = null;
            _stripRoomTextures();
        }
        window._updateBedHandles();
    });

    window.addEventListener('pointerup', function() {
        if (!window._bedDrag) return;
        document.querySelectorAll('.bed-tb-btn').forEach(h => h.classList.remove('dragging'));
        window._bedDrag = null;
        if (typeof controls !== 'undefined') controls.enabled = true;
        document.body.classList.remove('dragging');
        _restoreRoomTextures();
        // Rebuild room with full GLB bed now that drag ended
        if (typeof _buildRoom === 'function') _buildRoom();
        window._updateBedHandles();
    });
})();

// ── Room wall position helpers ────────────────────────────────────────────────
window._roomWall          = window._roomWall          || 'center';
window._roomWidth         = window._roomWidth         || 0;   // 0 = auto (based on cabinet)
window._roomDepth         = window._roomDepth         || 0;   // 0 = auto
window._roomHeight        = window._roomHeight        || 0;   // 0 = auto (370cm default)
window._closureEnabled    = true;
window._closureWidth      = window._closureWidth      || 1.8; // cm — left side panel width
window._closureWidthRight = window._closureWidthRight || 1.8; // cm — right side panel width (for 'both' mode)
window._closureCeilWidth  = window._closureCeilWidth  || 1.8; // cm — ceiling panel thickness
window._closureDepthWidth = window._closureDepthWidth || 1.8; // cm — depth (front) panel thickness
// 'cabinet' = front face flush with cabinet front; 'door' = front face extends to door front (+1.7cm)
window._closureFrontLine  = window._closureFrontLine  || 'cabinet';
// Array of ceiling closure meshes — populated by buildCabinet, used by animate() for camera-based visibility
window._closureCeilMeshes = window._closureCeilMeshes || [];

window._setRoomWall = function(wall) {
    window._roomWall = wall;
    state.roomWall   = wall;
    // If a cabinet is currently being edited, update its rawState in the cart too
    if (state.editingCartIndex > -1 && state.orderCart[state.editingCartIndex]) {
        if (!state.orderCart[state.editingCartIndex].rawState) state.orderCart[state.editingCartIndex].rawState = {};
        state.orderCart[state.editingCartIndex].rawState.roomWall = wall;
    }
    window._updateRoomWallUI();
    buildCabinet();
    updateLeftSidebar();
};

window._setClosureEnabled = function(_enabled) {
    window._closureEnabled = true;
    buildCabinet();
};

window._setClosureWidthRight = function(val) {
    const v = Math.max(1.8, Math.min(30, parseFloat(val) || 1.8));
    window._closureWidthRight = v;
    const numEl = document.getElementById('inp-num-closure-width-right');
    const slEl  = document.getElementById('inp-closure-width-right');
    if (numEl) numEl.value = v;
    window._setRangeEl(slEl, v);
    buildCabinet();
};

window._setClosureFrontLine = function(val) {
    window._closureFrontLine = (val === 'door') ? 'door' : 'cabinet';
    // Sync button active states via inline styles (buttons use inline styling, not ppm-btn class)
    const btnCab  = document.getElementById('closure-fl-cabinet');
    const btnDoor = document.getElementById('closure-fl-door');
    if (btnCab) {
        const isCab = window._closureFrontLine === 'cabinet';
        btnCab.style.background  = isCab ? 'var(--accent)' : 'var(--bg-light)';
        btnCab.style.color       = isCab ? 'white' : 'var(--text-dark)';
        btnCab.style.borderColor = isCab ? 'var(--accent)' : 'var(--border)';
    }
    if (btnDoor) {
        const isDoor = window._closureFrontLine === 'door';
        btnDoor.style.background  = isDoor ? 'var(--accent)' : 'var(--bg-light)';
        btnDoor.style.color       = isDoor ? 'white' : 'var(--text-dark)';
        btnDoor.style.borderColor = isDoor ? 'var(--accent)' : 'var(--border)';
    }
    buildCabinet();
};

window._setClosureWidth = function(val) {
    const v = Math.max(1.8, Math.min(30, parseFloat(val) || 1.8));
    window._closureWidth = v;
    const numEl = document.getElementById('inp-num-closure-width');
    const slEl  = document.getElementById('inp-closure-width');
    if (numEl) numEl.value = v;
    window._setRangeEl(slEl, v);
    buildCabinet();
};

window._setClosureCeilWidth = function(val) {
    const v = Math.max(1.8, Math.min(30, parseFloat(val) || 1.8));
    window._closureCeilWidth = v;
    const numEl = document.getElementById('inp-num-closure-ceil');
    const slEl  = document.getElementById('inp-closure-ceil');
    if (numEl) numEl.value = v;
    window._setRangeEl(slEl, v);
    buildCabinet();
};

window._setClosureDepthWidth = function(val) {
    const v = Math.max(1.8, Math.min(30, parseFloat(val) || 1.8));
    window._closureDepthWidth = v;
    const numEl = document.getElementById('inp-num-closure-depth');
    const slEl  = document.getElementById('inp-closure-depth');
    if (numEl) numEl.value = v;
    window._setRangeEl(slEl, v);
    buildCabinet();
};

window._setRoomSize = function(dim, val) {
    const v = Math.max(200, parseInt(val) || 0);
    if (dim === 'width')  window._roomWidth  = v;
    if (dim === 'depth')  window._roomDepth  = v;
    if (dim === 'height') window._roomHeight = v;

    // Sync room inputs
    const numEl = document.getElementById('inp-num-room-' + dim);
    const slEl  = document.getElementById('inp-room-' + dim);
    if (numEl) numEl.value = v;
    window._setRangeEl(slEl, v);

    // Update cabinet slider max to match room constraint
    if (dim === 'width') {
        const cabWidthSlider = document.getElementById('inp-width');
        const cabWidthNum    = document.getElementById('inp-num-width');
        if (cabWidthSlider) cabWidthSlider.max = v;
        if (cabWidthNum)    cabWidthNum.max    = v;
        // Clamp current cabinet width if it exceeds new room width
        const _cw = state.wings && state.wings.center ? state.wings.center.width : (state.width || 160);
        if (_cw > v && typeof updateDim === 'function') updateDim('width', 0, v);
    }
    if (dim === 'height') {
        const cabHeightSlider = document.getElementById('inp-height');
        const cabHeightNum    = document.getElementById('inp-num-height');
        const cabHeightPill   = document.getElementById('dim-pill-height');
        if (cabHeightSlider) cabHeightSlider.max = v;
        if (cabHeightNum)    cabHeightNum.max    = v;
        if (cabHeightPill)   cabHeightPill.max   = v;
        // Clamp current cabinet height if it exceeds new room height
        const _ch = state.globalHeight || 240;
        if (_ch > v && typeof updateDim === 'function') updateDim('height', 0, v);
    }

    buildCabinet();
    if (state.viewMode === 'room-plan' && typeof window._renderRoomPlan2D === 'function') {
        window._renderRoomPlan2D();
    }
};

window._updateRoomWallUI = function() {
    const _preset = state.presetId || 'linear';
    const _isLinearOrSliding = (_preset === 'linear' || _preset === 'sliding');

    // Sync sidebar room-wall-section visibility
    const rwSec = document.getElementById('room-wall-section');
    if (rwSec) rwSec.style.display = _isLinearOrSliding ? '' : 'none';

    const _rw = window._roomWall || 'center';

    // ── Position buttons: always visible for linear/sliding ─────────────────
    const posRow = document.getElementById('room-wall-pos-row');

    if (!_isLinearOrSliding) {
        if (posRow) posRow.style.display = 'none';
        return;
    }

    // Show position buttons row
    if (posRow) posRow.style.display = '';

    // Highlight active position button
    ['center','left','both','right'].forEach(function(w) {
        const btn = document.getElementById('rw-btn-' + w);
        if (!btn) return;
        const isActive = (_rw === w);
        btn.style.background  = isActive ? 'var(--accent)' : 'var(--bg-light)';
        btn.style.color       = isActive ? 'white' : 'var(--text-dark)';
        btn.style.borderColor = isActive ? 'var(--accent)' : 'var(--border)';
    });

    window._closureEnabled = true;
};

window._syncRangeFill = function(slider) {
    if (!slider || slider.type !== 'range') return;
    const min = parseFloat(slider.min);
    const max = parseFloat(slider.max);
    const val = parseFloat(slider.value);
    if (isNaN(min) || isNaN(max) || max <= min || isNaN(val)) return;
    const ratio = Math.max(0, Math.min(1, (val - min) / (max - min)));
    slider.style.setProperty('--range-ratio', String(ratio));
    slider.style.setProperty('--range-pct', (ratio * 100) + '%');
};

window._syncAllRangeFills = function(root) {
    (root || document).querySelectorAll('input[type="range"]').forEach(function(el) {
        window._syncRangeFill(el);
    });
};

window._setRangeEl = function(el, v) {
    if (!el) return;
    el.value = v;
    window._syncRangeFill(el);
};

function _setCanvasHoverLayersVisible(show) {
    ['dimensions-layer', 'buttons-layer', 'drag-handles-layer', 'col-widths-layer'].forEach(function(id) {
        var layer = document.getElementById(id);
        if (!layer) return;
        if (show) {
            layer.style.transition = 'none';
            layer.style.opacity = '1';
            layer.classList.remove('hover-ui-hidden');
        } else {
            layer.style.transition = 'opacity 0.3s ease-out';
            layer.style.opacity = '0';
            layer.classList.add('hover-ui-hidden');
        }
    });
}

function _isCanvasOverlayUiTarget(el) {
    if (!el || !el.closest) return false;
    return !!el.closest(
        '#column-quick-edit, #full-corner-quick-edit, #bottom-floating-toolbar, #bed-toolbar, #room-props-row, #room-furniture-toolbar, #room-plan-layer, #btn-room-plan-view-toggle, ' +
        '.drag-handle, .dim-container, .col-width-label, .plus-btn, .fc-cell-btn, .select-all-col-btn, .col-template-btn, .cell-select-btn, .sub-cell-btn, .honeycomb-merge-btn, .desk-drawer-merge-btn, .tv-size-btn, #tv-size-menu'
    );
}

// ── Door handle height drag (front view) ────────────────────────────────────
// Drag a door handle up/down (door.handleOffsetY); soft-snaps to neighbouring door handles
// and to the default height. Hovering a moved handle shows a reset-to-default button.
function _initDoorHandleDrag() {
    const SNAP_CM = 2;
    let drag = null;
    let resetBtn = null, resetDoor = null, hideTimer = null;
    let label = null, guide = null;

    const enabled = () => state.viewMode === 'front'
        && window._doorsVisible !== false
        && !document.body.classList.contains('part-paint-active');

    const isShown = o => { for (; o; o = o.parent) if (!o.visible) return false; return true; };

    function pick(e) {
        const objs = window._doorHandleObjs || [];
        if (!objs.length) return null;
        const rect = container.getBoundingClientRect();
        mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(mouse, camera);
        const hits = raycaster.intersectObjects(objs, true);
        for (const h of hits) {
            const root = window._doorHandleRoot(h.object);
            if (root && isShown(root)) return { obj: root, point: h.point };
        }
        return null;
    }

    const worldPos = o => o.getWorldPosition(new THREE.Vector3());

    function toScreen(v) {
        const rect = container.getBoundingClientRect();
        const p = v.clone().project(camera);
        return { x: rect.left + (p.x + 1) / 2 * rect.width, y: rect.top + (1 - p.y) / 2 * rect.height };
    }

    function hideReset() {
        clearTimeout(hideTimer);
        if (resetBtn) resetBtn.style.display = 'none';
        resetDoor = null;
    }

    function showReset(obj) {
        const door = obj.userData.doorHandle.door;
        if (!door.handleOffsetY) { hideReset(); return; }
        clearTimeout(hideTimer);
        if (!resetBtn) {
            resetBtn = document.createElement('button');
            resetBtn.type = 'button';
            resetBtn.className = 'door-handle-reset-btn';
            resetBtn.title = 'החזר ידית למיקום ברירת המחדל';
            resetBtn.innerHTML = '<i class="fa-solid fa-rotate-left"></i>';
            resetBtn.addEventListener('pointerenter', () => clearTimeout(hideTimer));
            resetBtn.addEventListener('pointerleave', () => { hideTimer = setTimeout(hideReset, 600); });
            resetBtn.addEventListener('click', () => {
                if (!resetDoor) return;
                delete resetDoor.handleOffsetY;
                hideReset();
                buildCabinet();
                saveHistoryState();
            });
            document.body.appendChild(resetBtn);
        }
        resetDoor = door;
        const s = toScreen(worldPos(obj));
        resetBtn.style.left = (s.x + 22) + 'px';
        resetBtn.style.top = (s.y - 22) + 'px';
        resetBtn.style.display = 'flex';
    }

    function showLabel(e, off, aligned) {
        if (!label) {
            label = document.createElement('div');
            label.className = 'door-handle-offset-label';
            document.body.appendChild(label);
        }
        const r = Math.round(off * 10) / 10;
        label.textContent = (r === 0 ? 'גובה ברירת מחדל' : (r > 0 ? '↑ ' : '↓ ') + Math.abs(r) + ' ס״מ')
            + (aligned ? ' · מיושר לידית סמוכה' : '');
        label.style.left = e.clientX + 'px';
        label.style.top = e.clientY + 'px';
        label.style.display = 'block';
    }

    function setGuide(a, b) {
        if (guide) { scene.remove(guide); guide.geometry.dispose(); guide = null; }
        if (!a) return;
        const dir = b.clone().sub(a).setY(0);
        const ext = dir.lengthSq() > 0 ? dir.normalize().multiplyScalar(8) : new THREE.Vector3(8, 0, 0);
        const geo = new THREE.BufferGeometry().setFromPoints([a.clone().sub(ext), b.clone().add(ext)]);
        guide = new THREE.Line(geo, new THREE.LineDashedMaterial({ color: 0x2563eb, dashSize: 1.5, gapSize: 1, depthTest: false }));
        guide.computeLineDistances();
        guide.renderOrder = 999;
        scene.add(guide);
    }

    container.addEventListener('pointerdown', e => {
        if (e.button !== 0 || !enabled() || _isCanvasOverlayUiTarget(e.target)) return;
        const hit = pick(e);
        if (!hit) return;
        e.stopPropagation();
        e.preventDefault();
        const ud = hit.obj.userData.doorHandle;
        const door = ud.door;
        const objs = window._doorHandleObjs.filter(o => o.userData.doorHandle.door === door);
        const startOff = Math.max(-ud.maxOff, Math.min(ud.maxOff, door.handleOffsetY || 0));
        const objPos = worldPos(hit.obj);
        const others = window._doorHandleObjs
            .filter(o => o.userData.doorHandle.door !== door && isShown(o))
            .map(o => worldPos(o));
        drag = {
            door, objs, maxOff: ud.maxOff, startOff, off: startOff, moved: false,
            plane: new THREE.Plane().setFromNormalAndCoplanarPoint(camera.getWorldDirection(new THREE.Vector3()).negate(), hit.point),
            startY: hit.point.y,
            defaultY: objPos.y - startOff,
            objPos, others,
            startX: e.clientX, startYpx: e.clientY
        };
        hideReset();
        controls.enabled = false;
        document.body.classList.add('dragging');
    }, true);

    window.addEventListener('pointermove', e => {
        if (!drag) return;
        e.stopPropagation();
        if (!drag.moved && Math.hypot(e.clientX - drag.startX, e.clientY - drag.startYpx) < 3) return;
        drag.moved = true;
        const rect = container.getBoundingClientRect();
        mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(mouse, camera);
        const p = raycaster.ray.intersectPlane(drag.plane, new THREE.Vector3());
        if (!p) return;
        let off = Math.max(-drag.maxOff, Math.min(drag.maxOff, drag.startOff + (p.y - drag.startY)));
        let snapTo = null;
        let best = SNAP_CM;
        drag.others.forEach(o => {
            const d = Math.abs(drag.defaultY + off - o.y);
            if (d < best) { best = d; snapTo = o; }
        });
        if (snapTo && Math.abs(snapTo.y - drag.defaultY) <= drag.maxOff) {
            off = snapTo.y - drag.defaultY;
        } else {
            snapTo = null;
            if (Math.abs(off) < SNAP_CM) off = 0;
        }
        drag.off = off;
        drag.objs.forEach(o => { o.position.y = o.userData.doorHandle.baseY + off; });
        const cur = drag.objPos.clone().setY(drag.defaultY + off);
        setGuide(snapTo ? cur : null, snapTo ? snapTo.clone().setY(cur.y) : null);
        showLabel(e, off, !!snapTo);
    }, true);

    window.addEventListener('pointerup', e => {
        if (!drag) return;
        e.stopPropagation();
        const d = drag;
        drag = null;
        controls.enabled = true;
        document.body.classList.remove('dragging');
        setGuide(null);
        if (label) label.style.display = 'none';
        if (!d.moved) return;
        if (Math.abs(d.off) < 0.05) delete d.door.handleOffsetY;
        else d.door.handleOffsetY = Math.round(d.off * 10) / 10;
        buildCabinet();
        saveHistoryState();
        const moved = (window._doorHandleObjs || []).find(o => o.userData.doorHandle.door === d.door);
        if (moved) showReset(moved);
    }, true);

    container.addEventListener('pointermove', e => {
        if (drag || e.buttons) return;
        const hit = enabled() && !_isCanvasOverlayUiTarget(e.target) ? pick(e) : null;
        container.classList.toggle('handle-drag-hover', !!hit);
        if (hit) showReset(hit.obj);
        else if (resetBtn && resetBtn.style.display !== 'none') {
            clearTimeout(hideTimer);
            hideTimer = setTimeout(hideReset, 900);
        }
    });
    container.addEventListener('wheel', hideReset, { passive: true });
}

function bindUI() {
    // In viewer mode the editor DOM elements don't exist — skip all bindings
    if (window._VIEWER_MODE) return;

    // Keep range track fill in sync with thumb position
    document.addEventListener('input', function(e) {
        if (e.target && e.target.type === 'range') window._syncRangeFill(e.target);
    }, true);
    window._syncAllRangeFills();

    // ── Smooth room-slider dragging: strip textures while dragging, restore on release ──
    // Any range input in the sidebar sets _roomTexDragging=true while held.
    // On pointerup/pointercancel we clear the flag and do a full rebuild with textures.
    window._roomTexDragging = false;
    const _sidebar = document.getElementById('sidebar');
    if (_sidebar) {
        _sidebar.addEventListener('pointerdown', function(e) {
            if (e.target && e.target.type === 'range') {
                window._roomTexDragging = true;
            }
        });
    }
    document.addEventListener('pointerup', function() {
        if (window._roomTexDragging) {
            window._roomTexDragging = false;
            buildCabinet();
        }
    });
    document.addEventListener('pointercancel', function() {
        if (window._roomTexDragging) {
            window._roomTexDragging = false;
            buildCabinet();
        }
    });

    // Patch sub-panel content buttons to use applyContentForce (handles cached index.html)
    [
        { selector: '#hanging-sub-panel button[data-hanging-type]', attr: 'data-hanging-type' },
        { selector: '#drawer-sub-panel button[data-drawer-type]', attr: 'data-drawer-type' },
        { selector: '#honeycomb-sub-panel button[data-honeycomb-type]', attr: 'data-honeycomb-type' },
    ].forEach(({ selector, attr }) => {
        document.querySelectorAll(selector).forEach(btn => {
            const contentType = btn.getAttribute(attr);
            btn.onclick = function() {
                applyContentForce(contentType);
                closeContentSubPanels();
            };
        });
    });
    // Patch main toolbar toggle buttons to pass themselves as triggerBtn (handles cached index.html)
    [
        { id: 'tb-btn-hanging', key: 'hanging' },
        { id: 'tb-btn-drawer', key: 'drawer' },
        { id: 'tb-btn-honeycomb', key: 'honeycomb' },
    ].forEach(({ id, key }) => {
        const btn = document.getElementById(id);
        if (!btn) return;
        btn.onclick = key === 'honeycomb'
            ? function() { onHoneycombBtnClick(this); }
            : function() { toggleContentSubPanel(key, this); };
    });

    const _bfv = document.getElementById('btn-front-view');
    if (_bfv) _bfv.addEventListener('click', (e) => {
        if (state.viewMode === 'room-plan' && typeof window._exitRoomPlanMode === 'function') {
            window._exitRoomPlanMode();
        }
        window._roomVisible = false;
        document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        window._orbitFree = false;
        window._forceCameraAnim = true;
        window._frontCamPositioned = false;
        window._corner3dCamPositioned = false;
        const rb = document.getElementById('btn-reset-view'); if (rb) rb.style.display = 'none';
        state.viewMode = 'front'; updateCameraView(); buildCabinet();
    });
    const _bbv = document.getElementById('btn-blueprint-view');
    if (_bbv) _bbv.addEventListener('click', (e) => {
        document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        window._orbitFree = false;
        window._forceCameraAnim = true;
        window._frontCamPositioned = false;
        const rb = document.getElementById('btn-reset-view'); if (rb) rb.style.display = 'none';
        state.viewMode = 'blueprint'; updateCameraView(); buildCabinet();
    });

    const priceDisplay = document.getElementById('price-display');
    if (priceDisplay) {
        priceDisplay.addEventListener('change', (e) => {
            state.manualPrice = parseInt(e.target.value) || 0; calculatePrice(); saveHistoryState();
        });
    }

    const btnResetPrice = document.getElementById('btn-reset-price');
    if (btnResetPrice) {
        btnResetPrice.addEventListener('click', () => {
            state.manualPrice = null; calculatePrice(); saveHistoryState();
        });
    }

    const installPriceDisplay = document.getElementById('install-price-display');
    if (installPriceDisplay) {
        installPriceDisplay.addEventListener('change', (e) => {
            const v = parseInt(e.target.value);
            getWing().manualInstallPrice = isNaN(v) ? null : v;
            calculatePrice(); saveHistoryState();
        });
    }

    const btnResetInstallPrice = document.getElementById('btn-reset-install-price');
    if (btnResetInstallPrice) {
        btnResetInstallPrice.addEventListener('click', () => {
            getWing().manualInstallPrice = null; calculatePrice(); saveHistoryState();
        });
    }

    document.getElementById('inp-plinth').addEventListener('change', (e) => {
        const typeId = e.target.value;
        const val = typeof window.cabinetTypeEngine === 'function' ? window.cabinetTypeEngine(typeId) : typeId;
        const prevModel = state.cabinetModel;
        const mPlinthSel = document.getElementById('mobile-inp-plinth');
        if (mPlinthSel && mPlinthSel.value !== typeId) mPlinthSel.value = typeId;
        if (val === prevModel) {
            if (state.cabinetTypeId !== typeId) {
                state.cabinetTypeId = typeId;
                state.manualPrice = null;
                calculatePrice(); saveHistoryState();
            }
            return;
        }
        state.cabinetTypeId = typeId;

        const prevPlinth = state.plinthHeight || 0;
        state.cabinetModel = val;

        let nextPlinth = prevPlinth;
        if (val === 'maya') nextPlinth = 7;
        else if (val === 'c9' || val === 'ab2' || val === 'ab2_nohoney') nextPlinth = 8.75;
        else if (val === 'regalim') nextPlinth = 10;

        // Keep existing columns/cells/doors. Only nudge shelf Y so the first cell
        // still sits on the new plinth instead of rebuilding the interior.
        const delta = nextPlinth - prevPlinth;
        if (delta) {
            (state.columns || []).forEach(col => {
                if (!col || col.type === 'desk' || col.noPlinth) return;
                if (Array.isArray(col.shelvesY)) {
                    col.shelvesY = col.shelvesY.map(y => Math.round((y + delta) * 10) / 10);
                }
            });
            const _fcWing = typeof getWing === 'function' ? getWing() : null;
            const _fc = _fcWing && _fcWing.wingPosition === 'full_corner' ? _fcWing.fullCorner : null;
            if (_fc) {
                if (Array.isArray(_fc.shelvesY)) _fc.shelvesY = _fc.shelvesY.map(y => Math.round((y + delta) * 100) / 100);
                if (_fc.splitY) _fc.splitY = Math.round((_fc.splitY + delta) * 100) / 100;
            }
        }

        if (typeof window._setPlinthHeight === 'function') {
            window._setPlinthHeight(nextPlinth, true);
        } else {
            state.plinthHeight = nextPlinth;
            const w = typeof getWing === 'function' ? getWing() : null;
            if (w) w.plinthHeight = nextPlinth;
        }

        if (val === 'ab2') {
            state.handleStyle = 'touch';
            document.querySelectorAll('.handle-style-btn:not(.corner-desk-handle-btn), .mobile-handle-style-btn').forEach(b => {
                b.classList.toggle('active', b.dataset.style === 'touch');
            });
            if (typeof window._syncCornerDeskHandleUI === 'function') window._syncCornerDeskHandleUI();
        }

        state.manualPrice = null;
        buildCabinet(); calculatePrice(); saveHistoryState();
    });

    const placementEl = document.getElementById('inp-placement');
    if (placementEl) {
        placementEl.addEventListener('change', (e) => {
            state.placement = e.target.value;
            buildCabinet(); calculatePrice(); saveHistoryState();
        });
    }

    document.getElementById('inp-desk-side').addEventListener('change', (e) => {
        state.desk.side = e.target.value; state.manualPrice = null;
        if (state.desk.side === 'none' || typeof _clearDeskMergeFlags === 'function') {
            if (typeof _clearDeskMergeFlags === 'function') _clearDeskMergeFlags();
        }
        document.getElementById('desk-controls').style.display = (state.desk.side === 'none') ? 'none' : 'block';
        if (typeof window._syncDeskMergeUI === 'function') window._syncDeskMergeUI();
        buildCabinet(); updateCameraView(); calculatePrice(); saveHistoryState();
    });
    
    document.getElementById('inp-desk-drawers').addEventListener('change', (e) => {
        state.desk.hasDrawers = e.target.checked; state.manualPrice = null;
        if (!state.desk.hasDrawers && typeof _clearDeskMergeFlags === 'function') _clearDeskMergeFlags();
        // Sync button-style UI (CSS handles styling via .active class)
        const hasD = e.target.checked;
        document.querySelectorAll('.desk-drawers-btn').forEach(function(b) {
            b.classList.toggle('active', (b.dataset.drawers === 'true') === hasD);
        });
        if (typeof window._syncDeskMergeUI === 'function') window._syncDeskMergeUI();
        buildCabinet(); calculatePrice(); saveHistoryState();
    });

    ['width', 'height', 'depth'].forEach(id => {
        const slider = document.getElementById(`inp-${id}`);
        const numInp = document.getElementById(`inp-num-${id}`);
        if(slider) {
            // Hide room only after the slider actually moves (input event), restore on release
            let _sliderMoved = false;
            slider.addEventListener('pointerdown', () => { _sliderMoved = false; });
            slider.addEventListener('input', (e) => {
                if (!_sliderMoved) {
                    _sliderMoved = true;
                    window._isDragging = true;
                    if (window._roomGroup) window._roomGroup.visible = false;
                }
                updateDim(id, null, e.target.value);
            });
            slider.addEventListener('pointerup', () => { if (_sliderMoved) { _sliderMoved = false; _endDrag(); } saveHistoryState(); });
            slider.addEventListener('change', () => saveHistoryState());
        }
        if(numInp) { numInp.addEventListener('change', (e) => { updateDim(id, null, e.target.value); saveHistoryState(); }); }
    });

    const plinthHeightSlider = document.getElementById('inp-plinth-height');
    if (plinthHeightSlider) {
        let _plinthSliderMoved = false;
        plinthHeightSlider.addEventListener('pointerdown', () => { _plinthSliderMoved = false; });
        plinthHeightSlider.addEventListener('input', (e) => {
            if (!_plinthSliderMoved) {
                _plinthSliderMoved = true;
                window._isDragging = true;
                if (window._roomGroup) window._roomGroup.visible = false;
            }
            window._setPlinthHeight(e.target.value, true);
        });
        plinthHeightSlider.addEventListener('pointerup', () => {
            if (_plinthSliderMoved) { _plinthSliderMoved = false; _endDrag(); saveHistoryState(); }
        });
    }

    const deskWidthSlider = document.getElementById('inp-desk-width');
    const deskWidthNum = document.getElementById('inp-num-desk-width');
    if(deskWidthSlider) {
        let _deskSliderMoved = false;
        deskWidthSlider.addEventListener('pointerdown', () => { _deskSliderMoved = false; });
        deskWidthSlider.addEventListener('input', (e) => {
            if (!_deskSliderMoved) {
                _deskSliderMoved = true;
                window._isDragging = true;
                if (window._roomGroup) window._roomGroup.visible = false;
            }
            updateDim('deskWidth', null, e.target.value);
        });
        deskWidthSlider.addEventListener('pointerup', () => { if (_deskSliderMoved) { _deskSliderMoved = false; _endDrag(); } saveHistoryState(); });
        deskWidthSlider.addEventListener('change', () => saveHistoryState());
    }
    if(deskWidthNum) { deskWidthNum.addEventListener('change', (e) => { updateDim('deskWidth', null, e.target.value); saveHistoryState(); }); }

    const handleInp = document.getElementById('inp-handle-type');
    if (handleInp) handleInp.addEventListener('change', (e) => { state.handleType = e.target.value; saveHistoryState(); });

    const cabNameInp = document.getElementById('inp-cabinet-name');
    if (cabNameInp) {
        cabNameInp.addEventListener('input', (e) => {
            window._onCabinetNameInput(e.target.value, { save: false, updateSidebar: true });
        });
        cabNameInp.addEventListener('change', (e) => {
            window._onCabinetNameInput(e.target.value, { save: true, updateSidebar: true });
        });
    }

    function _syncCabinetModelLabel(val) {
        const v = val || '';
        if (state.wings && state.wings.center) state.wings.center.cabinetModelLabel = v;
        if (typeof getWing === 'function' && getWing()) getWing().cabinetModelLabel = v;
        const desk = document.getElementById('inp-cabinet-model-label');
        const mobile = document.getElementById('mobile-inp-cabinet-model-label');
        if (desk && desk.value !== v) desk.value = v;
        if (mobile && mobile.value !== v) mobile.value = v;
    }
    const modelLabelInp = document.getElementById('inp-cabinet-model-label');
    if (modelLabelInp) {
        modelLabelInp.addEventListener('input', (e) => { _syncCabinetModelLabel(e.target.value); });
        modelLabelInp.addEventListener('change', () => saveHistoryState());
    }
    const mModelLabelInp = document.getElementById('mobile-inp-cabinet-model-label');
    if (mModelLabelInp) {
        mModelLabelInp.addEventListener('input', (e) => { _syncCabinetModelLabel(e.target.value); });
        mModelLabelInp.addEventListener('change', () => saveHistoryState());
    }

    const cabNotesInp = document.getElementById('inp-cabinet-notes');
    if (cabNotesInp) {
        cabNotesInp.addEventListener('input', (e) => {
            state.cabinetNotes = e.target.value;
            const mNotes = document.getElementById('mobile-inp-cabinet-notes');
            if (mNotes && mNotes.value !== e.target.value) mNotes.value = e.target.value;
        });
        cabNotesInp.addEventListener('change', () => saveHistoryState());
    }

    window._isoToDisplayDate = function(iso) {
        if (!iso) return '';
        const s = String(iso).trim();
        const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (isoMatch) return isoMatch[3] + '/' + isoMatch[2] + '/' + isoMatch[1];
        const dmy = s.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/);
        if (!dmy) return s;
        return String(dmy[1]).padStart(2, '0') + '/' + String(dmy[2]).padStart(2, '0') + '/' + dmy[3];
    };

    window._displayDateToIso = function(display) {
        const s = String(display || '').replace(/_/g, '').trim();
        if (!s) return '';
        let y, m, d;
        const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (isoMatch) {
            y = isoMatch[1]; m = isoMatch[2]; d = isoMatch[3];
        } else {
            const dmy = s.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/);
            if (!dmy) return '';
            d = String(dmy[1]).padStart(2, '0');
            m = String(dmy[2]).padStart(2, '0');
            y = dmy[3];
        }
        const dt = new Date(parseInt(y, 10), parseInt(m, 10) - 1, parseInt(d, 10));
        if (dt.getFullYear() !== parseInt(y, 10) || dt.getMonth() !== parseInt(m, 10) - 1 || dt.getDate() !== parseInt(d, 10)) return '';
        return y + '-' + m + '-' + d;
    };

    window._formatCustomerDeliveryDate = function(iso) {
        return window._isoToDisplayDate(iso);
    };

    function _maskDeliveryDigits(raw) {
        const digits = String(raw || '').replace(/\D/g, '').slice(0, 8);
        if (digits.length <= 2) return digits;
        if (digits.length <= 4) return digits.slice(0, 2) + '/' + digits.slice(2);
        return digits.slice(0, 2) + '/' + digits.slice(2, 4) + '/' + digits.slice(4);
    }

    function _applyDeliveryMask(inp) {
        if (!inp) return;
        const start = inp.selectionStart;
        const old = inp.value;
        const masked = _maskDeliveryDigits(old);
        if (masked === old) return;
        const digitsBefore = old.slice(0, start).replace(/\D/g, '').length;
        inp.value = masked;
        let pos = 0, seen = 0;
        while (pos < masked.length && seen < digitsBefore) {
            if (/\d/.test(masked.charAt(pos))) seen++;
            pos++;
        }
        if (masked.charAt(pos) === '/') pos++;
        try { inp.setSelectionRange(pos, pos); } catch (e) {}
    }

    function _syncDeliveryPickers(iso) {
        const val = iso || '';
        ['cust-delivery-picker', 'mobile-cust-delivery-picker'].forEach(function(id) {
            const el = document.getElementById(id);
            if (el && el.value !== val) el.value = val;
        });
    }

    function _syncDeliveryDisplay(shown) {
        ['cust-delivery', 'mobile-cust-delivery'].forEach(function(id) {
            const el = document.getElementById(id);
            if (el && el.value !== shown) el.value = shown;
        });
        _syncDeliveryPickers(window._displayDateToIso(shown));
    }

    function _openDeliveryPicker(textInp) {
        const wrap = textInp && textInp.closest ? textInp.closest('.date-field-wrap') : null;
        const picker = wrap ? wrap.querySelector('input[type="date"]') : null;
        if (!picker) return;
        const iso = window._displayDateToIso(textInp.value);
        if (iso) picker.value = iso;
        if (typeof picker.showPicker === 'function') {
            try { picker.showPicker(); } catch (e) {}
        }
    }

    window._fillCustomerForm = function() {
        const c = (state && state.customer) || {};
        const pairs = [
            ['cust-name', c.name],
            ['cust-phone', c.phone],
            ['cust-order-num', c.orderNum],
            ['cust-address', c.address],
            ['cust-delivery', window._isoToDisplayDate(c.deliveryDate)],
            ['mobile-cust-name', c.name],
            ['mobile-cust-phone', c.phone],
            ['mobile-cust-order-num', c.orderNum],
            ['mobile-cust-address', c.address],
            ['mobile-cust-delivery', window._isoToDisplayDate(c.deliveryDate)]
        ];
        pairs.forEach(function(p) {
            const el = document.getElementById(p[0]);
            if (el) el.value = p[1] || '';
        });
        _syncDeliveryPickers(c.deliveryDate ? window._displayDateToIso(c.deliveryDate) || String(c.deliveryDate).slice(0, 10) : '');
    };

    ['name', 'phone', 'order-num', 'address', 'delivery'].forEach(field => {
        const el = document.getElementById(`cust-${field}`);
        if (!el) return;
        if (field === 'delivery') {
            const onDeliveryInput = (e) => {
                _applyDeliveryMask(e.target);
                const iso = window._displayDateToIso(e.target.value);
                if (iso || !String(e.target.value).trim()) state.customer.deliveryDate = iso;
                _syncDeliveryPickers(iso);
                const otherId = e.target.id === 'cust-delivery' ? 'mobile-cust-delivery' : 'cust-delivery';
                const other = document.getElementById(otherId);
                if (other && other.value !== e.target.value) other.value = e.target.value;
            };
            const onDeliveryBlur = (e) => {
                const iso = window._displayDateToIso(e.target.value);
                if (iso) {
                    state.customer.deliveryDate = iso;
                    _syncDeliveryDisplay(window._isoToDisplayDate(iso));
                } else if (!String(e.target.value).trim()) {
                    state.customer.deliveryDate = '';
                    _syncDeliveryDisplay('');
                }
            };
            [el, document.getElementById('mobile-cust-delivery')].forEach(function(inp) {
                if (!inp || inp.dataset.deliveryBound) return;
                inp.dataset.deliveryBound = '1';
                if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) {
                    inp.setAttribute('readonly', 'readonly');
                    inp.setAttribute('inputmode', 'none');
                }
                inp.addEventListener('input', onDeliveryInput);
                inp.addEventListener('change', onDeliveryInput);
                inp.addEventListener('blur', onDeliveryBlur);
                inp.addEventListener('click', function() { _openDeliveryPicker(inp); });
                inp.addEventListener('keydown', function(ev) {
                    if (ev.key === 'ArrowDown' || ev.key === 'Enter') {
                        ev.preventDefault();
                        _openDeliveryPicker(inp);
                    }
                });
                const wrap = inp.closest('.date-field-wrap');
                const picker = wrap ? wrap.querySelector('input[type="date"]') : null;
                if (picker && !picker.dataset.deliveryBound) {
                    picker.dataset.deliveryBound = '1';
                    picker.addEventListener('change', function() {
                        const iso = picker.value || '';
                        state.customer.deliveryDate = iso;
                        _syncDeliveryDisplay(iso ? window._isoToDisplayDate(iso) : '');
                    });
                    picker.addEventListener('input', function() {
                        const iso = picker.value || '';
                        state.customer.deliveryDate = iso;
                        _syncDeliveryDisplay(iso ? window._isoToDisplayDate(iso) : '');
                    });
                }
            });
            return;
        }
        const onCustChange = (e) => {
            const key = field === 'order-num' ? 'orderNum' : field;
            state.customer[key] = e.target.value;
            const mobile = document.getElementById('mobile-cust-' + field);
            if (mobile && mobile.value !== e.target.value) mobile.value = e.target.value;
        };
        el.addEventListener('input', onCustChange);
        el.addEventListener('change', onCustChange);
    });

    _bindOrderFormEditor();

    document.getElementById('inp-columns').addEventListener('input', (e) => {
        const val = parseInt(e.target.value);
        const valEl = document.getElementById('val-columns');
        if (valEl && !isNaN(val)) valEl.innerText = val;
    });
    document.getElementById('inp-columns').addEventListener('change', (e) => {
        const val = parseInt(e.target.value);
        if (typeof window._requestColumnCountChange === 'function') {
            window._requestColumnCountChange(val);
        }
    });

    // Show/hide colors not available in sandwich board material
    window._updateSandwichColorVisibility = function() {
        const isSandwich = state.boardMaterial === 'sandwich';
        // On the "חזיתות" (external fronts) tab, show ALL colors even in sandwich mode
        // because sandwich cabinet fronts are melamine and can use any melamine color
        const isExternalTab = state.activeColorPart === 'materialExternal';

        // Colors marked data-no-sandwich: hide on non-external tabs when sandwich is active;
        // show on ALL tabs when melamine is active, and also show on external tab even in sandwich mode
        // MDF: Egger melamine-only colors (data-no-mdf) are hidden on every tab
        const isMdf = state.boardMaterial === 'mdf';
        document.querySelectorAll('.mat-item[data-no-sandwich="true"], .mat-item[data-no-mdf="true"]').forEach(el => {
            const hideSandwich = isSandwich && !isExternalTab && el.getAttribute('data-no-sandwich') === 'true';
            const hideMdf = isMdf && el.getAttribute('data-no-mdf') === 'true';
            el.style.display = (hideSandwich || hideMdf) ? 'none' : '';
        });

        // If sandwich is active and a no-sandwich color is currently selected on any part, reset it
        // Exception: materialExternal is allowed to keep any color (fronts are melamine in sandwich)
        if (isSandwich) {
            const NO_SANDWICH = new Set(['c705','u727','w1200','u232','u604','u638','H1367','H1307','H1227','A427']);
            ['materialBody','materialInternal','materialDesk','materialOpenCell','materialBack'].forEach(part => {
                if (NO_SANDWICH.has(state[part])) {
                    state[part] = 'white_matte';
                }
            });
        }
        if (isMdf) {
            const NO_MDF = new Set(['w1200','u604','u638','u727','u232','H1307','H1367','H1227']);
            ['materialBody','materialInternal','materialDesk','materialOpenCell','materialBack','materialExternal'].forEach(part => {
                if (NO_MDF.has(state[part])) {
                    state[part] = 'white_matte';
                }
            });
        }
    };

    document.getElementById('inp-board-mat').addEventListener('change', (e) => {
        state.boardMaterial = e.target.value; state.manualPrice = null;
        _updateSandwichColorVisibility();
        checkSplits(); buildCabinet(); updateCameraView(); calculatePrice(); saveHistoryState();
    });

    document.getElementById('inp-has-doors').addEventListener('change', (e) => {
        const val = e.target.checked;
        const aw = state.activeWing;
        if (aw === 'sideCabinetRight' || aw === 'sideCabinetLeft') {
            const sc = state.wings.center && state.wings.center.sideCabinet;
            if (sc) sc.hasDoors = val;
        } else {
            ['center', 'left', 'right'].forEach(side => {
                if (state.wings[side]) state.wings[side].hasDoors = val;
            });
            const sc = state.wings.center && state.wings.center.sideCabinet;
            if (sc && sc.side !== 'none') sc.hasDoors = val;
        }
        state.manualPrice = null;
        buildCabinet(); saveHistoryState();
    });

    document.querySelectorAll('.part-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const clickedPart = btn.getAttribute('data-part');

            // Special: "חלק עליון" tab — delegate to _selectUpperUnitColorTab
            if (clickedPart === 'materialUpperUnit') {
                window._selectUpperUnitColorTab(btn);
                return;
            }

            document.querySelectorAll('.part-tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.activeColorPart = clickedPart;
            window._syncGlassTintPanel();
            _updateSandwichColorVisibility();

            document.querySelectorAll('.material-btn').forEach(b => b.classList.remove('active'));
            if (clickedPart === 'glassTint') return;

            // Special: "ארון צד" tab — show the side cabinet's current body color
            if (clickedPart === 'materialSideCabinet') {
                const sc = state.wings.center ? state.wings.center.sideCabinet : null;
                const scMat = sc ? sc.materialBody : 'white_matte';
                const scBtn = document.querySelector(`.material-btn[data-mat="${scMat}"]`);
                if (scBtn) scBtn.classList.add('active');
                return;
            }

            const currentMat = state[state.activeColorPart];
            const matBtn = document.querySelector(`.material-btn[data-mat="${currentMat}"]`);
            if (matBtn) matBtn.classList.add('active');
            else if (currentMat === 'custom') document.getElementById('btn-upload-texture').classList.add('active');
        });
    });

    // Helper: select the "חלק עליון" color tab — shows upper unit's current body color
    window._selectUpperUnitColorTab = function(tabEl) {
        const uuKey = state._activeUpperUnit || ('upperUnit_' + state.activeWing);
        const uuWing = state.wings[uuKey];
        if (!uuWing) return;
        document.querySelectorAll('.part-tab-btn').forEach(b => b.classList.remove('active'));
        if (tabEl) tabEl.classList.add('active');
        else {
            const t = document.getElementById('tab-materialUpperUnit');
            if (t) t.classList.add('active');
        }
        // Store a sentinel so material-btn clicks know to apply to upper unit
        state.activeColorPart = 'materialUpperUnit';
        window._syncGlassTintPanel();
        _updateSandwichColorVisibility();
        document.querySelectorAll('.material-btn').forEach(b => b.classList.remove('active'));
        const uuMat = uuWing.materialBody || 'white_matte';
        const uuBtn = document.querySelector(`.material-btn[data-mat="${uuMat}"]`);
        if (uuBtn) uuBtn.classList.add('active');
    };

    document.querySelectorAll('.material-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            if(e.target.closest('#btn-upload-texture')) return;
            document.querySelectorAll('.material-btn').forEach(b => b.classList.remove('active'));
            const targetBtn = e.target.classList.contains('material-btn') ? e.target : e.target.closest('.material-btn');
            targetBtn.classList.add('active');
            const matValue = targetBtn.getAttribute('data-mat');
            // Special: "חלק עליון" material tab — apply color to upper unit wing
            if (state.activeColorPart === 'materialUpperUnit') {
                if (typeof window.applyUpperUnitMaterial === 'function') window.applyUpperUnitMaterial(matValue);
                return;
            }
            // Special: "ארון צד" material tab — apply color to all side cabinet material fields
            if (state.activeColorPart === 'materialSideCabinet') {
                const sc = state.wings.center ? state.wings.center.sideCabinet : null;
                if (sc) {
                    sc.materialBody = matValue;
                    sc.materialInternal = matValue;
                    sc.materialDesk = matValue;
                    sc.materialOpenCell = matValue;
                    sc.materialBack = matValue;
                    if (typeof window._syncSideCabinetDoorMaterial === 'function') {
                        window._syncSideCabinetDoorMaterial(state.wings.center);
                    }
                    // Also update the parent wing's materialSideCabinet reference color
                    if (state.wings.center) state.wings.center.materialSideCabinet = matValue;
                }
            } else {
                state[state.activeColorPart] = matValue;
                if (state.activeColorPart === 'materialExternal' && state.wings.center) {
                    if (typeof window._syncSideCabinetDoorMaterial === 'function') {
                        window._syncSideCabinetDoorMaterial(state.wings.center);
                    }
                }
            }
            if (state.activeColorPart === 'materialBody' && typeof checkSplits === 'function') checkSplits();
            buildCabinet();
            if (typeof calculatePrice === 'function') calculatePrice();
            saveHistoryState();
        });
    });

    const btnUpload = document.getElementById('btn-upload-texture');
    const inpTexture = document.getElementById('inp-texture');

    if (btnUpload && inpTexture) {
        btnUpload.addEventListener('click', () => inpTexture.click());
        inpTexture.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const url = URL.createObjectURL(file);
            const textureLoader = new THREE.TextureLoader();
            textureLoader.load(url, (texture) => {
                texture.wrapS = THREE.RepeatWrapping; texture.wrapT = THREE.RepeatWrapping; texture.repeat.set(1, 1);
                materials.custom.map = texture; materials.custom.needsUpdate = true;
                document.querySelectorAll('.material-btn').forEach(b => b.classList.remove('active'));
                btnUpload.classList.add('active');
                // Special: "ארון צד" material tab — apply custom texture to all side cabinet material fields
                if (state.activeColorPart === 'materialSideCabinet') {
                    const sc = state.wings.center ? state.wings.center.sideCabinet : null;
                    if (sc) {
                        sc.materialBody = 'custom';
                        sc.materialInternal = 'custom';
                        sc.materialDesk = 'custom';
                        sc.materialOpenCell = 'custom';
                        sc.materialBack = 'custom';
                        if (typeof window._syncSideCabinetDoorMaterial === 'function') {
                            window._syncSideCabinetDoorMaterial(state.wings.center);
                        }
                        if (state.wings.center) state.wings.center.materialSideCabinet = 'custom';
                    }
                } else {
                    state[state.activeColorPart] = 'custom';
                    if (state.activeColorPart === 'materialExternal' && state.wings.center) {
                        if (typeof window._syncSideCabinetDoorMaterial === 'function') {
                            window._syncSideCabinetDoorMaterial(state.wings.center);
                        }
                    }
                }
                buildCabinet(); saveHistoryState();
            });
        });
    }

    window.addEventListener('resize', () => {
        camera.aspect = container.clientWidth / container.clientHeight;
        camera.updateProjectionMatrix(); renderer.setSize(container.clientWidth, container.clientHeight);
        updateCameraView();
    });

    // ---- Wing hover highlight (blue overlay mesh) ----
    let _hoveredWingId = null;
    let _wingHighlightMesh = null;

    function _removeWingHighlight() {
        if (_wingHighlightMesh) {
            scene.remove(_wingHighlightMesh);
            _wingHighlightMesh.geometry.dispose();
            _wingHighlightMesh = null;
        }
    }
    // Expose for engine.js buildCabinet cleanup
    window._removeWingHighlight = _removeWingHighlight;

    function _showWingHighlight(wingId) {
        _removeWingHighlight();
        // Find the hit box for this wing to get its position/size
        const hb = wingHitBoxes.find(h => h.userData.wingId === wingId);
        if (!hb) return;
        const geo = hb.geometry.clone();
        const mat = new THREE.MeshBasicMaterial({
            color: 0x4a9eff,
            transparent: true,
            opacity: 0.18,
            depthWrite: false,
            side: THREE.FrontSide
        });
        _wingHighlightMesh = new THREE.Mesh(geo, mat);
        _wingHighlightMesh.position.copy(hb.position);
        _wingHighlightMesh.rotation.copy(hb.rotation);
        scene.add(_wingHighlightMesh);
    }

    container.addEventListener('pointermove', (e) => {
        window._lastCanvasPointer = { x: e.clientX, y: e.clientY, valid: true };
        if (_isCanvasOverlayUiTarget(e.target)) {
            if (currentHoveredDoor && !e.target.closest('.plus-btn') && !e.target.closest('.select-all-col-btn')) {
                if (typeof window._clearDoorHoverOpacity === 'function') window._clearDoorHoverOpacity(currentHoveredDoor);
                else if (currentHoveredDoor.material) {
                    currentHoveredDoor.material.transparent = false;
                    currentHoveredDoor.material.opacity = 1;
                }
                currentHoveredDoor = null;
            }
        }

        const rect = container.getBoundingClientRect();
        mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(mouse, camera);

        // Wing hover highlight:
        // - Free mode: highlight any wing hit box
        // - Wing edit mode: highlight upperUnit_* hit boxes only (so user can see the upper unit is clickable)
        // - Upper unit edit mode: no highlight
        if (!state._activeUpperUnit && wingHitBoxes && wingHitBoxes.length > 0) {
            const wingIntersects = raycaster.intersectObjects(wingHitBoxes);
            const _rawHoveredId = wingIntersects.length > 0 ? wingIntersects[0].object.userData.wingId : null;
            // In wing edit mode, only highlight upperUnit_* hit boxes
            const newHoveredWingId = (!state.wingEditMode || (_rawHoveredId && _rawHoveredId.startsWith('upperUnit_')))
                ? _rawHoveredId : null;
            if (newHoveredWingId !== _hoveredWingId) {
                _hoveredWingId = newHoveredWingId;
                if (_hoveredWingId) {
                    _showWingHighlight(_hoveredWingId);
                } else {
                    _removeWingHighlight();
                }
            }
        } else if (state._activeUpperUnit && _wingHighlightMesh) {
            _removeWingHighlight();
            _hoveredWingId = null;
        }
        
        const doorIntersects = raycaster.intersectObjects(doorMeshes, true);
        const hoveredDoor = (typeof window._pickDoorHoverMesh === 'function')
            ? window._pickDoorHoverMesh(doorIntersects)
            : (doorIntersects.length > 0 ? doorIntersects[0].object : null);
        if (hoveredDoor) {
            if (currentHoveredDoor !== hoveredDoor) {
                if (currentHoveredDoor) {
                    if (typeof window._clearDoorHoverOpacity === 'function') window._clearDoorHoverOpacity(currentHoveredDoor);
                    else if (currentHoveredDoor.material) {
                        currentHoveredDoor.material.transparent = false;
                        currentHoveredDoor.material.opacity = 1;
                    }
                }
                currentHoveredDoor = hoveredDoor;
                if (typeof window._applyDoorHoverOpacity === 'function') window._applyDoorHoverOpacity(currentHoveredDoor);
                else if (currentHoveredDoor.material) {
                    currentHoveredDoor.material.transparent = true;
                    currentHoveredDoor.material.opacity = 0.15;
                }
            }
        } else {
            if (currentHoveredDoor) {
                if (typeof window._clearDoorHoverOpacity === 'function') window._clearDoorHoverOpacity(currentHoveredDoor);
                else if (currentHoveredDoor.material) {
                    currentHoveredDoor.material.transparent = false;
                    currentHoveredDoor.material.opacity = 1;
                }
                currentHoveredDoor = null;
            }
        }

        const intersects = raycaster.intersectObjects(hitBoxes);
        let hoverCol = -1;
        if (intersects.length > 0) hoverCol = intersects[0].object.userData.colIndex;

        // Desk hover detection — show drag handles when hovering anywhere over the external desk
        const deskIntersects = (window.deskHitBoxes && window.deskHitBoxes.length > 0)
            ? raycaster.intersectObjects(window.deskHitBoxes) : [];
        const newHoveredDesk = deskIntersects.length > 0;
        if (newHoveredDesk !== !!state.hoveredDesk) {
            state.hoveredDesk = newHoveredDesk;
            buildDragHandlesUI();
        }
        
        if (hoverCol !== -1 && hoverCol !== state.hoveredColIndex) {
            state.hoveredColIndex = hoverCol; state.activeEditCol = hoverCol;
            hitBoxes.forEach(hb => {
                if (hb.userData.noHighlight) return; // invisible trigger zones — never show highlight
                const isSelected = _hitBoxSelected(hb);
                const isHovered = (hb.userData.colIndex === state.hoveredColIndex);
                hb.material.opacity = isSelected ? 0.3 : (isHovered ? 0.05 : 0.0);
            });
            buildDragHandlesUI(); updateQuickEditPanelUI();
        } else if (hoverCol === -1 && state.hoveredColIndex !== -1) {
            state.hoveredColIndex = -1;
            hitBoxes.forEach(hb => {
                if (hb.userData.noHighlight) return; // invisible trigger zones — never show highlight
                const isSelected = _hitBoxSelected(hb);
                hb.material.opacity = isSelected ? 0.3 : 0.0;
            });
            buildDragHandlesUI();
        }

        const isOverUI = e.target.closest('#dimensions-layer, #buttons-layer, #drag-handles-layer, #col-widths-layer, #column-quick-edit, #bottom-floating-toolbar');
        const isSelected = state.selection.colIndex !== -1;
        const widthFocused = document.activeElement && document.activeElement.closest && document.activeElement.closest('#col-widths-layer');
        const shouldShowUI = (hoverCol !== -1) || isOverUI || isSelected || state.hoveredDesk || widthFocused;
        _setCanvasHoverLayersVisible(shouldShowUI);
    });

    window._replayCanvasPointerMove = function() {
        const pt = window._lastCanvasPointer;
        if (!pt || !pt.valid) return;
        container.dispatchEvent(new PointerEvent('pointermove', {
            bubbles: true,
            cancelable: true,
            clientX: pt.x,
            clientY: pt.y,
            pointerId: 1,
            pointerType: 'mouse'
        }));
    };

    container.addEventListener('mouseleave', () => {
        // Remove wing highlight when mouse leaves canvas
        if (!state.wingEditMode) {
            _hoveredWingId = null;
            _removeWingHighlight();
        }
        state.hoveredDesk = false;
        if (state.selection.colIndex !== -1) return;
        if (document.activeElement && document.activeElement.closest && document.activeElement.closest('#col-widths-layer')) return;
        _setCanvasHoverLayersVisible(false);
    });

    // Track pointerdown position to distinguish click vs drag
    let _pointerDownX = 0, _pointerDownY = 0;
    let _pointerDownWingId = null; // wing hit at pointerdown (for click detection)
    let _pointerDownOnDeadSpace = false; // pointerdown on dead space in wing edit mode

    let _pointerDownCornerDesk = false;

    _initDoorHandleDrag();

    container.addEventListener('pointerdown', (e) => {
        if (_isCanvasOverlayUiTarget(e.target)) return;
        if (e.button !== 0) return;

        _pointerDownX = e.clientX;
        _pointerDownY = e.clientY;
        _pointerDownWingId = null;
        _pointerDownOnDeadSpace = false;
        _pointerDownCornerDesk = false;

        const rect = container.getBoundingClientRect();
        mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(mouse, camera);

        // In wing edit mode: record if pointerdown is on dead space
        const _isFCEditNow = state.activeWing === 'full_corner_right' || state.activeWing === 'full_corner_left';
        if (state.wingEditMode && !_isFCEditNow) {
            // Regular wing edit: dead space = not hitting any hitBox mesh AND not hitting an upperUnit hit box
            const hitIntersects = raycaster.intersectObjects(hitBoxes);
            const uuHitBoxes = (wingHitBoxes || []).filter(h => h.userData.wingId && h.userData.wingId.startsWith('upperUnit_'));
            const uuIntersects = uuHitBoxes.length > 0 ? raycaster.intersectObjects(uuHitBoxes) : [];
            if (hitIntersects.length === 0 && uuIntersects.length === 0) {
                _pointerDownOnDeadSpace = true;
            }
        } else if (state.wingEditMode && _isFCEditNow) {
            // FC edit mode: dead space = not hitting the full corner group meshes
            const fcSide = state.activeWing.replace('full_corner_', '');
            const fcGroup = window[`_fullCornerGroup_${fcSide}`];
            if (fcGroup) {
                const fcMeshes = [];
                fcGroup.traverse(obj => { if (obj.isMesh) fcMeshes.push(obj); });
                const fcIntersects = raycaster.intersectObjects(fcMeshes);
                if (fcIntersects.length === 0) {
                    _pointerDownOnDeadSpace = true;
                }
            } else {
                // No FC group found — treat any click as dead space exit
                _pointerDownOnDeadSpace = true;
            }
        }

        // Corner desk click — change drawer handle style
        const deskDownHits = (window.deskHitBoxes && window.deskHitBoxes.length > 0)
            ? raycaster.intersectObjects(window.deskHitBoxes) : [];
        _pointerDownCornerDesk = deskDownHits.some(h => h.object.userData.isCornerDesk);

        // Record which wing was hit at pointerdown (for click detection)
        if (!state._activeUpperUnit && wingHitBoxes && wingHitBoxes.length > 0) {
            // In free mode: record any wing hit. In wing edit mode: only record upperUnit_* hits
            // (so clicking the upper unit above a side wing while editing that wing works)
            const wingIntersects = raycaster.intersectObjects(wingHitBoxes);
            if (wingIntersects.length > 0) {
                const _hitWingId = wingIntersects[0].object.userData.wingId || null;
                if (!state.wingEditMode || (_hitWingId && _hitWingId.startsWith('upperUnit_'))) {
                    _pointerDownWingId = _hitWingId;
                }
            }
        }
    });

    container.addEventListener('pointerup', (e) => {
        if (_isCanvasOverlayUiTarget(e.target)) return;
        if (e.button !== 0) return;

        // Only treat as a click if pointer didn't move more than 5px (not a drag)
        const dx = e.clientX - _pointerDownX;
        const dy = e.clientY - _pointerDownY;
        const isClick = (dx * dx + dy * dy) < 25; // 5px threshold

        if (!isClick) return;

        // Shelf pick (always-on): clicking a shelf selects it for delete — skip cell-clear logic
        if (typeof window.handleShelfPickPointerUp === 'function') {
            const shelfResult = window.handleShelfPickPointerUp(e);
            if (shelfResult === 'handled') {
                if (state.selection.colIndex !== -1 || state.selection.rows.length > 0 ||
                    (typeof _activeSubCellIdxs !== 'undefined' && _activeSubCellIdxs.size > 0)) {
                    _clearSubCellSelection();
                    state.selection = { colIndex: -1, rows: [] };
                    closeContentSubPanels();
                    if (typeof buildDimensionsAndButtonsUI === 'function') buildDimensionsAndButtonsUI();
                    if (typeof updateToolbarButtonHighlights === 'function') updateToolbarButtonHighlights();
                }
                return;
            }
        }

        const rect = container.getBoundingClientRect();
        mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(mouse, camera);

        const _spaceHits = (window._spaceCompanionHits && window._spaceCompanionHits.length)
            ? window._spaceCompanionHits
            : (window._spaceCompanionHit ? [window._spaceCompanionHit] : []);
        if (_spaceHits.length) {
            const compHits = raycaster.intersectObjects(_spaceHits, false);
            if (compHits.length > 0 && typeof window.switchSpaceCabinet === 'function') {
                const slot = compHits[0].object.userData.spaceSlot;
                if (slot != null && slot >= 0) {
                    window.switchSpaceCabinet(slot);
                    return;
                }
            }
        }

        // Click on corner desk → handle picker
        if (_pointerDownCornerDesk) {
            const deskUpHits = (window.deskHitBoxes && window.deskHitBoxes.length > 0)
                ? raycaster.intersectObjects(window.deskHitBoxes) : [];
            if (deskUpHits.some(h => h.object.userData.isCornerDesk)) {
                if (typeof window.openCornerDeskHandlePicker === 'function') {
                    window.openCornerDeskHandlePicker();
                }
                return;
            }
        }

        // In wing edit mode: click on dead space → exit to free mode
        if (state.wingEditMode && _pointerDownOnDeadSpace) {
            const _isFCExitNow = state.activeWing === 'full_corner_right' || state.activeWing === 'full_corner_left';
            if (_isFCExitNow) {
                // FC edit mode: any click outside the FC group exits
                exitWingEditMode();
                return;
            }
            const hitIntersects = raycaster.intersectObjects(hitBoxes);
            if (hitIntersects.length === 0) {
                exitWingEditMode();
                return;
            }
        }

        // Click on a wing hit box → enter wing edit mode (or upper unit inline edit)
        // Only if pointerdown AND pointerup are both over the same wing
        if (!state._activeUpperUnit && _pointerDownWingId && wingHitBoxes && wingHitBoxes.length > 0) {
            const wingIntersects = raycaster.intersectObjects(wingHitBoxes);
            if (wingIntersects.length > 0) {
                const wingId = wingIntersects[0].object.userData.wingId;
                if (wingId && wingId === _pointerDownWingId) {
                    // Upper unit hit box → enter inline upper unit edit mode
                    // Allowed in free mode (center upper unit) OR in wing edit mode (side wing upper unit)
                    if (wingId.startsWith('upperUnit_') && typeof window._enterUpperUnitEdit === 'function') {
                        const parentId = wingId.replace('upperUnit_', '');
                        window._enterUpperUnitEdit(parentId);
                        return;
                    }
                    // Wing hit box in free mode → enter wing edit mode
                    if (!state.wingEditMode) {
                        enterWingEditMode(wingId);
                        return;
                    }
                }
            }
        }

        let needsRebuild = false;

        // Click outside UI — close cell/partition toolbar and clear sub-zone selection
        if (state.selection.colIndex !== -1 || state.selection.rows.length > 0 || _activeSubCellIdxs.size > 0) {
            _clearSubCellSelection();
            state.selection = { colIndex: -1, rows: [] };
            closeContentSubPanels();
            needsRebuild = true;
        }

        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObjects(hitBoxes);
        if (intersects.length === 0) {
            state.activeEditCol = -1;
            updateQuickEditPanelUI();
        }

        if (needsRebuild) buildCabinet();
    });

    document.getElementById('btn-save-json').addEventListener('click', () => {
        if (typeof window._commitCurrentCabinetToCart === 'function') {
            window._commitCurrentCabinetToCart({ flash: false });
        }
        const activeCabinet = JSON.parse(JSON.stringify({
            cabinetModel: state.cabinetModel,
            placement: state.placement,
            width: state.width, globalHeight: state.globalHeight, depth: state.depth, thickness: state.thickness,
            plinthHeight: state.plinthHeight, hasDoors: state.hasDoors, handleType: state.handleType, handleStyle: state.handleStyle, handleVariant: state.handleVariant, ridingColor: state.ridingColor,
            cabinetName: state.cabinetName, cabinetModelLabel: (state.wings && state.wings.center && state.wings.center.cabinetModelLabel) || state.cabinetModelLabel || '', cabinetNotes: state.cabinetNotes, manualPrice: state.manualPrice,
            boardMaterial: state.boardMaterial, materialBody: state.materialBody, materialInternal: state.materialInternal,
            materialExternal: state.materialExternal, materialDesk: state.materialDesk, materialOpenCell: state.materialOpenCell, materialBack: state.materialBack, columns: state.columns, desk: state.desk
        }));

        const projectData = {
            customer: state.customer,
            orderForm: state.orderForm,
            cart: state.orderCart,
            editingCartIndex: state.editingCartIndex,
            activeCabinet: activeCabinet,
            wings: state.wings,
            activeWing: state.activeWing,
            presetId: state.presetId
        };
        
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(projectData));
        const dlAnchorElem = document.createElement('a');
        dlAnchorElem.setAttribute("href", dataStr);
        const projName = (window._currentProjectName || state.customer.name || '').trim();
        let fileName = projName
            ? ('project_' + projName.replace(/[\\/:*?"<>|]+/g, '_').slice(0, 60) + '.json')
            : (state.customer.name ? `hazmana_${state.customer.name}.json` : "hazmana_hadasha.json");
        dlAnchorElem.setAttribute("download", fileName);
        dlAnchorElem.click();
    });

    document.getElementById('inp-load-json').addEventListener('change', (e) => {
        const file = e.target.files[0];
        e.target.value = '';
        if (!file) return;

        const reader = new FileReader();
        reader.onload = function(ev) {
            let data;
            try {
                data = JSON.parse(ev.target.result);
            } catch (err) {
                alert('שגיאה בטעינת הקובץ.');
                return;
            }
            if (!data || typeof data !== 'object') {
                alert('שגיאה בטעינת הקובץ.');
                return;
            }

            const hasExisting = typeof window._hasExistingProjectSession === 'function'
                ? window._hasExistingProjectSession()
                : !!(window._currentProjectId || (state.orderCart && state.orderCart.length > 1) || window._isDirty);

            if (!hasExisting) {
                window._applyLoadedJsonProject(data, { mode: 'open' });
                return;
            }

            window._promptJsonLoadChoice(data);
        };
        reader.readAsText(file);
    });

    document.getElementById('btn-add-to-cart').addEventListener('click', () => {
        if (state.wingEditMode && typeof window.confirmWingEdit === 'function') {
            window.confirmWingEdit();
        }
        window._commitCurrentCabinetToCart({ flash: true });
    });

    // Legacy click handler — delegates to openOrderModal
    document.getElementById('btn-open-cart').addEventListener('click', () => openOrderModal('customer'));

    document.getElementById('btn-close-cart').addEventListener('click', () => { document.getElementById('order-modal').style.display = 'none'; });
    
    document.getElementById('order-modal').addEventListener('click', (e) => {
        if (e.target === document.getElementById('order-modal')) { document.getElementById('order-modal').style.display = 'none'; }
    });
}

/** True when the editor already has a real project/session worth protecting. */
window._hasExistingProjectSession = function() {
    if (window._currentProjectId) return true;
    if (window._isDirty) return true;
    const name = String(window._currentProjectName || '').trim();
    if (name && name !== 'פרויקט חדש') return true;
    const cart = state.orderCart || [];
    if (cart.length > 1) return true;
    if (cart.length === 1) {
        const it = cart[0];
        const n = ((it && it.spec && it.spec.customName) || (it && it.rawState && it.rawState.cabinetName) || '').trim();
        if (n) return true;
        if (typeof window._spacePairIdOf === 'function' && window._spacePairIdOf(it)) return true;
    }
    return false;
};

/** Modal: open JSON as new session, or merge its cabinets into the current project. */
window._promptJsonLoadChoice = function(data) {
    const existing = document.getElementById('_json-load-choice-toast');
    if (existing) existing.remove();

    const incoming = (data && (data.cart || data.orderCart)) || [];
    const n = incoming.length;
    const cabLabel = n === 1 ? 'ארון אחד' : (n + ' ארונות');

    const toast = document.createElement('div');
    toast.id = '_json-load-choice-toast';
    toast.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.45);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);';
    toast.innerHTML =
        '<div style="background:#1e2840;color:white;padding:32px 36px;border-radius:20px;font-size:1.05rem;font-weight:600;box-shadow:0 8px 48px rgba(0,0,0,0.55);display:flex;flex-direction:column;align-items:center;gap:18px;min-width:300px;max-width:92vw;text-align:center;direction:rtl;">' +
            '<div style="font-size:2rem;"><i class="fa-solid fa-file-import"></i></div>' +
            '<div style="font-size:1.15rem;font-weight:700;line-height:1.45;">נטען קובץ JSON עם ' + cabLabel + '</div>' +
            '<div style="font-size:0.92rem;font-weight:500;opacity:0.85;line-height:1.5;">מה לעשות עם הפרויקט הפתוח כרגע?</div>' +
            '<div style="display:flex;flex-direction:column;gap:10px;width:100%;">' +
                '<button type="button" id="_json-load-open" style="width:100%;background:#6366f1;color:white;border:none;border-radius:10px;padding:12px 0;font-size:1.02rem;font-weight:700;cursor:pointer;">' +
                    '<i class="fa-solid fa-folder-open"></i> פתח את הקובץ (החלף)' +
                '</button>' +
                '<div style="font-size:0.78rem;font-weight:500;opacity:0.7;margin-top:-4px;line-height:1.4;">הפרויקט הנוכחי יישמר אוטומטית ואז ייפתח הקובץ</div>' +
                '<button type="button" id="_json-load-merge" style="width:100%;background:#0d9488;color:white;border:none;border-radius:10px;padding:12px 0;font-size:1.02rem;font-weight:700;cursor:pointer;">' +
                    '<i class="fa-solid fa-object-group"></i> מזג ארונות לפרויקט הקיים' +
                '</button>' +
                '<div style="font-size:0.78rem;font-weight:500;opacity:0.7;margin-top:-4px;line-height:1.4;">הארונות מהקובץ יתווספו לפרויקט הפתוח</div>' +
                '<button type="button" id="_json-load-cancel" style="width:100%;background:transparent;color:rgba(255,255,255,0.75);border:none;border-radius:10px;padding:10px 0;font-size:0.95rem;font-weight:600;cursor:pointer;">ביטול</button>' +
            '</div>' +
        '</div>';
    document.body.appendChild(toast);

    const close = () => { const t = document.getElementById('_json-load-choice-toast'); if (t) t.remove(); };
    toast.querySelector('#_json-load-cancel').onclick = close;
    toast.addEventListener('click', (e) => { if (e.target === toast) close(); });

    toast.querySelector('#_json-load-merge').onclick = function() {
        close();
        window._applyLoadedJsonProject(data, { mode: 'merge' });
    };

    toast.querySelector('#_json-load-open').onclick = async function() {
        const btn = toast.querySelector('#_json-load-open');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> שומר לפני פתיחה...';
        }
        try {
            if (typeof window._commitCurrentCabinetToCart === 'function') {
                window._commitCurrentCabinetToCart({ flash: false });
            }
            const idBefore = window._currentProjectId;
            const dirtyBefore = !!window._isDirty;
            if (typeof window._saveProjectNow === 'function') {
                await window._saveProjectNow();
            }
            // Name prompt cancelled or save failed — keep current project open
            if ((dirtyBefore || idBefore) && window._isDirty && !window._currentProjectId && !idBefore) {
                if (btn) {
                    btn.disabled = false;
                    btn.innerHTML = '<i class="fa-solid fa-folder-open"></i> פתח את הקובץ (החלף)';
                }
                if (typeof _showToast === 'function') _showToast('השמירה בוטלה — הקובץ לא נפתח', 3500);
                return;
            }
            if (idBefore && window._isDirty) {
                if (btn) {
                    btn.disabled = false;
                    btn.innerHTML = '<i class="fa-solid fa-folder-open"></i> פתח את הקובץ (החלף)';
                }
                if (typeof _showToast === 'function') _showToast('השמירה נכשלה — הקובץ לא נפתח', 4000);
                return;
            }
        } catch (err) {
            console.warn('[JSON load] auto-save before open failed:', err);
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="fa-solid fa-folder-open"></i> פתח את הקובץ (החלף)';
            }
            if (typeof _showToast === 'function') _showToast('השמירה נכשלה — הקובץ לא נפתח', 4000);
            return;
        }
        close();
        window._applyLoadedJsonProject(data, { mode: 'open' });
    };
};

/** Apply a parsed JSON project: replace session (open) or append cabinets (merge). */
window._applyLoadedJsonProject = function(data, opts) {
    opts = opts || {};
    const mode = opts.mode === 'merge' ? 'merge' : 'open';

    if (mode === 'merge') {
        window._mergeJsonCartIntoCurrentProject(data);
        return;
    }

    // ---- Open / replace ----
    window._currentProjectId   = null;
    window._currentProjectName = null;
    window._isDirty            = false;
    if (typeof window._syncBrowserTabTitle === 'function') window._syncBrowserTabTitle();
    if (history.replaceState) history.replaceState(null, '', 'index.html');

    if (data.customer) {
        state.customer = data.customer;
        if (typeof window._fillCustomerForm === 'function') window._fillCustomerForm();
        else {
            const nameEl = document.getElementById('cust-name');
            const phoneEl = document.getElementById('cust-phone');
            const orderEl = document.getElementById('cust-order-num');
            const addrEl = document.getElementById('cust-address');
            if (nameEl) nameEl.value = state.customer.name || '';
            if (phoneEl) phoneEl.value = state.customer.phone || '';
            if (orderEl) orderEl.value = state.customer.orderNum || '';
            if (addrEl) addrEl.value = state.customer.address || '';
            const delEl = document.getElementById('cust-delivery');
            if (delEl) delEl.value = window._isoToDisplayDate
                ? window._isoToDisplayDate(state.customer.deliveryDate)
                : (state.customer.deliveryDate || '');
        }
    }
    if (data.orderForm) state.orderForm = data.orderForm;

    const cart = data.cart || data.orderCart;
    if (cart) {
        state.orderCart = cart;
        const cc1 = document.getElementById('cart-count');
        if (cc1) cc1.innerText = state.orderCart.length;
        if (typeof window._ensureCabinetSelected === 'function') {
            window._ensureCabinetSelected(
                (typeof data.editingCartIndex === 'number') ? data.editingCartIndex : 0
            );
        } else if (typeof updateLeftSidebar === 'function') {
            updateLeftSidebar();
        }
    }

    if (data.wings) {
        if (typeof window._restoreWingsFromSaved === 'function') {
            window._restoreWingsFromSaved(data.wings);
        } else {
            state.wings.center = data.wings.center || state.wings.center;
            state.wings.left = data.wings.left || null;
            state.wings.right = data.wings.right || null;
        }
        state.activeWing = data.activeWing || 'center';
        if (data.presetId) {
            state.presetId = data.presetId;
            const sdSection = document.getElementById('sliding-door-section');
            const suSection = document.getElementById('side-unit-section');
            const cuSection = document.getElementById('corner-unit-section');
            const plinthRow = document.getElementById('plinth-model-row');
            const mobilePlinthRow = document.getElementById('mobile-plinth-model-row');
            const isSliding = data.presetId === 'sliding';
            if (sdSection) sdSection.style.display = isSliding ? '' : 'none';
            if (suSection) suSection.style.display = isSliding ? 'none' : '';
            if (cuSection) cuSection.style.display = isSliding ? 'none' : '';
            if (plinthRow) plinthRow.style.display = isSliding ? 'none' : '';
            if (mobilePlinthRow) mobilePlinthRow.style.display = isSliding ? 'none' : '';
            document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
            const activePresetBtn = document.getElementById(`preset-btn-${data.presetId}`);
            if (activePresetBtn) activePresetBtn.classList.add('active');
            const mobileActivePresetBtn = document.getElementById(`mobile-preset-btn-${data.presetId}`);
            if (mobileActivePresetBtn) mobileActivePresetBtn.classList.add('active');
        }
        ['left', 'right'].forEach(side => {
            const tab = document.getElementById(`wing-tab-${side}`);
            if (tab) tab.style.display = state.wings[side] ? '' : 'none';
        });
        document.querySelectorAll('.wing-tab-btn').forEach(b => {
            b.classList.toggle('active', b.dataset.wing === state.activeWing);
            b.style.background = b.dataset.wing === state.activeWing ? 'var(--accent)' : 'var(--bg-light)';
            b.style.color = b.dataset.wing === state.activeWing ? 'white' : 'var(--text)';
        });
        if (typeof syncSidebarToWing === 'function') syncSidebarToWing();
        if (typeof buildCabinet === 'function') buildCabinet();
        if (typeof updateCameraView === 'function') updateCameraView();
        if (typeof calculatePrice === 'function') calculatePrice();
        if (typeof saveHistoryState === 'function') saveHistoryState();
    } else if (data.activeCabinet) {
        Object.assign(state, data.activeCabinet);
        if (typeof syncSidebarToWing === 'function') syncSidebarToWing();
        if (typeof buildCabinet === 'function') buildCabinet();
        if (typeof updateCameraView === 'function') updateCameraView();
        if (typeof calculatePrice === 'function') calculatePrice();
        if (typeof saveHistoryState === 'function') saveHistoryState();
    }

    if (typeof window._syncSpacePairTabs === 'function') window._syncSpacePairTabs();
    if (typeof _showToast === 'function') _showToast('הקובץ נטען בהצלחה ✓', 3000);
    else alert('הפרויקט נטען בהצלחה!');
};

/** Append cabinets from a JSON file into the currently open project. */
window._mergeJsonCartIntoCurrentProject = function(data) {
    const incoming = (data && (data.cart || data.orderCart)) || [];
    if (!incoming.length) {
        if (typeof _showToast === 'function') _showToast('אין ארונות בקובץ למיזוג', 3000);
        else alert('אין ארונות בקובץ למיזוג');
        return;
    }

    if (typeof window._commitCurrentCabinetToCart === 'function') {
        window._commitCurrentCabinetToCart({ flash: false });
    }

    const pairMap = {};
    function remapItem(src) {
        const clone = JSON.parse(JSON.stringify(src));
        const oldId = clone.spacePairId || (clone.rawState && clone.rawState.spacePairId) || null;
        if (oldId) {
            if (!pairMap[oldId]) {
                pairMap[oldId] = 'sp_m' + Date.now().toString(36) + Math.floor(Math.random() * 10000).toString(36)
                    + '_' + Object.keys(pairMap).length;
            }
            const newId = pairMap[oldId];
            clone.spacePairId = newId;
            if (!clone.rawState) clone.rawState = {};
            clone.rawState.spacePairId = newId;
        }
        return clone;
    }

    const startIdx = state.orderCart.length;
    incoming.forEach(function(it) {
        if (!it) return;
        state.orderCart.push(remapItem(it));
    });

    if (typeof window._importLocalPartColors === 'function') {
        for (let i = startIdx; i < state.orderCart.length; i++) {
            const it = state.orderCart[i];
            if (it && it.rawState && it.rawState.partColors) {
                window._importLocalPartColors('cart' + i, it.rawState.partColors);
            }
        }
    }

    const cc = document.getElementById('cart-count');
    if (cc) cc.innerText = state.orderCart.length;
    window._isDirty = true;
    if (typeof updateLeftSidebar === 'function') updateLeftSidebar({ scrollToActive: true });
    if (typeof window._syncSpacePairTabs === 'function') window._syncSpacePairTabs();
    if (typeof saveHistoryState === 'function') saveHistoryState();

    const added = state.orderCart.length - startIdx;
    const msg = added === 1
        ? 'ארון אחד מוזג לפרויקט הקיים ✓'
        : (added + ' ארונות מוזגו לפרויקט הקיים ✓');
    if (typeof _showToast === 'function') _showToast(msg, 3500);
    else alert(msg);
};

function _showToast(msg, duration = 4000) {
    let toast = document.getElementById('autosave-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'autosave-toast';
        toast.style.cssText = `
            position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
            background: rgba(30,40,60,0.92); color: white; padding: 12px 24px;
            border-radius: 12px; font-size: 0.95rem; font-weight: 600;
            box-shadow: 0 4px 20px rgba(0,0,0,0.3); z-index: 99999;
            transition: opacity 0.4s; pointer-events: none; white-space: nowrap;
        `;
        document.body.appendChild(toast);
    }
    toast.innerText = msg;
    toast.style.opacity = '1';
    clearTimeout(toast._hideTimer);
    toast._hideTimer = setTimeout(() => { toast.style.opacity = '0'; }, duration);
}
window._showToast = _showToast;

/**
 * window.open after a long await (image refresh on a slow PC) loses the click's user activation and is
 * silently popup-blocked. Then ask for one more click, which carries fresh activation. onOpen(win) runs once.
 */
function _openPrintPopup(features, onOpen) {
    const win = window.open('', '_blank', features);
    if (win) { onOpen(win); return; }
    const old = document.getElementById('print-ready-prompt');
    if (old) old.remove();
    const box = document.createElement('div');
    box.id = 'print-ready-prompt';
    box.style.cssText = 'position:fixed;inset:0;z-index:100000;background:rgba(15,23,42,0.45);display:flex;align-items:center;justify-content:center;direction:rtl;';
    box.innerHTML = '<div style="background:#fff;border-radius:14px;padding:22px 26px;box-shadow:0 10px 40px rgba(0,0,0,0.3);text-align:center;max-width:340px;font-family:inherit;">' +
        '<div style="font-size:1.05rem;font-weight:700;color:#1e293b;margin-bottom:14px;">✅ הטופס מוכן להדפסה</div>' +
        '<button type="button" data-act="open" style="background:#2563eb;color:#fff;border:none;border-radius:10px;padding:10px 22px;font-size:1rem;font-weight:700;cursor:pointer;"><i class="fa-solid fa-print"></i> פתח חלון הדפסה</button>' +
        '<div><button type="button" data-act="cancel" style="margin-top:10px;background:none;border:none;color:#64748b;cursor:pointer;font-size:0.9rem;">ביטול</button></div></div>';
    box.addEventListener('click', e => {
        const act = e.target.closest('[data-act]');
        if (!act && e.target !== box) return;
        box.remove();
        if (act && act.dataset.act === 'open') {
            const w = window.open('', '_blank', features);
            if (w) onOpen(w);
            else _showToast('הדפדפן חסם את חלון ההדפסה — אפשרו חלונות קופצים לאתר זה', 6000);
        }
    });
    document.body.appendChild(box);
}
window._openPrintPopup = _openPrintPopup;

// ---- Cart preview refresh (images stripped on project save — regenerate from rawState) ----
function _columnBodyHeight(col, fallback) {
    const h = (col && col.height != null) ? col.height : (fallback || 240);
    const fo = (col && col.floorOffset) || 0;
    return Math.max(0, Math.round(h - fo));
}

function _wingHeightFromData(wing, fallback) {
    if (!wing) return fallback || 240;
    if (wing.columns && wing.columns.length) {
        return Math.max(...wing.columns.map(c => c.height || fallback || 240));
    }
    return wing.globalHeight || fallback || 240;
}

/** Outer cabinet body height: from the bottom panel, not from the floor (hanging units). */
function _wingBodyHeightFromData(wing, fallback) {
    if (!wing) return fallback || 240;
    if (wing.columns && wing.columns.length) {
        return Math.max(...wing.columns.map(c => _columnBodyHeight(c, fallback || wing.globalHeight)));
    }
    return Math.round(wing.globalHeight || fallback || 240);
}

function _specWingFromRaw(rawState) {
    if (!rawState) return null;
    if (rawState.wings) {
        return rawState.wings[rawState.activeWing || 'center'] || rawState.wings.center || null;
    }
    return rawState;
}

function _resolveCabinetDimsStr(item, itemObj) {
    if (itemObj && _cartIsWritingDesk(itemObj)) return (item && item.dimsStr) || '';
    const rs = itemObj && itemObj.rawState;
    const wing = _specWingFromRaw(rs);
    if (wing) return _wingDimsStr(wing, rs);
    return (item && item.dimsStr) || '';
}
window._wingBodyHeightFromData = _wingBodyHeightFromData;

function _cartHasMultiFrontViews(rawState) {
    if (!rawState) return false;
    const pid = rawState.presetId || '';
    if (pid === 'corner-left') return !!(rawState.wings && rawState.wings.left);
    if (pid === 'corner-right') return !!(rawState.wings && rawState.wings.right);
    if (pid === 'walkin') {
        return !!((rawState.wings && rawState.wings.left) || (rawState.wings && rawState.wings.right));
    }
    return false;
}

function _expectedWingCaptureCount(rawState) {
    if (!rawState || !rawState.wings) return 0;
    const pid = rawState.presetId || '';
    if (pid === 'corner-left') return rawState.wings.left ? 1 : 0;
    if (pid === 'corner-right') return rawState.wings.right ? 1 : 0;
    if (pid === 'walkin') {
        let n = 0;
        if (rawState.wings.left) n++;
        if (rawState.wings.right) n++;
        return n;
    }
    return 0;
}

/** Snapshot hasDoors for every wing (proxy writes only touch activeWing). */
function _snapshotAllWingsHasDoors() {
    const snap = {};
    Object.keys(state.wings || {}).forEach(k => {
        const w = state.wings[k];
        if (!w) return;
        if (Object.prototype.hasOwnProperty.call(w, 'hasDoors')) snap[k] = w.hasDoors;
        if (w.sideCabinet && Object.prototype.hasOwnProperty.call(w.sideCabinet, 'hasDoors')) {
            snap[k + '::sideCabinet'] = w.sideCabinet.hasDoors;
        }
    });
    return snap;
}

function _restoreAllWingsHasDoors(snap) {
    if (!snap) return;
    Object.keys(snap).forEach(k => {
        if (k.endsWith('::sideCabinet')) {
            const wingKey = k.slice(0, -'::sideCabinet'.length);
            if (state.wings[wingKey] && state.wings[wingKey].sideCabinet) {
                state.wings[wingKey].sideCabinet.hasDoors = snap[k];
            }
            return;
        }
        if (state.wings[k]) state.wings[k].hasDoors = snap[k];
    });
}

/** Apply hasDoors to all wings — required for corner/walk-in print captures. */
function _setAllWingsHasDoors(val) {
    const v = !!val;
    ['center', 'left', 'right'].forEach(side => {
        if (state.wings[side]) state.wings[side].hasDoors = v;
    });
    Object.keys(state.wings || {}).forEach(k => {
        if (k.startsWith('upperUnit_') && state.wings[k]) state.wings[k].hasDoors = v;
    });
    const sc = state.wings.center && state.wings.center.sideCabinet;
    if (sc && sc.side && sc.side !== 'none') sc.hasDoors = v;
}

function _getSideWingCaptureViews() {
    const pid = state.presetId || '';
    const centerWing = state.wings && state.wings.center;
    const centerW = centerWing ? centerWing.width : state.width;
    const centerD = centerWing ? centerWing.depth : state.depth;
    const views = [];

    const addWing = (side, wing) => {
        if (!wing) return;
        const wingW = wing.width || 80;
        const wingD = wing.depth || 54;
        const wingH = _wingHeightFromData(wing, state.globalHeight);
        const wingPos = wing.wingPosition || 'side';
        const fcSize = (wing.fullCorner && wing.fullCorner.size) || 100;
        let wx, wz;
        if (side === 'left') {
            const leftEdgeX = -centerW / 2;
            if (wingPos === 'side') {
                wx = leftEdgeX - wingD / 2;
                wz = -centerD / 2 + wingW / 2;
            } else if (wingPos === 'full_corner') {
                wx = leftEdgeX - fcSize + wingD / 2;
                wz = -centerD / 2 + fcSize + wingW / 2;
            } else {
                wx = leftEdgeX + wingD / 2;
                wz = centerD / 2 + wingW / 2;
            }
        } else {
            const rightEdgeX = centerW / 2;
            if (wingPos === 'side') {
                wx = rightEdgeX + wingD / 2;
                wz = -centerD / 2 + wingW / 2;
            } else if (wingPos === 'full_corner') {
                wx = rightEdgeX + fcSize - wingD / 2;
                wz = -centerD / 2 + fcSize + wingW / 2;
            } else {
                wx = rightEdgeX - wingD / 2;
                wz = centerD / 2 + wingW / 2;
            }
        }
        const fitH = wingH + 120;
        const fitW = wingW + 150;
        const midY = wingH / 2;
        const camX = side === 'left' ? wx + 1 : wx - 1;
        views.push({
            id: side,
            label: side === 'left' ? 'חזית צד שמאל' : 'חזית צד ימין',
            camPos: [camX, midY, wz],
            camTarget: [wx, midY, wz],
            fitH,
            fitW
        });
    };

    if (pid === 'corner-left' || pid === 'corner-right' || pid === 'walkin') {
        ['left', 'right'].forEach(function(side) {
            const w = state.wings[side];
            const mainSide = pid === 'walkin' || pid === 'corner-' + side;
            if (mainSide || (w && Array.isArray(w.columns) && w.columns.length)) addWing(side, w);
        });
    }
    return views;
}

/** Per-part colors; fills match the blueprint engine so prints, plan and 3D tint line up. */
const _PART_COLORS = {
    'wing:center': { fill: '#e8f0fe', stroke: '#2563eb' },
    'wing:left': { fill: '#d1fae5', stroke: '#059669' },
    'wing:right': { fill: '#fce7f3', stroke: '#db2777' },
    'corner:left': { fill: '#fef3c7', stroke: '#d97706' },
    'corner:right': { fill: '#ede9fe', stroke: '#7c3aed' },
    'wing:sideCabinet': { fill: '#e0f2fe', stroke: '#0284c7' }
};

function _partColorByKey(key) {
    return _PART_COLORS[key] || { fill: '#f1f5f9', stroke: '#1e3a5f' };
}

function _partKeyForObject(obj, root) {
    for (let a = obj; a && a !== root; a = a.parent) {
        const u = a.userData || {};
        if (u.isFullCorner) return 'corner:' + u.side;
        if (u.wingId) {
            const id = String(u.wingId).replace(/^upperUnit_/, '');
            return (id === 'left' || id === 'right' || id === 'center') ? 'wing:' + id : 'wing:sideCabinet';
        }
    }
    return 'wing:center';
}

/** Mask pixels that stay set after eroding by r (separable min filter). */
function _erodeMask(mask, w, h, r) {
    const tmp = new Uint8Array(w * h);
    const out = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
        let run = 0;
        const row = y * w;
        const runs = new Int32Array(w);
        for (let x = 0; x < w; x++) { run = mask[row + x] ? run + 1 : 0; runs[x] = run; }
        run = 0;
        for (let x = w - 1; x >= 0; x--) {
            run = mask[row + x] ? run + 1 : 0;
            tmp[row + x] = (runs[x] > r && run > r) ? 1 : 0;
        }
    }
    const runs = new Int32Array(h);
    for (let x = 0; x < w; x++) {
        let run = 0;
        for (let y = 0; y < h; y++) { run = tmp[y * w + x] ? run + 1 : 0; runs[y] = run; }
        run = 0;
        for (let y = h - 1; y >= 0; y--) {
            run = tmp[y * w + x] ? run + 1 : 0;
            out[y * w + x] = (runs[y] > r && run > r) ? 1 : 0;
        }
    }
    return out;
}

/**
 * Copy the current render and draw a colored line just inside each part's visible silhouette.
 * Must run right after ren.render (the WebGL buffer is not preserved).
 */
function _outlineCabinetPartsOnCanvas(ren, scn, cam) {
    const src = ren.domElement;
    const w = src.width, h = src.height;
    const base = document.createElement('canvas');
    base.width = w; base.height = h;
    const bctx = base.getContext('2d');
    bctx.drawImage(src, 0, 0);
    const root = window.cabinetGroup;
    if (!root || typeof THREE === 'undefined' || root.parent !== scn) return base;

    const entries = [];
    root.traverse(function(obj) {
        if (obj === root) return;
        if (obj.isMesh) {
            const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
            const invisible = mats.some(function(m) { return m && m.transparent && m.opacity === 0; });
            entries.push({ obj: obj, key: invisible ? null : _partKeyForObject(obj, root), visible: obj.visible, material: obj.material });
        } else if (obj.isLine || obj.isSprite || obj.isPoints) {
            entries.push({ obj: obj, key: null, visible: obj.visible, material: obj.material });
        }
    });
    const keys = Array.from(new Set(entries.filter(function(e) { return e.key; }).map(function(e) { return e.key; })));
    if (keys.length < 2) return base;

    const others = scn.children.filter(function(c) { return c !== root && c.visible; });
    const prevBg = scn.background;
    const white = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, toneMapped: false });
    const black = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide, toneMapped: false });
    const out = bctx.getImageData(0, 0, w, h);
    const d = out.data;
    const tmp = document.createElement('canvas');
    tmp.width = w; tmp.height = h;
    const tctx = tmp.getContext('2d');
    const r = Math.max(2, Math.round(w / 600));
    const alpha = 0.55;
    try {
        others.forEach(function(c) { c.visible = false; });
        scn.background = new THREE.Color(0x000000);
        entries.forEach(function(e) { if (!e.key) e.obj.visible = false; });
        keys.forEach(function(key) {
            entries.forEach(function(e) { if (e.key) e.obj.material = e.key === key ? white : black; });
            ren.render(scn, cam);
            tctx.clearRect(0, 0, w, h);
            tctx.drawImage(src, 0, 0);
            const px = tctx.getImageData(0, 0, w, h).data;
            const mask = new Uint8Array(w * h);
            for (let i = 0, j = 0; i < mask.length; i++, j += 4) mask[i] = px[j] > 127 ? 1 : 0;
            const inner = _erodeMask(mask, w, h, r);
            const hex = _partColorByKey(key).stroke.replace('#', '');
            const R = parseInt(hex.slice(0, 2), 16), G = parseInt(hex.slice(2, 4), 16), B = parseInt(hex.slice(4, 6), 16);
            for (let i = 0; i < mask.length; i++) {
                if (mask[i] && !inner[i]) {
                    const j = i * 4;
                    d[j] = Math.round(d[j] + (R - d[j]) * alpha);
                    d[j + 1] = Math.round(d[j + 1] + (G - d[j + 1]) * alpha);
                    d[j + 2] = Math.round(d[j + 2] + (B - d[j + 2]) * alpha);
                }
            }
        });
    } finally {
        entries.forEach(function(e) { e.obj.visible = e.visible; e.obj.material = e.material; });
        others.forEach(function(c) { c.visible = true; });
        scn.background = prevBg;
        white.dispose();
        black.dispose();
    }
    bctx.putImageData(out, 0, 0);
    return base;
}

/** Trim the uniform background around the rendered cabinet (call right after render — WebGL buffer is cleared afterwards). */
function _cropCanvasToContent(src, pad) {
    const w = src.width, h = src.height;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    g.drawImage(src, 0, 0);
    let px;
    try { px = g.getImageData(0, 0, w, h).data; } catch (e) { return src.toDataURL('image/png'); }
    const bg = [px[0], px[1], px[2], px[3]];
    let minX = w, minY = h, maxX = -1, maxY = -1;
    for (let y = 0; y < h; y += 2) {
        for (let x = 0; x < w; x += 2) {
            const i = (y * w + x) * 4;
            const diff = Math.abs(px[i] - bg[0]) + Math.abs(px[i + 1] - bg[1]) + Math.abs(px[i + 2] - bg[2]) + Math.abs(px[i + 3] - bg[3]);
            if (diff > 24) {
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
            }
        }
    }
    if (maxX < 0) return c.toDataURL('image/png');
    minX = Math.max(0, minX - pad); minY = Math.max(0, minY - pad);
    maxX = Math.min(w - 1, maxX + pad); maxY = Math.min(h - 1, maxY + pad);
    const out = document.createElement('canvas');
    out.width = maxX - minX + 1; out.height = maxY - minY + 1;
    out.getContext('2d').drawImage(c, minX, minY, out.width, out.height, 0, 0, out.width, out.height);
    return out.toDataURL('image/png');
}

/** 45° view into the inner corner of a corner cabinet so both fronts show in one shot. */
function _getCornerAngleCaptureView(focusX) {
    const pid = state.presetId || '';
    if (pid !== 'corner-left' && pid !== 'corner-right') return null;
    const wings = state.wings || {};
    const c = wings.center;
    if (!c) return null;
    const cW = c.width || state.width || 160;
    const cD = c.depth || state.depth || 54;
    const rects = [[-cW / 2, cW / 2, -cD / 2, cD / 2]];
    let maxH = _wingHeightFromData(c, state.globalHeight);
    ['left', 'right'].forEach(function(side) {
        const w = wings[side];
        if (!w) return;
        const L = side === 'left';
        const edge = L ? -cW / 2 : cW / 2;
        const wW = w.width || 160;
        const wD = w.depth || cD;
        const hasCols = Array.isArray(w.columns) && w.columns.length > 0;
        const pos = w.wingPosition || 'side';
        maxH = Math.max(maxH, _wingHeightFromData(w, state.globalHeight));
        if (pos === 'full_corner' && w.fullCorner) {
            const fc = w.fullCorner.size || 100;
            rects.push(L ? [edge - fc, edge, -cD / 2, -cD / 2 + fc] : [edge, edge + fc, -cD / 2, -cD / 2 + fc]);
            if (hasCols) {
                rects.push(L ? [edge - fc, edge - fc + wD, -cD / 2 + fc, -cD / 2 + fc + wW]
                             : [edge + fc - wD, edge + fc, -cD / 2 + fc, -cD / 2 + fc + wW]);
            }
        } else if (hasCols && pos === 'front') {
            rects.push(L ? [edge, edge + wD, cD / 2, cD / 2 + wW] : [edge - wD, edge, cD / 2, cD / 2 + wW]);
        } else if (hasCols) {
            rects.push(L ? [edge - wD, edge, -cD / 2, -cD / 2 + wW] : [edge, edge + wD, -cD / 2, -cD / 2 + wW]);
        }
    });
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    rects.forEach(function(r) { x0 = Math.min(x0, r[0]); x1 = Math.max(x1, r[1]); z0 = Math.min(z0, r[2]); z1 = Math.max(z1, r[3]); });
    const dirX = pid === 'corner-right' ? -1 : 1;
    let pMin = Infinity, pMax = -Infinity;
    rects.forEach(function(r) {
        [[r[0], r[2]], [r[0], r[3]], [r[1], r[2]], [r[1], r[3]]].forEach(function(p) {
            const v = (p[0] * -dirX + p[1]) / Math.SQRT2;
            pMin = Math.min(pMin, v); pMax = Math.max(pMax, v);
        });
    });
    const tx = (x0 + x1) / 2 + (focusX || 0);
    const tz = (z0 + z1) / 2;
    return {
        id: 'corner45',
        camPos: [tx + dirX, maxH * 0.72, tz + 1],
        camTarget: [tx, maxH * 0.5, tz],
        fitH: maxH + 140,
        fitW: (pMax - pMin) * 1.15 + 80,
        crop: true,
        outlineParts: true
    };
}

function _captureFrameAtView(cam, ctrl, ren, scn, view, hasDoors) {
    const fitH = view.fitH || 360;
    const fitW = view.fitW || 350;
    cam.fov = 45;
    cam.updateProjectionMatrix();
    const distY = (fitH / 2) / Math.tan(Math.PI * cam.fov / 360);
    const distX = (fitW / 2) / Math.tan(Math.PI * cam.fov / 360) / cam.aspect;
    const dist = Math.max(distY, distX);
    const midY = view.camPos[1];

    const savedWingEdit = state.wingEditMode;
    const savedActiveWing = state.activeWing;
    const isSideWingShot = (view.id === 'left' || view.id === 'right');
    const prevForceDoors = window._spaceCaptureForceDoors;

    window._camAnim = null;
    state.viewMode = 'front';
    // Must set ALL wings — state.hasDoors only writes the active wing via proxy
    window._spaceCaptureForceDoors = !!hasDoors;
    _setAllWingsHasDoors(hasDoors);
    window._captureLedIcons = !hasDoors;

    try {
    if (isSideWingShot) {
        // Isolate the wing (same as edit mode) so the opposite U-leg doesn't block the camera
        state.wingEditMode = true;
        state.activeWing = view.id;
        buildCabinet();
        if (view.id === 'left') {
            cam.position.set(dist, midY, 0);
            ctrl.target.set(0, midY, 0);
        } else {
            cam.position.set(-dist, midY, 0);
            ctrl.target.set(0, midY, 0);
        }
    } else {
        state.wingEditMode = false;
        const dx = view.camPos[0] - view.camTarget[0];
        const dz = view.camPos[2] - view.camTarget[2];
        const len = Math.hypot(dx, dz) || 1;
        const camX = view.camTarget[0] + (dx / len) * dist;
        const camZ = view.camTarget[2] + (dz / len) * dist;
        cam.position.set(camX, midY, camZ);
        ctrl.target.set(view.camTarget[0], view.camTarget[1], view.camTarget[2]);
        buildCabinet();
    }
    ctrl.update();

    if (typeof window._fadeSpaceCompanionsForCapture === 'function' &&
        window._spaceCaptureCompanionOpacity != null) {
        window._fadeSpaceCompanionsForCapture(window._spaceCaptureCompanionOpacity);
    }

    // Ensure door meshes aren't hidden by the editor "הסתר חזיתות" toggle
    if (typeof doorMeshes !== 'undefined' && doorMeshes) {
        doorMeshes.forEach(function(m) { m.visible = !!hasDoors; });
    }
    // Double-render so materials/textures settle (avoids blank/white captures)
    ren.render(scn, cam);
    ren.render(scn, cam);
    const frame = view.outlineParts ? _outlineCabinetPartsOnCanvas(ren, scn, cam) : ren.domElement;
    const dataUrl = view.crop ? _cropCanvasToContent(frame, 18) : frame.toDataURL('image/png');

    state.wingEditMode = savedWingEdit;
    state.activeWing = savedActiveWing;
    return dataUrl;
    } finally {
        window._spaceCaptureForceDoors = prevForceDoors;
        window._captureLedIcons = false;
    }
}

function _previewSlotManual(item, slot) {
    if (slot === 'imgDoors' || slot === 'imgOpen' || slot === 'imgSpaceDoors' || slot === 'imgSpaceOpen') {
        return !!(item && item[slot + 'Manual']);
    }
    const m = /^wing:(\d+):(imgDoors|imgOpen)$/.exec(slot || '');
    if (!m || !item || !item.wingPreviews) return false;
    const w = item.wingPreviews[parseInt(m[1], 10)];
    return !!(w && w[m[2] + 'Manual']);
}

function _orderPreviewImageCardHtml(label, src, alt, opts, slot) {
    const canReplace = !!(opts && opts.replaceable);
    const cartIndex = opts && opts.cartIndex;
    const manual = canReplace && _previewSlotManual(opts.item, slot);
    const actions = canReplace
        ? `<div class="print-img-actions hide-on-print">
                <button type="button" class="print-img-replace" data-cart-index="${cartIndex}" data-slot="${slot}">
                    <i class="fa-solid fa-image"></i> החלף תמונה
                </button>
                <button type="button" class="print-img-restore" data-cart-index="${cartIndex}" data-slot="${slot}" style="display:${manual ? 'inline-flex' : 'none'}">
                    <i class="fa-solid fa-rotate-left"></i> שחזר הדמיה
                </button>
            </div>`
        : '';
    return `
                    <div class="print-img-wrapper${manual ? ' is-replaced' : ''}" data-preview-slot="${slot}">
                        <div class="print-img-head">
                            <div class="img-label">${label}${manual ? ' <span class="print-img-replaced-tag">הוחלף</span>' : ''}</div>
                            ${actions}
                        </div>
                        <img src="${src || ''}" alt="${alt}">
                    </div>`;
}

function _orderPreviewImagesHtml(item, rawState, opts) {
    opts = opts || {};
    opts.item = item;
    const multiFront = _cartHasMultiFrontViews(rawState);
    const centerOutLabel = multiFront ? 'תצוגת חוץ (חזית מרכזית)' : 'תצוגת חוץ (חזיתות)';
    const centerInLabel = multiFront ? 'תצוגת פנים (חזית מרכזית)' : 'תצוגת פנים (חלוקה טכנית)';
    let html = _orderPreviewImageCardHtml(centerOutLabel, item.imgDoors, 'ארון סגור', opts, 'imgDoors')
        + _orderPreviewImageCardHtml(centerInLabel, item.imgOpen, 'ארון פתוח', opts, 'imgOpen');
    if (item.imgSpaceDoors || item.imgSpaceOpen) {
        html += _orderPreviewImageCardHtml(
            'תצוגת חוץ (כל הארונות במרחב)', item.imgSpaceDoors, 'מרחב סגור', opts, 'imgSpaceDoors'
        );
        html += _orderPreviewImageCardHtml(
            'תצוגת פנים (כל הארונות במרחב)', item.imgSpaceOpen, 'מרחב פתוח', opts, 'imgSpaceOpen'
        );
    }
    (item.wingPreviews || []).forEach((w, wi) => {
        html += _orderPreviewImageCardHtml(
            'תצוגת חוץ (' + _escPrintHtml(w.label) + ')', w.imgDoors, 'חזית סגורה', opts, 'wing:' + wi + ':imgDoors'
        );
        html += _orderPreviewImageCardHtml(
            'תצוגת פנים (' + _escPrintHtml(w.label) + ')', w.imgOpen, 'חזית פנימית', opts, 'wing:' + wi + ':imgOpen'
        );
    });
    return html;
}

function _orderPrintPreviewImagesHtml(item, rawState, opts) {
    opts = opts || {};
    const omitSpace = !!opts.omitSpace;
    const centerOnly = !!opts.centerOnly;
    const multiFront = _cartHasMultiFrontViews(rawState);
    const centerOutLabel = multiFront ? 'תצוגת חוץ (חזית מרכזית)' : 'תצוגת חוץ (חזיתות)';
    const centerInLabel = multiFront ? 'תצוגת פנים (חזית מרכזית)' : 'תצוגת פנים (חלוקה טכנית)';
    const imgStyle = 'flex:1;min-height:0;width:100%;object-fit:contain;border:1px solid #e2e8f0;border-radius:4px;';
    const lblStyle = 'font-size:0.85rem;font-weight:600;color:#475569;margin-bottom:4px;padding:4px 8px;background:#f1f5f8;border-radius:4px;';
    const wrapStyle = 'flex:1;display:flex;flex-direction:column;min-height:0;';
    let html = opts.extrasOnly ? '' : `
                    <div style="${wrapStyle}">
                        <div style="${lblStyle}">${centerOutLabel}</div>
                        <img src="${item.imgDoors}" style="${imgStyle}" alt="ארון סגור">
                    </div>
                    <div style="${wrapStyle}">
                        <div style="${lblStyle}">${centerInLabel}</div>
                        <img src="${item.imgOpen}" style="${imgStyle}" alt="ארון פתוח">
                    </div>`;
    if (centerOnly) return html;
    if (!omitSpace && (item.imgSpaceDoors || item.imgSpaceOpen)) {
        html += `
                    <div style="${wrapStyle}">
                        <div style="${lblStyle}">תצוגת חוץ (כל הארונות במרחב)</div>
                        <img src="${item.imgSpaceDoors || ''}" style="${imgStyle}" alt="מרחב סגור">
                    </div>
                    <div style="${wrapStyle}">
                        <div style="${lblStyle}">תצוגת פנים (כל הארונות במרחב)</div>
                        <img src="${item.imgSpaceOpen || ''}" style="${imgStyle}" alt="מרחב פתוח">
                    </div>`;
    }
    (item.wingPreviews || []).forEach(w => {
        html += `
                    <div style="${wrapStyle}">
                        <div style="${lblStyle}">תצוגת חוץ (${_escPrintHtml(w.label)})</div>
                        <img src="${w.imgDoors}" style="${imgStyle}" alt="חזית סגורה">
                    </div>
                    <div style="${wrapStyle}">
                        <div style="${lblStyle}">תצוגת פנים (${_escPrintHtml(w.label)})</div>
                        <img src="${w.imgOpen}" style="${imgStyle}" alt="חזית פנימית">
                    </div>`;
    });
    return html;
}

/** Soften companion cabinets during per-part capture so the focus part stands out. */
window._fadeSpaceCompanionsForCapture = function(opacity) {
    const groups = window._spaceCompanionGroups || [];
    if (!groups.length) return;
    const op = Math.max(0.04, Math.min(1, Number(opacity)));
    groups.forEach(function(g) {
        if (!g) return;
        g.traverse(function(obj) {
            if (!obj || !obj.material) return;
            if (!(obj.isMesh || obj.isLine || obj.isLineSegments)) return;
            if (obj.userData && obj.userData.spaceCompanion) return;
            if (!obj.userData) obj.userData = {};
            if (!obj.userData._fadeMatReady) {
                if (Array.isArray(obj.material)) {
                    obj.material = obj.material.map(function(m) { return m ? m.clone() : m; });
                } else if (obj.material.clone) {
                    obj.material = obj.material.clone();
                }
                obj.userData._fadeMatReady = true;
            }
            const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
            mats.forEach(function(m) {
                if (!m) return;
                m.transparent = true;
                m.opacity = op;
                if ('depthWrite' in m) m.depthWrite = op > 0.85;
                m.needsUpdate = true;
            });
        });
    });
};

window._captureCabinetPreviewImages = function() {
    const cam = window.camera;
    const ctrl = window.controls;
    const ren = window.renderer;
    const scn = window.scene;
    if (!cam || !ctrl || !ren || !scn) {
        return { imgDoors: null, imgOpen: null, wingPreviews: [], multiViewPages: [], multiViewSVG: null, imgSpaceDoors: null, imgSpaceOpen: null };
    }

    const originalDoorsSnap = _snapshotAllWingsHasDoors();
    const originalDoorsVisible = window._doorsVisible;
    const originalViewMode = state.viewMode;
    const savedCamPos = cam.position.clone();
    const savedTarget = ctrl.target.clone();
    const savedCamAnim = window._camAnim;
    const savedCamFov = cam.fov;
    window._doorsVisible = true;

    const snapCenterWing = state.wings.center;
    const snapCols = snapCenterWing && snapCenterWing.columns && snapCenterWing.columns.length > 0
        ? snapCenterWing.columns : null;
    const snapW = snapCenterWing ? snapCenterWing.width : state.width;
    const snapH = snapCols ? Math.max(...snapCols.map(c => c.height)) : state.globalHeight;
    let focusX = 0;
    let focusY = snapH / 2;
    try {
        const pairInfoFocus = (typeof window._getSpacePairInfo === 'function') ? window._getSpacePairInfo() : null;
        if (pairInfoFocus && pairInfoFocus.count >= 2 && typeof window._spaceOffsetForSlot === 'function') {
            const off = window._spaceOffsetForSlot(pairInfoFocus.activeSlot) || { x: 0, y: 0 };
            focusX = off.x || 0;
            focusY = (snapH / 2) + (off.y || 0);
        }
    } catch (e) { /* keep origin focus */ }
    const centerView = {
        camPos: [focusX, focusY, 1],
        camTarget: [focusX, focusY, 0],
        fitH: snapH + 120,
        fitW: snapW + 150
    };

    // Per-part shots: keep companions faintly visible in the background
    window._spaceCaptureCompanionOpacity = 0.12;
    const imgWithDoors = _captureFrameAtView(cam, ctrl, ren, scn, centerView, true);
    const imgNoDoors = _captureFrameAtView(cam, ctrl, ren, scn, centerView, false);

    const wingPreviews = _getSideWingCaptureViews().map(view => ({
        id: view.id,
        label: view.label,
        imgDoors: _captureFrameAtView(cam, ctrl, ren, scn, view, true),
        imgOpen: _captureFrameAtView(cam, ctrl, ren, scn, view, false)
    }));
    let cornerAngle = null;
    const cornerView = _getCornerAngleCaptureView(focusX);
    if (cornerView) {
        cornerAngle = {
            imgDoors: _captureFrameAtView(cam, ctrl, ren, scn, cornerView, true),
            imgOpen: _captureFrameAtView(cam, ctrl, ren, scn, cornerView, false)
        };
    }
    window._spaceCaptureCompanionOpacity = null;

    // Shared-space shot: all cabinets in the pair framed together (open + closed)
    let imgSpaceDoors = null;
    let imgSpaceOpen = null;
    try {
        const pairInfo = (typeof window._getSpacePairInfo === 'function') ? window._getSpacePairInfo() : null;
        const spaceView = (pairInfo && typeof window._computeSpacePairCaptureView === 'function')
            ? window._computeSpacePairCaptureView(pairInfo)
            : null;
        if (spaceView) {
            imgSpaceDoors = _captureFrameAtView(cam, ctrl, ren, scn, spaceView, true);
            imgSpaceOpen = _captureFrameAtView(cam, ctrl, ren, scn, spaceView, false);
        }
    } catch (e) {
        console.warn('[capture] space pair preview failed:', e);
    }

    let multiViewPages = [];
    let multiViewLabels = [];
    let multiViewSVG = null;
    try {
        if (typeof window._generateMultiViewBlueprintPages === 'function') {
            const bpPages = window._generateMultiViewBlueprintPages();
            multiViewPages = bpPages.map(pg => pg.svg);
            multiViewLabels = bpPages.map(pg => pg.label || '');
        }
        if (typeof window._generateMultiViewBlueprintSVG === 'function') {
            multiViewSVG = window._generateMultiViewBlueprintSVG();
        }
    } catch (e) {
        console.warn('[capture] blueprint generation failed:', e);
    }

    cam.fov = savedCamFov;
    cam.updateProjectionMatrix();
    cam.position.copy(savedCamPos);
    ctrl.target.copy(savedTarget);
    ctrl.update();
    window._camAnim = savedCamAnim;
    state.viewMode = originalViewMode;
    updateCameraView();
    _restoreAllWingsHasDoors(originalDoorsSnap);
    window._doorsVisible = originalDoorsVisible;
    buildCabinet();
    ren.render(scn, cam);

    return {
        imgDoors: imgWithDoors,
        imgOpen: imgNoDoors,
        wingPreviews,
        cornerAngle,
        multiViewPages,
        multiViewLabels,
        multiViewSVG,
        imgSpaceDoors,
        imgSpaceOpen,
        captureVer: 5
    };
};

function _cartImageValid(src) {
    return src && typeof src === 'string' && src.startsWith('data:image');
}

window._cartItemNeedsMediaRefresh = function(itemObj) {
    if (!itemObj || !itemObj.rawState || !itemObj.spec) return false;
    const spec = itemObj.spec;
    if (!_cartImageValid(spec.imgDoors) || !_cartImageValid(spec.imgOpen)) return true;
    // v3: walk-in side shots isolate the wing so the opposite U-leg doesn't occlude
    if (_cartHasMultiFrontViews(itemObj.rawState) && (!spec.captureVer || spec.captureVer < 3)) return true;
    if (_cartHasMultiFrontViews(itemObj.rawState)) {
        const expected = _expectedWingCaptureCount(itemObj.rawState);
        const previews = spec.wingPreviews || [];
        if (previews.length < expected) return true;
        if (previews.some(w => !_cartImageValid(w.imgDoors) || !_cartImageValid(w.imgOpen))) return true;
    }
    // v5: shared-space group export — faded companion on per-part shots + closed overview
    const pairId = (typeof window._spacePairIdOf === 'function') ? window._spacePairIdOf(itemObj) : null;
    if (pairId) {
        let pairCount = 0;
        (state.orderCart || []).forEach(function(it) {
            if (window._spacePairIdOf(it) === pairId) pairCount++;
        });
        if (pairCount >= 2) {
            if (!spec.captureVer || spec.captureVer < 5) return true;
            if (!_cartImageValid(spec.imgSpaceDoors) || !_cartImageValid(spec.imgSpaceOpen)) return true;
        }
    }
    if (!spec.multiViewPages || !spec.multiViewPages.length) return true;
    const pid = itemObj.rawState.presetId;
    if ((pid === 'corner-left' || pid === 'corner-right') && !(spec.cornerAngle && _cartImageValid(spec.cornerAngle.imgDoors))) return true;
    return false;
};

function _snapshotEditorState() {
    const cam = window.camera;
    const ctrl = window.controls;
    return {
        wings: JSON.parse(JSON.stringify(state.wings)),
        activeWing: state.activeWing,
        presetId: state.presetId,
        viewMode: state.viewMode,
        hasDoors: state.hasDoors,
        wingEditMode: state.wingEditMode,
        wingEditSnapshot: state.wingEditSnapshot,
        editingCartIndex: state.editingCartIndex,
        blueprintCutouts: JSON.parse(JSON.stringify(state.blueprintCutouts || [])),
        blueprintCellDimOffsets: JSON.parse(JSON.stringify(state.blueprintCellDimOffsets || {})),
        blueprintDimOffsets: JSON.parse(JSON.stringify(state.blueprintDimOffsets || {})),
        blueprintInternalDimsDefault: state.blueprintInternalDimsDefault !== false,
        blueprintCellDimShown: JSON.parse(JSON.stringify(state.blueprintCellDimShown || {})),
        blueprintColWidthDimsDefault: state.blueprintColWidthDimsDefault !== false,
        blueprintColWidthDimShown: JSON.parse(JSON.stringify(state.blueprintColWidthDimShown || {})),
        blueprintHeightDimsDefault: state.blueprintHeightDimsDefault !== false,
        partColors: JSON.parse(JSON.stringify(state.partColors || {})),
        roomWall: window._roomWall || state.roomWall || 'center',
        closureEnabled: window._closureEnabled,
        closureWidth: window._closureWidth,
        closureWidthRight: window._closureWidthRight,
        closureCeilWidth: window._closureCeilWidth,
        closureDepthWidth: window._closureDepthWidth,
        closureFrontLine: window._closureFrontLine,
        camFov: cam ? cam.fov : 45,
        camPos: cam ? cam.position.clone() : null,
        camTarget: ctrl ? ctrl.target.clone() : null,
        camAnim: window._camAnim,
        orbitFree: window._orbitFree
    };
}

function _restoreEditorState(snap) {
    if (!snap) return;
    state.wings = snap.wings;
    state.activeWing = snap.activeWing;
    state.presetId = snap.presetId;
    state.viewMode = snap.viewMode;
    state.hasDoors = snap.hasDoors;
    state.wingEditMode = snap.wingEditMode;
    state.wingEditSnapshot = snap.wingEditSnapshot;
    state.editingCartIndex = snap.editingCartIndex;
    state.blueprintCutouts = snap.blueprintCutouts || [];
    state.blueprintCellDimOffsets = snap.blueprintCellDimOffsets || {};
    state.blueprintDimOffsets = snap.blueprintDimOffsets || {};
    state.blueprintInternalDimsDefault = snap.blueprintInternalDimsDefault !== false;
    state.blueprintCellDimShown = snap.blueprintCellDimShown || {};
    state.blueprintColWidthDimsDefault = snap.blueprintColWidthDimsDefault !== false;
    state.blueprintColWidthDimShown = snap.blueprintColWidthDimShown || {};
    state.blueprintHeightDimsDefault = snap.blueprintHeightDimsDefault !== false;
    state.partColors = snap.partColors || {};
    window._roomWall = snap.roomWall;
    state.roomWall = snap.roomWall;
    window._closureEnabled = snap.closureEnabled;
    window._closureWidth = snap.closureWidth;
    window._closureWidthRight = snap.closureWidthRight;
    window._closureCeilWidth = snap.closureCeilWidth;
    window._closureDepthWidth = snap.closureDepthWidth;
    window._closureFrontLine = snap.closureFrontLine;
    const cam = window.camera;
    const ctrl = window.controls;
    const ren = window.renderer;
    const scn = window.scene;
    if (cam && snap.camPos) {
        cam.fov = snap.camFov;
        cam.updateProjectionMatrix();
        cam.position.copy(snap.camPos);
    }
    if (ctrl && snap.camTarget) {
        ctrl.target.copy(snap.camTarget);
        ctrl.update();
    }
    window._camAnim = snap.camAnim;
    window._orbitFree = snap.orbitFree;
    buildCabinet();
    updateCameraView();
    if (ren && scn && cam) ren.render(scn, cam);
}

function _applyRawStateForCapture(rawState) {
    const rs = JSON.parse(JSON.stringify(rawState));
    if (rs.wings) {
        if (typeof window._restoreWingsFromSaved === 'function') {
            window._restoreWingsFromSaved(JSON.parse(JSON.stringify(rs.wings)));
        } else {
            state.wings = JSON.parse(JSON.stringify(rs.wings));
        }
        state.activeWing = rs.activeWing || 'center';
        state.presetId = rs.presetId || 'linear';
        const flatFromWing = ['cabinetModel', 'placement', 'boardMaterial', 'handleType', 'handleStyle',
            'cabinetName', 'cabinetModelLabel', 'cabinetNotes', 'manualPrice', 'materialBody', 'materialInternal',
            'materialExternal', 'materialDesk', 'materialOpenCell', 'materialBack'];
        flatFromWing.forEach(f => { if (rs[f] !== undefined) state[f] = rs[f]; });
    } else {
        state.presetId = 'linear';
        state.activeWing = 'center';
        state.wings.left = null;
        state.wings.right = null;
        const flatFields = ['cabinetModel', 'placement', 'width', 'globalHeight', 'depth', 'thickness',
            'plinthHeight', 'hasDoors', 'handleType', 'handleStyle', 'cabinetName', 'cabinetModelLabel', 'cabinetNotes', 'manualPrice', 'boardMaterial',
            'materialBody', 'materialInternal', 'materialExternal', 'materialDesk', 'materialOpenCell',
            'materialBack', 'columns', 'desk'];
        flatFields.forEach(f => { if (rs[f] !== undefined) state[f] = rs[f]; });
    }
    state.wingEditMode = false;
    state.wingEditSnapshot = null;
    state.viewMode = 'front';
    window._roomWall = rs.roomWall || 'center';
    state.roomWall = window._roomWall;
    window._closureEnabled = true;
    window._closureWidth = rs.closureWidth || 1.8;
    window._closureWidthRight = rs.closureWidthRight || 1.8;
    window._closureCeilWidth = rs.closureCeilWidth || 1.8;
    window._closureDepthWidth = rs.closureDepthWidth || 1.8;
    window._closureFrontLine = rs.closureFrontLine || 'cabinet';
    state.blueprintCutouts = rs.blueprintCutouts ? JSON.parse(JSON.stringify(rs.blueprintCutouts)) : [];
    state.blueprintCellDimOffsets = rs.blueprintCellDimOffsets ? JSON.parse(JSON.stringify(rs.blueprintCellDimOffsets)) : {};
    state.blueprintDimOffsets = rs.blueprintDimOffsets ? JSON.parse(JSON.stringify(rs.blueprintDimOffsets)) : {};
    state.blueprintInternalDimsDefault = rs.blueprintInternalDimsDefault !== false;
    state.blueprintCellDimShown = rs.blueprintCellDimShown ? JSON.parse(JSON.stringify(rs.blueprintCellDimShown)) : {};
    state.blueprintColWidthDimsDefault = rs.blueprintColWidthDimsDefault !== false;
    state.blueprintColWidthDimShown = rs.blueprintColWidthDimShown ? JSON.parse(JSON.stringify(rs.blueprintColWidthDimShown)) : {};
    state.blueprintHeightDimsDefault = rs.blueprintHeightDimsDefault !== false;
    if (rs.partColors && typeof window._importLocalPartColors === 'function') {
        window._importLocalPartColors('draft', rs.partColors);
        if (typeof window._syncPartColorScope === 'function') window._syncPartColorScope();
    } else if (rs.partColors) {
        state.partColors = JSON.parse(JSON.stringify(rs.partColors));
    }
}

window._snapshotEditorState = _snapshotEditorState;
window._restoreEditorState = _restoreEditorState;
window._applyRawStateForCapture = _applyRawStateForCapture;

window._refreshCartBlueprintPagesForPrint = async function() {
    if (!state.orderCart.length || window._cartBlueprintRefreshRunning) return;
    if (typeof window._generateMultiViewBlueprintPages !== 'function') return;

    window._cartBlueprintRefreshRunning = true;
    const snap = _snapshotEditorState();
    try {
        for (let i = 0; i < state.orderCart.length; i++) {
            const itemObj = state.orderCart[i];
            if (!itemObj || !itemObj.rawState || !itemObj.spec) continue;
            if (typeof window._cartItemOnHold === 'function' && window._cartItemOnHold(itemObj)) continue;
            _applyRawStateForCapture(itemObj.rawState);
            const pages = window._generateMultiViewBlueprintPages();
            if (pages && pages.length) {
                itemObj.spec.multiViewPages = pages.map(function(pg) { return pg.svg; });
                itemObj.spec.multiViewLabels = pages.map(function(pg) { return pg.label || ''; });
                itemObj.spec.multiViewSVG = pages[0].svg;
            }
            await new Promise(function(r) { setTimeout(r, 0); });
        }
    } finally {
        _restoreEditorState(snap);
        window._cartBlueprintRefreshRunning = false;
    }
};

window._refreshCartMediaForPrint = async function(opts) {
    opts = opts || {};
    const force = !!opts.force;
    if (!state.orderCart.length || window._cartMediaRefreshRunning) return;
    if (!force && !state.orderCart.some(window._cartItemNeedsMediaRefresh)) return;

    window._cartMediaRefreshRunning = true;
    const snap = _snapshotEditorState();
    const prevEditIdx = state.editingCartIndex;
    try {
        for (let i = 0; i < state.orderCart.length; i++) {
            const itemObj = state.orderCart[i];
            if (!itemObj || !itemObj.rawState || !itemObj.spec) continue;
            if (typeof window._cartItemOnHold === 'function' && window._cartItemOnHold(itemObj)) continue;
            if (!force && !window._cartItemNeedsMediaRefresh(itemObj)) continue;
            state.editingCartIndex = i;
            _applyRawStateForCapture(itemObj.rawState);
            buildCabinet();
            // Let the renderer settle before capturing (reduces blank frames)
            await new Promise(function(r) {
                requestAnimationFrame(function() { requestAnimationFrame(r); });
            });
            const media = window._captureCabinetPreviewImages();
            if (media.imgDoors && !itemObj.spec.imgDoorsManual) itemObj.spec.imgDoors = media.imgDoors;
            if (media.imgOpen && !itemObj.spec.imgOpenManual) itemObj.spec.imgOpen = media.imgOpen;
            if (media.wingPreviews && media.wingPreviews.length) {
                const prevWings = itemObj.spec.wingPreviews || [];
                itemObj.spec.wingPreviews = media.wingPreviews.map(function(w, wi) {
                    const old = prevWings.find(function(p) { return p && p.id === w.id; }) || prevWings[wi];
                    if (old && old.imgDoorsManual) {
                        w.imgDoors = old.imgDoors;
                        w.imgDoorsManual = true;
                        if (old.imgDoorsAuto) w.imgDoorsAuto = old.imgDoorsAuto;
                    }
                    if (old && old.imgOpenManual) {
                        w.imgOpen = old.imgOpen;
                        w.imgOpenManual = true;
                        if (old.imgOpenAuto) w.imgOpenAuto = old.imgOpenAuto;
                    }
                    return w;
                });
            } else if (_cartHasMultiFrontViews(itemObj.rawState)) {
                itemObj.spec.wingPreviews = media.wingPreviews || [];
            } else if (!(itemObj.spec.wingPreviews || []).some(function(w) { return w && (w.imgDoorsManual || w.imgOpenManual); })) {
                itemObj.spec.wingPreviews = [];
            }
            if (media.multiViewPages && media.multiViewPages.length) {
                itemObj.spec.multiViewPages = media.multiViewPages;
                itemObj.spec.multiViewLabels = media.multiViewLabels || [];
            }
            itemObj.spec.cornerAngle = media.cornerAngle || null;
            if (media.multiViewSVG) itemObj.spec.multiViewSVG = media.multiViewSVG;
            if (media.captureVer) itemObj.spec.captureVer = media.captureVer;

            // Shared-space shots — copy to every member of the same pair
            if (media.imgSpaceDoors || media.imgSpaceOpen) {
                const pairId = (typeof window._spacePairIdOf === 'function') ? window._spacePairIdOf(itemObj) : null;
                (state.orderCart || []).forEach(function(it) {
                    if (!it || !it.spec) return;
                    if (pairId && window._spacePairIdOf(it) !== pairId) return;
                    if (!pairId && it !== itemObj) return;
                    if (media.imgSpaceDoors && !it.spec.imgSpaceDoorsManual) it.spec.imgSpaceDoors = media.imgSpaceDoors;
                    if (media.imgSpaceOpen && !it.spec.imgSpaceOpenManual) it.spec.imgSpaceOpen = media.imgSpaceOpen;
                    if (media.captureVer) it.spec.captureVer = Math.max(it.spec.captureVer || 0, media.captureVer);
                });
            }
            await new Promise(r => setTimeout(r, 0));
        }
    } finally {
        state.editingCartIndex = prevEditIdx;
        _restoreEditorState(snap);
        window._cartMediaRefreshRunning = false;
    }
};

/** Prices in printed / shared documents: hidden when the plan has no pricing or no quotes (designers). */
window._docsHidePrices = function() {
    return window._showPricing === false || !!(window._features && window._features.canQuote === false);
};

window.openOrderModal = async function(mode, opts) {
    // mode: 'customer' or 'factory'
    opts = opts || {};

    // Feature gate: factory mode requires canExportCarpenter
    if (mode === 'factory' && window._features && !window._features.canExportCarpenter) {
        _showToast('תכונה זו אינה זמינה בתוכנית הנוכחית שלך. שדרג כדי לגשת לשליחה לייצור.', 5000);
        return;
    }

    // Forms and blueprints are built from the cart — unsaved edits of the open cabinet would be missing
    if (!state.wingEditMode && typeof window._isCurrentCabinetDirty === 'function' && window._isCurrentCabinetDirty()) {
        window._commitCurrentCabinetToCart({ flash: false });
    }

    // Fresh captures on open (quote / production). Skip when only rebuilding after price edits.
    if (state.orderCart.length > 0 && !opts.skipMediaRefresh) {
        _showToast('🔄 מרענן תמונות ארונות...', 3500);
        try {
            await window._refreshCartMediaForPrint({ force: true });
            if (mode === 'factory') {
                await window._refreshCartBlueprintPagesForPrint();
            }
        } catch (e) {
            console.warn('[openOrderModal] media refresh failed:', e);
            _showToast('⚠️ חלק מהתמונות לא עודכנו — נסה שוב', 4000);
        }
    }

    const modal = document.getElementById('order-modal');
    const container = document.getElementById('order-items-container');
    if (!modal || !container) return;

    // Set modal mode
    modal.dataset.mode = mode;
    const isFactory = mode === 'factory';

    const formText = _getOrderFormText(mode);
    const formDefaults = _getOrderFormDefaults(mode);
    const titleInp = document.getElementById('order-form-title');
    const notesInp = document.getElementById('order-form-notes');
    const notesPrint = document.getElementById('order-form-notes-print');
    if (titleInp) {
        titleInp.value = formText.title;
        titleInp.placeholder = formDefaults.title;
    }
    if (notesInp) notesInp.value = formText.notes;
    _syncOrderFormNotesPrint(formText.notes);

    // Update title
    const titleEl = document.getElementById('order-modal-title');
    if (titleEl) {
        titleEl.innerHTML = isFactory
            ? '<i class="fa-solid fa-industry"></i> ' + _escPrintHtml(formText.title || formDefaults.title)
            : '<i class="fa-solid fa-file-invoice-dollar"></i> ' + _escPrintHtml(formText.title || formDefaults.title);
    }

    // Update print buttons
    const actionsEl = document.getElementById('modal-print-actions');
    if (actionsEl) {
        actionsEl.innerHTML = isFactory
            ? `<button class="print-btn-large" onclick="printFactory()" style="flex:1;background:#475569;box-shadow:0 4px 15px rgba(71,85,105,0.4);"><i class="fa-solid fa-industry"></i> הדפס לייצור (עלויות רכש)</button>`
            : !window._docsHidePrices()
                ? `<button class="print-btn-large" onclick="printCustomer()" style="flex:1;"><i class="fa-solid fa-file-invoice-dollar"></i> הדפס ללקוח (מחירון)</button>`
                : `<button class="print-btn-large" onclick="printCustomer()" style="flex:1;"><i class="fa-solid fa-file-invoice-dollar"></i> הדפס סיכום ללקוח</button>`;
    }

    container.innerHTML = '';
    let totalOrderPrice = 0, totalInstallPrice = 0, totalCostPrice = 0;

    document.getElementById('print-c-name').innerText = state.customer.name || 'לא צוין';
    document.getElementById('print-c-phone').innerText = state.customer.phone || 'לא צוין';
    document.getElementById('print-c-order').innerText = state.customer.orderNum || 'לא צוין';
    document.getElementById('print-c-address').innerText = state.customer.address || 'לא צוין';
    const printDel = document.getElementById('print-c-delivery');
    if (printDel) printDel.innerText = window._formatCustomerDeliveryDate
        ? (window._formatCustomerDeliveryDate(state.customer.deliveryDate) || 'לא צוין')
        : (state.customer.deliveryDate || 'לא צוין');

    if (state.orderCart.length === 0) {
        container.innerHTML = '<p style="text-align:center; color:var(--text-light); font-size: 1.2rem;">ההזמנה ריקה. הוסף ארונות קודם.</p>';
        document.getElementById('modal-footer-summary').innerHTML = '';
        modal.style.display = 'flex';
        return;
    }

    state.orderCart.forEach((itemObj, index) => {
        if (typeof window._cartItemOnHold === 'function' && window._cartItemOnHold(itemObj)) return;
        const item = itemObj.spec;
        const titleText = item.customName ? item.customName : (_cartIsWritingDesk(itemObj) ? `שולחן מס' ${index + 1}` : `ארון מס' ${index + 1}`);
        const detailLabel = _cartIsWritingDesk(itemObj) ? 'שולחן' : 'ארון';
        const numericPrice = parseInt(item.price.replace('₪', '').replace(/,/g, ''));
        const itemInstall = item.installPrice || 0;
        const itemCost = item.costPrice ? parseInt(item.costPrice.replace('₪', '').replace(/,/g, '')) : 0;
        if (!isNaN(numericPrice)) totalOrderPrice += numericPrice;
        totalInstallPrice += itemInstall; totalCostPrice += itemCost;

        const priceRowsModal = window._docsHidePrices() ? `` : !isFactory ? `
                    <tr class="view-customer">
                        <th style="background:var(--highlight); vertical-align:middle;">מחיר ארון ללקוח</th>
                        <td style="font-weight:bold; color:var(--primary); font-size:1.15rem; text-align:right;">
                            <div style="display:flex; align-items:center; justify-content:flex-start; gap:4px;">
                                <input type="number" class="modal-price-input" data-index="${index}" value="${numericPrice}" style="font-size:1.15rem; font-weight:bold; color:var(--primary); border:1px solid var(--border); border-radius:6px; width:80px; text-align:right; direction:ltr; outline:none; font-family:inherit; padding:2px 4px; background:white;">
                                <span>₪</span>
                            </div>
                        </td>
                    </tr>
                    <tr class="view-customer">
                        <th style="background:var(--highlight);">הובלה והתקנה</th>
                        <td style="font-weight:bold; color:var(--primary); font-size:1.15rem; text-align:right;">
                            <div style="display:flex; align-items:center; justify-content:flex-start; gap:4px;">
                                <input type="number" class="modal-install-input" data-index="${index}" value="${itemInstall}" style="font-size:1.15rem; font-weight:bold; color:var(--primary); border:1px solid var(--border); border-radius:6px; width:80px; text-align:right; direction:ltr; outline:none; font-family:inherit; padding:2px 4px; background:white;">
                                <span>₪</span>
                            </div>
                        </td>
                    </tr>
                    ` : `
                    <tr class="view-factory">
                        <th style="background:#fef08a;">עלות ייצור (רכש)</th>
                        <td style="font-weight:bold; color:#854d0e; font-size:1.15rem; text-align:right;">
                            <div style="display:flex; align-items:center; justify-content:flex-start; gap:4px;">
                                <input type="number" class="modal-cost-input" data-index="${index}" value="${itemCost}" style="font-size:1.15rem; font-weight:bold; color:#854d0e; border:1px solid #fef08a; border-radius:6px; width:80px; text-align:right; direction:ltr; outline:none; font-family:inherit; padding:2px 4px; background:#fefce8;">
                                <span>₪</span>
                            </div>
                        </td>
                    </tr>
                    <tr class="view-factory">
                        <th style="background:#fef9c3;">עלות משלוח/התקנה</th>
                        <td style="font-weight:bold; color:#713f12; font-size:1.15rem; text-align:right;">
                            <div style="display:flex; align-items:center; justify-content:flex-start; gap:4px;">
                                <input type="number" class="modal-install-input" data-index="${index}" value="${itemInstall}" style="font-size:1.15rem; font-weight:bold; color:#713f12; border:1px solid #fef9c3; border-radius:6px; width:80px; text-align:right; direction:ltr; outline:none; font-family:inherit; padding:2px 4px; background:#fefce8;">
                                <span>₪</span>
                            </div>
                        </td>
                    </tr>
                    `;

        const specRows = _resolvePrintSpecRows(itemObj);
        const split = _splitPrintSpecRowsByCabinet(specRows);
        let cabinetHTML = '';

        if (!split.units.length) {
            cabinetHTML += `
            <div class="cabinet-print-page">
                <div class="cabinet-header-wrapper">
                    <h3 class="cabinet-title">פרטי ${detailLabel}: ${titleText}</h3>
                    <div class="cart-item-actions">
                        <button class="action-btn edit-btn" onclick="editCartItem(${index})"><i class="fa-solid fa-pen"></i> ערוך ארון</button>
                        <button class="action-btn del-btn" onclick="deleteCartItem(${index})"><i class="fa-solid fa-trash"></i> מחיקה</button>
                    </div>
                </div>
                <table class="spec-table">
                    ${_printSpecRowsHtmlEditable(specRows, index)}
                    ${priceRowsModal}
                </table>
            </div>`;
        } else {
            split.units.forEach(function(unit, ui) {
                const isFirst = ui === 0;
                const isLast = ui === split.units.length - 1;
                const pageRows = isFirst
                    ? split.shared.concat(unit.rows)
                    : unit.rows.slice();
                if (isLast && split.trailing.length) {
                    pageRows.push.apply(pageRows, split.trailing);
                }
                const heading = isFirst
                    ? ('פרטי ' + detailLabel + ': ' + titleText)
                    : unit.title;
                cabinetHTML += `
            <div class="cabinet-print-page">
                <div class="cabinet-header-wrapper">
                    <h3 class="cabinet-title">${heading}</h3>
                    ${isFirst ? `<div class="cart-item-actions">
                        <button class="action-btn edit-btn" onclick="editCartItem(${index})"><i class="fa-solid fa-pen"></i> ערוך ארון</button>
                        <button class="action-btn del-btn" onclick="deleteCartItem(${index})"><i class="fa-solid fa-trash"></i> מחיקה</button>
                    </div>` : ''}
                </div>
                <table class="spec-table">
                    ${_printSpecRowsHtmlEditable(pageRows, index)}
                    ${isFirst ? priceRowsModal : ''}
                </table>
            </div>`;
            });
        }

        cabinetHTML += `
            <div class="cabinet-print-page">
                <div class="cabinet-header-wrapper">
                    <h3 class="cabinet-title">תמונות ${detailLabel}: ${titleText}</h3>
                </div>
                <div class="print-images-container">
                    ${_orderPreviewImagesHtml(item, itemObj.rawState, { cartIndex: index, replaceable: isFactory })}
                </div>
                ${(() => {
                    const bpPages = (item.multiViewPages && item.multiViewPages.length)
                        ? item.multiViewPages
                        : (item.multiViewSVG ? [item.multiViewSVG] : []);
                    if (!bpPages.length) return '';
                    return bpPages.map(function(svg, pi) {
                        const label = bpPages.length > 1
                            ? ('שרטוט ייצור (' + (pi + 1) + '/' + bpPages.length + ')')
                            : 'שרטוט ייצור';
                        return `
                <div style="margin-top:12px;">
                    <div class="img-label" style="background:#e8f0fe;color:#1e3a5f;border:1px solid #93c5fd;padding:6px 10px;font-weight:bold;margin-bottom:6px;">${label}</div>
                    <div style="border:1px solid #bfdbfe;border-radius:4px;overflow:hidden;">${svg}</div>
                </div>`;
                    }).join('');
                })()}
            </div>
        `;
        container.insertAdjacentHTML('beforeend', cabinetHTML);
    });

    if (!container.innerHTML.trim()) {
        container.innerHTML = '<div style="padding:28px 18px;text-align:center;color:#64748b;background:#f8fafc;border:1px dashed #cbd5e1;border-radius:12px;">' +
            '<div style="font-size:1.05rem;font-weight:700;color:#475569;margin-bottom:6px;"><i class="fa-solid fa-pause"></i> אין ארונות לייצוא</div>' +
            'כל הארונות בפרויקט מושהים. לחצו «הפעל» ברשימת הארונות כדי לכלול אותם בהצעת המחיר ובקבצי הייצוא.' +
            '</div>';
        if (actionsEl) {
            actionsEl.querySelectorAll('button').forEach(function(btn) { btn.disabled = true; btn.style.opacity = '0.45'; btn.style.pointerEvents = 'none'; });
        }
    }

    _bindPrintSpecRowInputs(container);
    _bindOrderPreviewImageReplace(container);

    // Wire up editable inputs
    container.querySelectorAll('.modal-price-input').forEach(input => {
        input.addEventListener('change', (e) => {
            const idx = parseInt(e.target.getAttribute('data-index'));
            const newPrice = parseInt(e.target.value) || 0;
            state.orderCart[idx].spec.price = '₪' + newPrice.toLocaleString();
            state.orderCart[idx].rawState.manualPrice = newPrice;
            openOrderModal(mode, { skipMediaRefresh: true }); updateLeftSidebar();
        });
    });
    container.querySelectorAll('.modal-cost-input').forEach(input => {
        input.addEventListener('change', (e) => {
            const idx = parseInt(e.target.getAttribute('data-index'));
            const newCost = parseInt(e.target.value) || 0;
            state.orderCart[idx].spec.costPrice = '₪' + newCost.toLocaleString();
            openOrderModal(mode, { skipMediaRefresh: true }); updateLeftSidebar();
        });
    });
    container.querySelectorAll('.modal-install-input').forEach(input => {
        input.addEventListener('change', (e) => {
            const idx = parseInt(e.target.getAttribute('data-index'));
            const newInstall = parseInt(e.target.value) || 0;
            state.orderCart[idx].spec.installPrice = newInstall;
            openOrderModal(mode, { skipMediaRefresh: true }); updateLeftSidebar();
        });
    });

    // Footer summary
    const footerHTML = window._docsHidePrices() ? `<div></div>` : isFactory ? `
        <div class="summary-factory" style="display:block;">
            <div class="summary-row"><span>סה"כ עלויות ייצור (רכש):</span> <span dir="ltr" style="font-weight:bold;color:#854d0e;">₪${totalCostPrice.toLocaleString()}</span></div>
            <div class="summary-row"><span>סה"כ עלויות משלוח/התקנה:</span> <span dir="ltr" style="font-weight:bold;color:#713f12;">₪${totalInstallPrice.toLocaleString()}</span></div>
            <div class="summary-row final-total" style="color:#854d0e; border-top: 2px solid #fef08a;"><span>סה"כ עלויות פרויקט (רכש נטו):</span> <span dir="ltr">₪${(totalCostPrice + totalInstallPrice).toLocaleString()}</span></div>
        </div>
    ` : `
        <div class="summary-customer">
            <div class="summary-row"><span>סה"כ ארונות (ללא התקנה):</span> <span dir="ltr" style="font-weight:bold;">₪${totalOrderPrice.toLocaleString()}</span></div>
            <div class="summary-row"><span>סה"כ הובלה והתקנה:</span> <span dir="ltr" style="font-weight:bold;">₪${totalInstallPrice.toLocaleString()}</span></div>
            <div class="summary-row final-total"><span>סה"כ לתשלום ללקוח:</span> <span dir="ltr">₪${(totalOrderPrice + totalInstallPrice).toLocaleString()}</span></div>
        </div>
    `;
    document.getElementById('modal-footer-summary').innerHTML = footerHTML;
    modal.style.display = 'flex';
};


// ---- Always-selected cabinet helpers ----
function _setSaveCabinetButtonLabel(tempHtml, flashMs) {
    const btn = document.getElementById('btn-add-to-cart');
    if (!btn) return;
    const steady = `<i class="fa-solid fa-save"></i> שמור שינויים לארון`;
    if (tempHtml) {
        btn.innerHTML = tempHtml;
        btn.style.background = 'var(--success)';
        setTimeout(() => {
            btn.innerHTML = steady;
            btn.style.background = '';
        }, flashMs || 1800);
    } else {
        btn.innerHTML = steady;
        btn.style.background = '';
    }
}

/** Lightweight design fingerprint of the live editor (no preview images). */
window._buildCurrentCabinetCompareRaw = function() {
    let manualInstall = null;
    try {
        if (typeof getWing === 'function' && getWing()) {
            manualInstall = getWing().manualInstallPrice != null ? getWing().manualInstallPrice : null;
        }
    } catch (e) { /* ignore */ }
    const partColors = (typeof window._exportLocalPartColors === 'function')
        ? window._exportLocalPartColors(
            (state.editingCartIndex >= 0) ? ('cart' + state.editingCartIndex) : undefined
        )
        : JSON.parse(JSON.stringify(state.partColors || {}));
    const raw = JSON.parse(JSON.stringify({
        cabinetModel: state.cabinetModel,
        placement: state.placement,
        width: state.width,
        globalHeight: state.globalHeight,
        depth: state.depth,
        thickness: state.thickness,
        plinthHeight: state.plinthHeight,
        hasDoors: state.hasDoors,
        handleType: state.handleType,
        handleStyle: state.handleStyle, handleVariant: state.handleVariant, ridingColor: state.ridingColor,
        cabinetName: state.cabinetName || '',
        cabinetModelLabel: (state.wings && state.wings.center && state.wings.center.cabinetModelLabel) || state.cabinetModelLabel || '',
        cabinetNotes: state.cabinetNotes || '',
        manualPrice: state.manualPrice,
        manualInstallPrice: manualInstall,
        boardMaterial: state.boardMaterial,
        materialBody: state.materialBody,
        materialInternal: state.materialInternal,
        materialExternal: state.materialExternal,
        materialDesk: state.materialDesk,
        materialOpenCell: state.materialOpenCell,
        materialBack: state.materialBack,
        columns: state.columns,
        desk: state.desk,
        wings: state.wings,
        activeWing: state.activeWing,
        presetId: state.presetId,
        roomWall: window._roomWall || state.roomWall || 'center',
        closureEnabled: (window._closureEnabled !== undefined) ? window._closureEnabled : true,
        closureWidth: window._closureWidth || 1.8,
        closureWidthRight: window._closureWidthRight || 1.8,
        closureCeilWidth: window._closureCeilWidth || 1.8,
        closureDepthWidth: window._closureDepthWidth || 1.8,
        closureFrontLine: window._closureFrontLine || 'cabinet',
        blueprintCutouts: state.blueprintCutouts || [],
        blueprintCellDimOffsets: state.blueprintCellDimOffsets || {},
        blueprintDimOffsets: state.blueprintDimOffsets || {},
        blueprintInternalDimsDefault: state.blueprintInternalDimsDefault !== false,
        blueprintCellDimShown: state.blueprintCellDimShown || {},
        blueprintColWidthDimsDefault: state.blueprintColWidthDimsDefault !== false,
        blueprintColWidthDimShown: state.blueprintColWidthDimShown || {},
        blueprintHeightDimsDefault: state.blueprintHeightDimsDefault !== false,
        partColors: partColors || {}
    }));
    const _pairLive = typeof window._spacePairFieldsForRaw === 'function' ? window._spacePairFieldsForRaw() : {};
    if (_pairLive && _pairLive.spacePairId) Object.assign(raw, _pairLive);
    const _uid = typeof window._cartUidAt === 'function' ? window._cartUidAt(state.editingCartIndex) : null;
    if (_uid) raw.cartUid = _uid;
    if (typeof window._cartItemOnHold === 'function' && state.orderCart && state.orderCart[state.editingCartIndex] &&
        window._cartItemOnHold(state.orderCart[state.editingCartIndex])) {
        raw.onHold = true;
    }
    return raw;
};

window._getCabinetLiveFingerprint = function() {
    try {
        return JSON.stringify(window._buildCurrentCabinetCompareRaw());
    } catch (e) {
        return '';
    }
};

window._markCurrentCabinetClean = function() {
    window._cabinetCleanFingerprint = window._getCabinetLiveFingerprint();
};

window._isCurrentCabinetDirty = function() {
    if (state.editingCartIndex < 0 || !state.orderCart || !state.orderCart[state.editingCartIndex]) {
        return false;
    }
    if (window._cabinetCleanFingerprint == null || window._cabinetCleanFingerprint === '') {
        return false;
    }
    return window._getCabinetLiveFingerprint() !== window._cabinetCleanFingerprint;
};

window._promptSaveCabinetBeforeSwitch = function(targetIndex) {
    const existing = document.getElementById('_unsaved-cabinet-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = '_unsaved-cabinet-toast';
    toast.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.45);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);';
    toast.innerHTML = `
        <div style="background:#1e2840;color:white;padding:32px 36px;border-radius:20px;font-size:1.1rem;font-weight:600;box-shadow:0 8px 48px rgba(0,0,0,0.55);display:flex;flex-direction:column;align-items:center;gap:20px;min-width:300px;max-width:92vw;text-align:center;">
            <div style="font-size:2rem;"><i class="fa-solid fa-floppy-disk"></i></div>
            <div style="font-size:1.15rem;font-weight:700;line-height:1.45;">יש שינויים שלא נשמרו בארון הנוכחי.<br>לשמור לפני המעבר?</div>
            <div style="display:flex;flex-direction:column;gap:10px;width:100%;">
                <button type="button" id="_unsaved-cab-save" style="width:100%;background:#22c55e;color:white;border:none;border-radius:10px;padding:12px 0;font-size:1.05rem;font-weight:700;cursor:pointer;">שמור ועבור</button>
                <button type="button" id="_unsaved-cab-discard" style="width:100%;background:rgba(255,255,255,0.12);color:white;border:1px solid rgba(255,255,255,0.25);border-radius:10px;padding:12px 0;font-size:1rem;font-weight:600;cursor:pointer;">עבור בלי לשמור</button>
                <button type="button" id="_unsaved-cab-cancel" style="width:100%;background:transparent;color:rgba(255,255,255,0.75);border:none;border-radius:10px;padding:10px 0;font-size:0.95rem;font-weight:600;cursor:pointer;">ביטול</button>
            </div>
        </div>
    `;
    document.body.appendChild(toast);

    const close = () => { const t = document.getElementById('_unsaved-cabinet-toast'); if (t) t.remove(); };
    toast.querySelector('#_unsaved-cab-cancel').onclick = close;
    toast.querySelector('#_unsaved-cab-discard').onclick = () => {
        close();
        window._editCartItemNow(targetIndex);
    };
    toast.querySelector('#_unsaved-cab-save').onclick = () => {
        close();
        window._commitCurrentCabinetToCart({ flash: false });
        window._editCartItemNow(targetIndex);
    };
    toast.addEventListener('click', (e) => { if (e.target === toast) close(); });
};

// ==========================================
// Multi cabinet in the same 3D space (up to 4: linear / sliding / writing-desk)
// Slot 0 is the world anchor; slots 1..n each store spaceOffset relative to it.
// ==========================================
window._SPACE_COMPATIBLE_PRESETS = ['linear', 'sliding', 'writing-desk'];
window._SPACE_MAX_CABINETS = 4;

/** Plan cap (e.g. designer Basic = 2). Slot clamping keeps using the system max so older projects stay intact. */
window._spacePlanMax = function() {
    const sys = window._SPACE_MAX_CABINETS || 4;
    const p = window._plan && window._plan.maxSpaceCabinets;
    return p ? Math.min(p, sys) : sys;
};

window._isSpaceCompatiblePreset = function(presetId) {
    const p = presetId || 'linear';
    return window._SPACE_COMPATIBLE_PRESETS.indexOf(p) !== -1;
};

window._spacePairCanUse = function() {
    // Allow while on a compatible type, or while already editing any member of a space
    if (window._isSpaceCompatiblePreset(state.presetId)) return true;
    const cart = state.orderCart || [];
    const idx = state.editingCartIndex;
    return !!(idx >= 0 && cart[idx] && window._spacePairIdOf(cart[idx]));
};

window._spacePairSlotOf = function(item) {
    if (!item) return 0;
    const s = (item.spaceSlot != null) ? item.spaceSlot
        : (item.rawState && item.rawState.spaceSlot);
    const n = Math.round(Number(s) || 0);
    const max = (window._SPACE_MAX_CABINETS || 4) - 1;
    return Math.max(0, Math.min(max, n));
};

window._spacePairIdOf = function(item) {
    if (!item) return null;
    return item.spacePairId || (item.rawState && item.rawState.spacePairId) || null;
};

window._getSpaceOffset = function(item) {
    const o = (item && (item.spaceOffset || (item.rawState && item.rawState.spaceOffset))) || { x: 0, y: 0, z: 0 };
    return {
        x: Math.round(Number(o.x) || 0),
        y: Math.round(Number(o.y) || 0),
        z: Math.round(Number(o.z) || 0)
    };
};

window._spacePairFieldsForRaw = function() {
    const item = state.orderCart && state.orderCart[state.editingCartIndex];
    const pairId = window._spacePairIdOf(item);
    if (!pairId) return {};
    return {
        spacePairId: pairId,
        spaceSlot: window._spacePairSlotOf(item),
        spaceOffset: window._getSpaceOffset(item)
    };
};

window._attachSpacePairToItem = function(item, pairId, slot, offset) {
    if (!item) return;
    item.spacePairId = pairId;
    item.spaceSlot = slot;
    item.spaceOffset = offset || { x: 0, y: 0 };
    if (!item.rawState) item.rawState = {};
    item.rawState.spacePairId = pairId;
    item.rawState.spaceSlot = slot;
    item.rawState.spaceOffset = item.spaceOffset;
};

window._stripSpacePairFromItem = function(item) {
    if (!item) return;
    delete item.spacePairId;
    delete item.spaceSlot;
    delete item.spaceOffset;
    if (item.rawState) {
        delete item.rawState.spacePairId;
        delete item.rawState.spaceSlot;
        delete item.rawState.spaceOffset;
    }
};

window._spaceTabLabel = function(item, slot) {
    const name = ((item && item.spec && item.spec.customName) ||
        (item && item.rawState && item.rawState.cabinetName) || '').trim();
    return name || ('ארון ' + (slot + 1));
};

/** Strip trailing " חלק N" so the shared base name can be edited. */
window._stripSpacePartSuffix = function(name) {
    return String(name || '').replace(/\s*חלק\s*\d+\s*$/u, '').trim();
};

window._spacePartSuffix = function(slot) {
    return 'חלק ' + (Math.max(0, Math.round(Number(slot) || 0)) + 1);
};

window._formatSpacePairCabinetName = function(baseName, slot) {
    const base = window._stripSpacePartSuffix(baseName);
    if (!base) return '';
    return base + ' ' + window._spacePartSuffix(slot);
};

window._spacePairBaseNameFromItem = function(item) {
    if (!item) return '';
    const n = ((item.spec && item.spec.customName) ||
        (item.rawState && item.rawState.cabinetName) || '').trim();
    return window._stripSpacePartSuffix(n);
};

/** Apply "Base חלק N" to every cabinet in the shared space. */
window._applySpacePairCabinetNames = function(pairId, baseName) {
    if (!pairId) return;
    const base = window._stripSpacePartSuffix(baseName);
    const members = [];
    (state.orderCart || []).forEach(function(it, i) {
        if (window._spacePairIdOf(it) === pairId) {
            members.push({ it: it, index: i, slot: window._spacePairSlotOf(it) });
        }
    });
    if (members.length < 2) return;
    members.sort(function(a, b) { return a.slot - b.slot; });
    members.forEach(function(m) {
        const full = base ? window._formatSpacePairCabinetName(base, m.slot) : '';
        if (!m.it.spec) m.it.spec = {};
        if (!m.it.rawState) m.it.rawState = {};
        m.it.spec.customName = full;
        m.it.rawState.cabinetName = full;
    });
    const editIdx = state.editingCartIndex;
    const editItem = (editIdx >= 0) ? state.orderCart[editIdx] : null;
    if (editItem && window._spacePairIdOf(editItem) === pairId) {
        const full = (editItem.spec && editItem.spec.customName) || '';
        state.cabinetName = full;
        if (state.wings && state.wings.center) state.wings.center.cabinetName = full;
        const display = base;
        const desk = document.getElementById('inp-cabinet-name');
        const m1 = document.getElementById('mobile-inp-cabinet-name');
        const m2 = document.getElementById('mobile-inp-cabinet-name2');
        if (desk && document.activeElement !== desk) desk.value = display;
        if (m1 && document.activeElement !== m1) m1.value = display;
        if (m2 && document.activeElement !== m2) m2.value = display;
    }
};

/** Name input handler — when in a shared space, rename all parts together. */
window._onCabinetNameInput = function(rawValue, opts) {
    opts = opts || {};
    const typed = String(rawValue || '');
    const pairInfo = (typeof window._getSpacePairInfo === 'function') ? window._getSpacePairInfo() : null;
    if (pairInfo && pairInfo.count >= 2) {
        const base = window._stripSpacePartSuffix(typed);
        window._applySpacePairCabinetNames(pairInfo.pairId, base);
        const full = window._formatSpacePairCabinetName(base, pairInfo.activeSlot);
        state.cabinetName = full;
        if (state.wings && state.wings.center) state.wings.center.cabinetName = full;
        // Keep inputs showing the shared base while typing
        const desk = document.getElementById('inp-cabinet-name');
        const m1 = document.getElementById('mobile-inp-cabinet-name');
        const m2 = document.getElementById('mobile-inp-cabinet-name2');
        if (desk && document.activeElement !== desk) desk.value = base;
        if (m1 && document.activeElement !== m1) m1.value = base;
        if (m2 && document.activeElement !== m2) m2.value = base;
        if (opts.updateSidebar !== false && typeof updateLeftSidebar === 'function') updateLeftSidebar();
    } else {
        state.cabinetName = typed;
        if (state.wings && state.wings.center) state.wings.center.cabinetName = typed;
        const desk = document.getElementById('inp-cabinet-name');
        const m1 = document.getElementById('mobile-inp-cabinet-name');
        const m2 = document.getElementById('mobile-inp-cabinet-name2');
        if (desk && desk !== document.activeElement && desk.value !== typed) desk.value = typed;
        if (m1 && m1 !== document.activeElement && m1.value !== typed) m1.value = typed;
        if (m2 && m2 !== document.activeElement && m2.value !== typed) m2.value = typed;
    }
    if (opts.save !== false && typeof saveHistoryState === 'function') saveHistoryState();
};

window._getSpacePairInfoAt = function(cartIndex) {
    const cart = state.orderCart || [];
    const idx = (cartIndex != null) ? cartIndex : state.editingCartIndex;
    if (idx < 0 || !cart[idx]) return null;
    const pairId = window._spacePairIdOf(cart[idx]);
    if (!pairId) return null;
    const members = [];
    for (let i = 0; i < cart.length; i++) {
        if (window._spacePairIdOf(cart[i]) === pairId) {
            members.push({ index: i, slot: window._spacePairSlotOf(cart[i]) });
        }
    }
    if (members.length < 2) return null;
    members.sort(function(a, b) { return a.slot - b.slot; });
    const slotIndices = [];
    members.forEach(function(m) { slotIndices[m.slot] = m.index; });
    const activeSlot = window._spacePairSlotOf(cart[idx]);
    const others = members.filter(function(m) { return m.index !== idx; });
    return {
        pairId: pairId,
        activeIndex: idx,
        activeSlot: activeSlot,
        members: members,
        others: others,
        count: members.length,
        canAddMore: members.length < window._spacePlanMax(),
        planLimitReached: members.length >= window._spacePlanMax() && members.length < (window._SPACE_MAX_CABINETS || 4),
        slotIndices: slotIndices,
        // Legacy 2-cab fields (kept for older call sites)
        otherIndex: others.length ? others[0].index : -1,
        otherSlot: others.length ? others[0].slot : 0,
        slot0Index: slotIndices[0],
        slot1Index: slotIndices[1]
    };
};

window._getSpacePairInfo = function() {
    return window._getSpacePairInfoAt(state.editingCartIndex);
};

/** Front-view camera framing that fits every cabinet in the shared space. */
window._computeSpacePairCaptureView = function(info) {
    info = info || window._getSpacePairInfo();
    if (!info || info.count < 2) return null;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    info.members.forEach(function(m) {
        const fp = window._spaceCabinetFootprint(m.slot);
        const off = window._spaceOffsetForSlot(m.slot);
        const fo = fp.floorOffset || 0;
        minX = Math.min(minX, off.x - fp.w / 2);
        maxX = Math.max(maxX, off.x + fp.w / 2);
        minY = Math.min(minY, off.y + fo);
        maxY = Math.max(maxY, off.y + fp.h);
    });
    if (!(maxX > minX) || !(maxY > minY)) return null;
    const midX = (minX + maxX) / 2;
    const midY = (minY + maxY) / 2;
    return {
        id: 'space',
        label: 'מרחב משותף',
        camPos: [midX, midY, 1],
        camTarget: [midX, midY, 0],
        fitH: (maxY - minY) + 140,
        fitW: (maxX - minX) + 180
    };
};

/** Copy shared-space open/closed previews onto every member of the pair. */
window._syncSpacePairPreviewImages = function(fromItem) {
    const pairId = window._spacePairIdOf(fromItem);
    if (!pairId || !fromItem || !fromItem.spec) return;
    const doors = fromItem.spec.imgSpaceDoors;
    const open = fromItem.spec.imgSpaceOpen;
    if (!doors && !open) return;
    (state.orderCart || []).forEach(function(it) {
        if (!it || !it.spec || window._spacePairIdOf(it) !== pairId) return;
        if (doors && !it.spec.imgSpaceDoorsManual) it.spec.imgSpaceDoors = doors;
        if (open && !it.spec.imgSpaceOpenManual) it.spec.imgSpaceOpen = open;
        if (fromItem.spec.captureVer) {
            it.spec.captureVer = Math.max(it.spec.captureVer || 0, fromItem.spec.captureVer);
        }
    });
};

/** Drop auto space previews so the next order/PDF refresh re-captures them. */
window._invalidateSpacePairPreviewImages = function(pairId) {
    if (!pairId) return;
    (state.orderCart || []).forEach(function(it) {
        if (!it || !it.spec || window._spacePairIdOf(it) !== pairId) return;
        if (!it.spec.imgSpaceDoorsManual) {
            delete it.spec.imgSpaceDoors;
            delete it.spec.imgSpaceDoorsAuto;
        }
        if (!it.spec.imgSpaceOpenManual) {
            delete it.spec.imgSpaceOpen;
            delete it.spec.imgSpaceOpenAuto;
        }
        if (it.spec.captureVer && it.spec.captureVer >= 5) it.spec.captureVer = 3;
    });
};

window._getSpaceSlotItem = function(slot) {
    const info = window._getSpacePairInfo();
    if (!info || info.slotIndices[slot] == null) return null;
    return state.orderCart[info.slotIndices[slot]] || null;
};

window._getSpaceMovableItem = function() {
    const info = window._getSpacePairInfo();
    if (!info || info.activeSlot <= 0) return null;
    return state.orderCart[info.activeIndex] || null;
};

// Back-compat: previously always edited slot 1
window._getSpaceSlot1Item = function() {
    const movable = window._getSpaceMovableItem();
    if (movable) return movable;
    return window._getSpaceSlotItem(1);
};

window._spaceWingsForSlot = function(slot) {
    const info = window._getSpacePairInfo();
    if (!info || info.slotIndices[slot] == null) return null;
    const idx = info.slotIndices[slot];
    if (state.editingCartIndex === idx) return state.wings;
    const item = state.orderCart[idx];
    return (item && item.rawState && item.rawState.wings) || null;
};

window._spaceCabinetFootprint = function(slot) {
    const wings = window._spaceWingsForSlot(slot);
    const c = wings && wings.center;
    const w = (c && c.width) || 160;
    const d = (c && c.depth) || 54;
    let h = (c && c.globalHeight) || 240;
    let fo = 0;
    if (c && c.columns && c.columns.length) {
        h = Math.max.apply(null, c.columns.map(function(col) { return col.height || h; }));
        fo = Math.min.apply(null, c.columns.map(function(col) { return col.floorOffset || 0; }));
    }
    const uu = wings && wings.upperUnit_center;
    if (uu && uu._isUpperUnit) {
        let uuH = uu.globalHeight || 40;
        if (uu.columns && uu.columns.length) {
            uuH = Math.max.apply(null, uu.columns.map(function(col) { return col.height || uuH; }));
        }
        h += (uu._upperGap || 0) + uuH;
    }
    return { w: w, h: h, d: d, floorOffset: fo };
};

window._spaceOffsetForSlot = function(slot) {
    if (slot === 0) return { x: 0, y: 0, z: 0 };
    const item = window._getSpaceSlotItem(slot);
    return window._getSpaceOffset(item);
};

window._suggestNextSpaceOffset = function(newWidth) {
    const info = window._getSpacePairInfo();
    let maxRight = 0;
    if (info) {
        info.members.forEach(function(m) {
            const fp = window._spaceCabinetFootprint(m.slot);
            const off = window._spaceOffsetForSlot(m.slot);
            maxRight = Math.max(maxRight, off.x + fp.w / 2);
        });
    } else {
        const w0 = Math.round(state.width || 160);
        maxRight = w0 / 2;
    }
    const nw = Math.round(newWidth || 160);
    return { x: Math.round(maxRight + nw / 2 + 10), y: 0, z: 0 };
};

window._clampSpaceOffsetAgainstOthers = function(x, y, movingSlot, opts) {
    opts = opts || {};
    const info = window._getSpacePairInfo();
    x = Math.max(-800, Math.min(800, Number(x) || 0));
    y = Math.max(0, Math.min(400, Number(y) || 0));
    let z = Math.max(-400, Math.min(400, Number(opts.z) || 0));
    if (!info || movingSlot == null) return { x: Math.round(x), y: Math.round(y), z: Math.round(z) };

    const dM = window._spaceCabinetFootprint(movingSlot);
    const foM = dM.floorOffset || 0;
    // Back face may go at most as far back as the anchor cabinet's back (the wall line)
    const minZ = Math.min(0, (dM.d - window._spaceCabinetFootprint(0).d) / 2);
    z = Math.max(minZ, z);

    function overlapZAt(zz, oOffZ, dO) {
        return Math.min(oOffZ + dO.d / 2, zz + dM.d / 2) - Math.max(oOffZ - dO.d / 2, zz - dM.d / 2);
    }

    function overlapYAt(yy, oOffY, dO, foO) {
        const b0 = oOffY + foO;
        const t0 = oOffY + dO.h;
        const b1 = yy + foM;
        const t1 = yy + dM.h;
        return Math.min(t0, t1) - Math.max(b0, b1);
    }

    info.members.forEach(function(m) {
        if (m.slot === movingSlot) return;
        const dO = window._spaceCabinetFootprint(m.slot);
        const oOff = window._spaceOffsetForSlot(m.slot);
        const foO = dO.floorOffset || 0;
        const half = (dO.w + dM.w) / 2;
        const dx = x - oOff.x;
        const overlapX = half - Math.abs(dx);
        const overlapY = overlapYAt(y, oOff.y, dO, foO);
        const oZ = oOff.z || 0;
        if (overlapX > 0 && overlapY > 0 && overlapZAt(z, oZ, dO) > 0) {
            const prefer = opts.preferAxis;
            const pushX = prefer === 'x' ? true : prefer === 'y' ? false : (overlapX <= overlapY);
            if (prefer === 'z') {
                const halfD = Math.ceil((dO.d + dM.d) / 2 - 1e-9);
                const prevZ = opts.prevZ != null ? opts.prevZ : z;
                z = (z < oZ || (z === oZ && prevZ < oZ)) ? oZ - halfD : oZ + halfD;
                if (z < minZ) z = oZ + halfD;
            } else if (pushX) {
                let sign = dx < 0 ? -1 : (dx > 0 ? 1 : 0);
                if (!sign && opts.prevX != null) {
                    const prevDx = (opts.prevX || 0) - oOff.x;
                    sign = prevDx < 0 ? -1 : 1;
                }
                if (!sign) sign = 1;
                x = oOff.x + sign * Math.ceil(half - 1e-9);
            } else {
                y = Math.max(0, Math.ceil(oOff.y + dO.h - foM - 1e-9));
                if (overlapX > 0 && overlapYAt(y, oOff.y, dO, foO) > 0) {
                    let sign = dx < 0 ? -1 : (dx > 0 ? 1 : 0);
                    if (!sign && opts.prevX != null) {
                        const prevDx = (opts.prevX || 0) - oOff.x;
                        sign = prevDx < 0 ? -1 : 1;
                    }
                    if (!sign) sign = 1;
                    x = oOff.x + sign * Math.ceil(half - 1e-9);
                }
            }
        }
    });
    return { x: Math.round(x), y: Math.round(y), z: Math.round(z) };
};

// Back-compat alias
window._clampSpaceOffsetAgainstPrimary = function(x, y, opts) {
    const info = window._getSpacePairInfo();
    const movingSlot = (info && info.activeSlot > 0) ? info.activeSlot : 1;
    return window._clampSpaceOffsetAgainstOthers(x, y, movingSlot, opts);
};

window._setSpaceOffset = function(x, y, opts) {
    opts = opts || {};
    const info = window._getSpacePairInfo();
    if (!info) return;
    const movingSlot = (opts.slot != null) ? opts.slot
        : (info.activeSlot > 0 ? info.activeSlot : 1);
    if (movingSlot <= 0 || info.slotIndices[movingSlot] == null) return;
    const item = state.orderCart[info.slotIndices[movingSlot]];
    if (!item) return;
    const prev = window._getSpaceOffset(item);
    const offset = window._clampSpaceOffsetAgainstOthers(x, y, movingSlot, {
        preferAxis: opts.preferAxis,
        prevX: prev.x,
        prevZ: prev.z,
        z: opts.z != null ? opts.z : prev.z
    });
    item.spaceOffset = offset;
    if (!item.rawState) item.rawState = {};
    item.rawState.spaceOffset = offset;

    // Lifting a cabinet in shared space → cancel plinth and use a bottom panel
    const wasLifted = (prev.y || 0) > 0;
    const isLifted = (offset.y || 0) > 0;
    if (wasLifted !== isLifted) {
        window._syncSpaceLiftBottomPanel(item, isLifted);
        if (typeof buildCabinet === 'function') buildCabinet();
        if (typeof calculatePrice === 'function') calculatePrice();
        if (typeof updateQuickEditPanelUI === 'function') updateQuickEditPanelUI();
        if (typeof window._invalidateSpacePairPreviewImages === 'function') {
            window._invalidateSpacePairPreviewImages(info.pairId);
        }
    }

    if (typeof window._applySpacePairPositions === 'function') window._applySpacePairPositions();
    window._syncSpaceOffsetUI();
    if (typeof updateOverlaysPosition === 'function') updateOverlaysPosition();
    if (typeof updateDragHandlesPosition === 'function') updateDragHandlesPosition();
    if (!opts.silent && typeof saveHistoryState === 'function' && !opts.dragging) saveHistoryState();
};

/** When a shared-space cabinet is raised off the floor, convert plinth → bottom panel. */
window._syncSpaceLiftBottomPanel = function(item, lifted) {
    if (!item) return;
    function applyToCols(cols) {
        if (!Array.isArray(cols)) return;
        cols.forEach(function(col) {
            if (!col || col.type === 'desk') return;
            if (lifted) {
                col.noPlinth = true;
                col.spaceBottomPanel = true;
            } else {
                col.spaceBottomPanel = false;
                if (!(col.floorOffset > 0)) col.noPlinth = false;
            }
        });
    }
    function applyToWings(wings) {
        if (!wings) return;
        ['center', 'left', 'right'].forEach(function(k) {
            if (wings[k] && wings[k].columns) applyToCols(wings[k].columns);
        });
    }
    if (!item.rawState) item.rawState = {};
    applyToWings(item.rawState.wings);
    applyToCols(item.rawState.columns);

    const cart = state.orderCart || [];
    let itemIndex = -1;
    for (let i = 0; i < cart.length; i++) {
        if (cart[i] === item) { itemIndex = i; break; }
    }
    if (itemIndex >= 0 && state.editingCartIndex === itemIndex) {
        applyToCols(state.columns);
        applyToWings(state.wings);
    }
};

window._setSpaceOffsetFromUI = function(axis, val) {
    const item = window._getSpaceMovableItem() || window._getSpaceSlot1Item();
    const cur = window._getSpaceOffset(item);
    if (axis === 'x') window._setSpaceOffset(val, cur.y, { preferAxis: 'x' });
    else if (axis === 'z') window._setSpaceOffset(cur.x, cur.y, { preferAxis: 'z', z: val });
    else window._setSpaceOffset(cur.x, val, { preferAxis: 'y' });
};

window._syncSpaceOffsetUI = function() {
    const info = window._getSpacePairInfo();
    const item = window._getSpaceMovableItem();
    const off = window._getSpaceOffset(item);
    const ids = ['inp-num-space-x', 'mobile-inp-num-space-x'];
    const yids = ['inp-num-space-y', 'mobile-inp-num-space-y'];
    ids.forEach(function(id) {
        const el = document.getElementById(id);
        if (el && document.activeElement !== el) el.value = off.x;
    });
    yids.forEach(function(id) {
        const el = document.getElementById(id);
        if (el && document.activeElement !== el) el.value = off.y;
    });
    ['inp-num-space-z', 'mobile-inp-num-space-z'].forEach(function(id) {
        const el = document.getElementById(id);
        if (el && document.activeElement !== el) el.value = off.z;
    });
    const label = document.getElementById('space-cab-offset-label');
    const mLabel = document.getElementById('mobile-space-cab-offset-label');
    const n = info && info.activeSlot > 0 ? (info.activeSlot + 1) : 2;
    const text = 'מיקום ארון ' + n + ' במרחב';
    if (label) label.innerHTML = '<i class="fa-solid fa-up-down-left-right"></i> ' + text;
    if (mLabel) mLabel.textContent = text;
};

window._cartItemCanShareSpace = function(item) {
    if (!item || window._spacePairIdOf(item)) return false;
    const p = (item.rawState && item.rawState.presetId) || 'linear';
    return window._isSpaceCompatiblePreset(p);
};

window._joinableSpaceCabinets = function() {
    const cart = state.orderCart || [];
    const cur = state.editingCartIndex;
    const out = [];
    cart.forEach(function(it, i) {
        if (i === cur) return;
        if (window._cartItemCanShareSpace(it)) out.push(i);
    });
    return out;
};

window._fillSpaceJoinList = function(el, indices) {
    if (!el) return;
    el.innerHTML = '';
    if (!indices.length) {
        el.style.display = 'none';
        return;
    }
    indices.forEach(function(i) {
        const it = state.orderCart[i];
        const name = ((it && it.spec && it.spec.customName) ||
            (it && it.rawState && it.rawState.cabinetName) || '').trim();
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'space-cab-join-item';
        btn.onclick = function() { window.joinExistingSpaceCabinet(i); };
        const icon = document.createElement('i');
        icon.className = 'fa-solid fa-link';
        icon.style.marginLeft = '6px';
        icon.style.opacity = '0.7';
        btn.appendChild(icon);
        btn.appendChild(document.createTextNode(name || ('ארון מס\' ' + (i + 1))));
        el.appendChild(btn);
    });
};

window.toggleJoinSpacePicker = function() {
    if (!window._spacePairCanUse()) return;
    const info = window._getSpacePairInfo();
    if (info && info.planLimitReached && typeof window._showPlanUpsell === 'function') {
        window._showPlanUpsell('הוספת יותר מ-' + window._spacePlanMax() + ' ארונות במרחב');
        return;
    }
    if (info && !info.canAddMore) return;
    const indices = window._joinableSpaceCabinets();
    if (!indices.length) return;
    ['space-cab-join-list', 'mobile-space-cab-join-list'].forEach(function(id) {
        const el = document.getElementById(id);
        if (!el) return;
        window._fillSpaceJoinList(el, indices);
        el.style.display = (el.style.display === 'flex') ? 'none' : 'flex';
    });
};

window.joinExistingSpaceCabinet = function(otherIndex) {
    otherIndex = parseInt(otherIndex, 10);
    if (!window._spacePairCanUse()) return;
    if (typeof window._commitCurrentCabinetToCart === 'function') {
        window._commitCurrentCabinetToCart({ flash: false });
    }
    const cart = state.orderCart || [];
    const idx0 = state.editingCartIndex;
    if (idx0 < 0 || otherIndex === idx0 || !cart[idx0] || !cart[otherIndex]) return;
    if (!window._cartItemCanShareSpace(cart[otherIndex])) return;

    const info = window._getSpacePairInfo();
    if (info) {
        if (!info.canAddMore) return;
        const wNew = Math.round((cart[otherIndex].rawState && cart[otherIndex].rawState.width) || 160);
        const offset = window._suggestNextSpaceOffset(wNew);
        window._attachSpacePairToItem(cart[otherIndex], info.pairId, info.count, offset);
    } else {
        if (window._spacePairIdOf(cart[idx0])) return;
        const pairId = 'sp_' + Date.now().toString(36) + Math.floor(Math.random() * 1000).toString(36);
        const w1 = Math.round(state.width || (cart[idx0].rawState && cart[idx0].rawState.width) || 160);
        const w2 = Math.round((cart[otherIndex].rawState && cart[otherIndex].rawState.width) || 160);
        const offsetX = Math.round((w1 + w2) / 2 + 10);
        window._attachSpacePairToItem(cart[idx0], pairId, 0, { x: 0, y: 0 });
        window._attachSpacePairToItem(cart[otherIndex], pairId, 1, { x: offsetX, y: 0 });
    }

    if (typeof window._invalidateSpacePairPreviewImages === 'function') {
        const pid = window._spacePairIdOf(cart[idx0]);
        if (pid) window._invalidateSpacePairPreviewImages(pid);
    }
    if (typeof window._applySpacePairCabinetNames === 'function') {
        const pid = window._spacePairIdOf(cart[idx0]);
        if (pid) {
            const base = window._spacePairBaseNameFromItem(cart[idx0]) ||
                window._stripSpacePartSuffix(state.cabinetName || '');
            if (base) window._applySpacePairCabinetNames(pid, base);
        }
    }

    ['space-cab-join-list', 'mobile-space-cab-join-list'].forEach(function(id) {
        const el = document.getElementById(id);
        if (el) { el.innerHTML = ''; el.style.display = 'none'; }
    });
    window._syncSpacePairTabs();
    if (typeof buildCabinet === 'function') buildCabinet();
    if (typeof updateCameraView === 'function') updateCameraView();
    if (typeof calculatePrice === 'function') calculatePrice();
    if (typeof updateLeftSidebar === 'function') updateLeftSidebar();
    if (typeof saveHistoryState === 'function') saveHistoryState();
    if (typeof window._markCurrentCabinetClean === 'function') window._markCurrentCabinetClean();
};

window._syncSpacePairTabs = function() {
    const canUse = window._spacePairCanUse();
    const info = window._getSpacePairInfo();
    const maxCab = window._SPACE_MAX_CABINETS || 4;
    const row = document.getElementById('space-cab-tabs');
    const mRow = document.getElementById('mobile-space-cab-tabs');
    const addBtn = document.getElementById('btn-add-space-cab');
    const mAddBtn = document.getElementById('mobile-btn-add-space-cab');
    const joinBtn = document.getElementById('btn-join-space-cab');
    const mJoinBtn = document.getElementById('mobile-btn-join-space-cab');
    const leaveBtn = document.getElementById('btn-leave-space-cab');
    const mLeaveBtn = document.getElementById('mobile-btn-leave-space-cab');
    const joinList = document.getElementById('space-cab-join-list');
    const mJoinList = document.getElementById('mobile-space-cab-join-list');
    const tabsWrap = document.getElementById('space-cab-tabs-btns');
    const mTabsWrap = document.getElementById('mobile-space-cab-tabs-btns');
    const offsetRow = document.getElementById('space-cab-offset-row');
    const mOffsetRow = document.getElementById('mobile-space-cab-offset-row');
    const planLocked = !!(info && info.planLimitReached);
    const canAdd = canUse && (!info || info.canAddMore || planLocked);
    const joinable = canAdd ? window._joinableSpaceCabinets() : [];
    [addBtn, mAddBtn, joinBtn, mJoinBtn].forEach(function(b) {
        if (b) b.classList.toggle('plan-locked', planLocked);
    });
    const showOffset = !!(info && info.activeSlot > 0);
    const showLeave = !!(info && info.count >= 2);

    if (row) row.style.display = canUse ? '' : 'none';
    if (mRow) mRow.style.display = canUse ? '' : 'none';
    if (addBtn) addBtn.style.display = canAdd ? '' : 'none';
    if (mAddBtn) mAddBtn.style.display = canAdd ? '' : 'none';
    if (joinBtn) joinBtn.style.display = (joinable.length > 0) ? '' : 'none';
    if (mJoinBtn) mJoinBtn.style.display = (joinable.length > 0) ? '' : 'none';
    if (leaveBtn) leaveBtn.style.display = showLeave ? '' : 'none';
    if (mLeaveBtn) mLeaveBtn.style.display = showLeave ? '' : 'none';
    if (joinList) window._fillSpaceJoinList(joinList, joinList.style.display === 'flex' ? joinable : []);
    if (mJoinList) window._fillSpaceJoinList(mJoinList, mJoinList.style.display === 'flex' ? joinable : []);
    if (tabsWrap) tabsWrap.style.display = info ? 'flex' : 'none';
    if (mTabsWrap) mTabsWrap.style.display = info ? 'flex' : 'none';
    if (offsetRow) offsetRow.style.display = showOffset ? '' : 'none';
    if (mOffsetRow) mOffsetRow.style.display = showOffset ? '' : 'none';

    for (let s = 0; s < maxCab; s++) {
        const a = document.getElementById('space-cab-tab-' + s);
        const b = document.getElementById('mobile-space-cab-tab-' + s);
        const visible = !!(info && info.slotIndices[s] != null);
        const item = visible ? state.orderCart[info.slotIndices[s]] : null;
        const label = visible ? window._spaceTabLabel(item, s) : ('ארון ' + (s + 1));
        [a, b].forEach(function(btn) {
            if (!btn) return;
            btn.style.display = visible ? '' : 'none';
            btn.textContent = label;
            btn.classList.toggle('active', !!(info && info.activeSlot === s));
        });
    }
    if (info) window._syncSpaceOffsetUI();
};

window._unlinkSpacePair = function(opts) {
    opts = opts || {};
    const cart = state.orderCart || [];
    let pairId = opts.pairId || null;
    if (!pairId && typeof opts.index === 'number' && cart[opts.index]) {
        pairId = window._spacePairIdOf(cart[opts.index]);
    }
    if (!pairId && state.editingCartIndex >= 0 && cart[state.editingCartIndex]) {
        pairId = window._spacePairIdOf(cart[state.editingCartIndex]);
    }
    if (!pairId) return;
    cart.forEach(function(it) {
        if (window._spacePairIdOf(it) === pairId) window._stripSpacePairFromItem(it);
    });
    if (typeof window._clearSpaceCompanion === 'function') window._clearSpaceCompanion();
    window._syncSpacePairTabs();
};

/** After removing a member, keep slots contiguous (0..n-1) and rebase offsets if slot 0 left. */
window._renumberSpacePairSlots = function(pairId) {
    if (!pairId) return;
    const members = [];
    (state.orderCart || []).forEach(function(it, i) {
        if (window._spacePairIdOf(it) === pairId) {
            members.push({
                it: it,
                index: i,
                slot: window._spacePairSlotOf(it),
                offset: window._getSpaceOffset(it)
            });
        }
    });
    if (members.length < 2) {
        members.forEach(function(m) { window._stripSpacePairFromItem(m.it); });
        return;
    }
    members.sort(function(a, b) { return a.slot - b.slot; });
    const anchorOff = members[0].offset || { x: 0, y: 0, z: 0 };
    members.forEach(function(m, newSlot) {
        const rebased = newSlot === 0
            ? { x: 0, y: 0, z: 0 }
            : {
                x: Math.round((m.offset.x || 0) - (anchorOff.x || 0)),
                y: Math.round((m.offset.y || 0) - (anchorOff.y || 0)),
                z: Math.round((m.offset.z || 0) - (anchorOff.z || 0))
            };
        window._attachSpacePairToItem(m.it, pairId, newSlot, rebased);
    });
    const base = window._spacePairBaseNameFromItem(members[0].it) ||
        window._stripSpacePartSuffix((members[0].it.spec && members[0].it.spec.customName) || '');
    if (base && typeof window._applySpacePairCabinetNames === 'function') {
        window._applySpacePairCabinetNames(pairId, base);
    }
};

/** Remove one cabinet from a shared space (keeps the cabinet in the project). */
window.removeCabinetFromSpace = function(index) {
    const cart = state.orderCart || [];
    const idx = (typeof index === 'number') ? index : state.editingCartIndex;
    if (idx < 0 || !cart[idx]) return;
    const item = cart[idx];
    const pairId = window._spacePairIdOf(item);
    if (!pairId) return;

    const baseName = window._spacePairBaseNameFromItem(item) ||
        window._stripSpacePartSuffix((item.spec && item.spec.customName) || state.cabinetName || '');
    window._stripSpacePairFromItem(item);
    if (baseName) {
        if (!item.spec) item.spec = {};
        if (!item.rawState) item.rawState = {};
        item.spec.customName = baseName;
        item.rawState.cabinetName = baseName;
    }
    if (typeof window._invalidateSpacePairPreviewImages === 'function') {
        window._invalidateSpacePairPreviewImages(pairId);
    }
    window._renumberSpacePairSlots(pairId);

    if (state.editingCartIndex === idx) {
        state.cabinetName = baseName || '';
        if (state.wings && state.wings.center) state.wings.center.cabinetName = state.cabinetName;
        const desk = document.getElementById('inp-cabinet-name');
        const m1 = document.getElementById('mobile-inp-cabinet-name');
        const m2 = document.getElementById('mobile-inp-cabinet-name2');
        if (desk && document.activeElement !== desk) desk.value = state.cabinetName;
        if (m1 && document.activeElement !== m1) m1.value = state.cabinetName;
        if (m2 && document.activeElement !== m2) m2.value = state.cabinetName;
        if (typeof window._clearSpaceCompanion === 'function') window._clearSpaceCompanion();
        if (typeof buildCabinet === 'function') buildCabinet();
        if (typeof updateCameraView === 'function') updateCameraView();
    }
    if (typeof window._syncSpacePairTabs === 'function') window._syncSpacePairTabs();
    if (typeof updateLeftSidebar === 'function') updateLeftSidebar();
    if (typeof saveHistoryState === 'function') saveHistoryState();
    if (typeof window._markCurrentCabinetClean === 'function') window._markCurrentCabinetClean();
};

window.addSpaceCabinet = function() {
    if (!window._spacePairCanUse()) return;
    const existing = window._getSpacePairInfo();
    if (existing && existing.planLimitReached && typeof window._showPlanUpsell === 'function') {
        window._showPlanUpsell('הוספת יותר מ-' + window._spacePlanMax() + ' ארונות במרחב');
        return;
    }
    if (existing && !existing.canAddMore) return;
    if (typeof window._commitCurrentCabinetToCart === 'function') {
        window._commitCurrentCabinetToCart({ flash: false });
    }
    const idx0 = state.editingCartIndex;
    if (idx0 < 0 || !state.orderCart[idx0]) return;

    let pairId;
    let nextSlot;
    let offset;

    if (existing) {
        pairId = existing.pairId;
        nextSlot = existing.count;
        let maxRight = 0;
        existing.members.forEach(function(m) {
            const fp = window._spaceCabinetFootprint(m.slot);
            const off = window._spaceOffsetForSlot(m.slot);
            maxRight = Math.max(maxRight, off.x + fp.w / 2);
        });
        if (typeof window._resetEditorToDefaultLinearCabinet === 'function') {
            window._resetEditorToDefaultLinearCabinet();
        }
        const itemN = window._snapshotCurrentCabinetToCartItem();
        itemN.rawState.partColors = {};
        const wN = Math.round((itemN.rawState && itemN.rawState.width) || 160);
        offset = { x: Math.round(maxRight + wN / 2 + 10), y: 0 };
        window._attachSpacePairToItem(itemN, pairId, nextSlot, offset);
        state.orderCart.push(itemN);
    } else {
        if (window._spacePairIdOf(state.orderCart[idx0])) return;
        const w0 = Math.round(state.width || 160);
        pairId = 'sp_' + Date.now().toString(36) + Math.floor(Math.random() * 1000).toString(36);
        window._attachSpacePairToItem(state.orderCart[idx0], pairId, 0, { x: 0, y: 0 });
        if (typeof window._resetEditorToDefaultLinearCabinet === 'function') {
            window._resetEditorToDefaultLinearCabinet();
        }
        const itemN = window._snapshotCurrentCabinetToCartItem();
        itemN.rawState.partColors = {};
        const wN = Math.round((itemN.rawState && itemN.rawState.width) || 160);
        offset = { x: Math.round((w0 + wN) / 2 + 10), y: 0 };
        window._attachSpacePairToItem(itemN, pairId, 1, offset);
        state.orderCart.push(itemN);
    }

    const newIdx = state.orderCart.length - 1;
    state.editingCartIndex = newIdx;
    if (typeof window._roomLinksLoadForHost === 'function') window._roomLinksLoadForHost(newIdx);
    if (typeof window._invalidateSpacePairPreviewImages === 'function' && pairId) {
        window._invalidateSpacePairPreviewImages(pairId);
    }
    if (typeof window._applySpacePairCabinetNames === 'function' && pairId) {
        const anchor = state.orderCart.find(function(it) {
            return window._spacePairIdOf(it) === pairId && window._spacePairSlotOf(it) === 0;
        }) || state.orderCart[idx0];
        const base = window._spacePairBaseNameFromItem(anchor) ||
            window._stripSpacePartSuffix(state.cabinetName || '');
        if (base) window._applySpacePairCabinetNames(pairId, base);
    }
    if (typeof window._syncPartColorScope === 'function') window._syncPartColorScope();
    if (typeof _setSaveCabinetButtonLabel === 'function') _setSaveCabinetButtonLabel();
    const cc = document.getElementById('cart-count');
    if (cc) cc.innerText = state.orderCart.length;
    if (typeof window._restorePresetUI === 'function') window._restorePresetUI();
    if (typeof updateLeftSidebar === 'function') updateLeftSidebar({ scrollToActive: true });
    window._syncSpacePairTabs();
    if (typeof buildCabinet === 'function') buildCabinet();
    if (typeof updateCameraView === 'function') updateCameraView();
    if (typeof calculatePrice === 'function') calculatePrice();
    if (typeof saveHistoryState === 'function') saveHistoryState();
    if (typeof window._markCurrentCabinetClean === 'function') window._markCurrentCabinetClean();
};

window.switchSpaceCabinet = function(slot) {
    const info = window._getSpacePairInfo();
    if (!info || info.slotIndices[slot] == null) return;
    const targetIdx = info.slotIndices[slot];
    if (targetIdx === state.editingCartIndex) return;
    if (typeof window._commitCurrentCabinetToCart === 'function') {
        window._commitCurrentCabinetToCart({ flash: false });
    }
    if (typeof window._editCartItemNow === 'function') window._editCartItemNow(targetIdx);
};

function _wingsFromSource(src) {
    if (!src || !src.wings) return [];
    const w = src.wings;
    return [w.center, w.left, w.right].filter(Boolean);
}

function _collectCornerCandidates(item, itemObj, liveState) {
    const list = [];
    function add(cu) { if (cu) list.push(cu); }
    if (liveState) {
        add(liveState.corner);
        _wingsFromSource(liveState).forEach(function(w) { add(w.corner); });
    }
    if (item) add(item.corner);
    const rs = itemObj && itemObj.rawState;
    if (rs) {
        add(rs.corner);
        _wingsFromSource(rs).forEach(function(w) { add(w.corner); });
    }
    return list;
}

function _cornerUnitFromSources(item, itemObj, liveState) {
    const corners = _collectCornerCandidates(item, itemObj, liveState);
    const active = corners.filter(function(cu) { return cu.side && cu.side !== 'none'; });
    return active.find(function(cu) { return cu.type === 'desk'; }) || active[0] || null;
}

function _sideDeskFromSources(itemObj, liveState) {
    function pick(d) { return d && d.side && d.side !== 'none' ? d : null; }
    const fromLive = pick(liveState && liveState.desk);
    if (fromLive) return fromLive;
    if (liveState) {
        const wl = _wingsFromSource(liveState);
        for (let i = 0; i < wl.length; i++) {
            const d = pick(wl[i].desk);
            if (d) return d;
        }
    }
    const rs = itemObj && itemObj.rawState;
    if (!rs) return null;
    const fromRs = pick(rs.desk);
    if (fromRs) return fromRs;
    const wr = _wingsFromSource(rs);
    for (let j = 0; j < wr.length; j++) {
        const d2 = pick(wr[j].desk);
        if (d2) return d2;
    }
    return null;
}

function _hasInternalDeskFromSources(itemObj, liveState) {
    function colsHaveDesk(cols) {
        return (cols || []).some(function(c) { return c && c.type === 'desk'; });
    }
    if (liveState) {
        if (colsHaveDesk(liveState.columns)) return true;
        if (_wingsFromSource(liveState).some(function(w) { return colsHaveDesk(w.columns); })) return true;
    }
    const rs = itemObj && itemObj.rawState;
    if (!rs) return false;
    if (colsHaveDesk(rs.columns)) return true;
    return _wingsFromSource(rs).some(function(w) { return colsHaveDesk(w.columns); });
}

/** Factory/quote label for extra desks, including corner-desk dimensions. */
function _formatDeskAddition(item, itemObj, liveState) {
    const labels = [];
    const dimLines = [];
    const cu = _cornerUnitFromSources(item, itemObj, liveState);
    if (cu && cu.type === 'desk') {
        const sideHe = cu.side === 'right' ? 'ימין' : 'שמאל';
        let lab = 'שולחן פינתי (' + sideHe + ')';
        if (cu.deskFloating) lab += ' — מרחף';
        labels.push(lab);
        let dims = 'רוחב: ' + Math.round(cu.width || 60) + ' ס"מ | גובה: ' +
            Math.round(cu.height || 90) + ' ס"מ | עומק: ' + Math.round(cu.depth || 54) + ' ס"מ';
        const n = cu.deskDrawerCount || 0;
        if (n > 0) {
            dims += ' | מגירות: ' + n;
            if (cu.deskDrawerHeight) dims += ' × ' + cu.deskDrawerHeight + ' ס"מ';
        }
        dimLines.push(dims);
    }
    const sd = _sideDeskFromSources(itemObj, liveState);
    if (sd) {
        labels.push(sd.side === 'left' ? 'מצורף שולחן חיצוני (משמאל)' : 'מצורף שולחן חיצוני (מימין)');
        dimLines.push('רוחב: ' + Math.round(sd.width || 100) + ' ס"מ | גובה: ' + Math.round(sd.height || 80) + ' ס"מ');
    }
    if (_hasInternalDeskFromSources(itemObj, liveState)) {
        labels.push('שולחן עבודה פנימי משולב');
    }
    return {
        desk: labels.length ? labels.join(' · ') : 'ללא',
        deskDims: dimLines.join(' · ')
    };
}

function _appendDeskPrintRows(rows, item, itemObj) {
    const ds = _formatDeskAddition(item, itemObj);
    rows.push({ id: 'desk', label: 'תוספת שולחן', value: _plainSpecValue(ds.desk) });
    if (ds.deskDims) {
        rows.push({ id: 'deskDims', label: 'מידות שולחן', value: _plainSpecValue(ds.deskDims), rtl: true });
    }
    return ds;
}

window._snapshotCurrentCabinetToCartItem = function() {
const preview = (typeof window._captureCabinetPreviewImages === 'function')
        ? window._captureCabinetPreviewImages()
        : { imgDoors: null, imgOpen: null, wingPreviews: [], multiViewPages: [], multiViewSVG: null };
        const imgWithDoors = preview.imgDoors;
        const imgNoDoors = preview.imgOpen;
        const wingPreviews = preview.wingPreviews || [];
        const imgBlueprint = null;

        const contentCounts = _countCabinetContentFromRawState({ wings: state.wings, columns: state.columns });
        const totalShelves = contentCounts.shelves;
        const hangingRods = contentCounts.hanging + contentCounts.sorbet;
        const intDrawers = contentCounts.drawersInt;
        const extDrawers = contentCounts.drawersExt;
        const openCellsCount = contentCounts.openCells + contentCounts.sideOpenCells;

        let modelNameText = 'מאיה';
        if(state.cabinetModel === 'c9') modelNameText = 'C9';
        if(state.cabinetModel === 'ab2_nohoney') modelNameText = 'ארון עם חזיתות פנימיות';
        if(state.cabinetModel === 'ab2') modelNameText = 'AB2';
        if(state.cabinetModel === 'regalim') modelNameText = 'רגלי ניקל';
        const _cfgTypes = (window._pricingConfig && Array.isArray(window._pricingConfig.cabinetTypes)) ? window._pricingConfig.cabinetTypes : [];
        const _customType = _cfgTypes.find(t => t && t.id === state.cabinetTypeId && t.engine === state.cabinetModel && t.id !== t.engine);
        if (_customType && _customType.label) modelNameText = _customType.label;
        const _isWritingDeskCart = state.presetId === 'writing-desk';
        const _wdCart = _isWritingDeskCart && state.wings && state.wings.center
            ? (state.wings.center.writingDesk || {}) : {};
        if (_isWritingDeskCart) modelNameText = 'שולחן כתיבה';
        // Sliding wardrobe: override model name based on whether any door panel is a mirror
        if (state.presetId === 'sliding') {
            const _sdWing = state.wings.center;
            const _sdData = _sdWing && _sdWing.slidingDoor;
            const _sdPanels = (_sdData && _sdData.doorPanels) || [];
            const _hasMirrorPanel = _sdPanels.some(p => p === 'mirror' || p === 'mirror_dark');
            modelNameText = _hasMirrorPanel ? 'HRM2100' : 'HR2300';
        }
        const _customModelLabel = String(
            (state.wings && state.wings.center && state.wings.center.cabinetModelLabel) ||
            state.cabinetModelLabel || ''
        ).trim();
        if (_customModelLabel) modelNameText = _customModelLabel;

        let plinthTypeText = 'צוקל נסתר';
        if(state.cabinetModel === 'c9') plinthTypeText = 'צוקל רגיל';
        if(state.cabinetModel === 'ab2_nohoney') plinthTypeText = 'ארון עם חזיתות פנימיות';
        if(state.cabinetModel === 'ab2') plinthTypeText = 'צוקל נסתר (חזית פנימית טאצ\')';
        if(state.cabinetModel === 'regalim') plinthTypeText = 'רגלי ניקל 10 ס"מ';
        if (_isWritingDeskCart) plinthTypeText = 'ללא צוקל';

        const _deskPack = _formatDeskAddition(null, null, state);
        let deskInfo = _deskPack.desk;
        const deskDimsInfo = _deskPack.deskDims;

        const priceEl = document.getElementById('price-display');
        const currentDisplayPrice = priceEl ? (parseInt(priceEl.value) || 0) : 0;
        const priceStr = '₪' + currentDisplayPrice.toLocaleString();

        const rawState = JSON.parse(JSON.stringify({
            cabinetModel: state.cabinetModel,
            placement: state.placement,
            width: state.width, globalHeight: state.globalHeight, depth: state.depth, thickness: state.thickness,
            plinthHeight: state.plinthHeight, hasDoors: state.hasDoors, handleType: state.handleType, handleStyle: state.handleStyle, handleVariant: state.handleVariant, ridingColor: state.ridingColor,
            cabinetName: state.cabinetName, cabinetModelLabel: (state.wings && state.wings.center && state.wings.center.cabinetModelLabel) || state.cabinetModelLabel || '', cabinetNotes: state.cabinetNotes, manualPrice: state.manualPrice,
            manualInstallPrice: getWing().manualInstallPrice != null ? getWing().manualInstallPrice : null,
            boardMaterial: state.boardMaterial, materialBody: state.materialBody, materialInternal: state.materialInternal,
            materialExternal: state.materialExternal, materialDesk: state.materialDesk, materialOpenCell: state.materialOpenCell, materialBack: state.materialBack, columns: state.columns, desk: state.desk,
            // Wing system — needed to restore corner/walkin/sliding cabinets correctly
            wings: state.wings, activeWing: state.activeWing, presetId: state.presetId,
            // Room wall position (closure panel)
            roomWall: window._roomWall || state.roomWall || 'center',
            closureEnabled:    (window._closureEnabled !== undefined) ? window._closureEnabled : true,
            closureWidth:      window._closureWidth      || 1.8,
            closureWidthRight: window._closureWidthRight || 1.8,
            closureCeilWidth:  window._closureCeilWidth  || 1.8,
            closureDepthWidth: window._closureDepthWidth || 1.8,
            closureFrontLine:       window._closureFrontLine  || 'cabinet',
            blueprintCutouts: state.blueprintCutouts || [],
            blueprintCellDimOffsets: state.blueprintCellDimOffsets || {},
            blueprintDimOffsets: state.blueprintDimOffsets || {},
            blueprintInternalDimsDefault: state.blueprintInternalDimsDefault !== false,
            blueprintCellDimShown: state.blueprintCellDimShown || {},
            blueprintColWidthDimsDefault: state.blueprintColWidthDimsDefault !== false,
            blueprintColWidthDimShown: state.blueprintColWidthDimShown || {},
            blueprintHeightDimsDefault: state.blueprintHeightDimsDefault !== false,
            partColors: (typeof window._exportLocalPartColors === 'function')
                ? window._exportLocalPartColors()
                : JSON.parse(JSON.stringify(state.partColors || {}))
        }));
        const _cartUid = typeof window._cartUidAt === 'function' ? window._cartUidAt(state.editingCartIndex) : null;
        if (_cartUid) rawState.cartUid = _cartUid;

        // Collect unique extra colors from per-part overrides
        const _extraColorsSet = new Set();
        if (state.partColors && typeof state.partColors === 'object') {
            Object.values(state.partColors).forEach(key => {
                if (key) _extraColorsSet.add(_colorKeyLabel(key));
            });
        }
        const extraColorsStr = _extraColorsSet.size > 0 ? Array.from(_extraColorsSet).join(', ') : null;

        // Build sliding door summary for spec sheet
        const _sd = state.presetId === 'sliding' && state.slidingDoor && state.slidingDoor.enabled ? state.slidingDoor : null;
        let slidingDoorSpec = null;
        if (_sd) {
            const _panelTypeLabel = { solid: 'אטום', glass: 'זכוכית', mirror: 'מראה רגילה', mirror_dark: 'מראה כהה' };
            const _profileColorLabel = { nickel: 'ניקל', black: 'שחור', white: 'לבן', cream: 'קרם', gold_matte: 'זהב מט' };
            const numDoors = _sd.numDoors || 2;
            const doorPanels = _sd.doorPanels || [];
            const doorColors = _sd.doorColors || [];
            const bodyMatKey = state.materialExternal || state.materialBody;

            // Check if any door is mirror
            const hasMirror = doorPanels.some(p => p === 'mirror' || p === 'mirror_dark');

            // Build per-door color list — use per-door override or fall back to external/body color
            const doorColorsList = Array.from({ length: numDoors }, (_, i) => {
                const panel = doorPanels[i] || 'solid';
                const isMirrorDoor = panel === 'mirror' || panel === 'mirror_dark';
                if (isMirrorDoor) return _panelTypeLabel[panel] || 'מראה';
                const colorKey = doorColors[i] || bodyMatKey;
                return _colorKeyLabel(colorKey);
            });

            slidingDoorSpec = {
                numDoors,
                profileColor: _profileColorLabel[_sd.profileColor] || _sd.profileColor || 'ניקל',
                hasMirror,
                doorColorsList,   // array of per-door color/type strings
                doorColorsStr: doorColorsList.map((c, i) => `דלת ${i + 1}: ${c}`).join(' | ')
            };
        }

        let multiViewPages = [];
        let multiViewLabels = [];
        let multiViewSVG = null;
        try {
            multiViewSVG = preview.multiViewSVG || ((typeof window._generateMultiViewBlueprintSVG === 'function')
                ? window._generateMultiViewBlueprintSVG() : null);
            if (preview.multiViewPages && preview.multiViewPages.length) {
                multiViewPages = preview.multiViewPages;
                multiViewLabels = preview.multiViewLabels || [];
            } else if (typeof window._generateMultiViewBlueprintPages === 'function') {
                const bpPages = window._generateMultiViewBlueprintPages();
                multiViewPages = bpPages.map(pg => pg.svg);
                multiViewLabels = bpPages.map(pg => pg.label || '');
            }
        } catch (bpErr) {
            console.warn('[cart-snapshot] blueprint generation failed:', bpErr);
        }

        const _wdHeightCart = _wdCart.height != null ? _wdCart.height : state.globalHeight;
        const _wdDrawerCountCart = (_wdCart.hasDrawers === false) ? 0
            : (_wdCart.drawerCount != null ? _wdCart.drawerCount : (state.width <= 80 ? 1 : 2));
        const _wdDimsStr = _isWritingDeskCart
            ? `רוחב: ${state.width} ס"מ | גובה: ${_wdHeightCart} ס"מ | עומק: ${state.depth} ס"מ`
            : `רוחב: ${state.width} ס"מ | גובה: ${_wingBodyHeightFromData(typeof getWing === 'function' ? getWing() : { columns: state.columns, globalHeight: state.globalHeight }, state.globalHeight)} ס"מ | עומק: ${state.depth} ס"מ`;

        const cabinetSpec = {
            customName: state.cabinetName, cabinetNotes: (state.cabinetNotes || '').trim(), modelName: modelNameText, cabinetModelLabel: _customModelLabel, plinthType: plinthTypeText,
            placement: _isWritingDeskCart ? 'שולחן עמידה' : (placementHebrew[state.placement] || 'ארון קיר חופשי'),
            dimsStr: _wdDimsStr,
            material: state.boardMaterial === 'mdf' ? 'MDF' : state.boardMaterial === 'melamine' ? 'מלמין' : "סנדביץ'",
            handle: window._handleStyleLabel(state.handleStyle, state.handleVariant, state.handleType, state.ridingColor),
            desk: deskInfo,
            deskDims: deskDimsInfo,
            colorBody: _colorKeyLabel(state.materialBody),
            colorInternal: _colorKeyLabel(state.materialInternal),
            colorBack: _colorKeyLabel(state.materialBack),
            colorExternal: _colorKeyLabel(state.materialExternal),
            colorDesk: _colorKeyLabel(state.materialDesk),
            colorOpenCell: _resolveOpenCellColorLabel(state.wings, state.materialOpenCell),
            colorDrawers: _isWritingDeskCart ? _colorKeyLabel(state.materialExternal) : undefined,
            isWritingDesk: _isWritingDeskCart,
            writingDeskHasDrawers: !_isWritingDeskCart || _wdCart.hasDrawers !== false,
            writingDeskDrawerCount: _isWritingDeskCart ? _wdDrawerCountCart : undefined,
            writingDeskDrawerHeight: _isWritingDeskCart && _wdCart.drawerHeight != null ? _wdCart.drawerHeight : undefined,
            hasOpenCells: openCellsCount > 0,
            extraColors: extraColorsStr,
            shelves: _isWritingDeskCart ? 0 : totalShelves,
            hanging: _isWritingDeskCart ? 0 : hangingRods,
            sorbetCount: _isWritingDeskCart ? 0 : contentCounts.sorbet,
            drawersInt: _isWritingDeskCart ? 0 : intDrawers,
            drawersExt: _isWritingDeskCart ? _wdDrawerCountCart : extDrawers,
            price: priceStr, costPrice: '₪' + (state.currentCostPrice || 0).toLocaleString(),
            installPrice: getWing().manualInstallPrice != null ? getWing().manualInstallPrice : state.currentInstallPrice,
            imgDoors: imgWithDoors, imgOpen: imgNoDoors, imgBlueprint: imgBlueprint,
            imgSpaceDoors: (preview && preview.imgSpaceDoors) || null,
            imgSpaceOpen: (preview && preview.imgSpaceOpen) || null,
            wingPreviews: wingPreviews,
            cornerAngle: (preview && preview.cornerAngle) || null,
            captureVer: (preview && preview.captureVer) || 4,
            corner: (function() {
                const cu = _cornerUnitFromSources(null, null, state);
                if (cu) return JSON.parse(JSON.stringify(cu));
                return state.corner ? JSON.parse(JSON.stringify(state.corner)) : null;
            })(),
            slidingDoor: slidingDoorSpec,
            multiViewSVG: multiViewSVG,
            multiViewPages: multiViewPages,
            multiViewLabels: multiViewLabels
        };
    return { spec: cabinetSpec, rawState: rawState };
};

window._commitCurrentCabinetToCart = function(opts) {
    opts = opts || {};
    const cartItem = window._snapshotCurrentCabinetToCartItem();
    const cabinetSpec = cartItem.spec;

    if (state.editingCartIndex > -1 && state.orderCart[state.editingCartIndex]) {
        const oldItem = state.orderCart[state.editingCartIndex];
        _cartLog('commit → overwriting index=' + state.editingCartIndex, {
            was: _cartItemLabel(oldItem, state.editingCartIndex) + ' ' + ((oldItem.spec && oldItem.spec.dimsStr) || ''),
            now: _cartItemLabel(cartItem, state.editingCartIndex) + ' ' + (cabinetSpec.dimsStr || '')
        });
        const newHash = _hashPrintSpecSource(_collectPrintSpecRows(cabinetSpec, cartItem));
        if (oldItem && oldItem.printSpecEdits && oldItem.printSpecEdits.sourceHash === newHash) {
            cartItem.printSpecEdits = oldItem.printSpecEdits;
        }
        const _pid = typeof window._spacePairIdOf === 'function' ? window._spacePairIdOf(oldItem) : null;
        if (_pid && typeof window._attachSpacePairToItem === 'function') {
            window._attachSpacePairToItem(
                cartItem,
                _pid,
                window._spacePairSlotOf(oldItem),
                window._getSpaceOffset(oldItem)
            );
        }
        if (oldItem.spec) {
            if (oldItem.spec.imgSpaceDoorsManual) {
                cartItem.spec.imgSpaceDoors = oldItem.spec.imgSpaceDoors;
                cartItem.spec.imgSpaceDoorsManual = true;
                if (oldItem.spec.imgSpaceDoorsAuto) cartItem.spec.imgSpaceDoorsAuto = oldItem.spec.imgSpaceDoorsAuto;
            }
            if (oldItem.spec.imgSpaceOpenManual) {
                cartItem.spec.imgSpaceOpen = oldItem.spec.imgSpaceOpen;
                cartItem.spec.imgSpaceOpenManual = true;
                if (oldItem.spec.imgSpaceOpenAuto) cartItem.spec.imgSpaceOpenAuto = oldItem.spec.imgSpaceOpenAuto;
            }
            if (oldItem.spec.imgDoorsManual) {
                cartItem.spec.imgDoors = oldItem.spec.imgDoors;
                cartItem.spec.imgDoorsManual = true;
                if (oldItem.spec.imgDoorsAuto) cartItem.spec.imgDoorsAuto = oldItem.spec.imgDoorsAuto;
            }
            if (oldItem.spec.imgOpenManual) {
                cartItem.spec.imgOpen = oldItem.spec.imgOpen;
                cartItem.spec.imgOpenManual = true;
                if (oldItem.spec.imgOpenAuto) cartItem.spec.imgOpenAuto = oldItem.spec.imgOpenAuto;
            }
        }
        if (typeof window._cartItemOnHold === 'function' && window._cartItemOnHold(oldItem)) {
            window._setCartItemHold(cartItem, true);
        }
        const idx = state.editingCartIndex;
        cartItem.rawState.partColors = (typeof window._exportLocalPartColors === 'function')
            ? window._exportLocalPartColors('cart' + idx)
            : (cartItem.rawState.partColors || {});
        state.orderCart[idx] = cartItem;
        state.editingCartIndex = idx; // keep selection
        if (typeof window._syncPartColorScope === 'function') window._syncPartColorScope();
        if (opts.flash) _setSaveCabinetButtonLabel(`<i class="fa-solid fa-check"></i> הארון עודכן בהצלחה!`);
        else _setSaveCabinetButtonLabel();
        if (typeof window._syncSpacePairTabs === 'function') window._syncSpacePairTabs();
    } else {
        const newIdx = state.orderCart.length;
        if (typeof window._migrateDraftPartColorsToCart === 'function') {
            window._migrateDraftPartColorsToCart(newIdx);
        }
        cartItem.rawState.partColors = (typeof window._exportLocalPartColors === 'function')
            ? window._exportLocalPartColors('cart' + newIdx)
            : (cartItem.rawState.partColors || {});
        state.orderCart.push(cartItem);
        state.editingCartIndex = newIdx;
        if (typeof window._syncPartColorScope === 'function') window._syncPartColorScope();
        if (opts.flash) _setSaveCabinetButtonLabel(`<i class="fa-solid fa-check"></i> נשמר בעגלה!`);
        else _setSaveCabinetButtonLabel();
    }

    const cc2 = document.getElementById('cart-count');
    if (cc2) cc2.innerText = state.orderCart.length;
    if (typeof window._syncSpacePairPreviewImages === 'function') {
        window._syncSpacePairPreviewImages(state.orderCart[state.editingCartIndex]);
    }
    if (typeof window._applySpacePairCabinetNames === 'function') {
        const _saved = state.orderCart[state.editingCartIndex];
        const _pid = window._spacePairIdOf(_saved);
        if (_pid) {
            const base = window._spacePairBaseNameFromItem(_saved) ||
                window._stripSpacePartSuffix(state.cabinetName || '');
            if (base) window._applySpacePairCabinetNames(_pid, base);
        }
    }
    updateLeftSidebar();
    if (typeof saveHistoryState === 'function') saveHistoryState();
    if (typeof window._markCurrentCabinetClean === 'function') window._markCurrentCabinetClean();
    return state.editingCartIndex;
};

window._cartItemOnHold = function(item) {
    return !!(item && (item.onHold || (item.rawState && item.rawState.onHold)));
};

window._cartHasExportableItems = function() {
    return (state.orderCart || []).some(function(it) {
        return it && !window._cartItemOnHold(it);
    });
};

window._setCartItemHold = function(item, held) {
    if (!item) return;
    if (held) {
        item.onHold = true;
        if (!item.rawState) item.rawState = {};
        item.rawState.onHold = true;
    } else {
        delete item.onHold;
        if (item.rawState) delete item.rawState.onHold;
    }
};

window.toggleCartItemHold = function(index) {
    const item = state.orderCart && state.orderCart[index];
    if (!item) return;
    window._setCartItemHold(item, !window._cartItemOnHold(item));
    if (typeof updateLeftSidebar === 'function') updateLeftSidebar();
    if (typeof saveHistoryState === 'function') saveHistoryState();
};

window._selectCartCabinet = function(index, opts) {
    if (index < 0 || !state.orderCart[index]) return;
    window.editCartItem(index, opts || { force: true });
};

window._bootstrapDefaultCabinet = function() {
    if (typeof window._resetEditorToDefaultLinearCabinet === 'function') {
        window._resetEditorToDefaultLinearCabinet();
    } else {
        state.cabinetName = '';
        state.manualPrice = null;
        state.manualInstallPrice = null;
        const cabNameInp = document.getElementById('inp-cabinet-name');
        if (cabNameInp) cabNameInp.value = '';
        const modelLabelInp = document.getElementById('inp-cabinet-model-label');
        if (modelLabelInp) modelLabelInp.value = '';
        const mModelLabelInp = document.getElementById('mobile-inp-cabinet-model-label');
        if (mModelLabelInp) mModelLabelInp.value = '';
        if (typeof applyPreset === 'function') applyPreset('linear');
    }
    const item = window._snapshotCurrentCabinetToCartItem();
    item.rawState.partColors = {};
    state.orderCart = [item];
    state.editingCartIndex = 0;
    if (typeof window._roomLinksReset === 'function') window._roomLinksReset();
    if (typeof window._syncPartColorScope === 'function') window._syncPartColorScope();
    _setSaveCabinetButtonLabel();
    const cc = document.getElementById('cart-count');
    if (cc) cc.innerText = '1';
    updateLeftSidebar();
    if (typeof saveHistoryState === 'function') saveHistoryState();
    if (typeof window._markCurrentCabinetClean === 'function') window._markCurrentCabinetClean();
};

window._ensureCabinetSelected = function(preferredIndex) {
    if (!state.orderCart || state.orderCart.length === 0) {
        const item = window._snapshotCurrentCabinetToCartItem();
        state.orderCart = [item];
        state.editingCartIndex = 0;
        if (typeof window._roomLinksReset === 'function') window._roomLinksReset();
        if (typeof window._migrateDraftPartColorsToCart === 'function') {
            window._migrateDraftPartColorsToCart(0);
        }
        item.rawState.partColors = (typeof window._exportLocalPartColors === 'function')
            ? window._exportLocalPartColors('cart0')
            : (item.rawState.partColors || {});
        if (typeof window._syncPartColorScope === 'function') window._syncPartColorScope();
        _setSaveCabinetButtonLabel();
        const cc = document.getElementById('cart-count');
        if (cc) cc.innerText = '1';
        updateLeftSidebar();
        if (typeof window._markCurrentCabinetClean === 'function') window._markCurrentCabinetClean();
        return;
    }
    let idx = (typeof preferredIndex === 'number') ? preferredIndex : state.editingCartIndex;
    if (idx < 0 || idx >= state.orderCart.length) idx = 0;
    if (state.editingCartIndex !== idx) {
        window.editCartItem(idx, { force: true });
    } else {
        _setSaveCabinetButtonLabel();
        updateLeftSidebar();
        if (typeof window._markCurrentCabinetClean === 'function') window._markCurrentCabinetClean();
    }
};

// ── Cart debug log — on by default; window.cartDebug(false) silences it ────
window._cartDebugOn = (function() {
    try { return localStorage.getItem('cartDebug') !== '0'; } catch (e) { return true; }
})();
window.cartDebug = function(on) {
    window._cartDebugOn = on !== false;
    try { localStorage.setItem('cartDebug', window._cartDebugOn ? '1' : '0'); } catch (e) {}
    console.info('[Cart] debug ' + (window._cartDebugOn ? 'ON' : 'OFF'));
    return window._cartDebugOn;
};

function _cartItemLabel(it, i) {
    const s = (it && it.spec) || {};
    return s.customName || ('ארון מס\' ' + (i + 1));
}

/** Plain snapshot of the cart vs. what the sidebar currently shows. */
window._cartSnapshot = function() {
    const cards = Array.from(document.querySelectorAll('#cart-items-list .cart-mini-card'));
    return {
        editingCartIndex: state.editingCartIndex,
        cartLength: (state.orderCart || []).length,
        sidebarCards: cards.length,
        sidebarIndexes: cards.map(function(c) { return c.dataset.cartIndex; }).join(','),
        items: (state.orderCart || []).map(function(it, i) {
            return {
                i: i,
                name: _cartItemLabel(it, i),
                dims: (it && it.spec && it.spec.dimsStr) || '',
                preset: (it && it.rawState && it.rawState.presetId) || '',
                editing: i === state.editingCartIndex
            };
        })
    };
};

function _cartLog(label, extra) {
    if (!window._cartDebugOn) return;
    const snap = window._cartSnapshot();
    console.groupCollapsed('%c[Cart] ' + label, 'color:#6366f1;font-weight:700',
        '| editing=' + snap.editingCartIndex + ' cart=' + snap.cartLength + ' cards=' + snap.sidebarCards);
    if (extra !== undefined) console.log(extra);
    console.table(snap.items);
    console.trace('call stack');
    console.groupEnd();
}

/** Warns loudly (always, even with debug off) when cart state and sidebar/editor disagree. */
function _cartVerify(context) {
    const snap = window._cartSnapshot();
    const problems = [];
    const len = snap.cartLength;
    if (len > 0 && (snap.editingCartIndex < 0 || snap.editingCartIndex >= len)) {
        problems.push('editingCartIndex ' + snap.editingCartIndex + ' out of range (cart has ' + len + ')');
    }
    const expectedIdx = (state.orderCart || []).map(function(_, i) { return String(i); }).sort().join(',');
    const shownIdx = snap.sidebarIndexes.split(',').filter(Boolean).sort().join(',');
    if (document.getElementById('cart-items-list') && shownIdx !== expectedIdx) {
        problems.push('sidebar shows cards [' + shownIdx + '] but cart has [' + expectedIdx + ']');
    }
    if (problems.length) {
        console.error('[Cart] ' + context + ' — state mismatch:\n  - ' + problems.join('\n  - '), snap);
    } else if (window._cartDebugOn) {
        console.log('%c[Cart] ' + context + ' — OK', 'color:#16a34a', snap);
    }
    return problems;
}
window._cartVerify = _cartVerify;

// ── Cart trash: deleted cabinets are kept for 30 days ──────────────────────
const _CART_TRASH_TTL_MS = 30 * 24 * 60 * 60 * 1000;
window._purgeCartTrash = function() {
    const now = Date.now();
    state.cartTrash = (state.cartTrash || []).filter(function(e) {
        return e && e.item && (now - (e.deletedAt || 0)) < _CART_TRASH_TTL_MS;
    });
    return state.cartTrash;
};

window._updateCartTrashBadge = function() {
    const n = window._purgeCartTrash().length;
    const badge = document.getElementById('cart-trash-count');
    if (badge) {
        badge.textContent = n > 0 ? String(n) : '';
        badge.style.display = n > 0 ? '' : 'none';
    }
};

function _addToCartTrash(item) {
    const light = JSON.parse(JSON.stringify(item));
    if (light.spec && typeof window._lightCartSpecForSave === 'function') {
        light.spec = window._lightCartSpecForSave(light.spec);
    }
    const entry = {
        id: 'trash_' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36),
        deletedAt: Date.now(),
        item: light
    };
    window._purgeCartTrash();
    state.cartTrash.push(entry);
    return entry.id;
}

function _removeFromCartTrash(id) {
    state.cartTrash = (state.cartTrash || []).filter(function(e) { return e && e.id !== id; });
}

function _withoutHistory(fn) {
    const prev = state.isRestoring;
    state.isRestoring = true;
    try { fn(); } finally { state.isRestoring = prev; }
}

function _afterCartStructureChange() {
    if (typeof window._roomLinksLoadForHost === 'function') {
        window._roomLinksLoadForHost(state.editingCartIndex);
        if (typeof window._roomPlanFurnitureChanged === 'function') window._roomPlanFurnitureChanged();
    }
    const cc = document.getElementById('cart-count');
    if (cc) cc.innerText = state.orderCart.length;
    if (typeof window._syncSpacePairTabs === 'function') window._syncSpacePairTabs();
    const om = document.getElementById('order-modal');
    if (om && om.style.display === 'flex') openOrderModal(om.dataset.mode || 'customer');
    window._updateCartTrashBadge();
}

function _rebindCartPartColors() {
    if (typeof window._importLocalPartColors !== 'function') return;
    Object.keys(state.partColors || {}).forEach(function(k) {
        if (k.indexOf('cart') === 0) delete state.partColors[k];
    });
    state.orderCart.forEach(function(it, i) {
        if (it && it.rawState && it.rawState.partColors) {
            window._importLocalPartColors('cart' + i, it.rawState.partColors);
        }
    });
}

/** Removes a cart item without confirm/history. Returns info needed to undo. */
function _removeCartItemAt(index) {
    const item = state.orderCart[index];
    const wasEditing = state.editingCartIndex === index;
    _cartLog('remove START index=' + index + ' "' + _cartItemLabel(item, index) + '"', { wasEditing: wasEditing });
    const roomLinks = JSON.parse(JSON.stringify(window._roomLinks || []));
    const pairId = window._spacePairIdOf(item);
    // Unsaved part colors of the open cabinet live under 'cart<editingIndex>' and must follow the index shift
    const liveColors = (!wasEditing && state.editingCartIndex >= 0 && typeof window._exportLocalPartColors === 'function')
        ? window._exportLocalPartColors('cart' + state.editingCartIndex) : null;
    state.orderCart.splice(index, 1);
    if (pairId && typeof window._renumberSpacePairSlots === 'function') {
        window._renumberSpacePairSlots(pairId);
        if (typeof window._invalidateSpacePairPreviewImages === 'function') {
            window._invalidateSpacePairPreviewImages(pairId);
        }
        if (typeof window._clearSpaceCompanion === 'function') window._clearSpaceCompanion();
    }
    if (typeof window._onCartItemDeletedForRoomProps === 'function') {
        window._onCartItemDeletedForRoomProps(index);
    }

    let placeholder = null;
    if (state.orderCart.length === 0) {
        state.editingCartIndex = -1;
        window._bootstrapDefaultCabinet();
        placeholder = state.orderCart[0];
    } else if (wasEditing) {
        _rebindCartPartColors();
        // The editor still holds the deleted cabinet: drop the stale index so editCartItem
        // neither short-circuits (same index) nor lets anything commit it over a neighbour.
        state.editingCartIndex = -1;
        const next = Math.min(index, state.orderCart.length - 1);
        _cartLog('remove → opening neighbour index=' + next);
        window.editCartItem(next, { force: true });
    } else {
        if (state.editingCartIndex > index) state.editingCartIndex--;
        _rebindCartPartColors();
        if (liveColors && state.editingCartIndex >= 0) {
            window._importLocalPartColors('cart' + state.editingCartIndex, liveColors);
        }
        if (typeof window._syncPartColorScope === 'function') window._syncPartColorScope();
        updateLeftSidebar();
    }
    _afterCartStructureChange();
    _cartLog('remove END');
    _cartVerify('after remove');
    return {
        item: item, index: index, wasEditing: wasEditing, roomLinks: roomLinks,
        cartLen: state.orderCart.length, placeholder: placeholder
    };
}

/** Inserts a (restored) cart item; roomLinks restores the exact room layout when the cart is unchanged. */
function _insertCartItemAt(item, index, open, roomLinks, placeholder) {
    if (typeof window._stripSpacePairFromItem === 'function') window._stripSpacePairFromItem(item);
    if (placeholder && state.orderCart.length === 1 && state.orderCart[0] === placeholder) {
        state.orderCart = [];
        state.editingCartIndex = -1;
        open = true;
    }
    index = Math.max(0, Math.min(index, state.orderCart.length));
    state.orderCart.splice(index, 0, item);
    if (typeof state.editingCartIndex === 'number' && state.editingCartIndex >= index) state.editingCartIndex++;
    if (roomLinks) window._roomLinks = JSON.parse(JSON.stringify(roomLinks));
    else if (typeof window._roomLinksOnCartInsert === 'function') window._roomLinksOnCartInsert(index);
    _rebindCartPartColors();
    if (open) window.editCartItem(index, { force: true });
    else updateLeftSidebar();
    _afterCartStructureChange();
    return index;
}

// Cart ops keep live object refs in memory; after a reload only uids and trash ids remain
function _cartOpTrashItem(trashId) {
    const entry = (state.cartTrash || []).find(function(e) { return e && e.id === trashId; });
    return entry ? JSON.parse(JSON.stringify(entry.item)) : null;
}

function _cartOpPlaceholder(op) {
    if (op.placeholder) return op.placeholder;
    if (op.placeholderUid && state.orderCart.length === 1 && window._cartUidAt(0) === op.placeholderUid) {
        return state.orderCart[0];
    }
    return null;
}

window._undoCartOp = function(op) {
    if (op && op.type === 'split') { _undoCartSplit(op); return; }
    if (!op || op.type !== 'delete') return;
    const inTrash = (state.cartTrash || []).some(function(e) { return e && e.id === op.trashId; });
    if (!inTrash || window._cartIndexOfUid(op.uid) >= 0 || (op.item && state.orderCart.indexOf(op.item) >= 0)) return;
    const item = op.item || _cartOpTrashItem(op.trashId);
    if (!item) return;
    _withoutHistory(function() {
        const cartUnchanged = state.orderCart.length === op.cartLen;
        const placeholder = _cartOpPlaceholder(op);
        _removeFromCartTrash(op.trashId);
        _insertCartItemAt(item, op.index, op.wasEditing, cartUnchanged ? op.roomLinks : null, placeholder);
        op.item = item;
        saveHistoryState();
    });
    if (typeof _showToast === 'function') _showToast('הארון שוחזר ✓', 2200);
};

window._redoCartOp = function(op) {
    if (op && op.type === 'split') { _redoCartSplit(op); return; }
    if (!op || op.type !== 'delete') return;
    let idx = op.item ? state.orderCart.indexOf(op.item) : -1;
    if (idx < 0) idx = window._cartIndexOfUid(op.uid);
    if (idx < 0) return;
    _withoutHistory(function() {
        const item = state.orderCart[idx];
        op.trashId = _addToCartTrash(item);
        const info = _removeCartItemAt(idx);
        op.item = item;
        op.uid = item.rawState && item.rawState.cartUid;
        op.index = info.index;
        op.wasEditing = info.wasEditing;
        op.roomLinks = info.roomLinks;
        op.cartLen = info.cartLen;
        op.placeholder = info.placeholder;
        window._normalizeCartUids();
        op.placeholderUid = info.placeholder ? window._cartUidAt(0) : null;
        saveHistoryState();
    });
};

function _escTrash(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

window.openCartTrash = function() {
    const existing = document.getElementById('cart-trash-overlay');
    if (existing) existing.remove();
    const list = window._purgeCartTrash().slice().sort(function(a, b) { return b.deletedAt - a.deletedAt; });

    const overlay = document.createElement('div');
    overlay.id = 'cart-trash-overlay';
    overlay.className = 'cart-trash-overlay';
    overlay.addEventListener('click', function(e) { if (e.target === overlay) window.closeCartTrash(); });

    const rows = list.map(function(e) {
        const spec = (e.item && e.item.spec) || {};
        const name = spec.customName || 'ארון ללא שם';
        const daysLeft = Math.max(1, Math.ceil((e.deletedAt + _CART_TRASH_TTL_MS - Date.now()) / 86400000));
        const deleted = new Date(e.deletedAt).toLocaleDateString('he-IL');
        return '<div class="cart-trash-row">' +
                '<div class="cart-trash-icon"><i class="fa-solid fa-box-archive"></i></div>' +
                '<div class="cart-trash-info">' +
                    '<div class="cart-trash-name">' + _escTrash(name) + '</div>' +
                    (spec.dimsStr ? '<div class="cart-trash-meta">' + _escTrash(spec.dimsStr) + '</div>' : '') +
                    '<div class="cart-trash-meta">נמחק ב-' + deleted + ' · יימחק לצמיתות בעוד ' + daysLeft + ' ימים</div>' +
                '</div>' +
                '<button type="button" class="cart-trash-restore" data-id="' + e.id + '"><i class="fa-solid fa-rotate-left"></i> שחזר</button>' +
                '<button type="button" class="cart-trash-purge" data-id="' + e.id + '" title="מחק לצמיתות"><i class="fa-solid fa-trash"></i></button>' +
            '</div>';
    }).join('');

    overlay.innerHTML =
        '<div class="cart-trash-dialog" role="dialog" aria-label="פח אשפה">' +
            '<div class="cart-trash-header">' +
                '<div><i class="fa-solid fa-trash-can"></i> פח אשפה</div>' +
                '<button type="button" class="cart-trash-close" title="סגור"><i class="fa-solid fa-xmark"></i></button>' +
            '</div>' +
            '<div class="cart-trash-hint">ארונות שנמחקו נשמרים כאן 30 יום ואז נמחקים לצמיתות.</div>' +
            '<div class="cart-trash-list">' +
                (rows || '<div class="cart-trash-empty">הפח ריק</div>') +
            '</div>' +
        '</div>';

    overlay.querySelector('.cart-trash-close').addEventListener('click', window.closeCartTrash);
    overlay.querySelectorAll('.cart-trash-restore').forEach(function(b) {
        b.addEventListener('click', function() { window.restoreCartTrashItem(b.dataset.id); });
    });
    overlay.querySelectorAll('.cart-trash-purge').forEach(function(b) {
        b.addEventListener('click', function() { window.purgeCartTrashItem(b.dataset.id); });
    });
    document.body.appendChild(overlay);
};

window.closeCartTrash = function() {
    const overlay = document.getElementById('cart-trash-overlay');
    if (overlay) overlay.remove();
};

window.restoreCartTrashItem = function(id) {
    const entry = (state.cartTrash || []).find(function(e) { return e && e.id === id; });
    if (!entry) return;
    if (state.editingCartIndex >= 0 && state.orderCart[state.editingCartIndex] &&
        typeof window._commitCurrentCabinetToCart === 'function') {
        window._commitCurrentCabinetToCart({ flash: false });
    }
    _removeFromCartTrash(id);
    const item = JSON.parse(JSON.stringify(entry.item));
    _withoutHistory(function() { _insertCartItemAt(item, state.orderCart.length, true, null, null); });
    saveHistoryState('שחזור ארון מהפח');
    window.closeCartTrash();
    if (typeof _showToast === 'function') _showToast('הארון שוחזר לפרויקט ✓', 2500);
};

window.purgeCartTrashItem = function(id) {
    if (!confirm('למחוק את הארון לצמיתות? לא ניתן יהיה לשחזר אותו.')) return;
    _removeFromCartTrash(id);
    window._updateCartTrashBadge();
    window._isDirty = true;
    if (typeof saveHistoryState === 'function') _withoutHistory(function() { saveHistoryState(); });
    window.openCartTrash();
};

window.deleteCartItem = function(index) {
    // Hold the item itself: the index can go stale while the confirm dialog is open
    const target = state.orderCart[index];
    _cartLog('delete CLICK index=' + index + ' "' + _cartItemLabel(target, index) + '"');
    if (!target) {
        console.error('[Cart] delete clicked for index ' + index + ' but the cart has no item there — sidebar is stale', window._cartSnapshot());
        updateLeftSidebar();
        return;
    }
    const _doDelete = function() {
        const idx = state.orderCart.indexOf(target);
        _cartLog('delete CONFIRM "' + _cartItemLabel(target, idx) + '" clickedIndex=' + index + ' currentIndex=' + idx);
        if (idx < 0) {
            console.error('[Cart] delete confirmed but the cabinet is no longer in the cart', window._cartSnapshot());
            updateLeftSidebar();
            return;
        }
        try {
            window._normalizeCartUids();
            const trashId = _addToCartTrash(target);
            let info;
            _withoutHistory(function() { info = _removeCartItemAt(idx); });
            const before = state.history[state.historyIndex];
            saveHistoryState('מחיקת ארון');
            const top = state.history[state.historyIndex];
            if (top && top !== before) {
                top._cartOp = Object.assign({ type: 'delete', trashId: trashId }, info, {
                    uid: target.rawState && target.rawState.cartUid,
                    placeholderUid: info.placeholder && info.placeholder.rawState ? info.placeholder.rawState.cartUid : null
                });
            }
            if (state.orderCart.indexOf(target) >= 0) {
                console.error('[Cart] cabinet is STILL in the cart after delete', window._cartSnapshot());
            }
            if (typeof _showToast === 'function') _showToast('הארון הועבר לפח (ניתן לבטל עם Ctrl+Z)', 3000);
        } catch (err) {
            console.error('[Cart] delete failed', err, window._cartSnapshot());
            updateLeftSidebar();
            throw err;
        }
    };

    // Centered modal confirm with blurred backdrop (avoids browser confirm() suppression)
    const existing = document.getElementById('_delete-confirm-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = '_delete-confirm-toast';
    // Backdrop: full-screen, blurred background
    toast.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.45);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);';
    toast.innerHTML = `
        <div style="background:#1e2840;color:white;padding:36px 40px;border-radius:20px;font-size:1.15rem;font-weight:600;box-shadow:0 8px 48px rgba(0,0,0,0.55);display:flex;flex-direction:column;align-items:center;gap:24px;min-width:300px;max-width:90vw;text-align:center;">
            <div style="font-size:2.2rem;">🗑️</div>
            <div style="font-size:1.2rem;font-weight:700;line-height:1.5;">למחוק ארון זה מההזמנה?</div>
            <div style="display:flex;gap:14px;width:100%;">
                <button type="button" data-act="confirm" style="flex:1;background:#ef4444;color:white;border:none;border-radius:10px;padding:12px 0;font-size:1.05rem;font-weight:700;cursor:pointer;transition:background 0.2s;">מחק</button>
                <button type="button" data-act="cancel" style="flex:1;background:rgba(255,255,255,0.15);color:white;border:none;border-radius:10px;padding:12px 0;font-size:1.05rem;font-weight:600;cursor:pointer;transition:background 0.2s;">ביטול</button>
            </div>
        </div>
    `;
    const _close = function(reason) {
        clearTimeout(timer);
        if (toast.parentNode) toast.remove();
        _cartLog('delete dialog closed: ' + reason);
    };
    toast.querySelector('[data-act="confirm"]').addEventListener('click', function() { _close('confirm'); _doDelete(); });
    toast.querySelector('[data-act="cancel"]').addEventListener('click', function() { _close('cancel'); });
    document.body.appendChild(toast);
    // Auto-close only this dialog — never a newer one opened for another cabinet
    const timer = setTimeout(function() { _close('timeout (10s)'); }, 10000);
}

window.editCartItem = function(index, opts) {
    opts = opts || {};
    if (!state.orderCart || !state.orderCart[index]) {
        console.error('[Cart] editCartItem(' + index + ') ignored — no cabinet at that index (stale sidebar?)', window._cartSnapshot());
        updateLeftSidebar();
        return;
    }
    if (index === state.editingCartIndex) {
        _cartLog('editCartItem(' + index + ') ignored — already the open cabinet', { force: !!opts.force });
        return;
    }
    if (!opts.force && window._isCurrentCabinetDirty && window._isCurrentCabinetDirty()) {
        _cartLog('editCartItem(' + index + ') → unsaved changes, showing save prompt');
        window._promptSaveCabinetBeforeSwitch(index);
        return;
    }
    _cartLog('editCartItem(' + index + ') → loading "' + _cartItemLabel(state.orderCart[index], index) + '"', { from: state.editingCartIndex, force: !!opts.force });
    window._editCartItemNow(index);
    _cartVerify('after editCartItem(' + index + ')');
};

window._editCartItemNow = function(index) {
    const rawState = state.orderCart[index].rawState;
    const rs = JSON.parse(JSON.stringify(rawState));

    // Restore wing system if saved (new format), otherwise fall back to flat fields
    if (rs.wings) {
        if (typeof window._restoreWingsFromSaved === 'function') {
            window._restoreWingsFromSaved(rs.wings);
        } else {
            state.wings.center = rs.wings.center || state.wings.center;
            state.wings.left   = rs.wings.left   || null;
            state.wings.right  = rs.wings.right  || null;
        }
        state.activeWing   = rs.activeWing   || 'center';
        state.presetId     = rs.presetId     || 'linear';
    } else {
        // Legacy rawState (no wings) — treat as linear, restore flat fields to center wing
        state.presetId   = 'linear';
        state.activeWing = 'center';
        state.wings.left  = null;
        state.wings.right = null;
        Object.keys(state.wings || {}).forEach(function(k) {
            if (k !== 'center' && k !== 'left' && k !== 'right') delete state.wings[k];
        });
        // Apply flat fields to center wing via proxy setters
        const flatFields = ['cabinetModel','placement','width','globalHeight','depth','thickness',
            'plinthHeight','hasDoors','handleType','handleStyle','cabinetName','cabinetModelLabel','cabinetNotes','manualPrice','boardMaterial',
            'materialBody','materialInternal','materialExternal','materialDesk','materialOpenCell',
            'materialBack','columns','desk'];
        flatFields.forEach(function(f) { if (rs[f] !== undefined) state[f] = rs[f]; });
    }

    // Always exit wing edit mode when loading a cabinet (prevents stale wingEditMode from previous corner cabinet)
    state.wingEditMode = false;
    state.wingEditSnapshot = null;

    // Reset viewMode and orbit state based on preset type
    // Linear/sliding cabinets use front view; corner/walkin use 3d view
    const _loadedPreset = state.presetId || 'linear';
    const _isLinearPreset = (_loadedPreset === 'linear' || _loadedPreset === 'sliding');
    if (_isLinearPreset) {
        state.viewMode = 'front';
        window._orbitFree = false;
    } else {
        state.viewMode = '3d';
        window._orbitFree = false; // reset orbit so camera snaps to preset position
    }
    // Sync view button highlights
    document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
    const _activeViewBtn = document.getElementById('btn-front-view');
    if (_activeViewBtn) _activeViewBtn.classList.add('active');
    const _resetViewBtn = document.getElementById('btn-reset-view');
    if (_resetViewBtn) _resetViewBtn.style.display = 'none';

    // Restore room wall position
    window._roomWall = rawState.roomWall || 'center';
    state.roomWall   = window._roomWall;

    // Restore closure panel settings
    window._closureEnabled    = true;
    window._closureWidth      = rawState.closureWidth      || 1.8;
    window._closureWidthRight = rawState.closureWidthRight || 1.8;
    window._closureCeilWidth  = rawState.closureCeilWidth  || 1.8;
    window._closureDepthWidth = rawState.closureDepthWidth || 1.8;
    window._closureFrontLine  = rawState.closureFrontLine  || 'cabinet';
    // Sync closure UI
    if (typeof window._updateRoomWallUI === 'function') window._updateRoomWallUI();

    state.blueprintCutouts = rawState.blueprintCutouts ? JSON.parse(JSON.stringify(rawState.blueprintCutouts)) : [];
    state.blueprintCellDimOffsets = rawState.blueprintCellDimOffsets ? JSON.parse(JSON.stringify(rawState.blueprintCellDimOffsets)) : {};
    state.blueprintDimOffsets = rawState.blueprintDimOffsets ? JSON.parse(JSON.stringify(rawState.blueprintDimOffsets)) : {};
    state.blueprintInternalDimsDefault = rawState.blueprintInternalDimsDefault !== false;
    state.blueprintCellDimShown = rawState.blueprintCellDimShown ? JSON.parse(JSON.stringify(rawState.blueprintCellDimShown)) : {};
    state.blueprintColWidthDimsDefault = rawState.blueprintColWidthDimsDefault !== false;
    state.blueprintColWidthDimShown = rawState.blueprintColWidthDimShown ? JSON.parse(JSON.stringify(rawState.blueprintColWidthDimShown)) : {};
    state.blueprintHeightDimsDefault = rawState.blueprintHeightDimsDefault !== false;

    state.editingCartIndex = index;
    if (typeof window._roomLinksLoadForHost === 'function') window._roomLinksLoadForHost(index);
    const _loadedItem = state.orderCart[index];
    if (_loadedItem && rawState && rawState.spacePairId && typeof window._attachSpacePairToItem === 'function') {
        window._attachSpacePairToItem(
            _loadedItem,
            rawState.spacePairId,
            (typeof window._spacePairSlotOf === 'function')
                ? window._spacePairSlotOf({ spaceSlot: rawState.spaceSlot })
                : (Math.round(Number(rawState.spaceSlot) || 0)),
            rawState.spaceOffset || { x: 0, y: 0 }
        );
        if (typeof window._syncSpaceLiftBottomPanel === 'function') {
            const off = window._getSpaceOffset(_loadedItem);
            if ((off.y || 0) > 0) window._syncSpaceLiftBottomPanel(_loadedItem, true);
        }
    }
    if (typeof window._syncPartColorScope === 'function') window._syncPartColorScope();
    if (typeof window._importLocalPartColors === 'function') {
        window._importLocalPartColors('cart' + index, rawState.partColors);
    }

    // Explicitly restore manualInstallPrice (not in old rawState saves → default null)

    document.getElementById('order-modal').style.display = 'none';
    document.getElementById('btn-add-to-cart').innerHTML = `<i class="fa-solid fa-save"></i> שמור שינויים לארון`;

    // Restore preset UI (button highlights, wing tabs, section visibility)
    if (typeof window._restorePresetUI === 'function') window._restorePresetUI();
    if (typeof window._syncSpacePairTabs === 'function') window._syncSpacePairTabs();
    buildCabinet(); updateCameraView(); calculatePrice(); updateLeftSidebar({ scrollToActive: true }); saveHistoryState();
    if (typeof window._markCurrentCabinetClean === 'function') window._markCurrentCabinetClean();
}

window.startNewCabinet = function() {
    // Auto-save current cabinet, then create a fully reset new one OUTSIDE any shared space
    if (state.orderCart && state.orderCart.length > 0) {
        window._commitCurrentCabinetToCart({ flash: false });
    }
    // Detach from space-pair context before snapshot so the new cabinet is never joined
    if (typeof window._clearSpaceCompanion === 'function') window._clearSpaceCompanion();
    state.editingCartIndex = -1;
    if (typeof window._resetEditorToDefaultLinearCabinet === 'function') {
        window._resetEditorToDefaultLinearCabinet();
    } else if (typeof applyPreset === 'function') {
        applyPreset('linear');
    }
    state.cabinetName = '';
    if (state.wings && state.wings.center) state.wings.center.cabinetName = '';
    const item = window._snapshotCurrentCabinetToCartItem();
    if (typeof window._stripSpacePairFromItem === 'function') {
        window._stripSpacePairFromItem(item);
    }
    if (item.spec) {
        item.spec.customName = '';
        delete item.spec.imgSpaceDoors;
        delete item.spec.imgSpaceOpen;
        delete item.spec.imgSpaceDoorsAuto;
        delete item.spec.imgSpaceOpenAuto;
    }
    if (item.rawState) item.rawState.cabinetName = '';
    state.orderCart.push(item);
    const newIdx = state.orderCart.length - 1;
    // Fresh cabinet — no inherited part colors
    item.rawState.partColors = {};
    state.editingCartIndex = newIdx;
    if (typeof window._roomLinksLoadForHost === 'function') window._roomLinksLoadForHost(newIdx);
    if (typeof window._syncPartColorScope === 'function') window._syncPartColorScope();
    _setSaveCabinetButtonLabel();
    const cc = document.getElementById('cart-count');
    if (cc) cc.innerText = state.orderCart.length;
    if (typeof window._restorePresetUI === 'function') window._restorePresetUI();
    updateLeftSidebar({ scrollToActive: true });
    if (typeof window._syncSpacePairTabs === 'function') window._syncSpacePairTabs();
    if (typeof buildCabinet === 'function') buildCabinet();
    if (typeof updateCameraView === 'function') updateCameraView();
    if (typeof calculatePrice === 'function') calculatePrice();
    if (typeof saveHistoryState === 'function') saveHistoryState();
    if (typeof window._markCurrentCabinetClean === 'function') window._markCurrentCabinetClean();
}

window.duplicateCartItem = function(index) {
    if (!state.orderCart[index]) return;
    // Save current edits first if editing another (or same) cabinet
    if (state.editingCartIndex >= 0 && state.orderCart[state.editingCartIndex]) {
        window._commitCurrentCabinetToCart({ flash: false });
    }
    const src = state.orderCart[index];
    const clone = {
        spec: JSON.parse(JSON.stringify(src.spec)),
        rawState: JSON.parse(JSON.stringify(src.rawState))
        // intentionally omit printSpecEdits
    };
    // Clear heavy preview images so they refresh on next save
    if (clone.spec) {
        clone.spec.imgDoors = null;
        clone.spec.imgOpen = null;
        clone.spec.imgBlueprint = null;
        clone.spec.imgSpaceDoors = null;
        clone.spec.imgSpaceOpen = null;
        clone.spec.multiViewSVG = null;
        clone.spec.multiViewPages = [];
        clone.spec.multiViewLabels = [];
        clone.spec.wingPreviews = [];
        clone.spec.cornerAngle = null;
        delete clone.spec.captureVer;
    }
    if (clone.spec && clone.spec.customName) {
        clone.spec.customName = 'העתק של ' + clone.spec.customName;
        if (clone.rawState) clone.rawState.cabinetName = clone.spec.customName;
    }
    if (typeof window._stripSpacePairFromItem === 'function') window._stripSpacePairFromItem(clone);
    if (typeof window._setCartItemHold === 'function') window._setCartItemHold(clone, false);
    state.orderCart.splice(index + 1, 0, clone);
    const newIdx = index + 1;
    if (typeof state.editingCartIndex === 'number' && state.editingCartIndex >= newIdx) state.editingCartIndex++;
    if (typeof window._roomLinksOnCartInsert === 'function') window._roomLinksOnCartInsert(newIdx);
    // Re-bind all cart scopes after index shift (clone inserted in the middle)
    if (typeof window._importLocalPartColors === 'function') {
        Object.keys(state.partColors || {}).forEach(function(k) {
            if (k.indexOf('cart') === 0) delete state.partColors[k];
        });
        state.orderCart.forEach(function(it, i) {
            if (it && it.rawState && it.rawState.partColors) {
                window._importLocalPartColors('cart' + i, it.rawState.partColors);
            }
        });
    }
    window.editCartItem(newIdx, { force: true });
    const cc = document.getElementById('cart-count');
    if (cc) cc.innerText = state.orderCart.length;
    if (typeof saveHistoryState === 'function') saveHistoryState();
};

// ── Split a corner / walk-in cabinet into standalone linear cabinets ───────
const _SPLIT_WING_LABELS = { center: 'מרכז', right: 'צד ימין', left: 'צד שמאל' };

/** Wing sides of a multi-wing cart item, in the order the pieces are created; null if not splittable. */
window._cartItemSplitSides = function(item) {
    const wings = item && item.rawState && item.rawState.wings;
    if (!wings || !wings.center || !(wings.left || wings.right)) return null;
    return ['center', 'right', 'left'].filter(function(s) { return !!wings[s]; });
};

/** Keeps only keys belonging to `side` (and its upper unit) and re-keys them to the center wing. */
function _remapWingKeyedMap(map, side, sep) {
    const out = {};
    if (!map || typeof map !== 'object') return out;
    const from = [side + sep, 'upperUnit_' + side + sep];
    const to = ['center' + sep, 'upperUnit_center' + sep];
    Object.keys(map).forEach(function(k) {
        for (let i = 0; i < from.length; i++) {
            if (k.indexOf(from[i]) === 0) {
                out[to[i] + k.slice(from[i].length)] = map[k];
                return;
            }
        }
    });
    return out;
}

function _buildSplitPieceRawState(rs, side, name, uid) {
    const piece = JSON.parse(JSON.stringify(rs));
    const wing = JSON.parse(JSON.stringify(rs.wings[side]));
    const centerLabel = (rs.wings.center && rs.wings.center.cabinetModelLabel) || '';
    wing.wingPosition = 'side';
    wing.manualPrice = null;
    wing.manualInstallPrice = null;
    wing.cabinetName = name;
    if (!wing.cabinetModelLabel && centerLabel) wing.cabinetModelLabel = centerLabel;
    if (wing.slidingDoor) wing.slidingDoor.enabled = false;

    const wings = { center: wing, left: null, right: null };
    const uu = rs.wings['upperUnit_' + side];
    if (uu) {
        const u = JSON.parse(JSON.stringify(uu));
        u._parentWingId = 'center';
        wings.upperUnit_center = u;
    }
    piece.wings = wings;
    piece.presetId = 'linear';
    piece.activeWing = 'center';
    piece.roomWall = 'center';
    _wingFields.forEach(function(f) {
        if (wing[f] !== undefined) piece[f] = JSON.parse(JSON.stringify(wing[f]));
    });
    piece.cabinetName = name;
    piece.manualPrice = null;
    piece.manualInstallPrice = null;
    piece.partColors = _remapWingKeyedMap(rs.partColors, side, '_');
    piece.blueprintCellDimOffsets = _remapWingKeyedMap(rs.blueprintCellDimOffsets, side, '|');
    piece.blueprintDimOffsets = _remapWingKeyedMap(rs.blueprintDimOffsets, side, '|');
    piece.blueprintCellDimShown = _remapWingKeyedMap(rs.blueprintCellDimShown, side, '|');
    piece.blueprintColWidthDimShown = _remapWingKeyedMap(rs.blueprintColWidthDimShown, side, '|');
    piece.blueprintCutouts = (rs.blueprintCutouts || [])
        .filter(function(c) { return c && (c.viewKey || 'center') === side; })
        .map(function(c) { return Object.assign({}, c, { viewKey: 'center' }); });
    delete piece.spacePairId;
    delete piece.spaceSlot;
    delete piece.spaceOffset;
    piece.cartUid = uid || window._newCartUid();
    return piece;
}

/** Replaces cart item `src` (at `index`) with one linear cabinet per wing. Caller wraps in _withoutHistory.
 *  `pieceUids` (on redo) recreates the pieces under the ids later history steps refer to. */
function _performCartSplit(src, index, pieceUids) {
    window._normalizeCartUids();
    const rs = src.rawState;
    const sides = window._cartItemSplitSides(src);
    const baseName = String((src.spec && src.spec.customName) || rs.wings.center.cabinetName || '').trim() || 'ארון פינתי';
    const held = window._cartItemOnHold(src);
    const pieces = sides.map(function(side, i) {
        const name = baseName + ' - ' + _SPLIT_WING_LABELS[side];
        const spec = JSON.parse(JSON.stringify(src.spec || {}));
        spec.customName = name;
        spec.imgDoors = null;
        spec.imgOpen = null;
        spec.wingPreviews = [];
        spec.cornerAngle = null;
        spec.multiViewSVG = null;
        spec.multiViewPages = [];
        spec.multiViewLabels = [];
        const piece = { spec: spec, rawState: _buildSplitPieceRawState(rs, side, name, pieceUids && pieceUids[i]) };
        window._setCartItemHold(piece, held);
        return piece;
    });

    const trashId = _addToCartTrash(src);
    if (state.editingCartIndex === index) state.editingCartIndex = -1;
    const info = _removeCartItemAt(index);
    pieces.forEach(function(p, i) {
        _insertCartItemAt(p, index + i, false, null, i === 0 ? info.placeholder : null);
    });
    // Load + save each piece so price, dimensions and preview images are recomputed
    const finals = [];
    for (let i = 0; i < pieces.length; i++) {
        window.editCartItem(index + i, { force: true });
        window._commitCurrentCabinetToCart({ flash: false });
        finals.push(state.orderCart[index + i]);
    }
    window.editCartItem(index, { force: true });
    return {
        trashId: trashId,
        originalUid: rs.cartUid,
        pieceUids: finals.map(function(p) { return p.rawState.cartUid; })
    };
}

window.splitCartItem = function(index) {
    const target = state.orderCart[index];
    const sides = window._cartItemSplitSides(target);
    if (!sides) return;
    const wings = target.rawState.wings;
    const hasFullCorner = sides.some(function(s) { return wings[s] && wings[s].wingPosition === 'full_corner'; });
    const hasManualPrice = sides.some(function(s) { return wings[s] && (wings[s].manualPrice != null || wings[s].manualInstallPrice != null); });

    const _doSplit = function() {
        const idx = state.orderCart.indexOf(target);
        if (idx < 0) { updateLeftSidebar(); return; }
        if (state.editingCartIndex >= 0 && state.orderCart[state.editingCartIndex]) {
            window._commitCurrentCabinetToCart({ flash: false });
        }
        // Committing replaces the open item object in place — re-read it
        const src = state.orderCart[idx];
        if (!window._cartItemSplitSides(src)) { updateLeftSidebar(); return; }
        let res;
        _withoutHistory(function() { res = _performCartSplit(src, idx); });
        const before = state.history[state.historyIndex];
        saveHistoryState('פיצול ארון פינתי');
        const top = state.history[state.historyIndex];
        if (top && top !== before) {
            top._cartOp = { type: 'split', original: src, index: idx, trashId: res.trashId, originalUid: res.originalUid, pieceUids: res.pieceUids };
        }
        if (typeof _showToast === 'function') _showToast('הארון פוצל ל-' + res.pieceUids.length + ' ארונות (ניתן לבטל עם Ctrl+Z)', 3200);
    };

    const existing = document.getElementById('_split-confirm-toast');
    if (existing) existing.remove();
    const notes = ['כל צד יהפוך לארון ישר עצמאי בפרויקט, והארון המקורי יישמר בפח.'];
    if (hasFullCorner) notes.push('יחידת הפינה המלאה לא תיכלל בארונות המפוצלים.');
    if (hasManualPrice) notes.push('המחיר הידני יבוטל והמחיר יחושב מחדש לכל ארון.');
    const toast = document.createElement('div');
    toast.id = '_split-confirm-toast';
    toast.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.45);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);';
    toast.innerHTML = `
        <div dir="rtl" style="background:#1e2840;color:white;padding:32px 36px;border-radius:20px;box-shadow:0 8px 48px rgba(0,0,0,0.55);display:flex;flex-direction:column;align-items:center;gap:18px;min-width:300px;max-width:min(440px,90vw);text-align:center;">
            <div style="font-size:2rem;color:#93c5fd;"><i class="fa-solid fa-object-ungroup"></i></div>
            <div style="font-size:1.2rem;font-weight:700;line-height:1.5;">לפצל את הארון ל-${sides.length} ארונות נפרדים?</div>
            <div style="font-size:0.92rem;font-weight:400;line-height:1.6;opacity:0.85;">${notes.join('<br>')}</div>
            <div style="display:flex;gap:14px;width:100%;">
                <button type="button" data-act="confirm" style="flex:1;background:#2563eb;color:white;border:none;border-radius:10px;padding:12px 0;font-size:1.05rem;font-weight:700;cursor:pointer;">פצל</button>
                <button type="button" data-act="cancel" style="flex:1;background:rgba(255,255,255,0.15);color:white;border:none;border-radius:10px;padding:12px 0;font-size:1.05rem;font-weight:600;cursor:pointer;">ביטול</button>
            </div>
        </div>
    `;
    const _close = function() { if (toast.parentNode) toast.remove(); };
    toast.addEventListener('click', function(e) { if (e.target === toast) _close(); });
    toast.querySelector('[data-act="confirm"]').addEventListener('click', function() { _close(); _doSplit(); });
    toast.querySelector('[data-act="cancel"]').addEventListener('click', _close);
    document.body.appendChild(toast);
};

function _undoCartSplit(op) {
    if (window._cartIndexOfUid(op.originalUid) >= 0) return;
    const original = op.original || _cartOpTrashItem(op.trashId);
    const idxs = (op.pieceUids || []).map(window._cartIndexOfUid);
    if (!original || !idxs.length || idxs.some(function(i) { return i < 0; })) {
        if (typeof _showToast === 'function') _showToast('לא ניתן לבטל את הפיצול — חלק מהארונות המפוצלים נמחקו', 3200);
        return;
    }
    op.original = original;
    _withoutHistory(function() {
        if (idxs.indexOf(state.editingCartIndex) >= 0) state.editingCartIndex = -1;
        let placeholder = null;
        idxs.sort(function(a, b) { return b - a; }).forEach(function(i) {
            const info = _removeCartItemAt(i);
            if (info.placeholder) placeholder = info.placeholder;
        });
        _removeFromCartTrash(op.trashId);
        _insertCartItemAt(original, op.index, true, null, placeholder);
    });
    if (typeof _showToast === 'function') _showToast('הפיצול בוטל ✓', 2200);
}

function _redoCartSplit(op) {
    const idx = window._cartIndexOfUid(op.originalUid);
    if (idx < 0) return;
    _withoutHistory(function() {
        // Redone steps update only the editor — sync it into the cart before splitting
        if (state.editingCartIndex === idx && window._isCurrentCabinetDirty()) {
            window._commitCurrentCabinetToCart({ flash: false });
        }
        const src = state.orderCart[idx];
        if (!window._cartItemSplitSides(src)) return;
        const res = _performCartSplit(src, idx, op.pieceUids);
        op.original = src;
        op.index = idx;
        op.trashId = res.trashId;
        op.pieceUids = res.pieceUids;
    });
}

window.newProject = function() {
    if (!confirm('האם אתה בטוח שברצונך להתחיל פרויקט חדש?\nכל הארונות בפרויקט הנוכחי יימחקו לצמיתות.')) return;
    state.orderCart = [];
    state.cartTrash = [];
    state.editingCartIndex = -1;
    state.cabinetName = '';
    state.manualPrice = null;
    state.manualInstallPrice = null;
    window._currentProjectId   = null;
    window._currentProjectName = null;
    if (typeof window._syncBrowserTabTitle === 'function') window._syncBrowserTabTitle();
    const cabNameInp = document.getElementById('inp-cabinet-name');
    if (cabNameInp) cabNameInp.value = '';
    const modelLabelInp = document.getElementById('inp-cabinet-model-label');
    if (modelLabelInp) modelLabelInp.value = '';
    const mModelLabelInp = document.getElementById('mobile-inp-cabinet-model-label');
    if (mModelLabelInp) mModelLabelInp.value = '';
    const orderModal = document.getElementById('order-modal');
    if (orderModal) orderModal.style.display = 'none';
    window._bootstrapDefaultCabinet();
}

window._syncBrowserTabTitle = function(name) {
    if (window._VIEWER_MODE) return;
    var n = (arguments.length ? name : window._currentProjectName);
    n = String(n == null ? '' : n).replace(/\s+/g, ' ').trim() || 'פרויקט חדש';
    if (document.title !== n) document.title = n;
};

window.updateLeftSidebar = function(opts) {
    opts = opts || {};
    const listContainer = document.getElementById('cart-items-list');
    const totalEl = document.getElementById('left-sidebar-total');
    const cabTotalEl = document.getElementById('sidebar-cab-total');
    const instTotalEl = document.getElementById('sidebar-inst-total');

    const nameEl = document.getElementById('sidebar-project-name');
    const countEl = document.getElementById('sidebar-cabinets-count');
    if (nameEl && document.activeElement !== nameEl) {
        const projName = (window._currentProjectName || '').trim() || 'פרויקט חדש';
        if (nameEl.textContent !== projName) nameEl.textContent = projName;
        nameEl.title = projName + ' — לחץ לעריכה';
    }
    if (typeof window._syncBrowserTabTitle === 'function') window._syncBrowserTabTitle();
    if (countEl) {
        const n = (state.orderCart && state.orderCart.length) || 0;
        countEl.textContent = n > 0 ? '(' + n + ')' : '';
    }
    window._updateCartTrashBadge();

    if (!listContainer || !totalEl) return;
    listContainer.innerHTML = '';
    let totalCabinetsPrice = 0; let totalInstallPrice = 0;

    if (state.orderCart.length === 0) {
        // Should not happen — always keep at least one selected cabinet
        if (typeof window._ensureCabinetSelected === 'function') window._ensureCabinetSelected();
        if (state.orderCart.length === 0) {
            totalEl.innerText = '₪0';
            if (cabTotalEl) cabTotalEl.innerText = '₪0';
            if (instTotalEl) instTotalEl.innerText = '₪0';
            return;
        }
    }

    function _cartItemTitle(itemObj, index) {
        const item = itemObj.spec || {};
        if (item.customName) return item.customName;
        return _cartIsWritingDesk(itemObj) ? (`שולחן מס' ${index + 1}`) : (`ארון מס' ${index + 1}`);
    }

    function _buildCartMiniCard(itemObj, index, nested) {
        const item = itemObj.spec;
        const numericPrice = parseInt(String(item.price || '').replace('₪', '').replace(/,/g, ''), 10);
        const itemInstall = item.installPrice || 0;
        const held = typeof window._cartItemOnHold === 'function' && window._cartItemOnHold(itemObj);
        if (!held) {
            if (!isNaN(numericPrice)) totalCabinetsPrice += numericPrice;
            totalInstallPrice += itemInstall;
        }

        const isEditing = state.editingCartIndex === index;
        const activeClass = isEditing ? 'active-editing' : '';
        const heldClass = held ? ' on-hold' : '';
        const nestedClass = nested ? ' cart-mini-card-nested' : '';
        const activeLabel = isEditing ? '<div style="position:absolute; top:-12px; right:15px; background:var(--accent); color:white; font-size:11px; padding:3px 10px; border-radius:12px; font-weight:bold; box-shadow:0 2px 5px rgba(0,0,0,0.15); border: 2px solid white;"><i class="fa-solid fa-pen"></i> בעריכה כעת</div>' : '';
        const holdBadge = held ? '<span class="cart-hold-badge"><i class="fa-solid fa-pause"></i> מושהה</span>' : '';
        const titleText = _cartItemTitle(itemObj, index);
        const partSlot = (typeof window._spacePairIdOf === 'function' && window._spacePairIdOf(itemObj) != null)
            ? window._spacePairSlotOf(itemObj) : null;
        const partChip = (nested && partSlot != null)
            ? `<span class="cart-space-part-chip">${window._spacePartSuffix(partSlot)}</span>`
            : '';

        const _itemPreset = (itemObj.rawState && itemObj.rawState.presetId) || 'linear';
        const _isLinearOrSliding = (_itemPreset === 'linear' || _itemPreset === 'sliding');
        const _curRoomWall = (itemObj.rawState && itemObj.rawState.roomWall) || 'center';
        const _wallSelectorHTML = (!nested && _isLinearOrSliding) ? `
            <div style="display:flex;align-items:center;gap:4px;margin-top:6px;padding-top:6px;border-top:1px solid var(--border);">
                <span style="font-size:0.78rem;color:var(--text-light);flex-shrink:0;">מיקום בחדר:</span>
                <div style="display:flex;gap:3px;flex:1;">
                    <button onclick="event.stopPropagation(); window.setCartItemRoomWall(${index},'left');"
                        style="flex:1;padding:3px 4px;font-size:0.75rem;border-radius:5px;border:1.5px solid ${_curRoomWall==='left'?'var(--accent)':'var(--border)'};background:${_curRoomWall==='left'?'rgba(var(--accent-rgb,99,102,241),0.12)':'transparent'};color:${_curRoomWall==='left'?'var(--accent)':'var(--text-light)'};cursor:pointer;font-weight:${_curRoomWall==='left'?'700':'400'};" title="צמוד לקיר שמאל">
                        ← שמאל
                    </button>
                    <button onclick="event.stopPropagation(); window.setCartItemRoomWall(${index},'center');"
                        style="flex:1;padding:3px 4px;font-size:0.75rem;border-radius:5px;border:1.5px solid ${_curRoomWall==='center'?'var(--accent)':'var(--border)'};background:${_curRoomWall==='center'?'rgba(var(--accent-rgb,99,102,241),0.12)':'transparent'};color:${_curRoomWall==='center'?'var(--accent)':'var(--text-light)'};cursor:pointer;font-weight:${_curRoomWall==='center'?'700':'400'};" title="מרכז">
                        מרכז
                    </button>
                    <button onclick="event.stopPropagation(); window.setCartItemRoomWall(${index},'right');"
                        style="flex:1;padding:3px 4px;font-size:0.75rem;border-radius:5px;border:1.5px solid ${_curRoomWall==='right'?'var(--accent)':'var(--border)'};background:${_curRoomWall==='right'?'rgba(var(--accent-rgb,99,102,241),0.12)':'transparent'};color:${_curRoomWall==='right'?'var(--accent)':'var(--text-light)'};cursor:pointer;font-weight:${_curRoomWall==='right'?'700':'400'};" title="צמוד לקיר ימין">
                        ימין →
                    </button>
                </div>
            </div>` : '';

        const card = document.createElement('div');
        card.className = `cart-mini-card ${activeClass}${heldClass}${nestedClass}`;
        card.dataset.cartIndex = String(index);
        card.onclick = () => { if (state.editingCartIndex !== index) editCartItem(index); };

        card.innerHTML = `
            ${activeLabel}
            <button type="button" class="cart-mini-btn btn-hold-mini" title="${held ? 'הפעל ארון' : 'השהה ארון'}" onclick="event.stopPropagation(); toggleCartItemHold(${index});"><i class="fa-solid fa-${held ? 'play' : 'pause'}"></i> ${held ? 'הפעל' : 'השהה'}</button>
            <div class="cart-mini-card-title">${holdBadge}${partChip}${titleText}</div>
            <div class="cart-mini-card-desc" dir="rtl">${item.dimsStr || ''}</div>
            ${window._showPricing !== false ? `<div class="cart-mini-card-price"><span dir="ltr">${item.price}</span> <span style="font-size:0.85rem; font-weight:normal; color:var(--text-light);">+ <span dir="ltr">₪${itemInstall.toLocaleString()}</span> התקנה</span></div>` : ''}
            ${_wallSelectorHTML}
            <div class="cart-mini-actions">
                <button class="cart-mini-btn btn-edit-mini" onclick="event.stopPropagation(); editCartItem(${index});"><i class="fa-solid fa-pen"></i> ערוך</button>
                ${nested ? `<button class="cart-mini-btn btn-leave-space-mini" onclick="event.stopPropagation(); removeCabinetFromSpace(${index});" title="הוצא את הארון מהמרחב המשותף — הארון יישאר בפרויקט"><i class="fa-solid fa-link-slash"></i> הוצא מהקבוצה</button>` : ''}
                <button class="cart-mini-btn" onclick="event.stopPropagation(); duplicateCartItem(${index});"><i class="fa-solid fa-copy"></i> שכפל</button>
                ${!nested && window._cartItemSplitSides(itemObj) ? `<button class="cart-mini-btn btn-split-mini" onclick="event.stopPropagation(); splitCartItem(${index});" title="פצל את הארון הפינתי לארונות ישרים נפרדים בפרויקט"><i class="fa-solid fa-object-ungroup"></i> פצל</button>` : ''}
                <button class="cart-mini-btn btn-del-mini" onclick="event.stopPropagation(); deleteCartItem(${index});"><i class="fa-solid fa-trash"></i> מחק</button>
                <div style="position:relative;display:inline-flex;">
                    <button class="cart-mini-btn" id="notes-btn-cart-${index}" onclick="event.stopPropagation(); window._openDesignerNotesForCabinet(${index});" style="color:#2563eb;border-color:rgba(37,99,235,0.35);background:rgba(37,99,235,0.07);">
                        <i class="fa-solid fa-note-sticky"></i> תיקונים
                    </button>
                    <span id="notes-badge-cart-${index}" style="display:none;position:absolute;top:-5px;left:-5px;background:#ef4444;color:white;border-radius:50%;width:15px;height:15px;font-size:9px;font-weight:700;align-items:center;justify-content:center;line-height:1;z-index:10;pointer-events:none;"></span>
                </div>
            </div>
        `;
        return card;
    }

    // Group shared-space cabinets under one parent card
    const seenPairs = {};
    const renderEntries = [];
    state.orderCart.forEach(function(itemObj, index) {
        const pairId = (typeof window._spacePairIdOf === 'function') ? window._spacePairIdOf(itemObj) : null;
        if (pairId) {
            if (seenPairs[pairId]) return;
            seenPairs[pairId] = true;
            const members = [];
            state.orderCart.forEach(function(it, i) {
                if (window._spacePairIdOf(it) === pairId) {
                    members.push({ it: it, index: i, slot: window._spacePairSlotOf(it) });
                }
            });
            members.sort(function(a, b) { return a.slot - b.slot; });
            if (members.length >= 2) {
                renderEntries.push({ type: 'group', pairId: pairId, members: members });
                return;
            }
        }
        renderEntries.push({ type: 'single', index: index, it: itemObj });
    });

    renderEntries.forEach(function(entry) {
        if (entry.type === 'single') {
            listContainer.appendChild(_buildCartMiniCard(entry.it, entry.index, false));
            return;
        }
        const group = document.createElement('div');
        group.className = 'cart-space-group';
        const anyEditing = entry.members.some(function(m) { return state.editingCartIndex === m.index; });
        if (anyEditing) group.classList.add('has-editing');
        const baseName = window._spacePairBaseNameFromItem(entry.members[0].it) ||
            _cartItemTitle(entry.members[0].it, entry.members[0].index);
        const groupTitle = window._stripSpacePartSuffix(baseName) || baseName;
        let groupPrice = 0;
        let groupInstall = 0;
        entry.members.forEach(function(m) {
            if (typeof window._cartItemOnHold === 'function' && window._cartItemOnHold(m.it)) return;
            const p = parseInt(String((m.it.spec && m.it.spec.price) || '').replace('₪', '').replace(/,/g, ''), 10);
            if (!isNaN(p)) groupPrice += p;
            groupInstall += (m.it.spec && m.it.spec.installPrice) || 0;
        });
        group.innerHTML = `
            <div class="cart-space-group-header">
                <div class="cart-space-group-title"><i class="fa-solid fa-layer-group"></i> ${groupTitle}</div>
                <div class="cart-space-group-meta">${entry.members.length} חלקים במרחב</div>
                ${window._showPricing !== false ? `<div class="cart-space-group-price"><span dir="ltr">₪${groupPrice.toLocaleString()}</span> <span class="cart-space-group-install">+ <span dir="ltr">₪${groupInstall.toLocaleString()}</span> התקנה</span></div>` : ''}
            </div>
            <div class="cart-space-group-body"></div>
        `;
        const body = group.querySelector('.cart-space-group-body');
        entry.members.forEach(function(m) {
            body.appendChild(_buildCartMiniCard(m.it, m.index, true));
        });
        listContainer.appendChild(group);
    });

    const grandTotal = totalCabinetsPrice + totalInstallPrice;
    if (cabTotalEl) cabTotalEl.innerHTML = `<span dir="ltr">₪${totalCabinetsPrice.toLocaleString()}</span>`;
    if (instTotalEl) instTotalEl.innerHTML = `<span dir="ltr">₪${totalInstallPrice.toLocaleString()}</span>`;
    totalEl.innerHTML = `<span dir="ltr">₪${grandTotal.toLocaleString()}</span>`;

    // Restore cart notes badges after re-render (badge elements are recreated as display:none)
    if (typeof window._updateCartNotesBadges === 'function' && window._currentShareToken) {
        window._updateCartNotesBadges(window._currentShareToken);
    }
    if (opts.scrollToActive) {
        // Defer so patched wrappers (mobile list clone) finish first
        requestAnimationFrame(function() {
            requestAnimationFrame(function() {
                window._scrollActiveCartCardIntoView();
            });
        });
    }
};

window._scrollActiveCartCardIntoView = function(index) {
    const idx = (typeof index === 'number') ? index : state.editingCartIndex;
    if (idx < 0) return;
    const scrollCardIn = function(listId) {
        const list = document.getElementById(listId);
        if (!list) return;
        const card = list.querySelector('.cart-mini-card[data-cart-index="' + idx + '"]')
            || list.querySelector('.cart-mini-card.active-editing');
        if (!card) return;
        try {
            card.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
        } catch (e) {
            card.scrollIntoView(true);
        }
    };
    scrollCardIn('cart-items-list');
    scrollCardIn('mobile-cart-items-list');
};

// Set room wall position for a specific cart item
window.setCartItemRoomWall = function(index, wall) {
    if (!state.orderCart[index]) return;
    if (!state.orderCart[index].rawState) state.orderCart[index].rawState = {};
    state.orderCart[index].rawState.roomWall = wall;
    // If this cabinet is currently being edited, apply immediately
    if (state.editingCartIndex === index) {
        window._roomWall = wall;
        state.roomWall   = wall;
        buildCabinet();
    }
    updateLeftSidebar();
};

function _escPrintHtml(s) {
    return String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/\n/g, '<br>');
}

function _emptyContentCounts() {
    return { shelves: 0, hanging: 0, sorbet: 0, drawersInt: 0, drawersExt: 0, openCells: 0, sideOpenCells: 0 };
}

function _addContentTypeToCounts(counts, type, comp, zoneIdx) {
    if (type === 'hanging' || type === 'cross_hanging') counts.hanging++;
    else if (type === 'sorbet') counts.sorbet++;
    else if (type === 'internal_drawers') {
        const n = (comp && Array.isArray(comp.zonesDrawerCount) && zoneIdx != null && comp.zonesDrawerCount[zoneIdx] > 0)
            ? comp.zonesDrawerCount[zoneIdx]
            : ((comp && comp.count) || 1);
        counts.drawersInt += n;
    } else if (type === 'external_drawers') {
        const n = (comp && Array.isArray(comp.zonesDrawerCount) && zoneIdx != null && comp.zonesDrawerCount[zoneIdx] > 0)
            ? comp.zonesDrawerCount[zoneIdx]
            : ((comp && comp.count) || 1);
        counts.drawersExt += n;
    }
    else if (type === 'open_cell') counts.openCells++;
    else if (type === 'side_open_cell') counts.sideOpenCells++;
}

function _accumulateCompContentCounts(counts, comp) {
    if (!comp) return;
    if (comp.partition && Array.isArray(comp.subCells)) {
        comp.subCells.forEach(function(sub) {
            if (!sub) return;
            if (typeof _ensureZoneDoorSplit === 'function') _ensureZoneDoorSplit(sub);
            if (Array.isArray(sub.zonesType) && sub.zonesType.length) {
                sub.zonesType.forEach(function(zt, z) { _addContentTypeToCounts(counts, zt, sub, z); });
            } else {
                _addContentTypeToCounts(counts, sub.type, sub);
            }
        });
        return;
    }
    _addContentTypeToCounts(counts, comp.type, comp);
}

function _countCabinetContent(columns) {
    const counts = _emptyContentCounts();
    if (!Array.isArray(columns)) return counts;
    columns.forEach(function(col) {
        counts.shelves += col.shelves || 0;
        (col.compartments || []).forEach(function(comp) { _accumulateCompContentCounts(counts, comp); });
        if (col.type === 'desk' && col.deskHoneycomb) counts.openCells++;
    });
    return counts;
}

function _countLedPairs(columns) {
    if (!Array.isArray(columns)) return 0;
    return columns.reduce(function(n, col) {
        return n + ((col && Array.isArray(col.leds)) ? col.leds.length : 0) + (col && col.type === 'desk' && col.deskLeds ? 1 : 0);
    }, 0);
}

/** LED pairs on a wing's full-corner L-unit (only when the wing is set to full corner). */
function _countFullCornerLedPairs(wing) {
    if (!wing || wing.wingPosition !== 'full_corner' || !wing.fullCorner) return 0;
    return Array.isArray(wing.fullCorner.leds) ? wing.fullCorner.leds.length : 0;
}

function _countLedPairsFromRawState(rawState) {
    if (!rawState) return 0;
    if (!rawState.wings) return _countLedPairs(rawState.columns);
    return ['center', 'left', 'right'].reduce(function(n, side) {
        const w = rawState.wings[side];
        return n + (w ? _countLedPairs(w.columns) + _countFullCornerLedPairs(w) : 0);
    }, 0);
}

function _formatLedPairs(n) {
    return n === 1 ? 'זוג לדים אחד' : n + ' זוגות לדים';
}

function _countCabinetContentFromRawState(rawState) {
    if (!rawState) return _emptyContentCounts();
    const merged = _emptyContentCounts();
    if (rawState.wings) {
        ['center', 'left', 'right'].forEach(function(side) {
            const w = rawState.wings[side];
            if (!w || !Array.isArray(w.columns)) return;
            const c = _countCabinetContent(w.columns);
            merged.shelves += c.shelves;
            merged.hanging += c.hanging;
            merged.sorbet += c.sorbet;
            merged.drawersInt += c.drawersInt;
            merged.drawersExt += c.drawersExt;
            merged.openCells += c.openCells;
            merged.sideOpenCells += c.sideOpenCells;
        });
        const sc = rawState.wings.center && rawState.wings.center.sideCabinet;
        if (sc && sc.side !== 'none' && Array.isArray(sc.columns)) {
            const c = _countCabinetContent(sc.columns);
            merged.shelves += c.shelves;
            merged.hanging += c.hanging;
            merged.sorbet += c.sorbet;
            merged.drawersInt += c.drawersInt;
            merged.drawersExt += c.drawersExt;
            merged.openCells += c.openCells;
            merged.sideOpenCells += c.sideOpenCells;
        }
        return merged;
    }
    return _countCabinetContent(rawState.columns);
}

function _formatHangingRodsDisplay(itemObj) {
    const counts = itemObj && itemObj.rawState
        ? _countCabinetContentFromRawState(itemObj.rawState)
        : _emptyContentCounts();
    const total = counts.hanging + counts.sorbet;
    if (counts.sorbet > 0) return `${total} יחידות (${counts.sorbet} סורבטו)`;
    return `${total} יחידות`;
}

function _cartIsWritingDesk(itemObj) {
    if (!itemObj) return false;
    if (itemObj.spec && itemObj.spec.isWritingDesk) return true;
    const rs = itemObj.rawState;
    return !!(rs && rs.presetId === 'writing-desk');
}

function _printTr(thStyle, tdStyle, thLabel, tdHtml, tdExtra) {
    const th = thStyle ? ` style="${thStyle}"` : '';
    const td = tdStyle ? ` style="${tdStyle}${tdExtra || ''}"` : (tdExtra ? ` style="${tdExtra}"` : '');
    return `<tr><th${th}>${thLabel}</th><td${td}>${tdHtml}</td></tr>`;
}

function _printSectionHeader(label, sectionStyle) {
    return `<tr><td colspan="2" style="background:#f1f5f8;text-align:center;font-weight:bold;${sectionStyle || ''}">${label}</td></tr>`;
}

function _plainSpecValue(v) {
    if (v == null) return '';
    return String(v)
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]*>/g, '')
        .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .trim();
}

/** Refresh display color fields from rawState (fixes stale / wrong-wing labels on reprint). */
function _enrichSpecColorsFromRaw(item, rawState) {
    if (!item || !rawState) return item;
    const wing = (rawState.wings && (rawState.wings[rawState.activeWing || 'center'] || rawState.wings.center)) || null;
    const mat = function(key) {
        if (wing && wing[key]) return wing[key];
        return rawState[key];
    };
    if (mat('materialBody')) item.colorBody = _colorKeyLabel(mat('materialBody'));
    if (mat('materialInternal')) item.colorInternal = _colorKeyLabel(mat('materialInternal'));
    if (mat('materialExternal')) item.colorExternal = _colorKeyLabel(mat('materialExternal'));
    if (mat('materialBack')) item.colorBack = _colorKeyLabel(mat('materialBack'));
    if (mat('materialDesk')) item.colorDesk = _colorKeyLabel(mat('materialDesk'));
    if (rawState.wings) {
        item.colorOpenCell = _resolveOpenCellColorLabel(rawState.wings, mat('materialOpenCell') || rawState.materialOpenCell);
    } else if (mat('materialOpenCell')) {
        item.colorOpenCell = _colorKeyLabel(mat('materialOpenCell'));
    }
    return item;
}

/** Corner / walk-in wings as separate numbered cabinets in the order form. */
function _enumeratePrintCabinetUnits(rawState) {
    if (!rawState || !rawState.wings) return null;
    const pid = rawState.presetId || '';
    const hasSideWings = !!(rawState.wings.left || rawState.wings.right);
    if (pid !== 'corner-left' && pid !== 'corner-right' && pid !== 'walkin' && !hasSideWings) return null;

    const units = [];
    function add(side, label, wing) {
        if (!wing) return;
        const hasCols = Array.isArray(wing.columns) && wing.columns.length > 0;
        const hasSize = (wing.width > 0) || (wing.depth > 0);
        if (!hasCols && !hasSize) return;
        // Skip empty full_corner shells with no columns (they have a dedicated blueprint page)
        if (!hasCols && (wing.wingPosition === 'full_corner')) return;
        units.push({ side: side, label: label, wing: wing, index: units.length + 1 });
    }

    // Match blueprint order: left → center → right
    add('left', 'כנף שמאל', rawState.wings.left);
    add('center', 'ארון מרכזי', rawState.wings.center);
    add('right', 'כנף ימין', rawState.wings.right);

    const sc = rawState.wings.center && rawState.wings.center.sideCabinet;
    if (sc && sc.side && sc.side !== 'none') {
        add('sideCabinet', 'ארון צד', sc);
    }

    return units.length > 1 ? units : null;
}

function _wingDimsStr(wing, rawState) {
    const w = (wing && wing.width) || (rawState && rawState.width) || 160;
    const h = _wingBodyHeightFromData(wing, (rawState && rawState.globalHeight) || 240);
    const d = (wing && wing.depth) || (rawState && rawState.depth) || 54;
    return 'רוחב: ' + w + ' ס"מ | גובה: ' + h + ' ס"מ | עומק: ' + d + ' ס"מ';
}

/** Per-wing outer dims for customer summary (walk-in / corner). Avoids "|" so print keeps one line per wing. */
function _customerSummaryDimsLines(item, rawState) {
    const units = _enumeratePrintCabinetUnits(rawState);
    if (units && units.length) {
        return units.map(function(unit) {
            const wing = unit.wing || {};
            const w = wing.width || (rawState && rawState.width) || 160;
            const h = _wingBodyHeightFromData(wing, (rawState && rawState.globalHeight) || 240);
            const d = wing.depth || (rawState && rawState.depth) || 54;
            return unit.label + ': רוחב ' + w + ' ס"מ, גובה ' + h + ' ס"מ, עומק ' + d + ' ס"מ';
        });
    }
    if (rawState) {
        const fromRaw = _resolveCabinetDimsStr(item, { rawState: rawState, spec: item });
        if (fromRaw) return [fromRaw];
    }
    return item && item.dimsStr ? [item.dimsStr] : [];
}

function _formatHangingFromCounts(counts) {
    const total = (counts.hanging || 0) + (counts.sorbet || 0);
    if (counts.sorbet > 0) return total + ' יחידות (' + counts.sorbet + ' סורבטו)';
    return total + ' יחידות';
}

function _collectWingPrintSpecRows(item, itemObj, unit) {
    const wing = unit.wing || {};
    const rs = itemObj.rawState || {};
    const prefix = 'w_' + unit.side + '_';
    const counts = _countCabinetContent(wing.columns || []);
    const openCells = (counts.openCells || 0) + (counts.sideOpenCells || 0);
    const mat = function(key) {
        if (wing[key]) return wing[key];
        return rs[key];
    };
    const rows = [];

    rows.push({
        id: prefix + '_sec',
        section: true,
        label: 'מפרט ארון ' + unit.index + ' — ' + unit.label
    });
    rows.push({
        id: prefix + 'dimsStr',
        label: 'מידות חיצוניות',
        value: _plainSpecValue(_wingDimsStr(wing, rs)),
        rtl: true
    });
    rows.push({
        id: prefix + 'material',
        label: 'חומר גוף',
        value: _plainSpecValue(item.material)
    });
    rows.push({
        id: prefix + 'plinthType',
        label: 'סוג רגליים / צוקל',
        value: _plainSpecValue(item.plinthType)
    });

    rows.push({ id: prefix + '_sec_finishes', section: true, label: 'גוונים וגימורים — ארון ' + unit.index });
    rows.push({
        id: prefix + 'colorBody',
        label: 'צבע גוף וצוקל',
        value: _plainSpecValue(_colorKeyLabel(mat('materialBody') || 'white_matte'))
    });
    rows.push({
        id: prefix + 'colorInternal',
        label: 'צבע פנים (מדפים/מגירות)',
        value: _plainSpecValue(_colorKeyLabel(mat('materialInternal') || mat('materialBody') || 'white_matte'))
    });
    rows.push({
        id: prefix + 'colorExternal',
        label: 'צבע חזיתות (דלתות)',
        value: _plainSpecValue(_colorKeyLabel(mat('materialExternal') || mat('materialBody') || 'white_matte'))
    });
    rows.push({
        id: prefix + 'colorBack',
        label: 'צבע גב ארון',
        value: _plainSpecValue(_colorKeyLabel(mat('materialBack') || 'white_matte'))
    });
    if (openCells > 0) {
        rows.push({
            id: prefix + 'colorOpenCell',
            label: 'צבע כוורת',
            value: _plainSpecValue(_colorKeyLabel(mat('materialOpenCell') || mat('materialBody') || 'white_matte'))
        });
    }
    if (window._wingHasGlass(wing)) {
        rows.push({ id: prefix + 'glassTint', label: 'גוון זכוכית', value: window._glassTintLabel(wing) });
    }
    if (_wingHasTopPanel(wing)) {
        rows.push({
            id: prefix + 'colorTopPanel',
            label: 'צבע משטח עליון',
            value: _plainSpecValue(_wingTopPanelColorLabel(wing, rs))
        });
    }

    rows.push({ id: prefix + '_sec_hardware', section: true, label: 'פרזול ותכולה — ארון ' + unit.index });
    rows.push({
        id: prefix + 'handle',
        label: 'סוג ידיות לחזיתות',
        value: _plainSpecValue(wing.handleStyle
            ? window._handleStyleLabel(wing.handleStyle, wing.handleVariant, wing.handleType, wing.ridingColor)
            : item.handle)
    });
    rows.push({
        id: prefix + 'drawersExt',
        label: 'מגירות חיצוניות',
        value: (counts.drawersExt || 0) + ' יחידות'
    });
    rows.push({
        id: prefix + 'drawersInt',
        label: 'מגירות פנימיות',
        value: (counts.drawersInt || 0) + ' יחידות'
    });
    rows.push({
        id: prefix + 'shelves',
        label: 'מדפים נשלפים',
        value: (counts.shelves || 0) + ' יחידות'
    });
    rows.push({
        id: prefix + 'hangingRods',
        label: 'מוטות תלייה לקולבים',
        value: _plainSpecValue(_formatHangingFromCounts(counts))
    });
    const ledPairs = _countLedPairs(wing.columns) + _countFullCornerLedPairs(wing);
    if (ledPairs > 0) rows.push({ id: prefix + 'ledPairs', label: 'תאורת לד', value: _formatLedPairs(ledPairs) });

    return rows;
}

function _defaultModelNameFromRaw(rawState) {
    if (!rawState) return 'מאיה';
    if (rawState.presetId === 'writing-desk') return 'שולחן כתיבה';
    if (rawState.presetId === 'sliding') {
        const wing = rawState.wings && rawState.wings.center;
        const panels = (wing && wing.slidingDoor && wing.slidingDoor.doorPanels) || [];
        const hasMirror = panels.some(function(p) { return p === 'mirror' || p === 'mirror_dark'; });
        return hasMirror ? 'HRM2100' : 'HR2300';
    }
    const m = rawState.cabinetModel
        || (rawState.wings && rawState.wings.center && rawState.wings.center.cabinetModel)
        || 'maya';
    if (m === 'c9') return 'C9';
    if (m === 'ab2_nohoney') return 'ארון עם חזיתות פנימיות';
    if (m === 'ab2') return 'AB2';
    if (m === 'regalim') return 'רגלי ניקל';
    return 'מאיה';
}

function _resolvePrintModelName(item, itemObj) {
    const rs = itemObj && itemObj.rawState;
    const custom = String(
        (rs && rs.wings && rs.wings.center && rs.wings.center.cabinetModelLabel) ||
        (rs && rs.cabinetModelLabel) ||
        (item && item.cabinetModelLabel) ||
        ''
    ).trim();
    if (custom) return custom;
    if (rs) return _defaultModelNameFromRaw(rs);
    return (item && item.modelName) || 'מאיה';
}

function _collectPrintSpecRows(item, itemObj) {
    const isWD = _cartIsWritingDesk(itemObj);
    if (itemObj && itemObj.rawState) _enrichSpecColorsFromRaw(item, itemObj.rawState);
    const rows = [];
    const multiUnits = (!isWD && itemObj) ? _enumeratePrintCabinetUnits(itemObj.rawState) : null;

    rows.push({ id: 'modelName', label: isWD ? 'סוג מוצר' : 'דגם ארון', value: _plainSpecValue(_resolvePrintModelName(item, itemObj)) });
    if (!isWD) rows.push({ id: 'placement', label: 'מיקום / התקנה', value: _plainSpecValue(item.placement) });

    // Multi-wing corner / walk-in: separate spec block per cabinet/wing
    if (multiUnits) {
        const dsMulti = _appendDeskPrintRows(rows, item, itemObj);
        if (dsMulti.desk !== 'ללא' && item.colorDesk) {
            rows.push({ id: 'colorDesk', label: 'צבע שולחן עבודה', value: _plainSpecValue(item.colorDesk) });
        }
        multiUnits.forEach(function(unit) {
            _collectWingPrintSpecRows(item, itemObj, unit).forEach(function(r) { rows.push(r); });
        });
        const upperKeys = Object.keys(itemObj.rawState.wings || {}).filter(function(k) { return k.indexOf('upperUnit_') === 0; });
        const upperTopPanel = upperKeys.length ? _resolveTopPanelColorLabel(itemObj.rawState, upperKeys) : null;
        if (upperTopPanel) {
            rows.push({ id: '_sec_upper_finishes', section: true, label: 'גוונים וגימורים — יחידה עליונה' });
            rows.push({ id: 'upperColorTopPanel', label: 'צבע משטח עליון', value: _plainSpecValue(upperTopPanel) });
        }
        if (item.extraColors) {
            rows.push({ id: '_sec_extra', section: true, label: 'צבעים נוספים' });
            rows.push({ id: 'extraColors', label: 'צבעים נוספים בארון', value: _plainSpecValue(item.extraColors) });
        }
        const notesMulti = (item.cabinetNotes || '').trim();
        if (notesMulti) rows.push({ id: 'cabinetNotes', label: 'הערות', value: notesMulti, multiline: true });
        return rows;
    }

    rows.push({ id: 'dimsStr', label: 'מידות חיצוניות', value: _plainSpecValue(_resolveCabinetDimsStr(item, itemObj)), rtl: true });
    rows.push({ id: 'material', label: 'חומר גוף', value: _plainSpecValue(item.material) });
    rows.push({ id: 'plinthType', label: isWD ? 'בסיס' : 'סוג רגליים / צוקל', value: _plainSpecValue(isWD ? 'רגליים כפולות' : item.plinthType) });
    if (!isWD) _appendDeskPrintRows(rows, item, itemObj);

    rows.push({ id: '_sec_finishes', section: true, label: 'גוונים וגימורים' });
    if (isWD) {
        rows.push({ id: 'colorBody', label: 'צבע גוף (רגליים ומשטח)', value: _plainSpecValue(item.colorBody || '—') });
        const drawerColor = item.colorDrawers || item.colorExternal;
        if (drawerColor) rows.push({ id: 'colorDrawers', label: 'צבע מגירות', value: _plainSpecValue(drawerColor) });
        if (item.extraColors) rows.push({ id: 'extraColors', label: 'צבעים נוספים', value: _plainSpecValue(item.extraColors) });
    } else {
        rows.push({ id: 'colorBody', label: 'צבע גוף וצוקל', value: _plainSpecValue(item.colorBody) });
        rows.push({ id: 'colorInternal', label: 'צבע פנים (מדפים/מגירות)', value: _plainSpecValue(item.colorInternal) });
        if (item.slidingDoor) {
            rows.push({ id: 'slidingDoorColors', label: 'צבע חזיתות הזזה', value: _plainSpecValue(item.slidingDoor.doorColorsStr) });
        } else {
            rows.push({ id: 'colorExternal', label: 'צבע חזיתות (דלתות)', value: _plainSpecValue(item.colorExternal) });
        }
        rows.push({ id: 'colorBack', label: 'צבע גב ארון', value: _plainSpecValue((item.colorBack && item.colorBack !== 'undefined') ? item.colorBack : 'לבן מט') });
        if (_formatDeskAddition(item, itemObj).desk !== 'ללא') rows.push({ id: 'colorDesk', label: 'צבע שולחן עבודה', value: _plainSpecValue(item.colorDesk) });
        if (item.hasOpenCells) rows.push({ id: 'colorOpenCell', label: 'צבע כוורת', value: _plainSpecValue(item.colorOpenCell) });
        const glassTint = itemObj && _resolveGlassTintLabel(itemObj.rawState);
        if (glassTint) rows.push({ id: 'glassTint', label: 'גוון זכוכית', value: glassTint });
        const topPanelColor = itemObj && _resolveTopPanelColorLabel(itemObj.rawState);
        if (topPanelColor) rows.push({ id: 'colorTopPanel', label: 'צבע משטח עליון', value: _plainSpecValue(topPanelColor) });
        if (item.extraColors) rows.push({ id: 'extraColors', label: 'צבעים נוספים בארון', value: _plainSpecValue(item.extraColors) });
    }

    rows.push({ id: '_sec_hardware', section: true, label: 'פרזול ותכולה' });
    if (isWD) {
        if (item.writingDeskHasDrawers !== false) {
            rows.push({ id: 'handle', label: 'סוג ידיות למגירות', value: _plainSpecValue(item.handle) });
            const n = item.writingDeskDrawerCount != null ? item.writingDeskDrawerCount : (item.drawersExt || 0);
            rows.push({ id: 'writingDeskDrawerCount', label: 'מספר מגירות', value: `${n} יחידות` });
            if (item.writingDeskDrawerHeight) {
                rows.push({ id: 'writingDeskDrawerHeight', label: 'גובה מגירה', value: `${item.writingDeskDrawerHeight} ס"מ` });
            }
        } else {
            rows.push({ id: 'writingDeskDrawers', label: 'מגירות', value: 'ללא' });
        }
    } else if (item.slidingDoor) {
        rows.push({ id: 'slidingNumDoors', label: 'מספר דלתות הזזה', value: `${item.slidingDoor.numDoors} דלתות` });
        rows.push({ id: 'slidingProfileColor', label: 'צבע פרופיל הזזה', value: _plainSpecValue(item.slidingDoor.profileColor) });
        if (item.slidingDoor.hasMirror) {
            rows.push({ id: 'slidingMirror', label: 'דלת מראה', value: '✓ כולל דלת מראה' });
        }
    } else {
        rows.push({ id: 'handle', label: 'סוג ידיות לחזיתות', value: _plainSpecValue(item.handle) });
    }
    if (!isWD) {
        rows.push({ id: 'drawersExt', label: 'מגירות חיצוניות', value: `${item.drawersExt} יחידות` });
        rows.push({ id: 'drawersInt', label: 'מגירות פנימיות', value: `${item.drawersInt} יחידות` });
        rows.push({ id: 'shelves', label: 'מדפים נשלפים', value: `${item.shelves} יחידות` });
        rows.push({ id: 'hangingRods', label: 'מוטות תלייה לקולבים', value: _plainSpecValue(_formatHangingRodsDisplay(itemObj)) });
        const ledPairs = _countLedPairsFromRawState(itemObj && itemObj.rawState);
        if (ledPairs > 0) rows.push({ id: 'ledPairs', label: 'תאורת לד', value: _formatLedPairs(ledPairs) });
    }

    const notes = (item.cabinetNotes || '').trim();
    if (notes) rows.push({ id: 'cabinetNotes', label: 'הערות', value: notes, multiline: true });

    return rows;
}

function _hashPrintSpecSource(rows) {
    const payload = rows.filter(r => !r.section).map(r => `${r.id}:${r.value}`).join('\n');
    let h = 5381;
    for (let i = 0; i < payload.length; i++) h = ((h << 5) + h) ^ payload.charCodeAt(i);
    return (h >>> 0).toString(36);
}

function _resolvePrintSpecRows(itemObj) {
    const auto = _collectPrintSpecRows(itemObj.spec, itemObj);
    const hash = _hashPrintSpecSource(auto);
    const prev = itemObj.printSpecEdits;
    if (!prev || prev.sourceHash !== hash) {
        itemObj.printSpecEdits = { sourceHash: hash, rows: auto.map(r => ({ ...r })) };
        return itemObj.printSpecEdits.rows;
    }
    const merged = auto.map(autoRow => {
        if (autoRow.section) return { ...autoRow };
        const prevRow = prev.rows.find(r => r.id === autoRow.id);
        return prevRow ? { ...autoRow, value: prevRow.value } : { ...autoRow };
    });
    itemObj.printSpecEdits.rows = merged;
    return merged;
}

function _updatePrintSpecRow(itemObj, rowId, newValue) {
    _resolvePrintSpecRows(itemObj);
    const row = itemObj.printSpecEdits.rows.find(r => r.id === rowId);
    if (row && !row.section) row.value = newValue;
}

function _printSpecRowsHtml(rows, thStyle, tdStyle, sectionStyle) {
    return rows.map(r => {
        if (r.section) return _printSectionHeader(r.label, sectionStyle);
        const tdExtra = r.rtl ? ' dir="rtl"' : '';
        const val = _escPrintHtml(r.value).replace(/\n/g, '<br>');
        return _printTr(thStyle, tdStyle, r.label, val, tdExtra);
    }).join('');
}

/**
 * Split multi-wing print rows into pages:
 * - shared: model/placement before first "מפרט ארון N"
 * - units: one group per cabinet (starts at its "מפרט ארון N" section)
 * - trailing: notes / extra colors after the last unit
 */
function _splitPrintSpecRowsByCabinet(rows) {
    const list = rows || [];
    const isUnitSec = function(r) {
        return !!(r && r.section && /^מפרט ארון\s+\d+/.test(r.label || ''));
    };
    const shared = [];
    const units = [];
    const trailing = [];
    let current = null;
    let pastUnits = false;

    list.forEach(function(r) {
        if (isUnitSec(r)) {
            pastUnits = true;
            current = { title: r.label, rows: [r] };
            units.push(current);
            return;
        }
        if (!pastUnits) {
            shared.push(r);
            return;
        }
        if (current) {
            // Keep wing-internal sections with the unit; start trailing only on global extras
            if (r.section && (r.id === '_sec_extra' || (r.label || '').indexOf('צבעים נוספים') === 0)) {
                current = null;
                trailing.push(r);
                return;
            }
            if (!r.section && (r.id === 'extraColors' || r.id === 'cabinetNotes')) {
                current = null;
                trailing.push(r);
                return;
            }
            current.rows.push(r);
            return;
        }
        trailing.push(r);
    });

    return { shared: shared, units: units, trailing: trailing };
}

/** Print-page HTML for multi-cabinet specs: first unit shares the main title page. */
function _buildPagedCabinetSpecHtml(opts) {
    const titleText = opts.titleText;
    const detailLabel = opts.detailLabel;
    const specRows = opts.specRows || [];
    const priceRows = opts.priceRows || '';
    const thStyle = opts.thStyle;
    const tdStyle = opts.tdStyle;
    const sectionStyle = opts.sectionStyle || 'padding:8px;border:1px solid #e2e8f0;';
    const split = _splitPrintSpecRowsByCabinet(specRows);

    if (!split.units.length) {
        return `
            <div style="page-break-after:always;">
                <h3 style="font-size:1.3rem;color:#1e3a5f;margin:0 0 12px;padding:10px 15px;background:#f8fafc;border-radius:8px;border-right:4px solid #1e3a5f;">
                    פרטי ${detailLabel}: ${titleText}
                </h3>
                <table style="width:100%;border-collapse:collapse;margin-bottom:20px;font-size:1rem;border:1px solid #e2e8f0;">
                    ${_printSpecRowsHtml(specRows, thStyle, tdStyle, sectionStyle)}
                    ${priceRows}
                </table>
            </div>`;
    }

    let html = '';
    split.units.forEach(function(unit, ui) {
        const isFirst = ui === 0;
        const isLast = ui === split.units.length - 1;
        const pageRows = isFirst
            ? split.shared.concat(unit.rows)
            : unit.rows.slice();
        if (isLast && split.trailing.length) {
            pageRows.push.apply(pageRows, split.trailing);
        }
        const heading = isFirst
            ? ('פרטי ' + detailLabel + ': ' + titleText)
            : unit.title;
        html += `
            <div style="page-break-after:always;">
                <h3 style="font-size:1.3rem;color:#1e3a5f;margin:0 0 12px;padding:10px 15px;background:#f8fafc;border-radius:8px;border-right:4px solid #1e3a5f;">
                    ${heading}
                </h3>
                <table style="width:100%;border-collapse:collapse;margin-bottom:20px;font-size:1rem;border:1px solid #e2e8f0;">
                    ${_printSpecRowsHtml(pageRows, thStyle, tdStyle, sectionStyle)}
                    ${isFirst ? priceRows : ''}
                </table>
            </div>`;
    });
    return html;
}

const _COMPACT_CHIP_IDS = ['drawersExt', 'drawersInt', 'shelves', 'hangingRods', 'ledPairs', 'writingDeskDrawerCount'];
const _COMPACT_CHIP_LABELS = { hangingRods: 'מוטות תלייה', ledPairs: 'זוגות לדים' };

function _compactRowBaseId(id) {
    return String(id || '').replace(/^w_[A-Za-z]+_/, '');
}

/** Group spec rows for the compact factory layout: per cabinet → structure, finishes, hardware rows and count chips. */
function _compactSpecUnitsFromRows(rows) {
    const units = [];
    const notes = [];
    let cur = null;
    let bucket = 'general';
    const newUnit = function(title, extra) {
        cur = { title: title || '', extra: !!extra, general: [], finishes: [], hardware: [], chips: [] };
        units.push(cur);
    };
    (rows || []).forEach(function(r) {
        if (r.section) {
            const lbl = r.label || '';
            if (/^מפרט ארון/.test(lbl)) { newUnit(lbl); bucket = 'general'; return; }
            if (r.id === '_sec_upper_finishes' || r.id === '_sec_extra') { newUnit(lbl, true); bucket = 'finishes'; return; }
            bucket = lbl.indexOf('פרזול') === 0 ? 'hardware' : 'finishes';
            return;
        }
        const base = _compactRowBaseId(r.id);
        if (base === 'cabinetNotes') { if (String(r.value || '').trim()) notes.push(r.value); return; }
        if (!cur) newUnit('');
        if (_COMPACT_CHIP_IDS.indexOf(base) >= 0) cur.chips.push(r);
        else cur[bucket].push(r);
    });
    return { units: units, notes: notes };
}

function _compactSpecListHtml(title, rows, extraHtml) {
    if (!rows.length && !extraHtml) return '';
    const body = rows.map(function(r) {
        const val = _escPrintHtml(r.value).replace(/\n/g, '<br>');
        return `<div class="cmp-row"><span>${_escPrintHtml(r.label)}</span><span${r.rtl ? ' dir="rtl"' : ''}>${val}</span></div>`;
    }).join('');
    return `<div class="cmp-sec">${_escPrintHtml(title)}</div>${body}${extraHtml || ''}`;
}

function _compactSpecChipsHtml(rows) {
    if (!rows.length) return '';
    return `<div class="cmp-chips">${rows.map(function(r) {
        const base = _compactRowBaseId(r.id);
        const raw = base === 'ledPairs'
            ? String(r.value || '').replace(/^\s*זוג לדים אחד\s*$/, '1').replace(/\s*זוגות לדים\s*$/, '')
            : String(r.value || '');
        const m = /^\s*(\d+)\s*(.*)$/.exec(raw);
        const rest = m ? m[2].replace(/^יחידות\s*/, '').trim() : '';
        const lbl = (_COMPACT_CHIP_LABELS[base] || r.label) + (rest ? ' ' + rest : '');
        const inner = m
            ? `<i>${m[1]}</i>${_escPrintHtml(lbl)}`
            : `${_escPrintHtml(r.label)}: <i>${_escPrintHtml(r.value)}</i>`;
        return `<span class="cmp-chip${base === 'ledPairs' ? ' is-led' : ''}">${inner}</span>`;
    }).join('')}</div>`;
}

/** Compact factory spec list: structure, finishes, hardware chips, notes and price strip. */
function _buildCompactCabinetSpecHtml(opts) {
    const g = _compactSpecUnitsFromRows(opts.specRows);
    const units = g.units.map(function(u) {
        if (u.extra) {
            return `<div class="cmp-unit">${_compactSpecListHtml(u.title, u.finishes.concat(u.general, u.hardware))}</div>`;
        }
        const head = u.title ? `<div class="cmp-unit-h">${_escPrintHtml(u.title)}</div>` : '';
        return `<div class="cmp-unit">${head}`
            + _compactSpecListHtml('מבנה', u.general)
            + _compactSpecListHtml('גוונים וגימורים', u.finishes)
            + _compactSpecListHtml('פרזול ותכולה', u.hardware, _compactSpecChipsHtml(u.chips))
            + `</div>`;
    }).join('');
    const notes = g.notes.length
        ? `<div class="cmp-sec">הערות</div><div class="cmp-notes">${_escPrintHtml(g.notes.join('\n')).replace(/\n/g, '<br>')}</div>`
        : '';
    return `${units}${notes}${opts.priceStrip || ''}`;
}

const _MU_STRUCT_KEYS = ['material', 'plinthType'];
const _MU_FINISH_KEYS = ['colorBody', 'colorInternal', 'colorExternal', 'colorBack', 'colorOpenCell', 'glassTint', 'colorTopPanel', 'handle'];

function _muParseCount(row, isLed) {
    if (!row) return 0;
    let v = String(row.value || '');
    if (isLed) v = v.replace(/^\s*זוג לדים אחד\s*$/, '1');
    const m = /^\s*(\d+)/.exec(v);
    return m ? parseInt(m[1], 10) : 0;
}

function _muParseDims(row, wing, rs) {
    const m = row ? /רוחב:\s*([\d.]+)[\s\S]*?גובה:\s*([\d.]+)[\s\S]*?עומק:\s*([\d.]+)/.exec(String(row.value || '')) : null;
    if (m) return { w: +m[1], h: +m[2], d: +m[3] };
    return {
        w: (wing && wing.width) || 0,
        h: _wingBodyHeightFromData(wing, (rs && rs.globalHeight) || 240),
        d: (wing && wing.depth) || (rs && rs.depth) || 0
    };
}

function _muPartColor(p) {
    return _partColorByKey((p.kind === 'corner' ? 'corner:' : 'wing:') + p.side);
}

function _muBadgeHtml(p) {
    return `<span class="mu-badge" style="background:${_muPartColor(p).stroke};">${p.n}</span>`;
}

/** Corner / walk-in parts in physical order (left wing → left corner → center → right corner → right wing → side cabinet). */
function _printMultiUnitParts(itemObj, specRows) {
    const rs = itemObj.rawState || {};
    const units = _enumeratePrintCabinetUnits(rs);
    if (!units) return null;
    const wings = rs.wings || {};
    const g = _compactSpecUnitsFromRows(specRows);
    const rowsByIndex = {};
    g.units.forEach(function(u) {
        const m = /^מפרט ארון\s+(\d+)/.exec(u.title || '');
        if (!m) return;
        const map = {};
        u.general.concat(u.finishes, u.hardware, u.chips).forEach(function(r) { map[_compactRowBaseId(r.id)] = r; });
        rowsByIndex[m[1]] = map;
    });
    const bySide = {};
    units.forEach(function(u) { bySide[u.side] = u; });
    const parts = [];
    const addWing = function(side) {
        const u = bySide[side];
        if (!u) return;
        const rows = rowsByIndex[String(u.index)] || {};
        const dims = _muParseDims(rows.dimsStr, u.wing, rs);
        const hangNote = rows.hangingRods ? ((/\(([^)]*)\)/.exec(rows.hangingRods.value || '') || [])[1] || '') : '';
        parts.push({
            kind: 'wing', side: side, label: u.label, rows: rows,
            w: dims.w, h: dims.h, d: dims.d,
            cols: (u.wing.columns || []).length,
            drawersExt: _muParseCount(rows.drawersExt),
            drawersInt: _muParseCount(rows.drawersInt),
            shelves: _muParseCount(rows.shelves),
            hanging: _muParseCount(rows.hangingRods),
            hangingNote: hangNote,
            leds: Math.max(0, _muParseCount(rows.ledPairs, true) - _countFullCornerLedPairs(u.wing))
        });
    };
    const addCorner = function(side) {
        const w = wings[side];
        if (!w || w.wingPosition !== 'full_corner' || !w.fullCorner) return;
        const fc = w.fullCorner;
        const counts = _emptyContentCounts();
        (fc.compartments || []).forEach(function(c) { _accumulateCompContentCounts(counts, c); });
        const shelves = Array.isArray(fc.shelvesY) && fc.shelvesY.length ? fc.shelvesY.length : (fc.shelves || 0);
        parts.push({
            kind: 'corner', side: side, label: side === 'left' ? 'פינה שמאל' : 'פינה ימין', rows: {},
            w: fc.size || 100,
            h: _wingBodyHeightFromData(w, rs.globalHeight || 240),
            d: w.depth || (wings.center && wings.center.depth) || rs.depth || 54,
            cols: 1,
            drawersExt: counts.drawersExt,
            drawersInt: counts.drawersInt,
            shelves: shelves + counts.shelves,
            hanging: counts.hanging + counts.sorbet,
            hangingNote: counts.sorbet ? counts.sorbet + ' סורבטו' : '',
            leds: Array.isArray(fc.leds) ? fc.leds.length : 0
        });
    };
    addWing('left'); addCorner('left'); addWing('center'); addCorner('right'); addWing('right'); addWing('sideCabinet');
    parts.forEach(function(p, i) { p.n = i + 1; });
    return { parts: parts, groups: g };
}

/** Majority value per finish key goes to the shared spec; parts that differ become exception lines. */
function _muCommonAndExceptions(parts) {
    const wingParts = parts.filter(function(p) { return p.kind === 'wing'; });
    const common = {};
    const exceptions = [];
    _MU_STRUCT_KEYS.concat(_MU_FINISH_KEYS).forEach(function(key) {
        const entries = wingParts
            .map(function(p) { return { p: p, row: p.rows[key] }; })
            .filter(function(e) { return e.row && String(e.row.value || '').trim(); });
        if (!entries.length) return;
        const freq = {};
        entries.forEach(function(e) { freq[e.row.value] = (freq[e.row.value] || 0) + 1; });
        let best = entries[0].row.value;
        Object.keys(freq).forEach(function(v) { if (freq[v] > freq[best]) best = v; });
        common[key] = { label: entries[0].row.label, value: best, rtl: entries[0].row.rtl };
        entries.forEach(function(e) {
            if (e.row.value !== best) exceptions.push({ p: e.p, label: e.row.label, value: e.row.value });
        });
    });
    return { common: common, exceptions: exceptions };
}

function _muPartsTableHtml(parts) {
    const num = function(v) { return v ? String(v) : '<span class="mu-zero">0</span>'; };
    const tot = { w: 0, cols: 0, drawersExt: 0, drawersInt: 0, shelves: 0, hanging: 0, leds: 0 };
    const body = parts.map(function(p) {
        Object.keys(tot).forEach(function(k) { tot[k] += p[k] || 0; });
        const wTxt = p.kind === 'corner' ? `${p.w}×${p.w}` : String(p.w);
        const hang = p.hanging ? `${p.hanging}${p.hangingNote ? ` <small>(${_escPrintHtml(p.hangingNote)})</small>` : ''}` : num(0);
        const col = _muPartColor(p);
        return `<tr>
            <td class="mu-name" style="background:${col.fill};box-shadow:inset -4px 0 0 ${col.stroke};">${_muBadgeHtml(p)}${_escPrintHtml(p.label)}</td>
            <td dir="ltr">${wTxt}</td><td dir="ltr">${p.h} / ${p.d}</td><td>${num(p.cols)}</td>
            <td>${num(p.drawersExt)}</td><td>${num(p.drawersInt)}</td><td>${num(p.shelves)}</td>
            <td>${hang}</td><td class="${p.leds ? 'mu-led' : ''}">${p.leds ? p.leds : '—'}</td>
        </tr>`;
    }).join('');
    return `<table class="mu-parts">
        <thead><tr><th>חלק</th><th>רוחב</th><th>עומק / גובה</th><th>עמודות</th><th>מג' חיצ'</th><th>מג' פנים</th><th>מדפים</th><th>מוטות</th><th>לדים</th></tr></thead>
        <tbody>${body}</tbody>
        <tfoot><tr><td>סה"כ (${parts.length} חלקים)</td><td dir="ltr">${tot.w} <small>פריסה</small></td><td></td><td>${tot.cols}</td>
            <td>${tot.drawersExt}</td><td>${tot.drawersInt}</td><td>${tot.shelves}</td><td>${tot.hanging}</td><td>${tot.leds}</td></tr></tfoot>
    </table>`;
}

/** Top-view plan built from wing geometry; each part carries its print number. */
function _muPlanSvg(rs, parts, W, H) {
    const wings = rs.wings || {};
    const c = wings.center || {};
    const cW = c.width || rs.width || 160;
    const cD = c.depth || rs.depth || 54;
    const numOf = function(kind, side) {
        const p = parts.find(function(q) { return q.kind === kind && q.side === side; });
        return p ? p.n : null;
    };
    const shapes = [{ x: -cW / 2, y: 0, w: cW, h: cD, n: numOf('wing', 'center'), len: cW, bx: 0, by: cD / 2 }];
    ['left', 'right'].forEach(function(side) {
        const w = wings[side];
        if (!w) return;
        const L = side === 'left';
        const edge = L ? -cW / 2 : cW / 2;
        const wW = w.width || 160;
        const wD = w.depth || cD;
        const hasCols = Array.isArray(w.columns) && w.columns.length > 0;
        const pos = w.wingPosition || 'side';
        if (pos === 'full_corner' && w.fullCorner) {
            const fc = w.fullCorner.size || 100;
            const x0 = L ? edge - fc : edge;
            const cut = { x: L ? x0 + wD : x0, y: cD, w: fc - wD, h: fc - cD };
            shapes.push({ corner: true, x: x0, y: 0, w: fc, h: fc, cut: cut, n: numOf('corner', side), len: fc, bx: x0 + fc / 2, by: cD / 2 });
            if (hasCols) {
                const wx = L ? x0 : x0 + fc - wD;
                shapes.push({ x: wx, y: fc, w: wD, h: wW, n: numOf('wing', side), len: wW, bx: wx + wD / 2, by: fc + wW / 2 });
            }
        } else if (hasCols) {
            const wx = pos === 'front' ? (L ? edge : edge - wD) : (L ? edge - wD : edge);
            const wy = pos === 'front' ? cD : 0;
            shapes.push({ x: wx, y: wy, w: wD, h: wW, n: numOf('wing', side), len: wW, bx: wx + wD / 2, by: wy + wW / 2 });
        }
    });
    const sc = c.sideCabinet;
    const scN = numOf('wing', 'sideCabinet');
    if (sc && scN && sc.side && sc.side !== 'none') {
        const sW = sc.width || 60;
        const sD = sc.depth || cD;
        const atLeft = sc.side === 'left';
        const sx = atLeft ? -cW / 2 - sW : cW / 2;
        if (!shapes.some(function(s) { return s.x < sx + sW && s.x + s.w > sx && s.y < sD; })) {
            shapes.push({ x: sx, y: 0, w: sW, h: sD, n: scN, len: sW, bx: sx + sW / 2, by: sD / 2 });
        }
    }
    let minX = Infinity, maxX = -Infinity, maxY = 0;
    shapes.forEach(function(s) {
        minX = Math.min(minX, s.x); maxX = Math.max(maxX, s.x + s.w); maxY = Math.max(maxY, s.y + s.h);
    });
    const pad = 16;
    const top = 12;
    const s = Math.min((W - 2 * pad) / (maxX - minX), (H - top - pad) / maxY);
    const ox = pad + ((W - 2 * pad) - (maxX - minX) * s) / 2 - minX * s;
    const X = function(x) { return (ox + x * s).toFixed(1); };
    const Y = function(y) { return (top + y * s).toFixed(1); };
    let out = `<rect x="${X(minX) - 5}" y="${top - 7}" width="${((maxX - minX) * s + 10).toFixed(1)}" height="5" fill="#cbd5e1"/>`;
    shapes.forEach(function(sh) {
        const part = parts.find(function(q) { return q.n === sh.n; });
        const col = part ? _muPartColor(part) : _partColorByKey('');
        const stroke = col.stroke;
        const fill = col.fill;
        if (sh.corner) {
            const k = sh.cut;
            const x1 = sh.x + sh.w, y1 = sh.y + sh.h;
            const pts = k.x > sh.x
                ? [[sh.x, sh.y], [x1, sh.y], [x1, k.y], [k.x, k.y], [k.x, y1], [sh.x, y1]]
                : [[sh.x, sh.y], [x1, sh.y], [x1, y1], [k.x + k.w, y1], [k.x + k.w, k.y], [sh.x, k.y]];
            out += `<polygon points="${pts.map(function(p) { return X(p[0]) + ',' + Y(p[1]); }).join(' ')}" fill="${fill}" stroke="${stroke}" stroke-width="1.4"/>`;
        } else {
            out += `<rect x="${X(sh.x)}" y="${Y(sh.y)}" width="${(sh.w * s).toFixed(1)}" height="${(sh.h * s).toFixed(1)}" fill="${fill}" stroke="${stroke}" stroke-width="1.4"/>`;
        }
        if (sh.n) {
            out += `<circle cx="${X(sh.bx)}" cy="${Y(sh.by)}" r="9" fill="${stroke}"/>`
                + `<text x="${X(sh.bx)}" y="${Y(sh.by)}" dy="3.6" text-anchor="middle" font-size="10.5" font-weight="700" fill="#fff">${sh.n}</text>`;
        }
        out += `<text x="${X(sh.bx)}" y="${Y(sh.by)}" dy="20" text-anchor="middle" font-size="9" fill="#475569">${sh.len}</text>`;
    });
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%" height="${H}" font-family="Segoe UI, Arial, sans-serif">${out}</svg>`;
}

/** Map stored blueprint pages to parts by their labels (top view kept separate). */
function _muBlueprintIndex(item, parts) {
    const pages = item.multiViewPages || [];
    const labels = item.multiViewLabels || [];
    const out = { byPart: {}, top: [], rest: [], labeled: pages.length > 0 && labels.length === pages.length };
    if (!out.labeled) return out;
    pages.forEach(function(svg, i) {
        const lbl = labels[i] || '';
        const owner = parts.find(function(p) {
            if (p.kind === 'corner') return lbl.indexOf('פינה מלאה ' + (p.side === 'left' ? 'שמאל' : 'ימין')) >= 0;
            return lbl.indexOf('פינה מלאה') < 0 && lbl.indexOf(p.label) >= 0;
        });
        const entry = { svg: svg, label: lbl };
        if (owner) (out.byPart[owner.n] = out.byPart[owner.n] || []).push(entry);
        else if (lbl.indexOf('מבט עליון') >= 0) out.top.push(entry);
        else out.rest.push(entry);
    });
    return out;
}

function _muBlueprintPagesHtml(bp, parts, titleText) {
    const seq = [];
    bp.top.forEach(function(e) { seq.push({ head: 'מבט על — פריסת החלקים', svg: e.svg }); });
    parts.forEach(function(p) {
        (bp.byPart[p.n] || []).forEach(function(e) {
            const kind = (e.label.split(' — ')[0] || 'שרטוט').trim();
            seq.push({ head: `${_muBadgeHtml(p)}${_escPrintHtml(p.label)} — ${_escPrintHtml(kind)}`, svg: e.svg });
        });
    });
    bp.rest.forEach(function(e) { seq.push({ head: _escPrintHtml(e.label || 'שרטוט'), svg: e.svg }); });
    const pagesHtml = [];
    for (let i = 0; i < seq.length; i += 2) {
        pagesHtml.push(`<div class="bp-page" style="page-break-after:always;page-break-inside:avoid;">${seq.slice(i, i + 2).map(function(e, k) {
            return `<div class="mu-bp${k === 0 && i + 1 < seq.length ? ' is-first' : ''}">
                <div class="mu-bp-h"><span>${e.head}</span><small>${_escPrintHtml(titleText)} · ${i + k + 1}/${seq.length}</small></div>
                <div class="mu-bp-b">${e.svg}</div>
            </div>`;
        }).join('')}</div>`);
    }
    return pagesHtml.join('');
}

function _muPartCardsHtml(item, parts, bp) {
    const cards = parts.map(function(p) {
        let doors = '', open = '';
        if (p.kind === 'wing' && p.side === 'center') { doors = item.imgDoors; open = item.imgOpen; }
        else if (p.kind === 'wing') {
            const wp = (item.wingPreviews || []).find(function(w) { return w && w.id === p.side; });
            if (wp) { doors = wp.imgDoors; open = wp.imgOpen; }
        }
        const bpEntry = (bp.byPart[p.n] || [])[0];
        const cells = [];
        if (doors) cells.push(`<figure><img src="${doors}" alt=""><figcaption>סגור</figcaption></figure>`);
        if (open) cells.push(`<figure><img src="${open}" alt=""><figcaption>פתוח</figcaption></figure>`);
        if (bpEntry) cells.push(`<figure class="is-bp">${bpEntry.svg}<figcaption>שרטוט</figcaption></figure>`);
        if (!cells.length) return '';
        const dims = p.kind === 'corner' ? `${p.w}×${p.w}` : `${p.w} × ${p.d}`;
        const col = _muPartColor(p);
        return `<div class="mu-card" style="border-color:${col.stroke};">
            <div class="mu-card-h" style="background:${col.fill};"><span>${_muBadgeHtml(p)}${_escPrintHtml(p.label)}</span><small dir="ltr">${dims}</small></div>
            <div class="mu-card-i">${cells.join('')}</div>
        </div>`;
    }).filter(Boolean);
    if (!cards.length) return '';
    return `<div class="cmp-block mu-cards-page" style="page-break-after:always;">
        <div class="mu-cards-t">תמונות לפי חלק</div><div class="mu-cards">${cards.join('')}</div>
    </div>`;
}

/** Crop a stored blueprint SVG to its drawing (drops the page frame, titles and page number) so it can be printed larger. */
function _muCropBlueprintSvg(svgStr) {
    if (typeof document === 'undefined' || !document.body) return null;
    const host = document.createElement('div');
    host.style.cssText = 'position:absolute;left:-10000px;top:0;width:1200px;height:800px;visibility:hidden;';
    host.innerHTML = svgStr;
    document.body.appendChild(host);
    try {
        const el = host.querySelector('svg');
        if (!el) return null;
        Array.from(el.children).forEach(function(k) {
            const tag = k.tagName.toLowerCase();
            if (tag === 'rect' && k.getAttribute('width') === '1200' && k.getAttribute('height') === '800' && !k.getAttribute('x')) k.remove();
            else if (tag === 'text' && (parseFloat(k.getAttribute('y')) <= 60 || /^עמוד\s/.test(k.textContent || ''))) k.remove();
        });
        const b = el.getBBox();
        if (!b || !b.width || !b.height) return null;
        const pad = 12;
        const vb = [b.x - pad, b.y - pad, b.width + pad * 2, b.height + pad * 2];
        el.setAttribute('viewBox', vb.map(function(v) { return v.toFixed(1); }).join(' '));
        el.removeAttribute('width');
        el.removeAttribute('style');
        el.setAttribute('preserveAspectRatio', 'xMidYMid meet');
        return { svg: el.outerHTML, w: vb[2], h: vb[3] };
    } catch (e) {
        return null;
    } finally {
        host.remove();
    }
}

/** All part blueprints on one A4 sheet; picks the column count that gives the drawings the most area. */
function _muBlueprintSheetHtml(entries, titleText) {
    const W = 172, H = 236, gap = 5, headH = 8;
    const n = entries.length;
    let best = null;
    for (let c = 1; c <= n; c++) {
        const r = Math.ceil(n / c);
        const cw = (W - gap * (c - 1)) / c;
        const ch = (H - gap * (r - 1)) / r - headH;
        const area = entries.reduce(function(sum, e) {
            const s = Math.min(cw / e.w, ch / e.h);
            return sum + s * s * e.w * e.h;
        }, 0);
        if (!best || area > best.area) best = { c: c, cw: cw, ch: ch, area: area };
    }
    const rowH = [];
    entries.forEach(function(e, i) {
        const s = Math.min(best.cw / e.w, best.ch / e.h);
        const r = Math.floor(i / best.c);
        rowH[r] = Math.max(rowH[r] || 0, s * e.h);
    });
    return `<div class="mu-sheet" style="page-break-after:always;page-break-inside:avoid;">
        <div class="mu-sheet-t"><span>שרטוטים — כל החלקים</span><small>${_escPrintHtml(titleText)}</small></div>
        <div class="mu-sheet-g" style="grid-template-columns:repeat(${best.c},1fr);">${entries.map(function(e, i) {
            const h = rowH[Math.floor(i / best.c)];
            const cs = e.color ? ` style="background:${e.color.fill};border-color:${e.color.stroke};"` : '';
            const bs = e.color ? `border-color:${e.color.stroke};` : '';
            return `<div class="mu-sheet-c"><div class="mu-bp-h"${cs}><span>${e.head}</span></div><div class="mu-sheet-b" style="height:${h.toFixed(1)}mm;${bs}">${e.svg}</div></div>`;
        }).join('')}</div>
    </div>`;
}

/** Corner cabinets: 45° closed/open page, then one sheet with every part's blueprint as large as fits. */
function _muCornerPagesHtml(item, parts, bp, titleText) {
    const ang = item.cornerAngle || {};
    const doors = ang.imgDoors || item.imgDoors;
    const open = ang.imgOpen || item.imgOpen;
    const imgs = [[doors, 'סגור — עם דלתות'], [open, 'פתוח — ללא דלתות']].filter(function(x) { return x[0]; });
    let html = imgs.length ? `<div class="cmp-block mu-angle-page" style="page-break-after:always;">
        <div class="cmp-bar"><span>${_escPrintHtml(titleText)}</span><small>${ang.imgDoors ? 'מבט 45° — שני הצדדים' : 'הדמיה'}</small></div>
        ${imgs.map(function(x) { return `<div class="mu-angle"><div class="cmp-cap">${x[1]}</div><img src="${x[0]}" alt=""></div>`; }).join('')}
    </div>` : '';
    if (!bp.labeled) return html + _printCabinetBlueprintPagesHtml(item, titleText);
    const entries = [];
    const leftovers = [];
    parts.forEach(function(p) {
        (bp.byPart[p.n] || []).forEach(function(e) {
            const crop = _muCropBlueprintSvg(e.svg);
            if (crop) entries.push({ head: `${_muBadgeHtml(p)}${_escPrintHtml(p.label)}`, color: _muPartColor(p), svg: crop.svg, w: crop.w, h: crop.h });
            else leftovers.push(e);
        });
    });
    if (entries.length) html += _muBlueprintSheetHtml(entries, titleText);
    const rest = leftovers.concat(bp.rest);
    if (rest.length) html += _muBlueprintPagesHtml({ top: [], byPart: {}, rest: rest }, parts, titleText);
    return html;
}

/** Compact factory block for corner cabinets and walk-in closets: shared spec once, plan, parts table, per-part images, numbered blueprints. */
function _buildCompactMultiUnitHtml(o) {
    const item = o.item;
    const rs = o.itemObj.rawState || {};
    const parts = o.mu.parts;
    const g = o.mu.groups;
    const ce = _muCommonAndExceptions(parts);
    const sharedRows = [];
    g.units.forEach(function(u) {
        if (!u.title && !u.extra) sharedRows.push.apply(sharedRows, u.general.concat(u.finishes, u.hardware));
    });
    const pick = function(keys) { return keys.map(function(k) { return ce.common[k]; }).filter(Boolean); };
    const structRows = sharedRows.filter(function(r) { return r.id !== 'colorDesk'; }).concat(pick(_MU_STRUCT_KEYS));
    const finishRows = sharedRows.filter(function(r) { return r.id === 'colorDesk'; }).concat(pick(_MU_FINISH_KEYS));
    const extras = g.units.filter(function(u) { return u.extra; }).map(function(u) {
        return _compactSpecListHtml(u.title, u.finishes.concat(u.general, u.hardware));
    }).join('');
    const spec = _compactSpecListHtml('מבנה — משותף לכל החלקים', structRows)
        + _compactSpecListHtml('גוונים וגימורים — משותף לכל החלקים', finishRows)
        + extras;
    const kindLbl = rs.presetId === 'walkin' ? 'חדר ארונות' : 'ארון פינתי';
    const alert = ce.exceptions.length
        ? `<div class="mu-alert"><b>שונה מהמשותף:</b>${ce.exceptions.map(function(e) {
            return `<div>${_muBadgeHtml(e.p)}${_escPrintHtml(e.p.label)} — ${_escPrintHtml(e.label)}: <b>${_escPrintHtml(e.value)}</b></div>`;
        }).join('')}</div>`
        : '';
    const notes = g.notes.length
        ? `<div class="cmp-sec">הערות</div><div class="cmp-notes">${_escPrintHtml(g.notes.join('\n'))}</div>`
        : '';
    const bp = _muBlueprintIndex(item, parts);
    const isCorner = rs.presetId === 'corner-left' || rs.presetId === 'corner-right';
    const afterHtml = isCorner
        ? _muCornerPagesHtml(item, parts, bp, o.titleText)
        : _muPartCardsHtml(item, parts, bp)
            + (bp.labeled ? _muBlueprintPagesHtml(bp, parts, o.titleText) : _printCabinetBlueprintPagesHtml(item, o.titleText));
    return `<div class="cmp-block mu-block" style="page-break-after:always;">
        <div class="cmp-bar"><span>${_escPrintHtml(o.titleText)}</span><small>${kindLbl} · ${parts.length} חלקים</small></div>
        <div class="mu-top">
            <div class="cmp-spec">${spec}</div>
            <div class="mu-plan"><div class="cmp-cap">מבט על — מיקום החלקים</div>${_muPlanSvg(rs, parts, 300, 210)}</div>
        </div>
        ${_muPartsTableHtml(parts)}
        ${alert}
        ${notes}
        ${o.priceStrip || ''}
    </div>
    ${afterHtml}`;
}

function _printSpecRowsHtmlEditable(rows, cartIndex) {
    return rows.map(r => {
        if (r.section) return _printSectionHeader(r.label, '');
        const esc = _escPrintHtml(r.value);
        const tdExtra = r.rtl ? ' dir="rtl"' : '';
        const inputStyle = 'width:100%;margin:0;border:1px solid #e2e8f0;border-radius:6px;padding:6px 8px;font-family:inherit;font-size:inherit;box-sizing:border-box;background:white;';
        const cell = r.multiline
            ? `<textarea class="spec-row-input" data-cart-index="${cartIndex}" data-row-id="${r.id}" rows="2" style="${inputStyle}resize:vertical;min-height:52px;">${esc}</textarea>`
            : `<input type="text" class="spec-row-input" data-cart-index="${cartIndex}" data-row-id="${r.id}" value="${esc}" style="${inputStyle}">`;
        return `<tr class="spec-row-editable"><th>${r.label}</th><td${tdExtra ? ` style="${tdExtra.trim()}"` : ''}>${cell}</td></tr>`;
    }).join('');
}

function _bindPrintSpecRowInputs(container) {
    if (!container) return;
    container.querySelectorAll('.spec-row-input').forEach(inp => {
        if (inp.dataset.bound) return;
        inp.dataset.bound = '1';
        const persist = (e) => {
            const idx = parseInt(e.target.getAttribute('data-cart-index'), 10);
            const rowId = e.target.getAttribute('data-row-id');
            const itemObj = state.orderCart[idx];
            if (!itemObj || !rowId) return;
            _updatePrintSpecRow(itemObj, rowId, e.target.value);
            if (typeof saveHistoryState === 'function') saveHistoryState();
        };
        inp.addEventListener('change', persist);
        inp.addEventListener('input', persist);
    });
}

function _getOrderReplaceImageInput() {
    let el = document.getElementById('order-replace-image-input');
    if (el) return el;
    el = document.createElement('input');
    el.type = 'file';
    el.id = 'order-replace-image-input';
    el.accept = 'image/jpeg,image/png,image/webp,image/jpg,.jpg,.jpeg,.png,.webp';
    el.setAttribute('hidden', '');
    document.body.appendChild(el);
    return el;
}

function _readLocalImageAsDataUrl(file) {
    return new Promise(function(resolve, reject) {
        if (!file || !file.type || file.type.indexOf('image/') !== 0) {
            reject(new Error('יש לבחור קובץ תמונה (JPG / PNG)'));
            return;
        }
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = function() {
            URL.revokeObjectURL(url);
            const max = 1600;
            let w = img.naturalWidth || img.width;
            let h = img.naturalHeight || img.height;
            if (!w || !h) { reject(new Error('לא ניתן לקרוא את התמונה')); return; }
            if (w > max || h > max) {
                const s = max / Math.max(w, h);
                w = Math.round(w * s);
                h = Math.round(h * s);
            }
            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, w, h);
            ctx.drawImage(img, 0, 0, w, h);
            resolve(canvas.toDataURL('image/jpeg', 0.88));
        };
        img.onerror = function() {
            URL.revokeObjectURL(url);
            reject(new Error('לא ניתן לקרוא את התמונה'));
        };
        img.src = url;
    });
}

function _getCartPreviewSlotTarget(spec, slot) {
    if (!spec || !slot) return null;
    if (slot === 'imgDoors' || slot === 'imgOpen' || slot === 'imgSpaceDoors' || slot === 'imgSpaceOpen') {
        return { obj: spec, key: slot };
    }
    const m = /^wing:(\d+):(imgDoors|imgOpen)$/.exec(slot);
    if (!m || !spec.wingPreviews) return null;
    const w = spec.wingPreviews[parseInt(m[1], 10)];
    return w ? { obj: w, key: m[2] } : null;
}

function _applyCartPreviewImage(spec, slot, dataUrl, manual) {
    const t = _getCartPreviewSlotTarget(spec, slot);
    if (!t) return false;
    if (manual && !t.obj[t.key + 'Manual'] && t.obj[t.key]) {
        t.obj[t.key + 'Auto'] = t.obj[t.key];
    }
    t.obj[t.key] = dataUrl;
    t.obj[t.key + 'Manual'] = !!manual;
    if (!manual) delete t.obj[t.key + 'Manual'];
    return true;
}

function _syncOrderPreviewCard(container, slot, dataUrl, manual) {
    if (!container) return;
    const wrap = container.querySelector('.print-img-wrapper[data-preview-slot="' + slot + '"]');
    if (!wrap) return;
    const img = wrap.querySelector('img');
    if (img) img.src = dataUrl || '';
    wrap.classList.toggle('is-replaced', !!manual);
    const restore = wrap.querySelector('.print-img-restore');
    if (restore) restore.style.display = manual ? 'inline-flex' : 'none';
    const label = wrap.querySelector('.img-label');
    if (label) {
        const tag = label.querySelector('.print-img-replaced-tag');
        if (manual && !tag) {
            const span = document.createElement('span');
            span.className = 'print-img-replaced-tag';
            span.textContent = 'הוחלף';
            label.appendChild(document.createTextNode(' '));
            label.appendChild(span);
        } else if (!manual && tag) {
            if (tag.previousSibling && tag.previousSibling.nodeType === 3) tag.previousSibling.remove();
            tag.remove();
        }
    }
}

function _bindOrderPreviewImageReplace(container) {
    if (!container) return;
    container.querySelectorAll('.print-img-replace').forEach(function(btn) {
        if (btn.dataset.bound) return;
        btn.dataset.bound = '1';
        btn.addEventListener('click', function() {
            const idx = parseInt(btn.getAttribute('data-cart-index'), 10);
            const slot = btn.getAttribute('data-slot');
            const itemObj = state.orderCart[idx];
            if (!itemObj || !itemObj.spec || !slot) return;
            const input = _getOrderReplaceImageInput();
            input.value = '';
            input.onchange = async function() {
                const file = input.files && input.files[0];
                input.onchange = null;
                if (!file) return;
                try {
                    const dataUrl = await _readLocalImageAsDataUrl(file);
                    _applyCartPreviewImage(itemObj.spec, slot, dataUrl, true);
                    _syncOrderPreviewCard(container, slot, dataUrl, true);
                    if (typeof saveHistoryState === 'function') saveHistoryState();
                    if (typeof _showToast === 'function') _showToast('התמונה הוחלפה — תופיע ב-PDF', 2500);
                } catch (e) {
                    if (typeof _showToast === 'function') _showToast('⚠️ ' + (e.message || 'החלפת התמונה נכשלה'), 4000);
                }
            };
            input.click();
        });
    });
    container.querySelectorAll('.print-img-restore').forEach(function(btn) {
        if (btn.dataset.bound) return;
        btn.dataset.bound = '1';
        btn.addEventListener('click', function() {
            const idx = parseInt(btn.getAttribute('data-cart-index'), 10);
            const slot = btn.getAttribute('data-slot');
            const itemObj = state.orderCart[idx];
            if (!itemObj || !itemObj.spec || !slot) return;
            const t = _getCartPreviewSlotTarget(itemObj.spec, slot);
            if (!t) return;
            const restored = t.obj[t.key + 'Auto'] || t.obj[t.key];
            _applyCartPreviewImage(itemObj.spec, slot, restored, false);
            delete t.obj[t.key + 'Auto'];
            _syncOrderPreviewCard(container, slot, restored, false);
            if (typeof saveHistoryState === 'function') saveHistoryState();
            if (typeof _showToast === 'function') _showToast('ההדמיה שוחזרה', 2000);
        });
    });
}

function _printBasicSpecRows(item, itemObj, thStyle, tdStyle) {
    const isWD = _cartIsWritingDesk(itemObj);
    const dimsExtra = ' dir="rtl"';
    let html = '';
    html += _printTr(thStyle, tdStyle, isWD ? 'סוג מוצר' : 'דגם ארון', `<strong>${_escPrintHtml(_resolvePrintModelName(item, itemObj))}</strong>`);
    if (!isWD) html += _printTr(thStyle, tdStyle, 'מיקום / התקנה', item.placement);
    html += _printTr(thStyle, tdStyle, 'מידות חיצוניות', _resolveCabinetDimsStr(item, itemObj) || item.dimsStr, dimsExtra);
    html += _printTr(thStyle, tdStyle, 'חומר גוף', item.material);
    html += _printTr(thStyle, tdStyle, isWD ? 'בסיס' : 'סוג רגליים / צוקל', isWD ? 'רגליים כפולות' : item.plinthType);
    if (!isWD) {
        const ds = _formatDeskAddition(item, itemObj);
        html += _printTr(thStyle, tdStyle, 'תוספת שולחן', ds.desk);
        if (ds.deskDims) html += _printTr(thStyle, tdStyle, 'מידות שולחן', ds.deskDims, dimsExtra);
    }
    return html;
}

function _printFinishesRows(item, itemObj, thStyle, tdStyle, sectionStyle) {
    let html = _printSectionHeader('גוונים וגימורים', sectionStyle);
    if (_cartIsWritingDesk(itemObj)) {
        html += _printTr(thStyle, tdStyle, 'צבע גוף (רגליים ומשטח)', item.colorBody || '—');
        const drawerColor = item.colorDrawers || item.colorExternal;
        if (drawerColor) html += _printTr(thStyle, tdStyle, 'צבע מגירות', drawerColor);
        if (item.extraColors) html += _printTr(thStyle, tdStyle, 'צבעים נוספים', item.extraColors);
        return html;
    }
    html += _printTr(thStyle, tdStyle, 'צבע גוף וצוקל', item.colorBody);
    html += _printTr(thStyle, tdStyle, 'צבע פנים (מדפים/מגירות)', item.colorInternal);
    if (item.slidingDoor) {
        html += _printTr(thStyle, tdStyle, 'צבע חזיתות הזזה', item.slidingDoor.doorColorsStr);
    } else {
        html += _printTr(thStyle, tdStyle, 'צבע חזיתות (דלתות)', item.colorExternal);
    }
    html += _printTr(thStyle, tdStyle, 'צבע גב ארון', (item.colorBack && item.colorBack !== 'undefined') ? item.colorBack : 'לבן מט');
    if (_formatDeskAddition(item, itemObj).desk !== 'ללא') html += _printTr(thStyle, tdStyle, 'צבע שולחן עבודה', item.colorDesk);
    if (item.hasOpenCells) html += _printTr(thStyle, tdStyle, 'צבע כוורת', item.colorOpenCell);
    const glassTint = itemObj && _resolveGlassTintLabel(itemObj.rawState);
    if (glassTint) html += _printTr(thStyle, tdStyle, 'גוון זכוכית', glassTint);
    const topPanelColor = itemObj && _resolveTopPanelColorLabel(itemObj.rawState);
    if (topPanelColor) html += _printTr(thStyle, tdStyle, 'צבע משטח עליון', topPanelColor);
    if (item.extraColors) html += _printTr(thStyle, tdStyle, 'צבעים נוספים בארון', item.extraColors);
    return html;
}

function _printHardwareRows(item, itemObj, thStyle, tdStyle, sectionStyle) {
    let html = _printSectionHeader('פרזול ותכולה', sectionStyle);
    if (_cartIsWritingDesk(itemObj)) {
        if (item.writingDeskHasDrawers !== false) {
            html += _printTr(thStyle, tdStyle, 'סוג ידיות למגירות', `<strong>${item.handle}</strong>`);
            const n = item.writingDeskDrawerCount != null ? item.writingDeskDrawerCount : (item.drawersExt || 0);
            html += _printTr(thStyle, tdStyle, 'מספר מגירות', `${n} יחידות`);
            if (item.writingDeskDrawerHeight) {
                html += _printTr(thStyle, tdStyle, 'גובה מגירה', `${item.writingDeskDrawerHeight} ס"מ`);
            }
        } else {
            html += _printTr(thStyle, tdStyle, 'מגירות', 'ללא');
        }
        return html;
    }
    if (item.slidingDoor) {
        html += _printTr(thStyle, tdStyle, 'מספר דלתות הזזה', `${item.slidingDoor.numDoors} דלתות`);
        html += _printTr(thStyle, tdStyle, 'צבע פרופיל הזזה', item.slidingDoor.profileColor);
        if (item.slidingDoor.hasMirror) {
            html += _printTr(thStyle, tdStyle, 'דלת מראה', '<strong style="color:#1e3a5f;">✓ כולל דלת מראה</strong>');
        }
    } else {
        html += _printTr(thStyle, tdStyle, 'סוג ידיות לחזיתות', `<strong>${item.handle}</strong>`);
    }
    html += _printTr(thStyle, tdStyle, 'מגירות חיצוניות', `${item.drawersExt} יחידות`);
    html += _printTr(thStyle, tdStyle, 'מגירות פנימיות', `${item.drawersInt} יחידות`);
    html += _printTr(thStyle, tdStyle, 'מדפים נשלפים', `${item.shelves} יחידות`);
    html += _printTr(thStyle, tdStyle, 'מוטות תלייה לקולבים', _formatHangingRodsDisplay(itemObj));
    return html;
}

function _getOrderFormDefaults(mode) {
    const isFactory = mode === 'factory';
    return {
        title: isFactory
            ? 'שרטוט ייצור והתקנה'
            : (!window._docsHidePrices() ? 'הצעת מחיר ללקוח' : 'סיכום פרויקט ללקוח'),
        notes: ''
    };
}

function _getOrderFormText(mode) {
    if (!state.orderForm) state.orderForm = { factory: { title: '', notes: '' }, customer: { title: '', notes: '' } };
    const key = mode === 'factory' ? 'factory' : 'customer';
    const defaults = _getOrderFormDefaults(mode);
    const stored = state.orderForm[key] || {};
    return {
        title: (stored.title || '').trim() || defaults.title,
        notes: (stored.notes || '').trim()
    };
}

function _saveOrderFormText(mode, title, notes) {
    if (!state.orderForm) state.orderForm = { factory: { title: '', notes: '' }, customer: { title: '', notes: '' } };
    const key = mode === 'factory' ? 'factory' : 'customer';
    const defaults = _getOrderFormDefaults(mode);
    state.orderForm[key] = Object.assign({}, state.orderForm[key], {
        title: (title || '').trim() || defaults.title,
        notes: (notes || '').trim()
    });
}

function _clampPct(v) {
    const n = Number(v);
    return isFinite(n) ? Math.max(0, Math.min(100, n)) : 0;
}

function _getCustomerDiscounts() {
    const c = (state.orderForm && state.orderForm.customer) || {};
    return { cab: _clampPct(c.discountCabinetsPct), inst: _clampPct(c.discountInstallPct) };
}

function _setCustomerDiscount(field, pct) {
    if (!state.orderForm) state.orderForm = { factory: { title: '', notes: '' }, customer: { title: '', notes: '' } };
    if (!state.orderForm.customer) state.orderForm.customer = { title: '', notes: '' };
    state.orderForm.customer[field] = _clampPct(pct);
    if (typeof saveHistoryState === 'function') _withoutHistory(function() { saveHistoryState(); });
}

/** Totals for the customer summary, before and after the percentage discounts. */
function _customerTotals(totalCabinets, totalInstall) {
    const d = _getCustomerDiscounts();
    const cabDiscount = Math.round(totalCabinets * d.cab / 100);
    const instDiscount = Math.round(totalInstall * d.inst / 100);
    return {
        cabPct: d.cab, instPct: d.inst,
        cabinets: totalCabinets, install: totalInstall,
        cabDiscount: cabDiscount, instDiscount: instDiscount,
        cabinetsNet: totalCabinets - cabDiscount,
        installNet: totalInstall - instDiscount,
        gross: totalCabinets + totalInstall,
        net: totalCabinets + totalInstall - cabDiscount - instDiscount,
        hasDiscount: cabDiscount > 0 || instDiscount > 0
    };
}

function _fmtIls(n) {
    return '₪' + Math.round(n).toLocaleString();
}

/** Discount block + grand total for the "סיכום ללקוח" page. */
function _customerSummaryTotalsHtml(t) {
    if (!t.hasDiscount) {
        return '<div class="grand-total editable" contenteditable="true">סה"כ לתשלום (כולל התקנה): ' + _fmtIls(t.gross) + '</div>';
    }
    const row = function(label, value, cls) {
        return '<div class="disc-row' + (cls ? ' ' + cls : '') + '"><span class="editable" contenteditable="true">' + label +
            '</span><span class="editable" contenteditable="true" dir="ltr">' + value + '</span></div>';
    };
    let html = '<div class="disc-box">';
    if (t.cabDiscount > 0) {
        html += row('הנחה על ארונות (' + t.cabPct + '%):', '-' + _fmtIls(t.cabDiscount), 'disc-minus') +
            row('סה"כ ארונות אחרי הנחה:', _fmtIls(t.cabinetsNet));
    }
    if (t.instDiscount > 0) {
        html += row('הנחה על התקנות (' + t.instPct + '%):', '-' + _fmtIls(t.instDiscount), 'disc-minus') +
            row('סה"כ התקנות אחרי הנחה:', _fmtIls(t.installNet));
    }
    html += row('סה"כ לפני הנחה (כולל התקנה):', _fmtIls(t.gross), 'disc-gross') +
        row('סה"כ הנחה:', '-' + _fmtIls(t.gross - t.net), 'disc-minus') +
        '</div>' +
        '<div class="grand-total editable" contenteditable="true">סה"כ לתשלום אחרי הנחה (כולל התקנה): ' + _fmtIls(t.net) + '</div>';
    return html;
}

function _syncOrderFormNotesPrint(notes) {
    const notesPrint = document.getElementById('order-form-notes-print');
    if (!notesPrint) return;
    const trimmed = (notes || '').trim();
    if (trimmed) {
        notesPrint.textContent = trimmed;
        notesPrint.style.display = '';
    } else {
        notesPrint.textContent = '';
        notesPrint.style.display = 'none';
    }
}

function _bindOrderFormEditor() {
    const titleInp = document.getElementById('order-form-title');
    const notesInp = document.getElementById('order-form-notes');
    if (!titleInp || titleInp.dataset.bound) return;
    titleInp.dataset.bound = '1';
    notesInp && (notesInp.dataset.bound = '1');

    const persist = () => {
        const modal = document.getElementById('order-modal');
        const mode = modal?.dataset.mode || 'customer';
        _saveOrderFormText(mode, titleInp.value, notesInp?.value || '');
        _syncOrderFormNotesPrint(notesInp?.value || '');
        const titleEl = document.getElementById('order-modal-title');
        const formText = _getOrderFormText(mode);
        if (titleEl) {
            titleEl.innerHTML = mode === 'factory'
                ? '<i class="fa-solid fa-industry"></i> ' + _escPrintHtml(formText.title)
                : '<i class="fa-solid fa-file-invoice-dollar"></i> ' + _escPrintHtml(formText.title);
        }
    };
    titleInp.addEventListener('input', persist);
    if (notesInp) notesInp.addEventListener('input', persist);
}

function _printCabinetNotesRow(notes, thStyle, tdStyle) {
    const n = (notes || '').trim();
    if (!n) return '';
    return `<tr><th style="${thStyle}">הערות</th><td style="${tdStyle}white-space:pre-wrap;line-height:1.55;">${_escPrintHtml(n)}</td></tr>`;
}

function _printCabinetBlueprintPagesHtml(item, titleText) {
    const bpPages = item.multiViewPages && item.multiViewPages.length > 0
        ? item.multiViewPages
        : (item.multiViewSVG ? [item.multiViewSVG] : []);
    if (!bpPages.length) return '';
    const pairs = [];
    for (let pi = 0; pi < bpPages.length; pi += 2) {
        pairs.push(bpPages.slice(pi, pi + 2));
    }
    return pairs.map((pair, pairIdx) => `
            <div class="bp-page" style="page-break-after:always;page-break-inside:avoid;">
                ${pair.map((svg, si) => {
                    const globalIdx = pairIdx * 2 + si;
                    return `<div style="margin-bottom:${si === 0 && pair.length > 1 ? '16px' : '0'};">
                    <div style="font-size:1rem;font-weight:bold;margin-bottom:6px;background:#e8f0fe;padding:6px;text-align:center;border:1px solid #93c5fd;border-bottom:none;">
                        שרטוט טכני — ${titleText}${bpPages.length > 1 ? ` (עמוד ${globalIdx + 1}/${bpPages.length})` : ''}
                    </div>
                    <div style="border:2px solid #93c5fd;display:block;overflow:hidden;width:100%;">${svg}</div>
                </div>`;
                }).join('')}
            </div>`).join('');
}

/** Group cart items so shared-space cabinets print as one room block. */
function _groupCartItemsForPrint() {
    const cart = state.orderCart || [];
    const seenPairs = {};
    const groups = [];
    cart.forEach(function(itemObj, index) {
        if (typeof window._cartItemOnHold === 'function' && window._cartItemOnHold(itemObj)) return;
        const pairId = (typeof window._spacePairIdOf === 'function') ? window._spacePairIdOf(itemObj) : null;
        if (pairId) {
            if (seenPairs[pairId]) return;
            const members = [];
            cart.forEach(function(it, i) {
                if (typeof window._cartItemOnHold === 'function' && window._cartItemOnHold(it)) return;
                if (window._spacePairIdOf(it) === pairId) {
                    members.push({
                        itemObj: it,
                        index: i,
                        slot: window._spacePairSlotOf(it)
                    });
                }
            });
            seenPairs[pairId] = true;
            if (members.length < 2) {
                groups.push({ type: 'single', itemObj: itemObj, index: index });
                return;
            }
            members.sort(function(a, b) { return a.slot - b.slot; });
            const baseName = (typeof window._spacePairBaseNameFromItem === 'function')
                ? (window._spacePairBaseNameFromItem(members[0].itemObj) || '')
                : '';
            groups.push({
                type: 'space',
                pairId: pairId,
                baseName: baseName || 'ארון במרחב משותף',
                members: members
            });
            return;
        }
        groups.push({ type: 'single', itemObj: itemObj, index: index });
    });
    return groups;
}

function _printSingleCabinetBlockHtml(itemObj, index, opts) {
    opts = opts || {};
    const isFactory = !!opts.isFactory;
    const hidePrices = !!opts.hidePrices;
    const thStyle = opts.thStyle;
    const tdStyle = opts.tdStyle;
    const omitSpaceImages = !!opts.omitSpaceImages;
    const centerOnlyImages = !!opts.centerOnlyImages;
    const titleOverride = opts.titleOverride;
    const item = itemObj.spec;
    const titleText = titleOverride || (item.customName
        ? item.customName
        : (_cartIsWritingDesk(itemObj) ? `שולחן מס' ${index + 1}` : `ארון מס' ${index + 1}`));
    const detailLabel = _cartIsWritingDesk(itemObj) ? 'שולחן' : 'ארון';
    const numericPrice = parseInt(String(item.price || '').replace('₪', '').replace(/,/g, ''), 10) || 0;
    const itemInstall = item.installPrice || 0;
    const specRows = _resolvePrintSpecRows(itemObj);
    const blockResult = function(html) {
        return {
            html: html,
            numericPrice: numericPrice,
            itemInstall: itemInstall,
            itemCost: item.costPrice ? (parseInt(String(item.costPrice).replace('₪', '').replace(/,/g, ''), 10) || 0) : 0
        };
    };
    if (opts.compact) {
        const priceStrip = (hidePrices || !isFactory) ? ''
            : `<div class="cmp-price"><span>מחיר התקנה ללקוח</span><span dir="ltr">₪${itemInstall.toLocaleString()}</span></div>`;
        const mu = _cartIsWritingDesk(itemObj) ? null : _printMultiUnitParts(itemObj, specRows);
        if (mu && mu.parts.length > 1) {
            return blockResult(_buildCompactMultiUnitHtml({
                item: item, itemObj: itemObj, titleText: titleText, specRows: specRows, priceStrip: priceStrip, mu: mu
            }));
        }
        const firstBp = (item.multiViewPages && item.multiViewPages[0]) || item.multiViewSVG || '';
        const bpThumb = firstBp
            ? `<div class="cmp-bp-thumb"><div class="cmp-cap">שרטוט (תמונה ממוזערת)</div>${firstBp}</div>`
            : '';
        const extraImgs = centerOnlyImages ? '' : _orderPrintPreviewImagesHtml(item, itemObj.rawState, {
            omitSpace: omitSpaceImages,
            extrasOnly: true
        });
        return blockResult(`
            <div class="cmp-block" style="page-break-after:always;">
                <div class="cmp-bar">${_escPrintHtml(titleText)}</div>
                <div class="cmp-wrap">
                    <div class="cmp-spec">
                        ${_buildCompactCabinetSpecHtml({ specRows: specRows, priceStrip: priceStrip })}
                    </div>
                    <div class="cmp-side">
                        ${_orderPrintPreviewImagesHtml(item, itemObj.rawState, { centerOnly: true })}
                        ${bpThumb}
                    </div>
                </div>
                ${extraImgs.trim() ? `<div class="cmp-imgs">${extraImgs}</div>` : ''}
            </div>
            ${_printCabinetBlueprintPagesHtml(item, titleText)}`);
    }
    const priceRows = hidePrices ? '' : isFactory
        ? `<tr><th style="background:#fef9c3;">מחיר התקנה ללקוח</th><td style="font-weight:bold;color:#713f12;font-size:1.1rem;text-align:right;">₪${(item.installPrice || 0).toLocaleString()}</td></tr>`
        : `<tr><th style="background:#eff6ff;">מחיר ארון ללקוח</th><td style="font-weight:bold;color:#1e3a5f;font-size:1.1rem;text-align:right;">₪${numericPrice.toLocaleString()}</td></tr>
               <tr><th style="background:#eff6ff;">הובלה והתקנה</th><td style="font-weight:bold;color:#1e3a5f;font-size:1.1rem;text-align:right;">₪${itemInstall.toLocaleString()}</td></tr>`;

    let html = _buildPagedCabinetSpecHtml({
        titleText: titleText,
        detailLabel: detailLabel,
        specRows: specRows,
        priceRows: priceRows,
        thStyle: thStyle,
        tdStyle: tdStyle
    });
    const photosLayout = centerOnlyImages
        ? 'display:flex;flex-direction:row;flex-wrap:wrap;gap:16px;align-items:stretch;'
        : 'display:flex;flex-direction:column;gap:16px;';
    html += `
            <div style="page-break-after:always;">
                <h3 style="font-size:1.2rem;color:#1e3a5f;margin:0 0 16px;padding:10px 15px;background:#f8fafc;border-radius:8px;border-right:4px solid #1e3a5f;">
                    תמונות ${detailLabel}: ${titleText}
                </h3>
                <div style="${photosLayout}">
                    ${_orderPrintPreviewImagesHtml(item, itemObj.rawState, {
                        omitSpace: omitSpaceImages || centerOnlyImages,
                        centerOnly: centerOnlyImages
                    })}
                </div>
            </div>
            ${_printCabinetBlueprintPagesHtml(item, titleText)}`;
    return blockResult(html);
}

function _printSpaceGroupBlockHtml(group, opts) {
    opts = opts || {};
    const thStyle = opts.thStyle;
    const tdStyle = opts.tdStyle;
    const baseName = _escPrintHtml(group.baseName || 'ארון במרחב משותף');
    let spaceDoors = '';
    let spaceOpen = '';
    for (let i = 0; i < group.members.length; i++) {
        const spec = group.members[i].itemObj && group.members[i].itemObj.spec;
        if (!spec) continue;
        if (!spaceDoors && _cartImageValid(spec.imgSpaceDoors)) spaceDoors = spec.imgSpaceDoors;
        if (!spaceOpen && _cartImageValid(spec.imgSpaceOpen)) spaceOpen = spec.imgSpaceOpen;
        if (spaceDoors && spaceOpen) break;
    }
    const cellStyle = 'flex:1;min-width:260px;display:flex;flex-direction:column;min-height:0;';
    const lblStyle = 'font-size:0.9rem;font-weight:700;color:#475569;margin-bottom:8px;padding:4px 8px;background:#f1f5f8;border-radius:4px;';
    const imgStyle = 'width:100%;max-height:68vh;object-fit:contain;border:1px solid #e2e8f0;border-radius:6px;background:#fff;';
    const emptyStyle = 'padding:28px;text-align:center;color:#94a3b8;border:1px dashed #cbd5e1;border-radius:8px;';
    let html = `
            <div style="page-break-after:always;">
                <h2 style="font-size:1.45rem;color:#0f172a;margin:0 0 16px;padding:14px 16px;background:#ecfeff;border-radius:10px;border-right:5px solid #0f766e;">
                    ${baseName}
                </h2>
                <div style="display:flex;flex-direction:row;flex-wrap:wrap;gap:16px;align-items:stretch;">
                    <div style="${cellStyle}">
                        <div style="${lblStyle}">תצוגת חוץ — כל החלקים (סגור)</div>
                        ${spaceDoors
                            ? `<img src="${spaceDoors}" alt="מרחב סגור" style="${imgStyle}">`
                            : `<div style="${emptyStyle}">אין תמונת מרחב סגור</div>`}
                    </div>
                    <div style="${cellStyle}">
                        <div style="${lblStyle}">תצוגת פנים — כל החלקים (פתוח)</div>
                        ${spaceOpen
                            ? `<img src="${spaceOpen}" alt="מרחב פתוח" style="${imgStyle}">`
                            : `<div style="${emptyStyle}">אין תמונת מרחב פתוח</div>`}
                    </div>
                </div>
            </div>`;

    let totalPrice = 0, totalInstall = 0, totalCost = 0;
    group.members.forEach(function(m) {
        const partTitle = (m.itemObj.spec && m.itemObj.spec.customName)
            || ((typeof window._spacePartSuffix === 'function')
                ? ((group.baseName ? (group.baseName + ' ') : '') + window._spacePartSuffix(m.slot))
                : ('חלק ' + (m.slot + 1)));
        const block = _printSingleCabinetBlockHtml(m.itemObj, m.index, {
            isFactory: opts.isFactory,
            hidePrices: opts.hidePrices,
            compact: opts.compact,
            thStyle: thStyle,
            tdStyle: tdStyle,
            omitSpaceImages: true,
            centerOnlyImages: true,
            titleOverride: partTitle
        });
        html += block.html;
        totalPrice += block.numericPrice;
        totalInstall += block.itemInstall;
        totalCost += block.itemCost;
    });
    return { html: html, numericPrice: totalPrice, itemInstall: totalInstall, itemCost: totalCost };
}

// Top-level names must differ from the window._trialWatermark* helpers (classic scripts share the global scope).
function _trialWmHtml() {
    return typeof window._trialWatermarkHtml === 'function' ? window._trialWatermarkHtml() : '';
}

function _trialWmSvg(svg) {
    return typeof window._trialWatermarkSvg === 'function' ? window._trialWatermarkSvg(svg) : svg;
}

(function _wrapBlueprintGeneratorsForTrial() {
    const origPages = window._generateMultiViewBlueprintPages;
    if (typeof origPages === 'function') {
        window._generateMultiViewBlueprintPages = function () {
            const pages = origPages.apply(this, arguments);
            if (!window._trialWatermark || !Array.isArray(pages)) return pages;
            return pages.map(pg => Object.assign({}, pg, { svg: _trialWmSvg(pg.svg) }));
        };
    }
    const origSvg = window._generateMultiViewBlueprintSVG;
    if (typeof origSvg === 'function') {
        window._generateMultiViewBlueprintSVG = function () {
            return _trialWmSvg(origSvg.apply(this, arguments));
        };
    }
})();

function _buildPrintHTML(mode) {
    // mode: 'customer' or 'factory'
    const isFactory = mode === 'factory';

    // Table cell styles (defined before forEach so they're available in template literals)
    const thStyle = 'width:35%;background:#f8fafc;text-align:right;font-weight:600;color:#1e293b;padding:10px 14px;border:1px solid #e2e8f0;';
    const tdStyle = 'text-align:right;color:#1e293b;padding:10px 14px;border:1px solid #e2e8f0;background:white;';

    // Collect cart data
    const _hidePrices = window._docsHidePrices();
    let totalOrderPrice = 0, totalInstallPrice = 0, totalCostPrice = 0;
    let cabinetsHTML = '';

    _groupCartItemsForPrint().forEach(function(group) {
        if (group.type === 'space') {
            const block = _printSpaceGroupBlockHtml(group, {
                isFactory: isFactory,
                hidePrices: _hidePrices,
                compact: isFactory,
                thStyle: thStyle,
                tdStyle: tdStyle
            });
            cabinetsHTML += block.html;
            totalOrderPrice += block.numericPrice;
            totalInstallPrice += block.itemInstall;
            totalCostPrice += block.itemCost;
            return;
        }
        const block = _printSingleCabinetBlockHtml(group.itemObj, group.index, {
            isFactory: isFactory,
            hidePrices: _hidePrices,
            compact: isFactory,
            thStyle: thStyle,
            tdStyle: tdStyle,
            omitSpaceImages: false
        });
        cabinetsHTML += block.html;
        totalOrderPrice += block.numericPrice;
        totalInstallPrice += block.itemInstall;
        totalCostPrice += block.itemCost;
    });

    const summaryHTML = _hidePrices ? '' : isFactory
        ? `<div style="margin-top:20px;padding:15px;background:#fefce8;border:2px solid #fef08a;border-radius:8px;">
               <div style="font-size:1.4rem;font-weight:800;color:#713f12;display:flex;justify-content:space-between;">
                   <span>סה"כ עלות התקנה:</span><span dir="ltr">₪${totalInstallPrice.toLocaleString()}</span>
               </div>
           </div>`
        : `<div style="margin-top:20px;padding:15px;background:#eff6ff;border:2px solid #bfdbfe;border-radius:8px;">
               <div style="display:flex;justify-content:space-between;margin-bottom:8px;font-size:1rem;color:#475569;">
                   <span>סה"כ ארונות (ללא התקנה):</span><span dir="ltr" style="font-weight:bold;">₪${totalOrderPrice.toLocaleString()}</span>
               </div>
               <div style="display:flex;justify-content:space-between;margin-bottom:8px;font-size:1rem;color:#475569;">
                   <span>סה"כ הובלה והתקנה:</span><span dir="ltr" style="font-weight:bold;">₪${totalInstallPrice.toLocaleString()}</span>
               </div>
               <div style="display:flex;justify-content:space-between;font-size:1.6rem;font-weight:800;color:#1e3a5f;border-top:2px solid #bfdbfe;padding-top:12px;margin-top:8px;">
                   <span>סה"כ לתשלום ללקוח:</span><span dir="ltr">₪${(totalOrderPrice + totalInstallPrice).toLocaleString()}</span>
               </div>
           </div>`;

    const formText = _getOrderFormText(mode);
    const title = formText.title;
    const introHTML = formText.notes
        ? `<div style="white-space:pre-wrap;line-height:1.55;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:12px 14px;margin-bottom:20px;font-size:0.95rem;color:#78350f;">${_escPrintHtml(formText.notes)}</div>`
        : '';
    const custName = state.customer.name || 'לא צוין';
    const custPhone = state.customer.phone || 'לא צוין';
    const custOrder = state.customer.orderNum || 'לא צוין';
    const custAddr = state.customer.address || 'לא צוין';
    const custDelivery = window._formatCustomerDeliveryDate
        ? (window._formatCustomerDeliveryDate(state.customer.deliveryDate) || 'לא צוין')
        : (state.customer.deliveryDate || 'לא צוין');

    // Build PDF filename: סוגרים הכל לדירה (orderNum) (custName)
    const _pdfOrderPart = (state.customer && state.customer.orderNum) ? state.customer.orderNum : '';
    const _pdfNamePart  = (state.customer && state.customer.name)     ? state.customer.name     : '';
    const _pdfTitleParts = ['סוגרים הכל לדירה'];
    if (_pdfOrderPart) _pdfTitleParts.push(_pdfOrderPart);
    if (_pdfNamePart)  _pdfTitleParts.push(_pdfNamePart);
    const pdfTitle = _pdfTitleParts.join(' ');

    const _logoHtml = window._userLogoUrl
        ? `<img src="${window._userLogoUrl}" style="max-height:56px;max-width:160px;object-fit:contain;display:block;" alt="לוגו">`
        : '';

    return `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
<meta charset="UTF-8">
<title>${pdfTitle}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Tahoma, Arial, sans-serif; direction: rtl; background: white; color: #1e293b; padding: 20px; font-size: 14px; }
  h1 { font-size: 1.6rem; color: #1e3a5f; margin-bottom: 6px; }
  .header-bar { border-bottom: 3px solid #1e3a5f; padding-bottom: 12px; margin-bottom: 20px; display:flex; justify-content:space-between; align-items:flex-end; }
  .cust-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 20px; background: #f8fafc; padding: 12px; border-radius: 8px; margin-bottom: 20px; font-size: 0.95rem; border: 1px solid #e2e8f0; }
  @media print {
    body { padding: 10px; }
    @page { margin: 15mm; size: A4; }
  }
  .bp-page svg { width: 100% !important; height: auto !important; display: block; }
  .bp-page { width: 100%; overflow: hidden; }
  .cmp-block, .cmp-block * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .cmp-bar { background: #1e3a5f; color: #fff; padding: 7px 14px; border-radius: 6px; font-size: 1.1rem; font-weight: 800; margin-bottom: 10px; }
  .cmp-wrap { display: grid; grid-template-columns: 1.25fr 1fr; gap: 14px; align-items: start; }
  .cmp-unit { margin-bottom: 6px; }
  .cmp-unit-h { font-weight: 800; color: #1e3a5f; font-size: 0.95rem; padding: 4px 10px; background: #e8eef6; border-right: 4px solid #1e3a5f; border-radius: 4px; margin: 4px 0 2px; }
  .cmp-sec { font-size: 0.8rem; font-weight: 800; color: #1e3a5f; border-bottom: 1.5px solid #1e3a5f; padding: 7px 0 2px; margin-bottom: 2px; break-after: avoid; page-break-after: avoid; }
  .cmp-row { display: flex; justify-content: space-between; gap: 10px; padding: 3px 0; border-bottom: 1px dotted #cbd5e1; font-size: 0.85rem; break-inside: avoid; }
  .cmp-row > span:first-child { color: #475569; flex-shrink: 0; }
  .cmp-row > span:last-child { font-weight: 700; color: #0f172a; text-align: left; }
  .cmp-chips { display: flex; flex-wrap: wrap; gap: 4px; padding: 6px 0 2px; }
  .cmp-chip { border: 1px solid #cbd5e1; border-radius: 999px; padding: 2px 9px; font-size: 0.8rem; font-weight: 700; background: #f8fafc; }
  .cmp-chip i { font-style: normal; color: #1e3a5f; font-size: 0.9rem; margin-left: 4px; }
  .cmp-chip.is-led { background: #fffbeb; border-color: #fcd34d; color: #92400e; }
  .cmp-chip.is-led i { color: #b45309; }
  .cmp-notes { font-size: 0.85rem; color: #78350f; padding: 4px 0 8px; white-space: normal; }
  .cmp-price { display: flex; justify-content: space-between; background: #fef9c3; border: 1px solid #fde047; border-radius: 6px; padding: 6px 12px; font-weight: 800; color: #713f12; margin-top: 6px; }
  .cmp-side { display: flex; flex-direction: column; gap: 8px; }
  .cmp-side > div, .cmp-imgs > div { flex: none !important; break-inside: avoid; page-break-inside: avoid; }
  .cmp-side img { flex: none !important; height: 200px; background: #fff; }
  .cmp-cap { font-size: 0.85rem; font-weight: 600; color: #475569; margin-bottom: 4px; padding: 4px 8px; background: #f1f5f8; border-radius: 4px; }
  .cmp-bp-thumb { border: 1px solid #e2e8f0; border-radius: 4px; padding: 4px; background: #fff; }
  .cmp-bp-thumb svg { width: 100% !important; height: 200px !important; display: block; }
  .cmp-imgs { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 12px; }
  .cmp-imgs img { flex: none !important; height: 230px; background: #fff; }
  .cmp-bar { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; }
  .cmp-bar small { font-size: 0.8rem; font-weight: 600; opacity: 0.85; }
  .mu-top { display: grid; grid-template-columns: 1.15fr 1fr; gap: 14px; align-items: start; }
  .mu-plan { border: 1px solid #e2e8f0; border-radius: 6px; padding: 4px; background: #fff; }
  .mu-plan svg { display: block; }
  .mu-badge { display: inline-flex; align-items: center; justify-content: center; min-width: 18px; height: 18px; border-radius: 50%; background: #1e3a5f; color: #fff; font-size: 0.72rem; font-weight: 800; margin-left: 6px; padding: 0 4px; vertical-align: middle; }
  .mu-parts { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 0.8rem; break-inside: avoid; }
  .mu-parts th { background: #1e3a5f; color: #fff; padding: 4px 3px; font-weight: 700; white-space: nowrap; }
  .mu-parts td { border-bottom: 1px solid #e2e8f0; padding: 4px 3px; text-align: center; font-weight: 700; }
  .mu-parts td.mu-name { text-align: right; white-space: nowrap; }
  .mu-parts td.mu-led { background: #fffbeb; color: #b45309; }
  .mu-parts .mu-zero { color: #cbd5e1; font-weight: 400; }
  .mu-parts small { font-weight: 500; color: #64748b; }
  .mu-parts tfoot td { background: #e8eef6; border-top: 2px solid #1e3a5f; color: #1e3a5f; }
  .mu-alert { margin-top: 8px; border: 1px solid #fca5a5; background: #fef2f2; color: #991b1b; border-radius: 6px; padding: 6px 10px; font-size: 0.82rem; break-inside: avoid; }
  .mu-alert > div { margin-top: 3px; }
  .mu-cards-t { font-size: 0.8rem; font-weight: 800; color: #1e3a5f; border-bottom: 1.5px solid #1e3a5f; padding: 10px 0 2px; margin-bottom: 6px; break-after: avoid; page-break-after: avoid; }
  .mu-cards { display: grid; grid-template-columns: 1fr; gap: 10px; }
  .mu-card { border: 1px solid #cbd5e1; border-radius: 6px; overflow: hidden; break-inside: avoid; page-break-inside: avoid; }
  .mu-card-h { display: flex; justify-content: space-between; align-items: center; background: #f1f5f8; padding: 3px 8px; font-size: 0.82rem; font-weight: 800; color: #1e3a5f; }
  .mu-card-h small { color: #64748b; font-weight: 600; }
  .mu-card-i { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; padding: 6px; }
  .mu-card-i figure { text-align: center; }
  .mu-card-i img { width: 100%; height: 190px; object-fit: contain; display: block; background: #fff; }
  .mu-card-i svg { width: 100% !important; height: 190px !important; display: block; }
  .mu-card-i figcaption { font-size: 0.7rem; color: #64748b; }
  .mu-angle { margin-bottom: 4mm; break-inside: avoid; page-break-inside: avoid; }
  .mu-angle img { width: 100%; height: 108mm; object-fit: contain; display: block; background: #fff; border: 1px solid #e2e8f0; border-radius: 4px; }
  .mu-sheet { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .mu-sheet-t { display: flex; justify-content: space-between; align-items: baseline; background: #1e3a5f; color: #fff; padding: 5px 12px; border-radius: 6px; font-weight: 800; margin-bottom: 3mm; }
  .mu-sheet-t small { font-weight: 600; opacity: 0.85; }
  .mu-sheet-g { display: grid; gap: 5mm; width: 172mm; max-width: 100%; margin: 0 auto; direction: ltr; }
  .mu-sheet-c { break-inside: avoid; page-break-inside: avoid; direction: rtl; }
  .mu-sheet-c .mu-bp-h { height: 8mm; padding: 0 10px; }
  .mu-sheet-b { border: 2px solid #93c5fd; background: #fff; overflow: hidden; }
  .mu-sheet-b svg { width: 100% !important; height: 100% !important; display: block; }
  .mu-bp.is-first { margin-bottom: 16px; }
  .mu-bp-h { display: flex; justify-content: space-between; align-items: center; background: #e8f0fe; border: 1px solid #93c5fd; border-bottom: none; padding: 6px 10px; font-weight: 800; color: #1e3a5f; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .mu-bp-h small { font-weight: 600; color: #475569; }
  .mu-bp-h .mu-badge { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .mu-bp-b { border: 2px solid #93c5fd; overflow: hidden; }
</style>
</head>
<body>
<div class="header-bar">
  <div>
    <h1>📋 ${title}</h1>
    <div style="font-size:0.85rem;color:#64748b;margin-top:4px;">תאריך: ${new Date().toLocaleDateString('he-IL')}</div>
  </div>
  ${_logoHtml}
</div>
${introHTML}
<div class="cust-grid">
  <div><strong>שם פרויקט/לקוח:</strong> ${custName}</div>
  <div><strong>טלפון:</strong> ${custPhone}</div>
  <div><strong>מספר הזמנה:</strong> ${custOrder}</div>
  <div><strong>כתובת:</strong> ${custAddr}</div>
  <div><strong>צפי אספקה:</strong> ${custDelivery}</div>
</div>
${cabinetsHTML}
${summaryHTML}
${_trialWmHtml()}
</body>
</html>`;
}

window.printCustomer = async function() {
    if (typeof window._cartHasExportableItems === 'function' && !window._cartHasExportableItems()) {
        _showToast('אין ארונות לייצוא — כל הארונות מושהים. הפעילו ארון כדי לכלול אותו.', 5000);
        return;
    }
    _showToast('🔄 מרענן תמונות לפני הדפסה...', 3000);
    try { await window._refreshCartMediaForPrint({ force: true }); } catch (e) { console.warn('[printCustomer]', e); }
    _writePrintWindow(_buildPrintHTML('customer'));
};

/** Open the print window with the form HTML and trigger print (PDF name: סוגרים הכל לדירה orderNum custName). */
function _writePrintWindow(html) {
    const _pdfOrder = (state.customer && state.customer.orderNum) ? state.customer.orderNum : '';
    const _pdfName  = (state.customer && state.customer.name)     ? state.customer.name     : '';
    const _pdfParts = ['סוגרים הכל לדירה'];
    if (_pdfOrder) _pdfParts.push(_pdfOrder);
    if (_pdfName)  _pdfParts.push(_pdfName);
    const _pdfTitle = _pdfParts.join(' ');
    _openPrintPopup('width=900,height=700', win => {
        win.document.write(html);
        win.document.close();
        win.focus();
        // Set title inside setTimeout so it runs after document is fully parsed
        setTimeout(() => { win.document.title = _pdfTitle; win.print(); }, 600);
    });
}
window.printFactory = async function() {
    if (typeof window._cartHasExportableItems === 'function' && !window._cartHasExportableItems()) {
        _showToast('אין ארונות לייצוא — כל הארונות מושהים. הפעילו ארון כדי לכלול אותו.', 5000);
        return;
    }
    _showToast('🔄 מרענן תמונות לפני הדפסה...', 3000);
    try { await window._refreshCartMediaForPrint({ force: true }); } catch (e) { console.warn('[printFactory]', e); }
    try { await window._refreshCartBlueprintPagesForPrint(); } catch (e) { console.warn('[printFactory] blueprint refresh failed:', e); }
    _writePrintWindow(_buildPrintHTML('factory'));
};

// ==========================================
// 7a-2. Multi-View Blueprint Modal (paged)
// ==========================================
window._mvbpPages = [];   // array of { label, svg }
window._mvbpIndex = 0;    // current page index

window._mvbpShow = function(idx) {
    const pages = window._mvbpPages;
    if (!pages.length) return;
    idx = Math.max(0, Math.min(pages.length - 1, idx));
    window._mvbpIndex = idx;
    const content = document.getElementById('multiview-blueprint-content');
    if (content) content.innerHTML = pages[idx].svg;
    const lbl = document.getElementById('mvbp-page-label');
    if (lbl) lbl.textContent = `${pages[idx].label}  (${idx + 1} / ${pages.length})`;
    const prev = document.getElementById('mvbp-prev');
    const next = document.getElementById('mvbp-next');
    if (prev) prev.disabled = idx === 0;
    if (next) next.disabled = idx === pages.length - 1;
    if (prev) prev.style.opacity = idx === 0 ? '0.4' : '1';
    if (next) next.style.opacity = idx === pages.length - 1 ? '0.4' : '1';
};

window._mvbpNav = function(delta) {
    window._mvbpShow(window._mvbpIndex + delta);
};

// ---- Blueprint pinch-to-zoom ----
// SVG uses viewBox — set pixel width on wrapper div to zoom in/out
// Container is overflow:auto so native scroll handles pan when zoomed
window._mvbpScale = 1.0;
window._mvbpBaseW = 0; // natural container width at 1×

window._mvbpZoom = function(delta) {
    window._mvbpScale = Math.max(0.5, Math.min(5.0, window._mvbpScale + delta));
    window._mvbpApplyZoom();
};

window._mvbpZoomReset = function() {
    window._mvbpScale = 1.0;
    window._mvbpApplyZoom();
};

window._mvbpApplyZoom = function() {
    const wrap = document.getElementById('mvbp-svg-wrap');
    if (wrap && window._mvbpBaseW > 0) {
        const w = Math.round(window._mvbpBaseW * window._mvbpScale);
        wrap.style.width = w + 'px';
        wrap.style.flexShrink = '0';
    }
};

// Override _mvbpShow to wrap SVG and reset zoom on page change.
// opts.preserveView — keep scroll + zoom (used when toggling a single dim label).
const _origMvbpShow = window._mvbpShow;
window._mvbpShow = function(idx, opts) {
    opts = opts || {};
    const preserveView = !!opts.preserveView;
    const contentPre = document.getElementById('multiview-blueprint-content');
    const savedScroll = (preserveView && contentPre)
        ? { top: contentPre.scrollTop, left: contentPre.scrollLeft }
        : null;
    const savedScale = preserveView ? (window._mvbpScale || 1) : 1;

    _origMvbpShow(idx);
    const content = document.getElementById('multiview-blueprint-content');
    if (content) {
        const svg = content.querySelector('svg');
        if (svg) {
            // Ensure SVG fills its wrapper naturally
            svg.style.width = '100%';
            svg.style.height = 'auto';
            svg.style.display = 'block';
            // Wrap in a sizing div if not already
            let wrap = document.getElementById('mvbp-svg-wrap');
            if (!wrap) {
                wrap = document.createElement('div');
                wrap.id = 'mvbp-svg-wrap';
                svg.parentNode.insertBefore(wrap, svg);
            } else {
                wrap.innerHTML = '';
            }
            wrap.appendChild(svg);
        }
    }
    if (!preserveView) window._mvbpScale = 1.0;
    else window._mvbpScale = savedScale;

    function _mvbpFinishShow() {
        const content2 = document.getElementById('multiview-blueprint-content');
        if (content2) {
            window._mvbpBaseW = content2.clientWidth || content2.offsetWidth || 360;
            const wrap = document.getElementById('mvbp-svg-wrap');
            if (wrap) {
                const w = Math.round(window._mvbpBaseW * (window._mvbpScale || 1));
                wrap.style.width = w + 'px';
                wrap.style.flexShrink = '0';
            }
            if (savedScroll) {
                content2.scrollTop = savedScroll.top;
                content2.scrollLeft = savedScroll.left;
            }
        }
        window._mvbpBindGestures();
        if (typeof window._mvbpBindDimDrag === 'function') window._mvbpBindDimDrag();
        if (typeof window._mvbpBindCutoutDrag === 'function') window._mvbpBindCutoutDrag();
        if (typeof window._mvbpBindCutoutDimDrag === 'function') window._mvbpBindCutoutDimDrag();
        if (typeof window._mvbpBindCellDimDrag === 'function') window._mvbpBindCellDimDrag();
        if (typeof window._mvbpBindDimVisibilityClicks === 'function') window._mvbpBindDimVisibilityClicks();
        if (typeof window._mvbpSyncDimToggleButtons === 'function') window._mvbpSyncDimToggleButtons();
        if (typeof window._mvbpUpdateCutoutToolbar === 'function') window._mvbpUpdateCutoutToolbar();
        if (window._mvbpSelectedCutoutId && content2) {
            const svgSel = content2.querySelector('svg');
            if (svgSel) {
                const sel = svgSel.querySelector('.bp-cutout[data-cutout-id="' + window._mvbpSelectedCutoutId + '"]');
                if (sel) sel.classList.add('bp-cutout-selected');
            }
        }
        // Second frame: layout may still shift wrap width after zoom restore
        if (savedScroll && content2) {
            requestAnimationFrame(function() {
                content2.scrollTop = savedScroll.top;
                content2.scrollLeft = savedScroll.left;
            });
        }
    }
    requestAnimationFrame(_mvbpFinishShow);
};

// Bind pinch-to-zoom — native scroll handles pan automatically (overflow:auto)
window._mvbpBindGestures = function() {
    const content = document.getElementById('multiview-blueprint-content');
    if (!content || content._gestureBound) return;
    content._gestureBound = true;

    let startDist = 0, startScale = 1;

    content.addEventListener('touchstart', function(e) {
        if (e.touches.length === 2) {
            startDist = Math.hypot(
                e.touches[0].clientX - e.touches[1].clientX,
                e.touches[0].clientY - e.touches[1].clientY
            );
            startScale = window._mvbpScale;
            e.preventDefault();
        }
    }, { passive: false });

    content.addEventListener('touchmove', function(e) {
        if (e.touches.length === 2 && startDist > 0) {
            const dist = Math.hypot(
                e.touches[0].clientX - e.touches[1].clientX,
                e.touches[0].clientY - e.touches[1].clientY
            );
            window._mvbpScale = Math.max(0.5, Math.min(5.0, startScale * (dist / startDist)));
            window._mvbpApplyZoom();
            e.preventDefault();
        }
    }, { passive: false });

    content.addEventListener('touchend', function(e) {
        if (e.touches.length < 2) startDist = 0;
    }, { passive: true });
};

// ---- Blueprint dimension drag (move dim labels along constrained axis) ----
window._mvbpBindDimDrag = function() {
    const content = document.getElementById('multiview-blueprint-content');
    if (!content) return;
    const svg = content.querySelector('svg');
    if (!svg) return;

    function getSVGScale() {
        const vb = svg.viewBox.baseVal;
        const rect = svg.getBoundingClientRect();
        return vb.width > 0 ? rect.width / vb.width : 1;
    }

    function getTranslate(g) {
        const t = g.getAttribute('transform') || '';
        const m = t.match(/translate\(\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)/);
        return m ? { x: parseFloat(m[1]), y: parseFloat(m[2]) } : { x: 0, y: 0 };
    }

    function saveOffset(g) {
        const viewKey = g.getAttribute('data-view-key');
        const role = g.getAttribute('data-dim-role');
        if (!viewKey || !role) return;
        if (!state.blueprintDimOffsets) state.blueprintDimOffsets = {};
        const t = getTranslate(g);
        state.blueprintDimOffsets[viewKey + '|' + role] = { x: t.x, y: t.y };
        if (typeof saveHistoryState === 'function') saveHistoryState();
        if (state.editingCartIndex >= 0 && state.orderCart[state.editingCartIndex]) {
            const item = state.orderCart[state.editingCartIndex];
            if (item.rawState) {
                item.rawState.blueprintDimOffsets = JSON.parse(JSON.stringify(state.blueprintDimOffsets));
            }
        }
        const wrap = document.getElementById('mvbp-svg-wrap');
        const idx = window._mvbpIndex;
        if (wrap && window._mvbpPages[idx]) {
            const svgEl = wrap.querySelector('svg');
            if (svgEl) window._mvbpPages[idx].svg = svgEl.outerHTML;
        }
    }

    const dims = svg.querySelectorAll('.bp-dim-draggable');
    dims.forEach(function(g) {
        if (g._dimDragBound) return;
        g._dimDragBound = true;

        const axis = g.getAttribute('data-dim'); // 'h' = horizontal dim (drag Y), 'v' = vertical dim (drag X)
        let dragging = false;
        let startX = 0, startY = 0;
        let curTx = 0, curTy = 0;

        function onMouseDown(e) {
            if (e.button !== 0) return;
            dragging = true;
            startX = e.clientX;
            startY = e.clientY;
            const t = getTranslate(g);
            curTx = t.x; curTy = t.y;
            e.preventDefault();
            e.stopPropagation();
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        }

        function onMouseMove(e) {
            if (!dragging) return;
            const sc = getSVGScale();
            const dx = (e.clientX - startX) / sc;
            const dy = (e.clientY - startY) / sc;
            let tx = curTx, ty = curTy;
            if (axis === 'h') {
                ty = curTy + dy; // horizontal dim: move up/down only
            } else {
                tx = curTx + dx; // vertical dim: move left/right only
            }
            g.setAttribute('transform', `translate(${tx.toFixed(1)},${ty.toFixed(1)})`);
        }

        function onMouseUp() {
            if (!dragging) return;
            dragging = false;
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            saveOffset(g);
        }

        // Touch support
        function onTouchStart(e) {
            if (e.touches.length !== 1) return;
            dragging = true;
            startX = e.touches[0].clientX;
            startY = e.touches[0].clientY;
            const t = getTranslate(g);
            curTx = t.x; curTy = t.y;
            e.stopPropagation();
        }

        function onTouchMove(e) {
            if (!dragging || e.touches.length !== 1) return;
            const sc = getSVGScale();
            const dx = (e.touches[0].clientX - startX) / sc;
            const dy = (e.touches[0].clientY - startY) / sc;
            let tx = curTx, ty = curTy;
            if (axis === 'h') {
                ty = curTy + dy;
            } else {
                tx = curTx + dx;
            }
            g.setAttribute('transform', `translate(${tx.toFixed(1)},${ty.toFixed(1)})`);
            e.preventDefault();
        }

        function onTouchEnd() {
            if (!dragging) return;
            dragging = false;
            saveOffset(g);
        }

        g.addEventListener('mousedown', onMouseDown);
        g.addEventListener('touchstart', onTouchStart, { passive: true });
        g.addEventListener('touchmove', onTouchMove, { passive: false });
        g.addEventListener('touchend', onTouchEnd, { passive: true });
    });
};

// ---- Blueprint cutout dimension drag (move dim lines along constrained axis) ----
window._mvbpBindCutoutDimDrag = function() {
    const content = document.getElementById('multiview-blueprint-content');
    if (!content) return;
    const svg = content.querySelector('svg');
    if (!svg) return;

    function getSVGScale() {
        const vb = svg.viewBox.baseVal;
        const rect = svg.getBoundingClientRect();
        return vb.width > 0 ? rect.width / vb.width : 1;
    }

    function getTranslate(g) {
        const t = g.getAttribute('transform') || '';
        const m = t.match(/translate\(\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)/);
        return m ? { x: parseFloat(m[1]), y: parseFloat(m[2]) } : { x: 0, y: 0 };
    }

    function saveOffset(g) {
        const dimsG = g.closest('.bp-cutout-dims');
        const cutoutId = dimsG ? dimsG.getAttribute('data-cutout-id') : null;
        const role = g.getAttribute('data-dim-role');
        if (!cutoutId || !role) return;
        const co = (state.blueprintCutouts || []).find(function(c) { return c.id === cutoutId; });
        if (!co) return;
        if (!co.dimOffsets) co.dimOffsets = {};
        const t = getTranslate(g);
        co.dimOffsets[role] = { x: t.x, y: t.y };
        if (typeof saveHistoryState === 'function') saveHistoryState();
        const wrap = document.getElementById('mvbp-svg-wrap');
        const idx = window._mvbpIndex;
        if (wrap && window._mvbpPages[idx]) {
            const svgEl = wrap.querySelector('svg');
            if (svgEl) window._mvbpPages[idx].svg = svgEl.outerHTML;
        }
    }

    svg.querySelectorAll('.bp-cutout-dim-draggable').forEach(function(g) {
        if (g._cutoutDimDragBound) return;
        g._cutoutDimDragBound = true;

        const axis = g.getAttribute('data-dim');
        let dragging = false;
        let startX = 0, startY = 0, curTx = 0, curTy = 0;

        function onMouseDown(e) {
            if (e.button !== 0) return;
            dragging = true;
            startX = e.clientX;
            startY = e.clientY;
            const t = getTranslate(g);
            curTx = t.x;
            curTy = t.y;
            e.preventDefault();
            e.stopPropagation();
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        }

        function applyDrag(clientX, clientY) {
            const sc = getSVGScale();
            const dx = (clientX - startX) / sc;
            const dy = (clientY - startY) / sc;
            let tx = curTx, ty = curTy;
            if (axis === 'h') ty = curTy + dy;
            else tx = curTx + dx;
            g.setAttribute('transform', 'translate(' + tx.toFixed(1) + ',' + ty.toFixed(1) + ')');
        }

        function onMouseMove(e) {
            if (!dragging) return;
            applyDrag(e.clientX, e.clientY);
        }

        function onMouseUp() {
            if (!dragging) return;
            dragging = false;
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            saveOffset(g);
        }

        function onTouchStart(e) {
            if (e.touches.length !== 1) return;
            dragging = true;
            startX = e.touches[0].clientX;
            startY = e.touches[0].clientY;
            const t = getTranslate(g);
            curTx = t.x;
            curTy = t.y;
            e.stopPropagation();
        }

        function onTouchMove(e) {
            if (!dragging || e.touches.length !== 1) return;
            applyDrag(e.touches[0].clientX, e.touches[0].clientY);
            e.preventDefault();
        }

        function onTouchEnd() {
            if (!dragging) return;
            dragging = false;
            saveOffset(g);
        }

        g.addEventListener('mousedown', onMouseDown);
        g.addEventListener('touchstart', onTouchStart, { passive: true });
        g.addEventListener('touchmove', onTouchMove, { passive: false });
        g.addEventListener('touchend', onTouchEnd, { passive: true });
    });
};

// ---- Blueprint in-cell height label drag ----
window._mvbpSyncDimToggleButtons = function() {
    const cellBtn = document.getElementById('mvbp-toggle-cell-dims');
    const colBtn = document.getElementById('mvbp-toggle-col-widths');
    const heightBtn = document.getElementById('mvbp-toggle-height-dims');
    const cellShow = state.blueprintInternalDimsDefault !== false;
    const colShow = state.blueprintColWidthDimsDefault !== false;
    const heightShow = state.blueprintHeightDimsDefault !== false;
    if (cellBtn) {
        cellBtn.innerHTML = cellShow
            ? '<i class="fa-solid fa-eye-slash"></i> הסתר מידות פנימיות'
            : '<i class="fa-solid fa-eye"></i> הצג מידות פנימיות';
        cellBtn.style.background = cellShow ? '#fff' : '#e0f2fe';
    }
    if (colBtn) {
        colBtn.innerHTML = colShow
            ? '<i class="fa-solid fa-eye-slash"></i> הסתר רוחב עמודות'
            : '<i class="fa-solid fa-eye"></i> הצג רוחב עמודות';
        colBtn.style.background = colShow ? '#fff' : '#e0f2fe';
    }
    if (heightBtn) {
        heightBtn.innerHTML = heightShow
            ? '<i class="fa-solid fa-eye-slash"></i> הסתר מידות גובה'
            : '<i class="fa-solid fa-eye"></i> הצג מידות גובה';
        heightBtn.style.background = heightShow ? '#fff' : '#e0f2fe';
    }
};

function _mvbpRegenAfterDimToggle() {
    // Blur before DOM swap — removing a focused/clicked node scrolls the container to top
    try {
        if (document.activeElement && typeof document.activeElement.blur === 'function') {
            document.activeElement.blur();
        }
    } catch (e) { /* ignore */ }
    if (typeof saveHistoryState === 'function') saveHistoryState();
    const idx = window._mvbpIndex || 0;
    if (typeof window._generateMultiViewBlueprintPages === 'function') {
        window._mvbpPages = window._generateMultiViewBlueprintPages();
    }
    if (typeof window._mvbpShow === 'function') window._mvbpShow(idx, { preserveView: true });
    else if (typeof window._mvbpSyncDimToggleButtons === 'function') window._mvbpSyncDimToggleButtons();
}

window._mvbpToggleInternalDims = function() {
    state.blueprintInternalDimsDefault = !(state.blueprintInternalDimsDefault !== false);
    state.blueprintCellDimShown = {};
    _mvbpRegenAfterDimToggle();
};

window._mvbpToggleColWidthDims = function() {
    state.blueprintColWidthDimsDefault = !(state.blueprintColWidthDimsDefault !== false);
    state.blueprintColWidthDimShown = {};
    _mvbpRegenAfterDimToggle();
};

window._mvbpToggleHeightDims = function() {
    state.blueprintHeightDimsDefault = !(state.blueprintHeightDimsDefault !== false);
    _mvbpRegenAfterDimToggle();
};

window._mvbpBindDimVisibilityClicks = function() {
    const content = document.getElementById('multiview-blueprint-content');
    const svg = content && content.querySelector('svg');
    if (!svg) return;

    function _isShown(map, defaultFlag, key) {
        if (Object.prototype.hasOwnProperty.call(map || {}, key)) return !!map[key];
        return defaultFlag !== false;
    }

    function _bindToggleHit(el, onToggle) {
        if (el._bpDimToggleBound) return;
        el._bpDimToggleBound = true;
        // mousedown: stop browser scroll-into-view when the hit node is about to be removed
        el.addEventListener('mousedown', function(e) {
            if (e.button !== 0) return;
            e.preventDefault();
            e.stopPropagation();
        });
        el.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            onToggle();
        });
    }

    svg.querySelectorAll('.bp-cell-dim-toggle-hit').forEach(function(el) {
        _bindToggleHit(el, function() {
            const viewKey = el.getAttribute('data-view-key') || 'center';
            const cellKey = el.getAttribute('data-cell-dim-key');
            if (!cellKey) return;
            const k = viewKey + '|' + cellKey;
            if (!state.blueprintCellDimShown) state.blueprintCellDimShown = {};
            const currently = _isShown(state.blueprintCellDimShown, state.blueprintInternalDimsDefault, k);
            state.blueprintCellDimShown[k] = !currently;
            _mvbpRegenAfterDimToggle();
        });
    });

    svg.querySelectorAll('.bp-col-width-toggle-hit').forEach(function(el) {
        _bindToggleHit(el, function() {
            const viewKey = el.getAttribute('data-view-key') || 'center';
            const colKey = el.getAttribute('data-col-dim-key');
            if (!colKey) return;
            const k = viewKey + '|' + colKey;
            if (!state.blueprintColWidthDimShown) state.blueprintColWidthDimShown = {};
            const currently = _isShown(state.blueprintColWidthDimShown, state.blueprintColWidthDimsDefault, k);
            state.blueprintColWidthDimShown[k] = !currently;
            _mvbpRegenAfterDimToggle();
        });
    });
};

window._mvbpBindCellDimDrag = function() {
    const content = document.getElementById('multiview-blueprint-content');
    if (!content) return;
    const svg = content.querySelector('svg');
    if (!svg) return;

    function getSVGScale() {
        const vb = svg.viewBox.baseVal;
        const rect = svg.getBoundingClientRect();
        return vb.width > 0 ? rect.width / vb.width : 1;
    }

    function getTranslate(g) {
        const t = g.getAttribute('transform') || '';
        const m = t.match(/translate\(\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)/);
        return m ? { x: parseFloat(m[1]), y: parseFloat(m[2]) } : { x: 0, y: 0 };
    }

    function saveOffset(g) {
        const viewKey = g.getAttribute('data-view-key');
        const cellKey = g.getAttribute('data-cell-dim-key');
        if (!viewKey || !cellKey) return;
        if (!state.blueprintCellDimOffsets) state.blueprintCellDimOffsets = {};
        const t = getTranslate(g);
        state.blueprintCellDimOffsets[viewKey + '|' + cellKey] = { x: t.x, y: t.y };
        if (typeof saveHistoryState === 'function') saveHistoryState();
        const wrap = document.getElementById('mvbp-svg-wrap');
        const idx = window._mvbpIndex;
        if (wrap && window._mvbpPages[idx]) {
            const svgEl = wrap.querySelector('svg');
            if (svgEl) window._mvbpPages[idx].svg = svgEl.outerHTML;
        }
    }

    svg.querySelectorAll('.bp-cell-dim-draggable').forEach(function(g) {
        if (g._cellDimDragBound) return;
        g._cellDimDragBound = true;

        const axis = g.getAttribute('data-dim') || 'v';
        let dragging = false;
        let startX = 0, startY = 0, curTx = 0, curTy = 0;

        function onMouseDown(e) {
            if (e.button !== 0) return;
            dragging = true;
            startX = e.clientX;
            startY = e.clientY;
            const t = getTranslate(g);
            curTx = t.x;
            curTy = t.y;
            e.preventDefault();
            e.stopPropagation();
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        }

        function applyDrag(clientX, clientY) {
            const sc = getSVGScale();
            const dx = (clientX - startX) / sc;
            const dy = (clientY - startY) / sc;
            let tx = curTx, ty = curTy;
            if (axis === 'h') ty = curTy + dy;
            else tx = curTx + dx;
            g.setAttribute('transform', 'translate(' + tx.toFixed(1) + ',' + ty.toFixed(1) + ')');
        }

        function onMouseMove(e) {
            if (!dragging) return;
            applyDrag(e.clientX, e.clientY);
        }

        function onMouseUp() {
            if (!dragging) return;
            dragging = false;
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            saveOffset(g);
        }

        function onTouchStart(e) {
            if (e.touches.length !== 1) return;
            dragging = true;
            startX = e.touches[0].clientX;
            startY = e.touches[0].clientY;
            const t = getTranslate(g);
            curTx = t.x;
            curTy = t.y;
            e.stopPropagation();
        }

        function onTouchMove(e) {
            if (!dragging || e.touches.length !== 1) return;
            applyDrag(e.touches[0].clientX, e.touches[0].clientY);
            e.preventDefault();
        }

        function onTouchEnd() {
            if (!dragging) return;
            dragging = false;
            saveOffset(g);
        }

        g.addEventListener('mousedown', onMouseDown);
        g.addEventListener('touchstart', onTouchStart, { passive: true });
        g.addEventListener('touchmove', onTouchMove, { passive: false });
        g.addEventListener('touchend', onTouchEnd, { passive: true });
    });
};

// ---- Blueprint cutout markers (outlets / switches) ----
window._mvbpSelectedCutoutId = null;

window._mvbpUpdateCutoutToolbar = function() {
    const bar = document.getElementById('mvbp-cutout-toolbar');
    if (!bar) return;
    const pg = (window._mvbpPages || [])[window._mvbpIndex];
    bar.style.display = (pg && pg.viewKey) ? 'flex' : 'none';
    window._mvbpSyncCutoutLabelField();
};

window._mvbpSyncCutoutLabelField = function() {
    window._mvbpSyncCutoutFields();
};

window._mvbpSyncCutoutFields = function() {
    const co = (state.blueprintCutouts || []).find(function(c) { return c.id === window._mvbpSelectedCutoutId; });
    const lblInp = document.getElementById('mvbp-cut-label');
    const leftInp = document.getElementById('mvbp-cut-left');
    const bottomInp = document.getElementById('mvbp-cut-bottom');
    if (lblInp) lblInp.value = co ? (co.label || '') : '';
    if (leftInp) {
        leftInp.disabled = !co;
        leftInp.value = co ? co.leftMm : '';
    }
    if (bottomInp) {
        bottomInp.disabled = !co;
        bottomInp.value = co ? co.bottomMm : '';
    }
};

window._mvbpApplyCutoutPosition = function() {
    const id = window._mvbpSelectedCutoutId;
    if (!id) {
        if (typeof _showToast === 'function') _showToast('בחר פתח בשרטוט לעדכון המיקום', 2500);
        return;
    }
    const co = (state.blueprintCutouts || []).find(function(c) { return c.id === id; });
    if (!co) return;
    const pg = (window._mvbpPages || [])[window._mvbpIndex];
    if (!pg) return;
    const cabWMm = Math.round((pg.cabWidthCm || 160) * 10);
    const cabHMm = Math.round((pg.cabHeightCm || 240) * 10);
    const wMm = co.widthMm || 80;
    const hMm = co.heightMm || 120;
    const leftInp = document.getElementById('mvbp-cut-left');
    const bottomInp = document.getElementById('mvbp-cut-bottom');
    co.leftMm = Math.max(0, Math.min(cabWMm - wMm, parseInt(leftInp && leftInp.value, 10) || 0));
    co.bottomMm = Math.max(0, Math.min(cabHMm - hMm, parseInt(bottomInp && bottomInp.value, 10) || 0));
    window._mvbpSyncCutoutFields();
    if (typeof saveHistoryState === 'function') saveHistoryState();
    window._mvbpRegenerateAndShow();
};

window._mvbpApplyCutoutLabel = function() {
    const id = window._mvbpSelectedCutoutId;
    if (!id) {
        if (typeof _showToast === 'function') _showToast('בחר פתח בשרטוט לעדכון התיאור', 2500);
        return;
    }
    const co = (state.blueprintCutouts || []).find(function(c) { return c.id === id; });
    if (!co) return;
    const inp = document.getElementById('mvbp-cut-label');
    co.label = inp ? String(inp.value || '').trim().slice(0, 24) : '';
    if (typeof saveHistoryState === 'function') saveHistoryState();
    window._mvbpRegenerateAndShow();
};

window._mvbpRegenerateAndShow = function() {
    const idx = window._mvbpIndex;
    if (typeof window._generateMultiViewBlueprintPages !== 'function') return;
    window._mvbpPages = window._generateMultiViewBlueprintPages();
    window._mvbpShow(idx);
};

window._mvbpAddCutout = function() {
    const pg = (window._mvbpPages || [])[window._mvbpIndex];
    if (!pg || !pg.viewKey) {
        if (typeof _showToast === 'function') _showToast('ניתן להוסיף חיתוך רק בשרטוטי חזית', 3000);
        return;
    }
    const wInp = document.getElementById('mvbp-cut-w');
    const hInp = document.getElementById('mvbp-cut-h');
    const lblInp = document.getElementById('mvbp-cut-label');
    const cabWMm = Math.round((pg.cabWidthCm || 160) * 10);
    const cabHMm = Math.round((pg.cabHeightCm || 240) * 10);
    // No artificial max — only keep a small minimum and fit within the cabinet face
    const widthMm = Math.max(10, Math.min(cabWMm, parseInt(wInp && wInp.value, 10) || 80));
    const heightMm = Math.max(10, Math.min(cabHMm, parseInt(hInp && hInp.value, 10) || 120));
    const label = lblInp ? String(lblInp.value || '').trim().slice(0, 24) : '';
    if (!state.blueprintCutouts) state.blueprintCutouts = [];
    const co = {
        id: 'bc-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
        viewKey: pg.viewKey,
        widthMm: widthMm,
        heightMm: heightMm,
        leftMm: Math.max(0, Math.round((cabWMm - widthMm) / 2)),
        bottomMm: Math.max(0, cabHMm - heightMm),
        label: label
    };
    state.blueprintCutouts.push(co);
    window._mvbpSelectedCutoutId = co.id;
    if (typeof saveHistoryState === 'function') saveHistoryState();
    window._mvbpRegenerateAndShow();
};

window._mvbpDeleteSelectedCutout = function() {
    const id = window._mvbpSelectedCutoutId;
    if (!id || !state.blueprintCutouts) return;
    state.blueprintCutouts = state.blueprintCutouts.filter(function(c) { return c.id !== id; });
    window._mvbpSelectedCutoutId = null;
    if (typeof saveHistoryState === 'function') saveHistoryState();
    window._mvbpRegenerateAndShow();
};

window._mvbpBindCutoutDrag = function() {
    const content = document.getElementById('multiview-blueprint-content');
    if (!content || content._cutoutDragBound) return;
    content._cutoutDragBound = true;

    let drag = null;

    function svgScale(svg) {
        const vb = svg.viewBox.baseVal;
        const rect = svg.getBoundingClientRect();
        return vb.width > 0 ? rect.width / vb.width : 1;
    }

    function readMeta(g) {
        return {
            id: g.getAttribute('data-cutout-id'),
            ox: parseFloat(g.getAttribute('data-ox')),
            oy: parseFloat(g.getAttribute('data-oy')),
            dW: parseFloat(g.getAttribute('data-dw')),
            dH: parseFloat(g.getAttribute('data-dh')),
            sc: parseFloat(g.getAttribute('data-sc')),
            cabWMm: parseInt(g.getAttribute('data-cab-w-mm'), 10),
            cabHMm: parseInt(g.getAttribute('data-cab-h-mm'), 10),
            wMm: parseInt(g.getAttribute('data-w-mm'), 10),
            hMm: parseInt(g.getAttribute('data-h-mm'), 10)
        };
    }

    function selectCutout(svg, id) {
        window._mvbpSelectedCutoutId = id;
        svg.querySelectorAll('.bp-cutout').forEach(function(el) { el.classList.remove('bp-cutout-selected'); });
        const g = svg.querySelector('.bp-cutout[data-cutout-id="' + id + '"]');
        if (g) g.classList.add('bp-cutout-selected');
        window._mvbpSyncCutoutLabelField();
    }

    function getCo(id) {
        return (state.blueprintCutouts || []).find(function(c) { return c.id === id; });
    }

    function applyDrag(clientX, clientY) {
        if (!drag) return;
        const co = getCo(drag.id);
        if (!co) return;
        const scPx = svgScale(drag.svg);
        const dx = (clientX - drag.startX) / scPx;
        const dy = (clientY - drag.startY) / scPx;
        const deltaLeftMm = Math.round((dx / drag.sc) * 10);
        const deltaBottomMm = Math.round(-(dy / drag.sc) * 10);
        co.leftMm = Math.max(0, Math.min(drag.cabWMm - drag.wMm, drag.startLeft + deltaLeftMm));
        co.bottomMm = Math.max(0, Math.min(drag.cabHMm - drag.hMm, drag.startBottom + deltaBottomMm));
        if (typeof window._bpReplaceCutoutInSvg === 'function') {
            window._bpReplaceCutoutInSvg(drag.svg, co, drag.ox, drag.oy, drag.dW, drag.dH, drag.sc, drag.cabWMm / 10, drag.cabHMm / 10);
            const newG = drag.svg.querySelector('.bp-cutout[data-cutout-id="' + drag.id + '"]');
            if (newG) newG.classList.add('bp-cutout-selected');
        }
        window._mvbpSyncCutoutFields();
    }

    function endDrag() {
        if (!drag) return;
        if (typeof saveHistoryState === 'function') saveHistoryState();
        const wrap = document.getElementById('mvbp-svg-wrap');
        const idx = window._mvbpIndex;
        if (wrap && window._mvbpPages[idx]) {
            const svg = wrap.querySelector('svg');
            if (svg) window._mvbpPages[idx].svg = svg.outerHTML;
        }
        if (typeof window._mvbpBindCutoutDimDrag === 'function') window._mvbpBindCutoutDimDrag();
        drag = null;
    }

    function startDrag(g, clientX, clientY) {
        const svg = content.querySelector('svg');
        if (!svg) return;
        const m = readMeta(g);
        const co = getCo(m.id);
        if (!co) return;
        selectCutout(svg, m.id);
        drag = {
            svg: svg,
            id: m.id,
            startX: clientX,
            startY: clientY,
            startLeft: co.leftMm,
            startBottom: co.bottomMm,
            ox: m.ox, oy: m.oy, dW: m.dW, dH: m.dH, sc: m.sc,
            cabWMm: m.cabWMm, cabHMm: m.cabHMm, wMm: m.wMm, hMm: m.hMm
        };
    }

    content.addEventListener('mousedown', function(e) {
        const g = e.target.closest && e.target.closest('.bp-cutout');
        if (!g || !content.contains(g)) return;
        if (e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        startDrag(g, e.clientX, e.clientY);
        document.addEventListener('mousemove', onDocMove);
        document.addEventListener('mouseup', onDocUp);
    });

    function onDocMove(e) { applyDrag(e.clientX, e.clientY); }
    function onDocUp() {
        document.removeEventListener('mousemove', onDocMove);
        document.removeEventListener('mouseup', onDocUp);
        endDrag();
    }

    content.addEventListener('touchstart', function(e) {
        const g = e.target.closest && e.target.closest('.bp-cutout');
        if (!g || !content.contains(g) || e.touches.length !== 1) return;
        e.stopPropagation();
        startDrag(g, e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: true });

    content.addEventListener('touchmove', function(e) {
        if (!drag || e.touches.length !== 1) return;
        applyDrag(e.touches[0].clientX, e.touches[0].clientY);
        e.preventDefault();
    }, { passive: false });

    content.addEventListener('touchend', function() { endDrag(); }, { passive: true });

    const lblInp = document.getElementById('mvbp-cut-label');
    if (lblInp && !lblInp._cutoutLabelBound) {
        lblInp._cutoutLabelBound = true;
        lblInp.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') window._mvbpApplyCutoutLabel();
        });
    }

    ['mvbp-cut-left', 'mvbp-cut-bottom'].forEach(function(id) {
        const inp = document.getElementById(id);
        if (!inp || inp._cutoutPosBound) return;
        inp._cutoutPosBound = true;
        inp.addEventListener('change', function() { window._mvbpApplyCutoutPosition(); });
        inp.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') window._mvbpApplyCutoutPosition();
        });
    });
};

// ---- Blueprint fullscreen (no orientation lock) ----
window._mvbpToggleFullscreen = function() {
    const modal = document.getElementById('multiview-blueprint-modal');
    if (!modal) return;
    const inner = modal.querySelector('div');
    const btn = document.getElementById('mvbp-fullscreen-btn');
    const isFs = document.fullscreenElement || document.webkitFullscreenElement;
    if (!isFs) {
        const el = modal;
        if (el.requestFullscreen) el.requestFullscreen().catch(function(){});
        else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
        if (btn) btn.innerHTML = '<i class="fa-solid fa-compress"></i>';
        if (inner) { inner.style.maxWidth='100vw'; inner.style.maxHeight='100vh'; inner.style.width='100vw'; inner.style.borderRadius='0'; }
    } else {
        if (document.exitFullscreen) document.exitFullscreen();
        else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
        if (btn) btn.innerHTML = '<i class="fa-solid fa-expand"></i>';
        if (inner) { inner.style.maxWidth='95vw'; inner.style.maxHeight='100vh'; inner.style.width='92vw'; inner.style.borderRadius='14px'; }
    }
};

// Restore button on Esc
document.addEventListener('fullscreenchange', function() {
    const btn = document.getElementById('mvbp-fullscreen-btn');
    const inner = document.querySelector('#multiview-blueprint-modal > div');
    if (!document.fullscreenElement && !document.webkitFullscreenElement) {
        if (btn) btn.innerHTML = '<i class="fa-solid fa-expand"></i>';
        if (inner) { inner.style.maxWidth='95vw'; inner.style.maxHeight='100vh'; inner.style.width='92vw'; inner.style.borderRadius='14px'; }
    }
});

window.openMultiViewBlueprint = function() {
    // Feature gate: blueprint export requires canExportCarpenter
    if (window._features && !window._features.canExportCarpenter) {
        _showToast('ייצוא שרטוט ייצור אינו זמין בתוכנית הנוכחית שלך. שדרג לתוכנית מקצועית.', 5000);
        return;
    }
    if (typeof window._generateMultiViewBlueprintPages !== 'function') {
        alert('פונקציית השרטוט אינה זמינה');
        return;
    }
    window._mvbpScale = 1.0;
    window._mvbpPages = window._generateMultiViewBlueprintPages();
    window._mvbpIndex = 0;
    window._mvbpShow(0);
    const modal = document.getElementById('multiview-blueprint-modal');
    if (modal) modal.style.display = 'flex';
};

window._downloadMultiViewSVG = function() {
    // Download all pages as separate SVG files (or just current page)
    const pages = window._mvbpPages;
    if (!pages || !pages.length) {
        // Fallback: generate fresh
        if (typeof window._generateMultiViewBlueprintPages === 'function') {
            window._mvbpPages = window._generateMultiViewBlueprintPages();
        } else if (typeof window._generateMultiViewBlueprintSVG === 'function') {
            const svgStr = window._generateMultiViewBlueprintSVG();
            const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = 'שרטוט-מרובה-זוויות.svg';
            document.body.appendChild(a); a.click();
            document.body.removeChild(a); URL.revokeObjectURL(url);
            return;
        }
    }
    // Download each page as a separate SVG
    (window._mvbpPages || []).forEach((pg, i) => {
        const blob = new Blob([pg.svg], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `שרטוט-${i+1}-${pg.label.replace(/[^א-תa-zA-Z0-9]/g,'-')}.svg`;
        document.body.appendChild(a); a.click();
        document.body.removeChild(a); URL.revokeObjectURL(url);
    });
};

window._printMultiViewSVG = function() {
    const pages = window._mvbpPages && window._mvbpPages.length
        ? window._mvbpPages
        : (typeof window._generateMultiViewBlueprintPages === 'function' ? window._generateMultiViewBlueprintPages() : null);
    if (!pages || !pages.length) return;
    const notes = (typeof state !== 'undefined' && state.cabinetNotes) ? String(state.cabinetNotes).trim() : '';
    const notesHeader = notes
        ? `<div style="padding:10px 14px;margin-bottom:10px;background:#fef9c3;border:1px solid #fde047;border-radius:8px;font-size:0.92rem;line-height:1.55;"><strong>הערות:</strong> ${_escPrintHtml(notes)}</div>`
        : '';
    // Each page gets its own print page via page-break-after
    const pagesHtml = pages.map((pg, i) =>
        `<div class="bp-page"${i === pages.length - 1 ? ' style="page-break-after:avoid"' : ''}>${i === 0 ? notesHeader : ''}${pg.svg}</div>`
    ).join('');
    const win = window.open('', '_blank', 'width=1300,height=1000');
    win.document.write(`<!DOCTYPE html><html lang="he" dir="rtl"><head><meta charset="UTF-8"><title>שרטוט מרובה זוויות</title>
<style>
* { margin:0; padding:0; box-sizing:border-box; }
body { background:white; }
.bp-page { display:flex; align-items:center; justify-content:center; width:100%; page-break-after:always; padding:10mm 0; }
.bp-page svg { max-width:100%; height:auto; }
@media print { @page { size: A3 landscape; margin: 8mm; } .bp-page { padding:0; } }
</style></head>
<body>${pagesHtml}${_trialWmHtml()}</body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); }, 500);
};

// ==========================================
// 7b. סיכום ללקוח (Customer Summary Print)
// ==========================================
// Helper: build customer-facing detail lines for summary print / Excel
function _summarySpecOrRaw(item, rawState, specKey, rawKey) {
    if (rawKey === 'materialOpenCell' && rawState && rawState.wings) {
        return _resolveOpenCellColorLabel(rawState.wings, rawState.materialOpenCell);
    }
    if (item[specKey] && item[specKey] !== 'ברירת מחדל') return item[specKey];
    if (!rawState) return (item[specKey] && item[specKey] !== 'ברירת מחדל') ? item[specKey] : null;
    if (rawState.wings) {
        const wing = rawState.wings[rawState.activeWing || 'center'] || rawState.wings.center;
        if (wing && wing[rawKey]) return _colorKeyLabel(wing[rawKey]);
    }
    if (!rawState[rawKey]) return (item[specKey] && item[specKey] !== 'ברירת מחדל') ? item[specKey] : null;
    return _colorKeyLabel(rawState[rawKey]);
}

function _buildCustomerSummaryDetails(itemObj) {
    const item = itemObj.spec;
    const rawState = itemObj.rawState || null;
    const isWD = _cartIsWritingDesk(itemObj);
    const content = rawState ? _countCabinetContentFromRawState(rawState) : _emptyContentCounts();
    const details = [];

    const modelName = _resolvePrintModelName(item, itemObj);
    if (modelName) details.push((isWD ? 'סוג מוצר: ' : 'דגם ארון: ') + modelName);
    _customerSummaryDimsLines(item, rawState).forEach(function(line) { details.push(line); });
    if (item.material) details.push('חומר גוף: ' + item.material);

    const colorBody = _summarySpecOrRaw(item, rawState, 'colorBody', 'materialBody');
    if (isWD) {
        if (colorBody) details.push('צבע גוף (רגליים ומשטח): ' + colorBody);
        const colorDrawers = item.colorDrawers || _summarySpecOrRaw(item, rawState, 'colorDrawers', 'materialExternal');
        if (colorDrawers) details.push('צבע מגירות: ' + colorDrawers);
        if (item.extraColors) details.push('צבעים נוספים: ' + item.extraColors);
        if (item.writingDeskHasDrawers !== false) {
            if (item.handle) details.push('סוג ידיות למגירות: ' + item.handle);
            const n = item.writingDeskDrawerCount != null ? item.writingDeskDrawerCount : (item.drawersExt || 0);
            if (n > 0) details.push('מספר מגירות: ' + n);
            if (item.writingDeskDrawerHeight) details.push('גובה מגירה: ' + item.writingDeskDrawerHeight + ' ס"מ');
        } else {
            details.push('מגירות: ללא');
        }
        if (item.cabinetNotes && item.cabinetNotes.trim()) {
            details.push('הערות: ' + item.cabinetNotes.trim());
        }
        return details;
    }

    const colorInternal = _summarySpecOrRaw(item, rawState, 'colorInternal', 'materialInternal');
    const colorExternal = _summarySpecOrRaw(item, rawState, 'colorExternal', 'materialExternal');
    const colorBack = _summarySpecOrRaw(item, rawState, 'colorBack', 'materialBack');
    const colorDesk = _summarySpecOrRaw(item, rawState, 'colorDesk', 'materialDesk');
    const colorOpenCell = _summarySpecOrRaw(item, rawState, 'colorOpenCell', 'materialOpenCell');

    if (colorBody) details.push('צבע גוף וצוקל: ' + colorBody);
    if (colorInternal) details.push('צבע פנים (מדפים/מגירות): ' + colorInternal);
    if (colorExternal) details.push('צבע חזיתות (דלתות): ' + colorExternal);
    if (colorBack && colorBack !== 'undefined') details.push('צבע גב ארון: ' + colorBack);
    const deskSummary = _formatDeskAddition(item, itemObj);
    if (deskSummary.desk !== 'ללא' && colorDesk) details.push('צבע שולחן עבודה: ' + colorDesk);

    if (content.openCells > 0) {
        details.push('כוורת פתוחה: ' + content.openCells + (content.openCells === 1 ? ' תא' : ' תאים'));
    }
    if (content.sideOpenCells > 0) {
        details.push('כוורת צד: ' + content.sideOpenCells + (content.sideOpenCells === 1 ? ' תא' : ' תאים'));
    }
    if ((content.openCells + content.sideOpenCells) > 0 && colorOpenCell) {
        details.push('צבע כוורת: ' + colorOpenCell);
    }
    const glassTint = _resolveGlassTintLabel(rawState);
    if (glassTint) details.push('גוון זכוכית: ' + glassTint);
    const colorTopPanel = _resolveTopPanelColorLabel(rawState);
    if (colorTopPanel) details.push('צבע משטח עליון: ' + colorTopPanel);
    if (item.extraColors) details.push('צבעים נוספים: ' + item.extraColors);

    if (item.slidingDoor) {
        details.push('ארון הזזה — ' + item.slidingDoor.numDoors + ' דלתות | פרופיל: ' + item.slidingDoor.profileColor);
        details.push(item.slidingDoor.doorColorsStr);
        if (item.slidingDoor.hasMirror) details.push('✓ כולל דלת מראה');
    } else if (item.handle) {
        details.push('סוג ידיות: ' + item.handle);
    } else if (rawState && rawState.handleStyle) {
        details.push('סוג ידיות: ' + window._handleStyleLabel(rawState.handleStyle, rawState.handleVariant, rawState.handleType, rawState.ridingColor));
    }

    if (item.drawersExt > 0) details.push('מגירות חיצוניות: ' + item.drawersExt);
    if (item.drawersInt > 0) details.push('מגירות פנימיות: ' + item.drawersInt);
    const ledPairs = _countLedPairsFromRawState(rawState);
    if (ledPairs > 0) details.push('תאורת לד: ' + _formatLedPairs(ledPairs));
    if (deskSummary.desk !== 'ללא') {
        details.push(deskSummary.desk);
        if (deskSummary.deskDims) details.push('מידות שולחן: ' + deskSummary.deskDims);
    }
    const cu = _cornerUnitFromSources(item, itemObj);
    if (cu && cu.side !== 'none' && cu.type !== 'desk') {
        const cuSide = cu.side === 'right' ? 'ימין' : 'שמאל';
        details.push('יחידה פינתית מגירות ×' + (cu.drawerCount || 4) + ' (' + cuSide + ')');
    }
    if (item.cabinetNotes && item.cabinetNotes.trim()) {
        details.push('הערות: ' + item.cabinetNotes.trim());
    }

    return details;
}

// Helper: build cart data array for reuse in HTML + Excel
function _buildCartData() {
    const rows = [];
    state.orderCart.forEach((itemObj, index) => {
        if (typeof window._cartItemOnHold === 'function' && window._cartItemOnHold(itemObj)) return;
        const item = itemObj.spec;
        const title = item.customName ? item.customName : (_cartIsWritingDesk(itemObj) ? `שולחן מס' ${index + 1}` : `ארון מס' ${index + 1}`);
        const cabPrice = parseInt((item.price || '0').replace('₪','').replace(/,/g,'')) || 0;
        const instPrice = item.installPrice || 0;
        const costPrice = item.costPrice ? (parseInt(item.costPrice.replace('₪','').replace(/,/g,'')) || 0) : 0;
        const totalRevenue = cabPrice + instPrice;
        const profit = totalRevenue - costPrice;
        const profitPct = costPrice > 0 ? Math.round((profit / totalRevenue) * 100) : 0;

        rows.push({
            title,
            details: _buildCustomerSummaryDetails(itemObj).join(' | '),
            cabPrice,
            instPrice,
            costPrice,
            totalRevenue,
            profit,
            profitPct
        });
    });
    return rows;
}

function _buildCustomerSummaryHTML(logoDataUrl) {
    const custName  = state.customer?.name    || 'לא צוין';
    const custPhone = state.customer?.phone   || '';
    const custOrder = state.customer?.orderNum || '';
    const custAddr  = state.customer?.address  || '';
    const _hidePrices = window._docsHidePrices();

    const rows = _buildCartData();
    let totalCabPrice = 0, totalInstallPrice = 0;
    let rowsHTML = '';

    rows.forEach(r => {
        totalCabPrice    += r.cabPrice;
        totalInstallPrice += r.instPrice;
        const detailsHtml = _escPrintHtml(r.details).replace(/ \| /g, '<br>');
        rowsHTML += `
        <div class="cab-card">
          <div class="cab-card-inner">
            <div class="cab-name editable" contenteditable="true">${_escPrintHtml(r.title)}</div>
            <div class="cab-details editable" contenteditable="true">${detailsHtml}</div>
            ${_hidePrices ? '' : `<div class="cab-price editable" contenteditable="true">₪${r.cabPrice.toLocaleString()}</div>
            <div class="cab-install editable" contenteditable="true">₪${r.instPrice.toLocaleString()}</div>`}
          </div>
        </div>`;
    });

    const cols = _hidePrices ? '18% 1fr' : '18% 1fr 14% 14%';

    return `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
<meta charset="UTF-8">
<title>סיכום הזמנה ללקוח</title>
<style>
  body { font-family: 'Segoe UI', Arial, sans-serif; direction: rtl; margin: 0; padding: 30px; color: #1e293b; background: white; }
  h1 { font-size: 1.6rem; color: #1e3a5f; margin: 0 0 4px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; border-bottom: 2px solid #1e3a5f; padding-bottom: 14px; }
  .cust-info { font-size: 0.95rem; color: #475569; line-height: 1.7; }
  .cab-list { width: 100%; margin-bottom: 20px; font-size: 0.97rem; border: 1px solid #1e3a5f; }
  .cab-head, .cab-card-inner, .totals-row {
    display: grid;
    grid-template-columns: ${cols};
    align-items: start;
  }
  .cab-head {
    background: #1e3a5f; color: white; font-weight: 600;
  }
  .cab-head > div { padding: 10px 14px; }
  .cab-head .col-price, .cab-head .col-install { text-align: center; }
  .cab-card {
    display: block;
    border-top: 1px solid #e2e8f0;
    page-break-inside: avoid;
    break-inside: avoid-page;
  }
  .cab-name { padding:10px 14px;font-weight:600;color:#1e3a5f; }
  .cab-details { padding:10px 14px;font-size:0.9rem;color:#334155;line-height:1.6; }
  .cab-price { padding:10px 14px;text-align:center;font-weight:700;color:#1e3a5f;white-space:nowrap; }
  .cab-install { padding:10px 14px;text-align:center;color:#475569;white-space:nowrap; }
  .totals-row { background: #f8fafc; font-weight: 600; border-top: 2px solid #1e3a5f; }
  .totals-row > div { padding: 10px 14px; }
  .totals-label { grid-column: 1 / span 2; text-align: right; }
  .totals-val { text-align: center; color: #1e3a5f; }
  .grand-total { margin-top: 10px; font-size: 1.2rem; font-weight: 800; color: #1e3a5f; }
  .disc-box { margin-top: 10px; max-width: 460px; font-size: 0.97rem; }
  .disc-row { display: flex; justify-content: space-between; gap: 16px; padding: 3px 0; color: #334155; font-weight: 600; }
  .disc-row.disc-minus { color: #dc2626; }
  .disc-row.disc-gross { border-top: 1px dashed #cbd5e1; margin-top: 4px; padding-top: 7px; }
  .disc-row.disc-gross span:last-child { text-decoration: line-through; color: #64748b; }
  .disc-editor { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; padding: 6px 12px; background: #fff7ed; border: 1px solid #fed7aa; border-radius: 8px; font-size: 0.9rem; font-weight: 600; color: #9a3412; }
  .disc-editor label { display: flex; align-items: center; gap: 5px; color: #1e293b; }
  .disc-editor input { width: 62px; padding: 4px 6px; border: 1px solid #fdba74; border-radius: 6px; font: inherit; font-weight: 700; text-align: center; direction: ltr; }
  .action-bar { display: flex; gap: 10px; margin-bottom: 22px; flex-wrap: wrap; align-items: center; }
  .action-btn { padding: 9px 20px; border-radius: 8px; border: none; font-size: 0.95rem; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 7px; font-family: inherit; }
  .btn-print  { background: #1e3a5f; color: white; }
  .btn-excel  { background: #16a34a; color: white; }
  .edit-hint { font-size: 0.88rem; color: #64748b; margin-right: auto; }
  .editable { outline: none; border-radius: 4px; min-height: 1.15em; }
  .editable:hover { background: #f8fafc; box-shadow: inset 0 0 0 1px #cbd5e1; }
  .editable:focus { background: #fffbeb; box-shadow: inset 0 0 0 2px #f59e0b; }
  .cab-head .editable:hover { background: rgba(255,255,255,0.12); box-shadow: inset 0 0 0 1px rgba(255,255,255,0.35); }
  .cab-head .editable:focus { background: rgba(255,255,255,0.18); box-shadow: inset 0 0 0 2px #fbbf24; }
  @media print {
    .action-bar { display: none !important; }
    body { padding: 0; }
    @page { size: A4; margin: 12mm; }
    .cab-card, .totals-row, .grand-total {
      page-break-inside: avoid !important;
      break-inside: avoid-page !important;
    }
    .cab-details { orphans: 999; widows: 999; }
    .editable, .editable:hover, .editable:focus {
      background: transparent !important;
      box-shadow: none !important;
      outline: none !important;
    }
  }
</style>
</head>
<body>

<div class="action-bar">
  <button class="action-btn btn-print"  onclick="window.print()">🖨️ הדפסה / PDF</button>
  <button class="action-btn btn-excel"  onclick="_downloadExcel()">📊 הורדת Excel</button>
  ${_hidePrices ? '' : `<div class="disc-editor">
    <span>הנחה:</span>
    <label>ארונות <input type="number" id="disc-cab" min="0" max="100" step="0.5" placeholder="0" value="${_getCustomerDiscounts().cab || ''}" oninput="window._onDiscountInput && window._onDiscountInput()">%</label>
    <label>התקנות <input type="number" id="disc-inst" min="0" max="100" step="0.5" placeholder="0" value="${_getCustomerDiscounts().inst || ''}" oninput="window._onDiscountInput && window._onDiscountInput()">%</label>
  </div>`}
  <span class="edit-hint">לחצו על הטקסט בדף כדי לערוך אותו לפני ההדפסה</span>
</div>

<div class="header">
  <div>
    <h1 class="editable" contenteditable="true">סיכום הזמנה ללקוח</h1>
    <div class="editable" contenteditable="true" style="font-size:0.85rem;color:#64748b;margin-top:4px;">תאריך: ${new Date().toLocaleDateString('he-IL')}</div>
  </div>
  <div style="display:flex;flex-direction:column;align-items:flex-end;gap:8px;">
    ${logoDataUrl ? `<img src="${logoDataUrl}" style="max-height:60px;max-width:180px;object-fit:contain;" alt="לוגו">` : ''}
    <div class="cust-info editable" contenteditable="true" style="text-align:right;">
      <div><strong>לקוח:</strong> ${_escPrintHtml(custName)}</div>
      <div><strong>טלפון:</strong> ${_escPrintHtml(custPhone)}</div>
      <div><strong>מס' הזמנה:</strong> ${_escPrintHtml(custOrder)}</div>
      <div><strong>כתובת:</strong> ${_escPrintHtml(custAddr)}</div>
    </div>
  </div>
</div>

<div class="cab-list">
  <div class="cab-head">
    <div class="editable" contenteditable="true">ארון</div>
    <div class="editable" contenteditable="true">פירוט</div>
    ${_hidePrices ? '' : `<div class="col-price editable" contenteditable="true">מחיר ארון</div>
    <div class="col-install editable" contenteditable="true">התקנה</div>`}
  </div>
  ${rowsHTML}
  ${_hidePrices ? '' : `<div class="totals-row">
    <div class="totals-label editable" contenteditable="true">סה"כ</div>
    <div class="totals-val editable" contenteditable="true">₪${totalCabPrice.toLocaleString()}</div>
    <div class="totals-val editable" contenteditable="true">₪${totalInstallPrice.toLocaleString()}</div>
  </div>`}
</div>

${_hidePrices ? '' : `<div id="summary-totals">${_customerSummaryTotalsHtml(_customerTotals(totalCabPrice, totalInstallPrice))}</div>`}
${_trialWmHtml()}
</body>
</html>`;
}

// ── Excel builder — runs in the PARENT window context, called from child window ──
function _buildExcelXML(d) {
    function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
    var rows = d.rows;
    var xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<?mso-application progid="Excel.Sheet"?>\n';
    xml += '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet" xmlns:x="urn:schemas-microsoft-com:office:excel">\n';
    xml += '<Styles>\n';
    xml += '<Style ss:ID="hdr"><Font ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#1e3a5f" ss:Pattern="Solid"/><Alignment ss:Horizontal="Center"/></Style>\n';
    xml += '<Style ss:ID="bold"><Font ss:Bold="1"/></Style>\n';
    xml += '<Style ss:ID="tot"><Font ss:Bold="1"/><Interior ss:Color="#f0f9ff" ss:Pattern="Solid"/></Style>\n';
    xml += '<Style ss:ID="grn"><Font ss:Bold="1" ss:Color="#16a34a"/></Style>\n';
    xml += '<Style ss:ID="red"><Font ss:Bold="1" ss:Color="#dc2626"/></Style>\n';
    xml += '</Styles>\n';

    // Sheet 1: Customer Summary
    xml += '<Worksheet ss:Name="סיכום ללקוח"><Table>\n';
    xml += '<Column ss:Width="130"/><Column ss:Width="200"/><Column ss:Width="100"/><Column ss:Width="100"/><Column ss:Width="110"/>\n';
    if (typeof window._trialWatermarkExcelRow === 'function') xml += window._trialWatermarkExcelRow();
    xml += '<Row><Cell ss:StyleID="bold"><Data ss:Type="String">לקוח:</Data></Cell><Cell><Data ss:Type="String">' + esc(d.custName) + '</Data></Cell></Row>\n';
    if (d.custPhone) xml += '<Row><Cell ss:StyleID="bold"><Data ss:Type="String">טלפון:</Data></Cell><Cell><Data ss:Type="String">' + esc(d.custPhone) + '</Data></Cell></Row>\n';
    if (d.custOrder) xml += '<Row><Cell ss:StyleID="bold"><Data ss:Type="String">מס\' הזמנה:</Data></Cell><Cell><Data ss:Type="String">' + esc(d.custOrder) + '</Data></Cell></Row>\n';
    if (d.custAddr)  xml += '<Row><Cell ss:StyleID="bold"><Data ss:Type="String">כתובת:</Data></Cell><Cell><Data ss:Type="String">' + esc(d.custAddr) + '</Data></Cell></Row>\n';
    xml += '<Row><Cell><Data ss:Type="String">תאריך:</Data></Cell><Cell><Data ss:Type="String">' + esc(d.date) + '</Data></Cell></Row>\n<Row/>\n';
    xml += '<Row>' + ['ארון','פירוט','מחיר ארון','התקנה','סה"כ ללקוח'].map(h => '<Cell ss:StyleID="hdr"><Data ss:Type="String">' + esc(h) + '</Data></Cell>').join('') + '</Row>\n';
    rows.forEach(function(r) {
        xml += '<Row><Cell><Data ss:Type="String">' + esc(r.title) + '</Data></Cell><Cell><Data ss:Type="String">' + esc(r.details) + '</Data></Cell><Cell><Data ss:Type="Number">' + r.cabPrice + '</Data></Cell><Cell><Data ss:Type="Number">' + r.instPrice + '</Data></Cell><Cell ss:StyleID="bold"><Data ss:Type="Number">' + r.totalRevenue + '</Data></Cell></Row>\n';
    });
    xml += '<Row><Cell ss:StyleID="tot"><Data ss:Type="String">סה"כ</Data></Cell><Cell ss:StyleID="tot"><Data ss:Type="String"></Data></Cell><Cell ss:StyleID="tot"><Data ss:Type="Number">' + d.totalCabPrice + '</Data></Cell><Cell ss:StyleID="tot"><Data ss:Type="Number">' + d.totalInstallPrice + '</Data></Cell><Cell ss:StyleID="tot"><Data ss:Type="Number">' + d.grandTotal + '</Data></Cell></Row>\n';
    var t = _customerTotals(d.totalCabPrice, d.totalInstallPrice);
    if (t.hasDiscount) {
        var discRow = function(label, cab, inst, total, style) {
            return '<Row><Cell ss:StyleID="' + style + '"><Data ss:Type="String">' + esc(label) + '</Data></Cell><Cell ss:StyleID="' + style + '"><Data ss:Type="String"></Data></Cell>' +
                '<Cell ss:StyleID="' + style + '"><Data ss:Type="Number">' + cab + '</Data></Cell><Cell ss:StyleID="' + style + '"><Data ss:Type="Number">' + inst + '</Data></Cell>' +
                '<Cell ss:StyleID="' + style + '"><Data ss:Type="Number">' + total + '</Data></Cell></Row>\n';
        };
        xml += discRow('הנחה (ארונות ' + t.cabPct + '% | התקנות ' + t.instPct + '%)', -t.cabDiscount, -t.instDiscount, -(t.gross - t.net), 'red');
        xml += discRow('סה"כ אחרי הנחה', t.cabinetsNet, t.installNet, t.net, 'tot');
    }
    xml += '</Table></Worksheet>\n';

    // Sheet 2: Profitability
    xml += '<Worksheet ss:Name="רווחיות"><Table>\n';
    xml += '<Column ss:Width="130"/><Column ss:Width="100"/><Column ss:Width="100"/><Column ss:Width="100"/><Column ss:Width="110"/><Column ss:Width="90"/>\n';
    xml += '<Row>' + ['ארון','מחיר ארון ללקוח','עלות ייצור','עלות התקנה','רווח גולמי','% רווח'].map(h => '<Cell ss:StyleID="hdr"><Data ss:Type="String">' + esc(h) + '</Data></Cell>').join('') + '</Row>\n';
    var totalCabAll = 0, totalCostAll = 0, totalProfitAll = 0;
    rows.forEach(function(r) {
        // profit = cabinet price only minus production cost (installation is a pass-through)
        var cabProfit = r.cabPrice - r.costPrice;
        var cabProfitPct = r.cabPrice > 0 ? Math.round((cabProfit / r.cabPrice) * 100) : 0;
        totalCabAll += r.cabPrice; totalCostAll += r.costPrice; totalProfitAll += cabProfit;
        var st = cabProfit >= 0 ? 'grn' : 'red';
        xml += '<Row><Cell><Data ss:Type="String">' + esc(r.title) + '</Data></Cell><Cell><Data ss:Type="Number">' + r.cabPrice + '</Data></Cell><Cell><Data ss:Type="Number">' + r.costPrice + '</Data></Cell><Cell><Data ss:Type="Number">' + r.instPrice + '</Data></Cell><Cell ss:StyleID="' + st + '"><Data ss:Type="Number">' + cabProfit + '</Data></Cell><Cell ss:StyleID="' + st + '"><Data ss:Type="String">' + cabProfitPct + '%</Data></Cell></Row>\n';
    });
    var totalPct = totalCabAll > 0 ? Math.round((totalProfitAll / totalCabAll) * 100) : 0;
    xml += '<Row><Cell ss:StyleID="tot"><Data ss:Type="String">סה"כ</Data></Cell><Cell ss:StyleID="tot"><Data ss:Type="Number">' + totalCabAll + '</Data></Cell><Cell ss:StyleID="tot"><Data ss:Type="Number">' + totalCostAll + '</Data></Cell><Cell ss:StyleID="tot"><Data ss:Type="Number">' + d.totalInstallPrice + '</Data></Cell><Cell ss:StyleID="tot"><Data ss:Type="Number">' + totalProfitAll + '</Data></Cell><Cell ss:StyleID="tot"><Data ss:Type="String">' + totalPct + '%</Data></Cell></Row>\n';
    xml += '</Table></Worksheet>\n</Workbook>';
    return xml;
}

window.printCustomerSummary = async function() {
    // Feature gate: requires canViewCustomerReport
    if (window._features && !window._features.canViewCustomerReport) {
        _showToast('תכונה זו אינה זמינה בתוכנית הנוכחית שלך. שדרג לתוכנית מקצועית כדי לגשת לסיכום ללקוח.', 5000);
        return;
    }

    if (!state.orderCart || state.orderCart.length === 0 ||
        (typeof window._cartHasExportableItems === 'function' && !window._cartHasExportableItems())) {
        alert('אין ארונות לייצוא. הפעילו ארון מושהה או הוסיפו ארון לפרויקט.');
        return;
    }
    // Load logo: prefer user's uploaded logo, fallback to system logo.webp
    let logoDataUrl = '';
    try {
        const logoSrc = window._userLogoUrl || 'logo.webp';
        const resp = await fetch(logoSrc);
        if (resp.ok) {
            const blob = await resp.blob();
            logoDataUrl = await new Promise(resolve => {
                const reader = new FileReader();
                reader.onload = e => resolve(e.target.result);
                reader.readAsDataURL(blob);
            });
        }
    } catch(e) { /* logo not found, skip */ }

    // Build cart data in parent window context (has access to state)
    const excelData = {
        custName:  state.customer?.name    || 'לא צוין',
        custPhone: state.customer?.phone   || '',
        custOrder: state.customer?.orderNum || '',
        custAddr:  state.customer?.address  || '',
        rows: _buildCartData(),
        totalCabPrice: 0, totalInstallPrice: 0, grandTotal: 0,
        date: new Date().toLocaleDateString('he-IL')
    };
    excelData.rows.forEach(r => { excelData.totalCabPrice += r.cabPrice; excelData.totalInstallPrice += r.instPrice; });
    excelData.grandTotal = excelData.totalCabPrice + excelData.totalInstallPrice;

    const html = _buildCustomerSummaryHTML(logoDataUrl);
    _openPrintPopup('width=960,height=780', win => _fillCustomerSummaryWindow(win, html, excelData));
};

function _fillCustomerSummaryWindow(win, html, excelData) {
    win.document.write(html);
    win.document.close();
    win.focus();

    // Inject functions directly into child window — avoids </script> parsing issues
    win._excelData = excelData;
    win._buildExcelXML = _buildExcelXML;
    win._onDiscountInput = function() {
        const cabInp = win.document.getElementById('disc-cab');
        const instInp = win.document.getElementById('disc-inst');
        if (cabInp) _setCustomerDiscount('discountCabinetsPct', cabInp.value);
        if (instInp) _setCustomerDiscount('discountInstallPct', instInp.value);
        const box = win.document.getElementById('summary-totals');
        if (box) box.innerHTML = _customerSummaryTotalsHtml(_customerTotals(excelData.totalCabPrice, excelData.totalInstallPrice));
    };

    win._keepCabinetBlocksTogether = function() {
        var mm = 3.78;
        var pageInner = (297 - 24) * mm;
        var header = win.document.querySelector('.header');
        var used = header ? header.getBoundingClientRect().height + 12 : 0;
        var nodes = win.document.querySelectorAll('.cab-card, .totals-row, .disc-box, .grand-total');
        for (var i = 0; i < nodes.length; i++) {
            var el = nodes[i];
            el.style.breakBefore = 'auto';
            el.style.pageBreakBefore = 'auto';
            var h = el.getBoundingClientRect().height;
            if (used > 48 && (used + h) > (pageInner - 10)) {
                el.style.breakBefore = 'page';
                el.style.pageBreakBefore = 'always';
                used = h;
            } else {
                used += h;
            }
        }
    };
    win.addEventListener('beforeprint', win._keepCabinetBlocksTogether);

    win._downloadExcel = function() {
        var xml = win._buildExcelXML(win._excelData);
        var blob = new win.Blob(['\uFEFF' + xml], { type: 'application/vnd.ms-excel;charset=utf-8' });
        var url = win.URL.createObjectURL(blob);
        var a = win.document.createElement('a');
        a.href = url;
        var safeName = (win._excelData.custName || 'ללקוח').replace(/[<>:"/\\|?*]/g, '');
        a.download = 'הזמנה_' + safeName + '_' + win._excelData.date.replace(/\//g,'-') + '.xls';
        win.document.body.appendChild(a);
        a.click();
        setTimeout(function() { win.URL.revokeObjectURL(url); a.remove(); }, 1000);
    };
    // No auto-print — user clicks the buttons in the opened page
}

// ==========================================
// 8. אתחול המערכת (Initialization)
// ==========================================
window._runDeferredDefaultInit = function() {
    if (window._cabinetBuiltOnce) return;
    window._cabinetBuiltOnce = true;
    buildCabinet();
    calculatePrice();
    if (typeof window._ensureCabinetSelected === 'function') window._ensureCabinetSelected();
    updateLeftSidebar();
    saveHistoryState();
    if (typeof window._restorePresetUI === 'function') window._restorePresetUI();
};

if (!window._VIEWER_MODE) {
    distributeColumns(2);
    bindUI();
    if (typeof _updateSandwichColorVisibility === 'function') _updateSandwichColorVisibility();

    setTimeout(() => {
        window.dispatchEvent(new Event('resize'));
        if (window._pendingProjectLoad) {
            calcQuickPrice(true);
            return;
        }
        // Try to restore from localStorage first; if successful, skip default buildCabinet
        const savedAt = window._restoreFromLocalStorage && window._restoreFromLocalStorage();
        if (savedAt) {
            window._cabinetBuiltOnce = true;
            if (typeof window._ensureCabinetSelected === 'function') window._ensureCabinetSelected();
            const date = new Date(savedAt);
            const timeStr = date.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
            const dateStr = date.toLocaleDateString('he-IL');
            _showToast(`✅ הפרויקט שוחזר אוטומטית מגיבוי (${dateStr} ${timeStr})`);
        } else {
            window._runDeferredDefaultInit();
        }
        calcQuickPrice(true);
    }, 100);
}

// ==========================================
// Wing tab UI helpers
// ==========================================

window.showAddWingMenu = function() {
    const hasLeft = !!state.wings.left;
    const hasRight = !!state.wings.right;

    if (hasLeft && hasRight) {
        // Both exist — offer remove options
        const choice = confirm('שתי הדפנות כבר קיימות.\nלחץ אישור להסרת הדופן הפעילה, ביטול לביטול.');
        if (choice && state.activeWing !== 'center') {
            removeWing(state.activeWing);
        }
        return;
    }

    // Build a simple popup menu
    const existing = document.getElementById('_wing-add-popup');
    if (existing) { existing.remove(); return; }

    const popup = document.createElement('div');
    popup.id = '_wing-add-popup';
    popup.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:white;border:1px solid var(--border);border-radius:12px;padding:20px;z-index:9999;box-shadow:0 8px 32px rgba(0,0,0,0.18);min-width:260px;text-align:center;';
    
    let btns = '';
    if (!hasLeft) btns += `<button onclick="addWing('left');document.getElementById('_wing-add-popup').remove();" style="display:block;width:100%;margin-bottom:10px;padding:12px;background:var(--accent);color:white;border:none;border-radius:8px;font-size:1rem;font-weight:600;cursor:pointer;"><i class='fa-solid fa-arrow-right-to-bracket fa-flip-horizontal'></i> הוסף דופן שמאל</button>`;
    if (!hasRight) btns += `<button onclick="addWing('right');document.getElementById('_wing-add-popup').remove();" style="display:block;width:100%;margin-bottom:10px;padding:12px;background:var(--accent);color:white;border:none;border-radius:8px;font-size:1rem;font-weight:600;cursor:pointer;"><i class='fa-solid fa-arrow-right-to-bracket'></i> הוסף דופן ימין</button>`;
    btns += `<button onclick="document.getElementById('_wing-add-popup').remove();" style="display:block;width:100%;padding:10px;background:var(--bg-light);color:var(--text);border:1px solid var(--border);border-radius:8px;font-size:0.9rem;cursor:pointer;">ביטול</button>`;
    
    popup.innerHTML = `<div style="font-weight:700;font-size:1.05rem;margin-bottom:14px;color:var(--text);">הוסף דופן פינתית</div>${btns}`;
    document.body.appendChild(popup);
    
    // Close on outside click
    setTimeout(() => {
        document.addEventListener('click', function handler(e) {
            if (!popup.contains(e.target)) { popup.remove(); document.removeEventListener('click', handler); }
        });
    }, 100);
};

// Update wing tab button styles when switching
(function _patchWingTabStyles() {
    const origSwitch = window.switchWing;
    window.switchWing = function(wingId) {
        origSwitch(wingId);
        document.querySelectorAll('.wing-tab-btn').forEach(b => {
            const isActive = b.dataset.wing === state.activeWing;
            b.style.background = isActive ? 'var(--accent)' : 'var(--bg-light)';
            b.style.color = isActive ? 'white' : 'var(--text)';
            b.style.borderColor = isActive ? 'var(--accent)' : 'var(--border)';
        });
    };
})();

let _lastFrameTime = performance.now();
let _camHudVisible = false;

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
    // Ignore when typing in an input/textarea
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

    // Ctrl+Z — Undo
    if (e.ctrlKey && !e.shiftKey && e.key === 'z') {
        e.preventDefault();
        undo();
        return;
    }
    // Ctrl+Y or Ctrl+Shift+Z — Redo
    if ((e.ctrlKey && e.key === 'y') || (e.ctrlKey && e.shiftKey && e.key === 'z')) {
        e.preventDefault();
        redo();
        return;
    }
    // Escape — clear selection and close sub-panels
    if (e.key === 'Escape') {
        if (state.selection.colIndex > -1 || state.selection.rows.length > 0) {
            state.selection = { colIndex: -1, rows: [] };
            closeContentSubPanels();
            buildCabinet();
        }
        return;
    }
    // Delete / Backspace — clear content of selected cells
    if ((e.key === 'Delete' || e.key === 'Backspace') && state.viewMode === 'front') {
        const { colIndex, rows } = state.selection;
        if (colIndex > -1 && rows.length > 0 && state.columns[colIndex]) {
            let changed = false;
            const col = state.columns[colIndex];
            if (_isDeskZoneSelection() && (col.deskLeds || col.deskHoneycomb)) {
                delete col.deskLeds;
                delete col.deskHoneycomb;
                changed = true;
            }
            rows.forEach(r => {
                const comp = col.compartments[r];
                if (comp && comp.type !== 'empty') {
                    comp.type = 'empty';
                    delete comp.partition; delete comp.partitionX; delete comp.subCells;
                    changed = true;
                }
            });
            if (changed) {
                state.selection = { colIndex: -1, rows: [] };
                closeContentSubPanels();
                buildCabinet(); calculatePrice(); saveHistoryState();
            }
        }
        return;
    }
    // Ctrl+Shift+C — Toggle camera HUD
    if (e.ctrlKey && e.shiftKey && e.key === 'C') {
        _camHudVisible = !_camHudVisible;
        const hud = document.getElementById('cam-hud');
        if (hud) hud.style.display = _camHudVisible ? 'block' : 'none';
    }
});

function _r(v) { return Math.round(v * 10) / 10; } // round to 1 decimal

function animate() {
    requestAnimationFrame(animate);
    const now = performance.now();
    const dt = Math.min((now - _lastFrameTime) / 1000, 0.1);
    _lastFrameTime = now;

    // Drive camera animation (window._camAnim set by updateCameraView in engine.js)
    if (window._camAnim) {
        window._camAnim.t += dt / window._camAnim.duration;
        if (window._camAnim.t >= 1) {
            // Animation complete — snap to final position
            camera.position.copy(window._camAnim.toPos);
            controls.target.copy(window._camAnim.toTarget);
            camera.lookAt(controls.target);
            const cb = window._camAnim.onDone;
            window._camAnim = null;
            // Sync OrbitControls internal spherical BEFORE re-enabling damping
            // enableDamping=false forces update() to re-read camera.position into spherical
            controls.enableDamping = false;
            controls.enabled = true;
            controls.update(); // syncs internal spherical from current camera.position
            controls.enableDamping = true; // restore damping for user interaction
            if (typeof cb === 'function') cb();
        } else {
            // Interpolate camera position — do NOT call controls.update() here
            // as it would override camera.position from OrbitControls' internal spherical
            const ease = window._camAnim.t < 0.5
                ? 2 * window._camAnim.t * window._camAnim.t
                : -1 + (4 - 2 * window._camAnim.t) * window._camAnim.t;
            camera.position.lerpVectors(window._camAnim.fromPos, window._camAnim.toPos, ease);
            controls.target.lerpVectors(window._camAnim.fromTarget, window._camAnim.toTarget, ease);
            camera.lookAt(controls.target);
        }
    } else {
        controls.update();
    }

    // Update camera HUD
    if (_camHudVisible) {
        const hud = document.getElementById('cam-hud');
        if (hud && camera && controls) {
            const p = camera.position;
            const t = controls.target;
            hud.innerHTML =
                `<b style="color:#fff;font-size:0.75rem;">📷 מצלמה</b><br>` +
                `pos: [${_r(p.x)}, ${_r(p.y)}, ${_r(p.z)}]<br>` +
                `target: [${_r(t.x)}, ${_r(t.y)}, ${_r(t.z)}]<br>` +
                `<span style="color:#aaa;font-size:0.65rem;">Ctrl+Shift+C להסתיר</span>`;
        }
    }

    if (!(state.viewMode === 'room-plan' && window._roomPlanSubview === '2d')) {
        if(typeof updateOverlaysPosition === 'function') updateOverlaysPosition();
        if(typeof updateDragHandlesPosition === 'function') updateDragHandlesPosition();
        if(typeof updateToolbarState === 'function') updateToolbarState();
        if(typeof window._updateBedHandles === 'function') window._updateBedHandles();
    }

    // ── Ceiling closure panel visibility ──────────────────────────────────────
    // Show ceiling when camera is BELOW the ceiling (inside the room).
    // Hide ceiling when camera is ABOVE the ceiling (bird's-eye view from outside).
    if (window._closureCeilMeshes && window._closureCeilMeshes.length > 0) {
        window._closureCeilMeshes.forEach(function(m) {
            if (!m) return;
            // Panel top Y in world space = cabinetGroup.position.y + panel center Y + half thickness
            const panelTopY = (cabinetGroup ? cabinetGroup.position.y : 0) + m.position.y + (m.geometry && m.geometry.parameters ? m.geometry.parameters.height / 2 : 0);
            m.visible = (camera.position.y < panelTopY);
        });
    }

    if (!(state.viewMode === 'room-plan' && window._roomPlanSubview === '2d')) {
        renderer.render(scene, camera);
    }
}
animate();

// ==========================================
// Presentation Mode — תצוגה חופשית עם חדר, ללא ממשק עריכה
// ==========================================
window._enterPresentationMode = function() {
    if (state.viewMode === 'room-plan' && typeof window._exitRoomPlanMode === 'function') {
        window._exitRoomPlanMode();
    }
    // Save current state to restore on exit
    window._presentationSaved = {
        viewMode:     state.viewMode,
        roomVisible:  window._roomVisible,
        orbitFree:    window._orbitFree,
    };

    // Enable room
    if (!window._roomVisible) {
        window._roomVisible = true;
        if (typeof _buildRoom === 'function') _buildRoom();
        const roomBtn = document.getElementById('btn-room-plan') || document.getElementById('btn-toggle-room');
        if (roomBtn) roomBtn.classList.add('active');
    }

    // Switch to free-orbit 3D view
    state.viewMode = '3d';
    window._orbitFree = true;

    // Apply presentation class — hides all UI chrome via CSS
    document.body.classList.add('presentation-mode');

    // Show exit button
    const exitBtn = document.getElementById('presentation-exit-btn');
    if (exitBtn) exitBtn.style.display = 'flex';

    // Wait one frame for CSS layout to settle, then fix camera aspect + renderer size
    requestAnimationFrame(function() {
        const cont = document.getElementById('canvas-container');
        if (cont && typeof camera !== 'undefined' && typeof renderer !== 'undefined') {
            const w = cont.clientWidth;
            const h = cont.clientHeight;
            camera.aspect = w / h;
            camera.updateProjectionMatrix();
            renderer.setSize(w, h);
        }
        buildCabinet();
        updateCameraView();
    });
};

window._exitPresentationMode = function() {
    document.body.classList.remove('presentation-mode');

    // Hide exit button
    const exitBtn = document.getElementById('presentation-exit-btn');
    if (exitBtn) exitBtn.style.display = 'none';

    // Restore saved state
    if (window._presentationSaved) {
        state.viewMode    = window._presentationSaved.viewMode;
        window._orbitFree = window._presentationSaved.orbitFree;

        // Restore room visibility
        const wasRoomVisible = window._presentationSaved.roomVisible;
        if (window._roomVisible !== wasRoomVisible) {
            window._roomVisible = wasRoomVisible;
            if (typeof _buildRoom === 'function') _buildRoom();
            const roomBtn = document.getElementById('btn-room-plan') || document.getElementById('btn-toggle-room');
            if (roomBtn) roomBtn.classList.remove('active');
        }
        window._presentationSaved = null;
    }

    // Restore active view button highlight
    document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
    const activeBtn = document.getElementById(
        state.viewMode === 'front' ? 'btn-front-view' : 'btn-blueprint-view'
    );
    if (activeBtn) activeBtn.classList.add('active');

    // Wait one frame for CSS layout to settle, then fix camera aspect + renderer size
    requestAnimationFrame(function() {
        const cont = document.getElementById('canvas-container');
        if (cont && typeof camera !== 'undefined' && typeof renderer !== 'undefined') {
            const w = cont.clientWidth;
            const h = cont.clientHeight;
            camera.aspect = w / h;
            camera.updateProjectionMatrix();
            renderer.setSize(w, h);
        }
        buildCabinet();
        updateCameraView();
    });
};

// ── Pricing Settings (user self-service) ──────────────────────────────────────
function _upsPct(v) { return Math.round((v || 0) * 100); }
function _upsFrac(v) { return (parseFloat(v) || 0) / 100; }

function upsSetMode(mode) {
    document.querySelectorAll('.ups-mode-btn').forEach(function(b) {
        const isActive = b.getAttribute('data-mode') === mode;
        b.style.background = isActive ? '#4f46e5' : '#f8fafc';
        b.style.color = isActive ? 'white' : '#374151';
        b.style.borderColor = isActive ? '#4f46e5' : '#e2e8f0';
    });
    document.querySelectorAll('.ups-mode-section').forEach(function(s) {
        s.style.display = 'none';
    });
    const sec = document.getElementById('ups-mode-' + mode);
    if (sec) sec.style.display = 'block';
}

function openPricingSettings() {
    const modal = document.getElementById('pricing-settings-modal');
    if (!modal) return;
    // Get current config: window._pricingConfig or DEFAULT_PRICING_CONFIG
    const cfg = window._pricingConfig || (typeof DEFAULT_PRICING_CONFIG !== 'undefined' ? DEFAULT_PRICING_CONFIG : null);
    if (cfg) _fillUserPricingForm(cfg);
    modal.style.display = 'flex';
}

function closePricingSettings() {
    const modal = document.getElementById('pricing-settings-modal');
    if (modal) modal.style.display = 'none';
}

function _upsNum(v, fallback) {
    if (v === '' || v == null) return fallback;
    var n = Number(v);
    return isFinite(n) ? n : fallback;
}

function _fillUserPricingForm(cfg) {
    const c = cfg || {};
    upsSetMode(c.pricingMode || 'ranges');
    const _sv = function(id, val) { const el = document.getElementById(id); if (el) el.value = val; };
    _sv('ups-sqmPrice', _upsNum(c.sqmPrice, 800));
    _sv('ups-sqmPriceNonMel', _upsNum(c.sqmPriceNonMel, 1040));
    _sv('ups-lmPrice', _upsNum(c.lmPrice, 1200));
    _sv('ups-lmPriceNonMel', _upsNum(c.lmPriceNonMel, 1560));
    _sv('ups-lmHeightBase', _upsNum(c.lmHeightBase, 1200));
    _sv('ups-lmHeightBaseNonMel', _upsNum(c.lmHeightBaseNonMel, 1560));
    _sv('ups-lmHeightThresholdCm', _upsNum(c.lmHeightThresholdCm, 240));
    _sv('ups-lmHeightStepCm', _upsNum(c.lmHeightStepCm, 30));
    _sv('ups-lmHeightStepPct', _upsPct(_upsNum(c.lmHeightStepPct, 0.10)));
    _sv('ups-materialsBoardPrice', _upsNum(c.materialsBoardPrice, 180));
    _sv('ups-materialsBoardsPerSqm', _upsNum(c.materialsBoardsPerSqm, 1.4));
    _sv('ups-materialsMultiplier', _upsNum(c.materialsMultiplier, 2.5));
    _sv('ups-profitMultiplier', _upsNum(c.profitMultiplier, 1.7));
    _sv('ups-heightSurcharge', _upsPct(_upsNum(c.heightSurcharge, 0.20)));
    _sv('ups-depthSurcharge', _upsPct(_upsNum(c.depthSurcharge, 0.20)));
    _sv('ups-sandwichSurcharge', _upsPct(_upsNum(c.sandwichSurcharge, 0.15)));
    _sv('ups-installPricePerUnit', _upsNum(c.installPricePerUnit, 110));
    _sv('ups-installUnitCm', _upsNum(c.installUnitCm, 42.5));
    _sv('ups-installHeightSurcharge', _upsPct(_upsNum(c.installHeightSurcharge, 0.20)));
    const ex = c.extras || {};
    const dx = (typeof DEFAULT_PRICING_CONFIG !== 'undefined' && DEFAULT_PRICING_CONFIG.extras) ? DEFAULT_PRICING_CONFIG.extras : {};
    _sv('ups-internalDrawer', _upsNum(ex.internalDrawer, dx.internalDrawer != null ? dx.internalDrawer : 150));
    _sv('ups-externalDrawer', _upsNum(ex.externalDrawer, dx.externalDrawer != null ? dx.externalDrawer : 200));
    _sv('ups-openCell', _upsNum(ex.openCell, dx.openCell != null ? dx.openCell : 400));
    _sv('ups-partition', _upsNum(ex.partition, dx.partition != null ? dx.partition : 150));
    _sv('ups-shelfFreePerMeter', _upsNum(ex.shelfFreePerMeter, dx.shelfFreePerMeter != null ? dx.shelfFreePerMeter : 3));
    _sv('ups-extraShelfMel', _upsNum(ex.extraShelfMel, dx.extraShelfMel != null ? dx.extraShelfMel : 60));
    _sv('ups-extraShelfNonMel', _upsNum(ex.extraShelfNonMel, dx.extraShelfNonMel != null ? dx.extraShelfNonMel : 80));
    _sv('ups-deskUnit', _upsNum(ex.deskUnit, dx.deskUnit != null ? dx.deskUnit : 900));
    _sv('ups-doorFramedMel', _upsNum(ex.doorFramedMel, dx.doorFramedMel != null ? dx.doorFramedMel : 80));
    _sv('ups-doorGlassMel', _upsNum(ex.doorGlassMel, dx.doorGlassMel != null ? dx.doorGlassMel : 400));
    _sv('ups-doorGlassBlack', _upsNum(ex.doorGlassBlack, dx.doorGlassBlack != null ? dx.doorGlassBlack : 600));
    _sv('ups-doorMirror', _upsNum(ex.doorMirror, dx.doorMirror != null ? dx.doorMirror : 350));
}

function _readUserPricingForm() {
    const _gv = function(id) { const el = document.getElementById(id); return el ? el.value : ''; };
    const activeBtn = document.querySelector('.ups-mode-btn[style*="background: rgb(79, 70, 229)"], .ups-mode-btn[style*="background:#4f46e5"], .ups-mode-btn[style*="background: #4f46e5"]');
    // Fallback: find by inline style background color
    let mode = 'ranges';
    document.querySelectorAll('.ups-mode-btn').forEach(function(b) {
        if (b.style.background === 'rgb(79, 70, 229)' || b.style.background === '#4f46e5') {
            mode = b.getAttribute('data-mode') || 'ranges';
        }
    });
    // Get existing config to preserve ranges and other fields not shown
    const existing = window._pricingConfig || (typeof DEFAULT_PRICING_CONFIG !== 'undefined' ? DEFAULT_PRICING_CONFIG : {});
    const existingExtras = (existing.extras) || {};
    const dx = (typeof DEFAULT_PRICING_CONFIG !== 'undefined' && DEFAULT_PRICING_CONFIG.extras) ? DEFAULT_PRICING_CONFIG.extras : {};
    return {
        pricingMode: mode,
        sqmPrice: _upsNum(_gv('ups-sqmPrice'), 800),
        sqmPriceNonMel: _upsNum(_gv('ups-sqmPriceNonMel'), 1040),
        lmPrice: _upsNum(_gv('ups-lmPrice'), 1200),
        lmPriceNonMel: _upsNum(_gv('ups-lmPriceNonMel'), 1560),
        lmHeightBase: _upsNum(_gv('ups-lmHeightBase'), 1200),
        lmHeightBaseNonMel: _upsNum(_gv('ups-lmHeightBaseNonMel'), 1560),
        lmHeightThresholdCm: _upsNum(_gv('ups-lmHeightThresholdCm'), 240),
        lmHeightStepCm: _upsNum(_gv('ups-lmHeightStepCm'), 30),
        lmHeightStepPct: _upsFrac(_gv('ups-lmHeightStepPct')),
        materialsBoardPrice: _upsNum(_gv('ups-materialsBoardPrice'), 180),
        materialsBoardsPerSqm: _upsNum(_gv('ups-materialsBoardsPerSqm'), 1.4),
        materialsMultiplier: _upsNum(_gv('ups-materialsMultiplier'), 2.5),
        profitMultiplier: _upsNum(_gv('ups-profitMultiplier'), 1.7),
        heightSurcharge: _upsFrac(_gv('ups-heightSurcharge')),
        depthSurcharge: _upsFrac(_gv('ups-depthSurcharge')),
        sandwichSurcharge: _upsFrac(_gv('ups-sandwichSurcharge')),
        installPricePerUnit: _upsNum(_gv('ups-installPricePerUnit'), 110),
        installUnitCm: _upsNum(_gv('ups-installUnitCm'), 42.5),
        installHeightSurcharge: _upsFrac(_gv('ups-installHeightSurcharge')),
        cabinetTypes: existing.cabinetTypes || (typeof DEFAULT_PRICING_CONFIG !== 'undefined' ? DEFAULT_PRICING_CONFIG.cabinetTypes : undefined),
        ranges: existing.ranges || {},
        extras: Object.assign({}, existingExtras, {
            internalDrawer: _upsNum(_gv('ups-internalDrawer'), dx.internalDrawer != null ? dx.internalDrawer : 150),
            externalDrawer: _upsNum(_gv('ups-externalDrawer'), dx.externalDrawer != null ? dx.externalDrawer : 200),
            openCell: _upsNum(_gv('ups-openCell'), dx.openCell != null ? dx.openCell : 400),
            partition: _upsNum(_gv('ups-partition'), dx.partition != null ? dx.partition : 150),
            shelfFreePerMeter: _upsNum(_gv('ups-shelfFreePerMeter'), dx.shelfFreePerMeter != null ? dx.shelfFreePerMeter : 3),
            extraShelfMel: _upsNum(_gv('ups-extraShelfMel'), dx.extraShelfMel != null ? dx.extraShelfMel : 60),
            extraShelfNonMel: _upsNum(_gv('ups-extraShelfNonMel'), dx.extraShelfNonMel != null ? dx.extraShelfNonMel : 80),
            deskUnit: _upsNum(_gv('ups-deskUnit'), dx.deskUnit != null ? dx.deskUnit : 900),
            doorFramedMel: _upsNum(_gv('ups-doorFramedMel'), dx.doorFramedMel != null ? dx.doorFramedMel : 80),
            doorGlassMel: _upsNum(_gv('ups-doorGlassMel'), dx.doorGlassMel != null ? dx.doorGlassMel : 400),
            doorGlassBlack: _upsNum(_gv('ups-doorGlassBlack'), dx.doorGlassBlack != null ? dx.doorGlassBlack : 600),
            doorMirror: _upsNum(_gv('ups-doorMirror'), dx.doorMirror != null ? dx.doorMirror : 350),
        })
    };
}

async function saveUserPricingConfig() {
    const cfg = _readUserPricingForm();
    try {
        const sb = window._supabase;
        if (!sb) throw new Error('לא מחובר');
        const { data: { user } } = await sb.auth.getUser();
        if (!user) throw new Error('לא מחובר');
        const { error } = await sb.from('pricing_configs').upsert(
            { user_id: user.id, config: cfg, updated_at: new Date().toISOString() },
            { onConflict: 'user_id' }
        );
        if (error) throw error;
        window._pricingConfig = cfg;
        if (typeof window.applyCabinetTypeSelects === 'function') window.applyCabinetTypeSelects(cfg);
        closePricingSettings();
        if (typeof _showToast === 'function') _showToast('הגדרות התמחור נשמרו ✓', 3000);
        // Recalculate price with new config
        if (typeof calculatePrice === 'function') calculatePrice();
    } catch(e) {
        if (typeof _showToast === 'function') _showToast('שגיאה בשמירה: ' + e.message, 4000);
        else alert('שגיאה בשמירה: ' + e.message);
    }
}