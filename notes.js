// ── Share Live Link ───────────────────────────────────────────────────────────

window._shareLiveLink = async function() {
    var modal = document.getElementById('share-live-modal');
    if (!modal) return;

    // Must have a project open
    if (!window._currentProjectId) {
        if (typeof _showToast === 'function') {
            _showToast('יש לשמור את הפרויקט קודם כדי לשתף', 4000);
        } else {
            alert('יש לשמור את הפרויקט קודם כדי לשתף');
        }
        return;
    }

    // Open modal immediately, show loading state
    modal.style.display = 'flex';
    var urlInput = document.getElementById('share-url-input');
    var copyBtn  = document.getElementById('btn-copy-share-url');
    var waBtn    = document.getElementById('btn-whatsapp-share');
    if (urlInput) urlInput.value = 'שומר ומייצר קישור...';
    if (copyBtn)  copyBtn.disabled = true;
    if (waBtn)    waBtn.disabled   = true;

    try {
        // Save current state first so client sees latest version
        if (typeof window._saveProjectNow === 'function') {
            await window._saveProjectNow();
        }

        // Generate / retrieve share token
        var result = await Projects.generateShareToken(window._currentProjectId);
        if (result && result.error) throw new Error(result.error);

        var token  = result.token;
        var base   = window.location.href.replace(/\/[^/]*$/, '/');
        var url    = base + 'viewer.html?token=' + token;

        window._currentShareToken = token;
        window._currentShareUrl   = url;

        if (urlInput) urlInput.value = url;
        if (copyBtn)  copyBtn.disabled = false;
        if (waBtn)    waBtn.disabled   = false;

        // Start notes listener so designer sees client notes in real-time
        if (typeof window._startDesignerNotesListener === 'function') {
            window._startDesignerNotesListener(token);
        }
        // Show notes float button
        var floatBtn = document.getElementById('designer-notes-float-btn');
        if (floatBtn) floatBtn.style.display = 'flex';
        var notesBtn = document.getElementById('btn-designer-notes');
        if (notesBtn) notesBtn.style.display = 'flex';

    } catch(e) {
        console.error('[share] error:', e);
        if (urlInput) urlInput.value = 'שגיאה בייצור הקישור';
        if (typeof _showToast === 'function') _showToast('שגיאה בייצור קישור השיתוף: ' + e.message, 5000);
    }
};

window._copyShareUrl = function() {
    var url = window._currentShareUrl;
    if (!url) {
        var input = document.getElementById('share-url-input');
        if (input) url = input.value;
    }
    if (!url || url.includes('שומר') || url.includes('שגיאה')) return;

    navigator.clipboard.writeText(url).then(function() {
        var btn = document.getElementById('btn-copy-share-url');
        if (btn) {
            var orig = btn.innerHTML;
            btn.innerHTML = '<i class="fa-solid fa-check"></i> הועתק!';
            btn.style.background = '#f0fdf4';
            btn.style.borderColor = '#bbf7d0';
            btn.style.color = '#065f46';
            setTimeout(function() {
                btn.innerHTML = orig;
                btn.style.background = '';
                btn.style.borderColor = '';
                btn.style.color = '';
            }, 2000);
        }
    }).catch(function() {
        // fallback for older browsers
        var input = document.getElementById('share-url-input');
        if (input) { input.select(); document.execCommand('copy'); }
    });
};

window._shareViaWhatsApp = function() {
    var url = window._currentShareUrl;
    if (!url) return;
    var projName = window._currentProjectName || 'הפרויקט שלך';
    var msg = 'היי! שלחתי לך קישור לצפייה בעיצוב הארון עבור ' + projName + ':\n' + url;
    window.open('https://wa.me/?text=' + encodeURIComponent(msg), '_blank');
};

