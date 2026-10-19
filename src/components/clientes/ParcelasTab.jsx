import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { formatCurrency, formatDate } from '@/lib/finance';
import { DataTable, TableHead, Th, TableBody, Tr, Td, EmptyRow } from '@/components/ui/DataTable';
import StatusBadge from '@/components/ui/StatusBadge';

const PARC_STATUS = { pendente: 'Pendente', paga: 'Paga', atrasada: 'Atrasada', cancelada: 'Cancelada' };

export default function ParcelasTab({ clientId }) {
  const [parcelas, setParcelas] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    base44.entities.ParcelaCliente.filter({ client_id: clientId }, 'due_date', 50)
      .then(data => { setParcelas(data); setLoading(false); });
  }, [clientId]);

  if (loading) return (
    <div className="flex items-center justify-center h-40">
      <div className="w-6 h-6 border-2 border-border border-t-foreground rounded-full animate-spin" />
    </div>
  );

  const isOverdue = (p) => p.status === 'pendente' && p.due_date && p.due_date < new Date().toISOString().split('T')[0];

  return (
    <DataTable>
      <TableHead>
        <Th>Nº</Th>
        <Th right>Valor Original</Th>
        <Th right>Valor Corrigido</Th>
        <Th>Vencimento</Th>
        <Th right>Pago</Th>
        <Th right>Restante</Th>
        <Th>Status</Th>
      </TableHead>
      <TableBody>
        {parcelas.map(p => (
          <Tr key={p.id}>
            <Td className="font-semibold">{p.number}ª</Td>
            <Td right mono>{formatCurrency(p.original_value)}</Td>
            <Td right mono className={p.corrected_value > p.original_value ? 'text-amber-600 font-semibold' : ''}>{formatCurrency(p.corrected_value)}</Td>
            <Td muted className={isOverdue(p) ? 'text-red-500 font-semibold' : ''}>{formatDate(p.due_date)}</Td>
            <Td right mono className="text-emerald-600">{formatCurrency(p.paid_amount)}</Td>
            <Td right mono className="font-semibold">{formatCurrency(p.remaining_amount)}</Td>
            <Td><StatusBadge status={isOverdue(p) ? 'atrasada' : p.status} /></Td>
          </Tr>
        ))}
        {parcelas.length === 0 && <EmptyRow colSpan={7} message="Nenhuma parcela registrada." />}
      </TableBody>
    </DataTable>
  );
}