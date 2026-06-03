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

    // Debug button (small, hidden by default — toggle with window._toggleCameraDebug())
    var dbgBtn = document.createElement('button');
    dbgBtn.id = 'btn-camera-debug';
    dbgBtn.className = 'view-btn icon-btn';
    dbgBtn.title = 'Camera Debug';
    dbgBtn.innerHTML = '<i class="fa-solid fa-crosshairs" style="font-size:0.8rem;"></i>';
    dbgBtn.style.cssText = 'opacity:0.4;font-size:0.75rem;';
    dbgBtn.onclick = window._toggleCameraDebug;
    toolbar.appendChild(dbgBtn);
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
        <button id="btn-generate-render" class="btn-generate-render" onclick="window._generateRender()">
            <i class="fa-solid fa-sparkles"></i> צור הדמיה חדשה
        </button>
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
                <button onclick="window._deleteRender(_projectRenders[_lightboxIndex]?.id)"
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
    var { data: count } = await _sbRenders.rpc('get_ai_renders_count_this_month', { p_user_id: _currentUserId });
    var used = count ?? 0;
    var limit = 50;
    var pct = Math.min(100, Math.round(used / limit * 100));

    var text = document.getElementById('ai-renders-quota-text');
    var fill = document.getElementById('ai-renders-quota-fill');
    if (text) text.textContent = 'השתמשת ב-' + used + ' מתוך ' + limit + ' הדמיות החודש';
    if (fill) { fill.style.width = pct + '%'; fill.style.background = pct >= 90 ? '#ef4444' : pct >= 70 ? '#f59e0b' : '#a855f7'; }

    var btn = document.getElementById('btn-generate-render');
    if (btn) { btn.disabled = used >= limit; btn.title = used >= limit ? 'הגעת למכסה החודשית' : 'צור הדמיה חדשה'; }
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
window._generateRender = async function() {
    var btn = document.getElementById('btn-generate-render');
    if (!btn || btn.disabled) return;
    if (!window.renderer) { _showStatus('error', 'לא נמצא renderer'); return; }

    _showStatus('loading', '<i class="fa-solid fa-spinner fa-spin"></i> מצלם חזית...');
    btn.disabled = true;

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
    catch(e) { _showStatus('error', 'שגיאה בצילום חזית'); btn.disabled = false; return; }

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
    btn.disabled = false;

    _openPromptDialog(imageFront, image3dLeft, image3dRight, _getDominantColor(), _getCabinetSpec());
};

// ── Prompt dialog ─────────────────────────────────────────────────────────────
var _extraImages = []; // extra user-uploaded images

