// ==========================================
// viewer-extras.js — Client viewer enhancements
// Features: approval, compare, color send, summary,
// view modes, LIVE focus, pins, voice notes, order status
// ==========================================
(function () {
'use strict';

var STATUS_LABELS = {
    quote: 'הצעת מחיר',
    ordered: 'נסגרה עסקה',
    production: 'נשלח לייצור',
    service: 'קריאת שירות',
    installed: 'התקנה הושלמה'
};

var _approvals = {};          // { cabIdx: true }
var _pinMode = false;
var _pinMarkers = [];         // THREE objects
var _compareMode = false;
var _compareIdx = { a: -1, b: -1 };
var _compareRoot = null;
var _savedCabinetGroupVisible = true;
var _voiceRecorder = null;
var _voiceChunks = [];
var _voiceRecording = false;
var _voiceStartTs = 0;
var _raycaster = null;
var _pointer = null;

function api() { return window._viewerApi || null; }

function toast(msg, ms) {
    var el = document.getElementById('viewer-extras-toast');
    if (!el) {
        el = document.createElement('div');
        el.id = 'viewer-extras-toast';
        el.style.cssText = 'position:fixed;bottom:160px;left:50%;transform:translateX(-50%);z-index:100050;background:rgba(30,40,60,0.94);color:#fff;padding:10px 18px;border-radius:12px;font-size:0.88rem;font-weight:600;pointer-events:none;opacity:0;transition:opacity .25s;max-width:90vw;text-align:center;';
        document.body.appendChild(el);
    }
    el.textContent = msg;
    el.style.opacity = '1';
    clearTimeout(el._t);
    el._t = setTimeout(function () { el.style.opacity = '0'; }, ms || 2800);
}

function parsePayload(msg) {
    if (!msg || typeof msg !== 'string') return null;
    var t = msg.trim();
    if (t.charAt(0) !== '{') return null;
    try { return JSON.parse(t); } catch (e) { return null; }
}

async function insertMessage(messageType, message, cabIdx) {
    var a = api();
    if (!a || !a.getSb() || !a.getToken() || !a.getProjectId()) return { error: 'no-api' };
    var payload = {
        project_id: a.getProjectId(),
        share_token: a.getToken(),
        sender_role: 'client',
        sender_name: a.getClientName(),
        message: message,
        message_type: messageType
    };
    if (a.cabIndexColExists() !== false && typeof cabIdx === 'number') {
        payload.cabinet_index = cabIdx;
    }
    var res = await a.getSb().from('project_messages').insert(payload).select('id').single();
    if (res.error && res.error.code === '42703') {
        a.setCabIndexColExists(false);
        delete payload.cabinet_index;
        res = await a.getSb().from('project_messages').insert(payload).select('id').single();
    }
    return res;
}

function esc(s) { return (api() && api().escHtml) ? api().escHtml(s) : String(s || ''); }

// ── 12. Order status badge ───────────────────────────────────────────────────
function updateStatusBadge() {
    var el = document.getElementById('viewer-order-status-badge');
    if (!el) return;
    var key = window._viewerOrderStatus || 'quote';
    el.textContent = STATUS_LABELS[key] || key;
    el.dataset.status = key;
    el.style.display = 'inline-flex';
}

// ── 9. LIVE designer focus banner ────────────────────────────────────────────
function updateLiveFocusBanner(cabIdx, projectData) {
    var banner = document.getElementById('viewer-designer-focus');
    if (!banner) return;
    var a = api();
    if (!a || !a.isLiveMode()) {
        banner.classList.remove('visible', 'flash');
        return;
    }
    var list = a.getCabinetList() || [];
    var idx = (typeof cabIdx === 'number') ? cabIdx : a.getActiveCabIdx();
    if (projectData && typeof a.resolveLiveCabIndex === 'function') {
        idx = a.resolveLiveCabIndex(projectData);
    }
    var label = (list[idx] && list[idx].label) || ('ארון ' + (idx + 1));
    banner.innerHTML = '<i class="fa-solid fa-eye"></i> המעצב מסתכל עכשיו על: <strong>' + esc(label) + '</strong>';
    banner.classList.add('visible');
    banner.classList.remove('flash');
    void banner.offsetWidth;
    banner.classList.add('flash');
}

// ── 1. Approvals ─────────────────────────────────────────────────────────────
async function loadApprovalsFromMessages() {
    var a = api();
    if (!a || !a.getSb() || !a.getToken()) return;
    try {
        var res = await a.getSb().from('project_messages')
            .select('cabinet_index, message_type, message')
            .eq('share_token', a.getToken())
            .eq('message_type', 'cabinet_approval')
            .order('created_at', { ascending: false })
            .limit(100);
        _approvals = {};
        var seen = {};
        (res.data || []).forEach(function (row) {
            var idx = row.cabinet_index;
            if (idx == null) {
                var p = parsePayload(row.message);
                if (p && typeof p.cabinetIndex === 'number') idx = p.cabinetIndex;
            }
            if (typeof idx !== 'number' || seen[idx]) return;
            seen[idx] = true;
            var p2 = parsePayload(row.message);
            if (!p2 || p2.approved !== false) _approvals[idx] = true;
            else delete _approvals[idx];
        });
        if (a.renderCabinetNav) a.renderCabinetNav();
    } catch (e) {
        console.warn('[viewer-extras] load approvals', e);
    }
}

async function toggleApproval(cabIdx) {
    var a = api();
    if (!a) return;
    var list = a.getCabinetList() || [];
    var cab = list[cabIdx];
    var label = cab ? cab.label : ('ארון ' + (cabIdx + 1));
    var next = !_approvals[cabIdx];
    _approvals[cabIdx] = next;
    if (a.renderCabinetNav) a.renderCabinetNav();
    var payload = JSON.stringify({
        type: 'approval',
        approved: next,
        cabinetIndex: cabIdx,
        cabLabel: label
    });
    var res = await insertMessage('cabinet_approval', payload, cabIdx);
    if (res.error) {
        _approvals[cabIdx] = !next;
        if (a.renderCabinetNav) a.renderCabinetNav();
        toast('שגיאה בשמירת האישור');
        return;
    }
    toast(next ? 'סומן כבחירה מועדפת ✓' : 'האישור בוטל');
    if (a.appendNote) {
        a.appendNote({
            sender_role: 'client',
            sender_name: a.getClientName(),
            message: payload,
            created_at: new Date().toISOString(),
            cabinet_index: cabIdx,
            message_type: 'cabinet_approval'
        });
    }
}

// ── 3. Color tryouts → designer ──────────────────────────────────────────────
async function sendColorTryoutsToDesigner() {
    var a = api();
    if (!a) return;
    var idx = a.getActiveCabIdx();
    var overrides = (a.getColorOverrides() || {})[idx] || {};
    var keys = Object.keys(overrides);
    if (!keys.length) {
        toast('אין ניסיונות צבע לשליחה — שנה צבע קודם');
        return;
    }
    var names = a.materialNames || {};
    var fieldLabels = { body: 'גוף', doors: 'חזיתות', internal: 'פנים' };
    var list = a.getCabinetList() || [];
    var label = (list[idx] && list[idx].label) || ('ארון ' + (idx + 1));
    var lines = ['🎨 ניסוי צבעים לאישור — ' + label];
    keys.forEach(function (f) {
        lines.push((fieldLabels[f] || f) + ': ' + (names[overrides[f]] || overrides[f]));
    });
    var msg = lines.join('\n');
    var res = await insertMessage('color_change', msg, idx);
    if (res.error) { toast('שגיאה בשליחה'); return; }
    toast('ניסוי הצבעים נשלח למעצב');
    if (a.appendNote) {
        a.appendNote({
            sender_role: 'client',
            sender_name: a.getClientName(),
            message: msg,
            created_at: new Date().toISOString(),
            cabinet_index: idx,
            message_type: 'color_change'
        });
    }
}

// ── 4. Order summary ─────────────────────────────────────────────────────────
function openSummary() {
    var a = api();
    if (!a) return;
    var panel = document.getElementById('viewer-summary-panel');
    if (!panel) return;
    var list = a.getCabinetList() || [];
    var pd = a.getProjectData() || {};
    var cart = pd.orderCart || pd.cart || [];
    var statusKey = window._viewerOrderStatus || pd.orderStatus || 'quote';
    var cust = (pd.customer || (typeof state !== 'undefined' && state.customer) || {});
    var showPrice = window._showPricing === true;

    var html = '';
    html += '<div class="vs-status" data-status="' + esc(statusKey) + '"><i class="fa-solid fa-clipboard-list"></i> סטטוס: <strong>' + esc(STATUS_LABELS[statusKey] || statusKey) + '</strong></div>';
    if (cust.name || cust.phone || cust.address) {
        html += '<div class="vs-cust">';
        if (cust.name) html += '<div><i class="fa-regular fa-user"></i> ' + esc(cust.name) + '</div>';
        if (cust.phone) html += '<div><i class="fa-solid fa-phone"></i> ' + esc(cust.phone) + '</div>';
        if (cust.address) html += '<div><i class="fa-solid fa-map-location-dot"></i> ' + esc(cust.address) + '</div>';
        html += '</div>';
    }
    html += '<div class="vs-cabs">';
    list.forEach(function (cab, i) {
        var item = cart[i] && cart[i].spec ? cart[i].spec : {};
        var approved = !!_approvals[i];
        html += '<div class="vs-cab' + (approved ? ' approved' : '') + '">';
        html += '<div class="vs-cab-title">' + (approved ? '❤️ ' : '') + esc(cab.label) + '</div>';
        if (cab.dims && (cab.dims.w || cab.dims.h || cab.dims.d)) {
            html += '<div class="vs-cab-dims">' + cab.dims.w + '×' + cab.dims.h + '×' + cab.dims.d + ' ס"מ</div>';
        }
        var mats = [];
        if (cab.materialBody) mats.push('גוף: ' + ((a.materialNames && a.materialNames[cab.materialBody]) || cab.materialBody));
        if (cab.materialDoors) mats.push('חזית: ' + ((a.materialNames && a.materialNames[cab.materialDoors]) || cab.materialDoors));
        if (mats.length) html += '<div class="vs-cab-mats">' + esc(mats.join(' · ')) + '</div>';
        if (showPrice && item.price) html += '<div class="vs-cab-price">' + esc(item.price) + '</div>';
        html += '</div>';
    });
    html += '</div>';
    var body = document.getElementById('viewer-summary-body');
    if (body) body.innerHTML = html;
    panel.style.display = 'flex';
    document.body.classList.add('summary-open');
}

function closeSummary() {
    var panel = document.getElementById('viewer-summary-panel');
    if (panel) panel.style.display = 'none';
    document.body.classList.remove('summary-open');
}

// ── 6. Doors mode ────────────────────────────────────────────────────────────
window._viewerExtrasApplyDoorsMode = function (mode) {
    var wantVisible = mode !== 'doors-open'; // open interior => hide door meshes
    if (typeof window._doorsVisible === 'undefined') return;
    if (window._doorsVisible !== wantVisible && typeof window._toggleDoors === 'function') {
        window._toggleDoors();
    } else if (window.doorMeshes || (typeof doorMeshes !== 'undefined')) {
        var meshes = window.doorMeshes || (typeof doorMeshes !== 'undefined' ? doorMeshes : []);
        if (meshes && meshes.forEach) {
            window._doorsVisible = wantVisible;
            meshes.forEach(function (m) { m.visible = wantVisible; });
        }
    }
};

// ── 2. Compare mode ──────────────────────────────────────────────────────────
function openComparePicker() {
    var a = api();
    if (!a) return;
    var list = a.getCabinetList() || [];
    if (list.length < 2) {
        toast('צריך לפחות 2 ארונות להשוואה');
        return;
    }
    var sheet = document.getElementById('viewer-compare-sheet');
    if (!sheet) return;
    var wrap = document.getElementById('viewer-compare-options');
    wrap.innerHTML = '';
    list.forEach(function (cab, i) {
        var row = document.createElement('label');
        row.className = 'vc-opt';
        row.innerHTML = '<input type="checkbox" value="' + i + '"> <span>' + esc(cab.label) + '</span>';
        wrap.appendChild(row);
    });
    sheet.classList.add('open');
}

function closeComparePicker() {
    var sheet = document.getElementById('viewer-compare-sheet');
    if (sheet) sheet.classList.remove('open');
}

function startCompareFromPicker() {
    var wrap = document.getElementById('viewer-compare-options');
    if (!wrap) return;
    var checked = Array.prototype.slice.call(wrap.querySelectorAll('input:checked')).map(function (el) {
        return parseInt(el.value, 10);
    });
    if (checked.length !== 2) {
        toast('יש לבחור בדיוק 2 ארונות');
        return;
    }
    closeComparePicker();
    enterCompare(checked[0], checked[1]);
}

function _loadCabWingsIntoState(cabIdx) {
    var a = api();
    var pd = a.getProjectData() || {};
    var cart = pd.orderCart || pd.cart || [];
    var item = cart[cabIdx];
    var list = a.getCabinetList() || [];
    var cab = list[cabIdx];
    if (item && item.rawState && item.rawState.wings) {
        var rs = item.rawState;
        try {
            state.wings.center = JSON.parse(JSON.stringify(rs.wings.center || state.wings.center));
            state.wings.left = rs.wings.left ? JSON.parse(JSON.stringify(rs.wings.left)) : null;
            state.wings.right = rs.wings.right ? JSON.parse(JSON.stringify(rs.wings.right)) : null;
        } catch (e) {
            state.wings.center = rs.wings.center || state.wings.center;
            state.wings.left = rs.wings.left || null;
            state.wings.right = rs.wings.right || null;
        }
        state.activeWing = rs.activeWing || 'center';
        state.presetId = rs.presetId || 'linear';
        if (rs.materialBody) state.materialBody = rs.materialBody;
        if (rs.materialDoors) state.materialDoors = rs.materialDoors;
        return true;
    }
    if (cab && cab.wings) {
        state.wings.center = cab.wings.center || state.wings.center;
        state.wings.left = cab.wings.left || null;
        state.wings.right = cab.wings.right || null;
        state.presetId = cab.presetId || 'linear';
        return true;
    }
    return false;
}

function enterCompare(idxA, idxB) {
    var a = api();
    if (!a || typeof THREE === 'undefined' || !window.cabinetGroup) {
        // Fallback: A/B toggle bar
        _compareMode = true;
        _compareIdx = { a: idxA, b: idxB };
        showCompareBar(idxA, idxB);
        a.switchCabinet(idxA);
        toast('מצב השוואה — החלף בין ארונות בסרגל');
        return;
    }
    _compareMode = true;
    _compareIdx = { a: idxA, b: idxB };

    // Hide normal group, build two side groups
    if (_compareRoot && _compareRoot.parent) _compareRoot.parent.remove(_compareRoot);
    _compareRoot = new THREE.Group();
    _compareRoot.name = 'viewerCompareRoot';

    var groupA = new THREE.Group();
    var groupB = new THREE.Group();
    _loadCabWingsIntoState(idxA);
    if (typeof window.buildCabinetIntoGroup === 'function') window.buildCabinetIntoGroup(groupA);
    _loadCabWingsIntoState(idxB);
    if (typeof window.buildCabinetIntoGroup === 'function') window.buildCabinetIntoGroup(groupB);

    var wA = (state.wings && state.wings.center && state.wings.center.width) || 160;
    // estimate widths from cart
    var list = a.getCabinetList() || [];
    var wa = (list[idxA] && list[idxA].dims && list[idxA].dims.w) || wA || 160;
    var wb = (list[idxB] && list[idxB].dims && list[idxB].dims.w) || 160;
    var gap = 40;
    groupA.position.x = -(wa / 2 + gap / 2);
    groupB.position.x = (wb / 2 + gap / 2);
    _compareRoot.add(groupA);
    _compareRoot.add(groupB);

    _savedCabinetGroupVisible = window.cabinetGroup.visible !== false;
    window.cabinetGroup.visible = false;
    if (window.scene) window.scene.add(_compareRoot);

    state.viewMode = '3d';
    if (typeof updateCameraView === 'function') updateCameraView();
    showCompareBar(idxA, idxB);
    a.setLiveMode(false);
    if (a.updateLiveBadge) a.updateLiveBadge();
    toast('השוואה זה-לצד-זה');
}

function showCompareBar(idxA, idxB) {
    var bar = document.getElementById('viewer-compare-bar');
    if (!bar) return;
    var list = (api() && api().getCabinetList()) || [];
    var la = (list[idxA] && list[idxA].label) || ('ארון ' + (idxA + 1));
    var lb = (list[idxB] && list[idxB].label) || ('ארון ' + (idxB + 1));
    document.getElementById('viewer-compare-label-a').textContent = la;
    document.getElementById('viewer-compare-label-b').textContent = lb;
    bar.style.display = 'flex';
}

function exitCompare() {
    _compareMode = false;
    var bar = document.getElementById('viewer-compare-bar');
    if (bar) bar.style.display = 'none';
    if (_compareRoot) {
        if (_compareRoot.parent) _compareRoot.parent.remove(_compareRoot);
        _compareRoot = null;
    }
    if (window.cabinetGroup) window.cabinetGroup.visible = _savedCabinetGroupVisible;
    var a = api();
    if (a) {
        a.switchCabinet(a.getActiveCabIdx());
        if (typeof buildCabinet === 'function') buildCabinet();
    }
}

function compareShow(side) {
    var a = api();
    if (!a) return;
    var idx = side === 'b' ? _compareIdx.b : _compareIdx.a;
    if (_compareRoot) {
        // keep dual view — just flash label
        toast(side === 'b' ? 'מימין' : 'משמאל');
        return;
    }
    a.switchCabinet(idx);
}

// ── 10. Pin annotations ──────────────────────────────────────────────────────
function setPinMode(on) {
    _pinMode = !!on;
    var btn = document.getElementById('btn-viewer-pin');
    if (btn) btn.classList.toggle('active', _pinMode);
    document.body.classList.toggle('viewer-pin-mode', _pinMode);
    toast(_pinMode ? 'לחץ על הארון כדי לסמן נקודה' : 'מצב סימון בוטל');
}

function clearPinMarkers() {
    _pinMarkers.forEach(function (m) {
        if (m.parent) m.parent.remove(m);
    });
    _pinMarkers = [];
}

function addPinMarker(x, y, z, color) {
    if (typeof THREE === 'undefined' || !window.scene) return null;
    var geo = new THREE.SphereGeometry(3.2, 12, 12);
    var mat = new THREE.MeshBasicMaterial({ color: color || 0xef4444 });
    var mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.userData.viewerPin = true;
    window.scene.add(mesh);
    _pinMarkers.push(mesh);
    return mesh;
}

async function loadPinsForCabinet(cabIdx) {
    clearPinMarkers();
    var a = api();
    if (!a || !a.getSb() || !a.getToken()) return;
    try {
        var res = await a.getSb().from('project_messages')
            .select('message, cabinet_index, message_type')
            .eq('share_token', a.getToken())
            .eq('message_type', 'pin_note')
            .limit(80);
        (res.data || []).forEach(function (row) {
            var p = parsePayload(row.message);
            if (!p || p.type !== 'pin') return;
            var idx = row.cabinet_index;
            if (idx == null) idx = p.cabinetIndex;
            if (idx !== cabIdx) return;
            if (typeof p.x === 'number') addPinMarker(p.x, p.y, p.z);
        });
    } catch (e) { /* ignore */ }
}

function onCanvasPointerDown(e) {
    if (!_pinMode) return;
    if (typeof THREE === 'undefined' || !window.camera || !window.scene) return;
    var canvas = document.getElementById('canvas-container');
    if (!canvas) return;
    var rect = (window.renderer && window.renderer.domElement)
        ? window.renderer.domElement.getBoundingClientRect()
        : canvas.getBoundingClientRect();
    if (!_raycaster) _raycaster = new THREE.Raycaster();
    if (!_pointer) _pointer = new THREE.Vector2();
    _pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    _pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    _raycaster.setFromCamera(_pointer, window.camera);
    var targets = [];
    if (window.cabinetGroup) targets.push(window.cabinetGroup);
    if (_compareRoot) targets.push(_compareRoot);
    if (!targets.length) targets.push(window.scene);
    var hits = _raycaster.intersectObjects(targets, true);
    if (!hits.length) {
        toast('לא נמצאה נקודה על הארון');
        return;
    }
    var pt = hits[0].point;
    openPinDialog(pt.x, pt.y, pt.z);
}

function openPinDialog(x, y, z) {
    var modal = document.getElementById('viewer-pin-modal');
    if (!modal) return;
    modal.dataset.x = x;
    modal.dataset.y = y;
    modal.dataset.z = z;
    var inp = document.getElementById('viewer-pin-text');
    if (inp) inp.value = '';
    modal.style.display = 'flex';
    setTimeout(function () { if (inp) inp.focus(); }, 100);
}

function closePinDialog() {
    var modal = document.getElementById('viewer-pin-modal');
    if (modal) modal.style.display = 'none';
}

async function submitPinNote() {
    var modal = document.getElementById('viewer-pin-modal');
    var inp = document.getElementById('viewer-pin-text');
    if (!modal || !inp) return;
    var text = inp.value.trim();
    if (!text) { toast('כתוב הערה לסימון'); return; }
    var a = api();
    var idx = a.getActiveCabIdx();
    var list = a.getCabinetList() || [];
    var label = (list[idx] && list[idx].label) || ('ארון ' + (idx + 1));
    var x = parseFloat(modal.dataset.x);
    var y = parseFloat(modal.dataset.y);
    var z = parseFloat(modal.dataset.z);
    var payload = JSON.stringify({
        type: 'pin',
        x: x, y: y, z: z,
        text: text,
        cabinetIndex: idx,
        cabLabel: label
    });
    addPinMarker(x, y, z);
    closePinDialog();
    setPinMode(false);
    var res = await insertMessage('pin_note', payload, idx);
    if (res.error) { toast('שגיאה בשמירת הסימון'); return; }
    toast('הסימון נשלח למעצב');
    if (a.appendNote) {
        a.appendNote({
            id: res.data && res.data.id ? res.data.id : undefined,
            sender_role: 'client',
            sender_name: a.getClientName(),
            message: payload,
            created_at: new Date().toISOString(),
            cabinet_index: idx,
            message_type: 'pin_note'
        });
    }
}

// ── 11. Voice notes ──────────────────────────────────────────────────────────
async function toggleVoiceRecord() {
    var btn = document.getElementById('viewer-voice-btn');
    if (_voiceRecording) {
        stopVoiceRecord();
        return;
    }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        toast('הדפדפן לא תומך בהקלטת קול');
        return;
    }
    try {
        var stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        _voiceChunks = [];
        _voiceRecorder = new MediaRecorder(stream);
        _voiceRecorder.ondataavailable = function (ev) {
            if (ev.data && ev.data.size) _voiceChunks.push(ev.data);
        };
        _voiceRecorder.onstop = function () {
            stream.getTracks().forEach(function (t) { t.stop(); });
            var blob = new Blob(_voiceChunks, { type: _voiceRecorder.mimeType || 'audio/webm' });
            var dur = Math.round((Date.now() - _voiceStartTs) / 1000);
            sendVoiceBlob(blob, dur);
        };
        _voiceRecorder.start();
        _voiceRecording = true;
        _voiceStartTs = Date.now();
        if (btn) btn.classList.add('recording');
        toast('מקליט... לחץ שוב לסיום (עד 20 שנ׳)');
        setTimeout(function () {
            if (_voiceRecording) stopVoiceRecord();
        }, 20000);
    } catch (e) {
        toast('לא ניתן לגשת למיקרופון');
    }
}

function stopVoiceRecord() {
    if (!_voiceRecorder || !_voiceRecording) return;
    _voiceRecording = false;
    var btn = document.getElementById('viewer-voice-btn');
    if (btn) btn.classList.remove('recording');
    try { _voiceRecorder.stop(); } catch (e) {}
}

function sendVoiceBlob(blob, durationSec) {
    if (blob.size > 900000) {
        toast('ההקלטה ארוכה מדי');
        return;
    }
    var reader = new FileReader();
    reader.onload = async function () {
        var a = api();
        var idx = a.getNotesCabIdx ? a.getNotesCabIdx() : a.getActiveCabIdx();
        var payload = JSON.stringify({
            type: 'voice',
            mime: blob.type || 'audio/webm',
            dataUrl: reader.result,
            duration: durationSec || 0,
            cabinetIndex: idx
        });
        var res = await insertMessage('voice_note', payload, idx);
        if (res.error) { toast('שגיאה בשליחת הקול'); return; }
        toast('הקלטה נשלחה למעצב');
        if (a.appendNote) {
            a.appendNote({
                sender_role: 'client',
                sender_name: a.getClientName(),
                message: payload,
                created_at: new Date().toISOString(),
                cabinet_index: idx,
                message_type: 'voice_note'
            });
        }
    };
    reader.readAsDataURL(blob);
}

// ── Note bubble rendering (client notes panel) ───────────────────────────────
window._viewerExtrasRenderNoteBubble = function (note, list) {
    var type = note.message_type || 'note';
    var payload = parsePayload(note.message);
    var isClient = note.sender_role === 'client';
    var time = note.created_at
        ? new Date(note.created_at).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })
        : '';
    var senderLabel = isClient ? (note.sender_name || 'אתה') : 'מעצב';
    var wrap = document.createElement('div');
    wrap.className = 'viewer-note-wrap ' + (isClient ? 'client' : 'designer');

    var inner = '';
    if (type === 'cabinet_approval' || (payload && payload.type === 'approval')) {
        var ok = !payload || payload.approved !== false;
        inner = '<div class="viewer-note-bubble special approval">' +
            (ok ? '❤️ אישור בחירת ארון' : 'בוטל אישור ארון') +
            (payload && payload.cabLabel ? (' — ' + esc(payload.cabLabel)) : '') +
            '</div>';
    } else if (type === 'pin_note' || (payload && payload.type === 'pin')) {
        var canDelete = !!(note.id && note.sender_role === 'client');
        var delBtn = canDelete
            ? ('<button type="button" class="viewer-pin-delete-btn" data-pin-id="' + esc(String(note.id)) + '" ' +
                'title="מחק סימון" style="position:absolute;top:6px;left:6px;width:26px;height:26px;border:none;border-radius:8px;' +
                'background:rgba(239,68,68,0.12);color:#dc2626;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;font-size:0.75rem;">' +
                '<i class="fa-solid fa-trash"></i></button>')
            : '';
        inner = '<div class="viewer-note-bubble special pin" style="position:relative;' + (canDelete ? 'padding-left:34px;' : '') + '">' +
            delBtn +
            '<i class="fa-solid fa-location-dot"></i> סימון על הארון<br>' +
            esc(payload && payload.text ? payload.text : note.message) + '</div>';
    } else if (type === 'voice_note' || (payload && payload.type === 'voice')) {
        var src = payload && payload.dataUrl ? payload.dataUrl : '';
        inner = '<div class="viewer-note-bubble special voice"><i class="fa-solid fa-microphone"></i> הודעה קולית' +
            (payload && payload.duration ? (' (' + payload.duration + ' שנ׳)') : '') +
            (src ? ('<audio controls src="' + src + '" style="width:100%;margin-top:8px;"></audio>') : '') +
            '</div>';
    } else if (type === 'color_change') {
        inner = '<div class="viewer-note-bubble special color">' + esc(note.message).replace(/\n/g, '<br>') + '</div>';
    } else {
        return false;
    }
    wrap.innerHTML = inner + '<div class="viewer-note-meta">' + esc(senderLabel) + (time ? (' · ' + time) : '') + '</div>';
    if (note.id) wrap.dataset.noteId = String(note.id);
    var delBtnEl = wrap.querySelector('.viewer-pin-delete-btn');
    if (delBtnEl) {
        delBtnEl.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            deletePinNote(delBtnEl.getAttribute('data-pin-id'), wrap);
        });
    }
    list.appendChild(wrap);
    return true;
};

