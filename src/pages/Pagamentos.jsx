import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { formatCurrency, formatDate } from '@/lib/finance';
import PageHeader from '@/components/ui/PageHeader';
import FilterBar from '@/components/ui/FilterBar';
import StatCard from '@/components/ui/StatCard';
import { DataTable, TableHead, Th, TableBody, Tr, Td, EmptyRow } from '@/components/ui/DataTable';
import { DollarSign, Hash, TrendingUp, Download } from 'lucide-react';
import { exportToCsv } from '@/lib/exportCsv';
import { fetchAll } from '@/lib/fetchAll';

const methodLabel = { pix: 'PIX', dinheiro: 'Dinheiro', transferencia: 'Transferência', cheque: 'Cheque' };
const methodStyle = {
  pix: 'bg-blue-50 text-blue-700 border border-blue-100',
  dinheiro: 'bg-green-50 text-green-700 border border-green-100',
  transferencia: 'bg-purple-50 text-purple-700 border border-purple-100',
  cheque: 'bg-amber-50 text-amber-700 border border-amber-100',
};

export default function Pagamentos() {
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterMethod, setFilterMethod] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  useEffect(() => {
    fetchAll('Payment', '-payment_date').then(data => {
      setPayments(data);
      setLoading(false);
    });
  }, []);

  const filtered = payments.filter(p => {
    const matchSearch = !search || p.client_name?.toLowerCase().includes(search.toLowerCase());
    const matchMethod = !filterMethod || p.method === filterMethod;
    const paymentDate = (p.payment_date || '').slice(0, 10);
    const matchDateFrom = !dateFrom || paymentDate >= dateFrom;
    const matchDateTo = !dateTo || paymentDate <= dateTo;
    return matchSearch && matchMethod && matchDateFrom && matchDateTo;
  });

  const total = filtered.reduce((s, p) => s + (p.amount || 0), 0);
  const avgTicket = filtered.length > 0 ? total / filtered.length : 0;

  const handleExport = () => {
    exportToCsv(filtered, [
      { key: 'payment_date', label: 'Data' },
      { key: 'client_name', label: 'Cliente' },
      { key: 'amount', label: 'Valor (R$)' },
      { key: 'method', label: 'Método' },
      { key: 'notes', label: 'Observações' },
    ], 'pagamentos');
  };

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <PageHeader
        title="Pagamentos"
        subtitle="Histórico completo de pagamentos recebidos"
        action={
          <button onClick={handleExport}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border border-border rounded-lg hover:bg-gray-50">
            <Download className="w-3.5 h-3.5" /> Exportar CSV
          </button>
        }
      />

      <div className="flex flex-col sm:flex-row sm:items-end gap-3 mb-5 p-4 bg-white border border-border rounded-xl">
        <div className="flex-1">
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">Data inicial</label>
          <input type="date" value={dateFrom} max={dateTo || undefined} onChange={e => setDateFrom(e.target.value)} className="w-full input-field" />
        </div>
        <div className="flex-1">
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">Data final</label>
          <input type="date" value={dateTo} min={dateFrom || undefined} onChange={e => setDateTo(e.target.value)} className="w-full input-field" />
        </div>
        <button onClick={() => { setDateFrom(''); setDateTo(''); }} className="px-3 py-2.5 text-sm border border-border rounded-lg hover:bg-gray-50">Limpar período</button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <StatCard label="Total Recebido" value={formatCurrency(total)} icon={DollarSign} variant="gold" />
        <StatCard label="Quantidade" value={filtered.length} sub="pagamentos" icon={Hash} />
        <StatCard label="Ticket Médio" value={filtered.length > 0 ? formatCurrency(avgTicket) : '—'} icon={TrendingUp} />
      </div>

      <FilterBar
        search={search}
        onSearch={setSearch}
        placeholder="Buscar por cliente..."
        filters={[{
          value: filterMethod,
          onChange: setFilterMethod,
          options: [
            { value: '', label: 'Todos os métodos' },
            { value: 'pix', label: 'PIX' },
            { value: 'dinheiro', label: 'Dinheiro' },
            { value: 'transferencia', label: 'Transferência' },
            { value: 'cheque', label: 'Cheque' },
          ],
        }]}
      />

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="w-6 h-6 border-2 border-border border-t-foreground rounded-full animate-spin" />
        </div>
      ) : (
        <DataTable>
          <TableHead>
            <Th>Data</Th>
            <Th>Cliente</Th>
            <Th right>Valor</Th>
            <Th>Método</Th>
            <Th className="hidden lg:table-cell">Observações</Th>
          </TableHead>
          <TableBody>
            {filtered.map(p => (
              <Tr key={p.id}>
                <Td muted className="whitespace-nowrap">{formatDate(p.payment_date)}</Td>
                <Td className="font-semibold max-w-[160px] truncate">{p.client_name || '—'}</Td>
                <Td right mono className="font-semibold text-emerald-600 whitespace-nowrap">{formatCurrency(p.amount)}</Td>
                <Td>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap ${methodStyle[p.method] || 'bg-gray-100 text-gray-600'}`}>
                    {methodLabel[p.method] || p.method}
                  </span>
                </Td>
                <Td muted className="text-xs hidden lg:table-cell max-w-[200px] truncate">{p.notes || '—'}</Td>
              </Tr>
            ))}
            {filtered.length === 0 && <EmptyRow colSpan={5} message="Nenhum pagamento encontrado." />}
          </TableBody>
        </DataTable>
      )}
    </div>
  );
}