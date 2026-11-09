// ==========================================
// עוזר תמיכה — Help assistant chat
// ==========================================
// Answers from the local knowledge base (help-kb.js + tour steps) first; only questions the
// knowledge base can't answer go to the help-assistant edge function (Gemini, grounded on the
// closest knowledge-base entries). Every question is logged to help_chat_log to grow the KB.

(function() {
'use strict';

var FN_URL = 'https://meqxnsjycvfgfhdepguo.supabase.co/functions/v1/help-assistant';
var WA_URL = 'https://wa.me/972546659798?text=' + encodeURIComponent('שלום, יש לי שאלה לגבי AnyCloset 3D: ');
var KB_MIN_COVERAGE = 0.6;
var SUGGESTIONS = [
    'איך שולחים ללקוח קישור לצפייה?',
    'איך מוסיפים מגירות?',
    'איך מפיקים הדמיה פוטוריאליסטית?',
    'איך שולחים לנגר או למפעל?'
];

function $(id) { return document.getElementById(id); }
function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function(c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
}

// ── Hebrew-aware search ─────────────────────────────────────────────────────
var STOP = {};
('איך מה את של על עם אני רוצה אפשר לי זה זו יש אין כדי או גם אם מי איפה למה כמה הוא היא ' +
 'אנחנו אתה את שלי שלך לעשות עושים עושה עושות מוסיפים מוסיפה מוסיף מוסיפות להוסיף בבקשה תודה ' +
 'רק כל עוד כבר אצלי צריך צריכה אפשרי ניתן')
    .split(' ').forEach(function(w) { STOP[w] = 1; });
var FINALS = { 'ם': 'מ', 'ן': 'נ', 'ץ': 'צ', 'ף': 'פ', 'ך': 'כ' };

var SUFFIXES = ['יות', 'ות', 'ימ', 'ה', 'י'];

function stripSuffix(w) {
    for (var i = 0; i < SUFFIXES.length; i++) {
        var s = SUFFIXES[i];
        if (w.length - s.length >= 3 && w.slice(-s.length) === s) return w.slice(0, -s.length);
    }
    return w;
}

// A word's variants: the word itself, and the word without one or two prefix letters (ו/ה/ב/ל/מ/ש/כ).
// Both forms are kept because the first letter may belong to the root (מגירות, כוורת).
function variants(w) {
    w = w.replace(/[םןץףך]/g, function(c) { return FINALS[c]; });
    var out = [stripSuffix(w)];
    for (var n = 0; n < 2 && w.length > 3 && /^[והבלמשכ]/.test(w); n++) {
        w = w.slice(1);
        var v = stripSuffix(w);
        if (v.length >= 3 && out.indexOf(v) < 0) out.push(v);
    }
    return out;
}

// Returns one variants-array per distinct word; the first variant is the word's primary form.
function tokens(text) {
    var clean = String(text || '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/[\u0591-\u05C7]/g, '')
        .replace(/[^\u05D0-\u05EAa-zA-Z0-9]+/g, ' ')
        .toLowerCase();
    var out = [], seen = {};
    clean.split(' ').forEach(function(w) {
        if (!w || w.length < 2 || STOP[w]) return;
        var v = variants(w);
        if (seen[v[0]]) return;
        seen[v[0]] = 1;
        out.push(v);
    });
    return out;
}

function fieldSet(text) {
    var set = {};
    tokens(text).forEach(function(v) { v.forEach(function(x) { set[x] = 1; }); });
    return set;
}

var INDEX = null;

function buildIndex() {
    var docs = [];
    (window.HELP_KB || []).forEach(function(e) {
        docs.push({ title: e.q, html: e.a, show: e.show || null,
            fields: [[fieldSet(e.q), 3], [fieldSet(e.k), 2.5], [fieldSet(e.a), 1]] });
    });
    var tour = typeof window._tourCatalog === 'function' ? window._tourCatalog() : [];
    tour.forEach(function(s) {
        var title = s.title.replace(/^[^\u05D0-\u05EAa-zA-Z0-9]+/, '').trim();
        docs.push({ title: title, html: s.text, show: [s.topic, s.target],
            fields: [[fieldSet(title), 2.5], [fieldSet(s.topicTitle), 0.5], [fieldSet(s.text), 1]] });
    });
    var df = {};
    docs.forEach(function(d) {
        var seen = {};
        d.fields.forEach(function(f) { Object.keys(f[0]).forEach(function(t) { seen[t] = 1; }); });
        Object.keys(seen).forEach(function(t) { df[t] = (df[t] || 0) + 1; });
    });
    INDEX = { docs: docs, df: df, n: docs.length };
}

// Rarest variant wins, so a generic word like "ארון" weighs less than "מגירות".
function idf(v) {
    var best = 0;
    v.forEach(function(x) { if (INDEX.df[x]) best = Math.max(best, Math.log(1 + INDEX.n / (1 + INDEX.df[x]))); });
    return best || Math.log(1 + INDEX.n);
}

function fieldMatch(set, v) {
    for (var i = 0; i < v.length; i++) if (set[v[i]]) return 1;
    var p = v[0];
    if (p.length < 3) return 0;
    for (var x in set) {
        if (x.length >= 3 && (x.indexOf(p) === 0 || p.indexOf(x) === 0)) return 0.5;
    }
    return 0;
}

function search(query) {
    if (!INDEX) buildIndex();
    var q = tokens(query);
    if (!q.length) return { results: [], coverage: 0 };
    var weights = q.map(idf);
    var total = weights.reduce(function(a, b) { return a + b; }, 0);
    var results = INDEX.docs.map(function(d) {
        var score = 0, matched = 0;
        q.forEach(function(v, i) {
            var best = 0, hit = 0;
            d.fields.forEach(function(f) {
                var m = fieldMatch(f[0], v);
                if (m * f[1] > best) { best = m * f[1]; hit = m; }
            });
            if (best) { score += best * weights[i]; matched += weights[i] * hit; }
        });
        return { doc: d, score: score, coverage: total ? matched / total : 0 };
    }).filter(function(r) { return r.score > 0; });
    results.sort(function(a, b) { return b.score - a.score; });
    return { results: results, coverage: results.length ? results[0].coverage : 0 };
}

// ── Logging ─────────────────────────────────────────────────────────────────
function logQuestion(question, source, matched) {
    try {
        var sb = window._supabase;
        if (!sb) return;
        sb.from('help_chat_log').insert({ question: question.slice(0, 1000), source: source, matched: matched || null })
            .then(function() {}, function() {});
    } catch (e) {}
}

// ── AI fallback ─────────────────────────────────────────────────────────────
var chatHistory = [];

async function askAI(question, context) {
    var sb = window._supabase;
    var session = sb && (await sb.auth.getSession()).data.session;
    if (!session) throw new Error('not_signed_in');
    var plan = window._plan || {};
    var res = await fetch(FN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + session.access_token },
        body: JSON.stringify({
            question: question,
            history: chatHistory.slice(-7, -1),
            plan: plan.label || '',
            context: context.map(function(r) { return { title: r.doc.title, text: r.doc.html.replace(/<[^>]+>/g, '') }; })
        })
    });
    var data = await res.json().catch(function() { return {}; });
    if (!res.ok) throw new Error(data.error || ('http_' + res.status));
    return data;
}

// ── UI ──────────────────────────────────────────────────────────────────────
function injectStyles() {
    if ($('help-chat-styles')) return;
    var css =
        '#btn-help-chat{background:rgba(255,255,255,.18);border:1.5px solid rgba(255,255,255,.35);color:#fff;border-radius:8px;padding:5px 10px;cursor:pointer;font-size:.8rem;font-weight:600;display:flex;align-items:center;gap:5px;white-space:nowrap;font-family:inherit}' +
        '#btn-help-chat:hover{background:rgba(255,255,255,.3)}' +
        '.sidebar-header-top{gap:6px}' +
        '#help-chat{position:fixed;bottom:16px;right:calc(var(--layout-sidebar-right,420px) + 16px);width:370px;height:min(560px,calc(100dvh - 32px));background:#fff;border-radius:16px;box-shadow:0 18px 50px rgba(15,23,42,.28),0 0 0 1px rgba(15,23,42,.06);display:none;flex-direction:column;z-index:100000;direction:rtl;font-family:inherit;overflow:hidden}' +
        '#help-chat.open{display:flex}' +
        '.hc-head{background:linear-gradient(135deg,#1E3A5F,#152B47);color:#fff;padding:12px 14px;display:flex;align-items:center;gap:10px}' +
        '.hc-head-ico{width:34px;height:34px;border-radius:50%;background:rgba(0,212,255,.18);display:flex;align-items:center;justify-content:center;color:#00D4FF;flex-shrink:0}' +
        '.hc-head-t{font-weight:700;font-size:.95rem}.hc-head-s{font-size:.72rem;opacity:.7}' +
        '.hc-close{margin-right:auto;background:none;border:none;color:#fff;font-size:1.1rem;cursor:pointer;opacity:.8;padding:4px 6px}' +
        '.hc-body{flex:1;overflow-y:auto;padding:14px;background:#F0F4F8;display:flex;flex-direction:column;gap:10px}' +
        '.hc-msg{max-width:88%;padding:9px 12px;border-radius:14px;font-size:.86rem;line-height:1.55;word-wrap:break-word}' +
        '.hc-bot{background:#fff;color:#1f2937;align-self:flex-start;border-bottom-right-radius:4px;box-shadow:0 1px 2px rgba(0,0,0,.05)}' +
        '.hc-user{background:#1E3A5F;color:#fff;align-self:flex-end;border-bottom-left-radius:4px}' +
        '.hc-acts{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}' +
        '.hc-btn{border:1px solid #1E3A5F;background:#fff;color:#1E3A5F;border-radius:999px;padding:4px 10px;font-size:.76rem;cursor:pointer;font-family:inherit;font-weight:600}' +
        '.hc-btn.primary{background:#1E3A5F;color:#fff}' +
        '.hc-chip{border:1px solid #cbd5e1;background:#fff;color:#334155;border-radius:999px;padding:5px 10px;font-size:.76rem;cursor:pointer;font-family:inherit;text-align:right}' +
        '.hc-chip:hover,.hc-btn:hover{border-color:#00D4FF}' +
        '.hc-src{font-size:.68rem;color:#94a3b8;margin-top:6px}' +
        '.hc-wa{font-size:.76rem;color:#0f766e;text-decoration:none;font-weight:600}' +
        '.hc-typing{display:inline-flex;gap:4px}.hc-typing span{width:6px;height:6px;border-radius:50%;background:#94a3b8;animation:hcDot 1s infinite}' +
        '.hc-typing span:nth-child(2){animation-delay:.15s}.hc-typing span:nth-child(3){animation-delay:.3s}' +
        '@keyframes hcDot{0%,80%,100%{opacity:.3}40%{opacity:1}}' +
        '.hc-foot{display:flex;gap:8px;padding:10px;border-top:1px solid #e2e8f0;background:#fff}' +
        '.hc-input{flex:1;border:1px solid #cbd5e1;border-radius:10px;padding:9px 11px;font-size:.88rem;font-family:inherit;resize:none;max-height:90px;direction:rtl}' +
        '.hc-input:focus{outline:none;border-color:#00D4FF}' +
        '.hc-send{background:#1E3A5F;color:#fff;border:none;border-radius:10px;width:42px;cursor:pointer;font-size:.95rem}' +
        '.hc-send:disabled{opacity:.5;cursor:default}' +
        '@media (max-width:768px){#help-chat{right:0;left:0;bottom:0;width:auto;height:85dvh;border-radius:16px 16px 0 0}}';
    var st = document.createElement('style');
    st.id = 'help-chat-styles';
    st.textContent = css;
    document.head.appendChild(st);
}

function buildDOM() {
    if ($('help-chat')) return;
    var el = document.createElement('div');
    el.id = 'help-chat';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', 'עוזר תמיכה');
    el.innerHTML =
        '<div class="hc-head">' +
            '<div class="hc-head-ico"><i class="fa-solid fa-robot"></i></div>' +
            '<div><div class="hc-head-t">עוזר AnyCloset</div><div class="hc-head-s">שאלו איך עושים כל דבר בתוכנה</div></div>' +
            '<button class="hc-close" type="button" title="סגור" aria-label="סגור">✕</button>' +
        '</div>' +
        '<div class="hc-body" id="hc-body"></div>' +
        '<div class="hc-foot">' +
            '<textarea class="hc-input" id="hc-input" rows="1" placeholder="למשל: איך מוסיפים מגירות?"></textarea>' +
            '<button class="hc-send" id="hc-send" type="button" title="שלח" aria-label="שלח"><i class="fa-solid fa-paper-plane"></i></button>' +
        '</div>';
    document.body.appendChild(el);

    el.querySelector('.hc-close').onclick = function() { window._closeHelpChat(); };
    $('hc-send').onclick = submit;
    $('hc-input').addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
        e.stopPropagation();
    });
    $('hc-input').addEventListener('keyup', function(e) { e.stopPropagation(); });
    welcome();
}

