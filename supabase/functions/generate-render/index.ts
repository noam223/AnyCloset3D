import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GEMINI_MODELS = {
  standard: 'gemini-3.1-flash-image',       // Nano Banana 2
  pro:      'gemini-3-pro-image-preview',   // Nano Banana Pro
} as const;

const MATERIAL_HE: Record<string, string> = {
  white_matte: 'לבן מט', white_gloss: 'לבן מבריק', black_matte: 'שחור מט',
  gray_light: 'אפור בהיר', gray_dark: 'אפור כהה', beige: 'בז\'',
  brown_light: 'חום בהיר', brown_dark: 'חום כהה', oak: 'אלון', walnut: 'אגוז', pine: 'אורן',
};

function roomContext(presetId?: string | null): string {
  if (presetId === 'bathroom') return 'חדר אמבטיה מודרני ונקי, עם כיור ומראה ברקע (לא מסתירים את הארון).';
  if (presetId === 'sliding' || presetId === 'walkin') return 'חדר הלבשה / חדר שינה גדול עם ארון בגדים מובנה לאורך הקיר.';
  if (presetId === 'corner-left' || presetId === 'corner-right') return 'פינת חדר שינה מעוצבת עם הארון בפינה.';
  return 'חדר שינה מעוצב ואיכותי, הארון צמוד לקיר האחורי.';
}

function openCellsNote(spec: Record<string, unknown>): string {
  if (!spec.hasOpenCells) return '';
  const cnt = (spec.openCellCount as number) || 1;
  if (spec.hasSideOpenCells) {
    const dirMap: Record<string, string> = { left: 'שמאל', right: 'ימין', both: 'שני הצדדים' };
    const dirHe = spec.sideOpenDir ? (dirMap[String(spec.sideOpenDir)] || '') : '';
    const sideDesc = dirHe
      ? ` הדופן הפתוחה בצד ${dirHe} (מבט חזית — מהעמדה שלך, כפי שרואים את הארון).`
      : ' הדופן הצדדית פתוחה (מבט חזית).';
    return cnt === 1
      ? `- תא פתוח אחד ללא דלת — פתוח מהחזית ומהצד (ללא לוח צד).${sideDesc}`
      : `- ${cnt} תאים פתוחים ללא דלתות, חלקם פתוחים גם מהצד.${sideDesc}`;
  }
  return cnt === 1
    ? '- תא פתוח אחד ללא דלת — הצג אותו פתוח לחלוטין.'
    : `- ${cnt} תאים פתוחים ללא דלתות — הצג את כולם פתוחים.`;
}

function fidelityAppendix(): string {
  return `\n---\nהגבלות חובה:\n` +
    `- הארון חייב להיות זהה לתמונות הייחוס: מידות, פרופורציות, חלוקה לעמודות, מספר דלתות/מגירות, ידיות, צבעים, גובה צוקל ועומק.\n` +
    `- אין לשנות את עיצוב הארון, אין להוסיף או להסיר דלתות, מגירות, מדפים או אלמנטים שלא מופיעים בייחוס.\n` +
    `- ללא טקסט, לוגו, סימן מים או מסגרת מסך בתוצאה.`;
}

