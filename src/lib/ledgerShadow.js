/**
 * LIVRO-CAIXA EM MODO SOMBRA (Fase D2) — CÁLCULO NÃO OFICIAL.
 *
 * Este módulo NÃO grava nada. Não altera `Banco.current_balance`, não migra
 * saldos, não corrige divergências, não toca em fórmula comercial. Ele existe
 * para responder, de forma auditável e reversível: "quanto o livro-caixa diz
 * que cada conta tem, e onde isso discorda do saldo registrado?"
 *
 * É puro de propósito: recebe arrays e devolve um objeto. Sem import de
 * `@/api/base44Client`, para poder ser exercitado por `node --test`.
 *
 * ── REGRAS SEMÂNTICAS (aplicadas, não presumidas) ──────────────────────────
 *
 * · A ÚNICA fonte de movimentação é o registro `CashFlow`. Nenhum outro
 *   documento entra no cálculo.
 * · Boleto EMITIDO não é dinheiro recebido. A emissão vive em `Operation`
 *   (`asaas_*`, `installment_schedule`) e NÃO gera CashFlow — só o recebimento
 *   confirmado gera. Logo "previsto" já fica de fora por construção, e este
 *   módulo deliberadamente não lê `Operation`.
 * · `CashFlow` não tem campo de status. Cancelamento e estorno são
 *   representados por um lançamento contrário com categoria `estorno_*`.
 *   Esse lançamento é MOVIMENTAÇÃO EFETIVA (desfaz a anterior) e entra no
 *   saldo — ignorá-lo inverteria o estorno.
 * · `transferencia_interna` são DUAS pernas (saida + entrada) do MESMO evento.
 *   No consolidado elas se anulam; por conta, só se cada perna souber a qual
 *   conta pertence (`bank_id`). Hoje não sabe — ver `transferencia_sem_identidade`.
 * · `initial_balance` é o saldo de abertura. Se o campo não existir no
 *   registro, isso é LACUNA: nunca vira zero silenciosamente.
 * · Não existe `ledger_start_date` em `Banco`. Sem data de corte oficial,
 *   `initial_balance` não tem âncora temporal — registrado como lacuna
 *   estrutural, e nenhuma data é inventada.
 * · Sempre que os dados não sustentam uma conclusão, o resultado é
 *   `inconclusivo`. Nunca se presume qual dos dois lados está certo.
 */

/** Categoria das pernas de transferência entre contas. */
export const CATEGORIA_TRANSFERENCIA = 'transferencia_interna';

/** Tolerância de comparação monetária (meio centavo). */
export const TOLERANCIA = 0.005;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Estorno: qualquer categoria iniciada por "estorno". */
export function ehEstorno(cf) {
  return String(cf?.category || '').startsWith('estorno');
}

/** Perna de transferência interna. */
export function ehTransferenciaInterna(cf) {
  return String(cf?.category || '') === CATEGORIA_TRANSFERENCIA;
}

/** Chave de idempotência da origem, quando declarada. */
export function chaveOrigem(cf) {
  const tipo = String(cf?.source_type || '').trim();
  const id = String(cf?.source_id || '').trim();
  if (!tipo || !id) return null;
  return `${tipo}::${id}`;
}

/**
 * Classifica UM lançamento. Não decide saldo — só a natureza do evento.
 *
 * efeito:
 *   'efetivo'      entrada/saída de dinheiro real
 *   'transferencia' perna de transferência interna (não é receita nem despesa)
 *   'estorno'      movimentação contrária, efetiva
 *   'ignorado'     não pode entrar no saldo (valor/tipo inválido)
 */
export function classificarLancamento(cf) {
  const motivos = [];
  const valor = Number(cf?.amount);

  if (!Number.isFinite(valor) || valor <= 0) {
    motivos.push('valor_invalido');
  }
  if (cf?.type !== 'entrada' && cf?.type !== 'saida') {
    motivos.push('tipo_invalido');
  }
  if (!cf?.date || !ISO_DATE.test(String(cf.date))) {
    motivos.push('data_invalida');
  }
  if (!cf?.bank_id) {
    motivos.push('sem_conta');
  }
  if (!chaveOrigem(cf)) {
    motivos.push('sem_origem');
  }

  if (motivos.includes('valor_invalido') || motivos.includes('tipo_invalido')) {
    return { efeito: 'ignorado', motivos };
  }
  if (ehTransferenciaInterna(cf)) return { efeito: 'transferencia', motivos };
  if (ehEstorno(cf)) return { efeito: 'estorno', motivos };
  return { efeito: 'efetivo', motivos };
}

