import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { CheckSquare, Square, CheckCircle2, CornerUpLeft, X, ArrowUpDown, ArrowUp, ArrowDown, MoreVertical } from 'lucide-react';
import { formatCurrency, formatDate, today } from '@/lib/finance';
import StatusBadge from '@/components/ui/StatusBadge';
import RetornarDepartamentoModal from '@/components/cheque/RetornarDepartamentoModal';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import Pagination from '@/components/ui/Pagination';
import { logAction } from '@/lib/audit';
import { syncChequeCompensation, syncChequeReversal } from '@/lib/syncCheque';

export default function BancoChequeTab({ banco, cheques = [], onReload }) {
  const [selected, setSelected] = useState(new Set());
  const [filterStatus, setFilterStatus] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [retornarModal, setRetornarModal] = useState(null);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState(null); // { current, total, label }
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sort, setSort] = useState({ field: 'compensation_date', dir: 'asc' });
  const [menuOpenId, setMenuOpenId] = useState(null);

  // Confirm dialog state
  const [confirm, setConfirm] = useState({ open: false });
  const [pendingAction, setPendingAction] = useState(null);

  // Filtra pelo mesmo critério do cabeçalho do drawer (consistência visual)
  const bancoCheques = cheques.filter(c =>
    c.deposited_bank_id === banco.id || c.deposited_bank_name === banco.name
  );

  const refresh = () => {
    setSelected(new Set());
    if (onReload) onReload();
  };

  const toggleSelect = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    const visible = paginated.map(c => c.id);
    if (selected.size === visible.length && visible.every(id => selected.has(id))) {
      setSelected(new Set());
    } else {
      setSelected(new Set(visible));
    }
  };

  // ── Core actions ──────────────────────────────────────────────────────────

  const doCompensar = async (cheque) => {
    setSaving(true);
    await base44.entities.Cheque.update(cheque.id, {
      status: 'compensado',
      custody_status: 'financeiro',
      deposited_bank_id: banco.id,
      deposited_bank_name: banco.name,
    });
    await base44.entities.Banco.update(banco.id, {
      current_balance: (banco.current_balance || 0) + (cheque.value || 0),
    });
    await base44.entities.CashFlow.create({
      type: 'entrada',
      category: 'compensacao_cheque',
      amount: cheque.value,
      date: today(),
      description: `Compensação cheque #${cheque.check_number} — ${cheque.client_name} (Banco: ${banco.name})`,
      method: 'cheque',
    });
    await logAction({
      action: 'compensar',
      entity: 'Cheque',
      entityId: cheque.id,
      description: `Cheque #${cheque.check_number} (${cheque.client_name}) compensado no banco ${banco.name} — Valor: ${formatCurrency(cheque.value)}`,
      before: { status: 'pendente' },
      after: { status: 'compensado', banco: banco.name, valor: cheque.value },
    });
    await syncChequeCompensation({ ...cheque, status: 'compensado' });
    setSaving(false);
    refresh();
  };

  const doBulkCompensar = async (chequesToProcess) => {
    setSaving(true);
    setProgress({ current: 0, total: chequesToProcess.length, label: 'Iniciando...' });
    let newBalance = banco.current_balance || 0;
    for (let i = 0; i < chequesToProcess.length; i++) {
      const cheque = chequesToProcess[i];
      setProgress({ current: i, total: chequesToProcess.length, label: `Cheque #${cheque.check_number} — ${cheque.client_name}` });
      await base44.entities.Cheque.update(cheque.id, {
        status: 'compensado',
        custody_status: 'financeiro',
        deposited_bank_id: banco.id,
        deposited_bank_name: banco.name,
      });
      await base44.entities.CashFlow.create({
        type: 'entrada',
        category: 'compensacao_cheque',
        amount: cheque.value,
        date: today(),
        description: `Compensação cheque #${cheque.check_number} — ${cheque.client_name} (Banco: ${banco.name})`,
        method: 'cheque',
      });
      await logAction({
        action: 'compensar',
        entity: 'Cheque',
        entityId: cheque.id,
        description: `[Lote] Cheque #${cheque.check_number} (${cheque.client_name}) compensado no banco ${banco.name} — Valor: ${formatCurrency(cheque.value)}`,
        before: { status: 'pendente' },
        after: { status: 'compensado', banco: banco.name, valor: cheque.value },
      });
      await syncChequeCompensation({ ...cheque, status: 'compensado' });
      newBalance += cheque.value || 0;
    }
    setProgress({ current: chequesToProcess.length, total: chequesToProcess.length, label: 'Concluído' });
    await base44.entities.Banco.update(banco.id, { current_balance: newBalance });
    setSelected(new Set());
    setSaving(false);
    setProgress(null);
    refresh();
  };

  const doReverter = async (cheque) => {
    setSaving(true);
    await base44.entities.Cheque.update(cheque.id, {
      status: 'pendente',
      custody_status: 'financeiro',
    });
    await base44.entities.Banco.update(banco.id, {
      current_balance: (banco.current_balance || 0) - (cheque.value || 0),
    });
    await base44.entities.CashFlow.create({
      type: 'saida',
      category: 'estorno_compensacao',
      amount: cheque.value,
      date: today(),
      description: `Estorno compensação cheque #${cheque.check_number} — ${cheque.client_name} (Banco: ${banco.name})`,
      method: 'cheque',
    });
    await logAction({
      action: 'reverter',
      entity: 'Cheque',
      entityId: cheque.id,
      description: `Compensação do cheque #${cheque.check_number} (${cheque.client_name}) revertida no banco ${banco.name}`,
      before: { status: 'compensado' },
      after: { status: 'pendente' },
    });
    await syncChequeReversal({ ...cheque, status: 'pendente' });
    setSaving(false);
    refresh();
  };

  // Reabrir cheque devolvido de volta para pendente (permite compensar no banco correto)
  const doReabrir = async (cheque) => {
    setSaving(true);
    await base44.entities.Cheque.update(cheque.id, {
      status: 'pendente',
      return_reason: '',
      notes: (cheque.notes ? cheque.notes + '\n' : '') +
        `[REABERTO em ${today()}] Cheque retornou para pendente (motivo anterior: ${cheque.return_reason || 'devolvido'}). Banco destino: ${banco.name}.`,
    });
    await logAction({
      action: 'reabrir',
      entity: 'Cheque',
      entityId: cheque.id,
      description: `Cheque #${cheque.check_number} (${cheque.client_name}) reaberto de "devolvido" para "pendente" no banco ${banco.name}`,
      before: { status: 'devolvido' },
      after: { status: 'pendente', banco: banco.name },
    });
    setSaving(false);
    refresh();
  };

  // ── Confirm wrappers ──────────────────────────────────────────────────────

  const askCompensar = (cheque) => {
    setPendingAction({ type: 'compensar_single', cheque });
    setConfirm({
      open: true,
      title: 'Compensar Cheque',
      message: `Confirmar compensação do cheque #${cheque.check_number} de ${cheque.client_name} — ${formatCurrency(cheque.value)}? O valor será creditado no banco ${banco.name}.`,
      confirmLabel: 'Compensar',
      variant: 'default',
    });
  };

  const askBulkCompensar = () => {
    const pendentes = selectedCheques.filter(c => c.status === 'pendente');
    const total = pendentes.reduce((s, c) => s + (c.value || 0), 0);
    setPendingAction({ type: 'compensar_lote', cheques: pendentes });
    setConfirm({
      open: true,
      title: 'Compensação em Lote',
      message: `Compensar ${pendentes.length} cheque(s) selecionado(s) totalizando ${formatCurrency(total)}? Todos serão creditados no banco ${banco.name}.`,
      confirmLabel: 'Compensar Todos',
      variant: 'default',
    });
  };

  const askReverter = (cheque) => {
    setPendingAction({ type: 'reverter', cheque });
    setConfirm({
      open: true,
      title: 'Reverter Compensação',
      message: `Reverter a compensação do cheque #${cheque.check_number} de ${cheque.client_name} — ${formatCurrency(cheque.value)}? O valor será debitado do banco ${banco.name}.`,
      confirmLabel: 'Reverter',
      variant: 'danger',
    });
  };

  const askReabrir = (cheque) => {
    setPendingAction({ type: 'reabrir', cheque });
    setConfirm({
      open: true,
      title: 'Reabrir Cheque Devolvido',
      message: `Reabrir o cheque #${cheque.check_number} de ${cheque.client_name} — ${formatCurrency(cheque.value)}? O status voltará para "pendente" e poderá ser compensado no banco ${banco.name}.`,
      confirmLabel: 'Reabrir',
      variant: 'default',
    });
  };

  const handleConfirm = async () => {
    setConfirm({ open: false });
    if (!pendingAction) return;
    if (pendingAction.type === 'compensar_single') await doCompensar(pendingAction.cheque);
    else if (pendingAction.type === 'compensar_lote') await doBulkCompensar(pendingAction.cheques);
    else if (pendingAction.type === 'reverter') await doReverter(pendingAction.cheque);
    else if (pendingAction.type === 'reabrir') await doReabrir(pendingAction.cheque);
    setPendingAction(null);
  };

  // ── Derived data ──────────────────────────────────────────────────────────

  const filteredRaw = bancoCheques.filter(c => {
    if (filterStatus === 'resolvido') {
      if (!['resolvido_pago', 'resolvido_substituido', 'resolvido_prorrogado'].includes(c.status)) return false;
    } else if (filterStatus && c.status !== filterStatus) return false;
    const dateRef = c.compensation_date || '';
    if (filterDateFrom && dateRef < filterDateFrom) return false;
    if (filterDateTo && dateRef > filterDateTo) return false;
    return true;
  });

  const sortValue = (c, field) => {
    if (field === 'client_name') return (c.client_name || '').toLowerCase();
    if (field === 'bank_info') return (c.bank_name || '').toLowerCase();
    if (field === 'value') return c.value || 0;
    if (field === 'compensation_date') return c.compensation_date || '';
    if (field === 'status') return c.status || '';
    return '';
  };

  const filtered = [...filteredRaw].sort((a, b) => {
    const va = sortValue(a, sort.field);
    const vb = sortValue(b, sort.field);
    let cmp = 0;
    if (va < vb) cmp = -1;
    else if (va > vb) cmp = 1;
    return sort.dir === 'desc' ? -cmp : cmp;
  });

  const toggleSort = (field) => {
    setSort(prev => prev.field === field
      ? { field, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
      : { field, dir: 'asc' });
  };

  const SortIcon = ({ field }) => {
    if (sort.field !== field) return <ArrowUpDown className="w-3 h-3 opacity-30" />;
    return sort.dir === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />;
  };

  // Paginação
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paginated = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  // Reset da página quando filtros ou ordenação mudam
  useEffect(() => { setPage(1); }, [filterStatus, filterDateFrom, filterDateTo, banco.id, sort.field, sort.dir]);

  const selectedCheques = filtered.filter(c => selected.has(c.id));
  const totalSelected = selectedCheques.reduce((s, c) => s + (c.value || 0), 0);
  const pendentesSelected = selectedCheques.filter(c => c.status === 'pendente');

  const totalDeposited = bancoCheques.filter(c => c.status === 'pendente').reduce((s, c) => s + (c.value || 0), 0);
  const totalCompensados = bancoCheques.filter(c => c.status === 'compensado').reduce((s, c) => s + (c.value || 0), 0);
  const totalDevolvidos = bancoCheques.filter(c => c.status === 'devolvido').reduce((s, c) => s + (c.value || 0), 0);
  const totalResolvidos = bancoCheques.filter(c => ['resolvido_pago', 'resolvido_substituido', 'resolvido_prorrogado'].includes(c.status)).reduce((s, c) => s + (c.value || 0), 0);

  return (
    <div className="space-y-4">
      <ConfirmDialog
        open={confirm.open}
        title={confirm.title}
        message={confirm.message}
        confirmLabel={confirm.confirmLabel}
        variant={confirm.variant}
        onConfirm={handleConfirm}
        onCancel={() => { setConfirm({ open: false }); setPendingAction(null); }}
      />

      {retornarModal && (
        <RetornarDepartamentoModal
          cheques={Array.isArray(retornarModal) ? retornarModal : [retornarModal]}
          banco={banco}
          onClose={() => setRetornarModal(null)}
          onSaved={() => { setSelected(new Set()); onReload?.(); }}
        />
      )}

      {/* Progresso da compensação em lote */}
      {progress && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-foreground">Compensando cheques</h3>
                <p className="text-xs text-muted-foreground truncate">{progress.label}</p>
              </div>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs font-medium">
                <span className="text-muted-foreground">Progresso</span>
                <span className="text-foreground">{progress.current} / {progress.total}</span>
              </div>
              <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 rounded-full transition-all duration-300 ease-out"
                  style={{ width: `${progress.total > 0 ? (progress.current / progress.total) * 100 : 0}%` }}
                />
              </div>
              <div className="text-xs text-muted-foreground text-right">
                {progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0}%
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Resumo */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Aguardando', value: totalDeposited, count: bancoCheques.filter(c => c.status === 'pendente').length, cls: 'bg-blue-50 border-blue-200 text-blue-600', valCls: 'text-blue-800', key: 'pendente' },
          { label: 'Compensados', value: totalCompensados, count: bancoCheques.filter(c => c.status === 'compensado').length, cls: 'bg-emerald-50 border-emerald-200 text-emerald-600', valCls: 'text-emerald-800', key: 'compensado' },
          { label: 'Devolvidos', value: totalDevolvidos, count: bancoCheques.filter(c => c.status === 'devolvido').length, cls: 'bg-red-50 border-red-200 text-red-600', valCls: 'text-red-800', key: 'devolvido' },
          { label: 'Resolvidos', value: totalResolvidos, count: bancoCheques.filter(c => ['resolvido_pago', 'resolvido_substituido', 'resolvido_prorrogado'].includes(c.status)).length, cls: 'bg-purple-50 border-purple-200 text-purple-600', valCls: 'text-purple-800', key: 'resolvido' },
        ].map(card => (
          <div key={card.key} onClick={() => setFilterStatus(f => f === card.key ? '' : card.key)}
            className={`border rounded-xl p-3 cursor-pointer hover:opacity-80 transition-opacity ${card.cls} ${filterStatus === card.key ? 'ring-2 ring-offset-1 ring-current' : ''}`}>
            <div className="text-xs font-medium">{card.label}</div>
            <div className={`text-lg font-bold mt-0.5 ${card.valCls}`}>{formatCurrency(card.value)}</div>
            <div className="text-xs">{card.count} cheque(s)</div>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="bg-white border border-border rounded-xl p-4 space-y-3">
        {/* Linha 1: período */}
        <div className="flex items-end gap-2 flex-wrap">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">De</label>
            <input type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)}
              className="text-sm border border-border rounded-lg px-3 py-2 h-9" />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Até</label>
            <input type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)}
              className="text-sm border border-border rounded-lg px-3 py-2 h-9" />
          </div>
          <button onClick={() => { const now = new Date(); setFilterDateFrom(new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]); setFilterDateTo(new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0]); }}
            className="h-9 px-3 text-xs font-medium border border-border rounded-lg hover:bg-gray-50 text-muted-foreground">
            Mês Atual
          </button>
          {(filterDateFrom || filterDateTo) && (
            <button onClick={() => { setFilterDateFrom(''); setFilterDateTo(''); }}
              className="h-9 flex items-center gap-1.5 px-3 text-xs text-red-600 border border-red-200 rounded-lg hover:bg-red-50">
              <X className="w-3.5 h-3.5" /> Limpar
            </button>
          )}
        </div>

        {/* Linha 2: status como botões destacados */}
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-2">Status</label>
          <div className="flex gap-2 flex-wrap">
            {[
              { key: '', label: 'Todos', cls: 'border-border text-foreground', activeCls: 'bg-foreground text-primary-foreground border-foreground' },
              { key: 'pendente', label: 'Aguardando', cls: 'border-amber-200 text-amber-700', activeCls: 'bg-amber-500 text-white border-amber-500' },
              { key: 'compensado', label: 'Compensados', cls: 'border-emerald-200 text-emerald-700', activeCls: 'bg-emerald-600 text-white border-emerald-600' },
              { key: 'devolvido', label: 'Devolvidos', cls: 'border-red-200 text-red-700', activeCls: 'bg-red-600 text-white border-red-600' },
              { key: 'resolvido', label: 'Resolvidos', cls: 'border-purple-200 text-purple-700', activeCls: 'bg-purple-600 text-white border-purple-600' },
            ].map(f => {
              const isActive = filterStatus === f.key;
              return (
                <button key={f.key}
                  onClick={() => { setFilterStatus(f.key); setSelected(new Set()); }}
                  className={`px-4 py-2 text-xs font-semibold rounded-lg border transition-colors ${isActive ? f.activeCls : `bg-white hover:bg-gray-50 ${f.cls}`}`}>
                  {f.label}
                  {f.key !== '' && (
                    <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full font-bold ${isActive ? 'bg-white/25' : 'bg-gray-100 text-muted-foreground'}`}>
                      {f.key === 'resolvido'
                        ? bancoCheques.filter(c => ['resolvido_pago', 'resolvido_substituido', 'resolvido_prorrogado'].includes(c.status)).length
                        : bancoCheques.filter(c => c.status === f.key).length}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Barra de ações em lote */}
      {selected.size > 0 && (
        <div className="flex items-center justify-between gap-3 bg-foreground text-primary-foreground rounded-xl px-4 py-3">
          <div className="text-sm font-semibold">
            {selected.size} selecionado{selected.size > 1 ? 's' : ''} — {formatCurrency(totalSelected)}
          </div>
          <div className="flex items-center gap-2">
            {pendentesSelected.length > 0 && (
              <button onClick={askBulkCompensar} disabled={saving}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-white rounded-lg text-xs font-semibold transition-colors disabled:opacity-50">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Compensar {pendentesSelected.length > 1 ? `(${pendentesSelected.length})` : ''}
              </button>
            )}
            <button onClick={() => setRetornarModal(selectedCheques)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-white rounded-lg text-xs font-semibold transition-colors">
              <CornerUpLeft className="w-3.5 h-3.5" /> Retornar do Banco
            </button>
            <button onClick={() => setSelected(new Set())} className="p-1.5 hover:bg-white/20 rounded-lg text-xs">
              Limpar
            </button>
          </div>
        </div>
      )}

      {/* Tabela */}
      {filtered.length === 0 ? (
        <div className="py-12 text-center text-muted-foreground">
          <p className="font-medium">Nenhum cheque nesta categoria</p>
        </div>
      ) : (
        <div className="bg-white border border-border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-gray-50/50">
                <th className="px-4 py-3 w-10">
                  <button onClick={toggleAll} className="text-muted-foreground hover:text-foreground">
                    {selected.size === filtered.length && filtered.length > 0
                      ? <CheckSquare className="w-4 h-4 text-foreground" />
                      : <Square className="w-4 h-4" />}
                  </button>
                </th>
                <th className="text-left px-3 py-3 text-xs font-medium text-muted-foreground">
                  <button onClick={() => toggleSort('client_name')} className="flex items-center gap-1 hover:text-foreground">
                    Cliente <SortIcon field="client_name" />
                  </button>
                </th>
                <th className="text-left px-3 py-3 text-xs font-medium text-muted-foreground">
                  <button onClick={() => toggleSort('bank_info')} className="flex items-center gap-1 hover:text-foreground">
                    Banco Emissor / Nº <SortIcon field="bank_info" />
                  </button>
                </th>
                <th className="text-right px-3 py-3 text-xs font-medium text-muted-foreground">
                  <button onClick={() => toggleSort('value')} className="flex items-center gap-1 ml-auto hover:text-foreground">
                    Valor <SortIcon field="value" />
                  </button>
                </th>
                <th className="text-left px-3 py-3 text-xs font-medium text-muted-foreground">
                  <button onClick={() => toggleSort('compensation_date')} className="flex items-center gap-1 hover:text-foreground">
                    Compensação <SortIcon field="compensation_date" />
                  </button>
                </th>
                <th className="px-3 py-3 w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {paginated.map((c, idx) => {
                const isSelected = selected.has(c.id);
                const isLastRow = idx === paginated.length - 1;
                const rowColor = {
                  pendente: 'bg-amber-50/70',
                  compensado: 'bg-emerald-50/70',
                  devolvido: 'bg-red-50/70',
                  resolvido_pago: 'bg-emerald-50/70',
                  resolvido_substituido: 'bg-blue-50/70',
                  resolvido_prorrogado: 'bg-purple-50/70',
                  cancelado: 'bg-gray-100/70',
                }[c.status] || 'bg-white';
                const isOpen = menuOpenId === c.id;
                return (
                  <tr key={c.id} className={`transition-colors ${rowColor} ${isSelected ? 'ring-2 ring-inset ring-blue-400' : ''}`}>
                    <td className="px-4 py-3">
                      <button onClick={() => toggleSelect(c.id)} className="text-muted-foreground hover:text-foreground">
                        {isSelected ? <CheckSquare className="w-4 h-4 text-blue-600" /> : <Square className="w-4 h-4" />}
                      </button>
                    </td>
                    <td className="px-3 py-3 font-medium text-sm">{c.client_name}</td>
                    <td className="px-3 py-3 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">{c.bank_name}</span>
                      <span className="mx-1">·</span>
                      <span className="font-mono">#{c.check_number}</span>
                    </td>
                    <td className="px-3 py-3 text-right font-mono font-semibold text-sm">{formatCurrency(c.value)}</td>
                    <td className="px-3 py-3 text-sm">{formatDate(c.compensation_date)}</td>
                    <td className="px-3 py-3 relative">
                      <button
                        onClick={() => setMenuOpenId(isOpen ? null : c.id)}
                        className="p-1.5 rounded-lg hover:bg-black/10 text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <MoreVertical className="w-4 h-4" />
                      </button>
                      {isOpen && (
                        <>
                          <div className="fixed inset-0 z-30" onClick={() => setMenuOpenId(null)} />
                          <div className={`absolute right-0 ${isLastRow ? 'bottom-full mb-1' : 'top-full mt-1'} z-40 w-44 bg-white border border-border rounded-lg shadow-lg py-1`}>
                            {c.status === 'pendente' && (
                              <>
                                <button onClick={() => { setMenuOpenId(null); askCompensar(c); }} disabled={saving}
                                  className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-50 text-left">
                                  <CheckCircle2 className="w-3.5 h-3.5" /> Compensar
                                </button>
                                <button onClick={() => { setMenuOpenId(null); setRetornarModal(c); }}
                                  className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-amber-700 hover:bg-amber-50 text-left">
                                  <CornerUpLeft className="w-3.5 h-3.5" /> Devolver
                                </button>
                              </>
                            )}
                            {c.status === 'compensado' && (
                              <button onClick={() => { setMenuOpenId(null); askReverter(c); }} disabled={saving}
                                className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 text-left">
                                <CornerUpLeft className="w-3.5 h-3.5" /> Reverter
                              </button>
                            )}
                            {c.status === 'devolvido' && (
                              <button onClick={() => { setMenuOpenId(null); askReabrir(c); }} disabled={saving}
                                className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-50 text-left">
                                <CheckCircle2 className="w-3.5 h-3.5" /> Reabrir
                              </button>
                            )}
                            {['resolvido_pago', 'resolvido_substituido', 'resolvido_prorrogado', 'cancelado'].includes(c.status) && (
                              <div className="px-3 py-2 text-xs text-muted-foreground italic">Sem ações disponíveis</div>
                            )}
                          </div>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filtered.length > pageSize && (
            <Pagination
              page={safePage}
              totalPages={totalPages}
              total={filtered.length}
              pageSize={pageSize}
              onPageChange={setPage}
              onPageSizeChange={(s) => { setPageSize(s); setPage(1); }}
              itemName="cheques"
            />
          )}
        </div>
      )}
    </div>
  );
}