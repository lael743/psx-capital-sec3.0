/**
 * M6.2.2 — CONTAS A RECEBER · SERVIÇO ÚNICO DE CONSULTA (SOMENTE LEITURA).
 *
 * Reúne `Cheque`, `Operation.installment_schedule`, `Operation`, `Payment`,
 * `AsaasEvento`, `Banco` e os lançamentos de caixa e devolve LINHAS
 * NORMALIZADAS de títulos. Nenhuma função deste módulo escreve: não há create,
 * update, delete, nem chamada a função de backend.
 *
 * ── COMPROVAÇÃO DE RECEBIMENTO (M6.2.2 / P0) ────────────────────────────────
 *
 * Nenhum sinal isolado comprova dinheiro recebido:
 *   · `status === 'compensado'` não comprova — o título pode ter sido marcado
 *     sem que o crédito exista na conta.
 *   · `compensation_token` não comprova — é apenas a identidade do evento.
 *   · `resolucao_evento` não comprova — é a identidade da resolução.
 *
 * A prova é a da própria fonte de verdade: `chequeEventFlow.inspecionarCheque` e
 * `chequeEventFlow.inspecionarResolucao` são executados com um I/O
 * ESTRITAMENTE DE LEITURA montado sobre os dados já carregados. Elas exigem,
 * no mesmo evento, a chave em `Banco.applied_ledger_keys` E o lançamento de
 * caixa com a mesma origem. Só então o título é "Recebido".
 *
 * A ausência da chave bancária NUNCA é descrita como prova de que o dinheiro
 * não entrou: sem prova completa o estado é "A confirmar".
 *
 * ── IDENTIDADE E DEDUPLICAÇÃO ───────────────────────────────────────────────
 *
 * A) COMPROVADO — `installment.settled_by === cheque.id`, com o título
 *    existente, compensado e sem evidência de estorno.
 * B) IDENTIFICADOR — `TIT-n` casa com a parcela `titulo-n`/número n SOMENTE se
 *    houver candidata única E valor E vencimento compatíveis. Sem isso, os
 *    registros continuam separados.
 * C) POSSÍVEL — valor igual entre registros livres é apenas INDÍCIO: as linhas
 *    NUNCA são fundidas. Cada registro original permanece visível.
 *
 * ── RECEBIMENTOS AGREGADOS ──────────────────────────────────────────────────
 *
 * `Payment` e `AsaasEvento` comprovam recebimento da OPERAÇÃO, não de um
 * título. Eles nunca são alocados a parcelas por valor, data ou ordem. Quando
 * existe recebimento agregado e a parcela não tem vínculo individual, o estado
 * é "A confirmar" (conciliação pendente) em vez de "Vencido".
 */

import { inspecionarCheque, inspecionarResolucao } from './chequeEventFlow.js';

export const SITUACAO = {
  A_VENCER: 'a_vencer',
  VENCIDO: 'vencido',
  A_CONFIRMAR: 'a_confirmar',
  RECEBIDO: 'recebido',
  CANCELADO: 'cancelado',
  DEVOLVIDO: 'devolvido',
  RESOLVIDO: 'resolvido',
  EM_COBRANCA: 'em_cobranca',
  INCONSISTENTE: 'inconsistente',
};

export const SITUACAO_LABEL = {
  a_vencer: 'A vencer',
  vencido: 'Vencido',
  a_confirmar: 'A confirmar',
  recebido: 'Recebido',
  cancelado: 'Cancelado',
  devolvido: 'Devolvido',
  resolvido: 'Resolvido',
  em_cobranca: 'Em cobrança',
  inconsistente: 'Inconsistente',
};

export const ORIGEM_LABEL = {
  cheque: 'Título',
  agenda: 'Agenda (parcela)',
};

export const VINCULO_LABEL = {
  comprovado: 'agenda quitada (comprovado)',
  identificador: 'identificador validado',
  possivel: 'possível correspondência (não vinculada)',
};

/** Grau de vínculo entre o título e a agenda — exibido na coluna Origem. */
export const GRAU_LABEL = {
  comprovado: 'comprovado',
  identificador: 'identificador validado',
  possivel: 'possível correspondência',
  sem_vinculo: 'sem vínculo',
};

const COBRANCA_ABERTA = ['pending', 'overdue', 'PENDING', 'OVERDUE'];
const COBRANCA_LABEL = {
  pending: 'Pendente',
  overdue: 'Vencida',
  confirmed: 'Confirmada',
  received: 'Recebida',
  refunded: 'Estornada',
  deleted: 'Cancelada',
};

const round2 = (valor) => Math.round((Number(valor) + Number.EPSILON) * 100) / 100;

/** Data local (America/Cuiaba) em YYYY-MM-DD — evita o deslocamento do UTC. */
export function hojeLocalISO(agora = new Date()) {
  const ano = agora.getFullYear();
  const mes = String(agora.getMonth() + 1).padStart(2, '0');
  const dia = String(agora.getDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
}

/** Normaliza para YYYY-MM-DD. Devolve null quando não há data válida. */
export function normalizarData(valor) {
  if (!valor) return null;
  const partes = String(valor).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!partes) return null;
  return `${partes[1]}-${partes[2]}-${partes[3]}`;
}

/** Valor de FACE do título. Ausente/zero continua ausente: nunca vira 0. */
export function valorDeFace(titulo) {
  if (!titulo) return null;
  const bruto = titulo.valor_face ?? titulo.value;
  const numero = Number(bruto);
  return Number.isFinite(numero) && numero > 0 ? round2(numero) : null;
}

function valorDaParcela(inst) {
  const numero = Number(inst?.value);
  return Number.isFinite(numero) && numero > 0 ? round2(numero) : null;
}

/** Identidade da parcela — mesma regra do núcleo (`inst.id` ou chave derivada). */
export function chaveDaParcela(parcela) {
  if (parcela && parcela.id) return String(parcela.id);
  const numero = parcela?.number ?? parcela?.installment_number ?? parcela?.numero ?? '';
  return `legacy:${parcela?.due_date || ''}|${parcela?.value ?? ''}|${numero}`;
}

