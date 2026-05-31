// ==========================================
// מדריך אינטראקטיבי — Product Tour (Multi-Tour)
// ==========================================

console.log('[tour.js] loaded');

// ── עזרים משותפים לשלבים עם toolbar ─────────────────────────────────────────
function _tourEnsureToolbar() {
    try {
        if (typeof state !== 'undefined' && state.columns && state.columns.length > 0) {
            if (typeof toggleSelection === 'function') toggleSelection(0, 0);
            else if (typeof window.toggleSelection === 'function') window.toggleSelection(0, 0);
        }
        var tb = document.getElementById('bottom-floating-toolbar');
        if (tb) {
            // updateToolbarState positions toolbar using canvas-container pixel coords.
            // Call it while toolbar is still inside canvas-container so coords are correct.
            if (typeof updateToolbarState === 'function') updateToolbarState();

            // Read the canvas-relative left/top that updateToolbarState just set
            var tbLeft = parseFloat(tb.style.left)  || 0;
            var tbTop  = parseFloat(tb.style.top)   || 0;

            // Get canvas-container's viewport offset so we can convert to viewport coords
            var canvasEl = document.getElementById('canvas-container');
            var canvasRect = canvasEl ? canvasEl.getBoundingClientRect() : { left: 0, top: 0 };

            // Now move toolbar to body (position:fixed relative to viewport)
            if (!tb.dataset.tourMoved) {
                tb.dataset.tourOrigParent2 = tb.parentElement ? tb.parentElement.id : '';
                document.body.appendChild(tb);
                tb.dataset.tourMoved = '1';
            }

            // Apply viewport-corrected position + raise above overlay.
            // Do NOT override transform — CSS already has translate(20px, -50%) which is correct.
            // Toolbar sits above the overlay so all buttons are visible.
            // The highlight ring (z-index 100003) marks the specific button.
            tb.style.position = 'fixed';
            tb.style.left     = (canvasRect.left + tbLeft) + 'px';
            tb.style.top      = (canvasRect.top  + tbTop)  + 'px';
            tb.style.zIndex   = '100002';
        }
    } catch(e) { console.warn('[tour] _tourEnsureToolbar error:', e); }
}

function _tourRestoreToolbar() {
    try {
        var tb = document.getElementById('bottom-floating-toolbar');
        if (tb && tb.dataset.tourMoved) {
            var origParentId = tb.dataset.tourOrigParent2 || tb.dataset.tourOrigParent;
            if (origParentId) {
                var origParent = document.getElementById(origParentId);
                if (origParent) origParent.appendChild(tb);
            }
            tb.style.position  = '';
            tb.style.left      = '';
            tb.style.top       = '';
            tb.style.transform = '';
            tb.style.zIndex    = '';
            delete tb.dataset.tourMoved;
            delete tb.dataset.tourOrigParent2;
            delete tb.dataset.tourOrigParent;
            delete tb.dataset.tourOrigZ;
            delete tb.dataset.tourOrigPos;
        }
        if (typeof clearSelection === 'function') clearSelection();
        else if (typeof window.clearSelection === 'function') window.clearSelection();
        if (typeof updateToolbarState === 'function') updateToolbarState();
    } catch(e) {}
}

