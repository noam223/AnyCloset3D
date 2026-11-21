/* pricing-core.js — the one place cabinet base prices are computed.
 * Used by the designer (state.js), the quick calculator (quick-calc.js) and the pricing editor preview (pricing-editor.js).
 * Pure functions only: no DOM, no network.
 */
(function (global) {
'use strict';

var DEFAULTS = {
    pricingMode: 'ranges',
    sqmPrice: 800, sqmPriceNonMel: 1040,
    lmPrice: 1200, lmPriceNonMel: 1560,
    lmHeightBase: 1200, lmHeightBaseNonMel: 1560,
    lmHeightThresholdCm: 240, lmHeightStepCm: 30, lmHeightStepPct: 0.10,
    materialsBoardPrice: 180, materialsBoardsPerSqm: 1.4, materialsMultiplier: 1.4,
    profitMultiplier: 1.8,
    installPricePerUnit: 110, installUnitCm: 42.5, installHeightSurcharge: 0.20,
    heightSurcharge: 0.20, depthSurcharge: 0.20, depthSurchargeFromCm: 54, sandwichSurcharge: 0.15,
    cabinetTypes: [
        { id: 'maya', label: 'צוקל נסתר', engine: 'maya' },
        { id: 'c9', label: 'צוקל רגיל', engine: 'c9' },
        { id: 'regalim', label: 'ארון על רגליים', engine: 'regalim' },
        { id: 'custom_size', label: 'ארון לפי מידה', engine: 'custom_size' },
        { id: 'sliding', label: 'ארון הזזה', engine: 'sliding' }
    ],
    ranges: {
        c9:      { melamine: {80:970, 120:1340,160:1500,200:1870,240:2250}, nonMelamine: {80:1250,120:1600,160:1945,200:2433,240:2920} },
        regalim: { melamine: {80:1050,120:1462,160:1658,200:2073,240:2487}, nonMelamine: {80:1360,120:1900,160:2155,200:2700,240:3233} },
        maya:    { melamine: {40:675,80:1050,120:1462,160:1658,200:2073,240:2487}, nonMelamine: {40:830,80:1360,120:1900,160:2155,200:2700,240:3233} }
    },
    extras: {
        internalDrawer: 150, shoeDrawer: 150, externalDrawer: 200,
        openCell: 400, openCell34: 600, openCell5: 800, partition: 150,
        shelfFreePerMeter: 3, extraShelfMel: 60, extraShelfNonMel: 80,
        deskUnit: 900,
        doorFramedMel: 80, doorGlassMel: 400, doorGlassBlack: 600, doorMirror: 350,
        deskMirror: 400,
        upperUnit160: 600, upperUnit240: 900, upperUnitPerCm: 3.75,
        cornerDrawers3: 832, cornerDrawers4: 907, cornerDrawerExtra: 200,
        cornerDesk: 900, fullCornerBase: 2800, fullCornerShelf: 120,
        wingConnection: 400,
        sideCabMel: 12, sideCabNonMel: 15, sideCabDoors: 300,
        slidingBase: 800, slidingDoor: 350, slidingGlass: 200, slidingMirror: 350,
        slidingGold: 80, slidingBlack: 50, slidingHeightSurcharge: 0.15,
        nickelLegPrice: 100,
        ledPair: 650, sorbet: 170, touchHandle: 30,
        customSizeMel: 1200, customSizeSandwich: 1500, customSizeMdf: 1400,
        c9RecessedSurcharge: 150, c9LegsSurcharge: 250,
        topPanelPerCm: 8,
        closuresCustomer: 750, closuresInstall: 300
    },
    customExtras: [],
    /** Carpenter stock colors / sheets: [{key,label,brand,sheetPrice,sheetW,sheetH,hex,img}] */
    stockMaterials: [],
    /** Hinge hardware types selectable per project: [{id,name,price}] */
    hingeTypes: [
        { id: 'std', name: 'ציר רגיל', price: 25 },
        { id: 'soft', name: 'ציר טריקה שקטה', price: 45 }
    ]
};

var ENGINES = [
    { id: 'maya', label: 'צוקל נסתר' },
    { id: 'c9', label: 'צוקל רגיל' },
    { id: 'regalim', label: 'ארון על רגליים' },
    { id: 'custom_size', label: 'ארון לפי מידה' },
    { id: 'sliding', label: 'ארון הזזה' },
    { id: 'ab2', label: 'AB2 (חזית פנימית + כוורת)' },
    { id: 'ab2_nohoney', label: 'ארון עם חזיתות פנימיות' }
];

var LEGACY_LABELS = {
    maya: 'צוקל נסתר', c9: 'צוקל רגיל', regalim: 'ארון על רגליים',
    custom_size: 'ארון לפי מידה',
    ab2: 'AB2', ab2_nohoney: 'ארון עם חזיתות פנימיות', sliding: 'ארון הזזה', other: 'אחר'
};

var RANGE_RESERVED_KEYS = ['melamine', 'nonMelamine', 'other', 'sliding'];

function num(v, fb) {
    if (v === '' || v == null) return fb;
    var n = Number(v);
    return isFinite(n) ? n : fb;
}

function clone(o) { return JSON.parse(JSON.stringify(o)); }

function normalizeTypes(cfg) {
    var list = (cfg && Array.isArray(cfg.cabinetTypes) && cfg.cabinetTypes.length) ? cfg.cabinetTypes : null;
    if (!list) {
        var ranges = (cfg && cfg.ranges) || {};
        list = Object.keys(ranges).filter(function(k) { return RANGE_RESERVED_KEYS.indexOf(k) === -1; })
            .map(function(id) { return { id: id, label: LEGACY_LABELS[id] || id, engine: id }; });
        if (!list.length) list = DEFAULTS.cabinetTypes;
    }
    var seen = {}, out = [];
    list.forEach(function(t) {
        if (!t || !t.id || t.id === 'other' || seen[t.id]) return;
        seen[t.id] = true;
        var engine = (t.engine && t.engine !== 'other') ? t.engine : String(t.id);
        if (!ENGINES.some(function(e) { return e.id === engine; })) engine = 'maya';
        var type = { id: String(t.id), label: (t.label && String(t.label).trim()) || String(t.id), engine: engine };
        var f = num(t.priceFactor, 0);
        if (f) type.priceFactor = f;
        out.push(type);
    });
    if (!out.some(function(t) { return t.engine === 'sliding'; })) out.push({ id: 'sliding', label: 'ארון הזזה', engine: 'sliding' });
    if (!out.some(function(t) { return t.engine === 'custom_size' || t.id === 'custom_size'; })) {
        out.push({ id: 'custom_size', label: 'ארון לפי מידה', engine: 'custom_size' });
    }
    return out;
}

function mergeOtherRanges(ranges) {
    if (!ranges || !ranges.other) return ranges;
    var out = {};
    Object.keys(ranges).forEach(function(k) { if (k !== 'other') out[k] = ranges[k]; });
    var src = ranges.other || {};
    var dest = out.maya || { melamine: {}, nonMelamine: {} };
    out.maya = { melamine: Object.assign({}, dest.melamine || {}), nonMelamine: Object.assign({}, dest.nonMelamine || {}) };
    ['melamine', 'nonMelamine'].forEach(function(k) {
        var map = src[k] || {};
        Object.keys(map).forEach(function(w) { if (out.maya[k][w] == null) out.maya[k][w] = map[w]; });
    });
    return out;
}

/** Normalizes legacy shapes in place (missing cabinetTypes, 'other' range table) and returns cfg. */
function normalizeConfig(cfg) {
    if (!cfg || typeof cfg !== 'object') return cfg;
    cfg.cabinetTypes = normalizeTypes(cfg);
    if (cfg.ranges) cfg.ranges = mergeOtherRanges(cfg.ranges);
    cfg.customExtras = normalizeCustomExtras(cfg.customExtras);
    cfg.stockMaterials = normalizeStockMaterials(cfg.stockMaterials);
    if (!Array.isArray(cfg.hingeTypes)) {
        // Legacy configs without hingeTypes — seed editable defaults (prices start at 0)
        cfg.hingeTypes = [
            { id: 'std', name: 'ציר רגיל', price: 0 },
            { id: 'soft', name: 'ציר טריקה שקטה', price: 0 }
        ];
    } else {
        cfg.hingeTypes = normalizeHingeTypes(cfg.hingeTypes);
    }
    return cfg;
}

function findType(cfg, idOrEngine) {
    var types = normalizeTypes(cfg);
    return types.find(function(t) { return t.id === idOrEngine; })
        || types.find(function(t) { return t.engine === idOrEngine; })
        || null;
}

/** The type a wing is priced as: its saved type if that type is still built with the wing's engine, else the first type built that way. */
function resolveType(cfg, engine, typeId) {
    var types = normalizeTypes(cfg);
    var own = typeId && types.find(function(t) { return t.id === typeId && (t.engine === engine || (engine === 'c9' && t.engine === 'ab2_nohoney')); });
    return own || types.find(function(t) { return t.engine === engine; }) || null;
}

function rangeKey(cfg, engine, typeId) {
    var cfgR = (cfg && cfg.ranges) || DEFAULTS.ranges;
    var types = normalizeTypes(cfg);
    if (typeId && cfgR[typeId]) {
        var own = types.find(function(t) { return t.id === typeId; });
        if (own && (own.engine === engine || (engine === 'c9' && own.engine === 'ab2_nohoney'))) return typeId;
    }
    var hit = types.find(function(t) {
        return t.engine !== 'sliding' && (t.engine === engine || t.id === engine) && cfgR[t.id];
    });
    if (hit) return hit.id;
    if (cfgR[engine]) return engine;
    if (engine === 'ab2_nohoney') {
        var c9t = types.find(function(t) { return t.engine === 'c9' && cfgR[t.id]; });
        if (c9t) return c9t.id;
        if (cfgR.c9) return 'c9';
    }
    var first = types.find(function(t) { return t.engine !== 'sliding' && cfgR[t.id]; });
    if (first) return first.id;
    var keys = Object.keys(cfgR).filter(function(k) { return RANGE_RESERVED_KEYS.indexOf(k) === -1; });
    if (cfgR.maya && (!keys.length || keys.indexOf('maya') !== -1)) return 'maya';
    return keys[0] || 'maya';
}

/** Price from a width table: the nearest listed width at or above ww; beyond the widest entry, scale linearly. Zero/empty cells are skipped. */
function rangeTablePrice(rt, ww, engine) {
    if (!rt) return null;
    if (ww <= 40 && (engine === 'maya' || engine === 'c9')) {
        var p40 = num(rt['40'], 0);
        if (p40 > 0) return p40;
        var p80 = num(rt['80'], 0);
        if (p80 > 0) return p80 / 2 + 150;
    }
    var widths = Object.keys(rt).map(Number)
        .filter(function(w) { return w > 0 && isFinite(w) && num(rt[w], 0) > 0; })
        .sort(function(a, b) { return a - b; });
    if (!widths.length) return null;
    for (var i = 0; i < widths.length; i++) {
        if (ww <= widths[i]) return num(rt[widths[i]], 0);
    }
    var maxW = widths[widths.length - 1];
    return (num(rt[maxW], 0) / maxW) * ww;
}

/** Volume cost for ארון לפי מידה: (W×H×D in meters) × material rate. No H/D % surcharges. */
function customSizeVolumePrice(cfg, ww, wh, wd, boardMaterial) {
    var ex = (cfg && cfg.extras) || DEFAULTS.extras;
    var rate;
    if (boardMaterial === 'melamine') rate = num(ex.customSizeMel, 1200);
    else if (boardMaterial === 'mdf') rate = num(ex.customSizeMdf, 1400);
    else rate = num(ex.customSizeSandwich, 1500);
    return (ww / 100) * (wh / 100) * (wd / 100) * rate;
}

/** C9 plinth-style cost adders (before profit). */
function c9PlinthSurcharge(cfg, plinthStyle) {
    var ex = (cfg && cfg.extras) || DEFAULTS.extras;
    if (plinthStyle === 'recessed') return num(ex.c9RecessedSurcharge, 150);
    if (plinthStyle === 'legs') return num(ex.c9LegsSurcharge, 250);
    return 0;
}

/**
 * Cost of the bare cabinet body (before extras and profit).
 * Width tables are per type; the formula modes are shared and scaled by the type's priceFactor.
 * opts.boardMaterial / opts.plinthStyle optional (for custom_size + C9 surcharges).
 */
function basePrice(cfg, ww, wh, wd, melamine, engine, typeId, opts) {
    opts = opts || {};
    var mode = cfg.pricingMode || 'ranges';
    var hS = cfg.heightSurcharge != null ? cfg.heightSurcharge : 0.20;
    var dS = cfg.depthSurcharge != null ? cfg.depthSurcharge : 0.20;
    var dFrom = num(cfg.depthSurchargeFromCm, 54);
    var bp;
    if (engine === 'custom_size') {
        var mat = opts.boardMaterial || (melamine ? 'melamine' : 'sandwich');
        return customSizeVolumePrice(cfg, ww, wh, wd, mat);
    }
    if (mode === 'ranges') {
        var cfgR = cfg.ranges || DEFAULTS.ranges;
        var rt;
        if (cfgR.melamine && !cfgR.maya && !cfgR.c9) {
            rt = melamine ? cfgR.melamine : (cfgR.nonMelamine || cfgR.melamine);
        } else {
            var mk = rangeKey(cfg, engine, typeId);
            var mr = cfgR[mk] || DEFAULTS.ranges.maya;
            rt = melamine ? mr.melamine : (mr.nonMelamine || mr.melamine);
            // C9 up to 80 cm is priced from the Maya table, except for an additional C9-built type that has its own table.
            if (engine === 'c9' && ww <= 80 && cfgR.maya && mk === rangeKey(cfg, engine)) {
                rt = (melamine ? cfgR.maya.melamine : (cfgR.maya.nonMelamine || cfgR.maya.melamine)) || rt;
            }
        }
        bp = rangeTablePrice(rt, ww, engine);
        // All-zero / empty carpenter price lists must stay at 0 — do not fall back to built-in defaults.
        if (bp == null) bp = 0;
        if (wh >= 241) bp *= (1 + hS);
        if (wd > dFrom) bp *= (1 + dS);
        if (engine === 'c9') bp += c9PlinthSurcharge(cfg, opts.plinthStyle);
        if (engine === 'regalim') bp += regalimLegsCost(cfg, ww);
        return bp;
    }
    if (mode === 'sqm') {
        var ps = melamine ? num(cfg.sqmPrice, 800) : num(cfg.sqmPriceNonMel, num(cfg.sqmPrice, 800) * 1.3);
        bp = ps * (ww / 100) * (wh / 100);
    } else if (mode === 'lm') {
        var pl = melamine ? num(cfg.lmPrice, 1200) : num(cfg.lmPriceNonMel, num(cfg.lmPrice, 1200) * 1.3);
        bp = pl * (ww / 100);
        if (wh >= 241) bp *= (1 + hS);
    } else if (mode === 'lm_height') {
        var base = melamine ? num(cfg.lmHeightBase, 1200) : num(cfg.lmHeightBaseNonMel, num(cfg.lmHeightBase, 1200) * 1.3);
        var steps = Math.max(0, Math.floor((wh - num(cfg.lmHeightThresholdCm, 240)) / num(cfg.lmHeightStepCm, 30)));
        bp = base * (ww / 100) * (1 + steps * num(cfg.lmHeightStepPct, 0.10));
    } else {
        bp = materialsFaceCost(cfg, ww, wh, opts.matKey || opts.materialKey || null);
    }
    if (wd > dFrom) bp *= (1 + dS);
    // Flat extras for plinth / legs — same behavior as ranges (not % type multipliers)
    if (engine === 'c9') bp += c9PlinthSurcharge(cfg, opts.plinthStyle);
    if (engine === 'regalim') bp += regalimLegsCost(cfg, ww);
    var type = resolveType(cfg, engine, typeId);
    var factor = type ? num(type.priceFactor, 0) : 0;
    return bp * (1 + factor);
}

function includedShelves(ww, wh, model) {
    var isC9Like = (model === 'c9' || model === 'ab2_nohoney') && ww > 80;
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

/** Shelves included in the base price: a fixed rule per construction in width-table mode, shelves-per-meter otherwise. */
function allowedShelves(cfg, ww, wh, model) {
    if ((cfg.pricingMode || 'ranges') === 'ranges') return includedShelves(ww, wh, model);
    var ex = cfg.extras || DEFAULTS.extras;
    var freePerM = ex.shelfFreePerMeter != null ? ex.shelfFreePerMeter : 3;
    return Math.round(freePerM * (ww / 100));
}

function installPrice(cfg, ww, wh) {
    var unit = num(cfg.installUnitCm, 42.5);
    var per = num(cfg.installPricePerUnit, 110);
    var hs = cfg.installHeightSurcharge != null ? cfg.installHeightSurcharge : 0.20;
    var inst = Math.ceil(ww / unit) * per;
    if (wh > 240) inst *= (1 + hs);
    return Math.round(inst);
}

function slidingCost(cfg, w, h) {
    var ex = cfg.extras || DEFAULTS.extras;
    var doors = Math.max(2, Math.ceil((w || 0) / 110));
    var base = num(ex.slidingBase, 800) + doors * num(ex.slidingDoor, 350);
    if (h > 240) base *= (1 + num(ex.slidingHeightSurcharge, 0.15));
    return base;
}

/** Nickel-leg cost for standalone regalim (count by width). Always applied — not gated by pricing mode. */
function regalimLegsCost(cfg, w) {
    var ex = cfg.extras || DEFAULTS.extras;
    var count = w <= 110 ? 4 : w <= 180 ? 6 : 8;
    return count * num(ex.nickelLegPrice, 100);
}
/** @deprecated use regalimLegsCost — kept for callers; legs are included in basePrice now. */
function regalimLegs(cfg, w) {
    return 0;
}

/** Bare cabinet of the given type and size: body (+ nickel legs), price to customer and installation. */
function preview(cfg, opts) {
    var type = findType(cfg, opts.typeId) || normalizeTypes(cfg)[0];
    var engine = type.engine;
    var body, legs = 0;
    var bpOpts = {
        boardMaterial: opts.boardMaterial || (opts.melamine ? 'melamine' : 'sandwich'),
        plinthStyle: opts.plinthStyle,
        matKey: opts.matKey || opts.materialKey || null
    };
    if (engine === 'sliding') {
        body = slidingCost(cfg, opts.w, opts.h);
    } else {
        // Legs / plinth surcharges are inside basePrice (flat extras)
        body = basePrice(cfg, opts.w, opts.h, opts.d, opts.melamine, engine === 'ab2_nohoney' ? 'c9' : engine, type.id, bpOpts);
    }
    var cost = body + legs;
    var profit = cfg.profitMultiplier != null ? num(cfg.profitMultiplier, 1.8) : 1.8;
    return {
        type: type,
        body: Math.round(body),
        legs: Math.round(legs),
        cost: Math.round(cost),
        customer: Math.round(cost * profit),
        install: installPrice(cfg, opts.w, opts.h),
        shelvesIncluded: engine === 'sliding' ? 0 : allowedShelves(cfg, opts.w, opts.h, engine)
    };
}

/** Normalize hinge types: [{id, name, price}]. */
function normalizeHingeTypes(list) {
    if (!Array.isArray(list)) return [];
    var seen = {}, out = [];
    list.forEach(function(item, i) {
        if (!item || typeof item !== 'object') return;
        var name = String(item.name || '').trim();
        if (!name) return;
        var id = String(item.id || ('hinge_' + i)).trim();
        if (!id || seen[id]) id = 'hinge_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
        seen[id] = true;
        out.push({ id: id, name: name, price: num(item.price, 0) });
    });
    return out;
}

function findHingeType(cfg, id) {
    var list = normalizeHingeTypes(cfg && cfg.hingeTypes);
    if (!list.length) return null;
    if (id) {
        var hit = list.find(function(x) { return x.id === id; });
        if (hit) return hit;
    }
    return list[0];
}

/** Normalize user-defined extras: [{id, name, price}]. */
function normalizeCustomExtras(list) {
    if (!Array.isArray(list)) return [];
    var seen = {}, out = [];
    list.forEach(function(item, i) {
        if (!item || typeof item !== 'object') return;
        var name = String(item.name || '').trim();
        if (!name) return;
        var id = String(item.id || ('cx_' + i + '_' + Date.now())).trim();
        if (!id || seen[id]) id = 'cx_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
        seen[id] = true;
        out.push({ id: id, name: name, price: num(item.price, 0) });
    });
    return out;
}

/** Standard Israeli board (Tambour/MDF paint, Bluran, Formex, generic melamine). */
var DEFAULT_SHEET_W = 2750;
var DEFAULT_SHEET_H = 1220;
/** EGGER decor boards — larger European sheet. */
var EGGER_SHEET_W = 2800;
var EGGER_SHEET_H = 2070;

var EGGER_BUILTIN_KEYS = {
    u727: 1, w1200: 1, u232: 1, u604: 1, u638: 1,
    H1367: 1, H1307: 1, H1227: 1
};

function isEggerMatKey(matKey) {
    if (!matKey) return false;
    var k = String(matKey);
    if (k.indexOf('eg_') === 0) return true;
    if (EGGER_BUILTIN_KEYS[k]) return true;
    if (global.EGGER_ALL_COLORS && Array.isArray(global.EGGER_ALL_COLORS)) {
        return global.EGGER_ALL_COLORS.some(function(c) { return c && c.key === k; });
    }
    return false;
}

/** Sheet size (mm) for a material key — EGGER 2800×2070, everything else 2750×1220. */
function sheetSizeForMat(matKey) {
    if (isEggerMatKey(matKey)) return { w: EGGER_SHEET_W, h: EGGER_SHEET_H, brand: 'egger' };
    var brand = '';
    var k = String(matKey || '');
    if (k.indexOf('tambour_') === 0) brand = 'tambour';
    else if (k.indexOf('bluran_') === 0) brand = 'bluran';
    else if (k.indexOf('formex_') === 0) brand = 'formex';
    return { w: DEFAULT_SHEET_W, h: DEFAULT_SHEET_H, brand: brand || 'standard' };
}

/** Normalize carpenter stock colors: [{key,label,brand,sheetPrice,sheetW,sheetH,hex,img}]. */
function normalizeStockMaterials(list) {
    if (!Array.isArray(list)) return [];
    var seen = {}, out = [];
    list.forEach(function(item) {
        if (!item || typeof item !== 'object') return;
        var key = String(item.key || '').trim();
        if (!key || seen[key]) return;
        seen[key] = true;
        var row = {
            key: key,
            label: String(item.label || key).trim() || key,
            brand: String(item.brand || '').trim(),
            sheetPrice: num(item.sheetPrice, 0),
            sheetW: num(item.sheetW, 0),
            sheetH: num(item.sheetH, 0)
        };
        if (!row.sheetW || !row.sheetH) {
            var sz = sheetSizeForMat(key);
            if (!row.sheetW) row.sheetW = sz.w;
            if (!row.sheetH) row.sheetH = sz.h;
            if (!row.brand && sz.brand) row.brand = sz.brand;
        }
        if (item.hex) row.hex = String(item.hex);
        if (item.img) row.img = String(item.img);
        out.push(row);
    });
    return out;
}

function findStockMaterial(cfg, matKey) {
    if (!matKey) return null;
    var list = normalizeStockMaterials(cfg && cfg.stockMaterials);
    var k = String(matKey);
    return list.find(function(x) { return x.key === k; }) || null;
}

/**
 * Cost of cabinet face area in materials mode.
 * Prefer stock sheet: (sqm / sheetAreaM2) × sheetPrice × wasteMultiplier.
 * Fallback: sqm × boardsPerSqm × boardPrice × multiplier.
 */
function materialsFaceCost(cfg, ww, wh, matKey) {
    var sqm = (ww / 100) * (wh / 100);
    var mult = cfg.materialsMultiplier != null ? num(cfg.materialsMultiplier, 1.4) : 1.4;
    if (mult <= 0) mult = 1;
    var stock = findStockMaterial(cfg, matKey);
    if (stock && stock.sheetPrice > 0) {
        var fallback = sheetSizeForMat(matKey);
        var sw = Math.max(100, num(stock.sheetW, fallback.w)) / 1000;
        var sh = Math.max(100, num(stock.sheetH, fallback.h)) / 1000;
        var sheetArea = Math.max(0.01, sw * sh);
        return sqm * (stock.sheetPrice / sheetArea) * mult;
    }
    return sqm * num(cfg.materialsBoardsPerSqm, 1.4) * num(cfg.materialsBoardPrice, 180) * mult;
}

/** Blank personal price list for carpenters who have not saved their own yet. */
function emptyConfig() {
    var e = clone(DEFAULTS);
    e.sqmPrice = 0; e.sqmPriceNonMel = 0;
    e.lmPrice = 0; e.lmPriceNonMel = 0;
    e.lmHeightBase = 0; e.lmHeightBaseNonMel = 0;
    e.pricingMode = 'materials';
    e.materialsBoardPrice = 0; e.materialsBoardsPerSqm = 0;
    // Waste / בלאי — keep a usable default so sheet-based costs are not wiped to 0
    e.materialsMultiplier = 1.4;
    e.profitMultiplier = 1.8;
    e.installPricePerUnit = 0;
    e.heightSurcharge = 0; e.depthSurcharge = 0; e.sandwichSurcharge = 0;
    e.installHeightSurcharge = 0;
    e.customExtras = [];
    e.stockMaterials = [];
    e.hingeTypes = [
        { id: 'std', name: 'ציר רגיל', price: 0 },
        { id: 'soft', name: 'ציר טריקה שקטה', price: 0 }
    ];
    Object.keys(e.ranges || {}).forEach(function(engine) {
        ['melamine', 'nonMelamine'].forEach(function(mat) {
            var map = (e.ranges[engine] && e.ranges[engine][mat]) || {};
            Object.keys(map).forEach(function(w) { map[w] = 0; });
        });
    });
    Object.keys(e.extras || {}).forEach(function(k) { e.extras[k] = 0; });
    return e;
}

var EMPTY = emptyConfig();

global.PricingCore = {
    DEFAULTS: DEFAULTS,
    EMPTY: EMPTY,
    emptyConfig: emptyConfig,
    ENGINES: ENGINES,
    LEGACY_LABELS: LEGACY_LABELS,
    RANGE_RESERVED_KEYS: RANGE_RESERVED_KEYS,
    num: num,
    clone: clone,
    normalizeTypes: normalizeTypes,
    normalizeCustomExtras: normalizeCustomExtras,
    normalizeHingeTypes: normalizeHingeTypes,
    findHingeType: findHingeType,
    normalizeStockMaterials: normalizeStockMaterials,
    findStockMaterial: findStockMaterial,
    materialsFaceCost: materialsFaceCost,
    DEFAULT_SHEET_W: DEFAULT_SHEET_W,
    DEFAULT_SHEET_H: DEFAULT_SHEET_H,
    EGGER_SHEET_W: EGGER_SHEET_W,
    EGGER_SHEET_H: EGGER_SHEET_H,
    isEggerMatKey: isEggerMatKey,
    sheetSizeForMat: sheetSizeForMat,
    normalizeConfig: normalizeConfig,
    findType: findType,
    resolveType: resolveType,
    rangeKey: rangeKey,
    rangeTablePrice: rangeTablePrice,
    basePrice: basePrice,
    customSizeVolumePrice: customSizeVolumePrice,
    c9PlinthSurcharge: c9PlinthSurcharge,
    includedShelves: includedShelves,
    allowedShelves: allowedShelves,
    installPrice: installPrice,
    slidingCost: slidingCost,
    regalimLegs: regalimLegs,
    regalimLegsCost: regalimLegsCost,
    preview: preview
};

})(typeof window !== 'undefined' ? window : globalThis);
