// ── Auth guard + project load on startup ──────────────────────────────────────
(async function _authInit() {
    // 1. Require login — redirects to login.html if no session
    var ok = await Auth.requireAuth();
    if (!ok) return;

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
                '<button onclick="Auth.logout()" title="יציאה" style="background:transparent;' +
                'border:1px solid var(--border);color:var(--text-light);border-radius:7px;padding:4px 9px;' +
                'font-size:0.75rem;cursor:pointer;font-family:inherit;display:flex;align-items:center;gap:4px;">' +
                    '<i class="fa-solid fa-right-from-bracket"></i> יציאה' +
                '</button>' +
                '<a href="projects.html" title="הפרויקטים שלי" style="background:transparent;' +
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

    // 4. Load features and apply UI gates based on plan  (was §3 before pricing block)
    var _features = await loadFeatures();
    var _planInfo  = window._plan;

    // Hide pricing section for designers (showPricing: false)
    if (_features && _features.showPricing === false) {
        var priceSec = document.getElementById('price-section-wrap');
        if (priceSec) priceSec.style.display = 'none';
        var lsFooter = document.querySelector('.left-sidebar-footer');
        if (lsFooter) lsFooter.style.display = 'none';
    }

    // Hide "שליחה לייצור" (factory export / carpenter blueprint) for non-carpenter plans
    if (_features && !_features.canExportCarpenter) {
        var btnFactory = document.getElementById('btn-factory-order');
        if (btnFactory) btnFactory.style.display = 'none';
    }

    // Hide "סיכום ללקוח" (customer report) for plans without canViewCustomerReport
    if (_features && !_features.canViewCustomerReport) {
        var btnReport = document.getElementById('btn-customer-report');
        if (btnReport) btnReport.style.display = 'none';
    }

    // Hide "מחשבון מהיר" for designers (no pricing)
    if (_features && _features.showPricing === false) {
        var btnCalc = document.getElementById('btn-quick-calc-open');
        if (btnCalc) btnCalc.style.display = 'none';
    }

    // Hide multiview blueprint (שרטוט ייצור) for non-carpenter plans
    if (_features && !_features.canExportCarpenter) {
        var btnMvbp = document.getElementById('btn-multiview-blueprint');
        if (btnMvbp) btnMvbp.style.display = 'none';
    }

    // Note: btn-3d-view is always available — it now enters presentation mode (free-orbit + room).

    // 4. Load project from URL param ?project=<id>
    var projectId = new URLSearchParams(window.location.search).get('project');
    if (projectId) {
        var proj = await Projects.load(projectId);
        if (proj && proj.project_data) {
            window._currentProjectId   = proj.id;
            window._currentProjectName = proj.name;
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
        console.log('[' + label + '] Saving, size:', Math.round(JSON.stringify(snap).length/1024) + 'KB');
        var result = await Projects.save(window._currentProjectId, window._currentProjectName, snap);
        if (result && result.error) {
            console.error('[' + label + '] Failed:', result.error);
            if (typeof _showToast === 'function') _showToast('⚠️ שגיאה בשמירת הפרויקט: ' + result.error, 5000);
        }
    }

    var _origSaveHistory = window.saveHistoryState;
    if (typeof _origSaveHistory === 'function') {
        window.saveHistoryState = function() {
            _origSaveHistory.apply(this, arguments);
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
        var result = await Projects.save(window._currentProjectId, window._currentProjectName, snap);
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