function addMsg(cls, html) {
    var body = $('hc-body');
    var m = document.createElement('div');
    m.className = 'hc-msg ' + cls;
    m.innerHTML = html;
    body.appendChild(m);
    body.scrollTop = body.scrollHeight;
    return m;
}

function chip(text, onClick) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'hc-chip';
    b.textContent = text;
    b.onclick = onClick;
    return b;
}

function welcome() {
    var m = addMsg('hc-bot', 'היי! אני העוזר של AnyCloset 3D. כתבו מה אתם רוצים לעשות בתוכנה, ואסביר צעד אחר צעד.<div class="hc-acts"></div>');
    var acts = m.querySelector('.hc-acts');
    SUGGESTIONS.forEach(function(s) { acts.appendChild(chip(s, function() { ask(s); })); });
}

function showMeButton(show) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'hc-btn primary';
    b.innerHTML = '<i class="fa-solid fa-hand-pointer"></i> הראה לי';
    b.onclick = function() {
        if (typeof window._startTourAt !== 'function') return;
        if (window.innerWidth <= 768) window._closeHelpChat();
        window._startTourAt(show[0], show[1]);
    };
    return b;
}

function waLink() {
    return '<a class="hc-wa" href="' + WA_URL + '" target="_blank" rel="noopener"><i class="fa-brands fa-whatsapp"></i> דברו איתנו בוואטסאפ</a>';
}

