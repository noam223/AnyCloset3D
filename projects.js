// ==========================================
// projects.js — Project Manager Logic
// ==========================================

var _projects            = [];
var _plan                = null;
var _renameId            = null;
var _deleteId            = null;
var _statusChangeId      = null;
var _searchQuery         = '';
var _statusFilter        = 'all';
var _selectedUpgradePlan = null;
var _toastTimer          = null;
var _devicesList         = [];

// ── Plan catalog for upgrade modal ────────────────────────────────────────────
// Organized by user type, shown in upgrade modal
var _UPGRADE_PLANS = [
    // מעצבות
    { key: 'designer_monthly',  label: 'מעצבת — חודשי',        price: '₪399/חודש',  userType: 'designer',  maxProjects: 30,   maxDevices: 1,  desc: 'עד 30 פרויקטים, 12 ארונות לפרויקט' },
    { key: 'designer_annual',   label: 'מעצבת — שנתי',         price: '₪359/חודש',  userType: 'designer',  maxProjects: 30,   maxDevices: 1,  desc: 'עד 30 פרויקטים, 12 ארונות לפרויקט, ₪4,308 לשנה — חיסכון 10%' },
    // נגרים
    { key: 'carpenter_basic',   label: 'נגר — בסיסי',           price: '₪X/חודש',    userType: 'carpenter', maxProjects: 30,   maxDevices: 1,  desc: 'תמחור + הדמיה, עד 30 פרויקטים' },
    { key: 'carpenter_pro',     label: 'נגר — מקצועי',          price: '₪X/חודש',    userType: 'carpenter', maxProjects: null, maxDevices: 2,  desc: 'הכל כולל דוח לקוח + ייצוא לנגר' },
    // חברות
    { key: 'company_standard',  label: 'חברה — סטנדרט',         price: '₪X/חודש',    userType: 'company',   maxProjects: null, maxDevices: 10, desc: 'עד 10 מכשירים, כל הפיצ\'רים' },
    { key: 'company_enterprise',label: 'חברה — ארגוני',          price: 'צור קשר',    userType: 'company',   maxProjects: null, maxDevices: 30, desc: 'עד 30 מכשירים, תמיכה מלאה' },
];

var _USER_TYPE_LABELS = {
    designer:  'מעצבות פנים',
    carpenter: 'נגרים',
    company:   'חברות ריהוט'
};

// ── Init ──────────────────────────────────────────────────────────────────────
(async function init() {
    var ok = await Auth.requireAuth();
    if (!ok) return;

    // If returning from payment, bust profile cache and wait for Make/Supabase to update
    var _urlStatusEarly = new URLSearchParams(window.location.search).get('status');
    if (_urlStatusEarly === 'payment_success') {
        if (Auth._profileCache !== undefined) Auth._profileCache = null;
        await new Promise(function(r) { setTimeout(r, 1500); });
    }

    var user, plan, projects, subStatus;
    try {
        var results = await Promise.all([Auth.getUser(), Auth.getPlan(), Projects.list(), Auth.isSubscriptionActive()]);
        user      = results[0];
        plan      = results[1];
        projects  = results[2];
        subStatus = results[3];
    } catch(e) {
        // Fallback: load individually so one failure doesn't block everything
        try { user      = await Auth.getUser(); }           catch(e2) { console.warn('[init] getUser failed:', e2); }
        try { plan      = await Auth.getPlan(); }           catch(e2) { console.warn('[init] getPlan failed:', e2); }
        try { projects  = await Projects.list(); }          catch(e2) { console.warn('[init] projects.list failed:', e2); showToast('שגיאה בטעינת הפרויקטים. רענן את הדף.', 'error'); }
        try { subStatus = await Auth.isSubscriptionActive(); } catch(e2) { console.warn('[init] subStatus failed:', e2); }
    }
    subStatus = subStatus || { active: true, reason: 'free' };
    plan      = plan      || { label: '—', key: 'free', features: {} };
    projects  = projects  || [];

    _plan     = plan;
    _projects = projects;

    if (user) {
        var name = (user.user_metadata && user.user_metadata.full_name)
            ? user.user_metadata.full_name
            : user.email;
        document.getElementById('user-avatar').textContent = _initials(name);
        document.getElementById('user-name').textContent   = name;
        document.getElementById('plan-badge').textContent  = plan.label;
        // populate new sidebar email + hero stats
        var emailEl = document.getElementById('user-email');
        if (emailEl) emailEl.textContent = user.email || '';
    }

    // ── Welcome toasts for new trial / payment success ────────────────────────
    var _urlStatus = new URLSearchParams(window.location.search).get('status');
    if (_urlStatus === 'trial_started') {
        history.replaceState(null, '', 'projects.html');
        setTimeout(function() {
            showToast('🎉 ברוך הבא! 7 ימי ניסיון חינמיים הופעלו. תהנה!', 'success');
        }, 600);
    } else if (_urlStatus === 'payment_success') {
        history.replaceState(null, '', 'projects.html');
        setTimeout(function() {
            showToast('✅ התשלום התקבל! המנוי שלך פעיל. ברוך הבא!', 'success');
        }, 600);
    }

    // ── Trial / subscription status check ────────────────────────────────────
    if (subStatus.reason === 'trial_expired') {
        // Trial expired — show paywall, block new projects
        _showTrialExpiredBanner(plan);
        document.getElementById('btn-new-project').disabled = true;
    } else if (subStatus.reason === 'subscription_expired') {
        // Paid subscription expired (recurring charge failed)
        _showSubscriptionExpiredBanner(plan);
        document.getElementById('btn-new-project').disabled = true;
    } else if (subStatus.reason === 'trial') {
        // Active trial — show countdown banner
        _showTrialBanner(subStatus.trialEndsAt, plan);
    } else if (!subStatus.active) {
        // Inactive subscription
        _showInactiveBanner(plan);
        document.getElementById('btn-new-project').disabled = true;
    }

    // Hero stat cards
    var statProjects = document.getElementById('stat-projects');
    if (statProjects) statProjects.textContent = projects.length;
    var statPlan = document.getElementById('stat-plan');
    if (statPlan) statPlan.textContent = plan.label || '—';

    _renderPlanBar();
    _syncStatusFilterUI();
    _renderProjects();
    _resetProjectsSearchIfAutofilled();
    setTimeout(_resetProjectsSearchIfAutofilled, 150);
    setTimeout(_resetProjectsSearchIfAutofilled, 600);
    _startMissingThumbnailBackfill();

    // content count
    var countEl = document.getElementById('content-count');
    if (countEl) countEl.textContent = projects.length + ' פרויקטים';

    // Show device management section for company plans
    if (_plan.features && _plan.features.canManageDevices) {
        document.getElementById('devices-section').style.display = 'block';
        _loadDevices();
    }

    // Button starts enabled in HTML — only disabled above for expired/inactive subscriptions
    // (No-op line kept for clarity)
    document.getElementById('page-subtitle').textContent =
        projects.length === 0
            ? 'אין פרויקטים עדיין'
            : projects.length + ' פרויקט' + (projects.length !== 1 ? 'ים' : '');
})();

// ── Trial banner helpers ───────────────────────────────────────────────────────
function _showTrialBanner(trialEndsAt, plan) {
    var existing = document.getElementById('trial-banner');
    if (existing) return;

    var daysLeft = Math.ceil((new Date(trialEndsAt) - new Date()) / (1000 * 60 * 60 * 24));
    var banner = document.createElement('div');
    banner.id = 'trial-banner';
    banner.style.cssText = 'background:linear-gradient(135deg,#0f2040,#1a3a6b);color:#fff;padding:10px 20px;display:flex;align-items:center;justify-content:space-between;gap:12px;font-size:.85rem;border-bottom:2px solid #00d4ff;flex-shrink:0;flex-wrap:wrap;';
    banner.innerHTML =
        '<span style="display:flex;align-items:center;gap:8px;">⏳ <strong>' + daysLeft + ' ימי ניסיון נותרו</strong> — תוכנית ' + plan.label + '</span>' +
        '<button onclick="window.location.href=\'' + _getPaymentLink(plan.key) + '\'" style="background:#00d4ff;color:#0a1628;padding:6px 16px;border-radius:8px;font-weight:700;border:none;cursor:pointer;white-space:nowrap;font-family:inherit;font-size:.82rem;">שדרג עכשיו</button>' +
        '<button onclick="this.parentNode.remove()" style="background:none;border:none;color:rgba(255,255,255,.6);cursor:pointer;font-size:1.1rem;padding:0 4px;line-height:1;">×</button>';
    // Insert at top of page-wrap (main content area), not body
    var pageWrap = document.querySelector('.page-wrap');
    if (pageWrap) {
        pageWrap.insertBefore(banner, pageWrap.firstChild);
    } else {
        document.body.insertBefore(banner, document.body.firstChild);
    }
}

