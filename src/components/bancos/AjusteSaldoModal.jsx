import { useState } from 'react';
import { X, AlertTriangle, Scale } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { logAction } from '@/lib/audit';
import { novoTransferId } from '@/lib/bankLedger';
import { ajustarSaldoConta } from '@/lib/eventoBancario';
import { formatCurrency } from '@/lib/finance';

/**
 * M6.3 — AJUSTE DE SALDO.
 *
 * O formulário de cadastro não escreve mais `current_balance`. Correção de
 * saldo passou a ser um EVENTO: o servidor autoriza (administrador), valida,
 * aplica o incremento atômico com a chave gravada na mesma escrita e registra
 * o lançamento. Este modal só monta a intenção — não calcula nem grava saldo.
 */
export default function AjusteSaldoModal({ banco, onClose, onSaved }) {
  const [form, setForm] = useState({
    tipo: 'entrada',
    valor: '',
    motivo: '',
    data: new Date().toISOString().split('T')[0],
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  // Id estável do evento: repetir o clique não aplica o ajuste duas vezes.
  const [eventId] = useState(() => `ajuste-${novoTransferId()}`);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = async () => {
    const valor = parseFloat(form.valor);
    if (!Number.isFinite(valor) || valor <= 0) {
      setError('O valor deve ser maior que zero.');
      return;
    }
    if (!form.motivo.trim() || form.motivo.trim().length < 5) {
      setError('A justificativa é obrigatória e deve ter pelo menos 5 caracteres.');
      return;
    }

    setSaving(true);
    setError('');
    const saldoAnterior = banco.current_balance || 0;

    try {
      await ajustarSaldoConta({
        bankId: banco.id,
        tipo: form.tipo,
        valor,
        motivo: form.motivo.trim(),
        data: form.data,
        eventId,
      });
    } catch (e) {
      setSaving(false);
      setError(e.message || 'Não foi possível registrar o ajuste.');
      return;
    }

    const bancoDepois = await base44.entities.Banco.get(banco.id).catch(() => null);

    await logAction({
      action: 'ajuste_saldo',
      entity: 'Banco',
      entityId: banco.id,
      description: `Ajuste de saldo (${form.tipo === 'entrada' ? 'crédito' : 'débito'}) de ${formatCurrency(valor)} na conta ${banco.name}. Justificativa: ${form.motivo.trim()}`,
      before: { current_balance: saldoAnterior },
      after: { current_balance: bancoDepois?.current_balance ?? null },
    });

    setSaving(false);
    onSaved();
    onClose();
  };

  const valor = parseFloat(form.valor) || 0;
  const saldoAnterior = banco.current_balance || 0;
  const saldoResultante = form.tipo === 'entrada' ? saldoAnterior + valor : saldoAnterior - valor;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div className="flex items-center gap-2 min-w-0">
            <Scale className="w-4 h-4 text-muted-foreground shrink-0" />
            <div className="min-w-0">
              <h2 className="text-base font-bold">Ajuste de Saldo</h2>
              <p className="text-xs text-muted-foreground mt-0.5 truncate">{banco.name}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl p-3">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-800">
              Correção administrativa do saldo oficial. Gera um lançamento identificado no extrato e um registro na
              auditoria. Repetir o envio não duplica o ajuste.
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-2">Tipo de Ajuste</label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { key: 'entrada', label: '↑ Creditar', cls: 'border-emerald-300 bg-emerald-50 text-emerald-800', activeCls: 'ring-2 ring-emerald-500' },
                { key: 'saida', label: '↓ Debitar', cls: 'border-red-300 bg-red-50 text-red-800', activeCls: 'ring-2 ring-red-500' },
              ].map(t => (
                <button key={t.key} type="button"
                  onClick={() => set('tipo', t.key)}
                  className={`py-2.5 text-sm font-semibold rounded-lg border transition-all ${t.cls} ${form.tipo === t.key ? t.activeCls : 'opacity-50'}`}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Valor (R$) *</label>
            <input
              type="number" step="0.01" min="0.01"
              className="input-field text-lg font-mono"
              value={form.valor}
              onChange={e => set('valor', e.target.value)}
              placeholder="0,00"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Data</label>
            <input type="date" className="input-field" value={form.data} onChange={e => set('data', e.target.value)} />
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Justificativa *</label>
            <textarea
              className="input-field resize-none"
              rows={3}
              value={form.motivo}
              onChange={e => set('motivo', e.target.value)}
              placeholder="Por que o saldo está sendo corrigido?"
            />
          </div>

          {valor > 0 && (
            <div className="bg-gray-50 border border-border rounded-xl p-3 space-y-1.5 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <span>Saldo atual</span>
                <span className="font-mono">{formatCurrency(saldoAnterior)}</span>
              </div>
              <div className={`flex justify-between font-semibold ${form.tipo === 'entrada' ? 'text-emerald-700' : 'text-red-700'}`}>
                <span>{form.tipo === 'entrada' ? '+ Crédito' : '− Débito'}</span>
                <span className="font-mono">{formatCurrency(valor)}</span>
              </div>
              <div className="border-t border-border pt-1.5 flex justify-between font-bold">
                <span>Saldo resultante</span>
                <span className={`font-mono ${saldoResultante < 0 ? 'text-red-600' : 'text-foreground'}`}>{formatCurrency(saldoResultante)}</span>
              </div>
            </div>
          )}

          {error && <p className="text-xs text-red-600 font-medium">{error}</p>}

          <div className="flex gap-3 justify-end pt-1">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm font-medium border border-border rounded-lg hover:bg-gray-50 transition-colors">
              Cancelar
            </button>
            <button onClick={handleSave} disabled={saving}
              className="px-5 py-2 bg-foreground text-primary-foreground text-sm font-semibold rounded-lg hover:bg-foreground/90 disabled:opacity-50 transition-colors">
              {saving ? 'Salvando...' : 'Confirmar Ajuste'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}