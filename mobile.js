// ==========================================
// mobile.js — Mobile UI Adapter
// Phases 3-7: All mobile functionality
// ==========================================

// ==========================================
// Phase 3: Core helpers & panel system
// ==========================================

function isMobile() {
    return window.innerWidth <= 768;
}

// Active panel tracking
let _activePanelId = null;

function openMobilePanel(panelId) {
    closeMobilePanel(false);
    const panel = document.getElementById(panelId);
    if (!panel) return;
    panel.classList.add('open');
    _activePanelId = panelId;
    const overlay = document.getElementById('mobile-overlay');
    if (overlay) overlay.classList.add('active');
    document.querySelectorAll('.mobile-nav-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.panel === panelId);
    });
    document.body.classList.add('mobile-panel-open');

    // Sync edit-panel sliders when edit panel opens
    if (panelId === 'mobile-panel-edit') {
        if (!_epDragBound) { _bindEpSliderDrag(); _epDragBound = true; }
        _epSyncFromState();
    }
}

function closeMobilePanel(clearNav = true) {
    if (_activePanelId) {
        const panel = document.getElementById(_activePanelId);
        if (panel) panel.classList.remove('open');
        _activePanelId = null;
    }
    document.querySelectorAll('.mobile-panel.open').forEach(p => p.classList.remove('open'));
    if (clearNav) {
        document.querySelectorAll('.mobile-nav-btn').forEach(btn => btn.classList.remove('active'));
        const overlay = document.getElementById('mobile-overlay');
        if (overlay) overlay.classList.remove('active');
    }
    document.body.classList.remove('mobile-panel-open');
}

function toggleMobilePanel(panelId) {
    if (_activePanelId === panelId) {
        closeMobilePanel();
    } else {
        openMobilePanel(panelId);
    }
}

// ==========================================
// Phase 4: Cell Side Panels (replaces bottom sheet)
// ==========================================

function showMobileCellSheet() {
    hideMobileColSheet();
    const right = document.getElementById('mobile-cell-right-panel');
    const left  = document.getElementById('mobile-cell-left-panel');
    if (!right || !left) return;
    const wasAlreadyOpen = right.classList.contains('open');
    right.classList.add('open');
    left.classList.add('open');
    document.body.classList.add('mobile-cell-panels-open');
    const overlay = document.getElementById('mobile-overlay');
    if (overlay) overlay.classList.add('active');
    // Show column bar
    const colBar = document.getElementById('mobile-col-bar');
    if (colBar) colBar.classList.add('open');
    updateMobileColBarUI();
    // Only reset to main view on first open — don't reset if already open
    // (prevents sub-category view from being dismissed when buildCabinet fires)
    if (!wasAlreadyOpen) _mcpShowMain();
    // updateMobileCellSheetState is called separately by the caller
    // to avoid immediately hiding the panels if state isn't ready yet
}

function hideMobileCellSheet() {
    const right = document.getElementById('mobile-cell-right-panel');
    const left  = document.getElementById('mobile-cell-left-panel');
    const wasOpen = right && right.classList.contains('open');
    if (!wasOpen) return; // already closed
    if (right) right.classList.remove('open');
    if (left)  left.classList.remove('open');
    document.body.classList.remove('mobile-cell-panels-open');
    // Hide column bar
    const colBar = document.getElementById('mobile-col-bar');
    if (colBar) colBar.classList.remove('open');
    // Clear selection directly (no buildCabinet to avoid re-entrant updateToolbarState loop)
    if (state && state.selection) {
        state.selection = { colIndex: -1, rows: [] };
    }
    const colSheet = document.getElementById('mobile-col-sheet');
    if (!_activePanelId && (!colSheet || !colSheet.classList.contains('open'))) {
        const overlay = document.getElementById('mobile-overlay');
        if (overlay) overlay.classList.remove('active');
    }
    // Rebuild cabinet to clear selection highlights (deferred to avoid loop)
    setTimeout(() => { if (typeof buildCabinet === 'function') buildCabinet(); }, 0);
}

// Populate the mobile column bar with current column data
function updateMobileColBarUI() {
    const c = (state.activeEditCol !== undefined && state.activeEditCol !== -1)
        ? state.activeEditCol
        : state.selection.colIndex;
    if (c === -1 || c === undefined) return;
    const col = state.columns[c];
    if (!col) return;

    const shelvesVal  = document.getElementById('mcb-shelves-val');
    const widthVal    = document.getElementById('mcb-width-val');
    const heightVal   = document.getElementById('mcb-height-val');
    const noplinthBtn = document.getElementById('mcb-btn-noplinth');

    if (shelvesVal)  shelvesVal.value  = col.shelves || 0;
    if (widthVal)    widthVal.value    = Math.round(col.width || 0);
    if (heightVal)   heightVal.value   = Math.round(col.height || 0);
    if (noplinthBtn) noplinthBtn.classList.toggle('active', !!col.noPlinth);

    // Desk row — always visible (allows toggling desk on/off)
    const deskRow = document.getElementById('mcb-desk-row');
    const deskBtn = document.getElementById('mcb-btn-desk');
    const deskDrawersGroup = document.getElementById('mcb-desk-drawers-group');
    const deskDrawersCb    = document.getElementById('mcb-desk-drawers-cb');
    const isDesk = col.type === 'desk';
    if (deskRow) deskRow.style.display = 'flex';
    if (deskBtn) deskBtn.classList.toggle('active', isDesk);
    // Drawers checkbox: only when desk is active
    if (deskDrawersGroup) {
        deskDrawersGroup.style.display = isDesk ? 'flex' : 'none';
        if (deskDrawersCb) deskDrawersCb.checked = !!col.hasDrawers;
    }
}
window.updateMobileColBarUI = updateMobileColBarUI;

// ── Right panel navigation helpers ──────────────────────────────────────────

// Map content type → category key
const _mcpTypeToCategory = {
    hanging: 'hanging', sorbet: 'hanging',
    internal_drawers: 'drawer', external_drawers: 'drawer',
    open_cell: 'cell', side_open_cell: 'cell',
    partition: 'partition'
};

function _mcpShowSub(category) {
    const mainView = document.getElementById('mcp-view-main');
    const subView  = document.getElementById('mcp-view-sub');
    if (!mainView || !subView) return;
    mainView.style.display = 'none';
    subView.style.display  = 'flex';
    // Hide all sub-groups, show only the requested one
    ['hanging', 'drawer', 'cell', 'partition'].forEach(cat => {
        const el = document.getElementById('mcp-sub-' + cat);
        if (el) el.style.display = (cat === category) ? 'flex' : 'none';
    });
    window._mcpCurrentSub = category;
}
window._mcpShowSub = _mcpShowSub;

function _mcpShowMain() {
    const mainView = document.getElementById('mcp-view-main');
    const subView  = document.getElementById('mcp-view-sub');
    if (mainView) mainView.style.display = 'flex';
    if (subView)  subView.style.display  = 'none';
    window._mcpCurrentSub = null;
}
window._mcpShowMain = _mcpShowMain;

// ── updateMobileCellSheetState ───────────────────────────────────────────────

