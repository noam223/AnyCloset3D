// node audio/pitch-mix.mjs <cues.json> <out.wav> — sales-pitch mix: narration on top of a driving 120 BPM bed.
// Tense filtered intro until cues.music.groove, full groove, a lighter break from cues.music.brk, and a final hit
// at cues.music.out. Music is ducked under speech; SFX follow the visual hits listed in cues.sfx.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cues = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const OUT = process.argv[3];
const DURATION = cues.duration;
const { groove = 0, brk = DURATION, out: OUTRO = DURATION } = cues.music || {};
const SR = 44100, N = Math.ceil(SR * DURATION), TAU = Math.PI * 2;
const music = [new Float32Array(N), new Float32Array(N)];
const drums = [new Float32Array(N), new Float32Array(N)];
const fx = [new Float32Array(N), new Float32Array(N)];
const voice = new Float32Array(N);

let seed = 9137;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const noise = () => rnd() * 2 - 1;
const hz = m => 440 * Math.pow(2, (m - 69) / 12);
const coef = fc => 1 - Math.exp(-TAU * Math.min(fc, SR * 0.45) / SR);
function add(buf, t0, len, fn, gain = 1, pan = 0) {
  const s0 = Math.round(t0 * SR), n = Math.round(len * SR);
  const gl = gain * Math.cos((pan + 1) * Math.PI / 4) * Math.SQRT2, gr = gain * Math.sin((pan + 1) * Math.PI / 4) * Math.SQRT2;
  for (let i = 0; i < n; i++) {
    const k = s0 + i; if (k < 0 || k >= N) continue;
    const v = fn(i / SR); buf[0][k] += v * gl; buf[1][k] += v * gr;
  }
}

/* ── narration ── */
function readWav(file) {
  const b = fs.readFileSync(file);
  let off = 12, fmt = null, data = null;
  while (off + 8 <= b.length) {
    const id = b.toString('ascii', off, off + 4), len = b.readUInt32LE(off + 4);
    if (id === 'fmt ') fmt = { ch: b.readUInt16LE(off + 10), sr: b.readUInt32LE(off + 12), bits: b.readUInt16LE(off + 22) };
    if (id === 'data') data = b.subarray(off + 8, off + 8 + len);
    off += 8 + len + (len % 2);
  }
  if (!fmt || !data || fmt.bits !== 16) throw new Error('unsupported wav ' + file);
  const n = Math.floor(data.length / 2 / fmt.ch), o = new Float32Array(n);
  for (let i = 0; i < n; i++) { let s = 0; for (let c = 0; c < fmt.ch; c++) s += data.readInt16LE((i * fmt.ch + c) * 2); o[i] = s / fmt.ch / 32768; }
  return { sr: fmt.sr, pcm: o };
}
const speech = [];
for (const v of cues.vo || []) {
  const { sr, pcm } = readWav(path.join(ROOT, v.file));
  const s0 = Math.round(v.t * SR), n = Math.floor(pcm.length * SR / sr);
  for (let i = 0; i < n; i++) {
    const k = s0 + i; if (k >= N) break;
    const x = i * sr / SR, j = Math.floor(x), f = x - j;
    voice[k] += (pcm[j] || 0) * (1 - f) + (pcm[j + 1] || 0) * f;
  }
  speech.push([v.t, v.t + n / SR]);
}

/* ── music: 120 BPM, Am – F – C – G, one bar (2 s) per chord ── */
const BEAT = 0.5, BAR = 2;
const CH = [
  { root: 45, pad: [57, 60, 64, 69], arp: [69, 72, 76, 81] },
  { root: 41, pad: [57, 60, 65, 69], arp: [69, 72, 77, 81] },
  { root: 48, pad: [55, 60, 64, 67], arp: [67, 72, 76, 79] },
  { root: 43, pad: [55, 59, 62, 67], arp: [67, 71, 74, 79] },
];
const section = t => (t < groove ? 'intro' : t >= OUTRO ? 'outro' : t >= brk ? 'break' : 'groove');

