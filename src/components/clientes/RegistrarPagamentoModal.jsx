import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { today, formatCurrency } from '@/lib/finance';
import { recalcBalances } from '@/lib/contaCorrente';
import { X, Loader2 } from 'lucide-react';

const TIPOS = [
  { value: 'pix', label: 'PIX' },
  { value: 'dinheiro', label: 'Dinheiro' },
  { value: 'transferencia', label: 'Transferência' }
];

export default function RegistrarPagamentoModal({ limite, client, onClose, onSaved }) {
  const [form, setForm] = useState({ valor: '', tipo: 'pix', notas: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (k, v) => setForm(s => ({ ...s, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    const val = parseFloat(form.valor);
    if (!val || val <= 0) return setError('Informe o valor do pagamento.');
    setSaving(true); setError('');
    try {
      const repasse = await base44.entities.RepasseLimiteRotativo.create({
        limite_id: limite.id,
        client_id: client.id,
        client_name: client.name,
        tipo: form.tipo,
        valor_bruto: val,
        valor_liquido: val,
        data_emissao: today(),
        notas: form.notas || ''
      });
      await base44.entities.LancamentoContaCorrente.create({
        client_id: client.id,
        client_name: client.name,
        type: 'limite_rotativo',
        nature: 'credito',
        date: today(),
        description: `Pagamento ${TIPOS.find(t => t.value === form.tipo)?.label} — ${formatCurrency(val)}`,
        gross_value: val,
        net_value: val,
        credit_amount: val,
        debit_amount: 0,
        payment_method: form.tipo,
        status: 'compensado',
        limite_rotativo_id: limite.id,
        repasse_id: repasse.id,
        notes: form.notas || ''
      });
      await recalcBalances(client.id);
      onSaved();
      onClose();
    } catch (err) {
      setError(err.message || 'Erro ao registrar pagamento');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h3 className="text-base font-semibold text-foreground">Registrar Pagamento (PIX/Dinheiro)</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Valor *</label>
            <input type="number" step="0.01" inputMode="decimal" className="input-field mt-1"
              value={form.valor} onChange={e => set('valor', e.target.value)} placeholder="0.00" autoFocus />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Meio de Pagamento *</label>
            <div className="grid grid-cols-3 gap-2 mt-1">
              {TIPOS.map(t => (
                <button key={t.value} type="button" onClick={() => set('tipo', t.value)}
                  className={`px-3 py-2 text-xs font-semibold rounded-lg border transition-colors ${
                    form.tipo === t.value
                      ? 'bg-foreground text-primary-foreground border-foreground'
                      : 'border-border text-muted-foreground hover:bg-gray-50'
                  }`}>{t.label}</button>
              ))}
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
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50">
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Confirmar Pagamento
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}