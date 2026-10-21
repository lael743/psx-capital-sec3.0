/**
 * M4 — PERSISTÊNCIA DA OPERAÇÃO (criação e edição de títulos).
 *
 * Duas regras que este módulo garante:
 *
 * 1. EDIÇÃO NÃO DESTRÓI TÍTULO COM EFEITO.
 *    O formulário antigo fazia `Cheque.deleteMany({operation_id})` e recriava
 *    tudo: um título compensado, devolvido ou com taxa cobrada era apagado, e
 *    com ele o vínculo financeiro. Agora os títulos são RECONCILIADOS — os
 *    existentes são atualizados no lugar, os que faltam são criados e só os
 *    excedentes SEM efeito são removidos. Título com efeito nunca é apagado
 *    nem tem termos reescritos: a edição é recusada com mensagem clara.
 *
 * 2. RETRY NÃO DUPLICA.
 *    `salvarOperacao` recebe `operacaoId`: uma segunda tentativa (clique
 *    repetido, falha parcial) atualiza a MESMA operação e apenas completa os
 *    títulos que faltam — o pareamento é por número do título.
 *
 * Nada aqui toca `amount_paid`, `cheques_compensados_total`,
 * `realized_profit`, `receipt_keys` ou `taxa_incorporada_eventos`: esses campos
 * pertencem ao fluxo de recebimento (M2/M3) e não são do formulário.
 */

import { calcTituloRow, montarCronograma, numeroDoTitulo } from './operacaoCalc.js';
import { daysBetween } from './finance.js';

const round2 = (v) => Math.round((Number(v) || 0) * 100) / 100;

/** O título já produziu efeito financeiro? */
export function temEfeitoFinanceiro(cheque) {
  if (!cheque) return false;
  return (
    (!!cheque.status && cheque.status !== 'pendente') ||
    !!cheque.compensation_token ||
    !!cheque.compensated_at ||
    Number(cheque.taxa_devolucao) > 0 ||
    Number(cheque.taxa_recebida) > 0 ||
    !!cheque.resolucao_evento
  );
}

function termosDiferem(atual, nova) {
  return (
    String(atual?.compensation_date || '') !== String(nova?.compensation_date || '') ||
    round2(atual?.valor_face ?? atual?.value) !== round2(nova?.valor_face ?? nova?.value) ||
    String(atual?.check_number || '') !== String(nova?.check_number || '') ||
    String(atual?.tipo || '') !== String(nova?.tipo || '')
  );
}

function ordenarParaPareamento(cheques) {
  return (cheques || []).slice().sort((a, b) => {
    const ka = `${a.compensation_date || ''}|${a.check_number || ''}|${a.id || ''}`;
    const kb = `${b.compensation_date || ''}|${b.check_number || ''}|${b.id || ''}`;
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });
}

/**
 * Payload dos títulos (Cheque) a partir das linhas do wizard.
 * Não inclui `status`: um título existente mantém o seu.
 */
export function montarTitulosCheque({ resumo, ctx, operationId }) {
  const { titulos } = resumo;
  return titulos.map((t, i) => {
    const { dias, desagio, liquido, valorFace } = calcTituloRow(
      t, ctx.startDate, resumo.rate, ctx.interestType, resumo.floatDias, ctx.arredondar, ctx.calcModeEfetivo || ctx.calcMode,
    );
    return {
      operation_id: operationId,
      client_id: ctx.clientId || '',
      client_name: ctx.clientName || '',
      sacado_name: t.sacado || '',
      sacado_doc: t.sacado_doc || '',
      nf: t.nf || '',
      tipo: t.tipo || 'cheque',
      bank_name: (t.tipo || 'cheque') === 'cheque' ? (t.bank_name || 'Cheque') : 'Boleto',
      check_number: numeroDoTitulo(t, i),
      value: valorFace,
      valor_face: valorFace,
      desagio,
      liquido,
      outras_despesas: parseFloat(t.outras_despesas) || 0,
      dias,
      compensation_date: t.vencimento,
    };
  });
}

/**
 * Plano de reconciliação: o que atualizar, criar e remover.
 * @returns {{bloqueio: string|null, atualizar: Array, criar: Array, remover: Array}}
 */
export function planoDeTitulos(existentes, desejados) {
  const atuais = ordenarParaPareamento(existentes);
  const novos = Array.isArray(desejados) ? desejados : [];
  const usados = new Set();
  const atualizar = [];
  const criar = [];
  const conflitos = [];

  novos.forEach((desejado, i) => {
    let par = null;
    if (desejado.check_number) {
      par = atuais.find((c) => !usados.has(c.id) && String(c.check_number || '') === String(desejado.check_number)) || null;
    }
    if (!par) {
      const candidato = atuais[i];
      if (candidato && !usados.has(candidato.id)) par = candidato;
    }

    if (!par) {
      criar.push(desejado);
      return;
    }

    usados.add(par.id);
    if (temEfeitoFinanceiro(par)) {
      if (termosDiferem(par, desejado)) {
        conflitos.push(`Título ${par.check_number || i + 1} já tem compensação, devolução ou taxa cobrada`);
      }
      return; // título com efeito é preservado como está
    }
    atualizar.push({ id: par.id, dados: desejado });
  });

  const remover = [];
  atuais.filter((c) => !usados.has(c.id)).forEach((sobra) => {
    if (temEfeitoFinanceiro(sobra)) {
      conflitos.push(`Título ${sobra.check_number || sobra.id} já tem efeito financeiro`);
      return;
    }
    remover.push(sobra);
  });

  return {
    bloqueio: conflitos.length
      ? `${conflitos.slice(0, 3).join('; ')}${conflitos.length > 3 ? ` e mais ${conflitos.length - 3}` : ''}. Use "Editar condições" ou "Adicionar título" para alterar sem perder o estado financeiro.`
      : null,
    atualizar,
    criar,
    remover,
  };
}

