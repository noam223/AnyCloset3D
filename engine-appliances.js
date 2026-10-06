// =====================================================================
// Laundry appliances (washer / dryer) placed inside cabinet cells.
// Ported from washing-machine-mockup.html for the system renderer:
// linear output (hex colours used as-is), studio env map, no shadow casting.
// Units: cm. Template origin: floor level, centred on width/depth; front faces +Z.
// =====================================================================
(function () {
const LA_TYPES = {
    washer: {
        W: 59.7, H: 84.5, D: 57, doorY: 42, doorR: 20.8, holeR: 15.5,
        drawerW: 17, label: '8 kg  ·  1400 rpm  ·  A', display: ['1:28', '40°', '1400'],
        glass: [[0, -6], [4, -5.7], [8, -4.7], [10.8, -3.0], [12.6, -1.0], [13.2, 0.8]]
    },
    dryer: {
        W: 59.7, H: 84.5, D: 61, doorY: 43, doorR: 21.5, holeR: 16.5,
        drawerW: 24, label: '8 kg  ·  Heat pump  ·  A+++', display: ['2:05', 'Cotton', 'Dry'],
        glass: [[0, -1.6], [6, -1.45], [10, -0.9], [12.6, -0.1], [13.2, 0.8]]
    }
};
const LA_COMMON = { feet: 1.2, topT: 1.8, panelY0: 71.5 };
const LA_FINISH = {
    body: 0xf2f3f1, bodyRough: 0.38,
    door: 0x1b1d1f, doorRough: 0.3, doorMetal: 0.35,
    dark: 0x26292c, button: 0xe2e5e7
};
const STACK_KIT = 1;
const DOOR_PROTRUSION = 3.7;

const LAUNDRY_RULES = {
    minWidth: 60,
    singleHeight: 85,
    stackHeight: 170,
    dims: { washer: { W: 59.7, H: 84.5, D: 57 }, dryer: { W: 59.7, H: 84.5, D: 61 } }
};

function _laRoundedRect(w, h, r, cx = 0, cy = 0) {
    const s = new THREE.Shape();
    const x0 = cx - w / 2, y0 = cy - h / 2;
    r = Math.min(r, w / 2, h / 2);
    s.moveTo(x0 + r, y0);
    s.lineTo(x0 + w - r, y0); s.quadraticCurveTo(x0 + w, y0, x0 + w, y0 + r);
    s.lineTo(x0 + w, y0 + h - r); s.quadraticCurveTo(x0 + w, y0 + h, x0 + w - r, y0 + h);
    s.lineTo(x0 + r, y0 + h); s.quadraticCurveTo(x0, y0 + h, x0, y0 + h - r);
    s.lineTo(x0, y0 + r); s.quadraticCurveTo(x0, y0, x0 + r, y0);
    return s;
}

function _laSlab(w, h, depth, r, bevel, mat) {
    const b = Math.min(bevel, depth / 2 - 0.01);
    const geo = new THREE.ExtrudeGeometry(_laRoundedRect(w - 2 * b, h - 2 * b, Math.max(r - b, 0.05)), {
        depth: depth - 2 * b, bevelEnabled: b > 0, bevelThickness: b, bevelSize: b, bevelSegments: 2, curveSegments: 5
    });
    geo.translate(0, 0, b);
    return new THREE.Mesh(geo, mat);
}

function _laLathe(pts, segs, mat) {
    const geo = new THREE.LatheGeometry(pts.map(p => new THREE.Vector2(p[0], p[1])), segs);
    geo.rotateX(Math.PI / 2);
    return new THREE.Mesh(geo, mat);
}

function _laCanvasTex(w, h, draw) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    t.anisotropy = 4;
    return t;
}

const _laTexCache = {};
function _laTex(name, make) { return _laTexCache[name] || (_laTexCache[name] = make()); }

function _laDrumTex(type) {
    return _laTex('drum-' + type, () => {
        const t = _laCanvasTex(128, 128, (x, w, h) => {
            x.fillStyle = '#c3c8cc'; x.fillRect(0, 0, w, h);
            const pts = [[32, 32], [96, 32], [0, 96], [64, 96], [128, 96]];
            pts.forEach(([cx, cy]) => {
                if (type === 'washer') {
                    x.fillStyle = '#e6e9eb'; x.beginPath(); x.arc(cx + 1.5, cy + 1.5, 9, 0, Math.PI * 2); x.fill();
                    x.fillStyle = '#2b3034'; x.beginPath(); x.arc(cx, cy, 7, 0, Math.PI * 2); x.fill();
                } else {
                    const gr = x.createRadialGradient(cx - 5, cy - 5, 2, cx, cy, 20);
                    gr.addColorStop(0, '#eef1f3'); gr.addColorStop(0.6, '#c3c8cc'); gr.addColorStop(1, '#a9afb4');
                    x.fillStyle = gr; x.beginPath(); x.arc(cx, cy, 20, 0, Math.PI * 2); x.fill();
                }
            });
        });
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        return t;
    });
}

function _laDisplayTex(lines) {
    return _laTex('disp-' + lines.join('|'), () => _laCanvasTex(512, 212, (x, w, h) => {
        x.fillStyle = '#0d1114'; x.fillRect(0, 0, w, h);
        x.textAlign = 'center'; x.textBaseline = 'middle';
        x.fillStyle = '#e8f6ff'; x.font = 'bold 110px "Segoe UI", Tahoma, sans-serif';
        x.fillText(lines[0], w * 0.4, h * 0.48);
        x.fillStyle = '#7fd3ff'; x.font = 'bold 32px "Segoe UI", Tahoma, sans-serif';
        x.fillText(lines[1], w * 0.85, h * 0.3);
        x.fillText(lines[2], w * 0.85, h * 0.68);
        x.fillStyle = '#4ade80';
        x.beginPath(); x.arc(w * 0.07, h * 0.25, 9, 0, Math.PI * 2); x.fill();
    }));
}

function _laDialTex() {
    return _laTex('dial', () => _laCanvasTex(256, 256, (x, w, h) => {
        x.translate(w / 2, h / 2);
        for (let i = 0; i < 14; i++) {
            const a = -Math.PI * 0.75 + i * (Math.PI * 1.5 / 13);
            x.strokeStyle = i % 2 ? '#9aa3aa' : '#5b646b';
            x.lineWidth = i % 2 ? 3 : 5;
            x.beginPath();
            x.moveTo(Math.cos(a) * 92, Math.sin(a) * 92);
            x.lineTo(Math.cos(a) * (i % 2 ? 104 : 112), Math.sin(a) * (i % 2 ? 104 : 112));
            x.stroke();
        }
    }));
}

function _laLabelTex(text) {
    return _laTex('label-' + text, () => _laCanvasTex(512, 64, (x, w, h) => {
        x.fillStyle = '#7c858c'; x.font = '600 32px "Segoe UI", Tahoma, sans-serif';
        x.textAlign = 'center'; x.textBaseline = 'middle';
        x.fillText(text, w / 2, h / 2);
    }));
}

function _laGrilleTex() {
    return _laTex('grille', () => _laCanvasTex(256, 64, (x, w, h) => {
        x.fillStyle = '#26292c';
        for (let i = 0; i < 14; i++) {
            const sx = 8 + i * 17.6;
            x.beginPath();
            x.roundRect ? x.roundRect(sx, 10, 8, 44, 4) : x.rect(sx, 10, 8, 44);
            x.fill();
        }
    }));
}

function buildLaundryAppliance(type) {
    const T = LA_TYPES[type] || LA_TYPES.washer;
    const { W, H, D, doorY, doorR, holeR } = T;
    const { feet, topT, panelY0 } = LA_COMMON;
    const f = LA_FINISH;
    const F = D / 2;
    const isDryer = type === 'dryer';
    const g = new THREE.Group();
    g.name = type;

    const env = window._studioEnvMap || null;
    const std = (color, rough, metal, extra) => new THREE.MeshStandardMaterial(Object.assign({
        color: color, roughness: rough, metalness: metal || 0, envMap: env, envMapIntensity: 0.8
    }, extra || {}));
    const drumTex = _laDrumTex(type);
    const drumBackTex = drumTex.clone();
    drumBackTex.needsUpdate = true;
    drumBackTex.repeat.set(7, 7);
    const M = {
        body: std(f.body, f.bodyRough, 0),
        door: std(f.door, f.doorRough, f.doorMetal),
        dark: std(f.dark, 0.55, 0.1),
        smoke: std(0x101214, 0.18, 0.1),
        rubber: std(0x2e3135, 0.85, 0),
        chrome: std(0xd8dcdf, 0.18, 1, { envMapIntensity: 1 }),
        button: std(f.button, 0.4, 0),
        glass: std(isDryer ? 0x39444b : 0x4f6470, 0.04, 0.1, { transparent: true, opacity: isDryer ? 0.5 : 0.36, depthWrite: false, side: THREE.DoubleSide, envMapIntensity: 1.7 }),
        drum: std(0xffffff, isDryer ? 0.28 : 0.35, 0.75, { map: drumTex, side: THREE.BackSide }),
        drumBack: std(0xffffff, 0.35, 0.75, { map: drumBackTex }),
        display: std(0x000000, 0.12, 0, { emissive: 0xffffff, emissiveMap: _laDisplayTex(T.display) }),
        dial: new THREE.MeshBasicMaterial({ map: _laDialTex(), transparent: true, depthWrite: false }),
        label: new THREE.MeshBasicMaterial({ map: _laLabelTex(T.label), transparent: true, depthWrite: false }),
        grille: new THREE.MeshBasicMaterial({ map: _laGrilleTex(), transparent: true, depthWrite: false }),
        led: new THREE.MeshBasicMaterial({ color: 0x4ade80 })
    };
    drumTex.repeat.set(Math.round(2 * Math.PI * (holeR - 0.9) / 4), 8);

    const add = (mesh, x, y, z) => { mesh.position.set(x || 0, y || 0, z || 0); g.add(mesh); return mesh; };

    // ---- Shell with the drum opening punched through ----
    const bodyH = H - feet - topT, b = 0.8;
    const shellShape = _laRoundedRect(W - 2 * b, bodyH - 2 * b, 0.6, 0, feet + bodyH / 2);
    const hole = new THREE.Path();
    hole.absarc(0, doorY, holeR + b, 0, Math.PI * 2, true);
    shellShape.holes.push(hole);
    const shellGeo = new THREE.ExtrudeGeometry(shellShape, { depth: D - 2 * b, bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelSegments: 2, curveSegments: 10 });
    shellGeo.translate(0, 0, b - F);
    add(new THREE.Mesh(shellGeo, M.body));
    add(new THREE.Mesh(new THREE.CircleGeometry(holeR + 1, 32), M.body), 0, doorY, -F - 0.02).rotation.y = Math.PI;

    // ---- Worktop lid ----
    const lid = _laSlab(W + 0.2, D + 0.6, topT, 1.4, 0.45, M.body);
    lid.geometry.rotateX(-Math.PI / 2);
    add(lid, 0, H - topT, 0.3);

    // ---- Control panel ----
    const panelH = H - topT - 0.4 - panelY0, panelCY = panelY0 + panelH / 2;
    add(_laSlab(W - 1.6, panelH, 0.7, 1, 0.25, M.body), 0, panelCY, F);
    add(new THREE.Mesh(new THREE.BoxGeometry(W - 3, 0.22, 0.1), M.dark), 0, panelY0 - 0.25, F + 0.03);
    const PF = F + 0.7;
    const drawerX = -W / 2 + 2.4 + T.drawerW / 2;
    add(_laSlab(T.drawerW, 8.2, 0.5, 0.8, 0.15, M.body), drawerX, panelCY, PF);
    add(new THREE.Mesh(new THREE.BoxGeometry(T.drawerW * (isDryer ? 0.6 : 0.42), 0.7, 0.3), M.dark), drawerX, panelCY - 3.2, PF + 0.4);
    if (isDryer) {
        const drop = new THREE.Shape();
        drop.moveTo(0, 1.1); drop.quadraticCurveTo(0.75, 0.1, 0.55, -0.3); drop.absarc(0, -0.3, 0.55, 0, Math.PI, true); drop.quadraticCurveTo(-0.75, 0.1, 0, 1.1);
        add(new THREE.Mesh(new THREE.ShapeGeometry(drop, 6), M.dark), drawerX + T.drawerW / 2 - 2.4, panelCY + 1.8, PF + 0.52);
    }
    const knobX = isDryer ? 4 : 1.5;
    add(new THREE.Mesh(new THREE.PlaneGeometry(11, 11), M.dial), knobX, panelCY, PF + 0.02);
    add(new THREE.Mesh(new THREE.TorusGeometry(3.55, 0.3, 8, 40), M.chrome), knobX, panelCY, PF + 0.3);
    const knob = new THREE.Mesh(new THREE.CylinderGeometry(3.05, 3.2, 1.8, 36), M.button);
    knob.rotation.x = Math.PI / 2;
    add(knob, knobX, panelCY, PF + 0.9);
    add(new THREE.Mesh(new THREE.BoxGeometry(0.45, 1.7, 0.15), M.dark), knobX - 1.1, panelCY + 1.6, PF + 1.85).rotation.z = 0.6;
    const dispX = isDryer ? 16.5 : 15.5;
    add(new THREE.Mesh(new THREE.PlaneGeometry(isDryer ? 10.5 : 12.5, 5.2), M.display), dispX, panelCY + 1.3, PF + 0.02);
    (isDryer ? [12.5, 15.5, 18.5] : [10.5, 13.8, 17.1, 20.4]).forEach(x => {
        const btn = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 0.35, 18), M.button);
        btn.rotation.x = Math.PI / 2;
        add(btn, x, panelCY - 3.1, PF + 0.17);
    });
    const pwr = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.25, 0.5, 24), M.button);
    pwr.rotation.x = Math.PI / 2;
    add(pwr, 25.2, panelCY, PF + 0.25);
    add(new THREE.Mesh(new THREE.TorusGeometry(1.45, 0.12, 6, 28), M.chrome), 25.2, panelCY, PF + 0.1);
    add(new THREE.Mesh(new THREE.CircleGeometry(0.25, 12), M.led), 25.2, panelCY + 2.3, PF + 0.02);

    // ---- Drum opening: gasket, drum, lifters ----
    add(new THREE.Mesh(new THREE.TorusGeometry(holeR - 0.5, 1.0, 10, 48), M.rubber), 0, doorY, F - 0.6);
    const drumR = holeR - 0.9, drumL = isDryer ? 36 : 32, drumZ = F - 1.5 - drumL / 2;
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(drumR, drumR, drumL, 40, 1, true), M.drum);
    drum.rotation.x = Math.PI / 2;
    add(drum, 0, doorY, drumZ);
    add(new THREE.Mesh(new THREE.CircleGeometry(drumR, 40), M.drumBack), 0, doorY, drumZ - drumL / 2);
    [Math.PI / 2, Math.PI / 2 + 2.094, Math.PI / 2 - 2.094].forEach(a => {
        const lifter = new THREE.Mesh(new THREE.BoxGeometry(isDryer ? 2.4 : 1.6, isDryer ? 2 : 2.6, drumL - 3), M.chrome);
        lifter.rotation.z = a - Math.PI / 2;
        add(lifter, Math.cos(a) * (drumR - 1.1), doorY + Math.sin(a) * (drumR - 1.1), drumZ);
    });
    if (isDryer) {
        add(_laSlab(11, 2.2, 1.2, 0.6, 0.2, M.button), 0, doorY - holeR + 1.6, F - 1.6);
        add(new THREE.Mesh(new THREE.BoxGeometry(4, 0.5, 0.2), M.dark), 0, doorY - holeR + 1.9, F - 0.35);
    }

    // ---- Door (hinged on the left): black ring, smoked bezel, tinted glass ----
    const door = new THREE.Group();
    door.name = 'laundryDoor';
    door.position.set(-doorR + 0.3, doorY, F + 0.3);
    g.add(door);
    const dg = new THREE.Group();
    dg.position.x = doorR - 0.3;
    door.add(dg);
    const s = doorR / 20.8;
    const ring = [[14.4, 0.2], [14.2, 1.2], [14.5, 2.4], [15.3, 3.1], [17.5, 3.35], [19.6, 3.0], [20.6, 2.1], [20.8, 1.0], [20.5, 0.2], [14.4, 0.2]];
    dg.add(_laLathe(ring.map(([r, z]) => [r * s, z]), 64, M.door));
    const accent = new THREE.Mesh(new THREE.TorusGeometry(17.4 * s, 0.12, 6, 64), M.chrome);
    accent.position.z = 3.38;
    dg.add(accent);
    dg.add(_laLathe([[13.0, -0.4], [12.9, 0.8], [13.4, 1.8], [14.4, 2.3], [14.5, 0.0], [13.0, -0.4]].map(([r, z]) => [r * s, z]), 48, M.smoke));
    const glass = _laLathe(T.glass.map(([r, z]) => [r * s, z]), 48, M.glass);
    glass.renderOrder = 2;
    dg.add(glass);
    const grip = _laSlab(1.1, 7, 1.1, 0.5, 0.25, M.smoke);
    grip.position.set(doorR - 1.9, 0, 2.6);
    dg.add(grip);
    [-5.5, 5.5].forEach(y => {
        const hinge = _laSlab(1.6, 3, 0.9, 0.4, 0.15, M.dark);
        hinge.position.set(-doorR + 0.9, y, -0.6);
        dg.add(hinge);
    });

    // ---- Front details ----
    add(new THREE.Mesh(new THREE.PlaneGeometry(18, 2.2), M.label), 0, panelY0 - 3.2, F + 0.02);
    if (isDryer) {
        const flapH = 9, flapY = feet + 0.6 + flapH / 2;
        add(new THREE.Mesh(new THREE.ShapeGeometry(_laRoundedRect(W - 3.4, flapH + 0.4, 1), 4), M.dark), 0, flapY, F + 0.02);
        add(_laSlab(W - 3.8, flapH, 0.25, 0.9, 0.08, M.body), 0, flapY, F + 0.02);
        add(new THREE.Mesh(new THREE.PlaneGeometry(22, 4.4), M.grille), -W / 2 + 15, flapY, F + 0.3);
        add(new THREE.Mesh(new THREE.BoxGeometry(6, 0.6, 0.2), M.dark), W / 2 - 8, flapY + flapH / 2 - 1.2, F + 0.3);
    } else {
        add(new THREE.Mesh(new THREE.BoxGeometry(W - 3, 0.18, 0.1), M.dark), 0, feet + 7.5, F + 0.03);
        const flapX = W / 2 - 8.5, flapY = feet + 3.9;
        add(new THREE.Mesh(new THREE.ShapeGeometry(_laRoundedRect(9.6, 5.6, 1), 4), M.dark), flapX, flapY, F + 0.02);
        add(_laSlab(9.2, 5.2, 0.2, 0.9, 0.06, M.body), flapX, flapY, F + 0.02);
    }

    // ---- Levelling feet ----
    const footGeo = new THREE.CylinderGeometry(2, 2.3, feet, 16);
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => add(new THREE.Mesh(footGeo, M.dark), sx * (W / 2 - 5), feet / 2, sz * (F - 5)));

    g.userData.dims = { W, H, D };
    return g;
}

