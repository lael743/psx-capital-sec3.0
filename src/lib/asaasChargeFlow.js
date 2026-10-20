/**
 * FASE D1.4 — Máquina de estados da EMISSÃO de cobranças Asaas.
 *
 * ⚠️ Este arquivo existe em DUAS cópias IDÊNTICAS:
 *      base44/shared/asaasChargeFlow.js  (backend — usado por asaasCreateCharge)
 *      src/lib/asaasChargeFlow.js        (frontend — exercitado pelos testes)
 *    O bloco entre os marcadores @sync é comparado byte a byte e o teste falha
 *    se divergirem — mesma convenção de operationAccounting.js,
 *    asaasEventJournal.js e asaasReceiptFlow.js.
 *
 *    O módulo é PURO: recebe o cliente `base44` por parâmetro e não importa
 *    nada da plataforma. Por isso pode viver nos dois lados da fronteira e ser
 *    testado diretamente, em vez de reimplementado nos testes.
 *
 * ── O DEFEITO QUE ESTA FASE CORRIGE ─────────────────────────────────────────
 *
 * A emissão fazia POST /payments e SÓ DEPOIS gravava o identificador na
 * parcela. Se a resposta se perdesse (timeout) ou o processo morresse no meio,
 * o PSX não tinha registro algum de que uma cobrança PODERIA existir no Asaas.
 * A tentativa seguinte criava OUTRO boleto para a mesma parcela — e o sacado
 * recebia dois. Não havia estado persistente para distinguir "não pedi" de
 * "pedi e não sei o resultado".
 *
 * ── POR QUE A REIVINDICAÇÃO VIVE NA OPERAÇÃO ────────────────────────────────
 *
 * Exclusividade exige uma escrita atômica sobre UM documento. Criar-e-depois-
 * reivindicar não é atômico: dois processos simultâneos criariam o mesmo
 * registro de intenção. A operação é o documento único que já existe e já é
 * usado assim pela D1.3 (asaas_lancamentos_ts). A intenção vive no mapa
 * `asaas_intents`, chaveada pelo índice da parcela (ou por 'op' quando a
 * cobrança é da operação inteira), e reivindicar é um compare-and-swap nesse
 * documento — indivisível.
 *
 * ── O ASAAS NÃO OFERECE CHAVE DE IDEMPOTÊNCIA ───────────────────────────────
 *
 * Verificado na documentação oficial: `externalReference` é descrito como
 * "campo livre de busca", SEM garantia de unicidade, e POST /payments não
 * aceita cabeçalho de idempotência. NÃO inventamos esse parâmetro nem
 * presumimos uma garantia que o provedor não oferece. A garantia é construída
 * aqui; a resposta ambígua é resolvida por CONSULTA
 * (GET /payments?externalReference=), que a própria documentação recomenda
 * para "consultas pontuais, recuperação ou conciliação".
 *
 * ── A REGRA DE OURO ─────────────────────────────────────────────────────────
 *
 * Uma tentativa que sai de `reconciliacao_pendente` CONSULTA ANTES DE CRIAR, e
 * só cria quando a consulta prova que a cobrança não existe. Nunca se emite um
 * segundo boleto por não se saber o resultado do primeiro. Se nem a consulta
 * for conclusiva, a tentativa permanece pendente — nunca vira uma emissão
 * cega.
 */

/* @sync:start — bloco idêntico em base44/shared/asaasChargeFlow.js */

/**
 * Estados da INTENÇÃO de emissão. Descrevem o que sabemos sobre a cobrança,
 * não o que o Asaas respondeu:
 *   solicitando           — intenção persistida, provedor ainda não confirmou
 *   criada                — cobrança existe no Asaas e o id está gravado
 *   falha_recuperavel     — rejeição definitiva (4xx); nada foi criado
 *   falha_definitiva      — esgotou as tentativas; exige intervenção manual
 *   reconciliacao_pendente— resposta ambígua: pode existir; CONSULTAR antes
 *   cancelada             — cancelada deliberadamente; libera nova emissão
 */
