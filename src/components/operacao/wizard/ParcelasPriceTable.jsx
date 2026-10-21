import { formatCurrency, formatDate } from '@/lib/finance';

/**
 * Tabela do Parcelado (Tabela Price).
 * Usada na etapa de Parcelas (com edição de vencimento) e no Resumo &
 * Confirmação (somente leitura) — as duas telas mostram os MESMOS números,
 * porque ambos recebem as linhas do mesmo motor (`priceOperacao`).
 */
export default function ParcelasPriceTable({ linhas = [], totais, onVencimentoChange }) {
  if (!linhas.length) return null;
  const total = totais || {};
  const editavel = typeof onVencimentoChange === 'function';

  return (
    <div className="border border-border rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-gray-50 border-b border-border">
              <th className="px-3 py-2.5 text-left font-semibold text-muted-foreground uppercase tracking-wider">Parcela</th>
              <th className="px-3 py-2.5 text-left font-semibold text-muted-foreground uppercase tracking-wider">Vencimento</th>
              <th className="px-3 py-2.5 text-right font-semibold text-muted-foreground uppercase tracking-wider">Dias</th>
              <th className="px-3 py-2.5 text-right font-semibold text-muted-foreground uppercase tracking-wider">Parcela (Face)</th>
              <th className="px-3 py-2.5 text-right font-semibold text-muted-foreground uppercase tracking-wider">Juros</th>
              <th className="px-3 py-2.5 text-right font-semibold text-muted-foreground uppercase tracking-wider">Amortização</th>
              <th className="px-3 py-2.5 text-right font-semibold text-muted-foreground uppercase tracking-wider">Despesas</th>
              <th className="px-3 py-2.5 text-right font-semibold text-muted-foreground uppercase tracking-wider">Líquido</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {linhas.map((l, i) => (
              <tr key={i} className="hover:bg-gray-50/50">
                <td className="px-3 py-2 font-medium">{l.numero}/{linhas.length}</td>
                <td className="px-3 py-2">
                  {editavel
                    ? <input
                        type="date"
                        className="input-field py-1 text-xs"
                        value={l.vencimento}
                        onChange={(e) => onVencimentoChange(i, e.target.value)}
                      />
                    : formatDate(l.vencimento)}
                </td>
                <td className="px-3 py-2 text-right text-muted-foreground tabular-nums">{l.dias || '—'}</td>
                <td className="px-3 py-2 text-right tabular-nums font-semibold">{formatCurrency(l.face)}</td>
                <td className="px-3 py-2 text-right text-red-600 tabular-nums">{formatCurrency(l.juros)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(l.amortizacao)}</td>
                <td className="px-3 py-2 text-right text-muted-foreground tabular-nums">{l.despesa ? formatCurrency(l.despesa) : '—'}</td>
                <td className="px-3 py-2 text-right text-emerald-600 font-semibold tabular-nums">{formatCurrency(l.liquido)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-gray-50 border-t-2 border-border font-bold">
              <td colSpan={3} className="px-3 py-2.5 text-right text-xs uppercase tracking-wider text-muted-foreground">
                Total ({linhas.length} parcelas)
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums">{formatCurrency(total.face)}</td>
              <td className="px-3 py-2.5 text-right text-red-600 tabular-nums">{formatCurrency(total.juros)}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{formatCurrency(total.amortizacao)}</td>
              <td className="px-3 py-2.5 text-right text-muted-foreground tabular-nums">{formatCurrency(total.despesa)}</td>
              <td className="px-3 py-2.5 text-right text-emerald-600 tabular-nums">{formatCurrency(total.liquido)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}