/** Executa o plano. Falha de um título não interrompe os demais. */
export async function aplicarPlanoDeTitulos(api, plano) {
  const falhas = [];
  for (const item of plano.atualizar) {
    try {
      await api.entities.Cheque.update(item.id, item.dados);
    } catch (e) {
      falhas.push({ titulo: item.dados.check_number, erro: (e && e.message) || String(e) });
    }
  }
  for (const dados of plano.criar) {
    try {
      await api.entities.Cheque.create(dados);
    } catch (e) {
      falhas.push({ titulo: dados.check_number, erro: (e && e.message) || String(e) });
    }
  }
  for (const sobra of plano.remover) {
    try {
      await api.entities.Cheque.delete(sobra.id);
    } catch (e) {
      falhas.push({ titulo: sobra.check_number || sobra.id, erro: (e && e.message) || String(e) });
    }
  }
  return {
    atualizados: plano.atualizar.length - falhas.filter((f) => plano.atualizar.some((a) => a.dados.check_number === f.titulo)).length,
    criados: plano.criar.length - falhas.filter((f) => plano.criar.some((c) => c.check_number === f.titulo)).length,
    removidos: plano.remover.length,
    falhas,
  };
}

/**
 * Payload da operação (criação ou edição).
 *
 * Na EDIÇÃO os campos financeiros do M2/M3 são OMITIDOS de propósito: o
 * formulário não é dono deles.
 */
export function montarPayloadOperacao({ resumo, form, ctx, editando, numeroOperacao }) {
  const schedule = montarCronograma(resumo, { ...ctx, calcMode: ctx.calcModeEfetivo || ctx.calcMode });
  const ultimoVencimento = resumo.titulos
    .map((t) => t.vencimento)
    .filter(Boolean)
    .sort()
    .slice(-1)[0] || '';

  const base = {
    client_id: form.client_id || undefined,
    client_name: ctx.clientName || '',
    sacado_id: form.sacado_id || undefined,
    sacado_name: form.sacado_name || '',
    type: ctx.opType,
    produto: form.produto,
    produto_id: form.produto_id || undefined,
    calc_mode: ctx.calcMode,
    calculo_inverso: form.calculo_inverso || false,
    rate: resumo.rate,
    interest_type: form.interest_type,
    start_date: form.start_date,
    due_date: ultimoVencimento,
    days: ultimoVencimento ? daysBetween(form.start_date, ultimoVencimento) : 0,
    gross_value: resumo.valorLiquido,          // nome legado: guarda o LÍQUIDO
    net_value: resumo.valorLiquido,
    total_receivable: resumo.totalReceivable,
    tarifa_operacao: resumo.tarifaOperacao,
    tarifa_por_titulo: resumo.tarifaPorTitulo,
    float_dias: resumo.floatDias,
    projected_profit: resumo.projectedProfit,
    installments: resumo.n,
    installment_value: resumo.installmentValue,
    installment_schedule: schedule,
    balance_due: resumo.totalReceivable,
    notes: form.notes || '',
  };

  if (editando) return base;

  return {
    ...base,
    // Estado inicial NÃO viaja no corpo: `operacaoEditar` recusa `etapa` e
    // `status` vindos do navegador e grava "nova" + "ativo" por conta própria
    // (criação nasce sempre assim). Enviá-los fazia TODA criação de operação
    // ser recusada com 403. Aqui só vão os dados que a tela realmente coleta.
    numero_operacao: numeroOperacao,
    amount_paid: 0,
    cheques_compensados_total: 0,
    realized_profit: 0,
  };
}

/**
 * Salva a operação e reconcilia os títulos.
 *
 * @param {object} api - {entities:{Operation,Cheque}}
 * @param {object} entrada - {operacaoId, payload, desejados}
 * @returns {Promise<{operationId, criada, bloqueio?, falhas?}>}
 */
export async function salvarOperacao(api, { operacaoId, payload, desejados }) {
  let id = operacaoId || '';
  let criada = false;

  if (!id) {
    const criado = await api.entities.Operation.create(payload);
    id = criado.id;
    criada = true;
  } else {
    await api.entities.Operation.update(id, payload);
  }

  // O id da operação só existe depois do create: os títulos recebem o vínculo aqui.
  const alvo = (desejados || []).map((d) => ({ ...d, operation_id: id }));
  const existentes = await api.entities.Cheque.filter({ operation_id: id });
  const plano = planoDeTitulos(existentes, alvo);
  if (plano.bloqueio) return { operationId: id, criada, bloqueio: plano.bloqueio, falhas: [] };

  const aplicado = await aplicarPlanoDeTitulos(api, plano);
  return { operationId: id, criada, bloqueio: null, ...aplicado };
}

/** Próximo número de operação: o MAIOR existente, não o dos 500 mais recentes. */
export async function proximoNumeroOperacao(api) {
  const ultima = await api.entities.Operation.list('-numero_operacao', 1);
  const lista = Array.isArray(ultima) ? ultima : (ultima?.items || []);
  const maior = lista.reduce((max, o) => Math.max(max, Number(o.numero_operacao) || 0), 0);
  return maior + 1;
}