// pads across the whole piece (filtered darker in the intro)
for (let b = 0; b * BAR < DURATION; b++) {
  const t = b * BAR, c = CH[b % 4], sec = section(t);
  if (sec === 'outro') continue;
  const cut = sec === 'intro' ? 500 : sec === 'break' ? 1400 : 1100;
  c.pad.forEach((m, ni) => {
    const f = hz(m); let y = 0; const det = [-0.07, 0.07].map(d => f * Math.pow(2, d / 12));
    add(music, t, BAR + 0.6, x => {
      let v = 0; for (const d of det) for (let h = 1; h <= 5; h++) v += Math.sin(TAU * d * h * x + h) / (h * 1.3);
      y += coef(cut) * (v - y);
      return y * Math.min(1, x / 0.5) * (x > BAR ? Math.exp(-(x - BAR) * 6) : 1) * 0.018;
    }, 1, (ni / 3 - 0.5) * 0.8);
  });
}
// intro: low drone pulse + clock ticks (tension)
for (let t = 0; t < groove; t += BEAT) {
  const f = hz(33);
  add(music, t, BEAT, x => Math.sin(TAU * f * x) * Math.exp(-x * 5) * 0.22);
  add(drums, t + BEAT / 2, 0.03, x => noise() * Math.exp(-x * 220) * 0.12, 1, 0.3);
}
// riser into the groove
if (groove > 1.5) { let y = 0; add(fx, groove - 1.5, 1.5, x => { y += coef(300 + 5000 * (x / 1.5) ** 2) * (noise() - y); return y * (x / 1.5) ** 2 * 0.5; }); }

// groove + break
for (let b = Math.floor(groove / BAR); b * BAR < OUTRO; b++) {
  const t0 = b * BAR, c = CH[b % 4];
  for (let q = 0; q < 4; q++) {
    const t = t0 + q * BEAT; if (t < groove || t >= OUTRO) continue;
    const sec = section(t), full = sec === 'groove';
    if (full) add(drums, t, 0.4, x => Math.sin(TAU * (48 + 110 * Math.exp(-x * 28)) * x) * Math.exp(-x * 9) * 0.75);
    if (full && q % 2 === 1) add(drums, t, 0.25, x => { const n = noise(); return (n * 0.7 + Math.sin(TAU * 190 * x) * 0.3) * Math.exp(-x * 22) * 0.32; }, 1, 0.05);
    add(drums, t + BEAT / 2, 0.06, x => noise() * Math.exp(-x * 90) * (full ? 0.16 : 0.1), 1, -0.25);
    // bass: eighth notes on the root
    for (const o of [0, BEAT / 2]) {
      const fr = hz(c.root - 12 + (o && q === 3 ? 12 : 0)); let y = 0;
      add(music, t + o, 0.24, x => { const v = (x * fr % 1) * 2 - 1; y += coef(380 + 900 * Math.exp(-x * 18)) * (v - y); return y * Math.min(1, x * 400) * Math.exp(-x * 6) * (full ? 0.2 : 0.12); });
    }
    // pluck arp in sixteenths
    for (let k = 0; k < 4; k++) {
      if (!full && k % 2) continue;
      const m = c.arp[(q * 4 + k + b) % 4] + (k === 3 && q === 3 ? 12 : 0), f = hz(m), tt = t + k * BEAT / 4;
      add(music, tt, 0.5, x => (Math.sin(TAU * f * x) + 0.35 * Math.sin(TAU * f * 2 * x) * Math.exp(-x * 9)) * Math.exp(-x * 7) * Math.min(1, x * 400) * 0.045, 1, k % 2 ? 0.45 : -0.45);
    }
  }
}
// outro: big final chord + sub hit
{
  const c = CH[0], L = DURATION - OUTRO;
  add(drums, OUTRO, 1.2, x => Math.sin(TAU * (40 + 90 * Math.exp(-x * 20)) * x) * Math.exp(-x * 3) * 0.9);
  [...c.pad, c.arp[2] + 12].forEach((m, ni) => {
    const f = hz(m); let y = 0;
    add(music, OUTRO, L, x => {
      let v = 0; for (let h = 1; h <= 6; h++) v += Math.sin(TAU * f * h * x + h) / (h * 1.2);
      y += coef(2200 * Math.exp(-x * 0.4) + 400) * (v - y);
      return y * Math.min(1, x * 30) * Math.exp(-x * 0.55) * 0.03;
    }, 1, (ni / 4 - 0.5) * 0.9);
  });
  add(music, OUTRO, L, x => Math.sin(TAU * hz(33) * x) * Math.exp(-x * 0.9) * 0.18);
}

