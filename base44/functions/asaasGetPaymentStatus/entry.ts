import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { asaasRequest, mapAsaasStatus } from '../../shared/asaas.ts';
import { secrets } from 'base44:runtime';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { payment_id, operation_id } = await req.json();
    const apiKey = secrets.get('ASAAS_API_KEY');

    // Refresh all parcelas in an operation's installment_schedule
    if (operation_id) {
      const operation = await base44.entities.Operation.get(operation_id);
      if (!operation) return Response.json({ error: 'Operação não encontrada' }, { status: 404 });

      const schedule = Array.isArray(operation.installment_schedule) ? operation.installment_schedule : [];
      const updatedSchedule = [...schedule];

      for (let i = 0; i < updatedSchedule.length; i++) {
        const inst = updatedSchedule[i];
        if (!inst.asaas_payment_id) continue;
        try {
          const payment = await asaasRequest(`/payments/${inst.asaas_payment_id}`, {}, apiKey);
          const mapped = mapAsaasStatus(payment.status);
          // If charge was cancelled/deleted in Asaas, clear local link so it can be regenerated
          if (mapped === 'deleted' || payment.status === 'DELETED') {
            updatedSchedule[i] = {
              ...inst,
              asaas_payment_status: 'deleted',
              asaas_invoice_url: '',
              asaas_pix_qrcode: '',
              asaas_boleto_line: '',
            };
          } else {
            updatedSchedule[i] = {
              ...inst,
              asaas_payment_status: mapped,
              asaas_invoice_url: payment.invoiceUrl || inst.asaas_invoice_url || '',
              asaas_boleto_line: payment.bankSlipCode || inst.asaas_boleto_line || '',
            };
          }
        } catch (e) {
          // 404 means the charge was permanently removed in Asaas — clear local link
          const msg = String(e.message || '');
          if (msg.includes('404') || msg.toLowerCase().includes('not found')) {
            updatedSchedule[i] = {
              ...inst,
              asaas_payment_status: 'deleted',
              asaas_invoice_url: '',
              asaas_pix_qrcode: '',
              asaas_boleto_line: '',
            };
          }
          // other errors: skip this parcela
        }
      }

      await base44.entities.Operation.update(operation_id, { installment_schedule: updatedSchedule });
      return Response.json({ success: true, refreshed: true });
    }

    // Single payment refresh
    if (!payment_id) return Response.json({ error: 'payment_id ou operation_id é obrigatório' }, { status: 400 });

    const payment = await asaasRequest(`/payments/${payment_id}`, {}, apiKey);

    return Response.json({
      success: true,
      status: mapAsaasStatus(payment.status),
      raw_status: payment.status,
      value: payment.value,
      due_date: payment.dueDate,
      invoice_url: payment.invoiceUrl,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});