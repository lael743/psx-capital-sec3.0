import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const url = new URL(req.url);
    let aceiteHash = url.searchParams.get('hash');

    // POST: o hash pode vir no corpo da requisição
    if (!aceiteHash && req.method === 'POST') {
      try {
        const body = await req.json();
        aceiteHash = body?.hash || null;
      } catch (_) { /* body vazio ou inválido */ }
    }

    if (!aceiteHash) {
      return Response.json({ error: 'Hash não informado' }, { status: 400 });
    }

    // Busca a notificação pelo hash
    const notificacoes = await base44.asServiceRole.entities.NotificacaoAceite.filter({ aceite_hash: aceiteHash });
    if (!notificacoes || notificacoes.length === 0) {
      return Response.json({ error: 'Notificação não encontrada' }, { status: 404 });
    }

    const notificacao = notificacoes[0];

    // Busca dados da operação vinculada
    let operacao = null;
    if (notificacao.operation_id) {
      operacao = await base44.asServiceRole.entities.Operation.get(notificacao.operation_id).catch(() => null);
    }

    // Se for POST, processa o aceite
    if (req.method === 'POST') {
      if (notificacao.status === 'aceito') {
        return Response.json({ error: 'Este termo já foi aceito anteriormente e não pode ser alterado.' }, { status: 400 });
      }

      const ip = req.headers.get('x-forwarded-for') || req.headers.get('cf-connecting-ip') || 'desconhecido';
      const agora = new Date().toISOString();

      await base44.asServiceRole.entities.NotificacaoAceite.update(notificacao.id, {
        status: 'aceito',
        aceite_data: agora,
        aceite_ip: ip,
      });

      // Atualiza o status na operação
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
    }

    // GET: retorna dados da notificação
    return Response.json({
      ...notificacao,
      operacao: operacao ? {
        id: operacao.id,
        client_name: operacao.client_name,
        gross_value: operacao.gross_value,
        total_receivable: operacao.total_receivable,
        due_date: operacao.due_date,
        type: operacao.type,
        sacado_name: operacao.sacado_name,
        installment_schedule: operacao.installment_schedule,
        status: operacao.status,
      } : null,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});