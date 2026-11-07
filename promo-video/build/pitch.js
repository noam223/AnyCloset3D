// Narrated sales-pitch template (16:9): one scene per narration line (tut-vo.mjs writes vo.json), each scene
// sized to its line. Scene types: hook, logo, app, grid, ai, deal, live, compare, outro.
// Deterministic: renderFrame(t) derives every element from t; render.mjs seeks frame by frame.
// Render with --serve-root .. (gallery images live in ../assets/renders).
let markReady;
window.__ready = new Promise(r => { markReady = r; });
const W = 1920, H = 1080, FPS = 30;
const C = window.CONTENT;
const IW = 1904, IH = 1071;
const BRAND_RE = /אֶנִי קְלוֹזֶט תְּרִי דִי/g;

const clamp01 = x => Math.max(0, Math.min(1, x));
const seg = (t, a, b) => clamp01((t - a) / (b - a));
const eio = x => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const eo = x => 1 - Math.pow(1 - x, 3);
const eob = x => (x <= 0 ? 0 : x >= 1 ? 1 : 1 + 2.4 * Math.pow(x - 1, 3) + 1.4 * Math.pow(x - 1, 2));
const lerp = (a, b, k) => a + (b - a) * k;
let seed = 7;
const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

const stage = document.getElementById('stage');
stage.style.width = W + 'px'; stage.style.height = H + 'px';
const el = (tag, cls, parent = stage, html = '') => {
  const e = document.createElement(tag); if (cls) e.className = cls; if (html) e.innerHTML = html; parent.appendChild(e); return e;
};
const UNITLESS = new Set(['opacity', 'zIndex', 'fontWeight', 'lineHeight']);
const css = (e, o) => { for (const k in o) e.style[k] = typeof o[k] === 'number' && !UNITLESS.has(k) ? o[k] + 'px' : o[k]; return e; };
const words = text => text.split(' ').map(w => {
  const a = w.startsWith('*') || w.endsWith('*'); w = w.replace(/\*/g, '');
  return `<span class="mw"><span class="${a ? 'acc' : ''}">${w}</span></span>`;
}).join(' ');
const accWords = text => {
  let on = false;
  return text.split(' ').map(w => {
    if (w.startsWith('*')) on = true;
    const a = on; if (w.endsWith('*')) on = false;
    return `<span class="mw"><span class="${a ? 'acc' : ''}">${w.replace(/\*/g, '')}</span></span>`;
  }).join(' ');
};
const animWords = (box, u, t0, dt = 0.07) => box.querySelectorAll('.mw > span').forEach((w, i) => {
  w.style.transform = `translateY(${(1 - eo(seg(u, t0 + i * dt, t0 + 0.5 + i * dt))) * 110}%)`;
});
const shot = n => (n.startsWith('ai-') ? `../assets/renders/${n}.jpg` : `assets/shots/${n}.jpg`);

