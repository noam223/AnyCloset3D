import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// create: called from the app with the user's JWT. get / sign: public, authorized by the link token.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

const BUCKET = 'order-signatures';
const MAX_HTML_BYTES = 45 * 1024 * 1024;
const MAX_SIG_CHARS = 400_000;

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

function serviceClient() {
  const url = Deno.env.get('SUPABASE_URL')!;
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${key}` } },
  });
}

function userClient(authHeader: string) {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authHeader } },
  });
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

function randomToken(): string {
  const b = new Uint8Array(24);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}

async function sha256(text: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(d), (x) => x.toString(16).padStart(2, '0')).join('');
}

/** Israeli ID (ת.ז.) check digit. */
function validIsraeliId(raw: string): boolean {
  const id = raw.replace(/\D/g, '');
  if (id.length < 5 || id.length > 9) return false;
  const p = id.padStart(9, '0');
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    let n = Number(p[i]) * ((i % 2) + 1);
    if (n > 9) n -= 9;
    sum += n;
  }
  return sum % 10 === 0;
}

async function readDoc(sb: ReturnType<typeof createClient>, path: string): Promise<string | null> {
  const { data, error } = await sb.storage.from(BUCKET).download(path);
  if (error || !data) return null;
  return await data.text();
}

async function uploadDoc(sb: ReturnType<typeof createClient>, path: string, html: string) {
  return await sb.storage.from(BUCKET).upload(path, new Blob([html], { type: 'text/html' }), {
    contentType: 'text/html',
    upsert: true,
  });
}

function businessOf(p: { business_name?: string | null; full_name?: string | null } | null): string {
  return ((p && p.business_name) || '').trim() || (p && p.full_name) || 'AnyCloset';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const sb = serviceClient();
    const url = new URL(req.url);

    if (req.method === 'GET') {
      const token = (url.searchParams.get('t') || '').replace(/[^a-f0-9]/gi, '');
      if (token.length < 32) return json({ error: 'הקישור לא תקין' }, 400);
      const { data: row } = await sb.from('order_signatures').select('*').eq('token', token).maybeSingle();
      if (!row) return json({ error: 'הקישור לא נמצא או שבוטל' }, 404);
      if (row.status === 'cancelled') return json({ error: 'בקשת החתימה בוטלה. פנו לבית העסק לקבלת קישור חדש.' }, 410);
      if (row.status === 'pending' && new Date(row.expires_at).getTime() < Date.now()) {
        return json({ error: 'תוקף הקישור פג. פנו לבית העסק לקבלת קישור חדש.' }, 410);
      }
      const html = await readDoc(sb, row.status === 'signed' && row.signed_doc_path ? row.signed_doc_path : row.doc_path);
      if (html == null) return json({ error: 'לא ניתן לטעון את המסמך' }, 500);
      const { data: prof } = await sb.from('profiles').select('business_name, full_name, logo_url').eq('id', row.user_id).maybeSingle();
      return json({
        ok: true,
        status: row.status,
        customer_name: row.customer_name || '',
        signer_name: row.signer_name || '',
        signed_at: row.signed_at,
        business_name: businessOf(prof),
        logo_url: (prof && prof.logo_url) || null,
        html,
      });
    }

    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
    const body = (await req.json()) as Record<string, unknown>;
    const action = String(body.action || '');

    if (action === 'create') {
      const auth = req.headers.get('authorization') || '';
      const uc = userClient(auth);
      const { data: u } = await uc.auth.getUser();
      const user = u && u.user;
      if (!user) return json({ error: 'לא מחובר' }, 401);

      const projectId = String(body.project_id || '').trim();
      const html = String(body.html || '');
      const customerName = String(body.customer_name || '').trim().slice(0, 120);
      if (!projectId) return json({ error: 'יש לשמור את הפרויקט לפני שליחה לחתימה' }, 400);
      if (!html.includes('data-sig="id"') || !html.includes('data-sig="sig"')) {
        return json({ error: 'המסמך לא כולל שדות חתימה' }, 400);
      }
      if (new TextEncoder().encode(html).length > MAX_HTML_BYTES) return json({ error: 'המסמך גדול מדי' }, 413);

      // RLS on the user's own client decides whether this project is theirs (incl. company access)
      const { data: proj } = await uc.from('projects').select('id').eq('id', projectId).maybeSingle();
      if (!proj) return json({ error: 'הפרויקט לא נמצא' }, 404);

      const id = crypto.randomUUID();
      const token = randomToken();
      const docPath = `${user.id}/${id}.html`;
      const up = await uploadDoc(sb, docPath, html);
      if (up.error) return json({ error: 'שמירת המסמך נכשלה: ' + up.error.message }, 500);

      const { error: insErr } = await sb.from('order_signatures').insert({
        id,
        token,
        user_id: user.id,
        project_id: projectId,
        customer_name: customerName || null,
        doc_path: docPath,
        doc_sha256: await sha256(html),
      });
      if (insErr) return json({ error: 'יצירת הבקשה נכשלה: ' + insErr.message }, 500);
      return json({ ok: true, id, token });
    }

    if (action === 'sign') {
      const token = String(body.token || '').replace(/[^a-f0-9]/gi, '');
      if (token.length < 32) return json({ error: 'הקישור לא תקין' }, 400);
      const { data: row } = await sb.from('order_signatures').select('*').eq('token', token).maybeSingle();
      if (!row) return json({ error: 'הקישור לא נמצא' }, 404);
      if (row.status === 'signed') return json({ error: 'ההזמנה כבר נחתמה' }, 409);
      if (row.status !== 'pending') return json({ error: 'בקשת החתימה בוטלה' }, 410);
      if (new Date(row.expires_at).getTime() < Date.now()) return json({ error: 'תוקף הקישור פג' }, 410);

      const idNumber = String(body.id_number || '').replace(/\D/g, '');
      const signerName = (String(body.name || '').trim() || row.customer_name || '').slice(0, 120);
      const sig = String(body.signature || '');
      if (signerName.length < 2) return json({ error: 'יש למלא שם לקוח' }, 400);
      if (!validIsraeliId(idNumber)) return json({ error: 'מספר תעודת הזהות לא תקין' }, 400);
      if (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(sig) || sig.length > MAX_SIG_CHARS || sig.length < 200) {
        return json({ error: 'יש לחתום בתיבת החתימה' }, 400);
      }

      const original = await readDoc(sb, row.doc_path);
      if (original == null) return json({ error: 'לא ניתן לטעון את המסמך' }, 500);
      if (row.doc_sha256 && (await sha256(original)) !== row.doc_sha256) {
        return json({ error: 'המסמך שונה מאז השליחה — פנו לבית העסק' }, 409);
      }

      const now = new Date();
      const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || null;
      const ua = (req.headers.get('user-agent') || '').slice(0, 400) || null;
      const when = now.toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' });
      const stamp = `<div class="cust-approval-stamp">✔ נחתם דיגיטלית ב-${esc(when)} · מזהה מסמך ${esc(row.id.slice(0, 8))}</div>`;
      const signed = original
        .replace(/<i data-sig="name">[^<]*<\/i>/, `<i data-sig="name">${esc(signerName)}</i>`)
        .replace('<i data-sig="id"></i>', `<i data-sig="id">${esc(idNumber)}</i>`)
        .replace('<i data-sig="sig"></i>', `<i data-sig="sig"><img src="${sig}" alt="חתימה"></i>`)
        .replace('<!--sig-stamp-->', stamp);

      const signedPath = `${row.user_id}/${row.id}-signed.html`;
      const up = await uploadDoc(sb, signedPath, signed);
      if (up.error) return json({ error: 'שמירת החתימה נכשלה' }, 500);

      const { data: upd, error: updErr } = await sb.from('order_signatures').update({
        status: 'signed',
        signed_doc_path: signedPath,
        signer_name: signerName,
        signer_id_number: idNumber,
        signer_ip: ip,
        signer_user_agent: ua,
        signed_at: now.toISOString(),
      }).eq('id', row.id).eq('status', 'pending').select('id');
      if (updErr || !upd || !upd.length) return json({ error: 'שמירת החתימה נכשלה' }, 500);

      if (row.project_id) {
        await sb.from('projects')
          .update({ order_status: 'ordered' })
          .eq('id', row.project_id)
          .in('order_status', ['quote', 'measured']);
      }
      return json({ ok: true, signed_at: now.toISOString() });
    }

    return json({ error: 'Unknown action' }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
