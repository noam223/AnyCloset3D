// Timelapse promo: real AnyCloset3D editor captures (a demo wardrobe built step by step)
// composited with a moving camera, cursor clicks, highlight rings and guiding text.
// Deterministic: renderFrame(t) derives every element from t; render.mjs seeks frame by frame.
let markReady;
window.__ready = new Promise(r => { markReady = r; });
const QS = new URLSearchParams(location.search);
const FORMAT = QS.get('f') || '16x9';
const SIZES = { '16x9': [1920, 1080], '9x16': [1080, 1920] };
const [W, H] = SIZES[FORMAT] || SIZES['16x9'];
const P = H > W;
const FPS = 30;

const clamp01 = x => Math.max(0, Math.min(1, x));
const seg = (t, a, b) => clamp01((t - a) / (b - a));
const eio = x => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const eo = x => 1 - Math.pow(1 - x, 3);
const eback = x => { const c = 1.9; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };
const lerp = (a, b, k) => a + (b - a) * k;

const stage = document.getElementById('stage');
stage.style.width = W + 'px'; stage.style.height = H + 'px';
const el = (tag, cls, parent = stage, html = '') => {
  const e = document.createElement(tag); if (cls) e.className = cls; if (html) e.innerHTML = html; parent.appendChild(e); return e;
};
const UNITLESS = new Set(['opacity', 'lineHeight', 'fontWeight', 'zIndex']);
const css = (e, o) => { for (const k in o) e.style[k] = typeof o[k] === 'number' && !UNITLESS.has(k) ? o[k] + 'px' : o[k]; return e; };
const words = text => text.split(' ').map(w => {
  const a = w.startsWith('*'); w = w.replace(/\*/g, '');
  return `<span class="mw"><span class="${a ? 'acc' : ''}">${w}</span></span>`;
}).join(' ');

/* ───────────── content ───────────── */
const IW = 974, IH = 1276;   // editor captures, cropped to canvas + right panel
const RW = 1336, RH = 1276;  // full-window 3D captures

const FEATS = ['מידות מדויקות', '4 עמודות', 'אחסון עליון', 'חלוקת מדפים', 'תלייה ארוכה', 'מגירות נעליים', 'תלייה כפולה',
  'מגירות פנימיות', 'סורבטו', 'מגירות חיצוניות', 'תאורת LED', 'דלתות + קלפות', 'מראה וזכוכית', 'גוון עץ', 'ידיות', 'מחיר בזמן אמת'];

