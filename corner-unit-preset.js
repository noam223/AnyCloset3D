// ==========================================
// corner-unit-preset.js
// Standalone "corner unit" cabinet (corner drawers / corner desk) that lives as its own
// cabinet in a shared space. Data stays in wing.corner (flagged standalone) so the existing
// corner controls, renderer, pricing and print helpers keep working.
// The engine turns the unit so its open side faces the front, so header dims map straight:
// width = corner.width (front face), depth = corner.depth, height = corner.height.
// Also owns the add-ons tab: the "add unit to space" buttons and the legacy embedded add-on sections.
// Loaded after writing-desk-preset.js in index.html.
// ==========================================

const CU_DEFAULTS = {
    drawers: { width: 60, height: 90, depth: 54 },
    desk:    { width: 60, height: 75, depth: 54 }
};

function _getCUWing() {
    return state && state.wings && state.wings.center ? state.wings.center : null;
}

function _isCornerUnitPreset() {
    return state.presetId === 'corner-unit';
}

/** Mirrors the corner dims onto the wing so footprint, camera and blueprint frames see the real size. */
function _cuSyncWingDims(cw) {
    if (!cw || !cw.corner) return;
    const cu = cw.corner;
    cw.width = cu.width || 60;
    cw.depth = cu.depth || 54;
    cw.globalHeight = cu.height || 90;
    const sync = (ids, val) => ids.forEach(id => { const el = document.getElementById(id); if (el) el.value = val; });
    sync(['inp-width', 'inp-num-width', 'dim-pill-width', 'inp-slider-width', 'ep-inp-width', 'ep-inp-num-width'], cw.width);
    sync(['inp-depth', 'inp-num-depth', 'dim-pill-depth', 'inp-slider-depth', 'ep-inp-depth', 'ep-inp-num-depth'], cw.depth);
    sync(['inp-height', 'inp-num-height', 'dim-pill-height', 'inp-slider-height', 'ep-inp-height', 'ep-inp-num-height'], cw.globalHeight);
    const lbl = document.getElementById('val-height');
    if (lbl) lbl.innerText = cw.globalHeight;
    if (typeof window._syncAllRangeFills === 'function') window._syncAllRangeFills();
}

window._applyCornerUnitPreset = function(type, side) {
    const cw = _getCUWing();
    if (!cw) return;
    const prev = cw.corner && cw.corner.standalone ? cw.corner : null;
    const t = (type === 'desk' || type === 'drawers') ? type : ((prev && prev.type === 'desk') ? 'desk' : 'drawers');
    const sd = (side === 'left' || side === 'right') ? side : ((prev && prev.side === 'left') ? 'left' : 'right');
    const d = CU_DEFAULTS[t];

    cw.columns = [];
    cw.hasDoors = false;
    cw.desk = { side: 'none', width: 100, height: 80, hasDrawers: true, drawerHeight: 12, drawerCount: null, mergeDrawers: false };
    cw.writingDesk = null;
    cw.sideCabinet = null;
    cw.corner = {
        side: sd, standalone: true, type: t,
        width: d.width, height: d.height, depth: d.depth,
        shelves: 3, drawerCount: 4,
        deskDrawerCount: 0, deskDrawerHeight: 13, deskFloating: false
    };
    cw.activeColorPart = 'materialBody';
    _cuSyncWingDims(cw);
    window._updateExtrasSections();
};

/**
 * The cabinet a standalone corner unit (space slot `slot`) sits in front of: a non-rotated
 * space member whose front face touches the unit's back and whose width overlaps it.
 * Returns { slot, off, wing, col, colIndex } (col = the column behind the unit) or null.
 */