/** Índice embutido no número gerado pelo app (`TIT-3` → 3). */
export function numeroGerado(checkNumber) {
  const achado = String(checkNumber || '').trim().match(/^TIT-(\d+)$/i);
  return achado ? Number(achado[1]) : null;
}

export function rotuloCobranca(status) {
  if (!status) return 'Sem cobrança';
  return COBRANCA_LABEL[status] || status;
}

export function cobrancaAberta(status) {
  return COBRANCA_ABERTA.includes(status);
}

function cobrancaDaParcela(parcela, operacao) {
  const status = parcela?.asaas_payment_status || null;
  const id = parcela?.asaas_payment_id || null;
  if (status || id) {
    return {
      id,
      status: status || 'sem_status',
      origem: 'parcela',
      url: parcela?.asaas_invoice_url || null,
    };
  }
  const unica = Number(operacao?.installments || 0) <= 1;
  if (unica && (operacao?.asaas_payment_status || operacao?.asaas_payment_id)) {
    return {
      id: operacao.asaas_payment_id || null,
      status: operacao.asaas_payment_status || 'sem_status',
      origem: 'operacao',
      url: operacao.asaas_invoice_url || null,
    };
  }
  return null;
}

/* ────────────────────────────────────────────────────────────────────────────
 * EVIDÊNCIA DE RECEBIMENTO — executa o núcleo com I/O de LEITURA
 * ──────────────────────────────────────────────────────────────────────────── */

const SOMENTE_LEITURA = async () => {
  throw new Error('[contasReceber] I/O somente leitura: nenhuma escrita é permitida.');
};

/**
 * I/O de leitura sobre os dados já carregados. As quatro funções de escrita
 * exigidas pelo contrato de resolução existem apenas para satisfazê-lo — os
 * inspetores não as chamam, e se chamassem receberiam erro.
 */
function criarIoLeitura({ cheques = [], bancos = [], cashflows = [], operations = [] } = {}) {
  const mapaCheques = new Map(cheques.map((c) => [String(c.id), c]));
  const mapaBancos = new Map(bancos.map((b) => [String(b.id), b]));
  const mapaOperacoes = new Map(operations.map((o) => [String(o.id), o]));
  const lancamentos = Array.isArray(cashflows) ? cashflows : [];

  return {
    chequeStore: { read: async (id) => mapaCheques.get(String(id)) || null },
    bancoStore: { get: async (id) => (id ? mapaBancos.get(String(id)) || null : null) },
    lerLancamentos: async (filtro = {}) =>
      lancamentos.filter(
        (cf) =>
          (!filtro.source_type || cf.source_type === filtro.source_type) &&
          (!filtro.source_id || cf.source_id === filtro.source_id),
      ),
    lerCheques: async (filtro = {}) =>
      cheques.filter((c) =>
        Object.entries(filtro || {}).every(([campo, valor]) => (c[campo] ?? null) === valor),
      ),
    getOperacao: async (id) => mapaOperacoes.get(String(id)) || null,
    ajustarTotalReceivable: SOMENTE_LEITURA,
    registrarRecebimento: SOMENTE_LEITURA,
    marcarTaxaRecebida: SOMENTE_LEITURA,
    criarCheque: SOMENTE_LEITURA,
  };
}

/**
 * Roda os inspetores do núcleo para cada cheque que declara evento financeiro.
 * Não escreve nada. Devolve `{ [chequeId]: evidencia }`.
 */
export async function avaliarEvidencias(dados = {}) {
  const { cheques = [], bancos = [], cashflows = [], operations = [] } = dados;
  const io = criarIoLeitura({ cheques, bancos, cashflows, operations });
  const mapaBancos = new Set((bancos || []).map((b) => String(b.id)));
  const estornos = new Set(
    (cashflows || [])
      .filter((cf) => cf.source_type === 'cheque_estorno_compensacao' && cf.source_id)
      .map((cf) => String(cf.source_id).split('#')[0]),
  );

  const evidencias = {};
  for (const cheque of cheques || []) {
    const status = String(cheque.status || '').toLowerCase();
    const compensado = status === 'compensado';
    const resolvido = status.startsWith('resolvido_');
    if (!compensado && !resolvido) continue;

    const contaCompensacao = cheque.deposited_bank_id || '';
    const contaResolucao = cheque.resolucao_bank_id || cheque.deposited_bank_id || '';

    if (compensado) {
      const diag = await inspecionarCheque({ cheque: cheque.id, io });
      evidencias[cheque.id] = {
        tipo: 'compensacao',
        estado: diag.estado,
        saldo_aplicado: diag.saldo_aplicado === true,
        lancamento_existe: diag.lancamento_existe === true,
        chave: diag.credito_key || null,
        token_proprio: diag.token_proprio === true,
        conta_id: contaCompensacao || null,
        conta_conferida: Boolean(contaCompensacao) && mapaBancos.has(String(contaCompensacao)),
        estorno: estornos.has(String(cheque.id)),
      };
      continue;
    }

    const diag = await inspecionarResolucao({ cheque: cheque.id, io });
    evidencias[cheque.id] = {
      tipo: 'resolucao',
      estado: diag.estado,
      saldo_aplicado: diag.saldo_aplicado === true,
      lancamento_existe: diag.lancamento_existe === true,
      chave: diag.chave_resolucao || null,
      substituto_id: diag.substituto_id || null,
      conta_id: contaResolucao || null,
      conta_conferida: Boolean(contaResolucao) && mapaBancos.has(String(contaResolucao)),
    };
  }
  return evidencias;
}

