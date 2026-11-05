// node audio/synth.mjs <cues.json> <out.wav> — upbeat timelapse score (120 BPM, A minor) + UI SFX
// Each 2 s build step is exactly one bar, so every click lands on beat 2 of its bar.
import fs from 'node:fs';

const cues = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const OUT = process.argv[3];
const { duration: DURATION, T } = cues;
const SR = 44100, N = Math.ceil(SR * DURATION), TAU = Math.PI * 2;
const BEAT = 0.5, BAR = BEAT * 4, G0 = T.intro;   // grid starts when the build starts
const music = [new Float32Array(N), new Float32Array(N)];
const drums = [new Float32Array(N), new Float32Array(N)];
const fx = [new Float32Array(N), new Float32Array(N)];

let seed = 1207;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const noise = () => rnd() * 2 - 1;
const hz = m => 440 * Math.pow(2, (m - 69) / 12);
const coef = fc => 1 - Math.exp(-TAU * Math.min(fc, SR * 0.45) / SR);
function add(buf, t0, len, fn, gain = 1, pan = 0) {
  const s0 = Math.round(t0 * SR), n = Math.round(len * SR);
  const gl = gain * Math.cos((pan + 1) * Math.PI / 4) * Math.SQRT2, gr = gain * Math.sin((pan + 1) * Math.PI / 4) * Math.SQRT2;
  for (let i = 0; i < n; i++) {
    const k = s0 + i; if (k < 0 || k >= N) continue;
    const v = fn(i / SR, i); buf[0][k] += v * gl; buf[1][k] += v * gr;
  }
}

/* ── instruments ── */
const pluck = (t, m, vel = 1, pan = 0, len = 0.45) => {
  const f = hz(m); let y = 0;
  add(music, t, len, (x) => {
    let v = 0; for (let h = 1; h <= 7; h++) v += Math.sin(TAU * f * h * x) / h * Math.exp(-x * (6 + h * 5));
    y += coef(900 + 5000 * Math.exp(-x * 14)) * (v - y);
    return y * Math.min(1, x * 400) * Math.min(1, (len - x) * 30) * 0.12 * vel;
  }, 1, pan);
};
const bell = (t, m, vel = 1, pan = 0, len = 1.6) => {
  const f = hz(m);
  add(music, t, len, (x) => (Math.sin(TAU * f * x) + 0.35 * Math.sin(TAU * f * 2.0 * x) * Math.exp(-x * 4) + 0.18 * Math.sin(TAU * f * 3.01 * x) * Math.exp(-x * 7))
    * Math.exp(-x * 2.6) * Math.min(1, x * 300) * Math.min(1, (len - x) * 8) * 0.11 * vel, 1, pan);
};
const pad = (t, notes, len, g = 1, bright = 1200) => notes.forEach((m, ni) => {
  const f = hz(m); let y = 0; const det = [-0.1, 0.1].map(c => f * Math.pow(2, c / 12));
  add(music, t, len + 0.8, (x) => {
    let v = 0; for (const d of det) for (let h = 1; h <= 6; h++) v += Math.sin(TAU * d * h * x + h) / (h * 1.2);
    y += coef(bright) * (v - y);
    const env = Math.min(1, x / 0.5) * (x > len ? Math.exp(-(x - len) * 5) : 1);
    return y * env * 0.03;
  }, g, (ni / Math.max(1, notes.length - 1) - 0.5) * 0.7);
});
const bass = (t, m, len, g = 1) => { const f = hz(m); let y = 0; add(music, t, len, (x) => {
  const saw = 2 * ((f * x) % 1) - 1; y += coef(260 + 700 * Math.exp(-x * 18)) * (saw - y);
  return (y * 0.8 + Math.sin(TAU * f * x) * 0.5) * Math.min(1, x * 200) * Math.min(1, (len - x) * 40) * 0.3;
}, g); };
const kick = (t, g = 1) => { let ph = 0; add(drums, t, 0.45, (x) => {
  ph += TAU * (45 + 120 * Math.exp(-x * 35)) / SR; return Math.sin(ph) * Math.exp(-x * 7.5) * 0.95 + (x < 0.004 ? noise() * 0.3 : 0);
}, g); };
const hat = (t, g = 1, open = false) => { let prev = 0, y = 0; add(drums, t, open ? 0.22 : 0.06, (x) => {
  const n = noise(); const h = n - prev; prev = n; y += coef(9000) * (h - y);
  return y * Math.exp(-x * (open ? 16 : 70)) * 0.22;
}, g, 0.25); };
const clap = (t, g = 1) => { let y = 0; add(drums, t, 0.25, (x) => {
  y += coef(2400) * (noise() - y);
  const env = [0, 0.011, 0.022].reduce((s, o) => s + (x >= o ? Math.exp(-(x - o) * (o === 0.022 ? 18 : 120)) : 0), 0);
  return y * env * 0.5;
}, g, -0.1); };