function _cuFindHostColumn(cu, slot, preferCol) {
    if (typeof window._getSpacePairInfo !== 'function') return null;
    const info = window._getSpacePairInfo();
    if (!info || !cu) return null;
    const me = window._spaceOffsetForSlot(slot);
    const turned = me.rot === 90 || me.rot === 270;
    const halfX = (turned ? (cu.depth || 54) : (cu.width || 60)) / 2;
    const halfZ = (turned ? (cu.width || 60) : (cu.depth || 54)) / 2;
    const backZ = (me.z || 0) - halfZ;
    let best = null;
    info.members.forEach(function(m) {
        if (m.slot === slot) return;
        const off = window._spaceOffsetForSlot(m.slot);
        if (off.rot) return;
        const wings = window._spaceWingsForSlot(m.slot);
        const w = wings && wings.center;
        if (!w || !w.columns || !w.columns.length) return;
        const fp = window._spaceCabinetFootprint(m.slot);
        const gapZ = Math.abs(((off.z || 0) + fp.d / 2) - backZ);
        const overlap = Math.min(me.x + halfX, off.x + fp.w / 2) - Math.max(me.x - halfX, off.x - fp.w / 2);
        if (gapZ > 15 || overlap <= 0) return;
        if (!best || gapZ < best.gapZ) best = { slot: m.slot, off: off, wing: w, gapZ: gapZ };
    });
    if (!best) return null;
    const w = best.wing;
    let colIndex = -1;
    if (preferCol != null && preferCol >= 0 && preferCol < w.columns.length) {
        colIndex = preferCol;
    } else {
        // Column under the unit's center (columns run left → right inside the outer walls)
        const t = w.thickness || 1.7;
        const localX = me.x - best.off.x;
        let x = -(w.width || 160) / 2 + t;
        colIndex = localX < 0 ? 0 : w.columns.length - 1;
        for (let i = 0; i < w.columns.length; i++) {
            const cwid = w.columns[i].width || 0;
            if (localX >= x && localX <= x + cwid + t) { colIndex = i; break; }
            x += cwid + t;
        }
    }
    best.col = w.columns[colIndex];
    best.colIndex = colIndex;
    return best;
}

function _cuShelfT(w) {
    const t = w.thickness || 1.7;
    return typeof window._shelfThicknessCm === 'function' ? window._shelfThicknessCm(t) : t;
}

/** Column center (host-local X) and its outer span including both side boards. */
function _cuColumnSpan(w, ci) {
    const t = w.thickness || 1.7;
    let x = -(w.width || 160) / 2 + t;
    for (let i = 0; i < ci; i++) x += (w.columns[i].width || 0) + t;
    const cwid = w.columns[ci].width || 0;
    return { center: x + cwid / 2, span: cwid + 2 * t };
}

/** Shelf tops of the host column, in cm from the corner unit's floor. */
function _cuHostShelfTops(host, deskOff) {
    const shelfT = _cuShelfT(host.wing);
    const dy = (host.off.y || 0) - (deskOff.y || 0);
    return ((host.col && host.col.shelvesY) || []).map(function(y) {
        return Math.round((y + shelfT / 2 + dy) * 10) / 10;
    });
}

function _cuNearestIndex(arr, v) {
    let bi = 0;
    for (let i = 1; i < arr.length; i++) if (Math.abs(arr[i] - v) < Math.abs(arr[bi] - v)) bi = i;
    return bi;
}

function _cuSetSlotX(slot, x) {
    const info = window._getSpacePairInfo();
    const item = info && state.orderCart[info.slotIndices[slot]];
    if (!item) return;
    const o = Object.assign({}, window._getSpaceOffset(item), { x: x });
    item.spaceOffset = o;
    if (!item.rawState) item.rawState = {};
    item.rawState.spaceOffset = o;
}

/**
 * Desk follows the merged shelf/column: top flush with the shelf, depth = column span,
 * centered on the column. Returns true if anything changed.
 */
