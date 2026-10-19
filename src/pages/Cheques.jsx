import { useEffect, useState } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Save, Plus, Filter, RefreshCw, Download, X, CalendarClock, DollarSign, Package, CheckCircle2, Image, MoreVertical, AlertTriangle, Search, ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';
import { logAction } from '@/lib/audit';
import { syncChequeCompensation } from '@/lib/syncCheque';
import { fetchAll } from '@/lib/fetchAll';
import TesourariaTab from '@/components/cheque/TesourariaTab';
import StatusBadge from '@/components/ui/StatusBadge';
import { formatCurrency, formatDate, today } from '@/lib/finance';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import Pagination from '@/components/ui/Pagination';
import { exportToCsv } from '@/lib/exportCsv';
import ProrrogarChequeModal from '@/components/cheque/ProrrogarChequeModal';
import ChequeDevolvidoModal from '@/components/cheque/ChequeDevolvidoModal';
import ReceberLucroProrrogacaoModal from '@/components/cheque/ReceberLucroProrrogacaoModal';
import ChequeImagensModal from '@/components/cheque/ChequeImagensModal';

const STORAGE_KEY = 'psx_company_settings';
function getSettings() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch { return {}; }
}

// Modal para troca/substituição de cheque devolvido
function TrocaChequeModal({ cheque, onClose, onSaved }) {
  const [form, setForm] = useState({
    resolve_type: 'novo_cheque',
    bank_name: '',
    check_number: '',
    new_date: '',
    new_value: cheque?.value || '',
    notes: '',
    bank_id: cheque?.deposited_bank_id || '',
  });
  const [bancos, setBancos] = useState([]);
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  useEffect(() => {
    base44.entities.Banco.filter({ active: true }, 'name', 100).then(bks => {
      setBancos(bks);
      if (!form.bank_id && bks.length > 0) {
        const def = bks.find(b => b.is_default_lucro) || bks[0];
        if (def) set('bank_id', def.id);
      }
    });
  }, []);

  const save = async () => {
    setSaving(true);
    if (form.resolve_type === 'novo_cheque') {
      const newCheque = await base44.entities.Cheque.create({
        operation_id: cheque.operation_id,
        client_id: cheque.client_id,
        client_name: cheque.client_name,
        bank_name: form.bank_name.toUpperCase(),
        check_number: form.check_number,
        value: parseFloat(form.new_value),
        compensation_date: form.new_date,
        notes: `Substituição do cheque #${cheque.check_number} devolvido. ${form.notes}`.trim(),
        status: 'pendente',
      });
      await base44.entities.Cheque.update(cheque.id, {
        return_reason: form.notes || `Substituído por cheque #${form.check_number}`,
        notes: (cheque.notes || '') + ` | SUBSTITUÍDO`,
      });
      await logAction({ action: 'update', entity: 'Cheque', entityId: cheque.id, description: `Cheque #${cheque.check_number} (${cheque.client_name}) substituído por novo cheque #${form.check_number}`, before: { status: cheque.status }, after: { status: 'substituido', novo_cheque: form.check_number } });
    } else {
      const methodLabel = form.resolve_type === 'pix' ? 'PIX' : form.resolve_type === 'dinheiro' ? 'Dinheiro' : 'Transferência';
      const methodKey = form.resolve_type === 'pix' ? 'pix' : form.resolve_type === 'dinheiro' ? 'dinheiro' : 'transferencia';
      const banco = bancos.find(b => b.id === form.bank_id);

      await base44.entities.Cheque.update(cheque.id, {
        status: 'resolvido_pago',
        return_reason: `Pago via ${methodLabel} em ${form.new_date}. ${form.notes}`.trim(),
        notes: (cheque.notes || '') + ` | PAGO VIA ${methodLabel.toUpperCase()} em ${form.new_date}`,
      });

      if (banco) {
        await base44.entities.Banco.update(form.bank_id, {
          current_balance: (banco.current_balance || 0) + (cheque.value || 0),
        });
        await base44.entities.CashFlow.create({
          type: 'entrada',
          category: 'recebimento_operacao',
          amount: cheque.value || 0,
          date: form.new_date,
          description: `Recebimento via ${methodLabel} — cheque devolvido #${cheque.check_number} (${cheque.client_name})${form.notes ? ' — ' + form.notes : ''}`,
          method: methodKey,
          operation_id: cheque.operation_id,
        });
      }

      await logAction({ action: 'status_change', entity: 'Cheque', entityId: cheque.id, description: `Cheque #${cheque.check_number} (${cheque.client_name}) resolvido via ${methodLabel} em ${form.new_date}${banco ? ` — Banco: ${banco.name}` : ''}`, before: { status: 'devolvido' }, after: { status: 'resolvido_pago', metodo: form.resolve_type } });
    }
    setSaving(false);
    onSaved();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <h3 className="text-sm font-bold">Troca / Resolução de Cheque</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Cheque #{cheque?.check_number} — {formatCurrency(cheque?.value)}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-2">Como o cliente vai resolver?</label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { value: 'novo_cheque', label: '🗒️ Novo Cheque', desc: 'Troca por outro cheque' },
                { value: 'pix', label: '⚡ PIX', desc: 'Pagamento via PIX' },
                { value: 'dinheiro', label: '💵 Dinheiro', desc: 'Pagamento em espécie' },
                { value: 'transferencia', label: '🏦 Transferência', desc: 'TED/DOC' },
              ].map(opt => (
                <button key={opt.value} type="button" onClick={() => set('resolve_type', opt.value)}
                  className={`text-left p-3 rounded-xl border-2 transition-colors ${form.resolve_type === opt.value ? 'border-foreground bg-gray-50' : 'border-border hover:bg-gray-50'}`}>
                  <div className="text-sm font-semibold">{opt.label}</div>
                  <div className="text-xs text-muted-foreground">{opt.desc}</div>
                </button>
              ))}
            </div>
          </div>
          {form.resolve_type === 'novo_cheque' && (
            <div className="space-y-3 p-4 bg-gray-50 rounded-xl">
              <div className="text-xs font-semibold text-muted-foreground uppercase">Dados do Novo Cheque</div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Banco *</label>
                  <input className="input-field uppercase" placeholder="BRADESCO" value={form.bank_name} onChange={e => set('bank_name', e.target.value.toUpperCase())} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Nº do Cheque *</label>
                  <input className="input-field" placeholder="000000" value={form.check_number} onChange={e => set('check_number', e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Valor (R$) *</label>
                  <input className="input-field" type="number" step="0.01" value={form.new_value} onChange={e => set('new_value', e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Data Compensação *</label>
                  <input className="input-field" type="date" value={form.new_date} onChange={e => set('new_date', e.target.value)} />
                </div>
              </div>
            </div>
          )}
          {form.resolve_type !== 'novo_cheque' && (
            <div className="space-y-3 p-4 bg-gray-50 rounded-xl">
              <div className="text-xs font-semibold text-muted-foreground uppercase">Dados do Pagamento</div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Data do Pagamento *</label>
                  <input className="input-field" type="date" value={form.new_date} onChange={e => set('new_date', e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Creditar no banco</label>
                  <select className="input-field" value={form.bank_id} onChange={e => set('bank_id', e.target.value)}>
                    <option value="">Selecionar...</option>
                    {bancos.map(b => <option key={b.id} value={b.id}>{b.name}{b.account ? ` — ${b.account}` : ''}</option>)}
                  </select>
                </div>
              </div>
              <div className="text-xs font-semibold text-foreground bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2 flex justify-between">
                <span>Valor a receber</span>
                <span className="text-emerald-700">{formatCurrency(cheque?.value)}</span>
              </div>
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Observações</label>
            <input className="input-field" placeholder="Motivo ou anotação..." value={form.notes} onChange={e => set('notes', e.target.value)} />
          </div>
        </div>
        <div className="flex justify-end gap-2 px-5 pb-5">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-gray-50">Cancelar</button>
          <button onClick={save}
            disabled={saving || !form.new_date || (form.resolve_type === 'novo_cheque' && (!form.bank_name || !form.check_number || !form.new_value))}
            className="flex items-center gap-2 px-5 py-2 bg-foreground text-primary-foreground text-sm font-semibold rounded-lg disabled:opacity-50">
            <RefreshCw className="w-3.5 h-3.5" /> {saving ? 'Salvando...' : 'Confirmar Troca'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Modal de compensação com seleção de banco
function CompensarChequeModal({ cheque, onClose, onSaved }) {
  const [bancos, setBancos] = useState([]);
  const [bancoId, setBancoId] = useState('');
  const [data, setData] = useState(today());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    base44.entities.Banco.filter({ active: true }, 'name', 100).then(bks => {
      setBancos(bks);
      const def = bks.find(b => b.is_default_lucro) || bks[0];
      if (def) setBancoId(def.id);
    });
  }, []);

  const banco = bancos.find(b => b.id === bancoId);

  const save = async () => {
    setSaving(true);
    await base44.entities.Cheque.update(cheque.id, {
      status: 'compensado',
      deposited_bank_id: bancoId,
      deposited_bank_name: banco?.name || '',
    });

    if (banco) {
      await base44.entities.Banco.update(bancoId, {
        current_balance: (banco.current_balance || 0) + (cheque.value || 0),
      });
      await base44.entities.CashFlow.create({
        type: 'entrada',
        category: 'compensacao_cheque',
        amount: cheque.value,
        date: data,
        description: `Compensação cheque #${cheque.check_number} — ${cheque.client_name} (Banco: ${banco?.name})`,
        method: 'cheque',
      });
    }

    await logAction({
      action: 'compensar',
      entity: 'Cheque',
      entityId: cheque.id,
      description: `Cheque #${cheque.check_number} (${cheque.client_name}) compensado em ${data} — Banco: ${banco?.name || bancoId} — Valor: R$ ${cheque.value}`,
      before: { status: 'pendente' },
      after: { status: 'compensado', banco: banco?.name, data_compensacao: data, valor: cheque.value },
    });

    await syncChequeCompensation({ ...cheque, status: 'compensado' });

    setSaving(false);
    onSaved();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <div>
              <h3 className="text-sm font-bold">Compensar Cheque</h3>
              <p className="text-xs text-muted-foreground">#{cheque?.check_number} — {formatCurrency(cheque?.value)}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Data da Compensação</label>
            <input className="input-field" type="date" value={data} onChange={e => setData(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Creditar no Banco *</label>
            <select className="input-field" value={bancoId} onChange={e => setBancoId(e.target.value)}>
              <option value="">Selecionar banco...</option>
              {bancos.map(b => (
                <option key={b.id} value={b.id}>{b.name}{b.account ? ` — cc ${b.account}` : ''}</option>
              ))}
            </select>
            {banco && (
              <div className="text-xs text-muted-foreground mt-1">
                Saldo atual: <span className="font-semibold text-emerald-600">{formatCurrency(banco.current_balance || 0)}</span>
                {' → '}
                <span className="font-semibold">{formatCurrency((banco.current_balance || 0) + (cheque.value || 0))}</span>
              </div>
            )}
          </div>
        </div>
        <div className="flex justify-end gap-2 px-5 pb-5">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-gray-50">Cancelar</button>
          <button onClick={save} disabled={saving || !bancoId}
            className="flex items-center gap-2 px-5 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-lg disabled:opacity-50 hover:bg-emerald-700">
            <CheckCircle2 className="w-3.5 h-3.5" /> {saving ? 'Salvando...' : 'Compensar'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ChequeForm({ onSaved }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const preOperation = searchParams.get('operation');
  const preClient = searchParams.get('client');
  const [clients, setClients] = useState([]);
  const [operations, setOperations] = useState([]);
  const [form, setForm] = useState({
    operation_id: preOperation || '', client_id: preClient || '', client_name: '',
    bank_name: '', check_number: '', value: '', compensation_date: '', notes: '',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    base44.entities.Client.list('-name', 300).then(setClients);
    base44.entities.Operation.list('-created_date', 300).then(setOperations);
  }, []);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const save = async () => {
    setSaving(true);
    const client = clients.find(c => c.id === form.client_id);
    const created = await base44.entities.Cheque.create({
      ...form,
      bank_name: form.bank_name.toUpperCase(),
      check_number: form.check_number.toUpperCase(),
      client_name: client?.name || '',
      value: parseFloat(form.value),
      status: 'pendente',
    });
    await logAction({
      action: 'create',
      entity: 'Cheque',
      entityId: created.id,
      description: `Cheque #${form.check_number.toUpperCase()} criado para ${client?.name || ''} — Banco: ${form.bank_name.toUpperCase()} — Valor: R$ ${form.value} — Compensação: ${form.compensation_date}`,
      after: { banco: form.bank_name, numero: form.check_number, valor: parseFloat(form.value), compensacao: form.compensation_date },
    });
    setSaving(false);
    if (onSaved) onSaved();
    else navigate('/cheques');
  };

  return (
    <div className="bg-white border border-border rounded-xl p-5 space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">Cliente *</label>
          <select className="input-field" value={form.client_id} onChange={e => set('client_id', e.target.value)}>
            <option value="">Selecione</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">Operação vinculada</label>
          <select className="input-field" value={form.operation_id} onChange={e => set('operation_id', e.target.value)}>
            <option value="">Selecione (opcional)</option>
            {operations.filter(o => !form.client_id || o.client_id === form.client_id).map(o => (
              <option key={o.id} value={o.id}>{o.client_name} — {formatCurrency(o.gross_value)} — {formatDate(o.due_date)}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">Banco Emissor *</label>
          <input className="input-field uppercase" value={form.bank_name} onChange={e => set('bank_name', e.target.value.toUpperCase())} placeholder="Ex: BRADESCO" />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">Número do Cheque *</label>
          <input className="input-field uppercase" value={form.check_number} onChange={e => set('check_number', e.target.value.toUpperCase())} placeholder="000000" />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">Valor (R$) *</label>
          <input className="input-field" type="number" step="0.01" value={form.value} onChange={e => set('value', e.target.value)} placeholder="0,00" />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">Data de Compensação *</label>
          <input className="input-field" type="date" value={form.compensation_date} onChange={e => set('compensation_date', e.target.value)} />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">Observações</label>
          <input className="input-field" value={form.notes} onChange={e => set('notes', e.target.value)} />
        </div>
      </div>
      <div className="flex justify-end gap-3">
        <button onClick={() => navigate('/cheques')} className="px-4 py-2 text-sm font-medium border border-border rounded-lg hover:bg-gray-50">Cancelar</button>
        <button onClick={save} disabled={saving || !form.client_id || !form.bank_name || !form.check_number || !form.value}
          className="inline-flex items-center gap-2 px-4 py-2 bg-foreground text-primary-foreground text-sm font-medium rounded-lg disabled:opacity-50">
          <Save className="w-4 h-4" /> {saving ? 'Salvando...' : 'Salvar Cheque'}
        </button>
      </div>
    </div>
  );
}

// Detecta se um cheque tem lucro prorrogação "a receber" nas notas
function temLucroPendente(cheque) {
  if (!cheque.notes) return false;
  return cheque.notes.includes('[PRORROGADO') && cheque.notes.includes('A RECEBER') && !cheque.notes.includes('[LUCRO PRORROGAÇÃO RECEBIDO');
}

export default function Cheques() {
  const [searchParams] = useSearchParams();
  const [cheques, setCheques] = useState([]);
  const [operacoes, setOperacoes] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [filterProntos, setFilterProntos] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState('');
  const [sortDir, setSortDir] = useState('asc');
  const [searchQueryTes, setSearchQueryTes] = useState('');
  const [activeTab, setActiveTab] = useState('todos'); // 'todos' | 'prorrogados' | 'tesouraria'
  const [showForm, setShowForm] = useState(false);
  const [trocaCheque, setTrocaCheque] = useState(null);
  const [resolverDevolvido, setResolverDevolvido] = useState(null);
  const [prorrogarCheque, setProrrogarCheque] = useState(null);
  const [compensarCheque, setCompensarCheque] = useState(null);
  const [receberLucro, setReceberLucro] = useState(null);
  const [imagensCheque, setImagensCheque] = useState(null);
  const [confirm, setConfirm] = useState({ open: false });
  const [pendingUpdate, setPendingUpdate] = useState(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [menuOpenId, setMenuOpenId] = useState(null);
  const settings = getSettings();

  const load = async () => {
    setLoading(true);
    const [chequeData, operData, userList] = await Promise.all([
      fetchAll('Cheque', '-created_date'),
      fetchAll('Operation', '-created_date'),
      base44.functions.invoke('listUsers', {}).then(r => r.data?.users || []).catch(() => []),
    ]);
    // Oculta cheques vinculados a operações em rascunho (não finalizadas)
    const draftOpIds = new Set(operData.filter(o => o.etapa === 'rascunho').map(o => o.id));
    // Oculta títulos vinculados a operações de Duplicata/Empréstimo (gerenciados na página de Boletos)
    const nonChequeOpIds = new Set(operData.filter(o => o.type === 'boleto' || o.type === 'emprestimo').map(o => o.id));
    const visibleCheques = chequeData.filter(c =>
      (!c.operation_id || !draftOpIds.has(c.operation_id)) &&
      (c.tipo === 'cheque' || !c.tipo) &&
      !(c.operation_id && nonChequeOpIds.has(c.operation_id))
    );
    setCheques(visibleCheques);
    setOperacoes(operData);
    setUsuarios(userList);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const doUpdateStatus = async (cheque, status, reason) => {
    const before = { status: cheque.status };
    await base44.entities.Cheque.update(cheque.id, { status, return_reason: reason || cheque.return_reason });
    await logAction({
      action: 'status_change',
      entity: 'Cheque',
      entityId: cheque.id,
      description: `Status do cheque #${cheque.check_number} (${cheque.client_name}) alterado de "${cheque.status}" para "${status}"${reason ? ` — Motivo: ${reason}` : ''}`,
      before,
      after: { status, return_reason: reason },
    });
    load();
  };

  const updateStatus = (cheque, status, reason) => {
    const useConfirm = settings.show_confirm_dialogs !== false;
    if (useConfirm) {
      setPendingUpdate({ cheque, status, reason });
      setConfirm({
        open: true,
        title: status === 'devolvido' ? 'Devolver Cheque' : 'Confirmar',
        message: `Confirmar alteração do cheque #${cheque.check_number} para "${status}"?`,
        variant: status === 'devolvido' ? 'danger' : 'default',
      });
    } else {
      doUpdateStatus(cheque, status, reason);
    }
  };

  const handleConfirm = async () => {
    if (pendingUpdate) {
      await doUpdateStatus(pendingUpdate.cheque, pendingUpdate.status, pendingUpdate.reason);
      setPendingUpdate(null);
    }
    setConfirm({ open: false });
  };

  const handleExport = () => {
    exportToCsv(filtered, [
      { key: 'client_name', label: 'Cliente' },
      { key: 'bank_name', label: 'Banco' },
      { key: 'check_number', label: 'Nº Cheque' },
      { key: 'value', label: 'Valor (R$)' },
      { key: 'compensation_date', label: 'Data Compensação' },
      { key: 'status', label: 'Status' },
      { key: 'return_reason', label: 'Motivo Devolução' },
      { key: 'notes', label: 'Observações' },
    ], 'cheques');
  };

  const todayStr = today();

  const matchSearch = (c, q) => {
    if (!q) return true;
    const lower = q.toLowerCase();
    return [c.client_name, c.bank_name, c.check_number, c.status, c.custody_status,
            String(c.value || ''), c.compensation_date, c.issue_date, c.return_reason, c.notes]
      .some(v => (v || '').toLowerCase().includes(lower));
  };

  const toggleSort = (field) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('asc'); }
  };

  const filtered = cheques
    .filter(c => {
      if (filterStatus === 'resolvido') {
        if (!['resolvido_pago', 'resolvido_substituido', 'resolvido_prorrogado'].includes(c.status)) return false;
      } else if (filterStatus && c.status !== filterStatus) return false;
      if (filterDateFrom && c.compensation_date < filterDateFrom) return false;
      if (filterDateTo && c.compensation_date > filterDateTo) return false;
      if (filterProntos && !(c.status === 'pendente' && c.compensation_date <= todayStr)) return false;
      if (!matchSearch(c, searchQuery)) return false;
      return true;
    })
    .sort((a, b) => {
      if (!sortField) return 0;
      let av = a[sortField] ?? '';
      let bv = b[sortField] ?? '';
      if (sortField === 'value') { av = Number(av); bv = Number(bv); }
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortDir === 'asc' ? cmp : -cmp;
    });

  const hasActiveFilter = filterStatus || filterDateFrom || filterDateTo || filterProntos || searchQuery;

  // Reset página quando filtros/ordenação mudam
  useEffect(() => { setPage(1); }, [filterStatus, filterDateFrom, filterDateTo, filterProntos, searchQuery, sortField, sortDir]);

  // Paginação
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paginated = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  // Cor da linha por status
  const rowColor = (status) => ({
    pendente: 'bg-amber-50/60',
    compensado: 'bg-emerald-50/60',
    devolvido: 'bg-red-50/60',
    resolvido_pago: 'bg-emerald-50/60',
    resolvido_substituido: 'bg-blue-50/60',
    resolvido_prorrogado: 'bg-purple-50/60',
    cancelado: 'bg-gray-100/60',
  }[status] || 'bg-white');

  // Totais do conjunto filtrado
  const totalFiltered = filtered.reduce((s, c) => s + (c.value || 0), 0);
  const totalPendente = filtered.filter(c => c.status === 'pendente').reduce((s, c) => s + (c.value || 0), 0);
  const totalCompensado = filtered.filter(c => c.status === 'compensado').reduce((s, c) => s + (c.value || 0), 0);
  const totalDevolvido = filtered.filter(c => c.status === 'devolvido').reduce((s, c) => s + (c.value || 0), 0);
  const totalResolvido = filtered.filter(c => ['resolvido_pago', 'resolvido_substituido', 'resolvido_prorrogado'].includes(c.status)).reduce((s, c) => s + (c.value || 0), 0);
  const countProntos = cheques.filter(c => c.status === 'pendente' && c.compensation_date <= todayStr).length;

  const pendingCount = cheques.filter(c => c.status === 'pendente').length;
  const pendingValue = cheques.filter(c => c.status === 'pendente').reduce((s, c) => s + (c.value || 0), 0);

  // Cheques com lucro de prorrogação a receber
  const lucrosPendentes = cheques.filter(c => c.status === 'pendente' && temLucroPendente(c));

  // Agrupamento mensal (mês de compensação) — a vencer (pendente) e compensados
  const monthlyData = (() => {
    const now = new Date();
    const curKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const map = {};
    cheques.forEach(c => {
      if (!c.compensation_date) return;
      const [y, m] = c.compensation_date.split('-');
      const key = `${y}-${m}`;
      if (!map[key]) map[key] = { key, pendente: { count: 0, value: 0 }, compensado: { count: 0, value: 0 }, devolvido: { count: 0, value: 0 } };
      if (c.status === 'pendente') { map[key].pendente.count++; map[key].pendente.value += c.value || 0; }
      else if (c.status === 'compensado') { map[key].compensado.count++; map[key].compensado.value += c.value || 0; }
      else if (c.status === 'devolvido') { map[key].devolvido.count++; map[key].devolvido.value += c.value || 0; }
    });
    // Ordenar por mês; futuros primeiro (a partir do mês atual), depois passados
    return Object.values(map)
      .filter(m => m.key >= curKey)
      .sort((a, b) => a.key.localeCompare(b.key));
  })();

  const monthLabel = (key) => {
    const [y, m] = key.split('-');
    const MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    return `${MONTHS[parseInt(m) - 1]}/${y}`;
  };

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <ConfirmDialog
        open={confirm.open}
        title={confirm.title}
        message={confirm.message}
        variant={confirm.variant}
        onConfirm={handleConfirm}
        onCancel={() => setConfirm({ open: false })}
      />

      {trocaCheque && (
        <TrocaChequeModal cheque={trocaCheque} onClose={() => setTrocaCheque(null)} onSaved={load} />
      )}
      {resolverDevolvido && (
        <ChequeDevolvidoModal cheque={resolverDevolvido} onClose={() => setResolverDevolvido(null)} onSaved={load} />
      )}
      {prorrogarCheque && (
        <ProrrogarChequeModal cheque={prorrogarCheque} onClose={() => setProrrogarCheque(null)} onSaved={load} />
      )}
      {compensarCheque && (
        <CompensarChequeModal cheque={compensarCheque} onClose={() => setCompensarCheque(null)} onSaved={load} />
      )}
      {receberLucro && (
        <ReceberLucroProrrogacaoModal cheque={receberLucro} onClose={() => setReceberLucro(null)} onSaved={load} />
      )}
      {imagensCheque && (
        <ChequeImagensModal cheque={imagensCheque} onClose={() => setImagensCheque(null)} onSaved={load} />
      )}

      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold">Cheques</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {pendingCount} pendentes — {formatCurrency(pendingValue)} aguardando compensação
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleExport}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border border-border rounded-lg hover:bg-gray-50">
            <Download className="w-3.5 h-3.5" /> Exportar CSV
          </button>
          <button onClick={() => setShowForm(v => !v)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-foreground text-primary-foreground text-sm font-medium rounded-lg hover:bg-foreground/90">
            {showForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            {showForm ? 'Cancelar' : 'Novo Cheque'}
          </button>
        </div>
      </div>

      {showForm && (
        <div className="mb-5">
          <ChequeForm onSaved={() => { setShowForm(false); load(); }} />
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-0.5 bg-gray-100 rounded-lg p-1 w-fit mb-5">
        {[
          { key: 'todos', label: 'Todos os Cheques' },
          { key: 'mesames', label: 'Mês a Mês' },
          { key: 'prorrogados', label: `Lucros Pendentes${lucrosPendentes.length > 0 ? ` (${lucrosPendentes.length})` : ''}` },
          { key: 'tesouraria', label: 'Gestão dos Cheques' },
        ].map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            className={`px-4 py-2 text-xs font-semibold rounded-md transition-colors ${activeTab === t.key ? 'bg-white text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── TAB: TODOS ── */}
      {activeTab === 'todos' && (
        <>
          {/* Filtros */}
          <div className="bg-white border border-border rounded-xl p-4 mb-4 space-y-3">
            {/* Busca global */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Buscar por cliente, banco, número, valor, status, data..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-ring"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Status</label>
                <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="text-sm border border-border rounded-lg px-3 py-2 h-9">
                  <option value="">Todos</option>
                  <option value="pendente">Pendente</option>
                  <option value="compensado">Compensado</option>
                  <option value="devolvido">Devolvido</option>
                  <option value="resolvido">Resolvidos</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Compensação — De</label>
                <input type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)}
                  className="text-sm border border-border rounded-lg px-3 py-2 h-9" />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Até</label>
                <input type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)}
                  className="text-sm border border-border rounded-lg px-3 py-2 h-9" />
              </div>
              <button
                onClick={() => setFilterProntos(v => !v)}
                className={`h-9 flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-semibold transition-colors ${filterProntos ? 'bg-emerald-600 text-white border-emerald-600' : 'border-border hover:bg-gray-50'}`}>
                <CheckCircle2 className="w-3.5 h-3.5" />
                Prontos p/ compensar
                {countProntos > 0 && <span className={`px-1.5 py-0.5 rounded-full text-xs font-bold ${filterProntos ? 'bg-white text-emerald-700' : 'bg-emerald-100 text-emerald-700'}`}>{countProntos}</span>}
              </button>
              {hasActiveFilter && (
                <button onClick={() => { setFilterStatus(''); setFilterDateFrom(''); setFilterDateTo(''); setFilterProntos(false); setSearchQuery(''); }}
                  className="h-9 flex items-center gap-1.5 px-3 py-2 text-xs text-muted-foreground border border-border rounded-lg hover:bg-gray-50">
                  <X className="w-3.5 h-3.5" /> Limpar filtros
                </button>
              )}
            </div>
          </div>

          {/* Cards de totais — clicáveis para filtrar status */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
            {[
              { label: 'Total', statusKey: '', value: totalFiltered, count: filtered.length, baseCls: 'bg-gray-50 border-gray-200 text-gray-700', activeCls: 'ring-2 ring-gray-400 border-gray-400' },
              { label: 'Pendentes', statusKey: 'pendente', value: totalPendente, count: filtered.filter(c=>c.status==='pendente').length, baseCls: 'bg-amber-50 border-amber-200 text-amber-700', activeCls: 'ring-2 ring-amber-500 border-amber-500' },
              { label: 'Compensados', statusKey: 'compensado', value: totalCompensado, count: filtered.filter(c=>c.status==='compensado').length, baseCls: 'bg-emerald-50 border-emerald-200 text-emerald-700', activeCls: 'ring-2 ring-emerald-500 border-emerald-500' },
              { label: 'Devolvidos', statusKey: 'devolvido', value: totalDevolvido, count: filtered.filter(c=>c.status==='devolvido').length, baseCls: 'bg-red-50 border-red-200 text-red-700', activeCls: 'ring-2 ring-red-500 border-red-500' },
              { label: 'Resolvidos', statusKey: 'resolvido', value: totalResolvido, count: filtered.filter(c=>['resolvido_pago','resolvido_substituido','resolvido_prorrogado'].includes(c.status)).length, baseCls: 'bg-purple-50 border-purple-200 text-purple-700', activeCls: 'ring-2 ring-purple-500 border-purple-500' },
            ].map(card => {
              const isActive = filterStatus === card.statusKey && (card.statusKey !== '' || filterStatus === '');
              const active = card.statusKey === '' ? false : filterStatus === card.statusKey;
              return (
                <button key={card.label}
                  onClick={() => setFilterStatus(f => f === card.statusKey ? '' : card.statusKey)}
                  className={`rounded-xl border p-3 text-left transition-all cursor-pointer hover:shadow-sm ${card.baseCls} ${active ? card.activeCls : ''}`}>
                  <div className="text-xs font-medium opacity-70">{card.label}</div>
                  <div className="text-base font-bold mt-0.5">{formatCurrency(card.value)}</div>
                  <div className="text-xs opacity-60 mt-0.5">{card.count} cheque{card.count !== 1 ? 's' : ''}</div>
                </button>
              );
            })}
          </div>

          {loading ? (
            <div className="flex items-center justify-center h-48">
              <div className="w-6 h-6 border-2 border-border border-t-foreground rounded-full animate-spin" />
            </div>
          ) : (
            <div className="bg-white border border-border rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm table-fixed">
                  <colgroup>
                    <col className="w-[90px]" />
                    <col className="w-[200px]" />
                    <col className="w-[110px]" />
                    <col className="w-[110px]" />
                    <col className="w-[100px]" />
                    <col className="w-[150px]" />
                    <col className="w-[140px]" />
                    <col className="w-[50px]" />
                    <col className="w-[44px]" />
                  </colgroup>
                  <thead>
                    <tr className="border-b border-border bg-gray-50/50">
                      {[
                        { label: 'Data', field: 'created_date', align: 'left' },
                        { label: 'Cliente', field: 'client_name', align: 'left' },
                        { label: 'Nº', field: 'check_number', align: 'left' },
                        { label: 'Valor', field: 'value', align: 'right' },
                        { label: 'Compensação', field: 'compensation_date', align: 'left' },
                        { label: 'Status', field: null, align: 'left' },
                        { label: 'Operação por', field: null, align: 'left' },
                      ].map(col => (
                        <th key={col.label}
                          className={`px-3 py-3 text-xs font-medium text-muted-foreground ${col.align === 'right' ? 'text-right' : 'text-left'} ${col.field ? 'cursor-pointer select-none hover:text-foreground' : ''}`}
                          onClick={col.field ? () => toggleSort(col.field) : undefined}>
                          <span className="inline-flex items-center gap-1">
                            {col.label}
                            {col.field && (sortField === col.field
                              ? (sortDir === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)
                              : <ArrowUpDown className="w-3 h-3 opacity-30" />)}
                          </span>
                        </th>
                      ))}
                      <th className="px-2 py-3 text-xs font-medium text-muted-foreground text-center">Imgs</th>
                      <th className="px-2 py-3"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {paginated.map((c, idx) => {
                      const isOpen = menuOpenId === c.id;
                      const isLastRow = idx === paginated.length - 1;
                      const opUser = (() => {
                        const op = operacoes.find(o => o.id === c.operation_id);
                        if (!op || !op.created_by_id) return '—';
                        const user = usuarios.find(u => u.id === op.created_by_id);
                        return user?.full_name || user?.email || '—';
                      })();
                      return (
                        <tr key={c.id} className={`transition-colors ${rowColor(c.status)} hover:brightness-95`}>
                          <td className="px-3 py-3 text-xs text-muted-foreground whitespace-nowrap">{formatDate(c.created_date)}</td>
                          <td className="px-3 py-3 font-medium truncate" title={c.client_name}>{c.client_name || '—'}</td>
                          <td className="px-3 py-3 font-mono text-xs truncate" title={c.check_number}>{c.check_number}</td>
                          <td className="px-3 py-3 text-right font-mono font-semibold whitespace-nowrap">{formatCurrency(c.value)}</td>
                          <td className="px-3 py-3 text-sm whitespace-nowrap">{formatDate(c.compensation_date)}</td>
                          <td className="px-3 py-3">
                            <div className="space-y-0.5">
                              <StatusBadge status={c.status} />
                              {c.status === 'pendente' && (() => {
                                const CUSTODY_LABELS = { em_maos: 'Em mãos', a_buscar: 'A buscar', tesouraria: 'Tesouraria', financeiro: 'Financeiro' };
                                const CUSTODY_CLS = { em_maos: 'text-emerald-700', a_buscar: 'text-amber-600', tesouraria: 'text-blue-700', financeiro: 'text-purple-700' };
                                const cst = c.custody_status || 'em_maos';
                                return <div className={`text-xs font-medium ${CUSTODY_CLS[cst]}`}>{CUSTODY_LABELS[cst]}</div>;
                              })()}
                              {temLucroPendente(c) && (
                                <div className="text-xs text-amber-600 font-medium">Lucro a receber</div>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-3 text-xs text-muted-foreground truncate" title={opUser}>{opUser}</td>
                          <td className="px-2 py-3 text-center">
                           <button
                             onClick={() => setImagensCheque(c)}
                             title="Ver / Anexar imagens"
                             className={`inline-flex items-center justify-center w-7 h-7 rounded-lg transition-colors ${
                               c.front_image_url || c.back_image_url
                                 ? 'bg-purple-100 text-purple-600 hover:bg-purple-200'
                                 : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                             }`}
                           >
                             <Image className="w-3.5 h-3.5" />
                           </button>
                          </td>
                          <td className="px-2 py-3 relative">
                            <button
                              onClick={() => setMenuOpenId(isOpen ? null : c.id)}
                              className="p-1.5 rounded-lg hover:bg-black/10 text-muted-foreground hover:text-foreground transition-colors"
                            >
                              <MoreVertical className="w-4 h-4" />
                            </button>
                            {isOpen && (
                              <>
                                <div className="fixed inset-0 z-30" onClick={() => setMenuOpenId(null)} />
                                <div className={`absolute right-0 ${isLastRow ? 'bottom-full mb-1' : 'top-full mt-1'} z-40 w-48 bg-white border border-border rounded-lg shadow-lg py-1`}>
                                  {c.status === 'pendente' && (
                                    <>
                                      <button onClick={() => { setMenuOpenId(null); setCompensarCheque(c); }}
                                        className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-emerald-700 hover:bg-emerald-50 text-left">
                                        <CheckCircle2 className="w-3.5 h-3.5" /> Compensar
                                      </button>
                                      <button onClick={() => { setMenuOpenId(null); setProrrogarCheque(c); }}
                                        className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-blue-700 hover:bg-blue-50 text-left">
                                        <CalendarClock className="w-3.5 h-3.5" /> Prorrogar
                                      </button>
                                      <button onClick={() => { setMenuOpenId(null); updateStatus(c, 'devolvido', 'Devolvido pelo banco'); }}
                                        className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-red-700 hover:bg-red-50 text-left">
                                        <X className="w-3.5 h-3.5" /> Devolver
                                      </button>
                                      {temLucroPendente(c) && (
                                        <button onClick={() => { setMenuOpenId(null); setReceberLucro(c); }}
                                          className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-amber-700 hover:bg-amber-50 text-left">
                                          <DollarSign className="w-3.5 h-3.5" /> Receber Lucro
                                        </button>
                                      )}
                                    </>
                                  )}
                                  {c.status === 'devolvido' && (
                                    <>
                                      <button onClick={() => { setMenuOpenId(null); setResolverDevolvido(c); }}
                                        className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-red-700 hover:bg-red-50 text-left">
                                        <AlertTriangle className="w-3.5 h-3.5" /> Resolver Devolução
                                      </button>
                                      <button onClick={() => { setMenuOpenId(null); updateStatus(c, 'pendente', 'Reaberto para compensação'); }}
                                        className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-emerald-700 hover:bg-emerald-50 text-left">
                                        <RefreshCw className="w-3.5 h-3.5" /> Reabrir (pendente)
                                      </button>
                                    </>
                                  )}
                                  {['compensado', 'resolvido_pago', 'resolvido_substituido', 'resolvido_prorrogado', 'cancelado'].includes(c.status) && (
                                    <div className="px-3 py-2 text-xs text-muted-foreground italic">Sem ações disponíveis</div>
                                  )}
                                </div>
                              </>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    {filtered.length === 0 && (
                      <tr><td colSpan={9} className="px-5 py-10 text-center text-muted-foreground">Nenhum cheque encontrado.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              {filtered.length > 0 && (
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
          </>
          )}

      {/* ── TAB: MÊS A MÊS ── */}
      {activeTab === 'mesames' && (
        <div className="bg-white border border-border rounded-xl overflow-hidden">
          {monthlyData.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground">
              <p className="font-medium">Nenhum cheque com data de compensação futura</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-gray-50/50">
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Mês</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground">A Vencer (Pendentes)</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground">Compensados</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground">Devolvidos</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground">Total do Mês</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {monthlyData.map(m => {
                  const totalValue = m.pendente.value + m.compensado.value + m.devolvido.value;
                  const totalCount = m.pendente.count + m.compensado.count + m.devolvido.count;
                  return (
                    <tr key={m.key} className="hover:bg-gray-50/50">
                      <td className="px-4 py-3 font-semibold whitespace-nowrap">{monthLabel(m.key)}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="font-mono font-semibold text-amber-700">{formatCurrency(m.pendente.value)}</div>
                        <div className="text-xs text-muted-foreground">{m.pendente.count} cheque(s)</div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="font-mono font-semibold text-emerald-700">{formatCurrency(m.compensado.value)}</div>
                        <div className="text-xs text-muted-foreground">{m.compensado.count} cheque(s)</div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="font-mono font-semibold text-red-700">{formatCurrency(m.devolvido.value)}</div>
                        <div className="text-xs text-muted-foreground">{m.devolvido.count} cheque(s)</div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="font-mono font-bold">{formatCurrency(totalValue)}</div>
                        <div className="text-xs text-muted-foreground">{totalCount} cheque(s)</div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border bg-gray-50/50 font-bold">
                  <td className="px-4 py-3">Total Geral</td>
                  <td className="px-4 py-3 text-right font-mono text-amber-700">{formatCurrency(monthlyData.reduce((s, m) => s + m.pendente.value, 0))}</td>
                  <td className="px-4 py-3 text-right font-mono text-emerald-700">{formatCurrency(monthlyData.reduce((s, m) => s + m.compensado.value, 0))}</td>
                  <td className="px-4 py-3 text-right font-mono text-red-700">{formatCurrency(monthlyData.reduce((s, m) => s + m.devolvido.value, 0))}</td>
                  <td className="px-4 py-3 text-right font-mono">{formatCurrency(monthlyData.reduce((s, m) => s + m.pendente.value + m.compensado.value + m.devolvido.value, 0))}</td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      )}

      {/* ── TAB: LUCROS PENDENTES (prorrogações a receber) ── */}
      {activeTab === 'prorrogados' && (
        <div className="space-y-3">
          {lucrosPendentes.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground">
              <div className="w-10 h-10 mx-auto mb-3 opacity-20">-</div>
              <p className="font-medium">Nenhum lucro de prorrogação pendente</p>
              <p className="text-sm mt-1">Todos os juros de prorrogações foram recebidos.</p>
            </div>
          ) : (
            <>
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800 flex items-center gap-2">
                <span>Cheques com juros de prorrogação marcados como <strong>"a receber"</strong>. Registre o recebimento quando o cliente pagar.</span>
              </div>
              {lucrosPendentes.map(c => (
                <div key={c.id} className="bg-white border border-amber-200 rounded-xl p-4 flex items-center justify-between shadow-sm">
                  <div>
                    <div className="font-semibold text-sm">{c.client_name}</div>
                    <div className="text-xs text-muted-foreground mt-0.5 flex flex-wrap gap-x-3">
                      <span>{c.bank_name} — #{c.check_number}</span>
                      <span>Val: <strong className="text-foreground">{formatCurrency(c.value)}</strong></span>
                      <span>Comp: {formatDate(c.compensation_date)}</span>
                    </div>
                    <div className="text-xs text-amber-700 mt-1 font-medium">Lucro/juros de prorrogação a receber</div>
                  </div>
                  <button onClick={() => setReceberLucro(c)}
                    className="flex items-center gap-1.5 px-3 py-2 bg-amber-500 text-white text-xs font-semibold rounded-lg hover:bg-amber-600 transition-colors whitespace-nowrap">
                    Registrar Recebimento
                  </button>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {/* ── TAB: GESTÃO TESOURARIA ── */}
      {activeTab === 'tesouraria' && (
        <>
          <TesourariaTab
            cheques={cheques}
            operacoes={operacoes}
            usuarios={usuarios}
            onReload={load}
            onCompensarCheque={setCompensarCheque}
            onProrrogarCheque={setProrrogarCheque}
            onUpdateStatus={updateStatus}
            searchQuery={searchQueryTes}
            onSearchChange={setSearchQueryTes}
          />
          </>
          )}
          </div>
          );
          }