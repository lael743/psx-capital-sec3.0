/**
 * M3 — NÚCLEO ÚNICO DE RECEBIMENTO DA OPERAÇÃO.
 *
 * Todo recebimento que entra no agregado da operação passa por aqui: registro
 * manual (tela da operação) e baixa manual (extrato do cliente). O recebimento
 * Asaas e a compensação de cheque continuam nos seus fluxos, mas usam a MESMA
 * regra de derivados (`chequeCore`), para que a mesma operação não apresente
 * lucros diferentes conforme o canal que a liquidou.
 *
 * ⚠️ DUAS CÓPIAS IDÊNTICAS:
 *      base44/shared/receiptEvent.js  (função de servidor `recebimentoManual`)
 *      src/lib/receiptEvent.js        (testes e tipagem do navegador)
 *    O bloco entre os marcadores @sync é BYTE A BYTE igual nos dois arquivos; o
 *    teste M3.0 falha se divergirem. Só o caminho do `import` difere, porque o
 *    backend importa `./chequeCore.ts` e o frontend `./chequeCore.js`.
 *
 * ── AS QUATRO GARANTIAS ─────────────────────────────────────────────────────
 *
 * 1. IDENTIDADE. Todo recebimento tem chave estável (`origem:uuid`) escolhida
 *    pelo chamador e reusada em cada retry. A chave é gravada na MESMA escrita
 *    atômica do incremento (`$inc` + `$push` de `receipt_keys`), no padrão já
 *    comprovado de `asaas_eventos_processados` e `taxa_incorporada_eventos`.
 *    Assim o marcador e o valor nunca divergem: ou os dois entram, ou nenhum.
 *
 * 2. SEM PERDA DE ATUALIZAÇÃO. O incremento é `$inc`, nunca leitura + soma em
 *    memória + sobrescrita. Dois recebimentos simultâneos somam; nenhum apaga
 *    o outro. A guarda sobre `amount_paid`/`total_receivable` observados existe
 *    apenas para impor o TETO (o valor aplicado nunca ultrapassa o saldo em
 *    aberto) — se a guarda não casar, a operação é relida e recalculada.
 *
 * 3. SEM SALDO NEGATIVO. O valor aplicado é limitado ao saldo em aberto. Um
 *    valor acima do saldo é RECUSADO com mensagem — não é absorvido em
 *    silêncio nem deixa `balance_due` negativo por arredondamento.
 *
 * 4. EFEITO SECUNDÁRIO RECUPERÁVEL. O registro em `Payment` é idempotente por
 *    `event_key`. Se a execução morrer entre o incremento e o registro, o
 *    retry com a MESMA chave não soma de novo (a chave já está em
 *    `receipt_keys`) e apenas completa o registro que faltava.
 *
 * ── O QUE ESTE MÓDULO NÃO FAZ ───────────────────────────────────────────────
 * Não movimenta banco (`Banco.current_balance`) nem caixa (`CashFlow`). Não
 * inventa custo, taxa ou despesa. Não trata recebimento parcial como
 * funcionalidade: a mora é a única parcela aceita acima da obrigação e precisa
 * vir com taxa e dias declarados, conferidos aqui.
 */

import {
  computeBalanceDue,
  computeRealizedProfit,
  isOperationSettled,
} from './chequeCore.ts';

/* @sync:start — bloco idêntico em src/lib/receiptEvent.js */

/** Tolerância monetária (meio centavo). */
export const TOLERANCIA = 0.01;

/** Canais que passam por este núcleo. O Asaas tem fluxo próprio. */
export const ORIGENS = Object.freeze({
  MANUAL: 'manual',
  BAIXA_MANUAL: 'baixa_manual',
});

/** Valores aceitos (o objeto acima é indexado por NOME, não por valor). */
const ORIGENS_VALIDAS = Object.freeze(Object.values(ORIGENS));

/** Métodos aceitos pelo registro de recebimento. */
export const METODOS = Object.freeze(['pix', 'dinheiro', 'transferencia', 'cheque', 'outro']);

/** Taxa mensal de mora aceita (%), teto de sanidade. */
export const TAXA_MORA_MAXIMA = 30;

export function round2(valor) {
  return Math.round((Number(valor) || 0) * 100) / 100;
}

