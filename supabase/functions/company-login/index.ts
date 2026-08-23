import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

function normUser(raw: string): string {
  return String(raw || '').trim().toLowerCase().replace(/\s+/g, '');
}

function normCode(raw: string): string {
  return String(raw || '').replace(/\D/g, '').slice(0, 8);
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const url = Deno.env.get('SUPABASE_URL') || '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
  if (!url || !serviceKey || !anonKey) return json({ error: 'Server misconfigured' }, 500);

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: 'גוף הבקשה אינו תקין' }, 400);
  }

  const code = normCode(String(body.company_code || body.code || ''));
  const username = normUser(String(body.username || ''));
  const password = String(body.password || '');
  if (code.length < 4 || !username || password.length < 6) {
    return json({ error: 'יש למלא מספר חברה, שם משתמש וסיסמה' }, 400);
  }

  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  const { data: company, error: cErr } = await admin
    .from('companies')
    .select('id, code, admin_user_id')
    .eq('code', code)
    .maybeSingle();
  if (cErr) return json({ error: 'שגיאה בחיפוש החברה' }, 500);
  if (!company) return json({ error: 'מספר חברה או פרטי התחברות שגויים' }, 401);

  const { data: profile, error: pErr } = await admin
    .from('profiles')
    .select('id, is_active, agent_username')
    .eq('company_id', company.id)
    .ilike('agent_username', username)
    .maybeSingle();
  if (pErr) return json({ error: 'שגיאה בחיפוש המשתמש' }, 500);
  if (!profile) return json({ error: 'מספר חברה או פרטי התחברות שגויים' }, 401);
  if (profile.is_active === false) return json({ error: 'המשתמש הושבת. פנו לאדמין החברה.' }, 403);

  const { data: userData, error: uErr } = await admin.auth.admin.getUserById(profile.id);
  const email = userData?.user?.email || '';
  if (uErr || !email) return json({ error: 'מספר חברה או פרטי התחברות שגויים' }, 401);

  const anon = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: signed, error: sErr } = await anon.auth.signInWithPassword({ email, password });
  if (sErr || !signed?.session) return json({ error: 'מספר חברה או פרטי התחברות שגויים' }, 401);

  return json({
    session: {
      access_token: signed.session.access_token,
      refresh_token: signed.session.refresh_token,
      expires_in: signed.session.expires_in,
      expires_at: signed.session.expires_at,
      token_type: signed.session.token_type,
    },
  });
});
