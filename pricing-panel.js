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
var _customExtras = [];
var _stockMaterials = [];
var _hingeTypes = [];
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

/** Wrap content in a collapsible card. open=true → starts expanded. */
function _detailsCard(title, icon, innerHtml, open) {
    return '<details class="pnl-details"' + (open ? ' open' : '') + ' ' +
        'style="background:#fff;border:1px solid var(--border);border-radius:var(--radius,12px);' +
        'padding:0;margin-bottom:12px;">' +
        '<summary style="list-style:none;cursor:pointer;padding:16px 24px;font-size:.9rem;font-weight:800;' +
            'color:var(--primary,#1e3a5f);display:flex;align-items:center;gap:8px;user-select:none;">' +
            '<i class="fa-solid ' + icon + '"></i> ' + title +
            '<i class="fa-solid fa-chevron-down" style="margin-right:auto;font-size:.7rem;opacity:.55;"></i>' +
        '</summary>' +
        '<div style="padding:0 24px 20px;">' + innerHtml + '</div>' +
    '</details>';
}

/** Inline help: kind = info | ex | warn */
function _helpBox(html, kind) {
    kind = kind || 'info';
    var bg = kind === 'warn' ? '#fef3c7' : (kind === 'ex' ? '#ecfdf5' : '#eff6ff');
    var color = kind === 'warn' ? '#92400e' : (kind === 'ex' ? '#065f46' : '#1e3a5f');
    var icon = kind === 'warn' ? 'fa-triangle-exclamation' : (kind === 'ex' ? 'fa-lightbulb' : 'fa-circle-info');
    return '<div class="pnl-help" style="margin:0 0 14px;padding:12px 14px;background:' + bg +
        ';border-radius:10px;font-size:.8rem;color:' + color + ';line-height:1.55;">' +
        '<i class="fa-solid ' + icon + '" style="margin-left:6px;"></i>' + html + '</div>';
}

