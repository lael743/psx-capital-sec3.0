import { Plus, Trash2 } from 'lucide-react';
import { daysBetween, formatCurrency } from '@/lib/finance';
import { maskCpfCnpj } from '@/lib/masks';

export const emptyTitulo = () => ({
  tipo: 'cheque',
  numero: '',
  nf: '',
  sacado: '',
  sacado_doc: '',
  vencimento: '',
  valor_face: '',
  outras_despesas: '',
});

function round2(v) { return Math.round(v * 100) / 100; }

/**
 * Calcula deságio de um título usando desconto comercial.
 * deságio = valor_face × (taxa/100) × (dias/30)
 * Se arredondarTaxaDiaria, arredonda a taxa diária para 2 casas antes.
 */
export function calcDesagioTitulo(valorFace, taxaMensal, dias, interestType, arredondarTaxaDiaria) {
  if (!valorFace || !taxaMensal || !dias || dias <= 0) return 0;
  if (interestType === 'composto') {
    const dailyR = arredondarTaxaDiaria
      ? Math.ceil((taxaMensal / 30) * 100) / 100 / 100
      : taxaMensal / 100 / 30;
    return round2(valorFace * (Math.pow(1 + dailyR, dias) - 1));
  }
  if (arredondarTaxaDiaria) {
    const dailyRatePct = Math.ceil((taxaMensal / 30) * 100) / 100;
    return round2(valorFace * (dailyRatePct / 100) * dias);
  }
  return round2(valorFace * (taxaMensal / 100) * (dias / 30));
}

/**
 * Calcula um título conforme o calcMode:
 * - 'inverso' (Juros Embutido): usuário digita Valor de Face (total a receber);
 *   líquido = face − deságio − outras_despesas
 * - 'padrao': usuário digita Valor Líquido (net); face = líquido / (1 − taxa × dias/30)
 * - 'desconto_direto': usuário digita Valor Líquido (net); face = líquido × (1 + taxa × dias/30)
 *
 * O campo `valor_face` do título armazena o valor DIGITADO pelo usuário.
 * O retorno inclui `valorFace` (face real) e `liquido` (líquido real).
 */
export function calcTituloRow(titulo, startDate, rate, interestType, floatDias, arredondarTaxaDiaria, calcMode = 'inverso') {
  const inputValor = parseFloat(titulo.valor_face) || 0;
  const outrasDespesas = parseFloat(titulo.outras_despesas) || 0;
  const dias = titulo.vencimento ? daysBetween(startDate, titulo.vencimento) + (floatDias || 0) : 0;

  let valorFace, desagio, liquido;

  if (calcMode === 'padrao') {
    // Usuário digita líquido; face = líquido / (1 − taxa × dias/30)
    liquido = inputValor;
    const taxaProp = (rate / 100) * (dias / 30);
    const fator = 1 - taxaProp;
    valorFace = fator > 0 ? round2(liquido / fator) : liquido;
    desagio = round2(valorFace - liquido);
  } else if (calcMode === 'desconto_direto') {
    // Usuário digita líquido; face = líquido + juros simples
    liquido = inputValor;
    const taxaProp = (rate / 100) * (dias / 30);
    desagio = round2(liquido * taxaProp);
    valorFace = round2(liquido + desagio);
  } else if (calcMode === 'emprestimo') {
    // Empréstimo: parcelas iguais com todas as taxas embutidas na face
    // valor_face = face igual (pré-calculada), valor_liquido = líquido igual (repasse ÷ parcelas)
    valorFace = inputValor;
    liquido = parseFloat(titulo.valor_liquido) || 0;
    desagio = round2(valorFace - liquido);
  } else {
    // inverso: usuário digita face; líquido = face − deságio − outras
    valorFace = inputValor;
    desagio = calcDesagioTitulo(valorFace, rate, dias, interestType, arredondarTaxaDiaria);
    liquido = round2(valorFace - desagio - outrasDespesas);
  }

  return { dias, desagio, liquido, valorFace };
}

