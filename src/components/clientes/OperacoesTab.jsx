import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { formatCurrency, formatDate } from '@/lib/finance';
import { DataTable, TableHead, TableBody, Tr, Td, EmptyRow } from '@/components/ui/DataTable';
import StatusBadge from '@/components/ui/StatusBadge';
import { Link } from 'react-router-dom';
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';

export default function OperacoesTab({ clientId, clientName }) {
  const [operations, setOperations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sortField, setSortField] = useState('start_date');
  const [sortDir, setSortDir] = useState('desc');

  useEffect(() => {
    base44.entities.Operation.filter({ client_id: clientId }, '-start_date', 50)
      .then(data => { setOperations(data); setLoading(false); });
  }, [clientId]);

  const sorted = [...operations].sort((a, b) => {
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
        <SortTh field="type">Tipo</SortTh>
        <SortTh field="gross_value" right>Valor Bruto</SortTh>
        <SortTh field="total_receivable" right>Total a Receber</SortTh>
        <SortTh field="rate" right>Taxa</SortTh>
        <SortTh field="due_date">Vencimento</SortTh>
        <SortTh field="status">Status</SortTh>
        <th className="px-5 py-3.5" />
      </TableHead>
      <TableBody>
        {sorted.map(op => (
          <Tr key={op.id}>
            <Td><StatusBadge status={op.type} /></Td>
            <Td right mono>{formatCurrency(op.gross_value)}</Td>
            <Td right mono className="text-[hsl(43,65%,47%)] font-semibold">{formatCurrency((op.total_receivable || 0) - (op.amount_paid || 0))}</Td>
            <Td>{op.rate}% a.m.</Td>
            <Td muted>{formatDate(op.due_date)}</Td>
            <Td><StatusBadge status={op.status} /></Td>
            <Td>
              <Link to={`/operacoes/${op.id}`} className="text-xs text-[hsl(43,65%,47%)] hover:underline font-medium">Ver →</Link>
            </Td>
          </Tr>
        ))}
        {sorted.length === 0 && <EmptyRow colSpan={7} message="Nenhuma operação vinculada." />}
      </TableBody>
    </DataTable>
  );
}