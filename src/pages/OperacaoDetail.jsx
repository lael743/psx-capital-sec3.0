import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { ArrowLeft, DollarSign, MessageCircle, Plus, CheckCircle, AlertTriangle, Receipt, Clock, CalendarClock, ScrollText, FileText, Building2, TrendingUp, CreditCard } from 'lucide-react';
import ProrrogarChequeModal from '@/components/cheque/ProrrogarChequeModal';
import ChequeDevolvidoModal from '@/components/cheque/ChequeDevolvidoModal';
import ContratoModal from '@/components/operacao/ContratoModal';
import ContratoAssinadoPanel from '@/components/operacao/ContratoAssinadoPanel';
import NotificacaoStatusCard from '@/components/operacao/NotificacaoStatusCard';
import CessaoVinculoPanel from '@/components/operacao/CessaoVinculoPanel';
import StatusBadge from '@/components/ui/StatusBadge';
import EtapaBadge from '@/components/operacao/EtapaBadge';
import WorkflowActions from '@/components/operacao/WorkflowActions';
import WorkflowStepper from '@/components/operacao/WorkflowStepper';
import OperacaoResumoSidebar from '@/components/operacao/OperacaoResumoSidebar';
import { DataTable, TableHead, Th, TableBody, Tr, Td, EmptyRow } from '@/components/ui/DataTable';
import { formatCurrency, formatDate, daysOverdue } from '@/lib/finance';
import { logAction } from '@/lib/audit';
import { syncTitulosByOperacaoStatus } from '@/lib/syncCheque';
import { ViewModeProvider } from '@/lib/viewMode';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import ReciboModal from '@/components/ui/ReciboModal';
import AdicionarTituloModal from '@/components/operacao/AdicionarTituloModal';
import EditarCondicoesModal from '@/components/operacao/EditarCondicoesModal';
import AssinaturaColetaPanel from '@/components/operacao/AssinaturaColetaPanel';
import BancariosTab from '@/components/operacao/BancariosTab';
import OperacaoDocumentosPanel from '@/components/operacao/OperacaoDocumentosPanel';
import AsaasChargeCard from '@/components/asaas/AsaasChargeCard';
import SacadoInfoCard from '@/components/operacao/SacadoInfoCard';
import AssinaturaAsaasPanel from '@/components/operacao/AssinaturaAsaasPanel';

