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

/**
 * Ação de EFEITO (não de etapa): registrar o repasse ao cedente.
 *
 * Não entra em `TRANSICOES` porque NÃO troca a etapa — ela acontece DENTRO de
 * "pagamento" e é a prova que libera a passagem para "finalizada". O dinheiro é
 * debitado da conta da PSX pelo núcleo `disbursement.js`; aqui só se decide
 * QUEM pode e QUANDO pode.
 */
export const ACAO_REPASSE = 'repasse';

const OPERACIONAL = 'operacional';
const ADMIN = 'admin';

/**
 * Tabela declarativa de transições: a ÚNICA fonte de verdade do fluxo.
 * `perfil` é o mínimo exigido; o servidor sempre confere antes de aplicar.
 */
export const TRANSICOES = Object.freeze([
  { acao: ACOES.AVANCAR, de: 'rascunho', para: 'analise_credito', perfil: OPERACIONAL },
  { acao: ACOES.AVANCAR, de: 'analise_credito', para: 'confirmacao_titulos', perfil: OPERACIONAL },
  { acao: ACOES.AVANCAR, de: 'confirmacao_titulos', para: 'formalizacao', perfil: OPERACIONAL },
  { acao: ACOES.AVANCAR, de: 'formalizacao', para: 'assinatura', perfil: OPERACIONAL },
  { acao: ACOES.AVANCAR, de: 'assinatura', para: 'pagamento', perfil: OPERACIONAL },
  { acao: ACOES.AVANCAR, de: 'pagamento', para: 'finalizada', perfil: OPERACIONAL },
  { acao: ACOES.REJEITAR, de: 'rascunho', para: 'rejeitada', perfil: OPERACIONAL },
  { acao: ACOES.REJEITAR, de: 'analise_credito', para: 'rejeitada', perfil: OPERACIONAL },
  { acao: ACOES.REJEITAR, de: 'confirmacao_titulos', para: 'rejeitada', perfil: OPERACIONAL },
  { acao: ACOES.REJEITAR, de: 'formalizacao', para: 'rejeitada', perfil: OPERACIONAL },
  { acao: ACOES.REJEITAR, de: 'assinatura', para: 'rejeitada', perfil: OPERACIONAL },
  { acao: ACOES.REJEITAR, de: 'pagamento', para: 'rejeitada', perfil: OPERACIONAL },
  { acao: ACOES.REABRIR, de: 'rejeitada', para: 'rascunho', perfil: OPERACIONAL },
  { acao: ACOES.VOLTAR_RASCUNHO, de: 'analise_credito', para: 'rascunho', perfil: ADMIN },
  { acao: ACOES.VOLTAR_RASCUNHO, de: 'confirmacao_titulos', para: 'rascunho', perfil: ADMIN },
  { acao: ACOES.VOLTAR_RASCUNHO, de: 'formalizacao', para: 'rascunho', perfil: ADMIN },
  { acao: ACOES.VOLTAR_RASCUNHO, de: 'assinatura', para: 'rascunho', perfil: ADMIN },
  { acao: ACOES.VOLTAR_RASCUNHO, de: 'pagamento', para: 'rascunho', perfil: ADMIN },
]);

export const MOTIVO_MINIMO = 5;

