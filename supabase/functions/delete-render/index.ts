import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function publicIdFromCloudinaryUrl(url: string): string | null {
  try {
    const m = url.match(/\/upload\/(?:[^/]+\/)*?(?:v\d+\/)?(.+)\.[a-zA-Z0-9]+$/);
    return m ? decodeURIComponent(m[1]) : null;
  } catch {
    return null;
  }
}

async function sha1Hex(message: string): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(message));
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function destroyCloudinaryImage(publicId: string): Promise<boolean> {
  const cloudName = Deno.env.get('CLOUDINARY_CLOUD_NAME');
  const apiKey = Deno.env.get('CLOUDINARY_API_KEY');
  const apiSecret = Deno.env.get('CLOUDINARY_API_SECRET');
  if (!cloudName || !apiKey || !apiSecret) {
    console.warn('[delete-render] Cloudinary credentials missing — skipping file delete');
    return false;
  }

  const timestamp = Math.round(Date.now() / 1000).toString();
  const paramString = `public_id=${publicId}&timestamp=${timestamp}`;
  const signature = await sha1Hex(paramString + apiSecret);

  const form = new URLSearchParams();
  form.append('public_id', publicId);
  form.append('timestamp', timestamp);
  form.append('api_key', apiKey);
  form.append('signature', signature);

  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/destroy`, {
    method: 'POST',
    body: form,
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error('[delete-render] Cloudinary destroy failed:', errText);
    return false;
  }

  const data = await res.json();
  return data.result === 'ok' || data.result === 'not found';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Unauthorized' }, 401);

    const sb = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: { user }, error: authErr } = await sb.auth.getUser(
      authHeader.replace('Bearer ', ''),
    );
    if (authErr || !user) return json({ error: 'Unauthorized' }, 401);

    const body = await req.json();
    const renderId = body?.id;
    if (!renderId || typeof renderId !== 'string') {
      return json({ error: 'Missing render id' }, 400);
    }

    const { data: render, error: fetchErr } = await sb
      .from('ai_renders')
      .select('id, user_id, image_url')
      .eq('id', renderId)
      .single();

    if (fetchErr || !render) return json({ error: 'Render not found' }, 404);
    if (render.user_id !== user.id) return json({ error: 'Forbidden' }, 403);

    let cloudDeleted = false;
    if (render.image_url && String(render.image_url).includes('cloudinary.com')) {
      const publicId = publicIdFromCloudinaryUrl(render.image_url);
      if (publicId) cloudDeleted = await destroyCloudinaryImage(publicId);
    }

    const { error: deleteErr } = await sb
      .from('ai_renders')
      .delete()
      .eq('id', renderId)
      .eq('user_id', user.id);

    if (deleteErr) {
      console.error('[delete-render] DB delete failed:', deleteErr);
      return json({ error: 'DB delete failed' }, 500);
    }

    return json({ success: true, cloud_deleted: cloudDeleted });
  } catch (e) {
    console.error('[delete-render] Unhandled error:', e);
    return json({ error: 'Internal server error', details: String(e) }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}
