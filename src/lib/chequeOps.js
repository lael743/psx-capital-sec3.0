/**
 * M1 — ADAPTADOR DO FRONTEND PARA A FUNÇÃO DE SERVIDOR `chequeEvento`.
 *
 * A compensação e o estorno NÃO acontecem mais neste lado. Antes da M1 este
 * arquivo orquestrava as escritas com o cliente do navegador — bastava chamar
 * o SDK direto para creditar saldo sem passar por tela nenhuma. Agora aqui só
 * se monta o pedido e se lê a resposta da função, que autentica pelo token,
 * confere o papel e roda a orquestração com privilégio de serviço.
 *
 * ── UM ÚNICO CAMINHO ───────────────────────────────────────────────────────
 * Não há fallback que volte a escrever pelo navegador. Se o servidor recusar
 * ou falhar, NADA é movimentado. A orquestração real vive em
 * `base44/shared/chequeEventFlow.js` (cópia testada em src/lib/chequeEventFlow.js).
 *
 * ── CONTRATO PRESERVADO ────────────────────────────────────────────────────
 * As funções devolvem o mesmo objeto de antes: `{ status, motivo?, claim? }`.
 * Recusas SEM efeito (estado já alterado, estorno sem crédito comprovado)
 * chegam como `status: 'nao_aplicado'` com HTTP 200 — exatamente como o
 * chamador atual já trata. Erros de autorização/validação viram exceção.
 */
import { base44 } from '@/api/base44Client';

async function chamar(payload) {
  let resposta;
  try {
    resposta = await base44.functions.invoke('chequeEvento', payload);
  } catch (e) {
    const doServidor = e && e.response && e.response.data && e.response.data.erro;
    throw new Error(doServidor || (e && e.message) || 'Não foi possível falar com o servidor.');
  }
  const dados = (resposta && resposta.data) || {};
  if (dados.ok === false) throw new Error(dados.erro || 'Operação recusada pelo servidor.');
  return dados.resultado || {};
}

/** Compensa um cheque. Idempotente no servidor. */
export const compensateCheque = ({ cheque, bankId, date }) => chamar({
  acao: 'compensar',
  chequeId: cheque.id,
  bankId,
  data: date,
});

/** Estorna a compensação. Exige evidência do crédito original no servidor. */
export const revertChequeCompensation = ({ cheque, bankId, date }) => chamar({
  acao: 'estornar',
  chequeId: cheque.id,
  bankId,
  data: date,
});

/** Recria o lançamento de caixa ausente — NUNCA recredita saldo. */
export const completeChequeLedger = (cheque) => chamar({
  acao: 'recuperar_lancamento',
  chequeId: cheque.id,
});

/** Diagnóstico somente leitura. */
export const inspecionarCheque = (cheque) => chamar({
  acao: 'inspecionar',
  chequeId: cheque.id,
});

/* ────────────────────────────────────────────────────────────────────────────
 * M2 — RESOLUÇÃO DO CHEQUE DEVOLVIDO
 *
 * Mesmo contrato da M1: aqui só se monta o pedido. Taxa, valor, conta, papel e
 * efeito financeiro são decididos pelo servidor.
 * ──────────────────────────────────────────────────────────────────────────── */

/** Resolve o cheque devolvido: novo_cheque | prorrogacao | pagamento. */
export const resolverChequeDevolvido = ({ cheque, ...dados }) => chamar({
  acao: 'resolver',
  chequeId: cheque.id,
  ...dados,
});

/** Recebe a taxa cobrada SEPARADAMENTE da obrigação. */
export const receberTaxaDevolucao = ({ cheque, ...dados }) => chamar({
  acao: 'receber_taxa',
  chequeId: cheque.id,
  ...dados,
});

/** Registra a entrega física do cheque. Não quita a dívida. */
export const devolverChequeFisicamente = ({ cheque, ...dados }) => chamar({
  acao: 'devolver_fisica',
  chequeId: cheque.id,
  ...dados,
});

/** Estorna a resolução paga. Exige evidência do recebimento original. */
export const estornarResolucao = ({ cheque, ...dados }) => chamar({
  acao: 'estornar_resolucao',
  chequeId: cheque.id,
  ...dados,
});

/** Conclui somente etapas comprovadamente pendentes. Nunca recredita saldo. */
export const recuperarResolucao = (cheque) => chamar({
  acao: 'recuperar_resolucao',
  chequeId: cheque.id,
});

/** Diagnóstico somente leitura da resolução. */
export const inspecionarResolucao = (cheque) => chamar({
  acao: 'inspecionar_resolucao',
  chequeId: cheque.id,
});

/** M2.1 — retoma somente etapas comprovadamente pendentes da taxa. */
export const recuperarTaxaDevolucao = (cheque) => chamar({
  acao: 'recuperar_taxa',
  chequeId: cheque.id,
});