function contaVazia(banco) {
  return {
    bank_id: banco.id,
    nome: banco.nome || banco.name || '(sem nome)',
    saldo_inicial: null,
    saldo_inicial_definido: false,
    entradas_efetivas: 0,
    saidas_efetivas: 0,
    estornos_entrada: 0,
    estornos_saida: 0,
    transferencias_entrada: 0,
    transferencias_saida: 0,
    saldo_calculado: 0,
    lancamentos_considerados: 0,
    lancamentos_ignorados: 0,
  };
}

/**
 * Calcula saldos por conta e consolidado em uma data-base.
 *
 * @param {Object} p
 * @param {Array} p.bancos      registros de Banco
 * @param {Array} p.lancamentos registros de CashFlow
 * @param {string} p.dataBase   'YYYY-MM-DD' (inclusive)
 */
export function calcularSaldosSombra({ bancos = [], lancamentos = [], dataBase } = {}) {
  if (!dataBase || !ISO_DATE.test(String(dataBase))) {
    throw new Error('[LedgerShadow] dataBase obrigatória no formato YYYY-MM-DD');
  }

  const contas = new Map();
  for (const b of bancos) {
    if (!b || !b.id) continue;
    contas.set(b.id, contaVazia(b));
  }

  const naoAtribuidos = { quantidade: 0, valor_entrada: 0, valor_saida: 0 };
  const ignorados = [];
  const foraDaDataBase = [];
  const inconsistenciasData = [];

  for (const cf of lancamentos) {
    if (!cf || !cf.id) continue;
    const cls = classificarLancamento(cf);

    if (cls.efeito === 'ignorado') {
      ignorados.push({ id: cf.id, motivos: cls.motivos });
      continue;
    }

    // Data de corte: só entra o que aconteceu ATÉ a data-base (inclusive).
    if (!cf.date || !ISO_DATE.test(String(cf.date))) {
      inconsistenciasData.push({ id: cf.id, motivo: 'data_invalida', date: cf.date ?? null });
      continue;
    }
    if (String(cf.date) > String(dataBase)) {
      foraDaDataBase.push(cf.id);
      continue;
    }

    const valor = Number(cf.amount);
    const entrada = cf.type === 'entrada';
    const conta = cf.bank_id ? contas.get(cf.bank_id) : null;

    // Sem conta identificável: o valor é real, mas não é atribuível.
    if (!conta) {
      naoAtribuidos.quantidade += 1;
      if (entrada) naoAtribuidos.valor_entrada += valor;
      else naoAtribuidos.valor_saida += valor;
      continue;
    }

    conta.lancamentos_considerados += 1;

    if (cls.efeito === 'transferencia') {
      if (entrada) conta.transferencias_entrada += valor;
      else conta.transferencias_saida += valor;
    } else if (cls.efeito === 'estorno') {
      if (entrada) conta.estornos_entrada += valor;
      else conta.estornos_saida += valor;
    } else if (entrada) {
      conta.entradas_efetivas += valor;
    } else {
      conta.saidas_efetivas += valor;
    }
  }

  // Fecha cada conta. Sem saldo inicial definido, o calculado é LACUNAR.
  const lista = [];
  const lacunas = [];

  for (const conta of contas.values()) {
    const banco = bancos.find((b) => b.id === conta.bank_id) || {};
    const inicialDefinido =
      banco.initial_balance !== undefined &&
      banco.initial_balance !== null &&
      Number.isFinite(Number(banco.initial_balance));

    if (!inicialDefinido) {
      lacunas.push({
        tipo: 'saldo_inicial_ausente',
        bank_id: conta.bank_id,
        detalhe: 'initial_balance ausente ou não numérico — saldo calculado não é conclusivo',
      });
      conta.saldo_inicial = null;
      conta.saldo_calculado = null;
    } else {
      conta.saldo_inicial = Number(banco.initial_balance);
      conta.saldo_calculado =
        conta.saldo_inicial +
        conta.entradas_efetivas -
        conta.saidas_efetivas +
        conta.estornos_entrada -
        conta.estornos_saida +
        conta.transferencias_entrada -
        conta.transferencias_saida;
    }

    lista.push(conta);
  }

  if (naoAtribuidos.quantidade > 0) {
    lacunas.push({
      tipo: 'lancamentos_sem_conta',
      quantidade: naoAtribuidos.quantidade,
      detalhe:
        'Lançamentos com valor real sem bank_id não podem ser atribuídos a uma conta — nenhum saldo por conta é conclusivo enquanto existirem',
    });
  }

  lacunas.push({
    tipo: 'sem_data_de_corte',
    detalhe:
      'Banco não possui ledger_start_date: initial_balance não tem âncora temporal, então lançamentos anteriores à abertura não são distinguíveis',
  });

  // Consolidado: todas as contas + o que não pôde ser atribuído.
  const consolidado = lista.reduce(
    (acc, c) => ({
      saldo_inicial: acc.saldo_inicial + (c.saldo_inicial || 0),
      entradas_efetivas: acc.entradas_efetivas + c.entradas_efetivas,
      saidas_efetivas: acc.saidas_efetivas + c.saidas_efetivas,
      estornos_entrada: acc.estornos_entrada + c.estornos_entrada,
      estornos_saida: acc.estornos_saida + c.estornos_saida,
      transferencias_entrada: acc.transferencias_entrada + c.transferencias_entrada,
      transferencias_saida: acc.transferencias_saida + c.transferencias_saida,
    }),
    {
      saldo_inicial: 0,
      entradas_efetivas: 0,
      saidas_efetivas: 0,
      estornos_entrada: 0,
      estornos_saida: 0,
      transferencias_entrada: 0,
      transferencias_saida: 0,
    }
  );

  consolidado.transferencias_liquido =
    consolidado.transferencias_entrada - consolidado.transferencias_saida;
  consolidado.saldo_calculado =
    consolidado.saldo_inicial +
    consolidado.entradas_efetivas -
    consolidado.saidas_efetivas +
    consolidado.estornos_entrada -
    consolidado.estornos_saida +
    consolidado.transferencias_liquido;

  return {
    modo: 'sombra',
    data_base: dataBase,
    contas: lista,
    consolidado,
    nao_atribuidos: naoAtribuidos,
    lacunas,
    ignorados,
    fora_da_data_base: foraDaDataBase.length,
    inconsistencias_data: inconsistenciasData,
  };
}