// ── הגדרת כל ההדרכות ─────────────────────────────────────────────────────────
window._TOURS = {

    // ── 1. התחלה מהירה ──────────────────────────────────────────────────────
    quickstart: [
        {
            target:   '#cabinet-presets-row',
            title:    '🪵 בחירת סוג ארון',
            text:     'בחר את סוג הארון שלך: ארון רגיל, פינה ימין/שמאל, חדר ארונות (U) או ארון הזזה. לחץ על אחד מהאייקונים כדי להתחיל.',
            position: 'bottom',
            scrollTo: true,
        },
        {
            target:   '#sidebar-edit-content',
            title:    '📐 עריכת מידות',
            text:     'כאן תוכל לשנות את רוחב, גובה ועומק הארון. גרור את הסליידרים או הקלד ערך ישירות. השינויים מתעדכנים בזמן אמת.',
            position: 'left',
            scrollTo: true,
        },
        {
            target:   '.color-part-tabs',
            title:    '🎨 חומרים וצבעים',
            text:     'בחר חומר לכל חלק בארון: גוף, פנים, גב, חזית חיצונית ועוד. לחץ על לשונית ואז על הצבע/חומר הרצוי.',
            position: 'left',
            scrollTo: true,
        },
        {
            target:   '#btn-multiview-blueprint',
            title:    '📋 תוכנית טכנית',
            text:     'לחץ כאן לצפייה בתוכנית מרובת תצוגות עם מידות מלאות — מתאים לשליחה לייצור.',
            position: 'bottom',
            scrollTo: false,
        },
        {
            target:   '#btn-add-to-cart',
            title:    '🛒 הוסף להזמנה',
            text:     'לאחר שסיימת לעצב ארון, לחץ "הוסף להזמנה" כדי להוסיף אותו לפרויקט. ניתן להוסיף מספר ארונות לאותו פרויקט.',
            position: 'left',
            scrollTo: true,
        },
        {
            target:   '#left-sidebar',
            title:    '🗂️ ארונות בפרויקט',
            text:     'בפאנל השמאלי מוצגים כל הארונות שהוספת לפרויקט. ניתן לעבור בין ארונות, לראות את הסיכום הכספי הכולל, ולשלוח הצעת מחיר ללקוח.',
            position: 'right',
            scrollTo: false,
        },
    ],

    // ── 2. תוכן תאים ────────────────────────────────────────────────────────
    cellContent: [
        {
            target:   '#bottom-floating-toolbar',
            title:    '🗂️ תוכן תאים',
            text:     'לחץ על תא בארון כדי לבחור אותו, ואז בחר כאן מה יהיה בו: תלייה, מגירות, כוורת, מחיצה ועוד. ניתן גם לבחור סוג דלת.',
            position: 'right',
            scrollTo: false,
            beforeShow: function() { _tourEnsureToolbar(); },
            afterBeforeShow: function() {
                var tb = document.getElementById('bottom-floating-toolbar');
                if (!tb) return;
                var stepIdx = window._tourLastStep;
                requestAnimationFrame(function() {
                    requestAnimationFrame(function() {
                        _tourSetSpotlight(tb);
                        _tourPositionTooltip(_tourCurrentSteps()[stepIdx]);
                    });
                });
            },
            afterHide: function() { _tourRestoreToolbar(); },
        },
        {
            target:   '#tb-btn-hanging',
            title:    '👔 תלייה',
            text:     'בחר "תלייה" כדי להגדיר תא לתלייה של בגדים. ניתן לבחור גם תלייה ארוכה, קצרה, או כפולה.',
            position: 'right',
            scrollTo: false,
            beforeShow: function() { _tourEnsureToolbar(); },
            afterHide: function() { _tourRestoreToolbar(); },
        },
        {
            target:   '#tb-btn-partition',
            title:    '🗂️ מחיצה',
            text:     'בחר "מחיצה" כדי לחלק תא לשני חלקים עצמאיים. ניתן לגרור את קו המחיצה לשינוי הגודל.',
            position: 'right',
            scrollTo: false,
            beforeShow: function() { _tourEnsureToolbar(); },
            afterHide: function() { _tourRestoreToolbar(); },
        },
        {
            target:   '#tb-btn-drawer',
            title:    '🗄️ מגירה',
            text:     'בחר "מגירה" כדי להוסיף מגירות לתא. ניתן לשנות את מספר המגירות ואת הגובה שלהן.',
            position: 'right',
            scrollTo: false,
            beforeShow: function() { _tourEnsureToolbar(); },
            afterHide: function() { _tourRestoreToolbar(); },
        },
        {
            target:   '#tb-btn-honeycomb',
            title:    '🍯 כוורת',
            text:     'בחר "כוורת" כדי ליצור תאים קטנים בתוך התא — מתאים לאחסון קפלים, תיקים קטנים ועוד.',
            position: 'right',
            scrollTo: false,
            beforeShow: function() { _tourEnsureToolbar(); },
            afterHide: function() { _tourRestoreToolbar(); },
        },
        {
            target:   '#toolbar-section-doors',
            title:    '🚪 כיוון דלת',
            text:     'בחלק "דלתות" בחר את כיוון פתיחת הדלת: ימין, שמאל, כפולה או קלפה (מתקפלת למעלה). כל כיוון מתאים לסוג שימוש שונה.',
            position: 'right',
            scrollTo: false,
            beforeShow: function() { _tourEnsureToolbar(); },
            afterHide: function() { _tourRestoreToolbar(); },
        },
        {
            target:   '#toolbar-section-doors',
            title:    '🎨 סוג דלת',
            text:     'לאחר בחירת כיוון הדלת, בחר את סוג הדלת: מלמין מלא, מסגרת, זכוכית שקופה, זכוכית שחורה, זהב, או מראה.',
            position: 'right',
            scrollTo: false,
            beforeShow: function() { _tourEnsureToolbar(); },
            afterHide: function() { _tourRestoreToolbar(); },
        },
        {
            target:   '#inp-has-doors',
            title:    '👁️ הצג/הסתר חזיתות',
            text:     'בתיבת הסימון "הצג חזיתות" בסרגל העליון ניתן להסתיר את הדלתות ולראות את תוכן הארון בצורה ברורה יותר.',
            position: 'bottom',
            scrollTo: false,
        },
    ],

    // ── 3. מיקום וסגירות ────────────────────────────────────────────────────
    placement: [
        {
            target:   '#room-wall-section',
            title:    '🏠 מיקום ארון בחדר',
            text:     'הצמד את הארון לקיר שמאל, ימין, בין שני קירות, או השאר אותו במרכז. הבחירה משפיעה על הצגת לוחות הסגירה.',
            position: 'left',
            scrollTo: true,
        },
        {
            target:   '#closure-controls',
            title:    '🧱 לוחות סגירה',
            text:     'כאשר הארון צמוד לקיר, ניתן להוסיף לוחות סגירה בצד שמאל, ימין ובתקרה. ניתן לשנות את עובי כל לוח בנפרד.',
            position: 'left',
            scrollTo: true,
        },
        {
            target:   '#niche-toggle-row',
            title:    '🕳️ ארון בנישה',
            text:     'אם הארון ממוקם בתוך נישה בקיר, הפעל אפשרות זו. הגדר את רוחב ועומק הנישה, ואת לוחות הסגירה בתוכה.',
            position: 'left',
            scrollTo: true,
        },
        {
            target:   '#room-settings-section',
            title:    '📐 הגדרות חדר',
            text:     'שנה את מידות החדר — רוחב, עומק וגובה תקרה. ההדמייה תתאים את עצמה בהתאם ותציג את הארון בפרופורציות נכונות.',
            position: 'left',
            scrollTo: true,
        },
        {
            target:   '#btn-toggle-room',
            title:    '🏠 הצג/הסתר חדר',
            text:     'לחץ על כפתור הבית בסרגל העליון כדי להציג או להסתיר את קירות החדר בהדמייה.',
            position: 'bottom',
            scrollTo: false,
        },
    ],

    // ── 4. יחידות נוספות ────────────────────────────────────────────────────
    extras: [
        {
            target:   '#upper-unit-section',
            title:    '⬆️ יחידה עליונה',
            text:     'הוסף יחידת ארון עליונה מעל הארון הראשי. ניתן לשנות את המרחק בין היחידות ולערוך את תוכן היחידה העליונה בנפרד.',
            position: 'left',
            scrollTo: true,
        },
        {
            target:   '#side-unit-section',
            title:    '🪑 יחידת צד',
            text:     'הוסף יחידת צד לארון: שולחן עבודה (עם/בלי מגירות) או ארון צד הפוך. ניתן לבחור מיקום ימין/שמאל ולשנות את הרוחב.',
            position: 'left',
            scrollTo: true,
        },
        {
            target:   '#corner-unit-section',
            title:    '📐 יחידה פינתית',
            text:     'הוסף יחידה פינתית בצד ימין או שמאל של הארון. בחר בין יחידת מגירות לשולחן פינתי, ושנה את המידות לפי הצורך.',
            position: 'left',
            scrollTo: true,
        },
        {
            target:   '#sliding-door-section',
            title:    '↔️ ארון הזזה',
            text:     'בארון הזזה ניתן לבחור את צבע פרזול האלומיניום, לעצב כל דלת בנפרד (חומר/זכוכית/מראה) ולשנות את מספר הדלתות.',
            position: 'left',
            scrollTo: true,
        },
        {
            target:   '#cabinet-presets-row',
            title:    '🔀 סוגי ארונות מיוחדים',
            text:     'ארון פינה (ימין/שמאל) וחדר ארונות (U) מאפשרים הגדרת כנפיים נוספות. לאחר בחירת הסוג, בחר את מיקום הכנף: חיצוני, פנימי, או פינה מלאה.',
            position: 'bottom',
            scrollTo: true,
        },
    ],

    // ── 5. חומרים וגימורים ──────────────────────────────────────────────────
    materials: [
        {
            target:   '.color-part-tabs',
            title:    '🎨 בחירת חלק לצביעה',
            text:     'בחר את החלק שברצונך לצבוע: גוף וצוקל, מדפים ופנים, גב ארון, חזיתות, שולחן, כוורת, ארון צד, או חלק עליון.',
            position: 'left',
            scrollTo: true,
        },
        {
            target:   '#materials-section',
            title:    '🎨 גוונים וטקסטורות',
            text:     'בחר מבין גוונים חלקים (לבן, שחור, גוונים ניטרליים) או טקסטורות עץ ודוגמאות. הצבע יוחל על החלק שנבחר בלשונית למעלה.',
            position: 'left',
            scrollTo: true,
        },
        {
            target:   '#btn-part-paint',
            title:    '🖌️ עריכת צבעים מתקדמת',
            text:     'לחץ כאן לפתיחת מצב עריכת צבעים מתקדמת — ניתן לצבוע כל לוח בנפרד ישירות על ההדמייה בלחיצה.',
            position: 'left',
            scrollTo: true,
        },
        {
            target:   '#handle-type-row',
            title:    '🔩 סוג ידית / פרזול',
            text:     'הזן את סוג הידית או הפרזול הרצוי. שדה זה מופיע בהצעת המחיר ובתוכנית הייצור.',
            position: 'left',
            scrollTo: true,
        },
    ],

    // ── 6. הזמנה ופרויקט ────────────────────────────────────────────────────
    ordering: [
        {
            target:   '#btn-save-json',
            title:    '💾 שמירת פרויקט',
            text:     'שמור את הפרויקט שלך לענן. ניתן לטעון אותו מאוחר יותר, לשתף עם לקוח בלינק חי, ולשלוח הצעת מחיר.',
            position: 'bottom',
            scrollTo: false,
        },
        {
            target:   '#btn-add-to-cart',
            title:    '🛒 הוסף להזמנה',
            text:     'לאחר שסיימת לעצב ארון, לחץ "הוסף להזמנה" כדי להוסיף אותו לפרויקט. ניתן להוסיף מספר ארונות לאותו פרויקט ולנהל אותם יחד.',
            position: 'left',
            scrollTo: true,
        },
        {
            target:   '#left-sidebar',
            title:    '🗂️ ארונות בפרויקט',
            text:     'בפאנל השמאלי מוצגים כל הארונות שהוספת לפרויקט. ניתן לעבור בין ארונות, לראות את הסיכום הכספי הכולל, ולנהל את כל הפרויקט ממקום אחד.',
            position: 'right',
            scrollTo: false,
        },
        {
            target:   '#btn-share-live',
            title:    '🔗 שתף ללקוח',
            text:     'שלח ללקוח קישור לצפייה חיה בהדמייה — הלקוח יוכל לראות את הארון בדפדפן שלו ללא צורך בהתחברות.',
            position: 'right',
            scrollTo: false,
        },
    ],
};

