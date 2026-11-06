// Composes tutorial-11 frames (1904×1071): customer-viewer phone capture on the right, and on the left
// either an enlarged crop of the phone UI or the designer's editor capture (live-sync chapters).
// Geometry must match the P()/K()/E() helpers in tut-11.js.
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const RAW = 'shots-raw/tut11';
const OUT = 'assets/shots';
const W = 1904, H = 1071;
export const PHONE = { x: 1450, y: 30, s: 880 / 844 };
export const BOX = { x: 60, y: 100, w: 1300, h: 830 };
export const ED = { x: 50, y: 25, s: 890 / 1276 };
const ACCOUNT_BLUR = [165, 6, 120, 32];

const FRAMES = JSON.parse(fs.readFileSync('tut11-frames.json', 'utf8'));

const url = f => 'file:///' + path.resolve(RAW, f + '.jpg').replace(/\\/g, '/');
const cropGeom = ([cx, cy, cw, ch]) => {
  const s = Math.min(3, BOX.w / cw, BOX.h / ch);
  return { s, x: BOX.x + (BOX.w - cw * s) / 2, y: BOX.y + (BOX.h - ch * s) / 2, w: cw * s, h: ch * s };
};

function html(fr) {
  const ps = PHONE.s, pw = 390 * ps, ph = 844 * ps;
  let left = '';
  if (fr.crop) {
    const g = cropGeom(fr.crop);
    left = `<div class="crop" style="left:${g.x}px;top:${g.y}px;width:${g.w}px;height:${g.h}px">
      <img src="${url(fr.phone)}" style="width:${390 * g.s}px;left:${-fr.crop[0] * g.s}px;top:${-fr.crop[1] * g.s}px"></div>`;
  }
  if (fr.editor) {
    const s = ED.s, b = ACCOUNT_BLUR;
    left = `<div class="ed" style="left:${ED.x}px;top:${ED.y}px;width:${1911 * s}px;height:${1276 * s}px">
      <img src="${url(fr.editor)}" style="width:${1911 * s}px">
      <div class="blur" style="left:${b[0] * s}px;top:${b[1] * s}px;width:${b[2] * s}px;height:${b[3] * s}px"></div></div>
      <div class="live" style="left:${ED.x + 1911 * s - 20}px;top:${PHONE.y + ph / 2 - 26}px">LIVE ⟵</div>`;
  }
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;width:${W}px;height:${H}px;overflow:hidden}
  body{background:radial-gradient(1200px 800px at 30% 40%, #18305a 0%, #0b1730 60%, #070f22 100%);font-family:'Segoe UI',Arial,sans-serif}
  .phone{position:absolute;left:${PHONE.x - 14}px;top:${PHONE.y - 14}px;width:${pw + 28}px;height:${ph + 28}px;border-radius:58px;
    background:#0a0f1a;box-shadow:0 30px 70px rgba(0,0,0,.6),0 0 0 2px rgba(125,234,255,.25) inset}
  .scr{position:absolute;left:14px;top:14px;width:${pw}px;height:${ph}px;border-radius:44px;overflow:hidden;background:#fff}
  .scr img{width:100%;height:100%;display:block}
  .crop{position:absolute;overflow:hidden;border-radius:22px;background:#fff;box-shadow:0 24px 60px rgba(0,0,0,.55),0 0 0 2px rgba(125,234,255,.3)}
  .crop img,.ed img{position:absolute;left:0;top:0;display:block}
  .ed{position:absolute;overflow:hidden;border-radius:16px;box-shadow:0 24px 60px rgba(0,0,0,.55),0 0 0 2px rgba(125,234,255,.25)}
  .blur{position:absolute;backdrop-filter:blur(7px);background:rgba(240,244,250,.35);border-radius:8px}
  .live{position:absolute;z-index:3;background:#22c55e;color:#fff;font:800 30px 'Segoe UI',Arial;padding:8px 18px;border-radius:30px;
    box-shadow:0 8px 24px rgba(34,197,94,.5),0 0 0 4px rgba(255,255,255,.85)}
  </style></head><body>${left}
  <div class="phone"><div class="scr"><img src="${url(fr.phone)}"></div></div></body></html>`;
}

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--allow-file-access-from-files'] });
const page = await browser.newPage();
await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
for (const fr of FRAMES) {
  const tmp = path.resolve(RAW, '_compose.html');
  fs.writeFileSync(tmp, html(fr));
  await page.goto('file:///' + tmp.replace(/\\/g, '/'), { waitUntil: 'load' });
  await page.evaluate(() => Promise.all([...document.images].map(i => i.decode())));
  await page.screenshot({ path: path.join(OUT, fr.out + '.jpg'), type: 'jpeg', quality: 92 });
  console.log(fr.out);
}
fs.unlinkSync(path.resolve(RAW, '_compose.html'));
await browser.close();
