const STORAGE_KEY = 'psx_company_settings';
export function getSettings() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch { return {}; }
}

export function fmtDate(str) {
  if (!str) return '';
  const [y, m, d] = str.split('-');
  return `${d}/${m}/${y}`;
}

/**
 * Constrói o objeto `dados` usado pelos componentes de preview de contrato
 * (ContratoPreview, NotaPromissoriaPreview, CessaoCreditoPreview, etc.)
 * a partir de uma operação + cliente + cheques vinculados.
 */
export function buildDadosContrato(operacao, client, cheques = [], sacado = null, documentHash = '') {
  const settings = getSettings();
  if (!operacao) return null;

  const isBoleto = operacao.type === 'boleto';
  const isCessao = isBoleto;

  const form = {
    credor_nome: settings.company_name || 'PSX CAPITAL',
    credor_doc: settings.company_document || '',
    credor_rg: '',
    credor_endereco: settings.company_address || '',
    credor_cidade: settings.company_city || '',
    credor_estado: settings.company_state || '',
    devedor_nome: (operacao.client_name || client?.name || '').toUpperCase(),
    devedor_doc: client?.document || '',
    devedor_rg: '',
    devedor_endereco: (client?.address || '').toUpperCase(),
    devedor_cidade: (client?.city || '').toUpperCase(),
    devedor_estado: (client?.state || '').toUpperCase(),
    cedido_nome: isBoleto ? (sacado?.nome || sacado?.name || operacao.sacado_name || '').toUpperCase() : '',
    cedido_doc: isBoleto ? (sacado?.document || '') : '',
    cedido_rg: '',
    cedido_endereco: isBoleto ? (sacado?.address || '').toUpperCase() : '',
    cedido_cidade: isBoleto ? (sacado?.city || '').toUpperCase() : '',
    cedido_estado: isBoleto ? (sacado?.state || '').toUpperCase() : '',
    valor_liberado: isBoleto ? String(operacao.total_receivable || operacao.net_value || '') : String(operacao.gross_value || ''),
    acrescimo_pct: String(operacao.rate || ''),
    data_liberacao: operacao.start_date || '',
    data_vencimento: operacao.due_date || '',
    prazo_dias: String(operacao.days || ''),
    modo_calculo: isBoleto ? 'cessao' : 'recebiveis',
    multa_pct: settings.contract_multa_pct || '2',
    mora_pct: settings.contract_mora_pct || '1',
    prazo_atraso: settings.contract_prazo_atraso || '3',
    foro_cidade: settings.company_city || '',
    dias_recompra: '30',
    honorario_cobranca: '10',
    test1_nome: '',
    test1_cpf: '',
    test2_nome: '',
    test2_cpf: '',
    incluir_avalista: false,
    avalista_nome: '',
    avalista_doc: '',
    avalista_rg: '',
    avalista_endereco: '',
    avalista_cidade: '',
    avalista_estado: '',
  };

  const valorLiberado = parseFloat(form.valor_liberado) || 0;
  const acrescimoPct = parseFloat(form.acrescimo_pct) || 0;
  const prazoDias = parseInt(form.prazo_dias) || 0;

  let valorFinal = 0;
  let valorLiquidoCessao = 0;
  let acrescimoValor = 0;

  if (operacao.total_receivable > 0) {
    valorFinal = operacao.total_receivable;
    if (isCessao) {
      valorLiquidoCessao = operacao.net_value || 0;
      acrescimoValor = Math.round((valorFinal - valorLiquidoCessao) * 100) / 100;
    } else {
      acrescimoValor = Math.round((valorFinal - valorLiberado) * 100) / 100;
    }
  } else if (isCessao) {
    valorFinal = valorLiberado;
    const taxaProp = (acrescimoPct / 100) * (prazoDias / 30);
    acrescimoValor = Math.round(valorLiberado * taxaProp * 100) / 100;
    valorLiquidoCessao = Math.round((valorLiberado - acrescimoValor) * 100) / 100;
  } else if (form.modo_calculo === 'direto') {
    valorFinal = Math.round((valorLiberado * (1 + acrescimoPct / 100)) * 100) / 100;
    acrescimoValor = Math.round(Math.abs(valorFinal - valorLiberado) * 100) / 100;
  } else {
    const fator = 1 - (acrescimoPct / 100) * (prazoDias / 30);
    valorFinal = fator > 0 ? Math.round((valorLiberado / fator) * 100) / 100 : valorLiberado;
    acrescimoValor = Math.round(Math.abs(valorFinal - valorLiberado) * 100) / 100;
  }

  const numOperacaoRaw = operacao.numero_operacao || operacao.id?.slice(-6) || '';
  const numOperacao = `#${String(numOperacaoRaw).padStart(6, '0')}`;
  const validacaoUrl = `${window.location.origin}/validar?id=${operacao.id || ''}`;

  return {
    ...form,
    valorLiberado,
    valorFinal,
    acrescimoValor,
    acrescimoPct,
    prazoDias,
    num_promissoria: operacao.num_promissoria || '',
    num_operacao: numOperacao,
    operacao,
    cheques,
    validacao_url: validacaoUrl,
    document_hash: documentHash || operacao?.document_hash || '',
    devedor_zip: client?.zip_code || '',
    cedente_nome: form.devedor_nome,
    cedente_doc: form.devedor_doc,
    cedente_rg: form.devedor_rg,
    cedente_endereco: form.devedor_endereco,
    cedente_cidade: form.devedor_cidade,
    cedente_estado: form.devedor_estado,
    valor_nominal: valorFinal,
    valor_liquido: isCessao ? valorLiquidoCessao : valorLiberado,
    desagio_valor: acrescimoValor,
    taxa_pct: acrescimoPct,
    dias_recompra: form.dias_recompra,
    honorario_cobranca: form.honorario_cobranca,
    incluir_avalista: form.incluir_avalista,
    avalista_nome: form.avalista_nome,
    avalista_doc: form.avalista_doc,
    avalista_rg: form.avalista_rg,
    avalista_endereco: form.avalista_endereco,
    avalista_cidade: form.avalista_cidade,
    avalista_estado: form.avalista_estado,
  };
}

