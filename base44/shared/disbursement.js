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
 * ── O QUE GARANTE (e como) ─────────────────────────────────────────────────
 *
 * 1. NENHUM REPASSE DUPLICADO. A chave do evento é determinística
 *    (`repasse_cliente:<id da operação>`): a segunda execução não casa a guarda
 *    `$ne` e recebe `ja_aplicado`. Isso vale inclusive para duas tentativas
 *    simultâneas — quem aplica o saldo é uma única escrita atômica.
 *
 * 2. LANÇAMENTO 1:1 COM O SALDO. A criação do `CashFlow` é precedida por uma
 *    REIVINDICAÇÃO no documento do banco (`claimBankEvent`). Duas execuções que
 *    chegam juntas não criam dois lançamentos; e uma execução que morreu entre
 *    o saldo e o lançamento não deixa o evento preso — se a reivindicação
 *    existir e o lançamento não, o retorno diz `lancamento_pendente` em vez de
 *    inventar um segundo crédito.
 *
 * 3. A PROVA É DO SERVIDOR. O valor vem SEMPRE do documento da operação
 *    (`net_value`, com `gross_value` como legado) — nunca do corpo da
 *    requisição. A operação só é marcada com `payment_executed` por
 *    compare-and-swap (guarda `$ne: true`), então um retry não reescreve a
 *    prova com outra data, outra conta ou outra referência.
 *
 * ── O QUE ELE NÃO FAZ ──────────────────────────────────────────────────────
 *
 * Não autoriza ninguém (quem decide é `avaliarRepasse` na regra do workflow),
 * não valida token de assessor, não estorna e não mexe na etapa. Não existe
 * transação entre documentos na plataforma: se o processo morrer entre o saldo
 * e a operação, a próxima execução encontra o saldo aplicado e COMPLETA a prova
 * — jamais debita de novo.
 *
 * ── CÓPIA DUPLICADA ────────────────────────────────────────────────────────
 *
 * Existe em `src/lib/disbursement.js` (navegador/testes) e
 * `base44/shared/disbursement.js` (função de servidor). Idênticos exceto pelo
 * especificador do import do `bankLedger`; o teste M7.9 compara os bytes depois
 * de normalizar essa linha.
 */
import { applyBankDelta, claimBankEvent, chaveEvento } from './bankLedger.ts';

export const TIPO_EVENTO_REPASSE = 'repasse_cliente';

/** Chave determinística do repasse de uma operação. */
export function chaveRepasse(operationId) {
  return chaveEvento(TIPO_EVENTO_REPASSE, operationId);
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

/**
 * Registra o repasse. Idempotente por operação.
 *
 * @param {object} p
 * @param {object} p.bancoStore      store do Banco (`updateWhere`)
 * @param {object} p.cashflowStore   store do CashFlow (`filter`, `create`)
 * @param {object} p.operacaoStore   store da Operation (`updateWhere`)
 * @param {object} p.operacao        documento da operação (valor e prova)
 * @param {string} p.bancoId         conta de origem
 * @param {string} p.bancoNome
 * @param {string} p.data            data efetiva (ISO)
 * @param {string} [p.referencia]    referência da transferência
 * @param {string} [p.comprovanteUrl]
 * @param {string} [p.forma]         forma de desembolso
 * @param {string} [p.autorizadoPor] nome do assessor que autorizou
 * @param {string} [p.dono]          identificação de quem executa (reivindicação)
 * @returns {Promise<{status:string, evento:string, valor:number, lancamento_id:string|null, lancamento_pendente:boolean, operacao_atualizada:boolean, erro?:string}>}
 */
export async function registrarRepasse({
  bancoStore,
  cashflowStore,
  operacaoStore,
  operacao,
  bancoId,
  bancoNome,
  data,
  referencia = '',
  comprovanteUrl = '',
  forma = '',
  autorizadoPor = '',
  dono = '',
}) {
  const valor = valorDoRepasse(operacao);
  const evento = chaveRepasse(operacao.id);

  const efeito = await applyBankDelta({
    store: bancoStore,
    bankId: bancoId,
    delta: -valor,
    eventKey: evento,
  });

  if (efeito.status === 'sem_conta') {
    return { status: 'sem_conta', evento, valor, erro: 'Conta de origem do repasse inválida.' };
  }
  if (efeito.status === 'sem_efeito') {
    return { status: 'sem_efeito', evento, valor, erro: 'Operação sem valor líquido para repasse.' };
  }

  const existentes = await cashflowStore.filter({
    source_type: TIPO_EVENTO_REPASSE,
    source_id: operacao.id,
  });
  const lista = Array.isArray(existentes) ? existentes : (existentes && existentes.items) || [];
  let lancamento = lista[0] || null;

  if (!lancamento) {
    const reivindicou = await claimBankEvent({
      store: bancoStore,
      bankId: bancoId,
      claimKey: `claim:${evento}`,
      owner: dono || autorizadoPor || 'repasse',
    });
    if (reivindicou) {
      lancamento = await cashflowStore.create({
        type: 'saida',
        category: TIPO_EVENTO_REPASSE,
        amount: valor,
        date: data,
        description: `Repasse ao cedente ${operacao.client_name || ''} — ${bancoNome} — Op. ${numeroCurto(operacao)}${referencia ? ` — Ref: ${referencia}` : ''}`,
        operation_id: operacao.id,
        bank_id: bancoId,
        source_type: TIPO_EVENTO_REPASSE,
        source_id: operacao.id,
        method: metodoDoCaixa(forma),
      });
    }
  }

  // Prova na operação: compare-and-swap. Um retry não reescreve o que já existe.
  const atualizacao = await operacaoStore.updateWhere(
    { id: operacao.id, payment_executed: { $ne: true } },
    {
      $set: {
        payment_executed: true,
        payment_execution_date: data,
        disbursement_bank_id: bancoId,
        disbursement_bank_name: bancoNome,
        disbursement_reference: referencia || '',
        disbursement_proof_url: comprovanteUrl || '',
        status: 'repasse_concluido',
        assessor: autorizadoPor || operacao.assessor || '',
      },
    },
  );
  const operacaoAtualizada = Number((atualizacao && atualizacao.updated) || 0) > 0;

  return {
    status: efeito.status === 'aplicado' ? 'aplicado' : 'ja_aplicado',
    evento,
    valor,
    data,
    banco_id: bancoId,
    banco_nome: bancoNome,
    referencia,
    comprovante_url: comprovanteUrl,
    lancamento_id: lancamento ? lancamento.id : null,
    lancamento_pendente: !lancamento,
    operacao_atualizada: operacaoAtualizada,
  };
}