const CH = [
  { root: 33, pad: [57, 60, 64, 67], arp: [69, 72, 76, 72, 79, 76, 72, 76] },  // Am7
  { root: 29, pad: [53, 57, 60, 64], arp: [65, 69, 72, 69, 76, 72, 69, 72] },  // Fmaj7
  { root: 36, pad: [55, 60, 64, 67], arp: [67, 72, 76, 72, 79, 76, 72, 76] },  // C
  { root: 31, pad: [55, 59, 62, 67], arp: [67, 71, 74, 71, 79, 74, 71, 74] },  // G
];
const barOf = t => Math.floor((t - G0) / BAR + 1e-6);
const chordAt = t => CH[((barOf(t) % 4) + 4) % 4];
const REV = T.reveal, OUTT = T.out;

/* ── arrangement ── */
// intro: airy pad + rising plucks
pad(0, [57, 64, 69], G0, 0.9, 700);
[69, 72, 76, 79, 81, 84].forEach((m, i) => pluck(0.35 + i * 0.25, m, 0.55 + i * 0.06, (i % 2 ? 0.4 : -0.4), 0.7));
// build: pluck arp in 8ths, bass, four-on-the-floor
for (let t = G0; t < OUTT - 1e-6; t += BEAT / 2) {
  if (t >= REV - BAR / 2 && t < REV) continue;               // break before the reveal
  const c = chordAt(t), i = Math.round((t - G0) / (BEAT / 2));
  const vel = t >= REV ? 0.75 : 0.5 + 0.2 * seg01((t - G0) / (REV - G0));
  pluck(t, c.arp[i % 8], vel * (i % 2 ? 0.8 : 1), i % 2 ? 0.45 : -0.45);
}
function seg01(x) { return Math.max(0, Math.min(1, x)); }
for (let b = 0; G0 + b * BAR < OUTT - 1e-6; b++) {
  const t = G0 + b * BAR, c = CH[b % 4], big = t >= REV;
  pad(t, c.pad, BAR, big ? 1.3 : 0.85, big ? 2200 : 1100);
  for (let q = 0; q < 8; q++) {
    const tb = t + q * BEAT / 2;
    if (tb >= REV - BAR / 2 && tb < REV) continue;
    bass(tb, c.root + (q % 2 ? 12 : 0), BEAT / 2 - 0.03, q % 2 ? 0.55 : 0.9);
  }
}
for (let t = G0; t < OUTT - 1e-6; t += BEAT) {
  if (t >= REV - BAR / 2 && t < REV) continue;
  const bi = Math.round((t - G0) / BEAT) % 4;
  kick(t, 0.85);
  hat(t + BEAT / 2, t >= REV ? 1 : 0.8, bi === 3);
  if (t >= G0 + BAR * 4 && (bi === 1 || bi === 3)) clap(t, 0.7);
  if (t >= REV) hat(t + BEAT / 4, 0.45), hat(t + BEAT * 0.75, 0.45);
}
// reveal: bell melody on top
const MEL = [81, 79, 76, 79, 84, 83, 79, 76, 81, 79, 76, 72, 74, 76, 79, 81, 84, 83, 81, 79];
for (let k = 0, t = REV; t < OUTT - 1e-6; t += BEAT, k++) if (k % 2 === 0 || k > 12) bell(t, MEL[k % MEL.length], 0.8, 0.15);
// outro: resolve on Am(add9), bell arpeggio
[45, 57, 64, 67, 71, 72, 76].forEach((m, i) => pluck(OUTT + i * 0.06, m, 0.8 - i * 0.05, (i / 6 - 0.5) * 0.8, 2.5));
pad(OUTT, [57, 60, 64, 71], DURATION - OUTT - 0.8, 1.3, 1500);
bass(OUTT, 33, 2.5, 1);
[81, 84, 88, 91].forEach((m, i) => bell(OUTT + 1.6 + i * 0.16, m, 0.55, (i % 2 ? 0.3 : -0.3), 2.4));

