import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { formatCurrency, formatDate } from '@/lib/finance';
import { ArrowUpCircle, ArrowDownCircle, AlertTriangle, CheckCircle2, Clock } from 'lucide-react';

const CATEGORY_LABELS = {
  compensacao_cheque: 'Compensação Cheque',
  estorno_compensacao: 'Estorno',
  remessa_banco: 'Remessa',
  transferencia: 'Transferência',
  lucro_prorrogacao: 'Juros Prorrogação',
  repasse_cliente: 'Repasse Cliente',
  despesa: 'Despesa',
  receita: 'Receita',
  outro: 'Outro',
};

export default function BancoVisaoGeral({ banco, cheques, onReload }) {
  const [movs, setMovs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    base44.entities.CashFlow.list('-date', 200).then(cfs => {
      const relevant = cfs.filter(cf =>
        cf.description?.includes(banco.name) ||
        cf.description?.includes(`Banco: ${banco.name}`)
      ).slice(0, 8);
      setMovs(relevant);
      setLoading(false);
    });
  }, [banco.id]);

  const bancoCheques = cheques.filter(c =>
    c.deposited_bank_id === banco.id || c.deposited_bank_name === banco.name
  );
  const pendentes = bancoCheques.filter(c => c.status === 'pendente');
  const devolvidos = bancoCheques.filter(c => c.status === 'devolvido');
  const chequeRecentes = bancoCheques.slice(0, 5);

  // Alertas
  const alertas = [];
  if (devolvidos.length > 0)
    alertas.push({ type: 'danger', msg: `${devolvidos.length} cheque${devolvidos.length > 1 ? 's' : ''} devolvido${devolvidos.length > 1 ? 's' : ''} — ${formatCurrency(devolvidos.reduce((s, c) => s + (c.value || 0), 0))} em risco` });
  if (pendentes.length > 0) {
    const vencidos = pendentes.filter(c => c.compensation_date && c.compensation_date <= new Date().toISOString().split('T')[0]);
    if (vencidos.length > 0)
      alertas.push({ type: 'warning', msg: `${vencidos.length} cheque${vencidos.length > 1 ? 's' : ''} vencido${vencidos.length > 1 ? 's' : ''} aguardando compensação` });
  }
  if ((banco.current_balance || 0) < 0)
    alertas.push({ type: 'danger', msg: `Saldo negativo: ${formatCurrency(banco.current_balance || 0)}` });

  return (
    <div className="space-y-5">
      {/* Alertas */}
      {alertas.length > 0 && (
        <div className="space-y-2">
          {alertas.map((a, i) => (
            <div key={i} className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium ${
              a.type === 'danger' ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-amber-50 text-amber-700 border border-amber-200'
            }`}>
              <AlertTriangle className="w-4 h-4 shrink-0" />
              {a.msg}
            </div>
          ))}
        </div>
      )}

      {/* Cheques em andamento */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Cheques Recentes</h3>
          <span className="text-xs text-muted-foreground">{bancoCheques.length} total</span>
        </div>
        {chequeRecentes.length === 0 ? (
          <div className="text-xs text-muted-foreground text-center py-6 border border-dashed border-border rounded-lg">
            Nenhum cheque vinculado a este banco
          </div>
        ) : (
          <div className="border border-border rounded-xl overflow-hidden">
            {chequeRecentes.map((c, i) => (
              <div key={c.id} className={`flex items-center gap-3 px-3 py-2.5 ${i < chequeRecentes.length - 1 ? 'border-b border-border' : ''} hover:bg-gray-50`}>
                <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
                  c.status === 'compensado' ? 'bg-emerald-100' : c.status === 'devolvido' ? 'bg-red-100' : 'bg-amber-100'
                }`}>
                  {c.status === 'compensado'
                    ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    : c.status === 'devolvido'
                    ? <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
                    : <Clock className="w-3.5 h-3.5 text-amber-600" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold truncate">{c.client_name}</div>
                  <div className="text-xs text-muted-foreground">{c.bank_name} · #{c.check_number} · {formatDate(c.compensation_date)}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-xs font-bold font-mono">{formatCurrency(c.value)}</div>
                  <div className={`text-xs font-medium ${
                    c.status === 'compensado' ? 'text-emerald-600' : c.status === 'devolvido' ? 'text-red-600' : 'text-amber-600'
                  }`}>{c.status === 'compensado' ? 'Compensado' : c.status === 'devolvido' ? 'Devolvido' : 'Pendente'}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Últimas movimentações */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Últimas Movimentações</h3>
        </div>
        {loading ? (
          <div className="h-20 flex items-center justify-center">
            <div className="w-4 h-4 border-2 border-border border-t-foreground rounded-full animate-spin" />
          </div>
        ) : movs.length === 0 ? (
          <div className="text-xs text-muted-foreground text-center py-6 border border-dashed border-border rounded-lg">
            Nenhuma movimentação registrada
          </div>
        ) : (
          <div className="border border-border rounded-xl overflow-hidden">
            {movs.map((m, i) => (
              <div key={m.id} className={`flex items-center gap-3 px-3 py-2.5 ${i < movs.length - 1 ? 'border-b border-border' : ''} hover:bg-gray-50`}>
                {m.type === 'entrada'
                  ? <ArrowUpCircle className="w-4 h-4 text-emerald-500 shrink-0" />
                  : <ArrowDownCircle className="w-4 h-4 text-red-500 shrink-0" />}
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium truncate">{m.description}</div>
                  <div className="text-xs text-muted-foreground">{CATEGORY_LABELS[m.category] || m.category || '—'} · {formatDate(m.date)}</div>
                </div>
                <div className={`text-xs font-bold font-mono shrink-0 ${m.type === 'entrada' ? 'text-emerald-700' : 'text-red-600'}`}>
                  {m.type === 'entrada' ? '+' : '-'}{formatCurrency(m.amount)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}