async function deletePinNote(noteId, wrapEl) {
    if (!noteId) return;
    if (!confirm('למחוק את הסימון מהארון?')) return;
    var a = api();
    if (!a || !a.getSb()) {
        toast('אין חיבור');
        return;
    }
    try {
        var res = await a.getSb().from('project_messages')
            .delete()
            .eq('id', noteId)
            .eq('share_token', a.getToken())
            .eq('message_type', 'pin_note');
        if (res.error) {
            console.error('[viewer] delete pin', res.error);
            toast('שגיאה במחיקת הסימון');
            return;
        }
        if (wrapEl && wrapEl.parentNode) wrapEl.parentNode.removeChild(wrapEl);
        loadPinsForCabinet(a.getActiveCabIdx());
        toast('הסימון נמחק');
    } catch (e) {
        console.error('[viewer] delete pin exception', e);
        toast('שגיאה במחיקת הסימון');
    }
}

window._viewerExtrasOnNoteDeleted = function (oldRow) {
    if (!oldRow || !oldRow.id) return;
    var list = document.getElementById('viewer-notes-list');
    if (list) {
        var wrap = list.querySelector('.viewer-note-wrap[data-note-id="' + oldRow.id + '"]');
        if (wrap && wrap.parentNode) wrap.parentNode.removeChild(wrap);
    }
    if (oldRow.message_type === 'pin_note' || (oldRow.message && String(oldRow.message).indexOf('"type":"pin"') !== -1)) {
        var a = api();
        if (a) loadPinsForCabinet(a.getActiveCabIdx());
    }
};