el('style', '', document.head, `
.sc { position:absolute; inset:0; overflow:hidden; will-change:opacity, transform; }
.pchip { display:inline-flex; align-items:center; gap:14px; font-weight:800; color:var(--accent); letter-spacing:.12em; font-size:26px; direction:rtl; }
.pchip b { background:var(--accent); color:var(--navy); border-radius:10px; padding:3px 13px; font-weight:900; letter-spacing:0; }
.ptitle { font-weight:900; line-height:1.06; letter-spacing:-.015em; color:#fff; }
.psub { color:var(--muted); font-weight:400; line-height:1.35; }
.cap { position:absolute; left:50%; bottom:26px; transform:translateX(-50%); text-align:center; direction:rtl; white-space:nowrap;
  font:700 31px/1.3 Heebo; color:#fff; background:rgba(7,18,36,.8); padding:10px 28px; border-radius:14px;
  border:1px solid rgba(0,212,255,.25); z-index:30; }
.hud { position:absolute; left:64px; top:40px; height:40px; z-index:25; }
.fw { position:absolute; background:#2a2e35; border-radius:10px; overflow:hidden; border:1px solid #454b55;
  box-shadow:0 24px 60px rgba(0,0,0,.6); color:#c9ced6; font-family:Heebo; }
.fw .tb { height:30px; background:#1c1f25; display:flex; align-items:center; gap:7px; padding:0 10px; direction:ltr; }
.fw .tb i { width:10px; height:10px; border-radius:50%; background:#4a505a; }
.fw .tb span { margin-left:auto; font:700 13px Heebo; color:#6f7682; letter-spacing:.06em; }
.fw .bd { position:absolute; left:0; right:0; top:30px; bottom:0; padding:18px; direction:rtl; }
.spin { width:46px; height:46px; border-radius:50%; border:5px solid #444a54; border-top-color:#ff6b6b; }
.pbar { height:12px; border-radius:6px; background:#1c1f25; overflow:hidden; }
.pbar > div { height:100%; background:#ff6b6b; transform-origin:right center; }
.icons { display:grid; grid-template-columns:repeat(8, 1fr); gap:7px; }
.icons i { height:26px; border-radius:5px; background:#3a3f48; border:1px solid #4a505a; }
.gcard { position:absolute; border-radius:20px; overflow:hidden; background:#eef1f5;
  box-shadow:0 24px 50px rgba(0,0,0,.45), 0 0 0 1.5px rgba(125,234,255,.18); }
.gcard img { position:absolute; left:0; top:0; width:100%; height:auto; transform-origin:50% 50%; }
.gcard .lb { position:absolute; right:14px; bottom:14px; background:rgba(7,18,36,.9); color:#fff; font:800 25px Heebo;
  padding:6px 16px; border-radius:10px; border:1.5px solid rgba(0,212,255,.5); direction:rtl; }
.frame { position:absolute; border-radius:22px; overflow:hidden; background:#0c1d36;
  box-shadow:0 40px 90px rgba(0,0,0,.55), 0 0 0 1.5px rgba(125,234,255,.25), 0 0 60px rgba(0,212,255,.12); }
.frame img { position:absolute; left:0; top:0; transform-origin:0 0; display:block; }
.tagpill { position:absolute; top:20px; right:20px; padding:9px 20px; border-radius:999px; background:rgba(7,18,36,.86);
  border:1.5px solid rgba(0,212,255,.6); color:#fff; font:800 24px Heebo; z-index:3; direction:rtl; white-space:nowrap; }
.tagpill b { color:var(--accent); }
.dcard { position:absolute; border-radius:24px; background:linear-gradient(170deg, rgba(20,44,78,.95), rgba(9,22,42,.95));
  border:1.5px solid rgba(125,234,255,.22); box-shadow:0 30px 70px rgba(0,0,0,.5); direction:rtl; color:#fff; overflow:hidden; }
.dcard .dh { position:absolute; top:30px; right:32px; left:32px; display:flex; align-items:center; gap:14px; font:800 32px Heebo; }
.dcard .dh i { font-style:normal; width:52px; height:52px; border-radius:14px; background:rgba(0,212,255,.15); border:1.5px solid rgba(0,212,255,.5);
  display:flex; align-items:center; justify-content:center; color:var(--accent); font:900 28px Heebo; }
.drow { position:absolute; right:32px; left:32px; height:56px; border-bottom:1px solid rgba(125,234,255,.14); display:flex; align-items:center;
  justify-content:space-between; font:700 26px Heebo; color:#dbe6f1; }
.drow b { color:var(--accent); font-weight:900; }
.big { position:absolute; right:32px; left:32px; top:120px; font:900 92px Heebo; color:#fff; direction:ltr; text-align:right; font-variant-numeric:tabular-nums; }
.demo { position:absolute; top:132px; left:32px; font:700 18px Heebo; color:var(--muted); border:1px solid rgba(159,179,200,.4); border-radius:8px; padding:2px 10px; }
.ok { position:absolute; left:50%; padding:10px 26px; border-radius:999px; background:#16c47f; color:#04240f; font:900 28px Heebo; white-space:nowrap;
  box-shadow:0 0 30px rgba(22,196,127,.6); direction:rtl; }
.phone { position:absolute; width:236px; height:420px; border-radius:36px; background:#0a1426; border:3px solid #36506f; box-shadow:0 20px 50px rgba(0,0,0,.5); overflow:hidden; }
.phone .scr { position:absolute; inset:12px; border-radius:26px; background:#f4f6f9; overflow:hidden; }
.ln { position:absolute; right:20px; height:10px; border-radius:5px; background:#d6dde6; }
.ccol { position:absolute; border-radius:26px; direction:rtl; }
.crow { position:absolute; left:40px; right:40px; height:96px; display:flex; align-items:center; gap:22px; font:800 40px Heebo; white-space:nowrap; }
.crow .mk { flex:none; width:58px; height:58px; border-radius:50%; display:flex; align-items:center; justify-content:center; font:900 34px Heebo; }
.crow .st { position:absolute; right:110px; height:4px; top:50%; background:#ff6b6b; transform-origin:right center; }
.vs { position:absolute; left:50%; top:50%; width:110px; height:110px; margin:-55px 0 0 -55px; border-radius:50%; background:var(--navy);
  border:2px solid rgba(125,234,255,.4); display:flex; align-items:center; justify-content:center; font:900 40px Heebo; color:#fff; z-index:2; }
.sweep { position:absolute; top:-20%; height:140%; width:260px; z-index:40; pointer-events:none; transform:skewX(-18deg);
  background:linear-gradient(90deg, transparent, rgba(125,234,255,.18), rgba(255,255,255,.55), rgba(125,234,255,.18), transparent); }
.flashw { position:absolute; inset:0; background:#fff; z-index:41; pointer-events:none; }
`);

/* ───────────── shared pieces ───────────── */
function tblock(root, s, o) {
  const b = css(el('div', '', root), { position: 'absolute', left: o.x, top: o.y, width: o.w, textAlign: o.align || 'right', direction: 'rtl', zIndex: 5 });
  const chip = s.chip ? el('div', 'pchip', b, `<b>${s.chip}</b>${o.kick || ''}`) : null;
  const tt = css(el('div', 'ptitle', b, accWords(s.title || '')), { fontSize: o.fs || 84, marginTop: chip ? 16 : 0 });
  const sb = s.sub && o.sub !== false ? css(el('div', 'psub', b, s.sub), { fontSize: o.subFs || 34, marginTop: 20 }) : null;
  return { box: b, upd(u) {
    if (chip) css(chip, { opacity: seg(u, 0.1, 0.4), transform: `translateX(${(1 - eo(seg(u, 0.1, 0.5))) * 30}px)` });
    animWords(tt, u, 0.18);
    if (sb) { const p = eo(seg(u, 0.55, 1.0)); css(sb, { opacity: p, transform: `translateY(${(1 - p) * 16}px)` }); }
  } };
}
function cover(iw, ih, fw, fh, k = 1, c) {
  const s = Math.max(fw / iw, fh / ih) * k;
  const [cx, cy] = c || [iw / 2, ih / 2];
  const fit = (cc, i, f) => (i * s <= f ? (f - i * s) / 2 : Math.min(0, Math.max(f - i * s, f / 2 - cc * s)));
  return { s, x: fit(cx, iw, fw), y: fit(cy, ih, fh) };
}
const CUES = [];
const cue = (t, type, g = 1) => CUES.push([+t.toFixed(3), type, g]);

/* ───────────── scene types ───────────── */
const T = {};

