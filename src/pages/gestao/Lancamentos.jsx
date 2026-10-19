import { useEffect, useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Plus, Pencil, Ban, Loader2, Search } from 'lucide-react';
import { logAction } from '@/lib/audit';
import useListaServidor from '@/hooks/useListaServidor';
import useDebounce from '@/hooks/useDebounce';
import LancamentoFormModal from '@/components/gestao/LancamentoFormModal';
import GestaoModal from '@/components/gestao/GestaoModal';
import Field from '@/components/gestao/Field';
import PaginacaoServidor from '@/components/gestao/PaginacaoServidor';
import { formatCurrency, formatDate } from '@/lib/finance';

const STATUS_LABEL = { ativo: 'Em aberto', pago: 'Pago', cancelado: 'Cancelado' };
const STATUS_CLASSE = {
  ativo: 'bg-amber-50 text-amber-700 border-amber-200',
  pago: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  cancelado: 'bg-gray-100 text-gray-500 border-gray-300',
};

/** Lançamentos de despesas e patrimônio. */
export default function Lancamentos() {
  const [busca, setBusca] = useState('');
  const buscaAplicada = useDebounce(busca);
  const [tipo, setTipo] = useState('');
  const [categoriaId, setCategoriaId] = useState('');
  const [status, setStatus] = useState('');

  const [categorias, setCategorias] = useState([]);
  const [contas, setContas] = useState([]);
  const [editando, setEditando] = useState(null);
  const [modalAberto, setModalAberto] = useState(false);
  const [cancelando, setCancelando] = useState(null);
  const [motivo, setMotivo] = useState('');
  const [processando, setProcessando] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    base44.entities.CategoriaInterna.list({ sort: 'ordem', limit: 500 }).then(r => setCategorias(r?.items || [])).catch(() => setCategorias([]));
    base44.entities.ContaInterna.list({ sort: 'nome', limit: 200 }).then(r => setContas(r?.items || [])).catch(() => setContas([]));
  }, []);

  const filtro = useMemo(() => {
    const q = {};
    if (buscaAplicada.trim()) q.descricao = { $regex: buscaAplicada.trim(), $options: 'i' };
    if (tipo) q.tipo = tipo;
    if (categoriaId) q.categoria_id = categoriaId;
    if (status) q.status = status;
    return q;
  }, [buscaAplicada, tipo, categoriaId, status]);

  const { items, total, loading, page, pageSize, reload, next, prev, canPrev, canNext } = useListaServidor('LancamentoInterno', filtro, { limit: 25 });

  const abrirNovo = () => { setEditando(null); setModalAberto(true); };
  const abrirEdicao = (l) => { setEditando(l); setModalAberto(true); };

  const confirmarCancelamento = async () => {
    setErro('');
    if (!motivo.trim()) { setErro('Informe o motivo do cancelamento.'); return; }
    setProcessando(true);
    try {
      const obrigacoes = await base44.entities.ObrigacaoInterna.filter({ lancamento_id: cancelando.id }, { limit: 300 });
      const obs = obrigacoes?.items || [];
      if (obs.some(o => (Number(o.valor_pago) || 0) > 0)) {
        setErro('Este lançamento possui pagamentos registrados e não pode ser cancelado.');
        setProcessando(false);
        return;
      }
      await base44.entities.LancamentoInterno.update(cancelando.id, { status: 'cancelado' });
      if (obs.length > 0) {
        await base44.entities.ObrigacaoInterna.updateMany(
          { lancamento_id: cancelando.id, status: { $in: ['a_vencer', 'vencido'] } },
          { $set: { status: 'cancelado', motivo_cancelamento: motivo, saldo: 0 } },
        );
      }
      await logAction({ action: 'cancel', entity: 'LancamentoInterno', entityId: cancelando.id, description: `Lançamento "${cancelando.descricao}" cancelado — ${motivo}` });
      setCancelando(null);
      setMotivo('');
      reload();
    } catch (e) {
      setErro(e?.message || 'Erro ao cancelar o lançamento.');
    }
    setProcessando(false);
  };

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-foreground">Lançamentos</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Cadastre despesas e aquisições de patrimônio; as parcelas são geradas automaticamente.</p>
        </div>
        <button onClick={abrirNovo} className="flex items-center gap-2 px-4 py-2.5 bg-foreground text-primary-foreground text-sm font-semibold rounded-lg hover:bg-foreground/90">
          <Plus className="w-4 h-4" /> Novo lançamento
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
        <select className="text-sm border border-border rounded-lg px-3 py-2.5 bg-white min-w-[150px]" value={tipo} onChange={e => setTipo(e.target.value)}>
          <option value="">Todos os tipos</option>
          <option value="despesa">Despesa</option>
          <option value="patrimonio">Patrimônio</option>
        </select>
        <select className="text-sm border border-border rounded-lg px-3 py-2.5 bg-white min-w-[170px]" value={categoriaId} onChange={e => setCategoriaId(e.target.value)}>
          <option value="">Todas as categorias</option>
          {categorias.map(c => <option key={c.id} value={c.id}>{c.parent_nome ? `${c.parent_nome} › ${c.nome}` : c.nome}</option>)}
        </select>
        <select className="text-sm border border-border rounded-lg px-3 py-2.5 bg-white min-w-[140px]" value={status} onChange={e => setStatus(e.target.value)}>
          <option value="">Todas as situações</option>
          <option value="ativo">Em aberto</option>
          <option value="pago">Pago</option>
          <option value="cancelado">Cancelado</option>
        </select>
      </div>

      <div className="bg-white border border-border rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-gray-50/80">
                <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-left">Data</th>
                <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-left">Tipo</th>
                <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-left">Categoria</th>
                <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-left">Descrição</th>
                <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-right">Valor total</th>
                <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-left">Condição</th>
                <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-left">Conta</th>
                <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-left">Situação</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr><td colSpan={9} className="px-4 py-12 text-center"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground inline" /></td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-12 text-center text-sm text-muted-foreground">Nenhum lançamento encontrado.</td></tr>
              ) : items.map(l => (
                <tr key={l.id} className="hover:bg-gray-50/60 transition-colors">
                  <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">{formatDate(l.data_lancamento)}</td>
                  <td className="px-4 py-3 text-xs font-semibold">{l.tipo === 'patrimonio' ? 'Patrimônio' : 'Despesa'}</td>
                  <td className="px-4 py-3 text-xs">
                    {l.categoria_nome || '—'}
                    {l.subcategoria_nome && <span className="text-muted-foreground"> › {l.subcategoria_nome}</span>}
                  </td>
                  <td className="px-4 py-3 text-xs max-w-[260px]">
                    <span className="truncate block">{l.descricao}</span>
                    {l.patrimonio_id && <span className="text-[10px] text-emerald-700">bem vinculado</span>}
                  </td>
                  <td className="px-4 py-3 text-xs font-mono font-semibold text-right whitespace-nowrap">{formatCurrency(l.valor_total)}</td>
                  <td className="px-4 py-3 text-xs">{l.condicao === 'parcelado' ? `${l.num_parcelas}x` : 'À vista'}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{l.conta_nome || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium border ${STATUS_CLASSE[l.status] || STATUS_CLASSE.ativo}`}>
                      {STATUS_LABEL[l.status] || l.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      <button onClick={() => abrirEdicao(l)} className="p-1.5 rounded hover:bg-gray-100 text-muted-foreground hover:text-foreground" title="Editar">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      {l.status !== 'cancelado' && (
                        <button onClick={() => { setCancelando(l); setMotivo(''); setErro(''); }} className="p-1.5 rounded hover:bg-red-50 text-muted-foreground hover:text-red-600" title="Cancelar lançamento">
                          <Ban className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-4 border-t border-border">
          <PaginacaoServidor
            page={page} pageSize={pageSize} total={total}
            canPrev={canPrev} canNext={canNext} onPrev={prev} onNext={next} carregando={loading}
          />
        </div>
      </div>

      {modalAberto && (
        <LancamentoFormModal
          open={modalAberto}
          lancamento={editando}
          categorias={categorias}
          contas={contas}
          onClose={() => setModalAberto(false)}
          onSaved={reload}
        />
      )}

      <GestaoModal
        open={!!cancelando}
        onClose={() => { setCancelando(null); setErro(''); }}
        size="sm"
        title="Cancelar lançamento"
        subtitle={cancelando?.descricao}
        footer={(
          <>
            <button onClick={() => { setCancelando(null); setErro(''); }} className="px-4 py-2 text-sm font-medium border border-border rounded-lg hover:bg-gray-50">Voltar</button>
            <button onClick={confirmarCancelamento} disabled={processando} className="px-4 py-2 text-sm font-semibold bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50">
              {processando ? 'Cancelando...' : 'Confirmar cancelamento'}
            </button>
          </>
        )}
      >
        <div className="space-y-3">
          {erro && <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{erro}</div>}
          <p className="text-xs text-muted-foreground">
            O lançamento e as parcelas em aberto serão cancelados. O histórico é preservado — nada é excluído.
          </p>
          <Field label="Motivo" required>
            <input className="input-field" value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Descreva o motivo" />
          </Field>
        </div>
      </GestaoModal>
    </div>
  );
}