// ── מצב המדריך ───────────────────────────────────────────────────────────────
var _tourActive     = false;
var _tourStep       = 0;
var _tourKey        = 'quickstart';   // המפתח של ההדרכה הפעילה
var _tourHighlightedEl = null;

// מחזיר את מערך השלבים של ההדרכה הפעילה
function _tourCurrentSteps() {
    return (window._TOURS && window._TOURS[_tourKey]) || [];
}

// ── Bottom Sheet API ──────────────────────────────────────────────────────────
window._openTourSheet = function() {
    var backdrop = document.getElementById('tour-sheet-backdrop');
    var sheet    = document.getElementById('tour-sheet');
    if (backdrop) backdrop.style.display = 'block';
    if (sheet)    sheet.style.display    = 'block';
};

window._closeTourSheet = function() {
    var backdrop = document.getElementById('tour-sheet-backdrop');
    var sheet    = document.getElementById('tour-sheet');
    if (backdrop) backdrop.style.display = 'none';
    if (sheet)    sheet.style.display    = 'none';
};

// ── API ציבורי ────────────────────────────────────────────────────────────────
window._startTour = function(key) {
    window._closeTourSheet();
    _tourKey    = key || 'quickstart';
    _tourStep   = 0;
    _tourActive = true;
    _tourEnsureDOM();
    _tourShowStep(_tourStep);
};