export const COBRANCA_STATUS = {
  SOLICITANDO: 'solicitando',
  CRIADA: 'criada',
  FALHA_RECUPERAVEL: 'falha_recuperavel',
  FALHA_DEFINITIVA: 'falha_definitiva',
  RECONCILIACAO_PENDENTE: 'reconciliacao_pendente',
  CANCELADA: 'cancelada',
};

/** Tentativas de emissão antes de a falha ser considerada definitiva. */
export const MAX_TENTATIVAS_COBRANCA = 5;

/** Tolerância antes de uma emissão ativa ser considerada abandonada. */
export const CHARGE_STALE_SECONDS = 120;

/** Slot da intenção quando a cobrança é da operação inteira (sem parcelas). */
export const SLOT_OPERACAO = 'op';

/**
 * Identidade ESTÁVEL da intenção de emissão.
 *
 * Vincula operação, parcela e GERAÇÃO. A geração é o que distingue uma
 * reemissão legítima (após cancelamento) de uma duplicata acidental: mesma
 * parcela, identidade nova. Sem ela, uma reemissão autorizada seria
 * indistinguível de um segundo boleto criado por engano.
 */
export function intentKey(operationId, slot, generation) {
  return `cob:${operationId}:${slot}:g${Number(generation) || 1}`;
}

/** Caminho pontilhado do campo da intenção no documento da operação. */
export function campoIntent(slot, campo) {
  const base = `asaas_intents.${slot}`;
  return campo ? `${base}.${campo}` : base;
}

/**
 * Campos da COBRANÇA gravados na parcela. Atualização PONTUAL: só estes
 * campos são tocados, e nenhum deles pertence a outra parcela.
 */
export function camposCobrancaParcela(idx, info) {
  const p = `installment_schedule.${Number(idx)}`;
  const i = info || {};
  return {
    [`${p}.asaas_payment_id`]: i.payment_id || '',
    [`${p}.asaas_billing_type`]: i.billing_type || '',
    [`${p}.asaas_invoice_url`]: i.invoice_url || '',
    [`${p}.asaas_pix_qrcode`]: i.pix_qrcode || '',
    [`${p}.asaas_boleto_line`]: i.boleto_line || '',
    [`${p}.asaas_payment_status`]: i.status || 'pending',
  };
}

/** Campos da cobrança quando ela é da operação inteira. */
export function camposCobrancaOperacao(info) {
  const i = info || {};
  return {
    asaas_payment_id: i.payment_id || '',
    asaas_billing_type: i.billing_type || '',
    asaas_invoice_url: i.invoice_url || '',
    asaas_pix_qrcode: i.pix_qrcode || '',
    asaas_boleto_line: i.boleto_line || '',
    asaas_payment_status: i.status || 'pending',
  };
}

/**
 * Decide o que fazer a partir do estado PERSISTIDO da intenção.
 * Pura: nenhum acesso a banco, nenhuma chamada ao provedor.
 */
export function planEmission(intent) {
  const st = (intent && intent.status) || '';
  return {
    // Estado ambíguo: é OBRIGATÓRIO consultar o provedor antes de criar.
    //
    // `solicitando` entra aqui porque, para chegarmos a reivindicar, ele
    // precisa estar ABANDONADO (a reivindicação ativa não casa com o filtro) —
    // e uma emissão abandonada pode ter chamado o provedor sem conseguir
    // gravar a resposta. Criar sem consultar arriscaria o segundo boleto.
    //
    // Uma PRIMEIRA emissão não passa por aqui: sem intenção não há nada a
    // consultar, e o custo de uma consulta extra seria pago sem motivo.
    reconciliarPrimeiro:
      st === COBRANCA_STATUS.RECONCILIACAO_PENDENTE || st === COBRANCA_STATUS.SOLICITANDO,
    // Cobrança já criada nunca é recriada — é reutilizada.
    reutilizar: st === COBRANCA_STATUS.CRIADA,
    criar: st !== COBRANCA_STATUS.CRIADA,
    // Reemissão deliberada (após cancelamento) é uma NOVA identidade.
    generationIncrementa: st === COBRANCA_STATUS.CANCELADA,
  };
}

