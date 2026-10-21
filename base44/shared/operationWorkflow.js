/**
 * M5 — REGRAS DO WORKFLOW DE OPERAÇÕES (módulo PURO).
 *
 * Este arquivo descreve QUAIS transições existem, QUEM pode executá-las e QUAIS
 * pré-requisitos precisam estar cumpridos. Não lê banco, não escreve nada e não
 * conhece SDK: recebe a operação, os títulos e o usuário já resolvidos e devolve
 * uma decisão.
 *
 * ── POR QUE ASSIM ──────────────────────────────────────────────────────────
 *
 * Até o M4 as etapas avançavam por um `Operation.update({ etapa })` disparado
 * pelo botão da tela: qualquer etapa pulava para a seguinte sem pré-requisito,
 * sem autorização e sem registro. Rejeitar cancelava títulos mesmo com dinheiro
 * recebido, e reabrir devolvia títulos cancelados a "pendente" sem olhar o que
 * já havia acontecido com eles.
 *
 * A decisão agora é tomada AQUI, e a mesma decisão roda no servidor
 * (`base44/shared/operationWorkflow.js`, cópia byte a byte — o teste M5.15 falha
 * se divergirem). O navegador usa este módulo apenas para decidir o que MOSTRAR;
 * o servidor é quem aplica.
 *
 * ── EFEITOS FINANCEIROS ────────────────────────────────────────────────────
 *
 * Rejeitar, reabrir e voltar para rascunho não estornam nada. Quando existe
 * dinheiro recebido, título compensado/devolvido/resolvido, cobrança Asaas
 * emitida, repasse executado ou lançamento de extrato, a transição é RECUSADA e
 * o caso vai para regularização própria. Nenhum efeito é revertido aqui.
 */

export const STAGES = [
  { key: 'rascunho', label: 'Rascunho' },
  { key: 'nova', label: 'Nova' },
  { key: 'analise_credito', label: 'Análise de Crédito' },
  { key: 'confirmacao_titulos', label: 'Confirmação de Títulos' },
  { key: 'formalizacao', label: 'Formalização' },
  { key: 'assinatura', label: 'Assinatura' },
  { key: 'pagamento', label: 'Pagamento' },
  { key: 'finalizada', label: 'Finalizada' },
];

export const getNextStage = (currentEtapa) => {
  const idx = STAGES.findIndex((s) => s.key === currentEtapa);
  if (idx === -1 || idx >= STAGES.length - 1) return null;
  return STAGES[idx + 1];
};

export const getStageIndex = (etapa) => STAGES.findIndex((s) => s.key === etapa);

/** Ações do workflow. O corpo da requisição só pode escolher entre estas. */
export const ACOES = Object.freeze({
  AVANCAR: 'avancar',
  REJEITAR: 'rejeitar',
  REABRIR: 'reabrir',
  VOLTAR_RASCUNHO: 'voltar_rascunho',
});

const OPERACIONAL = 'operacional';
const ADMIN = 'admin';

/**
 * Tabela declarativa de transições: a ÚNICA fonte de verdade do fluxo.
 * `perfil` é o mínimo exigido; o servidor sempre confere antes de aplicar.
 */
export const TRANSICOES = Object.freeze([
  { acao: ACOES.AVANCAR, de: 'rascunho', para: 'nova', perfil: OPERACIONAL },
  { acao: ACOES.AVANCAR, de: 'nova', para: 'analise_credito', perfil: OPERACIONAL },
  { acao: ACOES.AVANCAR, de: 'analise_credito', para: 'confirmacao_titulos', perfil: OPERACIONAL },
  { acao: ACOES.AVANCAR, de: 'confirmacao_titulos', para: 'formalizacao', perfil: OPERACIONAL },
  { acao: ACOES.AVANCAR, de: 'formalizacao', para: 'assinatura', perfil: OPERACIONAL },
  { acao: ACOES.AVANCAR, de: 'assinatura', para: 'pagamento', perfil: OPERACIONAL },
  { acao: ACOES.AVANCAR, de: 'pagamento', para: 'finalizada', perfil: OPERACIONAL },
  { acao: ACOES.REJEITAR, de: 'rascunho', para: 'rejeitada', perfil: OPERACIONAL },
  { acao: ACOES.REJEITAR, de: 'nova', para: 'rejeitada', perfil: OPERACIONAL },
  { acao: ACOES.REJEITAR, de: 'analise_credito', para: 'rejeitada', perfil: OPERACIONAL },
  { acao: ACOES.REJEITAR, de: 'confirmacao_titulos', para: 'rejeitada', perfil: OPERACIONAL },
  { acao: ACOES.REJEITAR, de: 'formalizacao', para: 'rejeitada', perfil: OPERACIONAL },
  { acao: ACOES.REJEITAR, de: 'assinatura', para: 'rejeitada', perfil: OPERACIONAL },
  { acao: ACOES.REJEITAR, de: 'pagamento', para: 'rejeitada', perfil: OPERACIONAL },
  { acao: ACOES.REABRIR, de: 'rejeitada', para: 'rascunho', perfil: OPERACIONAL },
  { acao: ACOES.VOLTAR_RASCUNHO, de: 'nova', para: 'rascunho', perfil: OPERACIONAL },
  { acao: ACOES.VOLTAR_RASCUNHO, de: 'analise_credito', para: 'rascunho', perfil: ADMIN },
  { acao: ACOES.VOLTAR_RASCUNHO, de: 'confirmacao_titulos', para: 'rascunho', perfil: ADMIN },
  { acao: ACOES.VOLTAR_RASCUNHO, de: 'formalizacao', para: 'rascunho', perfil: ADMIN },
  { acao: ACOES.VOLTAR_RASCUNHO, de: 'assinatura', para: 'rascunho', perfil: ADMIN },
  { acao: ACOES.VOLTAR_RASCUNHO, de: 'pagamento', para: 'rascunho', perfil: ADMIN },
]);

