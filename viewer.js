// ==========================================
// viewer.js — Live Read-Only Cabinet Viewer
// ==========================================
// Loaded by viewer.html only.
// No auth required — project loaded by share_token.
// Features:
//   • Load project state from Supabase by token
//   • Render full cabinet UI in read-only mode
//   • Supabase Realtime subscription for live updates
//   • Polling fallback every 1.5s if Realtime unavailable
//   • Per-cabinet notes via project_messages table
//   • Cabinet card navigation with thumbnails, dims, material swatches
//   • Notes panel with per-cabinet tabs
//   • Designer replies visible as blue bubbles
// ==========================================

(function() {
'use strict';

// ── Constants ────────────────────────────────────────────────────────────────
var SUPABASE_URL  = 'https://meqxnsjycvfgfhdepguo.supabase.co';
var SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1lcXhuc2p5Y3ZmZ2ZoZGVwZ3VvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY3MDA5NDAsImV4cCI6MjA5MjI3Njk0MH0.w63bl0-1-Rgt9Nx6sVW5ueEGMojiMaxoehlPXlPH2N0';
var POLL_INTERVAL = 1500;

// ── Material catalog — solid colors first, then textures ─────────────────────
var MATERIAL_LIST = [
    // ── Solid colors ──
    { key: 'white_matte', bg: '#f7f7f7',  label: 'לבן מט 2100' },
    { key: 'c3110',       bg: '#f0ede9',  label: '3110' },
    { key: 'c795',        bg: '#ece0d4',  label: '759' },
    { key: 'c705',        bg: '#dbd6c6',  label: '705' },
    { key: 'u727',        bg: '#a79786',  label: 'U727' },
    { key: 'w1200',       bg: '#e7e1da',  label: 'W1200' },
    { key: 'u232',        bg: '#c59578',  label: 'U232' },
    { key: 'u604',        bg: '#8f8e76',  label: 'U604' },
    { key: 'u638',        bg: '#c0b598',  label: 'U638' },
    { key: 'c3207',       bg: '#F7ECD9',  label: '3207' },
    { key: 'black_matte', bg: '#2a2a2a',  label: 'שחור מט' },
    // ── Textures ──
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
    { key: '480',   img: 'textures/480.jpg',   label: '480' }
];

// ── Derived lookup maps ───────────────────────────────────────────────────────
var MATERIAL_COLORS = {};
var MATERIAL_NAMES  = {};
MATERIAL_LIST.forEach(function(m) {
    MATERIAL_COLORS[m.key] = m.bg || '#c8a87a';
    MATERIAL_NAMES[m.key]  = m.label;
});

// ── State ────────────────────────────────────────────────────────────────────
var _sb              = null;
var _token           = null;
var _projectId       = null;
var _lastUpdatedAt   = null;
var _pollTimer       = null;
var _realtimeChannel = null;
var _clientName      = null;

// Cabinet navigation
var _projectData     = null;
var _cabinetList     = [];     // { label, rawState, wings, presetId, thumbnail, dims, materialBody }
var _activeCabIdx    = 0;
var _liveMode        = true;

// Notes
var _notesChannel    = null;
var _notesOpen       = false;
var _notesCabIdx     = 0;      // which cabinet's notes are shown in the panel
var _notesCountPerCab = {};    // { cabIdx: count }
var _unreadCountPerCab = {};   // { cabIdx: unreadCount }
var _totalUnread     = 0;

// Viewer color overrides (local only, not saved to DB)
// { cabIdx: { body: 'matKey', doors: 'matKey', internal: 'matKey' } }
var _viewerColorOverrides = {};
var _colorPickerField     = null;  // which field is being edited: 'body'|'doors'|'internal'
var _colorPickerCabIdx    = null;

// ── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', function() {
    _token = new URLSearchParams(window.location.search).get('token');
    if (!_token) {
        _showError('קישור לא תקין', 'חסר מזהה פרויקט בקישור. בקש קישור חדש מהמעצב.');
        return;
    }

    if (typeof supabase === 'undefined') {
        _showError('שגיאת טעינה', 'לא ניתן לטעון את הספרייה. נסה לרענן את הדף.');
        return;
    }
    _sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON);

    // Resize handler
    window.addEventListener('resize', function() {
        _syncCanvasTop();
        var cam  = window.camera;
        var ren  = window.renderer;
        var cont = document.getElementById('canvas-container');
        if (cam && ren && cont) {
            cam.aspect = cont.clientWidth / cont.clientHeight;
            cam.updateProjectionMatrix();
            ren.setSize(cont.clientWidth, cont.clientHeight);
        }
    });

    // Keyboard detection via visualViewport
    if (window.visualViewport) {
        var _vvBaseHeight = window.visualViewport.height;
        var _keyboardOpen = false;

        window.visualViewport.addEventListener('resize', function() {
            var currentH = window.visualViewport.height;
            var isKeyboard = currentH < _vvBaseHeight * 0.75;
            if (isKeyboard === _keyboardOpen) return;
            _keyboardOpen = isKeyboard;

            var panel = document.getElementById('viewer-notes-panel');
            if (!panel) return;

            if (isKeyboard) {
                panel.classList.add('keyboard-open');
                document.body.classList.remove('notes-open');
            } else {
                panel.classList.remove('keyboard-open');
                if (_notesOpen) document.body.classList.add('notes-open');
                _vvBaseHeight = window.visualViewport.height;
                var list = document.getElementById('viewer-notes-list');
                if (list) list.scrollTop = list.scrollHeight;
            }
        });

        window.addEventListener('orientationchange', function() {
            setTimeout(function() { _vvBaseHeight = window.visualViewport.height; }, 400);
        });
    }

    _loadProject();
});

// ── Load project by token ────────────────────────────────────────────────────
async function _loadProject() {
    _setLoadingText('מחפש פרויקט...');
    try {
        var result = await _sb
            .from('projects')
            .select('id, name, project_data, share_token, share_token_expires_at, updated_at, order_status')
            .eq('share_token', _token)
            .single();

        if (result.error || !result.data) {
            _showError('פרויקט לא נמצא', 'הקישור אינו תקין או שהמעצב ביטל את השיתוף.');
            return;
        }

        // Check if share token has expired
        if (result.data.share_token_expires_at && new Date(result.data.share_token_expires_at) < new Date()) {
            _showError('הקישור פג תוקף', 'קישור הצפייה פג תוקף. בקש קישור חדש מהמעצב.');
            return;
        }

        var project = result.data;
        _projectId     = project.id;
        _lastUpdatedAt = project.updated_at;

        document.title = project.name || 'פרויקט חדש';

        _showViewerUI(project.name);

        _setLoadingText('בונה הדמייה...');
        _projectData = project.project_data;
        if (project.order_status && _projectData && !_projectData.orderStatus) {
            _projectData.orderStatus = project.order_status;
        }
        window._viewerOrderStatus = project.order_status
            || (_projectData && _projectData.orderStatus)
            || 'quote';
        _applyLiveProjectData(_projectData, { followLive: true, captureThumb: true });

        _initViewerView();
        _setupRealtime();

        // Load notes counts for all cabinets, then load notes for current
        _loadAllNotesCounts().then(function() {
            _loadNotesForCabinet(_activeCabIdx);
            if (typeof window._viewerExtrasOnReady === 'function') {
                window._viewerExtrasOnReady();
            }
        });

    } catch(e) {
        console.error('[Viewer] Load error:', e);
        _showError('שגיאה בטעינה', 'אירעה שגיאה. נסה לרענן את הדף.');
    }
}

/** Active cabinet index the designer is editing (from snap). */
function _resolveLiveCabIndex(projectData) {
    var cart = (projectData && (projectData.orderCart || projectData.cart)) || [];
    var len = cart.length || (_cabinetList ? _cabinetList.length : 0);
    var idx = (projectData && typeof projectData.editingCartIndex === 'number')
        ? projectData.editingCartIndex
        : 0;
    if (idx < 0) idx = 0;
    if (len > 0 && idx >= len) idx = len - 1;
    return idx;
}

/**
 * Apply project data to the viewer.
 * followLive: restore designer's live canvas (top-level wings) and highlight editingCartIndex.
 */