/** Chave estável do evento: `<origem>:<identificador>`. */
export function chaveRecebimento(origem, id) {
  const o = String(origem || '').trim();
  const i = String(id || '').trim();
  if (!o || !i) return '';
  return `${o}:${i}`;
}

/** A chave precisa ser estável, curta e segura para ser gravada. */
export function chaveValida(chave) {
  if (typeof chave !== 'string') return false;
  const c = chave.trim();
  return c.length >= 6 && c.length <= 120 && /^[A-Za-z0-9_.:-]+$/.test(c);
}

/** Saldo em aberto — nunca negativo. */
export function saldoEmAberto(totalRecebivel, recebido) {
  return computeBalanceDue(totalRecebivel, recebido);
}

/** Dias de atraso entre o vencimento e a data de referência (strings AAAA-MM-DD). */
export function diasDeAtraso(vencimento, referencia) {
  const v = String(vencimento || '').slice(0, 10);
  const r = String(referencia || '').slice(0, 10);
  const formato = /^\d{4}-\d{2}-\d{2}$/;
  if (!formato.test(v) || !formato.test(r)) return 0;
  const dv = Date.UTC(Number(v.slice(0, 4)), Number(v.slice(5, 7)) - 1, Number(v.slice(8, 10)));
  const dr = Date.UTC(Number(r.slice(0, 4)), Number(r.slice(5, 7)) - 1, Number(r.slice(8, 10)));
  const dias = Math.round((dr - dv) / 86400000);
  return dias > 0 ? dias : 0;
}

/**
 * Guarda de compare-and-swap para um campo numérico que pode não existir em
 * documentos históricos (campo ausente ≠ zero na plataforma).
 */
function guardaNumerica(doc, campo, valor) {
  return typeof (doc && doc[campo]) === 'number'
    ? { [campo]: valor }
    : { [campo]: { $exists: false } };
}

/**
 * Valida a mora declarada contra a regra única:
 *   mora = saldo em aberto × taxa mensal% × dias de atraso / 30
 * A mora é opcional (zero quando não há atraso). Não se aceita mora sem taxa e
 * dias, nem valor divergente do calculado — o servidor não confia no número do
 * navegador para aumentar a obrigação.
 */
export function validarMora({ jurosMora, taxaMora, diasAtraso, saldo }) {
  const mora = round2(jurosMora);
  if (mora === 0) return { ok: true, mora: 0 };
  if (mora < 0) return { ok: false, erro: 'Mora não pode ser negativa.' };

  const taxa = Number(taxaMora) || 0;
  const dias = Number(diasAtraso) || 0;
  if (!(taxa > 0) || !(dias > 0)) {
    return { ok: false, erro: 'Mora exige taxa mensal e dias de atraso.' };
  }
  if (taxa > TAXA_MORA_MAXIMA) {
    return { ok: false, erro: 'Taxa de mora acima do limite aceito.' };
  }

  const calculada = round2((Number(saldo) || 0) * (taxa / 100) * (dias / 30));
  if (Math.abs(calculada - mora) > 0.05) {
    return { ok: false, erro: 'Mora divergente do cálculo sobre o saldo atual. Recarregue a operação.' };
  }
  return { ok: true, mora };
}

/** Validação de entrada comum aos dois canais. */
export function validarRecebimento(entrada) {
  const e = entrada || {};
  if (!e.operationId) return { ok: false, erro: 'Operação não informada.' };
  if (!chaveValida(e.chave)) return { ok: false, erro: 'Identidade do recebimento inválida.' };
  if (!ORIGENS_VALIDAS.includes(e.origem)) return { ok: false, erro: 'Origem do recebimento desconhecida.' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(e.data || '').slice(0, 10))) {
    return { ok: false, erro: 'Data do recebimento inválida.' };
  }
  const valor = round2(e.valorRecebido);
  if (!(valor > 0)) return { ok: false, erro: 'Valor do recebimento deve ser positivo.' };
  return { ok: true, valor };
}

/**
 * Aplica o recebimento ao agregado da operação.
 *
 * @returns {Promise<{aplicado:boolean, ja_aplicado?:boolean, erro?:string,
 *                    valor_aplicado?:number, juros_mora?:number,
 *                    saldo_anterior?:number, saldo_em_aberto?:number}>}
 */
