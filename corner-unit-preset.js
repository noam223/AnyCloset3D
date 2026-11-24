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

/**
 * Host-local X edges of a merged desk: flush with the column's inner faces (the כוורת line),
 * covering only an outer side wall of the cabinet — never a divider shared with the next column.
 */
function _cuDeskEdges(host) {
    const w = host.wing;
    const t = w.thickness || 1.7;
    const span = _cuColumnSpan(w, host.colIndex);
    const half = (host.col.width || 0) / 2;
    const last = w.columns.length - 1;
    return {
        l: span.center - half - (host.colIndex === 0 ? t : 0),
        r: span.center + half + (host.colIndex === last ? t : 0)
    };
}

/**
 * Mergeable surfaces of the host column, in cm from the corner unit's floor:
 * shelf tops ({kind:'shelf', idx: shelvesY index}) and the top of each כוורת's own
 * bottom board ({kind:'cubby', idx: row}).
 */
function _cuHostSurfaces(host, deskOff) {
    const w = host.wing;
    const col = host.col;
    const t = w.thickness || 1.7;
    const shelfT = _cuShelfT(w);
    const dy = (host.off.y || 0) - (deskOff.y || 0);
    const r1 = function(v) { return Math.round(v * 10) / 10; };
    const out = [];
    ((col && col.shelvesY) || []).forEach(function(y, i) {
        out.push({ kind: 'shelf', idx: i, y: r1(y + shelfT / 2 + dy) });
    });
    const comps = (col && col.compartments) || [];
    const wd = {
        plinthHeight: w.plinthHeight != null ? w.plinthHeight : state.plinthHeight,
        thickness: t
    };
    const wholeOpen = function(c) { return !!c && (c.type === 'open_cell' || c.type === 'side_open_cell'); };
    comps.forEach(function(comp, r) {
        if (typeof _compHasOpenCell !== 'function' || !_compHasOpenCell(comp)) return;
        // Stacked whole-row כוורות form one unit: only its lowest row has a bottom board
        if (wholeOpen(comp) && r > 0 && comps[r - 1] && comps[r - 1].type === comp.type) return;
        const b = window._compartmentBounds(col, r, wd);
        out.push({ kind: 'cubby', idx: r, y: r1(b.bottomY + t + dy) });
    });
    return out;
}

function _cuNearestIndex(arr, v) {
    let bi = 0;
    for (let i = 1; i < arr.length; i++) if (Math.abs(arr[i] - v) < Math.abs(arr[bi] - v)) bi = i;
    return bi;
}

/** Desk-height surface to merge with: a כוורת bottom first, else the nearest shelf. */
function _cuPickSurface(surfaces, nearY) {
    const inRange = surfaces.filter(function(s) { return s.y >= 40 && s.y <= 130; });
    if (!inRange.length) return null;
    const cubbies = inRange.filter(function(s) { return s.kind === 'cubby'; });
    const pool = cubbies.length ? cubbies : inRange;
    return pool[_cuNearestIndex(pool.map(function(s) { return s.y; }), nearY)];
}

/** The surface a merged desk is tied to (same kind + index, else nearest of the same kind / any). */
function _cuCurrentSurface(surfaces, ms) {
    if (!surfaces.length) return null;
    const kind = ms.kind || 'shelf';
    const exact = surfaces.find(function(s) { return s.kind === kind && s.idx === ms.idx && Math.abs(s.y - ms.y) < 0.05; });
    if (exact) return exact;
    const same = surfaces.filter(function(s) { return s.kind === kind; });
    const pool = same.length ? same : surfaces;
    return pool[_cuNearestIndex(pool.map(function(s) { return s.y; }), ms.y)];
}

/**
 * A corner unit sitting in a host's inner corner keeps its back against the host front and its
 * outer side flush with the host side wall, so resizing grows it outward only.
 */
