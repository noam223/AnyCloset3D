// ── Room finishes: floor (parquet tones / porcelain tiles) and wall paint ──────────────────────────
// Floor style lives in window._roomFloorStyle and wall paint in window._roomWallColor; both are saved
// with the project (index-init.js) and read by _buildRoom (3D) and the room plan (2D).

window.ROOM_PARQUET_TONES = [
    { id: 'oak',       label: 'אלון טבעי',  filter: 'none',                                                 swatch: '#c79a62' },
    { id: 'light',     label: 'אלון בהיר',  filter: 'brightness(1.18) saturate(0.7)',                       swatch: '#dcc29a' },
    { id: 'whitewash', label: 'אלון מולבן', filter: 'grayscale(0.6) brightness(1.3) contrast(0.82)',        swatch: '#e2d9cc' },
    { id: 'honey',     label: 'אלון דבש',   filter: 'sepia(0.35) saturate(1.4) brightness(0.93)',           swatch: '#c48a4a' },
    { id: 'grey',      label: 'אלון אפור',  filter: 'grayscale(0.92) brightness(1.02)',                     swatch: '#a9a6a1' },
    { id: 'smoked',    label: 'אלון מעושן', filter: 'brightness(0.64) saturate(0.85)',                      swatch: '#87694a' },
    { id: 'walnut',    label: 'אגוז',       filter: 'brightness(0.48) saturate(1.15) hue-rotate(-6deg)',    swatch: '#5e4330' }
];
window.ROOM_TILE_FINISHES = [
    { id: 'concrete',      label: 'בטון בהיר', swatch: '#bebbb5', roughness: 0.55, faces: _tileFaces('concrete') },
    { id: 'concrete_dark', label: 'בטון כהה',  swatch: '#7d7c79', roughness: 0.55, faces: _tileFaces('concrete-dark') },
    { id: 'carrara',       label: 'קררה',      swatch: '#f3f3f1', roughness: 0.25, faces: _tileFaces('carrara') },
    { id: 'stone',         label: 'אבן בז\'',  swatch: '#d4c8b4', roughness: 0.5,  faces: _tileFaces('stone'), directional: true }
];
function _tileFaces(name) {
    return [1, 2, 3].map(function(n) { return 'images/tiles/' + name + '-' + n + '.jpg'; });
}
window.ROOM_TILE_SIZES = ['60x120', '80x80', '100x100', '120x120'];
window.ROOM_FLOOR_DEFAULT = { kind: 'parquet', tone: 'oak', finish: 'concrete', size: '60x120' };

window._normRoomFloorStyle = function(s) {
    const d = window.ROOM_FLOOR_DEFAULT;
    const o = Object.assign({}, d, s || {});
    if (o.kind !== 'tile') o.kind = 'parquet';
    if (o.finish === 'calacatta') o.finish = 'carrara';
    if (!window.ROOM_PARQUET_TONES.some(function(t) { return t.id === o.tone; })) o.tone = d.tone;
    if (!window.ROOM_TILE_FINISHES.some(function(t) { return t.id === o.finish; })) o.finish = d.finish;
    if (window.ROOM_TILE_SIZES.indexOf(o.size) < 0) o.size = d.size;
    return o;
};
window._roomFloorStyle = window._normRoomFloorStyle(window._roomFloorStyle);
window._roomWallColor = window._roomWallColor || null;

