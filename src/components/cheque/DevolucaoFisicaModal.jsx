import { useState } from 'react';
import { X, Package, AlertTriangle } from 'lucide-react';
import { devolverChequeFisicamente } from '@/lib/chequeOps';
import { formatCurrency, formatDate, today } from '@/lib/finance';

/**
 * Registro da DEVOLUÇÃO FÍSICA do cheque ao cliente.
 *
 * Devolver o papel não é quitar a dívida: este modal não altera saldo, caixa
 * nem valor da operação. O caminho padrão exige que nada reste exigível; a
 * exceção é administrativa e precisa de justificativa — a autorização é
 * conferida no servidor, não aqui.
 */
export default function DevolucaoFisicaModal({ cheque, onClose, onSaved }) {
  const [data, setData] = useState(today());
  const [justificativa, setJustificativa] = useState('');
  const [excecao, setExcecao] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      await devolverChequeFisicamente({ cheque, data, justificativa, excecao });
      onSaved();
      onClose();
    } catch (e) {
      setError(e.message || 'Não foi possível registrar a devolução física.');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <Package className="w-4 h-4 text-slate-600" />
            <div>
              <h3 className="text-sm font-bold">Devolução Física do Cheque</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                #{cheque?.check_number} — {formatCurrency(cheque?.value)} — venc. {formatDate(cheque?.compensation_date)}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-700">
            A entrega do cheque ao cliente <strong>não quita a dívida</strong>. Nenhum saldo, lançamento
            ou valor da operação é alterado por este registro.
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Data da entrega *</label>
            <input className="input-field" type="date" value={data} onChange={e => setData(e.target.value)} />
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">
              Justificativa {excecao ? '*' : '(opcional)'}
            </label>
            <input
              className="input-field"
              placeholder={excecao ? 'Motivo da exceção autorizada' : 'Anotação sobre a entrega'}
              value={justificativa}
              onChange={e => setJustificativa(e.target.value)}
            />
          </div>

          <label className="flex items-start gap-2 p-3 rounded-xl border border-amber-200 bg-amber-50 cursor-pointer">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={excecao}
              onChange={e => setExcecao(e.target.checked)}
            />
            <span className="text-xs text-amber-800">
              <span className="font-semibold flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> Exceção administrativa</span>
              Permitir a entrega sem quitação integral. Exige administrador e justificativa, fica registrada em auditoria e
              não baixa a dívida.
            </span>
          </label>

          {error && <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>}
        </div>

        <div className="flex justify-end gap-2 px-5 pb-5">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-gray-50">Cancelar</button>
          <button
            onClick={save}
            disabled={saving || !data || (excecao && !justificativa.trim())}
            className="flex items-center gap-2 px-5 py-2 bg-slate-700 text-white text-sm font-semibold rounded-lg disabled:opacity-50 hover:bg-slate-800">
            <Package className="w-3.5 h-3.5" /> {saving ? 'Registrando...' : 'Registrar Devolução'}
          </button>
        </div>
      </div>
    </div>
  );
}