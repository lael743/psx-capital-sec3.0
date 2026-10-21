/**
 * M7 — REPASSE AO CEDENTE: núcleo único.
 *
 * O repasse é o momento em que o dinheiro SAI da conta da PSX e vai para o
 * cedente. Ele não é um lançamento novo inventado aqui: usa exatamente o
 * mecanismo já existente no sistema —
 *
 *   saldo  → `applyBankDelta` (incremento atômico com chave de evento na MESMA
 *            escrita do documento do banco, em `bankLedger`);
 *   extrato→ um `CashFlow` `saida` com `source_type`/`source_id` do evento;
 *   prova  → `payment_executed` + data + conta + referência/comprovante na
 *            operação, gravados por compare-and-swap.
 *
 * ── MAIS DE UMA FORMA DE REPASSAR ──────────────────────────────────────────
 *
 * Um único repasse pode sair por VÁRIAS contas e formas (parte por PIX de uma
 * conta, parte por TED de outra, parte em dinheiro…). Cada linha é um evento
 * próprio (`repasse_cliente:<operação>:<índice>`): debita a sua conta, cria o
 * seu lançamento no extrato e nunca é confundida com a linha vizinha. O valor
 * TOTAL continua vindo do documento da operação — as linhas apenas o dividem.
 *
 * ── O QUE GARANTE (e como) ─────────────────────────────────────────────────
 *
 * 1. NENHUM REPASSE DUPLICADO. A chave do evento é determinística por linha:
 *    a segunda execução não casa a guarda `$ne` e recebe `ja_aplicado`.
 *
 * 2. LANÇAMENTO 1:1 COM O SALDO. A criação do `CashFlow` é precedida por uma
 *    REIVINDICAÇÃO no documento do banco (`claimBankEvent`). Duas execuções que
 *    chegam juntas não criam dois lançamentos; e uma execução que morreu entre
 *    o saldo e o lançamento não deixa o evento preso — se a reivindicação
 *    existir e o lançamento não, o retorno diz `lancamento_pendente`.
 *
 * 3. A PROVA É DO SERVIDOR. O valor vem SEMPRE do documento da operação
 *    (`net_value`, com `gross_value` como legado) — nunca do corpo da
 *    requisição. A operação só é marcada com `payment_executed` por
 *    compare-and-swap (guarda `$ne: true`).
 *
 * ── CÓPIA DUPLICADA ────────────────────────────────────────────────────────
 *
 * Existe em `src/lib/disbursement.js` (navegador/testes) e
 * `base44/shared/disbursement.js` (função de servidor). Idênticos exceto pelo
 * especificador do import do `bankLedger`; o teste M7.9 compara os bytes.
 */
import { applyBankDelta, claimBankEvent, chaveEvento } from './bankLedger.js';

export const TIPO_EVENTO_REPASSE = 'repasse_cliente';

/** Chave determinística do repasse de uma operação. */
export function chaveRepasse(operationId) {
  return chaveEvento(TIPO_EVENTO_REPASSE, operationId);
}

/**
 * Chave do evento de UMA linha do repasse. Com uma única linha a chave é a
 * chave do repasse (compatível com os registros já existentes); com várias, o
 * índice entra na chave para que cada conta/forma seja um evento próprio.
 */
export function chaveLinhaRepasse(operationId, indice, total) {
  const base = chaveRepasse(operationId);
  return Number(total) > 1 ? `${base}:${indice}` : base;
}

const numero = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** Valor do repasse: do documento da operação, sempre. */
export function valorDoRepasse(operacao = {}) {
  const liquido = operacao.net_value === undefined || operacao.net_value === null
    ? operacao.gross_value
    : operacao.net_value;
  return numero(liquido);
}

const METODO_CAIXA = Object.freeze({
  pix: 'pix',
  dinheiro: 'dinheiro',
  cheque: 'cheque',
  ted: 'transferencia',
  transferencia: 'transferencia',
});

/** Forma de desembolso da operação → método aceito pelo extrato (CashFlow). */
export function metodoDoCaixa(forma) {
  return METODO_CAIXA[String(forma || '').trim().toLowerCase()] || 'transferencia';
}

/** Rótulo curto da operação para descrições. */
export function numeroCurto(operacao = {}) {
  if (operacao.numero_operacao) return `#${String(operacao.numero_operacao).padStart(6, '0')}`;
  return `#${String(operacao.id || '').slice(-6).toUpperCase()}`;
}

/** Aceita tanto a lista de linhas quanto o pedido antigo de linha única. */
function normalizarLinhas({ linhas, bancoId, bancoNome, forma, referencia, comprovanteUrl, valor }) {
  const recebidas = (Array.isArray(linhas) ? linhas : []).filter(Boolean);
  if (recebidas.length === 0) {
    return [{ bancoId, bancoNome, valor, forma, referencia, comprovanteUrl }];
  }
  return recebidas.map((linha) => ({
    bancoId: String(linha.bancoId || linha.banco_id || ''),
    bancoNome: String(linha.bancoNome || linha.banco_nome || ''),
    valor: numero(linha.valor),
    forma: String(linha.forma || forma || ''),
    referencia: String(linha.referencia || '').trim(),
    comprovanteUrl: String(linha.comprovanteUrl || linha.comprovante_url || '').trim(),
  }));
}