function updateMobileCellSheetState() {
    if (state.selection.colIndex === -1 || state.selection.rows.length === 0) {
        hideMobileCellSheet();
        return;
    }
    const c = state.selection.colIndex;
    const col = state.columns[c];
    if (!col) return;
    // Ensure arrays exist (safety guards)
    if (!col.compartments) col.compartments = {};
    if (!Array.isArray(col.doors)) col.doors = [];

    const firstComp = col.compartments[state.selection.rows[0]];
    const activeType = (firstComp && firstComp.type !== 'empty') ? firstComp.type : null;
    const activeCategory = activeType ? (_mcpTypeToCategory[activeType] || null) : null;

    // Highlight category buttons in main view
    ['hanging', 'drawer', 'cell', 'partition'].forEach(cat => {
        const btn = document.getElementById('mcp-cat-' + cat);
        if (btn) btn.classList.toggle('active', cat === activeCategory);
    });

    // Highlight sub-option buttons
    ['hanging', 'sorbet', 'internal_drawers', 'external_drawers', 'open_cell', 'side_open_cell'].forEach(type => {
        const btn = document.getElementById('mcp-' + type);
        if (btn) btn.classList.toggle('active', type === activeType);
    });

    // Door buttons (left panel)
    ['empty', 'right', 'left', 'double', 'flap'].forEach(type => {
        const btn = document.getElementById('mcp-door-' + type);
        if (btn) btn.classList.remove('active');
    });
    const existingDoor = col.doors.find(door =>
        state.selection.rows.some(r => r >= door.startRow && r <= door.endRow)
    );
    if (existingDoor) {
        const activeBtn = document.getElementById('mcp-door-' + existingDoor.type);
        if (activeBtn) activeBtn.classList.add('active');
    } else {
        const noDoorBtn = document.getElementById('mcp-door-empty');
        if (noDoorBtn) noDoorBtn.classList.add('active');
    }

    // Door style section (left panel): show only when a door exists
    const doorStyleSection = document.getElementById('mcp-door-style');
    if (doorStyleSection) {
        const show = !!existingDoor;
        doorStyleSection.style.display = show ? 'flex' : 'none';
        if (show) {
            const activeStyle = existingDoor.style || 'solid';
            ['solid', 'framed_melamine', 'glass_melamine', 'glass_black', 'glass_gold'].forEach(s => {
                const btn = document.getElementById('mcp-door-style-' + s);
                if (btn) btn.classList.toggle('active', s === activeStyle);
            });
        }
    }

    // Drawer count section (right panel — in main view)
    let isDrawerSelected = false;
    let currentCount = 2;
    state.selection.rows.forEach(r => {
        const comp = col.compartments[r];
        if (comp && (comp.type === 'internal_drawers' || comp.type === 'external_drawers')) {
            isDrawerSelected = true;
            currentCount = comp.count;
        }
    });
    const drawerSection = document.getElementById('mcp-drawer-count');
    const drawerDisplay = document.getElementById('mcp-drawer-count-val');
    if (drawerSection) drawerSection.style.display = isDrawerSelected ? 'flex' : 'none';
    if (drawerDisplay) drawerDisplay.innerText = currentCount;

    // ── Handle picker button visibility ──
    let _showHandleR = false;
    let _cellHandleOverride = null;
    state.selection.rows.forEach(r => {
        const comp = col.compartments[r];
        if (comp && comp.type === 'external_drawers') {
            _showHandleR = true;
            _cellHandleOverride = comp.handleStyle || null;
        }
    });
    const _showHandleL = !!(existingDoor && existingDoor.type !== 'empty');

    const mcpHandleSepR = document.getElementById('mcp-handle-sep-r');
    const mcpHandleBtnR = document.getElementById('mcp-handle-btn-r');
    if (mcpHandleSepR) mcpHandleSepR.style.display = _showHandleR ? '' : 'none';
    if (mcpHandleBtnR) {
        mcpHandleBtnR.style.display = _showHandleR ? 'flex' : 'none';
        mcpHandleBtnR.classList.toggle('active', !!_cellHandleOverride);
    }

    const mcpHandleSepL = document.getElementById('mcp-handle-sep-l');
    const mcpHandleBtnL = document.getElementById('mcp-handle-btn-l');
    if (mcpHandleSepL) mcpHandleSepL.style.display = _showHandleL ? '' : 'none';
    if (mcpHandleBtnL) {
        mcpHandleBtnL.style.display = _showHandleL ? 'flex' : 'none';
        mcpHandleBtnL.classList.toggle('active', !!(existingDoor && existingDoor.handleStyle));
    }

    // Sub-cell highlights for partition sub-view
    const firstComp2 = col.compartments[state.selection.rows[0]];
    const hasPartition = firstComp2 && firstComp2.partition && firstComp2.subCells &&
                         firstComp2.type !== 'open_cell' && firstComp2.type !== 'side_open_cell' &&
                         state.selection.rows.length === 1;
    if (hasPartition && firstComp2.subCells) {
        ['hanging', 'internal_drawers'].forEach(t => {
            const btnL = document.getElementById('mcp-subcell-left-' + t);
            const btnR = document.getElementById('mcp-subcell-right-' + t);
            if (btnL) btnL.classList.remove('active');
            if (btnR) btnR.classList.remove('active');
        });
        const rightType = firstComp2.subCells[0] ? firstComp2.subCells[0].type : null;
        const leftType  = firstComp2.subCells[1] ? firstComp2.subCells[1].type : null;
        if (rightType) { const b = document.getElementById('mcp-subcell-right-' + rightType); if (b) b.classList.add('active'); }
        if (leftType)  { const b = document.getElementById('mcp-subcell-left-'  + leftType);  if (b) b.classList.add('active'); }
    }

    // Cell height stepper (right panel — both views)
    const _setHeight = (inputId) => {
        const heightInput = document.getElementById(inputId);
        if (heightInput && state.selection.rows.length > 0) {
            const r = state.selection.rows[0];
            let cellH = 0;
            if (col.shelvesY && col.shelvesY.length > 0) {
                const baseY = (col.type === 'desk') ? (col.deskHeight + col.deskClearance) : state.plinthHeight;
                const topY  = col.height;
                const prevY = (r === 0) ? baseY : col.shelvesY[r - 1];
                const nextY = (r < col.shelvesY.length) ? col.shelvesY[r] : topY;
                cellH = Math.round(nextY - prevY - state.thickness);
            } else {
                cellH = Math.round(col.height - state.plinthHeight);
            }
            heightInput.value = Math.max(1, cellH);
            heightInput.dataset.colIndex = c;
            heightInput.dataset.rowIndex = state.selection.rows[0];
        }
    };
    _setHeight('mcp-height-val');
    _setHeight('mcp-height-val-sub');
}

// Apply cell height change from side panel stepper
function _applyMobileCellHeight(delta) {
    const c = state.selection.colIndex;
    const r = state.selection.rows[0];
    if (c === -1 || r === undefined) return;
    const col = state.columns[c];
    if (!col) return;

    const baseY = (col.type === 'desk') ? (col.deskHeight + col.deskClearance) : state.plinthHeight;
    const topY  = col.height;
    const prevY = (r === 0) ? baseY : col.shelvesY[r - 1];
    const nextY = (r < col.shelvesY.length) ? col.shelvesY[r] : topY;
    const currentH = nextY - prevY - state.thickness;
    const newH = Math.max(10, currentH + delta);
    const diff = newH - currentH;

    if (r < col.shelvesY.length) {
        col.shelvesY[r] = Math.min(topY - state.thickness, col.shelvesY[r] + diff);
    } else {
        col.height = Math.max(col.height + diff, baseY + 10 + state.thickness);
    }

    buildCabinet(); calculatePrice(); saveHistoryState();
    updateMobileCellSheetState();
}

// ==========================================
// Phase 5: Column Sheet
// ==========================================

function showMobileColSheet(colIndex) {
    hideMobileCellSheet();
    state.activeEditCol = colIndex;
    const sheet = document.getElementById('mobile-col-sheet');
    if (!sheet) return;
    sheet.classList.add('open');
    const overlay = document.getElementById('mobile-overlay');
    if (overlay) overlay.classList.add('active');
    updateMobileColSheetUI();
}

