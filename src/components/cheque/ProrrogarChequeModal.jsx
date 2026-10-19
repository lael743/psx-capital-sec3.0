import { useState, useMemo, useEffect } from 'react';
import { X, CalendarClock, TrendingUp, CheckCircle2, Clock } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { formatCurrency, formatDate, daysBetween, today } from '@/lib/finance';

/**
 * Modal de prorrogação de cheque pendente.
 *
 * Nova lógica:
 *   - O valor do cheque NÃO se altera.
 *   - O que muda é somente a nova data de compensação.
 *   - Os juros/lucro da prorrogação são calculados sobre o valor do cheque.
 *   - O usuário pode informar se o lucro JÁ foi pago ou ainda será pago,
 *     indicando forma de pagamento e banco.
 */
export default function ProrrogarChequeModal({ cheque, onClose, onSaved }) {
  const [novaData, setNovaData] = useState('');
  const [taxaMensal, setTaxaMensal] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  // Lucro pago
  const [lucroJaPago, setLucroJaPago] = useState(null); // null = não escolhido, true = já pago, false = será pago depois
  const [formaPagamento, setFormaPagamento] = useState('pix');
  const [bancoId, setBancoId] = useState('');
  const [bancos, setBancos] = useState([]);

  const todayStr = today();

  useEffect(() => {
    base44.entities.Banco.filter({ active: true }, 'name', 100).then(setBancos);
  }, []);

  const dias = useMemo(() => {
    if (!novaData || novaData <= todayStr) return 0;
    return daysBetween(todayStr, novaData);
  }, [novaData, todayStr]);

  const taxa = parseFloat(taxaMensal) || 0;

  const jurosProrrogacao = useMemo(() => {
    if (!dias || !taxa || !cheque?.value) return 0;
    const dailyRatePct = Math.ceil((taxa / 30) * 100) / 100;
    const dailyR = dailyRatePct / 100;
    return Math.round(cheque.value * dailyR * dias * 100) / 100;
  }, [dias, taxa, cheque?.value]);

  const canSave = novaData && novaData > todayStr && taxa > 0 && lucroJaPago !== null;

  const save = async () => {
    setSaving(true);

    const bancoDest = bancos.find(b => b.id === bancoId);
    const statusLucro = lucroJaPago
      ? `PAGO — ${formaPagamento?.toUpperCase()}${bancoDest ? ` via ${bancoDest.name}` : ''}`
      : `A RECEBER — ${formaPagamento?.toUpperCase()}${bancoDest ? ` via ${bancoDest.name}` : ''}`;

    const historico = `[PRORROGADO em ${todayStr}] Nova data: ${novaData} | Dias: ${dias} | Taxa: ${taxa}%/m | Juros: ${formatCurrency(jurosProrrogacao)} | Lucro: ${statusLucro}${notes ? ` | Obs: ${notes}` : ''}`;

    await base44.entities.Cheque.update(cheque.id, {
      compensation_date: novaData,
      notes: cheque.notes ? `${cheque.notes}\n${historico}` : historico,
    });

    setSaving(false);
    onSaved();
    onClose();
  };

  const METODOS = ['pix', 'dinheiro', 'transferencia', 'cheque'];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <CalendarClock className="w-4 h-4 text-blue-600" />
            <div>
              <h3 className="text-sm font-bold">Prorrogar Cheque</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                #{cheque?.check_number} — {formatCurrency(cheque?.value)} — vence {formatDate(cheque?.compensation_date)}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-4">
          {/* Info */}
          <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-xs text-blue-800">
            O <strong>valor do cheque não se altera</strong>. A prorrogação apenas estende a data de compensação.
            Os juros gerados devem ser cobrados separadamente.
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Nova Data de Compensação *</label>
              <input
                className="input-field"
                type="date"
                min={todayStr}
                value={novaData}
                onChange={e => setNovaData(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Taxa Mensal (%) *</label>
              <input
                className="input-field"
                type="number"
                step="0.01"
                placeholder="Ex: 4,00"
                value={taxaMensal}
                onChange={e => setTaxaMensal(e.target.value)}
              />
            </div>
          </div>

          {/* Preview do cálculo */}
          {dias > 0 && taxa > 0 && (
            <div className="bg-gray-50 border border-border rounded-xl p-4 space-y-2 text-sm">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp className="w-4 h-4 text-[hsl(43,65%,47%)]" />
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Juros da Prorrogação</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Dias prorrogados (a partir de hoje)</span>
                <span className="font-semibold">{dias} dias</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Taxa diária (arredondada)</span>
                <span className="font-semibold">{(Math.ceil((taxa / 30) * 100) / 100).toFixed(2)}% ao dia</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Valor do cheque (inalterado)</span>
                <span className="font-semibold">{formatCurrency(cheque?.value)}</span>
              </div>
              <div className="flex justify-between text-sm border-t border-border pt-2">
                <span className="font-semibold text-[hsl(43,65%,47%)]">Juros / Lucro a cobrar</span>
                <span className="font-bold text-[hsl(43,65%,47%)]">{formatCurrency(jurosProrrogacao)}</span>
              </div>
            </div>
          )}

          {/* Status do lucro */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-2">Status do Lucro *</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setLucroJaPago(true)}
                className={`flex items-center gap-2 p-3 rounded-xl border text-left transition-colors ${
                  lucroJaPago === true
                    ? 'bg-emerald-50 border-emerald-400 text-emerald-800'
                    : 'border-border hover:bg-gray-50'
                }`}
              >
                <CheckCircle2 className={`w-4 h-4 shrink-0 ${lucroJaPago === true ? 'text-emerald-600' : 'text-muted-foreground'}`} />
                <div>
                  <div className="text-xs font-bold">Já pago</div>
                  <div className="text-xs text-muted-foreground">Lucro recebido agora</div>
                </div>
              </button>
              <button
                type="button"
                onClick={() => setLucroJaPago(false)}
                className={`flex items-center gap-2 p-3 rounded-xl border text-left transition-colors ${
                  lucroJaPago === false
                    ? 'bg-amber-50 border-amber-400 text-amber-800'
                    : 'border-border hover:bg-gray-50'
                }`}
              >
                <Clock className={`w-4 h-4 shrink-0 ${lucroJaPago === false ? 'text-amber-600' : 'text-muted-foreground'}`} />
                <div>
                  <div className="text-xs font-bold">A receber</div>
                  <div className="text-xs text-muted-foreground">Será cobrado depois</div>
                </div>
              </button>
            </div>
          </div>

          {/* Forma de pagamento e banco — aparece após escolher status */}
          {lucroJaPago !== null && (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-2">Forma de Pagamento</label>
                <div className="flex flex-wrap gap-2">
                  {METODOS.map(m => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setFormaPagamento(m)}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-full border transition-colors capitalize ${
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

              {bancos.length > 0 && (
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">Banco</label>
                  <select className="input-field" value={bancoId} onChange={e => setBancoId(e.target.value)}>
                    <option value="">Selecionar banco (opcional)...</option>
                    {bancos.map(b => (
                      <option key={b.id} value={b.id}>{b.name}{b.account ? ` — cc ${b.account}` : ''}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Observações</label>
            <input
              className="input-field"
              placeholder="Motivo da prorrogação..."
              value={notes}
              onChange={e => setNotes(e.target.value)}
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 px-5 pb-5 pt-3 border-t border-border shrink-0">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-gray-50">
            Cancelar
          </button>
          <button
            onClick={save}
            disabled={saving || !canSave}
            className="flex items-center gap-2 px-5 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg disabled:opacity-50 hover:bg-blue-700 transition-colors"
          >
            <CalendarClock className="w-3.5 h-3.5" />
            {saving ? 'Salvando...' : 'Confirmar Prorrogação'}
          </button>
        </div>
      </div>
    </div>
  );
}