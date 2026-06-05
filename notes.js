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

        if (typeof _showToast === 'function') _showToast('הקישור בוטל ✓', 3000);
    } catch(e) {
        console.error('[revoke] error:', e);
        if (typeof _showToast === 'function') _showToast('שגיאה בביטול הקישור: ' + e.message, 4000);
    }
};
