// ==========================================
// 3D export of the cabinet being edited — SketchUp (Collada .dae in a zip with textures)
// AutoCAD (DXF R12 with 3DFACE entities, one layer per part type) and 3ds Max / Blender
// (OBJ + MTL in a zip with textures).
// Engine units are cm, Y-up; DXF is written in mm, Z-up.
// ==========================================
(function() {
    'use strict';

    const LAYERS = {
        body:    { name: 'Body',    he: 'גוף',     aci: 7 },
        shelves: { name: 'Shelves', he: 'מדפים',   aci: 9 },
        doors:   { name: 'Doors',   he: 'דלתות',   aci: 30 },
        drawers: { name: 'Drawers', he: 'מגירות',  aci: 40 },
        handles: { name: 'Handles', he: 'ידיות',   aci: 8 }
    };
    const LAYER_ORDER = ['body', 'shelves', 'drawers', 'doors', 'handles'];

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

    /** Real cabinet parts of the edited cabinet, with transforms relative to the cabinet origin. */
    function _collectParts() {
        const root = window.cabinetGroup;
        if (!root) return [];
        root.updateMatrixWorld(true);
        const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
        const handleSet = new Set(window._doorHandleObjs || []);
        const parts = [];
        root.traverse(function(o) {
            if (!o.isMesh || o.isSkinnedMesh || !o.geometry || !o.geometry.attributes.position) return;
            if (_isHelper(o)) return;
            if (_ancestors(o, root, function(a) {
                return (a.userData && a.userData.roomProp) || /laptop|chair|bed/i.test(a.name || '');
            })) return;
            const layer = _layerOf(o, root, handleSet);
            // Doors hidden only for on-screen viewing are still exported (closed)
            const frontLayer = layer === 'doors' || layer === 'handles' || layer === 'drawers';
            if (!frontLayer && _ancestors(o, root, function(a) { return a.visible === false; })) return;
            const m = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);
            parts.push({ mesh: o, layer: layer, matrix: m, material: Array.isArray(o.material) ? o.material[0] : o.material });
        });
        return parts;
    }

    /** Triangles / quads in cabinet space. quad=true for BoxGeometry faces (cleaner CAD edges). */
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
        w(0, 'SECTION'); w(2, 'HEADER');
        w(9, '$ACADVER'); w(1, 'AC1009');
        w(9, '$INSBASE'); w(10, 0); w(20, 0); w(30, 0);
        w(0, 'ENDSEC');
        w(0, 'SECTION'); w(2, 'TABLES');
        w(0, 'TABLE'); w(2, 'LAYER'); w(70, LAYER_ORDER.length + 1);
        w(0, 'LAYER'); w(2, '0'); w(70, 0); w(62, 7); w(6, 'CONTINUOUS');
        LAYER_ORDER.forEach(function(k) {
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

    async function _buildDAE(parts) {
        const matIds = new Map();   // three material → effect info
        const textures = [];        // { name, img }
        const texByImg = new Map();
        const geoms = [];
        const nodesByLayer = {};
        const f = function(x) { return (Math.round(x * 10000) / 10000).toString(); };

        parts.forEach(function(p, pi) {
            const mat = p.material;
            let mi = matIds.get(mat);
            if (!mi) {
                const id = 'mat' + matIds.size;
                let tex = null;
                const img = mat && mat.map && mat.map.image;
                if (img && (img.naturalWidth || img.width)) {
                    tex = texByImg.get(img);
                    if (!tex) {
                        tex = { name: 'textures/tex' + textures.length + '.jpg', img: img, id: 'img' + textures.length };
                        textures.push(tex);
                        texByImg.set(img, tex);
                    }
                }
                const rgb = mat && mat.color ? [mat.color.r, mat.color.g, mat.color.b] : [0.8, 0.8, 0.8];
                const opacity = mat && mat.transparent ? (mat.opacity == null ? 1 : mat.opacity) : 1;
                mi = { id: id, tex: tex, rgb: rgb, opacity: opacity, repeat: mat && mat.map ? mat.map.repeat : null, offset: mat && mat.map ? mat.map.offset : null };
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
                if (uv) {
                    let u = uv.getX(i), vv = uv.getY(i);
                    if (mi.repeat) { u = u * mi.repeat.x + mi.offset.x; vv = vv * mi.repeat.y + mi.offset.y; }
                    T.push(f(u), f(vv));
                }
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
            (nodesByLayer[p.layer] = nodesByLayer[p.layer] || []).push(node);
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

        let scene = '';
        LAYER_ORDER.forEach(function(k) {
            if (!nodesByLayer[k]) return;
            scene += '<node id="layer-' + k + '" name="' + LAYERS[k].name + '">' + nodesByLayer[k].join('') + '</node>';
        });
        const cabName = _xml(_fileBaseName());
        const dae = '<?xml version="1.0" encoding="utf-8"?>\n' +
            '<COLLADA xmlns="http://www.collada.org/2005/11/COLLADASchema" version="1.4.1">' +
            '<asset><contributor><authoring_tool>AnyCloset 3D</authoring_tool></contributor>' +
            '<created>' + new Date().toISOString() + '</created><modified>' + new Date().toISOString() + '</modified>' +
            '<unit name="centimeter" meter="0.01"/><up_axis>Y_UP</up_axis></asset>' +
            (images ? '<library_images>' + images + '</library_images>' : '') +
            '<library_effects>' + effects + '</library_effects>' +
            '<library_materials>' + materials + '</library_materials>' +
            '<library_geometries>' + geoms.join('') + '</library_geometries>' +
            '<library_visual_scenes><visual_scene id="scene" name="' + cabName + '"><node id="cabinet" name="' + cabName + '">' + scene + '</node></visual_scene></library_visual_scenes>' +
            '<scene><instance_visual_scene url="#scene"/></scene></COLLADA>';

        const files = [{ name: 'cabinet.dae', data: dae }];
        for (let i = 0; i < textures.length; i++) {
            const blob = await _textureBlob(textures[i].img);
            if (blob) files.push({ name: textures[i].name, data: blob });
        }
        return files;
    }

    // ---------- OBJ + MTL (3ds Max / Blender / Rhino) ----------
    async function _buildOBJ(parts) {
        const f = function(x) { return (Math.round(x * 10000) / 10000).toString(); };
        const mats = new Map();
        const textures = [];
        const texByImg = new Map();
        const obj = ['# AnyCloset 3D — units: centimeters, Y-up', 'mtllib cabinet.mtl'];
        let vBase = 1;
        const v = new THREE.Vector3();
        parts.forEach(function(p, pi) {
            const mat = p.material;
            let mi = mats.get(mat);
            if (!mi) {
                const img = mat && mat.map && mat.map.image;
                let tex = null;
                if (img && (img.naturalWidth || img.width)) {
                    tex = texByImg.get(img);
                    if (!tex) {
                        tex = { name: 'textures/tex' + textures.length + '.jpg', img: img };
                        textures.push(tex);
                        texByImg.set(img, tex);
                    }
                }
                mi = {
                    id: 'mat' + mats.size, tex: tex,
                    rgb: mat && mat.color ? [mat.color.r, mat.color.g, mat.color.b] : [0.8, 0.8, 0.8],
                    opacity: mat && mat.transparent ? (mat.opacity == null ? 1 : mat.opacity) : 1,
                    repeat: mat && mat.map ? mat.map.repeat : null, offset: mat && mat.map ? mat.map.offset : null
                };
                mats.set(mat, mi);
            }
            const g = p.mesh.geometry;
            const pos = g.attributes.position, nor = g.attributes.normal, uv = g.attributes.uv;
            const nm = new THREE.Matrix3().getNormalMatrix(p.matrix);
            const partName = String((p.mesh.userData && p.mesh.userData.partId) || ('part_' + pi)).split('::').pop().replace(/\s+/g, '_');
            obj.push('o ' + LAYERS[p.layer].name + '_' + partName, 'g ' + LAYERS[p.layer].name, 'usemtl ' + mi.id);
            for (let i = 0; i < pos.count; i++) {
                v.fromBufferAttribute(pos, i).applyMatrix4(p.matrix);
                obj.push('v ' + f(v.x) + ' ' + f(v.y) + ' ' + f(v.z));
            }
            if (uv) for (let i = 0; i < pos.count; i++) {
                let u = uv.getX(i), vv = uv.getY(i);
                if (mi.repeat) { u = u * mi.repeat.x + mi.offset.x; vv = vv * mi.repeat.y + mi.offset.y; }
                obj.push('vt ' + f(u) + ' ' + f(vv));
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

        const files = [{ name: 'cabinet.obj', data: obj.join('\n') + '\n' }, { name: 'cabinet.mtl', data: mtl.join('\n') }];
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

    window._export3D = function(format) {
        _closeMenu();
        return _withExportView(async function() {
            const parts = _collectParts();
            if (!parts.length) { alert('לא נמצאו חלקים לייצוא.'); return; }
            const base = _fileBaseName();
            try {
                if (format === 'dxf') {
                    _download(new Blob([_buildDXF(parts)], { type: 'application/dxf' }), base + '.dxf');
                } else {
                    const isObj = format === 'obj';
                    const files = isObj ? await _buildOBJ(parts) : await _buildDAE(parts);
                    const JSZip = await _loadJSZip();
                    const zip = new JSZip();
                    files.forEach(function(fl) { zip.file(fl.name, fl.data); });
                    _download(await zip.generateAsync({ type: 'blob' }), base + (isObj ? ' - 3ds Max.zip' : ' - SketchUp.zip'));
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

    window._openExport3DMenu = function(ev) {
        if (document.getElementById('export3d-menu')) { _closeMenu(); return; }
        const btn = ev && ev.currentTarget ? ev.currentTarget : document.getElementById('btn-export-3d');
        const r = btn.getBoundingClientRect();
        const m = document.createElement('div');
        m.id = 'export3d-menu';
        m.dir = 'rtl';
        m.style.cssText = 'position:fixed;z-index:10050;background:#fff;border:1px solid #e2e8f0;border-radius:12px;' +
            'box-shadow:0 10px 30px rgba(15,23,42,.18);padding:8px;min-width:250px;font-family:inherit;' +
            'top:' + Math.round(r.bottom + 6) + 'px;left:' + Math.round(Math.max(8, r.left + r.width / 2 - 125)) + 'px;';
        const item = function(fmt, icon, title, desc) {
            return '<button type="button" onclick="window._export3D(\'' + fmt + '\')" style="display:flex;gap:10px;align-items:flex-start;width:100%;' +
                'text-align:right;background:none;border:0;border-radius:8px;padding:9px 10px;cursor:pointer;font:inherit;color:#0f172a;" ' +
                'onmouseover="this.style.background=\'#f1f5f9\'" onmouseout="this.style.background=\'none\'">' +
                '<i class="' + icon + '" style="margin-top:3px;color:#4f46e5;width:16px;"></i>' +
                '<span><b style="display:block;font-size:.88rem;">' + title + '</b><span style="font-size:.74rem;color:#64748b;">' + desc + '</span></span></button>';
        };
        m.innerHTML =
            '<div style="font-size:.74rem;color:#64748b;padding:2px 10px 6px;">ייצוא הארון שבעריכה — דלתות סגורות, בשכבה נפרדת</div>' +
            item('dae', 'fa-solid fa-cube', 'SketchUp (DAE)', 'כולל צבעים וטקסטורות · קובץ ZIP — לחלץ ולייבא את cabinet.dae') +
            item('dxf', 'fa-solid fa-drafting-compass', 'AutoCAD (DXF)', 'במילימטרים · שכבות: Body, Shelves, Drawers, Doors, Handles') +
            item('obj', 'fa-solid fa-cubes', '3ds Max / Blender (OBJ)', 'כולל צבעים וטקסטורות · ס"מ · קובץ ZIP — לחלץ ולייבא את cabinet.obj');
        document.body.appendChild(m);
        setTimeout(function() { document.addEventListener('mousedown', _outside, true); }, 0);
    };

    window._export3DDebug = { collect: _collectParts, dxf: _buildDXF, dae: _buildDAE, obj: _buildOBJ };
})();
