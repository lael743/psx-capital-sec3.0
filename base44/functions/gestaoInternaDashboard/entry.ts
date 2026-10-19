import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';

const OPEN_STATUS = ['a_vencer', 'vencido', 'parcialmente_pago'];

/**
 * Percorre todas as páginas de uma consulta (paginação por cursor).
 * Os totais do painel são calculados aqui no servidor — o navegador
 * nunca recebe a coleção inteira.
 */
async function fetchAll(client: any, entity: string, query: any, opts: any = {}) {
  const out: any[] = [];
  let cursor: string | null = null;
  for (let i = 0; i < 24; i++) {
    const page = await client.entities[entity].filter(query, {
      limit: 500,
      ...(cursor ? { cursor } : {}),
      ...opts,
    });
    const items = (page && page.items) || [];
    out.push(...items);
    if (!page || !page.has_more || !page.next_cursor) break;
    cursor = page.next_cursor;
  }
  return out;
}

function sum(rows: any[], field: string) {
  return Math.round(rows.reduce((s, r) => s + (Number(r[field]) || 0), 0) * 100) / 100;
}

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    let body: any = {};
    try { body = await req.json(); } catch (_) { body = {}; }
    body = body || {};

    const periodoTxt = String(body.periodo || new Date().toISOString().slice(0, 7));
    const categoriaId = body.categoria_id || '';
    const contaId = body.conta_id || '';

    const [ano, mes] = periodoTxt.split('-').map(Number);
    const inicio = `${periodoTxt}-01`;
    const fim = new Date(Date.UTC(ano, mes, 1)).toISOString().slice(0, 10);
    const hoje = new Date().toISOString().slice(0, 10);

    // Filtro por conta: aplica no lançamento (conta utilizada ou prevista)
    const obBase: any = {};
    if (categoriaId) obBase.categoria_id = categoriaId;
    if (contaId) {
      const lancs = await fetchAll(base44, 'LancamentoInterno', { conta_id: contaId });
      obBase.lancamento_id = { $in: lancs.map((l: any) => l.id) };
    }

    // Parcelas em aberto (todas)
    const abertas = await fetchAll(base44, 'ObrigacaoInterna', { ...obBase, status: { $in: OPEN_STATUS } });

    const totalPendente = sum(abertas, 'saldo');
    const vencidas = abertas.filter((o: any) => o.vencimento && o.vencimento < hoje);
    const totalVencido = sum(vencidas, 'saldo');
    const parceladas = abertas.filter((o: any) => (Number(o.total_parcelas) || 1) > 1);
    const totalParceladoAberto = sum(parceladas, 'saldo');

    // Despesas do mês (competência por vencimento)
    const obMes = await fetchAll(base44, 'ObrigacaoInterna', { ...obBase, vencimento: { $gte: inicio, $lt: fim } });
    const doMes = obMes.filter((o: any) => o.status !== 'cancelado');
    const totalDespesasMes = sum(doMes, 'valor');

    // Pagamentos do mês
    const pagsMes = await fetchAll(base44, 'PagamentoInterno', {
      data_pagamento: { $gte: inicio, $lt: fim },
      estornado: false,
    });
    const totalPagoMes = sum(pagsMes, 'valor_pago');

    // Patrimônio
    const bens = await fetchAll(base44, 'PatrimonioInterno', categoriaId ? { categoria_id: categoriaId } : {});
    const valorAquisicao = sum(bens, 'valor_total');
    const bensAtivos = bens.filter((b: any) => b.status === 'ativo').length;

    // Próximos vencimentos
    const proximos = abertas
      .filter((o: any) => o.vencimento && o.vencimento >= hoje)
      .sort((a: any, b: any) => String(a.vencimento).localeCompare(String(b.vencimento)))
      .slice(0, 8)
      .map((o: any) => ({
        id: o.id,
        descricao: o.descricao,
        categoria_nome: o.categoria_nome || '',
        valor: o.saldo != null ? o.saldo : o.valor,
        vencimento: o.vencimento,
        numero_parcela: o.numero_parcela,
        total_parcelas: o.total_parcelas,
      }));

    // Últimos pagamentos
    const pagQuery: any = {};
    if (contaId) pagQuery.conta_id = contaId;
    const pagPage = await base44.entities.PagamentoInterno.filter(pagQuery, { limit: 8, sort: '-data_pagamento' });
    const ultimosPagamentos = ((pagPage && pagPage.items) || []).map((p: any) => ({
      id: p.id,
      descricao: p.descricao || '',
      data_pagamento: p.data_pagamento,
      valor_pago: p.valor_pago,
      conta_nome: p.conta_nome || '',
      forma_pagamento: p.forma_pagamento || '',
      estornado: !!p.estornado,
    }));

    return Response.json({
      periodo: periodoTxt,
      inicio,
      fim,
      total_despesas_mes: totalDespesasMes,
      total_pago_mes: totalPagoMes,
      total_pendente: totalPendente,
      total_vencido: totalVencido,
      qtd_pendentes: abertas.length,
      qtd_vencidas: vencidas.length,
      total_parcelado_aberto: totalParceladoAberto,
      qtd_parceladas_abertas: parceladas.length,
      patrimonio_aquisicao: valorAquisicao,
      bens_ativos: bensAtivos,
      bens_total: bens.length,
      proximos_vencimentos: proximos,
      ultimos_pagamentos: ultimosPagamentos,
    });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}