/** Geração da próxima intenção. */
export function proximaGeneration(intent) {
  const g = Number(intent && intent.generation) || 0;
  if (planEmission(intent).generationIncrementa) return g + 1;
  return g > 0 ? g : 1;
}

/**
 * Classifica o erro do provedor. CONSERVADOR por construção: só é "definitivo"
 * quando o Asaas respondeu 4xx — ou seja, rejeitou e nada foi criado. Falha de
 * rede e 5xx são AMBÍGUOS: o servidor pode ter criado a cobrança antes de
 * falhar. Tratar 5xx como "nada criado" é exatamente o que produz boleto
 * duplicado.
 */
export function classifyChargeError(err) {
  const status = err && err.status;
  if (!status) return 'ambiguo';
  if (status >= 500) return 'ambiguo';
  return 'definitivo';
}

/** Próximo estado após uma falha, contando tentativas. */
export function proximoEstadoCobranca(attempts) {
  return (Number(attempts) || 0) >= MAX_TENTATIVAS_COBRANCA
    ? COBRANCA_STATUS.FALHA_DEFINITIVA
    : COBRANCA_STATUS.FALHA_RECUPERAVEL;
}

/**
 * Elegibilidade da reivindicação de emissão.
 *
 * `criada` NÃO casa: enquanto a cobrança existir, ninguém emite outra.
 * `solicitando` só casa quando ABANDONADA — uma emissão ativa é de quem a
 * detém.
 */
export function claimFilter(slot, staleIso) {
  const s = campoIntent(slot, 'status');
  return {
    $or: [
      { [s]: { $exists: false } },
      { [s]: COBRANCA_STATUS.FALHA_RECUPERAVEL },
      { [s]: COBRANCA_STATUS.RECONCILIACAO_PENDENTE },
      { [s]: COBRANCA_STATUS.CANCELADA },
      { [s]: COBRANCA_STATUS.SOLICITANDO, [campoIntent(slot, 'claimed_at')]: { $lt: staleIso } },
    ],
  };
}

/**
 * Atualiza campos de UMA parcela, CONDICIONADO ao identificador de cobrança
 * observado na leitura.
 *
 * É esta condição que impede uma resposta ANTIGA sobrescrever uma cobrança
 * NOVA: se a parcela já aponta para outro pagamento — porque uma reemissão
 * correu em paralelo — a escrita é recusada e o vínculo novo permanece
 * intacto. Sem ela, um refresh de status que leu a parcela antes da reemissão
 * apagava o vínculo recém-criado.
 *
 * `entities` é o cliente de entidades (o do usuário ou o de serviço — quem
 * chama decide). Devolve `true` só quando a escrita realmente aconteceu.
 */
export async function atualizarParcelaCondicional(entities, opId, idx, observadoId, patch) {
  const campos = patch || {};
  if (Object.keys(campos).length === 0) return false;

  const base = `installment_schedule.${Number(idx)}`;
  const res = await entities.Operation.updateMany(
    { id: opId, [`${base}.asaas_payment_id`]: observadoId },
    { $set: campos }
  );
  return !!res && res.updated === 1;
}

/** Registro inicial de uma intenção — usado só na primeira emissão. */
export function novoIntent(slot, key, generation, nowIso) {
  return {
    intent_key: key,
    slot: String(slot),
    generation: Number(generation) || 1,
    status: COBRANCA_STATUS.SOLICITANDO,
    claimed_at: nowIso || '',
    external_payment_id: '',
    attempts: 0,
    last_error: '',
    history: [{ at: nowIso || '', event: 'solicitando', generation: Number(generation) || 1 }],
  };
}

/* ── Transições (impuras: escrevem no documento único) ─────────────────────── */

/**
 * Reivindica a emissão deste slot. Exatamente uma execução vence o
 * compare-and-swap; as demais recebem `updated === 0` e NÃO chamam o provedor.
 * É isto que impede dois boletos para a mesma parcela em cliques simultâneos.
 */
