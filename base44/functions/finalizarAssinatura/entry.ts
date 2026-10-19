import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

function base64ToUint8Array(base64) {
  const binaryStr = atob(base64.includes(',') ? base64.split(',')[1] : base64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
  return bytes;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    // Captura IP real da requisição (cabeçalhos de proxy/CDN)
    const realIp =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      req.headers.get('x-real-ip') ||
      req.headers.get('cf-connecting-ip') ||
      'desconhecido';

    const body = await req.json();
    const {
      public_link, selfie_base64, selfie_url,
      user_agent, device_type, browser, operating_system,
      screen_resolution, language, latitude, longitude, gps_accuracy
    } = body;
    // Prefere IP real do servidor sobre o enviado pelo cliente
    const ip_address = realIp;

    if (!public_link) return Response.json({ error: 'Link não informado' }, { status: 400 });

    const rawSelfie = selfie_url || selfie_base64;
    if (!rawSelfie) return Response.json({ error: 'Selfie não fornecida' }, { status: 400 });

    // Buscar TODOS os registros de assinatura com este public_link
    const signatures = await base44.asServiceRole.entities.AssinaturaDigital.filter({ public_link });
    if (!signatures.length) return Response.json({ error: 'Link inválido' }, { status: 404 });

    // Verificar se já estão todos assinados
    const allSigned = signatures.every(s => s.status === 'concluido');
    if (allSigned) return Response.json({ error: 'Documentos já assinados' }, { status: 400 });

    // Upload da selfie uma única vez
    let selfieImageUrl = selfie_url || '';
    if (selfie_base64) {
      const selfieBytes = base64ToUint8Array(selfie_base64);
      const selfieFile = new File([selfieBytes], 'selfie.jpg', { type: 'image/jpeg' });
      const selfieUpload = await base44.asServiceRole.integrations.Core.UploadFile({ file: selfieFile });
      selfieImageUrl = selfieUpload.file_url;
    }

    const now = new Date().toISOString();

    // Atualizar TODOS os registros de assinatura com a mesma evidência
    const docIds = new Set();
    for (const sig of signatures) {
      if (sig.status === 'concluido') continue;
      const doc = await base44.asServiceRole.entities.AssinaturaDocumento.get(sig.document_id);
      const docHash = doc?.document_hash || '';

      await base44.asServiceRole.entities.AssinaturaDigital.update(sig.id, {
        selfie_image: selfieImageUrl,
        signed_at: now,
        ip_address: ip_address || '',
        user_agent: user_agent || '',
        device_type: device_type || '',
        browser: browser || '',
        operating_system: operating_system || '',
        screen_resolution: screen_resolution || '',
        language: language || '',
        latitude: latitude || '',
        longitude: longitude || '',
        gps_accuracy: gps_accuracy || '',
        document_hash_at_signature: docHash,
        status: 'concluido',
      });
      docIds.add(sig.document_id);
    }

    // Marcar TODOS os documentos como assinados
    for (const docId of docIds) {
      await base44.asServiceRole.entities.AssinaturaDocumento.update(docId, { status: 'assinado' });
    }

    return Response.json({
      success: true,
      signed_count: signatures.length,
      document_ids: Array.from(docIds),
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});