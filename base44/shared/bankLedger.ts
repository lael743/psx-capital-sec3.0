/**
 * D3 — PRIMITIVAS ATÔMICAS DE SALDO BANCÁRIO.
 *
 * Este módulo é PURO quanto a transporte: não importa o SDK. Recebe um `store`
 * com `updateWhere(query, update)` e devolve o resultado. Assim as mesmas
 * garantias são exercitadas por teste (store falso, concorrência real em
 * memória) e usadas em produção (store base44) sem reescrever a regra.
 *
 * ── O QUE A PLATAFORMA REALMENTE OFERECE ───────────────────────────────────
 *
 * NÃO existe transação entre documentos. O que existe é
 * `updateMany(query, update)`: atômico POR DOCUMENTO, com operadores do
 * MongoDB. É esse primitivo que serve de compare-and-swap.
 *
 * Por isso a idempotência do saldo vive NO PRÓPRIO DOCUMENTO DO BANCO — a
 * guarda, o incremento e o marcador viajam na MESMA escrita:
 *
 *   updateMany(
 *     { id: bankId, applied_ledger_keys: { $ne: eventKey } },
 *     { $inc: { current_balance: delta },
 *       $push: { applied_ledger_keys: eventKey } }
 *   )
 *
 * Consequências REAIS (verificadas, não presumidas):
 *  · dois incrementos concorrentes na MESMA conta não se perdem — `$inc` é
 *    aplicado pelo servidor sobre o valor vigente, não sobre uma leitura
 *    antiga do cliente;
 *  · o mesmo evento aplicado duas vezes não credita duas vezes — a segunda
 *    chamada não casa a guarda e devolve `ja_aplicado`;
 *  · NÃO há atomicidade ENTRE documentos: o lançamento em `CashFlow` e o
 *    saldo em `Banco` são duas escritas distintas. Quem fecha essa janela é a
 *    detecção + recuperação em `transferFlow.js` — nunca a suposição de
 *    transação.
 *
 * LIMITAÇÃO CONHECIDA: `applied_ledger_keys` cresce com o número de eventos
 * por conta. Purgar chaves antigas quebra a garantia do evento correspondente,
 * então a poda só pode remover eventos comprovadamente fora de qualquer janela
 * de reprocessamento.
 */

/** Campo do Banco que guarda as chaves de evento já aplicadas. */
export const LEDGER_KEYS_FIELD = 'applied_ledger_keys';

/**
 * Campo do Banco que guarda REIVINDICAÇÕES de efeito secundário (ex.: "quem
 * cria o lançamento desta perna"), como LISTA de chaves.
 *
 * Por que no BANCO e não no diário da transferência (D3.1): o Banco tem `id`
 * único, o diário não. Uma reivindicação gravada no diário só arbitra entre
 * execuções que enxergam O MESMO diário — e a criação concorrente pode gerar
 * dois. Gravada no banco, ela arbitra entre todas.
 *
 * Por que LISTA e não mapa chave→instante: a plataforma REJEITA caminho
 * pontilhado (`ledger_claims.<chave>`) quando o campo não existe no documento —
 * e os bancos já cadastrados não têm esse campo. Lista com `$ne` + `$push`
 * funciona mesmo com o campo ausente (é o mesmo mecanismo já usado com sucesso
 * em `applied_ledger_keys`). Verificado na plataforma, não presumido.
 *
 * CUSTO DESSA ESCOLHA: sem carimbo de tempo dentro da própria chave, a
 * reivindicação NÃO expira sozinha. O dono e o instante de aquisição ficam em
 * `CLAIM_META_FIELD`, gravados na MESMA escrita — é o que permite diagnóstico
 * (`classificarReivindicacao`) e liberação segura
 * (`liberarReivindicacaoVerificada`). O saldo nunca é afetado.
 */
export const CLAIMS_FIELD = 'ledger_claims';