// Templates are cloned per placement (clone shares geometry + materials), so
// cabinet rebuilds don't regenerate the extrusions or leak GPU buffers.
const _templates = {};
let _kitMat = null;
function _template(type) {
    const env = window._studioEnvMap || null;
    const cached = _templates[type];
    if (cached && cached.env === env) return cached.group;
    const group = buildLaundryAppliance(type);
    _templates[type] = { group, env };
    return group;
}

/** Which of the requested appliances fit a cell of the given size (stack order: washer below dryer). */
function _laundryFit(list, cellW, cellH) {
    const want = ['washer', 'dryer'].filter(t => Array.isArray(list) && list.includes(t));
    if (!want.length || cellW < LAUNDRY_RULES.minWidth) return [];
    if (want.length === 2 && cellH >= LAUNDRY_RULES.stackHeight) return want;
    return cellH >= LAUNDRY_RULES.singleHeight ? [want[0]] : [];
}

/** Depth layout: front Z of the appliances and whether they stick out past the cabinet doors' plane. */
function _laundryLayout(list, cellW, cellH, bodyD, backT, frontInset) {
    const fit = _laundryFit(list, cellW, cellH);
    if (!fit.length) return null;
    const maxD = Math.max.apply(null, fit.map(t => LA_TYPES[t].D));
    const backFace = -bodyD / 2 + (backT || 0) + 0.3;
    const flushFront = bodyD / 2 - (frontInset || 0) - DOOR_PROTRUSION - 0.3;
    return { fit, frontZ: Math.max(flushFront, backFace + maxD), protrudes: backFace + maxD > flushFront + 1e-6 };
}

