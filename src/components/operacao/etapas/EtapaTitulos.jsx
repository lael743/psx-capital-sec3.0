import TitulosGrade from '@/components/operacao/etapas/TitulosGrade';
import { DataTable, TableHead, Th, TableBody, Tr, Td, EmptyRow } from '@/components/ui/DataTable';
import StatusBadge from '@/components/ui/StatusBadge';
import { formatCurrency, formatDate } from '@/lib/finance';

/**
 * ETAPA 3 — Confirmação dos títulos.
 *
 * Última leitura do conteúdo da operação antes da formalização. Qualquer ajuste
 * é feito pelo botão "Editar" da operação, que fica disponível até esta etapa.
 */
export default function EtapaTitulos({ operacao, cheques = [] }) {
  const agenda = Array.isArray(operacao.installment_schedule) ? operacao.installment_schedule : [];

  return (
    <div className="space-y-3">
      <TitulosGrade cheques={cheques} />

      <div className="bg-white border border-border rounded-xl p-4 space-y-2">
        <h3 className="text-sm font-bold">Agenda de parcelas</h3>
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
        <p className="text-[11px] text-muted-foreground">
          Recebimentos e baixas não são feitos por aqui: eles acontecem em Contas a Receber.
        </p>
      </div>
    </div>
  );
}