function _cuAlignDeskToHost(cu, slot) {
    const ms = cu && cu.mergeShelf;
    if (!ms) return false;
    const host = _cuFindHostColumn(cu, slot, ms.colIndex);
    if (!host) return false;
    const me = window._spaceOffsetForSlot(slot);
    const tops = _cuHostShelfTops(host, me);
    if (!tops.length) return false;
    const si = (ms.shelfIndex != null && tops[ms.shelfIndex] != null && Math.abs(tops[ms.shelfIndex] - ms.y) < 0.05)
        ? ms.shelfIndex : _cuNearestIndex(tops, ms.y);
    const top = tops[si];
    const span = _cuColumnSpan(host.wing, host.colIndex);
    const depth = Math.max(30, Math.min(120, Math.round(span.span * 10) / 10));
    const newX = Math.round(host.off.x + span.center);
    const changed = Math.abs((cu.height || 0) - top) > 0.05 || Math.abs((cu.depth || 0) - depth) > 0.05 || me.x !== newX;
    cu.height = top;
    cu.depth = depth;
    cu.mergeShelf = { y: top, colIndex: host.colIndex, shelfIndex: si };
    if (me.x !== newX) _cuSetSlotX(slot, newX);
    return changed;
}

/** Column follows the desk: the merged shelf moves to the desk height / the column takes the desk depth. */
function _cuPushDeskToHost(cu, slot, dim) {
    const ms = cu && cu.mergeShelf;
    if (!ms) return;
    const host = _cuFindHostColumn(cu, slot, ms.colIndex);
    if (!host) return;
    const w = host.wing;
    const cols = w.columns;
    const col = host.col;
    if (dim === 'height' && col.shelvesY && col.shelvesY.length) {
        const me = window._spaceOffsetForSlot(slot);
        const si = (ms.shelfIndex != null && col.shelvesY[ms.shelfIndex] != null) ? ms.shelfIndex : 0;
        const dy = (host.off.y || 0) - (me.y || 0);
        col.shelvesY[si] = Math.max(5, cu.height - _cuShelfT(w) / 2 - dy);
        ms.y = cu.height;
    } else if (dim === 'depth' && cols.length > 1) {
        const minW = (typeof MIN_COL_WIDTH !== 'undefined') ? MIN_COL_WIDTH : 20;
        const t = w.thickness || 1.7;
        const ci = host.colIndex;
        const nb = cols[ci === cols.length - 1 ? ci - 1 : ci + 1];
        const delta = Math.round(cu.depth - 2 * t) - Math.round(col.width);
        let newW = Math.round(col.width + delta);
        let nbW = Math.round(nb.width - delta);
        if (newW < minW) { nbW -= (minW - newW); newW = minW; }
        if (nbW < minW) { newW -= (minW - nbW); nbW = minW; }
        if (newW >= minW && nbW >= minW) { col.width = newW; nb.width = nbW; }
    }
    _cuAlignDeskToHost(cu, slot);
}

/** Corner desk ⇄ existing shelf: desk and column share height (shelf top) and width (column span). */
window.toggleCornerDeskShelfMerge = function() {
    const cw = _getCUWing();
    if (!_isCornerUnitPreset() || !cw || !cw.corner || cw.corner.type !== 'desk') return;
    const cu = cw.corner;
    const info = window._getSpacePairInfo && window._getSpacePairInfo();
    const toast = (msg, ms) => { if (typeof _showToast === 'function') _showToast(msg, ms || 3000); };
    if (cu.mergeShelf) {
        delete cu.mergeShelf;
    } else {
        const host = info ? _cuFindHostColumn(cu, info.activeSlot) : null;
        if (!host) { toast('השולחן צריך לעמוד צמוד לחזית של ארון במרחב כדי להתמזג עם מדף'); return; }
        const tops = _cuHostShelfTops(host, window._spaceOffsetForSlot(info.activeSlot));
        const inRange = tops.filter(function(y) { return y >= 40 && y <= 130; });
        if (!inRange.length) { toast('לא נמצא מדף בגובה שולחן (40-130 ס"מ) בעמודה שמאחורי השולחן'); return; }
        const top = inRange[_cuNearestIndex(inRange, cu.height || 75)];
        cu.mergeShelf = { y: top, colIndex: host.colIndex, shelfIndex: tops.indexOf(top) };
        _cuAlignDeskToHost(cu, info.activeSlot);
        toast('השולחן הותאם לעמודה — גובה ' + cu.height + ' ס"מ, רוחב ' + cu.depth + ' ס"מ', 2800);
    }
    _cuSyncWingDims(cw);
    window._updateExtrasSections();
    if (typeof window._syncSpaceOffsetUI === 'function') window._syncSpaceOffsetUI();
    if (typeof buildCabinet === 'function') buildCabinet();
    if (typeof updateCameraView === 'function') updateCameraView();
    if (typeof calculatePrice === 'function') calculatePrice();
    if (typeof saveHistoryState === 'function') saveHistoryState();
};

