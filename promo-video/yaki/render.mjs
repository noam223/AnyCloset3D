// node render.mjs [--c content] [--f 16x9|9x16|1x1] [--snap 0,4.2,7.9|auto] [--sheet] [--no-audio] [--cues] [--serve-root ..]
//   --c           content module to use (content.js default; e.g. --c content-b for a variant)
//   --snap        save stills to frames/qa/<content>_<format>_<t>.jpg ("auto" = 3 per scene)
//   --sheet       with --snap: also tile them into frames/qa/sheet_<content>_<format>.jpg
//   --cues        only write audio/cues-<content>.json (timeline SFX + music map) and exit
//   --serve-root  serve a parent folder too, so content can use '../assets/...' paths
//   (default) write cues, run audio/synth.mjs, render renders/<name>_<format>.mp4
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const CHROME = process.env.CHROME_PATH || [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome', '/usr/bin/chromium',
].find(p => fs.existsSync(p));
if (!CHROME) throw new Error('Chrome not found — set CHROME_PATH');

const args = process.argv.slice(2);
const opt = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
const FORMAT = opt('--f') || '16x9';
const SNAP = opt('--snap');
const CONTENT = (opt('--c') || 'content').replace(/\.js$/, '');
const SERVE = path.resolve(ROOT, opt('--serve-root') || '.');
const PAGE = path.relative(SERVE, ROOT).split(path.sep).filter(Boolean).map(encodeURIComponent).join('/');
const SIZES = { '16x9': [1920, 1080], '9x16': [1080, 1920], '1x1': [1080, 1080] };
const [W, H] = SIZES[FORMAT] || SIZES['16x9'];

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  const p = path.join(SERVE, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!p.startsWith(SERVE) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(p).toLowerCase()] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}/${PAGE ? PAGE + '/' : ''}index.html?f=${FORMAT}&c=${encodeURIComponent(CONTENT)}`;

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--hide-scrollbars', '--force-device-scale-factor=1', '--font-render-hinting=none',
    '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--enable-webgl'],
  protocolTimeout: 600000,
});
const page = await browser.newPage();
page.on('console', m => console.log('[page]', m.text()));
page.on('pageerror', e => console.error('[page error]', e.message));
page.on('requestfailed', r => console.error('[missing]', r.url()));
page.on('response', r => { if (r.status() >= 400 && !r.url().endsWith('favicon.ico')) console.error('[404]', r.url()); });
await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
await page.goto(url, { waitUntil: 'networkidle0' });
await page.evaluate(() => window.__ready);
const cues = await page.evaluate(() => window.__cues);
const DURATION = cues.duration;
const FPS = cues.video.fps;
const NAME = cues.video.name;
const CUES = path.join(ROOT, 'audio', `cues-${CONTENT}.json`);
const MIX = path.join(ROOT, 'audio', `mix-${CONTENT}.wav`);
fs.mkdirSync(path.join(ROOT, 'audio'), { recursive: true });
fs.writeFileSync(CUES, JSON.stringify(cues, null, 1));
console.log(`duration ${DURATION}s · ${cues.scenes.map(s => `${s.type}@${s.t0}${s.in ? `(${s.in})` : ''}`).join(' → ')}`);

if (args.includes('--cues')) {
  // cues written above
} else if (SNAP) {
  const dir = path.join(ROOT, 'frames', 'qa');
  fs.mkdirSync(dir, { recursive: true });
  const files = [];
  const times = SNAP === 'auto'
    ? cues.scenes.flatMap(s => [s.t0 + 0.35, (s.t0 + s.t1) / 2, s.t1 - 0.3]).concat([0, DURATION - 0.05]).sort((a, b) => a - b)
    : SNAP.split(',').map(Number);
  for (const t of times) {
    await page.evaluate(t => window.__seek(t), t);
    const file = path.join(dir, `${CONTENT}_${FORMAT}_${t.toFixed(2)}.jpg`);
    await page.screenshot({ path: file, type: 'jpeg', quality: 85 });
    files.push(file);
  }
  if (args.includes('--sheet')) {
    const cols = W > H ? 3 : 6;
    const [tw, th] = W > H ? [640, 360] : W === H ? [400, 400] : [270, 480];
    const rows = Math.ceil(files.length / cols);
    const inputs = files.flatMap(f => ['-i', f]);
    const scaled = files.map((_, i) => `[${i}]scale=${tw}:${th}[v${i}]`).join(';');
    const pads = Array.from({ length: rows * cols - files.length }, (_, i) => `color=black:s=${tw}x${th}:d=1[p${i}]`);
    const all = [...files.map((_, i) => `[v${i}]`), ...pads.map((_, i) => `[p${i}]`)].join('');
    const layout = Array.from({ length: rows * cols }, (_, i) => `${(i % cols) * tw}_${Math.floor(i / cols) * th}`).join('|');
    const fc = [scaled, ...pads, `${all}xstack=inputs=${rows * cols}:layout=${layout}`].filter(Boolean).join(';');
    const sheet = path.join(dir, `sheet_${CONTENT}_${FORMAT}.jpg`);
    spawnSync('ffmpeg', ['-loglevel', 'error', '-y', ...inputs, '-filter_complex', fc, '-frames:v', '1', sheet], { stdio: 'inherit' });
    console.log(sheet);
  } else files.forEach(f => console.log(f));
} else {
  const outDir = path.join(ROOT, 'renders');
  fs.mkdirSync(outDir, { recursive: true });
  const out = path.join(outDir, `${NAME}_${FORMAT}.mp4`);
  const audio = MIX;
  if (!args.includes('--no-audio')) {
    const r = spawnSync(process.execPath, [path.join(ROOT, 'audio', 'synth.mjs'), CUES, MIX], { stdio: 'inherit' });
    if (r.status !== 0) throw new Error('audio synth failed');
  }
  const withAudio = !args.includes('--no-audio') && fs.existsSync(audio);
  const ff = spawn('ffmpeg', [
    '-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
    ...(withAudio ? ['-i', audio, '-c:a', 'aac', '-b:a', '192k', '-shortest'] : []),
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
    '-t', String(DURATION), out,
  ], { stdio: ['pipe', 'ignore', 'inherit'] });
  const total = Math.round(FPS * DURATION);
  const t0 = Date.now();
  for (let i = 0; i < total; i++) {
    await page.evaluate(t => window.__seek(t), i / FPS);
    const buf = await page.screenshot({ type: 'jpeg', quality: 95 });
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
    if (i % 90 === 0) console.log(`frame ${i}/${total}  ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  }
  ff.stdin.end();
  await new Promise((res, rej) => ff.on('close', c => (c === 0 ? res() : rej(new Error('ffmpeg exit ' + c)))));
  console.log('wrote', out);
}

await browser.close();
server.close();
