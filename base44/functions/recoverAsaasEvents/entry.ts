import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { recoverEvento } from '../../shared/asaasReceiptFlow.js';
import { needsRecovery, classifyEvento, STALE_SECONDS } from '../../shared/asaasEventJournal.js';

/**
 * FASE D1.2 — Recuperação de eventos Asaas parcialmente processados.
 *
 * Percorre o diário (AsaasEvento) e recupera o que ficou pela metade:
 *   · `falha`           — erro durante a aplicação
 *   · `reivindicado`    — travado além da tolerância (processo morreu no meio)
 *
 * A recuperação NÃO presume o que já foi feito: ela OBSERVA os efeitos nas
 * próprias entidades (o marcador atômico da Operation e o asaas_event_key do
 * lançamento) e aplica somente o que falta. Por isso é seguro rodar quantas
 * vezes for necessário — nunca duplica valor nem lançamento.
 *
 * Restrita a administradores: mexe em dados financeiros.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const user = await base44.auth.me().catch(() => null);
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Apenas administradores podem executar a recuperação.' }, { status: 403 });
    }

    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();

    const pendentes = await base44.asServiceRole.entities.AsaasEvento.filter(
      { status: { $in: ['reivindicado', 'falha'] } },
      { sort: 'claimed_at', limit: 200 }
    );

    const alvos = pendentes.filter((r) => needsRecovery(r, nowMs, STALE_SECONDS));
    const resultados = [];

    for (const registro of alvos) {
      try {
        resultados.push(await recoverEvento(base44, registro, nowIso));
      } catch (e) {
        resultados.push({ event_key: registro.event_key, erro: String(e.message || e) });
      }
    }

    // Situação após a passagem — o que ainda não pôde ser recuperado.
    const restantes = await base44.asServiceRole.entities.AsaasEvento.filter(
      { status: { $in: ['reivindicado', 'falha'] } },
      { limit: 200 }
    );

    return Response.json({
      analisados: pendentes.length,
      recuperados: resultados.length,
      resultados,
      restantes: restantes.length,
      situacao: restantes.map((r) => ({
        event_key: r.event_key,
        estado: classifyEvento(r, nowMs, STALE_SECONDS),
        erro: r.error || '',
      })),
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});