/* ── SFX ── */
const S = {
  click: (t, g) => add(fx, t, 0.05, x => (Math.sin(TAU * 3200 * x) * 0.5 + noise() * 0.5) * Math.exp(-x * 160), g * 0.45, -0.1),
  tick: (t, g) => add(fx, t, 0.04, x => Math.sin(TAU * 2400 * x) * Math.exp(-x * 200), g * 0.5, 0.15),
  pop: (t, g) => add(fx, t, 0.12, x => Math.sin(TAU * (900 - 500 * x / 0.12) * x) * Math.exp(-x * 40), g * 0.5, (rnd() - 0.5) * 0.6),
  notify: (t, g) => [0, 0.09].forEach((d, i) => add(fx, t + d, 0.4, x => Math.sin(TAU * (i ? 1318.5 : 987.8) * x) * Math.exp(-x * 9), g * 0.35)),
  whoosh: (t, g) => { let y = 0; const L = 0.6; add(fx, t - 0.2, L, x => { const p = x / L; y += coef(300 + 3200 * Math.sin(Math.PI * p)) * (noise() - y); return y * Math.sin(Math.PI * p) ** 2 * 0.9; }, g * 0.55, (rnd() - 0.5) * 0.6); },
  whooshBig: (t, g) => { let y = 0; const L = 1.0; add(fx, t - 0.45, L, x => { const p = x / L; y += coef(200 + 4500 * Math.sin(Math.PI * p)) * (noise() - y); return y * Math.sin(Math.PI * p) ** 2; }, g * 0.6); },
  impact: (t, g) => { add(fx, t, 1.4, x => Math.sin(TAU * (38 + 70 * Math.exp(-x * 14)) * x) * Math.exp(-x * 2.8), g * 0.8); let y = 0; add(fx, t, 0.5, x => { y += coef(1800) * (noise() - y); return y * Math.exp(-x * 9); }, g * 0.5); },
  shimmer: (t, g) => [1568, 2093, 2637, 3136].forEach((f, i) => add(fx, t + i * 0.05, 1.4, x => Math.sin(TAU * f * x) * Math.exp(-x * 3) * Math.min(1, x * 60), g * 0.09, i % 2 ? 0.5 : -0.5)),
  counter: (t, g) => { for (let i = 0; i < 14; i++) S.tick(t + i * 0.075, g * 0.6); },
  stamp: (t, g) => { add(fx, t, 0.3, x => Math.sin(TAU * (90 + 120 * Math.exp(-x * 40)) * x) * Math.exp(-x * 14), g * 0.8); add(fx, t, 0.08, x => noise() * Math.exp(-x * 60), g * 0.4); },
  ding: (t, g) => add(fx, t, 1.2, x => [1, 2.76].reduce((s, k, j) => s + Math.sin(TAU * 1760 * k * x) * Math.exp(-x * (3 + j * 4)) / (1 + j * 3), 0), g * 0.22, 0.2),
  chime: (t, g) => [[880, 1], [1318.5, 0.6], [1760, 0.45]].forEach(([f, a], i) =>
    add(fx, t + i * 0.012, 2.6, x => [1, 2.76, 5.4].reduce((s, k, j) => s + Math.sin(TAU * f * k * x) * Math.exp(-x * (1.6 + j * 2.5)) / (1 + j * 2.5), 0) * a * 0.2, g, i % 2 ? 0.35 : -0.35)),
};
for (const [t, type, g] of cues.sfx || []) if (S[type]) S[type](t, g);

/* ── duck music under speech (smoothed) ── */
const duck = new Float32Array(N).fill(1);
for (const [a, b] of speech) for (let k = Math.max(0, Math.round((a - 0.2) * SR)); k < Math.min(N, Math.round((b + 0.3) * SR)); k++) duck[k] = 0.42;
let d = 1; const att = 1 - Math.exp(-1 / (SR * 0.1));
for (let i = 0; i < N; i++) { d += (duck[i] - d) * att; duck[i] = d; }

const outb = [new Float32Array(N), new Float32Array(N)];
const fade = 1.2;
for (let c = 0; c < 2; c++) for (let i = 0; i < N; i++) {
  const t = i / SR;
  let m = music[c][i] * duck[i] + drums[c][i] * (0.55 + 0.45 * duck[i]) + fx[c][i] * 0.75;
  if (t > DURATION - fade) m *= (DURATION - t) / fade;
  if (t < 0.3) m *= t / 0.3;
  outb[c][i] = Math.tanh(m * 1.3) / 1.3 + voice[i] * 0.95;
}
let peak = 0;
for (const ch of outb) for (const v of ch) peak = Math.max(peak, Math.abs(v));
const norm = Math.pow(10, -1.5 / 20) / Math.max(peak, 1e-6);
const buf = Buffer.alloc(44 + N * 4);
buf.write('RIFF', 0); buf.writeUInt32LE(36 + N * 4, 4); buf.write('WAVE', 8);
buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
buf.write('data', 36); buf.writeUInt32LE(N * 4, 40);
for (let i = 0; i < N; i++) for (let c = 0; c < 2; c++)
  buf.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(outb[c][i] * norm * 32767))), 44 + i * 4 + c * 2);
fs.writeFileSync(OUT, buf);
console.log(`wrote ${OUT}  ${speech.length} narration clips`);
