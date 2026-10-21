import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { ShieldCheck, TrendingDown, Clock, Users } from 'lucide-react';
import EtapaCabecalho from '@/components/operacao/etapas/EtapaCabecalho';
import SacadoInfoCard from '@/components/operacao/SacadoInfoCard';
import { analiseCredito, ROTULO_PONTUALIDADE } from '@/lib/analiseCredito';
import { formatCurrency, today } from '@/lib/finance';

const lista = (p) => (Array.isArray(p) ? p : p?.items || []);

const COR_PONTUALIDADE = {
  antecipado: 'text-emerald-700 bg-emerald-50 border-emerald-200',
  no_prazo: 'text-emerald-700 bg-emerald-50 border-emerald-200',
  atrasado: 'text-red-700 bg-red-50 border-red-200',
  sem_historico: 'text-muted-foreground bg-gray-50 border-border',
};

/**
 * ETAPA 2 — Análise de crédito do cedente (e do sacado, conforme a modalidade).
 *
 * Só LEITURA: limite, utilizado, disponível, pendências e o comportamento de
 * pagamento comprovado pelos títulos já compensados. Quem autoriza o avanço
 * (limite, bloqueio, documentação) continua sendo a regra do servidor.
 */
export default function EtapaAnalise({ operacao, client, cheques = [] }) {
  const [dados, setDados] = useState({ operacoes: [], titulos: [], assinantes: [] });

  useEffect(() => {
    let ativo = true;
    const clienteId = operacao.client_id;
    if (!clienteId) {
      setDados({ operacoes: [], titulos: [], assinantes: [] });
      return undefined;
    }
    const ehAssinatura = (operacao.produto || operacao.type) === 'assinatura';
    Promise.all([
      base44.entities.Operation.filter({ client_id: clienteId }, { sort: '-created_date', limit: 200 }),
      base44.entities.Cheque.filter({ client_id: clienteId }, { sort: '-compensation_date', limit: 300 }),
      ehAssinatura ? base44.entities.AssinaturaVinculo.filter({ operation_id: operacao.id }) : Promise.resolve([]),
    ]).then(([ops, titulos, vinculos]) => {
      if (!ativo) return;
      setDados({
        operacoes: lista(ops).filter((o) => o.id !== operacao.id),
        titulos: lista(titulos),
        assinantes: lista(vinculos),
      });
    }).catch(() => {});
    return () => { ativo = false; };
  }, [operacao.id, operacao.client_id, operacao.produto, operacao.type]);

  const analise = analiseCredito({
    cliente: client,
    operacoes: dados.operacoes,
    titulos: dados.titulos,
    hoje: today(),
  });
  const { limite, utilizado, disponivel, pendencias, pontualidade } = analise;
  const usoPercentual = limite > 0 ? Math.min(100, (utilizado / limite) * 100) : 0;
  const tipo = operacao.produto || operacao.type;

  const sacados = Object.values(
    cheques.reduce((mapa, c) => {
      const chave = c.sacado_doc || c.sacado_name || c.id;
      if (!mapa[chave]) mapa[chave] = { nome: c.sacado_name || '—', doc: c.sacado_doc || '—', valor: 0, titulos: 0 };
      mapa[chave].valor += c.valor_face || c.value || 0;
      mapa[chave].titulos += 1;
      return mapa;
    }, {}),
  );

  return (
    <div className="space-y-3">
      <EtapaCabecalho
        numero={2}
        titulo="Análise de crédito"
        descricao="Situação do cedente, limite disponível, pendências e o comportamento de pagamento comprovado pelos títulos já compensados."
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Cedente e limite */}
        <div className="bg-white border border-border rounded-xl p-5 space-y-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-muted-foreground" />
            <h3 className="text-sm font-bold">Cedente</h3>
          </div>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Nome</p>
              <p className="font-semibold">{client?.name || operacao.client_name || '—'}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Documento</p>
              <p className="font-semibold">{client?.document || '—'}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Situação</p>
              <p className={`font-semibold capitalize ${client?.status === 'bloqueado' || client?.bloqueado ? 'text-red-600' : ''}`}>
                {client?.status || (client?.bloqueado ? 'bloqueado' : 'ativo')}
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Risco</p>
              <p className="font-semibold capitalize">{client?.risk_profile || '—'}</p>
            </div>
          </div>

          <div className="border-t border-border pt-3 space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Limite</span>
              <span className="font-semibold font-mono">{limite > 0 ? formatCurrency(limite) : 'Sem limite definido'}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Utilizado</span>
              <span className="font-semibold font-mono">{formatCurrency(utilizado)}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Disponível</span>
              <span className={`font-bold font-mono ${disponivel !== null && disponivel <= 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                {disponivel === null ? '—' : formatCurrency(disponivel)}
              </span>
            </div>
            {limite > 0 && (
              <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                <div className="h-full bg-foreground" style={{ width: `${usoPercentual}%` }} />
              </div>
            )}
            <div className="flex justify-between text-xs pt-1">
              <span className="text-muted-foreground">Exposição desta operação</span>
              <span className="font-semibold font-mono">{formatCurrency(operacao.total_receivable || 0)}</span>
            </div>
          </div>
        </div>

        {/* Comportamento de pagamento */}
        <div className="bg-white border border-border rounded-xl p-5 space-y-3">
          <div className="flex items-center gap-2">
            <TrendingDown className="w-4 h-4 text-muted-foreground" />
            <h3 className="text-sm font-bold">Comportamento de pagamento</h3>
          </div>
          <div className={`border rounded-lg px-3 py-2 text-sm font-semibold ${COR_PONTUALIDADE[pontualidade.classificacao]}`}>
            {ROTULO_PONTUALIDADE[pontualidade.classificacao]}
          </div>
          {pontualidade.amostra > 0 ? (
            <>
              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Antecipados</p>
                  <p className="font-bold text-emerald-600">{pontualidade.antecipados}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">No prazo</p>
                  <p className="font-bold">{pontualidade.noPrazo}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Atrasados</p>
                  <p className="font-bold text-red-600">{pontualidade.atrasados}</p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Média de {pontualidade.mediaDias > 0 ? '+' : ''}{pontualidade.mediaDias} dia(s) em relação ao
                vencimento, sobre {pontualidade.amostra} título(s) compensado(s).
              </p>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">Nenhum título compensado deste cedente até agora.</p>
          )}

          <div className="border-t border-border pt-3 space-y-1.5">
            <div className="flex items-center gap-2">
              <Clock className="w-3.5 h-3.5 text-muted-foreground" />
              <h4 className="text-xs font-bold">Pendências</h4>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Títulos vencidos em aberto</span>
              <span className="font-semibold">{pendencias.quantidade} · {formatCurrency(pendencias.valor)}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Operações em atraso</span>
              <span className={`font-semibold ${pendencias.operacoesEmAtraso > 0 ? 'text-red-600' : ''}`}>{pendencias.operacoesEmAtraso}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Sacado / assinantes conforme a modalidade */}
      {tipo === 'boleto' && (operacao.sacado_name || operacao.sacado_id) && (
        <SacadoInfoCard operacao={operacao} onUpdate={() => {}} />
      )}

      {tipo === 'assinatura' && (
        <div className="bg-white border border-border rounded-xl p-5 space-y-2">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-muted-foreground" />
            <h3 className="text-sm font-bold">Assinantes</h3>
          </div>
          {dados.assinantes.length === 0 && <p className="text-xs text-muted-foreground">Nenhum assinante vinculado.</p>}
          {dados.assinantes.map((a) => (
            <div key={a.id} className="flex justify-between text-xs border-t border-border pt-1.5">
              <span>{a.sacado_name} <span className="text-muted-foreground">· {a.sacado_doc}</span></span>
              <span className="font-mono font-semibold">{formatCurrency(a.valor_assinatura)}</span>
            </div>
          ))}
        </div>
      )}

      {tipo !== 'assinatura' && sacados.length > 0 && (
        <div className="bg-white border border-border rounded-xl p-5 space-y-2">
          <h3 className="text-sm font-bold">Sacados desta operação</h3>
          {sacados.map((s, i) => (
            <div key={i} className="flex justify-between text-xs border-t border-border pt-1.5">
              <span>{s.nome} <span className="text-muted-foreground">· {s.doc}</span></span>
              <span className="text-muted-foreground">{s.titulos} título(s) · <span className="font-mono font-semibold text-foreground">{formatCurrency(s.valor)}</span></span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}