window._revokeShareLink = async function() {
    if (!window._currentProjectId) return;
    if (!confirm('לבטל את הקישור? הלקוח לא יוכל לצפות יותר.')) return;

    try {
        var result = await Projects.revokeShareToken(window._currentProjectId);
        if (result && result.error) throw new Error(result.error);

        window._currentShareToken = null;
        window._currentShareUrl   = null;

        var modal = document.getElementById('share-live-modal');
        if (modal) modal.style.display = 'none';

        // Hide notes buttons
        var floatBtn = document.getElementById('designer-notes-float-btn');
        if (floatBtn) floatBtn.style.display = 'none';
        var notesBtn = document.getElementById('btn-designer-notes');
        if (notesBtn) notesBtn.style.display = 'none';

        if (typeof window._stopDesignerNotesListener === 'function') {
            window._stopDesignerNotesListener();
        }
        if (typeof window._closeDesignerNotes === 'function') {
            window._closeDesignerNotes();
        }

        if (typeof _showToast === 'function') _showToast('הקישור בוטל ✓', 3000);
    } catch(e) {
        console.error('[revoke] error:', e);
        if (typeof _showToast === 'function') _showToast('שגיאה בביטול הקישור: ' + e.message, 4000);
    }
};

// ── Designer Notes (bidirectional chat with client) ─────────────────────────

var _dnToken = null;
var _dnChannel = null;
var _dnPollTimer = null;
var _dnMessages = [];
var _dnActiveCabIdx = 0;
var _dnPanelOpen = false;
var _dnUnreadPerCab = {};
var _dnTotalUnread = 0;
var _dnCabIndexColExists = null;
var _dnDesignerName = null;
var _dnKnownIds = {};
var _dnCabIdxLocked = false;
var _dnPinMarkers = []; // THREE meshes on scene
var _dnPendingPinFocus = null; // {x,y,z} after jump-to-cabinet

