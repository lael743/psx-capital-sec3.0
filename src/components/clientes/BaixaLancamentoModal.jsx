import { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { X, CheckCircle, Loader2, AlertTriangle, CalendarClock } from 'lucide-react';
import CurrencyInput from '@/components/ui/CurrencyInput';
import { calcLateInterest, daysOverdue, formatCurrency, today } from '@/lib/finance';
import { registrarRecebimento, novaChaveRecebimento } from '@/lib/recebimentoOps';

export default function BaixaLancamentoModal({ lancamento, client, onClose, onSaved }) {
  const baseDebit = lancamento.debit_amount || lancamento.gross_value || 0;
  const amortized = lancamento.amortized_amount || 0;
  const remaining = baseDebit - amortized;

  const [rate, setRate] = useState(String(lancamento.rate ?? client?.default_rate ?? ''));
  const [amount, setAmount] = useState(String(remaining.toFixed(2)));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  // M3 — identidade do evento de baixa: fixa na abertura, reusada no retry para
  // que uma falha no meio do caminho não aplique a baixa duas vezes.
  const [chave, setChave] = useState(() => novaChaveRecebimento('baixa_manual'));

  // Cálculo de juros de atraso (proporcional aos dias)
  const { days, interest, totalWithInterest } = useMemo(() => {
    const d = daysOverdue(lancamento.due_date);
    const r = parseFloat(rate) || 0;
    if (d <= 0 || r <= 0) return { days: d, interest: 0, totalWithInterest: remaining };
    const int = remaining * (r / 100) * (d / 30);
    return { days: d, interest: int, totalWithInterest: remaining + int };
  }, [lancamento.due_date, rate, remaining]);

  const isOverdue = days > 0;

  // Atualiza o valor sugerido quando o juros muda (se o usuário não alterou manualmente)
  useEffect(() => {
    setAmount(String(totalWithInterest.toFixed(2)));
  }, [totalWithInterest]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const val = parseFloat(amount) || 0;
    if (val <= 0) { setError('Informe o valor da baixa'); return; }
    if (val > totalWithInterest + 0.01) { setError(`Valor máximo: ${formatCurrency(totalWithInterest)}`); return; }
    setSaving(true);
    setError('');

    const newAmortized = amortized + val;
    const isFull = newAmortized >= totalWithInterest - 0.01;

    const observacao = `Baixa do lançamento ${lancamento.description || lancamento.id}`
      + (isOverdue && interest > 0
        ? ` — mora de ${days} dia(s) × ${(parseFloat(rate) || 0).toFixed(2)}% a.m. = ${formatCurrency(interest)}`
        : '');

    try {
      // ── Obrigação da operação: SÓ o servidor escreve ─────────────────────
      // Antes esta tela somava juros a `total_receivable` e somava o valor em
      // memória sobre `amount_paid`, sobrescrevendo recebimentos concorrentes.
      // Agora é um evento com identidade: a mora vai declarada, com taxa e
      // dias, e o servidor confere o cálculo antes de aplicá-la à obrigação.
      if (lancamento.operation_id) {
        await registrarRecebimento({
          operationId: lancamento.operation_id,
          valor: val,
          data: today(),
          metodo: lancamento.payment_method || 'outro',
          observacao,
          origem: 'baixa_manual',
          chave,
          jurosMora: isOverdue && interest > 0 ? interest : 0,
          taxaMora: isOverdue && interest > 0 ? (parseFloat(rate) || 0) : 0,
          diasAtraso: isOverdue && interest > 0 ? days : 0,
        });
      }

      // ── Extrato do cliente: correção comercial da própria linha ──────────
      const updatePayload = {
        amortized_amount: newAmortized,
        status: isFull ? 'baixado' : 'parcialmente_baixado',
      };

      if (isOverdue && interest > 0) {
        updatePayload.debit_amount = baseDebit + interest;
        updatePayload.corrected_value = totalWithInterest;
        updatePayload.days_calculated = days;
        updatePayload.rate = parseFloat(rate) || 0;
        updatePayload.notes = (lancamento.notes ? lancamento.notes + ' | ' : '') +
          `[JUROS DE ATRASO] ${days} dias × ${parseFloat(rate).toFixed(2)}% a.m. = ${formatCurrency(interest)}. Débito corrigido: ${formatCurrency(baseDebit)} → ${formatCurrency(totalWithInterest)}.`;
      }

      await base44.entities.LancamentoContaCorrente.update(lancamento.id, updatePayload);

      if (!lancamento.operation_id) {
        // Lançamento manual (sem operação): recalcular saldos localmente
        const allLancamentos = await base44.entities.LancamentoContaCorrente.filter({ client_id: lancamento.client_id }, 'date', 200);
        let runningBalance = 0;
        for (const l of allLancamentos) {
          const debit = l.debit_amount || 0;
          const credit = l.credit_amount || 0;
          runningBalance = runningBalance - debit + credit;
          if (l.balance_after !== runningBalance) {
            await base44.entities.LancamentoContaCorrente.update(l.id, { balance_after: runningBalance });
          }
        }
      }
    } catch (err) {
      setSaving(false);
      setError(err.message || 'Não foi possível registrar a baixa.');
      return;
    }

    setSaving(false);
    onSaved();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-emerald-600" />
            <h2 className="text-base font-bold">Baixar Lançamento</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-3">
          <div className="bg-gray-50 rounded-lg p-3 text-sm space-y-1">
            <p><strong>Descrição:</strong> {lancamento.description || 'Sem descrição'}</p>
            <p><strong>Valor total:</strong> {formatCurrency(baseDebit)}</p>
            <p><strong>Saldo restante:</strong> {formatCurrency(remaining)}</p>
            {lancamento.due_date && (
              <p><strong>Vencimento:</strong> {new Date(lancamento.due_date + 'T00:00:00').toLocaleDateString('pt-BR')}</p>
            )}
          </div>

          {/* Cálculo de juros de atraso */}
          {isOverdue && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-2">
              <div className="flex items-center gap-2 text-amber-800 text-xs font-semibold">
                <AlertTriangle className="w-3.5 h-3.5" />
                Parcela em atraso — {days} dia{days !== 1 ? 's' : ''}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1">
                    Taxa mensal (%) <span className="text-amber-600">ajustável</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    className="input-field"
                    value={rate}
                    onChange={e => setRate(e.target.value)}
                    placeholder="0,00"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1">Dias de atraso</label>
                  <div className="input-field bg-amber-100/50 flex items-center gap-1.5">
                    <CalendarClock className="w-3.5 h-3.5 text-amber-600" />
                    <span className="font-semibold">{days}</span>
                  </div>
                </div>
              </div>
              <div className="bg-white rounded-md p-2 text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Saldo devedor</span>
                  <span className="font-medium">{formatCurrency(remaining)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Juros de atraso ({days} dias)</span>
                  <span className="font-semibold text-amber-700">+{formatCurrency(interest)}</span>
                </div>
                <div className="flex justify-between pt-1 border-t border-amber-100">
                  <span className="font-semibold">Total a receber</span>
                  <span className="font-bold text-amber-800">{formatCurrency(totalWithInterest)}</span>
                </div>
              </div>
              <p className="text-[11px] text-amber-700">
                Cálculo: {formatCurrency(remaining)} × {(parseFloat(rate) || 0).toFixed(2)}% × ({days}/30)
              </p>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1">Valor da Baixa</label>
            <CurrencyInput value={amount} onChange={(v) => { setAmount(v); setChave(novaChaveRecebimento('baixa_manual')); }} />
          </div>
          {error && <p className="text-xs text-red-500">{error}</p>}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 text-sm border border-border rounded-lg hover:bg-gray-50">Cancelar</button>
            <button type="submit" disabled={saving} className="flex-1 px-4 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-700 disabled:opacity-50 flex items-center justify-center gap-2">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
              {saving ? 'Salvando...' : 'Confirmar Baixa'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}