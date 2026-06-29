// =============================================================================
// Room Plan Mode — 2D top-down SVG planner synced with 3D room
// =============================================================================

(function() {
    'use strict';

    window._roomPlanSubview = window._roomPlanSubview || '2d';
    window._roomPlanDrag = null;
    window._roomPlanSaved = null;
    window._roomPlanPending3D = false;
    window._chairPosOverride = window._chairPosOverride || null;
    window._roomPlanRenderQueued = false;

    function _is2dPlan() {
        return state.viewMode === 'room-plan' && window._roomPlanSubview === '2d';
    }

    /** Push 2D position changes into the Three.js room (call only when leaving 2D or exiting plan mode). */
    window._syncRoomPlanTo3D = function() {
        if (!window._roomPlanPending3D) return;
        window._roomPlanPending3D = false;
        if (typeof _buildRoom === 'function') _buildRoom();
    };

    const FURN_COLORS = {
        cabinet:     { fill: '#e8edf3', stroke: '#1E3A5F', label: 'הארון שלך' },
        bed:         { fill: '#f1f5f9', stroke: '#64748b', label: 'מיטה' },
        chair:       { fill: '#f8fafc', stroke: '#94a3b8', label: 'כסא' },
        'cabinet-desk': { fill: '#e2e8f0', stroke: '#64748b', label: 'שולחן ארון' },
        nightstand:  { fill: '#f5f0e8', stroke: '#92706a', label: 'שידה' },
        'room-desk': { fill: '#fef3c7', stroke: '#d97706', label: 'שולחן עבודה' }
    };

    function _rectFromCenter(cx, cz, halfW, halfD, rotDeg) {
        const rot = ((rotDeg || 0) * Math.PI) / 180;
        const cos = Math.cos(rot), sin = Math.sin(rot);
        const corners = [
            { x: -halfW, z: -halfD }, { x: halfW, z: -halfD },
            { x: halfW, z: halfD }, { x: -halfW, z: halfD }
        ].map(function(c) {
            return { x: cx + c.x * cos - c.z * sin, z: cz + c.x * sin + c.z * cos };
        });
        const xs = corners.map(function(c) { return c.x; });
        const zs = corners.map(function(c) { return c.z; });
        return {
            minX: Math.min.apply(null, xs), maxX: Math.max.apply(null, xs),
            minZ: Math.min.apply(null, zs), maxZ: Math.max.apply(null, zs)
        };
    }

    function _makeFurnItem(id, rect, draggable, label) {
        return {
            id: id,
            minX: rect.minX, maxX: rect.maxX,
            minZ: rect.minZ, maxZ: rect.maxZ,
            draggable: !!draggable,
            label: label || (FURN_COLORS[id] && FURN_COLORS[id].label) || id
        };
    }

    function _layer() { return document.getElementById('room-plan-layer'); }
    function _svg() { return document.getElementById('room-plan-svg'); }

    function _getBounds() {
        return window._roomBounds || null;
    }

    function _roomDims() {
        const b = _getBounds();
        if (!b) return { w: 500, d: 500 };
        return { w: b.rightX - b.leftX, d: b.frontZ - b.backZ };
    }

    window._roomPlanZoom = window._roomPlanZoom || 1;
    window._roomPlanPanX = window._roomPlanPanX || 0;
    window._roomPlanPanY = window._roomPlanPanY || 0;

    const ZOOM_MIN = 0.25;
    const ZOOM_MAX = 5;

    function _resetRoomPlanView() {
        window._roomPlanZoom = 1;
        window._roomPlanPanX = 0;
        window._roomPlanPanY = 0;
    }

    function _calcTransform(svgW, svgH) {
        const b = _getBounds();
        if (!b) return null;
        const pad = 72;
        const roomW = b.rightX - b.leftX;
        const roomD = b.frontZ - b.backZ;
        const baseScale = Math.min((svgW - pad * 2) / roomW, (svgH - pad * 2) / roomD);
        const zoom = window._roomPlanZoom || 1;
        const scale = baseScale * zoom;
        return {
            b, pad, scale, baseScale, zoom, svgW, svgH, roomW, roomD,
            panX: window._roomPlanPanX || 0,
            panY: window._roomPlanPanY || 0,
            cx: svgW / 2,
            cy: svgH / 2
        };
    }

    function _w2s(x, z, tf) {
        const bx = tf.pad + (x - tf.b.leftX) * tf.baseScale;
        const by = tf.pad + (z - tf.b.backZ) * tf.baseScale;
        const zoom = tf.zoom || 1;
        return {
            x: tf.cx + (bx - tf.cx) * zoom + tf.panX,
            y: tf.cy + (by - tf.cy) * zoom + tf.panY
        };
    }

    function _s2w(sx, sy, tf) {
        const zoom = tf.zoom || 1;
        const bx = tf.cx + (sx - tf.cx - tf.panX) / zoom;
        const by = tf.cy + (sy - tf.cy - tf.panY) / zoom;
        return {
            x: tf.b.leftX + (bx - tf.pad) / tf.baseScale,
            z: tf.b.backZ + (by - tf.pad) / tf.baseScale
        };
    }

    function _applyRoomPlanWheel(e) {
        if (!_is2dPlan()) return;
        e.preventDefault();
        const tf = window._roomPlanTransform;
        if (!tf) return;

        const svg = _svg();
        const rect = svg ? svg.getBoundingClientRect() : null;
        const mx = rect ? e.clientX - rect.left : tf.cx;
        const my = rect ? e.clientY - rect.top : tf.cy;

        const factor = e.deltaY > 0 ? 0.9 : 1.1;
        const oldZoom = window._roomPlanZoom || 1;
        const newZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, oldZoom * factor));
        if (newZoom === oldZoom) return;

        const ratio = newZoom / oldZoom;
        const panX = window._roomPlanPanX || 0;
        const panY = window._roomPlanPanY || 0;
        window._roomPlanZoom = newZoom;
        window._roomPlanPanX = mx - tf.cx - (mx - tf.cx - panX) * ratio;
        window._roomPlanPanY = my - tf.cy - (my - tf.cy - panY) * ratio;
        _queueRoomPlanRender();
    }

    function _getCabinetRect() {
        if (typeof cabinetGroup === 'undefined' || !cabinetGroup) return null;
        cabinetGroup.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(cabinetGroup);
        return {
            id: 'cabinet',
            minX: box.min.x, maxX: box.max.x,
            minZ: box.min.z, maxZ: box.max.z,
            draggable: false,
            label: FURN_COLORS.cabinet.label
        };
    }

    function _getBedRect() {
        if (window._bedVisible === false) return null;
        const usePos = _is2dPlan() || window._roomPlanDrag;
        if (!usePos && window._bedMesh) {
            window._bedMesh.updateMatrixWorld(true);
            const box = new THREE.Box3().setFromObject(window._bedMesh);
            return {
                id: 'bed',
                minX: box.min.x, maxX: box.max.x,
                minZ: box.min.z, maxZ: box.max.z,
                draggable: true,
                label: FURN_COLORS.bed.label
            };
        }
        const bp = window._bedPos || { x: 150, z: 200 };
        const rot = ((window._bedRotation || 0) * Math.PI) / 180;
        const w = (window._bedWidthCm || 160) / 2;
        const l = 100;
        const corners = [
            { x: -w, z: -l }, { x: w, z: -l }, { x: w, z: l }, { x: -w, z: l }
        ].map(function(c) {
            const cos = Math.cos(rot), sin = Math.sin(rot);
            return { x: bp.x + c.x * cos - c.z * sin, z: bp.z + c.x * sin + c.z * cos };
        });
        const xs = corners.map(c => c.x), zs = corners.map(c => c.z);
        return {
            id: 'bed',
            minX: Math.min(...xs), maxX: Math.max(...xs),
            minZ: Math.min(...zs), maxZ: Math.max(...zs),
            draggable: true,
            label: FURN_COLORS.bed.label
        };
    }

    function _getChairRect() {
        if (window._chairVisible === false) return null;
        let cp = window._chairPosOverride;
        if (!cp && typeof _getChairPos === 'function') cp = _getChairPos();
        if (!cp) return null;

        const usePos = _is2dPlan() || window._roomPlanDrag;
        if (!usePos && window._chairMesh) {
            window._chairMesh.updateMatrixWorld(true);
            const box = new THREE.Box3().setFromObject(window._chairMesh);
            return {
                id: 'chair',
                minX: box.min.x, maxX: box.max.x,
                minZ: box.min.z, maxZ: box.max.z,
                draggable: true,
                label: FURN_COLORS.chair.label
            };
        }
        const half = 30;
        return {
            id: 'chair',
            minX: cp.x - half, maxX: cp.x + half,
            minZ: cp.z - half, maxZ: cp.z + half,
            draggable: true,
            label: FURN_COLORS.chair.label
        };
    }

    function _getCabinetDeskRect() {
        const wing = state.wings && state.wings.center;
        if (!wing) return null;
        const cabOffX = (typeof cabinetGroup !== 'undefined' && cabinetGroup) ? (cabinetGroup.position.x || 0) : 0;
        const cabD = wing.depth || 54;
        const cabW = wing.width || state.width || 160;

        if (wing.desk && wing.desk.side !== 'none') {
            const dW = wing.desk.width || 100;
            const dSide = wing.desk.side;
            const minX = dSide === 'right' ? cabOffX + cabW / 2 : cabOffX - cabW / 2 - dW;
            const maxX = dSide === 'right' ? cabOffX + cabW / 2 + dW : cabOffX - cabW / 2;
            return _makeFurnItem('cabinet-desk', { minX, maxX, minZ: -cabD / 2, maxZ: cabD / 2 + 20 }, false);
        }

        const cols = wing.columns || [];
        let curX = cabOffX - cabW / 2;
        for (let i = 0; i < cols.length; i++) {
            const col = cols[i];
            if (col.type === 'desk') {
                return _makeFurnItem('cabinet-desk', {
                    minX: curX, maxX: curX + col.width,
                    minZ: -cabD / 2, maxZ: cabD / 2 + 20
                }, false);
            }
            curX += col.width;
        }
        return null;
    }

    function _getNightstandRect() {
        if (!window._nightstandVisible) return null;
        const np = window._nightstandPos || { x: 60, z: 280 };
        const w = (window._NIGHTSTAND_W || 50) / 2;
        const d = (window._NIGHTSTAND_D || 40) / 2;
        const rect = _rectFromCenter(np.x, np.z, w, d, window._nightstandRotation || 0);
        return _makeFurnItem('nightstand', rect, true);
    }

    function _getRoomDeskRect() {
        if (!window._roomDeskVisible) return null;
        const dp = window._roomDeskPos || { x: 130, z: 130 };
        const w = (window._ROOM_DESK_W || 120) / 2;
        const d = (window._ROOM_DESK_D || 60) / 2;
        const rect = _rectFromCenter(dp.x, dp.z, w, d, window._roomDeskRotation || 0);
        return _makeFurnItem('room-desk', rect, true);
    }

    function _collectFurniture() {
        const items = [];
        const cab = _getCabinetRect();
        const cabDesk = _getCabinetDeskRect();
        const bed = _getBedRect();
        const chair = _getChairRect();
        const nightstand = _getNightstandRect();
        const roomDesk = _getRoomDeskRect();
        if (cab) items.push(cab);
        if (cabDesk) items.push(cabDesk);
        if (bed) items.push(bed);
        if (nightstand) items.push(nightstand);
        if (roomDesk) items.push(roomDesk);
        if (chair) items.push(chair);
        return items;
    }

    function _rectCenter(r) {
        return { x: (r.minX + r.maxX) / 2, z: (r.minZ + r.maxZ) / 2 };
    }

    function _clampBedCenter(x, z) {
        const bp = { x, z };
        if (typeof _clampBedPos === 'function') _clampBedPos(bp);
        else {
            const b = _getBounds();
            if (b) {
                bp.x = Math.max(b.leftX + 80, Math.min(b.rightX - 80, bp.x));
                bp.z = Math.max(b.backZ + 80, Math.min(b.frontZ - 80, bp.z));
            }
        }
        return bp;
    }

    function _clampFurnCenter(x, z, halfW, halfD) {
        const b = _getBounds();
        if (!b) return { x, z };
        return {
            x: Math.max(b.leftX + halfW, Math.min(b.rightX - halfW, x)),
            z: Math.max(b.backZ + halfD, Math.min(b.frontZ - halfD, z))
        };
    }

    function _clampChairCenter(x, z) {
        return _clampFurnCenter(x, z, 30, 30);
    }

    function _applyFurnitureMove(id, cx, cz) {
        if (id === 'bed') {
            window._bedPos = _clampBedCenter(cx, cz);
        } else if (id === 'chair') {
            const cp = _clampChairCenter(cx, cz);
            const prev = window._chairPosOverride || (typeof _getChairPos === 'function' ? _getChairPos() : {}) || {};
            window._chairPosOverride = {
                x: cp.x, z: cp.z,
                rotY: prev.rotY !== undefined ? prev.rotY : -Math.PI / 2
            };
        } else if (id === 'nightstand') {
            const np = _clampFurnCenter(cx, cz, (window._NIGHTSTAND_W || 50) / 2, (window._NIGHTSTAND_D || 40) / 2);
            window._nightstandPos = np;
        } else if (id === 'room-desk') {
            const dp = _clampFurnCenter(cx, cz, (window._ROOM_DESK_W || 120) / 2, (window._ROOM_DESK_D || 60) / 2);
            window._roomDeskPos = dp;
        }
        window._roomPlanPending3D = true;
    }

    // ── SVG dimension helpers ───────────────────────────────────────────────

    function _svgEl(tag, attrs, text) {
        const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
        if (attrs) Object.keys(attrs).forEach(function(k) { el.setAttribute(k, attrs[k]); });
        if (text != null) el.textContent = text;
        return el;
    }

    function _dimLabelBgRect(x, y, text, opts) {
        const fs = opts.active ? 12 : 11;
        const padX = 6;
        const padY = 4;
        const textW = Math.max(String(text).length * fs * 0.62, fs * 1.5);
        const textH = fs + 2;
        const w = textW + padX * 2;
        const h = textH + padY * 2;
        const valign = opts.valign || 'above';
        const bx = x - w / 2;
        let by;
        if (valign === 'middle') by = y - h / 2;
        else if (valign === 'above') by = y - h - 1;
        else by = y + 2;
        return { x: bx, y: by, w: w, h: h };
    }

    function _dimLabelHalfW(text, active) {
        const fs = active ? 12 : 11;
        const padX = 6;
        const textW = Math.max(String(text).length * fs * 0.62, fs * 1.5);
        return (textW + padX * 2) / 2 + 4;
    }

    function _drawDimLabel(g, x, y, text, opts) {
        opts = opts || {};
        const active = !!opts.active;
        const valign = opts.valign || 'above';
        const bg = _dimLabelBgRect(x, y, text, { valign: valign, active: active });
        const wrap = _svgEl('g', { class: 'rp-dim-label' });
        wrap.appendChild(_svgEl('rect', {
            x: bg.x, y: bg.y, width: bg.w, height: bg.h,
            rx: 6, ry: 6,
            class: 'rp-dim-bg' + (active ? ' rp-dim-bg-active' : '')
        }));
        const textAttrs = {
            x: x, y: y,
            class: active ? 'rp-dim-text rp-dim-active' : 'rp-dim-text',
            'text-anchor': 'middle',
            direction: 'ltr'
        };
        if (opts.baseline) textAttrs['dominant-baseline'] = opts.baseline;
        wrap.appendChild(_svgEl('text', textAttrs, String(text)));
        g.appendChild(wrap);
    }

    function _drawDimH(g, x1, x2, y, label, above) {
        const dy = above ? -8 : 8;
        const ly = y + dy;
        g.appendChild(_svgEl('line', {
            x1: x1, y1: y, x2: x1, y2: ly,
            class: 'rp-dim-ext'
        }));
        g.appendChild(_svgEl('line', {
            x1: x2, y1: y, x2: x2, y2: ly,
            class: 'rp-dim-ext'
        }));
        g.appendChild(_svgEl('line', {
            x1: x1, y1: ly, x2: x2, y2: ly,
            class: 'rp-dim-line'
        }));
        const mid = (x1 + x2) / 2;
        _drawDimLabel(g, mid, ly + (above ? -4 : 14), String(Math.round(Math.abs(x2 - x1) / (_calcTransform(1, 1) ? 1 : 1))), {
            valign: above ? 'above' : 'below'
        });
    }

    function _drawWorldDimH(g, wx1, wx2, wz, label, tf, above) {
        const p1 = _w2s(wx1, wz, tf);
        const p2 = _w2s(wx2, wz, tf);
        const dist = Math.round(Math.abs(wx2 - wx1));
        const dy = above ? -8 : 8;
        const ly = p1.y + dy;
        g.appendChild(_svgEl('line', { x1: p1.x, y1: p1.y, x2: p1.x, y2: ly, class: 'rp-dim-ext' }));
        g.appendChild(_svgEl('line', { x1: p2.x, y1: p2.y, x2: p2.x, y2: ly, class: 'rp-dim-ext' }));
        g.appendChild(_svgEl('line', { x1: p1.x, y1: ly, x2: p2.x, y2: ly, class: 'rp-dim-line' }));
        _drawDimLabel(g, (p1.x + p2.x) / 2, ly + (above ? -4 : 14), dist, {
            valign: above ? 'above' : 'below'
        });
    }

    function _drawWorldDimV(g, wx, wz1, wz2, tf, left) {
        const p1 = _w2s(wx, wz1, tf);
        const p2 = _w2s(wx, wz2, tf);
        const dist = Math.round(Math.abs(wz2 - wz1));
        const dx = left ? -8 : 8;
        const lx = p1.x + dx;
        g.appendChild(_svgEl('line', { x1: p1.x, y1: p1.y, x2: lx, y2: p1.y, class: 'rp-dim-ext' }));
        g.appendChild(_svgEl('line', { x1: p2.x, y1: p2.y, x2: lx, y2: p2.y, class: 'rp-dim-ext' }));
        g.appendChild(_svgEl('line', { x1: lx, y1: p1.y, x2: lx, y2: p2.y, class: 'rp-dim-line' }));
        const labelX = lx + (left ? -1 : 1) * _dimLabelHalfW(dist, false);
        _drawDimLabel(g, labelX, (p1.y + p2.y) / 2, dist, {
            valign: 'middle',
            baseline: 'middle'
        });
    }

    function _drawItemWallDims(g, rect, tf, b, active) {
        if (!rect || !b) return;
        const cls = active ? 'rp-dim-line rp-dim-active' : 'rp-dim-line';

        const leftDist = rect.minX - b.leftX;
        const rightDist = b.rightX - rect.maxX;
        const backDist = rect.minZ - b.backZ;
        const frontDist = b.frontZ - rect.maxZ;

        const dimZ = rect.minZ - 18 / tf.scale;
        if (leftDist > 5) {
            const p1 = _w2s(b.leftX, dimZ, tf);
            const p2 = _w2s(rect.minX, dimZ, tf);
            g.appendChild(_svgEl('line', { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, class: cls }));
            _drawDimLabel(g, (p1.x + p2.x) / 2, p1.y - 5, Math.round(leftDist), {
                valign: 'above', active: active
            });
        }
        if (rightDist > 5) {
            const p1 = _w2s(rect.maxX, dimZ, tf);
            const p2 = _w2s(b.rightX, dimZ, tf);
            g.appendChild(_svgEl('line', { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, class: cls }));
            _drawDimLabel(g, (p1.x + p2.x) / 2, p1.y - 5, Math.round(rightDist), {
                valign: 'above', active: active
            });
        }

        const dimX = rect.maxX + 18 / tf.scale;
        if (backDist > 5) {
            const p1 = _w2s(dimX, b.backZ, tf);
            const p2 = _w2s(dimX, rect.minZ, tf);
            g.appendChild(_svgEl('line', { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, class: cls }));
            const backLabel = Math.round(backDist);
            _drawDimLabel(g, p1.x + _dimLabelHalfW(backLabel, active), (p1.y + p2.y) / 2, backLabel, {
                valign: 'middle', baseline: 'middle', active: active
            });
        }
        if (frontDist > 5) {
            const p1 = _w2s(dimX, rect.maxZ, tf);
            const p2 = _w2s(dimX, b.frontZ, tf);
            g.appendChild(_svgEl('line', { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, class: cls }));
            const frontLabel = Math.round(frontDist);
            _drawDimLabel(g, p1.x + _dimLabelHalfW(frontLabel, active), (p1.y + p2.y) / 2, frontLabel, {
                valign: 'middle', baseline: 'middle', active: active
            });
        }
    }

    // ── Main render ─────────────────────────────────────────────────────────

    window._renderRoomPlan2D = function() {
        if (state.viewMode !== 'room-plan' || window._roomPlanSubview !== '2d') return;

        const layer = _layer();
        const svg = _svg();
        if (!layer || !svg) return;

        if (!window._roomVisible || !_getBounds()) {
            if (typeof _buildRoom === 'function') _buildRoom();
        }
        const b = _getBounds();
        if (!b) return;

        const cw = layer.clientWidth || 800;
        const ch = layer.clientHeight || 600;
        svg.setAttribute('viewBox', '0 0 ' + cw + ' ' + ch);
        svg.setAttribute('width', cw);
        svg.setAttribute('height', ch);

        while (svg.firstChild) svg.removeChild(svg.firstChild);

        const defs = _svgEl('defs');
        const pattern = _svgEl('pattern', {
            id: 'rp-wall-hatch', patternUnits: 'userSpaceOnUse',
            width: '8', height: '8', patternTransform: 'rotate(45)'
        });
        pattern.appendChild(_svgEl('line', {
            x1: '0', y1: '0', x2: '0', y2: '8',
            stroke: '#94a3b8', 'stroke-width': '1.2'
        }));
        defs.appendChild(pattern);
        svg.appendChild(defs);

        const tf = _calcTransform(cw, ch);
        if (!tf) return;

        const tl = _w2s(b.leftX, b.backZ, tf);
        const br = _w2s(b.rightX, b.frontZ, tf);
        const rw = br.x - tl.x;
        const rh = br.y - tl.y;

        const roomG = _svgEl('g', { class: 'rp-room' });
        roomG.appendChild(_svgEl('rect', {
            x: tl.x - 14, y: tl.y - 14,
            width: rw + 28, height: rh + 28,
            fill: 'url(#rp-wall-hatch)', stroke: '#1e293b',
            'stroke-width': '3', rx: '2'
        }));
        roomG.appendChild(_svgEl('rect', {
            x: tl.x, y: tl.y, width: rw, height: rh,
            fill: '#fafbfc', stroke: 'none'
        }));
        svg.appendChild(roomG);

        const dimsG = _svgEl('g', { class: 'rp-dims' });
        _drawWorldDimH(dimsG, b.leftX, b.rightX, b.backZ - 28 / tf.scale, '', tf, true);
        _drawWorldDimV(dimsG, b.leftX - 28 / tf.scale, b.backZ, b.frontZ, tf, true);
        svg.appendChild(dimsG);

        const furnG = _svgEl('g', { class: 'rp-furniture' });
        const items = _collectFurniture();
        const dragId = window._roomPlanDrag ? window._roomPlanDrag.id : null;

        items.forEach(function(item) {
            const p1 = _w2s(item.minX, item.minZ, tf);
            const p2 = _w2s(item.maxX, item.maxZ, tf);
            const fx = Math.min(p1.x, p2.x);
            const fy = Math.min(p1.y, p2.y);
            const fw = Math.abs(p2.x - p1.x);
            const fh = Math.abs(p2.y - p1.y);
            const colors = FURN_COLORS[item.id] || FURN_COLORS.chair;
            const isActive = item.id === dragId;

            const g = _svgEl('g', {
                class: 'rp-furn-item' + (item.draggable ? ' rp-draggable' : '') + (isActive ? ' rp-active' : ''),
                'data-id': item.id
            });

            g.appendChild(_svgEl('rect', {
                x: fx, y: fy, width: fw, height: fh,
                fill: colors.fill, stroke: colors.stroke,
                'stroke-width': isActive ? '2.5' : '1.5',
                rx: '4'
            }));

            const labelSize = Math.max(9, Math.min(12, fw / 8));
            if (fw > 36 && fh > 20) {
                g.appendChild(_svgEl('text', {
                    x: fx + fw / 2, y: fy + fh / 2,
                    class: 'rp-furn-label', 'text-anchor': 'middle',
                    'dominant-baseline': 'middle',
                    'font-size': labelSize
                }, item.label));
            }

            if (item.draggable) {
                g.style.cursor = 'grab';
            }
            furnG.appendChild(g);
        });
        svg.appendChild(furnG);

        const itemDimsG = _svgEl('g', { class: 'rp-item-dims' });
        items.forEach(function(item) {
            if (item.id === 'cabinet' || item.id === 'cabinet-desk') return;
            _drawItemWallDims(itemDimsG, item, tf, b, item.id === dragId);
        });
        svg.appendChild(itemDimsG);

        const doorG = _svgEl('g', { class: 'rp-door' });
        const doorW = 90;
        const doorCx = (b.leftX + b.rightX) / 2;
        const doorZ = b.frontZ;
        const dp1 = _w2s(doorCx - doorW / 2, doorZ, tf);
        const dp2 = _w2s(doorCx + doorW / 2, doorZ, tf);
        doorG.appendChild(_svgEl('rect', {
            x: dp1.x, y: dp1.y - 4, width: dp2.x - dp1.x, height: 8,
            fill: '#bae6fd', stroke: '#0284c7', 'stroke-width': '1'
        }));
        const arcR = (dp2.x - dp1.x) * 0.9;
        doorG.appendChild(_svgEl('path', {
            d: 'M ' + dp1.x + ' ' + dp1.y + ' A ' + arcR + ' ' + arcR + ' 0 0 0 ' + (dp1.x + arcR) + ' ' + (dp1.y - arcR),
            fill: 'none', stroke: '#ef4444', 'stroke-width': '1.2',
            'stroke-dasharray': '4 3'
        }));
        svg.appendChild(doorG);

        window._roomPlanTransform = tf;
        if (!window._roomPlanDrag) window._updateRoomPlanFurnitureList();
    };

    function _queueRoomPlanRender() {
        if (window._roomPlanRenderQueued) return;
        window._roomPlanRenderQueued = true;
        requestAnimationFrame(function() {
            window._roomPlanRenderQueued = false;
            if (_is2dPlan()) window._renderRoomPlan2D();
        });
    }

    window._updateRoomPlanFurnitureList = function() {
        const list = document.getElementById('room-plan-furniture-list');
        if (!list) return;
        const items = _collectFurniture();
        list.innerHTML = '';
        items.forEach(function(item) {
            const w = Math.round(item.maxX - item.minX);
            const d = Math.round(item.maxZ - item.minZ);
            const row = document.createElement('div');
            row.className = 'room-plan-furn-row';
            const icon = item.id === 'bed' ? 'fa-bed'
                : item.id === 'chair' ? 'fa-chair'
                : item.id === 'nightstand' ? 'fa-table-cells'
                : item.id === 'room-desk' ? 'fa-desktop'
                : item.id === 'cabinet-desk' ? 'fa-laptop'
                : 'fa-door-closed';
            row.innerHTML =
                '<i class="fa-solid ' + icon + '"></i>' +
                '<span class="room-plan-furn-name">' + (item.label || item.id) + '</span>' +
                '<span class="room-plan-furn-dim">' + w + '×' + d + '</span>';
            list.appendChild(row);
        });
    };

    window._updateRoomPlanSubview = function() {
        const is2d = window._roomPlanSubview === '2d';
        document.body.classList.toggle('room-plan-2d', is2d);
        document.body.classList.toggle('room-plan-3d', !is2d);

        const layer = _layer();
        const toggleBtn = document.getElementById('btn-room-plan-view-toggle');
        if (layer) layer.style.display = (state.viewMode === 'room-plan' && is2d) ? 'block' : 'none';
        if (toggleBtn) {
            toggleBtn.innerHTML = is2d
                ? '<i class="fa-solid fa-cube"></i><span>3D</span>'
                : '<i class="fa-solid fa-vector-square"></i><span>2D</span>';
        }

        if (is2d) {
            window._renderRoomPlan2D();
        } else {
            window._syncRoomPlanTo3D();
            if (typeof updateCameraView === 'function') updateCameraView();
        }
        if (typeof window._updateBedHandles === 'function') window._updateBedHandles();
        if (typeof window._updateRoomPropsUI === 'function') window._updateRoomPropsUI();
    };

    window._toggleRoomPlanSubview = function() {
        window._roomPlanSubview = window._roomPlanSubview === '2d' ? '3d' : '2d';
        window._updateRoomPlanSubview();
    };

    /** Furniture property changed (width, rotation, visibility) — defer 3D while in 2D plan. */
    window._roomPlanFurnitureChanged = function() {
        if (_is2dPlan()) {
            window._roomPlanPending3D = true;
            window._renderRoomPlan2D();
        } else if (typeof _buildRoom === 'function') {
            _buildRoom();
        }
    };

    function _updateRoomPlanBtn(active) {
        const btn = document.getElementById('btn-room-plan');
        if (!btn) return;
        btn.classList.toggle('active', !!active);
    }

    window._enterRoomPlanMode = function() {
        if (state.viewMode === 'room-plan') return;

        window._roomPlanSaved = {
            viewMode: state.viewMode,
            roomVisible: window._roomVisible,
            orbitFree: window._orbitFree
        };

        window._roomVisible = true;
        window._roomPlanSubview = '2d';
        window._roomPlanPending3D = false;
        _resetRoomPlanView();
        state.viewMode = 'room-plan';
        window._orbitFree = false;
        window._forceCameraAnim = true;

        document.body.classList.add('room-plan-mode');
        document.querySelectorAll('.view-btn').forEach(function(b) { b.classList.remove('active'); });
        _updateRoomPlanBtn(true);

        const furnBar = document.getElementById('room-furniture-toolbar');
        if (furnBar) furnBar.style.display = '';

        const rsSec = document.getElementById('room-settings-section');
        if (rsSec) {
            rsSec.classList.add('room-plan-highlight');
            rsSec.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }

        ['room-plan-sidebar-header', 'room-plan-furniture-list'].forEach(function(id) {
            const el = document.getElementById(id);
            if (el) el.style.display = '';
        });
        document.querySelectorAll('.room-plan-structure-title').forEach(function(el) {
            el.style.display = '';
        });

        if (typeof buildCabinet === 'function') buildCabinet();
        window._updateRoomPlanSubview();
        if (typeof window._updateRoomWallUI === 'function') window._updateRoomWallUI();
        if (typeof window._updateRoomPropsUI === 'function') window._updateRoomPropsUI();
    };

    window._exitRoomPlanMode = function() {
        if (state.viewMode !== 'room-plan') return;

        window._syncRoomPlanTo3D();

        document.body.classList.remove('room-plan-mode', 'room-plan-2d', 'room-plan-3d');
        _updateRoomPlanBtn(false);

        const layer = _layer();
        if (layer) layer.style.display = 'none';

        const rsSec = document.getElementById('room-settings-section');
        if (rsSec) rsSec.classList.remove('room-plan-highlight');

        ['room-plan-sidebar-header', 'room-plan-furniture-list'].forEach(function(id) {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
        });
        document.querySelectorAll('.room-plan-structure-title').forEach(function(el) {
            el.style.display = 'none';
        });

        window._roomPlan3dCamSet = false;

        if (window._roomPlanSaved) {
            state.viewMode = window._roomPlanSaved.viewMode || 'front';
            window._orbitFree = window._roomPlanSaved.orbitFree || false;
            window._roomPlanSaved = null;
        } else {
            state.viewMode = 'front';
        }

        window._roomVisible = false;
        if (typeof _buildRoom === 'function') _buildRoom();

        const furnBar = document.getElementById('room-furniture-toolbar');
        if (furnBar && !window._roomVisible) furnBar.style.display = 'none';

        document.querySelectorAll('.view-btn').forEach(function(b) { b.classList.remove('active'); });
        const activeBtn = document.getElementById(
            state.viewMode === 'room-plan' ? 'btn-room-plan'
            : state.viewMode === 'front' ? 'btn-front-view'
            : 'btn-blueprint-view'
        );
        if (activeBtn) activeBtn.classList.add('active');

        if (typeof buildCabinet === 'function') buildCabinet();
        if (typeof updateCameraView === 'function') updateCameraView();
        if (typeof window._updateRoomWallUI === 'function') window._updateRoomWallUI();
        if (typeof window._updateRoomPropsUI === 'function') window._updateRoomPropsUI();
    };

    window._toggleRoomPlanMode = function() {
        if (state.viewMode === 'room-plan') {
            window._exitRoomPlanMode();
        } else {
            window._enterRoomPlanMode();
        }
    };

    // ── Drag interaction ────────────────────────────────────────────────────

    function _hitTestFurn(sx, sy) {
        const tf = window._roomPlanTransform;
        if (!tf) return null;
        const items = _collectFurniture().filter(function(i) { return i.draggable; });
        for (let i = items.length - 1; i >= 0; i--) {
            const item = items[i];
            const p1 = _w2s(item.minX, item.minZ, tf);
            const p2 = _w2s(item.maxX, item.maxZ, tf);
            const fx = Math.min(p1.x, p2.x), fy = Math.min(p1.y, p2.y);
            const fw = Math.abs(p2.x - p1.x), fh = Math.abs(p2.y - p1.y);
            if (sx >= fx && sx <= fx + fw && sy >= fy && sy <= fy + fh) return item;
        }
        return null;
    }

    function _bindRoomPlanEvents() {
        const svg = _svg();
        const layer = _layer();
        if (!svg || !layer) { setTimeout(_bindRoomPlanEvents, 300); return; }

        svg.addEventListener('pointerdown', function(e) {
            if (state.viewMode !== 'room-plan' || window._roomPlanSubview !== '2d') return;
            const rect = svg.getBoundingClientRect();
            const sx = e.clientX - rect.left;
            const sy = e.clientY - rect.top;
            const hit = _hitTestFurn(sx, sy);
            if (!hit) return;
            e.preventDefault();
            e.stopPropagation();
            const center = _rectCenter(hit);
            window._roomPlanDrag = {
                id: hit.id,
                startX: sx, startY: sy,
                startCx: center.x, startCz: center.z,
                pointerId: e.pointerId
            };
            svg.setPointerCapture(e.pointerId);
            document.body.classList.add('room-plan-dragging');
            _queueRoomPlanRender();
        });

        svg.addEventListener('pointermove', function(e) {
            const d = window._roomPlanDrag;
            if (!d || d.pointerId !== e.pointerId) return;
            const tf = window._roomPlanTransform;
            if (!tf) return;
            const rect = svg.getBoundingClientRect();
            const sx = e.clientX - rect.left;
            const sy = e.clientY - rect.top;
            const dx = (sx - d.startX) / tf.scale;
            const dz = (sy - d.startY) / tf.scale;
            _applyFurnitureMove(d.id, d.startCx + dx, d.startCz + dz);
            _queueRoomPlanRender();
        });

        function endDrag(e) {
            const d = window._roomPlanDrag;
            if (!d) return;
            if (e && d.pointerId !== e.pointerId) return;
            window._roomPlanDrag = null;
            document.body.classList.remove('room-plan-dragging');
            _queueRoomPlanRender();
        }

        svg.addEventListener('pointerup', endDrag);
        svg.addEventListener('pointercancel', endDrag);

        svg.addEventListener('wheel', _applyRoomPlanWheel, { passive: false });
        layer.addEventListener('wheel', _applyRoomPlanWheel, { passive: false });

        window.addEventListener('resize', function() {
            if (state.viewMode === 'room-plan' && window._roomPlanSubview === '2d') {
                window._renderRoomPlan2D();
            }
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', _bindRoomPlanEvents);
    } else {
        _bindRoomPlanEvents();
    }
})();
