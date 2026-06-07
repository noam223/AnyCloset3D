// ── Auth guard + project load on startup ──────────────────────────────────────
(async function _authInit() {
    // 1. Require login — redirects to login.html if no session
    var ok = await Auth.requireAuth();
    if (!ok) return; // requireAuth already redirected — gate stays visible

    // 2. Check subscription / trial status — redirect to projects.html if expired
    try {
        var subStatus = await Auth.isSubscriptionActive();
        if (subStatus && !subStatus.active) {
            // Trial expired or subscription inactive — projects.html shows the paywall
            window.location.href = 'projects.html';
            return;
        }
    } catch(e) {
        console.warn('[auth] Could not check subscription status:', e);
        // On error, allow access — don't block the user
    }

    // Auth passed — remove the loading gate so the app is visible
    var gate = document.getElementById('auth-gate');
    if (gate) gate.remove();

    // 2. Load user info and inject into top-bar
    var user = await Auth.getUser();
    if (user) {
        var name = (user.user_metadata && user.user_metadata.full_name)
            ? user.user_metadata.full_name
            : user.email;
        var initials = name.trim().split(/\s+/).slice(0,2).map(function(w){return w[0];}).join('').toUpperCase();

        var toolbar = document.getElementById('left-sidebar-toolbar');
        if (toolbar) {
            var userBar = document.createElement('div');
            userBar.id = 'user-bar';
            userBar.style.cssText =
                'display:flex;align-items:center;gap:8px;margin-right:auto;';
            userBar.innerHTML =
                '<div style="display:flex;align-items:center;gap:6px;background:rgba(30,58,95,0.07);' +
                'border-radius:20px;padding:4px 10px 4px 7px;font-size:0.78rem;color:var(--text-dark);font-weight:600;">' +
                    '<div style="width:22px;height:22px;background:#f59e0b;border-radius:50%;display:flex;' +
                    'align-items:center;justify-content:center;font-size:0.62rem;font-weight:700;color:#1e3a5f;flex-shrink:0;">' +
                        initials +
                    '</div>' +
                    '<span>' + _escHtml(name) + '</span>' +
                '</div>' +
                '<button onclick="window._confirmLeave(null, function(){ Auth.logout(); })" title="יציאה" style="background:transparent;' +
                'border:1px solid var(--border);color:var(--text-light);border-radius:7px;padding:4px 9px;' +
                'font-size:0.75rem;cursor:pointer;font-family:inherit;display:flex;align-items:center;gap:4px;">' +
                    '<i class="fa-solid fa-right-from-bracket"></i> יציאה' +
                '</button>' +
                '<a href="projects.html" onclick="event.preventDefault();window._confirmLeave(\'projects.html\')" title="הפרויקטים שלי" style="background:transparent;' +
                'border:1px solid var(--border);color:var(--text-light);border-radius:7px;padding:4px 9px;' +
                'font-size:0.75rem;cursor:pointer;font-family:inherit;display:flex;align-items:center;gap:4px;' +
                'text-decoration:none;">' +
                    '<i class="fa-solid fa-folder-open"></i> פרויקטים' +
                '</a>';
            toolbar.appendChild(userBar);
        }
    }

    // 3. Load pricing config from Supabase for this user
    if (user) {
        try {
            var _sb_init = window._supabase || (window.supabase && window.supabase.createClient
                ? window.supabase.createClient(
                    'https://meqxnsjycvfgfhdepguo.supabase.co',
                    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1lcXhuc2p5Y3ZmZ2ZoZGVwZ3VvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY3MDA5NDAsImV4cCI6MjA5MjI3Njk0MH0.w63bl0-1-Rgt9Nx6sVW5ueEGMojiMaxoehlPXlPH2N0'
                  )
                : null);
            if (_sb_init) {
                var { data: _pricingRow } = await _sb_init
                    .from('pricing_configs')
                    .select('config')
                    .eq('user_id', user.id)
                    .single();
                if (_pricingRow && _pricingRow.config && Object.keys(_pricingRow.config).length > 0) {
                    window._pricingConfig = _pricingRow.config;
                    console.log('[pricing] Loaded user pricing config from Supabase');
                } else {
                    window._pricingConfig = null;
                    console.log('[pricing] No custom pricing config — using defaults');
                }
            }
        } catch(e) {
            console.warn('[pricing] Could not load pricing config:', e);
            window._pricingConfig = null;
        }
    }

    // 3b. Load user logo
    if (user && _sb_init) {
        try {
            var { data: _profileRow } = await _sb_init
                .from('profiles')
                .select('logo_url')
                .eq('id', user.id)
                .single();
            window._userLogoUrl = (_profileRow && _profileRow.logo_url) ? _profileRow.logo_url : null;
        } catch(e) { window._userLogoUrl = null; }
    }

    // 4. Load features and apply UI gates based on plan  (was §3 before pricing block)
    var _features = await loadFeatures();
    var _planInfo  = window._plan;

    // price-boxes-row and sidebar-pricing-summary start hidden — show only if showPricing is true
    window._showPricing = (_features && _features.showPricing === true);
    if (window._showPricing) {
        var priceBoxesRow = document.getElementById('price-boxes-row');
        if (priceBoxesRow) priceBoxesRow.style.display = 'flex';
        var pricingSummary = document.getElementById('sidebar-pricing-summary');
        if (pricingSummary) pricingSummary.style.display = 'block';
    }

    // All feature buttons start hidden in HTML — show them based on plan features
    if (_features && _features.canExportCarpenter) {
        var btnFactory = document.getElementById('btn-factory-order');
        if (btnFactory) btnFactory.style.display = 'flex';
    }

    if (_features && _features.canViewCustomerReport) {
        var btnReport = document.getElementById('btn-customer-report');
        if (btnReport) btnReport.style.display = 'flex';
    }

    if (_features && _features.showPricing !== false) {
        var btnCalc = document.getElementById('btn-quick-calc-open');
        if (btnCalc) btnCalc.style.display = 'flex';
    }

    if (_features && (_features.canExportBlueprint || _features.canExportCarpenter)) {
        var btnMvbp = document.getElementById('btn-multiview-blueprint');
        if (btnMvbp) btnMvbp.style.display = 'inline-flex';
    }

    // Note: btn-3d-view is always available — it now enters presentation mode (free-orbit + room).

    // 4. Load project from URL param ?project=<id>
    var projectId = new URLSearchParams(window.location.search).get('project');
    var _thumbOnly = new URLSearchParams(window.location.search).get('thumbOnly') === '1';
    if (_thumbOnly) {
        document.documentElement.classList.add('thumb-only-mode');
    }
    if (projectId) {
        var proj = await Projects.load(projectId);
        if (proj && proj.project_data) {
            window._currentProjectId   = proj.id;
            window._currentProjectName = proj.name;
            window._needsThumbnailBackfill = !proj.thumbnail && !_thumbOnly;
            try {
                var snap = typeof proj.project_data === 'string'
                    ? JSON.parse(proj.project_data)
                    : proj.project_data;
                if (snap && typeof state !== 'undefined') {
                    // Restore wings FIRST (before proxy fields) to avoid writing flat fields
                    // to the wrong wing via the proxy setters
                    if (snap.wings) {
                        state.wings.center = snap.wings.center || state.wings.center;
                        state.wings.left   = snap.wings.left   || null;
                        state.wings.right  = snap.wings.right  || null;
                    }
                    if (snap.activeWing) state.activeWing = snap.activeWing;
                    if (snap.presetId)   state.presetId   = snap.presetId;
                    // Restore room wall position
                    if (snap.roomWall) {
                        state.roomWall   = snap.roomWall;
                        window._roomWall = snap.roomWall;
                    } else {
                        state.roomWall   = 'center';
                        window._roomWall = 'center';
                    }
                    // Restore closure panel settings
                    window._closureEnabled    = (snap.closureEnabled !== undefined) ? snap.closureEnabled : true;
                    window._closureWidth      = snap.closureWidth      || 1.8;
                    window._closureWidthRight = snap.closureWidthRight || 1.8;
                    window._closureCeilWidth  = snap.closureCeilWidth  || 1.8;
                    window._closureDepthWidth = snap.closureDepthWidth || 1.8;
                    window._closureFrontLine  = snap.closureFrontLine  || 'cabinet';
                    // Restore niche settings
                    window._nicheEnabled             = (snap.nicheEnabled !== undefined) ? snap.nicheEnabled : false;
                    window._nicheWidth               = snap.nicheWidth || 200;
                    window._nicheDepth               = snap.nicheDepth || 30;
                    window._nicheClosureEnabled      = (snap.nicheClosureEnabled !== undefined) ? snap.nicheClosureEnabled : false;
                    window._nicheClosureWidthLeft    = snap.nicheClosureWidthLeft  || 1.8;
                    window._nicheClosureWidthRight   = snap.nicheClosureWidthRight || 1.8;
                    window._nicheClosureCeilHeight   = snap.nicheClosureCeilHeight || 1.8;
                    // Restore non-wing global fields
                    if (snap.viewMode)   state.viewMode   = snap.viewMode;
                    if (snap.partColors) state.partColors = snap.partColors;
                    // Restore cart (multiple cabinets) and customer info
                    if (snap.orderCart) {
                        state.orderCart = snap.orderCart;
                        var cc = document.getElementById('cart-count');
                        if (cc) cc.innerText = state.orderCart.length;
                    }
                    if (snap.customer) {
                        state.customer = snap.customer;
                        var custFields = [['cust-name','name'],['cust-phone','phone'],['cust-order-num','orderNum'],['cust-address','address']];
                        custFields.forEach(function(f) { var el = document.getElementById(f[0]); if (el) el.value = state.customer[f[1]] || ''; });
                    }
                    buildCabinet();
                    if (typeof window._restorePresetUI === 'function') window._restorePresetUI();
                    if (typeof updateLeftSidebar === 'function') updateLeftSidebar();
                    saveHistoryState();
                }
            } catch(e) {
                console.warn('Could not restore project data:', e);
            }
            // If this project already has a share token, restore the share URL and start chat listener
            if (proj.share_token) {
                window._currentShareToken = proj.share_token;
                var _base = window.location.href.replace(/\/[^/]*$/, '/');
                window._currentShareUrl   = _base + 'viewer.html?token=' + proj.share_token;
                // Start notes listener so designer sees client notes in real-time
                setTimeout(function() {
                    if (typeof window._startDesignerNotesListener === 'function') {
                        window._startDesignerNotesListener(proj.share_token);
                    }
                    var floatBtn = document.getElementById('designer-notes-float-btn');
                    if (floatBtn) floatBtn.style.display = 'flex';
                    var notesBtn = document.getElementById('btn-designer-notes');
                    if (notesBtn) notesBtn.style.display = 'flex';
                }, 500);
            }
            // Generate thumbnail for projects page (iframe backfill mode)
            if (_thumbOnly) {
                setTimeout(function() { _runThumbOnlyCapture(); }, 2500);
            } else if (window._needsThumbnailBackfill) {
                setTimeout(function() { _backfillProjectThumbnail(); }, 2000);
            }
        }
    }

    async function _backfillProjectThumbnail() {
        if (!window._currentProjectId || typeof window.captureProjectThumbnail !== 'function') return;
        var thumb = window.captureProjectThumbnail();
        if (!thumb) return;
        var res = await Projects.updateThumbnail(window._currentProjectId, thumb);
        if (!res || res.error) console.warn('[Thumbnail] backfill failed:', res && res.error);
        else window._needsThumbnailBackfill = false;
    }

    async function _runThumbOnlyCapture() {
        if (!window._currentProjectId || typeof window.captureProjectThumbnail !== 'function') return;
        var thumb = window.captureProjectThumbnail();
        if (thumb) {
            await Projects.updateThumbnail(window._currentProjectId, thumb);
            try {
                window.parent.postMessage({ type: 'project-thumbnail', id: window._currentProjectId, thumbnail: thumb }, '*');
            } catch (e) {}
        }
    }

    // 5. Auto-save logic
    // ─ Regular auto-save: debounced 60s (doesn't spam Supabase)
    // ─ Live push: when share is active, also saves after 800ms debounce so client sees updates fast
    var _autoSaveTimer  = null;
    var _livePushTimer  = null;

    // Helper: build a lightweight snapshot of current state
    function _buildSnap() {
        var lightCart = (state.orderCart || []).map(function(item) {
            if (!item || !item.spec) return item;
            var lightSpec = Object.assign({}, item.spec);
            delete lightSpec.imgDoors; delete lightSpec.imgOpen;
            delete lightSpec.imgBlueprint; delete lightSpec.multiViewSVG; delete lightSpec.multiViewPages;
            return { spec: lightSpec, rawState: item.rawState };
        });
        return JSON.parse(JSON.stringify({
            globalWidth:   state.globalWidth,
            globalHeight:  state.globalHeight,
            globalDepth:   state.globalDepth,
            plinthHeight:  state.plinthHeight,
            thickness:     state.thickness,
            boardMaterial: state.boardMaterial,
            doorMaterial:  state.doorMaterial,
            placement:     state.placement,
            columns:       state.columns,
            wings:         state.wings,
            activeWing:    state.activeWing,
            presetId:      state.presetId,
            orderCart:         lightCart,
            customer:          state.customer,
            roomWall:          window._roomWall || state.roomWall || 'center',
            closureEnabled:    (window._closureEnabled !== undefined) ? window._closureEnabled : true,
            closureWidth:      window._closureWidth      || 1.8,
            closureWidthRight: window._closureWidthRight || 1.8,
            closureCeilWidth:  window._closureCeilWidth  || 1.8,
            closureDepthWidth: window._closureDepthWidth || 1.8,
            closureFrontLine:  window._closureFrontLine  || 'cabinet',
            nicheEnabled:           (window._nicheEnabled !== undefined) ? window._nicheEnabled : false,
            nicheWidth:                window._nicheWidth || 200,
            nicheDepth:                window._nicheDepth || 30,
            nicheClosureEnabled:       (window._nicheClosureEnabled !== undefined) ? window._nicheClosureEnabled : false,
            nicheClosureWidthLeft:     window._nicheClosureWidthLeft  || 1.8,
            nicheClosureWidthRight:    window._nicheClosureWidthRight || 1.8,
            nicheClosureCeilHeight:    window._nicheClosureCeilHeight || 1.8
        }));
    }

    async function _doSave(label) {
        if (!window._currentProjectId) return;
        var snap;
        try { snap = _buildSnap(); } catch(e) { console.error('[Save] Serialization error:', e); return; }
        var thumb = null;
        try {
            if (typeof window.captureProjectThumbnail === 'function') thumb = window.captureProjectThumbnail();
        } catch (e) { console.warn('[Save] Thumbnail capture failed:', e); }
        console.log('[' + label + '] Saving, size:', Math.round(JSON.stringify(snap).length/1024) + 'KB');
        var result = await Projects.save(window._currentProjectId, window._currentProjectName, snap, thumb);
        if (result && result.error) {
            console.error('[' + label + '] Failed:', result.error);
            if (typeof _showToast === 'function') _showToast('⚠️ שגיאה בשמירת הפרויקט: ' + result.error, 5000);
        } else {
            window._isDirty = false;
        }
    }

    var _origSaveHistory = window.saveHistoryState;
    if (typeof _origSaveHistory === 'function') {
        window.saveHistoryState = function() {
            _origSaveHistory.apply(this, arguments);
            // Mark project as having unsaved changes
            window._isDirty = true;
            if (!window._currentProjectId) return;

            // Regular auto-save — every 60s debounce
            clearTimeout(_autoSaveTimer);
            _autoSaveTimer = setTimeout(function() { _doSave('AutoSave'); }, 60000);

            // Live push — only when share is active, 800ms debounce
            if (window._currentShareToken) {
                clearTimeout(_livePushTimer);
                _livePushTimer = setTimeout(function() { _doSave('LivePush'); }, 800);
            }
        };
    }

    // ── Unsaved-changes guard ─────────────────────────────────────────────────
    // 1. Native browser dialog for F5 / tab close / external navigation
    // Clear ?project= from URL before unload so a reload opens a blank editor
    window.addEventListener('beforeunload', function(e) {
        if (window._currentProjectId && history.replaceState) {
            history.replaceState(null, '', 'index.html');
        }
        if (!window._isDirty) return;
        e.preventDefault();
        e.returnValue = ''; // required for Chrome
    });

    // 2. Custom Hebrew dialog for internal SPA-style navigation links
    //    (logo → projects.html, "פרויקטים" button, logout)
    window._confirmLeave = async function(destination, action) {
        if (!window._isDirty) {
            if (typeof action === 'function') action();
            else if (destination) window.location.href = destination;
            return;
        }
        // Build modal
        var overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;inset:0;z-index:999999;background:rgba(0,0,0,0.55);display:flex;align-items:center;justify-content:center;';
        overlay.innerHTML =
            '<div style="background:#fff;border-radius:16px;padding:28px 28px 22px;max-width:360px;width:90%;box-shadow:0 8px 40px rgba(0,0,0,0.3);text-align:center;direction:rtl;">' +
                '<div style="font-size:2rem;margin-bottom:10px;">💾</div>' +
                '<h3 style="margin:0 0 8px;font-size:1.1rem;color:#1e3a5f;">יש שינויים שלא נשמרו</h3>' +
                '<p style="margin:0 0 22px;font-size:0.88rem;color:#64748b;line-height:1.5;">האם לשמור את השינויים לפני היציאה?</p>' +
                '<div style="display:flex;flex-direction:column;gap:8px;">' +
                    '<button id="_leave-save" style="padding:10px;border-radius:9px;border:none;background:#6366f1;color:#fff;font-size:0.92rem;font-weight:700;cursor:pointer;font-family:inherit;">💾 שמור ויצא</button>' +
                    '<button id="_leave-discard" style="padding:10px;border-radius:9px;border:1.5px solid #e2e8f0;background:#f8fafc;color:#374151;font-size:0.92rem;font-weight:600;cursor:pointer;font-family:inherit;">🗑️ יצא בלי לשמור</button>' +
                    '<button id="_leave-cancel" style="padding:10px;border-radius:9px;border:none;background:transparent;color:#94a3b8;font-size:0.88rem;cursor:pointer;font-family:inherit;">ביטול</button>' +
                '</div>' +
            '</div>';
        document.body.appendChild(overlay);

        function _close() { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); }

        document.getElementById('_leave-cancel').onclick = _close;
        overlay.addEventListener('click', function(e) { if (e.target === overlay) _close(); });

        document.getElementById('_leave-discard').onclick = function() {
            _close();
            window._isDirty = false;
            if (typeof action === 'function') action();
            else if (destination) window.location.href = destination;
        };

        document.getElementById('_leave-save').onclick = async function() {
            _close();
            await window._saveProjectNow();
            window._isDirty = false;
            if (typeof action === 'function') action();
            else if (destination) window.location.href = destination;
        };
    };
})();

