// Drives the customer viewer (viewer.html?token=…) in a phone-emulated Chrome for tutorial captures.
// Usage: node viewer-ctl.mjs "<share url>" [port]
// HTTP API (localhost only):
//   POST /eval   body = JS expression (awaited, returnByValue)  → JSON result
//   GET  /shot?out=shots-raw/x.png                              → saves a full-res PNG of the viewport
//   GET  /tap?x=..&y=..                                         → touch tap at CSS px
//   GET  /quit
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const [url, portArg] = process.argv.slice(2);
const PORT = Number(portArg) || 5799;
const CHROME = process.env.CHROME_PATH || [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
].find(p => fs.existsSync(p));

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--hide-scrollbars', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--enable-webgl', '--lang=he-IL'],
  protocolTimeout: 600000,
});
const page = await browser.newPage();
await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1');
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
page.on('pageerror', e => console.log('[pageerror]', String(e.message).slice(0, 200)));
await page.goto(url, { waitUntil: 'networkidle2', timeout: 120000 });
console.log('viewer loaded');

const body = req => new Promise(r => { let s = ''; req.on('data', d => s += d); req.on('end', () => r(s)); });
http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  try {
    if (u.pathname === '/eval') {
      const js = await body(req);
      const out = await page.evaluate(`(async()=>{ return (${js}); })()`);
      res.end(JSON.stringify(out ?? null));
    } else if (u.pathname === '/shot') {
      const out = path.resolve(ROOT, u.searchParams.get('out'));
      fs.mkdirSync(path.dirname(out), { recursive: true });
      await new Promise(r => setTimeout(r, 300));
      await page.screenshot({ path: out, type: out.endsWith('.jpg') ? 'jpeg' : 'png', ...(out.endsWith('.jpg') ? { quality: 92 } : {}) });
      res.end(JSON.stringify({ out }));
    } else if (u.pathname === '/tap') {
      await page.touchscreen.tap(Number(u.searchParams.get('x')), Number(u.searchParams.get('y')));
      res.end('{"ok":true}');
    } else if (u.pathname === '/quit') {
      res.end('{"bye":true}');
      await browser.close();
      process.exit(0);
    } else { res.statusCode = 404; res.end('{}'); }
  } catch (e) { res.statusCode = 500; res.end(JSON.stringify({ error: String(e.message || e) })); }
}).listen(PORT, '127.0.0.1', () => console.log('ctl on', PORT));