/** Texto curto da evidência — vai para a coluna Origem. */
function rotuloEvidencia(evidencia) {
  if (!evidencia) return 'evidência não conferida nesta consulta';
  const { tipo, estado } = evidencia;
  if (tipo === 'compensacao') {
    if (estado === 'completo') return 'crédito na conta + lançamento de caixa';
    if (estado === 'lancamento_sem_saldo') return 'lançamento de caixa sem crédito na conta';
    if (estado === 'saldo_sem_lancamento') return 'crédito na conta sem lançamento de caixa';
    if (estado === 'nada_aplicado') return 'sem crédito e sem lançamento';
    return 'evidência não conferida';
  }
  if (tipo === 'resolucao') {
    if (estado === 'completo') return 'resolução com crédito e lançamento confirmados';
    if (estado === 'substituto_ausente') return 'resolução sem título substituto localizado';
    if (estado === 'lancamento_sem_saldo') return 'lançamento de caixa sem crédito na conta';
    if (estado === 'saldo_sem_lancamento') return 'crédito na conta sem lançamento de caixa';
    if (estado === 'nada_aplicado') return 'sem crédito e sem lançamento';
    return 'evidência não conferida';
  }
  return 'evidência não conferida';
}

/* ────────────────────────────────────────────────────────────────────────────
 * CLASSIFICAÇÃO
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Função pura de classificação.
 *
 * `bloqueios` são contradições (viram "Inconsistente"). `alertas` são apenas
 * sinalizações e NÃO mudam a situação.
 */
export function classificarTitulo(titulo, hoje = hojeLocalISO()) {
  const bloqueios = Array.isArray(titulo.bloqueios) ? titulo.bloqueios : [];
  const alertas = Array.isArray(titulo.alertas) ? titulo.alertas : [];
  const comum = {
    motivos: [...bloqueios, ...alertas],
    bloqueios,
    alertas,
    inconsistente: bloqueios.length > 0,
    com_alerta: alertas.length > 0,
  };

  if (bloqueios.length > 0) {
    return { ...comum, situacao: SITUACAO.INCONSISTENTE, label: SITUACAO_LABEL.inconsistente };
  }

  const status = String(titulo.status || '').toLowerCase();
  const concluir = (situacao) => ({ ...comum, situacao, label: SITUACAO_LABEL[situacao] });

  if (status === 'cancelado') return concluir(SITUACAO.CANCELADO);
  if (status === 'devolvido') return concluir(SITUACAO.DEVOLVIDO);
  if (status.startsWith('resolvido_')) {
    return concluir(titulo.resolucao_estado === 'inconclusivo' ? SITUACAO.A_CONFIRMAR : SITUACAO.RESOLVIDO);
  }
  if (titulo.recebimento_estado === 'comprovado') return concluir(SITUACAO.RECEBIDO);
  if (titulo.recebimento_estado === 'a_confirmar') return concluir(SITUACAO.A_CONFIRMAR);
  if (cobrancaAberta(titulo.cobranca_status)) return concluir(SITUACAO.EM_COBRANCA);
  if (!titulo.vencimento) return concluir(SITUACAO.INCONSISTENTE);

  if (titulo.vencimento < hoje) {
    // Recebimento agregado da operação sem vínculo com esta parcela: não é
    // vencido nem recebido — é conciliação pendente.
    if (titulo.evidencia_agregada) return concluir(SITUACAO.A_CONFIRMAR);
    return concluir(SITUACAO.VENCIDO);
  }
  return concluir(SITUACAO.A_VENCER);
}

function contar(valor) {
  return Array.isArray(valor) ? valor.length : 0;
}