function _dnEsc(str) {
    return String(str || '')
        .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
        .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function _dnGetSb() {
    return window._supabase || null;
}

function _dnGetCabLabel(idx) {
    var cart = (typeof state !== 'undefined' && state.orderCart) ? state.orderCart : [];
    var item = cart[idx];
    if (!item) return 'ארון ' + (idx + 1);
    var custom = (item.spec && item.spec.customName) || item.customName;
    return custom ? custom : ('ארון ' + (idx + 1));
}

function _dnGetCabCount() {
    var cart = (typeof state !== 'undefined' && state.orderCart) ? state.orderCart : [];
    return Math.max(cart.length, 1);
}

async function _dnLoadDesignerName() {
    if (_dnDesignerName) return _dnDesignerName;
    try {
        if (typeof Auth !== 'undefined' && Auth.getProfile) {
            var profile = await Auth.getProfile();
            if (profile && profile.full_name) {
                _dnDesignerName = profile.full_name;
                return _dnDesignerName;
            }
        }
    } catch(e) {}
    _dnDesignerName = 'מעצב';
    return _dnDesignerName;
}

function _dnCabIdxFromRow(row) {
    if (row.cabinet_index !== null && row.cabinet_index !== undefined) {
        return Number(row.cabinet_index);
    }
    return 0;
}

function _dnRecomputeUnread() {
    _dnUnreadPerCab = {};
    _dnTotalUnread = 0;
    _dnMessages.forEach(function(row) {
        if (row.sender_role === 'client' && !row.is_read) {
            var idx = _dnCabIdxFromRow(row);
            _dnUnreadPerCab[idx] = (_dnUnreadPerCab[idx] || 0) + 1;
            _dnTotalUnread++;
        }
    });
}

async function _dnFetchAllMessages() {
    var sb = _dnGetSb();
    if (!sb || !_dnToken) return [];
    try {
        var result = await sb
            .from('project_messages')
            .select('*')
            .eq('share_token', _dnToken)
            .order('created_at', { ascending: true })
            .limit(500);
        if (result.error) {
            console.error('[designer-notes] load error:', result.error);
            return _dnMessages;
        }
        _dnMessages = result.data || [];
        _dnKnownIds = {};
        _dnMessages.forEach(function(row) { if (row.id) _dnKnownIds[row.id] = true; });
        _dnRecomputeUnread();
        return _dnMessages;
    } catch(e) {
        console.error('[designer-notes] load exception:', e);
        return _dnMessages;
    }
}

function _dnFilterMessagesForCab(cabIdx) {
    return _dnMessages.filter(function(row) {
        return _dnCabIdxFromRow(row) === Number(cabIdx);
    });
}

function _dnAppendBubble(note, container) {
    if (!container) return;
    var isClient = note.sender_role === 'client';
    var time = note.created_at
        ? new Date(note.created_at).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })
        : '';
    var senderLabel = isClient ? (note.sender_name || 'לקוח') : (_dnDesignerName || 'מעצב');

    var wrap = document.createElement('div');
    wrap.className = 'designer-note-wrap ' + (isClient ? 'client' : 'designer');

    var type = note.message_type || 'note';
    var payload = null;
    if (note.message && String(note.message).trim().charAt(0) === '{') {
        try { payload = JSON.parse(note.message); } catch (e) { payload = null; }
    }

    var bubbleHtml = '';
    if (type === 'cabinet_approval' || (payload && payload.type === 'approval')) {
        var ok = !payload || payload.approved !== false;
        bubbleHtml =
            '<div class="designer-note-bubble special approval ' + (isClient ? 'client' : 'designer') + '">' +
                (ok ? '❤️ אישור בחירת ארון' : 'בוטל אישור ארון') +
                (payload && payload.cabLabel ? (' — ' + _dnEsc(payload.cabLabel)) : '') +
            '</div>';
    } else if (type === 'pin_note' || (payload && payload.type === 'pin')) {
        var pinText = _dnEsc(payload && payload.text ? payload.text : note.message);
        var px = payload && typeof payload.x === 'number' ? payload.x : '';
        var py = payload && typeof payload.y === 'number' ? payload.y : '';
        var pz = payload && typeof payload.z === 'number' ? payload.z : '';
        var delBtn = note.id
            ? ('<button type="button" class="designer-pin-delete-btn" data-pin-id="' + _dnEsc(String(note.id)) + '" ' +
                'title="מחק סימון" style="position:absolute;top:6px;left:6px;width:26px;height:26px;border:none;border-radius:8px;' +
                'background:rgba(239,68,68,0.12);color:#dc2626;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;font-size:0.75rem;">' +
                '<i class="fa-solid fa-trash"></i></button>')
            : '';
        bubbleHtml =
            '<div class="designer-note-bubble special pin ' + (isClient ? 'client' : 'designer') + '" ' +
                'data-pin-x="' + px + '" data-pin-y="' + py + '" data-pin-z="' + pz + '" ' +
                'style="cursor:pointer;position:relative;padding-left:34px;" title="לחץ כדי להציג את הסימון על הארון">' +
                delBtn +
                '<i class="fa-solid fa-location-dot"></i> סימון על הארון<br>' +
                pinText +
                '<div style="margin-top:6px;font-size:0.72rem;opacity:0.75;">לחץ להצגה על הארון ↗</div>' +
            '</div>';
    } else if (type === 'voice_note' || (payload && payload.type === 'voice')) {
        var src = payload && payload.dataUrl ? payload.dataUrl : '';
        bubbleHtml =
            '<div class="designer-note-bubble special voice ' + (isClient ? 'client' : 'designer') + '">' +
                '<i class="fa-solid fa-microphone"></i> הודעה קולית' +
                (payload && payload.duration ? (' (' + payload.duration + ' שנ׳)') : '') +
                (src ? ('<audio controls src="' + src + '" style="width:100%;margin-top:8px;max-width:240px;"></audio>') : '') +
            '</div>';
    } else if (type === 'color_change') {
        bubbleHtml =
            '<div class="designer-note-bubble special color ' + (isClient ? 'client' : 'designer') + '">' +
                _dnEsc(note.message).replace(/\n/g, '<br>') +
            '</div>';
    } else {
        bubbleHtml =
            '<div class="designer-note-bubble ' + (isClient ? 'client' : 'designer') + '">' +
                _dnEsc(note.message) +
            '</div>';
    }

    wrap.innerHTML =
        bubbleHtml +
        '<div class="designer-note-meta">' + _dnEsc(senderLabel) + (time ? (' · ' + time) : '') + '</div>';

    // Click pin note → show markers + focus camera on that point
    if (type === 'pin_note' || (payload && payload.type === 'pin')) {
        var delEl = wrap.querySelector('.designer-pin-delete-btn');
        if (delEl) {
            delEl.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                var pid = delEl.getAttribute('data-pin-id');
                if (pid) window._dnDeletePinNote(pid, wrap);
            });
        }
        wrap.addEventListener('click', function() {
            var bubble = wrap.querySelector('[data-pin-x]');
            if (!bubble) return;
            var x = parseFloat(bubble.getAttribute('data-pin-x'));
            var y = parseFloat(bubble.getAttribute('data-pin-y'));
            var z = parseFloat(bubble.getAttribute('data-pin-z'));
            if (!isFinite(x) || !isFinite(y) || !isFinite(z)) {
                if (typeof _showToast === 'function') _showToast('לסימון זה אין מיקום תלת־ממדי', 3000);
                return;
            }
            _dnShowPinsAndFocus(x, y, z);
        });
    }

    container.appendChild(wrap);
}

