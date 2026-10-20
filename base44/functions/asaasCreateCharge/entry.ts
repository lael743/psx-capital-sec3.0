import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import {
  asaasRequest,
  mapAsaasStatus,
  buildCustomerPayload,
  findPaymentsByExternalReference,
} from '../../shared/asaas.ts';
import { secrets } from 'base44:runtime';
import {
  SLOT_OPERACAO,
  CHARGE_STALE_SECONDS,
  emitirCobranca,
  emitirLote,
  camposCobrancaParcela,
  camposCobrancaOperacao,
} from '../../shared/asaasChargeFlow.js';

/**
 * FASE D1.4 — Emissão de cobranças Asaas, idempotente e recuperável.
 *
 * Este endpoint é um ADAPTADOR. Toda a máquina de estados — a intenção
 * persistida, a reivindicação exclusiva, a conciliação de resposta ambígua, a
 * escrita pontual por parcela — vive em base44/shared/asaasChargeFlow.js, e é
 * exercitada diretamente pelos testes com um provedor simulado.
 *
 * O que fica aqui é só o que é genuinamente do provedor: montar as chamadas
 * HTTP e traduzir o vocabulário de status do Asaas.
 *
 * ── O DEFEITO CORRIGIDO ─────────────────────────────────────────────────────
 *
 * Antes: POST /payments, depois gravar o id. Se a resposta se perdesse, o PSX
 * não sabia que uma cobrança PODERIA existir — e a tentativa seguinte criava
 * outro boleto para a mesma parcela.
 *
 * Agora a INTENÇÃO é persistida ANTES da chamada, com identidade estável
 * (operação + parcela + geração), e a reivindicação é um compare-and-swap no
 * documento único da operação. Duas solicitações simultâneas da mesma parcela:
 * só uma chama o provedor.
 *
 * ── RESPOSTA AMBÍGUA ────────────────────────────────────────────────────────
 *
 * O Asaas não oferece chave de idempotência para POST /payments (verificado na
 * documentação: `externalReference` é "campo livre de busca", sem unicidade).
 * Uma resposta ambígua NÃO é tratada como falha nem como sucesso: a intenção
 * vai para `reconciliacao_pendente` e a tentativa seguinte CONSULTA
 * (GET /payments?externalReference=) antes de criar. Só cria se a consulta
 * provar que a cobrança não existe.
 */
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
      const created = await asaasRequest('/customers', {
        method: 'POST',
        body: JSON.stringify(buildCustomerPayload(sacado)),
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

    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();
    const staleIso = new Date(nowMs - CHARGE_STALE_SECONDS * 1000).toISOString();

    const provedor = criarProvedor(apiKey, customerId, billing_type);

    const base = {
      base44,
      operation,
      provedor,
      nowIso,
      staleIso,
    };

    // ── Parcela única ────────────────────────────────────────────────────────
    if (parcela_index !== undefined && parcela_index !== null && schedule.length > 0) {
      const idx = Number(parcela_index);
      const inst = schedule[idx];
      if (!inst) return Response.json({ error: 'Parcela não encontrada' }, { status: 404 });
      if (inst.paid) return Response.json({ error: 'Parcela já paga não pode ser regerada' }, { status: 400 });

      const r = await emitirCobranca(base44, {
        ...base,
        slot: idx,
        alvo: alvoParcela(operation, idx, numOp),
      });
      const resumo = resumir([r]);
      return Response.json(montarResposta(resumo, billing_type, schedule));
    }

    // ── Lote: uma intenção por parcela ───────────────────────────────────────
    if (generate_all_parcels && schedule.length > 0) {
      const itens = [];
      for (let i = 0; i < schedule.length; i++) {
        // Parcela já paga não gera cobrança. Parcela com cobrança existente é
        // tratada dentro do fluxo (reutilizada, nunca recriada).
        if (schedule[i].paid) continue;
        itens.push({ slot: i, alvo: alvoParcela(operation, i, numOp) });
      }

      const resumo = await emitirLote(base44, { ...base, itens });
      return Response.json(montarResposta(resumo, billing_type, schedule));
    }

    // ── Cobrança única da operação inteira ───────────────────────────────────
    const r = await emitirCobranca(base44, {
      ...base,
      slot: SLOT_OPERACAO,
      alvo: {
        rotulo: null,
        billing_type,
        payload: {
          customer: customerId,
          billingType: billing_type,
          value: Number(operation.total_receivable || operation.gross_value),
          dueDate: operation.due_date,
          description: `Operação ${numOp} — PSX Capital`,
        },
        paymentIdAtual: operation.asaas_payment_id || '',
        campos: (info) => camposCobrancaOperacao(info),
      },
    });

    const resumo = resumir([r]);
    return Response.json({
      ...montarResposta(resumo, billing_type, schedule),
      payment_id: r.payment_id || undefined,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});

/* ── Adaptador do provedor ──────────────────────────────────────────────────── */

/** Traduz o vocabulário do Asaas para o interno, uma vez só, na borda. */
function normalizar(p) {
  return {
    id: p.id,
    billingType: p.billingType || '',
    invoiceUrl: p.invoiceUrl || '',
    bankSlipCode: p.bankSlipCode || p.boletoLine || '',
    boletoLine: p.boletoLine || '',
    status: mapAsaasStatus(p.status),
  };
}

function criarProvedor(apiKey, customerId, billing_type) {
  return {
    async criar(payload) {
      const charge = await asaasRequest('/payments', {
        method: 'POST',
        body: JSON.stringify({ customer: customerId, ...payload }),
      }, apiKey);
      return normalizar(charge);
    },
    async consultar(externalReference) {
      const lista = await findPaymentsByExternalReference(externalReference, apiKey);
      return (lista || []).map(normalizar);
    },
    async pix(paymentId, tipo) {
      if ((tipo || billing_type) !== 'PIX') return '';
      try {
        const qr = await asaasRequest(`/payments/${paymentId}/pixQrCode`, {}, apiKey);
        return qr.payload || qr.encodedImage || '';
      } catch (_) {
        return ''; // não crítico
      }
    },
  };
}

/* ── Alvo da emissão ────────────────────────────────────────────────────────── */

function alvoParcela(operation, idx, numOp) {
  const schedule = operation.installment_schedule || [];
  const inst = schedule[idx];
  return {
    rotulo: inst.number,
    billing_type: null,
    payload: {
      billingType: null, // preenchido pelo adaptador
      value: Number(inst.value),
      dueDate: inst.due_date,
      description: `Operação ${numOp} — Parcela ${inst.number}/${schedule.length} — PSX Capital`,
    },
    paymentIdAtual: inst.asaas_payment_id || '',
    campos: (info) => camposCobrancaParcela(idx, info),
  };
}

/* ── Resposta ───────────────────────────────────────────────────────────────── */

/**
 * Compatibilidade com o formato que a interface já consome (`charges` com
 * parcela/valor/vencimento), enriquecido com o resultado POR PARCELA — que é o
 * que permite ver que um lote foi apenas parcialmente concluído.
 */
function montarResposta(resumo, billing_type, schedule) {
  const charges = (resumo.resultados || [])
    .filter((r) => r.ok && r.payment_id)
    .map((r) => {
      const inst = typeof r.slot === 'number' ? schedule[r.slot] : null;
      return {
        parcela: r.parcela,
        payment_id: r.payment_id,
        value: inst ? Number(inst.value) : undefined,
        due_date: inst ? inst.due_date : undefined,
        reutilizada: r.reutilizada,
        reconciliada: r.reconciliada,
      };
    });

  return { ...resumo, billing_type, charges, total_charges: charges.length };
}

function resumir(resultados) {
  const lista = resultados || [];
  const charges = lista.filter((r) => r.ok && r.payment_id);
  const pendentes = lista.filter((r) => !r.ok);
  return {
    success: pendentes.length === 0,
    parcial: pendentes.length > 0 && charges.length > 0,
    total_charges: charges.length,
    pendentes: pendentes.length,
    resultados: lista.map((r) => ({
      slot: r.slot,
      parcela: r.parcela === undefined ? null : r.parcela,
      ok: !!r.ok,
      motivo: r.motivo || '',
      payment_id: r.payment_id || '',
      reutilizada: !!r.reutilizada,
      reconciliada: !!r.reconciliada,
    })),
  };
}