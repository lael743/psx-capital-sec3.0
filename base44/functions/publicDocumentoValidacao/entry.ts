import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    // Apenas GET é permitido
    if (req.method !== 'GET') {
      return Response.json({ error: 'Method not allowed' }, { status: 405 });
    }

    const url = new URL(req.url);
    const docId = url.searchParams.get('doc_id');

    if (!docId) {
      return Response.json({ error: 'doc_id parameter required' }, { status: 400 });
    }

    const base44 = createClientFromRequest(req);

    // Busca com service role para ignorar autenticação
    const results = await base44.asServiceRole.entities.DocumentoValidacao.filter({ doc_id: docId });

    if (results && results.length > 0) {
      const doc = results[0];
      return Response.json({
        doc_id: doc.doc_id,
        doc_type: doc.doc_type,
        num_operacao: doc.num_operacao,
        num_promissoria: doc.num_promissoria,
        emitente_nome: doc.emitente_nome,
        emitente_doc: doc.emitente_doc,
        beneficiario_nome: doc.beneficiario_nome,
        beneficiario_doc: doc.beneficiario_doc,
        valor: doc.valor,
        data_emissao: doc.data_emissao,
        data_vencimento: doc.data_vencimento,
        status_operacao: doc.status_operacao,
        created_date: doc.created_date,
        updated_date: doc.updated_date,
      });
    }

    // Fallback: tenta localizar um AssinaturaDocumento pelo próprio ID
    // (QR codes antigos usavam o ID do documento de assinatura diretamente)
    let assDoc: any = null;
    try {
      assDoc = await base44.asServiceRole.entities.AssinaturaDocumento.get(docId);
    } catch (e) {
      // get lança se não encontrar — tenta via filter como alternativa
      try {
        const assResults = await base44.asServiceRole.entities.AssinaturaDocumento.filter({ id: docId });
        assDoc = assResults?.[0] || null;
      } catch (e2) {
        // ignore
      }
    }
    if (assDoc) {
      let cedente: any = null;
      if (assDoc.client_id) {
        try {
          const cedResults = await base44.asServiceRole.entities.Client.filter({ id: assDoc.client_id });
          cedente = cedResults?.[0] || null;
        } catch (e) {
          // ignore
        }
      }
      let emp: any = {};
      try {
        const configs = await base44.asServiceRole.entities.ConfiguracaoEmpresa.list();
        emp = configs?.[0] || {};
      } catch (e) {
        // ignore
      }
      const docTypeMap: Record<string, string> = {
        contrato_mae: 'contrato',
        promissoria_limite: 'promissoria',
        promissoria: 'promissoria',
        cessao_credito: 'cessao',
        confissao_divida: 'confissao',
        termo_garantia: 'contrato',
        contrato: 'contrato',
        outro: 'contrato',
      };
      const hojeStr = new Date().toISOString().slice(0, 10);
      const dataEmis = assDoc.created_date ? new Date(assDoc.created_date).toISOString().slice(0, 10) : hojeStr;
      let validationRecord: any = null;
      try {
        validationRecord = await base44.asServiceRole.entities.DocumentoValidacao.create({
          doc_id: assDoc.id,
          doc_type: docTypeMap[assDoc.document_type] || 'contrato',
          num_operacao: assDoc.document_number || '',
          num_promissoria: (assDoc.document_type === 'promissoria_limite' || assDoc.document_type === 'promissoria') ? assDoc.document_number : '',
          operation_id: assDoc.operation_id || null,
          emitente_nome: cedente?.name || '',
          emitente_doc: cedente?.document || '',
          beneficiario_nome: emp.company_name || 'PSX CAPITAL',
          beneficiario_doc: emp.company_document || '',
          valor: cedente?.credit_limit || 0,
          data_emissao: dataEmis,
          data_vencimento: dataEmis,
          status_operacao: 'ativo',
        });
      } catch (createErr) {
        // Se falhar, ainda retorna os dados do documento sem persistir
        return Response.json({
          doc_id: assDoc.id,
          doc_type: docTypeMap[assDoc.document_type] || 'contrato',
          num_operacao: assDoc.document_number || '',
          num_promissoria: (assDoc.document_type === 'promissoria_limite' || assDoc.document_type === 'promissoria') ? assDoc.document_number : '',
          emitente_nome: cedente?.name || '',
          emitente_doc: cedente?.document || '',
          beneficiario_nome: emp.company_name || 'PSX CAPITAL',
          beneficiario_doc: emp.company_document || '',
          valor: cedente?.credit_limit || 0,
          data_emissao: dataEmis,
          data_vencimento: dataEmis,
          status_operacao: 'ativo',
          created_date: assDoc.created_date,
          updated_date: assDoc.updated_date,
        });
      }
      if (validationRecord) {
        return Response.json({
          doc_id: validationRecord.doc_id,
          doc_type: validationRecord.doc_type,
          num_operacao: validationRecord.num_operacao,
          num_promissoria: validationRecord.num_promissoria,
          emitente_nome: validationRecord.emitente_nome,
          emitente_doc: validationRecord.emitente_doc,
          beneficiario_nome: validationRecord.beneficiario_nome,
          beneficiario_doc: validationRecord.beneficiario_doc,
          valor: validationRecord.valor,
          data_emissao: validationRecord.data_emissao,
          data_vencimento: validationRecord.data_vencimento,
          status_operacao: validationRecord.status_operacao,
          created_date: validationRecord.created_date,
          updated_date: validationRecord.updated_date,
        });
      }
    }

    return Response.json(null, { status: 404 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});