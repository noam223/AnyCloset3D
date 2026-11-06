// node audio/tut-mix.mjs <cues.json> <out.wav> — tutorial mix: narration on top, a calm pad/pluck bed
// ducked under speech, and soft UI SFX. Narration WAVs (24 kHz mono PCM from Gemini TTS) are resampled.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cues = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const OUT = process.argv[3];
const DURATION = cues.duration;
const SR = 44100, N = Math.ceil(SR * DURATION), TAU = Math.PI * 2;
const music = [new Float32Array(N), new Float32Array(N)];
const fx = [new Float32Array(N), new Float32Array(N)];
const voice = new Float32Array(N);

let seed = 4021;
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
  const n = Math.floor(data.length / 2 / fmt.ch), out = new Float32Array(n);
  for (let i = 0; i < n; i++) { let s = 0; for (let c = 0; c < fmt.ch; c++) s += data.readInt16LE((i * fmt.ch + c) * 2); out[i] = s / fmt.ch / 32768; }
  return { sr: fmt.sr, pcm: out };
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

/* ── music bed: slow Am7 – Fmaj7 – C – G, 4 s per chord ── */
const CH = [
  { root: 45, pad: [57, 60, 64, 67], arp: [69, 72, 76, 79] },
  { root: 41, pad: [53, 57, 60, 64], arp: [65, 69, 72, 76] },
  { root: 48, pad: [55, 60, 64, 67], arp: [67, 72, 76, 79] },
  { root: 43, pad: [55, 59, 62, 67], arp: [67, 71, 74, 79] },
];
const BAR = 4;
for (let b = 0; b * BAR < DURATION; b++) {
  const t = b * BAR, c = CH[b % 4];
  c.pad.forEach((m, ni) => {
    const f = hz(m); let y = 0; const det = [-0.08, 0.08].map(d => f * Math.pow(2, d / 12));
    add(music, t, BAR + 1, x => {
      let v = 0; for (const d of det) for (let h = 1; h <= 5; h++) v += Math.sin(TAU * d * h * x + h) / (h * 1.3);
      y += coef(900) * (v - y);
      return y * Math.min(1, x / 1.2) * (x > BAR ? Math.exp(-(x - BAR) * 4) : 1) * 0.022;
    }, 1, (ni / 3 - 0.5) * 0.7);
  });
  const fr = hz(c.root - 12);
  add(music, t, BAR, x => Math.sin(TAU * fr * x) * Math.min(1, x * 4) * Math.min(1, (BAR - x) * 4) * 0.09);
  for (let q = 0; q < 8; q++) {
    if (rnd() < 0.35) continue;
    const m = c.arp[(q * 3 + b) % 4] + (q % 4 === 3 ? 12 : 0), f = hz(m), tt = t + q * 0.5;
    add(music, tt, 1.6, x => (Math.sin(TAU * f * x) + 0.3 * Math.sin(TAU * f * 2 * x) * Math.exp(-x * 5)) * Math.exp(-x * 3) * Math.min(1, x * 300) * 0.05, 1, q % 2 ? 0.35 : -0.35);
  }
}

/* ── SFX ── */
const S = {
  click: (t, g) => add(fx, t, 0.05, x => (Math.sin(TAU * 3200 * x) * 0.5 + noise() * 0.5) * Math.exp(-x * 160), g * 0.45, -0.1),
  whoosh: (t, g) => { let y = 0; const L = 0.6; add(fx, t - 0.25, L, x => {
    const p = x / L; y += coef(300 + 3200 * Math.sin(Math.PI * p)) * (noise() - y); return y * Math.sin(Math.PI * p) ** 2 * 0.9;
  }, g * 0.5, (rnd() - 0.5) * 0.5); },
  chime: (t, g) => [[880, 1], [1318.5, 0.6], [1760, 0.45]].forEach(([f, a], i) =>
    add(fx, t + i * 0.012, 2.6, x => [1, 2.76, 5.4].reduce((s, k, j) => s + Math.sin(TAU * f * k * x) * Math.exp(-x * (1.6 + j * 2.5)) / (1 + j * 2.5), 0) * a * 0.2, g, i % 2 ? 0.35 : -0.35)),
};
for (const [t, type, g] of cues.sfx || []) if (S[type]) S[type](t, g);

/* ── duck music under speech (smoothed) ── */
const duck = new Float32Array(N).fill(1);
for (const [a, b] of speech) for (let k = Math.max(0, Math.round((a - 0.25) * SR)); k < Math.min(N, Math.round((b + 0.35) * SR)); k++) duck[k] = 0.38;
let d = 1; const att = 1 - Math.exp(-1 / (SR * 0.12));
for (let i = 0; i < N; i++) { d += (duck[i] - d) * att; duck[i] = d; }

const out = [new Float32Array(N), new Float32Array(N)];
const fade = 1.5;
for (let c = 0; c < 2; c++) for (let i = 0; i < N; i++) {
  const t = i / SR;
  let m = music[c][i] * duck[i] + fx[c][i] * 0.8;
  if (t > DURATION - fade) m *= (DURATION - t) / fade;
  if (t < 0.5) m *= t / 0.5;
  out[c][i] = Math.tanh(m * 1.4) / 1.4 + voice[i] * 0.92;
}
let peak = 0;
for (const ch of out) for (const v of ch) peak = Math.max(peak, Math.abs(v));
const norm = Math.pow(10, -1.5 / 20) / Math.max(peak, 1e-6);
const buf = Buffer.alloc(44 + N * 4);
buf.write('RIFF', 0); buf.writeUInt32LE(36 + N * 4, 4); buf.write('WAVE', 8);
buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
buf.write('data', 36); buf.writeUInt32LE(N * 4, 40);
for (let i = 0; i < N; i++) for (let c = 0; c < 2; c++)
  buf.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(out[c][i] * norm * 32767))), 44 + i * 4 + c * 2);
fs.writeFileSync(OUT, buf);
console.log(`wrote ${OUT}  ${speech.length} narration clips`);
