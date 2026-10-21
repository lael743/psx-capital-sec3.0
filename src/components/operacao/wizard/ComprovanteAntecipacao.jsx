import { forwardRef } from 'react';
import { formatCurrency, formatDate } from '@/lib/finance';
import { calcTituloRow, calcTotalDistribuidoPerParcel, calcTotalDistribuidoTotal } from './TituloInlineTable';
import { FACE_POR_REPASSE, PRICE, calcModeEfetivo, labelCalcMode, normalizarCalcMode } from '@/lib/formatosCalculo';

/**
 * Comprovante de Antecipação de Recebíveis — layout A4 para captura em imagem/PDF.
 * Renderizado offscreen (posição absoluta) para captura com html2canvas.
 */
const ComprovanteAntecipacao = forwardRef(function ComprovanteAntecipacao(
  { selectedClient, form, titulos, totals, valorLiquido, lastDueDate, settings, isPreview = false },
  ref
) {
  const today = new Date();
  const todayStr = today.toLocaleDateString('pt-BR');
  const docLabel = selectedClient?.document_type === 'CNPJ' ? 'CNPJ' : 'CPF';
  const effectiveCalcMode = calcModeEfetivo({ tipo: form.tipo, calcMode: form.calc_mode, calculoInverso: form.calculo_inverso });
  const rate = parseFloat(form.rate) || 0;
  const floatDias = parseFloat(form.float_dias) || 0;
  const isCheque = form.tipo === 'cheque';
  const tituloLabel = isCheque ? 'Cheque' : 'Parcela';
  const titulosLabel = isCheque ? 'Cheques' : 'Parcelas';
  const isPadrao = normalizarCalcMode(effectiveCalcMode) === FACE_POR_REPASSE;
  const isParcelado = normalizarCalcMode(effectiveCalcMode) === PRICE;
  const valorParcela = isParcelado && titulos.length > 0 ? totals.totalFace / titulos.length : 0;
  const tarifaOperacaoComp = parseFloat(form.tarifa_operacao) || 0;
  const tarifaPorTituloComp = parseFloat(form.tarifa_por_titulo) || 0;
  const tarifaTitulosComp = tarifaPorTituloComp * titulos.length;
  const totalTarifasComp = tarifaTitulosComp + tarifaOperacaoComp;
  const totalReceivableComp = isPadrao ? totals.totalFace + totals.totalOutras + totalTarifasComp : totals.totalFace;
  const totalDistribuidoTotalComp = calcTotalDistribuidoTotal(totals.totalFace, totalTarifasComp, totals.totalOutras, isPadrao);

  return (
    <div
      ref={ref}
      style={{
        width: '794px', // ~A4 width at 96dpi
        minHeight: '1123px',
        backgroundColor: '#ffffff',
        fontFamily: 'Inter, sans-serif',
        color: '#1a1a1a',
        padding: '0',
        boxSizing: 'border-box',
        position: isPreview ? 'relative' : 'absolute',
        left: isPreview ? 'auto' : '-9999px',
        top: isPreview ? 'auto' : 0,
      }}
    >
      {/* Header */}
      <div style={{ backgroundColor: '#1a1a1a', padding: '28px 40px', textAlign: 'center' }}>
        <div style={{ fontSize: '28px', fontWeight: 800, color: '#d4af37', letterSpacing: '1px' }}>
          {settings?.company_name || 'PSX Capital'}
        </div>
        <div style={{ fontSize: '13px', fontWeight: 600, color: '#ffffff', letterSpacing: '3px', marginTop: '6px', textTransform: 'uppercase' }}>
          Comprovante de Antecipação de Recebíveis
        </div>
        <div style={{ fontSize: '11px', color: '#999999', marginTop: '8px' }}>
          {isPreview ? 'Pré-visualização' : 'Documento gerado'} — {todayStr}
        </div>
      </div>

      {/* Status Banner */}
      <div style={{ backgroundColor: '#f0f9f0', padding: '14px 40px', display: 'flex', alignItems: 'center', gap: '10px' }}>
        <span style={{ fontSize: '16px' }}>✓</span>
        <div>
          <div style={{ fontSize: '13px', fontWeight: 700, color: '#2e7d32' }}>Antecipação de recebíveis</div>
          <div style={{ fontSize: '11px', color: '#666666', marginTop: '2px' }}>Valor disponível imediatamente conforme acordado.</div>
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: '24px 40px' }}>
        {/* Dados do Cliente */}
        <Section title="Dados do Cliente">
          <Row label="Cliente" value={selectedClient?.name || '—'} bold />
          <Row label={docLabel} value={selectedClient?.document || '—'} />
        </Section>

        {/* Resumo da Operação */}
        <Section title="Resumo da Operação">
          <Row label="Produto" value={form.produto || '—'} />
          <Row label="Formato de Cálculo" value={labelCalcMode(effectiveCalcMode)} />
          <Row label="Data da Operação" value={formatDate(form.start_date)} />
          <Row label="Vencimento Final" value={lastDueDate ? formatDate(lastDueDate) : '—'} />
          <Row label={`Quantidade de ${titulosLabel}`} value={String(titulos.length)} />
          {isParcelado && <Row label="Valor da Parcela" value={formatCurrency(valorParcela)} />}
        </Section>

        {/* Valores */}
        <Section title="Valores">
          <Row label={`Valor Total (${titulosLabel})`} value={formatCurrency(isPadrao ? totalReceivableComp : totals.totalFace)} bold />
          <div style={{ backgroundColor: '#f0f9f0', margin: '4px -12px', padding: '10px 12px', borderRadius: '6px' }}>
            <Row label="Valor Líquido (Repasse)" value={formatCurrency(valorLiquido)} bold green />
          </div>
        </Section>

        {/* Títulos Antecipados */}
        <div style={{ marginTop: '20px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#666666', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '8px' }}>
            {titulosLabel} Antecipados
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead>
              <tr style={{ backgroundColor: '#1a1a1a' }}>
                <th style={{ padding: '8px 10px', textAlign: 'left', color: '#d4af37', fontWeight: 600 }}>Nº</th>
                <th style={{ padding: '8px 10px', textAlign: 'left', color: '#d4af37', fontWeight: 600 }}>{tituloLabel}</th>
                <th style={{ padding: '8px 10px', textAlign: 'left', color: '#d4af37', fontWeight: 600 }}>Sacado</th>
                <th style={{ padding: '8px 10px', textAlign: 'left', color: '#d4af37', fontWeight: 600 }}>Vencimento</th>
                <th style={{ padding: '8px 10px', textAlign: 'right', color: '#d4af37', fontWeight: 600 }}>Valor Face</th>
                <th style={{ padding: '8px 10px', textAlign: 'right', color: '#d4af37', fontWeight: 600 }}>Total Distribuído</th>
              </tr>
            </thead>
            <tbody>
              {titulos.map((t, i) => {
                const { liquido, valorFace } = calcTituloRow(t, form.start_date, rate, form.interest_type, floatDias, form.arredondar_taxa_diaria, effectiveCalcMode);
                const faceExibida = isPadrao && totals.totalLiquido > 0
                  ? totalReceivableComp * (liquido / totals.totalLiquido)
                  : valorFace;
                const totalDistribuido = calcTotalDistribuidoPerParcel(totals.totalFace, totalTarifasComp, totals.totalOutras, titulos.length, isPadrao);
                return (
                  <tr key={i} style={{ borderBottom: '1px solid #eeeeee' }}>
                    <td style={{ padding: '8px 10px' }}>{i + 1}</td>
                    <td style={{ padding: '8px 10px' }}>{t.numero || '—'}</td>
                    <td style={{ padding: '8px 10px' }}>{t.sacado || '—'}</td>
                    <td style={{ padding: '8px 10px' }}>{formatDate(t.vencimento)}</td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(faceExibida)}</td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: '#b8860b' }}>{formatCurrency(totalDistribuido)}</td>
                  </tr>
                );
              })}
              <tr style={{ backgroundColor: '#f9f5eb', fontWeight: 700 }}>
                <td style={{ padding: '8px 10px' }} colSpan={4}>TOTAL</td>
                <td style={{ padding: '8px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(isPadrao ? totalReceivableComp : totals.totalFace)}</td>
                <td style={{ padding: '8px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#b8860b' }}>{formatCurrency(totalDistribuidoTotalComp)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Footer */}
      <div style={{ padding: '16px 40px', textAlign: 'center', fontSize: '10px', color: '#999999', borderTop: '1px solid #eeeeee' }}>
        {settings?.company_name || 'PSX Capital'} · Documento gerado em {todayStr}
      </div>
    </div>
  );
});

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: '16px' }}>
      <div style={{ fontSize: '11px', fontWeight: 700, color: '#666666', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '8px', paddingBottom: '6px', borderBottom: '1px solid #eeeeee' }}>
        {title}
      </div>
      <div style={{ padding: '0 12px' }}>{children}</div>
    </div>
  );
}

function Row({ label, value, bold, green }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: '13px' }}>
      <span style={{ color: '#666666' }}>{label}:</span>
      <span style={{ fontWeight: bold ? 700 : 500, color: green ? '#2e7d32' : '#1a1a1a', textAlign: 'right' }}>{value}</span>
    </div>
  );
}

export default ComprovanteAntecipacao;