/**
 * Constrói o objeto `dados` para o Contrato Mãe / Nota Promissória do Limite,
 * a partir do cedente (sem operação vinculada). Usa o limite de crédito como
 * valor e a taxa mensal do cedente.
 */
export function buildDadosContratoMae(cedente, docId = '', ctrNumber = '') {
  const settings = getSettings();
  if (!cedente) return null;
  const valorLimite = parseFloat(cedente.credit_limit) || 0;
  const taxa = parseFloat(cedente.default_rate) || 0;
  const endereco = cedente.enderecos?.find(e => e.principal) || cedente.enderecos?.[0] || {};
  const cidade = (endereco.cidade || cedente.city || '').toUpperCase();
  const estado = (endereco.uf || cedente.state || '').toUpperCase();
  const logradouro = (endereco.logradouro
    ? `${endereco.logradouro}${endereco.numero ? ', ' + endereco.numero : ''}${endereco.bairro ? ' — ' + endereco.bairro : ''}`
    : (cedente.address || '')).toUpperCase();

  const vencimentoCadastro = cedente.vencimento_cadastro || '';
  const hoje = new Date().toISOString().slice(0, 10);

  return {
    credor_nome: settings.company_name || 'PSX CAPITAL',
    credor_doc: settings.company_document || '',
    credor_rg: '',
    credor_endereco: settings.company_address || '',
    credor_cidade: settings.company_city || '',
    credor_estado: settings.company_state || '',
    devedor_nome: (cedente.name || '').toUpperCase(),
    devedor_doc: cedente.document || '',
    devedor_rg: '',
    devedor_endereco: logradouro,
    devedor_cidade: cidade,
    devedor_estado: estado,
    valorLiberado: valorLimite,
    valorFinal: valorLimite,
    acrescimoValor: 0,
    acrescimoPct: taxa,
    prazoDias: 0,
    data_liberacao: hoje,
    data_vencimento: vencimentoCadastro,
    num_promissoria: '',
    num_operacao: ctrNumber,
    operacao: { total_receivable: valorLimite, gross_value: valorLimite, due_date: vencimentoCadastro, start_date: hoje, numero_operacao: ctrNumber },
    cheques: [],
    validacao_url: `${window.location.origin}/validar?id=${docId || ''}`,
    multa_pct: settings.contract_multa_pct || '2',
    mora_pct: settings.contract_mora_pct || '1',
    prazo_atraso: settings.contract_prazo_atraso || '3',
    foro_cidade: settings.company_city || '',
    dias_recompra: '30',
    honorario_cobranca: '10',
    test1_nome: '', test1_cpf: '', test2_nome: '', test2_cpf: '',
    incluir_avalista: false,
    avalista_nome: '', avalista_doc: '', avalista_rg: '',
    avalista_endereco: '', avalista_cidade: '', avalista_estado: '',
    cedente_nome: (cedente.name || '').toUpperCase(),
    cedente_doc: cedente.document || '',
    valor_nominal: valorLimite,
    valor_liquido: valorLimite,
    desagio_valor: 0,
    taxa_pct: taxa,
  };
}

/**
 * Mapeia o título/tipo do documento para o componente de preview apropriado.
 * Retorna: 'contrato' | 'promissoria' | 'cessao' | 'notificacao' | 'confissao' | 'comprovante' | null
 */
export function getDocPreviewType(doc) {
  if (!doc) return null;
  const title = (doc.title || '').toLowerCase();
  const type = doc.document_type || '';
  if (type === 'contrato_mae') return 'contrato_mae';
  if (type === 'promissoria_limite') return 'promissoria';
  if (type === 'promissoria' || title.includes('promissória') || title.includes('promissoria')) return 'promissoria';
  if (type === 'cessao_credito' || title.includes('cessão') || title.includes('cessao')) return 'cessao';
  if (type === 'confissao_divida' || title.includes('confissão') || title.includes('confissao')) return 'confissao';
  if (title.includes('notificação') || title.includes('notificacao') || title.includes('termo')) return 'notificacao';
  if (title.includes('comprovante') || title.includes('repasse')) return 'comprovante';
  if (type === 'contrato' || title.includes('contrato')) return 'contrato';
  if (title.includes('borderô') || title.includes('bordero')) return 'bordero';
  if (title.includes('dados da operação') || title.includes('dados da operacao') || title === 'dados da operação') return 'dados';
  if (title.includes('aditivo') || title.includes('declaração de recebimento') || title.includes('declaracao')) return 'aditivo';
  return null;
}