import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { formatCurrency, formatDate } from '@/lib/finance';
import { ArrowUpCircle, ArrowDownCircle, X, Download } from 'lucide-react';
import { exportToCsv } from '@/lib/exportCsv';
import { fetchAll } from '@/lib/fetchAll';
import Pagination from '@/components/ui/Pagination';

const CATEGORY_LABELS = {
  compensacao_cheque: 'Compensação de Cheque',
  estorno_compensacao: 'Estorno de Compensação',
  remessa_banco: 'Remessa ao Banco',
  transferencia: 'Transferência',
  lucro_prorrogacao: 'Juros/Lucro Prorrogação',
  ajuste_saldo: 'Ajuste de Saldo',
  lancamento_avulso: 'Lançamento Avulso',
  repasse_cliente: 'Repasse ao Cliente',
  despesa: 'Despesa',
  receita: 'Receita',
  outro: 'Outro',
};

const METHOD_LABELS = {
  pix: 'PIX',
  dinheiro: 'Dinheiro',
  transferencia: 'Transferência',
  cheque: 'Cheque',
  outro: 'Outro',
};

export default function BancoExtratoTab({ banco }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const load = async () => {
    setLoading(true);
    // Busca TODOS os CashFlow (fonte única de verdade para movimentações bancárias)
    const cashflows = await fetchAll('CashFlow', '-date');

    // Lançamentos do CashFlow que mencionam este banco pelo nome
    const cfEntries = cashflows
      .filter(cf =>
        cf.description?.includes(banco.name) ||
        cf.description?.includes(`Banco: ${banco.name}`)
      )
      .map(cf => ({
        id: `cf_${cf.id}`,
        date: cf.date,
        type: cf.type,
        amount: cf.amount,
        description: cf.description,
        category: cf.category,
        method: cf.method,
        source: 'cashflow',
      }))
      .sort((a, b) => {
        if (b.date > a.date) return 1;
        if (b.date < a.date) return -1;
        return 0;
      });

    setEntries(cfEntries);
    setLoading(false);
  };

  useEffect(() => { load(); }, [banco.id]);

  const filtered = entries.filter(e => {
    if (filterType && e.type !== filterType) return false;
    if (filterDateFrom && e.date < filterDateFrom) return false;
    if (filterDateTo && e.date > filterDateTo) return false;
    return true;
  });

  // Paginação
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paginated = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  useEffect(() => { setPage(1); }, [filterType, filterDateFrom, filterDateTo, banco.id]);

  const totalEntradas = filtered.filter(e => e.type === 'entrada').reduce((s, e) => s + (e.amount || 0), 0);
  const totalSaidas = filtered.filter(e => e.type === 'saida').reduce((s, e) => s + (e.amount || 0), 0);
  const saldoPeriodo = totalEntradas - totalSaidas;

  const handleExport = () => {
    exportToCsv(filtered, [
      { key: 'date', label: 'Data' },
      { key: 'type', label: 'Tipo' },
      { key: 'category', label: 'Categoria' },
      { key: 'description', label: 'Descrição' },
      { key: 'amount', label: 'Valor (R$)' },
      { key: 'method', label: 'Método' },
    ], `extrato_${banco.name}`);
  };

  const getFirstDayOfMonth = () => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  };
  const getLastDayOfMonth = () => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
  };

  if (loading) return (
    <div className="flex items-center justify-center h-40">
      <div className="w-5 h-5 border-2 border-border border-t-foreground rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Resumo */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3">
          <div className="text-xs text-emerald-600 font-medium">Entradas</div>
          <div className="text-lg font-bold text-emerald-800 mt-0.5">{formatCurrency(totalEntradas)}</div>
          <div className="text-xs text-emerald-600">{filtered.filter(e => e.type === 'entrada').length} lançamento(s)</div>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-xl p-3">
          <div className="text-xs text-red-600 font-medium">Saídas</div>
          <div className="text-lg font-bold text-red-800 mt-0.5">{formatCurrency(totalSaidas)}</div>
          <div className="text-xs text-red-600">{filtered.filter(e => e.type === 'saida').length} lançamento(s)</div>
        </div>
        <div className={`border rounded-xl p-3 ${saldoPeriodo >= 0 ? 'bg-blue-50 border-blue-200' : 'bg-amber-50 border-amber-200'}`}>
          <div className={`text-xs font-medium ${saldoPeriodo >= 0 ? 'text-blue-600' : 'text-amber-600'}`}>Saldo Período</div>
          <div className={`text-lg font-bold mt-0.5 ${saldoPeriodo >= 0 ? 'text-blue-800' : 'text-amber-800'}`}>{formatCurrency(saldoPeriodo)}</div>
          <div className={`text-xs ${saldoPeriodo >= 0 ? 'text-blue-600' : 'text-amber-600'}`}>{filtered.length} moviment(s)</div>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white border border-border rounded-xl p-4 space-y-3">
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-end flex-wrap">
          {/* Tipo */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-2">Tipo</label>
            <div className="flex gap-0.5 bg-gray-100 rounded-lg p-1">
              {[
                { key: '', label: 'Todos' },
                { key: 'entrada', label: 'Entradas' },
                { key: 'saida', label: 'Saídas' },
              ].map(f => (
                <button key={f.key} onClick={() => setFilterType(f.key)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${filterType === f.key ? 'bg-white text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Período */}
          <div className="flex gap-2 items-end flex-wrap">
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
            <button onClick={() => { setFilterDateFrom(getFirstDayOfMonth()); setFilterDateTo(getLastDayOfMonth()); }}
              className="h-9 flex items-center gap-1.5 px-3 py-2 text-xs text-muted-foreground border border-border rounded-lg hover:bg-gray-50">
              Mês Atual
            </button>
            {(filterDateFrom || filterDateTo) && (
              <button onClick={() => { setFilterDateFrom(''); setFilterDateTo(''); }}
                className="h-9 flex items-center gap-1.5 px-3 py-2 text-xs text-red-600 border border-red-200 rounded-lg hover:bg-red-50">
                <X className="w-3.5 h-3.5" /> Limpar
              </button>
            )}
          </div>

          <button onClick={handleExport}
            className="h-9 ml-auto flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border border-border rounded-lg hover:bg-gray-50">
            <Download className="w-3.5 h-3.5" /> Exportar CSV
          </button>
        </div>
      </div>

      {/* Lista */}
      {filtered.length === 0 ? (
        <div className="py-12 text-center text-muted-foreground">
          <p className="font-medium">Nenhuma movimentação encontrada</p>
          <p className="text-sm mt-1">Ajuste os filtros ou verifique se há lançamentos para este banco.</p>
        </div>
      ) : (
        <div className="bg-white border border-border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-gray-50/50">
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Data</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Descrição</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground hidden sm:table-cell">Categoria</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground hidden sm:table-cell">Método</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground">Valor</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {paginated.map(e => (
                <tr key={e.id} className="hover:bg-gray-50/50">
                  <td className="px-4 py-3 text-sm text-muted-foreground whitespace-nowrap">{formatDate(e.date)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-start gap-2">
                      {e.type === 'entrada'
                        ? <ArrowUpCircle className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                        : <ArrowDownCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                      }
                      <span className="text-sm text-foreground leading-tight">{e.description}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground hidden sm:table-cell">
                    {CATEGORY_LABELS[e.category] || e.category || '—'}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground hidden sm:table-cell">
                    {METHOD_LABELS[e.method] || e.method || '—'}
                  </td>
                  <td className={`px-4 py-3 text-right font-mono font-semibold text-sm whitespace-nowrap ${e.type === 'entrada' ? 'text-emerald-700' : 'text-red-600'}`}>
                    {e.type === 'entrada' ? '+' : '-'}{formatCurrency(e.amount)}
                  </td>
                </tr>
              ))}
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
             itemName="movimentações"
            />
            )}
            </div>
            )}
            </div>
            );
            }