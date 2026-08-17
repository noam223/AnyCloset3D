// ==========================================
// projects.js — Project Manager Logic
// ==========================================

var _projects            = [];
var _plan                = null;
var _renameId            = null;
var _deleteId            = null;
var _statusChangeId      = null;
var _searchQuery         = '';
var _statusFilter        = 'active'; // main view: quote + measured + ordered
var _selectedUpgradePlan = null;
var _toastTimer          = null;
var _devicesList         = [];
var _measurementInbox    = [];
var _measurementUnread   = 0;
var _linkMeasurementId   = null;
var _measurementChannel  = null;

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

    // WhatsApp measurement inbox badge + realtime
    try {
        await refreshMeasurementUnread();
        if (window.MeasurementInbox && MeasurementInbox.subscribe) {
            _measurementChannel = MeasurementInbox.subscribe(function() {
                refreshMeasurementUnread();
                var modal = document.getElementById('modal-measurements');
                if (modal && modal.classList.contains('open')) refreshMeasurementsInbox();
            });
        }
    } catch (eInbox) {
        console.warn('[init] measurement inbox', eInbox);
    }

    try { await _loadPricingForm(); } catch (ePrice) { console.warn('[init] pricing', ePrice); }
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
    || ['quote', 'measured', 'ordered', 'production', 'service', 'installed'];

function _isActiveOrderStatus(status) {
    return status === 'quote' || status === 'measured' || status === 'ordered';
}

function _orderStatusLabel(status) {
    var map = (window.Projects && Projects.ORDER_STATUSES) || {
        quote: 'הצעת מחיר', measured: 'נשלחה מדידה', ordered: 'נסגרה עסקה',
        production: 'נשלח לייצור', service: 'קריאת שירות', installed: 'התקנה הושלמה'
    };
    return map[status] || map.quote;
}

function _normalizeOrderStatus(status) {
    return _ORDER_STATUS_KEYS.indexOf(status) !== -1 ? status : 'quote';
}