/**
 * Before every build: merged corner desks in the space follow their host column
 * (live state when the desk is being edited, its saved snapshot otherwise).
 */
function _cuSyncMergedDesks() {
    if (typeof window._getSpacePairInfo !== 'function') return;
    const info = window._getSpacePairInfo();
    if (!info) return;
    info.members.forEach(function(m) {
        const live = m.slot === info.activeSlot;
        if (live && !_isCornerUnitPreset()) return;
        const item = state.orderCart[info.slotIndices[m.slot]];
        const raw = live ? null : (item && item.rawState);
        if (!live && (!raw || raw.presetId !== 'corner-unit')) return;
        const wing = live ? _getCUWing() : (raw.wings && raw.wings.center);
        const cu = wing && wing.corner;
        if (!cu || !cu.mergeShelf || cu.type !== 'desk') return;
        if (!_cuAlignDeskToHost(cu, m.slot)) return;
        if (live) {
            _cuSyncWingDims(wing);
            if (typeof window._syncSpaceOffsetUI === 'function') window._syncSpaceOffsetUI();
        } else {
            wing.width = cu.width; wing.depth = cu.depth; wing.globalHeight = cu.height;
            if (raw.width != null) raw.width = cu.width;
            if (raw.depth != null) raw.depth = cu.depth;
        }
    });
}

// engine-core.js (buildCabinet) loads after this file
document.addEventListener('DOMContentLoaded', function() {
    const _origBuild = window.buildCabinet;
    if (typeof _origBuild !== 'function') return;
    let busy = false;
    window.buildCabinet = function() {
        if (!busy) {
            busy = true;
            try { _cuSyncMergedDesks(); } catch (e) { console.warn('corner desk merge sync', e); }
            busy = false;
        }
        return _origBuild.apply(this, arguments);
    };
});

/** Called by _applyPresetCore when converting a corner unit into another cabinet type. */
window._leaveCornerUnitPreset = function() {
    const cw = _getCUWing();
    if (!cw) return;
    cw.corner = { side: 'none', width: 60, height: 90, depth: 54, type: 'shelves', shelves: 3, drawerCount: 4 };
    if (!cw.columns || !cw.columns.length) {
        cw.width = 160; cw.depth = 54; cw.globalHeight = 240;
        cw.hasDoors = true;
        const t = cw.thickness || 1.7;
        const colW = (cw.width - t * 3) / 2;
        cw.columns = [0, 1].map(function() {
            const col = {
                type: 'normal', width: colW, height: cw.globalHeight,
                shelves: 0, splitY: null, shelvesY: [], compartments: [], doors: [], floorOffset: 0
            };
            _distributeShelves(col, cw);
            return col;
        });
    }
};

