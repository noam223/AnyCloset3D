// ============================================================
// shelf-pick.js — Select shelves in the regular editor and delete
// Always available (no separate mode). Disabled in viewer / part-paint.
// ============================================================

(function () {
    'use strict';

    let _hoveredMesh = null;   // visual mesh currently hovered
    let _selectedMesh = null;  // visual mesh currently selected
    let _selectedRef = null;
    // visual → { mat, edgeMats: Map(lineSegments → originalMat) }
    let _savedLooks = new Map();
    const _raycaster = new THREE.Raycaster();
    const _mouse = new THREE.Vector2();
    const _worldPos = new THREE.Vector3();
    const _hoverColor = new THREE.Color(0xc084fc);  // סגול בהיר (ריחוף)
    const _selectColor = new THREE.Color(0xa855f7); // סגול (בחירה)
    const _HOVER_BLEND = 0.55;
    const _SELECT_BLEND = 0.72;
    const _HOVER_EMISSIVE = 0.4;
    const _SELECT_EMISSIVE = 0.55;
    let _listenersBound = false;

    function _enabled() {
        if (window._VIEWER_MODE) return false;
        if (document.body.classList.contains('part-paint-active')) return false;
        return true;
    }

    function _getCanvas() {
        if (window.renderer && window.renderer.domElement) return window.renderer.domElement;
        return document.querySelector('#canvas-container canvas');
    }

    function _getContainer() {
        return document.getElementById('canvas-container') || _getCanvas();
    }

    function _getCamera() {
        return window.camera;
    }

    function _parseShelfRef(mesh) {
        if (!mesh || !mesh.userData) return null;
        const ref = mesh.userData.shelfRef;
        if (ref) {
            if (ref.isSub || (ref.subCellIdx != null && ref.subShelfIdx != null)) {
                return {
                    isSub: true,
                    colIndex: ref.colIndex | 0,
                    rowIndex: ref.rowIndex | 0,
                    subCellIdx: ref.subCellIdx | 0,
                    subShelfIdx: ref.subShelfIdx | 0
                };
            }
            if (ref.colIndex != null && ref.shelfIdx != null) {
                return { colIndex: ref.colIndex | 0, shelfIdx: ref.shelfIdx | 0, isSub: false };
            }
        }
        const id = mesh.userData.partId || '';
        let m = String(id).match(/shelf_sub_c(\d+)_r(\d+)_s(\d+)_(\d+)$/);
        if (m) {
            return {
                isSub: true,
                colIndex: +m[1],
                rowIndex: +m[2],
                subCellIdx: +m[3],
                subShelfIdx: +m[4]
            };
        }
        m = String(id).match(/shelf_c(\d+)_r(\d+)$/);
        if (!m) return null;
        return { colIndex: +m[1], shelfIdx: +m[2], isSub: false };
    }

    function _refsEqual(a, b) {
        if (!a || !b) return false;
        if (!!a.isSub !== !!b.isSub) return false;
        if (a.isSub) {
            return a.colIndex === b.colIndex && a.rowIndex === b.rowIndex &&
                a.subCellIdx === b.subCellIdx && a.subShelfIdx === b.subShelfIdx;
        }
        return a.colIndex === b.colIndex && a.shelfIdx === b.shelfIdx;
    }

    function _visualFromHit(hitMesh) {
        if (!hitMesh) return null;
        if (hitMesh.userData && hitMesh.userData.shelfVisual) return hitMesh.userData.shelfVisual;
        return hitMesh;
    }

    /** Purple tint + emissive glow (strong enough to read on wood textures). */
    function _applyHighlight(visual, color, blend, emissiveIntensity) {
        if (!visual || !visual.material) return;
        if (!_savedLooks.has(visual)) {
            const edgeMats = new Map();
            visual.children.forEach(function (ch) {
                if (ch.isLineSegments && ch.material) {
                    edgeMats.set(ch, ch.material);
                    ch.material = ch.material.clone();
                }
            });
            _savedLooks.set(visual, {
                mat: visual.material,
                edgeMats: edgeMats,
                baseColor: visual.material.color ? visual.material.color.clone() : null,
                baseOpacity: visual.material.opacity,
                baseTransparent: !!visual.material.transparent
            });
            visual.material = visual.material.clone();
        }
        const saved = _savedLooks.get(visual);
        const mat = visual.material;
        // With texture maps, color is a multiplier — lerp strongly so orange reads clearly
        if (mat.color && saved.baseColor) {
            mat.color.copy(saved.baseColor).lerp(color, blend);
        } else if (mat.color) {
            mat.color.copy(color);
        }
        if (mat.emissive) {
            mat.emissive.copy(color);
            mat.emissiveIntensity = emissiveIntensity;
        }
        // Keep nearly opaque — transparency washed out the orange on wood
        mat.transparent = saved.baseTransparent;
        mat.opacity = saved.baseOpacity != null ? saved.baseOpacity : 1;
        mat.needsUpdate = true;
        visual.children.forEach(function (ch) {
            if (ch.isLineSegments && ch.material && ch.material.color) {
                ch.material.color.copy(color);
                ch.material.needsUpdate = true;
            }
        });
    }

    function _restoreLook(visual) {
        if (!visual) return;
        const saved = _savedLooks.get(visual);
        if (!saved) return;
        visual.material = saved.mat;
        saved.edgeMats.forEach(function (origMat, ch) {
            if (ch) ch.material = origMat;
        });
        _savedLooks.delete(visual);
    }

    function _setHover(visual) {
        if (_hoveredMesh === visual) return;
        if (_hoveredMesh && _hoveredMesh !== _selectedMesh) {
            _restoreLook(_hoveredMesh);
        }
        _hoveredMesh = visual;
        if (visual && visual !== _selectedMesh) {
            _applyHighlight(visual, _hoverColor, _HOVER_BLEND, _HOVER_EMISSIVE);
        }
    }

    function _clearSelectionVisual() {
        if (_selectedMesh) {
            _restoreLook(_selectedMesh);
            _selectedMesh = null;
        }
        _selectedRef = null;
        _hideTrash();
    }

    function _selectVisual(visual, ref) {
        if (!visual || !ref) return;
        if (_selectedMesh && _selectedMesh !== visual) {
            _restoreLook(_selectedMesh);
        }
        if (_hoveredMesh && _hoveredMesh !== visual) {
            _restoreLook(_hoveredMesh);
            _hoveredMesh = null;
        }
        _selectedMesh = visual;
        _selectedRef = ref;
        _applyHighlight(visual, _selectColor, _SELECT_BLEND, _SELECT_EMISSIVE);
        _showTrash();
        _updateTrashPos();
    }

    function _findVisualByRef(ref) {
        if (!ref) return null;
        const lists = [window.shelfPickMeshes || [], window.partMeshes || []];
        for (let li = 0; li < lists.length; li++) {
            const list = lists[li];
            for (let i = 0; i < list.length; i++) {
                const m = list[i];
                if (!m || m.userData && m.userData.isShelfPickProxy) continue;
                const r = _parseShelfRef(m);
                if (_refsEqual(r, ref)) return m;
            }
        }
        return null;
    }

    function _raycast(event) {
        const canvas = _getCanvas();
        const camera = _getCamera();
        if (!canvas || !camera) return null;
        const rect = canvas.getBoundingClientRect();
        if (rect.width < 1 || rect.height < 1) return null;
        _mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        _mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        _raycaster.setFromCamera(_mouse, camera);

        let meshes = (window.shelfPickMeshes || []).filter(function (m) {
            return m && m.visible !== false;
        });
        if (!meshes.length) {
            meshes = (window.partMeshes || []).filter(function (m) {
                return m && m.visible !== false && _parseShelfRef(m);
            });
        }
        const hits = _raycaster.intersectObjects(meshes, false);
        return hits.length ? hits[0].object : null;
    }

    function _showTrash() {
        let btn = document.getElementById('sp-shelf-trash');
        if (!btn) {
            btn = document.createElement('button');
            btn.id = 'sp-shelf-trash';
            btn.type = 'button';
            btn.className = 'sp-shelf-trash';
            btn.title = 'מחק מדף (Delete)';
            btn.innerHTML = '<i class="fa-solid fa-trash"></i>';
            btn.addEventListener('click', function (e) {
                e.preventDefault();
                e.stopPropagation();
                window.deleteSelectedShelf();
            });
            document.body.appendChild(btn);
        }
        btn.style.display = 'flex';
    }

    function _hideTrash() {
        const btn = document.getElementById('sp-shelf-trash');
        if (btn) btn.style.display = 'none';
    }

    function _findShelfDragHandle() {
        if (!_selectedRef) return null;
        const handles = document.querySelectorAll('#drag-handles-layer .drag-handle.vertical');
        for (let i = 0; i < handles.length; i++) {
            const h = handles[i];
            if (_selectedRef.isSub) {
                if (h.dataset.subShelf === '1' &&
                    (+h.dataset.colIndex === _selectedRef.colIndex) &&
                    (+h.dataset.rowIndex === _selectedRef.rowIndex) &&
                    (+h.dataset.subCellIdx === _selectedRef.subCellIdx) &&
                    (+h.dataset.subShelfIdx === _selectedRef.subShelfIdx)) {
                    return h;
                }
            } else if (h.dataset.shelfIdx != null && h.dataset.subShelf !== '1' &&
                (+h.dataset.colIndex === _selectedRef.colIndex) &&
                (+h.dataset.shelfIdx === _selectedRef.shelfIdx)) {
                return h;
            }
        }
        return null;
    }

    function _updateTrashPos() {
        const btn = document.getElementById('sp-shelf-trash');
        const canvas = _getCanvas();
        const camera = _getCamera();
        if (!btn || !canvas || !camera || !_selectedMesh) return;

        const handle = _findShelfDragHandle();
        if (handle) {
            const hr = handle.getBoundingClientRect();
            // Visual right of the up/down drag arrows
            btn.style.left = Math.round(hr.right + 6) + 'px';
            btn.style.top = Math.round(hr.top + hr.height / 2) + 'px';
            return;
        }

        // Fallback: shelf mesh center
        _selectedMesh.getWorldPosition(_worldPos);
        _worldPos.project(camera);
        const rect = canvas.getBoundingClientRect();
        const x = (_worldPos.x * 0.5 + 0.5) * rect.width + rect.left;
        const y = (-_worldPos.y * 0.5 + 0.5) * rect.height + rect.top;
        btn.style.left = Math.round(x + 18) + 'px';
        btn.style.top = Math.round(y) + 'px';
    }
    window._updateShelfTrashPos = _updateTrashPos;

    function _onPointerMove(e) {
        if (!_enabled()) {
            if (_hoveredMesh && _hoveredMesh !== _selectedMesh) {
                _restoreLook(_hoveredMesh);
                _hoveredMesh = null;
            }
            return;
        }
        const hit = _raycast(e);
        const visual = hit ? _visualFromHit(hit) : null;
        _setHover(visual);
        if (_selectedMesh) _updateTrashPos();
        // Cursor hint when over a shelf
        const container = _getContainer();
        if (container && container.style) {
            if (visual) container.style.cursor = 'pointer';
            else if (!document.body.classList.contains('part-paint-active')) {
                // let CSS / orbit restore default — only clear if we set pointer
                if (container.style.cursor === 'pointer') container.style.cursor = '';
            }
        }
    }

    function _onKeyDown(e) {
        if (!_enabled()) return;
        if (e.key === 'Escape' && _selectedMesh) {
            _clearSelectionVisual();
            e.preventDefault();
            return;
        }
        if ((e.key === 'Delete' || e.key === 'Backspace') && _selectedRef) {
            const tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : '';
            if (tag === 'input' || tag === 'textarea' || (e.target && e.target.isContentEditable)) return;
            e.preventDefault();
            e.stopPropagation();
            window.deleteSelectedShelf();
        }
    }

    function _onResize() {
        if (_selectedMesh) _updateTrashPos();
    }

    /**
     * Called from ui.js pointerup when a click is detected.
     * @returns {'handled'|'none'}
     */
    window.handleShelfPickPointerUp = function (e) {
        if (!_enabled()) return 'none';
        if (e.target && e.target.closest && e.target.closest('#sp-shelf-trash')) return 'handled';
        const hit = _raycast(e);
        if (!hit) {
            if (_selectedRef) _clearSelectionVisual();
            return 'none';
        }
        const visual = _visualFromHit(hit);
        const ref = _parseShelfRef(hit) || _parseShelfRef(visual);
        if (!visual || !ref) return 'none';
        // Second click on the same shelf clears selection
        if (_selectedRef && _refsEqual(_selectedRef, ref)) {
            _clearSelectionVisual();
            _setHover(visual);
            return 'handled';
        }
        _selectVisual(visual, ref);
        return 'handled';
    };

    window.reapplyShelfSelectionAfterBuild = function () {
        if (!_selectedRef) return;
        // Materials were rebuilt — drop stale clones
        _savedLooks.clear();
        _hoveredMesh = null;
        const visual = _findVisualByRef(_selectedRef);
        if (!visual) {
            _selectedMesh = null;
            _hideTrash();
            return;
        }
        _selectedMesh = visual;
        _applyHighlight(visual, _selectColor, _SELECT_BLEND, _SELECT_EMISSIVE);
        _showTrash();
        _updateTrashPos();
    };

    window.clearShelfSelection = function () {
        if (_hoveredMesh && _hoveredMesh !== _selectedMesh) _restoreLook(_hoveredMesh);
        _hoveredMesh = null;
        _clearSelectionVisual();
        _savedLooks.clear();
    };

    window.deleteSelectedShelf = function () {
        if (!_selectedRef) return false;
        const ref = _selectedRef;
        let ok = false;
        if (ref.isSub) {
            ok = typeof window.deleteSubShelfAt === 'function' &&
                window.deleteSubShelfAt(ref.colIndex, ref.rowIndex, ref.subCellIdx, ref.subShelfIdx);
        } else {
            ok = typeof window.deleteShelfAt === 'function' &&
                window.deleteShelfAt(ref.colIndex, ref.shelfIdx);
        }
        _clearSelectionVisual();
        if (_hoveredMesh) {
            _restoreLook(_hoveredMesh);
            _hoveredMesh = null;
        }
        _savedLooks.clear();
        if (!ok) {
            if (typeof window._showToast === 'function') {
                window._showToast('לא ניתן למחוק את המדף', 2500);
            }
            return false;
        }
        if (typeof buildCabinet === 'function') buildCabinet();
        if (typeof calculatePrice === 'function') calculatePrice();
        if (typeof saveHistoryState === 'function') saveHistoryState();
        if (typeof updateQuickEditPanelUI === 'function') updateQuickEditPanelUI();
        return true;
    };

    window.enterShelfPickMode = function () { /* always-on */ };
    window.exitShelfPickMode = function () { window.clearShelfSelection(); };
    window.isShelfPickMode = function () { return false; };

    function _bindListeners() {
        if (_listenersBound || window._VIEWER_MODE) return;
        const container = _getContainer();
        if (!container) return;
        _listenersBound = true;
        // Listen on container so overlays with pointer-events:none still get moves via canvas,
        // and also when pointer is over the container generally.
        container.addEventListener('pointermove', _onPointerMove, { passive: true });
        document.addEventListener('keydown', _onKeyDown, true);
        window.addEventListener('resize', _onResize);
        window.addEventListener('scroll', _onResize, true);
    }

    function _tryBind() {
        if (window._VIEWER_MODE) return;
        _bindListeners();
        if (!_listenersBound) setTimeout(_tryBind, 200);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', _tryBind);
    } else {
        _tryBind();
    }
})();
