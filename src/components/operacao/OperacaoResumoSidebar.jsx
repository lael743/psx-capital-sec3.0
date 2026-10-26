import { formatCurrency, today } from '@/lib/finance';
import { calcTitulosTotais } from '@/components/operacao/wizard/TituloInlineTable';
import { calcModeEfetivo } from '@/lib/formatosCalculo';

const STORAGE_KEY = 'psx_company_settings';
function getSettings() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch { return {}; }
}

export default function OperacaoResumoSidebar({ operacao, cheques = [] }) {
  const settings = getSettings();
  const startDate = operacao.start_date || today();
  const rate = operacao.rate || 0;
  const interestType = operacao.interest_type || 'simples';
  const floatDias = operacao.float_dias || 0;
  const arredondar = settings.arredondar_taxa_diaria || false;
  const isEmprestimo = operacao.type === 'emprestimo';

  const titulos = cheques.map(c => ({
    tipo: c.tipo,
    vencimento: c.compensation_date,
    valor_face: String(c.valor_face || c.value || ''),
    valor_liquido: String(c.liquido || ''),
    outras_despesas: String(c.outras_despesas || 0),
  }));

  const calcMode = calcModeEfetivo({ tipo: operacao.type, calcMode: operacao.calc_mode, calculoInverso: operacao.calculo_inverso });
  const totals = calcTitulosTotais(titulos, startDate, rate, interestType, floatDias, arredondar, calcMode);
  const tarifaOperacao = operacao.tarifa_operacao || 0;
  const tarifaPorTitulo = operacao.tarifa_por_titulo || 0;
  const tarifas = tarifaOperacao + tarifaPorTitulo * titulos.length;
  // Parcelado: as tarifas já vêm embutidas na face de cada parcela — descontar
  // de novo reduziria o líquido abaixo do repasse que o cedente escolheu.
  const isPrice = calcMode === 'price';
  const liquido = (isEmprestimo || isPrice) ? totals.totalLiquido : totals.totalLiquido - tarifas;
  const desagioDisplay = isEmprestimo ? (totals.totalFace - totals.totalLiquido) : totals.totalDesagio;

  return (
    <div className="bg-white border border-border rounded-xl p-5 space-y-3 sticky top-4">
      <h3 className="text-sm font-bold">Resumo Financeiro</h3>
      <div className="space-y-2.5 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Total Bruto</span>
          <span className="font-semibold">{formatCurrency(totals.totalFace)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">(−) Deságio</span>
          <span className="font-semibold text-red-600">{formatCurrency(desagioDisplay)}</span>
        </div>
        {!isPrice && totals.totalOutras > 0 && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">(−) Outras Despesas</span>
            <span className="font-semibold text-red-600">{formatCurrency(totals.totalOutras)}</span>
          </div>
        )}
        {!isEmprestimo && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">(−) Tarifas</span>
            <span className="font-semibold text-red-600">{formatCurrency(tarifas)}</span>
          </div>
        )}
        <div className="border-t border-border pt-2.5 flex justify-between">
          <span className="font-semibold">Valor Líquido</span>
          <span className="font-bold text-emerald-600">{formatCurrency(liquido)}</span>
        </div>
        <div className="flex justify-between text-xs pt-1">
          <span className="text-muted-foreground">Prazo Médio</span>
          <span className="font-medium">{totals.prazoMedio.toFixed(1)} dias</span>
        </div>
      </div>
    </div>
  );
}