// ── Build plan cards HTML for paywall popup ───────────────────────────────────
function _buildPaywallPlansHTML(userType) {
    var plans = _UPGRADE_PLANS.filter(function(p) { return p.userType === userType; });
    if (!plans.length) plans = _UPGRADE_PLANS;

    // Feature bullets per plan key
    var FEATURES = {
        designer_monthly:   ['עד 30 פרויקטים', '12 ארונות לפרויקט', 'הדמיה תלת-ממדית', 'ייצוא PDF'],
        designer_annual:    ['עד 30 פרויקטים', '12 ארונות לפרויקט', 'הדמיה תלת-ממדית', 'ייצוא PDF', 'חיסכון 10% לעומת חודשי'],
        carpenter_basic:    ['עד 30 פרויקטים', 'תמחור אוטומטי', 'הדמיה תלת-ממדית'],
        carpenter_pro:      ['פרויקטים ללא הגבלה', 'תמחור + דוח לקוח', 'ייצוא לנגר', '2 מכשירים'],
        company_standard:   ['פרויקטים ללא הגבלה', 'עד 10 מכשירים', 'כל הפיצ\'רים', 'ניהול צוות'],
        company_enterprise: ['פרויקטים ללא הגבלה', 'עד 30 מכשירים', 'תמיכה מלאה', 'SLA מובטח'],
    };

    // "Popular" = annual plans (best value) or pro/enterprise for other types
    var POPULAR_KEYS = ['designer_annual', 'carpenter_pro', 'company_standard'];

    var useSideBySide = plans.length === 2;
    var html = '<div style="display:' + (useSideBySide ? 'grid;grid-template-columns:1fr 1fr' : 'flex;flex-direction:column') + ';gap:12px;margin-bottom:8px;">';

    plans.forEach(function(p, i) {
        var isPopular = POPULAR_KEYS.indexOf(p.key) !== -1;
        var feats = FEATURES[p.key] || [];
        var featHtml = feats.map(function(f) {
            return '<div style="display:flex;align-items:center;gap:6px;font-size:.78rem;color:#475569;margin-bottom:4px;">' +
                '<span style="color:#0099cc;font-size:.7rem;">✓</span>' + f + '</div>';
        }).join('');

        html += '<div style="' +
            'border:2px solid ' + (isPopular ? '#0099cc' : '#e2e8f0') + ';' +
            'border-radius:14px;' +
            'padding:16px 14px 14px;' +
            'background:' + (isPopular ? 'linear-gradient(160deg,#f0faff 0%,#e6f7ff 100%)' : '#fafafa') + ';' +
            'display:flex;flex-direction:column;' +
            'position:relative;' +
            'text-align:right;' +
            '">';

        // Popular badge
        if (isPopular) {
            html += '<div style="position:absolute;top:-11px;right:50%;transform:translateX(50%);' +
                'background:linear-gradient(135deg,#00d4ff,#0099cc);color:#0a1628;' +
                'font-size:.7rem;font-weight:800;padding:3px 12px;border-radius:20px;white-space:nowrap;">' +
                '⭐ מומלץ</div>';
        }

        // Plan name
        var nameParts = p.label.split('—');
        html += '<div style="font-weight:800;color:#0f2040;font-size:.95rem;margin-bottom:2px;">' +
            (nameParts[1] ? nameParts[1].trim() : p.label) + '</div>';

        // Price
        var priceParts = p.price.split('/');
        html += '<div style="margin-bottom:10px;">' +
            '<span style="font-size:1.5rem;font-weight:900;color:#0099cc;">' + priceParts[0] + '</span>' +
            (priceParts[1] ? '<span style="font-size:.75rem;color:#94a3b8;">/' + priceParts[1] + '</span>' : '') +
            '</div>';

        // Features
        html += '<div style="flex:1;margin-bottom:12px;">' + featHtml + '</div>';

        // CTA button — same text for all plans
        html += '<button onclick="_openPayment(\'' + p.key + '\')" style="' +
            'width:100%;' +
            'background:' + (isPopular ? 'linear-gradient(135deg,#00d4ff,#0099cc)' : '#e2e8f0') + ';' +
            'color:' + (isPopular ? '#0a1628' : '#334155') + ';' +
            'border:none;border-radius:10px;padding:10px 0;' +
            'font-weight:800;font-size:.9rem;cursor:pointer;font-family:inherit;' +
            '">התחל עכשיו</button>';

        html += '</div>';
    });

    html += '</div>';
    return html;
}

function _showTrialExpiredBanner(plan) {
    var existing = document.getElementById('trial-expired-overlay');
    if (existing) return;

    var userType = (plan && plan.key) ? plan.key.split('_')[0] : 'designer';
    var overlay = document.createElement('div');
    overlay.id = 'trial-expired-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(10,22,40,0.92);display:flex;align-items:center;justify-content:center;overflow-y:auto;padding:20px;box-sizing:border-box;';
    overlay.innerHTML =
        '<div style="background:#fff;border-radius:20px;padding:32px;max-width:480px;width:100%;text-align:center;box-shadow:0 8px 40px rgba(0,0,0,0.4);">' +
        '<div style="font-size:2.5rem;margin-bottom:12px;">⏰</div>' +
        '<h2 style="color:#0f2040;margin-bottom:8px;font-size:1.3rem;">תקופת הניסיון הסתיימה</h2>' +
        '<p style="color:#475569;margin-bottom:20px;line-height:1.6;font-size:.9rem;">7 ימי הניסיון החינמיים שלך הסתיימו.<br>בחר תוכנית מנוי כדי להמשיך.</p>' +
        _buildPaywallPlansHTML(userType) +
        '</div>';
    document.body.appendChild(overlay);
}

function _showSubscriptionExpiredBanner(plan) {
    var existing = document.getElementById('trial-expired-overlay');
    if (existing) return;

    var userType = (plan && plan.key) ? plan.key.split('_')[0] : 'designer';
    var overlay = document.createElement('div');
    overlay.id = 'trial-expired-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(10,22,40,0.92);display:flex;align-items:center;justify-content:center;overflow-y:auto;padding:20px;box-sizing:border-box;';
    overlay.innerHTML =
        '<div style="background:#fff;border-radius:20px;padding:32px;max-width:480px;width:100%;text-align:center;box-shadow:0 8px 40px rgba(0,0,0,0.4);">' +
        '<div style="font-size:2.5rem;margin-bottom:12px;">💳</div>' +
        '<h2 style="color:#0f2040;margin-bottom:8px;font-size:1.3rem;">חידוש המנוי נכשל</h2>' +
        '<p style="color:#475569;margin-bottom:20px;line-height:1.6;font-size:.9rem;">לא הצלחנו לחייב את כרטיס האשראי שלך.<br>בחר תוכנית מנוי כדי להמשיך.</p>' +
        _buildPaywallPlansHTML(userType) +
        '</div>';
    document.body.appendChild(overlay);
}

function _showInactiveBanner(plan) {
    var existing = document.getElementById('trial-expired-overlay');
    if (existing) return;

    var userType = (plan && plan.key) ? plan.key.split('_')[0] : 'designer';
    var overlay = document.createElement('div');
    overlay.id = 'trial-expired-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(10,22,40,0.92);display:flex;align-items:center;justify-content:center;overflow-y:auto;padding:20px;box-sizing:border-box;';
    overlay.innerHTML =
        '<div style="background:#fff;border-radius:20px;padding:32px;max-width:480px;width:100%;text-align:center;box-shadow:0 8px 40px rgba(0,0,0,0.4);">' +
        '<div style="font-size:2.5rem;margin-bottom:12px;">🔒</div>' +
        '<h2 style="color:#0f2040;margin-bottom:8px;font-size:1.3rem;">המנוי אינו פעיל</h2>' +
        '<p style="color:#475569;margin-bottom:20px;line-height:1.6;font-size:.9rem;">כדי להמשיך להשתמש במערכת, בחר תוכנית מנוי.</p>' +
        _buildPaywallPlansHTML(userType) +
        '</div>';
    document.body.appendChild(overlay);
}

// ── Toggle annual installments UI ────────────────────────────────────────────
function _annualToggle(planKey, installments) {
    var cardId = 'annual-toggle-' + planKey;
    var btnFull = document.getElementById(cardId + '-full');
    var btnInst = document.getElementById(cardId + '-inst');
    var btnCta  = document.getElementById(cardId + '-cta');
    if (!btnFull || !btnInst || !btnCta) return;

    var isInst = installments === 12;
    btnFull.style.background = isInst ? '#f1f5f9' : '#0099cc';
    btnFull.style.color      = isInst ? '#475569'  : '#fff';
    btnInst.style.background = isInst ? '#0099cc'  : '#f1f5f9';
    btnInst.style.color      = isInst ? '#fff'     : '#475569';

    // Update CTA onclick
    btnCta.setAttribute('onclick', '_openPayment(\'' + planKey + '\',' + installments + ')');
    btnCta.textContent = isInst ? 'התחל ב-12 תשלומים' : 'התחל עכשיו';
}
window._annualToggle = _annualToggle;

// ── Open payment via Make Scenario 1 (creates Grow payment link dynamically) ──
async function _openPayment(planKey, installments) {
    installments = installments || 1;
    var SCENARIO1_WEBHOOK = 'https://hook.eu1.make.com/2p1w789m4oeh3glw0pry61y0dd6vnlvd';

    // If webhook not configured yet, go to pricing page
    if (SCENARIO1_WEBHOOK.indexOf('YOUR_SCENARIO1') !== -1) {
        window.location.href = 'landing.html#pricing';
        return;
    }

    // Find the clicked button — any button with onclick containing this planKey
    var btn = document.querySelector('button[onclick*="_openPayment(\'' + planKey + '\'"]');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ מעבד...'; }

    // Show full-screen loading overlay so user knows something is happening
    var loadingOverlay = document.createElement('div');
    loadingOverlay.id = '_payment-loading-overlay';
    loadingOverlay.style.cssText = 'position:fixed;inset:0;background:rgba(10,22,40,0.7);z-index:99999;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;';
    loadingOverlay.innerHTML = '<div style="width:48px;height:48px;border:4px solid rgba(255,255,255,0.2);border-top-color:#00d4ff;border-radius:50%;animation:_spin 0.8s linear infinite;"></div>' +
        '<div style="color:#fff;font-size:1rem;font-weight:700;">מכין דף תשלום...</div>' +
        '<style>@keyframes _spin{to{transform:rotate(360deg)}}</style>';
    document.body.appendChild(loadingOverlay);

    var removeLoading = function() {
        var el = document.getElementById('_payment-loading-overlay');
        if (el) el.remove();
        if (btn) { btn.disabled = false; btn.textContent = 'התחל עכשיו'; }
    };

    try {
        var user = await Auth.getUser();
        var profile = await Auth.getProfile();
        var res = await fetch(SCENARIO1_WEBHOOK, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                plan:         planKey,
                installments: installments,
                email:        user ? user.email : '',
                fullName:     (profile && profile.full_name) ? profile.full_name : (user ? user.email : ''),
                phone:        (profile && profile.phone) ? profile.phone : ''
            })
        });
        var rawText = await res.text();
        console.log('Make response status:', res.status, 'body:', rawText);
        var data = {};
        try { data = JSON.parse(rawText); } catch(pe) { /* not JSON */ }
        if (data.payment_url) {
            // Keep loading overlay while redirecting
            window.location.href = data.payment_url;
        } else {
            removeLoading();
            alert('שגיאה ביצירת קישור תשלום\n\nתשובת Make:\n' + rawText);
        }
    } catch(e) {
        removeLoading();
        alert('שגיאת חיבור — נסה שוב');
    }
}
window._openPayment = _openPayment;

function _getPaymentLink(planKey) {
    // Returns a JS call string for onclick — actual payment goes through Make Scenario 1
    return 'javascript:_openPayment(\'' + planKey + '\')';
}

// ── Plan bar ──────────────────────────────────────────────────────────────────
function _renderPlanBar() {
    document.getElementById('plan-bar').style.display = 'flex';
    var used = _projects.length;
    var max  = _plan.maxProjects;

    if (max === null) {
        // Unlimited projects
        document.getElementById('plan-bar-label').textContent =
            'תוכנית ' + _plan.label + ' — ' + used + ' פרויקטים (ללא הגבלה)';
        document.getElementById('plan-bar-count').textContent = 'ללא הגבלת פרויקטים';
        var fill = document.getElementById('plan-bar-fill');
        fill.style.width = '0%';
        fill.className   = 'plan-bar-fill';
    } else {
        var pct = Math.min(100, Math.round((used / max) * 100));
        document.getElementById('plan-bar-label').textContent =
            'תוכנית ' + _plan.label + ' — ' + used + ' מתוך ' + max + ' פרויקטים';
        document.getElementById('plan-bar-count').textContent =
            pct >= 100
                ? 'הגעת למגבלת הפרויקטים — שדרג כדי להמשיך'
                : 'נותרו ' + (max - used) + ' פרויקטים';
        var fill = document.getElementById('plan-bar-fill');
        fill.style.width = pct + '%';
        fill.className   = 'plan-bar-fill' + (pct >= 100 ? ' full' : pct >= 75 ? ' warn' : '');
    }

    // Show upgrade button unless on top-tier plans
    var topTierPlans = ['carpenter_pro', 'company_enterprise'];
    if (topTierPlans.indexOf(_plan.key) === -1) {
        document.getElementById('btn-upgrade').style.display = 'flex';
    }

    // Show device count for company plans
    if (_plan.features && _plan.features.isCompany) {
        document.getElementById('plan-bar-devices').style.display = 'block';
        document.getElementById('plan-bar-devices-text').textContent =
            'מכשירים מורשים: עד ' + _plan.maxDevices;
    }
}

