import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { today, formatCurrency } from '@/lib/finance';
import { recalcBalances } from '@/lib/contaCorrente';
import { X, Loader2 } from 'lucide-react';

export default function NovoLimiteRotativoModal({ client, onClose, onSaved }) {
  const [form, setForm] = useState({
    valor_bruto: '',
    taxa_mensal: client?.default_rate || '',
    data_inicio: today(),
    notas: ''
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (k, v) => setForm(s => ({ ...s, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    const vb = parseFloat(form.valor_bruto);
    const taxa = parseFloat(form.taxa_mensal);
    if (!vb || vb <= 0) return setError('Informe o valor bruto adiantado.');
    if (!taxa || taxa <= 0) return setError('Informe a taxa mensal.');
    if (!form.data_inicio) return setError('Informe a data de início.');
    setSaving(true); setError('');
    try {
      const limite = await base44.entities.LimiteRotativo.create({
        client_id: client.id,
        client_name: client.name,
        valor_bruto: vb,
        taxa_mensal: taxa,
        data_inicio: form.data_inicio,
        status: 'ativo',
        notas: form.notas || ''
      });
      await base44.entities.LancamentoContaCorrente.create({
        client_id: client.id,
        client_name: client.name,
        type: 'limite_rotativo',
        nature: 'debito',
        date: form.data_inicio,
        description: `Limite Rotativo — ${formatCurrency(vb)} @ ${taxa}% a.m.`,
        gross_value: vb,
        rate: taxa,
        interest_type: 'simples',
        debit_amount: vb,
        credit_amount: 0,
        status: 'em_aberto',
        limite_rotativo_id: limite.id,
        notes: form.notas || ''
      });
      await recalcBalances(client.id);
      onSaved();
      onClose();
    } catch (err) {
      setError(err.message || 'Erro ao criar limite rotativo');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h3 className="text-base font-semibold text-foreground">Novo Limite Rotativo</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Valor Bruto Adiantado *</label>
            <input type="number" step="0.01" inputMode="decimal" className="input-field mt-1"
              value={form.valor_bruto} onChange={e => set('valor_bruto', e.target.value)} placeholder="100000.00" autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Taxa Mensal (%) *</label>
              <input type="number" step="0.01" inputMode="decimal" className="input-field mt-1"
                value={form.taxa_mensal} onChange={e => set('taxa_mensal', e.target.value)} placeholder="4.00" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Data de Início *</label>
              <input type="date" className="input-field mt-1"
                value={form.data_inicio} onChange={e => set('data_inicio', e.target.value)} />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Observações</label>
            <textarea rows={2} className="input-field mt-1" value={form.notas}
              onChange={e => set('notas', e.target.value)} placeholder="Notas internas..." />
          </div>
          {error && <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-xs font-semibold border border-border rounded-lg hover:bg-gray-50">Cancelar</button>
            <button type="submit" disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-foreground text-primary-foreground rounded-lg hover:bg-foreground/90 disabled:opacity-50">
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Criar Limite Rotativo
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}