function buildDefaultPrompt(
  spec: Record<string, unknown>,
  hex_color: string | undefined,
  single_view: boolean,
  hasRightImage: boolean,
): string {
  const imagesIntro = single_view
    ? 'מצורפת תמונת ייחוס אחת מהזווית הנוכחית בתוכנת התכנון.'
    : hasRightImage
      ? 'מצורפות 3 תמונות ייחוס של אותו ארון (סדר חשוב):\n1) חזית ישרה — פרופורציות מדויקות\n2) זווית תלת-ממד משמאל\n3) זווית תלת-ממד מימין'
      : 'מצורפות 2 תמונות ייחוס:\n1) חזית ישרה\n2) זווית תלת-ממד';

  const dims = [
    spec.widthCm ? `רוחב ${spec.widthCm} ס"מ` : '',
    spec.heightCm ? `גובה ${spec.heightCm} ס"מ` : '',
    spec.depthCm ? `עומק ${spec.depthCm} ס"מ` : '',
  ].filter(Boolean).join(', ');

  const bodyKey = String(spec.materialBody || spec.materialExternal || '');
  const colorLine = hex_color
    ? `צבע גוף/חזית דומיננטי: ${hex_color}${MATERIAL_HE[bodyKey] ? ` (${MATERIAL_HE[bodyKey]})` : ''}.`
    : (MATERIAL_HE[bodyKey] ? `גוון גוף: ${MATERIAL_HE[bodyKey]}.` : '');

  const specLines = [
    dims ? `מידות חיצוניות: ${dims}.` : '',
    colorLine,
    spec.columns ? `חלוקה: ${spec.columns} עמודות אנכיות.` : '',
    (spec.plinthHeightCm as number) > 0 ? `צוקל בגובה ${spec.plinthHeightCm} ס"מ — שמור בדיוק.` : '',
    spec.hasDrawers ? 'כולל מגירות בחלק התחתון — שמור על מיקום ופרופורציה.' : '',
    spec.hasDoors === false ? 'ללא דלתות — כל התאים פתוחים מהחזית.' : '',
    spec.hasSideDesk ? 'כולל שולחן צד משולב — שמור על מיקומו ביחס לארון.' : '',
    spec.numSlidingDoors ? `ארון הזזה עם ${spec.numSlidingDoors} דלתות הזזה — שמור מסילות, פרופיל וחלוקת פנלים כבתמונות.` : '',
    openCellsNote(spec),
  ].filter(Boolean);

  return imagesIntro + '\n\n' +
    'משימה: צור תמונה פוטוריאליסטית אחת (צילום אדריכלי פנים) של אותו ארון בדיוק, מותקן בסביבה אמיתית.\n\n' +
    'דיוק מוחלט (אל תסטה מהייחוס):\n' +
    '- שמור זהות מלאה של הארון: צורה, חלוקה, ידיות, צבעים, עומק וגובה.\n' +
    '- אל תוסיף דלתות לתאים פתוחים ואל תסגור תאים שפתוחים בייחוס.\n' +
    (specLines.length ? '\nמפרט:\n' + specLines.map(l => `- ${l}`).join('\n') + '\n' : '\n') +
    '\nסביבה וצילום:\n' +
    `- ${roomContext(spec.presetId as string)}\n` +
    '- הארון צמוד לקיר, לא חוסם אותו ריהוט אחר.\n' +
    '- תאורה: אור יום רך מחלון בצד, צללים טבעיים, ללא פלאש קשה.\n' +
    '- זווית מצלמה: 3/4 קדמית קלה, גובה עיניים, תחושת עדשת 35mm.\n' +
    '- טקסטורות מלמינה/עץ מציאותיות, ללא מראה "רינדור מחשב" או פלסטיקי.';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    // ── 1. Auth ──────────────────────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Unauthorized' }, 401);

    const sb = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: { user }, error: authErr } = await sb.auth.getUser(
      authHeader.replace('Bearer ', '')
    );
    if (authErr || !user) return json({ error: 'Unauthorized' }, 401);

    // ── 2. Check quota & enabled flag from profile ───────────────────────────
    const { data: profile } = await sb
      .from('profiles')
      .select('ai_renders_enabled, ai_renders_quota, subscription_status')
      .eq('id', user.id)
      .single();

    const aiEnabled = profile?.ai_renders_enabled !== false;
    if (!aiEnabled) return json({ error: 'ai_disabled' }, 403);

    const isTrial = profile?.subscription_status === 'trial';
    const QUOTA = isTrial ? 5 : (profile?.ai_renders_quota ?? 50);

    const { data: countData, error: countErr } = await sb.rpc(
      'get_ai_renders_count_this_month',
      { p_user_id: user.id }
    );
    if (countErr) return json({ error: 'Could not check quota' }, 500);

    const usedCount = countData ?? 0;
    if (usedCount >= QUOTA) {
      return json({ error: 'quota_exceeded', used: usedCount, limit: QUOTA }, 429);
    }

    // ── 3. Parse body ────────────────────────────────────────────────────────
    const { image_front, image_3d, image_3d_right, extra_images, hex_color, project_id, preset_id, cabinet_spec, custom_prompt, single_view, model_tier } = await req.json();
    if (!image_front) return json({ error: 'image_front required' }, 400);

    const tier = model_tier === 'pro' ? 'pro' : 'standard';
    const geminiModel = GEMINI_MODELS[tier];
    const spec = (cabinet_spec || {}) as Record<string, unknown>;
    const hasRightImage = !!image_3d_right;

    const instructions = custom_prompt?.trim()
      ? custom_prompt.trim() + fidelityAppendix()
      : buildDefaultPrompt(spec, hex_color, !!single_view, hasRightImage);

    // ── 4. Build Gemini parts (interleaved image labels) ─────────────────────
    const cleanFront = image_front.replace(/^data:image\/\w+;base64,/, '');
    const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [];

    if (single_view) {
      parts.push({ text: 'תמונת ייחוס — מבט מהזווית הנוכחית:' });
      parts.push({ inlineData: { mimeType: 'image/jpeg', data: cleanFront } });
    } else {
      parts.push({ text: 'תמונת ייחוס 1 — חזית ישרה (פרופורציות מדויקות):' });
      parts.push({ inlineData: { mimeType: 'image/jpeg', data: cleanFront } });

      const mime3d = (image_3d || '').startsWith('data:image/png') ? 'image/png' : 'image/jpeg';
      const clean3d = (image_3d || image_front).replace(/^data:image\/\w+;base64,/, '');
      parts.push({ text: '\nתמונת ייחוס 2 — זווית תלת-ממד משמאל:' });
      parts.push({ inlineData: { mimeType: mime3d, data: clean3d } });

      if (image_3d_right) {
        const mime3dR = image_3d_right.startsWith('data:image/png') ? 'image/png' : 'image/jpeg';
        const clean3dR = image_3d_right.replace(/^data:image\/\w+;base64,/, '');
        parts.push({ text: '\nתמונת ייחוס 3 — זווית תלת-ממד מימין:' });
        parts.push({ inlineData: { mimeType: mime3dR, data: clean3dR } });
      }
    }

    if (extra_images && Array.isArray(extra_images)) {
      extra_images.forEach((img: string, i: number) => {
        if (!img) return;
        const extraMime = img.startsWith('data:image/png') ? 'image/png' : 'image/jpeg';
        const extraData = img.replace(/^data:image\/\w+;base64,/, '');
        parts.push({ text: `\nתמונת ייחוס נוספת ${i + 1}:` });
        parts.push({ inlineData: { mimeType: extraMime, data: extraData } });
      });
    }

    parts.push({ text: '\n\n' + instructions + (tier === 'pro'
      ? '\n\nמצב PRO (Nano Banana Pro): איכות מקסימלית, פרטים מיקרו-ריאליסטיים בתאורה, טקסטורות ורקע — תוך שמירה מוחלטת על זהות הארון מתמונות הייחוס.'
      : '') });

    const GEMINI_KEY = Deno.env.get('GEMINI_API_KEY')!;
    const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${GEMINI_KEY}`;

    const generationConfig: Record<string, unknown> = {
      responseModalities: ['IMAGE', 'TEXT'],
    };
    if (tier === 'pro') {
      generationConfig.imageConfig = { imageSize: '2K' };
    }

    const geminiRes = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts }],
        generationConfig,
      }),
    });

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      console.error('Gemini error:', errText);
      return json({ error: 'Gemini API error', details: errText }, 502);
    }

    const geminiData = await geminiRes.json();
    const imagePart = geminiData?.candidates?.[0]?.content?.parts?.find(
      (p: { inlineData?: { mimeType?: string } }) => p.inlineData?.mimeType?.startsWith('image/')
    );
    if (!imagePart) {
      console.error('No image part in Gemini response:', JSON.stringify(geminiData));
      return json({ error: 'No image returned from Gemini', details: geminiData }, 502);
    }

    const resultBase64 = `data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}`;

    // ── 5. Upload to Cloudinary ──────────────────────────────────────────────
    const CLOUD_NAME    = Deno.env.get('CLOUDINARY_CLOUD_NAME')!;
    const UPLOAD_PRESET = Deno.env.get('CLOUDINARY_UPLOAD_PRESET') ?? 'ai_renders';

    const formData = new FormData();
    formData.append('file', resultBase64);
    formData.append('upload_preset', UPLOAD_PRESET);
    formData.append('folder', 'ai_renders');

    const cloudRes = await fetch(
      `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`,
      { method: 'POST', body: formData }
    );
    if (!cloudRes.ok) {
      const errText = await cloudRes.text();
      console.error('Cloudinary error:', errText);
      return json({ error: 'Cloudinary upload failed', details: errText }, 502);
    }

    const { secure_url } = await cloudRes.json();

    // ── 6. Save to DB ────────────────────────────────────────────────────────
    const { data: inserted, error: insertErr } = await sb
      .from('ai_renders')
      .insert({
        user_id:      user.id,
        project_id:   project_id ?? null,
        image_url:    secure_url,
        hex_color:    hex_color ?? null,
        preset_id:    preset_id ?? null,
        cabinet_spec: cabinet_spec ?? null,
      })
      .select('id, created_at')
      .single();

    if (insertErr) {
      console.error('DB insert error:', insertErr);
      return json({ error: 'DB insert failed' }, 500);
    }

    return json({
      success: true,
      id:        inserted.id,
      image_url: secure_url,
      used:      usedCount + 1,
      limit:     QUOTA,
      model_tier: tier,
      created_at: inserted.created_at,
    });

  } catch (e) {
    console.error('Unhandled error:', e);
    return json({ error: 'Internal server error', details: String(e) }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}