function _applyLiveProjectData(projectData, opts) {
    opts = opts || {};
    if (!projectData) return;

    _buildCabinetList(projectData);

    if (opts.followLive || _liveMode) {
        _liveMode = true;
        _activeCabIdx = _resolveLiveCabIndex(projectData);
        _updateLiveBadge();
        _renderCabinetNav();
        _scrollActiveCabIntoView();

        // Live canvas = top-level wings from designer; fall back to cart item rawState
        var liveIdx = _activeCabIdx;
        var cab = _cabinetList[liveIdx];
        if (projectData.wings) {
            _restoreState({
                wings: projectData.wings,
                activeWing: projectData.activeWing || (cab && cab.activeWing) || 'center',
                presetId: projectData.presetId || (cab && cab.presetId) || 'linear',
                orderCart: projectData.orderCart || projectData.cart,
                customer: projectData.customer
            });
        } else if (cab) {
            _restoreState({
                wings: cab.wings,
                activeCabinet: cab.activeCabinet,
                presetId: cab.presetId,
                activeWing: cab.activeWing,
                orderCart: projectData.orderCart || projectData.cart,
                customer: projectData.customer
            });
        } else {
            _restoreState(projectData);
        }

        // Keep list metadata (dims/swatches) in sync with live wings for the active card
        if (cab && projectData.wings) {
            var center = projectData.wings.center || {};
            cab.wings = projectData.wings;
            cab.presetId = projectData.presetId || cab.presetId;
            cab.activeWing = projectData.activeWing || cab.activeWing;
            cab.dims = {
                w: center.width || cab.dims.w || 0,
                h: center.globalHeight || cab.dims.h || 0,
                d: center.depth || cab.dims.d || 0
            };
            cab.materialBody = center.materialBody || cab.materialBody;
            cab.materialDoors = center.materialExternal || cab.materialDoors;
            cab.materialInternal = center.materialInternal || cab.materialInternal;
            _renderCabinetNav();
            _scrollActiveCabIntoView();
        }

        _updateInfoStrip();
        if (opts.captureThumb) {
            setTimeout(function() { _captureSnapshot(_activeCabIdx); }, 400);
        }
        // Keep notes panel aligned with the designer’s active cabinet while LIVE
        if (_notesOpen) {
            _notesCabIdx = _activeCabIdx;
            _loadNotesForCabinet(_activeCabIdx);
            if (typeof _renderNotesCabTabs === 'function') _renderNotesCabTabs();
        }
        if (typeof window._viewerExtrasOnLiveFollow === 'function') {
            window._viewerExtrasOnLiveFollow(_activeCabIdx, projectData);
        }
    } else {
        // Browse mode: refresh list only; keep current 3D until client switches
        _renderCabinetNav();
    }
}

function _scrollActiveCabIntoView() {
    try {
        var card = document.querySelector('.viewer-cab-card[data-idx="' + _activeCabIdx + '"]');
        if (card && typeof card.scrollIntoView === 'function') {
            card.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
        }
    } catch (e) { /* ignore */ }
}

// ── Build cabinet list from project data ─────────────────────────────────────
function _buildCabinetList(projectData) {
    var prevThumbs = (_cabinetList || []).map(function(c) { return c && c.thumbnail; });
    _cabinetList = [];

    var cart = projectData.orderCart || projectData.cart || [];
    var cartEntries = cart.map(function(item, idx) {
        var spec     = item.spec || {};
        var rawState = item.rawState || {};
        var label    = spec.customName || spec.dimsStr || ('ארון ' + (idx + 1));
        var hasWings = rawState.wings && (rawState.wings.center || rawState.wings.left || rawState.wings.right);

        // Extract dims from spec or rawState
        var w = rawState.width || (rawState.wings && rawState.wings.center && rawState.wings.center.width) || 0;
        var h = rawState.globalHeight || (rawState.wings && rawState.wings.center && rawState.wings.center.globalHeight) || 0;
        var d = rawState.depth || (rawState.wings && rawState.wings.center && rawState.wings.center.depth) || 0;
        var matBody = rawState.materialBody || (rawState.wings && rawState.wings.center && rawState.wings.center.materialBody) || '';
        var matDoors = rawState.materialExternal || (rawState.wings && rawState.wings.center && rawState.wings.center.materialExternal) || '';
        var matInternal = rawState.materialInternal || (rawState.wings && rawState.wings.center && rawState.wings.center.materialInternal) || '';

        return {
            label: label,
            wings: hasWings ? rawState.wings : (item.wings || null),
            activeCabinet: hasWings ? null : rawState,
            presetId: rawState.presetId || item.presetId || 'linear',
            activeWing: rawState.activeWing || item.activeWing || 'center',
            thumbnail: prevThumbs[idx] || null,
            dims: { w: w, h: h, d: d },
            materialBody: matBody,
            materialDoors: matDoors,
            materialInternal: matInternal
        };
    });

    if (cartEntries.length > 0) {
        _cabinetList = cartEntries;
    } else {
        var pd = projectData;
        _cabinetList = [{
            label: 'ארון נוכחי',
            wings: pd.wings || null,
            activeCabinet: pd.activeCabinet || null,
            presetId: pd.presetId || 'linear',
            activeWing: pd.activeWing || 'center',
            thumbnail: null,
            dims: { w: pd.width || 0, h: pd.globalHeight || 0, d: pd.depth || 0 },
            materialBody: pd.materialBody || '',
            materialDoors: pd.materialExternal || '',
            materialInternal: pd.materialInternal || ''
        }];
    }

    if (_liveMode) {
        _activeCabIdx = _resolveLiveCabIndex(projectData);
    } else if (_activeCabIdx >= _cabinetList.length) {
        _activeCabIdx = Math.max(0, _cabinetList.length - 1);
    }
    _renderCabinetNav();
}

// ── Capture snapshot of current canvas into cabinet thumbnail ─────────────────
function _captureSnapshot(idx) {
    try {
        var ren = window.renderer;
        if (!ren || !ren.domElement) return;
        // Force a render pass
        if (window.scene && window.camera) {
            ren.render(window.scene, window.camera);
        }
        var dataUrl = ren.domElement.toDataURL('image/jpeg', 0.55);
        if (_cabinetList[idx]) {
            _cabinetList[idx].thumbnail = dataUrl;
            _updateCardThumbnail(idx, dataUrl);
        }
    } catch(e) {
        // WebGL preserveDrawingBuffer may be false — silently ignore
    }
}

// Update a single card's thumbnail without full re-render
function _updateCardThumbnail(idx, dataUrl) {
    var card = document.querySelector('.viewer-cab-card[data-idx="' + idx + '"]');
    if (!card) return;
    var thumb = card.querySelector('.viewer-cab-thumb');
    if (!thumb) return;
    var img = thumb.querySelector('img');
    if (img) {
        img.src = dataUrl;
    } else {
        var icon = thumb.querySelector('.viewer-cab-thumb-icon');
        if (icon) icon.remove();
        var newImg = document.createElement('img');
        newImg.src = dataUrl;
        newImg.alt = '';
        thumb.appendChild(newImg);
    }
}

// ── Render cabinet navigation cards ──────────────────────────────────────────
// Update a single cabinet card's note button badge without full re-render
function _updateCardBadge(cabIdx) {
    var nav = document.getElementById('viewer-cabinet-nav');
    if (!nav) return;
    var card = nav.querySelector('.viewer-cab-card[data-idx="' + cabIdx + '"]');
    if (!card) return;
    var noteBtn = card.querySelector('.viewer-cab-note-btn');
    if (!noteBtn) return;

    var noteCount   = _notesCountPerCab[cabIdx] || 0;
    var unreadCount = _unreadCountPerCab[cabIdx] || 0;
    var newClass = 'viewer-cab-note-btn' + (unreadCount > 0 ? ' has-unread' : (noteCount > 0 ? ' has-notes' : ''));
    noteBtn.className = newClass;

    var badge = noteBtn.querySelector('.viewer-cab-note-btn-badge');
    if (badge) badge.textContent = unreadCount > 0 ? String(unreadCount) : '';
}

