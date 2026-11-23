// ==========================================
// Cabinet Chat — Hebrew text → create/edit cabinets
// Prefer cheap Gemini agent (cabinet-agent) grounded on past projects;
// fall back to local slot-filling rules when offline / unsigned / AI fails.
// ==========================================
(function () {
'use strict';

var CHAT_OFFSET_VAR = '--cabinet-chat-offset';
var DEFAULT_DEPTH = 54;
var DEFAULT_HEIGHT = 240;
var FN_URL = 'https://meqxnsjycvfgfhdepguo.supabase.co/functions/v1/cabinet-agent';
var AI_ENABLED = true;

var HEB_NUM = {
    'אפס': 0, 'אחד': 1, 'אחת': 1, 'שניים': 2, 'שתיים': 2, 'שני': 2, 'שתים': 2,
    'שלוש': 3, 'שלושה': 3, 'ארבע': 4, 'ארבעה': 4, 'חמש': 5, 'חמישה': 5,
    'שש': 6, 'שישה': 6, 'שבע': 7, 'שבעה': 7, 'שמונה': 8, 'תשע': 9, 'תשעה': 9,
    'עשר': 10, 'עשרה': 10
};

var SESSION = null; // { intent, slots, asked }
var HISTORY = [];
var STORAGE_PREFIX = 'anycloset:cabinetChat:v1:';
var MAX_STORED_MSGS = 120;
var _storageKeyActive = null;
var _persistTimer = null;
/** Last lesson saved from a successful apply — used for reject/correct learning. */
var _lastLessonId = null;
var _lastLessonRequest = '';
var _pendingCorrection = false;
/** Notes from last apply (e.g. drawer count capped by cell height). */
var _lastApplyNotes = [];

function storageKey() {
    var pid = (typeof window !== 'undefined' && window._currentProjectId) ? String(window._currentProjectId) : '';
    return STORAGE_PREFIX + (pid || 'draft');
}

function persistChatNow() {
    try {
        var key = storageKey();
        _storageKeyActive = key;
        var payload = {
            history: HISTORY.slice(-MAX_STORED_MSGS),
            session: SESSION,
            expanded: !!(document.getElementById('cabinet-chat') &&
                document.getElementById('cabinet-chat').classList.contains('expanded')),
            updatedAt: Date.now()
        };
        localStorage.setItem(key, JSON.stringify(payload));
    } catch (e) { /* quota / private mode */ }
}

function persistChat() {
    if (_persistTimer) clearTimeout(_persistTimer);
    _persistTimer = setTimeout(persistChatNow, 120);
}

function renderHistoryToDom() {
    var log = document.getElementById('cabinet-chat-log');
    if (!log) return;
    log.innerHTML = '';
    HISTORY.forEach(function (h) {
        if (!h || !h.text) return;
        var div = document.createElement('div');
        div.className = 'cab-chat-bubble cab-chat-' + (h.role === 'user' ? 'user' : 'bot');
        div.innerHTML = esc(h.text).replace(/\n/g, '<br>');
        log.appendChild(div);
    });
    log.scrollTop = log.scrollHeight;
    measureAndSetOffset();
}

function normalizeChatPayload(raw) {
    if (!raw || !Array.isArray(raw.history) || !raw.history.length) return null;
    return {
        history: raw.history.slice(-MAX_STORED_MSGS).map(function (h) {
            return { role: h.role === 'user' ? 'user' : 'bot', text: String(h.text || '') };
        }).filter(function (h) { return h.text; }),
        session: raw.session && typeof raw.session === 'object' ? raw.session : null,
        expanded: !!raw.expanded,
        updatedAt: Number(raw.updatedAt) || 0
    };
}

function exportChatState() {
    return {
        history: HISTORY.slice(-MAX_STORED_MSGS),
        session: SESSION,
        expanded: !!(document.getElementById('cabinet-chat') &&
            document.getElementById('cabinet-chat').classList.contains('expanded')),
        updatedAt: Date.now()
    };
}

function importChatState(payload, opts) {
    var n = normalizeChatPayload(payload);
    if (!n || !n.history.length) return false;
    HISTORY = n.history;
    SESSION = n.session;
    renderHistoryToDom();
    if (n.expanded || HISTORY.length > 1) setExpanded(true);
    if (!(opts && opts.skipPersist)) persistChatNow();
    return true;
}

function restoreChat() {
    var key = storageKey();
    _storageKeyActive = key;
    var local = null;
    try {
        local = normalizeChatPayload(JSON.parse(localStorage.getItem(key) || 'null'));
    } catch (e) { local = null; }

    // Prefer project-synced chat (other computer) when newer or local empty
    var fromProject = normalizeChatPayload(window._projectCabinetChat);
    var restored = local;
    if (fromProject && fromProject.history.length) {
        if (!local || !local.history.length || (fromProject.updatedAt || 0) >= (local.updatedAt || 0)) {
            restored = fromProject;
        }
    }

    if (restored && restored.history.length) {
        HISTORY = restored.history;
        SESSION = restored.session;
        renderHistoryToDom();
        if (restored.expanded || HISTORY.length > 1) setExpanded(true);
        persistChatNow();
        return true;
    }

    HISTORY = [];
    SESSION = null;
    renderHistoryToDom();
    return false;
}

function ensureWelcome() {
    if (HISTORY.length) return;
    appendBubble('bot', 'סוכן AI זול שלומד מפרויקטים קודמים — נסו: «ארון רוחב 275 גובה 270 עם תלייה ומדפים»');
}

function watchProjectChanges() {
    setInterval(function () {
        var key = storageKey();
        if (key === _storageKeyActive) return;
        // Project switched — flush previous key already saved; load the new one
        restoreChat();
        ensureWelcome();
    }, 800);
}

function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
}

function normalize(text) {
    return String(text || '')
        .replace(/[\u0591-\u05C7]/g, '')
        .replace(/[״"']/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function parseHebNumberToken(tok) {
    if (!tok) return null;
    if (HEB_NUM[tok] != null) return HEB_NUM[tok];
    var n = parseFloat(String(tok).replace(',', '.'));
    return isFinite(n) ? n : null;
}

/** Extract numeric values; meters (≤12) → cm when clearly room/cabinet scale. */
function toCm(n, hintMeters) {
    if (n == null || !isFinite(n)) return null;
    if (hintMeters || (n > 0 && n <= 12 && String(n).indexOf('.') >= 0)) return Math.round(n * 100);
    if (hintMeters || (n > 0 && n <= 6 && Number.isInteger(n) === false)) return Math.round(n * 100);
    // bare small integers next to מטר
    return Math.round(n);
}

/** Labeled cabinet dim: unit, or values ≤12 → meters (גובה 2.66 / אורך 2.10). */
function parseCabinetDim(numStr, unit, kind) {
    var n = parseFloat(String(numStr).replace(',', '.'));
    if (!isFinite(n) || n <= 0) return null;
    if (unit && /מטר|מ'|מ\b|m\b|meter/i.test(unit)) return Math.round(n * 100);
    if (kind === 'depth') {
        if (n <= 2) return Math.round(n * 100);
        return Math.round(n);
    }
    // width / height / length — 2.66 or bare 3 → meters; 210 / 266 → cm
    if (n <= 12) return Math.round(n * 100);
    return Math.round(n);
}

/**
 * Split a message into per-cabinet blocks: "ארון 1: … ארון 2: …"
 * Returns null if fewer than 2 blocks.
 */
function splitCabinetBlocks(text) {
    var raw = String(text || '');
    var re = /(?:^|\n)\s*ארון\s*(\d+)\s*[:.\-–—]?\s*/gi;
    var hits = [];
    var m;
    while ((m = re.exec(raw))) {
        hits.push({ n: parseInt(m[1], 10), start: m.index, bodyStart: m.index + m[0].length });
    }
    if (hits.length < 2) {
        // Also: "ארון ראשון" / "הארון השני" light fallback — require numbered form
        return null;
    }
    var blocks = [];
    for (var i = 0; i < hits.length; i++) {
        var end = i + 1 < hits.length ? hits[i + 1].start : raw.length;
        var body = raw.slice(hits[i].bodyStart, end).trim();
        if (body) blocks.push({ index: hits[i].n, text: body });
    }
    return blocks.length >= 2 ? blocks : null;
}

function parseMultiCabinetSlots(text) {
    var blocks = splitCabinetBlocks(text);
    if (!blocks) return null;
    return blocks.map(function (b) {
        var slots = parseSlots(b.text);
        slots.name = 'ארון ' + b.index;
        return slots;
    });
}

function extractNumbers(text) {
    var out = [];
    var re = /(\d+(?:[.,]\d+)?)/g;
    var m;
    while ((m = re.exec(text))) {
        out.push({ value: parseFloat(m[1].replace(',', '.')), index: m.index, raw: m[1] });
    }
    return out;
}

function hasAny(text, words) {
    for (var i = 0; i < words.length; i++) {
        if (text.indexOf(words[i]) >= 0) return true;
    }
    return false;
}

function detectIntent(text) {
    var t = text;
    if (SESSION && SESSION.awaiting) return 'answer';
    if (hasAny(t, ['בטל', 'ביטול', 'שכח מזה', 'תתחיל מחדש', 'איפוס שיחה'])) return 'cancel';
    if (hasAny(t, ['עזרה', 'מה אפשר', 'איך משתמשים']) || /^[?؟]\s*$/.test(t)) return 'help';
    if (hasAny(t, ['חדר ארונות', 'חדר הלבשה', 'ווקינא', 'walk in', 'walkin'])) return 'create_walkin';
    if (splitCabinetBlocks(text)) return 'create_many';
    if (hasAny(t, ['צור', 'תיצור', 'תעשה לי', 'ארון חדש', 'בנה', 'תבנה', 'תתחיל ארון'])) return 'create';
    if (hasAny(t, ['שנה', 'תשנה', 'עדכן', 'תעדכן', 'תוסיף', 'תוסיפי', 'תוריד', 'תורידי', 'תגדיל', 'תקטין', 'תשים'])) return 'edit';
    // Bare description without verb → create if no meaningful cabinet yet, else edit
    if (hasAny(t, ['ארון', 'עמודות', 'מגירות', 'דלתות', 'גובה', 'רוחב', 'אורך', 'עומק', 'חזית'])) {
        var cols = (typeof state !== 'undefined' && state.columns) ? state.columns.length : 0;
        var w = (typeof state !== 'undefined') ? (state.width || 0) : 0;
        if (!cols || w <= 0) return 'create';
        return 'edit';
    }
    return 'unknown';
}

function parseSlots(text) {
    var t = normalize(text).toLowerCase();
    // Keep Hebrew as-is for matching (toLowerCase doesn't hurt Hebrew)
    t = normalize(text);
    var slots = {};
    var nums = extractNumbers(t);

    // Explicit labeled dims (אורך = רוחב; 2.66 / 2.10 → מטרים)
    var m;
    m = t.match(/(?:רוחב|אורך|אורכו)\s*(?:של\s*)?(?:ל\s*[-–—]?\s*)?(\d+(?:[.,]\d+)?)\s*(ס"?מ|סמ|cm|מטר|מ'|מ|m)?/i);
    if (m) slots.width = parseCabinetDim(m[1], m[2], 'width');
    m = t.match(/גובה\s*(?:של\s*)?(?:הארונות?\s*)?(?:הוא\s*)?(?:ל\s*[-–—]?\s*)?(\d+(?:[.,]\d+)?)\s*(ס"?מ|סמ|cm|מטר|מ'|מ|m)?/i);
    if (m) slots.height = parseCabinetDim(m[1], m[2], 'height');
    m = t.match(/עומק\s*(?:של\s*)?(?:ל\s*[-–—]?\s*)?(\d+(?:[.,]\d+)?)\s*(ס"?מ|סמ|cm|מטר|מ'|מ|m)?/i);
    if (m) slots.depth = parseCabinetDim(m[1], m[2], 'depth');

    // Room "2 על 3 מטר" / "2x3 מ"
    m = t.match(/(\d+(?:[.,]\d+)?)\s*(?:על|x|×)\s*(\d+(?:[.,]\d+)?)\s*(מטר|מ'|מ\b)/i);
    if (m) {
        slots.roomW = Math.round(parseFloat(m[1].replace(',', '.')) * 100);
        slots.roomD = Math.round(parseFloat(m[2].replace(',', '.')) * 100);
    }

    // Pair dims "240 על 60" or "240x60x54" — wardrobe W×D or W×H heuristic
    m = t.match(/(\d+(?:[.,]\d+)?)\s*(?:על|x|×)\s*(\d+(?:[.,]\d+)?)(?:\s*(?:על|x|×)\s*(\d+(?:[.,]\d+)?))?/i);
    if (m && slots.width == null) {
        var a = Math.round(parseFloat(m[1].replace(',', '.')));
        var b = Math.round(parseFloat(m[2].replace(',', '.')));
        var c = m[3] != null ? Math.round(parseFloat(m[3].replace(',', '.'))) : null;
        if (c != null) {
            // W × D × H or W × H × D — tallest is height
            var arr = [a, b, c].sort(function (x, y) { return x - y; });
            slots.depth = arr[0] <= 80 ? arr[0] : DEFAULT_DEPTH;
            slots.width = a >= 80 ? a : (b >= 80 ? b : a);
            slots.height = Math.max(a, b, c);
            if (slots.height < 100) slots.height = DEFAULT_HEIGHT;
        } else {
            // Two numbers: if one is typical depth (30–70) and other width (≥80) → W×D
            // if one is tall (≥180) → that is height
            if (Math.max(a, b) >= 180 && Math.min(a, b) >= 80) {
                slots.width = Math.min(a, b) < 180 ? Math.min(a, b) : a;
                slots.height = Math.max(a, b);
            } else if ((a >= 80 && b >= 25 && b <= 75) || (b >= 80 && a >= 25 && a <= 75)) {
                slots.width = a >= 80 ? a : b;
                slots.depth = a >= 80 ? b : a;
            } else if (a >= 80 || b >= 80) {
                slots.width = Math.max(a, b);
                if (Math.min(a, b) >= 100) slots.height = Math.min(a, b);
            }
        }
    }

    // Columns — with or without a number (bare "עמודות" → ask count later)
    m = t.match(/(\d+|שתיים|שני|שלוש|שלושה|ארבע|ארבעה|חמש|חמישה|שש|שישה)\s*עמוד(?:ות|ה)?/);
    if (m) {
        var cn = parseHebNumberToken(m[1]);
        if (cn != null) slots.columns = Math.max(1, Math.min(12, Math.round(cn)));
    }
    m = t.match(/עמוד(?:ות|ה)?\s*[:\-]?\s*(\d+)/);
    if (m) slots.columns = Math.max(1, Math.min(12, parseInt(m[1], 10)));
    if (slots.columns == null && /עמוד(?:ות|ה)/.test(t) &&
        !/עמוד(?:ות|ה)?\s*(?:של\s*)?(?:מדפ|תלי|מגיר)/.test(t) &&
        !/(?:מדפ|תלי|מגיר)\w*\s*עמוד/.test(t)) {
        slots.askColumns = true;
    }

    // Drawer kind (פנימיות / חיצוניות) — don't match bare words inside "חזיתות פנימיות"
    if (hasAny(t, ['מגירות חיצוניות', 'מגירה חיצונית'])) slots.drawerKind = 'external';
    else if (hasAny(t, ['מגירות פנימיות', 'מגירה פנימית'])) slots.drawerKind = 'internal';
    else if (SESSION && SESSION.awaiting === 'drawerKind') {
        if (/חיצונ|חוץ|external/i.test(t)) slots.drawerKind = 'external';
        else if (/פנימ|פנים|internal/i.test(t)) slots.drawerKind = 'internal';
    }

    // Drawer count — "4 מגירות" / bare "מגירות" → ask count later
    m = t.match(/(\d+|שתיים|שני|שלוש|שלושה|ארבע|ארבעה|חמש|חמישה)\s*מגירות/);
    if (m) {
        var dn = parseHebNumberToken(m[1]);
        if (dn != null) slots.drawerCount = Math.max(1, Math.min(8, Math.round(dn)));
        slots.drawers = true;
    }
    if (hasAny(t, ['מגירות', 'מגירה'])) slots.drawers = true;
    if (hasAny(t, ['בלי מגירות', 'ללא מגירות'])) {
        slots.drawers = false;
        slots.drawerCount = 0;
        slots.drawerKind = null;
    }
    // "עמודת מגירות" / "עמודות מגירות" without count
    m = t.match(/(\d+|שתיים|שני|שלוש|שלושה|ארבע|ארבעה)\s*עמוד(?:ות|ה)?\s*(?:של\s*)?מגירות/);
    if (m) {
        var dcn = parseHebNumberToken(m[1]);
        if (dcn != null) slots.drawerColumns = Math.max(1, Math.min(6, Math.round(dcn)));
        slots.drawers = true;
    } else if (/עמוד(?:ות|ה)?\s*(?:של\s*)?מגירות|מגירות\s*ב\s*עמוד/.test(t)) {
        slots.drawers = true;
        slots.askDrawerColumns = true;
    }

    // Front style (before doors — "חזיתות פרופיל" is not a door request)
    if (hasAny(t, ['חזיתות פרופיל', 'פרופיל', 'מסגרת מלמין', 'חזית פרופיל'])) slots.frontFaceStyle = 'profile';
    else if (hasAny(t, ['חזיתות פנימיות', 'חזית פנימית'])) slots.frontStyle = 'internal';
    else if (hasAny(t, ['חזיתות חיצוניות', 'חזית חיצונית'])) slots.frontStyle = 'external';

    // Doors
    if (hasAny(t, ['בלי דלתות', 'ללא דלתות', 'בלי חזיתות', 'פתוח'])) slots.hasDoors = false;
    else if (hasAny(t, ['עם דלתות', 'דלתות', 'דלת'])) slots.hasDoors = true;
    else if (hasAny(t, ['חזיתות']) && !slots.frontFaceStyle && !slots.frontStyle) slots.hasDoors = true;

    // Content layout — "2 תלייה" / "ו2 תליה" = hanging column count
    m = t.match(/(?:ו)?\s*(\d+|שתיים|שני|שלוש|שלושה|ארבע|ארבעה)\s*תלי[יה]/);
    if (m) {
        var hn = parseHebNumberToken(m[1]);
        if (hn != null) {
            slots.hangingColumns = Math.max(1, Math.min(12, Math.round(hn)));
            slots.hanging = true;
        }
    }
    m = t.match(/(\d+|שתיים|שני|שלוש|שלושה|ארבע|ארבעה)\s*עמוד(?:ות|ה)?\s*(?:של\s*)?תלי[יה]/);
    if (m) {
        var hcn = parseHebNumberToken(m[1]);
        if (hcn != null) {
            slots.hangingColumns = Math.max(1, Math.min(12, Math.round(hcn)));
            slots.hanging = true;
        }
    } else if (/עמוד(?:ות|ה)?\s*(?:של\s*)?תלי[יה]/.test(t)) {
        slots.hanging = true;
        slots.askHangingColumns = true;
    }
    if (hasAny(t, ['תלייה', 'תליה', 'מוט', 'בגדים', 'מתלה'])) slots.hanging = true;

    // "כל השאר מדפים" / "השאר מדפים" / N מדפים
    if (hasAny(t, ['כל השאר מדפים', 'השאר מדפים', 'יתר מדפים', 'שאר מדפים'])) {
        slots.shelves = true;
        slots.restShelves = true;
    }
    m = t.match(/(\d+|שתיים|שני|שלוש|שלושה|ארבע|ארבעה)\s*עמוד(?:ות|ה)?\s*(?:של\s*)?מדפים/);
    if (m) {
        var sn = parseHebNumberToken(m[1]);
        if (sn != null) slots.shelfColumns = Math.max(1, Math.min(12, Math.round(sn)));
        slots.shelves = true;
    } else if (/עמוד(?:ות|ה)?\s*(?:של\s*)?מדפים/.test(t)) {
        slots.shelves = true;
        slots.askShelfColumns = true;
    }
    if (hasAny(t, ['מדפים', 'מדף'])) slots.shelves = true;
    if (hasAny(t, ['כוורת'])) slots.openCell = true;

    // Walk-in walls
    m = t.match(/(\d+|שלוש|שלושה|שתיים|שני|ארבע)\s*דפנות/);
    if (m) {
        var wn = parseHebNumberToken(m[1]);
        if (wn != null) slots.walls = Math.max(2, Math.min(4, Math.round(wn)));
    }
    if (hasAny(t, ['שלוש דפנות', '3 דפנות'])) slots.walls = 3;
    if (slots.walls == null && /דפנות|דופן/.test(t) && hasAny(t, ['חדר ארונות', 'חדר הלבשה', 'ווקינ', 'walk'])) {
        slots.askWalls = true;
    }

    // Lone height after "גובה … 270" already handled; if only one large number + גובה word nearby
    if (slots.height == null && /גובה/.test(t) && nums.length) {
        for (var i = 0; i < nums.length; i++) {
            if (nums[i].value >= 100 && nums[i].value <= 370) { slots.height = Math.round(nums[i].value); break; }
        }
    }

    // Answer mode: single number fills awaiting quantity/dim slot
    if (SESSION && SESSION.awaiting && nums.length === 1) {
        var onlyKeys = Object.keys(slots).filter(function (k) {
            return slots[k] != null && k !== 'askColumns' && k !== 'askHangingColumns' &&
                k !== 'askShelfColumns' && k !== 'askDrawerColumns' && k !== 'askWalls';
        });
        var bareAnswer = onlyKeys.length === 0;
        var awaitQty = /^(width|height|depth|columns|drawerCount|hangingColumns|shelfColumns|drawerColumns|walls)$/
            .test(SESSION.awaiting);
        if (bareAnswer || (awaitQty && slots[SESSION.awaiting] == null)) {
            var only = Math.round(nums[0].value);
            if (SESSION.awaiting === 'width') slots.width = only <= 12 ? only * 100 : only;
            else if (SESSION.awaiting === 'height') slots.height = only <= 12 ? only * 100 : only;
            else if (SESSION.awaiting === 'depth') slots.depth = only <= 3 ? only * 100 : only;
            else if (SESSION.awaiting === 'columns') slots.columns = Math.max(1, Math.min(12, only));
            else if (SESSION.awaiting === 'drawerCount') {
                slots.drawerCount = Math.max(1, Math.min(8, only));
                slots.drawers = true;
            } else if (SESSION.awaiting === 'hangingColumns') {
                slots.hangingColumns = Math.max(1, Math.min(12, only));
                slots.hanging = true;
            } else if (SESSION.awaiting === 'shelfColumns') {
                slots.shelfColumns = Math.max(1, Math.min(12, only));
                slots.shelves = true;
            } else if (SESSION.awaiting === 'drawerColumns') {
                slots.drawerColumns = Math.max(1, Math.min(6, only));
                slots.drawers = true;
            } else if (SESSION.awaiting === 'walls') {
                slots.walls = Math.max(2, Math.min(4, only));
            } else if (SESSION.awaiting === 'hasDoors') {
                if (hasAny(t, ['כן', 'עם', 'בטח'])) slots.hasDoors = true;
                else if (hasAny(t, ['לא', 'בלי'])) slots.hasDoors = false;
            }
        }
    }
    // Yes/no answers
    if (SESSION && SESSION.awaiting === 'hasDoors') {
        if (hasAny(t, ['כן', 'עם דלתות', 'בטח'])) slots.hasDoors = true;
        if (hasAny(t, ['לא', 'בלי', 'פתוח'])) slots.hasDoors = false;
    }

    return slots;
}

function mergeSlots(base, extra) {
    var out = Object.assign({}, base || {});
    Object.keys(extra || {}).forEach(function (k) {
        if (extra[k] != null) out[k] = extra[k];
    });
    // Propagate shared answers into each cabinet in a multi-create session
    if (out.cabinets && Array.isArray(out.cabinets) && extra) {
        var prop = {};
        ['drawerKind', 'drawerCount', 'drawerColumns', 'hangingColumns', 'shelfColumns', 'columns'].forEach(function (k) {
            if (extra[k] != null) prop[k] = extra[k];
        });
        if (Object.keys(prop).length) {
            out.cabinets = out.cabinets.map(function (c) {
                return mergeSlots(c, prop);
            });
        }
    }
    return out;
}

/** Quantity / choice slots that must be asked when the user mentioned the feature without a number. */
function missingQuantities(slots) {
    var miss = [];
    if (!slots) return miss;
    if (slots.drawers && (slots.drawerCount == null || slots.drawerCount === '')) miss.push('drawerCount');
    if (slots.drawers && !slots.drawerKind) miss.push('drawerKind');
    if ((slots.askDrawerColumns || (slots.drawers && slots.drawerColumns === 0)) && slots.drawerColumns == null) {
        // only when explicitly asked for drawer-columns without a number
        if (slots.askDrawerColumns) miss.push('drawerColumns');
    }
    if (slots.askColumns && slots.columns == null) miss.push('columns');
    if (slots.askHangingColumns && slots.hangingColumns == null) miss.push('hangingColumns');
    if (slots.askShelfColumns && slots.shelfColumns == null) miss.push('shelfColumns');
    if (slots.askWalls && slots.walls == null) miss.push('walls');
    return miss;
}

function missingForCreate(slots) {
    var miss = [];
    if (slots.width == null) miss.push('width');
    if (slots.height == null) miss.push('height');
    return miss.concat(missingQuantities(slots));
}

function missingForWalkin(slots) {
    var miss = [];
    if (slots.roomW == null && slots.width == null) miss.push('roomW');
    if (slots.height == null) miss.push('height');
    if (slots.walls == null) miss.push('walls');
    return miss.concat(missingQuantities(slots));
}

function questionFor(slot) {
    switch (slot) {
        case 'width': return 'מה רוחב הארון בס״מ?';
        case 'height': return 'מה גובה הארון בס״מ?';
        case 'depth': return 'מה עומק הארון בס״מ? (ברירת מחדל 54)';
        case 'columns': return 'כמה עמודות?';
        case 'hasDoors': return 'עם דלתות? (כן / לא)';
        case 'drawerCount': return 'כמה מגירות?';
        case 'drawerColumns': return 'בכמה עמודות לשים מגירות?';
        case 'hangingColumns': return 'בכמה עמודות לשים תלייה?';
        case 'shelfColumns': return 'בכמה עמודות לשים מדפים?';
        case 'drawerKind': return 'המגירות פנימיות או חיצוניות?';
        case 'roomW': return 'מה מידות החדר? למשל: 2 על 3 מטר';
        case 'walls': return 'כמה דפנות לארון? (2 / 3)';
        default: return 'אפשר לפרט קצת יותר?';
    }
}

/** Fallback only — prefer ~70cm/col (learned from real projects), not width/60. */
function defaultColumns(width) {
    var w = width || 160;
    var n = Math.round(w / 70);
    return Math.max(1, Math.min(8, n));
}

function snapshotCurrentState() {
    var cols = (typeof state !== 'undefined' && state.columns) ? state.columns : [];
    var hang = 0, drawers = 0;
    cols.forEach(function (col) {
        if (!col || !col.compartments) return;
        var types = col.compartments.map(function (c) { return c && c.type; });
        if (types.indexOf('hanging') >= 0 || types.indexOf('hanging_double') >= 0) hang++;
        if (types.indexOf('internal_drawers') >= 0 || types.indexOf('external_drawers') >= 0) drawers++;
    });
    return {
        width: (typeof state !== 'undefined') ? state.width : null,
        height: (typeof state !== 'undefined') ? state.globalHeight : null,
        depth: (typeof state !== 'undefined') ? state.depth : null,
        columns: cols.length || 0,
        hasDoors: (typeof state !== 'undefined') ? !!state.hasDoors : true,
        frontFaceStyle: (typeof state !== 'undefined') ? (state.frontFaceStyle || 'solid') : 'solid',
        frontStyle: (typeof state !== 'undefined') ? (state.frontStyle || 'external') : 'external',
        hangingColumns: hang,
        drawerColumns: drawers,
        model: (typeof state !== 'undefined') ? (state.cabinetModel || 'linear') : 'linear',
        cartCount: (typeof state !== 'undefined' && state.orderCart) ? state.orderCart.length : 0
    };
}

function normalizeAiActions(actions) {
    var a = actions || {};
    var slots = {};
    ['width', 'height', 'depth', 'columns', 'hangingColumns', 'shelfColumns',
        'drawerCount', 'drawerColumns', 'walls', 'roomW', 'roomD'].forEach(function (k) {
        if (a[k] != null && a[k] !== '' && isFinite(Number(a[k]))) slots[k] = Number(a[k]);
    });
    if (a.hasDoors === true || a.hasDoors === false) slots.hasDoors = a.hasDoors;
    if (a.hanging === true || a.hanging === false) slots.hanging = a.hanging;
    if (a.shelves === true || a.shelves === false) slots.shelves = a.shelves;
    if (a.restShelves === true) slots.restShelves = true;
    if (a.drawers === true || a.drawers === false) slots.drawers = a.drawers;
    if (a.drawerKind === 'internal' || a.drawerKind === 'external') slots.drawerKind = a.drawerKind;
    if (a.frontFaceStyle === 'profile' || a.frontFaceStyle === 'solid') slots.frontFaceStyle = a.frontFaceStyle;
    if (a.frontStyle === 'internal' || a.frontStyle === 'external') slots.frontStyle = a.frontStyle;
    // Explicit per-column template picks from the AI (ids or names)
    if (Array.isArray(a.columnTemplates)) {
        slots.columnTemplates = a.columnTemplates.map(function (x) {
            if (x == null) return null;
            if (typeof x === 'string' || typeof x === 'number') return String(x);
            if (typeof x === 'object') return x.templateId || x.id || x.templateName || x.name || null;
            return null;
        });
    }
    // Multi-cabinet batch from AI
    if (Array.isArray(a.cabinets) && a.cabinets.length >= 2) {
        slots.cabinets = a.cabinets.map(function (c, i) {
            var one = normalizeAiActions(c && typeof c === 'object' ? c : {});
            if (!one.name) one.name = (c && c.name) ? String(c.name) : ('ארון ' + (i + 1));
            return one;
        });
    }
    return slots;
}

function looksLikeNegativeFeedback(text) {
    var t = normalize(text);
    return /לא\s*(טוב|ככה|נכון|זה|מתאים)|תקן|תתקן|שנה\s*את|תשנה|בטל\s*את|לא\s*מה\s*ש|הפוך|מחדש\s*בלי/.test(t);
}

/** Recent user turns that led to this apply (for learning context). */
function collectRequestTranscript(fallbackMsg) {
    var parts = [];
    for (var i = HISTORY.length - 1; i >= 0 && parts.length < 6; i--) {
        var h = HISTORY[i];
        if (!h) continue;
        if (h.role === 'user') parts.unshift(String(h.text || '').slice(0, 400));
        else if (h.role === 'bot' && parts.length) break;
    }
    if (!parts.length && fallbackMsg) parts = [String(fallbackMsg).slice(0, 800)];
    return parts.join(' | ').slice(0, 1800);
}

function compactActionsForLesson(actions) {
    var a = actions || {};
    var out = {};
    Object.keys(a).forEach(function (k) {
        if (a[k] == null || a[k] === '') return;
        if (k === 'columnTemplates' && Array.isArray(a[k])) {
            out[k] = a[k].map(function (x) { return x == null ? null : String(x).slice(0, 40); });
            return;
        }
        out[k] = a[k];
    });
    return out;
}

function outcomeLineFromState() {
    var s = snapshotCurrentState();
    var bits = [];
    if (s.width) bits.push('W' + s.width);
    if (s.height) bits.push('H' + s.height);
    if (s.depth) bits.push('D' + s.depth);
    if (s.columns) bits.push(s.columns + 'עמודות');
    if (s.hangingColumns) bits.push(s.hangingColumns + 'תלייה');
    if (s.drawerColumns) bits.push(s.drawerColumns + 'מגירות');
    bits.push(s.hasDoors ? 'עם-דלתות' : 'בלי-דלתות');
    if (s.frontFaceStyle === 'profile') bits.push('פרופיל');
    return bits.join(' ').slice(0, 700);
}

async function markLastLessonRejected() {
    if (!_lastLessonId) return;
    var sb = window._supabase;
    if (!sb) return;
    try {
        await sb.from('cabinet_chat_lessons')
            .update({ feedback: 'rejected' })
            .eq('id', _lastLessonId);
        _pendingCorrection = true;
    } catch (e) {
        console.warn('[cabinet-chat] reject lesson:', e && e.message);
    }
}

async function recordLesson(opts) {
    var sb = window._supabase;
    if (!sb) return null;
    try {
        var session = (await sb.auth.getSession()).data.session;
        if (!session) return null;
        var row = {
            request: String(opts.request || '').slice(0, 2000),
            actions: compactActionsForLesson(opts.actions || {}),
            outcome: String(opts.outcome || '').slice(0, 800),
            feedback: opts.feedback || 'applied',
            kind: opts.kind || 'create'
        };
        var res = await sb.from('cabinet_chat_lessons').insert(row).select('id').single();
        if (res.error) {
            console.warn('[cabinet-chat] lesson save:', res.error.message);
            return null;
        }
        _lastLessonId = res.data && res.data.id;
        _lastLessonRequest = row.request;
        _pendingCorrection = false;
        return _lastLessonId;
    } catch (e) {
        console.warn('[cabinet-chat] lesson save:', e && e.message);
        return null;
    }
}

function learnFromSuccessfulApply(actions, intent) {
    var request = collectRequestTranscript(_lastLessonRequest);
    var kind = _pendingCorrection ? 'correction'
        : (intent === 'walkin' || intent === 'create_walkin') ? 'walkin'
            : (intent === 'edit') ? 'edit' : 'create';
    var feedback = _pendingCorrection ? 'corrected' : 'applied';
    // Fire-and-forget; don't block UI
    recordLesson({
        request: request,
        actions: actions,
        outcome: outcomeLineFromState(),
        kind: kind,
        feedback: feedback
    });
}

function applyAiResult(data) {
    var intent = data.intent || 'create';
    var actions = normalizeAiActions(data.actions);

    if (data.ready !== true) {
        var q = data.question || null;
        var pendingIntent = intent === 'walkin' ? 'create_walkin'
            : (intent === 'edit' ? 'edit'
                : (intent === 'create_many' || (actions.cabinets && actions.cabinets.length >= 2) ? 'create_many' : 'create'));
        SESSION = {
            intent: pendingIntent,
            slots: mergeSlots((SESSION && SESSION.slots) || {}, actions),
            awaiting: q || 'width',
            asked: ((SESSION && SESSION.asked) || []).concat(q ? [q] : []),
            fromAi: true
        };
        return { reply: data.reply || (q ? questionFor(q) : helpText()) };
    }

    if (intent === 'cancel') {
        SESSION = null;
        return { reply: data.reply || 'ביטלתי.' };
    }
    if (intent === 'help' || intent === 'clarify') {
        if (!data.ready) return { reply: data.reply || helpText() };
    }

    // Merge with any pending session slots from prior clarifying answers
    if (SESSION && SESSION.slots) actions = mergeSlots(SESSION.slots, actions);
    SESSION = null;

    _lastApplyNotes = [];
    var msg;
    if (intent === 'walkin' || intent === 'create_walkin') {
        msg = applyWalkin(actions);
    } else if (intent === 'edit') {
        msg = applyEdit(actions);
        if (!msg) msg = data.reply || 'לא זיהיתי שינוי לבצע.';
        else if (data.reply) msg = data.reply;
    } else if (intent === 'create_many' || (actions.cabinets && actions.cabinets.length >= 2)) {
        var manyMiss = missingForMany(actions.cabinets);
        if (manyMiss.length) {
            SESSION = { intent: 'create_many', slots: actions, awaiting: manyMiss[0], asked: [manyMiss[0]], fromAi: true };
            return { reply: (data.reply ? data.reply + '\n' : '') + questionFor(manyMiss[0]) };
        }
        msg = applyCreateMany(actions.cabinets);
        if (data.reply) msg = data.reply + '\n' + msg;
        intent = 'create_many';
    } else {
        // create (default) — if missing critical dims, ask locally
        var miss = missingForCreate(actions);
        if (miss.length) {
            SESSION = { intent: 'create', slots: actions, awaiting: miss[0], asked: [miss[0]], fromAi: true };
            return { reply: (data.reply ? data.reply + '\n' : '') + questionFor(miss[0]) };
        }
        msg = applyCreateLinear(actions);
        if (data.reply) msg = data.reply;
    }
    msg = (msg || '') + takeApplyNotesSuffix();
    return { reply: msg, done: true, learnActions: actions, learnIntent: intent };
}

async function askCabinetAI(message) {
    var sb = window._supabase;
    if (!sb) throw new Error('no_supabase');
    var session = (await sb.auth.getSession()).data.session;
    if (!session) throw new Error('not_signed_in');
    var hist = HISTORY.slice(-8).map(function (h) {
        return { role: h.role === 'bot' ? 'assistant' : h.role, text: h.text };
    });
    // Drop the message we just appended as user (last) — server gets it as `message`
    if (hist.length && hist[hist.length - 1].role === 'user') hist = hist.slice(0, -1);
    var res = await fetch(FN_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + session.access_token
        },
        body: JSON.stringify({
            message: message,
            current: snapshotCurrentState(),
            pending: SESSION ? { intent: SESSION.intent, slots: SESSION.slots, awaiting: SESSION.awaiting } : null,
            history: hist,
            columnTemplates: (typeof window._summarizeColumnTemplatesForAI === 'function')
                ? window._summarizeColumnTemplatesForAI()
                : []
        })
    });
    var data = await res.json().catch(function () { return {}; });
    if (!res.ok) throw new Error(data.error || ('http_' + res.status));
    return data;
}

function summarizeSlots(slots) {
    var parts = [];
    if (slots.width != null) parts.push('רוחב ' + slots.width);
    if (slots.height != null) parts.push('גובה ' + slots.height);
    if (slots.depth != null) parts.push('עומק ' + slots.depth);
    if (slots.columns != null) parts.push(slots.columns + ' עמודות');
    if (slots.hasDoors === true) parts.push('עם דלתות');
    if (slots.hasDoors === false) parts.push('בלי דלתות');
    if (slots.frontFaceStyle === 'profile') parts.push('חזיתות פרופיל');
    else if (slots.frontStyle === 'internal') parts.push('חזיתות פנימיות');
    else if (slots.frontStyle === 'external') parts.push('חזיתות חיצוניות');
    if (slots.hangingColumns != null) parts.push(slots.hangingColumns + ' תלייה');
    else if (slots.hanging) parts.push('תלייה');
    if (slots.restShelves || slots.shelfColumns) parts.push('מדפים');
    else if (slots.shelves) parts.push('מדפים');
    if (slots.drawers) {
        var dk = slots.drawerKind === 'internal' ? 'פנימיות' : (slots.drawerKind === 'external' ? 'חיצוניות' : '');
        parts.push((slots.drawerCount ? (slots.drawerCount + ' ') : '') + 'מגירות' + (dk ? ' ' + dk : ''));
    }
    if (slots.walls) parts.push(slots.walls + ' דפנות');
    if (slots.roomW && slots.roomD) parts.push('חדר ' + (slots.roomW / 100) + '×' + (slots.roomD / 100) + ' מ׳');
    return parts.join(' · ');
}

function syncColumnUi(n) {
    var inp = document.getElementById('inp-columns');
    var val = document.getElementById('val-columns');
    if (inp) inp.value = n;
    if (val) val.innerText = String(n);
}

function applyDoorsToAllColumns(style) {
    if (!state.columns) return;
    state.hasDoors = true;
    var doorStyle = (state.frontFaceStyle === 'profile' || style === 'framed_melamine') ? 'framed_melamine' : (style || 'solid');
    state.columns.forEach(function (col) {
        if (!col) return;
        var rows = (col.compartments && col.compartments.length) ? col.compartments.length : 1;
        var endRow = Math.max(0, rows - 1);
        var type = (col.width || 0) >= 55 ? 'double' : 'left';
        col.doors = [{ startRow: 0, endRow: endRow, type: type, style: doorStyle }];
        // External drawers don't sit under overlay doors well — clear bottom drawer if full door
        (col.compartments || []).forEach(function (comp) {
            if (comp && comp.type === 'external_drawers') comp.type = 'empty';
        });
    });
}

function clearDoors() {
    state.hasDoors = false;
    (state.columns || []).forEach(function (col) {
        if (col) col.doors = [];
    });
}

/** Ensure column has at least `shelfCount` shelf boards → shelfCount+1 cells. */
function _ensureShelves(col, shelfCount) {
    if (!col) return;
    var n = Math.max(0, shelfCount | 0);
    if ((col.shelves || 0) < n || !(col.compartments && col.compartments.length > n)) {
        col.shelves = n;
        if (typeof distributeShelves === 'function') distributeShelves(col);
    }
}

function _clearCompExtras(comp) {
    if (!comp) return;
    delete comp.partition;
    delete comp.partitions;
    delete comp.subCells;
    delete comp.zoneDoorGroups;
    delete comp.count;
}

/** Hanging in lower cell(s) + empty shelf cells above (never full-height hanging alone). */
function _applyHangingWithShelves(col) {
    _ensureShelves(col, 2); // 3 cells: hanging bottom + 2 shelf zones above
    var comps = col.compartments || [];
    if (!comps.length) return;
    // Put hanging in the largest lower area: bottom cell only when 3+ cells,
    // or merge bottom two via leaving bottom hanging and middle empty→hanging if only 2
    var hangEnd = comps.length >= 3 ? 0 : 0;
    for (var r = 0; r < comps.length; r++) {
        comps[r] = comps[r] || { type: 'empty' };
        _clearCompExtras(comps[r]);
        if (r <= hangEnd) {
            comps[r].type = 'hanging';
        } else {
            comps[r].type = 'empty'; // shelf cell
        }
    }
}

/** Shelf-only column — several empty cells (= open shelves). */
function _applyShelvesOnly(col) {
    _ensureShelves(col, 3); // 4 shelf cells
    (col.compartments || []).forEach(function (comp) {
        if (!comp) return;
        _clearCompExtras(comp);
        comp.type = 'empty';
    });
}

/**
 * Size bottom cell so N drawers fit (same rules as the editor UI).
 * External: 1→5cm min, stack 12+(n-1)*12; Internal: 22+(n-1)*20.
 */
function _sizeBottomCellForDrawers(col, neededH) {
    if (!col) return 0;
    var t = (typeof state !== 'undefined' && state.thickness) ? state.thickness : 1.8;
    var plinth = (typeof state !== 'undefined' && state.plinthHeight) ? state.plinthHeight : 10;
    var fo = col.floorOffset || 0;
    var startY = fo > 0 ? fo + t
        : (col.noPlinth ? t : ((col.type === 'desk') ? ((col.deskHeight || 0) + (col.deskClearance || 0) + t) : plinth + t));
    var shelfT = (typeof window._shelfThicknessCm === 'function') ? window._shelfThicknessCm(t) : t;
    var topInner = (col.height || (typeof state !== 'undefined' ? state.globalHeight : 240) || 240) - t;
    var avail = Math.max(0, topInner - startY);
    if (avail < 20) return 0;

    // Leave room above for hanging/shelves; still try to honor neededH
    var reserveAbove = Math.min(80, Math.max(30, avail * 0.35));
    var bottomH = Math.min(Math.max(neededH, 24), Math.max(neededH, avail - reserveAbove));
    if (bottomH > avail - 20) bottomH = Math.max(neededH, avail - 20);
    bottomH = Math.min(bottomH, avail - 15);

    var y1 = Math.round((startY + bottomH + shelfT / 2) * 10) / 10;
    var aboveBottom = y1 + shelfT / 2;
    var aboveH = Math.max(0, topInner - aboveBottom);
    var y2 = Math.round((aboveBottom + aboveH / 2) * 10) / 10;
    if (y2 <= y1 + 2) y2 = Math.round((y1 + Math.max(12, aboveH * 0.5)) * 10) / 10;

    col.shelves = 2;
    col.shelvesY = [y1, y2].filter(function (y) { return y > startY && y < topInner; });
    if (col.shelvesY.length < 1) {
        col.shelves = 1;
        col.shelvesY = [y1];
    }
    col.shelves = col.shelvesY.length;
    if (typeof _syncCompartmentCount === 'function') {
        _syncCompartmentCount(col, typeof _columnBaseY === 'function' ? _columnBaseY(col, null) : plinth, t);
    } else if (typeof distributeShelves === 'function') {
        // fallback — keep our shelvesY by re-applying after distribute
        var keep = col.shelvesY.slice();
        distributeShelves(col);
        col.shelvesY = keep;
        col.shelves = keep.length;
        if (typeof _syncCompartmentCount === 'function') {
            _syncCompartmentCount(col, typeof _columnBaseY === 'function' ? _columnBaseY(col, null) : plinth, t);
        }
    }
    return bottomH;
}

function _cellHForRow(col, row) {
    if (typeof window._compartmentBounds === 'function') {
        return Math.round(window._compartmentBounds(col, row).h * 100) / 100;
    }
    if (typeof window._cellHeight === 'function') return window._cellHeight(col, row);
    return 0;
}

function _clampDrawerCountToCell(cellH, type, requested) {
    var want = Math.max(1, Math.min(8, requested || 1));
    var maxC = (typeof window.calcMaxDrawerCount === 'function')
        ? window.calcMaxDrawerCount(cellH, type) : want;
    var minC = (typeof window.calcMinDrawerCount === 'function')
        ? window.calcMinDrawerCount(cellH, type) : (cellH >= 12 ? 1 : 0);
    if (minC < 1 || maxC < 1) return { count: 0, max: 0, need: (typeof window.minHeightForDrawerCount === 'function') ? window.minHeightForDrawerCount(want, type) : want * 12 };
    var applied = Math.max(minC, Math.min(want, maxC, 8));
    return {
        count: applied,
        max: maxC,
        need: (typeof window.minHeightForDrawerCount === 'function') ? window.minHeightForDrawerCount(want, type) : null,
        capped: applied < want
    };
}

/** Drawers in bottom cell + shelves above — sized & capped by real height rules. */
function _applyDrawersColumn(col, count, kind) {
    count = Math.max(1, Math.min(8, count || 3));
    kind = kind === 'internal' ? 'internal_drawers' : 'external_drawers';
    var needH = (typeof window.minHeightForDrawerCount === 'function')
        ? window.minHeightForDrawerCount(count, kind)
        : (kind === 'external_drawers' ? (count === 1 ? 5 : 12 + 12 * (count - 1)) : (22 + 20 * (count - 1)));

    _sizeBottomCellForDrawers(col, needH);
    var comps = col.compartments || [];
    if (!comps.length) {
        _ensureShelves(col, 2);
        comps = col.compartments || [];
    }
    var cellH = _cellHForRow(col, 0);
    var fit = _clampDrawerCountToCell(cellH, kind, count);
    if (fit.capped || fit.count < 1) {
        _lastApplyNotes.push(
            fit.count < 1
                ? ('לא ניתן לשים ' + count + ' מגירות — נדרש גובה תא של לפחות ' + (fit.need || '?') + ' ס״מ')
                : ('ביקשת ' + count + ' מגירות; בגובה התא (' + Math.round(cellH) + ' ס״מ) אפשר עד ' + fit.max + ' — התאמתי ל־' + fit.count)
        );
    }
    for (var r = 0; r < comps.length; r++) {
        comps[r] = comps[r] || { type: 'empty' };
        _clearCompExtras(comps[r]);
        if (r === 0 && fit.count >= 1) {
            comps[r].type = kind;
            comps[r].count = fit.count;
        } else {
            comps[r].type = 'empty';
        }
    }
}

/** Final safety pass — same clamp the shelf editor uses. */
function clampDrawersAfterApply() {
    (state.columns || []).forEach(function (col) {
        if (!col) return;
        if (typeof window._clampDrawerCompartments === 'function') {
            var t = state.thickness || 1.8;
            var baseY = (typeof _columnBaseY === 'function') ? _columnBaseY(col, null) : (state.plinthHeight || 10);
            window._clampDrawerCompartments(col, baseY, t);
            return;
        }
        (col.compartments || []).forEach(function (comp, r) {
            if (!comp || !(comp.type === 'external_drawers' || comp.type === 'internal_drawers' || comp.type === 'shoe_drawers')) return;
            var cellH = _cellHForRow(col, r);
            var fit = _clampDrawerCountToCell(cellH, comp.type, comp.count || 1);
            if (fit.count < 1) {
                comp.type = 'empty';
                delete comp.count;
            } else if (fit.capped) {
                if (fit.capped) {
                    _lastApplyNotes.push('התאמתי מגירות ל־' + fit.count + ' לפי גובה התא (' + Math.round(cellH) + ' ס״מ)');
                }
                comp.count = fit.count;
            }
        });
    });
}

/**
 * Assign column roles from slots:
 *  - drawer column(s) first
 *  - then hangingColumns (or all-with-shelves if hanging without count)
 *  - rest = shelves when restShelves / shelves requested
 */
function planColumnRoles(slots, numCols) {
    var roles = [];
    var i;
    for (i = 0; i < numCols; i++) roles.push('shelves'); // default smart: shelves not empty hanging

    var drawerN = slots.drawers ? Math.max(1, slots.drawerColumns || 1) : 0;
    var hangN = 0;
    if (slots.hangingColumns != null) hangN = slots.hangingColumns;
    else if (slots.hanging && !slots.restShelves && slots.shelfColumns == null) {
        // Vague "תלייה/בגדים" without counts → every column gets hanging+shelves above
        hangN = numCols - drawerN;
    } else if (slots.hanging) {
        hangN = Math.min(Math.max(1, Math.floor((numCols - drawerN) / 2)), numCols - drawerN);
    }

    if (slots.shelfColumns != null) {
        hangN = Math.min(hangN, Math.max(0, numCols - drawerN - slots.shelfColumns));
    }

    hangN = Math.max(0, Math.min(hangN, numCols - drawerN));
    drawerN = Math.max(0, Math.min(drawerN, numCols));

    var idx = 0;
    for (i = 0; i < drawerN && idx < numCols; i++, idx++) roles[idx] = 'drawers';
    for (i = 0; i < hangN && idx < numCols; i++, idx++) roles[idx] = 'hanging';
    for (; idx < numCols; idx++) roles[idx] = 'shelves';
    return roles;
}

function _findTemplateByIdOrName(ref) {
    if (!ref) return null;
    var list = (typeof window._listTemplates === 'function') ? (window._listTemplates('column') || []) : [];
    if (!list.length) return null;
    var s = String(ref).trim();
    var byId = list.find(function (t) { return t && t.id === s; });
    if (byId) return byId;
    var lower = s.toLowerCase();
    return list.find(function (t) {
        return t && String(t.name || '').trim().toLowerCase() === lower;
    }) || list.find(function (t) {
        return t && String(t.name || '').indexOf(s) >= 0;
    }) || null;
}

/**
 * Apply ready-made column templates as a starting point (not a hard lock).
 * slots.columnTemplates: id/name per column (null = freeform for that column).
 * Soft auto-match only when AI didn't specify an array at all.
 */
function applyColumnTemplatesFromSlots(slots) {
    var cols = state.columns || [];
    if (!cols.length) return [];
    var roles = planColumnRoles(slots, cols.length);
    var refs = Array.isArray(slots.columnTemplates) ? slots.columnTemplates : null;
    var aiChoseList = Array.isArray(slots.columnTemplates);
    var applied = [];
    var drawerOpts = { drawerKind: slots.drawerKind || null, drawerCount: slots.drawerCount || null };

    cols.forEach(function (col, i) {
        if (!col) return;
        var tpl = null;
        if (aiChoseList) {
            // Explicit AI pick (or null = leave freeform)
            if (refs[i]) tpl = _findTemplateByIdOrName(refs[i]);
        } else if (typeof window._matchColumnTemplateForRole === 'function') {
            // Soft suggestion only — templates inspire, freeform still fills gaps
            var match = window._matchColumnTemplateForRole(roles[i] || 'shelves', drawerOpts);
            if (match) tpl = _findTemplateByIdOrName(match.id);
        }
        if (!tpl || typeof window._applyColumnTemplateToCol !== 'function') return;
        window._applyColumnTemplateToCol(col, tpl);
        applied.push({ col: i, id: tpl.id, name: tpl.name || tpl.id, role: roles[i] });
    });
    return applied;
}

/** After templates: adapt drawer count/kind and fix roles that don't match the request. */
function adaptColumnsToRequest(slots, roles) {
    var cols = state.columns || [];
    if (!cols.length) return;
    var drawerCount = slots.drawerCount != null ? slots.drawerCount : null;
    var drawerKind = slots.drawerKind || null;
    var wantExt = drawerKind === 'external' ? 'external_drawers' : (drawerKind === 'internal' ? 'internal_drawers' : null);

    cols.forEach(function (col, i) {
        if (!col || !Array.isArray(col.compartments)) return;
        var role = (roles && roles[i]) || null;

        // Sync drawer stack to requested count/kind when this is a drawer column
        var drawerComp = col.compartments.find(function (c) {
            return c && (c.type === 'external_drawers' || c.type === 'internal_drawers' || c.type === 'shoe_drawers');
        });
        if (role === 'drawers' || drawerComp) {
            if (!drawerComp) {
                _applyDrawersColumn(col, drawerCount || 3, drawerKind || 'external');
                return;
            }
            if (wantExt) drawerComp.type = wantExt;
            if (drawerCount != null || drawerComp.count) {
                var idx = col.compartments.indexOf(drawerComp);
                var cellH = _cellHForRow(col, idx >= 0 ? idx : 0);
                var fit = _clampDrawerCountToCell(cellH, drawerComp.type, drawerCount != null ? drawerCount : drawerComp.count);
                if (fit.count < 1) {
                    drawerComp.type = 'empty';
                    delete drawerComp.count;
                } else {
                    if (fit.capped) {
                        _lastApplyNotes.push('ביקשת ' + (drawerCount || drawerComp.count) + ' מגירות; לפי גובה התא אפשר עד ' + fit.max + ' — שמתי ' + fit.count);
                    }
                    drawerComp.count = fit.count;
                }
            }
        }

        // If role is hanging but template had no hanging — upgrade
        if (role === 'hanging') {
            var hasHang = col.compartments.some(function (c) {
                return c && (c.type === 'hanging' || c.type === 'cross_hanging');
            });
            if (!hasHang) _applyHangingWithShelves(col);
        }

        // If plan says shelves-only but template brought hanging/drawers — rebuild shelves
        if (role === 'shelves') {
            var hasSpecial = col.compartments.some(function (c) {
                return c && c.type && c.type !== 'empty' && c.type !== 'open_cell';
            });
            if (hasSpecial) _applyShelvesOnly(col);
        }
    });
}

function applyInteriorPlan(slots) {
    var cols = state.columns || [];
    if (!cols.length) return;
    var roles = planColumnRoles(slots, cols.length);
    var drawerCount = slots.drawerCount || 3;
    var drawerKind = slots.drawerKind || 'external';

    // Templates as inspiration / starting point
    var applied = applyColumnTemplatesFromSlots(slots);
    var covered = {};
    applied.forEach(function (a) { covered[a.col] = true; });

    // Freeform for columns without a template
    cols.forEach(function (col, i) {
        if (!col || covered[i]) return;
        var role = roles[i] || 'shelves';
        if (role === 'drawers') _applyDrawersColumn(col, drawerCount, drawerKind);
        else if (role === 'hanging') _applyHangingWithShelves(col);
        else _applyShelvesOnly(col);
    });

    // Always adapt: drawer counts, kinds, missing hanging, etc.
    adaptColumnsToRequest(slots, roles);
}

function applyDoorsForPlan(slots, hasDoors) {
    if (!hasDoors) {
        clearDoors();
        return;
    }
    state.hasDoors = true;
    var doorStyle = state.frontFaceStyle === 'profile' ? 'framed_melamine' : 'solid';
    (state.columns || []).forEach(function (col) {
        if (!col || !col.compartments) return;
        var start = 0;
        var comps = col.compartments;
        // External drawers: doors only above the drawer stack
        if (comps[0] && comps[0].type === 'external_drawers') start = 1;
        var endRow = comps.length - 1;
        if (start > endRow) {
            col.doors = [];
            return;
        }
        var type = (col.width || 0) >= 55 ? 'double' : 'left';
        col.doors = [{ startRow: start, endRow: endRow, type: type, style: doorStyle }];
    });
}

function applyFrontStyles(slots) {
    if (slots.frontFaceStyle === 'profile') {
        state.frontFaceStyle = 'profile';
        if (typeof window._applyDoorStyleToAllFronts === 'function') {
            window._applyDoorStyleToAllFronts(typeof getWing === 'function' ? getWing() : state, 'framed_melamine');
        }
    } else if (slots.frontFaceStyle === 'solid') {
        state.frontFaceStyle = 'solid';
    }
    if (slots.frontStyle === 'internal' || slots.frontStyle === 'external') {
        state.frontStyle = slots.frontStyle;
        if ((state.plinthStyle || '') === 'legs') state.frontStyle = 'internal';
    }
    if (typeof window._syncPlinthFrontStyleUI === 'function') window._syncPlinthFrontStyleUI();
}

function finishApply() {
    clampDrawersAfterApply();
    if (typeof syncSidebarToWing === 'function') syncSidebarToWing();
    if (typeof buildCabinet === 'function') buildCabinet();
    if (typeof updateCameraView === 'function') updateCameraView();
    if (typeof calculatePrice === 'function') calculatePrice();
    if (typeof saveHistoryState === 'function') saveHistoryState();
}

function takeApplyNotesSuffix() {
    if (!_lastApplyNotes.length) return '';
    var note = '\n⚠️ ' + _lastApplyNotes.join('\n⚠️ ');
    _lastApplyNotes = [];
    return note;
}

function resolveColumnCount(slots, width) {
    var drawerN = slots.drawers ? Math.max(1, slots.drawerColumns || 1) : 0;
    var hangN = slots.hangingColumns != null ? slots.hangingColumns : 0;
    var shelfN = slots.shelfColumns != null ? slots.shelfColumns : 0;
    var restMin = (slots.restShelves || (slots.shelves && hangN > 0)) ? 1 : 0;
    var fromLayout = drawerN + hangN + Math.max(shelfN, restMin);
    var fromWidth = defaultColumns(width);
    if (slots.columns != null) return Math.max(1, Math.min(12, Math.max(slots.columns, fromLayout)));
    return Math.max(1, Math.min(12, Math.max(fromWidth, fromLayout || 2)));
}

function setCabinetDisplayName(name) {
    if (!name) return;
    try {
        state.cabinetName = name;
        if (state.wings && state.wings.center) state.wings.center.cabinetName = name;
        var idx = state.editingCartIndex;
        if (idx >= 0 && state.orderCart && state.orderCart[idx]) {
            var item = state.orderCart[idx];
            if (item.spec) item.spec.customName = name;
            if (item.rawState) item.rawState.cabinetName = name;
        }
    } catch (e) { /* ignore */ }
}

function applyCreateLinear(slots) {
    if (typeof window._resetEditorToDefaultLinearCabinet === 'function') {
        window._resetEditorToDefaultLinearCabinet();
    } else if (typeof window.applyPreset === 'function') {
        window.applyPreset('linear');
    }

    var width = slots.width;
    var height = slots.height;
    var depth = slots.depth != null ? slots.depth : DEFAULT_DEPTH;
    var cols = resolveColumnCount(slots, width);
    var hasDoors = slots.hasDoors != null ? slots.hasDoors : true;

    if (typeof updateDim === 'function') {
        updateDim('width', 0, width);
        updateDim('height', 0, height);
        updateDim('depth', 0, depth);
    } else {
        state.width = width;
        state.globalHeight = height;
        state.depth = depth;
    }

    if (typeof distributeColumns === 'function') {
        distributeColumns(cols);
    } else if (typeof window._applyColumnCountChange === 'function') {
        window._applyColumnCountChange(cols, 'right', true);
    }
    syncColumnUi(cols);

    applyFrontStyles(slots);
    applyInteriorPlan(slots);
    applyDoorsForPlan(slots, hasDoors);
    if (slots.name) setCabinetDisplayName(slots.name);

    finishApply();
    var roles = planColumnRoles(slots, cols);
    var hangCols = roles.filter(function (r) { return r === 'hanging'; }).length;
    var shelfCols = roles.filter(function (r) { return r === 'shelves'; }).length;
    var label = slots.name ? (slots.name + ': ') : '';
    return 'יצרתי ' + label + summarizeSlots({
        width: width, height: height, depth: depth, columns: cols,
        hasDoors: hasDoors, frontFaceStyle: slots.frontFaceStyle, frontStyle: slots.frontStyle,
        hanging: hangCols > 0, hangingColumns: hangCols || null,
        shelves: shelfCols > 0, restShelves: shelfCols > 0,
        drawers: slots.drawers, drawerCount: slots.drawerCount, drawerKind: slots.drawerKind
    }) + takeApplyNotesSuffix();
}

/** Create several independent cart cabinets in the project (orderCart). */
function applyCreateMany(cabinets) {
    var list = (cabinets || []).filter(function (c) {
        return c && c.width != null && c.height != null;
    });
    if (list.length < 2) {
        if (list.length === 1) return applyCreateLinear(list[0]);
        return 'חסרים מידות לארונות. ציינו גובה ואורך/רוחב לכל ארון.';
    }
    var lines = [];
    list.forEach(function (slots, i) {
        if (i > 0 && typeof window.startNewCabinet === 'function') {
            window.startNewCabinet();
        }
        if (!slots.name) slots.name = 'ארון ' + (i + 1);
        lines.push(applyCreateLinear(slots));
    });
    // Commit last so project cart matches editor
    if (typeof window._commitCurrentCabinetToCart === 'function') {
        window._commitCurrentCabinetToCart({ flash: false });
    }
    if (typeof updateLeftSidebar === 'function') updateLeftSidebar({ scrollToActive: true });
    return 'יצרתי ' + list.length + ' ארונות בפרויקט:\n• ' + lines.join('\n• ');
}

function missingForMany(cabinets) {
    var list = cabinets || [];
    if (list.length < 2) return ['width'];
    for (var i = 0; i < list.length; i++) {
        var c = list[i] || {};
        if (c.width == null) return ['width'];
        if (c.height == null) return ['height'];
        var q = missingQuantities(c);
        if (q.length) return [q[0]];
    }
    return [];
}

function applyEdit(slots) {
    var changed = [];
    if (slots.width != null && typeof updateDim === 'function') {
        updateDim('width', 0, slots.width); changed.push('רוחב ' + slots.width);
    }
    if (slots.height != null && typeof updateDim === 'function') {
        updateDim('height', 0, slots.height); changed.push('גובה ' + slots.height);
    }
    if (slots.depth != null && typeof updateDim === 'function') {
        updateDim('depth', 0, slots.depth); changed.push('עומק ' + slots.depth);
    }
    if (slots.columns != null) {
        if (typeof window._applyColumnCountChange === 'function') {
            window._applyColumnCountChange(slots.columns, 'right', true);
        } else if (typeof _applyColumnCountChange === 'function') {
            _applyColumnCountChange(slots.columns, 'right', true);
        } else if (typeof distributeColumns === 'function') {
            distributeColumns(slots.columns);
        }
        syncColumnUi(slots.columns);
        changed.push(slots.columns + ' עמודות');
    }
    if (slots.frontFaceStyle || slots.frontStyle) {
        applyFrontStyles(slots);
        if (slots.frontFaceStyle === 'profile') changed.push('חזיתות פרופיל');
        else if (slots.frontStyle) changed.push(slots.frontStyle === 'internal' ? 'חזיתות פנימיות' : 'חזיתות חיצוניות');
    }
    var needsInterior = slots.hanging || slots.hangingColumns != null || slots.shelves ||
        slots.restShelves || slots.shelfColumns != null || slots.drawers || slots.drawerKind;
    if (needsInterior) {
        // Keep existing dims/cols; re-plan interiors from merged intent
        var editSlots = mergeSlots({
            hanging: true,
            shelves: true
        }, slots);
        // If only drawers/kind change, don't force hanging on all
        if (!slots.hanging && slots.hangingColumns == null) delete editSlots.hanging;
        if (!slots.shelves && !slots.restShelves && slots.shelfColumns == null) delete editSlots.shelves;
        applyInteriorPlan(editSlots);
        if (slots.hangingColumns != null) changed.push(slots.hangingColumns + ' תלייה');
        else if (slots.hanging) changed.push('תלייה');
        if (slots.restShelves || slots.shelves) changed.push('מדפים');
        if (slots.drawers || slots.drawerKind) {
            changed.push((slots.drawerCount || '') + ' מגירות ' +
                (slots.drawerKind === 'internal' ? 'פנימיות' : (slots.drawerKind === 'external' ? 'חיצוניות' : '')));
        }
        applyDoorsForPlan(editSlots, state.hasDoors !== false);
    }
    if (slots.hasDoors === true) {
        applyDoorsForPlan(slots, true);
        changed.push('דלתות');
    } else if (slots.hasDoors === false) {
        clearDoors();
        changed.push('בלי דלתות');
    }
    if (!changed.length) return null;
    finishApply();
    return 'עדכנתי: ' + changed.join(' · ');
}

function applyWalkin(slots) {
    // Best-effort: walk-in preset + room dims + cabinet height
    if (typeof window.applyPreset === 'function') {
        try { window.applyPreset('walkin'); } catch (e) { /* ignore */ }
    }
    if (slots.roomW && typeof window._setRoomSize === 'function') {
        window._setRoomSize('width', slots.roomW);
        if (slots.roomD) window._setRoomSize('depth', slots.roomD);
    }
    if (slots.height != null && typeof updateDim === 'function') {
        updateDim('height', 0, slots.height);
    }
    // Wall spans: use room edges as wing widths when possible
    if (slots.roomW && state.wings && state.wings.center && typeof updateDim === 'function') {
        // Center wall along width or depth — heuristic: center ≈ room width
        var centerW = slots.walls === 3 && slots.roomD
            ? Math.max(slots.roomW, slots.roomD)
            : (slots.roomW || state.width);
        // Keep center reasonable
        if (state.activeWing !== 'center' && typeof window.switchWing === 'function') {
            try { /* stay */ } catch (e2) {}
        }
        state.activeWing = 'center';
        updateDim('width', 0, Math.min(600, centerW));
    }
    applyFrontStyles(slots);
    finishApply();
    return 'הגדרתי חדר ארונות' +
        (slots.walls ? ' מ־' + slots.walls + ' דפנות' : '') +
        (slots.height ? ', גובה ' + slots.height : '') +
        (slots.roomW && slots.roomD ? ', חדר ' + (slots.roomW / 100) + '×' + (slots.roomD / 100) + ' מ׳' : '') +
        '. אפשר להמשיך לערוך כל דופן בנפרד או לכתוב עוד הוראות.';
}

function helpText() {
    return 'כתבו בעברית מה תרצו — הסוכן לומד מפרויקטים ושיחות. דוגמאות:\n' +
        '• «ארון רוחב 275 גובה 270 עם תלייה ומדפים»\n' +
        '• «ארון 1: גובה 2.66 אורך 2.10 דלתות מגירות ותלייה» + «ארון 2: …» — יוצר כמה ארונות בפרויקט\n' +
        '• «שנה עומק ל־55»\n' +
        '• «תוסיף חזיתות פרופיל»\n' +
        'אם חסר מידע — אשאל.';
}

function processMessage(raw) {
    var text = normalize(raw);
    if (!text) return { reply: 'כתבו מה תרצו ליצור או לשנות בארון.' };

    var intent = detectIntent(text);
    var slots = parseSlots(text);
    var multi = parseMultiCabinetSlots(raw);
    if (multi && multi.length >= 2) {
        slots.cabinets = multi;
        intent = 'create_many';
    }

    if (intent === 'cancel') {
        SESSION = null;
        return { reply: 'ביטלתי. אפשר להתחיל מחדש מתי שתרצו.' };
    }
    if (intent === 'help') {
        return { reply: helpText() };
    }
    if (intent === 'unknown' && !SESSION) {
        return { reply: 'לא הבנתי לגמרי. ' + helpText() };
    }

    // Continue session
    if (SESSION && (intent === 'answer' || intent === 'unknown' || intent === SESSION.intent || intent === 'edit' || intent === 'create' || intent === 'create_many')) {
        SESSION.slots = mergeSlots(SESSION.slots, slots);
        slots = SESSION.slots;
        intent = SESSION.intent;
    }

    if (intent === 'create_many') {
        var cabs = slots.cabinets || multi;
        if (!cabs || cabs.length < 2) {
            return { reply: 'ציינו לפחות שני ארונות, למשל:\nארון 1: גובה 2.66 אורך 2.10 …\nארון 2: גובה 2.65 אורך 1.80 …' };
        }
        var missMany = missingForMany(cabs);
        if (missMany.length) {
            SESSION = { intent: 'create_many', slots: { cabinets: cabs }, awaiting: missMany[0], asked: (SESSION && SESSION.asked) || [] };
            SESSION.asked.push(missMany[0]);
            return { reply: 'הבנתי ' + cabs.length + ' ארונות.\n' + questionFor(missMany[0]) };
        }
        SESSION = null;
        var manyMsg = applyCreateMany(cabs);
        return { reply: manyMsg, done: true, learnActions: { cabinets: cabs }, learnIntent: 'create_many' };
    }

    if (intent === 'create' || intent === 'create_walkin') {
        var miss = intent === 'create_walkin' ? missingForWalkin(slots) : missingForCreate(slots);
        if (miss.length) {
            SESSION = { intent: intent, slots: slots, awaiting: miss[0], asked: (SESSION && SESSION.asked) || [] };
            SESSION.asked.push(miss[0]);
            var known = summarizeSlots(slots);
            return {
                reply: (known ? ('הבנתי: ' + known + '.\n') : '') + questionFor(miss[0])
            };
        }
        SESSION = null;
        var msg = intent === 'create_walkin' ? applyWalkin(slots) : applyCreateLinear(slots);
        return { reply: msg, done: true, learnActions: slots, learnIntent: intent };
    }

    if (intent === 'edit') {
        // If mid-create, treat as fill; else edit current
        if (SESSION && (SESSION.intent === 'create' || SESSION.intent === 'create_walkin' || SESSION.intent === 'create_many')) {
            SESSION.slots = mergeSlots(SESSION.slots, slots);
            if (SESSION.intent === 'create_many') {
                var missM = missingForMany(SESSION.slots.cabinets);
                if (missM.length) {
                    SESSION.awaiting = missM[0];
                    return { reply: questionFor(missM[0]) };
                }
                var finMany = applyCreateMany(SESSION.slots.cabinets);
                var finManySlots = SESSION.slots;
                SESSION = null;
                return { reply: finMany, done: true, learnActions: finManySlots, learnIntent: 'create_many' };
            }
            var miss2 = SESSION.intent === 'create_walkin' ? missingForWalkin(SESSION.slots) : missingForCreate(SESSION.slots);
            if (miss2.length) {
                SESSION.awaiting = miss2[0];
                return { reply: questionFor(miss2[0]) };
            }
            var finIntent = SESSION.intent;
            var finSlots = SESSION.slots;
            var fin = finIntent === 'create_walkin' ? applyWalkin(finSlots) : applyCreateLinear(finSlots);
            SESSION = null;
            return { reply: fin, done: true, learnActions: finSlots, learnIntent: finIntent };
        }
        var editMsg = applyEdit(slots);
        if (!editMsg) {
            return { reply: 'מה לשנות? למשל: «שנה רוחב ל־200», «4 עמודות», «חזיתות פרופיל».' };
        }
        return { reply: editMsg, done: true, learnActions: slots, learnIntent: 'edit' };
    }

    return { reply: 'לא הצלחתי לבצע. ' + helpText() };
}

// ── UI ──────────────────────────────────────────────────────────────────────

function setOffset(px) {
    document.documentElement.style.setProperty(CHAT_OFFSET_VAR, Math.max(0, px || 0) + 'px');
    document.body.classList.add('has-cabinet-chat');
}

function measureAndSetOffset() {
    var root = document.getElementById('cabinet-chat');
    if (!root) return;
    var h = Math.ceil(root.getBoundingClientRect().height || 0);
    setOffset(h);
    // Notify Three.js that the canvas area changed height
    try { window.dispatchEvent(new Event('resize')); } catch (e) { /* ignore */ }
}

/** Put chat under the 3D viewport (same column as #canvas-container), not floating on body. */
function ensureViewportStack() {
    var canvas = document.getElementById('canvas-container');
    if (!canvas) return null;
    var stack = document.getElementById('cabinet-viewport-stack');
    if (stack && stack.contains(canvas)) return stack;
    stack = document.createElement('div');
    stack.id = 'cabinet-viewport-stack';
    var parent = canvas.parentNode;
    if (!parent) return null;
    parent.insertBefore(stack, canvas);
    stack.appendChild(canvas);
    return stack;
}

function appendBubble(role, text, skipPersist) {
    var log = document.getElementById('cabinet-chat-log');
    if (!log) return;
    var div = document.createElement('div');
    div.className = 'cab-chat-bubble cab-chat-' + role;
    div.innerHTML = esc(text).replace(/\n/g, '<br>');
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
    HISTORY.push({ role: role, text: text });
    if (HISTORY.length > MAX_STORED_MSGS) HISTORY = HISTORY.slice(-MAX_STORED_MSGS);
    measureAndSetOffset();
    if (!skipPersist) persistChat();
}

function setExpanded(on) {
    var root = document.getElementById('cabinet-chat');
    if (!root) return;
    root.classList.toggle('expanded', !!on);
    // Expanded log changes dock height → reflow 3D canvas
    requestAnimationFrame(measureAndSetOffset);
    persistChat();
}

async function send() {
    var input = document.getElementById('cabinet-chat-input');
    if (!input) return;
    var text = input.value;
    input.value = '';
    if (!normalize(text)) return;
    setExpanded(true);
    appendBubble('user', text);
    var thinking = document.getElementById('cabinet-chat-status');
    if (thinking) thinking.textContent = 'חושב…';
    var sendBtn = document.getElementById('cabinet-chat-send');
    if (sendBtn) sendBtn.disabled = true;

    // Soft signal: user rejected previous result → don't reinforce that lesson
    if (looksLikeNegativeFeedback(text)) {
        markLastLessonRejected();
    }

    // Ensure column templates are loaded before AI / local matching
    try {
        if (typeof window._refreshTemplates === 'function') await window._refreshTemplates('column');
    } catch (eTpl) { /* ignore */ }

    var result = null;
    // Prefer AI agent when signed in; fall back to local rules.
    if (AI_ENABLED) {
        try {
            var ai = await askCabinetAI(text);
            result = applyAiResult(ai);
        } catch (aiErr) {
            console.warn('[cabinet-chat] AI fallback:', aiErr && aiErr.message);
            // cancel/help still work locally even without AI
        }
    }
    if (!result) {
        try {
            result = processMessage(text);
        } catch (err) {
            console.error('[cabinet-chat]', err);
            result = { reply: 'משהו השתבש בביצוע. נסו לנסח אחרת או לפרק לבקשה קצרה יותר.' };
        }
    }

    if (thinking) thinking.textContent = '';
    if (sendBtn) sendBtn.disabled = false;
    appendBubble('bot', result.reply || 'בוצע.');
    persistChatNow();
    if (result.done) {
        if (result.learnActions) learnFromSuccessfulApply(result.learnActions, result.learnIntent || 'create');
        setTimeout(function () { measureAndSetOffset(); }, 50);
    }
}

function injectUi() {
    if (document.getElementById('cabinet-chat')) return;
    if (!document.getElementById('canvas-container')) return;

    var stack = ensureViewportStack();
    if (!stack) return;

    var wrap = document.createElement('div');
    wrap.id = 'cabinet-chat';
    wrap.setAttribute('dir', 'rtl');
    wrap.innerHTML =
        '<div id="cabinet-chat-log" class="cab-chat-log" aria-live="polite"></div>' +
        '<div class="cab-chat-row">' +
        '  <button type="button" id="cabinet-chat-toggle" class="cab-chat-toggle" title="הרחב/כווץ" aria-label="הרחב צ׳אט"><i class="fa-solid fa-comments"></i></button>' +
        '  <input id="cabinet-chat-input" type="text" autocomplete="off" placeholder="תארו ארון או שינוי… למשל: ארון 240×60 גובה 270 עם 4 עמודות" />' +
        '  <button type="button" id="cabinet-chat-send" class="cab-chat-send" title="שלח" aria-label="שלח"><i class="fa-solid fa-paper-plane"></i></button>' +
        '</div>' +
        '<div id="cabinet-chat-status" class="cab-chat-status"></div>';
    stack.appendChild(wrap);
    document.body.classList.add('has-cabinet-chat');

    document.getElementById('cabinet-chat-send').addEventListener('click', send);
    document.getElementById('cabinet-chat-input').addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); send(); }
    });
    document.getElementById('cabinet-chat-input').addEventListener('focus', function () {
        setExpanded(true);
    });
    document.getElementById('cabinet-chat-toggle').addEventListener('click', function () {
        var root = document.getElementById('cabinet-chat');
        setExpanded(!(root && root.classList.contains('expanded')));
    });

    window.addEventListener('resize', measureAndSetOffset);
    // After layout settles (stack wrap + chat height), resize the 3D view
    requestAnimationFrame(function () {
        measureAndSetOffset();
        setTimeout(measureAndSetOffset, 80);
    });

    restoreChat();
    ensureWelcome();
    watchProjectChanges();

    // Flush on page hide so refreshes don't drop the last reply
    document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'hidden') persistChatNow();
    });
    window.addEventListener('beforeunload', persistChatNow);
}

function injectStyles() {
    if (document.getElementById('cabinet-chat-styles')) return;
    var st = document.createElement('style');
    st.id = 'cabinet-chat-styles';
    st.textContent =
        ':root{' + CHAT_OFFSET_VAR + ':0px}' +
        /* Viewport column: 3D on top, chat docked underneath */
        '#cabinet-viewport-stack{flex:1 1 auto;order:2;display:flex;flex-direction:column;' +
        'min-width:0;min-height:0;height:100%;position:relative;overflow:hidden}' +
        '#cabinet-viewport-stack #canvas-container{flex:1 1 auto;order:unset;min-height:0;min-width:0;width:100%}' +
        '#cabinet-chat{flex:0 0 auto;position:relative;z-index:30;left:auto;right:auto;bottom:auto;' +
        'display:flex;flex-direction:column;gap:0;pointer-events:auto;font-family:inherit;direction:rtl;' +
        'background:var(--bg-sidebar,#fff);border-top:1px solid var(--border,#e2e8f0);' +
        'box-shadow:0 -4px 18px rgba(15,23,42,.06);padding:8px 10px 10px}' +
        '#cabinet-chat .cab-chat-log{display:none;max-height:min(22vh,180px);overflow-y:auto;padding:4px 2px 8px;' +
        'flex-direction:column;gap:6px}' +
        '#cabinet-chat.expanded .cab-chat-log{display:flex}' +
        '.cab-chat-bubble{max-width:92%;padding:8px 12px;border-radius:12px;font-size:.86rem;line-height:1.45;' +
        'box-shadow:0 2px 8px rgba(15,23,42,.06)}' +
        '.cab-chat-bot{align-self:flex-start;background:#f8fafc;border:1px solid rgba(30,58,95,.1);color:#1e293b}' +
        '.cab-chat-user{align-self:flex-end;background:linear-gradient(135deg,#1e3a5f,#2563eb);color:#fff}' +
        '.cab-chat-row{display:flex;align-items:center;gap:8px;background:var(--bg-light,#f8fafc);' +
        'border:1px solid var(--border,#e2e8f0);border-radius:12px;padding:4px 6px 4px 4px}' +
        '#cabinet-chat-input{flex:1;border:none;outline:none;background:transparent;font:inherit;font-size:.9rem;' +
        'padding:8px 6px;min-width:0;color:#0f172a}' +
        '#cabinet-chat-input::placeholder{color:#94a3b8}' +
        '.cab-chat-send,.cab-chat-toggle{width:38px;height:38px;border:none;border-radius:10px;cursor:pointer;' +
        'display:inline-flex;align-items:center;justify-content:center;flex-shrink:0}' +
        '.cab-chat-send{background:linear-gradient(135deg,#1e3a5f,#2563eb);color:#fff}' +
        '.cab-chat-toggle{background:rgba(30,58,95,.08);color:#1e3a5f}' +
        '.cab-chat-status{min-height:0;font-size:.75rem;color:#64748b;padding:2px 8px 0}' +
        /* Float buttons sit above the docked chat (not on top of it) */
        'body.has-cabinet-chat #btn-help-chat{bottom:calc(var(' + CHAT_OFFSET_VAR + ',64px) + 14px)!important;' +
        'transition:bottom .15s ease,transform .15s,box-shadow .15s}' +
        'body.has-cabinet-chat #help-chat{bottom:calc(var(' + CHAT_OFFSET_VAR + ',64px) + 70px)!important}' +
        'body.has-cabinet-chat #designer-notes-float-btn{bottom:calc(var(' + CHAT_OFFSET_VAR + ',64px) + 70px)!important}' +
        '@media (max-width:768px){' +
        '#cabinet-viewport-stack{position:fixed;top:88px;left:0;width:100vw;' +
        'height:calc(100dvh - 88px - 60px - env(safe-area-inset-bottom,0px));z-index:1;order:unset}' +
        '#cabinet-viewport-stack #canvas-container{position:relative!important;top:auto!important;left:auto!important;' +
        'width:100%!important;height:auto!important;flex:1 1 auto}' +
        '#cabinet-chat{padding:6px 8px 6px}' +
        'body.has-cabinet-chat #btn-help-chat{bottom:calc(60px + env(safe-area-inset-bottom,0px) + var(' + CHAT_OFFSET_VAR + ',64px) + 10px)!important;' +
        'right:12px;padding:12px;font-size:0}' +
        'body.has-cabinet-chat #btn-help-chat i{font-size:1.2rem}' +
        'body.has-cabinet-chat #help-chat{bottom:0!important;right:0;left:0;width:auto;' +
        'height:min(85dvh,calc(100dvh - 60px - var(' + CHAT_OFFSET_VAR + ',64px)))}' +
        'body.has-cabinet-chat #designer-notes-float-btn{bottom:calc(60px + env(safe-area-inset-bottom,0px) + var(' + CHAT_OFFSET_VAR + ',64px) + 66px)!important}' +
        '}';
    document.head.appendChild(st);
}

function init() {
    injectStyles();
    injectUi();
    try {
        if (typeof window._refreshTemplates === 'function') window._refreshTemplates('column');
    } catch (e) { /* ignore */ }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

window.CabinetChat = {
    process: processMessage,
    parseSlots: parseSlots,
    askAI: askCabinetAI,
    applyAi: applyAiResult,
    exportState: exportChatState,
    importState: importChatState,
    reset: function () { SESSION = null; persistChatNow(); },
    reload: function () { restoreChat(); ensureWelcome(); },
    clearHistory: function () {
        HISTORY = [];
        SESSION = null;
        try { localStorage.removeItem(storageKey()); } catch (e) {}
        renderHistoryToDom();
        ensureWelcome();
    },
    init: init
};

})();
