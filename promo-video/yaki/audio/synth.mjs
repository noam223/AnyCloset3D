// node audio/synth.mjs <cues.json> <out.wav> — soft piano score (90 BPM, D major) + paper/pencil SFX
import fs from 'node:fs';

const cues = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const OUT = process.argv[3];
const { duration: DURATION, T } = cues;
const SR = 44100, N = Math.ceil(SR * DURATION), TAU = Math.PI * 2;
const BPM = 90, BEAT = 60 / BPM, BAR = BEAT * 4;
const music = [new Float32Array(N), new Float32Array(N)];
const fx = [new Float32Array(N), new Float32Array(N)];

let seed = 90210;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const noise = () => rnd() * 2 - 1;
const hz = m => 440 * Math.pow(2, (m - 69) / 12);
const coef = fc => 1 - Math.exp(-TAU * fc / SR);
function add(buf, t0, len, fn, gain = 1, pan = 0) {
  const s0 = Math.round(t0 * SR), n = Math.round(len * SR);
  const gl = gain * Math.cos((pan + 1) * Math.PI / 4) * Math.SQRT2, gr = gain * Math.sin((pan + 1) * Math.PI / 4) * Math.SQRT2;
  for (let i = 0; i < n; i++) {
    const k = s0 + i; if (k < 0 || k >= N) continue;
    const v = fn(i / SR, i); buf[0][k] += v * gl; buf[1][k] += v * gr;
  }
}

/* ── instruments ── */
const AMP = [1, 0.42, 0.22, 0.12, 0.07, 0.04];
const piano = (t, m, vel = 1, pan = 0, len = 2.8) => {
  const f = hz(m), bright = Math.min(1, 0.6 + vel * 0.5);
  const fr = AMP.map((_, k) => f * (k + 1) * Math.sqrt(1 + 0.00035 * (k + 1) ** 2));
  const dec = AMP.map((_, k) => 1.3 + k * 1.2 + (m - 60) * 0.03);
  let y = 0;
  add(music, t, len, (x) => {
    let v = 0;
    for (let k = 0; k < 6; k++) v += AMP[k] * (k ? bright : 1) * Math.sin(TAU * fr[k] * x) * Math.exp(-x * dec[k]);
    y += coef(2500) * (noise() - y);
    const hammer = x < 0.012 ? y * (1 - x / 0.012) * 0.25 : 0;
    const rel = x > len - 0.25 ? (len - x) / 0.25 : 1;
    return (v * Math.min(1, x * 350) + hammer) * rel * 0.085 * vel;
  }, 1, pan);
};
const kick = (t, g = 1) => { let ph = 0, y = 0; add(music, t, 0.6, (x) => {
  ph += TAU * (48 + 55 * Math.exp(-x * 30)) / SR; y += coef(400) * (noise() - y);
  return Math.sin(ph) * Math.exp(-x * 6.5) * 0.75 + y * Math.exp(-x * 60) * 0.25;
}, g); };
const shaker = (t, g = 1, pan = 0.3) => { let prev = 0, y = 0; add(music, t, 0.09, (x) => {
  const n = noise(); const h = n - prev; prev = n; y += coef(7000) * (h - y);
  return y * Math.min(1, x / 0.012) * Math.exp(-x * 45) * 0.16;
}, g, pan); };
const bass = (t, m, len, g = 1) => { const f = hz(m); add(music, t, len, (x) => {
  const v = Math.sin(TAU * f * x) + 0.25 * Math.sin(TAU * 2 * f * x) * Math.exp(-x * 3);
  return v * Math.min(1, x * 60) * Math.exp(-x * 1.1) * Math.min(1, (len - x) * 12) * 0.32;
}, g); };
const pad = (t, notes, len, g = 1, bright = 900) => { notes.forEach((m, ni) => {
  const f = hz(m); let y = 0; const det = [-0.08, 0.09].map(c => f * Math.pow(2, c / 12));
  add(music, t, len + 1.2, (x) => {
    let v = 0; for (const d of det) for (let h = 1; h <= 5; h++) v += Math.sin(TAU * d * h * x) / (h * h);
    y += coef(bright) * (v - y);
    const env = Math.min(1, x / 0.9) * (x > len ? Math.exp(-(x - len) * 3.5) : 1);
    return y * env * 0.045;
  }, g, (ni / Math.max(1, notes.length - 1) - 0.5) * 0.6);
}); };

const CH = [
  { root: 38, pad: [62, 66, 69, 73], arp: [62, 66, 69, 73, 74, 73, 69, 66], mel: [78, 76, 74, 76] }, // Dmaj7
  { root: 35, pad: [59, 62, 66, 69], arp: [59, 62, 66, 69, 71, 69, 66, 62], mel: [74, 73, 71, 73] }, // Bm7
  { root: 43, pad: [55, 59, 62, 66], arp: [55, 59, 62, 66, 67, 66, 62, 59], mel: [71, 74, 78, 76] }, // Gmaj7
  { root: 45, pad: [57, 61, 64, 66], arp: [57, 61, 64, 66, 69, 66, 64, 61], mel: [76, 73, 69, 73] }, // A6
];
const chordAt = t => CH[Math.floor(t / BAR + 1e-6) % 4];
const END = T.s7;