function laundryProtrudes(list, cellW, cellH, bodyD, frontInset) {
    const L = _laundryLayout(list, cellW, cellH, bodyD, 0.5, frontInset);
    return !!(L && L.protrudes);
}

/**
 * Add the cell's appliances to `parent`.
 * opts: { list, x, bottomY, cellW, cellH, bodyD, backT, frontInset }
 */
function addLaundryAppliancesToCell(parent, opts) {
    const L = _laundryLayout(opts.list, opts.cellW, opts.cellH, opts.bodyD, opts.backT, opts.frontInset);
    if (!L) return;
    const { fit, frontZ } = L;
    let y = opts.bottomY;
    fit.forEach((type, i) => {
        if (i > 0) {
            if (!_kitMat) _kitMat = new THREE.MeshStandardMaterial({ color: LA_FINISH.dark, roughness: 0.6 });
            const kitD = Math.min(LA_TYPES.washer.D, LA_TYPES[type].D) + 1;
            const kit = new THREE.Mesh(new THREE.BoxGeometry(LA_TYPES[type].W, STACK_KIT, kitD), _kitMat);
            kit.position.set(opts.x, y + STACK_KIT / 2, frontZ - kitD / 2);
            parent.add(kit);
            y += STACK_KIT;
        }
        const m = _template(type).clone();
        m.position.set(opts.x, y, frontZ - LA_TYPES[type].D / 2);
        m.userData.isLaundryAppliance = true;
        parent.add(m);
        y += LA_TYPES[type].H;
    });
}

