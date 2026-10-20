import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { asaasRequest } from '../../shared/asaas.ts';
import { markChargeCancelled, atualizarParcelaCondicional } from '../../shared/asaasChargeFlow.js';
import { secrets } from 'base44:runtime';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { operation_id, parcela_index, payment_id } = await req.json();
    if (!operation_id && !payment_id) {
      return Response.json({ error: 'operation_id ou payment_id é obrigatório' }, { status: 400 });
    }

    const apiKey = secrets.get('ASAAS_API_KEY');

    // Cancel a single parcela within an operation's installment_schedule
    if (operation_id && parcela_index !== undefined && parcela_index !== null) {
      const operation = await base44.entities.Operation.get(operation_id);
      if (!operation) return Response.json({ error: 'Operação não encontrada' }, { status: 404 });

      const schedule = Array.isArray(operation.installment_schedule) ? operation.installment_schedule : [];
      const idx = Number(parcela_index);
      const inst = schedule[idx];
      if (!inst) return Response.json({ error: 'Parcela não encontrada' }, { status: 404 });
      if (!inst.asaas_payment_id) return Response.json({ error: 'Parcela sem cobrança ativa' }, { status: 400 });

      // Call Asaas DELETE to cancel the charge
      try {
        await asaasRequest(`/payments/${inst.asaas_payment_id}`, { method: 'DELETE' }, apiKey);
      } catch (e) {
        // D1.4 — só um 404 prova que a cobrança já não existe. Antes a decisão
        // vinha de SUBSTRING da mensagem, o que podia engolir um erro real
        // (validação, permissão) e limpar o vínculo local como se o
        // cancelamento tivesse sido feito.
        if (Number(e && e.status) !== 404) throw e;
      }

      // Clear charge fields so the parcela can be regenerated later.
      // D1.3 — escrita ATÔMICA por parcela (`$set` pontilhado): regravar o
      // array inteiro podia apagar o pagamento de OUTRA parcela da mesma
      // operação, gravado entre a leitura e a escrita.
      //
      // D1.4 — a limpeza é CONDICIONADA ao identificador observado: se a
      // parcela já aponta para outra cobrança (reemissão concorrente), o
      // vínculo novo não é apagado por um cancelamento do vínculo antigo.
      const base = `installment_schedule.${idx}`;
      await atualizarParcelaCondicional(base44.entities, operation_id, idx, inst.asaas_payment_id, {
        [`${base}.asaas_payment_id`]: '',
        [`${base}.asaas_payment_status`]: 'deleted',
        [`${base}.asaas_invoice_url`]: '',
        [`${base}.asaas_pix_qrcode`]: '',
        [`${base}.asaas_boleto_line`]: '',
        [`${base}.asaas_billing_type`]: inst.asaas_billing_type || '',
      });

      // D1.4 — a INTENÇÃO desta parcela passa a `cancelada`. É isto que libera
      // uma reemissão legítima e, ao mesmo tempo, garante que ela será uma
      // NOVA geração (identidade nova), e não uma duplicata da cobrança que
      // acabou de ser cancelada.
      await markChargeCancelled(base44, operation_id, idx, new Date().toISOString());

      return Response.json({
        success: true,
        parcela: inst.number,
        cancelled: true,
      });
    }

    // Cancel a standalone payment (by payment_id)
    if (payment_id) {
      try {
        await asaasRequest(`/payments/${payment_id}`, { method: 'DELETE' }, apiKey);
      } catch (e) {
        const msg = String(e.message || '');
        if (!msg.includes('404') && !msg.toLowerCase().includes('not found')) {
          throw e;
        }
      }

      // Try to clear from operation-level field
      const ops = await base44.entities.Operation.filter({ asaas_payment_id: payment_id });
      if (ops.length > 0) {
        await base44.entities.Operation.update(ops[0].id, {
          asaas_payment_id: '',
          asaas_payment_status: 'deleted',
          asaas_invoice_url: '',
          asaas_pix_qrcode: '',
          asaas_boleto_line: '',
        });
      }

      return Response.json({ success: true, cancelled: true });
    }

    return Response.json({ error: 'Parâmetros insuficientes' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});