export async function claimEmission(base44, opId, slot, key, generation, nowIso, staleIso) {
  const res = await base44.asServiceRole.entities.Operation.updateMany(
    { id: opId, ...claimFilter(slot, staleIso) },
    {
      $set: {
        [campoIntent(slot, 'status')]: COBRANCA_STATUS.SOLICITANDO,
        [campoIntent(slot, 'claimed_at')]: nowIso,
        [campoIntent(slot, 'intent_key')]: key,
        [campoIntent(slot, 'slot')]: String(slot),
        [campoIntent(slot, 'generation')]: Number(generation) || 1,
        [campoIntent(slot, 'external_payment_id')]: '',
        [campoIntent(slot, 'last_error')]: '',
      },
      $push: {
        [campoIntent(slot, 'history')]: {
          at: nowIso,
          event: 'solicitando',
          generation: Number(generation) || 1,
        },
      },
    }
  );
  return !!res && res.updated === 1;
}

/**
 * Persiste a cobrança criada — o identificador externo e os campos da parcela
 * na MESMA escrita, guardados por `status === solicitando`.
 *
 * Uma escrita só, um documento só: ou o estado da intenção avança E a parcela
 * recebe o id, ou nada acontece. Nunca existe o meio-termo "id gravado mas
 * intenção ainda solicitando" que obrigava a conciliação adivinhar.
 *
 * A guarda é o que impede uma resposta ANTIGA sobrescrever uma cobrança NOVA:
 * se outra execução já avançou o estado, `updated === 0` e a parcela não é
 * tocada.
 */
export async function markChargeCreated(base44, opId, slot, info, campos, nowIso) {
  const res = await base44.asServiceRole.entities.Operation.updateMany(
    {
      id: opId,
      [campoIntent(slot, 'status')]: COBRANCA_STATUS.SOLICITANDO,
      // A guarda inclui o CARIMBO da reivindicação: se outra execução assumiu
      // esta emissão (reivindicação abandonada), não somos mais donos dela e
      // esta resposta — que pode ser mais antiga que a cobrança atual — não
      // pode sobrescrever nada.
      [campoIntent(slot, 'claimed_at')]: nowIso,
    },
    {
      $set: {
        [campoIntent(slot, 'status')]: COBRANCA_STATUS.CRIADA,
        [campoIntent(slot, 'external_payment_id')]: (info && info.payment_id) || '',
        [campoIntent(slot, 'last_error')]: '',
        [campoIntent(slot, 'attempts')]: 0,
        ...(campos || {}),
      },
      $push: {
        [campoIntent(slot, 'history')]: {
          at: nowIso,
          event: 'criada',
          payment_id: (info && info.payment_id) || '',
        },
      },
    }
  );
  return !!res && res.updated === 1;
}

/** Rejeição definitiva do provedor: nada foi criado, é seguro tentar de novo. */
export async function markChargeFailed(base44, opId, slot, erro, attempts, nowIso) {
  const n = (Number(attempts) || 0) + 1;
  const msg = String(erro || '').slice(0, 300);
  const res = await base44.asServiceRole.entities.Operation.updateMany(
    {
      id: opId,
      [campoIntent(slot, 'status')]: COBRANCA_STATUS.SOLICITANDO,
      [campoIntent(slot, 'claimed_at')]: nowIso,
    },
    {
      $set: {
        [campoIntent(slot, 'status')]: proximoEstadoCobranca(n),
        [campoIntent(slot, 'last_error')]: msg,
        [campoIntent(slot, 'attempts')]: n,
        [campoIntent(slot, 'claimed_at')]: '',
      },
      $push: { [campoIntent(slot, 'history')]: { at: nowIso, event: 'falha', error: msg } },
    }
  );
  return !!res && res.updated === 1;
}

/**
 * Resposta AMBÍGUA: o resultado é desconhecido. O estado passa a exigir
 * consulta antes de qualquer nova criação — é a garantia de que não se emite
 * um segundo boleto por não se saber do primeiro.
 */
