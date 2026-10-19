import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { today, formatCurrency } from '@/lib/finance';
import { calcValorLiquidoCheque, diasAteVencimento } from '@/lib/limiteRotativo';
import { recalcBalances } from '@/lib/contaCorrente';
import { X, Loader2 } from 'lucide-react';

export default function RegistrarRepasseModal({ limite, client, onClose, onSaved }) {
  const [form, setForm] = useState({
    valor_bruto: '',
    data_emissao: today(),
    data_vencimento: '',
    notas: ''
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (k, v) => setForm(s => ({ ...s, [k]: v }));

  const vb = parseFloat(form.valor_bruto) || 0;
  const dias = form.data_emissao && form.data_vencimento ? diasAteVencimento(form.data_emissao, form.data_vencimento) : 0;
  const vl = vb > 0 && dias > 0 ? calcValorLiquidoCheque(vb, limite.taxa_mensal, dias) : 0;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!vb || vb <= 0) return setError('Informe o valor bruto do cheque.');
    if (!form.data_vencimento) return setError('Informe a data de vencimento.');
    if (dias <= 0) return setError('O vencimento deve ser posterior à data de emissão.');
    setSaving(true); setError('');
    try {
      const repasse = await base44.entities.RepasseLimiteRotativo.create({
        limite_id: limite.id,
        client_id: client.id,
        client_name: client.name,
        tipo: 'cheque',
        valor_bruto: vb,
        valor_liquido: vl,
        data_emissao: form.data_emissao,
        data_vencimento: form.data_vencimento,
        dias_calculados: dias,
        notas: form.notas || ''
      });
      await base44.entities.LancamentoContaCorrente.create({
        client_id: client.id,
        client_name: client.name,
        type: 'limite_rotativo',
        nature: 'credito',
        date: form.data_emissao,
        description: `Repasse Cheque — ${formatCurrency(vb)} (VL ${formatCurrency(vl)})`,
        gross_value: vb,
        net_value: vl,
        rate: limite.taxa_mensal,
        due_date: form.data_vencimento,
        days_calculated: dias,
        credit_amount: vl,
        debit_amount: 0,
        status: 'compensado',
        limite_rotativo_id: limite.id,
        repasse_id: repasse.id,
        notes: form.notas || ''
      });
      await recalcBalances(client.id);
      onSaved();
      onClose();
    } catch (err) {
      setError(err.message || 'Erro ao registrar repasse');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h3 className="text-base font-semibold text-foreground">Registrar Repasse (Cheque)</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Valor Bruto do Cheque *</label>
            <input type="number" step="0.01" inputMode="decimal" className="input-field mt-1"
              value={form.valor_bruto} onChange={e => set('valor_bruto', e.target.value)} placeholder="0.00" autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Data de Emissão (Hoje) *</label>
              <input type="date" className="input-field mt-1"
                value={form.data_emissao} onChange={e => set('data_emissao', e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Vencimento (Compensação) *</label>
              <input type="date" className="input-field mt-1"
                value={form.data_vencimento} onChange={e => set('data_vencimento', e.target.value)} />
            </div>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-amber-700">Taxa aplicada</span>
              <span className="font-semibold text-amber-800">{limite.taxa_mensal}% a.m.</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-amber-700">Dias até vencimento</span>
              <span className="font-semibold text-amber-800">{dias} dias</span>
            </div>
            <div className="flex justify-between text-sm pt-1 border-t border-amber-200">
              <span className="text-amber-700 font-medium">Valor Líquido (VL)</span>
              <span className="font-bold text-amber-900">{formatCurrency(vl)}</span>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Observações</label>
            <textarea rows={2} className="input-field mt-1" value={form.notas}
              onChange={e => set('notas', e.target.value)} placeholder="Notas..." />
          </div>
          {error && <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-xs font-semibold border border-border rounded-lg hover:bg-gray-50">Cancelar</button>
            <button type="submit" disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-foreground text-primary-foreground rounded-lg hover:bg-foreground/90 disabled:opacity-50">
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Confirmar Repasse
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}