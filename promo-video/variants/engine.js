// Data-driven promo engine: builds markup + one paused GSAP timeline + audio cues from content.js.
// Exposes window.__ready (Promise), window.__seek(t), window.__duration, window.__cues.
/* ───────────── setup ───────────── */
const QS = new URLSearchParams(location.search);
const { VIDEO, BRAND, SCENES } = await import(`./${QS.get('c') || 'content'}.js`);
const FORMAT = QS.get('f') || '16x9';
const SIZES = { '16x9': [1920, 1080], '9x16': [1080, 1920], '1x1': [1080, 1080] };
const [W, H] = SIZES[FORMAT] || SIZES['16x9'];
const PORTRAIT = H > W;
const RTL = (BRAND.lang || 'he') === 'he';
document.body.classList.add('f' + FORMAT, 'bg-' + (BRAND.bgPattern || 'grid'));
if (PORTRAIT) document.body.classList.add('portrait');
document.documentElement.lang = BRAND.lang || 'he';
document.documentElement.dir = RTL ? 'rtl' : 'ltr';
const COLORS = { accent: '--accent', accent2: '--accent2', bg1: '--bg1', bg2: '--bg2', bg3: '--bg3', glow: '--glow', sun1: '--sun1', sun2: '--sun2', sun3: '--sun3' };
for (const [k, v] of Object.entries(COLORS)) if (BRAND.colors?.[k]) document.documentElement.style.setProperty(v, BRAND.colors[k]);

const BEAT = 60 / (VIDEO.bpm || 120);
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const fmt = n => Math.round(n).toLocaleString('en-US');
function rng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(VIDEO.seed || 1234);
const rel = (el, parent) => {
  const a = el.getBoundingClientRect(), b = parent.getBoundingClientRect();
  return { x: a.left - b.left, y: a.top - b.top, w: a.width, h: a.height };
};
const lines = (arr, cls = '') => `<span class="${cls}">${[].concat(arr).map(l => `<span class="ln"><span class="w">${l}</span></span>`).join('')}</span>`;
const titleHTML = (s, tag = 'h2', cls = 'title') => s.titlePortrait
  ? `<${tag} class="${cls} lsonly">${lines(s.title)}</${tag}><${tag} class="${cls} ptonly">${lines(s.titlePortrait)}</${tag}>`
  : `<${tag} class="${cls}">${lines(s.title)}</${tag}>`;
const textBlock = s => `<div class="text">
  ${s.chip ? `<div class="chip">${s.num ? `<b>${s.num}</b>` : ''}${s.chip}</div>` : ''}
  ${titleHTML(s)}
  ${s.sub ? `<p class="sub">${s.sub}</p>` : ''}
  ${s.extra || ''}
</div>`;
const dirX = v => (RTL ? -v : v); // "forward" direction follows reading order

/* ───────────── scene types ─────────────
   html(s) → inner markup ; anim(c) → tweens + c.sfx(t, type, gain)
   c = { tl, el, inner, t0, t1, dur, s, sfx }                                  */
const CARD_POS = {
  land: [[4, 6, -8], [77, 7, 7], [76, 62, 4], [30, 80, -3], [36, 6, 3], [3, 62, 5], [60, 66, 8], [60, 23, -6]],
  port: [[5, 4, -8], [64, 6, 7], [40, 69, 4], [8, 86, -3], [30, 22, 3], [6, 63, 5], [64, 78, 8], [52, 57, -6]],
  sq: [[3, 4, -8], [68, 5, 7], [62, 74, 4], [26, 84, -3], [36, 4, 3], [2, 70, 5], [70, 40, 8], [2, 36, -6]],
};
const cardHTML = k => {
  switch (k.kind) {
    case 'bubble': return `<div class="card k-bubble">${k.text}<small>✓✓ ${k.time || '21:04'}</small></div>`;
    case 'sticky': return `<div class="card k-sticky">${k.text}</div>`;
    case 'tag': return `<div class="card k-tag">${k.text}</div>`;
    case 'alert': return `<div class="card k-alert"><i>!</i>${k.text}</div>`;
    case 'calc': return `<div class="card k-calc"><div class="lcd">${k.text || '?'}</div><div class="keys">${'<i></i>'.repeat(12)}</div></div>`;
    case 'img': return `<div class="card k-img"><img src="${k.src}" alt=""></div>`;
    case 'sheet': return `<div class="card k-sheet">${(k.rows || []).map(r => `<div class="r">${r.map(c => `<span class="${c === '?' ? 'q' : ''}">${c}</span>`).join('')}</div>`).join('')}</div>`;
    case 'note': default:
      return `<div class="card k-note">${k.text || ''}<div class="sc"></div><div class="sc" style="width:70%"></div><div class="sc" style="width:85%"></div>${k.x ? `<span class="x">${k.x}</span>` : ''}</div>`;
  }
};

