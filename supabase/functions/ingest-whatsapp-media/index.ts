import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-ingest-token, x-ingest-secret',
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

function pickToken(req: Request, body: Record<string, unknown>): string {
  const header = req.headers.get('x-ingest-token') || '';
  if (header.trim()) return header.trim();
  const url = new URL(req.url);
  const q = url.searchParams.get('token') || '';
  if (q.trim()) return q.trim();
  const fromBody = body.ingest_token || body.token;
  return typeof fromBody === 'string' ? fromBody.trim() : '';
}

function pickSecret(req: Request, body: Record<string, unknown>): string {
  const header = req.headers.get('x-ingest-secret') || '';
  if (header.trim()) return header.trim();
  const fromBody = body.ingest_secret || body.secret;
  return typeof fromBody === 'string' ? fromBody.trim() : '';
}

function chatIdToPhone(chatId: unknown): string | null {
  if (typeof chatId !== 'string' || !chatId) return null;
  return chatId.replace(/@c\.us$/i, '').replace(/@g\.us$/i, '').replace(/\D/g, '') || null;
}

type MediaInfo = {
  fileUrl: string;
  fileName: string | null;
  mimeType: string | null;
  caption: string | null;
  sourcePhone: string | null;
  senderName: string | null;
  externalMessageId: string | null;
};

function fromGreenApi(body: Record<string, unknown>): MediaInfo | null {
  const typeWebhook = String(body.typeWebhook || '');
  if (typeWebhook && typeWebhook !== 'incomingMessageReceived') return null;

  const senderData = (body.senderData || {}) as Record<string, unknown>;
  const messageData = (body.messageData || {}) as Record<string, unknown>;
  const typeMessage = String(messageData.typeMessage || '');

  const mediaKeys = [
    'fileMessageData',
    'documentMessageData',
    'imageMessageData',
    'videoMessageData',
    'audioMessageData',
  ];

  let media: Record<string, unknown> | null = null;
  for (const key of mediaKeys) {
    const m = messageData[key];
    if (m && typeof m === 'object') {
      media = m as Record<string, unknown>;
      break;
    }
  }

  // Some Green API payloads nest downloadUrl under messageData directly for downloadUrl notifications
  if (!media && messageData.downloadUrl) {
    media = messageData;
  }

  if (!media) {
    // Non-media message — ignore quietly
    if (typeMessage && !/image|document|file|video|audio/i.test(typeMessage)) return null;
    return null;
  }

  const fileUrl = String(media.downloadUrl || media.url || '');
  if (!fileUrl) return null;

  return {
    fileUrl,
    fileName: (media.fileName as string) || (media.filename as string) || null,
    mimeType: (media.mimeType as string) || (media.mimetype as string) || null,
    caption: (media.caption as string) || (messageData.textMessage as string) || null,
    sourcePhone: chatIdToPhone(senderData.sender) || chatIdToPhone(senderData.chatId),
    senderName: (senderData.senderName as string) || (senderData.chatName as string) || null,
    externalMessageId: (body.idMessage as string) || null,
  };
}

function fromSimplePayload(body: Record<string, unknown>): MediaInfo | null {
  const fileUrl = String(body.file_url || body.downloadUrl || body.url || '');
  if (!fileUrl) return null;
  return {
    fileUrl,
    fileName: (body.file_name as string) || (body.fileName as string) || null,
    mimeType: (body.mime_type as string) || (body.mimeType as string) || null,
    caption: (body.caption as string) || (body.text as string) || null,
    sourcePhone: (body.source_phone as string) || (body.phone as string) || null,
    senderName: (body.sender_name as string) || (body.senderName as string) || null,
    externalMessageId: (body.external_message_id as string) || (body.idMessage as string) || null,
  };
}

