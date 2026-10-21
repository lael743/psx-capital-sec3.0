/**
 * M8 — LEITURA DA ANÁLISE DE CRÉDITO DO CEDENTE.
 *
 * Função pura: recebe o cadastro, as OUTRAS operações do cedente e os títulos
 * já existentes e devolve os números da Etapa 2 (Análise). Não escreve nada e
 * não decide transição — a autorização continua na regra do workflow.
 *
 * Pontualidade vem de evidência gravada, não de opinião: cada título
 * COMPENSADO tem `compensated_at` (data real) e `compensation_date`
 * (vencimento). A diferença em dias é o atraso daquele título.
 */

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

function paraData(iso) {
  if (!iso) return null;
  const d = new Date(`${String(iso).slice(0, 10)}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

const diasEntre = (a, b) => Math.round((a.getTime() - b.getTime()) / 86400000);

export const ROTULO_PONTUALIDADE = {
  antecipado: 'Paga com antecedência',
  no_prazo: 'Paga no prazo',
  atrasado: 'Paga em atraso',
  sem_historico: 'Sem histórico de pagamento',
};

/**
 * @param {object} dados
 * @param {object} dados.cliente           cadastro do cedente
 * @param {Array}  [dados.operacoes]       OUTRAS operações do cedente (sem a atual)
 * @param {Array}  [dados.titulos]         títulos do cedente (Cheque)
 * @param {string} [dados.hoje]            data de referência (ISO)
 */
export function analiseCredito({ cliente, operacoes = [], titulos = [], hoje }) {
  const limite = num(cliente?.credit_limit);

  const emAberto = (operacoes || []).filter((o) => o
    && o.status !== 'quitado'
    && !['rejeitada', 'rascunho', 'finalizada'].includes(o.etapa || 'nova'));
  const utilizado = emAberto.reduce(
    (s, o) => s + num(o.balance_due ?? (num(o.total_receivable) - num(o.amount_paid))),
    0,
  );
  const disponivel = limite > 0 ? Math.max(0, limite - utilizado) : null;

  const base = paraData(hoje);
  const vencidos = (titulos || []).filter((t) => {
    if (!t || t.status !== 'pendente') return false;
    const venc = paraData(t.compensation_date);
    return Boolean(venc && base && venc < base);
  });
  const pendencias = {
    quantidade: vencidos.length,
    valor: vencidos.reduce((s, t) => s + num(t.valor_face || t.value), 0),
    operacoesEmAtraso: emAberto.filter((o) => o.status === 'atrasado' || o.status === 'inadimplente').length,
  };

  const atrasos = (titulos || [])
    .filter((t) => t && t.status === 'compensado' && t.compensated_at && t.compensation_date)
    .map((t) => diasEntre(paraData(t.compensated_at), paraData(t.compensation_date)))
    .filter((d) => Number.isFinite(d));

  const antecipados = atrasos.filter((d) => d < 0).length;
  const noPrazo = atrasos.filter((d) => d === 0).length;
  const atrasadosCount = atrasos.filter((d) => d > 0).length;
  const mediaDias = atrasos.length
    ? Math.round((atrasos.reduce((s, d) => s + d, 0) / atrasos.length) * 10) / 10
    : 0;

  let classificacao = 'sem_historico';
  if (atrasos.length > 0) {
    if (mediaDias < -0.5) classificacao = 'antecipado';
    else if (mediaDias > 0.5) classificacao = 'atrasado';
    else classificacao = 'no_prazo';
  }

  return {
    limite,
    utilizado,
    disponivel,
    pendencias,
    pontualidade: {
      classificacao,
      rotulo: ROTULO_PONTUALIDADE[classificacao],
      mediaDias,
      amostra: atrasos.length,
      antecipados,
      noPrazo,
      atrasados: atrasadosCount,
    },
  };
}