T.hook = {
  build(s, root) {
    const red = css(el('div', '', root), { position: 'absolute', inset: 0, background: 'radial-gradient(70% 60% at 50% 50%, transparent 40%, rgba(255,60,80,.22) 100%)' });
    const tpl = [
      { x: 120, y: 120, w: 470, h: 250, title: 'RENDER', body: `<div style="display:flex;gap:18px;align-items:center"><div class="spin"></div><div style="font:800 28px Heebo">מרנדר הדמיה…</div></div>
        <div class="pbar" style="margin-top:26px"><div></div></div><div class="eta" style="margin-top:16px;font:700 24px Heebo;color:#9aa1ab;direction:ltr;text-align:right">03:47:12</div>` },
      { x: 1340, y: 96, w: 470, h: 300, title: 'TOOLS', body: `<div class="icons">${'<i></i>'.repeat(48)}</div>` },
      { x: 1290, y: 640, w: 520, h: 260, title: 'ERROR', body: `<div style="font:800 30px Heebo;color:#ffb3b3">התוכנה אינה מגיבה</div>
        <div style="font:600 22px Heebo;margin-top:10px;color:#9aa1ab">ייתכן שהשינויים לא נשמרו.</div>
        <div style="display:flex;gap:12px;margin-top:26px"><span style="background:#3a3f48;padding:8px 22px;border-radius:8px;font:700 20px Heebo">המתן</span><span style="background:#ff6b6b;color:#200;padding:8px 22px;border-radius:8px;font:800 20px Heebo">סגור תוכנה</span></div>` },
      { x: 110, y: 660, w: 500, h: 250, title: 'COURSE', body: `<div style="font:800 28px Heebo">קורס מתחילים</div><div style="font:700 22px Heebo;color:#9aa1ab;margin-top:8px">שיעור 1 מתוך 48 · 40 שעות</div>
        <div class="pbar" style="margin-top:24px"><div style="transform:scaleX(.02)"></div></div>` },
      { x: 640, y: 40, w: 300, h: 170, title: 'LAYERS', body: [1, 2, 3, 4].map(i => `<div style="font:600 18px Heebo;color:#8d949f;direction:ltr;text-align:left">▸ Layer_0${i}_final_v${i + 3}</div>`).join('') },
      { x: 700, y: 770, w: 330, h: 150, title: 'SAVE', body: `<div style="font:800 24px Heebo">שומר קובץ… 2.4GB</div><div class="pbar" style="margin-top:18px"><div class="sv"></div></div>` },
    ];
    s._ = {
      red,
      wins: tpl.map((p, i) => {
        const w = css(el('div', 'fw', root, `<div class="tb"><i></i><i></i><i></i><span>${p.title}</span></div><div class="bd">${p.body}</div>`), { left: p.x, top: p.y, width: p.w, height: p.h });
        return { w, p, at: 0.15 + i * 0.32, ph: rand() * 6, spin: w.querySelector('.spin'), bar: w.querySelector('.pbar > div'), eta: w.querySelector('.eta'), sv: w.querySelector('.sv') };
      }),
      panel: css(el('div', '', root), { position: 'absolute', left: 560, top: 360, width: 800, height: 330, borderRadius: 30, background: 'rgba(7,18,36,.82)', boxShadow: '0 0 80px rgba(7,18,36,.9)', zIndex: 4 }),
      title: css(el('div', 'ptitle', root, `<div>${words(s.l1)}</div><div>${accWords(s.l2)}</div>`), { position: 'absolute', left: 0, right: 0, top: 392, textAlign: 'center', fontSize: 112, zIndex: 5 }),
    };
    s._.title.querySelectorAll('.acc').forEach(a => { a.style.color = '#ff6b6b'; });
    s._.wins.forEach(o => cue(s.t0 + o.at, 'pop', 0.45));
  },
  frame(s, u, t) {
    const { wins, title, panel, red } = s._, end = s.t1 - s.t0, suck = eio(seg(u, end - 0.55, end));
    const shake = seg(u, 1.5, end - 0.6);
    wins.forEach((o, i) => {
      const a = eob(seg(u, o.at, o.at + 0.45));
      const jx = Math.sin(t * 23 + o.ph) * 5 * shake, jy = Math.cos(t * 19 + o.ph) * 4 * shake;
      const cx = 960 - (o.p.x + o.p.w / 2), cy = 540 - (o.p.y + o.p.h / 2);
      css(o.w, { opacity: seg(u, o.at, o.at + 0.2) * (1 - suck * 0.8),
        transform: `translate(${jx + cx * suck}px, ${jy + Math.sin(u * 0.8 + o.ph) * 8 + cy * suck}px) scale(${(0.7 + 0.3 * a) * (1 - suck * 0.9)}) rotate(${(i % 2 ? 1 : -1) * (1.5 + suck * 8)}deg)` });
      if (o.spin) o.spin.style.transform = `rotate(${u * 420}deg)`;
      if (o.bar && o.eta) o.bar.style.transform = `scaleX(${0.08 + 0.29 * seg(u, 0.4, end)})`;
      if (o.eta) { const sec = 13632 - Math.floor(u * 3); o.eta.textContent = `נותרו ${String(Math.floor(sec / 3600)).padStart(2, '0')}:${String(Math.floor(sec / 60) % 60).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`; }
      if (o.sv) o.sv.style.transform = `scaleX(${0.5 + 0.37 * seg(u, 0, end)})`;
    });
    red.style.opacity = 0.4 + 0.6 * shake;
        css(title, { transform: `scale(${1 + 0.04 * seg(u, 0, end) - 0.3 * suck})`, opacity: 1 - suck });
    css(panel, { opacity: 1 - suck, transform: `scale(${1 - 0.3 * suck})` });
  },
};

