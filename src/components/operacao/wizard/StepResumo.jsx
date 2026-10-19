import { useRef, useState } from 'react';
import { ImageDown, FileDown, Loader2 } from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/finance';
import { calcTitulosTotais, calcTituloRow, calcTotalDistribuidoPerParcel, calcTotalDistribuidoTotal } from './TituloInlineTable';
import ResumoFinanceiroCard from './ResumoFinanceiroCard';
import ComprovanteAntecipacao from './ComprovanteAntecipacao';
import { captureElementAsImage, captureElementAsPdf } from '@/lib/captureElement';
import ResumoAssinatura from './ResumoAssinatura';

const STORAGE_KEY = 'psx_company_settings';
const getSettings = () => { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch { return {}; } };

const CALCMODE_LABEL = {
  padrao: 'Padrão',
  inverso: 'Juros Embutido',
  desconto_direto: 'Desconto Direto',
  capital_desagio: 'Capital + Deságio',
  emprestimo: 'Empréstimo',
};

export default function StepResumo({ form, setForm, selectedClient, titulos, documentos, onGerarPDF, onConfirm, saving }) {
  const comprovanteRef = useRef(null);
  const [capturing, setCapturing] = useState(null); // 'image' | 'pdf' | null
  const settings = getSettings();
  const rate = parseFloat(form.rate) || 0;
  const floatDias = parseFloat(form.float_dias) || 0;
  const tarifaOperacao = parseFloat(form.tarifa_operacao) || 0;
  const tarifaPorTitulo = parseFloat(form.tarifa_por_titulo) || 0;
  const calcMode = form.calc_mode || 'inverso';
  const isEmprestimo = form.tipo === 'emprestimo';
  const effectiveCalcMode = isEmprestimo ? 'emprestimo' : (form.calculo_inverso ? 'padrao' : calcMode);

  const totals = calcTitulosTotais(titulos, form.start_date, rate, form.interest_type, floatDias, form.arredondar_taxa_diaria, effectiveCalcMode);
  const isPadrao = effectiveCalcMode === 'padrao';
  const tarifaTitulos = tarifaPorTitulo * titulos.length;
  const totalTarifas = tarifaTitulos + tarifaOperacao;
  // Padrão: tarifas e outras despesas repassadas ao cedente (somadas ao total a receber), não descontadas do repasse
  // Empréstimo: taxas embutidas nas parcelas iguais; líquido = repasse
  const valorLiquido = (isPadrao || isEmprestimo) ? totals.totalLiquido : totals.totalLiquido - totalTarifas;
  const totalReceivable = isPadrao ? totals.totalFace + totals.totalOutras + totalTarifas : totals.totalFace;
  const totalDistribuidoTotal = calcTotalDistribuidoTotal(totals.totalFace, totalTarifas, totals.totalOutras, isPadrao);

  const sacadosUnicos = [...new Set(titulos.map((t) => t.sacado).filter(Boolean))];

  const docCount = (documentos || []).length;

  if (form.tipo === 'assinatura') {
    return <ResumoAssinatura form={form} setForm={setForm} selectedClient={selectedClient} documentos={documentos} />;
  }

  const lastDueDate = titulos
    .map((t) => t.vencimento)
    .filter(Boolean)
    .sort()
    .slice(-1)[0] || '';

  const handleCaptureImage = async () => {
    if (!comprovanteRef.current) return;
    setCapturing('image');
    try {
      const numOp = 'preview';
      await captureElementAsImage(comprovanteRef.current, `comprovante-antecipacao-${numOp}.png`);
    } catch (e) { console.error(e); }
    setCapturing(null);
  };

  const handleCapturePdf = async () => {
    if (!comprovanteRef.current) return;
    setCapturing('pdf');
    try {
      const numOp = 'preview';
      await captureElementAsPdf(comprovanteRef.current, `comprovante-antecipacao-${numOp}.pdf`);
    } catch (e) { console.error(e); }
    setCapturing(null);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-sm font-bold mb-1">Resumo & Confirmação</h3>
          <p className="text-xs text-muted-foreground">Revise todos os dados antes de confirmar a operação.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleCaptureImage}
            disabled={!!capturing}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border border-border rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            {capturing === 'image' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImageDown className="w-3.5 h-3.5" />}
            Imagem
          </button>
          <button
            onClick={handleCapturePdf}
            disabled={!!capturing}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border border-border rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            {capturing === 'pdf' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileDown className="w-3.5 h-3.5" />}
            PDF
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Coluna esquerda: Dados da Operação */}
        <div className="space-y-4">
          <div className="border border-border rounded-xl overflow-hidden">
            <div className="bg-gray-50 px-4 py-2.5 border-b border-border">
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Dados da Operação</h4>
            </div>
            <div className="p-4 space-y-2.5 text-sm">
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground shrink-0">Cedente</span>
                <span className="font-semibold text-right truncate">{selectedClient?.name || '—'}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground shrink-0">CNPJ/CPF</span>
                <span className="font-mono text-right">{selectedClient?.document || '—'}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground shrink-0">Produto</span>
                <span className="font-semibold text-right">{form.produto || '—'}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground shrink-0">Formato de Cálculo</span>
                <span className="font-semibold text-right">{CALCMODE_LABEL[calcMode] || calcMode}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground shrink-0">Taxa Deságio</span>
                <span className="font-semibold text-right">{rate}% a.m.</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground shrink-0">Data de Início</span>
                <span className="font-semibold text-right">{formatDate(form.start_date)}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground shrink-0">Qtde de Títulos</span>
                <span className="font-semibold text-right">{titulos.length}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground shrink-0">Qtde de Sacados</span>
                <span className="font-semibold text-right">{sacadosUnicos.length}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground shrink-0">Documentos</span>
                <span className="font-semibold text-right">{docCount} anexado{docCount !== 1 ? 's' : ''}</span>
              </div>
              <div className="border-t border-border pt-3">
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Observações</label>
                <textarea
                  className="input-field min-h-[60px] resize-none text-sm"
                  value={form.notes || ''}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  placeholder="Observações sobre a operação..."
                />
              </div>
            </div>
          </div>

          {/* Lista de títulos resumida */}
          <div className="border border-border rounded-xl overflow-hidden">
            <div className="bg-gray-50 px-4 py-2.5 border-b border-border">
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{form.tipo === 'cheque' ? 'Títulos' : 'Parcelas'} ({titulos.length})</h4>
            </div>
            <div className="max-h-48 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="bg-white sticky top-0">
                  <tr className="border-b border-border">
                    <th className="px-3 py-2 text-left font-semibold text-muted-foreground">#</th>
                    <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Sacado</th>
                    <th className="px-3 py-2 text-right font-semibold text-muted-foreground">Valor Face</th>
                    <th className="px-3 py-2 text-right font-semibold text-muted-foreground">Deságio</th>
                    <th className="px-3 py-2 text-right font-semibold text-muted-foreground">Líquido</th>
                    <th className="px-3 py-2 text-right font-semibold text-muted-foreground">Total Distrib.</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {titulos.map((t, i) => {
                    const { desagio, liquido, valorFace } = calcTituloRow(t, form.start_date, rate, form.interest_type, floatDias, form.arredondar_taxa_diaria, effectiveCalcMode);
                    const totalDistribuido = calcTotalDistribuidoPerParcel(totals.totalFace, totalTarifas, totals.totalOutras, titulos.length, isPadrao);
                    return (
                      <tr key={i}>
                        <td className="px-3 py-1.5 text-muted-foreground">{i + 1}</td>
                        <td className="px-3 py-1.5 truncate max-w-[140px]">{t.sacado || '—'}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{formatCurrency(valorFace)}</td>
                        <td className="px-3 py-1.5 text-right text-red-600 tabular-nums">{formatCurrency(desagio)}</td>
                        <td className="px-3 py-1.5 text-right text-emerald-600 tabular-nums">{formatCurrency(liquido)}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums font-semibold text-[hsl(43,65%,47%)]">{formatCurrency(totalDistribuido)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Coluna direita: Resumo Financeiro */}
        <div className="space-y-4">
          <ResumoFinanceiroCard
            totalBruto={isPadrao ? totalReceivable : totals.totalFace}
            totalDesagio={totals.totalDesagio}
            tarifaOperacao={tarifaOperacao}
            tarifaTitulos={tarifaTitulos}
            totalOutras={totals.totalOutras}
            valorLiquido={valorLiquido}
            prazoMedio={totals.prazoMedio}
            desagioPeriodo={totals.desagioPeriodo}
          />
        </div>
      </div>

      {/* Comprovante offscreen para captura */}
      <ComprovanteAntecipacao
        ref={comprovanteRef}
        selectedClient={selectedClient}
        form={form}
        titulos={titulos}
        totals={totals}
        valorLiquido={valorLiquido}
        lastDueDate={lastDueDate}
        settings={settings}
      />
    </div>
  );
}