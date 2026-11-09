import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Auth is the x-social-secret header (Vault: social_cron_secret), so verify_jwt is off.
// Actions: run (pg_cron, publishes due posts), test (checks the Meta credentials), sign-upload (signed Storage upload URL),
// enqueue (upserts posts by label; posts that already went out are left untouched), list (queue status).

const BUCKET = 'social-media';
const IG_POLL_MS = 60_000;

type Post = {
  id: string;
  label: string;
  platforms: string[];
  kind: 'image' | 'carousel' | 'video';
  media: string[];
  caption_fb: string;
  caption_ig: string;
  result: Record<string, any>;
};

type Cfg = { cron_secret: string; page_id: string; page_token: string; ig_user_id: string; graph_version: string };

const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

Deno.serve(async (req) => {
  try {
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
    const { data: cfg, error: cfgErr } = await sb.rpc('social_publisher_config');
    if (cfgErr || !cfg) return json({ error: 'Config unavailable' }, 500);
    const secret = req.headers.get('x-social-secret') || '';
    if (!cfg.cron_secret || secret !== cfg.cron_secret) return json({ error: 'Unauthorized' }, 401);

    const action = new URL(req.url).searchParams.get('action') || 'run';
    if (action === 'sign-upload') return json(await signUpload(await req.json()));
    if (action === 'enqueue') return json(await enqueue(await req.json()));
    if (action === 'list') return json(await list());
    if (!cfg.page_id || !cfg.page_token) return json({ error: 'Meta credentials are not set in Vault' }, 412);
    if (action === 'test') return json(await testCredentials(cfg));
    if (action === 'run') return json(await runDue(cfg));
    return json({ error: 'Unknown action' }, 400);
  } catch (e) {
    console.error('[social-publisher]', e);
    return json({ error: String(e) }, 500);
  }
});

async function signUpload(body: { path?: string }) {
  const path = String(body?.path || '');
  if (!/^[\w\-./]+$/.test(path) || path.includes('..')) throw new Error('Invalid path');
  const { data, error } = await sb.storage.from(BUCKET).createSignedUploadUrl(path, { upsert: true });
  if (error) throw error;
  return { signedUrl: data.signedUrl, publicUrl: publicUrl(path) };
}

async function enqueue(body: { posts?: Array<Record<string, unknown>> }) {
  const posts = Array.isArray(body?.posts) ? body.posts : [];
  const { data: existing, error: exErr } = await sb.from('social_posts').select('label, status').in('label', posts.map((p) => String(p.label)));
  if (exErr) throw exErr;
  const locked = new Set((existing || []).filter((r) => !['scheduled', 'cancelled', 'failed'].includes(r.status)).map((r) => r.label));
  const rows = posts.filter((p) => !locked.has(String(p.label))).map((p) => ({
    label: String(p.label),
    scheduled_at: String(p.scheduled_at),
    platforms: p.platforms || ['facebook', 'instagram'],
    kind: String(p.kind),
    media: p.media,
    caption_fb: String(p.caption_fb || ''),
    caption_ig: String(p.caption_ig || ''),
    status: 'scheduled',
    attempts: 0,
    result: {},
    last_error: null,
  }));
  if (rows.length) {
    const { error } = await sb.from('social_posts').upsert(rows, { onConflict: 'label' });
    if (error) throw error;
  }
  return { saved: rows.map((r) => r.label), skipped_already_published: [...locked] };
}

async function list() {
  const { data, error } = await sb.from('social_posts')
    .select('label, scheduled_at, kind, platforms, status, last_error, result').order('scheduled_at');
  if (error) throw error;
  return { posts: data };
}

async function testCredentials(cfg: Cfg) {
  const page = await graph(cfg, 'GET', cfg.page_id, { fields: 'id,name,instagram_business_account{id,username}' });
  return { page: { id: page.id, name: page.name }, instagram: page.instagram_business_account || null, ig_user_id_in_vault: cfg.ig_user_id || null };
}

async function runDue(cfg: Cfg) {
  const { data: posts, error } = await sb.rpc('social_claim_due_posts', { p_limit: 3 });
  if (error) throw error;
  const summary = [];
  for (const post of (posts || []) as Post[]) {
    summary.push({ id: post.id, label: post.label, status: await processPost(cfg, post) });
  }
  return { processed: summary };
}

