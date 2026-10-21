/**
 * I/O REAL DOS EVENTOS DE CHEQUE — extraído para ser compartilhado.
 *
 * A orquestração de compensação/estorno/resolução vive em
 * `chequeEventFlow.js` e recebe um objeto `io`. Esse `io` precisa falar com a
 * plataforma (client de serviço, normalização de página, lançamento de caixa e
 * sincronização do cronograma). Antes, esse bloco estava escrito dentro da
 * função `chequeEvento`; a baixa de título pela Central precisa exatamente do
 * MESMO `io` para chamar o MESMO núcleo — então ele passa a morar aqui, em um
 * único lugar, em vez de ser copiado para uma segunda função.
 *
 * Nada de regra financeira aqui: só transporte. Quem decide valor, estado e
 * efeito é o núcleo compartilhado.
 */
import { createChequeCashFlow } from './cashFlowHelper.ts';
import { sincronizarOperacao } from './chequeWrite.ts';

/**
 * O cliente de SERVIÇO devolve página (`{ items, next_cursor }`) em `filter`;
 * o do navegador devolve array. O núcleo financeiro foi escrito para array e
 * precisa continuar idêntico dos dois lados — a diferença é resolvida aqui.
 */
export function normalizarLista(resultado) {
  return Array.isArray(resultado) ? resultado : (resultado && resultado.items) || [];
}

/**
 * @param {object} servico  cliente `base44.asServiceRole`
 * @returns {{io: object, apiSync: object, lista: Function}}
 */
export function criarIoChequeEvento(servico) {
  const lista = normalizarLista;

  const apiSync = {
    entities: new Proxy({}, {
      get(_alvo, nome) {
        const colecao = servico.entities[nome];
        return {
          get: (id) => colecao.get(id),
          filter: async (query) => lista(await colecao.filter(query)),
          create: (doc) => colecao.create(doc),
          update: (id, patch) => colecao.update(id, patch),
          updateMany: (query, update) => colecao.updateMany(query, update),
        };
      },
    }),
  };
  // `createOperationalCashFlow` acessa `base44.asServiceRole.entities` — o
  // cliente normalizado precisa expor essa mesma superfície.
  apiSync.asServiceRole = apiSync;

  const io = {
    chequeStore: {
      updateWhere: (query, update) => servico.entities.Cheque.updateMany(query, update),
      read: (id) => servico.entities.Cheque.get(id).catch(() => null),
    },
    bancoStore: {
      updateWhere: (query, update) => servico.entities.Banco.updateMany(query, update),
      get: (id) => servico.entities.Banco.get(id).catch(() => null),
    },
    criarLancamento: (params) => createChequeCashFlow(apiSync, params),
    sincronizar: (operationId, excluir) => sincronizarOperacao(apiSync, operationId, excluir),
    lerLancamentos: async (query) => lista(await servico.entities.CashFlow.filter(query).catch(() => [])),
  };

  return { io, apiSync, lista };
}