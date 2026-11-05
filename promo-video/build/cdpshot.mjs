import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

let [src, out] = process.argv.slice(2);
if (src === 'latest') {
  const dir = path.join(os.homedir(), '.cursor', 'browser-logs');
  src = fs.readdirSync(dir)
    .filter((f) => f.startsWith('cdp-response-Page.captureScreenshot'))
    .map((f) => path.join(dir, f))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
}
const j = JSON.parse(fs.readFileSync(src, 'utf8'));
const data = j.data || j.result?.data;
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, Buffer.from(data, 'base64'));
console.log(out);