async function processPost(cfg: Cfg, post: Post): Promise<string> {
  const result = { ...(post.result || {}) };
  const urls = post.media.map(publicUrl);

  if (post.platforms.includes('facebook') && !result.facebook?.id && !result.facebook?.error) {
    try {
      result.facebook = { id: await publishFacebook(cfg, post, urls), at: new Date().toISOString() };
    } catch (e) {
      result.facebook = { error: errMsg(e) };
    }
  }

  if (post.platforms.includes('instagram') && !result.instagram?.id && !result.instagram?.error) {
    try {
      if (!cfg.ig_user_id) throw new Error('meta_ig_user_id is not set in Vault');
      const ig = result.instagram || {};
      if (!ig.container_id) ig.container_id = await createIgContainer(cfg, post, urls);
      const state = await waitForIgContainer(cfg, ig.container_id, post.kind === 'video' ? IG_POLL_MS : 15_000);
      if (state === 'FINISHED') {
        const pub = await graph(cfg, 'POST', `${cfg.ig_user_id}/media_publish`, { creation_id: ig.container_id });
        result.instagram = { id: pub.id, at: new Date().toISOString() };
      } else if (state === 'ERROR' || state === 'EXPIRED') {
        result.instagram = { error: `Instagram container ${state}` };
      } else {
        result.instagram = { ...ig, pending: state };
      }
    } catch (e) {
      result.instagram = { ...(result.instagram || {}), error: errMsg(e) };
    }
  }

  const states = post.platforms.map((p) => result[p] || {});
  const done = states.filter((s) => s.id).length;
  const failed = states.filter((s) => s.error).length;
  const status = done === states.length ? 'published'
    : done + failed < states.length ? 'processing'
    : done > 0 ? 'partial'
    : 'failed';
  const errors = post.platforms.filter((p) => result[p]?.error).map((p) => `${p}: ${result[p].error}`);

  const { error } = await sb.from('social_posts').update({
    status,
    result,
    last_error: errors.length ? errors.join(' | ') : null,
    published_at: done > 0 ? new Date().toISOString() : null,
  }).eq('id', post.id);
  if (error) console.error('[social-publisher] save failed', post.id, error);
  return status;
}

async function publishFacebook(cfg: Cfg, post: Post, urls: string[]): Promise<string> {
  const message = post.caption_fb;
  if (post.kind === 'video') {
    const r = await graph(cfg, 'POST', `${cfg.page_id}/videos`, { file_url: urls[0], description: message }, true);
    return r.id;
  }
  if (post.kind === 'image') {
    const r = await graph(cfg, 'POST', `${cfg.page_id}/photos`, { url: urls[0], message });
    return r.post_id || r.id;
  }
  const params: Record<string, string> = { message };
  for (let i = 0; i < urls.length; i++) {
    const photo = await graph(cfg, 'POST', `${cfg.page_id}/photos`, { url: urls[i], published: 'false' });
    params[`attached_media[${i}]`] = JSON.stringify({ media_fbid: photo.id });
  }
  const r = await graph(cfg, 'POST', `${cfg.page_id}/feed`, params);
  return r.id;
}

async function createIgContainer(cfg: Cfg, post: Post, urls: string[]): Promise<string> {
  const caption = post.caption_ig;
  if (post.kind === 'video') {
    const r = await graph(cfg, 'POST', `${cfg.ig_user_id}/media`, { media_type: 'REELS', video_url: urls[0], caption, share_to_feed: 'true' });
    return r.id;
  }
  if (post.kind === 'image') {
    const r = await graph(cfg, 'POST', `${cfg.ig_user_id}/media`, { image_url: urls[0], caption });
    return r.id;
  }
  if (urls.length > 10) throw new Error('Instagram carousels allow at most 10 items');
  const children: string[] = [];
  for (const url of urls) {
    const c = await graph(cfg, 'POST', `${cfg.ig_user_id}/media`, { image_url: url, is_carousel_item: 'true' });
    children.push(c.id);
  }
  for (const id of children) {
    const s = await waitForIgContainer(cfg, id, 20_000);
    if (s !== 'FINISHED') throw new Error(`Carousel item ${id} is ${s}`);
  }
  const r = await graph(cfg, 'POST', `${cfg.ig_user_id}/media`, { media_type: 'CAROUSEL', children: children.join(','), caption });
  return r.id;
}

async function waitForIgContainer(cfg: Cfg, id: string, budgetMs: number): Promise<string> {
  const until = Date.now() + budgetMs;
  while (true) {
    const r = await graph(cfg, 'GET', id, { fields: 'status_code' });
    const s = r.status_code || 'IN_PROGRESS';
    if (s !== 'IN_PROGRESS' || Date.now() > until) return s;
    await new Promise((res) => setTimeout(res, 5_000));
  }
}

async function graph(cfg: Cfg, method: 'GET' | 'POST', path: string, params: Record<string, string>, video = false) {
  const host = video ? 'https://graph-video.facebook.com' : 'https://graph.facebook.com';
  const qs = new URLSearchParams({ ...params, access_token: cfg.page_token });
  const url = `${host}/${cfg.graph_version}/${path}`;
  const res = method === 'GET'
    ? await fetch(`${url}?${qs}`)
    : await fetch(url, { method: 'POST', body: qs });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) {
    const e = data.error || {};
    throw new Error(`${e.message || res.statusText} (code ${e.code ?? res.status}${e.error_subcode ? '/' + e.error_subcode : ''})`);
  }
  return data;
}

function publicUrl(path: string) {
  return `${Deno.env.get('SUPABASE_URL')}/storage/v1/object/public/${BUCKET}/${path}`;
}

function errMsg(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}