const TYPES = {
  hook: {
    ownExit: true,
    html: s => `${(s.cards || []).map(cardHTML).join('')}${titleHTML(s, 'h1', 't1')}`,
    anim(c) {
      const { tl, el, t0, t1, s } = c;
      const cards = $$('.card', el);
      const pos = CARD_POS[PORTRAIT ? 'port' : W === H ? 'sq' : 'land'];
      cards.forEach((card, i) => {
        const [l, t, r] = pos[i % pos.length];
        Object.assign(card.style, { left: l + '%', top: t + '%' });
        gsap.set(card, { rotation: r });
      });
      const stagger = Math.min(0.16, (t1 - t0 - 1.6) / Math.max(1, cards.length));
      tl.from(cards, { scale: 0, autoAlpha: 0, duration: 0.55, ease: 'back.out(1.8)', stagger }, t0 + 0.1);
      cards.forEach((card, i) => {
        const at = t0 + 0.1 + i * stagger;
        c.sfx(at, card.classList.contains('k-bubble') || card.classList.contains('k-alert') ? 'notify' : 'pop', 0.5);
        tl.to(card, { y: `+=${(rand() - 0.5) * 40}`, x: `+=${(rand() - 0.5) * 30}`, duration: t1 - at - 0.8, ease: 'sine.inOut' }, at + 0.2);
      });
      const title = $$('.t1', el);
      tl.fromTo(title, { scale: 0.96 }, { scale: 1.02, duration: t1 - t0 - 0.6, ease: 'none' }, t0);
      const imp = t1 - 0.7;
      tl.to(cards, {
        x: (i, e) => W / 2 - (e.offsetLeft + e.offsetWidth / 2),
        y: (i, e) => H / 2 - (e.offsetTop + e.offsetHeight / 2),
        scale: 0, rotation: () => 360 + rand() * 180, duration: 0.62, ease: 'power3.in', stagger: 0.025,
      }, imp);
      tl.to(title, { scale: 0.2, autoAlpha: 0, filter: 'blur(14px)', duration: 0.5, ease: 'power3.in' }, imp + 0.2);
      c.sfx(imp, 'suck', 0.8);
    },
  },

  logo: {
    ownExit: true,
    html: s => `<div class="logo-wrap"><img src="${BRAND.logo}" alt=""><div class="sweep"></div></div>${s.tagline ? `<div class="tag">${s.tagline}</div>` : ''}`,
    anim(c) {
      const { tl, el, t0, t1 } = c;
      const img = $('img', el);
      const ar = img.naturalWidth / img.naturalHeight || 4;
      let w = PORTRAIT ? W * 0.86 : W === H ? W * 0.8 : Math.min(1150, W * 0.6);
      let h = w / ar;
      if (h > H * 0.3) { h = H * 0.3; w = h * ar; }
      const wrap = $('.logo-wrap', el);
      Object.assign(wrap.style, { width: w + 'px', height: h + 'px', marginLeft: -w / 2 + 'px', marginTop: -h / 2 + 'px' });
      const sweep = $('.sweep', el);
      sweep.style.webkitMaskImage = sweep.style.maskImage = `url(${BRAND.logo})`;
      const tag = $('.tag', el);
      if (tag) tag.style.top = `calc(46% + ${h / 2 + 40}px)`;
      const r = BRAND.logoIcon?.ratio || 0;
      const left = (BRAND.logoIcon?.side || 'left') === 'left';
      const origin = left ? `${r * 50}% 50%` : `${100 - r * 50}% 50%`;
      if (r > 0) {
        gsap.set(wrap, { xPercent: (left ? 1 : -1) * (50 - r * 50), clipPath: left ? `inset(0% ${(1 - r) * 100}% 0% 0%)` : `inset(0% 0% 0% ${(1 - r) * 100}%)` });
        tl.from(wrap, { scale: 0.2, rotation: -25, duration: 0.5, ease: 'back.out(2.2)' }, t0);
        tl.to(wrap, { xPercent: 0, clipPath: 'inset(0% 0% 0% 0%)', duration: 0.6, ease: 'expo.out' }, t0 + 0.45);
        c.sfx(t0 + 0.45, 'whoosh', 0.55);
      } else {
        tl.from(wrap, { scale: 0.6, autoAlpha: 0, filter: 'blur(12px)', duration: 0.7, ease: 'expo.out' }, t0);
      }
      tl.fromTo(sweep, { backgroundPosition: '120% 0' }, { backgroundPosition: '-20% 0', duration: 0.6, ease: 'sine.inOut' }, t0 + 0.95);
      c.sfx(t0 + 0.95, 'shimmer', 0.5);
      if (tag) tl.from(tag, { y: 30, autoAlpha: 0, duration: 0.45, ease: 'expo.out' }, t0 + 1.05);
      tl.to(wrap, { scale: 14, autoAlpha: 0, transformOrigin: origin, duration: 0.45, ease: 'power3.in' }, t1 - 0.45);
      if (tag) tl.to(tag, { autoAlpha: 0, y: 40, duration: 0.25, ease: 'power2.in' }, t1 - 0.45);
      c.sfx(t1 - 0.45, 'whooshBig', 0.8);
    },
  },

  blueprint: {
    html(s) {
      const [bx, by, bw, bh] = (s.box || [7, 15, 74, 75]).map(v => v / 100);
      const X = 1000 * bx, Y = 625 * by, Wd = 1000 * bw, Hd = 625 * bh;
      const cols = s.columns || 4, cw = Wd / cols;
      const r = rng(77);
      let svg = '';
      if (s.measure) svg += `<line class="dim" x1="${X}" y1="${Y - 26}" x2="${X + Wd}" y2="${Y - 26}"/><line class="dim" x1="${X}" y1="${Y - 38}" x2="${X}" y2="${Y - 14}"/><line class="dim" x1="${X + Wd}" y1="${Y - 38}" x2="${X + Wd}" y2="${Y - 14}"/>`;
      svg += `<rect x="${X}" y="${Y}" width="${Wd}" height="${Hd}" rx="4"/>`;
      for (let i = 1; i < cols; i++) svg += `<line x1="${X + cw * i}" y1="${Y}" x2="${X + cw * i}" y2="${Y + Hd}"/>`;
      for (let i = 0; i < cols; i++) {
        const n = 1 + Math.floor(r() * 3);
        for (let k = 0; k < n; k++) { const yy = Y + Hd * (0.2 + r() * 0.65); svg += `<line x1="${X + cw * i + 10}" y1="${yy}" x2="${X + cw * (i + 1) - 10}" y2="${yy}"/>`; }
      }
      const dim = s.measure ? `<div class="dimtxt" style="left:${bx * 100}%;width:${bw * 100}%;top:${(by * 625 - 64) / 6.25}%"><span class="ltr"><span class="dimv">0</span> ${s.measure.unit || ''}</span></div>` : '';
      return `<div class="feat">${textBlock(s)}<div class="visual"><div class="frame">
        <img class="real" src="${s.image}" alt=""><svg class="lines" viewBox="0 0 1000 625" preserveAspectRatio="none">${svg}</svg>${dim}<div class="ring"></div>
      </div></div></div>`;
    },
    anim(c) {
      const { tl, el, t0, t1, s } = c;
      titleIn(c, t0 + 0.05);
      tl.from($('.frame', el), { scale: 0.9, autoAlpha: 0, duration: 0.5, ease: 'expo.out' }, t0);
      const strokes = $$('.lines > *', el);
      strokes.forEach(st => { const len = st.getTotalLength(); gsap.set(st, { strokeDasharray: len, strokeDashoffset: len }); });
      const d0 = t0 + 0.05, span = 1.4, dd = span * 0.55;
      tl.to(strokes, { strokeDashoffset: 0, duration: dd, ease: 'power2.inOut', stagger: (span - dd) / strokes.length }, d0);
      c.sfx(d0, 'draw', 0.55);
      if (s.measure) {
        tl.from($('.dimtxt', el), { autoAlpha: 0, y: 12, duration: 0.3 }, t0 + 0.9);
        const o = { v: 0 };
        tl.to(o, { v: s.measure.value, duration: 0.5, onUpdate: () => { $('.dimv', el).textContent = Math.round(o.v); } }, t0 + 0.9);
        c.sfx(t0 + 0.9, 'tick', 0.5);
      }
      const rv = t0 + 1.75;
      const real = $('.real', el);
      gsap.set(real, { clipPath: 'circle(0% at 45% 55%)' });
      tl.to(real, { clipPath: 'circle(85% at 45% 55%)', duration: 0.75, ease: 'expo.inOut' }, rv);
      tl.to([$('.lines', el), $('.dimtxt', el)].filter(Boolean), { autoAlpha: 0, duration: 0.5 }, rv + 0.35);
      tl.fromTo(real, { scale: 1.12 }, { scale: 1, duration: t1 - rv, ease: 'sine.out', immediateRender: false }, rv);
      tl.fromTo($('.ring', el), { autoAlpha: 1 }, { autoAlpha: 0, duration: 0.8, immediateRender: false }, rv + 0.3);
      c.sfx(rv, 'whoosh', 0.7); c.sfx(rv + 0.05, 'shimmer', 0.55);
    },
  },

  gallery: {
    html(s) {
      const count = s.counter ? `<div class="count"><b class="cnt">0</b><span>${s.counter.label}</span></div>` : '';
      const sw = s.swatches ? `<div class="swatches"><div class="sel"></div>${s.swatches.map(col => `<i class="sw" style="background:${col}"></i>`).join('')}</div>` : '';
      return `<div class="feat">${textBlock({ ...s, extra: count })}<div class="visual"><div class="vis-in"><div class="frame">
        ${s.images.map((src, i) => `<img class="cv cv${i}" src="${src}" alt="">`).join('')}</div>${sw}</div></div></div>`;
    },
    anim(c) {
      const { tl, el, t0, t1, s } = c;
      titleIn(c, t0 + 0.05);
      tl.from($('.vis-in', el), { y: 60, autoAlpha: 0, duration: 0.5, ease: 'expo.out' }, t0);
      if (s.counter) {
        tl.from($('.count', el), { autoAlpha: 0, y: 30, duration: 0.4 }, t0 + 0.1);
        const o = { v: 0 }, a = t0 + 0.2, b = t1 - 0.8;
        tl.to(o, { v: s.counter.to, duration: b - a, ease: 'power2.out', onUpdate: () => { $('.cnt', el).textContent = (s.counter.prefix || '') + fmt(o.v) + (s.counter.suffix || ''); } }, a);
      }
      const cvs = $$('.cv', el).slice(1);
      gsap.set(cvs, { clipPath: 'inset(0% 0% 0% 100%)' });
      let selX;
      if (s.swatches) {
        const sw = $$('.sw', el), box = $('.swatches', el);
        selX = i => rel(sw[Math.min(i, sw.length - 1)], box).x - 8;
        gsap.set($('.sel', el), { left: selX((s.swatchFor || [])[0] ?? 0) });
        tl.from(box, { y: 40, autoAlpha: 0, duration: 0.45, ease: 'back.out(2)' }, t0 + 0.25);
      }
      const step = Math.min(BEAT, (t1 - t0 - 1.0) / Math.max(1, cvs.length));
      cvs.forEach((img, i) => {
        const t = t0 + 0.5 + i * step;
        tl.to(img, { clipPath: 'inset(0% 0% 0% 0%)', duration: 0.4, ease: 'expo.inOut' }, t - 0.12);
        if (selX) tl.to($('.sel', el), { left: selX((s.swatchFor || [])[i + 1] ?? i + 1), duration: 0.35, ease: 'back.out(2)' }, t - 0.1);
        tl.fromTo($('.frame', el), { scale: 1 }, { scale: 1.025, duration: 0.12, yoyo: true, repeat: 1, immediateRender: false }, t);
        c.sfx(t, 'click', 0.7);
      });
      tl.fromTo($$('.cv', el), { scale: 1.06 }, { scale: 1, duration: t1 - t0, ease: 'none', immediateRender: false }, t0);
    },
  },

  list: {
    html: s => `<div class="feat">${textBlock(s)}<div class="visual"><div class="quote">
      <h3>${s.card?.title || ''}${s.card?.note ? ` <small>${s.card.note}</small>` : ''}</h3>
      ${s.items.map((it, i) => `<div class="row r${i}"><span><i>✓</i>${it.label}</span>${it.value ? `<span class="p">${it.value}</span>` : ''}</div>`).join('')}
      ${s.total ? `<div class="total"><span>${s.total.label}</span><b class="tot">${s.total.prefix || ''}0</b></div>` : ''}
      ${s.stamp ? `<div class="stamp">${s.stamp}</div>` : ''}
    </div></div></div>`,
    anim(c) {
      const { tl, el, t0, t1, s } = c;
      titleIn(c, t0 + 0.05);
      tl.from($('.quote', el), { y: 80, rotationX: 25, autoAlpha: 0, duration: 0.6, ease: 'expo.out', transformPerspective: 1400 }, t0 + 0.05);
      const step = Math.min(0.4, (t1 - t0 - 1.6) / s.items.length);
      let t = t0 + 0.3;
      s.items.forEach((_, i) => {
        t = t0 + 0.3 + i * step;
        tl.from($(`.r${i}`, el), { x: dirX(70), autoAlpha: 0, duration: 0.4, ease: 'back.out(1.8)' }, t - 0.05);
        c.sfx(t, 'pop', 0.6);
      });
      t += 0.25;
      if (s.total) {
        const o = { v: 0 };
        tl.to(o, { v: s.total.value, duration: 0.6, ease: 'power3.out', onUpdate: () => { $('.tot', el).textContent = (s.total.prefix || '') + fmt(o.v) + (s.total.suffix || ''); } }, t);
        c.sfx(t, 'counter', 0.45);
        t += 0.7;
      }
      if (s.stamp) {
        tl.from($('.stamp', el), { scale: 3.2, autoAlpha: 0, duration: 0.18, ease: 'power4.in' }, t - 0.18);
        tl.to($('.quote', el), { x: 10, duration: 0.05, yoyo: true, repeat: 3, ease: 'none' }, t);
        c.sfx(t, 'stamp', 0.95);
      }
    },
  },

  scan: {
    html: s => `<div class="full"><img class="before" src="${s.before}" alt=""><img class="after" src="${s.after}" alt="">
      <div class="scanbar"></div><div class="sparks"></div><div class="shade"></div></div>
      <div class="head">${s.chip ? `<div class="chip">${s.num ? `<b>${s.num}</b>` : ''}${s.chip}</div>` : ''}${titleHTML(s)}</div>
      ${s.labels?.[0] ? `<div class="lbl lbl-a">${s.labels[0]}</div>` : ''}${s.labels?.[1] ? `<div class="lbl lbl-b">${s.labels[1]}</div>` : ''}`,
    anim(c) {
      const { tl, el, t0, t1 } = c;
      tl.fromTo($$('.full img', el), { scale: 1.16 }, { scale: 1.04, duration: t1 - t0, ease: 'power1.out', immediateRender: false }, t0);
      titleIn(c, t0 + 0.1);
      const la = $('.lbl-a', el), lb = $('.lbl-b', el);
      if (la) tl.from(la, { autoAlpha: 0, y: 20, duration: 0.35 }, t0 + 0.2);
      const a = t0 + 0.45, d = 1.0;
      const bar = $('.scanbar', el);
      gsap.set(bar, { autoAlpha: 0 });
      tl.set(bar, { autoAlpha: 1 }, a);
      tl.fromTo(bar, { left: '100%' }, { left: '0%', duration: d, ease: 'sine.inOut', immediateRender: false }, a);
      tl.to($('.after', el), { clipPath: 'inset(0% 0% 0% 0%)', duration: d, ease: 'sine.inOut' }, a);
      tl.to(bar, { autoAlpha: 0, duration: 0.2 }, a + d);
      if (la) tl.to(la, { autoAlpha: 0, duration: 0.2 }, a + d * 0.8);
      c.sfx(a, 'scan', 0.7);
      const box = $('.sparks', el);
      for (let i = 0; i < 18; i++) {
        const sp = document.createElement('div'); sp.className = 'spark';
        const x = 0.05 + rand() * 0.9;
        Object.assign(sp.style, { left: x * 100 + '%', top: 10 + rand() * 80 + '%' });
        box.appendChild(sp); gsap.set(sp, { scale: 0, autoAlpha: 0 });
        const at = a + d * (1 - x) * 0.95;
        tl.to(sp, { scale: 1.4, autoAlpha: 1, duration: 0.15 }, at).to(sp, { scale: 0, autoAlpha: 0, y: -40 - rand() * 40, duration: 0.5, ease: 'power2.in' }, at + 0.15);
      }
      if (lb) tl.from(lb, { scale: 0.4, autoAlpha: 0, duration: 0.5, ease: 'back.out(2.4)' }, a + d);
      c.sfx(a + d, 'sparkle', 0.65);
    },
  },

  device: {
    html: s => `<div class="feat">${textBlock(s)}<div class="visual"><div class="stagewrap">
      <div class="phone"><div class="notch"></div><div class="scr">
        ${s.screens.map((src, i) => `<img class="ph ph${i}" src="${src}" alt="">`).join('')}
        ${s.live !== false ? '<div class="live"><i></i>LIVE</div>' : ''}
        ${s.toast ? `<div class="toast">${s.toast}</div>` : ''}
      </div></div>
      ${s.link ? `<div class="linkcard"><div class="ic">🔗</div><span class="ltr">${s.link}</span></div>` : ''}
      ${s.picker ? `<div class="picker"><p>${s.picker.label}</p><div class="row">${s.picker.colors.map((col, i) => `<i class="pk pk${i}" style="background:${col}"></i>`).join('')}</div></div>` : ''}
      ${s.picker ? '<svg class="cursor" viewBox="0 0 24 24"><path d="M4 2l16 10-7 1.5L16 21l-3 1-3-7.5L4 19z" fill="#fff" stroke="#0b2240" stroke-width="1.5" stroke-linejoin="round"/></svg>' : ''}
    </div></div></div>`,
    anim(c) {
      const { tl, el, t0, s } = c;
      titleIn(c, t0 + 0.05);
      const wrap = $('.stagewrap', el), phone = $('.phone', el);
      const pp = rel(phone, wrap);
      const link = $('.linkcard', el), picker = $('.picker', el);
      if (link) gsap.set(link, { left: pp.x + pp.w - 130, top: pp.y + pp.h * 0.27 });
      if (picker) gsap.set(picker, { left: Math.max(0, pp.x - 280), top: pp.y + pp.h * 0.54 });
      let tip;
      if (picker) {
        const pb = rel(picker, wrap), p1 = rel($('.pk1', el) || $('.pk0', el), picker);
        tip = { x: pb.x + p1.x + p1.w / 2 - 7, y: pb.y + p1.y + p1.h / 2 - 4 };
      }
      gsap.set($$('.ph', el), { left: '50%', xPercent: -50 });
      gsap.set($$('.ph', el).slice(1), { autoAlpha: 0 });
      tl.from(phone, { y: 160, rotation: 6, autoAlpha: 0, duration: 0.6, ease: 'back.out(1.5)' }, t0 + 0.05);
      const lf = t0 + 0.5, ll = t0 + 0.9;
      if (link) {
        tl.from(link, { x: dirX(-520), y: -320, rotation: 25, scale: 0.6, autoAlpha: 0, duration: ll - lf, ease: 'power3.out' }, lf);
        tl.to(link, { scale: 1.08, duration: 0.1, yoyo: true, repeat: 1 }, ll);
        c.sfx(lf, 'whoosh', 0.5); c.sfx(ll, 'notify', 0.7);
      }
      const live = $('.live', el);
      if (live) {
        tl.from(live, { autoAlpha: 0, scale: 0.6, duration: 0.3, ease: 'back.out(2)' }, t0 + 0.9);
        tl.to($('.live i', el), { scale: 1.6, opacity: 0.4, duration: 0.25, yoyo: true, repeat: 7, ease: 'sine.inOut' }, t0 + 1.0);
      }
      const pick = t0 + 1.45, upd = t0 + 1.65, toastT = t0 + 1.8;
      if (picker) {
        const on = '0 0 0 4px var(--accent), 0 0 22px var(--accent)', off = '0 0 0 0px transparent, 0 0 0px transparent';
        const pk0 = $('.pk0', el), pk1 = $('.pk1', el);
        tl.from(picker, { autoAlpha: 0, x: dirX(60), duration: 0.4, ease: 'back.out(1.8)' }, ll);
        gsap.set(pk0, { boxShadow: on }); if (pk1) gsap.set(pk1, { boxShadow: off });
        const cur = $('.cursor', el);
        gsap.set(cur, { left: tip.x + 150, top: tip.y + 240, autoAlpha: 0 });
        tl.to(cur, { autoAlpha: 1, duration: 0.15 }, pick - 0.4)
          .to(cur, { left: tip.x, top: tip.y, duration: 0.38, ease: 'power3.out' }, pick - 0.4)
          .to(cur, { scale: 0.8, duration: 0.08, yoyo: true, repeat: 1 }, pick)
          .to(cur, { autoAlpha: 0, duration: 0.2 }, toastT + 0.3);
        tl.to(pk0, { boxShadow: off, duration: 0.2 }, pick);
        if (pk1) tl.to(pk1, { boxShadow: on, duration: 0.2 }, pick);
        c.sfx(pick, 'click', 0.7);
      }
      const ph1 = $('.ph1', el);
      if (ph1) { tl.to(ph1, { autoAlpha: 1, duration: 0.35, ease: 'sine.inOut' }, upd); c.sfx(upd, 'shimmer', 0.45); }
      tl.to(phone, { scale: 1.04, duration: 0.15, yoyo: true, repeat: 1 }, upd);
      if (s.toast) { tl.from($('.toast', el), { y: 60, autoAlpha: 0, duration: 0.4, ease: 'back.out(2)' }, toastT); c.sfx(toastT, 'ding', 0.55); }
    },
  },

  cards: {
    ownExit: true,
    html: s => `<div class="feat">${textBlock(s)}<div class="visual"><div class="docs">
      ${s.cards.slice(0, 3).map((d, i) => `<div class="doc d${i}${d.dark ? ' dark' : ''}">
        <div class="bar" style="background:${d.color || 'var(--bg1)'}">${d.title}</div>
        <div class="body">${d.image ? `<div class="thumb" style="background-image:url(${d.image})"></div>` : ''}${'<div class="l"></div>'.repeat(d.image ? 3 : 6)}</div>
        <div class="lbl">${d.label || ''}</div><div class="ok">✓</div></div>`).join('')}
    </div></div></div>`,
    anim(c) {
      const { tl, el, t0, t1 } = c;
      titleIn(c, t0 + 0.1);
      const docs = $$('.doc', el);
      const n = docs.length, gap = PORTRAIT ? 300 : W === H ? 290 : 330;
      const xs = docs.map((_, i) => dirX(-(i - (n - 1) / 2) * gap));
      const rs = [6, -2, -7], ys = [10, -20, 14];
      docs.forEach((d, i) => {
        gsap.set(d, { x: xs[i], y: ys[i], rotation: rs[i], scale: PORTRAIT || W === H ? 0.9 : 1 });
        const drop = t0 + 0.1 + i * 0.25, st = t0 + 1.1 + i * 0.5;
        tl.from(d, { y: -900, rotation: rs[i] * 4, autoAlpha: 0, duration: 0.5, ease: 'back.out(1.3)' }, drop - 0.3);
        c.sfx(drop, 'pop', 0.65);
        if (st < t1 - 0.8) {
          tl.from($('.ok', d), { scale: 3, autoAlpha: 0, duration: 0.16, ease: 'power4.in' }, st - 0.16);
          tl.to(d, { y: ys[i] + 8, duration: 0.06, yoyo: true, repeat: 1, ease: 'none' }, st);
          c.sfx(st, 'stamp', 0.85);
        } else gsap.set($('.ok', d), { autoAlpha: 0 });
      });
      tl.to(docs, { y: -1100, rotation: i => rs[i] * 5, duration: 0.45, ease: 'power3.in', stagger: 0.06 }, t1 - 0.6);
      tl.to($('.text', el), { autoAlpha: 0, y: -40, duration: 0.35, ease: 'power2.in' }, t1 - 0.5);
      c.sfx(t1 - 0.6, 'whooshBig', 0.7);
    },
  },

  stat: {
    html: s => `<div class="feat">${textBlock(s)}<div class="visual"><div class="stats">
      ${s.stats.map((st, i) => `<div class="st s${i}"><b class="v">${st.prefix || ''}0${st.suffix || ''}</b><span>${st.label}</span></div>`).join('')}
    </div></div></div>`,
    anim(c) {
      const { tl, el, t0, s } = c;
      titleIn(c, t0 + 0.05);
      s.stats.forEach((st, i) => {
        const at = t0 + 0.4 + i * 0.4, box = $(`.s${i}`, el), o = { v: 0 };
        tl.from(box, { x: dirX(80), autoAlpha: 0, duration: 0.45, ease: 'back.out(1.8)' }, at);
        tl.to(o, { v: st.to, duration: 0.9, ease: 'power3.out', onUpdate: () => { $('.v', box).textContent = (st.prefix || '') + fmt(o.v) + (st.suffix || ''); } }, at + 0.1);
        c.sfx(at, 'pop', 0.6); c.sfx(at + 0.1, 'counter', 0.35);
      });
    },
  },

  image: {
    html: s => `<div class="feat">${textBlock({ ...s, extra: s.bullets ? `<div class="bullets">${s.bullets.map(b => `<span>${b}</span>`).join('')}</div>` : '' })}
      <div class="visual"><div class="frame"><img class="shot" src="${s.image}" alt=""></div></div></div>`,
    anim(c) {
      const { tl, el, t0, t1, s } = c;
      titleIn(c, t0 + 0.05);
      tl.from($('.frame', el), { y: 70, rotationY: dirX(-14), autoAlpha: 0, duration: 0.7, ease: 'expo.out', transformPerspective: 1600 }, t0);
      tl.fromTo($('.shot', el), { scale: 1.14 }, { scale: 1, duration: t1 - t0, ease: 'sine.out', immediateRender: false }, t0);
      (s.bullets || []).forEach((_, i) => {
        const at = t0 + 0.6 + i * 0.4;
        tl.from($$('.bullets span', el)[i], { scale: 0.4, autoAlpha: 0, duration: 0.4, ease: 'back.out(2.2)' }, at);
        c.sfx(at, 'pop', 0.55);
      });
    },
  },

  outro: {
    html: s => `<div class="wrap">${titleHTML(s, 'div', 'slogan')}
      <img class="logo" src="${BRAND.logo}" alt="">${s.cta ? `<div class="cta">${s.cta}</div>` : ''}${s.url || BRAND.url ? `<div class="url ltr">${s.url || BRAND.url}</div>` : ''}</div>`,
    anim(c) {
      const { tl, el, t0, t1 } = c;
      tl.to('#sunrise', { opacity: 1, duration: 1.1, ease: 'sine.out' }, t0);
      tl.to('#grid', { opacity: 0.35, duration: 1 }, t0);
      tl.from($$('.slogan .w', el), { yPercent: 110, duration: 0.8, ease: 'expo.out', stagger: 0.18 }, t0 + 0.05);
      tl.fromTo($$('.slogan', el), { scale: 1.08 }, { scale: 1, duration: 2.5, ease: 'power2.out', immediateRender: false }, t0 + 0.05);
      const ems = $$('.slogan em', el);
      if (ems.length) tl.fromTo(ems, { '--u': 0 }, { '--u': 1, duration: 0.5, ease: 'expo.out', immediateRender: false }, t0 + 0.8);
      tl.from($('.logo', el), { y: 40, scale: 0.85, autoAlpha: 0, duration: 0.6, ease: 'expo.out' }, t0 + 1.3);
      c.sfx(t0 + 1.3, 'shimmer', 0.5);
      const cta = $('.cta', el), url = $('.url', el);
      if (cta) {
        tl.from(cta, { scale: 0.4, autoAlpha: 0, duration: 0.55, ease: 'back.out(2.2)' }, t0 + 1.8);
        c.sfx(t0 + 1.8, 'pop', 0.7);
        for (let t = t0 + 2.5; t < t1 - 0.6; t += 0.8) tl.fromTo(cta, { '--sh': '-60%' }, { '--sh': '160%', duration: 0.6, ease: 'sine.inOut', immediateRender: false }, t);
      }
      if (url) { tl.from(url, { y: 20, autoAlpha: 0, duration: 0.4 }, t0 + 2.1); c.sfx(t0 + 2.1, 'tick', 0.45); }
    },
  },
};

