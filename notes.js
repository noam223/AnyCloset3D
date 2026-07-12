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
    wrap.innerHTML =
        '<div class="designer-note-bubble ' + (isClient ? 'client' : 'designer') + '">' +
            _dnEsc(note.message) +
        '</div>' +
        '<div class="designer-note-meta">' + _dnEsc(senderLabel) + (time ? (' · ' + time) : '') + '</div>';
    container.appendChild(wrap);
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
        if (typeof _showToast === 'function') {
            _showToast('תיקון חדש מלקוח — ' + cabLabel, 5000);
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
