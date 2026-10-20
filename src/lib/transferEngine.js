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
 *     único. (Até a D3 a reivindicação vivia no diário; com dois diários
 *     criados em paralelo cada execução vencia no seu próprio documento e o
 *     lançamento duplicava.)
 *
 *  3. O que sobra de janela vira ESTADO OBSERVÁVEL: o diário registra por perna
 *     se o saldo foi aplicado e se o lançamento existe. `diagnosticar` expõe a
 *     perna "saldo aplicado, lançamento ausente" e `recuperar` refaz só o que
 *     falta — o saldo não é reaplicado porque a chave já está gravada.
 *
 * ── CÓPIA DUPLICADA ────────────────────────────────────────────────────────
 *
 * O motor existe em dois arquivos: `src/lib/transferEngine.js` (navegador) e
 * `base44/shared/transferEngine.js` (função de servidor). A duplicação é
 * obrigatória — o navegador não pode importar `base44/`, e a função de servidor
 * não pode importar `src/`. Os dois são idênticos exceto pelo especificador do
 * import do `bankLedger`; o teste D4.1.12 compara os bytes depois de normalizar
 * essa única linha. Toda alteração de regra tem de ser feita nos DOIS arquivos
 * — divergir aqui é divergir o saldo.
 */
import {
  applyBankDelta,
  claimBankEvent,
  liberarReivindicacaoVerificada,
  classificarReivindicacao,
  metaDaReivindicacao,
  temReivindicacao,
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
  async function reivindicarLancamento(perna, owner) {
    return claimBankEvent({
      store: bancoStore,
      bankId: perna.bankId,
      claimKey: perna.sourceId,
      owner,
    });
  }

  async function garantirLancamento({ transferId, perna, amount, date, description, fromName, toName, owner }) {
    const origem = { source_type: SOURCE_TRANSFERENCIA, source_id: perna.sourceId };

    const existentes = lista(await cashflowStore.filter(origem));
    if (existentes.length > 0) return { status: 'existente', id: existentes[0].id };

    if (!(await reivindicarLancamento(perna, owner))) {
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
        transferId: id, perna, amount: valor, date, description: desc, fromName, toName, owner: userEmail,
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
        owner: userEmail,
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

  /** Leitura do banco, quando o store oferece `get`. */
  async function lerBanco(id) {
    if (!id || typeof bancoStore.get !== 'function') return null;
    return bancoStore.get(id);
  }

  /**
   * D3.2 — Inspeção DETALHADA do estado de recuperação, por perna.
   *
   * Junta o que está espalhado por três documentos (diário, banco, caixa) e
   * devolve, por perna: saldo aplicado, existência real do lançamento,
   * reivindicação presente, DONO, instante de aquisição, idade e veredito.
   *
   * Somente leitura: não libera, não cria, não corrige.
   */
  async function inspecionarTransferencia({ transferId, agora }) {
    const doc = await diarioExistente(transferId);
    if (!doc) throw new Error('Transferência não encontrada');

    const plano = planoDePernas({
      transferId: doc.transfer_id,
      fromBankId: doc.from_bank_id,
      toBankId: doc.to_bank_id,
      amount: Number(doc.amount),
    });

    const pernas = [];
    for (const perna of plano) {
      const marcada = (doc.legs || {})[perna.leg] || {};
      const saldoAplicado = marcada.banco === 'aplicado' || marcada.banco === 'ja_aplicado';
      const lancamentos = lista(await cashflowStore.filter({ source_id: perna.sourceId }));
      const banco = await lerBanco(perna.bankId);
      const reivindicada = banco ? temReivindicacao(banco, perna.sourceId) : false;
      const meta = banco ? metaDaReivindicacao(banco, perna.sourceId) : null;

      const veredito = classificarReivindicacao({
        reivindicada,
        lancamentoExiste: lancamentos.length > 0,
        saldoAplicado,
        adquiridaEm: meta ? meta.em : null,
        agora,
      });

      pernas.push({
        leg: perna.leg,
        bank_id: perna.bankId,
        saldo_aplicado: saldoAplicado,
        cashflow_id_marcado: marcada.cashflow_id || null,
        lancamento_id: lancamentos.length > 0 ? lancamentos[0].id : null,
        reivindicacao: {
          presente: reivindicada,
          owner: meta ? meta.owner : null,
          em: meta ? meta.em : null,
        },
        ...veredito,
      });
    }

    return {
      transferId: doc.transfer_id,
      status: doc.status || 'pendente',
      duplicado: Boolean(doc.duplicado),
      pernas,
      orfas: pernas.filter((p) => p.estado === 'orfã_confirmada').length,
    };
  }

  /**
   * D3.2 — Recupera reivindicações órfãs SEM tocar em saldo.
   *
   * Regras que este fluxo respeita:
   *  · NUNCA chama `applyBankDelta`: reaplicar saldo histórico é proibido. A
   *    recuperação só cria o efeito secundário que falta.
   *  · Idade sozinha não libera. Exige `confirmar` e, além disso, reivindicação
   *    fora da janela de suspeita — ou `forcar` explícito, que ainda assim
   *    continua conferindo a ausência do lançamento.
   *  · Antes de liberar, `liberarReivindicacaoVerificada` confere se o
   *    lançamento já existe; se existir, não libera e o vínculo é apenas
   *    registrado no diário.
   *  · Recuperação concorrente não duplica: quem criar o lançamento é decidido
   *    pelo compare-and-swap da reivindicação, não pela ordem de término.
   */
  async function recuperarLancamentosOrfaos({ transferId, confirmar, forcar, agora, userEmail }) {
    const doc = await diarioExistente(transferId);
    if (!doc) throw new Error('Transferência não encontrada');

    if (doc.status === 'estornada' || doc.status === 'cancelada') {
      return { transferId, status: doc.status, acoes: [], motivo: 'diário encerrado: nada a recuperar' };
    }

    const valor = Number(doc.amount);
    const fromName = doc.from_bank_name || '';
    const toName = doc.to_bank_name || '';
    const plano = planoDePernas({
      transferId: doc.transfer_id,
      fromBankId: doc.from_bank_id,
      toBankId: doc.to_bank_id,
      amount: valor,
    });

    const inspecao = await inspecionarTransferencia({ transferId, agora });
    const acoes = [];

    for (const p of inspecao.pernas) {
      const perna = plano.find((x) => x.leg === p.leg);

      // O lançamento existe: nada a criar. No máximo reconhece o vínculo no
      // diário — o que faltava era só o marcador, não o efeito.
      if (p.estado === 'efeito_ja_presente') {
        if (!p.cashflow_id_marcado && p.lancamento_id) {
          await marcarPerna(doc.id, p.leg, { cashflow_id: p.lancamento_id });
          acoes.push({ leg: p.leg, acao: 'marcador_reconciliado', lancamento_id: p.lancamento_id });
        } else {
          acoes.push({ leg: p.leg, acao: 'nada_a_fazer' });
        }
        continue;
      }

      // Duas situações são recuperáveis, e só elas:
      //  · órfã confirmada — reivindicação presente e sem lançamento;
      //  · perna já liberada — sem reivindicação, saldo aplicado e sem
      //    lançamento (o processo morreu, alguém liberou e ninguém recriou).
      const orfa = p.estado === 'orfã_confirmada';
      const jaLiberada = p.estado === 'sem_reivindicacao' && p.saldo_aplicado && !p.lancamento_id;

      // Reivindicação retida SEM saldo aplicado não se resolve por aqui: criar o
      // lançamento registraria um movimento de caixa sem o débito/crédito
      // bancário correspondente. Esse caso exige `recuperarTransferencia`, que
      // aplica o saldo (idempotente) e só depois cria o lançamento.
      if (orfa && !p.saldo_aplicado) {
        acoes.push({
          leg: p.leg,
          acao: 'requer_recuperacao_completa',
          motivo: 'Saldo não aplicado nesta perna: use recuperarTransferencia, que aplica o saldo antes',
        });
        continue;
      }

      if (!orfa && !jaLiberada) {
        acoes.push({ leg: p.leg, acao: 'nada_a_fazer', motivo: p.motivo });
        continue;
      }

      if (!confirmar) {
        acoes.push({
          leg: p.leg,
          acao: 'requer_confirmacao',
          owner: p.reivindicacao.owner,
          em: p.reivindicacao.em,
          idade_ms: p.idadeMs,
          idade_suspeita: p.idade_suspeita,
        });
        continue;
      }

      if (orfa) {
        if (!p.idade_suspeita && !forcar) {
          acoes.push({ leg: p.leg, acao: 'aguardar_idade', idade_ms: p.idadeMs });
          continue;
        }

        const liberacao = await liberarReivindicacaoVerificada({
          bancoStore,
          cashflowStore,
          bankId: perna.bankId,
          claimKey: perna.sourceId,
          sourceType: SOURCE_TRANSFERENCIA,
          observado: p.reivindicacao.presente
            ? { chave: perna.sourceId, owner: p.reivindicacao.owner, em: p.reivindicacao.em }
            : null,
        });

        if (!liberacao.liberada) {
          acoes.push({ leg: p.leg, acao: 'liberacao_recusada', motivo: liberacao.motivo });
          if (liberacao.motivo === 'efeito_ja_aplicado' && liberacao.lancamento_id) {
            await marcarPerna(doc.id, p.leg, { cashflow_id: liberacao.lancamento_id });
          }
          continue;
        }
      }

      const lanc = await garantirLancamento({
        transferId: doc.transfer_id,
        perna,
        amount: valor,
        date: doc.date,
        description: doc.description,
        fromName,
        toName,
        owner: userEmail,
      });
      if (lanc.id) await marcarPerna(doc.id, p.leg, { cashflow_id: lanc.id });

      acoes.push({
        leg: p.leg,
        acao: lanc.status === 'pendente' ? 'lancamento_pendente' : 'lancamento_recriado',
        lancamento: lanc.status,
        lancamento_id: lanc.id || null,
      });
    }

    // Reconcilia o status com o que existe de FATO — nunca com o que se esperava.
    const depois = await inspecionarTransferencia({ transferId, agora });
    const completo = depois.pernas.every((p) => p.saldo_aplicado && p.lancamento_id);
    if (completo) {
      await diarioStore.updateWhere(
        { id: doc.id, status: { $ne: 'estornada' } },
        { $set: { status: 'aplicada' } }
      );
    }

    return {
      transferId: doc.transfer_id,
      status: completo ? 'aplicada' : depois.status,
      acoes,
      pernas: depois.pernas,
    };
  }

  return {
    executarTransferencia,
    estornarTransferencia,
    recuperarTransferencia,
    recuperarLancamentosOrfaos,
    inspecionarTransferencia,
    diarioExistente,
    diagnosticar: diagnosticoDe,
  };
}

/** Diagnóstico puro de um diário já lido. */
export function diagnosticoDe(doc) {
  return diagnosticarTransferencia(doc);
}