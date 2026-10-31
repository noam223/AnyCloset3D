// Dependency-free music + SFX synth → audio/mix.wav (44.1 kHz, 16-bit stereo)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DURATION, BPM, SFX } from '../timing.js';

const SR = 44100;
const N = Math.ceil(SR * DURATION);
const music = [new Float32Array(N), new Float32Array(N)];
const fx = [new Float32Array(N), new Float32Array(N)];
const BEAT = 60 / BPM;
const TAU = Math.PI * 2;

let seed = 1031;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const noise = () => rnd() * 2 - 1;
const hz = m => 440 * Math.pow(2, (m - 69) / 12);

function add(buf, t0, len, fn, gain = 1, pan = 0) {
  const s0 = Math.round(t0 * SR), n = Math.round(len * SR);
  const gl = gain * Math.cos((pan + 1) * Math.PI / 4) * Math.SQRT2;
  const gr = gain * Math.sin((pan + 1) * Math.PI / 4) * Math.SQRT2;
  for (let i = 0; i < n; i++) {
    const k = s0 + i;
    if (k < 0 || k >= N) continue;
    const v = fn(i / SR, i);
    buf[0][k] += v * gl; buf[1][k] += v * gr;
  }
}
const lp = (a) => { let y = 0; return x => (y += a * (x - y)); };
const coef = fc => 1 - Math.exp(-TAU * fc / SR);

/* ── instruments ── */
const kick = (t, g = 1) => { let ph = 0; add(music, t, 0.45, (x) => {
  const f = 45 + 110 * Math.exp(-x * 28); ph += TAU * f / SR;
  return (Math.sin(ph) * Math.exp(-x * 7) + (x < 0.004 ? noise() * 0.4 : 0)) * 0.95;
}, g); };
const clap = (t, g = 1) => { let hp = 0, prev = 0; add(music, t, 0.25, (x) => {
  const n = noise(); hp = 0.85 * (hp + n - prev); prev = n;
  const env = Math.exp(-x * 22) * (x < 0.02 ? 0.6 + 0.4 * Math.sin(x * 900) : 1);
  return hp * env * 0.55 + Math.sin(TAU * 190 * x) * Math.exp(-x * 30) * 0.25;
}, g); };
const hat = (t, g = 1, pan = 0.2) => { let prev = 0; add(music, t, 0.06, (x) => {
  const n = noise(); const v = n - prev; prev = n; return v * Math.exp(-x * 70) * 0.18;
}, g, pan); };
const bass = (t, m, len, g = 1) => { const f = hz(m); const f1 = lp(coef(600)); add(music, t, len, (x) => {
  let v = 0; for (let h = 1; h <= 6; h++) v += Math.sin(TAU * f * h * x) / h;
  const env = Math.min(1, x * 200) * Math.exp(-x * 3.5);
  return f1(v * env) * 0.55;
}, g); };
const pad = (t, notes, len, g = 1, bright = 1400) => { notes.forEach((m, ni) => {
  const f = hz(m); const f1 = lp(coef(bright));
  const det = [-0.11, 0, 0.13].map(c => f * Math.pow(2, c / 12));
  const phs = det.map(() => rnd() * TAU);
  add(music, t, len + 0.6, (x) => {
    let v = 0;
    for (let d = 0; d < 3; d++) for (let h = 1; h <= 7; h++) v += Math.sin(TAU * det[d] * h * x + phs[d] * h) / h;
    const env = Math.min(1, x / 0.35) * (x > len ? Math.exp(-(x - len) * 6) : 1);
    return f1(v) * env * 0.07;
  }, g, (ni - 1) * 0.35);
}); };
const pluck = (t, m, g = 1, pan = 0) => { const f = hz(m); add(music, t, 0.35, (x) => {
  const v = Math.sin(TAU * f * x) + 0.35 * Math.sin(TAU * 2 * f * x) * Math.exp(-x * 20);
  return v * Math.exp(-x * 11) * 0.12;
}, g, pan); };

const CHORDS = [ // Am F C G
  { root: 45, pad: [57, 60, 64], arp: [69, 72, 76, 81] },
  { root: 41, pad: [53, 57, 60], arp: [65, 69, 72, 77] },
  { root: 48, pad: [55, 60, 64], arp: [67, 72, 76, 79] },
  { root: 43, pad: [55, 59, 62], arp: [67, 71, 74, 79] },
];
const chordAt = t => CHORDS[Math.floor(t / (BEAT * 4)) % 4];