export function calcTitulosTotais(titulos, startDate, rate, interestType, floatDias, arredondarTaxaDiaria, calcMode = 'inverso') {
  let totalFace = 0, totalDesagio = 0, totalOutras = 0, totalLiquido = 0, pesoDias = 0;
  titulos.forEach((t) => {
    const { dias, desagio, liquido, valorFace } = calcTituloRow(t, startDate, rate, interestType, floatDias, arredondarTaxaDiaria, calcMode);
    totalFace += valorFace;
    totalDesagio += desagio;
    totalOutras += parseFloat(t.outras_despesas) || 0;
    totalLiquido += liquido;
    pesoDias += dias * valorFace;
  });
  const prazoMedio = totalFace > 0 ? pesoDias / totalFace : 0;
  const desagioPeriodo = totalFace > 0 ? (totalDesagio / totalFace) * 100 : 0;
  return {
    totalFace: round2(totalFace),
    totalDesagio: round2(totalDesagio),
    totalOutras: round2(totalOutras),
    totalLiquido: round2(totalLiquido),
    prazoMedio,
    desagioPeriodo,
  };
}

/**
 * Total Distribuído total = Total Bruto (total a receber).
 * - Padrão: face + tarifas + outras (tarifas repassadas ao cedente)
 * - Inverso: apenas face (tarifas descontadas do líquido)
 */
export function calcTotalDistribuidoTotal(totalFace, totalTarifas, totalOutras, isPadrao) {
  return round2(isPadrao ? totalFace + totalOutras + totalTarifas : totalFace);
}

/**
 * Total Distribuído por parcela = Total Bruto dividido igualmente entre as parcelas.
 */
export function calcTotalDistribuidoPerParcel(totalFace, totalTarifas, totalOutras, numParcelas, isPadrao) {
  if (!numParcelas || numParcelas <= 0) return 0;
  const total = calcTotalDistribuidoTotal(totalFace, totalTarifas, totalOutras, isPadrao);
  return round2(total / numParcelas);
}

const CALCMODE_INFO = {
  inverso: { inputLabel: 'Valor Face', inputPlaceholder: '0,00', calcLabel: 'Líquido', calcColor: 'text-emerald-600', hint: 'Digite o Valor de Face (total a receber). O líquido é calculado descontando o deságio.' },
  padrao: { inputLabel: 'Valor Líquido', inputPlaceholder: '0,00', calcLabel: 'Face', calcColor: 'text-blue-600', hint: 'Digite o Valor Líquido (net a receber). O valor de face é calculado no sentido oposto.' },
  desconto_direto: { inputLabel: 'Valor Líquido', inputPlaceholder: '0,00', calcLabel: 'Face', calcColor: 'text-blue-600', hint: 'Digite o Valor Líquido (net). O valor de face é calculado adicionando juros simples.' },
};

