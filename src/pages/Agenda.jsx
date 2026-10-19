import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { formatCurrency, formatDate, daysOverdue } from '@/lib/finance';
import { Link } from 'react-router-dom';
import { Calendar, AlertTriangle, Clock } from 'lucide-react';
import StatusBadge from '@/components/ui/StatusBadge';

export default function Agenda() {
  const [operations, setOperations] = useState([]);
  const [cheques, setCheques] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('vencimentos');

  useEffect(() => {
    Promise.all([
      base44.entities.Operation.list('-due_date', 300),
      base44.entities.Cheque.filter({ status: 'pendente' }),
    ]).then(([ops, chqs]) => {
      setOperations(ops.filter(o => o.status !== 'quitado'));
      setCheques(chqs);
      setLoading(false);
    });
  }, []);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const upcoming = operations.filter(op => {
    const due = new Date(op.due_date + 'T00:00:00');
    const diff = Math.ceil((due - today) / (1000 * 60 * 60 * 24));
    return diff >= -7 && diff <= 30;
  }).sort((a, b) => new Date(a.due_date) - new Date(b.due_date));

  const overdue = operations.filter(op => daysOverdue(op.due_date) > 0);

  const checksDue = cheques.filter(c => {
    const due = new Date(c.compensation_date + 'T00:00:00');
    const diff = Math.ceil((due - today) / (1000 * 60 * 60 * 24));
    return diff >= -7 && diff <= 30;
  }).sort((a, b) => new Date(a.compensation_date) - new Date(b.compensation_date));

  const getDateClass = (dateStr) => {
    const days = Math.ceil((new Date(dateStr + 'T00:00:00') - today) / (1000 * 60 * 60 * 24));
    if (days < 0) return 'text-red-600';
    if (days <= 3) return 'text-amber-600';
    return 'text-foreground';
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-6 h-6 border-2 border-border border-t-foreground rounded-full animate-spin" /></div>;

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Agenda</h1>
        <p className="text-sm text-muted-foreground">Vencimentos, cobranças e alertas</p>
      </div>

      {/* Alert banner */}
      {overdue.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-4 mb-5 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-red-500 shrink-0" />
          <div>
            <div className="text-sm font-semibold text-red-700">{overdue.length} operações em atraso</div>
            <div className="text-xs text-red-600">Saldo em risco: {formatCurrency(overdue.reduce((s, o) => s + (o.balance_due ?? ((o.total_receivable || 0) - (o.amount_paid || 0))), 0))}</div>
          </div>
          <Link to="/cobranca" className="ml-auto text-xs font-medium text-red-700 border border-red-300 px-3 py-1.5 rounded-lg hover:bg-red-100">Ver Cobrança</Link>
        </div>
      )}

      <div className="flex gap-0.5 bg-gray-100 rounded-lg p-1 mb-5 w-fit">
        {[
          { key: 'vencimentos', label: 'Vencimentos', icon: Calendar },
          { key: 'cheques', label: 'Cheques', icon: Clock },
        ].map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setView(key)}
            className={`flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium rounded-md transition-colors ${view === key ? 'bg-white text-foreground shadow-sm' : 'text-muted-foreground'}`}>
            <Icon className="w-3.5 h-3.5" /> {label}
          </button>
        ))}
      </div>

      {view === 'vencimentos' && (
        <div className="bg-white border border-border rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <h3 className="text-sm font-semibold">Próximos 30 dias + Atrasados</h3>
            <span className="text-xs text-muted-foreground">{upcoming.length} operações</span>
          </div>
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-gray-50/50">
                <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground">Cliente</th>
                <th className="text-right px-5 py-3 text-xs font-medium text-muted-foreground">Saldo</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground">Vencimento</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground">Status</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {upcoming.map(op => (
                <tr key={op.id} className="hover:bg-gray-50/50">
                  <td className="px-5 py-3 font-medium">{op.client_name}</td>
                  <td className="px-5 py-3 text-right font-mono">{formatCurrency(op.balance_due ?? ((op.total_receivable || 0) - (op.amount_paid || 0)))}</td>
                  <td className={`px-5 py-3 font-medium ${getDateClass(op.due_date)}`}>{formatDate(op.due_date)}</td>
                  <td className="px-5 py-3"><StatusBadge status={op.status} /></td>
                  <td className="px-5 py-3">
                    <Link to={`/operacoes/${op.id}`} className="text-xs text-[hsl(43,65%,47%)] hover:underline">Ver</Link>
                  </td>
                </tr>
              ))}
              {upcoming.length === 0 && <tr><td colSpan={5} className="px-5 py-8 text-center text-muted-foreground">Nenhum vencimento próximo.</td></tr>}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {view === 'cheques' && (
        <div className="bg-white border border-border rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border">
            <h3 className="text-sm font-semibold">Cheques Pendentes</h3>
          </div>
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-gray-50/50">
                <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground">Cliente</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground">Banco / Nº</th>
                <th className="text-right px-5 py-3 text-xs font-medium text-muted-foreground">Valor</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground">Compensação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {checksDue.map(c => (
                <tr key={c.id} className="hover:bg-gray-50/50">
                  <td className="px-5 py-3 font-medium">{c.client_name}</td>
                  <td className="px-5 py-3 text-muted-foreground">{c.bank_name} #{c.check_number}</td>
                  <td className="px-5 py-3 text-right font-mono">{formatCurrency(c.value)}</td>
                  <td className={`px-5 py-3 font-medium ${getDateClass(c.compensation_date)}`}>{formatDate(c.compensation_date)}</td>
                </tr>
              ))}
              {checksDue.length === 0 && <tr><td colSpan={4} className="px-5 py-8 text-center text-muted-foreground">Nenhum cheque pendente próximo.</td></tr>}
            </tbody>
          </table>
          </div>
        </div>
      )}
    </div>
  );
}