T.logo = {
  build(s, root) {
    const ring = ['ty1a', 'ty7', 'ty2a', 'ty8', 'ty6a', 'ty3', 'ty4', 'ty5'];
    s._ = {
      orb: ring.map((n, i) => {
        const c = css(el('div', 'gcard', root, `<img src="${shot(n)}">`), { width: 230, height: 170 });
        return { c, a: (i / ring.length) * Math.PI * 2 };
      }),
      glow: css(el('div', '', root), { position: 'absolute', left: 560, top: 240, width: 800, height: 600, borderRadius: '50%', background: 'radial-gradient(closest-side, rgba(0,212,255,.35), transparent)', zIndex: 1 }),
      logo: css(el('img', '', root), { position: 'absolute', width: 820, left: 550, top: 400, zIndex: 3 }),
      line: css(el('div', 'ptitle', root, accWords(s.line)), { position: 'absolute', left: 0, right: 0, top: 590, textAlign: 'center', fontSize: 64, zIndex: 3 }),
    };
    s._.logo.src = 'assets/brand/logo-wide.png';
    cue(s.t0 + 0.05, 'impact', 0.8); cue(s.t0 + 0.2, 'shimmer', 0.6);
  },
  frame(s, u) {
    const { orb, glow, logo, line } = s._;
    const a = eo(seg(u, 0, 0.9));
    css(logo, { opacity: seg(u, 0, 0.4), transform: `scale(${0.82 + 0.18 * a + 0.03 * seg(u, 1, 6)})`, filter: `blur(${(1 - a) * 14}px) drop-shadow(0 0 ${30 * (1 - seg(u, 0.3, 1.4))}px rgba(0,212,255,.9))` });
    css(glow, { opacity: 0.4 + 0.6 * (1 - seg(u, 0.2, 1.6)), transform: `scale(${0.6 + 0.6 * a})` });
    animWords(line, u, 0.7, 0.08);
    orb.forEach((o, i) => {
      const ang = o.a + u * 0.18, rx = 760, ry = 360;
      const x = 960 + Math.cos(ang) * rx * (0.7 + 0.3 * a) - 115, y = 520 + Math.sin(ang) * ry * (0.7 + 0.3 * a) - 85;
      css(o.c, { left: x, top: y, opacity: 0.55 * seg(u, 0.3 + i * 0.06, 0.8 + i * 0.06), transform: `scale(${0.75 + 0.25 * eob(seg(u, 0.3 + i * 0.06, 0.9 + i * 0.06))})`, zIndex: 0 });
    });
  },
};

T.app = {
  build(s, root) {
    const L = s.side === 'left', WW = 1160, VH = Math.round(WW * IH / IW), WH = VH + 44;
    const wx = L ? 90 : W - 90 - WW, wy = Math.round((H - WH) / 2) - 18;
    const win = css(el('div', 'win', root, `<div class="chrome"><i></i><i></i><i></i><div class="url">anycloset3d.com</div></div>`), { left: wx, top: wy, width: WW, height: WH });
    const view = el('div', 'view', win), cam = el('div', 'cam', view);
    const imgs = s.imgs.map(n => { const i = el('img', '', cam); i.src = shot(n); css(i, { width: IW, height: IH, opacity: 0 }); return i; });
    const flash = css(el('div', '', view), { position: 'absolute', inset: 0, background: 'rgba(0,212,255,.25)', opacity: 0, zIndex: 3 });
    const tx = L ? 1320 : 90;
    const tb = tblock(root, s, { x: tx, y: 250, w: 510, fs: 82 });
    let ticks = null, sw = null;
    if (s.ticks) {
      const box = css(el('div', 'chips', tb.box), { position: 'relative', marginTop: 34, gap: '12px', direction: 'rtl', justifyContent: 'flex-start' });
      ticks = s.ticks.map(n => css(el('div', 'chip', box, `<i></i>${n}`), { fontSize: 25, padding: '8px 18px 8px 14px' }));
    }
    if (s.swatches) {
      const box = css(el('div', '', tb.box), { position: 'relative', marginTop: 40, display: 'flex', gap: '16px', direction: 'rtl' });
      sw = s.swatches.map(c => css(el('div', '', box), { width: 62, height: 62, borderRadius: '50%', background: c, border: '3px solid rgba(255,255,255,.25)', boxShadow: '0 8px 20px rgba(0,0,0,.4)' }));
    }
    const n = s.imgs.length, span = s.vd * 0.92;
    s._ = { L, WW, VH, win, cam, imgs, flash, tb, ticks, sw, at: s.imgs.map((_, k) => (k ? s.v0 + span * k / n : -1)) };
    s._.at.forEach(a => { if (a > 0) cue(a, 'click', 0.7); });
  },
  frame(s, u, t) {
    const { L, WW, VH, win, cam, imgs, flash, tb, ticks, sw, at } = s._;
    const e = eo(seg(u, 0, 0.75));
    css(win, { opacity: seg(u, 0, 0.3), transform: `translateX(${(1 - e) * (L ? -90 : 90)}px) scale(${0.94 + 0.06 * e})` });
    const f0 = s.focus[0], f1 = s.focus[1], k = eio(seg(t, s.t0 + 0.4, s.t1));
    const f = [lerp(f0[0], f1[0], k), lerp(f0[1], f1[1], k), Math.exp(lerp(Math.log(f0[2]), Math.log(f1[2]), k))];
    const sc = (WW / IW) * f[2];
    const cx = Math.min(0, Math.max(WW - IW * sc, WW / 2 - f[0] * sc)), cy = Math.min(0, Math.max(VH - IH * sc, VH / 2 - f[1] * sc));
    cam.style.transform = `translate(${cx}px, ${cy}px) scale(${sc})`;
    let cur = 0; at.forEach((a, i) => { if (a > 0 && t >= a) cur = i; });
    imgs.forEach((im, i) => {
      if (i === cur) { im.style.opacity = i ? eio(seg(t, at[i], at[i] + 0.3)) : 1; im.style.zIndex = 2; }
      else if (i === cur - 1) { im.style.opacity = 1; im.style.zIndex = 1; }
      else im.style.opacity = 0;
    });
    flash.style.opacity = cur ? 0.6 * (1 - seg(t, at[cur], at[cur] + 0.35)) : 0;
    tb.upd(u);
    if (ticks) ticks.forEach((c, i) => {
      const on = i === 0 ? t >= s.v0 : t >= at[i];
      c.classList.toggle('on', on);
      css(c, { opacity: seg(u, 0.7 + i * 0.06, 1.0 + i * 0.06), transform: `scale(${on ? 1 + 0.08 * (1 - seg(t, i ? at[i] : s.v0, (i ? at[i] : s.v0) + 0.3)) : 1})` });
    });
    if (sw) sw.forEach((c, i) => {
      const a = eob(seg(u, 0.75 + i * 0.07, 1.15 + i * 0.07));
      const on = i === cur;
      css(c, { transform: `scale(${a * (on ? 1.18 : 1)})`, borderColor: on ? '#00d4ff' : 'rgba(255,255,255,.25)', boxShadow: on ? '0 0 0 4px rgba(0,212,255,.3), 0 0 26px rgba(0,212,255,.8)' : '0 8px 20px rgba(0,0,0,.4)' });
    });
  },
};

