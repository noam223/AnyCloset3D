// Uploads the month's media to Supabase Storage and schedules the page posts in social_posts.
// Usage: node outputs/social/schedule.mjs dry | test | upload | list | run
// The secret is read from %USERPROFILE%\.anycloset\social-secret.txt (Vault: social_cron_secret).

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FN = 'https://meqxnsjycvfgfhdepguo.supabase.co/functions/v1/social-publisher';
const SECRET = fs.readFileSync(path.join(os.homedir(), '.anycloset', 'social-secret.txt'), 'utf8').trim();
const CAPTIONS = path.join(ROOT, 'captions', 'anycloset3d-captions-nov-dec-2026.md');
const SIGNUP = 'https://anycloset3d.com/login.html';
const HASHTAGS = '#עיצובפנים #מעצבתפנים #ארונות #חדרארונות #תכנוןארונות #נגרות #עיצובהבית #הדמיהתלתממדית #interiordesign #closetdesign';

const seq = (prefix, n) => Array.from({ length: n }, (_, i) => `visuals/posts/${prefix}-${i + 1}.png`);

// Post 1 was published by hand; group posts (ק1–ק4) can't go through the API.
const POSTS = [
  { n: 2, at: '2026-11-17T20:30', kind: 'video', files: ['visuals/posts/video/post02-sketch-to-closet_9x16.mp4'] },
  { n: 3, at: '2026-11-19T20:30', kind: 'carousel', files: seq('post03', 8) },
  { n: 4, at: '2026-11-22T20:30', kind: 'image', files: ['visuals/posts/post04-model-vs-ai.png'] },
  { n: 5, at: '2026-11-24T20:30', kind: 'video', files: ['visuals/posts/video/post05-live-sharing_9x16.mp4'] },
  { n: 6, at: '2026-11-26T20:30', kind: 'carousel', files: seq('post06', 5) },
  { n: 7, at: '2026-11-29T20:30', kind: 'image', files: ['visuals/posts/post07-poll.png'] },
  { n: 8, at: '2026-12-01T20:30', kind: 'video', files: ['visuals/posts/video/post08-cabinet-types_9x16.mp4'] },
  { n: 9, at: '2026-12-03T20:30', kind: 'image', files: ['visuals/posts/post09-free-trial.png'] },
  { n: 10, at: '2026-12-06T18:00', kind: 'video', files: ['visuals/posts/video/post10-hanukkah-led_9x16.mp4'] },
  { n: 11, at: '2026-12-08T20:30', kind: 'carousel', files: seq('post11', 6) },
  { n: 12, at: '2026-12-10T20:30', kind: 'video', files: ['visuals/posts/video/post12-full-workflow_9x16.mp4'] },
];

function captionFor(n) {
  const md = fs.readFileSync(CAPTIONS, 'utf8').replace(/\r\n/g, '\n');
  const start = md.indexOf(`## פוסט ${n} —`);
  if (start < 0) throw new Error(`Caption for post ${n} not found`);
  const section = md.slice(start, md.indexOf('\n---', start));
  const m = section.match(/\*\*כיתוב:\*\*\n([\s\S]*?)\n\*\*קריאה לפעולה/);
  if (!m) throw new Error(`Caption block for post ${n} not found`);
  return m[1].trim();
}

function instagramVersion(fb) {
  const body = fb
    .split('\n')
    .map((line) => (line.trim() === SIGNUP ? 'קישור בביו' : line.replace(SIGNUP, 'קישור בביו')))
    .join('\n')
    .replace(/:\nקישור בביו/, '. קישור בביו');
  return `${body}\n\n${HASHTAGS}`;
}

const contentType = (f) => (f.endsWith('.mp4') ? 'video/mp4' : f.endsWith('.png') ? 'image/png' : 'image/jpeg');

async function call(action, body = {}) {
  const res = await fetch(`${FN}?action=${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-social-secret': SECRET },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${action}: ${res.status} ${JSON.stringify(data)}`);
  return data;
}

async function upload(rel) {
  const storagePath = `2026-11/${path.basename(rel)}`;
  const { signedUrl } = await call('sign-upload', { path: storagePath });
  const res = await fetch(signedUrl, {
    method: 'PUT',
    headers: { 'Content-Type': contentType(rel), 'x-upsert': 'true' },
    body: fs.readFileSync(path.join(ROOT, rel)),
  });
  if (!res.ok) throw new Error(`upload ${rel}: ${res.status} ${await res.text()}`);
  return storagePath;
}

function buildPosts() {
  return POSTS.map((p) => {
    const fb = captionFor(p.n);
    return {
      label: `2026-11 post ${String(p.n).padStart(2, '0')}`,
      scheduled_at: `${p.at}:00+02:00`,
      kind: p.kind,
      files: p.files,
      caption_fb: fb,
      caption_ig: instagramVersion(fb),
    };
  });
}

const cmd = process.argv[2] || 'dry';
if (cmd === 'dry') {
  for (const p of buildPosts()) {
    const missing = p.files.filter((f) => !fs.existsSync(path.join(ROOT, f)));
    console.log(`\n=== ${p.label} | ${p.scheduled_at} | ${p.kind} | ${p.files.length} file(s)${missing.length ? ' | MISSING: ' + missing.join(', ') : ''}`);
    console.log('--- Instagram:\n' + p.caption_ig);
  }
} else if (cmd === 'test') {
  console.log(JSON.stringify(await call('test'), null, 2));
} else if (cmd === 'list') {
  for (const p of (await call('list')).posts) {
    console.log(`${p.scheduled_at}  ${p.label}  ${p.kind}  ${p.status}${p.last_error ? '  ' + p.last_error : ''}`);
  }
} else if (cmd === 'run') {
  console.log(JSON.stringify(await call('run'), null, 2));
} else if (cmd === 'upload') {
  const posts = buildPosts();
  for (const p of posts) {
    p.media = [];
    for (const f of p.files) {
      p.media.push(await upload(f));
      console.log('uploaded', f);
    }
    delete p.files;
  }
  console.log(JSON.stringify(await call('enqueue', { posts }), null, 2));
} else {
  console.error('Unknown command. Use: dry | test | upload | list | run');
  process.exit(1);
}
