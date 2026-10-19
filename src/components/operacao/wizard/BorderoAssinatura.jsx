import { forwardRef } from 'react';
import { formatCurrency, formatDate } from '@/lib/finance';
import { CICLO_LABEL } from '@/lib/assinaturaCalc';
import { maskCpfCnpj } from '@/lib/masks';

const BILLING_LABEL = { PIX: 'PIX', BOLETO: 'Boleto', CREDIT_CARD: 'Cartão de Crédito' };

function round2(v) { return Math.round(v * 100) / 100; }

/**
 * Borderô detalhado da operação de assinatura — lista todos os assinantes
 * com detalhamento financeiro por sacado e totais da negociação.
 * Projetado para ser capturado (imagem/PDF) isoladamente.
 */
const BorderoAssinatura = forwardRef(function BorderoAssinatura({ form, selectedClient, assinantes, calc, totalPorCiclo, numAssinantes, simulacao, simQtd, valorPorAssinante }, ref) {
  const ciclo = form.assinatura_ciclo || 'MONTHLY';
  const numCiclos = parseInt(form.assinatura_num_ciclos) || 0;
  const taxa = parseFloat(form.rate) || 0;
  const tarifaOperacao = parseFloat(form.tarifa_operacao) || 0;
  const tarifaPorTitulo = parseFloat(form.tarifa_por_titulo) || 0;
  const floatDias = parseFloat(form.float_dias) || 0;
  const billingType = form.assinatura_billing_type || 'BOLETO';
  const prazoTipo = form.assinatura_prazo_tipo || 'indefinido';

  const totalReceivable = calc.totalReceivable || 0;
  const totalDesagio = calc.totalDesagio || 0;
  const totalTarifas = calc.totalTarifas || 0;
  const valorAntecipacao = calc.valorAntecipacao || 0;

  // Distribuição proporcional do deságio e tarifas por assinante (base: valor/ciclo)
  const baseCiclo = totalPorCiclo > 0 ? totalPorCiclo : 1;
  const tarifaPorAssinanteTotal = numAssinantes > 0 ? tarifaPorTitulo * numAssinantes * numCiclos : 0;

  const linhas = (assinantes || []).map((a, i) => {
    const valorCiclo = parseFloat(a.valor_assinatura) || 0;
    const proporcao = valorCiclo / baseCiclo;
    const totalAssinante = round2(valorCiclo * numCiclos);
    const desagioAssinante = round2(totalDesagio * proporcao);
    const tarifaAssinante = round2((tarifaPorAssinanteTotal + tarifaOperacao) * proporcao);
    const liquidoAssinante = round2(totalAssinante - desagioAssinante - tarifaAssinante);
    return { idx: i + 1, nome: a.sacado_name, doc: a.sacado_doc, valorCiclo, totalAssinante, desagioAssinante, tarifaAssinante, liquidoAssinante };
  });

  return (
    <div ref={ref} className="border border-border rounded-xl overflow-hidden bg-white">
      {/* Cabeçalho do borderô */}
      <div className="bg-gray-900 text-white px-5 py-3 flex items-center justify-between">
        <div>
          <h4 className="text-sm font-bold uppercase tracking-wider">Borderô de Assinatura</h4>
          <p className="text-[10px] text-gray-300 mt-0.5">Detalhamento da operação de antecipação de recebíveis</p>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-wider text-gray-400">Data Base</div>
          <div className="text-xs font-semibold">{formatDate(form.start_date)}</div>
        </div>
      </div>

      {/* Dados da negociação */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-border">
        <div className="bg-white px-3 py-2.5">
          <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Cedente</div>
          <div className="text-xs font-bold mt-0.5 truncate uppercase">{selectedClient?.name || '—'}</div>
          <div className="text-[10px] font-mono text-muted-foreground">{selectedClient?.document || '—'}</div>
        </div>
        <div className="bg-white px-3 py-2.5">
          <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Produto</div>
          <div className="text-xs font-bold mt-0.5">{form.produto || '—'}</div>
          <div className="text-[10px] text-muted-foreground">Assinatura recorrente</div>
        </div>
        <div className="bg-white px-3 py-2.5">
          <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Ciclo / Método</div>
          <div className="text-xs font-bold mt-0.5">{CICLO_LABEL[ciclo] || ciclo} · {BILLING_LABEL[billingType] || billingType}</div>
          <div className="text-[10px] text-muted-foreground">Float: {floatDias} dias</div>
        </div>
        <div className="bg-white px-3 py-2.5">
          <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Prazo / Período</div>
          <div className="text-xs font-bold mt-0.5">{prazoTipo === 'definido' ? `Definido` : 'Indefinido'} · {numCiclos} ciclos</div>
          <div className="text-[10px] text-muted-foreground">Taxa: {taxa}% a.m. ({form.interest_type === 'composto' ? 'Composto' : 'Simples'})</div>
        </div>
      </div>

      {/* Tabela de assinantes */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-gray-50">
            <tr className="border-b border-border">
              <th className="px-3 py-2.5 text-left font-semibold text-muted-foreground uppercase tracking-wider">#</th>
              <th className="px-3 py-2.5 text-left font-semibold text-muted-foreground uppercase tracking-wider">Assinante</th>
              <th className="px-3 py-2.5 text-left font-semibold text-muted-foreground uppercase tracking-wider">CPF/CNPJ</th>
              <th className="px-3 py-2.5 text-right font-semibold text-muted-foreground uppercase tracking-wider">Valor / Ciclo</th>
              <th className="px-3 py-2.5 text-right font-semibold text-muted-foreground uppercase tracking-wider">Total ({numCiclos} ciclos)</th>
              <th className="px-3 py-2.5 text-right font-semibold text-muted-foreground uppercase tracking-wider">Deságio</th>
              <th className="px-3 py-2.5 text-right font-semibold text-muted-foreground uppercase tracking-wider">Tarifas</th>
              <th className="px-3 py-2.5 text-right font-semibold text-muted-foreground uppercase tracking-wider">Líquido</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {simulacao ? (
              <tr className="bg-amber-50/40">
                <td className="px-3 py-2 text-muted-foreground">—</td>
                <td className="px-3 py-2 italic text-amber-800" colSpan={2}>Simulação — {simQtd} assinantes a {formatCurrency(valorPorAssinante)}/ciclo</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(valorPorAssinante)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(round2(valorPorAssinante * numCiclos))}</td>
                <td className="px-3 py-2 text-right tabular-nums text-red-600">{formatCurrency(totalDesagio)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-red-600">{formatCurrency(totalTarifas)}</td>
                <td className="px-3 py-2 text-right tabular-nums font-semibold text-emerald-600">{formatCurrency(valorAntecipacao)}</td>
              </tr>
            ) : linhas.length > 0 ? (
              linhas.map((l) => (
                <tr key={l.idx} className="hover:bg-gray-50/50">
                  <td className="px-3 py-2 text-muted-foreground font-medium">{l.idx}</td>
                  <td className="px-3 py-2 font-medium uppercase truncate max-w-[160px]">{l.nome}</td>
                  <td className="px-3 py-2 font-mono text-muted-foreground">{maskCpfCnpj(l.doc)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(l.valorCiclo)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(l.totalAssinante)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-red-600">{formatCurrency(l.desagioAssinante)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-red-600">{formatCurrency(l.tarifaAssinante)}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold text-emerald-600">{formatCurrency(l.liquidoAssinante)}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={8} className="px-3 py-4 text-center text-muted-foreground italic">Nenhum assinante adicionado.</td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr className="bg-gray-100 border-t-2 border-border font-bold">
              <td colSpan={3} className="px-3 py-2.5 text-right text-xs uppercase tracking-wider text-muted-foreground">Totais ({simulacao ? simQtd : linhas.length} assinantes)</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{formatCurrency(totalPorCiclo)}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{formatCurrency(totalReceivable)}</td>
              <td className="px-3 py-2.5 text-right tabular-nums text-red-600">{formatCurrency(totalDesagio)}</td>
              <td className="px-3 py-2.5 text-right tabular-nums text-red-600">{formatCurrency(totalTarifas)}</td>
              <td className="px-3 py-2.5 text-right tabular-nums text-emerald-600">{formatCurrency(valorAntecipacao)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Resumo da negociação */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-border border-t border-border">
        <div className="bg-white px-3 py-2.5">
          <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Total a Receber</div>
          <div className="text-sm font-bold mt-0.5 tabular-nums">{formatCurrency(totalReceivable)}</div>
        </div>
        <div className="bg-white px-3 py-2.5">
          <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Deságio</div>
          <div className="text-sm font-bold mt-0.5 tabular-nums text-red-600">{formatCurrency(totalDesagio)}</div>
        </div>
        <div className="bg-white px-3 py-2.5">
          <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Tarifas</div>
          <div className="text-sm font-bold mt-0.5 tabular-nums text-red-600">{formatCurrency(totalTarifas)}</div>
        </div>
        <div className="bg-emerald-50 px-3 py-2.5">
          <div className="text-[10px] font-semibold text-emerald-700 uppercase tracking-wider">Valor Antecipado</div>
          <div className="text-sm font-bold mt-0.5 tabular-nums text-emerald-700">{formatCurrency(valorAntecipacao)}</div>
        </div>
      </div>
    </div>
  );
});

export default BorderoAssinatura;