function _openPromptDialog(imageFront, image3dLeft, image3dRight, hexColor, cabinetSpec) {
    var existing = document.getElementById('ai-prompt-dialog');
    if (existing) existing.remove();
    _extraImages = [];

    // Build default prompt description for textarea
    var spec = cabinetSpec || {};
    var dims = [spec.widthCm && 'רוחב '+spec.widthCm+' ס"מ', spec.heightCm && 'גובה '+spec.heightCm+' ס"מ', spec.depthCm && 'עומק '+spec.depthCm+' ס"מ'].filter(Boolean).join(', ');
    var openNote = '';
    if (spec.hasOpenCells) {
        openNote = '\n- חשוב: לארון ' + (spec.openCellCount||'') + ' תאים פתוחים ללא דלתות — יש להציג אותם פתוחים.';
        if (spec.hasSideOpenCells) openNote += '\n- חלק מהתאים הם כוורת צד — הדופן הצדדית פתוחה ואין לוח סוגר מהצד.';
    }
    var defaultPrompt = 'צור הדמיה פוטוריאליסטית של ארון זה מותקן בחדר שינה מעוצב מול קיר.' +
        '\nשמור על צבעים, פרופורציות ופרטי עיצוב מדויקים משלוש תמונות הייחוס (חזית, זווית שמאל, זווית ימין).' +
        (dims ? '\nמידות: ' + dims + '.' : '') +
        (hexColor ? '\nצבע: ' + hexColor + '.' : '') +
        openNote +
        '\nחדר מודרני ואיכותי, תאורה טבעית וחמה מחלון.';

    var dlg = document.createElement('div');
    dlg.id = 'ai-prompt-dialog';
    dlg.style.cssText = 'position:fixed;inset:0;z-index:2000;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;padding:16px;';
    dlg.innerHTML =
        '<div style="background:#fff;border-radius:16px;width:100%;max-width:640px;max-height:90vh;overflow-y:auto;direction:rtl;box-shadow:0 8px 40px rgba(0,0,0,0.25);">' +
            '<div style="padding:20px 22px 0;display:flex;align-items:center;justify-content:space-between;">' +
                '<div style="font-size:1rem;font-weight:800;color:#1e3a5f;display:flex;align-items:center;gap:8px;"><i class="fa-solid fa-wand-magic-sparkles" style="color:#a855f7;"></i> הגדרות הדמיה</div>' +
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
                '<textarea id="ai-prompt-text" style="width:100%;height:160px;border:1.5px solid #e2e8f0;border-radius:10px;padding:12px;font-size:0.83rem;font-family:inherit;resize:vertical;outline:none;line-height:1.6;direction:ltr;text-align:left;" onfocus="this.style.borderColor=\'#a855f7\'" onblur="this.style.borderColor=\'#e2e8f0\'">' + defaultPrompt + '</textarea>' +
            '</div>' +
            // Actions
            '<div style="padding:16px 22px 20px;display:flex;gap:10px;justify-content:flex-end;">' +
                '<button onclick="document.getElementById(\'ai-prompt-dialog\').remove()" style="padding:10px 20px;border-radius:9px;border:1.5px solid #e2e8f0;background:#f8fafc;color:#374151;font-size:0.88rem;font-weight:600;font-family:inherit;cursor:pointer;">ביטול</button>' +
                '<button onclick="window._submitRender()" style="padding:10px 24px;border-radius:9px;border:none;background:linear-gradient(135deg,#a855f7,#7c3aed);color:white;font-size:0.88rem;font-weight:700;font-family:inherit;cursor:pointer;display:flex;align-items:center;gap:8px;"><i class="fa-solid fa-sparkles"></i> צור הדמיה</button>' +
            '</div>' +
        '</div>';

    // Store data for submit
    dlg._imageFront   = imageFront;
    dlg._image3dLeft  = image3dLeft;
    dlg._image3dRight = image3dRight;
    dlg._hexColor     = hexColor;
    dlg._cabinetSpec  = cabinetSpec;
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
    var hexColor     = dlg._hexColor;
    var cabinetSpec  = dlg._cabinetSpec;
    var customPrompt = document.getElementById('ai-prompt-text').value.trim();
    var extras = _extraImages.filter(Boolean);

    dlg.remove();

    var btn = document.getElementById('btn-generate-render');
    if (btn) btn.disabled = true;
    _showStatus('loading', '<i class="fa-solid fa-spinner fa-spin"></i> שולח ל-AI... (15-30 שניות)');

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
                    image_3d:        image3dLeft,
                    image_3d_right:  image3dRight,
                    extra_images:    extras.length ? extras : undefined,
                    hex_color:     hexColor,
                    project_id:    window._currentProjectId || null,
                    preset_id:     (typeof state !== 'undefined') ? state.presetId : null,
                    cabinet_spec:  cabinetSpec,
                    custom_prompt: customPrompt || undefined,
                })
            }
        );

        var data = await res.json();

        if (!res.ok) {
            if (data.error === 'quota_exceeded') {
                _showStatus('error', 'הגעת למכסה החודשית של ' + data.limit + ' הדמיות');
            } else if (data.error === 'ai_disabled') {
                _showStatus('error', 'פיצ\'ר ההדמיות אינו זמין עבור חשבונך');
            } else {
                _showStatus('error', 'שגיאה: ' + (data.error || 'תקשורת עם השרת נכשלה'));
            }
            if (btn) btn.disabled = false;
            return;
        }

        _showStatus('success', '<i class="fa-solid fa-check"></i> ההדמיה נוצרה בהצלחה!');
        setTimeout(function() { _hideStatus(); }, 3000);

        _projectRenders.unshift({ id: data.id, image_url: data.image_url, created_at: data.created_at });
        _renderGrid();
        await _updateQuota();
        window._openAiLightbox(0);

    } catch(e) {
        console.error('[ai-renders] generate error:', e);
        _showStatus('error', 'שגיאת תקשורת: ' + e.message);
    } finally {
        if (btn) btn.disabled = false;
    }
};

