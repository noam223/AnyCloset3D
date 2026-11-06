// Narrated tutorial template (16:9): full editor captures with camera moves, cursor clicks/drags,
// highlight rings and Hebrew subtitles timed to Gemini TTS narration (tut-vo.mjs writes vo.json).
// Deterministic: renderFrame(t) derives every element from t; render.mjs seeks frame by frame.
let markReady;
window.__ready = new Promise(r => { markReady = r; });
const W = 1920, H = 1080, FPS = 30;
const C = window.CONTENT;
const IW = C.IW || 1904, IH = C.IH || 1071;

const clamp01 = x => Math.max(0, Math.min(1, x));
const seg = (t, a, b) => clamp01((t - a) / (b - a));
const eio = x => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const eo = x => 1 - Math.pow(1 - x, 3);
const lerp = (a, b, k) => a + (b - a) * k;

const stage = document.getElementById('stage');
stage.style.width = W + 'px'; stage.style.height = H + 'px';
const el = (tag, cls, parent = stage, html = '') => {
  const e = document.createElement(tag); if (cls) e.className = cls; if (html) e.innerHTML = html; parent.appendChild(e); return e;
};
const UNITLESS = new Set(['opacity', 'zIndex']);
const css = (e, o) => { for (const k in o) e.style[k] = typeof o[k] === 'number' && !UNITLESS.has(k) ? o[k] + 'px' : o[k]; return e; };
const words = text => text.split(' ').map(w => {
  const a = w.startsWith('*'); w = w.replace(/\*/g, '');
  return `<span class="mw"><span class="${a ? 'acc' : ''}">${w}</span></span>`;
}).join(' ');

el('style', '', document.head, `
.tw { position:absolute; border-radius:18px; overflow:hidden; background:#e9edf2;
  box-shadow:0 30px 80px rgba(0,0,0,.55), 0 0 0 1.5px rgba(125,234,255,.22); }
.tw .cam { position:absolute; left:0; top:0; transform-origin:0 0; }
.tw .cam img { position:absolute; left:0; top:0; display:block; }
.tchip { position:absolute; display:flex; align-items:center; gap:14px; direction:rtl; font-weight:800; color:#fff; }
.tchip b { background:var(--accent); color:var(--navy); border-radius:10px; padding:4px 14px; font-weight:900; }
.tsub { position:absolute; left:50%; transform:translateX(-50%); max-width:1400px; text-align:center; direction:rtl;
  background:rgba(7,18,36,.88); color:#fff; font:700 38px/1.35 Heebo; padding:14px 30px; border-radius:16px;
  border:1.5px solid rgba(0,212,255,.35); box-shadow:0 10px 30px rgba(0,0,0,.35); z-index:6; }
.tprog { position:absolute; height:6px; border-radius:6px; background:rgba(125,234,255,.14); overflow:hidden; }
.tprog > div { height:100%; width:100%; background:linear-gradient(to left, var(--accent), #33ddff); transform-origin:right center; }
.tcard { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; z-index:8; }
.tcard .bgimg { position:absolute; inset:-40px; background-size:cover; background-position:center; filter:blur(14px) brightness(.35) saturate(.8); }
.tcard .inner { position:relative; display:flex; flex-direction:column; align-items:center; }
`);

/* ───────────── timeline ───────────── */
const STEPS = C.STEPS;
const LEAD = 0.55, TAIL = 0.75;
let VO = [];
function buildTimeline() {
  let t = 0;
  STEPS.forEach((s, i) => {
    const d = (VO[i] && VO[i].dur) || s.dur || 4;
    s.t0 = t; s.v0 = t + LEAD; s.vd = d; s.t1 = t + LEAD + d + (s.tail ?? TAIL);
    t = Math.round(s.t1 * 1000) / 1000;
    s.beatsAbs = (s.beats || []).map(b => ({ ...b, t: s.v0 + b.at * d }));
    // subtitles: one sentence at a time, timed by length
    const parts = (s.sub || s.say || '').split(/(?<=[.?!:])\s+/).filter(Boolean);
    const total = parts.reduce((a, p) => a + p.length, 0);
    let acc = 0;
    s.subs = parts.map(p => { const a = s.v0 + (acc / total) * d; acc += p.length; return { text: p, t0: a, t1: s.v0 + (acc / total) * d }; });
  });
  return t;
}

