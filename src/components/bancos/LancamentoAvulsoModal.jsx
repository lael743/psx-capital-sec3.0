import { useState } from 'react';
import { X, AlertTriangle } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { logAction } from '@/lib/audit';
import { novoTransferId } from '@/lib/bankLedger';
import { registrarLancamentoAvulso } from '@/lib/eventoBancario';
import { formatCurrency } from '@/lib/finance';

export default function LancamentoAvulsoModal({ banco, onClose, onSaved }) {
  const [form, setForm] = useState({
    type: 'entrada',
    amount: '',
    motivo: '',
    date: new Date().toISOString().split('T')[0],
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  // Id estável do evento: repetir o clique não aplica o saldo duas vezes.
  const [eventId] = useState(() => `avulso-${novoTransferId()}`);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!form.amount || parseFloat(form.amount) <= 0) {
      setError('Informe um valor válido.');
      return;
    }
    if (!form.motivo.trim() || form.motivo.trim().length < 5) {
      setError('O motivo é obrigatório e deve ter pelo menos 5 caracteres.');
      return;
    }

    setSaving(true);
    setError('');

    const amount = parseFloat(form.amount);
    const saldoAnterior = banco.current_balance || 0;

    // O SERVIDOR valida, autoriza e aplica saldo + lançamento (1:1 por evento).
    try {
      await registrarLancamentoAvulso({
        bankId: banco.id,
        tipo: form.type,
        valor: amount,
        motivo: form.motivo.trim(),
        data: form.date,
        eventId,
      });
    } catch (e) {
      setSaving(false);
      setError(e.message || 'Não foi possível registrar o lançamento.');
      return;
    }

    const bancoDepois = await base44.entities.Banco.get(banco.id).catch(() => null);

    // Audit log
    await logAction({
      action: 'lancamento_avulso',
      entity: 'Banco',
      entityId: banco.id,
      description: `Lançamento avulso (${form.type === 'entrada' ? 'entrada' : 'saída'}) de ${formatCurrency(amount)} no banco ${banco.name}. Motivo: ${form.motivo}`,
      before: { current_balance: saldoAnterior },
      after: { current_balance: bancoDepois?.current_balance ?? null },
    });

    setSaving(false);
    onSaved();
    onClose();
  };

  const amount = parseFloat(form.amount) || 0;
  const saldoAnterior = banco.current_balance || 0;
  const saldoResultante = form.type === 'entrada' ? saldoAnterior + amount : saldoAnterior - amount;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div>
            <h2 className="text-base font-bold">Lançamento Avulso</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{banco.name}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Aviso */}
          <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl p-3">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-800">Este lançamento será registrado nos logs de auditoria. O motivo é obrigatório.</p>
          </div>

          {/* Tipo */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-2">Tipo de Lançamento</label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { key: 'entrada', label: '↑ Entrada', cls: 'border-emerald-300 bg-emerald-50 text-emerald-800', activeCls: 'ring-2 ring-emerald-500' },
                { key: 'saida', label: '↓ Saída', cls: 'border-red-300 bg-red-50 text-red-800', activeCls: 'ring-2 ring-red-500' },
              ].map(t => (
                <button key={t.key} type="button"
                  onClick={() => set('type', t.key)}
                  className={`py-2.5 text-sm font-semibold rounded-lg border transition-all ${t.cls} ${form.type === t.key ? t.activeCls : 'opacity-50'}`}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Valor */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Valor (R$) *</label>
            <input
              type="number" step="0.01" min="0.01"
              className="input-field text-lg font-mono"
              value={form.amount}
              onChange={e => set('amount', e.target.value)}
              placeholder="0,00"
            />
          </div>

          {/* Data */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Data</label>
            <input type="date" className="input-field" value={form.date} onChange={e => set('date', e.target.value)} />
          </div>

          {/* Motivo */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Motivo / Descrição *</label>
            <textarea
              className="input-field resize-none"
              rows={3}
              value={form.motivo}
              onChange={e => set('motivo', e.target.value)}
              placeholder="Descreva o motivo do lançamento avulso..."
            />
          </div>

          {/* Preview saldo */}
          {amount > 0 && (
            <div className="bg-gray-50 border border-border rounded-xl p-3 space-y-1.5 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <span>Saldo atual</span>
                <span className="font-mono">{formatCurrency(saldoAnterior)}</span>
              </div>
              <div className={`flex justify-between font-semibold ${form.type === 'entrada' ? 'text-emerald-700' : 'text-red-700'}`}>
                <span>{form.type === 'entrada' ? '+ Entrada' : '− Saída'}</span>
                <span className="font-mono">{formatCurrency(amount)}</span>
              </div>
              <div className="border-t border-border pt-1.5 flex justify-between font-bold">
                <span>Saldo resultante</span>
                <span className={`font-mono ${saldoResultante < 0 ? 'text-red-600' : 'text-foreground'}`}>{formatCurrency(saldoResultante)}</span>
              </div>
            </div>
          )}

          {error && <p className="text-xs text-red-600 font-medium">{error}</p>}

          {/* Ações */}
          <div className="flex gap-3 justify-end pt-1">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm font-medium border border-border rounded-lg hover:bg-gray-50 transition-colors">
              Cancelar
            </button>
            <button onClick={handleSave} disabled={saving}
              className="px-5 py-2 bg-foreground text-primary-foreground text-sm font-semibold rounded-lg hover:bg-foreground/90 disabled:opacity-50 transition-colors">
              {saving ? 'Salvando...' : 'Confirmar Lançamento'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}