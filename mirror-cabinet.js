// ==========================================
// היפוך כיוון הארון (מראה) — משקף את התכנון עצמו מימין לשמאל
// ==========================================
// Columns are always built left→right (column 0 = leftmost), so reversing every column list and
// swapping every left/right value yields a true mirror while dimensions and labels stay readable.
(function() {
    'use strict';

    const _STR_SWAP = {
        door_left: 'door_right', door_right: 'door_left',
        hinge_left: 'hinge_right', hinge_right: 'hinge_left'
    };
    const _WING_SWAP = {
        left: 'right', right: 'left',
        upperUnit_left: 'upperUnit_right', upperUnit_right: 'upperUnit_left',
        sideCabinetLeft: 'sideCabinetRight', sideCabinetRight: 'sideCabinetLeft',
        full_corner_left: 'full_corner_right', full_corner_right: 'full_corner_left'
    };
    const _PRESET_SWAP = { 'corner-right': 'corner-left', 'corner-left': 'corner-right' };
    // Longest first so 'upperUnit_left' is not parsed as 'upperUnit' + '_left…'
    const _WING_IDS = [
        'upperUnit_center', 'upperUnit_left', 'upperUnit_right',
        'full_corner_left', 'full_corner_right',
        'sideCabinetLeft', 'sideCabinetRight',
        'center', 'left', 'right'
    ];

    function _swapLR(v) { return v === 'left' ? 'right' : v === 'right' ? 'left' : v; }
    function _swapWingId(id) { return _WING_SWAP[id] || id; }
    function _clone(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
    function _isOpenLike(comp) { return !!comp && (comp.type === 'open_cell' || comp.type === 'side_open_cell'); }

    /** 1 - p, snapped to a clean decimal only when that loses nothing (keeps a double flip exact). */
    function _flipRatio(p) {
        const q = 1 - p;
        const r = Math.round(q * 1e9) / 1e9;
        return Math.abs(r - q) < 1e-12 ? r : q;
    }

    function _negate(obj, key) {
        if (obj && typeof obj[key] === 'number' && obj[key] !== 0) obj[key] = -obj[key];
    }

    function _swapKeys(obj, a, b) {
        if (!obj) return;
        const hasA = Object.prototype.hasOwnProperty.call(obj, a);
        const hasB = Object.prototype.hasOwnProperty.call(obj, b);
        const va = obj[a], vb = obj[b];
        if (hasB) obj[a] = vb; else delete obj[a];
        if (hasA) obj[b] = va; else delete obj[b];
    }

    /** door_left ↔ door_right / hinge_left ↔ hinge_right anywhere inside plain cell data. */
    function _swapDoorStrings(o) {
        if (!o || typeof o !== 'object') return;
        const keys = Array.isArray(o) ? o.map((_, i) => i) : Object.keys(o);
        keys.forEach(k => {
            const v = o[k];
            if (typeof v === 'string') { if (_STR_SWAP[v]) o[k] = _STR_SWAP[v]; }
            else if (v && typeof v === 'object') _swapDoorStrings(v);
        });
    }

    function _mirrorCompartment(comp) {
        if (!comp || typeof comp !== 'object') return;
        _swapDoorStrings(comp);
        if (!comp.partition) return;
        if (Array.isArray(comp.partitions)) {
            comp.partitions = comp.partitions.map(_flipRatio).reverse();
        } else if (typeof comp.partitionX === 'number') {
            comp.partitionX = _flipRatio(comp.partitionX);
        }
        if (!Array.isArray(comp.subCells)) return;
        const k = comp.subCells.length;
        comp.subCells.reverse();
        if (Array.isArray(comp.zoneDoorGroups)) {
            comp.zoneDoorGroups.forEach(g => {
                if (!g || !Array.isArray(g.keys)) return;
                g.keys = g.keys.map(key => {
                    const parts = String(key).split(':');
                    const si = parseInt(parts[0], 10);
                    if (isNaN(si)) return key;
                    parts[0] = String(k - 1 - si);
                    return parts.join(':');
                });
            });
        }
    }

    function _defaultSideOpen(c, n) { return c < n / 2 ? 'left' : 'right'; }

    function _mirrorColumns(cols) {
        if (!Array.isArray(cols) || !cols.length) return;
        const n = cols.length;

        // Honeycomb "don't merge with the right neighbour" lives on the left column of each boundary
        const noMerge = [];
        cols.forEach((col, i) => {
            (col && col.compartments || []).forEach((comp, r) => {
                if (comp && comp.honeycombNoMergeRight) {
                    if (i < n - 1) (noMerge[i] = noMerge[i] || []).push(r);
                    delete comp.honeycombNoMergeRight;
                }
            });
        });

        cols.forEach((col, c) => {
            if (!col) return;
            // Side honeycomb: write the side it really opened to, then drop it when the default already matches
            const hasSideOpen = (col.sideOpenSide === 'left' || col.sideOpenSide === 'right') ||
                JSON.stringify(col.compartments || []).indexOf('side_open') >= 0;
            if (hasSideOpen) {
                const resolved = (col.sideOpenSide === 'left' || col.sideOpenSide === 'right')
                    ? col.sideOpenSide : _defaultSideOpen(c, n);
                const next = _swapLR(resolved);
                if (next === _defaultSideOpen(n - 1 - c, n)) delete col.sideOpenSide;
                else col.sideOpenSide = next;
            }
            (col.doors || []).forEach(d => {
                if (!d) return;
                d.type = _swapLR(d.type);
                if (d.touchLeaf) d.touchLeaf = _swapLR(d.touchLeaf);
                if (Array.isArray(d.mirrorOut)) d.mirrorOut = d.mirrorOut.map(_swapLR);
                if (Array.isArray(d.mirrorIn)) d.mirrorIn = d.mirrorIn.map(_swapLR);
            });
            (col.compartments || []).forEach(_mirrorCompartment);
        });

        cols.reverse();

        noMerge.forEach((rows, i) => {
            if (!rows) return;
            const target = cols[n - 2 - i];
            if (!target || !target.compartments) return;
            rows.forEach(r => {
                const comp = target.compartments[r];
                if (_isOpenLike(comp)) comp.honeycombNoMergeRight = true;
            });
        });
    }

    function _mirrorWing(w) {
        if (!w || typeof w !== 'object') return w;
        const n = Array.isArray(w.columns) ? w.columns.length : 0;
        _mirrorColumns(w.columns);

        if (w.desk) {
            w.desk.side = _swapLR(w.desk.side);
            if (typeof w.desk.mergeColIndex === 'number') w.desk.mergeColIndex = n - 1 - w.desk.mergeColIndex;
            if (Array.isArray(w.desk.mergeColIndices)) {
                w.desk.mergeColIndices = w.desk.mergeColIndices.map(i => n - 1 - i).reverse();
            }
        }
        if (w.corner) w.corner.side = _swapLR(w.corner.side);
        if (w.sideCabinet) {
            w.sideCabinet.side = _swapLR(w.sideCabinet.side);
            _swapKeys(w.sideCabinet, 'widthLeft', 'widthRight');
            _mirrorWing(w.sideCabinet);
        }
        if (w.fullCorner) _swapDoorStrings(w.fullCorner);
        _negate(w, 'vesselSinkOffsetX');
        _negate(w, '_upperOffsetX');
        if (w._parentWingId) w._parentWingId = _swapWingId(w._parentWingId);

        const sd = w.slidingDoor;
        if (sd && sd.enabled && (Array.isArray(sd.doorPanels) || Array.isArray(sd.doorColors))) {
            const nd = Math.max(sd.numDoors || 0, (sd.doorPanels || []).length, (sd.doorColors || []).length);
            ['doorPanels', 'doorColors'].forEach(key => {
                if (!Array.isArray(sd[key])) return;
                const arr = sd[key].slice();
                const fill = key === 'doorPanels' ? (sd.doorPanelType || 'solid') : null;
                while (arr.length < nd) arr.push(fill);
                arr.reverse();
                while (arr.length && arr[arr.length - 1] == null) arr.pop();
                sd[key] = arr;
            });
        }
        return w;
    }

    function _wingForId(wings, wingId) {
        if (!wings) return null;
        if (wingId === 'sideCabinetLeft' || wingId === 'sideCabinetRight') return wings.center ? wings.center.sideCabinet : null;
        if (wingId === 'full_corner_left') return wings.left;
        if (wingId === 'full_corner_right') return wings.right;
        return wings[wingId] || null;
    }

    // ---- Part colors (part-paint mode): `${wingId}_${suffix}` → mirrored id ----

    function _topPanelNewStart(cols, start) {
        const n = cols.length;
        if (!cols[start] || !cols[start].topPanel) return n - 1 - start;
        let a = start, b = start;
        while (a > 0 && cols[a - 1] && cols[a - 1].topPanel) a--;
        while (b < n - 1 && cols[b + 1] && cols[b + 1].topPanel) b++;
        const h = cols[a].height;
        const sameH = cols.slice(a, b + 1).every(c => Math.abs((c.height || 0) - (h || 0)) < 0.1);
        return (sameH && start === a) ? n - 1 - b : n - 1 - start;
    }

    function _openBlockEnd(cols, c, r) {
        const first = cols[c] && cols[c].compartments && cols[c].compartments[r];
        if (!_isOpenLike(first)) return c;
        let end = c;
        while (end < cols.length - 1) {
            const here = cols[end].compartments && cols[end].compartments[r];
            const next = cols[end + 1] && cols[end + 1].compartments && cols[end + 1].compartments[r];
            if (!here || here.honeycombNoMergeRight || !next || next.type !== first.type) break;
            end++;
        }
        return end;
    }

    function _subCount(cols, c, r) {
        const comp = cols[c] && cols[c].compartments && cols[c].compartments[r];
        return (comp && Array.isArray(comp.subCells)) ? comp.subCells.length : 0;
    }

    function _mirrorPartSuffix(suffix, wing) {
        let s = String(suffix);
        s = s.replace(/(^|_)(left|right)(?=_|$)/g, (m, p, w) => p + _swapLR(w));
        s = s.replace(/_(l|r)$/, (m, w) => '_' + (w === 'l' ? 'r' : 'l'));
        s = s.replace(/_(L|R)(?=_|$)/g, (m, w) => '_' + (w === 'L' ? 'R' : 'L'));

        const cols = (wing && Array.isArray(wing.columns)) ? wing.columns : [];
        const n = cols.length;
        if (!n) return s;
        let m;
        if ((m = /^divider_c(\d+)$/.exec(s))) return 'divider_c' + (n - 2 - Number(m[1]));
        if ((m = /^top_panel_(\d+)$/.exec(s))) return 'top_panel_' + _topPanelNewStart(cols, Number(m[1]));
        if ((m = /^opencell_c(\d+)_b(\d+)$/.exec(s))) {
            return 'opencell_c' + (n - 1 - _openBlockEnd(cols, Number(m[1]), Number(m[2]))) + '_b' + m[2];
        }

        const cr = /(^|_)c(\d+)_r(\d+)/.exec(s);
        if (cr) {
            const k = _subCount(cols, Number(cr[2]), Number(cr[3]));
            if (k > 0) {
                const head = s.slice(0, cr.index + cr[0].length);
                let tail = s.slice(cr.index + cr[0].length);
                tail = tail.replace(/^_s(\d+)/, (mm, si) => '_s' + (k - 1 - Number(si)));
                tail = tail.replace(/^_g(\d+)_/, (mm, si) => '_g' + (k - 1 - Number(si)) + '_');
                s = head + tail;
            }
        }
        return s.replace(/(^|_)c(\d+)(?=_|$)/, (mm, p, c) => p + 'c' + (n - 1 - Number(c)));
    }

    function _splitPartKey(localKey) {
        for (let i = 0; i < _WING_IDS.length; i++) {
            const id = _WING_IDS[i];
            if (localKey.indexOf(id + '_') === 0) return { wingId: id, suffix: localKey.slice(id.length + 1) };
        }
        return null;
    }

    /** Remap a part-color map. Keys may be local (`wing_suffix`) or scoped (`scope::wing_suffix`). */
    function _mirrorPartColorMap(map, oldWings) {
        const out = {};
        if (!map || typeof map !== 'object') return out;
        Object.keys(map).forEach(key => {
            const sep = key.indexOf('::');
            const scope = sep >= 0 ? key.slice(0, sep + 2) : '';
            const local = sep >= 0 ? key.slice(sep + 2) : key;
            const parts = _splitPartKey(local);
            if (!parts) { out[key] = map[key]; return; }
            const newWing = _swapWingId(parts.wingId);
            const newSuffix = _mirrorPartSuffix(parts.suffix, _wingForId(oldWings, parts.wingId));
            out[scope + newWing + '_' + newSuffix] = map[key];
        });
        return out;
    }

    // ---- Production drawing (blueprint) settings ----

    function _bpWingForView(wings, viewKey) {
        if (!wings) return null;
        if (viewKey === 'center' || viewKey === 'left' || viewKey === 'right') return wings[viewKey] || null;
        if (viewKey.indexOf('upper-') === 0) return wings['upperUnit_' + viewKey.slice(6)] || null;
        if (viewKey === 'side-cab-left' || viewKey === 'side-cab-right') return wings.center ? wings.center.sideCabinet : null;
        return null;
    }

    function _mirrorBpViewKey(viewKey) {
        return String(viewKey).replace(/left|right/g, w => _swapLR(w));
    }

    function _mirrorBpCellKey(cellKey, wing) {
        const cols = (wing && Array.isArray(wing.columns)) ? wing.columns : [];
        const n = cols.length;
        if (!n) return cellKey;
        const m = /^(colW:|partW:)?c(\d+)(?:r(\d+))?(.*)$/.exec(cellKey);
        if (!m) return cellKey;
        const prefix = m[1] || '';
        const c = Number(m[2]);
        let rest = m[4] || '';
        if (m[3] != null) {
            const k = _subCount(cols, c, Number(m[3]));
            if (k > 0) {
                if (prefix === 'partW:') rest = rest.replace(/^z(\d+)/, (mm, z) => 'z' + (k - 1 - Number(z)));
                else rest = rest.replace(/^p(\d+)/, (mm, p) => 'p' + (k - 1 - Number(p)));
            }
        }
        return prefix + 'c' + (n - 1 - c) + (m[3] != null ? 'r' + m[3] : '') + rest;
    }

    function _mirrorBpMap(map, oldWings, negateX) {
        const out = {};
        if (!map || typeof map !== 'object') return out;
        Object.keys(map).forEach(key => {
            const sep = key.indexOf('|');
            if (sep < 0) { out[key] = map[key]; return; }
            const viewKey = key.slice(0, sep);
            const cellKey = key.slice(sep + 1);
            const newKey = _mirrorBpViewKey(viewKey) + '|' + _mirrorBpCellKey(cellKey, _bpWingForView(oldWings, viewKey));
            let v = map[key];
            if (negateX && v && typeof v === 'object' && typeof v.x === 'number') {
                v = Object.assign({}, v, { x: v.x ? -v.x : 0 });
            }
            out[newKey] = v;
        });
        return out;
    }

    function _mirrorCutouts(list, oldWings) {
        if (!Array.isArray(list)) return list;
        return list.map(co => {
            if (!co) return co;
            const out = Object.assign({}, co);
            const viewKey = co.viewKey || 'center';
            out.viewKey = _mirrorBpViewKey(viewKey);
            const wing = (viewKey === 'center' || viewKey === 'left' || viewKey === 'right') ? oldWings && oldWings[viewKey] : null;
            if (wing && typeof wing.width === 'number' && typeof co.leftMm === 'number' && typeof co.widthMm === 'number') {
                out.leftMm = Math.round(wing.width * 10 - co.leftMm - co.widthMm);
            }
            if (co.dimOffsets && typeof co.dimOffsets === 'object') {
                out.dimOffsets = {};
                Object.keys(co.dimOffsets).forEach(role => {
                    const o = co.dimOffsets[role];
                    out.dimOffsets[role] = (o && typeof o.x === 'number') ? Object.assign({}, o, { x: o.x ? -o.x : 0 }) : o;
                });
            }
            return out;
        });
    }

    function _resolveActiveWing(wings, activeWing) {
        if (!wings) return null;
        if (activeWing === 'full_corner_right') return wings.right;
        if (activeWing === 'full_corner_left') return wings.left;
        if (activeWing === 'sideCabinetRight' || activeWing === 'sideCabinetLeft') return wings.center ? wings.center.sideCabinet : null;
        return wings[activeWing] || wings.center || null;
    }

    /**
     * Pure mirror of a cabinet record shaped like a cart item's rawState
     * ({ wings, presetId, activeWing, partColors, blueprint*, roomWall, closureWidth* … }).
     * Returns a new object; the input is not modified. Mirroring twice gives back the original.
     */
    function _mirrorCabinetData(data) {
        const src = _clone(data) || {};
        const oldWings = _clone(src.wings) || {};

        if (src.partColors) src.partColors = _mirrorPartColorMap(src.partColors, oldWings);
        if (src.blueprintCellDimOffsets) src.blueprintCellDimOffsets = _mirrorBpMap(src.blueprintCellDimOffsets, oldWings, true);
        if (src.blueprintCellDimShown) src.blueprintCellDimShown = _mirrorBpMap(src.blueprintCellDimShown, oldWings, false);
        if (src.blueprintColWidthDimShown) src.blueprintColWidthDimShown = _mirrorBpMap(src.blueprintColWidthDimShown, oldWings, false);
        if (src.blueprintCutouts) src.blueprintCutouts = _mirrorCutouts(src.blueprintCutouts, oldWings);
        // Dragged dimension labels are stored by drawing coordinates — no reliable mapping, so they reset
        if (src.blueprintDimOffsets) src.blueprintDimOffsets = {};

        if (src.wings) {
            const out = {};
            Object.keys(src.wings).forEach(k => {
                const from = _swapWingId(k);
                if (Object.prototype.hasOwnProperty.call(src.wings, from)) out[k] = _mirrorWing(src.wings[from]);
            });
            Object.keys(src.wings).forEach(k => {
                const to = _swapWingId(k);
                if (!Object.prototype.hasOwnProperty.call(out, to)) out[to] = _mirrorWing(src.wings[k]);
            });
            src.wings = out;
        }
        if (_PRESET_SWAP[src.presetId]) src.presetId = _PRESET_SWAP[src.presetId];
        if (src.activeWing) src.activeWing = _swapWingId(src.activeWing);

        // Flat copies of the active wing kept on older-format records
        if (src.wings) {
            const aw = _resolveActiveWing(src.wings, src.activeWing || 'center');
            if (aw) {
                if (Object.prototype.hasOwnProperty.call(src, 'columns')) src.columns = _clone(aw.columns);
                if (Object.prototype.hasOwnProperty.call(src, 'desk')) src.desk = _clone(aw.desk);
            }
        } else {
            _mirrorWing(src);
        }
        if (src.corner && !src.wings) src.corner.side = _swapLR(src.corner.side);

        if (src.roomWall) src.roomWall = _swapLR(src.roomWall);
        if ('closureWidth' in src || 'closureWidthRight' in src) _swapKeys(src, 'closureWidth', 'closureWidthRight');
        return src;
    }

    // ---- Live editor ----

    function _liveRecord() {
        const scope = window._ppColorScope || 'draft';
        return {
            wings: state.wings,
            presetId: state.presetId,
            activeWing: state.activeWing,
            partColors: (typeof window._exportLocalPartColors === 'function') ? window._exportLocalPartColors(scope) : {},
            roomWall: window._roomWall || state.roomWall || 'center',
            closureWidth: window._closureWidth || 1.8,
            closureWidthRight: window._closureWidthRight || 1.8,
            blueprintCutouts: state.blueprintCutouts || [],
            blueprintCellDimOffsets: state.blueprintCellDimOffsets || {},
            blueprintDimOffsets: state.blueprintDimOffsets || {},
            blueprintCellDimShown: state.blueprintCellDimShown || {},
            blueprintColWidthDimShown: state.blueprintColWidthDimShown || {}
        };
    }

    function _replaceScopedColors(scope, localColors) {
        if (!state.partColors) state.partColors = {};
        const prefix = scope + '::';
        Object.keys(state.partColors).forEach(k => { if (k.indexOf(prefix) === 0) delete state.partColors[k]; });
        if (typeof window._importLocalPartColors === 'function') window._importLocalPartColors(scope, localColors || {});
    }

    function _applyLiveRecord(rec) {
        Object.keys(state.wings).forEach(k => { delete state.wings[k]; });
        Object.keys(rec.wings).forEach(k => { state.wings[k] = rec.wings[k]; });
        state.presetId = rec.presetId;
        state.activeWing = rec.activeWing || 'center';
        _replaceScopedColors(window._ppColorScope || 'draft', rec.partColors);
        window._roomWall = rec.roomWall;
        state.roomWall = rec.roomWall;
        window._closureWidth = rec.closureWidth;
        window._closureWidthRight = rec.closureWidthRight;
        state.blueprintCutouts = rec.blueprintCutouts;
        state.blueprintCellDimOffsets = rec.blueprintCellDimOffsets;
        state.blueprintDimOffsets = rec.blueprintDimOffsets;
        state.blueprintCellDimShown = rec.blueprintCellDimShown;
        state.blueprintColWidthDimShown = rec.blueprintColWidthDimShown;
    }

    function _clearTransientSelection() {
        state._activeUpperUnit = null;
        state._activeUpperUnitParent = null;
        const banner = document.getElementById('upper-unit-edit-banner');
        if (banner) banner.style.display = 'none';
        try { if (typeof clearSelection === 'function') clearSelection(); } catch (e) { /* ignore */ }
        try { if (typeof window._clearFCSelection === 'function') window._clearFCSelection(); } catch (e) { /* ignore */ }
    }

    function _mirrorLiveCabinet() {
        if (typeof window._syncPartColorScope === 'function') window._syncPartColorScope();
        _applyLiveRecord(_mirrorCabinetData(_liveRecord()));
    }

    function _swapSideText(str) {
        if (typeof str !== 'string') return str;
        return str.replace(/משמאל|מימין|שמאל|ימין/g, w => ({ 'משמאל': 'מימין', 'מימין': 'משמאל', 'שמאל': 'ימין', 'ימין': 'שמאל' })[w]);
    }

    function _dropAutoPreviews(item) {
        const sp = item && item.spec;
        if (!sp) return;
        if (!sp.imgDoorsManual) { sp.imgDoors = null; delete sp.imgDoorsAuto; }
        if (!sp.imgOpenManual) { sp.imgOpen = null; delete sp.imgOpenAuto; }
        sp.imgBlueprint = null;
        sp.multiViewSVG = null;
        sp.multiViewPages = [];
        sp.multiViewLabels = [];
        sp.wingPreviews = [];
        delete sp.captureVer;
        if (sp.desk) sp.desk = _swapSideText(sp.desk);
    }

    /** Mirror every cabinet in a shared space as one unit, around the anchor cabinet (slot 0). */
    function _mirrorSpacePair(info) {
        const activeIdx = state.editingCartIndex;
        if (typeof window._commitCurrentCabinetToCart === 'function') window._commitCurrentCabinetToCart({ flash: false });
        const cart = state.orderCart || [];
        info.members.forEach(m => {
            const item = cart[m.index];
            if (!item || !item.rawState) return;
            const scope = 'cart' + m.index;
            const rs = item.rawState;
            const local = Object.assign({},
                (typeof window._exportLocalPartColors === 'function') ? window._exportLocalPartColors(scope) : {},
                rs.partColors || {});
            const mirrored = _mirrorCabinetData(Object.assign({}, rs, { partColors: local }));
            Object.keys(mirrored).forEach(k => { rs[k] = mirrored[k]; });
            _replaceScopedColors(scope, rs.partColors);

            if (m.slot > 0) {
                const o = window._getSpaceOffset(item);
                const next = Object.assign({}, item.spaceOffset || rs.spaceOffset || {}, {
                    x: o.x ? -o.x : 0, y: o.y, z: o.z, rot: (360 - (o.rot || 0)) % 360
                });
                item.spaceOffset = next;
                rs.spaceOffset = next;
            }
            _dropAutoPreviews(item);
        });
        if (typeof window._invalidateSpacePairPreviewImages === 'function') window._invalidateSpacePairPreviewImages(info.pairId);
        if (typeof window._editCartItemNow === 'function') window._editCartItemNow(activeIdx);
    }

    function _refreshAfterMirror() {
        ['left', 'right'].forEach(side => {
            if (state.wings[side]) { if (typeof _showWingTab === 'function') _showWingTab(side); }
            else if (typeof _hideWingTab === 'function') _hideWingTab(side);
        });
        document.querySelectorAll('.wing-tab-btn').forEach(b => b.classList.toggle('active', b.dataset.wing === state.activeWing));
        if (typeof syncSidebarToWing === 'function') syncSidebarToWing();
        if (typeof window._restorePresetUI === 'function') window._restorePresetUI();
        if (typeof window._updateRoomWallUI === 'function') window._updateRoomWallUI();
        if (typeof buildCabinet === 'function') buildCabinet();
        if (typeof updateCameraView === 'function') updateCameraView();
        if (typeof calculatePrice === 'function') calculatePrice();
        if (typeof updateLeftSidebar === 'function') updateLeftSidebar();
    }

    window.mirrorCabinet = function() {
        if (typeof state === 'undefined' || !state.wings) return;
        if (state.wingEditMode) {
            if (typeof _showToast === 'function') _showToast('יש לסיים קודם את עריכת הכנף ואז להפוך את הכיוון', 3000);
            return;
        }
        _clearTransientSelection();
        const info = (typeof window._getSpacePairInfo === 'function') ? window._getSpacePairInfo() : null;
        if (info && info.count > 1) {
            _mirrorSpacePair(info);
            if (typeof _showToast === 'function') _showToast('כל הארונות במרחב הופכו — לחיצה נוספת מחזירה', 2800);
            return;
        }
        _mirrorLiveCabinet();
        _refreshAfterMirror();
        if (typeof saveHistoryState === 'function') saveHistoryState('היפוך כיוון');
        if (typeof _showToast === 'function') _showToast('הארון הופך — לחיצה נוספת מחזירה', 2600);
    };

    window._mirrorCabinetData = _mirrorCabinetData;
})();
