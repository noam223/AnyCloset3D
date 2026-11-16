// ==========================================
// kitchen-corner.js
// Kitchen corner (ר) L carcass — used instead of the wardrobe buildFullCornerUnit
// when state.presetId === 'kitchen' and the arm is a kitchenCornerL full_corner.
// Loaded after engine-corners.js.
// ==========================================
//
// Local frame matches buildFullCornerUnit: origin at the BACK-OUTER corner of the L,
// `a` = distance from the outer edge toward the center run (local X = -sign·a),
// `z` = distance forward from the back wall.
//   Horizontal arm: a ∈ [0, cw],    z ∈ [0, frontD]
//   Side arm:       a ∈ [0, wingD], z ∈ [frontD, cd]
// Open faces (doors): front of the horizontal arm (a ∈ [wingD, cw]) and the inner
// side of the side arm (z ∈ [frontD, cd]).

(function() {
    const KC_WORKTOP_T = 2.8;
    const KC_KICK_T = 1.7;
    const KC_SHELF_SETBACK = 2;
    const KC_DOOR_GAP = 0.3;

    window._isKitchenCornerWing = function(wing) {
        return !!(state && state.presetId === 'kitchen' && wing &&
            wing.kitchenCornerL && wing.wingPosition === 'full_corner');
    };

    // Opaque clone — shared library materials may carry a temporary hover/dim opacity
    function _kcMat(key, fallbackKey) {
        const base = (key && materials[key]) || materials[fallbackKey || 'white_matte'] ||
            new THREE.MeshStandardMaterial({ color: 0xf4f4f2, roughness: 0.6 });
        const m = base.clone ? base.clone() : base;
        m.transparent = false;
        m.opacity = 1;
        m.depthWrite = true;
        return m;
    }

    // ExtrudeGeometry UVs are in cm — remap to 0..1 over the board footprint (top view)
    function _kcPlanarUV(geo) {
        geo.computeBoundingBox();
        const bb = geo.boundingBox;
        const pos = geo.attributes.position;
        const sx = Math.max(1e-3, bb.max.x - bb.min.x);
        const sz = Math.max(1e-3, bb.max.z - bb.min.z);
        const uv = new Float32Array(pos.count * 2);
        for (let i = 0; i < pos.count; i++) {
            uv[i * 2] = (pos.getX(i) - bb.min.x) / sx;
            uv[i * 2 + 1] = (pos.getZ(i) - bb.min.z) / sz;
        }
        geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    }

    function _kcDoorOn(comp) {
        if (!comp) return false;
        const d = comp.door !== undefined ? comp.door
            : (comp.type === 'door_regular' || comp.type === 'door_glass') ? 'right' : 'empty';
        return !!d && d !== 'empty';
    }

    /**
     * Build the kitchen L corner carcass + worktop + kick plinth.
     * opts.parent  — target group (default cabinetGroup)
     * opts.offsetX / opts.offsetZ — shift of the whole layout (wing edit mode keeps the arm at origin)
     */
    window.buildKitchenCornerUnit = function(side, wingData, opts) {
        opts = opts || {};
        const parent = opts.parent || cabinetGroup;
        const isBP = state.viewMode === 'blueprint';
        const centerWing = state.wings.center;
        const mainW = centerWing ? centerWing.width : state.width;
        const bodyD = centerWing ? centerWing.depth : state.depth;
        const t = wingData.thickness || state.thickness || 1.7;
        const P = (wingData.plinthHeight != null) ? wingData.plinthHeight : 10;
        const H = wingData.globalHeight || 88;
        const fc = wingData.fullCorner || { size: 90, shelves: 1, shelvesY: [], compartments: [] };
        const cw = fc.size || 90;
        const cd = cw;
        const frontD = Math.min(bodyD, cd - 2 * t);
        const wingD = Math.min(wingData.depth || 56, cw - 2 * t);
        const sign = (side === 'right') ? 1 : -1;
        const originX = sign * (mainW / 2 + cw) + (opts.offsetX || 0);
        const originZ = -bodyD / 2 + (opts.offsetZ || 0);
        const X = a => -sign * a;

        if (isBP) {
            const bpMat = new THREE.MeshBasicMaterial({ color: 0xffffff, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
            const bpEdge = new THREE.LineBasicMaterial({ color: 0x000000 });
            const hh = H + KC_WORKTOP_T;
            const geo = new THREE.PlaneGeometry(cw, hh);
            const mesh = new THREE.Mesh(geo, bpMat);
            mesh.position.set(originX - sign * cw / 2, hh / 2, opts.offsetZ || 0);
            mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), bpEdge));
            parent.add(mesh);
            if (parent === cabinetGroup && state.bpData) {
                state.bpData.push({ type: 'width', val: Math.round(cw), x: originX - sign * cw / 2, y: -20, halfW: cw / 2 });
            }
            return mesh;
        }

        const g = new THREE.Group();
        g.position.set(originX, 0, originZ);
        g.userData.isFullCorner = true;
        g.userData.isKitchenCorner = true;
        g.userData.side = side;

        const eM = (typeof edgeMat !== 'undefined') ? edgeMat
            : new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.15 });
        const matBody = _kcMat(wingData.materialBody);
        const matInt = _kcMat(wingData.materialInternal || wingData.materialBody);
        const topBase = materials[wingData.materialTopPanel] || materials[wingData.materialBody] || materials['white_matte'];
        const matTop = (typeof window._kitchenCountertopMaterial === 'function')
            ? window._kitchenCountertopMaterial(topBase) : topBase;

        const box = (a0, a1, y0, y1, z0, z1, mat, tag) => {
            const w = a1 - a0, h = y1 - y0, d = z1 - z0;
            if (w <= 0.05 || h <= 0.05 || d <= 0.05) return null;
            const geo = new THREE.BoxGeometry(w, h, d);
            const m = new THREE.Mesh(geo, mat);
            m.position.set(X((a0 + a1) / 2), (y0 + y1) / 2, (z0 + z1) / 2);
            m.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), eM));
            if (tag) m.userData.kitCornerPart = tag;
            g.add(m);
            return m;
        };

        // L board: horizontal arm a∈[a0,a1] z∈[z0,zF], side arm a∈[a0,aIn] up to z1
        const lBoard = (r, y0, y1, mat, tag) => {
            const s = new THREE.Shape();
            s.moveTo(X(r.a0), r.z0);
            s.lineTo(X(r.a1), r.z0);
            s.lineTo(X(r.a1), r.zF);
            s.lineTo(X(r.aIn), r.zF);
            s.lineTo(X(r.aIn), r.z1);
            s.lineTo(X(r.a0), r.z1);
            s.lineTo(X(r.a0), r.z0);
            const geo = new THREE.ExtrudeGeometry(s, { depth: y1 - y0, bevelEnabled: false });
            geo.rotateX(Math.PI / 2);
            geo.translate(0, y1, 0);
            _kcPlanarUV(geo);
            const m = new THREE.Mesh(geo, mat);
            m.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), eM));
            if (tag) m.userData.kitCornerPart = tag;
            g.add(m);
            return m;
        };

        // ---- Leveling feet + external kick plinth (same system as kitchen base runs) ----
        if (P > 0) {
            const kT = KC_KICK_T;
            const footMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.55, metalness: 0.15 });
            const ins = 4;
            [
                [ins, ins], [wingD, ins], [cw - ins, ins],
                [cw - ins, frontD - kT - ins], [wingD - kT - ins, frontD - kT - ins],
                [ins, cd - kT - ins], [wingD - kT - ins, cd - kT - ins]
            ].forEach(function(p) {
                const foot = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.6, P, 12), footMat);
                foot.position.set(X(p[0]), P / 2, p[1]);
                g.add(foot);
            });
            box(wingD - kT, cw, 0, P, frontD - kT, frontD, matBody, 'plinth_external');
            box(wingD - kT, wingD, 0, P, frontD, cd, matBody, 'plinth_external');
            box(cw - kT, cw, 0, P, 0, frontD - kT, matBody, 'plinth_external');
            box(0, wingD - kT, 0, P, cd - kT, cd, matBody, 'plinth_external');
        }

        // ---- Carcass: walls run full height, floor/top/shelves sit between them ----
        const yB = P, yT = H;
        box(0, cw, yB, yT, 0, t, matBody, 'back');
        box(0, t, yB, yT, t, cd, matBody, 'side_back');
        box(cw - t, cw, yB, yT, t, frontD, matBody, 'end_center');
        box(t, wingD, yB, yT, cd - t, cd, matBody, 'end_return');
        const inner = { a0: t, a1: cw - t, aIn: wingD, z0: t, zF: frontD, z1: cd - t };
        lBoard(inner, yB, yB + t, matBody, 'floor');
        lBoard(inner, yT - t, yT, matBody, 'top');

        // ---- Shelves (L, set back from the openings) ----
        const minY = yB + t + 2, maxY = yT - t - 2;
        let shelvesY = (fc.shelvesY || []).filter(y => y > minY && y < maxY);
        const nShelves = Math.max(0, fc.shelves != null ? fc.shelves : 1);
        if (shelvesY.length !== nShelves) {
            shelvesY = [];
            const innerH = (yT - t) - (yB + t);
            for (let i = 1; i <= nShelves; i++) shelvesY.push(yB + t + innerH * i / (nShelves + 1));
        }
        const shelfR = {
            a0: t, a1: cw - t, aIn: wingD - KC_SHELF_SETBACK,
            z0: t, zF: frontD - KC_SHELF_SETBACK, z1: cd - t
        };
        shelvesY.forEach(sy => lBoard(shelfR, sy - t / 2, sy + t / 2, matInt, 'shelf'));

        // ---- Continuous L worktop on top of the carcass ----
        lBoard({ a0: 0, a1: cw, aIn: wingD, z0: 0, zF: frontD, z1: cd }, H, H + KC_WORKTOP_T, matTop, 'worktop');

        // ---- Doors: one leaf per opening, full carcass height, when any compartment has a door ----
        const comps = fc.compartments || [];
        if (wingData.hasDoors !== false && comps.some(_kcDoorOn)) {
            const model = wingData.cabinetModel || state.cabinetModel;
            const hStyle = (model === 'ab2') ? 'touch'
                : (fc.handleStyle || wingData.handleStyle || (typeof _getHandleStyle === 'function' ? _getHandleStyle() : 'pipe'));
            const variant = wingData.handleVariant || 'pipe_silver';
            const handleMat = (typeof _handleMat3D === 'function') ? _handleMat3D(variant)
                : new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.8, roughness: 0.3 });
            const dT = t;
            const dy0 = P + KC_DOOR_GAP, dy1 = H - KC_DOOR_GAP;
            const dh = dy1 - dy0, dMidY = (dy0 + dy1) / 2;
            const addDoor = (w, posX, posZ, alongZ, handleOff) => {
                if (w <= 1) return;
                const dg = new THREE.Group();
                dg.position.set(posX, dMidY, posZ);
                const geo = alongZ ? new THREE.BoxGeometry(dT, dh, w) : new THREE.BoxGeometry(w, dh, dT);
                const mesh = new THREE.Mesh(geo, _kcMat(wingData.materialExternal));
                mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), eM));
                dg.add(mesh);
                if (hStyle !== 'touch' && hStyle !== 'none') {
                    const len = Math.min(dh * 0.35, 15);
                    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, len, 16), handleMat);
                    const out = dT / 2 + 1.5;
                    const hy = dh / 2 - 6 - len / 2;
                    if (alongZ) bar.position.set(-sign * out, hy, handleOff);
                    else bar.position.set(handleOff, hy, out);
                    dg.add(bar);
                }
                g.add(dg);
                if (typeof _registerDoorMesh === 'function') _registerDoorMesh(dg);
            };
            // Door 1 — front of the horizontal arm; handle near the far (center-side) edge
            const d1a0 = wingD + KC_DOOR_GAP / 2, d1a1 = cw - KC_DOOR_GAP / 2;
            const d1w = d1a1 - d1a0;
            addDoor(d1w, X((d1a0 + d1a1) / 2), frontD + dT / 2, false, X(d1w / 2 - 3));
            // Door 2 — inner side of the side arm; starts behind door 1's thickness
            const d2z0 = frontD + dT + KC_DOOR_GAP / 2, d2z1 = cd - KC_DOOR_GAP / 2;
            const d2w = d2z1 - d2z0;
            addDoor(d2w, X(wingD + dT / 2), (d2z0 + d2z1) / 2, true, d2w / 2 - 3);
        }

        parent.add(g);
        if (parent === cabinetGroup) window[`_fullCornerGroup_${side}`] = g;
        return g;
    };
})();