/** Etapa efetiva: registros antigos sem `etapa` são operações em rascunho (M4). */
export function normalizarEtapa(etapa) {
  if (!etapa) return 'rascunho';
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
  const ehAssinatura = tipo === 'assinatura';
  const somaTitulos = (titulos || []).reduce((s, t) => s + valorDoTitulo(t), 0);

  if (etapaAtual === 'rascunho') {
    if (ehAssinatura) {
      // Assinatura não nasce de título: nasce de valor antecipado ao cedente.
      if (!(numero(operacao.valor_antecipacao) > 0)) {
        bloqueios.push('Informe o valor da antecipação da assinatura antes de avançar.');
      }
    } else if (!(titulos || []).some((t) => valorDoTitulo(t) > 0)) {
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
    }
  }

  if (etapaAtual === 'confirmacao_titulos') {
    if (ehAssinatura) {
      // ── CAMINHO PRÓPRIO DA ASSINATURA (recorrência) ──────────────────────
      // Comprovado pelo modelo atual, não presumido: o wizard de assinatura
      // (`OperacaoForm.saveAssinatura`) grava `installment_schedule: []`, não
      // cria nenhum `Cheque` e só deixa salvar com `valor_antecipacao > 0` e
      // pelo menos um assinante. A receita vem dos ciclos do Asaas
      // (`AssinaturaVinculo`), não de títulos. Exigir título e agenda aqui
      // travava TODA assinatura nesta etapa. O que a etapa exige delas é o que
      // o próprio modelo promete: antecipação definida e assinante vinculado.
      if (!(numero(operacao.valor_antecipacao) > 0)) {
        bloqueios.push('Informe o valor da antecipação da assinatura antes de formalizar.');
      }
      if (!contexto.temVinculoAssinatura && !operacao.asaas_subscription_id) {
        bloqueios.push('Cadastre ao menos um assinante (vínculo de assinatura) antes de formalizar.');
      }
    } else {
      const naoPendentes = (titulos || []).filter((t) => t.status !== 'pendente');
      if (naoPendentes.length > 0) {
        bloqueios.push(`${naoPendentes.length} título(s) não estão pendentes; regularize antes de formalizar.`);
      }
      if (!(titulos || []).length || somaTitulos <= 0) {
        bloqueios.push('A operação precisa de títulos válidos para ser formalizada.');
      }
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
    // M5.1 — FECHAMENTO EXIGE O REPASSE EXECUTADO, EM TODAS AS MODALIDADES.
    // `pagamento` é a etapa em que o valor sai da conta da PSX para o cedente
    // (executeOperationDisbursement debita o banco, lança o caixa e grava
    // payment_executed). `finalizada` é a conclusão dessa entrega.
    // A cobrança/assinatura Asaas é a ORIGEM da receita futura do sacado, não
    // prova de repasse — inclusive na assinatura, cujo wizard só valida com
    // valor_antecipacao > 0, ou seja, há antecipação a repassar.
    if (operacao.payment_executed !== true) {
      bloqueios.push('O repasse ao cedente ainda não foi executado.');
    }
    if (tipo === 'assinatura' && !operacao.asaas_subscription_id && !contexto.temVinculoAssinatura) {
      avisos.push('A cobrança da assinatura ainda não foi emitida (isso não substitui o repasse ao cedente).');
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

/**
 * REPASSE AO CEDENTE — autorização e pré-requisitos (efeito, não etapa).
 *
 * A decisão é desta função e roda no SERVIDOR dentro da execução do repasse
 * (`executeOperationDisbursement`); a tela usa a MESMA função só para decidir se
 * mostra o formulário. Exige a etapa "pagamento" porque é nela que o dinheiro
 * sai, e o contrato assinado quando a modalidade pede contrato — é o que
 * recusa repasse de operação sem assinatura.
 *
 * `payment_executed` NÃO é bloqueio aqui: quem responde a uma repetição é a
 * execução (idempotente), para que um retry após resposta perdida devolva o
 * mesmo resultado em vez de um erro.
 */
export function avaliarRepasse({ operacao = {}, usuario = null } = {}) {
  const papel = papelDoUsuario(usuario);
  if (papel === 'anonimo') {
    return { permitida: false, status: 401, papel, motivo: 'Não autenticado.', bloqueios: [] };
  }
  if (papel === 'desconhecido' || papel === 'sem_permissao') {
    return {
      permitida: false,
      status: 403,
      papel,
      motivo: 'Página de Operações não liberada para este usuário.',
      bloqueios: [],
    };
  }

  const etapaAtual = normalizarEtapa(operacao.etapa);
  if (etapaAtual !== 'pagamento') {
    return {
      permitida: false,
      status: 409,
      papel,
      etapaAtual,
      motivo: `O repasse ao cedente só pode ser registrado na etapa "pagamento" (a operação está em "${etapaAtual}").`,
      bloqueios: [],
    };
  }

  const bloqueios = [];
  if (operacao.needs_contract === true && operacao.contract_signed_confirmed !== true) {
    bloqueios.push('Confirme o contrato assinado antes de registrar o repasse.');
  }
  const valor = numero(operacao.net_value === undefined || operacao.net_value === null
    ? operacao.gross_value
    : operacao.net_value);
  if (!(valor > 0)) {
    bloqueios.push('Operação sem valor líquido para repasse.');
  }
  if (bloqueios.length > 0) {
    return { permitida: false, status: 409, papel, etapaAtual, motivo: bloqueios[0], bloqueios };
  }

  return { permitida: true, papel, etapaAtual, valor, bloqueios: [], motivo: '' };
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