function _statusIconClass(status) {
    var icons = {
        quote: 'fa-file-invoice-dollar',
        measured: 'fa-ruler-combined',
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
        measured: 'נשלחה<br>מדידה',
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
    var st = _normalizeOrderStatus(p.order_status);
    if (_statusFilter === 'active') return _isActiveOrderStatus(st);
    if (_statusFilter === 'all') return true;
    return st === _statusFilter;
}

function _countByStatus(status) {
    return _projects.filter(function(p) {
        return _normalizeOrderStatus(p.order_status) === status;
    }).length;
}

function _syncStatusFilterUI() {
    document.querySelectorAll('#projects-status-filters .status-filter-btn').forEach(function(btn) {
        var key = btn.dataset.status;
        btn.classList.toggle('active', key === _statusFilter);
    });
    var prodCountEl = document.getElementById('filter-count-production');
    if (prodCountEl) {
        var n = _countByStatus('production');
        prodCountEl.textContent = String(n);
        prodCountEl.style.display = n > 0 ? '' : 'none';
    }
}

function setStatusFilterActive() {
    _statusFilter = 'active';
    _syncStatusFilterUI();
    _renderProjects();
}

/** @deprecated use setStatusFilterActive — kept for any leftover onclick */
function setStatusFilterAll() {
    setStatusFilterActive();
}

function setStatusFilter(status) {
    if (_ORDER_STATUS_KEYS.indexOf(status) === -1) return;
    _statusFilter = status;
    _syncStatusFilterUI();
    _renderProjects();
}

async function toggleProjectPin(projectId) {
    var p = _projects.find(function(x) { return x.id === projectId; });
    if (!p) return;
    var next = !p.is_pinned;
    p.is_pinned = next;
    _renderProjects();
    var result = await Projects.setPinned(projectId, next);
    if (result && result.error) {
        p.is_pinned = !next;
        _renderProjects();
        showToast('לא הצלחנו לעדכן נעיצה: ' + result.error, 'error');
        return;
    }
    showToast(next ? 'הפרויקט ננעץ בראש הרשימה' : 'הנעיצה בוטלה', 'success');
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
    _syncStatusFilterUI();

    var visible = _projects.filter(function(p) {
        return _projectMatchesSearch(p) && _projectMatchesStatusFilter(p);
    });
    // Pinned first, then most recently updated
    visible.sort(function(a, b) {
        var ap = a.is_pinned ? 1 : 0;
        var bp = b.is_pinned ? 1 : 0;
        if (ap !== bp) return bp - ap;
        return new Date(b.updated_at || 0) - new Date(a.updated_at || 0);
    });

    var countEl = document.getElementById('content-count');
    if (countEl) {
        var filtered = _statusFilter !== 'active' || _searchQuery;
        var activeCount = _projects.filter(function(p) {
            return _isActiveOrderStatus(_normalizeOrderStatus(p.order_status));
        }).length;
        if (_statusFilter === 'active' && !_searchQuery) {
            countEl.textContent = activeCount + ' פרויקטים פעילים';
        } else if (filtered) {
            countEl.textContent = visible.length + ' מתוך ' + _projects.length + ' פרויקטים';
        } else {
            countEl.textContent = _projects.length + ' פרויקטים';
        }
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
        var emptyHint = _searchQuery
            ? 'נסה חיפוש אחר או נקה את שדה החיפוש'
            : (_statusFilter === 'production'
                ? 'אין הזמנות שנשלחו לייצור'
                : (_statusFilter === 'active'
                    ? 'אין פרויקטים פעילים — בדוק בתוויות "נשלח לייצור" / שירות / התקנה'
                    : 'אין פרויקטים בסטטוס זה'));
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
        card.className  = 'project-card status-' + _normalizeOrderStatus(p.order_status) + (p.is_pinned ? ' is-pinned' : '');
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
        var pinned = !!p.is_pinned;
        var pinBtnHtml =
            '<button type="button" class="project-pin-btn' + (pinned ? ' pinned' : '') + '" ' +
            'onclick="event.stopPropagation(); toggleProjectPin(\'' + p.id + '\')" ' +
            'title="' + (pinned ? 'בטל נעיצה' : 'נעץ בראש הרשימה') + '">' +
            '<i class="fa-' + (pinned ? 'solid' : 'regular') + ' fa-bookmark"></i></button>';
        card.innerHTML =
            '<div class="project-thumb" onclick="' + openFn + '(\'' + p.id + '\')">' +
                thumbHtml +
                statusChipHtml +
                pinBtnHtml +
                '<div class="project-thumb-date"><i class="fa-regular fa-clock" style="margin-left:4px"></i>' + dateStr + '</div>' +
                cabinetBadge +
                (!isLocked ? '<div class="project-open-overlay"><button class="project-open-btn" onclick="openProject(\'' + p.id + '\')"><i class="fa-solid fa-pencil-ruler"></i> פתח לעריכה</button></div>' : '') +
            '</div>' +
            lockBadgeHtml +
            '<div class="project-body status-' + orderStatus + '" onclick="' + openFn + '(\'' + p.id + '\')">' +
                '<div class="project-name" title="' + safeName + '">' +
                    (pinned ? '<i class="fa-solid fa-bookmark project-pinned-mark" title="נעוץ"></i> ' : '') +
                    safeName +
                '</div>' +
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

// ── WhatsApp measurement inbox ────────────────────────────────────────────────
function _escHtml(s) {
    return String(s || '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function _escAttr(s) {
    return _escHtml(s);
}

function _isImageMime(mime) {
    return !!(mime && String(mime).indexOf('image/') === 0);
}

function _formatInboxDate(iso) {
    if (!iso) return '';
    try {
        return new Date(iso).toLocaleString('he-IL', {
            day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
        });
    } catch (e) { return ''; }
}

function _syncMeasurementBadge() {
    var n = _measurementUnread || 0;
    var badge = document.getElementById('nav-measurements-badge');
    if (badge) {
        badge.textContent = String(n);
        badge.classList.toggle('show', n > 0);
    }
    var banner = document.getElementById('inbox-banner');
    var bannerText = document.getElementById('inbox-banner-text');
    if (banner) banner.classList.toggle('show', n > 0);
    if (bannerText) {
        bannerText.textContent = n === 1
            ? 'מדידה חדשה אחת ממתינה לקישור לפרויקט'
            : (n + ' מדידות חדשות ממתינות לקישור לפרויקט');
    }
}

async function refreshMeasurementUnread() {
    if (!window.MeasurementInbox) return;
    _measurementUnread = await MeasurementInbox.countUnread();
    _syncMeasurementBadge();
}

async function openMeasurementsInbox() {
    openModal('modal-measurements');
    await refreshMeasurementsInbox();
}

async function refreshMeasurementsInbox() {
    var listEl = document.getElementById('measurements-inbox-list');
    if (!listEl || !window.MeasurementInbox) return;
    listEl.innerHTML = '<div style="text-align:center;color:var(--muted);padding:24px 0;">טוען...</div>';
    _measurementInbox = await MeasurementInbox.list({ limit: 80 });
    await refreshMeasurementUnread();

    if (!_measurementInbox.length) {
        listEl.innerHTML =
            '<div style="text-align:center;color:var(--muted);padding:28px 12px;line-height:1.6;">' +
                '<i class="fa-solid fa-inbox" style="font-size:1.6rem;display:block;margin-bottom:10px;"></i>' +
                'אין מדידות בתיבה עדיין.<br>שלחו למודד את קישור ההעלאה מהפרופיל.' +
            '</div>';
        return;
    }

    // Prefer unread first
    var sorted = _measurementInbox.slice().sort(function(a, b) {
        var au = a.status === 'unread' ? 0 : 1;
        var bu = b.status === 'unread' ? 0 : 1;
        if (au !== bu) return au - bu;
        return new Date(b.created_at) - new Date(a.created_at);
    });

    listEl.innerHTML = '';
    for (var i = 0; i < sorted.length; i++) {
        listEl.appendChild(await _buildInboxItem(sorted[i]));
    }
}

async function _buildInboxItem(m) {
    var row = document.createElement('div');
    row.className = 'inbox-item' + (m.status === 'unread' ? ' unread' : '');
    row.dataset.id = m.id;

    var thumbHtml = '<i class="fa-solid fa-file"></i>';
    if (_isImageMime(m.mime_type) && m.storage_path) {
        var signed = await MeasurementInbox.getSignedUrl(m.storage_path, 3600);
        if (signed && signed.url) {
            thumbHtml = '<img src="' + _escAttr(signed.url) + '" alt="">';
        } else {
            thumbHtml = '<i class="fa-solid fa-image"></i>';
        }
    } else if (m.mime_type && m.mime_type.indexOf('pdf') !== -1) {
        thumbHtml = '<i class="fa-solid fa-file-pdf"></i>';
    }

    var statusHe = m.status === 'unread' ? 'חדש' : (m.status === 'linked' ? 'קושר' : 'טופל');
    var sender = m.sender_name || m.source_phone || 'שולח לא ידוע';
    var caption = m.caption ? ('<div class="inbox-caption">' + _escHtml(m.caption) + '</div>') : '';
    var linkedHint = '';
    if (m.linked_project_id) {
        var lp = _projects.find(function(p) { return p.id === m.linked_project_id; });
        linkedHint = '<div class="inbox-sub">מקושר ל: ' + _escHtml((lp && lp.name) || 'פרויקט') + '</div>';
    }

    row.innerHTML =
        '<div class="inbox-thumb">' + thumbHtml + '</div>' +
        '<div class="inbox-meta">' +
            '<div class="inbox-title">' + _escHtml(m.file_name || 'קובץ מדידה') + '</div>' +
            '<div class="inbox-sub">' + _escHtml(sender) + ' · ' + _escHtml(_formatInboxDate(m.created_at)) + ' · ' + statusHe + '</div>' +
            caption + linkedHint +
            '<div class="inbox-actions">' +
                (m.storage_path
                    ? '<button type="button" onclick="openMeasurementFile(\'' + m.id + '\')"><i class="fa-solid fa-eye"></i> צפייה</button>'
                    : '') +
                (m.status !== 'linked'
                    ? '<button type="button" class="primary" onclick="openLinkMeasurement(\'' + m.id + '\')"><i class="fa-solid fa-link"></i> קשר לפרויקט</button>'
                    : '') +
                (m.status === 'unread'
                    ? '<button type="button" class="danger" onclick="dismissMeasurement(\'' + m.id + '\')"><i class="fa-solid fa-xmark"></i> התעלם</button>'
                    : '') +
            '</div>' +
        '</div>';
    return row;
}

async function openMeasurementFile(id) {
    var m = _measurementInbox.find(function(x) { return x.id === id; });
    if (!m || !m.storage_path) return;
    var signed = await MeasurementInbox.getSignedUrl(m.storage_path, 3600);
    if (signed.error || !signed.url) {
        showToast(signed.error || 'לא ניתן לפתוח את הקובץ', 'error');
        return;
    }
    window.open(signed.url, '_blank', 'noopener');
}

async function dismissMeasurement(id) {
    var result = await MeasurementInbox.dismiss(id);
    if (result.error) {
        showToast(result.error, 'error');
        return;
    }
    showToast('המדידה סומנה כטופלה', 'success');
    await refreshMeasurementsInbox();
}

function openLinkMeasurement(id) {
    var m = _measurementInbox.find(function(x) { return x.id === id; });
    if (!m) return;
    _linkMeasurementId = id;
    var nameEl = document.getElementById('link-measurement-name');
    if (nameEl) nameEl.textContent = m.file_name || 'קובץ מדידה';
    var search = document.getElementById('link-project-search');
    if (search) search.value = '';
    var chk = document.getElementById('link-set-measured');
    if (chk) chk.checked = true;
    filterLinkProjectList('');
    openModal('modal-link-measurement');
}

function filterLinkProjectList(q) {
    var list = document.getElementById('link-project-list');
    if (!list) return;
    q = (q || '').trim().toLowerCase();
    var items = (_projects || []).filter(function(p) {
        if (!q) return true;
        var fields = [p.name, p.customer_name, p.customer_order_num];
        return fields.some(function(f) { return f && String(f).toLowerCase().indexOf(q) !== -1; });
    });
    if (!items.length) {
        list.innerHTML = '<div style="text-align:center;color:var(--muted);padding:16px 0;">לא נמצאו פרויקטים</div>';
        return;
    }
    list.innerHTML = items.map(function(p) {
        var cust = p.customer_name
            ? (' · ' + _escHtml(p.customer_name) + (p.customer_order_num ? (' #' + _escHtml(p.customer_order_num)) : ''))
            : '';
        return '<button type="button" class="link-project-option" onclick="confirmLinkMeasurement(\'' + p.id + '\')">' +
            '<strong>' + _escHtml(p.name || 'ללא שם') + '</strong>' +
            '<span>' + _escHtml(_orderStatusLabel(p.order_status)) + cust + '</span>' +
            '</button>';
    }).join('');
}

async function confirmLinkMeasurement(projectId) {
    if (!_linkMeasurementId) return;
    var setMeasured = !!(document.getElementById('link-set-measured') || {}).checked;
    var result = await MeasurementInbox.linkToProject(_linkMeasurementId, projectId, {
        setMeasured: setMeasured
    });
    if (result.error) {
        showToast(result.error, 'error');
        return;
    }
    closeModal('modal-link-measurement');
    showToast('המדידה קושרה לפרויקט', 'success');
    // Refresh projects list (status may have changed)
    try { _projects = await Projects.list(); } catch (e) {}
    _renderProjects();
    await refreshMeasurementsInbox();
}

async function ensureWhatsappIngestToken(rotate) {
    if (!window.MeasurementInbox) return;
    var result = await MeasurementInbox.ensureIngestToken(!!rotate);
    if (result.error) {
        showToast(result.error, 'error');
        return;
    }
    var urlEl = document.getElementById('wa-webhook-url');
    if (urlEl) urlEl.textContent = MeasurementInbox.webhookUrlForToken(result.token);
    showToast(rotate ? 'נוצר קישור חדש' : 'הקישור מוכן', 'success');
}

async function copyWhatsappWebhookUrl() {
    var urlEl = document.getElementById('wa-webhook-url');
    var text = urlEl ? urlEl.textContent.trim() : '';
    if (!text || text.indexOf('http') !== 0) {
        await ensureWhatsappIngestToken(false);
        urlEl = document.getElementById('wa-webhook-url');
        text = urlEl ? urlEl.textContent.trim() : '';
    }
    if (!text || text.indexOf('http') !== 0) {
        showToast('אין קישור להעתקה', 'error');
        return;
    }
    try {
        await navigator.clipboard.writeText(text);
        showToast('הקישור הועתק', 'success');
    } catch (e) {
        showToast('העתקה נכשלה — העתק ידנית מהשדה', 'error');
    }
}

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

var _PP_ENGINE_OPTS = [
    { id: 'maya', label: 'צוקל נסתר' },
    { id: 'c9', label: 'צוקל רגיל' },
    { id: 'regalim', label: 'ארון על רגליים' },
    { id: 'sliding', label: 'ארון הזזה' },
    { id: 'ab2', label: 'AB2 (חזית פנימית + כוורת)' },
    { id: 'ab2_nohoney', label: 'חזית פנימית' }
];

var _PP_DEFAULT_CABINET_TYPES = [
    { id: 'maya', label: 'צוקל נסתר', engine: 'maya' },
    { id: 'c9', label: 'צוקל רגיל', engine: 'c9' },
    { id: 'regalim', label: 'ארון על רגליים', engine: 'regalim' },
    { id: 'sliding', label: 'ארון הזזה', engine: 'sliding' }
];

var _PP_LEGACY_TYPE_LABELS = {
    maya: 'מאיה', c9: 'C9', regalim: 'רגלים', ab2: 'AB2',
    ab2_nohoney: 'חזית פנימית', other: 'אחר', sliding: 'ארון הזזה'
};

var _PP_EMPTY_WIDTHS = [80, 120, 160, 200, 240];

var _PP_DEFAULTS = {
    pricingMode:'ranges',sqmPrice:800,sqmPriceNonMel:1040,lmPrice:1200,lmPriceNonMel:1560,
    lmHeightBase:1200,lmHeightBaseNonMel:1560,lmHeightThresholdCm:240,lmHeightStepCm:30,lmHeightStepPct:0.10,
    materialsBoardPrice:180,materialsBoardsPerSqm:1.4,materialsMultiplier:2.5,profitMultiplier:1.7,
    heightSurcharge:0.20,depthSurcharge:0.20,sandwichSurcharge:0.15,
    installPricePerUnit:110,installUnitCm:42.5,installHeightSurcharge:0.20,
    cabinetTypes: _PP_DEFAULT_CABINET_TYPES.map(function(t) { return Object.assign({}, t); }),
    ranges:{
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
        slidingGold:80,slidingBlack:50,slidingHeightSurcharge:0.15,nickelLegPrice:100,ledPair:650}
};

var _ppCabinetTypes = _PP_DEFAULT_CABINET_TYPES.map(function(t) { return Object.assign({}, t); });

function _ppCloneTypes(list) {
    return (list || []).map(function(t) { return { id: t.id, label: t.label, engine: t.engine }; });
}

function _ppNormalizeCabinetTypes(cfg) {
    var list = (cfg && Array.isArray(cfg.cabinetTypes) && cfg.cabinetTypes.length) ? cfg.cabinetTypes : null;
    if (!list) {
        var ranges = (cfg && cfg.ranges) || {};
        var keys = Object.keys(ranges).filter(function(k) { return k !== 'melamine' && k !== 'nonMelamine'; });
        list = keys.map(function(id) {
            return { id: id, label: _PP_LEGACY_TYPE_LABELS[id] || id, engine: id === 'other' ? 'maya' : id };
        });
        if (!list.length) list = _ppCloneTypes(_PP_DEFAULT_CABINET_TYPES);
    }
    var seen = {};
    list = list.filter(function(t) {
        if (!t || !t.id || seen[t.id]) return false;
        seen[t.id] = true;
        t.engine = t.engine || t.id;
        t.label = (t.label && String(t.label).trim()) ? String(t.label).trim() : String(t.id);
        return true;
    });
    if (!list.some(function(t) { return t.engine === 'sliding'; })) {
        list.push({ id: 'sliding', label: 'ארון הזזה', engine: 'sliding' });
    }
    if (!list.length) list = _ppCloneTypes(_PP_DEFAULT_CABINET_TYPES);
    return _ppCloneTypes(list);
}

function _ppRangeTypes() {
    return (_ppCabinetTypes || []).filter(function(t) { return t.engine !== 'sliding'; });
}

function _ppEscAttr(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function _ppNum(v, fallback) {
    if (v === '' || v == null) return fallback;
    var n = Number(v);
    return isFinite(n) ? n : fallback;
}

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

        // Prefill WhatsApp webhook URL if token already exists
        if (_userProfile.whatsapp_ingest_token && window.MeasurementInbox) {
            var waUrl = document.getElementById('wa-webhook-url');
            if (waUrl) {
                waUrl.textContent = MeasurementInbox.webhookUrlForToken(_userProfile.whatsapp_ingest_token);
            }
        }

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
        window._userLogoUrl = logoUrl || null;
        window._userBusinessName = biz.name || '';
        window._userBusinessPhone = _userProfile.phone || '';

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
        window._userBusinessName = biz.name || '';
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

function _ppSyncTypesFromDom() {
    var wrap = document.getElementById('pp-cabinet-types');
    if (!wrap) return _ppCabinetTypes;
    var rows = wrap.querySelectorAll('.pp-type-row');
    var next = [];
    rows.forEach(function(row) {
        var id = row.getAttribute('data-id');
        var labelInp = row.querySelector('.pp-type-label');
        var engSel = row.querySelector('.pp-type-engine');
        if (!id) return;
        next.push({
            id: id,
            label: labelInp ? String(labelInp.value || '').trim() || id : id,
            engine: engSel ? engSel.value : 'maya'
        });
    });
    if (next.length) _ppCabinetTypes = next;
    return _ppCabinetTypes;
}

function _ppEnsureCabinetTypesSection() {
    if (document.getElementById('pp-cabinet-types')) return;
    var panel = document.querySelector('#tab-pricing .pricing-panel-wrap');
    if (!panel) return;
    var sec = document.createElement('div');
    sec.className = 'pp-section';
    sec.id = 'pp-section-cabinet-types';
    sec.innerHTML =
        '<div class="pp-section-title"><i class="fa-solid fa-layer-group"></i> סוגי ארונות</div>' +
        '<p style="font-size:.78rem;color:var(--muted);margin-bottom:12px;line-height:1.5;">שם התצוגה במחשבון ובמעצב, וסוג הבנייה במערכת. לארון הזזה אין טבלת רוחב — המחיר מוגדר בסקשן ארון הזזה.</p>' +
        '<div class="pp-types-list" id="pp-cabinet-types"></div>' +
        '<button type="button" onclick="ppAddCabinetType()" style="display:inline-flex;align-items:center;gap:6px;padding:8px 16px;background:rgba(37,99,235,.08);border:1.5px solid rgba(37,99,235,.25);color:var(--secondary);border-radius:10px;font-size:.82rem;font-weight:600;cursor:pointer;font-family:inherit;">' +
        '<i class="fa-solid fa-plus"></i> הוסף סוג</button>';
    var ranges = document.getElementById('pp-mode-ranges');
    if (ranges && ranges.parentNode === panel) panel.insertBefore(sec, ranges);
    else {
        var first = panel.querySelector('.pp-section');
        if (first && first.nextSibling) panel.insertBefore(sec, first.nextSibling);
        else panel.insertBefore(sec, panel.firstChild);
    }
}

function _ppRenderCabinetTypes() {
    _ppEnsureCabinetTypesSection();
    var wrap = document.getElementById('pp-cabinet-types');
    if (!wrap) return;
    wrap.innerHTML = (_ppCabinetTypes || []).map(function(t) {
        var opts = _PP_ENGINE_OPTS.map(function(o) {
            return '<option value="' + o.id + '"' + (t.engine === o.id ? ' selected' : '') + '>' + o.label + '</option>';
        }).join('');
        return '<div class="pp-type-row" data-id="' + _ppEscAttr(t.id) + '">' +
            '<input class="pp-input pp-type-label" type="text" maxlength="60" value="' + _ppEscAttr(t.label) + '" oninput="ppOnCabinetTypeChange()">' +
            '<select class="pp-input pp-type-engine" onchange="ppOnCabinetTypeEngineChange(this)">' + opts + '</select>' +
            '<button type="button" class="pp-type-del" title="מחק סוג" onclick="ppDeleteCabinetType(this.closest(\'.pp-type-row\').getAttribute(\'data-id\'))"><i class="fa-solid fa-trash"></i></button>' +
            '</div>';
    }).join('');
}

function ppOnCabinetTypeChange() {
    _ppSyncTypesFromDom();
    _ppRefreshRangeModelSelects();
    if (typeof window.applyCabinetTypeSelects === 'function') window.applyCabinetTypeSelects({ cabinetTypes: _ppCabinetTypes, ranges: _ppReadRangesTable() });
}

function ppOnCabinetTypeEngineChange(sel) {
    var row = sel && sel.closest('.pp-type-row');
    var prevEngine = null;
    var id = row ? row.getAttribute('data-id') : '';
    var existing = (_ppCabinetTypes || []).find(function(t) { return t.id === id; });
    if (existing) prevEngine = existing.engine;
    _ppSyncTypesFromDom();
    var t = (_ppCabinetTypes || []).find(function(x) { return x.id === id; });
    if (t && prevEngine === 'sliding' && t.engine !== 'sliding') {
        _PP_EMPTY_WIDTHS.forEach(function(w) { _ppAddRangeRowData(t.id, w, 0, 0); });
    }
    if (t && t.engine === 'sliding' && prevEngine !== 'sliding') {
        _ppRemoveRangeRowsForType(t.id);
    }
    _ppRefreshRangeModelSelects();
    if (typeof window.applyCabinetTypeSelects === 'function') window.applyCabinetTypeSelects({ cabinetTypes: _ppCabinetTypes, ranges: _ppReadRangesTable() });
}

function ppAddCabinetType() {
    _ppSyncTypesFromDom();
    var id = 'custom_' + Date.now().toString(36);
    _ppCabinetTypes.push({ id: id, label: 'סוג חדש', engine: 'maya' });
    _ppRenderCabinetTypes();
    _PP_EMPTY_WIDTHS.forEach(function(w) { _ppAddRangeRowData(id, w, 0, 0); });
    _ppRefreshRangeModelSelects();
    if (typeof window.applyCabinetTypeSelects === 'function') window.applyCabinetTypeSelects({ cabinetTypes: _ppCabinetTypes, ranges: _ppReadRangesTable() });
}

function ppDeleteCabinetType(id) {
    _ppSyncTypesFromDom();
    if ((_ppCabinetTypes || []).length <= 1) {
        showToast('חייב להישאר לפחות סוג ארון אחד', 'error');
        return;
    }
    _ppCabinetTypes = _ppCabinetTypes.filter(function(t) { return t.id !== id; });
    _ppRemoveRangeRowsForType(id);
    _ppRenderCabinetTypes();
    _ppRefreshRangeModelSelects();
    if (typeof window.applyCabinetTypeSelects === 'function') window.applyCabinetTypeSelects({ cabinetTypes: _ppCabinetTypes, ranges: _ppReadRangesTable() });
}

function _ppRemoveRangeRowsForType(id) {
    var tbody = document.getElementById('pp-ranges-tbody');
    if (!tbody) return;
    Array.prototype.slice.call(tbody.querySelectorAll('tr')).forEach(function(tr) {
        var sel = tr.querySelector('select');
        if (sel && sel.value === id) tr.remove();
    });
}

function _ppRefreshRangeModelSelects() {
    var types = _ppRangeTypes();
    var tbody = document.getElementById('pp-ranges-tbody');
    if (!tbody) return;
    tbody.querySelectorAll('tr').forEach(function(tr) {
        var sel = tr.querySelector('select');
        if (!sel) return;
        var cur = sel.value;
        sel.innerHTML = types.map(function(t) {
            return '<option value="' + _ppEscAttr(t.id) + '"' + (t.id === cur ? ' selected' : '') + '>' + _ppEscAttr(t.label) + '</option>';
        }).join('');
        if (types.some(function(t) { return t.id === cur; })) sel.value = cur;
    });
}

async function _loadPricingForm() {
    try {
        var sb = supabase.createClient(
            'https://meqxnsjycvfgfhdepguo.supabase.co',
            'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1lcXhuc2p5Y3ZmZ2ZoZGVwZ3VvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY3MDA5NDAsImV4cCI6MjA5MjI3Njk0MH0.w63bl0-1-Rgt9Nx6sVW5ueEGMojiMaxoehlPXlPH2N0'
        );
        var { data: { user } } = await sb.auth.getUser();
        if (!user) {
            _fillPricingPanel(_PP_DEFAULTS);
            return;
        }
        var { data: row } = await sb.from('pricing_configs').select('config').eq('user_id', user.id).single();
        _pricingCfg = (row && row.config && Object.keys(row.config).length > 0) ? row.config : null;
        if (_pricingCfg) {
            _pricingCfg.cabinetTypes = _ppNormalizeCabinetTypes(_pricingCfg);
        }
        window._pricingConfig = _pricingCfg;
        _fillPricingPanel(_pricingCfg || _PP_DEFAULTS);
        if (typeof window.applyCabinetTypeSelects === 'function') window.applyCabinetTypeSelects(window._pricingConfig || _PP_DEFAULTS);
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
    var typeIds = _ppRangeTypes().map(function(t) { return t.id; });
    var keys = Object.keys(r).filter(function(k) {
        return k !== 'melamine' && k !== 'nonMelamine' && k !== 'sliding' && (typeIds.length ? typeIds.indexOf(k) !== -1 : true);
    });
    if (!keys.length) {
        var first = typeIds[0] || 'maya';
        _ppAddRangeRowData(first, 80, 0, 0);
        return;
    }
    keys.forEach(function(model) {
        var entry = r[model] || {};
        var mel = entry.melamine || {};
        var nonMel = entry.nonMelamine || {};
        var widths = Object.keys(mel).length ? Object.keys(mel) : Object.keys(nonMel);
        widths.sort(function(a, b) { return parseInt(a, 10) - parseInt(b, 10); });
        if (!widths.length) { _ppAddRangeRowData(model, 80, 0, 0); return; }
        widths.forEach(function(w) {
            _ppAddRangeRowData(model, parseInt(w, 10), _ppNum(mel[w], 0), _ppNum(nonMel[w], 0));
        });
    });
}

function _ppAddRangeRowData(model, width, melVal, nonMelVal) {
    var tbody = document.getElementById('pp-ranges-tbody');
    if (!tbody) return;
    var types = _ppRangeTypes();
    if (!types.length) return;
    if (!types.some(function(t) { return t.id === model; })) model = types[0].id;
    var tr = document.createElement('tr');
    var selectHtml = '<select class="pp-input" style="width:100%;padding:4px 6px;font-size:.82rem;">';
    types.forEach(function(t) {
        selectHtml += '<option value="' + _ppEscAttr(t.id) + '"' + (model === t.id ? ' selected' : '') + '>' + _ppEscAttr(t.label) + '</option>';
    });
    selectHtml += '</select>';
    tr.innerHTML =
        '<td style="padding:4px 6px;">' + selectHtml + '</td>' +
        '<td style="padding:4px 6px;"><input type="number" class="pp-input" style="width:100%;padding:4px 6px;font-size:.82rem;" value="' + (width != null ? width : 80) + '"></td>' +
        '<td style="padding:4px 6px;"><input type="number" class="pp-input" style="width:100%;padding:4px 6px;font-size:.82rem;" value="' + (melVal != null ? melVal : 0) + '"></td>' +
        '<td style="padding:4px 6px;"><input type="number" class="pp-input" style="width:100%;padding:4px 6px;font-size:.82rem;" value="' + (nonMelVal != null ? nonMelVal : 0) + '"></td>' +
        '<td style="padding:4px 6px;text-align:center;"><button onclick="ppDeleteRangeRow(this)" style="background:none;border:none;color:#ef4444;cursor:pointer;font-size:1rem;padding:2px 6px;" title="מחק שורה">&#x2715;</button></td>';
    tbody.appendChild(tr);
}

function ppAddRangeRow() {
    var types = _ppRangeTypes();
    _ppAddRangeRowData(types[0] ? types[0].id : 'maya', 80, 0, 0);
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
        var width = parseInt(cells[1].querySelector('input').value, 10) || 80;
        var mel = _ppNum(cells[2].querySelector('input').value, 0);
        var nonMel = _ppNum(cells[3].querySelector('input').value, 0);
        if (!result[model]) result[model] = { melamine: {}, nonMelamine: {} };
        result[model].melamine[width] = mel;
        result[model].nonMelamine[width] = nonMel;
    });
    return result;
}

function _fillPricingPanel(cfg) {
    var c = cfg || _PP_DEFAULTS;
    _ppCabinetTypes = _ppNormalizeCabinetTypes(c);
    ppSetMode(c.pricingMode || 'ranges');
    _ppRenderCabinetTypes();
    _ppBuildRangesTable(c.ranges);
    _ppSet('pp-sqmPrice', _ppNum(c.sqmPrice, 800));
    _ppSet('pp-sqmPriceNonMel', _ppNum(c.sqmPriceNonMel, 1040));
    _ppSet('pp-lmPrice', _ppNum(c.lmPrice, 1200));
    _ppSet('pp-lmPriceNonMel', _ppNum(c.lmPriceNonMel, 1560));
    _ppSet('pp-lmHeightBase', _ppNum(c.lmHeightBase, 1200));
    _ppSet('pp-lmHeightBaseNonMel', _ppNum(c.lmHeightBaseNonMel, 1560));
    _ppSet('pp-lmHeightThresholdCm', _ppNum(c.lmHeightThresholdCm, 240));
    _ppSet('pp-lmHeightStepCm', _ppNum(c.lmHeightStepCm, 30));
    _ppSet('pp-lmHeightStepPct', _ppPct(_ppNum(c.lmHeightStepPct, 0.10)));
    _ppSet('pp-materialsBoardPrice', _ppNum(c.materialsBoardPrice, 180));
    _ppSet('pp-materialsBoardsPerSqm', _ppNum(c.materialsBoardsPerSqm, 1.4));
    _ppSet('pp-materialsMultiplier', _ppNum(c.materialsMultiplier, 2.5));
    _ppSet('pp-profitMultiplier', _ppNum(c.profitMultiplier, 1.7));
    _ppSet('pp-heightSurcharge', _ppPct(_ppNum(c.heightSurcharge, 0.20)));
    _ppSet('pp-depthSurcharge', _ppPct(_ppNum(c.depthSurcharge, 0.20)));
    _ppSet('pp-sandwichSurcharge', _ppPct(_ppNum(c.sandwichSurcharge, 0.15)));
    _ppSet('pp-installPricePerUnit', _ppNum(c.installPricePerUnit, 110));
    _ppSet('pp-installUnitCm', _ppNum(c.installUnitCm, 42.5));
    _ppSet('pp-installHeightSurcharge', _ppPct(_ppNum(c.installHeightSurcharge, 0.20)));
    var ex = c.extras || _PP_DEFAULTS.extras;
    var dx = _PP_DEFAULTS.extras;
    _ppSet('pp-internalDrawer', _ppNum(ex.internalDrawer, dx.internalDrawer));
    _ppSet('pp-externalDrawer', _ppNum(ex.externalDrawer, dx.externalDrawer));
    _ppSet('pp-openCell', _ppNum(ex.openCell, dx.openCell));
    _ppSet('pp-partition', _ppNum(ex.partition, dx.partition));
    _ppSet('pp-shelfFreePerMeter', _ppNum(ex.shelfFreePerMeter, dx.shelfFreePerMeter));
    _ppSet('pp-extraShelfMel', _ppNum(ex.extraShelfMel, dx.extraShelfMel));
    _ppSet('pp-extraShelfNonMel', _ppNum(ex.extraShelfNonMel, dx.extraShelfNonMel));
    _ppSet('pp-deskUnit', _ppNum(ex.deskUnit, dx.deskUnit));
    _ppSet('pp-doorFramedMel', _ppNum(ex.doorFramedMel, dx.doorFramedMel));
    _ppSet('pp-doorGlassMel', _ppNum(ex.doorGlassMel, dx.doorGlassMel));
    _ppSet('pp-doorGlassBlack', _ppNum(ex.doorGlassBlack, dx.doorGlassBlack));
    _ppSet('pp-doorMirror', _ppNum(ex.doorMirror, dx.doorMirror));
    _ppSet('pp-ledPair', _ppNum(ex.ledPair, dx.ledPair));
    _ppSet('pp-upperUnit160', _ppNum(ex.upperUnit160, dx.upperUnit160));
    _ppSet('pp-upperUnit240', _ppNum(ex.upperUnit240, dx.upperUnit240));
    _ppSet('pp-upperUnitPerCm', _ppNum(ex.upperUnitPerCm, dx.upperUnitPerCm));
    _ppSet('pp-cornerDrawers3', _ppNum(ex.cornerDrawers3, dx.cornerDrawers3));
    _ppSet('pp-cornerDrawers4', _ppNum(ex.cornerDrawers4, dx.cornerDrawers4));
    _ppSet('pp-cornerDrawerExtra', _ppNum(ex.cornerDrawerExtra, dx.cornerDrawerExtra));
    _ppSet('pp-cornerDesk', _ppNum(ex.cornerDesk, dx.cornerDesk));
    _ppSet('pp-fullCornerBase', _ppNum(ex.fullCornerBase, dx.fullCornerBase));
    _ppSet('pp-fullCornerShelf', _ppNum(ex.fullCornerShelf, dx.fullCornerShelf));
    _ppSet('pp-wingConnection', _ppNum(ex.wingConnection, dx.wingConnection));
    _ppSet('pp-sideCabMel', _ppNum(ex.sideCabMel, dx.sideCabMel));
    _ppSet('pp-sideCabNonMel', _ppNum(ex.sideCabNonMel, dx.sideCabNonMel));
    _ppSet('pp-sideCabDoors', _ppNum(ex.sideCabDoors, dx.sideCabDoors));
    _ppSet('pp-slidingBase', _ppNum(ex.slidingBase, dx.slidingBase));
    _ppSet('pp-slidingDoor', _ppNum(ex.slidingDoor, dx.slidingDoor));
    _ppSet('pp-slidingGlass', _ppNum(ex.slidingGlass, dx.slidingGlass));
    _ppSet('pp-slidingMirror', _ppNum(ex.slidingMirror, dx.slidingMirror));
    _ppSet('pp-slidingGold', _ppNum(ex.slidingGold, dx.slidingGold));
    _ppSet('pp-slidingBlack', _ppNum(ex.slidingBlack, dx.slidingBlack));
    _ppSet('pp-slidingHeightSurcharge', _ppPct(_ppNum(ex.slidingHeightSurcharge, dx.slidingHeightSurcharge)));
    _ppSet('pp-nickelLegPrice', _ppNum(ex.nickelLegPrice, dx.nickelLegPrice));
}

function _readPricingPanel() {
    var activeBtn = document.querySelector('.pp-mode-btn.active');
    var mode = activeBtn ? activeBtn.getAttribute('data-mode') : 'ranges';
    var existing = _pricingCfg || _PP_DEFAULTS;
    var dx = _PP_DEFAULTS.extras || {};
    _ppSyncTypesFromDom();
    return {
        pricingMode: mode,
        sqmPrice: _ppNum(_ppVal('pp-sqmPrice'), 800),
        sqmPriceNonMel: _ppNum(_ppVal('pp-sqmPriceNonMel'), 1040),
        lmPrice: _ppNum(_ppVal('pp-lmPrice'), 1200),
        lmPriceNonMel: _ppNum(_ppVal('pp-lmPriceNonMel'), 1560),
        lmHeightBase: _ppNum(_ppVal('pp-lmHeightBase'), 1200),
        lmHeightBaseNonMel: _ppNum(_ppVal('pp-lmHeightBaseNonMel'), 1560),
        lmHeightThresholdCm: _ppNum(_ppVal('pp-lmHeightThresholdCm'), 240),
        lmHeightStepCm: _ppNum(_ppVal('pp-lmHeightStepCm'), 30),
        lmHeightStepPct: _ppFrac(_ppVal('pp-lmHeightStepPct')),
        materialsBoardPrice: _ppNum(_ppVal('pp-materialsBoardPrice'), 180),
        materialsBoardsPerSqm: _ppNum(_ppVal('pp-materialsBoardsPerSqm'), 1.4),
        materialsMultiplier: _ppNum(_ppVal('pp-materialsMultiplier'), 2.5),
        profitMultiplier: _ppNum(_ppVal('pp-profitMultiplier'), 1.7),
        heightSurcharge: _ppFrac(_ppVal('pp-heightSurcharge')),
        depthSurcharge: _ppFrac(_ppVal('pp-depthSurcharge')),
        sandwichSurcharge: _ppFrac(_ppVal('pp-sandwichSurcharge')),
        installPricePerUnit: _ppNum(_ppVal('pp-installPricePerUnit'), 110),
        installUnitCm: _ppNum(_ppVal('pp-installUnitCm'), 42.5),
        installHeightSurcharge: _ppFrac(_ppVal('pp-installHeightSurcharge')),
        cabinetTypes: _ppCloneTypes(_ppCabinetTypes),
        ranges: _ppReadRangesTable(),
        extras: Object.assign({}, existing.extras || {}, {
            internalDrawer: _ppNum(_ppVal('pp-internalDrawer'), dx.internalDrawer),
            externalDrawer: _ppNum(_ppVal('pp-externalDrawer'), dx.externalDrawer),
            openCell: _ppNum(_ppVal('pp-openCell'), dx.openCell),
            partition: _ppNum(_ppVal('pp-partition'), dx.partition),
            shelfFreePerMeter: _ppNum(_ppVal('pp-shelfFreePerMeter'), dx.shelfFreePerMeter),
            extraShelfMel: _ppNum(_ppVal('pp-extraShelfMel'), dx.extraShelfMel),
            extraShelfNonMel: _ppNum(_ppVal('pp-extraShelfNonMel'), dx.extraShelfNonMel),
            deskUnit: _ppNum(_ppVal('pp-deskUnit'), dx.deskUnit),
            doorFramedMel: _ppNum(_ppVal('pp-doorFramedMel'), dx.doorFramedMel),
            doorGlassMel: _ppNum(_ppVal('pp-doorGlassMel'), dx.doorGlassMel),
            doorGlassBlack: _ppNum(_ppVal('pp-doorGlassBlack'), dx.doorGlassBlack),
            doorMirror: _ppNum(_ppVal('pp-doorMirror'), dx.doorMirror),
            upperUnit160: _ppNum(_ppVal('pp-upperUnit160'), dx.upperUnit160),
            upperUnit240: _ppNum(_ppVal('pp-upperUnit240'), dx.upperUnit240),
            upperUnitPerCm: _ppNum(_ppVal('pp-upperUnitPerCm'), dx.upperUnitPerCm),
            cornerDrawers3: _ppNum(_ppVal('pp-cornerDrawers3'), dx.cornerDrawers3),
            cornerDrawers4: _ppNum(_ppVal('pp-cornerDrawers4'), dx.cornerDrawers4),
            cornerDrawerExtra: _ppNum(_ppVal('pp-cornerDrawerExtra'), dx.cornerDrawerExtra),
            cornerDesk: _ppNum(_ppVal('pp-cornerDesk'), dx.cornerDesk),
            fullCornerBase: _ppNum(_ppVal('pp-fullCornerBase'), dx.fullCornerBase),
            fullCornerShelf: _ppNum(_ppVal('pp-fullCornerShelf'), dx.fullCornerShelf),
            wingConnection: _ppNum(_ppVal('pp-wingConnection'), dx.wingConnection),
            sideCabMel: _ppNum(_ppVal('pp-sideCabMel'), dx.sideCabMel),
            sideCabNonMel: _ppNum(_ppVal('pp-sideCabNonMel'), dx.sideCabNonMel),
            sideCabDoors: _ppNum(_ppVal('pp-sideCabDoors'), dx.sideCabDoors),
            slidingBase: _ppNum(_ppVal('pp-slidingBase'), dx.slidingBase),
            slidingDoor: _ppNum(_ppVal('pp-slidingDoor'), dx.slidingDoor),
            slidingGlass: _ppNum(_ppVal('pp-slidingGlass'), dx.slidingGlass),
            slidingMirror: _ppNum(_ppVal('pp-slidingMirror'), dx.slidingMirror),
            slidingGold: _ppNum(_ppVal('pp-slidingGold'), dx.slidingGold),
            slidingBlack: _ppNum(_ppVal('pp-slidingBlack'), dx.slidingBlack),
            slidingHeightSurcharge: _ppFrac(_ppVal('pp-slidingHeightSurcharge')),
            nickelLegPrice: _ppNum(_ppVal('pp-nickelLegPrice'), dx.nickelLegPrice),
            ledPair: _ppNum(_ppVal('pp-ledPair'), dx.ledPair)
        })
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
        window._pricingConfig = cfg;
        if (typeof window.applyCabinetTypeSelects === 'function') window.applyCabinetTypeSelects(cfg);
        showToast('הגדרות התמחור נשמרו ✓', 'success');
    } catch(e) {
        showToast('שגיאה בשמירה: ' + e.message, 'error');
    }
}

function resetPricingToDefaults() {
    _fillPricingPanel(_PP_DEFAULTS);
    if (typeof window.applyCabinetTypeSelects === 'function') window.applyCabinetTypeSelects(_PP_DEFAULTS);
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
