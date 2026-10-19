import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { asaasRequest, buildCustomerPayload } from '../../shared/asaas.ts';
import { secrets } from 'base44:runtime';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { sacado_id } = await req.json();
    if (!sacado_id) return Response.json({ error: 'sacado_id é obrigatório' }, { status: 400 });

    const sacado = await base44.entities.Sacado.get(sacado_id);
    if (!sacado) return Response.json({ error: 'Sacado não encontrado' }, { status: 404 });

    const apiKey = secrets.get('ASAAS_API_KEY');
    const payload = buildCustomerPayload(sacado);
    let customerId = sacado.asaas_customer_id;

    if (customerId) {
      await asaasRequest(`/customers/${customerId}`, {
        method: 'POST',
        body: JSON.stringify(payload),
      }, apiKey);
    } else {
      const created = await asaasRequest('/customers', {
        method: 'POST',
        body: JSON.stringify(payload),
      }, apiKey);
      customerId = created.id;
    }

    const today = new Date().toISOString().split('T')[0];
    await base44.entities.Sacado.update(sacado_id, {
      asaas_customer_id: customerId,
      asaas_synced_at: today,
    });

    return Response.json({ success: true, asaas_customer_id: customerId });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});