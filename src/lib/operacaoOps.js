import { base44 } from '@/api/base44Client';

/**
 * M5.1 — adaptador das ESCRITAS de operação.
 *
 * A entidade Operation não aceita mais escrita direta do navegador (RLS
 * fechada). Toda edição passa por `operacaoEditar`, que confere identidade,
 * perfil e BLOQUEIA os campos de workflow (`etapa`, `status`) e de repasse
 * (`payment_executed`, `payment_execution_date`) — esses só mudam pela
 * autoridade própria (workflowOperacao / executeOperationDisbursement).
 */
async function chamar(payload) {
  const res = await base44.functions.invoke('operacaoEditar', payload);
  const dados = res?.data || {};
  if (dados.ok === false) throw new Error(dados.erro || 'Não foi possível salvar a operação.');
  return dados;
}

/** Edição de campos comerciais. `onde` aplica guarda de concorrência (ex.: amount_paid). */
export async function editarOperacaoCampos(operacaoId, campos, onde) {
  const d = await chamar({ acao: 'editar', operacaoId, campos, onde });
  return d.campos;
}

/** Criação de operação: etapa e status iniciais são definidos pelo servidor. */
export async function criarOperacaoViaServidor(campos) {
  const d = await chamar({ acao: 'criar', campos });
  return d.operacao;
}

/** Confirmação / remoção da assinatura do contrato (com o status derivado no servidor). */
export async function registrarContratoAssinado(operacaoId, contrato) {
  const d = await chamar({ acao: 'contrato', operacaoId, contrato });
  return d.operacao;
}