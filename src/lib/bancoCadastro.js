/**
 * M6.3 — CADASTRO ≠ SALDO.
 *
 * Até a Fase 1 o formulário de banco montava o payload espalhando o estado do
 * formulário inteiro, `current_balance` incluído. Editar o nome de uma conta
 * reenviava o saldo lido no carregamento da página: qualquer evento aplicado
 * entre a leitura e o clique era sobrescrito, sem chave de evento e sem
 * rastro. O saldo passou a ter UM caminho de escrita (ajuste de saldo no
 * servidor, com chave de evento); o formulário só grava cadastro.
 *
 * Regras:
 *  · EDIÇÃO — devolve apenas campos cadastrais + `id`. NUNCA `current_balance`
 *    nem `initial_balance`: saldo não se altera por formulário.
 *  · CRIAÇÃO — o saldo inicial é o único momento em que o saldo nasce com a
 *    conta; `current_balance` recebe exatamente esse valor. Ajustes posteriores
 *    são eventos, não edições.
 *
 * Não preenche `ledger_start_date`: a âncora do livro-caixa é informação
 * validada, nunca inferida da criação (ver entidade Banco).
 */

/** Campos que pertencem ao cadastro da conta. Saldo não está nesta lista. */
export const CAMPOS_CADASTRAIS = Object.freeze([
  'name',
  'bank_code',
  'agency',
  'account',
  'account_type',
  'pix_key',
  'is_default_repasse',
  'is_default_lucro',
  'color',
  'notes',
  'active',
]);

function numero(valor) {
  const n = parseFloat(valor);
  return Number.isFinite(n) ? n : 0;
}

/**
 * @param {Object} p
 * @param {Object} p.form      estado do formulário (campos cadastrais + initial_balance)
 * @param {Object|null} p.existente  conta sendo editada (null = criação)
 * @returns {Object} payload pronto para `Banco.create` / `Banco.update`
 */
export function montarPayloadCadastro({ form = {}, existente = null } = {}) {
  const cadastro = {};
  for (const campo of CAMPOS_CADASTRAIS) {
    if (Object.prototype.hasOwnProperty.call(form, campo)) cadastro[campo] = form[campo];
  }

  if (existente && existente.id) {
    return { id: existente.id, ...cadastro };
  }

  const saldoInicial = numero(form.initial_balance);
  return { ...cadastro, initial_balance: saldoInicial, current_balance: saldoInicial };
}