// Dependency-free music + SFX synth. Reads audio/cues.json (written by render.mjs) → audio/mix.wav
// 44.1 kHz 16-bit stereo, normalized to -3.5 dBFS sample peak (true peak after AAC stays under -1 dB).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CUES = process.argv[2] || path.join(HERE, 'cues-content.json');
const OUT = process.argv[3] || path.join(HERE, 'mix-content.wav');
const cues = JSON.parse(fs.readFileSync(CUES, 'utf8'));
const { duration: DURATION, bpm: BPM, sfx: SFX, music: M } = cues;

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
const coef = fc => 1 - Math.exp(-TAU * fc / SR);
const lp = a => { let y = 0; return x => (y += a * (x - y)); };

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

/* ── chord presets (bass root, pad voicing, arp notes) ── */
const PRESETS = {
  epic: [ // Am F C G — driving, cinematic (default)
    { root: 45, pad: [57, 60, 64], arp: [69, 72, 76, 81] },
    { root: 41, pad: [53, 57, 60], arp: [65, 69, 72, 77] },
    { root: 48, pad: [55, 60, 64], arp: [67, 72, 76, 79] },
    { root: 43, pad: [55, 59, 62], arp: [67, 71, 74, 79] },
  ],
  bright: [ // C G Am F — upbeat, friendly
    { root: 48, pad: [55, 60, 64], arp: [72, 76, 79, 84] },
    { root: 43, pad: [55, 59, 62], arp: [71, 74, 79, 83] },
    { root: 45, pad: [57, 60, 64], arp: [69, 72, 76, 81] },
    { root: 41, pad: [53, 57, 60], arp: [69, 72, 77, 81] },
  ],
  warm: [ // Dm Bb F C — calm, premium
    { root: 50, pad: [57, 62, 65], arp: [69, 74, 77, 81] },
    { root: 46, pad: [58, 62, 65], arp: [70, 74, 77, 82] },
    { root: 41, pad: [57, 60, 65], arp: [69, 72, 77, 81] },
    { root: 48, pad: [55, 60, 64], arp: [67, 72, 76, 79] },
  ],
};
const CH = PRESETS[M.key] || PRESETS.epic;
const chordAt = t => CH[Math.floor(t / (BEAT * 4)) % 4];
const tonic = CH[0];

/* ── instruments ── */
const kick = (t, g = 1) => { let ph = 0; add(music, t, 0.45, x => {
  ph += TAU * (45 + 110 * Math.exp(-x * 28)) / SR;
  return (Math.sin(ph) * Math.exp(-x * 7) + (x < 0.004 ? noise() * 0.4 : 0)) * 0.95;
}, g); };
const clap = (t, g = 1) => { let hp = 0, prev = 0; add(music, t, 0.25, x => {
  const n = noise(); hp = 0.85 * (hp + n - prev); prev = n;
  const env = Math.exp(-x * 22) * (x < 0.02 ? 0.6 + 0.4 * Math.sin(x * 900) : 1);
  return hp * env * 0.55 + Math.sin(TAU * 190 * x) * Math.exp(-x * 30) * 0.25;
}, g); };
const hatEnv = (t, g, pan) => { let prev = 0; add(music, t, 0.06, x => { const n = noise(); const v = n - prev; prev = n; return v * Math.exp(-x * 70) * 0.18; }, g, pan); };
const bass = (t, m, len, g = 1) => { const f = hz(m); const f1 = lp(coef(600)); add(music, t, len, x => {
  let v = 0; for (let h = 1; h <= 6; h++) v += Math.sin(TAU * f * h * x) / h;
  return f1(v * Math.min(1, x * 200) * Math.exp(-x * 3.5)) * 0.55;
}, g); };
const pad = (t, notes, len, g = 1, bright = 1400) => notes.forEach((m, ni) => {
  const f = hz(m); const f1 = lp(coef(bright));
  const det = [-0.11, 0, 0.13].map(c => f * Math.pow(2, c / 12));
  const phs = det.map(() => rnd() * TAU);
  add(music, t, len + 0.6, x => {
    let v = 0;
    for (let d = 0; d < 3; d++) for (let h = 1; h <= 7; h++) v += Math.sin(TAU * det[d] * h * x + phs[d] * h) / h;
    return f1(v) * Math.min(1, x / 0.35) * (x > len ? Math.exp(-(x - len) * 6) : 1) * 0.07;
  }, g, (ni - 1) * 0.35);
});
const pluck = (t, m, g = 1, pan = 0) => { const f = hz(m); add(music, t, 0.35, x =>
  (Math.sin(TAU * f * x) + 0.35 * Math.sin(TAU * 2 * f * x) * Math.exp(-x * 20)) * Math.exp(-x * 11) * 0.12, g, pan); };

