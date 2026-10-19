import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const payload = await req.json();
    const { aceite_hash, aceite_ip } = payload;

    if (!aceite_hash) {
      return Response.json({ error: 'Hash de aceite não informado' }, { status: 400 });
    }

    const notificacoes = await base44.asServiceRole.entities.NotificacaoAceite.filter({ aceite_hash: aceite_hash });

    if (!notificacoes || notificacoes.length === 0) {
      return Response.json({ error: 'Notificação não encontrada' }, { status: 404 });
    }

    const notificacao = notificacoes[0];

    if (notificacao.status === 'aceito') {
      return Response.json({ error: 'Este termo já foi aceito anteriormente' }, { status: 400 });
    }

    const agora = new Date().toISOString();
    const ip = aceite_ip || req.headers.get('x-forwarded-for') || req.headers.get('cf-connecting-ip') || 'desconhecido';

    await base44.asServiceRole.entities.NotificacaoAceite.update(notificacao.id, {
      status: 'aceito',
      aceite_data: agora,
      aceite_ip: ip,
    });

    if (notificacao.operation_id) {
      await base44.asServiceRole.entities.Operation.update(notificacao.operation_id, {
        notificacao_status: 'aceito',
      });
    }

    return Response.json({
      success: true,
      message: 'Termo aceito com sucesso',
      aceite_data: agora,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});