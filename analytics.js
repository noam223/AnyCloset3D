// ==========================================
// analytics.js — Google Analytics 4 + Meta Pixel
// ==========================================
(function () {
    var GA_ID = 'G-W9N8M22WTH';
    var META_PIXEL_ID = '2339696586799281';

    var PLAN_VALUES = {
        designer_basic:          229,
        designer_basic_annual:   2388,
        designer_premium:        299,
        designer_premium_annual: 3228,
        carpenter_pro:          299,
        carpenter_pro_annual:   3228
    };

    // GA event name -> Meta standard event
    var META_EVENTS = {
        sign_up:        'CompleteRegistration',
        start_trial:    'StartTrial',
        begin_checkout: 'InitiateCheckout',
        purchase:       'Purchase',
        generate_lead:  'Lead',
        contact:        'Contact'
    };

    var isLocal = location.protocol === 'file:' || /^(localhost|127\.0\.0\.1)$/.test(location.hostname);

    window.track = function () {};
    window.trackPlan = function () {};
    if (isLocal) return;

    if (GA_ID) {
        var s = document.createElement('script');
        s.async = true;
        s.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_ID;
        document.head.appendChild(s);

        window.dataLayer = window.dataLayer || [];
        window.gtag = function () { window.dataLayer.push(arguments); };
        window.gtag('js', new Date());
        window.gtag('config', GA_ID);
    }

    if (META_PIXEL_ID) {
        !function (f, b, e, v, n, t, s) {
            if (f.fbq) return; n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); };
            if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = '2.0'; n.queue = [];
            t = b.createElement(e); t.async = !0; t.src = v; s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s);
        }(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
        window.fbq('init', META_PIXEL_ID);
        window.fbq('track', 'PageView');
    }

    function sendMeta(name, params) {
        var metaName = META_EVENTS[name];
        if (!metaName || !window.fbq) return;
        var p = {};
        if (params.value) { p.value = params.value; p.currency = 'ILS'; }
        if (params.plan) p.content_name = params.plan;
        if (metaName === 'StartTrial' && p.value) p.predicted_ltv = p.value;
        var opts = params.transaction_id ? { eventID: params.transaction_id } : undefined;
        window.fbq('track', metaName, p, opts);
    }

    window.track = function (name, params) {
        params = params || {};
        if (window.gtag) window.gtag('event', name, params);
        sendMeta(name, params);
    };

    window.trackPlan = function (name, planKey, extra) {
        var params = { currency: 'ILS', plan: planKey };
        if (PLAN_VALUES[planKey]) {
            params.value = PLAN_VALUES[planKey];
            params.items = [{ item_id: planKey, item_name: planKey, price: PLAN_VALUES[planKey], quantity: 1 }];
        }
        for (var k in (extra || {})) params[k] = extra[k];
        if (window.gtag) window.gtag('event', name, params);
        sendMeta(name, params);
    };

    document.addEventListener('click', function (e) {
        var a = e.target.closest && e.target.closest('a[href*="wa.me/"]');
        if (a) window.track('contact', { method: 'whatsapp', page: location.pathname });
    }, true);
})();
