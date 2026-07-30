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
// ────────────────────────────────────────────────────────────────────────────

const colorNamesHebrew = {
    white_matte: 'לבן מט 2100', c3110: '3110', c795: '759', c705: '705', u727: 'U727',
    w1200: 'W1200', u232: 'U232', u604: 'U604', u638: 'U638',
    c3207: '3207', black_matte: 'שחור מט', custom: 'מותאם אישית',
    '2020': 'גוון 2020', '2024': 'גוון 2024', 'H1367': 'H1367', 'H1307': 'H1307', 'H1227': 'H1227',
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

const placementHebrew = {
    'wall': 'ארון קיר חופשי',
    'between_walls': 'ארון בין קירות'
};

// ── Drawer count helpers ──────────────────────────────────────────────────────
// Auto-count: 1 drawer per 20cm; thresholds: ≥12cm=1, ≥32cm=2, ≥52cm=3, ...
function calcAutoDrawerCount(cellHeightCm) {
    if (cellHeightCm < 12) return 0; // cell too short for any drawer
    return Math.floor((cellHeightCm - 11) / 20) + 1;
}
// Min-count: no single drawer may exceed 60cm
function calcMinDrawerCount(cellHeightCm) {
    return Math.ceil(cellHeightCm / 60);
}
// Returns the displayed cell height (cm) of compartment row r in column col.
// Returns a rounded integer to match what the dimension label shows (Math.round).
function _cellHeight(col, r, wingData) {
    const plinthH = wingData ? wingData.plinthHeight : state.plinthHeight;
    const t       = wingData ? wingData.thickness    : state.thickness;
    const fo      = col.floorOffset || 0;
    // startShelvesY mirrors engine-core.js logic: noPlinth columns start at t (not plinthH+t)
    const startY  = fo > 0 ? fo + t : ((col.type === 'desk') ? col.deskHeight + col.deskClearance + t : (col.noPlinth ? t : plinthH + t));
    // prevY: bottom of cell r
    const bottomY = (r === 0) ? startY : col.shelvesY[r - 1] + t / 2;
    // topY: top of cell r
    const topY    = (r >= col.shelvesY.length) ? col.height - t : col.shelvesY[r] - t / 2;
    // Round to match the displayed dimension label (engine.js uses Math.round)
    return Math.round(Math.max(0, topY - bottomY));
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

    document.getElementById('qe-s-val').value = col.shelves;

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
    } else {
        col.noPlinth = true;
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
        delete col.deskHeight; delete col.deskClearance; delete col.hasDrawers; delete col.drawerHeight;
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
        { key: 'black_matte', bg: '#000007',  border: '#444', label: 'שחור מט' },
        // Wood / texture colors
        { key: '2020',  img: 'textures/2020.jpg',  border: '#bbb', label: '2020' },
        { key: '2024',  img: 'textures/2024.jpg',  border: '#bbb', label: '2024' },
        { key: 'H1367', img: 'textures/H1367.jpg', border: '#bbb', label: 'H1367' },
        { key: 'H1307', img: 'textures/H1307.jpg', border: '#bbb', label: 'H1307' },
        { key: 'H1227', img: 'textures/H1227.jpg', border: '#bbb', label: 'H1227' },
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

function buildDimensionsAndButtonsUI() {
    dimLayer.innerHTML = '';
    buttonsLayer.innerHTML = '';
    // ---- Column width labels (always-visible layer, separate from hover-fade dimensions-layer) ----
    const colWidthsLayer = document.getElementById('col-widths-layer');
    if (colWidthsLayer) colWidthsLayer.innerHTML = '';
    if (state.viewMode !== 'front') return;

    state.dimData.forEach(d => {
        // isSubCellBtn and isCellSelectBtn entries are handled separately below — skip here
        if (d.isSubCellBtn) return;
        if (d.isCellSelectBtn) return;

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

        const dimEl = document.createElement('div');
        dimEl.className = 'dim-container';
        dimEl.dataset.x3d = d.x; dimEl.dataset.y3d = d.y;
        
        const input = document.createElement('input');
        input.className = 'dim-input';
        input.type = 'number'; input.step = '1';
        input.value = Math.round(d.h);

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
            let desiredH = parseInt(e.target.value);
            if(isNaN(desiredH)) return;
            
            if (d.isDeskWidth) {
                state.desk.width = Math.max(40, Math.min(200, desiredH));
                if (document.getElementById('inp-num-desk-width')) document.getElementById('inp-num-desk-width').value = state.desk.width;
                if (document.getElementById('inp-desk-width')) document.getElementById('inp-desk-width').value = state.desk.width;
            } else if (d.isDeskHeight) {
                state.desk.height = Math.max(50, Math.min(120, desiredH));
            } else if (d.isDeskDrawer) {
                state.desk.drawerHeight = Math.max(12, Math.min(40, desiredH));
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
                const diff = desiredH - d.h;
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
                        col.shelvesY[shelfIdx] = Math.round(Math.max(limitMin, Math.min(limitMax, currentY - diff)) * 10) / 10;
                        e.target.value = Math.round(col.height - t - col.shelvesY[shelfIdx] - t / 2);
                    }
                } else {
                    const div = d.divAbove;
                    if (!div) return;
                    if (div.type === 'split') {
                        let newSplitY = col.splitY + diff;
                        let maxAllowable = Math.min(getSplitThreshold(), ...state.columns.filter(c => c.splitY).map(c => c.height - 2*state.thickness - MIN_SHELF_GAP));
                        if (newSplitY > maxAllowable) newSplitY = maxAllowable;
                        state.columns.forEach(c => { if (c.splitY) c.splitY = newSplitY; });
                    } else {
                        const shelfIdx = div.idx;
                        const currentY = col.shelvesY[shelfIdx];
                        const obs = [cBaseY + t / 2, col.height - t / 2];
                        if (col.splitY) { obs.push(col.splitY - t); obs.push(col.splitY + t); }
                        col.shelvesY.forEach((y, i) => { if (i !== shelfIdx) obs.push(y); });
                        const limitMin = Math.max(...obs.filter(y => y < currentY)) + MIN_SHELF_GAP + t;
                        const limitMax = Math.min(...obs.filter(y => y > currentY)) - MIN_SHELF_GAP - t;
                        col.shelvesY[shelfIdx] = Math.round(Math.max(limitMin, Math.min(limitMax, currentY + diff)) * 10) / 10;
                        e.target.value = Math.round(col.shelvesY[shelfIdx] - (shelfIdx === 0 ? cBaseY + t : col.shelvesY[shelfIdx - 1] + t / 2) - t / 2);
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
                        col.shelvesY[shelfIdx] = Math.round(Math.max(limitMin, Math.min(limitMax, currentY - delta)) * 10) / 10;
                    }
                } else {
                    const div = d.divAbove;
                    if (!div) return;
                    if (div.type === 'split') {
                        let newSplitY = col.splitY + delta;
                        let maxAllowable = Math.min(getSplitThreshold(), ...state.columns.filter(c => c.splitY).map(c => c.height - 2*state.thickness - MIN_SHELF_GAP));
                        if (newSplitY > maxAllowable) newSplitY = maxAllowable;
                        state.columns.forEach(c => { if (c.splitY) c.splitY = newSplitY; });
                    } else {
                        const shelfIdx = div.idx;
                        const currentY = col.shelvesY[shelfIdx];
                        const obs = [cBaseY + t / 2, col.height - t / 2];
                        if (col.splitY) { obs.push(col.splitY - t); obs.push(col.splitY + t); }
                        col.shelvesY.forEach((y, i) => { if (i !== shelfIdx) obs.push(y); });
                        const limitMin = Math.max(...obs.filter(y => y < currentY)) + MIN_SHELF_GAP + t;
                        const limitMax = Math.min(...obs.filter(y => y > currentY)) - MIN_SHELF_GAP - t;
                        col.shelvesY[shelfIdx] = Math.round(Math.max(limitMin, Math.min(limitMax, currentY + delta)) * 10) / 10;
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

            if (isSelectedRow) {
                // Selected state: just the green ✓ circle — no pill wrapper needed
                const checkCircle = document.createElement('div');
                checkCircle.innerHTML = '<i class="fa-solid fa-check" style="font-size:0.75rem;pointer-events:none;"></i>';
                checkCircle.style.cssText = 'display:flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:50%;background:linear-gradient(135deg,#10b981,#059669);color:white;cursor:pointer;flex-shrink:0;transition:transform 0.15s,box-shadow 0.15s;box-shadow:0 2px 8px rgba(16,185,129,0.55);';
                checkCircle.addEventListener('mouseenter', () => { checkCircle.style.transform = 'scale(1.15)'; checkCircle.style.boxShadow = '0 3px 12px rgba(16,185,129,0.7)'; });
                checkCircle.addEventListener('mouseleave', () => { checkCircle.style.transform = 'scale(1)'; checkCircle.style.boxShadow = '0 2px 8px rgba(16,185,129,0.55)'; });
                checkCircle.addEventListener('click', (e) => { e.stopPropagation(); toggleSelection(d.colIndex, d.rowIndex); });
                dimEl.insertBefore(checkCircle, dimEl.firstChild);
            } else {
                // Build pill container — direction:ltr so internal order is predictable
                const pill = document.createElement('div');
                pill.style.cssText = 'display:flex;align-items:center;gap:0;direction:ltr;background:rgba(30,30,40,0.82);border-radius:20px;padding:3px 8px 3px 6px;box-shadow:0 2px 10px rgba(0,0,0,0.35);flex-shrink:0;';
                // Pill layout (LTR inside pill): [(trash | divider)? | height▲▼ | divider | +]
                // In RTL context: + on visual LEFT, height in middle, trash on visual RIGHT

                if (hasContent) {
                    // Trash — first in DOM = visual left in LTR (= visual right in RTL page)
                    const trashBtn = document.createElement('div');
                    trashBtn.innerHTML = '<i class="fa-solid fa-trash" style="font-size:0.65rem;pointer-events:none;"></i>';
                    trashBtn.style.cssText = 'display:flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:50%;color:rgba(255,255,255,0.55);cursor:pointer;transition:color 0.15s,background 0.15s;flex-shrink:0;';
                    trashBtn.title = 'מחק תכולה מאיזור זה';
                    trashBtn.addEventListener('mouseenter', () => { trashBtn.style.color = '#ef4444'; trashBtn.style.background = 'rgba(239,68,68,0.15)'; });
                    trashBtn.addEventListener('mouseleave', () => { trashBtn.style.color = 'rgba(255,255,255,0.55)'; trashBtn.style.background = 'transparent'; });
                    trashBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        if (state.columns[d.colIndex].compartments[d.rowIndex]) {
                            state.columns[d.colIndex].compartments[d.rowIndex].type = 'empty';
                            delete state.columns[d.colIndex].compartments[d.rowIndex].partition;
                            delete state.columns[d.colIndex].compartments[d.rowIndex].partitions;
                            delete state.columns[d.colIndex].compartments[d.rowIndex].subCells;
                            _clearSubCellSelection();
                        }
                        buildCabinet(); calculatePrice(); saveHistoryState();
                    });
                    pill.appendChild(trashBtn);

                    // Divider after trash
                    const div1 = document.createElement('div');
                    div1.style.cssText = 'width:1px;height:14px;background:rgba(255,255,255,0.2);margin:0 5px;flex-shrink:0;';
                    pill.appendChild(div1);
                }

                // Height editable input with ▲▼ arrows — middle
                // Use d.h (from state.dimData, computed by engine-core with noPlinth-aware startShelvesY)
                // instead of _cellHeight() which ignores col.noPlinth.
                const cellH = Math.round(d.h);
                const heightGroup = document.createElement('div');
                heightGroup.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:0;';

                const upBtn = document.createElement('div');
                upBtn.innerHTML = '▲';
                upBtn.style.cssText = 'font-size:0.55rem;color:rgba(255,255,255,0.7);cursor:pointer;line-height:1;padding:1px 3px;border-radius:3px;transition:color 0.15s;user-select:none;';
                upBtn.addEventListener('mouseenter', () => upBtn.style.color = 'white');
                upBtn.addEventListener('mouseleave', () => upBtn.style.color = 'rgba(255,255,255,0.7)');
                upBtn.addEventListener('click', (e) => { e.stopPropagation(); _adjustCellHeight(1); });

                const heightInput = document.createElement('input');
                heightInput.type = 'number';
                heightInput.step = '1';
                heightInput.value = String(cellH);
                heightInput.title = 'לחץ לעריכת גובה התא';
                heightInput.setAttribute('aria-label', 'גובה תא בס״מ');
                heightInput.style.cssText = 'width:2.6em;min-width:2em;border:none;background:transparent;font-size:0.72rem;font-weight:700;color:rgba(255,255,255,0.95);line-height:1.1;text-align:center;outline:none;padding:0;margin:0;font-family:inherit;-moz-appearance:textfield;cursor:text;';
                heightInput.addEventListener('mousedown', (e) => { e.stopPropagation(); });
                heightInput.addEventListener('click', (e) => { e.stopPropagation(); heightInput.select(); });
                heightInput.addEventListener('keydown', (e) => {
                    e.stopPropagation();
                    if (e.key === 'Enter') { e.preventDefault(); heightInput.blur(); }
                });
                heightInput.addEventListener('change', (e) => {
                    e.stopPropagation();
                    const desired = parseInt(e.target.value, 10);
                    if (isNaN(desired)) {
                        e.target.value = String(cellH);
                        return;
                    }
                    const delta = desired - cellH;
                    if (delta === 0) return;
                    _adjustCellHeight(delta);
                });

                const downBtn = document.createElement('div');
                downBtn.innerHTML = '▼';
                downBtn.style.cssText = 'font-size:0.55rem;color:rgba(255,255,255,0.7);cursor:pointer;line-height:1;padding:1px 3px;border-radius:3px;transition:color 0.15s;user-select:none;';
                downBtn.addEventListener('mouseenter', () => downBtn.style.color = 'white');
                downBtn.addEventListener('mouseleave', () => downBtn.style.color = 'rgba(255,255,255,0.7)');
                downBtn.addEventListener('click', (e) => { e.stopPropagation(); _adjustCellHeight(-1); });

                heightGroup.appendChild(upBtn);
                heightGroup.appendChild(heightInput);
                heightGroup.appendChild(downBtn);
                pill.appendChild(heightGroup);

                // Divider between height and +
                const div2 = document.createElement('div');
                div2.style.cssText = 'width:1px;height:14px;background:rgba(255,255,255,0.2);margin:0 5px;flex-shrink:0;';
                pill.appendChild(div2);

                // + button — last in DOM = visual right in LTR (= visual left in RTL page)
                const plusBtn = document.createElement('div');
                plusBtn.innerHTML = '<i class="fa-solid fa-plus" style="font-size:0.75rem;pointer-events:none;"></i>';
                plusBtn.style.cssText = 'display:flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:50%;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:white;cursor:pointer;flex-shrink:0;transition:transform 0.15s,box-shadow 0.15s;box-shadow:0 2px 6px rgba(99,102,241,0.5);';
                plusBtn.addEventListener('mouseenter', () => { plusBtn.style.transform = 'scale(1.15)'; plusBtn.style.boxShadow = '0 3px 10px rgba(99,102,241,0.7)'; });
                plusBtn.addEventListener('mouseleave', () => { plusBtn.style.transform = 'scale(1)'; plusBtn.style.boxShadow = '0 2px 6px rgba(99,102,241,0.5)'; });
                plusBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleSelection(d.colIndex, d.rowIndex); });
                pill.appendChild(plusBtn);

                // Insert pill BEFORE any existing children (= visual right in RTL)
                dimEl.insertBefore(pill, dimEl.firstChild);
            }

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
            // Has content: circular pill with pen + trash — whole pill adds to multi-selection
            btn.innerHTML = `<div class="sub-cell-pill" style="display:flex;align-items:center;gap:5px;background:rgba(30,30,40,0.82);border-radius:20px;padding:4px 8px;box-shadow:0 2px 8px rgba(0,0,0,0.3);cursor:pointer;">
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
            // Empty zone: circular + button in teal/cyan
            btn.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:50%;background:linear-gradient(135deg,#06b6d4,#0891b2);transition:all 0.18s cubic-bezier(.4,0,.2,1);box-shadow:0 2px 6px rgba(6,182,212,0.5);cursor:pointer;"><i class="fa-solid fa-plus" style="font-size:10px;color:white;pointer-events:none;font-weight:700;"></i></div>`;
            const circle = btn.querySelector('div');
            btn.addEventListener('mouseenter', () => { circle.style.background = 'linear-gradient(135deg,#0891b2,#0e7490)'; circle.style.transform = 'scale(1.2)'; circle.style.boxShadow = '0 3px 10px rgba(6,182,212,0.7)'; });
            btn.addEventListener('mouseleave', () => { circle.style.background = 'linear-gradient(135deg,#06b6d4,#0891b2)'; circle.style.transform = 'scale(1)'; circle.style.boxShadow = '0 2px 6px rgba(6,182,212,0.5)'; });
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

function _openHandlePickerSheet(currentStyle, descText, onSelect) {
    window._handlePickerApply = onSelect;
    const descEl = document.getElementById('handle-picker-desc-text');
    if (descEl) descEl.textContent = descText;

    const grid = document.getElementById('handle-picker-grid');
    if (!grid) return;
    grid.innerHTML = '';
    HANDLE_CATALOG.forEach(h => {
        const card = document.createElement('div');
        card.className = 'handle-picker-card' + (h.id === currentStyle ? ' active' : '');
        card.innerHTML = `
            <div class="handle-picker-icon" style="color:${h.id === currentStyle ? '#fff' : 'var(--primary)'};">${h.svgPath}</div>
            <div class="handle-picker-name">${h.label}</div>
            <div class="handle-picker-sub">${h.sub}</div>
        `;
        card.addEventListener('click', () => {
            if (typeof window._handlePickerApply === 'function') window._handlePickerApply(h.id);
            closeHandlePicker();
        });
        grid.appendChild(card);
    });

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
    if (isExtDrawer && firstComp.handleStyle) currentStyle = firstComp.handleStyle;
    else if (existingDoor && existingDoor.handleStyle) currentStyle = existingDoor.handleStyle;

    let descText = 'ידית לדלת';
    if (isExtDrawer && existingDoor) descText = 'ידית למגירות החיצוניות ולדלת';
    else if (isExtDrawer) descText = 'ידית למגירות החיצוניות בתא';

    _openHandlePickerSheet(currentStyle, descText, applyHandleStyleToCell);
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

window.applyHandleStyleToCell = function(style) {
    const selCol = state.selection.colIndex;
    const col = selCol >= 0 ? state.columns[selCol] : null;
    if (!col || state.selection.rows.length === 0) return;

    let changed = false;
    // Partition zone external drawers
    if (_activeSubCellIdxs.size > 0) {
        const r = state.selection.rows[0];
        const comp = col.compartments[r];
        if (comp && comp.partition && Array.isArray(comp.subCells)) {
            _activeSubCellIdxs.forEach(key => {
                const { si, z } = _parseSubKey(key);
                const sub = comp.subCells[si];
                if (!sub) return;
                if (_zoneInteriorAt(sub, z) === 'external_drawers') {
                    sub.handleStyle = style;
                    changed = true;
                }
            });
        }
    }
    // Apply to external_drawers compartments in selected rows
    state.selection.rows.forEach(r => {
        const comp = col.compartments[r];
        if (comp && comp.type === 'external_drawers') {
            comp.handleStyle = style;
            changed = true;
        }
    });
    // Apply to doors that cover any selected row
    col.doors.forEach(door => {
        if (door.type === 'empty') return;
        if (state.selection.rows.some(r => r >= door.startRow && r <= door.endRow)) {
            door.handleStyle = style;
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
    toolbar.querySelectorAll('button.toolbar-btn').forEach(b => b.classList.remove('active'));
    // Also clear sub-panel button highlights
    ['hanging-sub-panel','drawer-sub-panel','honeycomb-sub-panel'].forEach(id => {
        const p = document.getElementById(id);
        if (p) p.querySelectorAll('button.toolbar-btn').forEach(b => b.classList.remove('active'));
    });

    // Re-sync sub-panel-open highlight: whichever sub-panel is currently visible
    const _subPanelMap = { 'hanging-sub-panel': 'tb-btn-hanging', 'drawer-sub-panel': 'tb-btn-drawer', 'honeycomb-sub-panel': 'tb-btn-honeycomb' };
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
            const honeyGrp = mergedGroup && (mergedGroup.type === 'honeycomb' || mergedGroup.type === 'open_cell');
            if (honeyGrp && _subKeysEqual(mergedGroup.keys, selectedKeysArr)) {
                interiorType = 'honeycomb';
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
        } else if (interiorType === 'honeycomb' || interiorType === 'open_cell') {
            const btn = document.getElementById('tb-btn-honeycomb');
            if (btn) btn.classList.add('active');
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
            zoneMinCount = calcMinDrawerCount(zoneH);
            zoneDrawerCount = _zoneDrawerCountAt(activeSub, _activeZ, zoneH);
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
            minCount = calcMinDrawerCount(_cellHeight(col, r));
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
        type:         col.type,
        splitY:       col.splitY,
        floorOffset:  col.floorOffset || 0,
        noPlinth:     col.noPlinth || false,
        topPanel:     col.topPanel || false,
        sinkPanel:    col.sinkPanel || false,
        _height:      col.height,
        deskHeight:    col.deskHeight,
        deskClearance: col.deskClearance,
        hasDrawers:    col.hasDrawers,
        drawerHeight:  col.drawerHeight,
        deskDrawerCount: col.deskDrawerCount,
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
    target.type         = srcCopy.type;
    target.floorOffset  = srcCopy.floorOffset;
    target.noPlinth     = srcCopy.noPlinth;
    target.topPanel     = srcCopy.topPanel || false;
    target.sinkPanel    = srcCopy.sinkPanel || false;
    if (srcCopy.type === 'desk') {
        target.deskHeight     = srcCopy.deskHeight;
        target.deskClearance  = srcCopy.deskClearance;
        target.hasDrawers     = srcCopy.hasDrawers;
        target.drawerHeight   = srcCopy.drawerHeight;
        target.deskDrawerCount = srcCopy.deskDrawerCount;
    } else {
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

    const t = state.thickness;
    const baseY = (target.type === 'desk')
        ? (target.deskHeight + target.deskClearance)
        : Math.max(state.plinthHeight, target.floorOffset || 0);
    for (let r = 0; r < target.compartments.length; r++) {
        const comp = target.compartments[r];
        if (!comp || (comp.type !== 'internal_drawers' && comp.type !== 'external_drawers')) continue;
        const bottomY = (r === 0) ? baseY + t : (target.shelvesY[r - 1] || baseY) + t / 2;
        const topY    = (r >= target.shelvesY.length) ? savedHeight - t : target.shelvesY[r] - t / 2;
        const cellH   = Math.max(0, Math.round(topY - bottomY));
        if (cellH < 12) {
            comp.type = 'empty';
        } else {
            const minCount = calcMinDrawerCount(cellH);
            comp.count = Math.max(minCount, comp.count || 1);
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
// ─────────────────────────────────────────────────────────────────────────────

function toggleSelection(c, r) {
    _clearSubCellSelection();
    if (state.selection.colIndex !== c) {
        state.selection = { colIndex: c, rows: [r] };
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

// Toggle selection of a FC cell row
function _toggleFCSelection(r) {
    const idx = _fcSelection.rows.indexOf(r);
    if (idx === -1) _fcSelection.rows.push(r);
    else _fcSelection.rows.splice(idx, 1);
    // Refresh button appearances
    document.querySelectorAll('.fc-cell-btn').forEach(btn => {
        const row = parseInt(btn.dataset.fcRow);
        _applyFCBtnState(btn, row);
    });
    updateFCToolbarState();
}

window._clearFCSelection = function _clearFCSelection() {
    _fcSelection.rows = [];
    document.querySelectorAll('.fc-cell-btn').forEach(btn => {
        const row = parseInt(btn.dataset.fcRow);
        _applyFCBtnState(btn, row);
    });
    updateFCToolbarState();
}

// Apply visual state to a FC cell button based on selection + content
function _applyFCBtnState(btn, r) {
    const fcSide = state.activeWing ? state.activeWing.replace('full_corner_', '') : null;
    const fc = fcSide && state.wings[fcSide] ? state.wings[fcSide].fullCorner : null;
    const comp = (fc && fc.compartments && fc.compartments[r]) || {};
    const content = comp.content !== undefined ? comp.content : (comp.type === 'cross_hanging' ? 'cross_hanging' : 'empty');
    const door = comp.door !== undefined ? comp.door : (comp.type === 'door_regular' || comp.type === 'door_glass' ? 'right' : 'empty');
    const hasContent = content !== 'empty' || door !== 'empty';
    const isSelected = _fcSelection.rows.includes(r);

    const cellH = btn.dataset.fcHeight ? `${btn.dataset.fcHeight}` : '';
    if (isSelected) {
        btn.style.background = 'var(--secondary, #10b981)';
        btn.style.color = '#fff';
        btn.style.width = '30px';
        btn.style.height = '30px';
        btn.style.padding = '0';
        btn.style.borderRadius = '6px';
        btn.innerHTML = '<i class="fa-solid fa-check" style="font-size:1rem;"></i>';
        btn.title = 'תא נבחר — לחץ לביטול';
    } else if (hasContent) {
        btn.style.background = 'rgba(30,30,40,0.82)';
        btn.style.color = '#fff';
        btn.style.width = 'auto';
        btn.style.padding = '4px 10px';
        btn.style.borderRadius = '20px';
        btn.innerHTML = `
            <div style="display:flex;align-items:center;gap:8px;">
                <i class="fa-solid fa-trash fc-cell-delete" style="cursor:pointer;transition:color 0.2s;" onmouseenter="this.style.color='#ffcccc'" onmouseleave="this.style.color=''"></i>
                <div style="width:1px;height:14px;background:rgba(255,255,255,0.4);"></div>
                ${cellH ? `<span style="font-size:0.72rem;font-weight:700;opacity:0.85;">${cellH}</span><div style="width:1px;height:14px;background:rgba(255,255,255,0.4);"></div>` : ''}
                <i class="fa-solid fa-plus" style="font-size:0.8rem;"></i>
            </div>`;
        btn.title = 'לחץ לבחירה';
    } else {
        btn.style.background = 'rgba(30,30,40,0.75)';
        btn.style.color = '#fff';
        btn.style.width = 'auto';
        btn.style.padding = '4px 10px';
        btn.style.borderRadius = '20px';
        btn.innerHTML = `
            <div style="display:flex;align-items:center;gap:6px;">
                ${cellH ? `<span style="font-size:0.72rem;font-weight:700;opacity:0.85;">${cellH}</span><div style="width:1px;height:14px;background:rgba(255,255,255,0.4);"></div>` : ''}
                <i class="fa-solid fa-plus" style="font-size:0.8rem;"></i>
            </div>`;
        btn.title = 'לחץ לבחירה';
    }
}

function _rebuildFCCellButtons(fcRealSide, wingData, fc, allY, comps, fcGroup, localCenterX, localCenterZ) {
    document.querySelectorAll('.fc-cell-btn').forEach(el => el.remove());
    _fcCellBtnSide = fcRealSide;
    _fcCellBtnCount = allY.length - 1;
    // Clear selection when rebuilding
    _fcSelection.rows = [];

    for (let r = 0; r < allY.length - 1; r++) {
        const btn = document.createElement('button');
        btn.className = 'fc-cell-btn plus-btn';
        btn.dataset.fcRow = r;
        btn.dataset.fcHeight = Math.round(allY[r + 1] - allY[r]);
        btn.style.cssText = 'position:absolute;left:0;top:0;transform:translate(-50%,-50%);z-index:40;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:1rem;transition:background 0.15s;min-width:26px;height:26px;';

        _applyFCBtnState(btn, r);

        btn.addEventListener('pointerdown', e => e.stopPropagation());
        btn.addEventListener('mousedown', e => e.stopPropagation());
        btn.addEventListener('click', e => {
            e.stopPropagation();
            e.preventDefault();
            // Delete button inside pill
            if (e.target.classList.contains('fc-cell-delete') || e.target.closest('.fc-cell-delete')) {
                const fcSide2 = state.activeWing.replace('full_corner_', '');
                const wd2 = state.wings[fcSide2];
                if (wd2 && wd2.fullCorner && wd2.fullCorner.compartments[r]) {
                    wd2.fullCorner.compartments[r] = { content: 'empty', door: 'empty' };
                }
                buildCabinet(); calculatePrice(); saveHistoryState();
                return;
            }
            _toggleFCSelection(r);
        });

        container.appendChild(btn);
    }
    updateFCToolbarState();
}

// ---- FC Toolbar state update ----
window.updateFCToolbarState = function() {
    const toolbar = document.getElementById('fc-toolbar');
    if (!toolbar) return;

    const isFCEditMode = state.wingEditMode &&
        (state.activeWing === 'full_corner_right' || state.activeWing === 'full_corner_left');

    if (!isFCEditMode || _fcSelection.rows.length === 0) {
        toolbar.classList.remove('show-toolbar');
        const dsp = document.getElementById('fc-door-style-panel');
        if (dsp) dsp.style.display = 'none';
        return;
    }

    toolbar.classList.add('show-toolbar');

    // Position toolbar near center of FC unit
    const fcRealSide = state.activeWing.replace('full_corner_', '');
    const fcGroup = window[`_fullCornerGroup_${fcRealSide}`];
    if (fcGroup) {
        const wingData = state.wings[fcRealSide];
        const fc = wingData && wingData.fullCorner;
        const cw_px = container.clientWidth;
        const ch_px = container.clientHeight;
        const fcSize = (fc && fc.size) || 100;
        const sign = (fcRealSide === 'right') ? 1 : -1;
        const centerWing = state.wings.center;
        const bodyD = centerWing ? centerWing.depth : (wingData ? wingData.depth : 54);
        const localCenterX = -sign * fcSize / 2;
        const localCenterZ = bodyD / 2;
        const midRow = _fcSelection.rows[Math.floor(_fcSelection.rows.length / 2)];
        const allY2 = fc ? [wingData.plinthHeight + (wingData.thickness || 1.7), ...(fc.shelvesY || []), wingData.globalHeight - (wingData.thickness || 1.7)] : [];
        const midY = allY2.length > midRow + 1 ? (allY2[midRow] + allY2[midRow + 1]) / 2 : (wingData ? wingData.globalHeight / 2 : 120);
        fcGroup.updateMatrixWorld(true);
        const localPt = new THREE.Vector3(localCenterX, midY, localCenterZ);
        localPt.applyMatrix4(fcGroup.matrixWorld);
        const projected = localPt.clone().project(camera);
        let tx = (projected.x * 0.5 + 0.5) * cw_px;
        let ty = (-projected.y * 0.5 + 0.5) * ch_px;
        const tw = toolbar.offsetWidth || 300;
        const th = toolbar.offsetHeight || 60;
        tx = Math.max(tw / 2 + 10, Math.min(cw_px - tw / 2 - 10, tx));
        ty = Math.max(th / 2 + 10, Math.min(ch_px - th / 2 - 10, ty));
        toolbar.style.left = `${tx}px`;
        toolbar.style.top = `${ty}px`;
    }

    // Highlight buttons based on first selected row
    const fcSide = state.activeWing.replace('full_corner_', '');
    const fc2 = state.wings[fcSide] && state.wings[fcSide].fullCorner;
    const firstComp = (fc2 && fc2.compartments && fc2.compartments[_fcSelection.rows[0]]) || {};
    const content = firstComp.content !== undefined ? firstComp.content : (firstComp.type === 'cross_hanging' ? 'cross_hanging' : 'empty');
    const door = firstComp.door !== undefined ? firstComp.door : (firstComp.type === 'door_regular' || firstComp.type === 'door_glass' ? 'right' : 'empty');
    const doorStyle = firstComp.doorStyle || 'solid';

    document.getElementById('fc-btn-hanging')?.classList.toggle('active', content === 'cross_hanging');
    document.getElementById('fc-btn-empty-content')?.classList.toggle('active', content === 'empty');
    // Door: 'on' button active when any non-empty door is set; 'empty' button active when no door
    document.getElementById('fc-btn-door-on')?.classList.toggle('active', door !== 'empty');
    document.getElementById('fc-btn-door-empty')?.classList.toggle('active', door === 'empty');

    // Door style inline sub-panel — show when door is active, hide otherwise
    const dsp = document.getElementById('fc-door-style-panel');
    if (dsp) {
        dsp.style.display = (door !== 'empty') ? 'flex' : 'none';
        if (door !== 'empty') {
            dsp.querySelectorAll('button[data-fc-door-style]').forEach(b => {
                b.classList.toggle('active', b.dataset.fcDoorStyle === doorStyle);
            });
        }
    }
};

// ---- FC apply functions ----
window.applyFCContent = function(contentType) {
    const fcSide = state.activeWing ? state.activeWing.replace('full_corner_', '') : null;
    if (!fcSide) return;
    window.updateFullCornerContent(_fcSelection.rows, contentType);
    document.querySelectorAll('.fc-cell-btn').forEach(btn => _applyFCBtnState(btn, parseInt(btn.dataset.fcRow)));
    _clearFCSelection(); // close toolbar after applying
};

window.applyFCDoor = function(doorType) {
    const fcSide = state.activeWing ? state.activeWing.replace('full_corner_', '') : null;
    if (!fcSide) return;
    // 'on' maps to 'right' internally (both doors always shown together)
    const internalDoorType = doorType === 'on' ? 'right' : doorType;
    window.updateFullCornerDoor(_fcSelection.rows, internalDoorType);
    document.querySelectorAll('.fc-cell-btn').forEach(btn => _applyFCBtnState(btn, parseInt(btn.dataset.fcRow)));
    _clearFCSelection(); // close toolbar after applying
};

window.applyFCDoorStyle = function(style) {
    const fcSide = state.activeWing ? state.activeWing.replace('full_corner_', '') : null;
    if (!fcSide) return;
    window.updateFullCornerDoorStyle(_fcSelection.rows, style);
    _clearFCSelection(); // close toolbar after applying
};

// ── Global splitY sync helper ────────────────────────────────────────────────
// Updates splitY on ALL columns across ALL wings AND all full corner units.
// This ensures the קושרת is always at the same height throughout the entire wardrobe.
function _syncAllSplitY(newSplitY) {
    // 1. Update all columns in the active wing (state.columns proxy)
    state.columns.forEach(c => { if (c.splitY) c.splitY = newSplitY; });
    // 2. Update columns in all other wings
    ['center', 'left', 'right'].forEach(side => {
        const w = state.wings[side];
        if (!w || !w.columns) return;
        w.columns.forEach(c => { if (c.splitY) c.splitY = newSplitY; });
        // 3. Update full corner unit splitY if present
        if (w.fullCorner && w.fullCorner.splitY) {
            w.fullCorner.splitY = newSplitY;
        }
    });
}

// ── FC Split (קושרת) drag handle ────────────────────────────────────────────
let _fcSplitDragSide = null;

function _rebuildFCSplitDragHandle(fcRealSide, wingData, fc) {
    // Remove any existing split drag handle
    document.querySelectorAll('.fc-split-drag').forEach(el => el.remove());
    _fcSplitDragSide = fcRealSide;

    if (!fc.splitY) return; // no split board → no handle

    const t = wingData.thickness || 1.7;
    const plinthH = wingData.plinthHeight || 7;
    const colH = wingData.globalHeight || 240;
    const threshold = typeof getSplitThreshold === 'function'
        ? getSplitThreshold(wingData)
        : ((wingData.boardMaterial || 'melamine') === 'sandwich' ? 240 : 270);
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
    let _isDragging = false;

    handle.addEventListener('pointerdown', e => {
        e.stopPropagation();
        e.preventDefault();
        _isDragging = true;
        _dragStartY = e.clientY;
        _dragStartSplitY = fc.splitY;
        handle.setPointerCapture(e.pointerId);
    });

    handle.addEventListener('pointermove', e => {
        if (!_isDragging) return;
        e.stopPropagation();
        const fcSide2 = state.activeWing.replace('full_corner_', '');
        const wd2 = state.wings[fcSide2];
        if (!wd2 || !wd2.fullCorner) return;
        const fc2 = wd2.fullCorner;

        // Convert pixel delta to cm
        const pxPerCm = container.clientHeight / colH;
        const deltaCm = -(e.clientY - _dragStartY) / pxPerCm;
        let newSplitY = _dragStartSplitY + deltaCm;

        // Clamp: must stay above plinth+t+MIN_GAP and below threshold and below colH-t-MIN_GAP
        // Also must not cross any shelf
        const shelvesY2 = fc2.shelvesY || [];
        const allY2 = [plinthH + t, ...shelvesY2, colH - t];
        // Find the neighbours of splitY in allY2 (splitY sits between two allY entries)
        // splitY is the top face of the double board; the board occupies splitY-2t .. splitY
        // Minimum: must leave MIN_GAP above the board bottom (splitY-2t) and below the board top (splitY)
        const minSplitY = plinthH + t + 2 * t + MIN_GAP;
        const maxSplitY = Math.min(threshold, colH - t - MIN_GAP);

        newSplitY = Math.max(minSplitY, Math.min(maxSplitY, newSplitY));
        newSplitY = Math.round(newSplitY * 10) / 10;

        _syncAllSplitY(newSplitY);
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

function _rebuildFCShelfDragHandles(fcRealSide, wingData, fc, shelvesY) {
    document.querySelectorAll('.fc-shelf-drag').forEach(el => el.remove());
    _fcShelfDragSide = fcRealSide;
    _fcShelfDragCount = shelvesY.length;

    const t = wingData.thickness || 1.7;
    const plinthH = wingData.plinthHeight || 7;
    const colH = wingData.globalHeight || 240;
    const innerH = colH - plinthH - 2 * t;
    const MIN_GAP = 20; // minimum cell height in cm

    shelvesY.forEach((sy, si) => {
        const handle = document.createElement('div');
        handle.className = 'fc-shelf-drag drag-handle';
        handle.dataset.fcShelfIdx = si;
        handle.style.cssText = 'position:absolute;left:0;top:0;transform:translate(-50%,-50%);z-index:45;width:25px;height:25px;border-radius:50%;background:white;border:2px solid var(--secondary);display:flex;align-items:center;justify-content:center;cursor:ns-resize;box-shadow:0 2px 6px rgba(0,0,0,0.2);';
        handle.innerHTML = '<i class="fa-solid fa-arrows-up-down" style="font-size:0.55rem;color:var(--secondary);"></i>';
        handle.title = 'גרור להזזת מדף';

        let _dragStartY = 0;
        let _dragStartSy = 0;
        let _isDragging = false;

        handle.addEventListener('pointerdown', e => {
            e.stopPropagation();
            e.preventDefault();
            _isDragging = true;
            _dragStartY = e.clientY;
            _dragStartSy = sy;
            handle.setPointerCapture(e.pointerId);
        });

        handle.addEventListener('pointermove', e => {
            if (!_isDragging) return;
            e.stopPropagation();
            const fcSide2 = state.activeWing.replace('full_corner_', '');
            const wd2 = state.wings[fcSide2];
            if (!wd2 || !wd2.fullCorner) return;
            const fc2 = wd2.fullCorner;
            const shelvesY2 = fc2.shelvesY || [];
            const allY2 = [plinthH + t, ...shelvesY2, colH - t];

            // Convert pixel delta to cm: use canvas height vs colH
            const pxPerCm = container.clientHeight / colH;
            const deltaCm = -(e.clientY - _dragStartY) / pxPerCm;
            let newSy = _dragStartSy + deltaCm;

            // Clamp between neighbours
            const prevY = allY2[si] || (plinthH + t);
            const nextY = allY2[si + 2] || (colH - t);
            newSy = Math.max(prevY + MIN_GAP, Math.min(nextY - MIN_GAP, newSy));
            newSy = Math.round(newSy * 10) / 10;

            fc2.shelvesY[si] = newSy;
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
    });
}

function _updateFCCellButtons() {
    const isFCEditMode = state.activeWing === 'full_corner_right' || state.activeWing === 'full_corner_left';
    if (!state.wingEditMode || !isFCEditMode) {
        document.querySelectorAll('.fc-cell-btn').forEach(el => el.remove());
        document.querySelectorAll('.fc-shelf-drag').forEach(el => el.remove());
        document.querySelectorAll('.fc-split-drag').forEach(el => el.remove());
        _fcCellBtnSide = null; _fcCellBtnCount = 0; _fcCellBtnStateKey = '';
        _fcShelfDragSide = null; _fcShelfDragCount = 0;
        _fcSplitDragSide = null;
        return;
    }

    const fcRealSide = state.activeWing.replace('full_corner_', '');
    const wingData = state.wings[fcRealSide];
    if (!wingData || !wingData.fullCorner) return;

    const fcGroup = window[`_fullCornerGroup_${fcRealSide}`];
    if (!fcGroup) return;

    const fc = wingData.fullCorner;
    const cw_px = container.clientWidth;
    const ch_px = container.clientHeight;

    const centerWing = state.wings.center;
    const bodyD = centerWing ? centerWing.depth : (wingData.depth || 54);
    const t = wingData.thickness || 1.7;
    const plinthH = wingData.plinthHeight || 7;
    const colH = wingData.globalHeight || 240;
    const fcSize = fc.size || 100;
    const frontD = bodyD;
    const sign = (fcRealSide === 'right') ? 1 : -1;

    const shelvesY = fc.shelvesY || [];
    const allY = [plinthH + t, ...shelvesY, colH - t];
    const comps = fc.compartments || [];

    const localCenterX = -sign * fcSize / 2;
    const localCenterZ = frontD / 2;

    fcGroup.updateMatrixWorld(true);

    // Rebuild cell buttons if structure or compartment state changed
    const stateKey = comps.map(c => (c && c.type) || 'empty').join(',');
    const needRebuildBtns = (_fcCellBtnSide !== fcRealSide || _fcCellBtnCount !== allY.length - 1 || _fcCellBtnStateKey !== stateKey);
    if (needRebuildBtns) {
        _fcCellBtnStateKey = stateKey;
        _rebuildFCCellButtons(fcRealSide, wingData, fc, allY, comps, fcGroup, localCenterX, localCenterZ);
    }

    // Rebuild shelf drag handles if structure changed
    const needRebuildDrag = (_fcShelfDragSide !== fcRealSide || _fcShelfDragCount !== shelvesY.length);
    if (needRebuildDrag) {
        _rebuildFCShelfDragHandles(fcRealSide, wingData, fc, shelvesY);
    }

    // Rebuild split drag handle if splitY presence changed
    const hasSplit = !!fc.splitY;
    const splitHandleExists = !!document.querySelector('.fc-split-drag');
    if (_fcSplitDragSide !== fcRealSide || hasSplit !== splitHandleExists) {
        _rebuildFCSplitDragHandle(fcRealSide, wingData, fc);
    }

    // Update positions of cell buttons every frame
    const cellBtns = document.querySelectorAll('.fc-cell-btn');
    for (let r = 0; r < allY.length - 1; r++) {
        const btn = cellBtns[r];
        if (!btn) continue;
        const midY = (allY[r] + allY[r + 1]) / 2;
        const localPt = new THREE.Vector3(localCenterX, midY, localCenterZ);
        localPt.applyMatrix4(fcGroup.matrixWorld);
        const projected = localPt.clone().project(camera);
        let bx = Math.max(20, Math.min(cw_px - 20, (projected.x * 0.5 + 0.5) * cw_px));
        let by = Math.max(20, Math.min(ch_px - 20, (-projected.y * 0.5 + 0.5) * ch_px));
        btn.style.left = `${bx}px`;
        btn.style.top = `${by}px`;
    }

    // Update positions of shelf drag handles every frame
    const dragHandles = document.querySelectorAll('.fc-shelf-drag');
    shelvesY.forEach((sy, si) => {
        const handle = dragHandles[si];
        if (!handle) return;
        const localPt = new THREE.Vector3(localCenterX, sy, localCenterZ);
        localPt.applyMatrix4(fcGroup.matrixWorld);
        const projected = localPt.clone().project(camera);
        let bx = Math.max(20, Math.min(cw_px - 20, (projected.x * 0.5 + 0.5) * cw_px));
        let by = Math.max(20, Math.min(ch_px - 20, (-projected.y * 0.5 + 0.5) * ch_px));
        handle.style.left = `${bx}px`;
        handle.style.top = `${by}px`;
    });

    // Update position of split drag handle every frame
    const splitHandle = document.querySelector('.fc-split-drag');
    if (splitHandle && fc.splitY) {
        // Position at the center of the double-thickness board: fc.splitY (board occupies fc.splitY-t .. fc.splitY+t)
        const splitMidY = fc.splitY;
        const localPt = new THREE.Vector3(localCenterX, splitMidY, localCenterZ);
        localPt.applyMatrix4(fcGroup.matrixWorld);
        const projected = localPt.clone().project(camera);
        let bx = Math.max(20, Math.min(cw_px - 20, (projected.x * 0.5 + 0.5) * cw_px));
        let by = Math.max(20, Math.min(ch_px - 20, (-projected.y * 0.5 + 0.5) * ch_px));
        splitHandle.style.left = `${bx}px`;
        splitHandle.style.top = `${by}px`;
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
            // Transform from wing local space to world space
            window._activeWingGroup.updateMatrixWorld(true);
            localPt.applyMatrix4(window._activeWingGroup.matrixWorld);
        }
        return localPt.project(camera);
    };

    document.querySelectorAll('.dim-container, .select-all-col-btn, .sub-cell-btn, .cell-select-btn').forEach(el => {
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

window.toggleContentSubPanel = function(panelKey, triggerBtn) {
    const panels = { hanging: 'hanging-sub-panel', drawer: 'drawer-sub-panel', honeycomb: 'honeycomb-sub-panel' };
    const triggerBtnIds = { hanging: 'tb-btn-hanging', drawer: 'tb-btn-drawer', honeycomb: 'tb-btn-honeycomb' };
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
const _MERGE_ZONE_TYPES = new Set([..._DOOR_ZONE_TYPES, 'honeycomb']);
const _INTERIOR_ZONE_TYPES = new Set(['hanging', 'sorbet', 'internal_drawers', 'external_drawers', 'honeycomb', 'open_cell', 'side_open_cell']);

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

function _zoneDrawerCountAt(sub, z, zoneH) {
    if (sub && Array.isArray(sub.zonesDrawerCount) && z >= 0 && sub.zonesDrawerCount[z] > 0) {
        return sub.zonesDrawerCount[z];
    }
    if (zoneH != null) {
        const auto = calcAutoDrawerCount(zoneH);
        const min = calcMinDrawerCount(zoneH);
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
// Maps open_cell/side_open_cell → honeycomb for sub-cell context
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

    // Map open_cell / side_open_cell → honeycomb for sub-cell context
    const subType = (type === 'open_cell' || type === 'side_open_cell') ? 'honeycomb' : type;
    const force = !!(opts && opts.force);
    const selectedKeys = _sortedSubKeys(_activeSubCellIdxs);
    const isDoorType = _isDoorZoneType(subType);
    const isInteriorType = _INTERIOR_ZONE_TYPES.has(subType) || subType === 'empty';

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
        activateOpenCellTab = subType === 'honeycomb' && !togglingOff;
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
            if (subType === 'honeycomb' && newType === 'honeycomb') activateOpenCellTab = true;
            sub.zonesType[z] = newType;
            if (newType === 'internal_drawers' || newType === 'external_drawers') {
                const zoneH = _getSubZoneHeightCm(state.columns[c], r, sub, z);
                const auto = calcAutoDrawerCount(zoneH);
                const min = calcMinDrawerCount(zoneH);
                _setZoneDrawerCount(sub, z, Math.max(min, auto || 1));
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
    const t = state.thickness;
    const divs = col.compartments.map((comp, i) => {
        if (i === 0) return null;
        // shelvesY[i-1] is the Y of the shelf between row i-1 and row i
        return col.shelvesY && col.shelvesY[i - 1] !== undefined ? col.shelvesY[i - 1] : null;
    });
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
    ['hanging-sub-panel','drawer-sub-panel','honeycomb-sub-panel',
     'door-style-panel-right','door-style-panel-left','door-style-panel-double'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });
    // Clear trigger button highlights
    ['tb-btn-hanging','tb-btn-drawer','tb-btn-honeycomb'].forEach(id => {
        const btn = document.getElementById(id);
        if (btn) btn.classList.remove('sub-panel-open');
    });
    // Also restore main toolbar section if subcell toolbar is open
    closeSubcellToolbar();
};

// applyContentForce: always sets the type (no toggle) — used by sub-panel buttons
// When _activeSubCellIdx is set, routes to setSubCellType instead
window.applyContentForce = function(type) {
    _dbgHangSnapshot('applyContentForce IN type=' + type);
    if (state.selection.colIndex === -1 || state.selection.rows.length === 0) {
        _dbgHang('applyContentForce ABORT: no selection');
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
            if (cellH < 12) {
                blockedCount++;
                return;
            }
            col.compartments[r].type = newType;
            col.compartments[r].count = calcAutoDrawerCount(cellH);
        } else {
            col.compartments[r].type = newType;
        }

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
    });

    if (blockedCount > 0) {
        const toast = document.createElement('div');
        toast.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:rgba(239,68,68,0.95);color:white;padding:10px 20px;border-radius:12px;font-weight:600;font-size:0.9rem;z-index:9999;box-shadow:0 4px 16px rgba(0,0,0,0.2);pointer-events:none;';
        toast.innerText = 'גובה התא קטן מ-12 ס"מ — לא ניתן להוסיף מגירה';
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
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

window.applyContent = function(type) {
    _dbgHangSnapshot('applyContent IN type=' + type);
    if (state.selection.colIndex === -1 || state.selection.rows.length === 0) {
        _dbgHang('applyContent ABORT: no selection');
        return;
    }

    const c = state.selection.colIndex;

    // Partition is always cell-level — never store as zone content via setSubCellType
    if (type === 'partition') {
        _dbgHang('applyContent partition toggle on col', c, 'rows', state.selection.rows.slice());
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
                    const prevType = comp.type || 'empty';
                    const migratable = (prevType === 'hanging' || prevType === 'sorbet' ||
                        prevType === 'internal_drawers' || prevType === 'external_drawers');
                    comp.partition = true;
                    comp.partitions = [0.5];
                    if (migratable) {
                        comp.subCells = [
                            { type: prevType, shelves: 0, zonesType: [prevType] },
                            { type: prevType, shelves: 0, zonesType: [prevType] }
                        ];
                        comp.type = 'empty';
                    } else {
                        comp.subCells = [{ type: 'empty', shelves: 0 }, { type: 'empty', shelves: 0 }];
                    }
                    // Keep existing column overlay doors — they cover the partition from outside.
                    _dbgHang('partition ON', { c, r, prevType, migratable, onlyThisCol: true });
                }
        });
        // Sanity: log neighboring columns' partition flags (detect accidental multi-col apply)
        state.columns.forEach(function (col, ci) {
            (col.compartments || []).forEach(function (comp, ri) {
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
            if (cellH < 12) {
                blockedCount++;
                return; // skip this row
            }
            // Auto-set drawer count based on cell height
            col.compartments[r].type = newType;
            col.compartments[r].count = calcAutoDrawerCount(cellH);
        } else {
            col.compartments[r].type = newType;
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
    });

    if (blockedCount > 0) {
        const toast = document.createElement('div');
        toast.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:rgba(239,68,68,0.95);color:white;padding:10px 20px;border-radius:12px;font-weight:600;font-size:0.9rem;z-index:9999;box-shadow:0 4px 16px rgba(0,0,0,0.2);pointer-events:none;';
        toast.innerText = 'גובה התא קטן מ-23 ס"מ — לא ניתן להוסיף מגירה';
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
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

    // Height > threshold: prevent a door from spanning across the split board boundary.
    // Doors are allowed on either the lower unit OR the upper unit independently.
    if (type !== 'empty') {
        const col = state.columns[c];
        if (col.height > getSplitThreshold() && col.splitY) {
            // Number of shelves that are below the split board = lower-unit row count - 1
            // shelvesY entries below splitY belong to the lower unit
            const bottomShelves = col.shelvesY.filter(y => y < col.splitY).length;
            // splitRowBoundary: first row index of the upper unit
            // rows 0 .. bottomShelves  → lower unit  (bottomShelves+1 compartments)
            // rows bottomShelves+1 .. end → upper unit
            const splitRowBoundary = bottomShelves + 1;
            const selectionCrossesplit = startR < splitRowBoundary && endR >= splitRowBoundary;
            if (selectionCrossesplit) {
                // Clip to whichever unit contains the majority of the selection
                const belowCount = splitRowBoundary - startR;
                const aboveCount = endR - splitRowBoundary + 1;
                if (belowCount >= aboveCount) {
                    endR = splitRowBoundary - 1;
                } else {
                    startR = splitRowBoundary;
                }
                _showToast('לא ניתן להחיל דלת על שתי היחידות יחד — הדלת הוחלה על יחידה אחת בלבד', 3500);
            }
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
    const baseY = (col.type === 'desk') ? col.deskHeight + col.deskClearance : state.plinthHeight;

    // If there is a splitY crossing the span, equalize each sub-span independently
    const splitY = col.splitY;
    const splitCrossed = splitY && splitY > baseY + t && splitY < col.height - t;

    const _equalizeSubSpan = (subStart, subEnd) => {
        if (subEnd <= subStart) return;

        // Blueprint cell height formula: cellHeight = shelvesY[k] - prevBound - t
        // where prevBound is the previous shelf's bottom edge (or baseY for the first cell)
        // rowBounds = [baseY, shelvesY[subStart], ..., shelvesY[subEnd-1], topBound]
        // So: shelvesY[k] = prevBound + cellHeight + t

        // Bottom bound: baseY (top of plinth / desk base) — NOT baseY+t
        const bottomBound = (subStart === 0) ? baseY
            : (col.shelvesY[subStart - 1] !== undefined ? col.shelvesY[subStart - 1] : baseY);
        // Top bound: col.height (or bottom of next shelf above span)
        const topBound = (subEnd >= col.shelvesY.length) ? col.height
            : (col.shelvesY[subEnd] !== undefined ? col.shelvesY[subEnd] : col.height);

        const numCells = subEnd - subStart + 1;
        const tMM = Math.round(t * 10); // shelf thickness in whole mm

        // Total span = bottomBound..topBound
        // Each cell contributes: cellMM + tMM (cell height + shelf board above it)
        // So: pureCellSpaceMM = totalSpanMM - numCells * tMM
        const totalSpanMM = Math.round((topBound - bottomBound) * 10);
        const pureCellSpaceMM = totalSpanMM - numCells * tMM;

        // Distribute in whole mm: bottom N cells get (floor+1), rest get floor
        // e.g. 803mm / 3 = 267.666 → numLargerCells=2, bottom 2 cells=268mm, top cell=267mm
        // e.g. 900mm / 3 = 300 exactly → numLargerCells=0, all cells=300mm
        const floorCellMM = Math.floor(pureCellSpaceMM / numCells);
        const numLargerCells = pureCellSpaceMM % numCells;

        // Place internal shelves (indices subStart..subEnd-1)
        // shelvesY[i] = bottomBound + sum of (cellMM + tMM) for cells 0..k
        let curPosMM = Math.round(bottomBound * 10);
        for (let i = subStart; i < subEnd; i++) {
            const k = i - subStart; // 0-based index of this shelf
            const thisCellMM = (k < numLargerCells) ? (floorCellMM + 1) : floorCellMM;
            curPosMM += thisCellMM + tMM; // cell height + shelf board thickness
            col.shelvesY[i] = curPosMM / 10;
        }
    };

    if (splitCrossed) {
        // Find which rows are below split and which are above
        // splitY is between shelvesY entries; find the split shelf index
        // The split board sits at splitY; rows below it end at the row whose top is splitY
        // shelvesY is sorted; find first shelf >= splitY
        const splitShelfIdx = col.shelvesY.findIndex(y => y >= splitY);
        // splitShelfIdx is the index of the first shelf in the upper section
        // rows 0..splitShelfIdx-1 are below split, rows splitShelfIdx..numRows-1 are above
        const splitRowBoundary = (splitShelfIdx === -1) ? col.shelvesY.length : splitShelfIdx;

        // Equalize below-split sub-span (clamped to selected range)
        const belowStart = startR;
        const belowEnd = Math.min(endR, splitRowBoundary - 1);
        if (belowEnd >= belowStart + 1) _equalizeSubSpan(belowStart, belowEnd);

        // Equalize above-split sub-span (clamped to selected range)
        const aboveStart = Math.max(startR, splitRowBoundary);
        const aboveEnd = endR;
        if (aboveEnd >= aboveStart + 1) _equalizeSubSpan(aboveStart, aboveEnd);
    } else {
        _equalizeSubSpan(startR, endR);
    }

    buildCabinet(); calculatePrice(); saveHistoryState();
};

window.updateDrawerCount = function(delta) {
    if (state.selection.colIndex === -1 || state.selection.rows.length === 0) return;
    const c = state.selection.colIndex;
    const col = state.columns[c];
    let changed = false;

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
                const minCount = calcMinDrawerCount(zoneH);
                const cur = _zoneDrawerCountAt(sub, z, zoneH);
                const newCount = Math.max(minCount, Math.min(8, cur + delta));
                if (newCount !== cur) {
                    _setZoneDrawerCount(sub, z, newCount);
                    changed = true;
                }
            });
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
            const minCount = calcMinDrawerCount(cellH);
            let newCount = comp.count + delta;
            // Clamp: minimum enforced by cell height, maximum 8
            newCount = Math.max(minCount, Math.min(8, newCount));
            if (newCount !== comp.count) {
                comp.count = newCount;
                changed = true;
            }
        }
    });

    if (changed) {
        buildCabinet(); calculatePrice(); saveHistoryState();
    }
};

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
                }
                handle.querySelector('.drag-tooltip').innerText = `מגירה: ${newDH} ס"מ`;
                buildCabinetDragging();
            });
            window.addEventListener('pointerup', () => { if(isDragging){ isDragging = false; handle.classList.remove('active'); controls.enabled = true; document.body.classList.remove('dragging'); _endDrag(); calculatePrice(); saveHistoryState(); }});
        }
    });

    // Determine which column to show roof/floor handle for:
    // During an active roof or floor drag, always show the dragged column's handle (even if hover moved away)
    const _roofDragActive = window._roofDrag;
    const _floorDragActiveGlobal = window._floorDrag;
    const _roofColIndex = _roofDragActive ? _roofDragActive.colIndex
        : _floorDragActiveGlobal ? _floorDragActiveGlobal.colIndex
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
            // Store colIndex + shelfIdx for snap highlight lookup
            if (!v.isSplit && !v.isInternalDeskSurface && !v.isInternalDeskClearance && !v.isInternalDeskDrawer && !v.isSubCellShelf) {
                sHandle.dataset.colIndex = v.colIndex;
                sHandle.dataset.shelfIdx = v.shelfIdx;
            }
            dragLayer.appendChild(sHandle);
            
            let startMouseY = 0, startY = 0, isDragging = false;
            sHandle.addEventListener('pointerdown', e => {
                isDragging = true; startMouseY = e.clientY;
                if(v.isSplit) startY = col.splitY;
                else if(v.isInternalDeskSurface) startY = col.deskHeight;
                else if(v.isInternalDeskClearance) startY = col.deskHeight + col.deskClearance;
                else if(v.isInternalDeskDrawer) startY = col.drawerHeight;
                else if(v.isSubCellShelf) {
                    const _comp = col.compartments[v.rowIndex];
                    const _sub = _comp && _comp.subCells && _comp.subCells[v.subCellIdx];
                    startY = _sub && _sub.shelvesY ? _sub.shelvesY[v.subShelfIdx] : v.y;
                }
                else startY = col.shelvesY[v.shelfIdx];
                sHandle.classList.add('active'); controls.enabled = false; document.body.classList.add('dragging');
            });
            window.addEventListener('pointermove', e => {
                if (!isDragging) return;
                e.preventDefault();
                const pxToCm = 100 / (Math.abs(new THREE.Vector3(0,100,0).project(camera).y - new THREE.Vector3(0,0,0).project(camera).y) * container.clientHeight / 2);
                const deltaCm = -(e.clientY - startMouseY) * pxToCm;
                const t = state.thickness;

                if (v.isSubCellShelf) {
                    const _comp = col.compartments[v.rowIndex];
                    const _sub = _comp && _comp.subCells && _comp.subCells[v.subCellIdx];
                    if (!_sub || !Array.isArray(_sub.shelvesY)) return;
                    const { prevY: compPrevY, compH } = _getSubCellCompBounds(col, v.rowIndex);
                    const compTopY = compPrevY + compH;
                    // Obstacles: comp boundaries + other shelves in same sub-cell
                    const obs = [compPrevY + t/2, compTopY - t/2];
                    _sub.shelvesY.forEach((y, i) => { if (i !== v.subShelfIdx) obs.push(y); });
                    const limitMin = Math.max(...obs.filter(y => y < startY)) + MIN_SHELF_GAP + t;
                    const limitMax = Math.min(...obs.filter(y => y > startY)) - MIN_SHELF_GAP - t;
                    const newY = Math.round(Math.max(limitMin, Math.min(limitMax, startY + deltaCm)) * 10) / 10;
                    _sub.shelvesY[v.subShelfIdx] = newY;
                    const aboveH = newY - (v.subShelfIdx > 0 ? _sub.shelvesY[v.subShelfIdx - 1] : compPrevY);
                    const belowH = (v.subShelfIdx < _sub.shelvesY.length - 1 ? _sub.shelvesY[v.subShelfIdx + 1] : compTopY) - newY;
                    sHandle.querySelector('.drag-tooltip').innerText = `מעל: ${Math.round(aboveH)} ס"מ | מתחת: ${Math.round(belowH)} ס"מ`;
                    buildCabinetDragging();
                }
                else if (v.isSplit) {
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
                    _syncAllSplitY(newSplitY);
                } 
                else if (v.isInternalDeskSurface) {
                    col.deskHeight = Math.round(Math.max(50, Math.min(col.deskHeight + col.deskClearance - MIN_SHELF_GAP, startY + deltaCm)));
                    distributeShelves(col);
                }
                else if (v.isInternalDeskClearance) {
                    let maxLimits = col.shelvesY.length > 0 ? col.shelvesY[0] - MIN_SHELF_GAP : col.height - MIN_SHELF_GAP;
                    if (col.splitY) maxLimits = Math.min(maxLimits, col.splitY - MIN_SHELF_GAP);
                    let desiredY = Math.round(Math.max(col.deskHeight + 30, Math.min(maxLimits, startY + deltaCm)));
                    col.deskClearance = desiredY - col.deskHeight;
                    distributeShelves(col);
                }
                else if (v.isInternalDeskDrawer) {
                    col.drawerHeight = Math.round(Math.max(8, Math.min(40, startY - deltaCm)));
                }
                else {
                    const cBaseY = col.type === 'desk' ? col.deskHeight + col.deskClearance : state.plinthHeight;
                    let obs = [cBaseY + t/2, col.height - t/2];
                    // splitY is intentionally NOT added as an obstacle — shelves can cross the split crossbar
                    col.shelvesY.forEach((y, i) => { if (i !== v.shelfIdx) obs.push(y); });

                    const limitMin = Math.max(...obs.filter(y => y < startY)) + MIN_SHELF_GAP + t;
                    const limitMax = Math.min(...obs.filter(y => y > startY)) - MIN_SHELF_GAP - t;
                    // Round to 0.1cm (1mm) — same resolution as _distributeShelves
                    let newY = Math.round(Math.max(limitMin, Math.min(limitMax, startY + deltaCm)) * 10) / 10;

                    // ── Snap + highlight: if within 5mm of a neighbor shelf, snap to it ──
                    const SNAP_THRESHOLD = 0.5; // 5mm in cm
                    let highlightNeighborColIdx = -1;
                    let highlightNeighborShelfIdx = -1;
                    let bestDist = SNAP_THRESHOLD + 1;
                    [-1, 1].forEach(offset => {
                        const nc = v.colIndex + offset;
                        if (nc < 0 || nc >= state.columns.length) return;
                        const neighbor = state.columns[nc];
                        if (!neighbor || !neighbor.shelvesY) return;
                        neighbor.shelvesY.forEach((ny, ni) => {
                            const dist = Math.abs(ny - newY);
                            if (dist <= SNAP_THRESHOLD && dist < bestDist) {
                                // Only snap if the snapped position is within limits
                                if (ny >= limitMin && ny <= limitMax) {
                                    bestDist = dist;
                                    highlightNeighborColIdx = nc;
                                    highlightNeighborShelfIdx = ni;
                                    newY = ny; // snap to neighbor's exact position
                                }
                            }
                        });
                    });

                    col.shelvesY[v.shelfIdx] = newY; // apply position to state

                    // Store snap info for engine.js shelf material highlight + handle highlight
                    if (highlightNeighborColIdx !== -1) {
                        window._snapHighlight = {
                            colIdx: v.colIndex,
                            shelfIdx: v.shelfIdx,
                            neighborColIdx: highlightNeighborColIdx,
                            neighborShelfIdx: highlightNeighborShelfIdx
                        };
                    } else {
                        window._snapHighlight = null;
                    }
                    sHandle._highlightNeighborColIdx = highlightNeighborColIdx;
                    sHandle._highlightNeighborShelfIdx = highlightNeighborShelfIdx;
                    // ─────────────────────────────────────────────────────────────────

                    // Auto-update drawer counts for the two cells adjacent to the moved shelf
                    // Also check sorbet minimum height — if violated, snap shelf back and ask user
                    let _sorbetBlocked = false;
                    const _checkSorbetRow = (r) => {
                        const comp = col.compartments[r];
                        if (!comp || comp.type !== 'sorbet') return false;
                        return _cellHeight(col, r) < 110;
                    };
                    if (_checkSorbetRow(v.shelfIdx) || _checkSorbetRow(v.shelfIdx + 1)) {
                        // Revert shelf to original position
                        col.shelvesY[v.shelfIdx] = startY;
                        newY = startY;
                        _sorbetBlocked = true;
                        // Stop drag immediately before showing dialog (dialog blocks pointer events)
                        isDragging = false;
                        sHandle.classList.remove('active');
                        controls.enabled = true;
                        window._snapHighlight = null;
                        // Ask user: delete sorbet or cancel
                        const blockedR = (_checkSorbetRow(v.shelfIdx)) ? v.shelfIdx : v.shelfIdx + 1;
                        if (confirm('הסורבטו דורש גובה תא מינימלי של 110 ס"מ.\nלמחוק את הסורבטו ולהמשיך?')) {
                            col.compartments[blockedR].type = 'empty';
                            col.shelvesY[v.shelfIdx] = Math.round(Math.max(limitMin, Math.min(limitMax, startY + deltaCm)) * 10) / 10;
                        }
                        buildCabinet(); saveHistoryState();
                        return;
                    }
                    if (!_sorbetBlocked) {
                        const _autoDrawerRow = (r) => {
                            const comp = col.compartments[r];
                            if (!comp || (comp.type !== 'internal_drawers' && comp.type !== 'external_drawers')) return;
                            const cellH = _cellHeight(col, r);
                            if (cellH < 12) { comp.type = 'empty'; return; }
                            comp.count = calcAutoDrawerCount(cellH);
                        };
                        _autoDrawerRow(v.shelfIdx);
                        _autoDrawerRow(v.shelfIdx + 1);
                    }
                }
                buildCabinetDragging();
                // Apply proximity highlight AFTER buildCabinetDragging (which rebuilds all handles)
                // Use the module-level _snapHighlight (survives handle rebuild)
                {
                    const snap = window._snapHighlight;
                    document.querySelectorAll('.drag-handle.vertical').forEach(h => {
                        const hCol = parseInt(h.dataset.colIndex);
                        const hShelf = parseInt(h.dataset.shelfIdx);
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
            window.addEventListener('pointerup', () => { if(isDragging){ isDragging = false; sHandle.classList.remove('active'); controls.enabled = true; document.body.classList.remove('dragging'); window._snapHighlight = null; _endDrag(); saveHistoryState(); }});
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

    updateOverlaysPosition();
    updateDragHandlesPosition();
}

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
        } else {
            const x3d = parseFloat(handle.dataset.x3d);
            const y3d = handle.dataset.y3d ? parseFloat(handle.dataset.y3d) : Math.max(...state.columns.map(c => c.height));
            worldPt = new THREE.Vector3(x3d, y3d, state.depth / 2);
            if (window._activeWingGroup) {
                window._activeWingGroup.updateMatrixWorld(true);
                worldPt.applyMatrix4(window._activeWingGroup.matrixWorld);
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
    const worldPt = new THREE.Vector3(bp.x, bedY, bp.z);
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
            startVal: axis === 'x' ? bp.x : bp.z
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

        if (d.axis === 'x') {
            bp.x = d.startVal + (e.clientX - d.startMouseX) / pxPerCmX;
        } else {
            // Z axis: drag up = move toward camera (smaller Z), drag down = away
            bp.z = d.startVal + (e.clientY - d.startMouseY) / pxPerCmZ;
        }
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
window._roomHeight        = window._roomHeight        || 0;   // 0 = auto (300cm default)
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
        if (cabHeightSlider) cabHeightSlider.max = v;
        if (cabHeightNum)    cabHeightNum.max    = v;
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

function _isCanvasOverlayUiTarget(el) {
    if (!el || !el.closest) return false;
    return !!el.closest(
        '#column-quick-edit, #full-corner-quick-edit, #bottom-floating-toolbar, #bed-toolbar, #room-props-row, #room-furniture-toolbar, #room-plan-layer, #btn-room-plan-view-toggle, ' +
        '.drag-handle, .dim-container, .plus-btn, .fc-cell-btn, .select-all-col-btn, .cell-select-btn, .sub-cell-btn'
    );
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
        if (btn) btn.onclick = function() { toggleContentSubPanel(key, this); };
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
        const val = e.target.value;
        state.cabinetModel = val;
        
        if (val === 'maya') state.plinthHeight = 7;
        else if (val === 'c9') state.plinthHeight = 8.75;
        else if (val === 'ab2') state.plinthHeight = 8.75;
        else         if (val === 'regalim') state.plinthHeight = 10;

        if (typeof window._setPlinthHeight === 'function') {
            window._setPlinthHeight(state.plinthHeight || 8.75);
        }
        
        state.manualPrice = null;
        
        if (val === 'ab2') {
            state.width = 160;
            state.globalHeight = 240;
            document.getElementById('inp-width').value = 160;
            document.getElementById('inp-num-width').value = 160;
            document.getElementById('inp-height').value = 240;
            document.getElementById('inp-num-height').value = 240;
            document.getElementById('inp-columns').value = 2;
            document.getElementById('val-columns').innerText = 2;
            
            distributeColumns(2);
            
            const rightCol = state.columns[1];
            if(rightCol) {
                rightCol.shelves = 5; 
                distributeShelves(rightCol); 
                
                if(rightCol.compartments.length > 0) {
                    const targetRow = 2; 
                    rightCol.compartments[targetRow].type = 'side_open_cell';
                    rightCol.doors = []; 
                }
            }
        } else {
            state.columns.forEach(col => distributeShelves(col)); 
        }
        
        checkSplits(); buildCabinet(); calculatePrice(); saveHistoryState();
    });

    const placementEl = document.getElementById('inp-placement');
    if (placementEl) {
        placementEl.addEventListener('change', (e) => {
            state.placement = (e.target.value === 'niche') ? 'wall' : e.target.value;
            buildCabinet(); calculatePrice(); saveHistoryState();
        });
    }

    document.getElementById('inp-desk-side').addEventListener('change', (e) => {
        state.desk.side = e.target.value; state.manualPrice = null;
        document.getElementById('desk-controls').style.display = (state.desk.side === 'none') ? 'none' : 'block';
        buildCabinet(); updateCameraView(); calculatePrice(); saveHistoryState();
    });
    
    document.getElementById('inp-desk-drawers').addEventListener('change', (e) => {
        state.desk.hasDrawers = e.target.checked; state.manualPrice = null;
        // Sync button-style UI (CSS handles styling via .active class)
        const hasD = e.target.checked;
        document.querySelectorAll('.desk-drawers-btn').forEach(function(b) {
            b.classList.toggle('active', (b.dataset.drawers === 'true') === hasD);
        });
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
    if (cabNameInp) cabNameInp.addEventListener('change', (e) => { state.cabinetName = e.target.value; saveHistoryState(); });

    const cabNotesInp = document.getElementById('inp-cabinet-notes');
    if (cabNotesInp) {
        cabNotesInp.addEventListener('input', (e) => {
            state.cabinetNotes = e.target.value;
            const mNotes = document.getElementById('mobile-inp-cabinet-notes');
            if (mNotes && mNotes.value !== e.target.value) mNotes.value = e.target.value;
        });
        cabNotesInp.addEventListener('change', () => saveHistoryState());
    }

    ['name', 'phone', 'order-num', 'address'].forEach(field => {
        const el = document.getElementById(`cust-${field}`);
        if(el) el.addEventListener('input', (e) => { 
            let key = field === 'order-num' ? 'orderNum' : field; state.customer[key] = e.target.value; 
        });
    });

    _bindOrderFormEditor();

    document.getElementById('inp-columns').addEventListener('input', (e) => {
        const val = parseInt(e.target.value);
        const valEl = document.getElementById('val-columns');
        if (valEl && !isNaN(val)) valEl.innerText = val;
    });
    document.getElementById('inp-columns').addEventListener('change', (e) => {
        const val = parseInt(e.target.value); state.manualPrice = null;
        document.getElementById('val-columns').innerText = val;
        distributeColumns(val); buildCabinet(); calculatePrice(); saveHistoryState();
    });

    // Show/hide colors not available in sandwich board material
    window._updateSandwichColorVisibility = function() {
        const isSandwich = state.boardMaterial === 'sandwich';
        // On the "חזיתות" (external fronts) tab, show ALL colors even in sandwich mode
        // because sandwich cabinet fronts are melamine and can use any melamine color
        const isExternalTab = state.activeColorPart === 'materialExternal';

        // Colors marked data-no-sandwich: hide on non-external tabs when sandwich is active;
        // show on ALL tabs when melamine is active, and also show on external tab even in sandwich mode
        document.querySelectorAll('.mat-item[data-no-sandwich="true"]').forEach(el => {
            el.style.display = (isSandwich && !isExternalTab) ? 'none' : '';
        });

        // If sandwich is active and a no-sandwich color is currently selected on any part, reset it
        // Exception: materialExternal is allowed to keep any color (fronts are melamine in sandwich)
        if (isSandwich) {
            const NO_SANDWICH = new Set(['c705','u727','w1200','u232','u604','u638','H1367','H1307','H1227']);
            ['materialBody','materialInternal','materialDesk','materialOpenCell','materialBack'].forEach(part => {
                if (NO_SANDWICH.has(state[part])) {
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
        btn.addEventListener('click', (e) => {
            const clickedPart = e.target.getAttribute('data-part');

            // Special: "חלק עליון" tab — delegate to _selectUpperUnitColorTab
            if (clickedPart === 'materialUpperUnit') {
                window._selectUpperUnitColorTab(e.target);
                return;
            }

            document.querySelectorAll('.part-tab-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            state.activeColorPart = clickedPart;
            _updateSandwichColorVisibility();

            document.querySelectorAll('.material-btn').forEach(b => b.classList.remove('active'));

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
                const isSelected = (hb.userData.colIndex === state.selection.colIndex && state.selection.rows.includes(hb.userData.rowIndex));
                const isHovered = (hb.userData.colIndex === state.hoveredColIndex);
                hb.material.opacity = isSelected ? 0.3 : (isHovered ? 0.05 : 0.0);
            });
            buildDragHandlesUI(); updateQuickEditPanelUI();
        } else if (hoverCol === -1 && state.hoveredColIndex !== -1) {
            state.hoveredColIndex = -1;
            hitBoxes.forEach(hb => {
                if (hb.userData.noHighlight) return; // invisible trigger zones — never show highlight
                const isSelected = (hb.userData.colIndex === state.selection.colIndex && state.selection.rows.includes(hb.userData.rowIndex));
                hb.material.opacity = isSelected ? 0.3 : 0.0;
            });
            buildDragHandlesUI();
        }

        const isOverUI = e.target.closest('#dimensions-layer, #buttons-layer, #drag-handles-layer, #column-quick-edit, #bottom-floating-toolbar');
        const isSelected = state.selection.colIndex !== -1;
        const shouldShowUI = (hoverCol !== -1) || isOverUI || isSelected || state.hoveredDesk;

        ['dimensions-layer', 'buttons-layer', 'drag-handles-layer'].forEach(id => {
            const layer = document.getElementById(id);
            if (layer) {
                if (shouldShowUI) {
                    layer.style.transition = 'none'; 
                    layer.style.opacity = '1';
                    layer.style.removeProperty('pointer-events');
                } else {
                    layer.style.transition = 'opacity 0.3s ease-out'; 
                    layer.style.opacity = '0';
                    layer.style.removeProperty('pointer-events');
                }
            }
        });
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
        ['dimensions-layer', 'buttons-layer', 'drag-handles-layer'].forEach(id => {
            const layer = document.getElementById(id);
            if (layer) {
                layer.style.transition = 'opacity 0.3s ease-out';
                layer.style.opacity = '0';
                layer.style.removeProperty('pointer-events');
            }
        });
    });

    // Track pointerdown position to distinguish click vs drag
    let _pointerDownX = 0, _pointerDownY = 0;
    let _pointerDownWingId = null; // wing hit at pointerdown (for click detection)
    let _pointerDownOnDeadSpace = false; // pointerdown on dead space in wing edit mode

    let _pointerDownCornerDesk = false;

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

        const rect = container.getBoundingClientRect();
        mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(mouse, camera);

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
        const activeCabinet = JSON.parse(JSON.stringify({
            cabinetModel: state.cabinetModel,
            placement: state.placement,
            width: state.width, globalHeight: state.globalHeight, depth: state.depth, thickness: state.thickness,
            plinthHeight: state.plinthHeight, hasDoors: state.hasDoors, handleType: state.handleType, handleStyle: state.handleStyle,
            cabinetName: state.cabinetName, cabinetNotes: state.cabinetNotes, manualPrice: state.manualPrice,
            boardMaterial: state.boardMaterial, materialBody: state.materialBody, materialInternal: state.materialInternal,
            materialExternal: state.materialExternal, materialDesk: state.materialDesk, materialOpenCell: state.materialOpenCell, materialBack: state.materialBack, columns: state.columns, desk: state.desk
        }));

        const projectData = {
            customer: state.customer,
            orderForm: state.orderForm,
            cart: state.orderCart,
            activeCabinet: activeCabinet,
            wings: state.wings,
            activeWing: state.activeWing,
            presetId: state.presetId
        };
        
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(projectData));
        const dlAnchorElem = document.createElement('a');
        dlAnchorElem.setAttribute("href", dataStr);
        let fileName = state.customer.name ? `hazmana_${state.customer.name}.json` : "hazmana_hadasha.json";
        dlAnchorElem.setAttribute("download", fileName);
        dlAnchorElem.click();
    });

    document.getElementById('inp-load-json').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const _doLoad = () => {
            const reader = new FileReader();
            reader.onload = function(ev) {
                try {
                    const data = JSON.parse(ev.target.result);
                    // Disconnect from cloud project — loading JSON creates a standalone session
                    window._currentProjectId   = null;
                    window._currentProjectName = null;
                    window._isDirty            = false;
                    // Clear ?project= param so refresh opens a blank editor (not old project)
                    if (history.replaceState) history.replaceState(null, '', 'index.html');
                if(data.customer) {
                    state.customer = data.customer;
                    document.getElementById('cust-name').value = state.customer.name || '';
                    document.getElementById('cust-phone').value = state.customer.phone || '';
                    document.getElementById('cust-order-num').value = state.customer.orderNum || '';
                    document.getElementById('cust-address').value = state.customer.address || '';
                }
                if (data.orderForm) state.orderForm = data.orderForm;
                if(data.cart) {
                    state.orderCart = data.cart;
                    const cc1 = document.getElementById('cart-count');
                    if (cc1) cc1.innerText = state.orderCart.length;
                    if (typeof window._ensureCabinetSelected === 'function') {
                        window._ensureCabinetSelected(
                            (typeof data.editingCartIndex === 'number') ? data.editingCartIndex : 0
                        );
                    } else {
                        updateLeftSidebar();
                    }
                }
                
                if(data.wings) {
                    // New format: restore full wings structure (incl. upperUnit_*)
                    if (typeof window._restoreWingsFromSaved === 'function') {
                        window._restoreWingsFromSaved(data.wings);
                    } else {
                        state.wings.center = data.wings.center || state.wings.center;
                        state.wings.left = data.wings.left || null;
                        state.wings.right = data.wings.right || null;
                    }
                    state.activeWing = data.activeWing || 'center';
                    // Restore presetId if present
                    if (data.presetId) {
                        state.presetId = data.presetId;
                        // Show/hide sliding door section based on preset
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
                        // Update preset button highlights
                        document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
                        const activePresetBtn = document.getElementById(`preset-btn-${data.presetId}`);
                        if (activePresetBtn) activePresetBtn.classList.add('active');
                        const mobileActivePresetBtn = document.getElementById(`mobile-preset-btn-${data.presetId}`);
                        if (mobileActivePresetBtn) mobileActivePresetBtn.classList.add('active');
                    }
                    // Show/hide wing tabs
                    ['left','right'].forEach(side => {
                        const tab = document.getElementById(`wing-tab-${side}`);
                        if (tab) tab.style.display = state.wings[side] ? '' : 'none';
                    });
                    document.querySelectorAll('.wing-tab-btn').forEach(b => {
                        b.classList.toggle('active', b.dataset.wing === state.activeWing);
                        b.style.background = b.dataset.wing === state.activeWing ? 'var(--accent)' : 'var(--bg-light)';
                        b.style.color = b.dataset.wing === state.activeWing ? 'white' : 'var(--text)';
                    });
                    syncSidebarToWing();
                    buildCabinet(); updateCameraView(); calculatePrice(); saveHistoryState();
                } else if(data.activeCabinet) {
                    // Legacy format: restore flat cabinet data into center wing
                    Object.assign(state, data.activeCabinet);
                    syncSidebarToWing();
                    buildCabinet(); updateCameraView(); calculatePrice(); saveHistoryState();
                }
                
                if (typeof _showToast === 'function') _showToast('הקובץ נטען בהצלחה ✓', 3000);
                else alert('הפרויקט נטען בהצלחה!');
            } catch(err) { alert('שגיאה בטעינת הקובץ.'); }
            };
            reader.readAsText(file);
        }; // end _doLoad

        // If a cloud project is open — warn before overwriting
        if (window._currentProjectId) {
            if (typeof window._confirmLeave === 'function') {
                window._confirmLeave(null, _doLoad);
            } else if (confirm('פרויקט ענן פתוח כעת. טעינת קובץ תנתק אותך ממנו (השינויים לא יישמרו). להמשיך?')) {
                _doLoad();
            }
        } else {
            _doLoad();
        }
        // Reset input so same file can be loaded again
        e.target.value = '';
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

// ---- Cart preview refresh (images stripped on project save — regenerate from rawState) ----
function _wingHeightFromData(wing, fallback) {
    if (!wing) return fallback || 240;
    if (wing.columns && wing.columns.length) {
        return Math.max(...wing.columns.map(c => c.height || fallback || 240));
    }
    return wing.globalHeight || fallback || 240;
}

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

    if (pid === 'corner-left') addWing('left', state.wings.left);
    else if (pid === 'corner-right') addWing('right', state.wings.right);
    else if (pid === 'walkin') {
        addWing('left', state.wings.left);
        addWing('right', state.wings.right);
    }
    return views;
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

    window._camAnim = null;
    state.viewMode = 'front';
    // Must set ALL wings — state.hasDoors only writes the active wing via proxy
    _setAllWingsHasDoors(hasDoors);

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

    // Ensure door meshes aren't hidden by the editor "הסתר חזיתות" toggle
    if (typeof doorMeshes !== 'undefined' && doorMeshes) {
        doorMeshes.forEach(function(m) { m.visible = !!hasDoors; });
    }
    ren.render(scn, cam);
    const dataUrl = ren.domElement.toDataURL('image/png');

    state.wingEditMode = savedWingEdit;
    state.activeWing = savedActiveWing;
    return dataUrl;
}

function _orderPreviewImagesHtml(item, rawState) {
    const multiFront = _cartHasMultiFrontViews(rawState);
    const centerOutLabel = multiFront ? 'תצוגת חוץ (חזית מרכזית)' : 'תצוגת חוץ (חזיתות)';
    const centerInLabel = multiFront ? 'תצוגת פנים (חזית מרכזית)' : 'תצוגת פנים (חלוקה טכנית)';
    let html = `
                    <div class="print-img-wrapper"><div class="img-label">${centerOutLabel}</div><img src="${item.imgDoors}" alt="ארון סגור"></div>
                    <div class="print-img-wrapper"><div class="img-label">${centerInLabel}</div><img src="${item.imgOpen}" alt="ארון פתוח"></div>`;
    (item.wingPreviews || []).forEach(w => {
        html += `
                    <div class="print-img-wrapper"><div class="img-label">תצוגת חוץ (${_escPrintHtml(w.label)})</div><img src="${w.imgDoors}" alt="חזית סגורה"></div>
                    <div class="print-img-wrapper"><div class="img-label">תצוגת פנים (${_escPrintHtml(w.label)})</div><img src="${w.imgOpen}" alt="חזית פנימית"></div>`;
    });
    return html;
}

function _orderPrintPreviewImagesHtml(item, rawState) {
    const multiFront = _cartHasMultiFrontViews(rawState);
    const centerOutLabel = multiFront ? 'תצוגת חוץ (חזית מרכזית)' : 'תצוגת חוץ (חזיתות)';
    const centerInLabel = multiFront ? 'תצוגת פנים (חזית מרכזית)' : 'תצוגת פנים (חלוקה טכנית)';
    const imgStyle = 'flex:1;min-height:0;width:100%;object-fit:contain;border:1px solid #e2e8f0;border-radius:4px;';
    const lblStyle = 'font-size:0.85rem;font-weight:600;color:#475569;margin-bottom:4px;padding:4px 8px;background:#f1f5f8;border-radius:4px;';
    const wrapStyle = 'flex:1;display:flex;flex-direction:column;min-height:0;';
    let html = `
                    <div style="${wrapStyle}">
                        <div style="${lblStyle}">${centerOutLabel}</div>
                        <img src="${item.imgDoors}" style="${imgStyle}" alt="ארון סגור">
                    </div>
                    <div style="${wrapStyle}">
                        <div style="${lblStyle}">${centerInLabel}</div>
                        <img src="${item.imgOpen}" style="${imgStyle}" alt="ארון פתוח">
                    </div>`;
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

window._captureCabinetPreviewImages = function() {
    const cam = window.camera;
    const ctrl = window.controls;
    const ren = window.renderer;
    const scn = window.scene;
    if (!cam || !ctrl || !ren || !scn) {
        return { imgDoors: null, imgOpen: null, wingPreviews: [], multiViewPages: [], multiViewSVG: null };
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
    const centerView = {
        camPos: [0, snapH / 2, 1],
        camTarget: [0, snapH / 2, 0],
        fitH: snapH + 120,
        fitW: snapW + 150
    };
    const imgWithDoors = _captureFrameAtView(cam, ctrl, ren, scn, centerView, true);
    const imgNoDoors = _captureFrameAtView(cam, ctrl, ren, scn, centerView, false);

    const wingPreviews = _getSideWingCaptureViews().map(view => ({
        id: view.id,
        label: view.label,
        imgDoors: _captureFrameAtView(cam, ctrl, ren, scn, view, true),
        imgOpen: _captureFrameAtView(cam, ctrl, ren, scn, view, false)
    }));

    let multiViewPages = [];
    let multiViewSVG = null;
    try {
        if (typeof window._generateMultiViewBlueprintPages === 'function') {
            multiViewPages = window._generateMultiViewBlueprintPages().map(pg => pg.svg);
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

    return { imgDoors: imgWithDoors, imgOpen: imgNoDoors, wingPreviews, multiViewPages, multiViewSVG, captureVer: 3 };
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
    if (!spec.multiViewPages || !spec.multiViewPages.length) return true;
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
        state.wings = JSON.parse(JSON.stringify(rs.wings));
        state.activeWing = rs.activeWing || 'center';
        state.presetId = rs.presetId || 'linear';
    } else {
        state.presetId = 'linear';
        state.activeWing = 'center';
        state.wings.left = null;
        state.wings.right = null;
        const flatFields = ['cabinetModel', 'placement', 'width', 'globalHeight', 'depth', 'thickness',
            'plinthHeight', 'hasDoors', 'handleType', 'handleStyle', 'cabinetName', 'cabinetNotes', 'manualPrice', 'boardMaterial',
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
    if (rs.placement === 'niche') {
        rs.placement = 'wall';
        state.placement = 'wall';
    }
    state.blueprintCutouts = rs.blueprintCutouts ? JSON.parse(JSON.stringify(rs.blueprintCutouts)) : [];
    state.blueprintCellDimOffsets = rs.blueprintCellDimOffsets ? JSON.parse(JSON.stringify(rs.blueprintCellDimOffsets)) : {};
    state.blueprintDimOffsets = rs.blueprintDimOffsets ? JSON.parse(JSON.stringify(rs.blueprintDimOffsets)) : {};
    state.blueprintInternalDimsDefault = rs.blueprintInternalDimsDefault !== false;
    state.blueprintCellDimShown = rs.blueprintCellDimShown ? JSON.parse(JSON.stringify(rs.blueprintCellDimShown)) : {};
    state.blueprintColWidthDimsDefault = rs.blueprintColWidthDimsDefault !== false;
    state.blueprintColWidthDimShown = rs.blueprintColWidthDimShown ? JSON.parse(JSON.stringify(rs.blueprintColWidthDimShown)) : {};
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
            _applyRawStateForCapture(itemObj.rawState);
            const pages = window._generateMultiViewBlueprintPages();
            if (pages && pages.length) {
                itemObj.spec.multiViewPages = pages.map(function(pg) { return pg.svg; });
                itemObj.spec.multiViewSVG = pages[0].svg;
            }
            await new Promise(function(r) { setTimeout(r, 0); });
        }
    } finally {
        _restoreEditorState(snap);
        window._cartBlueprintRefreshRunning = false;
    }
};

window._refreshCartMediaForPrint = async function() {
    if (!state.orderCart.length || window._cartMediaRefreshRunning) return;
    const needsRefresh = state.orderCart.some(window._cartItemNeedsMediaRefresh);
    if (!needsRefresh) return;

    window._cartMediaRefreshRunning = true;
    const snap = _snapshotEditorState();
    try {
        for (let i = 0; i < state.orderCart.length; i++) {
            const itemObj = state.orderCart[i];
            if (!window._cartItemNeedsMediaRefresh(itemObj)) continue;
            _applyRawStateForCapture(itemObj.rawState);
            const media = window._captureCabinetPreviewImages();
            if (media.imgDoors) itemObj.spec.imgDoors = media.imgDoors;
            if (media.imgOpen) itemObj.spec.imgOpen = media.imgOpen;
            if (media.wingPreviews && media.wingPreviews.length) {
                itemObj.spec.wingPreviews = media.wingPreviews;
            } else if (_cartHasMultiFrontViews(itemObj.rawState)) {
                itemObj.spec.wingPreviews = media.wingPreviews || [];
            } else {
                itemObj.spec.wingPreviews = [];
            }
            if (media.multiViewPages && media.multiViewPages.length) {
                itemObj.spec.multiViewPages = media.multiViewPages;
            }
            if (media.multiViewSVG) itemObj.spec.multiViewSVG = media.multiViewSVG;
            if (media.captureVer) itemObj.spec.captureVer = media.captureVer;
            await new Promise(r => setTimeout(r, 0));
        }
    } finally {
        _restoreEditorState(snap);
        window._cartMediaRefreshRunning = false;
    }
};

window.openOrderModal = async function(mode) {
    // mode: 'customer' or 'factory'

    // Feature gate: factory mode requires canExportCarpenter
    if (mode === 'factory' && window._features && !window._features.canExportCarpenter) {
        _showToast('תכונה זו אינה זמינה בתוכנית הנוכחית שלך. שדרג כדי לגשת לשליחה לייצור.', 5000);
        return;
    }

    if (state.orderCart.length > 0 && state.orderCart.some(window._cartItemNeedsMediaRefresh)) {
        _showToast('🔄 מרענן תמונות ארונות...', 3500);
        try {
            await window._refreshCartMediaForPrint();
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
            : window._showPricing !== false
                ? `<button class="print-btn-large" onclick="printCustomer()" style="flex:1;"><i class="fa-solid fa-file-invoice-dollar"></i> הדפס ללקוח (מחירון)</button>`
                : `<button class="print-btn-large" onclick="printCustomer()" style="flex:1;"><i class="fa-solid fa-file-invoice-dollar"></i> הדפס סיכום ללקוח</button>`;
    }

    container.innerHTML = '';
    let totalOrderPrice = 0, totalInstallPrice = 0, totalCostPrice = 0;

    document.getElementById('print-c-name').innerText = state.customer.name || 'לא צוין';
    document.getElementById('print-c-phone').innerText = state.customer.phone || 'לא צוין';
    document.getElementById('print-c-order').innerText = state.customer.orderNum || 'לא צוין';
    document.getElementById('print-c-address').innerText = state.customer.address || 'לא צוין';

    if (state.orderCart.length === 0) {
        container.innerHTML = '<p style="text-align:center; color:var(--text-light); font-size: 1.2rem;">ההזמנה ריקה. הוסף ארונות קודם.</p>';
        document.getElementById('modal-footer-summary').innerHTML = '';
        modal.style.display = 'flex';
        return;
    }

    state.orderCart.forEach((itemObj, index) => {
        const item = itemObj.spec;
        const titleText = item.customName ? item.customName : (_cartIsWritingDesk(itemObj) ? `שולחן מס' ${index + 1}` : `ארון מס' ${index + 1}`);
        const detailLabel = _cartIsWritingDesk(itemObj) ? 'שולחן' : 'ארון';
        const numericPrice = parseInt(item.price.replace('₪', '').replace(/,/g, ''));
        const itemInstall = item.installPrice || 0;
        const itemCost = item.costPrice ? parseInt(item.costPrice.replace('₪', '').replace(/,/g, '')) : 0;
        if (!isNaN(numericPrice)) totalOrderPrice += numericPrice;
        totalInstallPrice += itemInstall; totalCostPrice += itemCost;

        const cabinetHTML = `
            <div class="cabinet-print-page">
                <div class="cabinet-header-wrapper">
                    <h3 class="cabinet-title">פרטי ${detailLabel}: ${titleText}</h3>
                    <div class="cart-item-actions">
                        <button class="action-btn edit-btn" onclick="editCartItem(${index})"><i class="fa-solid fa-pen"></i> ערוך ארון</button>
                        <button class="action-btn del-btn" onclick="deleteCartItem(${index})"><i class="fa-solid fa-trash"></i> מחיקה</button>
                    </div>
                </div>
                <table class="spec-table">
                    ${_printSpecRowsHtmlEditable(_resolvePrintSpecRows(itemObj), index)}

                    ${!isFactory && window._showPricing !== false ? `
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
                    ` : !isFactory ? `` : `
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
                    `}
                </table>
                <div class="print-images-container">
                    ${_orderPreviewImagesHtml(item, itemObj.rawState)}
                </div>
                ${(item.multiViewPages && item.multiViewPages.length > 0) ? `
                <div style="margin-top:12px;">
                    <div class="img-label" style="background:#e8f0fe;color:#1e3a5f;border:1px solid #93c5fd;padding:6px 10px;font-weight:bold;margin-bottom:6px;">שרטוט ייצור</div>
                    <div style="border:1px solid #bfdbfe;border-radius:4px;overflow:hidden;">${item.multiViewPages[0]}</div>
                    ${item.multiViewPages.length > 1 ? `<div style="font-size:0.8rem;color:#64748b;margin-top:4px;text-align:center;">+ ${item.multiViewPages.length - 1} דפים נוספים (ראה הדפסה)</div>` : ''}
                </div>` : (item.multiViewSVG ? `
                <div style="margin-top:12px;">
                    <div class="img-label" style="background:#e8f0fe;color:#1e3a5f;border:1px solid #93c5fd;padding:6px 10px;font-weight:bold;margin-bottom:6px;">שרטוט ייצור</div>
                    <div style="border:1px solid #bfdbfe;border-radius:4px;overflow:hidden;">${item.multiViewSVG}</div>
                </div>` : '')}
            </div>
        `;
        container.insertAdjacentHTML('beforeend', cabinetHTML);
    });

    _bindPrintSpecRowInputs(container);

    // Wire up editable inputs
    container.querySelectorAll('.modal-price-input').forEach(input => {
        input.addEventListener('change', (e) => {
            const idx = parseInt(e.target.getAttribute('data-index'));
            const newPrice = parseInt(e.target.value) || 0;
            state.orderCart[idx].spec.price = '₪' + newPrice.toLocaleString();
            state.orderCart[idx].rawState.manualPrice = newPrice;
            openOrderModal(mode); updateLeftSidebar();
        });
    });
    container.querySelectorAll('.modal-cost-input').forEach(input => {
        input.addEventListener('change', (e) => {
            const idx = parseInt(e.target.getAttribute('data-index'));
            const newCost = parseInt(e.target.value) || 0;
            state.orderCart[idx].spec.costPrice = '₪' + newCost.toLocaleString();
            openOrderModal(mode); updateLeftSidebar();
        });
    });
    container.querySelectorAll('.modal-install-input').forEach(input => {
        input.addEventListener('change', (e) => {
            const idx = parseInt(e.target.getAttribute('data-index'));
            const newInstall = parseInt(e.target.value) || 0;
            state.orderCart[idx].spec.installPrice = newInstall;
            openOrderModal(mode); updateLeftSidebar();
        });
    });

    // Footer summary
    const footerHTML = isFactory ? `
        <div class="summary-factory" style="display:block;">
            <div class="summary-row"><span>סה"כ עלויות ייצור (רכש):</span> <span dir="ltr" style="font-weight:bold;color:#854d0e;">₪${totalCostPrice.toLocaleString()}</span></div>
            <div class="summary-row"><span>סה"כ עלויות משלוח/התקנה:</span> <span dir="ltr" style="font-weight:bold;color:#713f12;">₪${totalInstallPrice.toLocaleString()}</span></div>
            <div class="summary-row final-total" style="color:#854d0e; border-top: 2px solid #fef08a;"><span>סה"כ עלויות פרויקט (רכש נטו):</span> <span dir="ltr">₪${(totalCostPrice + totalInstallPrice).toLocaleString()}</span></div>
        </div>
    ` : window._showPricing !== false ? `
        <div class="summary-customer">
            <div class="summary-row"><span>סה"כ ארונות (ללא התקנה):</span> <span dir="ltr" style="font-weight:bold;">₪${totalOrderPrice.toLocaleString()}</span></div>
            <div class="summary-row"><span>סה"כ הובלה והתקנה:</span> <span dir="ltr" style="font-weight:bold;">₪${totalInstallPrice.toLocaleString()}</span></div>
            <div class="summary-row final-total"><span>סה"כ לתשלום ללקוח:</span> <span dir="ltr">₪${(totalOrderPrice + totalInstallPrice).toLocaleString()}</span></div>
        </div>` : `<div></div>
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
        handleStyle: state.handleStyle,
        cabinetName: state.cabinetName || '',
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
        partColors: partColors || {}
    }));
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
        if(state.cabinetModel === 'ab2_nohoney') modelNameText = 'חזית פנימית';
        if(state.cabinetModel === 'ab2') modelNameText = 'AB2';
        if(state.cabinetModel === 'regalim') modelNameText = 'רגלי ניקל';
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

        let plinthTypeText = 'צוקל נסתר';
        if(state.cabinetModel === 'c9') plinthTypeText = 'צוקל רגיל';
        if(state.cabinetModel === 'ab2_nohoney') plinthTypeText = 'צוקל נסתר (חזית פנימית)';
        if(state.cabinetModel === 'ab2') plinthTypeText = 'צוקל נסתר (חזית פנימית טאצ\')';
        if(state.cabinetModel === 'regalim') plinthTypeText = 'רגלי ניקל גליל 5 ס"מ';
        if (_isWritingDeskCart) plinthTypeText = 'ללא צוקל';

        let deskInfo = 'ללא';
        if (state.desk.side === 'left') deskInfo = 'מצורף שולחן חיצוני (משמאל)';
        else if (state.desk.side === 'right') deskInfo = 'מצורף שולחן חיצוני (מימין)';
        else if (state.columns.some(c => c.type === 'desk')) deskInfo = 'שולחן עבודה פנימי משולב';

        const priceEl = document.getElementById('price-display');
        const currentDisplayPrice = priceEl ? (parseInt(priceEl.value) || 0) : 0;
        const priceStr = '₪' + currentDisplayPrice.toLocaleString();

        const rawState = JSON.parse(JSON.stringify({
            cabinetModel: state.cabinetModel,
            placement: state.placement,
            width: state.width, globalHeight: state.globalHeight, depth: state.depth, thickness: state.thickness,
            plinthHeight: state.plinthHeight, hasDoors: state.hasDoors, handleType: state.handleType, handleStyle: state.handleStyle,
            cabinetName: state.cabinetName, cabinetNotes: state.cabinetNotes, manualPrice: state.manualPrice,
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
            partColors: (typeof window._exportLocalPartColors === 'function')
                ? window._exportLocalPartColors()
                : JSON.parse(JSON.stringify(state.partColors || {}))
        }));

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
        let multiViewSVG = null;
        try {
            multiViewSVG = preview.multiViewSVG || ((typeof window._generateMultiViewBlueprintSVG === 'function')
                ? window._generateMultiViewBlueprintSVG() : null);
            multiViewPages = (preview.multiViewPages && preview.multiViewPages.length) ? preview.multiViewPages
                : ((typeof window._generateMultiViewBlueprintPages === 'function')
                ? window._generateMultiViewBlueprintPages().map(pg => pg.svg) : []);
        } catch (bpErr) {
            console.warn('[cart-snapshot] blueprint generation failed:', bpErr);
        }

        const _wdHeightCart = _wdCart.height != null ? _wdCart.height : state.globalHeight;
        const _wdDrawerCountCart = (_wdCart.hasDrawers === false) ? 0
            : (_wdCart.drawerCount != null ? _wdCart.drawerCount : (state.width <= 80 ? 1 : 2));
        const _wdDimsStr = _isWritingDeskCart
            ? `רוחב: ${state.width} ס"מ | גובה: ${_wdHeightCart} ס"מ | עומק: ${state.depth} ס"מ`
            : `רוחב: ${state.width} ס"מ | גובה: ${state.globalHeight} ס"מ | עומק: ${state.depth} ס"מ`;

        const cabinetSpec = {
            customName: state.cabinetName, cabinetNotes: (state.cabinetNotes || '').trim(), modelName: modelNameText, plinthType: plinthTypeText,
            placement: _isWritingDeskCart ? 'שולחן עמידה' : (placementHebrew[state.placement] || 'ארון קיר חופשי'),
            dimsStr: _wdDimsStr,
            material: state.boardMaterial === 'melamine' ? 'מלמין' : "סנדביץ'",
            handle: (function() {
                const labels = { pipe: 'ידית חיצונית', riding: 'ידית רוכבת', touch: "ידית טאצ'" };
                const style = labels[state.handleStyle] || labels.pipe;
                const model = (state.handleType || '').trim();
                return model ? style + ' — ' + model : style;
            })(),
            desk: deskInfo,
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
            wingPreviews: wingPreviews,
            captureVer: (preview && preview.captureVer) || 3,
            corner: state.corner ? JSON.parse(JSON.stringify(state.corner)) : null,
            slidingDoor: slidingDoorSpec,
            multiViewSVG: multiViewSVG,
            multiViewPages: multiViewPages
        };
    return { spec: cabinetSpec, rawState: rawState };
};

window._commitCurrentCabinetToCart = function(opts) {
    opts = opts || {};
    const cartItem = window._snapshotCurrentCabinetToCartItem();
    const cabinetSpec = cartItem.spec;

    if (state.editingCartIndex > -1 && state.orderCart[state.editingCartIndex]) {
        const oldItem = state.orderCart[state.editingCartIndex];
        const newHash = _hashPrintSpecSource(_collectPrintSpecRows(cabinetSpec, cartItem));
        if (oldItem && oldItem.printSpecEdits && oldItem.printSpecEdits.sourceHash === newHash) {
            cartItem.printSpecEdits = oldItem.printSpecEdits;
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
    updateLeftSidebar();
    if (typeof saveHistoryState === 'function') saveHistoryState();
    if (typeof window._markCurrentCabinetClean === 'function') window._markCurrentCabinetClean();
    return state.editingCartIndex;
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
        if (typeof applyPreset === 'function') applyPreset('linear');
    }
    const item = window._snapshotCurrentCabinetToCartItem();
    item.rawState.partColors = {};
    state.orderCart = [item];
    state.editingCartIndex = 0;
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

window.deleteCartItem = function(index) {
    // Use a toast-style inline confirm to avoid browser confirm() suppression issues
    const _doDelete = function() {
        const wasEditing = state.editingCartIndex === index;
        state.orderCart.splice(index, 1);

        if (state.orderCart.length === 0) {
            window._bootstrapDefaultCabinet();
        } else if (wasEditing) {
            const nextIdx = Math.min(index, state.orderCart.length - 1);
            window.editCartItem(nextIdx, { force: true });
        } else if (state.editingCartIndex > index) {
            state.editingCartIndex--;
            updateLeftSidebar();
        } else {
            updateLeftSidebar();
        }

        const cc3 = document.getElementById('cart-count');
        if (cc3) cc3.innerText = state.orderCart.length;
        if (document.getElementById('order-modal').style.display === 'flex') {
            const currentMode = document.getElementById('order-modal').dataset.mode || 'customer';
            openOrderModal(currentMode);
        }
        saveHistoryState();
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
                <button onclick="document.getElementById('_delete-confirm-toast').remove(); window._pendingDelete && window._pendingDelete();" style="flex:1;background:#ef4444;color:white;border:none;border-radius:10px;padding:12px 0;font-size:1.05rem;font-weight:700;cursor:pointer;transition:background 0.2s;">מחק</button>
                <button onclick="document.getElementById('_delete-confirm-toast').remove();" style="flex:1;background:rgba(255,255,255,0.15);color:white;border:none;border-radius:10px;padding:12px 0;font-size:1.05rem;font-weight:600;cursor:pointer;transition:background 0.2s;">ביטול</button>
            </div>
        </div>
    `;
    window._pendingDelete = _doDelete;
    document.body.appendChild(toast);
    setTimeout(() => { const t = document.getElementById('_delete-confirm-toast'); if (t) t.remove(); }, 10000);
}

window.editCartItem = function(index, opts) {
    opts = opts || {};
    if (!state.orderCart || !state.orderCart[index]) return;
    if (index === state.editingCartIndex) return;
    if (!opts.force && window._isCurrentCabinetDirty && window._isCurrentCabinetDirty()) {
        window._promptSaveCabinetBeforeSwitch(index);
        return;
    }
    window._editCartItemNow(index);
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
            'plinthHeight','hasDoors','handleType','handleStyle','cabinetName','cabinetNotes','manualPrice','boardMaterial',
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
    if (rawState.placement === 'niche' || state.placement === 'niche') {
        state.placement = 'wall';
    }
    // Sync closure UI
    if (typeof window._updateRoomWallUI === 'function') window._updateRoomWallUI();

    state.blueprintCutouts = rawState.blueprintCutouts ? JSON.parse(JSON.stringify(rawState.blueprintCutouts)) : [];
    state.blueprintCellDimOffsets = rawState.blueprintCellDimOffsets ? JSON.parse(JSON.stringify(rawState.blueprintCellDimOffsets)) : {};
    state.blueprintDimOffsets = rawState.blueprintDimOffsets ? JSON.parse(JSON.stringify(rawState.blueprintDimOffsets)) : {};
    state.blueprintInternalDimsDefault = rawState.blueprintInternalDimsDefault !== false;
    state.blueprintCellDimShown = rawState.blueprintCellDimShown ? JSON.parse(JSON.stringify(rawState.blueprintCellDimShown)) : {};
    state.blueprintColWidthDimsDefault = rawState.blueprintColWidthDimsDefault !== false;
    state.blueprintColWidthDimShown = rawState.blueprintColWidthDimShown ? JSON.parse(JSON.stringify(rawState.blueprintColWidthDimShown)) : {};

    state.editingCartIndex = index;
    if (typeof window._syncPartColorScope === 'function') window._syncPartColorScope();
    if (typeof window._importLocalPartColors === 'function') {
        window._importLocalPartColors('cart' + index, rawState.partColors);
    }

    // Explicitly restore manualInstallPrice (not in old rawState saves → default null)

    document.getElementById('order-modal').style.display = 'none';
    document.getElementById('btn-add-to-cart').innerHTML = `<i class="fa-solid fa-save"></i> שמור שינויים לארון`;

    // Restore preset UI (button highlights, wing tabs, section visibility)
    if (typeof window._restorePresetUI === 'function') window._restorePresetUI();
    buildCabinet(); updateCameraView(); calculatePrice(); updateLeftSidebar({ scrollToActive: true }); saveHistoryState();
    if (typeof window._markCurrentCabinetClean === 'function') window._markCurrentCabinetClean();
}

window.startNewCabinet = function() {
    // Auto-save current cabinet, then create a fully reset new one
    if (state.orderCart && state.orderCart.length > 0) {
        window._commitCurrentCabinetToCart({ flash: false });
    }
    if (typeof window._resetEditorToDefaultLinearCabinet === 'function') {
        window._resetEditorToDefaultLinearCabinet();
    } else if (typeof applyPreset === 'function') {
        applyPreset('linear');
    }
    const item = window._snapshotCurrentCabinetToCartItem();
    state.orderCart.push(item);
    const newIdx = state.orderCart.length - 1;
    // Fresh cabinet — no inherited part colors
    item.rawState.partColors = {};
    state.editingCartIndex = newIdx;
    if (typeof window._syncPartColorScope === 'function') window._syncPartColorScope();
    _setSaveCabinetButtonLabel();
    const cc = document.getElementById('cart-count');
    if (cc) cc.innerText = state.orderCart.length;
    if (typeof window._restorePresetUI === 'function') window._restorePresetUI();
    updateLeftSidebar({ scrollToActive: true });
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
        clone.spec.multiViewSVG = null;
        clone.spec.multiViewPages = [];
        clone.spec.wingPreviews = [];
    }
    if (clone.spec && clone.spec.customName) {
        clone.spec.customName = 'העתק של ' + clone.spec.customName;
        if (clone.rawState) clone.rawState.cabinetName = clone.spec.customName;
    }
    state.orderCart.splice(index + 1, 0, clone);
    const newIdx = index + 1;
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

window.newProject = function() {
    if (!confirm('האם אתה בטוח שברצונך להתחיל פרויקט חדש?\nכל הארונות בפרויקט הנוכחי יימחקו לצמיתות.')) return;
    state.orderCart = [];
    state.editingCartIndex = -1;
    state.cabinetName = '';
    state.manualPrice = null;
    state.manualInstallPrice = null;
    window._currentProjectId   = null;
    window._currentProjectName = null;
    const cabNameInp = document.getElementById('inp-cabinet-name');
    if (cabNameInp) cabNameInp.value = '';
    const orderModal = document.getElementById('order-modal');
    if (orderModal) orderModal.style.display = 'none';
    window._bootstrapDefaultCabinet();
}

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
    if (countEl) {
        const n = (state.orderCart && state.orderCart.length) || 0;
        countEl.textContent = n > 0 ? '(' + n + ')' : '';
    }

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

    state.orderCart.forEach((itemObj, index) => {
        const item = itemObj.spec;
        const numericPrice = parseInt(item.price.replace('₪', '').replace(/,/g, ''));
        const itemInstall = item.installPrice || 0;
        
        if (!isNaN(numericPrice)) totalCabinetsPrice += numericPrice;
        totalInstallPrice += itemInstall;

        const isEditing = state.editingCartIndex === index;
        const activeClass = isEditing ? 'active-editing' : '';
        const activeLabel = isEditing ? '<div style="position:absolute; top:-12px; right:15px; background:var(--accent); color:white; font-size:11px; padding:3px 10px; border-radius:12px; font-weight:bold; box-shadow:0 2px 5px rgba(0,0,0,0.15); border: 2px solid white;"><i class="fa-solid fa-pen"></i> בעריכה כעת</div>' : '';
        const titleText = item.customName ? item.customName : (_cartIsWritingDesk(itemObj) ? `שולחן מס' ${index + 1}` : `ארון מס' ${index + 1}`);

        // Room wall position selector (only for linear/sliding presets)
        const _itemPreset = (itemObj.rawState && itemObj.rawState.presetId) || 'linear';
        const _isLinearOrSliding = (_itemPreset === 'linear' || _itemPreset === 'sliding');
        const _curRoomWall = (itemObj.rawState && itemObj.rawState.roomWall) || 'center';
        const _wallSelectorHTML = _isLinearOrSliding ? `
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
        card.className = `cart-mini-card ${activeClass}`;
        card.dataset.cartIndex = String(index);
        card.onclick = () => { if(!isEditing) editCartItem(index); };
        
        card.innerHTML = `
            ${activeLabel}
            <div class="cart-mini-card-title">${titleText}</div>
            <div class="cart-mini-card-desc" dir="rtl">${item.dimsStr}</div>
            ${window._showPricing !== false ? `<div class="cart-mini-card-price"><span dir="ltr">${item.price}</span> <span style="font-size:0.85rem; font-weight:normal; color:var(--text-light);">+ <span dir="ltr">₪${itemInstall.toLocaleString()}</span> התקנה</span></div>` : ''}
            ${_wallSelectorHTML}
            <div class="cart-mini-actions">
                <button class="cart-mini-btn btn-edit-mini" onclick="event.stopPropagation(); editCartItem(${index});"><i class="fa-solid fa-pen"></i> ערוך</button>
                <button class="cart-mini-btn" onclick="event.stopPropagation(); duplicateCartItem(${index});"><i class="fa-solid fa-copy"></i> שכפל</button>
                <button class="cart-mini-btn btn-del-mini" onclick="event.stopPropagation(); deleteCartItem(${index});"><i class="fa-solid fa-trash"></i> מחק</button>
                <div style="position:relative;display:inline-flex;">
                    <button class="cart-mini-btn" id="notes-btn-cart-${index}" onclick="event.stopPropagation(); window._openDesignerNotesForCabinet(${index});" style="color:#2563eb;border-color:rgba(37,99,235,0.35);background:rgba(37,99,235,0.07);">
                        <i class="fa-solid fa-note-sticky"></i> תיקונים
                    </button>
                    <span id="notes-badge-cart-${index}" style="display:none;position:absolute;top:-5px;left:-5px;background:#ef4444;color:white;border-radius:50%;width:15px;height:15px;font-size:9px;font-weight:700;align-items:center;justify-content:center;line-height:1;z-index:10;pointer-events:none;"></span>
                </div>
            </div>
        `;
        listContainer.appendChild(card);
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
    });
    return counts;
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

function _collectPrintSpecRows(item, itemObj) {
    const isWD = _cartIsWritingDesk(itemObj);
    if (itemObj && itemObj.rawState) _enrichSpecColorsFromRaw(item, itemObj.rawState);
    const rows = [];

    rows.push({ id: 'modelName', label: isWD ? 'סוג מוצר' : 'דגם ארון', value: _plainSpecValue(item.modelName) });
    if (!isWD) rows.push({ id: 'placement', label: 'מיקום / התקנה', value: _plainSpecValue(item.placement) });
    rows.push({ id: 'dimsStr', label: 'מידות חיצוניות', value: _plainSpecValue(item.dimsStr), rtl: true });
    rows.push({ id: 'material', label: 'חומר גוף', value: _plainSpecValue(item.material) });
    rows.push({ id: 'plinthType', label: isWD ? 'בסיס' : 'סוג רגליים / צוקל', value: _plainSpecValue(isWD ? 'רגליים כפולות' : item.plinthType) });
    if (!isWD) rows.push({ id: 'desk', label: 'תוספת שולחן', value: _plainSpecValue(item.desk) });

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
        if (item.desk !== 'ללא') rows.push({ id: 'colorDesk', label: 'צבע שולחן עבודה', value: _plainSpecValue(item.colorDesk) });
        if (item.hasOpenCells) rows.push({ id: 'colorOpenCell', label: 'צבע כוורת', value: _plainSpecValue(item.colorOpenCell) });
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

function _printBasicSpecRows(item, itemObj, thStyle, tdStyle) {
    const isWD = _cartIsWritingDesk(itemObj);
    const dimsExtra = ' dir="rtl"';
    let html = '';
    html += _printTr(thStyle, tdStyle, isWD ? 'סוג מוצר' : 'דגם ארון', `<strong>${item.modelName}</strong>`);
    if (!isWD) html += _printTr(thStyle, tdStyle, 'מיקום / התקנה', item.placement);
    html += _printTr(thStyle, tdStyle, 'מידות חיצוניות', item.dimsStr, dimsExtra);
    html += _printTr(thStyle, tdStyle, 'חומר גוף', item.material);
    html += _printTr(thStyle, tdStyle, isWD ? 'בסיס' : 'סוג רגליים / צוקל', isWD ? 'רגליים כפולות' : item.plinthType);
    if (!isWD) html += _printTr(thStyle, tdStyle, 'תוספת שולחן', item.desk);
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
    if (item.desk !== 'ללא') html += _printTr(thStyle, tdStyle, 'צבע שולחן עבודה', item.colorDesk);
    if (item.hasOpenCells) html += _printTr(thStyle, tdStyle, 'צבע כוורת', item.colorOpenCell);
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
            : (window._showPricing !== false ? 'הצעת מחיר ללקוח' : 'סיכום פרויקט ללקוח'),
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
    state.orderForm[key] = {
        title: (title || '').trim() || defaults.title,
        notes: (notes || '').trim()
    };
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

function _buildPrintHTML(mode) {
    // mode: 'customer' or 'factory'
    const isFactory = mode === 'factory';

    // Table cell styles (defined before forEach so they're available in template literals)
    const thStyle = 'width:35%;background:#f8fafc;text-align:right;font-weight:600;color:#1e293b;padding:10px 14px;border:1px solid #e2e8f0;';
    const tdStyle = 'text-align:right;color:#1e293b;padding:10px 14px;border:1px solid #e2e8f0;background:white;';

    // Collect cart data
    const _hidePrices = (window._showPricing === false);
    let totalOrderPrice = 0, totalInstallPrice = 0, totalCostPrice = 0;
    let cabinetsHTML = '';

    state.orderCart.forEach((itemObj, index) => {
        const item = itemObj.spec;
        const titleText = item.customName ? item.customName : (_cartIsWritingDesk(itemObj) ? `שולחן מס' ${index + 1}` : `ארון מס' ${index + 1}`);
        const detailLabel = _cartIsWritingDesk(itemObj) ? 'שולחן' : 'ארון';
        const numericPrice = parseInt(item.price.replace('₪', '').replace(/,/g, '')) || 0;
        const itemInstall = item.installPrice || 0;
        const itemCost = item.costPrice ? parseInt(item.costPrice.replace('₪', '').replace(/,/g, '')) : 0;
        totalOrderPrice += numericPrice;
        totalInstallPrice += itemInstall; totalCostPrice += itemCost;
        const specRows = _resolvePrintSpecRows(itemObj);
        const priceRows = _hidePrices ? '' : isFactory
            ? `<tr><th style="background:#fef9c3;">מחיר התקנה ללקוח</th><td style="font-weight:bold;color:#713f12;font-size:1.1rem;text-align:right;">₪${(item.installPrice || 0).toLocaleString()}</td></tr>`
            : `<tr><th style="background:#eff6ff;">מחיר ארון ללקוח</th><td style="font-weight:bold;color:#1e3a5f;font-size:1.1rem;text-align:right;">₪${numericPrice.toLocaleString()}</td></tr>
               <tr><th style="background:#eff6ff;">הובלה והתקנה</th><td style="font-weight:bold;color:#1e3a5f;font-size:1.1rem;text-align:right;">₪${itemInstall.toLocaleString()}</td></tr>`;

        if (isFactory) {
            // Factory: page 1 = spec table; page 2 = 3D images (paired); then blueprint pages paired (2 per print page)
            const bpPages = item.multiViewPages && item.multiViewPages.length > 0
                ? item.multiViewPages
                : (item.multiViewSVG ? [item.multiViewSVG] : []);

            cabinetsHTML += `
            <div style="page-break-after:always;">
                <h3 style="font-size:1.3rem;color:#1e3a5f;margin:0 0 12px;padding:10px 15px;background:#f8fafc;border-radius:8px;border-right:4px solid #1e3a5f;">
                    פרטי ${detailLabel}: ${titleText}
                </h3>
                <table style="width:100%;border-collapse:collapse;margin-bottom:20px;font-size:1rem;border:1px solid #e2e8f0;">
                    ${_printSpecRowsHtml(specRows, thStyle, tdStyle, 'padding:8px;border:1px solid #e2e8f0;')}
                    ${priceRows}
                </table>
            </div>
            <div style="page-break-after:always;">
                <h3 style="font-size:1.2rem;color:#1e3a5f;margin:0 0 16px;padding:10px 15px;background:#f8fafc;border-radius:8px;border-right:4px solid #1e3a5f;">
                    תמונות ${detailLabel}: ${titleText}
                </h3>
                <div style="display:flex;flex-direction:column;gap:16px;">
                    ${_orderPrintPreviewImagesHtml(item, itemObj.rawState)}
                </div>
            </div>
            ${(() => {
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
            })()}`;
        } else {
            // Customer: page 1 = spec table; page 2 = 3D images; then blueprint pages paired (2 per print page)
            const bpPages = item.multiViewPages && item.multiViewPages.length > 0
                ? item.multiViewPages
                : (item.multiViewSVG ? [item.multiViewSVG] : []);

            cabinetsHTML += `
            <div style="page-break-after:always;">
                <h3 style="font-size:1.3rem;color:#1e3a5f;margin:0 0 12px;padding:10px 15px;background:#f8fafc;border-radius:8px;border-right:4px solid #1e3a5f;">
                    פרטי ${detailLabel}: ${titleText}
                </h3>
                <table style="width:100%;border-collapse:collapse;margin-bottom:20px;font-size:1rem;border:1px solid #e2e8f0;">
                    ${_printSpecRowsHtml(specRows, thStyle, tdStyle, 'padding:8px;border:1px solid #e2e8f0;')}
                    ${priceRows}
                </table>
            </div>
            <div style="page-break-after:always;">
                <h3 style="font-size:1.2rem;color:#1e3a5f;margin:0 0 16px;padding:10px 15px;background:#f8fafc;border-radius:8px;border-right:4px solid #1e3a5f;">
                    תמונות ${detailLabel}: ${titleText}
                </h3>
                <div style="display:flex;flex-direction:column;gap:16px;">
                    ${_orderPrintPreviewImagesHtml(item, itemObj.rawState)}
                </div>
            </div>
            ${(() => {
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
            })()}`;
        }
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
</div>
${cabinetsHTML}
${summaryHTML}
</body>
</html>`;
}

window.printCustomer = async function() {
    if (state.orderCart.some(window._cartItemNeedsMediaRefresh)) {
        _showToast('🔄 מרענן תמונות לפני הדפסה...', 3000);
        try { await window._refreshCartMediaForPrint(); } catch (e) { console.warn('[printCustomer]', e); }
    }
    const html = _buildPrintHTML('customer');
    const win = window.open('', '_blank', 'width=900,height=700');
    win.document.write(html);
    win.document.close();
    win.focus();
    // Build PDF filename: סוגרים הכל לדירה (orderNum) (custName)
    const _pdfOrder = (state.customer && state.customer.orderNum) ? state.customer.orderNum : '';
    const _pdfName  = (state.customer && state.customer.name)     ? state.customer.name     : '';
    const _pdfParts = ['סוגרים הכל לדירה'];
    if (_pdfOrder) _pdfParts.push(_pdfOrder);
    if (_pdfName)  _pdfParts.push(_pdfName);
    const _pdfTitle = _pdfParts.join(' ');
    // Set title inside setTimeout so it runs after document is fully parsed
    setTimeout(() => { win.document.title = _pdfTitle; win.print(); }, 600);
};
window.printFactory = async function() {
    try { await window._refreshCartBlueprintPagesForPrint(); } catch (e) { console.warn('[printFactory] blueprint refresh failed:', e); }
    if (state.orderCart.some(window._cartItemNeedsMediaRefresh)) {
        _showToast('🔄 מרענן תמונות לפני הדפסה...', 3000);
        try { await window._refreshCartMediaForPrint(); } catch (e) { console.warn('[printFactory]', e); }
    }
    const html = _buildPrintHTML('factory');
    const win = window.open('', '_blank', 'width=900,height=700');
    win.document.write(html);
    win.document.close();
    win.focus();
    // Build PDF filename: סוגרים הכל לדירה (orderNum) (custName)
    const _pdfOrder = (state.customer && state.customer.orderNum) ? state.customer.orderNum : '';
    const _pdfName  = (state.customer && state.customer.name)     ? state.customer.name     : '';
    const _pdfParts = ['סוגרים הכל לדירה'];
    if (_pdfOrder) _pdfParts.push(_pdfOrder);
    if (_pdfName)  _pdfParts.push(_pdfName);
    const _pdfTitle = _pdfParts.join(' ');
    // Set title inside setTimeout so it runs after document is fully parsed
    setTimeout(() => { win.document.title = _pdfTitle; win.print(); }, 600);
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
    const cellShow = state.blueprintInternalDimsDefault !== false;
    const colShow = state.blueprintColWidthDimsDefault !== false;
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
<body>${pagesHtml}</body></html>`);
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

    if (item.dimsStr) details.push(item.dimsStr);
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
    if (item.desk && item.desk !== 'ללא' && colorDesk) details.push('צבע שולחן עבודה: ' + colorDesk);

    if (content.openCells > 0) {
        details.push('כוורת פתוחה: ' + content.openCells + (content.openCells === 1 ? ' תא' : ' תאים'));
    }
    if (content.sideOpenCells > 0) {
        details.push('כוורת צד: ' + content.sideOpenCells + (content.sideOpenCells === 1 ? ' תא' : ' תאים'));
    }
    if ((content.openCells + content.sideOpenCells) > 0 && colorOpenCell) {
        details.push('צבע כוורת: ' + colorOpenCell);
    }
    if (item.extraColors) details.push('צבעים נוספים: ' + item.extraColors);

    if (item.slidingDoor) {
        details.push('ארון הזזה — ' + item.slidingDoor.numDoors + ' דלתות | פרופיל: ' + item.slidingDoor.profileColor);
        details.push(item.slidingDoor.doorColorsStr);
        if (item.slidingDoor.hasMirror) details.push('✓ כולל דלת מראה');
    } else if (item.handle) {
        details.push('סוג ידיות: ' + item.handle);
    } else if (rawState && rawState.handleStyle) {
        const handleLabels = { pipe: 'ידית חיצונית', riding: 'ידית רוכבת', touch: "ידית טאצ'" };
        const style = handleLabels[rawState.handleStyle] || handleLabels.pipe;
        const model = (rawState.handleType || '').trim();
        details.push('סוג ידיות: ' + (model ? style + ' — ' + model : style));
    }

    if (item.drawersExt > 0) details.push('מגירות חיצוניות: ' + item.drawersExt);
    if (item.drawersInt > 0) details.push('מגירות פנימיות: ' + item.drawersInt);
    if (item.desk && item.desk !== 'ללא') details.push(item.desk);
    const cu = item.corner;
    if (cu && cu.side !== 'none') {
        const cuSide = cu.side === 'right' ? 'ימין' : 'שמאל';
        details.push(cu.type === 'desk' ? 'יחידה פינתית שולחן (' + cuSide + ')' : 'יחידה פינתית מגירות ×' + (cu.drawerCount || 4) + ' (' + cuSide + ')');
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
    const _hidePrices = (window._showPricing === false);

    const rows = _buildCartData();
    let totalCabPrice = 0, totalInstallPrice = 0;
    let rowsHTML = '';

    rows.forEach(r => {
        totalCabPrice    += r.cabPrice;
        totalInstallPrice += r.instPrice;
        rowsHTML += `
        <tr>
            <td style="padding:10px 14px;border:1px solid #e2e8f0;font-weight:600;color:#1e3a5f;">${r.title}</td>
            <td style="padding:10px 14px;border:1px solid #e2e8f0;font-size:0.9rem;color:#334155;line-height:1.6;">${r.details.replace(/ \| /g,'<br>')}</td>
            ${_hidePrices ? '' : `<td style="padding:10px 14px;border:1px solid #e2e8f0;text-align:center;font-weight:700;color:#1e3a5f;white-space:nowrap;">₪${r.cabPrice.toLocaleString()}</td>
            <td style="padding:10px 14px;border:1px solid #e2e8f0;text-align:center;color:#475569;white-space:nowrap;">₪${r.instPrice.toLocaleString()}</td>`}
        </tr>`;
    });

    const grandTotal = totalCabPrice + totalInstallPrice;

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
  table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 0.97rem; }
  th { background: #1e3a5f; color: white; padding: 10px 14px; text-align: right; font-weight: 600; border: 1px solid #1e3a5f; }
  .totals-row td { background: #f8fafc; font-weight: 600; border-top: 2px solid #1e3a5f; }
  .grand-total { margin-top: 10px; font-size: 1.2rem; font-weight: 800; color: #1e3a5f; }
  .action-bar { display: flex; gap: 10px; margin-bottom: 22px; flex-wrap: wrap; }
  .action-btn { padding: 9px 20px; border-radius: 8px; border: none; font-size: 0.95rem; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 7px; font-family: inherit; }
  .btn-print  { background: #1e3a5f; color: white; }
  .btn-excel  { background: #16a34a; color: white; }
  @media print { .action-bar { display: none !important; } body { padding: 15px; } }
</style>
</head>
<body>

<div class="action-bar">
  <button class="action-btn btn-print"  onclick="window.print()">🖨️ הדפסה / PDF</button>
  <button class="action-btn btn-excel"  onclick="_downloadExcel()">📊 הורדת Excel</button>
</div>

<div class="header">
  <div>
    <h1>סיכום הזמנה ללקוח</h1>
    <div style="font-size:0.85rem;color:#64748b;margin-top:4px;">תאריך: ${new Date().toLocaleDateString('he-IL')}</div>
  </div>
  <div style="display:flex;flex-direction:column;align-items:flex-end;gap:8px;">
    ${logoDataUrl ? `<img src="${logoDataUrl}" style="max-height:60px;max-width:180px;object-fit:contain;" alt="לוגו">` : ''}
    <div class="cust-info" style="text-align:right;">
      ${custName ? `<div><strong>לקוח:</strong> ${custName}</div>` : ''}
      ${custPhone ? `<div><strong>טלפון:</strong> ${custPhone}</div>` : ''}
      ${custOrder ? `<div><strong>מס' הזמנה:</strong> ${custOrder}</div>` : ''}
      ${custAddr  ? `<div><strong>כתובת:</strong> ${custAddr}</div>` : ''}
    </div>
  </div>
</div>

<table>
  <thead>
    <tr>
      <th style="width:18%;">ארון</th>
      <th>פירוט</th>
      ${_hidePrices ? '' : `<th style="width:14%;text-align:center;">מחיר ארון</th>
      <th style="width:14%;text-align:center;">התקנה</th>`}
    </tr>
  </thead>
  <tbody>
    ${rowsHTML}
    ${_hidePrices ? '' : `<tr class="totals-row">
      <td colspan="2" style="padding:10px 14px;border:1px solid #e2e8f0;text-align:right;">סה"כ</td>
      <td style="padding:10px 14px;border:1px solid #e2e8f0;text-align:center;color:#1e3a5f;">₪${totalCabPrice.toLocaleString()}</td>
      <td style="padding:10px 14px;border:1px solid #e2e8f0;text-align:center;color:#1e3a5f;">₪${totalInstallPrice.toLocaleString()}</td>
    </tr>`}
  </tbody>
</table>

${_hidePrices ? '' : `<div class="grand-total">סה"כ לתשלום (כולל התקנה): ₪${grandTotal.toLocaleString()}</div>`}
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

    if (!state.orderCart || state.orderCart.length === 0) {
        alert('אין ארונות בהזמנה. הוסף ארונות קודם.');
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
    const win = window.open('', '_blank', 'width=960,height=780');
    win.document.write(html);
    win.document.close();
    win.focus();

    // Inject functions directly into child window — avoids </script> parsing issues
    win._excelData = excelData;
    win._buildExcelXML = _buildExcelXML;

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
};

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
            rows.forEach(r => {
                const comp = state.columns[colIndex].compartments[r];
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

function _fillUserPricingForm(cfg) {
    const c = cfg || {};
    upsSetMode(c.pricingMode || 'ranges');
    const _sv = function(id, val) { const el = document.getElementById(id); if (el) el.value = val; };
    _sv('ups-sqmPrice', c.sqmPrice || 800);
    _sv('ups-sqmPriceNonMel', c.sqmPriceNonMel || 1040);
    _sv('ups-lmPrice', c.lmPrice || 1200);
    _sv('ups-lmPriceNonMel', c.lmPriceNonMel || 1560);
    _sv('ups-lmHeightBase', c.lmHeightBase || 1200);
    _sv('ups-lmHeightBaseNonMel', c.lmHeightBaseNonMel || 1560);
    _sv('ups-lmHeightThresholdCm', c.lmHeightThresholdCm || 240);
    _sv('ups-lmHeightStepCm', c.lmHeightStepCm || 30);
    _sv('ups-lmHeightStepPct', _upsPct(c.lmHeightStepPct || 0.10));
    _sv('ups-materialsBoardPrice', c.materialsBoardPrice || 180);
    _sv('ups-materialsBoardsPerSqm', c.materialsBoardsPerSqm || 1.4);
    _sv('ups-materialsMultiplier', c.materialsMultiplier || 2.5);
    _sv('ups-profitMultiplier', c.profitMultiplier || 1.7);
    _sv('ups-heightSurcharge', _upsPct(c.heightSurcharge || 0.20));
    _sv('ups-depthSurcharge', _upsPct(c.depthSurcharge || 0.20));
    _sv('ups-sandwichSurcharge', _upsPct(c.sandwichSurcharge || 0.15));
    _sv('ups-installPricePerUnit', c.installPricePerUnit || 110);
    _sv('ups-installUnitCm', c.installUnitCm || 42.5);
    _sv('ups-installHeightSurcharge', _upsPct(c.installHeightSurcharge || 0.20));
    const ex = c.extras || {};
    _sv('ups-internalDrawer', ex.internalDrawer || 150);
    _sv('ups-externalDrawer', ex.externalDrawer || 200);
    _sv('ups-openCell', ex.openCell || 400);
    _sv('ups-partition', ex.partition || 150);
    _sv('ups-shelfFreePerMeter', ex.shelfFreePerMeter || 3);
    _sv('ups-extraShelfMel', ex.extraShelfMel || 60);
    _sv('ups-extraShelfNonMel', ex.extraShelfNonMel || 80);
    _sv('ups-deskUnit', ex.deskUnit || 900);
    _sv('ups-doorFramedMel', ex.doorFramedMel || 80);
    _sv('ups-doorGlassMel', ex.doorGlassMel || 400);
    _sv('ups-doorGlassBlack', ex.doorGlassBlack || 600);
    _sv('ups-doorMirror', ex.doorMirror || 350);
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
    return {
        pricingMode: mode,
        sqmPrice: parseInt(_gv('ups-sqmPrice')) || 800,
        sqmPriceNonMel: parseInt(_gv('ups-sqmPriceNonMel')) || 1040,
        lmPrice: parseInt(_gv('ups-lmPrice')) || 1200,
        lmPriceNonMel: parseInt(_gv('ups-lmPriceNonMel')) || 1560,
        lmHeightBase: parseInt(_gv('ups-lmHeightBase')) || 1200,
        lmHeightBaseNonMel: parseInt(_gv('ups-lmHeightBaseNonMel')) || 1560,
        lmHeightThresholdCm: parseInt(_gv('ups-lmHeightThresholdCm')) || 240,
        lmHeightStepCm: parseInt(_gv('ups-lmHeightStepCm')) || 30,
        lmHeightStepPct: _upsFrac(_gv('ups-lmHeightStepPct')),
        materialsBoardPrice: parseInt(_gv('ups-materialsBoardPrice')) || 180,
        materialsBoardsPerSqm: parseFloat(_gv('ups-materialsBoardsPerSqm')) || 1.4,
        materialsMultiplier: parseFloat(_gv('ups-materialsMultiplier')) || 2.5,
        profitMultiplier: parseFloat(_gv('ups-profitMultiplier')) || 1.7,
        heightSurcharge: _upsFrac(_gv('ups-heightSurcharge')),
        depthSurcharge: _upsFrac(_gv('ups-depthSurcharge')),
        sandwichSurcharge: _upsFrac(_gv('ups-sandwichSurcharge')),
        installPricePerUnit: parseInt(_gv('ups-installPricePerUnit')) || 110,
        installUnitCm: parseFloat(_gv('ups-installUnitCm')) || 42.5,
        installHeightSurcharge: _upsFrac(_gv('ups-installHeightSurcharge')),
        ranges: existing.ranges || {},
        extras: Object.assign({}, existingExtras, {
            internalDrawer: parseInt(_gv('ups-internalDrawer')) || 150,
            externalDrawer: parseInt(_gv('ups-externalDrawer')) || 200,
            openCell: parseInt(_gv('ups-openCell')) || 400,
            partition: parseInt(_gv('ups-partition')) || 150,
            shelfFreePerMeter: parseFloat(_gv('ups-shelfFreePerMeter')) || 3,
            extraShelfMel: parseInt(_gv('ups-extraShelfMel')) || 60,
            extraShelfNonMel: parseInt(_gv('ups-extraShelfNonMel')) || 80,
            deskUnit: parseInt(_gv('ups-deskUnit')) || 900,
            doorFramedMel: parseInt(_gv('ups-doorFramedMel')) || 80,
            doorGlassMel: parseInt(_gv('ups-doorGlassMel')) || 400,
            doorGlassBlack: parseInt(_gv('ups-doorGlassBlack')) || 600,
            doorMirror: parseInt(_gv('ups-doorMirror')) || 350,
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
        closePricingSettings();
        if (typeof _showToast === 'function') _showToast('הגדרות התמחור נשמרו ✓', 3000);
        // Recalculate price with new config
        if (typeof calculatePrice === 'function') calculatePrice();
    } catch(e) {
        if (typeof _showToast === 'function') _showToast('שגיאה בשמירה: ' + e.message, 4000);
        else alert('שגיאה בשמירה: ' + e.message);
    }
}