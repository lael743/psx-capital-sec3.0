import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { public_link, otp_code } = await req.json();

    if (!public_link || !otp_code) return Response.json({ error: 'Dados incompletos' }, { status: 400 });

    const signatures = await base44.asServiceRole.entities.AssinaturaDigital.filter({ public_link });
    if (!signatures.length) return Response.json({ error: 'Link inválido' }, { status: 404 });

    const sig = signatures[0];

    if (sig.otp_validated) {
      return Response.json({ success: true, already_validated: true });
    }

    const attempts = (sig.otp_attempts || 0) + 1;

    if (attempts > 5) {
      return Response.json({ error: 'Limite de tentativas excedido' }, { status: 429 });
    }

    if (sig.otp_generated_at) {
      const elapsed = Date.now() - new Date(sig.otp_generated_at).getTime();
      if (elapsed > 10 * 60 * 1000) {
        return Response.json({ error: 'Codigo expirado. Solicite um novo.' }, { status: 410 });
      }
    }

    if (sig.otp_code !== otp_code) {
      await base44.asServiceRole.entities.AssinaturaDigital.update(sig.id, { otp_attempts: attempts });
      return Response.json({ error: 'Codigo invalido', attempts, remaining: Math.max(0, 5 - attempts) }, { status: 400 });
    }

    await base44.asServiceRole.entities.AssinaturaDigital.update(sig.id, {
      otp_validated: true,
      otp_validated_at: new Date().toISOString(),
      otp_attempts: attempts,
    });

    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});