// focus: [x, y, scale] in capture pixels; click/ring in capture pixels.
const STEPS = [
  { img: 's01', title: 'מגדירים *מידות*', sub: '300 × 250 × 60 ס״מ — מקלידים, והארון מתעדכן מיד.', click: [930, 350], focus: [766, 360, 1.0], ring: [577, 318, 380, 58], feats: [0] },
  { img: 's02', title: 'מוסיפים *עמודה*', sub: 'לחיצה על + והרוחב מתחלק שווה בין 4 עמודות.', click: [630, 353], focus: [560, 420, 1.0], ring: [578, 320, 70, 56], feats: [1] },
  { img: 's03', title: '*אחסון* עליון', sub: 'מדף בגובה 212 ס״מ בכל העמודות — מקום לשמיכות ומזוודות.', click: [300, 440], focus: [277, 560, 0.92], ring: [0, 412, 555, 58], feats: [2] },
  { img: 's04', title: 'חלוקה *פנימית*', sub: 'מדפים בגובה מדויק, מותאמים למה שייכנס לכל תא.', click: [277, 610], focus: [277, 640, 0.88], ring: [0, 410, 555, 452], feats: [3] },
  { img: 's05_sel', title: 'בוחרים *תא*', sub: 'לחיצה על תא פותחת את תפריט התכולה והדלתות.', click: [105, 621], focus: [200, 630, 0.98], ring: [0, 468, 140, 310], feats: [] },
  { img: 's06', title: 'תלייה ארוכה + *נעליים*', sub: 'מוט לשמלות ומעילים, ומגירת נעליים נשלפת למטה.', click: [179, 407], focus: [200, 650, 0.98], ring: [0, 468, 140, 398], feats: [4, 5] },
  { img: 's07_sel', title: 'תלייה *כפולה*', sub: 'שני מוטות בעמודה אחת — פי שניים מקום לחולצות.', click: [316, 535], focus: [290, 660, 0.98], ring: [138, 655, 140, 190], feats: [6] },
  { img: 's08_sel', title: 'מגירות *פנימיות*', sub: 'כמות המגירות מחושבת אוטומטית לפי גובה התא.', click: [456, 586], focus: [400, 700, 0.98], ring: [275, 700, 142, 145], feats: [7] },
  { img: 's09', title: '*סורבטו* + מגירות חוץ', sub: 'מתלה בגדים נשלף לגובה, ושתי מגירות עם חזית.', click: [473, 613], focus: [420, 650, 0.95], ring: [414, 468, 140, 378], feats: [8, 9] },
  { img: 's10_sel', title: 'תאורת *LED*', sub: 'פס לד בתאי התלייה — רואים את האור כבר בתכנון.', click: [182, 616], focus: [230, 620, 0.95], ring: [132, 594, 102, 44], feats: [10] },
  { img: 's11_sel', title: 'דלתות *וקלפות*', sub: 'דלת כפולה לכל עמודה, וקלפה לתא העליון.', click: [182, 744], focus: [230, 660, 0.92], ring: [132, 722, 102, 250], feats: [11] },
  { img: 's12', title: '*מראה* וזכוכית', sub: 'דלת מראה ודלת זכוכית במסגרת שחורה — לכל עמודה סגנון.', click: [179, 952], focus: [277, 650, 0.88], ring: [136, 463, 280, 386], feats: [12] },
  { img: 's13_sel', title: 'גוון *עץ*', sub: 'בוחרים גוון מהקטלוג, והחזיתות מתעדכנות מיד.', click: [790, 842], focus: [560, 860, 0.8], ring: [762, 812, 58, 62], feats: [13] },
  { img: 's14', title: 'ידיות + *מחיר*', sub: 'ידית לכל דלת ומגירה. המחיר מתעדכן בזמן אמת.', click: [306, 1194], focus: [300, 650, 0.88], focus2: [800, 1100, 1.0], ring: [764, 1156, 200, 64], ring2: true, feats: [14], feats2: [15] },
];
const T_IN = 3, STEP = 2;
STEPS.forEach((s, i) => { s.t0 = T_IN + i * STEP; s.t1 = s.t0 + STEP; });
const T_REV = T_IN + STEPS.length * STEP;          // 31
const REV = [
  { img: 'r1b', t0: T_REV, t1: T_REV + 2 },
  { img: 'r2', t0: T_REV + 2, t1: T_REV + 4 },
  { img: 'r3', t0: T_REV + 4, t1: T_REV + 8 },
  { img: 'r4', t0: T_REV + 8, t1: T_REV + 10 },
];
const T_OUT = T_REV + 10;                           // 41
const DURATION = T_OUT + 5;                         // 46
const PINS = [
  [522, 196, 'אחסון עליון'], [248, 560, 'תלייה ארוכה + LED'], [561, 640, 'תלייה כפולה'], [261, 1057, 'מגירות נעליים'],
  [822, 913, 'מגירות פנימיות'], [1044, 587, 'סורבטו'], [1070, 960, 'מגירות חיצוניות'],
];
const PIN_T0 = REV[2].t0 + 0.45, PIN_DT = 0.34;
const BLOCKS = [
  ...STEPS.map((s, i) => ({ t0: s.t0, t1: s.t1, kick: `שלב ${String(i + 1).padStart(2, '0')}`, title: s.title, sub: s.sub })),
  { t0: T_REV, t1: REV[2].t0, kick: 'התוצאה', title: 'הדמיית *3D* מיידית', sub: 'אותו ארון, מכל זווית — ישר מתוך העורך.' },
  { t0: REV[2].t0, t1: REV[3].t0, kick: 'מבפנים', title: 'הכל *במקום*', sub: 'כל תא תוכנן לשימוש — ומוכן לשרטוט ייצור.' },
  { t0: REV[3].t0, t1: T_OUT, kick: 'סיכום', title: `${FEATS.length} *פיצ'רים.* ארון אחד.`, sub: 'מתוכנן נכון, נראה נכון — בפחות מדקה של עבודה בעורך.' },
];

