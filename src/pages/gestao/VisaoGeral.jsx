import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import {
  TrendingDown, CheckCircle2, Clock, AlertTriangle, Layers, Boxes, Package, Loader2, ArrowRight,
} from 'lucide-react';
import StatCard from '@/components/ui/StatCard';
import { formatCurrency, formatDate } from '@/lib/finance';
import { mesAtual, meioPagamentoLabel } from '@/lib/gestaoInterna';

/** Visão geral da gestão interna — indicadores calculados no servidor. */
export default function VisaoGeral() {
  const [dados, setDados] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [categorias, setCategorias] = useState([]);
  const [contas, setContas] = useState([]);
  const [filtros, setFiltros] = useState({ periodo: mesAtual(), categoria_id: '', conta_id: '' });
  const [erro, setErro] = useState('');

  useEffect(() => {
    base44.entities.CategoriaInterna.list({ sort: 'ordem', limit: 500 }).then(res => setCategorias(res?.items || []))
      .catch(() => setCategorias([]));
    base44.entities.ContaInterna.list({ sort: 'nome', limit: 200 }).then(res => setContas(res?.items || []))
      .catch(() => setContas([]));
  }, []);

  useEffect(() => {
    let alive = true;
    setCarregando(true);
    setErro('');
    base44.entities.ContaInterna.list({ sort: 'nome', limit: 200 }).catch(() => null);
    base44.functions.invoke('gestaoInternaDashboard', filtros)
      .then(res => {
        if (!alive) return;
        if (res.data?.error) { setErro(res.data.error); setDados(null); }
        else setDados(res.data);
        setCarregando(false);
      })
      .catch(e => {
        if (!alive) return;
        setErro(e?.response?.data?.error || e?.message || 'Erro ao carregar os indicadores.');
        setCarregando(false);
      });
    return () => { alive = false; };
  }, [filtros.periodo, filtros.categoria_id, filtros.conta_id]);

  const set = (k, v) => setFiltros(f => ({ ...f, [k]: v }));

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-foreground">Gestão Interna</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Despesas, pagamentos, parcelamentos e patrimônio da empresa.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <input type="month" className="input-field w-auto" value={filtros.periodo} onChange={e => set('periodo', e.target.value)} />
          <select className="input-field w-auto" value={filtros.categoria_id} onChange={e => set('categoria_id', e.target.value)}>
            <option value="">Todas as categorias</option>
            {categorias.map(c => <option key={c.id} value={c.id}>{c.parent_nome ? `${c.parent_nome} › ${c.nome}` : c.nome}</option>)}
          </select>
          <select className="input-field w-auto" value={filtros.conta_id} onChange={e => set('conta_id', e.target.value)}>
            <option value="">Todas as contas</option>
            {contas.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
        </div>
      </div>

      {erro && <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{erro}</div>}

      {carregando && !dados ? (
        <div className="flex items-center justify-center h-48"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
      ) : dados && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard label="Despesas no mês" value={formatCurrency(dados.total_despesas_mes)} sub={`Vencimentos de ${filtros.periodo}`} icon={TrendingDown} />
            <StatCard label="Pago no mês" value={formatCurrency(dados.total_pago_mes)} sub="Pagamentos registrados" icon={CheckCircle2} />
            <StatCard label="Pendente" value={formatCurrency(dados.total_pendente)} sub={`${dados.qtd_pendentes} parcelas em aberto`} icon={Clock} />
            <StatCard label="Vencido" value={formatCurrency(dados.total_vencido)} sub={`${dados.qtd_vencidas} parcelas em atraso`} icon={AlertTriangle} variant="danger" />
            <StatCard label="Parcelado em aberto" value={formatCurrency(dados.total_parcelado_aberto)} sub={`${dados.qtd_parceladas_abertas} parcelas`} icon={Layers} />
            <StatCard label="Patrimônio (aquisição)" value={formatCurrency(dados.patrimonio_aquisicao)} sub={`${dados.bens_total} bens cadastrados`} icon={Package} />
            <StatCard label="Bens ativos" value={String(dados.bens_ativos)} sub={`de ${dados.bens_total} cadastrados`} icon={Boxes} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-white border border-border rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                <h2 className="text-sm font-semibold">Próximos vencimentos</h2>
                <Link to="/gestao/contas-a-pagar" className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
                  Ver todos <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
              {dados.proximos_vencimentos.length === 0 ? (
                <div className="p-8 text-center text-xs text-muted-foreground">Nenhum vencimento em aberto.</div>
              ) : (
                <div className="divide-y divide-border">
                  {dados.proximos_vencimentos.map(v => (
                    <div key={v.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                      <div className="min-w-0">
                        <p className="text-xs font-medium truncate">{v.descricao}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {formatDate(v.vencimento)}
                          {v.total_parcelas > 1 ? ` · parcela ${v.numero_parcela}/${v.total_parcelas}` : ''}
                          {v.categoria_nome ? ` · ${v.categoria_nome}` : ''}
                        </p>
                      </div>
                      <span className="font-mono text-xs font-semibold shrink-0">{formatCurrency(v.valor)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-white border border-border rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                <h2 className="text-sm font-semibold">Últimos pagamentos</h2>
                <Link to="/gestao/contas-a-pagar?aba=pagamentos" className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
                  Ver todos <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
              {dados.ultimos_pagamentos.length === 0 ? (
                <div className="p-8 text-center text-xs text-muted-foreground">Nenhum pagamento registrado.</div>
              ) : (
                <div className="divide-y divide-border">
                  {dados.ultimos_pagamentos.map(p => (
                    <div key={p.id} className={`flex items-center justify-between gap-3 px-4 py-2.5 ${p.estornado ? 'opacity-50' : ''}`}>
                      <div className="min-w-0">
                        <p className="text-xs font-medium">{formatDate(p.data_pagamento)}</p>
                        <p className="text-[11px] text-muted-foreground truncate">
                          {p.conta_nome || 'conta não informada'} · {meioPagamentoLabel(p.forma_pagamento)}
                          {p.estornado ? ' · estornado' : ''}
                        </p>
                      </div>
                      <span className="font-mono text-xs font-semibold shrink-0">{formatCurrency(p.valor_pago)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}