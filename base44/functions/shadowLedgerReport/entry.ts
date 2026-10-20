/**
 * RELATÓRIO DO LIVRO-CAIXA EM MODO SOMBRA (Fase D2).
 *
 * SOMENTE LEITURA. Não grava um único registro, não altera current_balance,
 * não corrige divergência, não migra saldo.
 *
 * Admin-only: o relatório expõe saldos e divergências de todas as contas.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import { analisarDivergencias } from '../../shared/ledgerShadow.ts';

/** Lê todas as páginas de uma entidade (sem carregar o dataset de uma vez). */
async function lerTudo(entidade) {
  const out = [];
  let cursor;
  for (;;) {
    const page = await entidade.filter({}, { limit: 500, cursor });
    out.push(...(page.items || []));
    if (!page.has_more) break;
    cursor = page.next_cursor;
  }
  return out;
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const dataBase = body.data_base || new Date().toISOString().slice(0, 10);

    const [bancos, lancamentos] = await Promise.all([
      lerTudo(base44.asServiceRole.entities.Banco),
      lerTudo(base44.asServiceRole.entities.CashFlow),
    ]);

    const relatorio = analisarDivergencias({ bancos, lancamentos, dataBase });

    return Response.json({
      ...relatorio,
      lido_em: new Date().toISOString(),
      solicitado_por: user.email,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}