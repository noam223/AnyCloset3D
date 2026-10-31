// Case-study promo: editorial paper look + the real project model rendered live with three.js.
// Deterministic: everything is driven by one paused GSAP timeline + renderFrame(t).
let markReady;
window.__ready = new Promise(r => { markReady = r; });
const QS = new URLSearchParams(location.search);
const FORMAT = QS.get('f') || '16x9';
const SIZES = { '16x9': [1920, 1080], '9x16': [1080, 1920] };
const [W, H] = SIZES[FORMAT] || SIZES['16x9'];
const P = H > W;
const FPS = 30, DURATION = 30;
const T = { s2: 4, s3: 8, wipe: 10, s4: 13.333, exp: 18, s5: 18.667, slide: 19.6, s6: 24, s7: 27.333 };
const DEG = Math.PI / 180;
const clamp01 = x => Math.max(0, Math.min(1, x));
const seg = (t, a, b) => clamp01((t - a) / (b - a));
const eio = x => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const lerp = (a, b, k) => a + (b - a) * k;
const lerp3 = (a, b, k) => a.map((v, i) => lerp(v, b[i], k));

const stage = document.getElementById('stage');
stage.style.width = W + 'px'; stage.style.height = H + 'px';
document.body.classList.add(P ? 'portrait' : 'landscape');
const el = (tag, cls, parent = stage, html = '') => {
  const e = document.createElement(tag); if (cls) e.className = cls; if (html) e.innerHTML = html; parent.appendChild(e); return e;
};
const UNITLESS = new Set(['opacity', 'lineHeight', 'fontWeight', 'zIndex']);
const css = (e, o) => { for (const k in o) e.style[k] = typeof o[k] === 'number' && !UNITLESS.has(k) ? o[k] + 'px' : o[k]; return e; };
const SVGNS = 'http://www.w3.org/2000/svg';
const svgEl = (tag, attrs, parent) => { const e = document.createElementNS(SVGNS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); parent.appendChild(e); return e; };
const masked = (text) => text.split(' ').map(w => `<span class="mw" style="display:inline-block;overflow:hidden;vertical-align:top;padding-bottom:.1em"><span style="display:inline-block">${w}</span></span>`).join(' ');

const M = P ? 60 : 80;
const L = P ? {
  fw0: 0.78, s2shift: [0, 0.05], fw1: 1.9, fov1: 44, s3shift: -0.021, bars: [250, 330],
  box: { x: 60, y: 600, w: 960, h: 725 }, spread: { x: 0, y: 0, w: 1080, h: 980 },
} : {
  fw0: 0.46, s2shift: [-0.08, 0.08], fw1: 0.55, fov1: 44, s3shift: -0.025, bars: [96, 150],
  box: { x: 80, y: 120, w: 1112, h: 840 }, spread: { x: 0, y: 0, w: 960, h: 1080 },
};
const IMG = { w: 1186, h: 896, closet: { l: 0.19, r: 0.84, t: 0.119, b: 0.93 } };
const SL = { fov: 40, target: [0, 120, 0], pos: [55, 130, 417] };

/* ───────────── three.js ───────────── */
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(W, H, false);
renderer.outputEncoding = THREE.LinearEncoding;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.setScissorTest(true);
const scene = new THREE.Scene();
const BG = new THREE.Color(0xeceff1), PAPER3D = new THREE.Color(0xF2EDE4);
scene.add(new THREE.AmbientLight(0xffffff, 0.4));
const sun = new THREE.DirectionalLight(0xffffff, 0.35); sun.position.set(120, 510, 600); sun.castShadow = true;
Object.assign(sun.shadow.camera, { left: -400, right: 400, top: 400, bottom: -400, near: 10, far: 2000 });
sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0008;
scene.add(sun);
scene.add(new THREE.HemisphereLight(0xffffff, 0xb0b6ba, 0.35));
const fill = new THREE.DirectionalLight(0xffffff, 0.1); fill.position.set(-300, 200, 200); scene.add(fill);
const cam = new THREE.PerspectiveCamera(40, W / H, 10, 6000);