// ── Desk drawers toggle buttons ──────────────────────────────────────────────
window._setDeskDrawers = function(hasDrawers) {
    var cb = document.getElementById('inp-desk-drawers');
    if (cb) {
        cb.checked = hasDrawers;
        cb.dispatchEvent(new Event('change'));
    }
    // Sync mobile checkbox too
    var mobCb = document.getElementById('mobile-inp-desk-drawers');
    if (mobCb) mobCb.checked = hasDrawers;
    // Update button active states (CSS handles styling via .active class)
    document.querySelectorAll('.desk-drawers-btn').forEach(function(b) {
        b.classList.toggle('active', (b.dataset.drawers === 'true') === hasDrawers);
    });
    // Show/hide drawer count row
    var dcRow = document.getElementById('side-desk-drawer-count-row');
    if (dcRow) {
        var w = (typeof getWing === 'function') ? getWing() : null;
        var hasSide = w && w.desk && w.desk.side !== 'none';
        dcRow.style.display = (hasDrawers && hasSide) ? 'block' : 'none';
    }
};

// ── Side cabinet side toggle buttons ─────────────────────────────────────────
window._toggleSCside = function(side) {
    // Read current state from hidden checkboxes
    var chkRight = document.getElementById('sc-chk-right');
    var chkLeft  = document.getElementById('sc-chk-left');
    if (!chkRight || !chkLeft) return;
    if (side === 'right') {
        // Toggle right; ensure at least one side remains active
        var newRight = !chkRight.checked;
        if (!newRight && !chkLeft.checked) return; // can't deselect both
        chkRight.checked = newRight;
        updateSideCabinet('sideRight', newRight);
    } else {
        var newLeft = !chkLeft.checked;
        if (!newLeft && !chkRight.checked) return; // can't deselect both
        chkLeft.checked = newLeft;
        updateSideCabinet('sideLeft', newLeft);
    }
    // Sync button active states
    _syncSCsideBtns();
};

