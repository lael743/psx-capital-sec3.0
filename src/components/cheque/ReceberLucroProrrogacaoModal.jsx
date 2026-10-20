import { useState, useEffect } from 'react';
import { X, DollarSign } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { registrarLucroProrrogacao } from '@/lib/eventoBancario';
import { today } from '@/lib/finance';

/**
 * Modal para registrar o recebimento do lucro/juros de uma prorrogação
 * que foi marcada como "a receber" no momento da prorrogação.
 */
export default function ReceberLucroProrrogacaoModal({ cheque, onClose, onSaved }) {
  const [bancos, setBancos] = useState([]);
  const [bancoId, setBancoId] = useState('');
  const [formaPagamento, setFormaPagamento] = useState('pix');
  const [valor, setValor] = useState('');
  const [dataPagamento, setDataPagamento] = useState(today());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    base44.entities.Banco.filter({ active: true }, 'name', 100).then(data => {
      setBancos(data);
      const def = data.find(b => b.is_default_lucro);
      if (def) setBancoId(def.id);
    });
  }, []);

  const canSave = bancoId && valor && parseFloat(valor) > 0;

  const save = async () => {
    setSaving(true);
    const valorNum = parseFloat(valor);
    setError('');

    // O SERVIDOR deriva a chave do evento (cheque + data + valor), aplica o
    // crédito e anota o cheque — só quando o crédito de fato acontece.
    try {
      await registrarLucroProrrogacao({
        chequeId: cheque.id,
        bankId: bancoId,
        valor: valorNum,
        data: dataPagamento,
        forma: formaPagamento,
      });
    } catch (e) {
      setSaving(false);
      setError(e.message || 'Não foi possível registrar o recebimento.');
      return;
    }

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
            <DollarSign className="w-4 h-4 text-emerald-600" />
            <div>
              <h3 className="text-sm font-bold">Receber Lucro da Prorrogação</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Cheque #{cheque?.check_number} — {cheque?.client_name}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3 text-xs text-emerald-800">
            Registre o recebimento dos juros/lucro da prorrogação. O valor será creditado no banco selecionado.
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Valor Recebido (R$) *</label>
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
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Data do Recebimento</label>
              <input
                className="input-field"
                type="date"
                value={dataPagamento}
                onChange={e => setDataPagamento(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-2">Forma de Pagamento</label>
            <div className="flex flex-wrap gap-2">
              {['pix', 'dinheiro', 'transferencia', 'cheque'].map(m => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setFormaPagamento(m)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-full border capitalize transition-colors ${
                    formaPagamento === m
                      ? 'bg-foreground text-primary-foreground border-foreground'
                      : 'border-border hover:bg-gray-50'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Banco de Destino *</label>
            <select className="input-field" value={bancoId} onChange={e => setBancoId(e.target.value)}>
              <option value="">Selecionar banco...</option>
              {bancos.map(b => (
                <option key={b.id} value={b.id}>{b.name}{b.account ? ` — cc ${b.account}` : ''}</option>
              ))}
            </select>
          </div>
        </div>

        {error && <p className="px-5 pb-2 text-xs font-medium text-red-600">{error}</p>}

        <div className="flex justify-end gap-2 px-5 pb-5">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-gray-50">
            Cancelar
          </button>
          <button
            onClick={save}
            disabled={saving || !canSave}
            className="flex items-center gap-2 px-5 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-lg disabled:opacity-50 hover:bg-emerald-700 transition-colors"
          >
            <DollarSign className="w-3.5 h-3.5" />
            {saving ? 'Registrando...' : 'Confirmar Recebimento'}
          </button>
        </div>
      </div>
    </div>
  );
}