function hideMobileColSheet() {
    const sheet = document.getElementById('mobile-col-sheet');
    if (sheet) sheet.classList.remove('open');
    if (!_activePanelId) {
        const rightPanel = document.getElementById('mobile-cell-right-panel');
        const leftPanel  = document.getElementById('mobile-cell-left-panel');
        if ((!rightPanel || !rightPanel.classList.contains('open')) &&
            (!leftPanel  || !leftPanel.classList.contains('open'))) {
            const overlay = document.getElementById('mobile-overlay');
            if (overlay) overlay.classList.remove('active');
        }
    }
}

function updateMobileColSheetUI() {
    if (state.activeEditCol === -1 || !state.columns[state.activeEditCol]) return;
    const col = state.columns[state.activeEditCol];

    const sVal = document.getElementById('mobile-qe-s-val');
    const wVal = document.getElementById('mobile-qe-w-val');
    const hVal = document.getElementById('mobile-qe-h-val');
    if (sVal) sVal.value = col.shelves;
    if (wVal) wVal.value = Math.round(col.width);
    if (hVal) hVal.value = Math.round(col.height);

    // No-plinth button
    const noplinthBtn = document.getElementById('mobile-btn-toggle-noplinth');
    if (noplinthBtn) {
        const isActive = col.noPlinth || (col.floorOffset > 0);
        noplinthBtn.innerHTML = isActive
            ? '<i class="fa-solid fa-border-bottom-right"></i> שחזר צוקל'
            : '<i class="fa-solid fa-border-bottom-right"></i> ביטול צוקל';
        noplinthBtn.style.color = isActive ? 'var(--danger)' : 'var(--text-dark)';
        noplinthBtn.style.borderColor = isActive ? 'var(--danger)' : '';
    }

    // Floor offset row
    const foRow   = document.getElementById('mobile-qe-floor-offset-row');
    const foInput = document.getElementById('mobile-qe-fo-val');
    const fo = col.floorOffset || 0;
    if (foRow)   foRow.style.display = fo > 0 ? 'flex' : 'none';
    if (foInput) foInput.value = fo;

    const deskToggleGroup  = document.getElementById('mobile-qe-desk-toggle-group');
    const deskOptionsGroup = document.getElementById('mobile-qe-internal-desk-options');
    const deskDrawersCheck = document.getElementById('mobile-qe-internal-desk-drawers');

    const canHaveDesk = state.activeEditCol > 0 && state.activeEditCol < state.columns.length - 1;
    if (deskToggleGroup) {
        deskToggleGroup.style.display = canHaveDesk ? 'block' : 'none';
        const toggleBtn = document.getElementById('mobile-btn-toggle-desk');
        if (toggleBtn) {
            if (col.type === 'desk') {
                toggleBtn.innerHTML = '<i class="fa-solid fa-xmark"></i> בטל שולחן פנימי';
                toggleBtn.style.color = 'var(--danger)';
            } else {
                toggleBtn.innerHTML = '<i class="fa-solid fa-desktop"></i> שולחן פנימי';
                toggleBtn.style.color = 'var(--text-dark)';
            }
        }
    }
    if (deskOptionsGroup) deskOptionsGroup.style.display = (col.type === 'desk') ? 'block' : 'none';
    if (deskDrawersCheck) deskDrawersCheck.checked = col.hasDrawers || false;
}

// ==========================================
// Phase 6: Price FAB & View Switching
// ==========================================

function updateMobilePriceDisplay() {
    if (!isMobile()) return;
    const priceDisplay = document.getElementById('price-display');
    const val = parseInt(priceDisplay && priceDisplay.value) || 0;
    const formatted = '\u20AA' + val.toLocaleString();
    // Update topbar price widget
    const tbPrice = document.getElementById('mobile-topbar-price-val');
    if (tbPrice) tbPrice.innerText = formatted;
    // Legacy FAB (kept for backward compat, may not exist)
    const fabPrice = document.getElementById('mobile-fab-price');
    if (fabPrice) fabPrice.innerText = formatted;
}

function updateMobileCartBadge() {
    const badge = document.getElementById('mobile-cart-badge');
    if (badge) {
        const count = (state.orderCart && state.orderCart.length) || 0;
        badge.innerText = count;
        badge.style.display = count > 0 ? 'flex' : 'none';
    }
}

function setMobileView(mode) {
    if (mode === '3d') mode = 'front';
    state.viewMode = mode;
    if (typeof updateCameraView === 'function') updateCameraView();
    if (typeof buildCabinet === 'function') buildCabinet();
    // Sync desktop view buttons
    document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
    const desktopBtn = document.getElementById('btn-' + mode + '-view');
    if (desktopBtn) desktopBtn.classList.add('active');
    // Sync mobile top bar view tabs
    ['front', 'blueprint'].forEach(m => {
        const mBtn = document.getElementById('mbtn-' + m + '-view');
        if (mBtn) mBtn.classList.toggle('active', m === mode);
    });
    // Close any open panel when switching view
    closeMobilePanel();
}

// ==========================================
// Phase 7: Patch existing functions for mobile
// ==========================================

// Patch applyContent — on mobile, preserve selection so side panels stay open after applying content
const _origApplyContent = window.applyContent;
window.applyContent = function(type) {
    if (!isMobile()) {
        if (_origApplyContent) _origApplyContent(type);
        return;
    }
    // Save selection before original clears it
    const savedCol  = state.selection.colIndex;
    const savedRows = state.selection.rows.slice();
    if (_origApplyContent) _origApplyContent(type);
    // Restore selection so panels stay open
    if (savedCol !== -1 && savedRows.length > 0) {
        state.selection = { colIndex: savedCol, rows: savedRows };
        updateMobileCellSheetState();
    }
};

// Patch applyDoor — same: keep panels open on mobile
const _origApplyDoor = window.applyDoor;
window.applyDoor = function(type) {
    if (!isMobile()) {
        if (_origApplyDoor) _origApplyDoor(type);
        return;
    }
    const savedCol  = state.selection.colIndex;
    const savedRows = state.selection.rows.slice();
    if (_origApplyDoor) _origApplyDoor(type);
    if (savedCol !== -1 && savedRows.length > 0) {
        state.selection = { colIndex: savedCol, rows: savedRows };
        updateMobileCellSheetState();
    }
};

// Patch applyDoorStyle — same
const _origApplyDoorStyle = window.applyDoorStyle;
window.applyDoorStyle = function(style) {
    if (!isMobile()) {
        if (_origApplyDoorStyle) _origApplyDoorStyle(style);
        return;
    }
    const savedCol  = state.selection.colIndex;
    const savedRows = state.selection.rows.slice();
    if (_origApplyDoorStyle) _origApplyDoorStyle(style);
    if (savedCol !== -1 && savedRows.length > 0) {
        state.selection = { colIndex: savedCol, rows: savedRows };
        updateMobileCellSheetState();
    }
};

// Patch toggleInternalDesk — refresh col bar after toggling desk
const _origToggleInternalDesk = window.toggleInternalDesk;
window.toggleInternalDesk = function() {
    if (_origToggleInternalDesk) _origToggleInternalDesk();
    if (isMobile()) updateMobileColBarUI();
};

// Patch toggleInternalDeskDrawers — refresh col bar after toggling drawers
const _origToggleInternalDeskDrawers = window.toggleInternalDeskDrawers;
window.toggleInternalDeskDrawers = function(isChecked) {
    if (_origToggleInternalDeskDrawers) _origToggleInternalDeskDrawers(isChecked);
    if (isMobile()) updateMobileColBarUI();
};