function montarLinhaCheque({ cheque, operacao, vinculo, alertas, bloqueios, recebimentos, evidencia, temSubstituto }) {
  const status = String(cheque.status || '').toLowerCase();
  const vencimento = normalizarData(cheque.compensation_date);
  const valor = valorDeFace(cheque);
  const parcela = vinculo?.parcela?.inst || null;
  const cobranca = parcela ? cobrancaDaParcela(parcela, operacao) : null;

  const travas = [...(bloqueios || [])];
  const avisos = [...(alertas || [])];

  if (!operacao) travas.push('Título sem operação vinculada');
  if (!vencimento) travas.push('Vencimento ausente ou inválido');
  if (valor === null) avisos.push('Valor de face ausente');
  if (!cheque.tipo) avisos.push('Tipo do título ausente');

  let recebimentoEstado = 'ausente';
  let resolucaoEstado = null;
  let recebimentoComprovado = false;
  // A chave da resolução é independente do status: um título devolvido que já
  // tem resolução registrada é contraditório em qualquer etapa.
  const resolucaoComprovada = Boolean(cheque.resolucao_evento);

  if (status === 'compensado') {
    const temIdentidade = Boolean(cheque.compensation_token) || Boolean(cheque.compensated_at);
    if (!temIdentidade) {
      travas.push(
        'Compensado sem prova de crédito: identidade do evento ausente (token e data de compensação)',
      );
    } else if (!evidencia) {
      avisos.push('Compensação declarada, mas a evidência financeira não foi conferida nesta consulta');
      recebimentoEstado = 'a_confirmar';
    } else if (evidencia.estado === 'completo') {
      recebimentoComprovado = true;
      recebimentoEstado = 'comprovado';
    } else {
      recebimentoEstado = 'a_confirmar';
      if (evidencia.estorno) {
        travas.push('Compensação com estorno registrado — recebimento não confirmado');
      }
      if (evidencia.estado === 'lancamento_sem_saldo') {
        avisos.push('Lançamento de caixa existe, mas a chave do crédito não consta na conta');
      } else if (evidencia.estado === 'saldo_sem_lancamento') {
        avisos.push('Crédito na conta existe, mas o lançamento de caixa não foi localizado');
      } else if (evidencia.estado === 'nada_aplicado' && !evidencia.conta_conferida) {
        avisos.push('Conta bancária da compensação não conferida — crédito não verificável');
      } else if (evidencia.estado === 'nada_aplicado') {
        avisos.push('Nenhum efeito financeiro localizado para a compensação declaada');
      }
      if (!evidencia.token_proprio && evidencia.estado !== 'completo') {
        avisos.push('Compensação legada (sem token próprio): identidade do evento é a data');
      }
    }
  }

  if (status.startsWith('resolvido_')) {
    const estado = evidencia?.estado || null;
    if (status === 'resolvido_pago') {
      if (!evidencia) {
        resolucaoEstado = 'inconclusivo';
        avisos.push('Resolução de pagamento sem evidência financeira conferida');
      } else if (estado === 'completo') {
        resolucaoEstado = 'completo';
        recebimentoComprovado = true;
        recebimentoEstado = 'comprovado';
      } else {
        resolucaoEstado = 'inconclusivo';
        avisos.push('Resolução de pagamento sem crédito e lançamento confirmados');
      }
    } else if (status === 'resolvido_substituido') {
      resolucaoEstado = 'completo';
      if (!evidencia?.substituto_id && !temSubstituto) {
        avisos.push('Resolução por substituição sem título substituto localizado');
      }
    } else {
      resolucaoEstado = 'completo';
      const face = Number(cheque.valor_face);
      const bruto = Number(cheque.value);
      if (Number.isFinite(face) && Number.isFinite(bruto) && round2(face) !== round2(bruto)) {
        avisos.push('Prorrogação legada: valor do título difere do valor de face');
      }
    }
    if (!resolucaoComprovada) {
      avisos.push('Resolução legada sem chave de evento — efeito financeiro não conferível');
    }
  }

  if (status === 'devolvido' && resolucaoComprovada) {
    travas.push('Devolvido com resolução registrada — estado contraditório');
  }
  if (operacao?.status === 'quitado' && recebimentoEstado !== 'comprovado') {
    avisos.push('Operação quitada sem evidência individual de recebimento deste título');
  }

  return {
    id: `cheque:${cheque.id}`,
    origem: 'cheque',
    origem_label: ORIGEM_LABEL.cheque,
    registro_id: cheque.id,
    identidade: cheque.check_number || cheque.id,
    numero: cheque.check_number || null,
    tipo: cheque.tipo || null,
    status_registro: status || null,
    operacao_id: operacao?.id || null,
    operacao_numero: operacao?.numero_operacao ?? null,
    operacao_etapa: operacao?.etapa || null,
    operacao_status: operacao?.status || null,
    cliente_id: cheque.client_id || operacao?.client_id || null,
    cliente_nome: cheque.client_name || operacao?.client_name || null,
    sacado_nome: cheque.sacado_name || operacao?.sacado_name || null,
    vencimento,
    valor_face: valor,
    cobranca,
    recebimento_estado: recebimentoEstado,
    recebimento_comprovado: recebimentoComprovado,
    resolucao_estado: resolucaoEstado,
    resolucao_comprovada: resolucaoComprovada,
    evidencia_label: rotuloEvidencia(evidencia),
    vinculo: vinculo?.tipo || null,
    grau_vinculo: vinculo?.tipo || 'sem_vinculo',
    agenda_ref: vinculo?.parcela
      ? { chave: vinculo.parcela.key || null, numero: vinculo.parcela.inst?.number ?? null }
      : null,
    saldo_operacao:
      operacao && Number.isFinite(Number(operacao.balance_due)) ? round2(operacao.balance_due) : null,
    recebimentos_operacao: recebimentos || null,
    bloqueios: travas,
    alertas: avisos,
  };
}

function montarLinhaParcela({ operacao, parcela, alertas, bloqueios, recebimentos, evidenciaAgregada }) {
  const inst = parcela.inst;
  const vencimento = normalizarData(inst.due_date);
  const valor = valorDaParcela(inst);
  const quitada = inst.paid === true;
  const vinculoQuitacao = inst.settled_by || null;
  const recebimentoComprovado = quitada && Boolean(parcela.vinculoComprovado);

  const travas = [...(bloqueios || [])];
  const avisos = [...(alertas || [])];

  if (!operacao) travas.push('Parcela sem operação localizada');
  if (!vencimento) travas.push('Vencimento da parcela ausente ou inválido');
  if (valor === null) avisos.push('Valor da parcela ausente');
  if (!inst.id) avisos.push('Parcela sem identidade própria (id ausente)');
  if (quitada && !vinculoQuitacao) {
    travas.push('Parcela marcada como paga sem vínculo com recebimento comprovado');
  }
  if (quitada && vinculoQuitacao && !parcela.vinculoComprovado) {
    avisos.push('Parcela marcada como paga: vínculo de quitação não confirmado');
  }
  if (evidenciaAgregada && !recebimentoComprovado) {
    avisos.push('Operação com recebimento agregado (canal não identifica a parcela) — conciliação pendente');
  }
  if (operacao?.status === 'quitado' && !recebimentoComprovado) {
    avisos.push('Operação quitada sem evidência individual de recebimento desta parcela');
  }

  return {
    id: `agenda:${operacao?.id || 'sem-op'}:${parcela.key}`,
    origem: 'agenda',
    origem_label: ORIGEM_LABEL.agenda,
    registro_id: inst.id || null,
    identidade: parcela.chave,
    numero: inst.number ?? null,
    tipo: operacao?.type || null,
    status_registro: inst.status || null,
    operacao_id: operacao?.id || null,
    operacao_numero: operacao?.numero_operacao ?? null,
    operacao_etapa: operacao?.etapa || null,
    operacao_status: operacao?.status || null,
    cliente_id: operacao?.client_id || null,
    cliente_nome: operacao?.client_name || null,
    sacado_nome: operacao?.sacado_name || null,
    vencimento,
    valor_face: valor,
    cobranca: cobrancaDaParcela(inst, operacao),
    recebimento_estado: recebimentoComprovado
      ? 'comprovado'
      : quitada || vinculoQuitacao
        ? 'a_confirmar'
        : 'ausente',
    evidencia_agregada: Boolean(evidenciaAgregada) && !recebimentoComprovado,
    recebimento_comprovado: recebimentoComprovado,
    resolucao_estado: null,
    resolucao_comprovada: false,
    evidencia_label: recebimentoComprovado
      ? 'quitação com título identificado'
      : evidenciaAgregada
        ? 'recebimento agregado sem alocação individual'
        : 'sem evidência individual',
    vinculo: parcela.vinculoPossivel ? 'possivel' : null,
    grau_vinculo: recebimentoComprovado ? 'comprovado' : parcela.vinculoPossivel ? 'possivel' : 'sem_vinculo',
    agenda_ref: null,
    saldo_operacao:
      operacao && Number.isFinite(Number(operacao.balance_due)) ? round2(operacao.balance_due) : null,
    recebimentos_operacao: recebimentos || null,
    bloqueios: travas,
    alertas: avisos,
  };
}