/* ── arrangement ── */
// intro: piano answers each line of type
pad(0, [50, 57, 62], BAR * 1.5, 0.8, 600);
piano(0.3, 50, 0.85, -0.2, 4); piano(0.3, 57, 0.65, 0, 4); piano(0.3, 69, 0.95, 0.2, 3.5);
piano(1.2, 74, 0.9, 0.15, 3);
piano(2.15, 78, 0.85, 0.25, 3); piano(2.15, 62, 0.5, -0.2, 3);
piano(BAR, 47, 0.5, -0.2, 3.5); piano(BAR, 66, 0.4, 0.1, 3);
// drawing: gentle broken chords
for (let t = 4.0; t < END - 1e-6; t += BEAT / 2) {
  const c = chordAt(t), i = Math.round(t / (BEAT / 2));
  const vel = t < T.s3 ? 0.42 : t < T.s5 ? 0.4 : 0.44;
  piano(t, c.arp[i % 8], vel, i % 2 ? 0.35 : -0.35, 1.6);
}
for (let b = Math.floor(4.0 / BAR); b * BAR < END; b++) {
  const t = Math.max(4.0, b * BAR), c = chordAt(b * BAR);
  pad(t, c.pad, Math.min((b + 1) * BAR, END) - t, t >= T.s5 ? 1.15 : 0.9, t >= T.s5 ? 1300 : 900);
  if (b * BAR >= T.s3 - 1e-6) { piano(b * BAR, c.root + 12, 0.32, -0.3, 2.6); bass(b * BAR, c.root, BEAT * 2 - 0.05); bass(b * BAR + BEAT * 2, c.root, BEAT * 2 - 0.05, 0.85); }
}
// groove from the 3D reveal
for (let t = T.s3; t < END - 0.3; t += BEAT) {
  const bi = Math.round(t / BEAT) % 4;
  if (bi === 0 || bi === 2) kick(t, bi === 0 ? 0.55 : 0.42);
  shaker(t + BEAT / 2, 0.9, 0.3); shaker(t, 0.4, -0.3);
}
// melody over details + realism
for (let t = T.s4; t < END - 1e-6; t += BEAT) {
  if (t >= T.exp && t < T.s5 + BAR - 1e-6) continue;
  const c = chordAt(t), bi = Math.round(t / BEAT) % 4;
  piano(t, c.mel[bi], 0.55, 0.1, 2.2);
}
// reveal sparkle (slider lands)
[81, 85, 86].forEach((m, i) => piano(T.slide + 2.75 + i * 0.09, m, 0.45, 0.3, 2.5));
// final resolve: rolled Dmaj9
[38, 50, 57, 62, 64, 66, 69, 73].forEach((m, i) => piano(END + i * 0.035, m, 0.75 - i * 0.03, (i / 7 - 0.5) * 0.8, DURATION - END));
pad(END, [50, 57, 62, 66, 69], DURATION - END - 0.8, 1.2, 1100);
bass(END, 38, DURATION - END - 0.2, 1);
piano(END + 0.9, 81, 0.5, 0.25, 2); piano(END + 1.5, 78, 0.45, 0.2, 1.6);