// Patch toggleNoPlinth — refresh col bar
const _origToggleNoPlinth = window.toggleNoPlinth;
window.toggleNoPlinth = function() {
    if (_origToggleNoPlinth) _origToggleNoPlinth();
    if (isMobile()) updateMobileColBarUI();
};

// Patch updateQE — refresh col bar after any QE change
const _origUpdateQE = window.updateQE;
window.updateQE = function(dim, delta) {
    if (_origUpdateQE) _origUpdateQE(dim, delta);
    if (isMobile()) updateMobileColBarUI();
};

// Patch updateToolbarState
const _origUpdateToolbarState = window.updateToolbarState;
window.updateToolbarState = function() {
    if (_origUpdateToolbarState) _origUpdateToolbarState();
    if (isMobile()) {
        const hasSelection = state.selection.colIndex !== -1 && state.selection.rows.length > 0;
        if (hasSelection) {
            showMobileCellSheet();
            updateMobileCellSheetState();
        }
        updateMobilePriceDisplay();
    }
};

// Patch updateQuickEditPanelUI — no extra mobile action needed
const _origUpdateQuickEditPanelUI = window.updateQuickEditPanelUI;
window.updateQuickEditPanelUI = function() {
    if (_origUpdateQuickEditPanelUI) _origUpdateQuickEditPanelUI();
};

// Patch updateOverlaysPosition — on mobile, convert #column-quick-edit to fixed positioning.
// ui.js declares updateOverlaysPosition as a top-level function (not const/let), so it IS
// on window and calls to updateOverlaysPosition() inside ui.js resolve via window at call time.
// Therefore patching window.updateOverlaysPosition intercepts all calls.
const _origUpdateOverlaysPosition = window.updateOverlaysPosition;
window.updateOverlaysPosition = function() {
    if (_origUpdateOverlaysPosition) _origUpdateOverlaysPosition();
    if (!isMobile()) return;
    const panel = document.getElementById('column-quick-edit');
    if (!panel || !panel.classList.contains('visible')) return;
    const canvasContainer = document.getElementById('canvas-container');
    if (!canvasContainer) return;
    const rect = canvasContainer.getBoundingClientRect();
    // The original set canvas-relative left/top — convert to viewport-fixed
    const relLeft = parseFloat(panel.style.left) || 0;
    const relTop  = parseFloat(panel.style.top)  || 0;
    panel.style.position = 'fixed';
    panel.style.left = (rect.left + relLeft) + 'px';
    panel.style.top  = (rect.top  + relTop)  + 'px';
};

// Patch updateLeftSidebar
const _origUpdateLeftSidebar = window.updateLeftSidebar;
window.updateLeftSidebar = function(opts) {
    if (_origUpdateLeftSidebar) _origUpdateLeftSidebar(opts);
    _updateMobileOrderPanel();
    updateMobileCartBadge();
    updateMobilePriceDisplay();
    if (opts && opts.scrollToActive && typeof window._scrollActiveCartCardIntoView === 'function') {
        requestAnimationFrame(function() {
            window._scrollActiveCartCardIntoView();
        });
    }
};

function _updateMobileOrderPanel() {
    const cabTotal  = document.getElementById('sidebar-cab-total');
    const instTotal = document.getElementById('sidebar-inst-total');
    const total     = document.getElementById('left-sidebar-total');
    const mCabTotal  = document.getElementById('mobile-sidebar-cab-total');
    const mInstTotal = document.getElementById('mobile-sidebar-inst-total');
    const mTotal     = document.getElementById('mobile-sidebar-total');
    if (mCabTotal  && cabTotal)  mCabTotal.innerHTML  = cabTotal.innerHTML;
    if (mInstTotal && instTotal) mInstTotal.innerHTML = instTotal.innerHTML;
    if (mTotal     && total)     mTotal.innerHTML     = total.innerHTML;
    const srcList = document.getElementById('cart-items-list');
    const dstList = document.getElementById('mobile-cart-items-list');
    if (srcList && dstList) dstList.innerHTML = srcList.innerHTML;
}

// Patch calculatePrice to update price display
const _origCalculatePrice = window.calculatePrice || function(){};
window.calculatePrice = function() {
    _origCalculatePrice();
    updateMobilePriceDisplay();
};

// Patch updateUndoRedoUI
const _origUpdateUndoRedoUI = window.updateUndoRedoUI;
window.updateUndoRedoUI = function() {
    if (_origUpdateUndoRedoUI) _origUpdateUndoRedoUI();
    const isUndoDisabled = (state.historyIndex <= 0);
    const isRedoDisabled = (state.historyIndex >= state.history.length - 1);
    const mUndo  = document.getElementById('mbtn-undo');
    const mRedo  = document.getElementById('mbtn-redo');
    if (mUndo) mUndo.disabled = isUndoDisabled;
    if (mRedo) mRedo.disabled = isRedoDisabled;
    const mUndo2 = document.getElementById('mbtn-undo2');
    const mRedo2 = document.getElementById('mbtn-redo2');
    if (mUndo2) mUndo2.disabled = isUndoDisabled;
    if (mRedo2) mRedo2.disabled = isRedoDisabled;
};

// Toggle doors visibility from top bar
function _toggleMobileDoors() {
    const desktopChk = document.getElementById('inp-has-doors');
    const mobileChk  = document.getElementById('mobile-inp-has-doors');
    if (!desktopChk) return;
    desktopChk.checked = !desktopChk.checked;
    if (mobileChk) mobileChk.checked = desktopChk.checked;
    desktopChk.dispatchEvent(new Event('change'));
    const btn = document.getElementById('mbtn-doors-toggle');
    if (btn) btn.classList.toggle('active', desktopChk.checked);
}
window._toggleMobileDoors = _toggleMobileDoors;

// Patch editCartItem to sync mobile inputs after loading
const _origEditCartItem = window.editCartItem;
window.editCartItem = function(index, opts) {
    if (_origEditCartItem) _origEditCartItem(index, opts);
    if (isMobile()) setTimeout(() => _syncMobileInputsFromState(), 80);
};

// Patch updateDim to keep mobile dimension inputs in sync
const _origUpdateDim = window.updateDim;
window.updateDim = function(dim, delta, absoluteValue) {
    if (_origUpdateDim) _origUpdateDim(dim, delta, absoluteValue);
    if (!isMobile()) return;
    const mWidth  = document.getElementById('mobile-inp-num-width');
    const mHeight = document.getElementById('mobile-inp-num-height');
    const mDepth  = document.getElementById('mobile-inp-num-depth');
    if (mWidth)  mWidth.value  = state.width;
    if (mHeight) mHeight.value = state.globalHeight;
    if (mDepth)  mDepth.value  = state.depth;
    const tbWidth  = document.getElementById('mtb-inp-width');
    const tbHeight = document.getElementById('mtb-inp-height');
    const tbDepth  = document.getElementById('mtb-inp-depth');
    if (tbWidth)  tbWidth.value  = state.width;
    if (tbHeight) tbHeight.value = state.globalHeight;
    if (tbDepth)  tbDepth.value  = state.depth;
    const mColVal = document.getElementById('mobile-val-columns');
    if (mColVal) mColVal.innerText = state.columns.length;
};

// Patch updateColumns to keep mobile columns display in sync
const _origUpdateColumns = window.updateColumns;
window.updateColumns = function(delta) {
    if (_origUpdateColumns) _origUpdateColumns(delta);
    if (!isMobile()) return;
    const mColVal = document.getElementById('mobile-val-columns');
    if (mColVal) mColVal.innerText = state.columns.length;
};

