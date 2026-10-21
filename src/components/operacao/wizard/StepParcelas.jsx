import { useState, useEffect } from 'react';
import { formatCurrency, daysBetween } from '@/lib/finance';
import { calcTituloRow } from './TituloInlineTable';
import { resumoFinanceiro } from '@/lib/operacaoCalc';
import {
  PRICE, DESAGIO_FACE, FACE_POR_REPASSE, calcModeEfetivo,
} from '@/lib/formatosCalculo';
import {
  cronogramaPriceOperacao, datasParcelas, linhasPriceDeTitulos, rateioDespesas,
} from '@/lib/priceOperacao';
import ParcelasPriceTable from './ParcelasPriceTable';
import { RefreshCw, AlertTriangle, Calendar } from 'lucide-react';

function addDays(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

function round2(v) {return Math.round(v * 100) / 100;}

const CALCMODE_INFO = {
  [DESAGIO_FACE]: { totalLabel: 'Valor Total de Face', hint: 'Digite o valor total de face. O deságio de cada parcela é descontado conforme o prazo, e o que sobra é o repasse.' },
  [FACE_POR_REPASSE]: { totalLabel: 'Repasse Desejado', hint: 'Digite o repasse que o cliente quer receber. O valor de face é calculado: face = repasse ÷ (1 − taxa × dias/30).' },
  [PRICE]: { totalLabel: 'Repasse Solicitado', hint: 'Tabela Price: o valor é distribuído em parcelas calculadas pela taxa e pelos dias de cada intervalo (a taxa do período é proporcional aos dias).' },
  desconto_direto: { totalLabel: 'Valor Líquido Total', hint: 'Formato legado: o valor de face é calculado adicionando juros simples por parcela.' },
  capital_desagio: { totalLabel: 'Valor Total', hint: 'Configuração de parcelas de deságio.' }
};

export default function StepParcelas({ form, setForm, titulos, setTitulos, calcMode }) {
  const inverseMode = form.calculo_inverso || false;
  const isEmprestimo = form.tipo === 'emprestimo';
  const effectiveCalcMode = calcModeEfetivo({ tipo: form.tipo, calcMode, calculoInverso: inverseMode });
  const isPrice = effectiveCalcMode === PRICE;
  // Parcelado aceita duas entradas: repasse desejado (padrão) ou valor da parcela.
  const [entradaPrice, setEntradaPrice] = useState('repasse');
  const tipoTitulo = form.tipo === 'cheque' || form.tipo === 'duplicata' ? form.tipo : 'boleto';

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
  const tarifaOperacao = parseFloat(form.tarifa_operacao) || 0;
  const tarifaPorTitulo = parseFloat(form.tarifa_por_titulo) || 0;
  const info = isPrice
    ? (entradaPrice === 'parcela'
      ? { totalLabel: 'Valor da Parcela', hint: 'Digite o valor de cada parcela. O repasse é o valor presente das parcelas, descontado pelas taxas de cada período.' }
      : CALCMODE_INFO[PRICE])
    : isEmprestimo
      ? { totalLabel: 'Valor do Repasse', hint: 'Digite o valor do repasse (empréstimo). Todas as taxas e deságio são embutidos em parcelas iguais.' }
      : CALCMODE_INFO[effectiveCalcMode] || CALCMODE_INFO[DESAGIO_FACE];

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

    if (isPrice) {
      // Tabela Price: parcelas de mesmo valor nominal, juros por período real.
      // `valor_liquido` guarda a amortização (parte do valor presente).
      const { linhas } = cronogramaPriceOperacao({
        vencimentos: datasParcelas(firstDate, interval, n),
        startDate: form.start_date,
        taxaMensalPct: rate,
        interestType: form.interest_type,
        repasse: entradaPrice === 'parcela' ? 0 : total,
        valorParcela: entradaPrice === 'parcela' ? total : 0,
        tarifaOperacao,
        tarifaPorTitulo
      });
      if (!linhas.length) return;
      setTitulos(linhas.map((l) => ({
        tipo: tipoTitulo,
        numero: `${l.numero}/${n}`,
        nf: '',
        sacado: sacadoNome,
        sacado_doc: sacadoDoc,
        vencimento: l.vencimento,
        valor_face: String(l.face),
        valor_liquido: String(l.amortizacao),
        outras_despesas: ''
      })));
      return;
    }

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
      tipo: tipoTitulo,
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
    if (!isPrice) {
      setTitulos(titulos.map((t, i) => i === idx ? { ...t, vencimento } : t));
      return;
    }
    // Parcelado: mudar o vencimento muda os dias do período, então o cronograma
    // é recalculado mantendo o MESMO valor presente (Σ amortização). As
    // parcelas continuam iguais e o repasse ao cliente não se altera.
    const pv = round2(titulos.reduce((s, t) => s + (parseFloat(t.valor_liquido) || 0), 0));
    const despesas = round2(rateioDespesas({
      quantidade: titulos.length, tarifaOperacao, tarifaPorTitulo,
    }).reduce((s, v) => s + v, 0));
    const { linhas } = cronogramaPriceOperacao({
      vencimentos: titulos.map((t, i) => i === idx ? vencimento : t.vencimento),
      startDate: form.start_date,
      taxaMensalPct: rate,
      interestType: form.interest_type,
      repasse: round2(pv - despesas),
      tarifaOperacao,
      tarifaPorTitulo
    });
    if (!linhas.length) return;
    setTitulos(linhas.map((l, i) => ({
      ...titulos[i],
      numero: `${l.numero}/${linhas.length}`,
      vencimento: l.vencimento,
      valor_face: String(l.face),
      valor_liquido: String(l.amortizacao),
      outras_despesas: ''
    })));
  };

  // M4 — mesma função usada na gravação: exibição e persistência não divergem.
  const resumo = resumoFinanceiro({ titulos, form, calcMode: effectiveCalcMode });
  const totals = resumo.totals;
  const validCount = resumo.n;
  const totalDistribuidoTotal = resumo.totalDistribuidoTotal;

  // Parcelado: mesmas linhas exibidas aqui alimentam o Resumo & Confirmação.
  const priceData = isPrice
    ? linhasPriceDeTitulos(titulos, {
      startDate: form.start_date,
      taxaMensalPct: rate,
      interestType: form.interest_type,
      tarifaOperacao,
      tarifaPorTitulo
    })
    : null;

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

      {/* Inverse mode toggle — no Parcelado a inversão é a escolha da entrada */}
      {!isPrice &&
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
      }

      {/* Configurator */}
      <div className="border border-border rounded-xl p-4 space-y-3 bg-gray-50/50">
        {isPrice &&
        <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">Calcular a partir de</span>
            <select
            className="input-field py-1 text-xs w-auto"
            value={entradaPrice}
            onChange={(e) => setEntradaPrice(e.target.value)}>
              <option value="repasse">Repasse solicitado</option>
              <option value="parcela">Valor da parcela</option>
            </select>
            <span className="text-xs text-muted-foreground">{info.hint}</span>
          </div>
        }
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

      {/* Parcelas table — no Parcelado, a tabela Price (juros/amortização/despesas) */}
      {titulos.length > 0 && isPrice &&
      <ParcelasPriceTable
        linhas={priceData.linhas}
        totais={priceData.totais}
        onVencimentoChange={updateVencimento} />

      }
      {titulos.length > 0 && !isPrice &&
      <div className="border border-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50 border-b border-border">
                  <th className="px-3 py-2.5 text-left font-semibold text-muted-foreground uppercase tracking-wider">Parcela</th>
                  <th className="px-3 py-2.5 text-left font-semibold text-muted-foreground uppercase tracking-wider">Vencimento</th>
                  <th className="px-3 py-2.5 text-right font-semibold text-muted-foreground uppercase tracking-wider">Dias</th>
                  <th className="px-3 py-2.5 text-right font-semibold text-muted-foreground uppercase tracking-wider">{isPrice ? 'Parcela (Face)' : 'Valor'}</th>
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