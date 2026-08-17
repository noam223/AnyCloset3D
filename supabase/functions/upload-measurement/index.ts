import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-ingest-token',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

const MAX_FILE_BYTES = 18 * 1024 * 1024;
const MAX_FILES = 12;
const ALLOWED_MIME = new Set([
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/pjpeg',
  'image/png',
]);

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

function pickToken(req: Request, body: Record<string, unknown>): string {
  const header = req.headers.get('x-ingest-token') || '';
  const url = new URL(req.url);
  const q = url.searchParams.get('t') || url.searchParams.get('token') || '';
  const fromBody = body.token || body.ingest_token || body.t;
  const raw = header || q || (typeof fromBody === 'string' ? fromBody : '');
  return normalizeToken(String(raw || ''));
}

function normalizeToken(raw: string): string {
  let t = String(raw || '').trim();
  if (!t) return '';
  try {
    if (/https?:\/\//i.test(t) || t.indexOf('t=') !== -1 || t.indexOf('token=') !== -1) {
      const u = new URL(t.startsWith('http') ? t : ('https://local.invalid/' + t.replace(/^[?&]/, '?')));
      t = u.searchParams.get('t') || u.searchParams.get('token') || t;
    }
  } catch {
    const m = t.match(/[?&](?:t|token)=([^&\s]+)/i);
    if (m) t = decodeURIComponent(m[1]);
  }
  t = t.trim();
  const hex = t.replace(/[^a-f0-9]/gi, '');
  return hex.length >= 16 ? hex : t;
}

