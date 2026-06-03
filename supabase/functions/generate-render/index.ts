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
    const { image_front, image_3d, extra_images, hex_color, project_id, preset_id, cabinet_spec, custom_prompt } = await req.json();
    if (!image_front) return json({ error: 'image_front required' }, 400);

    // ── 4. Build prompt ───────────────────────────────────────────────────────
    const spec = cabinet_spec || {};
    const w = spec.widthCm ? `${spec.widthCm}cm wide` : '';
    const h = spec.heightCm ? `${spec.heightCm}cm tall` : '';
    const d = spec.depthCm ? `${spec.depthCm}cm deep` : '';
    const dims = [w, h, d].filter(Boolean).join(', ');
    const colorDesc = hex_color ? `The dominant cabinet color is ${hex_color}.` : '';
    const openCellsDesc = spec.hasOpenCells
      ? `IMPORTANT: The cabinet contains ${spec.openCellCount || 'some'} open shelving compartment(s) with NO doors — these must remain visibly open in the render.`
      : '';
    const drawersDesc = spec.hasDrawers ? 'The cabinet includes drawer units at the bottom.' : '';
    const doorsDesc = spec.hasDoors === false ? 'This cabinet has NO doors — all compartments are open.' : '';
    const columnsDesc = spec.columns ? `The cabinet has ${spec.columns} vertical columns.` : '';

    const basePrompt = custom_prompt || `You are provided with two reference images of a custom-designed wardrobe cabinet: a front view and a 3D angled view.
Create a photorealistic interior design render of this exact cabinet installed in a modern, elegantly furnished bedroom.

Cabinet specifications:
- Dimensions: ${dims || 'as shown in reference images'}
- ${colorDesc}
- ${columnsDesc}
- ${openCellsDesc}
- ${drawersDesc}
- ${doorsDesc}

Requirements:
- Preserve the cabinet's exact dimensions, proportions, colors, and design details from BOTH reference images
- Show the cabinet from a slight 3/4 front angle so the full design is visible
- Place it naturally against a bedroom wall with complementary furniture and decor
- Use warm, natural lighting from a window on one side
- The room should feel modern and aspirational
- Do NOT add doors where there are open shelves, and do NOT remove doors where they exist`;

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