/**
 * Compara o calculado com o registrado, por conta, e explica cada diferença.
 *
 * Classificação:
 *   'conforme'      diferença dentro da tolerância
 *   'divergente'    diferença real e o calculado é sustentado pelos dados
 *   'inconclusivo'  os dados não permitem afirmar qual lado está certo
 *
 * Nunca conclui que o registrado está errado — apenas que os dois discordam e
 * por quê. Correção é decisão humana, fora desta fase.
 */
export function analisarDivergencias({ bancos = [], lancamentos = [], dataBase } = {}) {
  const calc = calcularSaldosSombra({ bancos, lancamentos, dataBase });

  // Anomalias globais — explicam divergências sem afirmar culpa.
  const porOrigem = new Map();
  const semOrigem = [];
  const semConta = [];
  const transferencias = [];

  for (const cf of lancamentos) {
    if (!cf || !cf.id) continue;
    const k = chaveOrigem(cf);
    if (k) {
      if (!porOrigem.has(k)) porOrigem.set(k, []);
      porOrigem.get(k).push(cf.id);
    } else {
      semOrigem.push(cf.id);
    }
    if (!cf.bank_id) semConta.push(cf.id);
    if (ehTransferenciaInterna(cf)) transferencias.push(cf);
  }

  const duplicidades = [];
  for (const [chave, ids] of porOrigem.entries()) {
    if (ids.length > 1) duplicidades.push({ chave, ids, ocorrencias: ids.length });
  }

  // Pernas de transferência: pareamento por valor + data. Duas pernas por
  // evento (saida + entrada). Ímpar = transferência incompleta.
  const porValorData = new Map();
  for (const t of transferencias) {
    const k = `${t.date}::${Number(t.amount).toFixed(2)}`;
    if (!porValorData.has(k)) porValorData.set(k, { saida: 0, entrada: 0, ids: [] });
    const g = porValorData.get(k);
    if (t.type === 'saida') g.saida += 1;
    else if (t.type === 'entrada') g.entrada += 1;
    g.ids.push(t.id);
  }

  const transferenciasIncompletas = [];
  for (const [k, g] of porValorData.entries()) {
    if (g.saida !== g.entrada) {
      transferenciasIncompletas.push({
        chave: k,
        saidas: g.saida,
        entradas: g.entrada,
        ids: g.ids,
        detalhe:
          'Pernas de transferência não equilibram: o consolidado fica inflado/deflacionado pelo valor órfão',
      });
    }
  }

  const globalInconclusivo = calc.nao_atribuidos.quantidade > 0;

  const contas = calc.contas.map((c) => {
    const banco = bancos.find((b) => b.id === c.bank_id) || {};
    const registrado =
      banco.current_balance === undefined || banco.current_balance === null
        ? null
        : Number(banco.current_balance);

    const explicacoes = [];

    if (c.saldo_calculado === null) {
      explicacoes.push({
        tipo: 'saldo_inicial_ausente',
        detalhe: 'initial_balance ausente — não há base para calcular',
      });
    }
    if (globalInconclusivo) {
      explicacoes.push({
        tipo: 'lancamentos_sem_conta',
        quantidade: calc.nao_atribuidos.quantidade,
        detalhe: 'Existem lançamentos sem bank_id que podem pertencer a esta conta',
      });
    }

    const duplicidadesDaConta = duplicidades.filter((d) =>
      d.ids.some((id) => {
        const cf = lancamentos.find((x) => x.id === id);
        return cf && cf.bank_id === c.bank_id;
      })
    );
    if (duplicidadesDaConta.length > 0) {
      explicacoes.push({
        tipo: 'duplicidade_suspeita',
        chaves: duplicidadesDaConta.map((d) => d.chave),
        detalhe: 'Mesma origem (source_type + source_id) lançada mais de uma vez',
      });
    }

    const diferenca =
      c.saldo_calculado === null || registrado === null ? null : registrado - c.saldo_calculado;

    let classificacao;
    if (c.saldo_calculado === null || registrado === null || globalInconclusivo) {
      classificacao = 'inconclusivo';
    } else if (Math.abs(diferenca) <= TOLERANCIA) {
      classificacao = 'conforme';
    } else {
      classificacao = 'divergente';
      explicacoes.push({
        tipo: 'diferenca_sem_lancamento',
        valor: diferenca,
        detalhe:
          'Diferença que o livro não explica — pode ser escrita direta em current_balance sem lançamento, edição manual do saldo, ou histórico anterior ao controle',
      });
    }

    return {
      bank_id: c.bank_id,
      nome: c.nome,
      data_base: calc.data_base,
      saldo_registrado: registrado,
      saldo_calculado: c.saldo_calculado,
      diferenca,
      lancamentos_considerados: c.lancamentos_considerados,
      classificacao,
      explicacoes,
    };
  });

  const resumo = {
    total_contas: contas.length,
    conformes: contas.filter((c) => c.classificacao === 'conforme').length,
    divergentes: contas.filter((c) => c.classificacao === 'divergente').length,
    inconclusivas: contas.filter((c) => c.classificacao === 'inconclusivo').length,
    duplicidades: duplicidades.length,
    lancamentos_sem_origem: semOrigem.length,
    lancamentos_sem_conta: semConta.length,
    transferencias_incompletas: transferenciasIncompletas.length,
    inconsistencias_data: calc.inconsistencias_data.length,
  };

  return {
    modo: 'sombra',
    data_base: calc.data_base,
    aviso:
      'CÁLCULO NÃO OFICIAL. Nada foi gravado. current_balance permanece a fonte de produção até decisão explícita.',
    contas,
    consolidado: calc.consolidado,
    nao_atribuidos: calc.nao_atribuidos,
    lacunas: calc.lacunas,
    anomalias: {
      duplicidades,
      lancamentos_sem_origem: semOrigem,
      lancamentos_sem_conta: semConta,
      transferencias_incompletas: transferenciasIncompletas,
      inconsistencias_data: calc.inconsistencias_data,
    },
    resumo,
  };
}