T.grid = {
  build(s, root) {
    const tb = tblock(root, s, { x: 0, y: 64, w: W, align: 'center', fs: 78 });
    const cw = 400, ch = 292, gap = 28, x0 = (W - (4 * cw + 3 * gap)) / 2, y0 = 262;
    const span = s.vd * 0.82;
    const cards = s.items.map(([n, label], k) => {
      const col = 3 - (k % 4), row = k >> 2;
      const c = css(el('div', 'gcard', root, `<img src="${shot(n)}"><div class="lb">${label}</div>`), { left: x0 + col * (cw + gap), top: y0 + row * (ch + gap), width: cw, height: ch });
      const img = c.querySelector('img'); css(img, { top: -(cw * 1276 / 1336 - ch) / 2 });
      const at = s.v0 + span * k / s.items.length;
      cue(at, 'pop', 0.6);
      return { c, img, at };
    });
    s._ = { tb, cards };
  },
  frame(s, u, t) {
    s._.tb.upd(u);
    s._.cards.forEach(({ c, img, at }, k) => {
      const a = eob(seg(t, at - 0.15, at + 0.35));
      const glow = 1 - seg(t, at + 0.1, at + 0.9);
      css(c, { opacity: seg(t, at - 0.15, at + 0.05), transform: `translateY(${(1 - a) * 40}px) scale(${0.7 + 0.3 * a})`,
        boxShadow: `0 24px 50px rgba(0,0,0,.45), 0 0 0 ${1.5 + 2 * glow}px rgba(0,212,255,${0.18 + 0.7 * glow}), 0 0 ${40 * glow}px rgba(0,212,255,${0.6 * glow})` });
      img.style.transform = `scale(${1 + 0.07 * seg(t, at, s.t1 + 0.3)})`;
    });
  },
};

T.ai = {
  build(s, root) {
    const tb = tblock(root, s, { x: 0, y: 34, w: W, align: 'center', fs: 76 });
    const B = { x: 290, y: 206, w: 1340, h: 748 };
    const fr = el('div', 'frame', root);
    const a = el('img', '', fr), b = el('img', '', fr);
    a.src = shot(s.from); b.src = shot(s.to);
    const wl = css(el('div', 'wipe', fr), { display: 'none' });
    const t3 = el('div', 'tagpill', fr, 'תלת־ממד מהעורך');
    const tai = el('div', 'tagpill', fr, '<b>✦</b> הדמיה פוטוריאליסטית');
    const cw = 420, chh = 236, gap = 22, x0 = (W - (3 * cw + 2 * gap)) / 2, y0 = 208;
    const cells = [];
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) if (!(r === 1 && c === 1)) cells.push({ x: x0 + c * (cw + gap), y: y0 + r * (chh + gap) });
    const gal = s.gallery.slice(0, 8).map((n, i) => {
      const g = css(el('div', 'frame', root, `<img src="${shot(n)}">`), { left: cells[i].x, top: cells[i].y, width: cw, height: chh });
      g._im = g.querySelector('img');
      return g;
    });
    const CELL = { x: x0 + cw + gap, y: y0 + chh + gap, w: cw, h: chh };
    const w0 = s.v0 + 0.35, w1 = w0 + 1.2, tm = Math.max(w1 + 1.0, s.t1 - 2.1);
    s._ = { tb, B, CELL, fr, a, b, wl, t3, tai, gal, w0, w1, tm };
    cue(w0 - 0.2, 'whoosh', 0.6); cue(w1, 'shimmer', 0.8);
    gal.forEach((_, i) => cue(tm + 0.35 + i * 0.07, 'pop', 0.35));
  },
  frame(s, u, t) {
    const { tb, B, CELL, fr, a, b, wl, t3, tai, gal, w0, w1, tm } = s._;
    tb.upd(u);
    const m = eio(seg(t, tm, tm + 0.8));
    const R = { x: lerp(B.x, CELL.x, m), y: lerp(B.y, CELL.y, m), w: lerp(B.w, CELL.w, m), h: lerp(B.h, CELL.h, m) };
    const e = eo(seg(u, 0, 0.6));
    css(fr, { left: R.x, top: R.y, width: R.w, height: R.h, opacity: seg(u, 0, 0.3), transform: `scale(${0.95 + 0.05 * e})`, zIndex: 3 });
    const z = 1 + 0.05 * seg(t, s.t0, s.t1);
    const qa = cover(1336, 1276, R.w, R.h, 1.128 * z, [572, 649]);
    const qb = cover(1209, 864, R.w, R.h, z, [600, 463]);
    css(a, { width: 1336, height: 1276, transform: `translate(${qa.x}px, ${qa.y}px) scale(${qa.s})` });
    css(b, { width: 1209, height: 864, transform: `translate(${qb.x}px, ${qb.y}px) scale(${qb.s})` });
    const lx = lerp(R.w, 0, eio(seg(t, w0, w1)));
    b.style.clipPath = `inset(0 0 0 ${Math.max(0, (lx - qb.x) / qb.s)}px)`;
    const wk = seg(t, w0, w1);
    css(wl, { display: wk > 0 && wk < 1 ? 'block' : 'none', left: lx });
    t3.style.opacity = (1 - seg(t, w0, w0 + 0.3)) * seg(u, 0.2, 0.5);
    css(tai, { opacity: seg(t, w1 - 0.1, w1 + 0.3) * (1 - m), transform: `scale(${0.9 + 0.1 * eob(seg(t, w1 - 0.1, w1 + 0.4))})` });
    gal.forEach((g, i) => {
      const im = g._im;
      if (!im.dataset.fit && im.naturalWidth) {
        const q = cover(im.naturalWidth, im.naturalHeight, CELL.w, CELL.h);
        css(im, { width: im.naturalWidth * q.s, height: im.naturalHeight * q.s, left: q.x, top: q.y, transform: 'none' }); im.dataset.fit = 1;
      }
      const p = eob(seg(t, tm + 0.3 + i * 0.07, tm + 0.75 + i * 0.07));
      css(g, { opacity: seg(t, tm + 0.3 + i * 0.07, tm + 0.45 + i * 0.07), transform: `scale(${0.6 + 0.4 * p})` });
    });
  },
};

