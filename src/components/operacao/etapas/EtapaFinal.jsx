import EtapaResumo from '@/components/operacao/etapas/EtapaResumo';
import RepasseRegistrado from '@/components/operacao/RepasseRegistrado';
import CessaoVinculoPanel from '@/components/operacao/CessaoVinculoPanel';
import { DataTable, TableHead, Th, TableBody, Tr, Td, EmptyRow } from '@/components/ui/DataTable';
import StatusBadge from '@/components/ui/StatusBadge';
import { formatCurrency, formatDate } from '@/lib/finance';

/**
 * ETAPA 7 — Dossiê da operação finalizada: tudo o que foi decidido e feito nas
 * etapas anteriores, em um só lugar. Somente leitura.
 */
export default function EtapaFinal({ operacao, cheques = [], payments = [], logs = [], client }) {
  const agenda = Array.isArray(operacao.installment_schedule) ? operacao.installment_schedule : [];

  return (
    <div className="space-y-3">
      {operacao.payment_executed === true && <RepasseRegistrado operacao={operacao} />}

      <EtapaResumo operacao={operacao} cheques={cheques} client={client} />

      <div className="bg-white border border-border rounded-xl p-4 space-y-2">
        <h3 className="text-sm font-bold">Parcelas</h3>
        <DataTable>
          <TableHead><Th>Parcela</Th><Th right>Valor</Th><Th>Vencimento</Th><Th>Status</Th></TableHead>
          <TableBody>
            {agenda.map((inst, i) => (
              <Tr key={inst.id || i}>
                <Td className="text-xs font-semibold">{inst.number}ª parcela</Td>
                <Td right mono className="text-xs">{formatCurrency(inst.value)}</Td>
                <Td className="text-xs">{formatDate(inst.due_date)}</Td>
                <Td><StatusBadge status={inst.paid ? 'quitado' : 'pendente'} /></Td>
              </Tr>
            ))}
            {agenda.length === 0 && <EmptyRow colSpan={4} message="Operação sem parcelamento." />}
          </TableBody>
        </DataTable>
      </div>

      <div className="bg-white border border-border rounded-xl p-4 space-y-2">
        <h3 className="text-sm font-bold">Recebimentos</h3>
        <DataTable>
          <TableHead><Th>Data</Th><Th right>Valor</Th><Th>Método</Th><Th>Observação</Th></TableHead>
          <TableBody>
            {payments.map((p) => (
              <Tr key={p.id}>
                <Td muted className="text-xs">{formatDate(p.payment_date)}</Td>
                <Td right mono className="text-xs font-semibold text-emerald-600">{formatCurrency(p.amount)}</Td>
                <Td className="text-xs capitalize">{p.method}</Td>
                <Td muted className="text-xs">{p.notes || '—'}</Td>
              </Tr>
            ))}
            {payments.length === 0 && <EmptyRow colSpan={4} message="Nenhum recebimento registrado." />}
          </TableBody>
        </DataTable>
      </div>

      <CessaoVinculoPanel operacao={operacao} client={client} />

      <div className="bg-white border border-border rounded-xl p-4 space-y-2">
        <h3 className="text-sm font-bold">Histórico</h3>
        <DataTable>
          <TableHead><Th>Data</Th><Th>Ação</Th><Th>Descrição</Th></TableHead>
          <TableBody>
            {logs.map((log) => (
              <Tr key={log.id}>
                <Td muted className="text-xs">{formatDate(log.created_date)}</Td>
                <Td className="text-xs"><span className="px-2 py-0.5 rounded-full bg-gray-100 text-muted-foreground capitalize">{log.action}</span></Td>
                <Td className="text-xs">{log.description || '—'}</Td>
              </Tr>
            ))}
            {logs.length === 0 && <EmptyRow colSpan={3} message="Nenhum histórico registrado." />}
          </TableBody>
        </DataTable>
      </div>
    </div>
  );
}