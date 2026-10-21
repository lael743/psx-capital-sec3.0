/**
 * M6.2 — CONTAS A RECEBER · SERVIÇO ÚNICO DE CONSULTA (SOMENTE LEITURA).
 *
 * Reúne `Cheque`, `Operation.installment_schedule`, `Operation` e `Payment` e
 * devolve LINHAS NORMALIZADAS de títulos. Nenhuma função deste módulo escreve:
 * não há create, update, delete, nem chamada a função de backend.
 *
 * ── IDENTIDADE E DEDUPLICAÇÃO ───────────────────────────────────────────────
 *
 * 1. Toda linha preserva a origem (`cheque` | `agenda`) e o id do registro
 *    original. Nada é fundido sem uma evidência declarada em `vinculo`.
 * 2. `settled_by` (escrito por `chequeCore.allocateInstallments`) é o ÚNICO
 *    vínculo COMPROVADO entre parcela e título.
 * 3. O número gerado pelo próprio app (`TIT-n`) casa com `titulo-n` /
 *    `number === n` da agenda: evidência de IDENTIFICADOR, não de pagamento.
 * 4. Correspondência por VALOR ÚNICO dentro da mesma operação é INFERIDA e
 *    marcada como tal. Vencimento + valor isolados NUNCA fundem registros.
 * 5. Havendo ambiguidade, os registros NÃO são fundidos: ambos aparecem e são
 *    sinalizados como "Conciliação pendente".
 *
 * ── CLASSIFICAÇÃO ───────────────────────────────────────────────────────────
 *
 * "Recebido" exige evidência do próprio título: título compensado COM token de
 * compensação, ou parcela quitada COM `settled_by` válido. Operação quitada,
 * cobrança emitida ou status externo do Asaas NÃO são recebimento.
 *
 * Este módulo não importa o cliente da plataforma de propósito: recebe a API
 * por parâmetro, o que mantém a classificação e a deduplicação testáveis com
 * fixtures isoladas.
 */

