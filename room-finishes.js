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
    { id: 'concrete',      label: 'בטון בהיר', swatch: '#bebbb5', roughness: 0.55, img: 'images/tiles/concrete.jpg' },
    { id: 'concrete_dark', label: 'בטון כהה',  swatch: '#7d7c79', roughness: 0.55, img: 'images/tiles/concrete-dark.jpg' },
    { id: 'calacatta',     label: 'קלקטה',     swatch: '#f1eee9', roughness: 0.22, img: 'images/tiles/calacatta.jpg' },
    { id: 'stone',         label: 'אבן בז\'',  swatch: '#d4c8b4', roughness: 0.5,  img: 'images/tiles/stone.jpg' }
];
window.ROOM_TILE_SIZES = ['60x120', '80x80', '100x100', '120x120'];
window.ROOM_FLOOR_DEFAULT = { kind: 'parquet', tone: 'oak', finish: 'concrete', size: '60x120' };

window._normRoomFloorStyle = function(s) {
    const d = window.ROOM_FLOOR_DEFAULT;
    const o = Object.assign({}, d, s || {});
    if (o.kind !== 'tile') o.kind = 'parquet';
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
        if (finish === 'calacatta') {
            ctx.fillStyle = '#f3f1ed';
            ctx.fillRect(x0, y0, w, h);
            _blotches(ctx, x0, y0, w, h, ppc, rnd, 30, '150,146,140', 0.03, 0.08, 10, 40);
            ctx.save();
            ctx.filter = 'blur(' + Math.max(2, 1.2 * ppc) + 'px)';
            const main = 2 + Math.floor(rnd() * 2);
            for (let v = 0; v < main; v++) _vein(ctx, x0, y0, w, h, ppc, rnd, 'rgba(150,146,140,0.3)', 2 + rnd() * 3);
            ctx.filter = 'blur(' + Math.max(1, 0.35 * ppc) + 'px)';
            for (let v = 0; v < main; v++) _vein(ctx, x0, y0, w, h, ppc, rnd, 'rgba(128,124,118,0.32)', 0.4 + rnd() * 0.6);
            for (let v = 0; v < 2; v++) _vein(ctx, x0, y0, w, h, ppc, rnd, 'rgba(184,156,110,0.26)', 0.3 + rnd() * 0.4);
            ctx.restore();
            for (let v = 0; v < 3; v++) _vein(ctx, x0, y0, w, h, ppc, rnd, 'rgba(140,136,130,0.14)', 0.08 + rnd() * 0.08);
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

    // Photographic slab surfaces; until one loads the procedural surface above stands in
    const _tileImgs = {};
    function _tileImage(finish) {
        const fin = window.ROOM_TILE_FINISHES.find(function(f) { return f.id === finish; });
        if (!fin || !fin.img) return null;
        let e = _tileImgs[finish];
        if (!e) {
            e = _tileImgs[finish] = { img: new Image(), ready: false };
            e.img.onload = function() { e.ready = true; _invalidateFinish(finish); };
            e.img.src = fin.img;
        }
        return e.ready ? e.img : null;
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

    /** One tile cut from a random part of the slab photo (sometimes turned 180°) so neighbours differ. */
    function _drawTileFromImage(ctx, img, x0, y0, w, h, rnd) {
        const ar = w / h;
        let cw = img.width, ch = cw / ar;
        if (ch > img.height) { ch = img.height; cw = ch * ar; }
        const k = 0.8 + rnd() * 0.2;
        cw *= k; ch *= k;
        const sx = rnd() * (img.width - cw), sy = rnd() * (img.height - ch);
        ctx.save();
        ctx.translate(x0 + w / 2, y0 + h / 2);
        if (rnd() < 0.5) ctx.rotate(Math.PI);
        ctx.drawImage(img, sx, sy, cw, ch, -w / 2, -h / 2, w, h);
        ctx.restore();
    }

    /** A 2×2 block of tiles with grout joints; returns { canvas, wCm, hCm }. */
    function _tileCanvas(finish, size) {
        const key = 'tile:' + finish + ':' + size;
        if (_canvasCache[key]) return _canvasCache[key];
        const td = _tileDims(size);
        const wCm = td.x * 2, hCm = td.z * 2;
        const ppc = Math.min(8, 2048 / Math.max(wCm, hCm));
        const cv = document.createElement('canvas');
        cv.width = Math.round(wCm * ppc);
        cv.height = Math.round(hCm * ppc);
        const ctx = cv.getContext('2d');
        const rnd = _rng(_hash(key));
        const tw = cv.width / 2, th = cv.height / 2;
        const img = _tileImage(finish);
        for (let j = 0; j < 2; j++) {
            for (let i = 0; i < 2; i++) {
                ctx.save();
                ctx.beginPath();
                ctx.rect(i * tw, j * th, tw, th);
                ctx.clip();
                if (img) _drawTileFromImage(ctx, img, i * tw, j * th, tw, th, rnd);
                else _drawTileSurface(ctx, finish, i * tw, j * th, tw, th, ppc, rnd);
                ctx.restore();
            }
        }
        // Grout: half a joint on each edge so the block tiles seamlessly
        const gw = Math.max(1.5, 0.3 * ppc);
        ctx.fillStyle = finish === 'concrete_dark' ? '#5f5e5b' : (finish === 'calacatta' ? '#d9d6d0' : '#a7a39b');
        [0, tw, cv.width].forEach(function(x) { ctx.fillRect(x - gw / 2, 0, gw, cv.height); });
        [0, th, cv.height].forEach(function(y) { ctx.fillRect(0, y - gw / 2, cv.width, gw); });
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
                '<span class="room-finish-chip" style="background:' + t.swatch + (t.img ? ' url(' + t.img + ') center/cover' : '') + ';"></span><span>' + t.label + '</span></button>';
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
