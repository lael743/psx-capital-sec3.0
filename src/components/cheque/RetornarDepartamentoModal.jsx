import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { X, CornerUpLeft, Building2, Landmark } from 'lucide-react';
import { formatCurrency, today } from '@/lib/finance';
import { novoTransferId } from '@/lib/bankLedger';
import { registrarRetorno } from '@/lib/eventoBancario';

const OPCOES = [
  { value: 'tesouraria', label: 'Tesouraria', desc: 'Retorna para controle interno', icon: '🏛️' },
  { value: 'financeiro', label: 'Financeiro', desc: 'Mantém no financeiro', icon: '📊' },
  { value: 'em_maos', label: 'Em mãos', desc: 'Cheque devolvido fisicamente', icon: '🤝' },
];

/**
 * Modal para retornar cheque(s) devolvido(s) pelo banco de volta a um departamento.
 * - Atualiza custody_status
 * - Registra CashFlow de controle (NÃO afeta saldo — o saldo só é creditado na compensação)
 */
export default function RetornarDepartamentoModal({ cheques, banco, onClose, onSaved }) {
  const [destino, setDestino] = useState('tesouraria');
  const [data, setData] = useState(today());
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  // Estável por lote: repetir o clique não cria dois lançamentos de retorno.
  const [eventId] = useState(() => `retorno-${novoTransferId()}`);

  const isBulk = Array.isArray(cheques);
  const list = isBulk ? cheques : [cheques];
  const totalValue = list.reduce((s, c) => s + (c.value || 0), 0);

  const save = async () => {
    setSaving(true);
    setError('');

    if (!banco) {
      setSaving(false);
      setError('Banco de origem não identificado.');
      return;
    }

    // O SERVIDOR grava a custódia e o lançamento de controle (sem efeito de
    // saldo), uma vez por evento.
    try {
      await registrarRetorno({
        bankId: banco.id,
        chequeIds: list.map(c => c.id),
        data,
        destino,
        observacoes: notes,
        eventId,
      });
    } catch (e) {
      setSaving(false);
      setError(e.message || 'Não foi possível processar o retorno.');
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
            <CornerUpLeft className="w-4 h-4 text-amber-600" />
            <div>
              <h3 className="text-sm font-bold">Retornar do Banco</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                {list.length} cheque{list.length !== 1 ? 's' : ''} devolvido{list.length !== 1 ? 's' : ''} — {formatCurrency(totalValue)}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-5 space-y-4">
          {/* Resumo cheques */}
          <div className="bg-red-50 rounded-xl p-3 max-h-32 overflow-y-auto space-y-1.5">
            {list.map(c => (
              <div key={c.id} className="flex items-center justify-between text-xs">
                <span className="text-red-700">{c.client_name} · #{c.check_number}</span>
                <span className="font-semibold font-mono text-red-700">{formatCurrency(c.value)}</span>
              </div>
            ))}
          </div>

          {banco && (
            <div className="flex items-center gap-2 text-xs bg-gray-50 rounded-lg px-3 py-2">
              <Building2 className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-muted-foreground">Banco: <strong className="text-foreground">{banco.name}</strong></span>
              <span className="opacity-40 mx-1">·</span>
              <span className="text-muted-foreground">Saldo <strong className="text-foreground">não é afetado</strong> (só muda na compensação)</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-2">Destino dos Cheques *</label>
            <div className="grid grid-cols-3 gap-2">
              {OPCOES.map(opt => (
                <button key={opt.value} type="button" onClick={() => setDestino(opt.value)}
                  className={`p-3 rounded-xl border-2 text-left transition-colors ${destino === opt.value ? 'border-foreground bg-gray-50' : 'border-border hover:bg-gray-50'}`}>
                  <div className="text-base mb-1">{opt.icon}</div>
                  <div className="text-xs font-bold">{opt.label}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{opt.desc}</div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Data da Devolução</label>
            <input className="input-field" type="date" value={data} onChange={e => setData(e.target.value)} />
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Motivo / Observações</label>
            <input className="input-field" placeholder="Ex: cheque sem fundos, assinatura incorreta..." value={notes} onChange={e => setNotes(e.target.value)} />
          </div>
        </div>

        {error && <p className="mx-5 mb-2 text-xs font-medium text-red-600">{error}</p>}

        <div className="flex justify-end gap-2 px-5 pb-5">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-gray-50">Cancelar</button>
          <button onClick={save} disabled={saving}
            className="flex items-center gap-2 px-5 py-2 bg-amber-600 text-white text-sm font-semibold rounded-lg disabled:opacity-50 hover:bg-amber-700 transition-colors">
            <CornerUpLeft className="w-3.5 h-3.5" />
            {saving ? 'Processando...' : 'Confirmar Retorno'}
          </button>
        </div>
      </div>
    </div>
  );
}