window._stopTour = function() {
    var steps = _tourCurrentSteps();
    var curStep = steps[_tourStep];
    if (curStep && typeof curStep.afterHide === 'function') curStep.afterHide();
    _tourActive = false;
    window._tourLastStep = null;
    _tourHideDOM();
    _tourRemoveHighlight();
};

window._tourNext = function() { _tourGoNext(); };
window._tourPrev = function() { _tourGoPrev(); };

// ── בניית DOM ─────────────────────────────────────────────────────────────────
function _tourEnsureDOM() {
    if (document.getElementById('tour-overlay')) {
        document.getElementById('tour-overlay').style.display = 'block';
        document.getElementById('tour-tooltip').style.display = 'block';
        return;
    }

    // Overlay with SVG spotlight mask
    var ov = document.createElement('div');
    ov.id = 'tour-overlay';
    ov.innerHTML =
        '<svg id="tour-spotlight-svg" style="position:absolute;inset:0;width:100%;height:100%;pointer-events:none;">' +
            '<defs>' +
                '<mask id="tour-spotlight-mask">' +
                    '<rect width="100%" height="100%" fill="white"/>' +
                    '<rect id="tour-spotlight-hole" rx="10" ry="10" fill="black"/>' +
                '</mask>' +
            '</defs>' +
            '<rect width="100%" height="100%" fill="rgba(0,0,0,0.62)" mask="url(#tour-spotlight-mask)"/>' +
        '</svg>';
    ov.addEventListener('click', function(e) {
        if (e.target === ov) _tourGoNext();
    });
    document.body.appendChild(ov);

    // Highlight ring — for toolbar buttons (above overlay, draws a glowing border)
    var ring = document.createElement('div');
    ring.id = 'tour-highlight-ring';
    ring.style.cssText = 'display:none;position:fixed;pointer-events:none;z-index:100003;' +
        'border:3px solid #2563eb;border-radius:10px;' +
        'box-shadow:0 0 0 4px rgba(37,99,235,0.35),0 0 16px 4px rgba(37,99,235,0.25);' +
        'transition:all 0.15s ease;';
    document.body.appendChild(ring);

    // Tooltip
    var tt = document.createElement('div');
    tt.id = 'tour-tooltip';
    tt.innerHTML =
        '<div class="tour-tt-header">' +
            '<span id="tour-tt-title"></span>' +
            '<button class="tour-close-btn" onclick="window._stopTour()" title="סגור מדריך">✕</button>' +
        '</div>' +
        '<div id="tour-tt-text"></div>' +
        '<div class="tour-tt-footer">' +
            '<div class="tour-dots" id="tour-dots"></div>' +
            '<div class="tour-nav-btns">' +
                '<button id="tour-btn-skip" onclick="window._stopTour()">דלג</button>' +
                '<button id="tour-btn-prev" onclick="window._tourPrev()">‹ הקודם</button>' +
                '<button id="tour-btn-next" onclick="window._tourNext()">הבא ›</button>' +
            '</div>' +
        '</div>';
    document.body.appendChild(tt);

    // Resize listener
    window.addEventListener('resize', function() {
        if (_tourActive) {
            var steps = _tourCurrentSteps();
            _tourPositionTooltip(steps[_tourStep]);
        }
    });
}