export async function aplicarRecebimento(api, entrada) {
  const e = entrada || {};
  const validacao = validarRecebimento(e);
  if (!validacao.ok) return { aplicado: false, erro: validacao.erro };
  const valor = validacao.valor;

  for (let tentativa = 0; tentativa < 10; tentativa += 1) {
    const op = await api.entities.Operation.get(e.operationId).catch(() => null);
    if (!op) return { aplicado: false, erro: 'Operação não encontrada.' };

    const chaves = Array.isArray(op.receipt_keys) ? op.receipt_keys : [];
    if (chaves.includes(e.chave)) {
      return {
        aplicado: false,
        ja_aplicado: true,
        valor_aplicado: 0,
        juros_mora: 0,
        saldo_em_aberto: saldoEmAberto(op.total_receivable, op.amount_paid),
      };
    }

    const recebido = Number(op.amount_paid) || 0;
    const total = Number(op.total_receivable) || 0;
    const saldo = saldoEmAberto(total, recebido);

    if (saldo <= TOLERANCIA) {
      return { aplicado: false, erro: 'Operação sem saldo em aberto.', saldo_em_aberto: 0 };
    }

    const mora = validarMora({
      jurosMora: e.jurosMora,
      taxaMora: e.taxaMora,
      diasAtraso: e.diasAtraso,
      saldo,
    });
    if (!mora.ok) return { aplicado: false, erro: mora.erro };

    const disponivel = round2(saldo + mora.mora);
    if (valor > disponivel + TOLERANCIA) {
      return {
        aplicado: false,
        erro: `Valor acima do saldo em aberto (${disponivel.toFixed(2)}).`,
        saldo_em_aberto: saldo,
      };
    }

    const inc = { amount_paid: valor };
    if (mora.mora > 0) inc.total_receivable = mora.mora;

    const filtro = {
      id: op.id,
      receipt_keys: { $ne: e.chave },
      ...guardaNumerica(op, 'amount_paid', recebido),
      ...guardaNumerica(op, 'total_receivable', total),
    };

    const res = await api.entities.Operation.updateMany(filtro, {
      $inc: inc,
      $push: { receipt_keys: e.chave },
    });

    if (res && Number(res.updated) > 0) {
      return {
        aplicado: true,
        ja_aplicado: false,
        valor_aplicado: valor,
        juros_mora: mora.mora,
        saldo_anterior: saldo,
        saldo_em_aberto: round2(disponivel - valor),
      };
    }
  }

  return { aplicado: false, erro: 'Não foi possível aplicar o recebimento (concorrência). Tente novamente.' };
}

/**
 * Recompõe os derivados a partir do `amount_paid` AUTORITATIVO.
 *
 * Escreve condicionado ao valor observado: se outro recebimento mudou o valor
 * desde a leitura, esta recomposição está obsoleta e não escreve nada — quem
 * mudou o valor faz a própria recomposição. `amount_paid` nunca é escrito aqui.
 */
export async function recomporDerivados(api, operationId) {
  for (let tentativa = 0; tentativa < 10; tentativa += 1) {
    const op = await api.entities.Operation.get(operationId).catch(() => null);
    if (!op) return null;

    const total = Number(op.total_receivable) || 0;
    const recebido = Number(op.amount_paid) || 0;
    const saldo = computeBalanceDue(total, recebido);
    const quitado = isOperationSettled(total, recebido);

    const patch = {
      balance_due: saldo,
      realized_profit: computeRealizedProfit(op, recebido, quitado),
    };
    if (quitado && op.status !== 'quitado') patch.status = 'quitado';

    const res = await api.entities.Operation.updateMany(
      { id: operationId, ...guardaNumerica(op, 'amount_paid', recebido) },
      { $set: patch }
    );
    if (res && Number(res.updated) > 0) return { ...op, ...patch };
    if (res && Number(res.updated) === 0) return { ...op, ...patch, derivados_obsoletos: true };
  }
  return null;
}

