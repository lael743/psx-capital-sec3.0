import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { atualizarParcelaCondicional } from '../../shared/asaasChargeFlow.js';
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
      //
      // D1.4 — LIMPEZA CONDICIONAL. Limpar o vínculo apagava a parcela
      // INTEIRA, sem olhar para qual cobrança a parcela aponta AGORA. Se uma
      // reemissão criasse uma cobrança nova enquanto esta consulta estava em
      // andamento, a limpeza levava embora o vínculo NOVO — e a parcela ficava
      // sem cobrança nenhuma, com o boleto antigo já removido no Asaas.
      //
      // Agora cada parcela é gravada com uma CONDIÇÃO: o identificador
      // observado no momento da consulta. Se a parcela já aponta para outra
      // cobrança, a condição não casa e o vínculo novo é preservado.
      let atualizadas = 0;

      for (let i = 0; i < schedule.length; i++) {
        const inst = schedule[i];
        const observadoId = inst.asaas_payment_id;
        if (!observadoId) continue;
        const base = `installment_schedule.${i}`;
        const patch = {};

        try {
          const payment = await asaasRequest(`/payments/${observadoId}`, {}, apiKey);
          const mapped = mapAsaasStatus(payment.status);
          if (mapped === 'deleted' || payment.status === 'DELETED') {
            // Cobrança removida CONFIRMADA pelo provedor: libera a reemissão.
            patch[`${base}.asaas_payment_id`] = '';
            patch[`${base}.asaas_payment_status`] = 'deleted';
            patch[`${base}.asaas_invoice_url`] = '';
            patch[`${base}.asaas_pix_qrcode`] = '';
            patch[`${base}.asaas_boleto_line`] = '';
          } else {
            // pending / confirmed / received / overdue / refunded: a cobrança
            // existe e continua vinculada.
            patch[`${base}.asaas_payment_status`] = mapped;
            patch[`${base}.asaas_invoice_url`] = payment.invoiceUrl || inst.asaas_invoice_url || '';
            patch[`${base}.asaas_boleto_line`] = payment.bankSlipCode || inst.asaas_boleto_line || '';
          }
        } catch (e) {
          // D1.4 — SÓ um 404 autoriza concluir que a cobrança foi excluída.
          // Antes a decisão vinha de uma SUBSTRING da mensagem ("404" dentro do
          // texto de um erro 400, por exemplo), o que tratava erro genérico
          // como prova de exclusão e apagava o vínculo indevidamente. Agora usa
          // o status HTTP estruturado; qualquer outro erro apenas preserva o
          // estado atual da parcela.
          if (Number(e && e.status) === 404) {
            patch[`${base}.asaas_payment_id`] = '';
            patch[`${base}.asaas_payment_status`] = 'deleted';
            patch[`${base}.asaas_invoice_url`] = '';
            patch[`${base}.asaas_pix_qrcode`] = '';
            patch[`${base}.asaas_boleto_line`] = '';
          } else {
            continue; // erro não é prova de exclusão
          }
        }

        if (Object.keys(patch).length === 0) continue;

        // A escrita é condicionada ao identificador OBSERVADO nesta consulta.
        const ok = await atualizarParcelaCondicional(
          base44.entities,
          operation_id,
          i,
          observadoId,
          patch
        );
        if (ok) atualizadas++;
      }

      return Response.json({ success: true, refreshed: true, parcelas_atualizadas: atualizadas });
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