import { useRef, useState } from 'react';
import { formatCurrency } from '@/lib/finance';
import { calcAntecipacaoAssinatura, CICLO_LABEL, CICLO_DIAS } from '@/lib/assinaturaCalc';
import { captureElementAsImage, captureElementAsPdf } from '@/lib/captureElement';
import { ImageDown, FileDown, Loader2, AlertTriangle } from 'lucide-react';
import ResumoFinanceiroCard from './ResumoFinanceiroCard';
import BorderoAssinatura from './BorderoAssinatura';

const BILLING_LABEL = { PIX: 'PIX', BOLETO: 'Boleto', CREDIT_CARD: 'Cartão de Crédito' };

function Row({ label, value, mono }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className={`font-semibold text-right truncate ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  );
}

export default function ResumoAssinatura({ form, setForm, selectedClient, documentos }) {
  const exportRef = useRef(null);
  const borderoRef = useRef(null);
  const [capturing, setCapturing] = useState(null);

  const simulacao = !!form.assinatura_simulacao;
  const simQtd = parseInt(form.assinatura_sim_qtd) || 0;
  const assinantes = (form.assinatura_sacados || []).filter((a) => a.sacado_name && a.sacado_doc);
  const ciclo = form.assinatura_ciclo || 'MONTHLY';
  const numCiclos = parseInt(form.assinatura_num_ciclos) || 0;
  const taxa = parseFloat(form.rate) || 0;
  const tarifaOperacao = parseFloat(form.tarifa_operacao) || 0;
  const tarifaPorTitulo = parseFloat(form.tarifa_por_titulo) || 0;
  const floatDias = parseFloat(form.float_dias) || 0;
  const valorPorAssinante = parseFloat(form.assinatura_valor) || 0;

  const numAssinantes = simulacao ? simQtd : assinantes.length;
  const totalPorCiclo = simulacao
    ? Math.round(valorPorAssinante * simQtd * 100) / 100
    : assinantes.reduce((s, a) => s + (parseFloat(a.valor_assinatura) || 0), 0);

  const calc = calcAntecipacaoAssinatura({
    totalPorCiclo,
    numCiclos,
    ciclo,
    rate: taxa,
    interestType: form.interest_type || 'simples',
    arredondarTaxaDiaria: form.arredondar_taxa_diaria || false,
    tarifaOperacao,
    tarifaPorTitulo,
    numAssinantes,
    floatDias,
  });
  const diasCiclo = CICLO_DIAS[ciclo] || 30;
  const prazoMedio = numCiclos > 0 ? (diasCiclo * (numCiclos + 1)) / 2 : 0;
  const desagioPeriodo = calc.totalReceivable > 0 ? (calc.totalDesagio / calc.totalReceivable) * 100 : 0;
  const docCount = (documentos || []).length;

  const handleCaptureImage = async () => {
    if (!exportRef.current) return;
    setCapturing('image');
    try { await captureElementAsImage(exportRef.current, `detalhes-operacao-assinatura.png`); } catch (e) { console.error(e); }
    setCapturing(null);
  };
  const handleCapturePdf = async () => {
    if (!borderoRef.current) return;
    setCapturing('pdf');
    try { await captureElementAsPdf(borderoRef.current, `bordero-assinatura.pdf`); } catch (e) { console.error(e); }
    setCapturing(null);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-sm font-bold mb-1">Resumo & Confirmação — Assinatura {simulacao && <span className="text-[10px] font-bold bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full uppercase tracking-wider align-middle">Simulação</span>}</h3>
          <p className="text-xs text-muted-foreground">Revise os detalhes da assinatura recorrente antes de confirmar.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleCaptureImage} disabled={!!capturing} className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border border-border rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors">
            {capturing === 'image' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImageDown className="w-3.5 h-3.5" />}
            Imagem
          </button>
          <button onClick={handleCapturePdf} disabled={!!capturing} className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border border-border rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors">
            {capturing === 'pdf' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileDown className="w-3.5 h-3.5" />}
            PDF
          </button>
        </div>
      </div>

      {simulacao && (
        <div className="flex items-center gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          Modo simulação — não é possível confirmar a operação. Exporte os detalhes acima.
        </div>
      )}

      <div ref={exportRef} className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="space-y-4">
          <div className="border border-border rounded-xl overflow-hidden">
            <div className="bg-gray-50 px-4 py-2.5 border-b border-border">
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Dados da Operação</h4>
            </div>
            <div className="p-4 space-y-2.5 text-sm">
              <Row label="Cedente" value={selectedClient?.name || '—'} />
              <Row label="CNPJ/CPF" value={selectedClient?.document || '—'} mono />
              <Row label="Produto" value={form.produto || '—'} />
              <Row label="Ciclo de Cobrança" value={CICLO_LABEL[ciclo] || ciclo} />
              <Row label="Método de Cobrança" value={BILLING_LABEL[form.assinatura_billing_type] || form.assinatura_billing_type} />
              <Row label="Prazo da Assinatura" value={form.assinatura_prazo_tipo === 'definido' ? `Definido (${numCiclos} ciclos)` : 'Indefinido'} />
              <Row label="Período de Cálculo" value={`${numCiclos} ciclos`} />
              <Row label="Taxa Deságio" value={`${taxa}% a.m.`} />
              <Row label="Tarifa Operação" value={formatCurrency(tarifaOperacao)} />
              <Row label="Tarifa por Assinante" value={formatCurrency(tarifaPorTitulo)} />
              <Row label="Float" value={`${floatDias} dias`} />
              <Row label="Tipo de Juros" value={form.interest_type === 'composto' ? 'Composto' : 'Simples'} />
              <Row label="Assinantes" value={simulacao ? `${numAssinantes} (simulação)` : assinantes.length} />
              <Row label="Documentos" value={`${docCount} anexado${docCount !== 1 ? 's' : ''}`} />
              <div className="border-t border-border pt-3">
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Observações</label>
                <textarea className="input-field min-h-[60px] resize-none text-sm" value={form.notes || ''} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Observações sobre a operação..." />
              </div>
            </div>
          </div>

          <BorderoAssinatura
            ref={borderoRef}
            form={form}
            selectedClient={selectedClient}
            assinantes={assinantes}
            calc={calc}
            totalPorCiclo={totalPorCiclo}
            numAssinantes={numAssinantes}
            simulacao={simulacao}
            simQtd={simQtd}
            valorPorAssinante={valorPorAssinante}
          />
        </div>

        <div className="space-y-4">
          <ResumoFinanceiroCard
            totalBruto={calc.totalReceivable}
            totalDesagio={calc.totalDesagio}
            tarifaOperacao={tarifaOperacao}
            tarifaTitulos={tarifaPorTitulo * numAssinantes * numCiclos}
            totalOutras={0}
            valorLiquido={calc.valorAntecipacao}
            prazoMedio={prazoMedio}
            desagioPeriodo={desagioPeriodo}
          />
        </div>
      </div>
    </div>
  );
}