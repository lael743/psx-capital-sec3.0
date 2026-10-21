import { ArrowUpDown } from 'lucide-react';
import { DataTable, TableHead, Th, TableBody, Tr, Td, EmptyRow } from '@/components/ui/DataTable';
import SituacaoBadge from '@/components/contasReceber/SituacaoBadge';
import CobrancaBadge from '@/components/contasReceber/CobrancaBadge';
import { GRAU_LABEL, tituloElegivelParaBaixa } from '@/lib/contasReceber';
import { formatCurrency, formatDate } from '@/lib/finance';

function Valor({ valor }) {
  if (valor === null || valor === undefined) {
    return <span className="text-xs italic text-muted-foreground">Indisponível</span>;
  }
  return <span className="font-semibold">{formatCurrency(valor)}</span>;
}

/** M6.4 — célula de baixa: só oferece a ação para título elegível. */
function BaixaCell({ linha, onBaixar }) {
  const elegivel = tituloElegivelParaBaixa(linha);
  if (!onBaixar || !elegivel.elegivel) {
    return (
      <span className="text-xs text-muted-foreground/70 whitespace-nowrap" title={elegivel.motivo}>
        —
      </span>
    );
  }
  return (
    <button
      onClick={() => onBaixar(linha)}
      className="px-2.5 py-1 text-[11px] font-semibold border border-emerald-300 text-emerald-700 rounded-lg hover:bg-emerald-50 whitespace-nowrap"
    >
      Registrar baixa
    </button>
  );
}

function Motivos({ linha }) {
  const motivos = linha.motivos || [];
  if (motivos.length === 0) return null;
  const cor = linha.inconsistente ? 'text-red-600' : 'text-amber-600';
  return (
    <span className={`block mt-1 text-[11px] leading-tight ${cor} max-w-[190px] truncate`} title={motivos.join(' · ')}>
      {motivos[0]}
      {motivos.length > 1 && ` +${motivos.length - 1}`}
    </span>
  );
}

export default function TitulosTable({ linhas, ordem, onOrdenar, onBaixar }) {
  return (
    <DataTable>
      <TableHead>
        <Th>Título</Th>
        <Th>Cedente</Th>
        <Th className="hidden lg:table-cell">Sacado</Th>
        <Th className="hidden md:table-cell">Operação</Th>
        <Th>
          <button onClick={onOrdenar} className="inline-flex items-center gap-1 uppercase tracking-wider hover:text-foreground">
            Vencimento <ArrowUpDown className="w-3 h-3" />
            <span className="sr-only">{ordem === 'asc' ? 'crescente' : 'decrescente'}</span>
          </button>
        </Th>
        <Th right>Valor de face</Th>
        <Th>Situação</Th>
        <Th className="hidden xl:table-cell">Cobrança</Th>
        <Th className="hidden md:table-cell">Origem</Th>
        <Th right className="hidden xl:table-cell">Saldo da operação</Th>
        <Th right>Baixa</Th>
      </TableHead>
      <TableBody>
        {linhas.map((linha) => (
          <Tr key={linha.id}>
            <Td className="whitespace-nowrap">
              <div className="font-semibold text-foreground">{linha.numero !== null ? linha.numero : 'Sem número'}</div>
              <div className="text-[11px] text-muted-foreground">
                {linha.tipo || 'Tipo indisponível'} · {linha.origem_label}
              </div>
            </Td>
            <Td className="max-w-[160px] truncate">{linha.cliente_nome || '—'}</Td>
            <Td muted className="hidden lg:table-cell max-w-[150px] truncate">{linha.sacado_nome || '—'}</Td>
            <Td muted className="hidden md:table-cell whitespace-nowrap">
              {linha.operacao_numero !== null && linha.operacao_numero !== undefined ? `#${linha.operacao_numero}` : '—'}
            </Td>
            <Td className="whitespace-nowrap">{linha.vencimento ? formatDate(linha.vencimento) : 'Indisponível'}</Td>
            <Td right mono className="whitespace-nowrap"><Valor valor={linha.valor_face} /></Td>
            <Td>
              <SituacaoBadge situacao={linha.situacao} inconsistente={linha.inconsistente} />
              <Motivos linha={linha} />
            </Td>
            <Td className="hidden xl:table-cell"><CobrancaBadge cobranca={linha.cobranca} /></Td>
            <Td muted className="hidden md:table-cell text-[11px] whitespace-nowrap">
              {linha.origem_label}
              <span className="block text-muted-foreground/80">{GRAU_LABEL[linha.grau_vinculo] || 'sem vínculo'}</span>
              {linha.evidencia_label && (
                <span className="block text-muted-foreground/70" title="Evidência de recebimento conferida no núcleo financeiro">
                  {linha.evidencia_label}
                </span>
              )}
            </Td>
            <Td right className="hidden xl:table-cell whitespace-nowrap" title="Saldo agregado da operação — não é saldo individual do título">
              {linha.saldo_operacao === null ? (
                <span className="text-xs italic text-muted-foreground">Indisponível</span>
              ) : (
                <span className="text-muted-foreground">{formatCurrency(linha.saldo_operacao)}</span>
              )}
            </Td>
            <Td right>
              <BaixaCell linha={linha} onBaixar={onBaixar} />
            </Td>
          </Tr>
        ))}
        {linhas.length === 0 && <EmptyRow colSpan={11} message="Nenhum título encontrado com os filtros atuais." />}
      </TableBody>
    </DataTable>
  );
}