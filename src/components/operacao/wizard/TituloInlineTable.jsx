import { Plus, Trash2 } from 'lucide-react';
import { formatCurrency } from '@/lib/finance';
import { maskCpfCnpj } from '@/lib/masks';
import {
  calcDesagioTitulo, calcTituloRow, calcTitulosTotais,
} from '@/lib/operacaoCalc';
import { DESAGIO_FACE, FACE_POR_REPASSE, PRICE, normalizarCalcMode } from '@/lib/formatosCalculo';

// M4 — as fórmulas vivem em @/lib/operacaoCalc: a gravação e as telas de resumo
// usam exatamente as mesmas funções, então cálculo e valor persistido não
// podem divergir.
export { calcDesagioTitulo, calcTituloRow, calcTitulosTotais };

function round2(v) { return Math.round(v * 100) / 100; }

/** Chave estável da linha — é a identidade da parcela no cronograma gravado. */
function novaChave() {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  } catch { /* ambiente sem crypto */ }
  return `tit-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export const emptyTitulo = () => ({
  chave: novaChave(),
  tipo: 'cheque',
  numero: '',
  nf: '',
  sacado: '',
  sacado_doc: '',
  vencimento: '',
  valor_face: '',
  outras_despesas: '',
});

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
  [DESAGIO_FACE]: { inputLabel: 'Valor Face', inputPlaceholder: '0,00', calcLabel: 'Líquido', calcColor: 'text-emerald-600', hint: 'Digite o valor de face (total a receber). O líquido sai descontando o deságio.' },
  [FACE_POR_REPASSE]: { inputLabel: 'Repasse', inputPlaceholder: '0,00', calcLabel: 'Face', calcColor: 'text-blue-600', hint: 'Digite o repasse líquido desejado. O valor de face é calculado no sentido oposto.' },
  [PRICE]: { inputLabel: 'Parcela', inputPlaceholder: '0,00', calcLabel: 'Líquido', calcColor: 'text-emerald-600', hint: 'Tabela Price: informe a parcela; o líquido vem da amortização do cronograma.' },
  desconto_direto: { inputLabel: 'Valor Líquido', inputPlaceholder: '0,00', calcLabel: 'Face', calcColor: 'text-blue-600', hint: 'Formato legado: digite o líquido e o valor de face é calculado com juros simples.' },
  emprestimo: { inputLabel: 'Parcela', inputPlaceholder: '0,00', calcLabel: 'Líquido', calcColor: 'text-emerald-600', hint: 'Empréstimo: informe a parcela; o líquido vem do repasse distribuído.' },
};

/** Em que formatos a coluna calculada mostra o LÍQUIDO (nos demais, a face). */
const MOSTRA_LIQUIDO = [DESAGIO_FACE, PRICE, 'emprestimo', 'capital_desagio'];

export default function TituloInlineTable({ titulos, onChange, startDate, rate, interestType, floatDias, arredondarTaxaDiaria, calcMode = DESAGIO_FACE, tipoPadrao }) {
  const update = (idx, field, value) => {
    const next = titulos.map((t, i) => (i === idx ? { ...t, [field]: value } : t));
    onChange(next);
  };

  // A linha nova já nasce com o tipo do produto da operação (cheque/boleto/duplicata).
  const addRow = () => onChange([...titulos, { ...emptyTitulo(), tipo: tipoPadrao || 'cheque' }]);
  const removeRow = (idx) => onChange(titulos.filter((_, i) => i !== idx));

  const totals = calcTitulosTotais(titulos, startDate, rate, interestType, floatDias, arredondarTaxaDiaria, calcMode);
  const modo = normalizarCalcMode(calcMode);
  const info = CALCMODE_INFO[modo] || CALCMODE_INFO[DESAGIO_FACE];
  const mostraLiquido = MOSTRA_LIQUIDO.includes(modo);

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
                      {mostraLiquido ? (liquido ? formatCurrency(liquido) : '—') : (valorFace ? formatCurrency(valorFace) : '—')}
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