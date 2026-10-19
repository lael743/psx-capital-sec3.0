import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { X, Building2, CreditCard, CheckCircle2 } from 'lucide-react';
import { formatCurrency } from '@/lib/finance';

export default function ConfirmReceiptModal({ operacao, onClose, onSuccess }) {
  const [bancos, setBancos] = useState([]);
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    receipt_bank_id: operacao?.lucro_bank_id || '',
    receipt_method: operacao?.disbursement_method || 'transferencia',
  });

  useEffect(() => {
    Promise.all([
      base44.entities.Banco.filter({ active: true }, 'name', 100),
      base44.entities.PaymentMethod.list('name', 100),
    ]).then(([banks, methods]) => {
      setBancos(banks);
      setPaymentMethods(methods.map(m => m.name));
      if (!form.receipt_bank_id) {
        const def = banks.find(b => b.is_default_lucro);
        if (def) setForm(f => ({ ...f, receipt_bank_id: def.id }));
      }
    });
  }, []);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleConfirm = async () => {
    if (!form.receipt_bank_id) {
      alert('Selecione um banco para receber o pagamento');
      return;
    }

    setLoading(true);
    try {
      const bank = bancos.find(b => b.id === form.receipt_bank_id);
      const res = await base44.functions.invoke('confirmOperationReceiptAndBank', {
        operation_id: operacao.id,
        receipt_bank_id: form.receipt_bank_id,
        receipt_bank_name: bank?.name || '',
        receipt_method: form.receipt_method,
      });

      if (res.data.success) {
        alert('Recebimento confirmado com sucesso!');
        onSuccess?.();
        onClose();
      } else {
        alert('Erro ao confirmar recebimento: ' + (res.data.error || 'Tente novamente'));
      }
    } catch (err) {
      alert('Erro: ' + (err?.message || 'Tente novamente'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              <h2 className="text-lg font-bold">Confirmar Recebimento</h2>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">Registre a compensação do cheque/empréstimo</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Resumo */}
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
            <div className="text-xs font-semibold text-emerald-900 mb-2">Total a receber</div>
            <div className="text-2xl font-bold text-emerald-700">
              {formatCurrency(operacao?.total_receivable || 0)}
            </div>
            <div className="text-xs text-emerald-600 mt-2">
              Principal: {formatCurrency(operacao?.net_value || 0)}
            </div>
            <div className="text-xs text-emerald-600">
              Juros: {formatCurrency((operacao?.total_receivable || 0) - (operacao?.net_value || 0))}
            </div>
          </div>

          {/* Banco de recebimento */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-2">
              <Building2 className="w-4 h-4" />
              Banco para receber pagamento *
            </label>
            <select
              className="input-field"
              value={form.receipt_bank_id}
              onChange={e => set('receipt_bank_id', e.target.value)}
            >
              <option value="">Selecionar banco...</option>
              {bancos.map(b => (
                <option key={b.id} value={b.id}>
                  {b.name}{b.account ? ` — cc ${b.account}` : ''}
                </option>
              ))}
            </select>
            {bancos.find(b => b.id === form.receipt_bank_id) && (
              <div className="mt-1 text-xs text-muted-foreground">
                Saldo atual: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
                  (bancos.find(b => b.id === form.receipt_bank_id)?.current_balance || 0) + (operacao?.total_receivable || 0)
                )}
              </div>
            )}
          </div>

          {/* Forma de recebimento */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-2">
              <CreditCard className="w-4 h-4" />
              Forma de recebimento
            </label>
            <select
              className="input-field"
              value={form.receipt_method}
              onChange={e => set('receipt_method', e.target.value)}
            >
              <option value="pix">PIX</option>
              <option value="transferencia">Transferência</option>
              <option value="cheque">Cheque</option>
              <option value="dinheiro">Dinheiro</option>
              <option value="boleto">Boleto</option>
            </select>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 p-5 border-t border-border">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium border border-border rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading || !form.receipt_bank_id}
            className="inline-flex items-center gap-2 px-5 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors"
          >
            {loading ? 'Confirmando...' : 'Confirmar Recebimento'}
          </button>
        </div>
      </div>
    </div>
  );
}