(function() {
    const _canvasCache = {};
    const _texCache = {};
    const _patternCache = {};

    function _rng(seed) {
        let s = seed >>> 0;
        return function() { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
    }
    function _hash(str) {
        let h = 2166136261;
        for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
        return h >>> 0;
    }

    /** Tile size in cm along the room's x (long side) and z axes. */
    function _tileDims(size) {
        const p = String(size).split('x').map(Number);
        return { x: Math.max(p[0], p[1]), z: Math.min(p[0], p[1]) };
    }

    function _blotches(ctx, x0, y0, w, h, ppc, rnd, n, rgb, aMin, aMax, rMin, rMax) {
        for (let k = 0; k < n; k++) {
            const cx = x0 + rnd() * w, cy = y0 + rnd() * h;
            const r = (rMin + rnd() * (rMax - rMin)) * ppc;
            const a = aMin + rnd() * (aMax - aMin);
            const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
            g.addColorStop(0, 'rgba(' + rgb + ',' + a + ')');
            g.addColorStop(1, 'rgba(' + rgb + ',0)');
            ctx.fillStyle = g;
            ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
        }
    }
    function _specks(ctx, x0, y0, w, h, ppc, rnd, n, rgb, a) {
        ctx.fillStyle = 'rgba(' + rgb + ',' + a + ')';
        for (let k = 0; k < n; k++) {
            const s = (0.05 + rnd() * 0.12) * ppc;
            ctx.fillRect(x0 + rnd() * w, y0 + rnd() * h, s, s);
        }
    }
    function _vein(ctx, x0, y0, w, h, ppc, rnd, color, width) {
        const horiz = rnd() < 0.5;
        let x = horiz ? x0 - 0.05 * w : x0 + rnd() * w;
        let y = horiz ? y0 + rnd() * h : y0 - 0.05 * h;
        let ang = horiz ? (rnd() - 0.5) * 1.2 : Math.PI / 2 + (rnd() - 0.5) * 1.2;
        const step = 2.5 * ppc;
        ctx.strokeStyle = color;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(x, y);
        for (let i = 0; i < 200; i++) {
            ang += (rnd() - 0.5) * 0.5;
            x += Math.cos(ang) * step;
            y += Math.sin(ang) * step;
            ctx.lineTo(x, y);
            if (x < x0 - 0.1 * w || x > x0 + 1.1 * w || y < y0 - 0.1 * h || y > y0 + 1.1 * h) break;
        }
        ctx.lineWidth = width * ppc;
        ctx.stroke();
    }

    function _drawTileSurface(ctx, finish, x0, y0, w, h, ppc, rnd) {
        if (finish === 'carrara') {
            ctx.fillStyle = '#f4f4f2';
            ctx.fillRect(x0, y0, w, h);
            _blotches(ctx, x0, y0, w, h, ppc, rnd, 30, '160,160,158', 0.03, 0.07, 10, 40);
            ctx.save();
            ctx.filter = 'blur(' + Math.max(2, 1.2 * ppc) + 'px)';
            for (let v = 0; v < 2; v++) _vein(ctx, x0, y0, w, h, ppc, rnd, 'rgba(160,160,158,0.22)', 2 + rnd() * 3);
            ctx.filter = 'blur(' + Math.max(1, 0.35 * ppc) + 'px)';
            for (let v = 0; v < 2; v++) _vein(ctx, x0, y0, w, h, ppc, rnd, 'rgba(150,150,148,0.2)', 0.3 + rnd() * 0.4);
            ctx.restore();
            return;
        }
        const base = { concrete: '#bdbab4', concrete_dark: '#7e7d7a', stone: '#d5c9b6' }[finish] || '#bdbab4';
        ctx.fillStyle = base;
        ctx.fillRect(x0, y0, w, h);
        if (finish === 'stone') {
            _blotches(ctx, x0, y0, w, h, ppc, rnd, 50, '168,150,122', 0.05, 0.14, 4, 22);
            _blotches(ctx, x0, y0, w, h, ppc, rnd, 30, '240,234,222', 0.06, 0.16, 4, 18);
            ctx.save();
            ctx.filter = 'blur(' + Math.max(1, 0.4 * ppc) + 'px)';
            for (let v = 0; v < 3; v++) _vein(ctx, x0, y0, w, h, ppc, rnd, 'rgba(160,140,112,0.18)', 0.6 + rnd() * 0.8);
            ctx.restore();
            _specks(ctx, x0, y0, w, h, ppc, rnd, Math.round(w * h / (ppc * ppc) * 0.4), '120,104,84', 0.25);
            return;
        }
        const dark = finish === 'concrete_dark';
        _blotches(ctx, x0, y0, w, h, ppc, rnd, 60, dark ? '60,60,58' : '140,137,132', 0.05, 0.13, 5, 35);
        _blotches(ctx, x0, y0, w, h, ppc, rnd, 40, dark ? '150,149,146' : '222,220,215', 0.04, 0.11, 5, 30);
        _specks(ctx, x0, y0, w, h, ppc, rnd, Math.round(w * h / (ppc * ppc) * 0.5), dark ? '40,40,40' : '110,108,104', 0.22);
        _specks(ctx, x0, y0, w, h, ppc, rnd, Math.round(w * h / (ppc * ppc) * 0.3), dark ? '170,170,168' : '240,238,234', 0.25);
    }

    // Photographic slab faces (several per finish, like a real tile batch); until all have loaded the
    // procedural surface above stands in. Each face's colour is pulled most of the way to the batch
    // average so neighbouring tiles vary in pattern without looking patchy.
    const _tileFaceSets = {};
    function _avgRgb(img) {
        const c = document.createElement('canvas');
        c.width = c.height = 16;
        const x = c.getContext('2d');
        x.drawImage(img, 0, 0, 16, 16);
        const d = x.getImageData(0, 0, 16, 16).data;
        const s = [0, 0, 0];
        for (let i = 0; i < d.length; i += 4) { s[0] += d[i]; s[1] += d[i + 1]; s[2] += d[i + 2]; }
        const n = d.length / 4;
        return s.map(function(v) { return Math.max(1, v / n); });
    }
    function _balancedFace(img, avg, mean) {
        const c = document.createElement('canvas');
        c.width = img.naturalWidth;
        c.height = img.naturalHeight;
        const x = c.getContext('2d');
        x.drawImage(img, 0, 0);
        const id = x.getImageData(0, 0, c.width, c.height);
        const d = id.data;
        const g = [0, 1, 2].map(function(k) { return 1 + (mean[k] / avg[k] - 1) * 0.8; });
        for (let i = 0; i < d.length; i += 4) {
            d[i] = Math.min(255, d[i] * g[0]);
            d[i + 1] = Math.min(255, d[i + 1] * g[1]);
            d[i + 2] = Math.min(255, d[i + 2] * g[2]);
        }
        x.putImageData(id, 0, 0);
        return c;
    }
    function _tileFaceSet(finish) {
        const fin = window.ROOM_TILE_FINISHES.find(function(f) { return f.id === finish; });
        if (!fin || !fin.faces || !fin.faces.length) return null;
        let e = _tileFaceSets[finish];
        if (!e) {
            e = _tileFaceSets[finish] = { faces: [], ready: false };
            let left = fin.faces.length;
            fin.faces.forEach(function(src) {
                const img = new Image();
                const done = function() {
                    if (--left) return;
                    e.faces = e.faces.filter(function(f) { return f.img.naturalWidth > 0; });
                    if (!e.faces.length) return;
                    const avgs = e.faces.map(function(f) { return _avgRgb(f.img); });
                    const mean = [0, 1, 2].map(function(k) {
                        return avgs.reduce(function(a, v) { return a + v[k]; }, 0) / avgs.length;
                    });
                    e.faces.forEach(function(f, i) { f.img = _balancedFace(f.img, avgs[i], mean); });
                    e.ready = true;
                    _invalidateFinish(finish);
                };
                img.onload = done;
                img.onerror = done;
                img.src = src;
                e.faces.push({ img: img });
            });
        }
        return e.ready ? e.faces : null;
    }
    function _invalidateFinish(finish) {
        const prefix = 'tile:' + finish + ':';
        Object.keys(_canvasCache).forEach(function(k) { if (k.indexOf(prefix) === 0) delete _canvasCache[k]; });
        Object.keys(_patternCache).forEach(function(k) { if (k.indexOf(prefix) === 0) delete _patternCache[k]; });
        Object.keys(_texCache).forEach(function(k) {
            if (k.indexOf(prefix) === 0) { _texCache[k].dispose(); delete _texCache[k]; }
        });
        const s = window._roomFloorStyle;
        if (s && s.kind === 'tile' && s.finish === finish) {
            if (typeof _buildRoom === 'function' && window._roomVisible) _buildRoom();
            if (typeof window._renderRoomPlan2D === 'function') window._renderRoomPlan2D();
        }
    }

    /**
     * One tile cut from a random part of a slab face, turned by quarter turns (square tiles) or half turns
     * (rectangular tiles).
     */
    function _drawTileFromFace(ctx, face, x0, y0, w, h, quarterTurns) {
        const img = face.img;
        const rotW = quarterTurns % 2 ? h : w, rotH = quarterTurns % 2 ? w : h;
        const ar = rotW / rotH;
        let cw = img.width, ch = cw / ar;
        if (ch > img.height) { ch = img.height; cw = ch * ar; }
        const k = 0.8 + face.rnd() * 0.2;
        cw *= k; ch *= k;
        const sx = face.rnd() * (img.width - cw), sy = face.rnd() * (img.height - ch);
        ctx.save();
        ctx.translate(x0 + w / 2, y0 + h / 2);
        ctx.rotate(quarterTurns * Math.PI / 2);
        ctx.drawImage(img, sx, sy, cw, ch, -rotW / 2, -rotH / 2, rotW, rotH);
        ctx.restore();
    }

    const TILE_BLOCK = 3;

    /** A TILE_BLOCK × TILE_BLOCK block of tiles with grout joints; returns { canvas, wCm, hCm }. */
    function _tileCanvas(finish, size) {
        const key = 'tile:' + finish + ':' + size;
        if (_canvasCache[key]) return _canvasCache[key];
        const td = _tileDims(size);
        const N = TILE_BLOCK;
        const wCm = td.x * N, hCm = td.z * N;
        const ppc = Math.min(8, 3072 / Math.max(wCm, hCm));
        const cv = document.createElement('canvas');
        cv.width = Math.round(wCm * ppc);
        cv.height = Math.round(hCm * ppc);
        const ctx = cv.getContext('2d');
        const rnd = _rng(_hash(key));
        const tw = cv.width / N, th = cv.height / N;
        const faces = _tileFaceSet(finish);
        const square = td.x === td.z;
        const fin = window.ROOM_TILE_FINISHES.find(function(f) { return f.id === finish; });
        const directional = !!(fin && fin.directional);
        const grid = [];
        for (let j = 0; j < N; j++) {
            for (let i = 0; i < N; i++) {
                ctx.save();
                ctx.beginPath();
                ctx.rect(i * tw, j * th, tw, th);
                ctx.clip();
                if (faces) {
                    // Avoid repeating the face of the left / upper neighbour (wrapping, since the block repeats)
                    const nb = [grid[j * N + (i + N - 1) % N], j ? grid[(j - 1) * N + i] : grid[(N - 1) * N + i]];
                    let fi = Math.floor(rnd() * faces.length);
                    for (let t = 0; t < faces.length && faces.length > 2 && nb.indexOf(fi) >= 0; t++) fi = (fi + 1) % faces.length;
                    grid[j * N + i] = fi;
                    const turns = square && !directional ? Math.floor(rnd() * 4) : (rnd() < 0.5 ? 0 : 2);
                    _drawTileFromFace(ctx, { img: faces[fi].img, rnd: rnd }, i * tw, j * th, tw, th, turns);
                } else {
                    _drawTileSurface(ctx, finish, i * tw, j * th, tw, th, ppc, rnd);
                }
                ctx.restore();
            }
        }
        // Grout: half a joint on each block edge so the block tiles seamlessly
        const gw = Math.max(1.5, 0.3 * ppc);
        ctx.fillStyle = finish === 'concrete_dark' ? '#5f5e5b' : (finish === 'carrara' ? '#dcdcd9' : '#a7a39b');
        for (let k = 0; k <= N; k++) {
            ctx.fillRect(k * tw - gw / 2, 0, gw, cv.height);
            ctx.fillRect(0, k * th - gw / 2, cv.width, gw);
        }
        return (_canvasCache[key] = { canvas: cv, wCm: wCm, hCm: hCm });
    }

    /** The oak plank image recoloured with a CSS filter; null until the base image has loaded. */
    function _parquetCanvas(tone) {
        const key = 'parquet:' + tone;
        if (_canvasCache[key]) return _canvasCache[key];
        const base = window._woodFloorTex && window._woodFloorTex.image;
        if (!base || !base.width) return null;
        const t = window.ROOM_PARQUET_TONES.find(function(p) { return p.id === tone; });
        const cv = document.createElement('canvas');
        cv.width = Math.min(2048, base.width);
        cv.height = Math.min(2048, base.height);
        const ctx = cv.getContext('2d');
        ctx.filter = (t && t.filter) || 'none';
        ctx.drawImage(base, 0, 0, cv.width, cv.height);
        return (_canvasCache[key] = { canvas: cv, wCm: 200, hCm: 200 });
    }

    function _canvasTexture(key, cv) {
        if (_texCache[key]) return _texCache[key];
        const tex = new THREE.CanvasTexture(cv);
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        if (typeof renderer !== 'undefined' && renderer && renderer.capabilities) {
            tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
        }
        return (_texCache[key] = tex);
    }

    /**
     * Floor texture for the current style: { map, wCm, hCm, parquet, roughness } or null while the oak
     * image is still loading (parquet tones are derived from it).
     */
    window._roomFloorTexInfo = function() {
        const s = window._normRoomFloorStyle(window._roomFloorStyle);
        if (s.kind === 'tile') {
            const c = _tileCanvas(s.finish, s.size);
            const fin = window.ROOM_TILE_FINISHES.find(function(f) { return f.id === s.finish; });
            return { map: _canvasTexture('tile:' + s.finish + ':' + s.size, c.canvas), wCm: c.wCm, hCm: c.hCm, parquet: false, roughness: fin ? fin.roughness : 0.5 };
        }
        if (!window._woodFloorTex) return null;
        if (s.tone === 'oak') return { map: window._woodFloorTex, wCm: 200, hCm: 200, parquet: true };
        const c = _parquetCanvas(s.tone);
        if (!c) return { map: window._woodFloorTex, wCm: 200, hCm: 200, parquet: true };
        return { map: _canvasTexture('parquet:' + s.tone, c.canvas), wCm: 200, hCm: 200, parquet: true };
    };

    /** Image + real size (cm) for the 2D plan's floor pattern. */
    window._roomFloorPattern2D = function() {
        const s = window._normRoomFloorStyle(window._roomFloorStyle);
        if (s.kind === 'parquet' && s.tone === 'oak') return { href: 'images/oak-floor.jpg', wCm: 200, hCm: 200, parquet: true };
        const key = s.kind === 'tile' ? 'tile:' + s.finish + ':' + s.size : 'parquet:' + s.tone;
        if (_patternCache[key]) return _patternCache[key];
        const c = s.kind === 'tile' ? _tileCanvas(s.finish, s.size) : _parquetCanvas(s.tone);
        if (!c) return { href: 'images/oak-floor.jpg', wCm: 200, hCm: 200, parquet: true };
        const k = Math.min(1, 1024 / Math.max(c.canvas.width, c.canvas.height));
        const sm = document.createElement('canvas');
        sm.width = Math.round(c.canvas.width * k);
        sm.height = Math.round(c.canvas.height * k);
        sm.getContext('2d').drawImage(c.canvas, 0, 0, sm.width, sm.height);
        return (_patternCache[key] = { href: sm.toDataURL('image/jpeg', 0.85), wCm: c.wCm, hCm: c.hCm, parquet: s.kind === 'parquet' });
    };
})();

// ── Sidebar UI ────────────────────────────────────────────────────────────────────────────────────
function _roomFinishesRebuild() {
    if (typeof _buildRoom === 'function') _buildRoom();
    if (typeof window._renderRoomPlan2D === 'function') window._renderRoomPlan2D();
    window._isDirty = true;
    if (typeof saveHistoryState === 'function') saveHistoryState();
}

window._setRoomFloorStyle = function(patch) {
    window._roomFloorStyle = window._normRoomFloorStyle(Object.assign({}, window._roomFloorStyle, patch || {}));
    window._syncRoomFinishesUI();
    _roomFinishesRebuild();
};

window._setRoomWallColor = function(color) {
    window._roomWallColor = color && color.hex ? { id: color.id || '', name: color.name || '', hex: color.hex } : null;
    window._syncRoomFinishesUI();
    _roomFinishesRebuild();
};

window._pickRoomWallColor = function() {
    if (typeof window.openTambourPaletteFor === 'function') {
        window.openTambourPaletteFor(function(c) { window._setRoomWallColor(c); });
    }
};

window._syncRoomFinishesUI = function() {
    const s = window._normRoomFloorStyle(window._roomFloorStyle);
    document.querySelectorAll('[data-floor-kind]').forEach(function(b) {
        b.classList.toggle('active', b.getAttribute('data-floor-kind') === s.kind);
    });
    const sw = document.getElementById('room-floor-swatches');
    if (sw) {
        const list = s.kind === 'tile' ? window.ROOM_TILE_FINISHES : window.ROOM_PARQUET_TONES;
        const cur = s.kind === 'tile' ? s.finish : s.tone;
        sw.innerHTML = list.map(function(t) {
            return '<button type="button" class="room-finish-swatch' + (t.id === cur ? ' active' : '') + '" data-floor-opt="' + t.id + '" title="' + t.label + '">' +
                '<span class="room-finish-chip" style="background:' + t.swatch + (t.faces ? ' url(' + t.faces[0] + ') center/cover' : '') + ';"></span><span>' + t.label + '</span></button>';
        }).join('');
    }
    const sz = document.getElementById('room-tile-sizes');
    if (sz) {
        sz.style.display = s.kind === 'tile' ? '' : 'none';
        sz.innerHTML = window.ROOM_TILE_SIZES.map(function(v) {
            const p = v.split('x');
            return '<button type="button" class="room-finish-size' + (v === s.size ? ' active' : '') + '" data-tile-size="' + v + '">' + p[0] + '×' + p[1] + '</button>';
        }).join('');
    }
    const wc = window._roomWallColor;
    const chip = document.getElementById('room-wall-color-chip');
    if (chip) chip.style.background = wc ? wc.hex : '#faf8f4';
    const name = document.getElementById('room-wall-color-name');
    if (name) name.textContent = wc ? ((wc.id ? wc.id + ' · ' : '') + (wc.name || wc.hex)) : 'לבן (ברירת מחדל)';
    const reset = document.getElementById('room-wall-color-reset');
    if (reset) reset.style.display = wc ? '' : 'none';
};

document.addEventListener('click', function(e) {
    const kind = e.target.closest('[data-floor-kind]');
    if (kind) { window._setRoomFloorStyle({ kind: kind.getAttribute('data-floor-kind') }); return; }
    const opt = e.target.closest('[data-floor-opt]');
    if (opt) {
        const id = opt.getAttribute('data-floor-opt');
        window._setRoomFloorStyle(window._roomFloorStyle.kind === 'tile' ? { finish: id } : { tone: id });
        return;
    }
    const size = e.target.closest('[data-tile-size]');
    if (size) window._setRoomFloorStyle({ size: size.getAttribute('data-tile-size') });
});

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function() { window._syncRoomFinishesUI(); });
else window._syncRoomFinishesUI();
