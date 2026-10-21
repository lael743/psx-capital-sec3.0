import { useEffect, useState } from 'react';
import { CheckCircle } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { formatCurrency, formatDate } from '@/lib/finance';

const ROTULO_FORMA = {
  pix: 'PIX',
  transferencia: 'TED/Transferência',
  cheque: 'Cheque',
  dinheiro: 'Dinheiro',
  outro: 'Outro',
};

/** M7 — resumo do repasse já registrado (prova gravada na operação + extrato). */
export default function RepasseRegistrado({ operacao }) {
  const [linhas, setLinhas] = useState(null);

  useEffect(() => {
    let ativo = true;
    Promise.all([
      base44.entities.CashFlow.filter({ operation_id: operacao.id, source_type: 'repasse_cliente' }),
      base44.entities.Banco.list(),
    ])
      .then(([entradas, bancos]) => {
        if (!ativo) return;
        const lista = Array.isArray(entradas) ? entradas : entradas?.items || [];
        const nomes = new Map((Array.isArray(bancos) ? bancos : bancos?.items || []).map((banco) => [banco.id, banco.name]));
        setLinhas(lista.map((entrada) => ({
          id: entrada.id,
          conta: nomes.get(entrada.bank_id) || entrada.bank_id || '—',
          forma: ROTULO_FORMA[entrada.method] || 'Transferência',
          valor: entrada.amount || 0,
        })));
      })
      .catch(() => { if (ativo) setLinhas([]); });
    return () => { ativo = false; };
  }, [operacao.id]);

  return (
    <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 space-y-2">
      <div className="flex items-center gap-2">
        <CheckCircle className="w-4 h-4 text-emerald-600" />
        <h3 className="text-sm font-bold text-emerald-900">Repasse ao cedente registrado</h3>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-emerald-700/70">Valor total</p>
          <p className="font-bold tabular-nums">{formatCurrency(operacao.net_value ?? operacao.gross_value ?? 0)}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-emerald-700/70">Data</p>
          <p className="font-semibold">{formatDate(operacao.payment_execution_date)}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-emerald-700/70">Formas</p>
          <p className="font-semibold">{linhas ? linhas.length : '—'}</p>
        </div>
      </div>

      {linhas && linhas.length > 0 && (
        <div className="rounded-lg border border-emerald-200 bg-white/70 divide-y divide-emerald-100">
          {linhas.map((linha) => (
            <div key={linha.id} className="flex items-center justify-between gap-3 px-3 py-2 text-xs">
              <span className="font-semibold truncate">{linha.conta}</span>
              <span className="text-emerald-800/80">{linha.forma}</span>
              <span className="font-bold tabular-nums">{formatCurrency(linha.valor)}</span>
            </div>
          ))}
        </div>
      )}

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