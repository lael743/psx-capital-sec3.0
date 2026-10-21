/**
 * FORMATOS DE CÁLCULO DA ANTECIPAÇÃO — fonte ÚNICA de nomes e convenções.
 *
 * O problema que este arquivo resolve: os nomes antigos estavam INVERTIDOS em
 * relação ao comportamento real do motor.
 *
 *   calc_mode 'inverso'  → o usuário digita o valor de FACE; o deságio reduz o
 *                          repasse.  (é o "Padrão — deságio sobre o valor de face")
 *   calc_mode 'padrao'   → o usuário digita o repasse LÍQUIDO; o sistema calcula
 *                          a face por face = repasse ÷ (1 − taxa × dias/30).
 *                          (é o "Inverso — cálculo do valor de face")
 *
 * Por isso as chaves canônicas são novas e autoexplicativas — `desagio_face`,
 * `face_por_repasse` e `price` — e os nomes antigos são apenas APELIDOS lidos
 * por `normalizarCalcMode`. Nenhum registro histórico é reescrito: uma operação
 * gravada com `calc_mode: 'inverso'` continua reproduzindo exatamente o mesmo
 * cálculo (ver LEGADO e os testes de compatibilidade).
 *
 * O tipo do título (Cheque, Duplicata, Boleto) NÃO escolhe fórmula: escolhe
 * apenas as particularidades operacionais (emissão, registro, cobrança,
 * compensação, integração Asaas).
 */

const round2 = (v) => Math.round((Number(v) || 0) * 100) / 100;

export const DESAGIO_FACE = 'desagio_face';
export const FACE_POR_REPASSE = 'face_por_repasse';
export const PRICE = 'price';

/** Formatos oferecidos ao usuário. */
export const FORMATOS = [
  {
    key: DESAGIO_FACE,
    nome: 'Padrão',
    titulo: 'Padrão — Deságio sobre o valor de face',
    entrada: 'face',
    entradaLabel: 'Valor de face',
    descricao:
      'O valor de face do título é conhecido. O deságio, as tarifas e as despesas reduzem o repasse ao cliente.',
  },
  {
    key: FACE_POR_REPASSE,
    nome: 'Inverso',
    titulo: 'Inverso — Cálculo do valor de face',
    entrada: 'repasse',
    entradaLabel: 'Repasse desejado',
    descricao:
      'O repasse líquido pedido pelo cliente é conhecido. O sistema calcula o valor de face necessário para atingi-lo, conforme taxa, prazo e despesas.',
  },
  {
    key: PRICE,
    nome: 'Parcelado',
    titulo: 'Parcelado — Tabela Price',
    entrada: 'repasse',
    entradaLabel: 'Repasse solicitado',
    descricao:
      'O valor solicitado é distribuído em parcelas calculadas pela taxa e pelos intervalos de vencimento (Tabela Price). Também aceita o valor da parcela como entrada.',
  },
];

export const FORMATO_POR_CHAVE = FORMATOS.reduce((acc, f) => ({ ...acc, [f.key]: f }), {});

/**
 * Apelidos históricos → chave canônica.
 * `desconto_direto`, `juros_cedente`, `emprestimo` e `capital_desagio` NÃO são
 * formatos oferecidos ao usuário: existem em registros antigos e continuam
 * sendo calculados exatamente como antes (sem migração de dados).
 */
export const LEGADO = {
  inverso: DESAGIO_FACE,
  padrao: FACE_POR_REPASSE,
  desconto_direto: 'desconto_direto',
  juros_cedente: 'juros_cedente',
  emprestimo: 'emprestimo',
  capital_desagio: 'capital_desagio',
  assinatura: 'assinatura',
};

export function normalizarCalcMode(mode) {
  if (!mode) return DESAGIO_FACE;
  return LEGADO[mode] || mode;
}

/** Rótulo curto para telas, listas e documentos. */
export function labelCalcMode(mode) {
  const chave = normalizarCalcMode(mode);
  const formato = FORMATO_POR_CHAVE[chave];
  if (formato) return formato.nome;
  return {
    desconto_direto: 'Desconto Direto (legado)',
    juros_cedente: 'Juros do Cedente (legado)',
    emprestimo: 'Empréstimo',
    capital_desagio: 'Capital + Deságio',
    assinatura: 'Assinatura',
  }[chave] || chave;
}

export function isFormatoNovo(mode) {
  return !!FORMATO_POR_CHAVE[normalizarCalcMode(mode)];
}

/** Formatos em que o valor de face (ou da parcela) pode ser a entrada conhecida. */
export function aceitaInversao(mode) {
  const chave = normalizarCalcMode(mode);
  return chave === FACE_POR_REPASSE || chave === PRICE;
}

export const CALC_MODE_EMPREESTIMO = 'emprestimo';

/**
 * Formato REALMENTE usado no cálculo da operação.
 * Regras (as mesmas de antes da renomeação, agora com nomes explícitos):
 *  · Parcelado manda em tudo — a Tabela Price tem o seu próprio cronograma;
 *  · operação do tipo Empréstimo continua no motor de empréstimo;
 *  · nos demais, a opção "inverter" troca a entrada para o repasse desejado.
 */
export function calcModeEfetivo({ tipo, calcMode, calculoInverso } = {}) {
  const modo = normalizarCalcMode(calcMode);
  if (modo === PRICE) return PRICE;
  if (tipo === CALC_MODE_EMPREESTIMO) return CALC_MODE_EMPREESTIMO;
  return calculoInverso ? FACE_POR_REPASSE : modo;
}

