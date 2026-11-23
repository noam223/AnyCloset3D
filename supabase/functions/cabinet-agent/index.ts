// Cheap cabinet design agent for the bottom Hebrew chat bar.
// Grounded on anonymized summaries of real projects (cabinet_chat_examples RPC)
// + a compact API schema. Gemini Flash only; signed-in users; daily cap.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const MODELS = ['gemini-3-flash-preview', 'gemini-3-flash', 'gemini-2.5-flash'];
const DAILY_LIMIT = 60;
const TOP_K = 10;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const clip = (s: unknown, n: number) => String(s ?? '').slice(0, n);

type Example = {
  width: number; height: number; depth: number; cols: number;
  hang_cols: number; drawer_cols: number; drawer_count: number;
  drawer_kind: string | null; has_doors: boolean;
  front_face: string; front_style: string; model: string; n: number;
};

type CurrentState = {
  width?: number; height?: number; depth?: number; columns?: number;
  hasDoors?: boolean; frontFaceStyle?: string; frontStyle?: string;
  hangingColumns?: number; drawerColumns?: number; model?: string;
  cartCount?: number;
};

function lineOf(e: Example): string {
  const parts = [
    `W${e.width}`, `H${e.height}`, `D${e.depth}`,
    `${e.cols}עמודות`,
  ];
  if (e.hang_cols) parts.push(`${e.hang_cols}תלייה`);
  if (e.drawer_cols) {
    parts.push(`${e.drawer_cols}עמודות-מגירות×${e.drawer_count || '?'}${e.drawer_kind === 'internal' ? 'פנימיות' : e.drawer_kind === 'external' ? 'חיצוניות' : ''}`);
  }
  parts.push(e.has_doors ? 'עם-דלתות' : 'בלי-דלתות');
  if (e.front_face === 'profile') parts.push('חזית-פרופיל');
  if (e.front_style === 'internal') parts.push('חזית-פנימית');
  if (e.model && e.model !== 'linear') parts.push(e.model);
  if (e.n > 1) parts.push(`×${e.n}`);
  return parts.join(' ');
}

function scoreExample(e: Example, msg: string, hintW: number | null): number {
  let s = Math.log(1 + (e.n || 1));
  if (hintW != null && e.width > 0) {
    const d = Math.abs(e.width - hintW);
    s += Math.max(0, 40 - d / 3);
  }
  const t = msg;
  if (/תלי|מוט|בגד/.test(t) && e.hang_cols > 0) s += 8;
  if (/מגיר/.test(t) && e.drawer_cols > 0) s += 8;
  if (/פרופיל|מסגרת/.test(t) && e.front_face === 'profile') s += 5;
  if (/פנימ/.test(t) && (e.drawer_kind === 'internal' || e.front_style === 'internal')) s += 4;
  if (/חיצונ/.test(t) && (e.drawer_kind === 'external' || e.front_style === 'external')) s += 4;
  if (/בלי דלת|ללא דלת|פתוח/.test(t) && !e.has_doors) s += 4;
  if (/דלת|חזית/.test(t) && e.has_doors) s += 2;
  // Prefer realistic column widths (~55–95cm); soft-penalize tiny cells
  if (e.cols > 0 && e.width > 0) {
    const cm = e.width / e.cols;
    if (cm >= 55 && cm <= 95) s += 6;
    else if (cm < 50 || cm > 110) s -= 8;
  }
  return s;
}

function pickExamples(all: Example[], msg: string, hintW: number | null): Example[] {
  return [...all]
    .map((e) => ({ e, s: scoreExample(e, msg, hintW) }))
    .sort((a, b) => b.s - a.s)
    .slice(0, TOP_K)
    .map((x) => x.e);
}

