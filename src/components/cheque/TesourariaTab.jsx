import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Package, CheckSquare, Square, ChevronDown, ArrowRightLeft, Send, ArrowUpDown, ArrowUp, ArrowDown, X, Search, MoreVertical, CheckCircle2, CornerUpLeft, Calendar } from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/finance';
import EnviarBancoModal from '@/components/cheque/EnviarBancoModal';
import Pagination from '@/components/ui/Pagination';
import { logAction } from '@/lib/audit';

const CUSTODY_OPTIONS = [
  { value: 'em_maos', label: 'Em mãos', desc: 'Cheques recebidos', cardCls: 'bg-emerald-50 border-emerald-300 hover:bg-emerald-100', activeCls: 'border-emerald-600 bg-emerald-100', labelCls: 'text-emerald-800', valCls: 'text-emerald-900', subCls: 'text-emerald-600' },
  { value: 'a_buscar', label: 'A buscar', desc: 'Pendente com cliente', cardCls: 'bg-amber-50 border-amber-300 hover:bg-amber-100', activeCls: 'border-amber-600 bg-amber-100', labelCls: 'text-amber-800', valCls: 'text-amber-900', subCls: 'text-amber-600' },
  { value: 'tesouraria', label: 'Tesouraria', desc: 'Na tesouraria', cardCls: 'bg-blue-50 border-blue-300 hover:bg-blue-100', activeCls: 'border-blue-600 bg-blue-100', labelCls: 'text-blue-800', valCls: 'text-blue-900', subCls: 'text-blue-600' },
  { value: 'financeiro', label: 'Financeiro', desc: 'No departamento financeiro', cardCls: 'bg-purple-50 border-purple-300 hover:bg-purple-100', activeCls: 'border-purple-600 bg-purple-100', labelCls: 'text-purple-800', valCls: 'text-purple-900', subCls: 'text-purple-600' },
];

const CUSTODY_COLORS = {
  em_maos: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  a_buscar: 'bg-amber-50 text-amber-700 border-amber-200',
  tesouraria: 'bg-blue-50 text-blue-700 border-blue-200',
  financeiro: 'bg-purple-50 text-purple-700 border-purple-200',
};

