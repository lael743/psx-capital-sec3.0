import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { ArrowLeft, MessageCircle, AlertTriangle } from 'lucide-react';
import EtapaBadge from '@/components/operacao/EtapaBadge';
import StatusBadge from '@/components/ui/StatusBadge';
import WorkflowActions from '@/components/operacao/WorkflowActions';
import WorkflowStepper from '@/components/operacao/WorkflowStepper';
import OperacaoResumoSidebar from '@/components/operacao/OperacaoResumoSidebar';
import EtapaResumo from '@/components/operacao/etapas/EtapaResumo';
import EtapaAnalise from '@/components/operacao/etapas/EtapaAnalise';
import EtapaTitulos from '@/components/operacao/etapas/EtapaTitulos';
import EtapaDocumentos from '@/components/operacao/etapas/EtapaDocumentos';
import EtapaAssinaturas from '@/components/operacao/etapas/EtapaAssinaturas';
import EtapaPagamento from '@/components/operacao/etapas/EtapaPagamento';
import EtapaFinal from '@/components/operacao/etapas/EtapaFinal';
import { formatCurrency, formatDate, daysOverdue } from '@/lib/finance';
import { ViewModeProvider } from '@/lib/viewMode';

/**
 * A operação é conduzida POR ETAPAS: cada etapa tem a sua própria tela, e não
 * abas de conveniência. A etapa atual vem do workflow (autoridade do servidor),
 * o resumo financeiro acompanha em todas elas e nenhuma baixa de título ou
 * parcela acontece aqui — isso é da Central de Contas a Receber.
 */
const TELAS = {
  rascunho: EtapaResumo,
  analise_credito: EtapaAnalise,
  confirmacao_titulos: EtapaTitulos,
  formalizacao: EtapaDocumentos,
  assinatura: EtapaAssinaturas,
  pagamento: EtapaPagamento,
  finalizada: EtapaFinal,
};

/** Etapas em que o conteúdo da operação ainda pode ser ajustado. */
const EDICAO_LIBERADA = ['rascunho', 'analise_credito', 'confirmacao_titulos'];

export default function OperacaoDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [op, setOp] = useState(null);
  const [client, setClient] = useState(null);
  const [payments, setPayments] = useState([]);
  const [cheques, setCheques] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    Promise.all([
      base44.entities.Operation.get(id),
      base44.entities.Payment.filter({ operation_id: id }),
      base44.entities.Cheque.filter({ operation_id: id }),
      base44.entities.AuditLog.filter({ entity_id: id }, '-created_date', 50).catch(() => []),
    ]).then(([operation, pmts, chqs, logs]) => {
      setOp(operation);
      setPayments(pmts);
      setCheques(chqs);
      setAuditLogs(logs || []);
      if (operation?.client_id) {
        base44.entities.Client.get(operation.client_id).then(setClient).catch(() => setClient(null));
      }
      setLoading(false);
    }).catch(() => {
      setOp(null);
      setLoading(false);
    });
  };

  useEffect(() => { load(); }, [id]);

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-6 h-6 border-2 border-border border-t-foreground rounded-full animate-spin" />
    </div>
  );

  if (!op) return <div className="p-6 text-center text-muted-foreground">Operação não encontrada.</div>;

  const etapa = op.etapa || 'rascunho';
  const isFinalizada = etapa === 'finalizada';
  const isRejected = etapa === 'rejeitada';
  const podeEditar = !isRejected && EDICAO_LIBERADA.includes(etapa);
  const Tela = TELAS[etapa] || EtapaResumo;
  const overdue = daysOverdue(op.due_date);
  const balance = op.balance_due ?? ((op.total_receivable || 0) - (op.amount_paid || 0));
  const opNum = op.numero_operacao ? `#${String(op.numero_operacao).padStart(6, '0')}` : `#${id.slice(-6).toUpperCase()}`;

  const cobrar = () => {
    if (!client) return;
    const texto = encodeURIComponent(
      `Olá ${client.name}! Passando para lembrar que você possui um débito de ${formatCurrency(balance)} conosco, com vencimento em ${formatDate(op.due_date)}. Por favor, entre em contato para regularizar. Obrigado!`,
    );
    const num = (client.whatsapp || client.phone || '').replace(/\D/g, '');
    if (num) window.open(`https://wa.me/55${num}?text=${texto}`, '_blank');
  };

  return (
    <ViewModeProvider initialMode="interno">
      <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-4">
        {/* Cabeçalho */}
        <div className="flex items-start gap-3 flex-wrap">
          <button onClick={() => navigate('/operacoes')} className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold">Operação {opNum}</h1>
              <EtapaBadge etapa={etapa} />
              <StatusBadge status={op.type} />
            </div>
            <p className="text-sm text-muted-foreground mt-0.5 truncate">
              {op.client_name || 'Sem cedente'} — {formatDate(op.created_date)}
            </p>
          </div>
          {isFinalizada && client?.whatsapp && (
            <button onClick={cobrar} className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border border-emerald-200 text-emerald-600 bg-emerald-50 rounded-lg hover:bg-emerald-100 transition-colors">
              <MessageCircle className="w-3.5 h-3.5" /> Cobrar
            </button>
          )}
        </div>

        {isRejected && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-red-500 shrink-0" />
            <div className="flex-1">
              <span className="text-sm text-red-800 font-semibold">Operação rejeitada</span>
              <span className="text-sm text-red-700"> — bloqueada para edição, cobrança e assinaturas.</span>
            </div>
          </div>
        )}

        <WorkflowStepper currentEtapa={etapa} />

        {!isFinalizada && !isRejected && (
          <div className="bg-white border border-border rounded-xl p-3">
            <WorkflowActions operacao={op} podeEditar={podeEditar} onUpdate={load} />
          </div>
        )}

        {isFinalizada && overdue > 0 && op.status !== 'quitado' && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-red-500 shrink-0" />
            <div>
              <span className="text-sm text-red-700 font-semibold">{overdue} dias em atraso</span>
              <span className="text-sm text-red-600"> — Saldo devedor: {formatCurrency(balance)}</span>
            </div>
          </div>
        )}

        {/* Tela da etapa + resumo financeiro */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4 items-start">
          <div className="space-y-3 min-w-0">
            <Tela
              operacao={op}
              cheques={cheques}
              client={client}
              payments={payments}
              logs={auditLogs}
              canManage={podeEditar}
              onUpdate={load}
            />
          </div>
          <OperacaoResumoSidebar operacao={op} cheques={cheques} />
        </div>
      </div>
    </ViewModeProvider>
  );
}