// ==========================================
// bindMobileUI — wire up all mobile events
// ==========================================

function bindMobileUI() {
    if (!isMobile()) return;

    // Bottom nav buttons
    document.querySelectorAll('.mobile-nav-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const panelId = btn.dataset.panel;
            if (panelId) toggleMobilePanel(panelId);
        });
    });

    // Overlay tap to close everything
    const overlay = document.getElementById('mobile-overlay');
    if (overlay) {
        overlay.addEventListener('click', () => {
            closeMobilePanel();
            hideMobileCellSheet();
            hideMobileColSheet();
        });
    }

    // Panel close buttons
    document.querySelectorAll('.mobile-panel .mobile-panel-close').forEach(btn => {
        btn.addEventListener('click', () => closeMobilePanel());
    });

    // View panel: close panel after view switch
    ['mbtn-front-view', 'mbtn-blueprint-view'].forEach(id => {
        const btn = document.getElementById(id);
        if (btn) btn.addEventListener('click', () => closeMobilePanel());
    });

    // Upload texture button for mobile
    const mUploadBtn = document.getElementById('btn-upload-texture-mobile');
    if (mUploadBtn) mUploadBtn.addEventListener('click', () => {
        const inp = document.getElementById('inp-texture');
        if (inp) inp.click();
    });

    // Topbar add-to-cart button
    const mTopbarAdd = document.getElementById('mobile-topbar-add-btn');
    if (mTopbarAdd) mTopbarAdd.addEventListener('click', () => {
        const desktopBtn = document.getElementById('btn-add-to-cart');
        if (desktopBtn) desktopBtn.click();
        setTimeout(() => { updateMobileCartBadge(); updateMobilePriceDisplay(); }, 100);
    });
    // Legacy FAB button
    const mFabAdd = document.getElementById('mobile-fab-add-btn');
    if (mFabAdd) mFabAdd.addEventListener('click', () => {
        const desktopBtn = document.getElementById('btn-add-to-cart');
        if (desktopBtn) desktopBtn.click();
        setTimeout(() => { updateMobileCartBadge(); updateMobilePriceDisplay(); }, 100);
    });

    // Cell height stepper in right side panel
    const cellHeightMinus = document.getElementById('mcp-height-minus');
    const cellHeightPlus  = document.getElementById('mcp-height-plus');
    const cellHeightInput = document.getElementById('mcp-height-val');
    if (cellHeightMinus) cellHeightMinus.addEventListener('click', () => _applyMobileCellHeight(-1));
    if (cellHeightPlus)  cellHeightPlus.addEventListener('click',  () => _applyMobileCellHeight(1));
    if (cellHeightInput) {
        cellHeightInput.addEventListener('change', () => {
            const c = state.selection.colIndex;
            const r = state.selection.rows[0];
            if (c === -1 || r === undefined) return;
            const col = state.columns[c];
            if (!col) return;
            const desiredH = parseInt(cellHeightInput.value);
            if (isNaN(desiredH) || desiredH < 10) return;
            const baseY = (col.type === 'desk') ? (col.deskHeight + col.deskClearance) : state.plinthHeight;
            const topY  = col.height;
            const prevY = (r === 0) ? baseY : col.shelvesY[r - 1];
            const nextY = (r < col.shelvesY.length) ? col.shelvesY[r] : topY;
            const currentH = nextY - prevY - state.thickness;
            const diff = desiredH - currentH;
            if (r < col.shelvesY.length) {
                col.shelvesY[r] = Math.min(topY - state.thickness, col.shelvesY[r] + diff);
            } else {
                col.height = Math.max(col.height + diff, baseY + 10 + state.thickness);
            }
            buildCabinet(); calculatePrice(); saveHistoryState();
            updateMobileCellSheetState();
        });
    }

    // Canvas touch: tap to select cell or open col sheet
    _bindCanvasTouchEvents();

    // Touch events for drag handles
    _patchDragHandlesForTouch();

    // Initial sync
    _syncMobileInputsFromState();
    updateMobilePriceDisplay();
    updateMobileCartBadge();
}

// ==========================================
// Canvas touch event handling
// ==========================================

function _bindCanvasTouchEvents() {
    const canvasContainer = document.getElementById('canvas-container');
    if (!canvasContainer) return;

    let touchStartX = 0, touchStartY = 0, touchStartTime = 0, didMove = false;

    canvasContainer.addEventListener('touchstart', (e) => {
        if (e.touches.length !== 1) return;
        const t = e.touches[0];
        touchStartX = t.clientX; touchStartY = t.clientY;
        touchStartTime = Date.now(); didMove = false;
    }, { passive: true });

    canvasContainer.addEventListener('touchmove', (e) => {
        if (e.touches.length !== 1) return;
        const t = e.touches[0];
        if (Math.abs(t.clientX - touchStartX) > 8 || Math.abs(t.clientY - touchStartY) > 8) didMove = true;
    }, { passive: true });

    canvasContainer.addEventListener('touchend', (e) => {
        if (didMove || Date.now() - touchStartTime > 500) return;
        if (state.viewMode === '3d') return;

        const rect = canvasContainer.getBoundingClientRect();
        const t = e.changedTouches[0];
        const nx = ((t.clientX - rect.left) / rect.width) * 2 - 1;
        const ny = -((t.clientY - rect.top) / rect.height) * 2 + 1;

        if (typeof raycaster === 'undefined' || typeof camera === 'undefined') return;
        raycaster.setFromCamera({ x: nx, y: ny }, camera);

        if (typeof hitBoxes !== 'undefined' && hitBoxes.length > 0) {
            const hits = raycaster.intersectObjects(hitBoxes, false);
            if (hits.length > 0) {
                const obj = hits[0].object;
                const c = obj.userData.colIndex;
                const r = obj.userData.rowIndex;
                if (c !== undefined) {
                    if (r !== undefined && r >= 0) {
                        // Tap on a cell → select it and open side panels
                        state.selection = { colIndex: c, rows: [r] };
                        state.activeEditCol = c;
                        // Rebuild to show selection highlight
                        if (typeof buildCabinet === 'function') buildCabinet();
                        showMobileCellSheet();
                        updateMobileCellSheetState();
                        // Also trigger updateQuickEditPanelUI so col panel floats below zokel
                        if (typeof updateQuickEditPanelUI === 'function') updateQuickEditPanelUI();
                    } else {
                        // Tap on column-level hitbox (plinth area) → show floating col quick-edit
                        state.activeEditCol = c;
                        hideMobileCellSheet();
                        if (typeof updateQuickEditPanelUI === 'function') updateQuickEditPanelUI();
                    }
                    return;
                }
            }
        }

        // Tap on empty area — deselect and close everything
        if (typeof clearSelection === 'function') clearSelection();
        hideMobileCellSheet();
        state.activeEditCol = -1;
        if (typeof updateQuickEditPanelUI === 'function') updateQuickEditPanelUI();
    });
}

// ==========================================
// Touch support for drag handles
// ==========================================

function _patchDragHandlesForTouch() {
    if (window._mobileDragTouchBound) return;
    window._mobileDragTouchBound = true;

    window.addEventListener('touchmove', (e) => {
        if (!window._mobileIsDragging) return;
        e.preventDefault();
        const t = e.touches[0];
        window.dispatchEvent(new PointerEvent('pointermove', {
            clientX: t.clientX, clientY: t.clientY,
            bubbles: true, cancelable: true, pointerId: 1
        }));
    }, { passive: false });

    window.addEventListener('touchend', () => {
        if (!window._mobileIsDragging) return;
        window._mobileIsDragging = false;
        window.dispatchEvent(new PointerEvent('pointerup', {
            bubbles: true, cancelable: true, pointerId: 1
        }));
    });
}

