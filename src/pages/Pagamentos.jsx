import { useCallback, useEffect, useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import PageHeader from '@/components/ui/PageHeader';
import StatCard from '@/components/ui/StatCard';
import Pagination from '@/components/ui/Pagination';
import FiltrosTitulos from '@/components/contasReceber/FiltrosTitulos';
import TitulosTable from '@/components/contasReceber/TitulosTable';
import HistoricoRecebimentos from '@/components/contasReceber/HistoricoRecebimentos';
import BaixaTituloModal from '@/components/contasReceber/BaixaTituloModal';
import {
  SITUACAO,
  carregarContasReceber,
  contagemOculta,
  filtrarTitulos,
  opcoesDeFiltro,
  ordenarPorVencimento,
} from '@/lib/contasReceber';
import { formatCurrency } from '@/lib/finance';
import { AlertTriangle, CalendarClock, CheckCircle2, RefreshCw, ShieldAlert, Wallet } from 'lucide-react';

const FILTROS_TITULOS = { busca: '', situacao: '', origem: '', cliente: '', sacado: '', tipo: '', de: '', ate: '' };
const FILTROS_HISTORICO = { busca: '', metodo: '', de: '', ate: '' };
const VAZIO = { linhas: [], resumo: null, pagamentos: [], liquidacoes: [], limitacoes: [], completude: null };

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
  const [dados, setDados] = useState(VAZIO);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState(null);
  const [filtros, setFiltros] = useState(FILTROS_TITULOS);
  const [filtrosHistorico, setFiltrosHistorico] = useState(FILTROS_HISTORICO);
  const [ordem, setOrdem] = useState('asc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [tituloEmBaixa, setTituloEmBaixa] = useState(null);
  const [avisoBaixa, setAvisoBaixa] = useState(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro(null);
    try {
      const resultado = await carregarContasReceber(base44);
      setDados(resultado);
    } catch (e) {
      // Falha de recarga NUNCA convive com dados da carga anterior.
      setDados(VAZIO);
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
  const ocultos = useMemo(() => contagemOculta(dados.linhas, filtrados), [dados.linhas, filtrados]);
  const pagina = filtrados.slice((page - 1) * pageSize, page * pageSize);
  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / pageSize));
  const resumo = dados.resumo?.por_situacao || {};
  const quantidade = (chave) => resumo[chave]?.quantidade || 0;
  const valor = (chave) => resumo[chave]?.valor || 0;
  const limitacoes = dados.limitacoes || [];
  const filtrosAtivos = Object.values(filtros).some(Boolean);

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <PageHeader
        title="Contas a Receber"
        subtitle="Consulta de títulos, situação, cobrança, evidências de recebimento e baixa de títulos elegíveis"
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

      {avisoBaixa && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between p-4 mb-5 rounded-xl border border-emerald-200 bg-emerald-50">
          <p className="text-sm text-emerald-800">{avisoBaixa}</p>
          <button
            onClick={() => setAvisoBaixa(null)}
            className="px-3 py-2 text-xs font-semibold border border-emerald-300 rounded-lg bg-white hover:bg-emerald-100"
          >
            Fechar
          </button>
        </div>
      )}

      {limitacoes.length > 0 && (
        <div className="p-4 mb-5 rounded-xl border border-amber-200 bg-amber-50">
          <p className="flex items-center gap-2 text-sm font-semibold text-amber-800">
            <ShieldAlert className="w-4 h-4" /> Consulta com limitações — leia antes de concluir sobre recebimentos
          </p>
          <ul className="mt-2 space-y-1 text-xs text-amber-800/90 list-disc list-inside">
            {limitacoes.map((motivo) => (
              <li key={motivo}>{motivo}</li>
            ))}
          </ul>
        </div>
      )}

      {aba === 'titulos' ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <StatCard
              label="A vencer"
              value={formatCurrency(valor(SITUACAO.A_VENCER))}
              sub={`${quantidade(SITUACAO.A_VENCER)} título(s) · valor de face`}
              icon={CalendarClock}
              variant="gold"
            />
            <StatCard
              label="Vencido"
              value={formatCurrency(valor(SITUACAO.VENCIDO))}
              sub={`${quantidade(SITUACAO.VENCIDO)} título(s) · valor de face`}
              icon={AlertTriangle}
              variant="danger"
            />
            <StatCard
              label="Recebido (comprovado)"
              value={formatCurrency(valor(SITUACAO.RECEBIDO))}
              sub={`${quantidade(SITUACAO.RECEBIDO)} título(s) · crédito e lançamento conferidos`}
              icon={CheckCircle2}
            />
            <StatCard
              label="A confirmar"
              value={formatCurrency(valor(SITUACAO.A_CONFIRMAR))}
              sub={`${quantidade(SITUACAO.A_CONFIRMAR)} título(s) · evidência insuficiente`}
              icon={Wallet}
              variant="dark"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4 mb-5">
            <StatCard
              label="Resolvido"
              value={formatCurrency(valor(SITUACAO.RESOLVIDO))}
              sub={`${quantidade(SITUACAO.RESOLVIDO)} título(s) · devolvido com resolução`}
              icon={RefreshCw}
            />
            <StatCard
              label="Inconsistente"
              value={String(dados.resumo?.inconsistente || 0)}
              sub="contradição comprovada"
              icon={AlertTriangle}
              variant="danger"
            />
            <StatCard
              label="Com alerta"
              value={String(dados.resumo?.com_alerta || 0)}
              sub={`${dados.resumo?.alertas_sem_bloqueio || 0} sem inconsistência`}
              icon={ShieldAlert}
            />
          </div>

          <p className="text-[11px] text-muted-foreground mb-5">
            Os indicadores contam <strong>títulos</strong> e somam <strong>valor de face</strong> — não são eventos de
            recebimento. Recebimentos manuais e do Asaas são eventos agregados e aparecem na aba Histórico.
          </p>

          <FiltrosTitulos
            filtros={filtros}
            onChange={setFiltros}
            opcoes={opcoes}
            ordem={ordem}
            onOrdem={setOrdem}
            onLimpar={() => setFiltros(FILTROS_TITULOS)}
          />

          {filtrosAtivos && (ocultos.inconsistentes > 0 || ocultos.aConfirmar > 0) && (
            <div className="flex items-start gap-2 p-3 mb-4 rounded-lg border border-amber-200 bg-amber-50 text-xs text-amber-800">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>
                Os filtros atuais ocultam {ocultos.inconsistentes} título(s) inconsistente(s) e {ocultos.aConfirmar}{' '}
                a confirmar. Limpe os filtros para ver todos os registros.
              </span>
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center h-48">
              <div className="w-6 h-6 border-2 border-border border-t-foreground rounded-full animate-spin" />
            </div>
          ) : (
            <>
              <TitulosTable
                linhas={pagina}
                ordem={ordem}
                onOrdenar={() => setOrdem(ordem === 'asc' ? 'desc' : 'asc')}
                onBaixar={(linha) => { setAvisoBaixa(null); setTituloEmBaixa(linha); }}
              />
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
                O saldo exibido é o saldo agregado da operação — não existe saldo comprovado por título individual.
                "Recebido" exige crédito na conta e lançamento de caixa no mesmo evento; sem essa prova o título fica
                "A confirmar". Registros com possível correspondência aparecem separados, nunca fundidos.
              </p>
            </>
          )}
        </>
      ) : (
        <HistoricoRecebimentos
          payments={dados.pagamentos || []}
          liquidacoes={dados.liquidacoes || []}
          loading={loading}
          filtros={filtrosHistorico}
          onChange={setFiltrosHistorico}
        />
      )}

      {tituloEmBaixa && (
        <BaixaTituloModal
          linha={tituloEmBaixa}
          onClose={() => setTituloEmBaixa(null)}
          onSaved={(resultado) => {
            const conta = resultado?.titulo?.conta_nome;
            setAvisoBaixa(
              `Baixa registrada${conta ? ` na conta ${conta}` : ''}. O título, os indicadores e o histórico foram atualizados.`,
            );
            carregar();
          }}
        />
      )}
    </div>
  );
}