// ── Order status helpers ──────────────────────────────────────────────────────
var _ORDER_STATUS_KEYS = (window.Projects && Projects.ORDER_STATUS_KEYS)
    || ['quote', 'ordered', 'production', 'service', 'installed'];

function _orderStatusLabel(status) {
    var map = (window.Projects && Projects.ORDER_STATUSES) || {
        quote: 'הצעת מחיר', ordered: 'נסגרה עסקה', production: 'נשלח לייצור',
        service: 'קריאת שירות', installed: 'התקנה הושלמה'
    };
    return map[status] || map.quote;
}

function _normalizeOrderStatus(status) {
    return _ORDER_STATUS_KEYS.indexOf(status) !== -1 ? status : 'quote';
}

function _statusIconClass(status) {
    var icons = {
        quote: 'fa-file-invoice-dollar',
        ordered: 'fa-circle-check',
        production: 'fa-industry',
        service: 'fa-screwdriver-wrench',
        installed: 'fa-house-circle-check'
    };
    return icons[_normalizeOrderStatus(status)] || icons.quote;
}

function _statusChipLabelHtml(status) {
    var labels = {
        quote: 'הצעת<br>מחיר',
        ordered: 'נסגרה<br>עסקה',
        production: 'נשלח<br>לייצור',
        service: 'קריאת<br>שירות',
        installed: 'התקנה<br>הושלמה'
    };
    return labels[_normalizeOrderStatus(status)] || labels.quote;
}

function _projectMatchesSearch(p) {
    if (!_searchQuery) return true;
    var q = _searchQuery.toLowerCase();
    var fields = [p.name, p.customer_name, p.customer_order_num];
    return fields.some(function(f) { return f && String(f).toLowerCase().indexOf(q) !== -1; });
}

function _projectMatchesStatusFilter(p) {
    if (_statusFilter === 'all') return true;
    return _normalizeOrderStatus(p.order_status) === _statusFilter;
}

function _syncStatusFilterUI() {
    document.querySelectorAll('#projects-status-filters .status-filter-btn').forEach(function(btn) {
        var key = btn.dataset.status;
        btn.classList.toggle('active', key === _statusFilter);
    });
}

function setStatusFilterAll() {
    _statusFilter = 'all';
    _syncStatusFilterUI();
    _renderProjects();
}

function setStatusFilter(status) {
    if (_ORDER_STATUS_KEYS.indexOf(status) === -1) return;
    _statusFilter = status;
    _syncStatusFilterUI();
    _renderProjects();
}

function onProjectsSearch(value, fromUser) {
    if (fromUser) {
        var el = document.getElementById('projects-search');
        if (el) el.dataset.userTyped = '1';
    }
    _searchQuery = (value || '').trim();
    _renderProjects();
}

function _resetProjectsSearchIfAutofilled() {
    var el = document.getElementById('projects-search');
    if (!el || el.dataset.userTyped === '1') return;
    if (!el.value) return;
    el.value = '';
    _searchQuery = '';
    _renderProjects();
}

// ── Projects grid ─────────────────────────────────────────────────────────────
function _renderProjects() {
    var grid = document.getElementById('projects-grid');
    grid.innerHTML = '';

    var visible = _projects.filter(function(p) {
        return _projectMatchesSearch(p) && _projectMatchesStatusFilter(p);
    });

    var countEl = document.getElementById('content-count');
    if (countEl) {
        var filtered = _statusFilter !== 'all' || _searchQuery;
        countEl.textContent = filtered
            ? (visible.length + ' מתוך ' + _projects.length + ' פרויקטים')
            : (_projects.length + ' פרויקטים');
    }

    if (_projects.length === 0) {
        grid.innerHTML =
            '<div class="empty-state">' +
                '<div class="empty-state-icon"><i class="fa-solid fa-folder-open"></i></div>' +
                '<h3>אין פרויקטים עדיין</h3>' +
                '<p>צור פרויקט חדש כדי להתחיל לעצב את הארון שלך</p>' +
                '<button class="btn-new" onclick="newProject()" style="margin:0 auto;">' +
                    '<i class="fa-solid fa-plus"></i> פרויקט חדש' +
                '</button>' +
            '</div>';
        return;
    }

    if (visible.length === 0) {
        var emptyHint = _searchQuery && _statusFilter !== 'all'
            ? 'נסה חיפוש אחר או שנה את סינון הסטטוס'
            : (_searchQuery ? 'נסה חיפוש אחר או נקה את שדה החיפוש' : 'אין פרויקטים בסטטוס זה — נסה לבחור "הכל"');
        grid.innerHTML =
            '<div class="empty-state">' +
                '<div class="empty-state-icon"><i class="fa-solid fa-magnifying-glass"></i></div>' +
                '<h3>לא נמצאו פרויקטים</h3>' +
                '<p>' + emptyHint + '</p>' +
            '</div>';
        return;
    }

    visible.forEach(function(p) {
        var card     = document.createElement('div');
        card.className  = 'project-card status-' + _normalizeOrderStatus(p.order_status);
        card.dataset.id = p.id;

        // Check lock status for designer_single
        var lockInfo = null;
        var lockBadgeHtml = '';
        if (_plan && _plan.projectLockDays) {
            lockInfo = Auth.checkProjectLock(p, _plan);
            if (lockInfo.locked) {
                lockBadgeHtml = '<div class="lock-badge locked"><i class="fa-solid fa-lock"></i> נעול לעריכה</div>';
                card.classList.add('is-locked');
            } else if (lockInfo.locksAt) {
                var hoursLeft = lockInfo.hoursLeft;
                var urgentClass = hoursLeft <= 24 ? ' urgent' : '';
                lockBadgeHtml = '<div class="lock-badge expiring' + urgentClass + '">' +
                    '<i class="fa-solid fa-clock"></i> נועל בעוד ' + hoursLeft + ' שעות</div>';
            }
        }

        var dateStr  = _formatDate(p.updated_at);
        var safeName = _esc(p.name);
        var orderStatus = _normalizeOrderStatus(p.order_status);
        var statusLabel = _orderStatusLabel(orderStatus);
        var customerLine = '';
        if (p.customer_name || p.customer_order_num) {
            var parts = [];
            if (p.customer_name) parts.push('<span class="project-customer-name">' + _esc(p.customer_name) + '</span>');
            if (p.customer_order_num) parts.push('<span class="project-order-num"><i class="fa-solid fa-hashtag"></i> ' + _esc(p.customer_order_num) + '</span>');
            customerLine = '<div class="project-customer">' + parts.join('<span class="project-customer-sep">·</span>') + '</div>';
        }
        var statusChipHtml =
            '<div class="project-status-chip status-' + orderStatus + '">' +
            '<i class="fa-solid ' + _statusIconClass(orderStatus) + '"></i>' +
            '<span>' + _statusChipLabelHtml(orderStatus) + '</span></div>';
        var statusFootHtml =
            '<button type="button" class="project-status-foot status-' + orderStatus + '" ' +
            'onclick="event.stopPropagation(); startStatusChange(\'' + p.id + '\')" title="לחץ לשינוי סטטוס">' +
            '<span class="project-status-foot-left"><i class="fa-solid ' + _statusIconClass(orderStatus) + '"></i> ' + statusLabel + '</span>' +
            '<span class="project-status-foot-hint">לחץ לשינוי ▾</span></button>';
        var thumbHtml = p.thumbnail
            ? '<img src="' + p.thumbnail + '" alt="' + safeName + '" loading="lazy">'
            : '<i class="fa-solid fa-cabinet-filing project-thumb-icon"></i>';

        // Cabinet count badge
        var cabinetBadge = (p.cabinet_count != null && p.cabinet_count > 0)
            ? '<div class="cabinet-count-badge"><i class="fa-solid fa-layer-group"></i> ' + p.cabinet_count + '</div>'
            : '';

        // Open button — disabled if locked
        var isLocked = lockInfo && lockInfo.locked;
        var openBtnHtml = isLocked
            ? '<button class="btn-card primary locked-btn" onclick="openLockedProject(\'' + p.id + '\')">' +
                '<i class="fa-solid fa-lock"></i> נעול</button>'
            : '<button class="btn-card primary" onclick="openProject(\'' + p.id + '\')">' +
                '<i class="fa-solid fa-pencil-ruler"></i> פתח</button>';

        // Extend button for designer_single locked projects
        var extendBtnHtml = '';
        if (isLocked && _plan.features && _plan.features.canExtendProject) {
            extendBtnHtml = '<button class="btn-card extend-btn" onclick="extendProject(\'' + p.id + '\')" title="הארך עריכה בתשלום">' +
                '<i class="fa-solid fa-rotate-right"></i> הארך</button>';
        }

        var openFn = isLocked ? 'openLockedProject' : 'openProject';
        card.innerHTML =
            '<div class="project-thumb" onclick="' + openFn + '(\'' + p.id + '\')">' +
                thumbHtml +
                statusChipHtml +
                '<div class="project-thumb-date"><i class="fa-regular fa-clock" style="margin-left:4px"></i>' + dateStr + '</div>' +
                cabinetBadge +
                (!isLocked ? '<div class="project-open-overlay"><button class="project-open-btn" onclick="openProject(\'' + p.id + '\')"><i class="fa-solid fa-pencil-ruler"></i> פתח לעריכה</button></div>' : '') +
            '</div>' +
            lockBadgeHtml +
            '<div class="project-body status-' + orderStatus + '" onclick="' + openFn + '(\'' + p.id + '\')">' +
                '<div class="project-name" title="' + safeName + '">' + safeName + '</div>' +
                customerLine +
                '<div class="project-meta">' +
                    '<span class="project-meta-item"><i class="fa-regular fa-calendar"></i> ' + dateStr + '</span>' +
                    (p.cabinet_count ? '<span class="project-meta-item"><i class="fa-solid fa-layer-group"></i> ' + p.cabinet_count + ' ארונות</span>' : '') +
                '</div>' +
            '</div>' +
            statusFootHtml +
            '<div class="project-actions">' +
                openBtnHtml +
                extendBtnHtml +
                '<button class="btn-card" onclick="event.stopPropagation(); startRename(\'' + p.id + '\')">' +
                    '<i class="fa-solid fa-pen"></i> שנה שם</button>' +
                '<button class="btn-card danger icon-only" title="מחק" onclick="event.stopPropagation(); startDelete(\'' + p.id + '\')">' +
                    '<i class="fa-solid fa-trash"></i></button>' +
            '</div>';

        grid.appendChild(card);
    });
}

