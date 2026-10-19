import { addMonths, format } from 'date-fns';

/* ============================================================
 * Gestão Interna — constantes e cálculos auxiliares
 * ============================================================ */

export const MEIOS_PAGAMENTO = [
  { value: 'pix', label: 'PIX' },
  { value: 'transferencia', label: 'Transferência' },
  { value: 'boleto', label: 'Boleto' },
  { value: 'dinheiro', label: 'Dinheiro' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'debito_automatico', label: 'Débito automático' },
  { value: 'cartao_credito', label: 'Cartão de crédito' },
  { value: 'cartao_debito', label: 'Cartão de débito' },
  { value: 'outro', label: 'Outro' },
];

export const TIPOS_CONTA = [
  { value: 'conta_bancaria', label: 'Conta bancária' },
  { value: 'caixa', label: 'Caixa' },
  { value: 'cartao_credito', label: 'Cartão de crédito' },
  { value: 'outro', label: 'Outro' },
];

export const STATUS_OBRIGACAO_LABELS = {
  a_vencer: 'A vencer',
  vencido: 'Vencido',
  parcialmente_pago: 'Parcialmente pago',
  pago: 'Pago',
  cancelado: 'Cancelado',
};

export const STATUS_OBRIGACAO_CLASSES = {
  a_vencer: 'bg-amber-50 text-amber-700 border-amber-200',
  vencido: 'bg-red-50 text-red-700 border-red-200',
  parcialmente_pago: 'bg-blue-50 text-blue-700 border-blue-200',
  pago: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  cancelado: 'bg-gray-100 text-gray-500 border-gray-300 line-through',
};

export const STATUS_PATRIMONIO_LABELS = {
  ativo: 'Ativo',
  em_manutencao: 'Em manutenção',
  baixado: 'Baixado',
  vendido: 'Vendido',
};

export const STATUS_PATRIMONIO_CLASSES = {
  ativo: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  em_manutencao: 'bg-amber-50 text-amber-700 border-amber-200',
  baixado: 'bg-gray-100 text-gray-600 border-gray-300',
  vendido: 'bg-blue-50 text-blue-700 border-blue-200',
};

export const STATUS_ABERTOS = ['a_vencer', 'vencido', 'parcialmente_pago'];

export function meioPagamentoLabel(value) {
  return MEIOS_PAGAMENTO.find(m => m.value === value)?.label || value || '—';
}

export function tipoContaLabel(value) {
  return TIPOS_CONTA.find(t => t.value === value)?.label || value || '—';
}

export function hojeISO() {
  return format(new Date(), 'yyyy-MM-dd');
}

export function mesAtual() {
  return format(new Date(), 'yyyy-MM');
}

/** Soma meses a uma data ISO preservando o dia (ajustando fim de mês). */
export function addMesesISO(dateStr, months) {
  if (!dateStr) return '';
  const [y, m, d] = String(dateStr).split('-').map(Number);
  if (!y || !m || !d) return '';
  return format(addMonths(new Date(y, m - 1, d), months), 'yyyy-MM-dd');
}

/**
 * Gera as parcelas de um lançamento.
 * A diferença de centavos é absorvida pela última parcela.
 */
export function gerarParcelas(valorTotal, numParcelas, primeiroVencimento) {
  const n = Math.max(1, Number(numParcelas) || 1);
  const total = Math.round((Number(valorTotal) || 0) * 100) / 100;
  const base = Math.round((total / n) * 100) / 100;
  const rows = [];
  for (let i = 0; i < n; i++) {
    const isLast = i === n - 1;
    const valor = isLast ? Math.round((total - base * (n - 1)) * 100) / 100 : base;
    rows.push({ numero: i + 1, valor, vencimento: addMesesISO(primeiroVencimento, i) });
  }
  return rows;
}

/**
 * Status exibido da parcela — considera vencimento em relação a hoje
 * sem depender de rotina de atualização.
 */
export function statusObrigacaoExibido(ob) {
  if (!ob) return 'a_vencer';
  if (ob.status === 'pago' || ob.status === 'cancelado') return ob.status;
  const pago = Number(ob.valor_pago) || 0;
  if (pago > 0 && (Number(ob.valor) || 0) - pago > 0.005) return 'parcialmente_pago';
  if (ob.vencimento && ob.vencimento < hojeISO()) return 'vencido';
  return 'a_vencer';
}

/** Saldo pendente calculado (fallback quando o campo não está preenchido). */
export function saldoObrigacao(ob) {
  if (!ob) return 0;
  if (ob.status === 'cancelado') return 0;
  if (ob.saldo !== null && ob.saldo !== undefined) return Math.max(0, Number(ob.saldo) || 0);
  return Math.max(0, (Number(ob.valor) || 0) - (Number(ob.valor_pago) || 0));
}

/**
 * Depreciação linear gerencial estimada.
 * Não é contabilização fiscal nem escrituração contábil oficial.
 */
export function calcularDepreciacao(bem, refDate = new Date()) {
  const valorTotal = Number(bem?.valor_total) || 0;
  const residual = Number(bem?.valor_residual) || 0;
  const vida = Number(bem?.vida_util_meses) || 0;

  if (!valorTotal || !vida || vida <= 0 || !bem?.data_aquisicao) {
    return {
      aplicavel: false,
      mesesDecorridos: 0,
      depreciacaoAcumulada: 0,
      depreciacaoMensal: 0,
      valorContabil: valorTotal,
    };
  }

  const [y, m, d] = String(bem.data_aquisicao).split('-').map(Number);
  const inicio = new Date(y, m - 1, d);
  if (isNaN(inicio.getTime())) {
    return { aplicavel: false, mesesDecorridos: 0, depreciacaoAcumulada: 0, depreciacaoMensal: 0, valorContabil: valorTotal };
  }

  let meses = (refDate.getFullYear() - inicio.getFullYear()) * 12 + (refDate.getMonth() - inicio.getMonth());
  if (refDate.getDate() < inicio.getDate()) meses -= 1;
  meses = Math.max(0, Math.min(meses, vida));

  const baseDepreciavel = Math.max(0, valorTotal - residual);
  const depreciacaoMensal = Math.round((baseDepreciavel / vida) * 100) / 100;
  const depreciacaoAcumulada = Math.round((baseDepreciavel * (meses / vida)) * 100) / 100;

  return {
    aplicavel: true,
    mesesDecorridos: meses,
    vidaUtilMeses: vida,
    valorResidual: residual,
    depreciacaoMensal,
    depreciacaoAcumulada,
    valorContabil: Math.round((valorTotal - depreciacaoAcumulada) * 100) / 100,
  };
}