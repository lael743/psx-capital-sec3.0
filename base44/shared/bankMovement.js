/**
 * D4.2 — MOVIMENTO BANCÁRIO CENTRALIZADO.
 *
 * Um único lugar decide como um evento financeiro vira (saldo + lançamento).
 * Módulo PURO quanto a transporte: recebe os stores por parâmetro.
 *
 * ── O QUE ELE GARANTE, E COMO ──────────────────────────────────────────────
 *
 * 1. SALDO UMA VEZ SÓ — `applyBankDelta` incrementa e grava a chave do evento
 *    na MESMA escrita, com guarda `$ne`. Repetir o evento não soma de novo.
 *
 * 2. LANÇAMENTO 1:1 COM O SALDO — só a execução que APLICOU o delta cria o
 *    `CashFlow`. Quem chega depois recebe `ja_aplicado` e não cria nada.
 *
 * 3. LANÇAMENTO SEM SALDO (remessa/retorno, que são controle e não movem
 *    dinheiro) — a exclusividade vem de `claimBankEvent` no documento do banco,
 *    antes de criar. Duas abas com o mesmo `eventId` não geram dois registros.
 *
 * ── O QUE ELE **NÃO** FAZ ──────────────────────────────────────────────────
 *
 * NÃO reaplica saldo em recuperação. Se o processo morreu entre o delta e o
 * lançamento, `diagnosticarMovimento` APONTA a divergência (`saldo_sem_
 * lancamento`) e para aí: quem completa é uma decisão explícita, nunca um
 * efeito colateral de uma nova tentativa. Recreditar "por precaução" é
 * exatamente como se perde dinheiro.
 *
 * ── CHAVES ─────────────────────────────────────────────────────────────────
 *
 * `lancamento_avulso:<eventId>` — `eventId` é estável por TENTATIVA (gerado ao
 *   abrir o modal). Repetir o clique é o mesmo evento; lançar dois valores
 *   iguais de propósito são dois eventos. Por isso a chave NÃO é derivada de
 *   valor+data: seria impossível lançar dois iguais.
 * `lucro_prorrogacao:<cheque>:<data>:<valor>` — determinística pelo negócio:
 *   a mesma prorrogação pode gerar lucros distintos em datas distintas.
 * `remessa_banco:<eventId>` / `cheque_devolvido:<eventId>` — controle.
 *
 * ── CÓPIA DUPLICADA ────────────────────────────────────────────────────────
 *
 * Existe em `src/lib/bankMovement.js` (testes) e `base44/shared/bankMovement.js`
 * (função de servidor). Idênticos exceto pelo especificador do import do
 * `bankLedger`; o teste D4.2.14 compara os bytes depois de normalizar essa
 * linha. Alterar a regra em um só lado é alterar o comportamento real.
 */
import { applyBankDelta, claimBankEvent, chaveEvento, LEDGER_KEYS_FIELD } from './bankLedger.ts';

export { chaveEvento };

export const TIPOS = Object.freeze({ ENTRADA: 'entrada', SAIDA: 'saida' });

/** Formas de pagamento aceitas nos recebimentos de lucro. */
export const FORMAS_PAGAMENTO = Object.freeze(['pix', 'dinheiro', 'transferencia', 'cheque']);

/** Destinos possíveis de um retorno de cheques. */
export const DESTINOS_RETORNO = Object.freeze(['tesouraria', 'financeiro', 'em_maos']);

/** Eventos que movem saldo — os únicos em que `applied_ledger_keys` importa. */
const EVENTOS_COM_SALDO = new Set(['lancamento_avulso', 'lucro_prorrogacao']);

/** Tipo do evento = prefixo da chave. `lucro_prorrogacao:a:b:c` → lucro_prorrogacao. */
export function tipoDoEvento(eventKey) {
  return String(eventKey || '').split(':')[0];
}

export function eventoTemSaldo(eventKey) {
  return EVENTOS_COM_SALDO.has(tipoDoEvento(eventKey));
}

// ───────────────────────────── chaves de evento ────────────────────────────

export function chaveLancamentoAvulso(eventId) {
  return chaveEvento('lancamento_avulso', eventId);
}

export function chaveLucroProrrogacao(chequeId, data, valor) {
  return chaveEvento('lucro_prorrogacao', `${chequeId}:${data}:${Number(valor)}`);
}

export function chaveRemessa(eventId) {
  return chaveEvento('remessa_banco', eventId);
}

export function chaveRetorno(eventId) {
  return chaveEvento('cheque_devolvido', eventId);
}

// ───────────────────────────── validações ──────────────────────────────────

/** Mesmas mensagens que a tela já mostrava — o servidor passa a ser a fonte. */
export function validarLancamentoAvulso({ tipo, valor, motivo, data }) {
  if (![TIPOS.ENTRADA, TIPOS.SAIDA].includes(tipo)) return 'Tipo de lançamento inválido.';
  const v = Number(valor);
  if (!Number.isFinite(v) || v <= 0) return 'O valor deve ser maior que zero.';
  if (!motivo || String(motivo).trim().length < 5) {
    return 'O motivo é obrigatório e deve ter pelo menos 5 caracteres.';
  }
  if (!data || Number.isNaN(Date.parse(data))) return 'Data inválida.';
  return null;
}