// ── HTML builder ─────────────────────────────────────────────────────────────
function _buildHtml() {
    var s = _opts.showSaveBar;
    return [
        _previewHtml(),
        _modeBtnsHtml(),
        // Active mode body (only one visible at a time)
        _rangesSectionHtml(),
        _sqmSectionHtml(),
        _lmSectionHtml(),
        _lmHeightSectionHtml(),
        _materialsSectionHtml(),
        // Stock near materials
        _stockMaterialsHtml(),
        // Profit + install always visible
        _commonSurchargesHtml(),
        _installHtml(),
        // Collapsible extras groups
        _structureExtrasHtml(),
        _doorsHtml(),
        _customAndClosuresHtml(),
        _hingeTypesHtml(),
        _customExtrasHtml(),
        // Special units collapsed by default
        _specialUnitsHtml(),
        // Cabinet types last (stores/admin only)
        _opts.showCabinetTypes !== false ? _cabinetTypesSectionHtml() : '',
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
            '<select id="' + _id('prev-mat') + '" onchange="PricingPanel.updatePreview()" ' +
                'title="צבע מהמלאי (שיטת חומרים)" ' +
                'style="display:none;height:36px;border:none;border-radius:8px;padding:0 10px;max-width:180px;' +
                'font-size:.83rem;font-family:inherit;color:#1e3a5f;"></select>' +
        '</div>' +

        '<div id="' + _id('prev-result') + '" style="text-align:left;min-width:200px;">' +
            '<div style="font-size:.75rem;opacity:.75;margin-bottom:2px;">תצוגה מקדימה (לפני שמירה)</div>' +
            '<div style="font-size:1.15rem;font-weight:800;">— ₪</div>' +
        '</div>' +
        '<div style="width:100%;font-size:.72rem;opacity:.85;line-height:1.4;margin-top:2px;">' +
            'משחקים כאן עם מידות ושיטה כדי לראות מחיר מיד. בשיטת חומרים זו הערכה לפי חזית — ' +
            'במעצב החישוב לפי פלטות אמיתיות מדויק יותר.' +
        '</div>' +
    '</div>';
}

/* ② MODE BUTTONS */
function _modeBtnsHtml() {
    // Order: first = right in RTL; ranges last so it sits on the left
    var modes = [
        { id: 'sqm',       label: 'מ"ר',             sub: 'מחיר למ"ר' },
        { id: 'lm',        label: 'מ"א',             sub: 'מחיר למ"א' },
        { id: 'lm_height', label: 'מ"א + גובה',     sub: 'עם תוספת מדורגת' },
        { id: 'materials', label: 'חומרים',          sub: 'פלטות מקינון CNC' },
        { id: 'ranges',    label: 'טווחי מידות',   sub: 'לפי רוחב' }
    ];
    return '<div style="background:#fff;border:1px solid var(--border);border-radius:var(--radius,12px);' +
            'padding:20px 24px;margin-bottom:12px;">' +
        '<div style="font-size:.9rem;font-weight:800;color:var(--primary,#1e3a5f);margin-bottom:8px;">' +
            '<i class="fa-solid fa-sliders"></i> שיטת תמחור</div>' +
        _helpBox(
            '<b>איך זה עובד בכל השיטות:</b> מחשבים <b>עלות</b> לגוף הארון (+ תוספות כמו מגירות/דלתות) ' +
            'ואז מכפילים ב<b>מכפיל רווח</b> → מחיר ללקוח. <b>התקנה</b> מחושבת בנפרד ולא נכנסת למכפיל הרווח.<br>' +
            '<b>מתי לבחור מה:</b> ' +
            '<b>חומרים</b> — נגרים (לפי פלטות אמיתיות במעצב). ' +
            '<b>מ"ר / מ"א</b> — תמחור פשוט לפי מידה. ' +
            '<b>מ"א + גובה</b> — כשיש תוספת מדורגת לגובה. ' +
            '<b>טווחי מידות</b> — טבלת מחירים קבועה לפי רוחב (כמו מחירון ישן).',
            'info'
        ) +
        '<div id="' + _id('mode-btns') + '" style="display:flex;gap:8px;flex-wrap:wrap;">' +
            modes.map(function(m) {
                var isActive = m.id === _currentMode;
                return '<button class="pnl-mode-btn' + (isActive ? ' active' : '') + '" ' +
                    'data-mode="' + m.id + '" onclick="PricingPanel.setMode(\'' + m.id + '\')" ' +
                    'style="padding:9px 18px;border-radius:9px;border:1.5px solid ' +
                    (isActive ? 'var(--primary,#1e3a5f)' : 'var(--border)') + ';' +
                    'background:' + (isActive ? 'var(--primary,#1e3a5f)' : '#f8fafc') + ';' +
                    'color:' + (isActive ? '#fff' : 'var(--text)') + ';' +
                    'font-size:.82rem;font-weight:700;' +
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
        _helpBox(
            'שם לתצוגה במחשבון ובמעצב, וסוג הבנייה (מנוע). ' +
            '<b>מכפיל סוג (%)</b> — תוספת/הנחה לסוג בשיטות מ״ר / מ״א / חומרים (0 = ללא שינוי). לארון הזזה אין טבלת רוחב.',
            'info'
        ) +
        _helpBox(
            '<b>דוגמה:</b> מכפיל סוג +10% על ארון «צוקל רגיל». עלות בסיס 2,000 ₪ → 2,200 ₪ לפני רווח.',
            'ex'
        ) +
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
        _helpBox(
            'מגדירים <b>מחיר עלות לארון שלם</b> לפי סוג ורוחב (ס״מ), בנפרד למלמין / לא מלמין. ' +
            'רוחב שלא בטבלה → נלקחת השורה הקרובה <b>מעליו</b>. מעל הרוחב המקסימלי → מחיר יחסי.',
            'info'
        ) +
        _helpBox(
            '<b>דוגמה:</b> בטבלה יש 120 ס״מ = 3,000 ₪ ו־160 ס״מ = 3,800 ₪. ' +
            'ארון 140 ס״מ ייקח את מחיר 160 (3,800 ₪). ארון 200 ס״מ כשהמקסימום 160 → ' +
            '(3,800 ÷ 160) × 200 ≈ 4,750 ₪. אחר כך × מכפיל רווח.',
            'ex'
        ) +
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

function _modeSection(id, icon, title, fields, helpHtml) {
    return '<div id="' + _id('section-' + id) + '" class="pnl-mode-section" ' +
        'style="background:#fff;border:1px solid var(--border);border-radius:var(--radius,12px);' +
        'padding:20px 24px;margin-bottom:12px;display:none;">' +
        '<div style="font-size:.9rem;font-weight:800;color:var(--primary,#1e3a5f);margin-bottom:10px;">' +
            '<i class="fa-solid ' + icon + '"></i> ' + title + '</div>' +
        (helpHtml || '') +
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
        _field('sqmPriceNonMel', 'מ"ר — לא מלמין (₪)', 'min="0" step="10"'),
        _helpBox('עלות = מחיר למ״ר × (רוחב÷100) × (גובה÷100). מתאים כשעובדים לפי שטח חזית.', 'info') +
        _helpBox('<b>דוגמה:</b> 800 ₪/מ״ר, ארון 160×240 → 1.6×2.4 = 3.84 מ״ר → עלות 3,072 ₪. ' +
            'עם מכפיל רווח 1.8 → ללקוח ≈ 5,530 ₪ (+ התקנה בנפרד).', 'ex')
    );
}

function _lmSectionHtml() {
    return _modeSection('lm', 'fa-ruler-horizontal', 'מחיר למ"א',
        _field('lmPrice', 'מ"א — מלמין (₪)', 'min="0" step="10"') +
        _field('lmPriceNonMel', 'מ"א — לא מלמין (₪)', 'min="0" step="10"'),
        _helpBox('עלות = מחיר למטר רץ × (רוחב÷100). הגובה לא משפיע על הבסיס (אלא אם מופעלת תוספת גובה למעלה).', 'info') +
        _helpBox('<b>דוגמה:</b> 1,200 ₪/מ״א, ארון רוחב 160 → 1.6 מ׳ → עלות 1,920 ₪. ' +
            'אם הגובה ≥ 241 ויש תוספת גובה 20% → 1,920 × 1.2 = 2,304 ₪.', 'ex')
    );
}

function _lmHeightSectionHtml() {
    return _modeSection('lm_height', 'fa-ruler-vertical', 'מ"א + תוספת גובה',
        _field('lmHeightBase', 'בסיס מ"א — מלמין (₪)', 'min="0" step="10"') +
        _field('lmHeightBaseNonMel', 'בסיס מ"א — לא מלמין (₪)', 'min="0" step="10"') +
        _field('lmHeightThresholdCm', 'סף גובה (ס"מ)', 'min="0" step="10"') +
        _field('lmHeightStepCm', 'צעד גובה (ס"מ)', 'min="1" step="5"') +
        _field('lmHeightStepPct', 'תוספת לצעד (%)', 'min="0" max="100" step="1"'),
        _helpBox(
            'בסיס למטר רץ, ואז תוספת מדורגת לפי גובה: ' +
            'מספר צעדים = כמה פעמים עברתם את הסף בקפיצות של «צעד גובה». כל צעד מוסיף את האחוז.',
            'info'
        ) +
        _helpBox(
            '<b>דוגמה:</b> בסיס 1,200 ₪/מ״א, סף 240, צעד 30 ס״מ, תוספת 10% לצעד. ' +
            'ארון 160×300 → רוחב 1.6 מ׳, גובה 300 → שני צעדים (240→270, 270→300) → ' +
            '1,200 × 1.6 × (1 + 2×0.10) = 1,920 × 1.2 = 2,304 ₪ עלות.',
            'ex'
        )
    );
}

function _materialsSectionHtml() {
    return _modeSection('materials', 'fa-layer-group', 'תמחור לפי חומרים',
        _field('materialsMultiplier', 'מכפיל בלאי / בזבוז (גיבוי)', 'min="1" step="0.05"') +
        _field('materialsBoardPrice', 'מחיר לוח כללי — גיבוי (₪)', 'min="0" step="5"') +
        _field('materialsBoardsPerSqm', 'לוחות למ"ר — גיבוי', 'min="0" step="0.1"'),
        '<div id="' + _id('materials-stock-hint') + '">' +
            _helpBox(
                '<b>במעצב (חישוב אמיתי):</b> כל חלקי הארון (צדדים, מדפים, דלתות…) נארזים לפלטות כמו בקינון CNC. ' +
                'עלות החומר = <b>מספר פלטות × מחיר פלטה</b> לפי צבע במלאי למטה. ' +
                'ייצוא CNC לא נפתח — רק מנוע הקינון הפנימי.',
                'info'
            ) +
            _helpBox(
                '<b>דוגמה במעצב:</b> הארון יצא ל־3 פלטות לבן מט (₪450) ו־1 פלטת עץ (₪520) → ' +
                'עלות חומר 3×450 + 1×520 = 1,870 ₪. אחר כך נוספות תוספות פרזול/מגירות, ואז × רווח.',
                'ex'
            ) +
            _helpBox(
                '<b>כאן בתצוגה מקדימה / מחשבון מהיר</b> (אין ארון תלת־ממד): הערכה לפי שטח חזית × (מחיר פלטה÷שטח פלטה) × מכפיל בלאי. ' +
                'שדות הגיבוי משמשים רק כשאין מחיר לצבע במלאי.',
                'warn'
            ) +
        '</div>'
    );
}

/* ④ COMMON SURCHARGES — hide heightSurcharge for irrelevant modes */
function _commonSurchargesHtml() {
    return '<div id="' + _id('section-surcharges') + '" ' +
        'style="background:#fff;border:1px solid var(--border);border-radius:var(--radius,12px);' +
        'padding:20px 24px;margin-bottom:12px;">' +
        '<div style="font-size:.9rem;font-weight:800;color:var(--primary,#1e3a5f);margin-bottom:8px;">' +
            '<i class="fa-solid fa-percent"></i> רווח ותוספות אחוז</div>' +
        _helpBox(
            '<b>מכפיל רווח</b> מוחל על סה״כ העלות (גוף + תוספות) → מחיר ללקוח. ' +
            '1.8 = רווח של 80% מעל העלות (עלות 1,000 → ללקוח 1,800).',
            'info'
        ) +
        _helpBox(
            '<b>דוגמה עומק:</b> סף 54 ס״מ ותוספת 20%. ארון בעומק 60 → עלות הגוף × 1.2. ' +
            '<b>סנדוויץ\':</b> צבעים מסומנים כסנדוויץ\' מקבלים תוספת אחוז על בסיס הארון.',
            'ex'
        ) +
        '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:14px;">' +
            _field('profitMultiplier', 'מכפיל רווח ללקוח', 'min="1" step="0.05"') +
            '<div id="' + _id('row-heightSurcharge') + '">' +
                _field('heightSurcharge', 'תוספת גובה מעל 240 (%)', 'min="0" max="100" step="1"') +
            '</div>' +
            _field('depthSurchargeFromCm', 'סף עומק לתוספת (ס"מ)', 'min="1" step="1"') +
            _field('depthSurcharge', 'תוספת עומק מעל הסף (%)', 'min="0" max="100" step="1"') +
            _field('sandwichSurcharge', 'תוספת צבע סנדוויץ\' (%)', 'min="0" max="100" step="1"') +
        '</div>' +
        '<div id="' + _id('materials-note') + '" style="display:none;margin-top:12px;">' +
            _helpBox(
                'בשיטת <b>חומרים</b>: במעצב הקינון כבר כולל בזבוז אריזה — מכפיל הבלאי משמש בעיקר לגיבוי/תצוגה מקדימה. ' +
                'מכפיל הרווח תמיד מוחל בסוף על סה״כ העלות.',
                'warn'
            ) +
        '</div>' +
    '</div>';
}

function _installHtml() {
    return '<div style="background:#fff;border:1px solid var(--border);border-radius:var(--radius,12px);' +
        'padding:20px 24px;margin-bottom:12px;">' +
        '<div style="font-size:.9rem;font-weight:800;color:var(--primary,#1e3a5f);margin-bottom:8px;">' +
            '<i class="fa-solid fa-screwdriver-wrench"></i> מחיר התקנה</div>' +
        _helpBox(
            'התקנה = מספר יחידות × מחיר ליחידה. מספר יחידות = עיגול כלפי מעלה של (רוחב ÷ רוחב יחידה). ' +
            'מעל גובה 240 ס״מ אפשר להוסיף אחוז. <b>לא נכנס למכפיל הרווח</b>.',
            'info'
        ) +
        _helpBox(
            '<b>דוגמה:</b> יחידה 42.5 ס״מ ב־110 ₪. ארון רוחב 160 → ceil(160/42.5)=4 יחידות → 440 ₪. ' +
            'גובה 260 עם תוספת 20% → 440 × 1.2 = 528 ₪.',
            'ex'
        ) +
        '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:14px;">' +
            _field('installPricePerUnit', 'מחיר ליחידת התקנה (₪)', 'min="0" step="5"') +
            _field('installUnitCm', 'רוחב יחידת התקנה (ס"מ)', 'min="1" step="0.5"') +
            _field('installHeightSurcharge', 'תוספת גובה להתקנה (%)', 'min="0" max="100" step="1"') +
        '</div>' +
    '</div>';
}

function _structureExtrasHtml() {
    var body =
        _helpBox(
            'תוספות קבועות ב־₪ שנוספות לעלות אחרי מחיר הגוף. במחשבון ובמעצב — לפי מה שבאמת הוגדר בארון. ' +
            'בשיטת חומרים עם קינון: לוחות המדפים כבר בפלטות, ולכן תוספת «מדף נוסף» לא נגבית שם שוב.',
            'info'
        ) +
        _helpBox(
            '<b>דוגמה:</b> גוף 2,000 ₪ + 3 מגירות פנימיות × 150 + כוורת 200 = עלות 2,650 ₪. ' +
            '× רווח 1.8 → ללקוח 4,770 ₪.',
            'ex'
        ) +
        '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:14px;">' +
            _field('internalDrawer', 'מגירה פנימית (₪)', 'min="0" step="10"') +
            _field('externalDrawer', 'מגירה חיצונית (₪)', 'min="0" step="10"') +
            _field('shoeDrawer', 'מגירת נעליים (₪)', 'min="0" step="10"') +
            _field('openCell', 'כוורת עד 60 ס\"מ (₪)', 'min="0" step="10"') +
            _field('openCell34', 'כוורת 61-120 ס\"מ (₪)', 'min="0" step="10"') +
            _field('openCell5', 'כוורת מעל 120 ס\"מ (₪)', 'min="0" step="10"') +
            _field('partition', 'מחיצה (₪)', 'min="0" step="10"') +
            _field('shelfFreePerMeter', 'מדפים חינם למטר', 'min="0" step="0.5"') +
            _field('extraShelfMel', 'מדף נוסף — מלמין (₪)', 'min="0" step="5"') +
            _field('extraShelfNonMel', 'מדף נוסף — לא מלמין (₪)', 'min="0" step="5"') +
            _field('deskUnit', 'שולחן צד (₪)', 'min="0" step="50"') +
        '</div>';
    return _detailsCard('מגירות, תאים ומדפים', 'fa-plus-circle', body, true);
}

function _doorsHtml() {
    var body =
        _helpBox(
            'תוספת סגנון לדלת/עלה (לא מחיר הדלת עצמה בשיטת חומרים — שם העץ כבר בפלטות). ' +
            'למשל דלת זכוכית = תוספת לפרזול/זכוכית מעבר ללוח.',
            'info'
        ) +
        _helpBox(
            '<b>דוגמה:</b> 2 דלתות זכוכית שחורה × 600 ₪ = 1,200 ₪ תוספת. זוג לדים 650 ₪. ' +
            'הכל נוסף לעלות לפני מכפיל הרווח.',
            'ex'
        ) +
        '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:14px;">' +
            _field('doorFramedMel', 'דלת ממסגרת מלמין (₪)', 'min="0" step="10"') +
            _field('doorGlassMel', 'דלת זכוכית מלמין (₪)', 'min="0" step="10"') +
            _field('doorGlassBlack', 'דלת זכוכית שחורה/זהב (₪)', 'min="0" step="10"') +
            _field('doorMirror', 'דלת מראה (₪)', 'min="0" step="10"') +
            _field('deskMirror', 'מראה בגב תא פתוח / מעל שולחן (₪)', 'min="0" step="10"') +
            _field('ledPair', 'זוג לדים (₪)', 'min="0" step="10"') +
            _field('sorbet', 'סורבטו (₪)', 'min="0" step="10"') +
            _field('touchHandle', 'ידית טאצ\' לדלת/מגירה (₪)', 'min="0" step="5"') +
        '</div>';
    return _detailsCard('דלתות, מראות ולדים', 'fa-door-open', body, true);
}

function _specialUnitsHtml() {
    var body =
        _helpBox(
            'מחירים ליחידות מיוחדות שנוספות לפרויקט (עליונה, פינה, ארון צד, הזזה). ' +
            'ארון הזזה: בסיס + מספר דלתות × מחיר דלת (+ תוספות זכוכית/מראה/פרופיל).',
            'info'
        ) +
        _helpBox(
            '<b>דוגמה הזזה:</b> בסיס 800 + 3 דלתות × 350 = 1,850 ₪. עם תוספת גובה 15% מעל 240 → ≈ 2,128 ₪ עלות.',
            'ex'
        ) +
        '<div style="font-size:.85rem;font-weight:700;color:var(--muted);margin:4px 0 10px;">יחידה עליונה</div>' +
        '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:14px;">' +
            _field('upperUnit160', 'יחידה עליונה עד 160 (₪)', 'min="0" step="50"') +
            _field('upperUnit240', 'יחידה עליונה עד 240 (₪)', 'min="0" step="50"') +
            _field('upperUnitPerCm', 'יחידה עליונה מעל 240 (₪/ס"מ)', 'min="0" step="0.25"') +
        '</div>' +
        '<div style="font-size:.85rem;font-weight:700;color:var(--muted);margin:16px 0 10px;">יחידת פינה</div>' +
        '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:14px;">' +
            _field('cornerDrawers3', 'פינה 3 מגירות (₪)', 'min="0" step="10"') +
            _field('cornerDrawers4', 'פינה 4 מגירות (₪)', 'min="0" step="10"') +
            _field('cornerDrawerExtra', 'מגירה נוספת בפינה (₪)', 'min="0" step="10"') +
            _field('cornerDesk', 'שולחן פינה (₪)', 'min="0" step="50"') +
            _field('fullCornerBase', 'פינה מלאה — בסיס (₪)', 'min="0" step="50"') +
            _field('fullCornerShelf', 'מדף בפינה מלאה (₪)', 'min="0" step="10"') +
            _field('wingConnection', 'חיבור כנפיים (₪)', 'min="0" step="50"') +
        '</div>' +
        '<div style="font-size:.85rem;font-weight:700;color:var(--muted);margin:16px 0 10px;">ארון צד</div>' +
        '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:14px;">' +
            _field('sideCabMel', 'ארון צד מלמין (₪/ס"מ)', 'min="0" step="1"') +
            _field('sideCabNonMel', 'ארון צד לא מלמין (₪/ס"מ)', 'min="0" step="1"') +
            _field('sideCabDoors', 'דלתות לארון צד (₪)', 'min="0" step="50"') +
        '</div>' +
        '<div style="font-size:.85rem;font-weight:700;color:var(--muted);margin:16px 0 10px;">ארון הזזה</div>' +
        '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:14px;">' +
            _field('slidingBase', 'בסיס הזזה (₪)', 'min="0" step="50"') +
            _field('slidingDoor', 'דלת הזזה (₪)', 'min="0" step="10"') +
            _field('slidingGlass', 'תוספת זכוכית (₪/דלת)', 'min="0" step="10"') +
            _field('slidingMirror', 'תוספת מראה (₪/דלת)', 'min="0" step="10"') +
            _field('slidingGold', 'תוספת פרופיל זהב (₪/דלת)', 'min="0" step="10"') +
            _field('slidingBlack', 'תוספת פרופיל שחור (₪/דלת)', 'min="0" step="10"') +
            _field('slidingHeightSurcharge', 'תוספת גובה הזזה (%)', 'min="0" max="100" step="1"') +
        '</div>';
    return _detailsCard('יחידות מיוחדות (עליונה / פינה / צד / הזזה)', 'fa-box', body, false);
}

/** ארון לפי מידה, תוספות צוקל רגיל, משטח עליון, סגירות */
function _customAndClosuresHtml() {
    var body =
        _helpBox(
            '<b>לפי מידה:</b> נפח במ״ק × מחיר למ״ק (לפי חומר). ' +
            '<b>צוקל/רגליים:</b> תוספת ₪ קבועה לפי בחירה בפרויקט (לא אחוז). ' +
            'רגלי ניקל בארון על רגליים: מספר רגליים לפי רוחב × מחיר לרגל.',
            'info'
        ) +
        _helpBox(
            '<b>דוגמה לפי מידה:</b> 100×200×60 ס״מ = 1.2 מ״ק × 1,200 ₪ = 1,440 ₪. ' +
            '<b>רגליים:</b> רוחב 160 → 6 רגליים × 100 ₪ = 600 ₪ תוספת.',
            'ex'
        ) +
        '<div style="font-size:.85rem;font-weight:700;color:var(--muted);margin:0 0 10px;">ארון לפי מידה</div>' +
        '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:14px;">' +
            _field('customSizeMel', 'מלמין (₪/מ"ק)', 'min="0" step="50"') +
            _field('customSizeSandwich', 'סנדוויץ\' (₪/מ"ק)', 'min="0" step="50"') +
            _field('customSizeMdf', 'MDF (₪/מ"ק)', 'min="0" step="50"') +
        '</div>' +
        '<div style="font-size:.85rem;font-weight:700;color:var(--muted);margin:16px 0 10px;">סגנון צוקל / רגליים</div>' +
        '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:14px;">' +
            _field('c9RecessedSurcharge', 'צוקל נסתר (תוספת ₪)', 'min="0" step="10"') +
            _field('c9LegsSurcharge', 'על רגליים (תוספת ₪)', 'min="0" step="10"') +
            _field('nickelLegPrice', 'רגל ניקל — ארון על רגליים (₪/רגל)', 'min="0" step="10"') +
        '</div>' +
        '<div style="font-size:.85rem;font-weight:700;color:var(--muted);margin:16px 0 10px;">משטח עליון וסגירות</div>' +
        '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:14px;">' +
            _field('topPanelPerCm', 'משטח עליון (₪/ס"מ רוחב)', 'min="0" step="1"') +
            _field('closuresCustomer', 'סגירות — מחיר ללקוח (₪)', 'min="0" step="50"') +
            _field('closuresInstall', 'סגירות — התקנה (₪)', 'min="0" step="50"') +
        '</div>';
    return _detailsCard('לפי מידה, צוקל וסגירות', 'fa-ruler-combined', body, true);
}

/** Carpenter stock colors / full-sheet prices */
function _stockMaterialsHtml() {
    return '<div style="background:#fff;border:1px solid var(--border);border-radius:var(--radius,12px);' +
        'padding:20px 24px;margin-bottom:12px;">' +
        '<div style="font-size:.9rem;font-weight:800;color:var(--primary,#1e3a5f);margin-bottom:8px;">' +
            '<i class="fa-solid fa-palette"></i> מלאי צבעים ופלטות</div>' +
        _helpBox(
            'הצבעים השוטפים שלכם — מופיעים בראש רשימת הצבעים במעצב. ' +
            'לכל צבע מגדירים <b>מחיר פלטה מלאה</b> ומידות (מ״מ). ' +
            'בשיטת חומרים במעצב: העלות נספרת לפי כמה פלטות כאלה נצרכו בקינון.',
            'info'
        ) +
        _helpBox(
            '<b>דוגמה:</b> לבן מט — פלטה 2750×1220 ב־450 ₪. EGGER — לרוב 2800×2070 (מידה גדולה יותר). ' +
            'הוסיפו מהקטלוג (מערכת / EGGER / פורמקס / בלורן / טמבור) או ידנית, מלאו מחיר, ושמרו.',
            'ex'
        ) +
        '<div id="' + _id('stock-list') + '"></div>' +
        '<div id="' + _id('stock-add-form') + '" style="display:none;flex-direction:column;gap:10px;' +
            'margin-top:12px;padding:12px 14px;background:#f8fafc;' +
            'border:1px dashed rgba(37,99,235,.35);border-radius:10px;">' +
            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">' +
                '<div style="display:flex;flex-direction:column;gap:4px;">' +
                    '<label style="font-size:.72rem;font-weight:700;color:var(--muted);">מפתח צבע (מהקטלוג)</label>' +
                    '<input id="' + _id('stock-add-key') + '" type="text" placeholder="למשל white_matte או eg_H330" ' +
                        'style="height:36px;border:1.5px solid var(--border);border-radius:8px;padding:0 10px;' +
                        'font-family:inherit;font-size:.85rem;direction:ltr;text-align:left;" ' +
                        'onkeydown="if(event.key===\'Enter\'){event.preventDefault();PricingPanel.confirmAddStockMaterial();}">' +
                '</div>' +
                '<div style="display:flex;flex-direction:column;gap:4px;">' +
                    '<label style="font-size:.72rem;font-weight:700;color:var(--muted);">שם לתצוגה (אופציונלי)</label>' +
                    '<input id="' + _id('stock-add-label') + '" type="text" placeholder="שם בעברית" ' +
                        'style="height:36px;border:1.5px solid var(--border);border-radius:8px;padding:0 10px;' +
                        'font-family:inherit;font-size:.85rem;direction:rtl;text-align:right;" ' +
                        'onkeydown="if(event.key===\'Enter\'){event.preventDefault();PricingPanel.confirmAddStockMaterial();}">' +
                '</div>' +
            '</div>' +
            '<div style="display:flex;gap:8px;flex-wrap:wrap;">' +
                '<button type="button" onclick="PricingPanel.confirmAddStockMaterial()" ' +
                    'style="display:inline-flex;align-items:center;gap:6px;padding:8px 16px;' +
                    'background:var(--primary,#1e3a5f);color:#fff;border:none;border-radius:8px;' +
                    'font-size:.82rem;font-weight:700;cursor:pointer;font-family:inherit;">' +
                    '<i class="fa-solid fa-check"></i> הוסף</button>' +
                '<button type="button" onclick="PricingPanel.cancelAddStockMaterial()" ' +
                    'style="display:inline-flex;align-items:center;gap:6px;padding:8px 14px;' +
                    'background:#fff;color:var(--text);border:1px solid var(--border);border-radius:8px;' +
                    'font-size:.82rem;font-weight:600;cursor:pointer;font-family:inherit;">ביטול</button>' +
            '</div>' +
            '<div id="' + _id('stock-add-err') + '" style="display:none;font-size:.78rem;color:#dc2626;"></div>' +
        '</div>' +
        '<div id="' + _id('stock-add-btns') + '" style="display:flex;flex-wrap:wrap;gap:8px;margin-top:10px;">' +
            '<button type="button" id="' + _id('stock-add-btn') + '" onclick="PricingPanel.addStockMaterial()" ' +
                'style="display:inline-flex;align-items:center;gap:6px;padding:8px 16px;' +
                'background:rgba(37,99,235,.08);border:1.5px solid rgba(37,99,235,.25);' +
                'color:#2563eb;border-radius:10px;font-size:.82rem;font-weight:600;cursor:pointer;' +
                'font-family:inherit;">' +
                '<i class="fa-solid fa-plus"></i> הוסף ידנית</button>' +
            '<button type="button" id="' + _id('stock-catalog-btn') + '" onclick="PricingPanel.openStockCatalog()" ' +
                'style="display:inline-flex;align-items:center;gap:6px;padding:8px 16px;' +
                'background:var(--primary,#1e3a5f);border:none;color:#fff;border-radius:10px;' +
                'font-size:.82rem;font-weight:700;cursor:pointer;font-family:inherit;">' +
                '<i class="fa-solid fa-swatchbook"></i> מהקטלוג</button>' +
        '</div>' +
    '</div>';
}

function _hingeTypesHtml() {
    var body =
        _helpBox(
            'סוגי צירים (שם + עלות ליחידה). בפרויקט בוחרים סוג; הכמות לפי גובה הדלת — כמו בכללי CNC ' +
            '(למשל עד 90 ס״מ ≈ 2 צירים, עד 160 ≈ 3, וכן הלאה).',
            'info'
        ) +
        _helpBox(
            '<b>דוגמה:</b> ציר טריקה שקטה 25 ₪, דלת בגובה 200 ס״מ → 4 צירים → 100 ₪ לעלה. שתי דלתות = 200 ₪.',
            'ex'
        ) +
        '<div id="' + _id('hinge-types-list') + '"></div>' +
        '<button type="button" onclick="PricingPanel.addHingeType()" ' +
            'style="display:inline-flex;align-items:center;gap:6px;padding:8px 16px;margin-top:10px;' +
            'background:rgba(37,99,235,.08);border:1.5px solid rgba(37,99,235,.25);' +
            'color:#2563eb;border-radius:10px;font-size:.82rem;font-weight:600;cursor:pointer;' +
            'font-family:inherit;">' +
            '<i class="fa-solid fa-plus"></i> הוסף סוג ציר</button>';
    return _detailsCard('צירים', 'fa-screwdriver-wrench', body, true);
}

function _customExtrasHtml() {
    var body =
        _helpBox(
            'מוצרים משלכם (שם + עלות ליחידה) — מופיעים במחשבון הצעות מחיר, ' +
            'נוספים לעלות ומוכפלים ברווח כמו שאר התוספות.',
            'info'
        ) +
        _helpBox(
            '<b>דוגמה:</b> «תוספת התקנה מיוחדת» 300 ₪ × כמות 1 → +300 לעלות → × 1.8 = +540 במחיר ללקוח.',
            'ex'
        ) +
        '<div id="' + _id('custom-extras-list') + '"></div>' +
        '<button type="button" onclick="PricingPanel.addCustomExtra()" ' +
            'style="display:inline-flex;align-items:center;gap:6px;padding:8px 16px;margin-top:10px;' +
            'background:rgba(37,99,235,.08);border:1.5px solid rgba(37,99,235,.25);' +
            'color:#2563eb;border-radius:10px;font-size:.82rem;font-weight:600;cursor:pointer;' +
            'font-family:inherit;">' +
            '<i class="fa-solid fa-plus"></i> הוסף תוספת</button>';
    return _detailsCard('תוספות אישיות', 'fa-tags', body, false);
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
    var stockHint = _el('materials-stock-hint');
    if (stockHint) stockHint.style.display = (mode === 'materials') ? 'block' : 'none';

    var prevMat = _el('prev-mat');
    if (prevMat) prevMat.style.display = (mode === 'materials') ? '' : 'none';
    var prevMel = _el('prev-mel');
    if (prevMel) prevMel.style.display = (mode === 'materials') ? 'none' : '';

    // Update preview type select options (filtered to non-sliding for non-ranges modes)
    _refreshPreviewTypeSelect();
    _refreshPreviewMatSelect();
    updatePreview();
}

// ── cabinet types ─────────────────────────────────────────────────────────────
var _ENGINES = [
    { id: 'maya', label: 'צוקל נסתר' }, { id: 'c9', label: 'צוקל רגיל' },
    { id: 'regalim', label: 'ארון על רגליים' }, { id: 'custom_size', label: 'ארון לפי מידה' },
    { id: 'sliding', label: 'ארון הזזה' },
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

// ── stock materials (color + full sheet price) ───────────────────────────────
function _renderStockMaterials() {
    var list = _el('stock-list');
    if (!list) return;
    var defW = (PC && PC.DEFAULT_SHEET_W) || 2750;
    var defH = (PC && PC.DEFAULT_SHEET_H) || 1220;
    if (!_stockMaterials.length) {
        list.innerHTML = '<div style="font-size:.8rem;color:var(--muted);padding:6px 0 4px;">' +
            'עדיין אין צבעי מלאי — הוסיפו כאן או מהמעצב.</div>';
        _refreshPreviewMatSelect();
        return;
    }
    var head =
        '<div class="pnl-stock-head" aria-hidden="true" ' +
            'style="display:grid;grid-template-columns:28px 1fr 100px 72px 72px 32px;gap:8px;align-items:end;' +
            'padding:0 0 6px;margin-bottom:2px;border-bottom:1px solid var(--border);">' +
            '<span></span>' +
            '<span style="font-size:.68rem;font-weight:700;color:var(--muted);">שם צבע</span>' +
            '<span style="font-size:.68rem;font-weight:700;color:var(--muted);text-align:center;">מחיר פלטה (₪)</span>' +
            '<span style="font-size:.68rem;font-weight:700;color:var(--muted);text-align:center;">רוחב מ״מ</span>' +
            '<span style="font-size:.68rem;font-weight:700;color:var(--muted);text-align:center;">גובה מ״מ</span>' +
            '<span></span>' +
        '</div>';
    list.innerHTML = head + _stockMaterials.map(function(item) {
        var swatch = item.img
            ? 'background-image:url(\'' + _esc(item.img) + '\');background-size:cover;'
            : ('background:' + _esc(item.hex || '#e2e8f0') + ';');
        return '<div class="pnl-stock-row" data-key="' + _esc(item.key) + '" ' +
            'style="display:grid;grid-template-columns:28px 1fr 100px 72px 72px auto;gap:8px;align-items:center;' +
            'padding:8px 0;border-bottom:1px solid var(--border);">' +
            '<span style="width:28px;height:28px;border-radius:6px;border:1px solid #cbd5e1;' + swatch + '" title="דגימת צבע"></span>' +
            '<div style="min-width:0;">' +
                '<label class="pnl-sr-only" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0);">שם צבע</label>' +
                '<input type="text" class="pnl-stock-label" value="' + _esc(item.label || '') + '" ' +
                    'placeholder="שם לתצוגה" maxlength="80" aria-label="שם צבע" ' +
                    'style="width:100%;height:34px;border:1.5px solid var(--border);border-radius:8px;padding:0 10px;' +
                    'font-family:inherit;font-size:.82rem;direction:rtl;text-align:right;box-sizing:border-box;">' +
                '<div style="font-size:.68rem;color:var(--muted);margin-top:2px;font-family:monospace;direction:ltr;text-align:left;">' +
                    _esc(item.key) + (item.brand ? (' · ' + _esc(item.brand)) : '') + '</div>' +
            '</div>' +
            '<input type="number" class="pnl-stock-price" value="' + _num(item.sheetPrice, 0) + '" min="0" step="10" ' +
                'title="מחיר פלטה מלאה (₪)" placeholder="₪" aria-label="מחיר פלטה בשקלים" ' +
                'style="height:34px;border:1.5px solid var(--border);border-radius:8px;padding:0 8px;' +
                'font-family:inherit;font-size:.82rem;direction:ltr;text-align:right;">' +
            '<input type="number" class="pnl-stock-w" value="' + _num(item.sheetW, defW) + '" min="100" step="10" ' +
                'title="רוחב פלטה מ\"מ" placeholder="רוחב" aria-label="רוחב פלטה במ\"מ" ' +
                'style="height:34px;border:1.5px solid var(--border);border-radius:8px;padding:0 6px;' +
                'font-family:inherit;font-size:.8rem;direction:ltr;text-align:right;">' +
            '<input type="number" class="pnl-stock-h" value="' + _num(item.sheetH, defH) + '" min="100" step="10" ' +
                'title="גובה פלטה מ\"מ" placeholder="גובה" aria-label="גובה פלטה במ\"מ" ' +
                'style="height:34px;border:1.5px solid var(--border);border-radius:8px;padding:0 6px;' +
                'font-family:inherit;font-size:.8rem;direction:ltr;text-align:right;">' +
            '<button type="button" onclick="PricingPanel._deleteStockMaterial(this)" title="הסר מהמלאי" aria-label="הסר מהמלאי" ' +
                'style="width:32px;height:32px;border-radius:8px;border:none;background:#fee2e2;' +
                'color:#ef4444;cursor:pointer;font-size:.85rem;">✕</button>' +
        '</div>';
    }).join('');
    _refreshPreviewMatSelect();
}

function _stockAddErr(msg) {
    var el = _el('stock-add-err');
    if (!el) return;
    if (!msg) { el.style.display = 'none'; el.textContent = ''; return; }
    el.style.display = 'block';
    el.textContent = msg;
}

function addStockMaterial() {
    var form = _el('stock-add-form');
    var btns = _el('stock-add-btns');
    if (!form) return;
    form.style.display = 'flex';
    if (btns) btns.style.display = 'none';
    _stockAddErr('');
    var keyInp = _el('stock-add-key');
    var labelInp = _el('stock-add-label');
    if (keyInp) keyInp.value = '';
    if (labelInp) labelInp.value = '';
    if (keyInp) setTimeout(function() { keyInp.focus(); }, 0);
}

function cancelAddStockMaterial() {
    var form = _el('stock-add-form');
    var btns = _el('stock-add-btns');
    if (form) form.style.display = 'none';
    if (btns) btns.style.display = 'flex';
    _stockAddErr('');
}

function _pushStockItem(item) {
    if (!item || !item.key) return false;
    var key = String(item.key).trim();
    if (!key) return false;
    if (_stockMaterials.some(function(x) { return x.key === key; })) return false;
    var sz = (PC && typeof PC.sheetSizeForMat === 'function')
        ? PC.sheetSizeForMat(key)
        : { w: (PC && PC.DEFAULT_SHEET_W) || 2750, h: (PC && PC.DEFAULT_SHEET_H) || 1220, brand: '' };
    var label = String(item.label || '').trim();
    if (!label && typeof window !== 'undefined' && window.colorNamesHebrew && window.colorNamesHebrew[key]) {
        label = window.colorNamesHebrew[key];
    }
    var row = {
        key: key,
        label: label || key,
        brand: item.brand || sz.brand || '',
        sheetPrice: _num(item.sheetPrice, 0),
        sheetW: _num(item.sheetW, 0) || sz.w,
        sheetH: _num(item.sheetH, 0) || sz.h
    };
    if (item.hex) row.hex = item.hex;
    if (item.img) row.img = item.img;
    _stockMaterials.push(row);
    return true;
}

function confirmAddStockMaterial() {
    _syncStockMaterialsFromDom();
    var keyInp = _el('stock-add-key');
    var labelInp = _el('stock-add-label');
    var key = keyInp ? String(keyInp.value || '').trim() : '';
    var label = labelInp ? String(labelInp.value || '').trim() : '';
    if (!key) {
        _stockAddErr('נא להזין מפתח צבע מהקטלוג (למשל white_matte).');
        if (keyInp) keyInp.focus();
        return;
    }
    if (_stockMaterials.some(function(x) { return x.key === key; })) {
        _stockAddErr('הצבע כבר במלאי.');
        return;
    }
    _pushStockItem({ key: key, label: label });
    cancelAddStockMaterial();
    _renderStockMaterials();
    updatePreview();
    var list = _el('stock-list');
    if (list) {
        var rows = list.querySelectorAll('.pnl-stock-row');
        var last = rows[rows.length - 1];
        var priceEl = last && last.querySelector('.pnl-stock-price');
        if (priceEl) priceEl.focus();
    }
}

// ── stock catalog picker (all brands) ────────────────────────────────────────
var _catBrand = 'system';
var _catSub = 'all';
var _catQuery = '';
var _catCache = {};
var _catFiltered = [];
var _catRendered = 0;
var _catPage = 72;
var _catLoading = false;

var _SYSTEM_COLORS = [
    { key: 'white_matte', label: 'לבן מט 2100', hex: '#f7f7f7', brand: 'system', cat: 'solids' },
    { key: 'c3110', label: '3110', hex: '#f0ede9', brand: 'system', cat: 'solids' },
    { key: 'c795', label: '759', hex: '#ece0d4', brand: 'system', cat: 'solids' },
    { key: 'c705', label: '705', hex: '#dbd6c6', brand: 'system', cat: 'solids' },
    { key: 'c3207', label: '3207', hex: '#F7ECD9', brand: 'system', cat: 'solids' },
    { key: 'black_matte', label: 'שחור מט', hex: '#2a2a2a', brand: 'system', cat: 'solids' },
    { key: '2020', label: '2020', img: 'textures/2020.jpg', brand: 'system', cat: 'textures' },
    { key: '2024', label: '2024', img: 'textures/2024.jpg', brand: 'system', cat: 'textures' },
    { key: 'A427', label: 'A427', img: 'textures/A427.jpg?v=20260914fix', brand: 'system', cat: 'textures' },
    { key: '2025', label: '2025', img: 'textures/2025.jpg', brand: 'system', cat: 'textures' },
    { key: '2040', label: '2040', img: 'textures/2040.jpg', brand: 'system', cat: 'textures' },
    { key: '2041', label: '2041', img: 'textures/2041.jpg', brand: 'system', cat: 'textures' },
    { key: '2044', label: '2044', img: 'textures/2044.jpg', brand: 'system', cat: 'textures' },
    { key: '2047', label: '2047', img: 'textures/2047.jpg', brand: 'system', cat: 'textures' },
    { key: '2049', label: '2049', img: 'textures/2049.jpg', brand: 'system', cat: 'textures' },
    { key: '2062', label: '2062', img: 'textures/2062.jpg', brand: 'system', cat: 'textures' },
    { key: '5600', label: '5600', img: 'textures/5600.jpg', brand: 'system', cat: 'textures' },
    { key: '7180', label: '7180', img: 'textures/7180.jpg', brand: 'system', cat: 'textures' },
    { key: '456', label: '456', img: 'textures/456.jpg', brand: 'system', cat: 'textures' },
    { key: '462', label: '462', img: 'textures/462.jpg', brand: 'system', cat: 'textures' },
    { key: '463', label: '463', img: 'textures/463.jpg', brand: 'system', cat: 'textures' },
    { key: '464', label: '464', img: 'textures/464.jpg', brand: 'system', cat: 'textures' },
    { key: '480', label: '480', img: 'textures/480.jpg', brand: 'system', cat: 'textures' }
];

function _sanitizeMatId(id) {
    return String(id || '').replace(/[^a-zA-Z0-9]/g, '_');
}

function _brandMatKey(brand, id) {
    if (brand === 'formex') return 'formex_' + _sanitizeMatId(id);
    if (brand === 'bluran') return 'bluran_' + _sanitizeMatId(id);
    if (brand === 'tambour') return 'tambour_' + _sanitizeMatId(id);
    return String(id || '');
}

function _parseCsvLine(line) {
    var result = [], current = '', inQuotes = false, i, ch;
    for (i = 0; i < line.length; i++) {
        ch = line[i];
        if (ch === '"') inQuotes = !inQuotes;
        else if (ch === ',' && !inQuotes) { result.push(current.trim()); current = ''; }
        else current += ch;
    }
    result.push(current.trim());
    return result;
}

function _flattenBrandCatalog(data, brand) {
    var list = [];
    (data.categories || []).forEach(function(cat) {
        (cat.items || []).forEach(function(it) {
            if (!it || !it.id) return;
            list.push({
                key: _brandMatKey(brand, it.id),
                id: it.id,
                label: it.name || it.id,
                hex: it.hex || null,
                img: it.img || null,
                brand: brand,
                cat: cat.id || 'all',
                catName: cat.name || ''
            });
        });
    });
    return list;
}

function _eggerCatalogItems() {
    var src = (global.EGGER_ALL_COLORS && global.EGGER_ALL_COLORS.length)
        ? global.EGGER_ALL_COLORS
        : [];
    return src.map(function(c) {
        return {
            key: c.key,
            id: c.code || c.key,
            label: 'EGGER ' + (c.code || c.label || c.key),
            hex: c.hex || null,
            img: c.img || null,
            brand: 'egger',
            cat: 'all',
            catName: 'EGGER'
        };
    });
}

function _ensureCatModal() {
    var existing = document.getElementById('pnl-stock-catalog-modal');
    if (existing) return existing;
    var modal = document.createElement('div');
    modal.id = 'pnl-stock-catalog-modal';
    modal.className = 'pnl-cat-overlay';
    modal.innerHTML =
        '<div class="pnl-cat-dialog" role="dialog" aria-modal="true" aria-labelledby="pnl-cat-title">' +
            '<div class="pnl-cat-header">' +
                '<div class="pnl-cat-header-main">' +
                    '<h2 id="pnl-cat-title">קטלוג צבעים למלאי</h2>' +
                    '<p id="pnl-cat-count">בחרו חברה וצבע להוספה</p>' +
                '</div>' +
                '<div class="pnl-cat-search-wrap">' +
                    '<input type="search" id="pnl-cat-search" placeholder="חיפוש לפי שם או קוד..." autocomplete="off">' +
                '</div>' +
                '<button type="button" class="pnl-cat-close" id="pnl-cat-close" aria-label="סגור">✕</button>' +
            '</div>' +
            '<div class="pnl-cat-brands" id="pnl-cat-brands" role="tablist"></div>' +
            '<div class="pnl-cat-subs" id="pnl-cat-subs"></div>' +
            '<div class="pnl-cat-body" id="pnl-cat-body">' +
                '<div class="pnl-cat-grid" id="pnl-cat-grid"></div>' +
            '</div>' +
            '<div class="pnl-cat-footer">' +
                '<span id="pnl-cat-added-note" class="pnl-cat-added-note"></span>' +
                '<button type="button" class="pnl-cat-done" id="pnl-cat-done">סגור</button>' +
            '</div>' +
        '</div>';
    document.body.appendChild(modal);

    modal.addEventListener('click', function(e) {
        if (e.target === modal) closeStockCatalog();
    });
    document.getElementById('pnl-cat-close').addEventListener('click', closeStockCatalog);
    document.getElementById('pnl-cat-done').addEventListener('click', closeStockCatalog);
    document.getElementById('pnl-cat-search').addEventListener('input', function(e) {
        _catQuery = String(e.target.value || '');
        _applyCatFilter();
    });
    document.getElementById('pnl-cat-body').addEventListener('scroll', function() {
        var body = document.getElementById('pnl-cat-body');
        if (!body) return;
        if (body.scrollTop + body.clientHeight >= body.scrollHeight - 120) {
            if (_catRendered < _catFiltered.length) _renderCatBatch();
        }
    });
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && modal.classList.contains('active')) closeStockCatalog();
    });
    return modal;
}

function _renderCatBrands() {
    var el = document.getElementById('pnl-cat-brands');
    if (!el) return;
    var brands = [
        { id: 'system', label: 'מערכת' },
        { id: 'egger', label: 'EGGER' },
        { id: 'formex', label: 'פורמקס' },
        { id: 'bluran', label: 'בלורן' },
        { id: 'tambour', label: 'טמבור' }
    ];
    el.innerHTML = brands.map(function(b) {
        return '<button type="button" class="pnl-cat-brand' + (_catBrand === b.id ? ' active' : '') +
            '" data-brand="' + b.id + '">' + _esc(b.label) + '</button>';
    }).join('');
    el.querySelectorAll('.pnl-cat-brand').forEach(function(btn) {
        btn.addEventListener('click', function() {
            _catBrand = btn.getAttribute('data-brand');
            _catSub = 'all';
            _catQuery = '';
            var search = document.getElementById('pnl-cat-search');
            if (search) search.value = '';
            _renderCatBrands();
            _loadCatBrand();
        });
    });
}

function _renderCatSubs(categories) {
    var el = document.getElementById('pnl-cat-subs');
    if (!el) return;
    var cats = categories || [];
    if (!cats.length) {
        el.innerHTML = '';
        el.style.display = 'none';
        return;
    }
    el.style.display = 'flex';
    var tabs = [{ id: 'all', name: 'הכל' }].concat(cats);
    el.innerHTML = tabs.map(function(t) {
        return '<button type="button" class="pnl-cat-sub' + (_catSub === t.id ? ' active' : '') +
            '" data-sub="' + _esc(t.id) + '">' + _esc(t.name) + '</button>';
    }).join('');
    el.querySelectorAll('.pnl-cat-sub').forEach(function(btn) {
        btn.addEventListener('click', function() {
            _catSub = btn.getAttribute('data-sub') || 'all';
            _renderCatSubs(cats);
            _applyCatFilter();
        });
    });
}

function _setCatCount(text) {
    var el = document.getElementById('pnl-cat-count');
    if (el) el.textContent = text;
}

function _setCatNote(msg) {
    var el = document.getElementById('pnl-cat-added-note');
    if (!el) return;
    el.textContent = msg || '';
}

function _inStock(key) {
    return (_stockMaterials || []).some(function(x) { return x && x.key === key; });
}

function _applyCatFilter() {
    var items = (_catCache[_catBrand] && _catCache[_catBrand].items) || [];
    var q = String(_catQuery || '').toLowerCase().trim();
    _catFiltered = items.filter(function(it) {
        if (_catSub !== 'all' && it.cat && it.cat !== _catSub) return false;
        if (!q) return true;
        return String(it.label || '').toLowerCase().indexOf(q) >= 0 ||
            String(it.id || '').toLowerCase().indexOf(q) >= 0 ||
            String(it.key || '').toLowerCase().indexOf(q) >= 0 ||
            String(it.catName || '').toLowerCase().indexOf(q) >= 0;
    });
    var grid = document.getElementById('pnl-cat-grid');
    if (grid) grid.innerHTML = '';
    _catRendered = 0;
    _setCatCount('נמצאו ' + _catFiltered.length + ' גוונים' +
        (items.length ? (' · ' + items.length + ' בקטלוג') : ''));
    _renderCatBatch();
}

function _renderCatBatch() {
    var grid = document.getElementById('pnl-cat-grid');
    if (!grid) return;
    var batch = _catFiltered.slice(_catRendered, _catRendered + _catPage);
    batch.forEach(function(it) {
        var inStock = _inStock(it.key);
        var card = document.createElement('button');
        card.type = 'button';
        card.className = 'pnl-cat-card' + (inStock ? ' in-stock' : '');
        card.setAttribute('data-key', it.key);
        var swatch = it.img
            ? 'background-image:url(\'' + _esc(it.img) + '\');background-size:cover;background-position:center;'
            : ('background-color:' + _esc(it.hex || '#cbd5e1') + ';');
        card.innerHTML =
            '<span class="pnl-cat-swatch" style="' + swatch + '"></span>' +
            '<span class="pnl-cat-meta">' +
                '<span class="pnl-cat-id">' + _esc(it.id || it.key) + '</span>' +
                '<span class="pnl-cat-name">' + _esc(it.label || '') + '</span>' +
                (it.catName ? ('<span class="pnl-cat-cat">' + _esc(it.catName) + '</span>') : '') +
            '</span>' +
            '<span class="pnl-cat-badge">' + (inStock ? 'במלאי' : 'הוסף') + '</span>';
        card.addEventListener('click', function() {
            _toggleCatalogColor(it, card);
        });
        grid.appendChild(card);
    });
    _catRendered += batch.length;
}

function _toggleCatalogColor(it, card) {
    _syncStockMaterialsFromDom();
    if (_inStock(it.key)) {
        _stockMaterials = _stockMaterials.filter(function(x) { return x.key !== it.key; });
        if (card) {
            card.classList.remove('in-stock');
            var badge = card.querySelector('.pnl-cat-badge');
            if (badge) badge.textContent = 'הוסף';
        }
        _setCatNote('הוסר מהמלאי: ' + (it.label || it.key));
    } else {
        _pushStockItem({
            key: it.key,
            label: it.label || it.id || it.key,
            brand: it.brand || '',
            hex: it.hex || null,
            img: it.img || null
        });
        if (card) {
            card.classList.add('in-stock');
            var badge2 = card.querySelector('.pnl-cat-badge');
            if (badge2) badge2.textContent = 'במלאי';
        }
        _setCatNote('נוסף למלאי: ' + (it.label || it.key));
    }
    _renderStockMaterials();
    updatePreview();
}

function _loadCatBrand() {
    var brand = _catBrand;
    if (_catCache[brand] && _catCache[brand].items) {
        _renderCatSubs(_catCache[brand].categories || []);
        _applyCatFilter();
        return;
    }
    _setCatCount('טוען קטלוג...');
    var grid = document.getElementById('pnl-cat-grid');
    if (grid) grid.innerHTML = '<div class="pnl-cat-loading">טוען...</div>';
    _catLoading = true;

    function done(items, categories) {
        _catCache[brand] = { items: items || [], categories: categories || [] };
        _catLoading = false;
        _renderCatSubs(categories || []);
        _applyCatFilter();
    }

    if (brand === 'system') {
        var sys = _SYSTEM_COLORS.map(function(c) {
            return {
                key: c.key, id: c.key, label: c.label, hex: c.hex || null, img: c.img || null,
                brand: 'system', cat: c.cat || 'all',
                catName: c.cat === 'textures' ? 'טקסטורות' : 'גוונים חלקים'
            };
        });
        done(sys, [
            { id: 'solids', name: 'גוונים חלקים' },
            { id: 'textures', name: 'טקסטורות' }
        ]);
        return;
    }

    if (brand === 'egger') {
        done(_eggerCatalogItems(), []);
        return;
    }

    if (brand === 'formex' || brand === 'bluran') {
        var url = brand === 'formex'
            ? 'color%20picker/formex_catalog.json'
            : 'color%20picker/bluran_catalog.json';
        fetch(url).then(function(r) { return r.json(); }).then(function(data) {
            var cats = (data.categories || []).map(function(c) {
                return { id: c.id, name: c.name };
            });
            done(_flattenBrandCatalog(data, brand), cats);
        }).catch(function(err) {
            console.error('[stock-catalog]', brand, err);
            _catLoading = false;
            _setCatCount('שגיאה בטעינת הקטלוג');
            if (grid) grid.innerHTML = '<div class="pnl-cat-loading">לא ניתן לטעון את הקטלוג</div>';
        });
        return;
    }

    if (brand === 'tambour') {
        fetch('color%20picker/tambour_full_colors_1651.csv').then(function(r) { return r.text(); }).then(function(text) {
            var lines = text.split(/\r?\n/).filter(Boolean);
            var items = [];
            for (var i = 1; i < lines.length; i++) {
                var cols = _parseCsvLine(lines[i]);
                if (cols.length < 4) continue;
                var name = cols[0], id = cols[1], hex = cols[3];
                if (!id || !hex) continue;
                items.push({
                    key: _brandMatKey('tambour', id),
                    id: id,
                    label: name || id,
                    hex: hex,
                    img: null,
                    brand: 'tambour',
                    cat: 'all',
                    catName: 'טמבור'
                });
            }
            done(items, []);
        }).catch(function(err) {
            console.error('[stock-catalog] tambour', err);
            _catLoading = false;
            _setCatCount('שגיאה בטעינת הקטלוג');
            if (grid) grid.innerHTML = '<div class="pnl-cat-loading">לא ניתן לטעון את הקטלוג</div>';
        });
    }
}

function openStockCatalog() {
    cancelAddStockMaterial();
    var modal = _ensureCatModal();
    _catBrand = _catBrand || 'system';
    _catSub = 'all';
    _catQuery = '';
    _setCatNote('');
    _renderCatBrands();
    var search = document.getElementById('pnl-cat-search');
    if (search) search.value = '';
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
    _loadCatBrand();
    if (search) setTimeout(function() { search.focus(); }, 50);
}

function closeStockCatalog() {
    var modal = document.getElementById('pnl-stock-catalog-modal');
    if (modal) modal.classList.remove('active');
    document.body.style.overflow = '';
    _renderStockMaterials();
    updatePreview();
}

function _deleteStockMaterial(btn) {
    var row = btn && btn.closest ? btn.closest('.pnl-stock-row') : null;
    if (!row) return;
    var key = row.getAttribute('data-key');
    _syncStockMaterialsFromDom();
    _stockMaterials = _stockMaterials.filter(function(x) { return x.key !== key; });
    _renderStockMaterials();
    updatePreview();
}

function _syncStockMaterialsFromDom() {
    var list = _el('stock-list');
    if (!list) return;
    var next = [];
    list.querySelectorAll('.pnl-stock-row').forEach(function(row) {
        var key = row.getAttribute('data-key');
        if (!key) return;
        var prev = _stockMaterials.find(function(x) { return x.key === key; }) || {};
        var labelEl = row.querySelector('.pnl-stock-label');
        var priceEl = row.querySelector('.pnl-stock-price');
        var wEl = row.querySelector('.pnl-stock-w');
        var hEl = row.querySelector('.pnl-stock-h');
        var rowOut = {
            key: key,
            label: labelEl ? String(labelEl.value || '').trim() || key : key,
            brand: prev.brand || '',
            sheetPrice: _num(priceEl ? priceEl.value : 0, 0),
            sheetW: _num(wEl ? wEl.value : ((PC && PC.DEFAULT_SHEET_W) || 2750), (PC && PC.DEFAULT_SHEET_W) || 2750),
            sheetH: _num(hEl ? hEl.value : ((PC && PC.DEFAULT_SHEET_H) || 1220), (PC && PC.DEFAULT_SHEET_H) || 1220)
        };
        if (prev.hex) rowOut.hex = prev.hex;
        if (prev.img) rowOut.img = prev.img;
        next.push(rowOut);
    });
    _stockMaterials = next;
}

// ── hinge types (name + unit cost) ───────────────────────────────────────────
function _renderHingeTypes() {
    var list = _el('hinge-types-list');
    if (!list) return;
    if (!_hingeTypes.length) {
        list.innerHTML = '<div style="font-size:.8rem;color:var(--muted);padding:6px 0 4px;">' +
            'עדיין אין סוגי צירים — לחצו על "הוסף סוג ציר".</div>';
        return;
    }
    list.innerHTML = _hingeTypes.map(function(item) {
        return '<div class="pnl-ht-row" data-id="' + _esc(item.id) + '" ' +
            'style="display:grid;grid-template-columns:1fr 120px auto;gap:10px;align-items:center;' +
            'padding:8px 0;border-bottom:1px solid var(--border);">' +
            '<input type="text" class="pnl-ht-name" value="' + _esc(item.name || '') + '" ' +
                'placeholder="שם סוג הציר (למשל: טריקה שקטה)" maxlength="80" ' +
                'style="height:36px;border:1.5px solid var(--border);border-radius:8px;padding:0 12px;' +
                'font-family:inherit;font-size:.85rem;direction:rtl;text-align:right;">' +
            '<input type="number" class="pnl-ht-price" value="' + _num(item.price, 0) + '" ' +
                'min="0" step="1" title="עלות לציר אחד (₪)" ' +
                'style="height:36px;border:1.5px solid var(--border);border-radius:8px;padding:0 10px;' +
                'font-family:inherit;font-size:.85rem;direction:ltr;text-align:right;">' +
            '<button type="button" onclick="PricingPanel._deleteHingeType(this)" title="מחק" ' +
                'style="width:34px;height:34px;border-radius:8px;border:none;background:#fee2e2;' +
                'color:#ef4444;cursor:pointer;font-size:.9rem;display:flex;align-items:center;' +
                'justify-content:center;">✕</button>' +
        '</div>';
    }).join('');
}

function addHingeType() {
    _syncHingeTypesFromDom();
    _hingeTypes.push({ id: 'hinge_' + Date.now(), name: '', price: 0 });
    _renderHingeTypes();
    var list = _el('hinge-types-list');
    if (list) {
        var inputs = list.querySelectorAll('.pnl-ht-name');
        if (inputs.length) inputs[inputs.length - 1].focus();
    }
}

function _deleteHingeType(btn) {
    var row = btn && btn.closest ? btn.closest('.pnl-ht-row') : null;
    if (!row) return;
    var id = row.getAttribute('data-id');
    _syncHingeTypesFromDom();
    _hingeTypes = _hingeTypes.filter(function(x) { return x.id !== id; });
    _renderHingeTypes();
}

function _syncHingeTypesFromDom() {
    var list = _el('hinge-types-list');
    if (!list) return;
    var next = [];
    list.querySelectorAll('.pnl-ht-row').forEach(function(row) {
        var id = row.getAttribute('data-id') || ('hinge_' + Date.now());
        var nameEl = row.querySelector('.pnl-ht-name');
        var priceEl = row.querySelector('.pnl-ht-price');
        next.push({
            id: id,
            name: nameEl ? String(nameEl.value || '').trim() : '',
            price: _num(priceEl ? priceEl.value : 0, 0)
        });
    });
    _hingeTypes = next;
}

// ── custom extras (name + unit cost) ─────────────────────────────────────────
function _renderCustomExtras() {
    var list = _el('custom-extras-list');
    if (!list) return;
    if (!_customExtras.length) {
        list.innerHTML = '<div style="font-size:.8rem;color:var(--muted);padding:6px 0 4px;">' +
            'עדיין אין תוספות אישיות — לחצו על "הוסף תוספת".</div>';
        return;
    }
    list.innerHTML = _customExtras.map(function(item) {
        return '<div class="pnl-cx-row" data-id="' + _esc(item.id) + '" ' +
            'style="display:grid;grid-template-columns:1fr 120px auto;gap:10px;align-items:center;' +
            'padding:8px 0;border-bottom:1px solid var(--border);">' +
            '<input type="text" class="pnl-cx-name" value="' + _esc(item.name || '') + '" ' +
                'placeholder="שם המוצר / התוספת" maxlength="80" ' +
                'style="height:36px;border:1.5px solid var(--border);border-radius:8px;padding:0 12px;' +
                'font-family:inherit;font-size:.85rem;direction:rtl;text-align:right;">' +
            '<input type="number" class="pnl-cx-price" value="' + _num(item.price, 0) + '" ' +
                'min="0" step="10" title="מחיר עלות ליחידה (₪)" ' +
                'style="height:36px;border:1.5px solid var(--border);border-radius:8px;padding:0 10px;' +
                'font-family:inherit;font-size:.85rem;direction:ltr;text-align:right;">' +
            '<button type="button" onclick="PricingPanel._deleteCustomExtra(this)" title="מחק" ' +
                'style="width:34px;height:34px;border-radius:8px;border:none;background:#fee2e2;' +
                'color:#ef4444;cursor:pointer;font-size:.9rem;display:flex;align-items:center;' +
                'justify-content:center;">✕</button>' +
        '</div>';
    }).join('');
}

function addCustomExtra() {
    _syncCustomExtrasFromDom();
    _customExtras.push({ id: 'cx_' + Date.now(), name: '', price: 0 });
    _renderCustomExtras();
    var list = _el('custom-extras-list');
    if (list) {
        var inputs = list.querySelectorAll('.pnl-cx-name');
        if (inputs.length) inputs[inputs.length - 1].focus();
    }
}

function _deleteCustomExtra(btn) {
    var row = btn && btn.closest ? btn.closest('.pnl-cx-row') : null;
    if (!row) return;
    var id = row.getAttribute('data-id');
    _syncCustomExtrasFromDom();
    _customExtras = _customExtras.filter(function(x) { return x.id !== id; });
    _renderCustomExtras();
}

function _syncCustomExtrasFromDom() {
    var list = _el('custom-extras-list');
    if (!list) return;
    var next = [];
    list.querySelectorAll('.pnl-cx-row').forEach(function(row) {
        var id = row.getAttribute('data-id') || ('cx_' + Date.now());
        var nameEl = row.querySelector('.pnl-cx-name');
        var priceEl = row.querySelector('.pnl-cx-price');
        next.push({
            id: id,
            name: nameEl ? String(nameEl.value || '').trim() : '',
            price: _num(priceEl ? priceEl.value : 0, 0)
        });
    });
    _customExtras = next;
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
        { id: 'custom_size', label: 'ארון לפי מידה', engine: 'custom_size', priceFactor: 0 },
        { id: 'sliding', label: 'ארון הזזה', engine: 'sliding', priceFactor: 0 }
    ];
    _renderCabinetTypes();
    if (PC && typeof PC.normalizeCustomExtras === 'function') {
        _customExtras = PC.normalizeCustomExtras(c.customExtras);
    } else {
        _customExtras = Array.isArray(c.customExtras) ? c.customExtras.map(function(x, i) {
            return {
                id: String((x && x.id) || ('cx_' + i)),
                name: String((x && x.name) || '').trim(),
                price: _num(x && x.price, 0)
            };
        }).filter(function(x) { return x.name; }) : [];
    }
    // Keep blank draft rows when editing? fill only keeps named items; empty drafts via Add.
    _renderCustomExtras();
    if (PC && typeof PC.normalizeHingeTypes === 'function') {
        _hingeTypes = PC.normalizeHingeTypes(c.hingeTypes);
        if (!_hingeTypes.length && !Array.isArray(c.hingeTypes)) {
            _hingeTypes = [
                { id: 'std', name: 'ציר רגיל', price: 0 },
                { id: 'soft', name: 'ציר טריקה שקטה', price: 0 }
            ];
        }
    } else if (Array.isArray(c.hingeTypes) && c.hingeTypes.length) {
        _hingeTypes = c.hingeTypes.map(function(x, i) {
            return {
                id: String((x && x.id) || ('hinge_' + i)),
                name: String((x && x.name) || '').trim(),
                price: _num(x && x.price, 0)
            };
        }).filter(function(x) { return x.name; });
    } else {
        _hingeTypes = [
            { id: 'std', name: 'ציר רגיל', price: 0 },
            { id: 'soft', name: 'ציר טריקה שקטה', price: 0 }
        ];
    }
    _renderHingeTypes();
    if (PC && typeof PC.normalizeStockMaterials === 'function') {
        _stockMaterials = PC.normalizeStockMaterials(c.stockMaterials);
    } else {
        _stockMaterials = Array.isArray(c.stockMaterials) ? c.stockMaterials.slice() : [];
    }
    _renderStockMaterials();
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
    _set('materialsMultiplier',    _num(c.materialsMultiplier, 1.4));
    _set('profitMultiplier',       _num(c.profitMultiplier, 1.8));
    _set('heightSurcharge',        _pct(_num(c.heightSurcharge, 0.20)));
    _set('depthSurchargeFromCm',   _num(c.depthSurchargeFromCm, 54));
    _set('depthSurcharge',         _pct(_num(c.depthSurcharge, 0.20)));
    _set('sandwichSurcharge',      _pct(_num(c.sandwichSurcharge, 0.15)));
    _set('installPricePerUnit',    _num(c.installPricePerUnit, 110));
    _set('installUnitCm',          _num(c.installUnitCm, 42.5));
    _set('installHeightSurcharge', _pct(_num(c.installHeightSurcharge, 0.20)));

    // extras
    _set('internalDrawer',  _num(ex.internalDrawer, dx.internalDrawer || 150));
    _set('externalDrawer',  _num(ex.externalDrawer, dx.externalDrawer || 200));
    _set('shoeDrawer',      _num(ex.shoeDrawer, dx.shoeDrawer || 150));
    _set('openCell',        _num(ex.openCell, dx.openCell || 400));
    _set('openCell34',      _num(ex.openCell34, dx.openCell34 || 600));
    _set('openCell5',       _num(ex.openCell5, dx.openCell5 || 800));
    _set('partition',       _num(ex.partition, dx.partition || 150));
    _set('shelfFreePerMeter',_num(ex.shelfFreePerMeter, dx.shelfFreePerMeter || 3));
    _set('extraShelfMel',   _num(ex.extraShelfMel, dx.extraShelfMel || 60));
    _set('extraShelfNonMel',_num(ex.extraShelfNonMel, dx.extraShelfNonMel || 80));
    _set('deskUnit',        _num(ex.deskUnit, dx.deskUnit || 900));
    _set('doorFramedMel',   _num(ex.doorFramedMel, dx.doorFramedMel || 80));
    _set('doorGlassMel',    _num(ex.doorGlassMel, dx.doorGlassMel || 400));
    _set('doorGlassBlack',  _num(ex.doorGlassBlack, dx.doorGlassBlack || 600));
    _set('doorMirror',      _num(ex.doorMirror, dx.doorMirror || 350));
    _set('deskMirror',      _num(ex.deskMirror, dx.deskMirror || 400));
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
    _set('customSizeMel',       _num(ex.customSizeMel, dx.customSizeMel != null ? dx.customSizeMel : 1200));
    _set('customSizeSandwich',  _num(ex.customSizeSandwich, dx.customSizeSandwich != null ? dx.customSizeSandwich : 1500));
    _set('customSizeMdf',       _num(ex.customSizeMdf, dx.customSizeMdf != null ? dx.customSizeMdf : 1400));
    _set('c9RecessedSurcharge', _num(ex.c9RecessedSurcharge, dx.c9RecessedSurcharge != null ? dx.c9RecessedSurcharge : 150));
    _set('c9LegsSurcharge',     _num(ex.c9LegsSurcharge, dx.c9LegsSurcharge != null ? dx.c9LegsSurcharge : 250));
    _set('topPanelPerCm',       _num(ex.topPanelPerCm, dx.topPanelPerCm != null ? dx.topPanelPerCm : 8));
    _set('closuresCustomer',    _num(ex.closuresCustomer, dx.closuresCustomer != null ? dx.closuresCustomer : 750));
    _set('closuresInstall',     _num(ex.closuresInstall, dx.closuresInstall != null ? dx.closuresInstall : 300));

    updatePreview();
}