/* ── arrangement from the music map ── */
const eps = 1e-6;
if (M.tension) {
  const [a, b] = M.tension;
  pad(a, [tonic.root, tonic.root + 7, tonic.root + 12], b - a, 0.9, 700);
  for (let t = a; t < b - eps; t += BEAT / 2) { hatEnv(t, 0.5 + 0.3 * ((t - a) / (b - a)), 0.2); bass(t, tonic.root - 12, 0.22, 0.5); }
}
if (M.swell) {
  const [a, b] = M.swell;
  pad(a, [...tonic.pad, tonic.pad[0] + 12], b - a - 0.1, 1.2, 1800);
  bass(a, tonic.root - 12, b - a - 0.4, 0.9);
}
if (M.groove) {
  const [a, b] = M.groove;
  const g0 = Math.ceil(a / BEAT - eps) * BEAT;
  for (let t = g0; t < b - eps; t += BEAT) { kick(t, 0.95); if (Math.round(t / BEAT) % 2 === 1) clap(t, 0.7); }
  for (let t = g0; t < b - eps; t += BEAT / 2) {
    hatEnv(t + BEAT / 4, 0.9, 0.25); hatEnv(t, 0.45, -0.25);
    bass(t, chordAt(t).root - 12 + (Math.round(t / (BEAT / 2)) % 4 === 3 ? 12 : 0), 0.24, 0.85);
  }
  for (let t = Math.floor(g0 / (BEAT * 4)) * BEAT * 4; t < b - eps; t += BEAT * 4) {
    const s = Math.max(t, a);
    pad(s, chordAt(t).pad, Math.min(t + BEAT * 4, b) - s - 0.05, 1, 1500);
  }
  for (let t = Math.ceil(Math.max(M.arpFrom, a) / (BEAT / 4) - eps) * BEAT / 4; t < b - eps; t += BEAT / 4) {
    const i = Math.round(t / (BEAT / 4));
    pluck(t, chordAt(t).arp[[0, 2, 1, 3, 2, 1, 3, 2][i % 8]], 0.85, i % 2 ? 0.4 : -0.4);
  }
}
if (M.brk) pad(M.brk[0], tonic.pad, M.brk[1] - M.brk[0] - 0.25, 0.7, 900);
if (M.outro) {
  const [a, b] = M.outro, half = Math.min(2, (b - a) / 2);
  kick(a, 1.0);
  pad(a, [...tonic.pad, tonic.pad[0] + 12], half - 0.05, 1.25, 2200);
  pad(a + half, [...CH[1].pad, CH[1].pad[0] + 12], b - a - half - 0.4, 1.25, 1800);
  bass(a, tonic.root - 12, half - 0.1, 0.9); bass(a + half, CH[1].root - 12, b - a - half, 0.9);
  for (let t = a; t < a + half - eps; t += BEAT) kick(t, 0.6);
  const mel = [3, 2, 1, 2, 3, 2, 1, 0];
  for (let t = a; t < b - 0.5; t += BEAT / 2) pluck(t, tonic.arp[mel[Math.round((t - a) * 4) % 8] % 4], 0.55, Math.sin(t * 3) * 0.5);
}

