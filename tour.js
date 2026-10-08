// ==========================================
// מדריך אינטראקטיבי — Product Tour (plan-aware, multi-topic)
// ==========================================
// Each step: { target: selector | [selectors], title, text (string | fn(ctx)), when?: fn(ctx),
//              position?: 'left'|'right'|'top'|'bottom', subPanel?: element id to open visually }
// Steps whose target lives in the cell toolbar / room-plan toolbar / a sidebar rail group are
// prepared automatically (cell selected, room plan opened, rail group switched) before showing.

(function() {
'use strict';

console.log('[tour.js] loaded');

function $(id) { return document.getElementById(id); }
function q(sel) { try { return document.querySelector(sel); } catch (e) { return null; } }

function _isVisibleNow(el) {
    if (!el) return false;
    var r = el.getBoundingClientRect();
    return r.width >= 2 && r.height >= 2;
}
function _vis(sel) { return _isVisibleNow(q(sel)); }

function _heJoin(arr) {
    if (arr.length <= 1) return arr.join('');
    return arr.slice(0, -1).join(', ') + ' ו' + arr[arr.length - 1];
}

// ── Plan context ────────────────────────────────────────────────────────────
function _ctx() {
    var p = window._plan || {};
    var f = window._features || p.features || {};
    var key = p.key || '';
    var spaceMax = (typeof window._spacePlanMax === 'function') ? window._spacePlanMax() : 4;
    return {
        plan: p,
        f: f,
        label: p.label || '',
        designer: p.userType === 'designer' || key.indexOf('designer') === 0,
        pricing: window._showPricing === true || f.showPricing === true,
        quote: f.canQuote !== false,
        corners: f.canCornerCabinets !== false,
        fullPalette: f.fullTambourPalette !== false,
        simpleStatuses: !!(window.Projects && window.Projects.simpleStatuses) || f.simpleStatuses === true,
        spaceMax: spaceMax,
        preset: (typeof state !== 'undefined' && state && state.presetId) || 'linear'
    };
}

// True when the current cabinet can start a shared space but none exists yet.
function _spacePending() {
    var canUse = typeof window._spacePairCanUse === 'function' && window._spacePairCanUse();
    var info = typeof window._getSpacePairInfo === 'function' ? window._getSpacePairInfo() : null;
    return !!canUse && !info;
}

function _docsList() {
    var a = [];
    if (_vis('#btn-customer-quote')) a.push('הצעת מחיר');
    if (_vis('#btn-factory-order')) a.push('שליחה לייצור');
    if (_vis('#btn-customer-report')) a.push('סיכום ללקוח');
    if (_vis('#btn-quick-calc-open')) a.push('מחשבון מהיר');
    return a;
}

// ── Topics ──────────────────────────────────────────────────────────────────
var EDIT_HINT_STEP = {
    target: '#sidebar-edit-placeholder',
    title: '👆 קודם בוחרים ארון',
    text: 'חלק מההגדרות בנושא הזה מופיעות רק כשארון או כנף פתוחים לעריכה. לחצו על כנף בהדמיה או על <b>ערוך</b> בכרטיס הארון משמאל, ואז פתחו שוב את ההדרכה כדי לראות את כל השלבים.',
    position: 'left'
};

var TOPICS = [
    // ── 1. סקירה מהירה ──────────────────────────────────────────────────────
    {
        key: 'quickstart', icon: '🚀', title: 'סקירה מהירה',
        desc: 'היכרות עם מסך העבודה — מהבחירה ועד השמירה',
        steps: [
            {
                target: '#cabinet-presets-row',
                title: '🪵 בחירת סוג ארון',
                text: function(c) {
                    return c.corners
                        ? 'מתחילים מבחירת סוג: ארון רגיל, פינה ימין/שמאל, חדר ארונות, שולחן כתיבה, ארון הזזה או ארון אמבטיה. לחיצה טוענת אותו מיד להדמיה.'
                        : 'מתחילים מבחירת סוג: ארון רגיל, שולחן כתיבה, ארון הזזה או ארון אמבטיה. לחיצה טוענת אותו מיד להדמיה.';
                },
                position: 'left'
            },
            {
                target: '#header-dims-row',
                title: '📐 מידות הארון',
                text: 'לחצו על מספר כדי להקליד מידה, או רחפו מעל הכרטיס לסליידר וכפתורי +/−. כאן גם גובה הצוקל ומספר העמודות — ההדמיה מתעדכנת מיד.',
                position: 'left'
            },
            {
                target: '#bottom-floating-toolbar',
                title: '🗂️ תוכן התאים',
                text: 'לחיצה על תא בהדמיה פותחת את סרגל התכולה: תלייה, מחיצה, מגירות, כוורת, מוצרי חשמל, לדים ודלתות. יש לזה הדרכה מפורטת נפרדת.',
                position: 'right'
            },
            {
                target: '#sb-rail',
                title: '🧭 קבוצות ההגדרות',
                text: 'פס האייקונים מחליף בין קבוצות: <b>לקוח</b> (פרטי הפרויקט), <b>ארון</b> (דגם, בסיס, ידיות), <b>חדר</b>, <b>תוספות</b> (יחידת צד ויחידה פינתית) ו<b>צבעים</b>.',
                position: 'left'
            },
            {
                target: '#price-section-wrap',
                when: function(c) { return c.pricing; },
                title: '💰 מחיר ושמירה',
                text: 'המחיר וההתקנה מחושבים אוטומטית לפי המחירון (אפשר להקליד מחיר ידני). בסיום לחצו <b>שמור שינויים לארון</b> — הארון נשמר בפרויקט.',
                position: 'left'
            },
            {
                target: '#btn-add-to-cart',
                when: function(c) { return !c.pricing; },
                title: '💾 שמירת הארון',
                text: 'בסיום העיצוב לחצו <b>שמור שינויים לארון</b> — הארון נשמר בתוך הפרויקט ומופיע ברשימה משמאל.',
                position: 'left'
            },
            {
                target: '#left-sidebar',
                title: '🗂️ הפרויקט שלך',
                text: function() {
                    var docs = _docsList();
                    return 'כאן כל הארונות של הפרויקט, שמירה, שיתוף ללקוח וסטטוס' +
                        (docs.length ? ', וגם: ' + _heJoin(docs) + '.' : '.');
                },
                position: 'right'
            },
            {
                target: '#btn-start-tour',
                title: '📚 הדרכות נוספות',
                text: 'בכל רגע אפשר לחזור לכפתור הזה ולבחור הדרכה מפורטת לכל נושא. ההדרכות מותאמות לכלים שכלולים במנוי שלך.',
                position: 'bottom'
            }
        ]
    },

    // ── 2. סוגי ארונות, תבניות ומידות ───────────────────────────────────────
    {
        key: 'design', icon: '📐', title: 'סוגי ארונות, תבניות ומידות',
        desc: 'תבניות מוכנות, סוגי ארונות, מידות ועמודות',
        steps: [
            {
                target: '.preset-btn-wand',
                title: '🪄 תבניות ארון',
                text: 'שרביט הקסם שעל "ארון רגיל" פותח תבניות מוכנות. אפשר גם לשמור את הארון הנוכחי כתבנית ולהשתמש בה שוב בפרויקטים הבאים.',
                position: 'left'
            },
            {
                target: '#cabinet-presets-row > .presets-grid:nth-of-type(1)',
                when: function(c) { return c.corners; },
                title: '📐 ארונות פינה וחדר ארונות',
                text: 'פינה ימין/שמאל וחדר ארונות (U) מוסיפים כנפיים לארון. אחרי הבחירה מופיע תפריט סידור הכנף: חיצוני, פנימי או פינה מלאה. לחיצה על כנף בהדמיה פותחת אותה לעריכה.',
                position: 'left'
            },
            {
                target: '#preset-position-menu',
                when: function(c) { return c.corners; },
                title: '🧭 סידור הכנף',
                text: '<b>חיצוני</b> — חזית הכנף מיושרת עם הארון המרכזי, <b>פנימי</b> — הכנף בולטת קדימה מחזית הארון המרכזי, <b>פינה מלאה</b> — יחידת פינה רציפה בצורת L. בחדר ארונות בוחרים סידור לכל כנף בנפרד.',
                position: 'left'
            },
            {
                target: '#cabinet-presets-row > .presets-grid:nth-of-type(2)',
                title: '🖥️ שולחן כתיבה, הזזה ואמבטיה',
                text: 'שולחן כתיבה עצמאי, ארון עם דלתות הזזה, וארון אמבטיה עומד או תלוי. ההגדרות הייחודיות של כל אחד (פרזול, כיור, מגירות) מופיעות בקבוצת <b>ארון</b>.',
                position: 'left'
            },
            {
                target: [
                    '#header-dims-row .header-dim-card[data-dim="width"]',
                    '#header-dims-row .header-dim-card[data-dim="height"]',
                    '#header-dims-row .header-dim-card[data-dim="plinth"]',
                    '#header-dims-row .header-dim-card[data-dim="depth"]'
                ],
                title: '📏 רוחב, גובה, צוקל ועומק',
                text: 'לחצו על המספר והקלידו (Enter לאישור), או רחפו מעל הכרטיס כדי לקבל סליידר וכפתורי +/−. סוג הבסיס עצמו (צוקל נסתר / רגיל / רגליים) נבחר בקבוצת <b>ארון</b>.',
                position: 'left'
            },
            {
                target: '#header-columns-card',
                title: '🏛️ עמודות',
                text: '+/− מוסיף או מסיר עמודות. את הרוחב של כל עמודה ואת הגובה של כל תא משנים ישירות בתגיות המספרים שעל ההדמיה.',
                position: 'left'
            }
        ]
    },

    // ── 3. ארונות במרחב אחד ─────────────────────────────────────────────────
    {
        key: 'space', icon: '🧱', title: 'כמה ארונות במרחב אחד',
        desc: 'הוספת ארון לאותה סצנה, מעבר בין ארונות ומיקום במרחב',
        when: function(c) { return c.spaceMax > 1; },
        steps: [
            {
                target: '#btn-add-space-cab',
                title: '➕ הוספת ארון למרחב',
                text: function(c) {
                    var cap = c.spaceMax <= 2 ? ' במנוי שלך: עד ' + c.spaceMax + ' ארונות במרחב.' : '';
                    return _spacePending()
                        ? 'מוסיף ארון חדש לאותה סצנה תלת-ממדית — למשל ארון ושולחן כתיבה זה לצד זה, או ארון עליון מעל שידה. הארון הנוכחי נשמר, והחדש נפתח לעריכה לידו.' + cap +
                          '<br>לחצו <b>הוסף ארון עכשיו</b> ונמשיך להראות איך עובדים עם הארונות במרחב.'
                        : 'מוסיף עוד ארון לאותו מרחב — הארון החדש נפתח לעריכה ליד הקיימים.' + cap;
                },
                action: {
                    label: '➕ הוסף ארון עכשיו',
                    when: function() { return _spacePending(); },
                    run: function() { if (typeof window.addSpaceCabinet === 'function') window.addSpaceCabinet(); }
                },
                position: 'left'
            },
            {
                target: '#btn-join-space-cab',
                title: '🔗 חיבור ארון קיים',
                text: 'כבר יש בפרויקט ארון רגיל, ארון הזזה או שולחן כתיבה? מחברים אותו לאותו מרחב במקום ליצור ארון חדש.',
                position: 'left'
            },
            {
                target: '#space-cab-tabs-btns',
                afterAction: true,
                title: '🗂️ מעבר בין הארונות',
                text: 'לכל ארון במרחב יש לשונית. לחיצה על לשונית — או על הארון עצמו בהדמיה — פותחת אותו לעריכה. כל ארון נערך בנפרד: מידות, תכולה וצבעים.',
                position: 'left'
            },
            {
                target: '#space-cab-offset-row',
                afterAction: true,
                title: '🧭 מיקום הארון במרחב',
                text: '<b>X</b> — הזזה ימינה/שמאלה, <b>Y</b> — הגבהה מהרצפה (למשל ארון עליון), <b>Z</b> — קידום קדימה מהקיר. הערכים נמדדים ביחס לארון הראשון במרחב, בס"מ.',
                position: 'left'
            },
            {
                target: '#btn-leave-space-cab',
                afterAction: true,
                title: '🔓 הוצאה מהמרחב',
                text: 'מוציא את הארון הנוכחי מהמרחב המשותף — הוא נשאר בפרויקט כארון נפרד. ארון שנוסף רק לניסיון אפשר למחוק מהכרטיס שלו בפאנל הפרויקט.',
                position: 'left'
            }
        ]
    },

    // ── 4. תוכן תאים ודלתות ─────────────────────────────────────────────────
    {
        key: 'cells', icon: '🗂️', title: 'תוכן תאים ודלתות',
        desc: 'תלייה, מחיצות, מגירות, כוורת, מוצרי חשמל, לדים ודלתות',
        steps: [
            {
                target: '#bottom-floating-toolbar',
                title: '👆 בחירת תאים',
                text: 'לחצו על תא בהדמיה כדי לבחור אותו. לחיצה על תאים נוספים באותה עמודה מוסיפה אותם לבחירה — וכל שינוי בסרגל חל על כולם.',
                position: 'right'
            },
            {
                target: ['#tb-btn-hanging', '#hanging-sub-panel'],
                subPanel: 'hanging-sub-panel',
                title: '👔 תלייה',
                text: 'מוט תלייה רגיל, או <b>סורבטו</b> — מוט שנשלף כלפי מטה, מתאים לתאים גבוהים.',
                position: 'right'
            },
            {
                target: '#tb-btn-partition',
                title: '🗂️ מחיצה',
                text: 'מחלקת את התא לחלקים. אחרי ההוספה מופיעים כפתורי +/− לשינוי מספר המחיצות, וכל חלק מקבל תוכן משלו.',
                position: 'right'
            },
            {
                target: ['#tb-btn-drawer', '#drawer-sub-panel'],
                subPanel: 'drawer-sub-panel',
                title: '🗄️ מגירות',
                text: 'מגירות <b>פנים</b> (מאחורי הדלת) או מגירות <b>חוץ</b> (חזית גלויה). אחרי הבחירה קובעים את מספר המגירות, ולמגירות חוץ גם את הידית.',
                position: 'right'
            },
            {
                target: ['#tb-btn-honeycomb', '#honeycomb-sub-panel'],
                subPanel: 'honeycomb-sub-panel',
                title: '🍯 כוורת',
                text: 'כוורת רגילה — תאים פתוחים בלי דלת, או <b>כוורת צד</b> שפתוחה לצד הארון.',
                position: 'right'
            },
            {
                target: ['#tb-btn-appliances', '#appliances-sub-panel'],
                subPanel: 'appliances-sub-panel',
                title: '🔌 מוצרי חשמל',
                text: 'מקום למכונת כביסה, מייבש או טלוויזיה — המכשיר מוצג בהדמיה כדי לבדוק שהכול נכנס.',
                position: 'right'
            },
            {
                target: '#tb-btn-led',
                title: '💡 לדים',
                text: 'מוסיף זוג פסי לד לאורך התאים שנבחרו.',
                position: 'right'
            },
            {
                target: '#toolbar-section-doors',
                title: '🚪 דלתות',
                text: 'ללא דלת, ימין, שמאל, כפולה או <b>קלפה</b> (נפתחת למעלה). אחרי בחירת דלת נפתח לידה סגנון: מלמין, מסגרת, זכוכית, זכוכית שחורה, זהב או מראה — ומופיע כפתור לבחירת ידית.',
                position: 'right'
            },
            {
                target: '#btn-toggle-doors',
                title: '👁️ הצגה / הסתרה של חזיתות',
                text: 'מסתיר את הדלתות בהדמיה כדי לראות את התכולה. תצוגה בלבד — הארון עצמו לא משתנה.',
                position: 'bottom'
            }
        ]
    },

    // ── 4. הגדרות ארון וידיות ───────────────────────────────────────────────
    {
        key: 'cabinet', icon: '⚙️', title: 'הגדרות ארון וידיות',
        desc: 'דגם, בסיס, התקנה, חומר גוף, ידיות והערות',
        steps: [
            {
                target: '#cabinet-model-label-row',
                title: '🏷️ דגם ארון',
                text: 'שם או קוד דגם שיופיע במסמכים. שדה ריק = דגם הבסיס.',
                position: 'left'
            },
            {
                target: '#plinth-placement-grid',
                title: '🧱 בסיס והתקנה',
                text: '<b>דגם בסיס:</b> צוקל נסתר, צוקל רגיל או ארון על רגליים. <b>התקנה:</b> קיר חופשי, בין קירות או נישה — משפיע על לוחות הסגירה.',
                position: 'left'
            },
            {
                target: '#board-mat-row',
                title: '🪵 חומר גוף',
                text: 'מלמין או MDF (עד 270 ס"מ גובה) או סנדביץ\' (עד 240 ס"מ). חלק מהגוונים זמינים רק בחומרים מסוימים.',
                position: 'left'
            },
            {
                target: '#handle-type-row',
                title: '🔩 ידיות',
                text: '<b>רוכבת</b> (עם בחירת צבע), <b>טאצ\'</b> (בלי ידית) או <b>חיצונית</b> — צינור כסף/שחור/זהב, חצי ירח, או "ידיות הלקוח". בשדה שמתחת אפשר לרשום דגם.',
                position: 'left'
            },
            {
                target: '#inp-cabinet-notes',
                title: '📝 הערות לארון',
                text: 'הערות לייצור, להתקנה או ללקוח — מודפסות במסמכים של הארון.',
                position: 'left'
            },
            {
                target: '#sliding-door-section',
                title: '↔️ הגדרות ארון הזזה',
                text: 'צבע פרזול האלומיניום, עיצוב נפרד לכל דלת (חומר / זכוכית / מראה) ומספר הדלתות.',
                position: 'left'
            },
            {
                target: '#bathroom-section',
                title: '🚿 הגדרות ארון אמבטיה',
                text: 'ארון עומד או תלוי, סוג משטח/כיור (חרס אינטגרלי, בוצ\'ר או קוריאן) וסגנון החזית.',
                position: 'left'
            },
            {
                target: '#writing-desk-section',
                title: '🖥️ הגדרות שולחן כתיבה',
                text: 'מגירות תחתונות — כמות וגובה. רוחב, גובה ועומק נקבעים במידות שלמעלה.',
                position: 'left'
            }
        ]
    },

    // ── 5. חדר ותצוגת חדר ───────────────────────────────────────────────────
    {
        key: 'room', icon: '🏠', title: 'החדר ותצוגת חדר',
        desc: 'מיקום בחדר, מידות החדר ותכנון במבט-על',
        steps: [
            {
                target: '#room-wall-section',
                title: '🧲 מיקום הארון בחדר',
                text: 'צמוד לקיר ימין, שמאל, במרכז או בין שני קירות.',
                position: 'left'
            },
            {
                target: '#room-settings-section',
                title: '📐 מידות החדר',
                text: 'רוחב, עומק וגובה תקרה — ההדמיה מציגה את הארון בפרופורציה הנכונה לחדר.',
                position: 'left'
            },
            {
                target: '#btn-room-plan',
                title: '🧭 תצוגת חדר',
                text: 'מבט-על של החדר עם מידות בזמן אמת. בשלב הבא נפתח אותה בשבילכם.',
                position: 'bottom'
            },
            {
                target: '#room-furniture-toolbar',
                title: '🛋️ כלי תצוגת החדר',
                text: 'מעבר בין 2D ל-3D, הצגה/הסתרה של מיטה וכסא, הוספת פריט מותאם או חלון, צד הציר וכיוון הפתיחה של הדלת, והוספת ארונות ושולחנות אחרים מהפרויקט לאותו חדר. את הפריטים גוררים במבט-על.',
                position: 'top'
            }
        ]
    },

    // ── 6. תוספות ───────────────────────────────────────────────────────────
    {
        key: 'extras', icon: '🪑', title: 'יחידות נוספות',
        desc: 'יחידת צד (שולחן / ארון צד) ויחידה פינתית',
        steps: [
            {
                target: '#side-unit-section',
                title: '🪑 יחידת צד',
                text: 'ללא, <b>שולחן צד</b> (עם או בלי מגירות) או <b>ארון צד</b> הפוך. בוחרים צד ימין/שמאל ומשנים את הרוחב.',
                position: 'left'
            },
            {
                target: '#corner-unit-section',
                title: '📐 יחידה פינתית',
                text: 'יחידה שמוצמדת מימין או משמאל לארון — יחידת מגירות או שולחן פינתי, עם רוחב ומידות לשינוי.',
                position: 'left'
            }
        ]
    },

    // ── 7. צבעים וחומרים ────────────────────────────────────────────────────
    {
        key: 'materials', icon: '🎨', title: 'צבעים וחומרים',
        desc: function(c) {
            return c.fullPalette
                ? 'גוונים, טקסטורות, מניפת טמבור המלאה וצביעה מתקדמת'
                : 'גוונים, טקסטורות, גווני טמבור נבחרים וצביעה מתקדמת';
        },
        steps: [
            {
                target: '.color-part-tabs',
                title: '🧩 איזה חלק צובעים',
                text: 'בוחרים חלק — גוף וצוקל, מדפים ופנים, גב, חזיתות, שולחן או כוורת (ולשוניות נוספות כשיש זכוכית, ארון צד או משטח). הנקודה הצבעונית מראה את הגוון הנוכחי של כל חלק.',
                position: 'left'
            },
            {
                target: '#mat-solid-grid',
                title: '⬜ גוונים חלקים',
                text: 'לחיצה על גוון מחילה אותו על החלק שנבחר בלשונית.',
                position: 'left'
            },
            {
                target: '#mat-texture-grid',
                title: '🌳 טקסטורות עץ ודוגמאות',
                text: 'דוגמאות עץ ושיש. גוונים שלא זמינים בחומר הגוף שנבחר מוסתרים אוטומטית.',
                position: 'left'
            },
            {
                target: '.btn-open-tambour-palette',
                title: '🖌️ מניפת טמבור',
                text: function(c) {
                    return c.fullPalette
                        ? 'כל 1651 הגוונים של טמבור, עם חיפוש לפי שם או קוד — לצביעה בכל גוון שהלקוח בוחר.'
                        : 'גווני טמבור נבחרים ומומלצים לארונות, עם חיפוש לפי שם או קוד.';
                },
                position: 'left'
            },
            {
                target: '#btn-part-paint',
                title: '🎯 צביעה מתקדמת',
                text: 'מצב שבו לוחצים על לוח בהדמיה וצובעים רק אותו — למשל דלת אחת בגוון שונה.',
                position: 'left'
            }
        ]
    },

    // ── 8. ניהול הפרויקט ────────────────────────────────────────────────────
    {
        key: 'project', icon: '🗂️', title: 'ניהול הפרויקט',
        desc: 'פרטי לקוח, שמירה, שיתוף, סטטוס, ארונות והיסטוריה',
        steps: [
            {
                target: '#customer-section',
                title: '👤 פרטי לקוח',
                text: 'שם, טלפון, מספר הזמנה, כתובת וצפי אספקה — מופיעים במסמכים.',
                position: 'left'
            },
            {
                target: ['#sidebar-project-name', '#btn-save-project-sidebar'],
                title: '☁️ שם ושמירה',
                text: 'לחצו על שם הפרויקט כדי לשנות אותו. <b>שמור</b> שומר את הפרויקט בענן.',
                position: 'right'
            },
            {
                target: '#btn-share-live',
                title: '🔗 שיתוף ללקוח',
                text: 'יוצר קישור צפייה חי — הלקוח רואה את ההדמיה בדפדפן בלי להתחבר, ויכול להשאיר הערות.',
                position: 'right'
            },
            {
                target: '#btn-designer-notes',
                title: '📝 תיקונים',
                text: 'הערות ובקשות תיקון שהלקוח השאיר בקישור, בזמן אמת.',
                position: 'right'
            },
            {
                target: '#sidebar-order-status-trigger',
                title: '📌 סטטוס',
                text: function(c) {
                    return c.simpleStatuses
                        ? 'סמנו את הפרויקט כפעיל או כהושלם — כך קל לסנן את רשימת הפרויקטים.'
                        : 'עדכנו את שלב הפרויקט: הצעת מחיר, מדידה, עסקה נסגרה, ייצור, קריאת שירות והתקנה.';
                },
                position: 'right'
            },
            {
                target: '#btn-new-cabinet-sidebar',
                title: '➕ ארון חדש',
                text: 'שומר את הארון הנוכחי ופותח ארון חדש באותו פרויקט.',
                position: 'right'
            },
            {
                target: '#cart-items-list .cart-mini-card',
                title: '🃏 כרטיס ארון',
                text: '<b>ערוך</b>, <b>שכפל</b> או <b>מחק</b>. <b>השהה</b> משאיר את הארון בפרויקט בלי לכלול אותו בסיכום. <b>מיקום בחדר</b> מסדר את הארונות זה ליד זה, ו<b>תיקונים</b> לכל ארון בנפרד.',
                position: 'right'
            },
            {
                target: '#btn-cart-trash',
                title: '🗑️ פח אשפה',
                text: 'ארונות שנמחקו נשמרים כאן 30 יום ואפשר לשחזר אותם.',
                position: 'right'
            },
            {
                target: ['#btn-redo', '#btn-history', '#btn-undo'],
                title: '↩️ ביטול, היסטוריה וחזרה',
                text: 'בטלו פעולה, בצעו אותה שוב, או פתחו את היסטוריית הפעולות כדי לחזור לכל שלב.',
                position: 'bottom'
            },
            {
                target: '#btn-reset',
                title: '♻️ איפוס ארון',
                text: 'מאפס את הארון הנוכחי לגמרי ומתחיל אותו מחדש.',
                position: 'bottom'
            },
            {
                target: ['#btn-load-json', '#btn-save-json'],
                title: '💾 גיבוי לקובץ',
                text: 'שמירת הפרויקט כקובץ במחשב וטעינה שלו בחזרה — גיבוי נוסף מעבר לשמירה בענן.',
                position: 'bottom'
            }
        ]
    },

    // ── 9. מחירים ומסמכים ───────────────────────────────────────────────────
    {
        key: 'documents', icon: '📄', title: function(c) { return c.pricing ? 'מחירים ומסמכים' : 'מסמכים והדמיות'; },
        desc: function(c) {
            var parts = [];
            if (c.pricing) parts.push('תמחור');
            var docs = _docsList();
            if (docs.length) parts.push(_heJoin(docs));
            parts.push('שרטוט והדמיה');
            return parts.join(' · ');
        },
        steps: [
            {
                target: '#price-boxes-row',
                when: function(c) { return c.pricing; },
                title: '💰 מחיר והתקנה',
                text: 'מחושבים אוטומטית לפי המחירון. אפשר להקליד מחיר ידני, וכפתור החץ שליד המחיר מחזיר לחישוב האוטומטי.',
                position: 'left'
            },
            {
                target: '#sidebar-pricing-summary',
                when: function(c) { return c.pricing; },
                title: '🧮 סיכום הפרויקט',
                text: 'סך הארונות, ההתקנות והסכום הכולל של הפרויקט. ארונות מושהים לא נספרים.',
                position: 'right'
            },
            {
                target: '#btn-customer-quote',
                when: function(c) { return c.quote; },
                title: '🧾 הצעת מחיר',
                text: 'הפקת הצעת מחיר מעוצבת ללקוח, עם הדמיות ופירוט הארונות.',
                position: 'right'
            },
            {
                target: '#btn-factory-order',
                title: '🏭 שליחה לייצור',
                text: 'טופס ייצור מפורט עם מידות, חומרים ותכולה — לשליחה לנגר או למפעל.',
                position: 'right'
            },
            {
                target: '#btn-customer-report',
                title: '📋 סיכום ללקוח',
                text: function(c) {
                    return c.pricing
                        ? 'מסמך מסודר ללקוח עם פירוט הארונות, החומרים וההדמיות.'
                        : 'מסמך מסודר ללקוח עם פירוט הארונות, החומרים וההדמיות — בלי מחירים.';
                },
                position: 'right'
            },
            {
                target: '#btn-quick-calc-open',
                title: '⚡ מחשבון מהיר',
                text: 'הצעת מחיר ראשונית בלי לעצב — לפי מידות וכמויות. אפשר להדפיס או לשלוח ללקוח.',
                position: 'right'
            },
            {
                target: '#btn-multiview-blueprint',
                title: '📐 שרטוט ייצור',
                text: 'שרטוט טכני של הארון מכמה זוויות עם כל המידות.',
                position: 'bottom'
            },
            {
                target: '#btn-ai-render',
                title: '✨ הדמיה פוטוריאליסטית',
                text: 'יוצר תמונה ריאליסטית של הארון בעזרת AI — מושלם לשליחה ללקוח. מכסת ההדמיות של המנוי מוצגת בחלון.',
                position: 'bottom'
            }
        ]
    }
];

var TOPIC_BY_KEY = {};
TOPICS.forEach(function(t) { TOPIC_BY_KEY[t.key] = t; });
window._TOURS = {};
TOPICS.forEach(function(t) { window._TOURS[t.key] = t.steps; });

function _val(v, c) { return typeof v === 'function' ? v(c) : v; }

// ── Availability ────────────────────────────────────────────────────────────
// Containers the tour can open itself — their own display:none doesn't make a step unavailable.
var PREPARABLE = { 'bottom-floating-toolbar': 1, 'room-furniture-toolbar': 1 };

function _editOpen() {
    var ec = $('sidebar-edit-content');
    return !!ec && ec.style.display !== 'none';
}

function _stepEls(step) {
    return [].concat(step.target).map(q).filter(Boolean);
}

function _reachable(el, step) {
    for (var n = el; n && n.nodeType === 1 && n !== document.body; n = n.parentElement) {
        if (n.id === 'sidebar-edit-content') { if (!_editOpen()) return false; continue; }
        if (PREPARABLE[n.id]) continue;
        if (step && step.subPanel && n.id === step.subPanel) continue;
        if (n.hidden) return false;
        if (n.style && n.style.display === 'none') return false;
        if (n.hasAttribute('data-sbgroup')) continue;   // rail hides inactive groups via CSS
        if (getComputedStyle(n).display === 'none') return false;
    }
    return true;
}

function _resolveTopic(key) {
    var topic = TOPIC_BY_KEY[key];
    if (!topic) return [];
    var c = _ctx();
    if (topic.when && !topic.when(c)) return [];
    var out = [];
    var needsEdit = false;
    var actionPending = topic.steps.some(function(s) {
        return s.action && (!s.action.when || s.action.when(c)) && _stepEls(s).some(function(e) { return _reachable(e, s); });
    });
    topic.steps.forEach(function(s) {
        if (s.when && !s.when(c)) return;
        var els = _stepEls(s);
        if (!els.length) return;
        // Revealed by the topic's action — kept now, dropped at show time if it never appears.
        if (s.afterAction && actionPending) { out.push(s); return; }
        if (!_editOpen() && els.every(function(e) { return e.closest('#sidebar-edit-content'); })) {
            needsEdit = true;
            return;
        }
        if (els.some(function(e) { return _reachable(e, s); })) out.push(s);
    });
    if (needsEdit) out.unshift(EDIT_HINT_STEP);
    return out;
}

// ── State ───────────────────────────────────────────────────────────────────
var T = {
    active: false, key: null, steps: [], idx: 0, els: [], token: 0, raf: 0, layoutKey: '',
    toolbar: false, selectedByTour: false, enteredRoom: false, subOpen: null, railOrig: null, railEl: null
};

function _inRoomPlan() { return typeof state !== 'undefined' && state && state.viewMode === 'room-plan'; }

function _ensureToolbar() {
    try {
        if (typeof state !== 'undefined' && state.columns && state.columns.length > 0 &&
            state.selection && state.selection.colIndex === -1 && typeof toggleSelection === 'function') {
            toggleSelection(0, 0);
            T.selectedByTour = true;
        }
        if (typeof updateToolbarState === 'function') updateToolbarState();
        var tb = $('bottom-floating-toolbar');
        if (tb && tb.dataset.tourOrigZ === undefined) {
            tb.dataset.tourOrigZ = tb.style.zIndex || '';
            tb.style.zIndex = '99999';
        }
        T.toolbar = true;
    } catch (e) { console.warn('[tour] toolbar prepare failed:', e); }
}

function _restoreToolbar() {
    try {
        _closeSubPanel();
        var tb = $('bottom-floating-toolbar');
        if (tb && tb.dataset.tourOrigZ !== undefined) {
            tb.style.zIndex = tb.dataset.tourOrigZ;
            delete tb.dataset.tourOrigZ;
        }
        if (T.selectedByTour && typeof clearSelection === 'function') clearSelection();
        if (typeof updateToolbarState === 'function') updateToolbarState();
    } catch (e) {}
    T.toolbar = false;
    T.selectedByTour = false;
}

function _openSubPanel(id) {
    var el = $(id);
    if (!el) return;
    el.style.display = 'flex';
    var trig = el.parentElement && el.parentElement.querySelector('.toolbar-btn[data-expandable]');
    if (trig && trig.id) trig.classList.add('sub-panel-open');
    T.subOpen = id;
}

function _closeSubPanel() {
    if (!T.subOpen) return;
    if (typeof window.closeContentSubPanels === 'function') window.closeContentSubPanels();
    else { var el = $(T.subOpen); if (el) el.style.display = 'none'; }
    T.subOpen = null;
}

function _railActive() {
    var l = $('sb-rail-layout');
    return l ? l.getAttribute('data-active') : null;
}

// Returns the delay (ms) to wait for the UI to settle.
function _prepare(step) {
    var els = _stepEls(step);
    var delay = 40;
    var inToolbar = els.some(function(e) { return e.closest('#bottom-floating-toolbar'); });
    var inRoomBar = els.some(function(e) { return e.closest('#room-furniture-toolbar'); });

    if (T.subOpen && T.subOpen !== step.subPanel) _closeSubPanel();

    if (inRoomBar && !_inRoomPlan() && typeof window._enterRoomPlanMode === 'function') {
        window._enterRoomPlanMode();
        T.enteredRoom = true;
        delay = 700;
    } else if (!inRoomBar && T.enteredRoom && _inRoomPlan() && typeof window._exitRoomPlanMode === 'function') {
        window._exitRoomPlanMode();
        T.enteredRoom = false;
        delay = 450;
    }

    if (inToolbar && !T.toolbar) { _ensureToolbar(); delay = Math.max(delay, 260); }
    else if (!inToolbar && T.toolbar) _restoreToolbar();

    if (step.subPanel && T.subOpen !== step.subPanel) { _openSubPanel(step.subPanel); delay = Math.max(delay, 120); }

    if (els[0] && typeof window._sbRailRevealFor === 'function') {
        var before = _railActive();
        window._sbRailRevealFor(els[0]);
        if (_railActive() !== before) delay = Math.max(delay, 160);
    }
    return delay;
}

function _cleanupAll() {
    _closeSubPanel();
    if (T.toolbar) _restoreToolbar();
    if (T.enteredRoom && _inRoomPlan() && typeof window._exitRoomPlanMode === 'function') window._exitRoomPlanMode();
    T.enteredRoom = false;
    if (T.railOrig && typeof window._sbRailSelect === 'function') window._sbRailSelect(T.railOrig, { silent: true });
    T.railOrig = null;
}

// ── DOM ─────────────────────────────────────────────────────────────────────
function _ensureDOM() {
    if ($('tour-overlay')) return;

    var ov = document.createElement('div');
    ov.id = 'tour-overlay';
    ov.innerHTML =
        '<svg id="tour-spotlight-svg" style="position:absolute;inset:0;width:100%;height:100%;pointer-events:none;">' +
            '<defs><mask id="tour-spotlight-mask">' +
                '<rect width="100%" height="100%" fill="white"/>' +
                '<rect id="tour-spotlight-hole" rx="10" ry="10" fill="black" width="0" height="0"/>' +
                '<rect id="tour-spotlight-hole2" rx="10" ry="10" fill="black" width="0" height="0"/>' +
            '</mask></defs>' +
            '<rect width="100%" height="100%" fill="rgba(0,0,0,0.62)" mask="url(#tour-spotlight-mask)"/>' +
        '</svg>';
    ov.addEventListener('click', function(e) { if (e.target === ov || e.target.closest('svg')) _next(); });
    document.body.appendChild(ov);

    var ring = document.createElement('div');
    ring.id = 'tour-spotlight-ring';
    document.body.appendChild(ring);

    var ring2 = document.createElement('div');
    ring2.id = 'tour-spotlight-ring2';
    document.body.appendChild(ring2);

    var tt = document.createElement('div');
    tt.id = 'tour-tooltip';
    tt.innerHTML =
        '<div class="tour-tt-header">' +
            '<div class="tour-tt-title-wrap"><span id="tour-tt-count"></span><span id="tour-tt-title"></span></div>' +
            '<button class="tour-close-btn" onclick="window._stopTour()" title="סגור מדריך">✕</button>' +
        '</div>' +
        '<div id="tour-tt-text"></div>' +
        '<div id="tour-tt-actions"></div>';
    document.body.appendChild(tt);

    var nav = document.createElement('div');
    nav.id = 'tour-nav-bar';
    nav.innerHTML =
        '<button id="tour-btn-skip" onclick="window._stopTour()">דלג</button>' +
        '<button id="tour-btn-prev" onclick="window._tourPrev()">‹ הקודם</button>' +
        '<div class="tour-dots" id="tour-dots"></div>' +
        '<button id="tour-btn-next" onclick="window._tourNext()">הבא ›</button>';
    document.body.appendChild(nav);

    document.addEventListener('keydown', function(e) {
        if (!T.active) return;
        if (e.key === 'Escape') { e.preventDefault(); window._stopTour(); }
        else if (e.key === 'ArrowLeft' || e.key === 'Enter') { e.preventDefault(); _next(); }
        else if (e.key === 'ArrowRight') { e.preventDefault(); _prev(); }
    }, true);
}

function _setChromeVisible(on) {
    ['tour-overlay', 'tour-tooltip'].forEach(function(id) { var el = $(id); if (el) el.style.display = on ? 'block' : 'none'; });
    var nav = $('tour-nav-bar');
    if (nav) nav.style.display = on ? 'flex' : 'none';
    if (!on) {
        ['tour-spotlight-ring', 'tour-spotlight-ring2'].forEach(function(id) { var r = $(id); if (r) r.style.display = 'none'; });
    }
}

function _renderChrome() {
    var step = T.steps[T.idx];
    if (!step) return;
    var c = _ctx();
    var titleEl = $('tour-tt-title');
    var textEl = $('tour-tt-text');
    var countEl = $('tour-tt-count');
    if (titleEl) titleEl.textContent = _val(step.title, c);
    if (textEl) textEl.innerHTML = _val(step.text, c);
    if (countEl) countEl.textContent = (T.idx + 1) + ' מתוך ' + T.steps.length;

    var actionsEl = $('tour-tt-actions');
    if (actionsEl) {
        actionsEl.innerHTML = '';
        var act = step.action;
        if (act && (!act.when || act.when(c))) {
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'tour-tt-action';
            btn.textContent = act.label;
            btn.onclick = function() { _runAction(step); };
            actionsEl.appendChild(btn);
        }
        actionsEl.style.display = actionsEl.children.length ? '' : 'none';
    }

    var dotsEl = $('tour-dots');
    if (dotsEl) {
        dotsEl.innerHTML = '';
        T.steps.forEach(function(_, i) {
            var dot = document.createElement('span');
            dot.className = 'tour-dot' + (i === T.idx ? ' active' : '');
            dot.onclick = function() { _show(i, i >= T.idx ? 1 : -1); };
            dotsEl.appendChild(dot);
        });
    }
    var last = T.idx === T.steps.length - 1;
    var prevBtn = $('tour-btn-prev');
    var nextBtn = $('tour-btn-next');
    var skipBtn = $('tour-btn-skip');
    if (prevBtn) prevBtn.style.display = T.idx === 0 ? 'none' : '';
    if (nextBtn) nextBtn.textContent = last ? 'סיום ✓' : 'הבא ›';
    if (skipBtn) skipBtn.style.display = last ? 'none' : '';
}

// ── Geometry ────────────────────────────────────────────────────────────────
function _clippedRect(el) {
    var r = el.getBoundingClientRect();
    var L = r.left, Tp = r.top, R = r.right, B = r.bottom;
    for (var n = el.parentElement; n && n !== document.body && n !== document.documentElement; n = n.parentElement) {
        var cs = getComputedStyle(n);
        if (/(auto|scroll|hidden)/.test(cs.overflowY) || /(auto|scroll|hidden)/.test(cs.overflowX)) {
            var pr = n.getBoundingClientRect();
            L = Math.max(L, pr.left); Tp = Math.max(Tp, pr.top);
            R = Math.min(R, pr.right); B = Math.min(B, pr.bottom);
        }
    }
    L = Math.max(L, 0); Tp = Math.max(Tp, 0);
    R = Math.min(R, window.innerWidth); B = Math.min(B, window.innerHeight);
    if (R - L < 2 || B - Tp < 2) return null;
    return { left: L, top: Tp, right: R, bottom: B };
}

function _unionRect(els) {
    var u = null;
    els.forEach(function(el) {
        var r = _clippedRect(el);
        if (!r) return;
        if (!u) u = { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
        else {
            u.left = Math.min(u.left, r.left); u.top = Math.min(u.top, r.top);
            u.right = Math.max(u.right, r.right); u.bottom = Math.max(u.bottom, r.bottom);
        }
    });
    if (u) { u.width = u.right - u.left; u.height = u.bottom - u.top; }
    return u;
}

function _scrollContainer(el) {
    for (var n = el.parentElement; n && n !== document.body; n = n.parentElement) {
        var cs = getComputedStyle(n);
        if (/(auto|scroll)/.test(cs.overflowY) && n.scrollHeight > n.clientHeight + 2) return n;
    }
    return null;
}

function _scrollIntoViewIfNeeded(el) {
    var sc = _scrollContainer(el);
    if (!sc) return;
    var r = el.getBoundingClientRect();
    var sr = sc.getBoundingClientRect();
    if (r.top >= sr.top && r.bottom <= sr.bottom) return;
    var tall = r.height > sr.height * 0.8;
    var target = sc.scrollTop + (r.top - sr.top) - (tall ? 8 : (sr.height - r.height) / 2);
    sc.scrollTo({ top: Math.max(0, target), behavior: 'smooth' });
}

function _setHole(r, holeId, ringId) {
    var hole = $(holeId || 'tour-spotlight-hole');
    var ring = $(ringId || 'tour-spotlight-ring');
    var pad = holeId ? 4 : 8;
    if (!r) {
        if (hole) { hole.setAttribute('width', '0'); hole.setAttribute('height', '0'); }
        if (ring) ring.style.display = 'none';
        return;
    }
    var x = Math.max(2, r.left - pad), y = Math.max(2, r.top - pad);
    var w = Math.min(window.innerWidth - 2, r.right + pad) - x;
    var h = Math.min(window.innerHeight - 2, r.bottom + pad) - y;
    if (hole) {
        hole.setAttribute('x', x); hole.setAttribute('y', y);
        hole.setAttribute('width', w); hole.setAttribute('height', h);
    }
    if (ring) {
        ring.style.display = 'block';
        ring.style.left = x + 'px'; ring.style.top = y + 'px';
        ring.style.width = w + 'px'; ring.style.height = h + 'px';
    }
}

// The nav bar sits bottom-center; move it to the top when the highlighted element is down there.
function _placeNav(r) {
    var nav = $('tour-nav-bar');
    if (!nav) return false;
    var top = !!r && r.bottom > window.innerHeight - 110 &&
        r.left < window.innerWidth / 2 + 260 && r.right > window.innerWidth / 2 - 260;
    nav.style.top = top ? '24px' : '';
    nav.style.bottom = top ? 'auto' : '';
    return top;
}

function _placeTooltip(r, pref, navOnTop) {
    var tt = $('tour-tooltip');
    if (!tt) return;
    tt.style.transform = '';
    tt.style.right = ''; tt.style.bottom = '';
    var w = tt.offsetWidth || 320, h = tt.offsetHeight || 160;
    var vw = window.innerWidth, vh = window.innerHeight;
    var m = 16, navSpace = navOnTop ? 16 : 84;
    var orders = {
        left:   ['left', 'right', 'bottom', 'top'],
        right:  ['right', 'left', 'bottom', 'top'],
        bottom: ['bottom', 'top', 'left', 'right'],
        top:    ['top', 'bottom', 'left', 'right']
    };
    var order = orders[pref] || orders.bottom;
    var fits = {
        left:   r.left - w - m >= 8,
        right:  r.right + w + m <= vw - 8,
        bottom: r.bottom + h + m <= vh - navSpace,
        top:    r.top - h - m >= (navOnTop ? 84 : 8)
    };
    var pos = null;
    for (var i = 0; i < order.length; i++) { if (fits[order[i]]) { pos = order[i]; break; } }

    var left, top;
    if (pos === 'left' || pos === 'right') {
        left = pos === 'left' ? r.left - w - m : r.right + m;
        top = r.top + r.height / 2 - h / 2;
    } else if (pos === 'top' || pos === 'bottom') {
        left = r.left + r.width / 2 - w / 2;
        top = pos === 'bottom' ? r.bottom + m : r.top - h - m;
    } else {
        left = vw / 2 - w / 2;
        top = vh - navSpace - h - 8;
    }
    left = Math.max(8, Math.min(left, vw - w - 8));
    top = Math.max(navOnTop ? 84 : 8, Math.min(top, vh - navSpace - h));
    tt.style.position = 'fixed';
    tt.style.left = left + 'px';
    tt.style.top = top + 'px';
}

function _centerTooltip() {
    var tt = $('tour-tooltip');
    if (!tt) return;
    tt.style.position = 'fixed';
    tt.style.left = '50%';
    tt.style.top = '50%';
    tt.style.transform = 'translate(-50%, -50%)';
}

// Re-measure every frame so the spotlight follows scrolling, rail switches and animations.
function _layoutTick() {
    if (!T.active) return;
    var step = T.steps[T.idx];
    if (step && T.els.length) {
        var r = _unionRect(T.els);
        var r2 = T.railEl ? _unionRect([T.railEl]) : null;
        var tt = $('tour-tooltip');
        var rk = function(x) {
            return x ? [Math.round(x.left), Math.round(x.top), Math.round(x.width), Math.round(x.height)].join(',') : 'none';
        };
        var key = rk(r) + '|' + rk(r2) + '|' + window.innerWidth + 'x' + window.innerHeight + '|' + (tt ? tt.offsetHeight : 0);
        if (key !== T.layoutKey) {
            T.layoutKey = key;
            _setHole(r);
            _setHole(r2, 'tour-spotlight-hole2', 'tour-spotlight-ring2');
            var navOnTop = _placeNav(r);
            if (r) _placeTooltip(r, step.position, navOnTop);
            else _centerTooltip();
        }
    }
    T.raf = requestAnimationFrame(_layoutTick);
}

// ── Navigation ──────────────────────────────────────────────────────────────
function _show(idx, dir) {
    if (!T.active) return;
    if (idx < 0) idx = 0;
    if (idx >= T.steps.length) { _finish(); return; }
    T.idx = idx;
    var token = ++T.token;
    var step = T.steps[idx];
    var delay = _prepare(step);
    var tt = $('tour-tooltip');
    if (delay > 60) {
        T.els = [];
        T.railEl = null;
        _setHole(null);
        _setHole(null, 'tour-spotlight-hole2', 'tour-spotlight-ring2');
        if (tt) tt.style.visibility = 'hidden';
    } else {
        _renderChrome();
    }

    setTimeout(function() {
        if (token !== T.token || !T.active) return;
        var els = _stepEls(step).filter(_isVisibleNow);
        if (!els.length) {
            // Target didn't render in the current state — drop it and keep the flow going.
            T.steps.splice(idx, 1);
            if (!T.steps.length) { window._stopTour(); return; }
            if (dir < 0) _show(Math.max(0, idx - 1), dir);
            else if (idx >= T.steps.length) _finish();
            else _show(idx, dir);
            return;
        }
        T.els = els;
        var holder = els[0].closest('[data-sbgroup]');
        T.railEl = holder
            ? q('#sb-rail .sb-rail-btn[data-sbtab="' + holder.getAttribute('data-sbgroup') + '"]')
            : null;
        T.layoutKey = '';
        _scrollIntoViewIfNeeded(els[0]);
        _renderChrome();
        if (tt) tt.style.visibility = '';
    }, delay);
}

function _runAction(step) {
    if (!T.active || !step.action) return;
    try { step.action.run(); } catch (e) { console.warn('[tour] action failed:', e); }
    var token = ++T.token;
    var tt = $('tour-tooltip');
    if (tt) tt.style.visibility = 'hidden';
    setTimeout(function() { if (token === T.token && T.active) _next(); }, 700);
}

function _next() {
    if (!T.active) return;
    if (T.idx < T.steps.length - 1) _show(T.idx + 1, 1);
    else _finish();
}

function _prev() {
    if (!T.active || T.idx === 0) return;
    _show(T.idx - 1, -1);
}

function _finish() {
    var key = T.key;
    try { localStorage.setItem('tour_completed_' + key, '1'); } catch (e) {}
    window._stopTour();
    if (typeof window._showToast === 'function') {
        window._showToast('✅ סיימת את ההדרכה! אפשר לבחור נושא נוסף בכפתור "הדרכה"', 3500);
    }
}

// ── Public API ──────────────────────────────────────────────────────────────
window._startTour = function(key) {
    window._closeTourSheet();
    if (T.active) window._stopTour();
    var steps = _resolveTopic(key || 'quickstart');
    if (!steps.length) return;
    _ensureDOM();
    T.active = true;
    T.key = key || 'quickstart';
    T.steps = steps.slice();
    T.els = [];
    T.layoutKey = '';
    T.railOrig = _railActive();
    _setChromeVisible(true);
    _setHole(null);
    _placeNav(null);
    _centerTooltip();
    var tt = $('tour-tooltip');
    if (tt) tt.style.visibility = '';
    cancelAnimationFrame(T.raf);
    T.raf = requestAnimationFrame(_layoutTick);
    _show(0, 1);
};

window._stopTour = function() {
    if (!T.active) { _setChromeVisible(false); return; }
    T.active = false;
    T.token++;
    cancelAnimationFrame(T.raf);
    T.els = [];
    T.railEl = null;
    _setHole(null);
    _setHole(null, 'tour-spotlight-hole2', 'tour-spotlight-ring2');
    _setChromeVisible(false);
    _cleanupAll();
};

window._tourNext = function() { _next(); };
window._tourPrev = function() { _prev(); };

// ── Topic picker (bottom sheet) ─────────────────────────────────────────────
function _buildSheet() {
    var list = $('tour-sheet-list');
    if (!list) return;
    var c = _ctx();
    var descEl = $('tour-sheet-desc');
    if (descEl) {
        descEl.innerHTML = c.label
            ? 'מותאם למנוי שלך: <span class="tour-sheet-plan"></span>'
            : 'לחץ על נושא כדי להתחיל';
        var planEl = descEl.querySelector('.tour-sheet-plan');
        if (planEl) planEl.textContent = c.label;
    }
    list.innerHTML = '';
    var shown = 0;
    TOPICS.forEach(function(t) {
        var steps = _resolveTopic(t.key);
        if (!steps.length) return;
        shown++;
        var done = false;
        try { done = localStorage.getItem('tour_completed_' + t.key) === '1'; } catch (e) {}
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'tour-sheet-card' + (done ? ' is-done' : '');
        btn.innerHTML =
            '<span class="tour-sheet-icon"></span>' +
            '<div class="tour-sheet-info">' +
                '<div class="tour-sheet-title"></div>' +
                '<div class="tour-sheet-desc"></div>' +
                '<div class="tour-sheet-meta"><span class="tour-sheet-count"></span>' +
                    (done ? '<span class="tour-sheet-done">✓ הושלם</span>' : '') +
                '</div>' +
            '</div>' +
            '<i class="fa-solid fa-chevron-left tour-sheet-arrow"></i>';
        btn.querySelector('.tour-sheet-icon').textContent = t.icon;
        btn.querySelector('.tour-sheet-title').textContent = _val(t.title, c);
        btn.querySelector('.tour-sheet-desc').textContent = _val(t.desc, c);
        btn.querySelector('.tour-sheet-count').textContent = steps.length === 1 ? 'שלב אחד' : steps.length + ' שלבים';
        btn.onclick = function() { window._startTour(t.key); };
        list.appendChild(btn);
    });
    if (!shown) {
        list.innerHTML = '<div class="tour-sheet-empty">ההדרכות זמינות במסך העריכה במחשב.</div>';
    }
}

window._openTourSheet = function() {
    if (T.active) window._stopTour();
    _buildSheet();
    var overlay = $('tour-sheet-backdrop');
    if (overlay) overlay.classList.add('open');
};

window._closeTourSheet = function() {
    var overlay = $('tour-sheet-backdrop');
    if (overlay) overlay.classList.remove('open');
};

console.log('[tour.js] ready — ' + TOPICS.length + ' plan-aware topics');
})();