function titleIn(c, at) {
  const { tl, el } = c;
  const chip = $('.chip', el), sub = $('.sub', el), ws = $$('.title .w', el);
  if (chip) tl.from(chip, { y: 30, autoAlpha: 0, duration: 0.45, ease: 'back.out(2)' }, at);
  if (ws.length) tl.from(ws, { yPercent: 110, duration: 0.7, ease: 'expo.out', stagger: 0.12 }, at + 0.08);
  if (sub) tl.from(sub, { y: 24, autoAlpha: 0, duration: 0.5 }, at + 0.35);
}

/* ───────────── transitions (prev → next at time t) ───────────── */
const LEAD = { flash: 0, cut: 0, zoom: 0.1, wipe: 0, blur: 0, whip: 0.05, push: 0.2 };
const TRANS = {
  flash({ tl, prev, next, t, sfx }) {
    tl.set(prev, { autoAlpha: 0 }, t);
    tl.fromTo('#flash', { opacity: 0 }, { opacity: 1, duration: 0.06, ease: 'none', immediateRender: false }, t - 0.06)
      .to('#flash', { opacity: 0, duration: 0.55 }, t);
    sfx(t, 'impact', 1.0);
  },
  cut({ tl, prev, next, t, sfx }) {
    tl.set(prev, { autoAlpha: 0 }, t);
    tl.fromTo('#flash', { opacity: 0.55 }, { opacity: 0, duration: 0.4, immediateRender: false }, t);
    sfx(t, 'impact', 1.0);
  },
  zoom({ tl, prev, next, t, sfx, prevOwn }) {
    if (!prevOwn) tl.to(prev, { scale: 1.4, autoAlpha: 0, duration: 0.45, ease: 'power3.in' }, t - 0.45);
    tl.from(next, { scale: 1.35, autoAlpha: 0, duration: 0.45, ease: 'expo.out' }, t - 0.1);
    tl.to('#grid', { scale: 1.6, duration: 0.45, ease: 'power3.in', yoyo: true, repeat: 1 }, t - 0.45);
    if (!prevOwn) sfx(t - 0.45, 'whooshBig', 0.8);
  },
  wipe({ tl, prev, next, t, sfx, prevOwn }) {
    tl.set('#wipe', { autoAlpha: 1, left: '-40%' }, t - 0.2)
      .to('#wipe', { left: '110%', duration: 0.45, ease: 'power2.inOut' }, t - 0.2)
      .set('#wipe', { autoAlpha: 0 }, t + 0.26);
    if (!prevOwn) tl.to(prev, { x: dirX(120), autoAlpha: 0, duration: 0.25, ease: 'power2.in' }, t - 0.2);
    tl.from(next, { x: dirX(-140), duration: 0.6, ease: 'expo.out' }, t);
    sfx(t - 0.1, 'whoosh', 0.7);
  },
  blur({ tl, prev, next, t, sfx, prevOwn }) {
    if (!prevOwn) tl.to(prev, { scale: 1.15, autoAlpha: 0, filter: 'blur(10px)', duration: 0.25, ease: 'power2.in' }, t - 0.2);
    tl.from(next, { scale: 0.85, autoAlpha: 0, duration: 0.45, ease: 'expo.out' }, t);
    sfx(t - 0.1, 'whoosh', 0.6);
  },
  whip({ tl, prev, next, t, sfx, prevOwn }) {
    if (!prevOwn) tl.to(prev, { xPercent: dirX(35), filter: 'blur(18px)', autoAlpha: 0, duration: 0.35, ease: 'power3.in' }, t - 0.35);
    tl.from(next, { xPercent: dirX(-35), filter: 'blur(18px)', autoAlpha: 0, duration: 0.4, ease: 'expo.out' }, t - 0.05);
    sfx(t - 0.35, 'whooshBig', 0.8);
  },
  push({ tl, prev, next, t, sfx, prevOwn }) {
    if (!prevOwn) tl.to(prev, { yPercent: -100, duration: 0.5, ease: 'expo.inOut' }, t - 0.2);
    tl.from(next, { yPercent: 100, duration: 0.5, ease: 'expo.inOut' }, t - 0.2);
    sfx(t - 0.2, 'whoosh', 0.6);
  },
};
const AUTO_TRANS = ['wipe', 'blur', 'whip', 'push'];