/* ── arrangement ── */
// 0–3.3 tension: low drone + ticking pulse
pad(0, [45, 52, 57], 3.3, 0.9, 700);
for (let t = 0; t < 3.3; t += BEAT / 2) { hat(t, 0.5 + 0.3 * (t / 3.3)); bass(t, 33, 0.22, 0.5); }
// 4–6 logo: big chord swell, no drums
pad(4.0, [57, 60, 64, 69], 1.9, 1.2, 1800);
bass(4.0, 33, 1.6, 0.9);
// 6–25 groove
for (let t = 6; t < 25 - 1e-6; t += BEAT) {
  const beatIdx = Math.round(t / BEAT);
  kick(t, 0.95);
  if (beatIdx % 2 === 1) clap(t, 0.7);
}
for (let t = 6; t < 25 - 1e-6; t += BEAT / 2) {
  hat(t + BEAT / 4, 0.9, 0.25); hat(t, 0.45, -0.25);
  bass(t, chordAt(t).root - 12 + (Math.round(t / (BEAT / 2)) % 4 === 3 ? 12 : 0), 0.24, 0.85);
}
for (let t = 6; t < 25 - 1e-6; t += BEAT * 4) pad(t, chordAt(t).pad, BEAT * 4 - 0.05, 1, 1500);
for (let t = 10; t < 25 - 1e-6; t += BEAT / 4) {
  const c = chordAt(t), i = Math.round(t / (BEAT / 4));
  pluck(t, c.arp[[0, 2, 1, 3, 2, 1, 3, 2][i % 8]], 0.85, i % 2 ? 0.4 : -0.4);
}
// 25–26 break: filtered pad only, then silence before the drop
pad(25.0, [57, 60, 64], 0.75, 0.7, 900);
// 26–30 outro: wide resolve
kick(26.0, 1.0);
pad(26.0, [57, 60, 64, 69], 1.95, 1.25, 2200);
pad(28.0, [53, 60, 64, 69], 1.6, 1.25, 1800);
bass(26.0, 33, 1.9, 0.9); bass(28.0, 29, 1.9, 0.9);
for (let t = 26; t < 28 - 1e-6; t += BEAT) kick(t, 0.6);
for (let t = 26; t < 29.5; t += BEAT / 2) pluck(t, [81, 76, 72, 76, 79, 76, 72, 69][Math.round((t - 26) * 4) % 8], 0.55, Math.sin(t * 3) * 0.5);

