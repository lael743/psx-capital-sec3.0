import { useState, useEffect } from 'react';
import { formatCurrency } from '@/lib/finance';
import { AlertCircle } from 'lucide-react';

/**
 * Editor de parcelas com datas individuais, intervalo e valores editáveis por parcela.
 * Props:
 *   schedule         – array de parcelas calculadas
 *   intervalDays     – intervalo atual em dias
 *   onChangeInterval – callback(n: number)
 *   onChangeDueDate  – callback(idx, date)
 *   customValues     – array of overridden values (or null/undefined for auto)
 *   onChangeValues   – callback(newValues: number[])  – null to reset to auto
 *   totalReceivable  – total a receber esperado
 */
export default function InstallmentScheduleEditor({
  schedule,
  onChangeDueDate,
  intervalDays,
  onChangeInterval,
  customValues,
  onChangeValues,
  totalReceivable,
}) {
  const [editing, setEditing] = useState(false);
  const [localValues, setLocalValues] = useState([]);

  // Sync localValues when schedule changes (if not editing)
  useEffect(() => {
    if (!editing) {
      setLocalValues(schedule.map(s => s.value));
    }
  }, [schedule, editing]);

  const isCustom = editing && customValues !== null && customValues !== undefined;

  const activeValues = isCustom ? customValues : schedule.map(s => s.value);
  const customTotal = activeValues.reduce((s, v) => s + (parseFloat(v) || 0), 0);
  const diff = Math.abs(customTotal - (totalReceivable || 0));
  const isValid = diff < 0.02;

  const startCustomEdit = () => {
    const vals = schedule.map(s => s.value);
    setLocalValues(vals);
    setEditing(true);
    onChangeValues && onChangeValues(vals);
  };

  const handleValueChange = (idx, raw) => {
    const next = [...(customValues || schedule.map(s => s.value))];
    next[idx] = parseFloat(raw) || 0;
    onChangeValues && onChangeValues(next);
  };

  const resetToAuto = () => {
    setEditing(false);
    onChangeValues && onChangeValues(null);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Intervalo padrão (dias)</label>
          <input
            type="number"
            min="1"
            className="input-field w-28"
            value={intervalDays}
            onChange={e => onChangeInterval(parseInt(e.target.value) || 30)}
          />
        </div>
        <p className="text-xs text-muted-foreground mb-2">
          Ajuste individualmente a data e/ou valor de cada parcela abaixo.
        </p>
        {!editing ? (
          <button type="button" onClick={startCustomEdit}
            className="mb-2 px-3 py-1.5 text-xs font-semibold border border-border rounded-lg hover:bg-gray-50 transition-colors">
            Editar valores
          </button>
        ) : (
          <button type="button" onClick={resetToAuto}
            className="mb-2 px-3 py-1.5 text-xs font-semibold border border-amber-300 text-amber-700 rounded-lg hover:bg-amber-50 transition-colors">
            Resetar para automático
          </button>
        )}
      </div>

      {editing && !isValid && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>
            Soma das parcelas: <strong>{formatCurrency(customTotal)}</strong> — Total esperado: <strong>{formatCurrency(totalReceivable)}</strong> — Diferença: <strong>{formatCurrency(diff)}</strong>
          </span>
        </div>
      )}
      {editing && isValid && (
        <div className="flex items-center gap-2 p-2 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-700">
          ✓ Valores conferem com o total da operação.
        </div>
      )}

      <div className="rounded-xl border border-border overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-border">
              <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Parcela</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Vencimento</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Dias</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Principal</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Juros</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {schedule.map((inst, idx) => {
              const overriddenValue = isCustom ? (customValues[idx] ?? inst.value) : inst.value;
              return (
                <tr key={idx} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-4 py-3 font-medium">{idx + 1}ª</td>
                  <td className="px-4 py-3">
                    <input
                      type="date"
                      className="input-field py-1.5 text-xs"
                      value={inst.due_date}
                      onChange={e => onChangeDueDate(idx, e.target.value)}
                    />
                  </td>
                  <td className="px-4 py-3 text-right text-muted-foreground">{inst.days}d</td>
                  <td className="px-4 py-3 text-right text-muted-foreground">{formatCurrency(inst.principal)}</td>
                  <td className="px-4 py-3 text-right text-[hsl(43,65%,47%)] font-medium">{formatCurrency(inst.interest)}</td>
                  <td className="px-4 py-3 text-right font-semibold">
                    {editing ? (
                      <input
                        type="number"
                        step="0.01"
                        className="input-field py-1 text-xs text-right w-28"
                        value={overriddenValue}
                        onChange={e => handleValueChange(idx, e.target.value)}
                      />
                    ) : (
                      formatCurrency(inst.value)
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}