/* ────────────────────────────────────────────────────────────────────────────
 * VÍNCULOS
 * ──────────────────────────────────────────────────────────────────────────── */

function processarOperacao(operacao, cheques, contexto) {
  const { pagamentos, asaas, evidencias, completude, hoje } = contexto;
  const linhas = [];
  const brutas = (Array.isArray(operacao?.installment_schedule) ? operacao.installment_schedule : []).map(
    (inst, indice) => ({ inst, indice, chave: chaveDaParcela(inst) }),
  );

  const repetidas = new Map();
  const parcelas = brutas.map((parcela) => {
    const ocorrencias = (repetidas.get(parcela.chave) || 0) + 1;
    repetidas.set(parcela.chave, ocorrencias);
    return { ...parcela, key: ocorrencias === 1 ? parcela.chave : `${parcela.chave}#${ocorrencias}` };
  });

  const vinculoPorCheque = new Map();
  const vinculadas = new Set();
  const alertas = new Map();
  const bloqueios = new Map();
  const possiveis = new Set();
  const idCheque = (cheque) => `cheque:${cheque.id}`;
  const idParcela = (parcela) => `agenda:${operacao?.id || 'sem-op'}:${parcela.key}`;
  const registrar = (mapa, chave, motivo) => {
    const atuais = mapa.get(chave) || [];
    atuais.push(motivo);
    mapa.set(chave, atuais);
  };
  const consultaCompleta = completude?.confiavel !== false;

  // A) vínculo COMPROVADO: a agenda registra qual título a quitou.
  for (const parcela of parcelas) {
    const settledBy = parcela.inst.settled_by;
    if (!settledBy) continue;
    if (parcela.inst.paid === false) {
      registrar(alertas, idParcela(parcela), 'Parcela com vínculo de quitação, mas marcada como não paga');
    }
    const cheque = cheques.find((c) => c.id === settledBy);
    if (!cheque) {
      if (consultaCompleta) {
        registrar(bloqueios, idParcela(parcela), 'A parcela indica quitação por um título inexistente');
      } else {
        registrar(
          alertas,
          idParcela(parcela),
          'A parcela indica quitação por título que não veio na consulta — conciliação pendente',
        );
        parcela.vinculoPossivel = true;
      }
      continue;
    }
    if (vinculoPorCheque.has(settledBy)) {
      registrar(bloqueios, idCheque(cheque), 'Mais de uma parcela aponta para este mesmo título');
      continue;
    }
    const statusTitulo = String(cheque.status || '').toLowerCase();
    const evidencia = evidencias?.[cheque.id] || null;
    if (statusTitulo !== 'compensado') {
      // Contradição: a parcela continua visível com o bloqueio, sem fundir.
      registrar(bloqueios, idParcela(parcela), 'Parcela quitada por título que não está compensado');
      continue;
    }
    if (evidencia?.estorno) {
      registrar(bloqueios, idParcela(parcela), 'Parcela quitada por compensação já estornada');
      continue;
    }
    parcela.vinculoComprovado = true;
    vinculoPorCheque.set(settledBy, { tipo: 'comprovado', parcela });
    vinculadas.add(parcela.key);

    const vencCheque = normalizarData(cheque.compensation_date);
    const vencParcela = normalizarData(parcela.inst.due_date);
    if (vencCheque && vencParcela && vencCheque !== vencParcela) {
      registrar(alertas, idCheque(cheque), 'Vencimento do título difere do registrado na agenda da operação');
    }
  }

  // B) vínculo por IDENTIFICADOR: exige operação, unicidade, valor e vencimento.
  for (const cheque of cheques) {
    if (vinculoPorCheque.has(cheque.id)) continue;
    const indice = numeroGerado(cheque.check_number);
    if (indice === null) continue;
    const candidatas = parcelas.filter(
      (parcela) =>
        !vinculadas.has(parcela.key) &&
        (Number(parcela.inst.number) === indice || String(parcela.inst.id || '') === `titulo-${indice}`),
    );
    if (candidatas.length === 0) continue;
    if (!consultaCompleta) {
      registrar(
        alertas,
        idCheque(cheque),
        'Consulta incompleta: associação por identificador não aplicada',
      );
      continue;
    }
    if (candidatas.length > 1) {
      registrar(bloqueios, idCheque(cheque), 'Identidade ambígua: o número do título casa com mais de uma parcela');
      for (const parcela of candidatas) parcela.vinculoPossivel = true;
      continue;
    }
    const candidata = candidatas[0];
    const valorCheque = valorDeFace(cheque);
    const valorParcela = valorDaParcela(candidata.inst);
    const vencCheque = normalizarData(cheque.compensation_date);
    const vencParcela = normalizarData(candidata.inst.due_date);
    const valorCompativel = valorCheque !== null && valorParcela !== null && valorCheque === valorParcela;
    const vencimentoCompativel = Boolean(vencCheque) && Boolean(vencParcela) && vencCheque === vencParcela;

    if (valorCompativel && vencimentoCompativel) {
      vinculoPorCheque.set(cheque.id, { tipo: 'identificador', parcela: candidata });
      vinculadas.add(candidata.key);
      continue;
    }

    candidata.vinculoPossivel = true;
    possiveis.add(cheque.id);
    if (!valorCompativel) {
      registrar(
        alertas,
        idCheque(cheque),
        `Identificador confere, mas o valor difere da parcela ${candidata.inst.number ?? candidata.key}`,
      );
    }
    if (!vencimentoCompativel) {
      registrar(
        alertas,
        idCheque(cheque),
        `Identificador confere, mas o vencimento difere da parcela ${candidata.inst.number ?? candidata.key}`,
      );
    }
    registrar(alertas, idCheque(cheque), 'Possível correspondência por identificador — conciliação pendente');
  }

  // C) POSSÍVEL correspondência por valor — apenas INDÍCIO, nunca fusão.
  const grupos = new Map();
  const agrupar = (valor, tipo, item) => {
    if (valor === null) return;
    const atual = grupos.get(valor) || { cheques: [], parcelas: [] };
    atual[tipo].push(item);
    grupos.set(valor, atual);
  };
  const statusElegivel = new Set(['pendente', 'compensado']);
  for (const cheque of cheques) {
    if (vinculoPorCheque.has(cheque.id)) continue;
    // Título cancelado, devolvido, resolvido ou substituto NUNCA absorve parcela.
    if (!statusElegivel.has(String(cheque.status || '').toLowerCase())) continue;
    agrupar(valorDeFace(cheque), 'cheques', cheque);
  }
  for (const parcela of parcelas) {
    if (vinculadas.has(parcela.key)) continue;
    if (parcela.inst.settled_by || parcela.inst.paid === true) continue;
    agrupar(valorDaParcela(parcela.inst), 'parcelas', parcela);
  }

  for (const [valor, grupo] of grupos) {
    if (grupo.cheques.length === 0 || grupo.parcelas.length === 0) continue;
    for (const cheque of grupo.cheques) {
      possiveis.add(cheque.id);
      registrar(
        alertas,
        idCheque(cheque),
        `Possível correspondência: ${grupo.parcelas.length} parcela(s) da agenda com o valor ${valor}`,
      );
    }
    for (const parcela of grupo.parcelas) {
      parcela.vinculoPossivel = true;
      registrar(
        alertas,
        idParcela(parcela),
        `Possível correspondência: ${grupo.cheques.length} título(s) com o valor ${valor}`,
      );
    }
  }

  const evidenciaAgregada = Boolean(pagamentos?.quantidade) || Boolean(asaas?.contabilizados);

  for (const cheque of cheques) {
    linhas.push(
      montarLinhaCheque({
        cheque,
        operacao,
        vinculo: vinculoPorCheque.get(cheque.id) || (possiveis.has(cheque.id) ? { tipo: 'possivel' } : null),
        alertas: alertas.get(idCheque(cheque)),
        bloqueios: bloqueios.get(idCheque(cheque)),
        recebimentos: pagamentos,
        evidencia: evidencias?.[cheque.id] || null,
        temSubstituto: cheques.some((outro) => outro.substitui_cheque_id === cheque.id),
      }),
    );
  }
  for (const parcela of parcelas) {
    if (vinculadas.has(parcela.key)) continue;
    linhas.push(
      montarLinhaParcela({
        operacao,
        parcela,
        alertas: alertas.get(idParcela(parcela)),
        bloqueios: bloqueios.get(idParcela(parcela)),
        recebimentos: pagamentos,
        evidenciaAgregada,
      }),
    );
  }

  return linhas;
}

