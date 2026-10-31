import { DURATION, SCENES, T } from './timing.js';

const params = new URLSearchParams(location.search);
const PORTRAIT = params.get('f') === '9x16';
if (PORTRAIT) document.body.classList.add('portrait');
const W = PORTRAIT ? 1080 : 1920;
const H = PORTRAIT ? 1920 : 1080;

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

function rng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(20261031);

const fmt = n => Math.round(n).toLocaleString('en-US');

function rel(el, parent) {
  const a = el.getBoundingClientRect(), b = parent.getBoundingClientRect();
  return { x: a.left - b.left, y: a.top - b.top, w: a.width, h: a.height };
}

async function ready() {
  await document.fonts.ready;
  await Promise.all(['400', '700', '800', '900'].map(w => document.fonts.load(`${w} 40px Heebo`, 'אבג ABC 123')));
  await Promise.all($$('img').map(img => img.decode().catch(() => {})));
}

function build() {
  const tl = gsap.timeline({ paused: true, defaults: { ease: 'power2.out' } });

  const show = (id, a, b) => {
    tl.set(id, { autoAlpha: 1 }, a);
    if (b != null) tl.set(id, { autoAlpha: 0 }, b);
  };
  const titleIn = (scope, at) => {
    tl.from(`${scope} .chip`, { y: 30, autoAlpha: 0, duration: 0.45, ease: 'back.out(2)' }, at);
    tl.from(`${scope} .title .w`, { yPercent: 110, duration: 0.7, ease: 'expo.out', stagger: 0.12 }, at + 0.08);
    if ($(`${scope} .sub`)) tl.from(`${scope} .sub`, { y: 24, autoAlpha: 0, duration: 0.5 }, at + 0.35);
  };

  /* ── background life ── */
  const pbox = $('#particles');
  for (let i = 0; i < 46; i++) {
    const d = document.createElement('div');
    d.className = 'pt';
    const s = 2 + rand() * 5;
    Object.assign(d.style, { width: s + 'px', height: s + 'px', left: rand() * 100 + '%', top: rand() * 100 + '%', opacity: 0.15 + rand() * 0.45 });
    pbox.appendChild(d);
    tl.to(d, { y: -(80 + rand() * 260), x: (rand() - 0.5) * 80, duration: DURATION, ease: 'none' }, 0);
  }
  tl.to('#grid', { y: -240, duration: DURATION, ease: 'none' }, 0);
  tl.fromTo('#bg', { scale: 1 }, { scale: 1.08, duration: DURATION, ease: 'none' }, 0);

  /* ── S1 · problem (0–4) ── */
  gsap.set('#s1', { autoAlpha: 1 });
  tl.set('#s1', { autoAlpha: 0 }, SCENES.problem[1]);
  const cards = $$('#s1 .card');
  cards.forEach(c => gsap.set(c, { rotation: parseFloat(getComputedStyle(c).getPropertyValue('--r')) || 0 }));
  tl.from(cards, {
    scale: 0, autoAlpha: 0, duration: 0.55, ease: 'back.out(1.8)',
    stagger: T.cardStagger, immediateRender: true,
  }, T.cardsIn);
  cards.forEach((c, i) => {
    tl.to(c, { y: `+=${(rand() - 0.5) * 40}`, x: `+=${(rand() - 0.5) * 30}`, duration: 3, ease: 'sine.inOut' }, T.cardsIn + 0.2 + i * 0.05);
  });
  tl.fromTo('#s1 .t1', { scale: 0.96 }, { scale: 1.02, duration: 3.2, ease: 'none' }, 0);
  tl.to(cards, {
    x: (i, el) => W / 2 - (el.offsetLeft + el.offsetWidth / 2),
    y: (i, el) => H / 2 - (el.offsetTop + el.offsetHeight / 2),
    scale: 0, rotation: () => 360 + rand() * 180,
    duration: 0.62, ease: 'power3.in', stagger: 0.025, immediateRender: false,
  }, T.implode);
  tl.to('#s1 .t1', { scale: 0.2, autoAlpha: 0, filter: 'blur(14px)', duration: 0.5, ease: 'power3.in' }, T.implode + 0.2);
  tl.fromTo('#flash', { opacity: 0 }, { opacity: 1, duration: 0.06, ease: 'none', immediateRender: false }, T.flash - 0.06)
    .to('#flash', { opacity: 0, duration: 0.55, ease: 'power2.out' }, T.flash);

  /* ── S2 · logo (4–6) ── */
  show('#s2', SCENES.logo[0], SCENES.logo[1]);
  const logo = '#s2 .logo-wrap';
  gsap.set(logo, { xPercent: 42, clipPath: 'inset(0% 84% 0% 0%)' });
  tl.from(logo, { scale: 0.2, rotation: -25, duration: 0.5, ease: 'back.out(2.2)' }, T.iconIn);
  tl.to(logo, { xPercent: 0, clipPath: 'inset(0% 0% 0% 0%)', duration: 0.6, ease: 'expo.out' }, T.wordIn);
  tl.fromTo('#s2 .sweep', { backgroundPosition: '120% 0' }, { backgroundPosition: '-20% 0', duration: 0.6, ease: 'sine.inOut' }, T.sweep);
  tl.from('#s2 .tag', { y: 30, autoAlpha: 0, duration: 0.45, ease: 'expo.out' }, T.tagIn);
  tl.to(logo, { scale: 14, autoAlpha: 0, transformOrigin: '8% 50%', duration: 0.45, ease: 'power3.in' }, T.zoomThrough);
  tl.to('#s2 .tag', { autoAlpha: 0, y: 40, duration: 0.25, ease: 'power2.in' }, T.zoomThrough);
  tl.to('#grid', { scale: 1.6, duration: 0.45, ease: 'power3.in', yoyo: true, repeat: 1 }, T.zoomThrough);

  /* ── S3 · sketch → 3D (6–10) ── */
  show('#s3', SCENES.sketch[0] - 0.1, SCENES.sketch[1] + 0.05);
  tl.from('#s3 .feat', { scale: 1.35, autoAlpha: 0, duration: 0.45, ease: 'expo.out' }, SCENES.sketch[0] - 0.1);
  titleIn('#s3', SCENES.sketch[0] + 0.05);
  const strokes = $$('#s3 .lines > *');
  strokes.forEach(s => {
    const len = s.getTotalLength ? s.getTotalLength() : 1000;
    gsap.set(s, { strokeDasharray: len, strokeDashoffset: len });
  });
  const drawDur = (T.drawEnd - T.drawStart) * 0.55;
  tl.to(strokes, { strokeDashoffset: 0, duration: drawDur, ease: 'power2.inOut', stagger: (T.drawEnd - T.drawStart - drawDur) / strokes.length }, T.drawStart);
  gsap.set('#s3 .real', { clipPath: 'circle(0% at 45% 55%)' });
  tl.from('#s3 .dimtxt', { autoAlpha: 0, y: 12, duration: 0.3 }, T.dims);
  const dimObj = { v: 0 };
  tl.to(dimObj, { v: 280, duration: 0.5, ease: 'power2.out', onUpdate: () => { $('#s3 .dimv').textContent = Math.round(dimObj.v); } }, T.dims);
  tl.to('#s3 .real', { clipPath: 'circle(85% at 45% 55%)', duration: 0.75, ease: 'expo.inOut' }, T.reveal);
  tl.to(['#s3 .lines', '#s3 .dimtxt'], { autoAlpha: 0, duration: 0.5 }, T.reveal + 0.35);
  tl.fromTo('#s3 .real', { scale: 1.12 }, { scale: 1, duration: SCENES.sketch[1] - T.reveal, ease: 'sine.out', immediateRender: false }, T.reveal);
  tl.fromTo('#s3 .ring', { autoAlpha: 1 }, { autoAlpha: 0, duration: 0.8, immediateRender: false }, T.reveal + 0.3);

  /* ── wipe 3 → 4 (light-bar transition) ── */
  const wipe = (t) => {
    tl.set('#wipe', { autoAlpha: 1, left: '-40%' }, t - 0.2)
      .to('#wipe', { left: '110%', duration: 0.45, ease: 'power2.inOut' }, t - 0.2)
      .set('#wipe', { autoAlpha: 0 }, t + 0.26);
  };
  wipe(SCENES.colors[0]);
  tl.to('#s3 .feat', { x: -120, autoAlpha: 0, duration: 0.25, ease: 'power2.in' }, SCENES.sketch[1] - 0.2);

  /* ── S4 · colors (10–13) ── */
  show('#s4', SCENES.colors[0], SCENES.colors[1] + 0.05);
  tl.from('#s4 .feat', { x: 140, duration: 0.6, ease: 'expo.out' }, SCENES.colors[0]);
  titleIn('#s4', SCENES.colors[0] + 0.05);
  tl.from('#s4 .count', { autoAlpha: 0, y: 30, duration: 0.4 }, T.countFrom - 0.1);
  const cnt = { v: 0 };
  tl.to(cnt, { v: 1651, duration: T.countTo - T.countFrom, ease: 'power2.out', onUpdate: () => { $('#s4 .cnt').textContent = fmt(cnt.v); } }, T.countFrom);
  tl.from('#s4 .swatches', { y: 40, autoAlpha: 0, duration: 0.45, ease: 'back.out(2)' }, SCENES.colors[0] + 0.25);
  const cvs = $$('#s4 .cv').slice(1);
  gsap.set(cvs, { clipPath: 'inset(0% 0% 0% 100%)' });
  const sw = $$('#s4 .sw');
  const swBox = $('#s4 .swatches');
  const selX = i => rel(sw[i], swBox).x - 8;
  const pick = [1, 2, 3, 4];
  gsap.set('#s4 .sel', { left: selX(0) });
  T.swaps.forEach((t, i) => {
    tl.to(cvs[i], { clipPath: 'inset(0% 0% 0% 0%)', duration: 0.4, ease: 'expo.inOut' }, t - 0.12);
    tl.to('#s4 .sel', { left: selX(pick[i]), duration: 0.35, ease: 'back.out(2)' }, t - 0.1);
    tl.fromTo('#s4 .frame', { scale: 1 }, { scale: 1.025, duration: 0.12, yoyo: true, repeat: 1, ease: 'power2.out', immediateRender: false }, t);
  });
  tl.fromTo('#s4 .cv', { scale: 1.06 }, { scale: 1, duration: 3, ease: 'none', immediateRender: false }, SCENES.colors[0]);
  tl.to('#s4 .feat', { scale: 1.15, autoAlpha: 0, filter: 'blur(10px)', duration: 0.25, ease: 'power2.in' }, SCENES.colors[1] - 0.2);

  /* ── S5 · price (13–16) ── */
  show('#s5', SCENES.price[0], SCENES.price[1]);
  tl.from('#s5 .feat', { scale: 0.85, autoAlpha: 0, duration: 0.45, ease: 'expo.out' }, SCENES.price[0]);
  titleIn('#s5', SCENES.price[0] + 0.05);
  tl.from('#s5 .quote', { y: 80, rotationX: 25, autoAlpha: 0, duration: 0.6, ease: 'expo.out', transformPerspective: 1400 }, SCENES.price[0] + 0.05);
  T.items.forEach((t, i) => {
    tl.from(`#s5 .r${i}`, { x: -70, autoAlpha: 0, duration: 0.4, ease: 'back.out(1.8)' }, t - 0.05);
  });
  const tot = { v: 0 };
  tl.to(tot, { v: 19750, duration: T.totalTo - T.totalFrom, ease: 'power3.out', onUpdate: () => { $('#s5 .tot').textContent = '₪' + fmt(tot.v); } }, T.totalFrom);
  tl.from('#s5 .stamp', { scale: 3.2, autoAlpha: 0, duration: 0.18, ease: 'power4.in' }, T.stamp - 0.18);
  tl.to('#s5 .quote', { x: 10, duration: 0.05, yoyo: true, repeat: 3, ease: 'none' }, T.stamp);
  tl.to('#s5 .feat', { scale: 0.94, duration: 0.6, ease: 'power2.in' }, SCENES.price[1] - 0.6);

  /* ── S6 · AI (16–19.5) — hard cut on the beat ── */
  show('#s6', SCENES.ai[0], SCENES.ai[1] + 0.1);
  tl.fromTo('#flash', { opacity: 0.55 }, { opacity: 0, duration: 0.4, immediateRender: false }, T.aiCut);
  tl.fromTo('#s6 .ai-wrap img', { scale: 1.16 }, { scale: 1.04, duration: SCENES.ai[1] - SCENES.ai[0], ease: 'power1.out', immediateRender: false }, T.aiCut);
  titleIn('#s6', T.aiCut + 0.1);
  tl.from('#s6 .lbl-3d', { autoAlpha: 0, y: 20, duration: 0.35 }, T.aiCut + 0.2);
  const scanDur = T.scanEnd - T.scanStart;
  tl.set('#s6 .scan', { autoAlpha: 1 }, T.scanStart);
  tl.fromTo('#s6 .scan', { left: '100%' }, { left: '0%', duration: scanDur, ease: 'sine.inOut', immediateRender: false }, T.scanStart);
  tl.to('#s6 .ai-photo', { clipPath: 'inset(0% 0% 0% 0%)', duration: scanDur, ease: 'sine.inOut' }, T.scanStart);
  tl.to('#s6 .scan', { autoAlpha: 0, duration: 0.2 }, T.scanEnd);
  tl.to('#s6 .lbl-3d', { autoAlpha: 0, duration: 0.2 }, T.scanStart + scanDur * 0.8);
  gsap.set('#s6 .scan', { autoAlpha: 0 });
  const sparks = $('#s6 .sparks');
  for (let i = 0; i < 18; i++) {
    const s = document.createElement('div');
    s.className = 'spark';
    const x = 0.05 + rand() * 0.9;
    Object.assign(s.style, { left: x * 100 + '%', top: (10 + rand() * 80) + '%' });
    sparks.appendChild(s);
    gsap.set(s, { scale: 0, autoAlpha: 0 });
    const at = T.scanStart + scanDur * (1 - x) * 0.95;
    tl.to(s, { scale: 1.4, autoAlpha: 1, duration: 0.15, ease: 'power2.out' }, at)
      .to(s, { scale: 0, autoAlpha: 0, y: -40 - rand() * 40, duration: 0.5, ease: 'power2.in' }, at + 0.15);
  }
  tl.from('#s6 .lbl-ai', { scale: 0.4, autoAlpha: 0, duration: 0.5, ease: 'back.out(2.4)' }, T.aiBadge);
  tl.to('#s6', { xPercent: -35, filter: 'blur(18px)', duration: 0.35, ease: 'power3.in' }, T.whip);

  /* ── S7 · live share (19.5–22.5) — whip-pan in ── */
  show('#s7', SCENES.live[0] - 0.05, SCENES.live[1] + 0.2);
  tl.from('#s7 .feat', { xPercent: 35, filter: 'blur(18px)', duration: 0.4, ease: 'expo.out' }, SCENES.live[0] - 0.05);
  titleIn('#s7', SCENES.live[0] + 0.05);
  const sw7 = $('#s7 .stagewrap');
  const phonePos = rel($('#s7 .phone'), sw7);
  const L = PORTRAIT
    ? { link: [phonePos.x + phonePos.w - 140, phonePos.y + 220], picker: [Math.max(0, phonePos.x - 250), phonePos.y + 470] }
    : { link: [phonePos.x + phonePos.w - 130, phonePos.y + 220], picker: [phonePos.x - 280, phonePos.y + 430] };
  gsap.set('#s7 .linkcard', { left: L.link[0], top: L.link[1] });
  gsap.set('#s7 .picker', { left: L.picker[0], top: L.picker[1] });
  const pk0 = $('#s7 .pk0'), pk1 = $('#s7 .pk1');
  const pickerBox = rel($('#s7 .picker'), sw7);
  const p1 = rel(pk1, $('#s7 .picker'));
  const tip = { x: pickerBox.x + p1.x + p1.w / 2 - 7, y: pickerBox.y + p1.y + p1.h / 2 - 4 };
  gsap.set('#s7 .scr img', { left: '50%', xPercent: -50 });
  gsap.set('#s7 .ph1', { autoAlpha: 0 });
  tl.from('#s7 .phone', { y: 160, rotation: 6, autoAlpha: 0, duration: 0.6, ease: 'back.out(1.5)' }, SCENES.live[0] + 0.05);
  tl.from('#s7 .linkcard', { x: 520, y: -320, rotation: 25, scale: 0.6, autoAlpha: 0, duration: T.linkLand - T.linkFly, ease: 'power3.out' }, T.linkFly);
  tl.to('#s7 .linkcard', { scale: 1.08, duration: 0.1, yoyo: true, repeat: 1 }, T.linkLand);
  tl.from('#s7 .live', { autoAlpha: 0, scale: 0.6, duration: 0.3, ease: 'back.out(2)' }, T.livePulse - 0.1);
  tl.to('#s7 .live i', { scale: 1.6, opacity: 0.4, duration: 0.25, yoyo: true, repeat: 7, ease: 'sine.inOut' }, T.livePulse);
  tl.from('#s7 .picker', { autoAlpha: 0, x: -60, duration: 0.4, ease: 'back.out(1.8)' }, T.linkLand);
  gsap.set('#s7 .cursor', { left: tip.x + 150, top: tip.y + 240, autoAlpha: 0 });
  gsap.set(pk0, { boxShadow: '0 0 0 4px rgba(0,212,255,1), 0 0 22px rgba(0,212,255,.8)' });
  gsap.set(pk1, { boxShadow: '0 0 0 0px rgba(0,212,255,0), 0 0 0px rgba(0,212,255,0)' });
  tl.to('#s7 .cursor', { autoAlpha: 1, duration: 0.15 }, T.pick - 0.4)
    .to('#s7 .cursor', { left: tip.x, top: tip.y, duration: 0.38, ease: 'power3.out' }, T.pick - 0.4)
    .to('#s7 .cursor', { scale: 0.8, duration: 0.08, yoyo: true, repeat: 1 }, T.pick);
  tl.to(pk0, { boxShadow: '0 0 0 0px rgba(0,212,255,0), 0 0 0px rgba(0,212,255,0)', duration: 0.2 }, T.pick)
    .to(pk1, { boxShadow: '0 0 0 4px rgba(0,212,255,1), 0 0 22px rgba(0,212,255,.8)', duration: 0.2 }, T.pick);
  tl.to('#s7 .ph1', { autoAlpha: 1, duration: 0.35, ease: 'sine.inOut' }, T.update);
  tl.to('#s7 .phone', { scale: 1.04, duration: 0.15, yoyo: true, repeat: 1 }, T.update);
  tl.from('#s7 .toast', { y: 60, autoAlpha: 0, duration: 0.4, ease: 'back.out(2)' }, T.toast);
  tl.to('#s7 .cursor', { autoAlpha: 0, duration: 0.2 }, T.toast + 0.3);
  tl.to('#s7 .feat', { yPercent: -100, duration: 0.5, ease: 'expo.inOut' }, SCENES.live[1] - 0.2);

  /* ── S8 · outputs (22.5–26) — vertical push in ── */
  show('#s8', SCENES.outputs[0] - 0.2, SCENES.outputs[1]);
  tl.from('#s8 .feat', { yPercent: 100, duration: 0.5, ease: 'expo.inOut' }, SCENES.outputs[0] - 0.2);
  titleIn('#s8', SCENES.outputs[0] + 0.1);
  const gap = PORTRAIT ? 300 : 330;
  const docs = $$('#s8 .doc');
  const docX = [gap, 0, -gap], docR = [6, -2, -7], docY = [10, -20, 14];
  docs.forEach((d, i) => {
    gsap.set(d, { x: docX[i], y: docY[i], rotation: docR[i], scale: PORTRAIT ? 0.9 : 1 });
    tl.from(d, { y: -900, rotation: docR[i] * 4, autoAlpha: 0, duration: 0.5, ease: 'back.out(1.3)' }, T.docs[i] - 0.3);
    const ok = $('.ok', d);
    tl.from(ok, { scale: 3, autoAlpha: 0, duration: 0.16, ease: 'power4.in' }, T.stamps[i] - 0.16);
    tl.to(d, { y: docY[i] + 8, duration: 0.06, yoyo: true, repeat: 1, ease: 'none' }, T.stamps[i]);
  });
  tl.to(docs, { y: -1100, rotation: (i) => docR[i] * 5, duration: 0.45, ease: 'power3.in', stagger: 0.06 }, T.docsOut);
  tl.to('#s8 .text', { autoAlpha: 0, y: -40, duration: 0.35, ease: 'power2.in' }, T.docsOut + 0.1);

  /* ── S9 · outro (26–30) ── */
  show('#s9', SCENES.outro[0]);
  tl.fromTo('#flash', { opacity: 0.7 }, { opacity: 0, duration: 0.6, immediateRender: false }, SCENES.outro[0]);
  tl.to('#sunrise', { opacity: 1, duration: 1.1, ease: 'sine.out' }, SCENES.outro[0]);
  tl.to('#grid', { opacity: 0.35, duration: 1 }, SCENES.outro[0]);
  tl.from('#s9 .slogan .w', { yPercent: 110, duration: 0.8, ease: 'expo.out', stagger: 0.18 }, T.slogan);
  tl.fromTo('#s9 .slogan', { scale: 1.08 }, { scale: 1, duration: 2.5, ease: 'power2.out', immediateRender: false }, T.slogan);
  tl.fromTo('#s9 .slogan em', { '--u': 0 }, { '--u': 1, duration: 0.5, ease: 'expo.out', immediateRender: false }, T.slogan + 0.75);
  tl.from('#s9 .logo', { y: 40, scale: 0.85, autoAlpha: 0, duration: 0.6, ease: 'expo.out' }, T.logoIn);
  tl.from('#s9 .cta', { scale: 0.4, autoAlpha: 0, duration: 0.55, ease: 'back.out(2.2)' }, T.cta);
  tl.from('#s9 .url', { y: 20, autoAlpha: 0, duration: 0.4 }, T.url);
  [28.5, 29.3].forEach(t => tl.fromTo('#s9 .cta', { '--sh': '-60%' }, { '--sh': '160%', duration: 0.6, ease: 'sine.inOut', immediateRender: false }, t));

  tl.set({}, {}, DURATION);
  return tl;
}

window.__ready = (async () => {
  await ready();
  const tl = build();
  window.__tl = tl;
  window.__seek = t => { tl.seek(t, false); };
  tl.seek(0, false);
  return true;
})();
