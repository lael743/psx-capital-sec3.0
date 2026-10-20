import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { createOperationalCashFlow } from '../../shared/cashFlowHelper.ts';
import { applyBankDelta, chaveEvento } from '../../shared/bankLedger.ts';

const CF_METHODS = ['pix', 'dinheiro', 'transferencia', 'cheque'];

function normalizeMethod(m: any) {
  return CF_METHODS.includes(m) ? m : 'outro';
}

/** Normaliza o retorno das consultas (lista simples ou página paginada). */
function toItems(res: any): any[] {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  return res.items || [];
}

async function safeGet(client: any, entity: string, id: string) {
  if (!id) return null;
  try { return await client.entities[entity].get(id); } catch (_) { return null; }
}

async function logAudit(client: any, user: any, action: string, entity: string, entityId: string, description: string) {
  try {
    await client.entities.AuditLog.create({
      user_email: user?.email || 'system',
      user_name: user?.full_name || 'Sistema',
      action,
      entity,
      entity_id: entityId || '',
      description,
    });
  } catch (_) { /* auditoria não bloqueia a operação */ }
}

async function atualizarStatusLancamento(client: any, lancamentoId: string) {
  if (!lancamentoId) return;
  const res = await client.entities.ObrigacaoInterna.filter({ lancamento_id: lancamentoId }, { limit: 300 });
  const obs = toItems(res);
  if (obs.length === 0) return;
  let status = 'ativo';
  if (obs.every((o: any) => o.status === 'cancelado')) status = 'cancelado';
  else if (obs.every((o: any) => o.status === 'pago' || o.status === 'cancelado')) status = 'pago';
  await client.entities.LancamentoInterno.update(lancamentoId, { status });
}