function extractHintWidth(msg: string, current: CurrentState): number | null {
  const m = msg.match(/רוחב\s*(?:של\s*)?(?:ל\s*)?(\d+(?:[.,]\d+)?)/);
  if (m) {
    const n = parseFloat(m[1].replace(',', '.'));
    if (n > 0 && n <= 12) return Math.round(n * 100);
    if (n >= 40 && n <= 600) return Math.round(n);
  }
  const pair = msg.match(/(\d{2,3})\s*(?:על|x|×)\s*(\d{2,3})/);
  if (pair) {
    const a = parseInt(pair[1], 10);
    const b = parseInt(pair[2], 10);
    if (Math.max(a, b) >= 100) return Math.max(a, b) >= 180 ? Math.min(a, b) : Math.max(a, b);
  }
  const lone = msg.match(/\b(\d{3})\b/);
  if (lone) {
    const n = parseInt(lone[1], 10);
    if (n >= 100 && n <= 450) return n;
  }
  if (current.width && current.width >= 60) return current.width;
  return null;
}

type ColTpl = {
  id: string; name: string; pattern: string; tags?: string[];
  cells?: number; hasDoors?: boolean; drawerKind?: string | null; drawerCount?: number | null;
};

function summarizeTplFromDb(row: { id: string; name: string; data?: Record<string, unknown> }): ColTpl | null {
  const data = row.data || {};
  const col = (data.column && typeof data.column === 'object') ? data.column as {
    compartments?: Array<{ type?: string; count?: number; partition?: boolean }>;
    doors?: unknown[];
    _height?: number;
  } : null;
  const comps = Array.isArray(col?.compartments) ? col!.compartments! : [];
  const cells = comps.map((c) => {
    if (!c) return 'empty';
    if (c.type === 'external_drawers') return `ext_drawers:${c.count ?? '?'}`;
    if (c.type === 'internal_drawers') return `int_drawers:${c.count ?? '?'}`;
    if (c.type === 'shoe_drawers') return `shoe_drawers:${c.count ?? '?'}`;
    if (c.partition) return 'partition';
    return c.type || 'empty';
  });
  const tags: string[] = [];
  if (cells.some((x) => x === 'hanging' || x === 'cross_hanging')) tags.push('hanging');
  if (cells.some((x) => x.startsWith('ext_drawers'))) tags.push('drawers', 'external');
  if (cells.some((x) => x.startsWith('int_drawers'))) tags.push('drawers', 'internal');
  if (cells.some((x) => x === 'empty')) tags.push('shelves');
  if (cells.some((x) => x === 'sorbet')) tags.push('sorbet');
  let drawerKind: string | null = null;
  let drawerCount: number | null = null;
  for (const x of cells) {
    const m = x.match(/^(ext|int)_drawers:(\d+|\?)$/);
    if (!m) continue;
    drawerKind = m[1] === 'ext' ? 'external' : 'internal';
    if (m[2] !== '?') drawerCount = parseInt(m[2], 10);
  }
  return {
    id: row.id,
    name: String(row.name || '').trim() || 'תבנית',
    pattern: cells.join('|') || 'empty',
    tags,
    cells: cells.length,
    hasDoors: Array.isArray(col?.doors) && col!.doors!.length > 0,
    drawerKind,
    drawerCount,
  };
}

function lineOfTpl(t: ColTpl): string {
  return `${t.id} | ${t.name} | ${t.pattern} | tags=${(t.tags || []).join(',')}` +
    (t.drawerKind ? ` | ${t.drawerKind}${t.drawerCount != null ? '×' + t.drawerCount : ''}` : '');
}