export default function TesourariaTab({ cheques, operacoes = [], usuarios = [], onReload, onCompensarCheque, onProrrogarCheque, onUpdateStatus, searchQuery = '', onSearchChange }) {
  const [selected, setSelected] = useState(new Set());
  const [bulkSaving, setBulkSaving] = useState(false);
  const [filterCustody, setFilterCustody] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterUsuario, setFilterUsuario] = useState('');
  const [openBulkMenu, setOpenBulkMenu] = useState(false);
  const [showEnviarBanco, setShowEnviarBanco] = useState(false);
  const [openCustodyDropdown, setOpenCustodyDropdown] = useState(null);
  const custodyTimeoutRef = useState(null)[1];
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [sortField, setSortField] = useState('compensation_date');
  const [sortDir, setSortDir] = useState('asc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [menuOpenId, setMenuOpenId] = useState(null);

  const getUsuarioNome = (cheque) => {
    const op = operacoes.find(o => o.id === cheque.operation_id);
    if (!op || !op.created_by_id) return '—';
    const user = usuarios.find(u => u.id === op.created_by_id);
    return user?.full_name || user?.email || '—';
  };

  const usuariosUnicos = [...new Set(
    cheques.filter(c => c.status === 'pendente').map(c => getUsuarioNome(c)).filter(n => n !== '—')
  )].sort();

  const pending = cheques.filter(c => c.status === 'pendente' || c.status === 'devolvido');

  const matchSearch = (c) => {
    if (!searchQuery) return true;
    const lower = searchQuery.toLowerCase();
    return [c.client_name, c.bank_name, c.check_number, c.status, c.custody_status,
            String(c.value || ''), c.compensation_date, c.issue_date, c.notes]
      .some(v => (v || '').toLowerCase().includes(lower));
  };

  const toggleSort = (field) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const SortIcon = ({ field }) => {
    if (sortField !== field) return <ArrowUpDown className="w-3 h-3 opacity-40" />;
    return sortDir === 'asc' ? <ArrowUp className="w-3 h-3 text-foreground" /> : <ArrowDown className="w-3 h-3 text-foreground" />;
  };

  const filtered = pending
    .filter(c => {
      if (filterStatus && c.status !== filterStatus) return false;
      if (filterCustody && (c.custody_status || 'em_maos') !== filterCustody) return false;
      if (filterDateFrom && (c.compensation_date || '') < filterDateFrom) return false;
      if (filterDateTo && (c.compensation_date || '') > filterDateTo) return false;
      if (filterUsuario && getUsuarioNome(c) !== filterUsuario) return false;
      if (!matchSearch(c)) return false;
      return true;
    })
    .sort((a, b) => {
      let valA, valB;
      if (sortField === 'client_name') { valA = (a.client_name || '').toLowerCase(); valB = (b.client_name || '').toLowerCase(); }
      else if (sortField === 'value') { valA = a.value || 0; valB = b.value || 0; }
      else if (sortField === 'usuario') { valA = getUsuarioNome(a).toLowerCase(); valB = getUsuarioNome(b).toLowerCase(); }
      else { valA = a.compensation_date || ''; valB = b.compensation_date || ''; }
      if (valA < valB) return sortDir === 'asc' ? -1 : 1;
      if (valA > valB) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });

  // Paginação
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paginated = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  useEffect(() => { setPage(1); }, [filterCustody, filterStatus, filterDateFrom, filterDateTo, filterUsuario, searchQuery, sortField, sortDir]);

  const toggleSelect = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map(c => c.id)));
    }
  };

  const updateCustodySingle = async (cheque, custody) => {
    const oldCustody = cheque.custody_status || 'em_maos';
    await base44.entities.Cheque.update(cheque.id, { custody_status: custody });
    await logAction({
      action: 'custody_change',
      entity: 'Cheque',
      entityId: cheque.id,
      description: `Custódia do cheque #${cheque.check_number} (${cheque.client_name}) alterada de "${oldCustody}" para "${custody}"`,
      before: { custody_status: oldCustody },
      after: { custody_status: custody },
    });
    onReload();
  };

  const bulkUpdateCustody = async (custody) => {
    if (!selected.size) return;
    setBulkSaving(true);
    setOpenBulkMenu(false);
    const selectedList = filtered.filter(c => selected.has(c.id));
    await Promise.all(selectedList.map(async c => {
      const old = c.custody_status || 'em_maos';
      await base44.entities.Cheque.update(c.id, { custody_status: custody });
      return logAction({
        action: 'custody_change',
        entity: 'Cheque',
        entityId: c.id,
        description: `[Lote] Custódia cheque #${c.check_number} (${c.client_name}) alterada de "${old}" para "${custody}"`,
        before: { custody_status: old },
        after: { custody_status: custody },
      });
    }));
    setSelected(new Set());
    setBulkSaving(false);
    onReload();
  };

  const allSelected = filtered.length > 0 && selected.size === filtered.length;
  const someSelected = selected.size > 0;
  const selectedCheques = filtered.filter(c => selected.has(c.id));
  const selectedValue = selectedCheques.reduce((s, c) => s + (c.value || 0), 0);

  return (
    <div className="space-y-4">
      {showEnviarBanco && (
        <EnviarBancoModal
          cheques={selectedCheques}
          onClose={() => setShowEnviarBanco(false)}
          onSaved={() => { setSelected(new Set()); onReload(); }}
        />
      )}

      {/* Campo de busca */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          type="text"
          placeholder="Buscar por cliente, banco, número, valor, data de compensação, status..."
          value={searchQuery}
          onChange={e => onSearchChange?.(e.target.value)}
          className="w-full pl-9 pr-9 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-ring"
        />
        {searchQuery && (
          <button onClick={() => onSearchChange?.('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Cards de custódia com cores */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {CUSTODY_OPTIONS.map(opt => {
          const count = pending.filter(c => (c.custody_status || 'em_maos') === opt.value).length;
          const val = pending.filter(c => (c.custody_status || 'em_maos') === opt.value).reduce((s, c) => s + (c.value || 0), 0);
          const isActive = filterCustody === opt.value;
          return (
            <button key={opt.value} onClick={() => setFilterCustody(f => f === opt.value ? '' : opt.value)}
              className={`p-3 rounded-xl border-2 text-left transition-all ${isActive ? opt.activeCls + ' border-2' : opt.cardCls + ' border'}`}>
              <div className={`text-sm font-bold ${opt.labelCls}`}>{opt.label}</div>
              <div className={`text-xs mt-0.5 ${opt.subCls}`}>{opt.desc}</div>
              <div className="mt-2 flex items-center gap-1.5">
                <span className={`text-sm font-semibold ${opt.valCls}`}>{count}</span>
                <span className={`text-xs ${opt.subCls}`}>cheques</span>
              </div>
              <div className={`text-xs font-mono ${opt.subCls}`}>{formatCurrency(val)}</div>
            </button>
          );
        })}
      </div>

      {/* Barra de ações em lote */}
      {someSelected && (
        <div className="flex items-center justify-between gap-3 bg-foreground text-primary-foreground rounded-xl px-4 py-3">
          <div className="text-sm font-semibold">
            {selected.size} cheque{selected.size > 1 ? 's' : ''} selecionado{selected.size > 1 ? 's' : ''}
            {' — '}{formatCurrency(selectedValue)}
          </div>
          <div className="flex items-center gap-2">
            {/* Botão Enviar ao Banco */}
            <button
              onClick={() => setShowEnviarBanco(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold transition-colors"
            >
              <Send className="w-3.5 h-3.5" /> Enviar ao Banco
            </button>

            {/* Alterar custódia */}
            <div className="relative">
              <button onClick={() => setOpenBulkMenu(v => !v)} disabled={bulkSaving}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white/20 hover:bg-white/30 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50">
                <ArrowRightLeft className="w-3.5 h-3.5" />
                {bulkSaving ? 'Salvando...' : 'Mover custódia'}
                <ChevronDown className="w-3 h-3" />
              </button>
              {openBulkMenu && (
                <div className="absolute right-0 mt-1 bg-white text-foreground border border-border rounded-xl shadow-xl z-20 min-w-[200px] overflow-hidden">
                  {CUSTODY_OPTIONS.map(opt => (
                    <button key={opt.value} onClick={() => bulkUpdateCustody(opt.value)}
                      className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 flex items-center gap-2 border-b border-border last:border-0">
                      <span>{opt.label}</span>
                      <span className="text-xs text-muted-foreground ml-auto">{opt.desc}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button onClick={() => setSelected(new Set())} className="p-1.5 hover:bg-white/20 rounded-lg transition-colors text-xs">
              Limpar
            </button>
          </div>
        </div>
      )}

      {/* Filtro por status */}
      <div className="bg-white border border-border rounded-xl p-4">
        <label className="block text-xs font-medium text-muted-foreground mb-2">Status</label>
        <div className="flex gap-2 flex-wrap">
          {[
            { key: '', label: 'Todos', cls: 'border-border text-foreground', activeCls: 'bg-foreground text-primary-foreground border-foreground' },
            { key: 'pendente', label: 'Pendentes', cls: 'border-amber-200 text-amber-700', activeCls: 'bg-amber-500 text-white border-amber-500' },
            { key: 'devolvido', label: 'Devolvidos', cls: 'border-red-200 text-red-700', activeCls: 'bg-red-600 text-white border-red-600' },
          ].map(f => {
            const isActive = filterStatus === f.key;
            return (
              <button key={f.key}
                onClick={() => { setFilterStatus(f.key); setSelected(new Set()); }}
                className={`px-4 py-2 text-xs font-semibold rounded-lg border transition-colors ${isActive ? f.activeCls : `bg-white hover:bg-gray-50 ${f.cls}`}`}>
                {f.label}
                <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full font-bold ${isActive ? 'bg-white/25' : 'bg-gray-100 text-muted-foreground'}`}>
                  {f.key === '' ? pending.length : pending.filter(c => c.status === f.key).length}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white border border-border rounded-xl p-4 flex flex-wrap items-end gap-3">
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
        <button onClick={() => { const now = new Date(); setFilterDateFrom(new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]); setFilterDateTo(new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0]); }}
          className="h-9 px-3 text-xs font-medium border border-border rounded-lg hover:bg-gray-50 text-muted-foreground">
          Mês Atual
        </button>
        {usuariosUnicos.length > 0 && (
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Usuário</label>
            <select value={filterUsuario} onChange={e => setFilterUsuario(e.target.value)}
              className="text-sm border border-border rounded-lg px-3 py-2 h-9">
              <option value="">Todos</option>
              {usuariosUnicos.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
        )}
        {(filterDateFrom || filterDateTo || filterUsuario) && (
          <button onClick={() => { setFilterDateFrom(''); setFilterDateTo(''); setFilterUsuario(''); setFilterStatus(''); }}
            className="h-9 flex items-center gap-1.5 px-3 text-xs text-red-600 border border-red-200 rounded-lg hover:bg-red-50">
            <X className="w-3.5 h-3.5" /> Limpar filtros
          </button>
        )}
        <div className="ml-auto text-xs text-muted-foreground self-center">
          {filtered.length} cheque{filtered.length !== 1 ? 's' : ''} encontrado{filtered.length !== 1 ? 's' : ''}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="py-16 text-center text-muted-foreground">
          <Package className="w-10 h-10 mx-auto mb-3 opacity-20" />
          <p className="font-medium">Nenhum cheque encontrado</p>
          <p className="text-sm mt-1">{filterCustody ? 'Tente outro filtro de custódia.' : 'Todos os cheques foram processados.'}</p>
        </div>
      ) : (
        <div className="bg-white border border-border rounded-xl overflow-hidden">
          <table className="w-full text-sm table-fixed">
            <colgroup>
              <col className="w-10" />
              <col className="w-24" />
              <col />
              <col className="w-44" />
              <col className="w-28" />
              <col className="w-28" />
              <col className="w-32" />
              <col className="w-36" />
              <col className="w-10" />
            </colgroup>
            <thead>
              <tr className="border-b border-border bg-gray-50/50">
                <th className="px-4 py-3">
                  <button onClick={toggleAll} className="text-muted-foreground hover:text-foreground transition-colors">
                    {allSelected ? <CheckSquare className="w-4 h-4 text-foreground" /> : <Square className="w-4 h-4" />}
                  </button>
                </th>
                <th className="text-left px-3 py-3 text-xs font-medium text-muted-foreground">Data</th>
                <th className="text-left px-3 py-3">
                  <button onClick={() => toggleSort('client_name')} className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">
                    Cliente <SortIcon field="client_name" />
                  </button>
                </th>
                <th className="text-left px-3 py-3 text-xs font-medium text-muted-foreground">Banco / Nº</th>
                <th className="text-right px-3 py-3">
                  <button onClick={() => toggleSort('value')} className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors ml-auto">
                    Valor <SortIcon field="value" />
                  </button>
                </th>
                <th className="text-left px-3 py-3">
                  <button onClick={() => toggleSort('compensation_date')} className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">
                    Compensação <SortIcon field="compensation_date" />
                  </button>
                </th>
                <th className="text-left px-3 py-3 text-xs font-medium text-muted-foreground">Custódia</th>
                <th className="text-left px-3 py-3">
                  <button onClick={() => toggleSort('usuario')} className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">
                    Operação por <SortIcon field="usuario" />
                  </button>
                </th>
                <th className="px-3 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {paginated.map((c, idx) => {
                const isSelected = selected.has(c.id);
                const custody = c.custody_status || 'em_maos';
                const isLastRow = idx === paginated.length - 1;
                const rowColor = {
                  pendente: 'bg-amber-50/70',
                  devolvido: 'bg-red-50/70',
                }[c.status] || 'bg-white';
                const isOpen = menuOpenId === c.id;
                return (
                  <tr key={c.id} className={`transition-colors ${rowColor} ${isSelected ? 'ring-2 ring-inset ring-blue-400' : ''}`}>
                    <td className="px-4 py-3">
                      <button onClick={() => toggleSelect(c.id)} className="text-muted-foreground hover:text-foreground transition-colors">
                        {isSelected ? <CheckSquare className="w-4 h-4 text-blue-600" /> : <Square className="w-4 h-4" />}
                      </button>
                    </td>
                    <td className="px-3 py-3 text-xs text-muted-foreground whitespace-nowrap">{formatDate(c.created_date?.split('T')[0])}</td>
                    <td className="px-3 py-3 font-medium text-sm truncate" title={c.client_name}>{c.client_name}</td>
                    <td className="px-3 py-3 text-xs text-muted-foreground truncate" title={`${c.bank_name} · #${c.check_number}`}>
                      <span className="font-medium text-foreground">{c.bank_name}</span>
                      <span className="mx-1">·</span>
                      <span className="font-mono">#{c.check_number}</span>
                    </td>
                    <td className="px-3 py-3 text-right font-mono font-semibold text-sm whitespace-nowrap">{formatCurrency(c.value)}</td>
                    <td className="px-3 py-3 text-sm whitespace-nowrap">{formatDate(c.compensation_date)}</td>
                    <td className="px-3 py-3">
                      <div className="relative">
                        <button
                          onMouseEnter={() => {
                            if (custodyTimeoutRef.current) clearTimeout(custodyTimeoutRef.current);
                            setOpenCustodyDropdown(c.id);
                          }}
                          onMouseLeave={() => {
                            custodyTimeoutRef.current = setTimeout(() => setOpenCustodyDropdown(null), 300);
                          }}
                          className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border cursor-pointer transition-colors hover:opacity-80 ${CUSTODY_COLORS[custody] || 'bg-gray-100 text-gray-600 border-gray-200'}`}
                        >
                          {CUSTODY_OPTIONS.find(o => o.value === custody)?.label}
                          <ChevronDown className="w-3 h-3 opacity-60" />
                        </button>
                        {openCustodyDropdown === c.id && (
                          <div
                            onMouseEnter={() => {
                              if (custodyTimeoutRef.current) clearTimeout(custodyTimeoutRef.current);
                              setOpenCustodyDropdown(c.id);
                            }}
                            onMouseLeave={() => {
                              custodyTimeoutRef.current = setTimeout(() => setOpenCustodyDropdown(null), 300);
                            }}
                            className="absolute left-0 top-full mt-1 bg-white border border-border rounded-xl shadow-xl z-20 min-w-[190px] overflow-hidden"
                          >
                            {CUSTODY_OPTIONS.map(opt => (
                              <button
                                key={opt.value}
                                onClick={() => {
                                  updateCustodySingle(c, opt.value);
                                  setOpenCustodyDropdown(null);
                                }}
                                className={`w-full text-left px-3 py-2 text-xs hover:bg-gray-50 flex items-center gap-2 border-b border-border last:border-0 ${custody === opt.value ? 'font-bold' : ''}`}
                              >
                                {opt.label}
                                <span className="text-muted-foreground ml-auto">{custody === opt.value ? '✔' : ''}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-xs text-muted-foreground truncate" title={getUsuarioNome(c)}>{getUsuarioNome(c)}</td>
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
                                <button onClick={() => { setMenuOpenId(null); onCompensarCheque(c); }}
                                  className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-emerald-700 hover:bg-emerald-50 text-left">
                                  <CheckCircle2 className="w-3.5 h-3.5" /> Compensar
                                </button>
                                <button onClick={() => { setMenuOpenId(null); onProrrogarCheque(c); }}
                                  className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-blue-700 hover:bg-blue-50 text-left">
                                  <Calendar className="w-3.5 h-3.5" /> Prorrogar
                                </button>
                                <button onClick={() => { setMenuOpenId(null); onUpdateStatus(c, 'devolvido', 'Devolvido pelo banco'); }}
                                  className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-red-700 hover:bg-red-50 text-left">
                                  <CornerUpLeft className="w-3.5 h-3.5" /> Devolver
                                </button>
                              </>
                            )}
                            {c.status === 'devolvido' && (
                              <div className="px-3 py-2 text-xs text-muted-foreground italic">Resolver na lista geral</div>
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