import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const PLAN_MAX_AGENTS: Record<string, number> = {
  company_standard: 5,
  company_enterprise: 15,
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

function normUser(raw: string): string {
  return String(raw || '').trim().toLowerCase().replace(/[^a-z0-9._-]/g, '');
}

function agentEmail(username: string, code: string): string {
  return `${username}.${code}@agents.anycloset.internal`;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const url = Deno.env.get('SUPABASE_URL') || '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  if (!url || !serviceKey) return json({ error: 'Server misconfigured' }, 500);

  const authHeader = req.headers.get('Authorization') || '';
  if (!authHeader.startsWith('Bearer ')) return json({ error: 'Not authenticated' }, 401);

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: 'גוף הבקשה אינו תקין' }, 400);
  }

  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: userRes, error: userErr } = await admin.auth.getUser(authHeader.slice(7));
  const callerId = userRes?.user?.id;
  if (userErr || !callerId) return json({ error: 'Not authenticated' }, 401);

  const { data: me } = await admin
    .from('profiles')
    .select('id, company_id, company_role, is_active, plan, subscription_status, trial_ends_at, subscription_ends_at, full_name')
    .eq('id', callerId)
    .maybeSingle();
  if (!me?.company_id || me.company_role !== 'admin' || me.is_active === false) {
    return json({ error: 'רק אדמין החברה יכול לנהל סוכנים' }, 403);
  }

  const { data: company } = await admin
    .from('companies')
    .select('id, code, name, admin_user_id, max_agents, default_visibility')
    .eq('id', me.company_id)
    .maybeSingle();
  if (!company) return json({ error: 'החברה לא נמצאה' }, 404);

  const { count: activeCount } = await admin
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', company.id)
    .eq('is_active', true);

  const unlimitedAgents = company.max_agents === 0;
  const maxAgents = unlimitedAgents
    ? 0
    : (company.max_agents != null
      ? Number(company.max_agents)
      : (PLAN_MAX_AGENTS[me.plan || ''] || 5));

  const action = String(body.action || 'list');

  if (action === 'list' || action === 'meta') {
    const { data: members } = await admin
      .from('profiles')
      .select('id, full_name, first_name, last_name, agent_username, company_role, is_active, created_at')
      .eq('company_id', company.id)
      .order('company_role', { ascending: true })
      .order('created_at', { ascending: true });
    return json({
      company: {
        id: company.id,
        code: company.code,
        name: company.name,
        default_visibility: company.default_visibility,
        max_agents: maxAgents,
        active_count: activeCount || 0,
      },
      members: members || [],
    });
  }

  if (action === 'set_default_visibility') {
    const vis = body.default_visibility === 'company' ? 'company' : 'private';
    const { error } = await admin
      .from('companies')
      .update({ default_visibility: vis })
      .eq('id', company.id);
    if (error) return json({ error: error.message }, 400);
    return json({ ok: true, default_visibility: vis });
  }

  if (action === 'create') {
    const username = normUser(String(body.username || ''));
    const password = String(body.password || '');
    const fullName = String(body.full_name || username).trim();
    if (username.length < 2) return json({ error: 'שם משתמש קצר מדי' }, 400);
    if (password.length < 6) return json({ error: 'הסיסמה חייבת לפחות 6 תווים' }, 400);
    if (!unlimitedAgents && (activeCount || 0) >= maxAgents) {
      return json({ error: `הגעתם למכסת ${maxAgents} סוכנים` }, 400);
    }

    const { data: exists } = await admin
      .from('profiles')
      .select('id')
      .eq('company_id', company.id)
      .ilike('agent_username', username)
      .maybeSingle();
    if (exists) return json({ error: 'שם המשתמש כבר קיים בחברה' }, 400);

    const email = agentEmail(username, company.code);
    const { data: created, error: cErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName, username, company_code: company.code },
    });
    if (cErr || !created?.user) {
      return json({ error: cErr?.message || 'לא ניתן ליצור את המשתמש' }, 400);
    }

    const { error: uErr } = await admin.from('profiles').update({
      full_name: fullName,
      username,
      agent_username: username,
      company_id: company.id,
      company_role: 'agent',
      is_active: true,
      plan: me.plan,
      subscription_status: me.subscription_status,
      trial_ends_at: me.trial_ends_at,
      subscription_ends_at: me.subscription_ends_at,
    }).eq('id', created.user.id);
    if (uErr) return json({ error: uErr.message }, 400);

    return json({
      ok: true,
      member: {
        id: created.user.id,
        full_name: fullName,
        agent_username: username,
        company_role: 'agent',
        is_active: true,
      },
    });
  }

  if (action === 'disable' || action === 'enable' || action === 'reset_password') {
    const targetId = String(body.user_id || '');
    if (!targetId) return json({ error: 'חסר מזהה משתמש' }, 400);
    if (targetId === callerId && action === 'disable') {
      return json({ error: 'לא ניתן להשבית את האדמין המחובר' }, 400);
    }

    const { data: target } = await admin
      .from('profiles')
      .select('id, company_id, company_role')
      .eq('id', targetId)
      .maybeSingle();
    if (!target || target.company_id !== company.id) return json({ error: 'המשתמש לא שייך לחברה' }, 404);

    if (action === 'reset_password') {
      const password = String(body.password || '');
      if (password.length < 6) return json({ error: 'הסיסמה חייבת לפחות 6 תווים' }, 400);
      const { error } = await admin.auth.admin.updateUserById(targetId, { password });
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    const { error } = await admin
      .from('profiles')
      .update({ is_active: action === 'enable' })
      .eq('id', targetId);
    if (error) return json({ error: error.message }, 400);
    if (action === 'disable') {
      await admin.auth.admin.signOut(targetId, 'global').catch(() => null);
    }
    return json({ ok: true });
  }

  if (action === 'delete') {
    const targetId = String(body.user_id || '');
    if (!targetId) return json({ error: 'חסר מזהה משתמש' }, 400);
    if (targetId === callerId) return json({ error: 'לא ניתן למחוק את האדמין המחובר' }, 400);

    const { data: target } = await admin
      .from('profiles')
      .select('id, company_id, company_role')
      .eq('id', targetId)
      .maybeSingle();
    if (!target || target.company_id !== company.id) return json({ error: 'המשתמש לא שייך לחברה' }, 404);
    if (target.company_role === 'admin' || targetId === company.admin_user_id) {
      return json({ error: 'לא ניתן למחוק את אדמין החברה' }, 400);
    }

    const destId = company.admin_user_id || callerId;
    const { error: pErr } = await admin
      .from('projects')
      .update({ user_id: destId, company_id: company.id })
      .eq('user_id', targetId)
      .eq('company_id', company.id);
    if (pErr) return json({ error: 'לא ניתן להעביר את הפרויקטים: ' + pErr.message }, 400);

    await admin.from('measurement_inbox').update({ user_id: destId }).eq('user_id', targetId);
    await admin.from('project_agent_access').delete().eq('user_id', targetId);
    await admin.auth.admin.signOut(targetId, 'global').catch(() => null);

    const { error: dErr } = await admin.auth.admin.deleteUser(targetId);
    if (dErr) return json({ error: dErr.message }, 400);
    return json({ ok: true });
  }

  if (action === 'transfer_project') {
    const projectId = String(body.project_id || '');
    const toUserId = String(body.to_user_id || '');
    if (!projectId || !toUserId) return json({ error: 'חסרים פרטי העברה' }, 400);
    const { data: dest } = await admin
      .from('profiles')
      .select('id, company_id, is_active')
      .eq('id', toUserId)
      .maybeSingle();
    if (!dest || dest.company_id !== company.id || dest.is_active === false) {
      return json({ error: 'הסוכן היעד אינו תקין' }, 400);
    }
    const { error } = await admin
      .from('projects')
      .update({ user_id: toUserId, company_id: company.id })
      .eq('id', projectId)
      .eq('company_id', company.id);
    if (error) return json({ error: error.message }, 400);
    return json({ ok: true });
  }

  return json({ error: 'פעולה לא מוכרת' }, 400);
});
