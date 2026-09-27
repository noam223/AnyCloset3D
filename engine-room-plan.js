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

    /** Scene-frame AABB → room coordinates (identity if the room helpers are missing). */
    function _toRoomRect(minX, maxX, minZ, maxZ) {
        if (typeof window._worldRectToRoom === 'function') return window._worldRectToRoom(minX, maxX, minZ, maxZ);
        return { minX: minX, maxX: maxX, minZ: minZ, maxZ: maxZ };
    }

    function _meshRoomBox(obj) {
        if (typeof window._roomLocalBox === 'function') return window._roomLocalBox(obj);
        obj.updateMatrixWorld(true);
        return new THREE.Box3().setFromObject(obj);
    }

    function _is2dPlan() {
        return state.viewMode === 'room-plan' && window._roomPlanSubview === '2d';
    }

    /** Push 2D position changes into the Three.js room (call only when leaving 2D or exiting plan mode). */
    window._syncRoomPlanTo3D = function() {
        if (!window._roomPlanPending3D) return;
        window._roomPlanPending3D = false;
        if (typeof _buildRoom === 'function') _buildRoom();
    };

    function _dbgState() {
        return (typeof window._roomDbgState === 'function') ? window._roomDbgState() : {};
    }

    /** Entering 3D inside room plan: make sure the room actually exists; repair and report if not. */
    function _ensureRoomOn3dSwitch() {
        if (state.viewMode !== 'room-plan') return;
        const rg = window._roomGroup;
        const before = _dbgState();
        if (typeof window._roomDbg === 'function') window._roomDbg('2D → 3D', before);
        if (rg && rg.children.length > 0 && rg.visible) return;

        const reasons = [];
        if (window._roomVisible === false) { reasons.push('_roomVisible=false'); window._roomVisible = true; }
        if (window._isDragging) { reasons.push('_isDragging stuck'); window._isDragging = false; }
        if (state.wingEditMode) reasons.push('wingEditMode on');
        if (rg && !rg.visible) reasons.push('group hidden');
        if (rg && rg.children.length === 0) reasons.push('group empty');
        if (typeof _buildRoom === 'function') _buildRoom();
        if (rg && !state.wingEditMode) rg.visible = true;

        console.warn('[room] Room was missing when switching to 3D — rebuilt. Reasons: ' + (reasons.join(', ') || 'unknown'),
            { before: before, after: _dbgState() });
    }

    const FURN_COLORS = {
        cabinet:     { fill: '#e8edf3', stroke: '#1E3A5F', label: 'הארון שלך' },
        bed:         { fill: '#f1f5f9', stroke: '#64748b', label: 'מיטה' },
        chair:       { fill: '#f8fafc', stroke: '#94a3b8', label: 'כסא' },
        'cabinet-desk': { fill: '#e2e8f0', stroke: '#64748b', label: 'שולחן ארון' },
        nightstand:  { fill: '#f5f0e8', stroke: '#92706a', label: 'שידה' },
        'room-desk': { fill: '#fef3c7', stroke: '#d97706', label: 'שולחן עבודה' },
        'room-door': { fill: '#dbeafe', stroke: '#0284c7', label: 'דלת' },
        'room-cab':  { fill: '#dcfce7', stroke: '#059669', label: 'פריט מהפרויקט' }
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

    function _makeFurnItem(id, rect, draggable, label, extra) {
        const item = {
            id: id,
            minX: rect.minX, maxX: rect.maxX,
            minZ: rect.minZ, maxZ: rect.maxZ,
            draggable: !!draggable,
            label: label || (FURN_COLORS[id] && FURN_COLORS[id].label) || id
        };
        if (extra) Object.keys(extra).forEach(function(k) { item[k] = extra[k]; });
        return item;
    }

    function _colorToSvg(hex) {
        const n = (hex >>> 0) & 0xffffff;
        return '#' + n.toString(16).padStart(6, '0');
    }

    function _isRoomExtraCabId(id) {
        return String(id || '').indexOf('room-cab-') === 0;
    }

    function _isProjectDesk(item) {
        if (!item) return false;
        if (item.spec && item.spec.isWritingDesk) return true;
        return !!(item.rawState && item.rawState.presetId === 'writing-desk');
    }

    function _projectItemIcon(item) {
        return _isProjectDesk(item) ? 'fa-desktop' : 'fa-warehouse';
    }

    function _escHtmlRp(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function _furnColors(item) {
        if (item.customColor != null) {
            return { fill: _colorToSvg(item.customColor), stroke: '#64748b' };
        }
        if (_isRoomExtraCabId(item.id)) return FURN_COLORS['room-cab'];
        return FURN_COLORS[item.id] || FURN_COLORS.chair;
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

    /** Door-side edge of a cabinet whose center wing spans ±w/2 × ±d/2 around (cx,cz), rotated like Object3D.rotation.y. */
    function _cabFront(cx, cz, w, d, rotDeg, offX) {
        const th = (rotDeg || 0) * Math.PI / 180;
        const c = Math.cos(th), s = Math.sin(th);
        function tr(x, z) { return { x: cx + x * c + z * s, z: cz - x * s + z * c }; }
        const ox = offX || 0;
        return { a: tr(ox - w / 2, d / 2), b: tr(ox + w / 2, d / 2), dir: { x: s, z: c } };
    }

    function _getCabinetRect() {
        if (typeof window._roomHostRectAt !== 'function') return null;
        const r = window._roomHostRectAt();
        const item = {
            id: 'cabinet',
            minX: r.minX, maxX: r.maxX,
            minZ: r.minZ, maxZ: r.maxZ,
            draggable: true,
            label: FURN_COLORS.cabinet.label
        };
        const wing = state.wings && state.wings.center;
        if (typeof window._getRoomHostPose === 'function') {
            const pose = window._getRoomHostPose();
            const w = (wing && wing.width) || state.width || 160;
            const d = (wing && wing.depth) || state.depth || 54;
            const offX = (typeof cabinetGroup !== 'undefined' && cabinetGroup) ? (cabinetGroup.position.x || 0) : 0;
            item.front = _cabFront(pose.x, pose.z, w, d, pose.rotation, offX);
        }
        return item;
    }

    function _getBedRect() {
        if (window._bedVisible === false) return null;
        const usePos = _is2dPlan() || window._roomPlanDrag;
        if (!usePos && window._bedMesh) {
            const box = _meshRoomBox(window._bedMesh);
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
        if (!cp && typeof _getChairPos === 'function') {
            // Automatic spot is desk-relative (scene frame) → room coordinates
            const auto = _getChairPos();
            if (auto) {
                const rp = typeof window._worldToRoomXZ === 'function' ? window._worldToRoomXZ(auto.x, auto.z) : auto;
                cp = { x: rp.x, z: rp.z };
            }
        }
        if (!cp) return null;

        const usePos = _is2dPlan() || window._roomPlanDrag;
        if (!usePos && window._chairMesh) {
            const box = _meshRoomBox(window._chairMesh);
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
            return _makeFurnItem('cabinet-desk', _toRoomRect(minX, maxX, -cabD / 2, cabD / 2 + 20), false);
        }

        const cols = wing.columns || [];
        let curX = cabOffX - cabW / 2;
        for (let i = 0; i < cols.length; i++) {
            const col = cols[i];
            if (col.type === 'desk') {
                return _makeFurnItem('cabinet-desk', _toRoomRect(curX, curX + col.width, -cabD / 2, cabD / 2 + 20), false);
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

    function _getCustomItemRects() {
        return (window._customRoomItems || []).map(function(item) {
            const rect = _rectFromCenter(item.x, item.z, item.w / 2, item.d / 2, item.rotation || 0);
            return _makeFurnItem(item.id, rect, true, item.name, { customColor: item.color });
        });
    }

    function _findCustomItem(id) {
        return (window._customRoomItems || []).find(function(item) { return item.id === id; }) || null;
    }

    function _getRoomExtraCabinetRects() {
        if (typeof window._pruneRoomExtraCabinets === 'function') window._pruneRoomExtraCabinets();
        return (window._roomExtraCabinets || []).map(function(prop) {
            const item = state.orderCart && state.orderCart[prop.cartIndex];
            const dims = typeof window._getCartCabinetDims === 'function'
                ? window._getCartCabinetDims(item)
                : { w: 160, d: 54 };
            const rect = _rectFromCenter(prop.x || 0, prop.z || 0, dims.w / 2, dims.d / 2, prop.rotation || 0);
            const label = typeof window._getCartCabinetLabel === 'function'
                ? window._getCartCabinetLabel(item, prop.cartIndex)
                : ('ארון ' + ((prop.cartIndex || 0) + 1));
            return _makeFurnItem(prop.id, rect, true, label, {
                isRoomExtraCab: true,
                cartIndex: prop.cartIndex,
                halfW: dims.w / 2,
                halfD: dims.d / 2,
                front: _cabFront(prop.x || 0, prop.z || 0, dims.w, dims.d, prop.rotation || 0)
            });
        });
    }

    function _wallNormal(wall) {
        if (typeof window._roomWallNormal === 'function') return window._roomWallNormal(wall);
        return { x: 0, z: -1 };
    }

    /** Grab rect for an opening centered on a wall (pad cm on both sides of the wall line). */
    function _wallOpeningRect(wall, cx, cz, width, pad) {
        const half = width / 2;
        if (wall === 'front' || wall === 'back') {
            return { minX: cx - half, maxX: cx + half, minZ: cz - pad, maxZ: cz + pad };
        }
        return { minX: cx - pad, maxX: cx + pad, minZ: cz - half, maxZ: cz + half };
    }

    function _getRoomDoorRect() {
        const b = _getBounds();
        if (!b || typeof window._getRoomDoorPose !== 'function') return null;
        const pose = window._getRoomDoorPose(b);
        if (!pose) return null;
        return _makeFurnItem('room-door', _wallOpeningRect(pose.wall, pose.cx, pose.cz, pose.width, 14), true, 'דלת', {
            doorWall: pose.wall, doorCx: pose.cx, doorCz: pose.cz, doorW: pose.width,
            doorHinge: pose.hinge, doorSwing: pose.swing,
            isWallOpening: true, openWall: pose.wall
        });
    }

    function _getRoomWindowRects() {
        const b = _getBounds();
        if (!b || typeof window._getRoomWindowPoses !== 'function') return [];
        return window._getRoomWindowPoses(b).map(function(p) {
            return _makeFurnItem(p.id, _wallOpeningRect(p.wall, p.cx, p.cz, p.width, 12), true, 'חלון ' + Math.round(p.width), {
                isRoomWindow: true, isWallOpening: true, openWall: p.wall,
                winCx: p.cx, winCz: p.cz, winW: p.width, winH: p.height, winSill: p.sill
            });
        });
    }

    function _isRoomWindowId(id) {
        return String(id || '').indexOf('room-win-') === 0;
    }

    /** Small HTML buttons placed inside the room, next to a wall opening. */
    function _drawOpeningBtns(parentG, item, tf, btns) {
        const n = _wallNormal(item.openWall);
        const c = _w2s((item.minX + item.maxX) / 2, (item.minZ + item.maxZ) / 2, tf);
        const btnSize = 22, gap = 4, off = 30;
        const total = btns.length * btnSize + (btns.length - 1) * gap;
        const ox = c.x + n.x * off, oy = c.y + n.z * off;
        const alongX = Math.abs(n.z) > 0.5;
        btns.forEach(function(bd, i) {
            const shift = -total / 2 + i * (btnSize + gap);
            const x = alongX ? ox + shift : ox - btnSize / 2;
            const y = alongX ? oy - btnSize / 2 : oy + shift;
            const fo = _svgEl('foreignObject', {
                x: x, y: y, width: btnSize, height: btnSize, class: 'rp-room-cab-btn-fo'
            });
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'rp-room-cab-btn ' + (bd.cls || '');
            btn.title = bd.title;
            btn.setAttribute('data-rp-action', bd.action);
            btn.setAttribute('data-rp-open-id', item.id);
            btn.innerHTML = bd.html;
            fo.appendChild(btn);
            parentG.appendChild(fo);
        });
    }

    function _drawRoomDoor2D(g, item, tf, isActive) {
        const wall = item.doorWall || 'front';
        const cx = item.doorCx;
        const cz = item.doorCz;
        const w = item.doorW || 90;
        const half = w / 2;
        const stroke = isActive ? '#0369a1' : '#0284c7';
        const fill = isActive ? '#bfdbfe' : '#dbeafe';
        const n = _wallNormal(wall);
        const right = { x: n.z, z: -n.x }; // right-hand side seen from inside the room
        const hs = item.doorHinge === 'right' ? 1 : -1;
        const open = item.doorSwing === 'out' ? { x: -n.x, z: -n.z } : n;

        const hingeW = { x: cx + right.x * half * hs, z: cz + right.z * half * hs };
        const closedW = { x: cx - right.x * half * hs, z: cz - right.z * half * hs };
        const hinge = _w2s(hingeW.x, hingeW.z, tf);
        const closedTip = _w2s(closedW.x, closedW.z, tf);
        const openTip = _w2s(hingeW.x + open.x * w, hingeW.z + open.z * w, tf);
        if (!(Math.hypot(closedTip.x - hinge.x, closedTip.y - hinge.y) > 1)) return;

        g.appendChild(_svgEl('line', {
            x1: hinge.x, y1: hinge.y, x2: closedTip.x, y2: closedTip.y,
            stroke: stroke, 'stroke-width': isActive ? '5' : '4',
            'stroke-linecap': 'square'
        }));

        g.appendChild(_svgEl('line', {
            x1: hinge.x, y1: hinge.y, x2: openTip.x, y2: openTip.y,
            stroke: '#1d4ed8', 'stroke-width': '2.2'
        }));

        // Quarter-circle swing sampled in world space (closed → open)
        const ux = closedW.x - hingeW.x, uz = closedW.z - hingeW.z;
        const vx = open.x * w, vz = open.z * w;
        let d = '';
        for (let i = 0; i <= 18; i++) {
            const a = (i / 18) * Math.PI / 2;
            const p = _w2s(hingeW.x + ux * Math.cos(a) + vx * Math.sin(a), hingeW.z + uz * Math.cos(a) + vz * Math.sin(a), tf);
            d += (i ? ' L ' : 'M ') + p.x.toFixed(2) + ' ' + p.y.toFixed(2);
        }
        g.appendChild(_svgEl('path', {
            d: d, fill: 'none', stroke: '#ef4444', 'stroke-width': '1.2', 'stroke-dasharray': '4 3'
        }));

        const p1 = _w2s(item.minX, item.minZ, tf);
        const p2 = _w2s(item.maxX, item.maxZ, tf);
        g.appendChild(_svgEl('rect', {
            x: Math.min(p1.x, p2.x), y: Math.min(p1.y, p2.y),
            width: Math.max(Math.abs(p2.x - p1.x), 1), height: Math.max(Math.abs(p2.y - p1.y), 1),
            fill: fill, stroke: 'none', opacity: '0.25', rx: '3'
        }));

        const lp = _w2s(cx - open.x * 12, cz - open.z * 12, tf);
        g.appendChild(_svgEl('text', {
            x: lp.x, y: lp.y,
            class: 'rp-furn-label', 'text-anchor': 'middle',
            'dominant-baseline': 'middle', 'font-size': '11', fill: '#0369a1'
        }, 'דלת'));

        _drawOpeningBtns(g, item, tf, [
            { action: 'door-hinge', title: 'החלף צד ציר (ימין / שמאל)', html: '<i class="fa-solid fa-arrows-left-right"></i>' },
            { action: 'door-swing', title: item.doorSwing === 'out' ? 'נפתחת החוצה — לחץ לפתיחה פנימה' : 'נפתחת פנימה — לחץ לפתיחה החוצה', html: '<i class="fa-solid fa-right-to-bracket"></i>' }
        ]);
    }

    function _drawRoomWindow2D(g, item, tf, isActive) {
        const wall = item.openWall;
        const half = (item.winW || 120) / 2;
        const along = (wall === 'front' || wall === 'back') ? { x: 1, z: 0 } : { x: 0, z: 1 };
        const n = _wallNormal(wall);
        const t = 5;
        const pts = [
            [-half, -t], [half, -t], [half, t], [-half, t]
        ].map(function(q) {
            return _w2s(item.winCx + along.x * q[0] + n.x * q[1], item.winCz + along.z * q[0] + n.z * q[1], tf);
        });
        g.appendChild(_svgEl('polygon', {
            points: pts.map(function(p) { return p.x.toFixed(2) + ',' + p.y.toFixed(2); }).join(' '),
            fill: isActive ? '#bae6fd' : '#e0f2fe', stroke: isActive ? '#0369a1' : '#0ea5e9',
            'stroke-width': isActive ? '2' : '1.5'
        }));
        const a = _w2s(item.winCx - along.x * half, item.winCz - along.z * half, tf);
        const b2 = _w2s(item.winCx + along.x * half, item.winCz + along.z * half, tf);
        g.appendChild(_svgEl('line', {
            x1: a.x, y1: a.y, x2: b2.x, y2: b2.y, stroke: isActive ? '#0369a1' : '#0ea5e9', 'stroke-width': '1.2'
        }));
        const lp = _w2s(item.winCx + n.x * 16, item.winCz + n.z * 16, tf);
        g.appendChild(_svgEl('text', {
            x: lp.x, y: lp.y, class: 'rp-furn-label', 'text-anchor': 'middle',
            'dominant-baseline': 'middle', 'font-size': '10', fill: '#0369a1'
        }, item.label));
        _drawOpeningBtns(g, item, tf, [
            { action: 'win-width', title: 'שנה רוחב חלון', html: '<i class="fa-solid fa-arrows-left-right"></i>' },
            { action: 'win-remove', title: 'הסר חלון', html: '<i class="fa-solid fa-xmark"></i>', cls: 'rp-room-cab-btn-remove' }
        ]);
    }

    /** Distances along the wall from an opening to both corners. */
    function _drawOpeningWallDims(g, item, tf, b) {
        const wall = item.openWall;
        const off = 26 / tf.scale;
        if (wall === 'front' || wall === 'back') {
            const z = wall === 'back' ? b.backZ + off : b.frontZ - off;
            if (item.minX - b.leftX > 1) _drawWorldDimH(g, b.leftX, item.minX, z, '', tf, wall === 'front');
            if (b.rightX - item.maxX > 1) _drawWorldDimH(g, item.maxX, b.rightX, z, '', tf, wall === 'front');
        } else {
            const x = wall === 'left' ? b.leftX + off : b.rightX - off;
            if (item.minZ - b.backZ > 1) _drawWorldDimV(g, x, b.backZ, item.minZ, tf, wall === 'right');
            if (b.frontZ - item.maxZ > 1) _drawWorldDimV(g, x, item.maxZ, b.frontZ, tf, wall === 'right');
        }
    }

    function _collectFurniture() {
        const items = [];
        const cab = _getCabinetRect();
        const cabDesk = _getCabinetDeskRect();
        const bed = _getBedRect();
        const chair = _getChairRect();
        const nightstand = _getNightstandRect();
        const roomDesk = _getRoomDeskRect();
        const roomDoor = _getRoomDoorRect();
        if (cab) items.push(cab);
        if (cabDesk) items.push(cabDesk);
        if (bed) items.push(bed);
        if (nightstand) items.push(nightstand);
        if (roomDesk) items.push(roomDesk);
        if (chair) items.push(chair);
        _getCustomItemRects().forEach(function(item) { items.push(item); });
        _getRoomExtraCabinetRects().forEach(function(item) { items.push(item); });
        // Wall openings last → topmost in reverse hit-test
        _getRoomWindowRects().forEach(function(item) { items.push(item); });
        if (roomDoor) items.push(roomDoor);
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
        if (id === 'cabinet') {
            const d = window._roomPlanDrag;
            if (!d || !d.startPose || typeof window._moveRoomHost !== 'function') return;
            window._moveRoomHost(d.startPose.x + (cx - d.startCx), d.startPose.z + (cz - d.startCz));
            window._roomPlanPending3D = true;
            return;
        }
        if (id === 'bed') {
            window._bedPos = _clampBedCenter(cx, cz);
        } else if (id === 'chair') {
            const cp = _clampChairCenter(cx, cz);
            let rotY;
            if (window._chairPosOverride && window._chairPosOverride.rotY !== undefined) {
                rotY = window._chairPosOverride.rotY;
            } else {
                // Automatic chair faces the desk in the cabinet frame; the override lives in room coordinates
                const auto = (typeof _getChairPos === 'function' ? _getChairPos() : null) || {};
                const hostRot = typeof window._getRoomHostPose === 'function' ? (window._getRoomHostPose().rotation || 0) : 0;
                rotY = (auto.rotY !== undefined ? auto.rotY : -Math.PI / 2) + hostRot * Math.PI / 180;
            }
            window._chairPosOverride = { x: cp.x, z: cp.z, rotY: rotY };
        } else if (id === 'nightstand') {
            const np = _clampFurnCenter(cx, cz, (window._NIGHTSTAND_W || 50) / 2, (window._NIGHTSTAND_D || 40) / 2);
            window._nightstandPos = np;
        } else if (id === 'room-desk') {
            const dp = _clampFurnCenter(cx, cz, (window._ROOM_DESK_W || 120) / 2, (window._ROOM_DESK_D || 60) / 2);
            window._roomDeskPos = dp;
        } else if (String(id).indexOf('custom-') === 0) {
            const custom = _findCustomItem(id);
            if (custom) {
                const cp = _clampFurnCenter(cx, cz, custom.w / 2, custom.d / 2);
                custom.x = cp.x;
                custom.z = cp.z;
            }
        } else if (_isRoomExtraCabId(id)) {
            const prop = typeof window._findRoomExtraCabinet === 'function'
                ? window._findRoomExtraCabinet(id)
                : null;
            if (prop) {
                const item = state.orderCart && state.orderCart[prop.cartIndex];
                const dims = typeof window._getCartCabinetDims === 'function'
                    ? window._getCartCabinetDims(item)
                    : { w: 160, d: 54 };
                const rot = prop.rotation || 0;
                const swapped = (rot % 180) !== 0;
                const halfW = (swapped ? dims.d : dims.w) / 2;
                const halfD = (swapped ? dims.w : dims.d) / 2;
                const cp = _clampFurnCenter(cx, cz, halfW, halfD);
                prop.x = cp.x;
                prop.z = cp.z;
                if (typeof window._roomLinksCommit === 'function') window._roomLinksCommit();
            }
        } else if (id === 'room-door') {
            if (typeof window._setRoomDoorFromPoint === 'function') {
                window._setRoomDoorFromPoint(cx, cz, _getBounds());
            }
        } else if (_isRoomWindowId(id)) {
            if (typeof window._setRoomWindowFromPoint === 'function') {
                window._setRoomWindowFromPoint(id, cx, cz, _getBounds());
            }
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
        wrap.appendChild(_svgEl('text', {
            x: x,
            y: bg.y + bg.h / 2,
            class: active ? 'rp-dim-text rp-dim-active' : 'rp-dim-text',
            'text-anchor': 'middle',
            'dominant-baseline': 'middle',
            direction: 'ltr'
        }, String(text)));
        g.appendChild(wrap);
    }

    function _drawBedWidthBtn(parentG, fx, fy, fw, fh) {
        if (fw < 48 || fh < 28) return;
        const widthCm = window._bedWidthCm || 160;
        const btnW = Math.min(58, Math.max(48, fw * 0.34));
        const btnH = 24;
        const bx = fx + fw - btnW - 5;
        const by = fy + 5;
        const fo = _svgEl('foreignObject', {
            x: bx, y: by, width: btnW, height: btnH,
            class: 'rp-bed-width-btn-fo'
        });
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'rp-bed-width-btn';
        btn.title = 'החלף רוחב מיטה';
        btn.setAttribute('data-rp-action', 'cycle-bed-width');
        btn.innerHTML = '<i class="fa-solid fa-arrows-left-right"></i><span>' + widthCm + '</span>';
        fo.appendChild(btn);
        parentG.appendChild(fo);
    }

    function _drawRoomExtraCabBtns(parentG, item, fx, fy, fw, fh) {
        if (fw < 40 || fh < 28) return;
        const btnSize = 22;
        const gap = 4;
        const by = fy + 4;
        const rotateX = fx + fw - btnSize * 2 - gap - 4;
        const removeX = fx + fw - btnSize - 4;

        function _addBtn(x, action, title, icon, cls) {
            const fo = _svgEl('foreignObject', {
                x: x, y: by, width: btnSize, height: btnSize,
                class: 'rp-room-cab-btn-fo'
            });
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'rp-room-cab-btn ' + (cls || '');
            btn.title = title;
            btn.setAttribute('data-rp-action', action);
            btn.setAttribute('data-rp-cab-id', item.id);
            btn.innerHTML = '<i class="fa-solid ' + icon + '"></i>';
            fo.appendChild(btn);
            parentG.appendChild(fo);
        }
        _addBtn(rotateX, 'rotate-room-cab', 'סובב 90°', 'fa-rotate-right', '');
        _addBtn(removeX, 'remove-room-cab', 'הסר מהחדר', 'fa-xmark', 'rp-room-cab-btn-remove');
    }

    /** Thick line on the door side + small outward arrow, so the facing direction is readable. */
    function _drawCabinetFront(g, front, tf, isActive) {
        const color = isActive ? '#d97706' : '#f59e0b';
        const a = _w2s(front.a.x, front.a.z, tf);
        const b = _w2s(front.b.x, front.b.z, tf);
        g.appendChild(_svgEl('line', {
            x1: a.x, y1: a.y, x2: b.x, y2: b.y,
            stroke: color, 'stroke-width': isActive ? '5' : '4', 'stroke-linecap': 'round',
            class: 'rp-cab-front'
        }));
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        if (len < 24) return;
        // Screen direction of the front normal (world z → screen y, same scale on both axes)
        const nx = front.dir.x, ny = front.dir.z;
        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        const tipLen = 11, half = 7;
        const tip = { x: mx + nx * (tipLen + 3), y: my + ny * (tipLen + 3) };
        const base = { x: mx + nx * 3, y: my + ny * 3 };
        const px = -ny, py = nx;
        g.appendChild(_svgEl('polygon', {
            points: [
                tip.x + ',' + tip.y,
                (base.x + px * half) + ',' + (base.y + py * half),
                (base.x - px * half) + ',' + (base.y - py * half)
            ].join(' '),
            fill: color, class: 'rp-cab-front'
        }));
    }

    function _drawRoomHostBtns(parentG, fx, fy, fw, fh) {
        if (fw < 26 || fh < 26) return;
        const btnSize = 22;
        const fo = _svgEl('foreignObject', {
            x: fx + fw - btnSize - 4, y: fy + 4, width: btnSize, height: btnSize,
            class: 'rp-room-cab-btn-fo'
        });
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'rp-room-cab-btn';
        btn.title = 'סובב 90°';
        btn.setAttribute('data-rp-action', 'rotate-room-host');
        btn.innerHTML = '<i class="fa-solid fa-rotate-right"></i>';
        fo.appendChild(btn);
        parentG.appendChild(fo);
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
            const colors = _furnColors(item);
            const isActive = item.id === dragId;

            const g = _svgEl('g', {
                class: 'rp-furn-item' + (item.draggable ? ' rp-draggable' : '') + (isActive ? ' rp-active' : ''),
                'data-id': item.id
            });

            if (item.id === 'room-door') {
                _drawRoomDoor2D(g, item, tf, isActive);
            } else if (item.isRoomWindow) {
                _drawRoomWindow2D(g, item, tf, isActive);
            } else {
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

                if (item.front) {
                    _drawCabinetFront(g, item.front, tf, isActive);
                }
                if (item.id === 'bed') {
                    _drawBedWidthBtn(g, fx, fy, fw, fh);
                }
                if (item.isRoomExtraCab || _isRoomExtraCabId(item.id)) {
                    _drawRoomExtraCabBtns(g, item, fx, fy, fw, fh);
                }
                if (item.id === 'cabinet') {
                    _drawRoomHostBtns(g, fx, fy, fw, fh);
                }
            }

            if (item.draggable) {
                g.style.cursor = isActive ? 'grabbing' : 'grab';
            }
            furnG.appendChild(g);
        });
        svg.appendChild(furnG);

        const itemDimsG = _svgEl('g', { class: 'rp-item-dims' });
        items.forEach(function(item) {
            if (item.isWallOpening) {
                if (item.id === dragId || item.isRoomWindow) _drawOpeningWallDims(itemDimsG, item, tf, b);
                return;
            }
            if (item.id === 'cabinet-desk') return;
            _drawItemWallDims(itemDimsG, item, tf, b, item.id === dragId);
        });
        svg.appendChild(itemDimsG);

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
            const w = item.isRoomWindow ? Math.round(item.winW) : Math.round(item.maxX - item.minX);
            const d = item.isRoomWindow ? Math.round(item.winH) : Math.round(item.maxZ - item.minZ);
            const row = document.createElement('div');
            row.className = 'room-plan-furn-row';
            const isExtraCab = item.isRoomExtraCab || _isRoomExtraCabId(item.id);
            const icon = item.id === 'bed' ? 'fa-bed'
                : item.id === 'chair' ? 'fa-chair'
                : item.id === 'nightstand' ? 'fa-table-cells'
                : item.id === 'room-desk' ? 'fa-desktop'
                : item.id === 'cabinet-desk' ? 'fa-laptop'
                : item.id === 'room-door' ? 'fa-door-open'
                : item.isRoomWindow ? 'fa-border-all'
                : String(item.id).indexOf('custom-') === 0 ? 'fa-cube'
                : isExtraCab ? _projectItemIcon(state.orderCart && state.orderCart[item.cartIndex])
                : item.id === 'cabinet' ? 'fa-door-closed'
                : 'fa-cube';
            row.innerHTML =
                '<i class="fa-solid ' + icon + '"></i>' +
                '<span class="room-plan-furn-name">' + (item.label || item.id) + '</span>' +
                '<span class="room-plan-furn-dim">' + w + '×' + d + '</span>';
            if (item.isRoomWindow) {
                const rmWin = document.createElement('button');
                rmWin.type = 'button';
                rmWin.className = 'rpc-remove-btn';
                rmWin.title = 'הסר חלון';
                rmWin.innerHTML = '<i class="fa-solid fa-xmark"></i>';
                rmWin.addEventListener('click', function(e) {
                    e.preventDefault();
                    e.stopPropagation();
                    if (typeof window._removeRoomWindow === 'function') window._removeRoomWindow(item.id);
                });
                row.appendChild(rmWin);
            }
            if (isExtraCab) {
                const rm = document.createElement('button');
                rm.type = 'button';
                rm.className = 'rpc-remove-btn';
                rm.title = 'הסר מהחדר';
                rm.innerHTML = '<i class="fa-solid fa-xmark"></i>';
                rm.addEventListener('click', function(e) {
                    e.preventDefault();
                    e.stopPropagation();
                    if (typeof window._removeRoomExtraCabinet === 'function') {
                        window._removeRoomExtraCabinet(item.id);
                    }
                });
                row.appendChild(rm);
            }
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
            _ensureRoomOn3dSwitch();
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

    window._openCustomRoomItemModal = function() {
        const modal = document.getElementById('custom-room-item-modal');
        if (!modal) return;
        const nameEl = document.getElementById('cri-name');
        const wEl = document.getElementById('cri-width');
        const dEl = document.getElementById('cri-depth');
        const hEl = document.getElementById('cri-height');
        if (nameEl) nameEl.value = '';
        if (wEl) wEl.value = '80';
        if (dEl) dEl.value = '60';
        if (hEl) hEl.value = '75';
        modal.classList.add('open');
        if (nameEl) setTimeout(function() { nameEl.focus(); }, 50);
    };

    window._closeCustomRoomItemModal = function() {
        const modal = document.getElementById('custom-room-item-modal');
        if (modal) modal.classList.remove('open');
    };

    window._submitCustomRoomItem = function() {
        const nameEl = document.getElementById('cri-name');
        const wEl = document.getElementById('cri-width');
        const dEl = document.getElementById('cri-depth');
        const hEl = document.getElementById('cri-height');
        if (typeof window._addCustomRoomItem !== 'function') return;
        window._addCustomRoomItem({
            name: nameEl ? nameEl.value : 'פריט',
            w: wEl ? wEl.value : 80,
            d: dEl ? dEl.value : 60,
            h: hEl ? hEl.value : 75
        });
    };

    window._closeRoomProjectCabinetPicker = function() {
        const modal = document.getElementById('room-project-cab-modal');
        if (modal) {
            modal.classList.remove('open');
            modal.setAttribute('aria-hidden', 'true');
        }
    };

    window._populateRoomProjectCabinetPicker = function() {
        const list = document.getElementById('room-project-cab-list');
        const empty = document.getElementById('room-project-cab-empty');
        if (!list) return;
        list.innerHTML = '';
        const cart = state.orderCart || [];
        const added = {};
        if (typeof window._pruneRoomExtraCabinets === 'function') window._pruneRoomExtraCabinets();
        (window._roomExtraCabinets || []).forEach(function(p) {
            if (p && typeof p.cartIndex === 'number') added[p.cartIndex] = true;
        });
        const activeIdx = (typeof state.editingCartIndex === 'number') ? state.editingCartIndex : -1;
        let shown = 0;
        cart.forEach(function(item, index) {
            if (!item) return;
            shown++;
            const dims = typeof window._getCartCabinetDims === 'function'
                ? window._getCartCabinetDims(item)
                : { w: 160, d: 54, h: 240 };
            const label = typeof window._getCartCabinetLabel === 'function'
                ? window._getCartCabinetLabel(item, index)
                : ('ארון ' + (index + 1));
            const isActive = index === activeIdx;
            const isAdded = !!added[index];
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'rpc-item' + (isAdded ? ' added' : '');
            btn.disabled = isAdded || isActive;
            let badge = '';
            if (isActive) badge = '<span class="rpc-item-badge">פתוח עכשיו</span>';
            else if (isAdded) badge = '<span class="rpc-item-badge">כבר בחדר</span>';
            const kind = _isProjectDesk(item) ? 'שולחן' : 'ארון';
            btn.innerHTML =
                '<span class="rpc-item-icon"><i class="fa-solid ' + _projectItemIcon(item) + '"></i></span>' +
                '<span class="rpc-item-info">' +
                    '<span class="rpc-item-title">' + _escHtmlRp(label) + ' <small style="opacity:.6;font-weight:500;">· ' + kind + '</small></span>' +
                    '<span class="rpc-item-dims">' +
                        Math.round(dims.w) + '×' + Math.round(dims.d) + '×' + Math.round(dims.h) + ' ס״מ' +
                    '</span>' +
                '</span>' + badge;
            if (!btn.disabled) {
                btn.addEventListener('click', function() {
                    if (typeof window._addRoomExtraCabinetFromCart === 'function') {
                        window._addRoomExtraCabinetFromCart(index);
                    }
                    window._populateRoomProjectCabinetPicker();
                    window._closeRoomProjectCabinetPicker();
                });
            }
            list.appendChild(btn);
        });
        if (empty) empty.style.display = shown ? 'none' : '';
    };

    window._openRoomProjectCabinetPicker = function() {
        const modal = document.getElementById('room-project-cab-modal');
        if (!modal) return;
        window._populateRoomProjectCabinetPicker();
        modal.classList.add('open');
        modal.setAttribute('aria-hidden', 'false');
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
            const actionBtn = e.target.closest('[data-rp-action]');
            if (actionBtn) {
                e.preventDefault();
                e.stopPropagation();
                const action = actionBtn.getAttribute('data-rp-action');
                if (action === 'cycle-bed-width' && typeof window._cycleBedWidth === 'function') {
                    window._cycleBedWidth();
                } else if (action === 'rotate-room-cab') {
                    const cabId = actionBtn.getAttribute('data-rp-cab-id');
                    if (cabId && typeof window._rotateRoomExtraCabinet === 'function') {
                        window._rotateRoomExtraCabinet(cabId);
                    }
                } else if (action === 'remove-room-cab') {
                    const cabId = actionBtn.getAttribute('data-rp-cab-id');
                    if (cabId && typeof window._removeRoomExtraCabinet === 'function') {
                        window._removeRoomExtraCabinet(cabId);
                    }
                } else if (action === 'rotate-room-host' && typeof window._rotateRoomHost === 'function') {
                    window._rotateRoomHost();
                } else if (action === 'door-hinge' && typeof window._toggleRoomDoorHinge === 'function') {
                    window._toggleRoomDoorHinge();
                } else if (action === 'door-swing' && typeof window._toggleRoomDoorSwing === 'function') {
                    window._toggleRoomDoorSwing();
                } else if (action === 'win-width' || action === 'win-remove') {
                    const winId = actionBtn.getAttribute('data-rp-open-id');
                    if (winId && action === 'win-width' && typeof window._cycleRoomWindowWidth === 'function') {
                        window._cycleRoomWindowWidth(winId);
                    } else if (winId && action === 'win-remove' && typeof window._removeRoomWindow === 'function') {
                        window._removeRoomWindow(winId);
                    }
                }
                return;
            }
            const rect = svg.getBoundingClientRect();
            const sx = e.clientX - rect.left;
            const sy = e.clientY - rect.top;
            const hit = _hitTestFurn(sx, sy);
            if (!hit) return;
            e.preventDefault();
            e.stopPropagation();
            const center = _rectCenter(hit);
            const drag = {
                id: hit.id,
                startX: sx, startY: sy,
                startCx: center.x, startCz: center.z,
                pointerId: e.pointerId
            };
            if (hit.id === 'cabinet') {
                if (typeof window._getRoomHostPose !== 'function') return;
                drag.startPose = window._getRoomHostPose();
            }
            window._roomPlanDrag = drag;
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
            const wasDoor = d.id === 'room-door' || _isRoomWindowId(d.id);
            window._roomPlanDrag = null;
            document.body.classList.remove('room-plan-dragging');
            if (wasDoor && window._roomPlanPending3D && typeof window._syncRoomPlanTo3D === 'function') {
                window._syncRoomPlanTo3D();
            }
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

        const customModal = document.getElementById('custom-room-item-modal');
        if (customModal) {
            customModal.addEventListener('click', function(e) {
                if (e.target === customModal) window._closeCustomRoomItemModal();
            });
        }
        document.addEventListener('keydown', function(e) {
            if (e.key !== 'Escape') return;
            window._closeCustomRoomItemModal();
            if (typeof window._closeRoomProjectCabinetPicker === 'function') {
                window._closeRoomProjectCabinetPicker();
            }
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', _bindRoomPlanEvents);
    } else {
        _bindRoomPlanEvents();
    }
})();