// Called after buildDragHandlesUI creates handles — adds touchstart to each
function _addTouchToDragHandles() {
    const dragLayer = document.getElementById('drag-handles-layer');
    if (!dragLayer) return;
    dragLayer.querySelectorAll('.drag-handle').forEach(handle => {
        if (handle.dataset.touchBound) return;
        handle.dataset.touchBound = '1';
        handle.addEventListener('touchstart', (e) => {
            e.preventDefault();
            e.stopPropagation();
            window._mobileIsDragging = true;
            const t = e.touches[0];
            handle.dispatchEvent(new PointerEvent('pointerdown', {
                clientX: t.clientX, clientY: t.clientY,
                bubbles: true, cancelable: true, pointerId: 1
            }));
        }, { passive: false });
    });
}

// Patch buildDragHandlesUI to add touch after it runs
const _origBuildDragHandlesUI = window.buildDragHandlesUI;
window.buildDragHandlesUI = function() {
    if (_origBuildDragHandlesUI) _origBuildDragHandlesUI();
    if (isMobile()) _addTouchToDragHandles();
};

// Patch buildDimensionsAndButtonsUI — on mobile make dim-containers tappable to open cell side panels
const _origBuildDimensionsAndButtonsUI = window.buildDimensionsAndButtonsUI;
window.buildDimensionsAndButtonsUI = function() {
    if (_origBuildDimensionsAndButtonsUI) _origBuildDimensionsAndButtonsUI();
    if (!isMobile()) return;

    // Hide all plus-btn overlays on mobile — dim-container is the tap target instead
    document.querySelectorAll('.plus-btn').forEach(btn => {
        btn.style.display = 'none';
    });

    // Stamp colIndex/rowIndex directly onto each cell dim-container from state.dimData
    // (dim-containers only have x3d/y3d; we need to match them to dimData entries)
    if (typeof state !== 'undefined' && state.dimData) {
        document.querySelectorAll('.dim-container').forEach(dimEl => {
            const x = parseFloat(dimEl.dataset.x3d);
            const y = parseFloat(dimEl.dataset.y3d);
            const match = state.dimData.find(d =>
                d.colIndex !== undefined && d.rowIndex !== undefined &&
                !d.isDeskWidth && !d.isDeskHeight && !d.isDeskDrawer &&
                !d.isInternalDeskSurface && !d.isInternalDeskClearance &&
                !d.isInternalDeskDrawer && !d.isWingOpenWidth &&
                Math.abs(d.x - x) < 0.01 && Math.abs(d.y - y) < 0.01
            );
            if (match) {
                dimEl.dataset.colIndex = match.colIndex;
                dimEl.dataset.rowIndex = match.rowIndex;
            }
        });
    }

    // Make each cell dim-container a tap target that selects the cell and opens the side panels
    document.querySelectorAll('.dim-container').forEach(dimEl => {
        if (dimEl.dataset.mobileTapBound) return;
        // Only bind tap on cell dim-containers (those with colIndex/rowIndex)
        if (dimEl.dataset.colIndex === undefined || dimEl.dataset.rowIndex === undefined) return;
        dimEl.dataset.mobileTapBound = '1';

        dimEl.style.cursor = 'pointer';
        dimEl.style.userSelect = 'none';

        // Replace the ס"מ suffix with a tap icon to signal it's tappable
        const suffix = dimEl.querySelector('.dim-suffix');
        if (suffix) {
            suffix.innerHTML = '<i class="fa-solid fa-pen" style="font-size:9px;opacity:0.6;"></i>';
        }

        // Block the input from being directly edited on mobile
        const input = dimEl.querySelector('.dim-input');
        if (input) {
            input.addEventListener('touchstart', (e) => {
                e.preventDefault();
                e.stopPropagation();
                _openCellSheetFromDim(dimEl);
            }, { passive: false });
            input.addEventListener('focus', (e) => {
                if (isMobile()) {
                    e.preventDefault();
                    input.blur();
                    _openCellSheetFromDim(dimEl);
                }
            });
        }

        dimEl.addEventListener('touchstart', (e) => {
            e.preventDefault();
            e.stopPropagation();
            _openCellSheetFromDim(dimEl);
        }, { passive: false });
    });
};

function _openCellSheetFromDim(dimEl) {
    // colIndex and rowIndex are stamped directly onto the dim-container by the patch above
    const colIndex = parseInt(dimEl.dataset.colIndex);
    const rowIndex = parseInt(dimEl.dataset.rowIndex);

    if (isNaN(colIndex) || isNaN(rowIndex) || colIndex === -1 || rowIndex === -1) return;

    // Set selection, rebuild to show green highlight, then open panels
    state.selection = { colIndex: colIndex, rows: [rowIndex] };
    state.activeEditCol = colIndex;
    if (typeof buildCabinet === 'function') buildCabinet();
    showMobileCellSheet();
    updateMobileCellSheetState();
}

// ==========================================
// Helper: bind dimension stepper
// ==========================================

function _bindDimStepper(inputId, dimKey, min, max, step) {
    const inp = document.getElementById(inputId);
    if (!inp) return;
    const stepper = inp.closest('.mobile-stepper') || inp.parentElement;
    if (!stepper) return;
    const buttons = stepper.querySelectorAll('button');
    const minusBtn = buttons[0];
    const plusBtn  = buttons[buttons.length - 1];

    const apply = (val) => {
        val = Math.max(min, Math.min(max, Math.round(val)));
        inp.value = val;
        if (typeof updateDim === 'function') updateDim(dimKey, null, val);
        if (typeof saveHistoryState === 'function') saveHistoryState();
    };

    if (minusBtn) minusBtn.addEventListener('click', () => apply((parseInt(inp.value) || 0) - step));
    if (plusBtn)  plusBtn.addEventListener('click',  () => apply((parseInt(inp.value) || 0) + step));
    inp.addEventListener('change', () => apply(parseInt(inp.value) || 0));
}

// ==========================================
// Helper: sync mobile inputs from current state
// ==========================================

function _syncMobileInputsFromState() {
    const mWidth  = document.getElementById('mobile-inp-num-width');
    const mHeight = document.getElementById('mobile-inp-num-height');
    const mDepth  = document.getElementById('mobile-inp-num-depth');
    if (mWidth)  mWidth.value  = state.width || 160;
    if (mHeight) mHeight.value = state.globalHeight || 240;
    if (mDepth)  mDepth.value  = state.depth || 54;

    const tbWidth  = document.getElementById('mtb-inp-width');
    const tbHeight = document.getElementById('mtb-inp-height');
    const tbDepth  = document.getElementById('mtb-inp-depth');
    if (tbWidth)  tbWidth.textContent  = Math.round(state.globalWidth  || state.width  || 160);
    if (tbHeight) tbHeight.textContent = Math.round(state.globalHeight || 240);
    if (tbDepth)  tbDepth.textContent  = Math.round(state.globalDepth  || state.depth  || 54);

    const desktopChk = document.getElementById('inp-has-doors');
    const doorsBtn   = document.getElementById('mbtn-doors-toggle');
    if (desktopChk && doorsBtn) doorsBtn.classList.toggle('active', desktopChk.checked);

    const mColVal = document.getElementById('mobile-val-columns');
    if (mColVal) mColVal.innerText = state.columns ? state.columns.length : 2;

    const mPlinth = document.getElementById('mobile-inp-plinth');
    if (mPlinth) mPlinth.value = state.cabinetModel || 'maya';

    const mPlacement = document.getElementById('mobile-inp-placement');
    if (mPlacement) mPlacement.value = state.placement || 'wall';

    const mBoardMat = document.getElementById('mobile-inp-board-mat');
    if (mBoardMat) mBoardMat.value = state.boardMaterial || 'melamine';

    const mDeskSide = document.getElementById('mobile-inp-desk-side');
    if (mDeskSide) mDeskSide.value = (state.desk && state.desk.side) || 'none';

    const mDeskControls = document.getElementById('mobile-desk-controls');
    if (mDeskControls) mDeskControls.style.display = (state.desk && state.desk.side !== 'none') ? 'block' : 'none';

    const mCabName = document.getElementById('mobile-inp-cabinet-name');
    if (mCabName) mCabName.value = state.cabinetName || '';

    const mCabNotes = document.getElementById('mobile-inp-cabinet-notes');
    if (mCabNotes) mCabNotes.value = state.cabinetNotes || '';

    const mHandleType = document.getElementById('mobile-inp-handle-type');
    if (mHandleType) mHandleType.value = state.handleType || '';
    const _hs = state.handleStyle || 'pipe';
    document.querySelectorAll('.mobile-handle-style-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.style === _hs);
    });

    ['front', 'blueprint'].forEach(m => {
        const btn = document.getElementById('mbtn-' + m + '-view');
        if (btn) btn.classList.toggle('active', (state.viewMode || 'front') === m);
    });
}

