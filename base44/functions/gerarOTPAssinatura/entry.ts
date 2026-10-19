import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { public_link } = await req.json();

    if (!public_link) return Response.json({ error: 'Link não informado' }, { status: 400 });

    const signatures = await base44.asServiceRole.entities.AssinaturaDigital.filter({ public_link });
    if (!signatures.length) return Response.json({ error: 'Link inválido' }, { status: 404 });

    const sig = signatures[0];

    if (sig.otp_attempts >= 5) {
      return Response.json({ error: 'Limite de 5 tentativas excedido. Solicite um novo código.' }, { status: 429 });
    }

    const otp = String(Math.floor(100000 + Math.random() * 900000));

    await base44.asServiceRole.entities.AssinaturaDigital.update(sig.id, {
      otp_code: otp,
      otp_generated_at: new Date().toISOString(),
      otp_attempts: 0,
    });

    const signer = await base44.asServiceRole.entities.AssinaturaSignatario.get(sig.signer_id);
    const doc = await base44.asServiceRole.entities.AssinaturaDocumento.get(sig.document_id);

    const phone = (signer.phone || '').replace(/\D/g, '');
    const msg = `Seu codigo de assinatura para o documento *${doc.title || 'Documento'}* e: *${otp}*\n\nEste codigo expira em 10 minutos.`;
    const whatsappLink = phone ? `https://wa.me/55${phone}?text=${encodeURIComponent(msg)}` : null;

    return Response.json({
      success: true,
      otp_code: otp,
      whatsapp_link: whatsappLink,
      signer_phone: signer.phone,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});