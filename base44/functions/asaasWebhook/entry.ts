import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { asaasRequest, mapAsaasStatus } from '../../shared/asaas.ts';
import { secrets } from 'base44:runtime';
import { sumCompensatedCheques } from '../../shared/operationAccounting.js';
import { processReceipt } from '../../shared/asaasReceiptFlow.js';

// Sincroniza o status dos títulos (Cheque) vinculados à operação conforme o estado da operação.
// - 'compensado' quando a operação é quitada/finalizada (paga)
// - 'cancelado' quando a operação é rejeitada/cancelada
// - 'pendente' quando a operação é reaberta
//
// D1.1: marcar um título como compensado NÃO é um recebimento. Depois de mudar os
// status, o marcador `cheques_compensados_total` é ABSORVIDO (avança sem tocar em
// amount_paid), para que a próxima sincronização de cheques não volte a somar
// esses títulos — era essa a dupla contagem.
async function syncTitulosByOperacaoStatus(base44, operationId, targetStatus) {
  if (!operationId || !targetStatus) return;
  const cheques = await base44.asServiceRole.entities.Cheque.filter({ operation_id: operationId });
  if (!cheques || cheques.length === 0) return;
  const toUpdate = cheques.filter((c) =>
    targetStatus === 'pendente' ? c.status === 'cancelado' : c.status === 'pendente'
  );
  if (toUpdate.length === 0) return;
  await base44.asServiceRole.entities.Cheque.bulkUpdate(
    toUpdate.map((c) => ({ id: c.id, status: targetStatus }))
  );

  const after = await base44.asServiceRole.entities.Cheque.filter({ operation_id: operationId });
  await base44.asServiceRole.entities.Operation.update(operationId, {
    cheques_compensados_total: sumCompensatedCheques(after),
  });
}

