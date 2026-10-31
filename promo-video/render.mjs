// node render.mjs [--f 16x9|9x16] [--snap 0,4.2,7.9] [--no-audio]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import { FPS, DURATION } from './timing.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const CHROME = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const args = process.argv.slice(2);
const opt = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
const FORMAT = opt('--f') || '16x9';
const SNAP = opt('--snap');
const PORTRAIT = FORMAT === '9x16';
const [W, H] = PORTRAIT ? [1080, 1920] : [1920, 1080];

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}/index.html?f=${FORMAT}`;

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--hide-scrollbars', '--force-device-scale-factor=1', '--disable-gpu-vsync', '--font-render-hinting=none'],
});
const page = await browser.newPage();
page.on('console', m => console.log('[page]', m.text()));
page.on('pageerror', e => console.error('[page error]', e.message));
await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
await page.goto(url, { waitUntil: 'networkidle0' });
await page.evaluate(() => window.__ready);

if (SNAP) {
  const dir = path.join(ROOT, 'frames', 'qa');
  fs.mkdirSync(dir, { recursive: true });
  for (const t of SNAP.split(',').map(Number)) {
    await page.evaluate(t => window.__seek(t), t);
    const file = path.join(dir, `${FORMAT}_${t.toFixed(2)}.jpg`);
    await page.screenshot({ path: file, type: 'jpeg', quality: 85 });
    console.log(file);
  }
} else {
  const outDir = path.join(ROOT, 'renders');
  fs.mkdirSync(outDir, { recursive: true });
  const out = path.join(outDir, `anycloset-promo_${FORMAT}.mp4`);
  const audio = path.join(ROOT, 'audio', 'mix.wav');
  const withAudio = !args.includes('--no-audio') && fs.existsSync(audio);
  const ff = spawn('ffmpeg', [
    '-y', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
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
    if (i % 60 === 0) console.log(`frame ${i}/${total}  ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  }
  ff.stdin.end();
  await new Promise((res, rej) => ff.on('close', c => (c === 0 ? res() : rej(new Error('ffmpeg exit ' + c)))));
  console.log('wrote', out);
}

await browser.close();
server.close();
