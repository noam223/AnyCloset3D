// node tts.mjs --voice <name|id> --style "<delivery>" --out audio/vo/x.wav "<hebrew text>"
// node tts.mjs --design "<voice brief>" --gender female|male   → prints a designed voice id
// Gemini TTS (same API as the moviemaker project). The key is read at runtime from
// GOOGLE_AI_API_KEY / GEMINI_API_KEY, falling back to ~/moviemaker/.env.local — never copied here.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const API = 'https://generativelanguage.googleapis.com/v1beta';
const MODEL = 'gemini-3.8-flash-tts';

function apiKey() {
  const k = process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY;
  if (k) return k;
  const env = path.join(os.homedir(), 'moviemaker', '.env.local');
  const line = fs.readFileSync(env, 'utf8').split(/\r?\n/).find(l => /^GOOGLE_AI_API_KEY=/.test(l));
  if (!line) throw new Error('GOOGLE_AI_API_KEY not found');
  return line.slice(line.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '');
}

async function post(p, body) {
  const res = await fetch(API + p, {
    method: 'POST',
    headers: { 'x-goog-api-key': apiKey(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(180000),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) throw new Error(`Gemini TTS ${p}: ${json.error?.message || 'HTTP ' + res.status}`);
  return json;
}

export async function designVoice(description, gender = 'female') {
  const v = await post('/voices', {
    store: true,
    voice: { model: MODEL, type: 'prompted', display_name: 'AnyCloset3D tutorial narrator', gender, language_code: 'he-IL', prompted: { input: description } },
  });
  if (!v.id) throw new Error('voice design returned no id');
  return v.id;
}

/** Raw PCM/WAV bytes as returned by the API (24 kHz mono). */
export async function speak(voice, text, style) {
  const r = await post('/interactions', {
    model: MODEL,
    input: [{ type: 'user_input', content: [{ type: 'text', text, ...(style ? { annotations: [{ type: 'speech_metadata', style }] } : {}) }] }],
    response_format: { type: 'audio' },
    generation_config: { speech_config: [{ voice }] },
  });
  const audio = (r.steps || []).filter(s => s.type === 'model_output').flatMap(s => s.content || []).filter(c => c.type === 'audio' && c.data).at(-1);
  if (!audio) throw new Error('no audio in response');
  return Buffer.from(audio.data, 'base64');
}

if (path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1])) {
  const args = process.argv.slice(2);
  const opt = n => { const i = args.indexOf(n); return i >= 0 ? args.splice(i, 2)[1] : undefined; };
  const design = opt('--design');
  if (design) {
    console.log(await designVoice(design, opt('--gender') || 'female'));
  } else {
    const voice = opt('--voice'), style = opt('--style'), out = opt('--out');
    const buf = await speak(voice, args.join(' '), style);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, buf);
    console.log(out, buf.length);
  }
}