T.deal = {
  build(s, root) {
    const tb = tblock(root, s, { x: 0, y: 34, w: W, align: 'center', fs: 76 });
    const cw = 520, ch = 610, gap = 50, x0 = (W - (3 * cw + 2 * gap)) / 2, y0 = 240;
    const X = k => x0 + (2 - k) * (cw + gap);
    const c0 = css(el('div', 'dcard', root, `<div class="dh"><i>₪</i>מחיר בזמן אמת</div><div class="big">₪ 0</div><div class="demo">דוגמה</div>`), { left: X(0), top: y0, width: cw, height: ch });
    const rows0 = ['גוף וחזיתות', 'ידיות ופרזול', 'התקנה', 'הנחה 10%'].map((r, i) => css(el('div', 'drow', c0, `<span>${r}</span><b>✓</b>`), { top: 270 + i * 70 }));
    const c1 = css(el('div', 'dcard', root, `<div class="dh"><i>✍</i>חתימה דיגיטלית</div>`), { left: X(1), top: y0, width: cw, height: ch });
    const ph = css(el('div', 'phone', c1, `<div class="scr">
      ${[0, 1, 2, 3, 4].map(i => `<div class="ln" style="top:${34 + i * 26}px;width:${[150, 120, 160, 90, 140][i]}px"></div>`).join('')}
      <div style="position:absolute;right:20px;left:20px;top:200px;height:110px;border-radius:12px;border:2px dashed #b8c4d2"></div>
      <svg viewBox="0 0 200 100" style="position:absolute;left:16px;top:205px;width:180px;height:100px"><path class="sig" d="M12 70 C 30 20, 45 20, 48 55 S 70 90, 80 50 S 100 20, 110 60 S 135 80, 145 45 C 150 35, 160 40, 188 52" fill="none" stroke="#1e3a5f" stroke-width="5" stroke-linecap="round"/></svg>
      <div style="position:absolute;right:20px;left:20px;bottom:22px;height:44px;border-radius:12px;background:#1e3a5f"></div></div>`), { left: (cw - 236) / 2, top: 100 });
    const sig = ph.querySelector('.sig');
    const ok1 = css(el('div', 'ok', c1, 'נחתם ✓'), { top: 530 });
    const c2 = css(el('div', 'dcard', root, `<div class="dh"><i>✂</i>רשימת חיתוכים לנגר</div>`), { left: X(2), top: y0, width: cw, height: ch });
    css(el('div', 'drow', c2, '<span>פריט</span><span>מידות</span><span>כמות</span>'), { top: 116, color: 'var(--muted)', fontSize: 22 });
    const rows2 = s.cuts.map((r, i) => css(el('div', 'drow', c2, `<span>${r[0]}</span><span style="direction:ltr">${r[1]}</span><b>${r[2]}</b>`), { top: 180 + i * 64 }));
    const ok2 = css(el('div', 'ok', c2, 'נשלח לייצור ✓'), { top: 530 });
    const at = [0, 1, 2].map(k => s.v0 - 0.1 + k * s.vd * 0.3);
    s._ = { tb, cards: [c0, c1, c2], rows0, big: c0.querySelector('.big'), sig, ok1, rows2, ok2, at };
    at.forEach(a => cue(a, 'whoosh', 0.35));
    cue(at[0] + 0.3, 'counter', 0.5); cue(at[1] + 1.25, 'stamp', 0.7); cue(at[2] + 1.2, 'ding', 0.6);
  },
  frame(s, u, t) {
    const { tb, cards, rows0, big, sig, ok1, rows2, ok2, at } = s._;
    tb.upd(u);
    cards.forEach((c, k) => { const a = eob(seg(t, at[k], at[k] + 0.5)); css(c, { opacity: seg(t, at[k], at[k] + 0.2), transform: `translateY(${(1 - a) * 60}px) scale(${0.9 + 0.1 * a})` }); });
    const n = Math.round(s.price * eo(seg(t, at[0] + 0.3, at[0] + 1.4)));
    big.textContent = '₪ ' + n.toLocaleString('en-US');
    rows0.forEach((r, i) => css(r, { opacity: seg(t, at[0] + 0.4 + i * 0.18, at[0] + 0.6 + i * 0.18) }));
    const L = 420; sig.style.strokeDasharray = L; sig.style.strokeDashoffset = L * (1 - eio(seg(t, at[1] + 0.35, at[1] + 1.2)));
    const o1 = eob(seg(t, at[1] + 1.2, at[1] + 1.55)); css(ok1, { opacity: seg(t, at[1] + 1.2, at[1] + 1.3), transform: `translateX(-50%) scale(${0.5 + 0.5 * o1}) rotate(-4deg)` });
    rows2.forEach((r, i) => { const p = eo(seg(t, at[2] + 0.3 + i * 0.15, at[2] + 0.6 + i * 0.15)); css(r, { opacity: p, transform: `translateX(${(1 - p) * -40}px)` }); });
    const o2 = eob(seg(t, at[2] + 1.15, at[2] + 1.5)); css(ok2, { opacity: seg(t, at[2] + 1.15, at[2] + 1.25), transform: `translateX(-50%) scale(${0.5 + 0.5 * o2})` });
  },
};

