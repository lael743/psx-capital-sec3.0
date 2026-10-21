import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { formatCurrency, formatDate } from '@/lib/finance';
import { maskCpfCnpj } from '@/lib/masks';
import { RefreshCw, Ban, Loader2, CreditCard, Calendar, AlertTriangle, CheckCircle, Users } from 'lucide-react';

const CICLO_LABEL = {
  DAILY: 'Diária', WEEKLY: 'Semanal', BIWEEKLY: 'Quinzenal', MONTHLY: 'Mensal',
  QUARTERLY: 'Trimestral', SEMIANNUALLY: 'Semestral', YEARLY: 'Anual',
};

const BILLING_LABEL = { PIX: 'PIX', BOLETO: 'Boleto', CREDIT_CARD: 'Cartão' };

const STATUS_STYLE = {
  ativa: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  cancelada: 'bg-red-50 text-red-700 border-red-200',
  encerrada: 'bg-blue-50 text-blue-700 border-blue-200',
};

export default function AssinaturaAsaasPanel({ operacao, onUpdate }) {
  const [vinculos, setVinculos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [cancelling, setCancelling] = useState(null);
  const [cancellingAll, setCancellingAll] = useState(false);
  const [results, setResults] = useState(null);

  const load = () => {
    setLoading(true);
    base44.entities.AssinaturaVinculo.filter({ operation_id: operacao.id })
      .then(setVinculos)
      .catch(() => setVinculos([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [operacao.id]);

  const pending = vinculos.filter((v) => !v.asaas_subscription_id && v.status === 'ativa');
  const active = vinculos.filter((v) => v.status === 'ativa');
  const totalPorCiclo = vinculos.reduce((s, v) => s + (v.valor_assinatura || 0), 0);
  const totalRecebido = vinculos.reduce((s, v) => s + (v.valor_assinatura || 0) * (v.ciclos_pagos || 0), 0);

  const criarAssinaturas = async () => {
    setCreating(true);
    setResults(null);
    try {
      const res = await base44.functions.invoke('asaasCreateSubscription', { operation_id: operacao.id });
      setResults(res);
      load();
      if (onUpdate) onUpdate();
    } catch (e) {
      setResults({ error: e.message });
    } finally {
      setCreating(false);
    }
  };

  const cancelarUm = async (v) => {
    setCancelling(v.id);
    try {
      await base44.functions.invoke('asaasCancelSubscription', { vinculo_ids: [v.id] });
      load();
      if (onUpdate) onUpdate();
    } catch (e) {
      setResults({ error: e.message });
    } finally {
      setCancelling(null);
    }
  };

  const cancelarTodas = async () => {
    setCancellingAll(true);
    try {
      await base44.functions.invoke('asaasCancelSubscription', { operation_id: operacao.id, cancel_all: true });
      load();
      if (onUpdate) onUpdate();
    } catch (e) {
      setResults({ error: e.message });
    } finally {
      setCancellingAll(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white border border-border rounded-xl p-8 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
        <Loader2 className="w-4 h-4 animate-spin" /> Carregando assinaturas...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Configuração da operação */}
      <div className="bg-white border border-border rounded-xl p-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <div>
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Ciclo</div>
            <div className="text-sm font-bold mt-0.5">{CICLO_LABEL[operacao.assinatura_ciclo] || operacao.assinatura_ciclo || '—'}</div>
          </div>
          <div>
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Cobrança</div>
            <div className="text-sm font-bold mt-0.5">{BILLING_LABEL[operacao.asaas_billing_type] || '—'}</div>
          </div>
          <div>
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Prazo</div>
            <div className="text-sm font-bold mt-0.5">
              {operacao.assinatura_prazo_tipo === 'definido'
                ? `${operacao.assinatura_num_ciclos || 0} ciclos`
                : 'Indefinido'}
            </div>
          </div>
          <div>
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Valor Antecipado</div>
            <div className="text-sm font-bold mt-0.5 tabular-nums">{formatCurrency(operacao.valor_antecipacao || 0)}</div>
          </div>
          <div>
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Total Projetado</div>
            <div className="text-sm font-bold mt-0.5 tabular-nums">
              {operacao.assinatura_prazo_tipo === 'definido' ? formatCurrency(operacao.total_receivable || 0) : '—'}
            </div>
          </div>
        </div>
      </div>

      {/* Ações */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Users className="w-4 h-4" />
          {vinculos.length} assinante{vinculos.length !== 1 ? 's' : ''} · {active.length} ativa{active.length !== 1 ? 's' : ''} · {pending.length} pendente{pending.length !== 1 ? 's' : ''}
        </div>
        <div className="flex items-center gap-2">
          {active.length > 0 && (
            <button
              onClick={cancelarTodas}
              disabled={cancellingAll}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border border-red-200 text-red-700 bg-red-50 rounded-lg hover:bg-red-100 disabled:opacity-50 transition-colors">
              {cancellingAll ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Ban className="w-3.5 h-3.5" />}
              Cancelar Todas
            </button>
          )}
          <button
            onClick={criarAssinaturas}
            disabled={creating || pending.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-foreground text-primary-foreground text-xs font-semibold rounded-lg hover:bg-foreground/90 disabled:opacity-50 transition-colors">
            {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            {pending.length > 0 ? `Gerar ${pending.length} Assinatura${pending.length !== 1 ? 's' : ''}` : 'Assinaturas Geradas'}
          </button>
        </div>
      </div>

      {/* Resultados da última ação */}
      {results && (
        <div className={`text-xs rounded-lg px-3 py-2 border ${results.error ? 'bg-red-50 border-red-200 text-red-700' : 'bg-emerald-50 border-emerald-200 text-emerald-700'}`}>
          {results.error ? (
            <span className="flex items-center gap-2"><AlertTriangle className="w-3.5 h-3.5" /> {results.error}</span>
          ) : (
            <span className="flex items-center gap-2">
              <CheckCircle className="w-3.5 h-3.5" />
              {results.total_created > 0 ? `${results.total_created} assinatura(s) criada(s).` : 'Nenhuma nova assinatura criada.'}
              {results.total_errors > 0 && ` ${results.total_errors} erro(s).`}
            </span>
          )}
        </div>
      )}

      {/* Tabela de vínculos */}
      {vinculos.length > 0 ? (
        <div className="border border-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50 border-b border-border">
                  <th className="px-3 py-2.5 text-left font-semibold text-muted-foreground uppercase tracking-wider">Assinante</th>
                  <th className="px-3 py-2.5 text-left font-semibold text-muted-foreground uppercase tracking-wider">CPF/CNPJ</th>
                  <th className="px-3 py-2.5 text-right font-semibold text-muted-foreground uppercase tracking-wider">Valor/Ciclo</th>
                  <th className="px-3 py-2.5 text-center font-semibold text-muted-foreground uppercase tracking-wider">Ciclos Pagos</th>
                  <th className="px-3 py-2.5 text-left font-semibold text-muted-foreground uppercase tracking-wider">Próx. Cobrança</th>
                  <th className="px-3 py-2.5 text-center font-semibold text-muted-foreground uppercase tracking-wider">Situação da cobrança</th>
                  <th className="px-3 py-2.5 text-center font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                  <th className="px-3 py-2.5"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {vinculos.map((v) => (
                  <tr key={v.id} className="hover:bg-gray-50/50">
                    <td className="px-3 py-2 font-medium uppercase">{v.sacado_name}</td>
                    <td className="px-3 py-2 font-mono text-muted-foreground">{maskCpfCnpj(v.sacado_doc) || '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold">{formatCurrency(v.valor_assinatura || 0)}</td>
                    <td className="px-3 py-2 text-center tabular-nums">
                      {v.prazo_tipo === 'definido' ? `${v.ciclos_pagos || 0}/${v.num_ciclos || 0}` : `${v.ciclos_pagos || 0}`}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{v.proxima_cobranca ? formatDate(v.proxima_cobranca) : '—'}</td>
                    <td className="px-3 py-2 text-center">
                      {v.asaas_subscription_id ? (
                        <span className="text-[10px] font-mono text-muted-foreground">{v.asaas_status || '—'}</span>
                      ) : (
                        <span className="text-[10px] text-amber-600">não gerada</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${STATUS_STYLE[v.status] || 'bg-gray-50 text-gray-600 border-gray-200'}`}>
                        {v.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      {v.status === 'ativa' && v.asaas_subscription_id && (
                        <button
                          onClick={() => cancelarUm(v)}
                          disabled={cancelling === v.id}
                          className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-semibold text-red-600 hover:bg-red-50 rounded disabled:opacity-50">
                          {cancelling === v.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Ban className="w-3 h-3" />}
                          Cancelar
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-gray-50 border-t-2 border-border font-bold">
                  <td colSpan={2} className="px-3 py-2.5 text-right text-xs uppercase tracking-wider text-muted-foreground">Total</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{formatCurrency(totalPorCiclo)}/ciclo</td>
                  <td className="px-3 py-2.5 text-center tabular-nums text-emerald-600">{formatCurrency(totalRecebido)}</td>
                  <td colSpan={4}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      ) : (
        <div className="bg-white border border-border rounded-xl p-8 text-center text-sm text-muted-foreground">
          Nenhum assinante vinculado a esta operação.
        </div>
      )}

      {operacao.asaas_billing_type === 'CREDIT_CARD' && (
        <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          <CreditCard className="w-3.5 h-3.5 shrink-0" />
          Cartão de crédito requer tokenização via Asaas.js. As assinaturas com cartão não serão criadas até configurar a tokenização.
        </div>
      )}

      <div className="flex items-start gap-2 text-xs text-blue-700 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
        <Calendar className="w-3.5 h-3.5 shrink-0 mt-0.5" />
        <span>
          As cobranças são geradas automaticamente pelo Asaas conforme o ciclo. Os recebimentos amortizam o saldo devedor da operação
          {operacao.assinatura_prazo_tipo === 'definido' ? ' e, ao atingir o número de ciclos, a assinatura é encerrada automaticamente.' : ' e seguem até cancelamento manual.'}
        </span>
      </div>
    </div>
  );
}