function _renderCabinetNav() {
    var nav  = document.getElementById('viewer-cabinet-nav');
    var wrap = document.getElementById('viewer-cab-nav-wrap');
    if (!nav) return;

    if (_cabinetList.length === 0) {
        if (wrap) wrap.style.display = 'none';
        return;
    }

    // Show wrapper (position:relative container for floating arrows)
    if (wrap) wrap.style.display = 'block';

    nav.innerHTML = '';

    _cabinetList.forEach(function(cab, idx) {
        var isActive    = (idx === _activeCabIdx);
        var noteCount   = _notesCountPerCab[idx] || 0;
        var unreadCount = _unreadCountPerCab[idx] || 0;

        // Collect material colors for swatches (body + doors)
        var swatchColors = [];
        if (cab.materialBody && MATERIAL_COLORS[cab.materialBody]) {
            swatchColors.push({ color: MATERIAL_COLORS[cab.materialBody], title: MATERIAL_NAMES[cab.materialBody] || cab.materialBody });
        }
        if (cab.materialDoors && cab.materialDoors !== cab.materialBody && MATERIAL_COLORS[cab.materialDoors]) {
            swatchColors.push({ color: MATERIAL_COLORS[cab.materialDoors], title: MATERIAL_NAMES[cab.materialDoors] || cab.materialDoors });
        }
        // Fallback swatch
        if (swatchColors.length === 0) swatchColors.push({ color: '#c8a87a', title: '' });

        // Dims string
        var dimsStr = '';
        if (cab.dims) {
            var w = cab.dims.w || 0, h = cab.dims.h || 0, d = cab.dims.d || 0;
            if (w || h || d) dimsStr = w + '×' + h + '×' + d + ' ס"מ';
        }

        // Thumbnail
        var thumbHtml = cab.thumbnail
            ? '<img src="' + cab.thumbnail + '" alt="">'
            : '<i class="fa-solid fa-cabinet-filing viewer-cab-thumb-icon"></i>';

        // Notes button — badge only for unread DESIGNER replies (not client's own notes)
        var noteBtnClass = 'viewer-cab-note-btn' + (unreadCount > 0 ? ' has-unread' : (noteCount > 0 ? ' has-notes' : ''));
        var noteBtnTitle = unreadCount > 0 ? (unreadCount + ' תיקונים חדשים') : (noteCount > 0 ? (noteCount + ' תיקונים') : 'הוסף תיקון');
        var badgeNum = unreadCount > 0 ? String(unreadCount) : '';
        var noteBadgeHtml = '<span class="viewer-cab-note-btn-badge">' + badgeNum + '</span>';

        // Swatches HTML
        var swatchesHtml = swatchColors.slice(0, 3).map(function(s) {
            return '<span class="viewer-cab-color-dot" style="background:' + s.color + ';" title="' + _escHtml(s.title) + '"></span>';
        }).join('');

        var card = document.createElement('div');
        card.className = 'viewer-cab-card' + (isActive ? ' active' : '');
        card.dataset.idx = idx;

        card.innerHTML =
            '<div class="viewer-cab-thumb">' +
                '<div class="viewer-cab-active-mark"><i class="fa-solid fa-check" style="font-size:8px;"></i></div>' +
                thumbHtml +
            '</div>' +
            '<div class="viewer-cab-body">' +
                '<div class="viewer-cab-name">' + _escHtml(cab.label) + '</div>' +
                (dimsStr ? '<div class="viewer-cab-dims"><i class="fa-solid fa-ruler-combined" style="font-size:0.55rem;margin-left:2px;opacity:0.6;"></i> ' + dimsStr + '</div>' : '') +
                '<div class="viewer-cab-footer">' +
                    '<div class="viewer-cab-swatches">' + swatchesHtml + '</div>' +
                    '<button class="' + noteBtnClass + '" title="' + noteBtnTitle + '" data-idx="' + idx + '">' +
                        '<i class="fa-solid fa-comment-dots"></i>' +
                        noteBadgeHtml +
                    '</button>' +
                '</div>' +
            '</div>';

        // Click on card → switch cabinet
        card.onclick = function(e) {
            // Don't switch if clicking the notes button
            if (e.target.closest('.viewer-cab-note-btn')) return;
            _switchCabinet(idx);
        };

        // Click on notes button → open notes for this cabinet
        var noteBtn = card.querySelector('.viewer-cab-note-btn');
        if (noteBtn) {
            noteBtn.onclick = function(e) {
                e.stopPropagation();
                _activeCabIdx = idx;
                _notesCabIdx  = idx;
                window._viewerOpenNotes();
            };
        }

        // Approval / extras hooks on card
        if (typeof window._viewerExtrasDecorateCard === 'function') {
            window._viewerExtrasDecorateCard(card, idx, cab);
        }

        nav.appendChild(card);
    });

    // Show/hide "חזור ללייב" button
    var liveBtn = document.getElementById('viewer-return-live-btn');
    if (liveBtn) liveBtn.style.display = _liveMode ? 'none' : 'flex';

    if (typeof window._viewerExtrasAfterNavRender === 'function') {
        window._viewerExtrasAfterNavRender();
    }
}

// ── Switch to a different cabinet ─────────────────────────────────────────────
function _switchCabinet(idx) {
    if (idx === _activeCabIdx && !_liveMode) return;
    _activeCabIdx = idx;

    if (_liveMode) {
        _liveMode = false;
        _updateLiveBadge();
    }

    // Lightweight active-class update — avoids full DOM rebuild which causes badge flash
    var nav = document.getElementById('viewer-cabinet-nav');
    if (nav) {
        nav.querySelectorAll('.viewer-cab-card').forEach(function(card) {
            var cardIdx = parseInt(card.dataset.idx, 10);
            card.classList.toggle('active', cardIdx === idx);
        });
        // Show "return to live" button since we're now in cabinet mode
        var liveBtn = document.getElementById('viewer-return-live-btn');
        if (liveBtn) liveBtn.style.display = 'flex';
    } else {
        _renderCabinetNav();
    }

    var cab = _cabinetList[idx];
    if (!cab) return;

    var syntheticData = {
        wings: cab.wings,
        activeCabinet: cab.activeCabinet,
        presetId: cab.presetId,
        activeWing: cab.activeWing,
        customer: _projectData ? _projectData.customer : null
    };

    _restoreState(syntheticData);
    // Keep part-color / paint scope on the cabinet the customer is viewing
    try {
        state.editingCartIndex = idx;
        if (typeof _syncPartColorScope === 'function') _syncPartColorScope();
    } catch (eScope) {}
    // Apply any viewer color overrides for this cabinet
    _applyViewerColorOverride(idx);
    _updateInfoStrip();

    // Preserve סגור/פתוח across cabinet switch (state.viewMode alone is always '3d')
    var currentMode = window._viewerDoorsMode
        || ((state && state.viewMode) ? state.viewMode : '3d');
    window._setViewerView(currentMode);

    // Capture snapshot after render
    setTimeout(function() { _captureSnapshot(idx); }, 350);

    // Reload notes for new cabinet if panel is open
    if (_notesOpen) {
        _notesCabIdx = idx;
        _loadNotesForCabinet(idx);
        _renderNotesCabTabs();
    }

    if (typeof window._viewerExtrasOnCabinetSwitch === 'function') {
        window._viewerExtrasOnCabinetSwitch(idx);
    }
}

// ── Return to live mode ───────────────────────────────────────────────────────
window._returnToLive = function() {
    _liveMode = true;
    _updateLiveBadge();
    if (_projectData) {
        _applyLiveProjectData(_projectData, { followLive: true, captureThumb: true });
    } else {
        _renderCabinetNav();
    }
    var currentMode = window._viewerDoorsMode
        || ((state && state.viewMode) ? state.viewMode : '3d');
    window._setViewerView(currentMode);
};

// ── Update live badge appearance ──────────────────────────────────────────────
function _updateLiveBadge() {
    var badge  = document.getElementById('viewer-live-badge');
    var liveBtn = document.getElementById('viewer-return-live-btn');

    if (_liveMode) {
        if (badge) {
            badge.style.background = '#f0fdf4';
            badge.style.borderColor = '#bbf7d0';
            badge.style.color = '#065f46';
            badge.innerHTML = '<span id="viewer-live-dot" style="width:7px;height:7px;border-radius:50%;background:#10b981;animation:viewer-pulse 2s infinite;flex-shrink:0;display:inline-block;"></span> LIVE';
        }
        if (liveBtn) liveBtn.style.display = 'none';
    } else {
        if (badge) {
            badge.style.background = '#fef3c7';
            badge.style.borderColor = '#fde68a';
            badge.style.color = '#92400e';
            badge.innerHTML = '<i class="fa-solid fa-eye" style="font-size:0.7rem;"></i> עיון';
        }
        if (liveBtn) liveBtn.style.display = 'flex';
    }
}

