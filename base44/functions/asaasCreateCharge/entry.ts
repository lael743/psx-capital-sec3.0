import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { asaasRequest, mapAsaasStatus, buildCustomerPayload } from '../../shared/asaas.ts';
import { secrets } from 'base44:runtime';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { operation_id, billing_type, generate_all_parcels, parcela_index } = await req.json();
    if (!operation_id || !billing_type) {
      return Response.json({ error: 'operation_id e billing_type são obrigatórios' }, { status: 400 });
    }
    if (!['PIX', 'BOLETO'].includes(billing_type)) {
      return Response.json({ error: 'billing_type deve ser PIX ou BOLETO' }, { status: 400 });
    }

    const operation = await base44.entities.Operation.get(operation_id);
    if (!operation) return Response.json({ error: 'Operação não encontrada' }, { status: 404 });
    if (!operation.sacado_id) return Response.json({ error: 'Operação sem sacado vinculado' }, { status: 400 });

    const sacado = await base44.entities.Sacado.get(operation.sacado_id);
    if (!sacado) return Response.json({ error: 'Sacado não encontrado' }, { status: 404 });

    const apiKey = secrets.get('ASAAS_API_KEY');

    // Auto-sync sacado to Asaas if not yet synced
    let customerId = sacado.asaas_customer_id;
    if (!customerId) {
      const payload = buildCustomerPayload(sacado);
      const created = await asaasRequest('/customers', {
        method: 'POST',
        body: JSON.stringify(payload),
      }, apiKey);
      customerId = created.id;
      const today = new Date().toISOString().split('T')[0];
      await base44.entities.Sacado.update(sacado.id, {
        asaas_customer_id: customerId,
        asaas_synced_at: today,
      });
    }

    const numOp = operation.numero_operacao
      ? String(operation.numero_operacao).padStart(6, '0')
      : operation_id.slice(-6);

    const schedule = Array.isArray(operation.installment_schedule) ? operation.installment_schedule : [];

    // Single-parcela regeneration mode: regenerate only the specified parcela
    if (parcela_index !== undefined && parcela_index !== null && schedule.length > 0) {
      const updatedSchedule = [...schedule];
      const idx = Number(parcela_index);
      const inst = updatedSchedule[idx];
      if (!inst) return Response.json({ error: 'Parcela não encontrada' }, { status: 404 });
      if (inst.paid) return Response.json({ error: 'Parcela já paga não pode ser regerada' }, { status: 400 });

      // If there is an existing active charge, cancel it first
      if (inst.asaas_payment_id) {
        try {
          await asaasRequest(`/payments/${inst.asaas_payment_id}`, { method: 'DELETE' }, apiKey);
        } catch (e) {
          const msg = String(e.message || '');
          if (!msg.includes('404') && !msg.toLowerCase().includes('not found')) throw e;
        }
      }

      const chargePayload = {
        customer: customerId,
        billingType: billing_type,
        value: Number(inst.value),
        dueDate: inst.due_date,
        description: `Operação ${numOp} — Parcela ${inst.number}/${schedule.length} — PSX Capital`,
        externalReference: `operacao_parcela:${operation_id}:${idx}`,
      };

      const charge = await asaasRequest('/payments', {
        method: 'POST',
        body: JSON.stringify(chargePayload),
      }, apiKey);

      let pixQrCode = '';
      if (billing_type === 'PIX' && charge.id) {
        try {
          const qr = await asaasRequest(`/payments/${charge.id}/pixQrCode`, {}, apiKey);
          pixQrCode = qr.payload || qr.encodedImage || '';
        } catch (_) { /* non-critical */ }
      }

      updatedSchedule[idx] = {
        ...inst,
        asaas_payment_id: charge.id,
        asaas_billing_type: billing_type,
        asaas_invoice_url: charge.invoiceUrl || '',
        asaas_pix_qrcode: pixQrCode,
        asaas_boleto_line: charge.bankSlipCode || charge.boletoLine || '',
        asaas_payment_status: mapAsaasStatus(charge.status),
      };

      await base44.entities.Operation.update(operation_id, {
        installment_schedule: updatedSchedule,
        asaas_billing_type: billing_type,
      });

      return Response.json({
        success: true,
        billing_type,
        charges: [{ parcela: inst.number, payment_id: charge.id, value: Number(inst.value), due_date: inst.due_date }],
        total_charges: 1,
      });
    }

    // Per-parcela mode: one charge per parcela mirroring value + due_date
    if (generate_all_parcels && schedule.length > 0) {
      const updatedSchedule = [...schedule];
      const charges = [];

      for (let i = 0; i < updatedSchedule.length; i++) {
        const inst = updatedSchedule[i];
        // Skip parcelas already with a charge or already paid
        if (inst.asaas_payment_id || inst.paid) continue;

        const chargePayload = {
          customer: customerId,
          billingType: billing_type,
          value: Number(inst.value),
          dueDate: inst.due_date,
          description: `Operação ${numOp} — Parcela ${inst.number}/${schedule.length} — PSX Capital`,
          externalReference: `operacao_parcela:${operation_id}:${i}`,
        };

        const charge = await asaasRequest('/payments', {
          method: 'POST',
          body: JSON.stringify(chargePayload),
        }, apiKey);

        let pixQrCode = '';
        if (billing_type === 'PIX' && charge.id) {
          try {
            const qr = await asaasRequest(`/payments/${charge.id}/pixQrCode`, {}, apiKey);
            pixQrCode = qr.payload || qr.encodedImage || '';
          } catch (_) { /* non-critical */ }
        }

        updatedSchedule[i] = {
          ...inst,
          asaas_payment_id: charge.id,
          asaas_billing_type: billing_type,
          asaas_invoice_url: charge.invoiceUrl || '',
          asaas_pix_qrcode: pixQrCode,
          asaas_boleto_line: charge.bankSlipCode || charge.boletoLine || '',
          asaas_payment_status: mapAsaasStatus(charge.status),
        };

        charges.push({
          parcela: inst.number,
          payment_id: charge.id,
          value: Number(inst.value),
          due_date: inst.due_date,
        });
      }

      await base44.entities.Operation.update(operation_id, {
        installment_schedule: updatedSchedule,
        asaas_billing_type: billing_type,
      });

      return Response.json({
        success: true,
        billing_type,
        charges,
        total_charges: charges.length,
      });
    }

    // Fallback: single charge for the whole operation
    const value = operation.total_receivable || operation.gross_value;
    const dueDate = operation.due_date;
    const externalRef = `operacao:${operation_id}`;

    const chargePayload = {
      customer: customerId,
      billingType: billing_type,
      value: Number(value),
      dueDate,
      description: `Operação ${numOp} — PSX Capital`,
      externalReference: externalRef,
    };

    const charge = await asaasRequest('/payments', {
      method: 'POST',
      body: JSON.stringify(chargePayload),
    }, apiKey);

    let pixQrCode = '';
    if (billing_type === 'PIX' && charge.id) {
      try {
        const qr = await asaasRequest(`/payments/${charge.id}/pixQrCode`, {}, apiKey);
        pixQrCode = qr.payload || qr.encodedImage || '';
      } catch (_) { /* non-critical */ }
    }

    const updateData = {
      asaas_payment_id: charge.id,
      asaas_billing_type: billing_type,
      asaas_invoice_url: charge.invoiceUrl || '',
      asaas_pix_qrcode: pixQrCode,
      asaas_boleto_line: charge.bankSlipCode || charge.boletoLine || '',
      asaas_payment_status: mapAsaasStatus(charge.status),
    };

    await base44.entities.Operation.update(operation_id, updateData);

    return Response.json({ success: true, payment_id: charge.id, ...updateData });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});