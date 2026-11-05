// node debug.mjs <format> <t> "<js expression>"  — evaluate inside the page at time t
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const [FORMAT = '16x9', T = '0', EXPR = '1'] = process.argv.slice(2);
const [W, H] = FORMAT === '9x16' ? [1080, 1920] : [1920, 1080];
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': p.endsWith('.js') ? 'text/javascript' : p.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const browser = await puppeteer.launch({
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: 'new',
  args: ['--force-device-scale-factor=1', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage();
page.on('pageerror', e => console.error('[page error]', e.message));
await page.setViewport({ width: W, height: H });
await page.goto(`http://127.0.0.1:${server.address().port}/index.html?f=${FORMAT}`, { waitUntil: 'networkidle0' });
await page.evaluate(() => window.__ready);
await page.evaluate(t => window.__seek(t), +T);
console.log(await page.evaluate(EXPR));
await browser.close(); server.close();