const paperMat = new THREE.MeshBasicMaterial({ color: 0xF7F3EC, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
const lineMat = new THREE.LineBasicMaterial({ color: 0x24201c });
const closetParts = [];
let roomRoot;

function prepare(root, isCloset) {
  const hide = [];
  root.traverse(o => {
    if (!o.isMesh) return;
    const m = o.material;
    const helper = (m.isMeshBasicMaterial && !m.map) || (m.transparent && m.opacity < 0.2)
      || (m.isMeshStandardMaterial && m.metalness === 1 && m.roughness === 1 && !m.map);
    if (helper) { hide.push(o); return; }
    if (m.map) { m.map.encoding = THREE.LinearEncoding; m.map.anisotropy = 8; }
    if (m.emissiveMap) m.emissiveMap.encoding = THREE.LinearEncoding;
    m.needsUpdate = true;
    o.castShadow = isCloset; o.receiveShadow = true;
    if (isCloset) {
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(o.geometry, 25), lineMat);
      edges.visible = false; o.add(edges);
      closetParts.push({ o, mat: m, edges });
    }
  });
  hide.forEach(o => { o.visible = false; });
}
function setPass(ink) {
  for (const p of closetParts) { p.o.material = ink ? paperMat : p.mat; p.edges.visible = ink; }
  roomRoot.visible = !ink;
  scene.background = ink ? PAPER3D : BG;
}
function applyView(v, w, h) {
  cam.fov = v.fov; cam.aspect = w / h;
  cam.position.set(...v.pos); cam.up.set(0, 1, 0); cam.lookAt(...v.target);
  if (v.shift) cam.setViewOffset(w, h, -v.shift[0] * w, -v.shift[1] * h, w, h); else cam.clearViewOffset();
  cam.updateProjectionMatrix();
}
const V3 = new THREE.Vector3();
const proj = (x, y, z, w, h) => { V3.set(x, y, z).project(cam); return [(V3.x + 1) / 2 * w, (1 - V3.y) / 2 * h]; };

const lastKey = new WeakMap();
function renderTo(canvas, v, ink, w, h) {
  w = Math.round(w); h = Math.round(h);
  const key = JSON.stringify([v, ink, w, h]);
  if (lastKey.get(canvas) === key) return;
  lastKey.set(canvas, key);
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  renderer.setViewport(0, 0, w, h); renderer.setScissor(0, 0, w, h);
  applyView(v, w, h); setPass(ink);
  renderer.render(scene, cam);
  const ctx = canvas.getContext('2d');
  ctx.globalCompositeOperation = 'copy';
  ctx.drawImage(renderer.domElement, 0, H - h, w, h, 0, 0, w, h);
  if (ink) { // thicken 1px GL lines without darkening the paper
    ctx.globalCompositeOperation = 'darken';
    ctx.drawImage(renderer.domElement, 0, H - h, w, h, 1, 0, w, h);
    ctx.drawImage(renderer.domElement, 0, H - h, w, h, 0, 1, w, h);
  }
  ctx.globalCompositeOperation = 'source-over';
}

function mainView(t) {
  const k = eio(seg(t, T.s3, T.wipe + 0.3));
  const k2 = seg(t, T.wipe - 0.5, T.s4 + 0.9);
  const fov = lerp(10, L.fov1, k);
  const fw = lerp(L.fw0, L.fw1, k);
  const yaw = -24 * k + 44 * k2;
  const eyeY = lerp(120, 148, k), ty = lerp(120, 122, k);
  const d = (165 / fw) / (Math.tan(fov * DEG / 2) * (W / H)) + 29;
  return {
    fov, target: [0, ty, 0], pos: [d * Math.sin(yaw * DEG), eyeY, d * Math.cos(yaw * DEG)],
    shift: [L.s2shift[0] * (1 - k), lerp(L.s2shift[1], L.s3shift, k)],
  };
}
const panelK = t => eio(seg(t, T.s4, T.exp));
const PV = {
  A: t => ({ fov: 35, target: [0, 50, 29], pos: lerp3([-75, 100, 215], [-48, 86, 150], panelK(t)) }),
  B: t => {
    const v = { fov: 35, target: [0, 137, 5], pos: lerp3([40, 142, 300], [30, 139, 250], panelK(t)) };
    const e = eio(seg(t, T.exp, T.s5));
    return e > 0 ? { fov: lerp(v.fov, SL.fov, e), target: lerp3(v.target, SL.target, e), pos: lerp3(v.pos, SL.pos, e) } : v;
  },
  C: t => ({ fov: 35, target: [-117, 124, 30], pos: lerp3([-55, 140, 120], [-72, 131, 82], panelK(t)) }),
};

/* ───────────── DOM ───────────── */
const cMain = el('canvas', 'win'); css(cMain, { left: 0, top: 0, width: W, height: H });
const cInk = el('canvas', 'win'); css(cInk, { left: 0, top: 0, width: W, height: H });
const wipeRule = el('div', 'abs'); css(wipeRule, { top: 0, height: H, width: 2, background: 'var(--ink)', opacity: 0 });

// blueprint overlay (svg) — geometry filled in after the model loads
const bp = document.createElementNS(SVGNS, 'svg'); bp.id = 'bp';
bp.setAttribute('width', W); bp.setAttribute('height', H); bp.setAttribute('viewBox', `0 0 ${W} ${H}`); stage.appendChild(bp);

// S1 — kinetic type on the horizon line
const s1 = el('div', 'scene'); s1.id = 's1';
const s1k = el('div', 'kicker abs', s1, '<b>מקרה בוחן</b> · פרויקט אמיתי');
css(s1k, { right: M, top: P ? 150 : 90 });
const s1b = el('div', 'block', s1);
const s1l1 = el('div', 'l1', s1b, masked('קיר אחד ריק.'));
const s1l2 = el('div', 'l2', s1b, masked('330 ס״מ של אפשרויות.'));
const s1l3 = el('div', 'l3', s1b, masked('ולקוח שרוצה לראות — לפני שהוא מזמין.'));
css(s1l1, { fontSize: P ? 92 : 118 }); css(s1l2, { fontSize: P ? 92 : 118 }); css(s1l3, { fontSize: P ? 42 : 50 });

// S2 texts
const s2 = el('div', 'scene'); s2.id = 's2';
const s2k = el('div', 'kicker abs', s2, '<b>01</b> — מדידה'); css(s2k, { right: M, top: P ? 150 : 110 });
const s2t = el('div', 'serif abs', s2, masked('הכל מתחיל') + '<br>' + masked('בשרטוט.'));
css(s2t, { right: M, top: P ? 195 : 150, fontSize: P ? 84 : 72, fontWeight: 700, lineHeight: 1.05, textAlign: 'right' });
const tblock = el('div', 'tblock', s2, `
  <div><span>AnyCloset 3D</span><span>מקרה בוחן</span></div>
  <div><span>קיר שינה — ארון + נישת TV</span><span>ק״מ 1:25</span></div>
  <div><span>330 × 240 × 54 ס״מ</span><span>גיליון 01</span></div>`);
css(tblock, P ? { left: M, right: M, top: 1590 } : { right: M, width: 430, top: 830 });

// S3 letterbox bars
const s3 = el('div', 'scene'); s3.id = 's3';
const barT = el('div', 'bar', s3); css(barT, { top: 0, height: L.bars[0] });
const barB = el('div', 'bar', s3); css(barB, { bottom: 0, height: L.bars[1] });
const barTi = el('div', 'in', barT); css(barTi, { padding: `0 ${M}px`, alignItems: P ? 'flex-end' : 'center', paddingBottom: P ? 28 : 0 });
el('div', 'kicker', barTi, '<b>02</b> — תלת־ממד');
el('div', 'word', barTi, 'AnyCloset<b>3D</b>').style.fontSize = '24px';
const barBi = el('div', 'in', barB); css(barBi, { padding: `0 ${M}px` });
if (P) { barBi.style.flexDirection = 'column'; barBi.style.alignItems = 'flex-end'; barBi.style.justifyContent = 'center'; barBi.style.gap = '18px'; }
const s3t = el('div', 'serif', barBi, masked('ואז הוא קם לחיים.'));
css(s3t, { fontSize: P ? 76 : 58, fontWeight: 700 });
const s3s = el('div', '', barBi, 'כל דלת, מגירה וידית — בדיוק כפי שתוכננו.');
css(s3s, { fontSize: P ? 30 : 25, color: 'var(--muted)' });

// S4 — paper sheet with three detail windows
const s4 = el('div', 'scene'); s4.id = 's4'; css(s4, { background: 'var(--paper)', boxShadow: '0 -30px 60px rgba(0,0,0,.18)' });
const s4k = el('div', 'kicker abs', s4, '<b>03</b> — פרטים'); css(s4k, { right: M, top: P ? 130 : 62 });
const s4t = el('div', 'serif abs', s4, masked('הפרטים הקטנים, בגדול.'));
css(s4t, { right: M, top: P ? 170 : 92, fontSize: P ? 70 : 60, fontWeight: 700 });
const PR = (() => {
  if (P) { const top = 320, gap = 28, ph = (H - top - 170 - 2 * gap) / 3; return [0, 1, 2].map(i => ({ x: M, y: top + i * (ph + gap), w: W - 2 * M, h: ph })); }
  const top = 196, gap = 32, ph = 790, pw = (W - 2 * M - 2 * gap) / 3;
  return [0, 1, 2].map(i => ({ x: W - M - pw - i * (pw + gap), y: top, w: pw, h: ph }));
})();
const PANELS = [['A', 'i.', 'שמונה מגירות'], ['B', 'ii.', 'נישה ל־55״'], ['C', 'iii.', 'ידיות שחורות']].map(([id, num, txt], i) => {
  const wrap = el('div', 'abs', s4); css(wrap, { left: PR[i].x, top: PR[i].y, width: PR[i].w, height: PR[i].h, overflow: 'hidden' });
  const c = el('canvas', 'win', wrap); css(c, { left: 0, top: 0, width: '100%', height: '100%' });
  const frame = el('div', 'panel-frame', wrap); css(frame, { inset: 0 });
  const chip = el('div', 'plabel', wrap, `<span class="num">${num}</span><span class="txt">${txt}</span>`);
  css(chip, { right: 0, bottom: 0, background: 'var(--paper)', padding: P ? '12px 22px' : '14px 22px', fontSize: P ? 34 : 34 });
  return { id, wrap, c, chip };
});

// S5 — slider: 3D (panel B window) vs realistic render
const s5 = el('div', 'scene'); s5.id = 's5';
const imgbox = el('div', '', s5); imgbox.id = 'imgbox';
const img = el('img', '', imgbox); img.src = 'assets/shots/ai-real.jpg';
const handle = el('div', '', s5, '<div class="ln"></div><div class="knob">‹ ›</div>'); handle.id = 'handle';
const tag3d = el('div', 'tag', s5, 'תלת־ממד');
const tagAi = el('div', 'tag', s5, 'הדמיה ריאליסטית · AI');
css(tag3d, { left: L.box.x + 24, top: L.box.y + L.box.h - 66 });
css(tagAi, { right: W - (L.box.x + L.box.w) + 24, top: L.box.y + L.box.h - 66 });
const s5txt = el('div', 'abs', s5);
const s5k = el('div', 'kicker', s5txt, '<b>04</b> — הדמיה');
const s5t = el('div', 'serif', s5txt, P ? masked('ככה זה ייראה.') : masked('ככה זה') + '<br>' + masked('ייראה.'));
const s5a = el('div', 'serif', s5txt, masked('באמת.'));
const s5s = el('div', '', s5txt, 'הדמיה ריאליסטית ב־AI — מתוך אותו תכנון תלת־ממדי, בלחיצה.');
css(s5t, { fontSize: P ? 88 : 110, fontWeight: 700, lineHeight: 1.02, marginTop: 22 });
css(s5a, { fontSize: P ? 88 : 110, fontWeight: 300, color: 'var(--oak)', lineHeight: 1.1 });
css(s5s, { fontSize: P ? 30 : 26, color: 'var(--muted)', marginTop: P ? 0 : 40, lineHeight: 1.45 });
if (P) { css(s5txt, { right: M, left: M, top: 140, textAlign: 'right' }); css(s5s, { position: 'absolute', top: L.box.y + L.box.h + 50 - 140, right: 0, left: 0 }); }
else css(s5txt, { right: M, width: 560, top: 250, textAlign: 'right' });

// S6 — magazine spread
const s6 = el('div', 'scene'); s6.id = 's6';
const s6txt = el('div', 'abs', s6);
css(s6txt, P ? { left: M, right: M, top: L.spread.h + 60 } : { left: L.spread.w + 90, right: M, top: 120 });
const s6k = el('div', 'kicker', s6txt, '<b>מקרה בוחן</b> · פרויקט אמיתי');
const s6t = el('div', 'serif', s6txt, masked('מהקיר הריק —') + '<br>' + masked('לעסקה סגורה.'));
css(s6t, { fontSize: P ? 76 : 82, fontWeight: 700, lineHeight: 1.05, marginTop: 20 });
const s6r = el('div', 'rule', s6txt); css(s6r, { marginTop: P ? 34 : 40 });
const facts = el('div', 'facts', s6txt);
const FACTS = [['מידות', '330 × 240 × 54 ס״מ'], ['תכולה', '2 ארונות · 8 מגירות · נישת TV'], ['סטטוס', 'נסגרה עסקה ✓']];
const factRows = FACTS.map(([k, v]) => {
  const r = el('div', 'row', facts, `<span class="k">${k}</span><span class="v">${v}</span>`);
  css(r, { padding: P ? '20px 0' : '22px 0', fontSize: P ? 24 : 24 });
  r.querySelector('.v').style.fontSize = (P ? 36 : 36) + 'px';
  return r;
});
const tl4 = el('div', 'tl', s6);
const TLW = P ? W - 2 * M - 80 : W - L.spread.w - 90 - M - 80;
const tlX = P ? M + 40 : L.spread.w + 90 + 40, tlY = P ? 1745 : 880;
css(tl4, { left: tlX, top: tlY, width: TLW, height: 1 });
const track = el('div', 'track', tl4); css(track, { left: 0, width: TLW, top: 0 });
const tfill = el('div', 'fill', tl4); css(tfill, { left: 0, width: TLW, top: 0 });
const STEPS = ['מדידה', 'תכנון', 'הדמיה', 'הזמנה'];
const dots = STEPS.map((s, i) => {
  const x = TLW - i * TLW / 3;
  const d = el('div', 'dot', tl4, '<i></i>'); css(d, { left: x, top: 0 });
  const lab = el('div', 'lab', tl4, s); css(lab, { left: x, top: 26, fontSize: P ? 30 : 28 });
  return { d, i: d.querySelector('i'), lab };
});

// S7 — outro page
const s7 = el('div', 'scene'); s7.id = 's7';
const page = el('div', '', s7); page.id = 'page';
const pageShadow = el('div', '', page); pageShadow.id = 'pageShadow'; css(pageShadow, { left: '100%', background: 'linear-gradient(to right, rgba(0,0,0,.2), transparent)' });
const out = el('div', 'abs', page); css(out, { left: 0, right: 0, top: 0, bottom: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' });
const oIcon = el('img', '', out); oIcon.src = 'assets/brand/icon.png'; css(oIcon, { width: P ? 230 : 190, height: P ? 230 : 190 });
const oWord = el('div', 'word', out, 'AnyCloset<b>3D</b>'); css(oWord, { fontSize: P ? 76 : 64, marginTop: 18 });
const oRule = el('div', 'rule', out); css(oRule, { width: P ? 140 : 120, marginTop: P ? 48 : 38, transformOrigin: 'center' });
const oSlogan = el('div', 'serif', out, masked('מסקיצה להזמנה.') + '<br>' + masked('במקום אחד.'));
css(oSlogan, { fontSize: P ? 90 : 76, fontWeight: 700, lineHeight: 1.08, marginTop: P ? 48 : 38 });
const oUrl = el('div', '', out, 'anycloset3d.com'); css(oUrl, { fontSize: P ? 36 : 30, letterSpacing: '.14em', marginTop: P ? 56 : 42, direction: 'ltr', color: 'var(--oak)', fontWeight: 700 });

// film grain + vignette
const grain = el('canvas', ''); grain.id = 'grain'; grain.width = W / 2; grain.height = H / 2;
el('div', '').id = 'vig';
const gctx = grain.getContext('2d');
let seed = 7;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const GR = Array.from({ length: 8 }, () => {
  const d = gctx.createImageData(W / 2, H / 2);
  for (let i = 0; i < d.data.length; i += 4) { const v = 150 + rnd() * 105; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255; }
  return d;
});

/* ───────────── load ───────────── */
const loader = new THREE.GLTFLoader();
const load = url => new Promise((res, rej) => loader.load(url, g => res(g.scene), undefined, rej));
const [roomScene, closetScene] = await Promise.all([load('assets/model/room.glb'), load('assets/model/closet.glb')]);
roomRoot = roomScene; prepare(roomScene, false); prepare(closetScene, true);
scene.add(roomScene, closetScene);
await document.fonts.ready;
await new Promise(r => (img.complete ? r() : img.addEventListener('load', r, { once: true })));

/* ───────────── blueprint geometry (static front elevation) ───────────── */
applyView(mainView(T.s2), W, H);
const [xL, yB] = proj(-165, 0, 29, W, H);
const [xR, yT] = proj(165, 240, 29, W, H);
const draw = (d, cls = '') => svgEl('path', { d, pathLength: 1, 'stroke-dasharray': 1, 'stroke-dashoffset': 1, class: cls }, bp);
const ground = svgEl('line', { x1: W - M, y1: yB, x2: W - M, y2: yB }, bp);
const g0 = xL - 130, g1 = xR + 130;
let hatch = '';
for (let x = g0 + 12; x < g1; x += 22) hatch += `M${x} ${yB + 2} l-14 16 `;
const pHatch = draw(hatch, 'thin');
const dy = yB + 64, dx = xL - 64, tk = 11;
const pExtW = draw(`M${xL} ${yB + 14} V${dy + 18} M${xR} ${yB + 14} V${dy + 18}`, 'thin');
const pDimW = draw(`M${xR + 18} ${dy} H${xL - 18} M${xR - tk} ${dy + tk} l${2 * tk} ${-2 * tk} M${xL - tk} ${dy + tk} l${2 * tk} ${-2 * tk}`);
const pExtH = draw(`M${xL - 14} ${yT} H${dx - 18}`, 'thin');
const pDimH = draw(`M${dx} ${yB + 18} V${yT - 18} M${dx - tk} ${yB + tk} l${2 * tk} ${-2 * tk} M${dx - tk} ${yT + tk} l${2 * tk} ${-2 * tk}`);
const pLead = draw(`M${xR - 30} ${yT - 8} V${yT - 52}`, 'thin');
const fs = P ? 40 : 40;
const tW = svgEl('text', { x: (xL + xR) / 2, y: dy + 14, 'text-anchor': 'middle', 'font-size': fs }, bp); tW.textContent = '330';
const tH = svgEl('text', { x: dx + 14, y: (yT + yB) / 2, 'text-anchor': 'middle', 'font-size': fs, transform: `rotate(-90 ${dx + 14} ${(yT + yB) / 2})` }, bp); tH.textContent = '240';
const tD = svgEl('text', { x: xR - 30, y: yT - 64, 'text-anchor': 'start', 'font-size': 30, direction: 'rtl' }, bp); tD.textContent = 'עומק 54';
const BP_PATHS = [pHatch, pExtW, pDimW, pExtH, pDimH, pLead];
const BP_TEXT = [tW, tH, tD];

// S1 text sits on the same horizon the blueprint stands on
const s1w = P ? W - 2 * M : 1060;
css(s1b, { right: M, bottom: H - yB + (P ? 44 : 40), width: s1w });

/* ───────────── slider alignment (3D camera ↔ AI render) ───────────── */
const BX = L.box;
applyView(SL, BX.w, BX.h);
const [sxL, syB] = proj(-165, 0, 29, BX.w, BX.h);
const [sxR, syT] = proj(165, 240, 29, BX.w, BX.h);
const C = IMG.closet;
let s = (syB - syT) / ((C.b - C.t) * BX.h);
const alignPl = (() => {
  const cx = (sxL + sxR) / 2, cy = (syT + syB) / 2;
  let w = s * BX.w, h = s * BX.h;
  let x = cx - ((C.l + C.r) / 2) * w, y = cy - ((C.t + C.b) / 2) * h;
  x = Math.min(0, Math.max(BX.w - w, x)); y = Math.min(0, Math.max(BX.h - h, y));
  return { x, y, w, h };
})();
const coverPl = r => { const k = Math.max(r.w / IMG.w, r.h / IMG.h); return { x: (r.w - IMG.w * k) / 2, y: (r.h - IMG.h * k) / 2, w: IMG.w * k, h: IMG.h * k }; };
const spreadPl = coverPl(L.spread);
console.log(`slider align scale ${s.toFixed(3)} offset ${alignPl.x.toFixed(0)},${alignPl.y.toFixed(0)}`);

/* ───────────── timeline ───────────── */
const S = { draw: 0, wipe: 0, slide: 1, flip: 0 };
const tl = gsap.timeline({ paused: true, defaults: { ease: 'power3.out' } });
const words = e => e.querySelectorAll('.mw > span');
const SFX = [];
const sfx = (t, type, g = 1) => SFX.push([+t.toFixed(3), type, g]);

// initial states
gsap.set([s2, s3, s4, s5, s6, s7, cMain], { autoAlpha: 0 });
gsap.set(BP_TEXT, { opacity: 0 });
gsap.set([...words(stage)], { yPercent: 110 });
gsap.set([s1k, s2k, tblock, s3s, s4k, s5k, s5s, s6k, oUrl, oWord, oIcon], { opacity: 0 });
gsap.set(barT, { yPercent: -100 }); gsap.set(barB, { yPercent: 100 });
gsap.set(s4, { yPercent: 100 });
PANELS.forEach(p => gsap.set(p.wrap, { y: 140, opacity: 0 }));
PANELS.forEach(p => gsap.set(p.chip, { xPercent: -8, opacity: 0 }));
gsap.set([tag3d, tagAi, handle], { opacity: 0 });
gsap.set(s6r, { scaleX: 0 }); gsap.set(factRows, { opacity: 0, y: 24 });
gsap.set(tfill, { scaleX: 0 }); dots.forEach(d => { gsap.set(d.i, { scale: 0 }); gsap.set(d.lab, { opacity: 0 }); });
gsap.set(page, { xPercent: -100 }); gsap.set(oRule, { scaleX: 0 });

// S1 0–4
tl.to(s1k, { opacity: 1, duration: 0.8 }, 0.1);
[[s1l1, 0.3], [s1l2, 1.2], [s1l3, 2.15]].forEach(([e, t], i) => {
  tl.to(words(e), { yPercent: 0, duration: 0.9, stagger: 0.07 }, t);
  sfx(t, 'tap', i === 2 ? 0.6 : 0.9);
});
tl.to(ground, { attr: { x2: W - M - s1w }, duration: 1.6, ease: 'power2.inOut' }, 0.2);
sfx(0.25, 'pencil', 0.35);
tl.to(words(s1b), { yPercent: -110, duration: 0.55, stagger: 0.02, ease: 'power2.in' }, 3.45);
tl.to(s1k, { opacity: 0, duration: 0.4 }, 3.45);
tl.set(s1, { autoAlpha: 0 }, 4.05);
sfx(3.55, 'swish', 0.5);

// S2 4–8 — the drawing
tl.to(ground, { attr: { x1: g1, x2: g0 }, duration: 0.9, ease: 'power3.inOut' }, 3.7);
tl.set(s2, { autoAlpha: 1 }, T.s2);
tl.to(S, { draw: 1, duration: 2.2, ease: 'power1.inOut' }, T.s2 + 0.15);
sfx(T.s2 + 0.15, 'pencil', 0.9);
tl.to(pHatch, { strokeDashoffset: 0, duration: 1.2, ease: 'power1.inOut' }, T.s2 + 0.3);
tl.to(s2k, { opacity: 1, duration: 0.6 }, T.s2 + 0.3);
tl.to(words(s2t), { yPercent: 0, duration: 0.9, stagger: 0.08 }, T.s2 + 0.45);
[[pExtW, pDimW, tW], [pExtH, pDimH, tH], [pLead, null, tD]].forEach(([a, b, txt], i) => {
  const t0 = T.s2 + 2.0 + i * 0.45;
  tl.to(a, { strokeDashoffset: 0, duration: 0.5, ease: 'power2.out' }, t0);
  if (b) tl.to(b, { strokeDashoffset: 0, duration: 0.7, ease: 'power2.inOut' }, t0 + 0.15);
  tl.to(txt, { opacity: 1, duration: 0.4 }, t0 + 0.55);
  sfx(t0 + 0.55, 'tick', 0.7);
});
tl.to(tblock, { opacity: 1, duration: 0.7 }, T.s2 + 2.3);
tl.to([s2k, tblock, ...BP_TEXT], { opacity: 0, duration: 0.45, ease: 'power1.in' }, T.s3 - 0.4);
tl.to(words(s2t), { yPercent: -110, duration: 0.5, stagger: 0.03, ease: 'power2.in' }, T.s3 - 0.45);
tl.to([...BP_PATHS, ground], { opacity: 0, duration: 0.5, ease: 'power1.in' }, T.s3 - 0.35);
tl.set(s2, { autoAlpha: 0 }, T.s3 + 0.1);

// S3 8–13.3 — dolly into perspective, ink becomes material, orbit
sfx(T.s3 + 0.05, 'swell', 0.8);
tl.set(cMain, { autoAlpha: 1 }, T.wipe - 0.05);
tl.to(S, { wipe: 1, duration: 1.5, ease: 'power2.inOut' }, T.wipe);
sfx(T.wipe, 'brush', 0.9);
tl.set(s3, { autoAlpha: 1 }, T.wipe + 0.2);
tl.to(barT, { yPercent: 0, duration: 0.9, ease: 'power3.inOut' }, T.wipe + 0.5);
tl.to(barB, { yPercent: 0, duration: 0.9, ease: 'power3.inOut' }, T.wipe + 0.5);
tl.to(words(s3t), { yPercent: 0, duration: 0.9, stagger: 0.07 }, T.wipe + 1.2);
tl.to(s3s, { opacity: 1, duration: 0.8 }, T.wipe + 1.6);
sfx(T.wipe + 1.2, 'tap', 0.7);

// S4 13.3–18.7 — details
tl.set(s4, { autoAlpha: 1 }, T.s4 - 0.01);
tl.to(s4, { yPercent: 0, duration: 0.8, ease: 'power3.inOut' }, T.s4);
sfx(T.s4, 'paper', 0.9);
tl.set([s3, cMain, cInk], { autoAlpha: 0 }, T.s4 + 0.85);
tl.to(s4k, { opacity: 1, duration: 0.6 }, T.s4 + 0.6);
tl.to(words(s4t), { yPercent: 0, duration: 0.9, stagger: 0.07 }, T.s4 + 0.7);
PANELS.forEach((p, i) => {
  const t0 = T.s4 + 0.45 + i * 0.16;
  tl.to(p.wrap, { y: 0, opacity: 1, duration: 1.0, ease: 'power3.out' }, t0);
  tl.to(p.chip, { xPercent: 0, opacity: 1, duration: 0.6 }, T.s4 + 1.4 + i * 0.45);
  sfx(T.s4 + 1.4 + i * 0.45, 'tick', 0.6);
});
sfx(T.s4 + 0.5, 'paper', 0.45);
// expand middle window into the slider frame
const [pA, pB, pC] = PANELS;
tl.to([s4k, ...PANELS.map(p => p.chip)], { opacity: 0, duration: 0.35, ease: 'power1.in' }, T.exp - 0.1);
tl.to(words(s4t), { yPercent: -110, duration: 0.45, stagger: 0.02, ease: 'power2.in' }, T.exp - 0.1);
tl.to(pA.wrap, { x: P ? 0 : W, y: P ? -H * 0.6 : 0, opacity: 0, duration: 0.6, ease: 'power3.in' }, T.exp);
tl.to(pC.wrap, { x: P ? 0 : -W, y: P ? H * 0.6 : 0, opacity: 0, duration: 0.6, ease: 'power3.in' }, T.exp);
tl.to(pB.wrap, { left: BX.x, top: BX.y, width: BX.w, height: BX.h, duration: 0.67, ease: 'power3.inOut' }, T.exp);
sfx(T.exp, 'swish', 0.7);

// S5 18.7–24 — 3D ↔ realistic slider
tl.set(s5, { autoAlpha: 1 }, T.s5);
tl.to(s5k, { opacity: 1, duration: 0.6 }, T.s5 + 0.1);
tl.to(words(s5t), { yPercent: 0, duration: 0.9, stagger: 0.08 }, T.s5 + 0.2);
tl.to([handle, tag3d, tagAi], { opacity: 1, duration: 0.5 }, T.slide - 0.3);
sfx(T.slide - 0.3, 'tap', 0.6);
tl.to(S, { slide: 0.5, duration: 1.1, ease: 'power2.inOut' }, T.slide);
sfx(T.slide, 'slide', 0.8);
tl.to(words(s5a), { yPercent: 0, duration: 0.9 }, T.slide + 1.3);
tl.to(S, { slide: 0, duration: 0.9, ease: 'power2.inOut' }, T.slide + 1.9);
sfx(T.slide + 1.9, 'slide', 0.7);
tl.to([tag3d, tagAi, handle], { opacity: 0, duration: 0.35 }, T.slide + 2.6);
sfx(T.slide + 2.75, 'chime', 0.9);
tl.to(s5s, { opacity: 1, duration: 0.8 }, T.slide + 2.6);
tl.to([s5k, s5s], { opacity: 0, duration: 0.4, ease: 'power1.in' }, T.s6 - 0.4);
tl.to([...words(s5t), ...words(s5a)], { yPercent: -110, duration: 0.45, stagger: 0.02, ease: 'power2.in' }, T.s6 - 0.45);

// S6 24–27.3 — case-study spread
tl.set(pB.wrap, { autoAlpha: 0 }, T.s6);
tl.to(S, { flip: 1, duration: 0.9, ease: 'power3.inOut' }, T.s6);
sfx(T.s6, 'swish', 0.6);
tl.set(s6, { autoAlpha: 1 }, T.s6 + 0.2);
tl.to(s6k, { opacity: 1, duration: 0.5 }, T.s6 + 0.4);
tl.to(words(s6t), { yPercent: 0, duration: 0.9, stagger: 0.07 }, T.s6 + 0.45);
tl.to(s6r, { scaleX: 1, duration: 0.8, ease: 'power2.inOut' }, T.s6 + 0.8);
factRows.forEach((r, i) => { tl.to(r, { opacity: 1, y: 0, duration: 0.6 }, T.s6 + 1.0 + i * 0.18); sfx(T.s6 + 1.0 + i * 0.18, 'tick', 0.45); });
tl.to(tfill, { scaleX: 1, duration: 1.3, ease: 'power1.inOut' }, T.s6 + 1.5);
dots.forEach((d, i) => {
  const t0 = T.s6 + 1.5 + i * 0.43;
  tl.to(d.i, { scale: 1, duration: 0.35, ease: 'back.out(2)' }, t0);
  tl.to(d.lab, { opacity: 1, duration: 0.4 }, t0);
  sfx(t0, 'dot', 0.55 + i * 0.1);
});

// S7 27.3–30 — outro page
tl.set(s7, { autoAlpha: 1 }, T.s7 - 0.01);
tl.to(page, { xPercent: 0, duration: 0.75, ease: 'power3.inOut' }, T.s7);
sfx(T.s7, 'page', 1);
tl.to(oIcon, { opacity: 1, duration: 0.8 }, T.s7 + 0.55);
tl.fromTo(oIcon, { y: 20 }, { y: 0, duration: 1.0 }, T.s7 + 0.55);
tl.to(oWord, { opacity: 1, duration: 0.7 }, T.s7 + 0.75);
tl.to(oRule, { scaleX: 1, duration: 0.7, ease: 'power2.inOut' }, T.s7 + 0.9);
tl.to(words(oSlogan), { yPercent: 0, duration: 0.9, stagger: 0.07 }, T.s7 + 1.0);
tl.to(oUrl, { opacity: 1, duration: 0.7 }, T.s7 + 1.45);
sfx(T.s7 + 0.75, 'chime', 0.75);
tl.to({}, { duration: 0.01 }, DURATION);

/* ───────────── per-frame ───────────── */
function placeImg(f) {
  const r = { x: lerp(BX.x, L.spread.x, f), y: lerp(BX.y, L.spread.y, f), w: lerp(BX.w, L.spread.w, f), h: lerp(BX.h, L.spread.h, f) };
  css(imgbox, { left: r.x, top: r.y, width: r.w, height: r.h });
  const a = alignPl, b = spreadPl;
  css(img, { left: lerp(a.x, b.x, f), top: lerp(a.y, b.y, f), width: lerp(a.w, b.w, f), height: lerp(a.h, b.h, f) });
}
function renderFrame(t) {
  gctx.putImageData(GR[Math.floor(t * 12) % GR.length], 0, 0);

  if (t >= T.s2 - 0.05 && t < T.s4 + 0.9) {
    const v = mainView(t);
    if (S.wipe > 0) renderTo(cMain, v, false, W, H);
    if (S.wipe < 1) renderTo(cInk, v, true, W, H);
    cInk.style.visibility = S.wipe < 1 ? 'visible' : 'hidden';
    cInk.style.clipPath = `inset(0 ${S.wipe * 100}% 0 0)`;
    const a = S.draw * 106 - 6;
    cInk.style.webkitMaskImage = S.draw >= 1 ? 'none' : `linear-gradient(to left, #000 ${a}%, transparent ${a + 6}%)`;
    css(wipeRule, { left: W * (1 - S.wipe) - 1, opacity: S.wipe > 0 && S.wipe < 1 ? 1 : 0 });
  } else cInk.style.visibility = 'hidden';

  if (t >= T.s4 && t < T.s6 + 0.05) {
    for (const p of PANELS) {
      if (p.id !== 'B' && t >= T.s5) continue;
      const w = parseFloat(p.wrap.style.width), h = parseFloat(p.wrap.style.height);
      renderTo(p.c, PV[p.id](t), false, w, h);
    }
  }

  if (t >= T.s5) {
    placeImg(S.flip);
    imgbox.style.clipPath = `inset(0 0 0 ${S.slide * 100}%)`;
    css(handle, { left: BX.x + S.slide * BX.w, top: BX.y, height: BX.h });
    handle.querySelector('.knob').style.top = (BX.h / 2 - 34) + 'px';
  }
}

window.__cues = {
  duration: DURATION, video: { name: 'anycloset-case-study', fps: FPS },
  scenes: [['type', 0, T.s2], ['blueprint', T.s2, T.s3], ['orbit', T.s3, T.s4], ['details', T.s4, T.s5], ['slider', T.s5, T.s6], ['spread', T.s6, T.s7], ['outro', T.s7, DURATION]]
    .map(([type, t0, t1]) => ({ type, t0, t1 })),
  sfx: SFX.sort((a, b) => a[0] - b[0]),
  T,
};
window.__seek = t => { tl.seek(t, false); renderFrame(t); };
window.__seek(0);
markReady(true);