// =====================================================================
// Flat TV on two splayed blade feet (16:9, sizes in inches).
// Template origin: floor level under the panel centre; screen faces +Z.
// =====================================================================
const TV_SIZES = [32, 40, 43, 48, 50, 55, 60];
const TV_DEFAULT_INCH = 43;

function tvDims(inch) {
    const diag = inch * 2.54, k = Math.sqrt(337);
    const sw = diag * 16 / k, sh = diag * 9 / k;
    const side = 0.6, top = 0.6, bottom = 1.1;
    const W = sw + 2 * side, H = sh + top + bottom;
    const standH = 4.5 + inch * 0.05;
    const footD = Math.min(26, Math.max(16, inch * 0.42));
    const panelT = 1.2, housingT = 2.2 + inch * 0.02;
    // Z of the panel+housing centre relative to the template origin (feet are symmetric around it)
    const centerZ = -housingT / 2;
    return { inch, sw, sh, side, top, bottom, W, H, standH, footD, panelT, housingT, centerZ, totalH: standH + H };
}

/** Space a TV needs inside a cell: 0.5 cm side clearance, 0.5 cm above. */
function tvFits(inch, cellW, cellH) {
    const d = tvDims(inch);
    return cellW >= d.W + 1 && cellH >= d.totalH + 0.5;
}