export async function markChargeAmbiguous(base44, opId, slot, erro, nowIso) {
  const msg = String(erro || '').slice(0, 300);
  const res = await base44.asServiceRole.entities.Operation.updateMany(
    {
      id: opId,
      [campoIntent(slot, 'status')]: COBRANCA_STATUS.SOLICITANDO,
      [campoIntent(slot, 'claimed_at')]: nowIso,
    },
    {
      $set: {
        [campoIntent(slot, 'status')]: COBRANCA_STATUS.RECONCILIACAO_PENDENTE,
        [campoIntent(slot, 'last_error')]: msg,
        [campoIntent(slot, 'claimed_at')]: '',
      },
      $push: {
        [campoIntent(slot, 'history')]: { at: nowIso, event: 'reconciliacao_pendente', error: msg },
      },
    }
  );
  return !!res && res.updated === 1;
}

/**
 * Cancela a intenção. Libera a reemissão — que será uma NOVA geração, portanto
 * uma identidade nova, e não uma duplicata da anterior.
 */
export async function markChargeCancelled(base44, opId, slot, nowIso) {
  const res = await base44.asServiceRole.entities.Operation.updateMany(
    { id: opId },
    {
      $set: {
        [campoIntent(slot, 'status')]: COBRANCA_STATUS.CANCELADA,
        [campoIntent(slot, 'claimed_at')]: '',
      },
      $push: { [campoIntent(slot, 'history')]: { at: nowIso, event: 'cancelada' } },
    }
  );
  return !!res && res.updated === 1;
}

/**
 * Um slot precisa de atenção humana? Usado para reportar o que a recuperação
 * automática não consegue resolver sozinha.
 */
export function intentPrecisaIntervencao(intent) {
  return !!intent && intent.status === COBRANCA_STATUS.FALHA_DEFINITIVA;
}

/** A intenção está pendente de conciliação com o provedor? */
export function intentPendenteReconciliacao(intent) {
  return !!intent && intent.status === COBRANCA_STATUS.RECONCILIACAO_PENDENTE;
}

/**
 * Reconcilia `ciclos_pagos` com a lista de identidades já contabilizadas.
 * A lista é a verdade; o contador é derivado dela. Assim uma reentrega nunca
 * conta o mesmo pagamento duas vezes, e um contador que ficou atrás por uma
 * falha parcial converge na próxima passagem.
 */
export function contadorDeCiclos(processados) {
  return Array.isArray(processados) ? processados.length : 0;
}

/* ── Orquestração da emissão ───────────────────────────────────────────────── */

/**
 * Emite a cobrança de UM slot. Idempotente e recuperável.
 *
 * O acesso ao provedor entra por `provedor`, um adaptador com três funções:
 *   criar(payload)            → cobrança normalizada, ou lança
 *   consultar(externalRef)    → lista de cobranças normalizadas
 *   pix(paymentId, billing)   → payload do QR Code ('' se indisponível)
 *
 * A cobrança normalizada é `{ id, billingType, invoiceUrl, bankSlipCode,
 * boletoLine, status }` — com `status` JÁ traduzido para o vocabulário
 * interno. Quem traduz é o adaptador, para que este módulo não dependa da
 * tabela de status do provedor.
 */
