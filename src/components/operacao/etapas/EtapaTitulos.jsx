import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, SlidersHorizontal, FileEdit } from 'lucide-react';
import EtapaCabecalho from '@/components/operacao/etapas/EtapaCabecalho';
import TitulosGrade from '@/components/operacao/etapas/TitulosGrade';
import AdicionarTituloModal from '@/components/operacao/AdicionarTituloModal';
import EditarCondicoesModal from '@/components/operacao/EditarCondicoesModal';
import { DataTable, TableHead, Th, TableBody, Tr, Td, EmptyRow } from '@/components/ui/DataTable';
import StatusBadge from '@/components/ui/StatusBadge';
import { formatCurrency, formatDate } from '@/lib/finance';

/**
 * ETAPA 3 — Confirmação dos títulos.
 *
 * É a última parada em que o conteúdo da operação pode ser ajustado: incluir e
 * remover títulos, trocar o cedente e revisar as condições. Depois desta etapa
 * o que existe é o que segue para formalização.
 */
export default function EtapaTitulos({ operacao, cheques = [], canManage = true, onUpdate }) {
  const navigate = useNavigate();
  const [showAdd, setShowAdd] = useState(false);
  const [showCondicoes, setShowCondicoes] = useState(false);
  const agenda = Array.isArray(operacao.installment_schedule) ? operacao.installment_schedule : [];

  return (
    <div className="space-y-3">
      <EtapaCabecalho
        numero={3}
        titulo="Confirmação dos títulos"
        descricao="Ajuste o que for necessário: incluir ou remover títulos, alterar o cedente e revisar as condições. Depois desta etapa a operação segue para a formalização."
      />

      {canManage && (
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setShowAdd(true)} className="inline-flex items-center gap-1.5 px-3 py-2 bg-foreground text-primary-foreground text-xs font-semibold rounded-lg hover:bg-foreground/90">
            <Plus className="w-3.5 h-3.5" /> Adicionar título
          </button>
          <button onClick={() => setShowCondicoes(true)} className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border border-border rounded-lg hover:bg-gray-50">
            <SlidersHorizontal className="w-3.5 h-3.5" /> Editar condições
          </button>
          <button onClick={() => navigate(`/operacoes/${operacao.id}/editar`)} className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border border-border rounded-lg hover:bg-gray-50">
            <FileEdit className="w-3.5 h-3.5" /> Editar cedente e títulos
          </button>
        </div>
      )}

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

      {showAdd && (
        <AdicionarTituloModal
          operacao={operacao}
          cheques={cheques}
          onClose={() => setShowAdd(false)}
          onSaved={() => { setShowAdd(false); onUpdate?.(); }}
        />
      )}
      {showCondicoes && (
        <EditarCondicoesModal
          operacao={operacao}
          cheques={cheques}
          onClose={() => setShowCondicoes(false)}
          onSaved={() => { setShowCondicoes(false); onUpdate?.(); }}
        />
      )}
    </div>
  );
}