function tvLargestFit(cellW, cellH) {
    let best = null;
    TV_SIZES.forEach(s => { if (tvFits(s, cellW, cellH)) best = s; });
    return best;
}

// 16:9 crop of images/TV.jpg
function _tvScreenTex() {
    return _laTex('tv-screen', () => {
        const t = new THREE.TextureLoader().load('textures/tv-screen.jpg?v=2');
        t.anisotropy = 4;
        return t;
    });
}

// Soft diagonal sheen across the glass, brightest at the top-left corner
function _tvGlareTex() {
    return _laTex('tv-glare', () => _laCanvasTex(512, 288, (x, w, h) => {
        x.fillStyle = '#000'; x.fillRect(0, 0, w, h);
        const band = x.createLinearGradient(0, 0, w * 0.75, h);
        band.addColorStop(0, 'rgba(255,255,255,0.9)');
        band.addColorStop(0.28, 'rgba(255,255,255,0.35)');
        band.addColorStop(0.42, 'rgba(255,255,255,0.0)');
        band.addColorStop(0.5, 'rgba(255,255,255,0.18)');
        band.addColorStop(0.56, 'rgba(255,255,255,0.0)');
        band.addColorStop(1, 'rgba(255,255,255,0.0)');
        x.fillStyle = band; x.fillRect(0, 0, w, h);
    }));
}

