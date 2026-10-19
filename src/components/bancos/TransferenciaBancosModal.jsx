import { useState } from 'react';
import { X, ArrowRight, ArrowLeftRight } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { formatCurrency, today } from '@/lib/finance';

export default function TransferenciaBancosModal({ bancos, onClose, onSaved }) {
  const [origemId, setOrigemId] = useState('');
  const [destinoId, setDestinoId] = useState('');
  const [valor, setValor] = useState('');
  const [data, setData] = useState(today());
  const [descricao, setDescricao] = useState('');
  const [saving, setSaving] = useState(false);

  const origem = bancos.find(b => b.id === origemId);
  const destino = bancos.find(b => b.id === destinoId);
  const valorNum = parseFloat(valor) || 0;

  const canSave = origemId && destinoId && origemId !== destinoId && valorNum > 0;

  const save = async () => {
    setSaving(true);
    const desc = descricao.trim() || `Transferência de ${origem?.name} para ${destino?.name}`;

    // Débito na origem
    await base44.entities.Banco.update(origemId, {
      current_balance: (origem.current_balance || 0) - valorNum,
    });

    // Crédito no destino
    await base44.entities.Banco.update(destinoId, {
      current_balance: (destino.current_balance || 0) + valorNum,
    });

    // Registra saída no fluxo de caixa
    await base44.entities.CashFlow.create({
      type: 'saida',
      category: 'transferencia_interna',
      amount: valorNum,
      date: data,
      description: `[SAÍDA] ${desc}`,
      method: 'transferencia',
    });

    // Registra entrada no fluxo de caixa
    await base44.entities.CashFlow.create({
      type: 'entrada',
      category: 'transferencia_interna',
      amount: valorNum,
      date: data,
      description: `[ENTRADA] ${desc}`,
      method: 'transferencia',
    });

    setSaving(false);
    onSaved();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <ArrowLeftRight className="w-4 h-4 text-blue-600" />
            <div>
              <h3 className="text-sm font-bold">Transferência entre Bancos</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Movimentação interna de saldo</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Origem → Destino visual */}
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Banco de Origem *</label>
              <select className="input-field" value={origemId} onChange={e => setOrigemId(e.target.value)}>
                <option value="">Selecionar...</option>
                {bancos.map(b => (
                  <option key={b.id} value={b.id} disabled={b.id === destinoId}>
                    {b.name}
                  </option>
                ))}
              </select>
              {origem && (
                <div className="text-xs text-muted-foreground mt-1">
                  Saldo: <span className={`font-semibold ${(origem.current_balance || 0) >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                    {formatCurrency(origem.current_balance || 0)}
                  </span>
                </div>
              )}
            </div>
            <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0 mt-5" />
            <div className="flex-1">
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Banco de Destino *</label>
              <select className="input-field" value={destinoId} onChange={e => setDestinoId(e.target.value)}>
                <option value="">Selecionar...</option>
                {bancos.map(b => (
                  <option key={b.id} value={b.id} disabled={b.id === origemId}>
                    {b.name}
                  </option>
                ))}
              </select>
              {destino && (
                <div className="text-xs text-muted-foreground mt-1">
                  Saldo: <span className={`font-semibold ${(destino.current_balance || 0) >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                    {formatCurrency(destino.current_balance || 0)}
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Valor (R$) *</label>
              <input
                className="input-field"
                type="number"
                step="0.01"
                placeholder="0,00"
                value={valor}
                onChange={e => setValor(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Data</label>
              <input
                className="input-field"
                type="date"
                value={data}
                onChange={e => setData(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Descrição (opcional)</label>
            <input
              className="input-field"
              placeholder="Motivo da transferência..."
              value={descricao}
              onChange={e => setDescricao(e.target.value)}
            />
          </div>

          {/* Preview */}
          {canSave && (
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-xs text-blue-800 space-y-1">
              <div className="font-semibold mb-1">Resumo da Transferência</div>
              <div className="flex justify-between">
                <span>{origem?.name} (após)</span>
                <span className="font-semibold">{formatCurrency((origem?.current_balance || 0) - valorNum)}</span>
              </div>
              <div className="flex justify-between">
                <span>{destino?.name} (após)</span>
                <span className="font-semibold">{formatCurrency((destino?.current_balance || 0) + valorNum)}</span>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 px-5 pb-5">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-gray-50">
            Cancelar
          </button>
          <button
            onClick={save}
            disabled={saving || !canSave}
            className="flex items-center gap-2 px-5 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg disabled:opacity-50 hover:bg-blue-700 transition-colors"
          >
            <ArrowLeftRight className="w-3.5 h-3.5" />
            {saving ? 'Transferindo...' : 'Confirmar Transferência'}
          </button>
        </div>
      </div>
    </div>
  );
}