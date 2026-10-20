/**
 * D3 — MOTOR DE TRANSFERÊNCIAS (puro quanto a transporte).
 *
 * Toda a regra de idempotência, concorrência e recuperação vive aqui, recebendo
 * `stores` por injeção. Isso permite exercitar concorrência REAL em teste
 * (duas execuções intercaladas sobre o mesmo estado) sem tocar no banco.
 *
 * ── POR QUE ASSIM ──────────────────────────────────────────────────────────
 *
 * A plataforma não tem transação entre documentos, e uma transferência toca
 * quatro (2 saldos + 2 lançamentos). Não existe forma honesta de torná-los
 * atômicos. A estratégia é outra:
 *
 *  1. Cada efeito de saldo tem CHAVE DE EVENTO DETERMINÍSTICA
 *     (`transfer:<id>:<perna>`). `applyBankDelta` grava guarda, `$inc` e
 *     marcador na MESMA escrita do Banco: exatamente uma execução aplica, a
 *     outra recebe `ja_aplicado`. Retry nunca credita duas vezes.
 *
 *  2. Os lançamentos são idempotentes pela origem
 *     (`source_type = transferencia_bancaria`, `source_id = <id>:<perna>`),
 *     reivindicados por compare-and-swap NO DOCUMENTO DO BANCO — que tem `id`
 *     único — com prazo de validade. (Até a D3 a reivindicação vivia no diário;
 *     com dois diários criados em paralelo cada execução vencia no seu próprio
 *     documento e o lançamento duplicava.)
 *
 *  3. O que sobra de janela vira ESTADO OBSERVÁVEL: o diário registra por perna
 *     se o saldo foi aplicado e se o lançamento existe. `diagnosticar` expõe a
 *     perna "saldo aplicado, lançamento ausente" e `recuperar` refaz só o que
 *     falta — o saldo não é reaplicado porque a chave já está gravada.
 */
import {
  applyBankDelta,
  claimBankEvent,
  planoDePernas,
  planoDeEstorno,
  validarTransferencia,
  novoTransferId,
  diagnosticarTransferencia,
  CATEGORIA_TRANSFERENCIA,
  SOURCE_TRANSFERENCIA,
} from './bankLedger.js';

const lista = (res) => (Array.isArray(res) ? res : (res && res.items) || []);

/**
 * Escolhe UM diário canônico quando a criação concorrente produziu mais de um.
 *
 * `create` não tem unicidade por chave, então dois pedidos simultâneos do mesmo
 * `transfer_id` podem criar dois diários. Se cada execução reivindicasse no seu
 * próprio documento, as duas venceriam o CAS e o lançamento duplicaria. Elegendo
 * o de menor id, ambas as execuções disputam o MESMO documento — e só uma
 * vence. A escolha é arbitrária, mas estável.
 */
function canonico(docs) {
  return [...docs].sort((a, b) => String(a.id).localeCompare(String(b.id)))[0] || null;
}

/**
 * @param {Object} p
 * @param {{updateWhere:Function}} p.bancoStore
 * @param {{filter:Function, create:Function, updateWhere:Function}} p.diarioStore
 * @param {{filter:Function, create:Function}} p.cashflowStore
 * @param {Function} [p.agora] injetável para testar TTL
 */