function _cuKeepAttachedToHost(cu, slot, host, key, oldVal) {
    const info = window._getSpacePairInfo();
    const item = info && state.orderCart[info.slotIndices[slot]];
    if (!item) return;
    const off = window._getSpaceOffset(item);
    if (off.rot !== 90 && off.rot !== 270) return;
    const fp = window._spaceCabinetFootprint(host.slot);
    const o = Object.assign({}, off);
    o.z = Math.round((host.off.z || 0) + fp.d / 2 + (cu.width || 60) / 2);
    if (key === 'depth' && !cu.mergeShelf) {
        const sgn = off.rot === 270 ? -1 : 1;
        const cornerX = function(d) { return host.off.x + sgn * (fp.w / 2 - d / 2); };
        // Only when it actually sat in the corner (not moved elsewhere along the front)
        if (Math.abs(off.x - cornerX(oldVal)) <= 1.5) o.x = Math.round(cornerX(cu.depth || 54));
    }
    item.spaceOffset = o;
    if (!item.rawState) item.rawState = {};
    item.rawState.spaceOffset = o;
    if (typeof window._syncSpaceOffsetUI === 'function') window._syncSpaceOffsetUI();
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
 * Desk follows the merged surface/column: top flush with the shelf or כוורת bottom,
 * depth = column (+ outer side wall), edges per _cuDeskEdges. Returns true if anything changed.
 */
function _cuAlignDeskToHost(cu, slot) {
    const ms = cu && cu.mergeShelf;
    if (!ms) return false;
    if (ms.idx == null && ms.shelfIndex != null) { ms.kind = 'shelf'; ms.idx = ms.shelfIndex; }
    const host = _cuFindHostColumn(cu, slot, ms.colIndex);
    if (!host) return false;
    const me = window._spaceOffsetForSlot(slot);
    const surf = _cuCurrentSurface(_cuHostSurfaces(host, me), ms);
    if (!surf) return false;
    const span = _cuColumnSpan(host.wing, host.colIndex);
    const edges = _cuDeskEdges(host);
    const depth = Math.max(30, Math.min(120, Math.round((edges.r - edges.l) * 10) / 10));
    const exactX = host.off.x + (edges.l + edges.r) / 2;
    const newX = Math.round(exactX);
    const boardT = Math.round((surf.kind === 'cubby' ? (host.wing.thickness || 1.7) : _cuShelfT(host.wing)) * 100) / 100;
    const changed = Math.abs((cu.height || 0) - surf.y) > 0.05 || Math.abs((cu.depth || 0) - depth) > 0.05 ||
        me.x !== newX || ms.boardT !== boardT;
    // Tongue of the desk board reaching into the column (replaces the host board there)
    const r1 = function(v) { return Math.round(v * 100) / 100; };
    const tongue = {
        w: r1(host.col.width || 0),
        d: r1(Math.max(0, (host.wing.depth || 54) - 2)),
        cx: r1(host.off.x + span.center - newX),
        // Space offsets are whole cm; the top is shifted by the remainder so its edges land exactly
        sx: r1(exactX - newX)
    };
    const prevT = ms.tongue || {};
    const tongueChanged = prevT.w !== tongue.w || prevT.d !== tongue.d || prevT.cx !== tongue.cx || prevT.sx !== tongue.sx;
    cu.height = surf.y;
    cu.depth = depth;
    cu.mergeShelf = { y: surf.y, colIndex: host.colIndex, kind: surf.kind, idx: surf.idx, boardT: boardT, hostSlot: host.slot, tongue: tongue };
    if (tongueChanged && !changed) {
        if (me.x !== newX) _cuSetSlotX(slot, newX);
        return true;
    }
    if (me.x !== newX) _cuSetSlotX(slot, newX);
    return changed;
}

/**
 * Column follows the desk: the merged shelf (or the shelf the כוורת stands on) moves to
 * the desk height / the column takes the desk depth.
 */
function _cuPushDeskToHost(cu, slot, dim) {
    const ms = cu && cu.mergeShelf;
    if (!ms) return;
    const host = _cuFindHostColumn(cu, slot, ms.colIndex);
    if (!host) return;
    const w = host.wing;
    const cols = w.columns;
    const col = host.col;
    const t = w.thickness || 1.7;
    if (dim === 'height' && col.shelvesY && col.shelvesY.length) {
        const me = window._spaceOffsetForSlot(slot);
        const dy = (host.off.y || 0) - (me.y || 0);
        const shelfT = _cuShelfT(w);
        let si = -1;
        let boardBelowTop = cu.height;
        if (ms.kind === 'cubby') {
            // The כוורת's bottom board rests on the divider below its row
            const surf = _cuCurrentSurface(_cuHostSurfaces(host, me), ms);
            if (surf) {
                const divY = surf.y - t - dy - shelfT / 2;
                si = col.shelvesY.findIndex(function(y) { return Math.abs(y - divY) < 0.1; });
            }
            boardBelowTop = cu.height - t;
        } else if (ms.idx != null && col.shelvesY[ms.idx] != null) {
            si = ms.idx;
        }
        if (si >= 0) {
            col.shelvesY[si] = Math.max(5, boardBelowTop - shelfT / 2 - dy);
            ms.y = cu.height;
        }
    } else if (dim === 'depth' && cols.length > 1) {
        const minW = (typeof MIN_COL_WIDTH !== 'undefined') ? MIN_COL_WIDTH : 20;
        const ci = host.colIndex;
        const nb = cols[ci === cols.length - 1 ? ci - 1 : ci + 1];
        const r1 = function(v) { return Math.round(v * 10) / 10; };
        const edges = _cuDeskEdges(host);
        const walls = (edges.r - edges.l) - (col.width || 0);
        let newW = r1(cu.depth - walls);
        let nbW = Math.round((col.width + nb.width - newW) * 100) / 100;
        if (newW < minW) { nbW -= (minW - newW); newW = minW; }
        if (nbW < minW) { newW -= (minW - nbW); nbW = minW; }
        if (newW >= minW && nbW >= minW) { col.width = newW; nb.width = nbW; }
    }
    _cuCommitHostColumns(host.slot, w);
    _cuAlignDeskToHost(cu, slot);
}

/** A saved host also keeps a root `columns` copy that companion builds read over wings.center. */
function _cuCommitHostColumns(hostSlot, w) {
    const info = window._getSpacePairInfo();
    const idx = info && info.slotIndices[hostSlot];
    if (idx == null || idx === state.editingCartIndex) return;
    const item = state.orderCart[idx];
    const raw = item && item.rawState;
    if (!raw || !raw.wings || raw.wings.center !== w) return;
    if ((raw.activeWing || 'center') === 'center') raw.columns = JSON.parse(JSON.stringify(w.columns));
    if (typeof window._invalidateSpacePairPreviewImages === 'function' && typeof window._spacePairIdOf === 'function') {
        window._invalidateSpacePairPreviewImages(window._spacePairIdOf(item));
    }
}

/**
 * Surfaces of a column on the SAME cabinet (embedded desk) — same shape as space-host surfaces.
 */
function _cuLocalSurfaces(wing, col) {
    return _cuHostSurfaces({ wing: wing, col: col, off: { x: 0, y: 0, z: 0 } }, { y: 0 });
}

/** Insert a shelf whose top lands at targetTopY (cm), then sync compartments. */
function _cuEnsureShelfAt(wing, col, targetTopY) {
    const shelfT = _cuShelfT(wing);
    const y = Math.round((targetTopY - shelfT / 2) * 10) / 10;
    if (!Array.isArray(col.shelvesY)) col.shelvesY = [];
    let idx = col.shelvesY.findIndex(function(sy) { return Math.abs(sy - y) < 1.2; });
    if (idx < 0) {
        col.shelvesY.push(y);
        col.shelvesY.sort(function(a, b) { return a - b; });
        idx = col.shelvesY.findIndex(function(sy) { return Math.abs(sy - y) < 0.05; });
        if (idx < 0) idx = col.shelvesY.length - 1;
        col.shelves = col.shelvesY.length;
        const t = wing.thickness || 1.7;
        const baseY = (typeof _columnBaseY === 'function') ? _columnBaseY(col, wing) : (col.floorOffset || 0);
        if (typeof _syncCompartmentCount === 'function') _syncCompartmentCount(col, baseY, t);
        if (typeof window._syncStretcherShelfIdxs === 'function') window._syncStretcherShelfIdxs(col);
    }
    return {
        kind: 'shelf',
        idx: idx,
        y: Math.round((col.shelvesY[idx] + shelfT / 2) * 10) / 10
    };
}

/**
 * Align an embedded corner desk to the end-column shelf/כוורת (or create a shelf),
 * and build mergeShelf + tongue so the top reads as one continuous board.
 */
function _cuAlignEmbeddedDesk(cu, wing) {
    if (!cu || !wing || cu.standalone || cu.type !== 'desk') return false;
    const cols = wing.columns || [];
    if (!cols.length) return false;
    const side = cu.side === 'left' ? 'left' : 'right';
    const colIndex = (cu.mergeShelf && cu.mergeShelf.colIndex != null)
        ? cu.mergeShelf.colIndex
        : (side === 'left' ? 0 : cols.length - 1);
    if (colIndex < 0 || colIndex >= cols.length) return false;
    const col = cols[colIndex];
    const host = { wing: wing, col: col, colIndex: colIndex, off: { x: 0, y: 0, z: 0 } };

    let surf = null;
    if (cu.mergeShelf) {
        surf = _cuCurrentSurface(_cuLocalSurfaces(wing, col), cu.mergeShelf);
    }
    if (!surf) {
        surf = _cuPickSurface(_cuLocalSurfaces(wing, col), cu.height || CU_DEFAULTS.desk.height);
    }
    if (!surf) {
        surf = _cuEnsureShelfAt(wing, col, cu.height || CU_DEFAULTS.desk.height);
    }
    if (!surf) return false;

    const edges = _cuDeskEdges(host);
    const depth = Math.max(30, Math.min(120, Math.round((edges.r - edges.l) * 10) / 10));
    const boardT = Math.round((surf.kind === 'cubby' ? (wing.thickness || 1.7) : _cuShelfT(wing)) * 100) / 100;
    const span = _cuColumnSpan(wing, colIndex);
    const mainW = wing.width || state.width || 160;
    const sign = side === 'right' ? 1 : -1;
    const cuCenterX = sign * (mainW / 2 - depth / 2);
    const r1 = function(v) { return Math.round(v * 100) / 100; };
    const tongue = {
        w: r1(col.width || 0),
        d: r1(Math.max(0, (wing.depth || state.depth || 54) - 2)),
        cx: r1(span.center - cuCenterX),
        sx: 0
    };
    const changed = Math.abs((cu.height || 0) - surf.y) > 0.05 || Math.abs((cu.depth || 0) - depth) > 0.05;
    cu.height = surf.y;
    cu.depth = depth;
    cu.mergeShelf = {
        y: surf.y,
        colIndex: colIndex,
        kind: surf.kind,
        idx: surf.idx,
        boardT: boardT,
        hostSlot: 'self',
        embedded: true,
        tongue: tongue
    };
    return changed;
}

/**
 * Add a corner desk as part of the CURRENT cabinet (not a separate space unit),
 * already merged to the chosen corner's end column. Creates a shelf if none exists.
 */
window.addEmbeddedCornerDesk = function(opts) {
    opts = opts || {};
    if (!opts.cornerSide) {
        window._askCornerUnitSide('embeddedCornerDesk');
        return;
    }
    const side = opts.cornerSide === 'left' ? 'left' : 'right';
    if (state.presetId === 'corner-unit' || state.presetId === 'writing-desk' ||
        state.presetId === 'corner-left' || state.presetId === 'corner-right' ||
        state.presetId === 'walkin' || state.presetId === 'sliding') {
        if (typeof _showToast === 'function') {
            _showToast('שולחן פינתי משובץ זמין בארון רגיל / מטבח', 3200);
        }
        return;
    }
    const cw = _getCUWing();
    if (!cw) return;
    if (!cw.columns || !cw.columns.length) {
        if (typeof distributeColumns === 'function') {
            distributeColumns(Math.max(1, state.numColumns || 2));
        } else {
            const t = cw.thickness || state.thickness || 1.7;
            const colW = ((cw.width || state.width || 160) - t * 3) / 2;
            cw.columns = [0, 1].map(function() {
                const col = {
                    type: 'normal', width: colW, height: cw.globalHeight || state.globalHeight || 240,
                    shelves: 3, splitY: null, shelvesY: [], compartments: [], doors: [], floorOffset: 0
                };
                if (typeof _distributeShelves === 'function') _distributeShelves(col, cw);
                return col;
            });
        }
    }
    const d = CU_DEFAULTS.desk;
    cw.corner = {
        side: side,
        type: 'desk',
        width: d.width,
        height: d.height,
        depth: cw.depth || state.depth || d.depth,
        shelves: 3,
        drawerCount: 4,
        deskDrawerCount: 0,
        deskDrawerHeight: 13,
        deskFloating: false
    };
    delete cw.corner.standalone;
    _cuAlignEmbeddedDesk(cw.corner, cw);

    if (typeof window.updateCorner === 'function') {
        // Sync side/type button UI without wiping merge
        document.querySelectorAll('.corner-side-btn').forEach(function(b) {
            const isActive = b.dataset.side === side;
            b.classList.toggle('active', isActive);
            b.style.background = isActive ? 'var(--accent)' : 'var(--bg-light)';
            b.style.color = isActive ? 'white' : 'var(--text-dark)';
            b.style.borderColor = isActive ? 'var(--accent)' : 'var(--border)';
        });
        document.querySelectorAll('.corner-type-btn').forEach(function(b) {
            const isActive = b.dataset.type === 'desk';
            b.classList.toggle('active', isActive);
            b.style.background = isActive ? 'var(--accent)' : 'var(--bg-light)';
            b.style.color = isActive ? 'white' : 'var(--text-dark)';
            b.style.borderColor = isActive ? 'var(--accent)' : 'var(--border)';
        });
        const cuControls = document.getElementById('corner-controls');
        if (cuControls) cuControls.style.display = 'block';
        const cuDeskDrawerSection = document.getElementById('corner-desk-drawer-section');
        if (cuDeskDrawerSection) cuDeskDrawerSection.style.display = 'block';
        const cuDrawerSection = document.getElementById('corner-drawer-section');
        if (cuDrawerSection) cuDrawerSection.style.display = 'none';
    }

    window._updateExtrasSections();
    window._isDirty = true;
    if (typeof buildCabinet === 'function') buildCabinet();
    if (typeof updateCameraView === 'function') updateCameraView();
    if (typeof calculatePrice === 'function') calculatePrice();
    if (typeof saveHistoryState === 'function') saveHistoryState();
    if (typeof window._commitCurrentCabinetToCart === 'function' && state.editingCartIndex >= 0) {
        window._commitCurrentCabinetToCart({ flash: false });
    }
    const ms = cw.corner.mergeShelf;
    const how = ms && ms.kind === 'cubby' ? 'תחתית הכוורת' : 'מדף';
    if (typeof _showToast === 'function') {
        _showToast('שולחן פינתי נוסף בפינה ' + (side === 'left' ? 'שמאל' : 'ימין') +
            ' וממוזג עם ' + how + ' (' + (cw.corner.height || 0) + ' ס"מ)', 3500);
    }
};

/** Corner desk ⇄ host column: shared height (כוורת bottom / shelf top) and width (column span). */
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
        const surf = _cuPickSurface(_cuHostSurfaces(host, window._spaceOffsetForSlot(info.activeSlot)), cu.height || 75);
        if (!surf) { toast('לא נמצא מדף או כוורת בגובה שולחן (40-130 ס"מ) בעמודה שמאחורי השולחן'); return; }
        cu.mergeShelf = { y: surf.y, colIndex: host.colIndex, kind: surf.kind, idx: surf.idx };
        _cuAlignDeskToHost(cu, info.activeSlot);
        toast('השולחן מוזג עם ' + (surf.kind === 'cubby' ? 'תחתית הכוורת' : 'המדף') +
            ' — גובה ' + cu.height + ' ס"מ, רוחב ' + cu.depth + ' ס"מ', 2800);
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
    const boards = {};
    window._cuMergeBoards = boards;
    const doorClamps = {};
    window._cuDeskDoorClamps = doorClamps;

    // Embedded corner desk on the live cabinet (part of the same carcass)
    const liveWing = _getCUWing();
    const liveCu = liveWing && liveWing.corner;
    if (liveCu && !liveCu.standalone && liveCu.type === 'desk' && liveCu.side && liveCu.side !== 'none') {
        _cuAlignEmbeddedDesk(liveCu, liveWing);
        const ms = liveCu.mergeShelf;
        if (ms) {
            (boards.self = boards.self || []).push({
                colIndex: ms.colIndex, kind: ms.kind, idx: ms.idx,
                mat: liveWing.materialDesk || liveWing.materialBody || state.materialDesk || state.materialBody || 'white_matte'
            });
            if ((liveCu.deskDrawerCount || 0) > 0) {
                const drawerBottom = liveCu.height - (ms.boardT || 1.7) - (liveCu.deskDrawerHeight || 13);
                (doorClamps.self = doorClamps.self || []).push({ colIndex: ms.colIndex, y: drawerBottom });
            }
        }
    }

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
        if (!cu || !cu.mergeShelf || cu.type !== 'desk' || cu.embedded || !cu.standalone) return;
        const changed = _cuAlignDeskToHost(cu, m.slot);
        const ms = cu.mergeShelf;
        if (ms.hostSlot != null && _cuFindHostColumn(cu, m.slot, ms.colIndex)) {
            (boards[ms.hostSlot] = boards[ms.hostSlot] || []).push({
                colIndex: ms.colIndex, kind: ms.kind, idx: ms.idx,
                mat: wing.materialBody || (live ? state.materialBody : raw.materialBody) || 'white_matte'
            });
            if ((cu.deskDrawerCount || 0) > 0) {
                const dy = (window._spaceOffsetForSlot(m.slot).y || 0) - (window._spaceOffsetForSlot(ms.hostSlot).y || 0);
                const drawerBottom = dy + cu.height - (ms.boardT || 1.7) - (cu.deskDrawerHeight || 13);
                (doorClamps[ms.hostSlot] = doorClamps[ms.hostSlot] || []).push({ colIndex: ms.colIndex, y: drawerBottom });
            }
        }
        if (!changed) return;
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
    // Show corner controls for standalone units, or whenever an embedded corner desk/drawers is active
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
        // Embedded desks stay auto-merged; toggle is for standalone space desks only
        const isDesk = isCU && cw && cw.corner && cw.corner.type === 'desk';
        mergeRow.style.display = isDesk ? '' : 'none';
        const merged = !!(isDesk && cw.corner.mergeShelf);
        const btn = document.getElementById('corner-desk-merge-btn');
        if (btn) {
            btn.classList.toggle('active', merged);
            btn.innerHTML = merged
                ? '<i class="fa-solid fa-link-slash"></i> בטל מיזוג עם ' + (cw.corner.mergeShelf.kind === 'cubby' ? 'הכוורת' : 'המדף') +
                    ' (' + cw.corner.mergeShelf.y + ' ס"מ)'
                : '<i class="fa-solid fa-link"></i> מזג עם כוורת / מדף בארון';
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
    const isKit = pid === 'kitchen';
    ['space-units-section', 'mobile-space-units-block'].forEach(function(id) {
        const el = document.getElementById(id);
        if (el) el.style.display = canAdd ? '' : 'none';
    });
    document.querySelectorAll('.space-unit-add-btn').forEach(function(b) {
        b.classList.toggle('plan-locked', planLocked);
    });
    document.querySelectorAll('.space-unit-wardrobe-only').forEach(function(b) {
        b.style.display = (canAdd && !isKit) ? '' : 'none';
    });
    document.querySelectorAll('.space-unit-kitchen-only').forEach(function(b) {
        b.style.display = (canAdd && isKit) ? '' : 'none';
    });
    document.querySelectorAll('.space-unit-any').forEach(function(b) {
        b.style.display = canAdd ? '' : 'none';
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

    // Floating shelf remaps header dim labels (אורך / רוחב / עובי)
    if (typeof window._updateFloatingShelfSectionVisibility === 'function') {
        window._updateFloatingShelfSectionVisibility();
    }
    // Space appliance hides cabinet chrome — must run after floating-shelf restore
    if (typeof window._updateSpaceApplianceSectionVisibility === 'function') {
        window._updateSpaceApplianceSectionVisibility();
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
        window[fn] = function(field, value) {
            // A standalone corner unit always stays attached to its own frame
            if (fn === 'updateCorner' && _isCornerUnitPreset() && field === 'side') return;
            const r = orig.apply(this, arguments);
            if (fn === 'updateCorner') {
                const cw = _getCUWing();
                if (cw && cw.corner) {
                    if (_isCornerUnitPreset()) {
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
                    } else if (!cw.corner.standalone) {
                        // Embedded desk: keep auto-merged to the chosen corner's end column
                        if (field === 'side' && (value === 'none' || cw.corner.side === 'none')) {
                            delete cw.corner.mergeShelf;
                        } else if (cw.corner.type === 'desk' && cw.corner.side && cw.corner.side !== 'none' &&
                            (field === 'side' || field === 'type' || field === 'height' || field === 'depth')) {
                            if (field === 'type' && value !== 'desk') {
                                delete cw.corner.mergeShelf;
                            } else {
                                if (field === 'side' || field === 'type') delete cw.corner.mergeShelf;
                                _cuAlignEmbeddedDesk(cw.corner, cw);
                            }
                        }
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
        const limits = { width: [30, 200], depth: [30, 120], height: [40, 280] }[key];
        const cur = cu[key] || CU_DEFAULTS.drawers[key];
        let val = (absoluteValue !== null && absoluteValue !== undefined) ? parseInt(absoluteValue, 10) : cur + (delta || 0);
        if (isNaN(val)) return;
        val = Math.max(limits[0], Math.min(limits[1], val));
        const info = window._getSpacePairInfo && window._getSpacePairInfo();
        const attachHost = (info && info.activeSlot > 0 && (key === 'width' || key === 'depth'))
            ? _cuFindHostColumn(cu, info.activeSlot, cu.mergeShelf && cu.mergeShelf.colIndex) : null;
        cu[key] = val;
        if (attachHost) _cuKeepAttachedToHost(cu, info.activeSlot, attachHost, key, cur);
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
