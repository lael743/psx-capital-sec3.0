import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { formatCurrency, formatDate, daysOverdue, overdueClass } from '@/lib/finance';
import { fetchAll } from '@/lib/fetchAll';
import { MessageCircle, RefreshCw, ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';

const classConfig = {
  em_dia: { label: 'Em Dia', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  atrasado_leve: { label: 'Atrasado Leve (1-15d)', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  critico: { label: 'Crítico (16-60d)', className: 'bg-orange-50 text-orange-700 border-orange-200' },
  perda_provavel: { label: 'Perda Provável (60d+)', className: 'bg-red-50 text-red-700 border-red-200' },
};

function SortIcon({ col, sortCol, sortDir }) {
  if (sortCol !== col) return <ChevronsUpDown className="w-3 h-3 ml-1 text-gray-300 inline" />;
  return sortDir === 'asc'
    ? <ChevronUp className="w-3 h-3 ml-1 text-foreground inline" />
    : <ChevronDown className="w-3 h-3 ml-1 text-foreground inline" />;
}

export default function Cobranca() {
  const [operations, setOperations] = useState([]);
  const [clients, setClients] = useState({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [sortCol, setSortCol] = useState('overdue');
  const [sortDir, setSortDir] = useState('desc');

  useEffect(() => {
    Promise.all([
      fetchAll('Operation', '-due_date'),
      fetchAll('Client', '-name'),
    ]).then(([ops, cls]) => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const vencidas = ops.filter(op => {
        if (op.status === 'quitado') return false;
        if (op.etapa !== 'finalizada') return false;
        const due = new Date(op.due_date + 'T00:00:00');
        return due < today;
      });
      setOperations(vencidas);
      const clientMap = {};
      cls.forEach(c => { clientMap[c.id] = c; });
      setClients(clientMap);
      setLoading(false);
    });
  }, []);



  const enriched = useMemo(() => {
    const list = operations.map(op => {
      const overdue = daysOverdue(op.due_date);
      const cls = overdueClass(overdue);
      const balance = op.balance_due ?? Math.max(0, (op.total_receivable || 0) - (op.amount_paid || 0));
      const prob = cls === 'perda_provavel' ? 85 : cls === 'critico' ? 55 : cls === 'atrasado_leve' ? 25 : 0;
      return { ...op, overdue, cls, balance, prob };
    }).filter(op => !filter || op.cls === filter);

    return [...list].sort((a, b) => {
      let va, vb;
      if (sortCol === 'client_name') { va = a.client_name || ''; vb = b.client_name || ''; }
      else if (sortCol === 'balance') { va = a.balance; vb = b.balance; }
      else if (sortCol === 'overdue') { va = a.overdue; vb = b.overdue; }
      else if (sortCol === 'due_date') { va = a.due_date || ''; vb = b.due_date || ''; }
      else if (sortCol === 'cls') { va = a.cls; vb = b.cls; }
      else if (sortCol === 'prob') { va = a.prob; vb = b.prob; }
      else return 0;
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
  }, [operations, filter, sortCol, sortDir]);

  const toggleSort = (col) => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('desc'); }
  };

  const sendWa = (op, type) => {
    const client = clients[op.client_id];
    if (!client) return;
    const msgs = {
      cobranca: `Olá ${client.name}! Sua dívida de *${formatCurrency(op.balance)}* está *${op.overdue} dias* em atraso. Por favor, entre em contato para regularizar.`,
      negociacao: `Olá ${client.name}! Gostaríamos de negociar sua dívida de *${formatCurrency(op.balance)}*. Entre em contato conosco!`,
    };
    const num = client.whatsapp?.replace(/\D/g, '') || client.phone?.replace(/\D/g, '');
    if (num) window.open(`https://wa.me/55${num}?text=${encodeURIComponent(msgs[type])}`, '_blank');
  };

  const totalExposed = enriched.reduce((s, op) => s + op.balance, 0);
  const probLoss = enriched.filter(op => op.cls === 'perda_provavel').reduce((s, op) => s + op.balance, 0);

  const ThSort = ({ col, children, right }) => (
    <th
      onClick={() => toggleSort(col)}
      className={`px-5 py-3 text-xs font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors ${right ? 'text-right' : 'text-left'}`}
    >
      {children}<SortIcon col={col} sortCol={sortCol} sortDir={sortDir} />
    </th>
  );

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-6 h-6 border-2 border-border border-t-foreground rounded-full animate-spin" /></div>;

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Cobrança</h1>
        <p className="text-sm text-muted-foreground">Gestão de inadimplência e cobranças</p>
      </div>

      {/* Cards de métricas */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
        <div className="bg-white border border-border rounded-lg px-4 py-3">
          <div className="text-xs text-muted-foreground mb-1">Exposição Total</div>
          <div className="font-bold text-lg text-red-600">{formatCurrency(totalExposed)}</div>
        </div>
        <div className="bg-white border border-border rounded-lg px-4 py-3">
          <div className="text-xs text-muted-foreground mb-1">Operações Vencidas</div>
          <div className="font-bold text-lg">{operations.length}</div>
        </div>
        <div className="bg-white border border-border rounded-lg px-4 py-3">
          <div className="text-xs text-muted-foreground mb-1">Perda Provável</div>
          <div className="font-bold text-lg text-red-700">{formatCurrency(probLoss)}</div>
        </div>
        <div className="bg-white border border-border rounded-lg px-4 py-3">
          <div className="text-xs text-muted-foreground mb-1">Críticos</div>
          <div className="font-bold text-lg">{enriched.filter(o => o.cls === 'critico').length}</div>
        </div>
      </div>


      {/* Filtros */}
      <div className="flex flex-wrap gap-2 mb-5">
        <button onClick={() => setFilter('')} className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${!filter ? 'bg-foreground text-primary-foreground border-foreground' : 'border-border hover:bg-gray-50'}`}>
          Todos ({operations.length})
        </button>
        {Object.entries(classConfig).filter(([k]) => k !== 'em_dia').map(([key, cfg]) => (
          <button key={key} onClick={() => setFilter(key)} className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${filter === key ? 'bg-foreground text-primary-foreground border-foreground' : `${cfg.className} border`}`}>
            {cfg.label} ({operations.filter(op => overdueClass(daysOverdue(op.due_date)) === key).length})
          </button>
        ))}
      </div>

      {/* Tabela com ordenamento */}
      <div className="bg-white border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-gray-50/50">
                <ThSort col="client_name">Cliente</ThSort>
                <ThSort col="balance" right>Saldo</ThSort>
                <ThSort col="overdue">Atraso</ThSort>
                <ThSort col="cls">Classificação</ThSort>
                <ThSort col="prob">Prob. Inadimpl.</ThSort>
                <ThSort col="due_date">Vencimento</ThSort>
                <th className="px-5 py-3 text-xs font-medium text-muted-foreground">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {enriched.map(op => {
                const cfg = classConfig[op.cls];
                return (
                  <tr key={op.id} className="hover:bg-gray-50/50">
                    <td className="px-5 py-3">
                      <Link to={`/operacoes/${op.id}`} className="font-medium hover:text-[hsl(43,65%,47%)]">{op.client_name}</Link>
                    </td>
                    <td className="px-5 py-3 text-right font-mono font-bold text-red-600">{formatCurrency(op.balance)}</td>
                    <td className="px-5 py-3 font-medium text-red-600">{op.overdue}d</td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium border ${cfg?.className}`}>{cfg?.label}</span>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden max-w-16">
                          <div className="h-full bg-red-500 rounded-full" style={{ width: `${op.prob}%` }} />
                        </div>
                        <span className="text-xs text-muted-foreground">{op.prob}%</span>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">{formatDate(op.due_date)}</td>
                    <td className="px-5 py-3">
                      <div className="flex gap-1.5">
                        {clients[op.client_id]?.whatsapp && (
                          <>
                            <button onClick={() => sendWa(op, 'cobranca')} title="Cobrar via WhatsApp" className="p-1.5 rounded-md bg-emerald-50 text-emerald-600 hover:bg-emerald-100">
                              <MessageCircle className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => sendWa(op, 'negociacao')} title="Negociar via WhatsApp" className="p-1.5 rounded-md bg-blue-50 text-blue-600 hover:bg-blue-100">
                              <RefreshCw className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {enriched.length === 0 && <tr><td colSpan={7} className="px-5 py-10 text-center text-muted-foreground">Nenhuma operação em atraso. 🎉</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}