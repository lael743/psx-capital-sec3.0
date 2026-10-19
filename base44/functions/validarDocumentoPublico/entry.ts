import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const query = body.q || '';
    const type = body.type || '';

    if (!query) return Response.json({ error: 'Termo de busca não informado' }, { status: 400 });

    let results = [];

    // Busca por número do documento
    if (type === 'documento' || !type) {
      const docs = await base44.asServiceRole.entities.AssinaturaDocumento.filter({ document_number: query });
      for (const doc of docs) {
        const sigs = await base44.asServiceRole.entities.AssinaturaDigital.filter({ document_id: doc.id, status: 'concluido' });
        results.push({
          type: 'documento',
          document: doc,
          signatures: sigs,
          valid: doc.document_hash === (sigs[0]?.document_hash_at_signature || doc.document_hash),
        });
      }
    }

    // Busca por código de assinatura
    if (type === 'assinatura' || !type) {
      const sigs = await base44.asServiceRole.entities.AssinaturaDigital.filter({ public_link: query });
      for (const sig of sigs) {
        const doc = await base44.asServiceRole.entities.AssinaturaDocumento.get(sig.document_id);
        const signer = await base44.asServiceRole.entities.AssinaturaSignatario.get(sig.signer_id);
        results.push({
          type: 'assinatura',
          document: doc,
          signature: sig,
          signer,
          valid: sig.status === 'concluido' && doc?.document_hash === sig.document_hash_at_signature,
        });
      }
    }

    // Busca por hash
    if (type === 'hash' || (!type && results.length === 0)) {
      const docs = await base44.asServiceRole.entities.AssinaturaDocumento.filter({ document_hash: query });
      if (docs.length === 0) {
        const sigsHash = await base44.asServiceRole.entities.AssinaturaDigital.filter({ document_hash_at_signature: query });
        for (const sig of sigsHash) {
          const doc = await base44.asServiceRole.entities.AssinaturaDocumento.get(sig.document_id);
          const signer = await base44.asServiceRole.entities.AssinaturaSignatario.get(sig.signer_id);
          results.push({
            type: 'hash',
            document: doc,
            signature: sig,
            signer,
            valid: sig.status === 'concluido',
          });
        }
      }
    }

    if (results.length === 0) {
      return Response.json({ found: false, message: 'Nenhum documento ou assinatura encontrado para esta busca.' });
    }

    return Response.json({ found: true, results });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});