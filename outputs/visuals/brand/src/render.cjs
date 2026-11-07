const path = require('path');
const { pathToFileURL } = require('url');
const puppeteer = require(path.join(__dirname, '../../../../promo-video/node_modules/puppeteer-core'));

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const OUT = path.join(__dirname, '..');

const jobs = [
  { html: 'profile.html', out: 'anycloset3d-profile.png', w: 720, h: 720, scale: 1.5 },
  { html: 'cover.html', out: 'anycloset3d-cover.png', w: 1640, h: 624, scale: 1 },
  { html: 'cover.html', out: 'preview-cover-mobile-crop.png', w: 1640, h: 624, scale: 1, clip: { x: 265, y: 0, width: 1110, height: 624 } },
];

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--allow-file-access-from-files'] });
  for (const j of jobs) {
    const page = await browser.newPage();
    await page.setViewport({ width: j.w, height: j.h, deviceScaleFactor: j.scale });
    await page.goto(pathToFileURL(path.join(__dirname, j.html)).href, { waitUntil: 'networkidle0' });
    await page.evaluate(() => document.fonts.ready);
    const canvas = await page.$('.canvas');
    await canvas.screenshot({ path: path.join(OUT, j.out), type: 'png', ...(j.clip ? { clip: j.clip } : {}) });
    await page.close();
    console.log('wrote', j.out);
  }
  await browser.close();
})();