function buildTv(inch) {
    const d = tvDims(inch);
    const g = new THREE.Group();
    g.name = 'tv' + inch;
    const env = window._studioEnvMap || null;
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x141518, roughness: 0.35, metalness: 0.4, envMap: env, envMapIntensity: 0.8 });
    const backMat = new THREE.MeshStandardMaterial({ color: 0x1d1f23, roughness: 0.6, metalness: 0.1, envMap: env, envMapIntensity: 0.5 });
    const footMat = new THREE.MeshStandardMaterial({ color: 0x1a1b1e, roughness: 0.3, metalness: 0.6, envMap: env, envMapIntensity: 0.9 });
    const screenMat = new THREE.MeshStandardMaterial({ color: 0x000000, roughness: 0.06, metalness: 0, emissive: 0xffffff, emissiveMap: _tvScreenTex(), envMap: env, envMapIntensity: 0.55 });

    const panelT = d.panelT;
    const y0 = d.standH;
    const frame = _laSlab(d.W, d.H, panelT, 0.4, 0.15, frameMat);
    frame.position.set(0, y0 + d.H / 2, -panelT / 2);
    g.add(frame);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(d.sw, d.sh), screenMat);
    screen.position.set(0, y0 + d.bottom + d.sh / 2, panelT / 2 + 0.02);
    g.add(screen);
    const glare = new THREE.Mesh(new THREE.PlaneGeometry(d.sw, d.sh), new THREE.MeshBasicMaterial({
        map: _tvGlareTex(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.22
    }));
    glare.position.set(0, screen.position.y, panelT / 2 + 0.05);
    glare.renderOrder = 2;
    g.add(glare);
    // Thicker electronics housing on the back, lower two thirds
    const backW = d.W * 0.78, backH = d.H * 0.62, backT = d.housingT;
    const back = _laSlab(backW, backH, backT, 1.5, 0.6, backMat);
    back.position.set(0, y0 + d.H * 0.42, -panelT / 2 - backT);
    g.add(back);

    // Blade feet: A-frame in side profile, leaning outwards from the front
    const footT = 1.1, attachY = y0 + Math.min(10, d.H * 0.18), zc = d.centerZ;
    const prof = new THREE.Shape();
    const fz = d.footD / 2, bz = d.footD / 2;
    prof.moveTo(-bz, 0); prof.lineTo(-bz + 2.2, 0); prof.lineTo(0, attachY - 2.5); prof.lineTo(fz - 2.2, 0);
    prof.lineTo(fz, 0); prof.lineTo(0.9, attachY); prof.lineTo(-0.9, attachY); prof.lineTo(-bz, 0);
    [-1, 1].forEach(sideSign => {
        const geo = new THREE.ExtrudeGeometry(prof, { depth: footT, bevelEnabled: true, bevelThickness: 0.15, bevelSize: 0.15, bevelSegments: 1, curveSegments: 1 });
        geo.rotateY(-Math.PI / 2);
        geo.translate(footT / 2, 0, 0);
        const pos = geo.attributes.position;
        for (let i = 0; i < pos.count; i++) pos.setX(i, pos.getX(i) + sideSign * (attachY - pos.getY(i)) * 0.32);
        geo.computeVertexNormals();
        const foot = new THREE.Mesh(geo, footMat);
        foot.position.set(sideSign * (d.W / 2 - Math.max(6, d.W * 0.07) - attachY * 0.32), 0, zc);
        g.add(foot);
    });

    g.userData.dims = d;
    return g;
}

