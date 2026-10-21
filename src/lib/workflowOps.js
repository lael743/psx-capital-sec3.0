import { base44 } from '@/api/base44Client';

/**
 * M5 — adaptador das transições de workflow.
 *
 * O navegador NÃO grava `etapa` por conta própria: ele pede a transição e o
 * servidor decide (autorização, pré-requisitos, CAS e histórico). Aqui só
 * traduzimos a resposta para um formato simples de usar na tela.
 */
export async function transicionarOperacao({ operacaoId, acao, motivo }) {
  const res = await base44.functions.invoke('workflowOperacao', { operacaoId, acao, motivo });
  return res?.data || { ok: false, erro: 'Resposta inválida do servidor.' };
}