async function registrar(client: any, user: any, body: any) {
  const {
    obrigacao_id,
    valor,
    data_pagamento,
    conta_id,
    forma_pagamento,
    referencia,
    comprovante_url,
    observacao,
    idempotency_key,
  } = body;

  const valorNum = Number(valor);
  if (!obrigacao_id) throw new Error('Parcela é obrigatória');
  if (!(valorNum > 0)) throw new Error('O valor pago deve ser maior que zero');
  if (!data_pagamento) throw new Error('A data do pagamento é obrigatória');

  // Idempotência — impede pagamento duplicado por repetição de requisição
  if (idempotency_key) {
    const dup = await client.entities.PagamentoInterno.filter({ idempotency_key });
    const dupItems = toItems(dup);
    if (dupItems.length > 0) {
      return Response.json({ success: true, duplicate: true, pagamento_id: dupItems[0].id });
    }
  }

  const obrigacao = await client.entities.ObrigacaoInterna.get(obrigacao_id);
  if (!obrigacao) throw new Error('Parcela não encontrada');
  if (obrigacao.status === 'cancelado') throw new Error('Parcela cancelada não pode receber pagamento');

  const saldoAtual = obrigacao.saldo != null
    ? Math.max(0, Number(obrigacao.saldo) || 0)
    : Math.max(0, (Number(obrigacao.valor) || 0) - (Number(obrigacao.valor_pago) || 0));

  if (valorNum > saldoAtual + 0.005) {
    throw new Error(`O valor informado excede o saldo pendente de R$ ${saldoAtual.toFixed(2)}`);
  }

  const conta = conta_id ? await safeGet(client, 'ContaInterna', conta_id) : null;

  const parcelaTxt = (Number(obrigacao.total_parcelas) || 1) > 1
    ? ` (${obrigacao.numero_parcela}/${obrigacao.total_parcelas})`
    : '';

  const pagamento = await client.entities.PagamentoInterno.create({
    obrigacao_id,
    descricao: `${obrigacao.descricao || 'Despesa'}${parcelaTxt}`,
    lancamento_id: obrigacao.lancamento_id || '',
    valor_pago: valorNum,
    data_pagamento,
    conta_id: conta_id || '',
    conta_nome: conta?.nome || '',
    forma_pagamento: forma_pagamento || '',
    referencia: referencia || '',
    comprovante_url: comprovante_url || '',
    observacao: observacao || '',
    estornado: false,
    idempotency_key: idempotency_key || '',
  });

  const novoPago = Math.round(((Number(obrigacao.valor_pago) || 0) + valorNum) * 100) / 100;
  const novoSaldo = Math.round(((Number(obrigacao.valor) || 0) - novoPago) * 100) / 100;
  const status = novoSaldo <= 0.005 ? 'pago' : 'parcialmente_pago';
  const antecipada = !!(obrigacao.vencimento && data_pagamento < obrigacao.vencimento);

  await client.entities.ObrigacaoInterna.update(obrigacao_id, {
    valor_pago: novoPago,
    saldo: Math.max(0, novoSaldo),
    status,
    data_pagamento,
    conta_pagamento_id: conta_id || '',
    conta_pagamento_nome: conta?.nome || '',
    antecipada,
  });

  // Efeito financeiro no fluxo central (idempotente por origem)
  const bankId = conta && conta.tipo === 'conta_bancaria' ? (conta.banco_id || '') : '';

  const cf = await createOperationalCashFlow(client, {
    category: 'despesa_interna',
    amount: valorNum,
    date: data_pagamento,
    description: `Gestão Interna · ${obrigacao.descricao || 'Despesa'}${parcelaTxt}`,
    type: 'saida',
    method: normalizeMethod(forma_pagamento),
    ...(bankId ? { bank_id: bankId } : {}),
    source_type: 'pagamento_interno',
    source_id: pagamento.id,
  });

  if (cf.status === 'created' && cf.cashflow) {
    await client.entities.PagamentoInterno.update(pagamento.id, { cashflow_id: cf.cashflow.id });
  }

  if (bankId) {
    // D3.1 — débito atômico com chave de evento: repetir a chamada do mesmo
    // pagamento não debita duas vezes. O lançamento em CashFlow já é idempotente
    // por origem (source_type + source_id), então o par fica 1:1.
    await applyBankDelta({
      store: { updateWhere: (q: any, u: any) => client.entities.Banco.updateMany(q, u) },
      bankId,
      delta: -valorNum,
      eventKey: chaveEvento('pagamento_interno', pagamento.id),
    });
  }

  await atualizarStatusLancamento(client, obrigacao.lancamento_id);
  await logAudit(
    client,
    user,
    'payment',
    'PagamentoInterno',
    pagamento.id,
    `Pagamento de R$ ${valorNum.toFixed(2)} em ${obrigacao.descricao || 'despesa'}${parcelaTxt}`,
  );

  return Response.json({
    success: true,
    pagamento_id: pagamento.id,
    status,
    saldo: Math.max(0, novoSaldo),
    cashflow: cf.status,
  });
}