// ── Restore state from project_data ──────────────────────────────────────────
/** Viewer must be able to show/hide fronts even if designer saved with hasDoors=false (old toggle bug). */
function _viewerForceHasDoorsOn() {
    if (!state || !state.wings) return;
    Object.keys(state.wings).forEach(function(k) {
        var w = state.wings[k];
        if (!w) return;
        w.hasDoors = true;
        if (w.sideCabinet && w.sideCabinet.side && w.sideCabinet.side !== 'none') {
            w.sideCabinet.hasDoors = true;
        }
    });
}

function _restoreState(projectData) {
    if (!projectData) return;
    try {
        if (projectData.wings) {
            if (typeof window._restoreWingsFromSaved === 'function') {
                window._restoreWingsFromSaved(projectData.wings);
            } else {
                state.wings.center = projectData.wings.center || state.wings.center;
                state.wings.left   = projectData.wings.left   || null;
                state.wings.right  = projectData.wings.right  || null;
            }
        } else if (projectData.activeCabinet) {
            var ac = projectData.activeCabinet;
            if (ac.columns)   state.wings.center.columns      = ac.columns;
            if (ac.width)     state.wings.center.width         = ac.width;
            if (ac.globalHeight) state.wings.center.globalHeight = ac.globalHeight;
            if (ac.depth)     state.wings.center.depth         = ac.depth;
            if (ac.thickness) state.wings.center.thickness     = ac.thickness;
            if (ac.plinthHeight !== undefined) state.wings.center.plinthHeight = ac.plinthHeight;
            if (ac.hasDoors !== undefined) state.wings.center.hasDoors = ac.hasDoors;
            if (ac.materialBody)     state.wings.center.materialBody     = ac.materialBody;
            if (ac.materialInternal) state.wings.center.materialInternal = ac.materialInternal;
            if (ac.materialExternal) state.wings.center.materialExternal = ac.materialExternal;
            if (ac.materialDesk)     state.wings.center.materialDesk     = ac.materialDesk;
            if (ac.materialOpenCell) state.wings.center.materialOpenCell = ac.materialOpenCell;
            if (ac.materialBack)     state.wings.center.materialBack     = ac.materialBack;
            if (ac.desk)        state.wings.center.desk        = ac.desk;
            if (ac.cabinetModel) state.wings.center.cabinetModel = ac.cabinetModel;
            state.wings.left  = null;
            state.wings.right = null;
        }
        state.activeWing = projectData.activeWing || 'center';
        if (projectData.presetId) state.presetId = projectData.presetId;
        if (projectData.customer) state.customer = projectData.customer;
        if (projectData.orderCart) state.orderCart = projectData.orderCart;
        else if (projectData.cart) state.orderCart = projectData.cart;

        // Old designer "הסתר חזיתות" wrongly saved hasDoors=false — door layout still exists.
        // Force doors on so customer סגור/פתוח can show fronts.
        _viewerForceHasDoorsOn();
        if (typeof window._doorsVisible !== 'undefined') window._doorsVisible = true;

        if (typeof syncSidebarToWing === 'function') syncSidebarToWing();
        if (typeof buildCabinet === 'function') buildCabinet();
        if (typeof updateCameraView === 'function') updateCameraView();
        if (typeof calculatePrice === 'function') calculatePrice();

        _updateInfoStrip();
    } catch(e) {
        console.error('[Viewer] restoreState error:', e);
    }
}

// ── Show viewer UI ────────────────────────────────────────────────────────────
function _syncCanvasTop() {
    // Canvas top is fixed at 124px (44px top bar + 80px details bar)
    var canvas = document.getElementById('canvas-container');
    if (canvas) canvas.style.setProperty('top', '124px', 'important');
}

function _showViewerUI(projectName) {
    var loading = document.getElementById('viewer-loading');
    if (loading) loading.style.display = 'none';

    var topBar      = document.getElementById('viewer-top-bar');
    var detailsBar  = document.getElementById('viewer-details-bar');
    var canvas      = document.getElementById('canvas-container');
    var infoBar     = document.getElementById('viewer-info-bar');
    if (topBar)     topBar.style.display     = 'flex';
    if (detailsBar) detailsBar.style.display = 'flex';
    if (canvas)     canvas.style.display     = 'block';
    if (infoBar)    infoBar.style.display    = 'flex';

    var nameEl = document.getElementById('viewer-project-name');
    if (nameEl) nameEl.textContent = projectName || 'הדמיית ארון';

    window.dispatchEvent(new Event('resize'));
}

// ── Init viewer view ──────────────────────────────────────────────────────────
function _initViewerView() {
    _setViewerView('3d');
    setTimeout(function() {
        window.dispatchEvent(new Event('resize'));
        if (typeof buildCabinet === 'function') buildCabinet();
    }, 150);
}

// ── Color bottom sheet ────────────────────────────────────────────────────────

function _buildColorGridHTML(field) {
    var currentKey = (_viewerColorOverrides[_activeCabIdx] && _viewerColorOverrides[_activeCabIdx][field])
        || _getOriginalMaterial(_activeCabIdx, field);
    var html = '';
    var inTextures = false;
    MATERIAL_LIST.forEach(function(m) {
        var isTexture = !!m.img;
        if (isTexture && !inTextures) {
            inTextures = true;
            html += '<div class="vd-grid-section">טקסטורות עץ</div>';
        }
        var selected = m.key === currentKey ? ' selected' : '';
        var style = isTexture
            ? 'background-image:url(' + m.img + ');background-size:cover;background-position:center;'
            : 'background:' + m.bg + ';';
        html += '<div class="vd-color-option' + selected + '" style="' + style + '" onclick="window._viewerSelectColor(\'' + m.key + '\')">' +
            '<span class="vd-color-label">' + m.label + '</span>' +
            '</div>';
    });
    return html;
}

window._openColorSheet = function() {
    var cab = _cabinetList[_activeCabIdx];
    if (!cab) return;
    _colorPickerCabIdx = _activeCabIdx;

    var overrides = _viewerColorOverrides[_activeCabIdx] || {};
    var matBody     = overrides.body     || cab.materialBody     || '';
    var matDoors    = overrides.doors    || cab.materialDoors    || '';
    var matInternal = overrides.internal || cab.materialInternal || '';

    var parts = [];
    if (matBody)     parts.push({ field: 'body',     label: 'גוף',     key: matBody });
    if (matDoors && matDoors !== matBody)       parts.push({ field: 'doors',    label: 'חזיתות', key: matDoors });
    if (matInternal && matInternal !== matBody) parts.push({ field: 'internal', label: 'פנים',   key: matInternal });
    if (!parts.length) parts.push({ field: 'body', label: 'גוף', key: matBody });

    _colorPickerField = parts[0].field;

    var tabsEl = document.getElementById('vd-sheet-tabs');
    if (tabsEl) {
        var tabHtml = '';
        parts.forEach(function(p) {
            var color = MATERIAL_COLORS[p.key] || '#c8a87a';
            var active = p.field === _colorPickerField ? ' active' : '';
            tabHtml += '<button class="vd-sheet-tab' + active + '" onclick="window._selectSheetTab(\'' + p.field + '\')">' +
                '<span class="vd-swatch" style="background:' + color + ';"></span>' +
                p.label + '</button>';
        });
        tabsEl.innerHTML = tabHtml;
        tabsEl.style.display = parts.length > 1 ? 'flex' : 'none';
    }

    var grid = document.getElementById('vd-color-grid');
    if (grid) grid.innerHTML = _buildColorGridHTML(_colorPickerField);

    var overlay = document.getElementById('vd-color-sheet-overlay');
    var sheet   = document.getElementById('vd-color-sheet');
    if (overlay) overlay.classList.add('open');
    if (sheet)   sheet.classList.add('open');
};

window._selectSheetTab = function(field) {
    _colorPickerField = field;
    var tabsEl = document.getElementById('vd-sheet-tabs');
    if (tabsEl) {
        tabsEl.querySelectorAll('.vd-sheet-tab').forEach(function(btn) {
            btn.classList.toggle('active', btn.getAttribute('onclick').indexOf("'" + field + "'") !== -1);
        });
    }
    var grid = document.getElementById('vd-color-grid');
    if (grid) grid.innerHTML = _buildColorGridHTML(field);
};

window._closeColorSheet = function() {
    var overlay = document.getElementById('vd-color-sheet-overlay');
    var sheet   = document.getElementById('vd-color-sheet');
    if (overlay) overlay.classList.remove('open');
    if (sheet)   sheet.classList.remove('open');
    _colorPickerField = null;
};