export const MOTIVO_MINIMO = 5;

/** Etapa efetiva: registros antigos sem `etapa` são operações "nova" (M4). */
export function normalizarEtapa(etapa) {
  if (!etapa) return 'nova';
  return STAGES.some((s) => s.key === etapa) || etapa === 'rejeitada' ? etapa : 'desconhecida';
}

/**
 * Papel efetivo do usuário autenticado, lido do objeto devolvido pelo token.
 * `admin` manda; operador precisa da página de Operações liberada.
 */
export function papelDoUsuario(usuario) {
  if (!usuario || !usuario.email) return 'anonimo';
  if (usuario.role === 'admin') return ADMIN;
  if (usuario.role !== 'user') return 'desconhecido';
  const paginas = Array.isArray(usuario.allowed_pages) ? usuario.allowed_pages : [];
  return paginas.includes('operacoes') ? OPERACIONAL : 'sem_permissao';
}

const listaComValor = (v) => Array.isArray(v) && v.length > 0;
const numero = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const valorDoTitulo = (t) => numero(t && (t.valor_face !== undefined ? t.valor_face : t.value));

const INTENCOES_ATIVAS = ['solicitando', 'criada', 'reconciliacao_pendente'];

function temIntencaoAsaasAtiva(intencoes) {
  if (!intencoes || typeof intencoes !== 'object') return false;
  return Object.values(intencoes).some((i) => i && INTENCOES_ATIVAS.includes(i.estado));
}

/**
 * Resume os efeitos financeiros já concretizados. Todos os campos vêm do
 * documento da operação e dos títulos — nada do corpo da requisição.
 */
export function efeitosFinanceiros(operacao = {}, titulos = []) {
  const recebimento = numero(operacao.amount_paid) > 0
    || listaComValor(operacao.receipt_keys)
    || listaComValor(operacao.asaas_eventos_processados)
    || numero(operacao.cheques_compensados_total) > 0;

  const TITULO_COM_EFEITO = ['compensado', 'devolvido', 'resolvido_pago', 'resolvido_substituido', 'resolvido_prorrogado'];
  const tituloComEfeito = (titulos || []).some((t) => t && (
    TITULO_COM_EFEITO.includes(t.status)
    || !!t.compensation_token
    || !!t.resolucao_evento
    || numero(t.taxa_recebida) > 0
    || !!t.devolucao_fisica_evento
  ));

  const cobranca = !!operacao.asaas_payment_id
    || !!operacao.asaas_subscription_id
    || temIntencaoAsaasAtiva(operacao.asaas_intents);

  const repasse = operacao.payment_executed === true;
  const extrato = listaComValor(operacao.asaas_lancamentos_gerados);

  return {
    recebimento,
    tituloComEfeito,
    cobranca,
    repasse,
    extrato,
    algum: recebimento || tituloComEfeito || cobranca || repasse || extrato,
  };
}

const ROTULO_EFEITO = {
  recebimento: 'há recebimento registrado',
  tituloComEfeito: 'há título compensado, devolvido ou resolvido',
  cobranca: 'há cobrança/assinatura Asaas emitida',
  repasse: 'o repasse ao cliente já foi executado',
  extrato: 'há lançamento no extrato do cliente',
};

function descreverEfeitos(efeitos) {
  return Object.keys(ROTULO_EFEITO).filter((k) => efeitos[k]).map((k) => ROTULO_EFEITO[k]);
}

