/* quick-calc.js — standalone quick price calculator + quote list/history
 * Works on index.html (designer) and projects.html (quotes before 3D).
 */
(function (global) {
'use strict';

var _QC_DEFAULT_PRICING = {
    pricingMode: 'ranges',
    profitMultiplier: 1.7,
    installPricePerUnit: 110, installUnitCm: 42.5, installHeightSurcharge: 0.20,
    heightSurcharge: 0.20, depthSurcharge: 0.20, sandwichSurcharge: 0.15,
    ranges: {
        ab2:     { melamine: {80:1004,120:1507,160:2009,200:2511,240:3013}, nonMelamine: {80:1305,120:1959,160:2612,200:3265,240:3918} },
        c9:      { melamine: {80:970, 120:1340,160:1500,200:1870,240:2250}, nonMelamine: {80:1250,120:1600,160:1945,200:2433,240:2920} },
        regalim: { melamine: {80:1050,120:1462,160:1658,200:2073,240:2487}, nonMelamine: {80:1360,120:1900,160:2155,200:2700,240:3233} },
        maya:    { melamine: {80:1050,120:1462,160:1658,200:2073,240:2487}, nonMelamine: {80:1360,120:1900,160:2155,200:2700,240:3233} }
    },
    extras: {
        internalDrawer: 150, externalDrawer: 200, openCell: 400, partition: 150,
        shelfFreePerMeter: 3, extraShelfMel: 60, extraShelfNonMel: 80, deskUnit: 900,
        doorGlassMel: 400, doorGlassBlack: 600, nickelLegPrice: 100, ledPair: 650
    }
};

function _qcCfg() {
    return global._pricingConfig || global.DEFAULT_PRICING_CONFIG || _QC_DEFAULT_PRICING;
}

function _qcIncludedShelves(ww, wh, wModel) {
    var isC9Like = (wModel === 'c9' || wModel === 'ab2_nohoney');
    var allowed = 0;
    if (!isC9Like) {
        if (ww <= 80) allowed = 5; else if (ww <= 160) allowed = 8; else allowed = 13;
    } else {
        if (ww <= 80) allowed = 2; else if (ww <= 160) allowed = 7; else allowed = 12;
    }
    if (ww > 240) allowed += Math.ceil((ww - 240) / 80) * 5;
    if (wh > 240) allowed += Math.ceil(ww / 80);
    return allowed;
}

function _qcBasePrice(cfg, ww, wh, wd, wMelamine, model) {
    var hS = cfg.heightSurcharge != null ? cfg.heightSurcharge : 0.20;
    var dS = cfg.depthSurcharge != null ? cfg.depthSurcharge : 0.20;
    var cfgR = cfg.ranges || _QC_DEFAULT_PRICING.ranges;
    var pricingModel = model;
    if (!cfgR[pricingModel] && pricingModel === 'ab2_nohoney') pricingModel = 'c9';
    var mk = cfgR[pricingModel] ? pricingModel : 'maya';
    var mr = cfgR[mk] || _QC_DEFAULT_PRICING.ranges.maya;
    var rt = wMelamine ? mr.melamine : (mr.nonMelamine || mr.melamine);
    var p240 = rt['240'] || 2487;
    var bp;
    if (ww <= 80) bp = rt['80'] || 1050;
    else if (ww <= 120) bp = rt['120'] || 1462;
    else if (ww <= 160) bp = rt['160'] || 1658;
    else if (ww <= 200) bp = rt['200'] || 2073;
    else if (ww <= 240) bp = p240;
    else bp = (p240 / 240) * ww;
    if (wh >= 241) bp *= (1 + hS);
    if (wd > 54) bp *= (1 + dS);
    return bp;
}

function _qcInstall(cfg, ww, wh) {
    var instUnit = cfg.installUnitCm || 42.5;
    var instPer = cfg.installPricePerUnit || 110;
    var instHS = cfg.installHeightSurcharge != null ? cfg.installHeightSurcharge : 0.20;
    var inst = Math.ceil(ww / instUnit) * instPer;
    if (wh > 240) inst *= (1 + instHS);
    return Math.round(inst);
}

function _qcWingCost(cfg, w, h, d, model, isMelamine, shelves, intDrawers, extDrawers, openCells, hasDesk) {
    var ex = cfg.extras || _QC_DEFAULT_PRICING.extras;
    var cost = _qcBasePrice(cfg, w, h, d, isMelamine, model);
    if (!isMelamine) {
        var sandwichPct = cfg.sandwichSurcharge != null ? cfg.sandwichSurcharge : 0.15;
        cost *= (1 + sandwichPct);
    }
    if (model === 'regalim' && (cfg.pricingMode || 'ranges') === 'ranges') {
        var legCount = w <= 110 ? 4 : w <= 180 ? 6 : 8;
        cost += legCount * (ex.nickelLegPrice != null ? ex.nickelLegPrice : 100);
    }
    var allowed = _qcIncludedShelves(w, h, model);
    if (shelves > allowed) {
        cost += (shelves - allowed) * (isMelamine ? (ex.extraShelfMel || 60) : (ex.extraShelfNonMel || 80));
    }
    if (hasDesk) cost += (ex.deskUnit || 900);
    if (intDrawers > 0) cost += intDrawers * (ex.internalDrawer || 150);
    if (extDrawers > 0) cost += extDrawers * (ex.externalDrawer || 200);
    var openBlocks = openCells;
    var wEffective = model;
    if (model === 'ab2_nohoney' && openCells > 0) wEffective = 'ab2';
    if ((model === 'ab2' || wEffective === 'ab2') && openBlocks > 0) openBlocks--;
    cost += openBlocks * (ex.openCell || 400);
    return cost;
}


window.calcQuickPrice = function(autoUpdateShelves = false) {
    const w = parseFloat(document.getElementById('qc-w').value) || 0;
    const h = parseFloat(document.getElementById('qc-h').value) || 0;
    const d = parseFloat(document.getElementById('qc-d').value) || 0;
    const modelEl = document.getElementById('qc-plinth');
    const model = modelEl ? modelEl.value : 'maya';
    const matEl = document.getElementById('qc-mat');
    const mat = matEl ? matEl.value : 'melamine';
    const isMelamine = mat === 'melamine';
    const intDrawers = parseInt(document.getElementById('qc-int-d').value) || 0;
    const extDrawers = parseInt(document.getElementById('qc-ext-d').value) || 0;
    const openCells = parseInt(document.getElementById('qc-open-cells').value) || 0;
    const partitions = parseInt((document.getElementById('qc-partitions') || {}).value) || 0;
    const glassWoodDoors = parseInt((document.getElementById('qc-door-glass-wood') || {}).value) || 0;
    const alumDoors = parseInt((document.getElementById('qc-door-alum') || {}).value) || 0;
    const ledPairs = parseInt((document.getElementById('qc-led-pairs') || {}).value) || 0;
    const hasDesk = document.getElementById('qc-desk').checked;

    const allowedShelves = _qcIncludedShelves(w, h, model);
    const labelEl = document.getElementById('qc-allowed-shelves-label');
    if (labelEl) labelEl.innerText = `(כלול: ${allowedShelves})`;

    if (autoUpdateShelves === true) {
        const shelvesInput = document.getElementById('qc-shelves');
        if (shelvesInput) shelvesInput.value = allowedShelves;
    }

    const shelvesEl = document.getElementById('qc-shelves');
    const shelves = shelvesEl ? (parseInt(shelvesEl.value) || 0) : 0;

    const cfg = _qcCfg();
    const ex = cfg.extras || _QC_DEFAULT_PRICING.extras;
    let finalCost = _qcWingCost(cfg, w, h, d, model, isMelamine, shelves, intDrawers, extDrawers, openCells, hasDesk);
    finalCost += partitions * (ex.partition || 150);
    finalCost += glassWoodDoors * (ex.doorGlassMel || 400);
    finalCost += alumDoors * (ex.doorGlassBlack || 600);
    finalCost += ledPairs * (ex.ledPair || 650);

    const installPrice = _qcInstall(cfg, w, h);
    const profitMult = cfg.profitMultiplier != null ? cfg.profitMultiplier : 1.7;
    const priceToCustomer = finalCost * profitMult;

    window._qcLastResult = {
        w: w, h: h, d: d, model: model,
        mat: mat, shelves: shelves,
        cost: Math.round(finalCost),
        install: Math.round(installPrice),
        customer: Math.round(priceToCustomer),
        extras: {
            intDrawers: intDrawers, extDrawers: extDrawers, openCells: openCells,
            partitions: partitions, glassWoodDoors: glassWoodDoors,
            alumDoors: alumDoors, ledPairs: ledPairs, hasDesk: !!hasDesk
        }
    };

    const costEl = document.getElementById('qc-total-cost');
    const installEl = document.getElementById('qc-install');
    const custEl = document.getElementById('qc-total-cust');
    if (costEl) costEl.innerText = '₪' + Math.round(finalCost).toLocaleString();
    if (installEl) installEl.innerText = '₪' + Math.round(installPrice).toLocaleString();
    if (custEl) custEl.innerText = '₪' + Math.round(priceToCustomer).toLocaleString();
};

window._qcQuoteList = window._qcQuoteList || [];
window._qcEditIndex = null;

function _qcMoney(n) {
    return '₪' + Math.round(n || 0).toLocaleString('he-IL');
}

function _qcDimsLabel(item) {
    const w = item && item.w != null ? item.w : '?';
    const h = item && item.h != null ? item.h : '?';
    const d = item && item.d != null ? item.d : '?';
    return w + '×' + h + '×' + d + ' ס״מ';
}

function _qcCabinetLabel(item) {
    if (item.name && String(item.name).trim()) return String(item.name).trim();
    return 'ארון';
}

function _qcExtrasSummary(ex) {
    if (!ex) return '';
    const parts = [];
    if (ex.intDrawers) parts.push(ex.intDrawers + ' מגירות פנים');
    if (ex.extDrawers) parts.push(ex.extDrawers + ' מגירות חוץ');
    if (ex.openCells) parts.push(ex.openCells + ' כוורת');
    if (ex.partitions) parts.push(ex.partitions + ' מחיצות');
    if (ex.glassWoodDoors) parts.push(ex.glassWoodDoors + ' דלת זכוכית פרופיל עץ');
    if (ex.alumDoors) parts.push(ex.alumDoors + ' דלת פרופיל אלומיניום');
    if (ex.ledPairs) parts.push(ex.ledPairs + ' זוג לדים');
    if (ex.hasDesk) parts.push('שולחן עבודה');
    return parts.join(', ');
}

function _qcSetVal(id, value) {
    const el = document.getElementById(id);
    if (!el) return;
    if (el.type === 'checkbox') el.checked = !!value;
    else el.value = value != null ? value : '';
}

function _qcBuildItemFromLastResult(name) {
    const last = window._qcLastResult;
    if (!last) return null;
    return {
        name: name || '',
        w: last.w, h: last.h, d: last.d, model: last.model,
        mat: last.mat || 'melamine',
        shelves: last.shelves != null ? last.shelves : 0,
        customer: last.customer, install: last.install, cost: last.cost,
        extras: Object.assign({}, last.extras || {})
    };
}

window.qcLoadFormFromItem = function(item) {
    if (!item) return;
    const ex = item.extras || {};
    _qcSetVal('qc-w', item.w);
    _qcSetVal('qc-h', item.h);
    _qcSetVal('qc-d', item.d);
    _qcSetVal('qc-plinth', item.model || 'maya');
    _qcSetVal('qc-mat', item.mat || 'melamine');
    _qcSetVal('qc-shelves', item.shelves != null ? item.shelves : 0);
    _qcSetVal('qc-int-d', ex.intDrawers || 0);
    _qcSetVal('qc-ext-d', ex.extDrawers || 0);
    _qcSetVal('qc-open-cells', ex.openCells || 0);
    _qcSetVal('qc-partitions', ex.partitions || 0);
    _qcSetVal('qc-door-glass-wood', ex.glassWoodDoors || 0);
    _qcSetVal('qc-door-alum', ex.alumDoors || 0);
    _qcSetVal('qc-led-pairs', ex.ledPairs || 0);
    _qcSetVal('qc-desk', !!ex.hasDesk);
    _qcSetVal('qc-cab-name', item.name || '');
};

window._qcSetEditUi = function() {
    const editing = window._qcEditIndex != null && window._qcEditIndex >= 0;
    const banner = document.getElementById('qc-edit-banner');
    const bannerLabel = document.getElementById('qc-edit-banner-label');
    const btnAdd = document.getElementById('qc-btn-add');
    const btnSaveList = document.getElementById('qc-btn-save-list');
    const btnCancelList = document.getElementById('qc-btn-cancel-list');

    if (banner) banner.style.display = editing ? 'flex' : 'none';
    if (btnAdd) btnAdd.style.display = editing ? 'none' : '';
    if (btnSaveList) btnSaveList.style.display = editing ? '' : 'none';
    if (btnCancelList) btnCancelList.style.display = editing ? '' : 'none';

    if (editing && bannerLabel) {
        const item = (window._qcQuoteList || [])[window._qcEditIndex];
        const title = item ? _qcCabinetLabel(item) : 'ארון';
        bannerLabel.textContent = 'עורך ארון #' + (window._qcEditIndex + 1) + ' — ' + title;
    }
};

window.qcEditQuoteItem = function(idx) {
    const items = window._qcQuoteList || [];
    const item = items[idx];
    if (!item) return;
    window._qcEditIndex = idx;
    window.qcLoadFormFromItem(item);
    if (typeof calcQuickPrice === 'function') calcQuickPrice(false);
    window._qcSetEditUi();
    window._renderQcQuoteList();

    const banner = document.getElementById('qc-edit-banner');
    const modal = document.getElementById('quick-calc-modal');
    const content = modal && modal.querySelector('.qc-content');
    if (banner && typeof banner.scrollIntoView === 'function') {
        banner.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } else if (content && typeof content.scrollIntoView === 'function') {
        content.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
};

window.qcCancelQuoteEdit = function() {
    window._qcEditIndex = null;
    const nameEl = document.getElementById('qc-cab-name');
    if (nameEl) nameEl.value = '';
    window._qcSetEditUi();
    window._renderQcQuoteList();
};

window.qcSaveEditedQuoteItem = function() {
    const idx = window._qcEditIndex;
    if (idx == null || idx < 0) return;
    if (typeof calcQuickPrice === 'function') calcQuickPrice(false);
    const nameEl = document.getElementById('qc-cab-name');
    const updated = _qcBuildItemFromLastResult(nameEl ? nameEl.value.trim() : '');
    if (!updated || !updated.customer) {
        alert('לא ניתן לשמור — בדוק את נתוני הארון');
        return;
    }
    if (!window._qcQuoteList[idx]) return;
    window._qcQuoteList[idx] = updated;
    window._qcEditIndex = null;
    if (nameEl) nameEl.value = '';
    window._qcSetEditUi();
    window._renderQcQuoteList();
};

window._renderQcQuoteList = function() {
    const listEl = document.getElementById('qc-quote-list');
    const textEl = document.getElementById('qc-quote-text');
    if (!listEl) return;
    const items = window._qcQuoteList || [];
    const editIdx = window._qcEditIndex;
    if (!items.length) {
        listEl.innerHTML = '<div style="color:#94a3b8;font-size:.85rem;text-align:center;padding:8px 0;">אין ארונות ברשימה עדיין</div>';
    } else {
        listEl.innerHTML = items.map(function(it, i) {
            const extra = _qcExtrasSummary(it.extras);
            const dims = _qcDimsLabel(it);
            const isEditing = editIdx === i;
            return '<div class="qc-quote-item' + (isEditing ? ' is-editing' : '') + '" onclick="qcEditQuoteItem(' + i + ')">' +
                '<div class="qc-quote-item-body">' +
                '<strong>' + (i + 1) + '. ' + _qcCabinetLabel(it) + '</strong>' +
                '<div class="qc-quote-dims">מידות: ' + dims + '</div>' +
                (extra ? ('<div style="color:#64748b;margin-top:3px;">' + extra + '</div>') : '') +
                '<div class="qc-quote-hint">' + (isEditing ? 'בעריכה כעת' : 'לחץ לעריכת מידות / תוספות') + '</div>' +
                '<div class="qc-quote-price-row" onclick="event.stopPropagation()">' +
                '<label>מחיר ללקוח</label>' +
                '<input type="number" min="0" step="1" class="qc-quote-price-input" value="' + Math.round(it.customer || 0) + '" ' +
                'oninput="qcUpdateQuotePrice(' + i + ', this.value)">' +
                '<span class="qc-quote-install">התקנה: ' + _qcMoney(it.install) + '</span>' +
                '</div></div>' +
                '<button type="button" title="הסר" onclick="event.stopPropagation(); qcRemoveQuoteItem(' + i + ')"><i class="fa-solid fa-xmark"></i></button>' +
                '</div>';
        }).join('');
    }
    if (textEl) textEl.value = window._buildQcCustomerQuoteText();
};

window._buildQcCustomerQuoteText = function() {
    const items = window._qcQuoteList || [];
    if (!items.length) return '';
    const nameEl = document.getElementById('qc-customer-name');
    const customerName = (nameEl && nameEl.value.trim()) ? nameEl.value.trim() : 'לקוח/ה יקר/ה';
    let totalCust = 0;
    let totalInstall = 0;
    const lines = [];
    lines.push('שלום ' + customerName + ',');
    lines.push('להלן הצעת מחיר לארונות:');
    lines.push('');
    items.forEach(function(it, i) {
        totalCust += it.customer || 0;
        totalInstall += it.install || 0;
        const extra = _qcExtrasSummary(it.extras);
        lines.push((i + 1) + '. ' + _qcCabinetLabel(it) + ' — ' + _qcMoney(it.customer));
        lines.push('   מידות: ' + _qcDimsLabel(it));
        if (extra) lines.push('   תוספות: ' + extra);
        lines.push('   הובלה והתקנה: ' + _qcMoney(it.install));
        lines.push('');
    });
    lines.push('סה״כ ארונות: ' + _qcMoney(totalCust));
    lines.push('סה״כ הובלה והתקנה: ' + _qcMoney(totalInstall));
    lines.push('סה״כ לתשלום: ' + _qcMoney(totalCust + totalInstall));
    lines.push('');
    lines.push('אשמח לעמוד לרשותך לכל שאלה 🙂');
    return lines.join('\n');
};

window.qcUpdateQuotePrice = function(idx, value) {
    const items = window._qcQuoteList || [];
    if (!items[idx]) return;
    const n = parseFloat(value);
    items[idx].customer = (isFinite(n) && n >= 0) ? Math.round(n) : 0;
    const textEl = document.getElementById('qc-quote-text');
    if (textEl) textEl.value = window._buildQcCustomerQuoteText();
};

window.qcAddToQuoteList = function() {
    if (window._qcEditIndex != null) {
        window.qcSaveEditedQuoteItem();
        return;
    }
    if (typeof calcQuickPrice === 'function') calcQuickPrice(false);
    const nameEl = document.getElementById('qc-cab-name');
    const item = _qcBuildItemFromLastResult(nameEl ? nameEl.value.trim() : '');
    if (!item || !item.customer) {
        alert('חשב קודם ארון במחשבון');
        return;
    }
    window._qcQuoteList.push(item);
    if (nameEl) nameEl.value = '';
    window._renderQcQuoteList();
};

window.qcRemoveQuoteItem = function(idx) {
    if (!window._qcQuoteList) return;
    window._qcQuoteList.splice(idx, 1);
    if (window._qcEditIndex != null) {
        if (window._qcEditIndex === idx) {
            window._qcEditIndex = null;
            const nameEl = document.getElementById('qc-cab-name');
            if (nameEl) nameEl.value = '';
        } else if (window._qcEditIndex > idx) {
            window._qcEditIndex -= 1;
        }
    }
    window._qcSetEditUi();
    window._renderQcQuoteList();
};

window.qcClearQuoteList = function() {
    window._qcQuoteList = [];
    window._qcEditIndex = null;
    const nameEl = document.getElementById('qc-cab-name');
    if (nameEl) nameEl.value = '';
    window._qcSetEditUi();
    window._renderQcQuoteList();
};

window.qcCopyCustomerQuote = function() {
    window._renderQcQuoteList();
    const text = window._buildQcCustomerQuoteText();
    if (!text) {
        alert('הוסף לפחות ארון אחד לרשימה');
        return;
    }
    const done = function() {
        alert('הטקסט הועתק — אפשר להדביק בוואטסאפ / הודעה ללקוח');
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done).catch(function() {
            const ta = document.getElementById('qc-quote-text');
            if (ta) { ta.focus(); ta.select(); document.execCommand('copy'); }
            done();
        });
    } else {
        const ta = document.getElementById('qc-quote-text');
        if (ta) { ta.focus(); ta.select(); document.execCommand('copy'); }
        done();
    }
};

function _qcModelLabel(model) {
    var map = {
        maya: 'מאיה',
        c9: 'C9',
        ab2_nohoney: 'חזית פנימית',
        ab2: 'AB2',
        regalim: 'רגלי ניקל'
    };
    return map[model] || model || '—';
}

function _qcMatLabel(mat) {
    return mat === 'sandwich' ? "סנדביץ'" : 'מלמין';
}

window._buildQcPrintHtml = function() {
    var items = window._qcQuoteList || [];
    var customerName = _qcCustomerNameVal() || 'לקוח/ה יקר/ה';
    var businessName = (window._userBusinessName && String(window._userBusinessName).trim())
        ? String(window._userBusinessName).trim()
        : '';
    var businessPhone = (window._userBusinessPhone && String(window._userBusinessPhone).trim())
        ? String(window._userBusinessPhone).trim()
        : '';
    var logoUrl = window._userLogoUrl || '';
    var dateStr = new Date().toLocaleDateString('he-IL');
    var totalCust = 0, totalInstall = 0;
    items.forEach(function(it) {
        totalCust += it.customer || 0;
        totalInstall += it.install || 0;
    });
    var grand = totalCust + totalInstall;
    var logoHtml = logoUrl
        ? '<img src="' + logoUrl.replace(/"/g, '') + '" alt="לוגו" class="qc-print-logo">'
        : '';
    var rows = items.map(function(it, i) {
        var extra = _qcExtrasSummary(it.extras);
        return '<tr>' +
            '<td class="num">' + (i + 1) + '</td>' +
            '<td><strong>' + _qcEsc(_qcCabinetLabel(it)) + '</strong>' +
            '<div class="meta">' + _qcEsc(_qcModelLabel(it.model)) + ' · ' + _qcEsc(_qcMatLabel(it.mat)) + '</div></td>' +
            '<td>' + _qcEsc(_qcDimsLabel(it)) + '</td>' +
            '<td>' + (extra ? _qcEsc(extra) : '—') + '</td>' +
            '<td class="money">' + _qcMoney(it.customer) + '</td>' +
            '<td class="money">' + _qcMoney(it.install) + '</td>' +
            '</tr>';
    }).join('');

    var pdfTitle = 'הצעת מחיר' + (customerName && customerName !== 'לקוח/ה יקר/ה' ? (' — ' + customerName) : '');

    return '<!DOCTYPE html><html lang="he" dir="rtl"><head><meta charset="UTF-8"><title>' + _qcEsc(pdfTitle) + '</title>' +
'<style>' +
'*{box-sizing:border-box;margin:0;padding:0}' +
'body{font-family:"Segoe UI",Tahoma,Arial,sans-serif;direction:rtl;background:#fff;color:#0f172a;padding:28px;font-size:14px;line-height:1.45}' +
'.sheet{max-width:900px;margin:0 auto}' +
'.top{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;border-bottom:3px solid #1e3a5f;padding-bottom:16px;margin-bottom:22px}' +
'.top h1{font-size:1.7rem;color:#1e3a5f;margin:0 0 4px}' +
'.top .sub{color:#64748b;font-size:.9rem}' +
'.biz{font-weight:700;color:#0f766e;margin-bottom:4px}' +
'.qc-print-logo{max-height:64px;max-width:180px;object-fit:contain;display:block}' +
'.cust{background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:14px 16px;margin-bottom:20px;display:grid;grid-template-columns:1fr 1fr;gap:8px 20px}' +
'.cust strong{color:#334155}' +
'table{width:100%;border-collapse:collapse;margin-bottom:18px}' +
'th{background:#1e3a5f;color:#fff;font-weight:700;padding:10px 12px;text-align:right;font-size:.82rem}' +
'td{padding:11px 12px;border-bottom:1px solid #e2e8f0;vertical-align:top;font-size:.9rem}' +
'tr:nth-child(even) td{background:#f8fafc}' +
'td.num{width:36px;color:#64748b;font-weight:700}' +
'td.money{white-space:nowrap;font-weight:700;direction:ltr;text-align:left}' +
'.meta{color:#64748b;font-size:.78rem;margin-top:3px}' +
'.totals{margin-top:8px;border:1.5px solid #e2e8f0;border-radius:12px;overflow:hidden;max-width:360px;margin-right:auto}' +
'.totals .row{display:flex;justify-content:space-between;padding:10px 14px;border-bottom:1px solid #e2e8f0}' +
'.totals .row:last-child{border-bottom:none;background:#eff6ff;font-size:1.15rem;font-weight:800;color:#1e3a5f}' +
'.note{margin-top:22px;color:#475569;font-size:.88rem;line-height:1.6}' +
'.footer{margin-top:28px;padding-top:12px;border-top:1px dashed #cbd5e1;color:#94a3b8;font-size:.78rem;display:flex;justify-content:space-between;gap:12px}' +
'@media print{body{padding:10px}@page{margin:12mm;size:A4}thead{display:table-header-group}tr{page-break-inside:avoid}}' +
'</style></head><body><div class="sheet">' +
'<div class="top"><div>' +
(businessName ? '<div class="biz">' + _qcEsc(businessName) + '</div>' : '') +
'<h1>הצעת מחיר</h1>' +
'<div class="sub">תאריך: ' + _qcEsc(dateStr) + '</div>' +
'</div>' + logoHtml + '</div>' +
'<div class="cust">' +
'<div><strong>לכבוד:</strong> ' + _qcEsc(customerName) + '</div>' +
'<div><strong>מספר פריטים:</strong> ' + items.length + '</div>' +
'</div>' +
'<table><thead><tr>' +
'<th>#</th><th>ארון</th><th>מידות</th><th>תוספות</th><th>מחיר</th><th>הובלה והתקנה</th>' +
'</tr></thead><tbody>' + rows + '</tbody></table>' +
'<div class="totals">' +
'<div class="row"><span>סה״כ ארונות</span><span>' + _qcMoney(totalCust) + '</span></div>' +
'<div class="row"><span>סה״כ הובלה והתקנה</span><span>' + _qcMoney(totalInstall) + '</span></div>' +
'<div class="row"><span>סה״כ לתשלום</span><span>' + _qcMoney(grand) + '</span></div>' +
'</div>' +
'<div class="note">הצעה זו תקפה ל־14 יום ממועד ההנפקה, אלא אם צוין אחרת.<br>המחירים כוללים את המפורט לעיל. שינויים במידות / חומרים / תוספות עשויים לשנות את המחיר הסופי.</div>' +
'<div class="footer"><span>' + _qcEsc(businessName || 'AnyCloset 3D') + (businessPhone ? (' · ' + _qcEsc(businessPhone)) : '') + '</span><span>נוצר במערכת AnyCloset</span></div>' +
'</div></body></html>';
};

window.qcPrintQuotePdf = function() {
    var items = window._qcQuoteList || [];
    if (!items.length) {
        alert('הוסף לפחות ארון אחד לפני הדפסה');
        return;
    }
    window._renderQcQuoteList();
    var html = window._buildQcPrintHtml();
    var customerName = _qcCustomerNameVal();
    var pdfTitle = 'הצעת מחיר' + (customerName ? (' — ' + customerName) : '');
    var win = window.open('', '_blank', 'width=960,height=720');
    if (!win) {
        alert('הדפדפן חסם חלון חדש — אפשר חלונות קופצים להדפסה');
        return;
    }
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(function() {
        try { win.document.title = pdfTitle; } catch (e) {}
        win.print();
    }, 450);
};

window._qcHistoryId = null;
window._qcHistoryCache = null;

function _qcPhoneVal() {
    var el = document.getElementById('qc-customer-phone');
    return el ? String(el.value || '').trim() : '';
}

function _qcCustomerNameVal() {
    var el = document.getElementById('qc-customer-name');
    return el ? String(el.value || '').trim() : '';
}

function _qcEsc(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

async function _qcHistoryStorageKey() {
    var uid = 'local';
    try {
        if (global.Auth && typeof Auth.getUser === 'function') {
            var user = await Auth.getUser();
            if (user && user.id) uid = user.id;
        }
    } catch (e) {}
    return 'anycloset_qc_history_v1_' + uid;
}

async function _qcLoadHistory() {
    try {
        var key = await _qcHistoryStorageKey();
        var raw = localStorage.getItem(key);
        var list = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(list)) list = [];
        global._qcHistoryCache = list;
        return list;
    } catch (e) {
        global._qcHistoryCache = [];
        return [];
    }
}

async function _qcSaveHistory(list) {
    var key = await _qcHistoryStorageKey();
    global._qcHistoryCache = list || [];
    localStorage.setItem(key, JSON.stringify(global._qcHistoryCache));
}

function _qcHistoryTotals(items) {
    var totalCust = 0, totalInstall = 0;
    (items || []).forEach(function(it) {
        totalCust += it.customer || 0;
        totalInstall += it.install || 0;
    });
    return { totalCust: totalCust, totalInstall: totalInstall };
}

window._renderQcHistory = async function() {
    var listEl = document.getElementById('qc-history-list');
    if (!listEl) return;
    var list = await _qcLoadHistory();
    var q = ((document.getElementById('qc-history-search') || {}).value || '').trim().toLowerCase();
    if (q) {
        list = list.filter(function(h) {
            return String(h.customerName || '').toLowerCase().indexOf(q) !== -1
                || String(h.customerPhone || '').toLowerCase().indexOf(q) !== -1;
        });
    }
    if (!list.length) {
        listEl.innerHTML = '<div style="color:#94a3b8;font-size:.82rem;text-align:center;padding:10px 0;">אין הצעות שמורות עדיין</div>';
        return;
    }
    listEl.innerHTML = list.map(function(h) {
        var when = h.updatedAt || h.createdAt || '';
        try { when = new Date(when).toLocaleString('he-IL'); } catch (e) {}
        var phone = h.customerPhone ? (' · ' + h.customerPhone) : '';
        var totals = _qcHistoryTotals(h.items);
        var active = global._qcHistoryId === h.id ? ' is-active' : '';
        return '<div class="qc-history-item' + active + '">' +
            '<div class="qc-history-item-body" onclick="qcLoadHistoryEntry(\'' + h.id + '\')">' +
            '<strong>' + _qcEsc(h.customerName || 'ללא שם') + '</strong>' +
            '<div class="qc-history-meta">' + _qcEsc(when) + _qcEsc(phone) + '</div>' +
            '<div class="qc-history-meta">' + (h.items ? h.items.length : 0) + ' ארונות · ' + _qcMoney(totals.totalCust + totals.totalInstall) + '</div>' +
            '</div>' +
            '<button type="button" title="מחק" onclick="event.stopPropagation(); qcDeleteHistoryEntry(\'' + h.id + '\')"><i class="fa-solid fa-trash"></i></button>' +
            '</div>';
    }).join('');
};

window.qcSaveQuoteToHistory = async function() {
    var items = global._qcQuoteList || [];
    if (!items.length) {
        alert('הוסף לפחות ארון אחד לפני שמירה להיסטוריה');
        return;
    }
    if (typeof calcQuickPrice === 'function') calcQuickPrice(false);
    var list = await _qcLoadHistory();
    var totals = _qcHistoryTotals(items);
    var entry = {
        id: global._qcHistoryId || ('qc_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8)),
        createdAt: null,
        updatedAt: new Date().toISOString(),
        customerName: _qcCustomerNameVal(),
        customerPhone: _qcPhoneVal(),
        items: JSON.parse(JSON.stringify(items)),
        quoteText: window._buildQcCustomerQuoteText(),
        totalCustomer: totals.totalCust,
        totalInstall: totals.totalInstall
    };
    var existingIdx = list.findIndex(function(h) { return h.id === entry.id; });
    if (existingIdx >= 0) {
        entry.createdAt = list[existingIdx].createdAt || entry.updatedAt;
        list[existingIdx] = entry;
    } else {
        entry.createdAt = entry.updatedAt;
        list.unshift(entry);
    }
    if (list.length > 200) list = list.slice(0, 200);
    global._qcHistoryId = entry.id;
    await _qcSaveHistory(list);
    await window._renderQcHistory();
    alert('ההצעה נשמרה בהיסטוריה ✓');
};

window.qcLoadHistoryEntry = async function(id) {
    var list = await _qcLoadHistory();
    var entry = list.find(function(h) { return h.id === id; });
    if (!entry) return;
    global._qcHistoryId = entry.id;
    global._qcQuoteList = JSON.parse(JSON.stringify(entry.items || []));
    global._qcEditIndex = null;
    _qcSetVal('qc-customer-name', entry.customerName || '');
    _qcSetVal('qc-customer-phone', entry.customerPhone || '');
    _qcSetVal('qc-cab-name', '');
    window._qcSetEditUi();
    window._renderQcQuoteList();
    await window._renderQcHistory();
};

window.qcDeleteHistoryEntry = async function(id) {
    if (!confirm('למחוק את ההצעה מההיסטוריה?')) return;
    var list = await _qcLoadHistory();
    list = list.filter(function(h) { return h.id !== id; });
    if (global._qcHistoryId === id) global._qcHistoryId = null;
    await _qcSaveHistory(list);
    await window._renderQcHistory();
};

window.qcNewQuote = function() {
    global._qcHistoryId = null;
    global._qcQuoteList = [];
    global._qcEditIndex = null;
    _qcSetVal('qc-customer-name', '');
    _qcSetVal('qc-customer-phone', '');
    _qcSetVal('qc-cab-name', '');
    window._qcSetEditUi();
    window._renderQcQuoteList();
    if (typeof window._renderQcHistory === 'function') window._renderQcHistory();
};

window.openQuickCalcModal = async function() {
    var modal = document.getElementById('quick-calc-modal');
    if (!modal) return;
    if (typeof _pricingCfg !== 'undefined' && _pricingCfg) {
        global._pricingConfig = _pricingCfg;
    }
    modal.style.display = 'flex';
    if (typeof calcQuickPrice === 'function') calcQuickPrice(true);
    window._qcSetEditUi();
    window._renderQcQuoteList();
    await window._renderQcHistory();
};

window.closeQuickCalcModal = function() {
    var modal = document.getElementById('quick-calc-modal');
    if (modal) modal.style.display = 'none';
};

document.addEventListener('DOMContentLoaded', function() {
    var nameEl = document.getElementById('qc-customer-name');
    if (nameEl) nameEl.addEventListener('input', function() { window._renderQcQuoteList(); });
    var histSearch = document.getElementById('qc-history-search');
    if (histSearch) histSearch.addEventListener('input', function() { window._renderQcHistory(); });
    if (typeof window._qcSetEditUi === 'function') window._qcSetEditUi();
    if (typeof window._renderQcHistory === 'function') window._renderQcHistory();
});

})(typeof window !== "undefined" ? window : globalThis);