async function estornar(client: any, user: any, body: any) {
  const { pagamento_id, motivo } = body;
  if (!pagamento_id) throw new Error('Pagamento é obrigatório');
  if (!motivo || !String(motivo).trim()) throw new Error('Informe o motivo do estorno');

  const pagamento = await client.entities.PagamentoInterno.get(pagamento_id);
  if (!pagamento) throw new Error('Pagamento não encontrado');
  if (pagamento.estornado) throw new Error('Este pagamento já foi estornado');

  await client.entities.PagamentoInterno.update(pagamento_id, {
    estornado: true,
    estorno_motivo: motivo,
    estorno_data: new Date().toISOString(),
  });

  const obrigacao = pagamento.obrigacao_id
    ? await safeGet(client, 'ObrigacaoInterna', pagamento.obrigacao_id)
    : null;

  if (obrigacao) {
    const novoPago = Math.max(0, Math.round(((Number(obrigacao.valor_pago) || 0) - (Number(pagamento.valor_pago) || 0)) * 100) / 100);
    const novoSaldo = Math.round(((Number(obrigacao.valor) || 0) - novoPago) * 100) / 100;
    const hoje = new Date().toISOString().slice(0, 10);
    let status = 'a_vencer';
    if (novoSaldo <= 0.005) status = 'pago';
    else if (novoPago > 0) status = 'parcialmente_pago';
    else if (obrigacao.vencimento && obrigacao.vencimento < hoje) status = 'vencido';

    await client.entities.ObrigacaoInterna.update(obrigacao.id, {
      valor_pago: novoPago,
      saldo: Math.max(0, novoSaldo),
      status,
    });
  }

  // Reversão pelo fluxo financeiro central — preserva o histórico
  const conta = pagamento.conta_id ? await safeGet(client, 'ContaInterna', pagamento.conta_id) : null;
  const bankId = conta && conta.tipo === 'conta_bancaria' ? (conta.banco_id || '') : '';

  if (bankId) {
    // D3.1 — estorno atômico: estornar duas vezes (ou em paralelo) devolve o
    // valor no máximo uma vez. Chave distinta da do pagamento de propósito.
    await applyBankDelta({
      store: { updateWhere: (q: any, u: any) => client.entities.Banco.updateMany(q, u) },
      bankId,
      delta: Number(pagamento.valor_pago) || 0,
      eventKey: chaveEvento('estorno_pagamento_interno', pagamento_id),
    });
  }

  await createOperationalCashFlow(client, {
    category: 'estorno_despesa_interna',
    amount: Number(pagamento.valor_pago) || 0,
    date: new Date().toISOString().slice(0, 10),
    description: `Estorno · ${obrigacao?.descricao || 'Despesa interna'}`,
    type: 'entrada',
    method: normalizeMethod(pagamento.forma_pagamento),
    ...(bankId ? { bank_id: bankId } : {}),
    source_type: 'estorno_pagamento_interno',
    source_id: pagamento_id,
  });

  if (obrigacao) await atualizarStatusLancamento(client, obrigacao.lancamento_id);
  await logAudit(
    client,
    user,
    'cancel',
    'PagamentoInterno',
    pagamento_id,
    `Estorno de R$ ${(Number(pagamento.valor_pago) || 0).toFixed(2)} — ${motivo}`,
  );

  return Response.json({ success: true });
}

async function cancelarParcela(client: any, user: any, body: any) {
  if (user?.role !== 'admin') {
    throw new Error('Apenas administradores podem cancelar parcelas');
  }
  const { obrigacao_id, motivo } = body;
  if (!obrigacao_id) throw new Error('Parcela é obrigatória');
  if (!motivo || !String(motivo).trim()) throw new Error('Informe o motivo do cancelamento');

  const obrigacao = await client.entities.ObrigacaoInterna.get(obrigacao_id);
  if (!obrigacao) throw new Error('Parcela não encontrada');
  if (obrigacao.status === 'cancelado') throw new Error('Parcela já cancelada');
  if (obrigacao.status === 'pago') throw new Error('Parcela já paga não pode ser cancelada');
  if ((Number(obrigacao.valor_pago) || 0) > 0) throw new Error('Parcela com pagamento registrado não pode ser cancelada');

  await client.entities.ObrigacaoInterna.update(obrigacao_id, {
    status: 'cancelado',
    motivo_cancelamento: motivo,
    cancelado_por: user?.email || '',
    saldo: 0,
  });

  await atualizarStatusLancamento(client, obrigacao.lancamento_id);
  await logAudit(
    client,
    user,
    'cancel',
    'ObrigacaoInterna',
    obrigacao_id,
    `Parcela ${obrigacao.numero_parcela}/${obrigacao.total_parcelas} cancelada — ${motivo}`,
  );

  return Response.json({ success: true });
}

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    let body: any = {};
    try { body = await req.json(); } catch (_) { body = {}; }
    body = body || {};

    if (body.action === 'estornar') return await estornar(base44, user, body);
    if (body.action === 'cancelar_parcela') return await cancelarParcela(base44, user, body);
    return await registrar(base44, user, body);
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 400 });
  }
}