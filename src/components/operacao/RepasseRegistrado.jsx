import { CheckCircle } from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/finance';

/** M7 — resumo do repasse já registrado (prova gravada na operação). */
export default function RepasseRegistrado({ operacao }) {
  return (
    <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 space-y-2">
      <div className="flex items-center gap-2">
        <CheckCircle className="w-4 h-4 text-emerald-600" />
        <h3 className="text-sm font-bold text-emerald-900">Repasse ao cedente registrado</h3>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-emerald-700/70">Valor</p>
          <p className="font-bold tabular-nums">{formatCurrency(operacao.net_value ?? operacao.gross_value ?? 0)}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-emerald-700/70">Data</p>
          <p className="font-semibold">{formatDate(operacao.payment_execution_date)}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-emerald-700/70">Conta de origem</p>
          <p className="font-semibold truncate">{operacao.disbursement_bank_name || '—'}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-emerald-700/70">Referência</p>
          <p className="font-semibold truncate">{operacao.disbursement_reference || '—'}</p>
        </div>
      </div>
      {operacao.disbursement_proof_url && (
        <a
          href={operacao.disbursement_proof_url}
          target="_blank"
          rel="noreferrer"
          className="inline-block text-xs font-semibold text-emerald-800 underline"
        >
          Ver comprovante
        </a>
      )}
      <p className="text-[11px] text-emerald-800/80">
        A operação já pode ser concluída — use &quot;Enviar para Finalizada&quot;.
      </p>
    </div>
  );
}