export const SITUACAO = {
  A_VENCER: 'a_vencer',
  VENCIDO: 'vencido',
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
  identificador: 'agenda pelo nº do título',
  inferido: 'agenda por valor único (inferido)',
  pendente: 'conciliação pendente',
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
  const texto = String(valor);
  const partes = texto.match(/^(\d{4})-(\d{2})-(\d{2})/);
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

/** Função pura de classificação. Não infere recebimento por status agregado. */
export function classificarTitulo(titulo, hoje = hojeLocalISO()) {
  const bloqueios = Array.isArray(titulo.bloqueios) ? titulo.bloqueios : [];
  const alertas = Array.isArray(titulo.alertas) ? titulo.alertas : [];
  const motivos = [...bloqueios, ...alertas];
  const comum = { motivos, inconsistente: motivos.length > 0 };

  if (bloqueios.length > 0) {
    return { ...comum, situacao: SITUACAO.INCONSISTENTE, label: SITUACAO_LABEL.inconsistente };
  }

  const status = String(titulo.status || '').toLowerCase();
  const concluir = (situacao) => ({ ...comum, situacao, label: SITUACAO_LABEL[situacao] });

  if (status === 'cancelado') return concluir(SITUACAO.CANCELADO);
  if (status.startsWith('resolvido_')) return concluir(SITUACAO.RESOLVIDO);
  if (status === 'devolvido') return concluir(SITUACAO.DEVOLVIDO);
  if (titulo.recebimento_comprovado) return concluir(SITUACAO.RECEBIDO);
  if (cobrancaAberta(titulo.cobranca_status)) return concluir(SITUACAO.EM_COBRANCA);
  if (!titulo.vencimento) return concluir(SITUACAO.INCONSISTENTE);

  return concluir(titulo.vencimento < hoje ? SITUACAO.VENCIDO : SITUACAO.A_VENCER);
}

function contar(valor) {
  return Array.isArray(valor) ? valor.length : 0;
}

function montarLinhaCheque({ cheque, operacao, vinculo, alertas, bloqueios, recebimentos }) {
  const status = String(cheque.status || '').toLowerCase();
  const vencimento = normalizarData(cheque.compensation_date);
  const valor = valorDeFace(cheque);
  const parcela = vinculo?.parcela?.inst || null;
  const cobranca = parcela ? cobrancaDaParcela(parcela, operacao) : null;
  const recebimentoComprovado = status === 'compensado' && Boolean(cheque.compensation_token);
  const resolucaoComprovada = Boolean(cheque.resolucao_evento);

  const travas = [...(bloqueios || [])];
  const avisos = [...(alertas || [])];

  if (!operacao) travas.push('Título sem operação vinculada');
  if (!vencimento) travas.push('Vencimento ausente ou inválido');
  if (valor === null) avisos.push('Valor de face ausente');
  if (!cheque.tipo) avisos.push('Tipo do título ausente');
  if (status === 'compensado' && !cheque.compensation_token) {
    travas.push('Compensado sem prova de crédito (token de compensação ausente)');
  }
  if (status.startsWith('resolvido_') && !resolucaoComprovada) {
    travas.push('Resolução sem evento comprovado (resolucao_evento ausente)');
  }
  if (status === 'devolvido' && resolucaoComprovada) {
    travas.push('Devolvido com resolução registrada — estado contraditório');
  }
  if (operacao?.status === 'quitado' && !recebimentoComprovado) {
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
    recebimento_comprovado: recebimentoComprovado,
    resolucao_comprovada: resolucaoComprovada,
    vinculo: vinculo?.tipo || null,
    agenda_ref: vinculo
      ? { chave: vinculo.parcela?.chave || null, numero: vinculo.parcela?.inst?.number ?? null }
      : null,
    saldo_operacao:
      operacao && Number.isFinite(Number(operacao.balance_due)) ? round2(operacao.balance_due) : null,
    recebimentos_operacao: recebimentos || null,
    bloqueios: travas,
    alertas: avisos,
  };
}

function montarLinhaParcela({ operacao, parcela, alertas, bloqueios, recebimentos }) {
  const inst = parcela.inst;
  const vencimento = normalizarData(inst.due_date);
  const bruto = Number(inst.value);
  const valor = Number.isFinite(bruto) && bruto > 0 ? round2(bruto) : null;
  const quitada = inst.paid === true;
  const vinculoQuitacao = inst.settled_by || null;
  const recebimentoComprovado = quitada && Boolean(vinculoQuitacao);

  const travas = [...(bloqueios || [])];
  const avisos = [...(alertas || [])];

  if (!operacao) travas.push('Parcela sem operação localizada');
  if (!vencimento) travas.push('Vencimento da parcela ausente ou inválido');
  if (valor === null) avisos.push('Valor da parcela ausente');
  if (!inst.id) avisos.push('Parcela sem identidade própria (id ausente)');
  if (quitada && !vinculoQuitacao) {
    travas.push('Parcela marcada como paga sem vínculo com recebimento comprovado');
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
    recebimento_comprovado: recebimentoComprovado,
    resolucao_comprovada: false,
    vinculo: null,
    agenda_ref: null,
    saldo_operacao:
      operacao && Number.isFinite(Number(operacao.balance_due)) ? round2(operacao.balance_due) : null,
    recebimentos_operacao: recebimentos || null,
    bloqueios: travas,
    alertas: avisos,
  };
}

function processarOperacao(operacao, cheques, { pagamentos }) {
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
  const idCheque = (cheque) => `cheque:${cheque.id}`;
  const idParcela = (parcela) => `agenda:${operacao?.id || 'sem-op'}:${parcela.key}`;
  const registrar = (mapa, chave, motivo) => {
    const atuais = mapa.get(chave) || [];
    atuais.push(motivo);
    mapa.set(chave, atuais);
  };

  // A) vínculo COMPROVADO: a agenda registra qual título a quitou.
  for (const parcela of parcelas) {
    const settledBy = parcela.inst.settled_by;
    if (!settledBy) continue;
    const cheque = cheques.find((c) => c.id === settledBy);
    if (!cheque) {
      registrar(bloqueios, idParcela(parcela), 'A parcela indica quitação por um título inexistente');
      continue;
    }
    if (vinculoPorCheque.has(settledBy)) {
      registrar(bloqueios, idCheque(cheque), 'Mais de uma parcela aponta para este mesmo título');
      continue;
    }
    vinculoPorCheque.set(settledBy, { tipo: 'comprovado', parcela });
    vinculadas.add(parcela.key);
  }

  // B) vínculo por IDENTIFICADOR gerado pelo app (TIT-n <-> titulo-n / number n).
  for (const cheque of cheques) {
    if (vinculoPorCheque.has(cheque.id)) continue;
    const indice = numeroGerado(cheque.check_number);
    if (indice === null) continue;
    const candidatas = parcelas.filter(
      (parcela) =>
        !vinculadas.has(parcela.key) &&
        (Number(parcela.inst.number) === indice || String(parcela.inst.id || '') === `titulo-${indice}`),
    );
    if (candidatas.length === 1) {
      vinculoPorCheque.set(cheque.id, { tipo: 'identificador', parcela: candidatas[0] });
      vinculadas.add(candidatas[0].key);
    } else if (candidatas.length > 1) {
      registrar(bloqueios, idCheque(cheque), 'Identidade ambígua: o número do título casa com mais de uma parcela');
    }
  }

  // C) correspondência INFERIDA: valor único entre os registros ainda livres.
  const grupos = new Map();
  const agrupar = (valor, tipo, item) => {
    if (valor === null) return;
    const atual = grupos.get(valor) || { cheques: [], parcelas: [] };
    atual[tipo].push(item);
    grupos.set(valor, atual);
  };
  for (const cheque of cheques) {
    if (vinculoPorCheque.has(cheque.id)) continue;
    agrupar(valorDeFace(cheque), 'cheques', cheque);
  }
  for (const parcela of parcelas) {
    if (vinculadas.has(parcela.key)) continue;
    // Parcela que já declara quitação (ou está paga) tem estado financeiro
    // próprio: nunca é pareada por inferência de valor.
    if (parcela.inst.settled_by || parcela.inst.paid === true) continue;
    const valor = Number(parcela.inst.value);
    agrupar(Number.isFinite(valor) && valor > 0 ? round2(valor) : null, 'parcelas', parcela);
  }

  for (const grupo of grupos.values()) {
    if (grupo.cheques.length === 1 && grupo.parcelas.length === 1) {
      const cheque = grupo.cheques[0];
      const parcela = grupo.parcelas[0];
      vinculoPorCheque.set(cheque.id, { tipo: 'inferido', parcela });
      vinculadas.add(parcela.key);
      const vencCheque = normalizarData(cheque.compensation_date);
      const vencParcela = normalizarData(parcela.inst.due_date);
      if (vencCheque && vencParcela && vencCheque !== vencParcela) {
        registrar(alertas, idCheque(cheque), 'Vencimento difere do registrado na agenda da operação');
      }
    } else if (grupo.cheques.length > 0 && grupo.parcelas.length > 0) {
      for (const cheque of grupo.cheques) {
        registrar(
          bloqueios,
          idCheque(cheque),
          `Conciliação pendente: ${grupo.parcelas.length} parcela(s) da agenda com o mesmo valor`,
        );
      }
      for (const parcela of grupo.parcelas) {
        registrar(
          bloqueios,
          idParcela(parcela),
          `Conciliação pendente: ${grupo.cheques.length} título(s) com o mesmo valor`,
        );
      }
    }
  }

  for (const cheque of cheques) {
    const vinculo = vinculoPorCheque.get(cheque.id) || null;
    linhas.push(
      montarLinhaCheque({
        cheque,
        operacao,
        vinculo,
        alertas: alertas.get(idCheque(cheque)),
        bloqueios: bloqueios.get(idCheque(cheque)),
        recebimentos: pagamentos,
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
      }),
    );
  }

  return linhas;
}

/** Monta as linhas normalizadas. Função pura: recebe os dados já carregados. */
export function montarContasReceber({ cheques = [], operations = [], payments = [] } = {}, opcoes = {}) {
  const hoje = opcoes.hoje || hojeLocalISO();
  const listaCheques = Array.isArray(cheques) ? cheques : [];
  const listaOps = Array.isArray(operations) ? operations : [];
  const listaPagamentos = Array.isArray(payments) ? payments : [];

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

  const linhas = [];
  for (const operacao of listaOps) {
    linhas.push(
      ...processarOperacao(operacao, porOperacao.get(operacao.id) || [], {
        pagamentos: pagamentosPorOperacao.get(operacao.id) || null,
      }),
    );
  }
  // Cheques cuja operação não veio na consulta (ou não têm operação): aparecem
  // assim mesmo, sinalizados — nunca são descartados da listagem.
  const operacoesProcessadas = new Set(listaOps.map((operacao) => operacao.id));
  for (const [operacaoId, lista] of porOperacao) {
    if (operacoesProcessadas.has(operacaoId)) continue;
    for (const cheque of lista) {
      linhas.push(montarLinhaCheque({ cheque, operacao: null, vinculo: null, recebimentos: null }));
    }
  }
  for (const cheque of semOperacao) {
    linhas.push(
      montarLinhaCheque({
        cheque,
        operacao: null,
        vinculo: null,
        recebimentos: null,
      }),
    );
  }

  const completas = linhas.map((linha) => {
    const classificacao = classificarTitulo(
      {
        status: linha.status_registro,
        vencimento: linha.vencimento,
        recebimento_comprovado: linha.recebimento_comprovado,
        resolucao_comprovada: linha.resolucao_comprovada,
        cobranca_status: linha.cobranca?.status || null,
        bloqueios: linha.bloqueios,
        alertas: linha.alertas,
      },
      hoje,
    );
    return { ...linha, ...classificacao };
  });

  return { linhas: completas, resumo: resumirTitulos(completas), hoje };
}

export function resumirTitulos(linhas = []) {
  const porSituacao = {};
  for (const chave of Object.values(SITUACAO)) porSituacao[chave] = { quantidade: 0, valor: 0 };
  let inconsistentes = 0;
  for (const linha of linhas) {
    const alvo = porSituacao[linha.situacao] || porSituacao[SITUACAO.INCONSISTENTE];
    alvo.quantidade += 1;
    if (linha.valor_face !== null && linha.valor_face !== undefined) alvo.valor = round2(alvo.valor + linha.valor_face);
    if (linha.inconsistente) inconsistentes += 1;
  }
  return { total: contar(linhas), por_situacao: porSituacao, inconsistentes };
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

async function buscarTudo(api, entidade, ordenacao) {
  const PAGINA = 500;
  const todos = [];
  let skip = 0;
  for (;;) {
    const lote = await api.entities[entidade].filter({}, ordenacao, PAGINA, skip);
    const lista = Array.isArray(lote) ? lote : lote?.items || [];
    todos.push(...lista);
    if (lista.length < PAGINA) break;
    skip += PAGINA;
  }
  return todos;
}

/**
 * Carrega e normaliza. SOMENTE LEITURA: usa apenas `filter` das entidades que a
 * sessão já pode consultar (respeita o RLS vigente, sem privilégio de serviço).
 */
export async function carregarContasReceber(api, opcoes = {}) {
  const [cheques, operations, payments] = await Promise.all([
    buscarTudo(api, 'Cheque', '-created_date'),
    buscarTudo(api, 'Operation', '-created_date'),
    buscarTudo(api, 'Payment', '-payment_date'),
  ]);
  return { ...montarContasReceber({ cheques, operations, payments }, opcoes), pagamentos: payments };
}