/** Monta as linhas normalizadas. Função pura: recebe os dados já carregados. */
export function montarContasReceber(dados = {}, opcoes = {}) {
  const {
    cheques = [],
    operations = [],
    payments = [],
    asaasEventos = [],
    evidencias = {},
  } = dados || {};
  const hoje = opcoes.hoje || hojeLocalISO();
  const completude = opcoes.completude || { confiavel: true, motivos: [] };
  const listaCheques = Array.isArray(cheques) ? cheques : [];
  const listaOps = Array.isArray(operations) ? operations : [];
  const listaPagamentos = Array.isArray(payments) ? payments : [];
  const listaAsaas = Array.isArray(asaasEventos) ? asaasEventos : [];

  const porOperacao = new Map();
  const semOperacao = [];
  for (const cheque of listaCheques) {
    if (!cheque.operation_id) {
      semOperacao.push(cheque);
      continue;
    }
    const atuais = porOperacao.get(cheque.operation_id) || [];
    atuais.push(cheque);
    porOperacao.set(cheque.operation_id, atuais);
  }

  const pagamentosPorOperacao = new Map();
  for (const pagamento of listaPagamentos) {
    if (!pagamento.operation_id) continue;
    const atual = pagamentosPorOperacao.get(pagamento.operation_id) || { quantidade: 0, total: 0 };
    atual.quantidade += 1;
    atual.total = round2(atual.total + (Number(pagamento.amount) || 0));
    pagamentosPorOperacao.set(pagamento.operation_id, atual);
  }

  const asaasPorOperacao = new Map();
  for (const evento of listaAsaas) {
    if (String(evento.status || '').toLowerCase() !== 'contabilizado') continue;
    if (!evento.operation_id) continue;
    const atual = asaasPorOperacao.get(evento.operation_id) || { contabilizados: 0, total: 0 };
    atual.contabilizados += 1;
    atual.total = round2(atual.total + (Number(evento.value) || 0));
    asaasPorOperacao.set(evento.operation_id, atual);
  }

  const linhas = [];
  for (const operacao of listaOps) {
    linhas.push(
      ...processarOperacao(operacao, porOperacao.get(operacao.id) || [], {
        pagamentos: pagamentosPorOperacao.get(operacao.id) || null,
        asaas: asaasPorOperacao.get(operacao.id) || null,
        evidencias,
        completude,
        hoje,
      }),
    );
  }
  // Cheques cuja operação não veio na consulta (ou não têm operação): aparecem
  // assim mesmo, sinalizados — nunca são descartados da listagem.
  const operacoesProcessadas = new Set(listaOps.map((operacao) => operacao.id));
  for (const [operacaoId, lista] of porOperacao) {
    if (operacoesProcessadas.has(operacaoId)) continue;
    for (const cheque of lista) {
      linhas.push(
        montarLinhaCheque({
          cheque,
          operacao: null,
          vinculo: null,
          recebimentos: null,
          evidencia: evidencias?.[cheque.id] || null,
        }),
      );
    }
  }
  for (const cheque of semOperacao) {
    linhas.push(
      montarLinhaCheque({
        cheque,
        operacao: null,
        vinculo: null,
        recebimentos: null,
        evidencia: evidencias?.[cheque.id] || null,
      }),
    );
  }

  const completas = linhas.map((linha) => {
    const classificacao = classificarTitulo(
      {
        status: linha.status_registro,
        vencimento: linha.vencimento,
        recebimento_estado: linha.recebimento_estado,
        resolucao_estado: linha.resolucao_estado,
        cobranca_status: linha.cobranca?.status || null,
        evidencia_agregada: linha.evidencia_agregada === true,
        bloqueios: linha.bloqueios,
        alertas: linha.alertas,
      },
      hoje,
    );
    return { ...linha, ...classificacao };
  });

  return {
    linhas: completas,
    resumo: resumirTitulos(completas, { pagamentos: listaPagamentos, asaas: listaAsaas }),
    hoje,
    completude,
    limitacoes: Array.isArray(opcoes.limitacoes) ? opcoes.limitacoes : [],
  };
}

