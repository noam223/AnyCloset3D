// In-app help assistant fallback: answers questions the local knowledge base (help-chat.js)
// couldn't, grounded on the closest knowledge-base entries the client sends along.
// Signed-in users only; capped per user per day.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const MODELS = ['gemini-3-flash-preview', 'gemini-3-flash', 'gemini-2.5-flash'];
const DAILY_LIMIT = 40;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const clip = (s: unknown, n: number) => String(s ?? '').slice(0, n);

function systemPrompt(plan: string) {
  return [
    'אתה עוזר התמיכה של AnyCloset 3D, מערכת דפדפן לתכנון ארונות ונגרות בתלת-ממד למעצבות פנים ולנגרים.',
    'ענה בעברית, בפנייה ברבים כמו בממשק (לחצו, בחרו), קצר וברור: משפט פתיחה ואחריו צעדים ממוספרים אם צריך. בלי הקדמות ובלי התנצלויות.',
    'הסתמך רק על קטעי הידע שמצורפים. אל תמציא כפתורים, תפריטים או יכולות שלא מופיעים בהם.',
    'אם התשובה לא נמצאת בקטעים (למשל חיוב, ביטול מנוי, תקלה טכנית או באג), אמור בכנות שאין לך מידע על זה, והמלץ לפנות לתמיכה בוואטסאפ.',
    'אפשר להדגיש שמות כפתורים עם **כוכביות**. בלי קישורים ובלי HTML.',
    plan ? `המנוי של המשתמש: ${plan}.` : '',
    'החזר JSON בלבד: {"answer": "...", "ref": מספר הקטע הכי רלוונטי (מ-0) או null}.',
  ].filter(Boolean).join('\n');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const token = (req.headers.get('Authorization') || '').replace('Bearer ', '');
  const { data: { user } } = await sb.auth.getUser(token);
  if (!user) return json({ error: 'unauthorized' }, 401);

  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { count } = await sb.from('help_chat_log').select('id', { count: 'exact', head: true })
    .eq('user_id', user.id).eq('source', 'ai').gte('created_at', since);
  if ((count ?? 0) >= DAILY_LIMIT) return json({ error: 'rate_limited' }, 429);

  const body = await req.json().catch(() => ({}));
  const question = clip(body.question, 1000).trim();
  if (!question) return json({ error: 'question_required' }, 400);
  const context = (Array.isArray(body.context) ? body.context : []).slice(0, 8)
    .map((c: { title?: string; text?: string }, i: number) => `[${i}] ${clip(c.title, 200)}\n${clip(c.text, 1200)}`)
    .join('\n\n');
  const history = (Array.isArray(body.history) ? body.history : []).slice(-6)
    .map((h: { role?: string; text?: string }) => ({
      role: h.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: clip(h.text, 1500) }],
    }));

  const payload = {
    systemInstruction: { parts: [{ text: systemPrompt(clip(body.plan, 80)) }] },
    contents: [
      ...history,
      { role: 'user', parts: [{ text: `קטעי ידע:\n${context || '(אין)'}\n\nשאלה: ${question}` }] },
    ],
    generationConfig: { temperature: 0.2, maxOutputTokens: 4096, responseMimeType: 'application/json' },
  };

  const key = Deno.env.get('GEMINI_API_KEY')!;
  let res: Response | null = null;
  let model = '';
  for (const m of MODELS) {
    model = m;
    res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (res.ok) break;
    console.warn(`${m} failed (${res.status}): ${await res.text()}`);
    if (res.status !== 404 && res.status !== 400) break;
  }
  if (!res || !res.ok) return json({ error: 'ai_unavailable' }, 502);

  const data = await res.json();
  const raw = (data?.candidates?.[0]?.content?.parts || []).map((p: { text?: string }) => p.text || '').join('');
  let answer = '';
  let ref: number | null = null;
  try {
    const parsed = JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g, ''));
    answer = String(parsed.answer || '').trim();
    ref = Number.isInteger(parsed.ref) ? parsed.ref : null;
  } catch {
    answer = raw.trim();
  }
  if (!answer) return json({ error: 'empty_answer' }, 502);

  await sb.from('help_chat_log').insert({ user_id: user.id, question, source: 'ai', answer: answer.slice(0, 4000) });
  return json({ answer, ref, model });
});
