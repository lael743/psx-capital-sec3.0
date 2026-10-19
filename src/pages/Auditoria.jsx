import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Shield, Search, X, ChevronDown, Eye, FileText, Download } from 'lucide-react';
import { ACTION_LABELS, ENTITY_LABELS } from '@/lib/audit';
import { exportToCsv } from '@/lib/exportCsv';

const ACTION_COLORS = {
  create:         'bg-emerald-50 text-emerald-700 border-emerald-200',
  update:         'bg-blue-50 text-blue-700 border-blue-200',
  delete:         'bg-red-50 text-red-700 border-red-200',
  payment:        'bg-amber-50 text-amber-700 border-amber-200',
  compensar:      'bg-teal-50 text-teal-700 border-teal-200',
  devolver:       'bg-red-50 text-red-700 border-red-200',
  prorrogar:      'bg-blue-50 text-blue-700 border-blue-200',
  custody_change: 'bg-purple-50 text-purple-700 border-purple-200',
  status_change:  'bg-orange-50 text-orange-700 border-orange-200',
  disbursement:   'bg-indigo-50 text-indigo-700 border-indigo-200',
  upload:         'bg-pink-50 text-pink-700 border-pink-200',
  view:           'bg-gray-100 text-gray-600 border-gray-300',
  export:         'bg-gray-100 text-gray-600 border-gray-300',
};

const ALL_ACTIONS = Object.keys(ACTION_LABELS);
const ALL_ENTITIES = Object.keys(ENTITY_LABELS);