/** Add-ons tab: space add buttons + legacy embedded add-ons (edit / remove only). */
window._updateExtrasSections = function() {
    const pid = state.presetId || 'linear';
    const cw = _getCUWing();
    const isCU = pid === 'corner-unit';
    const isWD = pid === 'writing-desk';
    const isSliding = pid === 'sliding';
    const hasWings = pid === 'corner-right' || pid === 'corner-left' || pid === 'walkin';
    const w = (typeof getWing === 'function' ? getWing() : null) || cw;

    const hasLegacySide = !!(w && ((w.desk && w.desk.side && w.desk.side !== 'none') ||
        (w.sideCabinet && w.sideCabinet.side && w.sideCabinet.side !== 'none')));
    const hasLegacyCorner = !!(w && w.corner && w.corner.side && w.corner.side !== 'none' && !w.corner.standalone);

    const showSide = !isSliding && !isWD && !isCU && hasLegacySide;
    const showCorner = isCU || (!isSliding && !hasWings && !isWD && hasLegacyCorner);

    const suSection = document.getElementById('side-unit-section');
    if (suSection) suSection.style.display = showSide ? '' : 'none';
    const cuSection = document.getElementById('corner-unit-section');
    if (cuSection) cuSection.style.display = showCorner ? '' : 'none';

    // Legacy side unit: only the active type + "remove"
    const curSide = (w && w.desk && w.desk.side !== 'none') ? 'desk'
        : ((w && w.sideCabinet && w.sideCabinet.side !== 'none') ? 'side_cabinet' : 'none');
    document.querySelectorAll('.side-unit-btn').forEach(function(b) {
        const tp = b.dataset.type;
        b.style.display = (tp === 'none' || tp === curSide) ? '' : 'none';
    });
    document.querySelectorAll('.side-unit-btn[data-type="none"] span').forEach(function(s) { s.textContent = 'הסר'; });
    const mSideBlock = document.getElementById('mobile-side-unit-block');
    if (mSideBlock) mSideBlock.style.display = showSide ? '' : 'none';

    // Corner section: standalone hides side picker + dims (header dims drive the unit)
    const sideBtns = document.getElementById('corner-side-btns');
    const dimsGroup = document.getElementById('corner-dims-group');
    const cuTitle = document.getElementById('corner-unit-title');
    if (isCU) {
        if (sideBtns) sideBtns.style.display = 'none';
        if (dimsGroup) dimsGroup.style.display = 'none';
        const cc = document.getElementById('corner-controls');
        if (cc) cc.style.display = 'block';
        if (cuTitle) cuTitle.textContent = (cw && cw.corner && cw.corner.type === 'desk') ? 'הגדרות שולחן פינתי' : 'הגדרות שידה פינתית';
    }
    const mergeRow = document.getElementById('corner-desk-merge-row');
    if (mergeRow) {
        const isDesk = isCU && cw && cw.corner && cw.corner.type === 'desk';
        mergeRow.style.display = isDesk ? '' : 'none';
        const merged = !!(isDesk && cw.corner.mergeShelf);
        const btn = document.getElementById('corner-desk-merge-btn');
        if (btn) {
            btn.classList.toggle('active', merged);
            btn.innerHTML = merged
                ? '<i class="fa-solid fa-link-slash"></i> בטל מיזוג עם המדף (' + cw.corner.mergeShelf.y + ' ס"מ)'
                : '<i class="fa-solid fa-link"></i> מזג עם מדף בארון';
        }
    }
    if (!isCU) {
        if (sideBtns) sideBtns.style.display = 'flex';
        if (dimsGroup) dimsGroup.style.display = '';
        if (cuTitle) cuTitle.textContent = 'יחידה פינתית';
        // Legacy corner: only the active side + "remove"
        const curCorner = (w && w.corner && w.corner.side) || 'none';
        document.querySelectorAll('.corner-side-btn').forEach(function(b) {
            const sd = b.dataset.side;
            b.style.display = (sd === 'none' || sd === curCorner) ? '' : 'none';
        });
        document.querySelectorAll('.corner-side-btn[data-side="none"] span').forEach(function(s) { s.textContent = 'הסר'; });
    }

    // Space add buttons
    const canUse = typeof window._spacePairCanUse === 'function' && window._spacePairCanUse();
    const info = typeof window._getSpacePairInfo === 'function' ? window._getSpacePairInfo() : null;
    const planLocked = !!(info && info.planLimitReached);
    const canAdd = canUse && (!info || info.canAddMore || planLocked);
    ['space-units-section', 'mobile-space-units-block'].forEach(function(id) {
        const el = document.getElementById(id);
        if (el) el.style.display = canAdd ? '' : 'none';
    });
    document.querySelectorAll('.space-unit-add-btn').forEach(function(b) {
        b.classList.toggle('plan-locked', planLocked);
    });

    // Plinth / board material rows are meaningless for a corner unit
    if (isCU) {
        const plinthGrid = document.getElementById('plinth-placement-grid');
        if (plinthGrid) plinthGrid.style.display = 'none';
        const boardMatRow = document.getElementById('board-mat-row');
        if (boardMatRow) boardMatRow.style.display = 'none';
        const unitsSection = document.getElementById('units-content-section');
        if (unitsSection) unitsSection.style.display = 'none';
        const plinthCard = document.querySelector('#header-dims-row .header-dim-card:nth-child(3)');
        if (plinthCard) plinthCard.style.display = 'none';
        const ph = document.getElementById('dim-pill-height');
        const sh = document.getElementById('inp-height');
        if (ph) ph.max = 280;
        if (sh) sh.max = 280;
    }
};