T.live = {
  build(s, root) {
    const tb = tblock(root, s, { x: 0, y: 34, w: W, align: 'center', fs: 76 });
    const R = { x: 284, y: 206, w: 1351, h: 760 };
    const fr = css(el('div', 'frame', root), { left: R.x, top: R.y, width: R.w, height: R.h });
    const a = el('img', '', fr), b = el('img', '', fr);
    a.src = shot(s.img); b.src = shot(s.img2);
    [a, b].forEach(i => css(i, { width: IW, height: IH }));
    const sw = s.v0 + s.vd * 0.5;
    s._ = { tb, R, fr, a, b, sw };
    cue(sw, 'whoosh', 0.4); cue(s.v0 + 0.6, 'notify', 0.5);
  },
  frame(s, u, t) {
    const { tb, R, fr, a, b, sw } = s._;
    tb.upd(u);
    const e = eo(seg(u, 0, 0.6));
    css(fr, { opacity: seg(u, 0, 0.3), transform: `scale(${0.95 + 0.05 * e})` });
    const place = (im, f) => {
      const sc = (R.w / IW) * f[2];
      const x = Math.min(0, Math.max(R.w - IW * sc, R.w / 2 - f[0] * sc)), y = Math.min(0, Math.max(R.h - IH * sc, R.h / 2 - f[1] * sc));
      im.style.transform = `translate(${x}px, ${y}px) scale(${sc})`;
    };
    const k1 = eio(seg(t, s.v0 + 0.8, sw));
    place(a, [lerp(952, 1500, k1), lerp(535, 520, k1), lerp(1, 1.55, k1)]);
    const k2 = seg(t, sw, s.t1 + 0.3);
    place(b, [952, 535, lerp(1.12, 1, eo(k2))]);
    b.style.opacity = eio(seg(t, sw, sw + 0.4));
  },
};

T.compare = {
  build(s, root) {
    const cw = 760, top = 150, hh = 760;
    const right = css(el('div', 'ccol', root), { left: W / 2 + 40, top, width: cw, height: hh, background: 'linear-gradient(170deg, rgba(0,212,255,.14), rgba(12,29,54,.9))', border: '2px solid rgba(0,212,255,.6)', boxShadow: '0 0 60px rgba(0,212,255,.25)' });
    const left = css(el('div', 'ccol', root), { left: W / 2 - 40 - cw, top, width: cw, height: hh, background: 'rgba(30,34,42,.75)', border: '2px solid rgba(160,170,185,.25)' });
    const lg = el('img', '', right); lg.src = 'assets/brand/logo-wide.png'; css(lg, { position: 'absolute', height: 60, right: 40, top: 44 });
    css(el('div', '', left, 'תוכנות כבדות'), { position: 'absolute', right: 40, top: 40, font: '900 52px Heebo', color: '#aeb6c2' });
    const vs = el('div', 'vs', root, 'VS'); css(vs, { top: top + hh / 2 });
    const fr = [0.02, 0.2, 0.4, 0.64];
    const rows = s.rows.map(([bad, good], k) => {
      const y = 170 + k * 140;
      const l = css(el('div', 'crow', left, `<span class="mk" style="background:rgba(255,107,107,.15);color:#ff6b6b;border:2px solid #ff6b6b">✕</span><span>${bad}</span><span class="st"></span>`), { top: y, color: '#c9d0da' });
      const r = css(el('div', 'crow', right, `<span class="mk" style="background:var(--accent);color:var(--navy);box-shadow:0 0 20px rgba(0,212,255,.8)">✓</span><span>${good}</span>`), { top: y, color: '#fff' });
      const st = l.querySelector('.st'); st._txt = l.children[1];
      const at = s.v0 + s.vd * fr[k];
      cue(at, 'tick', 0.5); cue(at + 0.35, 'ding', 0.45);
      return { l, r, st, at };
    });
    s._ = { right, left, vs, rows };
  },
  frame(s, u, t) {
    const { right, left, vs, rows } = s._;
    const e = eo(seg(u, 0, 0.6));
    css(left, { opacity: seg(u, 0, 0.3), transform: `translateX(${(1 - e) * -80}px)` });
    css(right, { opacity: seg(u, 0.1, 0.4), transform: `translateX(${(1 - eo(seg(u, 0.1, 0.7))) * 80}px)` });
    css(vs, { opacity: seg(u, 0.3, 0.5), transform: `scale(${eob(seg(u, 0.3, 0.7))})` });
    rows.forEach(({ l, r, st, at }) => {
      const p = eo(seg(t, at - 0.1, at + 0.3));
      css(l, { opacity: p * (1 - 0.45 * seg(t, at + 0.35, at + 0.7)), transform: `translateX(${(1 - p) * -30}px)` });
      if (!st.dataset.w && st._txt.offsetWidth) { st.style.width = (st._txt.offsetWidth + 16) + 'px'; st.dataset.w = 1; }
      st.style.transform = `scaleX(${eio(seg(t, at + 0.25, at + 0.6))})`;
      const q = eob(seg(t, at + 0.3, at + 0.7));
      css(r, { opacity: seg(t, at + 0.3, at + 0.45), transform: `translateX(${(1 - q) * 30}px) scale(${0.9 + 0.1 * q})` });
    });
  },
};

