import TitulosGrade from '@/components/operacao/etapas/TitulosGrade';
import { labelProduto } from '@/lib/produtoLabel';
import { formatCurrency, formatDate } from '@/lib/finance';

function Campo({ label, valor }) {
  return (
    <div>
      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className="text-sm font-semibold truncate">{valor || '—'}</p>
    </div>
  );
}

/**
 * ETAPA 1 — Resumo da operação com os títulos em grade detalhada.
 * É também a tela do rascunho: o que foi salvo, pronto para entrar no fluxo.
 */
export default function EtapaResumo({ operacao, cheques = [], client }) {
  const emRascunho = operacao.etapa === 'rascunho' || !operacao.etapa;
  const tarifas = (operacao.tarifa_operacao || 0) + (operacao.tarifa_por_titulo || 0) * cheques.length;

  return (
    <div className="space-y-3">
      {emRascunho && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-800">
          <strong>Rascunho.</strong> A operação está salva e ainda não entrou no fluxo. Use
          “Avançar” para começar as etapas.
        </div>
      )}

      <div className="bg-white border border-border rounded-xl p-5 space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Campo label="Cedente" valor={operacao.client_name || client?.name} />
          <Campo label="Documento" valor={client?.document} />
          <Campo label="Produto" valor={labelProduto(operacao)} />
          <Campo label="Taxa" valor={`${operacao.rate || 0}% a.m. (${operacao.interest_type || 'simples'})`} />
          <Campo label="Início" valor={formatDate(operacao.start_date)} />
          <Campo label="Vencimento" valor={formatDate(operacao.due_date)} />
          <Campo label="Prazo" valor={`${operacao.days || 0} dias`} />
          <Campo label="Parcelas" valor={`${operacao.installments || 1}x de ${formatCurrency(operacao.installment_value || 0)}`} />
          <Campo label="Tarifas" valor={formatCurrency(tarifas)} />
          <Campo label="Total a receber" valor={formatCurrency(operacao.total_receivable || 0)} />
          <Campo label="Valor liberado" valor={formatCurrency(operacao.net_value ?? operacao.gross_value ?? 0)} />
          <Campo label="Saldo em aberto" valor={formatCurrency(operacao.balance_due ?? 0)} />
        </div>
        {operacao.notes && (
          <div>
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Observações</p>
            <p className="text-xs text-muted-foreground mt-0.5 whitespace-pre-line">{operacao.notes}</p>
          </div>
        )}
      </div>

      <TitulosGrade cheques={cheques} />
    </div>
  );
}