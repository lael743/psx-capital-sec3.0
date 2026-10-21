import { base44 } from '@/api/base44Client';

/**
 * M7 — adaptador do navegador para o repasse ao cedente.
 *
 * A tela não decide nada: envia a intenção e o servidor autoriza, valida e
 * aplica. Se a função recusar, nada é movimentado.
 */
export async function registrarRepasseOperacao({
  operacaoId,
  bancoId,
  bancoNome,
  data,
  referencia,
  comprovanteUrl,
  forma,
  assessorToken,
}) {
  try {
    const res = await base44.functions.invoke('executeOperationDisbursement', {
      operation_id: operacaoId,
      disbursement_bank_id: bancoId,
      disbursement_bank_name: bancoNome,
      data,
      referencia,
      comprovante_url: comprovanteUrl,
      forma,
      assessor_token: assessorToken,
    });
    const dados = res?.data || {};
    if (dados.ok === false) throw new Error(dados.erro || 'Não foi possível registrar o repasse.');
    return dados;
  } catch (e) {
    const mensagem = e?.response?.data?.erro || e?.message || 'Não foi possível registrar o repasse.';
    const erro = new Error(mensagem);
    erro.status = e?.response?.status;
    throw erro;
  }
}