/**
 * Taxa do PERÍODO a partir da taxa mensal e dos dias do intervalo.
 *
 * Convenção adotada (e documentada para auditoria):
 *  · juros simples   → i_período = i_mensal × dias/30  (proporcional, como no
 *    desconto comercial já usado no produto);
 *  · juros compostos → i_período = (1 + i_mensal)^(dias/30) − 1.
 *
 * Nunca se aplica a taxa mensal direto a um intervalo de 15 dias: o expoente
 * dias/30 é o que ajusta o período.
 */
export function taxaDoPeriodo(taxaMensalPct, dias, interestType = 'simples') {
  const i = (Number(taxaMensalPct) || 0) / 100;
  const d = Number(dias) || 0;
  if (i <= 0 || d <= 0) return 0;
  if (interestType === 'composto') return Math.pow(1 + i, d / 30) - 1;
  return i * (d / 30);
}

/**
 * TABELA PRICE — cronograma a partir do REPASSE conhecido.
 *
 * Price clássico: parcela constante PMT = PV × i / (1 − (1+i)^−n), juros sobre o
 * saldo e amortização = PMT − juros.
 *
 * Para vencimentos com intervalos diferentes, cada período tem a sua própria
 * taxa i_k (ver taxaDoPeriodo) e a parcela é obtida descontando-se todos os
 * períodos:
 *
 *   PMT = PV / Σ_k [ 1 / Π_{j≤k}(1 + i_j) ]
 *
 * Com todas as taxas iguais isso é exatamente a fórmula clássica. A última
 * parcela absorve o resíduo de centavos, de modo que a soma das amortizações é
 * igual ao repasse e a soma das parcelas é exatamente o total do cronograma.
 *
 * @param {object} p
 * @param {number} p.repasse valor líquido liberado (PV)
 * @param {number} p.taxaMensalPct
 * @param {string} [p.interestType] 'simples' | 'composto'
 * @param {Array<{dias:number, vencimento?:string}>} p.vencimentos
 * @returns {Array<{numero, dias, vencimento, valor, juros, amortizacao, saldo}>}
 */
export function cronogramaPrice({ repasse, taxaMensalPct, interestType = 'simples', vencimentos = [] }) {
  const pv = Number(repasse) || 0;
  const periodos = (vencimentos || []).map((v) => ({
    dias: Number(v?.dias) || 0,
    vencimento: v?.vencimento || '',
  }));
  const n = periodos.length;
  if (n === 0 || pv <= 0) return [];

  const taxas = periodos.map((p) => taxaDoPeriodo(taxaMensalPct, p.dias, interestType));

  let acumulado = 1;
  const fatores = taxas.map((i) => {
    acumulado *= 1 + i;
    return acumulado;
  });
  const somaDesconto = fatores.reduce((s, f) => s + 1 / f, 0);
  const parcela = round2(somaDesconto > 0 ? pv / somaDesconto : pv / n);

  const rows = [];
  let saldo = pv;
  for (let k = 0; k < n; k++) {
    const ultima = k === n - 1;
    const juros = round2(saldo * taxas[k]);
    const amortizacao = ultima ? round2(saldo) : round2(parcela - juros);
    saldo = round2(saldo - amortizacao);
    rows.push({
      numero: k + 1,
      dias: periodos[k].dias,
      vencimento: periodos[k].vencimento,
      valor: round2(amortizacao + juros),
      juros,
      amortizacao,
      saldo,
    });
  }
  return rows;
}

/**
 * Inversão do Parcelado: a partir das parcelas (valor de face) conhecidas,
 * devolve o repasse equivalente — soma dos valores trazidos a valor presente
 * pelas taxas de cada período.
 */
export function repasseDeParcelas({ valores = [], taxasPeriodo = [] }) {
  let acumulado = 1;
  let pv = 0;
  (valores || []).forEach((valor, k) => {
    acumulado *= 1 + (Number(taxasPeriodo[k]) || 0);
    pv += (Number(valor) || 0) / acumulado;
  });
  return round2(pv);
}

/** Cronograma Price a partir do valor da PARCELA (entrada conhecida). */
export function cronogramaPricePorParcela({ valorParcela, taxaMensalPct, interestType = 'simples', vencimentos = [] }) {
  const periodos = (vencimentos || []).map((v) => ({
    dias: Number(v?.dias) || 0,
    vencimento: v?.vencimento || '',
  }));
  const n = periodos.length;
  const pmt = Number(valorParcela) || 0;
  if (n === 0 || pmt <= 0) return { repasse: 0, parcelas: [] };

  const taxas = periodos.map((p) => taxaDoPeriodo(taxaMensalPct, p.dias, interestType));
  const repasse = repasseDeParcelas({ valores: periodos.map(() => pmt), taxasPeriodo: taxas });

  let saldo = repasse;
  const rows = periodos.map((p, k) => {
    const juros = round2(saldo * taxas[k]);
    const ultima = k === n - 1;
    const amortizacao = ultima ? round2(saldo) : round2(pmt - juros);
    saldo = round2(saldo - amortizacao);
    return {
      numero: k + 1,
      dias: p.dias,
      vencimento: p.vencimento,
      valor: round2(amortizacao + juros),
      juros,
      amortizacao,
      saldo,
    };
  });
  return { repasse, parcelas: rows };
}

/** Total de juros (resultado bruto financeiro) de um cronograma Price. */
export function jurosDoCronograma(parcelas = []) {
  return round2((parcelas || []).reduce((s, p) => s + (Number(p.juros) || 0), 0));
}