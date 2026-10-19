import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { asaasRequest, mapAsaasStatus, buildCustomerPayload } from '../../shared/asaas.ts';
import { secrets } from 'base44:runtime';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { operation_id, vinculo_ids } = await req.json();
    if (!operation_id) {
      return Response.json({ error: 'operation_id é obrigatório' }, { status: 400 });
    }

    const operation = await base44.entities.Operation.get(operation_id);
    if (!operation) return Response.json({ error: 'Operação não encontrada' }, { status: 404 });
    if (operation.type !== 'assinatura') {
      return Response.json({ error: 'Operação não é do tipo assinatura' }, { status: 400 });
    }

    const apiKey = secrets.get('ASAAS_API_KEY');

    // Carrega vínculos da operação
    let vinculos = await base44.entities.AssinaturaVinculo.filter({ operation_id });
    if (vinculo_ids && Array.isArray(vinculo_ids) && vinculo_ids.length > 0) {
      vinculos = vinculos.filter((v) => vinculo_ids.includes(v.id));
    }

    // Apenas vínculos ativos sem subscription criada
    const pending = vinculos.filter((v) => !v.asaas_subscription_id && v.status === 'ativa');

    const numOp = operation.numero_operacao
      ? String(operation.numero_operacao).padStart(6, '0')
      : operation_id.slice(-6);

    const results = [];
    for (const v of pending) {
      // Sincroniza sacado como customer no Asaas
      let customerId = v.asaas_customer_id;
      if (!customerId && v.sacado_id) {
        try {
          const sacado = await base44.entities.Sacado.get(v.sacado_id);
          if (sacado) {
            if (sacado.asaas_customer_id) {
              customerId = sacado.asaas_customer_id;
            } else {
              const created = await asaasRequest('/customers', {
                method: 'POST',
                body: JSON.stringify(buildCustomerPayload(sacado)),
              }, apiKey);
              customerId = created.id;
              await base44.entities.Sacado.update(sacado.id, {
                asaas_customer_id: customerId,
                asaas_synced_at: new Date().toISOString().split('T')[0],
              });
            }
          }
        } catch (e) {
          results.push({ vinculo_id: v.id, sacado: v.sacado_name, error: `Falha ao sincronizar sacado: ${e.message}` });
          continue;
        }
      }
      if (!customerId) {
        results.push({ vinculo_id: v.id, sacado: v.sacado_name, error: 'Sacado sem customer_id no Asaas' });
        continue;
      }

      // Cartão requer tokenização (não suportado neste fluxo)
      if (v.billing_type === 'CREDIT_CARD') {
        results.push({
          vinculo_id: v.id,
          sacado: v.sacado_name,
          error: 'Cartão de crédito requer tokenização do cartão via Asaas.js (não configurado).',
        });
        continue;
      }

      const subPayload = {
        customer: customerId,
        billingType: v.billing_type,
        value: Number(v.valor_assinatura),
        cycle: v.ciclo,
        description: `Operação ${numOp} — Assinatura — ${v.sacado_name} — PSX Capital`,
        externalReference: `assinatura:${operation_id}:${v.id}`,
        startDate: operation.start_date,
      };

      try {
        const sub = await asaasRequest('/subscriptions', {
          method: 'POST',
          body: JSON.stringify(subPayload),
        }, apiKey);

        const updateData = {
          asaas_subscription_id: sub.id,
          asaas_customer_id: customerId,
          asaas_status: sub.status || 'ACTIVE',
          proxima_cobranca: sub.nextDueDate || '',
          status: 'ativa',
        };
        await base44.entities.AssinaturaVinculo.update(v.id, updateData);

        results.push({
          vinculo_id: v.id,
          sacado: v.sacado_name,
          subscription_id: sub.id,
          status: 'created',
          next_due_date: sub.nextDueDate || '',
        });
      } catch (e) {
        results.push({ vinculo_id: v.id, sacado: v.sacado_name, error: e.message });
      }
    }

    const created = results.filter((r) => r.subscription_id).length;
    return Response.json({
      success: true,
      results,
      total_created: created,
      total_errors: results.length - created,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});