// ==========================================
// Watch price-display for changes → update display
// ==========================================

function _watchPriceDisplay() {
    const priceDisplay = document.getElementById('price-display');
    if (!priceDisplay) return;
    priceDisplay.addEventListener('input',  updateMobilePriceDisplay);
    priceDisplay.addEventListener('change', updateMobilePriceDisplay);
}

// ==========================================
// Dims Floating Modal
// ==========================================

var _DIMS_CONFIG = {
    width:  { min: (window.MIN_WARDROBE_WIDTH || 10), max: 600, step: 1, key: 'width', stateKey: 'globalWidth'  },
    height: { min: 100, max: 280, step: 1, key: 'height',      stateKey: 'globalHeight' },
    depth:  { min: 10,  max: 80,  step: 1, key: 'depth',       stateKey: 'globalDepth'  }
};

var _dimSliderDragBound = false;

function openDimsModal(focusDim) {
    // Sync slider values from current state
    var w = Math.round(state.globalWidth  || state.width  || 160);
    var h = Math.round(state.globalHeight || 240);
    var d = Math.round(state.globalDepth  || state.depth  || 54);
    var cols = state.columns ? state.columns.length : 2;

    _setDimSlider('width',  w);
    _setDimSlider('height', h);
    _setDimSlider('depth',  d);
    _setColumnsSlider(cols);

    var modal = document.getElementById('dims-float-modal');
    if (modal) modal.classList.add('open');

    // Bind drag listeners once
    if (!_dimSliderDragBound) {
        _bindDimSliderDrag();
        _bindColumnsSliderDrag();
        _dimSliderDragBound = true;
    }

    // Position thumb labels + bubbles after slide-up starts (needs layout)
    setTimeout(function() {
        _applyDimSlider('width',  w);
        _applyDimSlider('height', h);
        _applyDimSlider('depth',  d);
        _applyColumnsSlider(cols);
    }, 50);
}

function closeDimsModal() {
    var modal = document.getElementById('dims-float-modal');
    if (modal) modal.classList.remove('open');
    // Save history after closing
    if (typeof saveHistoryState === 'function') saveHistoryState();
}

function _setDimSlider(dim, val) {
    var slider = document.getElementById('dfm-slider-' + dim);
    var valEl  = document.getElementById('dfm-val-' + dim);
    var tlbl   = document.getElementById('dfm-tlbl-' + dim);
    if (slider) slider.value = val;
    if (valEl)  valEl.textContent = val;
    if (tlbl)   tlbl.textContent  = val;
}

// Calculate thumb left position in px
function _thumbLeftPx(slider, val) {
    var min    = parseFloat(slider.min) || 0;
    var max    = parseFloat(slider.max) || 100;
    var pct    = (val - min) / (max - min);
    var trackW = slider.offsetWidth;
    var thumbR = 18; // half of 36px thumb
    return thumbR + pct * (trackW - 2 * thumbR) + 2; // +4px visual correction
}

function _applyDimSlider(dim, val) {
    val = parseInt(val);
    var slider = document.getElementById('dfm-slider-' + dim);
    var valEl  = document.getElementById('dfm-val-' + dim);
    var tlbl   = document.getElementById('dfm-tlbl-' + dim);

    if (slider) {
        var leftPx = _thumbLeftPx(slider, val);
        // Bubble is in .dfm-bubble-row (same width as slider row)
        if (valEl) {
            valEl.textContent = val;
            valEl.style.left  = leftPx + 'px';
        }
        // Thumb label is in .dfm-slider-row, positioned over the thumb
        if (tlbl) {
            tlbl.textContent = val;
            tlbl.style.left  = leftPx + 'px';
        }
    }

    // Update the top-bar chip
    var chip = document.getElementById('mtb-inp-' + dim);
    if (chip) chip.textContent = val;

    // Apply to state via updateDim
    if (typeof updateDim === 'function') {
        updateDim(dim, 0, val);
    }
}

function _stepDim(dim, delta) {
    var cfg    = _DIMS_CONFIG[dim];
    var slider = document.getElementById('dfm-slider-' + dim);
    if (!slider) return;
    var cur = parseInt(slider.value) || cfg.min;
    var nv  = Math.max(cfg.min, Math.min(cfg.max, cur + delta));
    slider.value = nv;
    _applyDimSlider(dim, nv);
}

// ==========================================
// Edit Panel sliders (same style, ep- prefix)
// ==========================================
function _epApplySlider(dim, val) {
    val = parseInt(val);
    var slider = document.getElementById('ep-slider-' + dim);
    var valEl  = document.getElementById('ep-val-' + dim);
    var tlbl   = document.getElementById('ep-tlbl-' + dim);

    if (slider) {
        var leftPx = _thumbLeftPx(slider, val);
        if (valEl) { valEl.textContent = val; valEl.style.left = leftPx + 'px'; }
        if (tlbl)  { tlbl.textContent  = val; tlbl.style.left  = leftPx + 'px'; }
    }

    // Sync bottom-sheet slider + top-bar chip
    var bsSlider = document.getElementById('dfm-slider-' + dim);
    if (bsSlider) bsSlider.value = val;
    var bsVal  = document.getElementById('dfm-val-' + dim);
    var bsTlbl = document.getElementById('dfm-tlbl-' + dim);
    if (bsVal)  { bsVal.textContent  = val; }
    if (bsTlbl) { bsTlbl.textContent = val; }
    var chip = document.getElementById('mtb-inp-' + dim);
    if (chip) chip.textContent = val;

    if (typeof updateDim === 'function') updateDim(dim, 0, val);
}

function _epStepDim(dim, delta) {
    var cfg    = _DIMS_CONFIG[dim];
    var slider = document.getElementById('ep-slider-' + dim);
    if (!slider) return;
    var cur = parseInt(slider.value) || cfg.min;
    var nv  = Math.max(cfg.min, Math.min(cfg.max, cur + delta));
    slider.value = nv;
    _epApplySlider(dim, nv);
}