// ── Card decoration (approval heart) ─────────────────────────────────────────
window._viewerExtrasDecorateCard = function (card, idx) {
    var foot = card.querySelector('.viewer-cab-footer');
    if (!foot) return;
    var btn = document.createElement('button');
    btn.className = 'viewer-cab-approve-btn' + (_approvals[idx] ? ' active' : '');
    btn.title = _approvals[idx] ? 'בטל אישור' : 'אני רוצה את הארון הזה';
    btn.innerHTML = _approvals[idx] ? '<i class="fa-solid fa-heart"></i>' : '<i class="fa-regular fa-heart"></i>';
    btn.onclick = function (e) {
        e.stopPropagation();
        toggleApproval(idx);
    };
    foot.insertBefore(btn, foot.firstChild);
};

window._viewerExtrasAfterNavRender = function () { /* reserved */ };

window._viewerExtrasOnCabinetSwitch = function (idx) {
    loadPinsForCabinet(idx);
    updateLiveFocusBanner(idx, api() && api().getProjectData());
};

window._viewerExtrasOnLiveFollow = function (idx, projectData) {
    updateLiveFocusBanner(idx, projectData);
    updateStatusBadge();
};

window._viewerExtrasOnProjectUpdate = function (projectData, row) {
    if (row && row.order_status) window._viewerOrderStatus = row.order_status;
    updateStatusBadge();
    if (api() && api().isLiveMode()) {
        updateLiveFocusBanner(api().getActiveCabIdx(), projectData);
    }
};