export function validarLucro({ valor, data, forma }) {
  const v = Number(valor);
  if (!Number.isFinite(v) || v <= 0) return 'O valor deve ser maior que zero.';
  if (!data || Number.isNaN(Date.parse(data))) return 'Data inválida.';
  if (!FORMAS_PAGAMENTO.includes(forma)) return 'Forma de pagamento inválida.';
  return null;
}

export function validarLote({ chequeIds, data }) {
  if (!Array.isArray(chequeIds) || chequeIds.length === 0) return 'Selecione pelo menos um cheque.';
  if (chequeIds.length > 200) return 'Lote acima do limite de 200 cheques.';
  if (chequeIds.some((id) => typeof id !== 'string' || !id)) return 'Lista de cheques inválida.';
  if (!data || Number.isNaN(Date.parse(data))) return 'Data inválida.';
  return null;
}

export function idDeEventoValido(eventId) {
  return typeof eventId === 'string' && /^[A-Za-z0-9_:.-]{1,120}$/.test(eventId);
}

// ─────────────────────────── leitura de estado ─────────────────────────────

async function lerDocBanco(bancoStore, bankId) {
  if (!bancoStore) return null;
  if (typeof bancoStore.get === 'function') {
    try {
      return await bancoStore.get(bankId);
    } catch {
      return null;
    }
  }
  if (typeof bancoStore.filter === 'function') {
    const r = await bancoStore.filter({ id: bankId });
    const arr = Array.isArray(r) ? r : (r && r.items) || [];
    return arr[0] || null;
  }
  return null;
}

async function lancamentoDoEvento({ cashflowStore, eventKey }) {
  if (!cashflowStore || typeof cashflowStore.filter !== 'function') return null;
  const r = await cashflowStore.filter({ source_type: tipoDoEvento(eventKey), source_id: eventKey });
  const arr = Array.isArray(r) ? r : (r && r.items) || [];
  return arr[0] || null;
}

/**
 * Estado de um evento: o saldo foi aplicado? o lançamento existe?
 *
 * `saldo_sem_lancamento` é a FALHA PARCIAL: o dinheiro se moveu no extrato e a
 * contabilidade não registrou. É o único estado que exige intervenção, e ele é
 * APONTADO, não corrigido automaticamente.
 */
export async function diagnosticarMovimento({ bancoStore, cashflowStore, bankId, eventKey }) {
  if (!bankId || !eventKey) {
    return { estado: 'parametros_invalidos', saldo_aplicado: false, lancamento_existe: false };
  }

  const doc = await lerDocBanco(bancoStore, bankId);
  const chaves = doc && Array.isArray(doc[LEDGER_KEYS_FIELD]) ? doc[LEDGER_KEYS_FIELD] : [];
  const saldoAplicado = chaves.includes(eventKey);
  const lancamento = await lancamentoDoEvento({ cashflowStore, eventKey });
  const temSaldo = eventoTemSaldo(eventKey);

  let estado;
  if (lancamento && (!temSaldo || saldoAplicado)) estado = 'completo';
  else if (lancamento) estado = 'lancamento_sem_saldo';
  else if (temSaldo && saldoAplicado) estado = 'saldo_sem_lancamento';
  else estado = 'nada_aplicado';

  return {
    estado,
    saldo_aplicado: saldoAplicado,
    lancamento_existe: Boolean(lancamento),
    lancamento_id: lancamento ? lancamento.id : null,
  };
}

// ───────────────────────────── aplicação ───────────────────────────────────

/**
 * Aplica saldo e cria o lançamento, uma única vez por `eventKey`.
 *
 * @returns {Promise<{status:'aplicado'|'ja_aplicado'|'sem_conta'|'sem_efeito', lancamento_criado:boolean, cashflow_id?:string}>}
 */
export async function registrarMovimento({ bancoStore, cashflowStore, bankId, delta, eventKey, lancamento }) {
  const efeito = await applyBankDelta({ store: bancoStore, bankId, delta, eventKey });

  if (efeito.status !== 'aplicado') {
    return { status: efeito.status, lancamento_criado: false };
  }

  const criado = await cashflowStore.create({
    ...lancamento,
    source_type: tipoDoEvento(eventKey),
    source_id: eventKey,
  });

  return { status: 'aplicado', lancamento_criado: true, cashflow_id: criado && criado.id };
}

/**
 * Cria um lançamento de CONTROLE (sem efeito de saldo), uma única vez por
 * `eventKey`, usando a reivindicação no documento do banco como exclusividade.
 *
 * Usado por remessa e retorno de cheques: eles registram movimentação de
 * custódia, não entrada/saída de dinheiro — o saldo só muda na compensação.
 */
export async function criarLancamentoUnico({ bancoStore, cashflowStore, bankId, eventKey, lancamento, owner }) {
  const existente = await lancamentoDoEvento({ cashflowStore, eventKey });
  if (existente) return { status: 'ja_existia', cashflow_id: existente.id };

  const ganhou = await claimBankEvent({
    store: bancoStore,
    bankId,
    claimKey: `claim:${eventKey}`,
    owner,
  });
  if (!ganhou) return { status: 'ja_existia' };

  const criado = await cashflowStore.create({
    ...lancamento,
    source_type: tipoDoEvento(eventKey),
    source_id: eventKey,
  });

  return { status: 'criado', cashflow_id: criado && criado.id };
}