// ── Delete ─────────────────────────────────────────────────────────────────────
window._deleteRender = async function(id) {
    if (!id) return;
    if (!confirm('למחוק הדמיה זו?')) return;
    window._closeAiLightbox();
    var { error } = await _sbRenders.from('ai_renders').delete().eq('id', id);
    if (!error) {
        _projectRenders = _projectRenders.filter(function(r) { return r.id !== id; });
        _renderGrid();
        await _updateQuota();
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
        if (wing && wing.columns) {
            wing.columns.forEach(function(col) {
                if (col.compartments) {
                    col.compartments.forEach(function(comp) {
                        if (comp && comp.type === 'open_cell') {
                            hasOpenCells = true;
                            openCellCount++;
                        }
                        if (comp && comp.type === 'side_open_cell') {
                            hasOpenCells = true;
                            hasSideOpenCells = true;
                            openCellCount++;
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

        return {
            presetId:         state.presetId,
            widthCm:          Math.round(state.globalWidth),
            heightCm:         Math.round(state.globalHeight),
            depthCm:          Math.round(state.globalDepth || 58),
            material:         wing ? (wing.boardMaterial || state.boardMaterial) : state.boardMaterial,
            materialBody:     wing ? wing.materialBody : null,
            hasDoors:         wing ? wing.hasDoors : true,
            hasOpenCells:     hasOpenCells,
            hasSideOpenCells: hasSideOpenCells,
            openCellCount:    openCellCount,
            hasDrawers:       hasDrawers,
            columns:          wing ? wing.columns.length : null,
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

        .btn-generate-render {
            margin: 8px 16px 12px; padding: 12px; border-radius: 10px; border: none; cursor: pointer;
            background: linear-gradient(135deg,#a855f7,#7c3aed); color: white;
            font-size: 0.92rem; font-weight: 700; font-family: inherit;
            display: flex; align-items: center; justify-content: center; gap: 8px;
            transition: opacity 0.2s, transform 0.15s;
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
            display: grid; grid-template-columns: 1fr 1fr; gap: 10px;
        }
        .ai-render-thumb {
            position: relative; border-radius: 10px; overflow: hidden;
            aspect-ratio: 4/3; cursor: pointer; background: #f1f5f9;
            box-shadow: 0 2px 8px rgba(0,0,0,0.08);
            transition: transform 0.18s, box-shadow 0.18s;
        }
        .ai-render-thumb:hover { transform: translateY(-2px); box-shadow: 0 6px 18px rgba(0,0,0,0.14); }
        .ai-render-thumb img { width: 100%; height: 100%; object-fit: cover; }
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

// ── Camera debug overlay ──────────────────────────────────────────────────────
window._toggleCameraDebug = function() {
    var existing = document.getElementById('camera-debug-overlay');
    if (existing) { existing.remove(); return; }

    var el = document.createElement('div');
    el.id = 'camera-debug-overlay';
    el.style.cssText = 'position:fixed;bottom:80px;left:16px;z-index:9999;background:rgba(0,0,0,0.82);color:#00ff88;font-family:monospace;font-size:0.78rem;padding:10px 14px;border-radius:10px;line-height:1.8;pointer-events:none;min-width:220px;';
    el.innerHTML = 'Camera debug...';
    document.body.appendChild(el);

    function _update() {
        if (!document.getElementById('camera-debug-overlay')) return;
        if (window.camera) {
            var p = window.camera.position;
            var t = window.controls ? window.controls.target : {x:0,y:0,z:0};
            el.innerHTML =
                '<b style="color:#fff;">📷 Camera</b><br>' +
                'pos.x: <b>' + Math.round(p.x) + '</b><br>' +
                'pos.y: <b>' + Math.round(p.y) + '</b><br>' +
                'pos.z: <b>' + Math.round(p.z) + '</b><br>' +
                '<b style="color:#fff;">🎯 Target</b><br>' +
                'tgt.x: <b>' + Math.round(t.x) + '</b><br>' +
                'tgt.y: <b>' + Math.round(t.y) + '</b><br>' +
                'tgt.z: <b>' + Math.round(t.z) + '</b><br>' +
                '<span style="color:#94a3b8;">viewMode: ' + (typeof state !== 'undefined' ? state.viewMode : '?') + '</span>';
        }
        requestAnimationFrame(_update);
    }
    _update();
};

// expose for projects page use
window._aiRendersLoaded = true;

})();
