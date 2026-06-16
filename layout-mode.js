// ==========================================
// Layout Mode — compare two linear cabinets in shared 3D space
// ==========================================

(function() {
    var _layoutGroup = null;
    var _editorSnapshot = null;
    var _layoutScene = null;
    var _pickSelection = [];
    var LAYOUT_MOVE_STEP = 5;
    var LAYOUT_SNAP_CM = 8;
    var LAYOUT_GIZMO_ARROW = 48;
    var LAYOUT_GIZMO_HIT = 22;
    var LAYOUT_GIZMO_SCREEN_PX = 32;
    var LAYOUT_VERSION = '20260609q';
    var _layoutPickHits = [];
    var _layoutDragBound = false;
    var _layoutCanvas = null;
    var _layoutRaycaster = new THREE.Raycaster();
    var _layoutMouse = new THREE.Vector2();
    var _layoutDragPlane = new THREE.Plane();
    var _layoutDragIntersect = new THREE.Vector3();
    var _layoutDragState = null;
    var _layoutGizmoGroup = null;
    var _layoutTranslateGroup = null;
    var _layoutRotateGroup = null;
    var _layoutGizmoHandles = [];
    var _layoutGizmoHover = null;
    var _layoutGizmoTool = 'move';

    function _layoutDbg() {
        if (!window._layoutDebug) return;
        var args = ['[layout]'].concat(Array.prototype.slice.call(arguments));
        console.log.apply(console, args);
    }

    function _layoutLog() {
        var args = ['[layout]'].concat(Array.prototype.slice.call(arguments));
        console.log.apply(console, args);
    }

    function _suppressEditorOverlays(hide) {
        ['dimensions-layer', 'buttons-layer', 'drag-handles-layer', 'col-widths-layer'].forEach(function(id) {
            var el = document.getElementById(id);
            if (!el) return;
            if (hide) {
                el.style.opacity = '0';
                el.style.visibility = 'hidden';
                el.style.pointerEvents = 'none';
            } else {
                el.style.opacity = '';
                el.style.visibility = '';
                el.style.pointerEvents = '';
            }
        });
        if (hide && typeof state !== 'undefined') {
            state.hoveredColIndex = -1;
            state.hoveredDesk = false;
            var dragLayer = document.getElementById('drag-handles-layer');
            if (dragLayer) dragLayer.innerHTML = '';
        }
    }
    var _layoutTmpV3a = new THREE.Vector3();
    var _layoutTmpV3b = new THREE.Vector3();
    var _layoutTmpV3c = new THREE.Vector3();

    function _slotDefaults(cartIndex) {
        return { cartIndex: cartIndex, x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0 };
    }

    function _computeLayoutBounds() {
        if (!_layoutScene) return { minX: -100, maxX: 100, maxH: 240, maxD: 54 };
        var minX = Infinity;
        var maxX = -Infinity;
        var maxH = 0;
        var maxD = 0;

        _layoutScene.slots.forEach(function(slot) {
            var rs = state.orderCart[slot.cartIndex].rawState;
            var w = _linearWidth(rs);
            var h = _linearHeight(rs);
            var d = _linearDepth(rs);
            var y = slot.y || 0;
            minX = Math.min(minX, slot.x - w / 2);
            maxX = Math.max(maxX, slot.x + w / 2);
            maxH = Math.max(maxH, y + h);
            maxD = Math.max(maxD, d);
        });

        if (!isFinite(minX)) minX = -100;
        if (!isFinite(maxX)) maxX = 100;
        return { minX: minX, maxX: maxX, maxH: maxH, maxD: maxD };
    }

    var LAYOUT_ROOM_MARGIN = 90;

    function _applySlotTransforms(updateRoom) {
        if (!_layoutGroup || !_layoutScene) return;
        _clampAllSlotsToGround();
        _layoutScene.slots.forEach(function(slot, i) {
            var g = _layoutGroup.getObjectByName('layout-slot-' + i);
            if (!g) return;
            g.position.set(slot.x || 0, slot.y || 0, slot.z || 0);
            g.rotation.set(slot.rotX || 0, slot.rotY || 0, slot.rotZ || 0);
        });
        if (updateRoom) _syncLayoutRoom(true);
        _updateLayoutGizmo();
    }

    function _syncLayoutRoom(allowExpand) {
        if (!_layoutScene) return;
        var b = _computeLayoutBounds();
        if (!_layoutScene.roomSpec) {
            _layoutScene.roomSpec = {
                leftWallX: b.minX - LAYOUT_ROOM_MARGIN,
                rightWallX: b.maxX + LAYOUT_ROOM_MARGIN,
                roomH: b.maxH + 100,
                roomD: Math.max(b.maxD + LAYOUT_ROOM_MARGIN * 2, 420),
                backZ: -(Math.max(b.maxD, 54) / 2) - 1
            };
            _renderLayoutRoom(_layoutScene.roomSpec);
            _layoutDbg('room init', _layoutScene.roomSpec);
            return;
        }
        if (!allowExpand) return;
        var s = _layoutScene.roomSpec;
        var changed = false;
        if (b.minX - LAYOUT_ROOM_MARGIN < s.leftWallX) {
            s.leftWallX = b.minX - LAYOUT_ROOM_MARGIN;
            changed = true;
        }
        if (b.maxX + LAYOUT_ROOM_MARGIN > s.rightWallX) {
            s.rightWallX = b.maxX + LAYOUT_ROOM_MARGIN;
            changed = true;
        }
        if (b.maxH + 100 > s.roomH) {
            s.roomH = b.maxH + 100;
            changed = true;
        }
        var neededD = Math.max(b.maxD + LAYOUT_ROOM_MARGIN * 2, 420);
        if (neededD > s.roomD) {
            s.roomD = neededD;
            changed = true;
        }
        if (changed) {
            _renderLayoutRoom(s);
            _layoutDbg('room expand', s);
        }
    }

    function _syncActiveLayoutChip() {
        if (!_layoutScene) return;
        [0, 1].forEach(function(i) {
            var chip = document.getElementById('layout-chip-' + i);
            if (!chip) return;
            chip.classList.toggle('active', _layoutScene.activeSlot === i);
        });
    }

    function _clampSlotToGround(slot) {
        if (!slot) return;
        slot.y = Math.max(0, slot.y || 0);
    }

    function _clampAllSlotsToGround() {
        if (!_layoutScene) return;
        _layoutScene.slots.forEach(_clampSlotToGround);
    }

    function _obb2FromSlot(slot) {
        var rs = state.orderCart[slot.cartIndex].rawState;
        var hw = _linearWidth(rs) / 2;
        var hd = _linearDepth(rs) / 2;
        var rot = slot.rotY || 0;
        var c = Math.cos(rot);
        var s = Math.sin(rot);
        return {
            cx: slot.x || 0,
            cz: slot.z || 0,
            ux: c,
            uz: s,
            vx: -s,
            vz: c,
            hw: hw,
            hd: hd
        };
    }

    function _projectObbRadius(obb, ax, az) {
        return obb.hw * Math.abs(obb.ux * ax + obb.uz * az) +
            obb.hd * Math.abs(obb.vx * ax + obb.vz * az);
    }

    function _obb2OverlapDepth(a, b) {
        var tests = [
            { ax: a.ux, az: a.uz, ra: a.hw, rb: _projectObbRadius(b, a.ux, a.uz) },
            { ax: a.vx, az: a.vz, ra: a.hd, rb: _projectObbRadius(b, a.vx, a.vz) },
            { ax: b.ux, az: b.uz, ra: _projectObbRadius(a, b.ux, b.uz), rb: b.hw },
            { ax: b.vx, az: b.vz, ra: _projectObbRadius(a, b.vx, b.vz), rb: b.hd }
        ];
        var minOverlap = Infinity;
        var minAxis = null;
        for (var i = 0; i < tests.length; i++) {
            var t = tests[i];
            var dist = Math.abs((b.cx - a.cx) * t.ax + (b.cz - a.cz) * t.az);
            var overlap = t.ra + t.rb - dist;
            if (overlap <= 0) return null;
            if (overlap < minOverlap) {
                minOverlap = overlap;
                minAxis = t;
            }
        }
        var sign = ((b.cx - a.cx) * minAxis.ax + (b.cz - a.cz) * minAxis.az) >= 0 ? 1 : -1;
        return { depth: minOverlap, ax: minAxis.ax * sign, az: minAxis.az * sign };
    }

    function _aabbFromSlot(slot) {
        var obb = _obb2FromSlot(slot);
        var hx = obb.hw * Math.abs(obb.ux) + obb.hd * Math.abs(obb.vx);
        var hz = obb.hw * Math.abs(obb.uz) + obb.hd * Math.abs(obb.vz);
        return {
            minX: obb.cx - hx,
            maxX: obb.cx + hx,
            minZ: obb.cz - hz,
            maxZ: obb.cz + hz,
            cx: obb.cx,
            cz: obb.cz
        };
    }

    function _rangesOverlap(minA, maxA, minB, maxB, pad) {
        pad = pad || 0;
        return (maxA + pad) >= minB && (maxB + pad) >= minA;
    }

    function _resolveSlotOverlap(slotIdx) {
        if (!_layoutScene) return;
        var active = _layoutScene.slots[slotIdx];
        if (!active) return;
        for (var pass = 0; pass < 4; pass++) {
            var moved = false;
            for (var i = 0; i < _layoutScene.slots.length; i++) {
                if (i === slotIdx) continue;
                var depth = _obb2OverlapDepth(_obb2FromSlot(active), _obb2FromSlot(_layoutScene.slots[i]));
                if (!depth) continue;
                active.x += depth.ax * (depth.depth + 0.25);
                active.z += depth.az * (depth.depth + 0.25);
                moved = true;
            }
            if (!moved) break;
        }
    }

    function _applyFaceSnap(slotIdx) {
        if (!_layoutScene) return;
        var active = _layoutScene.slots[slotIdx];
        if (!active) return;
        var a = _aabbFromSlot(active);
        for (var i = 0; i < _layoutScene.slots.length; i++) {
            if (i === slotIdx) continue;
            var other = _layoutScene.slots[i];
            var b = _aabbFromSlot(other);

            if (_rangesOverlap(a.minZ, a.maxZ, b.minZ, b.maxZ, LAYOUT_SNAP_CM)) {
                var gapR = b.minX - a.maxX;
                if (gapR >= 0 && gapR <= LAYOUT_SNAP_CM) active.x += gapR;
                var gapL = a.minX - b.maxX;
                if (gapL >= 0 && gapL <= LAYOUT_SNAP_CM) active.x -= gapL;
            }
            if (_rangesOverlap(a.minX, a.maxX, b.minX, b.maxX, LAYOUT_SNAP_CM)) {
                var gapF = b.minZ - a.maxZ;
                if (gapF >= 0 && gapF <= LAYOUT_SNAP_CM) active.z += gapF;
                var gapB = a.minZ - b.maxZ;
                if (gapB >= 0 && gapB <= LAYOUT_SNAP_CM) active.z -= gapB;
            }

            a = _aabbFromSlot(active);
            var touchingX = _rangesOverlap(a.minX, a.maxX, b.minX, b.maxX, 1.5);
            var touchingZ = _rangesOverlap(a.minZ, a.maxZ, b.minZ, b.maxZ, 1.5);
            if (touchingX && Math.abs(active.z - other.z) <= LAYOUT_SNAP_CM) active.z = other.z;
            if (touchingZ && Math.abs(active.x - other.x) <= LAYOUT_SNAP_CM) active.x = other.x;
        }
    }

    function _applySnapAndResolve(slotIdx) {
        var slot = _layoutScene && _layoutScene.slots[slotIdx];
        if (slot && Math.abs(slot.rotX || 0) < 0.02 && Math.abs(slot.rotZ || 0) < 0.02) {
            _applyFaceSnap(slotIdx);
        }
        _resolveSlotOverlap(slotIdx);
        _clampSlotToGround(_layoutScene.slots[slotIdx]);
    }

    function _applyDragConstraints(slotIdx, withSnap) {
        if (withSnap) {
            _applySnapAndResolve(slotIdx);
        } else {
            _clampSlotToGround(_layoutScene.slots[slotIdx]);
        }
    }

    function _layoutIneligibleReason(rawState) {
        var rs = rawState || {};
        var preset = rs.presetId || 'linear';
        if (preset === 'sliding') return 'ארון הזזה';
        if (preset !== 'linear') return 'סוג ארון לא נתמך';
        if (rs.wings && (rs.wings.left || rs.wings.right)) return 'ארון פינה / מרחב';
        return '';
    }

    function _cabLabel(index) {
        var item = state.orderCart[index];
        if (!item) return 'ארון ' + (index + 1);
        return (item.spec && item.spec.customName) || ('ארון ' + (index + 1));
    }

    function _cabDims(index) {
        var item = state.orderCart[index];
        if (!item || !item.spec) return '';
        return item.spec.dimsStr || '';
    }

    function _cabThumb(index) {
        var item = state.orderCart[index];
        if (!item || !item.spec) return null;
        return item.spec.imgDoors || item.spec.imgOpen || null;
    }

    window._isLayoutEligibleCabinet = function(index) {
        var item = state.orderCart[index];
        if (!item || !item.rawState) return false;
        return !_layoutIneligibleReason(item.rawState);
    };

    function _linearWidth(rawState) {
        var rs = rawState || {};
        if (rs.wings && rs.wings.center && rs.wings.center.width) return rs.wings.center.width;
        return rs.width || 160;
    }

    function _linearHeight(rawState) {
        var rs = rawState || {};
        if (rs.wings && rs.wings.center) {
            var w = rs.wings.center;
            if (w.columns && w.columns.length) {
                return Math.max.apply(null, w.columns.map(function(c) { return c.height || w.globalHeight || 240; }));
            }
            return w.globalHeight || 240;
        }
        return rs.globalHeight || 240;
    }

    function _linearDepth(rawState) {
        var rs = rawState || {};
        if (rs.wings && rs.wings.center && rs.wings.center.depth) return rs.wings.center.depth;
        return rs.depth || 54;
    }

    function _applyLinearSnapshot(rawState) {
        window._applyRawStateForCapture(rawState);
        window._roomWall = 'center';
        state.roomWall = 'center';
        window._closureEnabled = false;
        state.wings.left = null;
        state.wings.right = null;
        state.presetId = 'linear';
        state.wingEditMode = false;
        state.viewMode = '3d';
    }

    function _ensureLayoutGroup() {
        if (!_layoutGroup) {
            _layoutGroup = new THREE.Group();
            _layoutGroup.name = 'layoutGroup';
            window.scene.add(_layoutGroup);
        }
        return _layoutGroup;
    }

    function _clearLayoutGroup() {
        if (!_layoutGroup) return;
        while (_layoutGroup.children.length > 0) _layoutGroup.remove(_layoutGroup.children[0]);
        _layoutPickHits = [];
    }

    function _addLayoutPickHit(slotGroup, slotIndex, rawState) {
        var w = _linearWidth(rawState);
        var h = _linearHeight(rawState);
        var d = _linearDepth(rawState);
        var geo = new THREE.BoxGeometry(w, h, d);
        var mat = new THREE.MeshBasicMaterial({
            visible: false,
            transparent: true,
            opacity: 0,
            depthWrite: false
        });
        var hit = new THREE.Mesh(geo, mat);
        hit.position.y = h / 2;
        hit.userData.layoutSlotIndex = slotIndex;
        hit.name = 'layout-pick-hit';
        slotGroup.add(hit);
        _layoutPickHits.push(hit);
    }

    function _layoutPointerNDC(e) {
        var rect = _layoutCanvas.getBoundingClientRect();
        _layoutMouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        _layoutMouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    }

    function _layoutRaycastAll(objects, recursiveRoot) {
        if (!window.camera) return [];
        _layoutRaycaster.setFromCamera(_layoutMouse, window.camera);
        _layoutRaycaster.params.Line.threshold = 10;
        _layoutRaycaster.params.Points.threshold = 10;
        if (_layoutGizmoGroup) _layoutGizmoGroup.updateMatrixWorld(true);
        if (recursiveRoot) {
            return _layoutRaycaster.intersectObject(recursiveRoot, true);
        }
        if (!objects || !objects.length) return [];
        return _layoutRaycaster.intersectObjects(objects, false);
    }

    function _layoutGizmoModeFromHit(obj) {
        var o = obj;
        var guard = 0;
        while (o && guard++ < 8) {
            if (o.userData && o.userData.gizmoMode) return o.userData.gizmoMode;
            o = o.parent;
        }
        return null;
    }

    function _layoutPickSlotIndex(e) {
        _layoutPointerNDC(e);
        var hits = _layoutRaycastAll(_layoutPickHits);
        if (!hits.length) return -1;
        return hits[0].object.userData.layoutSlotIndex;
    }

    function _layoutPickGizmo(e) {
        if (!_layoutGizmoGroup || !_layoutGizmoGroup.visible) return null;
        _layoutPointerNDC(e);
        var hits = _layoutRaycastAll(_layoutGizmoHandles, null);
        if (!hits.length) hits = _layoutRaycastAll(null, _layoutGizmoGroup);
        for (var i = 0; i < hits.length; i++) {
            var mode = _layoutGizmoModeFromHit(hits[i].object);
            if (mode && _layoutIsGizmoModeActive(mode)) {
                _layoutDbg('pick gizmo ray', mode, 'dist', hits[i].distance.toFixed(1));
                return mode;
            }
        }
        return _layoutPickGizmoScreen(e);
    }

    function _layoutPointerInCanvas(e) {
        if (!_layoutCanvas) return false;
        if (!_layoutCanvas.contains(e.target)) return false;
        if (e.target.closest('#layout-mode-bar') || e.target.closest('#layout-picker-modal')) return false;
        if (e.target.closest('#bed-toolbar') || e.target.closest('#room-furniture-toolbar')) return false;
        return true;
    }

    function _layoutIsGizmoModeActive(mode) {
        if (_layoutGizmoTool === 'move') {
            return mode === 'axis-x' || mode === 'axis-y' || mode === 'axis-z' || mode === 'plane-xz';
        }
        return mode === 'rotate-x' || mode === 'rotate-y' || mode === 'rotate-z';
    }

    function _layoutPointerClient(e) {
        return { x: e.clientX, y: e.clientY };
    }

    function _layoutProjectWorldToClient(v3) {
        var rect = _layoutCanvas.getBoundingClientRect();
        var p = v3.clone().project(window.camera);
        return {
            x: rect.left + (p.x * 0.5 + 0.5) * rect.width,
            y: rect.top + (-p.y * 0.5 + 0.5) * rect.height
        };
    }

    function _layoutDistPointToSeg(px, py, ax, ay, bx, by) {
        var dx = bx - ax;
        var dy = by - ay;
        var lenSq = dx * dx + dy * dy;
        if (lenSq < 1e-6) {
            dx = px - ax;
            dy = py - ay;
            return Math.sqrt(dx * dx + dy * dy);
        }
        var t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
        dx = px - (ax + t * dx);
        dy = py - (ay + t * dy);
        return Math.sqrt(dx * dx + dy * dy);
    }

    function _layoutPickGizmoScreen(e) {
        if (!_layoutGizmoGroup || !_layoutGizmoGroup.visible || !_layoutScene) return null;
        var slot = _layoutScene.slots[_layoutScene.activeSlot];
        if (!slot || !window.camera) return null;

        var center = _layoutGizmoCenter(slot, _layoutScene.activeSlot);
        var c = _layoutProjectWorldToClient(center);
        var mx = e.clientX;
        var my = e.clientY;
        var bestMode = null;
        var bestDist = LAYOUT_GIZMO_SCREEN_PX;

        if (_layoutGizmoTool === 'move') {
            var axes = [
                { mode: 'axis-x', dir: _layoutWorldAxis('axis-x', slot.rotY) },
                { mode: 'axis-y', dir: _layoutWorldAxis('axis-y', slot.rotY) },
                { mode: 'axis-z', dir: _layoutWorldAxis('axis-z', slot.rotY) }
            ];
            axes.forEach(function(a) {
                var end = center.clone().add(a.dir.clone().multiplyScalar(LAYOUT_GIZMO_ARROW * _layoutGizmoScreenScale(center)));
                var ep = _layoutProjectWorldToClient(end);
                var d = _layoutDistPointToSeg(mx, my, c.x, c.y, ep.x, ep.y);
                if (d < bestDist) {
                    bestDist = d;
                    bestMode = a.mode;
                }
            });
            var dc = Math.sqrt((mx - c.x) * (mx - c.x) + (my - c.y) * (my - c.y));
            if (dc < bestDist) bestMode = 'plane-xz';
        } else {
            var ringR = 42 * _layoutGizmoScreenScale(center);
            var rings = [
                { mode: 'rotate-x', dir: _layoutWorldAxis('axis-x', slot.rotY) },
                { mode: 'rotate-y', dir: new THREE.Vector3(0, 1, 0) },
                { mode: 'rotate-z', dir: _layoutWorldAxis('axis-z', slot.rotY) }
            ];
            rings.forEach(function(r) {
                var p1 = center.clone().add(new THREE.Vector3(-r.dir.z, 0, r.dir.x).multiplyScalar(ringR));
                var p2 = center.clone().add(new THREE.Vector3(r.dir.z, 0, -r.dir.x).multiplyScalar(ringR));
                var s1 = _layoutProjectWorldToClient(p1);
                var s2 = _layoutProjectWorldToClient(p2);
                var d = _layoutDistPointToSeg(mx, my, s1.x, s1.y, s2.x, s2.y);
                if (d < bestDist) {
                    bestDist = d;
                    bestMode = r.mode;
                }
            });
        }

        if (bestMode && _layoutIsGizmoModeActive(bestMode)) {
            _layoutDbg('pick gizmo screen', bestMode, 'px', bestDist.toFixed(1));
            return bestMode;
        }
        return null;
    }

    function _layoutSetDragPlane(normal, point) {
        _layoutDragPlane.setFromNormalAndCoplanarPoint(normal, point);
    }

    function _layoutRayOnDragPlane() {
        if (_layoutRaycaster.ray.intersectPlane(_layoutDragPlane, _layoutDragIntersect)) {
            return _layoutDragIntersect.clone();
        }
        return null;
    }

    function _layoutDragPlaneNormal(axis, origin) {
        var camDir = _layoutTmpV3c.copy(window.camera.position).sub(origin).normalize();
        var n = _layoutTmpV3b.copy(axis).cross(camDir);
        if (n.lengthSq() < 1e-5) n.crossVectors(axis, new THREE.Vector3(0, 1, 0));
        if (n.lengthSq() < 1e-5) n.crossVectors(axis, new THREE.Vector3(1, 0, 0));
        return n.normalize();
    }

    function _layoutScalarOnAxisAt(origin, axis, planeNormal) {
        _layoutSetDragPlane(planeNormal, origin);
        var pt = _layoutRayOnDragPlane();
        if (!pt) return null;
        return _layoutScalarOnAxis(origin, axis, pt);
    }

    function _layoutGizmoCenter(slot, slotIndex) {
        if (_layoutGroup && slotIndex != null) {
            var g = _layoutGroup.getObjectByName('layout-slot-' + slotIndex);
            if (g) {
                g.updateMatrixWorld(true);
                var box = new THREE.Box3().setFromObject(g);
                if (!box.isEmpty()) {
                    var c = new THREE.Vector3();
                    box.getCenter(c);
                    return c;
                }
            }
        }
        var rs = state.orderCart[slot.cartIndex].rawState;
        var h = _linearHeight(rs);
        return new THREE.Vector3(slot.x || 0, (slot.y || 0) + h * 0.5, slot.z || 0);
    }

    function _layoutGizmoScreenScale(worldPoint) {
        if (!window.camera) return 1;
        var dist = window.camera.position.distanceTo(worldPoint);
        var fov = window.camera.fov || 45;
        return Math.max(0.55, Math.min(1.8, dist * Math.tan(fov * Math.PI / 360) / 145));
    }

    function _layoutWorldAxis(mode, rotY) {
        var v = new THREE.Vector3();
        if (mode === 'axis-x') v.set(1, 0, 0);
        else if (mode === 'axis-y') v.set(0, 1, 0);
        else if (mode === 'axis-z') v.set(0, 0, 1);
        if (mode === 'axis-x' || mode === 'axis-z') v.applyAxisAngle(new THREE.Vector3(0, 1, 0), rotY || 0);
        return v.normalize();
    }

    function _layoutScalarOnAxis(origin, axis, point) {
        return _layoutTmpV3a.copy(point).sub(origin).dot(axis);
    }

    function _layoutMakeGizmoMaterial(color, opacity) {
        return new THREE.MeshBasicMaterial({
            color: color,
            transparent: true,
            opacity: opacity != null ? opacity : 0.92,
            depthTest: false,
            depthWrite: false
        });
    }

    function _layoutAddGizmoHandle(group, mesh, mode) {
        mesh.userData.gizmoMode = mode;
        mesh.renderOrder = 9999;
        group.add(mesh);
        _layoutGizmoHandles.push(mesh);
    }

    function _layoutRotateAxisWorld(mode, slot) {
        var v = new THREE.Vector3(
            mode === 'rotate-x' ? 1 : 0,
            mode === 'rotate-y' ? 1 : 0,
            mode === 'rotate-z' ? 1 : 0
        );
        var e = new THREE.Euler(slot.rotX || 0, slot.rotY || 0, slot.rotZ || 0, 'YXZ');
        return v.applyEuler(e).normalize();
    }

    function _layoutInitRotateDrag(mode, center, slot, dragState) {
        var axis = _layoutRotateAxisWorld(mode, slot);
        _layoutSetDragPlane(axis, center);
        var pt = _layoutRayOnDragPlane();
        if (!pt) return false;
        var v = _layoutTmpV3a.copy(pt).sub(center);
        v.addScaledVector(axis, -v.dot(axis));
        if (v.lengthSq() < 1e-4) return false;
        v.normalize();
        dragState.rotateAxis = axis.clone();
        dragState.startVec = v.clone();
        dragState.startRotX = slot.rotX || 0;
        dragState.startRotY = slot.rotY || 0;
        dragState.startRotZ = slot.rotZ || 0;
        dragState.rotateMode = mode;
        return true;
    }

    function _layoutApplyRotateDrag(center, slot, dragState) {
        var axis = dragState.rotateAxis;
        _layoutSetDragPlane(axis, center);
        var pt = _layoutRayOnDragPlane();
        if (!pt) return;
        var v = _layoutTmpV3a.copy(pt).sub(center);
        v.addScaledVector(axis, -v.dot(axis));
        if (v.lengthSq() < 1e-4) return;
        v.normalize();
        var cross = _layoutTmpV3b.crossVectors(dragState.startVec, v);
        var delta = Math.atan2(cross.dot(axis), dragState.startVec.dot(v));
        var mode = dragState.rotateMode;
        if (mode === 'rotate-x') slot.rotX = dragState.startRotX + delta;
        else if (mode === 'rotate-y') slot.rotY = dragState.startRotY + delta;
        else slot.rotZ = dragState.startRotZ + delta;
    }

    function _layoutMakeRotateRing(mode, color, rotX, rotY, rotZ) {
        var radius = 42;
        var ringGroup = new THREE.Group();
        if (rotX) ringGroup.rotation.x = rotX;
        if (rotY) ringGroup.rotation.y = rotY;
        if (rotZ) ringGroup.rotation.z = rotZ;
        var ring = new THREE.Mesh(
            new THREE.TorusGeometry(radius, 2.4, 8, 56),
            _layoutMakeGizmoMaterial(color, 0.95)
        );
        var ringHit = new THREE.Mesh(
            new THREE.TorusGeometry(radius, LAYOUT_GIZMO_HIT, 6, 44),
            _layoutMakeGizmoMaterial(color, 0.01)
        );
        ringGroup.add(ring);
        _layoutAddGizmoHandle(ringGroup, ringHit, mode);
        return ringGroup;
    }

    function _layoutBuildGizmoVisuals() {
        if (!_layoutGizmoGroup) {
            _layoutGizmoGroup = new THREE.Group();
            _layoutGizmoGroup.name = 'layoutGizmo';
            window.scene.add(_layoutGizmoGroup);
        }
        while (_layoutGizmoGroup.children.length > 0) _layoutGizmoGroup.remove(_layoutGizmoGroup.children[0]);
        _layoutGizmoHandles = [];
        _layoutTranslateGroup = new THREE.Group();
        _layoutTranslateGroup.name = 'layoutGizmoTranslate';
        _layoutRotateGroup = new THREE.Group();
        _layoutRotateGroup.name = 'layoutGizmoRotate';

        var len = LAYOUT_GIZMO_ARROW;
        var r = 2.4;
        var head = 11;

        function makeArrow(mode, color, dir) {
            var g = new THREE.Group();
            var shaft = new THREE.Mesh(
                new THREE.CylinderGeometry(r, r, len, 10),
                _layoutMakeGizmoMaterial(color)
            );
            var tip = new THREE.Mesh(
                new THREE.ConeGeometry(r * 2.4, head, 12),
                _layoutMakeGizmoMaterial(color)
            );
            var hit = new THREE.Mesh(
                new THREE.CylinderGeometry(LAYOUT_GIZMO_HIT, LAYOUT_GIZMO_HIT, len + head, 8),
                _layoutMakeGizmoMaterial(color, 0.015)
            );

            if (dir === 'x') {
                shaft.rotation.z = -Math.PI / 2;
                tip.rotation.z = -Math.PI / 2;
                hit.rotation.z = -Math.PI / 2;
                shaft.position.x = len / 2;
                tip.position.x = len + head * 0.45;
                hit.position.x = (len + head) / 2;
            } else if (dir === 'y') {
                shaft.position.y = len / 2;
                tip.position.y = len + head * 0.45;
                hit.position.y = (len + head) / 2;
            } else {
                shaft.rotation.x = Math.PI / 2;
                tip.rotation.x = Math.PI / 2;
                hit.rotation.x = Math.PI / 2;
                shaft.position.z = len / 2;
                tip.position.z = len + head * 0.45;
                hit.position.z = (len + head) / 2;
            }

            g.add(shaft);
            g.add(tip);
            _layoutAddGizmoHandle(g, hit, mode);
            return g;
        }

        _layoutTranslateGroup.add(makeArrow('axis-x', 0xe53935, 'x'));
        _layoutTranslateGroup.add(makeArrow('axis-y', 0x43a047, 'y'));
        _layoutTranslateGroup.add(makeArrow('axis-z', 0x1e88e5, 'z'));

        var centerHit = new THREE.Mesh(
            new THREE.BoxGeometry(LAYOUT_GIZMO_HIT * 1.5, LAYOUT_GIZMO_HIT * 1.5, LAYOUT_GIZMO_HIT * 1.5),
            _layoutMakeGizmoMaterial(0xffffff, 0.015)
        );
        var centerVis = new THREE.Mesh(
            new THREE.BoxGeometry(10, 10, 10),
            _layoutMakeGizmoMaterial(0xffffff, 0.95)
        );
        centerVis.material.color.set(0xf8fafc);
        var centerGroup = new THREE.Group();
        centerGroup.add(centerVis);
        _layoutAddGizmoHandle(centerGroup, centerHit, 'plane-xz');
        _layoutTranslateGroup.add(centerGroup);

        _layoutRotateGroup.add(_layoutMakeRotateRing('rotate-x', 0xe53935, 0, Math.PI / 2, 0));
        _layoutRotateGroup.add(_layoutMakeRotateRing('rotate-y', 0x43a047, Math.PI / 2, 0, 0));
        _layoutRotateGroup.add(_layoutMakeRotateRing('rotate-z', 0x1e88e5, 0, 0, 0));

        _layoutGizmoGroup.add(_layoutTranslateGroup);
        _layoutGizmoGroup.add(_layoutRotateGroup);
        _syncLayoutGizmoToolVisibility();
    }

    function _syncLayoutGizmoToolVisibility() {
        if (_layoutTranslateGroup) _layoutTranslateGroup.visible = _layoutGizmoTool === 'move';
        if (_layoutRotateGroup) _layoutRotateGroup.visible = _layoutGizmoTool === 'rotate';
        document.body.classList.toggle('layout-gizmo-rotate', _layoutGizmoTool === 'rotate');
        var moveBtn = document.getElementById('layout-tool-move');
        var rotateBtn = document.getElementById('layout-tool-rotate');
        if (moveBtn) moveBtn.classList.toggle('active', _layoutGizmoTool === 'move');
        if (rotateBtn) rotateBtn.classList.toggle('active', _layoutGizmoTool === 'rotate');
    }

    window._setLayoutGizmoTool = function(tool) {
        if (tool !== 'move' && tool !== 'rotate') return;
        _layoutGizmoTool = tool;
        _syncLayoutGizmoToolVisibility();
        _updateLayoutGizmo();
    };

    function _updateLayoutGizmo() {
        if (!_layoutScene || !_layoutScene.active || !_layoutGizmoGroup) {
            if (_layoutGizmoGroup) _layoutGizmoGroup.visible = false;
            return;
        }
        if (!_layoutGizmoHandles.length) _layoutBuildGizmoVisuals();
        var slot = _layoutScene.slots[_layoutScene.activeSlot];
        if (!slot) {
            _layoutGizmoGroup.visible = false;
            return;
        }
        var center = _layoutGizmoCenter(slot, _layoutScene.activeSlot);
        _layoutGizmoGroup.visible = true;
        _layoutGizmoGroup.position.copy(center);
        var s = _layoutGizmoScreenScale(center);
        _layoutGizmoGroup.scale.set(s, s, s);
        if (_layoutGizmoTool === 'move') {
            _layoutGizmoGroup.rotation.set(0, slot.rotY || 0, 0);
        } else {
            _layoutGizmoGroup.rotation.set(slot.rotX || 0, slot.rotY || 0, slot.rotZ || 0);
        }
        _syncLayoutGizmoToolVisibility();
    }

    function _hideLayoutGizmo() {
        if (_layoutGizmoGroup) _layoutGizmoGroup.visible = false;
    }

    function _destroyLayoutGizmo() {
        if (_layoutGizmoGroup && window.scene) window.scene.remove(_layoutGizmoGroup);
        _layoutGizmoGroup = null;
        _layoutTranslateGroup = null;
        _layoutRotateGroup = null;
        _layoutGizmoHandles = [];
    }

    function _selectLayoutSlot(slotIndex) {
        if (!_layoutScene || slotIndex < 0) return;
        _layoutScene.activeSlot = slotIndex;
        _syncActiveLayoutChip();
        _syncLayoutMoveButtons();
        _updateLayoutGizmo();
    }

    function _onLayoutPointerDown(e) {
        if (!window._layoutModeActive || !_layoutScene || !_layoutScene.active) return;
        if (e.button !== 0) return;
        if (e.target.closest('#layout-mode-bar') || e.target.closest('#layout-picker-modal')) return;

        _layoutPointerNDC(e);
        var gizmoMode = _layoutPickGizmo(e);
        _layoutDbg('pointerdown', {
            gizmo: gizmoMode,
            tool: _layoutGizmoTool,
            ndcX: _layoutMouse.x.toFixed(3),
            ndcY: _layoutMouse.y.toFixed(3)
        });
        if (gizmoMode) {
            e.preventDefault();
            e.stopPropagation();
            var slot = _layoutScene.slots[_layoutScene.activeSlot];
            if (!slot) return;

            var slotIdx = _layoutScene.activeSlot;
            var center = _layoutGizmoCenter(slot, slotIdx);
            var dragState = {
                slotIndex: slotIdx,
                mode: gizmoMode,
                startX: slot.x || 0,
                startY: slot.y || 0,
                startZ: slot.z || 0,
                startRotX: slot.rotX || 0,
                startRotY: slot.rotY || 0,
                startRotZ: slot.rotZ || 0,
                gizmoOrigin: center.clone(),
                controlsWereEnabled: window.controls ? window.controls.enabled : true
            };

            if (gizmoMode === 'plane-xz') {
                dragState.planeY = slot.y || 0;
                _layoutSetDragPlane(new THREE.Vector3(0, 1, 0), new THREE.Vector3(slot.x || 0, dragState.planeY, slot.z || 0));
                var pt0 = _layoutRayOnDragPlane();
                if (!pt0) return;
                dragState.planeOffsetX = pt0.x - (slot.x || 0);
                dragState.planeOffsetZ = pt0.z - (slot.z || 0);
            } else if (gizmoMode.indexOf('rotate-') === 0) {
                if (!_layoutInitRotateDrag(gizmoMode, center, slot, dragState)) return;
            } else if (gizmoMode.indexOf('axis-') === 0) {
                var axis = _layoutWorldAxis(gizmoMode, slot.rotY);
                dragState.axis = axis.clone();
                dragState.planeNormal = _layoutDragPlaneNormal(axis, center);
                var startScalar = _layoutScalarOnAxisAt(center, axis, dragState.planeNormal);
                if (startScalar == null) {
                    _layoutDbg('axis drag start failed — no plane hit', gizmoMode);
                    return;
                }
                dragState.startScalar = startScalar;
            }

            _layoutDragState = dragState;
            _layoutDbg('drag start', gizmoMode, dragState);
            if (window.controls) window.controls.enabled = false;
            document.body.classList.add('layout-dragging');
            var capEl = (window.renderer && window.renderer.domElement && window.renderer.domElement.contains(e.target))
                ? window.renderer.domElement
                : _layoutCanvas;
            if (capEl && capEl.setPointerCapture) capEl.setPointerCapture(e.pointerId);
            return;
        }

        var slotIndex = _layoutPickSlotIndex(e);
        if (slotIndex >= 0) {
            _layoutDbg('select slot', slotIndex);
            e.preventDefault();
            e.stopPropagation();
            _selectLayoutSlot(slotIndex);
        }
    }

    function _onLayoutPointerMove(e) {
        if (!window._layoutModeActive) return;

        if (!_layoutDragState) {
            if (_layoutCanvas && !e.target.closest('#layout-mode-bar')) {
                _layoutPointerNDC(e);
                var gizmoMode = _layoutPickGizmo(e);
                if (gizmoMode !== _layoutGizmoHover) {
                    _layoutGizmoHover = gizmoMode;
                    _layoutCanvas.classList.toggle('layout-gizmo-hover', !!gizmoMode);
                }
                var hoverIdx = _layoutPickSlotIndex(e);
                _layoutCanvas.classList.toggle('layout-slot-hover', hoverIdx >= 0 && !gizmoMode);
            }
            return;
        }

        e.preventDefault();
        _layoutPointerNDC(e);
        var slot = _layoutScene.slots[_layoutDragState.slotIndex];
        if (!slot) return;

        var mode = _layoutDragState.mode;
        var origin = _layoutDragState.gizmoOrigin;

        if (mode === 'plane-xz') {
            _layoutSetDragPlane(
                new THREE.Vector3(0, 1, 0),
                new THREE.Vector3(slot.x || 0, _layoutDragState.planeY, slot.z || 0)
            );
            var pt = _layoutRayOnDragPlane();
            if (!pt) {
                _layoutDbg('drag move miss plane', mode);
                return;
            }
            slot.x = pt.x - _layoutDragState.planeOffsetX;
            slot.z = pt.z - _layoutDragState.planeOffsetZ;
        } else if (mode.indexOf('rotate-') === 0) {
            _layoutApplyRotateDrag(origin, slot, _layoutDragState);
        } else if (mode.indexOf('axis-') === 0) {
            var axis = _layoutDragState.axis;
            var currentScalar = _layoutScalarOnAxisAt(origin, axis, _layoutDragState.planeNormal);
            if (currentScalar == null) {
                _layoutDbg('axis drag move miss plane', mode);
                return;
            }
            var delta = currentScalar - _layoutDragState.startScalar;
            slot.x = _layoutDragState.startX + axis.x * delta;
            slot.y = Math.max(0, _layoutDragState.startY + axis.y * delta);
            slot.z = _layoutDragState.startZ + axis.z * delta;
        }

        _applyDragConstraints(_layoutDragState.slotIndex, false);
        _applySlotTransforms(false);
        _updateLayoutGizmo();
        _syncLayoutToolbar();
        _syncLayoutMoveButtons();
    }

    function _onLayoutPointerUp(e) {
        if (!_layoutDragState) return;

        var capEl = (window.renderer && window.renderer.domElement) || _layoutCanvas;
        if (capEl && capEl.hasPointerCapture && capEl.hasPointerCapture(e.pointerId)) {
            capEl.releasePointerCapture(e.pointerId);
        } else if (_layoutCanvas && _layoutCanvas.hasPointerCapture && _layoutCanvas.hasPointerCapture(e.pointerId)) {
            _layoutCanvas.releasePointerCapture(e.pointerId);
        }

        _layoutDbg('drag end', _layoutDragState.mode);
        _applyDragConstraints(_layoutDragState.slotIndex, true);
        _applySlotTransforms(false);
        _syncLayoutRoom(true);
        _updateLayoutGizmo();
        _syncLayoutToolbar();
        _syncLayoutMoveButtons();

        if (window.controls) window.controls.enabled = _layoutDragState.controlsWereEnabled !== false;
        _layoutDragState = null;
        document.body.classList.remove('layout-dragging');
        if (_layoutCanvas) {
            _layoutCanvas.classList.remove('layout-gizmo-hover');
            _layoutCanvas.classList.remove('layout-slot-hover');
        }
        _layoutGizmoHover = null;
    }

    function _onLayoutCameraChange() {
        if (window._layoutModeActive && _layoutScene && _layoutScene.active) {
            _updateLayoutGizmo();
        }
    }

    function _bindLayoutDragEvents() {
        if (_layoutDragBound) return;
        _layoutCanvas = document.getElementById('canvas-container');
        if (!_layoutCanvas) return;
        _layoutCanvas.addEventListener('pointerdown', _onLayoutPointerDown, true);
        if (window.renderer && window.renderer.domElement) {
            window.renderer.domElement.addEventListener('pointerdown', _onLayoutPointerDown, true);
        }
        window.addEventListener('pointermove', _onLayoutPointerMove, true);
        window.addEventListener('pointerup', _onLayoutPointerUp, true);
        window.addEventListener('pointercancel', _onLayoutPointerUp, true);
        if (window.controls) window.controls.addEventListener('change', _onLayoutCameraChange);
        _layoutDragBound = true;
        _layoutDbg('events bound');
    }

    function _unbindLayoutDragEvents() {
        if (!_layoutDragBound) return;
        if (_layoutCanvas) {
            _layoutCanvas.removeEventListener('pointerdown', _onLayoutPointerDown, true);
            _layoutCanvas.classList.remove('layout-slot-hover');
            _layoutCanvas.classList.remove('layout-gizmo-hover');
        }
        if (window.renderer && window.renderer.domElement) {
            window.renderer.domElement.removeEventListener('pointerdown', _onLayoutPointerDown, true);
        }
        window.removeEventListener('pointermove', _onLayoutPointerMove, true);
        window.removeEventListener('pointerup', _onLayoutPointerUp, true);
        window.removeEventListener('pointercancel', _onLayoutPointerUp, true);
        if (window.controls) window.controls.removeEventListener('change', _onLayoutCameraChange);
        _layoutDragBound = false;
        _layoutDragState = null;
        document.body.classList.remove('layout-dragging');
        if (window.controls) window.controls.enabled = true;
    }

    function _addSlotOutline(slotGroup, color) {
        slotGroup.updateMatrixWorld(true);
        var box = new THREE.Box3().setFromObject(slotGroup);
        if (box.isEmpty()) return;
        var size = new THREE.Vector3();
        var center = new THREE.Vector3();
        box.getSize(size);
        box.getCenter(center);
        var localCenter = slotGroup.worldToLocal(center.clone());
        var geo = new THREE.BoxGeometry(size.x + 4, size.y + 4, size.z + 4);
        var edges = new THREE.EdgesGeometry(geo);
        var line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({
            color: color,
            transparent: true,
            opacity: 0.85
        }));
        line.position.copy(localCenter);
        line.name = 'layout-outline';
        slotGroup.add(line);
    }

    function _renderLayoutRoom(spec) {
        var rg = window._roomGroup;
        if (!rg) return;
        var roomVisible = !_layoutScene || _layoutScene.roomVisible !== false;
        while (rg.children.length > 0) rg.remove(rg.children[0]);
        if (!roomVisible) {
            rg.visible = false;
            return;
        }
        rg.visible = true;

        var centerX = (spec.leftWallX + spec.rightWallX) / 2;
        var roomW = spec.rightWallX - spec.leftWallX;
        var roomD = spec.roomD;
        var roomH = spec.roomH;
        var backZ = spec.backZ;

        var floorMat = new THREE.MeshStandardMaterial({ color: 0xd4a96a, roughness: 0.8, metalness: 0.0 });
        if (window._woodFloorTex) {
            var ft = window._woodFloorTex.clone();
            ft.needsUpdate = true;
            ft.repeat.set(roomW / 200, roomD / 200);
            floorMat.map = ft;
            floorMat.color.set(0xffffff);
        }
        var floorMesh = new THREE.Mesh(new THREE.PlaneGeometry(roomW, roomD), floorMat);
        floorMesh.rotation.x = -Math.PI / 2;
        floorMesh.position.set(centerX, 0, backZ + roomD / 2);
        floorMesh.receiveShadow = true;
        rg.add(floorMesh);

        var wallMat = new THREE.MeshStandardMaterial({ color: 0xf0ede8, roughness: 0.9, metalness: 0.0 });
        if (window._wallTex) {
            var wt = window._wallTex.clone();
            wt.needsUpdate = true;
            wt.repeat.set(roomW / 200, 1);
            wallMat.map = wt;
            wallMat.color.set(0xffffff);
        }
        var backWall = new THREE.Mesh(new THREE.PlaneGeometry(roomW, roomH), wallMat);
        backWall.position.set(centerX, roomH / 2, backZ);
        rg.add(backWall);

        var sideMat = wallMat.clone();
        var leftWall = new THREE.Mesh(new THREE.PlaneGeometry(roomD, roomH), sideMat);
        leftWall.rotation.y = Math.PI / 2;
        leftWall.position.set(spec.leftWallX, roomH / 2, backZ + roomD / 2);
        rg.add(leftWall);

        var rightWall = new THREE.Mesh(new THREE.PlaneGeometry(roomD, roomH), sideMat.clone());
        rightWall.rotation.y = -Math.PI / 2;
        rightWall.position.set(spec.rightWallX, roomH / 2, backZ + roomD / 2);
        rg.add(rightWall);

        window._roomBounds = {
            leftX: spec.leftWallX,
            rightX: spec.rightWallX,
            backZ: backZ,
            frontZ: backZ + roomD
        };
    }

    function _frameLayoutCamera() {
        if (!_layoutGroup || !window.camera || !window.controls) return;
        _layoutGroup.updateMatrixWorld(true);
        var box = new THREE.Box3().setFromObject(_layoutGroup);
        if (box.isEmpty()) return;
        var center = new THREE.Vector3();
        var size = new THREE.Vector3();
        box.getCenter(center);
        box.getSize(size);
        var maxDim = Math.max(size.x, size.y, size.z);
        var dist = maxDim * 1.35 + 80;
        window.camera.position.set(center.x + dist * 0.35, center.y + dist * 0.55, center.z + dist * 0.85);
        window.controls.target.copy(center);
        window.controls.update();
        window._orbitFree = true;
    }

    function _layoutPresetSideBySide() {
        if (!_layoutScene || !_layoutScene.slots.length) return;
        var slots = _layoutScene.slots;
        var rsA = state.orderCart[slots[0].cartIndex].rawState;
        var rsB = state.orderCart[slots[1].cartIndex].rawState;
        var wA = _linearWidth(rsA);
        var wB = _linearWidth(rsB);
        slots[0].x = 0;
        slots[0].y = 0;
        slots[0].z = 0;
        slots[0].rotX = 0;
        slots[0].rotY = 0;
        slots[0].rotZ = 0;
        slots[1].x = (wA + wB) / 2;
        slots[1].y = 0;
        slots[1].z = 0;
        slots[1].rotX = 0;
        slots[1].rotY = 0;
        slots[1].rotZ = 0;
        _rebuildLayoutScene();
    }

    function _rebuildLayoutScene() {
        if (!_layoutScene || !_layoutScene.active) return;
        _clearLayoutGroup();
        var group = _ensureLayoutGroup();
        group.visible = true;

        var colors = [0x3b82f6, 0x10b981];

        _layoutScene.slots.forEach(function(slot, i) {
            var rawState = state.orderCart[slot.cartIndex].rawState;
            _applyLinearSnapshot(rawState);

            var slotGroup = new THREE.Group();
            slotGroup.name = 'layout-slot-' + i;
            slotGroup.position.set(slot.x || 0, Math.max(0, slot.y || 0), slot.z || 0);
            slotGroup.rotation.set(slot.rotX || 0, slot.rotY || 0, slot.rotZ || 0);

            if (typeof window.buildCabinetIntoGroup === 'function') {
                window.buildCabinetIntoGroup(slotGroup);
            }

            group.add(slotGroup);
            _addSlotOutline(slotGroup, colors[i] || 0x64748b);
            _addLayoutPickHit(slotGroup, i, rawState);
        });

        if (window._restoreEditorState && _editorSnapshot) {
            window._restoreEditorState(_editorSnapshot);
        }

        var bounds = _computeLayoutBounds();
        _layoutScene.roomSpec = null;
        _syncLayoutRoom(false);
        _frameLayoutCamera();
        if (typeof buildCabinet === 'function') {
            window.cabinetGroup.visible = false;
        }
        _syncLayoutToolbar();
        _syncActiveLayoutChip();
        _syncLayoutMoveButtons();
        _updateLayoutGizmo();
    }

    function _syncLayoutMoveButtons() {
        if (!_layoutScene || !_layoutScene.active) return;
        var slot = _layoutScene.slots[_layoutScene.activeSlot];
        var yDown = document.getElementById('layout-move-y-down');
        if (yDown && slot) {
            var atFloor = (slot.y || 0) <= 0;
            yDown.disabled = atFloor;
            yDown.title = atFloor ? 'כבר על הרצפה' : 'למטה';
        }
    }

    function _syncLayoutToolbar() {
        if (!_layoutScene || !_layoutScene.active) return;
        _layoutScene.slots.forEach(function(slot, i) {
            var chip = document.getElementById('layout-chip-' + i);
            if (!chip) return;
            chip.querySelector('.layout-chip-name').textContent = _cabLabel(slot.cartIndex);
            var rotYDeg = Math.round((slot.rotY || 0) * 180 / Math.PI);
            rotYDeg = ((rotYDeg % 360) + 360) % 360;
            var rotExtra = '';
            if (Math.abs(slot.rotX || 0) > 0.02 || Math.abs(slot.rotZ || 0) > 0.02) {
                rotExtra = ' · RX ' + Math.round((slot.rotX || 0) * 180 / Math.PI) +
                    '° · RZ ' + Math.round((slot.rotZ || 0) * 180 / Math.PI) + '°';
            }
            chip.querySelector('.layout-chip-dims').textContent =
                'X ' + Math.round(slot.x || 0) + ' · Y ' + Math.round(slot.y || 0) + ' · Z ' + Math.round(slot.z || 0) +
                ' · RY ' + rotYDeg + '°' + rotExtra;
        });
    }

    window._setActiveLayoutSlot = function(index) {
        if (!_layoutScene || !_layoutScene.active) return;
        if (index !== 0 && index !== 1) return;
        _selectLayoutSlot(index);
    };

    window._rotateActiveLayoutSlot = function(deltaDeg) {
        if (!_layoutScene || !_layoutScene.active) return;
        var slot = _layoutScene.slots[_layoutScene.activeSlot];
        if (!slot) return;
        window._setLayoutGizmoTool('rotate');
        slot.rotY = (slot.rotY || 0) + (deltaDeg * Math.PI / 180);
        _applySnapAndResolve(_layoutScene.activeSlot);
        _applySlotTransforms(false);
        _syncLayoutToolbar();
    };

    window._moveActiveLayoutSlot = function(axis, delta) {
        if (!_layoutScene || !_layoutScene.active) return;
        var slot = _layoutScene.slots[_layoutScene.activeSlot];
        if (!slot) return;

        if (axis === 'x') slot.x = (slot.x || 0) + delta;
        else if (axis === 'y') {
            var nextY = (slot.y || 0) + delta;
            if (nextY < 0) {
                slot.y = 0;
                if (typeof window._showToast === 'function') {
                    window._showToast('לא ניתן להוריד את הארון מתחת לרצפה', 2200);
                }
            } else {
                slot.y = nextY;
            }
        }
        else if (axis === 'z') slot.z = (slot.z || 0) + delta;

        _clampSlotToGround(slot);
        _applySlotTransforms(false);
        _syncLayoutToolbar();
        _syncLayoutMoveButtons();
    };

    window._openLayoutPicker = function() {
        if (!state.orderCart || state.orderCart.length < 2) {
            if (typeof window._showToast === 'function') window._showToast('נדרשים לפחות 2 ארונות בפרויקט', 3500);
            return;
        }
        var eligible = state.orderCart.map(function(_, i) { return window._isLayoutEligibleCabinet(i); });
        if (eligible.filter(Boolean).length < 2) {
            if (typeof window._showToast === 'function') window._showToast('נדרשים לפחות 2 ארונות ישרים (לא הזזה)', 4000);
            return;
        }
        _pickSelection = [];
        _renderLayoutPickerList();
        var modal = document.getElementById('layout-picker-modal');
        if (modal) modal.classList.add('open');
    };

    window._closeLayoutPicker = function() {
        var modal = document.getElementById('layout-picker-modal');
        if (modal) modal.classList.remove('open');
        _pickSelection = [];
    };

    window._toggleLayoutPick = function(index) {
        if (!window._isLayoutEligibleCabinet(index)) return;
        var pos = _pickSelection.indexOf(index);
        if (pos !== -1) {
            _pickSelection.splice(pos, 1);
        } else if (_pickSelection.length < 2) {
            _pickSelection.push(index);
        } else {
            _pickSelection.shift();
            _pickSelection.push(index);
        }
        _renderLayoutPickerList();
    };

    function _renderLayoutPickerList() {
        var list = document.getElementById('layout-picker-list');
        var confirmBtn = document.getElementById('layout-picker-confirm');
        if (!list) return;
        list.innerHTML = '';

        state.orderCart.forEach(function(item, index) {
            var eligible = window._isLayoutEligibleCabinet(index);
            var selected = _pickSelection.indexOf(index) !== -1;
            var card = document.createElement('button');
            card.type = 'button';
            card.className = 'layout-pick-card' + (selected ? ' selected' : '') + (eligible ? '' : ' disabled');
            card.disabled = !eligible;
            card.onclick = function() { window._toggleLayoutPick(index); };

            var thumb = _cabThumb(index);
            var thumbHtml = thumb
                ? '<img class="layout-pick-thumb" src="' + thumb + '" alt="">'
                : '<div class="layout-pick-thumb layout-pick-thumb-empty"><i class="fa-solid fa-door-closed"></i></div>';

            card.innerHTML =
                thumbHtml +
                '<div class="layout-pick-info">' +
                    '<div class="layout-pick-title">' + _cabLabel(index) + '</div>' +
                    '<div class="layout-pick-dims">' + (_cabDims(index) || '—') + '</div>' +
                    (eligible ? '' : '<div class="layout-pick-note">' + (_layoutIneligibleReason(item.rawState) || 'לא זמין') + '</div>') +
                '</div>' +
                '<div class="layout-pick-check">' + (selected ? '<i class="fa-solid fa-circle-check"></i>' : '<i class="fa-regular fa-circle"></i>') + '</div>';

            list.appendChild(card);
        });

        if (confirmBtn) {
            confirmBtn.disabled = _pickSelection.length !== 2;
        }
        var hint = document.getElementById('layout-picker-hint');
        if (hint) {
            hint.textContent = _pickSelection.length === 2
                ? 'מוכן — לחץ "הצג יחד במרחב"'
                : 'בחר 2 ארונות (' + _pickSelection.length + '/2)';
        }
    }

    window._confirmLayoutPicker = function() {
        if (_pickSelection.length !== 2) return;
        var indexA = _pickSelection[0];
        var indexB = _pickSelection[1];
        window._closeLayoutPicker();
        window._enterLayoutMode(indexA, indexB);
    };

    function _syncLayoutRoomToggleBtn() {
        var btn = document.getElementById('layout-toggle-room-btn');
        var label = document.getElementById('layout-room-toggle-label');
        if (!btn || !_layoutScene) return;
        var vis = _layoutScene.roomVisible !== false;
        if (label) label.textContent = vis ? 'הסתר חדר' : 'הצג חדר';
        btn.classList.toggle('toggled-off', !vis);
        btn.title = vis ? 'הסתר קירות ורצפה' : 'הצג קירות ורצפה';
    }

    window._toggleLayoutRoom = function() {
        if (!_layoutScene || !_layoutScene.active) return;
        _layoutScene.roomVisible = !(_layoutScene.roomVisible !== false);
        if (window._roomGroup) {
            if (_layoutScene.roomVisible && _layoutScene.roomSpec) {
                if (window._roomGroup.children.length === 0) _renderLayoutRoom(_layoutScene.roomSpec);
                else window._roomGroup.visible = true;
            } else {
                window._roomGroup.visible = false;
            }
        }
        _syncLayoutRoomToggleBtn();
    };

    window._enterLayoutMode = function(indexA, indexB) {
        if (!window._isLayoutEligibleCabinet(indexA) || !window._isLayoutEligibleCabinet(indexB)) {
            if (typeof window._showToast === 'function') window._showToast('ניתן לסדר רק ארונות ישרים (לא הזזה)', 3500);
            return;
        }

        _editorSnapshot = window._snapshotEditorState ? window._snapshotEditorState() : null;
        _layoutScene = {
            active: true,
            activeSlot: 0,
            roomVisible: true,
            slots: [
                _slotDefaults(indexA),
                _slotDefaults(indexB)
            ]
        };

        document.body.classList.add('layout-mode');
        var bar = document.getElementById('layout-mode-bar');
        if (bar) bar.classList.add('visible');

        window._roomVisible = true;
        window.cabinetGroup.visible = false;
        state.viewMode = '3d';
        window._orbitFree = true;

        window._layoutModeActive = true;
        window._layoutDebug = true;
        _layoutGizmoTool = 'move';
        _suppressEditorOverlays(true);
        _bindLayoutDragEvents();
        _layoutBuildGizmoVisuals();

        _layoutPresetSideBySide();
        _syncLayoutRoomToggleBtn();
        _layoutDbg('enter layout mode', indexA, indexB);

        if (typeof updateCameraView === 'function') updateCameraView();
    };

    window._exitLayoutMode = function() {
        if (!_layoutScene || !_layoutScene.active) return;

        _layoutScene.active = false;
        document.body.classList.remove('layout-mode');
        var bar = document.getElementById('layout-mode-bar');
        if (bar) bar.classList.remove('visible');

        _clearLayoutGroup();
        if (_layoutGroup) _layoutGroup.visible = false;
        window.cabinetGroup.visible = true;

        if (window._restoreEditorState && _editorSnapshot) {
            window._restoreEditorState(_editorSnapshot);
            _editorSnapshot = null;
        }

        _layoutScene = null;
        window._layoutModeActive = false;
        window._layoutDebug = false;
        _layoutGizmoTool = 'move';
        _unbindLayoutDragEvents();
        _destroyLayoutGizmo();
        _suppressEditorOverlays(false);

        if (typeof buildCabinet === 'function') buildCabinet();
        if (typeof updateCameraView === 'function') updateCameraView();
    };

    window._layoutPresetSideBySide = _layoutPresetSideBySide;
})();
