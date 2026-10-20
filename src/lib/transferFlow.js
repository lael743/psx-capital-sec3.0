/**
 * D4.1 — ADAPTADOR DO FRONTEND PARA A FUNÇÃO DE SERVIDOR.
 *
 * A movimentação NÃO acontece mais neste lado. Aqui só se monta o pedido e se
 * lê a resposta da função `transferenciaBancaria`, que autentica pelo token,
 * confere o papel e roda o motor com privilégio de serviço.
 *
 * ── UM ÚNICO CAMINHO ───────────────────────────────────────────────────────
 *
 * Não existe caminho alternativo. Se o servidor recusar, falhar ou estiver
 * indisponível, NADA é movimentado — não há fallback que volte a escrever saldo
 * pelo navegador. Um fallback silencioso seria pior que a falha: ele contornaria
 * exatamente a autorização que esta fase instalou, e só apareceria no pior
 * momento.
 *
 * O navegador envia apenas o que pode escolher: origem, destino, valor, data,
 * descrição e o identificador do pedido. Identidade e papel saem do token no
 * servidor; nomes de conta e saldos são lidos do banco de dados lá.
 */
import { base44 } from '@/api/base44Client';

async function chamar(payload) {
  let resposta;
  try {
    resposta = await base44.functions.invoke('transferenciaBancaria', payload);
  } catch (e) {
    // Erros do servidor chegam como HTTP 403/400: a mensagem útil está no corpo.
    const doServidor = e && e.response && e.response.data && e.response.data.erro;
    throw new Error(doServidor || (e && e.message) || 'Não foi possível falar com o servidor.');
  }

  const dados = (resposta && resposta.data) || {};
  if (dados.ok === false) throw new Error(dados.erro || 'Operação recusada pelo servidor.');
  return dados;
}

export const executarTransferencia = (p) => chamar({
  acao: 'transferir',
  transferId: p.transferId,
  fromBankId: p.fromBank && p.fromBank.id,
  toBankId: p.toBank && p.toBank.id,
  amount: p.amount,
  data: p.date,
  descricao: p.description,
});

export const estornarTransferencia = (p) => chamar({
  acao: 'estornar',
  transferId: p.transferId,
  data: p.date,
  descricao: p.description,
});

export const recuperarTransferencia = (p) => chamar({
  acao: 'recuperar',
  transferId: p.transferId,
  data: p.date,
});

export const inspecionarTransferencia = (p) => chamar({
  acao: 'inspecionar',
  transferId: p.transferId,
});

export const recuperarLancamentosOrfaos = (p) => chamar({
  acao: 'liberar_reivindicacao',
  transferId: p.transferId,
  confirmar: Boolean(p.confirmar),
  forcar: Boolean(p.forcar),
});

export { novoTransferId } from '@/lib/bankLedger';