window._viewerSelectColor = function(newKey) {
    if (_colorPickerField === null) return;
    var cabIdx = _colorPickerCabIdx;
    var field  = _colorPickerField;
    if (!_viewerColorOverrides[cabIdx]) _viewerColorOverrides[cabIdx] = {};
    var oldKey = _viewerColorOverrides[cabIdx][field] || _getOriginalMaterial(cabIdx, field);
    _viewerColorOverrides[cabIdx][field] = newKey;
    window._closeColorSheet();
    _applyViewerColorOverride(cabIdx);
    _updateDetailsBar();
    _sendAutoColorNote(cabIdx, field, oldKey, newKey);
};

window._openMultiviewBlueprint = function() { /* disabled in customer viewer */ };

// Get original material key for a field from cabinet data
function _getOriginalMaterial(cabIdx, field) {
    var cab = _cabinetList[cabIdx];
    if (!cab) return '';
    if (field === 'body')     return cab.materialBody     || '';
    if (field === 'doors')    return cab.materialDoors    || '';
    if (field === 'internal') return cab.materialInternal || '';
    return '';
}

// Apply color overrides to the engine state and rebuild
function _applyViewerColorOverride(cabIdx) {
    if (cabIdx !== _activeCabIdx) return;
    var overrides = _viewerColorOverrides[cabIdx] || {};
    if (overrides.body     && state) { state.materialBody     = overrides.body;     if (state.wings && state.wings.center) state.wings.center.materialBody     = overrides.body; }
    if (overrides.doors    && state) { state.materialExternal = overrides.doors;    if (state.wings && state.wings.center) state.wings.center.materialExternal = overrides.doors; }
    if (overrides.internal && state) { state.materialInternal = overrides.internal; if (state.wings && state.wings.center) state.wings.center.materialInternal = overrides.internal; }
    if (typeof buildCabinet === 'function') buildCabinet();
}

// Send automatic note about color change
async function _sendAutoColorNote(cabIdx, field, oldKey, newKey) {
    if (!_sb || !_token || !_projectId) return;
    var fieldLabels = { body: 'גוף הארון', doors: 'חזיתות', internal: 'פנים' };
    var oldName = MATERIAL_NAMES[oldKey] || oldKey;
    var newName = MATERIAL_NAMES[newKey] || newKey;
    var cab     = _cabinetList[cabIdx];
    var cabLabel = cab ? cab.label : ('ארון ' + (cabIdx + 1));
    var msg = '🎨 בקשת שינוי צבע — ' + cabLabel + '\n' +
              (fieldLabels[field] || field) + ': ' + oldName + ' ← ' + newName;

    try {
        var payload = {
            project_id:  _projectId,
            share_token: _token,
            sender_role: 'client',
            sender_name: _clientName || 'לקוח',
            message:     msg,
            message_type: 'color_change'
        };
        if (_cabIndexColExists !== false) payload.cabinet_index = cabIdx;
        var result = await _sb.from('project_messages').insert(payload);
        if (result.error && result.error.code === '42703') {
            _cabIndexColExists = false;
            delete payload.cabinet_index;
            await _sb.from('project_messages').insert(payload);
        }
    } catch(e) {
        console.error('[Viewer] Auto color note error:', e);
    }
}

// ── Update details bar (top) + customer strip (bottom) ───────────────────────
function _updateInfoStrip() {
    _updateDetailsBar();
}

function _updateDetailsBar() {
    var chipsEl  = document.getElementById('viewer-details-chips');
    var colorBtn = document.getElementById('btn-change-color');
    var swatchEl = document.getElementById('btn-color-swatch');
    var custStrip = document.getElementById('viewer-customer-strip-inner');

    try {
        var cab = _cabinetList[_activeCabIdx];
        var w = 0, h = 0, d = 0, matBody = '', matDoors = '', matInternal = '';
        var rawState = null;

        if (cab) {
            w = cab.dims ? cab.dims.w : 0;
            h = cab.dims ? cab.dims.h : 0;
            d = cab.dims ? cab.dims.d : 0;
            matBody     = cab.materialBody || '';
            matDoors    = cab.materialDoors || '';
            matInternal = cab.materialInternal || '';
            rawState = cab.activeCabinet || (cab.wings && cab.wings.center) || null;
        }

        // Fallback to live state
        if (!w && state) {
            var wing = state.wings && state.wings.center ? state.wings.center : state;
            w = wing.width || 0;
            h = wing.globalHeight || 0;
            d = wing.depth || 0;
            matBody     = wing.materialBody || '';
            matDoors    = wing.materialExternal || '';
            matInternal = wing.materialInternal || '';
            rawState    = wing;
        }

        var overrides = _viewerColorOverrides[_activeCabIdx] || {};
        var dispBody = overrides.body || matBody;

        // ── Row 1: single dims chip only ──────────────────────────────────
        if (chipsEl) {
            var chips = '';
            if (w || h || d) {
                chips = '<div class="vd-chip">' +
                    '<span class="vd-chip-label">רוחב:</span><span class="vd-chip-val">' + w + '</span>' +
                    '<span class="vd-chip-label" style="margin-right:6px;">עומק:</span><span class="vd-chip-val">' + d + '</span>' +
                    '<span class="vd-chip-label" style="margin-right:6px;">גובה:</span><span class="vd-chip-val">' + h + '</span>' +
                    '</div>';
            }
            chipsEl.innerHTML = chips || '<div class="vd-chip"><span class="vd-chip-label">טוען...</span></div>';
        }

        // ── Color button swatch ───────────────────────────────────────────
        if (colorBtn) {
            var hasColors = !!(matBody || matDoors || matInternal);
            colorBtn.style.display = hasColors ? 'flex' : 'none';
            if (swatchEl && dispBody) {
                swatchEl.style.background = MATERIAL_COLORS[dispBody] || '#c8a87a';
            }
        }

        // ── Customer strip ────────────────────────────────────────────────
        if (custStrip) {
            var cust = state && state.customer ? state.customer : {};
            var custHtml = '';
            if (cust.name)    custHtml += '<span class="viewer-cust-item"><i class="fa-regular fa-user"></i><strong>' + _escHtml(cust.name) + '</strong></span>';
            if (cust.phone)   custHtml += '<span class="viewer-cust-item"><i class="fa-solid fa-phone"></i>' + _escHtml(cust.phone) + '</span>';
            if (cust.address) custHtml += '<span class="viewer-cust-item"><i class="fa-solid fa-map-location-dot"></i>' + _escHtml(cust.address) + '</span>';
            if (cust.deliveryDate) {
                var delShown = String(cust.deliveryDate);
                var isoM = delShown.match(/^(\d{4})-(\d{2})-(\d{2})/);
                if (isoM) delShown = isoM[3] + '/' + isoM[2] + '/' + isoM[1];
                custHtml += '<span class="viewer-cust-item"><i class="fa-solid fa-truck"></i>צפי אספקה ' + _escHtml(delShown) + '</span>';
            }
            if (cust.notes)   custHtml += '<span class="viewer-cust-item"><i class="fa-solid fa-note-sticky"></i>' + _escHtml(cust.notes) + '</span>';
            custStrip.innerHTML = custHtml || '<span class="viewer-cust-item" style="color:#94a3b8;">אין פרטי לקוח</span>';
        }

    } catch(e) {}
}