/** Remove a pin note from DB + UI + 3D markers (designer). */
window._dnDeletePinNote = async function(noteId, wrapEl) {
    if (!noteId) return;
    if (!confirm('למחוק את הסימון מהארון ומהתיקונים?')) return;
    var sb = _dnGetSb();
    if (!sb) {
        if (typeof _showToast === 'function') _showToast('אין חיבור למסד הנתונים', 3000);
        return;
    }
    try {
        var result = await sb.from('project_messages').delete().eq('id', noteId);
        if (result.error) {
            console.error('[designer-notes] delete pin error:', result.error);
            if (typeof _showToast === 'function') _showToast('שגיאה במחיקת הסימון', 3500);
            return;
        }
        _dnRemoveMessageLocally(noteId);
        if (wrapEl && wrapEl.parentNode) wrapEl.parentNode.removeChild(wrapEl);
        window._dnRefreshClientPins();
        if (typeof _showToast === 'function') _showToast('הסימון נמחק', 2200);
    } catch (e) {
        console.error('[designer-notes] delete pin exception:', e);
        if (typeof _showToast === 'function') _showToast('שגיאה במחיקת הסימון', 3500);
    }
};

function _dnRemoveMessageLocally(noteId) {
    if (!noteId) return;
    var wasUnread = false;
    var cabIdx = null;
    _dnMessages = _dnMessages.filter(function(row) {
        if (String(row.id) !== String(noteId)) return true;
        if (row.sender_role === 'client' && !row.is_read) {
            wasUnread = true;
            cabIdx = _dnCabIdxFromRow(row);
        }
        return false;
    });
    if (_dnKnownIds[noteId]) delete _dnKnownIds[noteId];
    if (wasUnread && cabIdx !== null) {
        _dnUnreadPerCab[cabIdx] = Math.max(0, (_dnUnreadPerCab[cabIdx] || 0) - 1);
        _dnTotalUnread = Math.max(0, _dnTotalUnread - 1);
        _dnUpdateAllBadges();
    }
}

function _dnOnDeletedMessage(oldRow) {
    if (!oldRow || !oldRow.id) return;
    if (!_dnKnownIds[oldRow.id] && !_dnMessages.some(function(r) { return String(r.id) === String(oldRow.id); })) {
        return;
    }
    _dnRemoveMessageLocally(oldRow.id);
    if (_dnPanelOpen) {
        var body = document.getElementById('designer-notes-body');
        if (body) {
            var btn = body.querySelector('.designer-pin-delete-btn[data-pin-id="' + oldRow.id + '"]');
            if (btn) {
                var wrap = btn.closest('.designer-note-wrap');
                if (wrap && wrap.parentNode) wrap.parentNode.removeChild(wrap);
            }
        }
        _dnRenderCabTabs();
    }
    if (_dnParsePinPayload(oldRow)) {
        window._dnRefreshClientPins();
    }
}

function _dnClearPinMarkers() {
    _dnPinMarkers.forEach(function(m) {
        if (m && m.parent) m.parent.remove(m);
        if (m && m.geometry) m.geometry.dispose();
        if (m && m.material) m.material.dispose();
    });
    _dnPinMarkers = [];
}

function _dnAddPinMarker(x, y, z, highlight) {
    if (typeof THREE === 'undefined' || !window.scene) return null;
    var geo = new THREE.SphereGeometry(highlight ? 4.2 : 3.4, 14, 14);
    var mat = new THREE.MeshBasicMaterial({
        color: highlight ? 0xf59e0b : 0xef4444,
        depthTest: false,
        transparent: true,
        opacity: 0.95
    });
    var mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.renderOrder = 9999;
    mesh.userData.designerClientPin = true;
    // Soft outer ring for visibility
    var ring = new THREE.Mesh(
        new THREE.SphereGeometry(highlight ? 7 : 5.5, 14, 14),
        new THREE.MeshBasicMaterial({
            color: highlight ? 0xfbbf24 : 0xfca5a5,
            transparent: true,
            opacity: 0.28,
            depthTest: false
        })
    );
    ring.renderOrder = 9998;
    mesh.add(ring);
    window.scene.add(mesh);
    _dnPinMarkers.push(mesh);
    return mesh;
}