function systemPrompt(): string {
  return [
    'אתה סוכן תכנון ארונות של AnyCloset 3D. ענה בעברית קצרה וברורה.',
    'המטרה: להפוך בקשת משתמש לפעולות מובנות שיוצרים/עורכים ארון ליניארי במערכת.',
    'למד מהדוגמאות מפרויקטים אמיתיים — במיוחד כמה עמודות לרוחב נתון (בדרך כלל 55–95 ס״מ לעמודה, לא לפצל יתר על המידה).',
    'למד גם משיעורים מהשיחות (בקשה→פעולות→תוצאה). העדף שיעורים של המשתמש הנוכחי; אל תחזור על שיעורים שסומנו rejected.',
    'תבניות עמודה הן ספריית השראה — לא חובה להעתיק אותן אחד־לאחד.',
    'השתמש בבינה: הבן את הבקשה, בחר תבנית קרובה כשעוזרת, ואז התאם (מספר מגירות, פנימי/חיצוני, כמה תלייה/מדפים, דלתות).',
    'מותר להשאיר columnTemplates=null או לשים null בעמודה מסוימת ולבנות אותה חופשי לפי hangingColumns/drawers/shelves.',
    'pattern בתבניות: תאים מלמטה למעלה (empty=מדף, hanging=תלייה, ext_drawers/int_drawers=מגירות).',
    'כשכן בוחרים תבניות — מערך columnTemplates באורך columns (id או שם); אחר כך המערכת תתאים drawerCount/drawerKind לפי actions.',
    'כל דבר שדורש כמות בלי מספר — שאל (ready=false): מגירות→drawerCount, עמודות→columns, עמודות תלייה→hangingColumns, עמודות מדפים→shelfColumns, עמודות מגירות→drawerColumns, דפנות→walls.',
    'מגירות — חוקי גובה תא (חובה לכבד): פנימיות 22ס״מ לראשונה +20 לכל נוספת (4→82); חיצוניות בודדת מ־5, ערימה 12+(n-1)×12 (4→48). אל תבקש יותר מגירות מגובה התא התחתון מאפשר; המערכת תחתוך אם חורגים.',
    'אם מבקשים מגירות בלי לציין פנימיות/חיצוניות — שאל גם (question="drawerKind").',
    'אם חסרים רוחב או גובה ליצירה — שאל (question="width" או "height"). שאל שאלה אחת בכל פעם.',
    'מידות: אורך=רוחב. מספרים ≤12 (למשל 2.66, 2.10) הם מטרים → המר לס״מ (266, 210).',
    'כמה ארונות בבקשה אחת (ארון 1 / ארון 2…): intent=create_many ו-actions.cabinets=[ {...}, {...} ] — כל פריט עם width/height בס״מ ושם אופציונלי. הלקוח יוצר כמה פריטים ב-orderCart.',
    'תלייה: תמיד עם מדפים מעל (לא תלייה מלאה בלבד). ברירת מחדל לדלתות: כן, אלא אם ביקשו בלי.',
    'עומק ברירת מחדל 54 אם לא צוין. אל תפתח CNC/ייצוא.',
    'החזר JSON בלבד בפורמט:',
    '{"reply":"הודעה למשתמש","ready":true|false,"question":null|"width"|"height"|"depth"|"columns"|"drawerKind"|"hasDoors"|"drawerCount"|"walls"|"roomW","intent":"create"|"create_many"|"edit"|"walkin"|"clarify"|"help"|"cancel","actions":{"width":cm|null,"height":cm|null,"depth":cm|null,"columns":n|null,"hasDoors":bool|null,"frontFaceStyle":"solid"|"profile"|null,"frontStyle":"internal"|"external"|null,"hanging":bool|null,"hangingColumns":n|null,"shelves":bool|null,"restShelves":bool|null,"shelfColumns":n|null,"drawers":bool|null,"drawerCount":n|null,"drawerKind":"internal"|"external"|null,"drawerColumns":n|null,"columnTemplates":["tplIdOrName"|null,...]|null,"cabinets":[{"name":"ארון 1","width":cm,"height":cm,"depth":cm|null,"hasDoors":bool,"hanging":bool,"drawers":bool,"drawerKind":"internal"|"external"|null,"drawerCount":n|null,"columns":n|null},...]|null,"adapt":true|null,"walls":n|null,"roomW":cm|null,"roomD":cm|null}}',
    'כשready=false מלא רק question+reply; actions יכול להיות חלקי.',
    'כשready=true מלא actions מלאים ליצירה/עריכה. intent=edit כשיש ארון קיים והבקשה היא שינוי. intent=create_many כשיש 2+ ארונות.',
  ].join('\n');
}