// ── View switching ────────────────────────────────────────────────────────────
window._viewerDoorsModeTimer = null;
window._setViewerView = function(mode) {
    var viewMode = mode;
    if (mode === 'doors-open' || mode === 'doors-closed') {
        window._viewerDoorsMode = mode;
        viewMode = '3d';
    } else if (mode === '3d' || mode === 'front' || mode === 'blueprint') {
        window._viewerDoorsMode = null;
    }
    state.viewMode = viewMode;

    // Ensure door meshes are built (not skipped by saved hasDoors=false)
    if (viewMode === '3d' || mode === 'doors-open' || mode === 'doors-closed') {
        _viewerForceHasDoorsOn();
    }

    document.querySelectorAll('.vd-tab').forEach(function(btn) {
        btn.classList.toggle('active', btn.dataset.view === mode);
    });

    var bpLayer  = document.getElementById('blueprint-layer');
    var canvas   = document.getElementById('canvas-container');
    var dimLayer = document.getElementById('dimensions-layer');

    if (window._viewerDoorsModeTimer) {
        clearTimeout(window._viewerDoorsModeTimer);
        window._viewerDoorsModeTimer = null;
    }

    if (viewMode === 'blueprint') {
        if (canvas) { canvas.classList.add('blueprint-mode'); canvas.classList.remove('front-mode', 'mode-3d'); }
        if (bpLayer) bpLayer.style.display = 'block';
        if (dimLayer) { dimLayer.style.display = 'none'; dimLayer.style.opacity = '0'; }
        if (typeof buildCabinet === 'function') buildCabinet();
        if (typeof updateCameraView === 'function') updateCameraView();
    } else if (viewMode === 'front') {
        if (canvas) { canvas.classList.add('front-mode'); canvas.classList.remove('blueprint-mode', 'mode-3d'); }
        if (bpLayer) { bpLayer.style.display = 'none'; bpLayer.innerHTML = ''; }
        if (dimLayer) { dimLayer.style.display = 'block'; dimLayer.style.opacity = '1'; }
        if (typeof buildCabinet === 'function') buildCabinet();
        if (typeof updateCameraView === 'function') updateCameraView();
    } else {
        if (canvas) { canvas.classList.add('mode-3d'); canvas.classList.remove('front-mode', 'blueprint-mode'); }
        if (bpLayer) { bpLayer.style.display = 'none'; bpLayer.innerHTML = ''; }
        if (dimLayer) { dimLayer.style.display = 'none'; dimLayer.style.opacity = '0'; }
        if (typeof buildCabinet === 'function') buildCabinet();
        if (typeof updateCameraView === 'function') updateCameraView();
        // Absolute re-apply after meshes exist (also handled in buildCabinet for doors-open)
        window._viewerDoorsModeTimer = setTimeout(function() {
            window._viewerDoorsModeTimer = null;
            if (typeof window._viewerExtrasApplyDoorsMode === 'function') {
                window._viewerExtrasApplyDoorsMode(window._viewerDoorsMode || 'doors-closed');
            }
        }, 40);
    }
};

// ── Supabase Realtime subscription ───────────────────────────────────────────
function _setupRealtime() {
    if (!_sb || !_token) return;

    _realtimeChannel = _sb.channel('viewer-project-' + _token)
        .on('postgres_changes', {
            event:  'UPDATE',
            schema: 'public',
            table:  'projects',
            filter: 'share_token=eq.' + _token
        }, function(payload) {
            if (!payload.new) return;
            _lastUpdatedAt = payload.new.updated_at;
            _projectData   = payload.new.project_data;
            if (payload.new.order_status) {
                window._viewerOrderStatus = payload.new.order_status;
                if (_projectData) _projectData.orderStatus = payload.new.order_status;
            } else if (_projectData && _projectData.orderStatus) {
                window._viewerOrderStatus = _projectData.orderStatus;
            }
            _applyLiveProjectData(_projectData, { followLive: _liveMode });
            if (_liveMode) {
                setTimeout(function() { _captureSnapshot(_activeCabIdx); }, 350);
            }
            _flashLiveBadge();
            if (typeof window._viewerExtrasOnProjectUpdate === 'function') {
                window._viewerExtrasOnProjectUpdate(_projectData, payload.new);
            }
        })
        .subscribe(function(status) {
            if (status === 'SUBSCRIBED') {
                console.log('[Viewer] Realtime connected');
                if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null; }
            } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
                console.warn('[Viewer] Realtime unavailable (' + status + '), falling back to polling');
                _startPolling();
            }
        });

    setTimeout(function() {
        if (!_pollTimer) {
            console.log('[Viewer] Realtime safety-net: starting polling alongside Realtime');
            _startPolling();
        }
    }, 3000);
}

// ── Polling fallback ──────────────────────────────────────────────────────────
function _startPolling() {
    if (_pollTimer) return;
    _pollTimer = setInterval(async function() {
        try {
            var result = await _sb
                .from('projects')
                .select('updated_at, project_data, order_status')
                .eq('share_token', _token)
                .single();
            if (result.data && result.data.updated_at !== _lastUpdatedAt) {
                _lastUpdatedAt = result.data.updated_at;
                _projectData   = result.data.project_data;
                if (result.data.order_status) {
                    window._viewerOrderStatus = result.data.order_status;
                    if (_projectData) _projectData.orderStatus = result.data.order_status;
                }
                _applyLiveProjectData(_projectData, { followLive: _liveMode });
                if (_liveMode) {
                    setTimeout(function() { _captureSnapshot(_activeCabIdx); }, 350);
                }
                _flashLiveBadge();
                if (typeof window._viewerExtrasOnProjectUpdate === 'function') {
                    window._viewerExtrasOnProjectUpdate(_projectData, result.data);
                }
            }
        } catch(e) {
            console.warn('[Viewer] Poll error:', e);
        }
    }, POLL_INTERVAL);
}

// ── Flash the LIVE badge ──────────────────────────────────────────────────────
function _flashLiveBadge() {
    var dot = document.getElementById('viewer-live-dot');
    if (!dot) return;
    dot.style.background = '#f59e0b';
    setTimeout(function() { dot.style.background = '#10b981'; }, 800);
}

// ── Error screen ──────────────────────────────────────────────────────────────
function _showError(title, message) {
    var loading = document.getElementById('viewer-loading');
    if (!loading) return;
    loading.innerHTML =
        '<div style="font-size:2.5rem;margin-bottom:12px;">😕</div>' +
        '<div style="font-size:1.1rem;font-weight:700;color:#1e3a5f;margin-bottom:8px;">' + title + '</div>' +
        '<div style="font-size:0.85rem;color:#64748b;text-align:center;max-width:280px;line-height:1.6;">' + message + '</div>' +
        '<button onclick="location.reload()" style="margin-top:20px;padding:10px 24px;background:#2563eb;color:white;border:none;border-radius:10px;font-size:0.9rem;font-weight:600;cursor:pointer;font-family:inherit;">נסה שוב</button>';
}

function _setLoadingText(text) {
    var sub = document.getElementById('viewer-loading-sub');
    if (sub) sub.textContent = text;
}

// ==========================================
// Notes Logic (per-cabinet)
// ==========================================

// Load note counts for ALL cabinets (for badges on cards)
// Gracefully handles missing cabinet_index / is_read columns
async function _loadAllNotesCounts() {
    if (!_sb || !_token) return;
    try {
        // Select cabinet_index so we can count per-cabinet
        var result = await _sb
            .from('project_messages')
            .select('id, sender_role, cabinet_index, is_read')
            .eq('share_token', _token);

        console.log('[Viewer] loadAllNotesCounts:', result.data ? result.data.length + ' rows' : 'null', result.error ? 'ERR:' + JSON.stringify(result.error) : '');
        if (result.error) { console.error('[Viewer] loadAllNotesCounts error:', result.error); return; }
        if (!result.data) return;

        _notesCountPerCab  = {};
        _unreadCountPerCab = {};
        _totalUnread = 0;

        result.data.forEach(function(row) {
            // cabinet_index may not exist in DB — treat null/undefined as cabinet 0
            var idx = (row.cabinet_index !== null && row.cabinet_index !== undefined) ? Number(row.cabinet_index) : 0;
            _notesCountPerCab[idx] = (_notesCountPerCab[idx] || 0) + 1;
            // Count unread designer replies
            if (row.sender_role === 'designer' && !row.is_read) {
                _unreadCountPerCab[idx] = (_unreadCountPerCab[idx] || 0) + 1;
                _totalUnread++;
            }
        });

        _renderCabinetNav();
        _updateTopBarBadge();
    } catch(e) {
        console.warn('[Viewer] loadAllNotesCounts error:', e);
    }
}

// Update the top-bar notes button badge
function _updateTopBarBadge() {
    var badge = document.getElementById('viewer-notes-unread');
    if (!badge) return;
    if (_totalUnread > 0) {
        badge.textContent = _totalUnread > 9 ? '9+' : String(_totalUnread);
        badge.style.display = 'flex';
    } else {
        badge.style.display = 'none';
    }
}

// Whether cabinet_index column exists (detected at runtime)
var _cabIndexColExists = null; // null=unknown, true=yes, false=no