/** Corpo do registro de recebimento (verdade de caixa do evento). */
export function dadosDoPagamento(op, entrada, resultado) {
  const e = entrada || {};
  const r = resultado || {};
  return {
    operation_id: op.id,
    client_id: op.client_id || '',
    client_name: op.client_name || '',
    amount: round2(e.valorRecebido),
    payment_date: String(e.data || '').slice(0, 10),
    method: METODOS.includes(e.metodo) ? e.metodo : 'outro',
    notes: typeof e.observacao === 'string' ? e.observacao.slice(0, 500) : '',
    is_partial: (Number(r.saldo_em_aberto) || 0) > TOLERANCIA,
    acrescimo: round2(r.juros_mora),
    origem: e.origem,
    event_key: e.chave,
    registrado_por: e.usuario || '',
  };
}

/**
 * Efeito secundário idempotente: um registro por chave.
 *
 * Só é chamado depois de a aplicação financeira ter vencido (ou de a chave já
 * constar em `receipt_keys`) — nesse ponto uma única execução é dona do evento,
 * então não existe corrida entre duas criações para a mesma chave.
 */
function ordenarPorIdentidade(lista) {
  return [...lista].sort((a, b) => {
    const ca = String((a && a.created_date) || '');
    const cb = String((b && b.created_date) || '');
    if (ca !== cb) return ca < cb ? -1 : 1;
    return String((a && a.id) || '') < String((b && b.id) || '') ? -1 : 1;
  });
}

export async function garantirRegistroPagamento(api, op, entrada, resultado) {
  const chave = (entrada || {}).chave;
  if (!chave) return { criado: false, pagamento: null };

  const ler = async () => {
    const resposta = await api.entities.Payment.filter({ event_key: chave });
    const lista = Array.isArray(resposta) ? resposta : (resposta && resposta.items) || [];
    return ordenarPorIdentidade(lista);
  };

  let lista = await ler();
  let novoId = '';
  if (lista.length === 0) {
    const novo = await api.entities.Payment.create(dadosDoPagamento(op, entrada, resultado));
    novoId = (novo && novo.id) || '';
    lista = await ler();
    if (lista.length === 0) lista = [novo];
  }

  // Conferir-e-criar NÃO é atômico: duas execuções do MESMO evento podem criar
  // dois registros. Converge para um registro canônico e remove o excedente —
  // que é duplicata do mesmo fato, nunca um segundo recebimento. O valor
  // autoritativo (`amount_paid`) já está protegido por `receipt_keys`.
  const canonico = lista[0];
  for (const extra of lista.slice(1)) {
    if (extra && extra.id && canonico && extra.id !== canonico.id) {
      try { await api.entities.Payment.delete(extra.id); } catch (_) { /* próxima execução converge */ }
    }
  }

  return { criado: !!novoId && canonico && canonico.id === novoId, pagamento: canonico || null };
}

/**
 * Fluxo completo do recebimento: valida → aplica → recomputa derivados →
 * garante o registro do evento.
 *
 * @returns {Promise<{ok:boolean, erro?:string, ja_aplicado?:boolean,
 *                    valor_aplicado?:number, juros_mora?:number,
 *                    saldo_em_aberto?:number, status?:string,
 *                    realized_profit?:number, pagamento?:object}>}
 */
export async function registrarRecebimento(api, entrada) {
  const e = entrada || {};
  const validacao = validarRecebimento(e);
  if (!validacao.ok) return { ok: false, erro: validacao.erro };

  const op = await api.entities.Operation.get(e.operationId).catch(() => null);
  if (!op) return { ok: false, erro: 'Operação não encontrada.' };

  const aplicacao = await aplicarRecebimento(api, e);
  if (aplicacao.erro) return { ok: false, erro: aplicacao.erro, saldo_em_aberto: aplicacao.saldo_em_aberto };

  const derivados = await recomporDerivados(api, op.id);
  const resultado = {
    aplicado: aplicacao.aplicado,
    ja_aplicado: !!aplicacao.ja_aplicado,
    valor_aplicado: aplicacao.valor_aplicado || 0,
    juros_mora: aplicacao.juros_mora || 0,
    saldo_em_aberto: derivados
      ? Number(derivados.balance_due) || 0
      : Number(aplicacao.saldo_em_aberto) || 0,
    status: derivados ? derivados.status : op.status,
    realized_profit: derivados ? derivados.realized_profit : op.realized_profit,
  };

  const registro = await garantirRegistroPagamento(api, op, e, aplicacao);
  resultado.pagamento = registro.pagamento;
  resultado.registro_criado = registro.criado;
  return { ok: true, ...resultado };
}

/* @sync:end */