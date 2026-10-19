import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { X, Wallet, Loader2 } from 'lucide-react';
import CurrencyInput from '@/components/ui/CurrencyInput';

const PAYMENT_LABELS = {
  dinheiro: 'Dinheiro', pix: 'Pix', transferencia: 'Transferência',
  cheque: 'Cheque', boleto: 'Boleto', cartao: 'Cartão', outro: 'Outro'
};

export default function NovoCreditoModal({ client, onClose, onSaved }) {
  const [form, setForm] = useState({
    client_id: client.id, client_name: client.name,
    type: 'pagamento_pix', nature: 'credito',
    date: new Date().toISOString().split('T')[0],
    description: '', gross_value: '', rate: '', due_date: '', payment_method: 'pix', notes: ''
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    const gross = parseFloat(form.gross_value) || 0;
    if (!gross) { setError('Informe o valor'); return; }
    setSaving(true);
    setError('');

    const rate = parseFloat(form.rate) || 0;
    const netValue = rate ? gross * (1 - rate / 100) : gross;

    // Buscar último lançamento para calcular saldo
    const existing = await base44.entities.LancamentoContaCorrente.filter({ client_id: client.id }, '-date', 1);
    const lastBalance = existing.length ? (existing[0].balance_after || 0) : 0;
    const newBalance = lastBalance + netValue;

    await base44.entities.LancamentoContaCorrente.create({
      ...form,
      gross_value: gross,
      rate,
      net_value: netValue,
      credit_amount: netValue,
      debit_amount: 0,
      balance_after: newBalance,
      status: 'baixado',
    });

    setSaving(false);
    onSaved();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div className="flex items-center gap-2">
            <Wallet className="w-5 h-5 text-emerald-600" />
            <h2 className="text-base font-bold">Adicionar Crédito</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-3">
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1">Cliente</label>
            <input className="input-field bg-gray-50" value={client.name} disabled />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1">Data</label>
              <input type="date" className="input-field" value={form.date} onChange={e => handleChange('date', e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1">Forma de Pagamento</label>
              <select className="input-field" value={form.payment_method} onChange={e => handleChange('payment_method', e.target.value)}>
                {Object.entries(PAYMENT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1">Valor Bruto</label>
              <CurrencyInput value={form.gross_value} onChange={v => handleChange('gross_value', v)} placeholder="0,00" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1">Taxa (%)</label>
              <input type="number" step="0.01" className="input-field" value={form.rate} onChange={e => handleChange('rate', e.target.value)} placeholder="0" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1">Descrição / Origem</label>
            <input className="input-field" value={form.description} onChange={e => handleChange('description', e.target.value)} placeholder="Ex: Pagamento de parcela 1" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1">Observações</label>
            <textarea className="input-field" rows={2} value={form.notes} onChange={e => handleChange('notes', e.target.value)} />
          </div>
          {error && <p className="text-xs text-red-500">{error}</p>}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 text-sm border border-border rounded-lg hover:bg-gray-50">Cancelar</button>
            <button type="submit" disabled={saving} className="flex-1 px-4 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-700 disabled:opacity-50 flex items-center justify-center gap-2">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wallet className="w-4 h-4" />}
              {saving ? 'Salvando...' : 'Adicionar Crédito'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}