const _tvTemplates = {};
function _tvTemplate(inch) {
    const env = window._studioEnvMap || null;
    const cached = _tvTemplates[inch];
    if (cached && cached.env === env) return cached.group;
    const group = buildTv(inch);
    _tvTemplates[inch] = { group, env };
    return group;
}

/**
 * Add a TV to `parent`. Uses the stored size, or the largest that fits when the cell shrank.
 * opts: { inch, x, bottomY, cellW, cellH, bodyD, backT, frontInset }
 * Returns { inch, x, topY, rightX } for the size badge, or null when nothing fits.
 */
function addTvToCell(parent, opts) {
    let inch = TV_SIZES.includes(opts.inch) ? opts.inch : TV_DEFAULT_INCH;
    if (!tvFits(inch, opts.cellW, opts.cellH)) inch = tvLargestFit(opts.cellW, opts.cellH);
    if (!inch) return null;
    const d = tvDims(inch);
    const m = _tvTemplate(inch).clone();
    const cellMidZ = ((opts.backT || 0) - (opts.frontInset || 0)) / 2;
    m.position.set(opts.x, opts.bottomY, cellMidZ - d.centerZ);
    m.userData.isTv = true;
    parent.add(m);
    return { inch, x: opts.x, topY: opts.bottomY + d.totalH, rightX: opts.x + d.W / 2 };
}

window.TV_SIZES = TV_SIZES;
window.TV_DEFAULT_INCH = TV_DEFAULT_INCH;
window._tvDims = tvDims;
window._tvFits = tvFits;
window._tvLargestFit = tvLargestFit;
window.addTvToCell = addTvToCell;

window.LAUNDRY_RULES = LAUNDRY_RULES;
window._laundryFit = _laundryFit;
window._laundryProtrudes = laundryProtrudes;
window.addLaundryAppliancesToCell = addLaundryAppliancesToCell;
})();