export function resumirTitulos(linhas = [], extras = {}) {
  const porSituacao = {};
  for (const chave of Object.values(SITUACAO)) porSituacao[chave] = { quantidade: 0, valor: 0 };
  let inconsistentes = 0;
  let comAlerta = 0;
  let alertasSemBloqueio = 0;

  for (const linha of linhas) {
    const alvo = porSituacao[linha.situacao] || porSituacao[SITUACAO.INCONSISTENTE];
    alvo.quantidade += 1;
    if (linha.valor_face !== null && linha.valor_face !== undefined) alvo.valor = round2(alvo.valor + linha.valor_face);
    const bloqueado = Array.isArray(linha.bloqueios) && linha.bloqueios.length > 0;
    if (bloqueado) inconsistentes += 1;
    if (Array.isArray(linha.alertas) && linha.alertas.length > 0) {
      comAlerta += 1;
      if (!bloqueado) alertasSemBloqueio += 1;
    }
  }

  const pagamentos = Array.isArray(extras.pagamentos) ? extras.pagamentos : [];
  const asaas = (Array.isArray(extras.asaas) ? extras.asaas : []).filter(
    (evento) => String(evento.status || '').toLowerCase() === 'contabilizado',
  );
  // Um mesmo evento entregue duas vezes conta uma vez só: a identidade é a
  // chave externa do evento, nunca a quantidade de registros.
  const unicosAsaas = new Map();
  for (const evento of asaas) {
    const chave = String(evento.event_key || evento.id || '');
    if (!unicosAsaas.has(chave)) unicosAsaas.set(chave, evento);
  }
  const chavesAsaas = new Set(unicosAsaas.keys());

  return {
    total: contar(linhas),
    por_situacao: porSituacao,
    inconsistente: inconsistentes,
    inconsistentes,
    com_alerta: comAlerta,
    alertas_sem_bloqueio: alertasSemBloqueio,
    recebimentos: {
      manuais: {
        eventos: pagamentos.length,
        total: round2(pagamentos.reduce((soma, p) => soma + (Number(p.amount) || 0), 0)),
      },
      asaas: {
        eventos: chavesAsaas.size,
        total: round2([...unicosAsaas.values()].reduce((soma, evento) => soma + (Number(evento.value) || 0), 0)),
        duplicados: asaas.length - chavesAsaas.size,
      },
    },
  };
}

const texto = (valor) => String(valor ?? '').toLowerCase();

/** Filtros sobre as linhas já normalizadas. Nenhuma regra é recriada na tela. */
export function filtrarTitulos(linhas = [], filtros = {}) {
  const { situacao, cliente, sacado, tipo, origem, de, ate, busca } = filtros;
  const termo = texto(busca).trim();
  return linhas.filter((linha) => {
    if (situacao === SITUACAO.INCONSISTENTE) {
      if (!linha.inconsistente) return false;
    } else if (situacao && linha.situacao !== situacao) {
      return false;
    }
    if (cliente && linha.cliente_nome !== cliente) return false;
    if (sacado && (linha.sacado_nome || '') !== sacado) return false;
    if (tipo && (linha.tipo || '') !== tipo) return false;
    if (origem && linha.origem !== origem) return false;
    if (de && (!linha.vencimento || linha.vencimento < de)) return false;
    if (ate && (!linha.vencimento || linha.vencimento > ate)) return false;
    if (termo) {
      const alvo = [linha.numero, linha.identidade, linha.cliente_nome, linha.sacado_nome, linha.operacao_numero]
        .map(texto)
        .join(' ');
      if (!alvo.includes(termo)) return false;
    }
    return true;
  });
}

/** Quantos títulos relevantes ficaram fora por causa dos filtros atuais. */
export function contagemOculta(todas = [], filtradas = []) {
  const visiveis = new Set(filtradas.map((linha) => linha.id));
  const ocultos = { inconsistentes: 0, aConfirmar: 0 };
  for (const linha of todas) {
    if (visiveis.has(linha.id)) continue;
    if (linha.inconsistente) ocultos.inconsistentes += 1;
    if (linha.situacao === SITUACAO.A_CONFIRMAR) ocultos.aConfirmar += 1;
  }
  return ocultos;
}

