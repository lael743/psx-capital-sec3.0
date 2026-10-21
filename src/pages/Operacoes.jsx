import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Plus, Home, Search, Eye, ArrowUpRight, ArrowDownRight, DollarSign, List, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/finance';
import EtapaBadge from '@/components/operacao/EtapaBadge';

const ETAPA_CHIPS = [
  { key: '', label: 'Todas' },
  { key: 'rascunho', label: 'Rascunho' },
  { key: 'analise_credito', label: 'Análise de Crédito' },
  { key: 'confirmacao_titulos', label: 'Confirmação de Títulos' },
  { key: 'formalizacao', label: 'Formalização' },
  { key: 'assinatura', label: 'Assinatura' },
  { key: 'pagamento', label: 'Pagamento' },
  { key: 'finalizada', label: 'Finalizado' },
  { key: 'rejeitada', label: 'Rejeitada' },
];

const TABS = [
  { key: '', label: 'Operações' },
  { key: 'analise_credito', label: 'Análise de Crédito' },
  { key: 'rejeitada', label: 'Rejeitados' },
  { key: 'rascunho', label: 'Rascunho' },
];

const PRODUTO_BADGE = {
  cheque: { label: 'Cheque', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  boleto: { label: 'Duplicata', className: 'bg-blue-50 text-blue-700 border-blue-200' },
  capital_desagio: { label: 'Capital + Deságio', className: 'bg-purple-50 text-purple-700 border-purple-200' },
  emprestimo: { label: 'Empréstimo', className: 'bg-blue-50 text-blue-700 border-blue-200' },
  assinatura: { label: 'Assinatura', className: 'bg-teal-50 text-teal-700 border-teal-200' },
};

const ITEMS_PER_PAGE = 10;

export default function Operacoes() {
  const [operations, setOperations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterEtapa, setFilterEtapa] = useState('');
  const [filterType, setFilterType] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const PAGE = 200;

    const load = async () => {
      setLoading(true);
      setLoadError(false);
      try {
        let allOps = [];
        let cursor = null;
        for (let i = 0; i < 50; i += 1) {
          const page = await base44.entities.Operation.list({ sort: '-created_date', limit: PAGE, cursor });
          const items = page?.items || [];
          allOps = allOps.concat(items);
          if (!page?.has_more || !page?.next_cursor || items.length === 0) break;
          cursor = page.next_cursor;
        }
        if (!cancelled) setOperations(allOps);
      } catch {
        if (!cancelled) setLoadError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [reloadKey]);

  // Generate sequential operation numbers by creation order
  const opNumberMap = useMemo(() => {
    const sorted = [...operations].sort((a, b) => new Date(a.created_date) - new Date(b.created_date));
    const map = new Map();
    sorted.forEach((op, i) => map.set(op.id, i + 1));
    return map;
  }, [operations]);

  // Count per etapa chip
  const etapaCounts = useMemo(() => {
    const counts = {};
    ETAPA_CHIPS.forEach(chip => {
      if (chip.key === '') counts[chip.key] = operations.length;
      else counts[chip.key] = operations.filter(op => (op.etapa || 'rascunho') === chip.key).length;
    });
    return counts;
  }, [operations]);

  // Filtered operations
  const filtered = useMemo(() => {
    return operations.filter(op => {
      const opNum = String(op.numero_operacao || opNumberMap.get(op.id) || '').padStart(6, '0');
      const q = search.replace('#', '').toLowerCase().trim();
      const matchSearch = !q ||
        op.client_name?.toLowerCase().includes(q) ||
        opNum.includes(q);
      const matchEtapa = !filterEtapa || (op.etapa || 'rascunho') === filterEtapa;
      const matchType = !filterType || op.produto === filterType || op.type === filterType;
      const opDate = op.created_date?.split('T')[0];
      const matchDateFrom = !dateFrom || opDate >= dateFrom;
      const matchDateTo = !dateTo || opDate <= dateTo;
      return matchSearch && matchEtapa && matchType && matchDateFrom && matchDateTo;
    });
  }, [operations, search, filterEtapa, filterType, dateFrom, dateTo, opNumberMap]);

  // Totals
  const totals = useMemo(() => {
    const nonRejected = filtered.filter(o => (o.etapa || 'rascunho') !== 'rejeitada');
    const totalBruto = nonRejected.reduce((s, o) => s + (o.total_receivable || 0), 0);
    const totalLiquido = nonRejected.reduce((s, o) => s + (o.net_value || o.gross_value || 0), 0);
    return { count: nonRejected.length, totalBruto, totalDesagio: totalBruto - totalLiquido, totalLiquido };
  }, [filtered]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  const safePage = Math.min(currentPage, totalPages);
  const paginated = filtered.slice((safePage - 1) * ITEMS_PER_PAGE, safePage * ITEMS_PER_PAGE);

  const handleFilterChange = (newEtapa) => {
    setFilterEtapa(newEtapa);
    setCurrentPage(1);
  };

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground mb-3">
        <Home className="w-3.5 h-3.5" />
        <span>Operações</span>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Operações</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Esteira de operações de antecipação de recebíveis</p>
        </div>
        <Link
          to="/operacoes/nova"
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-foreground text-primary-foreground text-sm font-semibold rounded-lg hover:bg-foreground/90 transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" /> Nova Operação
        </Link>
      </div>

      {/* Status chips */}
      <div className="flex items-center gap-2 mb-6 overflow-x-auto pb-1">
        {ETAPA_CHIPS.map(chip => {
          const count = etapaCounts[chip.key] || 0;
          const active = filterEtapa === chip.key;
          return (
            <button
              key={chip.key}
              onClick={() => handleFilterChange(chip.key)}
              className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                active
                  ? 'bg-foreground text-primary-foreground border-foreground'
                  : 'bg-white text-muted-foreground border-border hover:border-foreground/30'
              }`}
            >
              {chip.label}
              <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${active ? 'bg-white/20' : 'bg-gray-100'}`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-white border border-border rounded-xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
            <List className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Operações</p>
            <p className="text-lg font-bold">{totals.count}</p>
          </div>
        </div>
        <div className="bg-white border border-border rounded-xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
            <ArrowUpRight className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">TOTAL BRUTO</p>
            <p className="text-lg font-bold">{formatCurrency(totals.totalBruto)}</p>
          </div>
        </div>
        <div className="bg-white border border-border rounded-xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-red-50 flex items-center justify-center shrink-0">
            <ArrowDownRight className="w-5 h-5 text-red-600" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">TOTAL DESÁGIO</p>
            <p className="text-lg font-bold text-red-600">{formatCurrency(totals.totalDesagio)}</p>
          </div>
        </div>
        <div className="bg-white border border-border rounded-xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0">
            <DollarSign className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">TOTAL LÍQUIDO</p>
            <p className="text-lg font-bold text-emerald-600">{formatCurrency(totals.totalLiquido)}</p>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
            placeholder="Buscar por nº, cedente..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <select
          value={filterType}
          onChange={(e) => { setFilterType(e.target.value); setCurrentPage(1); }}
          className="px-3 py-2 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">Todos</option>
          <option value="cheque">Cheque</option>
          <option value="boleto">Duplicata</option>
          <option value="emprestimo">Empréstimo</option>
          <option value="capital_desagio">Capital + Deságio</option>
          <option value="assinatura">Assinatura</option>
        </select>
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => { setDateFrom(e.target.value); setCurrentPage(1); }}
          className="px-3 py-2 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <input
          type="date"
          value={dateTo}
          onChange={(e) => { setDateTo(e.target.value); setCurrentPage(1); }}
          className="px-3 py-2 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      {/* Secondary tabs */}
      <div className="flex items-center gap-1 mb-4 border-b border-border">
        {TABS.map(tab => {
          const active = filterEtapa === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => handleFilterChange(tab.key)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
                active
                  ? 'border-accent text-accent'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="w-6 h-6 border-2 border-border border-t-foreground rounded-full animate-spin" />
        </div>
      ) : loadError ? (
        <div className="bg-white border border-border rounded-xl py-12 text-center">
          <p className="text-sm text-muted-foreground">Não foi possível carregar as operações.</p>
          <button
            onClick={() => setReloadKey(k => k + 1)}
            className="mt-3 inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold border border-border rounded-lg hover:bg-gray-50 transition-colors"
          >
            Tentar novamente
          </button>
        </div>
      ) : (
        <div className="bg-white border border-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-gray-50/80">
                  <th className="px-5 py-3.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-left">N° OP</th>
                  <th className="px-5 py-3.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-left">Cedente</th>
                  <th className="px-5 py-3.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-left">Data</th>
                  <th className="px-5 py-3.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-left">Tipo</th>
                  <th className="px-5 py-3.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-right">Total Bruto</th>
                  <th className="px-5 py-3.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-right">Vlr Líquido</th>
                  <th className="px-5 py-3.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-left">Etapa</th>
                  <th className="px-5 py-3.5"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {paginated.map(op => {
                  const opNum = `#${String(op.numero_operacao || opNumberMap.get(op.id) || 0).padStart(6, '0')}`;
                  const tipoKey = op.type || 'cheque';
                  const produtoBadge = PRODUTO_BADGE[tipoKey] || PRODUTO_BADGE.cheque;
                  return (
                    <tr key={op.id} className="hover:bg-gray-50/60 transition-colors">
                      <td className="px-5 py-3.5 font-mono text-xs text-muted-foreground">{opNum}</td>
                      <td className="px-5 py-3.5 font-semibold">{op.client_name || '—'}</td>
                      <td className="px-5 py-3.5 text-muted-foreground">{formatDate(op.created_date)}</td>
                      <td className="px-5 py-3.5">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${produtoBadge.className}`}>
                          {produtoBadge.label}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-right font-mono">{formatCurrency(op.total_receivable || 0)}</td>
                      <td className="px-5 py-3.5 text-right font-mono">{formatCurrency(op.net_value || op.gross_value || 0)}</td>
                      <td className="px-5 py-3.5"><EtapaBadge etapa={op.etapa || 'rascunho'} /></td>
                      <td className="px-5 py-3.5 text-right">
                        <Link
                          to={`/operacoes/${op.id}`}
                          className="p-1.5 rounded-md hover:bg-gray-100 inline-flex text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <Eye className="w-4 h-4" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
                {paginated.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-5 py-12 text-center text-muted-foreground text-sm">
                      Nenhuma operação encontrada.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-4">
          <button onClick={() => setCurrentPage(1)} disabled={safePage === 1} className="p-1.5 rounded-md hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed">
            <ChevronsLeft className="w-4 h-4" />
          </button>
          <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={safePage === 1} className="p-1.5 rounded-md hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="px-3 py-1 text-sm font-medium">{safePage}</span>
          <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={safePage === totalPages} className="p-1.5 rounded-md hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed">
            <ChevronRight className="w-4 h-4" />
          </button>
          <button onClick={() => setCurrentPage(totalPages)} disabled={safePage === totalPages} className="p-1.5 rounded-md hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed">
            <ChevronsRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}