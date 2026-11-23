// ==========================================
// Cabinet Chat — Hebrew text → create/edit cabinets
// Rule-based + slot-filling (no LLM). Primary: linear wardrobe.
// ==========================================
(function () {
'use strict';

var CHAT_OFFSET_VAR = '--cabinet-chat-offset';
var DEFAULT_DEPTH = 54;
var DEFAULT_HEIGHT = 240;

var HEB_NUM = {
    'אפס': 0, 'אחד': 1, 'אחת': 1, 'שניים': 2, 'שתיים': 2, 'שני': 2, 'שתים': 2,
    'שלוש': 3, 'שלושה': 3, 'ארבע': 4, 'ארבעה': 4, 'חמש': 5, 'חמישה': 5,
    'שש': 6, 'שישה': 6, 'שבע': 7, 'שבעה': 7, 'שמונה': 8, 'תשע': 9, 'תשעה': 9,
    'עשר': 10, 'עשרה': 10
};

var SESSION = null; // { intent, slots, asked }
var HISTORY = [];

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
    if (hasAny(t, ['צור', 'תיצור', 'תעשה לי', 'ארון חדש', 'בנה', 'תבנה', 'תתחיל ארון'])) return 'create';
    if (hasAny(t, ['שנה', 'תשנה', 'עדכן', 'תעדכן', 'תוסיף', 'תוסיפי', 'תוריד', 'תורידי', 'תגדיל', 'תקטין', 'תשים'])) return 'edit';
    // Bare description without verb → create if no meaningful cabinet yet, else edit
    if (hasAny(t, ['ארון', 'עמודות', 'מגירות', 'דלתות', 'גובה', 'רוחב', 'עומק', 'חזית'])) {
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

    // Explicit labeled dims
    var m;
    m = t.match(/רוחב\s*(?:של\s*)?(?:ל\s*[-–—]?\s*)?(\d+(?:[.,]\d+)?)\s*(ס"?מ|סמ|cm|מטר|מ'|מ)?/i);
    if (m) slots.width = /מטר|מ'|^מ$/.test(m[2] || '') ? Math.round(parseFloat(m[1].replace(',', '.')) * 100) : Math.round(parseFloat(m[1].replace(',', '.')));
    m = t.match(/גובה\s*(?:של\s*)?(?:הארונות?\s*)?(?:הוא\s*)?(?:ל\s*[-–—]?\s*)?(\d+(?:[.,]\d+)?)\s*(ס"?מ|סמ|cm|מטר|מ'|מ)?/i);
    if (m) slots.height = /מטר|מ'|^מ$/.test(m[2] || '') ? Math.round(parseFloat(m[1].replace(',', '.')) * 100) : Math.round(parseFloat(m[1].replace(',', '.')));
    m = t.match(/עומק\s*(?:של\s*)?(?:ל\s*[-–—]?\s*)?(\d+(?:[.,]\d+)?)\s*(ס"?מ|סמ|cm|מטר|מ'|מ)?/i);
    if (m) slots.depth = /מטר|מ'|^מ$/.test(m[2] || '') ? Math.round(parseFloat(m[1].replace(',', '.')) * 100) : Math.round(parseFloat(m[1].replace(',', '.')));

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

    // Columns
    m = t.match(/(\d+|שתיים|שני|שלוש|שלושה|ארבע|ארבעה|חמש|חמישה|שש|שישה)\s*עמוד(?:ות|ה)?/);
    if (m) {
        var cn = parseHebNumberToken(m[1]);
        if (cn != null) slots.columns = Math.max(1, Math.min(12, Math.round(cn)));
    }
    m = t.match(/עמוד(?:ות|ה)?\s*[:\-]?\s*(\d+)/);
    if (m) slots.columns = Math.max(1, Math.min(12, parseInt(m[1], 10)));

    // Drawer count
    m = t.match(/(\d+|שתיים|שני|שלוש|שלושה|ארבע|ארבעה|חמש|חמישה)\s*מגירות/);
    if (m) {
        var dn = parseHebNumberToken(m[1]);
        if (dn != null) slots.drawerCount = Math.max(1, Math.min(8, Math.round(dn)));
        slots.drawers = true;
    }
    if (hasAny(t, ['מגירות חיצוניות', 'מגירות', 'מגירה'])) slots.drawers = true;
    if (hasAny(t, ['בלי מגירות', 'ללא מגירות'])) { slots.drawers = false; slots.drawerCount = 0; }

    // Front style (before doors — "חזיתות פרופיל" is not a door request)
    if (hasAny(t, ['חזיתות פרופיל', 'פרופיל', 'מסגרת מלמין', 'חזית פרופיל'])) slots.frontFaceStyle = 'profile';
    else if (hasAny(t, ['חזיתות פנימיות', 'חזית פנימית'])) slots.frontStyle = 'internal';
    else if (hasAny(t, ['חזיתות חיצוניות', 'חזית חיצונית'])) slots.frontStyle = 'external';

    // Doors
    if (hasAny(t, ['בלי דלתות', 'ללא דלתות', 'בלי חזיתות', 'פתוח'])) slots.hasDoors = false;
    else if (hasAny(t, ['עם דלתות', 'דלתות', 'דלת'])) slots.hasDoors = true;
    else if (hasAny(t, ['חזיתות']) && !slots.frontFaceStyle && !slots.frontStyle) slots.hasDoors = true;

    // Content
    if (hasAny(t, ['תלייה', 'תליה', 'מוט', 'בגדים', 'מתלה'])) slots.hanging = true;
    if (hasAny(t, ['מדפים', 'מדף'])) slots.shelves = true;
    if (hasAny(t, ['כוורת'])) slots.openCell = true;

    // Walk-in walls
    m = t.match(/(\d+|שלוש|שלושה|שתיים|שני|ארבע)\s*דפנות/);
    if (m) {
        var wn = parseHebNumberToken(m[1]);
        if (wn != null) slots.walls = Math.max(2, Math.min(4, Math.round(wn)));
    }
    if (hasAny(t, ['שלוש דפנות', '3 דפנות'])) slots.walls = 3;

    // Lone height after "גובה … 270" already handled; if only one large number + גובה word nearby
    if (slots.height == null && /גובה/.test(t) && nums.length) {
        for (var i = 0; i < nums.length; i++) {
            if (nums[i].value >= 100 && nums[i].value <= 370) { slots.height = Math.round(nums[i].value); break; }
        }
    }

    // Answer mode: single number fills awaiting slot
    if (SESSION && SESSION.awaiting && nums.length === 1 && Object.keys(slots).length === 0) {
        var only = Math.round(nums[0].value);
        if (SESSION.awaiting === 'width') slots.width = only <= 12 ? only * 100 : only;
        else if (SESSION.awaiting === 'height') slots.height = only <= 12 ? only * 100 : only;
        else if (SESSION.awaiting === 'depth') slots.depth = only <= 3 ? only * 100 : only;
        else if (SESSION.awaiting === 'columns') slots.columns = only;
        else if (SESSION.awaiting === 'drawerCount') slots.drawerCount = only;
        else if (SESSION.awaiting === 'hasDoors') {
        if (hasAny(t, ['כן', 'עם', 'בטח'])) slots.hasDoors = true;
        else if (hasAny(t, ['לא', 'בלי'])) slots.hasDoors = false;
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
    return out;
}

function missingForCreate(slots) {
    var miss = [];
    if (slots.width == null) miss.push('width');
    if (slots.height == null) miss.push('height');
    // depth / columns / doors have smart defaults — only ask if nothing else to go on for doors when vague
    return miss;
}

function missingForWalkin(slots) {
    var miss = [];
    if (slots.roomW == null && slots.width == null) miss.push('roomW');
    if (slots.height == null) miss.push('height');
    if (slots.walls == null) miss.push('walls');
    return miss;
}

function questionFor(slot) {
    switch (slot) {
        case 'width': return 'מה רוחב הארון בס״מ?';
        case 'height': return 'מה גובה הארון בס״מ?';
        case 'depth': return 'מה עומק הארון בס״מ? (ברירת מחדל 54)';
        case 'columns': return 'כמה עמודות?';
        case 'hasDoors': return 'עם דלתות? (כן / לא)';
        case 'drawerCount': return 'כמה מגירות חיצוניות?';
        case 'roomW': return 'מה מידות החדר? למשל: 2 על 3 מטר';
        case 'walls': return 'כמה דפנות לארון? (2 / 3)';
        default: return 'אפשר לפרט קצת יותר?';
    }
}

function defaultColumns(width) {
    var w = width || 160;
    var n = Math.round(w / 60);
    return Math.max(2, Math.min(8, n));
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
    if (slots.hanging) parts.push('תלייה');
    if (slots.drawers) parts.push((slots.drawerCount ? (slots.drawerCount + ' ') : '') + 'מגירות');
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

function applyHangingLayout() {
    (state.columns || []).forEach(function (col) {
        if (!col) return;
        if (!col.compartments || !col.compartments.length) {
            col.shelves = 1;
            if (typeof distributeShelves === 'function') distributeShelves(col);
        }
        var comps = col.compartments || [];
        if (!comps.length) return;
        // Bottom cell = hanging (or only cell)
        var bottom = comps[0];
        if (bottom) {
            bottom.type = 'hanging';
            delete bottom.partition;
            delete bottom.subCells;
        }
        // Upper cells stay shelves/empty
        for (var r = 1; r < comps.length; r++) {
            if (comps[r] && (!comps[r].type || comps[r].type === 'empty')) comps[r].type = 'empty';
        }
    });
}

function applyExternalDrawers(count) {
    count = Math.max(1, Math.min(8, count || 3));
    var cols = state.columns || [];
    if (!cols.length) return;
    // Put drawers in first column bottom (or all columns if few cols)
    var targets = cols.length <= 2 ? cols : [cols[0]];
    targets.forEach(function (col) {
        if (!col) return;
        if (!col.compartments || col.compartments.length < 2) {
            col.shelves = Math.max(col.shelves || 0, 1);
            if (typeof distributeShelves === 'function') distributeShelves(col);
        }
        var comps = col.compartments || [];
        if (!comps.length) return;
        var row = 0;
        comps[row] = comps[row] || { type: 'empty' };
        comps[row].type = 'external_drawers';
        comps[row].count = count;
        // Remove doors covering that row
        if (Array.isArray(col.doors)) {
            col.doors = col.doors.filter(function (d) {
                return !(d && row >= d.startRow && row <= d.endRow);
            });
            // If doors remain above, shrink start
            col.doors.forEach(function (d) {
                if (d.startRow <= row && d.endRow > row) d.startRow = row + 1;
            });
            col.doors = col.doors.filter(function (d) { return d.endRow >= d.startRow; });
        }
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
    if (typeof syncSidebarToWing === 'function') syncSidebarToWing();
    if (typeof buildCabinet === 'function') buildCabinet();
    if (typeof updateCameraView === 'function') updateCameraView();
    if (typeof calculatePrice === 'function') calculatePrice();
    if (typeof saveHistoryState === 'function') saveHistoryState();
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
    var cols = slots.columns != null ? slots.columns : defaultColumns(width);
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
    } else if (typeof _applyColumnCountChange === 'function') {
        _applyColumnCountChange(cols, 'right', true);
    }
    syncColumnUi(cols);

    applyFrontStyles(slots);

    if (slots.hanging || slots.shelves) {
        (state.columns || []).forEach(function (col) {
            if (!col) return;
            col.shelves = slots.hanging ? Math.max(1, col.shelves || 0) : Math.max(2, col.shelves || 0);
            if (typeof distributeShelves === 'function') distributeShelves(col);
        });
    }
    if (slots.hanging) applyHangingLayout();

    if (slots.drawers) {
        applyExternalDrawers(slots.drawerCount || 3);
        // Doors on remaining cells
        if (hasDoors) {
            (state.columns || []).forEach(function (col) {
                if (!col || !col.compartments) return;
                var start = 0;
                for (var r = 0; r < col.compartments.length; r++) {
                    if (col.compartments[r] && col.compartments[r].type === 'external_drawers') start = r + 1;
                }
                if (start <= col.compartments.length - 1) {
                    var type = (col.width || 0) >= 55 ? 'double' : 'left';
                    var style = state.frontFaceStyle === 'profile' ? 'framed_melamine' : 'solid';
                    col.doors = [{ startRow: start, endRow: col.compartments.length - 1, type: type, style: style }];
                } else {
                    col.doors = [];
                }
            });
            state.hasDoors = true;
        } else {
            clearDoors();
        }
    } else if (hasDoors) {
        applyDoorsToAllColumns();
    } else {
        clearDoors();
    }

    finishApply();
    return 'יצרתי ארון: ' + summarizeSlots({
        width: width, height: height, depth: depth, columns: cols,
        hasDoors: hasDoors, frontFaceStyle: slots.frontFaceStyle, frontStyle: slots.frontStyle,
        hanging: slots.hanging, drawers: slots.drawers, drawerCount: slots.drawerCount
    });
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
    if (slots.hanging) {
        applyHangingLayout();
        changed.push('תלייה');
    }
    if (slots.drawers) {
        applyExternalDrawers(slots.drawerCount || 3);
        changed.push((slots.drawerCount || 3) + ' מגירות');
    }
    if (slots.hasDoors === true) {
        applyDoorsToAllColumns();
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
    return 'כתבו בעברית מה תרצו. דוגמאות:\n' +
        '• «ארון 240 על 60 גובה 270 עם 4 עמודות ודלתות»\n' +
        '• «שנה עומק ל־55»\n' +
        '• «תוסיף חזיתות פרופיל»\n' +
        '• «3 מגירות חיצוניות»\n' +
        'אם חסר מידע — אשאל.';
}

function processMessage(raw) {
    var text = normalize(raw);
    if (!text) return { reply: 'כתבו מה תרצו ליצור או לשנות בארון.' };

    var intent = detectIntent(text);
    var slots = parseSlots(text);

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
    if (SESSION && (intent === 'answer' || intent === 'unknown' || intent === SESSION.intent || intent === 'edit' || intent === 'create')) {
        SESSION.slots = mergeSlots(SESSION.slots, slots);
        slots = SESSION.slots;
        intent = SESSION.intent;
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
        return { reply: msg, done: true };
    }

    if (intent === 'edit') {
        // If mid-create, treat as fill; else edit current
        if (SESSION && (SESSION.intent === 'create' || SESSION.intent === 'create_walkin')) {
            SESSION.slots = mergeSlots(SESSION.slots, slots);
            var miss2 = SESSION.intent === 'create_walkin' ? missingForWalkin(SESSION.slots) : missingForCreate(SESSION.slots);
            if (miss2.length) {
                SESSION.awaiting = miss2[0];
                return { reply: questionFor(miss2[0]) };
            }
            var fin = SESSION.intent === 'create_walkin' ? applyWalkin(SESSION.slots) : applyCreateLinear(SESSION.slots);
            SESSION = null;
            return { reply: fin, done: true };
        }
        var editMsg = applyEdit(slots);
        if (!editMsg) {
            return { reply: 'מה לשנות? למשל: «שנה רוחב ל־200», «4 עמודות», «חזיתות פרופיל».' };
        }
        return { reply: editMsg, done: true };
    }

    return { reply: 'לא הצלחתי לבצע. ' + helpText() };
}

// ── UI ──────────────────────────────────────────────────────────────────────

function setOffset(px) {
    document.documentElement.style.setProperty(CHAT_OFFSET_VAR, (px || 0) + 'px');
    document.body.classList.toggle('has-cabinet-chat', !!px);
}

function measureAndSetOffset() {
    var root = document.getElementById('cabinet-chat');
    if (!root) return;
    var h = root.getBoundingClientRect().height || 0;
    setOffset(Math.ceil(h + 8));
}

function appendBubble(role, text) {
    var log = document.getElementById('cabinet-chat-log');
    if (!log) return;
    var div = document.createElement('div');
    div.className = 'cab-chat-bubble cab-chat-' + role;
    div.innerHTML = esc(text).replace(/\n/g, '<br>');
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
    HISTORY.push({ role: role, text: text });
    measureAndSetOffset();
}

function setExpanded(on) {
    var root = document.getElementById('cabinet-chat');
    if (!root) return;
    root.classList.toggle('expanded', !!on);
    measureAndSetOffset();
}

function send() {
    var input = document.getElementById('cabinet-chat-input');
    if (!input) return;
    var text = input.value;
    input.value = '';
    if (!normalize(text)) return;
    setExpanded(true);
    appendBubble('user', text);
    var thinking = document.getElementById('cabinet-chat-status');
    if (thinking) thinking.textContent = '…';
    var result;
    try {
        result = processMessage(text);
    } catch (err) {
        console.error('[cabinet-chat]', err);
        result = { reply: 'משהו השתבש בביצוע. נסו לנסח אחרת או לפרק לבקשה קצרה יותר.' };
    }
    if (thinking) thinking.textContent = '';
    appendBubble('bot', result.reply || 'בוצע.');
    if (result.done) setTimeout(function () { measureAndSetOffset(); }, 50);
}

function injectUi() {
    if (document.getElementById('cabinet-chat')) return;
    if (!document.getElementById('canvas-container')) return;

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
    document.body.appendChild(wrap);

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
    measureAndSetOffset();

    // Welcome once per session
    appendBubble('bot', 'אפשר ליצור ולערוך ארונות במלל. נסו: «ארון 200 גובה 270 עם דלתות»');
}

function injectStyles() {
    if (document.getElementById('cabinet-chat-styles')) return;
    var st = document.createElement('style');
    st.id = 'cabinet-chat-styles';
    st.textContent =
        ':root{' + CHAT_OFFSET_VAR + ':0px}' +
        '#cabinet-chat{position:fixed;z-index:9200;left:calc(var(--layout-sidebar-left,360px) + 16px);' +
        'right:calc(var(--layout-sidebar-right,420px) + 16px);bottom:12px;display:flex;flex-direction:column;' +
        'gap:6px;pointer-events:none;font-family:inherit;direction:rtl}' +
        '#cabinet-chat > *{pointer-events:auto}' +
        '#cabinet-chat .cab-chat-log{display:none;max-height:min(28vh,220px);overflow-y:auto;padding:8px 4px;' +
        'flex-direction:column;gap:6px}' +
        '#cabinet-chat.expanded .cab-chat-log{display:flex}' +
        '.cab-chat-bubble{max-width:92%;padding:8px 12px;border-radius:14px;font-size:.86rem;line-height:1.45;' +
        'box-shadow:0 4px 14px rgba(15,23,42,.08)}' +
        '.cab-chat-bot{align-self:flex-start;background:rgba(255,255,255,.96);border:1px solid rgba(30,58,95,.12);color:#1e293b}' +
        '.cab-chat-user{align-self:flex-end;background:linear-gradient(135deg,#1e3a5f,#2563eb);color:#fff}' +
        '.cab-chat-row{display:flex;align-items:center;gap:8px;background:rgba(255,255,255,.94);' +
        'backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);border:1px solid rgba(30,58,95,.12);' +
        'border-radius:999px;padding:6px 8px 6px 6px;box-shadow:0 8px 28px rgba(15,23,42,.14)}' +
        '#cabinet-chat-input{flex:1;border:none;outline:none;background:transparent;font:inherit;font-size:.9rem;' +
        'padding:8px 6px;min-width:0;color:#0f172a}' +
        '#cabinet-chat-input::placeholder{color:#94a3b8}' +
        '.cab-chat-send,.cab-chat-toggle{width:40px;height:40px;border:none;border-radius:50%;cursor:pointer;' +
        'display:inline-flex;align-items:center;justify-content:center;flex-shrink:0}' +
        '.cab-chat-send{background:linear-gradient(135deg,#1e3a5f,#2563eb);color:#fff}' +
        '.cab-chat-toggle{background:rgba(30,58,95,.08);color:#1e3a5f}' +
        '.cab-chat-status{min-height:0;font-size:.75rem;color:#64748b;padding:0 12px}' +
        /* Keep canvas / floating UI above the chat */
        'body.has-cabinet-chat #canvas-container{padding-bottom:var(' + CHAT_OFFSET_VAR + ')}' +
        'body.has-cabinet-chat #room-furniture-toolbar{bottom:calc(22px + var(' + CHAT_OFFSET_VAR + ')) !important}' +
        'body.has-cabinet-chat #btn-help-chat{bottom:calc(12px + var(' + CHAT_OFFSET_VAR + ')) !important}' +
        'body.has-cabinet-chat #designer-notes-float-btn{bottom:calc(80px + var(' + CHAT_OFFSET_VAR + ')) !important}' +
        '@media (max-width:768px){' +
        '#cabinet-chat{left:10px;right:10px;bottom:calc(66px + env(safe-area-inset-bottom,0px))}' +
        'body.has-cabinet-chat #btn-help-chat{bottom:calc(130px + env(safe-area-inset-bottom,0px) + var(' + CHAT_OFFSET_VAR + ')) !important}' +
        'body.has-cabinet-chat #mobile-bottom-nav{/* chat sits above nav */}' +
        '}';
    document.head.appendChild(st);
}

function init() {
    injectStyles();
    injectUi();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

window.CabinetChat = {
    process: processMessage,
    parseSlots: parseSlots,
    reset: function () { SESSION = null; },
    init: init
};

})();