/* ───────────── layout ───────────── */
const L = P ? {
  win: { x: 60, y: 226, w: 960, h: 1080 }, zoom: 1.12,
  logo: { h: 50, top: 62 }, rec: { right: 60, top: 152, fs: 22 }, step: { left: 60, top: 150, fs: 24 }, bar: { x: 60, y: 196, w: 960 },
  block: { right: 60, top: 1342, w: 960, kick: 22, title: 64, sub: 30, gap: 10 },
  chips: { right: 60, top: 1612, w: 960, fs: 21, gap: 10 },
} : {
  win: { x: 80, y: 96, w: 780, h: 900 }, zoom: 1,
  logo: { h: 46, top: 52, right: 80 }, rec: { right: 80, top: 150, fs: 22 }, step: { left: 940, top: 148, fs: 24 }, bar: { x: 940, y: 196, w: 900 },
  block: { right: 80, top: 268, w: 900, kick: 24, title: 80, sub: 32, gap: 14 },
  chips: { right: 80, top: 650, w: 900, fs: 22, gap: 12 },
};
const VW = L.win.w, VH = L.win.h - 44;

/* ───────────── DOM ───────────── */
const logo = el('img', 'abs'); logo.src = 'assets/brand/logo-wide.png';
css(logo, P ? { height: L.logo.h, top: L.logo.top, left: (W - L.logo.h * 1350 / 215) / 2 } : { height: L.logo.h, top: L.logo.top, right: L.logo.right });
const rec = css(el('div', 'rec abs', stage, '<i></i>TIMELAPSE <em>▶▶</em>'), { right: L.rec.right, top: L.rec.top, fontSize: L.rec.fs });
const stepno = css(el('div', 'stepno abs'), { left: L.step.left, top: L.step.top, fontSize: L.step.fs });
const bar = css(el('div', 'bar abs'), { left: L.bar.x, top: L.bar.y, width: L.bar.w });
const barFill = el('div', '', bar);

const win = css(el('div', 'win'), { left: L.win.x, top: L.win.y, width: L.win.w, height: L.win.h });
el('div', 'chrome', win, '<i></i><i></i><i></i><div class="url">anycloset3d.com — עורך הארונות</div>');
const view = el('div', 'view', win);
const cam = el('div', 'cam', view);
const imgs = STEPS.map(s => { const i = el('img', '', cam); i.src = `assets/shots/${s.img}.jpg`; css(i, { width: IW, height: IH, opacity: 0 }); return i; });
const cam3 = el('div', 'cam', view);
const rimgs = REV.map(r => { const i = el('img', '', cam3); i.src = `assets/shots/${r.img}.jpg`; css(i, { width: RW, height: RH, opacity: 0 }); return i; });
const pinEls = PINS.map(([x, , label]) => el('div', 'pin ' + (x < RW * 0.5 ? 'r' : 'l'), cam3, `<b></b><span>${label}</span>`));
const flash = el('div', 'flash', view);
const ring = el('div', 'ring', view);
const ripple = el('div', 'ripple', view);
const cursor = el('div', 'cursor', view, `<svg viewBox="0 0 40 40" width="40" height="40"><path d="M6 3 L6 33 L13.5 26 L18.5 37.5 L23.5 35.3 L18.6 24 L29 24 Z" fill="#fff" stroke="#071224" stroke-width="2.4" stroke-linejoin="round"/></svg>`);