window._syncSCsideBtns = function() {
    var chkRight = document.getElementById('sc-chk-right');
    var chkLeft  = document.getElementById('sc-chk-left');
    var btnRight = document.getElementById('sc-btn-right');
    var btnLeft  = document.getElementById('sc-btn-left');
    // CSS handles styling via .active class
    if (btnRight && chkRight) btnRight.classList.toggle('active', chkRight.checked);
    if (btnLeft  && chkLeft)  btnLeft.classList.toggle('active',  chkLeft.checked);
};

// ── Manual "Save Project" button ─────────────────────────────────────────────
window._saveProjectNow = async function() {
    // If no project is open yet, ask for a name and create one
    if (!window._currentProjectId) {
        var projectName = window.prompt('שם הפרויקט החדש:', state.cabinetName || 'פרויקט חדש');
        if (!projectName) return; // user cancelled
        projectName = projectName.trim() || 'פרויקט חדש';
        window._currentProjectName = projectName;
        // Will be assigned after first save below (projectId = null → insert)
    }

    var btn = document.getElementById('btn-save-project-sidebar');
    var origHTML = btn ? btn.innerHTML : '';
    if (btn) { btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> שומר...'; btn.disabled = true; }

    try {
        var lightCart = (state.orderCart || []).map(function(item) {
            if (!item || !item.spec) return item;
            var lightSpec = Object.assign({}, item.spec);
            delete lightSpec.imgDoors;
            delete lightSpec.imgOpen;
            delete lightSpec.imgBlueprint;
            delete lightSpec.multiViewSVG;
            delete lightSpec.multiViewPages;
            return { spec: lightSpec, rawState: item.rawState };
        });
        var snap = JSON.parse(JSON.stringify({
            globalWidth:   state.globalWidth,
            globalHeight:  state.globalHeight,
            globalDepth:   state.globalDepth,
            plinthHeight:  state.plinthHeight,
            thickness:     state.thickness,
            boardMaterial: state.boardMaterial,
            doorMaterial:  state.doorMaterial,
            placement:     state.placement,
            columns:       state.columns,
            wings:         state.wings,
            activeWing:    state.activeWing,
            presetId:      state.presetId,
            orderCart:     lightCart,
            customer:      state.customer
        }));
        console.log('[SaveNow] Saving project "' + window._currentProjectName + '", payload size:', Math.round(JSON.stringify(snap).length/1024) + 'KB, cart items:', lightCart.length);
        var thumb = null;
        try {
            if (typeof window.captureProjectThumbnail === 'function') thumb = window.captureProjectThumbnail();
        } catch (e) { console.warn('[SaveNow] Thumbnail capture failed:', e); }
        var result = await Projects.save(window._currentProjectId, window._currentProjectName, snap, thumb);
        if (result && result.error) {
            console.error('[SaveNow] Failed:', result.error);
            if (typeof _showToast === 'function') _showToast('⚠️ שגיאה בשמירה: ' + result.error, 5000);
            if (btn) { btn.innerHTML = origHTML; btn.disabled = false; }
        } else {
            // If this was a new project, store the returned ID so future saves update it
            if (!window._currentProjectId && result && result.data && result.data.id) {
                window._currentProjectId = result.data.id;
                console.log('[SaveNow] New project created with id:', window._currentProjectId);
            }
            console.log('[SaveNow] Saved successfully');
            window._isDirty = false;
            if (btn) { btn.innerHTML = '<i class="fa-solid fa-check"></i> נשמר!'; btn.disabled = false; }
            setTimeout(function() { if (btn) btn.innerHTML = origHTML; }, 2000);
            if (typeof _showToast === 'function') _showToast('✅ הפרויקט נשמר בהצלחה', 3000);
        }
    } catch(e) {
        console.error('[SaveNow] Exception:', e);
        if (typeof _showToast === 'function') _showToast('⚠️ שגיאה בשמירה: ' + e.message, 5000);
        if (btn) { btn.innerHTML = origHTML; btn.disabled = false; }
    }
};

function _escHtml(str) {
    return String(str || '')
        .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
        .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}