import { useEffect, useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Plus, Search, Pencil, Eye, Loader2 } from 'lucide-react';
import useListaServidor from '@/hooks/useListaServidor';
import useDebounce from '@/hooks/useDebounce';
import PatrimonioFormModal from '@/components/gestao/PatrimonioFormModal';
import PatrimonioDetalheModal from '@/components/gestao/PatrimonioDetalheModal';
import StatusPatrimonioBadge from '@/components/gestao/StatusPatrimonioBadge';
import PaginacaoServidor from '@/components/gestao/PaginacaoServidor';
import { formatCurrency, formatDate } from '@/lib/finance';
import { calcularDepreciacao } from '@/lib/gestaoInterna';

/** Patrimônio da empresa: bens, depreciação estimada e baixas. */
export default function Patrimonio() {
  const [busca, setBusca] = useState('');
  const buscaAplicada = useDebounce(busca);
  const [categoriaId, setCategoriaId] = useState('');
  const [status, setStatus] = useState('');

  const [categorias, setCategorias] = useState([]);
  const [usuario, setUsuario] = useState(null);
  const [resumo, setResumo] = useState(null);
  const [modalAberto, setModalAberto] = useState(false);
  const [editando, setEditando] = useState(null);
  const [detalhe, setDetalhe] = useState(null);

  useEffect(() => {
    base44.auth.me().then(setUsuario).catch(() => setUsuario(null));
    base44.entities.CategoriaInterna.list({ sort: 'ordem', limit: 500 }).then(r => setCategorias(r?.items || [])).catch(() => setCategorias([]));
  }, []);

  const filtro = useMemo(() => {
    const q = {};
    if (buscaAplicada.trim()) q.nome = { $regex: buscaAplicada.trim(), $options: 'i' };
    if (categoriaId) q.categoria_id = categoriaId;
    if (status) q.status = status;
    return q;
  }, [buscaAplicada, categoriaId, status]);

  const lista = useListaServidor('PatrimonioInterno', filtro, { limit: 25, sort: '-data_aquisicao' });

  useEffect(() => {
    base44.entities.PatrimonioInterno.aggregate({ query: filtro, groupBy: 'status', sum: ['valor_total'] })
      .then(res => {
        const rows = res?.rows || [];
        const totalAquisicao = rows.reduce((s, r) => s + (Number(r.sum_valor_total) || 0), 0);
        const total = rows.reduce((s, r) => s + (Number(r.count) || 0), 0);
        const ativos = Number(rows.find(r => r.status === 'ativo')?.count || 0);
        setResumo({ totalAquisicao, total, ativos });
      })
      .catch(() => setResumo(null));
  }, [JSON.stringify(filtro)]);

  const isAdmin = usuario?.role === 'admin';

  const recarregar = () => {
    lista.reload();
    base44.entities.PatrimonioInterno.aggregate({ query: filtro, groupBy: 'status', sum: ['valor_total'] })
      .then(res => {
        const rows = res?.rows || [];
        setResumo({
          totalAquisicao: rows.reduce((s, r) => s + (Number(r.sum_valor_total) || 0), 0),
          total: rows.reduce((s, r) => s + (Number(r.count) || 0), 0),
          ativos: Number(rows.find(r => r.status === 'ativo')?.count || 0),
        });
      })
      .catch(() => setResumo(null));
  };

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-foreground">Patrimônio</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Bens da empresa com valor contábil estimado e histórico de movimentações.</p>
        </div>
        <button onClick={() => { setEditando(null); setModalAberto(true); }} className="flex items-center gap-2 px-4 py-2.5 bg-foreground text-primary-foreground text-sm font-semibold rounded-lg hover:bg-foreground/90">
          <Plus className="w-4 h-4" /> Novo bem
        </button>
      </div>

      {resumo && (
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white border border-border rounded-xl p-4">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Valor de aquisição</p>
            <p className="text-lg font-bold font-mono">{formatCurrency(resumo.totalAquisicao)}</p>
          </div>
          <div className="bg-white border border-border rounded-xl p-4">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Bens ativos</p>
            <p className="text-lg font-bold">{resumo.ativos}</p>
          </div>
          <div className="bg-white border border-border rounded-xl p-4">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Total de bens</p>
            <p className="text-lg font-bold">{resumo.total}</p>
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="Buscar por nome do bem..."
            className="w-full pl-9 pr-4 py-2.5 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-ring shadow-sm"
          />
        </div>
        <select className="text-sm border border-border rounded-lg px-3 py-2.5 bg-white min-w-[180px]" value={categoriaId} onChange={e => setCategoriaId(e.target.value)}>
          <option value="">Todas as categorias</option>
          {categorias.filter(c => c.tipo === 'patrimonio').map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>
        <select className="text-sm border border-border rounded-lg px-3 py-2.5 bg-white min-w-[150px]" value={status} onChange={e => setStatus(e.target.value)}>
          <option value="">Todos os status</option>
          <option value="ativo">Ativo</option>
          <option value="em_manutencao">Em manutenção</option>
          <option value="baixado">Baixado</option>
          <option value="vendido">Vendido</option>
        </select>
      </div>

      <div className="bg-white border border-border rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-gray-50/80">
                <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-left">Bem</th>
                <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-left">Categoria</th>
                <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-center">Qtd</th>
                <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-left">Aquisição</th>
                <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-right">Valor de aquisição</th>
                <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-right">Valor contábil est.</th>
                <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-left">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {lista.loading ? (
                <tr><td colSpan={8} className="px-4 py-12 text-center"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground inline" /></td></tr>
              ) : lista.items.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-12 text-center text-sm text-muted-foreground">Nenhum bem encontrado.</td></tr>
              ) : lista.items.map(b => {
                const dep = calcularDepreciacao(b);
                return (
                  <tr key={b.id} className="hover:bg-gray-50/60 transition-colors">
                    <td className="px-4 py-3 text-xs max-w-[240px]">
                      <span className="truncate block font-medium">{b.nome}</span>
                      {b.responsavel && <span className="text-[10px] text-muted-foreground">{b.responsavel}</span>}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{b.categoria_nome || '—'}</td>
                    <td className="px-4 py-3 text-xs text-center">{b.quantidade || 1}</td>
                    <td className="px-4 py-3 text-xs whitespace-nowrap">{formatDate(b.data_aquisicao)}</td>
                    <td className="px-4 py-3 text-xs font-mono text-right whitespace-nowrap">{formatCurrency(b.valor_total || 0)}</td>
                    <td className="px-4 py-3 text-xs font-mono text-right whitespace-nowrap">
                      {formatCurrency(dep.valorContabil)}
                      {dep.aplicavel && <span className="block text-[10px] text-muted-foreground">dep. {formatCurrency(dep.depreciacaoAcumulada)}</span>}
                    </td>
                    <td className="px-4 py-3"><StatusPatrimonioBadge status={b.status} /></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        <button onClick={() => { setEditando(b); setModalAberto(true); }} className="p-1.5 rounded hover:bg-gray-100 text-muted-foreground hover:text-foreground" title="Editar">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => setDetalhe(b)} className="p-1.5 rounded hover:bg-gray-100 text-muted-foreground hover:text-foreground" title="Ficha do bem">
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
            page={lista.page} pageSize={lista.pageSize} total={lista.total}
            canPrev={lista.canPrev} canNext={lista.canNext}
            onPrev={lista.prev} onNext={lista.next} carregando={lista.loading}
          />
        </div>
      </div>

      {modalAberto && (
        <PatrimonioFormModal
          open={modalAberto}
          bem={editando}
          categorias={categorias}
          onClose={() => setModalAberto(false)}
          onSaved={recarregar}
        />
      )}

      {detalhe && (
        <PatrimonioDetalheModal
          open={!!detalhe}
          bem={detalhe}
          isAdmin={isAdmin}
          onReload={recarregar}
          onClose={() => setDetalhe(null)}
          onEdit={(b) => { setDetalhe(null); setEditando(b); setModalAberto(true); }}
        />
      )}
    </div>
  );
}