/* ───────────── build ───────────── */
async function ready() {
  await document.fonts.ready;
  await Promise.all(['400', '700', '800', '900'].map(w => document.fonts.load(`${w} 40px Heebo`, 'אבג ABC 123')));
  await Promise.all($$('img').map(img => img.decode().catch(() => console.warn('image failed: ' + img.src))));
}

function build() {
  const tl = gsap.timeline({ paused: true, defaults: { ease: 'power2.out' } });
  const sfxList = [];
  const sfx = (t, type, g = 0.6) => sfxList.push([+t.toFixed(3), type, g]);

  let t = 0;
  const plan = SCENES.map((s, i) => {
    if (!TYPES[s.type]) throw new Error(`unknown scene type "${s.type}"`);
    const p = { s, i, t0: t, t1: t + s.dur };
    t += s.dur;
    return p;
  });
  const DURATION = t;

  // background life
  const pbox = $('#particles');
  for (let i = 0; i < 46; i++) {
    const d = document.createElement('div'); d.className = 'pt';
    const sz = 2 + rand() * 5;
    Object.assign(d.style, { width: sz + 'px', height: sz + 'px', left: rand() * 100 + '%', top: rand() * 100 + '%', opacity: 0.15 + rand() * 0.45 });
    pbox.appendChild(d);
    tl.to(d, { y: -(80 + rand() * 260), x: (rand() - 0.5) * 80, duration: DURATION, ease: 'none' }, 0);
  }
  tl.to('#grid', { y: -240, duration: DURATION, ease: 'none' }, 0);
  tl.fromTo('#bg', { scale: 1 }, { scale: 1.08, duration: DURATION, ease: 'none' }, 0);

  // markup
  const host = $('#scenes');
  plan.forEach(p => {
    const sec = document.createElement('section');
    sec.className = `scene t-${p.s.type}`;
    sec.innerHTML = `<div class="inner">${TYPES[p.s.type].html(p.s)}</div>`;
    host.appendChild(sec);
    p.el = sec; p.inner = $('.inner', sec);
  });
  return { tl, plan, sfx, sfxList, DURATION };
}

