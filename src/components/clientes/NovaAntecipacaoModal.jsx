import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { X, TrendingDown, Loader2 } from 'lucide-react';
import CurrencyInput from '@/components/ui/CurrencyInput';

export default function NovaAntecipacaoModal({ client, onClose, onSaved }) {
  const [form, setForm] = useState({
    client_id: client.id, client_name: client.name,
    type: 'antecipacao', nature: 'debito',
    date: new Date().toISOString().split('T')[0],
    description: '', gross_value: '', rate: client.default_rate || '3',
    interest_type: 'composto', due_date: '', notes: ''
  });
  const [generateInstallments, setGenerateInstallments] = useState(false);
  const [installmentsCount, setInstallmentsCount] = useState(1);
  const [firstDueDate, setFirstDueDate] = useState('');
  const [periodicity, setPeriodicity] = useState('30');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    const gross = parseFloat(form.gross_value) || 0;
    if (!gross) { setError('Informe o valor'); return; }
    setSaving(true);
    setError('');

    const existing = await base44.entities.LancamentoContaCorrente.filter({ client_id: client.id }, '-date', 1);
    const lastBalance = existing.length ? (existing[0].balance_after || 0) : 0;
    const newBalance = lastBalance - gross;

    const lancamento = await base44.entities.LancamentoContaCorrente.create({
      ...form,
      gross_value: gross,
      rate: parseFloat(form.rate) || 0,
      net_value: gross,
      debit_amount: gross,
      credit_amount: 0,
      balance_after: newBalance,
      status: 'em_aberto',
    });

    // Gerar parcelas se solicitado
    if (generateInstallments && installmentsCount > 1) {
      const installmentValue = gross / installmentsCount;
      for (let i = 0; i < installmentsCount; i++) {
        const dueDate = new Date(firstDueDate || form.date);
        dueDate.setDate(dueDate.getDate() + i * parseInt(periodicity || 30));
        await base44.entities.ParcelaCliente.create({
          client_id: client.id, client_name: client.name,
          lancamento_id: lancamento.id,
          number: i + 1,
          original_value: installmentValue,
          corrected_value: installmentValue,
          due_date: dueDate.toISOString().split('T')[0],
          remaining_amount: installmentValue,
          status: 'pendente',
        });
      }
    }

    setSaving(false);
    onSaved();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-border sticky top-0 bg-white">
          <div className="flex items-center gap-2">
            <TrendingDown className="w-5 h-5 text-red-600" />
            <h2 className="text-base font-bold">Nova Antecipação / Empréstimo</h2>
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
              <label className="block text-xs font-semibold text-muted-foreground mb-1">Data da Liberação</label>
              <input type="date" className="input-field" value={form.date} onChange={e => handleChange('date', e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1">Valor Liberado</label>
              <CurrencyInput value={form.gross_value} onChange={v => handleChange('gross_value', v)} placeholder="0,00" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1">Taxa Mensal (%)</label>
              <input type="number" step="0.01" className="input-field" value={form.rate} onChange={e => handleChange('rate', e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1">Tipo de Correção</label>
              <select className="input-field" value={form.interest_type} onChange={e => handleChange('interest_type', e.target.value)}>
                <option value="composto">Composto</option>
                <option value="simples">Simples</option>
                <option value="proporcional_dias">Proporcional por Dias</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1">Descrição</label>
            <input className="input-field" value={form.description} onChange={e => handleChange('description', e.target.value)} placeholder="Ex: Antecipação de contrato" />
          </div>

          {/* Parcelamento */}
          <div className="border border-border rounded-lg p-3 space-y-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={generateInstallments} onChange={e => setGenerateInstallments(e.target.checked)}
                className="w-4 h-4 rounded border-border" />
              <span className="text-xs font-semibold">Gerar parcelas</span>
            </label>
            {generateInstallments && (
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-xs text-muted-foreground">Qtd. Parcelas</label>
                  <input type="number" min="1" className="input-field text-xs" value={installmentsCount} onChange={e => setInstallmentsCount(parseInt(e.target.value) || 1)} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">1º Vencimento</label>
                  <input type="date" className="input-field text-xs" value={firstDueDate} onChange={e => setFirstDueDate(e.target.value)} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Intervalo (dias)</label>
                  <input type="number" className="input-field text-xs" value={periodicity} onChange={e => setPeriodicity(e.target.value)} />
                </div>
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1">Observações</label>
            <textarea className="input-field" rows={2} value={form.notes} onChange={e => handleChange('notes', e.target.value)} />
          </div>
          {error && <p className="text-xs text-red-500">{error}</p>}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 text-sm border border-border rounded-lg hover:bg-gray-50">Cancelar</button>
            <button type="submit" disabled={saving} className="flex-1 px-4 py-2 bg-foreground text-white text-sm font-semibold rounded-lg hover:bg-foreground/90 disabled:opacity-50 flex items-center justify-center gap-2">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <TrendingDown className="w-4 h-4" />}
              {saving ? 'Salvando...' : 'Liberar Valor'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}