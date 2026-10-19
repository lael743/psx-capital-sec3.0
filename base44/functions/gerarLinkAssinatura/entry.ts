import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * Computa hash SHA-256 do conteúdo do documento (dados da operação + metadados do documento).
 * Este hash identifica unicamente a versão do documento e é vinculado às assinaturas.
 */
async function computeDocHash(doc, operation) {
  const content = JSON.stringify({
    doc_id: doc.id || '',
    doc_title: doc.title || '',
    doc_type: doc.document_type || '',
    doc_number: doc.document_number || '',
    op_id: operation?.id || '',
    op_numero: operation?.numero_operacao || '',
    client_id: operation?.client_id || '',
    client_name: operation?.client_name || '',
    sacado_id: operation?.sacado_id || '',
    sacado_name: operation?.sacado_name || '',
    type: operation?.type || '',
    produto: operation?.produto || '',
    calc_mode: operation?.calc_mode || '',
    calculo_inverso: operation?.calculo_inverso || false,
    total_receivable: operation?.total_receivable || 0,
    net_value: operation?.net_value || 0,
    gross_value: operation?.gross_value || 0,
    rate: operation?.rate || 0,
    start_date: operation?.start_date || '',
    due_date: operation?.due_date || '',
    days: operation?.days || 0,
    installments: operation?.installments || 1,
  });
  const data = new TextEncoder().encode(content);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { operation_id } = await req.json();
    if (!operation_id) return Response.json({ error: 'Operação não informada' }, { status: 400 });

    const operation = await base44.entities.Operation.get(operation_id);
    if (!operation) return Response.json({ error: 'Operação não encontrada' }, { status: 404 });

    // Buscar todos os documentos da operação
    let docs = await base44.entities.AssinaturaDocumento.filter({ operation_id });

    // Auto-criar documentos padrão se não existirem
    const DOCUMENTOS_AUTO = [
      { title: 'Dados da Operação', type: 'outro' },
      { title: 'Borderô', type: 'outro' },
      { title: 'Aditivo', type: 'outro' },
      { title: 'Nota Promissória', type: 'promissoria' },
    ];
    const existingTitles = docs.map(d => d.title);
    const toCreate = DOCUMENTOS_AUTO.filter(d => !existingTitles.includes(d.title));
    for (const doc of toCreate) {
      await base44.entities.AssinaturaDocumento.create({
        title: doc.title,
        document_type: doc.type,
        operation_id,
        client_id: operation.client_id,
        status: 'rascunho',
      });
    }
    if (toCreate.length > 0) {
      docs = await base44.entities.AssinaturaDocumento.filter({ operation_id });
    }

    // Coletar todos os signatários únicos (agrupados por nome+cpf)
    const allSignersMap = {};
    for (const doc of docs) {
      const sigs = await base44.asServiceRole.entities.AssinaturaSignatario.filter({ document_id: doc.id });
      for (const s of sigs) {
        const key = `${s.name}|${s.cpf_cnpj}`;
        if (!allSignersMap[key]) allSignersMap[key] = { signer: s, doc_ids: [] };
        allSignersMap[key].doc_ids.push(doc.id);
      }
    }

    const uniqueSigners = Object.values(allSignersMap);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    // Gerar número sequencial para documentos que não têm
    for (const doc of docs) {
      if (!doc.document_number) {
        const allDocs = await base44.asServiceRole.entities.AssinaturaDocumento.list('-created_date', 100);
        const nums = allDocs
          .filter(d => d.document_number)
          .map(d => parseInt((d.document_number || '').replace(/\D/g, '') || '0'));
        const nextNum = nums.length > 0 ? Math.max(...nums) + 1 : 1;
        await base44.entities.AssinaturaDocumento.update(doc.id, {
          document_number: `DOC-${String(nextNum).padStart(6, '0')}`,
        });
      }
    }

    // Computar e armazenar o hash SHA-256 de cada documento (vincula conteúdo à assinatura)
    for (const doc of docs) {
      const hash = await computeDocHash(doc, operation);
      await base44.entities.AssinaturaDocumento.update(doc.id, { document_hash: hash });
    }
    // Recarregar docs com os hashes atualizados
    docs = await base44.entities.AssinaturaDocumento.filter({ operation_id });

    // Para cada signatário único, gerar UM único link que cobre todos os documentos
    const links = [];
    for (const { signer, doc_ids } of uniqueSigners) {
      const sharedLink = crypto.randomUUID();

      // Criar ou atualizar AssinaturaDigital para cada documento com o MESMO public_link
      for (const docId of doc_ids) {
        const existing = await base44.asServiceRole.entities.AssinaturaDigital.filter({
          document_id: docId,
          signer_id: signer.id,
        });
        if (existing.length === 0) {
          await base44.asServiceRole.entities.AssinaturaDigital.create({
            document_id: docId,
            signer_id: signer.id,
            public_link: sharedLink,
            status: 'pendente',
            otp_validated: true, // Biometria substitui OTP no fluxo unificado
          });
        } else {
          await base44.asServiceRole.entities.AssinaturaDigital.update(existing[0].id, {
            public_link: sharedLink,
            status: 'pendente',
            otp_validated: true,
          });
        }
      }

      // Marcar todos os documentos como aguardando assinatura
      for (const docId of doc_ids) {
        await base44.entities.AssinaturaDocumento.update(docId, {
          status: 'aguardando_assinatura',
          link_expires_at: expiresAt.toISOString().split('T')[0],
        });
      }

      links.push({
        signer_id: signer.id,
        signer_name: signer.name,
        signer_phone: signer.phone || '',
        signer_email: signer.email || '',
        public_link: sharedLink,
        doc_count: doc_ids.length,
      });
    }

    return Response.json({
      success: true,
      operation_id,
      operation_numero: operation.numero_operacao,
      signer_links: links,
      link_expires_at: expiresAt.toISOString().split('T')[0],
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});