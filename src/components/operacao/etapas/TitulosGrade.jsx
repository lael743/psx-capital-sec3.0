import { DataTable, TableHead, Th, TableBody, Tr, Td, EmptyRow } from '@/components/ui/DataTable';
import StatusBadge from '@/components/ui/StatusBadge';
import { formatCurrency, formatDate } from '@/lib/finance';

const TIPO = { cheque: 'CHQ', boleto: 'BOL', duplicata: 'DUP' };

/** Grade detalhada dos títulos da operação. Somente leitura por definição. */
export default function TitulosGrade({ cheques = [] }) {
  const totalFace = cheques.reduce((s, c) => s + (c.valor_face || c.value || 0), 0);
  const totalDesagio = cheques.reduce((s, c) => s + (c.desagio || 0), 0);
  const totalDespesas = cheques.reduce((s, c) => s + (c.outras_despesas || 0), 0);
  const totalLiquido = cheques.reduce((s, c) => s + (c.liquido || 0), 0);

  return (
    <div className="bg-white border border-border rounded-xl p-4 space-y-3">
      <DataTable>
        <TableHead>
          <Th>Tipo</Th>
          <Th>Número</Th>
          <Th>Sacado</Th>
          <Th>Emissão</Th>
          <Th>Vencimento</Th>
          <Th right>Dias</Th>
          <Th right>Face</Th>
          <Th right>Deságio</Th>
          <Th right>Despesas</Th>
          <Th right>Líquido</Th>
          <Th>Status</Th>
        </TableHead>
        <TableBody>
          {cheques.map((c) => (
            <Tr key={c.id}>
              <Td><span className="text-xs font-bold uppercase">{TIPO[c.tipo] || 'TÍT'}</span></Td>
              <Td className="text-xs">
                {c.check_number || '—'}
                {c.nf && <span className="text-muted-foreground"> / NF: {c.nf}</span>}
              </Td>
              <Td className="text-xs">{c.sacado_name || '—'}</Td>
              <Td className="text-xs">{formatDate(c.issue_date)}</Td>
              <Td className="text-xs">{formatDate(c.compensation_date)}</Td>
              <Td right className="text-xs">{c.dias || '—'}</Td>
              <Td right mono className="text-xs">{formatCurrency(c.valor_face || c.value)}</Td>
              <Td right mono className="text-xs text-red-600">{formatCurrency(c.desagio || 0)}</Td>
              <Td right mono className="text-xs">{formatCurrency(c.outras_despesas || 0)}</Td>
              <Td right mono className="text-xs font-semibold">{formatCurrency(c.liquido || 0)}</Td>
              <Td><StatusBadge status={c.status} /></Td>
            </Tr>
          ))}
          {cheques.length === 0 && <EmptyRow colSpan={11} message="Nenhum título vinculado." />}
        </TableBody>
      </DataTable>

      {cheques.length > 0 && (
        <div className="flex flex-wrap justify-end gap-6 text-xs font-semibold border-t border-border pt-2">
          <span>Face: <span className="font-mono">{formatCurrency(totalFace)}</span></span>
          <span>Deságio: <span className="font-mono text-red-600">{formatCurrency(totalDesagio)}</span></span>
          <span>Despesas: <span className="font-mono">{formatCurrency(totalDespesas)}</span></span>
          <span>Líquido: <span className="font-mono text-emerald-600">{formatCurrency(totalLiquido)}</span></span>
        </div>
      )}
    </div>
  );
}