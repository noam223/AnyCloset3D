// ============================================================
// shelf-pick.js — Select a shelf in 3D and delete it
// ============================================================
// Public API:
//   window.enterShelfPickMode()
//   window.exitShelfPickMode()
//   window.deleteSelectedShelf()
// ============================================================

(function () {
    'use strict';

    let _active = false;
    let _hoveredMesh = null;
    let _selectedMesh = null;
    let _selectedRef = null; // { colIndex, shelfIdx }
    let _originalEmissive = new Map();
    const _raycaster = new THREE.Raycaster();
    const _mouse = new THREE.Vector2();
    const _worldPos = new THREE.Vector3();

    function _getCanvas() {
        if (window.renderer && window.renderer.domElement) return window.renderer.domElement;
        return document.querySelector('#canvas-container canvas');
    }

    function _getCamera() {
        return window.camera;
    }

    function _parseShelfRef(mesh) {
        if (!mesh || !mesh.userData) return null;
        if (mesh.userData.shelfRef &&
            mesh.userData.shelfRef.colIndex != null &&
            mesh.userData.shelfRef.shelfIdx != null) {
            return {
                colIndex: mesh.userData.shelfRef.colIndex | 0,
                shelfIdx: mesh.userData.shelfRef.shelfIdx | 0
            };
        }
        const id = mesh.userData.partId || '';
        const m = String(id).match(/shelf_c(\d+)_r(\d+)$/);
        if (!m) return null;
        return { colIndex: +m[1], shelfIdx: +m[2] };
    }

    function _isShelfMesh(mesh) {
        return !!_parseShelfRef(mesh);
    }

    function _saveAndSetEmissive(mesh, color, intensity) {
        if (!mesh || !mesh.material) return;
        const mat = mesh.material;
        if (!_originalEmissive.has(mesh)) {
            _originalEmissive.set(mesh, {
                color: mat.emissive ? mat.emissive.getHex() : 0x000000,
                intensity: mat.emissiveIntensity !== undefined ? mat.emissiveIntensity : 0
            });
        }
        if (mat.emissive) {
            mat.emissive.setHex(color);
            mat.emissiveIntensity = intensity;
        }
    }

    function _restoreEmissive(mesh) {
        if (!mesh || !mesh.material) return;
        const saved = _originalEmissive.get(mesh);
        if (saved && mesh.material.emissive) {
            mesh.material.emissive.setHex(saved.color);
            mesh.material.emissiveIntensity = saved.intensity;
        }
        _originalEmissive.delete(mesh);
    }

    function _setHover(mesh) {
        if (_hoveredMesh === mesh) return;
        if (_hoveredMesh && _hoveredMesh !== _selectedMesh) {
            _restoreEmissive(_hoveredMesh);
        }
        _hoveredMesh = mesh;
        if (mesh && mesh !== _selectedMesh) {
            _saveAndSetEmissive(mesh, 0x4488ff, 0.35);
        }
    }

    function _clearSelectionVisual() {
        if (_selectedMesh) {
            _restoreEmissive(_selectedMesh);
            _selectedMesh = null;
        }
        _selectedRef = null;
        _hideTrash();
    }

    function _selectMesh(mesh) {
        const ref = _parseShelfRef(mesh);
        if (!ref) return;
        if (_selectedMesh && _selectedMesh !== mesh) {
            _restoreEmissive(_selectedMesh);
        }
        _selectedMesh = mesh;
        _selectedRef = ref;
        _saveAndSetEmissive(mesh, 0xef4444, 0.45);
        _showTrash();
        _updateTrashPos();
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

    function _showBanner() {
        let banner = document.getElementById('sp-mode-banner');
        if (!banner) {
            banner = document.createElement('div');
            banner.id = 'sp-mode-banner';
            banner.className = 'pp-mode-banner';
            banner.innerHTML =
                '<i class="fa-solid fa-layer-group" style="color:#f87171;"></i>' +
                '<span>מחיקת מדף — לחץ על מדף לסימון, Delete או הפח למחיקה</span>' +
                '<button type="button" onclick="exitShelfPickMode()" class="pp-exit-btn">' +
                '<i class="fa-solid fa-xmark"></i> יציאה</button>';
            document.body.appendChild(banner);
        }
        banner.style.display = 'flex';
    }

    function _hideBanner() {
        const banner = document.getElementById('sp-mode-banner');
        if (banner) banner.style.display = 'none';
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
        if (!_active) return;
        const mesh = _raycast(e);
        _setHover(mesh);
        if (_selectedMesh) _updateTrashPos();
    }

    function _onClick(e) {
        if (!_active) return;
        if (e.target && e.target.closest && e.target.closest('#sp-shelf-trash')) return;
        const mesh = _raycast(e);
        if (!mesh) {
            _clearSelectionVisual();
            return;
        }
        e.stopPropagation();
        _selectMesh(mesh);
    }

    function _onKeyDown(e) {
        if (!_active) return;
        if (e.key === 'Escape') {
            if (_selectedMesh) _clearSelectionVisual();
            else exitShelfPickMode();
            e.preventDefault();
            return;
        }
        if ((e.key === 'Delete' || e.key === 'Backspace') && _selectedRef) {
            e.preventDefault();
            e.stopPropagation();
            window.deleteSelectedShelf();
        }
    }

    function _onResize() {
        if (_active && _selectedMesh) _updateTrashPos();
    }

    window.deleteSelectedShelf = function () {
        if (!_selectedRef) return false;
        const { colIndex, shelfIdx } = _selectedRef;
        const ok = typeof window.deleteShelfAt === 'function' &&
            window.deleteShelfAt(colIndex, shelfIdx);
        _clearSelectionVisual();
        if (_hoveredMesh) {
            _restoreEmissive(_hoveredMesh);
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

    window.enterShelfPickMode = function () {
        if (_active) return;
        if (typeof window.exitPartPaintMode === 'function') {
            try { window.exitPartPaintMode(); } catch (err) { /* ignore */ }
        }
        _active = true;
        document.body.classList.add('shelf-pick-active');
        _showBanner();

        const canvas = _getCanvas();
        if (canvas) {
            canvas.addEventListener('mousemove', _onMouseMove, { passive: true });
            canvas.addEventListener('click', _onClick, true);
        }
        document.addEventListener('keydown', _onKeyDown, true);
        window.addEventListener('resize', _onResize);

        if (typeof buildCabinet === 'function') buildCabinet();
    };

    window.exitShelfPickMode = function () {
        if (!_active) return;
        _active = false;

        if (_hoveredMesh && _hoveredMesh !== _selectedMesh) {
            _restoreEmissive(_hoveredMesh);
        }
        _hoveredMesh = null;
        _clearSelectionVisual();
        _originalEmissive.clear();

        document.body.classList.remove('shelf-pick-active');
        _hideBanner();
        _hideTrash();

        const canvas = _getCanvas();
        if (canvas) {
            canvas.removeEventListener('mousemove', _onMouseMove);
            canvas.removeEventListener('click', _onClick, true);
        }
        document.removeEventListener('keydown', _onKeyDown, true);
        window.removeEventListener('resize', _onResize);
    };

    window.isShelfPickMode = function () {
        return _active;
    };
})();
