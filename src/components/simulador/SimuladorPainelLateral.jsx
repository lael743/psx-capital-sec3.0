import { Calculator, CreditCard, TrendingUp, PanelRight, BookmarkPlus } from 'lucide-react';
import { formatCurrency } from '@/lib/finance';

function resolveCalcMode(s) {
  if (s.calc_mode) return s.calc_mode;
  if (s.juros_embutido) return 'inverso';
  return 'padrao';
}

function KpiRow({ label, value, color = 'text-foreground', large = false }) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`${large ? 'text-base' : 'text-sm'} font-semibold ${color}`}>{value}</span>
    </div>
  );
}

export default function SimuladorPainelLateral({ scenarios, results, onOpenDrawer, onSave }) {
  const hasAny = results.some(Boolean);

  // Agrega todos os cenários com resultado
  const validos = scenarios.map((s, i) => ({ s, r: results[i] })).filter(({ r }) => !!r);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <Calculator className="w-4 h-4 text-[hsl(43,65%,47%)]" />
          <span className="text-sm font-bold">Resumo</span>
        </div>
        {hasAny && (
          <div className="flex items-center gap-2">
            <button onClick={onSave}
              className="flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground">
              <BookmarkPlus className="w-3.5 h-3.5" /> Salvar
            </button>
            <span className="text-border">|</span>
            <button onClick={onOpenDrawer}
              className="flex items-center gap-1 text-xs font-semibold text-[hsl(43,65%,47%)] hover:underline">
              <PanelRight className="w-3.5 h-3.5" /> Visão cliente
            </button>
          </div>
        )}
      </div>

      {!hasAny ? (
        <div className="bg-white border border-dashed border-border rounded-xl p-6 text-center">
          <Calculator className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
          <p className="text-xs text-muted-foreground">Preencha os dados para ver o resumo aqui.</p>
        </div>
      ) : (
        validos.map(({ s, r }, idx) => {
          const isCheque = s.type === 'cheque';
          return (
            <div key={idx} className="bg-white border border-border rounded-xl overflow-hidden">
              {/* Cabeçalho do cenário */}
              <div className="px-4 py-2.5 border-b border-border bg-gray-50 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded-full bg-foreground text-primary-foreground text-[10px] font-bold flex items-center justify-center shrink-0">
                    {idx + 1}
                  </div>
                  <span className="text-xs font-semibold truncate">{s.label}</span>
                </div>
                <span className="text-[10px] font-medium text-muted-foreground bg-gray-100 px-2 py-0.5 rounded-full">
                  {isCheque ? 'Cheque' : 'Empréstimo'}
                </span>
              </div>

              {/* KPIs */}
              <div className="divide-y divide-border">
                <KpiRow
                  label={isCheque && resolveCalcMode(s) === 'inverso' ? 'Líquido (repasse)' : 'Valor Líquido'}
                  value={formatCurrency(r.netValue)}
                  color="text-emerald-700"
                />
                <KpiRow
                  label={isCheque && resolveCalcMode(s) === 'inverso' ? 'Total Cheques' : 'Total a Receber'}
                  value={formatCurrency(r.totalReceivable)}
                  color="text-foreground font-bold"
                  large
                />
                <KpiRow label="Juros Total" value={formatCurrency(r.interest)} color="text-[hsl(43,65%,47%)]" />
                <KpiRow label="Lucro Projetado" value={formatCurrency(r.projectedProfit)} color="text-emerald-600" />
                <KpiRow label="ROI" value={`${r.roi.toFixed(2)}%`} color="text-emerald-600" />
                <KpiRow label="Prazo" value={`${r.days} dias`} color="text-muted-foreground" />
                {!isCheque && parseInt(s.installments) > 1 && (
                  <KpiRow label={`${s.installments}x de`} value={formatCurrency(r.installmentValue)} color="text-muted-foreground" />
                )}
              </div>

              {/* Parcelas mini-lista */}
              {!isCheque && r.schedule?.length > 1 && (
                <div className="border-t border-border">
                  <div className="px-3 py-2 bg-gray-50/70 flex items-center gap-1.5">
                    <CreditCard className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Parcelas ({r.schedule.length})
                    </span>
                  </div>
                  <div className="divide-y divide-border max-h-48 overflow-y-auto">
                    {r.schedule.map((p, i) => (
                      <div key={i} className="flex items-center justify-between px-3 py-2">
                        <div className="flex items-center gap-2">
                          <div className="w-5 h-5 rounded-full bg-gray-100 flex items-center justify-center text-xs font-bold text-muted-foreground shrink-0">
                            {i + 1}
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {p.due_date ? new Date(p.due_date + 'T00:00:00').toLocaleDateString('pt-BR') : '—'}
                          </span>
                        </div>
                        <span className="text-xs font-semibold">{formatCurrency(p.value)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="border-t border-border bg-gray-50/70 px-3 py-2 flex justify-between items-center">
                    <span className="text-xs text-muted-foreground font-semibold">Total</span>
                    <span className="text-sm font-bold">{formatCurrency(r.totalReceivable)}</span>
                  </div>
                </div>
              )}
            </div>
          );
        })
      )}

      {/* Comparativo rápido */}
      {validos.length > 1 && (
        <div className="bg-white border border-border rounded-xl overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border bg-gray-50 flex items-center gap-1.5">
            <TrendingUp className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Melhor ROI</span>
          </div>
          <div className="p-3 space-y-1.5">
            {validos
              .slice()
              .sort((a, b) => b.r.roi - a.r.roi)
              .map(({ s, r }, i) => (
                <div key={i} className={`flex items-center justify-between px-3 py-2 rounded-lg ${i === 0 ? 'bg-emerald-50 border border-emerald-200' : 'bg-gray-50'}`}>
                  <span className={`text-xs font-semibold ${i === 0 ? 'text-emerald-800' : 'text-muted-foreground'}`}>{s.label}</span>
                  <span className={`text-xs font-bold ${i === 0 ? 'text-emerald-700' : 'text-muted-foreground'}`}>{r.roi.toFixed(2)}%</span>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}