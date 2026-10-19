import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { asaasRequest } from '../../shared/asaas.ts';
import { secrets } from 'base44:runtime';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { operation_id, vinculo_ids, cancel_all } = await req.json();
    if (!operation_id && !vinculo_ids) {
      return Response.json({ error: 'operation_id ou vinculo_ids é obrigatório' }, { status: 400 });
    }

    const apiKey = secrets.get('ASAAS_API_KEY');

    let vinculos = [];
    if (cancel_all && operation_id) {
      const all = await base44.entities.AssinaturaVinculo.filter({ operation_id });
      vinculos = all.filter((v) => v.asaas_subscription_id && v.status === 'ativa');
    } else if (vinculo_ids && Array.isArray(vinculo_ids)) {
      for (const vid of vinculo_ids) {
        try {
          const v = await base44.entities.AssinaturaVinculo.get(vid);
          if (v && v.asaas_subscription_id && v.status === 'ativa') vinculos.push(v);
        } catch (_) { /* ignore */ }
      }
    }

    const results = [];
    for (const v of vinculos) {
      try {
        await asaasRequest(`/subscriptions/${v.asaas_subscription_id}`, { method: 'DELETE' }, apiKey);
        await base44.entities.AssinaturaVinculo.update(v.id, { status: 'cancelada', asaas_status: 'DELETED' });
        results.push({ vinculo_id: v.id, sacado: v.sacado_name, status: 'cancelled' });
      } catch (e) {
        const msg = String(e.message || '');
        if (msg.includes('404') || msg.toLowerCase().includes('not found')) {
          await base44.entities.AssinaturaVinculo.update(v.id, { status: 'cancelada', asaas_status: 'DELETED' });
          results.push({ vinculo_id: v.id, sacado: v.sacado_name, status: 'cancelled (já removida)' });
        } else {
          results.push({ vinculo_id: v.id, sacado: v.sacado_name, error: msg });
        }
      }
    }

    const cancelled = results.filter((r) => r.status).length;
    return Response.json({
      success: true,
      results,
      total_cancelled: cancelled,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});