/* ───────────── DOM ───────────── */
const WIN = { x: 120, y: 92, w: 1680, h: Math.round(1680 * IH / IW) };
const logo = el('img', 'abs'); logo.src = 'assets/brand/logo-wide.png'; css(logo, { height: 44, top: 26, left: 120 });
const chip = css(el('div', 'tchip'), { right: 120, top: 28, fontSize: 30 });
const prog = css(el('div', 'tprog'), { left: WIN.x, top: WIN.y + WIN.h + 18, width: WIN.w });
const progFill = el('div', '', prog);
const win = css(el('div', 'tw'), { left: WIN.x, top: WIN.y, width: WIN.w, height: WIN.h });
const cam = el('div', 'cam', win);
const IMGS = [...new Set(STEPS.flatMap(s => [s.img, ...(s.beats || []).map(b => b.img)]).filter(Boolean))];
const imgEl = {};
IMGS.forEach(n => { const i = el('img', '', cam); i.src = `assets/shots/${n}.jpg`; css(i, { width: IW, height: IH, opacity: 0 }); imgEl[n] = i; });
const ring = el('div', 'ring', win);
const ripple = el('div', 'ripple', win);
const cursor = el('div', 'cursor', win, `<svg viewBox="0 0 40 40" width="40" height="40"><path d="M6 3 L6 33 L13.5 26 L18.5 37.5 L23.5 35.3 L18.6 24 L29 24 Z" fill="#fff" stroke="#071224" stroke-width="2.4" stroke-linejoin="round"/></svg>`);
const sub = css(el('div', 'tsub', win), { bottom: 34 });

const card = el('div', 'tcard');
const cardBg = el('div', 'bgimg', card);
const cardIn = el('div', 'inner', card);
const cKick = css(el('div', 'kicker', cardIn), { fontSize: 30, marginBottom: 22 });
const cT = css(el('div', 'h1', cardIn), { fontSize: 110 });
const cSub = css(el('div', 'sub', cardIn), { fontSize: 40, marginTop: 26, maxWidth: 1300 });
const cLogo = el('img', '', cardIn); cLogo.src = 'assets/brand/logo-wide.png'; css(cLogo, { width: 560, marginBottom: 50, display: 'none' });
const cCta = css(el('div', 'cta', cardIn, 'anycloset3d.com'), { fontSize: 36, padding: '18px 52px', marginTop: 50, display: 'none' });
el('div', '', stage).id = 'vig';

/* ───────────── camera ───────────── */
const fitS = Math.min(WIN.w / IW, WIN.h / IH);
const FULL = [IW / 2, IH / 2, 1];
const mixF = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), Math.exp(lerp(Math.log(a[2]), Math.log(b[2]), k))];
const CAM_D = 0.9;
// Every focus key in order, so the camera keeps easing across step boundaries.
let FOCUS = [];
function camAt(t) {
  let f = FULL;
  for (const k of FOCUS) {
    if (t < k.t) break;
    f = mixF(f, k.f, eio(seg(t, k.t, k.t + CAM_D)));
  }
  return f;
}
function place(f) {
  const s = fitS * f[2];
  const fit = (c, iw, vw) => (iw * s <= vw + 0.5 ? (vw - iw * s) / 2 : Math.min(0, Math.max(vw - iw * s, vw / 2 - c * s)));
  return { s, x: fit(f[0], IW, WIN.w), y: fit(f[1], IH, WIN.h) };
}

/* ───────────── frame ───────────── */
let DURATION = 0;
const stepAt = t => STEPS.find(s => t < s.t1) || STEPS[STEPS.length - 1];
function imageAt(s, t) {
  let img = s.img || null;
  for (const b of s.beatsAbs) if (b.img && t >= b.t + (b.click || b.drag ? 0.25 : 0)) img = b.img;
  return img;
}
function prevImage(s, t) {
  // image shown just before the latest swap, for the crossfade
  let cur = s.img, prev = null, at = -1;
  const i = STEPS.indexOf(s);
  if (i > 0) prev = imageAt(STEPS[i - 1], STEPS[i - 1].t1);
  if (cur && prev && cur !== prev) at = s.t0;
  for (const b of s.beatsAbs) {
    const bt = b.t + (b.click || b.drag ? 0.25 : 0);
    if (b.img && t >= bt) { prev = cur; cur = b.img; at = bt; }
  }
  return { cur, prev, at };
}