T.outro = {
  build(s, root) {
    const bg = css(el('div', '', root), { position: 'absolute', inset: -60, backgroundImage: `url(${shot('ai-03')})`, backgroundSize: 'cover', backgroundPosition: 'center', filter: 'blur(16px) brightness(.28) saturate(.8)' });
    const box = css(el('div', '', root), { position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' });
    const logo = el('img', '', box); logo.src = 'assets/brand/logo-wide.png'; css(logo, { width: 640, marginBottom: 54 });
    const t1 = css(el('div', 'ptitle', box, words(s.l1)), { fontSize: 104 });
    const t2 = css(el('div', 'ptitle', box, accWords(s.l2)), { fontSize: 104 });
    const cta = css(el('div', 'cta', box, 'anycloset3d.com'), { fontSize: 40, padding: '18px 58px', marginTop: 60 });
    s._ = { bg, logo, t1, t2, cta };
    cue(s.t0 + 0.05, 'impact', 0.9); cue(s.t0 + 1.4, 'chime', 0.7);
  },
  frame(s, u) {
    const { bg, logo, t1, t2, cta } = s._;
    bg.style.transform = `scale(${1.05 + 0.05 * seg(u, 0, 8)})`;
    const l = eo(seg(u, 0.1, 0.8));
    css(logo, { opacity: l, transform: `scale(${0.9 + 0.1 * l})` });
    animWords(t1, u, 0.5); animWords(t2, u, 0.85);
    const c = eob(seg(u, 1.4, 1.9));
    css(cta, { opacity: seg(u, 1.4, 1.6), transform: `scale(${0.7 + 0.3 * c})` });
  },
};

/* ───────────── timeline + frame ───────────── */
const STEPS = C.STEPS;
const LEAD = 0.26, TAIL = 0.24, X = 0.22;
let VO = [], DURATION = 0;
function buildTimeline() {
  let t = 0;
  STEPS.forEach((s, i) => {
    const d = (VO[i] && VO[i].dur) || s.dur || 4;
    s.vd = d; s.t0 = t; s.v0 = t + (i ? LEAD : 0.4);
    s.t1 = Math.max(t + (s.min || 0), s.v0 + d + (s.tail ?? TAIL));
    t = Math.round(s.t1 * 1000) / 1000; s.t1 = t;
    const text = (s.cap || s.say || '').replace(BRAND_RE, 'AnyCloset3D');
    const parts = text.split(/(?<=[.?!])\s+/).filter(Boolean);
    const total = parts.reduce((a, p) => a + p.length, 0);
    let acc = 0;
    s.subs = parts.map(p => { const a = s.v0 + (acc / total) * d; acc += p.length; return { text: p, t0: a, t1: s.v0 + (acc / total) * d }; });
  });
  return t;
}

const hud = el('img', 'hud'); hud.src = 'assets/brand/logo-wide.png';
const cap = el('div', 'cap');
const sweep = el('div', 'sweep');
const flashw = el('div', 'flashw');
el('div', '', stage).id = 'vig';
const NO_CAP = new Set(['logo', 'outro']), NO_HUD = new Set(['hook', 'logo', 'outro', 'compare']);

function renderFrame(t) {
  STEPS.forEach((s, i) => {
    const vis = t >= s.t0 - (i ? X : 0) && t < s.t1 + (i < STEPS.length - 1 ? X : 99);
    s.root.style.display = vis ? 'block' : 'none';
    if (!vis) return;
    const kin = i ? seg(t, s.t0 - X, s.t0 + X) : 1;
    const kout = i < STEPS.length - 1 ? seg(t, s.t1 - X, s.t1 + X) : 0;
    if (s.type === 'outro') {
      s.root.style.clipPath = `circle(${eio(kin) * 120}% at 50% 50%)`;
      css(s.root, { opacity: 1, transform: 'none', filter: 'none', zIndex: 12 });
    } else {
      const sc = lerp(1.06, 1, eo(kin)) * lerp(1, 0.94, eio(kout));
      const bl = (1 - kin) * 10 + kout * 10;
      css(s.root, { opacity: Math.min(eo(kin), 1 - kout), transform: `scale(${sc})`, filter: bl > 0.2 ? `blur(${bl}px)` : 'none', zIndex: 10 });
    }
    T[s.type].frame(s, t - s.t0, t);
  });
  const s = STEPS.find(q => t < q.t1) || STEPS[STEPS.length - 1];
  const i = STEPS.indexOf(s);
  hud.style.opacity = NO_HUD.has(s.type) ? 0 : seg(t, s.t0, s.t0 + 0.4) * (1 - seg(t, s.t1 - 0.2, s.t1));
  const sn = NO_CAP.has(s.type) ? null : s.subs.find(q => t >= q.t0 - 0.05 && t < q.t1 + 0.2);
  if (sn) { cap.style.display = 'block'; cap.textContent = sn.text; cap.style.opacity = seg(t, sn.t0 - 0.05, sn.t0 + 0.12); }
  else cap.style.display = 'none';
  // light sweep across each cut; white flash out of the hook
  const b = STEPS.slice(1).map(q => q.t0).find(b0 => Math.abs(t - b0) < 0.35);
  if (b !== undefined) css(sweep, { display: 'block', left: lerp(W + 200, -500, seg(t, b - 0.35, b + 0.35)) });
  else sweep.style.display = 'none';
  const hb = STEPS[1].t0;
  flashw.style.opacity = i <= 1 ? Math.max(0, 1 - Math.abs(t - hb) / 0.22) * 0.85 : 0;
}

async function setup() {
  try { VO = await (await fetch(`audio/vo/${C.NAME}/vo.json`)).json(); } catch { VO = []; }
  DURATION = buildTimeline();
  STEPS.forEach(s => { s.root = el('div', 'sc'); T[s.type].build(s, s.root); });
  STEPS.slice(1).forEach(s => cue(s.t0 - 0.1, s.type === 'logo' || s.type === 'outro' ? 'whooshBig' : 'whoosh', s.type === 'logo' ? 0.8 : 0.45));
  const g = STEPS.find(s => s.type === 'logo'), cmp = STEPS.find(s => s.type === 'compare'), out = STEPS.find(s => s.type === 'outro');
  window.__cues = {
    duration: DURATION, video: { name: C.NAME, fps: FPS }, mixer: 'pitch-mix.mjs',
    scenes: STEPS.map(s => ({ type: s.type, t0: s.t0, t1: s.t1 })),
    vo: STEPS.map((s, i) => (VO[i] ? { t: +s.v0.toFixed(3), file: VO[i].file } : null)).filter(Boolean),
    sfx: CUES.sort((a, b) => a[0] - b[0]),
    music: { groove: g ? g.t0 : 0, brk: cmp ? cmp.t0 : DURATION, out: out ? out.t0 : DURATION },
  };
  window.__seek = t => { renderFrame(t); };
  await Promise.all([document.fonts.ready, ...[...document.images].map(i => i.decode().catch(() => console.error('decode failed', i.src)))]);
  renderFrame(0);
  markReady(true);
}
setup();