function _tourHideDOM() {
    var ov   = document.getElementById('tour-overlay');
    var tt   = document.getElementById('tour-tooltip');
    var ring = document.getElementById('tour-highlight-ring');
    if (ov)   ov.style.display   = 'none';
    if (tt)   tt.style.display   = 'none';
    if (ring) ring.style.display = 'none';
}

// ── ניווט ─────────────────────────────────────────────────────────────────────
function _tourGoNext() {
    var steps = _tourCurrentSteps();
    if (_tourStep < steps.length - 1) {
        _tourStep++;
        _tourShowStep(_tourStep);
    } else {
        _tourFinish();
    }
}

function _tourGoPrev() {
    if (_tourStep > 0) {
        _tourStep--;
        _tourShowStep(_tourStep);
    }
}

function _tourFinish() {
    try { localStorage.setItem('tour_completed_' + _tourKey, '1'); } catch(e) {}
    window._stopTour();
    if (typeof window._showToast === 'function') {
        window._showToast('✅ סיימת את ההדרכה! בהצלחה 🎉', 3500);
    }
}

// ── הצגת שלב ─────────────────────────────────────────────────────────────────
function _tourShowStep(idx) {
    var steps = _tourCurrentSteps();

    // Call afterHide on the step we're leaving
    var prevStep = steps[window._tourLastStep];
    if (prevStep && typeof prevStep.afterHide === 'function' && window._tourLastStep !== idx) {
        prevStep.afterHide();
    }

    window._tourLastStep = idx;

    var step = steps[idx];
    if (!step) return;

    if (typeof step.beforeShow === 'function') step.beforeShow();

    function _doRender() {
        var el = document.querySelector(step.target);

        var titleEl = document.getElementById('tour-tt-title');
        var textEl  = document.getElementById('tour-tt-text');
        if (titleEl) titleEl.textContent = step.title;
        if (textEl)  textEl.textContent  = step.text;

        // Update dots
        var dotsEl = document.getElementById('tour-dots');
        if (dotsEl) {
            dotsEl.innerHTML = '';
            for (var i = 0; i < steps.length; i++) {
                (function(dotIdx) {
                    var dot = document.createElement('span');
                    dot.className = 'tour-dot' + (dotIdx === idx ? ' active' : '');
                    dot.onclick = function() { _tourStep = dotIdx; _tourShowStep(dotIdx); };
                    dotsEl.appendChild(dot);
                })(i);
            }
        }

        // Update nav buttons
        var prevBtn = document.getElementById('tour-btn-prev');
        var nextBtn = document.getElementById('tour-btn-next');
        var skipBtn = document.getElementById('tour-btn-skip');
        if (prevBtn) prevBtn.style.display = idx === 0 ? 'none' : '';
        if (nextBtn) nextBtn.textContent = idx === steps.length - 1 ? 'סיום ✓' : 'הבא ›';
        if (skipBtn) skipBtn.style.display = idx === steps.length - 1 ? 'none' : '';

        // Show overlay + tooltip
        var ov = document.getElementById('tour-overlay');
        var tt = document.getElementById('tour-tooltip');
        if (ov) ov.style.display = 'block';
        if (tt) tt.style.display = 'block';

        if (!el) {
            _tourSetSpotlight(null);
            _tourCenterTooltip();
            return;
        }

        if (step.scrollTo) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            setTimeout(function() {
                _tourHighlightElement(el);
                if (typeof step.afterBeforeShow === 'function') {
                    step.afterBeforeShow();
                } else {
                    _tourPositionTooltip(step);
                }
            }, 420);
        } else {
            _tourHighlightElement(el);
            if (typeof step.afterBeforeShow === 'function') {
                step.afterBeforeShow();
            } else {
                _tourPositionTooltip(step);
            }
        }
    }

    if (typeof step.beforeShow === 'function' && step.scrollTo) {
        // already called above; _doRender handles the rest
        _doRender();
    } else {
        _doRender();
    }
}

