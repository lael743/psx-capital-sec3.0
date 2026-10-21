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
 *
 * M5.2 — RECUSA NÃO É FALHA DE REDE. O servidor recusa com status 409/403 e o
 * corpo `{ ok: false, erro, etapa, bloqueios }`. O cliente HTTP transforma isso
 * em exceção, e a tela recebia apenas "Request failed with status code 409":
 * o motivo (pré-requisito faltando, etapa já alterada) se perdia. Aqui o corpo
 * da recusa é devolvido como resposta normal; erro sem corpo continua subindo.
 */
async function invocar(payload) {
  try {
    const res = await base44.functions.invoke('workflowOperacao', payload);
    return res?.data || { ok: false, erro: 'Resposta inválida do servidor.' };
  } catch (e) {
    const dados = e?.response?.data;
    if (dados && typeof dados === 'object' && (dados.erro || dados.ok === false)) {
      return { ...dados, ok: false, erro: dados.erro || 'Transição não permitida.' };
    }
    throw e;
  }
}

export async function transicionarOperacao({ operacaoId, acao, motivo, etapaObservada }) {
  return invocar({ operacaoId, acao, motivo, etapaObservada });
}

/** Retoma efeitos pendentes de uma transição já aplicada (falha parcial). */
export async function recuperarTransicao(operacaoId) {
  return invocar({ operacaoId, acao: 'recuperar' });
}