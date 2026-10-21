export const PRODUTO_LABEL = {
  cheque: 'Cheque',
  boleto: 'Duplicata',
  capital_desagio: 'Capital + Deságio',
  emprestimo: 'Empréstimo',
  assinatura: 'Assinatura',
};

/** Rótulo do produto da operação, com recuo para o tipo quando não há produto. */
export function labelProduto(operacao) {
  return PRODUTO_LABEL[operacao?.produto] || PRODUTO_LABEL[operacao?.type] || 'Operação';
}