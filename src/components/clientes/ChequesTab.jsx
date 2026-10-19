import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { formatCurrency, formatDate } from '@/lib/finance';
import { DataTable, TableHead, TableBody, Tr, Td, EmptyRow } from '@/components/ui/DataTable';
import StatusBadge from '@/components/ui/StatusBadge';
import { Link } from 'react-router-dom';
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';

export default function ChequesTab({ clientId }) {
  const [cheques, setCheques] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sortField, setSortField] = useState('compensation_date');
  const [sortDir, setSortDir] = useState('desc');

  useEffect(() => {
    base44.entities.Cheque.filter({ client_id: clientId }, '-compensation_date', 50)
      .then(data => { setCheques(data); setLoading(false); });
  }, [clientId]);

  const sorted = [...cheques].sort((a, b) => {
    const va = a[sortField];
    const vb = b[sortField];
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    const cmp = typeof va === 'number' ? va - vb : String(va).localeCompare(String(vb));
    return sortDir === 'asc' ? cmp : -cmp;
  });

  const toggleSort = (field) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const SortTh = ({ field, children, right }) => (
    <th
      onClick={() => toggleSort(field)}
      className={`px-5 py-3.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer select-none hover:text-foreground transition-colors ${right ? 'text-right' : 'text-left'}`}
    >
      <span className={`inline-flex items-center gap-1 ${right ? 'justify-end' : ''}`}>
        {children}
        {sortField === field
          ? (sortDir === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)
          : <ArrowUpDown className="w-3 h-3 opacity-40" />
        }
      </span>
    </th>
  );

  if (loading) return (
    <div className="flex items-center justify-center h-40">
      <div className="w-6 h-6 border-2 border-border border-t-foreground rounded-full animate-spin" />
    </div>
  );

  return (
    <DataTable>
      <TableHead>
        <SortTh field="bank_name">Banco</SortTh>
        <SortTh field="check_number">Nº Cheque</SortTh>
        <SortTh field="value" right>Valor</SortTh>
        <SortTh field="compensation_date">Vencimento</SortTh>
        <SortTh field="status">Status</SortTh>
        <SortTh field="custody_status">Custódia</SortTh>
        <th className="px-5 py-3.5" />
      </TableHead>
      <TableBody>
        {sorted.map(c => (
          <Tr key={c.id}>
            <Td>{c.bank_name || '—'}</Td>
            <Td mono>{c.check_number}</Td>
            <Td right mono className="font-semibold">{formatCurrency(c.value)}</Td>
            <Td muted>{formatDate(c.compensation_date)}</Td>
            <Td><StatusBadge status={c.status} /></Td>
            <Td><StatusBadge status={c.custody_status} /></Td>
            <Td>
              <Link to={`/cheques`} className="text-xs text-[hsl(43,65%,47%)] hover:underline font-medium">Ver →</Link>
            </Td>
          </Tr>
        ))}
        {sorted.length === 0 && <EmptyRow colSpan={7} message="Nenhum cheque vinculado." />}
      </TableBody>
    </DataTable>
  );
}