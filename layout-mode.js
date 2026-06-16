// ==========================================
// Layout Mode — compare two linear cabinets in shared 3D space
// ==========================================

(function() {
    var _layoutGroup = null;
    var _editorSnapshot = null;
    var _layoutScene = null;
    var _pickSelection = [];
    var LAYOUT_MOVE_STEP = 5;

    function _slotDefaults(cartIndex) {
        return { cartIndex: cartIndex, x: 0, y: 0, z: 0, rotY: 0 };
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

    function _applySlotTransforms(updateRoom) {
        if (!_layoutGroup || !_layoutScene) return;
        _clampAllSlotsToGround();
        _layoutScene.slots.forEach(function(slot, i) {
            var g = _layoutGroup.getObjectByName('layout-slot-' + i);
            if (!g) return;
            g.position.set(slot.x || 0, slot.y || 0, slot.z || 0);
            g.rotation.y = slot.rotY || 0;
        });
        if (updateRoom) {
            var b = _computeLayoutBounds();
            _buildLayoutRoom(b.minX, b.maxX, b.maxH, b.maxD);
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

    function _layoutIneligibleReason(rawState) {
        var rs = rawState || {};
        var preset = rs.presetId || 'linear';
        if (preset === 'sliding') return 'ארון הזזה';
        var cw = rs.wings && rs.wings.center;
        if (cw && cw.slidingDoor && cw.slidingDoor.enabled) return 'ארון הזזה';
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

    function _buildLayoutRoom(minX, maxX, maxH, maxD) {
        var rg = window._roomGroup;
        while (rg.children.length > 0) rg.remove(rg.children[0]);
        rg.visible = true;

        var margin = 90;
        var roomW = (maxX - minX) + margin * 2;
        var roomD = Math.max(maxD + margin * 2, 420);
        var roomH = maxH + 100;
        var centerX = (minX + maxX) / 2;
        var backZ = -(maxD / 2) - 1;
        var leftWallX = minX - margin;
        var rightWallX = maxX + margin;

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
        leftWall.position.set(leftWallX, roomH / 2, backZ + roomD / 2);
        rg.add(leftWall);

        var rightWall = new THREE.Mesh(new THREE.PlaneGeometry(roomD, roomH), sideMat.clone());
        rightWall.rotation.y = -Math.PI / 2;
        rightWall.position.set(rightWallX, roomH / 2, backZ + roomD / 2);
        rg.add(rightWall);

        window._roomBounds = {
            leftX: leftWallX,
            rightX: rightWallX,
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
        slots[0].rotY = 0;
        slots[1].x = (wA + wB) / 2;
        slots[1].y = 0;
        slots[1].z = 0;
        slots[1].rotY = 0;
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
            slotGroup.rotation.y = slot.rotY || 0;

            if (typeof window.buildCabinetIntoGroup === 'function') {
                window.buildCabinetIntoGroup(slotGroup);
            }

            group.add(slotGroup);
            _addSlotOutline(slotGroup, colors[i] || 0x64748b);
        });

        if (window._restoreEditorState && _editorSnapshot) {
            window._restoreEditorState(_editorSnapshot);
        }

        var bounds = _computeLayoutBounds();
        _buildLayoutRoom(bounds.minX, bounds.maxX, bounds.maxH, bounds.maxD);
        _frameLayoutCamera();
        if (typeof buildCabinet === 'function') {
            window.cabinetGroup.visible = false;
        }
        _syncLayoutToolbar();
        _syncActiveLayoutChip();
        _syncLayoutMoveButtons();
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
            chip.querySelector('.layout-chip-dims').textContent =
                'X ' + Math.round(slot.x || 0) + ' · Y ' + Math.round(slot.y || 0) + ' · Z ' + Math.round(slot.z || 0);
        });
    }

    window._setActiveLayoutSlot = function(index) {
        if (!_layoutScene || !_layoutScene.active) return;
        if (index !== 0 && index !== 1) return;
        _layoutScene.activeSlot = index;
        _syncActiveLayoutChip();
        _syncLayoutMoveButtons();
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
        _applySlotTransforms(true);
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
        window._closeLayoutPicker();
        window._enterLayoutMode(_pickSelection[0], _pickSelection[1]);
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

        _layoutPresetSideBySide();

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

        if (typeof buildCabinet === 'function') buildCabinet();
        if (typeof updateCameraView === 'function') updateCameraView();
    };

    window._layoutPresetSideBySide = _layoutPresetSideBySide;
})();