function renderFrame(t) {
  const s = stepAt(t), u = t - s.t0;

  /* chrome */
  const isCard = !!s.card;
  chip.innerHTML = s.chapter ? `<b>${s.chapter}</b>${s.title || ''}` : '';
  chip.style.opacity = isCard ? 0 : 1;
  progFill.style.transform = `scaleX(${seg(t, 0, DURATION)})`;

  /* screen */
  const f = camAt(t), c = place(f);
  cam.style.transform = `translate(${c.x}px, ${c.y}px) scale(${c.s})`;
  const { cur, prev, at } = prevImage(s, t);
  const k = at < 0 ? 1 : eio(seg(t, at, at + 0.35));
  for (const n of IMGS) {
    const im = imgEl[n];
    if (n === cur) { im.style.opacity = prev && prev !== cur ? k : 1; im.style.zIndex = 2; }
    else if (n === prev) { im.style.opacity = 1; im.style.zIndex = 1; }
    else { im.style.opacity = 0; im.style.zIndex = 0; }
  }

  /* ring: latest ring beat in this step, until a beat with ring:null */
  let R = null, rT = 0;
  for (const b of s.beatsAbs) if (t >= b.t && 'ring' in b) { R = b.ring; rT = b.t; }
  const rOn = R ? seg(t, rT, rT + 0.25) * (1 - seg(t, s.t1 - 0.25, s.t1)) : 0;
  if (R && rOn > 0) {
    const pad = 8, x = c.x + (R[0] - pad) * c.s, y = c.y + (R[1] - pad) * c.s, w = (R[2] + pad * 2) * c.s, h = (R[3] + pad * 2) * c.s;
    const pulse = 1 + 0.05 * Math.max(0, Math.sin((t - rT) * Math.PI * 2)) * (1 - seg(t, rT + 0.6, rT + 1.2));
    css(ring, { display: 'block', left: x, top: y, width: w, height: h, opacity: rOn, transform: `scale(${(1 + (1 - eo(rOn)) * 0.12) * pulse})` });
  } else ring.style.display = 'none';

  /* cursor: travels to each click / drag start, presses, follows drags */
  const acts = STEPS.flatMap(q => q.beatsAbs.filter(b => b.click || b.drag));
  let pos = C.CURSOR0 || [IW * 0.55, IH * 0.75], press = 0, rip = -1, ripPos = null;
  for (let i = 0; i < acts.length; i++) {
    const b = acts[i], from = i ? (acts[i - 1].drag ? acts[i - 1].drag.slice(2) : acts[i - 1].click) : pos;
    const to = b.drag ? b.drag.slice(0, 2) : b.click;
    const mv0 = b.t - 0.7;
    if (t < mv0) { pos = from; break; }
    if (t < b.t) {
      const e = eio(seg(t, mv0, b.t));
      pos = [lerp(from[0], to[0], e), lerp(from[1], to[1], e) - Math.sin(Math.PI * e) * 40];
      break;
    }
    if (b.drag) {
      const e = eio(seg(t, b.t + 0.1, b.t + 1.1));
      pos = [lerp(b.drag[0], b.drag[2], e), lerp(b.drag[1], b.drag[3], e)];
      press = t < b.t + 1.2 ? 1 : 0;
    } else {
      pos = to;
      press = Math.sin(Math.PI * seg(t, b.t - 0.05, b.t + 0.12));
      if (t < b.t + 0.6) { rip = seg(t, b.t, b.t + 0.6); ripPos = to; }
    }
  }
  const curOn = isCard ? 0 : 1;
  const sx = c.x + pos[0] * c.s, sy = c.y + pos[1] * c.s;
  css(cursor, { display: curOn ? 'block' : 'none', transform: `translate(${sx - 6}px, ${sy - 3}px) scale(${1 - 0.16 * press})` });
  if (rip >= 0 && rip < 1 && !isCard) {
    css(ripple, { display: 'block', left: c.x + ripPos[0] * c.s, top: c.y + ripPos[1] * c.s, opacity: 1 - rip, transform: `scale(${0.25 + eo(rip) * 1.1})` });
  } else ripple.style.display = 'none';

  /* subtitles */
  const sNow = s.subs.find(q => t >= q.t0 - 0.05 && t < q.t1 + 0.25);
  if (sNow && !isCard) {
    sub.style.display = 'block';
    sub.textContent = sNow.text;
    sub.style.opacity = seg(t, sNow.t0 - 0.05, sNow.t0 + 0.15);
  } else sub.style.display = 'none';

  /* cards (intro / outro) */
  const fadeIn = seg(t, s.t0, s.t0 + 0.4), fadeOut = 1 - seg(t, s.t1 - 0.45, s.t1);
  if (isCard) {
    card.style.display = 'flex';
    const first = STEPS.indexOf(s) === 0;
    card.style.opacity = (first ? 1 : fadeIn) * (s.last ? 1 : fadeOut);
    cardBg.style.backgroundImage = s.bg ? `url(assets/shots/${s.bg}.jpg)` : 'none';
    cKick.textContent = s.kick || '';
    if (cT.dataset.k !== s.cardTitle) { cT.innerHTML = words(s.cardTitle || ''); cT.dataset.k = s.cardTitle; }
    cSub.textContent = s.cardSub || '';
    cLogo.style.display = s.last ? 'block' : 'none';
    cCta.style.display = s.last ? 'block' : 'none';
    cT.querySelectorAll('.mw > span').forEach((w, i) => { w.style.transform = `translateY(${(1 - eo(seg(u, 0.2 + i * 0.08, 0.7 + i * 0.08))) * 108}%)`; });
    cKick.style.opacity = seg(u, 0.1, 0.4);
    const ps = eo(seg(u, 0.5, 1.0)); css(cSub, { opacity: ps, transform: `translateY(${(1 - ps) * 18}px)` });
    cLogo.style.opacity = eo(seg(u, 0.1, 0.6));
    cCta.style.opacity = seg(u, 0.9, 1.3);
  } else card.style.display = 'none';
}

