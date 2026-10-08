/* pricing-panel.js — shared pricing-configuration UI component.
 * Mounts a full pricing form into any container element.
 * Requires pricing-core.js to be loaded first.
 *
 * Usage:
 *   PricingPanel.mount('my-container', { showSaveBar: true, onSave: fn, onReset: fn });
 *   PricingPanel.fill(cfg);
 *   var cfg = PricingPanel.read();
 */
(function (global) {
'use strict';

var PC = global.PricingCore; // pricing-core.js
var D  = PC ? PC.DEFAULTS   : {};

// ── helpers ──────────────────────────────────────────────────────────────────
var P = 'pnl'; // element-id prefix — always the same; one panel per page.

function _id(k)  { return P + '-' + k; }
function _el(k)  { return document.getElementById(_id(k)); }
function _v(k)   { var e = _el(k); return e ? e.value : ''; }
function _set(k, v) { var e = _el(k); if (e) e.value = (v == null ? '' : v); }
function _num(v, fb) {
    if (v === '' || v == null) return fb;
    var n = Number(v); return isFinite(n) ? n : fb;
}
function _pct(frac) { return Math.round((frac || 0) * 100); }
function _frac(pctStr) {
    var n = _num(pctStr, null);
    return n == null ? null : n / 100;
}
function _esc(s) {
    return String(s == null ? '' : s)
        .replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');
}

// ── state ────────────────────────────────────────────────────────────────────
var _cabinetTypes = [];
var _currentMode  = 'ranges';
var _opts         = {};

// ── mount ────────────────────────────────────────────────────────────────────
function mount(containerId, opts) {
    _opts = opts || {};
    var container = document.getElementById(containerId);
    if (!container) { console.warn('PricingPanel: container not found:', containerId); return; }
    container.innerHTML = _buildHtml();
    _attachListeners(container);
}

// ── HTML builder ─────────────────────────────────────────────────────────────
function _buildHtml() {
    var s = _opts.showSaveBar;
    return [
        _previewHtml(),
        _modeBtnsHtml(),
        _cabinetTypesSectionHtml(),
        _rangesSectionHtml(),
        _sqmSectionHtml(),
        _lmSectionHtml(),
        _lmHeightSectionHtml(),
        _materialsSectionHtml(),
        _commonSurchargesHtml(),
        _installHtml(),
        _extrasHtml(),
        _doorsHtml(),
        _upperCornerHtml(),
        _slidingHtml(),
        s !== false ? _saveBarHtml() : ''
    ].join('');
}

/* ① LIVE PREVIEW */
function _previewHtml() {
    return '<div id="' + _id('preview-card') + '" style="' +
        'background:linear-gradient(135deg,#1e3a5f 0%,#2563eb 100%);' +
        'color:#fff;border-radius:14px;padding:18px 22px;margin-bottom:20px;' +
        'display:flex;align-items:center;gap:18px;flex-wrap:wrap;">' +

        '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;flex:1;">' +
            '<select id="' + _id('prev-type') + '" onchange="PricingPanel.updatePreview()" ' +
                'style="height:36px;border:none;border-radius:8px;padding:0 10px;' +
                'font-size:.83rem;font-family:inherit;color:#1e3a5f;"></select>' +
            '<input id="' + _id('prev-w') + '" type="number" value="160" min="40" max="400" step="10" ' +
                'onchange="PricingPanel.updatePreview()" oninput="PricingPanel.updatePreview()" ' +
                'style="width:80px;height:36px;border:none;border-radius:8px;padding:0 10px;' +
                'font-size:.83rem;font-family:inherit;color:#1e3a5f;" title="רוחב ס&quot;מ">' +
            '<span style="opacity:.7;font-size:.8rem;">×</span>' +
            '<input id="' + _id('prev-h') + '" type="number" value="240" min="100" max="400" step="10" ' +
                'onchange="PricingPanel.updatePreview()" oninput="PricingPanel.updatePreview()" ' +
                'style="width:80px;height:36px;border:none;border-radius:8px;padding:0 10px;' +
                'font-size:.83rem;font-family:inherit;color:#1e3a5f;" title="גובה ס&quot;מ">' +
            '<button id="' + _id('prev-mel') + '" onclick="PricingPanel._toggleMaterial()" ' +
                'style="height:36px;padding:0 14px;border:none;border-radius:8px;cursor:pointer;' +
                'font-size:.82rem;font-family:inherit;font-weight:700;background:rgba(255,255,255,.2);' +
                'color:#fff;" title="לחץ להחלפה">מלמין</button>' +
        '</div>' +

        '<div id="' + _id('prev-result') + '" style="text-align:left;min-width:200px;">' +
            '<div style="font-size:.75rem;opacity:.75;margin-bottom:2px;">תצוגה מקדימה (לפני שמירה)</div>' +
            '<div style="font-size:1.15rem;font-weight:800;">— ₪</div>' +
        '</div>' +
    '</div>';
}

/* ② MODE BUTTONS */
function _modeBtnsHtml() {
    var modes = [
        { id: 'ranges',    label: 'טווחי מידות',   sub: 'לפי רוחב' },
        { id: 'sqm',       label: 'מ"ר',             sub: 'מחיר למ"ר' },
        { id: 'lm',        label: 'מ"א',             sub: 'מחיר למ"א' },
        { id: 'lm_height', label: 'מ"א + גובה',     sub: 'עם ступенчатой תוספת' },
        { id: 'materials', label: 'חומרים',          sub: 'לוחות × מכפיל' }
    ];
    return '<div style="background:#fff;border:1px solid var(--border);border-radius:var(--radius,12px);' +
            'padding:20px 24px;margin-bottom:12px;">' +
        '<div style="font-size:.9rem;font-weight:800;color:var(--primary,#1e3a5f);margin-bottom:14px;">' +
            '<i class="fa-solid fa-sliders"></i> שיטת תמחור</div>' +
        '<div id="' + _id('mode-btns') + '" style="display:flex;gap:8px;flex-wrap:wrap;">' +
            modes.map(function(m) {
                return '<button class="pnl-mode-btn' + (m.id === 'ranges' ? ' active' : '') + '" ' +
                    'data-mode="' + m.id + '" onclick="PricingPanel.setMode(\'' + m.id + '\')" ' +
                    'style="padding:9px 18px;border-radius:9px;border:1.5px solid var(--border);' +
                    'background:#f8fafc;color:var(--text);font-size:.82rem;font-weight:700;' +
                    'font-family:inherit;cursor:pointer;transition:all .15s;display:flex;' +
                    'flex-direction:column;align-items:center;gap:3px;">' +
                    m.label + '<small style="font-size:.68rem;font-weight:500;opacity:.8;">' + m.sub + '</small>' +
                    '</button>';
            }).join('') +
        '</div>' +
    '</div>';
}

/* ③ CABINET TYPES (with priceFactor for non-ranges modes) */
function _cabinetTypesSectionHtml() {
    return '<div id="' + _id('types-section') + '" ' +
        'style="background:#fff;border:1px solid var(--border);border-radius:var(--radius,12px);' +
        'padding:20px 24px;margin-bottom:12px;">' +
        '<div style="font-size:.9rem;font-weight:800;color:var(--primary,#1e3a5f);margin-bottom:8px;">' +
            '<i class="fa-solid fa-layer-group"></i> סוגי ארונות</div>' +
        '<p style="font-size:.8rem;color:var(--muted);margin-bottom:14px;">שם התצוגה במחשבון ובמעצב, וסוג הבנייה. ' +
            'מכפיל סוג (%) — תוספת/הנחה לסוג זה בשיטות מ"ר / מ"א / חומרים (0 = ללא שינוי). ' +
            'לארון הזזה אין טבלת רוחב.</p>' +
        '<div id="' + _id('types-list') + '"></div>' +
        '<button type="button" onclick="PricingPanel.addCabinetType()" ' +
            'style="display:inline-flex;align-items:center;gap:6px;padding:8px 16px;' +
            'background:rgba(37,99,235,.08);border:1.5px solid rgba(37,99,235,.25);' +
            'color:#2563eb;border-radius:10px;font-size:.82rem;font-weight:600;cursor:pointer;' +
            'font-family:inherit;">' +
            '<i class="fa-solid fa-plus"></i> הוסף סוג ארון</button>' +
    '</div>';
}

/* RANGES TABLE */
function _rangesSectionHtml() {
    return '<div id="' + _id('section-ranges') + '" class="pnl-mode-section" ' +
        'style="background:#fff;border:1px solid var(--border);border-radius:var(--radius,12px);' +
        'padding:20px 24px;margin-bottom:12px;display:none;">' +
        '<div style="font-size:.9rem;font-weight:800;color:var(--primary,#1e3a5f);margin-bottom:8px;">' +
            '<i class="fa-solid fa-table"></i> טבלת מחירים לפי רוחב</div>' +
        '<p style="font-size:.8rem;color:var(--muted);margin-bottom:14px;">' +
            'מחיר עלות לארון שלם לפי סוג ורוחב (ס"מ). רוחב שאינו בטבלה — שורה קרובה מעליו; מעל המקסימום — יחסי.</p>' +
        '<div style="overflow-x:auto;"><table id="' + _id('ranges-table') + '" ' +
            'style="width:100%;border-collapse:collapse;font-size:.83rem;">' +
            '<thead><tr style="background:#f1f5f9;">' +
                '<th style="padding:8px 10px;text-align:right;font-weight:700;border:1px solid var(--border);">סוג ארון</th>' +
                '<th style="padding:8px 10px;text-align:center;font-weight:700;border:1px solid var(--border);">רוחב (ס"מ)</th>' +
                '<th style="padding:8px 10px;text-align:center;font-weight:700;border:1px solid var(--border);">מלמין ₪</th>' +
                '<th style="padding:8px 10px;text-align:center;font-weight:700;border:1px solid var(--border);">לא מלמין ₪</th>' +
                '<th style="padding:8px 10px;border:1px solid var(--border);"></th>' +
            '</tr></thead>' +
            '<tbody id="' + _id('ranges-tbody') + '"></tbody>' +
        '</table></div>' +
        '<button type="button" onclick="PricingPanel.addRangeRow()" ' +
            'style="display:inline-flex;align-items:center;gap:6px;padding:8px 16px;' +
            'background:rgba(37,99,235,.08);border:1.5px solid rgba(37,99,235,.25);' +
            'color:#2563eb;border-radius:10px;font-size:.82rem;font-weight:600;cursor:pointer;' +
            'font-family:inherit;margin-top:10px;"><i class="fa-solid fa-plus"></i> הוסף שורה</button>' +
    '</div>';
}

function _modeSection(id, icon, title, fields) {
    return '<div id="' + _id('section-' + id) + '" class="pnl-mode-section" ' +
        'style="background:#fff;border:1px solid var(--border);border-radius:var(--radius,12px);' +
        'padding:20px 24px;margin-bottom:12px;display:none;">' +
        '<div style="font-size:.9rem;font-weight:800;color:var(--primary,#1e3a5f);margin-bottom:14px;">' +
            '<i class="fa-solid ' + icon + '"></i> ' + title + '</div>' +
        '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:14px;">' +
            fields +
        '</div>' +
    '</div>';
}

function _field(id, label, attrs) {
    return '<div style="display:flex;flex-direction:column;gap:5px;">' +
        '<label for="' + _id(id) + '" style="font-size:.75rem;font-weight:700;color:var(--muted);' +
            'text-transform:uppercase;letter-spacing:.03em;">' + label + '</label>' +
        '<input id="' + _id(id) + '" type="number" ' + (attrs || 'min="0"') + ' ' +
            'style="height:40px;border:1.5px solid var(--border);border-radius:9px;padding:0 12px;' +
            'font-size:.9rem;font-family:inherit;outline:none;width:100%;' +
            'transition:border-color .18s;box-sizing:border-box;" ' +
            'oninput="PricingPanel.updatePreview()" ' +
            'onfocus="this.style.borderColor=\'#2563eb\'" ' +
            'onblur="this.style.borderColor=\'\'"></div>';
}

function _sqmSectionHtml() {
    return _modeSection('sqm', 'fa-ruler-combined', 'מחיר למ"ר',
        _field('sqmPrice', 'מ"ר — מלמין (₪)', 'min="0" step="10"') +
        _field('sqmPriceNonMel', 'מ"ר — לא מלמין (₪)', 'min="0" step="10"'));
}

function _lmSectionHtml() {
    return _modeSection('lm', 'fa-ruler-horizontal', 'מחיר למ"א',
        _field('lmPrice', 'מ"א — מלמין (₪)', 'min="0" step="10"') +
        _field('lmPriceNonMel', 'מ"א — לא מלמין (₪)', 'min="0" step="10"'));
}

function _lmHeightSectionHtml() {
    return _modeSection('lm_height', 'fa-ruler-vertical', 'מ"א + תוספת גובה',
        _field('lmHeightBase', 'בסיס מ"א — מלמין (₪)', 'min="0" step="10"') +
        _field('lmHeightBaseNonMel', 'בסיס מ"א — לא מלמין (₪)', 'min="0" step="10"') +
        _field('lmHeightThresholdCm', 'סף גובה (ס"מ)', 'min="0" step="10"') +
        _field('lmHeightStepCm', 'צעד גובה (ס"מ)', 'min="1" step="5"') +
        _field('lmHeightStepPct', 'תוספת לצעד (%)', 'min="0" max="100" step="1"'));
}

function _materialsSectionHtml() {
    return _modeSection('materials', 'fa-layer-group', 'תמחור לפי חומרים',
        _field('materialsBoardPrice', 'מחיר לוח (₪)', 'min="0" step="5"') +
        _field('materialsBoardsPerSqm', 'לוחות למ"ר', 'min="0.1" step="0.1"') +
        _field('materialsMultiplier', 'מכפיל חומרים (כולל בזבוז)', 'min="1" step="0.1"'));
}

/* ④ COMMON SURCHARGES — hide heightSurcharge for irrelevant modes */
function _commonSurchargesHtml() {
    return '<div id="' + _id('section-surcharges') + '" ' +
        'style="background:#fff;border:1px solid var(--border);border-radius:var(--radius,12px);' +
        'padding:20px 24px;margin-bottom:12px;">' +
        '<div style="font-size:.9rem;font-weight:800;color:var(--primary,#1e3a5f);margin-bottom:14px;">' +
            '<i class="fa-solid fa-percent"></i> תוספות ורווח</div>' +
        '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:14px;">' +
            _field('profitMultiplier', 'מכפיל רווח ללקוח', 'min="1" step="0.05"') +
            '<div id="' + _id('row-heightSurcharge') + '">' +
                _field('heightSurcharge', 'תוספת גובה מעל 240 (%)', 'min="0" max="100" step="1"') +
            '</div>' +
            _field('depthSurcharge', 'תוספת עומק מעל 54 (%)', 'min="0" max="100" step="1"') +
            _field('sandwichSurcharge', 'תוספת צבע סנדוויץ\' (%)', 'min="0" max="100" step="1"') +
        '</div>' +
        '<div id="' + _id('materials-note') + '" style="display:none;margin-top:12px;padding:10px 14px;' +
            'background:#fef3c7;border-radius:8px;font-size:.8rem;color:#92400e;">' +
            '<i class="fa-solid fa-triangle-exclamation"></i> ' +
            'בשיטת חומרים: מכפיל החומרים כולל בזבוז, שגיאות וכד\'. מכפיל הרווח מוחל אחריו.' +
        '</div>' +
    '</div>';
}

function _installHtml() {
    return '<div style="background:#fff;border:1px solid var(--border);border-radius:var(--radius,12px);' +
        'padding:20px 24px;margin-bottom:12px;">' +
        '<div style="font-size:.9rem;font-weight:800;color:var(--primary,#1e3a5f);margin-bottom:14px;">' +
            '<i class="fa-solid fa-screwdriver-wrench"></i> מחיר התקנה</div>' +
        '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:14px;">' +
            _field('installPricePerUnit', 'מחיר ליחידת התקנה (₪)', 'min="0" step="5"') +
            _field('installUnitCm', 'רוחב יחידת התקנה (ס"מ)', 'min="1" step="0.5"') +
            _field('installHeightSurcharge', 'תוספת גובה להתקנה (%)', 'min="0" max="100" step="1"') +
        '</div>' +
    '</div>';
}

function _extrasHtml() {
    return '<div style="background:#fff;border:1px solid var(--border);border-radius:var(--radius,12px);' +
        'padding:20px 24px;margin-bottom:12px;">' +
        '<div style="font-size:.9rem;font-weight:800;color:var(--primary,#1e3a5f);margin-bottom:14px;">' +
            '<i class="fa-solid fa-plus-circle"></i> מגירות, תאים, מדפים</div>' +
        '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:14px;">' +
            _field('internalDrawer', 'מגירה פנימית (₪)', 'min="0" step="10"') +
            _field('externalDrawer', 'מגירה חיצונית (₪)', 'min="0" step="10"') +
            _field('openCell', 'תא פתוח (₪)', 'min="0" step="10"') +
            _field('partition', 'מחיצה (₪)', 'min="0" step="10"') +
            _field('shelfFreePerMeter', 'מדפים חינם למטר', 'min="0" step="0.5"') +
            _field('extraShelfMel', 'מדף נוסף — מלמין (₪)', 'min="0" step="5"') +
            _field('extraShelfNonMel', 'מדף נוסף — לא מלמין (₪)', 'min="0" step="5"') +
            _field('deskUnit', 'שולחן צד (₪)', 'min="0" step="50"') +
        '</div>' +
    '</div>';
}

function _doorsHtml() {
    return '<div style="background:#fff;border:1px solid var(--border);border-radius:var(--radius,12px);' +
        'padding:20px 24px;margin-bottom:12px;">' +
        '<div style="font-size:.9rem;font-weight:800;color:var(--primary,#1e3a5f);margin-bottom:14px;">' +
            '<i class="fa-solid fa-door-open"></i> דלתות</div>' +
        '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:14px;">' +
            _field('doorFramedMel', 'דלת ממסגרת מלמין (₪)', 'min="0" step="10"') +
            _field('doorGlassMel', 'דלת זכוכית מלמין (₪)', 'min="0" step="10"') +
            _field('doorGlassBlack', 'דלת זכוכית שחורה/זהב (₪)', 'min="0" step="10"') +
            _field('doorMirror', 'דלת מראה (₪)', 'min="0" step="10"') +
            _field('ledPair', 'זוג לדים (₪)', 'min="0" step="10"') +
            _field('sorbet', 'סורבטו (₪)', 'min="0" step="10"') +
            _field('touchHandle', 'ידית טאצ\' לדלת/מגירה (₪)', 'min="0" step="5"') +
        '</div>' +
    '</div>';
}

function _upperCornerHtml() {
    return '<div style="background:#fff;border:1px solid var(--border);border-radius:var(--radius,12px);' +
        'padding:20px 24px;margin-bottom:12px;">' +
        '<div style="font-size:.9rem;font-weight:800;color:var(--primary,#1e3a5f);margin-bottom:14px;">' +
            '<i class="fa-solid fa-layer-group"></i> יחידה עליונה</div>' +
        '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:14px;">' +
            _field('upperUnit160', 'יחידה עליונה עד 160 (₪)', 'min="0" step="50"') +
            _field('upperUnit240', 'יחידה עליונה עד 240 (₪)', 'min="0" step="50"') +
            _field('upperUnitPerCm', 'יחידה עליונה מעל 240 (₪/ס"מ)', 'min="0" step="0.25"') +
        '</div>' +
        '<div style="font-size:.9rem;font-weight:800;color:var(--primary,#1e3a5f);margin:16px 0 14px;">' +
            '<i class="fa-solid fa-turn-up"></i> יחידת פינה</div>' +
        '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:14px;">' +
            _field('cornerDrawers3', 'פינה 3 מגירות (₪)', 'min="0" step="10"') +
            _field('cornerDrawers4', 'פינה 4 מגירות (₪)', 'min="0" step="10"') +
            _field('cornerDrawerExtra', 'מגירה נוספת בפינה (₪)', 'min="0" step="10"') +
            _field('cornerDesk', 'שולחן פינה (₪)', 'min="0" step="50"') +
            _field('fullCornerBase', 'פינה מלאה — בסיס (₪)', 'min="0" step="50"') +
            _field('fullCornerShelf', 'מדף בפינה מלאה (₪)', 'min="0" step="10"') +
            _field('wingConnection', 'חיבור כנפיים (₪)', 'min="0" step="50"') +
        '</div>' +
        '<div style="font-size:.9rem;font-weight:800;color:var(--primary,#1e3a5f);margin:16px 0 14px;">' +
            '<i class="fa-solid fa-box"></i> ארון צד</div>' +
        '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:14px;">' +
            _field('sideCabMel', 'ארון צד מלמין (₪/ס"מ)', 'min="0" step="1"') +
            _field('sideCabNonMel', 'ארון צד לא מלמין (₪/ס"מ)', 'min="0" step="1"') +
            _field('sideCabDoors', 'דלתות לארון צד (₪)', 'min="0" step="50"') +
        '</div>' +
    '</div>';
}

function _slidingHtml() {
    return '<div style="background:#fff;border:1px solid var(--border);border-radius:var(--radius,12px);' +
        'padding:20px 24px;margin-bottom:12px;">' +
        '<div style="font-size:.9rem;font-weight:800;color:var(--primary,#1e3a5f);margin-bottom:14px;">' +
            '<i class="fa-solid fa-arrows-left-right"></i> ארון הזזה</div>' +
        '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:14px;">' +
            _field('slidingBase', 'בסיס הזזה (₪)', 'min="0" step="50"') +
            _field('slidingDoor', 'דלת הזזה (₪)', 'min="0" step="10"') +
            _field('slidingGlass', 'תוספת זכוכית (₪/דלת)', 'min="0" step="10"') +
            _field('slidingMirror', 'תוספת מראה (₪/דלת)', 'min="0" step="10"') +
            _field('slidingGold', 'תוספת פרופיל זהב (₪/דלת)', 'min="0" step="10"') +
            _field('slidingBlack', 'תוספת פרופיל שחור (₪/דלת)', 'min="0" step="10"') +
            _field('slidingHeightSurcharge', 'תוספת גובה הזזה (%)', 'min="0" max="100" step="1"') +
            _field('nickelLegPrice', 'רגל ניקל (₪)', 'min="0" step="10"') +
        '</div>' +
    '</div>';
}

function _saveBarHtml() {
    return '<div id="' + _id('save-bar') + '" ' +
        'style="padding:16px 0;display:flex;align-items:center;gap:12px;">' +
        '<button onclick="PricingPanel._onSave()" ' +
            'style="height:42px;background:var(--primary,#1e3a5f);color:#fff;border:none;' +
            'border-radius:10px;padding:0 22px;font-size:.88rem;font-weight:700;font-family:inherit;cursor:pointer;">' +
            '<i class="fa-solid fa-floppy-disk"></i> ' + (_opts.saveLabel || 'שמור הגדרות תמחור') + '</button>' +
        '<button onclick="PricingPanel._onReset()" ' +
            'style="height:42px;background:#f1f5f9;color:var(--text);border:1px solid var(--border);' +
            'border-radius:10px;padding:0 16px;font-size:.85rem;font-weight:600;font-family:inherit;cursor:pointer;">' +
            '<i class="fa-solid fa-rotate-left"></i> אפס</button>' +
        '<span id="' + _id('saved-note') + '" style="display:none;color:#16a34a;font-size:.85rem;font-weight:700;">' +
            '<i class="fa-solid fa-circle-check"></i> נשמר בהצלחה!</span>' +
    '</div>';
}

// ── event wiring ─────────────────────────────────────────────────────────────
function _attachListeners(container) {
    container.addEventListener('input', function() { updatePreview(); });
}

// ── setMode ──────────────────────────────────────────────────────────────────
function setMode(mode) {
    _currentMode = mode;

    // toggle mode buttons
    document.querySelectorAll('.pnl-mode-btn').forEach(function(b) {
        b.classList.toggle('active', b.getAttribute('data-mode') === mode);
        if (b.classList.contains('active')) {
            b.style.background = 'var(--primary,#1e3a5f)';
            b.style.color = '#fff';
            b.style.borderColor = 'var(--primary,#1e3a5f)';
        } else {
            b.style.background = '#f8fafc';
            b.style.color = 'var(--text,#1e293b)';
            b.style.borderColor = 'var(--border,#e2e8f0)';
        }
    });

    // show/hide mode-specific sections
    ['ranges','sqm','lm','lm_height','materials'].forEach(function(m) {
        var sec = _el('section-' + m);
        if (sec) sec.style.display = (m === mode) ? 'block' : 'none';
    });

    // ③ hide/show heightSurcharge based on mode
    // Used only in 'ranges' and 'lm' modes
    var hRow = _el('row-heightSurcharge');
    if (hRow) hRow.style.display = (mode === 'ranges' || mode === 'lm') ? '' : 'none';

    // Show note in materials mode about both multipliers
    var note = _el('materials-note');
    if (note) note.style.display = (mode === 'materials') ? 'block' : 'none';

    // Update preview type select options (filtered to non-sliding for non-ranges modes)
    _refreshPreviewTypeSelect();
    updatePreview();
}

// ── cabinet types ─────────────────────────────────────────────────────────────
var _ENGINES = [
    { id: 'maya', label: 'צוקל נסתר' }, { id: 'c9', label: 'צוקל רגיל' },
    { id: 'regalim', label: 'ארון על רגליים' }, { id: 'sliding', label: 'ארון הזזה' },
    { id: 'ab2', label: 'AB2 (חזית פנימית + כוורת)' }, { id: 'ab2_nohoney', label: 'ארון עם חזיתות פנימיות' }
];

function _renderCabinetTypes() {
    var list = _el('types-list');
    if (!list) return;
    var engHtml = _ENGINES.map(function(e) {
        return '<option value="' + _esc(e.id) + '">' + _esc(e.label) + '</option>';
    }).join('');
    list.innerHTML = _cabinetTypes.map(function(t) {
        var isSliding = (t.engine === 'sliding');
        return '<div class="pnl-type-row" data-id="' + _esc(t.id) + '" ' +
            'style="display:flex;align-items:center;gap:10px;padding:8px 0;' +
            'border-bottom:1px solid var(--border);flex-wrap:wrap;">' +
            '<span style="font-size:.75rem;color:var(--muted);min-width:70px;' +
            'font-family:monospace;">' + _esc(t.id) + '</span>' +
            '<input type="text" class="pnl-type-label" value="' + _esc(t.label) + '" ' +
                'style="flex:1;min-width:120px;height:34px;border:1.5px solid var(--border);' +
                'border-radius:8px;padding:0 10px;font-family:inherit;font-size:.85rem;" ' +
                'placeholder="שם לתצוגה">' +
            '<select class="pnl-type-engine" ' +
                'style="height:34px;border:1.5px solid var(--border);border-radius:8px;' +
                'padding:0 8px;font-family:inherit;font-size:.82rem;">' +
                _ENGINES.map(function(e) {
                    return '<option value="' + _esc(e.id) + '"' + (t.engine === e.id ? ' selected' : '') + '>' + _esc(e.label) + '</option>';
                }).join('') +
            '</select>' +
            (!isSliding ?
                '<div style="display:flex;align-items:center;gap:5px;">' +
                '<label style="font-size:.75rem;color:var(--muted);white-space:nowrap;">מכפיל %</label>' +
                '<input type="number" class="pnl-type-factor" value="' + (_num(t.priceFactor, 0) * 100).toFixed(1) + '" ' +
                    'min="-100" max="200" step="1" title="מכפיל סוג (%): תוספת/הנחה בשיטות מ&quot;ר/מ&quot;א/חומרים" ' +
                    'style="width:72px;height:34px;border:1.5px solid var(--border);border-radius:8px;' +
                    'padding:0 8px;font-family:inherit;font-size:.85rem;">' +
                '</div>' : '') +
            (t.id !== 'sliding' ?
                '<button onclick="PricingPanel._deleteType(this)" ' +
                    'style="width:30px;height:30px;border-radius:6px;border:none;background:#fee2e2;' +
                    'color:#ef4444;cursor:pointer;font-size:.9rem;display:flex;align-items:center;' +
                    'justify-content:center;">✕</button>' : '') +
        '</div>';
    }).join('');
    _refreshRangesTypeSelects();
    _refreshPreviewTypeSelect();
}

function addCabinetType() {
    _syncTypesFromDom();
    var newId = 'type_' + Date.now();
    _cabinetTypes.push({ id: newId, label: '', engine: 'maya', priceFactor: 0 });
    _renderCabinetTypes();
    var list = _el('types-list');
    if (list) {
        var inputs = list.querySelectorAll('.pnl-type-label');
        if (inputs.length) inputs[inputs.length - 1].focus();
    }
}

function _deleteType(btn) {
    var row = btn.closest('.pnl-type-row');
    if (!row) return;
    var id = row.getAttribute('data-id');
    if (id === 'sliding') { alert('לא ניתן למחוק ארון הזזה'); return; }
    _syncTypesFromDom();
    _cabinetTypes = _cabinetTypes.filter(function(t) { return t.id !== id; });
    _renderCabinetTypes();
    _rebuildRangesTableForTypes();
}

function _syncTypesFromDom() {
    var list = _el('types-list');
    if (!list) return;
    var rows = list.querySelectorAll('.pnl-type-row');
    var next = [];
    rows.forEach(function(row) {
        var id = row.getAttribute('data-id');
        var labelEl  = row.querySelector('.pnl-type-label');
        var engineEl = row.querySelector('.pnl-type-engine');
        var factorEl = row.querySelector('.pnl-type-factor');
        if (!id) return;
        var t = { id: id,
            label: labelEl  ? (String(labelEl.value  || '').trim() || id) : id,
            engine: engineEl ? engineEl.value : 'maya' };
        if (factorEl) {
            var f = _num(factorEl.value, 0) / 100;
            if (f) t.priceFactor = f;
        }
        next.push(t);
    });
    if (next.length) _cabinetTypes = next;
}

// ── ranges table ─────────────────────────────────────────────────────────────
function _rangeTypes() {
    return _cabinetTypes.filter(function(t) { return t.engine !== 'sliding'; });
}

function _refreshRangesTypeSelects() {
    var tbody = _el('ranges-tbody');
    if (!tbody) return;
    var types = _rangeTypes();
    var optHtml = types.map(function(t) {
        return '<option value="' + _esc(t.id) + '">' + _esc(t.label) + '</option>';
    }).join('');
    tbody.querySelectorAll('select.pnl-rng-type').forEach(function(sel) {
        var cur = sel.value;
        sel.innerHTML = optHtml;
        if (types.some(function(t) { return t.id === cur; })) sel.value = cur;
    });
}

function _addRangeRowData(typeId, width, mel, nonMel) {
    var tbody = _el('ranges-tbody');
    if (!tbody) return;
    var types = _rangeTypes();
    if (!types.length) return;
    if (!types.some(function(t) { return t.id === typeId; })) typeId = types[0].id;
    var optHtml = types.map(function(t) {
        return '<option value="' + _esc(t.id) + '"' + (typeId === t.id ? ' selected' : '') + '>' + _esc(t.label) + '</option>';
    }).join('');
    var tr = document.createElement('tr');
    var cellStyle = 'padding:4px 6px;border:1px solid var(--border);';
    var inputStyle = 'width:100%;padding:4px 6px;font-size:.82rem;border:none;font-family:inherit;';
    tr.innerHTML =
        '<td style="' + cellStyle + '"><select class="pnl-rng-type" style="' + inputStyle + '">' + optHtml + '</select></td>' +
        '<td style="' + cellStyle + '"><input type="number" class="pnl-rng-w" style="' + inputStyle + '" value="' + (width || 80) + '"></td>' +
        '<td style="' + cellStyle + '"><input type="number" class="pnl-rng-mel" style="' + inputStyle + '" value="' + (mel || 0) + '"></td>' +
        '<td style="' + cellStyle + '"><input type="number" class="pnl-rng-nonmel" style="' + inputStyle + '" value="' + (nonMel || 0) + '"></td>' +
        '<td style="' + cellStyle + 'text-align:center;">' +
            '<button onclick="this.closest(\'tr\').remove()" ' +
                'style="background:none;border:none;color:#ef4444;cursor:pointer;font-size:1rem;padding:2px 6px;">✕</button>' +
        '</td>';
    tbody.appendChild(tr);
}

function addRangeRow() {
    var tbody = _el('ranges-tbody');
    var types = _rangeTypes();
    var lastSel = tbody ? tbody.querySelector('tr:last-child .pnl-rng-type') : null;
    var typeId = lastSel ? lastSel.value : (types[0] ? types[0].id : 'maya');
    var maxW = 0;
    if (tbody) tbody.querySelectorAll('tr').forEach(function(tr) {
        var sel = tr.querySelector('.pnl-rng-type');
        var inp = tr.querySelector('.pnl-rng-w');
        if (sel && sel.value === typeId && inp) maxW = Math.max(maxW, _num(inp.value, 0));
    });
    _addRangeRowData(typeId, maxW ? maxW + 40 : 80, 0, 0);
}

function _buildRangesTable(ranges) {
    var tbody = _el('ranges-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    var types = _rangeTypes();
    var r = ranges || {};
    var added = 0;
    types.forEach(function(t) {
        var entry = r[t.id] || {};
        var mel = entry.melamine || {};
        var nonMel = entry.nonMelamine || {};
        if (t.id === 'maya' && mel['40'] == null && mel['80'] != null) {
            mel = Object.assign({ 40: Math.round(_num(mel['80'], 0) / 2 + 150) }, mel);
            nonMel = Object.assign({ 40: Math.round(_num(nonMel['80'], 0) / 2 + 150) }, nonMel);
        }
        var widths = Object.keys(mel).length ? Object.keys(mel) : Object.keys(nonMel);
        widths.sort(function(a, b) { return parseInt(a, 10) - parseInt(b, 10); });
        if (!widths.length) return;
        widths.forEach(function(w) {
            _addRangeRowData(t.id, parseInt(w, 10), _num(mel[w], 0), _num(nonMel[w], 0));
            added++;
        });
    });
    if (!added && types.length) _addRangeRowData(types[0].id, 80, 0, 0);
}

function _readRangesTable() {
    var tbody = _el('ranges-tbody');
    if (!tbody) return {};
    var result = {};
    tbody.querySelectorAll('tr').forEach(function(tr) {
        var typeId = (tr.querySelector('.pnl-rng-type') || {}).value || 'maya';
        var width  = parseInt((tr.querySelector('.pnl-rng-w') || {}).value || 80, 10);
        var mel    = _num((tr.querySelector('.pnl-rng-mel') || {}).value, 0);
        var nonMel = _num((tr.querySelector('.pnl-rng-nonmel') || {}).value, 0);
        if (!result[typeId]) result[typeId] = { melamine: {}, nonMelamine: {} };
        result[typeId].melamine[width]    = mel;
        result[typeId].nonMelamine[width] = nonMel;
    });
    return result;
}

function _rebuildRangesTableForTypes() {
    var existing = _readRangesTable();
    var tbody = _el('ranges-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    var types = _rangeTypes();
    var added = 0;
    types.forEach(function(t) {
        var entry = existing[t.id] || {};
        var mel = entry.melamine || {};
        var nonMel = entry.nonMelamine || {};
        var widths = Object.keys(mel).length ? Object.keys(mel) : Object.keys(nonMel);
        widths.sort(function(a, b) { return parseInt(a) - parseInt(b); });
        if (!widths.length) return;
        widths.forEach(function(w) { _addRangeRowData(t.id, +w, _num(mel[w], 0), _num(nonMel[w], 0)); added++; });
    });
    if (!added && types.length) _addRangeRowData(types[0].id, 80, 0, 0);
}

// ── fill ─────────────────────────────────────────────────────────────────────
function fill(cfg) {
    var c  = cfg || D;
    var ex = c.extras || D.extras || {};
    var dx = D.extras || {};
    var mode = c.pricingMode || 'ranges';

    // normalize cabinet types
    if (PC && PC.normalizeConfig) PC.normalizeConfig(c);
    _cabinetTypes = (c.cabinetTypes && c.cabinetTypes.length) ? c.cabinetTypes.map(function(t) {
        return { id: t.id, label: t.label || t.id, engine: t.engine || t.id, priceFactor: _num(t.priceFactor, 0) };
    }) : [
        { id: 'maya', label: 'צוקל נסתר', engine: 'maya', priceFactor: 0 },
        { id: 'c9', label: 'צוקל רגיל', engine: 'c9', priceFactor: 0 },
        { id: 'regalim', label: 'ארון על רגליים', engine: 'regalim', priceFactor: 0 },
        { id: 'sliding', label: 'ארון הזזה', engine: 'sliding', priceFactor: 0 }
    ];
    _renderCabinetTypes();
    _buildRangesTable(c.ranges || (D.ranges || {}));
    setMode(mode);

    // top-level fields
    _set('sqmPrice',           _num(c.sqmPrice, 800));
    _set('sqmPriceNonMel',     _num(c.sqmPriceNonMel, 1040));
    _set('lmPrice',            _num(c.lmPrice, 1200));
    _set('lmPriceNonMel',      _num(c.lmPriceNonMel, 1560));
    _set('lmHeightBase',       _num(c.lmHeightBase, 1200));
    _set('lmHeightBaseNonMel', _num(c.lmHeightBaseNonMel, 1560));
    _set('lmHeightThresholdCm',_num(c.lmHeightThresholdCm, 240));
    _set('lmHeightStepCm',     _num(c.lmHeightStepCm, 30));
    _set('lmHeightStepPct',    _pct(_num(c.lmHeightStepPct, 0.10)));
    _set('materialsBoardPrice',    _num(c.materialsBoardPrice, 180));
    _set('materialsBoardsPerSqm',  _num(c.materialsBoardsPerSqm, 1.4));
    _set('materialsMultiplier',    _num(c.materialsMultiplier, 2.5));
    _set('profitMultiplier',       _num(c.profitMultiplier, 1.7));
    _set('heightSurcharge',        _pct(_num(c.heightSurcharge, 0.20)));
    _set('depthSurcharge',         _pct(_num(c.depthSurcharge, 0.20)));
    _set('sandwichSurcharge',      _pct(_num(c.sandwichSurcharge, 0.15)));
    _set('installPricePerUnit',    _num(c.installPricePerUnit, 110));
    _set('installUnitCm',          _num(c.installUnitCm, 42.5));
    _set('installHeightSurcharge', _pct(_num(c.installHeightSurcharge, 0.20)));

    // extras
    _set('internalDrawer',  _num(ex.internalDrawer, dx.internalDrawer || 150));
    _set('externalDrawer',  _num(ex.externalDrawer, dx.externalDrawer || 200));
    _set('openCell',        _num(ex.openCell, dx.openCell || 400));
    _set('partition',       _num(ex.partition, dx.partition || 150));
    _set('shelfFreePerMeter',_num(ex.shelfFreePerMeter, dx.shelfFreePerMeter || 3));
    _set('extraShelfMel',   _num(ex.extraShelfMel, dx.extraShelfMel || 60));
    _set('extraShelfNonMel',_num(ex.extraShelfNonMel, dx.extraShelfNonMel || 80));
    _set('deskUnit',        _num(ex.deskUnit, dx.deskUnit || 900));
    _set('doorFramedMel',   _num(ex.doorFramedMel, dx.doorFramedMel || 80));
    _set('doorGlassMel',    _num(ex.doorGlassMel, dx.doorGlassMel || 400));
    _set('doorGlassBlack',  _num(ex.doorGlassBlack, dx.doorGlassBlack || 600));
    _set('doorMirror',      _num(ex.doorMirror, dx.doorMirror || 350));
    _set('ledPair',         _num(ex.ledPair, dx.ledPair || 650));
    _set('sorbet',          _num(ex.sorbet, dx.sorbet || 170));
    _set('touchHandle',     _num(ex.touchHandle, dx.touchHandle || 30));
    _set('upperUnit160',    _num(ex.upperUnit160, dx.upperUnit160 || 600));
    _set('upperUnit240',    _num(ex.upperUnit240, dx.upperUnit240 || 900));
    _set('upperUnitPerCm',  _num(ex.upperUnitPerCm, dx.upperUnitPerCm || 3.75));
    _set('cornerDrawers3',  _num(ex.cornerDrawers3, dx.cornerDrawers3 || 832));
    _set('cornerDrawers4',  _num(ex.cornerDrawers4, dx.cornerDrawers4 || 907));
    _set('cornerDrawerExtra',_num(ex.cornerDrawerExtra, dx.cornerDrawerExtra || 200));
    _set('cornerDesk',      _num(ex.cornerDesk, dx.cornerDesk || 900));
    _set('fullCornerBase',  _num(ex.fullCornerBase, dx.fullCornerBase || 2800));
    _set('fullCornerShelf', _num(ex.fullCornerShelf, dx.fullCornerShelf || 120));
    _set('wingConnection',  _num(ex.wingConnection, dx.wingConnection || 400));
    _set('sideCabMel',      _num(ex.sideCabMel, dx.sideCabMel || 12));
    _set('sideCabNonMel',   _num(ex.sideCabNonMel, dx.sideCabNonMel || 15));
    _set('sideCabDoors',    _num(ex.sideCabDoors, dx.sideCabDoors || 300));
    _set('slidingBase',     _num(ex.slidingBase, dx.slidingBase || 800));
    _set('slidingDoor',     _num(ex.slidingDoor, dx.slidingDoor || 350));
    _set('slidingGlass',    _num(ex.slidingGlass, dx.slidingGlass || 200));
    _set('slidingMirror',   _num(ex.slidingMirror, dx.slidingMirror || 350));
    _set('slidingGold',     _num(ex.slidingGold, dx.slidingGold || 80));
    _set('slidingBlack',    _num(ex.slidingBlack, dx.slidingBlack || 50));
    _set('slidingHeightSurcharge', _pct(_num(ex.slidingHeightSurcharge, dx.slidingHeightSurcharge || 0.15)));
    _set('nickelLegPrice',  _num(ex.nickelLegPrice, dx.nickelLegPrice || 100));

    updatePreview();
}

// ── read ─────────────────────────────────────────────────────────────────────
function read() {
    _syncTypesFromDom();
    var ex = {};
    ['internalDrawer','externalDrawer','openCell','partition','shelfFreePerMeter',
     'extraShelfMel','extraShelfNonMel','deskUnit',
     'doorFramedMel','doorGlassMel','doorGlassBlack','doorMirror','ledPair','sorbet','touchHandle',
     'upperUnit160','upperUnit240','upperUnitPerCm',
     'cornerDrawers3','cornerDrawers4','cornerDrawerExtra','cornerDesk',
     'fullCornerBase','fullCornerShelf','wingConnection',
     'sideCabMel','sideCabNonMel','sideCabDoors',
     'slidingBase','slidingDoor','slidingGlass','slidingMirror','slidingGold','slidingBlack',
     'nickelLegPrice'].forEach(function(k) {
        ex[k] = _num(_v(k), 0);
    });
    ['slidingHeightSurcharge'].forEach(function(k) { ex[k] = (_frac(_v(k)) || 0); });
    return {
        pricingMode:              _currentMode,
        sqmPrice:                 _num(_v('sqmPrice'), 800),
        sqmPriceNonMel:           _num(_v('sqmPriceNonMel'), 1040),
        lmPrice:                  _num(_v('lmPrice'), 1200),
        lmPriceNonMel:            _num(_v('lmPriceNonMel'), 1560),
        lmHeightBase:             _num(_v('lmHeightBase'), 1200),
        lmHeightBaseNonMel:       _num(_v('lmHeightBaseNonMel'), 1560),
        lmHeightThresholdCm:      _num(_v('lmHeightThresholdCm'), 240),
        lmHeightStepCm:           _num(_v('lmHeightStepCm'), 30),
        lmHeightStepPct:          (_frac(_v('lmHeightStepPct')) || 0.10),
        materialsBoardPrice:      _num(_v('materialsBoardPrice'), 180),
        materialsBoardsPerSqm:    _num(_v('materialsBoardsPerSqm'), 1.4),
        materialsMultiplier:      _num(_v('materialsMultiplier'), 2.5),
        profitMultiplier:         _num(_v('profitMultiplier'), 1.7),
        heightSurcharge:          (_frac(_v('heightSurcharge')) || 0),
        depthSurcharge:           (_frac(_v('depthSurcharge')) || 0),
        sandwichSurcharge:        (_frac(_v('sandwichSurcharge')) || 0),
        installPricePerUnit:      _num(_v('installPricePerUnit'), 110),
        installUnitCm:            _num(_v('installUnitCm'), 42.5),
        installHeightSurcharge:   (_frac(_v('installHeightSurcharge')) || 0),
        cabinetTypes:             _cabinetTypes.map(function(t) {
            var out = { id: t.id, label: t.label, engine: t.engine };
            if (t.priceFactor) out.priceFactor = t.priceFactor;
            return out;
        }),
        ranges:                   _readRangesTable(),
        extras:                   ex
    };
}

// ── live preview ─────────────────────────────────────────────────────────────
var _melamine = true;

function _refreshPreviewTypeSelect() {
    var sel = _el('prev-type');
    if (!sel) return;
    var types = (_currentMode === 'ranges')
        ? _cabinetTypes
        : _cabinetTypes.filter(function(t) { return t.engine !== 'sliding'; });
    var curVal = sel.value;
    sel.innerHTML = types.map(function(t) {
        return '<option value="' + _esc(t.id) + '"' + (t.id === curVal ? ' selected' : '') + '>' + _esc(t.label) + '</option>';
    }).join('');
    if (!types.some(function(t) { return t.id === curVal; }) && types.length) sel.value = types[0].id;
}

function _toggleMaterial() {
    _melamine = !_melamine;
    var btn = _el('prev-mel');
    if (btn) btn.textContent = _melamine ? 'מלמין' : 'לא מלמין';
    updatePreview();
}

function updatePreview() {
    if (!PC) return;
    var resultEl = _el('prev-result');
    if (!resultEl) return;

    var cfg = read();
    var typeId = (_el('prev-type') || {}).value;
    var w  = _num((_el('prev-w') || {}).value, 160);
    var h  = _num((_el('prev-h') || {}).value, 240);
    var d  = 56; // default depth

    try {
        var type = PC.findType(cfg, typeId) || (PC.normalizeTypes(cfg)[0]);
        if (!type) { resultEl.innerHTML = '<div style="font-size:.75rem;opacity:.75;margin-bottom:2px;">תצוגה מקדימה</div><div style="font-size:1rem;">—</div>'; return; }
        var res = PC.preview(cfg, { typeId: type.id, w: w, h: h, d: d, melamine: _melamine });
        var mel = _melamine ? 'מלמין' : 'לא מלמין';
        resultEl.innerHTML =
            '<div style="font-size:.73rem;opacity:.7;margin-bottom:3px;">' + _esc(type.label) + ' ' + w + '×' + h + ' ' + mel + '</div>' +
            '<div style="font-size:1.2rem;font-weight:800;">ללקוח: ' + res.customer.toLocaleString() + ' ₪</div>' +
            '<div style="font-size:.75rem;opacity:.75;">עלות: ' + res.cost.toLocaleString() + ' ₪ · התקנה: ' + res.install.toLocaleString() + ' ₪</div>';
    } catch (e) {
        resultEl.innerHTML = '<div style="font-size:.8rem;opacity:.7;">שגיאה בחישוב</div>';
    }
}

// ── save/reset callbacks ─────────────────────────────────────────────────────
function _onSave()  { if (typeof _opts.onSave  === 'function') _opts.onSave(read()); }
function _onReset() { if (typeof _opts.onReset === 'function') _opts.onReset(); }

function showSavedNote(ms) {
    var el = _el('saved-note');
    if (!el) return;
    el.style.display = 'inline';
    clearTimeout(_savedTimer);
    _savedTimer = setTimeout(function() { el.style.display = 'none'; }, ms || 3000);
}
var _savedTimer;

// ── CSS injection ─────────────────────────────────────────────────────────────
(function injectStyles() {
    if (document.getElementById('pnl-styles')) return;
    var style = document.createElement('style');
    style.id = 'pnl-styles';
    style.textContent =
        '.pnl-mode-btn:hover { opacity: .85; }' +
        '[id^="pnl-"] input:focus { border-color: #2563eb !important; outline: none; }';
    document.head.appendChild(style);
})();

// ── exports ──────────────────────────────────────────────────────────────────
global.PricingPanel = {
    mount:          mount,
    fill:           fill,
    read:           read,
    setMode:        setMode,
    updatePreview:  updatePreview,
    addCabinetType: addCabinetType,
    addRangeRow:    addRangeRow,
    showSavedNote:  showSavedNote,
    // internal (called from inline onclick):
    _toggleMaterial: _toggleMaterial,
    _deleteType:     _deleteType,
    _onSave:         _onSave,
    _onReset:        _onReset
};

})(typeof window !== 'undefined' ? window : globalThis);