function _dnParsePinPayload(row) {
    if (!row || !row.message) return null;
    var type = row.message_type || 'note';
    var payload = null;
    if (String(row.message).trim().charAt(0) === '{') {
        try { payload = JSON.parse(row.message); } catch (e) { payload = null; }
    }
    if (type !== 'pin_note' && !(payload && payload.type === 'pin')) return null;
    if (!payload || typeof payload.x !== 'number') return null;
    return payload;
}

/** Draw all client pins for active notes-cabinet (and optional highlight focus). */
window._dnRefreshClientPins = function(focusPos) {
    _dnClearPinMarkers();
    if (typeof THREE === 'undefined' || !window.scene) return;
    // Only paint pins when the 3D scene is showing the same cart item the pins belong to
    if (typeof state !== 'undefined' && state.editingCartIndex >= 0 &&
        Number(state.editingCartIndex) !== Number(_dnActiveCabIdx)) {
        return;
    }
    var pins = _dnMessages.filter(function(row) {
        if (_dnCabIdxFromRow(row) !== Number(_dnActiveCabIdx)) return false;
        return !!_dnParsePinPayload(row);
    });
    pins.forEach(function(row) {
        var p = _dnParsePinPayload(row);
        if (!p) return;
        var isFocus = !!(focusPos &&
            Math.abs(p.x - focusPos.x) < 0.5 &&
            Math.abs(p.y - focusPos.y) < 0.5 &&
            Math.abs(p.z - focusPos.z) < 0.5);
        // If only one pin and no explicit focus — highlight it
        if (!focusPos && pins.length === 1) isFocus = true;
        _dnAddPinMarker(p.x, p.y, p.z, isFocus);
    });
};

function _dnFocusCameraOnPin(x, y, z) {
    if (!window.camera || !window.controls) return;
    var cam = window.camera;
    var ctrl = window.controls;
    var target = new THREE.Vector3(x, y, z);
    var dist = 110;
    var toPos = new THREE.Vector3(x + dist * 0.55, y + dist * 0.35, z + dist * 0.75);
    window._camAnim = null;
    if (typeof THREE !== 'undefined') {
        window._camAnim = {
            fromPos: cam.position.clone(),
            fromTarget: ctrl.target.clone(),
            toPos: toPos,
            toTarget: target,
            t: 0,
            duration: 0.55,
            onDone: null
        };
        ctrl.enabled = false;
    } else {
        cam.position.copy(toPos);
        ctrl.target.copy(target);
        ctrl.update();
    }
    if (typeof state !== 'undefined') state.viewMode = '3d';
    if (typeof updateCameraView === 'function') {
        // keep 3d orbit free after focus
        window._orbitFree = true;
    }
}

function _dnShowPinsAndFocus(x, y, z) {
    var needJump = (typeof state !== 'undefined' && state.editingCartIndex !== _dnActiveCabIdx);
    if (needJump && typeof editCartItem === 'function') {
        _dnPendingPinFocus = { x: x, y: y, z: z };
        editCartItem(_dnActiveCabIdx);
        if (typeof _showToast === 'function') _showToast('טוען ארון ומציג את הסימון...', 2500);
        setTimeout(function() {
            if (!_dnPendingPinFocus) return;
            var p = _dnPendingPinFocus;
            _dnPendingPinFocus = null;
            window._dnRefreshClientPins(p);
            _dnFocusCameraOnPin(p.x, p.y, p.z);
        }, 700);
        return;
    }
    window._dnRefreshClientPins({ x: x, y: y, z: z });
    _dnFocusCameraOnPin(x, y, z);
    if (typeof _showToast === 'function') _showToast('הסימון מסומן בכתום על הארון', 2500);
}