// ── הדגשת אלמנט ──────────────────────────────────────────────────────────────
function _tourHighlightElement(el) {
    _tourRemoveHighlight();
    if (!el) return;
    _tourHighlightedEl = el;

    var rect = el.getBoundingClientRect();

    // Decide whether to use SVG spotlight (sidebar/regular elements)
    // or highlight ring (toolbar buttons that can't escape stacking context)
    var isToolbarChild = false;
    var tb = document.getElementById('bottom-floating-toolbar');
    if (tb && tb.contains(el)) isToolbarChild = true;

    if (isToolbarChild || el.id === 'bottom-floating-toolbar') {
        // Use highlight ring above overlay
        _tourSetSpotlight(null);
        var ring = document.getElementById('tour-highlight-ring');
        if (ring) {
            var pad = 6;
            ring.style.display = 'block';
            ring.style.left    = (rect.left   - pad) + 'px';
            ring.style.top     = (rect.top    - pad) + 'px';
            ring.style.width   = (rect.width  + pad * 2) + 'px';
            ring.style.height  = (rect.height + pad * 2) + 'px';
        }
    } else {
        // Use SVG spotlight cutout
        var ring2 = document.getElementById('tour-highlight-ring');
        if (ring2) ring2.style.display = 'none';
        _tourSetSpotlight(el);
    }
}

