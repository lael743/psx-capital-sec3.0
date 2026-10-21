import { base44 } from '@/api/base44Client';

/**
 * M5 — adaptador das transições de workflow.
 *
 * O navegador NÃO grava `etapa` por conta própria: ele pede a transição e o
 * servidor decide (autorização, pré-requisitos, CAS e histórico). Aqui só
 * traduzimos a resposta para um formato simples de usar na tela.
 *
 * M5.1 — `etapaObservada` acompanha o pedido: é a etapa que a TELA viu. Se o
 * servidor já não estiver nela, responde 409 em vez de avançar de novo — um
 * retry depois de resposta perdida não pula uma etapa.
 */
export async function transicionarOperacao({ operacaoId, acao, motivo, etapaObservada }) {
  const res = await base44.functions.invoke('workflowOperacao', {
    operacaoId,
    acao,
    motivo,
    etapaObservada,
  });
  return res?.data || { ok: false, erro: 'Resposta inválida do servidor.' };
}

/** Retoma efeitos pendentes de uma transição já aplicada (falha parcial). */
export async function recuperarTransicao(operacaoId) {
  const res = await base44.functions.invoke('workflowOperacao', { operacaoId, acao: 'recuperar' });
  return res?.data || { ok: false, erro: 'Resposta inválida do servidor.' };
}