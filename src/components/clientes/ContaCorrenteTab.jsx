import { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { formatCurrency, formatDate } from '@/lib/finance';
import { DataTable, TableHead, Th, TableBody, Tr, Td, EmptyRow } from '@/components/ui/DataTable';
import StatusBadge from '@/components/ui/StatusBadge';
import { Plus, Wallet, TrendingDown, TrendingUp, Clock, Download, Search, RefreshCw, Loader2, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { exportToCsv } from '@/lib/exportCsv';
import NovoCreditoModal from '@/components/clientes/NovoCreditoModal';
import NovaAntecipacaoModal from '@/components/clientes/NovaAntecipacaoModal';
import BaixaLancamentoModal from '@/components/clientes/BaixaLancamentoModal';
import LimiteRotativoPanel from '@/components/clientes/LimiteRotativoPanel';

const TYPE_LABELS = {
  antecipacao: 'Antecipação', emprestimo: 'Empréstimo', cheque: 'Cheque', boleto: 'Boleto',
  parcela: 'Parcela', pagamento_dinheiro: 'Pag. Dinheiro', pagamento_pix: 'Pag. Pix',
  pagamento_transferencia: 'Pag. Transferência', pagamento_cartao: 'Pag. Cartão',
  baixa_manual: 'Baixa Manual', ajuste_saldo: 'Ajuste de Saldo', estorno: 'Estorno',
  desconto: 'Desconto', acrescimo: 'Acréscimo', taxa: 'Taxa', limite_rotativo: 'Limite Rotativo'
};

export default function ContaCorrenteTab({ clientId, client }) {
  const [lancamentos, setLancamentos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [showCreditoModal, setShowCreditoModal] = useState(false);
  const [showAntecipacaoModal, setShowAntecipacaoModal] = useState(false);
  const [selectedLancamento, setSelectedLancamento] = useState(null);
  const [showBaixaModal, setShowBaixaModal] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [sortField, setSortField] = useState('date');
  const [sortDir, setSortDir] = useState('desc');

  const loadData = useCallback(async () => {
    const data = await base44.entities.LancamentoContaCorrente.filter({ client_id: clientId }, 'date', 200);
    setLancamentos(data);
    setLoading(false);
  }, [clientId]);

  useEffect(() => { loadData(); }, [loadData]);

  const filtered = lancamentos.filter(l => {
    const matchSearch = !search || l.description?.toLowerCase().includes(search.toLowerCase()) || TYPE_LABELS[l.type]?.toLowerCase().includes(search.toLowerCase());
    const matchType = !typeFilter || l.type === typeFilter;
    return matchSearch && matchType;
  });

  const sorted = [...filtered].sort((a, b) => {
    const va = a[sortField];
    const vb = b[sortField];
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    const cmp = typeof va === 'number' ? va - vb : String(va).localeCompare(String(vb));
    return sortDir === 'asc' ? cmp : -cmp;
  });

  const toggleSort = (field) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const SortTh = ({ field, children, right }) => (
    <th
      onClick={() => toggleSort(field)}
      className={`px-5 py-3.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer select-none hover:text-foreground transition-colors ${right ? 'text-right' : 'text-left'}`}
    >
      <span className="inline-flex items-center gap-1">
        {children}
        {sortField === field
          ? (sortDir === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)
          : <ArrowUpDown className="w-3 h-3 opacity-40" />
        }
      </span>
    </th>
  );

  const totalDebito = lancamentos
    .filter(l => l.nature === 'debito' && l.status !== 'cancelado')
    .reduce((s, l) => s + Math.max(0, (l.debit_amount || l.gross_value || 0) - (l.amortized_amount || 0)), 0);
  const totalCredito = lancamentos.filter(l => l.nature === 'credito' && l.status !== 'cancelado').reduce((s, l) => s + (l.credit_amount || l.net_value || l.gross_value || 0), 0);
  const saldoAtual = totalCredito - totalDebito;
  const vencidos = lancamentos.filter(l => l.status === 'vencido' || (l.due_date && l.due_date < new Date().toISOString().split('T')[0] && l.status === 'em_aberto'));

  const refresh = () => { setLoading(true); loadData(); };

  const handleSync = async () => {
    setSyncing(true);
    await base44.functions.invoke('syncOperationsToContaCorrente', { client_id: clientId });
    setSyncing(false);
    setLoading(true);
    loadData();
  };

  const getStatusBadge = (lanc) => {
    if (lanc.due_date && lanc.due_date < new Date().toISOString().split('T')[0] && lanc.status === 'em_aberto') {
      return <StatusBadge status="vencido" />;
    }
    return <StatusBadge status={lanc.status} />;
  };

  if (loading) return (
    <div className="flex items-center justify-center h-40">
      <div className="w-6 h-6 border-2 border-border border-t-foreground rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Cards de resumo */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white border border-border rounded-xl p-4">
          <div className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-1">Saldo Atual</div>
          <div className={`text-lg font-bold ${saldoAtual >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
            {formatCurrency(saldoAtual)}
          </div>
        </div>
        <div className="bg-white border border-border rounded-xl p-4">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium uppercase tracking-wider mb-1">
            <TrendingDown className="w-3 h-3 text-red-500" /> Total Débito
          </div>
          <div className="text-lg font-bold text-red-600">{formatCurrency(totalDebito)}</div>
        </div>
        <div className="bg-white border border-border rounded-xl p-4">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium uppercase tracking-wider mb-1">
            <TrendingUp className="w-3 h-3 text-emerald-500" /> Total Crédito
          </div>
          <div className="text-lg font-bold text-emerald-600">{formatCurrency(totalCredito)}</div>
        </div>
        <div className="bg-white border border-border rounded-xl p-4">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium uppercase tracking-wider mb-1">
            <Clock className="w-3 h-3 text-amber-500" /> Vencidos
          </div>
          <div className="text-lg font-bold text-amber-600">{vencidos.length} ({formatCurrency(vencidos.reduce((s, l) => s + Math.max(0, (l.debit_amount || l.gross_value || 0) - (l.amortized_amount || 0)), 0))})</div>
        </div>
      </div>

      {/* Painel Limite Rotativo */}
      <LimiteRotativoPanel client={client} />

      {/* Ações */}
      <div className="flex flex-wrap gap-2">
        <button onClick={() => setShowAntecipacaoModal(true)}
          className="flex items-center gap-1.5 px-4 py-2 bg-foreground text-primary-foreground text-xs font-semibold rounded-lg hover:bg-foreground/90">
          <Plus className="w-3.5 h-3.5" /> Nova Antecipação
        </button>
        <button onClick={() => setShowCreditoModal(true)}
          className="flex items-center gap-1.5 px-4 py-2 border border-emerald-200 text-emerald-700 bg-emerald-50 text-xs font-semibold rounded-lg hover:bg-emerald-100">
          <Wallet className="w-3.5 h-3.5" /> Adicionar Crédito
        </button>
        <button onClick={handleSync} disabled={syncing}
          className="flex items-center gap-1.5 px-4 py-2 border border-border text-xs font-semibold rounded-lg hover:bg-gray-50 disabled:opacity-50">
          {syncing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          {syncing ? 'Sincronizando...' : 'Sincronizar Operações'}
        </button>
      </div>

      {/* Info saldo positivo */}
      {saldoAtual > 0 && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3 text-sm text-emerald-700">
          Cliente possui crédito disponível de <strong>{formatCurrency(saldoAtual)}</strong>
        </div>
      )}

      {/* Filtros */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input className="input-field pl-8 text-xs" placeholder="Buscar lançamento..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="input-field text-xs w-auto" value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
          <option value="">Todos os tipos</option>
          {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <button onClick={() => exportToCsv(filtered, [
          { key: 'date', label: 'Data' }, { key: 'type', label: 'Tipo' }, { key: 'nature', label: 'Natureza' },
          { key: 'description', label: 'Descrição' }, { key: 'gross_value', label: 'Valor Bruto' },
          { key: 'net_value', label: 'Valor Líquido' }, { key: 'debit_amount', label: 'Débito' },
          { key: 'credit_amount', label: 'Crédito' }, { key: 'balance_after', label: 'Saldo Após' },
          { key: 'status', label: 'Status' }
        ], `conta_corrente_${client?.name?.toLowerCase().replace(/\s/g, '_')}`)}
          className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border border-border rounded-lg hover:bg-gray-50">
          <Download className="w-3.5 h-3.5" /> Exportar
        </button>
      </div>

      {/* Tabela */}
      <DataTable>
        <TableHead>
          <SortTh field="date">Data</SortTh>
          <SortTh field="type">Tipo</SortTh>
          <SortTh field="description">Descrição</SortTh>
          <SortTh field="gross_value" right>Valor Bruto</SortTh>
          <SortTh field="rate" right>Taxa</SortTh>
          <SortTh field="due_date">Vencimento</SortTh>
          <SortTh field="debit_amount" right>Débito</SortTh>
          <SortTh field="credit_amount" right>Crédito</SortTh>
          <SortTh field="balance_after" right>Saldo</SortTh>
          <SortTh field="status">Status</SortTh>
          <th className="px-5 py-3.5" />
        </TableHead>
        <TableBody>
          {sorted.map(l => (
            <Tr key={l.id}>
              <Td muted>{formatDate(l.date)}</Td>
              <Td><span className="text-xs font-medium px-2 py-0.5 bg-gray-100 rounded-full">{TYPE_LABELS[l.type] || l.type}</span></Td>
              <Td className="max-w-[180px] truncate">{l.description || '—'}</Td>
              <Td right mono>{formatCurrency(l.gross_value)}</Td>
              <Td right>{l.rate ? `${l.rate}%` : '—'}</Td>
              <Td muted>{l.due_date ? formatDate(l.due_date) : '—'}</Td>
              <Td right mono className="text-red-600 font-semibold">{l.debit_amount ? formatCurrency(l.debit_amount) : '—'}</Td>
              <Td right mono className="text-emerald-600 font-semibold">{l.credit_amount ? formatCurrency(l.credit_amount) : '—'}</Td>
              <Td right mono className={l.balance_after >= 0 ? 'text-emerald-600 font-bold' : 'text-red-600 font-bold'}>
                {l.balance_after != null ? formatCurrency(l.balance_after) : '—'}
              </Td>
              <Td>{getStatusBadge(l)}</Td>
              <Td>
                {l.status === 'em_aberto' && l.nature === 'debito' && (
                  <button onClick={() => { setSelectedLancamento(l); setShowBaixaModal(true); }}
                    className="text-xs text-[hsl(43,65%,47%)] hover:underline font-medium">Baixar</button>
                )}
              </Td>
            </Tr>
          ))}
          {sorted.length === 0 && <EmptyRow colSpan={11} message="Nenhum lançamento encontrado." />}
        </TableBody>
      </DataTable>

      {/* Modais */}
      {showCreditoModal && (
        <NovoCreditoModal client={client} onClose={() => setShowCreditoModal(false)} onSaved={refresh} />
      )}
      {showAntecipacaoModal && (
        <NovaAntecipacaoModal client={client} onClose={() => setShowAntecipacaoModal(false)} onSaved={refresh} />
      )}
      {showBaixaModal && selectedLancamento && (
        <BaixaLancamentoModal lancamento={selectedLancamento} client={client} onClose={() => { setShowBaixaModal(false); setSelectedLancamento(null); }} onSaved={refresh} />
      )}
    </div>
  );
}