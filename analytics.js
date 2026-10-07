// ==========================================
// analytics.js — Google Analytics 4
// ==========================================
(function () {
    var GA_ID = 'G-W9N8M22WTH';

    var PLAN_VALUES = {
        designer_monthly:       399,
        designer_annual:        4428,
        carpenter_basic:        499,
        carpenter_basic_annual: 5388,
        carpenter_pro:          699,
        carpenter_pro_annual:   7548
    };

    var isLocal = location.protocol === 'file:' || /^(localhost|127\.0\.0\.1)$/.test(location.hostname);

    window.track = function () {};
    window.trackPlan = function () {};
    if (!GA_ID || isLocal) return;

    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_ID;
    document.head.appendChild(s);

    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    window.gtag('config', GA_ID);

    window.track = function (name, params) {
        window.gtag('event', name, params || {});
    };

    window.trackPlan = function (name, planKey, extra) {
        var params = { currency: 'ILS', plan: planKey };
        if (PLAN_VALUES[planKey]) {
            params.value = PLAN_VALUES[planKey];
            params.items = [{ item_id: planKey, item_name: planKey, price: PLAN_VALUES[planKey], quantity: 1 }];
        }
        for (var k in (extra || {})) params[k] = extra[k];
        window.gtag('event', name, params);
    };

    document.addEventListener('click', function (e) {
        var a = e.target.closest && e.target.closest('a[href*="wa.me/"]');
        if (a) window.track('contact', { method: 'whatsapp', page: location.pathname });
    }, true);
})();