/* ── SFX ── */
const S = {
  pop: (t, g) => { let ph = 0; add(fx, t, 0.12, x => { ph += TAU * (500 + 900 * Math.min(1, x / 0.03)) / SR; return Math.sin(ph) * Math.exp(-x * 40) * 0.6; }, g, (rnd() - 0.5) * 0.6); },
  notify: (t, g) => { [1046.5, 1568].forEach((f, i) => add(fx, t + i * 0.09, 0.4, x => Math.sin(TAU * f * x) * Math.exp(-x * 12) * 0.4, g)); },
  suck: (t, g) => { const L = 0.58; let y = 0;
    add(fx, t, L, x => { const p = x / L; const a = coef(200 + 5000 * p * p); y += a * (noise() - y); return y * p * p * 0.9; }, g); },
  impact: (t, g) => { let ph = 0, y = 0; add(fx, t, 1.6, x => {
    ph += TAU * (38 + 70 * Math.exp(-x * 14)) / SR;
    y += coef(900) * (noise() - y);
    return Math.sin(ph) * Math.exp(-x * 2.6) * 0.9 + y * Math.exp(-x * 9) * 0.8;
  }, g); },
  whoosh: (t, g, L = 0.45, lo = 400, hi = 3500) => { let y = 0, y2 = 0; add(fx, t - L * 0.5, L, x => {
    const p = x / L; const fc = lo + (hi - lo) * Math.sin(Math.PI * p);
    const a = coef(fc); y += a * (noise() - y); y2 += coef(fc * 0.3) * (y - y2);
    return (y - y2) * Math.pow(Math.sin(Math.PI * p), 2) * 1.6;
  }, g, (rnd() - 0.5) * 0.5); },
  whooshBig: (t, g) => S.whoosh(t, g, 0.7, 150, 2600),
  shimmer: (t, g) => { [2093, 2637, 3136, 4186, 5274].forEach((f, i) => { const ph = rnd() * TAU;
    add(fx, t + i * 0.025, 0.9, x => Math.sin(TAU * f * x + ph) * Math.exp(-x * 5) * (0.6 + 0.4 * Math.sin(TAU * 9 * x)) * 0.11, g, i % 2 ? 0.5 : -0.5); }); },
  draw: (t, g) => { let y = 0, prev = 0; const L = 1.4; add(fx, t, L, x => {
    const n = noise(); const h = n - prev; prev = n; y += coef(4000) * (h - y);
    const stroke = 0.5 + 0.5 * Math.sin(TAU * 3.3 * x) ** 2;
    return y * stroke * Math.min(1, x * 20) * Math.min(1, (L - x) * 8) * 0.5;
  }, g, 0.2); },
  tick: (t, g) => add(fx, t, 0.03, x => Math.sin(TAU * 3200 * x) * Math.exp(-x * 160) * 0.5, g),
  click: (t, g) => { add(fx, t, 0.05, x => (Math.sin(TAU * 1900 * x) * 0.5 + noise() * 0.3) * Math.exp(-x * 110), g); },
  counter: (t, g) => { for (let i = 0; i < 15; i++) { const f = 1400 + i * 70; add(fx, t + i * 0.04, 0.025, x => Math.sin(TAU * f * x) * Math.exp(-x * 180) * 0.4, g); } },
  stamp: (t, g) => { let ph = 0, y = 0; add(fx, t, 0.35, x => {
    ph += TAU * (70 + 90 * Math.exp(-x * 30)) / SR; y += coef(1800) * (noise() - y);
    return Math.sin(ph) * Math.exp(-x * 11) * 0.9 + y * Math.exp(-x * 35) * 0.9;
  }, g); },
  scan: (t, g) => { let ph = 0, y = 0; const L = 1.05; add(fx, t, L, x => {
    const p = x / L; ph += TAU * (260 * Math.pow(9, p)) / SR; y += coef(6000) * (noise() - y);
    return (Math.sin(ph) * 0.25 + y * 0.12) * Math.sin(Math.PI * p) ** 0.6;
  }, g); },
  sparkle: (t, g) => { for (let i = 0; i < 9; i++) { const f = 2600 + rnd() * 3200; const d = rnd() * 0.5;
    add(fx, t + d, 0.3, x => Math.sin(TAU * f * x) * Math.exp(-x * 18) * 0.18, g, rnd() * 1.6 - 0.8); } },
  reverse: (t, g) => { let y = 0; const L = 0.85; add(fx, t, L, x => {
    const p = x / L; y += coef(1500 + 9000 * p) * (noise() - y); return y * Math.pow(p, 3) * 0.9;
  }, g); },
  ding: (t, g) => { [1568, 2352, 3136].forEach((f, i) => add(fx, t, 0.9, x => Math.sin(TAU * f * x) * Math.exp(-x * (5 + i * 3)) * (0.35 / (i + 1)), g)); },
};
for (const [t, type, g] of SFX) {
  if (!S[type]) throw new Error('unknown sfx ' + type);
  S[type](t, g);
}

/* ── mix ── */
// silence before the big moments (lets the impact hit harder)
const gaps = [[3.88, 4.0], [25.85, 26.0]];
const out = [new Float32Array(N), new Float32Array(N)];
const fadeOut = 1.4;
for (let c = 0; c < 2; c++) {
  for (let i = 0; i < N; i++) {
    const t = i / SR;
    let m = music[c][i] * 0.8;
    for (const [a, b] of gaps) if (t >= a && t < b) m *= Math.max(0, Math.min(1, (a + 0.03 - t) / 0.03));
    let v = m + fx[c][i] * 0.75;
    if (t > DURATION - fadeOut) v *= (DURATION - t) / fadeOut;
    out[c][i] = Math.tanh(v * 1.1);
  }
}
let peak = 0;
for (const ch of out) for (const v of ch) peak = Math.max(peak, Math.abs(v));
const target = Math.pow(10, -2.5 / 20);
const norm = target / peak;
const buf = Buffer.alloc(44 + N * 4);
buf.write('RIFF', 0); buf.writeUInt32LE(36 + N * 4, 4); buf.write('WAVE', 8);
buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
buf.write('data', 36); buf.writeUInt32LE(N * 4, 40);
for (let i = 0; i < N; i++) for (let c = 0; c < 2; c++)
  buf.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(out[c][i] * norm * 32767))), 44 + i * 4 + c * 2);
const file = path.join(path.dirname(fileURLToPath(import.meta.url)), 'mix.wav');
fs.writeFileSync(file, buf);
console.log(`wrote ${file}  peak ${(20 * Math.log10(peak * norm)).toFixed(2)} dBFS`);
