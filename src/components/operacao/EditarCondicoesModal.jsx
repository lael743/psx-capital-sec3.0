import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { X, AlertTriangle, Check } from 'lucide-react';
import { formatCurrency, daysBetween, today } from '@/lib/finance';
import { calcTituloRow, calcTitulosTotais } from '@/components/operacao/wizard/TituloInlineTable';
import { logAction } from '@/lib/audit';
import { conflitosFinanceiros, mergeFinancialFields, mensagemConflito, salvarCondicionado } from '@/lib/scheduleWrite';

const STORAGE_KEY = 'psx_company_settings';
function getSettings() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch { return {}; }
}

export default function EditarCondicoesModal({ operacao, cheques, onClose, onSaved }) {
  const settings = getSettings();
  const [form, setForm] = useState({
    rate: String(operacao.rate ?? ''),
    float_dias: String(operacao.float_dias ?? 0),
    tarifa_operacao: String(operacao.tarifa_operacao ?? 0),
    tarifa_por_titulo: String(operacao.tarifa_por_titulo ?? 0),
  });
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [conflito, setConflito] = useState('');

  const startDate = operacao.start_date || today();
  const interestType = operacao.interest_type || 'simples';
  const arredondar = settings.arredondar_taxa_diaria || false;

  // Current values
  const curRate = operacao.rate || 0;
  const curFloat = operacao.float_dias || 0;
  const curTarifaOp = operacao.tarifa_operacao || 0;
  const curTarifaTit = operacao.tarifa_por_titulo || 0;

  // New values
  const newRate = parseFloat(form.rate) || 0;
  const newFloat = parseFloat(form.float_dias) || 0;
  const newTarifaOp = parseFloat(form.tarifa_operacao) || 0;
  const newTarifaTit = parseFloat(form.tarifa_por_titulo) || 0;

  // Build titulos from cheques
  const titulos = cheques.map(c => ({
    tipo: c.tipo,
    vencimento: c.compensation_date,
    valor_face: String(c.valor_face || c.value || ''),
    outras_despesas: String(c.outras_despesas || 0),
  }));

  // Before calculation
  const beforeTotals = calcTitulosTotais(titulos, startDate, curRate, interestType, curFloat, arredondar);
  const beforeTarifas = curTarifaOp + curTarifaTit * titulos.length;
  const beforeLiquido = beforeTotals.totalLiquido - beforeTarifas;

  // After calculation
  const afterTotals = calcTitulosTotais(titulos, startDate, newRate, interestType, newFloat, arredondar);
  const afterTarifas = newTarifaOp + newTarifaTit * titulos.length;
  const afterLiquido = afterTotals.totalLiquido - afterTarifas;

  const canSave = reason.trim().length >= 3 && !saving;
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const fmtPct = (v) => `${v.toFixed(2)}%`;
  const fmtVar = (before, after) => {
    const diff = after - before;
    if (Math.abs(diff) < 0.01) return { text: '—', color: 'text-muted-foreground' };
    const pct = before > 0 ? (diff / before) * 100 : 0;
    const isUp = diff > 0;
    return {
      text: `${isUp ? '▲' : '▼'} ${formatCurrency(Math.abs(diff))} (${pct.toFixed(1)}%)`,
      color: isUp ? 'text-red-600' : 'text-emerald-600',
    };
  };

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);

    // Update each cheque with recalculated values
    const chequeUpdates = cheques.map((c, i) => {
      const row = calcTituloRow(titulos[i], startDate, newRate, interestType, newFloat, arredondar);
      return {
        id: c.id,
        desagio: row.desagio,
        liquido: row.liquido,
        dias: row.dias,
      };
    });

    if (chequeUpdates.length > 0) {
      await base44.entities.Cheque.bulkUpdate(chequeUpdates);
    }

    // Recalculate operation
    const validTitulos = titulos.filter(t => t.vencimento && parseFloat(t.valor_face) > 0);
    const lastDueDate = validTitulos.map(t => t.vencimento).sort().slice(-1)[0] || operacao.due_date;
    const totalDays = lastDueDate ? daysBetween(startDate, lastDueDate) : 0;

    const installmentSchedule = validTitulos.map((t, i) => {
      const row = calcTituloRow(t, startDate, newRate, interestType, newFloat, arredondar);
      return {
        number: i + 1,
        value: parseFloat(t.valor_face) || 0,
        principal: row.liquido,
        interest: row.desagio,
        days: row.dias,
        due_date: t.vencimento,
        status: 'pendente',
        paid: cheques[i]?.status === 'compensado',
      };
    });

    // Esta tela pode ter sido aberta ANTES de um recebimento, de uma emissão de
    // boleto ou de uma compensação de cheque. Relê o estado e devolve o que é
    // financeiro: o formulário só escreve termos comerciais.
    const atual = await base44.entities.Operation.get(operacao.id);
    const persistido = atual?.installment_schedule || [];

    const conflitos = conflitosFinanceiros(installmentSchedule, persistido);
    if (conflitos.length > 0) {
      setConflito(mensagemConflito(conflitos));
      setSaving(false);
      return;
    }

    const gravado = await salvarCondicionado(base44, operacao.id, atual?.amount_paid, {
      rate: newRate,
      float_dias: newFloat,
      tarifa_operacao: newTarifaOp,
      tarifa_por_titulo: newTarifaTit,
      gross_value: afterLiquido,
      net_value: afterLiquido,
      total_receivable: afterTotals.totalFace,
      balance_due: afterTotals.totalFace - (Number(atual?.amount_paid) || 0),
      days: totalDays,
      projected_profit: afterTotals.totalFace - afterLiquido,
      installment_schedule: mergeFinancialFields(installmentSchedule, persistido),
      installment_value: afterTotals.totalFace / (validTitulos.length || 1),
    });

    if (!gravado) {
      setConflito('A operação recebeu um pagamento enquanto esta tela estava aberta. Recarregue a página e refaça a alteração.');
      setSaving(false);
      return;
    }

    await logAction({
      action: 'edit_conditions',
      entity: 'Operation',
      entityId: operacao.id,
      description: `Condições editadas — Taxa: ${curRate}% → ${newRate}% — Motivo: ${reason.trim()}`,
      before: { rate: curRate, float_dias: curFloat, tarifa_operacao: curTarifaOp, tarifa_por_titulo: curTarifaTit },
      after: { rate: newRate, float_dias: newFloat, tarifa_operacao: newTarifaOp, tarifa_por_titulo: newTarifaTit },
    });

    setSaving(false);
    onSaved();
  };

  const inputCls = 'w-full px-3 py-2 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-colors';
  const curBoxCls = 'bg-gray-50 border border-border rounded-lg p-3';

  const comparisonRows = [
    { label: 'Total Bruto', before: beforeTotals.totalFace, after: afterTotals.totalFace, isCurrency: true },
    { label: '(−) Deságio', before: beforeTotals.totalDesagio, after: afterTotals.totalDesagio, isCurrency: true },
    { label: '(−) Tarifa Operação', before: curTarifaOp, after: newTarifaOp, isCurrency: true },
    { label: '(−) Tarifa por Título', before: curTarifaTit * titulos.length, after: newTarifaTit * titulos.length, isCurrency: true },
    { label: 'Prazo Médio (dias)', before: beforeTotals.prazoMedio, after: afterTotals.prazoMedio, isCurrency: false },
    { label: 'Valor Líquido', before: beforeLiquido, after: afterLiquido, isCurrency: true },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border shrink-0">
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Condições Financeiras</p>
            <h2 className="text-base font-bold mt-0.5">Editar Parâmetros da Operação</h2>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 p-5 space-y-5">
          {/* Current Parameters */}
          <div className="grid grid-cols-4 gap-2">
            <div className={curBoxCls}>
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Taxa Deságio</p>
              <p className="text-sm font-bold mt-0.5">{fmtPct(curRate)} a.m.</p>
            </div>
            <div className={curBoxCls}>
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Tarifa Operação</p>
              <p className="text-sm font-bold mt-0.5">{formatCurrency(curTarifaOp)}</p>
            </div>
            <div className={curBoxCls}>
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Tarifa por Título</p>
              <p className="text-sm font-bold mt-0.5">{formatCurrency(curTarifaTit)}</p>
            </div>
            <div className={curBoxCls}>
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Float Dias</p>
              <p className="text-sm font-bold mt-0.5">{curFloat.toFixed(2)} dias</p>
            </div>
          </div>

          {/* Edit Fields */}
          <div className="grid grid-cols-4 gap-2">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Taxa Deságio a.m. (%)</label>
              <input type="number" step="0.0001" className={inputCls} value={form.rate} onChange={e => set('rate', e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Float Dias</label>
              <input type="number" step="0.01" className={inputCls} value={form.float_dias} onChange={e => set('float_dias', e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Tarifa Operação (R$)</label>
              <input type="number" step="0.01" className={inputCls} value={form.tarifa_operacao} onChange={e => set('tarifa_operacao', e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Tarifa por Título (R$)</label>
              <input type="number" step="0.01" className={inputCls} value={form.tarifa_por_titulo} onChange={e => set('tarifa_por_titulo', e.target.value)} />
            </div>
          </div>

          {/* Comparison Table */}
          <div className="border border-border rounded-lg overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50 border-b border-border">
                  <th className="px-3 py-2 text-left font-semibold text-muted-foreground uppercase tracking-wider"></th>
                  <th className="px-3 py-2 text-right font-semibold text-muted-foreground uppercase tracking-wider">Antes</th>
                  <th className="px-3 py-2 text-right font-semibold text-blue-700 uppercase tracking-wider bg-blue-50">Depois</th>
                  <th className="px-3 py-2 text-right font-semibold text-muted-foreground uppercase tracking-wider">Variação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {comparisonRows.map(row => {
                  const varInfo = row.isCurrency ? fmtVar(row.before, row.after) : { text: '—', color: 'text-muted-foreground' };
                  return (
                    <tr key={row.label}>
                      <td className="px-3 py-2 font-medium">{row.label}</td>
                      <td className="px-3 py-2 text-right text-muted-foreground">{row.isCurrency ? formatCurrency(row.before) : row.before.toFixed(0)}</td>
                      <td className="px-3 py-2 text-right font-semibold bg-blue-50">{row.isCurrency ? formatCurrency(row.after) : row.after.toFixed(0)}</td>
                      <td className={`px-3 py-2 text-right ${varInfo.color}`}>{varInfo.text}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Reason */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">* Motivo da Alteração</label>
            <textarea className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent resize-none min-h-[70px]" value={reason} onChange={e => setReason(e.target.value)} placeholder="Ex: Ajuste solicitado pelo cedente" />
            <p className="text-xs text-muted-foreground mt-1">Mínimo de 3 caracteres</p>
          </div>

          {/* Warning */}
          <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-800">Esta alteração afetará o valor líquido da operação e será registrada no histórico.</p>
          </div>

          {conflito && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200">
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <p className="text-xs text-red-800">{conflito}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 p-5 border-t border-border shrink-0">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium border border-border rounded-lg hover:bg-gray-50 transition-colors">
            Cancelar
          </button>
          <button onClick={handleSave} disabled={!canSave} className="inline-flex items-center gap-2 px-5 py-2 bg-foreground text-primary-foreground text-sm font-semibold rounded-lg hover:bg-foreground/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
            <Check className="w-4 h-4" /> {saving ? 'Salvando...' : 'Salvar Alterações'}
          </button>
        </div>
      </div>
    </div>
  );
}