/* ── SFX ── */
let dotIdx = 0;
const S = {
  tap: (t, g) => add(fx, t, 0.08, x => (Math.sin(TAU * 1150 * x) * 0.6 + Math.sin(TAU * 2300 * x) * 0.25 + noise() * 0.15 * Math.exp(-x * 300)) * Math.exp(-x * 55), g * 0.55),
  tick: (t, g) => add(fx, t, 0.03, x => Math.sin(TAU * 2900 * x) * Math.exp(-x * 170), g * 0.4, 0.2),
  pencil: (t, g) => { let y = 0, y2 = 0, prev = 0; const L = 2.1; add(fx, t, L, x => {
    const n = noise(); const h = n - prev; prev = n; y += coef(5200) * (h - y); y2 += coef(1500) * (y - y2);
    const strokes = 0.35 + 0.65 * Math.abs(Math.sin(TAU * 1.9 * x + Math.sin(TAU * 0.7 * x) * 2));
    return (y - y2) * strokes * Math.min(1, x * 12) * Math.min(1, (L - x) * 4) * 1.3;
  }, g * 0.5, -0.15); },
  swish: (t, g) => { let y = 0; const L = 0.55; add(fx, t - 0.2, L, x => {
    const p = x / L; y += coef(300 + 1800 * Math.sin(Math.PI * p)) * (noise() - y); return y * Math.sin(Math.PI * p) ** 2 * 0.9;
  }, g * 0.6, (rnd() - 0.5) * 0.4); },
  swell: (t, g) => { let y = 0; const L = 2.0; add(fx, t, L, x => {
    const p = x / L; y += coef(200 + 1600 * p * p) * (noise() - y);
    return (y * 0.7 + Math.sin(TAU * 73.4 * x) * 0.3) * Math.pow(Math.sin(Math.PI * Math.min(1, p * 1.15)), 2) * 0.7;
  }, g * 0.5); },
  brush: (t, g) => { let y = 0, y2 = 0; const L = 1.5; add(fx, t, L, x => {
    const p = x / L; const fc = 800 + 3500 * Math.sin(Math.PI * p);
    y += coef(fc) * (noise() - y); y2 += coef(fc * 0.25) * (y - y2);
    return (y - y2) * Math.sin(Math.PI * p) ** 1.5 * 1.4;
  }, g * 0.5, 0.3); },
  paper: (t, g) => { let y = 0, y2 = 0; const L = 0.75; add(fx, t, L, x => {
    y += coef(3200) * (noise() - y); y2 += coef(700) * (y - y2);
    const crinkle = 0.6 + 0.4 * (rnd() < 0.02 ? 1 : 0.4);
    return (y - y2) * crinkle * Math.min(1, x / 0.04) * Math.exp(-x * 4.5) * 1.5;
  }, g * 0.55); },
  slide: (t, g) => { let y = 0; const L = 1.0; add(fx, t, L, x => {
    const p = x / L; y += coef(900 + 600 * Math.sin(TAU * 3 * x)) * (noise() - y); return y * Math.sin(Math.PI * p) * 0.55;
  }, g * 0.5, -0.2); },
  chime: (t, g) => { [[880, 1], [1318.5, 0.6], [1760, 0.45], [2637, 0.25]].forEach(([f, a], i) => {
    const r = [1, 2.76, 5.4]; add(fx, t + i * 0.012, 2.6, x => r.reduce((s, k, j) => s + Math.sin(TAU * f * k * x) * Math.exp(-x * (1.6 + j * 2.5)) / (1 + j * 2.5), 0) * a * 0.22, g, i % 2 ? 0.35 : -0.35);
  }); },
  dot: (t, g) => { const f = hz([74, 76, 78, 81][dotIdx++ % 4]); add(fx, t, 0.6, x => (Math.sin(TAU * f * x) + 0.3 * Math.sin(TAU * 4 * f * x) * Math.exp(-x * 30)) * Math.exp(-x * 9) * 0.3, g); },
  page: (t, g) => { let y = 0; const L = 0.7; add(fx, t, L, x => {
    const p = x / L; y += coef(4000 * (1 - p) + 400) * (noise() - y);
    const flutter = 0.65 + 0.35 * Math.sin(TAU * 22 * x * (1 - p));
    return y * flutter * Math.min(1, x / 0.05) * Math.pow(1 - p, 1.5) * 1.1;
  }, g * 0.6, 0.25); },
};
for (const [t, type, g] of cues.sfx) { if (!S[type]) throw new Error('unknown sfx ' + type); S[type](t, g); }

/* ── reverb on the music bus (Schroeder) ── */
function reverb(buf, mix = 0.22) {
  const combs = [1116, 1188, 1277, 1356], aps = [556, 441];
  for (let c = 0; c < 2; c++) {
    const src = buf[c], wet = new Float32Array(N), sp = c * 23;
    for (const d0 of combs) {
      const d = d0 + sp, line = new Float32Array(d); let idx = 0, lp = 0;
      for (let i = 0; i < N; i++) { const o = line[idx]; lp = o * 0.7 + lp * 0.3; line[idx] = src[i] + lp * 0.8; idx = (idx + 1) % d; wet[i] += o * 0.25; }
    }
    for (const d0 of aps) {
      const d = d0 + sp, line = new Float32Array(d); let idx = 0;
      for (let i = 0; i < N; i++) { const b = line[idx]; const v = wet[i]; line[idx] = v + b * 0.5; wet[i] = b - v * 0.5; idx = (idx + 1) % d; }
    }
    for (let i = 0; i < N; i++) src[i] += wet[i] * mix;
  }
}
reverb(music, 0.3);

/* ── mix ── */
const out = [new Float32Array(N), new Float32Array(N)];
const fade = 1.3;
for (let c = 0; c < 2; c++) for (let i = 0; i < N; i++) {
  const t = i / SR;
  let v = music[c][i] * 0.85 + fx[c][i] * 0.8;
  if (t > DURATION - fade) v *= (DURATION - t) / fade;
  if (t < 0.02) v *= t / 0.02;
  out[c][i] = Math.tanh(v * 1.6) / 1.2;
}
let peak = 0;
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
console.log(`wrote ${OUT}  peak ${(20 * Math.log10(peak * norm)).toFixed(2)} dBFS`);