/**
 * D3.2 — METADADOS de cada reivindicação: dono e instante de aquisição.
 *
 * Gravados com `$push` no MESMO update da chave em `CLAIMS_FIELD`, então uma
 * reivindicação nunca existe sem metadado nas aquisições novas: se o
 * compare-and-swap da chave perde, o update inteiro não é aplicado e nenhum
 * metadado órfão sobra.
 *
 * O metadado é também a GUARDA da liberação: `$pull` com filtro
 * `{ ledger_claim_meta: <metadado observado> }` só remove se aquela aquisição
 * exata ainda estiver lá. Sem isso, liberar uma reivindicação antiga poderia
 * apagar a reivindicação NOVA de outra execução, e as duas criariam o mesmo
 * lançamento. Verificado na plataforma: metadado divergente devolve `updated: 0`.
 */
export const CLAIM_META_FIELD = 'ledger_claim_meta';

/**
 * Idade a partir da qual uma reivindicação é SINALIZADA como suspeita de
 * abandono. Serve para diagnóstico e para exigir confirmação — NUNCA libera
 * nada sozinha. Idade não prova que o processo morreu, e liberar cedo permite
 * que outra execução crie o lançamento em paralelo à original.
 */
export const IDADE_SUSPEITA_MS = 5 * 60 * 1000;

/** Categoria de caixa das pernas de transferência. */
export const CATEGORIA_TRANSFERENCIA = 'transferencia_interna';

/** Origem declarada em CashFlow para as pernas de transferência. */
export const SOURCE_TRANSFERENCIA = 'transferencia_bancaria';

// ───────────────────────────── chaves de evento ────────────────────────────

/** `transfer:<id>:<perna>` — chave do efeito de saldo da perna. */
export function chavePerna(transferId, leg) {
  return `transfer:${transferId}:${leg}`;
}

/** Chave do evento de ESTORNO da perna. Distinta da original de propósito. */
export function chaveEstornoPerna(transferId, leg) {
  return `transfer:${transferId}:estorno:${leg}`;
}

/** Origem gravada em `CashFlow.source_id` — identifica a perna sem ambiguidade. */
export function origemPerna(transferId, leg) {
  return `${transferId}:${leg}`;
}

/** `kind:<id>` — chave genérica para eventos de operação (recebimento, repasse). */
export function chaveEvento(kind, id) {
  return `${kind}:${id}`;
}

