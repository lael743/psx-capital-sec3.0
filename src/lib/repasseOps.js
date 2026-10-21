import { base44 } from '@/api/base44Client';

/**
 * M7 — adaptador do navegador para o repasse ao cedente.
 *
 * A tela não decide nada: envia a intenção (uma ou várias formas de repasse) e
 * o servidor autoriza, valida a soma contra o valor líquido da operação e
 * aplica. Se a função recusar, nada é movimentado.
 */
export async function registrarRepasseOperacao({ operacaoId, data, linhas, assessorToken }) {
  try {
    const res = await base44.functions.invoke('executeOperationDisbursement', {
      operation_id: operacaoId,
      data,
      assessor_token: assessorToken,
      linhas: (linhas || []).map((linha) => ({
        banco_id: linha.bancoId,
        forma: linha.forma,
        valor: Number(linha.valor) || 0,
        referencia: linha.referencia,
        comprovante_url: linha.comprovante,
      })),
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