/** Títulos que a rejeição pode cancelar: só os pendentes, sem efeito algum. */
export function titulosParaCancelar(titulos = []) {
  return (titulos || []).filter((t) => t && t.id && t.status === 'pendente').map((t) => t.id);
}

/**
 * Títulos que a reabertura pode devolver a "pendente": apenas os cancelados e
 * SEM nenhuma evidência de efeito financeiro (compensação, resolução, taxa
 * recebida, devolução física). Qualquer dúvida mantém o título cancelado.
 */
export function titulosParaRestaurar(titulos = []) {
  return (titulos || []).filter((t) => t && t.id && t.status === 'cancelado'
    && !t.compensation_token
    && !t.resolucao_evento
    && numero(t.taxa_recebida) === 0
    && !t.devolucao_fisica_evento).map((t) => t.id);
}

function pendenciasDeAvanco(etapaAtual, operacao, titulos, contexto) {
  const bloqueios = [];
  const avisos = [];
  const cliente = contexto.cliente || null;
  const config = contexto.config || {};
  const tipo = operacao.produto || operacao.type || 'emprestimo';
  const somaTitulos = (titulos || []).reduce((s, t) => s + valorDoTitulo(t), 0);

  if (etapaAtual === 'rascunho' || etapaAtual === 'nova') {
    if (!(titulos || []).some((t) => valorDoTitulo(t) > 0)) {
      bloqueios.push('Adicione ao menos um título com valor antes de avançar.');
    }
    if (tipo !== 'emprestimo' && !operacao.client_id) {
      bloqueios.push('Defina o cedente da operação antes de avançar.');
    }
  }

  if (etapaAtual === 'analise_credito') {
    if (operacao.client_id && !cliente) {
      bloqueios.push('Cedente da operação não encontrado.');
    }
    if (cliente) {
      if (cliente.status === 'bloqueado') bloqueios.push('Cedente bloqueado no sistema.');
      const limite = numero(cliente.credit_limit);
      const exposicao = numero(contexto.exposicao) + numero(operacao.total_receivable);
      if (config.block_over_limit !== false && limite > 0 && exposicao > limite) {
        bloqueios.push(`Limite de crédito excedido: exposição de ${exposicao.toFixed(2)} para limite de ${limite.toFixed(2)}.`);
      }
      const faltando = ['doc_rg_url', 'doc_cnh_url', 'doc_income_url', 'doc_address_url'].filter((c) => !cliente[c]);
      if (faltando.length > 0 && config.validate_cpf_cnpj !== false) {
        avisos.push(`Documentação incompleta do cedente (${faltando.length} documento(s) ausente(s)).`);
      }
    }
  }

  if (etapaAtual === 'confirmacao_titulos') {
    const naoPendentes = (titulos || []).filter((t) => t.status !== 'pendente');
    if (naoPendentes.length > 0) {
      bloqueios.push(`${naoPendentes.length} título(s) não estão pendentes; regularize antes de formalizar.`);
    }
    if (!(titulos || []).length || somaTitulos <= 0) {
      bloqueios.push('A operação precisa de títulos válidos para ser formalizada.');
    }
    const agenda = Array.isArray(operacao.installment_schedule) ? operacao.installment_schedule : [];
    if (agenda.length === 0 || !agenda.every((p) => p && p.id)) {
      bloqueios.push('A agenda de parcelas está incompleta; salve a operação novamente antes de formalizar.');
    }
  }

  if (etapaAtual === 'formalizacao' && operacao.needs_contract === true) {
    if (!operacao.contract_url && !contexto.temContrato) {
      bloqueios.push('Gere o contrato antes de enviar a operação para assinatura.');
    }
  }

  if (etapaAtual === 'assinatura' && operacao.needs_contract === true && operacao.contract_signed_confirmed !== true) {
    bloqueios.push('Confirme o contrato assinado antes de seguir para o pagamento.');
  }

  if (etapaAtual === 'pagamento') {
    if (tipo === 'assinatura') {
      if (!operacao.asaas_subscription_id && !operacao.asaas_payment_id && !contexto.temVinculoAssinatura) {
        bloqueios.push('Emita a assinatura/cobrança no Asaas antes de finalizar.');
      }
    } else if (operacao.payment_executed !== true) {
      bloqueios.push('O repasse ao cliente ainda não foi executado.');
    }
  }

  return { bloqueios, avisos };
}

/**
 * Decide uma transição. Devolve sempre um objeto com `permitida`; quando
 * recusada, traz `status` HTTP sugerido, `motivo` legível e `bloqueios`.
 *
 * @param {object} pedido
 * @param {object} pedido.operacao  documento da operação (fonte da verdade)
 * @param {Array}  [pedido.titulos] títulos (Cheque) vinculados
 * @param {object} [pedido.contexto] dados auxiliares já carregados pelo servidor
 * @param {object} [pedido.usuario] usuário resolvido pelo token
 * @param {string} pedido.acao
 * @param {string} [pedido.motivo]
 */