/** Ordenação explícita e estável por vencimento (sem data vai para o fim). */
export function ordenarPorVencimento(linhas = [], direcao = 'asc') {
  const sinal = direcao === 'desc' ? -1 : 1;
  return linhas.slice().sort((a, b) => {
    const va = a.vencimento || '9999-12-31';
    const vb = b.vencimento || '9999-12-31';
    if (va !== vb) return va < vb ? -sinal : sinal;
    return String(a.id) < String(b.id) ? -sinal : sinal;
  });
}

/** Valores únicos para os filtros, a partir dos dados realmente disponíveis. */
export function opcoesDeFiltro(linhas = []) {
  const unicos = (campo) =>
    Array.from(new Set(linhas.map((linha) => linha[campo]).filter(Boolean))).sort((a, b) =>
      String(a).localeCompare(String(b), 'pt-BR'),
    );
  return { clientes: unicos('cliente_nome'), sacados: unicos('sacado_nome'), tipos: unicos('tipo') };
}

/* ────────────────────────────────────────────────────────────────────────────
 * CARREGAMENTO — paginação segura e completude declarada
 * ──────────────────────────────────────────────────────────────────────────── */

const PAGINA = 500;
const MAX_PAGINAS = 200;

/**
 * Carrega todas as páginas com mecanismo suportado (deslocamento posicional) e
 * três garantias explícitas:
 *   1. deduplicação por identidade original (id);
 *   2. término garantido (página vazia, página curta, página sem novidade ou
 *      teto de páginas);
 *   3. qualquer sinal de instabilidade vira `limitacao` — nunca silêncio.
 */
export async function buscarTudo(api, entidade, ordenacao, query = {}) {
  const encontrados = new Map();
  let skip = 0;
  let paginas = 0;
  let limitacao = null;

  for (;;) {
    const lote = await api.entities[entidade].filter(query, ordenacao, PAGINA, skip);
    const lista = Array.isArray(lote) ? lote : lote?.items || [];
    if (lista.length === 0) break;
    if (lista.length > PAGINA) limitacao = limitacao || 'pagina_maior_que_o_pedido';

    let novos = 0;
    lista.forEach((registro, indice) => {
      const chave = registro?.id ? String(registro.id) : `sem-id:${skip + indice}`;
      if (!registro?.id && !limitacao) limitacao = 'registro_sem_identidade';
      if (encontrados.has(chave)) return;
      encontrados.set(chave, registro);
      novos += 1;
    });

    if (novos === 0) {
      limitacao = 'deslocamento_instavel';
      break;
    }
    if (lista.length < PAGINA) break;
    skip += PAGINA;
    paginas += 1;
    if (paginas >= MAX_PAGINAS) {
      limitacao = 'teto_de_paginas';
      break;
    }
  }

  return { registros: [...encontrados.values()], limitacao };
}

async function buscarOpcional(api, entidade, ordenacao, query = {}) {
  if (typeof api?.entities?.[entidade]?.filter !== 'function') {
    return { registros: [], disponivel: false, limitacao: null };
  }
  try {
    const resultado = await buscarTudo(api, entidade, ordenacao, query);
    return { ...resultado, disponivel: true };
  } catch (erro) {
    return { registros: [], disponivel: false, limitacao: null, erro: erro?.message || String(erro) };
  }
}

const FILTRO_LANCAMENTOS = {
  $or: [
    { source_type: 'cheque_compensacao' },
    { source_type: 'cheque_estorno_compensacao' },
    { source_type: 'recebimento_cheque_devolvido' },
  ],
};

/**
 * Carrega e normaliza. SOMENTE LEITURA: usa apenas `filter` das entidades que a
 * sessão já pode consultar (respeita o RLS vigente, sem privilégio de serviço).
 */
export async function carregarContasReceber(api, opcoes = {}) {
  const [chequesR, operacoesR, pagamentosR] = await Promise.all([
    buscarTudo(api, 'Cheque', '-created_date'),
    buscarTudo(api, 'Operation', '-created_date'),
    buscarTudo(api, 'Payment', '-payment_date'),
  ]);

  const [bancosR, lancamentosR, asaasR] = await Promise.all([
    buscarOpcional(api, 'Banco', '-created_date'),
    buscarOpcional(api, 'CashFlow', '-created_date', FILTRO_LANCAMENTOS),
    buscarOpcional(api, 'AsaasEvento', '-created_date'),
  ]);

  const limitacoes = [];
  const motivosCompletude = [];
  for (const [nome, resultado] of [
    ['Cheque', chequesR],
    ['Operation', operacoesR],
    ['Payment', pagamentosR],
  ]) {
    if (resultado.limitacao) {
      motivosCompletude.push(`${nome}: ${resultado.limitacao}`);
      limitacoes.push(
        `Consulta de ${nome} interrompida (${resultado.limitacao}) — a classificação que depende de unicidade foi suspensa.`,
      );
    }
  }
  if (!bancosR.disponivel) {
    limitacoes.push('Contas bancárias indisponíveis — nenhum recebimento por cheque pode ser comprovado nesta consulta.');
  }
  if (!lancamentosR.disponivel) {
    limitacoes.push('Lançamentos de caixa indisponíveis — nenhum recebimento por cheque pode ser comprovado nesta consulta.');
  }
  if (!asaasR.disponivel) {
    limitacoes.push('Eventos do Asaas indisponíveis — recebimentos do canal não verificados.');
  }

  const completude = { confiavel: motivosCompletude.length === 0, motivos: motivosCompletude };

  const evidencias = await avaliarEvidencias({
    cheques: chequesR.registros,
    bancos: bancosR.registros,
    cashflows: lancamentosR.registros,
    operations: operacoesR.registros,
  });

  const resultado = montarContasReceber(
    {
      cheques: chequesR.registros,
      operations: operacoesR.registros,
      payments: pagamentosR.registros,
      asaasEventos: asaasR.registros,
      evidencias,
    },
    { ...opcoes, completude, limitacoes },
  );

  return { ...resultado, pagamentos: pagamentosR.registros };
}