export default function TituloInlineTable({ titulos, onChange, startDate, rate, interestType, floatDias, arredondarTaxaDiaria, calcMode = 'inverso' }) {
  const update = (idx, field, value) => {
    const next = titulos.map((t, i) => (i === idx ? { ...t, [field]: value } : t));
    onChange(next);
  };

  const addRow = () => onChange([...titulos, emptyTitulo()]);
  const removeRow = (idx) => onChange(titulos.filter((_, i) => i !== idx));

  const totals = calcTitulosTotais(titulos, startDate, rate, interestType, floatDias, arredondarTaxaDiaria, calcMode);
  const info = CALCMODE_INFO[calcMode] || CALCMODE_INFO.inverso;

  const inputCls = 'w-full px-2 py-1.5 text-xs border border-border rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-ring focus:border-transparent';

  const headers = ['#', 'Tipo', 'Número', 'NF', 'Sacado', 'CPF/CNPJ', 'Vencimento', info.inputLabel, 'Dias', 'Deságio', 'Outras', info.calcLabel, ''];

  return (
    <div className="space-y-2">
      <div className="text-xs text-muted-foreground bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
        {info.hint}
      </div>
      <div className="border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 border-b border-border">
                {headers.map((h, i) => (
                  <th key={i} className="px-2 py-2.5 text-left font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {titulos.map((t, idx) => {
                const { dias, desagio, liquido, valorFace } = calcTituloRow(t, startDate, rate, interestType, floatDias, arredondarTaxaDiaria, calcMode);
                return (
                  <tr key={idx} className="hover:bg-gray-50/50">
                    <td className="px-2 py-1.5 text-muted-foreground font-medium">{idx + 1}</td>
                    <td className="px-2 py-1.5">
                      <select className={inputCls} value={t.tipo} onChange={(e) => update(idx, 'tipo', e.target.value)}>
                        <option value="cheque">Cheque</option>
                        <option value="boleto">Boleto</option>
                        <option value="duplicata">Duplicata</option>
                      </select>
                    </td>
                    <td className="px-2 py-1.5">
                      <input className={`${inputCls} font-mono`} value={t.numero} onChange={(e) => update(idx, 'numero', e.target.value)} placeholder="000123" />
                    </td>
                    <td className="px-2 py-1.5">
                      <input className={inputCls} value={t.nf} onChange={(e) => update(idx, 'nf', e.target.value)} placeholder="NF" />
                    </td>
                    <td className="px-2 py-1.5">
                      <input className={`${inputCls} uppercase min-w-[120px]`} value={t.sacado} onChange={(e) => update(idx, 'sacado', e.target.value.toUpperCase())} placeholder="Nome do sacado" />
                    </td>
                    <td className="px-2 py-1.5">
                      <input className={`${inputCls} font-mono min-w-[120px]`} value={t.sacado_doc} onChange={(e) => update(idx, 'sacado_doc', maskCpfCnpj(e.target.value))} placeholder="000.000.000-00" />
                    </td>
                    <td className="px-2 py-1.5">
                      <input type="date" className={inputCls} value={t.vencimento} onChange={(e) => update(idx, 'vencimento', e.target.value)} />
                    </td>
                    <td className="px-2 py-1.5">
                      <input type="number" step="0.01" className={`${inputCls} text-right`} value={t.valor_face} onChange={(e) => update(idx, 'valor_face', e.target.value)} placeholder={info.inputPlaceholder} />
                    </td>
                    <td className="px-2 py-1.5 text-right text-muted-foreground tabular-nums">{dias || '—'}</td>
                    <td className="px-2 py-1.5 text-right text-red-600 font-semibold tabular-nums">{desagio ? formatCurrency(desagio) : '—'}</td>
                    <td className="px-2 py-1.5">
                      <input type="number" step="0.01" className={`${inputCls} text-right`} value={t.outras_despesas} onChange={(e) => update(idx, 'outras_despesas', e.target.value)} placeholder="0,00" />
                    </td>
                    <td className={`px-2 py-1.5 text-right ${info.calcColor} font-semibold tabular-nums`}>
                      {calcMode === 'inverso' ? (liquido ? formatCurrency(liquido) : '—') : (valorFace ? formatCurrency(valorFace) : '—')}
                    </td>
                    <td className="px-2 py-1.5">
                      <button onClick={() => removeRow(idx)} className="p-1 rounded text-red-400 hover:bg-red-50 transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50 border-t-2 border-border font-bold">
                <td colSpan={7} className="px-2 py-2.5 text-right text-xs uppercase tracking-wider text-muted-foreground">
                  Total ({titulos.length} título{titulos.length !== 1 ? 's' : ''})
                </td>
                <td className="px-2 py-2.5 text-right tabular-nums">{formatCurrency(totals.totalFace)}</td>
                <td className="px-2 py-2.5 text-right text-muted-foreground tabular-nums">{totals.prazoMedio.toFixed(1)}</td>
                <td className="px-2 py-2.5 text-right text-red-600 tabular-nums">{formatCurrency(totals.totalDesagio)}</td>
                <td className="px-2 py-2.5 text-right tabular-nums">{formatCurrency(totals.totalOutras)}</td>
                <td className={`px-2 py-2.5 text-right ${info.calcColor} tabular-nums`}>{formatCurrency(totals.totalLiquido)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
        <div className="px-3 py-2.5 border-t border-border bg-white">
          <button onClick={addRow} className="inline-flex items-center gap-1.5 text-xs font-semibold text-[hsl(43,65%,47%)] hover:text-[hsl(43,65%,37%)] transition-colors">
            <Plus className="w-3.5 h-3.5" /> Adicionar Título
          </button>
        </div>
      </div>
    </div>
  );
}