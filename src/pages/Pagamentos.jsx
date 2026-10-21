import { useCallback, useEffect, useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import PageHeader from '@/components/ui/PageHeader';
import StatCard from '@/components/ui/StatCard';
import Pagination from '@/components/ui/Pagination';
import FiltrosTitulos from '@/components/contasReceber/FiltrosTitulos';
import TitulosTable from '@/components/contasReceber/TitulosTable';
import HistoricoRecebimentos from '@/components/contasReceber/HistoricoRecebimentos';
import {
  SITUACAO,
  carregarContasReceber,
  filtrarTitulos,
  opcoesDeFiltro,
  ordenarPorVencimento,
} from '@/lib/contasReceber';
import { formatCurrency } from '@/lib/finance';
import { AlertTriangle, CalendarClock, CheckCircle2, RefreshCw, Wallet } from 'lucide-react';

const FILTROS_TITULOS = { busca: '', situacao: '', origem: '', cliente: '', sacado: '', tipo: '', de: '', ate: '' };
const FILTROS_HISTORICO = { busca: '', metodo: '', de: '', ate: '' };

function Aba({ ativa, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm font-semibold rounded-lg transition-colors ${
        ativa ? 'bg-white shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
      }`}
    >
      {children}
    </button>
  );
}

export default function ContasReceber() {
  const [aba, setAba] = useState('titulos');
  const [dados, setDados] = useState({ linhas: [], resumo: null, pagamentos: [] });
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState(null);
  const [filtros, setFiltros] = useState(FILTROS_TITULOS);
  const [filtrosHistorico, setFiltrosHistorico] = useState(FILTROS_HISTORICO);
  const [ordem, setOrdem] = useState('asc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro(null);
    try {
      const resultado = await carregarContasReceber(base44);
      setDados(resultado);
    } catch (e) {
      setErro(e?.message || 'Não foi possível consultar os títulos.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  useEffect(() => {
    setPage(1);
  }, [filtros, ordem]);

  const filtrados = useMemo(
    () => ordenarPorVencimento(filtrarTitulos(dados.linhas, filtros), ordem),
    [dados.linhas, filtros, ordem],
  );
  const opcoes = useMemo(() => opcoesDeFiltro(dados.linhas), [dados.linhas]);
  const pagina = filtrados.slice((page - 1) * pageSize, page * pageSize);
  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / pageSize));
  const resumo = dados.resumo?.por_situacao || {};
  const quantidade = (chave) => resumo[chave]?.quantidade || 0;
  const valor = (chave) => resumo[chave]?.valor || 0;

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <PageHeader
        title="Contas a Receber"
        subtitle="Consulta de títulos, situação, cobrança e evidências de recebimento — somente leitura"
        action={
          <button
            onClick={carregar}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border border-border rounded-lg hover:bg-gray-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Atualizar
          </button>
        }
      />

      <div className="inline-flex p-1 rounded-xl bg-gray-100 border border-border mb-6">
        <Aba ativa={aba === 'titulos'} onClick={() => setAba('titulos')}>Títulos</Aba>
        <Aba ativa={aba === 'historico'} onClick={() => setAba('historico')}>Histórico de recebimentos</Aba>
      </div>

      {erro && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between p-4 mb-5 rounded-xl border border-red-200 bg-red-50">
          <p className="text-sm text-red-700">Falha ao consultar os títulos: {erro}</p>
          <button onClick={carregar} className="px-3 py-2 text-xs font-semibold border border-red-300 rounded-lg bg-white hover:bg-red-100">
            Tentar novamente
          </button>
        </div>
      )}

      {aba === 'titulos' ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
            <StatCard
              label="A vencer"
              value={formatCurrency(valor(SITUACAO.A_VENCER))}
              sub={`${quantidade(SITUACAO.A_VENCER)} título(s)`}
              icon={CalendarClock}
              variant="gold"
            />
            <StatCard
              label="Vencido"
              value={formatCurrency(valor(SITUACAO.VENCIDO))}
              sub={`${quantidade(SITUACAO.VENCIDO)} título(s)`}
              icon={AlertTriangle}
              variant="danger"
            />
            <StatCard
              label="Recebido (comprovado)"
              value={formatCurrency(valor(SITUACAO.RECEBIDO))}
              sub={`${quantidade(SITUACAO.RECEBIDO)} título(s)`}
              icon={CheckCircle2}
            />
            <StatCard
              label="Conciliação pendente"
              value={dados.resumo?.inconsistentes || 0}
              sub={`${quantidade(SITUACAO.INCONSISTENTE)} inconsistente(s)`}
              icon={Wallet}
              variant="dark"
            />
          </div>

          <FiltrosTitulos
            filtros={filtros}
            onChange={setFiltros}
            opcoes={opcoes}
            ordem={ordem}
            onOrdem={setOrdem}
            onLimpar={() => setFiltros(FILTROS_TITULOS)}
          />

          {loading ? (
            <div className="flex items-center justify-center h-48">
              <div className="w-6 h-6 border-2 border-border border-t-foreground rounded-full animate-spin" />
            </div>
          ) : (
            <>
              <TitulosTable linhas={pagina} ordem={ordem} onOrdenar={() => setOrdem(ordem === 'asc' ? 'desc' : 'asc')} />
              <div className="mt-4 bg-white border border-border rounded-xl overflow-hidden">
                <Pagination
                  page={page}
                  totalPages={totalPaginas}
                  total={filtrados.length}
                  pageSize={pageSize}
                  onPageChange={setPage}
                  onPageSizeChange={(tamanho) => { setPageSize(tamanho); setPage(1); }}
                  itemName="títulos"
                />
              </div>
              <p className="text-[11px] text-muted-foreground mt-3">
                O saldo exibido é o saldo agregado da operação. O sistema não comprova saldo individual por título;
                títulos sem vínculo comprovado aparecem como conciliação pendente.
              </p>
            </>
          )}
        </>
      ) : (
        <HistoricoRecebimentos
          payments={dados.pagamentos || []}
          loading={loading}
          filtros={filtrosHistorico}
          onChange={setFiltrosHistorico}
        />
      )}
    </div>
  );
}