// ── read ─────────────────────────────────────────────────────────────────────
function read() {
    _syncTypesFromDom();
    _syncCustomExtrasFromDom();
    _syncStockMaterialsFromDom();
    var ex = {};
    ['internalDrawer','externalDrawer','shoeDrawer','openCell','openCell34','openCell5','partition','shelfFreePerMeter',
     'extraShelfMel','extraShelfNonMel','deskUnit',
     'doorFramedMel','doorGlassMel','doorGlassBlack','doorMirror','deskMirror','ledPair','sorbet','touchHandle',
     'upperUnit160','upperUnit240','upperUnitPerCm',
     'cornerDrawers3','cornerDrawers4','cornerDrawerExtra','cornerDesk',
     'fullCornerBase','fullCornerShelf','wingConnection',
     'sideCabMel','sideCabNonMel','sideCabDoors',
     'slidingBase','slidingDoor','slidingGlass','slidingMirror','slidingGold','slidingBlack',
     'nickelLegPrice',
     'customSizeMel','customSizeSandwich','customSizeMdf',
     'c9RecessedSurcharge','c9LegsSurcharge',
     'topPanelPerCm','closuresCustomer','closuresInstall'].forEach(function(k) {
        ex[k] = _num(_v(k), 0);
    });
    ['slidingHeightSurcharge'].forEach(function(k) { ex[k] = (_frac(_v(k)) || 0); });
    _syncHingeTypesFromDom();
    _syncCustomExtrasFromDom();
    var customExtras = _customExtras
        .map(function(x) {
            return {
                id: String(x.id || ('cx_' + Date.now())),
                name: String(x.name || '').trim(),
                price: _num(x.price, 0)
            };
        })
        .filter(function(x) { return !!x.name; });
    if (PC && typeof PC.normalizeCustomExtras === 'function') {
        customExtras = PC.normalizeCustomExtras(customExtras);
    }
    var hingeTypes = _hingeTypes
        .map(function(x) {
            return {
                id: String(x.id || ('hinge_' + Date.now())),
                name: String(x.name || '').trim(),
                price: _num(x.price, 0)
            };
        })
        .filter(function(x) { return !!x.name; });
    if (PC && typeof PC.normalizeHingeTypes === 'function') {
        hingeTypes = PC.normalizeHingeTypes(hingeTypes);
    }
    var stockMaterials = _stockMaterials.slice();
    if (PC && typeof PC.normalizeStockMaterials === 'function') {
        stockMaterials = PC.normalizeStockMaterials(stockMaterials);
    }
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
        materialsMultiplier:      _num(_v('materialsMultiplier'), 1.4),
        profitMultiplier:         _num(_v('profitMultiplier'), 1.8),
        heightSurcharge:          (_frac(_v('heightSurcharge')) || 0),
        depthSurchargeFromCm:     _num(_v('depthSurchargeFromCm'), 54),
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
        extras:                   ex,
        customExtras:             customExtras,
        hingeTypes:               hingeTypes,
        stockMaterials:           stockMaterials
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

function _refreshPreviewMatSelect() {
    var sel = _el('prev-mat');
    if (!sel) return;
    var cur = sel.value;
    var opts = '<option value="">גיבוי (ללא צבע מלאי)</option>';
    (_stockMaterials || []).forEach(function(m) {
        if (!m || !m.key) return;
        var label = (m.label || m.key) + (m.sheetPrice > 0 ? ' · ₪' + m.sheetPrice : '');
        opts += '<option value="' + _esc(m.key) + '"' + (m.key === cur ? ' selected' : '') + '>' +
            _esc(label) + '</option>';
    });
    sel.innerHTML = opts;
    if (cur && (_stockMaterials || []).some(function(m) { return m && m.key === cur; })) sel.value = cur;
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
    var matKey = ((_el('prev-mat') || {}).value) || null;

    try {
        var type = PC.findType(cfg, typeId) || (PC.normalizeTypes(cfg)[0]);
        if (!type) { resultEl.innerHTML = '<div style="font-size:.75rem;opacity:.75;margin-bottom:2px;">תצוגה מקדימה</div><div style="font-size:1rem;">—</div>'; return; }
        var res = PC.preview(cfg, {
            typeId: type.id, w: w, h: h, d: d, melamine: _melamine,
            matKey: (_currentMode === 'materials') ? matKey : null
        });
        var matLabel = '';
        if (_currentMode === 'materials') {
            if (matKey) {
                var hit = (_stockMaterials || []).find(function(m) { return m && m.key === matKey; });
                matLabel = hit ? (hit.label || hit.key) : matKey;
            } else {
                matLabel = 'גיבוי';
            }
        } else {
            matLabel = _melamine ? 'מלמין' : 'לא מלמין';
        }
        var costLine = (window._showCostPricing === true || (window._features && window._features.showCostPricing))
            ? '<div style="font-size:.75rem;opacity:.75;">עלות: ' + res.cost.toLocaleString() + ' ₪ · התקנה: ' + res.install.toLocaleString() + ' ₪</div>'
            : '<div style="font-size:.75rem;opacity:.75;">התקנה: ' + res.install.toLocaleString() + ' ₪</div>';
        resultEl.innerHTML =
            '<div style="font-size:.73rem;opacity:.7;margin-bottom:3px;">' + _esc(type.label) + ' ' + w + '×' + h + ' · ' + _esc(matLabel) + '</div>' +
            '<div style="font-size:1.2rem;font-weight:800;">ללקוח: ' + res.customer.toLocaleString() + ' ₪</div>' +
            costLine;
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
        '[id^="pnl-"] input:focus { border-color: #2563eb !important; outline: none; }' +
        '.pnl-details > summary::-webkit-details-marker { display: none; }' +
        '.pnl-details[open] > summary .fa-chevron-down { transform: rotate(180deg); }' +
        '.pnl-details > summary .fa-chevron-down { transition: transform .15s; }' +
        '.pnl-cat-overlay{position:fixed;inset:0;z-index:100000;background:rgba(15,23,42,.55);' +
            'display:none;align-items:center;justify-content:center;padding:16px;}' +
        '.pnl-cat-overlay.active{display:flex;}' +
        '.pnl-cat-dialog{background:#fff;border-radius:16px;width:min(960px,100%);height:min(860px,92vh);' +
            'display:flex;flex-direction:column;overflow:hidden;box-shadow:0 24px 64px rgba(0,0,0,.28);' +
            'font-family:inherit;direction:rtl;}' +
        '.pnl-cat-header{display:flex;align-items:flex-start;gap:12px;padding:16px 18px;border-bottom:1px solid #e2e8f0;}' +
        '.pnl-cat-header-main{flex:1;min-width:0;}' +
        '.pnl-cat-header-main h2{margin:0;font-size:1.05rem;font-weight:800;color:#1e3a5f;}' +
        '.pnl-cat-header-main p{margin:4px 0 0;font-size:.78rem;color:#64748b;}' +
        '.pnl-cat-search-wrap{flex:1;max-width:280px;}' +
        '.pnl-cat-search-wrap input{width:100%;height:38px;border:1.5px solid #e2e8f0;border-radius:10px;' +
            'padding:0 12px;font-family:inherit;font-size:.85rem;box-sizing:border-box;}' +
        '.pnl-cat-search-wrap input:focus{border-color:#2563eb;outline:none;}' +
        '.pnl-cat-close{width:36px;height:36px;border:none;background:transparent;color:#94a3b8;' +
            'font-size:1.15rem;cursor:pointer;border-radius:8px;}' +
        '.pnl-cat-close:hover{color:#0f172a;background:#f1f5f9;}' +
        '.pnl-cat-brands,.pnl-cat-subs{display:flex;flex-wrap:wrap;gap:6px;padding:10px 16px;' +
            'border-bottom:1px solid #e2e8f0;background:#f8fafc;}' +
        '.pnl-cat-brand,.pnl-cat-sub{border:1px solid #e2e8f0;background:#fff;color:#334155;' +
            'border-radius:999px;padding:6px 12px;font-size:.78rem;font-weight:600;cursor:pointer;font-family:inherit;}' +
        '.pnl-cat-brand.active,.pnl-cat-sub.active{background:#1e3a5f;border-color:#1e3a5f;color:#fff;}' +
        '.pnl-cat-body{flex:1;overflow:auto;padding:14px 16px;}' +
        '.pnl-cat-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;}' +
        '.pnl-cat-card{display:flex;flex-direction:column;align-items:stretch;gap:8px;text-align:right;' +
            'border:1.5px solid #e2e8f0;border-radius:12px;padding:8px;background:#fff;cursor:pointer;' +
            'font-family:inherit;transition:border-color .15s,box-shadow .15s;}' +
        '.pnl-cat-card:hover{border-color:#93c5fd;box-shadow:0 4px 14px rgba(37,99,235,.12);}' +
        '.pnl-cat-card.in-stock{border-color:#16a34a;background:#f0fdf4;}' +
        '.pnl-cat-swatch{display:block;height:72px;border-radius:8px;border:1px solid #e2e8f0;}' +
        '.pnl-cat-meta{display:flex;flex-direction:column;gap:2px;min-width:0;}' +
        '.pnl-cat-id{font-size:.7rem;font-weight:700;color:#64748b;font-family:ui-monospace,monospace;' +
            'direction:ltr;text-align:left;}' +
        '.pnl-cat-name{font-size:.8rem;font-weight:700;color:#0f172a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}' +
        '.pnl-cat-cat{font-size:.68rem;color:#94a3b8;}' +
        '.pnl-cat-badge{align-self:flex-start;font-size:.68rem;font-weight:700;padding:3px 8px;' +
            'border-radius:999px;background:#eff6ff;color:#2563eb;}' +
        '.pnl-cat-card.in-stock .pnl-cat-badge{background:#dcfce7;color:#15803d;}' +
        '.pnl-cat-loading{padding:40px;text-align:center;color:#64748b;font-size:.9rem;}' +
        '.pnl-cat-footer{display:flex;align-items:center;justify-content:space-between;gap:12px;' +
            'padding:12px 16px;border-top:1px solid #e2e8f0;background:#fff;}' +
        '.pnl-cat-added-note{font-size:.8rem;color:#15803d;font-weight:600;min-height:1.2em;}' +
        '.pnl-cat-done{height:38px;padding:0 18px;border:none;border-radius:10px;background:#1e3a5f;' +
            'color:#fff;font-weight:700;font-size:.85rem;cursor:pointer;font-family:inherit;}' +
        '@media (max-width:640px){.pnl-cat-dialog{width:100vw;height:100vh;border-radius:0;}' +
            '.pnl-cat-header{flex-wrap:wrap;}.pnl-cat-search-wrap{max-width:none;width:100%;order:3;}}';
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
    addCustomExtra: addCustomExtra,
    addHingeType:   addHingeType,
    addStockMaterial: addStockMaterial,
    confirmAddStockMaterial: confirmAddStockMaterial,
    cancelAddStockMaterial: cancelAddStockMaterial,
    openStockCatalog: openStockCatalog,
    closeStockCatalog: closeStockCatalog,
    addRangeRow:    addRangeRow,
    showSavedNote:  showSavedNote,
    // internal (called from inline onclick):
    _toggleMaterial:   _toggleMaterial,
    _deleteType:       _deleteType,
    _deleteCustomExtra:_deleteCustomExtra,
    _deleteHingeType:  _deleteHingeType,
    _deleteStockMaterial:_deleteStockMaterial,
    _onSave:           _onSave,
    _onReset:          _onReset
};

})(typeof window !== 'undefined' ? window : globalThis);
