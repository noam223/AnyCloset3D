// ==========================================
// CNC extras (no G-code / no machine profiles):
//   • Sheet nesting → sheets/sheet_NN.dxf
//   • Printable label HTML → labels/labels.html
//   • Whole-order ZIP (all cart cabinets)
// Loaded after export-cnc.js
// ==========================================
(function() {
    'use strict';

    function _dbg() { return window._exportCncDebug || {}; }
    function _fmt(x) { return String(Math.round(x * 10) / 10); }

    /** Prefer carpenter stock-material sheet size; else EGGER / CNC defaults. */
    function _stockSheetSize(matKey) {
        var pricing = (typeof window._getPricingCfg === 'function')
            ? window._getPricingCfg()
            : (window._pricingConfig || null);
        var list = pricing && Array.isArray(pricing.stockMaterials) ? pricing.stockMaterials : [];
        var hit = list.find(function(x) { return x && x.key === matKey; });
        if (hit && Number(hit.sheetW) > 100 && Number(hit.sheetH) > 100) {
            return { w: Number(hit.sheetW), h: Number(hit.sheetH), fromStock: true };
        }
        return null;
    }

    /** Resolve nest sheet size (mm) for a material key.
     *  Stock materials → their sheetW/H; EGGER → 2800×2070; else CNC cfg (default 2750×1220). */
    function _nestSheetSize(cfg, matKey) {
        var stockSz = _stockSheetSize(matKey);
        if (stockSz) return { w: stockSz.w, h: stockSz.h };
        if (window.PricingCore && typeof window.PricingCore.sheetSizeForMat === 'function') {
            var sz = window.PricingCore.sheetSizeForMat(matKey);
            if (sz && window.PricingCore.isEggerMatKey && window.PricingCore.isEggerMatKey(matKey)) {
                return { w: sz.w, h: sz.h };
            }
            if (sz && sz.w && sz.h) return { w: sz.w, h: sz.h };
        } else if (matKey && (String(matKey).indexOf('eg_') === 0 ||
            /^(u727|w1200|u232|u604|u638|H1367|H1307|H1227)$/.test(String(matKey)))) {
            return { w: 2800, h: 2070 };
        }
        return {
            w: Math.max(500, Number(cfg.sheetW) || 2750),
            h: Math.max(500, Number(cfg.sheetH) || 1220)
        };
    }

    /** Bottom-left shelf packing per material+thickness stock.
     *  Parts stay inset from the sheet edge (sheetMargin) — shops leave a frame for
     *  edge damage / transport knocks instead of cutting flush to the stock border. */
    window._cncNestSheets = function(result) {
        const cfg = result.cfg || {};
        const margin = Math.max(0, Number(cfg.sheetMargin != null ? cfg.sheetMargin : 15));
        const gap = Math.max(0, Number(cfg.nestGap) || 10);
        const allowRot = cfg.nestAllowRotate !== false;
        const nests = [];
        const dxfFile = _dbg().dxfFile;
        const entities = _dbg().entities;
        if (typeof dxfFile !== 'function' || typeof entities !== 'function') return nests;

        (result.stock || []).forEach(function(stock) {
            const sheetSz = _nestSheetSize(cfg, stock.matKey);
            const sheetW = sheetSz.w;
            const sheetH = sheetSz.h;
            const usableW = Math.max(1, sheetW - 2 * margin);
            const usableH = Math.max(1, sheetH - 2 * margin);
            // Expand qty into individual rects
            const parts = [];
            (stock.items || []).forEach(function(r) {
                for (let q = 0; q < (r.qty || 1); q++) {
                    parts.push({
                        r: r,
                        L: r.L,
                        W: r.W,
                        grain: !!r.grain,
                        id: r.id + (r.qty > 1 ? '#' + (q + 1) : '')
                    });
                }
            });
            // Large first
            parts.sort(function(a, b) { return (b.L * b.W) - (a.L * a.W) || (b.W - a.W); });

            const sheets = []; // { placements: [{part,x,y,rot}], usedArea }

            function fits(sheet, L, W, x, y) {
                if (x < margin - 0.01 || y < margin - 0.01) return false;
                if (x + L > sheetW - margin + 0.01 || y + W > sheetH - margin + 0.01) return false;
                for (let i = 0; i < sheet.placements.length; i++) {
                    const p = sheet.placements[i];
                    const pL = p.rot ? p.part.W : p.part.L;
                    const pW = p.rot ? p.part.L : p.part.W;
                    if (!(x + L + gap <= p.x || p.x + pL + gap <= x || y + W + gap <= p.y || p.y + pW + gap <= y)) {
                        return false;
                    }
                }
                return true;
            }

            function tryPlace(sheet, part) {
                const orients = [{ L: part.L, W: part.W, rot: false }];
                if (allowRot && (!part.grain || Math.abs(part.L - part.W) < 0.5)) {
                    orients.push({ L: part.W, W: part.L, rot: true });
                } else if (allowRot && !part.grain) {
                    orients.push({ L: part.W, W: part.L, rot: true });
                }
                // Candidate positions: inset origin + right/top of existing
                const xs = [margin], ys = [margin];
                sheet.placements.forEach(function(p) {
                    const pL = p.rot ? p.part.W : p.part.L;
                    const pW = p.rot ? p.part.L : p.part.W;
                    xs.push(p.x + pL + gap);
                    ys.push(p.y + pW + gap);
                });
                xs.sort(function(a, b) { return a - b; });
                ys.sort(function(a, b) { return a - b; });
                let best = null;
                orients.forEach(function(o) {
                    for (let yi = 0; yi < ys.length; yi++) {
                        for (let xi = 0; xi < xs.length; xi++) {
                            const x = xs[xi], y = ys[yi];
                            if (!fits(sheet, o.L, o.W, x, y)) continue;
                            const score = y * sheetW + x; // prefer bottom-left
                            if (!best || score < best.score) best = { x: x, y: y, rot: o.rot, score: score };
                        }
                    }
                });
                if (!best) return false;
                sheet.placements.push({ part: part, x: best.x, y: best.y, rot: best.rot });
                sheet.usedArea += part.L * part.W;
                return true;
            }

            parts.forEach(function(part) {
                // Skip boards larger than the usable (inset) area
                const maxDim = Math.max(part.L, part.W);
                const minDim = Math.min(part.L, part.W);
                if (maxDim > Math.max(usableW, usableH) + 0.5 || minDim > Math.min(usableW, usableH) + 0.5) {
                    // Oversized — dedicated sheet warning via empty util nest entry
                    const over = { placements: [], usedArea: part.L * part.W, oversize: part };
                    sheets.push(over);
                    return;
                }
                let placed = false;
                for (let s = 0; s < sheets.length; s++) {
                    if (sheets[s].oversize) continue;
                    if (tryPlace(sheets[s], part)) { placed = true; break; }
                }
                if (!placed) {
                    const sheet = { placements: [], usedArea: 0 };
                    if (!tryPlace(sheet, part)) {
                        // Force at inset origin even if overflow (should not happen after size check)
                        sheet.placements.push({ part: part, x: margin, y: margin, rot: false });
                        sheet.usedArea += part.L * part.W;
                    }
                    sheets.push(sheet);
                }
            });

            sheets.forEach(function(sheet, idx) {
                const ents = [];
                // Sheet outline (full stock)
                ents.push({
                    t: 'poly', layer: 'SHEET',
                    pts: [[0, 0], [sheetW, 0], [sheetW, sheetH], [0, sheetH]]
                });
                // Usable cut area (inside edge margin)
                if (margin > 0) {
                    ents.push({
                        t: 'poly', layer: 'SHEET_MARGIN',
                        pts: [
                            [margin, margin],
                            [sheetW - margin, margin],
                            [sheetW - margin, sheetH - margin],
                            [margin, sheetH - margin]
                        ]
                    });
                }
                ents.push({
                    t: 'text', layer: 'INFO', x: 20, y: sheetH - 30, h: 18,
                    text: (stock.matLabel || stock.matKey) + ' ' + _fmt(stock.T) + 'mm  sheet ' + (idx + 1) +
                        (margin > 0 ? ('  edge+' + _fmt(margin) + 'mm') : '')
                });
                if (sheet.oversize) {
                    ents.push({
                        t: 'text', layer: 'INFO', x: 20, y: sheetH / 2, h: 14,
                        text: 'OVERSIZE ' + sheet.oversize.id + ' ' + _fmt(sheet.oversize.L) + 'x' + _fmt(sheet.oversize.W)
                    });
                } else {
                    sheet.placements.forEach(function(pl) {
                        const r = pl.part.r;
                        // When rotated 90°, swap L/W in entity space by transforming
                        if (pl.rot) {
                            // Draw with swapped dims: build fake record view
                            const fake = Object.assign({}, r, { L: r.W, W: r.L });
                            // Remap outline/ops roughly via entities then… simpler: axis-aligned box + id
                            ents.push({
                                t: 'poly', layer: 'CUT_OUT',
                                pts: [
                                    [pl.x, pl.y], [pl.x + r.W, pl.y],
                                    [pl.x + r.W, pl.y + r.L], [pl.x, pl.y + r.L]
                                ]
                            });
                            ents.push({
                                t: 'text', layer: 'INFO', x: pl.x + 8, y: pl.y + 8, h: 10,
                                text: r.id + ' ROT90 ' + _fmt(r.L) + 'x' + _fmt(r.W)
                            });
                        } else {
                            const local = entities(r, 'A', pl.x, pl.y);
                            local.forEach(function(e) { ents.push(e); });
                        }
                    });
                }
                const util = Math.round((sheet.usedArea / (sheetW * sheetH)) * 1000) / 10;
                const file = 'sheets/sheet_' + String(stock.matKey || 'mat').replace(/[^\w.-]+/g, '_') +
                    '_' + _fmt(stock.T) + 'mm_' + String(idx + 1).padStart(2, '0') + '.dxf';
                nests.push({
                    file: file,
                    matKey: stock.matKey,
                    matLabel: stock.matLabel,
                    T: stock.T,
                    parts: sheet.oversize ? 1 : sheet.placements.length,
                    util: sheet.oversize ? 0 : util,
                    margin: margin,
                    dxf: dxfFile(ents)
                });
            });
        });
        return nests;
    };

    /** Printable sticker sheet — open in browser → Print → Save as PDF (Hebrew-safe). */
    window._cncBuildLabelsHtml = function(result, cabinetName) {
        const cfg = result.cfg || {};
        const lw = Math.max(30, Number(cfg.labelW) || 70);
        const lh = Math.max(18, Number(cfg.labelH) || 30);
        const cards = [];
        (result.panels || []).forEach(function(r) {
            for (let q = 0; q < (r.qty || 1); q++) {
                cards.push(
                    '<div class="lbl">' +
                    '<div class="id">' + _esc(r.id) + (r.qty > 1 ? ' · ' + (q + 1) + '/' + r.qty : '') + '</div>' +
                    '<div class="name">' + _esc(r.name) + '</div>' +
                    '<div class="dim">' + _fmt(r.L) + ' × ' + _fmt(r.W) + ' × ' + _fmt(r.T) + ' מ״מ</div>' +
                    '<div class="mat">' + _esc(r.matLabel || '') + '</div>' +
                    (cabinetName ? '<div class="cab">' + _esc(cabinetName) + '</div>' : '') +
                    '</div>'
                );
            }
        });
        return '<!DOCTYPE html><html lang="he" dir="rtl"><head><meta charset="utf-8">' +
            '<title>מדבקות CNC — ' + _esc(cabinetName || '') + '</title>' +
            '<style>' +
            '@page{margin:8mm} body{font-family:Arial,Helvetica,sans-serif;margin:0;padding:8px;background:#fff;color:#111}' +
            'h1{font-size:14px;margin:0 0 10px}' +
            '.grid{display:flex;flex-wrap:wrap;gap:4mm}' +
            '.lbl{width:' + lw + 'mm;height:' + lh + 'mm;border:1px solid #222;border-radius:2mm;padding:2mm 2.5mm;box-sizing:border-box;overflow:hidden;page-break-inside:avoid}' +
            '.id{font-weight:800;font-size:11px;font-family:Consolas,monospace;direction:ltr;text-align:right}' +
            '.name{font-size:10px;font-weight:700;margin-top:1px}' +
            '.dim{font-size:10px;margin-top:2px;direction:ltr;text-align:right}' +
            '.mat,.cab{font-size:8px;color:#444;margin-top:1px}' +
            '@media print{body{padding:0} h1{display:none}}' +
            '</style></head><body>' +
            '<h1>מדבקות CNC — ' + _esc(cabinetName || '') + ' · ' + cards.length + ' מדבקות · הדפיסו ל-PDF</h1>' +
            '<div class="grid">' + cards.join('') + '</div>' +
            '<script>setTimeout(function(){/* auto-ready for print */},0)</script>' +
            '</body></html>';
    };

    function _esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    /**
     * Build a ZIP for every cart cabinet (skips on-hold). Restores editor when done.
     */
    window._cncBuildOrderZip = async function(cfg, buildFn, downloadFn) {
        const cart = (typeof state !== 'undefined' && state.orderCart) ? state.orderCart : [];
        if (!cart.length) throw new Error('העגלה ריקה — אין ארונות לייצוא');
        if (typeof window._snapshotEditorState !== 'function' || typeof window._restoreEditorState !== 'function') {
            throw new Error('לא ניתן לייצא הזמנה — פונקציות שמירת מצב עורך חסרות');
        }
        const x3 = window._export3DDebug || {};
        const JSZip = await (x3.loadJSZip ? x3.loadJSZip() : Promise.reject(new Error('JSZip')));
        const zip = new JSZip();
        const snap = window._snapshotEditorState();
        const summary = [];
        try {
            let n = 0;
            for (let i = 0; i < cart.length; i++) {
                const item = cart[i];
                if (!item || !item.rawState) continue;
                if (typeof window._cartItemOnHold === 'function' && window._cartItemOnHold(item)) continue;
                n++;
                if (typeof window._applyRawStateForCapture === 'function') {
                    window._applyRawStateForCapture(item.rawState);
                }
                if (typeof buildCabinet === 'function') buildCabinet();
                // Let the engine settle
                await new Promise(function(r) { setTimeout(r, 30); });
                const cabName = (item.customName || item.cabinetName || ('ארון_' + n)).replace(/[\\/:*?"<>|]+/g, '_');
                const folder = String(n).padStart(2, '0') + '_' + cabName;
                const localCfg = Object.assign({}, cfg, { exportScope: 'cabinet' });
                const result = buildFn(localCfg);
                // Prefix panel ids in cutlist notes with cabinet folder for clarity
                result.panels.forEach(function(p) {
                    p.notes = (p.notes || []).concat(['ארון: ' + cabName]);
                });
                await downloadFn(result, { zip: zip, folder: folder, fileName: cabName });
                summary.push(folder + ' — ' + result.total + ' לוחות');
            }
            if (!n) throw new Error('לא נמצאו ארונות פעילים בעגלה');
            zip.file('ORDER_README.txt',
                '\uFEFFAnyCloset 3D — ייצוא CNC להזמנה שלמה\r\n' +
                'תאריך: ' + new Date().toLocaleString('he-IL') + '\r\n\r\n' +
                'כל תיקייה = ארון אחד מהעגלה.\r\n' +
                summary.map(function(s) { return '- ' + s; }).join('\r\n') + '\r\n\r\n' +
                'G-code אינו כלול.\r\n'
            );
            const orderName = (typeof state !== 'undefined' && state.projectName) ? state.projectName : 'הזמנה';
            if (x3.download) {
                x3.download(await zip.generateAsync({ type: 'blob' }), orderName + ' - CNC הזמנה.zip');
            }
        } finally {
            window._restoreEditorState(snap);
            if (typeof buildCabinet === 'function') buildCabinet();
        }
    };

    /**
     * Materials pricing from CNC sheet nesting (no export UI).
     * Counts nested stock sheets per matKey × sheetPrice from pricing stockMaterials.
     * Returns null when CNC build/nest is unavailable or the scene has no panels.
     */
    var _nestCostCache = { key: '', result: null };

    function _nestPricingFingerprint(pricingCfg) {
        var wings = (typeof state !== 'undefined' && state && state.wings) ? state.wings : {};
        var stock = (pricingCfg && pricingCfg.stockMaterials) || [];
        var wingBits = ['center', 'left', 'right'].map(function(side) {
            var w = wings[side];
            if (!w) return side + ':0';
            return [
                side, w.width, w.globalHeight, w.depth, w.cabinetModel, w.boardMaterial,
                w.materialBody, w.materialExternal, w.materialInternal, w.materialBack,
                w.hasDoors ? 1 : 0,
                (w.columns || []).map(function(c) {
                    return [c.type, c.width, c.shelves, (c.doors || []).length,
                        (c.compartments || []).map(function(x) { return x && x.type; }).join('.')].join(':');
                }).join('|')
            ].join(',');
        }).join(';');
        var stockBits = stock.map(function(s) {
            return [s.key, s.sheetPrice, s.sheetW, s.sheetH].join(':');
        }).join('|');
        return wingBits + '##' + stockBits + '##' +
            (pricingCfg && pricingCfg.materialsBoardPrice) + ':' +
            (pricingCfg && pricingCfg.materialsMultiplier);
    }

    window._cncMaterialsNestCost = function(pricingCfg, opts) {
        opts = opts || {};
        pricingCfg = pricingCfg || ((typeof window._getPricingCfg === 'function')
            ? window._getPricingCfg() : (window._pricingConfig || {}));
        var dbg = window._exportCncDebug;
        if (!dbg || typeof dbg.build !== 'function' || typeof window._cncNestSheets !== 'function') {
            return null;
        }
        if (typeof state === 'undefined' || !state || !state.wings) return null;

        var key = _nestPricingFingerprint(pricingCfg);
        if (!opts.force && _nestCostCache.key === key && _nestCostCache.result) {
            return _nestCostCache.result;
        }

        var cncCfg = Object.assign({}, dbg.defaults || {}, {
            nestSheets: true,
            pdfLabels: false,
            exportScope: 'cabinet'
        }, opts.cnc || {});

        var result;
        try {
            result = dbg.build(cncCfg);
        } catch (err) {
            console.warn('[materials-nest] build failed', err);
            return null;
        }
        if (!result || !result.total) return null;

        // Ensure nests exist even if build skipped them
        var nests = result.nests;
        if (!nests || !nests.length) {
            try { nests = window._cncNestSheets(result) || []; } catch (e2) { nests = []; }
        }
        if (!nests.length) return null;

        var stockList = Array.isArray(pricingCfg.stockMaterials) ? pricingCfg.stockMaterials : [];
        if (window.PricingCore && typeof window.PricingCore.normalizeStockMaterials === 'function') {
            stockList = window.PricingCore.normalizeStockMaterials(stockList);
        }
        var fallbackPrice = Number(pricingCfg.materialsBoardPrice) || 400;
        var byMat = {};
        nests.forEach(function(n) {
            var mk = n.matKey || 'unknown';
            if (!byMat[mk]) {
                byMat[mk] = {
                    matKey: mk,
                    matLabel: n.matLabel || mk,
                    sheets: 0,
                    sheetPrice: 0,
                    priced: false
                };
            }
            byMat[mk].sheets++;
        });

        var lines = [];
        var cost = 0;
        var missing = [];
        Object.keys(byMat).forEach(function(mk) {
            var row = byMat[mk];
            var hit = stockList.find(function(x) { return x && x.key === mk; });
            var price = hit && Number(hit.sheetPrice) > 0 ? Number(hit.sheetPrice) : 0;
            if (price <= 0 && fallbackPrice > 0) price = fallbackPrice;
            row.sheetPrice = price;
            row.priced = price > 0;
            row.subtotal = row.sheets * price;
            if (!row.priced) missing.push(mk);
            cost += row.subtotal;
            lines.push(row);
        });

        var out = {
            ok: true,
            cost: cost,
            sheetCount: nests.length,
            panelCount: result.total,
            lines: lines,
            missingPrices: missing,
            nests: nests
        };
        _nestCostCache = { key: key, result: out };
        return out;
    };

    window._cncInvalidateMaterialsNestCache = function() {
        _nestCostCache = { key: '', result: null };
    };

    // Register SHEET layer color hint via existing DXF writer (unknown layers default to 4)
})();
