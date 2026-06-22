// ── AI Renders — generate & display photorealistic renders ────────────────────

(function() {

var _sbRenders = null;
var _currentUserId = null;
var _panelOpen = false;
var _projectRenders = [];  // renders for current project
var _lightboxIndex = -1;

// ── Init ──────────────────────────────────────────────────────────────────────
window._initAiRenders = async function() {
    var sb = window._supabase;
    if (!sb) return;
    _sbRenders = sb;

    var { data: { user } } = await sb.auth.getUser();
    if (!user) return;
    _currentUserId = user.id;

    _injectStyles();
    _injectPanel();
    _injectToolbarBtn();
    _injectLightbox();
};

// ── Toolbar button ─────────────────────────────────────────────────────────
function _injectToolbarBtn() {
    var toolbar = document.querySelector('.top-controls');
    if (!toolbar || document.getElementById('btn-ai-render')) return;

    var btn = document.createElement('button');
    btn.id = 'btn-ai-render';
    btn.className = 'view-btn';
    btn.title = 'הדמיה פוטוריאליסטית';
    btn.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i> <span style="font-size:0.82rem;">הדמיה</span>';
    btn.onclick = _togglePanel;
    toolbar.appendChild(btn);
}

// ── Side panel ────────────────────────────────────────────────────────────────
function _injectPanel() {
    if (document.getElementById('ai-renders-panel')) return;

    var panel = document.createElement('div');
    panel.id = 'ai-renders-panel';
    panel.className = 'ai-renders-panel';
    panel.innerHTML = `
        <div class="ai-renders-panel-header">
            <div style="display:flex;align-items:center;gap:8px;">
                <i class="fa-solid fa-wand-magic-sparkles" style="color:#a855f7;"></i>
                <span style="font-weight:700;font-size:1rem;">הדמיות פוטוריאליסטיות</span>
            </div>
            <button onclick="window._closeAiPanel()" style="background:none;border:none;cursor:pointer;color:#94a3b8;font-size:1.1rem;padding:4px;">
                <i class="fa-solid fa-xmark"></i>
            </button>
        </div>
        <div class="ai-renders-quota-bar" id="ai-renders-quota-bar">
            <span id="ai-renders-quota-text" style="font-size:0.8rem;color:#64748b;">טוען...</span>
            <div class="ai-renders-quota-track">
                <div class="ai-renders-quota-fill" id="ai-renders-quota-fill" style="width:0%"></div>
            </div>
        </div>
        <div class="ai-renders-generate-btns">
            <button id="btn-generate-render" class="btn-generate-render" onclick="window._generateRender(false)" title="Nano Banana — מהיר">
                <i class="fa-solid fa-sparkles"></i> צור הדמיה חדשה
            </button>
            <button id="btn-generate-render-pro" class="btn-generate-render btn-generate-render-pro" onclick="window._generateRenderPro()" title="Nano Banana Pro — איכות מקסימלית">
                <i class="fa-solid fa-crown"></i> צור הדמיה PRO
            </button>
        </div>
        <div id="ai-renders-status" class="ai-renders-status" style="display:none;"></div>
        <div id="ai-renders-grid" class="ai-renders-grid"></div>
    `;
    document.body.appendChild(panel);
}

// ── Lightbox ──────────────────────────────────────────────────────────────────
function _injectLightbox() {
    if (document.getElementById('ai-lightbox')) return;
    var lb = document.createElement('div');
    lb.id = 'ai-lightbox';
    lb.className = 'ai-lightbox';
    lb.onclick = function(e) { if (e.target === lb) window._closeAiLightbox(); };
    lb.innerHTML = `
        <div class="ai-lightbox-inner">
            <button onclick="window._closeAiLightbox()" class="ai-lightbox-close"><i class="fa-solid fa-xmark"></i></button>
            <button onclick="window._lightboxNav(-1)" class="ai-lightbox-nav ai-lightbox-prev"><i class="fa-solid fa-chevron-right"></i></button>
            <img id="ai-lightbox-img" src="" alt="הדמיה פוטוריאליסטית">
            <button onclick="window._lightboxNav(1)" class="ai-lightbox-nav ai-lightbox-next"><i class="fa-solid fa-chevron-left"></i></button>
            <div class="ai-lightbox-footer">
                <span id="ai-lightbox-date" style="font-size:0.82rem;color:#94a3b8;"></span>
                <a id="ai-lightbox-download" href="#" download="render.jpg" target="_blank"
                   style="font-size:0.82rem;color:#a855f7;text-decoration:none;display:flex;align-items:center;gap:5px;">
                    <i class="fa-solid fa-download"></i> הורד תמונה
                </a>
                <button id="ai-lightbox-delete" onclick="window._deleteCurrentRender()"
                        style="background:none;border:none;cursor:pointer;color:#ef4444;font-size:0.82rem;display:flex;align-items:center;gap:5px;">
                    <i class="fa-solid fa-trash"></i> מחק
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(lb);
}

// ── Toggle panel ──────────────────────────────────────────────────────────────
window._togglePanel = function() {
    _panelOpen ? window._closeAiPanel() : window._openAiPanel();
};

window._openAiPanel = async function() {
    _panelOpen = true;
    var panel = document.getElementById('ai-renders-panel');
    if (panel) panel.classList.add('open');
    await _loadProjectRenders();
};

window._closeAiPanel = function() {
    _panelOpen = false;
    var panel = document.getElementById('ai-renders-panel');
    if (panel) panel.classList.remove('open');
};

// ── Load renders for current project ──────────────────────────────────────────
async function _loadProjectRenders() {
    if (!_sbRenders || !_currentUserId) return;

    var projectId = window._currentProjectId || null;
    var query = _sbRenders.from('ai_renders')
        .select('id, image_url, hex_color, created_at, project_id')
        .eq('user_id', _currentUserId)
        .order('created_at', { ascending: false });

    if (projectId) query = query.eq('project_id', projectId);

    var { data, error } = await query.limit(50);
    if (error) { console.error('[ai-renders] load error:', error); return; }

    _projectRenders = data || [];
    _renderGrid();
    await _updateQuota();
}

async function _updateQuota() {
    if (!_sbRenders) return;
    var [countRes, profileRes] = await Promise.all([
        _sbRenders.rpc('get_ai_renders_count_this_month', { p_user_id: _currentUserId }),
        _sbRenders.from('profiles').select('ai_renders_quota, subscription_status').eq('id', _currentUserId).single()
    ]);
    var used = countRes.data ?? 0;
    var profile = profileRes.data || {};
    var isTrial = profile.subscription_status === 'trial';
    var limit = isTrial ? 5 : (profile.ai_renders_quota ?? 50);
    var pct = Math.min(100, Math.round(used / limit * 100));

    var text = document.getElementById('ai-renders-quota-text');
    var fill = document.getElementById('ai-renders-quota-fill');
    if (text) text.textContent = 'השתמשת ב-' + used + ' מתוך ' + limit + ' הדמיות החודש';
    if (fill) { fill.style.width = pct + '%'; fill.style.background = pct >= 90 ? '#ef4444' : pct >= 70 ? '#f59e0b' : '#a855f7'; }

    var overQuota = used >= limit;
    ['btn-generate-render', 'btn-generate-render-pro'].forEach(function(id) {
        var b = document.getElementById(id);
        if (!b) return;
        b.disabled = overQuota;
        if (overQuota) {
            b.title = 'הגעת למכסה החודשית';
        } else if (id === 'btn-generate-render-pro') {
            b.title = 'Nano Banana Pro — איכות גבוהה (45–90 שניות)';
        } else {
            b.title = 'Nano Banana — הדמיה מהירה (15–30 שניות)';
        }
    });
}

function _setRenderButtonsDisabled(disabled) {
    ['btn-generate-render', 'btn-generate-render-pro', 'btn-layout-render'].forEach(function(id) {
        var el = document.getElementById(id);
        if (el) el.disabled = disabled;
    });
}

// ── Render grid ───────────────────────────────────────────────────────────────
function _renderGrid() {
    var grid = document.getElementById('ai-renders-grid');
    if (!grid) return;

    if (!_projectRenders.length) {
        grid.innerHTML = '<div style="text-align:center;padding:40px 20px;color:#94a3b8;"><i class="fa-solid fa-image" style="font-size:2.5rem;opacity:0.3;margin-bottom:12px;display:block;"></i><div style="font-size:0.88rem;">אין הדמיות עדיין<br>לחץ "צור הדמיה חדשה" כדי להתחיל</div></div>';
        return;
    }

    grid.innerHTML = '';
    _projectRenders.forEach(function(r, i) {
        var thumb = document.createElement('div');
        thumb.className = 'ai-render-thumb';
        thumb.onclick = function() { window._openAiLightbox(i); };
        var date = new Date(r.created_at).toLocaleDateString('he-IL', { day:'2-digit', month:'2-digit' });
        thumb.innerHTML = '<img src="' + r.image_url + '" loading="lazy" alt="הדמיה ' + (i+1) + '">' +
            '<div class="ai-render-thumb-overlay"><span>' + date + '</span></div>';
        grid.appendChild(thumb);
    });
}

// ── Generate: step 1 — capture screenshots then open prompt dialog ────────────
window._generateRenderPro = function() {
    return window._generateRender(true);
};

window._generateRender = async function(isPro) {
    var tier = isPro ? 'pro' : 'standard';
    var btn = document.getElementById(tier === 'pro' ? 'btn-generate-render-pro' : 'btn-generate-render');
    if (!btn || btn.disabled) return;
    if (!window.renderer) { _showStatus('error', 'לא נמצא renderer'); return; }

    _showStatus('loading', '<i class="fa-solid fa-spinner fa-spin"></i> מצלם חזית...');
    _setRenderButtonsDisabled(true);

    // Save current camera state
    var _savedPos    = window.camera ? window.camera.position.clone() : null;
    var _savedTarget = window.controls ? window.controls.target.clone() : null;

    var cabinetW = (typeof state !== 'undefined' && state.globalWidth)  ? state.globalWidth  : 160;
    var cabinetH = (typeof state !== 'undefined' && state.globalHeight) ? state.globalHeight : 240;

    // Screenshot 1: front view — straight on, centered on cabinet
    var imageFront;
    if (window.camera && window.controls && window.renderer && window.scene) {
        var targetCenterY = cabinetH / 2;
        var distFront = cabinetH * 2.5;
        window.camera.position.set(0, targetCenterY, distFront);
        window.controls.target.set(0, targetCenterY, 0);
        window.controls.update();
        window.camera.updateMatrixWorld(true);
        window.renderer.render(window.scene, window.camera);
        console.log('[Front shot]', window.camera.position.x.toFixed(0), window.camera.position.y.toFixed(0), window.camera.position.z.toFixed(0));
    }
    await new Promise(function(r) { setTimeout(r, 100); });
    try { imageFront = window.renderer.domElement.toDataURL('image/jpeg', 0.85); }
    catch(e) { _showStatus('error', 'שגיאה בצילום חזית'); _setRenderButtonsDisabled(false); await _updateQuota(); return; }

    // Screenshot 2: 3D angle left (-291, 185, 511)
    _showStatus('loading', '<i class="fa-solid fa-spinner fa-spin"></i> מצלם זווית שמאל...');
    var image3dLeft;
    try {
        if (window.camera && window.controls && window.renderer && window.scene) {
            window.camera.position.set(-291, 185, 511);
            window.controls.target.set(0, cabinetH / 2, 0);
            window.controls.update();
            window.camera.updateMatrixWorld(true);
            window.renderer.render(window.scene, window.camera);
        }
        await new Promise(function(r) { setTimeout(r, 100); });
        image3dLeft = window.renderer.domElement.toDataURL('image/jpeg', 0.85);
    } catch(e) { image3dLeft = imageFront; }

    // Screenshot 3: 3D angle right (344, 178, 368)
    _showStatus('loading', '<i class="fa-solid fa-spinner fa-spin"></i> מצלם זווית ימין...');
    var image3dRight;
    try {
        if (window.camera && window.controls && window.renderer && window.scene) {
            window.camera.position.set(344, 178, 368);
            window.controls.target.set(0, cabinetH / 2, 0);
            window.controls.update();
            window.camera.updateMatrixWorld(true);
            window.renderer.render(window.scene, window.camera);
        }
        await new Promise(function(r) { setTimeout(r, 100); });
        image3dRight = window.renderer.domElement.toDataURL('image/jpeg', 0.85);
    } catch(e) { image3dRight = imageFront; }

    // Restore original camera
    if (_savedPos && window.camera && window.controls) {
        window.camera.position.copy(_savedPos);
        window.controls.target.copy(_savedTarget);
        window.controls.update();
        window.renderer.render(window.scene, window.camera);
    }

    var image3d = image3dLeft; // keep backward compat

    _hideStatus();
    _setRenderButtonsDisabled(false);
    await _updateQuota();

    _openPromptDialog(imageFront, image3dLeft, image3dRight, _getDominantColor(), _getCabinetSpec(), tier);
};

// ── Layout mode: single current-view capture + empty prompt ─────────────────
window._generateLayoutRender = async function() {
    if (!window._layoutModeActive) return;
    if (!window.renderer) {
        if (typeof window._showToast === 'function') window._showToast('לא נמצא renderer', 2500);
        return;
    }

    var btn = document.getElementById('btn-layout-render');
    if (btn) btn.disabled = true;

    try {
        if (window.renderer && window.scene && window.camera) {
            window.renderer.render(window.scene, window.camera);
        }
        await new Promise(function(r) { setTimeout(r, 50); });
        var image = window.renderer.domElement.toDataURL('image/jpeg', 0.85);
        _openLayoutPromptDialog(image);
    } catch (e) {
        if (typeof window._showToast === 'function') window._showToast('שגיאה בצילום המסך', 2500);
    } finally {
        if (btn) btn.disabled = false;
    }
};

function _aiDialogSubmitBtnHtml(isPro) {
    var bg = isPro ? 'linear-gradient(135deg,#f59e0b,#d97706)' : 'linear-gradient(135deg,#a855f7,#7c3aed)';
    var icon = isPro ? 'fa-crown' : 'fa-sparkles';
    var label = isPro ? 'צור הדמיה PRO' : 'צור הדמיה';
    return '<button onclick="window._submitRender()" style="padding:10px 24px;border-radius:9px;border:none;background:' + bg + ';color:white;font-size:0.88rem;font-weight:700;font-family:inherit;cursor:pointer;display:flex;align-items:center;gap:8px;"><i class="fa-solid ' + icon + '"></i> ' + label + '</button>';
}

function _openLayoutPromptDialog(image, renderTier) {
    renderTier = renderTier || 'standard';
    var isPro = renderTier === 'pro';
    var existing = document.getElementById('ai-prompt-dialog');
    if (existing) existing.remove();

    var dlg = document.createElement('div');
    dlg.id = 'ai-prompt-dialog';
    dlg.style.cssText = 'position:fixed;inset:0;z-index:2000;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;padding:16px;';
    dlg.innerHTML =
        '<div style="background:#fff;border-radius:16px;width:100%;max-width:560px;max-height:90vh;overflow-y:auto;direction:rtl;box-shadow:0 8px 40px rgba(0,0,0,0.25);">' +
            '<div style="padding:20px 22px 0;display:flex;align-items:center;justify-content:space-between;">' +
                '<div style="font-size:1rem;font-weight:800;color:#1e3a5f;display:flex;align-items:center;gap:8px;"><i class="fa-solid fa-wand-magic-sparkles" style="color:#a855f7;"></i> הדמיה מסידור מרחבי' + (isPro ? ' <span class="ai-render-tier-badge">PRO</span>' : '') + '</div>' +
                '<button onclick="document.getElementById(\'ai-prompt-dialog\').remove()" style="background:none;border:none;cursor:pointer;color:#94a3b8;font-size:1.2rem;"><i class="fa-solid fa-xmark"></i></button>' +
            '</div>' +
            '<div style="padding:16px 22px 0;">' +
                '<div style="font-size:0.8rem;font-weight:700;color:#64748b;margin-bottom:8px;">תמונת ייחוס — הזווית הנוכחית</div>' +
                '<img src="' + image + '" style="width:100%;max-height:220px;object-fit:contain;border-radius:10px;border:2px solid #e2e8f0;background:#f8fafc;">' +
            '</div>' +
            '<div style="padding:14px 22px 0;">' +
                '<div style="font-size:0.8rem;font-weight:700;color:#64748b;margin-bottom:6px;">פרומפט</div>' +
                '<textarea id="ai-prompt-text" style="width:100%;height:200px;border:1.5px solid #e2e8f0;border-radius:10px;padding:12px;font-size:0.83rem;font-family:inherit;resize:vertical;outline:none;line-height:1.6;direction:rtl;text-align:right;" onfocus="this.style.borderColor=\'#a855f7\'" onblur="this.style.borderColor=\'#e2e8f0\'">' +
                    _buildAiRenderPrompt({ layoutMode: true }, { singleView: true }) +
                '</textarea>' +
            '</div>' +
            '<div style="padding:16px 22px 20px;display:flex;gap:10px;justify-content:flex-end;">' +
                '<button onclick="document.getElementById(\'ai-prompt-dialog\').remove()" style="padding:10px 20px;border-radius:9px;border:1.5px solid #e2e8f0;background:#f8fafc;color:#374151;font-size:0.88rem;font-weight:600;font-family:inherit;cursor:pointer;">ביטול</button>' +
                _aiDialogSubmitBtnHtml(isPro) +
            '</div>' +
        '</div>';

    dlg._imageFront = image;
    dlg._singleView = true;
    dlg._hexColor = null;
    dlg._cabinetSpec = { layoutMode: true };
    dlg._renderTier = renderTier;
    document.body.appendChild(dlg);
};

// ── Prompt dialog ─────────────────────────────────────────────────────────────
var _extraImages = []; // extra user-uploaded images

function _openPromptDialog(imageFront, image3dLeft, image3dRight, hexColor, cabinetSpec, renderTier) {
    renderTier = renderTier || 'standard';
    var isPro = renderTier === 'pro';
    var existing = document.getElementById('ai-prompt-dialog');
    if (existing) existing.remove();
    _extraImages = [];

    // Build default prompt for textarea
    var spec = cabinetSpec || {};
    var defaultPrompt = _buildAiRenderPrompt(spec, {
        singleView: false,
        hasRightImage: !!image3dRight,
        hexColor: hexColor
    });

    var dlg = document.createElement('div');
    dlg.id = 'ai-prompt-dialog';
    dlg.style.cssText = 'position:fixed;inset:0;z-index:2000;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;padding:16px;';
    dlg.innerHTML =
        '<div style="background:#fff;border-radius:16px;width:100%;max-width:640px;max-height:90vh;overflow-y:auto;direction:rtl;box-shadow:0 8px 40px rgba(0,0,0,0.25);">' +
            '<div style="padding:20px 22px 0;display:flex;align-items:center;justify-content:space-between;">' +
                '<div style="font-size:1rem;font-weight:800;color:#1e3a5f;display:flex;align-items:center;gap:8px;"><i class="fa-solid fa-wand-magic-sparkles" style="color:#a855f7;"></i> הגדרות הדמיה' + (isPro ? ' <span class="ai-render-tier-badge">PRO</span>' : '') + '</div>' +
                '<button onclick="document.getElementById(\'ai-prompt-dialog\').remove()" style="background:none;border:none;cursor:pointer;color:#94a3b8;font-size:1.2rem;"><i class="fa-solid fa-xmark"></i></button>' +
            '</div>' +
            // Images row
            '<div style="padding:16px 22px 0;">' +
                '<div style="font-size:0.8rem;font-weight:700;color:#64748b;margin-bottom:8px;">תמונות ייחוס <span style="font-weight:400;color:#94a3b8;">(ניתן לגרור/להוסיף נוספות)</span></div>' +
                '<div id="ai-prompt-images" style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-start;">' +
                    '<div style="position:relative;">' +
                        '<img src="'+imageFront+'" style="width:120px;height:90px;object-fit:cover;border-radius:8px;border:2px solid #e2e8f0;">' +
                        '<span style="position:absolute;bottom:4px;right:4px;background:rgba(0,0,0,0.55);color:white;font-size:0.65rem;padding:2px 6px;border-radius:4px;">חזית</span>' +
                    '</div>' +
                    '<div style="position:relative;">' +
                        '<img src="'+image3dLeft+'" style="width:120px;height:90px;object-fit:cover;border-radius:8px;border:2px solid #e2e8f0;">' +
                        '<span style="position:absolute;bottom:4px;right:4px;background:rgba(0,0,0,0.55);color:white;font-size:0.65rem;padding:2px 6px;border-radius:4px;">זווית שמאל</span>' +
                    '</div>' +
                    '<div style="position:relative;">' +
                        '<img src="'+image3dRight+'" style="width:120px;height:90px;object-fit:cover;border-radius:8px;border:2px solid #e2e8f0;">' +
                        '<span style="position:absolute;bottom:4px;right:4px;background:rgba(0,0,0,0.55);color:white;font-size:0.65rem;padding:2px 6px;border-radius:4px;">זווית ימין</span>' +
                    '</div>' +
                    '<label style="width:90px;height:90px;border:2px dashed #cbd5e1;border-radius:8px;display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:pointer;color:#94a3b8;font-size:0.72rem;gap:4px;transition:border-color 0.2s;" onmouseover="this.style.borderColor=\'#a855f7\'" onmouseout="this.style.borderColor=\'#cbd5e1\'">' +
                        '<i class="fa-solid fa-plus" style="font-size:1.2rem;"></i>הוסף תמונה' +
                        '<input type="file" accept="image/*" multiple style="display:none;" onchange="window._aiAddExtraImages(this)">' +
                    '</label>' +
                    '<div id="ai-extra-images-row" style="display:flex;gap:8px;flex-wrap:wrap;"></div>' +
                '</div>' +
            '</div>' +
            // Prompt textarea
            '<div style="padding:14px 22px 0;">' +
                '<div style="font-size:0.8rem;font-weight:700;color:#64748b;margin-bottom:6px;">פרומפט <span style="font-weight:400;color:#94a3b8;">(ניתן לערוך)</span></div>' +
                '<textarea id="ai-prompt-text" style="width:100%;height:220px;border:1.5px solid #e2e8f0;border-radius:10px;padding:12px;font-size:0.83rem;font-family:inherit;resize:vertical;outline:none;line-height:1.6;direction:rtl;text-align:right;" onfocus="this.style.borderColor=\'#a855f7\'" onblur="this.style.borderColor=\'#e2e8f0\'">' + defaultPrompt + '</textarea>' +
            '</div>' +
            // Actions
            '<div style="padding:16px 22px 20px;display:flex;gap:10px;justify-content:flex-end;">' +
                '<button onclick="document.getElementById(\'ai-prompt-dialog\').remove()" style="padding:10px 20px;border-radius:9px;border:1.5px solid #e2e8f0;background:#f8fafc;color:#374151;font-size:0.88rem;font-weight:600;font-family:inherit;cursor:pointer;">ביטול</button>' +
                _aiDialogSubmitBtnHtml(isPro) +
            '</div>' +
        '</div>';

    // Store data for submit
    dlg._imageFront   = imageFront;
    dlg._image3dLeft  = image3dLeft;
    dlg._image3dRight = image3dRight;
    dlg._hexColor     = hexColor;
    dlg._cabinetSpec  = cabinetSpec;
    dlg._renderTier   = renderTier;
    document.body.appendChild(dlg);
}

// Add extra user images
window._aiAddExtraImages = function(input) {
    var row = document.getElementById('ai-extra-images-row');
    Array.from(input.files).forEach(function(file) {
        var reader = new FileReader();
        reader.onload = function(e) {
            var b64 = e.target.result;
            _extraImages.push(b64);
            var idx = _extraImages.length - 1;
            var wrap = document.createElement('div');
            wrap.style.cssText = 'position:relative;';
            wrap.innerHTML = '<img src="'+b64+'" style="width:90px;height:90px;object-fit:cover;border-radius:8px;border:2px solid #e2e8f0;">' +
                '<button onclick="window._aiRemoveExtra('+idx+',this.parentNode)" style="position:absolute;top:-6px;left:-6px;width:20px;height:20px;border-radius:50%;background:#ef4444;border:none;color:white;font-size:0.7rem;cursor:pointer;display:flex;align-items:center;justify-content:center;"><i class="fa-solid fa-xmark"></i></button>';
            if (row) row.appendChild(wrap);
        };
        reader.readAsDataURL(file);
    });
    input.value = '';
};

window._aiRemoveExtra = function(idx, el) {
    _extraImages[idx] = null;
    if (el) el.remove();
};

// ── Submit render ─────────────────────────────────────────────────────────────
window._submitRender = async function() {
    var dlg = document.getElementById('ai-prompt-dialog');
    if (!dlg) return;

    var imageFront   = dlg._imageFront;
    var image3dLeft  = dlg._image3dLeft;
    var image3dRight = dlg._image3dRight;
    var singleView   = !!dlg._singleView;
    var hexColor     = dlg._hexColor;
    var cabinetSpec  = dlg._cabinetSpec;
    var renderTier   = dlg._renderTier || 'standard';
    var isPro        = renderTier === 'pro';
    var customPrompt = document.getElementById('ai-prompt-text').value.trim();
    var extras = _extraImages.filter(Boolean);

    if (singleView && !customPrompt) {
        if (typeof window._showToast === 'function') window._showToast('נא להזין פרומפט לפני יצירת ההדמיה', 2800);
        return;
    }

    dlg.remove();

    _setRenderButtonsDisabled(true);
    var waitMsg = isPro ? 'שולח ל-Nano Banana PRO... (45–90 שניות)' : 'שולח ל-AI... (15–30 שניות)';
    if (_panelOpen) {
        _showStatus('loading', '<i class="fa-solid fa-spinner fa-spin"></i> ' + waitMsg);
    } else if (typeof window._showToast === 'function') {
        window._showToast(waitMsg, isPro ? 5000 : 4000);
    }

    try {
        var sb = window._supabase;
        var { data: { session } } = await sb.auth.getSession();

        var res = await fetch(
            'https://meqxnsjycvfgfhdepguo.supabase.co/functions/v1/generate-render',
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + session.access_token,
                },
                body: JSON.stringify({
                    image_front:     imageFront,
                    image_3d:        singleView ? undefined : image3dLeft,
                    image_3d_right:  singleView ? undefined : image3dRight,
                    single_view:     singleView || undefined,
                    extra_images:    extras.length ? extras : undefined,
                    hex_color:     hexColor,
                    project_id:    window._currentProjectId || null,
                    preset_id:     (typeof state !== 'undefined') ? state.presetId : null,
                    cabinet_spec:  cabinetSpec,
                    custom_prompt: customPrompt || undefined,
                    model_tier:    renderTier,
                })
            }
        );

        var data = await res.json();

        if (!res.ok) {
            if (data.error === 'quota_exceeded') {
                var quotaMsg = 'הגעת למכסה החודשית של ' + data.limit + ' הדמיות';
                if (_panelOpen) _showStatus('error', quotaMsg);
                else if (typeof window._showToast === 'function') window._showToast(quotaMsg, 3500);
            } else if (data.error === 'ai_disabled') {
                var disabledMsg = 'פיצ\'ר ההדמיות אינו זמין עבור חשבונך';
                if (_panelOpen) _showStatus('error', disabledMsg);
                else if (typeof window._showToast === 'function') window._showToast(disabledMsg, 3500);
            } else {
                var errMsg = 'שגיאה: ' + (data.error || 'תקשורת עם השרת נכשלה');
                if (_panelOpen) _showStatus('error', errMsg);
                else if (typeof window._showToast === 'function') window._showToast(errMsg, 3500);
            }
            _setRenderButtonsDisabled(false);
            await _updateQuota();
            return;
        }

        if (_panelOpen) {
            _showStatus('success', '<i class="fa-solid fa-check"></i> ההדמיה נוצרה בהצלחה!');
            setTimeout(function() { _hideStatus(); }, 3000);
        } else if (typeof window._showToast === 'function') {
            window._showToast('ההדמיה נוצרה בהצלחה!', 3000);
        }

        _projectRenders.unshift({ id: data.id, image_url: data.image_url, created_at: data.created_at });
        _renderGrid();
        await _updateQuota();
        window._openAiLightbox(0);

    } catch(e) {
        console.error('[ai-renders] generate error:', e);
        if (_panelOpen) _showStatus('error', 'שגיאת תקשורת: ' + e.message);
        else if (typeof window._showToast === 'function') window._showToast('שגיאת תקשורת: ' + e.message, 3500);
    } finally {
        _setRenderButtonsDisabled(false);
        await _updateQuota();
    }
};

// ── Delete ─────────────────────────────────────────────────────────────────────
window._deleteCurrentRender = async function() {
    var r = _projectRenders[_lightboxIndex];
    if (!r || !r.id) return;
    if (!confirm('למחוק הדמיה זו לצמיתות מהשרת?')) return;
    var id = r.id;
    window._closeAiLightbox();
    try {
        var sessionRes = await _sbRenders.auth.getSession();
        var session = sessionRes.data && sessionRes.data.session;
        if (!session) throw new Error('לא מחובר');
        var res = await fetch(
            'https://meqxnsjycvfgfhdepguo.supabase.co/functions/v1/delete-render',
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + session.access_token,
                },
                body: JSON.stringify({ id: id }),
            }
        );
        var data = await res.json();
        if (!res.ok) throw new Error(data.error || 'מחיקה נכשלה');
        _projectRenders = _projectRenders.filter(function(x) { return x.id !== id; });
        _renderGrid();
        await _updateQuota();
    } catch (e) {
        console.error('[ai-renders] delete error:', e);
        if (typeof window._showToast === 'function') window._showToast('שגיאה במחיקה: ' + (e.message || e), 3500);
        else alert('שגיאה במחיקה: ' + (e.message || e));
        await _loadProjectRenders();
    }
};

// ── Lightbox ──────────────────────────────────────────────────────────────────
window._openAiLightbox = function(index) {
    _lightboxIndex = index;
    var r = _projectRenders[index];
    if (!r) return;
    var lb = document.getElementById('ai-lightbox');
    var img = document.getElementById('ai-lightbox-img');
    var date = document.getElementById('ai-lightbox-date');
    var dl = document.getElementById('ai-lightbox-download');
    if (img) img.src = r.image_url;
    if (date) date.textContent = new Date(r.created_at).toLocaleString('he-IL');
    if (dl) dl.href = r.image_url;
    if (lb) lb.classList.add('open');
    _updateLightboxNav();
};

window._closeAiLightbox = function() {
    var lb = document.getElementById('ai-lightbox');
    if (lb) lb.classList.remove('open');
};

window._lightboxNav = function(dir) {
    var next = _lightboxIndex + dir;
    if (next < 0 || next >= _projectRenders.length) return;
    window._openAiLightbox(next);
};

function _updateLightboxNav() {
    var prev = document.querySelector('.ai-lightbox-prev');
    var next = document.querySelector('.ai-lightbox-next');
    if (prev) prev.style.opacity = _lightboxIndex >= _projectRenders.length - 1 ? '0.3' : '1';
    if (next) next.style.opacity = _lightboxIndex <= 0 ? '0.3' : '1';
}

// ── Helpers ───────────────────────────────────────────────────────────────────
var _AI_MATERIAL_HE = {
    white_matte: 'לבן מט', white_gloss: 'לבן מבריק', black_matte: 'שחור מט',
    gray_light: 'אפור בהיר', gray_dark: 'אפור כהה', beige: 'בז\'',
    brown_light: 'חום בהיר', brown_dark: 'חום כהה', oak: 'אלון', walnut: 'אגוז', pine: 'אורן'
};

function _aiRoomContext(presetId) {
    if (presetId === 'bathroom') return 'חדר אמבטיה מודרני ונקי, עם כיור ומראה ברקע (לא מסתירים את הארון).';
    if (presetId === 'sliding' || presetId === 'walkin') return 'חדר הלבשה / חדר שינה גדול עם ארון בגדים מובנה לאורך הקיר.';
    if (presetId === 'corner-left' || presetId === 'corner-right') return 'פינת חדר שינה מעוצבת עם הארון בפינה.';
    return 'חדר שינה מעוצב ואיכותי, הארון צמוד לקיר האחורי.';
}

function _computeSideOpenCellViewDir(colIdx, columns, rowIdx) {
    // Mirrors engine-core.js openDir — from front-view / user perspective (שמאל = viewer's left)
    var col = columns[colIdx];
    if (!col) return null;
    var numCols = columns.length;
    var t = (typeof state !== 'undefined' && state.thickness) ? state.thickness : 1.7;
    var plinthH = (typeof state !== 'undefined' && state.plinthHeight) ? state.plinthHeight : 0;
    var baseY = (col.type === 'desk')
        ? (col.deskHeight || 80) + (col.deskClearance || 80)
        : plinthH;
    var bottomY = (rowIdx === 0)
        ? baseY + t
        : ((col.shelvesY && col.shelvesY[rowIdx - 1]) ? col.shelvesY[rowIdx - 1] : baseY) + t / 2;

    var leftNeighbor = colIdx > 0 ? columns[colIdx - 1] : null;
    var rightNeighbor = colIdx < numCols - 1 ? columns[colIdx + 1] : null;
    var opensLeft = colIdx === 0
        || (leftNeighbor && leftNeighbor.height <= bottomY + 0.5)
        || (leftNeighbor && (leftNeighbor.floorOffset || 0) > bottomY + 0.5);
    var opensRight = colIdx === numCols - 1
        || (rightNeighbor && rightNeighbor.height <= bottomY + 0.5)
        || (rightNeighbor && (rightNeighbor.floorOffset || 0) > bottomY + 0.5);

    if (opensLeft && opensRight) return colIdx < numCols / 2 ? 'left' : 'right';
    if (opensLeft) return 'left';
    if (opensRight) return 'right';
    return null;
}

function _aiOpenCellsNote(spec) {
    if (!spec || !spec.hasOpenCells) return '';
    var cnt = spec.openCellCount || 1;
    if (spec.hasSideOpenCells) {
        var dirMap = { left: 'שמאל', right: 'ימין', both: 'שני הצדדים' };
        var dirHe = spec.sideOpenDir ? (dirMap[spec.sideOpenDir] || '') : '';
        var sideDesc = dirHe
            ? ' הדופן הפתוחה בצד ' + dirHe + ' (מבט חזית — מהעמדה שלך, כפי שרואים את הארון).'
            : ' הדופן הצדדית פתוחה (מבט חזית).';
        return cnt === 1
            ? '- תא פתוח אחד ללא דלת — פתוח מהחזית ומהצד (ללא לוח צד).' + sideDesc
            : '- ' + cnt + ' תאים פתוחים ללא דלתות, חלקם פתוחים גם מהצד.' + sideDesc;
    }
    return cnt === 1
        ? '- תא פתוח אחד ללא דלת — הצג אותו פתוח לחלוטין.'
        : '- ' + cnt + ' תאים פתוחים ללא דלתות — הצג את כולם פתוחים.';
}

function _buildAiRenderPrompt(spec, opts) {
    opts = opts || {};
    spec = spec || {};
    var single = !!opts.singleView;
    var hasRight = !!opts.hasRightImage;
    var hexColor = opts.hexColor;

    var imagesIntro = single
        ? 'מצורפת תמונת ייחוס אחת מהזווית הנוכחית בתוכנת התכנון.'
        : hasRight
            ? 'מצורפות 3 תמונות ייחוס של אותו ארון (סדר חשוב):\n1) חזית ישרה — פרופורציות מדויקות\n2) זווית תלת-ממד משמאל\n3) זווית תלת-ממד מימין'
            : 'מצורפות 2 תמונות ייחוס:\n1) חזית ישרה\n2) זווית תלת-ממד';

    var dims = [
        spec.widthCm && ('רוחב ' + spec.widthCm + ' ס"מ'),
        spec.heightCm && ('גובה ' + spec.heightCm + ' ס"מ'),
        spec.depthCm && ('עומק ' + spec.depthCm + ' ס"מ')
    ].filter(Boolean).join(', ');

    var bodyKey = spec.materialBody || spec.materialExternal;
    var colorLine = hexColor
        ? ('צבע גוף/חזית דומיננטי: ' + hexColor + (bodyKey && _AI_MATERIAL_HE[bodyKey] ? ' (' + _AI_MATERIAL_HE[bodyKey] + ')' : '') + '.')
        : (bodyKey && _AI_MATERIAL_HE[bodyKey] ? ('גוון גוף: ' + _AI_MATERIAL_HE[bodyKey] + '.') : '');

    var specLines = [
        dims ? ('מידות חיצוניות: ' + dims + '.') : '',
        colorLine,
        spec.columns ? ('חלוקה: ' + spec.columns + ' עמודות אנכיות.') : '',
        spec.plinthHeightCm > 0 ? ('צוקל בגובה ' + spec.plinthHeightCm + ' ס"מ — שמור בדיוק.') : '',
        spec.hasDrawers ? 'כולל מגירות בחלק התחתון — שמור על מיקום ופרופורציה.' : '',
        spec.hasDoors === false ? 'ללא דלתות — כל התאים פתוחים מהחזית.' : '',
        spec.hasSideDesk ? 'כולל שולחן צד משולב — שמור על מיקומו ביחס לארון.' : '',
        spec.numSlidingDoors ? ('ארון הזזה עם ' + spec.numSlidingDoors + ' דלתות הזזה — שמור מסילות, פרופיל וחלוקת פנלים כבתמונות.') : '',
        _aiOpenCellsNote(spec)
    ].filter(Boolean);

    return imagesIntro + '\n\n' +
        'משימה: צור תמונה פוטוריאליסטית אחת (צילום אדריכלי פנים) של אותו ארון בדיוק, מותקן בסביבה אמיתית.\n\n' +
        'דיוק מוחלט (אל תסטה מהייחוס):\n' +
        '- שמור זהות מלאה של הארון: צורה, חלוקה, ידיות, צבעים, עומק וגובה.\n' +
        '- אל תוסיף דלתות לתאים פתוחים ואל תסגור תאים שפתוחים בייחוס.\n' +
        (specLines.length ? '\nמפרט:\n' + specLines.map(function(l) { return '- ' + l; }).join('\n') + '\n' : '\n') +
        '\nסביבה וצילום:\n' +
        '- ' + _aiRoomContext(spec.presetId) + '\n' +
        '- הארון צמוד לקיר, לא חוסם אותו ריהוט אחר.\n' +
        '- תאורה: אור יום רך מחלון בצד, צללים טבעיים, ללא פלאש קשה.\n' +
        '- זווית מצלמה: 3/4 קדמית קלה, גובה עיניים, תחושת עדשת 35mm.\n' +
        '- טקסטורות מלמינה/עץ מציאותיות, ללא מראה "רינדור מחשב" או פלסטיקי.';
}

function _getDominantColor() {
    try {
        if (typeof state === 'undefined') return null;
        var wing = typeof getWing === 'function' ? getWing() : null;
        if (!wing) return null;
        var mat = wing.materialBody || wing.materialExternal || null;
        if (!mat) return null;
        // Map material name to approximate hex (basic mapping)
        var colorMap = {
            'white_matte':'#F5F5F5', 'white_gloss':'#FFFFFF', 'black_matte':'#1a1a1a',
            'gray_light':'#D1D5DB', 'gray_dark':'#4B5563', 'beige':'#E8DCC8',
            'brown_light':'#C4A882', 'brown_dark':'#7C5C3E', 'oak':'#B8935A',
            'walnut':'#6B4C2A', 'pine':'#D4A86A'
        };
        return colorMap[mat] || null;
    } catch(e) { return null; }
}

function _getCabinetSpec() {
    try {
        if (typeof state === 'undefined') return null;
        var wing = typeof getWing === 'function' ? getWing() : null;

        // Detect open cells from compartments
        var hasOpenCells = false;
        var hasSideOpenCells = false;
        var openCellCount = 0;
        var sideOpenDir = null; // 'left', 'right', or 'both'
        if (wing && wing.columns) {
            wing.columns.forEach(function(col, colIdx) {
                if (col.compartments) {
                    col.compartments.forEach(function(comp, rowIdx) {
                        if (comp && comp.type === 'open_cell') {
                            hasOpenCells = true;
                            openCellCount++;
                        }
                        if (comp && comp.type === 'side_open_cell') {
                            hasOpenCells = true;
                            hasSideOpenCells = true;
                            openCellCount++;
                            var dir = _computeSideOpenCellViewDir(colIdx, wing.columns, rowIdx);
                            if (dir) {
                                if (!sideOpenDir) sideOpenDir = dir;
                                else if (sideOpenDir !== dir) sideOpenDir = 'both';
                            }
                        }
                    });
                }
            });
        }

        // Detect drawers
        var hasDrawers = false;
        if (wing && wing.columns) {
            wing.columns.forEach(function(col) {
                if (col.type === 'desk' || (col.compartments && col.compartments.some(function(c) { return c && c.type === 'drawer'; }))) {
                    hasDrawers = true;
                }
            });
        }

        var centerWing = (state.wings && state.wings.center) ? state.wings.center : null;
        var slidingDoor = (state.presetId === 'sliding' && centerWing && centerWing.slidingDoor && centerWing.slidingDoor.enabled)
            ? centerWing.slidingDoor : null;

        return {
            presetId:         state.presetId,
            cabinetModel:     state.cabinetModel || null,
            widthCm:          Math.round(state.globalWidth),
            heightCm:         Math.round(state.globalHeight),
            depthCm:          Math.round(state.globalDepth || 58),
            plinthHeightCm:   Math.round(state.plinthHeight || 0),
            material:         wing ? (wing.boardMaterial || state.boardMaterial) : state.boardMaterial,
            materialBody:     wing ? wing.materialBody : null,
            materialExternal: wing ? wing.materialExternal : null,
            hasDoors:         wing ? wing.hasDoors : true,
            hasOpenCells:     hasOpenCells,
            hasSideOpenCells: hasSideOpenCells,
            sideOpenDir:      sideOpenDir,
            openCellCount:    openCellCount,
            hasDrawers:       hasDrawers,
            columns:          wing ? wing.columns.length : null,
            hasSideDesk:      !!(state.desk && state.desk.side && state.desk.side !== 'none'),
            numSlidingDoors:  slidingDoor ? (slidingDoor.numDoors || 2) : null,
            slidingPanelType: slidingDoor ? (slidingDoor.doorPanelType || 'solid') : null,
        };
    } catch(e) { return null; }
}

function _showStatus(type, html) {
    var el = document.getElementById('ai-renders-status');
    if (!el) return;
    el.style.display = 'flex';
    el.className = 'ai-renders-status ai-renders-status--' + type;
    el.innerHTML = html;
}

function _hideStatus() {
    var el = document.getElementById('ai-renders-status');
    if (el) el.style.display = 'none';
}

// ── CSS ───────────────────────────────────────────────────────────────────────
function _injectStyles() {
    if (document.getElementById('ai-renders-styles')) return;
    var s = document.createElement('style');
    s.id = 'ai-renders-styles';
    s.textContent = `
        .ai-renders-panel {
            position: fixed; top: 0; left: 0; width: 320px; height: 100vh;
            background: #fff; z-index: 1100; display: flex; flex-direction: column;
            box-shadow: 4px 0 24px rgba(0,0,0,0.13); border-right: 1px solid #e2e8f0;
            transform: translateX(-100%); transition: transform 0.28s cubic-bezier(.4,0,.2,1);
            direction: rtl;
        }
        .ai-renders-panel.open { transform: translateX(0); }

        .ai-renders-panel-header {
            display: flex; align-items: center; justify-content: space-between;
            padding: 16px 18px; border-bottom: 1px solid #f1f5f9;
            background: linear-gradient(135deg,#faf5ff,#f3e8ff);
        }
        .ai-renders-quota-bar { padding: 12px 18px 8px; }
        .ai-renders-quota-track {
            height: 6px; background: #f1f5f9; border-radius: 99px; margin-top: 6px; overflow: hidden;
        }
        .ai-renders-quota-fill { height: 100%; border-radius: 99px; transition: width 0.4s, background 0.3s; }

        .ai-renders-generate-btns {
            display: flex; flex-direction: column; gap: 8px;
            margin: 8px 16px 12px;
        }
        .ai-renders-generate-btns .btn-generate-render { margin: 0; }

        .btn-generate-render {
            padding: 12px; border-radius: 10px; border: none; cursor: pointer;
            background: linear-gradient(135deg,#a855f7,#7c3aed); color: white;
            font-size: 0.92rem; font-weight: 700; font-family: inherit;
            display: flex; align-items: center; justify-content: center; gap: 8px;
            transition: opacity 0.2s, transform 0.15s;
        }
        .btn-generate-render-pro {
            background: linear-gradient(135deg,#f59e0b,#d97706);
            box-shadow: 0 2px 12px rgba(245,158,11,0.35);
        }
        .ai-render-tier-badge {
            font-size: 0.72rem; background: linear-gradient(135deg,#f59e0b,#d97706);
            color: white; padding: 2px 8px; border-radius: 6px; font-weight: 700;
        }
        .btn-generate-render:hover:not(:disabled) { opacity: 0.92; transform: translateY(-1px); }
        .btn-generate-render:disabled { opacity: 0.45; cursor: not-allowed; transform: none; }

        .ai-renders-status {
            margin: 0 16px 10px; padding: 10px 14px; border-radius: 8px;
            font-size: 0.83rem; font-weight: 600; display: flex; align-items: center; gap: 8px;
        }
        .ai-renders-status--loading { background: #f0f9ff; color: #0369a1; }
        .ai-renders-status--success { background: #f0fdf4; color: #166534; }
        .ai-renders-status--error   { background: #fef2f2; color: #dc2626; }

        .ai-renders-grid {
            flex: 1; overflow-y: auto; padding: 4px 12px 20px;
            display: grid; grid-template-columns: 1fr 1fr;
            column-gap: 10px; row-gap: 10px; align-content: start;
        }
        .ai-render-thumb {
            position: relative; border-radius: 10px; overflow: hidden;
            cursor: pointer; background: #f1f5f9;
            box-shadow: 0 2px 8px rgba(0,0,0,0.08);
            transition: transform 0.18s, box-shadow 0.18s;
        }
        .ai-render-thumb:hover { transform: translateY(-2px); box-shadow: 0 6px 18px rgba(0,0,0,0.14); }
        .ai-render-thumb img { width: 100%; height: auto; display: block; }
        .ai-render-thumb-overlay {
            position: absolute; bottom: 0; left: 0; right: 0;
            background: linear-gradient(transparent, rgba(0,0,0,0.55));
            padding: 6px 8px 5px; color: white; font-size: 0.72rem;
        }

        /* Lightbox */
        .ai-lightbox {
            position: fixed; inset: 0; z-index: 9999; background: rgba(0,0,0,0.88);
            display: none; align-items: center; justify-content: center;
        }
        .ai-lightbox.open { display: flex; }
        .ai-lightbox-inner {
            position: relative; max-width: 90vw; max-height: 90vh;
            display: flex; flex-direction: column; align-items: center; gap: 12px;
        }
        .ai-lightbox-inner img {
            max-width: 90vw; max-height: 80vh; border-radius: 12px;
            object-fit: contain; box-shadow: 0 8px 40px rgba(0,0,0,0.5);
        }
        .ai-lightbox-close {
            position: absolute; top: -14px; right: -14px; width: 34px; height: 34px;
            border-radius: 50%; background: white; border: none; cursor: pointer;
            font-size: 1rem; color: #374151; box-shadow: 0 2px 8px rgba(0,0,0,0.3);
            display: flex; align-items: center; justify-content: center;
        }
        .ai-lightbox-nav {
            position: absolute; top: 50%; transform: translateY(-50%);
            width: 38px; height: 38px; border-radius: 50%; background: rgba(255,255,255,0.15);
            border: none; cursor: pointer; color: white; font-size: 1rem;
            display: flex; align-items: center; justify-content: center;
            transition: background 0.2s, opacity 0.2s;
        }
        .ai-lightbox-nav:hover { background: rgba(255,255,255,0.28); }
        .ai-lightbox-prev { right: calc(100% + 12px); }
        .ai-lightbox-next { left:  calc(100% + 12px); }
        .ai-lightbox-footer {
            display: flex; align-items: center; gap: 18px;
            background: rgba(255,255,255,0.07); border-radius: 8px; padding: 8px 16px;
        }

        /* Toolbar button */
        #btn-ai-render {
            background: linear-gradient(135deg,#faf5ff,#f3e8ff) !important;
            color: #7c3aed !important; border: 1.5px solid #ddd6fe !important;
            display: flex; align-items: center; gap: 5px;
        }
        #btn-ai-render:hover { background: linear-gradient(135deg,#f3e8ff,#ede9fe) !important; }
    `;
    document.head.appendChild(s);
}

// expose for projects page use
window._aiRendersLoaded = true;

})();