function _dnRenderCabTabs() {
    var tabsEl = document.getElementById('designer-notes-cab-tabs');
    if (!tabsEl) return;
    tabsEl.innerHTML = '';

    var count = _dnGetCabCount();
    for (var idx = 0; idx < count; idx++) {
        (function(cabIdx) {
            var tab = document.createElement('button');
            tab.type = 'button';
            tab.className = 'designer-notes-cab-tab' + (cabIdx === _dnActiveCabIdx ? ' active' : '');
            var unread = _dnUnreadPerCab[cabIdx] || 0;
            var badgeHtml = unread > 0
                ? '<span class="designer-notes-tab-badge">' + (unread > 9 ? '9+' : unread) + '</span>'
                : '';
            tab.innerHTML = _dnEsc(_dnGetCabLabel(cabIdx)) + badgeHtml;
            tab.onclick = function() {
                _dnActiveCabIdx = cabIdx;
                _dnRenderCabTabs();
                _dnRenderThread(cabIdx);
                _dnMarkCabRead(cabIdx);
                window._dnRefreshClientPins();
            };
            tabsEl.appendChild(tab);
        })(idx);
    }
}

function _dnRenderThread(cabIdx) {
    var body = document.getElementById('designer-notes-body');
    if (!body) return;
    body.innerHTML = '';

    var notes = _dnFilterMessagesForCab(cabIdx);
    if (notes.length === 0) {
        body.innerHTML =
            '<div id="designer-notes-empty" style="text-align:center;color:#94a3b8;font-size:0.78rem;padding:20px 0;line-height:1.6;">' +
            '<i class="fa-solid fa-comment-dots" style="font-size:1.6rem;margin-bottom:8px;display:block;opacity:0.35;"></i>' +
            'אין תיקונים עדיין לארון זה<br>' +
            '<span style="font-size:0.72rem;">כתוב תשובה למטה כשהלקוח ישלח</span>' +
            '</div>';
    } else {
        notes.forEach(function(note) { _dnAppendBubble(note, body); });
    }

    var editBtn = document.getElementById('designer-notes-edit-btn');
    if (editBtn) {
        var cart = (typeof state !== 'undefined' && state.orderCart) ? state.orderCart : [];
        editBtn.style.display = cart[cabIdx] ? 'flex' : 'none';
    }

    setTimeout(function() {
        if (body) body.scrollTop = body.scrollHeight;
    }, 50);
}

function _dnRenderPanel() {
    _dnRenderCabTabs();
    _dnRenderThread(_dnActiveCabIdx);
    window._dnRefreshClientPins();
}

window._updateNotesBadges = function() {
    var count = _dnTotalUnread;
    var label = count > 9 ? '9+' : String(count);

    ['chat-unread-badge', 'mobile-chat-unread-badge', 'designer-notes-float-badge'].forEach(function(id) {
        var el = document.getElementById(id);
        if (!el) return;
        if (count > 0) {
            el.textContent = label;
            el.style.display = 'flex';
        } else {
            el.style.display = 'none';
        }
    });
};

window._updateCartNotesBadges = function(token) {
    if (token && token !== _dnToken) return;
    var count = _dnGetCabCount();
    for (var idx = 0; idx < count; idx++) {
        var badge = document.getElementById('notes-badge-cart-' + idx);
        if (!badge) continue;
        var unread = _dnUnreadPerCab[idx] || 0;
        if (unread > 0) {
            badge.textContent = unread > 9 ? '9+' : String(unread);
            badge.style.display = 'flex';
        } else {
            badge.style.display = 'none';
        }
    }
};

function _dnUpdateAllBadges() {
    window._updateNotesBadges();
    window._updateCartNotesBadges(_dnToken);
}

function _dnMarkCabRead(cabIdx) {
    var prev = _dnUnreadPerCab[cabIdx] || 0;
    if (prev > 0) {
        _dnUnreadPerCab[cabIdx] = 0;
        _dnTotalUnread = Math.max(0, _dnTotalUnread - prev);
        _dnUpdateAllBadges();
    }

    _dnMessages.forEach(function(row) {
        if (row.sender_role === 'client' && !row.is_read && _dnCabIdxFromRow(row) === Number(cabIdx)) {
            row.is_read = true;
        }
    });

    var sb = _dnGetSb();
    if (!sb || !_dnToken) return;

    var q = sb.from('project_messages')
        .update({ is_read: true })
        .eq('share_token', _dnToken)
        .eq('sender_role', 'client')
        .eq('is_read', false);

    if (_dnCabIndexColExists !== false) {
        q = q.eq('cabinet_index', Number(cabIdx));
    }

    q.then(function(r) {
        if (r.error) console.warn('[designer-notes] mark-read error:', r.error);
    });
}