const blockEls = BLOCKS.map(b => {
  const e = css(el('div', 'block'), { right: L.block.right, top: L.block.top, width: L.block.w, gap: L.block.gap });
  css(el('div', 'kicker', e, b.kick), { fontSize: L.block.kick });
  css(el('div', 'h1', e, words(b.title)), { fontSize: L.block.title });
  css(el('div', 'sub', e, b.sub), { fontSize: L.block.sub, maxWidth: L.block.w - 40 });
  return e;
});
const chipsBox = css(el('div', 'chips'), { right: L.chips.right, top: L.chips.top, width: L.chips.w, gap: L.chips.gap });
const chipEls = FEATS.map(f => css(el('div', 'chip', chipsBox, `<i></i>${f}`), { fontSize: L.chips.fs, padding: `${Math.round(L.chips.fs * 0.4)}px ${Math.round(L.chips.fs * 0.8)}px ${Math.round(L.chips.fs * 0.4)}px ${Math.round(L.chips.fs * 0.55)}px` }));
const featAt = FEATS.map(() => Infinity);
STEPS.forEach(s => {
  s.feats.forEach((f, k) => { featAt[f] = s.t0 + 0.85 + k * 0.14; });
  (s.feats2 || []).forEach((f, k) => { featAt[f] = s.t0 + 1.45 + k * 0.14; });
});

const intro = css(el('div', 'abs'), { left: 0, right: 0, top: P ? 720 : 300, textAlign: 'center' });
const iRec = css(el('div', 'rec', intro, '<i></i>TIMELAPSE'), { justifyContent: 'center', fontSize: P ? 26 : 26, marginBottom: 26 });
const iT1 = css(el('div', 'h1', intro, words('בונים ארון בגדים')), { fontSize: P ? 96 : 112 });
const iT2 = css(el('div', 'h1', intro, words('*מאפס.*')), { fontSize: P ? 96 : 112 });
const iSub = css(el('div', 'sub', intro, P ? 'צעד אחר צעד, בתוך הממשק<br>האמיתי של AnyCloset3D' : 'צעד אחר צעד, בתוך הממשק האמיתי של AnyCloset3D'), { fontSize: P ? 36 : 36, marginTop: 28 });

const outro = el('div', '', stage); outro.id = 'outro';
const oLogo = el('img', '', outro); oLogo.src = 'assets/brand/logo-wide.png'; css(oLogo, { width: P ? 640 : 600, marginBottom: P ? 70 : 56 });
const oT1 = css(el('div', 'h1', outro, words('מסקיצה להזמנה.')), { fontSize: P ? 92 : 104 });
const oT2 = css(el('div', 'h1', outro, words('*במקום אחד.*')), { fontSize: P ? 92 : 104 });
const oCta = css(el('div', 'cta', outro, 'anycloset3d.com'), { fontSize: P ? 38 : 36, padding: P ? '20px 56px' : '18px 52px', marginTop: P ? 80 : 60 });
el('div', '', stage).id = 'vig';

/* ───────────── camera math ───────────── */
const fitS = Math.min(VW / IW, VH / IH);
const overview = [IW / 2, IH / 2, fitS];
const finalFocus = i => STEPS[i].focus2 || STEPS[i].focus;
const mixF = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), Math.exp(lerp(Math.log(a[2]), Math.log(b[2]), k))];
function camAt(t) {
  if (t < T_IN) return overview;
  const i = Math.min(STEPS.length - 1, Math.floor((t - T_IN) / STEP)), s = STEPS[i], u = t - s.t0;
  let f = mixF(i ? finalFocus(i - 1) : overview, s.focus, eio(seg(u, 0, 0.62)));
  if (s.focus2) f = mixF(f, s.focus2, eio(seg(u, 1.0, 1.55)));
  return f;
}
function place(f, drift) {
  const s = f[2] * (f[2] > fitS * 1.01 ? L.zoom : 1) * drift;
  const fit = (c, iw, vw) => iw * s <= vw ? (vw - iw * s) / 2 : Math.min(0, Math.max(vw - iw * s, vw / 2 - c * s));
  return { s, x: fit(f[0], IW, VW), y: fit(f[1], IH, VH) };
}