export async function emitirCobranca(base44, opts) {
  const o = opts || {};
  const operation = o.operation;
  const slot = o.slot;
  const alvo = o.alvo;
  const provedor = o.provedor || {};
  const nowIso = o.nowIso || new Date().toISOString();
  const staleIso = o.staleIso || new Date(Date.now() - CHARGE_STALE_SECONDS * 1000).toISOString();

  const intent = ((operation.asaas_intents || {})[String(slot)]) || null;
  const plan = planEmission(intent);

  // Cobrança já criada: REUTILIZA. Chamar o endpoint de novo nunca emite uma
  // segunda cobrança para a mesma parcela.
  if (plan.reutilizar && alvo.paymentIdAtual) {
    return {
      slot,
      parcela: alvo.rotulo,
      ok: true,
      reutilizada: true,
      payment_id: alvo.paymentIdAtual,
    };
  }

  const generation = proximaGeneration(intent);
  const key = intentKey(operation.id, slot, generation);

  // Exclusividade: exatamente uma execução vence e chama o provedor.
  const venceu = await claimEmission(base44, operation.id, slot, key, generation, nowIso, staleIso);
  if (!venceu) {
    return { slot, parcela: alvo.rotulo, ok: false, motivo: 'emissao_em_andamento' };
  }

  const ctx = { operationId: operation.id, slot, alvo, provedor, nowIso };

  // Estado ambíguo: CONSULTAR ANTES DE CRIAR.
  if (plan.reconciliarPrimeiro) {
    const rec = await reconciliarCobranca(base44, { ...ctx, key });
    if (rec.encontrado) {
      // `duplicadas > 1` é anomalia real: existem cobranças extras no provedor
      // que não foram canceladas (cancelar exige autorização humana). Propagar
      // o número mantém a situação VISÍVEL em vez de silenciosa.
      return {
        slot,
        parcela: alvo.rotulo,
        ok: true,
        reconciliada: true,
        payment_id: rec.payment_id,
        duplicadas: rec.duplicadas,
      };
    }
    if (rec.indeterminado) {
      // Nem a consulta foi conclusiva. A intenção VOLTA a
      // `reconciliacao_pendente`: deixá-la em `solicitando` descreveria uma
      // emissão ativa quando o que existe é uma dúvida à espera do provedor —
      // e o estado precisa dizer a verdade sobre o que se sabe.
      await markChargeAmbiguous(base44, operation.id, slot, 'conciliação inconclusiva', nowIso);
      return { slot, parcela: alvo.rotulo, ok: false, motivo: 'reconciliacao_indeterminada' };
    }
    // ausente → a cobrança não existe; criar agora é seguro.
  }

  let charge = null;
  try {
    charge = await provedor.criar({ ...alvo.payload, externalReference: key });
  } catch (e) {
    if (classifyChargeError(e) === 'ambiguo') {
      return await tratarAmbiguidade(base44, { ...ctx, key, erro: e && e.message });
    }
    await markChargeFailed(base44, operation.id, slot, e && e.message, intent && intent.attempts, nowIso);
    return { slot, parcela: alvo.rotulo, ok: false, motivo: 'falha_emissao' };
  }

  if (!charge || !charge.id) {
    return await tratarAmbiguidade(base44, { ...ctx, key, erro: 'resposta sem identificador' });
  }

  return await persistirCobranca(base44, { ...ctx, charge });
}

/**
 * Resposta ambígua: marca pendente de conciliação e tenta conciliar já. Se não
 * conseguir provar nada, permanece pendente — e a próxima tentativa consultará
 * de novo antes de criar.
 */
async function tratarAmbiguidade(base44, o) {
  await markChargeAmbiguous(base44, o.operationId, o.slot, o.erro, o.nowIso);
  const rec = await reconciliarCobranca(base44, o);
  if (rec.encontrado) {
    return {
      slot: o.slot,
      parcela: o.alvo.rotulo,
      ok: true,
      reconciliada: true,
      payment_id: rec.payment_id,
      duplicadas: rec.duplicadas,
    };
  }
  return { slot: o.slot, parcela: o.alvo.rotulo, ok: false, motivo: 'reconciliacao_pendente' };
}

/**
 * Procura no provedor a cobrança desta intenção.
 *
 * Três resultados, e a diferença entre eles é o que evita o boleto duplicado:
 *   encontrado    — grava o identificador (recuperação bem-sucedida)
 *   ausente       — a cobrança não existe; criar é seguro
 *   indeterminado — a consulta falhou; NÃO se cria
 */
async function reconciliarCobranca(base44, o) {
  let encontrados;
  try {
    encontrados = await o.provedor.consultar(o.key);
  } catch (_) {
    return { encontrado: false, indeterminado: true };
  }

  // MAIS DE UMA cobrança para a mesma referência é ANOMALIA. A decisão é:
  // adotar a de identificador estável (menor id) e NUNCA emitir uma terceira.
  // Ordenar por id remove a dependência da ordem em que o provedor devolve a
  // lista — antes, `.find()` adotava uma cobrança arbitrária, e duas retomadas
  // podiam adotar cobranças diferentes. A anomalia é reportada em `duplicadas`
  // para ficar observável em vez de silenciosa.
  const vivos = (encontrados || [])
    .filter((p) => p && p.status !== 'deleted')
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));

  if (vivos.length === 0) return { encontrado: false, indeterminado: false };
  const vivo = vivos[0];

  const r = await persistirCobranca(base44, { ...o, charge: vivo });
  if (!r.ok) return { encontrado: false, indeterminado: true };
  return { encontrado: true, payment_id: vivo.id, duplicadas: vivos.length };
}