// Load notes for a specific cabinet index
async function _loadNotesForCabinet(cabIdx) {
    if (!_sb || !_token) {
        console.warn('[Viewer] _loadNotesForCabinet: missing _sb or _token');
        return;
    }
    _notesCabIdx = cabIdx;
    _renderNotesCabTabs();

    try {
        // First attempt: with cabinet_index filter (if column known to exist or unknown)
        var result = await _queryNotes(cabIdx);

        // If column doesn't exist, retry without cabinet_index filter
        if (result.error && result.error.code === '42703') {
            console.warn('[Viewer] cabinet_index column missing — loading all notes without filter');
            _cabIndexColExists = false;
            result = await _queryNotesNoFilter();
        } else if (!result.error) {
            _cabIndexColExists = true;
        }

        console.log('[Viewer] loadNotes cabIdx=' + cabIdx,
            'rows:', result.data ? result.data.length : 'null',
            'error:', result.error ? result.error.message : 'none');

        if (result.error) {
            console.error('[Viewer] Notes SELECT error:', result.error);
            return;
        }
        if (!result.data) return;

        // Filter client-side by cabinet_index when column exists but fallback was used,
        // or when column doesn't exist — filter by position in _cabinetList
        var notes = result.data;
        if (_cabIndexColExists === false) {
            // Column missing: filter client-side by matching cabinet_index field if present,
            // otherwise show notes that have no cabinet_index (treat as cabinet 0)
            notes = result.data.filter(function(row) {
                var rowIdx = (row.cabinet_index !== null && row.cabinet_index !== undefined)
                    ? Number(row.cabinet_index) : 0;
                return rowIdx === Number(cabIdx);
            });
        }

        var list = document.getElementById('viewer-notes-list');
        if (!list) return;
        list.innerHTML = '';

        if (notes.length === 0) {
            list.innerHTML =
                '<div id="viewer-notes-placeholder" style="text-align:center;color:#94a3b8;font-size:0.82rem;padding:28px 16px;line-height:1.7;">' +
                '<i class="fa-solid fa-comment-dots" style="font-size:2rem;margin-bottom:10px;display:block;opacity:0.35;"></i>' +
                'אין תיקונים עדיין<br>' +
                '<span style="font-size:0.75rem;">כתוב תיקון למעצב למטה</span>' +
                '</div>';
        } else {
            notes.forEach(function(note) { _appendNote(note); });
        }

        // Update count for this cabinet but don't re-render nav (avoids badge flash)
        // _loadAllNotesCounts already has accurate counts; only update if we have fresh data
        if (notes.length > 0 || _notesCountPerCab[cabIdx] === undefined) {
            _notesCountPerCab[cabIdx] = notes.length;
        }
        _subscribeNotesRealtime(cabIdx);

        setTimeout(function() {
            if (list) list.scrollTop = list.scrollHeight;
        }, 50);

    } catch(e) {
        console.error('[Viewer] Notes load exception:', e);
    }
}

// Query with cabinet_index filter
function _queryNotes(cabIdx) {
    var q = _sb.from('project_messages')
        .select('*')
        .eq('share_token', _token)
        .order('created_at', { ascending: true })
        .limit(200);
    if (_cabIndexColExists === false) {
        return _queryNotesNoFilter();
    }
    if (cabIdx !== null && cabIdx !== undefined) {
        q = q.eq('cabinet_index', Number(cabIdx));
    } else {
        q = q.is('cabinet_index', null);
    }
    return q;
}

// Query without cabinet_index filter (fallback when column missing)
function _queryNotesNoFilter() {
    return _sb.from('project_messages')
        .select('*')
        .eq('share_token', _token)
        .order('created_at', { ascending: true })
        .limit(200);
}

// Subscribe to realtime new notes for the current cabinet
function _subscribeNotesRealtime(cabIdx) {
    if (!_sb || !_token) return;
    if (_notesChannel) { _notesChannel.unsubscribe(); _notesChannel = null; }

    _notesChannel = _sb.channel('viewer-notes-' + _token + '-' + cabIdx)
        .on('postgres_changes', {
            event:  'INSERT',
            schema: 'public',
            table:  'project_messages',
            filter: 'share_token=eq.' + _token
        }, function(payload) {
            var note = payload.new;
            if (!note) return;

            // Skip client's own messages — already added optimistically
            if (note.sender_role === 'client') return;

            var noteIdx = (note.cabinet_index !== null && note.cabinet_index !== undefined) ? Number(note.cabinet_index) : null;
            var curIdx  = (cabIdx !== null && cabIdx !== undefined) ? Number(cabIdx) : null;

            // Update counts for all cabinets
            var countKey = (noteIdx !== null) ? noteIdx : 0;
            _notesCountPerCab[countKey] = (_notesCountPerCab[countKey] || 0) + 1;

            if (note.sender_role === 'designer') {
                _unreadCountPerCab[countKey] = (_unreadCountPerCab[countKey] || 0) + 1;
                _totalUnread++;
                _updateTopBarBadge();
            }

            // Update only the specific card's badge — avoids full DOM rebuild / flash
            _updateCardBadge(countKey);

            // Only append to list if it's for the currently viewed cabinet
            if (noteIdx !== curIdx) return;

            var placeholder = document.getElementById('viewer-notes-placeholder');
            if (placeholder) placeholder.remove();

            _appendNote(note);

            // Scroll to bottom
            var list = document.getElementById('viewer-notes-list');
            if (list) list.scrollTop = list.scrollHeight;
        })
        .on('postgres_changes', {
            event:  'DELETE',
            schema: 'public',
            table:  'project_messages',
            filter: 'share_token=eq.' + _token
        }, function(payload) {
            if (typeof window._viewerExtrasOnNoteDeleted === 'function') {
                window._viewerExtrasOnNoteDeleted(payload.old);
            }
        })
        .subscribe();
}

// Append a single note bubble
function _appendNote(note) {
    var list = document.getElementById('viewer-notes-list');
    if (!list) return;

    if (typeof window._viewerExtrasRenderNoteBubble === 'function') {
        var custom = window._viewerExtrasRenderNoteBubble(note, list);
        if (custom) {
            list.scrollTop = list.scrollHeight;
            return;
        }
    }

    var isClient   = note.sender_role === 'client';
    var isDesigner = note.sender_role === 'designer';
    var time = new Date(note.created_at).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });

    var wrap = document.createElement('div');
    wrap.className = 'viewer-note-wrap ' + (isClient ? 'client' : 'designer');

    var senderLabel = isClient ? (note.sender_name || 'אתה') : 'מעצב';

    wrap.innerHTML =
        '<div class="viewer-note-bubble ' + (isClient ? 'client' : 'designer') + '">' +
            _escHtml(note.message) +
        '</div>' +
        '<div class="viewer-note-meta">' + _escHtml(senderLabel) + ' · ' + time + '</div>';

    list.appendChild(wrap);
    list.scrollTop = list.scrollHeight;
}

// Render cabinet tabs inside the notes panel
function _renderNotesCabTabs() {
    var tabsEl = document.getElementById('viewer-notes-cab-tabs');
    if (!tabsEl) return;
    tabsEl.innerHTML = '';

    _cabinetList.forEach(function(cab, idx) {
        var tab = document.createElement('button');
        tab.className = 'viewer-notes-cab-tab' + (idx === _notesCabIdx ? ' active' : '');
        tab.dataset.idx = idx;

        var unread = _unreadCountPerCab[idx] || 0;
        var badgeHtml = unread > 0
            ? '<span class="viewer-notes-tab-badge">' + unread + '</span>'
            : '';

        tab.innerHTML = _escHtml(cab.label) + badgeHtml;
        tab.onclick = function() {
            _notesCabIdx = idx;
            _loadNotesForCabinet(idx);
        };
        tabsEl.appendChild(tab);
    });
}

// Open notes panel — BUG FIX: always reload notes for current cabinet
window._viewerOpenNotes = function() {
    if (!_clientName) _clientName = 'לקוח';
    _notesCabIdx = _activeCabIdx;
    _openNotesPanel();
    _loadNotesForCabinet(_activeCabIdx);  // ← תיקון באג: טוען הערות לפי ארון נבחר
};

