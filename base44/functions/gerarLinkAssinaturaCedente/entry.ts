import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { cedente_id } = await req.json();
    if (!cedente_id) return Response.json({ error: 'Cedente não informado' }, { status: 400 });

    const cedente = await base44.entities.Client.get(cedente_id);
    if (!cedente) return Response.json({ error: 'Cedente não encontrado' }, { status: 404 });

    // Buscar documentos do contrato mãe (operation_id null, client_id = cedente)
    const allClientDocs = await base44.asServiceRole.entities.AssinaturaDocumento.filter({ client_id: cedente_id });
    const docs = allClientDocs.filter((d: any) => !d.operation_id && (d.document_type === 'contrato_mae' || d.document_type === 'promissoria_limite'));

    if (docs.length === 0) {
      return Response.json({ error: 'Contrato mãe não gerado. Gere o contrato primeiro.' }, { status: 400 });
    }

    // Coletar signatários: cedente + pessoas relacionadas com pode_assinar
    const signatarios: any[] = [];
    // Cedente como primeiro signatário
    if (cedente.name && cedente.document) {
      signatarios.push({
        name: cedente.name,
        cpf_cnpj: cedente.document,
        phone: cedente.whatsapp || cedente.phone || '',
        email: cedente.email || '',
        role: 'Cedente',
      });
    }
    // Pessoas relacionadas com pode_assinar
    const pessoas = await base44.asServiceRole.entities.PessoaRelacionada.filter({ cedente_id });
    for (const p of pessoas) {
      if (p.pode_assinar && p.nome && p.cpf) {
        signatarios.push({
          name: p.nome,
          cpf_cnpj: p.cpf,
          phone: p.telefone || '',
          email: p.email || '',
          role: p.funcao || 'Relacionado',
        });
      }
    }

    if (signatarios.length === 0) {
      return Response.json({ error: 'Nenhum signatário disponível (cedente sem dados ou pessoas relacionadas com poder de assinatura).' }, { status: 400 });
    }

    // Para cada documento, criar/obter signatários reais (AssinaturaSignatario) e mapear por nome+cpf
    const allSignersMap: any = {};
    for (const doc of docs) {
      let existingSigs = await base44.asServiceRole.entities.AssinaturaSignatario.filter({ document_id: doc.id });
      const existingByKey = new Map(existingSigs.map((s: any) => [`${s.name}|${s.cpf_cnpj}`, s]));

      for (const sig of signatarios) {
        const key = `${sig.name}|${sig.cpf_cnpj}`;
        let signatario = existingByKey.get(key);
        if (!signatario) {
          signatario = await base44.entities.AssinaturaSignatario.create({
            document_id: doc.id,
            document_title: doc.title,
            name: sig.name,
            cpf_cnpj: sig.cpf_cnpj,
            phone: sig.phone,
            email: sig.email,
            role: sig.role,
          });
        }
        if (!allSignersMap[key]) allSignersMap[key] = { signer: sig, doc_links: [] };
        allSignersMap[key].doc_links.push({ doc_id: doc.id, signatario_id: signatario.id });
      }
    }

    const uniqueSigners = Object.values(allSignersMap);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    // Gerar número sequencial para documentos que não têm
    for (const doc of docs) {
      if (!doc.document_number) {
        const allDocsList = await base44.asServiceRole.entities.AssinaturaDocumento.list('-created_date', 100);
        const nums = allDocsList
          .filter((d: any) => d.document_number)
          .map((d: any) => parseInt((d.document_number || '').replace(/\D/g, '') || '0'));
        const nextNum = nums.length > 0 ? Math.max(...nums) + 1 : 1;
        await base44.entities.AssinaturaDocumento.update(doc.id, {
          document_number: `DOC-${String(nextNum).padStart(6, '0')}`,
        });
      }
    }

    // Para cada signatário único, gerar UM único link (usando o ID real do signatário)
    const links = [];
    for (const { signer, doc_links } of uniqueSigners) {
      const sharedLink = crypto.randomUUID();

      for (const { doc_id, signatario_id } of doc_links) {
        const existing = await base44.asServiceRole.entities.AssinaturaDigital.filter({
          document_id: doc_id,
          signer_id: signatario_id,
        });
        if (existing.length === 0) {
          await base44.entities.AssinaturaDigital.create({
            document_id: doc_id,
            signer_id: signatario_id,
            public_link: sharedLink,
            status: 'pendente',
            otp_validated: true,
          });
        } else {
          await base44.entities.AssinaturaDigital.update(existing[0].id, {
            public_link: sharedLink,
            status: 'pendente',
            otp_validated: true,
          });
        }
      }

      for (const { doc_id } of doc_links) {
        await base44.entities.AssinaturaDocumento.update(doc_id, {
          status: 'aguardando_assinatura',
          link_expires_at: expiresAt.toISOString().split('T')[0],
        });
      }

      links.push({
        signer_name: signer.name,
        signer_phone: signer.phone || '',
        signer_email: signer.email || '',
        public_link: sharedLink,
        doc_count: doc_links.length,
      });
    }

    return Response.json({
      success: true,
      cedente_id,
      ctr_number: docs[0]?.document_number || '',
      signer_links: links,
      link_expires_at: expiresAt.toISOString().split('T')[0],
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}