/* ───────────── frame ───────────── */
function setBlock(e, b, t) {
  const on = t >= b.t0 - 0.001 && t < b.t1 + (b.t1 === T_OUT ? 0.6 : 0);
  e.style.display = on ? 'flex' : 'none';
  if (!on) return;
  const u = t - b.t0;
  const [kick, title, sub] = e.children;
  kick.style.opacity = seg(u, 0.02, 0.3);
  title.querySelectorAll('.mw > span').forEach((w, k) => { w.style.transform = `translateY(${(1 - eo(seg(u, 0.04 + k * 0.06, 0.48 + k * 0.06))) * 108}%)`; });
  const ps = eo(seg(u, 0.22, 0.62));
  css(sub, { opacity: ps, transform: `translateY(${(1 - ps) * 18}px)` });
  e.style.opacity = 1 - seg(t, b.t1 - 0.2, b.t1);
}
function maskWords(node, t0, t, step = 0.07) {
  node.querySelectorAll('.mw > span').forEach((w, k) => { w.style.transform = `translateY(${(1 - eo(seg(t, t0 + k * step, t0 + 0.5 + k * step))) * 108}%)`; });
}

function renderFrame(t) {
  /* intro */
  const iin = seg(t, 0.15, 0.6), iout = eio(seg(t, 2.2, 2.75));
  intro.style.display = t < 2.8 ? 'block' : 'none';
  css(intro, { opacity: 1 - iout, transform: `translateY(${-iout * 80}px)` });
  iRec.style.opacity = iin;
  maskWords(iT1, 0.3, t); maskWords(iT2, 0.75, t);
  const isub = eo(seg(t, 1.1, 1.6)); css(iSub, { opacity: isub, transform: `translateY(${(1 - isub) * 20}px)` });

  /* HUD */
  const hud = eo(seg(t, 2.55, 3.05)) * (1 - seg(t, T_OUT - 0.1, T_OUT + 0.3));
  for (const e of [logo, rec, stepno, bar]) e.style.opacity = hud;
  rec.querySelector('i').style.opacity = 0.35 + 0.65 * (Math.sin(t * Math.PI * 2) > -0.2 ? 1 : 0);
  barFill.style.transform = `scaleX(${seg(t, T_IN, T_REV)})`;
  const si = Math.max(0, Math.min(STEPS.length - 1, Math.floor((t - T_IN) / STEP)));
  stepno.innerHTML = t < T_REV ? `שלב <b>${String(si + 1).padStart(2, '0')}</b> / ${STEPS.length}` : `<b>✓</b> הארון מוכן`;

  /* window */
  const wIn = eo(seg(t, 2.3, 3.05));
  const punch = 1 + 0.018 * Math.sin(Math.PI * seg(t, T_REV - 0.25, T_REV + 0.25));
  css(win, { opacity: seg(t, 2.3, 2.6), transform: `translateY(${(1 - wIn) * H * 0.55}px) scale(${punch})` });

  /* editor captures */
  const f = camAt(t);
  const drift = t >= T_IN ? 1 + 0.02 * seg(t - (T_IN + si * STEP), 0.6, STEP) : 1;
  const c = place(f, drift);
  cam.style.transform = `translate(${c.x}px, ${c.y}px) scale(${c.s})`;
  const step = STEPS[si], u = t - step.t0;
  const swap = t < T_IN ? 0 : eio(seg(u, 0.55, 0.78));
  imgs.forEach((im, k) => {
    let o = 0;
    if (t < T_IN || si === 0) o = k === 0 ? 1 : 0;
    else if (k === si) o = swap;
    else if (k === si - 1) o = 1;
    im.style.opacity = o;
  });
  const showUi = t < T_REV + 0.5;
  cam.style.display = showUi ? 'block' : 'none';

  /* flash sweep on every update + into the 3D reveal */
  const fu = t >= T_REV - 0.15 ? seg(t, T_REV - 0.15, T_REV + 0.35) : (t >= T_IN ? seg(u, 0.5, 0.86) : 0);
  css(flash, { top: lerp(-160, VH, fu), opacity: fu > 0 && fu < 1 ? 1 : 0 });

  /* ring */
  let rOn = 0, R = null;
  if (t >= T_IN && t < T_REV) {
    R = step.ring;
    if (step.ring2) rOn = seg(u, 1.5, 1.7) * (1 - seg(u, STEP - 0.15, STEP));
    else rOn = seg(u, 0.8, 1.0) * (1 - seg(u, STEP - 0.15, STEP));
  }
  if (R && rOn > 0) {
    const pad = 7, pulse = 1 + 0.06 * Math.max(0, Math.sin((u - 0.8) * Math.PI * 2.2)) * (1 - seg(u, 1.4, 1.9));
    const k = 1 + (1 - eo(rOn)) * 0.15;
    const x = c.x + (R[0] - pad) * c.s, y = c.y + (R[1] - pad) * c.s, w = (R[2] + pad * 2) * c.s, h = (R[3] + pad * 2) * c.s;
    css(ring, { display: 'block', left: x, top: y, width: w, height: h, opacity: rOn, transform: `scale(${k * pulse})` });
  } else ring.style.display = 'none';

  /* cursor */
  const cuOn = seg(t, T_IN - 0.4, T_IN) * (1 - seg(t, T_REV - 0.4, T_REV - 0.1));
  if (cuOn > 0) {
    const prev = si ? STEPS[si - 1].click : [IW * 0.62, IH * 0.78];
    const tu = t < T_IN ? 0 : u;
    const k = eio(seg(tu, 0.0, 0.48));
    let px = lerp(prev[0], step.click[0], k), py = lerp(prev[1], step.click[1], k) - Math.sin(Math.PI * k) * 60;
    const away = eio(seg(tu, 0.95, STEP)); px += away * 26; py += away * 34;
    const press = 1 - 0.18 * Math.sin(Math.PI * seg(tu, 0.48, 0.62));
    const sx = c.x + px * c.s, sy = c.y + py * c.s;
    css(cursor, { display: 'block', opacity: cuOn, transform: `translate(${sx - 6}px, ${sy - 3}px) scale(${press})` });
    const rp = seg(tu, 0.5, 1.0);
    css(ripple, { display: rp > 0 && rp < 1 ? 'block' : 'none', left: sx, top: sy, opacity: 1 - rp, transform: `scale(${0.25 + eo(rp) * 1.1})` });
  } else { cursor.style.display = 'none'; ripple.style.display = 'none'; }

  /* 3D reveal */
  const r3 = t >= T_REV - 0.2;
  cam3.style.display = r3 ? 'block' : 'none';
  if (r3) {
    let idx = REV.findIndex(r => t < r.t1);
    if (idx < 0) idx = REV.length - 1;
    const r = REV[idx];
    const z = 1 + 0.06 * seg(t, r.t0, r.t1) + (idx === 0 ? 0.05 * (1 - eo(seg(t, T_REV, T_REV + 1.2))) : 0);
    const s0 = Math.max(VW / RW, VH / RH) * z;
    const drx = (idx % 2 ? -1 : 1) * 14 * seg(t, r.t0, r.t1);
    const x = (VW - RW * s0) / 2 + drx, y = (VH - RH * s0) / 2;
    cam3.style.transform = `translate(${x}px, ${y}px) scale(${s0})`;
    rimgs.forEach((im, k) => {
      let o = 0;
      if (k === idx) o = k === 0 ? seg(t, T_REV - 0.2, T_REV + 0.15) : seg(t, r.t0, r.t0 + 0.35);
      else if (k === idx - 1) o = 1;
      im.style.opacity = o;
    });
    pinEls.forEach((p, k) => {
      const [px, py] = PINS[k];
      const a = seg(t, PIN_T0 + k * PIN_DT, PIN_T0 + k * PIN_DT + 0.35), out = 1 - seg(t, REV[3].t0 - 0.25, REV[3].t0);
      const show = a * out;
      css(p, { display: show > 0 ? 'block' : 'none', left: px, top: py, opacity: Math.min(1, a * 2) * out, transform: `scale(${(0.4 + 0.6 * eback(a)) / s0})` });
    });
  }

  /* text blocks + chips */
  BLOCKS.forEach((b, k) => setBlock(blockEls[k], b, t));
  chipsBox.style.opacity = seg(t, 2.8, 3.3) * (1 - seg(t, T_OUT - 0.1, T_OUT + 0.3));
  const glow = t >= REV[3].t0 ? Math.sin(Math.PI * seg(t, REV[3].t0, REV[3].t0 + 0.9)) : 0;
  chipEls.forEach((ch, k) => {
    const on = t >= featAt[k];
    ch.classList.toggle('on', on);
    const pop = on ? seg(t, featAt[k], featAt[k] + 0.3) : 1;
    const g = glow * Math.max(0, 1 - Math.abs(k / FEATS.length - seg(t, REV[3].t0, REV[3].t0 + 0.9)) * 3);
    ch.style.transform = `scale(${on ? 1 + 0.16 * Math.sin(Math.PI * pop) + g * 0.08 : 1})`;
  });

  /* outro */
  const o = seg(t, T_OUT - 0.05, T_OUT + 0.55);
  outro.style.display = o > 0 ? 'flex' : 'none';
  outro.style.clipPath = `circle(${eio(o) * 120}% at 50% 50%)`;
  const ol = eo(seg(t, T_OUT + 0.3, T_OUT + 1.0));
  css(oLogo, { opacity: ol, transform: `scale(${0.9 + 0.1 * ol})` });
  maskWords(oT1, T_OUT + 0.6, t); maskWords(oT2, T_OUT + 1.0, t);
  const oc = seg(t, T_OUT + 1.6, T_OUT + 2.0);
  css(oCta, { opacity: Math.min(1, oc * 2), transform: `scale(${oc > 0 ? 0.6 + 0.4 * eback(oc) : 0.6})` });
}

