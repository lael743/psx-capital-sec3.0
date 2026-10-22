import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { formatCurrency, formatPercent, daysOverdue } from '@/lib/finance';
import { TrendingUp, Users, DollarSign, AlertTriangle, Activity, CheckSquare, Clock, BarChart3 } from 'lucide-react';
import { Link } from 'react-router-dom';
import StatusBadge from '@/components/ui/StatusBadge';
import StatCard from '@/components/ui/StatCard';
import SectionCard from '@/components/ui/SectionCard';
import { DataTable, TableHead, Th, TableBody, Tr, Td, EmptyRow } from '@/components/ui/DataTable';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { fetchAll } from '@/lib/fetchAll';

const COLORS = { ativo: '#22c55e', atrasado: '#f59e0b', inadimplente: '#ef4444', quitado: '#3b82f6' };

export default function Dashboard() {
  const [operations, setOperations] = useState([]);
  const [clients, setClients] = useState([]);
  const [cheques, setCheques] = useState([]);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
    fetchAll('Operation'),
    fetchAll('Client'),
    fetchAll('Cheque'),
    fetchAll('Payment')]
    ).then(([ops, cls, chqs, pmts]) => {
      setOperations(ops);
      setClients(cls);
      setCheques(chqs);
      setPayments(pmts);
      setLoading(false);
    });
  }, []);

  const today = new Date();today.setHours(0, 0, 0, 0);
  // Exclui operações em rascunho (não finalizadas) dos cálculos e exibições
  const draftOpIds = new Set(operations.filter((o) => o.etapa === 'rascunho').map((o) => o.id));
  const visibleOps = operations.filter((o) => o.etapa !== 'rascunho' && o.etapa !== 'rejeitada');
  const visibleCheques = cheques.filter((c) => !c.operation_id || !draftOpIds.has(c.operation_id));
  const activeOps = visibleOps.filter((o) => o.status !== 'quitado');
  const totalBorrowed = visibleOps.reduce((s, o) => s + (o.gross_value || 0), 0);
  const totalReceivable = activeOps.reduce((s, o) => s + ((o.total_receivable || 0) - (o.amount_paid || 0)), 0);
  // Recebimentos reais: pagamentos + cheques compensados
  const totalPaidOps = payments.reduce((s, p) => s + (p.amount || 0), 0);
  const totalChequesCompensados = visibleCheques.filter((c) => c.status === 'compensado').reduce((s, c) => s + (c.value || 0), 0);
  const totalPaid = totalPaidOps + totalChequesCompensados;
  const totalProfit = visibleOps.reduce((s, o) => s + (o.realized_profit || 0), 0);
  const projectedProfit = activeOps.reduce((s, o) => s + (o.projected_profit || 0), 0);
  // Vencidas: qualquer não quitada com due_date no passado
  const overdueOps = visibleOps.filter((o) => {
    if (o.status === 'quitado') return false;
    const due = new Date(o.due_date + 'T00:00:00');
    return due < today;
  });
  const defaultRate = visibleOps.length > 0 ? overdueOps.length / visibleOps.length * 100 : 0;
  const avgTicket = visibleOps.length > 0 ? totalBorrowed / visibleOps.length : 0;
  const checksAtRisk = visibleCheques.filter((c) => c.status === 'devolvido' || daysOverdue(c.compensation_date) > 0 && c.status === 'pendente');

  // Pie chart data
  const statusCounts = ['ativo', 'atrasado', 'inadimplente', 'quitado'].map((s) => ({
    name: s.charAt(0).toUpperCase() + s.slice(1),
    value: visibleOps.filter((o) => o.status === s).length,
    color: COLORS[s]
  })).filter((d) => d.value > 0);

  // Line chart: last 6 months (simulated from payment data)
  const months = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleDateString('pt-BR', { month: 'short' });
    const receitas = payments.
    filter((p) => p.payment_date?.startsWith(key)).
    reduce((s, p) => s + (p.amount || 0), 0);
    const lucro = visibleOps.
    filter((o) => o.due_date?.startsWith(key)).
    reduce((s, o) => s + (o.realized_profit || 0), 0);
    months.push({ label, receitas, lucro });
  }

  const recentOps = visibleOps.slice(0, 8);

  // Métricas do mês atual
  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const monthOps = visibleOps.filter((o) => o.start_date?.startsWith(thisMonth));
  const monthValue = monthOps.reduce((s, o) => s + (o.gross_value || 0), 0);
  const monthChequesPending = visibleCheques.filter((c) => c.status === 'pendente');
  const monthChequesPendingValue = monthChequesPending.reduce((s, c) => s + (c.value || 0), 0);
  const avgRate = visibleOps.length > 0 ? visibleOps.reduce((s, o) => s + (o.rate || 0), 0) / visibleOps.length : 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-border border-t-foreground rounded-full animate-spin" />
      </div>);

  }

  return (
    <div className="md:p-6 max-w-7xl space-y-4 md:space-y-6 px-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Visão geral das suas operações</p>
        </div>
        <div className="text-sm text-muted-foreground">
          {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
        </div>
      </div>

      {/* Painel do Mês */}
      <div className="bg-white border border-border rounded-xl p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-bold">Painel do Mês</h2>
            <p className="text-xs text-muted-foreground">{now.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</p>
          </div>
          <span className="text-xs px-2.5 py-1 bg-gray-100 rounded-full text-muted-foreground font-medium">
            {monthOps.length} novas operações
          </span>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-gray-50 rounded-xl p-4">
            <div className="text-xs text-muted-foreground mb-1">Total Operado no Mês</div>
            <div className="text-xl font-bold">{formatCurrency(monthValue)}</div>
          </div>
          <div className="bg-amber-50 rounded-xl p-4">
            <div className="text-xs text-muted-foreground mb-1">Cheques Aguard. Compensação</div>
            <div className="text-xl font-bold text-amber-700">{monthChequesPending.length}</div>
            <div className="text-xs text-amber-600 mt-0.5">{formatCurrency(monthChequesPendingValue)}</div>
          </div>
          <div className="bg-gray-50 rounded-xl p-4">
            <div className="text-xs text-muted-foreground mb-1">Taxa Média Aplicada</div>
            <div className="text-xl font-bold">{avgRate.toFixed(2)}% a.m.</div>
          </div>
          <div className="bg-gray-50 rounded-xl p-4">
            <div className="text-xs text-muted-foreground mb-2">Evolução — Últimos 6 meses</div>
            <div className="flex items-end gap-1 h-10">
              {months.map((m, i) => {
                const maxR = Math.max(...months.map((x) => x.receitas), 1);
                const h = Math.round(m.receitas / maxR * 40);
                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
                    <div className="w-full rounded-sm bg-foreground/80 transition-all" style={{ height: `${Math.max(h, 2)}px` }} title={`${m.label}: ${formatCurrency(m.receitas)}`} />
                  </div>);

              })}
            </div>
          </div>
        </div>
      </div>

      {/* KPI Row 1 - highlighted */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Emprestado" value={formatCurrency(totalBorrowed)} sub={`${operations.length} operações`} icon={DollarSign} variant="dark" />
        <StatCard label="A Receber" value={formatCurrency(totalReceivable)} sub={`${activeOps.length} operações ativas`} icon={TrendingUp} variant="gold" />
        <StatCard label="Lucro Realizado" value={formatCurrency(totalProfit)} sub={`Projetado: ${formatCurrency(projectedProfit)}`} icon={BarChart3} />
        <StatCard label="Inadimplência" value={formatPercent(defaultRate)} sub={`${overdueOps.length} em atraso`} icon={AlertTriangle} variant={overdueOps.length > 0 ? 'danger' : 'default'} />
      </div>

      {/* KPI Row 2 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Clientes Ativos" value={clients.filter((c) => c.status === 'ativo').length} sub={`${clients.length} no total`} icon={Users} />
        <StatCard label="Ticket Médio" value={formatCurrency(avgTicket)} sub="Por operação" icon={Activity} />
        <StatCard label="Cheques em Risco" value={checksAtRisk.length} sub="Pendentes/Devolvidos" icon={AlertTriangle} variant={checksAtRisk.length > 0 ? 'danger' : 'default'} />
        <StatCard label="Total Recebido" value={formatCurrency(totalPaid)} sub="Pagamentos + cheques compensados" icon={CheckSquare} />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <SectionCard title="Receitas vs Lucro" subtitle="Últimos 6 meses" className="lg:col-span-2">
          <div className="p-5">
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={months}>
                <XAxis dataKey="label" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v) => formatCurrency(v)} labelStyle={{ fontWeight: 600 }} />
                <Line type="monotone" dataKey="receitas" name="Receitas" stroke="#0a0a0a" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="lucro" name="Lucro" stroke="hsl(43,65%,47%)" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>

        <SectionCard title="Operações por Status" subtitle="Total">
          <div className="p-5 flex flex-col items-center">
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie data={statusCounts} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value">
                  {statusCounts.map((entry, i) =>
                  <Cell key={i} fill={entry.color} />
                  )}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-wrap gap-x-4 gap-y-1 justify-center mt-2">
              {statusCounts.map((s) =>
              <div key={s.name} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <div className="w-2 h-2 rounded-full" style={{ background: s.color }} />
                  {s.name} ({s.value})
                </div>
              )}
            </div>
          </div>
        </SectionCard>
      </div>

      {/* Recent operations + alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <SectionCard
          title="Próximos Vencimentos"
          subtitle="Operações em aberto"
          className="lg:col-span-2"
          action={<Link to="/operacoes" className="text-xs font-medium text-[hsl(43,65%,47%)] hover:underline">Ver todas →</Link>}>
          
          <DataTable>
            <TableHead>
              <Th>Cliente</Th>
              <Th>Tipo</Th>
              <Th right>A Receber</Th>
              <Th>Vencimento</Th>
              <Th>Status</Th>
            </TableHead>
            <TableBody>
              {recentOps.map((op) =>
              <Tr key={op.id}>
                  <Td className="font-medium">{op.client_name || '—'}</Td>
                  <Td><StatusBadge status={op.type} /></Td>
                  <Td right mono className="text-[hsl(43,65%,47%)] font-semibold">{formatCurrency((op.total_receivable || 0) - (op.amount_paid || 0))}</Td>
                  <Td muted>{op.due_date ? new Date(op.due_date + 'T00:00:00').toLocaleDateString('pt-BR') : '—'}</Td>
                  <Td><StatusBadge status={op.status} /></Td>
                </Tr>
              )}
              {recentOps.length === 0 && <EmptyRow colSpan={5} message="Nenhuma operação cadastrada." />}
            </TableBody>
          </DataTable>
        </SectionCard>

        <div className="space-y-4">
          <SectionCard title="Em Atraso" action={<Link to="/cobranca" className="text-xs text-[hsl(43,65%,47%)] hover:underline">Ver →</Link>}>
            <div className="divide-y divide-border">
              {overdueOps.slice(0, 4).map((op) =>
              <div key={op.id} className="flex items-center justify-between px-5 py-3">
                  <div>
                    <div className="text-sm font-medium">{op.client_name}</div>
                    <div className="text-xs text-red-500 font-medium">{daysOverdue(op.due_date)}d atraso</div>
                  </div>
                  <div className="text-sm font-bold text-red-600">{formatCurrency((op.total_receivable || 0) - (op.amount_paid || 0))}</div>
                </div>
              )}
              {overdueOps.length === 0 && <div className="px-5 py-5 text-center text-muted-foreground text-sm">Sem atrasos!</div>}
            </div>
          </SectionCard>

          <SectionCard title="Cheques em Risco">
            <div className="divide-y divide-border">
              {checksAtRisk.slice(0, 3).map((c) =>
              <div key={c.id} className="flex items-center justify-between px-5 py-3">
                  <div>
                    <div className="text-sm font-medium">{c.client_name}</div>
                    <div className="text-xs text-muted-foreground">{c.bank_name} #{c.check_number}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-bold">{formatCurrency(c.value)}</div>
                    <StatusBadge status={c.status} />
                  </div>
                </div>
              )}
              {checksAtRisk.length === 0 && <div className="px-5 py-5 text-center text-muted-foreground text-sm">Sem riscos!</div>}
            </div>
          </SectionCard>
        </div>
      </div>
    </div>);

}