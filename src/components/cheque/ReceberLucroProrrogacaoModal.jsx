import { useState, useEffect } from 'react';
import { X, DollarSign } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { chaveEvento } from '@/lib/bankLedger';
import { aplicarEventoBancario } from '@/lib/financeEvents';
import { formatCurrency, formatDate, today } from '@/lib/finance';

const bancoStore = { updateWhere: (q, u) => base44.entities.Banco.updateMany(q, u) };

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
    const banco = bancos.find(b => b.id === bancoId);

    // D3.1 — crédito atômico com chave determinística: repetir o clique não
    // credita duas vezes e não gera segundo lançamento. A identidade do evento
    // é (cheque + data + valor), porque uma mesma prorrogação pode gerar lucros
    // distintos em momentos distintos.
    const chave = chaveEvento('lucro_prorrogacao', `${cheque.id}:${dataPagamento}:${valorNum}`);

    const efeito = await aplicarEventoBancario({
      store: bancoStore,
      bankId: bancoId,
      delta: valorNum,
      eventKey: chave,
      aoAplicar: () => base44.entities.CashFlow.create({
        type: 'entrada',
        category: 'lucro_prorrogacao_cheque',
        amount: valorNum,
        date: dataPagamento,
        description: `Lucro prorrogação cheque #${cheque.check_number} — ${cheque.client_name} (Banco: ${banco?.name})`,
        method: formaPagamento,
        bank_id: bancoId,
        source_type: 'lucro_prorrogacao',
        source_id: chave,
      }),
    });

    // Anota no cheque apenas quando o recebimento foi de fato registrado.
    if (efeito.status === 'aplicado') {
      const nota = `[LUCRO PRORROGAÇÃO RECEBIDO em ${dataPagamento}] ${formatCurrency(valorNum)} via ${formaPagamento.toUpperCase()} — ${banco?.name}`;
      await base44.entities.Cheque.update(cheque.id, {
        notes: cheque.notes ? `${cheque.notes}\n${nota}` : nota,
      });
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