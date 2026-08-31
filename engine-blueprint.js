
// ==========================================
// Multi-view blueprint SVG generator
// ==========================================
const DESK_SURFACE_T = 2.8; // 28mm — all desk horizontal surfaces

function _bpCenterSideDesk(cw) {
    const wing = cw || (state.wings && state.wings.center);
    const desk = wing && wing.desk;
    return (desk && desk.side !== 'none') ? desk : null;
}

function _bpCenterSideCabinet(cw) {
    const wing = cw || (state.wings && state.wings.center);
    const sc = wing && wing.sideCabinet;
    return (sc && sc.side !== 'none') ? sc : null;
}

/** Extra width (cm) on each side of center cabinet for side desk / side cabinet in front-view layout */
function _bpCenterHorizExtra(cw) {
    let left = 0, right = 0;
    const desk = _bpCenterSideDesk(cw);
    if (desk) {
        const dw = desk.width || 100;
        if (desk.side === 'left') left += dw;
        else if (desk.side === 'right') right += dw;
    }
    const sc = _bpCenterSideCabinet(cw);
    if (sc) {
        const wR = sc.widthRight || sc.width || 40;
        const wL = sc.widthLeft || sc.width || 40;
        if (sc.side === 'right') right += wR;
        else if (sc.side === 'left') left += wL;
        else if (sc.side === 'both') { left += wL; right += wR; }
    }
    return { left, right };
}

/** Push side-desk front-view SVG primitives into parts array (makeRect / makeDim* style) */
function _bpDrawSideDeskFrontParts(p, desk, ox, oy, dW, dH, sc, fill, STROKE, STROKE_THIN, FONT, dimHFn, dimVFn, dimVLeftFn) {
    if (!desk) return;
    const dSide = desk.side;
    const dWidth = desk.width || 100;
    const dHeight = desk.height || 75;
    const drawerH = desk.drawerHeight || 12;
    const dSvgW = dWidth * sc;
    const dSvgH = dHeight * sc;
    const legT = (state.thickness || 1.7) * sc;
    const deskSurfT = DESK_SURFACE_T * sc;
    const deskX = dSide === 'left' ? (ox - dSvgW) : (ox + dW);
    const deskBotY = oy + dH;
    const deskTopY = deskBotY - dSvgH;
    const legX = dSide === 'left' ? deskX : (deskX + dSvgW - legT);
    const drawRect = (x, y, w, h, f, s, sw) => p.push(`<rect x="${(+x).toFixed(1)}" y="${(+y).toFixed(1)}" width="${(+w).toFixed(1)}" height="${(+h).toFixed(1)}" fill="${f}" stroke="${s}" stroke-width="${sw || 1.5}"/>`);
    const FILL_DESK = '#fed7aa';
    drawRect(legX, deskTopY, legT, dSvgH, fill || FILL_DESK, STROKE, 1.5);
    drawRect(deskX, deskTopY, dSvgW, deskSurfT, fill || FILL_DESK, STROKE, 1.5);
    if (desk.hasDrawers !== false) {
        const numDrawers = (desk.drawerCount != null) ? desk.drawerCount : (dWidth <= 80 ? 1 : 2);
        const innerSvgW = dSvgW - legT;
        const drawerSvgW = innerSvgW / numDrawers;
        const drawerSvgH = drawerH * sc;
        const drawerSvgY = deskTopY + deskSurfT;
        const drawerStartX = dSide === 'left' ? deskX : (deskX + legT);
        for (let di = 0; di < numDrawers; di++) {
            const dx = drawerStartX + di * drawerSvgW;
            drawRect(dx + 1, drawerSvgY + 1, drawerSvgW - 2, drawerSvgH - 2, 'rgba(255,255,255,0.7)', STROKE_THIN || STROKE, 0.8);
            const hndW = Math.min(drawerSvgW * 0.4, 20);
            const hndX = dx + (drawerSvgW - hndW) / 2;
            const hndY = drawerSvgY + drawerSvgH * 0.5;
            p.push(`<line x1="${hndX.toFixed(1)}" y1="${hndY.toFixed(1)}" x2="${(hndX + hndW).toFixed(1)}" y2="${hndY.toFixed(1)}" stroke="${STROKE}" stroke-width="1.8"/>`);
        }
        const dimOuterX = dSide === 'left' ? (deskX - 14) : (deskX + dSvgW + 14);
        const drawerSvgY0 = deskTopY + deskSurfT;
        if (dSide === 'left') {
            dimVLeftFn(dimOuterX, drawerSvgY0, drawerSvgY0 + drawerH * sc, `${_bpMm(drawerH)}`);
            dimVLeftFn(dimOuterX - 36, drawerSvgY0 + drawerH * sc, deskBotY, `${_bpMm((dHeight - DESK_SURFACE_T - drawerH))}`);
        } else {
            dimVFn(dimOuterX, drawerSvgY0, drawerSvgY0 + drawerH * sc, `${_bpMm(drawerH)}`);
            dimVFn(dimOuterX + 36, drawerSvgY0 + drawerH * sc, deskBotY, `${_bpMm((dHeight - DESK_SURFACE_T - drawerH))}`);
        }
    }
    dimHFn(deskX, deskX + dSvgW, oy + dH + 36, `${_bpMm(dWidth)}`);
    if (dSide === 'left') dimVLeftFn(deskX - 14, deskTopY, deskBotY, `${_bpMm(dHeight)}`);
    else dimVFn(deskX + dSvgW + 14, deskTopY, deskBotY, `${_bpMm(dHeight)}`);
    const midX = deskX + dSvgW / 2;
    const midY = deskTopY + dSvgH / 2;
    p.push(`<text x="${midX.toFixed(1)}" y="${(midY + 4).toFixed(1)}" text-anchor="middle" font-family="${FONT || 'Rubik,Tahoma,sans-serif'}" font-size="11" fill="${STROKE}" opacity="0.85">שולחן צד</text>`);
}

function _bpCenterWritingDesk(cw) {
    if (state.presetId !== 'writing-desk') return null;
    const wing = cw || (state.wings && state.wings.center);
    if (!wing || !wing.writingDesk) return null;
    return {
        width: wing.width || state.width || 120,
        depth: wing.depth || state.depth || 60,
        height: wing.writingDesk.height != null ? wing.writingDesk.height : (wing.globalHeight || 75),
        hasDrawers: wing.writingDesk.hasDrawers !== false,
        drawerCount: wing.writingDesk.drawerCount,
        drawerHeight: wing.writingDesk.drawerHeight != null ? wing.writingDesk.drawerHeight : 12
    };
}

/** Standalone writing desk — front view (two legs + surface + optional drawers) */
function _bpDrawWritingDeskFrontParts(p, wd, ox, oy, dW, dH, sc, fill, STROKE, STROKE_THIN, FONT, dimHFn, dimVFn, dimVLeftFn) {
    if (!wd) return;
    const dWidth = wd.width || 120;
    const dHeight = wd.height || 75;
    const drawerHcm = wd.drawerHeight || 12;
    const legTCm = state.thickness || 1.7;
    const legT = legTCm * sc;
    const deskSurfT = DESK_SURFACE_T * sc;
    const deskBotY = oy + dH;
    const deskTopY = oy;
    const FILL_WD = fill || '#e8f0fe';
    const drawRect = (x, y, w, h, f, s, sw) => p.push(`<rect x="${(+x).toFixed(1)}" y="${(+y).toFixed(1)}" width="${(+w).toFixed(1)}" height="${(+h).toFixed(1)}" fill="${f}" stroke="${s}" stroke-width="${sw || 1.5}"/>`);

    drawRect(ox, deskTopY + deskSurfT, legT, dH - deskSurfT, FILL_WD, STROKE, 1.5);
    drawRect(ox + dW - legT, deskTopY + deskSurfT, legT, dH - deskSurfT, FILL_WD, STROKE, 1.5);
    drawRect(ox, deskTopY, dW, deskSurfT, FILL_WD, STROKE, 1.5);

    if (wd.hasDrawers !== false) {
        const numDrawers = wd.drawerCount != null ? wd.drawerCount : (dWidth <= 80 ? 1 : 2);
        const innerSvgW = dW - 2 * legT;
        const drawerSvgW = innerSvgW / numDrawers;
        const drawerSvgH = drawerHcm * sc;
        const drawerSvgY = deskTopY + deskSurfT;
        const drawerStartX = ox + legT;
        for (let di = 0; di < numDrawers; di++) {
            const dx = drawerStartX + di * drawerSvgW;
            drawRect(dx + 1, drawerSvgY + 1, drawerSvgW - 2, drawerSvgH - 2, 'rgba(255,255,255,0.7)', STROKE_THIN || STROKE, 0.8);
            const hndW = Math.min(drawerSvgW * 0.4, 20);
            const hndX = dx + (drawerSvgW - hndW) / 2;
            const hndY = drawerSvgY + drawerSvgH * 0.5;
            p.push(`<line x1="${hndX.toFixed(1)}" y1="${hndY.toFixed(1)}" x2="${(hndX + hndW).toFixed(1)}" y2="${hndY.toFixed(1)}" stroke="${STROKE}" stroke-width="1.8"/>`);
        }
        dimVFn(ox + dW + 14, drawerSvgY, drawerSvgY + drawerSvgH, `${_bpMm(drawerHcm)}`);
        dimVFn(ox + dW + 48, drawerSvgY + drawerSvgH, deskBotY, `${_bpMm((dHeight - DESK_SURFACE_T - drawerHcm))}`);
    } else {
        drawRect(ox + legT, deskTopY + deskSurfT, dW - 2 * legT, dH - deskSurfT, 'white', STROKE_THIN || STROKE, 0.5);
    }

    dimHFn(ox, ox + dW, deskBotY + 36, `${_bpMm(dWidth)}`);
    dimVLeftFn(ox - 14, deskTopY, deskBotY, `${_bpMm(dHeight)}`);
    if (dW - 2 * legT > 20) {
        dimHFn(ox + legT, ox + dW - legT, deskBotY + 18, `${_bpMm((dWidth - 2 * legTCm))}`, false);
    }
    const midX = ox + dW / 2;
    const midY = deskTopY + dH / 2;
    p.push(`<text x="${midX.toFixed(1)}" y="${(midY + 4).toFixed(1)}" text-anchor="middle" font-family="${FONT || 'Rubik,Tahoma,sans-serif'}" font-size="12" fill="${STROKE}" opacity="0.85">שולחן כתיבה</text>`);
}

/** Writing desk — side profile (depth × height) */
function _bpDrawWritingDeskSideParts(p, wd, ox, oy, dW, dH, sc, fill, STROKE, STROKE_THIN, FONT, dimHFn, dimVFn, dimVLeftFn) {
    if (!wd) return;
    const dDepth = wd.depth || 60;
    const dHeight = wd.height || 75;
    const drawerHcm = wd.drawerHeight || 12;
    const legTCm = state.thickness || 1.7;
    const legT = legTCm * sc;
    const deskSurfT = DESK_SURFACE_T * sc;
    const deskBotY = oy + dH;
    const deskTopY = oy;
    const FILL_WD = fill || '#e8f0fe';
    const drawRect = (x, y, w, h, f, s, sw) => p.push(`<rect x="${(+x).toFixed(1)}" y="${(+y).toFixed(1)}" width="${(+w).toFixed(1)}" height="${(+h).toFixed(1)}" fill="${f}" stroke="${s}" stroke-width="${sw || 1.5}"/>`);

    drawRect(ox, deskTopY, dW, deskSurfT, FILL_WD, STROKE, 1.5);
    drawRect(ox + dW - legT, deskTopY + deskSurfT, legT, dH - deskSurfT, FILL_WD, STROKE, 1.5);
    if (wd.hasDrawers !== false) {
        const drawerSvgH = drawerHcm * sc;
        const drawerSvgY = deskTopY + deskSurfT;
        const drawerFrontW = legT;
        drawRect(ox, drawerSvgY + 1, drawerFrontW, drawerSvgH - 2, 'rgba(255,255,255,0.7)', STROKE_THIN || STROKE, 0.8);
        dimVLeftFn(ox - 14, drawerSvgY, drawerSvgY + drawerSvgH, `${_bpMm(drawerHcm)}`);
    }
    dimHFn(ox, ox + dW, deskBotY + 36, `${_bpMm(dDepth)}`);
    dimVLeftFn(ox - 14, deskTopY, deskBotY, `${_bpMm(dHeight)}`);
    p.push(`<text x="${(ox + dW / 2).toFixed(1)}" y="${(deskTopY + dH / 2 + 4).toFixed(1)}" text-anchor="middle" font-family="${FONT || 'Rubik,Tahoma,sans-serif'}" font-size="11" fill="${STROKE}" opacity="0.7">מבט צד</text>`);
}

/** Corner desk — front elevation of the protruding unit (desktop + outer leg + knee space + drawers). */
function _bpDrawCornerDeskFrontParts(p, cu, ox, oy, dW, dH, sc, STROKE, STROKE_THIN, FONT, dimHFn, dimVFn, dimVLeftFn) {
    if (!cu) return;
    const cuW = cu.width || 60;
    const cuH = cu.height || 90;
    const cuD = cu.depth || 54;
    const tCm = state.thickness || 1.7;
    const legT = tCm * sc;
    const deskSurfT = DESK_SURFACE_T * sc;
    const deskBotY = oy + dH;
    const deskTopY = oy;
    const isLeft = cu.side !== 'right';
    const floating = !!cu.deskFloating;
    const FILL = '#fef9c3';
    const drawRect = (x, y, w, h, f, s, sw) => p.push(`<rect x="${(+x).toFixed(1)}" y="${(+y).toFixed(1)}" width="${(+w).toFixed(1)}" height="${(+h).toFixed(1)}" fill="${f}" stroke="${s}" stroke-width="${sw || 1.5}"/>`);

    const hasLeg = !floating;
    const legX = isLeft ? ox : (ox + dW - legT);
    const innerX = hasLeg ? (isLeft ? ox + legT : ox) : ox;
    const innerW = hasLeg ? Math.max(dW - legT, 2) : dW;

    // Outer support panel (omitted when floating)
    if (hasLeg) {
        drawRect(legX, deskTopY + deskSurfT, legT, dH - deskSurfT, FILL, STROKE, 1.5);
    }

    // Floor line under the open knee space
    p.push(`<line x1="${innerX.toFixed(1)}" y1="${deskBotY.toFixed(1)}" x2="${(innerX + innerW).toFixed(1)}" y2="${deskBotY.toFixed(1)}" stroke="${STROKE_THIN || STROKE}" stroke-width="1" stroke-dasharray="4,3"/>`);

    // Desktop board
    drawRect(ox, deskTopY, dW, deskSurfT, FILL, STROKE, 1.5);

    const numDrawers = Math.max(0, Math.min(cu.deskDrawerCount || 0, 3));
    const drawerHcm = cu.deskDrawerHeight || 13;
    const gapCm = 0.4;
    if (numDrawers > 0) {
        for (let i = 0; i < numDrawers; i++) {
            const topOffsetCm = DESK_SURFACE_T + i * (drawerHcm + gapCm);
            const dy = deskTopY + topOffsetCm * sc;
            const dh = drawerHcm * sc;
            drawRect(innerX + 1.5, dy + 1, innerW - 3, dh - 2, 'rgba(255,255,255,0.85)', STROKE, 1);
            const hndW = Math.min(innerW * 0.4, 28);
            const hndX = innerX + (innerW - hndW) / 2;
            const hndY = dy + dh * 0.5;
            p.push(`<line x1="${hndX.toFixed(1)}" y1="${hndY.toFixed(1)}" x2="${(hndX + hndW).toFixed(1)}" y2="${hndY.toFixed(1)}" stroke="${STROKE}" stroke-width="2"/>`);
        }
        const drawersZoneH = numDrawers * drawerHcm + gapCm * Math.max(numDrawers - 1, 0);
        const kneeH = Math.max(cuH - DESK_SURFACE_T - drawersZoneH, 0);
        const dimX = isLeft ? (ox + dW + 18) : (ox - 18);
        const drawerTopY = deskTopY + deskSurfT;
        const drawerBotY = drawerTopY + drawersZoneH * sc;
        if (isLeft) {
            dimVFn(dimX, drawerTopY, drawerBotY, `${_bpMm(drawersZoneH)}`);
            if (kneeH > 1) dimVFn(dimX + 36, drawerBotY, deskBotY, `${_bpMm(kneeH)}`);
        } else {
            dimVLeftFn(dimX, drawerTopY, drawerBotY, `${_bpMm(drawersZoneH)}`);
            if (kneeH > 1) dimVLeftFn(dimX - 36, drawerBotY, deskBotY, `${_bpMm(kneeH)}`);
        }
    }

    // Cabinet-connection side
    const cabX = isLeft ? (ox + dW) : ox;
    p.push(`<line x1="${cabX.toFixed(1)}" y1="${deskTopY.toFixed(1)}" x2="${cabX.toFixed(1)}" y2="${deskBotY.toFixed(1)}" stroke="${STROKE}" stroke-width="1.4" stroke-dasharray="5,4"/>`);
    const cabLblX = isLeft ? (cabX - 8) : (cabX + 8);
    p.push(`<text x="${cabLblX.toFixed(1)}" y="${(deskTopY + deskSurfT + 14).toFixed(1)}" text-anchor="${isLeft ? 'end' : 'start'}" font-family="${FONT || 'Rubik,Tahoma,sans-serif'}" font-size="11" fill="${STROKE}" opacity="0.7">חיבור לארון</text>`);

    const midX = ox + dW / 2;
    const midY = deskTopY + dH * 0.62;
    p.push(`<text x="${midX.toFixed(1)}" y="${midY.toFixed(1)}" text-anchor="middle" font-family="${FONT || 'Rubik,Tahoma,sans-serif'}" font-size="13" fill="${STROKE}" opacity="0.55">שולחן פינתי${floating ? ' (מרחף)' : ''}</text>`);

    dimHFn(ox, ox + dW, deskBotY + 36, `${_bpMm(cuW)}`);
    if (isLeft) dimVLeftFn(ox - 14, deskTopY, deskBotY, `${_bpMm(cuH)}`);
    else dimVFn(ox + dW + 14, deskTopY, deskBotY, `${_bpMm(cuH)}`);
    p.push(`<text x="${midX.toFixed(1)}" y="${(deskBotY + 56).toFixed(1)}" text-anchor="middle" font-family="${FONT || 'Rubik,Tahoma,sans-serif'}" font-size="12" fill="${STROKE}" opacity="0.75">עומק (לאורך הארון): ${_bpMm(cuD)} מ"מ</text>`);
}

/** Side cabinet silhouette on center front view */
function _bpDrawSideCabinetFrontParts(p, sc, ox, oy, dW, dH, scScale, wgH, pH, drawRectFn, dimHFn, STROKE, FONT) {
    if (!sc) return;
    const FILL_SC = '#e0f2fe';
    const drawOne = (onRight, scWcm) => {
        const scSvgW = scWcm * scScale;
        const scHcm = sc.globalHeight || wgH;
        const scSvgH = scHcm * scScale;
        const scX = onRight ? (ox + dW) : (ox - scSvgW);
        const scTopY = oy + dH - scSvgH;
        const scPHcm = sc.plinthHeight != null ? sc.plinthHeight : pH;
        const scPH = scPHcm * scScale;
        drawRectFn(scX, scTopY, scSvgW, scSvgH, FILL_SC, STROKE, 1.5);
        if (scPH > 0) drawRectFn(scX, oy + dH - scPH, scSvgW, scPH, '#cbd5e1', STROKE, 1);
        p.push(`<text x="${(scX + scSvgW / 2).toFixed(1)}" y="${(scTopY + scSvgH / 2 + 4).toFixed(1)}" text-anchor="middle" font-family="${FONT || 'Rubik,Tahoma,sans-serif'}" font-size="11" fill="${STROKE}" opacity="0.85">ארון צד</text>`);
        dimHFn(scX, scX + scSvgW, oy + dH + 52, `${_bpMm(scWcm)}`);
    };
    if (sc.side === 'right' || sc.side === 'both') drawOne(true, sc.widthRight || sc.width || 40);
    if (sc.side === 'left' || sc.side === 'both') drawOne(false, sc.widthLeft || sc.width || 40);
}

/** Door thickness added to side-cabinet depth when main cabinet has edge doors (matches engine-core). */
function _bpSideCabinetDoorExtra(cw, scSide) {
    if (!cw || !cw.hasDoors) return 0;
    const cols = cw.columns;
    if (!cols || !cols.length) return 0;
    const edgeCol = (scSide === 'right') ? cols[cols.length - 1] : cols[0];
    if (!edgeCol.doors || !edgeCol.doors.length) return 0;
    return cw.thickness || state.thickness || 1.7;
}

/** Depth (cm) visible in side elevation — main cabinet depth + optional door overlap. */
function _bpSideCabinetSideDepthCm(cw, scSide) {
    const centerD = cw ? (cw.depth || 54) : 54;
    return centerD + _bpSideCabinetDoorExtra(cw, scSide);
}

const _BP_STROKE = '#1e3a5f';
const _BP_STROKE_THIN = '#94a3b8';
const _BP_FONT = 'Rubik,Tahoma,sans-serif';
const _BP_CUT_STROKE = '#dc2626';
const _BP_CUT_DIM_OPACITY = 0.72;
const _BP_DIM_FONT = 11;
const _BP_CELL_DIM_FONT = 10;
const _BP_DOOR_STYLE_SUFFIX = { solid: '', framed_melamine: ' מסגרת', glass_melamine: ' זכוכית', glass_black: ' זכ.שחורה', glass_gold: ' זכ.זהב', glass_mirror: ' מראה' };
const _BP_SPLIT_FILL = '#6e675c';

/** Draw the קושרת as two stacked boards (not one thick slab). */
function _bpDrawSplitDoubleBand(rectFn, x, yTop, w, totalH, stroke) {
    const half = totalH / 2;
    rectFn(x, yTop, w, half, _BP_SPLIT_FILL, stroke, 1.4);
    rectFn(x, yTop + half, w, half, _BP_SPLIT_FILL, stroke, 1.4);
}

function _bpEscSvgText(str) {
    return String(str || '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function _bpEnsureCutouts() {
    if (!state.blueprintCutouts) state.blueprintCutouts = [];
    return state.blueprintCutouts;
}

function _bpCutoutDimHInner(x1, x2, y, lbl, above) {
    const tk = 4, lo = above ? -6 : 10;
    const mx = (x1 + x2) / 2;
    return [
        `<line x1="${x1.toFixed(1)}" y1="${(y - tk / 2).toFixed(1)}" x2="${x1.toFixed(1)}" y2="${(y + tk / 2).toFixed(1)}" stroke="${_BP_CUT_STROKE}" stroke-width="0.75" stroke-opacity="${_BP_CUT_DIM_OPACITY}"/>`,
        `<line x1="${x2.toFixed(1)}" y1="${(y - tk / 2).toFixed(1)}" x2="${x2.toFixed(1)}" y2="${(y + tk / 2).toFixed(1)}" stroke="${_BP_CUT_STROKE}" stroke-width="0.75" stroke-opacity="${_BP_CUT_DIM_OPACITY}"/>`,
        `<line class="bp-cutout-dim-hit" x1="${x1.toFixed(1)}" y1="${y.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y.toFixed(1)}" stroke="${_BP_CUT_STROKE}" stroke-width="8" stroke-opacity="0.001"/>`,
        `<line x1="${x1.toFixed(1)}" y1="${y.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y.toFixed(1)}" stroke="${_BP_CUT_STROKE}" stroke-width="0.75" stroke-opacity="${_BP_CUT_DIM_OPACITY}"/>`,
        `<rect class="bp-cutout-dim-label-hit" x="${(mx - 24).toFixed(1)}" y="${(y + lo - 9).toFixed(1)}" width="48" height="12" fill="transparent"/>`,
        `<text x="${mx.toFixed(1)}" y="${(y + lo).toFixed(1)}" text-anchor="middle" font-family="${_BP_FONT}" font-size="9.5" font-weight="500" fill="${_BP_CUT_STROKE}" fill-opacity="${_BP_CUT_DIM_OPACITY}">${lbl}</text>`
    ].join('');
}

function _bpCutoutDimVInner(x, y1, y2, lbl) {
    const tk = 4, my = (y1 + y2) / 2, tx = x + 12;
    return [
        `<line x1="${(x - tk / 2).toFixed(1)}" y1="${y1.toFixed(1)}" x2="${(x + tk / 2).toFixed(1)}" y2="${y1.toFixed(1)}" stroke="${_BP_CUT_STROKE}" stroke-width="0.75" stroke-opacity="${_BP_CUT_DIM_OPACITY}"/>`,
        `<line x1="${(x - tk / 2).toFixed(1)}" y1="${y2.toFixed(1)}" x2="${(x + tk / 2).toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${_BP_CUT_STROKE}" stroke-width="0.75" stroke-opacity="${_BP_CUT_DIM_OPACITY}"/>`,
        `<line class="bp-cutout-dim-hit" x1="${x.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${_BP_CUT_STROKE}" stroke-width="8" stroke-opacity="0.001"/>`,
        `<line x1="${x.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${_BP_CUT_STROKE}" stroke-width="0.75" stroke-opacity="${_BP_CUT_DIM_OPACITY}"/>`,
        `<rect class="bp-cutout-dim-label-hit" x="${(tx - 24).toFixed(1)}" y="${(my + 3 - 9).toFixed(1)}" width="48" height="12" fill="transparent" transform="rotate(-90,${tx.toFixed(1)},${(my + 3).toFixed(1)})"/>`,
        `<text x="${tx.toFixed(1)}" y="${(my + 3).toFixed(1)}" text-anchor="middle" font-family="${_BP_FONT}" font-size="9.5" font-weight="500" fill="${_BP_CUT_STROKE}" fill-opacity="${_BP_CUT_DIM_OPACITY}" transform="rotate(-90,${tx.toFixed(1)},${my.toFixed(1)})">${lbl}</text>`
    ].join('');
}

function _bpCutoutDimOffset(co, role) {
    const off = co.dimOffsets && co.dimOffsets[role];
    return { x: off && off.x ? off.x : 0, y: off && off.y ? off.y : 0 };
}

function _bpCutoutDimTransform(off) {
    if (!off || (!off.x && !off.y)) return '';
    return ` transform="translate(${off.x.toFixed(1)},${off.y.toFixed(1)})"`;
}

function _bpCutoutDimHGroup(role, x1, x2, y, lbl, above, offset) {
    return `<g class="bp-cutout-dim-draggable" data-dim="h" data-dim-role="${role}"${_bpCutoutDimTransform(offset)} style="cursor:ns-resize">${_bpCutoutDimHInner(x1, x2, y, lbl, above)}</g>`;
}

function _bpCutoutDimVGroup(role, x, y1, y2, lbl, offset) {
    return `<g class="bp-cutout-dim-draggable" data-dim="v" data-dim-role="${role}"${_bpCutoutDimTransform(offset)} style="cursor:ew-resize">${_bpCutoutDimVInner(x, y1, y2, lbl)}</g>`;
}

function _bpCutoutDimH(x1, x2, y, lbl, above) {
    return _bpCutoutDimHInner(x1, x2, y, lbl, above);
}

function _bpCutoutDimV(x, y1, y2, lbl) {
    return _bpCutoutDimVInner(x, y1, y2, lbl);
}

function _bpBuildCutoutSvg(co, ox, oy, dW, dH, sc, cabWidthCm, cabHeightCm) {
    const cabWidthMm = Math.round(cabWidthCm * 10);
    const cabHeightMm = Math.round(cabHeightCm * 10);
    const wMm = co.widthMm || 80;
    const hMm = co.heightMm || 120;
    let leftMm = co.leftMm || 0;
    let bottomMm = co.bottomMm || 0;
    leftMm = Math.max(0, Math.min(cabWidthMm - wMm, leftMm));
    bottomMm = Math.max(0, Math.min(cabHeightMm - hMm, bottomMm));

    const wCm = wMm / 10, hCm = hMm / 10;
    const floorY = oy + dH;
    const rx = ox + (leftMm / 10) * sc;
    const rw = wCm * sc;
    const rh = hCm * sc;
    const ry = floorY - (bottomMm / 10 + hCm) * sc;
    const lblRaw = (co.label || '').trim();
    const lbl = lblRaw ? _bpEscSvgText(lblRaw) : '';

    const cutoutG = [
        `<g class="bp-cutout" data-cutout-id="${co.id}" data-view-key="${co.viewKey}"`,
        ` data-ox="${ox.toFixed(2)}" data-oy="${oy.toFixed(2)}" data-dw="${dW.toFixed(2)}" data-dh="${dH.toFixed(2)}"`,
        ` data-sc="${sc.toFixed(4)}" data-cab-w-mm="${cabWidthMm}" data-cab-h-mm="${cabHeightMm}"`,
        ` data-w-mm="${wMm}" data-h-mm="${hMm}" style="cursor:move">`,
        `<rect class="bp-cutout-rect" x="${rx.toFixed(1)}" y="${ry.toFixed(1)}" width="${rw.toFixed(1)}" height="${rh.toFixed(1)}"`,
        ` fill="rgba(220,38,38,0.06)" stroke="${_BP_CUT_STROKE}" stroke-width="1" stroke-opacity="0.55" stroke-dasharray="3,2"/>`,
        lbl ? `<text class="bp-cutout-label" x="${(rx + rw / 2).toFixed(1)}" y="${(ry + rh / 2 + 3).toFixed(1)}" text-anchor="middle"` +
        ` font-family="${_BP_FONT}" font-size="9" font-weight="600" fill="${_BP_CUT_STROKE}" fill-opacity="0.75" pointer-events="none">${lbl}</text>` : '',
        `</g>`
    ].join('');

    const distLeft = leftMm;
    const distRight = cabWidthMm - leftMm - wMm;
    const wallDim = distLeft <= distRight
        ? _bpCutoutDimHGroup('wall', ox, rx, floorY + 24, `${distLeft}`, false, _bpCutoutDimOffset(co, 'wall'))
        : _bpCutoutDimHGroup('wall', rx + rw, ox + dW, floorY + 24, `${distRight}`, false, _bpCutoutDimOffset(co, 'wall'));

    const dimsG = [
        `<g class="bp-cutout-dims" data-cutout-id="${co.id}">`,
        _bpCutoutDimHGroup('w', rx, rx + rw, ry - 10, `${wMm}`, true, _bpCutoutDimOffset(co, 'w')),
        _bpCutoutDimVGroup('h', rx + rw + 14, ry, ry + rh, `${hMm}`, _bpCutoutDimOffset(co, 'h')),
        _bpCutoutDimVGroup('bottom', rx - 14, ry + rh, floorY, `${bottomMm}`, _bpCutoutDimOffset(co, 'bottom')),
        wallDim,
        `</g>`
    ].join('');

    return { cutoutG, dimsG, leftMm, bottomMm };
}

function _bpEnsureCellDimOffsets() {
    if (!state.blueprintCellDimOffsets) state.blueprintCellDimOffsets = {};
    return state.blueprintCellDimOffsets;
}

function _bpEnsureDimOffsets() {
    if (!state.blueprintDimOffsets) state.blueprintDimOffsets = {};
    return state.blueprintDimOffsets;
}

function _bpDimStoreKey(viewKey, role) {
    return String(viewKey || 'center') + '|' + role;
}

function _bpDimOffset(viewKey, role) {
    const off = _bpEnsureDimOffsets()[_bpDimStoreKey(viewKey, role)];
    return off ? { x: off.x || 0, y: off.y || 0 } : { x: 0, y: 0 };
}

function _bpDimTransform(viewKey, role) {
    const off = _bpDimOffset(viewKey, role);
    if (!off.x && !off.y) return '';
    return ` transform="translate(${off.x.toFixed(1)},${off.y.toFixed(1)})"`;
}

function _bpCellDimStoreKey(viewKey, cellKey) {
    return String(viewKey || 'center') + '|' + cellKey;
}

function _bpCellDimOffset(viewKey, cellKey) {
    const off = _bpEnsureCellDimOffsets()[_bpCellDimStoreKey(viewKey, cellKey)];
    return off ? { x: off.x || 0, y: off.y || 0 } : { x: 0, y: 0 };
}

/** Per-item override map, else defaultFlag (true = show). */
function _bpDimIsShown(map, defaultFlag, viewKey, itemKey) {
    const k = String(viewKey || 'center') + '|' + itemKey;
    if (Object.prototype.hasOwnProperty.call(map || {}, k)) return !!map[k];
    return defaultFlag !== false;
}

function _bpCellDimIsShown(viewKey, cellKey) {
    return _bpDimIsShown(state.blueprintCellDimShown, state.blueprintInternalDimsDefault, viewKey, cellKey);
}

function _bpColWidthDimIsShown(viewKey, colKey) {
    return _bpDimIsShown(state.blueprintColWidthDimShown, state.blueprintColWidthDimsDefault, viewKey, colKey);
}

function _bpPushCellDimToggleHit(p, viewKey, cellKey, hx, hy, hw, hh) {
    if (!p || !(hw > 2) || !(hh > 2)) return;
    p.push(
        `<rect class="bp-cell-dim-toggle-hit" data-view-key="${viewKey || 'center'}" data-cell-dim-key="${cellKey}"` +
        ` x="${(+hx).toFixed(1)}" y="${(+hy).toFixed(1)}" width="${(+hw).toFixed(1)}" height="${(+hh).toFixed(1)}"` +
        ` fill="transparent" style="cursor:pointer" pointer-events="all"/>`
    );
}

function _bpPushColWidthToggleHit(p, viewKey, colKey, x1, x2, y) {
    if (!p) return;
    const w = (+x2) - (+x1);
    if (!(w > 2)) return;
    const hy = (+y) - 10;
    p.push(
        `<rect class="bp-col-width-toggle-hit" data-view-key="${viewKey || 'center'}" data-col-dim-key="${colKey}"` +
        ` x="${(+x1).toFixed(1)}" y="${hy.toFixed(1)}" width="${w.toFixed(1)}" height="22"` +
        ` fill="transparent" style="cursor:pointer" pointer-events="all"/>`
    );
}

/**
 * Push internal cell height label when visible; always emit a click hit (hitBox or small label area).
 * hitBox: optional { x, y, w, h } covering the cell/zone for click-to-toggle.
 */
function _bpPushCellDimLabel(p, viewKey, cellKey, x, y, heightVal, hitBox) {
    if (hitBox && hitBox.w > 2 && hitBox.h > 2) {
        _bpPushCellDimToggleHit(p, viewKey, cellKey, hitBox.x, hitBox.y, hitBox.w, hitBox.h);
    } else {
        _bpPushCellDimToggleHit(p, viewKey, cellKey, x - 28, y - 18, 56, 28);
    }
    if (!_bpCellDimIsShown(viewKey, cellKey)) return;
    const off = _bpCellDimOffset(viewKey, cellKey);
    const tf = (off.x || off.y) ? ` transform="translate(${off.x.toFixed(1)},${off.y.toFixed(1)})"` : '';
    p.push(
        `<g class="bp-cell-dim-draggable" data-dim="v" data-cell-dim-key="${cellKey}" data-view-key="${viewKey || 'center'}"${tf} style="cursor:ew-resize">` +
        `<rect class="bp-cell-dim-hit" x="${(x - 32).toFixed(1)}" y="${(y - 10).toFixed(1)}" width="64" height="12" fill="transparent"/>` +
        `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="middle" font-family="${_BP_FONT}" font-size="${_BP_CELL_DIM_FONT}" fill="${_BP_STROKE}" opacity="0.75" pointer-events="none">↕ ${heightVal}</text></g>`
    );
}

/**
 * Per-column width dim — gated by visibility; always emits click hits.
 * makeDimHFn(x1,x2,y,lbl,above). Optional faceY/faceH: only a bottom strip of the
 * column is clickable (avoids stealing clicks from cell-height hits).
 */
function _bpMaybePushColWidthDim(p, viewKey, ci, x1, x2, y, lbl, makeDimHFn, above, faceY, faceH) {
    const colKey = 'colW:c' + ci;
    if (faceY != null && faceH > 2) {
        const w = (+x2) - (+x1);
        if (w > 2) {
            const stripH = Math.min(28, +faceH);
            const stripY = (+faceY) + (+faceH) - stripH;
            p.push(
                `<rect class="bp-col-width-toggle-hit" data-view-key="${viewKey || 'center'}" data-col-dim-key="${colKey}"` +
                ` x="${(+x1).toFixed(1)}" y="${stripY.toFixed(1)}" width="${w.toFixed(1)}" height="${stripH.toFixed(1)}"` +
                ` fill="transparent" style="cursor:pointer" pointer-events="all"/>`
            );
        }
    }
    _bpPushColWidthToggleHit(p, viewKey, colKey, x1, x2, y);
    if (!_bpColWidthDimIsShown(viewKey, colKey)) return;
    if (typeof makeDimHFn === 'function') makeDimHFn(x1, x2, y, lbl, above === undefined ? false : above);
}

/**
 * Extra overall-height dimension for every column shorter than the wing max.
 * dimVFn(x, yTop, yBot, labelMm) — same convention as the main overall height (floor → column top).
 */
function _bpDrawShorterColumnOverallHeights(dimVFn, cols, colXPositions, oy, dH, sc, wgH, ox, dW) {
    if (!dimVFn || !cols || !colXPositions || cols.length < 2) return;
    const heights = cols.map(c => (c && c.height) || wgH);
    const maxH = Math.max.apply(null, heights);
    let leftSlot = 0;
    let rightSlot = 0;
    const cabMid = ox + dW / 2;
    cols.forEach((col, ci) => {
        const h = heights[ci];
        if (!(h < maxH - 0.05)) return;
        const cp = colXPositions[ci];
        if (!cp) return;
        const topY = (cp.colTopY != null) ? cp.colTopY : (oy + dH - h * sc);
        const botY = oy + dH;
        if (botY - topY < 8) return;
        const colMid = (cp.x1 + cp.x2) / 2;
        let dimX;
        if (colMid <= cabMid) {
            dimX = cp.x1 - 18 - leftSlot * 22;
            // Keep clear of the main overall-height line at ox-54
            if (dimX < ox - 48) dimX = Math.min(cp.x1 - 18, ox - 28);
            leftSlot++;
        } else {
            dimX = cp.x2 + 18 + rightSlot * 22;
            rightSlot++;
        }
        dimVFn(dimX, topY, botY, `${_bpMm(h)}`);
    });
}

function _bpShelfTCm() {
    return state.thickness || 1.7;
}

// Match engine-core startShelvesY — bottom of first clear cell row (cm from floor)
function _bpRowBaseCm(col, plinthH) {
    const t = _bpShelfTCm();
    const fo = col.floorOffset || 0;
    if (col.type === 'desk') return (col.deskHeight || 80) + (col.deskClearance || 80);
    // Blueprint front-view row coords are relative to column bottom (colBotSvgY).
    // floorOffset is already applied there — do NOT add fo again to row bounds.
    if (fo > 0) return t;
    if (col.noPlinth) return t;
    const isBathroomRegalim = state.presetId === 'bathroom' && state.cabinetModel === 'regalim';
    if (isBathroomRegalim) return plinthH;
    return plinthH + t;
}

/**
 * Draw structural top + bottom boards (already in clear-cell math via _bpRowBaseCm / top t).
 * shelfLineFn(x1, syCenter, x2) — same convention as makeShelfLine / shelfLine.
 * Coordinates: sy measured up from colBotSvgY in SVG (syCm from column bottom).
 */
function _bpDrawTopBottomBoards(shelfLineFn, col, colX, colW, colBotSvgY, visibleHCm, plinthH, sc) {
    if (!shelfLineFn || !col || !(visibleHCm > 0) || !(colW > 2)) return;
    if (col.type === 'desk') return; // desk columns use their own floor/desk geometry
    const t = _bpShelfTCm();
    const fo = col.floorOffset || 0;
    const isBathroomRegalim = state.presetId === 'bathroom' && state.cabinetModel === 'regalim';

    // Bottom board center (cm from column bottom) — matches engine-core plinthTop / floor board
    let botCenterCm = null;
    if (fo > 0 || col.noPlinth) botCenterCm = t / 2;
    else if (isBathroomRegalim) botCenterCm = null; // regalim bathroom: plinth plate is the only floor
    else botCenterCm = (plinthH || 0) + t / 2;

    if (botCenterCm != null && botCenterCm > 0 && botCenterCm < visibleHCm) {
        shelfLineFn(colX, colBotSvgY - botCenterCm * sc, colX + colW);
    }

    // Top board center — matches engine-core createBoard at col.height - t/2
    const topCenterCm = visibleHCm - t / 2;
    if (topCenterCm > 0 && (botCenterCm == null || topCenterCm > botCenterCm + t * 0.5)) {
        shelfLineFn(colX, colBotSvgY - topCenterCm * sc, colX + colW);
    }
}

function _bpColumnSitsOnFloor(col) {
    if (!col || col.type === 'desk') return false;
    if (col.floorOffset > 0) return false;
    if (col.noPlinth) return false;
    return true;
}

function _bpAnyColumnOnFloor(cols) {
    return (cols || []).some(_bpColumnSitsOnFloor);
}

function _bpWidthDimBaseY(oy, dH, pH, sc, cols) {
    return _bpAnyColumnOnFloor(cols) ? oy + dH + pH * sc : oy + dH;
}

function _bpDrawOuterSideWalls(p, drawVline, ox, dW, colXPositions, sc) {
    if (!colXPositions || !colXPositions.length) return;
    const first = colXPositions[0];
    const last = colXPositions[colXPositions.length - 1];
    drawVline(p, ox, first.colTopY, first.colBotY, sc, null, 'left');
    drawVline(p, ox + dW, last.colTopY, last.colBotY, sc, null, 'right');
}

function _bpClearCellHeightCm(rowBotCm, rowTopCm, shelfT) {
    const t = shelfT != null ? shelfT : _bpShelfTCm();
    return Math.max(0, rowTopCm - rowBotCm - t);
}

function _bpClearCellHeightMm(rowBotCm, rowTopCm, shelfT) {
    return _bpMm(_bpClearCellHeightCm(rowBotCm, rowTopCm, shelfT));
}

function _bpClearCellHeightLabel(rowBotCm, rowTopCm, shelfT) {
    return _bpClearCellHeightMm(rowBotCm, rowTopCm, shelfT);
}

function _bpAppendViewCutouts(p, viewKey, ox, oy, dW, dH, sc, cabWidthCm, cabHeightCm) {
    const cutouts = _bpEnsureCutouts().filter(c => c.viewKey === viewKey);
    cutouts.forEach(co => {
        const built = _bpBuildCutoutSvg(co, ox, oy, dW, dH, sc, cabWidthCm, cabHeightCm);
        co.leftMm = built.leftMm;
        co.bottomMm = built.bottomMm;
        p.push(built.cutoutG);
        p.push(built.dimsG);
    });
}

function _bpParseSvgFragment(svgString) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(
        '<svg xmlns="http://www.w3.org/2000/svg">' + svgString + '</svg>',
        'image/svg+xml'
    );
    if (doc.querySelector('parsererror')) return null;
    return doc.documentElement.firstElementChild;
}

window._bpReplaceCutoutInSvg = function(svg, co, ox, oy, dW, dH, sc, cabWidthCm, cabHeightCm) {
    if (!svg || !co) return;
    const built = _bpBuildCutoutSvg(co, ox, oy, dW, dH, sc, cabWidthCm, cabHeightCm);
    co.leftMm = built.leftMm;
    co.bottomMm = built.bottomMm;
    const oldCut = svg.querySelector('.bp-cutout[data-cutout-id="' + co.id + '"]');
    const oldDims = svg.querySelector('.bp-cutout-dims[data-cutout-id="' + co.id + '"]');
    if (oldCut) {
        const newCut = _bpParseSvgFragment(built.cutoutG);
        if (newCut) oldCut.replaceWith(svg.ownerDocument.importNode(newCut, true));
    }
    if (oldDims) {
        const newDims = _bpParseSvgFragment(built.dimsG);
        if (newDims) oldDims.replaceWith(svg.ownerDocument.importNode(newDims, true));
    }
};

const _BP_HONEYCOMB_TYPES = new Set(['open_cell', 'side_open_cell', 'honeycomb']);

function _bpIsHoneycombType(t) {
    return !!t && _BP_HONEYCOMB_TYPES.has(t);
}

function _bpColumnHasHoneycomb(col) {
    if (!col || !col.compartments) return false;
    for (let i = 0; i < col.compartments.length; i++) {
        const comp = col.compartments[i];
        if (!comp) continue;
        if (_bpIsHoneycombType(comp.type)) return true;
        if (comp.partition && comp.subCells) {
            for (const sub of comp.subCells) {
                if (!sub) continue;
                if (_bpIsHoneycombType(sub.type)) return true;
                if (Array.isArray(sub.zonesType) && sub.zonesType.some(_bpIsHoneycombType)) return true;
            }
        }
    }
    return false;
}

/** cm → mm label with 1 decimal (e.g. 72.45 → "724.5"). */
function _bpMm(cm) {
    const n = Math.round((Number(cm) || 0) * 100) / 10;
    return n.toFixed(1);
}

function _bpHoneycombInnerWidthMm(wCm, tCm) {
    return _bpMm((+wCm) - 2 * (+tCm));
}

/** Clear inner height (cm) of a honeycomb cubby after lining boards. */
function _bpHoneycombCubbyInnerCm(botCm, topCm, tCm, isBlockStart, isBlockEnd) {
    const t = tCm != null ? tCm : _bpShelfTCm();
    let h = (+topCm) - (+botCm);
    if (isBlockStart) h -= t;
    if (isBlockEnd) h -= t;
    if (!isBlockStart) h -= t / 2;
    if (!isBlockEnd) h -= t / 2;
    return Math.max(0, h);
}

function _bpPushVertInnerDim(p, x, y1, y2, lbl) {
    if (!p || !(y2 - y1 > 16) || lbl == null) return;
    const tk = 7;
    p.push(`<line x1="${(x - tk / 2).toFixed(1)}" y1="${(+y1).toFixed(1)}" x2="${(x + tk / 2).toFixed(1)}" y2="${(+y1).toFixed(1)}" stroke="${_BP_STROKE}" stroke-width="1"/>`);
    p.push(`<line x1="${(x - tk / 2).toFixed(1)}" y1="${(+y2).toFixed(1)}" x2="${(x + tk / 2).toFixed(1)}" y2="${(+y2).toFixed(1)}" stroke="${_BP_STROKE}" stroke-width="1"/>`);
    p.push(`<line x1="${(+x).toFixed(1)}" y1="${(+y1).toFixed(1)}" x2="${(+x).toFixed(1)}" y2="${(+y2).toFixed(1)}" stroke="${_BP_STROKE}" stroke-width="1" marker-start="url(#as)" marker-end="url(#ae)"/>`);
    const my = (+y1 + +y2) / 2;
    const tx = +x + 12;
    p.push(`<text x="${tx.toFixed(1)}" y="${(my + 4).toFixed(1)}" text-anchor="middle" font-family="${_BP_FONT}" font-size="11" fill="${_BP_STROKE}" transform="rotate(-90,${tx.toFixed(1)},${my.toFixed(1)})">${lbl}</text>`);
}

function _bpMaybePushVertInnerHeightDim(p, viewKey, cellKey, x, y1, y2, lbl, hitBox) {
    if (!p || lbl == null) return;
    if (hitBox && hitBox.w > 2 && hitBox.h > 2) {
        _bpPushCellDimToggleHit(p, viewKey, cellKey, hitBox.x, hitBox.y, hitBox.w, hitBox.h);
    } else if (y2 - y1 > 8) {
        _bpPushCellDimToggleHit(p, viewKey, cellKey, x - 10, y1, 28, y2 - y1);
    }
    if (!_bpCellDimIsShown(viewKey, cellKey)) return;
    _bpPushVertInnerDim(p, x, y1, y2, lbl);
}

function _bpMaybePushInnerWidthDim(p, viewKey, dimKey, x1, x2, y, lbl, makeDimHFn, above) {
    if (!p || !(x2 - x1 > 8) || lbl == null) return;
    _bpPushColWidthToggleHit(p, viewKey, dimKey, x1, x2, y);
    if (!_bpColWidthDimIsShown(viewKey, dimKey)) return;
    if (typeof makeDimHFn === 'function') makeDimHFn(x1, x2, y, lbl, above === undefined ? false : above);
}

function _bpMaybePushHoneycombInnerHeight(p, xLeft, yTop, yBot, botCm, topCm, sc, tCm, viewKey, cellKey) {
    const t = tCm != null ? tCm : _bpShelfTCm();
    const innerCm = _bpHoneycombCubbyInnerCm(botCm, topCm, t, true, true);
    if (innerCm <= 0) return;
    const tPx = t * sc;
    _bpMaybePushVertInnerHeightDim(
        p, viewKey || 'center', cellKey || 'hcInner',
        xLeft + tPx * 1.5 + 8, yTop + tPx, yBot - tPx, _bpMm(innerCm),
        { x: xLeft, y: yTop, w: 36, h: yBot - yTop }
    );
}

/** Clear opening width (mm) of a partition sub-zone — matches engine-core half-board trim. */
function _bpPartitionZoneClearWidthMm(colWcm, zoneStartRatio, zoneEndRatio, partTcm, zi, numZones) {
    const spanCm = (+colWcm) * ((+zoneEndRatio) - (+zoneStartRatio));
    const leftTrim = (zi === 0) ? 0 : (+partTcm) / 2;
    const rightTrim = (zi === numZones - 1) ? 0 : (+partTcm) / 2;
    return _bpMm(Math.max(0.1, spanCm - leftTrim - rightTrim));
}

function _bpHoneycombInnerSvgSpan(cp, sc, tCm) {
    const tPx = tCm * sc;
    const x1 = cp.x1 + tPx * 1.5;
    const x2 = cp.x2 - tPx * 1.5;
    if (x2 - x1 < 8) return null;
    return { x1, x2, lbl: `${_bpHoneycombInnerWidthMm(cp.wCm, tCm)}` };
}

function _bpHoneycombBlocksFromCompartments(compartments, numRows) {
    const blocks = [];
    let cur = null;
    for (let ri = 0; ri < numRows; ri++) {
        const ct = (compartments && compartments[ri]) ? compartments[ri].type : 'empty';
        if (ct === 'open_cell' || ct === 'side_open_cell') {
            if (!cur || cur.type !== ct) {
                if (cur) blocks.push(cur);
                cur = { type: ct, startR: ri, endR: ri };
            } else {
                cur.endR = ri;
            }
        } else if (cur) {
            blocks.push(cur);
            cur = null;
        }
    }
    if (cur) blocks.push(cur);
    return blocks;
}

/** Absolute Y ranges (cm from floor) for open-cell blocks in a column — used for adjacent merge. */
function _bpOpenCellAbsRanges(col, wg, pH) {
    if (!col) return [];
    const fo = col.floorOffset || 0;
    const colActualH = col.height || (wg && wg.h) || 240;
    const visibleH = colActualH - fo;
    const colPlinthH = col.noPlinth ? 0 : (pH || 0);
    const shelvesArr = (col.shelvesY || []).slice().sort((a, b) => a - b);
    const deskBase = (col.type === 'desk')
        ? (col.deskHeight || 80) + (col.deskClearance || 80)
        : _bpRowBaseCm(col, colPlinthH);
    const adjShelves = shelvesArr.map(sy => sy - fo).filter(sy => sy > 0 && sy < visibleH);
    const splitY = col.splitY || 0;
    const splitT = (state.thickness || 1.7) * 2;
    const splitAdj = splitY > 0 ? (splitY - fo) : 0;
    const splitTopAdj = splitAdj > 0 ? splitAdj + splitT : 0;
    let allBounds = [...adjShelves];
    if (splitAdj > deskBase && splitAdj < visibleH) {
        if (!allBounds.includes(splitAdj)) allBounds.push(splitAdj);
        if (splitTopAdj < visibleH && !allBounds.includes(splitTopAdj)) allBounds.push(splitTopAdj);
        allBounds.sort((a, b) => a - b);
    }
    const rowBounds = [deskBase, ...allBounds.filter(sy => sy > deskBase), visibleH];
    const blocks = _bpHoneycombBlocksFromCompartments(col.compartments, rowBounds.length - 1);
    return blocks.map(b => ({
        type: b.type,
        bot: fo + rowBounds[b.startR],
        top: fo + rowBounds[b.endR + 1]
    }));
}

function _bpOpenCellRangesMatch(ranges, type, bot, top) {
    const EPS = 0.5;
    return (ranges || []).some(r =>
        r.type === type &&
        Math.abs(r.bot - bot) <= EPS &&
        Math.abs(r.top - top) <= EPS
    );
}

function _bpMarkBlockAdjacentMerges(block, rowBounds, fo, cols, ci, wg, pH) {
    if (!block || !rowBounds) return block;
    const bot = fo + rowBounds[block.startR];
    const top = fo + rowBounds[block.endR + 1];
    block.mergeLeft = false;
    block.mergeRight = false;
    if (ci > 0) {
        const leftRanges = _bpOpenCellAbsRanges(cols[ci - 1], wg, pH);
        block.mergeLeft = _bpOpenCellRangesMatch(leftRanges, block.type, bot, top);
    }
    if (ci < cols.length - 1) {
        const rightRanges = _bpOpenCellAbsRanges(cols[ci + 1], wg, pH);
        block.mergeRight = _bpOpenCellRangesMatch(rightRanges, block.type, bot, top);
    }
    return block;
}

/** SVG Y holes to punch in the separator between two adjacent columns (merged כוורת). */
function _bpOpenCellSepHolesSvg(leftCol, rightCol, wg, pH, oy, dH, sc) {
    const leftRanges = _bpOpenCellAbsRanges(leftCol, wg, pH);
    const rightRanges = _bpOpenCellAbsRanges(rightCol, wg, pH);
    const EPS = 0.5;
    const holes = [];
    leftRanges.forEach(L => {
        rightRanges.forEach(R => {
            if (L.type !== R.type) return;
            if (Math.abs(L.bot - R.bot) > EPS || Math.abs(L.top - R.top) > EPS) return;
            const botSvg = oy + dH - L.bot * sc;
            const topSvg = oy + dH - L.top * sc;
            holes.push({ topSvg: Math.min(botSvg, topSvg), botSvg: Math.max(botSvg, topSvg) });
        });
    });
    holes.sort((a, b) => a.topSvg - b.topSvg);
    return holes;
}

function _bpVlineWithHoles(drawVline, x, sepTopY, sepBotY, holes) {
    if (!holes || !holes.length) {
        drawVline(x, sepTopY, sepBotY);
        return;
    }
    let y = sepTopY;
    holes.forEach(h => {
        const holeTop = Math.max(sepTopY, h.topSvg);
        const holeBot = Math.min(sepBotY, h.botSvg);
        if (holeBot <= holeTop) return;
        if (holeTop - y > 1) drawVline(x, y, holeTop);
        y = Math.max(y, holeBot);
    });
    if (sepBotY - y > 1) drawVline(x, y, sepBotY);
}

function _bpIsHoneycombInternalShelf(blocks, rowBounds, syAdj) {
    for (let bi = 0; bi < blocks.length; bi++) {
        const b = blocks[bi];
        for (let ri = b.startR; ri < b.endR; ri++) {
            if (Math.abs(syAdj - rowBounds[ri + 1]) < 0.05) return true;
        }
    }
    return false;
}

function _bpSideOpenCellOpenDir(ci, numCols) {
    const opensLeft = ci === 0;
    const opensRight = ci === numCols - 1;
    if (opensLeft && opensRight) return ci < numCols / 2 ? 'left' : 'right';
    if (opensLeft) return 'left';
    if (opensRight) return 'right';
    return 'none';
}

const _BP_HANG_ROD_BELOW_SHELF_CM = 7;
function _bpHangRodSvgY(cellTopSvgY, sc) {
    return cellTopSvgY + _BP_HANG_ROD_BELOW_SHELF_CM * sc;
}

function _bpIsDoorZoneType(t) {
    return t === 'door_right' || t === 'door_left' || t === 'door_double' || t === 'door_flap';
}

/** Interior type of a partition sub-zone — matches engine-core `_interiorAtEng`. */
function _bpPartitionInteriorType(sub, z) {
    if (!sub) return 'empty';
    const raw = (Array.isArray(sub.zonesType) && z >= 0 && z < sub.zonesType.length)
        ? sub.zonesType[z]
        : null;
    let t = (raw != null && raw !== '') ? raw : null;
    if (!t || t === 'empty' || t === 'partition' || _bpIsDoorZoneType(t)) {
        if ((sub.shelves || 0) <= 0 && sub.type && sub.type !== 'empty' && sub.type !== 'partition' && !_bpIsDoorZoneType(sub.type)) {
            t = sub.type;
        } else {
            t = (!t || t === 'partition' || _bpIsDoorZoneType(t)) ? 'empty' : t;
        }
    }
    return t || 'empty';
}

function _bpPartitionIsInteriorContent(t) {
    return t === 'hanging' || t === 'sorbet' || t === 'internal_drawers' || t === 'external_drawers';
}

/**
 * Hanging rod Y inside a partition zone. Paged blueprints flush inner width-dims
 * (line at cellTop+22) on top of cell content — keep the rod below that layer.
 */
function _bpPartitionHangRodSvgY(zSvgTop, zSvgH, sc) {
    const preferred = Math.max(_BP_HANG_ROD_BELOW_SHELF_CM * (sc || 1), 36);
    const maxOff = Math.max(8, (zSvgH || 0) - 8);
    return zSvgTop + Math.min(preferred, maxOff);
}

let _bpHoneycombSepQueue = null;

function _bpHoneycombSepBegin() {
    _bpHoneycombSepQueue = [];
}

function _bpHoneycombSepQueueLine(x, y1, y2, stroke) {
    if (!_bpHoneycombSepQueue) return;
    _bpHoneycombSepQueue.push({ x, y1, y2, stroke: stroke || _BP_STROKE });
}

function _bpHoneycombSepFlush(p) {
    if (!_bpHoneycombSepQueue || !_bpHoneycombSepQueue.length) {
        _bpHoneycombSepQueue = null;
        return;
    }
    _bpHoneycombSepQueue.forEach(ln => {
        p.push(`<line x1="${ln.x.toFixed(1)}" y1="${ln.y1.toFixed(1)}" x2="${ln.x.toFixed(1)}" y2="${ln.y2.toFixed(1)}" stroke="${ln.stroke}" stroke-width="1" opacity="0.9"/>`);
    });
    _bpHoneycombSepQueue = null;
}

function _bpDrawHoneycombBlock(p, ctx) {
    const {
        block, colX, colW, sc, colBotSvgY, rowBounds, ci, numCols,
        boardFill, strokeThin, stroke, font, makeRectFn, makeShelfFn,
        viewKey, dimKeyPrefix
    } = ctx;
    const _hcViewKey = viewKey || 'center';
    const _hcKeyPrefix = dimKeyPrefix || ('c' + ci);
    const tCm = state.thickness || 1.7;
    const tPx = tCm * sc;
    const tMm = _bpMm(tCm);
    const botCm = rowBounds[block.startR];
    const topCm = rowBounds[block.endR + 1];
    const blockTopSvg = colBotSvgY - topCm * sc;
    const blockBotSvg = colBotSvgY - botCm * sc;
    const wallH = blockBotSvg - blockTopSvg;
    if (wallH < 2 || tPx < 0.4) return;

    const leftCabInner = colX + tPx / 2;
    const rightCabInner = colX + colW - tPx / 2;
    const leftWallX1 = leftCabInner;
    const leftWallX2 = leftCabInner + tPx;
    const rightWallX1 = rightCabInner - tPx;
    const rightWallX2 = rightCabInner;
    const shelfX1 = leftWallX2;
    const shelfX2 = rightWallX1;
    if (shelfX2 - shelfX1 < 4) return;

    // Inner face of the double top/bottom boards (matches 3D: boards of thickness t inside the cell)
    const sideTopSvg = blockTopSvg + tPx;
    const sideBotSvg = blockBotSvg - tPx;
    const sideH = sideBotSvg - sideTopSvg;
    if (sideH < 1) return;

    const drawSepLine = (x) => {
        _bpHoneycombSepQueueLine(x, blockTopSvg, blockBotSvg, stroke);
    };

    // Top + bottom double boards (full frame width, like 3D open-cell lining)
    const frameX1 = leftWallX1;
    const frameX2 = rightWallX2;
    const frameW = frameX2 - frameX1;
    if (frameW > 2) {
        makeRectFn(p, frameX1, blockTopSvg, frameW, tPx, boardFill, strokeThin, 1);
        makeRectFn(p, frameX1, blockBotSvg - tPx, frameW, tPx, boardFill, strokeThin, 1);
        if (frameW > 16) {
            p.push(`<text x="${((frameX1 + frameX2) / 2).toFixed(1)}" y="${(blockTopSvg + tPx / 2 + 3).toFixed(1)}" text-anchor="middle" font-family="${font}" font-size="8" fill="${stroke}" opacity="0.62">${tMm}</text>`);
        }
    }

    const drawSideWall = (x1, x2, showLabel, sepX) => {
        makeRectFn(p, x1, sideTopSvg, x2 - x1, sideH, boardFill, strokeThin, 1);
        if (sepX != null) drawSepLine(sepX);
        if (showLabel) {
            p.push(`<text x="${(x2 + 3).toFixed(1)}" y="${((sideTopSvg + sideBotSvg) / 2 + 3).toFixed(1)}" text-anchor="start" font-family="${font}" font-size="8" fill="${stroke}" opacity="0.62">${tMm}</text>`);
        }
    };

    const openDir = block.type === 'side_open_cell' ? _bpSideOpenCellOpenDir(ci, numCols) : null;
    const mergeLeft = !!block.mergeLeft;
    const mergeRight = !!block.mergeRight;
    // Skip shared walls when adjacent columns merge into one כוורת
    if (!mergeLeft && (block.type === 'open_cell' || openDir !== 'left')) drawSideWall(leftWallX1, leftWallX2, true, leftCabInner);
    if (!mergeRight && (block.type === 'open_cell' || openDir !== 'right')) drawSideWall(rightWallX1, rightWallX2, false, rightCabInner);

    for (let ri = block.startR; ri < block.endR; ri++) {
        const shelfY = colBotSvgY - rowBounds[ri + 1] * sc;
        makeShelfFn(p, shelfX1, shelfY, shelfX2, sc, tCm, false);
    }

    // Inner height of each cubby — gated by "הסתר מידות פנימיות"
    for (let ri = block.startR; ri <= block.endR; ri++) {
        const botCm = rowBounds[ri];
        const topCm = rowBounds[ri + 1];
        if (botCm == null || topCm == null) continue;
        const isStart = ri === block.startR;
        const isEnd = ri === block.endR;
        const innerCm = _bpHoneycombCubbyInnerCm(botCm, topCm, tCm, isStart, isEnd);
        if (innerCm <= 0) continue;
        let yTop = colBotSvgY - topCm * sc;
        let yBot = colBotSvgY - botCm * sc;
        if (isEnd) yTop += tPx;
        if (isStart) yBot -= tPx;
        if (!isEnd) yTop += tPx / 2;
        if (!isStart) yBot -= tPx / 2;
        const dimX = shelfX1 + 10;
        if (yBot - yTop > 18 && shelfX2 - shelfX1 > 30) {
            _bpMaybePushVertInnerHeightDim(
                p, _hcViewKey, _hcKeyPrefix + ':hcH:' + ri,
                dimX, yTop, yBot, _bpMm(innerCm),
                { x: shelfX1, y: yTop, w: shelfX2 - shelfX1, h: yBot - yTop }
            );
        }
    }
}

function _bpDrawPartitionZoneContent(p, zoneType, zoneStyle, x1, x2, zSvgTop, zSvgH, subZoneCX, subZoneW, openDir, sc, drawerCount) {
    zoneStyle = zoneStyle || 'solid';
    const styleSuffix = _BP_DOOR_STYLE_SUFFIX[zoneStyle] || '';
    if (zoneType === 'hanging') {
        const rodY = _bpPartitionHangRodSvgY(zSvgTop, zSvgH, sc);
        const rX1 = x1 + 4, rX2 = x2 - 4;
        if (rX2 > rX1) {
            p.push(`<line x1="${rX1.toFixed(1)}" y1="${rodY.toFixed(1)}" x2="${rX2.toFixed(1)}" y2="${rodY.toFixed(1)}" stroke="${_BP_STROKE}" stroke-width="2"/>`);
            p.push(`<circle cx="${rX1.toFixed(1)}" cy="${rodY.toFixed(1)}" r="2" fill="${_BP_STROKE}"/>`);
            p.push(`<circle cx="${rX2.toFixed(1)}" cy="${rodY.toFixed(1)}" r="2" fill="${_BP_STROKE}"/>`);
        }
        if (zSvgH > 28) p.push(`<text x="${subZoneCX.toFixed(1)}" y="${(rodY + 14).toFixed(1)}" text-anchor="middle" font-family="${_BP_FONT}" font-size="10" fill="${_BP_STROKE}" opacity="0.6">תלייה</text>`);
    } else if (zoneType === 'sorbet') {
        const rodY = zSvgTop + zSvgH * 0.25;
        const rX1 = x1 + 4, rX2 = x2 - 4;
        if (rX2 > rX1) {
            p.push(`<line x1="${rX1.toFixed(1)}" y1="${rodY.toFixed(1)}" x2="${rX2.toFixed(1)}" y2="${rodY.toFixed(1)}" stroke="${_BP_STROKE}" stroke-width="1.5"/>`);
            p.push(`<circle cx="${rX1.toFixed(1)}" cy="${rodY.toFixed(1)}" r="1.5" fill="${_BP_STROKE}"/>`);
            p.push(`<circle cx="${rX2.toFixed(1)}" cy="${rodY.toFixed(1)}" r="1.5" fill="${_BP_STROKE}"/>`);
        }
        if (zSvgH > 18) p.push(`<text x="${subZoneCX.toFixed(1)}" y="${(zSvgTop + 20).toFixed(1)}" text-anchor="middle" font-family="${_BP_FONT}" font-size="10" fill="${_BP_STROKE}" opacity="0.6">סורבטו</text>`);
    } else if (zoneType === 'honeycomb' || zoneType === 'open_cell') {
        if (zSvgH > 18) p.push(`<text x="${subZoneCX.toFixed(1)}" y="${(zSvgTop + 14).toFixed(1)}" text-anchor="middle" font-family="${_BP_FONT}" font-size="10" fill="${_BP_STROKE}" opacity="0.6">כוורת</text>`);
    } else if (zoneType === 'side_open_cell') {
        if (zSvgH > 18) p.push(`<text x="${subZoneCX.toFixed(1)}" y="${(zSvgTop + 14).toFixed(1)}" text-anchor="middle" font-family="${_BP_FONT}" font-size="10" fill="${_BP_STROKE}" opacity="0.6">כוורת צד</text>`);
    } else if (zoneType === 'internal_drawers' || zoneType === 'external_drawers') {
        const dCount = (drawerCount > 0) ? drawerCount : 2;
        const dh = zSvgH / dCount;
        for (let di = 0; di < dCount; di++) {
            const dy = zSvgTop + di * dh;
            p.push(`<rect x="${(x1+2).toFixed(1)}" y="${(dy+1).toFixed(1)}" width="${(subZoneW-4).toFixed(1)}" height="${(dh-2).toFixed(1)}" fill="none" stroke="${_BP_STROKE_THIN}" stroke-width="0.8" opacity="0.7"/>`);
            if (zoneType === 'external_drawers') {
                const hndW = Math.min(subZoneW * 0.35, 18);
                const hndX = x1 + (subZoneW - hndW) / 2;
                const hndY = dy + dh * 0.5;
                p.push(`<line x1="${hndX.toFixed(1)}" y1="${hndY.toFixed(1)}" x2="${(hndX+hndW).toFixed(1)}" y2="${hndY.toFixed(1)}" stroke="${_BP_STROKE}" stroke-width="1.2"/>`);
            }
        }
        if (zoneType === 'external_drawers' && zSvgH > 18) {
            p.push(`<text x="${subZoneCX.toFixed(1)}" y="${(zSvgTop + 14).toFixed(1)}" text-anchor="middle" font-family="${_BP_FONT}" font-size="10" fill="${_BP_STROKE}" opacity="0.6">מגירות חיצוניות</text>`);
        }
    } else if (zoneType === 'door_right' || zoneType === 'door_left' || zoneType === 'door_double') {
        const pad = 3;
        const fx = x1 + pad, fy = zSvgTop + pad, fw = subZoneW - pad*2, fh = zSvgH - pad*2;
        if (fw > 2 && fh > 2) {
            p.push(`<rect x="${fx.toFixed(1)}" y="${fy.toFixed(1)}" width="${fw.toFixed(1)}" height="${fh.toFixed(1)}" fill="none" stroke="${_BP_STROKE}" stroke-width="1.2"/>`);
            if (zoneType === 'door_right') {
                p.push(`<line x1="${(fx+fw).toFixed(1)}" y1="${fy.toFixed(1)}" x2="${fx.toFixed(1)}" y2="${(fy+fh).toFixed(1)}" stroke="${_BP_STROKE_THIN}" stroke-width="1" stroke-dasharray="3,2"/>`);
            } else if (zoneType === 'door_left') {
                p.push(`<line x1="${fx.toFixed(1)}" y1="${fy.toFixed(1)}" x2="${(fx+fw).toFixed(1)}" y2="${(fy+fh).toFixed(1)}" stroke="${_BP_STROKE_THIN}" stroke-width="1" stroke-dasharray="3,2"/>`);
            } else {
                const midX = fx + fw / 2;
                p.push(`<line x1="${fx.toFixed(1)}" y1="${fy.toFixed(1)}" x2="${midX.toFixed(1)}" y2="${(fy+fh).toFixed(1)}" stroke="${_BP_STROKE_THIN}" stroke-width="1" stroke-dasharray="3,2"/>`);
                p.push(`<line x1="${(fx+fw).toFixed(1)}" y1="${fy.toFixed(1)}" x2="${midX.toFixed(1)}" y2="${(fy+fh).toFixed(1)}" stroke="${_BP_STROKE_THIN}" stroke-width="1" stroke-dasharray="3,2"/>`);
            }
            if (zoneStyle.startsWith('glass')) {
                p.push(`<line x1="${(fx+fw*0.2).toFixed(1)}" y1="${(fy+fh*0.3).toFixed(1)}" x2="${(fx+fw*0.8).toFixed(1)}" y2="${(fy+fh*0.7).toFixed(1)}" stroke="${_BP_STROKE_THIN}" stroke-width="0.8" opacity="0.5"/>`);
            }
        }
        const doorLabels = { door_right: 'דלת ימין', door_left: 'דלת שמאל', door_double: 'דלת כפולה' };
        if (zSvgH > 18) p.push(`<text x="${subZoneCX.toFixed(1)}" y="${(zSvgTop + 20).toFixed(1)}" text-anchor="middle" font-family="${_BP_FONT}" font-size="10" fill="${_BP_STROKE}" opacity="0.6">${doorLabels[zoneType]}${styleSuffix}</text>`);
    } else if (zoneType === 'door_flap') {
        const pad = 3;
        const fx = x1 + pad, fy = zSvgTop + pad, fw = subZoneW - pad*2, fh = zSvgH - pad*2;
        if (fw > 2 && fh > 2) {
            p.push(`<rect x="${fx.toFixed(1)}" y="${fy.toFixed(1)}" width="${fw.toFixed(1)}" height="${fh.toFixed(1)}" fill="none" stroke="${_BP_STROKE}" stroke-width="1.2"/>`);
            const flapH = Math.min(fh * 0.35, 18);
            p.push(`<rect x="${fx.toFixed(1)}" y="${fy.toFixed(1)}" width="${fw.toFixed(1)}" height="${flapH.toFixed(1)}" fill="rgba(30,58,95,0.08)" stroke="${_BP_STROKE}" stroke-width="1"/>`);
            p.push(`<line x1="${fx.toFixed(1)}" y1="${(fy+flapH).toFixed(1)}" x2="${subZoneCX.toFixed(1)}" y2="${(fy+fh).toFixed(1)}" stroke="${_BP_STROKE_THIN}" stroke-width="1" stroke-dasharray="3,2"/>`);
        }
        if (zSvgH > 18) p.push(`<text x="${subZoneCX.toFixed(1)}" y="${(zSvgTop + 20).toFixed(1)}" text-anchor="middle" font-family="${_BP_FONT}" font-size="10" fill="${_BP_STROKE}" opacity="0.6">קלפה${styleSuffix}</text>`);
    }
}

function _bpDrawPartitionMergedDoors(p, comp, boundaryXs, rowBotCm, rowTopCm, colBotSvgY, sc, ci, cols) {
    if (!comp || !Array.isArray(comp.zoneDoorGroups) || !comp.subCells) return;
    comp.zoneDoorGroups.forEach(group => {
        if (!group || !group.keys || !group.keys.length || !group.type) return;
        let minX = Infinity, maxX = -Infinity, minSvgTop = Infinity, maxSvgBot = -Infinity;
        group.keys.forEach(key => {
            const parts = String(key).split(':');
            const si = parseInt(parts[0], 10);
            const z = parseInt(parts[1] || '0', 10);
            if (si < 0 || si >= boundaryXs.length - 1) return;
            const sub = comp.subCells[si];
            if (!sub) return;
            const x1 = boundaryXs[si], x2 = boundaryXs[si + 1];
            const numShelves = (sub && sub.shelves) || 0;
            let shelfYcms = [];
            if (numShelves > 0) {
                if (Array.isArray(sub.shelvesY) && sub.shelvesY.length === numShelves) {
                    shelfYcms = sub.shelvesY.slice();
                } else {
                    const zoneHcm = (rowTopCm - rowBotCm) / (numShelves + 1);
                    for (let s = 1; s <= numShelves; s++) shelfYcms.push(rowBotCm + zoneHcm * s);
                }
            }
            const zoneBoundsCm = [rowBotCm, ...shelfYcms, rowTopCm];
            if (z < 0 || z >= zoneBoundsCm.length - 1) return;
            const zBotCm = zoneBoundsCm[z], zTopCm = zoneBoundsCm[z + 1];
            const zSvgTop = colBotSvgY - zTopCm * sc;
            const zSvgBot = colBotSvgY - zBotCm * sc;
            minX = Math.min(minX, x1);
            maxX = Math.max(maxX, x2);
            minSvgTop = Math.min(minSvgTop, zSvgTop);
            maxSvgBot = Math.max(maxSvgBot, zSvgBot);
        });
        if (!isFinite(minX)) return;
        const subZoneW = maxX - minX;
        const zSvgH = maxSvgBot - minSvgTop;
        const subZoneCX = (minX + maxX) / 2;
        const _opensLeft = ci === 0;
        const _opensRight = ci === cols.length - 1;
        let openDir = 'left';
        if (_opensLeft && _opensRight) openDir = (ci < cols.length / 2) ? 'left' : 'right';
        else if (_opensLeft) openDir = 'left';
        else if (_opensRight) openDir = 'right';
        _bpDrawPartitionZoneContent(p, group.type, group.style || 'solid', minX, maxX, minSvgTop, zSvgH, subZoneCX, subZoneW, openDir, sc);
    });
}

/**
 * Front-elevation partition: walls, inner width dims, sub-cell shelves, hanging rods, drawers.
 * vlineFn(x,y1,y2) / shelfLineFn(x1,y,x2) / dimHFn(x1,x2,y,lbl,above) / optional makeRectFn.
 */
function _bpDrawPartitionCell(p, ctx) {
    const {
        comp, col, wgW, colX, colW, cellY1, cellY2,
        rowBotCm, rowTopCm, colBotSvgY, sc, ci, cols, viewKey, ri,
        vlineFn, shelfLineFn, dimHFn, makeRectP, makeShelfP, font, stroke, strokeThin
    } = ctx || {};
    if (!p || !comp || !comp.partition || typeof vlineFn !== 'function') return;
    const FONT = font || _BP_FONT;
    const STROKE = stroke || _BP_STROKE;
    const STROKE_THIN = strokeThin || _BP_STROKE_THIN;
    const colList = cols || [];
    const partitions = Array.isArray(comp.partitions) && comp.partitions.length > 0
        ? comp.partitions
        : [typeof comp.partitionX === 'number' ? comp.partitionX : 0.5];
    const partT = state.thickness || 1.7;
    const colWcm = (col && col.width) || wgW || 0;
    const dimRowY = cellY1 + 22;
    const cellHcm = rowTopCm - rowBotCm;
    const boundaryXs = [colX, ...partitions.map(px => colX + colW * px), colX + colW];
    partitions.forEach(px => {
        vlineFn(colX + colW * px, cellY1, cellY2);
    });
    const numPartZones = boundaryXs.length - 1;
    if (typeof dimHFn === 'function') {
        for (let zi = 0; zi < numPartZones; zi++) {
            const x1 = boundaryXs[zi];
            const x2 = boundaryXs[zi + 1];
            const zonePx = (zi === 0 ? 0 : partitions[zi - 1]);
            const zoneEndPx = (zi === partitions.length ? 1 : partitions[zi]);
            const zoneWmm = _bpPartitionZoneClearWidthMm(colWcm, zonePx, zoneEndPx, partT, zi, numPartZones);
            if (x2 - x1 > 20) {
                _bpMaybePushInnerWidthDim(p, viewKey, `partW:c${ci}r${ri}z${zi}`, x1, x2, dimRowY, `${zoneWmm}`, dimHFn, true);
            }
        }
    }
    if (!comp.subCells) return;
    const tShelf = state.thickness || 1.7;
    for (let zi = 0; zi < boundaryXs.length - 1; zi++) {
        const x1 = boundaryXs[zi];
        const x2 = boundaryXs[zi + 1];
        const subZoneW = x2 - x1;
        const subZoneCX = (x1 + x2) / 2;
        const sub = comp.subCells[zi];
        const numShelves = (sub && sub.shelves) || 0;
        let shelfYcms = [];
        if (numShelves > 0) {
            if (Array.isArray(sub.shelvesY) && sub.shelvesY.length === numShelves) {
                shelfYcms = sub.shelvesY.slice();
            } else {
                const zoneHcm = cellHcm / (numShelves + 1);
                for (let s = 1; s <= numShelves; s++) shelfYcms.push(rowBotCm + zoneHcm * s);
            }
        }
        const zoneBoundsCm = [rowBotCm, ...shelfYcms, rowTopCm];
        const isSubHoney = sub && (sub.type === 'honeycomb' || sub.type === 'open_cell');
        if (isSubHoney && typeof makeRectP === 'function' && typeof makeShelfP === 'function') {
            const subNumRows = zoneBoundsCm.length - 1;
            if (subNumRows > 0) {
                _bpDrawHoneycombBlock(p, {
                    block: { type: 'open_cell', startR: 0, endR: subNumRows - 1 },
                    colX: x1, colW: x2 - x1, sc, colBotSvgY, rowBounds: zoneBoundsCm,
                    ci, numCols: colList.length, boardFill: '#94a3b8', strokeThin: STROKE_THIN, stroke: STROKE, font: FONT,
                    viewKey, dimKeyPrefix: `c${ci}r${ri}p${zi}`,
                    makeRectFn: makeRectP, makeShelfFn: makeShelfP
                });
            }
        } else if (numShelves > 0 && typeof shelfLineFn === 'function') {
            for (const shelfYcm of shelfYcms) {
                shelfLineFn(x1, colBotSvgY - shelfYcm * sc, x2);
            }
        }
        for (let z = 0; z < zoneBoundsCm.length - 1; z++) {
            const zBotCm = zoneBoundsCm[z];
            const zTopCm = zoneBoundsCm[z + 1];
            const zSvgBot = colBotSvgY - zBotCm * sc;
            const zSvgTop = colBotSvgY - zTopCm * sc;
            const zSvgH = zSvgBot - zSvgTop;
            const zSvgCY = (zSvgBot + zSvgTop) / 2;
            const zoneType = _bpPartitionInteriorType(sub, z);
            const zoneStyle = (sub && Array.isArray(sub.zonesDoorStyle) && sub.zonesDoorStyle[z])
                ? sub.zonesDoorStyle[z] : 'solid';
            const zoneKey = `${zi}:${z}`;
            const inMergeGroup = (comp.zoneDoorGroups || []).some(g => g.keys.includes(zoneKey));
            const isHoney = zoneType === 'honeycomb' || zoneType === 'open_cell' || zoneType === 'side_open_cell';
            // Interior (hanging / drawers) always — same as 3D, even under a merged door
            if (_bpPartitionIsInteriorContent(zoneType)) {
                const _opensLeft = ci === 0;
                const _opensRight = ci === colList.length - 1;
                let openDir = 'left';
                if (_opensLeft && _opensRight) openDir = (ci < colList.length / 2) ? 'left' : 'right';
                else if (_opensLeft) openDir = 'left';
                else if (_opensRight) openDir = 'right';
                _bpDrawPartitionZoneContent(p, zoneType, zoneStyle, x1, x2, zSvgTop, zSvgH, subZoneCX, subZoneW, openDir, sc,
                    (sub && Array.isArray(sub.zonesDrawerCount) && sub.zonesDrawerCount[z] > 0) ? sub.zonesDrawerCount[z] : ((sub && sub.count) || 0));
            } else if (zoneType && zoneType !== 'empty' && !inMergeGroup && !isHoney) {
                const _opensLeft = ci === 0;
                const _opensRight = ci === colList.length - 1;
                let openDir = 'left';
                if (_opensLeft && _opensRight) openDir = (ci < colList.length / 2) ? 'left' : 'right';
                else if (_opensLeft) openDir = 'left';
                else if (_opensRight) openDir = 'right';
                _bpDrawPartitionZoneContent(p, zoneType, zoneStyle, x1, x2, zSvgTop, zSvgH, subZoneCX, subZoneW, openDir, sc,
                    (sub && Array.isArray(sub.zonesDrawerCount) && sub.zonesDrawerCount[z] > 0) ? sub.zonesDrawerCount[z] : ((sub && sub.count) || 0));
            } else if (isHoney && !inMergeGroup && !isSubHoney && typeof makeRectP === 'function') {
                if (zSvgH > 18) p.push(`<text x="${subZoneCX.toFixed(1)}" y="${(zSvgTop + 14).toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="10" fill="${STROKE}" opacity="0.6">כוורת</text>`);
                _bpDrawHoneycombBlock(p, {
                    block: { type: 'open_cell', startR: 0, endR: 0 },
                    colX: x1, colW: x2 - x1, sc, colBotSvgY, rowBounds: [zBotCm, zTopCm],
                    ci, numCols: colList.length, boardFill: '#94a3b8', strokeThin: STROKE_THIN, stroke: STROKE, font: FONT,
                    viewKey, dimKeyPrefix: `c${ci}r${ri}p${zi}z${z}`,
                    makeRectFn: makeRectP, makeShelfFn: makeShelfP
                });
            }
            const zHcmRound = _bpClearCellHeightLabel(zBotCm, zTopCm, tShelf);
            if (_bpIsHoneycombType(zoneType)) {
                _bpMaybePushHoneycombInnerHeight(p, x1, zSvgTop, zSvgBot, zBotCm, zTopCm, sc, tShelf, viewKey, `c${ci}r${ri}p${zi}z${z}hcH`);
            } else if (zSvgH > 14 && zHcmRound > 0) {
                _bpPushCellDimLabel(p, viewKey, `c${ci}r${ri}p${zi}z${z}`, subZoneCX, zSvgCY + 4, zHcmRound,
                    { x: x1, y: zSvgTop, w: x2 - x1, h: zSvgH });
            }
        }
    }
    _bpDrawPartitionMergedDoors(p, comp, boundaryXs, rowBotCm, rowTopCm, colBotSvgY, sc, ci, colList);
}

window._generateMultiViewBlueprintSVG = function() {
    const pid = state.presetId;
    const centerWing = state.wings.center;
    const leftWing   = state.wings.left;
    const rightWing  = state.wings.right;

    // Use max(col.height) — the box top is at oy+dH - col.height*sc regardless of floorOffset
    const cH  = centerWing && centerWing.columns && centerWing.columns.length > 0
        ? Math.max(...centerWing.columns.map(c => c.height || state.globalHeight))
        : (centerWing ? (centerWing.globalHeight || state.globalHeight) : state.globalHeight);
    const cW  = centerWing ? (centerWing.width || state.width) : state.width;
    const cD  = centerWing ? (centerWing.depth || state.depth) : state.depth;
    const pH  = centerWing ? (centerWing.plinthHeight || state.plinthHeight) : state.plinthHeight;

    const hasRight = !!rightWing;
    const hasLeft  = !!leftWing;
    const rW   = hasRight ? (rightWing.width  || 160) : 0;
    const rD   = hasRight ? (rightWing.depth  || cD)  : 0;
    const rPos = hasRight ? (rightWing.wingPosition || 'side') : 'none';
    const lW   = hasLeft  ? (leftWing.width   || 160) : 0;
    const lD   = hasLeft  ? (leftWing.depth   || cD)  : 0;
    const lPos = hasLeft  ? (leftWing.wingPosition || 'side') : 'none';
    const fcSizeR = (hasRight && rPos === 'full_corner' && rightWing.fullCorner) ? (rightWing.fullCorner.size || 100) : 0;
    const fcSizeL = (hasLeft  && lPos === 'full_corner' && leftWing.fullCorner)  ? (leftWing.fullCorner.size || 100) : 0;

    // TOP VIEW coordinate system (cm → SVG pixels):
    // X axis = left-right (SVG x), Z axis = front-back (SVG y, Z=0=back wall=top, Z=max=front=bottom)
    // Center cabinet: X in [-cW/2 .. cW/2], Z in [0 .. cD]
    // 'side' wing is PERPENDICULAR to center wall:
    //   right 'side': depth rD extends RIGHT along X, width rW extends FORWARD along Z
    //     → rect at X=[cW/2 .. cW/2+rD], Z=[0 .. rW]
    //   left 'side':  depth lD extends LEFT along X, width lW extends FORWARD along Z
    //     → rect at X=[-cW/2-lD .. -cW/2], Z=[0 .. lW]
    // 'front' wing (פנימי) is still PERPENDICULAR, but starts from the FRONT face:
    //   right 'front': depth rD sits at the right end of center, width rW protrudes FORWARD
    //     → rect at X=[cW/2-rD .. cW/2], Z=[cD .. cD+rW]
    //   left 'front':  depth lD sits at the left end of center, width lW protrudes FORWARD
    //     → rect at X=[-cW/2 .. -cW/2+lD], Z=[cD .. cD+lW]

    // ---- constants & helpers ----
    const STROKE = '#1e3a5f', STROKE_THIN = '#94a3b8';
    const FILL_CAB  = '#e8f0fe'; // center cabinet: light blue
    const FILL_WING_L = '#d1fae5'; // left wing: light green
    const FILL_WING_R = '#fce7f3'; // right wing: light pink
    const FILL_FC_L = '#fef3c7';  // left corner: light yellow
    const FILL_FC_R = '#ede9fe';  // right corner: light purple
    const FILL_WING = '#d1fae5';  // fallback (single wing)
    const FILL_FC   = '#fef3c7';  // fallback (single corner)
    const DIM_C = '#1e3a5f', ARROW = 5, FONT = 'Rubik,Tahoma,sans-serif';
    const MARGIN = 60, GAP = 18, LABEL_H = 26, PAD = 80;
    const SVG_W = 1200;
    const TOP_H = 220;   // floor-plan panel height (taller for L/U shapes)
    const WING_H = 400;  // per-wing front-view panel height (taller for cell dims above+below)
    // Helper: total drawing height = max(col.height) across all columns
    // The box top is at oy+dH - col.height*sc (since top = bottom_raised - visibleH = oy+dH - fo*sc - (h-fo)*sc = oy+dH - h*sc)
    const _wingSpan = (wd, fallback) => wd && wd.columns && wd.columns.length > 0
        ? Math.max(...wd.columns.map(c => c.height || fallback))
        : fallback;
    // Build ordered wing list: left → center → right
    const wingList = [];
    if (hasLeft)  wingList.push({ wd: leftWing,   label: 'כנף שמאל',   fill: FILL_WING_L, w: lW, h: _wingSpan(leftWing,  cH), d: lD });
    wingList.push(              { wd: centerWing,  label: 'ארון מרכזי', fill: FILL_CAB,    w: cW, h: _wingSpan(centerWing, cH), d: cD });
    if (hasRight) wingList.push({ wd: rightWing,   label: 'כנף ימין',   fill: FILL_WING_R, w: rW, h: _wingSpan(rightWing, cH), d: rD });
    const nW = wingList.length;
    const SVG_H = MARGIN + 22 + GAP + (TOP_H + LABEL_H) + GAP + nW * (WING_H + LABEL_H + GAP) + MARGIN;

    let p = [];
    p.push(`<defs>
      <marker id="ae" markerWidth="${ARROW}" markerHeight="${ARROW}" refX="${ARROW-1}" refY="${ARROW/2}" orient="auto"><path d="M0,0 L0,${ARROW} L${ARROW},${ARROW/2} z" fill="${DIM_C}"/></marker>
      <marker id="as" markerWidth="${ARROW}" markerHeight="${ARROW}" refX="1" refY="${ARROW/2}" orient="auto"><path d="M${ARROW},0 L${ARROW},${ARROW} L0,${ARROW/2} z" fill="${DIM_C}"/></marker>
    </defs>`);
    p.push(`<rect width="${SVG_W}" height="${SVG_H}" fill="white"/>`);
    const presetLabel = pid === 'walkin' ? 'חדר ארונות' : (pid.startsWith('corner')) ? 'ארון פינתי' : 'ארון';
    p.push(`<text x="${SVG_W/2}" y="26" text-anchor="middle" font-family="${FONT}" font-size="18" font-weight="bold" fill="${STROKE}">שרטוט טכני — ${presetLabel}</text>`);

    const rect = (x,y,w,h,fill,stroke,sw=1.5) => p.push(`<rect x="${(+x).toFixed(1)}" y="${(+y).toFixed(1)}" width="${(+w).toFixed(1)}" height="${(+h).toFixed(1)}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`);
    const shelfLine = (x1, sy, x2, sc, tCm, showLabel) => {
        const t = tCm != null ? tCm : (state.thickness || 1.7);
        const tPx = t * sc;
        if (tPx < 0.4) return;
        const halfT = tPx / 2;
        rect(x1, sy - halfT, x2 - x1, tPx, '#94a3b8', STROKE_THIN, 1);
        if (showLabel !== false && x2 - x1 > 16) p.push(`<text x="${((x1+x2)/2).toFixed(1)}" y="${(sy+3).toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="8" fill="${STROKE}" opacity="0.62">${_bpMm(t)}</text>`);
    };
    const vline = (x, y1, y2, sc) => {
        const t = state.thickness || 1.7;
        const tPx = t * sc;
        if (tPx < 0.4 || y2 - y1 < 2) return;
        const halfT = tPx / 2;
        rect(x - halfT, y1, tPx, y2 - y1, '#94a3b8', STROKE_THIN, 1);
        if (y2 - y1 > 14) {
            const my = (y1 + y2) / 2;
            p.push(`<text x="${(x + halfT + 3).toFixed(1)}" y="${(my+3).toFixed(1)}" text-anchor="start" font-family="${FONT}" font-size="8" fill="${STROKE}" opacity="0.62">${_bpMm(t)}</text>`);
        }
    };
    const panelBox = (px,py,pw,ph,lbl) => {
        p.push(`<rect x="${px}" y="${py}" width="${pw}" height="${ph+LABEL_H}" rx="4" fill="white" stroke="${STROKE_THIN}" stroke-width="1"/>`);
        p.push(`<rect x="${px}" y="${py}" width="${pw}" height="${LABEL_H}" fill="#f1f5f9" stroke="${STROKE_THIN}" stroke-width="1"/>`);
        p.push(`<text x="${px+pw/2}" y="${py+LABEL_H/2+5}" text-anchor="middle" font-family="${FONT}" font-size="12" font-weight="bold" fill="${STROKE}">${lbl}</text>`);
    };
    // dimH: horizontal dimension line. offset = pixels below/above the line
    const dimH = (x1,x2,y,lbl,above=true) => {
        const tk=7, lo=above?-8:14;
        p.push(`<line x1="${(+x1).toFixed(1)}" y1="${(y-tk/2).toFixed(1)}" x2="${(+x1).toFixed(1)}" y2="${(y+tk/2).toFixed(1)}" stroke="${DIM_C}" stroke-width="1"/>`);
        p.push(`<line x1="${(+x2).toFixed(1)}" y1="${(y-tk/2).toFixed(1)}" x2="${(+x2).toFixed(1)}" y2="${(y+tk/2).toFixed(1)}" stroke="${DIM_C}" stroke-width="1"/>`);
        p.push(`<line x1="${(+x1).toFixed(1)}" y1="${(+y).toFixed(1)}" x2="${(+x2).toFixed(1)}" y2="${(+y).toFixed(1)}" stroke="${DIM_C}" stroke-width="1" marker-start="url(#as)" marker-end="url(#ae)"/>`);
        const mx=(+x1+x2)/2;
        const lblW = Math.max(lbl.length * 7, 36);
        p.push(`<text x="${mx.toFixed(1)}" y="${(y+lo).toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="11" fill="${DIM_C}">${lbl}</text>`);
    };
    // dimV: vertical dimension line — label placed to the RIGHT of the line
    // Use for lines on the LEFT side of cabinet (label goes right = toward cabinet)
    const dimV = (x,y1,y2,lbl) => {
        const tk=7;
        p.push(`<line x1="${(x-tk/2).toFixed(1)}" y1="${(+y1).toFixed(1)}" x2="${(x+tk/2).toFixed(1)}" y2="${(+y1).toFixed(1)}" stroke="${DIM_C}" stroke-width="1"/>`);
        p.push(`<line x1="${(x-tk/2).toFixed(1)}" y1="${(+y2).toFixed(1)}" x2="${(x+tk/2).toFixed(1)}" y2="${(+y2).toFixed(1)}" stroke="${DIM_C}" stroke-width="1"/>`);
        p.push(`<line x1="${(+x).toFixed(1)}" y1="${(+y1).toFixed(1)}" x2="${(+x).toFixed(1)}" y2="${(+y2).toFixed(1)}" stroke="${DIM_C}" stroke-width="1" marker-start="url(#as)" marker-end="url(#ae)"/>`);
        const my = (+y1+y2)/2;
        const tx = x + 14;
        p.push(`<text x="${tx.toFixed(1)}" y="${(my+4).toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="11" fill="${DIM_C}" transform="rotate(-90,${tx.toFixed(1)},${my.toFixed(1)})">${lbl}</text>`);
    };
    // dimVLeft: vertical dimension line — label placed to the LEFT of the line
    // Use for lines on the RIGHT side of cabinet (label goes left = toward cabinet)
    const dimVLeft = (x,y1,y2,lbl) => {
        const tk=7;
        p.push(`<line x1="${(x-tk/2).toFixed(1)}" y1="${(+y1).toFixed(1)}" x2="${(x+tk/2).toFixed(1)}" y2="${(+y1).toFixed(1)}" stroke="${DIM_C}" stroke-width="1"/>`);
        p.push(`<line x1="${(x-tk/2).toFixed(1)}" y1="${(+y2).toFixed(1)}" x2="${(x+tk/2).toFixed(1)}" y2="${(+y2).toFixed(1)}" stroke="${DIM_C}" stroke-width="1"/>`);
        p.push(`<line x1="${(+x).toFixed(1)}" y1="${(+y1).toFixed(1)}" x2="${(+x).toFixed(1)}" y2="${(+y2).toFixed(1)}" stroke="${DIM_C}" stroke-width="1" marker-start="url(#as)" marker-end="url(#ae)"/>`);
        const my = (+y1+y2)/2;
        const tx = x - 14;
        p.push(`<text x="${tx.toFixed(1)}" y="${(my+4).toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="11" fill="${DIM_C}" transform="rotate(-90,${tx.toFixed(1)},${my.toFixed(1)})">${lbl}</text>`);
    };

    // ---- PANEL 0: TOP VIEW (floor plan) — correct L/U geometry ----
    // 'side' wing is PERPENDICULAR: its depth (lD/rD) goes along X, its width (lW/rW) goes along Z
    {
        const py = MARGIN + 22 + GAP;
        const pw = SVG_W - MARGIN * 2;
        panelBox(MARGIN, py, pw, TOP_H, 'מבט עליון — תוכנית רצפה (Top View / Floor Plan)');
        const drawY = py + LABEL_H;

        // Compute world bounds in cm
        let minX = -cW/2, maxX = cW/2, minZ = 0, maxZ = cD;
        if (hasLeft) {
            if (lPos==='side')             { minX = Math.min(minX, -cW/2 - lD); maxZ = Math.max(maxZ, lW); }
            else if (lPos==='front')       { maxZ = Math.max(maxZ, cD + lW); }
            else if (lPos==='full_corner') { minX = Math.min(minX, -cW/2 - fcSizeL); maxZ = Math.max(maxZ, fcSizeL + lW); }
        }
        if (hasRight) {
            if (rPos==='side')             { maxX = Math.max(maxX, cW/2 + rD); maxZ = Math.max(maxZ, rW); }
            else if (rPos==='front')       { maxZ = Math.max(maxZ, cD + rW); }
            else if (rPos==='full_corner') { maxX = Math.max(maxX, cW/2 + fcSizeR); maxZ = Math.max(maxZ, fcSizeR + rW); }
        }
        // Corner unit (שידה/שולחן פינתית) protrudes forward from front face
        const hasCU = state.corner && state.corner.side !== 'none';
        const cuW_fp = hasCU ? (state.corner.width || 60) : 0;
        const cuD_fp = hasCU ? (state.corner.depth || cD) : 0;
        if (hasCU) maxZ = Math.max(maxZ, cD + cuW_fp);
        // Side cabinet (ארון צד הפוך) — extends in X direction
        const scFP = _bpCenterSideCabinet(centerWing);
        const hasSCFP = !!scFP;
        const scWR = hasSCFP ? (scFP.widthRight || scFP.width || 40) : 0;
        const scWL = hasSCFP ? (scFP.widthLeft || scFP.width || 40) : 0;
        if (hasSCFP) {
            const scSideFP = scFP.side;
            if (scSideFP === 'right') maxX = Math.max(maxX, cW/2 + scWR);
            else if (scSideFP === 'left') minX = Math.min(minX, -cW/2 - scWL);
            else if (scSideFP === 'both') {
                maxX = Math.max(maxX, cW/2 + scWR);
                minX = Math.min(minX, -cW/2 - scWL);
            }
        }
        // Side desk (שולחן צד) — extends in X direction, depth = cD
        const deskFP = _bpCenterSideDesk(centerWing);
        const hasDeskFP = !!deskFP;
        const deskFPW = hasDeskFP ? (deskFP.width || 100) : 0;
        if (hasDeskFP) {
            if (deskFP.side === 'right') maxX = Math.max(maxX, cW/2 + deskFPW);
            if (deskFP.side === 'left')  minX = Math.min(minX, -cW/2 - deskFPW);
        }
        const tW = maxX - minX, tD = maxZ - minZ;
        const sc = Math.min((pw - PAD*2) / Math.max(tW,1), (TOP_H - PAD*2) / Math.max(tD,1));
        const ox = MARGIN + (pw - tW*sc)/2 - minX*sc;
        const oz = drawY + PAD/2;
        const wx = xc => ox + xc*sc;
        const wz = zc => oz + zc*sc;

        // Draw center cabinet (back wall along top, front face at bottom)
        rect(wx(-cW/2), wz(0), cW*sc, cD*sc, FILL_CAB, STROKE, 2);
        // Label "חזית" on center front edge
        p.push(`<text x="${wx(0).toFixed(1)}" y="${(wz(cD)+11).toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="12" fill="${STROKE}" opacity="0.6">חזית</text>`);

        // ---- Bathroom sink — top view ----
        if (pid === 'bathroom' && centerWing) {
            const _bpCT = centerWing.countertopType || 'integral';
            const SINK_STROKE = '#1e3a5f';
            const SINK_FILL   = 'rgba(186,230,253,0.7)'; // light blue
            if (_bpCT === 'integral') {
                // Integral sink: center on sinkPanel column group (same as 3D engine)
                // Columns accumulate from left: cabinet-relative X starts at -cW/2
                const _tvCols = centerWing.columns || [];
                let _tvSgLeftCm = 0, _tvSgWidthCm = 0, _tvSgFound = false, _tvAcc = 0;
                _tvCols.forEach(col => {
                    const _cw = col.width || cW;
                    if (col.sinkPanel) {
                        if (!_tvSgFound) { _tvSgLeftCm = _tvAcc; _tvSgFound = true; }
                        _tvSgWidthCm += _cw;
                    }
                    _tvAcc += _cw;
                });
                // Group center in cabinet-relative coords (0 = cabinet center)
                const _tvSgCX = _tvSgFound ? (-cW/2 + _tvSgLeftCm + _tvSgWidthCm / 2) : 0;
                const _sinkW_cm = _tvSgFound ? (_tvSgWidthCm >= 100 ? 50 : 40) : Math.min(cW * 0.6, 55);
                const _sinkD_cm = Math.min(cD * 0.65, 38); // max 38cm deep
                const _sinkCZ = cD * 0.45; // slightly toward front
                const _sinkX1 = wx(_tvSgCX - _sinkW_cm/2);
                const _sinkX2 = wx(_tvSgCX + _sinkW_cm/2);
                const _sinkZ1 = wz(_sinkCZ - _sinkD_cm/2);
                const _sinkZ2 = wz(_sinkCZ + _sinkD_cm/2);
                const _sinkW  = _sinkX2 - _sinkX1;
                const _sinkH  = _sinkZ2 - _sinkZ1;
                p.push(`<rect x="${_sinkX1.toFixed(1)}" y="${_sinkZ1.toFixed(1)}" width="${_sinkW.toFixed(1)}" height="${_sinkH.toFixed(1)}" rx="${Math.min(_sinkW,_sinkH)*0.18}" fill="${SINK_FILL}" stroke="${SINK_STROKE}" stroke-width="1.5"/>`);
                p.push(`<text x="${((_sinkX1+_sinkX2)/2).toFixed(1)}" y="${((_sinkZ1+_sinkZ2)/2+4).toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="11" fill="${SINK_STROKE}" opacity="0.8">כיור</text>`);
            } else {
                // Vessel sink: rectangle centered on full slab, with offset
                const _bpVW = Math.min(cW * 0.35, 50); // VESSEL_W
                const _bpVD = Math.min(cD * 0.6, 35);  // VESSEL_D
                const _bpOffX = (centerWing.vesselSinkOffsetX) || 0;
                const _bpVCX  = _bpOffX; // center X in cm (relative to cabinet center)
                const _bpVCZ  = cD * 0.4; // slightly toward back
                const _vSvgX  = wx(_bpVCX - _bpVW/2);
                const _vSvgZ  = wz(_bpVCZ - _bpVD/2);
                const _vSvgW  = _bpVW * sc;
                const _vSvgH  = _bpVD * sc;
                p.push(`<rect x="${_vSvgX.toFixed(1)}" y="${_vSvgZ.toFixed(1)}" width="${_vSvgW.toFixed(1)}" height="${_vSvgH.toFixed(1)}" rx="${Math.min(_vSvgW,_vSvgH)*0.15}" fill="${SINK_FILL}" stroke="${SINK_STROKE}" stroke-width="1.5"/>`);
                p.push(`<text x="${(_vSvgX+_vSvgW/2).toFixed(1)}" y="${(_vSvgZ+_vSvgH/2+4).toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="11" fill="${SINK_STROKE}" opacity="0.8">כיור</text>`);
            }
        }

        // Draw wings with correct perpendicular geometry — use per-side colors
        if (hasLeft) {
            if (lPos==='side') {
                rect(wx(-cW/2 - lD), wz(0), lD*sc, lW*sc, FILL_WING_L, STROKE);
                p.push(`<text x="${wx(-cW/2 - lD/2).toFixed(1)}" y="${(wz(lW/2)+4).toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="12" fill="${STROKE}" opacity="0.7">${Math.round(lD)}</text>`);
            } else if (lPos==='front') {
                // Inner corner: wing flush with left end of center, protruding forward from front face
                rect(wx(-cW/2), wz(cD), lD*sc, lW*sc, FILL_WING_L, STROKE);
                p.push(`<text x="${wx(-cW/2 + lD/2).toFixed(1)}" y="${(wz(cD + lW/2)+4).toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="12" fill="${STROKE}" opacity="0.7">${Math.round(lD)}</text>`);
            } else if (lPos==='full_corner') {
                const x1 = wx(-cW/2), y1 = wz(0);
                const x2 = wx(-cW/2 - fcSizeL), y2 = wz(0);
                const x3 = wx(-cW/2 - fcSizeL), y3 = wz(fcSizeL);
                const x4 = wx(-cW/2 - fcSizeL + lD), y4 = wz(fcSizeL);
                const x5 = wx(-cW/2 - fcSizeL + lD), y5 = wz(cD);
                const x6 = wx(-cW/2), y6 = wz(cD);
                p.push(`<polygon points="${x1.toFixed(1)},${y1.toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)} ${x3.toFixed(1)},${y3.toFixed(1)} ${x4.toFixed(1)},${y4.toFixed(1)} ${x5.toFixed(1)},${y5.toFixed(1)} ${x6.toFixed(1)},${y6.toFixed(1)}" fill="${FILL_FC_L}" stroke="${STROKE}" stroke-width="1.5"/>`);
                if (lW > 0) rect(wx(-cW/2 - fcSizeL), wz(fcSizeL), lD*sc, lW*sc, FILL_WING_L, STROKE);
            }
        }
        if (hasRight) {
            if (rPos==='side') {
                rect(wx(cW/2), wz(0), rD*sc, rW*sc, FILL_WING_R, STROKE);
                p.push(`<text x="${wx(cW/2 + rD/2).toFixed(1)}" y="${(wz(rW/2)+4).toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="12" fill="${STROKE}" opacity="0.7">${Math.round(rD)}</text>`);
            } else if (rPos==='front') {
                // Inner corner: wing flush with right end of center, protruding forward from front face
                rect(wx(cW/2 - rD), wz(cD), rD*sc, rW*sc, FILL_WING_R, STROKE);
                p.push(`<text x="${wx(cW/2 - rD/2).toFixed(1)}" y="${(wz(cD + rW/2)+4).toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="12" fill="${STROKE}" opacity="0.7">${Math.round(rD)}</text>`);
            } else if (rPos==='full_corner') {
                const x1 = wx(cW/2), y1 = wz(0);
                const x2 = wx(cW/2 + fcSizeR), y2 = wz(0);
                const x3 = wx(cW/2 + fcSizeR), y3 = wz(fcSizeR);
                const x4 = wx(cW/2 + fcSizeR - rD), y4 = wz(fcSizeR);
                const x5 = wx(cW/2 + fcSizeR - rD), y5 = wz(cD);
                const x6 = wx(cW/2), y6 = wz(cD);
                p.push(`<polygon points="${x1.toFixed(1)},${y1.toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)} ${x3.toFixed(1)},${y3.toFixed(1)} ${x4.toFixed(1)},${y4.toFixed(1)} ${x5.toFixed(1)},${y5.toFixed(1)} ${x6.toFixed(1)},${y6.toFixed(1)}" fill="${FILL_FC_R}" stroke="${STROKE}" stroke-width="1.5"/>`);
                if (rW > 0) rect(wx(cW/2 + fcSizeR - rD), wz(fcSizeR), rD*sc, rW*sc, FILL_WING_R, STROKE);
            }
        }

        // Corner unit (שידה/שולחן פינתית) — protrudes forward from front face
        if (hasCU) {
            const cuSide = state.corner.side; // 'right' or 'left'
            const cuX1 = cuSide === 'right' ? cW/2 - cuD_fp : -cW/2;
            const cuX2 = cuSide === 'right' ? cW/2 : -cW/2 + cuD_fp;
            const FILL_CU = '#fef9c3'; // light yellow for corner unit
            rect(wx(cuX1), wz(cD), (cuX2 - cuX1)*sc, cuW_fp*sc, FILL_CU, STROKE, 1.5);
            // Label
            const cuLabel = state.corner.type === 'desk' ? 'שולחן פינתי' : 'שידה פינתית';
            p.push(`<text x="${wx((cuX1+cuX2)/2).toFixed(1)}" y="${(wz(cD + cuW_fp/2)+4).toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="12" fill="${STROKE}" opacity="0.8">${cuLabel}</text>`);
            // Dimensions: width (horizontal, below the unit) and depth (vertical, on the outer side)
            dimH(wx(cuX1), wx(cuX2), wz(cD + cuW_fp) + 14, `${_bpMm(cuD_fp)}`);
            if (cuSide === 'right') {
                dimV(wx(cuX2) + 14, wz(cD), wz(cD + cuW_fp), `${_bpMm(cuW_fp)}`);
            } else {
                dimVLeft(wx(cuX1) - 14, wz(cD), wz(cD + cuW_fp), `${_bpMm(cuW_fp)}`);
            }
        }

        // Side cabinet (ארון צד הפוך) — rectangle flush against main cabinet side
        if (hasSCFP) {
            const FILL_SC = '#e0f2fe'; // light blue for side cabinet
            const scSideFP2 = scFP.side;
            const _drawSCFP = (onRight) => {
                const scWcm = onRight ? scWR : scWL;
                const scX1 = onRight ? cW/2 : -cW/2 - scWcm;
                const scX2 = onRight ? cW/2 + scWcm : -cW/2;
                rect(wx(scX1), wz(0), scWcm*sc, cD*sc, FILL_SC, STROKE, 1.5);
                p.push(`<text x="${wx((scX1+scX2)/2).toFixed(1)}" y="${(wz(cD/2)+4).toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="12" fill="${STROKE}" opacity="0.8">ארון צד</text>`);
                dimH(wx(scX1), wx(scX2), wz(cD) + 14, `${_bpMm(scWcm)}`);
            };
            if (scSideFP2 === 'right' || scSideFP2 === 'both') _drawSCFP(true);
            if (scSideFP2 === 'left'  || scSideFP2 === 'both') _drawSCFP(false);
        }

        // Side desk (שולחן צד) — top view: rectangle on the side of the cabinet
        if (hasDeskFP) {
            const FILL_DESK_FP = '#fed7aa'; // light orange for side desk
            const deskOnRight = deskFP.side === 'right';
            const deskX1 = deskOnRight ? cW/2 : -cW/2 - deskFPW;
            const deskX2 = deskOnRight ? cW/2 + deskFPW : -cW/2;
            rect(wx(deskX1), wz(0), deskFPW*sc, cD*sc, FILL_DESK_FP, STROKE, 1.5);
            p.push(`<text x="${wx((deskX1+deskX2)/2).toFixed(1)}" y="${(wz(cD/2)+4).toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="12" fill="${STROKE}" opacity="0.85">שולחן צד</text>`);
            dimH(wx(deskX1), wx(deskX2), wz(cD) + 24, `${_bpMm(deskFPW)}`);
        }

        // Dimension lines
        // Total width at TOP — above all other horizontal dims (above 100/311 lines)
        const dimRowTop = wz(0) - 28; // above cabinet top edge, above the sub-dims at wz(0)-14
        dimH(wx(minX), wx(maxX), dimRowTop, `${_bpMm(tW)}`);
        // Center cabinet width: just above the cabinet top edge (not at bottom)
        if (hasLeft || hasRight) dimH(wx(-cW/2), wx(cW/2), wz(0) - 14, `${_bpMm(cW)}`);

        const hasRightFC = hasRight && rPos === 'full_corner';
        const hasLeftFC  = hasLeft  && lPos === 'full_corner';

        // Total depth lines:
        // - If BOTH corners: show left total depth on LEFT, right total depth on RIGHT
        // - If only left corner: show total depth on RIGHT side
        // - If only right corner (or no corner): show total depth on LEFT side
        if (hasLeftFC && hasRightFC) {
            // U-shape / walk-in: left depth on LEFT, right depth on RIGHT
            const leftTotalD = fcSizeL + lW;
            const rightTotalD = fcSizeR + rW;
            dimVLeft(wx(minX) - 54, wz(0), wz(leftTotalD), `${_bpMm(leftTotalD)}`);
            dimV(wx(maxX) + 74, wz(0), wz(rightTotalD), `${_bpMm(rightTotalD)}`);
        } else if (hasLeftFC && !hasRightFC) {
            // Left corner only: total depth on RIGHT side
            dimV(wx(maxX) + 74, wz(minZ), wz(maxZ), `${_bpMm(tD)}`);
        } else {
            // Right corner or no corner: total depth on LEFT side
            dimVLeft(wx(minX) - 54, wz(minZ), wz(maxZ), `${_bpMm(tD)}`);
        }

        // Center cabinet depth — only show if center is shorter than total depth
        if (cD < tD && !(hasLeftFC && hasRightFC)) {
            if (hasRightFC) {
                dimVLeft(wx(-cW/2) - 14, wz(0), wz(cD), `${_bpMm(cD)}`);
            } else {
                dimVLeft(wx(cW/2) + 34, wz(0), wz(cD), `${_bpMm(cD)}`);
            }
        }

        // Right wing depth (side position) — label on LEFT side of the right wing
        if (hasRight && rPos === 'side') dimVLeft(wx(cW/2) - 14, wz(0), wz(rW), `${_bpMm(rW)}`);
        // Left wing depth (side position)
        if (hasLeft && lPos === 'side') dimVLeft(wx(-cW/2 - lD) - 14, wz(0), wz(lW), `${_bpMm(lW)}`);
        // Front (פנימי) wings — protrusion beyond center front face
        if (hasRight && rPos === 'front') {
            dimV(wx(cW/2) + 14, wz(cD), wz(cD + rW), `${_bpMm(rW)}`);
            dimH(wx(cW/2 - rD), wx(cW/2), wz(cD + rW) + 14, `${_bpMm(rD)}`);
        }
        if (hasLeft && lPos === 'front') {
            dimVLeft(wx(-cW/2) - 14, wz(cD), wz(cD + lW), `${_bpMm(lW)}`);
            dimH(wx(-cW/2), wx(-cW/2 + lD), wz(cD + lW) + 14, `${_bpMm(lD)}`);
        }

        // full_corner dims
        if (hasRightFC) {
            dimH(wx(cW/2), wx(cW/2 + fcSizeR), wz(0) - 14, `${_bpMm(fcSizeR)}`);
            // Corner depth + wing width on RIGHT side, label right — use +54 to match total depth line spacing
            dimV(wx(cW/2 + fcSizeR) + 54, wz(0), wz(fcSizeR), `${_bpMm(fcSizeR)}`);
            if (rW > 0) dimV(wx(cW/2 + fcSizeR) + 54, wz(fcSizeR), wz(fcSizeR + rW), `${_bpMm(rW)}`);
            if (rW > 0) dimH(wx(cW/2 + fcSizeR - rD), wx(cW/2 + fcSizeR), wz(fcSizeR + rW) + 28, `${_bpMm(rD)}`);
        }
        if (hasLeftFC) {
            dimH(wx(-cW/2 - fcSizeL), wx(-cW/2), wz(0) - 14, `${_bpMm(fcSizeL)}`);
            // Corner depth + wing width on LEFT side, label left
            dimVLeft(wx(-cW/2 - fcSizeL) - 14, wz(0), wz(fcSizeL), `${_bpMm(fcSizeL)}`);
            if (lW > 0) dimVLeft(wx(-cW/2 - fcSizeL) - 14, wz(fcSizeL), wz(fcSizeL + lW), `${_bpMm(lW)}`);
            if (lW > 0) dimH(wx(-cW/2 - fcSizeL), wx(-cW/2 - fcSizeL + lD), wz(fcSizeL + lW) + 28, `${_bpMm(lD)}`);
        }
    }

    // ---- PANELS 1..N: Per-wing front views with hangers & drawers ----
    wingList.forEach((wg, wi) => {
        const _bpViewKey = wg.wd === leftWing ? 'left' : wg.wd === rightWing ? 'right' : 'center';
        const py = MARGIN + 22 + GAP + (TOP_H + LABEL_H) + GAP + wi * (WING_H + LABEL_H + GAP);
        const pw = SVG_W - MARGIN * 2;
        panelBox(MARGIN, py, pw, WING_H, `שרטוט חזית — ${wg.label} | רוחב: ${_bpMm(wg.w)} מ"מ | גובה: ${_bpMm(wg.h)} מ"מ | עומק: ${_bpMm(wg.d)} מ"מ`);
        const drawY = py + LABEL_H;
        const _isCenterWg = wg.wd === centerWing;
        const _horizExtra = _isCenterWg ? _bpCenterHorizExtra(centerWing) : { left: 0, right: 0 };
        const _layoutW = wg.w + _horizExtra.left + _horizExtra.right;
        const sc = Math.min((pw - PAD*2) / Math.max(_layoutW, 1), (WING_H - PAD*2) / Math.max(wg.h, 1));
        const dW = wg.w * sc, dH = wg.h * sc;
        const ox = MARGIN + (pw - _layoutW * sc) / 2 + _horizExtra.left * sc;
        const oy = drawY + (WING_H - dH) / 2;

        // Columns, shelves, hangers & drawers
        const cols = (wg.wd && wg.wd.columns) ? wg.wd.columns : (state.columns || []);

        // Cabinet body — draw per-column rects at actual heights, respecting floorOffset
        // floorOffset = how much is cut from the BOTTOM of the column
        // visibleH = col.height - col.floorOffset; box is raised by floorOffset from floor
        {
            let _cx = ox;
            cols.forEach((col, ci) => {
                const isLastCol = (ci === cols.length - 1);
                const _cw = isLastCol ? (ox + dW - _cx) : (col.width || wg.w) * sc;
                const _fo = col.floorOffset || 0;
                const _visibleH = (col.height || wg.h) - _fo;
                const _colSvgH = _visibleH * sc;
                // box is raised by floorOffset: bottom = oy+dH - fo*sc, top = bottom - visibleH*sc
                const _colBotY = oy + dH - _fo * sc;
                const _colTopY = _colBotY - _colSvgH;
                rect(_cx, _colTopY, _cw, _colSvgH, wg.fill, STROKE, 2);
                _cx += _cw;
            });
        }
        // Plinth — draw per-column segment only for columns that sit on the floor (floorOffset === 0)
        // Desk columns (col.type === 'desk') are open below — no plinth
        if (pH > 0) {
            let _px = ox;
            cols.forEach((col, ci) => {
                const isLastCol = (ci === cols.length - 1);
                const _pw = isLastCol ? (ox + dW - _px) : (col.width || wg.w) * sc;
                if (!(col.floorOffset > 0) && !col.noPlinth && col.type !== 'desk') {
                    rect(_px, oy + dH - pH*sc, _pw, pH*sc, '#cbd5e1', STROKE, 1);
                }
                _px += _pw;
            });
        }

        // ---- Bathroom countertop slab + sink — front view ----
        if (pid === 'bathroom' && wg.wd === centerWing) {
            const _bpCT2 = centerWing.countertopType || 'integral';
            const _bpSlabT = _bpCT2 === 'butcher26' ? 2.6 : _bpCT2 === 'butcher40' ? 4.0 : _bpCT2 === 'corian12' ? 1.2 : 2.0; // integral=2cm
            const _bpSlabSvgH = _bpSlabT * sc;
            // Slab sits on top of cabinet body — use the max column top
            const _bpBodyTopY = cols.length > 0 ? Math.min(...cols.map(c => {
                const _fo = c.floorOffset || 0;
                return oy + dH - (c.height || wg.h) * sc;
            })) : oy;
            const _bpSlabTopY = _bpBodyTopY - _bpSlabSvgH;
            const SLAB_FILL   = _bpCT2.startsWith('butcher') ? '#d4a96a' : '#f0f0f0';
            const SLAB_STROKE = '#1e3a5f';
            // Draw slab spanning full cabinet width
            rect(ox, _bpSlabTopY, dW, _bpSlabSvgH, SLAB_FILL, SLAB_STROKE, 1.5);

            // Draw sink symbol
            if (_bpCT2 === 'integral') {
                // Integral sink: center on the sinkPanel column group (same as 3D engine)
                // Compute group left X and total width in SVG coords
                let _sgLeftCm = 0, _sgWidthCm = 0, _sgFound = false;
                let _cxAcc = 0;
                cols.forEach((col, ci) => {
                    const _cw = col.width || wg.w;
                    if (col.sinkPanel) {
                        if (!_sgFound) { _sgLeftCm = _cxAcc; _sgFound = true; }
                        _sgWidthCm += _cw;
                    }
                    _cxAcc += _cw;
                });
                // Basin width matches 3D: 50cm if group >= 100cm, else 40cm
                const _iSinkW_cm = _sgFound ? (_sgWidthCm >= 100 ? 50 : 40) : Math.min(cW * 0.6, 55);
                const _iSinkD_cm = 12; // basin depth visible in front view (cm into cabinet)
                const _iSinkW = _iSinkW_cm * sc;
                const _iSinkH = _iSinkD_cm * sc;
                // Center X: group center in SVG coords
                const _sgCenterSvgX = _sgFound ? (ox + (_sgLeftCm + _sgWidthCm / 2) * sc) : (ox + dW / 2);
                const _iSinkX = _sgCenterSvgX - _iSinkW / 2;
                const _iSinkY = _bpBodyTopY; // starts at cabinet top (slab bottom = body top)
                p.push(`<rect x="${_iSinkX.toFixed(1)}" y="${_iSinkY.toFixed(1)}" width="${_iSinkW.toFixed(1)}" height="${_iSinkH.toFixed(1)}" rx="${Math.min(_iSinkW,_iSinkH)*0.12}" fill="rgba(186,230,253,0.7)" stroke="${SLAB_STROKE}" stroke-width="1"/>`);
                p.push(`<text x="${(_iSinkX+_iSinkW/2).toFixed(1)}" y="${(_iSinkY+_iSinkH/2+4).toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="11" fill="${SLAB_STROKE}" opacity="0.8">כיור</text>`);
            } else {
                // Vessel sink: rectangle sits ON TOP of the slab (above it)
                const VESSEL_H_BP = 15;
                const _bpVW2 = Math.min(cW * 0.35, 50);
                const _bpOffX2 = (centerWing.vesselSinkOffsetX) || 0;
                const _vFVCX = ox + dW/2 + _bpOffX2 * sc;
                const _vFVW  = _bpVW2 * sc;
                const _vFVH  = VESSEL_H_BP * sc;
                const _vFVX  = _vFVCX - _vFVW / 2;
                const _vFVY  = _bpSlabTopY - _vFVH; // vessel sits ABOVE the slab top
                rect(_vFVX, _vFVY, _vFVW, _vFVH, 'rgba(186,230,253,0.7)', SLAB_STROKE, 1.5);
                p.push(`<text x="${(_vFVX+_vFVW/2).toFixed(1)}" y="${(_vFVY+_vFVH/2+4).toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="11" fill="${SLAB_STROKE}" opacity="0.8">כיור</text>`);
            }
        }

        // Side desk + side cabinet on center front view
        if (_isCenterWg) {
            const _deskFP = _bpCenterSideDesk(centerWing);
            if (_deskFP) {
                _bpDrawSideDeskFrontParts(p, _deskFP, ox, oy, dW, dH, sc, wg.fill, STROKE, STROKE_THIN, FONT, dimH, dimV, dimVLeft);
            }
            const _scFP = _bpCenterSideCabinet(centerWing);
            if (_scFP) {
                _bpDrawSideCabinetFrontParts(p, _scFP, ox, oy, dW, dH, sc, wg.h, pH, (x, y, w, h, f, s, sw) => rect(x, y, w, h, f, s, sw), dimH, STROKE, FONT);
            }
        }

        // Track column X positions for per-column width dims
        const colXPositions = []; // [{x1, x2, wCm, colTopY, colBotY}]
        _bpHoneycombSepBegin();
        let colX = ox;
        cols.forEach((col, ci) => {
            const isLastCol = (ci === cols.length - 1);
            const colW = isLastCol ? (ox + dW - colX) : (col.width || wg.w) * sc;
            // Desk columns are open below (no plinth) — treat colPlinthH as 0
            const colPlinthH = (col.noPlinth || col.type === 'desk') ? 0 : pH;
            const _fo = col.floorOffset || 0;
            const _colActualH = col.height || wg.h;
            const _visibleH = _colActualH - _fo; // visible height after bottom cut
            // box is raised by floorOffset: bottom = oy+dH - fo*sc, top = bottom - visibleH*sc
            const _colBotY = oy + dH - _fo * sc;
            const _colTopY = _colBotY - _visibleH * sc;
            colXPositions.push({ x1: colX, x2: colX + colW, wCm: (col.width != null ? col.width : wg.w), colTopY: _colTopY, colBotY: _colBotY });

            // Column divider line (not first) — spans from the higher top to the lower bottom of adjacent columns
            if (ci > 0) {
                const prevCol = cols[ci - 1];
                const prevFO  = prevCol ? (prevCol.floorOffset || 0) : 0;
                const prevH   = (prevCol && prevCol.height) ? prevCol.height : wg.h;
                const prevVisibleH = prevH - prevFO;
                const prevBotY = oy + dH - prevFO * sc;
                const prevTopY = prevBotY - prevVisibleH * sc;
                const sepTopY = Math.min(_colTopY, prevTopY);
                const sepBotY = Math.max(_colBotY, prevBotY);
                const _sepHoles = _bpOpenCellSepHolesSvg(prevCol, col, wg, pH, oy, dH, sc);
                _bpVlineWithHoles((x, y1, y2) => vline(x, y1, y2, sc), colX, sepTopY, sepBotY, _sepHoles);
            }

            const _splitYOld = col.splitY || 0;
            const _splitTOld = (state.thickness || 1.7) * 2;
            // Shelves — skip internal honeycomb shelves (drawn with block geometry)
            const shelvesArrEarly = (col.shelvesY || []).slice().sort((a,b) => a-b);
            const deskBaseEarly = (col.type === 'desk') ? (col.deskHeight || 80) + (col.deskClearance || 80) : _bpRowBaseCm(col, colPlinthH);
            const adjShelvesEarly = shelvesArrEarly.map(sy => sy - _fo).filter(sy => sy > 0 && sy < _visibleH);
            const _splitYOldAdjE = _splitYOld > 0 ? (_splitYOld - _fo) : 0;
            const _splitTopOldAdjE = _splitYOldAdjE > 0 ? _splitYOldAdjE + _splitTOld : 0;
            let _allBoundsEarly = [...adjShelvesEarly];
            if (_splitYOldAdjE > deskBaseEarly && _splitYOldAdjE < _visibleH) {
                if (!_allBoundsEarly.includes(_splitYOldAdjE)) _allBoundsEarly.push(_splitYOldAdjE);
                if (_splitTopOldAdjE < _visibleH && !_allBoundsEarly.includes(_splitTopOldAdjE)) _allBoundsEarly.push(_splitTopOldAdjE);
                _allBoundsEarly.sort((a,b) => a-b);
            }
            const rowBoundsEarly = [deskBaseEarly, ..._allBoundsEarly.filter(sy => sy > deskBaseEarly), _visibleH];
            const _hcBlocksOld = _bpHoneycombBlocksFromCompartments(col.compartments, rowBoundsEarly.length - 1);
            (col.shelvesY || []).forEach(sy => {
                const syAdjusted = sy - _fo;
                if (_splitYOld > 0 && syAdjusted >= _splitYOld && syAdjusted <= _splitYOld + _splitTOld) return;
                if (_bpIsHoneycombInternalShelf(_hcBlocksOld, rowBoundsEarly, syAdjusted)) return;
                if (syAdjusted > 0 && syAdjusted < _visibleH) shelfLine(colX, _colBotY - syAdjusted*sc, colX + colW, sc);
            });
            // Structural top + bottom boards (17mm) — already in cell math, now visible
            _bpDrawTopBottomBoards(
                function(x1, sy, x2) { shelfLine(x1, sy, x2, sc); },
                col, colX, colW, _colBotY, _visibleH, colPlinthH, sc
            );

            // Split band (ארון עליון / ארון תחתון divider) — double board drawn as filled rect
            if (_splitYOld > 0 && _splitYOld > _fo && _splitYOld < (col.height || wg.h)) {
                const _splitAdjOld = _splitYOld - _fo;
                const _splitBandBotOld = _colBotY - _splitAdjOld * sc;
                const _splitBandHOld   = _splitTOld * sc;
                const _splitBandTopOld = _splitBandBotOld - _splitBandHOld;
                _bpDrawSplitDoubleBand(rect, colX, _splitBandTopOld, colW, _splitBandHOld, STROKE);
                if (ci === 0) {
                    const lowerMidOld = (_colBotY + _splitBandBotOld) / 2;
                    const upperMidOld = (_colTopY + _splitBandTopOld) / 2;
                    p.push(`<text x="${(colX + 6).toFixed(1)}" y="${(lowerMidOld + 4).toFixed(1)}" font-family="${FONT}" font-size="11" fill="${STROKE}" opacity="0.5">ארון תחתון</text>`);
                    p.push(`<text x="${(colX + 6).toFixed(1)}" y="${(upperMidOld + 4).toFixed(1)}" font-family="${FONT}" font-size="11" fill="${STROKE}" opacity="0.5">ארון עליון</text>`);
                    p.push(`<text x="${(colX + colW / 2).toFixed(1)}" y="${(_splitBandTopOld + _splitBandHOld / 2 + 3).toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="8" fill="${STROKE}" opacity="0.62">${_bpMm(_splitTOld)}</text>`);
                }
            }

            // Internal desk column rendering
            if (col.type === 'desk') {
                const deskH   = col.deskHeight   || 80;
                const deskClr = col.deskClearance || 80;
                const t       = state.thickness || 1.7; // board thickness in cm (visual only)
                // Open area below desk surface: white fill (no cabinet color)
                const openTop = _colBotY - deskH * sc;  // deskH from column bottom upward
                const openBot = _colBotY - colPlinthH * sc;
                rect(colX, openTop, colW, openBot - openTop, 'white', STROKE_THIN, 0.5);
                // Desk surface line
                p.push(`<line x1="${colX.toFixed(1)}" y1="${openTop.toFixed(1)}" x2="${(colX+colW).toFixed(1)}" y2="${openTop.toFixed(1)}" stroke="${STROKE}" stroke-width="1.5"/>`);
                const deskSurfPx = DESK_SURFACE_T * sc;
                // Drawers below desk surface
                if (col.hasDrawers) {
                    const drawerH = col.drawerHeight || 12;
                    const numDrawers = col.deskDrawerCount != null ? col.deskDrawerCount : ((col.width || wg.w) <= 80 ? 1 : 2);
                    const drawerW = colW / numDrawers;
                    const drawerPxH = drawerH * sc;
                    const drawerY = openTop + deskSurfPx;
                    for (let di = 0; di < numDrawers; di++) {
                        const dx = colX + di * drawerW;
                        rect(dx + 2, drawerY, drawerW - 4, drawerPxH - 2, 'rgba(255,255,255,0.7)', STROKE_THIN, 0.8);
                        const hndW = Math.min(drawerW * 0.4, 20);
                        const hndX = dx + (drawerW - hndW) / 2;
                        const hndY = drawerY + drawerPxH * 0.5;
                        p.push(`<line x1="${hndX.toFixed(1)}" y1="${hndY.toFixed(1)}" x2="${(hndX+hndW).toFixed(1)}" y2="${hndY.toFixed(1)}" stroke="${STROKE}" stroke-width="1.8"/>`);
                    }
                    // Dimension: drawer height (right side of column)
                    dimV(colX + colW + 14, drawerY, drawerY + drawerPxH, `${_bpMm(drawerH)}`);
                    // Dimension: floor to drawer bottom (gap from floor to bottom of drawer)
                    dimV(colX + colW + 50, drawerY + drawerPxH, _colBotY, `${_bpMm((deskH - DESK_SURFACE_T - drawerH))}`);
                }
                // Clearance board (shelf above clearance zone) — measured from column bottom
                const clrBoardY = _colBotY - (deskH + deskClr) * sc;
                shelfLine(colX, clrBoardY, colX + colW, sc);
                // Label "שולחן" inside the open area
                const lblY = openTop + (openBot - openTop) / 2 + 4;
                p.push(`<text x="${(colX+colW/2).toFixed(1)}" y="${lblY.toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="12" fill="${STROKE}" opacity="0.5">שולחן</text>`);
            }

            // Draw cell contents (hangers & drawers) per row
            const rowBounds = rowBoundsEarly;
            const _splitYOldAdj = _splitYOldAdjE;
            const _splitTopOldAdj = _splitTopOldAdjE;
            const numRows = rowBounds.length - 1;
            const _t_shelf = state.thickness || 1.7;
            for (let ri = 0; ri < numRows; ri++) {
                const rowBotCm = rowBounds[ri];
                const rowTopCm = rowBounds[ri + 1];
                const cellHeightLabel = _bpClearCellHeightLabel(rowBotCm, rowTopCm, _t_shelf);
                const cellY1 = _colBotY - rowTopCm * sc; // SVG top of cell
                const cellY2 = _colBotY - rowBotCm * sc; // SVG bottom of cell
                const cellH = cellY2 - cellY1;
                const cellCX = colX + colW / 2;

                // Get cell type from compartments array
                const comp = col.compartments ? col.compartments[ri] : null;
                const cellType = comp ? (comp.type || 'empty') : 'empty';

                if (cellType === 'hanging') {
                    // Hanger symbol: horizontal hanging rod near top of cell
                    const rodY   = _bpHangRodSvgY(cellY1, sc);
                    const hRodX1 = colX + 4;
                    const hRodX2 = colX + colW - 4;
                    p.push(`<line x1="${hRodX1.toFixed(1)}" y1="${rodY.toFixed(1)}" x2="${hRodX2.toFixed(1)}" y2="${rodY.toFixed(1)}" stroke="${STROKE}" stroke-width="2"/>`);
                    p.push(`<circle cx="${hRodX1.toFixed(1)}" cy="${rodY.toFixed(1)}" r="2" fill="${STROKE}"/>`);
                    p.push(`<circle cx="${hRodX2.toFixed(1)}" cy="${rodY.toFixed(1)}" r="2" fill="${STROKE}"/>`);
                } else if (cellType === 'sorbet') {
                    // סורבטו — מנגנון תלייה מתרומם (ממורכז אנכית בתא)
                    // בלוקי דיור בתחתית, מוטות אנכיים עולים, מוט אופקי בראש, ידית יורדת מהמוט
                    const mechH  = cellH * 0.5;
                    const mechY1 = cellY1 + (cellH - mechH) / 2;
                    const mechY2 = mechY1 + mechH;
                    const boxH   = Math.min(mechH * 0.2, 8);
                    const boxW   = Math.min(colW * 0.1, 7);
                    const boxY   = mechY2 - boxH;                 // בלוקי דיור בתחתית המנגנון
                    const boxLX  = colX + 4;
                    const boxRX  = colX + colW - 4 - boxW;
                    // בלוקי דיור בתחתית
                    p.push(`<rect x="${boxLX.toFixed(1)}" y="${boxY.toFixed(1)}" width="${boxW.toFixed(1)}" height="${boxH.toFixed(1)}" fill="${STROKE}" rx="1"/>`);
                    p.push(`<rect x="${boxRX.toFixed(1)}" y="${boxY.toFixed(1)}" width="${boxW.toFixed(1)}" height="${boxH.toFixed(1)}" fill="${STROKE}" rx="1"/>`);
                    // מוט אופקי בראש המנגנון
                    const hRodY  = mechY1;
                    const hRodX1 = boxLX + boxW / 2;
                    const hRodX2 = boxRX + boxW / 2;
                    p.push(`<line x1="${hRodX1.toFixed(1)}" y1="${hRodY.toFixed(1)}" x2="${hRodX2.toFixed(1)}" y2="${hRodY.toFixed(1)}" stroke="${STROKE}" stroke-width="2"/>`);
                    p.push(`<circle cx="${hRodX1.toFixed(1)}" cy="${hRodY.toFixed(1)}" r="2.5" fill="${STROKE}"/>`);
                    p.push(`<circle cx="${hRodX2.toFixed(1)}" cy="${hRodY.toFixed(1)}" r="2.5" fill="${STROKE}"/>`);
                    // שני מוטות אנכיים — מהמוט האופקי לבלוקים
                    p.push(`<line x1="${(boxLX + boxW/2).toFixed(1)}" y1="${hRodY.toFixed(1)}" x2="${(boxLX + boxW/2).toFixed(1)}" y2="${boxY.toFixed(1)}" stroke="${STROKE}" stroke-width="1.5"/>`);
                    p.push(`<line x1="${(boxRX + boxW/2).toFixed(1)}" y1="${hRodY.toFixed(1)}" x2="${(boxRX + boxW/2).toFixed(1)}" y2="${boxY.toFixed(1)}" stroke="${STROKE}" stroke-width="1.5"/>`);
                    // ידית משיכה — יורדת מהמוט האופקי כלפי מטה (ידית ארוכה)
                    const handleW  = Math.min(colW * 0.07, 5);
                    const handleH  = mechH * 0.6;
                    const handleX  = (hRodX1 + hRodX2) / 2 - handleW / 2;
                    p.push(`<rect x="${handleX.toFixed(1)}" y="${hRodY.toFixed(1)}" width="${handleW.toFixed(1)}" height="${handleH.toFixed(1)}" fill="${STROKE}" rx="1" opacity="0.75"/>`);
                    // תווית
                    if (cellH > 25) p.push(`<text x="${cellCX.toFixed(1)}" y="${(cellY1 + 10).toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="11" fill="${STROKE}" opacity="0.55">סורבטו</text>`);
                } else if (cellType === 'internal_drawers' || cellType === 'external_drawers') {
                    const drawerCount = comp.count || 2;
                    const dh = cellH / drawerCount;
                    for (let di = 0; di < drawerCount; di++) {
                        const dy = cellY1 + di * dh;
                        rect(colX + 2, dy + 1, colW - 4, dh - 2, 'rgba(255,255,255,0.5)', STROKE_THIN, 0.8);
                        const hndW = Math.min(colW * 0.35, 22);
                        const hndX = colX + (colW - hndW) / 2;
                        const hndY = dy + dh * 0.5;
                        p.push(`<line x1="${hndX.toFixed(1)}" y1="${hndY.toFixed(1)}" x2="${(hndX+hndW).toFixed(1)}" y2="${hndY.toFixed(1)}" stroke="${STROKE}" stroke-width="1.8"/>`);
                    }
                } else if (cellType === 'open_cell') {
                    if (cellH > 18) p.push(`<text x="${cellCX.toFixed(1)}" y="${(cellY1 + 20).toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="12" fill="${STROKE}" opacity="0.6">כוורת</text>`);
                } else if (cellType === 'side_open_cell') {
                    if (cellH > 18) p.push(`<text x="${cellCX.toFixed(1)}" y="${(cellY1 + 20).toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="12" fill="${STROKE}" opacity="0.6">כוורת צד</text>`);
                }

                // Partition(s) (מחיצה) — walls + hanging rods + drawers in each sub-cell
                _bpDrawPartitionCell(p, {
                    comp, col, wgW: wg.w, colX, colW, cellY1, cellY2,
                    rowBotCm, rowTopCm, colBotSvgY: _colBotY, sc, ci, cols,
                    viewKey: _bpViewKey, ri, font: FONT, stroke: STROKE, strokeThin: STROKE_THIN,
                    vlineFn: function(x, y1, y2) { vline(x, y1, y2, sc); },
                    shelfLineFn: function(x1, y, x2) { shelfLine(x1, y, x2, sc); },
                    dimHFn: dimH,
                    makeRectP: function(pp, x, y, w, h, fill, stroke, sw) { rect(x, y, w, h, fill, stroke, sw); },
                    makeShelfP: function(pp, x1, sy, x2, scc, tCm, showLabel) { shelfLine(x1, sy, x2, scc, tCm, showLabel); }
                });

                // Per-cell height: small text label INSIDE the cell (centered)
                // Skip label for cells that fall within the split band
                // For bathroom preset: skip all internal cell height labels
                // Partitioned cells already have per-sub-zone dims — skip full-cell
                // label/hit so clicks toggle the sub-zone dim instead of a covering parent.
                const _isSplitBandOld = _splitYOldAdj > 0 &&
                    rowBotCm >= _splitYOldAdj - 0.1 && rowTopCm <= _splitTopOldAdj + 0.1;
                const _hasPartitionZonesOld = !!(comp && comp.partition && Array.isArray(comp.subCells) && comp.subCells.length);
                if (pid !== 'bathroom' && cellHeightLabel > 0 && cellH > 14 && !_isSplitBandOld && !_hasPartitionZonesOld && !_bpIsHoneycombType(comp && comp.type)) {
                    const lblCX = colX + colW / 2;
                    const lblCY = (cellY1 + cellY2) / 2 + 4;
                    _bpPushCellDimLabel(p, _bpViewKey, `c${ci}r${ri}`, lblCX, lblCY, cellHeightLabel,
                        { x: colX, y: cellY1, w: colW, h: cellH });
                }
            }
            _hcBlocksOld.forEach(block => {
                _bpMarkBlockAdjacentMerges(block, rowBoundsEarly, _fo, cols, ci, wg, colPlinthH);
                _bpDrawHoneycombBlock(p, {
                    block, colX, colW, sc, colBotSvgY: _colBotY, rowBounds: rowBoundsEarly, ci, numCols: cols.length,
                    boardFill: '#94a3b8', strokeThin: STROKE_THIN, stroke: STROKE, font: FONT,
                    viewKey: _bpViewKey,
                    makeRectFn: (pp, x, y, w, h, fill, stroke, sw) => rect(x, y, w, h, fill, stroke, sw),
                    makeShelfFn: (pp, x1, sy, x2, scc, tCm, showLabel) => shelfLine(x1, sy, x2, scc, tCm, showLabel)
                });
            });
            colX += colW;
        });
        _bpHoneycombSepFlush(p);

        if (cols.length > 0) {
            _bpDrawOuterSideWalls(p, (pp, x, y1, y2, scc, tCm, labelSide) => {
                const t = tCm != null ? tCm : (state.thickness || 1.7);
                const tPx = t * scc;
                if (tPx < 0.4 || y2 - y1 < 2) return;
                const halfT = tPx / 2;
                rect(x - halfT, y1, tPx, y2 - y1, '#94a3b8', STROKE_THIN, 1);
                if (y2 - y1 > 14) {
                    const my = (y1 + y2) / 2;
                    const tx = labelSide === 'left' ? (x - halfT - 3) : (x + halfT + 3);
                    const anchor = labelSide === 'left' ? 'end' : 'start';
                    p.push(`<text x="${tx.toFixed(1)}" y="${(my+3).toFixed(1)}" text-anchor="${anchor}" font-family="${FONT}" font-size="8" fill="${STROKE}" opacity="0.62">${_bpMm(t)}</text>`);
                }
            }, ox, dW, colXPositions, sc);
        }

        // ---- Side-open-cell wall gap overlay ----
        {
            const _wallOverlayOld = (colIdx, isLeft) => {
                const col = cols[colIdx];
                if (!col) return;
                const colPlinthH = col.noPlinth ? 0 : pH;
                const _fo = col.floorOffset || 0;
                const _colActualH = col.height || wg.h;
                const _visibleH = _colActualH - _fo;
                // box is raised by floorOffset
                const _colBotSvgY = oy + dH - _fo * sc;
                const shelvesArr = (col.shelvesY || []).slice().sort((a,b) => a-b);
                // adjust shelf positions by floorOffset
                const adjShelves = shelvesArr.map(sy => sy - _fo).filter(sy => sy > 0 && sy < _visibleH);
                const _rowBaseOld = _bpRowBaseCm(col, colPlinthH);
                const rowBounds = [_rowBaseOld, ...adjShelves.filter(sy => sy > _rowBaseOld), _visibleH];
                for (let ri = 0; ri < rowBounds.length - 1; ri++) {
                    const comp = col.compartments ? col.compartments[ri] : null;
                    if (!comp || comp.type !== 'side_open_cell') continue;
                    const cellY1 = _colBotSvgY - rowBounds[ri + 1] * sc;
                    const cellY2 = _colBotSvgY - rowBounds[ri] * sc;
                    const wallX = isLeft ? ox : ox + dW;
                    const overlayW = 4;
                    p.push(`<rect x="${(wallX - overlayW/2).toFixed(1)}" y="${cellY1.toFixed(1)}" width="${overlayW}" height="${(cellY2 - cellY1).toFixed(1)}" fill="${wg.fill}" stroke="none"/>`);
                }
            };
            _wallOverlayOld(0, true);
            _wallOverlayOld(cols.length - 1, false);
        }

        // Overall dimensions
        const _hasFloorPlinthOld = pH > 0 && _bpAnyColumnOnFloor(cols);
        const _plinthBottomY = _bpWidthDimBaseY(oy, dH, pH, sc, cols);
        const _hasMultiCols = colXPositions.length > 1;
        const dimY = _plinthBottomY + (_hasMultiCols ? 54 : 36);
        // Total width (below plinth)
        dimH(ox, ox + dW, dimY, `${_bpMm(wg.w)}`);
        // Per-column width dims — placed just below the plinth bottom
        {
            const _tCmHC = state.thickness || 1.7;
            colXPositions.forEach((cp, ci) => {
                const col = cols[ci];
                if (_bpColumnHasHoneycomb(col)) {
                    const inner = _bpHoneycombInnerSvgSpan(cp, sc, _tCmHC);
                    if (inner) _bpMaybePushInnerWidthDim(p, _bpViewKey, 'hcInnerW:c' + ci, inner.x1, inner.x2, _plinthBottomY + 6, inner.lbl, dimH, false);
                }
                if (_hasMultiCols || _bpColumnHasHoneycomb(col)) {
                    const faceY = (cp.colTopY != null) ? cp.colTopY : oy;
                    const faceH = (cp.colBotY != null && cp.colTopY != null) ? (cp.colBotY - cp.colTopY) : dH;
                    _bpMaybePushColWidthDim(p, _bpViewKey, ci, cp.x1, cp.x2, _plinthBottomY + 18,
                        `${_bpMm(cp.wCm)}`, dimH, false, faceY, faceH);
                }
            });
        }
        // Total height (left side) — from floor (oy+dH) to highest column top
        // box is raised by floorOffset; top = oy+dH - fo*sc - visibleH*sc = oy+dH - (fo + visibleH)*sc = oy+dH - height*sc
        const _wgMaxTopY = cols.length > 0 ? Math.min(...cols.map(c => oy + dH - (c.height || wg.h) * sc)) : oy;
        const _wgTotalHcm = cols.length > 0 ? _bpMm(Math.max(...cols.map(c => (c.height || wg.h)))) : _bpMm(wg.h);
        dimV(ox - 54, _wgMaxTopY, oy + dH, `${_wgTotalHcm}`);
        _bpDrawShorterColumnOverallHeights(dimV, cols, colXPositions, oy, dH, sc, wg.h, ox, dW);
        // ---- Bathroom preset: right-side external dims (body height + floor offset + drawer heights) ----
        // ---- Regular preset: split section dims + floorOffset dims ----
        if (pid === 'bathroom') {
            // Right side: body height only (cabinet top to cabinet bottom, without floor gap)
            // Total height is already on the LEFT — do NOT repeat on right
            const _bathRefColIdxOld = cols.findIndex(c => (c.floorOffset || 0) > 0);
            const _bathRefColOld = _bathRefColIdxOld >= 0 ? cols[_bathRefColIdxOld] : (cols[0] || null);
            if (_bathRefColOld) {
                const _fo5o = _bathRefColOld.floorOffset || 0;
                const _colH5o = _bathRefColOld.height || wg.h;
                const _bodyH5o = _colH5o - _fo5o; // body height in cm
                const _colBotY5o = oy + dH - _fo5o * sc;
                const _colTopY5o = _colBotY5o - _bodyH5o * sc;
                // Body height on right side
                dimVLeft(ox + dW + 38, _colTopY5o, _colBotY5o, `${_bpMm(_bodyH5o)}`);
                // Floor offset (only for hanging cabinet)
                if (_fo5o > 0) {
                    dimV(ox + dW + 76, _colBotY5o, oy + dH, `${_bpMm(_fo5o)}`);
                }
            }
            // External drawer row heights on right side.
            // For each external_drawers row: if count>1, show each individual drawer height.
            {
                const _bathDrawerColOld = cols.find(c => c.compartments && c.compartments.some(comp => comp && comp.type === 'external_drawers'));
                if (_bathDrawerColOld) {
                    const _fo4o = _bathDrawerColOld.floorOffset || 0;
                    const _visH4o = (_bathDrawerColOld.height || wg.h) - _fo4o;
                    const _colBotY4o = oy + dH - _fo4o * sc;
                    const _shelvesAdj4o = (_bathDrawerColOld.shelvesY || []).slice().sort((a,b)=>a-b).map(sy => sy - _fo4o).filter(sy => sy > 0 && sy < _visH4o);
                    const _rowBounds4o = [0, ..._shelvesAdj4o, _visH4o];
                    for (let ri4o = 0; ri4o < _rowBounds4o.length - 1; ri4o++) {
                        const comp4o = _bathDrawerColOld.compartments[ri4o];
                        if (!comp4o || comp4o.type !== 'external_drawers') continue;
                        const rowBotCm4o = _rowBounds4o[ri4o];
                        const rowTopCm4o = _rowBounds4o[ri4o + 1];
                        const rowSvgBot4o = _colBotY4o - rowBotCm4o * sc;
                        const rowSvgTop4o = _colBotY4o - rowTopCm4o * sc;
                        const rowHcm4o = rowTopCm4o - rowBotCm4o;
                        const drawerCount4o = comp4o.count || 1;
                        if (drawerCount4o > 1) {
                            const singleDrawerHcm4o = rowHcm4o / drawerCount4o;
                            const singleDrawerSvgH4o = singleDrawerHcm4o * sc;
                            for (let di4o = 0; di4o < drawerCount4o; di4o++) {
                                const dSvgTop4o = rowSvgTop4o + di4o * singleDrawerSvgH4o;
                                const dSvgBot4o = dSvgTop4o + singleDrawerSvgH4o;
                                if (dSvgBot4o - dSvgTop4o > 8) {
                                    dimVLeft(ox + dW + 38, dSvgTop4o, dSvgBot4o, `${_bpMm(singleDrawerHcm4o)}`);
                                }
                            }
                        } else {
                            if (rowSvgBot4o - rowSvgTop4o > 8) {
                                dimVLeft(ox + dW + 38, rowSvgTop4o, rowSvgBot4o, `${_bpMm(rowHcm4o)}`);
                            }
                        }
                    }
                }
            }
        } else {
            // Split section dimensions (right side, offset further to avoid overlap)
            {
                const _splitColOld2 = cols.find(c => c.splitY && c.splitY > 0);
                if (_splitColOld2) {
                    const _syOld2 = _splitColOld2.splitY;
                    const _tOld2  = (state.thickness || 1.7) * 2;
                    const _foOld2 = _splitColOld2.floorOffset || 0;
                    const _splitBotYOld2 = oy + dH - _syOld2 * sc;
                    const _splitTopYOld2 = _splitBotYOld2 - _tOld2 * sc;
                    const _colTopYOld2   = oy + dH - (_splitColOld2.height || wg.h) * sc;
                    const _colBotYOld2   = oy + dH - _foOld2 * sc;
                    const _lowerStartYOld2 = _foOld2 > 0 ? _colBotYOld2 : oy + dH - pH * sc;
                    const _lowerBaseCmOld2 = _foOld2 > 0 ? _foOld2 : pH;
                    const _lowerHOld2 = Math.round((_syOld2 - _lowerBaseCmOld2) * 10);
                    const _upperHOld2 = Math.round(((_splitColOld2.height || wg.h) - _syOld2 - _tOld2) * 10);
                    dimV(ox + dW + 54, _splitTopYOld2, _colTopYOld2, `${_upperHOld2}`);
                    dimV(ox + dW + 54, _splitBotYOld2, _lowerStartYOld2, `${_lowerHOld2}`);
                }
            }
            // floorOffset + body height for hanging cabinets (regular preset)
            {
                const _hangColOld = cols.find(c => (c.floorOffset || 0) > 0);
                if (_hangColOld) {
                    const _foH = _hangColOld.floorOffset || 0;
                    const _bodyH = (_hangColOld.height || wg.h) - _foH;
                    const _colBotH = oy + dH - _foH * sc;
                    const _colTopH = _colBotH - _bodyH * sc;
                    dimVLeft(ox + dW + 38, _colTopH, _colBotH, `${_bpMm(_bodyH)}`);
                    dimV(ox + dW + 76, _colBotH, oy + dH, `${_bpMm(_foH)}`);
                } else {
                    let _foDimX = ox + dW + (_hasFloorPlinthOld ? 38 : 18);
                    colXPositions.forEach((cp, ci) => {
                        const _col = cols[ci];
                        const _fo = (_col && _col.floorOffset) ? _col.floorOffset : 0;
                        if (_fo > 0) {
                            dimV(_foDimX, cp.colBotY, oy + dH, `${_bpMm(_fo)}`);
                            _foDimX += 36;
                        }
                    });
                }
            }
        }

        // ---- Closure panels overlay (only for center wing, when wall-snap is active) ----
        if (wg.wd === centerWing) {
            const _presetBP = state.presetId || 'linear';
            const _isLSBP = (_presetBP === 'linear' || _presetBP === 'sliding');
            const _rwBP = _isLSBP ? (window._roomWall || state.roomWall || 'center') : 'center';
            const _closureOnBP = (window._closureEnabled !== false);
            if (_rwBP !== 'center' && _isLSBP && _closureOnBP) {
                const _cWBP   = Math.max(1.8, parseFloat(window._closureWidth)      || 1.8);
                const _cWRBP  = Math.max(1.8, parseFloat(window._closureWidthRight) || 1.8);
                const _cCWBP  = Math.max(1.8, parseFloat(window._closureCeilWidth)  || 1.8);
                const FILL_CL = '#d4c5b0', STROKE_CL = '#8b7355';
                const _ceilSvgHBP = _cCWBP * sc;
                // Left side panel
                if (_rwBP === 'left' || _rwBP === 'both') {
                    const _sideSvgWL = _cWBP * sc;
                    const _sideXL = ox - _sideSvgWL;
                    rect(_sideXL, oy, _sideSvgWL, wg.h * sc, FILL_CL, STROKE_CL, 1.5);
                    dimH(_sideXL, ox, oy + dH + 20, `${_bpMm(_cWBP)}`);
                }
                // Right side panel
                if (_rwBP === 'right' || _rwBP === 'both') {
                    const _sideSvgWR = _cWRBP * sc;
                    const _sideXR = ox + dW;
                    rect(_sideXR, oy, _sideSvgWR, wg.h * sc, FILL_CL, STROKE_CL, 1.5);
                    dimH(_sideXR, _sideXR + _sideSvgWR, oy + dH + 20, `${_bpMm(_cWRBP)}`);
                }
                // Ceiling panel: spans from leftmost edge to rightmost edge
                {
                    const _leftExtra  = (_rwBP === 'left'  || _rwBP === 'both') ? _cWBP  * sc : 0;
                    const _rightExtra = (_rwBP === 'right' || _rwBP === 'both') ? _cWRBP * sc : 0;
                    const _ceilXBP    = ox - _leftExtra;
                    const _ceilWBP    = _leftExtra + dW + _rightExtra;
                    rect(_ceilXBP, oy - _ceilSvgHBP, _ceilWBP, _ceilSvgHBP, FILL_CL, STROKE_CL, 1.5);
                    dimV(_ceilXBP - 18, oy - _ceilSvgHBP, oy, `${_bpMm(_cCWBP)}`);
                }
            }
        }
        // Plinth height dim — only when at least one column has a visible plinth on the floor
        if (_hasFloorPlinthOld) {
            const plinthDimX = ox + dW + 18;
            dimV(plinthDimX, oy + dH - pH*sc, oy + dH, `${_bpMm(pH)}`);
        }
    });

    return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" viewBox="0 0 ${SVG_W} ${SVG_H}" style="display:block;max-width:100%;">${p.join('')}</svg>`;
};

// ==========================================
// _generateMultiViewBlueprintPages
// Returns array of { label, svg } — one per view (Top View + each wing front view)
// Each SVG is full-size (SVG_W × PAGE_H) showing only that one view.
// ==========================================
window._generateMultiViewBlueprintPages = function() {
    const pid = state.presetId;
    const centerWing = state.wings.center;
    const leftWing   = state.wings.left;
    const rightWing  = state.wings.right;

    // Use max(col.height) — the box top is at oy+dH - col.height*sc regardless of floorOffset
    const cH  = centerWing && centerWing.columns && centerWing.columns.length > 0
        ? Math.max(...centerWing.columns.map(c => c.height || state.globalHeight))
        : (centerWing ? (centerWing.globalHeight || state.globalHeight) : state.globalHeight);
    const cW  = centerWing ? (centerWing.width || state.width) : state.width;
    const cD  = centerWing ? (centerWing.depth || state.depth) : state.depth;
    const pH  = centerWing ? (centerWing.plinthHeight || state.plinthHeight) : state.plinthHeight;

    const hasRight = !!rightWing;
    const hasLeft  = !!leftWing;
    const rW   = hasRight ? (rightWing.width  || 160) : 0;
    const rD   = hasRight ? (rightWing.depth  || cD)  : 0;
    const rPos = hasRight ? (rightWing.wingPosition || 'side') : 'none';
    const lW   = hasLeft  ? (leftWing.width   || 160) : 0;
    const lD   = hasLeft  ? (leftWing.depth   || cD)  : 0;
    const lPos = hasLeft  ? (leftWing.wingPosition || 'side') : 'none';
    const fcSizeR = (hasRight && rPos === 'full_corner' && rightWing.fullCorner) ? (rightWing.fullCorner.size || 100) : 0;
    const fcSizeL = (hasLeft  && lPos === 'full_corner' && leftWing.fullCorner)  ? (leftWing.fullCorner.size || 100) : 0;

    const STROKE = '#1e3a5f', STROKE_THIN = '#94a3b8';
    const FILL_CAB    = '#e8f0fe'; // center: light blue
    const FILL_WING_L = '#d1fae5'; // left wing: light green
    const FILL_WING_R = '#fce7f3'; // right wing: light pink
    const FILL_FC_L   = '#fef3c7'; // left corner: light yellow
    const FILL_FC_R   = '#ede9fe'; // right corner: light purple
    const FILL_WING   = '#d1fae5'; // fallback
    const FILL_FC     = '#fef3c7'; // fallback
    const DIM_C = '#1e3a5f', ARROW = 5, FONT = 'Rubik,Tahoma,sans-serif';
    const MARGIN = 60, PAD = 80, LABEL_H = 30;
    const SVG_W = 1200;
    const PAGE_H = 800;  // height of each page SVG
    const presetLabel = pid === 'writing-desk' ? 'שולחן כתיבה' : pid === 'walkin' ? 'חדר ארונות' : (pid.startsWith('corner')) ? 'ארון פינתי' : pid === 'sliding' ? 'ארון הזזה' : 'ארון';

    // Shared SVG helpers — operate on a local array `p`
    const makeDefs = (p) => {
        p.push(`<defs>
          <marker id="ae" markerWidth="${ARROW}" markerHeight="${ARROW}" refX="${ARROW-1}" refY="${ARROW/2}" orient="auto"><path d="M0,0 L0,${ARROW} L${ARROW},${ARROW/2} z" fill="${DIM_C}"/></marker>
          <marker id="as" markerWidth="${ARROW}" markerHeight="${ARROW}" refX="1" refY="${ARROW/2}" orient="auto"><path d="M${ARROW},0 L${ARROW},${ARROW} L0,${ARROW/2} z" fill="${DIM_C}"/></marker>
        </defs>`);
    };
    const makeRect = (p, x,y,w,h,fill,stroke,sw=1.5) =>
        p.push(`<rect x="${(+x).toFixed(1)}" y="${(+y).toFixed(1)}" width="${(+w).toFixed(1)}" height="${(+h).toFixed(1)}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`);
    const makeShelfLine = (p, x1, sy, x2, sc, tCm, showLabel) => {
        const t = tCm != null ? tCm : (state.thickness || 1.7);
        const tPx = t * sc;
        if (tPx < 0.4) return;
        const halfT = tPx / 2;
        makeRect(p, x1, sy - halfT, x2 - x1, tPx, '#94a3b8', STROKE_THIN, 1);
        if (showLabel !== false && x2 - x1 > 16) p.push(`<text x="${((x1+x2)/2).toFixed(1)}" y="${(sy+3).toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="8" fill="${STROKE}" opacity="0.62">${_bpMm(t)}</text>`);
    };
    const makeVline = (p, x, y1, y2, sc, tCm, labelSide) => {
        const t = tCm != null ? tCm : (state.thickness || 1.7);
        const tPx = t * sc;
        if (tPx < 0.4 || y2 - y1 < 2) return;
        const halfT = tPx / 2;
        makeRect(p, x - halfT, y1, tPx, y2 - y1, '#94a3b8', STROKE_THIN, 1);
        if (y2 - y1 > 14) {
            const my = (y1 + y2) / 2;
            const side = labelSide || 'right';
            if (side === 'left') p.push(`<text x="${(x - halfT - 3).toFixed(1)}" y="${(my+3).toFixed(1)}" text-anchor="end" font-family="${FONT}" font-size="8" fill="${STROKE}" opacity="0.62">${_bpMm(t)}</text>`);
            else p.push(`<text x="${(x + halfT + 3).toFixed(1)}" y="${(my+3).toFixed(1)}" text-anchor="start" font-family="${FONT}" font-size="8" fill="${STROKE}" opacity="0.62">${_bpMm(t)}</text>`);
        }
    };
    let _bpDimBuf = [];
    let _bpCurrentViewKey = 'top';
    const _bpStartPage = (viewKey) => {
        _bpDimBuf = [];
        _bpCurrentViewKey = viewKey || 'center';
    };
    const _bpFlushDims = (p) => {
        if (!_bpDimBuf.length) return;
        p.push('<g class="bp-dim-front-layer">');
        for (let i = 0; i < _bpDimBuf.length; i++) p.push(_bpDimBuf[i]);
        p.push('</g>');
        _bpDimBuf = [];
    };
    const makeDimH = (p, x1, x2, y, lbl, above = true) => {
        const role = `h:${Math.round(+x1)},${Math.round(+x2)},${Math.round(+y)}`;
        const tf = _bpDimTransform(_bpCurrentViewKey, role);
        const tk = 8, lo = above ? -10 : 16;
        const mx = (+x1 + +x2) / 2;
        _bpDimBuf.push(
            `<g data-dim="h" data-dim-role="${role}" data-view-key="${_bpCurrentViewKey}" style="cursor:ns-resize" class="bp-dim-draggable"${tf}>` +
            `<line x1="${(+x1).toFixed(1)}" y1="${(y - tk / 2).toFixed(1)}" x2="${(+x1).toFixed(1)}" y2="${(y + tk / 2).toFixed(1)}" stroke="${DIM_C}" stroke-width="1.5"/>` +
            `<line x1="${(+x2).toFixed(1)}" y1="${(y - tk / 2).toFixed(1)}" x2="${(+x2).toFixed(1)}" y2="${(y + tk / 2).toFixed(1)}" stroke="${DIM_C}" stroke-width="1.5"/>` +
            `<line x1="${(+x1).toFixed(1)}" y1="${(+y).toFixed(1)}" x2="${(+x2).toFixed(1)}" y2="${(+y).toFixed(1)}" stroke="${DIM_C}" stroke-width="1.5" marker-start="url(#as)" marker-end="url(#ae)"/>` +
            `<text x="${mx.toFixed(1)}" y="${(y + lo).toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="${_BP_DIM_FONT}" font-weight="500" fill="${DIM_C}">${lbl}</text>` +
            `</g>`
        );
    };
    const makeDimV = (p, x, y1, y2, lbl) => {
        const role = `v:${Math.round(+x)},${Math.round(+y1)},${Math.round(+y2)}`;
        const tf = _bpDimTransform(_bpCurrentViewKey, role);
        const tk = 8;
        const my = (+y1 + +y2) / 2, tx = x + 18;
        _bpDimBuf.push(
            `<g data-dim="v" data-dim-role="${role}" data-view-key="${_bpCurrentViewKey}" style="cursor:ew-resize" class="bp-dim-draggable"${tf}>` +
            `<line x1="${(x - tk / 2).toFixed(1)}" y1="${(+y1).toFixed(1)}" x2="${(x + tk / 2).toFixed(1)}" y2="${(+y1).toFixed(1)}" stroke="${DIM_C}" stroke-width="1.5"/>` +
            `<line x1="${(x - tk / 2).toFixed(1)}" y1="${(+y2).toFixed(1)}" x2="${(x + tk / 2).toFixed(1)}" y2="${(+y2).toFixed(1)}" stroke="${DIM_C}" stroke-width="1.5"/>` +
            `<line x1="${(+x).toFixed(1)}" y1="${(+y1).toFixed(1)}" x2="${(+x).toFixed(1)}" y2="${(+y2).toFixed(1)}" stroke="${DIM_C}" stroke-width="1.5" marker-start="url(#as)" marker-end="url(#ae)"/>` +
            `<text x="${tx.toFixed(1)}" y="${(my + 4).toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="${_BP_DIM_FONT}" font-weight="500" fill="${DIM_C}" transform="rotate(-90,${tx.toFixed(1)},${my.toFixed(1)})">${lbl}</text>` +
            `</g>`
        );
    };
    const makeDimVLeft = (p, x, y1, y2, lbl) => {
        const role = `vl:${Math.round(+x)},${Math.round(+y1)},${Math.round(+y2)}`;
        const tf = _bpDimTransform(_bpCurrentViewKey, role);
        const tk = 8;
        const my = (+y1 + +y2) / 2, tx = x - 18;
        _bpDimBuf.push(
            `<g data-dim="v" data-dim-role="${role}" data-view-key="${_bpCurrentViewKey}" style="cursor:ew-resize" class="bp-dim-draggable"${tf}>` +
            `<line x1="${(x - tk / 2).toFixed(1)}" y1="${(+y1).toFixed(1)}" x2="${(x + tk / 2).toFixed(1)}" y2="${(+y1).toFixed(1)}" stroke="${DIM_C}" stroke-width="1.5"/>` +
            `<line x1="${(x - tk / 2).toFixed(1)}" y1="${(+y2).toFixed(1)}" x2="${(x + tk / 2).toFixed(1)}" y2="${(+y2).toFixed(1)}" stroke="${DIM_C}" stroke-width="1.5"/>` +
            `<line x1="${(+x).toFixed(1)}" y1="${(+y1).toFixed(1)}" x2="${(+x).toFixed(1)}" y2="${(+y2).toFixed(1)}" stroke="${DIM_C}" stroke-width="1.5" marker-start="url(#as)" marker-end="url(#ae)"/>` +
            `<text x="${tx.toFixed(1)}" y="${(my + 4).toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="${_BP_DIM_FONT}" font-weight="500" fill="${DIM_C}" transform="rotate(-90,${tx.toFixed(1)},${my.toFixed(1)})">${lbl}</text>` +
            `</g>`
        );
    };
    const wrapSVG = (p, label, pageNum, totalPages) => {
        const header = [
            `<rect width="${SVG_W}" height="${PAGE_H}" fill="white"/>`,
            `<text x="${SVG_W/2}" y="28" text-anchor="middle" font-family="${FONT}" font-size="22" font-weight="bold" fill="${STROKE}">שרטוט טכני — ${presetLabel}</text>`,
            `<text x="${SVG_W/2}" y="52" text-anchor="middle" font-family="${FONT}" font-size="16" fill="${STROKE}" opacity="0.7">${label}</text>`,
            `<text x="${SVG_W - MARGIN}" y="${PAGE_H - 12}" text-anchor="end" font-family="${FONT}" font-size="14" fill="${STROKE}" opacity="0.5">עמוד ${pageNum} / ${totalPages}</text>`,
        ];
        const defs = [];
        makeDefs(defs);
        return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" viewBox="0 0 ${SVG_W} ${PAGE_H}" style="display:block;">${defs.join('')}${header.join('')}${p.join('')}</svg>`;
    };

    const pages = []; // { label, svg }

    // ---- PAGE 0: TOP VIEW ----
    {
        const p = [];
        _bpStartPage('top');
        const drawAreaY = 65;
        const drawAreaH = PAGE_H - drawAreaY - MARGIN;
        const pw = SVG_W - MARGIN * 2;

        // Panel border
        p.push(`<rect x="${MARGIN}" y="${drawAreaY}" width="${pw}" height="${drawAreaH}" rx="4" fill="white" stroke="${STROKE_THIN}" stroke-width="1"/>`);

        // Compute world bounds in cm
        let minX = -cW/2, maxX = cW/2, minZ = 0, maxZ = cD;
        if (hasLeft) {
            if (lPos==='side')             { minX = Math.min(minX, -cW/2 - lD); maxZ = Math.max(maxZ, lW); }
            else if (lPos==='front')       { maxZ = Math.max(maxZ, cD + lW); }
            else if (lPos==='full_corner') { minX = Math.min(minX, -cW/2 - fcSizeL); maxZ = Math.max(maxZ, fcSizeL + lW); }
        }
        if (hasRight) {
            if (rPos==='side')             { maxX = Math.max(maxX, cW/2 + rD); maxZ = Math.max(maxZ, rW); }
            else if (rPos==='front')       { maxZ = Math.max(maxZ, cD + rW); }
            else if (rPos==='full_corner') { maxX = Math.max(maxX, cW/2 + fcSizeR); maxZ = Math.max(maxZ, fcSizeR + rW); }
        }
        // Corner unit (שידה/שולחן פינתית) protrudes forward from front face
        const hasCU = state.corner && state.corner.side !== 'none';
        const cuW_fp = hasCU ? (state.corner.width || 60) : 0;
        const cuD_fp = hasCU ? (state.corner.depth || cD) : 0;
        if (hasCU) maxZ = Math.max(maxZ, cD + cuW_fp);
        // Side cabinet (ארון צד הפוך) — extends in X direction
        const scFP2 = _bpCenterSideCabinet(centerWing);
        const hasSCFP2 = !!scFP2;
        const scWR2 = hasSCFP2 ? (scFP2.widthRight || scFP2.width || 40) : 0;
        const scWL2 = hasSCFP2 ? (scFP2.widthLeft || scFP2.width || 40) : 0;
        if (hasSCFP2) {
            const scSideFP2b = scFP2.side;
            if (scSideFP2b === 'right') maxX = Math.max(maxX, cW/2 + scWR2);
            else if (scSideFP2b === 'left') minX = Math.min(minX, -cW/2 - scWL2);
            else if (scSideFP2b === 'both') {
                maxX = Math.max(maxX, cW/2 + scWR2);
                minX = Math.min(minX, -cW/2 - scWL2);
            }
        }
        // Side desk (שולחן צד) — extends in X direction, depth = cD
        const deskFP2 = _bpCenterSideDesk(centerWing);
        const hasDeskFP2 = !!deskFP2;
        const deskFPW2 = hasDeskFP2 ? (deskFP2.width || 100) : 0;
        if (hasDeskFP2) {
            if (deskFP2.side === 'right') maxX = Math.max(maxX, cW/2 + deskFPW2);
            if (deskFP2.side === 'left')  minX = Math.min(minX, -cW/2 - deskFPW2);
        }
        const tW = maxX - minX, tD = maxZ - minZ;
        const sc = Math.min((pw - PAD*2) / Math.max(tW,1), (drawAreaH - PAD*2) / Math.max(tD,1));
        const ox = MARGIN + (pw - tW*sc)/2 - minX*sc;
        const oz = drawAreaY + (drawAreaH - tD*sc)/2;
        const wx = xc => ox + xc*sc;
        const wz = zc => oz + zc*sc;

        // Center cabinet / writing desk
        makeRect(p, wx(-cW/2), wz(0), cW*sc, cD*sc, FILL_CAB, STROKE, 2);
        if (pid === 'writing-desk') {
            const _wdTV = _bpCenterWritingDesk(centerWing);
            if (_wdTV) {
                const _legTCm = state.thickness || 1.7;
                const _legTW = _legTCm * sc;
                const _legTD = cD * sc;
                makeRect(p, wx(-cW/2), wz(0), _legTW, _legTD, '#cbd5e1', STROKE_THIN, 1);
                makeRect(p, wx(cW/2) - _legTW, wz(0), _legTW, _legTD, '#cbd5e1', STROKE_THIN, 1);
            }
            p.push(`<text x="${wx(0).toFixed(1)}" y="${(wz(cD)+13).toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="13" fill="${STROKE}" opacity="0.6">משטח</text>`);
        } else {
            p.push(`<text x="${wx(0).toFixed(1)}" y="${(wz(cD)+13).toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="13" fill="${STROKE}" opacity="0.6">חזית</text>`);
        }

        // ---- Bathroom sink — top view ----
        if (pid === 'bathroom' && centerWing) {
            const _bpCT = centerWing.countertopType || 'integral';
            const SINK_STROKE = '#1e3a5f';
            const SINK_FILL   = 'rgba(186,230,253,0.7)'; // light blue
            if (_bpCT === 'integral') {
                // Integral sink: center on sinkPanel column group (same as 3D engine)
                const _tvCols2 = centerWing.columns || [];
                let _tvSgLeftCm2 = 0, _tvSgWidthCm2 = 0, _tvSgFound2 = false, _tvAcc2 = 0;
                _tvCols2.forEach(col => {
                    const _cw = col.width || cW;
                    if (col.sinkPanel) {
                        if (!_tvSgFound2) { _tvSgLeftCm2 = _tvAcc2; _tvSgFound2 = true; }
                        _tvSgWidthCm2 += _cw;
                    }
                    _tvAcc2 += _cw;
                });
                const _tvSgCX2 = _tvSgFound2 ? (-cW/2 + _tvSgLeftCm2 + _tvSgWidthCm2 / 2) : 0;
                const _sinkW_cm = _tvSgFound2 ? (_tvSgWidthCm2 >= 100 ? 50 : 40) : Math.min(cW * 0.6, 55);
                const _sinkD_cm = Math.min(cD * 0.65, 38);
                const _sinkCZ = cD * 0.45;
                const _sinkX1 = wx(_tvSgCX2 - _sinkW_cm/2);
                const _sinkX2 = wx(_tvSgCX2 + _sinkW_cm/2);
                const _sinkZ1 = wz(_sinkCZ - _sinkD_cm/2);
                const _sinkZ2 = wz(_sinkCZ + _sinkD_cm/2);
                const _sinkW  = _sinkX2 - _sinkX1;
                const _sinkH  = _sinkZ2 - _sinkZ1;
                p.push(`<rect x="${_sinkX1.toFixed(1)}" y="${_sinkZ1.toFixed(1)}" width="${_sinkW.toFixed(1)}" height="${_sinkH.toFixed(1)}" rx="${Math.min(_sinkW,_sinkH)*0.18}" fill="${SINK_FILL}" stroke="${SINK_STROKE}" stroke-width="1.5"/>`);
                p.push(`<text x="${((_sinkX1+_sinkX2)/2).toFixed(1)}" y="${((_sinkZ1+_sinkZ2)/2+4).toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="11" fill="${SINK_STROKE}" opacity="0.8">כיור</text>`);
            } else {
                // Vessel sink: rectangle centered on full slab, with offset
                const _bpVW = Math.min(cW * 0.35, 50); // VESSEL_W
                const _bpVD = Math.min(cD * 0.6, 35);  // VESSEL_D
                const _bpOffX = (centerWing.vesselSinkOffsetX) || 0;
                const _bpVCX  = _bpOffX; // center X in cm (relative to cabinet center)
                const _bpVCZ  = cD * 0.4; // slightly toward back (vesselCenterZ ≈ -bodyD*0.1 from front face center)
                const _vSvgX  = wx(_bpVCX - _bpVW/2);
                const _vSvgZ  = wz(_bpVCZ - _bpVD/2);
                const _vSvgW  = _bpVW * sc;
                const _vSvgH  = _bpVD * sc;
                p.push(`<rect x="${_vSvgX.toFixed(1)}" y="${_vSvgZ.toFixed(1)}" width="${_vSvgW.toFixed(1)}" height="${_vSvgH.toFixed(1)}" rx="${Math.min(_vSvgW,_vSvgH)*0.15}" fill="${SINK_FILL}" stroke="${SINK_STROKE}" stroke-width="1.5"/>`);
                p.push(`<text x="${(_vSvgX+_vSvgW/2).toFixed(1)}" y="${(_vSvgZ+_vSvgH/2+4).toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="11" fill="${SINK_STROKE}" opacity="0.8">כיור</text>`);
            }
        }

        // Wings — use per-side colors
        if (hasLeft) {
            if (lPos==='side') {
                makeRect(p, wx(-cW/2 - lD), wz(0), lD*sc, lW*sc, FILL_WING_L, STROKE);
                p.push(`<text x="${wx(-cW/2 - lD/2).toFixed(1)}" y="${(wz(lW/2)+4).toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="12" fill="${STROKE}" opacity="0.7">${Math.round(lD)}</text>`);
            } else if (lPos==='front') {
                // Inner corner: wing flush with left end of center, protruding forward from front face
                makeRect(p, wx(-cW/2), wz(cD), lD*sc, lW*sc, FILL_WING_L, STROKE);
                p.push(`<text x="${wx(-cW/2 + lD/2).toFixed(1)}" y="${(wz(cD + lW/2)+4).toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="12" fill="${STROKE}" opacity="0.7">${Math.round(lD)}</text>`);
            } else if (lPos==='full_corner') {
                const x1 = wx(-cW/2), y1 = wz(0);
                const x2 = wx(-cW/2 - fcSizeL), y2 = wz(0);
                const x3 = wx(-cW/2 - fcSizeL), y3 = wz(fcSizeL);
                const x4 = wx(-cW/2 - fcSizeL + lD), y4 = wz(fcSizeL);
                const x5 = wx(-cW/2 - fcSizeL + lD), y5 = wz(cD);
                const x6 = wx(-cW/2), y6 = wz(cD);
                p.push(`<polygon points="${x1.toFixed(1)},${y1.toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)} ${x3.toFixed(1)},${y3.toFixed(1)} ${x4.toFixed(1)},${y4.toFixed(1)} ${x5.toFixed(1)},${y5.toFixed(1)} ${x6.toFixed(1)},${y6.toFixed(1)}" fill="${FILL_FC_L}" stroke="${STROKE}" stroke-width="1.5"/>`);
                if (lW > 0) makeRect(p, wx(-cW/2 - fcSizeL), wz(fcSizeL), lD*sc, lW*sc, FILL_WING_L, STROKE);
            }
        }
        if (hasRight) {
            if (rPos==='side') {
                makeRect(p, wx(cW/2), wz(0), rD*sc, rW*sc, FILL_WING_R, STROKE);
                p.push(`<text x="${wx(cW/2 + rD/2).toFixed(1)}" y="${(wz(rW/2)+4).toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="12" fill="${STROKE}" opacity="0.7">${Math.round(rD)}</text>`);
            } else if (rPos==='front') {
                // Inner corner: wing flush with right end of center, protruding forward from front face
                makeRect(p, wx(cW/2 - rD), wz(cD), rD*sc, rW*sc, FILL_WING_R, STROKE);
                p.push(`<text x="${wx(cW/2 - rD/2).toFixed(1)}" y="${(wz(cD + rW/2)+4).toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="12" fill="${STROKE}" opacity="0.7">${Math.round(rD)}</text>`);
            } else if (rPos==='full_corner') {
                const x1 = wx(cW/2), y1 = wz(0);
                const x2 = wx(cW/2 + fcSizeR), y2 = wz(0);
                const x3 = wx(cW/2 + fcSizeR), y3 = wz(fcSizeR);
                const x4 = wx(cW/2 + fcSizeR - rD), y4 = wz(fcSizeR);
                const x5 = wx(cW/2 + fcSizeR - rD), y5 = wz(cD);
                const x6 = wx(cW/2), y6 = wz(cD);
                p.push(`<polygon points="${x1.toFixed(1)},${y1.toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)} ${x3.toFixed(1)},${y3.toFixed(1)} ${x4.toFixed(1)},${y4.toFixed(1)} ${x5.toFixed(1)},${y5.toFixed(1)} ${x6.toFixed(1)},${y6.toFixed(1)}" fill="${FILL_FC_R}" stroke="${STROKE}" stroke-width="1.5"/>`);
                if (rW > 0) makeRect(p, wx(cW/2 + fcSizeR - rD), wz(fcSizeR), rD*sc, rW*sc, FILL_WING_R, STROKE);
            }
        }

        // Side cabinet (ארון צד הפוך) — rectangle flush against main cabinet side
        if (hasSCFP2) {
            const FILL_SC2 = '#e0f2fe'; // light blue for side cabinet
            const scSideFP2c = scFP2.side;
            const _drawSCFP2 = (onRight) => {
                const scWcm2 = onRight ? scWR2 : scWL2;
                const scX1_2 = onRight ? cW/2 : -cW/2 - scWcm2;
                const scX2_2 = onRight ? cW/2 + scWcm2 : -cW/2;
                makeRect(p, wx(scX1_2), wz(0), scWcm2*sc, cD*sc, FILL_SC2, STROKE, 1.5);
                p.push(`<text x="${wx((scX1_2+scX2_2)/2).toFixed(1)}" y="${(wz(cD/2)+4).toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="12" fill="${STROKE}" opacity="0.8">ארון צד</text>`);
                makeDimH(p, wx(scX1_2), wx(scX2_2), wz(cD) + 14, `${_bpMm(scWcm2)}`);
            };
            if (scSideFP2c === 'right' || scSideFP2c === 'both') _drawSCFP2(true);
            if (scSideFP2c === 'left'  || scSideFP2c === 'both') _drawSCFP2(false);
        }

        // Side desk (שולחן צד) — top view: rectangle on the side of the cabinet
        if (hasDeskFP2) {
            const FILL_DESK_FP2 = '#fed7aa'; // light orange for side desk
            const deskOnRight2 = deskFP2.side === 'right';
            const deskX1_2 = deskOnRight2 ? cW/2 : -cW/2 - deskFPW2;
            const deskX2_2 = deskOnRight2 ? cW/2 + deskFPW2 : -cW/2;
            makeRect(p, wx(deskX1_2), wz(0), deskFPW2*sc, cD*sc, FILL_DESK_FP2, STROKE, 1.5);
            p.push(`<text x="${wx((deskX1_2+deskX2_2)/2).toFixed(1)}" y="${(wz(cD/2)+4).toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="12" fill="${STROKE}" opacity="0.85">שולחן צד</text>`);
            makeDimH(p, wx(deskX1_2), wx(deskX2_2), wz(cD) + 24, `${_bpMm(deskFPW2)}`);
        }

        // Corner unit (שידה/שולחן פינתית) — protrudes forward from front face
        if (hasCU) {
            const cuSide = state.corner.side; // 'right' or 'left'
            const cuX1 = cuSide === 'right' ? cW/2 - cuD_fp : -cW/2;
            const cuX2 = cuSide === 'right' ? cW/2 : -cW/2 + cuD_fp;
            const FILL_CU = '#fef9c3'; // light yellow for corner unit
            makeRect(p, wx(cuX1), wz(cD), (cuX2 - cuX1)*sc, cuW_fp*sc, FILL_CU, STROKE, 1.5);
            // Label
            const cuLabel = state.corner.type === 'desk' ? 'שולחן פינתי' : 'שידה פינתית';
            p.push(`<text x="${wx((cuX1+cuX2)/2).toFixed(1)}" y="${(wz(cD + cuW_fp/2)+4).toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="13" fill="${STROKE}" opacity="0.8">${cuLabel}</text>`);
            // Dimensions: width (horizontal, below the unit) and depth (vertical, on the outer side)
            makeDimH(p, wx(cuX1), wx(cuX2), wz(cD + cuW_fp) + 14, `${_bpMm(cuD_fp)}`);
            if (cuSide === 'right') {
                makeDimV(p, wx(cuX2) + 14, wz(cD), wz(cD + cuW_fp), `${_bpMm(cuW_fp)}`);
            } else {
                makeDimVLeft(p, wx(cuX1) - 14, wz(cD), wz(cD + cuW_fp), `${_bpMm(cuW_fp)}`);
            }
        }

        // Dimension lines
        // Total width at TOP — above all other horizontal dims (above 100/311 lines at wz(0)-14)
        const dimRowTop = wz(0) - 28;
        makeDimH(p, wx(minX), wx(maxX), dimRowTop, `${_bpMm(tW)}`);
        // Center cabinet width: just above the cabinet top edge
        if (hasLeft || hasRight) makeDimH(p, wx(-cW/2), wx(cW/2), wz(0) - 14, `${_bpMm(cW)}`);

        const hasRightFC = hasRight && rPos === 'full_corner';
        const hasLeftFC  = hasLeft  && lPos === 'full_corner';

        // Total depth lines — side-aware:
        // Both corners (U/walk-in): left depth on LEFT, right depth on RIGHT
        // Only left corner: total depth on RIGHT
        // Only right corner or no corner: total depth on LEFT
        if (hasLeftFC && hasRightFC) {
            const leftTotalD = fcSizeL + lW;
            const rightTotalD = fcSizeR + rW;
            makeDimVLeft(p, wx(minX) - 54, wz(0), wz(leftTotalD), `${_bpMm(leftTotalD)}`);
            makeDimV(p, wx(maxX) + 74, wz(0), wz(rightTotalD), `${_bpMm(rightTotalD)}`);
        } else if (hasLeftFC && !hasRightFC) {
            makeDimV(p, wx(maxX) + 74, wz(minZ), wz(maxZ), `${_bpMm(tD)}`);
        } else {
            makeDimVLeft(p, wx(minX) - 54, wz(minZ), wz(maxZ), `${_bpMm(tD)}`);
        }

        // Center cabinet depth — only show if shorter than total depth (not in U-shape)
        if (cD < tD && !(hasLeftFC && hasRightFC)) {
            if (hasRightFC) {
                makeDimVLeft(p, wx(-cW/2) - 14, wz(0), wz(cD), `${_bpMm(cD)}`);
            } else {
                makeDimVLeft(p, wx(cW/2) + 34, wz(0), wz(cD), `${_bpMm(cD)}`);
            }
        }

        // Right wing depth (side position) — label on LEFT side of the right wing
        if (hasRight && rPos === 'side') makeDimVLeft(p, wx(cW/2) - 14, wz(0), wz(rW), `${_bpMm(rW)}`);
        if (hasLeft && lPos === 'side') makeDimVLeft(p, wx(-cW/2 - lD) - 14, wz(0), wz(lW), `${_bpMm(lW)}`);
        // Front (פנימי) wings — protrusion beyond center front face
        if (hasRight && rPos === 'front') {
            makeDimV(p, wx(cW/2) + 14, wz(cD), wz(cD + rW), `${_bpMm(rW)}`);
            makeDimH(p, wx(cW/2 - rD), wx(cW/2), wz(cD + rW) + 14, `${_bpMm(rD)}`);
        }
        if (hasLeft && lPos === 'front') {
            makeDimVLeft(p, wx(-cW/2) - 14, wz(cD), wz(cD + lW), `${_bpMm(lW)}`);
            makeDimH(p, wx(-cW/2), wx(-cW/2 + lD), wz(cD + lW) + 14, `${_bpMm(lD)}`);
        }

        // full_corner dims
        if (hasRightFC) {
            makeDimH(p, wx(cW/2), wx(cW/2 + fcSizeR), wz(0) - 14, `${_bpMm(fcSizeR)}`);
            // Corner depth + wing width on RIGHT side — use +54 to match total depth line spacing
            makeDimV(p, wx(cW/2 + fcSizeR) + 54, wz(0), wz(fcSizeR), `${_bpMm(fcSizeR)}`);
            if (rW > 0) makeDimV(p, wx(cW/2 + fcSizeR) + 54, wz(fcSizeR), wz(fcSizeR + rW), `${_bpMm(rW)}`);
            if (rW > 0) makeDimH(p, wx(cW/2 + fcSizeR - rD), wx(cW/2 + fcSizeR), wz(fcSizeR + rW) + 28, `${_bpMm(rD)}`);
        }
        if (hasLeftFC) {
            makeDimH(p, wx(-cW/2 - fcSizeL), wx(-cW/2), wz(0) - 14, `${_bpMm(fcSizeL)}`);
            makeDimVLeft(p, wx(-cW/2 - fcSizeL) - 14, wz(0), wz(fcSizeL), `${_bpMm(fcSizeL)}`);
            if (lW > 0) makeDimVLeft(p, wx(-cW/2 - fcSizeL) - 14, wz(fcSizeL), wz(fcSizeL + lW), `${_bpMm(lW)}`);
            if (lW > 0) makeDimH(p, wx(-cW/2 - fcSizeL), wx(-cW/2 - fcSizeL + lD), wz(fcSizeL + lW) + 28, `${_bpMm(lD)}`);
        }

        _bpFlushDims(p);
        pages.push({ label: 'מבט עליון — תוכנית רצפה', svgParts: p, viewKey: 'top' });
    }

    // ---- PAGES 1..N: Per-wing front views ----
    // full_corner wings have no columns — they get their own diagonal-face page below
    // Additional wings attached to full_corner corners also get their own front-view page
    // Helper: total drawing height = max(col.height) across all columns
    // The box top is at oy+dH - col.height*sc (since top = oy+dH - fo*sc - visibleH*sc = oy+dH - h*sc)
    const _wingMaxH = (wd, fallback) => wd && wd.columns && wd.columns.length > 0
        ? Math.max(...wd.columns.map(c => c.height || fallback))
        : (wd ? (wd.globalHeight || fallback) : fallback);

    const wingList = [];
    if (hasLeft  && lPos !== 'full_corner') wingList.push({ wd: leftWing,   label: 'שרטוט חזית — כנף שמאל',   fill: FILL_WING_L, w: lW, h: _wingMaxH(leftWing,  cH), d: lD });
    wingList.push(                                        { wd: centerWing,  label: 'שרטוט חזית — ארון מרכזי', fill: FILL_CAB,    w: cW, h: _wingMaxH(centerWing, cH), d: cD });
    if (hasRight && rPos !== 'full_corner') wingList.push({ wd: rightWing,   label: 'שרטוט חזית — כנף ימין',   fill: FILL_WING_R, w: rW, h: _wingMaxH(rightWing, cH), d: rD });

    wingList.forEach((wg) => {
        const _bpViewKey = wg.wd === leftWing ? 'left' : wg.wd === rightWing ? 'right' : 'center';
        const p = [];
        _bpStartPage(_bpViewKey);
        const drawAreaY = 65;
        const drawAreaH = PAGE_H - drawAreaY - MARGIN - 80; // reserve 80px at bottom for dim labels
        const pw = SVG_W - MARGIN * 2;

        const _isCenterWg2 = wg.wd === centerWing;
        const _horizExtra2 = _isCenterWg2 ? _bpCenterHorizExtra(centerWing) : { left: 0, right: 0 };
        const _layoutW2 = wg.w + _horizExtra2.left + _horizExtra2.right;
        const sc = Math.min((pw - PAD*2) / Math.max(_layoutW2, 1), (drawAreaH - PAD*2) / Math.max(wg.h, 1));
        const dW = wg.w * sc, dH = wg.h * sc;
        const ox = MARGIN + (pw - _layoutW2 * sc) / 2 + _horizExtra2.left * sc;
        const oy = drawAreaY + (drawAreaH - dH) / 2;

        // Cabinet body — draw as individual column rects so shorter columns show correctly
        const cols = (wg.wd && wg.wd.columns) ? wg.wd.columns : (state.columns || []);

        // First pass: draw per-column body rects (each at its actual height, respecting floorOffset)
        // floorOffset = how much is cut from the BOTTOM; visibleH = height - floorOffset; box raised by floorOffset
        {
            let _cx = ox;
            cols.forEach((col, ci) => {
                const isLastCol = (ci === cols.length - 1);
                const _cw = isLastCol ? (ox + dW - _cx) : (col.width || wg.w) * sc;
                const _fo = col.floorOffset || 0;
                const _visibleH = (col.height || wg.h) - _fo;
                const _colSvgH = _visibleH * sc;
                // box is raised by floorOffset: bottom = oy+dH - fo*sc, top = bottom - visibleH*sc
                const _colBotY2 = oy + dH - _fo * sc;
                const _colTopY2 = _colBotY2 - _colSvgH;
                makeRect(p, _cx, _colTopY2, _cw, _colSvgH, wg.fill, STROKE, 2);
                _cx += _cw;
            });
        }
        // Plinth — draw per-column segment only for columns that sit on the floor (floorOffset === 0)
        // Desk columns (col.type === 'desk') are open below — no plinth
        if (pH > 0) {
            let _px = ox;
            cols.forEach((col, ci) => {
                const isLastCol = (ci === cols.length - 1);
                const _pw = isLastCol ? (ox + dW - _px) : (col.width || wg.w) * sc;
                if (!(col.floorOffset > 0) && !col.noPlinth && col.type !== 'desk') {
                    makeRect(p, _px, oy + dH - pH*sc, _pw, pH*sc, '#cbd5e1', STROKE, 1);
                }
                _px += _pw;
            });
        }

        // ---- Bathroom countertop slab + sink — front view ----
        if (pid === 'bathroom' && wg.wd === centerWing) {
            const _bpCT2 = centerWing.countertopType || 'integral';
            const _bpSlabT = _bpCT2 === 'butcher26' ? 2.6 : _bpCT2 === 'butcher40' ? 4.0 : _bpCT2 === 'corian12' ? 1.2 : 2.0; // integral=2cm
            const _bpSlabSvgH = _bpSlabT * sc;
            // Slab sits on top of cabinet body — top of body = oy (since dH = wg.h * sc and body top = oy+dH - wg.h*sc = oy)
            // But columns may have different heights; use the max column top
            const _bpBodyTopY = cols.length > 0 ? Math.min(...cols.map(c => {
                const _fo = c.floorOffset || 0;
                return oy + dH - (c.height || wg.h) * sc;
            })) : oy;
            const _bpSlabTopY = _bpBodyTopY - _bpSlabSvgH;
            const SLAB_FILL   = _bpCT2.startsWith('butcher') ? '#d4a96a' : '#f0f0f0';
            const SLAB_STROKE = '#1e3a5f';
            // Draw slab spanning full cabinet width
            p.push(`<rect x="${ox.toFixed(1)}" y="${_bpSlabTopY.toFixed(1)}" width="${dW.toFixed(1)}" height="${_bpSlabSvgH.toFixed(1)}" fill="${SLAB_FILL}" stroke="${SLAB_STROKE}" stroke-width="1.5"/>`);

            // Draw sink symbol
            if (_bpCT2 === 'integral') {
                // Integral sink: center on the sinkPanel column group (same as 3D engine)
                let _sgLeftCm = 0, _sgWidthCm = 0, _sgFound = false;
                let _cxAcc = 0;
                cols.forEach((col, ci) => {
                    const _cw = col.width || wg.w;
                    if (col.sinkPanel) {
                        if (!_sgFound) { _sgLeftCm = _cxAcc; _sgFound = true; }
                        _sgWidthCm += _cw;
                    }
                    _cxAcc += _cw;
                });
                const _iSinkW_cm = _sgFound ? (_sgWidthCm >= 100 ? 50 : 40) : Math.min(cW * 0.6, 55);
                const _iSinkD_cm = 12;
                const _iSinkW = _iSinkW_cm * sc;
                const _iSinkH = _iSinkD_cm * sc;
                const _sgCenterSvgX = _sgFound ? (ox + (_sgLeftCm + _sgWidthCm / 2) * sc) : (ox + dW / 2);
                const _iSinkX = _sgCenterSvgX - _iSinkW / 2;
                const _iSinkY = _bpBodyTopY;
                p.push(`<rect x="${_iSinkX.toFixed(1)}" y="${_iSinkY.toFixed(1)}" width="${_iSinkW.toFixed(1)}" height="${_iSinkH.toFixed(1)}" rx="${Math.min(_iSinkW,_iSinkH)*0.12}" fill="rgba(186,230,253,0.7)" stroke="${SLAB_STROKE}" stroke-width="1"/>`);
                p.push(`<text x="${(_iSinkX+_iSinkW/2).toFixed(1)}" y="${(_iSinkY+_iSinkH/2+4).toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="11" fill="${SLAB_STROKE}" opacity="0.8">כיור</text>`);
            } else {
                // Vessel sink: rectangle sits ON TOP of the slab (above it)
                const VESSEL_H_BP = 15;
                const _bpVW2 = Math.min(cW * 0.35, 50);
                const _bpOffX2 = (centerWing.vesselSinkOffsetX) || 0;
                const _vFVCX = ox + dW/2 + _bpOffX2 * sc;
                const _vFVW  = _bpVW2 * sc;
                const _vFVH  = VESSEL_H_BP * sc;
                const _vFVX  = _vFVCX - _vFVW / 2;
                const _vFVY  = _bpSlabTopY - _vFVH; // vessel sits ABOVE the slab top
                p.push(`<rect x="${_vFVX.toFixed(1)}" y="${_vFVY.toFixed(1)}" width="${_vFVW.toFixed(1)}" height="${_vFVH.toFixed(1)}" rx="${Math.min(_vFVW,_vFVH)*0.12}" fill="rgba(186,230,253,0.7)" stroke="${SLAB_STROKE}" stroke-width="1.5"/>`);
                p.push(`<text x="${(_vFVX+_vFVW/2).toFixed(1)}" y="${(_vFVY+_vFVH/2+4).toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="11" fill="${SLAB_STROKE}" opacity="0.8">כיור</text>`);
            }
        }

        // Side desk + side cabinet on center front view
        if (_isCenterWg2) {
            const _deskFP2 = _bpCenterSideDesk(centerWing);
            if (_deskFP2) {
                _bpDrawSideDeskFrontParts(p, _deskFP2, ox, oy, dW, dH, sc, wg.fill, STROKE, STROKE_THIN, FONT, (x1, x2, y, lbl) => makeDimH(p, x1, x2, y, lbl), (x, y1, y2, lbl) => makeDimV(p, x, y1, y2, lbl), (x, y1, y2, lbl) => makeDimVLeft(p, x, y1, y2, lbl));
            }
            const _scFP2 = _bpCenterSideCabinet(centerWing);
            if (_scFP2) {
                _bpDrawSideCabinetFrontParts(p, _scFP2, ox, oy, dW, dH, sc, wg.h, pH, (x, y, w, h, f, s, sw) => makeRect(p, x, y, w, h, f, s, sw), (x1, x2, y, lbl) => makeDimH(p, x1, x2, y, lbl), STROKE, FONT);
            }
        }

        // Columns, shelves, hangers & drawers
        const colXPositions = [];
        _bpHoneycombSepBegin();
        let colX = ox;
        cols.forEach((col, ci) => {
            const isLastCol = (ci === cols.length - 1);
            const colW = isLastCol ? (ox + dW - colX) : (col.width || wg.w) * sc;
            // Desk columns are open below (no plinth) — treat colPlinthH as 0
            const colPlinthH = (col.noPlinth || col.type === 'desk') ? 0 : pH;
            const _fo2 = col.floorOffset || 0;
            const _colActualH2 = col.height || wg.h;
            const _visibleH2 = _colActualH2 - _fo2; // visible height after bottom cut
            // box is raised by floorOffset: bottom = oy+dH - fo*sc, top = bottom - visibleH*sc
            const _colBotSvgY  = oy + dH - _fo2 * sc;
            const _colTopSvgY  = _colBotSvgY - _visibleH2 * sc;
            colXPositions.push({ x1: colX, x2: colX + colW, wCm: (col.width != null ? col.width : wg.w), colTopY: _colTopSvgY, colBotY: _colBotSvgY });

            // Column separator: spans between the overlapping vertical extents of adjacent columns
            if (ci > 0) {
                const prevCol = cols[ci - 1];
                const prevFO2  = prevCol ? (prevCol.floorOffset || 0) : 0;
                const prevH2   = (prevCol && prevCol.height) ? prevCol.height : wg.h;
                const prevVisibleH2 = prevH2 - prevFO2;
                const prevBotY2 = oy + dH - prevFO2 * sc;
                const prevTopY2 = prevBotY2 - prevVisibleH2 * sc;
                const sepTopY = Math.min(_colTopSvgY, prevTopY2);
                const sepBotY = Math.max(_colBotSvgY, prevBotY2);
                const _sepHoles2 = _bpOpenCellSepHolesSvg(prevCol, col, wg, pH, oy, dH, sc);
                _bpVlineWithHoles((x, y1, y2) => makeVline(p, x, y1, y2, sc), colX, sepTopY, sepBotY, _sepHoles2);
            }

            const shelvesArr = (col.shelvesY || []).slice().sort((a,b) => a-b);
            const deskBase = (col.type === 'desk') ? (col.deskHeight || 80) + (col.deskClearance || 80) : _bpRowBaseCm(col, colPlinthH);
            const adjShelvesArr2 = shelvesArr.map(sy => sy - _fo2).filter(sy => sy > 0 && sy < _visibleH2);
            const _splitYAdj = (col.splitY || 0) > 0 ? (col.splitY - _fo2) : 0;
            const _splitT3 = (state.thickness || 1.7) * 2;
            const _splitTopAdj = _splitYAdj > 0 ? _splitYAdj + _splitT3 : 0;
            let _allBounds = [...adjShelvesArr2];
            if (_splitYAdj > deskBase && _splitYAdj < _visibleH2) {
                if (!_allBounds.includes(_splitYAdj)) _allBounds.push(_splitYAdj);
                if (_splitTopAdj < _visibleH2 && !_allBounds.includes(_splitTopAdj)) _allBounds.push(_splitTopAdj);
                _allBounds.sort((a,b) => a-b);
            }
            const rowBounds = [deskBase, ..._allBounds.filter(sy => sy > deskBase), _visibleH2];
            const numRows = rowBounds.length - 1;
            const _hcBlocks = _bpHoneycombBlocksFromCompartments(col.compartments, numRows);

            // Shelf lines — skip internal honeycomb shelves (drawn with block geometry)
            const _splitY2 = col.splitY || 0;
            const _splitT2 = (state.thickness || 1.7) * 2;
            (col.shelvesY || []).forEach(sy => {
                const syAdj = sy - _fo2;
                if (_splitY2 > 0 && syAdj >= _splitY2 && syAdj <= _splitY2 + _splitT2) return;
                if (_bpIsHoneycombInternalShelf(_hcBlocks, rowBounds, syAdj)) return;
                if (syAdj > 0 && syAdj < _visibleH2) makeShelfLine(p, colX, _colBotSvgY - syAdj*sc, colX + colW, sc);
            });
            // Structural top + bottom boards (17mm) — already in cell math, now visible
            _bpDrawTopBottomBoards(
                function(x1, sy, x2) { makeShelfLine(p, x1, sy, x2, sc); },
                col, colX, colW, _colBotSvgY, _visibleH2, colPlinthH, sc
            );

            // Split band (ארון עליון / ארון תחתון divider) — double board drawn as filled rect
            if (_splitY2 > 0 && _splitY2 > _fo2 && _splitY2 < _colActualH2) {
                const splitAdjY = _splitY2 - _fo2;
                const splitBandBotY = _colBotSvgY - splitAdjY * sc;
                const splitBandH    = _splitT2 * sc;
                const splitBandTopY = splitBandBotY - splitBandH;
                // Draw the double-board band as a filled rectangle
                _bpDrawSplitDoubleBand(function(x, y, w, h, f, s, sw) { makeRect(p, x, y, w, h, f, s, sw); }, colX, splitBandTopY, colW, splitBandH, STROKE);
                // Labels: "ארון תחתון" below split, "ארון עליון" above split (only on first column)
                if (ci === 0) {
                    const lowerMidY = (_colBotSvgY + splitBandBotY) / 2;
                    const upperMidY = (_colTopSvgY + splitBandTopY) / 2;
                    p.push(`<text x="${(colX + 6).toFixed(1)}" y="${(lowerMidY + 4).toFixed(1)}" font-family="${FONT}" font-size="11" fill="${STROKE}" opacity="0.5">ארון תחתון</text>`);
                    p.push(`<text x="${(colX + 6).toFixed(1)}" y="${(upperMidY + 4).toFixed(1)}" font-family="${FONT}" font-size="11" fill="${STROKE}" opacity="0.5">ארון עליון</text>`);
                    p.push(`<text x="${(colX + colW / 2).toFixed(1)}" y="${(splitBandTopY + splitBandH / 2 + 3).toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="8" fill="${STROKE}" opacity="0.62">${_bpMm(_splitT2)}</text>`);
                }
            }

            // Internal desk column rendering
            if (col.type === 'desk') {
                const deskH   = col.deskHeight   || 80;
                const deskClr = col.deskClearance || 80;
                // Open area below desk surface: white fill
                const openTop = _colBotSvgY - deskH * sc;
                const openBot = _colBotSvgY - colPlinthH * sc;
                makeRect(p, colX, openTop, colW, openBot - openTop, 'white', STROKE_THIN, 0.5);
                // Desk surface line
                p.push(`<line x1="${colX.toFixed(1)}" y1="${openTop.toFixed(1)}" x2="${(colX+colW).toFixed(1)}" y2="${openTop.toFixed(1)}" stroke="${STROKE}" stroke-width="1.5"/>`);
                const deskSurfPx = DESK_SURFACE_T * sc;
                // Drawers below desk surface
                if (col.hasDrawers) {
                    const drawerH = col.drawerHeight || 12;
                    const numDrawers = col.deskDrawerCount != null ? col.deskDrawerCount : ((col.width || wg.w) <= 80 ? 1 : 2);
                    const drawerW = colW / numDrawers;
                    const drawerPxH = drawerH * sc;
                    const drawerY = openTop + deskSurfPx;
                    for (let di = 0; di < numDrawers; di++) {
                        const dx = colX + di * drawerW;
                        makeRect(p, dx + 2, drawerY, drawerW - 4, drawerPxH - 2, 'rgba(255,255,255,0.7)', STROKE_THIN, 0.8);
                        const hndW = Math.min(drawerW * 0.4, 20);
                        const hndX = dx + (drawerW - hndW) / 2;
                        const hndY = drawerY + drawerPxH * 0.5;
                        p.push(`<line x1="${hndX.toFixed(1)}" y1="${hndY.toFixed(1)}" x2="${(hndX+hndW).toFixed(1)}" y2="${hndY.toFixed(1)}" stroke="${STROKE}" stroke-width="1.8"/>`);
                    }
                    // Dimension: drawer height (right side of column)
                    makeDimV(p, colX + colW + 14, drawerY, drawerY + drawerPxH, `${_bpMm(drawerH)}`);
                    // Dimension: floor to drawer bottom (gap from floor to bottom of drawer)
                    makeDimV(p, colX + colW + 50, drawerY + drawerPxH, _colBotSvgY, `${_bpMm((deskH - DESK_SURFACE_T - drawerH))}`);
                }
                // Clearance board (shelf above clearance zone)
                const clrBoardY = _colBotSvgY - (deskH + deskClr) * sc;
                makeShelfLine(p, colX, clrBoardY, colX + colW, sc);
                // Label inside open area
                const lblY = openTop + (openBot - openTop) / 2 + 4;
                p.push(`<text x="${(colX+colW/2).toFixed(1)}" y="${lblY.toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="12" fill="${STROKE}" opacity="0.5">שולחן</text>`);
            }

            const _t_shelf2 = state.thickness || 1.7;
            for (let ri = 0; ri < numRows; ri++) {
                const rowBotCm = rowBounds[ri];
                const rowTopCm = rowBounds[ri + 1];
                const cellHeightLabel = _bpClearCellHeightLabel(rowBotCm, rowTopCm, _t_shelf2);
                const cellY1 = _colBotSvgY - rowTopCm * sc;
                const cellY2 = _colBotSvgY - rowBotCm * sc;
                const cellH = cellY2 - cellY1;
                const cellCX = colX + colW / 2;

                const comp = col.compartments ? col.compartments[ri] : null;
                const cellType = comp ? (comp.type || 'empty') : 'empty';

                if (cellType === 'hanging') {
                    // Hanger symbol: horizontal hanging rod near top of cell (no vertical rod)
                    const rodY   = _bpHangRodSvgY(cellY1, sc);
                    const hRodX1 = colX + 4;
                    const hRodX2 = colX + colW - 4;
                    p.push(`<line x1="${hRodX1.toFixed(1)}" y1="${rodY.toFixed(1)}" x2="${hRodX2.toFixed(1)}" y2="${rodY.toFixed(1)}" stroke="${STROKE}" stroke-width="2"/>`);
                    p.push(`<circle cx="${hRodX1.toFixed(1)}" cy="${rodY.toFixed(1)}" r="2" fill="${STROKE}"/>`);
                    p.push(`<circle cx="${hRodX2.toFixed(1)}" cy="${rodY.toFixed(1)}" r="2" fill="${STROKE}"/>`);
                } else if (cellType === 'sorbet') {
                    // סורבטו — מנגנון תלייה מתרומם (ממורכז אנכית בתא)
                    const mechH  = cellH * 0.5;
                    const mechY1 = cellY1 + (cellH - mechH) / 2;
                    const mechY2 = mechY1 + mechH;
                    const boxH   = Math.min(mechH * 0.2, 8);
                    const boxW   = Math.min(colW * 0.1, 7);
                    const boxY   = mechY2 - boxH;                 // בלוקי דיור בתחתית המנגנון
                    const boxLX  = colX + 4;
                    const boxRX  = colX + colW - 4 - boxW;
                    p.push(`<rect x="${boxLX.toFixed(1)}" y="${boxY.toFixed(1)}" width="${boxW.toFixed(1)}" height="${boxH.toFixed(1)}" fill="${STROKE}" rx="1"/>`);
                    p.push(`<rect x="${boxRX.toFixed(1)}" y="${boxY.toFixed(1)}" width="${boxW.toFixed(1)}" height="${boxH.toFixed(1)}" fill="${STROKE}" rx="1"/>`);
                    const hRodY  = mechY1;                        // מוט אופקי בראש המנגנון
                    const hRodX1 = boxLX + boxW / 2;
                    const hRodX2 = boxRX + boxW / 2;
                    p.push(`<line x1="${hRodX1.toFixed(1)}" y1="${hRodY.toFixed(1)}" x2="${hRodX2.toFixed(1)}" y2="${hRodY.toFixed(1)}" stroke="${STROKE}" stroke-width="2"/>`);
                    p.push(`<circle cx="${hRodX1.toFixed(1)}" cy="${hRodY.toFixed(1)}" r="2.5" fill="${STROKE}"/>`);
                    p.push(`<circle cx="${hRodX2.toFixed(1)}" cy="${hRodY.toFixed(1)}" r="2.5" fill="${STROKE}"/>`);
                    p.push(`<line x1="${(boxLX + boxW/2).toFixed(1)}" y1="${hRodY.toFixed(1)}" x2="${(boxLX + boxW/2).toFixed(1)}" y2="${boxY.toFixed(1)}" stroke="${STROKE}" stroke-width="1.5"/>`);
                    p.push(`<line x1="${(boxRX + boxW/2).toFixed(1)}" y1="${hRodY.toFixed(1)}" x2="${(boxRX + boxW/2).toFixed(1)}" y2="${boxY.toFixed(1)}" stroke="${STROKE}" stroke-width="1.5"/>`);
                    const handleW  = Math.min(colW * 0.07, 5);
                    const handleH  = mechH * 0.6;
                    const handleX  = (hRodX1 + hRodX2) / 2 - handleW / 2;
                    p.push(`<rect x="${handleX.toFixed(1)}" y="${hRodY.toFixed(1)}" width="${handleW.toFixed(1)}" height="${handleH.toFixed(1)}" fill="${STROKE}" rx="1" opacity="0.75"/>`);
                    if (cellH > 25) p.push(`<text x="${cellCX.toFixed(1)}" y="${(cellY1 + 10).toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="11" fill="${STROKE}" opacity="0.55">סורבטו</text>`);
                } else if (cellType === 'internal_drawers' || cellType === 'external_drawers') {
                    const drawerCount = comp.count || 2;
                    const dh = cellH / drawerCount;
                    for (let di = 0; di < drawerCount; di++) {
                        const dy = cellY1 + di * dh;
                        makeRect(p, colX + 2, dy + 1, colW - 4, dh - 2, 'rgba(255,255,255,0.5)', STROKE_THIN, 0.8);
                        const hndW = Math.min(colW * 0.35, 22);
                        const hndX = colX + (colW - hndW) / 2;
                        const hndY = dy + dh * 0.5;
                        p.push(`<line x1="${hndX.toFixed(1)}" y1="${hndY.toFixed(1)}" x2="${(hndX+hndW).toFixed(1)}" y2="${hndY.toFixed(1)}" stroke="${STROKE}" stroke-width="1.8"/>`);
                    }
                } else if (cellType === 'open_cell') {
                    if (cellH > 18) p.push(`<text x="${cellCX.toFixed(1)}" y="${(cellY1 + 20).toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="12" fill="${STROKE}" opacity="0.6">כוורת</text>`);
                } else if (cellType === 'side_open_cell') {
                    if (cellH > 18) p.push(`<text x="${cellCX.toFixed(1)}" y="${(cellY1 + 20).toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="12" fill="${STROKE}" opacity="0.6">כוורת צד</text>`);
                }

                // Partition(s) (מחיצה) — walls + hanging rods + drawers in each sub-cell
                _bpDrawPartitionCell(p, {
                    comp, col, wgW: wg.w, colX, colW, cellY1, cellY2,
                    rowBotCm, rowTopCm, colBotSvgY: _colBotSvgY, sc, ci, cols,
                    viewKey: _bpViewKey, ri, font: FONT, stroke: STROKE, strokeThin: STROKE_THIN,
                    vlineFn: function(x, y1, y2) { makeVline(p, x, y1, y2, sc); },
                    shelfLineFn: function(x1, y, x2) { makeShelfLine(p, x1, y, x2, sc); },
                    dimHFn: function(ax1, ax2, ay, albl, aabove) { makeDimH(p, ax1, ax2, ay, albl, aabove); },
                    makeRectP: makeRect,
                    makeShelfP: makeShelfLine
                });

                // Skip height label for cells that fall within the split band
                // For bathroom preset: skip all internal cell height labels
                // Partitioned cells already have per-sub-zone dims — skip full-cell
                // label/hit so clicks toggle the sub-zone dim instead of a covering parent.
                const _isSplitBandCell = _splitYAdj > 0 &&
                    rowBotCm >= _splitYAdj - 0.1 && rowTopCm <= _splitTopAdj + 0.1;
                const _isBathroomBP = (pid === 'bathroom');
                const _hasPartitionZones = !!(comp && comp.partition && Array.isArray(comp.subCells) && comp.subCells.length);
                if (!_isBathroomBP && cellHeightLabel > 0 && cellH > 14 && !_isSplitBandCell && !_hasPartitionZones && !_bpIsHoneycombType(comp && comp.type)) {
                    const lblCX = colX + colW / 2;
                    const lblCY = (cellY1 + cellY2) / 2 + 4;
                    _bpPushCellDimLabel(p, _bpViewKey, `c${ci}r${ri}`, lblCX, lblCY, cellHeightLabel,
                        { x: colX, y: cellY1, w: colW, h: cellH });
                }
            }
            _hcBlocks.forEach(block => {
                _bpMarkBlockAdjacentMerges(block, rowBounds, _fo2, cols, ci, wg, colPlinthH);
                _bpDrawHoneycombBlock(p, {
                    block, colX, colW, sc, colBotSvgY: _colBotSvgY, rowBounds, ci, numCols: cols.length,
                    boardFill: '#94a3b8', strokeThin: STROKE_THIN, stroke: STROKE, font: FONT,
                    viewKey: _bpViewKey,
                    makeRectFn: makeRect, makeShelfFn: makeShelfLine
                });
            });
            colX += colW;
        });

        // Outer side wall board thickness (left & right) — span actual column body, not floor gap
        if (cols.length > 0) {
            _bpDrawOuterSideWalls(p, makeVline, ox, dW, colXPositions, sc);
        }
        _bpHoneycombSepFlush(p);

        // ---- Side-open-cell wall gap overlay ----
        // For each side_open_cell on the outer left or right wall, paint a fill-colored
        // rectangle over the border line to visually "open" the wall at that cell.
        {
            const _wallOverlay = (colIdx, isLeft) => {
                const col = cols[colIdx];
                if (!col) return;
                const colW = (col.width || wg.w) * sc;
                const colPlinthH = col.noPlinth ? 0 : pH;
                const _foW = col.floorOffset || 0;
                // floorOffset = cut from bottom; visibleH = height - fo; box raised by floorOffset
                const _colActualH3 = col.height || wg.h;
                const _visibleH3 = _colActualH3 - _foW;
                const _colBotW = oy + dH - _foW * sc;
                const _colTopW = _colBotW - _visibleH3 * sc;
                const shelvesArr = (col.shelvesY || []).slice().sort((a,b) => a-b);
                const adjShelves3 = shelvesArr.map(sy => sy - _foW).filter(sy => sy > 0 && sy < _visibleH3);
                const _rowBase3 = _bpRowBaseCm(col, colPlinthH);
                const rowBounds = [_rowBase3, ...adjShelves3.filter(sy => sy > _rowBase3), _visibleH3];
                for (let ri = 0; ri < rowBounds.length - 1; ri++) {
                    const comp = col.compartments ? col.compartments[ri] : null;
                    if (!comp || comp.type !== 'side_open_cell') continue;
                    const rowBotCm = rowBounds[ri];
                    const rowTopCm = rowBounds[ri + 1];
                    const cellY1 = _colBotW - rowTopCm * sc;
                    const cellY2 = _colBotW - rowBotCm * sc;
                    const wallX = isLeft ? ox : ox + dW;
                    const overlayW = 4; // wide enough to cover the 2px stroke
                    p.push(`<rect x="${(wallX - overlayW/2).toFixed(1)}" y="${cellY1.toFixed(1)}" width="${overlayW}" height="${(cellY2 - cellY1).toFixed(1)}" fill="${wg.fill}" stroke="none"/>`);
                }
            };
            _wallOverlay(0, true);                  // left outer wall (column 0)
            _wallOverlay(cols.length - 1, false);   // right outer wall (last column)
        }

        // ---- Corner unit overlay (front view) — only for center cabinet ----
        if (wg.wd === centerWing) {
            const hasCUfv = state.corner && state.corner.side !== 'none';
            if (hasCUfv) {
                const cuSidefv = state.corner.side; // 'right' or 'left'
                const cuHfv = state.corner.height || 90;
                const cuDfv = state.corner.depth || cD;
                const cuLabelfv = state.corner.type === 'desk' ? 'שולחן פינתי' : 'שידה פינתית';
                // SVG coordinates: bottom-aligned, flush against left or right wall
                const cuSvgW = cuDfv * sc;
                const cuSvgH = cuHfv * sc;
                const cuSvgX = cuSidefv === 'right' ? (ox + dW - cuSvgW) : ox;
                const cuSvgY = oy + dH - cuSvgH;
                // Semi-transparent yellow fill with amber dashed border
                p.push(`<rect x="${cuSvgX.toFixed(1)}" y="${cuSvgY.toFixed(1)}" width="${cuSvgW.toFixed(1)}" height="${cuSvgH.toFixed(1)}" fill="#fef08a" fill-opacity="0.55" stroke="#b45309" stroke-width="1.5" stroke-dasharray="5,3"/>`);
                // Label badge centered in the overlay
                const cuLblX = cuSvgX + cuSvgW / 2;
                const cuLblY = cuSvgY + cuSvgH / 2;
                const cuLblW = Math.max(cuLabelfv.length * 6 + 14, 72);
                p.push(`<rect x="${(cuLblX - cuLblW/2).toFixed(1)}" y="${(cuLblY - 9).toFixed(1)}" width="${cuLblW.toFixed(1)}" height="18" rx="3" fill="#fef08a" stroke="#b45309" stroke-width="1" opacity="0.95"/>`);
                p.push(`<text x="${cuLblX.toFixed(1)}" y="${(cuLblY + 1).toFixed(1)}" text-anchor="middle" dominant-baseline="middle" font-family="${FONT}" font-size="14" font-weight="bold" fill="#92400e">${cuLabelfv}</text>`);
                // Width dimension (below the overlay — placed below the total-width dim line at oy+dH+22)
                const cuDimY = oy + dH + 38;
                makeDimH(p, cuSvgX, cuSvgX + cuSvgW, cuDimY, `${_bpMm(cuDfv)}`);
                // Height dimension (on the outer side — use far-right/far-left to avoid overlap with plinth dim)
                if (cuSidefv === 'right') {
                    makeDimV(p, ox + dW + 40, cuSvgY, oy + dH, `${_bpMm(cuHfv)}`);
                } else {
                    makeDimVLeft(p, ox - 36, cuSvgY, oy + dH, `${_bpMm(cuHfv)}`);
                }
            }
        }

        // Dimension lines
        const _hasFloorPlinth2 = pH > 0 && _bpAnyColumnOnFloor(cols);
        const _widthDimBaseY = _bpWidthDimBaseY(oy, dH, pH, sc, cols);
        const _hasMultiCols2 = colXPositions.length > 1;
        const dimY = _widthDimBaseY + (_hasMultiCols2 ? 54 : 36);
        makeDimH(p, ox, ox + dW, dimY, `${_bpMm(wg.w)}`);
        {
            const _tCmHC2 = state.thickness || 1.7;
            colXPositions.forEach((cp, ci) => {
                const col = cols[ci];
                if (_bpColumnHasHoneycomb(col)) {
                    const inner = _bpHoneycombInnerSvgSpan(cp, sc, _tCmHC2);
                    if (inner) _bpMaybePushInnerWidthDim(p, _bpViewKey, 'hcInnerW:c' + ci, inner.x1, inner.x2, _widthDimBaseY + 6, inner.lbl, (ax1, ax2, ay, albl, aabove) => makeDimH(p, ax1, ax2, ay, albl, aabove), false);
                }
                if (_hasMultiCols2 || _bpColumnHasHoneycomb(col)) {
                    const faceY = (cp.colTopY != null) ? cp.colTopY : oy;
                    const faceH = (cp.colBotY != null && cp.colTopY != null) ? (cp.colBotY - cp.colTopY) : dH;
                    _bpMaybePushColWidthDim(p, _bpViewKey, ci, cp.x1, cp.x2, _widthDimBaseY + 18,
                        `${_bpMm(cp.wCm)}`,
                        (x1, x2, y, lbl, above) => makeDimH(p, x1, x2, y, lbl, above), false, faceY, faceH);
                }
            });
        }
        // Overall height dimension: from lowest bottom to highest top across all columns
        {
            // Overall height: from floor (oy+dH) to highest column top
            // top = oy+dH - fo*sc - visibleH*sc = oy+dH - (fo + visibleH)*sc = oy+dH - height*sc
            const _maxTopY2 = cols.length > 0 ? Math.min(...cols.map(c => oy + dH - (c.height || wg.h) * sc)) : oy;
            const _totalHcm2 = cols.length > 0 ? _bpMm(Math.max(...cols.map(c => (c.height || wg.h)))) : _bpMm(wg.h);
            makeDimV(p, ox - 54, _maxTopY2, oy + dH, `${_totalHcm2}`);
            _bpDrawShorterColumnOverallHeights(
                (x, y1, y2, lbl) => makeDimV(p, x, y1, y2, lbl),
                cols, colXPositions, oy, dH, sc, wg.h, ox, dW
            );
        }
        // ---- Bathroom preset: right-side external dims (body height + floor offset + drawer heights) ----
        // ---- Regular preset: split section dims + floorOffset dims ----
        if (pid === 'bathroom') {
            // Right side dims for bathroom:
            // 1. Body height (cabinet top to cabinet bottom, without floor gap) at ox+dW+38
            // 2. Floor offset (gap from floor to cabinet bottom) at ox+dW+76 (only if hanging)
            // 3. Individual drawer heights at ox+dW+38 (overlaid on body height span)
            // NOTE: total height (floor to top) is already on the LEFT side — do NOT repeat on right

            // Find the reference column (first with floorOffset, or first column)
            const _bathRefColIdx = cols.findIndex(c => (c.floorOffset || 0) > 0);
            const _bathRefCol = _bathRefColIdx >= 0 ? cols[_bathRefColIdx] : (cols[0] || null);
            if (_bathRefCol) {
                const _fo5 = _bathRefCol.floorOffset || 0;
                const _colH5 = _bathRefCol.height || wg.h;
                const _bodyH5 = _colH5 - _fo5; // body height in cm (without floor gap)
                const _colBotY5 = oy + dH - _fo5 * sc;   // SVG Y of cabinet bottom
                const _colTopY5 = _colBotY5 - _bodyH5 * sc; // SVG Y of cabinet top

                // 1. Body height on right side
                makeDimVLeft(p, ox + dW + 38, _colTopY5, _colBotY5, `${_bpMm(_bodyH5)}`);

                // 2. Floor offset (only for hanging cabinet where floorOffset > 0)
                if (_fo5 > 0) {
                    makeDimV(p, ox + dW + 76, _colBotY5, oy + dH, `${_bpMm(_fo5)}`);
                }
            }

            // 3. Individual drawer heights — scan first column with external_drawers compartments
            // For each external_drawers row: if count>1, show each individual drawer height.
            {
                const _bathDrawerCol = cols.find(c => c.compartments && c.compartments.some(comp => comp && comp.type === 'external_drawers'));
                if (_bathDrawerCol) {
                    const _fo4 = _bathDrawerCol.floorOffset || 0;
                    const _visH4 = (_bathDrawerCol.height || wg.h) - _fo4;
                    const _colBotY4 = oy + dH - _fo4 * sc;
                    const _shelvesAdj4 = (_bathDrawerCol.shelvesY || []).slice().sort((a,b)=>a-b).map(sy => sy - _fo4).filter(sy => sy > 0 && sy < _visH4);
                    const _rowBounds4 = [0, ..._shelvesAdj4, _visH4];
                    for (let ri4 = 0; ri4 < _rowBounds4.length - 1; ri4++) {
                        const comp4 = _bathDrawerCol.compartments[ri4];
                        if (!comp4 || comp4.type !== 'external_drawers') continue;
                        const rowBotCm4 = _rowBounds4[ri4];
                        const rowTopCm4 = _rowBounds4[ri4 + 1];
                        const rowSvgBot4 = _colBotY4 - rowBotCm4 * sc;
                        const rowSvgTop4 = _colBotY4 - rowTopCm4 * sc;
                        const rowHcm4 = rowTopCm4 - rowBotCm4;
                        const drawerCount4 = comp4.count || 1;
                        if (drawerCount4 > 1) {
                            // Show each individual drawer's external height
                            const singleDrawerHcm = rowHcm4 / drawerCount4;
                            const singleDrawerSvgH = singleDrawerHcm * sc;
                            for (let di4 = 0; di4 < drawerCount4; di4++) {
                                const dSvgTop = rowSvgTop4 + di4 * singleDrawerSvgH;
                                const dSvgBot = dSvgTop + singleDrawerSvgH;
                                if (dSvgBot - dSvgTop > 8) {
                                    makeDimVLeft(p, ox + dW + 38, dSvgTop, dSvgBot, `${_bpMm(singleDrawerHcm)}`);
                                }
                            }
                        } else {
                            // Single drawer in this row — show the whole row height
                            if (rowSvgBot4 - rowSvgTop4 > 8) {
                                makeDimVLeft(p, ox + dW + 38, rowSvgTop4, rowSvgBot4, `${_bpMm(rowHcm4)}`);
                            }
                        }
                    }
                }
            }
        } else {
            // Split dimensions: lower section height + upper section height (on the right side)
            {
                // Find the first column that has a splitY
                const _splitCol = cols.find(c => c.splitY && c.splitY > 0);
                if (_splitCol) {
                    const _sy = _splitCol.splitY;
                    const _t2 = (state.thickness || 1.7) * 2;
                    const _fo3 = _splitCol.floorOffset || 0;
                    const _splitBotY = oy + dH - _sy * sc;
                    const _splitTopY = _splitBotY - _t2 * sc;
                    const _colTopY3  = oy + dH - (_splitCol.height || wg.h) * sc;
                    const _colBotY3  = oy + dH - _fo3 * sc;
                    const _lowerStartY = _fo3 > 0 ? _colBotY3 : oy + dH - pH * sc;
                    const _lowerBaseCm = _fo3 > 0 ? _fo3 : pH;
                    const _lowerH = Math.round((_sy - _lowerBaseCm) * 10);
                    const _upperH = Math.round(((_splitCol.height || wg.h) - _sy - _t2) * 10);
                    makeDimV(p, ox + dW + 54, _splitTopY, _colTopY3, `${_upperH}`);
                    makeDimV(p, ox + dW + 54, _splitBotY, _lowerStartY, `${_lowerH}`);
                    // Split band thickness label (small, centered on band)
                    const _bandMidY = (_splitBotY + _splitTopY) / 2;
                    p.push(`<text x="${(ox + dW + 54 + 22).toFixed(1)}" y="${(_bandMidY + 3).toFixed(1)}" font-family="${FONT}" font-size="8" fill="${STROKE}" opacity="0.62">${_bpMm(_t2)}</text>`);
                }
            }
            // floorOffset + body height for hanging cabinets (regular preset)
            {
                const _hangCol = cols.find(c => (c.floorOffset || 0) > 0);
                if (_hangCol) {
                    const _foH = _hangCol.floorOffset || 0;
                    const _bodyH = (_hangCol.height || wg.h) - _foH;
                    const _colBotH = oy + dH - _foH * sc;
                    const _colTopH = _colBotH - _bodyH * sc;
                    makeDimVLeft(p, ox + dW + 38, _colTopH, _colBotH, `${_bpMm(_bodyH)}`);
                    makeDimV(p, ox + dW + 76, _colBotH, oy + dH, `${_bpMm(_foH)}`);
                } else {
                    let _foDimX2 = ox + dW + (_hasFloorPlinth2 ? 38 : 18);
                    colXPositions.forEach((cp, ci) => {
                        const _col = cols[ci];
                        const _fo = (_col && _col.floorOffset) ? _col.floorOffset : 0;
                        if (_fo > 0) {
                            makeDimV(p, _foDimX2, cp.colBotY, oy + dH, `${_bpMm(_fo)}`);
                            _foDimX2 += 36;
                        }
                    });
                }
            }
        }

        // ---- Closure panels overlay (only for center wing, when wall-snap is active) ----
        if (wg.wd === centerWing) {
            const _presetBP2 = state.presetId || 'linear';
            const _isLSBP2 = (_presetBP2 === 'linear' || _presetBP2 === 'sliding');
            const _rwBP2 = _isLSBP2 ? (window._roomWall || state.roomWall || 'center') : 'center';
            const _closureOnBP2 = (window._closureEnabled !== false);
            if (_rwBP2 !== 'center' && _isLSBP2 && _closureOnBP2) {
                const _cWBP2   = Math.max(1.8, parseFloat(window._closureWidth)      || 1.8);
                const _cWRBP2  = Math.max(1.8, parseFloat(window._closureWidthRight) || 1.8);
                const _cCWBP2  = Math.max(1.8, parseFloat(window._closureCeilWidth)  || 1.8);
                const FILL_CL2 = '#d4c5b0', STROKE_CL2 = '#8b7355';
                const _ceilSvgHBP2 = _cCWBP2 * sc;
                // Left side panel
                if (_rwBP2 === 'left' || _rwBP2 === 'both') {
                    const _sideSvgWL2 = _cWBP2 * sc;
                    const _sideXL2 = ox - _sideSvgWL2;
                    makeRect(p, _sideXL2, oy, _sideSvgWL2, wg.h * sc, FILL_CL2, STROKE_CL2, 1.5);
                    makeDimH(p, _sideXL2, ox, oy + dH + 22, `${_bpMm(_cWBP2)}`);
                }
                // Right side panel
                if (_rwBP2 === 'right' || _rwBP2 === 'both') {
                    const _sideSvgWR2 = _cWRBP2 * sc;
                    const _sideXR2 = ox + dW;
                    makeRect(p, _sideXR2, oy, _sideSvgWR2, wg.h * sc, FILL_CL2, STROKE_CL2, 1.5);
                    makeDimH(p, _sideXR2, _sideXR2 + _sideSvgWR2, oy + dH + 22, `${_bpMm(_cWRBP2)}`);
                }
                // Ceiling panel: spans from leftmost edge to rightmost edge
                {
                    const _leftExtra2  = (_rwBP2 === 'left'  || _rwBP2 === 'both') ? _cWBP2  * sc : 0;
                    const _rightExtra2 = (_rwBP2 === 'right' || _rwBP2 === 'both') ? _cWRBP2 * sc : 0;
                    const _ceilXBP2    = ox - _leftExtra2;
                    const _ceilWBP2    = _leftExtra2 + dW + _rightExtra2;
                    makeRect(p, _ceilXBP2, oy - _ceilSvgHBP2, _ceilWBP2, _ceilSvgHBP2, FILL_CL2, STROKE_CL2, 1.5);
                    makeDimV(p, _ceilXBP2 - 18, oy - _ceilSvgHBP2, oy, `${_bpMm(_cCWBP2)}`);
                }
            }
        }
        // Plinth height dim — only when at least one column has a visible plinth on the floor
        if (_hasFloorPlinth2) {
            makeDimV(p, ox + dW + 18, oy + dH - pH*sc, oy + dH, `${_bpMm(pH)}`);
        }

        const _vkWing = wg.wd === leftWing ? 'left' : wg.wd === rightWing ? 'right' : 'center';
        _bpAppendViewCutouts(p, _vkWing, ox, oy, dW, dH, sc, wg.w, wg.h);
        _bpFlushDims(p);
        pages.push({ label: wg.label, svgParts: p, viewKey: _vkWing, cabWidthCm: wg.w, cabHeightCm: wg.h, viewMeta: { ox, oy, dW, dH, sc } });
    });

    // ---- Full-corner diagonal face pages ----
    // For each full_corner wing, draw a front view of the 45° diagonal face.
    // The diagonal face is a rectangle: width = fcSize * √2 (projected face width), height = colH.
    // It shows shelves as horizontal lines at the shelvesY positions.
    const fcWings = [];
    if (hasLeft  && lPos === 'full_corner') fcWings.push({ wd: leftWing,  label: 'שרטוט חזית — פינה מלאה שמאל', fcSize: fcSizeL, wingD: lD, fill: FILL_FC_L });
    if (hasRight && rPos === 'full_corner') fcWings.push({ wd: rightWing, label: 'שרטוט חזית — פינה מלאה ימין',  fcSize: fcSizeR, wingD: rD, fill: FILL_FC_R });

    fcWings.forEach((fc) => {
        const _bpViewKey = fc.wd === leftWing ? 'fc-left' : 'fc-right';
        const p = [];
        _bpStartPage(_bpViewKey);
        const drawAreaY = 65;
        const drawAreaH = PAGE_H - drawAreaY - MARGIN - 80; // reserve 80px at bottom for dim labels
        const pw = SVG_W - MARGIN * 2;

        // Diagonal face width = fcSize * √2 (the 45° face spans from one arm end to the other)
        const diagW = fc.fcSize * Math.SQRT2;
        const sc = Math.min((pw - PAD*2) / Math.max(diagW, 1), (drawAreaH - PAD*2) / Math.max(cH, 1));
        const dW = diagW * sc, dH = cH * sc;
        const ox = MARGIN + (pw - dW) / 2;
        const oy = drawAreaY + (drawAreaH - dH) / 2;

        // Cabinet body (diagonal face as rectangle) — use per-side color
        makeRect(p, ox, oy, dW, dH, fc.fill || FILL_FC_L, STROKE, 2);
        // Plinth
        if (pH > 0) makeRect(p, ox, oy + dH - pH*sc, dW, pH*sc, '#cbd5e1', STROKE, 1);

        // Diagonal indicator lines at top corners (showing this is a 45° face)
        const diagMark = 14;
        p.push(`<line x1="${ox.toFixed(1)}" y1="${oy.toFixed(1)}" x2="${(ox+diagMark).toFixed(1)}" y2="${(oy+diagMark).toFixed(1)}" stroke="${STROKE_THIN}" stroke-width="1" stroke-dasharray="3,2"/>`);
        p.push(`<line x1="${(ox+dW).toFixed(1)}" y1="${oy.toFixed(1)}" x2="${(ox+dW-diagMark).toFixed(1)}" y2="${(oy+diagMark).toFixed(1)}" stroke="${STROKE_THIN}" stroke-width="1" stroke-dasharray="3,2"/>`);
        // Label showing this is a 45° view
        p.push(`<text x="${(ox+dW/2).toFixed(1)}" y="${(oy-8).toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="13" fill="${STROKE}" opacity="0.6">מבט חזית 45°</text>`);

        // Shelves from fullCorner data
        const fcData = fc.wd.fullCorner || {};
        const shelvesY = fcData.shelvesY || [];
        const fcSplitY = fcData.splitY || 0;
        const fcSplitT = (state.thickness || 1.7) * 2;
        shelvesY.forEach(sy => {
            // Skip shelves inside the split band
            if (fcSplitY > 0 && sy >= fcSplitY && sy <= fcSplitY + fcSplitT) return;
            const sy_px = oy + dH - sy * sc;
            makeShelfLine(p, ox, sy_px, ox + dW, sc);
        });
        _bpDrawTopBottomBoards(
            function(x1, sy, x2) { makeShelfLine(p, x1, sy, x2, sc); },
            { noPlinth: false, floorOffset: 0 },
            ox, dW, oy + dH, cH, pH, sc
        );

        // Split band for full-corner face
        if (fcSplitY > 0 && fcSplitY < cH) {
            const fcSplitBotY = oy + dH - fcSplitY * sc;
            const fcSplitBandH = fcSplitT * sc;
            const fcSplitTopY = fcSplitBotY - fcSplitBandH;
            _bpDrawSplitDoubleBand(function(x, y, w, h, f, s, sw) { makeRect(p, x, y, w, h, f, s, sw); }, ox, fcSplitTopY, dW, fcSplitBandH, STROKE);
            // Labels
            p.push(`<text x="${(ox + 6).toFixed(1)}" y="${((oy + dH + fcSplitBotY) / 2 + 4).toFixed(1)}" font-family="${FONT}" font-size="11" fill="${STROKE}" opacity="0.5">ארון תחתון</text>`);
            p.push(`<text x="${(ox + 6).toFixed(1)}" y="${((oy + fcSplitTopY) / 2 + 4).toFixed(1)}" font-family="${FONT}" font-size="11" fill="${STROKE}" opacity="0.5">ארון עליון</text>`);
            p.push(`<text x="${(ox + dW / 2).toFixed(1)}" y="${(fcSplitTopY + fcSplitBandH / 2 + 3).toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="8" fill="${STROKE}" opacity="0.62">${_bpMm(fcSplitT)}</text>`);
        }

        // Cell height labels inside each cell
        const shelvesArr = shelvesY.slice().sort((a,b) => a-b);
        // Insert split band boundaries
        let fcAllBounds = [...shelvesArr];
        if (fcSplitY > 0 && fcSplitY < cH) {
            if (!fcAllBounds.includes(fcSplitY)) fcAllBounds.push(fcSplitY);
            const fcSplitTop = fcSplitY + fcSplitT;
            if (fcSplitTop < cH && !fcAllBounds.includes(fcSplitTop)) fcAllBounds.push(fcSplitTop);
            fcAllBounds.sort((a,b) => a-b);
        }
        const rowBounds = [pH, ...fcAllBounds.filter(sy => sy > pH), cH];
        const _t_shelfFC = state.thickness || 1.7;
        for (let ri = 0; ri < rowBounds.length - 1; ri++) {
            const rowBotCm = rowBounds[ri];
            const rowTopCm = rowBounds[ri + 1];
            const cellHeightLabel = _bpClearCellHeightLabel(rowBotCm, rowTopCm, _t_shelfFC);
            const cellY1 = oy + dH - rowTopCm * sc;
            const cellY2 = oy + dH - rowBotCm * sc;
            const cellH = cellY2 - cellY1;
            // Skip label for split band cell
            const isFCSplitBand = fcSplitY > 0 && rowBotCm >= fcSplitY - 0.1 && rowTopCm <= fcSplitY + fcSplitT + 0.1;
            if (cellHeightLabel > 0 && cellH > 14 && !isFCSplitBand) {
                _bpPushCellDimLabel(p, _bpViewKey, `r${ri}`, ox + dW / 2, (cellY1 + cellY2) / 2 + 4, cellHeightLabel,
                    { x: ox, y: cellY1, w: dW, h: cellH });
            }
        }

        // Dimension lines
        const dimY = oy + dH + 36;
        makeDimH(p, ox, ox + dW, dimY, `${_bpMm(diagW)}`);
        makeDimV(p, ox - 54, oy, oy + dH, `${_bpMm(cH)}`);
        if (pH > 0) makeDimV(p, ox + dW + 18, oy + dH - pH*sc, oy + dH, `${_bpMm(pH)}`);
        // Split section dims for full-corner
        if (fcSplitY > 0 && fcSplitY < cH) {
            const fcSplitBotY2 = oy + dH - fcSplitY * sc;
            const fcSplitTopY2 = fcSplitBotY2 - fcSplitT * sc;
            const fcColTopY2 = oy;
            makeDimV(p, ox + dW + 54, oy + dH - pH * sc, fcSplitBotY2, `${_bpMm((fcSplitY - pH))}`);
            makeDimV(p, ox + dW + 54, fcSplitTopY2, fcColTopY2, `${_bpMm((cH - fcSplitY - fcSplitT))}`);
        }
        // Also show the actual corner size
        makeDimH(p, ox, ox + dW, oy - 16, `${_bpMm(fc.fcSize)} × ${_bpMm(fc.fcSize)}`);

        const _vkFC = fc.wd === leftWing ? 'fc-left' : 'fc-right';
        _bpAppendViewCutouts(p, _vkFC, ox, oy, dW, dH, sc, diagW, cH);
        _bpFlushDims(p);
        pages.push({ label: fc.label, svgParts: p, viewKey: _vkFC, cabWidthCm: diagW, cabHeightCm: cH, viewMeta: { ox, oy, dW, dH, sc } });
    });

    // ---- Additional wing front-view pages (for wings attached to full_corner corners) ----
    // These wings have their own columns and need a standard front-view page.
    const fcAdditionalWings = [];
    if (hasLeft  && lPos === 'full_corner' && lW > 0) fcAdditionalWings.push({ wd: leftWing,  label: 'שרטוט חזית — כנף שמאל (המשך פינה)', fill: FILL_WING_L, w: lW, h: cH, d: lD });
    if (hasRight && rPos === 'full_corner' && rW > 0) fcAdditionalWings.push({ wd: rightWing, label: 'שרטוט חזית — כנף ימין (המשך פינה)',  fill: FILL_WING_R, w: rW, h: cH, d: rD });

    fcAdditionalWings.forEach((wg) => {
        const _bpViewKey = wg.wd === leftWing ? 'fc-left-extra' : 'fc-right-extra';
        const p = [];
        _bpStartPage(_bpViewKey);
        const drawAreaY = 65;
        const drawAreaH = PAGE_H - drawAreaY - MARGIN - 80; // reserve 80px at bottom for dim labels
        const pw = SVG_W - MARGIN * 2;

        const sc = Math.min((pw - PAD*2) / Math.max(wg.w,1), (drawAreaH - PAD*2) / Math.max(wg.h,1));
        const dW = wg.w * sc, dH = wg.h * sc;
        const ox = MARGIN + (pw - dW) / 2;
        const oy = drawAreaY + (drawAreaH - dH) / 2;

        // Cabinet body
        makeRect(p, ox, oy, dW, dH, wg.fill, STROKE, 2);
        // Plinth
        if (pH > 0) makeRect(p, ox, oy + dH - pH*sc, dW, pH*sc, '#cbd5e1', STROKE, 1);

        // Columns, shelves, hangers & drawers
        const cols = (wg.wd && wg.wd.columns) ? wg.wd.columns : [];
        const colXPositions = [];
        let colX = ox;
        cols.forEach((col, ci) => {
            const colW = (col.width || wg.w) * sc;
            const colPlinthH = col.noPlinth ? 0 : pH;
            colXPositions.push({ x1: colX, x2: colX + colW, wCm: (col.width != null ? col.width : wg.w) });

            if (ci > 0) makeVline(p, colX, oy, oy + dH, sc);

            const _splitYFC = col.splitY || 0;
            const _splitTFC = (state.thickness || 1.7) * 2;
            (col.shelvesY || []).forEach(sy => {
                // Skip shelves inside the split band
                if (_splitYFC > 0 && sy >= _splitYFC && sy <= _splitYFC + _splitTFC) return;
                makeShelfLine(p, colX, oy + dH - sy*sc, colX + colW, sc);
            });
            _bpDrawTopBottomBoards(
                function(x1, sy, x2) { makeShelfLine(p, x1, sy, x2, sc); },
                col, colX, colW, oy + dH, col.height || wg.h, colPlinthH, sc
            );

            // Split band for additional wing
            if (_splitYFC > 0 && _splitYFC < (col.height || wg.h)) {
                const _splitBotYFC = oy + dH - _splitYFC * sc;
                const _splitBandHFC = _splitTFC * sc;
                const _splitTopYFC = _splitBotYFC - _splitBandHFC;
                _bpDrawSplitDoubleBand(function(x, y, w, h, f, s, sw) { makeRect(p, x, y, w, h, f, s, sw); }, colX, _splitTopYFC, colW, _splitBandHFC, STROKE);
                if (ci === 0) {
                    const lowerMidFC = (oy + dH + _splitBotYFC) / 2;
                    const upperMidFC = (oy + _splitTopYFC) / 2;
                    p.push(`<text x="${(colX + 6).toFixed(1)}" y="${(lowerMidFC + 4).toFixed(1)}" font-family="${FONT}" font-size="11" fill="${STROKE}" opacity="0.5">ארון תחתון</text>`);
                    p.push(`<text x="${(colX + 6).toFixed(1)}" y="${(upperMidFC + 4).toFixed(1)}" font-family="${FONT}" font-size="11" fill="${STROKE}" opacity="0.5">ארון עליון</text>`);
                    p.push(`<text x="${(colX + colW / 2).toFixed(1)}" y="${(_splitTopYFC + _splitBandHFC / 2 + 3).toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="8" fill="${STROKE}" opacity="0.62">${_bpMm(_splitTFC)}</text>`);
                }
            }

            const shelvesArr = (col.shelvesY || []).slice().sort((a,b) => a-b);
            // Insert split band boundaries
            const _splitYFCAdj = _splitYFC;
            const _splitTopFCAdj = _splitYFC > 0 ? _splitYFC + _splitTFC : 0;
            let _allBoundsFC = [...shelvesArr];
            if (_splitYFC > _bpRowBaseCm(col, colPlinthH) && _splitYFC < wg.h) {
                if (!_allBoundsFC.includes(_splitYFCAdj)) _allBoundsFC.push(_splitYFCAdj);
                if (_splitTopFCAdj < wg.h && !_allBoundsFC.includes(_splitTopFCAdj)) _allBoundsFC.push(_splitTopFCAdj);
                _allBoundsFC.sort((a,b) => a-b);
            }
            const _rowBaseFC = _bpRowBaseCm(col, colPlinthH);
            const rowBounds = [_rowBaseFC, ..._allBoundsFC.filter(sy => sy > _rowBaseFC), wg.h];
            const numRows = rowBounds.length - 1;
            const _t_shelfFCW = state.thickness || 1.7;
            for (let ri = 0; ri < numRows; ri++) {
                const rowBotCm = rowBounds[ri];
                const rowTopCm = rowBounds[ri + 1];
                const cellHeightLabel = _bpClearCellHeightLabel(rowBotCm, rowTopCm, _t_shelfFCW);
                const cellY1 = oy + dH - rowTopCm * sc;
                const cellY2 = oy + dH - rowBotCm * sc;
                const cellH = cellY2 - cellY1;
                const cellCX = colX + colW / 2;

                const comp = col.compartments ? col.compartments[ri] : null;
                const cellType = comp ? (comp.type || 'empty') : 'empty';

                if (cellType === 'hanging') {
                    const rodY   = _bpHangRodSvgY(cellY1, sc);
                    const hRodX1 = colX + 4;
                    const hRodX2 = colX + colW - 4;
                    p.push(`<line x1="${hRodX1.toFixed(1)}" y1="${rodY.toFixed(1)}" x2="${hRodX2.toFixed(1)}" y2="${rodY.toFixed(1)}" stroke="${STROKE}" stroke-width="2"/>`);
                    p.push(`<circle cx="${hRodX1.toFixed(1)}" cy="${rodY.toFixed(1)}" r="2" fill="${STROKE}"/>`);
                    p.push(`<circle cx="${hRodX2.toFixed(1)}" cy="${rodY.toFixed(1)}" r="2" fill="${STROKE}"/>`);
                } else if (cellType === 'sorbet') {
                    // סורבטו — מנגנון תלייה מתרומם (ממורכז אנכית בתא)
                    const mechH  = cellH * 0.5;
                    const mechY1 = cellY1 + (cellH - mechH) / 2;
                    const mechY2 = mechY1 + mechH;
                    const boxH   = Math.min(mechH * 0.2, 8);
                    const boxW   = Math.min(colW * 0.1, 7);
                    const boxY   = mechY2 - boxH;                 // בלוקי דיור בתחתית המנגנון
                    const boxLX  = colX + 4;
                    const boxRX  = colX + colW - 4 - boxW;
                    p.push(`<rect x="${boxLX.toFixed(1)}" y="${boxY.toFixed(1)}" width="${boxW.toFixed(1)}" height="${boxH.toFixed(1)}" fill="${STROKE}" rx="1"/>`);
                    p.push(`<rect x="${boxRX.toFixed(1)}" y="${boxY.toFixed(1)}" width="${boxW.toFixed(1)}" height="${boxH.toFixed(1)}" fill="${STROKE}" rx="1"/>`);
                    const hRodY  = mechY1;                        // מוט אופקי בראש המנגנון
                    const hRodX1 = boxLX + boxW / 2;
                    const hRodX2 = boxRX + boxW / 2;
                    p.push(`<line x1="${hRodX1.toFixed(1)}" y1="${hRodY.toFixed(1)}" x2="${hRodX2.toFixed(1)}" y2="${hRodY.toFixed(1)}" stroke="${STROKE}" stroke-width="2"/>`);
                    p.push(`<circle cx="${hRodX1.toFixed(1)}" cy="${hRodY.toFixed(1)}" r="2.5" fill="${STROKE}"/>`);
                    p.push(`<circle cx="${hRodX2.toFixed(1)}" cy="${hRodY.toFixed(1)}" r="2.5" fill="${STROKE}"/>`);
                    p.push(`<line x1="${(boxLX + boxW/2).toFixed(1)}" y1="${hRodY.toFixed(1)}" x2="${(boxLX + boxW/2).toFixed(1)}" y2="${boxY.toFixed(1)}" stroke="${STROKE}" stroke-width="1.5"/>`);
                    p.push(`<line x1="${(boxRX + boxW/2).toFixed(1)}" y1="${hRodY.toFixed(1)}" x2="${(boxRX + boxW/2).toFixed(1)}" y2="${boxY.toFixed(1)}" stroke="${STROKE}" stroke-width="1.5"/>`);
                    const handleW  = Math.min(colW * 0.07, 5);
                    const handleH  = mechH * 0.6;
                    const handleX  = (hRodX1 + hRodX2) / 2 - handleW / 2;
                    p.push(`<rect x="${handleX.toFixed(1)}" y="${hRodY.toFixed(1)}" width="${handleW.toFixed(1)}" height="${handleH.toFixed(1)}" fill="${STROKE}" rx="1" opacity="0.75"/>`);
                    if (cellH > 25) p.push(`<text x="${cellCX.toFixed(1)}" y="${(cellY1 + 10).toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="11" fill="${STROKE}" opacity="0.55">סורבטו</text>`);
                } else if (cellType === 'internal_drawers' || cellType === 'external_drawers') {
                    const drawerCount = comp.count || 2;
                    const dh = cellH / drawerCount;
                    for (let di = 0; di < drawerCount; di++) {
                        const dy = cellY1 + di * dh;
                        makeRect(p, colX + 2, dy + 1, colW - 4, dh - 2, 'rgba(255,255,255,0.5)', STROKE_THIN, 0.8);
                        const hndW = Math.min(colW * 0.35, 22);
                        const hndX = colX + (colW - hndW) / 2;
                        const hndY = dy + dh * 0.5;
                        p.push(`<line x1="${hndX.toFixed(1)}" y1="${hndY.toFixed(1)}" x2="${(hndX+hndW).toFixed(1)}" y2="${hndY.toFixed(1)}" stroke="${STROKE}" stroke-width="1.8"/>`);
                    }
                }

                _bpDrawPartitionCell(p, {
                    comp, col, wgW: wg.w, colX, colW, cellY1, cellY2,
                    rowBotCm, rowTopCm, colBotSvgY: oy + dH, sc, ci, cols,
                    viewKey: _bpViewKey, ri, font: FONT, stroke: STROKE, strokeThin: STROKE_THIN,
                    vlineFn: function(x, y1, y2) { makeVline(p, x, y1, y2, sc); },
                    shelfLineFn: function(x1, y, x2) { makeShelfLine(p, x1, y, x2, sc); },
                    dimHFn: function(ax1, ax2, ay, albl, aabove) { makeDimH(p, ax1, ax2, ay, albl, aabove); },
                    makeRectP: makeRect,
                    makeShelfP: makeShelfLine
                });

                // Skip height label for split band cells
                const _isSplitBandFC = _splitYFC > 0 &&
                    rowBotCm >= _splitYFCAdj - 0.1 && rowTopCm <= _splitTopFCAdj + 0.1;
                const _hasPartFC = !!(comp && comp.partition && Array.isArray(comp.subCells) && comp.subCells.length);
                if (_bpIsHoneycombType(cellType)) {
                    _bpMaybePushHoneycombInnerHeight(p, colX, cellY1, cellY2, rowBotCm, rowTopCm, sc, _t_shelfFCW, _bpViewKey, `c${ci}r${ri}hcH`);
                } else if (cellHeightLabel > 0 && cellH > 14 && !_isSplitBandFC && !_hasPartFC) {
                    const lblCX = colX + colW / 2;
                    const lblCY = (cellY1 + cellY2) / 2 + 4;
                    _bpPushCellDimLabel(p, _bpViewKey, `c${ci}r${ri}`, lblCX, lblCY, cellHeightLabel,
                        { x: colX, y: cellY1, w: colW, h: cellH });
                }
            }
            colX += colW;
        });

        // Dimension lines — in multi-view dH = wg.h*sc = full height, oy+dH IS the floor/plinth bottom
        const _hasMultiCols2 = colXPositions.length > 1;
        const dimY = oy + dH + (_hasMultiCols2 ? 54 : 36);
        makeDimH(p, ox, ox + dW, dimY, `${_bpMm(wg.w)}`);
        {
            const _tCmHCFc = state.thickness || 1.7;
            colXPositions.forEach((cp, ci) => {
                const col = cols[ci];
                if (_bpColumnHasHoneycomb(col)) {
                    const inner = _bpHoneycombInnerSvgSpan(cp, sc, _tCmHCFc);
                    if (inner) _bpMaybePushInnerWidthDim(p, _bpViewKey, 'hcInnerW:c' + ci, inner.x1, inner.x2, oy + dH + 6, inner.lbl, (ax1, ax2, ay, albl, aabove) => makeDimH(p, ax1, ax2, ay, albl, aabove), false);
                }
                if (_hasMultiCols2 || _bpColumnHasHoneycomb(col)) {
                    _bpMaybePushColWidthDim(p, _bpViewKey, ci, cp.x1, cp.x2, oy + dH + 18,
                        `${_bpMm(cp.wCm)}`,
                        (x1, x2, y, lbl, above) => makeDimH(p, x1, x2, y, lbl, above), false, oy, dH);
                }
            });
        }
        makeDimV(p, ox - 54, oy, oy + dH, `${_bpMm(wg.h)}`);
        if (pH > 0) {
            makeDimV(p, ox + dW + 18, oy + dH - pH*sc, oy + dH, `${_bpMm(pH)}`);
        }
        // Split section dims for additional wing
        {
            const _splitColFC2 = cols.find(c => c.splitY && c.splitY > 0);
            if (_splitColFC2) {
                const _syFC2 = _splitColFC2.splitY;
                const _tFC2  = (state.thickness || 1.7) * 2;
                const _splitBotYFC2 = oy + dH - _syFC2 * sc;
                const _splitTopYFC2 = _splitBotYFC2 - _tFC2 * sc;
                const _colTopYFC2   = oy;
                makeDimV(p, ox + dW + 54, oy + dH - pH * sc, _splitBotYFC2, `${_bpMm((_syFC2 - pH))}`);
                makeDimV(p, ox + dW + 54, _splitTopYFC2, _colTopYFC2, `${_bpMm((wg.h - _syFC2 - _tFC2))}`);
            }
        }

        const _vkFCA = wg.wd === leftWing ? 'fc-left-extra' : 'fc-right-extra';
        _bpAppendViewCutouts(p, _vkFCA, ox, oy, dW, dH, sc, wg.w, wg.h);
        _bpFlushDims(p);
        pages.push({ label: wg.label, svgParts: p, viewKey: _vkFCA, cabWidthCm: wg.w, cabHeightCm: wg.h, viewMeta: { ox, oy, dW, dH, sc } });
    });

    // ---- Corner unit page (שולחן פינתי / שידת מגירות פינתית) ----
    if (state.corner && state.corner.side !== 'none') {
        const cu = state.corner;
        const cuW = cu.width  || 60;
        const cuH = cu.height || 90;
        const cuD = cu.depth  || cD;
        const cuSideLabel = cu.side === 'right' ? 'ימין' : 'שמאל';
        const cuTypeLabel = cu.type === 'desk' ? 'שולחן פינתי' : 'שידת מגירות פינתית';
        const cuLabel = `שרטוט חזית — ${cuTypeLabel} (${cuSideLabel})`;
        const cuFill = cu.type === 'desk' ? '#fef9c3' : '#f0fdf4';

        const p = [];
        _bpStartPage(cu.side === 'right' ? 'corner-right' : 'corner-left');
        const drawAreaY = 65;
        const drawAreaH = PAGE_H - drawAreaY - MARGIN - 80; // reserve 80px at bottom for dim labels
        const pw = SVG_W - MARGIN * 2;
        const sc = Math.min((pw - PAD*2) / Math.max(cuW, 1), (drawAreaH - PAD*2) / Math.max(cuH, 1));
        const dW = cuW * sc, dH = cuH * sc;
        const ox = MARGIN + (pw - dW) / 2;
        const oy = drawAreaY + (drawAreaH - dH) / 2;

        if (cu.type === 'desk') {
            _bpDrawCornerDeskFrontParts(
                p, cu, ox, oy, dW, dH, sc, STROKE, STROKE_THIN, FONT,
                function(x1, x2, y, lbl, above) { makeDimH(p, x1, x2, y, lbl, above); },
                function(x, y1, y2, lbl) { makeDimV(p, x, y1, y2, lbl); },
                function(x, y1, y2, lbl) { makeDimVLeft(p, x, y1, y2, lbl); }
            );
        } else {
            // Cabinet body
            makeRect(p, ox, oy, dW, dH, cuFill, STROKE, 2);
            // Plinth
            if (pH > 0) makeRect(p, ox, oy + dH - pH*sc, dW, pH*sc, '#cbd5e1', STROKE, 1);

            // Drawer unit: show drawers stacked
            const numDrawers = cu.drawerCount || 4;
            const innerH = cuH - pH - (state.thickness || 1.7) * 2; // subtract plinth and top/bottom boards
            const drawerH = (innerH - 0.4 * (numDrawers - 1)) / numDrawers;
            for (let di = 0; di < numDrawers; di++) {
                const drawerBotCm = pH + (state.thickness || 1.7) + di * (drawerH + 0.4);
                const drawerTopCm = drawerBotCm + drawerH;
                const dy1 = oy + dH - drawerTopCm * sc;
                const dy2 = oy + dH - drawerBotCm * sc;
                const dh = dy2 - dy1;
                makeRect(p, ox + 2, dy1 + 1, dW - 4, dh - 2, 'rgba(255,255,255,0.6)', STROKE_THIN, 0.8);
                // Handle
                const hndW = Math.min(dW * 0.4, 30);
                const hndX = ox + (dW - hndW) / 2;
                const hndY = dy1 + dh * 0.5;
                p.push(`<line x1="${hndX.toFixed(1)}" y1="${hndY.toFixed(1)}" x2="${(hndX+hndW).toFixed(1)}" y2="${hndY.toFixed(1)}" stroke="${STROKE}" stroke-width="2"/>`);
            }

            // Dimensions
            const dimY = oy + dH + 36;
            makeDimH(p, ox, ox + dW, dimY, `${_bpMm(cuW)}`);
            makeDimV(p, ox - 34, oy, oy + dH, `${_bpMm(cuH)}`);
            if (pH > 0) makeDimV(p, ox + dW + 18, oy + dH - pH*sc, oy + dH, `${_bpMm(pH)}`);
        }

        const _vkCU = cu.side === 'right' ? 'corner-right' : 'corner-left';
        _bpAppendViewCutouts(p, _vkCU, ox, oy, dW, dH, sc, cuW, cuH);
        _bpFlushDims(p);
        pages.push({ label: cuLabel, svgParts: p, viewKey: _vkCU, cabWidthCm: cuW, cabHeightCm: cuH, viewMeta: { ox, oy, dW, dH, sc } });
    }

    // ---- Side cabinet front-view pages ----
    {
        const scData = centerWing ? centerWing.sideCabinet : null;
        const hasSC = scData && scData.side !== 'none';
        if (hasSC) {
            const scSideVal = scData.side; // 'right', 'left', or 'both'
            const scH  = scData.globalHeight || cH;
            const scD  = scData.depth  || cD;
            const scPH = scData.plinthHeight || pH;
            const FILL_SC = '#e0f2fe'; // light blue

            const _drawSCPage = (sideLbl, scW, viewKey) => {
                const _bpViewKey = viewKey;
                const scLabel = `שרטוט חזית — ארון צד ${sideLbl}`;
                const p = [];
                _bpStartPage(_bpViewKey);
                const drawAreaY = 65;
                const drawAreaH = PAGE_H - drawAreaY - MARGIN - 80; // reserve 80px at bottom for dim labels
                const pw = SVG_W - MARGIN * 2;
                const scScale = Math.min((pw - PAD*2) / Math.max(scW, 1), (drawAreaH - PAD*2) / Math.max(scH, 1));
                const dW = scW * scScale, dH = scH * scScale;
                const ox = MARGIN + (pw - dW) / 2;
                const oy = drawAreaY + (drawAreaH - dH) / 2;

                // Cabinet body
                makeRect(p, ox, oy, dW, dH, FILL_SC, STROKE, 2);
                // Plinth
                if (scPH > 0) makeRect(p, ox, oy + dH - scPH*scScale, dW, scPH*scScale, '#cbd5e1', STROKE, 1);

                // Columns, shelves, hangers & drawers
                const cols = (scData.columns && scData.columns.length > 0) ? scData.columns : [];
                const colXPositions = [];
                let colX = ox;
                cols.forEach((col, ci) => {
                    const colW = (col.width || scW) * scScale;
                    const colPlinthH = col.noPlinth ? 0 : scPH;
                    colXPositions.push({ x1: colX, x2: colX + colW, wCm: (col.width != null ? col.width : scW) });

                    if (ci > 0) makeVline(p, colX, oy, oy + dH, scScale);
                    const _splitYSC = col.splitY || 0;
                    const _splitTSC = (state.thickness || 1.7) * 2;
                    (col.shelvesY || []).forEach(sy => {
                        if (_splitYSC > 0 && sy >= _splitYSC && sy <= _splitYSC + _splitTSC) return;
                        makeShelfLine(p, colX, oy + dH - sy*scScale, colX + colW, scScale);
                    });
                    _bpDrawTopBottomBoards(
                        function(x1, sy, x2) { makeShelfLine(p, x1, sy, x2, scScale); },
                        col, colX, colW, oy + dH, col.height || scH, colPlinthH, scScale
                    );

                    // Split band for side cabinet
                    if (_splitYSC > 0 && _splitYSC < (col.height || scH)) {
                        const _splitBotYSC = oy + dH - _splitYSC * scScale;
                        const _splitBandHSC = _splitTSC * scScale;
                        const _splitTopYSC = _splitBotYSC - _splitBandHSC;
                        _bpDrawSplitDoubleBand(function(x, y, w, h, f, s, sw) { makeRect(p, x, y, w, h, f, s, sw); }, colX, _splitTopYSC, colW, _splitBandHSC, STROKE);
                        if (ci === 0) {
                            const lowerMidSC = (_splitBotYSC + oy + dH) / 2;
                            const upperMidSC = (oy + _splitTopYSC) / 2;
                            p.push(`<text x="${(colX + 6).toFixed(1)}" y="${(lowerMidSC + 4).toFixed(1)}" font-family="${FONT}" font-size="11" fill="${STROKE}" opacity="0.5">ארון תחתון</text>`);
                            p.push(`<text x="${(colX + 6).toFixed(1)}" y="${(upperMidSC + 4).toFixed(1)}" font-family="${FONT}" font-size="11" fill="${STROKE}" opacity="0.5">ארון עליון</text>`);
                            p.push(`<text x="${(colX + colW / 2).toFixed(1)}" y="${(_splitTopYSC + _splitBandHSC / 2 + 3).toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="8" fill="${STROKE}" opacity="0.62">${_bpMm(_splitTSC)}</text>`);
                        }
                    }

                    const shelvesArr = (col.shelvesY || []).slice().sort((a,b) => a-b);
                    const _splitYSCAdj = _splitYSC;
                    const _splitTopSCAdj = _splitYSC > 0 ? _splitYSC + _splitTSC : 0;
                    const _rowBaseSC = _bpRowBaseCm(col, colPlinthH);
                    let _allBoundsSC = [...shelvesArr];
                    if (_splitYSC > _rowBaseSC && _splitYSC < scH) {
                        if (!_allBoundsSC.includes(_splitYSCAdj)) _allBoundsSC.push(_splitYSCAdj);
                        if (_splitTopSCAdj < scH && !_allBoundsSC.includes(_splitTopSCAdj)) _allBoundsSC.push(_splitTopSCAdj);
                        _allBoundsSC.sort((a,b) => a-b);
                    }
                    const rowBounds = [_rowBaseSC, ..._allBoundsSC.filter(sy => sy > _rowBaseSC), scH];
                    const numRows = rowBounds.length - 1;
                    const _t_shelfSC = state.thickness || 1.7;
                    for (let ri = 0; ri < numRows; ri++) {
                        const rowBotCm = rowBounds[ri];
                        const rowTopCm = rowBounds[ri + 1];
                        const cellHeightLabel = _bpClearCellHeightLabel(rowBotCm, rowTopCm, _t_shelfSC);
                        const cellY1 = oy + dH - rowTopCm * scScale;
                        const cellY2 = oy + dH - rowBotCm * scScale;
                        const cellH  = cellY2 - cellY1;
                        const cellCX = colX + colW / 2;

                        const comp = col.compartments ? col.compartments[ri] : null;
                        const cellType = comp ? (comp.type || 'empty') : 'empty';

                        if (cellType === 'hanging') {
                            const rodY  = _bpHangRodSvgY(cellY1, scScale);
                            const hRodX1 = colX + 4, hRodX2 = colX + colW - 4;
                            p.push(`<line x1="${hRodX1.toFixed(1)}" y1="${rodY.toFixed(1)}" x2="${hRodX2.toFixed(1)}" y2="${rodY.toFixed(1)}" stroke="${STROKE}" stroke-width="2"/>`);
                            p.push(`<circle cx="${hRodX1.toFixed(1)}" cy="${rodY.toFixed(1)}" r="2" fill="${STROKE}"/>`);
                            p.push(`<circle cx="${hRodX2.toFixed(1)}" cy="${rodY.toFixed(1)}" r="2" fill="${STROKE}"/>`);
                        } else if (cellType === 'sorbet') {
                            // סורבטו — מנגנון תלייה מתרומם (ממורכז אנכית בתא)
                            const mechH  = cellH * 0.5;
                            const mechY1 = cellY1 + (cellH - mechH) / 2;
                            const mechY2 = mechY1 + mechH;
                            const boxH   = Math.min(mechH * 0.2, 8);
                            const boxW   = Math.min(colW * 0.1, 7);
                            const boxY   = mechY2 - boxH;                 // בלוקי דיור בתחתית המנגנון
                            const boxLX  = colX + 4;
                            const boxRX  = colX + colW - 4 - boxW;
                            p.push(`<rect x="${boxLX.toFixed(1)}" y="${boxY.toFixed(1)}" width="${boxW.toFixed(1)}" height="${boxH.toFixed(1)}" fill="${STROKE}" rx="1"/>`);
                            p.push(`<rect x="${boxRX.toFixed(1)}" y="${boxY.toFixed(1)}" width="${boxW.toFixed(1)}" height="${boxH.toFixed(1)}" fill="${STROKE}" rx="1"/>`);
                            const hRodY  = mechY1;                        // מוט אופקי בראש המנגנון
                            const hRodX1 = boxLX + boxW / 2;
                            const hRodX2 = boxRX + boxW / 2;
                            p.push(`<line x1="${hRodX1.toFixed(1)}" y1="${hRodY.toFixed(1)}" x2="${hRodX2.toFixed(1)}" y2="${hRodY.toFixed(1)}" stroke="${STROKE}" stroke-width="2"/>`);
                            p.push(`<circle cx="${hRodX1.toFixed(1)}" cy="${hRodY.toFixed(1)}" r="2.5" fill="${STROKE}"/>`);
                            p.push(`<circle cx="${hRodX2.toFixed(1)}" cy="${hRodY.toFixed(1)}" r="2.5" fill="${STROKE}"/>`);
                            p.push(`<line x1="${(boxLX + boxW/2).toFixed(1)}" y1="${hRodY.toFixed(1)}" x2="${(boxLX + boxW/2).toFixed(1)}" y2="${boxY.toFixed(1)}" stroke="${STROKE}" stroke-width="1.5"/>`);
                            p.push(`<line x1="${(boxRX + boxW/2).toFixed(1)}" y1="${hRodY.toFixed(1)}" x2="${(boxRX + boxW/2).toFixed(1)}" y2="${boxY.toFixed(1)}" stroke="${STROKE}" stroke-width="1.5"/>`);
                            const handleW  = Math.min(colW * 0.07, 5);
                            const handleH  = mechH * 0.6;
                            const handleX  = (hRodX1 + hRodX2) / 2 - handleW / 2;
                            p.push(`<rect x="${handleX.toFixed(1)}" y="${hRodY.toFixed(1)}" width="${handleW.toFixed(1)}" height="${handleH.toFixed(1)}" fill="${STROKE}" rx="1" opacity="0.75"/>`);
                            if (cellH > 25) p.push(`<text x="${cellCX.toFixed(1)}" y="${(cellY1 + 10).toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="11" fill="${STROKE}" opacity="0.55">סורבטו</text>`);
                        } else if (cellType === 'internal_drawers' || cellType === 'external_drawers') {
                            const drawerCount = comp.count || 2;
                            const dh = cellH / drawerCount;
                            for (let di = 0; di < drawerCount; di++) {
                                const dy = cellY1 + di * dh;
                                makeRect(p, colX + 2, dy + 1, colW - 4, dh - 2, 'rgba(255,255,255,0.5)', STROKE_THIN, 0.8);
                                const hndW = Math.min(colW * 0.35, 22);
                                const hndX = colX + (colW - hndW) / 2;
                                const hndY = dy + dh * 0.5;
                                p.push(`<line x1="${hndX.toFixed(1)}" y1="${hndY.toFixed(1)}" x2="${(hndX+hndW).toFixed(1)}" y2="${hndY.toFixed(1)}" stroke="${STROKE}" stroke-width="1.8"/>`);
                            }
                        } else if (cellType === 'open_cell') {
                            const pad = 5;
                            const fx = colX + pad, fy = cellY1 + pad, fw = colW - pad*2, fh = cellH - pad*2;
                            if (fw > 2 && fh > 2) p.push(`<rect x="${fx.toFixed(1)}" y="${fy.toFixed(1)}" width="${fw.toFixed(1)}" height="${fh.toFixed(1)}" fill="none" stroke="${STROKE}" stroke-width="1.2"/>`);
                            if (cellH > 18) p.push(`<text x="${cellCX.toFixed(1)}" y="${(cellY1+20).toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="12" fill="${STROKE}" opacity="0.6">כוורת</text>`);
                        }

                        _bpDrawPartitionCell(p, {
                            comp, col, wgW: scW, colX, colW, cellY1, cellY2,
                            rowBotCm, rowTopCm, colBotSvgY: oy + dH, sc: scScale, ci, cols,
                            viewKey: _bpViewKey, ri, font: FONT, stroke: STROKE, strokeThin: STROKE_THIN,
                            vlineFn: function(x, y1, y2) { makeVline(p, x, y1, y2, scScale); },
                            shelfLineFn: function(x1, y, x2) { makeShelfLine(p, x1, y, x2, scScale); },
                            dimHFn: function(ax1, ax2, ay, albl, aabove) { makeDimH(p, ax1, ax2, ay, albl, aabove); },
                            makeRectP: makeRect,
                            makeShelfP: makeShelfLine
                        });

                        const _isSplitBandSC = _splitYSC > 0 &&
                            rowBotCm >= _splitYSCAdj - 0.1 && rowTopCm <= _splitTopSCAdj + 0.1;
                        const _hasPartSC = !!(comp && comp.partition && Array.isArray(comp.subCells) && comp.subCells.length);
                        if (_bpIsHoneycombType(cellType)) {
                            _bpMaybePushHoneycombInnerHeight(p, colX, cellY1, cellY2, rowBotCm, rowTopCm, scScale, _t_shelfSC, _bpViewKey, `c${ci}r${ri}hcH`);
                        } else if (cellHeightLabel > 0 && cellH > 14 && !_isSplitBandSC && !_hasPartSC) {
                            _bpPushCellDimLabel(p, _bpViewKey, `c${ci}r${ri}`, cellCX, (cellY1 + cellY2) / 2 + 4, cellHeightLabel,
                                { x: colX, y: cellY1, w: colW, h: cellH });
                        }
                    }
                    colX += colW;
                });

                // Dimension lines — all placed BELOW the plinth bottom
                const _hasMultiColsSC = colXPositions.length > 1;
                const _plinthBotYSC = oy + dH + scPH * scScale;
                const dimY = _plinthBotYSC + (_hasMultiColsSC ? 54 : 36);
                makeDimH(p, ox, ox + dW, dimY, `${_bpMm(scW)}`);
                {
                    const _tCmHCSc = state.thickness || 1.7;
                    colXPositions.forEach((cp, ci) => {
                        const col = cols[ci];
                        if (_bpColumnHasHoneycomb(col)) {
                            const inner = _bpHoneycombInnerSvgSpan(cp, scScale, _tCmHCSc);
                            if (inner) _bpMaybePushInnerWidthDim(p, _bpViewKey, 'hcInnerW:c' + ci, inner.x1, inner.x2, _plinthBotYSC + 6, inner.lbl, (ax1, ax2, ay, albl, aabove) => makeDimH(p, ax1, ax2, ay, albl, aabove), false);
                        }
                        if (_hasMultiColsSC || _bpColumnHasHoneycomb(col)) {
                            _bpMaybePushColWidthDim(p, _bpViewKey, ci, cp.x1, cp.x2, _plinthBotYSC + 18,
                                `${_bpMm(cp.wCm)}`,
                                (x1, x2, y, lbl, above) => makeDimH(p, x1, x2, y, lbl, above), false, oy, dH);
                        }
                    });
                }
                makeDimV(p, ox - 54, oy, oy + dH, `${_bpMm(scH)}`);
                if (scPH > 0) makeDimV(p, ox + dW + 18, oy + dH - scPH*scScale, oy + dH, `${_bpMm(scPH)}`);
                // Split section dims for side cabinet
                {
                    const _splitColSC2 = cols.find(c => c.splitY && c.splitY > 0);
                    if (_splitColSC2) {
                        const _sySC2 = _splitColSC2.splitY;
                        const _tSC2  = (state.thickness || 1.7) * 2;
                        const _splitBotYSC2 = oy + dH - _sySC2 * scScale;
                        const _splitTopYSC2 = _splitBotYSC2 - _tSC2 * scScale;
                        makeDimV(p, ox + dW + 54, oy + dH - scPH * scScale, _splitBotYSC2, `${_bpMm((_sySC2 - scPH))}`);
                        makeDimV(p, ox + dW + 54, _splitTopYSC2, oy, `${_bpMm((scH - _sySC2 - _tSC2))}`);
                    }
                }

                _bpAppendViewCutouts(p, viewKey, ox, oy, dW, dH, scScale, scW, scH);
                _bpFlushDims(p);
                pages.push({ label: scLabel, svgParts: p, viewKey: viewKey, cabWidthCm: scW, cabHeightCm: scH, viewMeta: { ox, oy, dW, dH, sc: scScale } });
            };

            if (scSideVal === 'right' || scSideVal === 'both') _drawSCPage('ימין',  scData.widthRight || scData.width || 40, 'side-cab-right');
            if (scSideVal === 'left'  || scSideVal === 'both') _drawSCPage('שמאל', scData.widthLeft  || scData.width || 40, 'side-cab-left');

            const _drawSCSideViewPage = (sideLbl, scSide, viewKey) => {
                const sideDepthCm = _bpSideCabinetSideDepthCm(centerWing, scSide);
                const camLbl = scSide === 'right' ? 'מימין' : 'משמאל';
                const scLabel = `שרטוט מבט צד — ארון צד ${sideLbl} (${camLbl})`;
                const _bpViewKey = viewKey;
                const p = [];
                _bpStartPage(_bpViewKey);
                const drawAreaY = 65;
                const drawAreaH = PAGE_H - drawAreaY - MARGIN - 80;
                const pw = SVG_W - MARGIN * 2;
                const scScale = Math.min((pw - PAD*2) / Math.max(sideDepthCm, 1), (drawAreaH - PAD*2) / Math.max(scH, 1));
                const dW = sideDepthCm * scScale;
                const dH = scH * scScale;
                const ox = MARGIN + (pw - dW) / 2;
                const oy = drawAreaY + (drawAreaH - dH) / 2;
                const frontX = ox + dW;
                const backX = ox;
                const doorTCm = scData.thickness || state.thickness || 1.7;
                const doorTPx = doorTCm * scScale;

                makeRect(p, ox, oy, dW, dH, FILL_SC, STROKE, 2);
                if (scPH > 0) makeRect(p, ox, oy + dH - scPH*scScale, dW, scPH*scScale, '#cbd5e1', STROKE, 1);

                const cols = (scData.columns && scData.columns.length > 0) ? scData.columns : [];
                const col = cols[0] || { shelvesY: [], compartments: [], height: scH };
                const colPlinthH = col.noPlinth ? 0 : scPH;
                const _splitYSC = col.splitY || 0;
                const _splitTSC = (state.thickness || 1.7) * 2;

                (col.shelvesY || []).forEach(sy => {
                    if (_splitYSC > 0 && sy >= _splitYSC && sy <= _splitYSC + _splitTSC) return;
                    makeShelfLine(p, ox, oy + dH - sy*scScale, ox + dW, scScale);
                });
                _bpDrawTopBottomBoards(
                    function(x1, sy, x2) { makeShelfLine(p, x1, sy, x2, scScale); },
                    col, ox, dW, oy + dH, col.height || scH, colPlinthH, scScale
                );

                if (_splitYSC > 0 && _splitYSC < (col.height || scH)) {
                    const _splitBotYSC = oy + dH - _splitYSC * scScale;
                    const _splitBandHSC = _splitTSC * scScale;
                    const _splitTopYSC = _splitBotYSC - _splitBandHSC;
                    _bpDrawSplitDoubleBand(function(x, y, w, h, f, s, sw) { makeRect(p, x, y, w, h, f, s, sw); }, ox, _splitTopYSC, dW, _splitBandHSC, STROKE);
                    const lowerMidSC = (_splitBotYSC + oy + dH) / 2;
                    const upperMidSC = (oy + _splitTopYSC) / 2;
                    p.push(`<text x="${(ox + 6).toFixed(1)}" y="${(lowerMidSC + 4).toFixed(1)}" font-family="${FONT}" font-size="11" fill="${STROKE}" opacity="0.5">ארון תחתון</text>`);
                    p.push(`<text x="${(ox + 6).toFixed(1)}" y="${(upperMidSC + 4).toFixed(1)}" font-family="${FONT}" font-size="11" fill="${STROKE}" opacity="0.5">ארון עליון</text>`);
                }

                const shelvesArr = (col.shelvesY || []).slice().sort((a,b) => a-b);
                const _splitYSCAdj = _splitYSC;
                const _splitTopSCAdj = _splitYSC > 0 ? _splitYSC + _splitTSC : 0;
                const _rowBaseSC = _bpRowBaseCm(col, colPlinthH);
                let _allBoundsSC = [...shelvesArr];
                if (_splitYSC > _rowBaseSC && _splitYSC < scH) {
                    if (!_allBoundsSC.includes(_splitYSCAdj)) _allBoundsSC.push(_splitYSCAdj);
                    if (_splitTopSCAdj < scH && !_allBoundsSC.includes(_splitTopSCAdj)) _allBoundsSC.push(_splitTopSCAdj);
                    _allBoundsSC.sort((a,b) => a-b);
                }
                const rowBounds = [_rowBaseSC, ..._allBoundsSC.filter(sy => sy > _rowBaseSC), scH];
                const numRows = rowBounds.length - 1;
                const _t_shelfSC = state.thickness || 1.7;
                const cellCX = ox + dW / 2;

                for (let ri = 0; ri < numRows; ri++) {
                    const rowBotCm = rowBounds[ri];
                    const rowTopCm = rowBounds[ri + 1];
                    const cellHeightLabel = _bpClearCellHeightLabel(rowBotCm, rowTopCm, _t_shelfSC);
                    const cellY1 = oy + dH - rowTopCm * scScale;
                    const cellY2 = oy + dH - rowBotCm * scScale;
                    const cellH  = cellY2 - cellY1;
                    const comp = col.compartments ? col.compartments[ri] : null;
                    const cellType = comp ? (comp.type || 'empty') : 'empty';

                    if (cellType === 'hanging') {
                        const rodY = _bpHangRodSvgY(cellY1, scScale);
                        p.push(`<line x1="${(ox + 4).toFixed(1)}" y1="${rodY.toFixed(1)}" x2="${(ox + dW - 4).toFixed(1)}" y2="${rodY.toFixed(1)}" stroke="${STROKE}" stroke-width="2"/>`);
                    } else if (cellType === 'internal_drawers' || cellType === 'external_drawers') {
                        const drawerCount = comp.count || 2;
                        const dh = cellH / drawerCount;
                        for (let di = 0; di < drawerCount; di++) {
                            const dy = cellY1 + di * dh;
                            makeRect(p, ox + 2, dy + 1, dW - 4, dh - 2, 'rgba(255,255,255,0.5)', STROKE_THIN, 0.8);
                            const hndW = Math.min(dW * 0.35, 22);
                            const hndX = ox + (dW - hndW) / 2;
                            const hndY = dy + dh * 0.5;
                            p.push(`<line x1="${hndX.toFixed(1)}" y1="${hndY.toFixed(1)}" x2="${(hndX+hndW).toFixed(1)}" y2="${hndY.toFixed(1)}" stroke="${STROKE}" stroke-width="1.8"/>`);
                        }
                    } else if (cellType === 'open_cell') {
                        const pad = 5;
                        const fx = ox + pad, fy = cellY1 + pad, fw = dW - pad*2, fh = cellH - pad*2;
                        if (fw > 2 && fh > 2) p.push(`<rect x="${fx.toFixed(1)}" y="${fy.toFixed(1)}" width="${fw.toFixed(1)}" height="${fh.toFixed(1)}" fill="none" stroke="${STROKE}" stroke-width="1.2"/>`);
                        if (cellH > 18) p.push(`<text x="${cellCX.toFixed(1)}" y="${(cellY1+20).toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="12" fill="${STROKE}" opacity="0.6">כוורת</text>`);
                    } else if (cellType === 'side_open_cell') {
                        const pad = 5;
                        const fx = ox + pad, fy = cellY1 + pad, fw = dW - pad*2, fh = cellH - pad*2;
                        if (fw > 2 && fh > 2) {
                            p.push(`<rect x="${fx.toFixed(1)}" y="${fy.toFixed(1)}" width="${fw.toFixed(1)}" height="${fh.toFixed(1)}" fill="none" stroke="${STROKE}" stroke-width="1.2" stroke-dasharray="5,3"/>`);
                        }
                        if (cellH > 18) p.push(`<text x="${cellCX.toFixed(1)}" y="${(cellY1+20).toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="12" fill="${STROKE}" opacity="0.6">כוורת צד</text>`);
                    }

                    const hasDoor = scData.hasDoors !== false && col.doors && col.doors.some(d => ri >= d.startRow && ri <= d.endRow);
                    if (hasDoor && doorTPx > 0.5) {
                        makeRect(p, frontX - doorTPx, cellY1 + 1, doorTPx, cellH - 2, 'rgba(255,255,255,0.65)', STROKE_THIN, 1);
                    }

                    const _isSplitBandSC = _splitYSC > 0 &&
                        rowBotCm >= _splitYSCAdj - 0.1 && rowTopCm <= _splitTopSCAdj + 0.1;
                    if (_bpIsHoneycombType(cellType)) {
                        _bpMaybePushHoneycombInnerHeight(p, ox, cellY1, cellY2, rowBotCm, rowTopCm, scScale, _t_shelfSC, _bpViewKey, `svc0r${ri}hcH`);
                    } else if (cellHeightLabel > 0 && cellH > 14 && !_isSplitBandSC) {
                        _bpPushCellDimLabel(p, _bpViewKey, `svc0r${ri}`, cellCX, (cellY1 + cellY2) / 2 + 4, cellHeightLabel,
                            { x: ox, y: cellY1, w: dW, h: cellH });
                    }
                }

                p.push(`<text x="${frontX.toFixed(1)}" y="${(oy + dH + 18).toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="11" fill="${STROKE}" opacity="0.55">חזית</text>`);
                p.push(`<text x="${backX.toFixed(1)}" y="${(oy + dH + 18).toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="11" fill="${STROKE}" opacity="0.55">קיר</text>`);

                const _plinthBotYSC = oy + dH + scPH * scScale;
                const dimY = _plinthBotYSC + 36;
                makeDimH(p, ox, ox + dW, dimY, `${_bpMm(sideDepthCm)}`);
                makeDimV(p, ox - 54, oy, oy + dH, `${_bpMm(scH)}`);
                if (scPH > 0) makeDimV(p, ox + dW + 18, oy + dH - scPH*scScale, oy + dH, `${_bpMm(scPH)}`);
                if (_splitYSC > 0) {
                    const _splitBotYSC2 = oy + dH - _splitYSC * scScale;
                    const _splitTopYSC2 = _splitBotYSC2 - _splitTSC * scScale;
                    makeDimV(p, ox + dW + 54, oy + dH - scPH * scScale, _splitBotYSC2, `${_bpMm((_splitYSC - scPH))}`);
                    makeDimV(p, ox + dW + 54, _splitTopYSC2, oy, `${_bpMm((scH - _splitYSC - _splitTSC))}`);
                }

                _bpAppendViewCutouts(p, viewKey, ox, oy, dW, dH, scScale, sideDepthCm, scH);
                _bpFlushDims(p);
                pages.push({ label: scLabel, svgParts: p, viewKey: viewKey, cabWidthCm: sideDepthCm, cabHeightCm: scH, viewMeta: { ox, oy, dW, dH, sc: scScale } });
            };

            if (scSideVal === 'right' || scSideVal === 'both') _drawSCSideViewPage('ימין', 'right', 'side-cab-right-profile');
            if (scSideVal === 'left'  || scSideVal === 'both') _drawSCSideViewPage('שמאל', 'left', 'side-cab-left-profile');
        }
    }

    // ---- Side desk front-view page ----
    {
        const deskData = _bpCenterSideDesk(centerWing);
        if (deskData) {
            const dWidth = deskData.width || 100;
            const dHeight = deskData.height || 75;
            const dSideLbl = deskData.side === 'left' ? 'שמאל' : 'ימין';
            const p = [];
            _bpStartPage('side-desk');
            const drawAreaY = 65;
            const drawAreaH = PAGE_H - drawAreaY - MARGIN - 80;
            const pw = SVG_W - MARGIN * 2;
            const scScale = Math.min((pw - PAD*2) / Math.max(dWidth, 1), (drawAreaH - PAD*2) / Math.max(dHeight, 1));
            const dW = dWidth * scScale;
            const dH = dHeight * scScale;
            const oxDesk = MARGIN + (pw - dW) / 2;
            const oy = drawAreaY + (drawAreaH - dH) / 2;
            const attachOx = deskData.side === 'right' ? oxDesk : (oxDesk + dW);
            _bpDrawSideDeskFrontParts(p, deskData, attachOx, oy, 0, dH, scScale, '#fed7aa', STROKE, STROKE_THIN, FONT, (x1, x2, y, lbl) => makeDimH(p, x1, x2, y, lbl), (x, y1, y2, lbl) => makeDimV(p, x, y1, y2, lbl), (x, y1, y2, lbl) => makeDimVLeft(p, x, y1, y2, lbl));
            _bpAppendViewCutouts(p, 'side-desk', oxDesk, oy, dW, dH, scScale, dWidth, dHeight);
            _bpFlushDims(p);
            pages.push({ label: `שרטוט חזית — שולחן צד ${dSideLbl}`, svgParts: p, viewKey: 'side-desk', cabWidthCm: dWidth, cabHeightCm: dHeight, viewMeta: { ox: oxDesk, oy, dW, dH, sc: scScale } });
        }
    }

    // ---- SLIDING WARDROBE BLUEPRINT PAGE ----
    if (state.presetId === 'sliding') {
        const wing = state.wings.center;
        if (wing && wing.slidingDoor && wing.slidingDoor.enabled) {
            const sd = wing.slidingDoor;
            const p = [];
            _bpStartPage('sliding');
            const drawAreaY = 65;
            const drawAreaH = PAGE_H - drawAreaY - MARGIN;
            const pw = SVG_W - MARGIN * 2;

            const sdW = wing.width;
            const sdH = wing.globalHeight;
            const sdPlinth = wing.plinthHeight || 7;
            const sdNumDoors = sd.numDoors || 2;
            const sdDoorW = sdW / sdNumDoors;
            const profileT = 3.5;

            // Scale to fit
            const scaleX = (pw - PAD * 2) / Math.max(sdW, 1);
            const scaleY = (drawAreaH - PAD * 2) / Math.max(sdH, 1);
            const sc = Math.min(scaleX, scaleY);
            const ox = MARGIN + (pw - sdW * sc) / 2;
            const oy = drawAreaY + (drawAreaH - sdH * sc) / 2;

            // Panel border
            p.push(`<rect x="${MARGIN}" y="${drawAreaY}" width="${pw}" height="${drawAreaH}" rx="4" fill="white" stroke="${STROKE_THIN}" stroke-width="1"/>`);

            // Cabinet body (background)
            makeRect(p, ox, oy, sdW * sc, sdH * sc, FILL_CAB, STROKE, 2);

            // Plinth (bottom rail)
            makeRect(p, ox, oy + (sdH - sdPlinth) * sc, sdW * sc, sdPlinth * sc, '#c8c8c8', STROKE, 1.5);
            p.push(`<text x="${(ox + sdW * sc / 2).toFixed(1)}" y="${(oy + (sdH - sdPlinth / 2) * sc + 4).toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="13" fill="${STROKE}">צוקל ${_bpMm(sdPlinth)} מ"מ</text>`);

            // Top rail
            makeRect(p, ox, oy, sdW * sc, profileT * sc, '#c8c8c8', STROKE, 1.5);

            // Left profile
            makeRect(p, ox, oy, profileT * sc, sdH * sc, '#aaaaaa', STROKE, 1.5);
            // Right profile
            makeRect(p, ox + (sdW - profileT) * sc, oy, profileT * sc, sdH * sc, '#aaaaaa', STROKE, 1.5);

            // Doors
            const doorAreaW = sdW - profileT * 2;
            const doorAreaH = sdH - sdPlinth - profileT;
            const doorW = doorAreaW / sdNumDoors;
            const doorColors = ['#e8e8e8', '#d8d8d8']; // alternating tracks

            for (let i = 0; i < sdNumDoors; i++) {
                const dx = ox + (profileT + doorW * i) * sc;
                const dy = oy + profileT * sc;
                const dw = doorW * sc;
                const dh = doorAreaH * sc;
                const fillColor = doorColors[i % 2];
                makeRect(p, dx, dy, dw, dh, fillColor, STROKE, 1);

                // Door panel type label
                const panelLabel = sd.doorPanelType === 'glass' ? 'זכוכית' : sd.doorPanelType === 'mirror' ? 'מראה' : sd.doorPanelType === 'mirror_dark' ? 'מראה כהה' : 'חלק';
                p.push(`<text x="${(dx + dw / 2).toFixed(1)}" y="${(dy + dh / 2).toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="14" fill="${STROKE}" opacity="0.7">${panelLabel}</text>`);

                // Vertical divider if door > 110cm
                if (doorW > 110) {
                    const divX = dx + (doorW * 2 / 3) * sc;
                    p.push(`<line x1="${divX.toFixed(1)}" y1="${dy.toFixed(1)}" x2="${divX.toFixed(1)}" y2="${(dy + dh).toFixed(1)}" stroke="${STROKE}" stroke-width="1.5" stroke-dasharray="4,3"/>`);
                    p.push(`<text x="${(divX + 4).toFixed(1)}" y="${(dy + dh / 2).toFixed(1)}" font-family="${FONT}" font-size="12" fill="${STROKE}" opacity="0.6">מחיצה</text>`);
                }
            }

            // Dimension lines
            // Total width
            makeDimH(p, ox, ox + sdW * sc, oy + sdH * sc + 36, `${_bpMm(sdW)} מ"מ`);
            // Total height
            makeDimV(p, ox - 40, oy, oy + sdH * sc, `${_bpMm(sdH)} מ"מ`);
            // Plinth height
            makeDimV(p, ox + sdW * sc + 18, oy + (sdH - sdPlinth) * sc, oy + sdH * sc, `${_bpMm(sdPlinth)} מ"מ`);
            // Door widths
            for (let i = 0; i < sdNumDoors; i++) {
                const dx1 = ox + (profileT + doorW * i) * sc;
                const dx2 = dx1 + doorW * sc;
                makeDimH(p, dx1, dx2, oy - 16, `${_bpMm(doorW)}`);
            }

            // Info text: profile color + panel type
            const profileColorHeb = { nickel: 'ניקל מוברש', black: 'שחור', white: 'לבן', cream: 'שמנת', gold_matte: 'זהב מט' };
            const panelTypeHeb = { solid: 'חלק', glass: 'זכוכית', mirror: 'מראה', mirror_dark: 'מראה כהה' };
            p.push(`<text x="${(MARGIN + 10).toFixed(1)}" y="${(PAGE_H - MARGIN - 30).toFixed(1)}" font-family="${FONT}" font-size="11" fill="${STROKE}">פרזול: ${profileColorHeb[sd.profileColor] || sd.profileColor} | פנל: ${panelTypeHeb[sd.doorPanelType] || sd.doorPanelType} | ${sdNumDoors} דלתות</text>`);

            const _sdDW = sdW * sc, _sdDH = sdH * sc;
            _bpAppendViewCutouts(p, 'sliding', ox, oy, _sdDW, _sdDH, sc, sdW, sdH);
            _bpFlushDims(p);
            pages.push({ label: 'ארון הזזה — חזית', svgParts: p, viewKey: 'sliding', cabWidthCm: sdW, cabHeightCm: sdH, viewMeta: { ox, oy, dW: _sdDW, dH: _sdDH, sc } });
        }
    }

    // ---- Upper Unit pages (ארון עליון) ----
    // Each wing can have an upper unit stored as state.wings['upperUnit_'+wingId]
    // These are completely separate cabinets rendered above the main cabinet.
    Object.keys(state.wings).forEach(function(uuKey) {
        if (!uuKey.startsWith('upperUnit_')) return;
        const uuWing = state.wings[uuKey];
        if (!uuWing) return;
        const parentId = uuKey.replace('upperUnit_', '');
        const parentLabelMap = { center: 'ארון מרכזי', left: 'כנף שמאל', right: 'כנף ימין' };
        const parentLabel = parentLabelMap[parentId] || parentId;
        const uuLabel = `שרטוט חזית — ארון עליון (${parentLabel})`;

        const uuCols = (uuWing.columns && uuWing.columns.length > 0) ? uuWing.columns : [];
        const uuW = uuWing.width || (uuCols.length > 0 ? uuCols.reduce((s,c) => s + (c.width||0), 0) + (state.thickness||1.7)*2 : cW);
        const uuH = uuCols.length > 0 ? Math.max(...uuCols.map(c => c.height || 40)) : (uuWing.globalHeight || 40);
        const uuPH = 0; // upper units have no plinth (noPlinth: true)
        const uuFill = '#f0f9ff'; // light sky blue for upper unit
        const _bpViewKey = 'upper-' + parentId;

        const p = [];
        _bpStartPage(_bpViewKey);
        const drawAreaY = 65;
        const drawAreaH = PAGE_H - drawAreaY - MARGIN - 80; // reserve 80px at bottom for dim labels
        const pw = SVG_W - MARGIN * 2;
        const sc = Math.min((pw - PAD*2) / Math.max(uuW, 1), (drawAreaH - PAD*2) / Math.max(uuH, 1));
        const dW = uuW * sc, dH = uuH * sc;
        const ox = MARGIN + (pw - dW) / 2;
        const oy = drawAreaY + (drawAreaH - dH) / 2;

        // Cabinet body
        makeRect(p, ox, oy, dW, dH, uuFill, STROKE, 2);

        // Columns, shelves, hangers & drawers
        const colXPositions = [];
        let colX = ox;
        uuCols.forEach((col, ci) => {
            const isLastCol = (ci === uuCols.length - 1);
            const colW = isLastCol ? (ox + dW - colX) : (col.width || uuW) * sc;
            colXPositions.push({ x1: colX, x2: colX + colW, wCm: (col.width != null ? col.width : uuW) });

            if (ci > 0) makeVline(p, colX, oy, oy + dH, sc);

            // Shelf lines
            (col.shelvesY || []).forEach(sy => {
                makeShelfLine(p, colX, oy + dH - sy*sc, colX + colW, sc);
            });
            // Upper unit: no plinth — bottom + top boards (17mm)
            _bpDrawTopBottomBoards(
                function(x1, sy, x2) { makeShelfLine(p, x1, sy, x2, sc); },
                Object.assign({}, col, { noPlinth: true }),
                colX, colW, oy + dH, col.height || uuH, 0, sc
            );

            // Cell height labels
            const shelvesArr = (col.shelvesY || []).slice().sort((a,b) => a-b);
            const rowBounds = [0, ...shelvesArr.filter(sy => sy > 0 && sy < uuH), uuH];
            const _t_shelfUU = state.thickness || 1.7;
            for (let ri = 0; ri < rowBounds.length - 1; ri++) {
                const rowBotCm = rowBounds[ri];
                const rowTopCm = rowBounds[ri + 1];
                const cellHeightLabel = _bpClearCellHeightLabel(rowBotCm, rowTopCm, _t_shelfUU);
                const cellY1 = oy + dH - rowTopCm * sc;
                const cellY2 = oy + dH - rowBotCm * sc;
                const cellH = cellY2 - cellY1;
                const cellCX = colX + colW / 2;

                const comp = col.compartments ? col.compartments[ri] : null;
                const cellType = comp ? (comp.type || 'empty') : 'empty';

                if (cellType === 'hanging') {
                    const rodY = _bpHangRodSvgY(cellY1, sc);
                    const hRodX1 = colX + 4, hRodX2 = colX + colW - 4;
                    p.push(`<line x1="${hRodX1.toFixed(1)}" y1="${rodY.toFixed(1)}" x2="${hRodX2.toFixed(1)}" y2="${rodY.toFixed(1)}" stroke="${STROKE}" stroke-width="2"/>`);
                    p.push(`<circle cx="${hRodX1.toFixed(1)}" cy="${rodY.toFixed(1)}" r="2" fill="${STROKE}"/>`);
                    p.push(`<circle cx="${hRodX2.toFixed(1)}" cy="${rodY.toFixed(1)}" r="2" fill="${STROKE}"/>`);
                } else if (cellType === 'internal_drawers' || cellType === 'external_drawers') {
                    const drawerCount = comp.count || 2;
                    const dh = cellH / drawerCount;
                    for (let di = 0; di < drawerCount; di++) {
                        const dy = cellY1 + di * dh;
                        makeRect(p, colX + 2, dy + 1, colW - 4, dh - 2, 'rgba(255,255,255,0.5)', STROKE_THIN, 0.8);
                        const hndW = Math.min(colW * 0.35, 22);
                        const hndX = colX + (colW - hndW) / 2;
                        const hndY = dy + dh * 0.5;
                        p.push(`<line x1="${hndX.toFixed(1)}" y1="${hndY.toFixed(1)}" x2="${(hndX+hndW).toFixed(1)}" y2="${hndY.toFixed(1)}" stroke="${STROKE}" stroke-width="1.8"/>`);
                    }
                } else if (cellType === 'open_cell') {
                    const pad = 5;
                    const fx = colX + pad, fy = cellY1 + pad, fw = colW - pad*2, fh = cellH - pad*2;
                    if (fw > 2 && fh > 2) p.push(`<rect x="${fx.toFixed(1)}" y="${fy.toFixed(1)}" width="${fw.toFixed(1)}" height="${fh.toFixed(1)}" fill="none" stroke="${STROKE}" stroke-width="1.2"/>`);
                    if (cellH > 18) p.push(`<text x="${cellCX.toFixed(1)}" y="${(cellY1+20).toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="12" fill="${STROKE}" opacity="0.6">כוורת</text>`);
                }

                _bpDrawPartitionCell(p, {
                    comp, col, wgW: uuW, colX, colW, cellY1, cellY2,
                    rowBotCm, rowTopCm, colBotSvgY: oy + dH, sc, ci, cols: uuCols,
                    viewKey: _bpViewKey, ri, font: FONT, stroke: STROKE, strokeThin: STROKE_THIN,
                    vlineFn: function(x, y1, y2) { makeVline(p, x, y1, y2, sc); },
                    shelfLineFn: function(x1, y, x2) { makeShelfLine(p, x1, y, x2, sc); },
                    dimHFn: function(ax1, ax2, ay, albl, aabove) { makeDimH(p, ax1, ax2, ay, albl, aabove); },
                    makeRectP: makeRect,
                    makeShelfP: makeShelfLine
                });

                if (_bpIsHoneycombType(cellType)) {
                    _bpMaybePushHoneycombInnerHeight(p, colX, cellY1, cellY2, rowBotCm, rowTopCm, sc, _t_shelfUU, _bpViewKey, `c${ci}r${ri}hcH`);
                } else if (cellHeightLabel > 0 && cellH > 14 && !(comp && comp.partition && Array.isArray(comp.subCells) && comp.subCells.length)) {
                    _bpPushCellDimLabel(p, _bpViewKey, `c${ci}r${ri}`, cellCX, (cellY1 + cellY2) / 2 + 4, cellHeightLabel,
                        { x: colX, y: cellY1, w: colW, h: cellH });
                }
            }
            colX += colW;
        });

        // Dimension lines — upper unit has no plinth, so just use oy+dH as base
        const _hasMultiColsUU = colXPositions.length > 1;
        const dimY = oy + dH + (_hasMultiColsUU ? 54 : 36);
        makeDimH(p, ox, ox + dW, dimY, `${_bpMm(uuW)}`);
        {
            const _tCmHCUu = state.thickness || 1.7;
            colXPositions.forEach((cp, ci) => {
                const col = uuCols[ci];
                if (_bpColumnHasHoneycomb(col)) {
                    const inner = _bpHoneycombInnerSvgSpan(cp, sc, _tCmHCUu);
                    if (inner) _bpMaybePushInnerWidthDim(p, _bpViewKey, 'hcInnerW:c' + ci, inner.x1, inner.x2, oy + dH + 6, inner.lbl, (ax1, ax2, ay, albl, aabove) => makeDimH(p, ax1, ax2, ay, albl, aabove), false);
                }
                if (_hasMultiColsUU || _bpColumnHasHoneycomb(col)) {
                    _bpMaybePushColWidthDim(p, _bpViewKey, ci, cp.x1, cp.x2, oy + dH + 18,
                        `${_bpMm(cp.wCm)}`,
                        (x1, x2, y, lbl, above) => makeDimH(p, x1, x2, y, lbl, above), false, oy, dH);
                }
            });
        }
        makeDimV(p, ox - 54, oy, oy + dH, `${_bpMm(uuH)}`);
        // Gap label (distance between upper unit and main cabinet)
        const uuGap = uuWing._upperGap || 60;
        p.push(`<text x="${(ox + dW + 14).toFixed(1)}" y="${(oy + dH + 14).toFixed(1)}" font-family="${FONT}" font-size="13" fill="${STROKE}" opacity="0.7">מרווח מהארון: ${_bpMm(uuGap)} מ"מ</text>`);

        const _vkUU = 'upper-' + parentId;
        _bpAppendViewCutouts(p, _vkUU, ox, oy, dW, dH, sc, uuW, uuH);
        _bpFlushDims(p);
        pages.push({ label: uuLabel, svgParts: p, viewKey: _vkUU, cabWidthCm: uuW, cabHeightCm: uuH, viewMeta: { ox, oy, dW, dH, sc } });
    });

    // ---- WRITING DESK BLUEPRINT PAGES ----
    if (pid === 'writing-desk') {
        const wdData = _bpCenterWritingDesk(centerWing);
        if (wdData) {
            const dWidth = wdData.width;
            const dDepth = wdData.depth;
            const dHeight = wdData.height;
            const FILL_WD = '#e8f0fe';

            // Front view
            {
                const p = [];
                _bpStartPage('writing-desk-front');
                const drawAreaY = 65;
                const drawAreaH = PAGE_H - drawAreaY - MARGIN - 80;
                const pw = SVG_W - MARGIN * 2;
                const scScale = Math.min((pw - PAD*2) / Math.max(dWidth, 1), (drawAreaH - PAD*2) / Math.max(dHeight, 1));
                const dW = dWidth * scScale;
                const dH = dHeight * scScale;
                const oxDesk = MARGIN + (pw - dW) / 2;
                const oy = drawAreaY + (drawAreaH - dH) / 2;
                p.push(`<rect x="${MARGIN}" y="${drawAreaY}" width="${pw}" height="${drawAreaH}" rx="4" fill="white" stroke="${STROKE_THIN}" stroke-width="1"/>`);
                _bpDrawWritingDeskFrontParts(p, wdData, oxDesk, oy, dW, dH, scScale, FILL_WD, STROKE, STROKE_THIN, FONT, (x1, x2, y, lbl, above) => makeDimH(p, x1, x2, y, lbl, above), (x, y1, y2, lbl) => makeDimV(p, x, y1, y2, lbl), (x, y1, y2, lbl) => makeDimVLeft(p, x, y1, y2, lbl));
                _bpAppendViewCutouts(p, 'writing-desk-front', oxDesk, oy, dW, dH, scScale, dWidth, dHeight);
                _bpFlushDims(p);
                pages.push({ label: 'שרטוט חזית — שולחן כתיבה', svgParts: p, viewKey: 'writing-desk-front', cabWidthCm: dWidth, cabHeightCm: dHeight, viewMeta: { ox: oxDesk, oy, dW, dH, sc: scScale } });
            }

            // Side profile
            {
                const p = [];
                _bpStartPage('writing-desk-side');
                const drawAreaY = 65;
                const drawAreaH = PAGE_H - drawAreaY - MARGIN - 80;
                const pw = SVG_W - MARGIN * 2;
                const scScale = Math.min((pw - PAD*2) / Math.max(dDepth, 1), (drawAreaH - PAD*2) / Math.max(dHeight, 1));
                const dW = dDepth * scScale;
                const dH = dHeight * scScale;
                const oxDesk = MARGIN + (pw - dW) / 2;
                const oy = drawAreaY + (drawAreaH - dH) / 2;
                p.push(`<rect x="${MARGIN}" y="${drawAreaY}" width="${pw}" height="${drawAreaH}" rx="4" fill="white" stroke="${STROKE_THIN}" stroke-width="1"/>`);
                _bpDrawWritingDeskSideParts(p, wdData, oxDesk, oy, dW, dH, scScale, FILL_WD, STROKE, STROKE_THIN, FONT, (x1, x2, y, lbl, above) => makeDimH(p, x1, x2, y, lbl, above), (x, y1, y2, lbl) => makeDimV(p, x, y1, y2, lbl), (x, y1, y2, lbl) => makeDimVLeft(p, x, y1, y2, lbl));
                _bpAppendViewCutouts(p, 'writing-desk-side', oxDesk, oy, dW, dH, scScale, dDepth, dHeight);
                _bpFlushDims(p);
                pages.push({ label: 'שרטוט מבט צד — שולחן כתיבה', svgParts: p, viewKey: 'writing-desk-side', cabWidthCm: dDepth, cabHeightCm: dHeight, viewMeta: { ox: oxDesk, oy, dW, dH, sc: scScale } });
            }

            // Remove empty generic center-cabinet front page (no columns on writing desk)
            const _emptyCenterIdx = pages.findIndex(pg => pg.label && pg.label.includes('ארון מרכזי'));
            if (_emptyCenterIdx >= 0) pages.splice(_emptyCenterIdx, 1);
        }
    }

    // Reorder: front views first, top view (מבט עליון) last
    const topViewIdx = pages.findIndex(pg => pg.label && pg.label.includes('מבט עליון'));
    if (topViewIdx >= 0) {
        const topPage = pages.splice(topViewIdx, 1)[0];
        pages.push(topPage);
    }

    // Wrap each page into a full SVG string
    const total = pages.length;
    return pages.map((pg, i) => ({
        label: pg.label,
        viewKey: pg.viewKey || null,
        cabWidthCm: pg.cabWidthCm || 0,
        cabHeightCm: pg.cabHeightCm || 0,
        viewMeta: pg.viewMeta || null,
        svg: wrapSVG(pg.svgParts, pg.label, i + 1, total)
    }));
};

function addBlueprintSprites() {
    // Clear old sprites from cabinetGroup (none added now — overlay handles it)
    // Show/hide the blueprint overlay layer
    const bpLayer = document.getElementById('blueprint-layer');
    if (!bpLayer) return;
    if (state.viewMode !== 'blueprint') {
        bpLayer.style.display = 'none';
        bpLayer.innerHTML = '';
        return;
    }
    bpLayer.style.display = 'block';
    // Render after a short delay so Three.js has finished its first render
    // and we can project coordinates accurately
    requestAnimationFrame(() => _renderBlueprintOverlay());
}

function _project3Dto2D(x3d, y3d, z3d) {
    // Project a 3D world point to 2D canvas pixel coordinates
    const vec = new THREE.Vector3(x3d, y3d, z3d);
    vec.project(camera); // NDC: -1..1
    const cw = renderer.domElement.clientWidth;
    const ch = renderer.domElement.clientHeight;
    return {
        x: (vec.x + 1) / 2 * cw,
        y: (-vec.y + 1) / 2 * ch
    };
}

function _renderBlueprintOverlay() {
    if (state.viewMode !== 'blueprint') return;
    const bpLayer = document.getElementById('blueprint-layer');
    if (!bpLayer) return;

    const cw = renderer.domElement.clientWidth;
    const ch = renderer.domElement.clientHeight;

    // SVG arrowhead marker size
    const ARROW = 7;
    const STROKE = '#1e3a5f';
    const STROKE_W = 1.5;
    const FONT = "13px 'Rubik', Tahoma, sans-serif";
    const FONT_BOLD = "bold 13px 'Rubik', Tahoma, sans-serif";
    const EXT_OFFSET = 6;   // gap between cabinet edge and extension line start
    const DIM_OFFSET = 22;  // how far the dimension line sits from the cabinet edge

    let svgParts = [];

    // SVG defs: arrowhead markers
    svgParts.push(`<defs>
      <marker id="arr-end" markerWidth="${ARROW}" markerHeight="${ARROW}" refX="${ARROW-1}" refY="${ARROW/2}" orient="auto">
        <path d="M0,0 L0,${ARROW} L${ARROW},${ARROW/2} z" fill="${STROKE}"/>
      </marker>
      <marker id="arr-start" markerWidth="${ARROW}" markerHeight="${ARROW}" refX="1" refY="${ARROW/2}" orient="auto">
        <path d="M${ARROW},0 L${ARROW},${ARROW} L0,${ARROW/2} z" fill="${STROKE}"/>
      </marker>
    </defs>`);

    state.bpData.forEach(d => {
        if (d.type === 'num') {
            // Cell number badge — small circle with number
            const p = _project3Dto2D(d.x, d.y, 2);
            const r = 11;
            svgParts.push(`
              <circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${r}" fill="white" stroke="#94a3b8" stroke-width="1.2"/>
              <text x="${p.x.toFixed(1)}" y="${(p.y + 1).toFixed(1)}" text-anchor="middle" dominant-baseline="middle"
                font-family="'Rubik',Tahoma,sans-serif" font-size="11" font-weight="bold" fill="#475569">${d.val}</text>
            `);

        } else if (d.type === 'width') {
            // Horizontal dimension line below the cabinet/column
            // d.x = center X of column, d.y = Y position (negative = below cabinet)
            // We need left and right edges — stored as d.x1/d.x2 if available, else use d.x ± d.halfW
            const halfW = d.halfW !== undefined ? d.halfW : (d.w !== undefined ? d.w / 2 : 0);
            const leftX  = d.x - halfW;
            const rightX = d.x + halfW;
            const dimY   = d.y; // already offset below cabinet in 3D

            const pL  = _project3Dto2D(leftX,  dimY, 2);
            const pR  = _project3Dto2D(rightX, dimY, 2);
            const pLC = _project3Dto2D(leftX,  dimY + EXT_OFFSET, 2);
            const pRC = _project3Dto2D(rightX, dimY + EXT_OFFSET, 2);

            // Extension lines (short vertical ticks)
            svgParts.push(`<line x1="${pLC.x.toFixed(1)}" y1="${pLC.y.toFixed(1)}" x2="${pL.x.toFixed(1)}" y2="${(pL.y + DIM_OFFSET).toFixed(1)}"
              stroke="${STROKE}" stroke-width="1" stroke-dasharray="none"/>`);
            svgParts.push(`<line x1="${pRC.x.toFixed(1)}" y1="${pRC.y.toFixed(1)}" x2="${pR.x.toFixed(1)}" y2="${(pR.y + DIM_OFFSET).toFixed(1)}"
              stroke="${STROKE}" stroke-width="1"/>`);

            // Dimension line with arrows
            const dimLineY = (pL.y + DIM_OFFSET).toFixed(1);
            svgParts.push(`<line x1="${pL.x.toFixed(1)}" y1="${dimLineY}" x2="${pR.x.toFixed(1)}" y2="${dimLineY}"
              stroke="${STROKE}" stroke-width="${STROKE_W}" marker-start="url(#arr-start)" marker-end="url(#arr-end)"/>`);

            // Label
            const midX = ((pL.x + pR.x) / 2).toFixed(1);
            const labelY = (parseFloat(dimLineY) - 6).toFixed(1);
            svgParts.push(`
              <rect x="${(parseFloat(midX) - 22).toFixed(1)}" y="${(parseFloat(labelY) - 9).toFixed(1)}" width="44" height="16" rx="3" fill="white"/>
              <text x="${midX}" y="${labelY}" text-anchor="middle" dominant-baseline="auto"
                font-family="'Rubik',Tahoma,sans-serif" font-size="12" font-weight="bold" fill="${STROKE}">${d.val}</text>
            `);

        } else if (d.type === 'height' || d.type === 'overall-height') {
            // Vertical dimension line to the left of the column/cabinet
            // d.x = X position (already offset left), d.y = center Y of compartment
            const halfH = d.halfH !== undefined ? d.halfH : (d.h !== undefined ? d.h / 2 : 0);
            const topY    = d.y + halfH;
            const bottomY = d.y - halfH;
            const dimX    = d.x;

            const pT  = _project3Dto2D(dimX, topY,    2);
            const pB  = _project3Dto2D(dimX, bottomY, 2);
            const pTC = _project3Dto2D(dimX + EXT_OFFSET, topY,    2);
            const pBC = _project3Dto2D(dimX + EXT_OFFSET, bottomY, 2);

            // Extension lines
            svgParts.push(`<line x1="${pTC.x.toFixed(1)}" y1="${pTC.y.toFixed(1)}" x2="${(pT.x - DIM_OFFSET).toFixed(1)}" y2="${pT.y.toFixed(1)}"
              stroke="${STROKE}" stroke-width="1"/>`);
            svgParts.push(`<line x1="${pBC.x.toFixed(1)}" y1="${pBC.y.toFixed(1)}" x2="${(pB.x - DIM_OFFSET).toFixed(1)}" y2="${pB.y.toFixed(1)}"
              stroke="${STROKE}" stroke-width="1"/>`);

            // Dimension line with arrows
            const dimLineX = (pT.x - DIM_OFFSET).toFixed(1);
            svgParts.push(`<line x1="${dimLineX}" y1="${pT.y.toFixed(1)}" x2="${dimLineX}" y2="${pB.y.toFixed(1)}"
              stroke="${STROKE}" stroke-width="${STROKE_W}" marker-start="url(#arr-start)" marker-end="url(#arr-end)"/>`);

            // Label (rotated)
            const midY = ((pT.y + pB.y) / 2).toFixed(1);
            const labelX = (parseFloat(dimLineX) - 8).toFixed(1);
            svgParts.push(`
              <rect x="${(parseFloat(labelX) - 8).toFixed(1)}" y="${(parseFloat(midY) - 22).toFixed(1)}" width="16" height="44" rx="3" fill="white"/>
              <text x="${labelX}" y="${midY}" text-anchor="middle" dominant-baseline="middle"
                font-family="'Rubik',Tahoma,sans-serif" font-size="12" font-weight="bold" fill="${STROKE}"
                transform="rotate(-90,${labelX},${midY})">${d.val}</text>
            `);

        } else if (d.type === 'corner-front-label') {
            // Label badge in the center of the corner unit area on the front view
            const p = _project3Dto2D(d.x, d.y, 0.3);
            const labelW = Math.max(d.val.length * 7 + 16, 80);
            svgParts.push(`
              <rect x="${(p.x - labelW/2).toFixed(1)}" y="${(p.y - 10).toFixed(1)}" width="${labelW}" height="20" rx="4" fill="#fef08a" stroke="#b45309" stroke-width="1.2" opacity="0.9"/>
              <text x="${p.x.toFixed(1)}" y="${(p.y + 1).toFixed(1)}" text-anchor="middle" dominant-baseline="middle"
                font-family="'Rubik',Tahoma,sans-serif" font-size="11" font-weight="bold" fill="#92400e">${d.val}</text>
            `);
        }
    });

    bpLayer.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="${cw}" height="${ch}" style="position:absolute;top:0;left:0;overflow:visible;">${svgParts.join('')}</svg>`;
}
function _captureBlueprintWithOverlay() {
    // Returns a Promise<string> (data URL)
    const glCanvas = renderer.domElement;
    const cw = glCanvas.width;
    const ch = glCanvas.height;

    // Snapshot the WebGL canvas pixels NOW (before any async gap)
    const composite = document.createElement('canvas');
    composite.width = cw;
    composite.height = ch;
    const ctx = composite.getContext('2d');
    ctx.drawImage(glCanvas, 0, 0);

    // Get the SVG from the blueprint overlay layer
    const bpLayer = document.getElementById('blueprint-layer');
    const svgEl = bpLayer ? bpLayer.querySelector('svg') : null;

    if (!svgEl) {
        return Promise.resolve(composite.toDataURL('image/png'));
    }

    // Serialize SVG → data URL
    const svgData = new XMLSerializer().serializeToString(svgEl);
    const svgDataUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgData);

    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            ctx.drawImage(img, 0, 0, cw, ch);
            resolve(composite.toDataURL('image/png'));
        };
        img.onerror = () => {
            // Fallback: return without overlay
            resolve(composite.toDataURL('image/png'));
        };
        img.src = svgDataUrl;
    });
}

// ---- Smooth camera animation ----
// window._camAnim is read each frame by animate() in ui.js
// Must use window.* because let-variables are script-scoped and not visible across <script> tags
window._camAnim = null;

window.animateCameraTo = function(toPos, toTarget, duration, onDone) {
    const fromPos = camera.position.clone();
    const fromTarget = controls.target.clone();
    const toPosVec = new THREE.Vector3(...toPos);
    const toTargetVec = new THREE.Vector3(...toTarget);
    // Immediately snap controls target so OrbitControls doesn't fight the animation
    controls.target.copy(toTargetVec);
    controls.enableDamping = false;
    window._camAnim = {
        fromPos,
        fromTarget,
        toPos: toPosVec,
        toTarget: toTargetVec,
        t: 0,
        duration: duration || 0.6,
        onDone: onDone || null
    };
};

function _easeInOut(t) {
    return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}
// Note: animate() loop lives in ui.js — _camAnim is read there each frame.