function renderKB(r, related) {
    var m = addMsg('hc-bot', '<b>' + esc(r.doc.title) + '</b><br>' + r.doc.html + '<div class="hc-acts"></div>');
    var acts = m.querySelector('.hc-acts');
    if (r.doc.show) acts.appendChild(showMeButton(r.doc.show));
    related.forEach(function(x) { acts.appendChild(chip(x.doc.title, function() { ask(x.doc.title); })); });
    $('hc-body').scrollTop = $('hc-body').scrollHeight;
}

function aiHtml(text) {
    return esc(text).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>');
}

var busy = false;

function submit() {
    var inp = $('hc-input');
    var q = inp.value.trim();
    if (!q || busy) return;
    inp.value = '';
    ask(q);
}

async function ask(q) {
    if (busy) return;
    addMsg('hc-user', esc(q));
    chatHistory.push({ role: 'user', text: q });
    var s = search(q);
    var top = s.results[0];

    if (top && s.coverage >= KB_MIN_COVERAGE) {
        var related = s.results.slice(1, 3).filter(function(x) { return x.score >= top.score * 0.6 && x.doc.title !== top.doc.title; });
        renderKB(top, related);
        chatHistory.push({ role: 'assistant', text: top.doc.title + ': ' + top.doc.html.replace(/<[^>]+>/g, '') });
        logQuestion(q, 'kb', top.doc.title);
        return;
    }

    busy = true;
    $('hc-send').disabled = true;
    var typing = addMsg('hc-bot', '<span class="hc-typing"><span></span><span></span><span></span></span>');
    var context = s.results.slice(0, 8);
    try {
        var data = await askAI(q, context);
        typing.remove();
        var m = addMsg('hc-bot', aiHtml(data.answer) + '<div class="hc-acts"></div><div class="hc-src">תשובה של AI. אם משהו לא מסתדר, ' + waLink() + '</div>');
        var ref = typeof data.ref === 'number' ? context[data.ref] : null;
        if (ref && ref.doc.show) m.querySelector('.hc-acts').appendChild(showMeButton(ref.doc.show));
        chatHistory.push({ role: 'assistant', text: data.answer });
    } catch (e) {
        typing.remove();
        var limited = String(e.message) === 'rate_limited';
        var guesses = s.results.slice(0, 3);
        var m2 = addMsg('hc-bot', (limited ? 'הגעתם למכסת השאלות היומית לעוזר ה-AI. ' : 'לא מצאתי תשובה מדויקת לשאלה הזו. ') +
            (guesses.length ? 'אולי התכוונתם לאחד מאלה?' : '') + '<div class="hc-acts"></div><div class="hc-src">' + waLink() + '</div>');
        guesses.forEach(function(x) { m2.querySelector('.hc-acts').appendChild(chip(x.doc.title, function() { ask(x.doc.title); })); });
        $('hc-body').scrollTop = $('hc-body').scrollHeight;
        logQuestion(q, guesses.length ? 'kb_fallback' : 'none', guesses.length ? guesses[0].doc.title : null);
    } finally {
        busy = false;
        $('hc-send').disabled = false;
    }
}

// ── Public API ──────────────────────────────────────────────────────────────
window._openHelpChat = function() {
    injectStyles();
    buildDOM();
    INDEX = null; // plan/edit state may have changed which tour steps apply
    $('help-chat').classList.add('open');
    setTimeout(function() { var i = $('hc-input'); if (i) i.focus(); }, 50);
};
window._closeHelpChat = function() {
    var el = $('help-chat');
    if (el) el.classList.remove('open');
};
window._helpSearch = search;
window._toggleHelpChat = function() {
    var el = $('help-chat');
    if (el && el.classList.contains('open')) window._closeHelpChat();
    else window._openHelpChat();
};

function mountButton() {
    var tourBtn = $('btn-start-tour');
    if (!tourBtn || $('btn-help-chat')) return;
    injectStyles();
    var b = document.createElement('button');
    b.id = 'btn-help-chat';
    b.type = 'button';
    b.title = 'עוזר תמיכה — שאלו איך עושים כל דבר';
    b.innerHTML = '<i class="fa-solid fa-comments"></i> עזרה';
    b.onclick = window._toggleHelpChat;
    tourBtn.parentNode.insertBefore(b, tourBtn.nextSibling);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountButton);
else mountButton();
})();