// ── Thumbnail backfill for projects missing preview images ───────────────────
var _thumbBackfillQueue = null;
var _thumbBackfillIframe = null;
var _thumbBackfillTimer = null;

function _updateProjectCardThumb(projectId, dataUrl) {
    var card = document.querySelector('.project-card[data-id="' + projectId + '"]');
    if (!card) return;
    var thumb = card.querySelector('.project-thumb');
    if (!thumb) return;
    var icon = thumb.querySelector('.project-thumb-icon');
    if (icon) icon.remove();
    var img = thumb.querySelector('img');
    if (img) {
        img.src = dataUrl;
    } else {
        img = document.createElement('img');
        img.src = dataUrl;
        img.alt = '';
        img.loading = 'lazy';
        thumb.insertBefore(img, thumb.firstChild);
    }
}

function _startMissingThumbnailBackfill() {
    if (_thumbBackfillQueue) return;
    var missing = _projects.filter(function(p) { return !p.thumbnail; });
    if (!missing.length) return;

    _thumbBackfillQueue = missing.slice();
    if (!_thumbBackfillIframe) {
        _thumbBackfillIframe = document.createElement('iframe');
        _thumbBackfillIframe.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;left:-9999px;border:0;';
        _thumbBackfillIframe.setAttribute('aria-hidden', 'true');
        document.body.appendChild(_thumbBackfillIframe);
    }

    if (!window._thumbBackfillListener) {
        window._thumbBackfillListener = true;
        window.addEventListener('message', function(e) {
            if (!e.data || e.data.type !== 'project-thumbnail') return;
            var id = e.data.id;
            var thumb = e.data.thumbnail;
            var proj = _projects.find(function(x) { return x.id === id; });
            if (proj) proj.thumbnail = thumb;
            _updateProjectCardThumb(id, thumb);
            clearTimeout(_thumbBackfillTimer);
            _processNextThumbnailBackfill();
        });
    }

    _processNextThumbnailBackfill();
}

function _processNextThumbnailBackfill() {
    if (!_thumbBackfillQueue || !_thumbBackfillQueue.length) {
        _thumbBackfillQueue = null;
        return;
    }
    var next = _thumbBackfillQueue.shift();
    clearTimeout(_thumbBackfillTimer);
    _thumbBackfillTimer = setTimeout(function() {
        console.warn('[Thumbnails] timeout for project', next.id);
        _processNextThumbnailBackfill();
    }, 18000);
    _thumbBackfillIframe.src = 'index.html?project=' + encodeURIComponent(next.id) + '&thumbOnly=1';
}

// ── New project ───────────────────────────────────────────────────────────────
function newProject() {
    if (_plan.maxProjects !== null && _projects.length >= _plan.maxProjects) {
        showToast('הגעת למגבלת ' + _plan.maxProjects + ' פרויקטים בתוכנית ' + _plan.label, 'error');
        openUpgradeModal();
        return;
    }
    // Open the editor without a project ID — the project will only be created in Supabase
    // when the user explicitly clicks "שמור פרויקט" for the first time.
    window.location.href = 'index.html';
}

// ── Open project ──────────────────────────────────────────────────────────────
function openProject(id) {
    window.location.href = 'index.html?project=' + id;
}

function openLockedProject(id) {
    // Show locked modal with extend option
    var p = _projects.find(function(x) { return x.id === id; });
    if (!p) return;
    document.getElementById('locked-project-name').textContent = _esc(p.name);
    document.getElementById('locked-project-id').value = id;

    var canExtend = _plan.features && _plan.features.canExtendProject;
    document.getElementById('btn-extend-from-lock').style.display = canExtend ? 'flex' : 'none';

    openModal('modal-locked');
}

// ── Extend project ────────────────────────────────────────────────────────────
function extendProject(projectId) {
    document.getElementById('locked-project-id').value = projectId;
    var p = _projects.find(function(x) { return x.id === projectId; });
    if (p) document.getElementById('locked-project-name').textContent = _esc(p.name);
    openModal('modal-locked');
}

async function confirmExtendProject() {
    var projectId = document.getElementById('locked-project-id').value;
    closeModal('modal-locked');
    await GrowPayments.openProjectExtension(projectId);
}

// ── Rename ────────────────────────────────────────────────────────────────────
function startRename(id) {
    var p = _projects.find(function(x) { return x.id === id; });
    _renameId = id;
    document.getElementById('rename-input').value = p ? p.name : '';
    openModal('modal-rename');
    setTimeout(function() { document.getElementById('rename-input').focus(); }, 120);
}

async function confirmRename() {
    var newName = document.getElementById('rename-input').value.trim();
    if (!newName) return;
    closeModal('modal-rename');

    var result = await Projects.rename(_renameId, newName);
    if (result.error) {
        showToast(result.error, 'error');
        return;
    }
    var p = _projects.find(function(x) { return x.id === _renameId; });
    if (p) p.name = newName;
    _renderProjects();
    showToast('שם הפרויקט עודכן', 'success');
}

// ── Delete ────────────────────────────────────────────────────────────────────
function startDelete(id) {
    var p = _projects.find(function(x) { return x.id === id; });
    _deleteId = id;
    document.getElementById('delete-project-name').textContent = p ? p.name : '';
    openModal('modal-delete');
}

async function confirmDelete() {
    closeModal('modal-delete');
    var result = await Projects.delete(_deleteId);
    if (result.error) {
        showToast(result.error, 'error');
        return;
    }
    _projects = _projects.filter(function(p) { return p.id !== _deleteId; });
    _renderProjects();
    _renderPlanBar();
    document.getElementById('page-subtitle').textContent =
        _projects.length === 0
            ? 'אין פרויקטים עדיין'
            : _projects.length + ' פרויקט' + (_projects.length !== 1 ? 'ים' : '');
    showToast('הפרויקט נמחק', 'success');
}

// ── Order status change ───────────────────────────────────────────────────────
function startStatusChange(id) {
    var p = _projects.find(function(x) { return x.id === id; });
    if (!p) return;
    _statusChangeId = id;
    document.getElementById('status-change-project-name').textContent = p.name || '';
    var current = _normalizeOrderStatus(p.order_status);
    document.querySelectorAll('#status-options .status-option').forEach(function(btn) {
        btn.classList.toggle('selected', btn.dataset.status === current);
    });
    openModal('modal-status');
}

async function confirmStatusChange(status) {
    if (!_statusChangeId) return;
    status = _normalizeOrderStatus(status);
    closeModal('modal-status');

    var result = await Projects.updateOrderStatus(_statusChangeId, status);
    if (result.error) {
        showToast(result.error, 'error');
        return;
    }
    var p = _projects.find(function(x) { return x.id === _statusChangeId; });
    if (p) p.order_status = status;
    _renderProjects();
    showToast('סטטוס ההזמנה עודכן — ' + _orderStatusLabel(status), 'success');
    _statusChangeId = null;
}

// ── Upgrade modal ─────────────────────────────────────────────────────────────
function openUpgradeModal() {
    var container = document.getElementById('upgrade-plans-container');
    container.innerHTML = '';
    _selectedUpgradePlan = null;

    // Group plans by userType
    var groups = {};
    _UPGRADE_PLANS.forEach(function(plan) {
        if (plan.key === _plan.key) return; // skip current plan
        if (!groups[plan.userType]) groups[plan.userType] = [];
        groups[plan.userType].push(plan);
    });

    var typeOrder = ['designer', 'carpenter', 'company'];
    typeOrder.forEach(function(type) {
        if (!groups[type] || groups[type].length === 0) return;

        var section = document.createElement('div');
        section.className = 'upgrade-section';

        var heading = document.createElement('div');
        heading.className = 'upgrade-section-title';
        heading.textContent = _USER_TYPE_LABELS[type] || type;
        section.appendChild(heading);

        var grid = document.createElement('div');
        grid.className = 'plans-grid';

        groups[type].forEach(function(plan) {
            var maxProjText = plan.maxProjects === null ? 'ללא הגבלה' : 'עד ' + plan.maxProjects + ' פרויקטים';
            var card = document.createElement('div');
            card.className  = 'plan-card';
            card.dataset.key = plan.key;
            card.innerHTML =
                '<div class="plan-name">' + plan.label + '</div>' +
                '<div class="plan-price">' + plan.price + '</div>' +
                '<div class="plan-limit">' + maxProjText + '</div>' +
                '<div class="plan-desc">' + plan.desc + '</div>';
            card.onclick = function() {
                container.querySelectorAll('.plan-card').forEach(function(c) { c.classList.remove('selected'); });
                card.classList.add('selected');
                _selectedUpgradePlan = plan.key;
            };
            grid.appendChild(card);
        });

        section.appendChild(grid);
        container.appendChild(section);
    });

    openModal('modal-upgrade');
}

async function goUpgrade() {
    if (!_selectedUpgradePlan) {
        showToast('בחר תוכנית תחילה', 'error');
        return;
    }
    closeModal('modal-upgrade');
    await GrowPayments.startTrial(_selectedUpgradePlan);
}

// ── Device management ─────────────────────────────────────────────────────────
async function _loadDevices() {
    var list = await Auth.listDevices();
    _devicesList = list;
    _renderDevices();
}

function _renderDevices() {
    var container = document.getElementById('devices-list');
    if (!container) return;

    var activeCount = _devicesList.filter(function(d) { return d.is_active; }).length;
    document.getElementById('devices-count').textContent =
        activeCount + ' / ' + _plan.maxDevices + ' מכשירים פעילים';

    if (_devicesList.length === 0) {
        container.innerHTML = '<div class="devices-empty">אין מכשירים רשומים עדיין</div>';
        return;
    }

    container.innerHTML = '';
    _devicesList.forEach(function(device) {
        var row = document.createElement('div');
        row.className = 'device-row' + (device.is_active ? '' : ' inactive');

        var lastSeen = _formatDate(device.last_seen);
        var statusBadge = device.is_active
            ? '<span class="device-status active">פעיל</span>'
            : '<span class="device-status inactive">מושבת</span>';

        row.innerHTML =
            '<div class="device-info">' +
                '<div class="device-name"><i class="fa-solid fa-desktop"></i> ' + _esc(device.device_name || 'מכשיר לא ידוע') + '</div>' +
                '<div class="device-meta">נראה לאחרונה: ' + lastSeen + '</div>' +
            '</div>' +
            statusBadge +
            (device.is_active
                ? '<button class="btn-device-deactivate" onclick="deactivateDevice(\'' + device.id + '\')" title="השבת מכשיר">' +
                    '<i class="fa-solid fa-ban"></i></button>'
                : '');

        container.appendChild(row);
    });
}

async function deactivateDevice(deviceId) {
    var result = await Auth.deactivateDevice(deviceId);
    if (result.error) {
        showToast(result.error, 'error');
        return;
    }
    showToast('המכשיר הושבת', 'success');
    await _loadDevices();
}

