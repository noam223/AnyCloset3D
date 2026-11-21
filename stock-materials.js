/* stock-materials.js — carpenter stock colors + per-sheet pricing in the designer sidebar.
 * Depends on: window._pricingConfig, Auth/Supabase for save. PricingCore optional.
 */
(function (global) {
'use strict';

var DEFAULT_SHEET_W = 2750;
var DEFAULT_SHEET_H = 1220;
var _lastMatKey = null;
var _lastMeta = null;

function _pc() { return global.PricingCore || null; }

function _sizeFor(key) {
    if (_pc() && typeof _pc().sheetSizeForMat === 'function') return _pc().sheetSizeForMat(key);
    if (key && (String(key).indexOf('eg_') === 0 ||
        /^(u727|w1200|u232|u604|u638|H1367|H1307|H1227)$/.test(String(key)))) {
        return { w: 2800, h: 2070, brand: 'egger' };
    }
    return { w: DEFAULT_SHEET_W, h: DEFAULT_SHEET_H, brand: 'standard' };
}

function normalize(list) {
    if (_pc() && typeof _pc().normalizeStockMaterials === 'function') {
        return _pc().normalizeStockMaterials(list);
    }
    if (!Array.isArray(list)) return [];
    var seen = {}, out = [];
    list.forEach(function(item) {
        if (!item || !item.key) return;
        var key = String(item.key).trim();
        if (!key || seen[key]) return;
        seen[key] = true;
        var st = String(item.sheetType || '').toLowerCase().trim();
        if (st !== 'mdf' && st !== 'sandwich') st = 'melamine';
        out.push({
            key: key,
            label: String(item.label || key).trim() || key,
            brand: String(item.brand || '').trim(),
            sheetType: st,
            sheetPrice: Number(item.sheetPrice) || 0,
            sheetW: Number(item.sheetW) || 0,
            sheetH: Number(item.sheetH) || 0,
            hex: item.hex || null,
            img: item.img || null
        });
        if (!out[out.length - 1].sheetW || !out[out.length - 1].sheetH) {
            var sz = _sizeFor(key);
            if (!out[out.length - 1].sheetW) out[out.length - 1].sheetW = sz.w;
            if (!out[out.length - 1].sheetH) out[out.length - 1].sheetH = sz.h;
            if (!out[out.length - 1].brand && sz.brand) out[out.length - 1].brand = sz.brand;
        }
    });
    return out;
}

function getCfg() {
    return global._pricingConfig || (typeof global._getPricingCfg === 'function' ? global._getPricingCfg() : null) || {};
}

function getList() {
    return normalize(getCfg().stockMaterials);
}

function find(key) {
    if (!key) return null;
    var k = String(key);
    return getList().find(function(x) { return x.key === k; }) || null;
}

function isCarpenter() {
    if (typeof global._isCarpenterPricingUser === 'function') return global._isCarpenterPricingUser();
    var plan = global._plan;
    return !!(plan && plan.userType === 'carpenter');
}

function _esc(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function _sheetType(t) {
    if (_pc() && typeof _pc().normalizeSheetType === 'function') return _pc().normalizeSheetType(t);
    var v = String(t || '').toLowerCase().trim();
    if (v === 'mdf' || v === 'sandwich') return v;
    return 'melamine';
}

function _sheetTypeLabel(t) {
    if (_pc() && typeof _pc().sheetTypeLabel === 'function') return _pc().sheetTypeLabel(t);
    var v = _sheetType(t);
    if (v === 'mdf') return 'MDF';
    if (v === 'sandwich') return "סנדביץ'";
    return 'מלמין';
}

function _labelForKey(key) {
    if (global.colorNamesHebrew && global.colorNamesHebrew[key]) return global.colorNamesHebrew[key];
    if (global.state && global.state.tambourPalette && global.state.tambourPalette[key]) {
        return global.state.tambourPalette[key].name || key;
    }
    if (global.state && global.state.bluranPalette && global.state.bluranPalette[key]) {
        return global.state.bluranPalette[key].name || key;
    }
    if (global.state && global.state.formexPalette && global.state.formexPalette[key]) {
        return global.state.formexPalette[key].name || key;
    }
    return key;
}

function _metaForKey(key) {
    var meta = { key: key, label: _labelForKey(key), brand: '', hex: null, img: null };
    var btn = document.querySelector('.material-btn[data-mat="' + key + '"]');
    if (btn) {
        var bg = btn.style.backgroundColor || btn.style.backgroundImage || '';
        if (btn.style.backgroundImage && btn.style.backgroundImage.indexOf('url') >= 0) {
            var m = /url\(["']?([^"')]+)["']?\)/.exec(btn.style.backgroundImage);
            if (m) meta.img = m[1];
        } else if (btn.style.backgroundColor) {
            meta.hex = btn.style.backgroundColor;
        }
    }
    ['tambourPalette', 'bluranPalette', 'formexPalette'].forEach(function(pk) {
        var map = global.state && global.state[pk];
        if (map && map[key]) {
            meta.label = map[key].name || meta.label;
            meta.hex = map[key].hex || meta.hex;
            meta.img = map[key].img || meta.img;
            meta.brand = pk.replace('Palette', '');
        }
    });
    return meta;
}

function renderStockGrid() {
    var wrap = document.getElementById('mat-stock-wrap');
    var grid = document.getElementById('mat-stock-grid');
    if (!wrap || !grid) return;
    if (!isCarpenter()) {
        wrap.style.display = 'none';
        return;
    }
    var list = getList();
    if (!list.length) {
        wrap.style.display = 'none';
        grid.innerHTML = '';
        return;
    }
    wrap.style.display = '';
    grid.innerHTML = list.map(function(item) {
        var style = item.img
            ? 'background-image:url(\'' + _esc(item.img) + '\');background-size:cover;'
            : ('background-color:' + _esc(item.hex || '#e2e8f0') + ';');
        var priced = item.sheetPrice > 0;
        return '<div class="mat-item mat-stock-item" title="' + _esc(item.label) +
            ' · ' + _esc(_sheetTypeLabel(item.sheetType)) +
            (priced ? (' · ₪' + Math.round(item.sheetPrice) + ' / פלטה לפני מע״מ') : ' · ללא מחיר') + '">' +
            '<button type="button" class="material-btn" data-mat="' + _esc(item.key) + '" style="' + style +
            (priced ? '' : 'outline:2px dashed #f59e0b;') + '"></button>' +
            '<span onclick="this.previousElementSibling.click()">' + _esc(item.label) + '</span></div>';
    }).join('');
}

function updatePriceBar(matKey) {
    var bar = document.getElementById('mat-sheet-price-bar');
    if (!bar) return;
    if (!isCarpenter() || !matKey || matKey === 'custom') {
        bar.style.display = 'none';
        return;
    }
    _lastMatKey = matKey;
    _lastMeta = _metaForKey(matKey);
    var stock = find(matKey);
    var inStock = !!stock;
    var priced = !!(stock && stock.sheetPrice > 0);
    bar.style.display = 'flex';
    var status = document.getElementById('mat-sheet-price-status');
    var btn = document.getElementById('mat-sheet-price-btn');
    if (status) {
        if (priced) {
            status.textContent = 'במלאי · ' + _sheetTypeLabel(stock.sheetType) +
                ' · ₪' + Math.round(stock.sheetPrice) +
                ' לפלטה לפני מע״מ · ' + Math.round(stock.sheetW) + '×' + Math.round(stock.sheetH);
            status.style.color = '#15803d';
        } else if (inStock) {
            status.textContent = 'במלאי · ' + _sheetTypeLabel(stock.sheetType) + ' · חסר מחיר פלטה';
            status.style.color = '#b45309';
        } else {
            status.textContent = 'לא במלאי השוטף — הגדירו מחיר פלטה';
            status.style.color = '#b45309';
        }
    }
    if (btn) btn.textContent = priced ? 'ערוך תמחור' : 'הגדר תמחור';
}

function onMaterialSelected(matKey, meta) {
    if (meta) _lastMeta = Object.assign(_metaForKey(matKey), meta);
    updatePriceBar(matKey);
}

function openModal(matKey) {
    matKey = matKey || _lastMatKey;
    if (!matKey) return;
    var meta = _lastMeta || _metaForKey(matKey);
    var stock = find(matKey) || {};
    var overlay = document.getElementById('mat-sheet-price-modal');
    if (!overlay) return;
    document.getElementById('msp-key').value = matKey;
    document.getElementById('msp-label').value = stock.label || meta.label || matKey;
    document.getElementById('msp-brand').value = stock.brand || meta.brand || '';
    document.getElementById('msp-price').value = (stock.sheetPrice != null && stock.sheetPrice !== '')
        ? stock.sheetPrice
        : 400;
    var typeEl = document.getElementById('msp-sheet-type');
    if (typeEl) typeEl.value = _sheetType(stock.sheetType);
    var sz = _sizeFor(matKey);
    document.getElementById('msp-w').value = stock.sheetW || sz.w;
    document.getElementById('msp-h').value = stock.sheetH || sz.h;
    document.getElementById('msp-hex').value = stock.hex || meta.hex || '';
    document.getElementById('msp-img').value = stock.img || meta.img || '';
    var title = document.getElementById('msp-title');
    if (title) title.textContent = 'תמחור פלטה — ' + (stock.label || meta.label || matKey);
    overlay.style.display = 'flex';
    var priceEl = document.getElementById('msp-price');
    if (priceEl) priceEl.focus();
}

function closeModal() {
    var overlay = document.getElementById('mat-sheet-price-modal');
    if (overlay) overlay.style.display = 'none';
}

async function saveFromModal() {
    var key = (document.getElementById('msp-key') || {}).value;
    if (!key) return;
    var item = {
        key: key,
        label: String((document.getElementById('msp-label') || {}).value || key).trim() || key,
        brand: String((document.getElementById('msp-brand') || {}).value || '').trim(),
        sheetType: _sheetType((document.getElementById('msp-sheet-type') || {}).value),
        sheetPrice: Number((document.getElementById('msp-price') || {}).value) || 400,
        sheetW: Number((document.getElementById('msp-w') || {}).value) || _sizeFor(key).w,
        sheetH: Number((document.getElementById('msp-h') || {}).value) || _sizeFor(key).h
    };
    var hex = String((document.getElementById('msp-hex') || {}).value || '').trim();
    var img = String((document.getElementById('msp-img') || {}).value || '').trim();
    if (hex) item.hex = hex;
    if (img) item.img = img;

    var cfg = Object.assign({}, getCfg());
    var list = normalize(cfg.stockMaterials);
    var idx = list.findIndex(function(x) { return x.key === key; });
    if (idx >= 0) list[idx] = Object.assign({}, list[idx], item);
    else list.push(item);
    cfg.stockMaterials = normalize(list);
    if (_pc() && typeof _pc().normalizeConfig === 'function') _pc().normalizeConfig(cfg);

    try {
        await persistConfig(cfg);
        closeModal();
        renderStockGrid();
        updatePriceBar(key);
        if (typeof global.calculatePrice === 'function') global.calculatePrice();
        if (typeof global._showToast === 'function') global._showToast('תמחור הפלטה נשמר ✓', 2500);
        else if (typeof global.showToast === 'function') global.showToast('תמחור הפלטה נשמר ✓', 'success');
    } catch (e) {
        alert('שגיאה בשמירה: ' + (e.message || e));
    }
}

async function persistConfig(cfg) {
    global._pricingConfig = cfg;
    var sb = global._supabase || (global.supabase && global.Auth ? null : null);
    if (!sb && global.supabase && typeof global.supabase.createClient === 'function') {
        // projects page may not expose _supabase the same way
    }
    sb = global._supabase;
    if (!sb && typeof global.Auth !== 'undefined' && Auth.getClient) {
        try { sb = Auth.getClient(); } catch (e) {}
    }
    if (!sb) {
        // Still update in-memory for this session
        return;
    }
    var user = null;
    try {
        var res = await sb.auth.getUser();
        user = res.data && res.data.user;
    } catch (e) {}
    if (!user) throw new Error('לא מחובר');
    var billingId = user.id;
    try {
        if (global.Auth && Auth.getBillingUserId) {
            billingId = await Auth.getBillingUserId() || user.id;
        }
    } catch (e) {}
    var { error } = await sb.from('pricing_configs').upsert(
        { user_id: billingId, config: cfg, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' }
    );
    if (error) throw error;
}

function refresh() {
    renderStockGrid();
    var part = (global.state && global.state.activeColorPart) || 'materialBody';
    var mat = null;
    if (global.state) {
        if (part === 'materialUpperUnit' && global.state.upperUnit) mat = global.state.upperUnit.material;
        else mat = global.state[part] || global.state.materialBody;
    }
    if (mat) updatePriceBar(mat);
}

global.StockMaterials = {
    normalize: normalize,
    getList: getList,
    find: find,
    renderStockGrid: renderStockGrid,
    updatePriceBar: updatePriceBar,
    onMaterialSelected: onMaterialSelected,
    openModal: openModal,
    closeModal: closeModal,
    saveFromModal: saveFromModal,
    refresh: refresh,
    DEFAULT_SHEET_W: DEFAULT_SHEET_W,
    DEFAULT_SHEET_H: DEFAULT_SHEET_H
};

document.addEventListener('DOMContentLoaded', function() {
    setTimeout(refresh, 400);
});

})(typeof window !== 'undefined' ? window : globalThis);