window._markAllNotesRead = function() {
    _dnMessages.forEach(function(row) {
        if (row.sender_role === 'client') row.is_read = true;
    });
    _dnUnreadPerCab = {};
    _dnTotalUnread = 0;
    _dnUpdateAllBadges();
    _dnRenderCabTabs();

    var sb = _dnGetSb();
    if (!sb || !_dnToken) return;

    sb.from('project_messages')
        .update({ is_read: true })
        .eq('share_token', _dnToken)
        .eq('sender_role', 'client')
        .eq('is_read', false)
        .then(function(r) {
            if (r.error) console.warn('[designer-notes] mark-all-read error:', r.error);
            else if (typeof _showToast === 'function') _showToast('כל התיקונים סומנו כטופל ✓', 2500);
        });
};

window._openDesignerNotes = async function() {
    if (!window._currentShareToken) {
        if (typeof _showToast === 'function') _showToast('יש לשתף קישור ללקוח קודם', 3500);
        return;
    }

    if (!_dnCabIdxLocked) {
        _dnActiveCabIdx = (typeof state !== 'undefined' && state.editingCartIndex >= 0)
            ? state.editingCartIndex
            : 0;
    }
    _dnCabIdxLocked = false;

    _dnPanelOpen = true;
    var panel = document.getElementById('designer-notes-panel');
    var floatBtn = document.getElementById('designer-notes-float-btn');
    if (panel) panel.style.display = 'flex';
    if (floatBtn) floatBtn.style.display = 'none';

    await _dnFetchAllMessages();
    await _dnLoadDesignerName();
    _dnRenderPanel();
    _dnMarkCabRead(_dnActiveCabIdx);

    setTimeout(function() {
        var inp = document.getElementById('designer-notes-input');
        if (inp) inp.focus();
    }, 200);
};

window._openDesignerNotesForCabinet = function(idx) {
    _dnActiveCabIdx = Number(idx) || 0;
    _dnCabIdxLocked = true;
    window._openDesignerNotes();
};

window._closeDesignerNotes = function() {
    _dnPanelOpen = false;
    var panel = document.getElementById('designer-notes-panel');
    if (panel) panel.style.display = 'none';

    if (window._currentShareToken) {
        var floatBtn = document.getElementById('designer-notes-float-btn');
        if (floatBtn) floatBtn.style.display = 'flex';
    }
};

window._jumpToCabinetFromNotes = function() {
    if (typeof editCartItem === 'function') {
        editCartItem(_dnActiveCabIdx);
        window._closeDesignerNotes();
    }
};

window._sendDesignerReply = async function() {
    var input = document.getElementById('designer-notes-input');
    var msg = input ? input.value.trim() : '';
    if (!msg || !_dnToken || !window._currentProjectId) return;

    if (input) input.value = '';
    await _dnLoadDesignerName();

    var cabIdx = _dnActiveCabIdx;
    var optimistic = {
        sender_role: 'designer',
        sender_name: _dnDesignerName,
        message: msg,
        created_at: new Date().toISOString(),
        cabinet_index: cabIdx,
        message_type: 'note',
        is_read: false
    };

    _dnMessages.push(optimistic);
    var body = document.getElementById('designer-notes-body');
    var empty = document.getElementById('designer-notes-empty');
    if (empty) empty.remove();
    _dnAppendBubble(optimistic, body);
    if (body) body.scrollTop = body.scrollHeight;

    var sb = _dnGetSb();
    if (!sb) {
        if (input) input.value = msg;
        return;
    }

    try {
        var payload = {
            project_id: window._currentProjectId,
            share_token: _dnToken,
            sender_role: 'designer',
            sender_name: _dnDesignerName,
            message: msg,
            message_type: 'note',
            is_read: false
        };
        if (_dnCabIndexColExists !== false) {
            payload.cabinet_index = cabIdx;
        }

        var result = await sb.from('project_messages').insert(payload);
        if (result.error) {
            if (result.error.code === '42703') {
                _dnCabIndexColExists = false;
                delete payload.cabinet_index;
                result = await sb.from('project_messages').insert(payload);
            } else {
                console.error('[designer-notes] send error:', result.error);
                if (typeof _showToast === 'function') _showToast('שגיאה בשליחת תשובה', 4000);
                if (input) input.value = msg;
                _dnMessages.pop();
                _dnRenderThread(cabIdx);
                return;
            }
        } else {
            _dnCabIndexColExists = true;
            if (result.data && result.data[0] && result.data[0].id) {
                optimistic.id = result.data[0].id;
                _dnKnownIds[result.data[0].id] = true;
            }
        }
    } catch(e) {
        console.error('[designer-notes] send exception:', e);
        if (input) input.value = msg;
    }
};

