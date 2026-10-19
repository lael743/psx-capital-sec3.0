import { createClientFromRequest } from 'npm:@base44/sdk@0.8.48';

/**
 * Função pública para onboarding de clientes (cedente/sacado).
 *
 * GET  ?token=xxx       → retorna dados do link + branding da empresa
 * POST { token, data }  → cria/atualiza Client ou Sacado e marca link como preenchido
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const url = new URL(req.url);
    const method = req.method;

    // === GET: carregar dados do link ===
    if (method === 'GET') {
      const token = url.searchParams.get('token');
      if (!token) {
        return Response.json({ error: 'Token não fornecido' }, { status: 400 });
      }

      const links = await base44.asServiceRole.entities.ClienteOnboarding.filter({ token });
      if (!links || links.length === 0) {
        return Response.json({ error: 'Link não encontrado' }, { status: 404 });
      }

      const link = links[0];

      if (link.status === 'preenchido') {
        return Response.json({ error: 'Este formulário já foi preenchido', already_filled: true });
      }

      if (link.expires_at && new Date(link.expires_at) < new Date()) {
        return Response.json({ error: 'Este link expirou' }, { status: 410 });
      }

      // Buscar dados da empresa para branding
      const settings = await base44.asServiceRole.entities.ConfiguracaoEmpresa.list();
      const company = settings[0] || {};

      return Response.json({
        tipo: link.tipo,
        status: link.status,
        company: {
          company_name: company.company_name || 'PSX Capital',
          company_logo_url: company.company_logo_url || '',
        },
      });
    }

    // === POST: submeter formulário ===
    if (method === 'POST') {
      const payload = await req.json();
      const { token, data } = payload;

      if (!token) {
        return Response.json({ error: 'Token não fornecido' }, { status: 400 });
      }

      const links = await base44.asServiceRole.entities.ClienteOnboarding.filter({ token });
      if (!links || links.length === 0) {
        return Response.json({ error: 'Link não encontrado' }, { status: 404 });
      }

      const link = links[0];

      if (link.status === 'preenchido') {
        return Response.json({ error: 'Este formulário já foi preenchido' }, { status: 400 });
      }

      // Validar campos obrigatórios
      const { document, name, whatsapp, cep, logradouro, numero, bairro, cidade, uf, lgpd_accepted } = data;
      if (!lgpd_accepted) {
        return Response.json({ error: 'É necessário aceitar os termos de privacidade' }, { status: 400 });
      }
      if (!document || !name || !whatsapp || !cep || !logradouro || !numero || !bairro || !cidade || !uf) {
        return Response.json({ error: 'Campos obrigatórios não preenchidos' }, { status: 400 });
      }

      const docDigits = String(document).replace(/\D/g, '');
      if (docDigits.length !== 11 && docDigits.length !== 14) {
        return Response.json({ error: 'CPF/CNPJ inválido' }, { status: 400 });
      }

      const document_type = docDigits.length === 14 ? 'CNPJ' : 'CPF';

      // Compor endereço
      const addressParts = [logradouro, numero].filter(Boolean);
      const complementStr = data.complemento ? ` - ${data.complemento}` : '';
      const addressStr = addressParts.join(', ') + complementStr;
      const fullAddress = [addressStr, bairro, `${cidade}/${uf}`, cep].filter(Boolean).join(' — ');

      let clientId = null;

      if (link.tipo === 'cedente') {
        // Verificar se já existe cedente com este documento
        const existing = await base44.asServiceRole.entities.Client.filter({ document: docDigits });
        if (existing && existing.length > 0) {
          const c = existing[0];
          await base44.asServiceRole.entities.Client.update(c.id, {
            name,
            document: docDigits,
            document_type,
            email: data.email || c.email || '',
            whatsapp,
            phone: whatsapp,
            zip_code: cep,
            address: fullAddress,
            city: cidade,
            state: uf,
            status_cadastro: 'concluido',
          });
          clientId = c.id;
        } else {
          const client = await base44.asServiceRole.entities.Client.create({
            name,
            document: docDigits,
            document_type,
            email: data.email || '',
            whatsapp,
            phone: whatsapp,
            zip_code: cep,
            address: fullAddress,
            city: cidade,
            state: uf,
            status_cadastro: 'concluido',
            status: 'ativo',
          });
          clientId = client.id;
        }
      } else {
        // Sacado
        const existing = await base44.asServiceRole.entities.Sacado.filter({ document: docDigits });
        if (existing && existing.length > 0) {
          const s = existing[0];
          await base44.asServiceRole.entities.Sacado.update(s.id, {
            nome: name,
            document: docDigits,
            document_type,
            email: data.email || s.email || '',
            phone: whatsapp,
            address: fullAddress,
            city: cidade,
            state: uf,
            zip_code: cep,
            origem: 'automatico',
          });
          clientId = s.id;
        } else {
          const sacado = await base44.asServiceRole.entities.Sacado.create({
            nome: name,
            document: docDigits,
            document_type,
            email: data.email || '',
            phone: whatsapp,
            address: fullAddress,
            city: cidade,
            state: uf,
            zip_code: cep,
            origem: 'automatico',
            status: 'ativo',
          });
          clientId = sacado.id;
        }
      }

      // Upload de documentos (se enviados)
      const uploadedDocs = [];
      if (data.documents && Array.isArray(data.documents)) {
        for (const doc of data.documents) {
          if (!doc.base64 || !doc.type) continue;
          try {
            // Converter base64 para blob
            const byteChars = atob(doc.base64.split(',')[1] || doc.base64);
            const byteNumbers = new Array(byteChars.length);
            for (let i = 0; i < byteChars.length; i++) {
              byteNumbers[i] = byteChars.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);
            const blob = new Blob([byteArray], { type: doc.mime || 'image/jpeg' });
            const file = new File([blob], doc.filename || `documento_${doc.type}.jpg`, { type: doc.mime || 'image/jpeg' });

            const uploadRes = await base44.asServiceRole.integrations.Core.UploadPublicFile({ file });
            uploadedDocs.push({
              type: doc.type,
              url: uploadRes.file_url,
            });
          } catch (e) {
            // Não falha o onboarding por erro de upload
          }
        }

        // Salvar URLs nos documentos do cliente
        if (uploadedDocs.length > 0) {
          if (link.tipo === 'cedente') {
            const updateData = {};
            for (const d of uploadedDocs) {
              if (d.type === 'rg') updateData.doc_rg_url = d.url;
              if (d.type === 'cnh') updateData.doc_cnh_url = d.url;
              if (d.type === 'comprovante_residencia') updateData.doc_address_url = d.url;
              if (d.type === 'comprovante_renda') updateData.doc_income_url = d.url;
            }
            await base44.asServiceRole.entities.Client.update(clientId, updateData);
          } else {
            for (const d of uploadedDocs) {
              await base44.asServiceRole.entities.ClienteDocumento.create({
                client_id: clientId,
                doc_category: 'Documentos do Sacado',
                doc_type: d.type,
                file_url: d.url,
                file_name: `${d.type}.jpg`,
              }).catch(() => {});
            }
          }
        }
      }

      // Atualizar status do link
      await base44.asServiceRole.entities.ClienteOnboarding.update(link.id, {
        status: 'preenchido',
        filled_at: new Date().toISOString(),
        client_id: clientId,
        client_name: name,
        document: docDigits,
      });

      return Response.json({ success: true, client_id: clientId });
    }

    return Response.json({ error: 'Método não suportado' }, { status: 405 });
  } catch (error) {
    return Response.json({ error: error.message, stack: error.stack }, { status: 500 });
  }
});