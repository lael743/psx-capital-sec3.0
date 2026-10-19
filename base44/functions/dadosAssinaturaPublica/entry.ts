import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { public_link } = await req.json();

    if (!public_link) return Response.json({ error: 'Link não informado' }, { status: 400 });

    // Buscar TODOS os registros de assinatura com este public_link (múltiplos documentos)
    const signatures = await base44.asServiceRole.entities.AssinaturaDigital.filter({ public_link });
    if (!signatures.length) return Response.json({ error: 'Link inválido ou expirado' }, { status: 404 });

    // Verificar se já foi assinado
    const allSigned = signatures.every(s => s.status === 'concluido');
    if (allSigned) {
      return Response.json({
        error: 'Documentos já assinados',
        already_signed: true,
        signature: signatures[0],
      });
    }

    // Verificar expiração
    const firstSig = signatures[0];
    const firstDoc = await base44.asServiceRole.entities.AssinaturaDocumento.get(firstSig.document_id);
    if (!firstDoc) return Response.json({ error: 'Documento não encontrado' }, { status: 404 });

    if (firstDoc.link_expires_at && new Date(firstDoc.link_expires_at) < new Date()) {
      for (const sig of signatures) {
        await base44.asServiceRole.entities.AssinaturaDigital.update(sig.id, { status: 'expirado' });
      }
      return Response.json({ error: 'Link expirado', expired: true }, { status: 410 });
    }

    if (firstDoc.status === 'cancelado') {
      return Response.json({ error: 'Documentos cancelados' }, { status: 410 });
    }

    // Buscar todos os documentos vinculados a este link
    const documents = [];
    for (const sig of signatures) {
      const doc = await base44.asServiceRole.entities.AssinaturaDocumento.get(sig.document_id);
      if (doc) documents.push(doc);
    }

    // Buscar dados da operação
    let operation = null;
    let client = null;
    let cheques = [];
    let sacado = null;
    let pessoas = [];

    if (firstDoc.operation_id) {
      try {
        operation = await base44.asServiceRole.entities.Operation.get(firstDoc.operation_id);
        if (operation?.client_id) {
          client = await base44.asServiceRole.entities.Client.get(operation.client_id);
        }
        // Cheques vinculados (operações de cheque)
        if (operation?.type === 'cheque') {
          cheques = await base44.asServiceRole.entities.Cheque.filter({ operation_id: operation.id }, 'compensation_date', 100);
        }
        // Sacado (operações de boleto)
        if (operation?.type === 'boleto' && operation?.sacado_id) {
          sacado = await base44.asServiceRole.entities.Sacado.get(operation.sacado_id).catch(() => null);
        }
      } catch (_) { /* non-critical */ }
    } else if (firstDoc.client_id) {
      // Contrato Mãe / Promissória do Limite (sem operação): carrega cedente + pessoas relacionadas
      try {
        client = await base44.asServiceRole.entities.Client.get(firstDoc.client_id);
        pessoas = await base44.asServiceRole.entities.PessoaRelacionada.filter({ cedente_id: firstDoc.client_id });
      } catch (_) { /* non-critical */ }
    }

    // Buscar dados do signatário
    const signer = await base44.asServiceRole.entities.AssinaturaSignatario.get(firstSig.signer_id);

    // Buscar configurações da empresa para renderização dos documentos
    let company_settings = null;
    try {
      const configs = await base44.asServiceRole.entities.ConfiguracaoEmpresa.list();
      if (configs.length > 0) company_settings = configs[0];
    } catch (_) { /* non-critical */ }

    return Response.json({
      documents,
      signer,
      operation,
      client,
      cheques,
      sacado,
      pessoas,
      company_settings,
      signature: firstSig,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});