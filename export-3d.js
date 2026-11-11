// ==========================================
// 3D export of the cabinet being edited, or of the whole room (walls, floor, ceiling, doors/windows,
// furniture and every cabinet standing in it) — SketchUp (Collada .dae in a zip with textures)
// AutoCAD (DXF R12 with 3DFACE entities, one layer per part type) and 3ds Max / Blender
// (OBJ + MTL in a zip with textures).
// Engine units are cm, Y-up; DXF is written in mm, Z-up.
// ==========================================
(function() {
    'use strict';

    const LAYERS = {
        body:      { name: 'Body',      he: 'גוף',     aci: 7 },
        shelves:   { name: 'Shelves',   he: 'מדפים',   aci: 9 },
        doors:     { name: 'Doors',     he: 'דלתות',   aci: 30 },
        drawers:   { name: 'Drawers',   he: 'מגירות',  aci: 40 },
        handles:   { name: 'Handles',   he: 'ידיות',   aci: 8 },
        room:      { name: 'Room',      he: 'חדר',     aci: 254 },
        ceiling:   { name: 'Ceiling',   he: 'תקרה',    aci: 253 },
        furniture: { name: 'Furniture', he: 'ריהוט',   aci: 33 }
    };
    const LAYER_ORDER = ['body', 'shelves', 'drawers', 'doors', 'handles', 'room', 'ceiling', 'furniture'];

    function _ancestors(obj, root, fn) {
        for (let o = obj; o && o !== root; o = o.parent) { if (fn(o)) return true; }
        return false;
    }

    function _isHelper(mesh) {
        const ud = mesh.userData || {};
        if (ud.isShelfPickProxy || ud.spaceCompanion) return true;
        if (ud.wingId != null || mesh.renderOrder === 999) return true;
        if (ud.colIndex != null && ud.rowIndex != null && !ud.partId) return true;
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        return mats.every(function(m) {
            if (!m || m.colorWrite === false || m.visible === false) return true;
            if (m.transparent && (m.opacity == null ? 1 : m.opacity) < 0.05) return true;
            return m.isMeshBasicMaterial && m.transparent;
        });
    }

    function _isProp(o) {
        return !!((o.userData && o.userData.roomProp) || /laptop|chair|bed/i.test(o.name || ''));
    }

    function _layerOf(mesh, root, handleSet) {
        const ud = mesh.userData || {};
        if (ud.doorHandle || handleSet.has(mesh)) return 'handles';
        const onFront = _ancestors(mesh, root, function(o) { return o.userData && o.userData.isCabinetDoor; });
        // Pipe / half-moon pulls are registered as door meshes but are not boards
        if (onFront && mesh.geometry.type !== 'BoxGeometry') return 'handles';
        if (_ancestors(mesh, root, function(o) { return o.userData && o.userData.keepVisibleWhenDoorsHidden; })) return 'drawers';
        const pid = String(ud.partId || '');
        if (/_drawer_/.test(pid)) return 'drawers';
        if (onFront || /_door_/.test(pid)) return 'doors';
        if (ud.shelfRef || /_shelf_/.test(pid)) return 'shelves';
        return 'body';
    }

    function _isExportableMesh(o) {
        return o.isMesh && !o.isSkinnedMesh && o.geometry && o.geometry.attributes.position && !_isHelper(o);
    }

    /**
     * Parts of one cabinet with transforms relative to `refInv`.
     * Desk accessories (laptop / chair) are skipped, or exported on the furniture layer when `withProps`.
     */
    function _collectCabinet(root, refInv, group, withProps, out) {
        root.updateMatrixWorld(true);
        const handleSet = new Set(window._doorHandleObjs || []);
        root.traverse(function(o) {
            if (!_isExportableMesh(o)) return;
            const isProp = _ancestors(o, root, _isProp);
            if (isProp && !withProps) return;
            const layer = isProp ? 'furniture' : _layerOf(o, root, handleSet);
            // Doors hidden only for on-screen viewing are still exported (closed)
            const frontLayer = layer === 'doors' || layer === 'handles' || layer === 'drawers';
            if (!frontLayer && _ancestors(o, root, function(a) { return a.visible === false; })) return;
            out.push({
                mesh: o, layer: layer, group: group,
                matrix: new THREE.Matrix4().multiplyMatrices(refInv, o.matrixWorld),
                material: Array.isArray(o.material) ? o.material[0] : o.material
            });
        });
        return out;
    }

    /** Real cabinet parts of the edited cabinet, relative to the cabinet origin. */
    function _collectParts() {
        const root = window.cabinetGroup;
        if (!root) return [];
        root.updateMatrixWorld(true);
        const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
        return _collectCabinet(root, inv, { key: 'Cabinet', name: _fileBaseName() }, false, []);
    }

    function _cartName(i) {
        const item = state.orderCart && state.orderCart[i];
        return (item && item.customName) || ('ארון ' + (i + 1));
    }

    /** Every cabinet + the room shell, in room coordinates (floor at y = 0, back wall at z = 0). */
    function _collectRoomParts() {
        const rg = window._roomGroup;
        const parts = [];
        rg.updateMatrixWorld(true);
        const refInv = new THREE.Matrix4().copy(rg.matrixWorld).invert();
        let n = 0;
        const nextGroup = function(name) { n++; return { key: 'Cabinet_' + n, name: name }; };

        const done = {};
        if (window.cabinetGroup) {
            if (typeof state.editingCartIndex === 'number') done[state.editingCartIndex] = true;
            _collectCabinet(window.cabinetGroup, refInv, nextGroup(_fileBaseName()), true, parts);
        }
        (window._spaceCompanionGroups || []).forEach(function(g) {
            if (!g || !g.parent || g.visible === false) return;
            const ci = g.userData.cartIndex;
            if (typeof ci === 'number') { if (done[ci]) return; done[ci] = true; }
            _collectCabinet(g, refInv, nextGroup(typeof ci === 'number' ? _cartName(ci) : 'ארון'), false, parts);
        });
        const extra = window._roomExtraCabinetGroup;
        if (extra && extra.parent) {
            extra.children.forEach(function(g) {
                const ci = g.userData.cartIndex;
                if (typeof ci === 'number') { if (done[ci]) return; done[ci] = true; }
                _collectCabinet(g, refInv, nextGroup(typeof ci === 'number' ? _cartName(ci) : 'ארון'), false, parts);
            });
        }

        const shell = { key: 'Room', name: 'חדר' };
        const walk = function(o) {
            if (o !== rg && (o === extra || (o.userData && o.userData.roomExtraCabinet))) return;
            if (o !== rg && o.visible === false) return;
            if (_isExportableMesh(o)) {
                let layer = 'room';
                if (_ancestors(o, rg, _isProp)) layer = 'furniture';
                else if (_ancestors(o, rg, function(a) { return a.userData && a.userData.roomPart === 'ceiling'; })) layer = 'ceiling';
                parts.push({
                    mesh: o, layer: layer, group: shell,
                    matrix: new THREE.Matrix4().multiplyMatrices(refInv, o.matrixWorld),
                    material: Array.isArray(o.material) ? o.material[0] : o.material
                });
            }
            o.children.forEach(walk);
        };
        walk(rg);
        return parts;
    }

    /** Runs `fn` with the room built; a room shown only for the export is taken down afterwards. */
    async function _withRoomBuilt(fn) {
        const rg = window._roomGroup;
        if (!rg || typeof _buildRoom !== 'function') throw new Error('תצוגת החדר אינה זמינה');
        if (state.wingEditMode) throw new Error('צאו ממצב עריכת כנף כדי לייצא חדר שלם');
        const built = window._roomVisible !== false && rg.children.length > 0;
        const prevVisible = window._roomVisible;
        const prevGroupVisible = rg.visible;
        if (!built) {
            window._roomVisible = true;
            _buildRoom();
        }
        try {
            if (!rg.children.length) throw new Error('לא ניתן לבנות את החדר בתצוגה הנוכחית');
            return await fn();
        } finally {
            if (!built) {
                window._roomVisible = prevVisible;
                _buildRoom();
                rg.visible = prevGroupVisible;
                if (typeof window._requestRender === 'function') window._requestRender();
            }
        }
    }

    /** Triangles / quads in export space. quad=true for BoxGeometry faces (cleaner CAD edges). */
    function _faces(part) {
        const g = part.mesh.geometry;
        const pos = g.attributes.position;
        const v = new THREE.Vector3();
        const pts = [];
        for (let i = 0; i < pos.count; i++) {
            v.fromBufferAttribute(pos, i).applyMatrix4(part.matrix);
            pts.push([v.x, v.y, v.z]);
        }
        const idx = g.index ? Array.from(g.index.array) : pts.map(function(_, i) { return i; });
        const faces = [];
        if (g.type === 'BoxGeometry' && pos.count === 24) {
            for (let f = 0; f < 6; f++) {
                const b = f * 4;
                faces.push([pts[b], pts[b + 1], pts[b + 3], pts[b + 2]]);
            }
        } else {
            for (let i = 0; i + 2 < idx.length; i += 3) faces.push([pts[idx[i]], pts[idx[i + 1]], pts[idx[i + 2]]]);
        }
        return faces;
    }

    /** Texture coordinate in file convention (v up), including the map's repeat/offset. */
    function _uvAt(uv, i, mi) {
        let u = uv.getX(i), vv = uv.getY(i);
        if (mi.repeat) { u = u * mi.repeat.x + mi.offset.x; vv = vv * mi.repeat.y + mi.offset.y; }
        // glTF textures are uploaded unflipped
        if (mi.flipY === false) vv = 1 - vv;
        return [u, vv];
    }

    function _groupsInOrder(parts) {
        const seen = new Map();
        parts.forEach(function(p) { if (!seen.has(p.group.key)) seen.set(p.group.key, p.group); });
        return Array.from(seen.values());
    }

    // ---------- color helpers ----------
    const _avgCache = new Map();
    function _imageAverage(img) {
        if (!img) return null;
        if (_avgCache.has(img)) return _avgCache.get(img);
        let rgb = null;
        try {
            const c = document.createElement('canvas');
            c.width = c.height = 8;
            const ctx = c.getContext('2d');
            ctx.drawImage(img, 0, 0, 8, 8);
            const d = ctx.getImageData(0, 0, 8, 8).data;
            let r = 0, gg = 0, b = 0;
            for (let i = 0; i < d.length; i += 4) { r += d[i]; gg += d[i + 1]; b += d[i + 2]; }
            rgb = [r / 64, gg / 64, b / 64];
        } catch (e) { /* tainted or not loaded */ }
        _avgCache.set(img, rgb);
        return rgb;
    }

    function _materialRGB(mat) {
        if (!mat) return [200, 200, 200];
        const base = mat.color ? [mat.color.r * 255, mat.color.g * 255, mat.color.b * 255] : [255, 255, 255];
        const avg = mat.map && mat.map.image ? _imageAverage(mat.map.image) : null;
        return avg ? [avg[0] * base[0] / 255, avg[1] * base[1] / 255, avg[2] * base[2] / 255] : base;
    }

    // AutoCAD Color Index entries close to typical cabinet finishes
    const ACI = [
        [1, 255, 0, 0], [2, 255, 255, 0], [3, 0, 255, 0], [4, 0, 255, 255], [5, 0, 0, 255], [6, 255, 0, 255],
        [7, 255, 255, 255], [8, 128, 128, 128], [9, 192, 192, 192],
        [250, 51, 51, 51], [251, 80, 80, 80], [252, 105, 105, 105], [253, 130, 130, 130], [254, 190, 190, 190],
        [30, 255, 127, 0], [31, 255, 191, 127], [32, 165, 82, 0], [33, 165, 124, 82], [34, 127, 63, 0],
        [35, 127, 95, 63], [36, 76, 38, 0], [37, 76, 57, 38], [40, 255, 191, 0], [41, 255, 223, 127],
        [42, 165, 124, 0], [43, 165, 145, 82], [44, 127, 95, 0], [45, 127, 111, 63], [46, 76, 57, 0], [47, 76, 66, 38],
        [51, 255, 255, 127], [53, 165, 165, 82], [55, 127, 127, 63], [57, 76, 76, 38],
        [11, 255, 127, 127], [21, 255, 159, 127], [221, 255, 127, 223], [191, 191, 127, 255], [151, 127, 191, 255],
        [91, 159, 255, 127], [131, 127, 255, 255], [18, 76, 0, 0], [28, 76, 19, 0]
    ];
    function _nearestAci(rgb) {
        let best = 7, bd = Infinity;
        for (let i = 0; i < ACI.length; i++) {
            const e = ACI[i];
            const d = (e[1] - rgb[0]) ** 2 + (e[2] - rgb[1]) ** 2 + (e[3] - rgb[2]) ** 2;
            if (d < bd) { bd = d; best = e[0]; }
        }
        return best;
    }

    // ---------- DXF (AutoCAD) ----------
    function _buildDXF(parts) {
        const out = [];
        const w = function(code, val) { out.push(String(code), String(val)); };
        const n = function(x) { return (Math.round(x * 100) / 100).toString(); };
        const used = LAYER_ORDER.filter(function(k) { return parts.some(function(p) { return p.layer === k; }); });
        w(0, 'SECTION'); w(2, 'HEADER');
        w(9, '$ACADVER'); w(1, 'AC1009');
        w(9, '$INSBASE'); w(10, 0); w(20, 0); w(30, 0);
        w(0, 'ENDSEC');
        w(0, 'SECTION'); w(2, 'TABLES');
        w(0, 'TABLE'); w(2, 'LAYER'); w(70, used.length + 1);
        w(0, 'LAYER'); w(2, '0'); w(70, 0); w(62, 7); w(6, 'CONTINUOUS');
        used.forEach(function(k) {
            w(0, 'LAYER'); w(2, LAYERS[k].name); w(70, 0); w(62, LAYERS[k].aci); w(6, 'CONTINUOUS');
        });
        w(0, 'ENDTAB');
        w(0, 'ENDSEC');
        w(0, 'SECTION'); w(2, 'ENTITIES');
        parts.forEach(function(p) {
            const aci = _nearestAci(_materialRGB(p.material));
            const layer = LAYERS[p.layer].name;
            _faces(p).forEach(function(f) {
                const q = f.length === 4 ? f : [f[0], f[1], f[2], f[2]];
                w(0, '3DFACE'); w(8, layer); w(62, aci);
                for (let i = 0; i < 4; i++) {
                    // cm Y-up → mm Z-up
                    w(10 + i, n(q[i][0] * 10)); w(20 + i, n(-q[i][2] * 10)); w(30 + i, n(q[i][1] * 10));
                }
            });
        });
        w(0, 'ENDSEC');
        w(0, 'EOF');
        return out.join('\r\n') + '\r\n';
    }

    // ---------- Collada (SketchUp) ----------
    function _xml(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

    async function _textureBlob(img) {
        const c = document.createElement('canvas');
        const maxSide = 1024;
        const s = Math.min(1, maxSide / Math.max(img.naturalWidth || img.width || 1, img.naturalHeight || img.height || 1));
        c.width = Math.max(1, Math.round((img.naturalWidth || img.width) * s));
        c.height = Math.max(1, Math.round((img.naturalHeight || img.height) * s));
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        return await new Promise(function(res) { c.toBlob(res, 'image/jpeg', 0.9); });
    }

    function _materialInfo(mat, id, textures, texByImg, withTexId) {
        let tex = null;
        const img = mat && mat.map && mat.map.image;
        if (img && (img.naturalWidth || img.width)) {
            tex = texByImg.get(img);
            if (!tex) {
                tex = { name: 'textures/tex' + textures.length + '.jpg', img: img };
                if (withTexId) tex.id = 'img' + textures.length;
                textures.push(tex);
                texByImg.set(img, tex);
            }
        }
        return {
            id: id, tex: tex,
            rgb: mat && mat.color ? [mat.color.r, mat.color.g, mat.color.b] : [0.8, 0.8, 0.8],
            opacity: mat && mat.transparent ? (mat.opacity == null ? 1 : mat.opacity) : 1,
            repeat: mat && mat.map ? mat.map.repeat : null,
            offset: mat && mat.map ? mat.map.offset : null,
            flipY: mat && mat.map ? mat.map.flipY : true
        };
    }

    async function _buildDAE(parts, fileStem) {
        const matIds = new Map();   // three material → effect info
        const textures = [];        // { name, img, id }
        const texByImg = new Map();
        const geoms = [];
        const nodes = {};           // group key → layer → [node xml]
        const f = function(x) { return (Math.round(x * 10000) / 10000).toString(); };

        parts.forEach(function(p, pi) {
            const mat = p.material;
            let mi = matIds.get(mat);
            if (!mi) {
                mi = _materialInfo(mat, 'mat' + matIds.size, textures, texByImg, true);
                matIds.set(mat, mi);
            }

            const g = p.mesh.geometry;
            const pos = g.attributes.position, nor = g.attributes.normal, uv = g.attributes.uv;
            const nm = new THREE.Matrix3().getNormalMatrix(p.matrix);
            const v = new THREE.Vector3();
            const P = [], N = [], T = [];
            for (let i = 0; i < pos.count; i++) {
                v.fromBufferAttribute(pos, i).applyMatrix4(p.matrix);
                P.push(f(v.x), f(v.y), f(v.z));
                if (nor) { v.fromBufferAttribute(nor, i).applyMatrix3(nm).normalize(); N.push(f(v.x), f(v.y), f(v.z)); }
                if (uv) { const t = _uvAt(uv, i, mi); T.push(f(t[0]), f(t[1])); }
            }
            const idx = g.index ? Array.from(g.index.array) : Array.from({ length: pos.count }, function(_, i) { return i; });
            const gid = 'geom' + pi;
            let src = '<geometry id="' + gid + '" name="' + gid + '"><mesh>';
            src += '<source id="' + gid + '-pos"><float_array id="' + gid + '-pos-a" count="' + P.length + '">' + P.join(' ') + '</float_array>' +
                '<technique_common><accessor source="#' + gid + '-pos-a" count="' + pos.count + '" stride="3"><param name="X" type="float"/><param name="Y" type="float"/><param name="Z" type="float"/></accessor></technique_common></source>';
            if (nor) src += '<source id="' + gid + '-nor"><float_array id="' + gid + '-nor-a" count="' + N.length + '">' + N.join(' ') + '</float_array>' +
                '<technique_common><accessor source="#' + gid + '-nor-a" count="' + pos.count + '" stride="3"><param name="X" type="float"/><param name="Y" type="float"/><param name="Z" type="float"/></accessor></technique_common></source>';
            if (uv) src += '<source id="' + gid + '-uv"><float_array id="' + gid + '-uv-a" count="' + T.length + '">' + T.join(' ') + '</float_array>' +
                '<technique_common><accessor source="#' + gid + '-uv-a" count="' + pos.count + '" stride="2"><param name="S" type="float"/><param name="T" type="float"/></accessor></technique_common></source>';
            src += '<vertices id="' + gid + '-vtx"><input semantic="POSITION" source="#' + gid + '-pos"/></vertices>';
            src += '<triangles material="m" count="' + Math.floor(idx.length / 3) + '">' +
                '<input semantic="VERTEX" source="#' + gid + '-vtx" offset="0"/>' +
                (nor ? '<input semantic="NORMAL" source="#' + gid + '-nor" offset="0"/>' : '') +
                (uv ? '<input semantic="TEXCOORD" source="#' + gid + '-uv" offset="0" set="0"/>' : '') +
                '<p>' + idx.join(' ') + '</p></triangles>';
            src += '</mesh></geometry>';
            geoms.push(src);

            const partName = String((p.mesh.userData && p.mesh.userData.partId) || (LAYERS[p.layer].name + '_' + pi)).split('::').pop();
            const node = '<node id="node' + pi + '" name="' + _xml(partName) + '"><instance_geometry url="#' + gid + '"><bind_material><technique_common>' +
                '<instance_material symbol="m" target="#' + mi.id + '">' +
                (mi.tex ? '<bind_vertex_input semantic="UVSET0" input_semantic="TEXCOORD" input_set="0"/>' : '') +
                '</instance_material></technique_common></bind_material></instance_geometry></node>';
            const byLayer = nodes[p.group.key] = nodes[p.group.key] || {};
            (byLayer[p.layer] = byLayer[p.layer] || []).push(node);
        });

        let images = '', effects = '', materials = '';
        textures.forEach(function(t) { images += '<image id="' + t.id + '" name="' + t.id + '"><init_from>' + t.name + '</init_from></image>'; });
        matIds.forEach(function(mi) {
            const color = mi.rgb.map(f).join(' ') + ' 1';
            const diffuse = mi.tex
                ? '<texture texture="' + mi.id + '-sampler" texcoord="UVSET0"/>'
                : '<color>' + color + '</color>';
            const params = mi.tex
                ? '<newparam sid="' + mi.id + '-surface"><surface type="2D"><init_from>' + mi.tex.id + '</init_from></surface></newparam>' +
                  '<newparam sid="' + mi.id + '-sampler"><sampler2D><source>' + mi.id + '-surface</source></sampler2D></newparam>'
                : '';
            const transp = mi.opacity < 1 ? '<transparency><float>' + f(mi.opacity) + '</float></transparency>' : '';
            effects += '<effect id="' + mi.id + '-fx"><profile_COMMON>' + params + '<technique sid="common"><lambert><diffuse>' + diffuse + '</diffuse>' + transp + '</lambert></technique></profile_COMMON></effect>';
            materials += '<material id="' + mi.id + '" name="' + mi.id + '"><instance_effect url="#' + mi.id + '-fx"/></material>';
        });

        // One node per cabinet (and the room shell), each split into part-type layers
        let scene = '';
        _groupsInOrder(parts).forEach(function(grp, gi) {
            const byLayer = nodes[grp.key];
            let inner = '';
            LAYER_ORDER.forEach(function(k) {
                if (!byLayer[k]) return;
                inner += '<node id="g' + gi + '-' + k + '" name="' + LAYERS[k].name + '">' + byLayer[k].join('') + '</node>';
            });
            scene += '<node id="group' + gi + '" name="' + _xml(grp.name) + '">' + inner + '</node>';
        });
        const sceneName = _xml(_fileBaseName());
        const dae = '<?xml version="1.0" encoding="utf-8"?>\n' +
            '<COLLADA xmlns="http://www.collada.org/2005/11/COLLADASchema" version="1.4.1">' +
            '<asset><contributor><authoring_tool>AnyCloset 3D</authoring_tool></contributor>' +
            '<created>' + new Date().toISOString() + '</created><modified>' + new Date().toISOString() + '</modified>' +
            '<unit name="centimeter" meter="0.01"/><up_axis>Y_UP</up_axis></asset>' +
            (images ? '<library_images>' + images + '</library_images>' : '') +
            '<library_effects>' + effects + '</library_effects>' +
            '<library_materials>' + materials + '</library_materials>' +
            '<library_geometries>' + geoms.join('') + '</library_geometries>' +
            '<library_visual_scenes><visual_scene id="scene" name="' + sceneName + '"><node id="root" name="' + sceneName + '">' + scene + '</node></visual_scene></library_visual_scenes>' +
            '<scene><instance_visual_scene url="#scene"/></scene></COLLADA>';

        const files = [{ name: fileStem + '.dae', data: dae }];
        for (let i = 0; i < textures.length; i++) {
            const blob = await _textureBlob(textures[i].img);
            if (blob) files.push({ name: textures[i].name, data: blob });
        }
        return files;
    }

    // ---------- OBJ + MTL (3ds Max / Blender / Rhino) ----------
    async function _buildOBJ(parts, fileStem) {
        const f = function(x) { return (Math.round(x * 10000) / 10000).toString(); };
        const mats = new Map();
        const textures = [];
        const texByImg = new Map();
        const obj = ['# AnyCloset 3D — units: centimeters, Y-up', 'mtllib ' + fileStem + '.mtl'];
        let vBase = 1;
        const v = new THREE.Vector3();
        parts.forEach(function(p, pi) {
            const mat = p.material;
            let mi = mats.get(mat);
            if (!mi) {
                mi = _materialInfo(mat, 'mat' + mats.size, textures, texByImg, false);
                mats.set(mat, mi);
            }
            const g = p.mesh.geometry;
            const pos = g.attributes.position, nor = g.attributes.normal, uv = g.attributes.uv;
            const nm = new THREE.Matrix3().getNormalMatrix(p.matrix);
            const partName = String((p.mesh.userData && p.mesh.userData.partId) || ('part_' + pi)).split('::').pop().replace(/\s+/g, '_');
            const groupName = p.group.key + '_' + LAYERS[p.layer].name;
            obj.push('o ' + groupName + '_' + partName, 'g ' + groupName, 'usemtl ' + mi.id);
            for (let i = 0; i < pos.count; i++) {
                v.fromBufferAttribute(pos, i).applyMatrix4(p.matrix);
                obj.push('v ' + f(v.x) + ' ' + f(v.y) + ' ' + f(v.z));
            }
            if (uv) for (let i = 0; i < pos.count; i++) {
                const t = _uvAt(uv, i, mi);
                obj.push('vt ' + f(t[0]) + ' ' + f(t[1]));
            }
            if (nor) for (let i = 0; i < pos.count; i++) {
                v.fromBufferAttribute(nor, i).applyMatrix3(nm).normalize();
                obj.push('vn ' + f(v.x) + ' ' + f(v.y) + ' ' + f(v.z));
            }
            const idx = g.index ? g.index.array : Array.from({ length: pos.count }, function(_, i) { return i; });
            const ref = function(i) {
                const k = vBase + i;
                return k + '/' + (uv ? k : '') + (nor ? '/' + k : '');
            };
            for (let i = 0; i + 2 < idx.length; i += 3) obj.push('f ' + ref(idx[i]) + ' ' + ref(idx[i + 1]) + ' ' + ref(idx[i + 2]));
            vBase += pos.count;
        });

        const mtl = ['# AnyCloset 3D'];
        mats.forEach(function(mi) {
            mtl.push('newmtl ' + mi.id, 'Ka 0 0 0', 'Kd ' + mi.rgb.map(f).join(' '), 'Ks 0.05 0.05 0.05', 'Ns 10', 'illum 2');
            if (mi.opacity < 1) mtl.push('d ' + f(mi.opacity), 'Tr ' + f(1 - mi.opacity));
            if (mi.tex) mtl.push('map_Kd ' + mi.tex.name);
            mtl.push('');
        });

        const files = [{ name: fileStem + '.obj', data: obj.join('\n') + '\n' }, { name: fileStem + '.mtl', data: mtl.join('\n') }];
        for (let i = 0; i < textures.length; i++) {
            const blob = await _textureBlob(textures[i].img);
            if (blob) files.push({ name: textures[i].name, data: blob });
        }
        return files;
    }

    // ---------- download / UI ----------
    function _fileBaseName() {
        const name = (typeof state !== 'undefined' && (state.cabinetName || (state.wings && state.wings.center && state.wings.center.cabinetName))) || 'ארון';
        return String(name).replace(/[\\/:*?"<>|]+/g, '').trim() || 'ארון';
    }

    function _download(blob, filename) {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        setTimeout(function() { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
    }

    function _loadJSZip() {
        if (window.JSZip) return Promise.resolve(window.JSZip);
        return new Promise(function(res, rej) {
            const s = document.createElement('script');
            s.src = 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js';
            s.onload = function() { res(window.JSZip); };
            s.onerror = rej;
            document.head.appendChild(s);
        });
    }

    function _toast(msg) {
        if (typeof window.showToast === 'function') { window.showToast(msg); return; }
        console.log('[export3d]', msg);
    }

    function _withExportView(fn) {
        if (typeof state !== 'undefined' && state.viewMode === 'blueprint') {
            alert('ייצוא תלת-ממד זמין בתצוגת עריכה רגילה (לא בשרטוט ייצור).');
            return Promise.resolve();
        }
        return Promise.resolve().then(fn);
    }

    async function _writeFiles(parts, format, base, isRoom) {
        if (format === 'dxf') {
            _download(new Blob([_buildDXF(parts)], { type: 'application/dxf' }), base + '.dxf');
            return;
        }
        const isObj = format === 'obj';
        const stem = isRoom ? 'room' : 'cabinet';
        const files = isObj ? await _buildOBJ(parts, stem) : await _buildDAE(parts, stem);
        const JSZip = await _loadJSZip();
        const zip = new JSZip();
        files.forEach(function(fl) { zip.file(fl.name, fl.data); });
        _download(await zip.generateAsync({ type: 'blob' }), base + (isObj ? ' - 3ds Max.zip' : ' - SketchUp.zip'));
    }

    window._export3DScope = window._export3DScope || 'cabinet';

    window._export3D = function(format, scope) {
        _closeMenu();
        const isRoom = (scope || window._export3DScope) === 'room';
        return _withExportView(async function() {
            const base = _fileBaseName() + (isRoom ? ' - חדר' : '');
            try {
                if (isRoom) {
                    await _withRoomBuilt(async function() {
                        const parts = _collectRoomParts();
                        if (!parts.length) throw new Error('לא נמצאו חלקים לייצוא');
                        await _writeFiles(parts, format, base, true);
                    });
                } else {
                    const parts = _collectParts();
                    if (!parts.length) { alert('לא נמצאו חלקים לייצוא.'); return; }
                    await _writeFiles(parts, format, base, false);
                }
                _toast('הקובץ ירד בהצלחה');
            } catch (e) {
                console.error('[export3d]', e);
                alert('הייצוא נכשל: ' + (e && e.message ? e.message : e));
            }
        });
    };

    function _closeMenu() {
        const m = document.getElementById('export3d-menu');
        if (m) m.remove();
        document.removeEventListener('mousedown', _outside, true);
    }
    function _outside(e) {
        const m = document.getElementById('export3d-menu');
        if (m && !m.contains(e.target) && !e.target.closest('#btn-export-3d')) _closeMenu();
    }

    const _SCOPE_NOTE = {
        cabinet: 'ייצוא הארון שבעריכה — דלתות סגורות, בשכבה נפרדת',
        room: 'החדר כולו: קירות, רצפה, תקרה, דלתות וחלונות, ריהוט וכל הארונות שבחדר — כל ארון בקבוצה נפרדת'
    };

    window._setExport3DScope = function(scope) {
        window._export3DScope = scope === 'room' ? 'room' : 'cabinet';
        const m = document.getElementById('export3d-menu');
        if (!m) return;
        m.querySelectorAll('[data-scope]').forEach(function(b) {
            const on = b.getAttribute('data-scope') === window._export3DScope;
            b.style.background = on ? '#fff' : 'transparent';
            b.style.color = on ? '#4f46e5' : '#475569';
            b.style.boxShadow = on ? '0 1px 3px rgba(15,23,42,.15)' : 'none';
        });
        const note = m.querySelector('#export3d-note');
        if (note) note.textContent = _SCOPE_NOTE[window._export3DScope];
    };

    window._openExport3DMenu = function(ev) {
        if (document.getElementById('export3d-menu')) { _closeMenu(); return; }
        const btn = ev && ev.currentTarget ? ev.currentTarget : document.getElementById('btn-export-3d');
        const r = btn.getBoundingClientRect();
        const m = document.createElement('div');
        m.id = 'export3d-menu';
        m.dir = 'rtl';
        m.style.cssText = 'position:fixed;z-index:10050;background:#fff;border:1px solid #e2e8f0;border-radius:12px;' +
            'box-shadow:0 10px 30px rgba(15,23,42,.18);padding:8px;width:270px;font-family:inherit;' +
            'top:' + Math.round(r.bottom + 6) + 'px;left:' + Math.round(Math.max(8, r.left + r.width / 2 - 135)) + 'px;';
        const item = function(fmt, icon, title, desc) {
            return '<button type="button" onclick="window._export3D(\'' + fmt + '\')" style="display:flex;gap:10px;align-items:flex-start;width:100%;' +
                'text-align:right;background:none;border:0;border-radius:8px;padding:9px 10px;cursor:pointer;font:inherit;color:#0f172a;" ' +
                'onmouseover="this.style.background=\'#f1f5f9\'" onmouseout="this.style.background=\'none\'">' +
                '<i class="' + icon + '" style="margin-top:3px;color:#4f46e5;width:16px;"></i>' +
                '<span><b style="display:block;font-size:.88rem;">' + title + '</b><span style="font-size:.74rem;color:#64748b;">' + desc + '</span></span></button>';
        };
        const scopeBtn = function(scope, icon, label) {
            return '<button type="button" data-scope="' + scope + '" onclick="window._setExport3DScope(\'' + scope + '\')" ' +
                'style="flex:1;border:0;border-radius:7px;padding:6px 8px;cursor:pointer;font:inherit;font-size:.8rem;font-weight:700;">' +
                '<i class="' + icon + '" style="margin-left:5px;"></i>' + label + '</button>';
        };
        m.innerHTML =
            '<div style="display:flex;gap:4px;background:#f1f5f9;border-radius:9px;padding:3px;margin:2px 2px 6px;">' +
                scopeBtn('cabinet', 'fa-solid fa-door-closed', 'ארון זה') +
                scopeBtn('room', 'fa-solid fa-house', 'חדר שלם') +
            '</div>' +
            '<div id="export3d-note" style="font-size:.74rem;color:#64748b;padding:2px 10px 6px;"></div>' +
            item('dae', 'fa-solid fa-cube', 'SketchUp (DAE)', 'כולל צבעים וטקסטורות · קובץ ZIP — לחלץ ולייבא את קובץ ה-DAE') +
            item('dxf', 'fa-solid fa-drafting-compass', 'AutoCAD (DXF)', 'במילימטרים · שכבה לכל סוג חלק (Body, Doors, Room...)') +
            item('obj', 'fa-solid fa-cubes', '3ds Max / Blender (OBJ)', 'כולל צבעים וטקסטורות · ס"מ · קובץ ZIP — לחלץ ולייבא את קובץ ה-OBJ');
        document.body.appendChild(m);
        window._setExport3DScope(window._export3DScope);
        setTimeout(function() { document.addEventListener('mousedown', _outside, true); }, 0);
    };

    window._export3DDebug = { collect: _collectParts, collectRoom: _collectRoomParts, withRoom: _withRoomBuilt, dxf: _buildDXF, dae: _buildDAE, obj: _buildOBJ };
})();