function openDevicesModal() {
    _renderDevicesModal();
    openModal('modal-devices');
}

function _renderDevicesModal() {
    var container = document.getElementById('modal-devices-list');
    if (!container) return;

    if (_devicesList.length === 0) {
        container.innerHTML = '<div class="devices-empty">אין מכשירים רשומים עדיין</div>';
        return;
    }

    container.innerHTML = '';
    _devicesList.forEach(function(device) {
        var row = document.createElement('div');
        row.className = 'device-row' + (device.is_active ? '' : ' inactive');

        var lastSeen = _formatDate(device.last_seen);
        var statusBadge = device.is_active
            ? '<span class="device-status active">פעיל</span>'
            : '<span class="device-status inactive">מושבת</span>';

        row.innerHTML =
            '<div class="device-info">' +
                '<div class="device-name"><i class="fa-solid fa-desktop"></i> ' + _esc(device.device_name || 'מכשיר לא ידוע') + '</div>' +
                '<div class="device-meta">נראה לאחרונה: ' + lastSeen + '</div>' +
            '</div>' +
            statusBadge +
            (device.is_active
                ? '<button class="btn-device-deactivate" onclick="deactivateDeviceFromModal(\'' + device.id + '\')" title="השבת מכשיר">' +
                    '<i class="fa-solid fa-ban"></i></button>'
                : '');

        container.appendChild(row);
    });
}

async function deactivateDeviceFromModal(deviceId) {
    var result = await Auth.deactivateDevice(deviceId);
    if (result.error) {
        showToast(result.error, 'error');
        return;
    }
    showToast('המכשיר הושבת', 'success');
    await _loadDevices();
    _renderDevicesModal();
}

// ── Modal helpers ─────────────────────────────────────────────────────────────
function openModal(id) {
    document.getElementById(id).classList.add('open');
}
function closeModal(id) {
    document.getElementById(id).classList.remove('open');
}

// Close modal on overlay click
document.addEventListener('click', function(e) {
    if (e.target.classList.contains('modal-overlay')) {
        e.target.classList.remove('open');
    }
});

// ── Toast ─────────────────────────────────────────────────────────────────────
function showToast(msg, type) {
    type = type || 'success';
    var toast = document.getElementById('toast');
    var icon  = document.getElementById('toast-icon');
    document.getElementById('toast-text').textContent = msg;
    icon.className = type === 'error'
        ? 'fa-solid fa-circle-exclamation'
        : 'fa-solid fa-circle-check';
    toast.className = 'toast ' + type + ' show';
    clearTimeout(_toastTimer);
    _toastTimer = setTimeout(function() {
        toast.className = 'toast ' + type;
    }, 3500);
}

// ── Utility helpers ───────────────────────────────────────────────────────────
function _initials(name) {
    if (!name) return '?';
    var parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return name.slice(0, 2).toUpperCase();
}

function _esc(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function _formatDate(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    var now = new Date();
    var diffMs = now - d;
    var diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1)  return 'עכשיו';
    if (diffMin < 60) return 'לפני ' + diffMin + ' דקות';
    var diffH = Math.floor(diffMin / 60);
    if (diffH < 24)   return 'לפני ' + diffH + ' שעות';
    var diffD = Math.floor(diffH / 24);
    if (diffD < 7)    return 'לפני ' + diffD + ' ימים';
    return d.toLocaleDateString('he-IL', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ══════════════════════════════════════════════════════════════════════════════
// USER PANEL — Tab switching, Profile, Pricing
// ══════════════════════════════════════════════════════════════════════════════

var _currentUser = null;
var _userProfile = null;
var _pricingCfg  = null;

var _PP_DEFAULTS = {
    pricingMode:'ranges',sqmPrice:800,sqmPriceNonMel:1040,lmPrice:1200,lmPriceNonMel:1560,
    lmHeightBase:1200,lmHeightBaseNonMel:1560,lmHeightThresholdCm:240,lmHeightStepCm:30,lmHeightStepPct:0.10,
    materialsBoardPrice:180,materialsBoardsPerSqm:1.4,materialsMultiplier:2.5,profitMultiplier:1.7,
    heightSurcharge:0.20,depthSurcharge:0.20,sandwichSurcharge:0.15,
    installPricePerUnit:110,installUnitCm:42.5,installHeightSurcharge:0.20,
    ranges:{
        ab2:     {melamine:{80:1004,120:1507,160:2009,200:2511,240:3013},nonMelamine:{80:1305,120:1959,160:2612,200:3265,240:3918}},
        c9:      {melamine:{80:970, 120:1340,160:1500,200:1870,240:2250},nonMelamine:{80:1250,120:1600,160:1945,200:2433,240:2920}},
        regalim: {melamine:{80:1050,120:1462,160:1658,200:2073,240:2487},nonMelamine:{80:1360,120:1900,160:2155,200:2700,240:3233}},
        maya:    {melamine:{80:1050,120:1462,160:1658,200:2073,240:2487},nonMelamine:{80:1360,120:1900,160:2155,200:2700,240:3233}}
    },
    extras:{internalDrawer:150,externalDrawer:200,openCell:400,partition:150,shelfFreePerMeter:3,
        extraShelfMel:60,extraShelfNonMel:80,deskUnit:900,doorFramedMel:80,doorGlassMel:400,
        doorGlassBlack:600,doorMirror:350,upperUnit160:600,upperUnit240:900,upperUnitPerCm:3.75,
        cornerDrawers3:832,cornerDrawers4:907,cornerDrawerExtra:200,cornerDesk:900,
        fullCornerBase:2800,fullCornerShelf:120,wingConnection:400,sideCabMel:12,sideCabNonMel:15,
        sideCabDoors:300,slidingBase:800,slidingDoor:350,slidingGlass:200,slidingMirror:350,
        slidingGold:80,slidingBlack:50,slidingHeightSurcharge:0.15,nickelLegPrice:100}
};

// ── Tab switching ─────────────────────────────────────────────────────────────
function switchPage(page) {
    // Update sidebar nav
    ['projects','profile','pricing','renders'].forEach(function(p) {
        var el = document.getElementById('nav-' + p);
        if (el) el.classList.toggle('active', p === page);
    });
    // Show/hide tabs
    ['projects','profile','pricing','renders'].forEach(function(p) {
        var tab = document.getElementById('tab-' + p);
        if (tab) tab.classList.toggle('active', p === page);
    });
    // Update hero
    var heroTitle = document.getElementById('hero-title');
    var heroRight = document.getElementById('hero-right');
    var heroStats = document.getElementById('hero-stats');
    var planBar   = document.getElementById('plan-bar');
    if (page === 'projects') {
        if (heroTitle) heroTitle.textContent = 'הפרויקטים שלי';
        if (heroRight) heroRight.style.display = '';
        if (heroStats) heroStats.style.display = '';
        if (planBar)   planBar.style.display = 'flex';
    } else if (page === 'profile') {
        if (heroTitle) heroTitle.textContent = 'הפרופיל שלי';
        if (heroRight) heroRight.style.display = 'none';
        if (heroStats) heroStats.style.display = 'none';
        if (planBar)   planBar.style.display = 'none';
        _loadProfileForm();
    } else if (page === 'pricing') {
        if (heroTitle) heroTitle.textContent = 'הגדרות תמחור';
        if (heroRight) heroRight.style.display = 'none';
        if (heroStats) heroStats.style.display = 'none';
        if (planBar)   planBar.style.display = 'none';
        _loadPricingForm();
    } else if (page === 'renders') {
        if (heroTitle) heroTitle.textContent = 'הדמיות פוטוריאליסטיות';
        if (heroRight) heroRight.style.display = 'none';
        if (heroStats) heroStats.style.display = 'none';
        if (planBar)   planBar.style.display = 'none';
        _loadAllRendersGallery();
    }
    // Check URL hash
    if (history.replaceState) history.replaceState(null, '', page === 'projects' ? 'projects.html' : 'projects.html#' + page);
}

// ── AI Renders gallery (all renders for user) ─────────────────────────────────
var _RENDER_DELETE_URL = 'https://meqxnsjycvfgfhdepguo.supabase.co/functions/v1/delete-render';

function _projectsSupabase() {
    return supabase.createClient(
        'https://meqxnsjycvfgfhdepguo.supabase.co',
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1lcXhuc2p5Y3ZmZ2ZoZGVwZ3VvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY3MDA5NDAsImV4cCI6MjA5MjI3Njk0MH0.w63bl0-1-Rgt9Nx6sVW5ueEGMojiMaxoehlPXlPH2N0'
    );
}

async function _deleteAiRenderFromServer(renderId) {
    var sb = _projectsSupabase();
    var sessionRes = await sb.auth.getSession();
    var session = sessionRes.data && sessionRes.data.session;
    if (!session) throw new Error('לא מחובר');

    var res = await fetch(_RENDER_DELETE_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + session.access_token,
        },
        body: JSON.stringify({ id: renderId }),
    });
    var data = await res.json();
    if (!res.ok) throw new Error(data.error || 'מחיקה נכשלה');
    return data;
}

window._deleteGalleryRender = async function(renderId, ev) {
    if (ev) { ev.preventDefault(); ev.stopPropagation(); }
    if (!confirm('למחוק הדמיה זו לצמיתות מהשרת?')) return;
    try {
        await _deleteAiRenderFromServer(renderId);
        await _loadAllRendersGallery();
    } catch (e) {
        alert('שגיאה במחיקה: ' + (e.message || e));
    }
};

window._deleteGalleryLightboxRender = async function() {
    var renders = window._galleryRenders || [];
    var idx = window._galleryLightboxIdx || 0;
    var r = renders[idx];
    if (!r || !r.id) return;
    if (!confirm('למחוק הדמיה זו לצמיתות מהשרת?')) return;
    try {
        await _deleteAiRenderFromServer(r.id);
        window._closeGalleryLightbox();
        await _loadAllRendersGallery();
    } catch (e) {
        alert('שגיאה במחיקה: ' + (e.message || e));
    }
};