(function() {
    const _origApplyPreset = window.applyPreset;
    window.applyPreset = function(presetId) {
        if (typeof _origApplyPreset === 'function') _origApplyPreset(presetId);
        window._updateExtrasSections();
    };
})();

(function() {
    const _origRestore = window._restorePresetUI;
    window._restorePresetUI = function() {
        if (typeof _origRestore === 'function') _origRestore();
        window._updateExtrasSections();
    };
})();

(function() {
    const _origSync = window.syncSidebarToWing;
    window.syncSidebarToWing = function() {
        if (typeof _origSync === 'function') _origSync();
        window._updateExtrasSections();
    };
})();

(function() {
    ['updateSideUnitType', 'updateCorner'].forEach(function(fn) {
        const orig = window[fn];
        if (typeof orig !== 'function') return;
        window[fn] = function(field) {
            // A standalone corner unit always stays attached to its own frame
            if (fn === 'updateCorner' && _isCornerUnitPreset() && field === 'side') return;
            const r = orig.apply(this, arguments);
            if (fn === 'updateCorner' && _isCornerUnitPreset()) {
                const cw = _getCUWing();
                if (cw && cw.corner) {
                    // Switching type resets the height to that type's default
                    if (field === 'type') {
                        cw.corner.height = CU_DEFAULTS[cw.corner.type === 'desk' ? 'desk' : 'drawers'].height;
                        delete cw.corner.mergeShelf;
                    }
                    _cuSyncWingDims(cw);
                    if (field === 'type') {
                        if (typeof buildCabinet === 'function') buildCabinet();
                        if (typeof updateCameraView === 'function') updateCameraView();
                    }
                }
            }
            window._updateExtrasSections();
            return r;
        };
    });
    window.updateCornerSide = function(side) { window.updateCorner('side', side); };
    window.updateCornerType = function(type) { window.updateCorner('type', type); };
})();

(function() {
    const _origUpdateDim = window.updateDim;
    window.updateDim = function(dim, delta, absoluteValue) {
        if (!_isCornerUnitPreset() || (dim !== 'width' && dim !== 'height' && dim !== 'depth')) {
            if (typeof _origUpdateDim === 'function') _origUpdateDim(dim, delta, absoluteValue);
            return;
        }
        const cw = _getCUWing();
        if (!cw || !cw.corner) return;
        const cu = cw.corner;
        const key = dim;
        const limits = { width: [30, 120], depth: [30, 120], height: [40, 280] }[key];
        const cur = cu[key] || CU_DEFAULTS.drawers[key];
        let val = (absoluteValue !== null && absoluteValue !== undefined) ? parseInt(absoluteValue, 10) : cur + (delta || 0);
        if (isNaN(val)) return;
        val = Math.max(limits[0], Math.min(limits[1], val));
        cu[key] = val;
        if (cu.mergeShelf && cu.type === 'desk' && (key === 'height' || key === 'depth')) {
            const info = window._getSpacePairInfo && window._getSpacePairInfo();
            if (info) {
                _cuPushDeskToHost(cu, info.activeSlot, key);
                if (typeof window._syncSpaceOffsetUI === 'function') window._syncSpaceOffsetUI();
            }
        }
        state.manualPrice = null;
        _cuSyncWingDims(cw);
        if (typeof buildCabinet === 'function') buildCabinet();
        if (typeof updateCameraView === 'function') updateCameraView();
        if (typeof calculatePrice === 'function') calculatePrice();
        if (typeof saveHistoryState === 'function') saveHistoryState();
    };
})();

document.addEventListener('DOMContentLoaded', function() {
    window._updateExtrasSections();
});
