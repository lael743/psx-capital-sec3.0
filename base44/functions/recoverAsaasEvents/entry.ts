import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { recoverEvento, sweepLancamentosAbandonados } from '../../shared/asaasReceiptFlow.js';
import {
  needsRecovery,
  classifyEvento,
  staleCutoff,
  STALE_SECONDS,
} from '../../shared/asaasEventJournal.js';

/**
 * FASE D1.2/D1.3 — Recuperação de eventos Asaas parcialmente processados.
 *
 * Percorre o diário (AsaasEvento) e recupera o que ficou pela metade:
 *   · `falha`              — erro transitório
 *   · `reivindicado`       — abandonado além da tolerância (processo morreu)
 *   · `em_recuperacao`     — recuperação anterior abandonada
 *
 * A recuperação NÃO presume o que já foi feito: ela OBSERVA os efeitos nas
 * próprias entidades (o marcador atômico da Operation e o asaas_event_key do
 * lançamento) e aplica somente o que falta.
 *
 * ── D1.3: exclusividade ─────────────────────────────────────────────────────
 *
 * A elegibilidade NÃO é decidida aqui. Este laço apenas pré-filtra candidatos
 * para não varrer registros inúteis; a decisão real é a reivindicação atômica
 * dentro de recoverEvento. Duas execuções simultâneas deste agendador são
 * seguras: cada evento é reivindicado por compare-and-swap e só uma vence.
 *
 * `falha_definitiva` fica FORA da recuperação automática — exige intervenção
 * manual, e é reportada separadamente para auditoria.
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
    const staleIso = staleCutoff(nowMs, STALE_SECONDS);

    const pendentes = await base44.asServiceRole.entities.AsaasEvento.filter(
      { status: { $in: ['reivindicado', 'falha', 'em_recuperacao'] } },
      { sort: 'claimed_at', limit: 200 }
    );

    const alvos = pendentes.filter((r) => needsRecovery(r, nowMs, STALE_SECONDS));
    const resultados = [];

    for (const registro of alvos) {
      try {
        resultados.push(await recoverEvento(base44, registro, nowIso, staleIso));
      } catch (e) {
        resultados.push({ event_key: registro.event_key, erro: String(e.message || e) });
      }
    }

    // D1.4 — varredura das reivindicações de extrato ABANDONADAS, que a
    // recuperação acima não alcança quando o diário não pôde ser gravado.
    // Ela libera a reivindicação e REPORTA; não cria lançamento, porque o
    // payload vivia no diário ausente e reconstruí-lo seria inventar dado
    // financeiro. É o ponto explícito de intervenção humana.
    let lancamentos_orfãos = [];
    try {
      lancamentos_orfãos = await sweepLancamentosAbandonados(base44, staleIso, 200);
    } catch (_) {
      lancamentos_orfãos = [];
    }

    // Situação após a passagem — o que ainda não pôde ser recuperado.
    const restantes = await base44.asServiceRole.entities.AsaasEvento.filter(
      { status: { $in: ['reivindicado', 'falha', 'em_recuperacao'] } },
      { limit: 200 }
    );
    const definitivas = await base44.asServiceRole.entities.AsaasEvento.filter(
      { status: 'falha_definitiva' },
      { limit: 200 }
    );

    return Response.json({
      analisados: pendentes.length,
      tentados: resultados.length,
      efetivados: resultados.filter((r) => r.recuperado).length,
      resultados,
      restantes: restantes.length,
      situacao: restantes.map((r) => ({
        event_key: r.event_key,
        estado: classifyEvento(r, nowMs, STALE_SECONDS),
        tentativas: r.attempts || 0,
        erro: r.error || '',
      })),
      // Falhas que esgotaram as tentativas: exigem intervenção manual.
      falhas_definitivas: definitivas.map((r) => ({
        event_key: r.event_key,
        tentativas: r.attempts || 0,
        erro: r.error || '',
      })),
      // D1.4 — reivindicações de extrato abandonadas sem diário: a reivindicação
      // foi liberada para uma reentrega poder recriar o lançamento, mas o caso
      // fica reportado porque pode exigir reconstrução manual.
      lancamentos_orfãos: lancamentos_orfãos.map((o) => ({
        operation_id: o.operation_id,
        event_key: o.event_key,
        claimed_at: o.claimed_at,
      })),
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});