const STORAGE_KEY = 'psx_company_settings';
function getSettings() {
  try {return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');} catch {return {};}
}

const PRODUTO_LABEL = { cheque: 'Cheque', boleto: 'Duplicata', capital_desagio: 'Capital + Deságio', emprestimo: 'Empréstimo', assinatura: 'Assinatura' };

export default function OperacaoDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [op, setOp] = useState(null);
  const [client, setClient] = useState(null);
  const [payments, setPayments] = useState([]);
  const [cheques, setCheques] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('titulos');
  const [paymentForm, setPaymentForm] = useState({ amount: '', payment_date: new Date().toISOString().split('T')[0], method: 'pix', notes: '' });
  const [savingPayment, setSavingPayment] = useState(false);
  const [confirm, setConfirm] = useState({ open: false, title: '', message: '', onConfirm: null, variant: 'default' });
  const [reciboData, setReciboData] = useState({ open: false, payment: null });
  const [showContrato, setShowContrato] = useState(false);
  const [prorrogarCheque, setProrrogarCheque] = useState(null);
  const [resolverDevolvido, setResolverDevolvido] = useState(null);
  const [showAddTitulo, setShowAddTitulo] = useState(false);
  const [showEditarCondicoes, setShowEditarCondicoes] = useState(false);

  const settings = getSettings();

  const load = () => {
    Promise.all([
    base44.entities.Operation.get(id),
    base44.entities.Payment.filter({ operation_id: id }),
    base44.entities.Cheque.filter({ operation_id: id }),
    base44.entities.AuditLog.filter({ entity_id: id }, '-created_date', 50).catch(() => [])]
    ).then(([operation, pmts, chqs, logs]) => {
      setOp(operation);
      setPayments(pmts);
      setCheques(chqs);
      setAuditLogs(logs || []);
      if (operation?.type === 'assinatura') setTab('assinatura_asaas');
      if (operation?.client_id) {
        base44.entities.Client.get(operation.client_id).then(setClient);
      }
      setLoading(false);
    }).catch(() => {
      setOp(null);
      setLoading(false);
    });
  };

  useEffect(() => {load();}, [id]);

  const doRegisterPayment = async () => {
    if (!paymentForm.amount || !op) return;
    setSavingPayment(true);
    const amount = parseFloat(paymentForm.amount);
    const newAmountPaid = (op.amount_paid || 0) + amount;
    const newBalance = (op.total_receivable || 0) - newAmountPaid;
    const isFullyPaid = newBalance <= 0.01;
    const realizedProfit = isFullyPaid ? newAmountPaid - (op.gross_value || 0) - (op.capital_cost || 0) : op.realized_profit || 0;

    const created = await base44.entities.Payment.create({
      operation_id: id, client_id: op.client_id, client_name: op.client_name,
      amount, payment_date: paymentForm.payment_date, method: paymentForm.method,
      notes: paymentForm.notes, is_partial: !isFullyPaid
    });

    const updatedOp = { ...op, amount_paid: newAmountPaid, balance_due: Math.max(0, newBalance), status: isFullyPaid ? 'quitado' : op.status, realized_profit: realizedProfit };
    await base44.entities.Operation.update(id, { amount_paid: newAmountPaid, balance_due: Math.max(0, newBalance), status: isFullyPaid ? 'quitado' : op.status, realized_profit: realizedProfit });
    if (isFullyPaid) { await syncTitulosByOperacaoStatus(updatedOp); }
    await logAction({ action: 'payment', entity: 'Operation', entityId: id, description: `Pagamento de ${formatCurrency(amount)} registrado para ${op.client_name}` });

    const paymentRecord = { ...paymentForm, amount, id: created?.id, client_name: op.client_name };
    setPaymentForm({ amount: '', payment_date: new Date().toISOString().split('T')[0], method: 'pix', notes: '' });
    setSavingPayment(false);
    setOp(updatedOp);
    load();
    const show = settings.show_receipt_after_payment !== false;
    if (show) setReciboData({ open: true, payment: paymentRecord, operation: updatedOp });
  };

  const registerPayment = () => {
    if (!paymentForm.amount) return;
    const amount = parseFloat(paymentForm.amount);
    const useConfirm = settings.show_confirm_dialogs !== false;
    if (useConfirm) {
      setConfirm({ open: true, title: 'Confirmar Recebimento', message: `Registrar recebimento de ${formatCurrency(amount)} via ${paymentForm.method?.toUpperCase()}?`, onConfirm: () => {setConfirm((c) => ({ ...c, open: false }));doRegisterPayment();}, variant: 'default' });
    } else {doRegisterPayment();}
  };

  const generateWaMessage = (type) => {
    if (!client || !op) return;
    const msgs = {
      cobranca: `Olá ${client.name}! Passando para lembrar que você possui um débito de *${formatCurrency((op.total_receivable || 0) - (op.amount_paid || 0))}* com vencimento em *${formatDate(op.due_date)}* conosco. Por favor, entre em contato para regularizar. Obrigado!`,
      vencimento: `Olá ${client.name}! Informamos que sua operação no valor de *${formatCurrency(op.total_receivable)}* vence em *${formatDate(op.due_date)}*. Aguardamos seu pagamento!`
    };
    const text = encodeURIComponent(msgs[type]);
    const num = client.whatsapp?.replace(/\D/g, '') || client.phone?.replace(/\D/g, '');
    if (num) window.open(`https://wa.me/55${num}?text=${text}`, '_blank');
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-6 h-6 border-2 border-border border-t-foreground rounded-full animate-spin" />
    </div>);

  if (!op) return <div className="p-6 text-center text-muted-foreground">Operação não encontrada.</div>;

  const overdue = daysOverdue(op.due_date);
  const balance = op.balance_due ?? ((op.total_receivable || 0) - (op.amount_paid || 0));
  const isFinalizada = op.etapa === 'finalizada';
  const isRejected = op.etapa === 'rejeitada';
  const canManageTitulos = !isRejected && ['rascunho', 'nova', 'analise_credito', 'confirmacao_titulos', 'formalizacao'].includes(op.etapa || 'rascunho');
  const opNum = op.numero_operacao ? `#${String(op.numero_operacao).padStart(6, '0')}` : `#${id.slice(-6).toUpperCase()}`;
  const produtoLabel = PRODUTO_LABEL[op.produto || op.type] || 'Operação';
  const titulosAtivos = cheques.filter((c) => c.status === 'pendente' || c.status === 'compensado').length;

  const tabs = [
  { key: 'titulos', label: 'Títulos' },
  ...(op.type === 'assinatura' ? [{ key: 'assinatura_asaas', label: 'Assinatura Asaas' }] : []),
  { key: 'pagamentos', label: 'Pagamentos' },
  { key: 'parcelas', label: 'Parcelas' },
  { key: 'bancarios', label: 'Bancários' },
  { key: 'assinaturas', label: 'Assinaturas' },
  { key: 'documentos', label: 'Documentos' },
  ...(op.needs_contract ? [{ key: 'contrato', label: 'Contrato' }] : []),
  { key: 'historico', label: 'Histórico' }];


  const summaryCards = [
  { icon: FileText, label: 'Tipo', value: produtoLabel },
  { icon: Clock, label: 'Prazo Médio', value: `${op.days || 0} dias` },
  { icon: TrendingUp, label: 'Taxa Deságio', value: `${op.rate || 0}% a.m.` },
  { icon: Receipt, label: 'Títulos', value: `${titulosAtivos} ${titulosAtivos === 1 ? 'ativo' : 'ativos'}` },
  { icon: Building2, label: 'Cedente', value: op.client_name || '—', sub: client?.document },
  { icon: CreditCard, label: 'Financeiro', value: formatCurrency(op.total_receivable || 0), sub: `Líquido ${formatCurrency(op.net_value || op.gross_value || 0)}` }];


  return (
    <ViewModeProvider initialMode="interno">
      <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-4">
        <ConfirmDialog open={confirm.open} title={confirm.title} message={confirm.message} confirmLabel="Confirmar" variant={confirm.variant} onConfirm={confirm.onConfirm} onCancel={() => setConfirm((c) => ({ ...c, open: false }))} />
        {prorrogarCheque && <ProrrogarChequeModal cheque={prorrogarCheque} onClose={() => setProrrogarCheque(null)} onSaved={load} />}
        {resolverDevolvido && <ChequeDevolvidoModal cheque={resolverDevolvido} onClose={() => setResolverDevolvido(null)} onSaved={load} />}
        {showContrato && <ContratoModal operacao={{ ...op, cheques_data: cheques }} client={client} onClose={() => setShowContrato(false)} />}
        <ReciboModal open={reciboData.open} payment={reciboData.payment} operation={reciboData.operation || op} client={client} companyName={settings.company_name} onClose={() => setReciboData({ open: false, payment: null })} />
        {showAddTitulo && <AdicionarTituloModal operacao={op} cheques={cheques} onClose={() => setShowAddTitulo(false)} onSaved={() => {setShowAddTitulo(false);load();}} />}
        {showEditarCondicoes && <EditarCondicoesModal operacao={op} cheques={cheques} onClose={() => setShowEditarCondicoes(false)} onSaved={() => {setShowEditarCondicoes(false);load();}} />}

        {/* Header */}
        <div className="flex items-start gap-3 flex-wrap">
          <button onClick={() => navigate('/operacoes')} className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold">Operação {opNum}</h1>
              <EtapaBadge etapa={op.etapa || 'nova'} />
              <StatusBadge status={op.type} />
            </div>
            <p className="text-sm text-muted-foreground mt-0.5 truncate">{op.client_name} — {formatDate(op.created_date)}</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => navigate(`/contratos?operation_id=${id}`)} className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border border-blue-200 text-blue-700 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors">
              <ScrollText className="w-3.5 h-3.5" /> Nota Promissória
            </button>
            {client?.whatsapp &&
            <button onClick={() => generateWaMessage('cobranca')} className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border border-emerald-200 text-emerald-600 bg-emerald-50 rounded-lg hover:bg-emerald-100 transition-colors">
                <MessageCircle className="w-3.5 h-3.5" /> Cobrar
              </button>
            }
          </div>
        </div>

        {/* Rejected Banner */}
        {isRejected &&
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-red-500 shrink-0" />
            <div className="flex-1">
              <span className="text-sm text-red-800 font-semibold">Operação Rejeitada</span>
              <span className="text-sm text-red-700"> — Esta operação está bloqueada. Não é possível gerar cobranças, registrar pagamentos ou editar títulos.</span>
            </div>
          </div>
        }

        {/* Workflow Stepper */}
        <WorkflowStepper currentEtapa={op.etapa || 'nova'} />

        {/* Status Controls */}
        <div className="flex items-center justify-between gap-4 flex-wrap bg-white border border-border rounded-xl p-3">
          <WorkflowActions operacao={op} onUpdate={load} />
          



          
        </div>

        {/* Summary Panel */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {summaryCards.map((card) =>
          <div key={card.label} className="bg-white border border-border rounded-xl p-3 flex items-start gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center shrink-0">
                <card.icon className="w-4 h-4 text-muted-foreground" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{card.label}</p>
                <p className="text-sm font-bold truncate">{card.value}</p>
                {card.sub && <p className="text-[10px] text-muted-foreground truncate">{card.sub}</p>}
              </div>
            </div>
          )}
        </div>

        {/* Alerts */}
        {op.needs_contract && !op.contract_signed_confirmed &&
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center gap-3">
            <Clock className="w-5 h-5 text-amber-500 shrink-0" />
            <div className="flex-1">
              <span className="text-sm text-amber-800 font-semibold">Aguardando contrato assinado</span>
              <span className="text-sm text-amber-700"> — O repasse ao cliente está bloqueado até a confirmação.</span>
            </div>
            <button onClick={() => setTab('contrato')} className="text-xs font-semibold text-amber-700 underline whitespace-nowrap">Ver contrato →</button>
          </div>
        }
        {overdue > 0 && op.status !== 'quitado' && isFinalizada &&
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-red-500 shrink-0" />
            <div>
              <span className="text-sm text-red-700 font-semibold">{overdue} dias em atraso</span>
              <span className="text-sm text-red-600"> — Saldo devedor: {formatCurrency(balance)}</span>
            </div>
          </div>
        }

        {/* Sacado + Notificação (disponível desde a criação para boletos) */}
        {op.type === 'boleto' && (op.sacado_name || op.sacado_id) && <SacadoInfoCard operacao={op} onUpdate={load} />}
        {op.type === 'boleto' && (op.sacado_name || op.sacado_id) && <NotificacaoStatusCard operacao={op} client={client} onUpdate={load} />}
        {isFinalizada && <CessaoVinculoPanel operacao={op} client={client} />}

        {/* Main Content: Tabs + Sidebar */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-4">
          <div className="space-y-4">
            {/* Tabs */}
            <div className="flex gap-0.5 bg-gray-100 rounded-lg p-1 w-fit overflow-x-auto">
              {tabs.map((t) =>
              <button key={t.key} onClick={() => setTab(t.key)} className={`px-4 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${tab === t.key ? 'bg-white text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
                  {t.label}
                </button>
              )}
            </div>

            {/* Tab: Títulos */}
            {tab === 'titulos' &&
            <div className="space-y-3">
                <div className="flex justify-end">
                  {canManageTitulos &&
                <button onClick={() => setShowAddTitulo(true)} className="inline-flex items-center gap-2 px-3 py-2 bg-foreground text-primary-foreground text-xs font-semibold rounded-lg hover:bg-foreground/90 transition-colors">
                      <Plus className="w-3.5 h-3.5" /> Adicionar Título
                    </button>
                }
                </div>
                <DataTable>
                  <TableHead>
                    <Th>Tipo</Th><Th>Número</Th><Th>Sacado</Th><Th>Venc.</Th><Th right>Dias</Th><Th right>Face</Th><Th right>Deságio</Th><Th right>Desp.</Th><Th right>Líquido</Th><Th>Status</Th><Th />
                  </TableHead>
                  <TableBody>
                    {cheques.map((c) =>
                  <Tr key={c.id}>
                        <Td><span className="text-xs font-bold uppercase">{c.tipo === 'cheque' ? 'CHQ' : c.tipo === 'boleto' ? 'BOL' : 'DUP'}</span></Td>
                        <Td className="text-xs">{c.check_number}{c.nf && <span className="text-muted-foreground"> / NF: {c.nf}</span>}</Td>
                        <Td className="text-xs">{c.sacado_name || '—'}</Td>
                        <Td className="text-xs">{formatDate(c.compensation_date)}</Td>
                        <Td right className="text-xs">{c.dias || '—'}</Td>
                        <Td right mono className="text-xs">{formatCurrency(c.valor_face || c.value)}</Td>
                        <Td right mono className="text-xs text-red-600">{formatCurrency(c.desagio || 0)}</Td>
                        <Td right mono className="text-xs">{formatCurrency(c.outras_despesas || 0)}</Td>
                        <Td right mono className="text-xs font-semibold">{formatCurrency(c.liquido || 0)}</Td>
                        <Td><StatusBadge status={c.status} /></Td>
                        <Td>
                          <div className="flex items-center gap-1">
                            {c.status === 'pendente' && <button onClick={() => setProrrogarCheque(c)} className="p-1 rounded hover:bg-blue-50 text-blue-600" title="Prorrogar"><CalendarClock className="w-3.5 h-3.5" /></button>}
                            {c.status === 'devolvido' && <button onClick={() => setResolverDevolvido(c)} className="p-1 rounded hover:bg-red-50 text-red-600" title="Resolver"><AlertTriangle className="w-3.5 h-3.5" /></button>}
                          </div>
                        </Td>
                      </Tr>
                  )}
                    {cheques.length === 0 && <EmptyRow colSpan={11} message="Nenhum título vinculado." />}
                  </TableBody>
                </DataTable>
                {cheques.length > 0 &&
              <div className="flex justify-end gap-6 text-xs font-semibold border-t border-border pt-2">
                    <span>Total Face: <span className="font-mono">{formatCurrency(cheques.reduce((s, c) => s + (c.valor_face || c.value || 0), 0))}</span></span>
                    <span>Total Deságio: <span className="font-mono text-red-600">{formatCurrency(cheques.reduce((s, c) => s + (c.desagio || 0), 0))}</span></span>
                    <span>Total Líquido: <span className="font-mono text-emerald-600">{formatCurrency(cheques.reduce((s, c) => s + (c.liquido || 0), 0))}</span></span>
                  </div>
              }
              </div>
            }

            {/* Tab: Pagamentos */}
            {tab === 'pagamentos' &&
            <div className="space-y-4">
                {op.status !== 'quitado' && !isRejected &&
              <div className="bg-white border border-border rounded-xl p-4 space-y-3">
                    <h3 className="text-sm font-bold">Registrar Pagamento</h3>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1">Valor (R$)</label>
                        <input className="input-field" type="number" step="0.01" value={paymentForm.amount} onChange={(e) => setPaymentForm((f) => ({ ...f, amount: e.target.value }))} placeholder="0,00" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1">Data</label>
                        <input className="input-field" type="date" value={paymentForm.payment_date} onChange={(e) => setPaymentForm((f) => ({ ...f, payment_date: e.target.value }))} />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1">Método</label>
                        <select className="input-field" value={paymentForm.method} onChange={(e) => setPaymentForm((f) => ({ ...f, method: e.target.value }))}>
                          <option value="pix">PIX</option><option value="dinheiro">Dinheiro</option><option value="transferencia">Transferência</option><option value="cheque">Cheque</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1">Obs.</label>
                        <input className="input-field" value={paymentForm.notes} onChange={(e) => setPaymentForm((f) => ({ ...f, notes: e.target.value }))} />
                      </div>
                    </div>
                    <div className="flex justify-between items-center pt-2 border-t border-border flex-wrap gap-2">
                      <div className="text-sm text-muted-foreground">Saldo: <strong className="text-foreground">{formatCurrency(balance)}</strong></div>
                      <button onClick={registerPayment} disabled={savingPayment || !paymentForm.amount} className="inline-flex items-center gap-2 px-4 py-2 bg-foreground text-primary-foreground text-sm font-semibold rounded-lg disabled:opacity-50">
                        <CheckCircle className="w-4 h-4" /> {savingPayment ? 'Salvando...' : 'Confirmar Pagamento'}
                      </button>
                    </div>
                  </div>
              }
                <DataTable>
                  <TableHead><Th>Data</Th><Th right>Valor</Th><Th>Método</Th><Th>Obs.</Th><Th /></TableHead>
                  <TableBody>
                    {payments.map((p) =>
                  <Tr key={p.id}>
                        <Td muted className="text-xs">{formatDate(p.payment_date)}</Td>
                        <Td right mono className="font-semibold text-emerald-600 text-xs">{formatCurrency(p.amount)}</Td>
                        <Td className="text-xs capitalize">{p.method}</Td>
                        <Td muted className="text-xs">{p.notes || '—'}</Td>
                        <Td><button onClick={() => setReciboData({ open: true, payment: p, operation: op })} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><Receipt className="w-3.5 h-3.5" /> Recibo</button></Td>
                      </Tr>
                  )}
                    {payments.length === 0 && <EmptyRow colSpan={5} message="Nenhum pagamento registrado." />}
                  </TableBody>
                </DataTable>
              </div>
            }

            {/* Tab: Parcelas */}
            {tab === 'parcelas' &&
            <div className="space-y-4">
              <DataTable>
                <TableHead><Th>Parcela</Th><Th right>Valor</Th><Th>Vencimento</Th><Th>Status</Th><Th /></TableHead>
                <TableBody>
                  {(op.installment_schedule || []).map((inst, i) =>
                <Tr key={i}>
                      <Td className="font-semibold text-xs">{inst.number}ª parcela</Td>
                      <Td right mono className="text-xs">{formatCurrency(inst.value)}</Td>
                      <Td className="text-xs">{formatDate(inst.due_date)}</Td>
                      <Td><StatusBadge status={inst.paid ? 'quitado' : 'pendente'} /></Td>
                      <Td>{!inst.paid && op.status !== 'quitado' && !isRejected && <button onClick={() => {setPaymentForm((f) => ({ ...f, amount: String(inst.value), notes: `Parcela ${inst.number}` }));setTab('pagamentos');}} className="flex items-center gap-1 text-xs text-[hsl(43,65%,47%)] font-medium"><DollarSign className="w-3.5 h-3.5" /> Baixar</button>}</Td>
                    </Tr>
                )}
                  {(!op.installment_schedule || op.installment_schedule.length === 0) && <EmptyRow colSpan={5} message="Operação à vista (sem parcelas)." />}
                </TableBody>
              </DataTable>
              {!isRejected && <AsaasChargeCard operacao={op} onUpdate={load} />}
            </div>
            }

            {/* Tab: Bancários */}
            {tab === 'bancarios' &&
            <BancariosTab operacao={op} client={client} onUpdate={load} />
            }

            {/* Tab: Assinaturas */}
            {tab === 'assinaturas' && !isRejected &&
            <AssinaturaColetaPanel operacao={op} client={client} onUpdate={load} />
            }
            {tab === 'assinaturas' && isRejected &&
            <div className="bg-white border border-border rounded-xl p-8 text-center text-sm text-muted-foreground">
              <AlertTriangle className="w-8 h-8 mx-auto mb-2 text-red-300" />
              Assinaturas indisponíveis para operações rejeitadas.
            </div>
            }

            {/* Tab: Assinatura Asaas */}
            {tab === 'assinatura_asaas' && op.type === 'assinatura' && !isRejected &&
            <AssinaturaAsaasPanel operacao={op} onUpdate={load} />
            }
            {tab === 'assinatura_asaas' && isRejected &&
            <div className="bg-white border border-border rounded-xl p-8 text-center text-sm text-muted-foreground">
              <AlertTriangle className="w-8 h-8 mx-auto mb-2 text-red-300" />
              Assinaturas indisponíveis para operações rejeitadas.
            </div>
            }

            {/* Tab: Documentos */}
            {tab === 'documentos' &&
            <div className="bg-white border border-border rounded-xl p-5">
              <OperacaoDocumentosPanel mode="entity" operacao={op} onUpdate={load} />
            </div>
            }

            {/* Tab: Contrato */}
            {tab === 'contrato' && op.needs_contract && <ContratoAssinadoPanel operacao={op} onUpdate={load} />}

            {/* Tab: Histórico */}
            {tab === 'historico' &&
            <DataTable>
                <TableHead><Th>Data</Th><Th>Ação</Th><Th>Descrição</Th></TableHead>
                <TableBody>
                  {auditLogs.map((log) =>
                <Tr key={log.id}>
                      <Td muted className="text-xs">{formatDate(log.created_date)}</Td>
                      <Td className="text-xs"><span className="px-2 py-0.5 rounded-full bg-gray-100 text-muted-foreground capitalize">{log.action}</span></Td>
                      <Td className="text-xs">{log.description || '—'}</Td>
                    </Tr>
                )}
                  {auditLogs.length === 0 && <EmptyRow colSpan={3} message="Nenhum histórico registrado." />}
                </TableBody>
              </DataTable>
            }
          </div>

          {/* Right Sidebar */}
          <div>
            <OperacaoResumoSidebar operacao={op} cheques={cheques} onEditConditions={canManageTitulos ? () => setShowEditarCondicoes(true) : null} />
          </div>
        </div>
      </div>
    </ViewModeProvider>);

}