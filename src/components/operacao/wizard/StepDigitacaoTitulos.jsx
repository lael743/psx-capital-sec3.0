import TituloInlineTable, { calcTitulosTotais } from './TituloInlineTable';
import { formatCurrency } from '@/lib/finance';
import { AlertTriangle } from 'lucide-react';

export default function StepDigitacaoTitulos({ titulos, setTitulos, form, isCapitalDesagio, calcMode }) {
  if (isCapitalDesagio) {
    return (
      <div className="space-y-4">
        <div>
          <h3 className="text-sm font-bold mb-1">Configuração do Capital + Deságio</h3>
          <p className="text-xs text-muted-foreground">
            O capital será pago no vencimento e o deságio será parcelado mensalmente. Adicione os vencimentos das parcelas de deságio na etapa de títulos.
          </p>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-800">
            No modo Capital + Deságio, cada título representa uma parcela de deságio mensal. O capital é somado à última parcela (vencimento). Defina o valor do capital no campo "Valor de Face" de cada parcela — o sistema calculará o deságio automaticamente.
          </p>
        </div>
        <TituloInlineTable
          titulos={titulos}
          onChange={setTitulos}
          startDate={form.start_date}
          rate={parseFloat(form.rate) || 0}
          interestType={form.interest_type}
          floatDias={parseFloat(form.float_dias) || 0}
          arredondarTaxaDiaria={form.arredondar_taxa_diaria}
          calcMode={calcMode}
        />
      </div>
    );
  }

  const validCount = titulos.filter((t) => t.vencimento && parseFloat(t.valor_face) > 0).length;
  const totals = calcTitulosTotais(titulos, form.start_date, parseFloat(form.rate) || 0, form.interest_type, parseFloat(form.float_dias) || 0, form.arredondar_taxa_diaria, calcMode);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="text-sm font-bold mb-0.5">Digitação de Títulos</h3>
          <p className="text-xs text-muted-foreground">Adicione os cheques, boletos ou duplicatas para antecipação. O deságio é calculado automaticamente conforme o formato do produto.</p>
        </div>
        <div className="flex items-center gap-4 text-xs">
          <span className="text-muted-foreground">{validCount} título{validCount !== 1 ? 's' : ''} válido{validCount !== 1 ? 's' : ''}</span>
          <span className="font-semibold">Total Face: <span className="text-foreground">{formatCurrency(totals.totalFace)}</span></span>
          <span className="font-semibold">Total Líquido: <span className="text-emerald-600">{formatCurrency(totals.totalLiquido)}</span></span>
        </div>
      </div>
      <TituloInlineTable
        titulos={titulos}
        onChange={setTitulos}
        startDate={form.start_date}
        rate={parseFloat(form.rate) || 0}
        interestType={form.interest_type}
        floatDias={parseFloat(form.float_dias) || 0}
        arredondarTaxaDiaria={form.arredondar_taxa_diaria}
        calcMode={calcMode}
        tipoPadrao={['cheque', 'boleto', 'duplicata'].includes(form.tipo) ? form.tipo : undefined}
      />
      {validCount === 0 && (
        <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          Adicione ao menos 1 título com vencimento e valor para continuar.
        </div>
      )}
    </div>
  );
}