function apiCheatSheet(): string {
  return [
    'API: create_many→startNewCabinet לכל ארון נוסף ב-orderCart; create→updateDim+distributeColumns+תבניות/תאים;',
    'hanging(+מדפים), drawers, דלתות, frontFaceStyle. אורך=רוחב; מטרים≤12→ס״מ.',
  ].join(' ');
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
    .eq('user_id', user.id).eq('source', 'cabinet_ai').gte('created_at', since);
  if ((count ?? 0) >= DAILY_LIMIT) return json({ error: 'rate_limited' }, 429);

  const body = await req.json().catch(() => ({}));
  const message = clip(body.message, 1200).trim();
  if (!message) return json({ error: 'message_required' }, 400);

  const current = (body.current && typeof body.current === 'object') ? body.current as CurrentState : {};
  const pending = (body.pending && typeof body.pending === 'object') ? body.pending : null;
  const history = (Array.isArray(body.history) ? body.history : []).slice(-6)
    .map((h: { role?: string; text?: string }) => ({
      role: h.role === 'assistant' || h.role === 'bot' || h.role === 'model' ? 'model' : 'user',
      parts: [{ text: clip(h.text, 800) }],
    }));

  // Column templates from client (preferred) and/or DB
  let colTpls: ColTpl[] = Array.isArray(body.columnTemplates)
    ? (body.columnTemplates as ColTpl[]).filter((t) => t && t.id && t.pattern).slice(0, 40)
    : [];
  if (!colTpls.length) {
    const { data: tplRows, error: tplErr } = await sb.from('design_templates')
      .select('id, name, data')
      .eq('kind', 'column')
      .order('created_at', { ascending: true })
      .limit(40);
    if (tplErr) console.warn('design_templates:', tplErr.message);
    colTpls = (tplRows || []).map((r) => summarizeTplFromDb(r as { id: string; name: string; data?: Record<string, unknown> })).filter(Boolean) as ColTpl[];
  }
  const tplBlock = colTpls.length
    ? colTpls.map((t, i) => `[T${i}] ${lineOfTpl(t)}`).join('\n')
    : '(אין תבניות עמודה שמורות — בנה תאים ידנית לפי hanging/drawers/shelves)';

  // Lessons from chat (this user first, then recent successful from others — anonymized)
  type Lesson = {
    request: string; actions: Record<string, unknown>; outcome: string | null;
    feedback: string; kind: string; user_id?: string;
  };
  const lineOfLesson = (L: Lesson, i: number, mine: boolean) => {
    const act = JSON.stringify(L.actions || {}).slice(0, 280);
    return `[L${i}${mine ? '*' : ''}] ${clip(L.request, 220)} → ${act}` +
      (L.outcome ? ` ⇒ ${clip(L.outcome, 120)}` : '') +
      (L.feedback === 'corrected' ? ' (תוקן אחרי משוב)' : '');
  };
  const { data: myLessonsRaw } = await sb.from('cabinet_chat_lessons')
    .select('request, actions, outcome, feedback, kind')
    .eq('user_id', user.id)
    .in('feedback', ['applied', 'corrected'])
    .order('created_at', { ascending: false })
    .limit(12);
  const myLessons = (myLessonsRaw || []) as Lesson[];
  const { data: otherLessonsRaw } = await sb.from('cabinet_chat_lessons')
    .select('request, actions, outcome, feedback, kind')
    .neq('user_id', user.id)
    .eq('feedback', 'applied')
    .order('created_at', { ascending: false })
    .limit(8);
  const otherLessons = (otherLessonsRaw || []) as Lesson[];
  const lessonLines: string[] = [];
  myLessons.forEach((L, i) => lessonLines.push(lineOfLesson(L, i, true)));
  otherLessons.forEach((L, i) => lessonLines.push(lineOfLesson(L, myLessons.length + i, false)));
  const lessonBlock = lessonLines.length
    ? lessonLines.join('\n')
    : '(אין עדיין שיעורים משיחות — למד מהדוגמאות והתבניות)';

  const { data: examplesRaw, error: exErr } = await sb.rpc('cabinet_chat_examples', { p_limit: 160 });
  if (exErr) console.warn('cabinet_chat_examples:', exErr.message);
  const all = (examplesRaw || []) as Example[];
  const hintW = extractHintWidth(message, current);
  const top = pickExamples(all, message, hintW);
  const exampleBlock = top.length
    ? top.map((e, i) => `[${i}] ${lineOf(e)}`).join('\n')
    : '(אין דוגמאות — השתמש בכלל ~70ס״מ לעמודה)';

  // Aggregate column tip near hint width
  let colTip = '';
  if (hintW != null && all.length) {
    const near = all
      .filter((e) => Math.abs(e.width - hintW) <= 40)
      .sort((a, b) => Math.abs(a.width - hintW) - Math.abs(b.width - hintW) || b.n - a.n)
      .slice(0, 8);
    if (near.length) {
      const weighted = near.reduce((acc, e) => acc + e.cols * (e.n || 1), 0);
      const wsum = near.reduce((acc, e) => acc + (e.n || 1), 0);
      const avg = Math.round(weighted / Math.max(1, wsum));
      colTip = `לרוחב ~${hintW}ס״מ, בפרויקטים דומים בדרך כלל ${avg} עמודות (דוגמאות: ${near.map((e) => `${e.width}→${e.cols}`).join(', ')}).`;
    }
  }

  const userPayload = [
    `מצב נוכחי בארון: ${JSON.stringify({
      width: current.width || null,
      height: current.height || null,
      depth: current.depth || null,
      columns: current.columns || null,
      hasDoors: current.hasDoors,
      frontFaceStyle: current.frontFaceStyle || null,
      frontStyle: current.frontStyle || null,
      hangingColumns: current.hangingColumns || null,
      drawerColumns: current.drawerColumns || null,
      model: current.model || 'linear',
      cartCount: current.cartCount || 0,
    })}`,
    pending ? `slots ממתינים משיחה קודמת: ${JSON.stringify(pending)}` : '',
    colTip,
    `שיעורים משיחות (L* = שלך — העדף אותם):\n${lessonBlock}`,
    `תבניות עמודה (השראה — אפשר לבחור/לשלב/להתעלם ולהתאים):\n${tplBlock}`,
    `דוגמאות מפרויקטים אמיתיים (אנונימיות):\n${exampleBlock}`,
    apiCheatSheet(),
    `בקשת המשתמש: ${message}`,
  ].filter(Boolean).join('\n\n');

  const payload = {
    systemInstruction: { parts: [{ text: systemPrompt() }] },
    contents: [
      ...history,
      { role: 'user', parts: [{ text: userPayload }] },
    ],
    generationConfig: {
      temperature: 0.15,
      maxOutputTokens: 2048,
      responseMimeType: 'application/json',
    },
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
  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g, ''));
  } catch {
    return json({ error: 'bad_ai_json', raw: raw.slice(0, 500) }, 502);
  }

  const reply = String(parsed.reply || '').trim() || 'בוצע.';
  const out = {
    reply,
    ready: parsed.ready === true,
    question: parsed.question ?? null,
    intent: parsed.intent || 'clarify',
    actions: parsed.actions && typeof parsed.actions === 'object' ? parsed.actions : {},
    model,
    examplesUsed: top.length,
  };

  await sb.from('help_chat_log').insert({
    user_id: user.id,
    question: message.slice(0, 1000),
    source: 'cabinet_ai',
    answer: reply.slice(0, 4000),
    matched: hintW != null ? `w${hintW}:${top.length}` : String(top.length),
  });

  return json(out);
});
