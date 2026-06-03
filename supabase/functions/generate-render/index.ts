import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
      .select('ai_renders_enabled, ai_renders_quota')
      .eq('id', user.id)
      .single();

    const aiEnabled = profile?.ai_renders_enabled !== false;
    if (!aiEnabled) return json({ error: 'ai_disabled' }, 403);

    const QUOTA = profile?.ai_renders_quota ?? 50;

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
    const { image_front, image_3d, image_3d_right, extra_images, hex_color, project_id, preset_id, cabinet_spec, custom_prompt } = await req.json();
    if (!image_front) return json({ error: 'image_front required' }, 400);

    // ── 4. Build prompt ───────────────────────────────────────────────────────
    const spec = cabinet_spec || {};
    const dims = [
      spec.widthCm  ? `רוחב ${spec.widthCm} ס"מ`  : '',
      spec.heightCm ? `גובה ${spec.heightCm} ס"מ` : '',
      spec.depthCm  ? `עומק ${spec.depthCm} ס"מ`  : '',
    ].filter(Boolean).join(', ');

    const colorDesc       = hex_color ? `צבע הארון הדומיננטי הוא ${hex_color}.` : '';
    const columnsDesc     = spec.columns ? `לארון ${spec.columns} עמודות אנכיות.` : '';
    const drawersDesc     = spec.hasDrawers ? 'הארון כולל מגירות בחלק התחתון.' : '';
    const doorsDesc       = spec.hasDoors === false ? 'לארון אין דלתות — כל התאים פתוחים.' : '';

    let openCellsDesc = '';
    if (spec.hasOpenCells) {
      openCellsDesc = `חשוב: לארון ${spec.openCellCount || ''} תא/תאים פתוחים ללא דלתות — יש להציג אותם פתוחים בהדמיה.`;
      if (spec.hasSideOpenCells) {
        openCellsDesc += ' חלק מהתאים הפתוחים הם כוורת צד — כלומר הדופן הצדדית של הכוורת פתוחה ואין לה לוח סוגר מהצד.';
      }
    }

    const numImages = image_3d_right ? 'שלוש' : 'שתי';
    const imagesDesc = image_3d_right
      ? 'תצוגת חזית, תצוגת זווית שמאל ותצוגת זווית ימין'
      : 'תצוגת חזית ותצוגת זווית תלת-ממד';

    const basePrompt = custom_prompt || `מצורפות ${numImages} תמונות ייחוס של ארון בגדים שעוצב על ידי לקוח: ${imagesDesc}.
צור הדמיה פוטוריאליסטית של ארון זה מותקן בחדר שינה מעוצב ומודרני.

מפרט הארון:
- מידות: ${dims || 'כפי שמוצג בתמונות הייחוס'}
- ${colorDesc}
- ${columnsDesc}
- ${openCellsDesc}
- ${drawersDesc}
- ${doorsDesc}

דרישות:
- שמור על המידות המדויקות, הפרופורציות, הצבעים ופרטי העיצוב של הארון משתי תמונות הייחוס
- הצג את הארון בזווית 3/4 קדמית קלה כדי שניתן לראות את העיצוב המלא
- מקם את הארון באופן טבעי מול קיר בחדר עם ריהוט ועיצוב משלים
- השתמש בתאורה טבעית וחמה מחלון מצד אחד
- החדר צריך להיות מודרני ואיכותי
- אל תוסיף דלתות לתאים פתוחים, ואל תסיר דלתות קיימות`;

    // ── 5. Call Gemini API ────────────────────────────────────────────────────
    const GEMINI_KEY = Deno.env.get('GEMINI_API_KEY')!;
    const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image:generateContent?key=${GEMINI_KEY}`;

    const cleanFront  = image_front.replace(/^data:image\/\w+;base64,/, '');
    const mime3d      = (image_3d || '').startsWith('data:image/png') ? 'image/png' : 'image/jpeg';
    const clean3d     = (image_3d || image_front).replace(/^data:image\/\w+;base64,/, '');

    const parts: any[] = [
      { text: basePrompt },
      { inlineData: { mimeType: 'image/jpeg', data: cleanFront } },
      { inlineData: { mimeType: mime3d,        data: clean3d   } },
    ];

    // Add right angle image if provided
    if (image_3d_right) {
      const mime3dR  = image_3d_right.startsWith('data:image/png') ? 'image/png' : 'image/jpeg';
      const clean3dR = image_3d_right.replace(/^data:image\/\w+;base64,/, '');
      parts.push({ inlineData: { mimeType: mime3dR, data: clean3dR } });
    }

    // Add extra user-uploaded images
    if (extra_images && Array.isArray(extra_images)) {
      extra_images.forEach((img: string) => {
        if (!img) return;
        const extraMime = img.startsWith('data:image/png') ? 'image/png' : 'image/jpeg';
        const extraData = img.replace(/^data:image\/\w+;base64,/, '');
        parts.push({ inlineData: { mimeType: extraMime, data: extraData } });
      });
    }

    const geminiRes = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: { responseModalities: ['IMAGE', 'TEXT'] }
      })
    });

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      console.error('Gemini error:', errText);
      return json({ error: 'Gemini API error', details: errText }, 502);
    }

    const geminiData = await geminiRes.json();
    const imagePart = geminiData?.candidates?.[0]?.content?.parts?.find(
      (p: any) => p.inlineData?.mimeType?.startsWith('image/')
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