/* ── SFX ── */
const S = {
  pop: (t, g) => { let ph = 0; add(fx, t, 0.12, x => { ph += TAU * (500 + 900 * Math.min(1, x / 0.03)) / SR; return Math.sin(ph) * Math.exp(-x * 40) * 0.6; }, g, (rnd() - 0.5) * 0.6); },
  notify: (t, g) => [1046.5, 1568].forEach((f, i) => add(fx, t + i * 0.09, 0.4, x => Math.sin(TAU * f * x) * Math.exp(-x * 12) * 0.4, g)),
  suck: (t, g) => { const L = 0.58; let y = 0; add(fx, t, L, x => { const p = x / L; y += coef(200 + 5000 * p * p) * (noise() - y); return y * p * p * 0.9; }, g); },
  impact: (t, g) => { let ph = 0, y = 0; add(fx, t, 1.6, x => {
    ph += TAU * (38 + 70 * Math.exp(-x * 14)) / SR; y += coef(900) * (noise() - y);
    return Math.sin(ph) * Math.exp(-x * 2.6) * 0.9 + y * Math.exp(-x * 9) * 0.8;
  }, g); },
  whoosh: (t, g, L = 0.45, lo = 400, hi = 3500) => { let y = 0, y2 = 0; add(fx, t - L * 0.5, L, x => {
    const p = x / L, fc = lo + (hi - lo) * Math.sin(Math.PI * p);
    y += coef(fc) * (noise() - y); y2 += coef(fc * 0.3) * (y - y2);
    return (y - y2) * Math.pow(Math.sin(Math.PI * p), 2) * 1.6;
  }, g, (rnd() - 0.5) * 0.5); },
  whooshBig: (t, g) => S.whoosh(t, g, 0.7, 150, 2600),
  shimmer: (t, g) => [2093, 2637, 3136, 4186, 5274].forEach((f, i) => { const ph = rnd() * TAU;
    add(fx, t + i * 0.025, 0.9, x => Math.sin(TAU * f * x + ph) * Math.exp(-x * 5) * (0.6 + 0.4 * Math.sin(TAU * 9 * x)) * 0.11, g, i % 2 ? 0.5 : -0.5); }),
  draw: (t, g) => { let y = 0, prev = 0; const L = 1.4; add(fx, t, L, x => {
    const n = noise(), h = n - prev; prev = n; y += coef(4000) * (h - y);
    return y * (0.5 + 0.5 * Math.sin(TAU * 3.3 * x) ** 2) * Math.min(1, x * 20) * Math.min(1, (L - x) * 8) * 0.5;
  }, g, 0.2); },
  tick: (t, g) => add(fx, t, 0.03, x => Math.sin(TAU * 3200 * x) * Math.exp(-x * 160) * 0.5, g),
  click: (t, g) => add(fx, t, 0.05, x => (Math.sin(TAU * 1900 * x) * 0.5 + noise() * 0.3) * Math.exp(-x * 110), g),
  counter: (t, g) => { for (let i = 0; i < 15; i++) { const f = 1400 + i * 70; add(fx, t + i * 0.04, 0.025, x => Math.sin(TAU * f * x) * Math.exp(-x * 180) * 0.4, g); } },
  stamp: (t, g) => { let ph = 0, y = 0; add(fx, t, 0.35, x => {
    ph += TAU * (70 + 90 * Math.exp(-x * 30)) / SR; y += coef(1800) * (noise() - y);
    return Math.sin(ph) * Math.exp(-x * 11) * 0.9 + y * Math.exp(-x * 35) * 0.9;
  }, g); },
  scan: (t, g) => { let ph = 0, y = 0; const L = 1.05; add(fx, t, L, x => {
    const p = x / L; ph += TAU * (260 * Math.pow(9, p)) / SR; y += coef(6000) * (noise() - y);
    return (Math.sin(ph) * 0.25 + y * 0.12) * Math.sin(Math.PI * p) ** 0.6;
  }, g); },
  sparkle: (t, g) => { for (let i = 0; i < 9; i++) { const f = 2600 + rnd() * 3200, d = rnd() * 0.5;
    add(fx, t + d, 0.3, x => Math.sin(TAU * f * x) * Math.exp(-x * 18) * 0.18, g, rnd() * 1.6 - 0.8); } },
  reverse: (t, g) => { let y = 0; const L = 0.85; add(fx, t, L, x => { const p = x / L; y += coef(1500 + 9000 * p) * (noise() - y); return y * p ** 3 * 0.9; }, g); },
  ding: (t, g) => [1568, 2352, 3136].forEach((f, i) => add(fx, t, 0.9, x => Math.sin(TAU * f * x) * Math.exp(-x * (5 + i * 3)) * (0.35 / (i + 1)), g)),
};
for (const [t, type, g] of SFX) {
  if (!S[type]) throw new Error('unknown sfx ' + type);
  S[type](t, g);
}

/* ── mix ── */
const out = [new Float32Array(N), new Float32Array(N)];
const fadeOut = 1.4;
for (let c = 0; c < 2; c++) for (let i = 0; i < N; i++) {
  const t = i / SR;
  let m = music[c][i] * 0.8;
  for (const [a, b] of M.gaps) if (t >= a && t < b) m *= Math.max(0, Math.min(1, (a + 0.03 - t) / 0.03));
  let v = m + fx[c][i] * 0.75;
  if (t > DURATION - fadeOut) v *= (DURATION - t) / fadeOut;
  out[c][i] = Math.tanh(v * 1.1);
}
let peak = 1e-9;
for (const ch of out) for (const v of ch) peak = Math.max(peak, Math.abs(v));
const norm = Math.pow(10, -3.5 / 20) / peak;
const buf = Buffer.alloc(44 + N * 4);
buf.write('RIFF', 0); buf.writeUInt32LE(36 + N * 4, 4); buf.write('WAVE', 8);
buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
buf.write('data', 36); buf.writeUInt32LE(N * 4, 40);
for (let i = 0; i < N; i++) for (let c = 0; c < 2; c++)
  buf.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(out[c][i] * norm * 32767))), 44 + i * 4 + c * 2);
fs.writeFileSync(OUT, buf);
console.log(`audio: ${DURATION}s, ${SFX.length} sfx, key=${M.key}, peak -3.5 dBFS`);