/* ───────────── sound cues ───────────── */
const SFX = [];
const sfx = (t, type, g = 1) => SFX.push([+t.toFixed(3), type, g]);
sfx(1.5, 'riser', 0.8); sfx(2.3, 'whoosh', 0.6); sfx(T_IN, 'hit', 0.8);
STEPS.forEach(s => {
  sfx(s.t0 + 0.52, 'click', 0.9);
  sfx(s.t0 + 0.6, 'blip', 0.55);
  s.feats.forEach((_, k) => sfx(s.t0 + 0.85 + k * 0.14, 'pop', 0.6));
  (s.feats2 || []).forEach((_, k) => sfx(s.t0 + 1.45 + k * 0.14, 'pop', 0.6));
  if (s.focus2) sfx(s.t0 + 1.0, 'whoosh', 0.35);
});
sfx(T_REV - 1.5, 'riser', 0.7); sfx(T_REV, 'boom', 1);
sfx(REV[1].t0, 'whoosh', 0.5); sfx(REV[2].t0, 'whoosh', 0.55); sfx(REV[3].t0, 'whoosh', 0.5);
PINS.forEach((_, k) => sfx(PIN_T0 + k * PIN_DT, 'tick', 0.7));
sfx(REV[3].t0 + 0.1, 'shimmer', 0.6);
sfx(T_OUT, 'whoosh', 0.7); sfx(T_OUT + 0.35, 'hit', 0.7); sfx(T_OUT + 1.6, 'chime', 0.9);

window.__cues = {
  duration: DURATION, video: { name: 'anycloset-timelapse', fps: FPS },
  scenes: [
    { type: 'intro', t0: 0, t1: T_IN },
    ...STEPS.map((s, i) => ({ type: 'step' + String(i + 1).padStart(2, '0'), t0: s.t0, t1: s.t1 })),
    ...REV.map(r => ({ type: r.img, t0: r.t0, t1: r.t1 })),
    { type: 'outro', t0: T_OUT, t1: DURATION },
  ],
  sfx: SFX.sort((a, b) => a[0] - b[0]),
  T: { intro: T_IN, step: STEP, reveal: T_REV, out: T_OUT },
};
window.__seek = t => { renderFrame(t); };

Promise.all([
  document.fonts.ready,
  ...[...document.images].map(i => i.decode().catch(() => console.error('decode failed', i.src))),
]).then(() => { window.__seek(0); markReady(true); });
