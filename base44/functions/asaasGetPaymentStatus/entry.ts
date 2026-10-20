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

      // D1.3 — escrita ATÔMICA por parcela. Regravar o array inteiro causava
      // perda de atualização quando este refresh corria ao mesmo tempo que o
      // pagamento de outra parcela da mesma operação: quem gravasse por último
      // sobrescrevia o array lido antes.
      const patch = {};

      for (let i = 0; i < schedule.length; i++) {
        const inst = schedule[i];
        if (!inst.asaas_payment_id) continue;
        const base = `installment_schedule.${i}`;
        try {
          const payment = await asaasRequest(`/payments/${inst.asaas_payment_id}`, {}, apiKey);
          const mapped = mapAsaasStatus(payment.status);
          // If charge was cancelled/deleted in Asaas, clear local link so it can be regenerated
          if (mapped === 'deleted' || payment.status === 'DELETED') {
            patch[`${base}.asaas_payment_status`] = 'deleted';
            patch[`${base}.asaas_invoice_url`] = '';
            patch[`${base}.asaas_pix_qrcode`] = '';
            patch[`${base}.asaas_boleto_line`] = '';
          } else {
            patch[`${base}.asaas_payment_status`] = mapped;
            patch[`${base}.asaas_invoice_url`] = payment.invoiceUrl || inst.asaas_invoice_url || '';
            patch[`${base}.asaas_boleto_line`] = payment.bankSlipCode || inst.asaas_boleto_line || '';
          }
        } catch (e) {
          // 404 means the charge was permanently removed in Asaas — clear local link
          const msg = String(e.message || '');
          if (msg.includes('404') || msg.toLowerCase().includes('not found')) {
            patch[`${base}.asaas_payment_status`] = 'deleted';
            patch[`${base}.asaas_invoice_url`] = '';
            patch[`${base}.asaas_pix_qrcode`] = '';
            patch[`${base}.asaas_boleto_line`] = '';
          }
          // other errors: skip this parcela
        }
      }

      if (Object.keys(patch).length > 0) {
        await base44.entities.Operation.updateMany({ id: operation_id }, { $set: patch });
      }
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