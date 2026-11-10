// node photoreal.mjs --in shots-raw/rm/3d-crop.jpg --out shots-raw/rm/ai.jpg ["extra prompt"]
// Photoreal pass over an editor 3D capture with the same model the app's PRO render uses.
// Key is read like tts.mjs (env or ~/moviemaker/.env.local) and never written anywhere.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const API = 'https://generativelanguage.googleapis.com/v1beta';
const MODEL = 'gemini-3-pro-image-preview';

function apiKey() {
  const k = process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY;
  if (k) return k;
  const env = path.join(os.homedir(), 'moviemaker', '.env.local');
  const line = fs.readFileSync(env, 'utf8').split(/\r?\n/).find(l => /^GOOGLE_AI_API_KEY=/.test(l));
  if (!line) throw new Error('GOOGLE_AI_API_KEY not found');
  return line.slice(line.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '');
}

const args = process.argv.slice(2);
const opt = n => { const i = args.indexOf(n); return i >= 0 ? args.splice(i, 2)[1] : undefined; };
const inp = opt('--in'), out = opt('--out'), aspect = opt('--aspect') || '16:9';
const extra = args.join(' ');

const prompt = [
  'Turn this 3D interior design screenshot into a high-end photorealistic interior photograph.',
  'Keep the exact same camera angle, room layout and geometry: the built-in wardrobe recessed in the wall niche,',
  'its sage green matte flat doors, slim vertical brushed gold bar handles, natural light oak wood frame and filler strips around it,',
  'the window on the left wall with daylight streaming in, the bed, the light oak parquet floor and warm off-white painted walls.',
  'Do not add, remove or move any door, handle or panel of the wardrobe. Soft natural daylight, realistic shadows and reflections,',
  'subtle textures, styled bedroom with a few tasteful accessories on the bed (linen bedding, cushions), architectural photography, 24mm lens.',
  'No text, no watermark, no UI elements.',
  extra,
].join(' ');

const mime = /\.png$/i.test(inp) ? 'image/png' : 'image/jpeg';
const res = await fetch(`${API}/models/${MODEL}:generateContent`, {
  method: 'POST',
  headers: { 'x-goog-api-key': apiKey(), 'Content-Type': 'application/json' },
  body: JSON.stringify({
    contents: [{ role: 'user', parts: [
      { inline_data: { mime_type: mime, data: fs.readFileSync(inp).toString('base64') } },
      { text: prompt },
    ] }],
    generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: aspect, imageSize: '2K' } },
  }),
  signal: AbortSignal.timeout(240000),
});
const json = await res.json().catch(() => ({}));
if (!res.ok || json.error) throw new Error(`Gemini image: ${json.error?.message || 'HTTP ' + res.status}`);
const part = (json.candidates?.[0]?.content?.parts || []).find(p => p.inlineData || p.inline_data);
if (!part) throw new Error('no image in response: ' + JSON.stringify(json).slice(0, 400));
const data = (part.inlineData || part.inline_data).data;
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, Buffer.from(data, 'base64'));
console.log(out);