/**
 * Registra o repasse ao cedente — uma ou várias formas de pagamento.
 * Idempotente por linha e por operação.
 */
export async function registrarRepasse({
  bancoStore,
  cashflowStore,
  operacaoStore,
  operacao,
  linhas = [],
  bancoId = '',
  bancoNome = '',
  data,
  referencia = '',
  comprovanteUrl = '',
  forma = '',
  autorizadoPor = '',
  dono = '',
}) {
  const alvo = valorDoRepasse(operacao);
  const lista = normalizarLinhas({ linhas, bancoId, bancoNome, forma, referencia, comprovanteUrl, valor: alvo });
  const total = lista.reduce((soma, linha) => soma + numero(linha.valor), 0);
  const aplicados = [];

  for (let i = 0; i < lista.length; i += 1) {
    const linha = lista[i];
    const evento = chaveLinhaRepasse(operacao.id, i, lista.length);
    const valor = numero(linha.valor);
    const parcial = { ...aplicados };

    if (!linha.bancoId) {
      return { status: 'sem_conta', evento, valor: total, linhas: parcial, erro: 'Conta de origem do repasse inválida.' };
    }
    if (!(valor > 0)) {
      return { status: 'sem_efeito', evento, valor: total, linhas: parcial, erro: 'Forma de repasse com valor inválido.' };
    }

    const efeito = await applyBankDelta({
      store: bancoStore,
      bankId: linha.bancoId,
      delta: -valor,
      eventKey: evento,
    });
    if (efeito.status === 'sem_conta') {
      return { status: 'sem_conta', evento, valor: total, linhas: parcial, erro: 'Conta de origem do repasse inválida.' };
    }
    if (efeito.status === 'sem_efeito') {
      return { status: 'sem_efeito', evento, valor: total, linhas: parcial, erro: 'Forma de repasse com valor inválido.' };
    }

    const sourceId = lista.length > 1 ? `${operacao.id}:${i}` : operacao.id;
    const existentes = await cashflowStore.filter({
      source_type: TIPO_EVENTO_REPASSE,
      source_id: sourceId,
    });
    const encontrados = Array.isArray(existentes) ? existentes : (existentes && existentes.items) || [];
    let lancamento = encontrados[0] || null;

    if (!lancamento) {
      const reivindicou = await claimBankEvent({
        store: bancoStore,
        bankId: linha.bancoId,
        claimKey: `claim:${evento}`,
        owner: dono || autorizadoPor || 'repasse',
      });
      if (reivindicou) {
        lancamento = await cashflowStore.create({
          type: 'saida',
          category: TIPO_EVENTO_REPASSE,
          amount: valor,
          date: data,
          description: `Repasse ao cedente ${operacao.client_name || ''} — ${linha.bancoNome || 'conta'} — Op. ${numeroCurto(operacao)}${linha.referencia ? ` — Ref: ${linha.referencia}` : ''}`,
          operation_id: operacao.id,
          bank_id: linha.bancoId,
          source_type: TIPO_EVENTO_REPASSE,
          source_id: sourceId,
          method: metodoDoCaixa(linha.forma),
        });
      }
    }

    aplicados.push({
      evento,
      banco_id: linha.bancoId,
      banco_nome: linha.bancoNome || '',
      valor,
      forma: linha.forma || '',
      referencia: linha.referencia || '',
      comprovante_url: linha.comprovanteUrl || '',
      lancamento_id: lancamento ? lancamento.id : null,
      aplicado: efeito.status === 'aplicado',
    });
  }

  const principal = aplicados[0] || {};
  const lancamentoPendente = aplicados.some((linha) => !linha.lancamento_id);

  // Prova na operação: compare-and-swap. Um retry não reescreve o que já existe.
  const atualizacao = await operacaoStore.updateWhere(
    { id: operacao.id, payment_executed: { $ne: true } },
    {
      $set: {
        payment_executed: true,
        payment_execution_date: data,
        disbursement_bank_id: principal.banco_id || '',
        disbursement_bank_name: principal.banco_nome || '',
        disbursement_method: principal.forma || operacao.disbursement_method || '',
        disbursement_reference: principal.referencia || '',
        disbursement_proof_url: principal.comprovante_url || '',
        status: 'repasse_concluido',
        assessor: autorizadoPor || operacao.assessor || '',
      },
    },
  );
  const operacaoAtualizada = Number((atualizacao && atualizacao.updated) || 0) > 0;
  const algumAplicado = aplicados.some((linha) => linha.aplicado);

  return {
    status: algumAplicado ? 'aplicado' : 'ja_aplicado',
    evento: chaveRepasse(operacao.id),
    valor: total,
    data,
    linhas: aplicados,
    lancamentos: aplicados.map((linha) => linha.lancamento_id).filter(Boolean),
    lancamento_id: principal.lancamento_id || null,
    lancamento_pendente: lancamentoPendente,
    banco_id: principal.banco_id || '',
    banco_nome: principal.banco_nome || '',
    referencia: principal.referencia || '',
    comprovante_url: principal.comprovante_url || '',
    operacao_atualizada: operacaoAtualizada,
  };
}