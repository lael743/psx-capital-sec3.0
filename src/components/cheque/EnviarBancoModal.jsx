import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { X, Building2, Send, CheckCircle2 } from 'lucide-react';
import { formatCurrency, formatDate, today } from '@/lib/finance';

/**
 * Modal para enviar lote de cheques ao banco.
 * - Seleciona banco de destino
 * - Muda custody_status para 'financeiro' em todos os cheques selecionados
 * - Cria registro de remessa no CashFlow (saída fictícia para controle)
 * - NÃO baixa saldo do banco ainda (só quando compensar)
 */
export default function EnviarBancoModal({ cheques, onClose, onSaved }) {
  const [bancos, setBancos] = useState([]);
  const [bancoId, setBancoId] = useState('');
  const [dataEnvio, setDataEnvio] = useState(today());
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    base44.entities.Banco.filter({ active: true }, 'name', 100).then(bks => {
      setBancos(bks);
      const def = bks.find(b => b.is_default_lucro) || bks[0];
      if (def) setBancoId(def.id);
    });
  }, []);

  const banco = bancos.find(b => b.id === bancoId);
  const totalValue = cheques.reduce((s, c) => s + (c.value || 0), 0);

  const save = async () => {
    if (!bancoId) return;
    setSaving(true);

    // Atualiza custody_status de todos os cheques para 'financeiro' e salva banco destino
    await Promise.all(cheques.map(c =>
      base44.entities.Cheque.update(c.id, {
        custody_status: 'financeiro',
        deposited_bank_id: bancoId,
        deposited_bank_name: banco?.name || '',
        notes: (c.notes ? c.notes + '\n' : '') +
          `[ENVIADO AO BANCO em ${dataEnvio}] Banco: ${banco?.name || bancoId}${notes ? ` | Obs: ${notes}` : ''}`,
      })
    ));

    // CashFlow de controle — entrada futura esperada (sem afetar saldo ainda)
    await base44.entities.CashFlow.create({
      type: 'entrada',
      category: 'remessa_banco',
      amount: totalValue,
      date: dataEnvio,
      description: `Remessa de ${cheques.length} cheque(s) ao banco ${banco?.name} — aguardando compensação. ${notes}`.trim(),
      method: 'cheque',
    });

    setSaving(false);
    onSaved();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Send className="w-4 h-4 text-blue-600" />
            <div>
              <h3 className="text-sm font-bold">Enviar Cheques ao Banco</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                {cheques.length} cheque{cheques.length !== 1 ? 's' : ''} — {formatCurrency(totalValue)}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-5 space-y-4">
          {/* Lista resumida dos cheques */}
          <div className="bg-gray-50 rounded-xl p-3 max-h-36 overflow-y-auto space-y-1.5">
            {cheques.map(c => (
              <div key={c.id} className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{c.client_name} · {c.bank_name} #{c.check_number}</span>
                <span className="font-semibold font-mono">{formatCurrency(c.value)}</span>
              </div>
            ))}
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Data de Envio</label>
            <input className="input-field" type="date" value={dataEnvio} onChange={e => setDataEnvio(e.target.value)} />
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Banco de Destino *</label>
            <select className="input-field" value={bancoId} onChange={e => setBancoId(e.target.value)}>
              <option value="">Selecionar banco...</option>
              {bancos.map(b => (
                <option key={b.id} value={b.id}>{b.name}{b.account ? ` — cc ${b.account}` : ''}</option>
              ))}
            </select>
            {banco && (
              <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                <Building2 className="w-3.5 h-3.5" />
                <span>Saldo atual: <strong className="text-foreground">{formatCurrency(banco.current_balance || 0)}</strong></span>
                <span className="opacity-40">·</span>
                <span>Saldo após compensação: <strong className="text-emerald-600">{formatCurrency((banco.current_balance || 0) + totalValue)}</strong></span>
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Observações</label>
            <input className="input-field" placeholder="Ex: Lote 01/2025..." value={notes} onChange={e => setNotes(e.target.value)} />
          </div>

          <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-xs text-blue-800">
            Os cheques serão marcados como <strong>no financeiro</strong>. Quando o banco confirmar a compensação, registre individualmente em cada cheque.
          </div>
        </div>

        <div className="flex justify-end gap-2 px-5 pb-5">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-gray-50">Cancelar</button>
          <button onClick={save} disabled={saving || !bancoId || !dataEnvio}
            className="flex items-center gap-2 px-5 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg disabled:opacity-50 hover:bg-blue-700 transition-colors">
            <Send className="w-3.5 h-3.5" />
            {saving ? 'Enviando...' : `Enviar ${cheques.length} cheque${cheques.length !== 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
}