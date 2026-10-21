import { formatCurrency } from '@/lib/finance';

export default function ResumoFinanceiroCard({ totalBruto, totalDesagio, tarifaOperacao, tarifaTitulos, totalOutras, valorLiquido, prazoMedio, desagioPeriodo, taxaEfetiva = 0 }) {
  const rows = [
    { label: 'Total Bruto', value: formatCurrency(totalBruto), sign: '+' },
    { label: 'Deságio', value: formatCurrency(totalDesagio), sign: '−', color: 'text-red-600' },
    { label: 'Tarifa Operação', value: formatCurrency(tarifaOperacao), sign: '−', color: 'text-red-600' },
    { label: 'Tarifa Títulos', value: formatCurrency(tarifaTitulos), sign: '−', color: 'text-red-600' },
    totalOutras > 0 && { label: 'Outras Despesas', value: formatCurrency(totalOutras), sign: '−', color: 'text-red-600' },
  ].filter(Boolean);

  return (
    <div className="rounded-xl overflow-hidden border border-border shadow-sm">
      <div className="bg-[hsl(43,65%,47%)] px-5 py-3">
        <h3 className="text-sm font-bold text-white uppercase tracking-wide">Resumo Financeiro</h3>
      </div>
      <div className="bg-white px-5 py-4 space-y-2">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              {r.sign && <span className="mr-1 font-medium">{r.sign}</span>}
              {r.label}
            </span>
            <span className={`font-semibold ${r.color || ''}`}>{r.value}</span>
          </div>
        ))}
        <div className="border-t border-border my-2" />
        <div className="flex items-center justify-between">
          <span className="text-sm font-bold">Valor Líquido</span>
          <span className="text-lg font-bold text-emerald-600">{formatCurrency(valorLiquido)}</span>
        </div>
        <div className="border-t border-dashed border-border pt-2 mt-2 space-y-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Prazo Médio Ponderado</span>
            <span className="font-semibold text-foreground">{prazoMedio.toFixed(2)} dias</span>
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Deságio Período</span>
            <span className="font-semibold text-foreground">{desagioPeriodo.toFixed(2)}%</span>
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Taxa Efetiva</span>
            <span className="font-semibold text-foreground">{taxaEfetiva.toFixed(2)}% a.m.</span>
          </div>
        </div>
      </div>
    </div>
  );
}