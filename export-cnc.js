// ==========================================
// CNC export of the cabinet being edited: one layered DXF R12 per board (cut outline, shelf-pin holes,
// hinge cups, hinge-plate holes, confirmat face holes, back-panel groove), a combined DXF per
// material/thickness and a CSV cut list — in a zip.
// Boards are read from the built 3D scene (the collector of export-3d.js); manufacturing rules then fix
// what the visual model simplifies (back panel seat, shelf clearances, plinth blocks, double walls,
// boards that overlap one another in the scene).
// Engine units are cm, Y-up; everything here is mm. Each board is drawn flat: X along the grain,
// origin bottom-left, seen from the machined face (no mirroring).
// ==========================================
(function() {
    'use strict';

    const MM = 10;
    const LS_KEY = 'anycloset_cnc_settings';
    const CNC_DEFAULTS = {
        backMode: 'groove',     // 'groove' = back panel sits in a groove · 'between' = as modelled, no groove
        backSetback: 10,        // groove distance from the rear edge
        grooveDepth: 8,
        grooveClearance: 0.5,   // groove width = back thickness + clearance
        shelfPins: true,
        pinDia: 5,
        pinDepth: 10,
        pinInset: 50,           // from the shelf's front / rear edge
        pinRows: false,         // full 32 mm rows instead of two holes per shelf side
        pinPitch: 32,
        shelfSideGap: 1,        // per supported side of a loose shelf
        hinges: true,
        cupDia: 35,
        cupDepth: 12.5,
        cupCenter: 21.5,        // cup centre from the door edge
        hingeEdge: 100,         // first / last cup from the door ends
        hingePlates: true,
        plateDia: 5,
        plateDepth: 12,
        platePitch: 32,         // spacing between the two plate screws
        plateFront: 37,         // plate centre from the front edge of the side (overlay)
        carcassConnectors: true,
        confFaceDia: 5,         // confirmat pilot in the face of the side / divider
        confFaceDepth: 34,      // clamped to board thickness − 2 at drill time
        confEdgeInset: 50,      // from front / rear along the depth
        confCount: 0,           // 0 = auto (2 up to 500 mm depth, else 3)
        plinthStrips: 1,        // boards cut for each solid plinth block: 0 none · 1 front · 2 front + rear
        edgeBandThickness: 0    // subtracted from the cut size on banded edges
    };

    const X3 = function() { return window._export3DDebug || {}; };
    const V3 = function(x, y, z) { return new THREE.Vector3(x, y, z); };
    const _sgn = function(x) { return x < 0 ? -1 : 1; };
    const _r1 = function(x) { return Math.round(x * 10) / 10; };
    const _fmt = function(x) { return String(_r1(x)); };
    const _tag = function(x) { return _fmt(x).replace('.', 'P').replace('-', 'M'); };
    const _overlap = function(a, b) { return Math.min(a[1], b[1]) - Math.max(a[0], b[0]); };

    function _loadSettings() {
        const cfg = Object.assign({}, CNC_DEFAULTS);
        try {
            const saved = JSON.parse(localStorage.getItem(LS_KEY) || 'null');
            if (saved && typeof saved === 'object') {
                Object.keys(CNC_DEFAULTS).forEach(function(k) {
                    if (typeof saved[k] === typeof CNC_DEFAULTS[k] && (typeof saved[k] !== 'number' || isFinite(saved[k]))) cfg[k] = saved[k];
                });
            }
        } catch (e) { /* corrupt or blocked storage — defaults */ }
        return cfg;
    }
    function _saveSettings(cfg) {
        try { localStorage.setItem(LS_KEY, JSON.stringify(cfg)); } catch (e) { /* private mode */ }
    }

    // ---------- board geometry helpers ----------
    /** Extent of a board along a unit direction (its bounding box in its own frame). */
    function _iv(p, dir) {
        const c = p.c.dot(dir);
        let r = 0;
        for (let i = 0; i < 3; i++) r += p.half[i] * Math.abs(p.ax[i].dot(dir));
        return [c - r, c + r];
    }
    function _axisAlong(p, dir) {
        for (let i = 0; i < 3; i++) if (Math.abs(p.ax[i].dot(dir)) > 0.999) return i;
        return -1;
    }
    /** Resize a rectangular board along one of its own axes. False for shaped boards / skewed directions. */
    function _setIv(p, dir, lo, hi) {
        const i = _axisAlong(p, dir);
        if (i < 0 || p.poly || hi - lo < 1) return false;
        p.c.addScaledVector(dir, (lo + hi) / 2 - p.c.dot(dir));
        p.half[i] = (hi - lo) / 2;
        return true;
    }
    function _thick(p) { return p.half[p.ti] * 2; }
    function _normal(p) { return p.ax[p.ti]; }
    /** World point from coordinates along three orthonormal directions. */
    function _pt(d1, v1, d2, v2, d3, v3) {
        return V3(0, 0, 0).addScaledVector(d1, v1).addScaledVector(d2, v2).addScaledVector(d3, v3);
    }
    function _clonePanel(p) {
        const q = Object.assign({}, p);
        q.c = p.c.clone();
        q.half = p.half.slice();
        q.ops = [];
        q.notes = p.notes.slice();
        return q;
    }

    // ---------- materials ----------
    function _sig(m) {
        return (m.map ? m.map.uuid : '') + '#' + (m.color ? m.color.getHexString() : '') + '#' + m.metalness + '#' + m.roughness;
    }
    function _materialIndex() {
        const lib = window.materials || {};
        const byObj = new Map(), bySig = new Map(), pref = new Set();
        Object.keys(lib).forEach(function(k) {
            const m = lib[k];
            if (!m || !m.isMaterial) return;
            if (!byObj.has(m)) byObj.set(m, k);
            const s = _sig(m);
            if (!bySig.has(s)) bySig.set(s, []);
            bySig.get(s).push(k);
        });
        const grab = function(o) {
            if (!o) return;
            Object.keys(o).forEach(function(k) { if (/^material/.test(k) && typeof o[k] === 'string') pref.add(o[k]); });
        };
        if (typeof state !== 'undefined') {
            grab(state);
            Object.keys(state.wings || {}).forEach(function(w) { grab(state.wings[w]); });
            Object.keys(state.partColors || {}).forEach(function(k) { pref.add(state.partColors[k]); });
        }
        return { byObj: byObj, bySig: bySig, pref: pref };
    }
    /** Only boards finished in a library colour are wood; hardware, glass and mirrors use their own materials. */
    function _woodKey(lib, mesh, mat) {
        if (!mat) return null;
        const direct = lib.byObj.get(mat);
        if (direct) return { key: direct };
        if ((mat.transparent && (mat.opacity == null ? 1 : mat.opacity) < 0.9) || (mat.metalness || 0) > 0.6) return null;
        const cand = lib.bySig.get(_sig(mat));
        if (cand) return { key: cand.find(function(k) { return lib.pref.has(k); }) || cand[0] };
        // Re-tinted clone of a library colour (e.g. grooved bathroom fronts)
        if (mesh.userData && mesh.userData.partId) return { key: null };
        return null;
    }
    function _matLabel(key) {
        if (!key) return 'לא מזוהה';
        return (typeof _colorKeyLabel === 'function') ? _colorKeyLabel(key) : String(key);
    }

    // ---------- collect boards from the scene ----------
    function _frameOf(part) {
        const e = part.matrix.elements;
        const cols = [V3(e[0], e[1], e[2]), V3(e[4], e[5], e[6]), V3(e[8], e[9], e[10])];
        const scale = cols.map(function(c) { return c.length() || 1; });
        return { ax: cols.map(function(c, i) { return c.clone().divideScalar(scale[i]); }), scale: scale };
    }
    function _bboxPanel(part) {
        const g = part.mesh.geometry;
        if (!g.boundingBox) g.computeBoundingBox();
        const fr = _frameOf(part);
        const size = g.boundingBox.getSize(V3(0, 0, 0));
        const half = [size.x * fr.scale[0] * MM / 2, size.y * fr.scale[1] * MM / 2, size.z * fr.scale[2] * MM / 2];
        const c = g.boundingBox.getCenter(V3(0, 0, 0)).applyMatrix4(part.matrix).multiplyScalar(MM);
        let ti = 0;
        if (half[1] < half[ti]) ti = 1;
        if (half[2] < half[ti]) ti = 2;
        return { c: c, ax: fr.ax, half: half, ti: ti, poly: null, holes: null };
    }
    function _loopArea(l) {
        let a = 0;
        for (let i = 0; i < l.length; i++) { const p = l[i], q = l[(i + 1) % l.length]; a += p[0] * q[1] - q[0] * p[1]; }
        return a / 2;
    }
    function _simplifyLoop(l) {
        const out = [];
        for (let i = 0; i < l.length; i++) {
            const a = l[(i + l.length - 1) % l.length], b = l[i], c = l[(i + 1) % l.length];
            const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
            if (Math.abs(cross) > 1e-6) out.push(b);
        }
        return out.length >= 3 ? out : l;
    }
    /** Shaped board (L-shelf, rounded desk): the flat face's boundary, read from the cap triangles. */
    function _extrudePanel(part) {
        const g = part.mesh.geometry, pos = g.attributes.position;
        const get = function(i, a) { return a === 0 ? pos.getX(i) : (a === 1 ? pos.getY(i) : pos.getZ(i)); };
        const rnd = function(x) { return Math.round(x * 1000) / 1000; };
        const levels = [new Set(), new Set(), new Set()];
        for (let i = 0; i < pos.count; i++) for (let a = 0; a < 3; a++) levels[a].add(rnd(get(i, a)));
        const p = _bboxPanel(part);
        let ti = -1;
        for (let a = 0; a < 3; a++) if (levels[a].size === 2 && (ti < 0 || p.half[a] < p.half[ti])) ti = a;
        if (ti < 0) return null;
        p.ti = ti;
        const top = Math.max.apply(null, Array.from(levels[ti]));
        const ia = (ti + 1) % 3, ib = (ti + 2) % 3;
        const idx = g.index ? g.index.array : null;
        const n = idx ? idx.length : pos.count;
        const pts = new Map(), edges = new Map();
        for (let t = 0; t + 2 < n; t += 3) {
            const tri = [0, 1, 2].map(function(k) { return idx ? idx[t + k] : t + k; });
            if (!tri.every(function(i) { return Math.abs(get(i, ti) - top) < 1e-3; })) continue;
            const ks = tri.map(function(i) { return rnd(get(i, ia)) + ',' + rnd(get(i, ib)); });
            tri.forEach(function(i, k) { pts.set(ks[k], [get(i, ia), get(i, ib)]); });
            for (let k = 0; k < 3; k++) {
                const a = ks[k], b = ks[(k + 1) % 3];
                if (a === b) continue;
                const ek = a < b ? a + '|' + b : b + '|' + a;
                edges.set(ek, (edges.get(ek) || 0) + 1);
            }
        }
        const adj = new Map();
        edges.forEach(function(cnt, ek) {
            if (cnt !== 1) return;
            const ab = ek.split('|');
            if (!adj.has(ab[0])) adj.set(ab[0], []);
            if (!adj.has(ab[1])) adj.set(ab[1], []);
            adj.get(ab[0]).push(ab[1]);
            adj.get(ab[1]).push(ab[0]);
        });
        const used = new Set(), loops = [];
        adj.forEach(function(_, start) {
            if (used.has(start)) return;
            const loop = [];
            let cur = start;
            while (cur && !used.has(cur)) {
                used.add(cur);
                loop.push(pts.get(cur));
                cur = adj.get(cur).find(function(k) { return !used.has(k); });
            }
            if (loop.length >= 3) loops.push(_simplifyLoop(loop));
        });
        if (!loops.length) return null;
        loops.sort(function(a, b) { return Math.abs(_loopArea(b)) - Math.abs(_loopArea(a)); });
        const mid = (Math.min.apply(null, Array.from(levels[ti])) + top) / 2;
        const toWorld = function(l) {
            return l.map(function(q) {
                const v = [0, 0, 0];
                v[ia] = q[0]; v[ib] = q[1]; v[ti] = mid;
                return V3(v[0], v[1], v[2]).applyMatrix4(part.matrix).multiplyScalar(MM);
            });
        };
        // A plain rectangle needs no outline of its own
        if (loops.length === 1 && loops[0].length === 4) {
            const l = loops[0];
            const rect = l.every(function(q, i) { const nx = l[(i + 1) % 4]; return Math.abs(q[0] - nx[0]) < 1e-3 || Math.abs(q[1] - nx[1]) < 1e-3; });
            if (rect) return p;
        }
        p.poly = toWorld(loops[0]);
        p.holes = loops.slice(1).map(toWorld);
        return p;
    }

    const WING_LABELS = { center: 'מרכז', left: 'כנף שמאל', right: 'כנף ימין', corner: 'יחידת פינה' };
    function _splitPartId(partId) {
        const s = String(partId || '').split('::').pop();
        if (!s) return { wing: '', suffix: '' };
        const wings = (typeof state !== 'undefined' && state.wings) ? Object.keys(state.wings) : ['center', 'left', 'right'];
        wings.sort(function(a, b) { return b.length - a.length; });
        for (let i = 0; i < wings.length; i++) {
            if (s.indexOf(wings[i] + '_') === 0) return { wing: wings[i], suffix: s.slice(wings[i].length + 1) };
        }
        return { wing: '', suffix: s };
    }
    function _wingLabel(w) {
        if (!w) return '';
        if (WING_LABELS[w]) return WING_LABELS[w];
        if (/^upperUnit/.test(w)) return 'יחידה עליונה';
        return w;
    }

    // order = position in the cut list
    const ROLES = [
        [/^wall_left/, 'SIDE_L', 'דופן שמאל', 10],
        [/^wall_right/, 'SIDE_R', 'דופן ימין', 11],
        [/^divider_c/, 'DIVIDER', 'מחיצה בין עמודות', 12],
        [/^\0partition/, 'PARTITION', 'מחיצה פנימית בתא', 13],          // tagged by the engine (userData.cncRole)
        [/^\0spacer/, 'SPACER', 'פלטת מילוי למגירות פנימיות', 36],      // tagged by the engine
        [/^top_panel/, 'TOP_PANEL', 'פאנל עליון / משטח', 22],
        [/^top_c/, 'TOP', 'גג', 20],
        [/^plinth_external/, 'PLINTH', 'צוקל', 60],
        [/^plinth_(floor|c)/, 'BOTTOM', 'רצפה', 21],
        [/^back_c/, 'BACK', 'גב', 50],
        [/^split_c/, 'SPLIT', 'קושרת', 23],
        [/^shelf_sub/, 'SHELF', 'מדף (תא מחולק)', 31],
        [/^(shelf_c|desk_shelf)/, 'SHELF', 'מדף', 30],
        [/^opencell/, 'OPEN_CELL', 'לוח תא פתוח', 35],
        [/^door_c/, 'DOOR', 'דלת', 80],
        [/^(drawer_ext|desk_int_drawer|desk_drawer_d|wd_drawer_d|desk_merge_(desk|ward)_d)/, 'DRAWER_FRONT', 'חזית מגירה', 85],
        [/drawer_bottom/, 'DESK_RAIL', 'תחתית מגירות שולחן', 72],
        [/^desk_merge_frame/, 'DESK_FRAME', 'מסגרת מגירות שולחן', 73],
        [/(^|_)(desk_surface|wd_surface)/, 'DESK', 'משטח שולחן', 70],
        [/leg/, 'DESK_LEG', 'רגל שולחן', 71]
    ];
    function _roleOf(p) {
        const tagged = p.mesh && p.mesh.userData && p.mesh.userData.cncRole;
        if (tagged) {
            const hit = ROLES.find(function(r) { return r[1] === tagged; });
            if (hit) return { code: hit[1], name: hit[2], order: hit[3] };
        }
        for (let i = 0; i < ROLES.length; i++) {
            if (ROLES[i][0].test(p.suffix)) return { code: ROLES[i][1], name: ROLES[i][2], order: ROLES[i][3] };
        }
        if (p.isFront) {
            return p.layer === 'drawers'
                ? { code: 'DRAWER_FRONT', name: 'חזית מגירה', order: 85 }
                : { code: 'DOOR', name: 'דלת', order: 80 };
        }
        if (p.layer === 'shelves' && p.horizontal) return { code: 'SHELF', name: 'מדף', order: 30 };
        if (p.corner) {
            if (p.horizontal) return { code: 'CORNER_H', name: 'לוח אופקי — יחידת פינה', order: 40 };
            if (_thick(p) < 10) return { code: 'BACK', name: 'גב — יחידת פינה', order: 50 };
            return { code: 'CORNER_V', name: 'דופן — יחידת פינה', order: 41 };
        }
        if (p.horizontal) return { code: 'PANEL_H', name: 'לוח אופקי', order: 40 };
        if (_thick(p) < 10) return { code: 'BACK', name: 'גב', order: 50 };
        return { code: 'PANEL_V', name: 'לוח אנכי', order: 41 };
    }

    function _collect() {
        const parts = (X3().collect ? X3().collect() : []);
        const lib = _materialIndex();
        const UP = V3(0, 1, 0);
        const model = { panels: [], warnings: [], skipped: [], sceneBoards: 0 };
        const groups = new Map();       // door group → its wood boards
        const leafGroups = new Set();   // every hinged-door leaf group seen
        const skipKinds = {};           // boards the engine marks as not part of this export
        parts.forEach(function(part) {
            const mesh = part.mesh, g = mesh.geometry, ud = mesh.userData || {};
            if (part.layer === 'handles' || part.layer === 'furniture' || part.layer === 'room' || part.layer === 'ceiling') return;
            let doorRoot = null, noFront = false;
            for (let o = mesh; o && o !== window.cabinetGroup; o = o.parent) {
                if (!doorRoot && o.userData && o.userData.isCabinetDoor) doorRoot = o;
                if (o.userData && o.userData.cncNoFront) noFront = true;
            }
            if (doorRoot && doorRoot.isGroup && doorRoot.userData.doorLeaf) leafGroups.add(doorRoot);
            if (g.type !== 'BoxGeometry' && g.type !== 'ExtrudeGeometry') return;
            if (ud.cncSkip) { skipKinds[ud.cncSkip] = (skipKinds[ud.cncSkip] || 0) + 1; return; }
            const wood = _woodKey(lib, mesh, part.material);
            if (!wood) return;
            const p = g.type === 'BoxGeometry' ? _bboxPanel(part) : _extrudePanel(part);
            if (!p) {
                model.skipped.push('חלק בצורה לא נתמכת (' + String(ud.partId || 'ללא מזהה').split('::').pop() + ')');
                return;
            }
            if (ud.cncThick) p.half[p.ti] = ud.cncThick * MM / 2;
            const inPlane = [0, 1, 2].filter(function(i) { return i !== p.ti; });
            if (_thick(p) < 3 || Math.min(p.half[inPlane[0]], p.half[inPlane[1]]) * 2 < 30) return;
            const ids = _splitPartId(ud.partId);
            p.mesh = mesh;
            p.layer = part.layer;
            p.wing = ids.wing || (noFront ? 'corner' : '');
            p.corner = noFront;
            p.suffix = ids.suffix;
            p.matKey = wood.key;
            p.ops = [];
            p.notes = [];
            p.horizontal = Math.abs(_normal(p).dot(UP)) > 0.9;
            const fl = ud.cncFront || [0, 0, 1];
            p.front = V3(0, 0, 0).addScaledVector(p.ax[0], fl[0]).addScaledVector(p.ax[1], fl[1]).addScaledVector(p.ax[2], fl[2]).normalize();
            p.frontKnown = !!ud.cncFront || !noFront;
            p.isFront = (part.layer === 'doors' || part.layer === 'drawers') && Math.abs(_normal(p).dot(p.front)) > 0.9;
            // Hinge side (as seen from the front) and door style
            p.hinge = ud.cncHinge || null;
            p.style = ud.cncStyle || null;
            p.bifold = !!ud.cncBifold;
            const leaf = [mesh, mesh.parent].map(function(o) { return o && o.userData && o.userData.doorLeaf; }).find(Boolean);
            if (leaf && !leaf.subDoor) {
                if (!p.hinge && (leaf.leaf === 'left' || leaf.leaf === 'right')) p.hinge = leaf.leaf;
                if (!p.style) p.style = (leaf.door && leaf.door.style) || 'solid';
            }
            model.sceneBoards++;
            if (doorRoot && doorRoot.isGroup) {
                if (!groups.has(doorRoot)) groups.set(doorRoot, []);
                groups.get(doorRoot).push(p);
            } else {
                model.panels.push(p);
            }
        });
        // A door group holds the leaf board plus frame bars; only the board is cut here
        groups.forEach(function(members, root) {
            const area = function(p) { const d = [0, 1, 2].filter(function(i) { return i !== p.ti; }); return p.half[d[0]] * p.half[d[1]] * 4; };
            const narrow = function(p) { const d = [0, 1, 2].filter(function(i) { return i !== p.ti; }); return Math.min(p.half[d[0]], p.half[d[1]]) * 2; };
            const maxA = Math.max.apply(null, members.map(area));
            const keep = members.filter(function(p) { return area(p) >= maxA * 0.5 && narrow(p) >= 100; });
            model.sceneBoards -= members.length - keep.length;
            keep.forEach(function(p) {
                if (keep.length < members.length) p.framed = true;
                model.panels.push(p);
            });
            if (keep.length) leafGroups.delete(root);
        });
        if (leafGroups.size) {
            model.warnings.push(leafGroups.size + ' דלתות זכוכית / מראה / מסגרת ללא לוח עץ — לא נכללו בייצוא ויש לייצר אותן בנפרד');
        }
        if (skipKinds.drawerBox) {
            model.skipped.push(skipKinds.drawerBox + ' לוחות של ארגזי מגירות פנימיות (תחתית, צדדים, גב) — ארגזי מגירות אינם חלק מהייצוא');
        }
        model.panels.forEach(function(p) { p.role = _roleOf(p); });
        return model;
    }

    // ---------- manufacturing rules ----------
    function _mainThickness(panels) {
        const cnt = {};
        panels.forEach(function(p) {
            const t = _r1(_thick(p));
            if (!p.isFront && t >= 12 && t <= 30) cnt[t] = (cnt[t] || 0) + 1;
        });
        const best = Object.keys(cnt).sort(function(a, b) { return cnt[b] - cnt[a]; })[0];
        return best ? Number(best) : 17;
    }
    function _isCarcass(p) { return !p.isFront && p.role.code !== 'BACK'; }

    /**
     * The 3D scene is drawn for looks, so some boards overlap. A real board cannot:
     *  - a board lying inside a larger parallel one is a visual duplicate → dropped
     *  - an upright that runs through a horizontal board stops at it
     *    (kitchen base floor: the floor is cut per unit instead)
     *  - a horizontal board that ends inside an upright stops at its face
     */
    function _resolveOverlaps(model, list) {
        const UP = V3(0, 1, 0);
        const plain = function(p) { return _isCarcass(p) && !p.poly && !p.synthetic && _thick(p) >= 10; };
        const inPlane = function(p) { return [0, 1, 2].filter(function(i) { return i !== p.ti; }); };
        const area = function(p) { const d = inPlane(p); return p.half[d[0]] * p.half[d[1]] * 4; };

        // 1. duplicates
        const dropped = new Set();
        const cand = list.filter(plain).sort(function(a, b) { return area(b) - area(a); });
        cand.forEach(function(big, bi) {
            if (dropped.has(big)) return;
            for (let k = bi + 1; k < cand.length; k++) {
                const small = cand[k];
                if (dropped.has(small) || Math.abs(_normal(big).dot(_normal(small))) < 0.999) continue;
                const n = _normal(big);
                if (_overlap(_iv(big, n), _iv(small, n)) < Math.min(_thick(big), _thick(small)) * 0.5) continue;
                const d = inPlane(big);
                const shared = Math.max(0, _overlap(_iv(big, big.ax[d[0]]), _iv(small, big.ax[d[0]]))) *
                    Math.max(0, _overlap(_iv(big, big.ax[d[1]]), _iv(small, big.ax[d[1]])));
                if (shared < area(small) * 0.9) continue;
                dropped.add(small);
                if (/^PANEL_/.test(big.role.code) && !/^PANEL_/.test(small.role.code)) big.role = small.role;
            }
        });
        if (dropped.size) {
            model.sceneBoards -= dropped.size;
            model.warnings.push(dropped.size + ' לוחות כפולים בהדמיה (חופפים ללוח גדול יותר) הוסרו מהרשימה');
            list = list.filter(function(p) { return !dropped.has(p); });
        }

        // 2. uprights against horizontal boards
        const horiz = list.filter(function(p) { return plain(p) && p.horizontal; });
        const vert = list.filter(function(p) { return plain(p) && !p.horizontal && Math.abs(_normal(p).dot(UP)) < 0.01; });
        const extra = [];
        horiz.forEach(function(H) {
            const hUp = _iv(H, UP);
            inPlane(H).forEach(function(i) {
                const d = H.ax[i], e = H.ax[inPlane(H).find(function(j) { return j !== i; })];
                const cuts = [];
                let lo = _iv(H, d)[0], hi = _iv(H, d)[1];
                vert.forEach(function(V) {
                    if (Math.abs(_normal(V).dot(d)) < 0.999) return;
                    const vUp = _iv(V, UP), vIv = _iv(V, d), hIv = _iv(H, d);
                    if (_overlap(vUp, hUp) < _thick(H) - 1 || _overlap(vIv, hIv) < 1 || _overlap(_iv(V, e), _iv(H, e)) < 20) return;
                    if (hIv[0] < vIv[0] - 5 && hIv[1] > vIv[1] + 5) {
                        if (/^plinth_floor/.test(H.suffix)) { cuts.push(vIv); return; }
                        // the upright ends at the horizontal board
                        if (vUp[1] <= hUp[1] + 1.5 && vUp[0] < hUp[0] - 5) {
                            if (_setIv(V, UP, vUp[0], hUp[0])) V.notes.push('קוצר עד "' + H.role.name + '" (חפיפה בהדמיה)');
                        } else if (vUp[0] >= hUp[0] - 1.5 && vUp[1] > hUp[1] + 5) {
                            if (_setIv(V, UP, hUp[1], vUp[1])) V.notes.push('קוצר עד "' + H.role.name + '" (חפיפה בהדמיה)');
                        } else {
                            model.warnings.push('"' + V.role.name + '" חוצה את "' + H.role.name + '" — לבדוק איזה לוח נחתך');
                        }
                        return;
                    }
                    // the horizontal board ends inside the upright
                    if (hIv[0] >= vIv[0] - 5 && hIv[0] < vIv[1]) lo = Math.max(lo, vIv[1]);
                    if (hIv[1] <= vIv[1] + 5 && hIv[1] > vIv[0]) hi = Math.min(hi, vIv[0]);
                });
                const full = _iv(H, d);
                if (!cuts.length && lo === full[0] && hi === full[1]) return;
                cuts.sort(function(a, b) { return a[0] - b[0]; });
                const spans = [];
                let from = lo;
                cuts.forEach(function(c) {
                    if (c[0] - from > 30) spans.push([from, Math.min(c[0], hi)]);
                    from = Math.max(from, c[1]);
                });
                if (hi - from > 30) spans.push([from, hi]);
                if (!spans.length) return;
                H.notes.push(spans.length > 1 ? 'פוצל לפי היחידות (לוח אחד בהדמיה)' : 'קוצר בין הדפנות (חפיפה בהדמיה)');
                for (let k = spans.length - 1; k >= 0; k--) {
                    const q = k === 0 ? H : _clonePanel(H);
                    _setIv(q, d, spans[k][0], spans[k][1]);
                    if (k > 0) extra.push(q);
                }
                model.sceneBoards += spans.length - 1;
            });
        });
        return list.concat(extra);
    }

    function _rules(model, cfg) {
        const UP = V3(0, 1, 0);
        const tMain = _mainThickness(model.panels);
        model.tMain = tMain;
        let out = [];

        model.panels.forEach(function(p) {
            const T = _thick(p);
            // Two neighbouring unit sides drawn as one double-thickness wall
            if (p.role.code === 'DIVIDER' && !p.poly && Math.abs(T - 2 * tMain) < 0.6) {
                [-1, 1].forEach(function(s) {
                    const q = _clonePanel(p);
                    q.half[q.ti] = tMain / 2;
                    q.c.addScaledVector(_normal(p), s * tMain / 2);
                    q.role = { code: 'UNIT_SIDE', name: 'דופן יחידה', order: 12 };
                    out.push(q);
                });
                model.sceneBoards++;
                return;
            }
            // Solid plinth block: only its front (and rear) strip is a real board
            if (/^plinth_c/.test(p.suffix) && p.horizontal && T > 30 && !p.poly) {
                const n = Math.max(0, Math.min(2, Math.round(cfg.plinthStrips)));
                const depth = p.half[2] * 2;
                for (let k = 0; k < n; k++) {
                    const q = _clonePanel(p);
                    q.ti = 2;
                    q.half[2] = tMain / 2;
                    q.c.addScaledVector(p.ax[2], (k === 0 ? 1 : -1) * (depth / 2 - tMain / 2));
                    q.horizontal = false;
                    q.role = { code: 'PLINTH', name: k === 0 ? 'צוקל קדמי' : 'צוקל אחורי', order: 60 + k };
                    q.synthetic = true;
                    q.notes.push('נגזר מבלוק הצוקל שבהדמיה');
                    out.push(q);
                }
                model.sceneBoards += n - 1;
                return;
            }
            if (T > 60) {
                model.skipped.push('גוף ' + _fmt(p.half[0] * 2) + '×' + _fmt(p.half[1] * 2) + '×' + _fmt(p.half[2] * 2) + ' מ"מ (' + (p.suffix || (p.corner ? 'צוקל יחידת פינה' : 'ללא מזהה')) + ') — בלוק מלא ולא לוח, יש לייצר בנפרד');
                model.sceneBoards--;
                return;
            }
            out.push(p);
        });

        out = _resolveOverlaps(model, out);

        // Unnamed horizontal boards: the one the uprights stand on is the floor, the one above them the top
        out.forEach(function(H) {
            if (H.role.code !== 'PANEL_H' || H.poly) return;
            const hUp = _iv(H, UP);
            let stand = 0, hang = 0;
            out.forEach(function(V) {
                if (V === H || V.isFront || V.horizontal || V.poly || _thick(V) < 10) return;
                if ([0, 1, 2].some(function(i) { return i !== H.ti && _overlap(_iv(V, H.ax[i]), _iv(H, H.ax[i])) < 5; })) return;
                const vUp = _iv(V, UP);
                if (Math.abs(vUp[0] - hUp[1]) <= 2) stand++;
                if (Math.abs(vUp[1] - hUp[0]) <= 2) hang++;
            });
            if (stand >= 2 && !hang) H.role = { code: 'BOTTOM', name: 'רצפה', order: 21 };
            else if (hang >= 2 && !stand) H.role = { code: 'TOP', name: 'גג', order: 20 };
        });

        // A side wall drawn in segments around a side opening is one board with a cutout in reality
        const segs = {};
        out.forEach(function(p) {
            if (p.role.code !== 'SIDE_L' && p.role.code !== 'SIDE_R') return;
            const k = p.wing + '|' + p.role.code;
            segs[k] = (segs[k] || 0) + 1;
        });
        Object.keys(segs).forEach(function(k) {
            if (segs[k] > 1) model.warnings.push('דופן מפוצלת ל-' + segs[k] + ' קטעים סביב פתח צד (' + _wingLabel(k.split('|')[0]) + ') — לבדוק אם זה לוח אחד עם חיתוך');
        });

        // Back panels: seat in a groove (or leave between the sides) and clear the boards in front of them
        const backs = out.filter(function(p) { return p.role.code === 'BACK' && _thick(p) < 10 && !p.poly && !p.horizontal; });
        const backSet = new Set(backs);
        const carcass = function() { return out.filter(function(p) { return _isCarcass(p) && !backSet.has(p); }); };
        const pieces = [];
        backs.forEach(function(B) {
            const n = _normal(B);
            const hAxis = [0, 1, 2].filter(function(i) { return i !== B.ti; }).find(function(i) { return Math.abs(B.ax[i].dot(UP)) < 0.5; });
            if (hAxis == null) { pieces.push(B); return; }
            const h = B.ax[hAxis];
            const bUp = _iv(B, UP), bH = _iv(B, h), bN = _iv(B, n);
            // Split at the joint boards (קושרת) that cross it: each box gets its own back
            const cuts = carcass().filter(function(S) {
                if (S.role.code !== 'SPLIT' || !S.horizontal) return false;
                const sUp = _iv(S, UP);
                return sUp[0] > bUp[0] + 1 && sUp[1] < bUp[1] - 1 && _overlap(_iv(S, h), bH) > (bH[1] - bH[0]) * 0.5 &&
                    _overlap(_iv(S, n), [bN[0] - 30, bN[1] + 30]) > 0;
            }).map(function(S) { return _iv(S, UP); }).sort(function(a, b) { return a[0] - b[0]; });
            let lo = bUp[0];
            const spans = [];
            cuts.forEach(function(c) {
                if (c[0] - lo > 30) spans.push([lo, c[0]]);
                lo = Math.max(lo, c[1]);
            });
            if (bUp[1] - lo > 30) spans.push([lo, bUp[1]]);
            spans.forEach(function(s, i) {
                const q = (spans.length === 1) ? B : _clonePanel(B);
                if (spans.length > 1) _setIv(q, UP, s[0], s[1]);
                pieces.push(q);
            });
            if (spans.length > 1) model.sceneBoards += spans.length - 1;
        });
        out = out.filter(function(p) { return !backSet.has(p); });
        const body = out.filter(_isCarcass);

        pieces.forEach(function(B) {
            const n = _normal(B);
            const hAxis = [0, 1, 2].filter(function(i) { return i !== B.ti; }).find(function(i) { return Math.abs(B.ax[i].dot(UP)) < 0.5; });
            if (hAxis == null) { out.push(B); return; }
            const h = B.ax[hAxis];
            const backT = _thick(B);
            let vote = 0;
            body.forEach(function(P) { vote += _sgn(P.c.clone().sub(B.c).dot(n)); });
            const inw = n.clone().multiplyScalar(vote < 0 ? -1 : 1);
            const orig = { up: _iv(B, UP), h: _iv(B, h) };
            // Boards whose face meets each edge of the back
            const edges = [
                { dir: UP.clone(), run: h }, { dir: UP.clone().negate(), run: h },
                { dir: h.clone(), run: UP }, { dir: h.clone().negate(), run: UP }
            ];
            edges.forEach(function(E) {
                const edge = _iv(B, E.dir)[1], runIv = _iv(B, E.run);
                E.panels = body.filter(function(P) {
                    return !P.poly && _thick(P) >= 10 && Math.abs(_normal(P).dot(E.dir)) > 0.999 &&
                        Math.abs(_iv(P, E.dir)[0] - edge) <= 1.5 && _overlap(_iv(P, E.run), runIv) > 5 &&
                        _overlap(_iv(P, inw), _iv(B, inw)) > 0;
                });
                let cover = 0;
                E.panels.forEach(function(P) { cover += Math.max(0, _overlap(_iv(P, E.run), runIv)); });
                E.seated = cfg.backMode === 'groove' && cover >= (runIv[1] - runIv[0]) * 0.8;
            });
            let rear = _iv(B, inw)[0];
            edges.forEach(function(E) { E.panels.forEach(function(P) { rear = Math.min(rear, _iv(P, inw)[0]); }); });
            let frontPlane = _iv(B, inw)[1];
            if (cfg.backMode === 'groove' && edges.some(function(E) { return E.seated; })) {
                const g0 = rear + cfg.backSetback;
                frontPlane = g0 + backT;
                const gw = backT + cfg.grooveClearance;
                edges.forEach(function(E, ei) {
                    if (!E.seated) return;
                    const edge = _iv(B, E.dir)[1], runIv = _iv(B, E.run);
                    // The groove runs past the back's corner where the neighbouring edge is seated too
                    const others = edges.filter(function(o) { return Math.abs(o.dir.dot(E.run)) > 0.999; });
                    const extLo = others.find(function(o) { return o.dir.dot(E.run) < 0; });
                    const extHi = others.find(function(o) { return o.dir.dot(E.run) > 0; });
                    const r0 = runIv[0] - (extLo && extLo.seated ? cfg.grooveDepth : 0);
                    const r1 = runIv[1] + (extHi && extHi.seated ? cfg.grooveDepth : 0);
                    E.panels.forEach(function(P) {
                        const pRun = _iv(P, E.run), pIn = _iv(P, inw);
                        const a = Math.max(r0, pRun[0]), b = Math.min(r1, pRun[1]);
                        if (b - a < 5) return;
                        if (g0 - cfg.grooveClearance / 2 < pIn[0] + 2 || g0 + gw > pIn[1] - 2) {
                            model.warnings.push('חריץ גב מחוץ לגבולות הלוח "' + P.role.name + '" — לא נוסף');
                            return;
                        }
                        P.ops.push({
                            type: 'groove', face: _sgn(-E.dir.dot(_normal(P))), width: gw, depth: cfg.grooveDepth,
                            a: _pt(E.dir, edge, E.run, a, inw, g0 - cfg.grooveClearance / 2),
                            b: _pt(E.dir, edge, E.run, b, inw, g0 - cfg.grooveClearance / 2 + gw)
                        });
                    });
                });
                // The back grows into each groove (1 mm short of its bottom) and moves forward to the groove line
                const ins = Math.max(0, cfg.grooveDepth - 1);
                const grow = function(dir) {
                    const E = edges.find(function(o) { return o.dir.dot(dir) > 0.999; });
                    return (E && E.seated) ? ins : 0;
                };
                _setIv(B, UP, orig.up[0] - grow(UP.clone().negate()), orig.up[1] + grow(UP));
                _setIv(B, h, orig.h[0] - grow(h.clone().negate()), orig.h[1] + grow(h));
                _setIv(B, inw, g0, g0 + backT);
            }
            // Shelves and inner boards stop at the back's front face
            body.forEach(function(P) {
                if (_overlap(_iv(P, UP), orig.up) <= 2 || _overlap(_iv(P, h), orig.h) <= 2) return;
                const pIn = _iv(P, inw);
                if (pIn[0] >= frontPlane - 0.05 || pIn[1] <= frontPlane + 10) return;
                if (!_setIv(P, inw, frontPlane, pIn[1])) {
                    P.notes.push('לבדוק מרווח לגב בקצה האחורי');
                }
            });
            out.push(B);
        });

        model.panels = out;
        return model;
    }

    // ---------- machining operations ----------
    function _hingeCount(len) { return len <= 900 ? 2 : (len <= 1600 ? 3 : (len <= 2000 ? 4 : 5)); }
    function _spread(lo, hi, n, edge) {
        const e = Math.min(edge, (hi - lo) / 4);
        const out = [];
        for (let i = 0; i < n; i++) out.push(lo + e + (hi - lo - 2 * e) * (n === 1 ? 0.5 : i / (n - 1)));
        return out;
    }

    function _ops(model, cfg) {
        const UP = V3(0, 1, 0);
        const body = model.panels.filter(_isCarcass);
        const supports = body.filter(function(p) { return !p.horizontal && !p.poly && _thick(p) >= 12 && !p.synthetic; });

        // --- shelf-pin holes ---
        const rows = [];
        model.panels.forEach(function(shelf) {
            if (shelf.role.code !== 'SHELF' || !shelf.horizontal) return;
            if (shelf.poly) { shelf.notes.push('מדף מעוצב — חורי פינים בעיבוד ידני'); return; }
            const sUp = _iv(shelf, UP);
            const yPin = sUp[0] - cfg.pinDia / 2;
            const find = function(dir) {
                const e = V3(0, 0, 0).crossVectors(dir, UP).normalize();
                const end = _iv(shelf, dir)[1], sE = _iv(shelf, e);
                return supports.filter(function(P) {
                    if (P === shelf || Math.abs(_normal(P).dot(dir)) < 0.999) return false;
                    const pUp = _iv(P, UP);
                    return Math.abs(_iv(P, dir)[0] - end) <= 2 && _overlap(_iv(P, e), sE) >= 20 &&
                        yPin > pUp[0] + 5 && yPin < pUp[1] - 5;
                });
            };
            const axes = [0, 1, 2].filter(function(i) { return i !== shelf.ti; }).map(function(i) {
                const sides = [1, -1].map(function(s) {
                    const dir = shelf.ax[i].clone().multiplyScalar(s);
                    return { dir: dir, panels: find(dir) };
                });
                return { i: i, sides: sides, score: sides.filter(function(s) { return s.panels.length; }).length };
            });
            axes.sort(function(a, b) { return (b.score - a.score) || (a.i - b.i); });
            const pick = axes[0];
            if (!pick.score) {
                shelf.notes.push('לא נמצאה דופן נושאת — ללא חורי פינים');
                model.warnings.push('מדף ' + _fmt(shelf.half[0] * 2) + '×' + _fmt(shelf.half[2] * 2) + ' ללא דופן נושאת — לא נוספו חורי פינים');
                return;
            }
            if (!cfg.shelfPins) return;
            pick.sides.forEach(function(side) {
                if (!side.panels.length) return;
                const dir = side.dir;
                const e = V3(0, 0, 0).crossVectors(dir, UP).normalize();
                const sE = _iv(shelf, e), len = sE[1] - sE[0];
                const inset = len >= 2 * cfg.pinInset + 40 ? cfg.pinInset : len / 4;
                const face = _iv(shelf, dir)[1];
                let placed = 0;
                [sE[0] + inset, sE[1] - inset].forEach(function(ePos) {
                    const P = side.panels.find(function(q) { const qe = _iv(q, e); return ePos > qe[0] + 8 && ePos < qe[1] - 8; });
                    if (!P) return;
                    const pFace = _sgn(-dir.dot(_normal(P)));
                    P.ops.push({ type: 'drill', d: cfg.pinDia, depth: cfg.pinDepth, face: pFace, tag: 'pin', p: _pt(dir, _iv(P, dir)[0], e, ePos, UP, yPin) });
                    placed++;
                    if (cfg.pinRows) rows.push({ P: P, face: pFace, dir: dir, e: e, ePos: ePos, y: yPin });
                });
                if (placed < 2) model.warnings.push('מדף ליד "' + side.panels[0].role.name + '" — נוספו רק ' + placed + ' חורי פינים מתוך 2');
            });
        });
        // Full 32 mm rows through each pin position, up to the fixed boards above and below
        rows.forEach(function(R) {
            const P = R.P, pUp = _iv(P, UP), faceCoord = _iv(P, R.dir)[0];
            let lo = pUp[0] + 60, hi = pUp[1] - 60;
            body.forEach(function(H) {
                if (!H.horizontal || H.role.code === 'SHELF' || _thick(H) < 12) return;
                if (Math.abs(_iv(H, R.dir)[1] - faceCoord) > 2) return;
                const hE = _iv(H, R.e);
                if (R.ePos < hE[0] || R.ePos > hE[1]) return;
                const hUp = _iv(H, UP);
                if (hUp[1] <= R.y) lo = Math.max(lo, hUp[1] + 60);
                if (hUp[0] >= R.y) hi = Math.min(hi, hUp[0] - 60);
            });
            R.lo = lo; R.hi = hi; R.faceCoord = faceCoord;
        });
        // One grid per hole line: shelves sharing a line share the grid of the lowest one
        const lines = {};
        rows.forEach(function(R, i) {
            const P = R.P;
            if (P._cncId == null) P._cncId = i;
            const k = [P._cncId, R.face, Math.round(R.ePos), Math.round(R.lo), Math.round(R.hi)].join('|');
            if (!lines[k] || R.y < lines[k].y) lines[k] = R;
        });
        Object.keys(lines).forEach(function(k) {
            const R = lines[k], P = R.P;
            const add = function(y) {
                const pt = _pt(R.dir, R.faceCoord, R.e, R.ePos, UP, y);
                const clash = P.ops.some(function(o) { return o.type === 'drill' && o.face === R.face && o.p.distanceTo(pt) < cfg.pinPitch / 2; });
                if (!clash) P.ops.push({ type: 'drill', d: cfg.pinDia, depth: cfg.pinDepth, face: R.face, tag: 'pin', p: pt });
            };
            for (let y = R.y + cfg.pinPitch; y <= R.hi; y += cfg.pinPitch) add(y);
            for (let y = R.y - cfg.pinPitch; y >= R.lo; y -= cfg.pinPitch) add(y);
        });
        // Loose shelves get side clearance against the boards that carry them
        if (cfg.shelfSideGap > 0) {
            model.panels.forEach(function(shelf) {
                if (shelf.role.code !== 'SHELF' || !shelf.horizontal || shelf.poly) return;
                [0, 1, 2].filter(function(i) { return i !== shelf.ti; }).forEach(function(i) {
                    [1, -1].forEach(function(s) {
                        const dir = shelf.ax[i].clone().multiplyScalar(s);
                        const iv = _iv(shelf, dir);
                        const touches = supports.some(function(P) {
                            return P !== shelf && Math.abs(_normal(P).dot(dir)) > 0.999 && Math.abs(_iv(P, dir)[0] - iv[1]) <= 2 &&
                                _overlap(_iv(P, UP), _iv(shelf, UP)) > 0 &&
                                _overlap(_iv(P, V3(0, 0, 0).crossVectors(dir, UP).normalize()), _iv(shelf, V3(0, 0, 0).crossVectors(dir, UP).normalize())) >= 20;
                        });
                        if (touches) _setIv(shelf, dir, iv[0], iv[1] - cfg.shelfSideGap);
                    });
                });
            });
        }

        // --- hinge cups ---
        model.panels.forEach(function(door) {
            if (door.role.code !== 'DOOR') return;
            const styled = door.framed || (door.style && door.style !== 'solid');
            if (styled) { door.notes.push('דלת מסגרת / זכוכית — מתאר בלבד, עיבוד ידני'); return; }
            if (!door.hinge) { door.notes.push('ללא קידוח צירים (דלת הזזה או צד ציר לא ידוע) — עיבוד ידני'); return; }
            if (!cfg.hinges) return;
            const f = door.front;
            const r = V3(0, 0, 0).crossVectors(UP, f).normalize();   // viewer's right when facing the door
            const ivUp = _iv(door, UP), ivR = _iv(door, r);
            const backFace = _iv(door, f)[0];
            const face = _sgn(-f.dot(_normal(door)));
            const drill = function(x, y) {
                door.ops.push({ type: 'drill', d: cfg.cupDia, depth: cfg.cupDepth, face: face, tag: 'cup', p: _pt(r, x, UP, y, f, backFace) });
            };
            if (door.hinge === 'top') {
                _spread(ivR[0], ivR[1], _hingeCount(ivR[1] - ivR[0]), cfg.hingeEdge).forEach(function(x) { drill(x, ivUp[1] - cfg.cupCenter); });
            } else {
                const x = door.hinge === 'left' ? ivR[0] + cfg.cupCenter : ivR[1] - cfg.cupCenter;
                _spread(ivUp[0], ivUp[1], _hingeCount(ivUp[1] - ivUp[0]), cfg.hingeEdge).forEach(function(y) { drill(x, y); });
            }
            if (door.bifold) door.notes.push('כנף בי-פולד: הצירים מחברים אותה לכנף השנייה — לבדוק סוג ציר');
            if (_thick(door) < cfg.cupDepth + 2) model.warnings.push('דלת בעובי ' + _fmt(_thick(door)) + ' מ"מ דקה מדי לכוס ציר בעומק ' + cfg.cupDepth);
        });

        // --- confirmat face holes in sides / dividers against fixed horizontals ---
        const FIXED_H = { TOP: 1, BOTTOM: 1, DESK: 1, SPLIT: 1 };
        const VERT = { SIDE_L: 1, SIDE_R: 1, DIVIDER: 1, UNIT_SIDE: 1, PARTITION: 1 };
        const verts = body.filter(function(p) {
            return VERT[p.role.code] && !p.horizontal && !p.poly && !p.corner && !p.synthetic && _thick(p) >= 12;
        });
        if (cfg.carcassConnectors) {
            model.panels.forEach(function(H) {
                if (!FIXED_H[H.role.code] || !H.horizontal || H.poly || H.corner) return;
                const sUp = _iv(H, UP);
                const y = (sUp[0] + sUp[1]) / 2;
                const find = function(dir) {
                    const e = V3(0, 0, 0).crossVectors(dir, UP).normalize();
                    const end = _iv(H, dir)[1], hE = _iv(H, e);
                    return verts.filter(function(P) {
                        if (P === H || Math.abs(_normal(P).dot(dir)) < 0.999) return false;
                        return Math.abs(_iv(P, dir)[0] - end) <= 2 && _overlap(_iv(P, e), hE) >= 20 &&
                            y > _iv(P, UP)[0] + 2 && y < _iv(P, UP)[1] - 2;
                    });
                };
                const axes = [0, 1, 2].filter(function(i) { return i !== H.ti; }).map(function(i) {
                    const sides = [1, -1].map(function(s) {
                        const dir = H.ax[i].clone().multiplyScalar(s);
                        return { dir: dir, panels: find(dir) };
                    });
                    return { i: i, sides: sides, score: sides.filter(function(s) { return s.panels.length; }).length };
                });
                axes.sort(function(a, b) { return (b.score - a.score) || (a.i - b.i); });
                const pick = axes[0];
                if (!pick || !pick.score) return;
                const depthI = [0, 1, 2].filter(function(i) { return i !== H.ti && i !== pick.i; })[0];
                const depth = H.ax[depthI];
                const dIv = _iv(H, depth), len = dIv[1] - dIv[0];
                if (len < 40) return;
                const inset = len >= 2 * cfg.confEdgeInset + 40 ? cfg.confEdgeInset : len / 4;
                const n = cfg.confCount > 0 ? Math.max(1, Math.round(cfg.confCount)) : (len > 500 ? 3 : 2);
                const pos = [];
                for (let i = 0; i < n; i++) pos.push(dIv[0] + inset + (n === 1 ? 0 : (len - 2 * inset) * i / (n - 1)));
                let any = false;
                pick.sides.forEach(function(side) {
                    side.panels.forEach(function(P) {
                        const pFace = _sgn(-side.dir.dot(_normal(P)));
                        const faceCoord = _iv(P, side.dir)[0];
                        const depthFit = _r1(Math.min(cfg.confFaceDepth, _thick(P) - 2));
                        if (depthFit < 5) return;
                        pos.forEach(function(dPos) {
                            const pe = _iv(P, depth);
                            if (dPos < pe[0] + 8 || dPos > pe[1] - 8) return;
                            const pt = _pt(side.dir, faceCoord, depth, dPos, UP, y);
                            const clash = P.ops.some(function(o) {
                                return o.type === 'drill' && o.face === pFace && o.p.distanceTo(pt) < (o.d + cfg.confFaceDia) / 2 + 2;
                            });
                            if (clash) return;
                            P.ops.push({ type: 'drill', d: cfg.confFaceDia, depth: depthFit, face: pFace, tag: 'confirmat', p: pt });
                            any = true;
                        });
                    });
                });
                if (any) H.notes.push('קידוח קצה קונפירמט Ø7 בעיבוד קצה / ידני');
            });
        }

        // --- hinge mounting-plate holes (aligned to the cups already on the door) ---
        if (cfg.hingePlates && cfg.hinges) {
            const halfP = cfg.platePitch / 2;
            model.panels.forEach(function(door) {
                if (door.role.code !== 'DOOR') return;
                const cups = door.ops.filter(function(o) { return o.type === 'drill' && o.tag === 'cup'; });
                if (!cups.length || !door.hinge) return;
                const f = door.front;
                const r = V3(0, 0, 0).crossVectors(UP, f).normalize();
                const ivUp = _iv(door, UP), ivR = _iv(door, r);

                if (door.hinge === 'top') {
                    const tops = body.filter(function(p) {
                        return p.role.code === 'TOP' && p.horizontal && !p.poly && !p.corner &&
                            _overlap(_iv(p, r), ivR) > 40 && Math.abs(_iv(p, UP)[0] - ivUp[1]) <= 30;
                    });
                    const TOP = tops[0];
                    if (!TOP) {
                        model.warnings.push('קלפה בלי גג תומך — לא נוספו חורי פלטת ציר');
                        return;
                    }
                    const pFace = _sgn(-UP.dot(_normal(TOP)));
                    const faceCoord = _iv(TOP, UP)[0];
                    const frontEdge = _iv(TOP, f)[1];
                    const plateZ = frontEdge - cfg.plateFront;
                    const depthFit = _r1(Math.min(cfg.plateDepth, _thick(TOP) - 2));
                    if (depthFit < 5 || plateZ < _iv(TOP, f)[0] + 8 || plateZ > frontEdge - 8) {
                        model.warnings.push('פלטת ציר לקלפה מחוץ לגבולות הגג — לא נוספה');
                        return;
                    }
                    cups.forEach(function(cup) {
                        const x = cup.p.dot(r);
                        [-halfP, halfP].forEach(function(dx) {
                            const xx = x + dx;
                            if (xx < _iv(TOP, r)[0] + 8 || xx > _iv(TOP, r)[1] - 8) return;
                            const pt = _pt(r, xx, f, plateZ, UP, faceCoord);
                            const clash = TOP.ops.some(function(o) {
                                return o.type === 'drill' && o.face === pFace && o.p.distanceTo(pt) < (o.d + cfg.plateDia) / 2 + 2;
                            });
                            if (!clash) TOP.ops.push({ type: 'drill', d: cfg.plateDia, depth: depthFit, face: pFace, tag: 'plate', p: pt });
                        });
                    });
                    return;
                }

                const hingeOut = door.hinge === 'left' ? r.clone().negate() : r.clone();
                const edge = door.hinge === 'left' ? ivR[0] : ivR[1];
                const doorR = door.c.dot(r);
                const sides = verts.filter(function(P) {
                    if (Math.abs(_normal(P).dot(r)) < 0.999) return false;
                    // Wall must sit on the hinge side of the door and near the hinge edge (same axis as `edge`)
                    if (door.hinge === 'left' ? P.c.dot(r) > doorR : P.c.dot(r) < doorR) return false;
                    const pR = _iv(P, r);
                    return Math.min(Math.abs(pR[0] - edge), Math.abs(pR[1] - edge)) <= 40 &&
                        _overlap(_iv(P, UP), ivUp) > 50;
                });
                if (!sides.length) {
                    model.warnings.push('דלת ' + door.hinge + ' בלי דופן תומכת — לא נוספו חורי פלטת ציר');
                    return;
                }
                const P = sides.sort(function(a, b) {
                    const da = Math.min(Math.abs(_iv(a, r)[0] - edge), Math.abs(_iv(a, r)[1] - edge));
                    const db = Math.min(Math.abs(_iv(b, r)[0] - edge), Math.abs(_iv(b, r)[1] - edge));
                    return da - db;
                })[0];
                const pFace = _sgn(-hingeOut.dot(_normal(P)));
                const faceCoord = _iv(P, hingeOut)[0];
                const frontEdge = _iv(P, f)[1];
                const plateZ = frontEdge - cfg.plateFront;
                const depthFit = _r1(Math.min(cfg.plateDepth, _thick(P) - 2));
                if (depthFit < 5 || plateZ < _iv(P, f)[0] + 8 || plateZ > frontEdge - 8) {
                    model.warnings.push('פלטת ציר מחוץ לגבולות הדופן — לא נוספה');
                    return;
                }
                cups.forEach(function(cup) {
                    const y = cup.p.dot(UP);
                    [-halfP, halfP].forEach(function(dy) {
                        const yy = y + dy;
                        if (yy < _iv(P, UP)[0] + 8 || yy > _iv(P, UP)[1] - 8) return;
                        const pt = _pt(hingeOut, faceCoord, f, plateZ, UP, yy);
                        const clash = P.ops.some(function(o) {
                            return o.type === 'drill' && o.face === pFace && o.p.distanceTo(pt) < (o.d + cfg.plateDia) / 2 + 2;
                        });
                        if (!clash) P.ops.push({ type: 'drill', d: cfg.plateDia, depth: depthFit, face: pFace, tag: 'plate', p: pt });
                    });
                });
            });
        }

        // Corner-unit carcass boards are exported as outlines only
        const cornerBoards = model.panels.filter(function(p) {
            return p.corner && !p.isFront && !p.ops.length && p.role.code !== 'DRAWER_FRONT' && p.role.code !== 'DOOR';
        });
        cornerBoards.forEach(function(p) { p.notes.push('יחידת פינה — מתאר בלבד, קידוחים וחריצים בעיבוד ידני'); });
        if (cornerBoards.length) model.warnings.push(cornerBoards.length + ' לוחות של יחידת הפינה יוצאו כמתאר בלבד (ללא חורי מדף וחריץ גב)');
        return model;
    }

    // ---------- flat 2D records ----------
    function _finalize(model, cfg) {
        const UP = V3(0, 1, 0);
        const recs = [];
        model.panels.forEach(function(p) {
            const n = _normal(p);
            const isBack = p.role.code === 'BACK';
            // Face A = the machined face (doors: the back face)
            let faceA = 1;
            if (p.isFront) faceA = _sgn(-p.front.dot(n));
            else {
                let pos = 0, neg = 0;
                p.ops.forEach(function(o) { if (o.face > 0) pos++; else neg++; });
                if (neg > pos) faceA = -1;
            }
            const N = n.clone().multiplyScalar(faceA);
            const inPlane = [0, 1, 2].filter(function(i) { return i !== p.ti; });
            let U;
            if (p.horizontal) {
                // Grain along the cabinet's width; shaped boards along their long side
                const ui = p.poly ? (p.half[inPlane[0]] >= p.half[inPlane[1]] ? inPlane[0] : inPlane[1]) : (p.ti !== 0 ? 0 : 2);
                U = p.ax[ui].clone();
            } else {
                const vi = Math.abs(p.ax[inPlane[0]].dot(UP)) >= Math.abs(p.ax[inPlane[1]].dot(UP)) ? inPlane[0] : inPlane[1];
                const hi = vi === inPlane[0] ? inPlane[1] : inPlane[0];
                const vLen = p.half[vi] * 2, hLen = p.half[hi] * 2;
                const across = p.role.code === 'DRAWER_FRONT' || p.role.code === 'PLINTH' ||
                    (p.role.code !== 'DOOR' && !isBack && hLen > 2 * vLen && vLen < 300);
                if (across) {
                    const want = V3(0, 0, 0).crossVectors(UP, N);
                    U = p.ax[hi].clone().multiplyScalar(_sgn(p.ax[hi].dot(want)));
                } else {
                    U = p.ax[vi].clone().multiplyScalar(_sgn(p.ax[vi].dot(UP)));
                }
            }
            const V = V3(0, 0, 0).crossVectors(N, U).normalize();

            // Edge roles (in face A terms)
            const edgeOf = function(dir) {
                const du = dir.dot(U), dv = dir.dot(V);
                if (du > 0.9) return 'x1';
                if (du < -0.9) return 'x0';
                if (dv > 0.9) return 'y1';
                if (dv < -0.9) return 'y0';
                return null;
            };
            const frontEdge = (!p.isFront && p.frontKnown && !isBack) ? edgeOf(p.front) : null;
            const topEdge = (!p.horizontal && (p.isFront || isBack)) ? edgeOf(UP) : null;
            const band = { x0: false, x1: false, y0: false, y1: false };
            if (p.role.code === 'DOOR' || p.role.code === 'DRAWER_FRONT') band.x0 = band.x1 = band.y0 = band.y1 = true;
            else if (frontEdge && p.role.code !== 'PLINTH') band[frontEdge] = true;
            if (cfg.edgeBandThickness > 0 && !p.poly) {
                [['x0', U, -1], ['x1', U, 1], ['y0', V, -1], ['y1', V, 1]].forEach(function(e) {
                    if (!band[e[0]]) return;
                    const dir = e[1].clone().multiplyScalar(e[2]);
                    const iv = _iv(p, dir);
                    _setIv(p, dir, iv[0], iv[1] - cfg.edgeBandThickness);
                });
            }

            const uIv = _iv(p, U), vIv = _iv(p, V);
            const L = uIv[1] - uIv[0], W = vIv[1] - vIv[0];
            const map = function(pt) { return [pt.dot(U) - uIv[0], pt.dot(V) - vIv[0]]; };
            const loop = function(pts) {
                const l = pts.map(map);
                if (_loopArea(l) < 0) l.reverse();
                return l.map(function(q) { return [_r1(q[0]), _r1(q[1])]; });
            };
            const rec = {
                code: p.role.code, name: p.role.name, order: p.role.order,
                wings: p.wing ? [p.wing] : [], qty: 1,
                L: _r1(L), W: _r1(W), T: _r1(_thick(p)),
                matKey: p.matKey, matLabel: _matLabel(p.matKey), grain: !isBack,
                outline: p.poly ? loop(p.poly) : [[0, 0], [_r1(L), 0], [_r1(L), _r1(W)], [0, _r1(W)]],
                holes: p.poly ? (p.holes || []).map(loop) : [],
                shaped: !!p.poly,
                faces: { A: { drills: [], grooves: [] }, B: { drills: [], grooves: [] } },
                marks: { front: frontEdge, top: topEdge },
                band: band, notes: p.notes.filter(function(s, i, a) { return a.indexOf(s) === i; }),
                poses: [{
                    c: [p.c.x, p.c.y, p.c.z],
                    ax: p.ax.map(function(a) { return [a.x, a.y, a.z]; }),
                    half: p.half.slice()
                }],
                hinges: []
            };
            p.ops.forEach(function(o) {
                const side = (o.face === faceA) ? 'A' : 'B';
                // Face B is the board turned over about its Y axis: x mirrors, y stays
                const flip = function(q) { return side === 'A' ? q : [L - q[0], q[1]]; };
                if (o.type === 'drill') {
                    const q = flip(map(o.p));
                    rec.faces[side].drills.push({ x: _r1(q[0]), y: _r1(q[1]), d: o.d, depth: o.depth, tag: o.tag });
                    if (o.tag === 'cup') rec.hinges.push([_r1(o.p.x), _r1(o.p.y), _r1(o.p.z)]);
                } else {
                    const a = flip(map(o.a)), b = flip(map(o.b));
                    rec.faces[side].grooves.push({
                        x0: _r1(Math.min(a[0], b[0])), y0: _r1(Math.min(a[1], b[1])),
                        x1: _r1(Math.max(a[0], b[0])), y1: _r1(Math.max(a[1], b[1])),
                        width: o.width, depth: o.depth
                    });
                }
            });
            ['A', 'B'].forEach(function(s) {
                rec.faces[s].drills.sort(function(a, b) { return (a.x - b.x) || (a.y - b.y) || (a.d - b.d); });
                rec.faces[s].grooves.sort(function(a, b) { return (a.x0 - b.x0) || (a.y0 - b.y0); });
            });
            rec.twoSided = rec.faces.B.drills.length + rec.faces.B.grooves.length > 0;
            if (rec.twoSided) rec.notes.push('עיבוד משני הצדדים — קובץ נוסף לפנים B (הפיכה סביב ציר Y)');
            recs.push(rec);
        });

        // Identical boards share one id
        const byKey = new Map();
        recs.forEach(function(r) {
            const key = JSON.stringify([r.code, r.L, r.W, r.T, r.matKey, r.outline, r.holes, r.faces, r.band, r.marks, r.notes]);
            const hit = byKey.get(key);
            if (hit) {
                hit.qty++;
                r.wings.forEach(function(w) { if (hit.wings.indexOf(w) < 0) hit.wings.push(w); });
                if (r.poses) hit.poses.push.apply(hit.poses, r.poses);
                if (r.hinges) hit.hinges.push.apply(hit.hinges, r.hinges);
            } else {
                byKey.set(key, r);
            }
        });
        const list = Array.from(byKey.values());
        list.sort(function(a, b) { return (a.order - b.order) || (b.L - a.L) || (b.W - a.W) || (b.T - a.T); });
        list.forEach(function(r, i) {
            r.id = 'P' + String(i + 1).padStart(3, '0');
            const stem = r.id + '_' + r.code + '_' + _fmt(r.L) + 'x' + _fmt(r.W) + 'x' + _fmt(r.T);
            r.file = 'panels/' + stem + '.dxf';
            r.fileB = r.twoSided ? 'panels/' + stem + '_B.dxf' : '';
        });
        return list;
    }

    // ---------- validation ----------
    function _pointInLoop(x, y, l) {
        let inside = false;
        for (let i = 0, j = l.length - 1; i < l.length; j = i++) {
            const a = l[i], b = l[j];
            if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
        }
        return inside;
    }
    function _distToLoop(x, y, l) {
        let best = Infinity;
        for (let i = 0; i < l.length; i++) {
            const a = l[i], b = l[(i + 1) % l.length];
            const dx = b[0] - a[0], dy = b[1] - a[1];
            const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / ((dx * dx + dy * dy) || 1)));
            best = Math.min(best, Math.hypot(x - a[0] - t * dx, y - a[1] - t * dy));
        }
        return best;
    }
    function _validate(list, model) {
        const w = model.warnings;
        list.forEach(function(r) {
            const who = r.id + ' ' + r.name;
            ['A', 'B'].forEach(function(s) {
                const f = r.faces[s];
                f.drills.forEach(function(d, i) {
                    if (!_pointInLoop(d.x, d.y, r.outline)) { w.push(who + ': קידוח Ø' + d.d + ' מחוץ למתאר הלוח'); return; }
                    if (_distToLoop(d.x, d.y, r.outline) < d.d / 2 + 2) w.push(who + ': קידוח Ø' + d.d + ' קרוב מדי לקצה הלוח');
                    if (d.depth > r.T - 1.5) w.push(who + ': קידוח בעומק ' + d.depth + ' בלוח בעובי ' + r.T);
                    for (let j = i + 1; j < f.drills.length; j++) {
                        const o = f.drills[j];
                        if (Math.hypot(d.x - o.x, d.y - o.y) < (d.d + o.d) / 2 + 2) { w.push(who + ': קידוחים חופפים בפנים ' + s); break; }
                    }
                });
                f.grooves.forEach(function(g) {
                    if (g.x0 < -0.1 || g.y0 < -0.1 || g.x1 > r.L + 0.1 || g.y1 > r.W + 0.1) w.push(who + ': חריץ חורג ממתאר הלוח');
                    if (g.depth > r.T - 3) w.push(who + ': חריץ בעומק ' + g.depth + ' בלוח בעובי ' + r.T);
                });
            });
            // Holes from both faces that meet inside the board
            const meet = r.faces.A.drills.some(function(d) {
                return r.faces.B.drills.some(function(o) {
                    return Math.hypot(d.x - (r.L - o.x), d.y - o.y) < (d.d + o.d) / 2 && d.depth + o.depth > r.T - 1;
                });
            });
            if (meet) w.push(who + ': קידוחים משני צדי הלוח באותו מיקום נפגשים (עומק כולל גדול מעובי הלוח) — לקדוח חור עובר או להקטין עומק');
        });
        const total = list.reduce(function(s, r) { return s + r.qty; }, 0);
        if (total !== model.sceneBoards) w.push('בדיקת כמות: ' + total + ' לוחות בייצוא מול ' + model.sceneBoards + ' לוחות עץ בהדמיה');
        return w;
    }

    function _build(cfg) {
        cfg = Object.assign({}, CNC_DEFAULTS, cfg || {});
        const model = _ops(_rules(_collect(), cfg), cfg);
        const list = _finalize(model, cfg);
        const warnings = _validate(list, model);
        // Doors that are defined but switched off in the view are not in the scene
        if (typeof state !== 'undefined' && state.hasDoors === false && (state.columns || []).some(function(c) {
            return c && (c.doors || []).some(function(d) { return d && d.type && d.type !== 'empty'; });
        })) warnings.unshift('הדלתות כבויות בארון זה — דלתות לא נכללות בייצוא');
        const stock = {};
        list.forEach(function(r) {
            const k = (r.matKey || 'unknown') + '|' + r.T;
            if (!stock[k]) stock[k] = { matKey: r.matKey || 'unknown', matLabel: r.matLabel, T: r.T, count: 0, area: 0, items: [] };
            stock[k].count += r.qty;
            stock[k].area += r.qty * r.L * r.W / 1e6;
            stock[k].items.push(r);
        });
        return {
            cfg: cfg, panels: list, warnings: Array.from(new Set(warnings)), skipped: model.skipped,
            stock: Object.keys(stock).map(function(k) { return stock[k]; }),
            total: list.reduce(function(s, r) { return s + r.qty; }, 0),
            tMain: model.tMain
        };
    }

    // ---------- DXF R12 ----------
    const LAYER_COLORS = { CUT_OUT: 7, CUT_IN: 6, INFO: 8 };
    function _drillLayer(d) { return 'DRILL_D' + _tag(d.d) + '_Z' + _tag(d.depth); }
    function _grooveLayer(g) { return 'GROOVE_W' + _tag(g.width) + '_Z' + _tag(g.depth); }
    function _layerColor(name) {
        if (LAYER_COLORS[name]) return LAYER_COLORS[name];
        if (/^GROOVE/.test(name)) return 3;
        const m = /^DRILL_D(\d+)/.exec(name);
        return m ? (Number(m[1]) >= 20 ? 5 : 1) : 4;
    }
    function _markPos(edge, L, W, h, text) {
        const len = text.length * h * 0.8;
        if (edge === 'y0') return { x: L / 2 - len / 2, y: h * 0.6, rot: 0 };
        if (edge === 'y1') return { x: L / 2 - len / 2, y: W - h * 1.6, rot: 0 };
        if (edge === 'x0') return { x: h * 1.6, y: W / 2 - len / 2, rot: 90 };
        return { x: L - h * 0.6, y: W / 2 - len / 2, rot: 90 };
    }
    function _flipEdge(edge) { return edge === 'x0' ? 'x1' : (edge === 'x1' ? 'x0' : edge); }
    /** Drawing entities of one face of a board, shared by the DXF writer and the on-screen preview. */
    function _entities(r, side, ox, oy) {
        ox = ox || 0; oy = oy || 0;
        const B = side === 'B';
        const fx = function(q) { return [(B ? r.L - q[0] : q[0]) + ox, q[1] + oy]; };
        const ents = [];
        const poly = function(layer, l) {
            let pts = l.map(fx);
            if (_loopArea(pts) < 0) pts = pts.reverse();
            ents.push({ t: 'poly', layer: layer, pts: pts });
        };
        poly('CUT_OUT', r.outline);
        r.holes.forEach(function(hl) { poly('CUT_IN', hl); });
        const f = r.faces[side];
        f.grooves.forEach(function(g) {
            ents.push({ t: 'poly', layer: _grooveLayer(g), pts: [[g.x0 + ox, g.y0 + oy], [g.x1 + ox, g.y0 + oy], [g.x1 + ox, g.y1 + oy], [g.x0 + ox, g.y1 + oy]] });
        });
        f.drills.forEach(function(d) { ents.push({ t: 'circle', layer: _drillLayer(d), x: d.x + ox, y: d.y + oy, r: d.d / 2 }); });
        const h = Math.max(3, Math.min(16, Math.min(r.L, r.W) / 12));
        const text = function(x, y, s, rot) { ents.push({ t: 'text', layer: 'INFO', x: x + ox, y: y + oy, h: h, text: s, rot: rot || 0 }); };
        const cy = Math.max(h * 2.4, r.W / 2 - h * 1.5);
        text(h * 2.4, cy + h * 1.6, r.id + ' ' + r.code + ' ' + _fmt(r.L) + 'x' + _fmt(r.W) + 'x' + _fmt(r.T));
        text(h * 2.4, cy, 'QTY ' + r.qty + (r.twoSided ? (B ? '  FACE B - FLIPPED ABOUT Y' : '  FACE A - SEE FACE B FILE') : ''));
        [['front', 'FRONT'], ['top', 'TOP']].forEach(function(m) {
            let edge = r.marks[m[0]];
            if (!edge) return;
            if (B) edge = _flipEdge(edge);
            const pos = _markPos(edge, r.L, r.W, h, m[1]);
            text(pos.x, pos.y, m[1], pos.rot);
        });
        return ents;
    }
    function _dxfFile(ents) {
        const out = [];
        const w = function(code, val) { out.push(String(code), String(val)); };
        const n = function(x) { return (Math.round(x * 1000) / 1000).toString(); };
        const layers = [];
        ents.forEach(function(e) { if (layers.indexOf(e.layer) < 0) layers.push(e.layer); });
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        const ext = function(x, y) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); };
        ents.forEach(function(e) {
            if (e.t === 'poly') e.pts.forEach(function(p) { ext(p[0], p[1]); });
            else if (e.t === 'circle') { ext(e.x - e.r, e.y - e.r); ext(e.x + e.r, e.y + e.r); }
        });
        if (!isFinite(x0)) { x0 = y0 = x1 = y1 = 0; }
        w(0, 'SECTION'); w(2, 'HEADER');
        w(9, '$ACADVER'); w(1, 'AC1009');
        w(9, '$INSBASE'); w(10, 0); w(20, 0); w(30, 0);
        w(9, '$EXTMIN'); w(10, n(x0)); w(20, n(y0)); w(30, 0);
        w(9, '$EXTMAX'); w(10, n(x1)); w(20, n(y1)); w(30, 0);
        w(0, 'ENDSEC');
        w(0, 'SECTION'); w(2, 'TABLES');
        w(0, 'TABLE'); w(2, 'LTYPE'); w(70, 1);
        w(0, 'LTYPE'); w(2, 'CONTINUOUS'); w(70, 64); w(3, 'Solid line'); w(72, 65); w(73, 0); w(40, '0.0');
        w(0, 'ENDTAB');
        w(0, 'TABLE'); w(2, 'LAYER'); w(70, layers.length + 1);
        w(0, 'LAYER'); w(2, '0'); w(70, 0); w(62, 7); w(6, 'CONTINUOUS');
        layers.forEach(function(l) { w(0, 'LAYER'); w(2, l); w(70, 0); w(62, _layerColor(l)); w(6, 'CONTINUOUS'); });
        w(0, 'ENDTAB');
        w(0, 'TABLE'); w(2, 'STYLE'); w(70, 1);
        w(0, 'STYLE'); w(2, 'STANDARD'); w(70, 0); w(40, '0.0'); w(41, '1.0'); w(50, '0.0'); w(71, 0); w(42, '2.5'); w(3, 'txt'); w(4, '');
        w(0, 'ENDTAB');
        w(0, 'ENDSEC');
        w(0, 'SECTION'); w(2, 'ENTITIES');
        ents.forEach(function(e) {
            if (e.t === 'poly') {
                w(0, 'POLYLINE'); w(8, e.layer); w(66, 1); w(10, 0); w(20, 0); w(30, 0); w(70, 1);
                e.pts.forEach(function(p) { w(0, 'VERTEX'); w(8, e.layer); w(10, n(p[0])); w(20, n(p[1])); w(30, 0); });
                w(0, 'SEQEND'); w(8, e.layer);
            } else if (e.t === 'circle') {
                w(0, 'CIRCLE'); w(8, e.layer); w(10, n(e.x)); w(20, n(e.y)); w(30, 0); w(40, n(e.r));
            } else {
                w(0, 'TEXT'); w(8, e.layer); w(10, n(e.x)); w(20, n(e.y)); w(30, 0); w(40, n(e.h)); w(1, e.text);
                if (e.rot) w(50, n(e.rot));
            }
        });
        w(0, 'ENDSEC');
        w(0, 'EOF');
        return out.join('\r\n') + '\r\n';
    }
    function _panelDxf(r, side) { return _dxfFile(_entities(r, side || 'A', 0, 0)); }
    /** Every copy of every board of one stock, laid out in rows for a single CAM import. */
    function _stockDxf(items) {
        const GAP = 40;
        const all = [];
        items.forEach(function(r) { for (let i = 0; i < r.qty; i++) all.push(r); });
        all.sort(function(a, b) { return (b.W - a.W) || (b.L - a.L); });
        const rowMax = Math.max(2800, Math.max.apply(null, all.map(function(r) { return r.L; })));
        let x = 0, y = 0, rowH = 0, ents = [];
        all.forEach(function(r) {
            if (x > 0 && x + r.L > rowMax) { x = 0; y += rowH + GAP; rowH = 0; }
            ents = ents.concat(_entities(r, 'A', x, y));
            x += r.L + GAP;
            rowH = Math.max(rowH, r.W);
        });
        return _dxfFile(ents);
    }

    // ---------- cut list / readme ----------
    function _csv(result) {
        const head = ['מזהה', 'שם חלק', 'כנף', 'כמות', 'אורך (מ"מ)', 'רוחב (מ"מ)', 'עובי (מ"מ)', 'חומר', 'קוד חומר', 'כיוון סיבים',
            'קנט אורך 1 (Y=0)', 'קנט אורך 2 (Y=רוחב)', 'קנט רוחב 1 (X=0)', 'קנט רוחב 2 (X=אורך)',
            'קידוחים', 'חריצים', 'קובץ DXF', 'קובץ DXF פנים B', 'הערות'];
        const esc = function(v) { const s = String(v == null ? '' : v); return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
        const rows = [head];
        result.panels.forEach(function(r) {
            rows.push([r.id, r.name, r.wings.map(_wingLabel).join(' + '), r.qty, r.L, r.W, r.T, r.matLabel, r.matKey || '',
                r.grain ? 'לאורך' : 'ללא',
                r.band.y0 ? 1 : 0, r.band.y1 ? 1 : 0, r.band.x0 ? 1 : 0, r.band.x1 ? 1 : 0,
                r.faces.A.drills.length + r.faces.B.drills.length, r.faces.A.grooves.length + r.faces.B.grooves.length,
                r.file, r.fileB, r.notes.join(' | ')]);
        });
        return '\uFEFF' + rows.map(function(row) { return row.map(esc).join(','); }).join('\r\n') + '\r\n';
    }
    function _layerList(result) {
        const set = {};
        result.panels.forEach(function(r) {
            ['A', 'B'].forEach(function(s) {
                r.faces[s].drills.forEach(function(d) { set[_drillLayer(d)] = 'קידוח Ø' + d.d + ' בעומק ' + d.depth + ' מ"מ (מרכז העיגול = מרכז הקידוח)'; });
                r.faces[s].grooves.forEach(function(g) { set[_grooveLayer(g)] = 'חריץ ברוחב ' + _fmt(g.width) + ' ובעומק ' + g.depth + ' מ"מ (מלבן סגור — כיס)'; });
            });
        });
        return set;
    }
    function _readme(result, name) {
        const c = result.cfg, L = [];
        L.push('AnyCloset 3D — ייצוא CNC', 'ארון: ' + name, 'תאריך: ' + new Date().toLocaleString('he-IL'), '');
        L.push('תוכן החבילה', '------------');
        L.push('panels/           קובץ DXF לכל לוח ייחודי. לוח עם עיבוד משני הצדדים מקבל קובץ נוסף בסיומת _B.');
        L.push('all_*.dxf         כל הלוחות של אותו חומר ועובי (כולל כפילויות לפי כמות), פרוסים בשורות — לייבוא אחד ל-CAM ולקינון שם. פנים A בלבד.');
        L.push('cutlist.csv       רשימת חיתוך (נפתחת באקסל).', '');
        L.push('מוסכמות', '-------');
        L.push('DXF R12, יחידות מ"מ, קנה מידה 1:1. ראשית הצירים בפינה השמאלית-תחתונה של הלוח.');
        L.push('ציר X לאורך הסיבים (אורך ברשימת החיתוך), ציר Y לרוחב.');
        L.push('כל לוח משורטט במבט על הפנים המעובדות (דופן — הפנים הפנימיות; דלת — גב הדלת), ללא היפוך מראה.');
        L.push('קובץ _B: הלוח הפוך סביב ציר Y (X מתהפך, Y נשאר).');
        L.push('הכיתוב FRONT מסמן את הקצה הקדמי של הלוח, TOP את הקצה העליון של דלת / חזית / גב.', '');
        L.push('שכבות', '------');
        L.push('CUT_OUT           מתאר חיצוני לחיתוך (פוליליין סגור)');
        L.push('CUT_IN            חיתוך פנימי (אם קיים)');
        const layers = _layerList(result);
        Object.keys(layers).sort().forEach(function(k) { L.push((k + '                  ').slice(0, 18) + layers[k]); });
        L.push('INFO              כיתוב בלבד — לא לעיבוד', '');
        L.push('הגדרות שבהן הופק הקובץ', '----------------------');
        L.push('גב: ' + (c.backMode === 'groove'
            ? 'בחריץ — ' + c.backSetback + ' מ"מ מהקצה האחורי, עומק ' + c.grooveDepth + ', רוחב = עובי הגב + ' + c.grooveClearance + '. הגב גדל ' + Math.max(0, c.grooveDepth - 1) + ' מ"מ לכל צד שנכנס לחריץ.'
            : 'בין הדפנות, ללא חריץ.'));
        L.push('מדפים: ' + (c.shelfPins
            ? 'חורי פינים Ø' + c.pinDia + ' בעומק ' + c.pinDepth + ', ' + c.pinInset + ' מ"מ מקצה המדף' + (c.pinRows ? ', שורות מלאות בפסיעת ' + c.pinPitch : ', 2 חורים לכל צד')
            : 'ללא חורי פינים') + '. מרווח צד למדף: ' + c.shelfSideGap + ' מ"מ לכל צד.');
        L.push('צירים: ' + (c.hinges
            ? 'כוס Ø' + c.cupDia + ' בעומק ' + c.cupDepth + ', מרכז ' + c.cupCenter + ' מ"מ מקצה הדלת, ראשון ואחרון ' + c.hingeEdge + ' מ"מ מהקצוות. כמות לפי גובה: עד 900 — 2, עד 1600 — 3, עד 2000 — 4, מעל — 5.'
            : 'ללא קידוח כוסות.') +
            (c.hingePlates
                ? ' פלטות בדפנות: Ø' + c.plateDia + '×' + c.plateDepth + ', מרווח ' + c.platePitch + ', מרכז ' + c.plateFront + ' מ"מ מהקצה הקדמי.'
                : ' ללא חורי פלטות.'));
        L.push('חיבורי גוף: ' + (c.carcassConnectors
            ? 'קונפירמט — קידוח פנים בדפנות/מחיצות Ø' + c.confFaceDia + ' (עומק עד ' + c.confFaceDepth + ', מצומצם לעובי הלוח), ' +
              c.confEdgeInset + ' מ"מ מקצה קדמי/אחורי' + (c.confCount > 0 ? ', ' + c.confCount + ' חורים לחיבור.' : ' (2 עד עומק 500, אחרת 3).') +
              ' קידוח הקצה בלוח האופקי (Ø7) אינו ב-DXF — הערה בלבד.'
            : 'ללא חורי קונפירמט.'));
        L.push('צוקל: ' + ['בלוק הצוקל לא יוצא', 'פס קדמי לכל בלוק צוקל', 'פס קדמי ואחורי לכל בלוק צוקל'][Math.max(0, Math.min(2, Math.round(c.plinthStrips)))] + '.');
        L.push('קנט: ' + (c.edgeBandThickness > 0 ? 'מידות החיתוך קטנות ב-' + c.edgeBandThickness + ' מ"מ בכל קצה מקונט.' : 'מידות החיתוך הן מידות גמר (ללא הפחתת קנט).'), '');
        L.push('סיכום חומרים', '------------');
        result.stock.forEach(function(s) { L.push(s.matLabel + ' ' + s.T + ' מ"מ: ' + s.count + ' לוחות, ' + s.area.toFixed(2) + ' מ"ר נטו'); });
        L.push('');
        L.push('לא כלול', '-------');
        L.push('מיניפיקס ודיבלים (רק קונפירמט), קידוח קצה קונפירמט בלוח האופקי, ארגזי מגירות וחורי מסילות,');
        L.push('קינון על גיליון, ייצוא כל ההזמנה בבת אחת, ו-G-code. כיוון הסיבים והקנטים נקבעים לפי מוסכמה — לבדוק מול ההזמנה.', '');
        if (result.skipped.length) {
            L.push('חלקים שלא יוצאו', '---------------');
            result.skipped.forEach(function(s) { L.push('- ' + s); });
            L.push('');
        }
        L.push('אזהרות', '------');
        if (result.warnings.length) result.warnings.forEach(function(s) { L.push('- ' + s); });
        else L.push('אין');
        return '\uFEFF' + L.join('\r\n') + '\r\n';
    }

    async function _download(result) {
        const x3 = X3();
        const name = x3.fileBaseName ? x3.fileBaseName() : 'ארון';
        const JSZip = await x3.loadJSZip();
        const zip = new JSZip();
        result.panels.forEach(function(r) {
            zip.file(r.file, _panelDxf(r, 'A'));
            if (r.fileB) zip.file(r.fileB, _panelDxf(r, 'B'));
        });
        result.stock.forEach(function(s) {
            zip.file('all_' + String(s.matKey).replace(/[^\w.-]+/g, '_') + '_' + _fmt(s.T) + 'mm.dxf', _stockDxf(s.items));
        });
        zip.file('cutlist.csv', _csv(result));
        zip.file('README.txt', _readme(result, name));
        x3.download(await zip.generateAsync({ type: 'blob' }), name + ' - CNC.zip');
    }

    // ---------- preview ----------
    const SVG_COLORS = { CUT_OUT: '#0f172a', CUT_IN: '#a21caf', INFO: '#94a3b8' };
    function _svgColor(layer) {
        if (SVG_COLORS[layer]) return SVG_COLORS[layer];
        if (/^GROOVE/.test(layer)) return '#16a34a';
        const m = /^DRILL_D(\d+)/.exec(layer);
        return (m && Number(m[1]) >= 20) ? '#2563eb' : '#dc2626';
    }
    function _svg(r, side) {
        const pad = Math.max(r.L, r.W) * 0.04 + 6;
        const sw = Math.max(r.L, r.W) / 400;
        const y = function(v) { return r.W - v; };
        let s = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + [-pad, -pad, r.L + 2 * pad, r.W + 2 * pad].map(_r1).join(' ') +
            '" style="width:100%;height:100%;display:block;" preserveAspectRatio="xMidYMid meet">';
        _entities(r, side, 0, 0).forEach(function(e) {
            const col = _svgColor(e.layer);
            if (e.t === 'poly') {
                s += '<polygon points="' + e.pts.map(function(p) { return _r1(p[0]) + ',' + _r1(y(p[1])); }).join(' ') + '" fill="' +
                    (e.layer === 'CUT_OUT' ? '#f8fafc' : (/^GROOVE/.test(e.layer) ? 'rgba(22,163,74,.25)' : '#fff')) +
                    '" stroke="' + col + '" stroke-width="' + sw * (e.layer === 'CUT_OUT' ? 1.6 : 1) + '"/>';
            } else if (e.t === 'circle') {
                s += '<circle cx="' + _r1(e.x) + '" cy="' + _r1(y(e.y)) + '" r="' + Math.max(e.r, sw * 1.5) + '" fill="' + col + '" fill-opacity=".25" stroke="' + col + '" stroke-width="' + sw + '"/>';
            } else {
                s += '<text x="' + _r1(e.x) + '" y="' + _r1(y(e.y)) + '" font-size="' + _r1(e.h) + '" fill="' + col + '" font-family="monospace" direction="ltr"' +
                    (e.rot ? ' transform="rotate(' + (-e.rot) + ' ' + _r1(e.x) + ' ' + _r1(y(e.y)) + ')"' : '') + '>' + e.text + '</text>';
            }
        });
        return s + '</svg>';
    }

    // ---------- dialog ----------
    const FIELDS = [
        { sec: 'גב הארון' },
        { k: 'backMode', label: 'חיבור הגב', opts: [['groove', 'בחריץ (נוט)'], ['between', 'בין הדפנות, ללא חריץ']] },
        { k: 'backSetback', label: 'מרחק החריץ מהקצה האחורי', groove: true },
        { k: 'grooveDepth', label: 'עומק חריץ', groove: true },
        { k: 'grooveClearance', label: 'מרווח ברוחב החריץ', groove: true, step: 0.1 },
        { sec: 'מדפים' },
        { k: 'shelfPins', label: 'חורי פיני מדף', check: true },
        { k: 'pinDia', label: 'קוטר', step: 0.5 },
        { k: 'pinDepth', label: 'עומק', step: 0.5 },
        { k: 'pinInset', label: 'מרחק מקצה המדף' },
        { k: 'pinRows', label: 'שורת חורים מלאה בפסיעת 32', check: true },
        { k: 'shelfSideGap', label: 'מרווח צד למדף (לכל צד)', step: 0.5 },
        { sec: 'צירים' },
        { k: 'hinges', label: 'כוסות צירים בדלתות', check: true },
        { k: 'cupDia', label: 'קוטר כוס', step: 0.5 },
        { k: 'cupDepth', label: 'עומק כוס', step: 0.5 },
        { k: 'cupCenter', label: 'מרכז הכוס מקצה הדלת', step: 0.5 },
        { k: 'hingeEdge', label: 'ציר ראשון / אחרון מהקצה' },
        { k: 'hingePlates', label: 'חורי פלטות צירים בדפנות', check: true },
        { k: 'plateDia', label: 'קוטר פלטה', step: 0.5 },
        { k: 'plateDepth', label: 'עומק פלטה', step: 0.5 },
        { k: 'platePitch', label: 'מרווח בין בורגי הפלטה' },
        { k: 'plateFront', label: 'מרכז הפלטה מקצה הדופן הקדמי' },
        { sec: 'חיבורי גוף' },
        { k: 'carcassConnectors', label: 'חורי קונפירמט בדפנות', check: true },
        { k: 'confFaceDia', label: 'קוטר קידוח פנים', step: 0.5 },
        { k: 'confFaceDepth', label: 'עומק קידוח פנים', step: 0.5 },
        { k: 'confEdgeInset', label: 'מרחק מקצה קדמי / אחורי' },
        { k: 'confCount', label: 'מספר חורים לחיבור (0=אוטומטי)' },
        { sec: 'כללי' },
        { k: 'plinthStrips', label: 'לוחות צוקל לכל בלוק', opts: [[0, 'ללא'], [1, 'פס קדמי'], [2, 'פס קדמי + אחורי']] },
        { k: 'edgeBandThickness', label: 'הפחתת עובי קנט ממידת החיתוך', step: 0.1 }
    ];
    const UI = { cfg: null, result: null, sel: 0, hover: -1, side: 'A', timer: null, view: null, hideDoors: false };
    function _esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
    function _toast(msg, ms) {
        if (typeof _showToast === 'function') { _showToast(msg, ms || 4000); return; }
        if (X3().toast) X3().toast(msg);
    }

    function _settingsHtml() {
        const c = UI.cfg;
        const inputCss = 'width:74px;padding:4px 6px;border:1px solid #cbd5e1;border-radius:6px;font:inherit;font-size:.8rem;text-align:center;direction:ltr;';
        return FIELDS.map(function(f) {
            if (f.sec) return '<div style="font-weight:800;font-size:.8rem;color:#4f46e5;margin:12px 0 4px;">' + f.sec + '</div>';
            const dim = (f.groove && c.backMode !== 'groove') ? 'opacity:.4;pointer-events:none;' : '';
            let ctl;
            if (f.check) {
                ctl = '<input type="checkbox" data-cnc="' + f.k + '"' + (c[f.k] ? ' checked' : '') + ' style="width:16px;height:16px;cursor:pointer;">';
            } else if (f.opts) {
                ctl = '<select data-cnc="' + f.k + '" style="max-width:150px;padding:4px 6px;border:1px solid #cbd5e1;border-radius:6px;font:inherit;font-size:.78rem;">' +
                    f.opts.map(function(o) { return '<option value="' + o[0] + '"' + (String(c[f.k]) === String(o[0]) ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select>';
            } else {
                ctl = '<input type="number" data-cnc="' + f.k + '" value="' + c[f.k] + '" min="0" step="' + (f.step || 1) + '" style="' + inputCss + '">';
            }
            return '<label style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:3px 0;font-size:.78rem;color:#334155;' + dim + '">' +
                '<span>' + f.label + '</span>' + ctl + '</label>';
        }).join('') +
            '<button type="button" id="cnc-reset" style="margin-top:12px;width:100%;padding:6px;border:1px solid #cbd5e1;background:#fff;border-radius:7px;font:inherit;font-size:.76rem;color:#475569;cursor:pointer;">החזר ברירות מחדל</button>' +
            '<div style="font-size:.7rem;color:#94a3b8;margin-top:8px;line-height:1.5;">כל המידות במ"מ. ההגדרות נשמרות במכשיר זה.</div>';
    }
    function _listHtml() {
        const res = UI.result;
        if (!res.panels.length) return '<div style="padding:30px;text-align:center;color:#64748b;">לא נמצאו לוחות לייצוא.</div>';
        const th = 'position:sticky;top:0;background:#f1f5f9;padding:6px 8px;text-align:right;font-size:.72rem;color:#475569;font-weight:700;';
        const td = 'padding:5px 8px;font-size:.78rem;border-bottom:1px solid #f1f5f9;white-space:nowrap;';
        return '<table style="width:100%;border-collapse:collapse;"><thead><tr>' +
            ['מזהה', 'חלק', 'אורך', 'רוחב', 'עובי', 'כמות', 'חומר', 'עיבוד'].map(function(h) { return '<th style="' + th + '">' + h + '</th>'; }).join('') +
            '</tr></thead><tbody>' + res.panels.map(function(r, i) {
                const dr = r.faces.A.drills.length + r.faces.B.drills.length, gr = r.faces.A.grooves.length + r.faces.B.grooves.length;
                const work = [dr ? dr + ' קידוחים' : '', gr ? gr + ' חריצים' : '', r.twoSided ? '2 פנים' : '', r.shaped ? 'מעוצב' : ''].filter(Boolean).join(' · ') || '—';
                return '<tr data-cnc-row="' + i + '" style="cursor:pointer;' + (i === UI.sel ? 'background:#eef2ff;' : '') + '">' +
                    '<td style="' + td + 'font-family:monospace;direction:ltr;text-align:right;">' + r.id + '</td>' +
                    '<td style="' + td + '">' + _esc(r.name) + (r.notes.length ? ' <i class="fa-solid fa-circle-info" style="color:#f59e0b;" title="' + _esc(r.notes.join(' | ')) + '"></i>' : '') + '</td>' +
                    '<td style="' + td + '">' + _fmt(r.L) + '</td><td style="' + td + '">' + _fmt(r.W) + '</td><td style="' + td + '">' + _fmt(r.T) + '</td>' +
                    '<td style="' + td + 'font-weight:700;">' + r.qty + '</td>' +
                    '<td style="' + td + '">' + _esc(r.matLabel) + '</td>' +
                    '<td style="' + td + 'color:#64748b;">' + work + '</td></tr>';
            }).join('') + '</tbody></table>';
    }
    function _previewHtml() {
        const res = UI.result, r = res.panels[UI.sel];
        if (!r) return '';
        if (UI.side === 'B' && !r.twoSided) UI.side = 'A';
        const tab = function(s, label) {
            const on = UI.side === s;
            return '<button type="button" data-cnc-side="' + s + '" style="border:0;border-radius:6px;padding:3px 10px;font:inherit;font-size:.74rem;font-weight:700;cursor:pointer;' +
                'background:' + (on ? '#4f46e5' : '#e2e8f0') + ';color:' + (on ? '#fff' : '#475569') + ';">' + label + '</button>';
        };
        const f = r.faces[UI.side];
        const legend = [];
        const seen = {};
        f.drills.forEach(function(d) { const k = _drillLayer(d); if (!seen[k]) { seen[k] = 0; legend.push(k); } seen[k]++; });
        f.grooves.forEach(function(g) { const k = _grooveLayer(g); if (!seen[k]) { seen[k] = 0; legend.push(k); } seen[k]++; });
        const bands = [r.band.y0, r.band.y1, r.band.x0, r.band.x1].filter(Boolean).length;
        return '<div style="flex:1;min-width:0;display:flex;flex-direction:column;">' +
                '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px;">' +
                    '<b style="font-size:.86rem;color:#0f172a;">' + r.id + ' · ' + _esc(r.name) +
                        ' <span style="font-weight:500;color:#64748b;">אורך ' + _fmt(r.L) + ' · רוחב ' + _fmt(r.W) + ' · עובי ' + _fmt(r.T) + '</span></b>' +
                    (r.twoSided ? '<span style="display:flex;gap:4px;">' + tab('A', 'פנים A') + tab('B', 'פנים B') + '</span>' : '') +
                '</div>' +
                '<div style="flex:1;min-height:0;background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:6px;">' + _svg(r, UI.side) + '</div>' +
            '</div>' +
            '<div style="width:250px;flex-shrink:0;overflow:auto;font-size:.74rem;color:#475569;line-height:1.7;">' +
                '<div>כמות: <b>' + r.qty + '</b>' + (r.wings.length ? ' · ' + _esc(r.wings.map(_wingLabel).join(' + ')) : '') + '</div>' +
                '<div>חומר: ' + _esc(r.matLabel) + '</div>' +
                '<div>קנט: ' + (bands ? bands + ' קצוות' : 'ללא') + '</div>' +
                (legend.length ? '<div style="direction:ltr;text-align:right;font-family:monospace;font-size:.7rem;">' +
                    legend.map(function(k) { return '<div><span style="color:' + _svgColor(k) + ';">' + k + '</span> ×' + seen[k] + '</div>'; }).join('') + '</div>' : '') +
                (r.notes.length ? '<div style="color:#b45309;">' + r.notes.map(_esc).join('<br>') + '</div>' : '') +
                '<div style="color:#94a3b8;font-size:.7rem;">X לאורך הסיבים · ראשית בפינה השמאלית-תחתונה · מבט על הפנים המעובדות</div>' +
                _warningsHtml() +
            '</div>';
    }
    function _warningsHtml() {
        const res = UI.result;
        const items = res.warnings.concat(res.skipped.map(function(s) { return 'לא יוצא: ' + s; }));
        if (!items.length) return '<div style="font-size:.76rem;color:#16a34a;margin-top:10px;"><i class="fa-solid fa-circle-check"></i> לא נמצאו אזהרות</div>';
        return '<div style="margin-top:10px;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:8px 10px;max-height:150px;overflow:auto;">' +
            '<div style="font-weight:800;font-size:.76rem;color:#b45309;margin-bottom:4px;"><i class="fa-solid fa-triangle-exclamation"></i> ' + items.length + ' אזהרות (נכתבות גם ל-README)</div>' +
            items.map(function(s) { return '<div style="font-size:.72rem;color:#92400e;line-height:1.5;">• ' + _esc(s) + '</div>'; }).join('') + '</div>';
    }
    function _render(part) {
        const m = document.getElementById('cnc-export-modal');
        if (!m) return;
        const res = UI.result;
        if (!part || part === 'settings') m.querySelector('#cnc-settings').innerHTML = _settingsHtml();
        m.querySelector('#cnc-list').innerHTML = _listHtml();
        m.querySelector('#cnc-preview').innerHTML = _previewHtml() || _warningsHtml();
        const ops = res.panels.reduce(function(s, r) {
            return s + r.qty * (r.faces.A.drills.length + r.faces.B.drills.length + r.faces.A.grooves.length + r.faces.B.grooves.length);
        }, 0);
        m.querySelector('#cnc-summary').textContent = res.total + ' לוחות · ' + res.panels.length + ' ייחודיים · ' + ops + ' פעולות עיבוד · ' +
            res.stock.map(function(s) { return s.matLabel + ' ' + s.T + ' מ"מ: ' + s.area.toFixed(2) + ' מ"ר'; }).join(' · ');
        m.querySelector('#cnc-download').disabled = !res.panels.length;
        _sync3d();
    }
    function _mount3d() {
        if (UI.view || typeof THREE === 'undefined') return;
        const wrap = document.getElementById('cnc-3d-wrap');
        const canvas = document.getElementById('cnc-3d');
        if (!wrap || !canvas) return;
        const renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.setClearColor(0x000000, 0);
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(35, 1, 1, 5000);
        scene.add(new THREE.HemisphereLight(0xfff6ea, 0xc5d4e4, 0.95));
        const key = new THREE.DirectionalLight(0xfff4e6, 0.72);
        key.position.set(60, 120, 80);
        scene.add(key);
        const fill = new THREE.DirectionalLight(0xdbe7f5, 0.38);
        fill.position.set(-90, 40, 30);
        scene.add(fill);
        const controls = (typeof THREE.OrbitControls === 'function')
            ? new THREE.OrbitControls(camera, canvas) : null;
        if (controls) {
            controls.enableDamping = true;
            controls.dampingFactor = 0.12;
            controls.addEventListener('start', function() { if (UI.view) UI.view.userMoved = true; });
            controls.addEventListener('change', function() {
                const view = UI.view;
                if (!view || view.framing) return;
                view.viewDir = view.camera.position.clone().sub(controls.target);
                if (view.viewDir.lengthSq() > 1e-6) view.viewDir.normalize();
            });
        }
        const board = { roughness: 0.62, metalness: 0.02 };
        const mats = {
            idle: new THREE.MeshStandardMaterial(Object.assign({ color: 0xf4efe6 }, board)),
            door: new THREE.MeshStandardMaterial(Object.assign({ color: 0xfffdf8 }, board)),
            back: new THREE.MeshStandardMaterial(Object.assign({ color: 0xe6ddd0 }, board)),
            sel: new THREE.MeshStandardMaterial({ color: 0x4f46e5, emissive: 0x312e81, roughness: 0.42, metalness: 0.04 }),
            hover: new THREE.MeshStandardMaterial({ color: 0xf59e0b, emissive: 0xb45309, roughness: 0.4, metalness: 0.02 }),
            edge: new THREE.LineBasicMaterial({ color: 0xb7aa9a, transparent: true, opacity: 0.85 })
        };
        const group = new THREE.Group();
        scene.add(group);
        UI.view = { renderer: renderer, scene: scene, camera: camera, controls: controls, group: group, mats: mats, token: '', meshes: [] };
        const fit = function() {
            const w = wrap.clientWidth || 340, h = wrap.clientHeight || 400;
            renderer.setSize(w, h, false);
            camera.aspect = w / Math.max(1, h);
            camera.updateProjectionMatrix();
            _frame3d(UI.view, false);
        };
        fit();
        UI.view.fit = fit;
        if (window.ResizeObserver) UI.view.ro = new ResizeObserver(fit);
        if (UI.view.ro) UI.view.ro.observe(wrap);
        const loop = function() {
            if (!UI.view) return;
            UI.view.raf = requestAnimationFrame(loop);
            if (controls) controls.update();
            if (UI.view.labels && UI.view.labels.length) {
                const dist = camera.position.distanceTo(controls ? controls.target : new THREE.Vector3());
                const k = Math.max(8, dist * 0.035);
                UI.view.labels.forEach(function(s) {
                    const w = s.userData.wide ? 3.4 : 2.2;
                    s.scale.set(k * w, k * 0.85, 1);
                });
            }
            renderer.render(scene, camera);
        };
        loop();
        let down = null;
        canvas.addEventListener('pointerdown', function(e) { down = [e.clientX, e.clientY]; });
        canvas.addEventListener('pointerup', function(e) {
            if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return;
            const rect = canvas.getBoundingClientRect();
            const ndc = new THREE.Vector2(
                ((e.clientX - rect.left) / rect.width) * 2 - 1,
                -((e.clientY - rect.top) / rect.height) * 2 + 1
            );
            const ray = new THREE.Raycaster();
            ray.setFromCamera(ndc, camera);
            const hits = ray.intersectObjects(UI.view.meshes.filter(function(mesh) { return mesh.visible; }), false);
            if (!hits.length) return;
            UI.sel = hits[0].object.userData.row;
            UI.side = 'A';
            UI.hover = -1;
            _render('data');
            const tr = document.querySelector('#cnc-list [data-cnc-row="' + UI.sel + '"]');
            if (tr && tr.scrollIntoView) tr.scrollIntoView({ block: 'nearest' });
        });
    }
    function _poseMatrix(pose) {
        const m = new THREE.Matrix4();
        const ax = pose.ax, h = pose.half;
        m.makeBasis(
            new THREE.Vector3(ax[0][0], ax[0][1], ax[0][2]).multiplyScalar(h[0] / 5),
            new THREE.Vector3(ax[1][0], ax[1][1], ax[1][2]).multiplyScalar(h[1] / 5),
            new THREE.Vector3(ax[2][0], ax[2][1], ax[2][2]).multiplyScalar(h[2] / 5)
        );
        m.setPosition(pose.c[0] / 10, pose.c[1] / 10, pose.c[2] / 10);
        return m;
    }
    // Frame the cabinet to the 3D pane. Keeps the current viewing angle after the first fit.
    function _frame3d(v, resetDir) {
        if (!v || !v.meshes.length) return;
        const box = new THREE.Box3();
        v.meshes.forEach(function(mesh) { box.expandByObject(mesh); });
        box.expandByScalar(14);
        if (box.isEmpty()) return;
        const center = box.getCenter(new THREE.Vector3());
        const radius = Math.max(box.getBoundingSphere(new THREE.Sphere()).radius, 8);
        const fov = v.camera.fov * Math.PI / 180;
        const aspect = v.camera.aspect || 1;
        const distV = radius / Math.sin(fov / 2);
        const hfov = 2 * Math.atan(Math.tan(fov / 2) * aspect);
        const distH = radius / Math.sin(Math.max(hfov, 0.2) / 2);
        const dist = Math.max(distV, distH) * 1.16;
        let dir = (!resetDir && v.viewDir && v.viewDir.lengthSq() > 1e-6) ? v.viewDir.clone() : new THREE.Vector3(0.72, 0.38, 1);
        dir.normalize();
        v.viewDir = dir.clone();
        v.framing = true;
        v.camera.position.copy(center).add(dir.multiplyScalar(dist));
        v.camera.near = Math.max(0.1, dist / 80);
        v.camera.far = dist + radius * 10;
        v.camera.lookAt(center);
        v.camera.updateProjectionMatrix();
        if (v.controls) { v.controls.target.copy(center); v.controls.update(); }
        v.framing = false;
    }
    function _clearAnno(v) {
        if (!v || !v.anno) return;
        const seen = [];
        v.anno.traverse(function(o) {
            if (o.geometry && seen.indexOf(o.geometry) < 0) { seen.push(o.geometry); o.geometry.dispose(); }
            if (o.material) {
                const mats = Array.isArray(o.material) ? o.material : [o.material];
                mats.forEach(function(mat) {
                    if (seen.indexOf(mat) >= 0) return;
                    seen.push(mat);
                    if (mat.map) mat.map.dispose();
                    mat.dispose();
                });
            }
        });
        v.group.remove(v.anno);
        v.anno = null;
        v.labels = [];
    }
    function _annoLabel(text) {
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 128;
        const g = canvas.getContext('2d');
        g.clearRect(0, 0, canvas.width, canvas.height);
        g.font = '600 54px Arial, sans-serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.lineJoin = 'round';
        g.lineWidth = 14;
        g.strokeStyle = 'rgba(255,255,255,0.92)';
        g.strokeText(text, canvas.width / 2, canvas.height / 2);
        g.fillStyle = '#1c1917';
        g.fillText(text, canvas.width / 2, canvas.height / 2);
        const tex = new THREE.CanvasTexture(canvas);
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false }));
        sprite.renderOrder = 6;
        sprite.userData.wide = true;
        sprite.scale.set(18, 4.5, 1);
        return sprite;
    }
    function _annoLine(group, a, b, color) {
        const geo = new THREE.BufferGeometry().setFromPoints([a, b]);
        const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: color, depthTest: false }));
        line.renderOrder = 4;
        group.add(line);
    }
    function _add3dAnno(v) {
        _clearAnno(v);
        if (!v.meshes.length) return;
        const anno = new THREE.Group();
        v.group.add(anno);
        v.anno = anno;
        v.labels = [];
        const box = new THREE.Box3();
        v.meshes.forEach(function(mesh) { box.expandByObject(mesh); });
        if (box.isEmpty()) return;
        const min = box.min, max = box.max;
        const gap = 8;
        const dim = 0x44403c;
        const ext = 0x78716c;
        const put = function(a, b, label, extA, extB) {
            const dir = b.clone().sub(a);
            const len = dir.length() || 1;
            dir.multiplyScalar(1 / len);
            const opening = Math.min(9, len * 0.22);
            const mid = a.clone().lerp(b, 0.5);
            _annoLine(anno, a, mid.clone().addScaledVector(dir, -opening), dim);
            _annoLine(anno, mid.clone().addScaledVector(dir, opening), b, dim);
            const ref = Math.abs(dir.y) < 0.85 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, 1);
            const side = new THREE.Vector3().crossVectors(dir, ref).normalize().multiplyScalar(1.15);
            _annoLine(anno, a, a.clone().addScaledVector(dir, 2.6).add(side), dim);
            _annoLine(anno, a, a.clone().addScaledVector(dir, 2.6).sub(side), dim);
            _annoLine(anno, b, b.clone().addScaledVector(dir, -2.6).add(side), dim);
            _annoLine(anno, b, b.clone().addScaledVector(dir, -2.6).sub(side), dim);
            const extend = function(from, to) {
                const out = to.clone().sub(from);
                const n = out.length() || 1;
                _annoLine(anno, from, to.clone().addScaledVector(out, 1.8 / n), ext);
            };
            if (extA && extB) { extend(extA, a); extend(extB, b); }
            const sprite = _annoLabel(label);
            sprite.position.copy(mid);
            anno.add(sprite);
            v.labels.push(sprite);
        };
        const wMm = Math.round((max.x - min.x) * 10);
        const hMm = Math.round((max.y - min.y) * 10);
        const dMm = Math.round((max.z - min.z) * 10);
        put(new THREE.Vector3(min.x, min.y, max.z + gap), new THREE.Vector3(max.x, min.y, max.z + gap), wMm + '  רוחב',
            new THREE.Vector3(min.x, min.y, max.z), new THREE.Vector3(max.x, min.y, max.z));
        put(new THREE.Vector3(min.x - gap, min.y, max.z), new THREE.Vector3(min.x - gap, max.y, max.z), hMm + '  גובה',
            new THREE.Vector3(min.x, min.y, max.z), new THREE.Vector3(min.x, max.y, max.z));
        put(new THREE.Vector3(max.x + gap, min.y, min.z), new THREE.Vector3(max.x + gap, min.y, max.z), dMm + '  עומק',
            new THREE.Vector3(max.x, min.y, min.z), new THREE.Vector3(max.x, min.y, max.z));

        const shadow = new THREE.Mesh(
            new THREE.CircleGeometry(1, 48),
            new THREE.MeshBasicMaterial({ color: 0x64748b, transparent: true, opacity: 0.16, depthWrite: false })
        );
        shadow.rotation.x = -Math.PI / 2;
        shadow.position.set((min.x + max.x) / 2, min.y - 0.2, (min.z + max.z) / 2);
        shadow.scale.set(Math.max(8, (max.x - min.x) * 0.58), Math.max(6, (max.z - min.z) * 0.7), 1);
        shadow.renderOrder = 0;
        anno.add(shadow);

        const dotGeo = new THREE.SphereGeometry(0.55, 12, 8);
        const dotMat = new THREE.MeshBasicMaterial({ color: 0xc2410c, depthTest: false });
        UI.result.panels.forEach(function(r) {
            (r.hinges || []).forEach(function(h) {
                const dot = new THREE.Mesh(dotGeo, dotMat);
                dot.position.set(h[0] / 10, h[1] / 10, h[2] / 10);
                dot.renderOrder = 5;
                anno.add(dot);
            });
        });
    }
    function _sync3d() {
        _mount3d();
        const v = UI.view;
        if (!v || !UI.result) return;
        const token = UI.result.panels.map(function(r) {
            return r.id + ':' + (r.poses || []).map(function(p) { return p.c.map(function(n) { return Math.round(n); }).join(','); }).join(';') +
                '#' + (r.hinges || []).map(function(h) { return h.map(function(n) { return Math.round(n); }).join(','); }).join(';');
        }).join('|');
        if (token !== v.token) {
            const refit = !v.token;
            v.token = token;
            _clearAnno(v);
            while (v.group.children.length) v.group.remove(v.group.children[0]);
            v.meshes = [];
            if (v.boxGeo) v.boxGeo.dispose();
            if (v.edgeGeo) v.edgeGeo.dispose();
            const geo = new THREE.BoxGeometry(1, 1, 1);
            const edgeGeo = new THREE.EdgesGeometry(geo, 1);
            v.boxGeo = geo;
            v.edgeGeo = edgeGeo;
            UI.result.panels.forEach(function(r, i) {
                (r.poses || []).forEach(function(pose) {
                    const base = (r.code === 'DOOR' || r.code === 'DRAWER_FRONT') ? v.mats.door
                        : (r.code === 'BACK' ? v.mats.back : v.mats.idle);
                    const mesh = new THREE.Mesh(geo, base);
                    mesh.matrix.copy(_poseMatrix(pose));
                    mesh.matrixAutoUpdate = false;
                    mesh.userData.row = i;
                    mesh.userData.door = r.code === 'DOOR';
                    mesh.userData.baseMat = base;
                    const edge = new THREE.LineSegments(edgeGeo, v.mats.edge);
                    edge.userData.edge = true;
                    mesh.add(edge);
                    v.group.add(mesh);
                    v.meshes.push(mesh);
                });
            });
            _add3dAnno(v);
            if (v.meshes.length) _frame3d(v, refit || !v.userMoved);
        }
        _highlight3d();
        _apply3dDoors();
    }
    function _apply3dDoors() {
        const v = UI.view;
        if (!v) return;
        v.meshes.forEach(function(mesh) { mesh.visible = !(UI.hideDoors && mesh.userData.door); });
        const btn = document.getElementById('cnc-3d-doors');
        if (!btn) return;
        btn.innerHTML = '<i class="fa-solid fa-door-open" style="margin-left:6px;"></i>' + (UI.hideDoors ? 'הצג דלתות' : 'הסתר דלתות');
        btn.style.background = UI.hideDoors ? '#4f46e5' : 'rgba(255,255,255,.94)';
        btn.style.color = UI.hideDoors ? '#fff' : '#44403c';
    }
    function _highlight3d() {
        const v = UI.view;
        if (!v) return;
        v.meshes.forEach(function(mesh) {
            const row = mesh.userData.row;
            mesh.material = row === UI.hover ? v.mats.hover : (row === UI.sel ? v.mats.sel : (mesh.userData.baseMat || v.mats.idle));
        });
    }
    function _dispose3d() {
        const v = UI.view;
        if (!v) return;
        _clearAnno(v);
        if (v.raf) cancelAnimationFrame(v.raf);
        if (v.ro) v.ro.disconnect();
        if (v.boxGeo) v.boxGeo.dispose();
        if (v.edgeGeo) v.edgeGeo.dispose();
        if (v.controls) v.controls.dispose();
        v.renderer.dispose();
        Object.keys(v.mats).forEach(function(k) { v.mats[k].dispose(); });
        UI.view = null;
    }
    function _recompute(part) {
        try {
            UI.result = _build(UI.cfg);
            if (UI.sel >= UI.result.panels.length) UI.sel = 0;
            _render(part);
        } catch (e) {
            console.error('[cnc]', e);
            const m = document.getElementById('cnc-export-modal');
            if (m) m.querySelector('#cnc-list').innerHTML = '<div style="padding:30px;color:#b91c1c;">חישוב הלוחות נכשל: ' + _esc(e && e.message ? e.message : e) + '</div>';
        }
    }
    function _close() {
        _dispose3d();
        const m = document.getElementById('cnc-export-modal');
        if (m) m.remove();
        document.removeEventListener('keydown', _onKey, true);
    }
    function _onKey(e) { if (e.key === 'Escape') _close(); }

    window._openCncExport = function() {
        if (X3().closeMenu) X3().closeMenu();
        // Hidden from everyone except the platform admin while the feature is still rolling out
        if (!window._isAppAdmin) {
            _toast('ייצוא CNC זמין כרגע רק למנהל המערכת.', 4000);
            return;
        }
        if (window._features && !window._features.canExportCarpenter) {
            _toast('ייצוא CNC אינו זמין בתוכנית הנוכחית שלך. שדרג כדי לגשת לקובצי הייצור.', 5000);
            return;
        }
        if (typeof state !== 'undefined' && state.viewMode === 'blueprint') {
            alert('ייצוא CNC זמין בתצוגת עריכה רגילה (לא בשרטוט ייצור).');
            return;
        }
        if (typeof state !== 'undefined' && state.wingEditMode) {
            alert('צאו ממצב עריכת כנף כדי לייצא את כל הארון.');
            return;
        }
        if (!X3().collect) { alert('ייצוא CNC אינו זמין — רכיב הייצוא לא נטען.'); return; }
        _close();
        UI.cfg = _loadSettings();
        UI.sel = 0;
        UI.hover = -1;
        UI.hideDoors = false;
        UI.side = 'A';
        const m = document.createElement('div');
        m.id = 'cnc-export-modal';
        m.dir = 'rtl';
        m.style.cssText = 'position:fixed;inset:0;z-index:10060;background:rgba(15,23,42,.55);display:flex;align-items:center;justify-content:center;font-family:inherit;';
        m.innerHTML =
            '<div style="background:#fff;border-radius:14px;width:min(1380px,97vw);height:min(860px,94vh);display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(15,23,42,.35);overflow:hidden;">' +
                '<div style="display:flex;align-items:center;justify-content:space-between;padding:12px 18px;border-bottom:1px solid #e2e8f0;">' +
                    '<div><b style="font-size:1rem;color:#0f172a;"><i class="fa-solid fa-gears" style="color:#4f46e5;margin-left:8px;"></i>ייצוא CNC — DXF ורשימת חיתוך</b>' +
                    '<div style="font-size:.74rem;color:#64748b;margin-top:2px;">הארון שבעריכה · קובץ DXF שכבתי לכל לוח, קובץ מרוכז לכל חומר ורשימת חיתוך CSV</div></div>' +
                    '<button type="button" id="cnc-close" title="סגור" style="border:0;background:none;font-size:1.3rem;color:#64748b;cursor:pointer;padding:4px 8px;">&times;</button>' +
                '</div>' +
                '<div style="flex:1;display:flex;min-height:0;">' +
                    '<div id="cnc-settings" style="width:250px;flex-shrink:0;padding:4px 14px 14px;border-left:1px solid #e2e8f0;overflow:auto;"></div>' +
                    '<div style="flex:1;min-width:0;display:flex;flex-direction:column;">' +
                        '<div id="cnc-preview" style="flex:0 0 46%;min-height:0;display:flex;gap:14px;padding:12px 14px;border-bottom:1px solid #e2e8f0;background:#f8fafc;"></div>' +
                        '<div id="cnc-list" style="flex:1;min-height:0;overflow:auto;"></div>' +
                    '</div>' +
                    '<div id="cnc-3d-wrap" style="width:460px;flex-shrink:0;position:relative;background:radial-gradient(120% 90% at 50% 12%, #f7f4ef 0%, #e7eef6 58%, #d5e0ec 100%);border-right:1px solid #e2e8f0;">' +
                        '<canvas id="cnc-3d" style="width:100%;height:100%;display:block;"></canvas>' +
                        '<div style="position:absolute;top:8px;right:10px;left:10px;font-size:.72rem;color:#44403c;pointer-events:none;">מידות כלליות במ״מ · נקודה כתומה = מיקום ציר</div>' +
                        '<button type="button" id="cnc-3d-doors" style="position:absolute;bottom:10px;left:10px;z-index:2;border:1px solid #d6d3d1;border-radius:8px;background:rgba(255,255,255,.94);color:#44403c;font:inherit;font-size:.74rem;font-weight:700;padding:6px 10px;cursor:pointer;">הסתר דלתות</button>' +
                    '</div>' +
                '</div>' +
                '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 18px;border-top:1px solid #e2e8f0;background:#f8fafc;">' +
                    '<div id="cnc-summary" style="font-size:.78rem;color:#475569;"></div>' +
                    '<button type="button" id="cnc-download" style="flex-shrink:0;border:0;border-radius:9px;background:#4f46e5;color:#fff;font:inherit;font-weight:700;font-size:.9rem;padding:9px 20px;cursor:pointer;">' +
                        '<i class="fa-solid fa-download" style="margin-left:7px;"></i>הורד ZIP</button>' +
                '</div>' +
            '</div>';
        document.body.appendChild(m);
        document.addEventListener('keydown', _onKey, true);

        m.addEventListener('mousedown', function(e) { if (e.target === m) _close(); });
        m.addEventListener('mouseover', function(e) {
            const row = e.target.closest && e.target.closest('[data-cnc-row]');
            const next = row ? Number(row.getAttribute('data-cnc-row')) : -1;
            if (next === UI.hover) return;
            UI.hover = next;
            _highlight3d();
        });
        m.addEventListener('mouseout', function(e) {
            const row = e.target.closest && e.target.closest('[data-cnc-row]');
            if (!row) return;
            const to = e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest('[data-cnc-row]');
            if (to === row) return;
            UI.hover = -1;
            _highlight3d();
        });
        m.querySelector('#cnc-close').onclick = _close;
        m.addEventListener('change', function(e) {
            const k = e.target.getAttribute && e.target.getAttribute('data-cnc');
            if (!k) return;
            const def = CNC_DEFAULTS[k];
            if (typeof def === 'boolean') UI.cfg[k] = !!e.target.checked;
            else if (typeof def === 'number') {
                const v = parseFloat(e.target.value);
                UI.cfg[k] = (isFinite(v) && v >= 0) ? v : def;
            } else UI.cfg[k] = e.target.value;
            _saveSettings(UI.cfg);
            _recompute(k === 'backMode' ? 'settings' : 'data');
        });
        m.addEventListener('click', function(e) {
            const row = e.target.closest && e.target.closest('[data-cnc-row]');
            if (row) { UI.sel = Number(row.getAttribute('data-cnc-row')); UI.hover = -1; UI.side = 'A'; _render('data'); return; }
            const side = e.target.closest && e.target.closest('[data-cnc-side]');
            if (side) { UI.side = side.getAttribute('data-cnc-side'); _render('data'); return; }
            if (e.target.id === 'cnc-3d-doors' || (e.target.closest && e.target.closest('#cnc-3d-doors'))) {
                UI.hideDoors = !UI.hideDoors;
                _apply3dDoors();
                return;
            }
            if (e.target.id === 'cnc-reset') {
                UI.cfg = Object.assign({}, CNC_DEFAULTS);
                _saveSettings(UI.cfg);
                _recompute('settings');
            }
        });
        m.querySelector('#cnc-download').onclick = async function() {
            const btn = this, html = btn.innerHTML;
            btn.disabled = true;
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin" style="margin-left:7px;"></i>מכין קבצים...';
            try {
                UI.result = _build(UI.cfg);
                await _download(UI.result);
                _toast('קובצי ה-CNC ירדו בהצלחה');
            } catch (e) {
                console.error('[cnc]', e);
                alert('הייצוא נכשל: ' + (e && e.message ? e.message : e));
            }
            btn.disabled = false;
            btn.innerHTML = html;
        };
        _recompute('settings');
    };

    window._exportCncDebug = {
        defaults: CNC_DEFAULTS, collect: _collect, rules: _rules, ops: _ops, build: _build,
        dxf: _panelDxf, stockDxf: _stockDxf, csv: _csv, readme: _readme, svg: _svg
    };
})();
