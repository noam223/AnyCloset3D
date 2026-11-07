const path = require('path');
const { pathToFileURL } = require('url');
const puppeteer = require(path.join(__dirname, '../../../../promo-video/node_modules/puppeteer-core'));

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const page_ = process.argv[2] || 'posts.html';
const only = process.argv[3] && process.argv[3] !== '*' ? process.argv[3] : null;
const OUT = path.resolve(__dirname, process.argv[4] || '..');

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--allow-file-access-from-files'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 2000, deviceScaleFactor: 1 });
  await page.goto(pathToFileURL(path.join(__dirname, page_)).href, { waitUntil: 'networkidle0' });
  await page.evaluate(() => document.fonts.ready);
  for (const el of await page.$$('[data-out]')) {
    const name = await el.evaluate(n => n.dataset.out);
    if (only && !name.startsWith(only)) continue;
    await el.screenshot({ path: path.join(OUT, name + '.png'), type: 'png', omitBackground: true });
    console.log('wrote', name);
  }
  await browser.close();
})();