function _epSyncFromState() {
    var w = Math.round(state.globalWidth  || state.width  || 160);
    var h = Math.round(state.globalHeight || 240);
    var d = Math.round(state.globalDepth  || state.depth  || 54);
    ['width','height','depth'].forEach(function(dim) {
        var val = dim === 'width' ? w : dim === 'height' ? h : d;
        var slider = document.getElementById('ep-slider-' + dim);
        if (slider) slider.value = val;
    });
    setTimeout(function() {
        _epApplySlider('width',  w);
        _epApplySlider('height', h);
        _epApplySlider('depth',  d);
    }, 50);
}

var _epDragBound = false;
function _bindEpSliderDrag() {
    ['width', 'height', 'depth'].forEach(function(dim) {
        var slider = document.getElementById('ep-slider-' + dim);
        var wrap   = document.getElementById('ep-wrap-' + dim);
        if (!slider || !wrap) return;
        var _moved = false;
        slider.addEventListener('pointerdown', function() { _moved = false; wrap.classList.add('dragging'); });
        slider.addEventListener('input', function() {
            if (!_moved) {
                _moved = true;
                window._isDragging = true;
                if (window._roomGroup) window._roomGroup.visible = false;
            }
        });
        slider.addEventListener('pointerup', function() {
            wrap.classList.remove('dragging');
            if (_moved) { _moved = false; if (typeof _endDrag === 'function') _endDrag(); }
        });
        slider.addEventListener('pointercancel', function() {
            wrap.classList.remove('dragging');
            if (_moved) { _moved = false; if (typeof _endDrag === 'function') _endDrag(); }
        });
    });
}

// Expose globally
window._epApplySlider = _epApplySlider;
window._epStepDim     = _epStepDim;
window._epSyncFromState = _epSyncFromState;

// Bind drag-state listeners so bubble shows above thumb during drag
function _bindDimSliderDrag() {
    ['width', 'height', 'depth'].forEach(function(dim) {
        var slider = document.getElementById('dfm-slider-' + dim);
        var wrap   = document.getElementById('dfm-wrap-' + dim);
        if (!slider || !wrap) return;
        var _moved = false;
        slider.addEventListener('pointerdown', function() { _moved = false; wrap.classList.add('dragging'); });
        slider.addEventListener('input', function() {
            if (!_moved) {
                _moved = true;
                window._isDragging = true;
                if (window._roomGroup) window._roomGroup.visible = false;
            }
        });
        slider.addEventListener('pointerup', function() {
            wrap.classList.remove('dragging');
            if (_moved) { _moved = false; if (typeof _endDrag === 'function') _endDrag(); }
        });
        slider.addEventListener('pointercancel', function() {
            wrap.classList.remove('dragging');
            if (_moved) { _moved = false; if (typeof _endDrag === 'function') _endDrag(); }
        });
    });
}

// Columns slider helpers
function _setColumnsSlider(val) {
    var slider = document.getElementById('dfm-slider-columns');
    var valEl  = document.getElementById('dfm-val-columns');
    var tlbl   = document.getElementById('dfm-tlbl-columns');
    if (slider) slider.value = val;
    if (valEl)  valEl.textContent = val;
    if (tlbl)   tlbl.textContent  = val;
}

function _applyColumnsSlider(val) {
    val = parseInt(val);
    var slider = document.getElementById('dfm-slider-columns');
    var valEl  = document.getElementById('dfm-val-columns');
    var tlbl   = document.getElementById('dfm-tlbl-columns');
    if (slider) {
        var leftPx = _thumbLeftPx(slider, val);
        if (valEl) { valEl.textContent = val; valEl.style.left = leftPx + 'px'; }
        if (tlbl)  { tlbl.textContent  = val; tlbl.style.left  = leftPx + 'px'; }
    }
    // Sync desktop inp-columns
    var inpCols = document.getElementById('inp-columns');
    if (inpCols) inpCols.value = val;
    var valCols = document.getElementById('val-columns');
    if (valCols) valCols.innerText = val;
    var mobileValCols = document.getElementById('mobile-val-columns');
    if (mobileValCols) mobileValCols.textContent = val;
    // Distribute + rebuild (same as updateColumns)
    if (typeof distributeColumns === 'function') distributeColumns(val);
    if (typeof buildCabinet      === 'function') buildCabinet();
    if (typeof calculatePrice    === 'function') calculatePrice();
    if (typeof saveHistoryState  === 'function') saveHistoryState();
}

function _stepColumns(delta) {
    var slider = document.getElementById('dfm-slider-columns');
    if (!slider) return;
    var cur = parseInt(slider.value) || 2;
    var nv  = Math.max(1, Math.min(8, cur + delta));
    slider.value = nv;
    _applyColumnsSlider(nv);
}

function _bindColumnsSliderDrag() {
    var slider = document.getElementById('dfm-slider-columns');
    var wrap   = document.getElementById('dfm-wrap-columns');
    if (!slider || !wrap) return;
    slider.addEventListener('pointerdown', function() { wrap.classList.add('dragging'); });
    slider.addEventListener('pointerup',   function() { wrap.classList.remove('dragging'); });
    slider.addEventListener('pointercancel', function() { wrap.classList.remove('dragging'); });
}

window._applyColumnsSlider = _applyColumnsSlider;
window._stepColumns        = _stepColumns;

// Close dims modal on outside tap
document.addEventListener('pointerdown', function(e) {
    var modal = document.getElementById('dims-float-modal');
    if (!modal || !modal.classList.contains('open')) return;
    if (!modal.contains(e.target)) closeDimsModal();
}, { passive: true });

// Expose globally
window.openDimsModal   = openDimsModal;
window.closeDimsModal  = closeDimsModal;
window._stepDim        = _stepDim;
window._applyDimSlider = _applyDimSlider;

// ==========================================
// Initialization
// ==========================================

function _fixRendererBackground() {
    if (typeof renderer !== 'undefined' && renderer.setClearColor) {
        renderer.setClearColor(0xf0f4f8, 1);
    }
    const canvas = document.querySelector('#canvas-container canvas');
    if (canvas) {
        canvas.style.webkitTapHighlightColor = 'transparent';
        canvas.style.background = '#f0f4f8';
    }
}

function _moveQuickEditToBody() {
    const panel = document.getElementById('column-quick-edit');
    if (panel && panel.parentElement && panel.parentElement.id === 'canvas-container') {
        document.body.appendChild(panel);
    }
}

function initMobileUI() {
    if (!isMobile()) return;
    _moveQuickEditToBody();
    _fixRendererBackground();
    bindMobileUI();
    _watchPriceDisplay();
    setTimeout(() => {
        _fixRendererBackground();
        _syncMobileInputsFromState();
        updateMobilePriceDisplay();
        updateMobileCartBadge();
        _updateMobileOrderPanel();
    }, 250);
    window.addEventListener('resize', () => {
        if (isMobile()) {
            updateMobilePriceDisplay();
            updateMobileCartBadge();
        }
    });
}

// Auto-init after main app finishes (main app uses setTimeout 100ms)
setTimeout(initMobileUI, 350);

// ==========================================
// Expose functions globally for inline onclick handlers in HTML
// ==========================================
window.openMobilePanel          = openMobilePanel;
window.closeMobilePanel         = closeMobilePanel;
window.toggleMobilePanel        = toggleMobilePanel;
window.showMobileCellSheet      = showMobileCellSheet;
window.hideMobileCellSheet      = hideMobileCellSheet;
window.updateMobileCellSheetState = updateMobileCellSheetState;
window.showMobileColSheet       = showMobileColSheet;
window.hideMobileColSheet       = hideMobileColSheet;
window.updateMobileColSheetUI   = updateMobileColSheetUI;
window.updateMobilePriceDisplay = updateMobilePriceDisplay;
window.updateMobileCartBadge    = updateMobileCartBadge;
window.setMobileView            = setMobileView;