// ============================================================
// shelf-pick.js — Select shelves in the regular editor and delete
// Always available (no separate mode). Disabled in viewer / part-paint.
// ============================================================

(function () {
    'use strict';

    let _hoveredMesh = null;
    let _selectedMesh = null;
    let _selectedRef = null; // { colIndex, shelfIdx } | { colIndex, rowIndex, subCellIdx, subShelfIdx, isSub }
    let _originalMats = new Map(); // mesh → original material (shared)
    const _raycaster = new THREE.Raycaster();
    const _mouse = new THREE.Vector2();
    const _worldPos = new THREE.Vector3();
    let _listenersBound = false;

    function _enabled() {
        if (window._VIEWER_MODE) return false;
        if (typeof window.isPartPaintMode === 'function' && window.isPartPaintMode()) return false;
        if (document.body.classList.contains('part-paint-active')) return false;
        return true;
    }

    function _getCanvas() {
        if (window.renderer && window.renderer.domElement) return window.renderer.domElement;
        return document.querySelector('#canvas-container canvas');
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

    function _isShelfMesh(mesh) {
        return !!_parseShelfRef(mesh);
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

    function _cloneHighlight(mesh, color, intensity) {
        if (!mesh || !mesh.material) return;
        if (!_originalMats.has(mesh)) {
            _originalMats.set(mesh, mesh.material);
            mesh.material = mesh.material.clone();
        }
        const mat = mesh.material;
        if (mat.emissive) {
            mat.emissive.setHex(color);
            mat.emissiveIntensity = intensity;
        }
    }

    function _restoreMat(mesh) {
        if (!mesh) return;
        const orig = _originalMats.get(mesh);
        if (orig) {
            mesh.material = orig;
            _originalMats.delete(mesh);
        }
    }

    function _setHover(mesh) {
        if (_hoveredMesh === mesh) return;
        if (_hoveredMesh && _hoveredMesh !== _selectedMesh) {
            _restoreMat(_hoveredMesh);
        }
        _hoveredMesh = mesh;
        if (mesh && mesh !== _selectedMesh) {
            _cloneHighlight(mesh, 0x38bdf8, 0.4);
        }
    }

    function _clearSelectionVisual() {
        if (_selectedMesh) {
            _restoreMat(_selectedMesh);
            _selectedMesh = null;
        }
        _selectedRef = null;
        _hideTrash();
    }

    function _selectMesh(mesh) {
        const ref = _parseShelfRef(mesh);
        if (!ref) return;
        if (_selectedMesh && _selectedMesh !== mesh) {
            _restoreMat(_selectedMesh);
        }
        _selectedMesh = mesh;
        _selectedRef = ref;
        // Strong amber/red highlight on the selected shelf only
        _cloneHighlight(mesh, 0xf97316, 0.65);
        _showTrash();
        _updateTrashPos();
    }

    function _findMeshByRef(ref) {
        if (!ref || !window.partMeshes) return null;
        for (let i = 0; i < window.partMeshes.length; i++) {
            const m = window.partMeshes[i];
            if (!m || m.visible === false) continue;
            const r = _parseShelfRef(m);
            if (_refsEqual(r, ref)) return m;
        }
        return null;
    }

    function _raycast(event) {
        const canvas = _getCanvas();
        const camera = _getCamera();
        if (!canvas || !camera) return null;
        const rect = canvas.getBoundingClientRect();
        _mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        _mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        _raycaster.setFromCamera(_mouse, camera);
        const meshes = (window.partMeshes || []).filter(function (m) {
            return m && m.visible !== false && _isShelfMesh(m);
        });
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

    function _updateTrashPos() {
        const btn = document.getElementById('sp-shelf-trash');
        const canvas = _getCanvas();
        const camera = _getCamera();
        if (!btn || !canvas || !camera || !_selectedMesh) return;
        _selectedMesh.getWorldPosition(_worldPos);
        _worldPos.project(camera);
        const rect = canvas.getBoundingClientRect();
        const x = (_worldPos.x * 0.5 + 0.5) * rect.width + rect.left;
        const y = (-_worldPos.y * 0.5 + 0.5) * rect.height + rect.top;
        btn.style.left = Math.round(x) + 'px';
        btn.style.top = Math.round(y) + 'px';
    }

    function _onMouseMove(e) {
        if (!_enabled()) {
            if (_hoveredMesh && _hoveredMesh !== _selectedMesh) {
                _restoreMat(_hoveredMesh);
                _hoveredMesh = null;
            }
            return;
        }
        const mesh = _raycast(e);
        _setHover(mesh);
        if (_selectedMesh) _updateTrashPos();
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
        const mesh = _raycast(e);
        if (!mesh) {
            if (_selectedRef) _clearSelectionVisual();
            return 'none';
        }
        _selectMesh(mesh);
        return 'handled';
    };

    window.reapplyShelfSelectionAfterBuild = function () {
        if (!_selectedRef) return;
        const mesh = _findMeshByRef(_selectedRef);
        if (!mesh) {
            _selectedMesh = null;
            _hideTrash();
            return;
        }
        _selectedMesh = mesh;
        _cloneHighlight(mesh, 0xf97316, 0.65);
        _showTrash();
        _updateTrashPos();
    };

    window.clearShelfSelection = function () {
        if (_hoveredMesh && _hoveredMesh !== _selectedMesh) _restoreMat(_hoveredMesh);
        _hoveredMesh = null;
        _clearSelectionVisual();
        _originalMats.clear();
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
            _restoreMat(_hoveredMesh);
            _hoveredMesh = null;
        }
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

    // Legacy stubs — mode buttons removed; keep no-op for old onclick / part-paint
    window.enterShelfPickMode = function () { /* always-on */ };
    window.exitShelfPickMode = function () { window.clearShelfSelection(); };
    window.isShelfPickMode = function () { return false; };

    function _bindListeners() {
        if (_listenersBound || window._VIEWER_MODE) return;
        const canvas = _getCanvas();
        if (!canvas) return;
        _listenersBound = true;
        canvas.addEventListener('mousemove', _onMouseMove, { passive: true });
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