function animate({ tl, plan, sfx, sfxList, DURATION }) {
  let auto = 0;
  plan.forEach((p, i) => {
    const prev = plan[i - 1];
    let tr = p.s.in;
    if (!tr && prev) {
      if (prev.s.type === 'hook' || p.s.type === 'outro') tr = 'flash';
      else if (prev.s.type === 'logo') tr = 'zoom';
      else if (p.s.type === 'scan') tr = 'cut';
      else tr = AUTO_TRANS[auto++ % AUTO_TRANS.length];
    }
    p.tr = tr;
    const lead = prev ? LEAD[tr] ?? 0 : 0;
    if (p.t0 === 0) gsap.set(p.el, { autoAlpha: 1 });
    else tl.set(p.el, { autoAlpha: 1 }, p.t0 - lead);
    if (i < plan.length - 1) tl.set(p.el, { autoAlpha: 0 }, p.t1 + 0.35);
  });
  plan.forEach(p => TYPES[p.s.type].anim({ tl, el: p.el, inner: p.inner, t0: p.t0, t1: p.t1, dur: p.s.dur, s: p.s, sfx }));
  plan.forEach((p, i) => {
    if (!i) return;
    const prev = plan[i - 1];
    if (p.s.type === 'outro') sfx(p.t0 - 1.0, 'reverse', 0.7);
    TRANS[p.tr]({ tl, prev: prev.inner, next: p.inner, t: p.t0, sfx, prevOwn: !!TYPES[prev.s.type].ownExit });
  });
  tl.set({}, {}, DURATION);

  // music map for audio/synth.mjs
  const find = type => plan.find(p => p.s.type === type);
  const hook = find('hook'), logo = find('logo'), outro = [...plan].reverse().find(p => p.s.type === 'outro');
  const firstFeat = plan.find(p => !['hook', 'logo', 'outro'].includes(p.s.type));
  const grooveEnd = outro ? outro.t0 - 1 : DURATION;
  const feats = plan.filter(p => !['hook', 'logo', 'outro'].includes(p.s.type));
  const music = {
    key: VIDEO.music || 'epic',
    tension: hook ? [hook.t0, hook.t1 - 0.7] : null,
    swell: logo ? [logo.t0, logo.t1] : null,
    groove: firstFeat ? [firstFeat.t0, grooveEnd] : null,
    arpFrom: feats[1] ? feats[1].t0 : firstFeat?.t0 ?? 0,
    brk: outro ? [outro.t0 - 1, outro.t0] : null,
    outro: outro ? [outro.t0, DURATION] : null,
    gaps: [hook && [hook.t1 - 0.12, hook.t1], outro && [outro.t0 - 0.15, outro.t0]].filter(Boolean),
  };
  window.__duration = DURATION;
  window.__cues = { video: { name: VIDEO.name || 'promo', fps: VIDEO.fps || 30 }, duration: DURATION, bpm: VIDEO.bpm || 120, sfx: sfxList.sort((a, b) => a[0] - b[0]), music, scenes: plan.map(p => ({ type: p.s.type, t0: p.t0, t1: p.t1, in: p.tr || null })) };
  return tl;
}

window.__ready = (async () => {
  const ctx = build();
  await ready();
  const tl = animate(ctx);
  window.__tl = tl;
  window.__seek = t => { tl.seek(t, false); };
  tl.seek(0, false);
  return true;
})();