function fmtDateTime(dt) {
  if (!dt) return '—';
  return new Date(dt).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

function JsonDiff({ before, after }) {
  if (!before && !after) return null;
  const keys = new Set([
    ...Object.keys(before || {}),
    ...Object.keys(after || {}),
  ]);
  const rows = [];
  for (const key of keys) {
    const b = before?.[key];
    const a = after?.[key];
    if (JSON.stringify(b) === JSON.stringify(a)) continue;
    rows.push({ key, from: b, to: a });
  }
  if (rows.length === 0) return <p className="text-xs text-muted-foreground italic">Sem diferenças detectadas.</p>;
  return (
    <div className="space-y-1.5">
      {rows.map(r => (
        <div key={r.key} className="text-xs rounded-lg overflow-hidden border border-border">
          <div className="bg-gray-100 px-3 py-1 font-semibold text-muted-foreground">{r.key}</div>
          <div className="grid grid-cols-2 divide-x divide-border">
            <div className="px-3 py-2 bg-red-50 text-red-800 font-mono break-all whitespace-pre-wrap">
              {r.from !== undefined && r.from !== null ? String(r.from) : <em className="opacity-40">vazio</em>}
            </div>
            <div className="px-3 py-2 bg-emerald-50 text-emerald-800 font-mono break-all whitespace-pre-wrap">
              {r.to !== undefined && r.to !== null ? String(r.to) : <em className="opacity-40">vazio</em>}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function DetailModal({ log, onClose }) {
  if (!log) return null;
  const hasDiff = log.before || log.after;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-muted-foreground" />
            <div>
              <h3 className="text-sm font-bold">Detalhes do Log</h3>
              <p className="text-xs text-muted-foreground mt-0.5">{fmtDateTime(log.created_date)}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100"><X className="w-4 h-4" /></button>
        </div>
        <div className="overflow-y-auto flex-1 p-5 space-y-4">
          {/* Meta */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="bg-gray-50 rounded-xl p-3">
              <div className="text-xs text-muted-foreground mb-1">Usuário</div>
              <div className="font-semibold">{log.user_name || '—'}</div>
              <div className="text-xs text-muted-foreground">{log.user_email}</div>
            </div>
            <div className="bg-gray-50 rounded-xl p-3">
              <div className="text-xs text-muted-foreground mb-1">Ação / Entidade</div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold border ${ACTION_COLORS[log.action] || 'bg-gray-100 text-gray-600 border-gray-300'}`}>
                  {ACTION_LABELS[log.action] || log.action}
                </span>
                <span className="text-xs font-medium text-muted-foreground">{ENTITY_LABELS[log.entity] || log.entity}</span>
              </div>
            </div>
          </div>

          <div className="bg-gray-50 rounded-xl p-3">
            <div className="text-xs text-muted-foreground mb-1">Descrição</div>
            <p className="text-sm font-medium">{log.description}</p>
          </div>

          {log.entity_id && (
            <div className="text-xs text-muted-foreground">
              ID do registro: <span className="font-mono bg-gray-100 px-1.5 py-0.5 rounded">{log.entity_id}</span>
            </div>
          )}

          {hasDiff && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Alterações detectadas</div>
                <div className="flex gap-3 ml-auto text-xs">
                  <span className="text-red-600 font-semibold">← Antes</span>
                  <span className="text-emerald-600 font-semibold">Depois →</span>
                </div>
              </div>
              <JsonDiff before={log.before} after={log.after} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Auditoria() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterAction, setFilterAction] = useState('');
  const [filterEntity, setFilterEntity] = useState('');
  const [filterUser, setFilterUser] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [selectedLog, setSelectedLog] = useState(null);

  useEffect(() => {
    base44.entities.AuditLog.list('-created_date', 500).then(data => {
      setLogs(data);
      setLoading(false);
    });
  }, []);

  // Unique users for filter dropdown
  const uniqueUsers = [...new Set(logs.map(l => l.user_email).filter(Boolean))];

  const filtered = logs.filter(l => {
    if (filterAction && l.action !== filterAction) return false;
    if (filterEntity && l.entity !== filterEntity) return false;
    if (filterUser && l.user_email !== filterUser) return false;
    if (filterDateFrom && l.created_date < filterDateFrom) return false;
    if (filterDateTo) {
      const endOfDay = filterDateTo + 'T23:59:59';
      if (l.created_date > endOfDay) return false;
    }
    if (search) {
      const q = search.toLowerCase();
      const match = [l.description, l.user_name, l.user_email, l.entity, l.action, l.entity_id]
        .some(v => (v || '').toLowerCase().includes(q));
      if (!match) return false;
    }
    return true;
  });

  const hasFilters = filterAction || filterEntity || filterUser || filterDateFrom || filterDateTo || search;

  const clearFilters = () => {
    setSearch(''); setFilterAction(''); setFilterEntity('');
    setFilterUser(''); setFilterDateFrom(''); setFilterDateTo('');
  };

  const handleExport = () => {
    exportToCsv(filtered.map(l => ({
      ...l,
      created_date: fmtDateTime(l.created_date),
      action: ACTION_LABELS[l.action] || l.action,
      entity: ENTITY_LABELS[l.entity] || l.entity,
    })), [
      { key: 'created_date', label: 'Data/Hora' },
      { key: 'user_name', label: 'Usuário' },
      { key: 'user_email', label: 'E-mail' },
      { key: 'action', label: 'Ação' },
      { key: 'entity', label: 'Entidade' },
      { key: 'description', label: 'Descrição' },
    ], 'auditoria');
  };

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      {selectedLog && <DetailModal log={selectedLog} onClose={() => setSelectedLog(null)} />}

      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gray-100 rounded-lg">
            <Shield className="w-5 h-5 text-muted-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Log de Auditoria</h1>
            <p className="text-sm text-muted-foreground">Histórico completo de ações no sistema</p>
          </div>
        </div>
        <button onClick={handleExport}
          className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border border-border rounded-lg hover:bg-gray-50 self-start">
          <Download className="w-3.5 h-3.5" /> Exportar CSV
        </button>
      </div>

      {/* Filtros */}
      <div className="bg-white border border-border rounded-xl p-4 mb-4 space-y-3">
        {/* Busca */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Buscar por descrição, usuário, entidade, ID..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-9 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-ring"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Filtros em linha */}
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Ação</label>
            <select value={filterAction} onChange={e => setFilterAction(e.target.value)}
              className="text-sm border border-border rounded-lg px-3 py-2 h-9">
              <option value="">Todas as ações</option>
              {ALL_ACTIONS.map(a => (
                <option key={a} value={a}>{ACTION_LABELS[a]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Entidade</label>
            <select value={filterEntity} onChange={e => setFilterEntity(e.target.value)}
              className="text-sm border border-border rounded-lg px-3 py-2 h-9">
              <option value="">Todas as entidades</option>
              {ALL_ENTITIES.map(e => (
                <option key={e} value={e}>{ENTITY_LABELS[e]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Usuário</label>
            <select value={filterUser} onChange={e => setFilterUser(e.target.value)}
              className="text-sm border border-border rounded-lg px-3 py-2 h-9">
              <option value="">Todos os usuários</option>
              {uniqueUsers.map(u => (
                <option key={u} value={u}>{u}</option>
              ))}
            </select>
          </div>
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
          {hasFilters && (
            <button onClick={clearFilters}
              className="h-9 flex items-center gap-1.5 px-3 text-xs text-muted-foreground border border-border rounded-lg hover:bg-gray-50">
              <X className="w-3.5 h-3.5" /> Limpar filtros
            </button>
          )}
          <div className="ml-auto text-xs text-muted-foreground self-center">
            {filtered.length} registro{filtered.length !== 1 ? 's' : ''}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="w-6 h-6 border-2 border-border border-t-foreground rounded-full animate-spin" />
        </div>
      ) : (
        <div className="bg-white border border-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-gray-50/50">
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground whitespace-nowrap">Data/Hora</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Usuário</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Ação</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Entidade</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Descrição</th>
                  <th className="px-4 py-3 text-xs font-medium text-muted-foreground text-center">Detalhes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map(log => (
                  <tr key={log.id} className="hover:bg-gray-50/50">
                    <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap font-mono">
                      {fmtDateTime(log.created_date)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-xs font-semibold">{log.user_name || '—'}</div>
                      <div className="text-xs text-muted-foreground">{log.user_email}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold border whitespace-nowrap ${ACTION_COLORS[log.action] || 'bg-gray-100 text-gray-600 border-gray-300'}`}>
                        {ACTION_LABELS[log.action] || log.action}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs font-medium text-muted-foreground whitespace-nowrap">
                      {ENTITY_LABELS[log.entity] || log.entity}
                    </td>
                    <td className="px-4 py-3 text-xs max-w-[320px] truncate" title={log.description}>
                      {log.description}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => setSelectedLog(log)}
                        className="inline-flex items-center justify-center w-7 h-7 rounded-lg hover:bg-gray-100 text-muted-foreground hover:text-foreground transition-colors"
                        title="Ver detalhes"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-5 py-10 text-center text-muted-foreground">
                      Nenhum registro encontrado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}