function _openNotesPanel() {
    _notesOpen = true;
    var panel = document.getElementById('viewer-notes-panel');
    if (panel) {
        panel.style.display = 'flex';
        requestAnimationFrame(function() { panel.classList.add('open'); });
    }
    document.body.classList.add('notes-open');

    // Clear unread for current cabinet FIRST, then update total
    var prevUnread = _unreadCountPerCab[_notesCabIdx] || 0;
    _unreadCountPerCab[_notesCabIdx] = 0;
    _totalUnread = Math.max(0, _totalUnread - prevUnread);

    // Clear top bar badge
    _updateTopBarBadge();

    // Update only the specific card's note button — avoids full DOM rebuild / badge flash
    var nav = document.getElementById('viewer-cabinet-nav');
    if (nav) {
        var card = nav.querySelector('.viewer-cab-card[data-idx="' + _notesCabIdx + '"]');
        if (card) {
            var noteBtn = card.querySelector('.viewer-cab-note-btn');
            if (noteBtn) {
                var noteCount = _notesCountPerCab[_notesCabIdx] || 0;
                noteBtn.className = 'viewer-cab-note-btn' + (noteCount > 0 ? ' has-notes' : '');
                var badge = noteBtn.querySelector('.viewer-cab-note-btn-badge');
                if (badge) badge.textContent = '';
            }
        }
    }

    // Also mark as read in Supabase (fire-and-forget)
    if (_sb && _token) {
        _sb.from('project_messages')
            .update({ is_read: true })
            .eq('share_token', _token)
            .eq('sender_role', 'designer')
            .eq('is_read', false)
            .then(function(r) {
                if (r.error) console.warn('[Viewer] mark-read error:', r.error);
            });
    }

    setTimeout(function() {
        var inp = document.getElementById('viewer-notes-input');
        if (inp) inp.focus();
    }, 350);
}

window._viewerCloseNotes = function() {
    _notesOpen = false;
    var panel = document.getElementById('viewer-notes-panel');
    if (panel) {
        panel.classList.remove('open');
        setTimeout(function() { panel.style.display = 'none'; }, 300);
    }
    document.body.classList.remove('notes-open');
};

window._viewerSendNote = async function() {
    var input = document.getElementById('viewer-notes-input');
    var msg = input ? input.value.trim() : '';
    if (!msg || !_token || !_projectId) return;
    if (!_clientName) _clientName = 'לקוח';
    input.value = '';

    // Optimistically append
    var optimistic = {
        sender_role: 'client',
        sender_name: _clientName,
        message: msg,
        created_at: new Date().toISOString(),
        cabinet_index: _notesCabIdx,
        message_type: 'note'
    };
    var placeholder = document.getElementById('viewer-notes-placeholder');
    if (placeholder) placeholder.remove();
    _appendNote(optimistic);

    // Update count
    _notesCountPerCab[_notesCabIdx] = (_notesCountPerCab[_notesCabIdx] || 0) + 1;
    _renderCabinetNav();

    try {
        // Build payload — only include columns that exist
        var insertPayload = {
            project_id:  _projectId,
            share_token: _token,
            sender_role: 'client',
            sender_name: _clientName,
            message:     msg
        };

        // Add optional columns if they exist
        if (_cabIndexColExists !== false) {
            insertPayload.cabinet_index = _notesCabIdx;
        }
        insertPayload.message_type = 'note';

        var insertResult = await _sb.from('project_messages').insert(insertPayload);

        if (insertResult.error) {
            console.error('[Viewer] Send note INSERT error:', insertResult.error);

            // If column doesn't exist, retry with minimal payload
            if (insertResult.error.code === '42703') {
                _cabIndexColExists = false;
                var minPayload = {
                    project_id:  _projectId,
                    share_token: _token,
                    sender_role: 'client',
                    sender_name: _clientName,
                    message:     msg
                };
                var retryResult = await _sb.from('project_messages').insert(minPayload);
                if (retryResult.error) {
                    console.error('[Viewer] Send note retry error:', retryResult.error);
                    if (input) input.value = msg;
                } else {
                    console.log('[Viewer] Note sent (minimal payload, missing columns)');
                }
            } else {
                if (input) input.value = msg;
            }
        } else {
            console.log('[Viewer] Note sent successfully, cabIdx=' + _notesCabIdx);
        }
    } catch(e) {
        console.error('[Viewer] Send note exception:', e);
        if (input) input.value = msg;
    }
};

// ── Utility ───────────────────────────────────────────────────────────────────
function _escHtml(str) {
    return String(str || '')
        .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
        .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

// ── Restore client name from session ─────────────────────────────────────────
(function() {
    try {
        var saved = sessionStorage.getItem('viewer_client_name_' + new URLSearchParams(window.location.search).get('token'));
        if (saved) _clientName = saved;
    } catch(e) {}
})();

// ── Disable all editor interactions ──────────────────────────────────────────
window._VIEWER_MODE = true;

var _noOp = function() {};
var _editFunctions = [
    'applyContent','applyDoor','applyDoorStyle','applySubCellContent',
    'updateDim','updateColumns','updateQE','updateQEInput',
    'updateDrawerCount','updateSubCellShelves','applyPreset',
    'applyPresetPosition','setPendingWingPos','enterWingEditMode',
    'exitWingEditMode','confirmWingEdit','cancelWingEdit',
    'updateSideUnitType','updateSideCabinet','updateCorner','updateHandleStyle',
    'updateCornerSide','updateCornerType','updateSlidingDoor',
    'updateSlidingDoorPanel','updateSlidingDoorColor',
    'resetCurrentCabinet','undo','redo','saveHistoryState',
    'openOrderModal','startNewCabinet','newProject',
    'enterPartPaintMode','openMultiViewBlueprint','openModelViewer',
    '_saveProjectNow','_shareLiveLink'
];
_editFunctions.forEach(function(fn) { window[fn] = _noOp; });

// Prevent keyboard shortcuts that trigger editing
document.addEventListener('keydown', function(e) {
    var allowed = [9, 27, 13, 37, 38, 39, 40];
    if (allowed.indexOf(e.keyCode) !== -1) return;
    if (e.ctrlKey || e.metaKey) { e.preventDefault(); e.stopPropagation(); }
}, true);

// ── Hard reload — clears cache and reloads page ───────────────────────────────
window._hardReload = function() {
    // Add timestamp to URL to bypass cache
    var url = window.location.href.split('?')[0];
    var params = new URLSearchParams(window.location.search);
    params.set('_t', Date.now());
    window.location.href = url + '?' + params.toString();
};

// ── Cabinet carousel scroll (arrow buttons) ───────────────────────────────────
// direction: 1 = next (left in RTL), -1 = prev (right in RTL)
window._viewerNavScroll = function(direction) {
    var nav = document.getElementById('viewer-cabinet-nav');
    if (!nav) return;

    // If there are cabinets, switch to next/prev cabinet
    if (_cabinetList.length > 1) {
        var newIdx = _activeCabIdx + direction;
        if (newIdx < 0) newIdx = _cabinetList.length - 1;
        if (newIdx >= _cabinetList.length) newIdx = 0;
        _switchCabinet(newIdx);

        // Scroll the nav to show the active card
        setTimeout(function() {
            var activeCard = nav.querySelector('.viewer-cab-card.active');
            if (activeCard) {
                activeCard.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
            }
        }, 100);
    } else {
        // Fallback: scroll the nav container
        nav.scrollBy({ left: direction * 160, behavior: 'smooth' });
    }
};

// Public API for viewer-extras.js
window._viewerApi = {
    getSb: function() { return _sb; },
    getToken: function() { return _token; },
    getProjectId: function() { return _projectId; },
    getClientName: function() { return _clientName || 'לקוח'; },
    setClientName: function(n) { _clientName = n; },
    getActiveCabIdx: function() { return _activeCabIdx; },
    setActiveCabIdx: function(i) { _activeCabIdx = i; },
    getNotesCabIdx: function() { return _notesCabIdx; },
    getCabinetList: function() { return _cabinetList; },
    getProjectData: function() { return _projectData; },
    isLiveMode: function() { return !!_liveMode; },
    setLiveMode: function(v) { _liveMode = !!v; },
    switchCabinet: function(i) { return _switchCabinet(i); },
    restoreState: function(d) { return _restoreState(d); },
    renderCabinetNav: function() { return _renderCabinetNav(); },
    appendNote: function(n) { return _appendNote(n); },
    escHtml: function(s) { return _escHtml(s); },
    materialNames: MATERIAL_NAMES,
    materialColors: MATERIAL_COLORS,
    getColorOverrides: function() { return _viewerColorOverrides; },
    cabIndexColExists: function() { return _cabIndexColExists; },
    setCabIndexColExists: function(v) { _cabIndexColExists = v; },
    applyLiveProjectData: function(d, o) { return _applyLiveProjectData(d, o); },
    resolveLiveCabIndex: function(d) { return _resolveLiveCabIndex(d); },
    updateLiveBadge: function() { return _updateLiveBadge(); },
    updateInfoStrip: function() { return _updateInfoStrip(); }
};

})(); // end IIFE