function _tourRemoveHighlight() {
    _tourHighlightedEl = null;
    _tourSetSpotlight(null);
    var ring = document.getElementById('tour-highlight-ring');
    if (ring) ring.style.display = 'none';
}

// ── ספוטלייט SVG ─────────────────────────────────────────────────────────────
function _tourSetSpotlight(el) {
    var hole = document.getElementById('tour-spotlight-hole');
    if (!hole) return;
    if (!el) {
        hole.setAttribute('width',  '0');
        hole.setAttribute('height', '0');
        hole.setAttribute('x', '0');
        hole.setAttribute('y', '0');
        return;
    }
    var rect = el.getBoundingClientRect();
    var pad  = 10;
    hole.setAttribute('x',      rect.left   - pad);
    hole.setAttribute('y',      rect.top    - pad);
    hole.setAttribute('width',  rect.width  + pad * 2);
    hole.setAttribute('height', rect.height + pad * 2);
    hole.setAttribute('rx', '10');
    hole.setAttribute('ry', '10');
}

// ── מיקום tooltip ─────────────────────────────────────────────────────────────
function _tourPositionTooltip(step) {
    var tt = document.getElementById('tour-tooltip');
    if (!tt) return;

    var el = step && step.target ? document.querySelector(step.target) : null;
    if (!el) { _tourCenterTooltip(); return; }

    var rect     = el.getBoundingClientRect();
    var ttW      = tt.offsetWidth  || 320;
    var ttH      = tt.offsetHeight || 200;
    var vw       = window.innerWidth;
    var vh       = window.innerHeight;
    var margin   = 14;
    var pos      = (step && step.position) || 'bottom';

    var left, top;

    if (pos === 'bottom') {
        left = rect.left + rect.width / 2 - ttW / 2;
        top  = rect.bottom + margin;
    } else if (pos === 'top') {
        left = rect.left + rect.width / 2 - ttW / 2;
        top  = rect.top - ttH - margin;
    } else if (pos === 'left') {
        left = rect.left - ttW - margin;
        top  = rect.top + rect.height / 2 - ttH / 2;
    } else if (pos === 'right') {
        left = rect.right + margin;
        top  = rect.top + rect.height / 2 - ttH / 2;
    } else {
        left = rect.left + rect.width / 2 - ttW / 2;
        top  = rect.bottom + margin;
    }

    // Clamp to viewport
    left = Math.max(margin, Math.min(left, vw - ttW - margin));
    top  = Math.max(margin, Math.min(top,  vh - ttH - margin));

    tt.style.position = 'fixed';
    tt.style.left     = left + 'px';
    tt.style.top      = top  + 'px';
    tt.style.right    = '';
    tt.style.bottom   = '';
    tt.style.transform = '';
}

function _tourCenterTooltip() {
    var tt = document.getElementById('tour-tooltip');
    if (!tt) return;
    tt.style.position  = 'fixed';
    tt.style.left      = '50%';
    tt.style.top       = '50%';
    tt.style.right     = '';
    tt.style.bottom    = '';
    tt.style.transform = 'translate(-50%, -50%)';
}

console.log('[tour.js] multi-tour ready — 6 tours loaded');