async function _loadAllRendersGallery() {
    var grid = document.getElementById('renders-gallery-grid');
    var quota = document.getElementById('renders-quota-text');
    if (!grid) return;

    grid.innerHTML = '<div style="text-align:center;padding:60px;color:#94a3b8;"><i class="fa-solid fa-spinner fa-spin" style="font-size:2rem;"></i></div>';

    try {
        var sb = _projectsSupabase();
        var { data: { user } } = await sb.auth.getUser();
        if (!user) return;

        // Load all renders + project names
        var { data: renders, error } = await sb
            .from('ai_renders')
            .select('id, image_url, hex_color, created_at, project_id')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false });

        if (error) throw error;

        // Load quota
        var { data: countData } = await sb.rpc('get_ai_renders_count_this_month', { p_user_id: user.id });
        var used = countData ?? 0;
        if (quota) quota.textContent = 'השתמשת ב-' + used + ' מתוך 50 הדמיות החודש';

        if (!renders || !renders.length) {
            grid.innerHTML = '<div style="text-align:center;padding:80px 20px;color:#94a3b8;">' +
                '<i class="fa-solid fa-wand-magic-sparkles" style="font-size:3rem;opacity:0.3;display:block;margin-bottom:16px;"></i>' +
                '<div style="font-size:1rem;font-weight:600;margin-bottom:8px;">אין הדמיות עדיין</div>' +
                '<div style="font-size:0.85rem;">פתח פרויקט ולחץ על כפתור ✨ הדמיה ליצירת הדמיה ראשונה</div>' +
                '</div>';
            return;
        }

        // Load project names
        var projectIds = [...new Set(renders.filter(function(r) { return r.project_id; }).map(function(r) { return r.project_id; }))];
        var projectNames = {};
        if (projectIds.length) {
            var { data: projects } = await sb.from('projects').select('id,name').in('id', projectIds);
            if (projects) projects.forEach(function(p) { projectNames[p.id] = p.name; });
        }

        grid.innerHTML = '';
        renders.forEach(function(r, i) {
            var projName = r.project_id ? (projectNames[r.project_id] || 'פרויקט') : '';
            var date = new Date(r.created_at).toLocaleDateString('he-IL', { day:'2-digit', month:'2-digit', year:'2-digit' });
            var card = document.createElement('div');
            card.className = 'renders-gallery-card';
            card.innerHTML =
                '<img src="' + r.image_url + '" loading="lazy" onclick="window._openGalleryLightbox(' + i + ')" alt="הדמיה">' +
                '<div class="renders-gallery-card-info">' +
                    (projName ? '<span class="renders-gallery-proj">' + projName + '</span>' : '') +
                    '<span class="renders-gallery-date">' + date + '</span>' +
                    '<a href="' + r.image_url + '" target="_blank" download class="renders-gallery-dl" title="הורד" onclick="event.stopPropagation()"><i class="fa-solid fa-download"></i></a>' +
                    '<button type="button" class="renders-gallery-del" title="מחק מהשרת" onclick="window._deleteGalleryRender(\'' + r.id + '\', event)"><i class="fa-solid fa-trash"></i></button>' +
                '</div>';
            grid.appendChild(card);
        });

        // Simple lightbox for gallery
        window._galleryRenders = renders;
        window._galleryLightboxIdx = 0;
        window._openGalleryLightbox = function(idx) {
            window._galleryLightboxIdx = idx;
            var lb = document.getElementById('gallery-lightbox');
            var img = document.getElementById('gallery-lightbox-img');
            var dl = document.getElementById('gallery-lightbox-download');
            if (lb && img) {
                img.src = renders[idx].image_url;
                if (dl) dl.href = renders[idx].image_url;
                lb.style.display = 'flex';
            }
        };
        window._closeGalleryLightbox = function() {
            var lb = document.getElementById('gallery-lightbox');
            if (lb) lb.style.display = 'none';
        };

    } catch(e) {
        console.error('[renders gallery]', e);
        grid.innerHTML = '<div style="text-align:center;padding:40px;color:#ef4444;">שגיאה בטעינת הגלריה</div>';
    }
}

// ── Profile: load & save ──────────────────────────────────────────────────────
async function _loadProfileForm() {
    try {
        var sb = supabase.createClient(
            'https://meqxnsjycvfgfhdepguo.supabase.co',
            'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1lcXhuc2p5Y3ZmZ2ZoZGVwZ3VvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY3MDA5NDAsImV4cCI6MjA5MjI3Njk0MH0.w63bl0-1-Rgt9Nx6sVW5ueEGMojiMaxoehlPXlPH2N0'
        );
        var { data: { user } } = await sb.auth.getUser();
        if (!user) return;
        _currentUser = user;

        // Load profile row
        var { data: profile } = await sb.from('profiles').select('*').eq('id', user.id).single();
        _userProfile = profile || {};

        // Fill personal info
        var fullName = (_userProfile.full_name) || (user.user_metadata && user.user_metadata.full_name) || '';
        document.getElementById('prof-full-name').value  = fullName;
        document.getElementById('prof-phone').value      = _userProfile.phone || '';
        document.getElementById('prof-email').value      = user.email || '';

        // Avatar
        var avatarBig  = document.getElementById('profile-avatar-big');
        var avatarName = document.getElementById('profile-avatar-name');
        var avatarEmail= document.getElementById('profile-avatar-email');
        if (avatarBig)   avatarBig.textContent   = _initials(fullName || user.email || '?');
        if (avatarName)  avatarName.textContent   = fullName || user.email || '—';
        if (avatarEmail) avatarEmail.textContent  = user.email || '';

        // Business info
        var biz = _userProfile.business_info || {};
        document.getElementById('prof-business-name').value  = biz.name || '';
        document.getElementById('prof-business-type').value  = biz.type || '';
        document.getElementById('prof-tax-id').value         = biz.taxId || '';
        document.getElementById('prof-address').value        = biz.address || '';
        document.getElementById('prof-website').value        = biz.website || '';
        document.getElementById('prof-bio').value            = biz.bio || '';

        // Logo — from profiles.logo_url (direct storage) or legacy business_info.logoUrl
        var logoUrl = (_userProfile.logo_url) || biz.logoUrl || '';
        document.getElementById('prof-logo-url').value = logoUrl;
        _updateLogoPreview(logoUrl);

        // Subscription section
        _loadSubscriptionSection(profile);
    } catch(e) {
        showToast('שגיאה בטעינת פרופיל: ' + e.message, 'error');
    }
}

// ── Subscription management section in profile tab ───────────────────────────
function _loadSubscriptionSection(profile) {
    var section = document.getElementById('subscription-section');
    if (!section || !profile) return;

    var status = profile.subscription_status || '';
    var plan   = profile.plan || '';

    // Only show section for paid/cancelled subscriptions (not trial/free)
    var showSection = (status === 'active' || status === 'cancelled');
    section.style.display = showSection ? '' : 'none';
    if (!showSection) return;

    // Plan label
    var PLAN_NAMES = {
        designer_monthly: 'מעצב — חודשי',
        designer_annual:  'מעצב — שנתי',
        carpenter_basic:  'נגר — בסיסי',
        carpenter_pro:    'נגר — פרו',
        company_standard: 'חברה — סטנדרט',
        company_enterprise: 'חברה — אנטרפרייז'
    };
    var planLabel = document.getElementById('sub-plan-label');
    if (planLabel) planLabel.textContent = PLAN_NAMES[plan] || plan || '—';

    // Status badge
    var badge = document.getElementById('sub-status-badge');
    if (badge) {
        if (status === 'active') {
            badge.textContent = 'פעיל';
            badge.style.background = 'rgba(16,185,129,.15)';
            badge.style.color = '#059669';
        } else if (status === 'cancelled') {
            badge.textContent = 'בוטל';
            badge.style.background = 'rgba(239,68,68,.12)';
            badge.style.color = '#dc2626';
        }
    }

    // Period end date
    var endsRow   = document.getElementById('sub-ends-row');
    var endsLabel = document.getElementById('sub-ends-label');
    if (profile.subscription_ends_at && endsRow && endsLabel) {
        var endsDate = new Date(profile.subscription_ends_at);
        var isAnnual = plan && plan.indexOf('annual') !== -1;
        var prefix   = status === 'cancelled'
            ? 'גישה עד: '
            : (isAnnual ? 'חידוש שנתי ב: ' : 'חידוש חודשי ב: ');
        endsLabel.textContent = prefix + _formatDate(profile.subscription_ends_at);
        endsRow.style.display = '';
    } else if (endsRow) {
        endsRow.style.display = 'none';
    }

    // Show/hide cancel button vs cancelled notice
    var cancelWrap    = document.getElementById('sub-cancel-wrap');
    var cancelledNote = document.getElementById('sub-cancelled-notice');
    if (status === 'active') {
        if (cancelWrap)    cancelWrap.style.display    = '';
        if (cancelledNote) cancelledNote.style.display = 'none';
    } else {
        if (cancelWrap)    cancelWrap.style.display    = 'none';
        if (cancelledNote) cancelledNote.style.display = '';
    }
}

// ── Cancel subscription handler ───────────────────────────────────────────────
async function cancelSubscription() {
    // Confirmation dialog
    if (!confirm('האם אתה בטוח שברצונך לבטל את המנוי?\n\nהחיוב הבא יבוטל, אך תוכל להמשיך להשתמש במערכת עד סוף תקופת המנוי הנוכחית.')) {
        return;
    }

    var btn = document.getElementById('btn-cancel-sub');
    if (btn) { btn.disabled = true; btn.textContent = 'מבטל...'; }

    try {
        var result = await Auth.cancelSubscription();
        if (result && result.error) throw new Error(result.error);

        showToast('המנוי בוטל בהצלחה. הגישה תישמר עד סוף תקופת המנוי.', 'success');

        // Refresh subscription section UI
        var profile = await Auth.getProfile();
        _loadSubscriptionSection(profile);
    } catch(e) {
        showToast('שגיאה בביטול המנוי: ' + e.message, 'error');
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-ban"></i> בטל מנוי'; }
    }
}

async function savePersonalInfo() {
    try {
        var sb = supabase.createClient(
            'https://meqxnsjycvfgfhdepguo.supabase.co',
            'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1lcXhuc2p5Y3ZmZ2ZoZGVwZ3VvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY3MDA5NDAsImV4cCI6MjA5MjI3Njk0MH0.w63bl0-1-Rgt9Nx6sVW5ueEGMojiMaxoehlPXlPH2N0'
        );
        var { data: { user } } = await sb.auth.getUser();
        if (!user) return;
        var fullName = document.getElementById('prof-full-name').value.trim();
        var phone    = document.getElementById('prof-phone').value.trim();
        // Update auth metadata
        await sb.auth.updateUser({ data: { full_name: fullName } });
        // Update profiles table
        var { error } = await sb.from('profiles').update({ full_name: fullName, phone: phone }).eq('id', user.id);
        if (error) throw error;
        // Update sidebar display
        document.getElementById('user-name').textContent = fullName || user.email;
        document.getElementById('user-avatar').textContent = _initials(fullName || user.email);
        document.getElementById('profile-avatar-big').textContent = _initials(fullName || user.email);
        document.getElementById('profile-avatar-name').textContent = fullName || user.email;
        showToast('הפרטים האישיים עודכנו ✓', 'success');
    } catch(e) {
        showToast('שגיאה: ' + e.message, 'error');
    }
}