export function avaliarTransicao(pedido = {}) {
  const { operacao = {}, titulos = [], contexto = {}, usuario = null, acao = '', motivo = '' } = pedido;

  const papel = papelDoUsuario(usuario);
  if (papel === 'anonimo') {
    return { permitida: false, status: 401, papel, motivo: 'Não autenticado.', bloqueios: [], avisos: [] };
  }

  const etapaAtual = normalizarEtapa(operacao.etapa);
  const transicao = TRANSICOES.find((t) => t.acao === acao && t.de === etapaAtual);
  if (!transicao) {
    const alvo = ACOES.AVANCAR === acao ? 'avançar' : `executar "${acao}"`;
    return {
      permitida: false,
      status: 409,
      papel,
      etapaAtual,
      motivo: `Não é possível ${alvo} uma operação em "${etapaAtual}".`,
      bloqueios: [],
      avisos: [],
    };
  }

  if (papel === 'desconhecido' || papel === 'sem_permissao') {
    return {
      permitida: false,
      status: 403,
      papel,
      etapaAtual,
      motivo: 'Página de Operações não liberada para este usuário.',
      bloqueios: [],
      avisos: [],
    };
  }
  if (transicao.perfil === ADMIN && papel !== ADMIN) {
    return {
      permitida: false,
      status: 403,
      papel,
      etapaAtual,
      exige_admin: true,
      motivo: 'Esta transição exige administrador.',
      bloqueios: [],
      avisos: [],
    };
  }

  const efeitos = efeitosFinanceiros(operacao, titulos);
  const exigeSemEfeito = [ACOES.REJEITAR, ACOES.REABRIR, ACOES.VOLTAR_RASCUNHO].includes(acao);
  if (exigeSemEfeito && efeitos.algum) {
    return {
      permitida: false,
      status: 409,
      papel,
      etapaAtual,
      motivo: `Transição bloqueada: ${descreverEfeitos(efeitos).join('; ')}. Encaminhe para regularização específica.`,
      bloqueios: descreverEfeitos(efeitos),
      avisos: [],
    };
  }

  if (acao === ACOES.REJEITAR && String(motivo).trim().length < MOTIVO_MINIMO) {
    return {
      permitida: false,
      status: 400,
      papel,
      etapaAtual,
      motivo: `Informe o motivo da rejeição (mínimo de ${MOTIVO_MINIMO} caracteres).`,
      bloqueios: [],
      avisos: [],
    };
  }

  let bloqueios = [];
  let avisos = [];
  if (acao === ACOES.AVANCAR) {
    const p = pendenciasDeAvanco(etapaAtual, operacao, titulos, contexto);
    bloqueios = p.bloqueios;
    avisos = p.avisos;
  }
  if (bloqueios.length > 0) {
    return { permitida: false, status: 409, papel, etapaAtual, motivo: bloqueios[0], bloqueios, avisos };
  }

  return {
    permitida: true,
    papel,
    etapaAtual,
    destino: transicao.para,
    avisos,
    bloqueios: [],
    cancelar: acao === ACOES.REJEITAR ? titulosParaCancelar(titulos) : [],
    restaurar: acao === ACOES.REABRIR ? titulosParaRestaurar(titulos) : [],
    motivo: String(motivo || '').trim(),
  };
}

/** Ações que a interface deve oferecer para a etapa e o papel atuais. */
export function acoesDisponiveis(operacao = {}, usuario = null) {
  const etapa = normalizarEtapa(operacao.etapa);
  const papel = papelDoUsuario(usuario);
  const disponiveis = [];
  if (getNextStage(etapa)) disponiveis.push(ACOES.AVANCAR);
  if (etapa !== 'finalizada' && etapa !== 'rejeitada' && etapa !== 'desconhecida') disponiveis.push(ACOES.REJEITAR);
  if (etapa === 'rejeitada') disponiveis.push(ACOES.REABRIR);
  if (etapa !== 'rascunho' && etapa !== 'rejeitada' && etapa !== 'finalizada' && etapa !== 'desconhecida') {
    disponiveis.push(ACOES.VOLTAR_RASCUNHO);
  }
  return disponiveis.filter((acao) => {
    const t = TRANSICOES.find((x) => x.acao === acao && x.de === etapa);
    if (!t) return false;
    if (t.perfil === ADMIN) return papel === ADMIN;
    return papel === ADMIN || papel === OPERACIONAL;
  });
}