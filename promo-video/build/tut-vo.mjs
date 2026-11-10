// node tut-vo.mjs --c tut-01  — narrates every step of a tutorial content file with Gemini TTS.
// Clips are cached by text+voice+style (re-running only pays for changed lines), trimmed of
// leading/trailing silence, and listed with durations in audio/vo/<NAME>/vo.json for tutorial.js.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { speak } from './tts.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
const name = (opt('--c') || '').replace(/\.js$/, '');
const ctx = { window: {}, document: { write() {} } };
vm.runInNewContext(fs.readFileSync(path.join(ROOT, name + '.js'), 'utf8'), ctx);
const C = ctx.window.CONTENT;
const VOICE = C.VOICE, STYLE = C.VOICE_STYLE || '';
const dir = path.join(ROOT, 'audio', 'vo', C.NAME);
fs.mkdirSync(dir, { recursive: true });

function trimWav(buf) {
  const sr = buf.readUInt32LE(24);
  let off = 12, data = null;
  while (off + 8 <= buf.length) {
    const id = buf.toString('ascii', off, off + 4), len = buf.readUInt32LE(off + 4);
    if (id === 'data') { data = buf.subarray(off + 8, off + 8 + len); break; }
    off += 8 + len + (len % 2);
  }
  const n = data.length / 2, th = 0.012 * 32768, pad = Math.round(sr * 0.06);
  let a = 0, b = n - 1;
  while (a < n && Math.abs(data.readInt16LE(a * 2)) < th) a++;
  while (b > a && Math.abs(data.readInt16LE(b * 2)) < th) b--;
  a = Math.max(0, a - pad); b = Math.min(n - 1, b + pad);
  const pcm = data.subarray(a * 2, (b + 1) * 2);
  const out = Buffer.alloc(44 + pcm.length);
  out.write('RIFF', 0); out.writeUInt32LE(36 + pcm.length, 4); out.write('WAVE', 8);
  out.write('fmt ', 12); out.writeUInt32LE(16, 16); out.writeUInt16LE(1, 20); out.writeUInt16LE(1, 22);
  out.writeUInt32LE(sr, 24); out.writeUInt32LE(sr * 2, 28); out.writeUInt16LE(2, 32); out.writeUInt16LE(16, 34);
  out.write('data', 36); out.writeUInt32LE(pcm.length, 40); pcm.copy(out, 44);
  return { wav: out, dur: pcm.length / 2 / sr };
}

const list = [];
for (const [i, s] of (C.VO_ITEMS || C.STEPS).entries()) {
  const text = s.say || s.sub;
  if (!text) { list.push(null); continue; }
  const style = s.style || STYLE;
  const h = crypto.createHash('sha1').update(VOICE + '|' + style + '|' + text).digest('hex').slice(0, 10);
  const file = path.join(dir, `${String(i).padStart(2, '0')}-${h}.wav`);
  if (!fs.existsSync(file)) {
    process.stdout.write(`step ${i}: synthesizing… `);
    const { wav } = trimWav(await speak(VOICE, text, style));
    fs.writeFileSync(file, wav);
  }
  const b = fs.readFileSync(file), dur = (b.length - 44) / 2 / b.readUInt32LE(24);
  console.log(`step ${i}: ${dur.toFixed(2)}s`);
  list.push({ file: path.relative(ROOT, file).split(path.sep).join('/'), dur: +dur.toFixed(3) });
}
fs.writeFileSync(path.join(dir, 'vo.json'), JSON.stringify(list, null, 1));
console.log('wrote', path.relative(ROOT, path.join(dir, 'vo.json')), `· total ${list.reduce((a, v) => a + (v ? v.dur : 0), 0).toFixed(1)}s speech`);