function _dnOnNewMessage(note) {
    if (!note) return;
    if (note.id && _dnKnownIds[note.id]) return;
    if (note.id) _dnKnownIds[note.id] = true;

    _dnMessages.push(note);

    if (note.sender_role === 'client' && !note.is_read) {
        var idx = _dnCabIdxFromRow(note);
        _dnUnreadPerCab[idx] = (_dnUnreadPerCab[idx] || 0) + 1;
        _dnTotalUnread++;
        _dnUpdateAllBadges();

        var cabLabel = _dnGetCabLabel(idx);
        var pinPay = _dnParsePinPayload(note);
        if (typeof _showToast === 'function') {
            _showToast(pinPay
                ? ('סימון חדש על הארון — ' + cabLabel + ' (פתח תיקונים ולחץ על ההערה)')
                : ('תיקון חדש מלקוח — ' + cabLabel), 5000);
        }
        if (pinPay && idx === _dnActiveCabIdx) {
            window._dnRefreshClientPins({ x: pinPay.x, y: pinPay.y, z: pinPay.z });
        }
    }

    if (_dnPanelOpen) {
        _dnRenderCabTabs();
        if (_dnCabIdxFromRow(note) === _dnActiveCabIdx) {
            var body = document.getElementById('designer-notes-body');
            var empty = document.getElementById('designer-notes-empty');
            if (empty) empty.remove();
            _dnAppendBubble(note, body);
            if (body) body.scrollTop = body.scrollHeight;
            window._dnRefreshClientPins();
        }
    }
}

window._startDesignerNotesListener = async function(token) {
    if (!token) return;
    if (_dnToken === token && _dnChannel) return;

    window._stopDesignerNotesListener();
    _dnToken = token;

    await _dnFetchAllMessages();
    _dnUpdateAllBadges();
    window._dnRefreshClientPins();

    var sb = _dnGetSb();
    if (!sb) return;

    _dnChannel = sb.channel('designer-notes-' + token)
        .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'project_messages',
            filter: 'share_token=eq.' + token
        }, function(payload) {
            _dnOnNewMessage(payload.new);
        })
        .on('postgres_changes', {
            event: 'DELETE',
            schema: 'public',
            table: 'project_messages',
            filter: 'share_token=eq.' + token
        }, function(payload) {
            _dnOnDeletedMessage(payload.old);
        })
        .subscribe(function(status) {
            if (status === 'SUBSCRIBED') {
                var dot = document.getElementById('designer-notes-live-dot');
                if (dot) dot.style.background = '#4ade80';
            }
        });

    if (_dnPollTimer) clearInterval(_dnPollTimer);
    _dnPollTimer = setInterval(async function() {
        if (!_dnToken) return;
        var prevCount = _dnMessages.length;
        await _dnFetchAllMessages();
        _dnUpdateAllBadges();
        if (_dnPanelOpen && _dnMessages.length !== prevCount) {
            _dnRenderPanel();
        }
    }, 12000);
};

window._stopDesignerNotesListener = function() {
    if (_dnChannel) {
        _dnChannel.unsubscribe();
        _dnChannel = null;
    }
    if (_dnPollTimer) {
        clearInterval(_dnPollTimer);
        _dnPollTimer = null;
    }
    _dnToken = null;
    _dnMessages = [];
    _dnKnownIds = {};
    _dnUnreadPerCab = {};
    _dnTotalUnread = 0;
    _dnClearPinMarkers();
    _dnUpdateAllBadges();
};

(function() {
    var inp = document.getElementById('designer-notes-input');
    if (inp) {
        inp.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                window._sendDesignerReply();
            }
        });
    }
})();
