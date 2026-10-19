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

    // Validar campos obrigatórios (Dados Cadastrais + Condições Comerciais)
    const missing: string[] = [];
    if (!cedente.name) missing.push('Nome/Razão Social');
    if (!cedente.document) missing.push('CPF/CNPJ');
    if (!cedente.credit_limit || cedente.credit_limit <= 0) missing.push('Limite de Crédito');
    if (!cedente.default_rate || cedente.default_rate <= 0) missing.push('Taxa Mensal');
    if (missing.length > 0) {
      return Response.json({
        error: 'Cadastro incompleto',
        missing,
        message: `Preencha os campos obrigatórios: ${missing.join(', ')}`
      }, { status: 400 });
    }

    // Buscar documentos existentes do contrato mãe (operation_id null, client_id = cedente)
    const existingDocs = await base44.asServiceRole.entities.AssinaturaDocumento.filter({ client_id: cedente_id });
    const contratoMaeDocs = existingDocs.filter((d: any) => !d.operation_id && (d.document_type === 'contrato_mae' || d.document_type === 'promissoria_limite'));

    // Se já existem, não regenerar
    if (contratoMaeDocs.length >= 2) {
      return Response.json({
        success: true,
        already_exists: true,
        cedente_id,
        documents: contratoMaeDocs.map((d: any) => ({ id: d.id, title: d.title, type: d.document_type, status: d.status })),
      });
    }

    // Gerar número sequencial CTR-YYYYMMDD-XXXX
    const now = new Date();
    const ymd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    const allDocs = await base44.asServiceRole.entities.AssinaturaDocumento.list('-created_date', 500);
    const ctrNumbers = allDocs
      .map((d: any) => (d.document_number || '').match(/^CTR-(\d{8})-(\d{4})$/))
      .filter(Boolean)
      .map((m: any) => parseInt(m[2], 10));
    const nextSeq = ctrNumbers.length > 0 ? Math.max(...ctrNumbers) + 1 : 1;
    const ctrNumber = `CTR-${ymd}-${String(nextSeq).padStart(4, '0')}`;

    // Buscar configurações da empresa
    const configs = await base44.asServiceRole.entities.ConfiguracaoEmpresa.list().catch(() => []);
    const emp = configs[0] || {};
    const empNome = emp.company_name || 'PSX CAPITAL';
    const empDoc = emp.company_document || '';

    // Criar Contrato Mãe de Cessão de Crédito com Coobrigação
    const contratoMae = await base44.entities.AssinaturaDocumento.create({
      title: 'Contrato de Securitização',
      document_type: 'contrato_mae',
      document_number: ctrNumber,
      client_id: cedente_id,
      status: 'rascunho',
      description: `Contrato Mãe de Cessão de Crédito com Coobrigação — Cedente: ${cedente.name}`,
    });

    // Criar Nota Promissória do Limite
    const promissoriaLimite = await base44.entities.AssinaturaDocumento.create({
      title: 'Nota Promissória do Limite',
      document_type: 'promissoria_limite',
      document_number: `NP-${ymd}-${String(nextSeq).padStart(4, '0')}`,
      client_id: cedente_id,
      status: 'rascunho',
      description: `Nota Promissória do Limite — Cedente: ${cedente.name} — Valor: R$ ${cedente.credit_limit}`,
    });

    // Criar registros de validação pública para ambos os documentos
    const hojeStr = new Date().toISOString().slice(0, 10);
    await base44.asServiceRole.entities.DocumentoValidacao.bulkCreate([
      {
        doc_id: contratoMae.id,
        doc_type: 'contrato',
        num_operacao: ctrNumber,
        operation_id: null,
        emitente_nome: cedente.name,
        emitente_doc: cedente.document,
        beneficiario_nome: empNome,
        beneficiario_doc: empDoc,
        valor: cedente.credit_limit,
        data_emissao: hojeStr,
        data_vencimento: hojeStr,
        status_operacao: 'ativo',
      },
      {
        doc_id: promissoriaLimite.id,
        doc_type: 'promissoria',
        num_operacao: ctrNumber,
        num_promissoria: promissoriaLimite.document_number,
        operation_id: null,
        emitente_nome: cedente.name,
        emitente_doc: cedente.document,
        beneficiario_nome: empNome,
        beneficiario_doc: empDoc,
        valor: cedente.credit_limit,
        data_emissao: hojeStr,
        data_vencimento: hojeStr,
        status_operacao: 'ativo',
      },
    ]);

    // Marcar cedente com contrato_mae_gerado = true
    await base44.entities.Client.update(cedente_id, { contrato_mae_gerado: true });

    return Response.json({
      success: true,
      already_exists: false,
      cedente_id,
      ctr_number: ctrNumber,
      documents: [
        { id: contratoMae.id, title: contratoMae.title, type: 'contrato_mae', status: 'rascunho' },
        { id: promissoriaLimite.id, title: promissoriaLimite.title, type: 'promissoria_limite', status: 'rascunho' },
      ],
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}