/* ── SFX ── */
const S = {
  click: (t, g) => add(fx, t, 0.05, x => (Math.sin(TAU * 3200 * x) * 0.5 + noise() * 0.5) * Math.exp(-x * 160), g * 0.5, -0.1),
  blip: (t, g) => { let ph = 0; add(fx, t, 0.12, x => { ph += TAU * (1200 + 900 * (x / 0.12)) / SR; return Math.sin(ph) * Math.exp(-x * 30) * 0.35; }, g, 0.15); },
  pop: (t, g) => { let ph = 0; add(fx, t, 0.14, x => { ph += TAU * (950 * Math.exp(-x * 9) + 380) / SR; return Math.sin(ph) * Math.min(1, x * 600) * Math.exp(-x * 26) * 0.5; }, g, 0.3); },
  tick: (t, g) => add(fx, t, 0.05, x => Math.sin(TAU * 2600 * x) * Math.exp(-x * 110), g * 0.45, 0.2),
  whoosh: (t, g) => { let y = 0; const L = 0.6; add(fx, t - 0.25, L, x => {
    const p = x / L; y += coef(300 + 3200 * Math.sin(Math.PI * p)) * (noise() - y); return y * Math.sin(Math.PI * p) ** 2 * 0.9;
  }, g * 0.6, (rnd() - 0.5) * 0.5); },
  riser: (t, g) => { let y = 0, ph = 0; const L = 1.5; add(fx, t, L, x => {
    const p = x / L; y += coef(400 + 6000 * p * p) * (noise() - y); ph += TAU * (220 + 660 * p * p) / SR;
    return (y * 0.6 + Math.sin(ph) * 0.18) * p * p * 0.8;
  }, g * 0.55); },
  hit: (t, g) => { let ph = 0, y = 0; add(fx, t, 1.2, x => {
    ph += TAU * (40 + 90 * Math.exp(-x * 20)) / SR; y += coef(1500 * Math.exp(-x * 3) + 200) * (noise() - y);
    return Math.sin(ph) * Math.exp(-x * 4) * 0.9 + y * Math.exp(-x * 6) * 0.5;
  }, g * 0.6); },
  boom: (t, g) => { let ph = 0, y = 0; add(fx, t, 2.2, x => {
    ph += TAU * (32 + 70 * Math.exp(-x * 6)) / SR; y += coef(2500 * Math.exp(-x * 2.5) + 150) * (noise() - y);
    return Math.sin(ph) * Math.exp(-x * 1.8) * 1.0 + y * Math.exp(-x * 3.5) * 0.6;
  }, g * 0.6); },
  shimmer: (t, g) => [88, 91, 93, 96, 100].forEach((m, i) => add(fx, t + i * 0.07, 1.4, x => Math.sin(TAU * hz(m) * x) * Math.exp(-x * 3) * 0.12, g, i % 2 ? 0.4 : -0.4)),
  chime: (t, g) => [[880, 1], [1318.5, 0.6], [1760, 0.45], [2637, 0.25]].forEach(([f, a], i) => {
    const r = [1, 2.76, 5.4]; add(fx, t + i * 0.012, 2.6, x => r.reduce((s, k, j) => s + Math.sin(TAU * f * k * x) * Math.exp(-x * (1.6 + j * 2.5)) / (1 + j * 2.5), 0) * a * 0.22, g, i % 2 ? 0.35 : -0.35);
  }),
};
for (const [t, type, g] of cues.sfx) { if (!S[type]) throw new Error('unknown sfx ' + type); S[type](t, g); }

/* ── reverb on music (Schroeder) ── */
function reverb(buf, mix) {
  const combs = [1116, 1188, 1277, 1356], aps = [556, 441];
  for (let c = 0; c < 2; c++) {
    const src = buf[c], wet = new Float32Array(N), sp = c * 23;
    for (const d0 of combs) {
      const d = d0 + sp, line = new Float32Array(d); let idx = 0, lp = 0;
      for (let i = 0; i < N; i++) { const o = line[idx]; lp = o * 0.7 + lp * 0.3; line[idx] = src[i] + lp * 0.78; idx = (idx + 1) % d; wet[i] += o * 0.25; }
    }
    for (const d0 of aps) {
      const d = d0 + sp, line = new Float32Array(d); let idx = 0;
      for (let i = 0; i < N; i++) { const b = line[idx]; const v = wet[i]; line[idx] = v + b * 0.5; wet[i] = b - v * 0.5; idx = (idx + 1) % d; }
    }
    for (let i = 0; i < N; i++) src[i] += wet[i] * mix;
  }
}
reverb(music, 0.25);
reverb(fx, 0.12);

/* ── sidechain duck on kicks + mix ── */
const kicks = [];
for (let t = G0; t < OUTT; t += BEAT) if (!(t >= REV - BAR / 2 && t < REV)) kicks.push(t);
const duck = new Float32Array(N).fill(1);
for (const k of kicks) { const s0 = Math.round(k * SR); for (let i = 0; i < SR * 0.3 && s0 + i < N; i++) duck[s0 + i] = Math.min(duck[s0 + i], 0.55 + 0.45 * (i / (SR * 0.3))); }
const out = [new Float32Array(N), new Float32Array(N)];
const fade = 1.2;
for (let c = 0; c < 2; c++) for (let i = 0; i < N; i++) {
  const t = i / SR;
  let v = music[c][i] * 0.8 * duck[i] + drums[c][i] * 0.6 + fx[c][i] * 0.85;
  if (t > DURATION - fade) v *= (DURATION - t) / fade;
  if (t < 0.02) v *= t / 0.02;
  out[c][i] = Math.tanh(v * 1.5) / 1.2;
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