async function savePassword() {
    var newPw  = document.getElementById('prof-new-password').value;
    var confPw = document.getElementById('prof-confirm-password').value;
    if (!newPw) { showToast('יש להזין סיסמה חדשה', 'error'); return; }
    if (newPw.length < 6) { showToast('הסיסמה חייבת להכיל לפחות 6 תווים', 'error'); return; }
    if (newPw !== confPw) { showToast('הסיסמאות אינן תואמות', 'error'); return; }
    try {
        var sb = supabase.createClient(
            'https://meqxnsjycvfgfhdepguo.supabase.co',
            'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1lcXhuc2p5Y3ZmZ2ZoZGVwZ3VvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY3MDA5NDAsImV4cCI6MjA5MjI3Njk0MH0.w63bl0-1-Rgt9Nx6sVW5ueEGMojiMaxoehlPXlPH2N0'
        );
        var { error } = await sb.auth.updateUser({ password: newPw });
        if (error) throw error;
        document.getElementById('prof-new-password').value = '';
        document.getElementById('prof-confirm-password').value = '';
        showToast('הסיסמה עודכנה בהצלחה ✓', 'success');
    } catch(e) {
        showToast('שגיאה: ' + e.message, 'error');
    }
}

async function saveBusinessInfo() {
    try {
        var sb = supabase.createClient(
            'https://meqxnsjycvfgfhdepguo.supabase.co',
            'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1lcXhuc2p5Y3ZmZ2ZoZGVwZ3VvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY3MDA5NDAsImV4cCI6MjA5MjI3Njk0MH0.w63bl0-1-Rgt9Nx6sVW5ueEGMojiMaxoehlPXlPH2N0'
        );
        var { data: { user } } = await sb.auth.getUser();
        if (!user) return;
        // Upload logo file if selected
        var logoFile = document.getElementById('prof-logo-file') && document.getElementById('prof-logo-file').files[0];
        var logoUrl  = document.getElementById('prof-logo-url').value.trim();
        if (logoFile) {
            var statusEl = document.getElementById('logo-upload-status');
            if (statusEl) statusEl.innerHTML = '<span style="color:#2563eb;">מעלה לוגו...</span>';
            var ext  = logoFile.name.split('.').pop().toLowerCase();
            var path = user.id + '/logo.' + ext;
            var { error: upErr } = await sb.storage.from('logos').upload(path, logoFile, { upsert: true, contentType: logoFile.type });
            if (upErr) throw upErr;
            var { data: urlData } = sb.storage.from('logos').getPublicUrl(path);
            logoUrl = urlData.publicUrl + '?t=' + Date.now(); // bust cache
            document.getElementById('prof-logo-url').value = logoUrl;
            _updateLogoPreview(logoUrl);
            if (statusEl) statusEl.innerHTML = '';
            document.getElementById('prof-logo-file').value = '';
        }

        var biz = {
            name:    document.getElementById('prof-business-name').value.trim(),
            type:    document.getElementById('prof-business-type').value,
            taxId:   document.getElementById('prof-tax-id').value.trim(),
            address: document.getElementById('prof-address').value.trim(),
            website: document.getElementById('prof-website').value.trim(),
            bio:     document.getElementById('prof-bio').value.trim()
        };
        var { error } = await sb.from('profiles').update({ business_info: biz, logo_url: logoUrl || null }).eq('id', user.id);
        if (error) throw error;
        window._userLogoUrl = logoUrl || null; // update global for print functions
        showToast('פרטי העסק נשמרו ✓', 'success');
    } catch(e) {
        showToast('שגיאה: ' + e.message, 'error');
    }
}

// ── Logo upload helpers ───────────────────────────────────────────────────────
function _updateLogoPreview(url) {
    var img  = document.getElementById('logo-preview-img');
    var icon = document.getElementById('logo-preview-icon');
    var rmBtn = document.getElementById('logo-remove-btn');
    if (!img) return;
    if (url) {
        img.src = url; img.style.display = 'block';
        if (icon)  icon.style.display  = 'none';
        if (rmBtn) rmBtn.style.display = 'inline-flex';
    } else {
        img.src = ''; img.style.display = 'none';
        if (icon)  icon.style.display  = '';
        if (rmBtn) rmBtn.style.display = 'none';
    }
}

function previewLogo(input) {
    var file = input.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { showToast('הקובץ גדול מדי — מקסימום 2MB', 'error'); input.value = ''; return; }
    var reader = new FileReader();
    reader.onload = function(e) { _updateLogoPreview(e.target.result); };
    reader.readAsDataURL(file);
}

async function removeLogo() {
    if (!confirm('להסיר את הלוגו?')) return;
    document.getElementById('prof-logo-url').value = '';
    _updateLogoPreview('');
    var fileInp = document.getElementById('prof-logo-file');
    if (fileInp) fileInp.value = '';
    // Save empty logo_url immediately
    try {
        var sb = supabase.createClient(
            'https://meqxnsjycvfgfhdepguo.supabase.co',
            'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1lcXhuc2p5Y3ZmZ2ZoZGVwZ3VvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY3MDA5NDAsImV4cCI6MjA5MjI3Njk0MH0.w63bl0-1-Rgt9Nx6sVW5ueEGMojiMaxoehlPXlPH2N0'
        );
        var { data: { user } } = await sb.auth.getUser();
        if (user) await sb.from('profiles').update({ logo_url: null }).eq('id', user.id);
        window._userLogoUrl = null;
        showToast('הלוגו הוסר', 'success');
    } catch(e) { showToast('שגיאה: ' + e.message, 'error'); }
}

// ── Pricing panel ─────────────────────────────────────────────────────────────
function _ppPct(v) { return Math.round((v || 0) * 100); }
function _ppFrac(v) { return (parseFloat(v) || 0) / 100; }
function _ppVal(id) { var el = document.getElementById(id); return el ? el.value : ''; }
function _ppSet(id, v) { var el = document.getElementById(id); if (el) el.value = v; }

async function _loadPricingForm() {
    try {
        var sb = supabase.createClient(
            'https://meqxnsjycvfgfhdepguo.supabase.co',
            'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1lcXhuc2p5Y3ZmZ2ZoZGVwZ3VvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY3MDA5NDAsImV4cCI6MjA5MjI3Njk0MH0.w63bl0-1-Rgt9Nx6sVW5ueEGMojiMaxoehlPXlPH2N0'
        );
        var { data: { user } } = await sb.auth.getUser();
        if (!user) return;
        var { data: row } = await sb.from('pricing_configs').select('config').eq('user_id', user.id).single();
        _pricingCfg = (row && row.config && Object.keys(row.config).length > 0) ? row.config : null;
        _fillPricingPanel(_pricingCfg || _PP_DEFAULTS);
    } catch(e) {
        _fillPricingPanel(_PP_DEFAULTS);
    }
}

function ppSetMode(mode) {
    document.querySelectorAll('.pp-mode-btn').forEach(function(b) {
        b.classList.toggle('active', b.getAttribute('data-mode') === mode);
    });
    document.querySelectorAll('.pp-mode-section').forEach(function(s) {
        s.classList.toggle('visible', s.id === 'pp-mode-' + mode);
    });
}

