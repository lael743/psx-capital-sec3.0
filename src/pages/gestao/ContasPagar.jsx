import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Search, CreditCard, Eye, Loader2 } from 'lucide-react';
import useListaServidor from '@/hooks/useListaServidor';
import useDebounce from '@/hooks/useDebounce';
import ObrigacaoDetalheModal from '@/components/gestao/ObrigacaoDetalheModal';
import RegistrarPagamentoModal from '@/components/gestao/RegistrarPagamentoModal';
import PagamentoDetalheModal from '@/components/gestao/PagamentoDetalheModal';
import StatusObrigacaoBadge from '@/components/gestao/StatusObrigacaoBadge';
import PaginacaoServidor from '@/components/gestao/PaginacaoServidor';
import { formatCurrency, formatDate } from '@/lib/finance';
import { STATUS_ABERTOS, hojeISO, meioPagamentoLabel, saldoObrigacao } from '@/lib/gestaoInterna';

/** Contas a pagar: obrigações individuais e histórico de pagamentos. */
export default function ContasPagar() {
  const [params] = useSearchParams();
  const [aba, setAba] = useState(params.get('aba') === 'pagamentos' ? 'pagamentos' : 'obrigacoes');

  const [busca, setBusca] = useState('');
  const buscaAplicada = useDebounce(busca);
  const [status, setStatus] = useState('');
  const [categoriaId, setCategoriaId] = useState('');
  const [contaId, setContaId] = useState('');
  const [periodo, setPeriodo] = useState('');

  const [categorias, setCategorias] = useState([]);
  const [contas, setContas] = useState([]);
  const [usuario, setUsuario] = useState(null);
  const [resumo, setResumo] = useState(null);

  const [detalhe, setDetalhe] = useState(null);
  const [pagando, setPagando] = useState(null);
  const [detalhePagamento, setDetalhePagamento] = useState(null);

  useEffect(() => {
    base44.auth.me().then(setUsuario).catch(() => setUsuario(null));
    base44.entities.CategoriaInterna.list({ sort: 'ordem', limit: 500 }).then(r => setCategorias(r?.items || [])).catch(() => setCategorias([]));
    base44.entities.ContaInterna.list({ sort: 'nome', limit: 200 }).then(r => setContas(r?.items || [])).catch(() => setContas([]));
  }, []);

  const intervalo = (mes) => {
    const [a, m] = mes.split('-').map(Number);
    return { $gte: `${mes}-01`, $lt: new Date(Date.UTC(a, m, 1)).toISOString().slice(0, 10) };
  };

  const filtroObrigacoes = useMemo(() => {
    const hoje = hojeISO();
    const q = {};
    if (buscaAplicada.trim()) q.descricao = { $regex: buscaAplicada.trim(), $options: 'i' };
    if (categoriaId) q.categoria_id = categoriaId;
    if (contaId) q.conta_pagamento_id = contaId;
    if (periodo) q.vencimento = intervalo(periodo);

    if (status === 'a_vencer') {
      q.status = { $in: ['a_vencer', 'vencido'] };
      q.vencimento = { $gte: hoje };
    } else if (status === 'vencido') {
      q.status = { $in: STATUS_ABERTOS };
      q.vencimento = { $lt: hoje };
    } else if (status) {
      q.status = status;
    }
    return q;
  }, [buscaAplicada, categoriaId, contaId, periodo, status]);

  const filtroPagamentos = useMemo(() => {
    const q = {};
    if (buscaAplicada.trim()) q.descricao = { $regex: buscaAplicada.trim(), $options: 'i' };
    if (contaId) q.conta_id = contaId;
    if (periodo) q.data_pagamento = intervalo(periodo);
    return q;
  }, [buscaAplicada, contaId, periodo]);

  const obrigacoes = useListaServidor('ObrigacaoInterna', filtroObrigacoes, { limit: 25, enabled: aba === 'obrigacoes' });
  const pagamentos = useListaServidor('PagamentoInterno', filtroPagamentos, { limit: 25, enabled: aba === 'pagamentos' });

  const carregarResumo = () => {
    if (aba !== 'obrigacoes') return;
    base44.entities.ObrigacaoInterna.aggregate({ query: filtroObrigacoes, sum: ['valor', 'valor_pago', 'saldo'] })
      .then(res => setResumo(res?.rows?.[0] || { count: 0, sum_valor: 0, sum_valor_pago: 0, sum_saldo: 0 }))
      .catch(() => setResumo(null));
  };

  useEffect(() => { carregarResumo(); }, [JSON.stringify(filtroObrigacoes), aba]);

  const recarregar = () => {
    obrigacoes.reload();
    pagamentos.reload();
    carregarResumo();
  };

  const isAdmin = usuario?.role === 'admin';

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-4">
      <div>
        <h1 className="text-xl font-bold text-foreground">Contas a Pagar</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Acompanhe cada parcela, registre pagamentos integrais ou parciais e consulte o histórico.</p>
      </div>

      {aba === 'obrigacoes' && resumo && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-white border border-border rounded-xl p-4">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Parcelas no filtro</p>
            <p className="text-lg font-bold">{resumo.count || 0}</p>
          </div>
          <div className="bg-white border border-border rounded-xl p-4">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Valor devido</p>
            <p className="text-lg font-bold font-mono">{formatCurrency(resumo.sum_valor || 0)}</p>
          </div>
          <div className="bg-white border border-border rounded-xl p-4">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Pago</p>
            <p className="text-lg font-bold font-mono text-emerald-600">{formatCurrency(resumo.sum_valor_pago || 0)}</p>
          </div>
          <div className="bg-white border border-border rounded-xl p-4">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Saldo pendente</p>
            <p className="text-lg font-bold font-mono text-amber-700">{formatCurrency(resumo.sum_saldo || 0)}</p>
          </div>
        </div>
      )}

      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
        <button onClick={() => setAba('obrigacoes')} className={`px-4 py-2 text-xs font-semibold rounded-md transition-colors ${aba === 'obrigacoes' ? 'bg-white shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
          Obrigações
        </button>
        <button onClick={() => setAba('pagamentos')} className={`px-4 py-2 text-xs font-semibold rounded-md transition-colors ${aba === 'pagamentos' ? 'bg-white shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
          Pagamentos
        </button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="Buscar por descrição..."
            className="w-full pl-9 pr-4 py-2.5 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-ring shadow-sm"
          />
        </div>
        <input type="month" className="text-sm border border-border rounded-lg px-3 py-2.5 bg-white" value={periodo} onChange={e => setPeriodo(e.target.value)} />
        {aba === 'obrigacoes' && (
          <>
            <select className="text-sm border border-border rounded-lg px-3 py-2.5 bg-white min-w-[160px]" value={status} onChange={e => setStatus(e.target.value)}>
              <option value="">Todos os status</option>
              <option value="a_vencer">A vencer</option>
              <option value="vencido">Vencido</option>
              <option value="parcialmente_pago">Parcialmente pago</option>
              <option value="pago">Pago</option>
              <option value="cancelado">Cancelado</option>
            </select>
            <select className="text-sm border border-border rounded-lg px-3 py-2.5 bg-white min-w-[170px]" value={categoriaId} onChange={e => setCategoriaId(e.target.value)}>
              <option value="">Todas as categorias</option>
              {categorias.map(c => <option key={c.id} value={c.id}>{c.parent_nome ? `${c.parent_nome} › ${c.nome}` : c.nome}</option>)}
            </select>
          </>
        )}
        <select className="text-sm border border-border rounded-lg px-3 py-2.5 bg-white min-w-[160px]" value={contaId} onChange={e => setContaId(e.target.value)}>
          <option value="">Todas as contas</option>
          {contas.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>
      </div>

      {aba === 'obrigacoes' ? (
        <div className="bg-white border border-border rounded-xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-gray-50/80">
                  <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-left">Descrição</th>
                  <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-left">Categoria</th>
                  <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-center">Parcela</th>
                  <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-left">Vencimento</th>
                  <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-right">Valor</th>
                  <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-right">Pago</th>
                  <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-right">Saldo</th>
                  <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-left">Status</th>
                  <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-left">Conta</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {obrigacoes.loading ? (
                  <tr><td colSpan={10} className="px-4 py-12 text-center"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground inline" /></td></tr>
                ) : obrigacoes.items.length === 0 ? (
                  <tr><td colSpan={10} className="px-4 py-12 text-center text-sm text-muted-foreground">Nenhuma obrigação encontrada.</td></tr>
                ) : obrigacoes.items.map(o => {
                  const saldo = saldoObrigacao(o);
                  return (
                    <tr key={o.id} className="hover:bg-gray-50/60 transition-colors">
                      <td className="px-4 py-3 text-xs max-w-[240px]"><span className="truncate block">{o.descricao}</span></td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{o.categoria_nome || '—'}</td>
                      <td className="px-4 py-3 text-xs text-center">{o.numero_parcela}/{o.total_parcelas}</td>
                      <td className="px-4 py-3 text-xs whitespace-nowrap">{formatDate(o.vencimento)}</td>
                      <td className="px-4 py-3 text-xs font-mono text-right whitespace-nowrap">{formatCurrency(o.valor)}</td>
                      <td className="px-4 py-3 text-xs font-mono text-right whitespace-nowrap text-emerald-600">{formatCurrency(o.valor_pago || 0)}</td>
                      <td className="px-4 py-3 text-xs font-mono text-right whitespace-nowrap font-semibold">{formatCurrency(saldo)}</td>
                      <td className="px-4 py-3"><StatusObrigacaoBadge obrigacao={o} /></td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{o.conta_pagamento_nome || '—'}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 justify-end">
                          {o.status !== 'pago' && o.status !== 'cancelado' && saldo > 0.005 && (
                            <button onClick={() => setPagando(o)} className="p-1.5 rounded hover:bg-gray-100 text-muted-foreground hover:text-foreground" title="Registrar pagamento">
                              <CreditCard className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button onClick={() => setDetalhe(o)} className="p-1.5 rounded hover:bg-gray-100 text-muted-foreground hover:text-foreground" title="Detalhes">
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="px-4 border-t border-border">
            <PaginacaoServidor
              page={obrigacoes.page} pageSize={obrigacoes.pageSize} total={obrigacoes.total}
              canPrev={obrigacoes.canPrev} canNext={obrigacoes.canNext}
              onPrev={obrigacoes.prev} onNext={obrigacoes.next} carregando={obrigacoes.loading}
            />
          </div>
        </div>
      ) : (
        <div className="bg-white border border-border rounded-xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-gray-50/80">
                  <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-left">Data</th>
                  <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-left">Obrigação</th>
                  <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-left">Conta</th>
                  <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-left">Forma</th>
                  <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-left">Referência</th>
                  <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-right">Valor</th>
                  <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-left">Situação</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {pagamentos.loading ? (
                  <tr><td colSpan={8} className="px-4 py-12 text-center"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground inline" /></td></tr>
                ) : pagamentos.items.length === 0 ? (
                  <tr><td colSpan={8} className="px-4 py-12 text-center text-sm text-muted-foreground">Nenhum pagamento encontrado.</td></tr>
                ) : pagamentos.items.map(p => (
                  <tr key={p.id} className={`hover:bg-gray-50/60 transition-colors ${p.estornado ? 'opacity-60' : ''}`}>
                    <td className="px-4 py-3 text-xs whitespace-nowrap">{formatDate(p.data_pagamento)}</td>
                    <td className="px-4 py-3 text-xs max-w-[260px]"><span className="truncate block">{p.descricao || '—'}</span></td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{p.conta_nome || '—'}</td>
                    <td className="px-4 py-3 text-xs">{meioPagamentoLabel(p.forma_pagamento)}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{p.referencia || '—'}</td>
                    <td className="px-4 py-3 text-xs font-mono font-semibold text-right whitespace-nowrap">{formatCurrency(p.valor_pago)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium border ${p.estornado ? 'bg-red-50 text-red-700 border-red-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
                        {p.estornado ? 'Estornado' : 'Confirmado'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end">
                        <button onClick={() => setDetalhePagamento(p)} className="p-1.5 rounded hover:bg-gray-100 text-muted-foreground hover:text-foreground" title="Detalhes">
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 border-t border-border">
            <PaginacaoServidor
              page={pagamentos.page} pageSize={pagamentos.pageSize} total={pagamentos.total}
              canPrev={pagamentos.canPrev} canNext={pagamentos.canNext}
              onPrev={pagamentos.prev} onNext={pagamentos.next} carregando={pagamentos.loading}
            />
          </div>
        </div>
      )}

      {detalhe && (
        <ObrigacaoDetalheModal
          open={!!detalhe}
          obrigacao={detalhe}
          contas={contas}
          isAdmin={isAdmin}
          onReload={recarregar}
          onClose={() => setDetalhe(null)}
          onPagar={(o) => { setDetalhe(null); setPagando(o); }}
        />
      )}

      {pagando && (
        <RegistrarPagamentoModal
          open={!!pagando}
          obrigacao={pagando}
          contas={contas}
          onClose={() => setPagando(null)}
          onSaved={recarregar}
        />
      )}

      {detalhePagamento && (
        <PagamentoDetalheModal
          open={!!detalhePagamento}
          pagamento={detalhePagamento}
          isAdmin={isAdmin}
          onReload={recarregar}
          onClose={() => setDetalhePagamento(null)}
        />
      )}
    </div>
  );
}