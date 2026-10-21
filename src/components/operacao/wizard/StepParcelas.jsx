import { useState, useEffect } from 'react';
import { formatCurrency } from '@/lib/finance';
import { calcTituloRow } from './TituloInlineTable';
import { resumoFinanceiro } from '@/lib/operacaoCalc';
import { RefreshCw, AlertTriangle, Calendar } from 'lucide-react';

function addDays(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

function round2(v) {return Math.round(v * 100) / 100;}

const CALCMODE_INFO = {
  inverso: { totalLabel: 'Valor Total a Receber (Face)', hint: 'Digite o valor total a receber (face). O líquido é calculado descontando o deságio de cada parcela conforme o prazo.' },
  padrao: { totalLabel: 'Valor Líquido Total', hint: 'Digite o valor líquido total (net). O valor de face é calculado no sentido oposto para cada parcela.' },
  desconto_direto: { totalLabel: 'Valor Líquido Total', hint: 'Digite o valor líquido total. O valor de face é calculado adicionando juros simples por parcela.' },
  capital_desagio: { totalLabel: 'Valor Total', hint: 'Configuração de parcelas de deságio.' }
};

export default function StepParcelas({ form, setForm, titulos, setTitulos, calcMode }) {
  const inverseMode = form.calculo_inverso || false;
  const isEmprestimo = form.tipo === 'emprestimo';
  const effectiveCalcMode = isEmprestimo ? 'emprestimo' : (inverseMode ? 'padrao' : calcMode);

  const handleToggleInverse = () => {
    setForm((f) => ({ ...f, calculo_inverso: !f.calculo_inverso }));
  };

  const [config, setConfig] = useState({
    valorTotal: '',
    numParcelas: 2,
    intervalo: 30,
    primeiroVencimento: ''
  });

  const rate = parseFloat(form.rate) || 0;
  const floatDias = parseFloat(form.float_dias) || 0;
  const info = isEmprestimo
    ? { totalLabel: 'Valor do Repasse', hint: 'Digite o valor do repasse (empréstimo). Todas as taxas e deságio são embutidos em parcelas iguais.' }
    : inverseMode
      ? { totalLabel: 'Valor Líquido Total', hint: 'Digite o valor líquido total. O valor de face é calculado somando o deságio: face = valor ÷ (1 − taxa × dias/30).' }
      : CALCMODE_INFO[effectiveCalcMode] || CALCMODE_INFO.inverso;

  // Initialize from existing titulos
  useEffect(() => {
    if (titulos.length > 0 && titulos[0]?.vencimento) {
      const total = titulos.reduce((s, t) => s + (parseFloat(t.valor_face) || 0), 0);
      let interval = 30;
      if (titulos.length > 1 && titulos[0].vencimento && titulos[1].vencimento) {
        const d1 = new Date(titulos[0].vencimento + 'T00:00:00');
        const d2 = new Date(titulos[1].vencimento + 'T00:00:00');
        interval = Math.max(1, Math.round((d2 - d1) / 86400000));
      }
      setConfig({
        valorTotal: String(round2(total)),
        numParcelas: titulos.length,
        intervalo: interval,
        primeiroVencimento: titulos[0].vencimento
      });
    }
  }, []);

  const gerarParcelas = () => {
    const total = parseFloat(config.valorTotal) || 0;
    const n = parseInt(config.numParcelas) || 1;
    const interval = parseInt(config.intervalo) || 30;
    const firstDate = config.primeiroVencimento;

    if (!total || !n || !firstDate) return;

    const sacadoNome = form.sacado_name || '';
    const sacadoDoc = form.sacado_doc || '';

    if (isEmprestimo) {
      // Empréstimo: deságio calculado por parcela (fórmula padrão), face distribuída igualmente
      const liquidoPorParcela = round2(total / n);
      let totalDesagioCalc = 0;
      for (let i = 0; i < n; i++) {
        const venc = addDays(firstDate, i * interval);
        const tituloTemp = { valor_face: String(liquidoPorParcela), vencimento: venc, outras_despesas: '0' };
        const { desagio } = calcTituloRow(tituloTemp, form.start_date, rate, form.interest_type, floatDias, form.arredondar_taxa_diaria, 'padrao');
        totalDesagioCalc += desagio;
      }
      const totalTarifasCalc = (parseFloat(form.tarifa_operacao) || 0) + (parseFloat(form.tarifa_por_titulo) || 0) * n;
      const totalFaceCalc = total + totalDesagioCalc + totalTarifasCalc;
      const facePorParcela = round2(totalFaceCalc / n);
      const newTitulosEmp = Array.from({ length: n }, (_, i) => ({
        tipo: 'boleto',
        numero: `${i + 1}/${n}`,
        nf: '',
        sacado: sacadoNome,
        sacado_doc: sacadoDoc,
        vencimento: addDays(firstDate, i * interval),
        valor_face: String(facePorParcela),
        valor_liquido: String(liquidoPorParcela),
        outras_despesas: ''
      }));
      setTitulos(newTitulosEmp);
      return;
    }

    const valorPorParcela = round2(total / n);
    const newTitulos = Array.from({ length: n }, (_, i) => ({
      tipo: form.tipo === 'cheque' ? 'cheque' : 'boleto',
      numero: `${i + 1}/${n}`,
      nf: '',
      sacado: sacadoNome,
      sacado_doc: sacadoDoc,
      vencimento: addDays(firstDate, i * interval),
      valor_face: String(valorPorParcela),
      outras_despesas: ''
    }));
    setTitulos(newTitulos);
  };

  const updateVencimento = (idx, vencimento) => {
    setTitulos(titulos.map((t, i) => i === idx ? { ...t, vencimento } : t));
  };

  // M4 — mesma função usada na gravação: exibição e persistência não divergem.
  const resumo = resumoFinanceiro({ titulos, form, calcMode: effectiveCalcMode });
  const totals = resumo.totals;
  const validCount = resumo.n;
  const totalDistribuidoTotal = resumo.totalDistribuidoTotal;

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-bold mb-1">Configuração de Parcelas</h3>
        
      </div>

      {/* Sacado info banner */}
      <div className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2.5 text-xs text-blue-800 flex items-center gap-2">
        <Calendar className="w-3.5 h-3.5 shrink-0" />
        <span>Sacado: <strong>{form.sacado_name || '—'}</strong> {form.sacado_doc ? `(${form.sacado_doc})` : ''}</span>
        
      </div>

      {/* Inverse mode toggle */}
      <label className="flex items-center gap-2.5 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={inverseMode}
          onChange={handleToggleInverse}
          className="w-4 h-4 rounded border-border text-[hsl(43,65%,47%)] focus:ring-[hsl(43,65%,47%)] shrink-0" />
        
        <span className="text-xs">
          <span className="font-semibold text-foreground">Calcular sentido inverso</span>
          
        </span>
      </label>

      {/* Configurator */}
      <div className="border border-border rounded-xl p-4 space-y-3 bg-gray-50/50">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">{info.totalLabel} *</label>
            <input type="number" step="0.01" className="input-field" value={config.valorTotal} onChange={(e) => setConfig((c) => ({ ...c, valorTotal: e.target.value }))} placeholder="0,00" />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Nº de Parcelas *</label>
            <input type="number" min="1" max="60" className="input-field" value={config.numParcelas} onChange={(e) => setConfig((c) => ({ ...c, numParcelas: e.target.value }))} />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Intervalo (dias) *</label>
            <input type="number" min="1" className="input-field" value={config.intervalo} onChange={(e) => setConfig((c) => ({ ...c, intervalo: e.target.value }))} />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">1º Vencimento *</label>
            <input type="date" className="input-field" value={config.primeiroVencimento} onChange={(e) => setConfig((c) => ({ ...c, primeiroVencimento: e.target.value }))} />
          </div>
        </div>
        <button onClick={gerarParcelas} disabled={!config.valorTotal || !config.numParcelas || !config.primeiroVencimento}
        className="inline-flex items-center gap-2 px-4 py-2 bg-foreground text-primary-foreground text-sm font-semibold rounded-lg disabled:opacity-50 hover:bg-foreground/90 transition-colors">
          <RefreshCw className="w-3.5 h-3.5" /> Gerar Parcelas
        </button>
      </div>

      {/* Parcelas table */}
      {titulos.length > 0 &&
      <div className="border border-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50 border-b border-border">
                  <th className="px-3 py-2.5 text-left font-semibold text-muted-foreground uppercase tracking-wider">Parcela</th>
                  <th className="px-3 py-2.5 text-left font-semibold text-muted-foreground uppercase tracking-wider">Vencimento</th>
                  <th className="px-3 py-2.5 text-right font-semibold text-muted-foreground uppercase tracking-wider">Dias</th>
                  <th className="px-3 py-2.5 text-right font-semibold text-muted-foreground uppercase tracking-wider">Valor</th>
                  <th className="px-3 py-2.5 text-right font-semibold text-muted-foreground uppercase tracking-wider">Deságio</th>
                  <th className="px-3 py-2.5 text-right font-semibold text-muted-foreground uppercase tracking-wider">Líquido</th>
                  <th className="px-3 py-2.5 text-right font-semibold text-muted-foreground uppercase tracking-wider">Total Distrib.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {titulos.map((t, i) => {
                const { dias, desagio, liquido, valorFace } = calcTituloRow(t, form.start_date, rate, form.interest_type, floatDias, form.arredondar_taxa_diaria, effectiveCalcMode);
                const totalDistribuido = resumo.porTitulo[i] ?? 0;
                return (
                  <tr key={i} className="hover:bg-gray-50/50">
                      <td className="px-3 py-2 font-medium">{t.numero || `${i + 1}/${titulos.length}`}</td>
                      <td className="px-3 py-2">
                        <input type="date" className="input-field py-1 text-xs" value={t.vencimento} onChange={(e) => updateVencimento(i, e.target.value)} />
                      </td>
                      <td className="px-3 py-2 text-right text-muted-foreground tabular-nums">{dias || '—'}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(valorFace)}</td>
                      <td className="px-3 py-2 text-right text-red-600 tabular-nums">{desagio ? formatCurrency(desagio) : '—'}</td>
                      <td className="px-3 py-2 text-right text-emerald-600 font-semibold tabular-nums">{liquido ? formatCurrency(liquido) : '—'}</td>
                      <td className="px-3 py-2 text-right font-semibold tabular-nums text-[hsl(43,65%,47%)]">{formatCurrency(totalDistribuido)}</td>
                    </tr>);

              })}
              </tbody>
              <tfoot>
                <tr className="bg-gray-50 border-t-2 border-border font-bold">
                  <td colSpan={3} className="px-3 py-2.5 text-right text-xs uppercase tracking-wider text-muted-foreground">Total ({titulos.length} parcelas)</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{formatCurrency(totals.totalFace)}</td>
                  <td className="px-3 py-2.5 text-right text-red-600 tabular-nums">{formatCurrency(totals.totalDesagio)}</td>
                  <td className="px-3 py-2.5 text-right text-emerald-600 tabular-nums">{formatCurrency(totals.totalLiquido)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-[hsl(43,65%,47%)] font-bold">{formatCurrency(totalDistribuidoTotal)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      }

      {validCount === 0 &&
      <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          Configure os parâmetros acima e clique em "Gerar Parcelas" para criar as parcelas.
        </div>
      }
    </div>);

}