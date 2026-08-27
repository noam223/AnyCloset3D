// ============================================================
// part-paint.js — Advanced per-part color editing mode
// ============================================================
// Public API:
//   window.enterPartPaintMode()  — activate mode
//   window.exitPartPaintMode()   — deactivate mode
// ============================================================

(function () {
    'use strict';

    // ── State ────────────────────────────────────────────────
    let _active = false;
    let _hoveredMesh = null;
    let _originalEmissive = new Map(); // mesh → original emissive color hex
    let _panelOpen = false;
    let _pendingMesh = null;
    let _pendingPartId = null;

    // ── Raycaster (reuse Three.js objects) ──────────────────
    const _raycaster = new THREE.Raycaster();
    const _mouse = new THREE.Vector2();

    // ── Helpers ─────────────────────────────────────────────
    function _getCanvas() {
        // renderer is a global defined in engine.js
        if (window.renderer && window.renderer.domElement) return window.renderer.domElement;
        return document.querySelector('#canvas-container canvas');
    }

    function _getCamera() {
        return window.camera;
    }

    function _solidColorsList() {
        return [
            { key: 'white_matte', bg: '#f7f7f7', border: '#ccc',  label: 'לבן מט 2100' },
            { key: 'c3110',       bg: '#f0ede9', border: '#bbb',  label: '3110' },
            { key: 'c795',        bg: '#ece0d4', border: '#bbb',  label: '759' },
            { key: 'c705',        bg: '#dbd6c6', border: '#bbb',  label: '705' },
            { key: 'u727',        bg: '#a79786', border: '#bbb',  label: 'U727' },
            { key: 'w1200',       bg: '#e7e1da', border: '#bbb',  label: 'W1200' },
            { key: 'u232',        bg: '#c59578', border: '#bbb',  label: 'U232' },
            { key: 'u604',        bg: '#8f8e76', border: '#bbb',  label: 'U604' },
            { key: 'u638',        bg: '#c0b598', border: '#bbb',  label: 'U638' },
            { key: 'c3207',       bg: '#F7ECD9', border: '#bbb',  label: '3207' },
            { key: 'black_matte', bg: '#2a2a2a', border: '#444',  label: 'שחור מט' },
        ];
    }

    function _textureColorsList() {
        return [
            { key: '2020',  img: 'textures/2020.jpg',  label: '2020' },
            { key: '2024',  img: 'textures/2024.jpg',  label: '2024' },
            { key: 'H1367', img: 'textures/H1367.jpg', label: 'H1367' },
            { key: 'H1307', img: 'textures/H1307.jpg', label: 'H1307' },
            { key: 'H1227', img: 'textures/H1227.jpg', label: 'H1227' },
            { key: '2025',  img: 'textures/2025.jpg',  label: '2025' },
            { key: '2040',  img: 'textures/2040.jpg',  label: '2040' },
            { key: '2041',  img: 'textures/2041.jpg',  label: '2041' },
            { key: '2044',  img: 'textures/2044.jpg',  label: '2044' },
            { key: '2047',  img: 'textures/2047.jpg',  label: '2047' },
            { key: '2049',  img: 'textures/2049.jpg',  label: '2049' },
            { key: '2062',  img: 'textures/2062.jpg',  label: '2062' },
            { key: '5600',  img: 'textures/5600.jpg',  label: '5600' },
            { key: '7180',  img: 'textures/7180.jpg',  label: '7180' },
            { key: '456',   img: 'textures/456.jpg',   label: '456' },
            { key: '462',   img: 'textures/462.jpg',   label: '462' },
            { key: '463',   img: 'textures/463.jpg',   label: '463' },
            { key: '464',   img: 'textures/464.jpg',   label: '464' },
            { key: '480',   img: 'textures/480.jpg',   label: '480' },
        ];
    }

    // ── Hover highlight ──────────────────────────────────────
    function _setHover(mesh) {
        if (_hoveredMesh === mesh) return;
        // Restore previous
        if (_hoveredMesh) {
            _restoreEmissive(_hoveredMesh);
        }
        _hoveredMesh = mesh;
        if (mesh) {
            _saveAndSetEmissive(mesh, 0x4488ff, 0.35);
        }
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

    // ── Raycast ──────────────────────────────────────────────
    function _raycast(event) {
        const canvas = _getCanvas();
        const camera = _getCamera();
        if (!canvas || !camera) return null;

        const rect = canvas.getBoundingClientRect();
        _mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        _mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        _raycaster.setFromCamera(_mouse, camera);
        const meshes = window.partMeshes || [];
        const hits = _raycaster.intersectObjects(meshes, false);
        return hits.length > 0 ? hits[0].object : null;
    }

    // ── Floating panel ───────────────────────────────────────
    function _buildPanel() {
        let panel = document.getElementById('pp-color-panel');
        if (panel) return panel;

        panel = document.createElement('div');
        panel.id = 'pp-color-panel';
        panel.className = 'pp-color-panel';
        panel.style.display = 'none';
        panel.innerHTML = `
            <div class="pp-panel-header">
                <span class="pp-panel-title">בחר צבע לחלק</span>
                <button class="pp-panel-close" id="pp-panel-close-btn" title="סגור">✕</button>
            </div>
            <div class="pp-panel-reset-row">
                <button class="pp-reset-btn" id="pp-reset-part-btn">
                    <i class="fa-solid fa-rotate-right"></i> אפס לצבע ברירת מחדל
                </button>
            </div>
            <div class="pp-swatches" id="pp-swatches"></div>
        `;
        document.body.appendChild(panel);

        document.getElementById('pp-panel-close-btn').addEventListener('click', _closePanel);
        document.getElementById('pp-reset-part-btn').addEventListener('click', _resetPartColor);

        return panel;
    }

    function _populateSwatches() {
        const container = document.getElementById('pp-swatches');
        if (!container) return;
        container.innerHTML = '';

        const currentKey = (_pendingPartId && state.partColors) ? state.partColors[_pendingPartId] : null;

        // ── Solid colors ──
        const solidLabel = document.createElement('div');
        solidLabel.className = 'pp-swatch-section-label';
        solidLabel.textContent = 'צבעים אחידים';
        container.appendChild(solidLabel);

        const solidGrid = document.createElement('div');
        solidGrid.className = 'pp-swatches-grid';
        _solidColorsList().forEach(c => {
            const btn = document.createElement('button');
            btn.className = 'pp-swatch pp-swatch-round' + (c.key === currentKey ? ' pp-swatch-active' : '');
            btn.title = c.label;
            btn.style.cssText = `background:${c.bg};border:2px solid ${c.border};`;
            btn.dataset.colorKey = c.key;
            btn.addEventListener('click', () => _applyColor(c.key));
            solidGrid.appendChild(btn);
        });
        container.appendChild(solidGrid);

        // ── Texture colors ──
        const texLabel = document.createElement('div');
        texLabel.className = 'pp-swatch-section-label';
        texLabel.style.marginTop = '8px';
        texLabel.textContent = 'עץ / טקסטורה';
        container.appendChild(texLabel);

        const texGrid = document.createElement('div');
        texGrid.className = 'pp-swatches-grid';
        _textureColorsList().forEach(c => {
            const btn = document.createElement('button');
            btn.className = 'pp-swatch pp-swatch-tex' + (c.key === currentKey ? ' pp-swatch-active' : '');
            btn.title = c.label;
            btn.style.cssText = `background-image:url('${c.img}');background-size:cover;border:2px solid #bbb;`;
            btn.dataset.colorKey = c.key;
            btn.addEventListener('click', () => _applyColor(c.key));
            texGrid.appendChild(btn);
        });
        container.appendChild(texGrid);
    }

    function _openPanel(x, y, mesh, partId) {
        _pendingMesh = mesh;
        _pendingPartId = partId;

        const panel = _buildPanel();
        _populateSwatches();

        panel.style.display = 'block';

        // Position near click, keep inside viewport
        const pw = 260, ph = 380;
        const vw = window.innerWidth, vh = window.innerHeight;
        let left = x + 12;
        let top = y - 20;
        if (left + pw > vw - 10) left = x - pw - 12;
        if (top + ph > vh - 10) top = vh - ph - 10;
        if (top < 10) top = 10;
        panel.style.left = left + 'px';
        panel.style.top = top + 'px';

        _panelOpen = true;
    }

    function _closePanel() {
        const panel = document.getElementById('pp-color-panel');
        if (panel) panel.style.display = 'none';
        _panelOpen = false;
        _pendingMesh = null;
        _pendingPartId = null;
    }

    function _applyColor(colorKey) {
        if (!_pendingPartId) return;
        if (!state.partColors) state.partColors = {};
        state.partColors[_pendingPartId] = colorKey;

        // Rebuild so the override takes effect
        if (typeof buildCabinet === 'function') buildCabinet();
        if (typeof saveHistoryState === 'function') saveHistoryState();

        _closePanel();
    }

    function _resetPartColor() {
        if (!_pendingPartId) return;
        if (state.partColors) {
            delete state.partColors[_pendingPartId];
        }
        if (typeof buildCabinet === 'function') buildCabinet();
        if (typeof saveHistoryState === 'function') saveHistoryState();
        _closePanel();
    }

    // ── Event handlers ───────────────────────────────────────
    function _onMouseMove(e) {
        if (!_active || _panelOpen) return;
        const mesh = _raycast(e);
        _setHover(mesh && mesh.userData && mesh.userData.partId ? mesh : null);
    }

    function _onClick(e) {
        if (!_active) return;

        // If panel is open and click is outside panel → close
        if (_panelOpen) {
            const panel = document.getElementById('pp-color-panel');
            if (panel && !panel.contains(e.target)) {
                _closePanel();
            }
            return;
        }

        const mesh = _raycast(e);
        if (!mesh || !mesh.userData || !mesh.userData.partId) return;

        e.stopPropagation();
        _openPanel(e.clientX, e.clientY, mesh, mesh.userData.partId);
    }

    function _onKeyDown(e) {
        if (!_active) return;
        if (e.key === 'Escape') {
            if (_panelOpen) _closePanel();
            else exitPartPaintMode();
        }
    }

    // ── Banner ───────────────────────────────────────────────
    function _showBanner() {
        let banner = document.getElementById('pp-mode-banner');
        if (!banner) {
            banner = document.createElement('div');
            banner.id = 'pp-mode-banner';
            banner.className = 'pp-mode-banner';
            banner.innerHTML = `
                <i class="fa-solid fa-paintbrush"></i>
                <span>מצב עריכת צבעים מתקדמת — לחץ על חלק לשינוי צבעו</span>
                <button onclick="exitPartPaintMode()" class="pp-exit-btn">
                    <i class="fa-solid fa-xmark"></i> יציאה
                </button>
            `;
            document.body.appendChild(banner);
        }
        banner.style.display = 'flex';
    }

    function _hideBanner() {
        const banner = document.getElementById('pp-mode-banner');
        if (banner) banner.style.display = 'none';
    }

    // ── Public API ───────────────────────────────────────────
    window.enterPartPaintMode = function () {
        if (_active) return;
        _active = true;

        document.body.classList.add('part-paint-active');
        _showBanner();

        const canvas = _getCanvas();
        if (canvas) {
            canvas.addEventListener('mousemove', _onMouseMove, { passive: true });
            canvas.addEventListener('click', _onClick);
        }
        document.addEventListener('keydown', _onKeyDown);

        // Rebuild to populate window.partMeshes
        if (typeof buildCabinet === 'function') buildCabinet();
    };

    window.exitPartPaintMode = function () {
        if (!_active) return;
        _active = false;

        // Restore any lingering hover
        if (_hoveredMesh) {
            _restoreEmissive(_hoveredMesh);
            _hoveredMesh = null;
        }
        _originalEmissive.clear();
        _closePanel();

        document.body.classList.remove('part-paint-active');
        _hideBanner();

        const canvas = _getCanvas();
        if (canvas) {
            canvas.removeEventListener('mousemove', _onMouseMove);
            canvas.removeEventListener('click', _onClick);
        }
        document.removeEventListener('keydown', _onKeyDown);
    };

})();
