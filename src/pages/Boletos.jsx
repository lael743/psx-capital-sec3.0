import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { formatCurrency, formatDate } from '@/lib/finance';
import { Plus, Search, FileText, ChevronDown, ChevronRight, QrCode, Loader2 } from 'lucide-react';
import StatusBadge from '@/components/ui/StatusBadge';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import AsaasBatchModal from '@/components/asaas/AsaasBatchModal';
import { fetchAll } from '@/lib/fetchAll';

export default function Boletos() {
  const [operacoes, setOperacoes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [showBatch, setShowBatch] = useState(false);
  const [generatingOp, setGeneratingOp] = useState(null);
  const [confirm, setConfirm] = useState({ open: false, title: '', message: '', confirmLabel: 'Confirmar', onConfirm: null });

  useEffect(() => {
    fetchAll('Operation', '-created_date').then(ops => {
      const boletos = ops.filter(o => (o.type === 'boleto' || o.type === 'emprestimo') && o.etapa !== 'rejeitada');
      setOperacoes(boletos);
      setLoading(false);
    });
  }, []);

  const filtered = operacoes.filter(o => {
    if (!search) return true;
    const q = search.toLowerCase();
    return [o.client_name, o.sacado_name, String(o.numero_operacao || '')].some(v => (v || '').toLowerCase().includes(q));
  });

  const totalReceber = filtered.reduce((s, o) => s + (o.total_receivable || o.gross_value || 0), 0);
  const totalLiquido = filtered.reduce((s, o) => s + (o.net_value || 0), 0);

  const handleGenerateOp = (op) => {
    setConfirm({
      open: true,
      title: 'Gerar Cobranças',
      message: `Gerar cobranças PIX no Asaas para a operação #${String(op.numero_operacao || '').padStart(6, '0')}?`,
      confirmLabel: 'Gerar',
      onConfirm: () => { setConfirm(c => ({ ...c, open: false })); doGenerateOp(op); },
    });
  };

  const doGenerateOp = async (op) => {
    setGeneratingOp(op.id);
    try {
      await base44.functions.invoke("asaasCreateCharge", {
        operation_id: op.id,
        billing_type: "PIX",
        generate_all_parcels: true,
      });
      reloadOps();
    } catch (e) {
      alert("Erro ao gerar cobrança: " + (e.response?.data?.error || e.message));
    }
    setGeneratingOp(null);
  };

  const reloadOps = () => {
    fetchAll('Operation', '-created_date').then(ops => {
      setOperacoes(ops.filter(o => (o.type === 'boleto' || o.type === 'emprestimo') && o.etapa !== 'rejeitada'));
    });
  };

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <ConfirmDialog open={confirm.open} title={confirm.title} message={confirm.message} confirmLabel={confirm.confirmLabel} onConfirm={confirm.onConfirm} onCancel={() => setConfirm(c => ({ ...c, open: false }))} />
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold">Boletos & Empréstimos</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{filtered.length} operações · {formatCurrency(totalReceber)} a receber</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowBatch(true)}
            disabled={operacoes.length === 0}
            className="inline-flex items-center gap-2 px-4 py-2 border border-[hsl(43,65%,47%)] text-[hsl(43,65%,47%)] text-sm font-semibold rounded-lg hover:bg-amber-50 transition-colors disabled:opacity-40"
          >
            <QrCode className="w-4 h-4" /> Gerar Cobranças em Lote
          </button>
          <Link to="/operacoes/nova" className="inline-flex items-center gap-2 px-4 py-2 bg-foreground text-primary-foreground text-sm font-medium rounded-lg hover:bg-foreground/90 transition-colors">
            <Plus className="w-4 h-4" /> Nova Operação
          </Link>
        </div>
      </div>

      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input type="text" placeholder="Buscar por cliente, sacado, número..." value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-9 pr-4 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-ring" />
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="w-6 h-6 border-2 border-border border-t-foreground rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <FileText className="w-10 h-10 mx-auto mb-3 opacity-20" />
          <p className="font-medium">Nenhuma operação de boleto/empréstimo encontrada</p>
          <p className="text-sm mt-1">Crie uma nova operação selecionando um produto do tipo Boleto ou Empréstimo.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(op => (
            <div key={op.id} className="bg-white border border-border rounded-xl overflow-hidden">
              <div className="flex items-center justify-between p-4 hover:bg-gray-50/50 cursor-pointer gap-4" onClick={() => setExpanded(expanded === op.id ? null : op.id)}>
                <div className="flex items-center gap-3 min-w-0">
                  {op.installment_schedule?.length > 0 && (
                    expanded === op.id ? <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                  )}
                  <div className="text-sm font-mono text-muted-foreground shrink-0">#{String(op.numero_operacao || '').padStart(4, '0')}</div>
                  <div className="min-w-0">
                    <div className="font-semibold text-sm truncate">Cedente: {op.client_name || '—'}</div>
                    <div className="text-xs text-muted-foreground truncate">Sacado: {op.sacado_name || '—'}</div>
                  </div>
                </div>
                <div className="flex items-center gap-4 sm:gap-6 text-sm shrink-0">
                  <div className="text-right hidden sm:block">
                    <div className="text-[10px] text-muted-foreground uppercase">A Receber</div>
                    <div className="font-semibold text-xs">{formatCurrency(op.total_receivable || op.gross_value || 0)}</div>
                  </div>
                  <div className="text-right hidden md:block">
                    <div className="text-[10px] text-muted-foreground uppercase">Líquido</div>
                    <div className="font-semibold text-xs text-emerald-600">{formatCurrency(op.net_value || 0)}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] text-muted-foreground uppercase">Parcelas</div>
                    <div className="font-semibold text-xs">{op.installments || 0}x</div>
                  </div>
                  <StatusBadge status={op.status} />
                </div>
              </div>
              {expanded === op.id && op.installment_schedule?.length > 0 && (
                <div className="border-t border-border bg-gray-50/30 p-4">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="px-2 py-2 text-left font-semibold text-muted-foreground">Parcela</th>
                        <th className="px-2 py-2 text-left font-semibold text-muted-foreground">Vencimento</th>
                        <th className="px-2 py-2 text-right font-semibold text-muted-foreground">Valor</th>
                        <th className="px-2 py-2 text-right font-semibold text-muted-foreground">Dias</th>
                        <th className="px-2 py-2 text-left font-semibold text-muted-foreground">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {op.installment_schedule.map((inst, i) => (
                        <tr key={i} className="hover:bg-white">
                          <td className="px-2 py-1.5 font-medium">{inst.number}ª</td>
                          <td className="px-2 py-1.5">{formatDate(inst.due_date)}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums">{formatCurrency(inst.value)}</td>
                          <td className="px-2 py-1.5 text-right text-muted-foreground">{inst.days || '—'}d</td>
                          <td className="px-2 py-1.5">
                            <span className={`text-xs font-medium ${inst.status === 'paga' || inst.paid ? 'text-emerald-600' : 'text-amber-600'}`}>
                              {inst.status === 'paga' || inst.paid ? 'Paga' : 'Pendente'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="flex items-center justify-between mt-3">
                    <button
                      onClick={() => handleGenerateOp(op)}
                      disabled={generatingOp === op.id || !op.sacado_id}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-[hsl(43,65%,47%)] text-[hsl(43,65%,47%)] rounded-lg hover:bg-amber-50 disabled:opacity-40 transition-colors"
                      title={!op.sacado_id ? 'Operação sem sacado vinculado' : 'Gerar cobranças por parcela no Asaas'}
                    >
                      {generatingOp === op.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <QrCode className="w-3.5 h-3.5" />}
                      Gerar Cobrança Asaas
                    </button>
                    <Link to={`/operacoes/${op.id}`} className="inline-flex items-center gap-1 text-xs font-semibold text-[hsl(43,65%,47%)] hover:underline">
                      Ver detalhes da operação →
                    </Link>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {showBatch && (
        <AsaasBatchModal
          operacoes={operacoes}
          onClose={() => setShowBatch(false)}
          onDone={reloadOps}
        />
      )}
    </div>
  );
}