function _ppBuildRangesTable(ranges) {
    var tbody = document.getElementById('pp-ranges-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    var r = ranges || _PP_DEFAULTS.ranges;
    var keys = Object.keys(r);
    if (!keys.length) { _ppAddRangeRowData('maya', 80, 0, 0); return; }
    keys.forEach(function(model) {
        var entry = r[model];
        // Real format: { melamine: {80:price,...}, nonMelamine: {80:price,...} }
        var mel = entry.melamine || {};
        var nonMel = entry.nonMelamine || {};
        var widths = Object.keys(mel).length ? Object.keys(mel) : Object.keys(nonMel);
        if (!widths.length) { _ppAddRangeRowData(model, 80, 0, 0); return; }
        widths.forEach(function(w) {
            _ppAddRangeRowData(model, parseInt(w), mel[w] || 0, nonMel[w] || 0);
        });
    });
}

function _ppAddRangeRowData(model, width, melVal, nonMelVal) {
    var tbody = document.getElementById('pp-ranges-tbody');
    if (!tbody) return;
    var tr = document.createElement('tr');
    var modelOpts = ['ab2','c9','regalim','maya','other'];
    var modelLabels = {ab2:'AB2',c9:'C9',regalim:'רגלים',maya:'מאיה',other:'אחר'};
    var selectHtml = '<select class="pp-input" style="width:100%;padding:4px 6px;font-size:.82rem;">';
    modelOpts.forEach(function(m) {
        selectHtml += '<option value="' + m + '"' + (model===m?' selected':'') + '>' + modelLabels[m] + '</option>';
    });
    selectHtml += '</select>';
    tr.innerHTML =
        '<td style="padding:4px 6px;">' + selectHtml + '</td>' +
        '<td style="padding:4px 6px;"><input type="number" class="pp-input" style="width:100%;padding:4px 6px;font-size:.82rem;" value="' + (width||80) + '" placeholder="רוחב (ס״מ)"></td>' +
        '<td style="padding:4px 6px;"><input type="number" class="pp-input" style="width:100%;padding:4px 6px;font-size:.82rem;" value="' + (melVal||0) + '" placeholder="מחיר מלמין"></td>' +
        '<td style="padding:4px 6px;"><input type="number" class="pp-input" style="width:100%;padding:4px 6px;font-size:.82rem;" value="' + (nonMelVal||0) + '" placeholder="מחיר לא מלמין"></td>' +
        '<td style="padding:4px 6px;text-align:center;"><button onclick="ppDeleteRangeRow(this)" style="background:none;border:none;color:#ef4444;cursor:pointer;font-size:1rem;padding:2px 6px;" title="מחק שורה">&#x2715;</button></td>';
    tbody.appendChild(tr);
}

function ppAddRangeRow() {
    _ppAddRangeRowData('maya', 80, 0, 0);
}

function ppDeleteRangeRow(btn) {
    var tr = btn.closest('tr');
    if (tr) tr.remove();
}

function _ppReadRangesTable() {
    var tbody = document.getElementById('pp-ranges-tbody');
    if (!tbody) return _PP_DEFAULTS.ranges;
    var result = {};
    var rows = tbody.querySelectorAll('tr');
    rows.forEach(function(tr) {
        var cells = tr.querySelectorAll('td');
        if (cells.length < 4) return;
        var sel = cells[0].querySelector('select');
        var model = sel ? sel.value : 'maya';
        var width = parseInt(cells[1].querySelector('input').value) || 80;
        var mel = parseInt(cells[2].querySelector('input').value) || 0;
        var nonMel = parseInt(cells[3].querySelector('input').value) || 0;
        if (!result[model]) result[model] = { melamine: {}, nonMelamine: {} };
        result[model].melamine[width] = mel;
        result[model].nonMelamine[width] = nonMel;
    });
    return result;
}

function _fillPricingPanel(cfg) {
    var c = cfg || _PP_DEFAULTS;
    ppSetMode(c.pricingMode || 'ranges');
    _ppBuildRangesTable(c.ranges);
    _ppSet('pp-sqmPrice', c.sqmPrice || 800);
    _ppSet('pp-sqmPriceNonMel', c.sqmPriceNonMel || 1040);
    _ppSet('pp-lmPrice', c.lmPrice || 1200);
    _ppSet('pp-lmPriceNonMel', c.lmPriceNonMel || 1560);
    _ppSet('pp-lmHeightBase', c.lmHeightBase || 1200);
    _ppSet('pp-lmHeightBaseNonMel', c.lmHeightBaseNonMel || 1560);
    _ppSet('pp-lmHeightThresholdCm', c.lmHeightThresholdCm || 240);
    _ppSet('pp-lmHeightStepCm', c.lmHeightStepCm || 30);
    _ppSet('pp-lmHeightStepPct', _ppPct(c.lmHeightStepPct || 0.10));
    _ppSet('pp-materialsBoardPrice', c.materialsBoardPrice || 180);
    _ppSet('pp-materialsBoardsPerSqm', c.materialsBoardsPerSqm || 1.4);
    _ppSet('pp-materialsMultiplier', c.materialsMultiplier || 2.5);
    _ppSet('pp-profitMultiplier', c.profitMultiplier || 1.7);
    _ppSet('pp-heightSurcharge', _ppPct(c.heightSurcharge || 0.20));
    _ppSet('pp-depthSurcharge', _ppPct(c.depthSurcharge || 0.20));
    _ppSet('pp-sandwichSurcharge', _ppPct(c.sandwichSurcharge || 0.15));
    _ppSet('pp-installPricePerUnit', c.installPricePerUnit || 110);
    _ppSet('pp-installUnitCm', c.installUnitCm || 42.5);
    _ppSet('pp-installHeightSurcharge', _ppPct(c.installHeightSurcharge || 0.20));
    var ex = c.extras || _PP_DEFAULTS.extras;
    _ppSet('pp-internalDrawer', ex.internalDrawer || 150);
    _ppSet('pp-externalDrawer', ex.externalDrawer || 200);
    _ppSet('pp-openCell', ex.openCell || 400);
    _ppSet('pp-partition', ex.partition || 150);
    _ppSet('pp-shelfFreePerMeter', ex.shelfFreePerMeter || 3);
    _ppSet('pp-extraShelfMel', ex.extraShelfMel || 60);
    _ppSet('pp-extraShelfNonMel', ex.extraShelfNonMel || 80);
    _ppSet('pp-deskUnit', ex.deskUnit || 900);
    _ppSet('pp-doorFramedMel', ex.doorFramedMel || 80);
    _ppSet('pp-doorGlassMel', ex.doorGlassMel || 400);
    _ppSet('pp-doorGlassBlack', ex.doorGlassBlack || 600);
    _ppSet('pp-doorMirror', ex.doorMirror || 350);
    _ppSet('pp-upperUnit160', ex.upperUnit160 || 600);
    _ppSet('pp-upperUnit240', ex.upperUnit240 || 900);
    _ppSet('pp-upperUnitPerCm', ex.upperUnitPerCm || 3.75);
    _ppSet('pp-cornerDrawers3', ex.cornerDrawers3 || 832);
    _ppSet('pp-cornerDrawers4', ex.cornerDrawers4 || 907);
    _ppSet('pp-cornerDrawerExtra', ex.cornerDrawerExtra || 200);
    _ppSet('pp-cornerDesk', ex.cornerDesk || 900);
    _ppSet('pp-fullCornerBase', ex.fullCornerBase || 2800);
    _ppSet('pp-fullCornerShelf', ex.fullCornerShelf || 120);
    _ppSet('pp-wingConnection', ex.wingConnection || 400);
    _ppSet('pp-sideCabMel', ex.sideCabMel || 12);
    _ppSet('pp-sideCabNonMel', ex.sideCabNonMel || 15);
    _ppSet('pp-sideCabDoors', ex.sideCabDoors || 300);
    _ppSet('pp-slidingBase', ex.slidingBase || 800);
    _ppSet('pp-slidingDoor', ex.slidingDoor || 350);
    _ppSet('pp-slidingGlass', ex.slidingGlass || 200);
    _ppSet('pp-slidingMirror', ex.slidingMirror || 350);
    _ppSet('pp-slidingGold', ex.slidingGold || 80);
    _ppSet('pp-slidingBlack', ex.slidingBlack || 50);
    _ppSet('pp-slidingHeightSurcharge', _ppPct(ex.slidingHeightSurcharge || 0.15));
    _ppSet('pp-nickelLegPrice', ex.nickelLegPrice || 100);
}

function _readPricingPanel() {
    var activeBtn = document.querySelector('.pp-mode-btn.active');
    var mode = activeBtn ? activeBtn.getAttribute('data-mode') : 'ranges';
    var existing = _pricingCfg || _PP_DEFAULTS;
    return {
        pricingMode: mode,
        sqmPrice: parseInt(_ppVal('pp-sqmPrice')) || 800,
        sqmPriceNonMel: parseInt(_ppVal('pp-sqmPriceNonMel')) || 1040,
        lmPrice: parseInt(_ppVal('pp-lmPrice')) || 1200,
        lmPriceNonMel: parseInt(_ppVal('pp-lmPriceNonMel')) || 1560,
        lmHeightBase: parseInt(_ppVal('pp-lmHeightBase')) || 1200,
        lmHeightBaseNonMel: parseInt(_ppVal('pp-lmHeightBaseNonMel')) || 1560,
        lmHeightThresholdCm: parseInt(_ppVal('pp-lmHeightThresholdCm')) || 240,
        lmHeightStepCm: parseInt(_ppVal('pp-lmHeightStepCm')) || 30,
        lmHeightStepPct: _ppFrac(_ppVal('pp-lmHeightStepPct')),
        materialsBoardPrice: parseInt(_ppVal('pp-materialsBoardPrice')) || 180,
        materialsBoardsPerSqm: parseFloat(_ppVal('pp-materialsBoardsPerSqm')) || 1.4,
        materialsMultiplier: parseFloat(_ppVal('pp-materialsMultiplier')) || 2.5,
        profitMultiplier: parseFloat(_ppVal('pp-profitMultiplier')) || 1.7,
        heightSurcharge: _ppFrac(_ppVal('pp-heightSurcharge')),
        depthSurcharge: _ppFrac(_ppVal('pp-depthSurcharge')),
        sandwichSurcharge: _ppFrac(_ppVal('pp-sandwichSurcharge')),
        installPricePerUnit: parseInt(_ppVal('pp-installPricePerUnit')) || 110,
        installUnitCm: parseFloat(_ppVal('pp-installUnitCm')) || 42.5,
        installHeightSurcharge: _ppFrac(_ppVal('pp-installHeightSurcharge')),
        ranges: _ppReadRangesTable(),
        extras: {
            internalDrawer: parseInt(_ppVal('pp-internalDrawer')) || 150,
            externalDrawer: parseInt(_ppVal('pp-externalDrawer')) || 200,
            openCell: parseInt(_ppVal('pp-openCell')) || 400,
            partition: parseInt(_ppVal('pp-partition')) || 150,
            shelfFreePerMeter: parseFloat(_ppVal('pp-shelfFreePerMeter')) || 3,
            extraShelfMel: parseInt(_ppVal('pp-extraShelfMel')) || 60,
            extraShelfNonMel: parseInt(_ppVal('pp-extraShelfNonMel')) || 80,
            deskUnit: parseInt(_ppVal('pp-deskUnit')) || 900,
            doorFramedMel: parseInt(_ppVal('pp-doorFramedMel')) || 80,
            doorGlassMel: parseInt(_ppVal('pp-doorGlassMel')) || 400,
            doorGlassBlack: parseInt(_ppVal('pp-doorGlassBlack')) || 600,
            doorMirror: parseInt(_ppVal('pp-doorMirror')) || 350,
            upperUnit160: parseInt(_ppVal('pp-upperUnit160')) || 600,
            upperUnit240: parseInt(_ppVal('pp-upperUnit240')) || 900,
            upperUnitPerCm: parseFloat(_ppVal('pp-upperUnitPerCm')) || 3.75,
            cornerDrawers3: parseInt(_ppVal('pp-cornerDrawers3')) || 832,
            cornerDrawers4: parseInt(_ppVal('pp-cornerDrawers4')) || 907,
            cornerDrawerExtra: parseInt(_ppVal('pp-cornerDrawerExtra')) || 200,
            cornerDesk: parseInt(_ppVal('pp-cornerDesk')) || 900,
            fullCornerBase: parseInt(_ppVal('pp-fullCornerBase')) || 2800,
            fullCornerShelf: parseInt(_ppVal('pp-fullCornerShelf')) || 120,
            wingConnection: parseInt(_ppVal('pp-wingConnection')) || 400,
            sideCabMel: parseInt(_ppVal('pp-sideCabMel')) || 12,
            sideCabNonMel: parseInt(_ppVal('pp-sideCabNonMel')) || 15,
            sideCabDoors: parseInt(_ppVal('pp-sideCabDoors')) || 300,
            slidingBase: parseInt(_ppVal('pp-slidingBase')) || 800,
            slidingDoor: parseInt(_ppVal('pp-slidingDoor')) || 350,
            slidingGlass: parseInt(_ppVal('pp-slidingGlass')) || 200,
            slidingMirror: parseInt(_ppVal('pp-slidingMirror')) || 350,
            slidingGold: parseInt(_ppVal('pp-slidingGold')) || 80,
            slidingBlack: parseInt(_ppVal('pp-slidingBlack')) || 50,
            slidingHeightSurcharge: _ppFrac(_ppVal('pp-slidingHeightSurcharge')),
            nickelLegPrice: parseInt(_ppVal('pp-nickelLegPrice')) || 100
        }
    };
}

async function savePricingSettings() {
    try {
        var sb = supabase.createClient(
            'https://meqxnsjycvfgfhdepguo.supabase.co',
            'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1lcXhuc2p5Y3ZmZ2ZoZGVwZ3VvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY3MDA5NDAsImV4cCI6MjA5MjI3Njk0MH0.w63bl0-1-Rgt9Nx6sVW5ueEGMojiMaxoehlPXlPH2N0'
        );
        var { data: { user } } = await sb.auth.getUser();
        if (!user) { showToast('לא מחובר', 'error'); return; }
        var cfg = _readPricingPanel();
        var { error } = await sb.from('pricing_configs').upsert(
            { user_id: user.id, config: cfg, updated_at: new Date().toISOString() },
            { onConflict: 'user_id' }
        );
        if (error) throw error;
        _pricingCfg = cfg;
        showToast('הגדרות התמחור נשמרו ✓', 'success');
    } catch(e) {
        showToast('שגיאה בשמירה: ' + e.message, 'error');
    }
}

function resetPricingToDefaults() {
    _fillPricingPanel(_PP_DEFAULTS);
    showToast('הוחזר לברירת מחדל', 'success');
}

// ── Handle URL hash on load ───────────────────────────────────────────────────
(function() {
    var hash = window.location.hash.replace('#', '');
    if (hash === 'profile' || hash === 'pricing' || hash === 'renders') {
        // Delay to let init() finish
        setTimeout(function() { switchPage(hash); }, 300);
    }
})();