export function criarMotor({ bancoStore, diarioStore, cashflowStore, agora }) {
  const relogio = agora || (() => new Date().toISOString());

  async function diarioExistente(transferId) {
    return canonico(lista(await diarioStore.filter({ transfer_id: transferId })));
  }

  async function garantirDiario({ transferId, fromBank, toBank, amount, date, description, userEmail, estornoDe }) {
    const existente = await diarioExistente(transferId);
    if (existente) return existente;

    await diarioStore.create({
      transfer_id: transferId,
      from_bank_id: fromBank.id,
      from_bank_name: fromBank.name || fromBank.nome || '',
      to_bank_id: toBank.id,
      to_bank_name: toBank.name || toBank.nome || '',
      amount: Number(amount),
      date,
      description,
      status: 'pendente',
      legs: {},
      attempts: 0,
      requested_by: userEmail || '',
      estorno_de: estornoDe || '',
    });

    // Relê para eleger o canônico — a criação concorrente pode ter duplicado.
    const canonicoDoc = await diarioExistente(transferId);
    if (!canonicoDoc) return null;

    // `create` NÃO tem chave única (verificado: a plataforma ignora `id`
    // explícito e aceita dois documentos com o mesmo `transfer_id`). Então a
    // duplicidade NÃO é eliminada — ela é marcada. Não cancelamos: o documento
    // excedente pode ter perna aplicada de verdade, e cancelar apagaria a
    // evidência de um efeito real no saldo.
    await diarioStore.updateWhere(
      { transfer_id: transferId, id: { $ne: canonicoDoc.id } },
      { $set: { duplicado: true } }
    );

    return canonicoDoc;
  }

  /** Escrita pontual na perna — nunca regrava o objeto `legs` inteiro. */
  async function marcarPerna(diarioId, leg, patch) {
    const set = {};
    for (const [k, v] of Object.entries(patch)) set[`legs.${leg}.${k}`] = v;
    await diarioStore.updateWhere({ id: diarioId }, { $set: set });
  }

  /**
   * Reivindica a criação do lançamento da perna. Só o vencedor cria.
   *
   * D3.1 — a reivindicação vive no DOCUMENTO DO BANCO, não no diário. Era essa
   * a lacuna: com dois diários (criação concorrente), cada execução reivindicava
   * no seu próprio documento, ambas venciam e o lançamento duplicava. O banco
   * tem `id` único, então o CAS arbitra entre todas as execuções.
   */
  async function reivindicarLancamento(perna) {
    return claimBankEvent({
      store: bancoStore,
      bankId: perna.bankId,
      claimKey: perna.sourceId,
      now: relogio(),
    });
  }

  async function garantirLancamento({ transferId, perna, amount, date, description, fromName, toName }) {
    const origem = { source_type: SOURCE_TRANSFERENCIA, source_id: perna.sourceId };

    const existentes = lista(await cashflowStore.filter(origem));
    if (existentes.length > 0) return { status: 'existente', id: existentes[0].id };

    if (!(await reivindicarLancamento(perna))) {
      const relidos = lista(await cashflowStore.filter(origem));
      return relidos.length > 0
        ? { status: 'existente', id: relidos[0].id }
        : { status: 'pendente', id: null };
    }

    const rotulo = perna.leg === 'saida' ? 'SAÍDA' : 'ENTRADA';
    const criado = await cashflowStore.create({
      type: perna.type,
      category: CATEGORIA_TRANSFERENCIA,
      amount: Number(amount),
      date,
      description: `[${rotulo}] ${description} — ${fromName} → ${toName}`,
      method: 'transferencia',
      bank_id: perna.bankId,
      transfer_id: transferId,
      transfer_leg: perna.leg,
      ...origem,
    });
    return { status: 'criado', id: criado.id };
  }

  /**
   * Executa a transferência. Segura para repetir: o MESMO `transferId` nunca
   * duplica perna, saldo ou lançamento.
   */
  async function executarTransferencia({ transferId, fromBank, toBank, amount, date, description, userEmail }) {
    const erro = validarTransferencia({ fromBankId: fromBank && fromBank.id, toBankId: toBank && toBank.id, amount });
    if (erro) throw new Error(erro);

    const id = transferId || novoTransferId();
    const valor = Number(amount);
    const fromName = fromBank.name || fromBank.nome || '';
    const toName = toBank.name || toBank.nome || '';
    const desc = (description || '').trim() || `Transferência ${fromName} → ${toName}`;

    const diario = await garantirDiario({
      transferId: id, fromBank, toBank, amount: valor, date, description: desc, userEmail,
    });

    if (diario.status === 'estornada' || diario.status === 'cancelada') {
      return { status: diario.status, transferId: id, pernas: [] };
    }

    const pernas = planoDePernas({ transferId: id, fromBankId: fromBank.id, toBankId: toBank.id, amount: valor });
    const resultados = [];

    const diarioId = diario.id;

    for (const perna of pernas) {
      // 1. Saldo: atômico e idempotente pela chave do evento.
      const efeito = await applyBankDelta({
        store: bancoStore,
        bankId: perna.bankId,
        delta: perna.delta,
        eventKey: perna.key,
      });
      await marcarPerna(diarioId, perna.leg, { banco: efeito.status, aplicada_em: relogio() });

      // 2. Lançamento: idempotente pela origem, reivindicado por CAS.
      const lanc = await garantirLancamento({
        transferId: id, perna, amount: valor, date, description: desc, fromName, toName,
      });
      if (lanc.id) await marcarPerna(diarioId, perna.leg, { cashflow_id: lanc.id });

      resultados.push({ leg: perna.leg, banco: efeito.status, lancamento: lanc.status });
    }

    const aplicadas = resultados.filter((r) => r.banco === 'aplicado' || r.banco === 'ja_aplicado').length;
    const completo = aplicadas === 2 && resultados.every((r) => r.lancamento !== 'pendente');
    const status = completo ? 'aplicada' : 'parcial';

    // Não REBAIXA diário já 'aplicada': numa corrida, a execução perdedora pode
    // terminar depois e escrever 'parcial' sobre um estado que o vencedor
    // completou. O estado final precisa refletir o efeito, não a ordem de término.
    const filtroStatus = status === 'aplicada'
      ? { id: diarioId }
      : { id: diarioId, status: { $ne: 'aplicada' } };
    await diarioStore.updateWhere(filtroStatus, { $set: { status }, $inc: { attempts: 1 } });

    // Devolve o estado AUTORITATIVO do diário, não o que esta execução achou.
    const fim = await diarioExistente(id);
    return { status: (fim && fim.status) || status, transferId: id, pernas: resultados };
  }

  /**
   * Estorna uma transferência aplicada. As chaves do estorno são
   * DETERMINÍSTICAS (`transfer:<id>:estorno:<perna>`): estornar duas vezes —
   * inclusive em paralelo — reverte no máximo uma.
   */
  async function estornarTransferencia({ transferId, date, description, userEmail }) {
    const original = await diarioExistente(transferId);
    if (!original) throw new Error('Transferência não encontrada');
    if (original.status !== 'aplicada' && original.status !== 'estornada') {
      throw new Error('Só é possível estornar uma transferência aplicada');
    }

    const estornoId = `${original.transfer_id}:estorno`;
    const valor = Number(original.amount);
    const fromName = original.from_bank_name || 'origem';
    const toName = original.to_bank_name || 'destino';

    const estornoDoc = await garantirDiario({
      transferId: estornoId,
      fromBank: { id: original.from_bank_id, name: fromName },
      toBank: { id: original.to_bank_id, name: toName },
      amount: valor,
      date,
      description: (description || '').trim() || `Estorno da transferência ${original.transfer_id}`,
      userEmail,
      estornoDe: original.transfer_id,
    });

    const pernas = planoDeEstorno({
      transferId: original.transfer_id,
      fromBankId: original.from_bank_id,
      toBankId: original.to_bank_id,
      amount: valor,
    });

    const resultados = [];
    for (const perna of pernas) {
      const efeito = await applyBankDelta({
        store: bancoStore,
        bankId: perna.bankId,
        delta: perna.delta,
        eventKey: perna.key,
      });
      const lanc = await garantirLancamento({
        transferId: estornoId,
        perna,
        amount: valor,
        date,
        description: `Estorno — ${fromName} → ${toName}`,
        fromName,
        toName,
      });
      if (lanc.id) await marcarPerna(estornoDoc.id, perna.leg, { cashflow_id: lanc.id, banco: efeito.status });
      resultados.push({ leg: perna.leg, banco: efeito.status, lancamento: lanc.status });
    }

    await diarioStore.updateWhere(
      { id: estornoDoc.id },
      { $set: { status: 'aplicada' }, $inc: { attempts: 1 } }
    );
    await diarioStore.updateWhere(
      { id: original.id },
      { $set: { status: 'estornada', estornada_por: estornoId } }
    );

    return { status: 'estornada', transferId: original.transfer_id, estornoId, pernas: resultados };
  }

  /**
   * Recupera uma transferência parcial. Reaproveita a execução idempotente:
   * pernas já aplicadas devolvem `ja_aplicado` e o saldo não é tocado de novo.
   */
  async function recuperarTransferencia({ transferId, date, userEmail }) {
    const doc = await diarioExistente(transferId);
    if (!doc) throw new Error('Transferência não encontrada');
    if (doc.status === 'aplicada') return { status: 'aplicada', transferId, pernas: [] };

    return executarTransferencia({
      transferId,
      fromBank: { id: doc.from_bank_id, name: doc.from_bank_name },
      toBank: { id: doc.to_bank_id, name: doc.to_bank_name },
      amount: doc.amount,
      date: date || doc.date,
      description: doc.description,
      userEmail,
    });
  }

  return {
    executarTransferencia,
    estornarTransferencia,
    recuperarTransferencia,
    diarioExistente,
    diagnosticar: diagnosticoDe,
  };
}

/** Diagnóstico puro de um diário já lido. */
export function diagnosticoDe(doc) {
  return diagnosticarTransferencia(doc);
}