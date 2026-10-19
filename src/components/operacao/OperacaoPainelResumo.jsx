import { Calculator, AlertTriangle, CreditCard, CheckSquare, Info } from 'lucide-react';
import { formatCurrency } from '@/lib/finance';
import { useViewMode } from '@/lib/viewMode';

export default function OperacaoPainelResumo({
  isCheque,
  isBoleto,
  selectedSacado,
  cheques,
  chequeSchedule,
  schedule,
  grossValue,
  effectiveBase,
  netValue,
  totalReceivable,
  totalInterest,
  projectedProfit,
  totalChequesNominal,
  totalChequesPrincipal,
  jurosEmbutido,
  capitalCost,
  rate,
  form,
  selectedClient,
  clientRemainingLimit,
  clientLimit,
  exceedsLimit,
  operationValue,
  lastDueDate,
}) {
  const { isInterno } = useViewMode();
  const validCheques = cheques?.filter(c => c.bank_name && c.check_number && c.value && c.compensation_date) || [];
  const hasData = isCheque ? validCheques.length > 0 : (grossValue > 0 && rate > 0);

  // Prazo médio ponderado
  const avgDays = (() => {
    if (isCheque && chequeSchedule?.length > 0) {
      const totalVal = chequeSchedule.reduce((s, p) => s + p.value, 0);
      if (!totalVal) return null;
      return Math.round(chequeSchedule.reduce((s, p) => s + p.days * (p.value / totalVal), 0));
    }
    if (schedule?.length > 0) {
      const n = schedule.length;
      return Math.round(schedule.reduce((s, p, i) => {
        if (!p.due_date || !form.start_date) return s;
        const d = Math.round((new Date(p.due_date) - new Date(form.start_date)) / 86400000);
        return s + d;
      }, 0) / n);
    }
    return null;
  })();

  // Texto interpretativo
  const interpretation = (() => {
    if (!hasData) return null;
    const parts = [];
    if (isCheque) {
      parts.push(`Operação de desconto de ${validCheques.length} cheque${validCheques.length !== 1 ? 's' : ''}.`);
      parts.push(`Valor líquido a repassar: ${formatCurrency(netValue)}.`);
    } else if (isBoleto) {
      parts.push(`Fomento de recebíveis (boleto) de ${formatCurrency(grossValue)}.`);
      parts.push(`Repasse ao cedente: ${formatCurrency(netValue)}.`);
    } else {
      parts.push(`Empréstimo de ${formatCurrency(grossValue)}.`);
      parts.push(`Valor líquido ao cliente: ${formatCurrency(netValue)}.`);
    }
    if (avgDays) parts.push(`Prazo médio de ${avgDays} dias.`);
    if (isInterno) parts.push(`Lucro projetado de ${formatCurrency(projectedProfit)}.`);
    return parts.join(' ');
  })();

  return (
    <div className="flex flex-col gap-3">

      {/* Cabeçalho */}
      <div className="flex items-center gap-2 px-1">
        <Calculator className="w-4 h-4 text-[hsl(43,65%,47%)]" />
        <span className="text-sm font-bold text-foreground">Resumo da Operação</span>
      </div>

      {/* Info Sacado */}
      {isBoleto && selectedSacado && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Info className="w-3 h-3 text-blue-600" />
            <span className="text-xs font-semibold text-blue-700 uppercase">Sacado / Pagador</span>
          </div>
          <div className="text-xs space-y-0.5">
            <div className="flex justify-between">
              <span className="text-blue-600">Nome</span>
              <span className="font-semibold text-blue-900">{selectedSacado.name}{selectedSacado.fantasy_name ? ` (${selectedSacado.fantasy_name})` : ''}</span>
            </div>
            {selectedSacado.document && (
              <div className="flex justify-between">
                <span className="text-blue-600">{selectedSacado.document_type || 'Doc'}</span>
                <span className="text-blue-900">{selectedSacado.document}</span>
              </div>
            )}
            {selectedSacado.risk_profile && (
              <div className="flex justify-between">
                <span className="text-blue-600">Risco</span>
                <span className="font-semibold capitalize text-blue-900">{selectedSacado.risk_profile}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Alertas */}
      {exceedsLimit && (
        <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span><strong>Limite excedido.</strong> O valor ({formatCurrency(operationValue)}) supera o limite restante do cliente ({formatCurrency(Math.max(0, clientRemainingLimit))}).</span>
        </div>
      )}

      {selectedClient?.risk_profile === 'alto' && (
        <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-700">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>Cliente com perfil de risco <strong>alto</strong>.</span>
        </div>
      )}

      {selectedClient?.status === 'bloqueado' && (
        <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>Cliente <strong>bloqueado</strong>. Verifique antes de prosseguir.</span>
        </div>
      )}

      {/* Indicadores financeiros */}
      {hasData ? (
        <>
          <div className="bg-white border border-border rounded-xl overflow-hidden">
            <div className="grid grid-cols-1 divide-y divide-border">
              <KpiRow
                label={isCheque ? (jurosEmbutido ? 'Valor Líquido (repasse)' : 'Líquido ao cliente') : isBoleto ? 'Repasse ao Cedente' : 'Valor Líquido'}
                value={formatCurrency(netValue)}
                color="text-emerald-700"
              />
              <KpiRow
                label={isCheque ? (jurosEmbutido ? 'Total dos Cheques' : 'Total Recebível') : isBoleto ? 'Total dos Boletos' : 'Total a Receber'}
                value={formatCurrency(totalReceivable)}
                color="text-foreground font-bold"
                large
              />
              {isInterno && <KpiRow label="Juros Total" value={formatCurrency(totalInterest)} color="text-[hsl(43,65%,47%)]" />}
              {isInterno && <KpiRow label="Lucro Projetado" value={formatCurrency(projectedProfit)} color="text-emerald-600" />}
              {isInterno && capitalCost > 0 && (
                <KpiRow label="Custo de Capital" value={`- ${formatCurrency(capitalCost)}`} color="text-red-600" />
              )}
              {avgDays && (
                <KpiRow label="Prazo Médio" value={`${avgDays} dias`} color="text-muted-foreground" />
              )}
            </div>
          </div>

          {/* Lista de cheques */}
          {isCheque && chequeSchedule?.length > 0 && (
            <div className="bg-white border border-border rounded-xl overflow-hidden">
              <div className="px-3 py-2 border-b border-border bg-gray-50/70 flex items-center gap-1.5">
                <CheckSquare className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Cheques ({chequeSchedule.length})
                </span>
              </div>
              <div className="divide-y divide-border">
                {chequeSchedule.map((p, i) => (
                  <div key={i} className="flex items-center justify-between px-3 py-2.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-5 h-5 rounded-full bg-gray-100 flex items-center justify-center text-xs font-bold text-muted-foreground shrink-0">
                        {i + 1}
                      </div>
                      <div className="min-w-0">
                         <div className="text-xs font-semibold text-foreground">
                          {jurosEmbutido ? formatCurrency(p.value) : `${formatCurrency(p.principal)} → ${formatCurrency(p.value)}`}
                        </div>
                        <div className="text-xs text-muted-foreground">{p.due_date ? new Date(p.due_date + 'T00:00:00').toLocaleDateString('pt-BR') : '—'} · {p.days}d</div>
                      </div>
                    </div>
                    {p.interest > 0 && (
                      <div className="text-xs text-[hsl(43,65%,47%)] font-medium shrink-0 ml-2">
                        +{formatCurrency(p.interest)}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              {/* Totais cheques */}
              <div className="border-t border-border bg-gray-50/70 px-3 py-2 flex justify-between items-center">
                <span className="text-xs text-muted-foreground font-semibold">Total</span>
                <span className="text-sm font-bold">{formatCurrency(totalReceivable)}</span>
              </div>
            </div>
          )}

          {/* Lista de parcelas — empréstimo e boleto */}
          {!isCheque && schedule?.length > 0 && (
            <div className="bg-white border border-border rounded-xl overflow-hidden">
              <div className="px-3 py-2 border-b border-border bg-gray-50/70 flex items-center gap-1.5">
                <CreditCard className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  {isBoleto ? `Boletos (${schedule.length})` : `Parcelas (${schedule.length})`}
                </span>
              </div>
              <div className="divide-y divide-border max-h-60 overflow-y-auto">
                {schedule.map((p, i) => (
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
            </div>
          )}

          {/* Interpretação */}
          {interpretation && (
            <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-100 rounded-xl text-xs text-blue-800 leading-relaxed">
              <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-blue-500" />
              <span>{interpretation}</span>
            </div>
          )}
        </>
      ) : (
        <div className="bg-white border border-dashed border-border rounded-xl p-6 text-center">
          <Calculator className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
          <p className="text-xs text-muted-foreground">Preencha os dados da operação para ver o resumo aqui.</p>
        </div>
      )}
    </div>
  );
}

function KpiRow({ label, value, color = 'text-foreground', large = false }) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`${large ? 'text-base' : 'text-sm'} font-semibold ${color}`}>{value}</span>
    </div>
  );
}