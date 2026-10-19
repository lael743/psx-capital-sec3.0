import { useEffect, useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Plus, Search, Pencil, Trash2, Loader2 } from 'lucide-react';
import { logAction } from '@/lib/audit';
import CategoriaFormModal from '@/components/gestao/CategoriaFormModal';

/** Categorias e subcategorias da gestão interna. */
export default function Categorias() {
  const [categorias, setCategorias] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState('');
  const [tipo, setTipo] = useState('');
  const [usuario, setUsuario] = useState(null);
  const [modalAberto, setModalAberto] = useState(false);
  const [editando, setEditando] = useState(null);
  const [mensagem, setMensagem] = useState(null);
  const [processando, setProcessando] = useState(false);

  const carregar = () => {
    setCarregando(true);
    base44.entities.CategoriaInterna.list({ sort: 'ordem', limit: 500 })
      .then(res => { setCategorias(res?.items || []); setCarregando(false); })
      .catch(() => { setCategorias([]); setCarregando(false); });
  };

  useEffect(() => {
    carregar();
    base44.auth.me().then(setUsuario).catch(() => setUsuario(null));
  }, []);

  const isAdmin = usuario?.role === 'admin';

  const filtradas = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return categorias.filter(c => {
      if (tipo && c.tipo !== tipo) return false;
      if (t && !`${c.nome} ${c.parent_nome || ''}`.toLowerCase().includes(t)) return false;
      return true;
    });
  }, [categorias, busca, tipo]);

  const alternarAtivo = async (c) => {
    await base44.entities.CategoriaInterna.update(c.id, { ativo: !c.ativo });
    await logAction({ action: 'update', entity: 'CategoriaInterna', entityId: c.id, description: `Categoria "${c.nome}" ${c.ativo ? 'desativada' : 'ativada'}` });
    carregar();
  };

  const excluir = async (c) => {
    setMensagem(null);
    setProcessando(true);
    try {
      const [lanc, obrig, patr, filhas] = await Promise.all([
        base44.entities.LancamentoInterno.count({ categoria_id: c.id }),
        base44.entities.ObrigacaoInterna.count({ categoria_id: c.id }),
        base44.entities.PatrimonioInterno.count({ categoria_id: c.id }),
        base44.entities.CategoriaInterna.count({ parent_id: c.id }),
      ]);
      const uso = (lanc || 0) + (obrig || 0) + (patr || 0) + (filhas || 0);
      if (uso > 0) {
        setMensagem({ tipo: 'erro', texto: `"${c.nome}" já está em uso em ${uso} registro(s). A categoria não pode ser excluída — desative-a para ocultá-la dos novos lançamentos.` });
        setProcessando(false);
        return;
      }
      await base44.entities.CategoriaInterna.delete(c.id);
      await logAction({ action: 'delete', entity: 'CategoriaInterna', entityId: c.id, description: `Categoria "${c.nome}" excluída` });
      setMensagem({ tipo: 'ok', texto: `Categoria "${c.nome}" excluída.` });
      carregar();
    } catch (e) {
      setMensagem({ tipo: 'erro', texto: e?.message || 'Erro ao excluir a categoria.' });
    }
    setProcessando(false);
  };

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-foreground">Categorias</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Organize despesas e patrimônio em categorias e subcategorias.</p>
        </div>
        <button onClick={() => { setEditando(null); setModalAberto(true); }} className="flex items-center gap-2 px-4 py-2.5 bg-foreground text-primary-foreground text-sm font-semibold rounded-lg hover:bg-foreground/90">
          <Plus className="w-4 h-4" /> Nova categoria
        </button>
      </div>

      {mensagem && (
        <div className={`text-xs rounded-lg px-3 py-2 border ${mensagem.tipo === 'erro' ? 'text-red-700 bg-red-50 border-red-200' : 'text-emerald-700 bg-emerald-50 border-emerald-200'}`}>
          {mensagem.texto}
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="Buscar categoria..."
            className="w-full pl-9 pr-4 py-2.5 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-ring shadow-sm"
          />
        </div>
        <select className="text-sm border border-border rounded-lg px-3 py-2.5 bg-white min-w-[160px]" value={tipo} onChange={e => setTipo(e.target.value)}>
          <option value="">Todas as aplicações</option>
          <option value="despesa">Despesa</option>
          <option value="patrimonio">Patrimônio</option>
        </select>
      </div>

      <div className="bg-white border border-border rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-gray-50/80">
                <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-left">Categoria</th>
                <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-left">Aplicação</th>
                <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-center">Ordem</th>
                <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-left">Situação</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {carregando ? (
                <tr><td colSpan={5} className="px-4 py-12 text-center"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground inline" /></td></tr>
              ) : filtradas.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-12 text-center text-sm text-muted-foreground">Nenhuma categoria encontrada.</td></tr>
              ) : filtradas.map(c => (
                <tr key={c.id} className={`hover:bg-gray-50/60 transition-colors ${c.ativo === false ? 'opacity-60' : ''}`}>
                  <td className="px-4 py-3 text-xs">
                    {c.parent_nome ? <span className="text-muted-foreground">{c.parent_nome} › </span> : null}
                    <span className={c.parent_id ? '' : 'font-medium'}>{c.nome}</span>
                    {c.sistema && <span className="ml-2 text-[10px] text-muted-foreground uppercase">padrão</span>}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{c.tipo === 'patrimonio' ? 'Patrimônio' : 'Despesa'}</td>
                  <td className="px-4 py-3 text-xs text-center text-muted-foreground">{c.ordem || 0}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium border ${c.ativo === false ? 'bg-gray-100 text-gray-500 border-gray-300' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
                      {c.ativo === false ? 'Inativa' : 'Ativa'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      <button onClick={() => { setEditando(c); setModalAberto(true); }} className="p-1.5 rounded hover:bg-gray-100 text-muted-foreground hover:text-foreground" title="Editar">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      {isAdmin && (
                        <button
                          onClick={() => alternarAtivo(c)}
                          className="px-2 py-1 text-[11px] font-semibold rounded hover:bg-gray-100 text-muted-foreground hover:text-foreground"
                        >
                          {c.ativo === false ? 'Ativar' : 'Desativar'}
                        </button>
                      )}
                      {isAdmin && (
                        <button onClick={() => excluir(c)} disabled={processando} className="p-1.5 rounded hover:bg-red-50 text-muted-foreground hover:text-red-600 disabled:opacity-40" title="Excluir">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-[11px] text-muted-foreground">
        Uma categoria já utilizada não pode ser excluída — desative-a para retirá-la das novas opções.
      </p>

      {modalAberto && (
        <CategoriaFormModal
          open={modalAberto}
          categoria={editando}
          categorias={categorias}
          onClose={() => setModalAberto(false)}
          onSaved={carregar}
        />
      )}
    </div>
  );
}