function guessExt(mime: string | null, fileName: string | null): string {
  if (fileName && fileName.includes('.')) {
    const ext = fileName.split('.').pop()!.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (ext) return ext;
  }
  if (!mime) return 'bin';
  if (mime.includes('jpeg') || mime.includes('jpg')) return 'jpg';
  if (mime.includes('png')) return 'png';
  if (mime.includes('webp')) return 'webp';
  if (mime.includes('pdf')) return 'pdf';
  if (mime.includes('heic')) return 'heic';
  if (mime.includes('msword')) return 'doc';
  if (mime.includes('wordprocessingml')) return 'docx';
  if (mime.includes('sheet')) return 'xlsx';
  if (mime.includes('zip')) return 'zip';
  return 'bin';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  try {
    let body: Record<string, unknown> = {};
    const ct = req.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      body = await req.json();
    } else if (ct.includes('application/x-www-form-urlencoded')) {
      const form = await req.formData();
      form.forEach((v, k) => {
        if (typeof v === 'string') body[k] = v;
      });
    } else {
      // Try JSON anyway
      try {
        body = await req.json();
      } catch {
        body = {};
      }
    }

    const requiredSecret = Deno.env.get('WHATSAPP_INGEST_SECRET') || '';
    if (requiredSecret) {
      const provided = pickSecret(req, body);
      if (!provided || provided !== requiredSecret) {
        return json({ error: 'Invalid ingest secret' }, 401);
      }
    }

    const token = pickToken(req, body);
    if (!token) {
      return json({ error: 'Missing ingest token' }, 401);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const sb = createClient(supabaseUrl, serviceKey);

    const { data: profile, error: profileErr } = await sb
      .from('profiles')
      .select('id, whatsapp_ingest_token')
      .eq('whatsapp_ingest_token', token)
      .maybeSingle();

    if (profileErr || !profile) {
      return json({ error: 'Invalid ingest token' }, 401);
    }

    const media = fromGreenApi(body) || fromSimplePayload(body);
    if (!media) {
      // Acknowledge non-media webhooks so Green API does not retry endlessly
      return json({ ok: true, skipped: true, reason: 'no_media' });
    }

    if (media.externalMessageId) {
      const { data: existing } = await sb
        .from('measurement_inbox')
        .select('id')
        .eq('user_id', profile.id)
        .eq('external_message_id', media.externalMessageId)
        .maybeSingle();
      if (existing) {
        return json({ ok: true, duplicate: true, id: existing.id });
      }
    }

    const dl = await fetch(media.fileUrl);
    if (!dl.ok) {
      return json({ error: 'Failed to download media', status: dl.status }, 502);
    }

    const bytes = new Uint8Array(await dl.arrayBuffer());
    const mimeType =
      media.mimeType ||
      dl.headers.get('content-type') ||
      'application/octet-stream';
    const ext = guessExt(mimeType, media.fileName);
    const safeName = (media.fileName || `measurement.${ext}`)
      .replace(/[^\w.\-()\u0590-\u05FF ]+/g, '_')
      .slice(0, 180);
    const storagePath = `${profile.id}/${Date.now()}_${crypto.randomUUID().slice(0, 8)}.${ext}`;

    const { error: upErr } = await sb.storage
      .from('measurements')
      .upload(storagePath, bytes, {
        contentType: mimeType,
        upsert: false,
      });

    if (upErr) {
      return json({ error: 'Upload failed: ' + upErr.message }, 500);
    }

    const { data: signed } = await sb.storage
      .from('measurements')
      .createSignedUrl(storagePath, 60 * 60 * 24 * 7); // 7 days

    const { data: row, error: insErr } = await sb
      .from('measurement_inbox')
      .insert({
        user_id: profile.id,
        source_phone: media.sourcePhone,
        sender_name: media.senderName,
        caption: media.caption,
        file_name: safeName,
        mime_type: mimeType,
        file_size: bytes.byteLength,
        storage_path: storagePath,
        public_url: signed?.signedUrl || null,
        status: 'unread',
        external_message_id: media.externalMessageId,
      })
      .select('id')
      .single();

    if (insErr) {
      // Unique race on external_message_id
      if (insErr.code === '23505') {
        return json({ ok: true, duplicate: true });
      }
      return json({ error: 'Insert failed: ' + insErr.message }, 500);
    }

    return json({ ok: true, id: row.id, storage_path: storagePath });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: msg }, 500);
  }
});