async function profileByToken(sb: ReturnType<typeof createClient>, token: string) {
  if (!token) return { profile: null, error: 'Missing token' };
  const { data, error } = await sb
    .from('profiles')
    .select('id, business_name, full_name, whatsapp_ingest_token')
    .eq('whatsapp_ingest_token', token)
    .limit(1);
  if (error) {
    // maybeSingle() treats 0 rows as PGRST116 — treat as not found, not a server crash
    if (error.code === 'PGRST116') return { profile: null, error: null };
    console.error('profileByToken', error.code, error.message);
    return { profile: null, error: error.message };
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return { profile: null, error: null };
  return { profile: row, error: null };
}

function guessExt(mime: string, fileName: string): string {
  const fromName = (fileName.split('.').pop() || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (fromName === 'pdf' || fromName === 'jpg' || fromName === 'jpeg' || fromName === 'png') {
    return fromName === 'jpeg' ? 'jpg' : fromName;
  }
  if (mime.includes('pdf')) return 'pdf';
  if (mime.includes('png')) return 'png';
  if (mime.includes('jpeg') || mime.includes('jpg')) return 'jpg';
  return 'bin';
}

function safeFileName(name: string, ext: string): string {
  const base = (name || `measurement.${ext}`)
    .replace(/[^\w.\-()\u0590-\u05FF ]+/g, '_')
    .slice(0, 160);
  return base.includes('.') ? base : `${base}.${ext}`;
}

function isAllowedFile(name: string, mime: string, size: number): string | null {
  const m = (mime || '').toLowerCase();
  const ext = (name.split('.').pop() || '').toLowerCase();
  const okExt = ext === 'pdf' || ext === 'jpg' || ext === 'jpeg' || ext === 'png';
  if (!ALLOWED_MIME.has(m) && !okExt) return 'מותר רק PDF, JPG או PNG';
  if (!size || size <= 0) return 'קובץ ריק';
  if (size > MAX_FILE_BYTES) return 'קובץ גדול מדי (עד 18MB)';
  return null;
}

function serviceClient() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  return createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${serviceKey}` } },
  });
}

function businessName(profile: { business_name?: string | null; full_name?: string | null }): string {
  return (profile.business_name || '').trim() || profile.full_name || 'AnyCloset';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const sb = serviceClient();

    if (req.method === 'GET') {
      const token = pickToken(req, {});
      if (!token) return json({ error: 'חסר קישור. בקשו קישור חדש מבעל החנות.' }, 401);
      const found = await profileByToken(sb, token);
      if (found.error) return json({ error: 'שגיאת שרת בטעינת הקישור' }, 500);
      if (!found.profile) return json({ error: 'הקישור לא תקין. בקשו קישור חדש מבעל החנות.' }, 401);
      const profile = found.profile;

      const { data: projects, error: projectsError } = await sb
        .from('projects')
        .select('id, name, customer_name, customer_order_num, order_status, updated_at')
        .eq('user_id', profile.id)
        .order('updated_at', { ascending: false })
        .limit(200);

      if (projectsError) {
        return json({ error: 'לא ניתן לטעון את רשימת הפרויקטים' }, 500);
      }

      return json({
        ok: true,
        business_name: businessName(profile),
        projects: (projects || []).map((p) => ({
          id: p.id,
          name: p.name || 'ללא שם',
          customer_name: p.customer_name || '',
          customer_order_num: p.customer_order_num || '',
          order_status: p.order_status || 'quote',
        })),
      });
    }

    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

    const body = (await req.json()) as Record<string, unknown>;
    const token = pickToken(req, body);
    if (!token) return json({ error: 'חסר קישור. בקשו קישור חדש מבעל החנות.' }, 401);
    const found = await profileByToken(sb, token);
    if (found.error) return json({ error: 'שגיאת שרת בטעינת הקישור' }, 500);
    if (!found.profile) return json({ error: 'הקישור לא תקין. בקשו קישור חדש מבעל החנות.' }, 401);
    const profile = found.profile;

    const action = String(body.action || 'init');
    const customerName = String(body.customer_name || '').trim().slice(0, 80);
    const projectId = String(body.project_id || '').trim();

    let project: { id: string; name: string; order_status: string | null } | null = null;
    if (projectId) {
      const { data: proj } = await sb
        .from('projects')
        .select('id, name, order_status')
        .eq('id', projectId)
        .eq('user_id', profile.id)
        .maybeSingle();
      if (!proj) return json({ error: 'הפרויקט לא נמצא' }, 400);
      project = proj;
    }

    if (action === 'init') {
      const files = Array.isArray(body.files) ? body.files : [];
      if (!files.length) return json({ error: 'לא נבחרו קבצים' }, 400);
      if (files.length > MAX_FILES) return json({ error: `עד ${MAX_FILES} קבצים` }, 400);
      if (!project && customerName.length < 2) {
        return json({ error: 'בחרו לקוח מהרשימה או כתבו שם לקוח' }, 400);
      }

      const uploads = [];
      for (let i = 0; i < files.length; i++) {
        const f = files[i] as Record<string, unknown>;
        const name = String(f.name || `file-${i}`);
        const type = String(f.type || '');
        const size = Number(f.size || 0);
        const bad = isAllowedFile(name, type, size);
        if (bad) return json({ error: `${name}: ${bad}` }, 400);
        const ext = guessExt(type, name);
        const path = `${profile.id}/${Date.now()}_${crypto.randomUUID().slice(0, 8)}.${ext}`;
        const { data, error } = await sb.storage.from('measurements').createSignedUploadUrl(path);
        if (error || !data) {
          return json({ error: 'לא ניתן להתחיל העלאה: ' + (error?.message || '') }, 500);
        }
        uploads.push({
          index: i,
          path: data.path || path,
          token: data.token,
          signedUrl: data.signedUrl,
          file_name: safeFileName(name, ext),
          mime_type: type || (ext === 'pdf' ? 'application/pdf' : 'image/jpeg'),
          file_size: size,
        });
      }
      return json({ ok: true, uploads });
    }

    if (action === 'commit') {
      const files = Array.isArray(body.files) ? body.files : [];
      if (!files.length) return json({ error: 'אין קבצים לשמירה' }, 400);
      if (!project && customerName.length < 2) {
        return json({ error: 'בחרו לקוח מהרשימה או כתבו שם לקוח' }, 400);
      }

      const displayName = project
        ? (customerName || project.name || 'לקוח')
        : customerName;
      const created: string[] = [];

      for (const raw of files) {
        const f = raw as Record<string, unknown>;
        const path = String(f.path || '');
        if (!path.startsWith(profile.id + '/')) {
          return json({ error: 'נתיב קובץ לא חוקי' }, 400);
        }
        const { data: signed } = await sb.storage.from('measurements').createSignedUrl(path, 60);
        if (!signed?.signedUrl) {
          return json({ error: 'הקובץ לא הועלה במלואו' }, 400);
        }
        const mime = String(f.mime_type || f.type || 'application/octet-stream');
        const fileName = String(f.file_name || f.name || 'measurement');
        const fileSize = Number(f.file_size || f.size || 0);

        const { data: week } = await sb.storage
          .from('measurements')
          .createSignedUrl(path, 60 * 60 * 24 * 7);

        const { data: row, error: insErr } = await sb
          .from('measurement_inbox')
          .insert({
            user_id: profile.id,
            source_phone: null,
            sender_name: displayName,
            caption: displayName,
            file_name: fileName,
            mime_type: mime,
            file_size: fileSize || null,
            storage_path: path,
            public_url: week?.signedUrl || null,
            status: project ? 'linked' : 'unread',
            linked_project_id: project ? project.id : null,
            linked_at: project ? new Date().toISOString() : null,
            external_message_id: null,
          })
          .select('id')
          .single();

        if (insErr) return json({ error: 'שמירה נכשלה: ' + insErr.message }, 500);

        if (project) {
          await sb.from('project_attachments').insert({
            project_id: project.id,
            user_id: profile.id,
            measurement_id: row.id,
            label: 'מדידה מהשטח',
            file_name: fileName,
            mime_type: mime,
            storage_path: path,
            public_url: week?.signedUrl || null,
          });
        }
        created.push(row.id);
      }

      if (project) {
        const st = project.order_status || 'quote';
        if (st === 'quote' || !st) {
          await sb
            .from('projects')
            .update({ order_status: 'measured', updated_at: new Date().toISOString() })
            .eq('id', project.id)
            .eq('user_id', profile.id);
        }
      }

      return json({
        ok: true,
        count: created.length,
        linked: !!project,
        customer_name: displayName,
      });
    }

    return json({ error: 'Unknown action' }, 400);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: msg }, 500);
  }
});