/** Id estável para uma nova transferência. */
export function novoTransferId() {
  const g = globalThis.crypto;
  if (g && typeof g.randomUUID === 'function') return g.randomUUID();
  return `tr-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

// ───────────────────────────── aplicação atômica ───────────────────────────

/**
 * Aplica `delta` ao saldo de UMA conta, exatamente uma vez por `eventKey`.
 *
 * @param {Object} p
 * @param {{updateWhere:(q:object,u:object)=>Promise<{updated:number}>}} p.store
 * @param {string} p.bankId
 * @param {number} p.delta    positivo credita, negativo debita
 * @param {string} p.eventKey identidade do evento financeiro
 * @returns {Promise<{status:'aplicado'|'ja_aplicado'|'sem_conta'|'sem_efeito'}>}
 */
export async function applyBankDelta({ store, bankId, delta, eventKey }) {
  if (!bankId) return { status: 'sem_conta' };
  const valor = Number(delta);
  if (!Number.isFinite(valor) || valor === 0) return { status: 'sem_efeito' };
  if (!eventKey) throw new Error('[BankLedger] eventKey é obrigatório — sem ele não há idempotência');

  const res = await store.updateWhere(
    { id: bankId, [LEDGER_KEYS_FIELD]: { $ne: eventKey } },
    { $inc: { current_balance: valor }, $push: { [LEDGER_KEYS_FIELD]: eventKey } }
  );

  const updated = Number(res && res.updated) || 0;
  return { status: updated > 0 ? 'aplicado' : 'ja_aplicado' };
}

/**
 * Reivindica um efeito SECUNDÁRIO de um evento (normalmente a criação do
 * lançamento em `CashFlow`) no documento do banco.
 *
 * Compare-and-swap: só uma execução — qualquer que seja o diário que ela
 * esteja usando — recebe `true`. A chave e o metadado (dono + instante) entram
 * na MESMA escrita, então uma reivindicação nova nunca fica sem identificação.
 *
 * NÃO expira: uma execução morta deixa a chave gravada. A saída é
 * `liberarReivindicacaoVerificada`, que confere o efeito antes de remover.
 *
 * @param {Object} p
 * @param {string} [p.owner] identificação de quem reivindica (e-mail, execução)
 * @param {string} [p.agora] instante ISO, injetável para teste
 * @returns {Promise<boolean>} true se esta execução ganhou o direito de agir
 */
export async function claimBankEvent({ store, bankId, claimKey, owner, agora }) {
  if (!bankId) return false;
  if (!claimKey) throw new Error('[BankLedger] claimKey é obrigatório');

  const res = await store.updateWhere(
    { id: bankId, [CLAIMS_FIELD]: { $ne: claimKey } },
    {
      $push: {
        [CLAIMS_FIELD]: claimKey,
        [CLAIM_META_FIELD]: {
          chave: claimKey,
          owner: owner ? String(owner) : 'desconhecido',
          em: agora || new Date().toISOString(),
        },
      },
    }
  );

  return (Number(res && res.updated) || 0) > 0;
}

/** A chave está reivindicada neste documento de banco? (puro) */
export function temReivindicacao(doc, claimKey) {
  const chaves = doc && Array.isArray(doc[CLAIMS_FIELD]) ? doc[CLAIMS_FIELD] : [];
  return chaves.includes(claimKey);
}

/** Metadado da reivindicação neste documento de banco, ou null. (puro) */
export function metaDaReivindicacao(doc, claimKey) {
  const metas = doc && Array.isArray(doc[CLAIM_META_FIELD]) ? doc[CLAIM_META_FIELD] : [];
  return metas.find((m) => m && m.chave === claimKey) || null;
}

/**
 * Classifica o estado de uma reivindicação. PURO: recebe o que foi lido e
 * devolve o veredito — não libera, não escreve, não decide por idade.
 *
 * Estados possíveis entre reivindicar, aplicar saldo e criar o lançamento:
 *
 *  1. sem_reivindicacao      — ninguém reivindicou; o lançamento pode ser
 *                              criado direto (nada a liberar).
 *  2. efeito_ja_presente     — o lançamento JÁ existe. A reivindicação está
 *                              CUMPRIDA: liberá-la deixaria outra execução
 *                              abrir um segundo lançamento. Nunca liberável.
 *  3. orfã_confirmada        — reivindicada, sem lançamento. É a única
 *                              candidata a recuperação, e ainda assim exige
 *                              confirmação explícita.
 *
 * `idadeSuspeita` é AVISO, não permissão: uma reivindicação antiga continua
 * exigindo confirmação, e uma recente continua exigindo confirmação.
 */
export function classificarReivindicacao({
  reivindicada,
  lancamentoExiste,
  saldoAplicado,
  adquiridaEm,
  agora,
  limiarMs = IDADE_SUSPEITA_MS,
}) {
  const instante = agora ? new Date(agora).getTime() : Date.now();
  const adquirida = adquiridaEm ? new Date(adquiridaEm).getTime() : NaN;
  const idadeMs = Number.isFinite(adquirida) ? Math.max(0, instante - adquirida) : null;
  const idadeSuspeita = idadeMs != null && idadeMs > limiarMs;

  if (lancamentoExiste) {
    return {
      estado: 'efeito_ja_presente',
      liberavel: false,
      idadeMs,
      idade_suspeita: idadeSuspeita,
      motivo: 'O lançamento já existe: a reivindicação está cumprida e não deve ser liberada',
    };
  }
  if (!reivindicada) {
    return {
      estado: 'sem_reivindicacao',
      liberavel: false,
      idadeMs: null,
      idade_suspeita: false,
      motivo: 'Nenhuma reivindicação registrada: o lançamento pode ser criado direto',
    };
  }
  return {
    estado: 'orfã_confirmada',
    liberavel: true,
    idadeMs,
    idade_suspeita: idadeSuspeita,
    motivo: saldoAplicado
      ? 'Saldo aplicado, lançamento ausente e reivindicação sem efeito: órfã confirmada'
      : 'Saldo não aplicado, lançamento ausente e reivindicação presente: órfã confirmada',
  };
}

/**
 * Libera uma reivindicação pela chave, SEM conferir nada.
 *
 * ATENÇÃO: é o passo MECÂNICO, não a recuperação. Usar isto em fluxo de
 * recuperação permite apagar a reivindicação de um processo vivo e duplicar o
 * lançamento. A recuperação usa `liberarReivindicacaoVerificada`.
 */
export async function liberarReivindicacao({ store, bankId, claimKey }) {
  if (!bankId || !claimKey) return false;
  const res = await store.updateWhere(
    { id: bankId },
    { $pull: { [CLAIMS_FIELD]: claimKey, [CLAIM_META_FIELD]: { chave: claimKey } } }
  );
  return (Number(res && res.updated) || 0) > 0;
}

/** Lê o documento do banco (quando o store oferece `get`). */
async function lerDocumentoBanco(bancoStore, bankId) {
  if (!bancoStore || typeof bancoStore.get !== 'function' || !bankId) return null;
  return bancoStore.get(bankId);
}

/**
 * D3.2 — Libera uma reivindicação órfã SOMENTE depois de provar que o efeito
 * secundário não foi aplicado, e removendo apenas a aquisição observada.
 *
 * Ordem obrigatória:
 *  1. Confere se o lançamento já existe (`cashflowStore`). Se existir, NÃO
 *     libera: a reivindicação está cumprida e liberá-la abriria caminho para um
 *     segundo lançamento. Devolve `efeito_ja_aplicado` com o id encontrado.
 *  2. Só então remove a chave — com filtro pelo metadado observado
 *     (`{ ledger_claim_meta: meta }`), que a plataforma compara por valor. Se
 *     outra execução reivindicou de novo no meio do caminho, o filtro não casa
 *     e a liberação é recusada (`reivindicacao_mudou`), preservando a
 *     aquisição nova.
 *
 * NUNCA toca em saldo: nenhum `$inc`, nenhuma reaplicação de evento histórico.
 */
export async function liberarReivindicacaoVerificada({
  bancoStore,
  cashflowStore,
  bankId,
  claimKey,
  sourceType,
  observado,
}) {
  if (!bankId || !claimKey) return { liberada: false, motivo: 'parametros_invalidos' };

  // 1. O efeito existe? Então a reivindicação é legítima, não órfã.
  if (cashflowStore && typeof cashflowStore.filter === 'function') {
    const consulta = sourceType
      ? { source_id: claimKey, source_type: sourceType }
      : { source_id: claimKey };
    const achados = await cashflowStore.filter(consulta);
    const existentes = Array.isArray(achados) ? achados : (achados && achados.items) || [];
    if (existentes.length > 0) {
      return { liberada: false, motivo: 'efeito_ja_aplicado', lancamento_id: existentes[0].id };
    }
  }

  const doc = await lerDocumentoBanco(bancoStore, bankId);
  if (!doc || !temReivindicacao(doc, claimKey)) {
    return { liberada: false, motivo: 'sem_reivindicacao' };
  }

  const meta = observado || metaDaReivindicacao(doc, claimKey);

  // 2. Compare-and-swap no metadado: só remove a aquisição que foi observada.
  //    Reivindicação legada (sem metadado) é liberada apenas pela chave — é o
  //    que existe para conferir, e o efeito já foi verificado no passo 1.
  const filtro = meta ? { id: bankId, [CLAIM_META_FIELD]: meta } : { id: bankId };
  const res = await bancoStore.updateWhere(filtro, {
    $pull: { [CLAIMS_FIELD]: claimKey, [CLAIM_META_FIELD]: { chave: claimKey } },
  });

  const updated = Number(res && res.updated) || 0;
  return updated > 0
    ? { liberada: true, motivo: 'liberada', sem_metadado: !meta }
    : { liberada: false, motivo: 'reivindicacao_mudou' };
}

// ─────────────────────────── regra de transferência ────────────────────────

/** Validação da solicitação. Devolve mensagem ou null. */
export function validarTransferencia({ fromBankId, toBankId, amount }) {
  if (!fromBankId) return 'Conta de origem é obrigatória';
  if (!toBankId) return 'Conta de destino é obrigatória';
  if (fromBankId === toBankId) return 'Origem e destino devem ser contas diferentes';
  const valor = Number(amount);
  if (!Number.isFinite(valor) || valor <= 0) return 'Valor deve ser maior que zero';
  return null;
}

/**
 * Plano das duas pernas. Ambas carregam `bankId` — é o que corrige o defeito
 * histórico de pernas sem conta.
 */
export function planoDePernas({ transferId, fromBankId, toBankId, amount }) {
  const valor = Number(amount);
  return [
    {
      leg: 'saida',
      bankId: fromBankId,
      delta: -valor,
      type: 'saida',
      key: chavePerna(transferId, 'saida'),
      sourceId: origemPerna(transferId, 'saida'),
    },
    {
      leg: 'entrada',
      bankId: toBankId,
      delta: valor,
      type: 'entrada',
      key: chavePerna(transferId, 'entrada'),
      sourceId: origemPerna(transferId, 'entrada'),
    },
  ];
}

/** Plano do estorno: inverte sinal e conta, com chaves próprias. */
export function planoDeEstorno({ transferId, fromBankId, toBankId, amount }) {
  const valor = Number(amount);
  return [
    {
      leg: 'entrada',
      bankId: fromBankId,
      delta: valor,
      type: 'entrada',
      key: chaveEstornoPerna(transferId, 'entrada'),
      sourceId: `${transferId}:estorno:entrada`,
    },
    {
      leg: 'saida',
      bankId: toBankId,
      delta: -valor,
      type: 'saida',
      key: chaveEstornoPerna(transferId, 'saida'),
      sourceId: `${transferId}:estorno:saida`,
    },
  ];
}

/**
 * Diagnóstico do diário — o que está aplicado, o que ficou pela metade.
 * Puro: recebe o registro e devolve o estado. Não corrige nada.
 */
export function diagnosticarTransferencia(doc) {
  if (!doc) return { status: 'ausente', completo: false, parcial: false, pernas: [] };

  const legs = doc.legs || {};
  const pernas = ['saida', 'entrada'].map((leg) => {
    const l = legs[leg] || {};
    const saldoAplicado = l.banco === 'aplicado' || l.banco === 'ja_aplicado';
    const lancamentoPresente = Boolean(l.cashflow_id);
    return {
      leg,
      saldo_aplicado: saldoAplicado,
      lancamento_presente: lancamentoPresente,
      // Efeito pela metade: o saldo mudou e o lançamento não existe.
      incompleta: saldoAplicado && !lancamentoPresente,
    };
  });

  const aplicadas = pernas.filter((p) => p.saldo_aplicado).length;
  return {
    status: doc.status || 'pendente',
    pernas,
    aplicadas,
    completo: aplicadas === 2 && pernas.every((p) => p.lancamento_presente),
    parcial: aplicadas > 0 && aplicadas < 2,
    recuperavel: pernas.some((p) => p.incompleta),
  };
}