/** Grava a cobrança e os campos da parcela na MESMA escrita condicional. */
async function persistirCobranca(base44, o) {
  const charge = o.charge || {};
  const billingType = charge.billingType || (o.alvo && o.alvo.billing_type) || '';

  let pix = '';
  try {
    pix = (await o.provedor.pix(charge.id, billingType)) || '';
  } catch (_) {
    pix = ''; // não crítico: a cobrança existe mesmo sem o QR carregado
  }

  const info = {
    payment_id: charge.id,
    billing_type: billingType,
    invoice_url: charge.invoiceUrl || '',
    pix_qrcode: pix,
    boleto_line: charge.bankSlipCode || charge.boletoLine || '',
    status: charge.status || 'pending',
  };

  let gravou = false;
  try {
    gravou = await markChargeCreated(base44, o.operationId, o.slot, info, o.alvo.campos(info), o.nowIso);
  } catch (e) {
    // A cobrança EXISTE no provedor e NÃO conseguimos gravá-la. Isto é
    // exatamente o estado ambíguo — jamais `solicitando`, que após a
    // tolerância autorizaria uma nova emissão e produziria o segundo boleto
    // que esta fase existe para impedir.
    try {
      await markChargeAmbiguous(base44, o.operationId, o.slot, `falha ao gravar identificador: ${e && e.message}`, o.nowIso);
    } catch (_) {
      /* a reivindicação abandonada ainda força a conciliação na retomada */
    }
    return {
      slot: o.slot,
      parcela: o.alvo.rotulo,
      ok: false,
      motivo: 'reconciliacao_pendente',
      payment_id: charge.id,
    };
  }

  if (!gravou) {
    // O estado da intenção mudou sob nós — outra execução tomou a
    // reivindicação abandonada. A cobrança EXISTE no provedor, mas gravar a
    // parcela agora poderia sobrescrever uma cobrança mais recente. Não
    // gravamos: a conciliação recupera este identificador.
    return {
      slot: o.slot,
      parcela: o.alvo.rotulo,
      ok: false,
      motivo: 'estado_alterado',
      payment_id: charge.id,
    };
  }

  return { slot: o.slot, parcela: o.alvo.rotulo, ok: true, payment_id: charge.id };
}

/**
 * Emite um LOTE. Cada parcela tem sua própria intenção, resultado e tratamento
 * de falha: uma falha não derruba as demais, e o lote NÃO é declarado
 * concluído quando apenas parte teve sucesso.
 */
export async function emitirLote(base44, opts) {
  const o = opts || {};
  const resultados = [];
  for (const item of o.itens || []) {
    resultados.push(await emitirCobranca(base44, { ...o, slot: item.slot, alvo: item.alvo }));
  }
  return resumirLote(resultados);
}

/** Resumo honesto do lote: `success` só quando TODAS as parcelas tiveram êxito. */
export function resumirLote(resultados) {
  const lista = resultados || [];
  const charges = lista
    .filter((r) => r.ok && r.payment_id)
    .map((r) => ({ parcela: r.parcela, payment_id: r.payment_id }));
  const pendentes = lista.filter((r) => !r.ok);

  return {
    success: pendentes.length === 0,
    parcial: pendentes.length > 0 && lista.some((r) => r.ok),
    charges,
    total_charges: charges.length,
    resultados: lista.map((r) => ({
      slot: r.slot,
      parcela: r.parcela === undefined ? null : r.parcela,
      ok: !!r.ok,
      motivo: r.motivo || '',
      payment_id: r.payment_id || '',
      reutilizada: !!r.reutilizada,
      reconciliada: !!r.reconciliada,
    })),
    pendentes: pendentes.length,
  };
}

/* @sync:end */