window._viewerExtrasOnReady = function () {
    updateStatusBadge();
    loadApprovalsFromMessages();
    loadPinsForCabinet(api() ? api().getActiveCabIdx() : 0);
    updateLiveFocusBanner(api() ? api().getActiveCabIdx() : 0, api() && api().getProjectData());
};

// ── Wire UI ──────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', function () {
    var canvas = document.getElementById('canvas-container');
    if (canvas) {
        canvas.addEventListener('pointerdown', function (e) {
            if (!_pinMode) return;
            // ignore UI clicks
            if (e.target.closest && e.target.closest('button,a,input,textarea')) return;
            onCanvasPointerDown(e);
        }, true);
    }
});

// Public button handlers
window._viewerOpenSummary = openSummary;
window._viewerCloseSummary = closeSummary;
window._viewerOpenCompare = openComparePicker;
window._viewerCloseCompare = closeComparePicker;
window._viewerStartCompare = startCompareFromPicker;
window._viewerExitCompare = exitCompare;
window._viewerCompareShow = compareShow;
window._viewerTogglePinMode = function () { setPinMode(!_pinMode); };
window._viewerClosePinModal = closePinDialog;
window._viewerSubmitPin = submitPinNote;
window._viewerToggleVoice = toggleVoiceRecord;
window._viewerSendColorTryouts = sendColorTryoutsToDesigner;
window._viewerToggleApprovalActive = function () {
    var a = api();
    if (a) toggleApproval(a.getActiveCabIdx());
};

})();