Deno.serve(async (req) => {
  try {
    // Validate webhook token
    const token = req.headers.get('asaas-access-token') || '';
    const expectedToken = secrets.get('ASAAS_WEBHOOK_TOKEN') || '';
    if (!expectedToken || token !== expectedToken) {
      return Response.json({ error: 'Invalid webhook token' }, { status: 401 });
    }

    const base44 = createClientFromRequest(req);
    const event = await req.json();

    const payment = event.payment;
    if (!payment) return Response.json({ received: true });

    const paymentId = payment.id;
    const externalRef = payment.externalReference || '';
    const status = mapAsaasStatus(payment.status);
    const receivedValue = Number(payment.value) || 0;
    const today = new Date().toISOString().split('T')[0];

    // Locate the operation or parcela by externalReference
    let operationId = null;
    let parcelaId = null;
    let scheduleIndex = -1;

    if (externalRef.startsWith('operacao_parcela:')) {
      const parts = externalRef.replace('operacao_parcela:', '').split(':');
      operationId = parts[0];
      scheduleIndex = parseInt(parts[1], 10);
    } else if (externalRef.startsWith('parcela:')) {
      parcelaId = externalRef.replace('parcela:', '');
    } else if (externalRef.startsWith('operacao:')) {
      operationId = externalRef.replace('operacao:', '');
    } else if (paymentId) {
      const ops = await base44.asServiceRole.entities.Operation.filter({ asaas_payment_id: paymentId });
      if (ops.length > 0) operationId = ops[0].id;
      if (!operationId) {
        const parcelas = await base44.asServiceRole.entities.ParcelaCliente.filter({ asaas_payment_id: paymentId });
        if (parcelas.length > 0) parcelaId = parcelas[0].id;
      }
    }

    const isReceived = status === 'received' || status === 'confirmed';
    const isDeleted = status === 'deleted' || payment.status === 'DELETED';

    // --- Assinatura (subscription) ---
    // Pagamentos originados de uma assinatura trazem payment.subscription = "sub_xxx"
    if (payment.subscription) {
      const subId = payment.subscription;
      const apiKey = secrets.get('ASAAS_API_KEY');
      const vinculos = await base44.asServiceRole.entities.AssinaturaVinculo.filter({ asaas_subscription_id: subId });
      if (vinculos.length === 0) return Response.json({ received: true });

      const vinculo = vinculos[0];
      const operation = vinculo.operation_id
        ? await base44.asServiceRole.entities.Operation.get(vinculo.operation_id)
        : null;

      const updateData = {};
      if (payment.subscriptionStatus) updateData.asaas_status = payment.subscriptionStatus;
      if (payment.nextDueDate) updateData.proxima_cobranca = payment.nextDueDate;

      if (isReceived && !isDeleted) {
        // Estimativa PRÉ-incremento, usada apenas na descrição do extrato.
        // O contador em si é incrementado com $inc logo abaixo (atômico).
        const newCiclosPagos = (vinculo.ciclos_pagos || 0) + 1;
        const numOp = operation?.numero_operacao
          ? String(operation.numero_operacao).padStart(6, '0')
          : '';

        const lancamentoPayload = operation?.client_id
          ? {
              client_id: operation.client_id,
              client_name: operation.client_name,
              type: 'parcela',
              nature: 'credito',
              date: today,
              description: `Recebimento Assinatura — Op ${numOp} — ${vinculo.sacado_name} — Ciclo ${newCiclosPagos}`,
              gross_value: receivedValue,
              credit_amount: receivedValue,
              status: 'compensado',
              operation_id: operation.id,
              payment_method: payment.billingType === 'BOLETO' ? 'boleto' : 'pix',
            }
          : null;

        // D1.2 — reivindicação da identidade + amortização em UMA escrita atômica.
        const res = await processReceipt(base44, {
          paymentId,
          operationId: operation ? operation.id : null,
          parcelaId: null,
          externalReference: externalRef,
          value: receivedValue,
          lancamentoPayload,
        });

        // D1.4 — EFEITO SECUNDÁRIO RECUPERÁVEL.
        //
        // O contador de ciclos só era incrementado quando `res.applied` era
        // verdadeiro, numa escrita SEPARADA do recebimento. Se o processo
        // morresse entre as duas, a reentrega não corrigia nada: `res.applied`
        // já era falso (o valor estava contabilizado), então o incremento
        // nunca acontecia e o ciclo ficava permanentemente atrás.
        //
        // Agora o ciclo é reivindicado pela SUA PRÓPRIA identidade — o id do
        // pagamento — na MESMA escrita do $inc. A guarda `$ne` torna a
        // reentrega um no-op (updated === 0), e um contador que ficou atrás
        // converge para o tamanho de `ciclos_processados`.
        //
        // Note que o efeito NÃO depende mais de `res.applied`: ele tem a sua
        // própria condição de idempotência, e por isso sobrevive a uma
        // reentrega mesmo quando o efeito monetário já estava aplicado.
        const cicloRes = await base44.asServiceRole.entities.AssinaturaVinculo.updateMany(
          { id: vinculo.id, ciclos_processados: { $ne: paymentId } },
          { $inc: { ciclos_pagos: 1 }, $addToSet: { ciclos_processados: paymentId } }
        );

        if (cicloRes && cicloRes.updated === 1) {
          const vinculoAtual = await base44.asServiceRole.entities.AssinaturaVinculo.get(vinculo.id);
          const ciclos = (vinculoAtual && vinculoAtual.ciclos_pagos) || newCiclosPagos;

          // Prazo definido: ao atingir o nº de ciclos, encerra a assinatura
          if (
            vinculo.prazo_tipo === 'definido' &&
            vinculo.num_ciclos > 0 &&
            ciclos >= vinculo.num_ciclos &&
            vinculo.asaas_subscription_id
          ) {
            try {
              await asaasRequest(`/subscriptions/${vinculo.asaas_subscription_id}`, { method: 'DELETE' }, apiKey);
              updateData.status = 'encerrada';
              updateData.asaas_status = 'DELETED';
            } catch (e) {
              const msg = String(e.message || '');
              if (msg.includes('404') || msg.toLowerCase().includes('not found')) {
                updateData.status = 'encerrada';
                updateData.asaas_status = 'DELETED';
              }
            }
          }
        }

        // O contador NÃO entra em updateData: ele é do $inc atômico acima.
        // Regravá-lo aqui reintroduziria a perda de atualização que a D1.4
        // acabou de eliminar.
        if (!res.journal_ok) {
          console.warn('[asaasWebhook] diário indisponível; recuperação dependerá de reentrega');
        }
      } else if (status === 'overdue') {
        if (operation && operation.status === 'ativo') {
          await base44.asServiceRole.entities.Operation.update(operation.id, { status: 'atrasado' });
        }
      }

      await base44.asServiceRole.entities.AssinaturaVinculo.update(vinculo.id, updateData);
      return Response.json({ received: true });
    }

    // Schedule parcela (installment_schedule embedded in operation)
    if (operationId && scheduleIndex >= 0) {
      const operation = await base44.asServiceRole.entities.Operation.get(operationId);
      if (operation) {
        const schedule = Array.isArray(operation.installment_schedule) ? operation.installment_schedule : [];
        const inst = schedule[scheduleIndex];
        if (inst) {
          // D1.3 — escrita ATÔMICA por parcela: `$set` pontilhado no índice.
          // Regravar o array inteiro causava PERDA DE ATUALIZAÇÃO quando duas
          // parcelas diferentes da mesma operação eram pagas ao mesmo tempo:
          // a última gravação sobrescrevia o array lido antes da primeira.
          // O índice é estável durante a vida da operação, então endereçar a
          // parcela por posição elimina a corrida.
          const base = `installment_schedule.${scheduleIndex}`;
          const patch = {};

          if (isDeleted) {
            // Charge cancelled/deleted in Asaas — mark as cancelled (keep id for badge display)
            patch[`${base}.asaas_payment_status`] = 'deleted';
            patch[`${base}.asaas_invoice_url`] = '';
            patch[`${base}.asaas_pix_qrcode`] = '';
            patch[`${base}.asaas_boleto_line`] = '';
          } else {
            patch[`${base}.asaas_payment_status`] = status;
          }

          if (isReceived && !isDeleted) {
            // Estado da parcela é atribuição idempotente — pode ser reaplicado
            // sem risco, por isso não depende da reivindicação do evento.
            patch[`${base}.paid`] = true;
            patch[`${base}.paid_date`] = today;
            patch[`${base}.status`] = 'paga';

            const numOp = operation.numero_operacao
              ? String(operation.numero_operacao).padStart(6, '0')
              : '';

            const lancamentoPayload = operation.client_id
              ? {
                  client_id: operation.client_id,
                  client_name: operation.client_name,
                  type: payment.billingType === 'BOLETO' ? 'boleto' : 'pagamento_pix',
                  nature: 'credito',
                  date: today,
                  description: `Recebimento Asaas — Operação ${numOp} — Parcela ${inst.number} — ${payment.billingType || ''}`,
                  gross_value: receivedValue,
                  credit_amount: receivedValue,
                  status: 'compensado',
                  operation_id: operationId,
                  payment_method: payment.billingType === 'BOLETO' ? 'boleto' : 'pix',
                }
              : null;

            // D1.2 — amortização atômica + extrato idempotente.
            const res = await processReceipt(base44, {
              paymentId,
              operationId,
              parcelaId: null,
              externalReference: externalRef,
              value: receivedValue,
              lancamentoPayload,
            });

            if (res.applied) {
              const freshOp = await base44.asServiceRole.entities.Operation.get(operationId);
              if (freshOp && freshOp.status === 'quitado') {
                await syncTitulosByOperacaoStatus(base44, operationId, 'compensado');
              }
            }
          } else if (status === 'overdue') {
            patch[`${base}.status`] = 'atrasada';
          }

          // amount_paid/balance_due/status são gravados atomicamente pelo
          // processReceipt — aqui só o cronograma de parcelas, parcela a parcela.
          await base44.asServiceRole.entities.Operation.updateMany(
            { id: operationId },
            { $set: patch }
          );
        }
      }
    } else if (parcelaId) {
      const parcela = await base44.asServiceRole.entities.ParcelaCliente.get(parcelaId);
      if (parcela) {
        const updateData = { asaas_payment_status: status };
        if (isReceived) {
          updateData.status = 'paga';
          updateData.paid_amount = receivedValue;
          updateData.paid_date = today;
        } else if (status === 'overdue') {
          updateData.status = 'atrasada';
        }
        await base44.asServiceRole.entities.ParcelaCliente.update(parcelaId, updateData);

        if (isReceived) {
          const operation = parcela.operation_id
            ? await base44.asServiceRole.entities.Operation.get(parcela.operation_id)
            : null;

          const lancamentoPayload = operation?.client_id
            ? {
                client_id: operation.client_id,
                client_name: operation.client_name,
                type: payment.billingType === 'BOLETO' ? 'boleto' : 'pagamento_pix',
                nature: 'credito',
                date: today,
                description: `Recebimento Asaas — Parcela ${parcela.number} — ${payment.billingType || ''}`,
                gross_value: receivedValue,
                credit_amount: receivedValue,
                status: 'compensado',
                operation_id: operation.id,
                parcela_id: parcelaId,
                payment_method: payment.billingType === 'BOLETO' ? 'boleto' : 'pix',
              }
            : null;

          // D1.2 — o extrato do CLIENTE é separado do caixa da EMPRESA.
          // Este caminho NÃO amortiza a Operation (operationId = null), como
          // antes. O lançamento é criado no máximo uma vez por evento.
          await processReceipt(base44, {
            paymentId,
            operationId: null,
            parcelaId,
            externalReference: externalRef,
            value: receivedValue,
            lancamentoPayload,
          });
        }
      }
    } else if (operationId) {
      const operation = await base44.asServiceRole.entities.Operation.get(operationId);
      if (operation) {
        const numOp = operation.numero_operacao
          ? String(operation.numero_operacao).padStart(6, '0')
          : '';

        const lancamentoPayload = operation.client_id
          ? {
              client_id: operation.client_id,
              client_name: operation.client_name,
              type: payment.billingType === 'BOLETO' ? 'boleto' : 'pagamento_pix',
              nature: 'credito',
              date: today,
              description: `Recebimento Asaas — Operação ${numOp} — ${payment.billingType || ''}`,
              gross_value: receivedValue,
              credit_amount: receivedValue,
              status: 'compensado',
              operation_id: operationId,
              payment_method: payment.billingType === 'BOLETO' ? 'boleto' : 'pix',
            }
          : null;

        // D1.2 — amortização atômica + extrato idempotente, em uma só passagem.
        const res = await processReceipt(base44, {
          paymentId,
          operationId,
          parcelaId: null,
          externalReference: externalRef,
          value: receivedValue,
          lancamentoPayload,
        });

        const updateData = { asaas_payment_status: status };
        if (!res.applied && status === 'overdue') updateData.status = 'atrasado';
        await base44.asServiceRole.entities.Operation.update(operationId, updateData);

        if (res.applied) {
          const freshOp = await base44.asServiceRole.entities.Operation.get(operationId);
          if (freshOp && freshOp.status === 'quitado') {
            await syncTitulosByOperacaoStatus(base44, operationId, 'compensado');
          }
        }
      }
    }

    return Response.json({ received: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});