/* ───────────── setup ───────────── */
async function setup() {
  try { VO = await (await fetch(`audio/vo/${C.NAME}/vo.json`)).json(); } catch { VO = []; }
  DURATION = buildTimeline();
  let lastImg = STEPS.find(s => s.img)?.img || null;
  STEPS.forEach(s => { s.img = s.img || lastImg; s.beatsAbs.forEach(b => { if (b.img) lastImg = b.img; }); if (!s.beatsAbs.some(b => b.img)) lastImg = s.img; });
  FOCUS = STEPS.flatMap(s => [
    ...(s.focus ? [{ t: s.t0, f: s.focus }] : []),
    ...s.beatsAbs.filter(b => b.focus).map(b => ({ t: b.t - (b.lead ?? 0.3), f: b.focus })),
  ]).sort((a, b) => a.t - b.t);

  const SFX = [];
  STEPS.forEach((s, i) => {
    if (i) SFX.push([+(s.t0).toFixed(3), 'whoosh', s.card ? 0.5 : 0.25]);
    s.beatsAbs.forEach(b => { if (b.click) SFX.push([+b.t.toFixed(3), 'click', 0.9]); if (b.drag) SFX.push([+b.t.toFixed(3), 'click', 0.6]); });
  });
  const last = STEPS[STEPS.length - 1];
  SFX.push([+(last.t0 + 0.9).toFixed(3), 'chime', 0.7]);
  window.__cues = {
    duration: DURATION, video: { name: C.NAME, fps: FPS }, mixer: 'tut-mix.mjs',
    scenes: STEPS.map((s, i) => ({ type: 'step' + String(i).padStart(2, '0'), t0: s.t0, t1: s.t1 })),
    vo: STEPS.map((s, i) => (VO[i] ? { t: +s.v0.toFixed(3), file: VO[i].file } : null)).filter(Boolean),
    sfx: SFX.sort((a, b) => a[0] - b[0]),
    T: { intro: 0, reveal: DURATION, out: DURATION },
  };
  window.__seek = t => renderFrame(t);
  await Promise.all([document.fonts.ready, ...[...document.images].map(i => i.decode().catch(() => console.error('decode failed', i.src)))]);
  renderFrame(0);
  markReady(true);
}
setup();
