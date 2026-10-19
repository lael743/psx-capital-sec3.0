import { useRef, useState } from 'react';
import { X, Printer, MessageCircle, Camera, Download } from 'lucide-react';
import { formatCurrency } from '@/lib/finance';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

function formatDateShort(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('pt-BR');
}

function formatDateBR(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
}

// ── Visão cliente de um cenário ──
function CenarioClienteCard({ scenario, result, index, company }) {
  const isCheque = scenario.type === 'cheque';
  if (!result) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
      {/* Header do cenário */}
      <div className="bg-gray-900 text-white px-5 py-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs font-medium opacity-60 uppercase tracking-wider">{isCheque ? 'Antecipação de Cheque' : 'Proposta de Crédito'}</div>
            <div className="text-base font-bold mt-0.5">{scenario.label}</div>
          </div>
          <div className="text-right">
            <div className="text-xs opacity-60">Prazo</div>
            <div className="text-lg font-bold text-[hsl(43,80%,60%)]">{result.days} dias</div>
          </div>
        </div>
      </div>

      <div className="p-5 space-y-4">
        {/* KPIs principais */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-emerald-50 rounded-xl p-3 text-center">
            <div className="text-xs text-emerald-700 font-medium mb-1">
              {isCheque ? 'Valor Disponibilizado' : 'Crédito Liberado'}
            </div>
            <div className="text-xl font-bold text-emerald-700">{formatCurrency(result.netValue)}</div>
            <div className="text-xs text-emerald-600 mt-0.5">você recebe</div>
          </div>
          <div className="bg-amber-50 rounded-xl p-3 text-center">
            <div className="text-xs text-amber-700 font-medium mb-1">
              {isCheque ? 'Total dos Cheques' : 'Total a Pagar'}
            </div>
            <div className="text-xl font-bold text-amber-700">{formatCurrency(result.totalReceivable)}</div>
            <div className="text-xs text-amber-600 mt-0.5">no vencimento</div>
          </div>
        </div>

        {/* Detalhes */}
        <div className="space-y-2">
          {[
            ['Taxa de Juros', `${scenario.rate}% a.m. (${scenario.interest_type === 'composto' ? 'composto' : 'simples'})`],
            ['Início', formatDateShort(scenario.start_date)],
            ['Vencimento', formatDateShort(scenario.due_date)],
            ...(!isCheque && parseInt(scenario.installments) > 1
              ? [
                  ['Parcelas', `${scenario.installments}x de ${formatCurrency(result.installmentValue)}`],
                  ['Intervalo', `a cada ${scenario.interval_days} dias`],
                ]
              : []),
          ].map(([label, val]) => (
            <div key={label} className="flex items-center justify-between py-1.5 border-b border-gray-100 last:border-0">
              <span className="text-xs text-gray-500">{label}</span>
              <span className="text-xs font-semibold text-gray-800">{val}</span>
            </div>
          ))}
        </div>

        {/* Cronograma de parcelas (empréstimo) */}
        {!isCheque && result.schedule?.length > 1 && (
          <div className="bg-gray-50 rounded-xl overflow-hidden">
            <div className="px-4 py-2 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Cronograma
            </div>
            <div className="divide-y divide-gray-100 max-h-40 overflow-y-auto">
              {result.schedule.map((inst, i) => (
                <div key={i} className="flex items-center justify-between px-4 py-2">
                  <span className="text-xs text-gray-500">{inst.number}ª — {formatDateShort(inst.due_date)}</span>
                  <span className="text-xs font-semibold">{formatCurrency(inst.value)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function SimuladorDrawer({ scenarios, results, linkedClient, settings, onClose }) {
  const printRef = useRef();
  const [capturing, setCapturing] = useState(false);
  const [printing, setPrinting] = useState(false);

  const company = settings.company_name || 'PSX Capital';
  const companyDoc = settings.company_document || '';
  const companyPhone = settings.company_phone || '';
  const companyCity = settings.company_city || '';

  const validScenarios = scenarios.filter((_, i) => !!results[i]);

  // ── Impressão / PDF visão cliente ──
  const handlePrint = async () => {
    setPrinting(true);
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageW = 210;
    const margin = 18;
    const contentW = pageW - margin * 2;
    let y = 20;

    const addText = (text, x, yPos, opts = {}) => {
      const { fontSize = 10, bold = false, align = 'left', color = [30, 30, 30] } = opts;
      doc.setFontSize(fontSize);
      doc.setFont('helvetica', bold ? 'bold' : 'normal');
      doc.setTextColor(...color);
      doc.text(text, x, yPos, { align });
    };

    const addLine = (yPos, color = [220, 220, 220]) => {
      doc.setDrawColor(...color);
      doc.line(margin, yPos, pageW - margin, yPos);
    };

    const checkPage = (needed = 15) => {
      if (y + needed > 272) { doc.addPage(); y = 20; }
    };

    // Header
    doc.setFillColor(15, 15, 15);
    doc.rect(0, 0, pageW, 34, 'F');
    addText(company, pageW / 2, 13, { fontSize: 16, bold: true, align: 'center', color: [200, 165, 80] });
    addText('PROPOSTA DE OPERAÇÃO FINANCEIRA', pageW / 2, 21, { fontSize: 9, align: 'center', color: [200, 200, 200] });
    addText(`Data: ${new Date().toLocaleDateString('pt-BR')}`, pageW / 2, 29, { fontSize: 7.5, align: 'center', color: [150, 150, 150] });

    y = 45;

    // Cliente
    if (linkedClient) {
      addText('CLIENTE', margin, y, { fontSize: 8, bold: true, color: [120, 90, 30] });
      y += 5;
      addLine(y);
      y += 5;
      addText(linkedClient.name?.toUpperCase(), margin, y, { fontSize: 10, bold: true });
      y += 5;
      if (linkedClient.document) { addText(`${linkedClient.document_type || 'CPF'}: ${linkedClient.document}`, margin, y, { fontSize: 8, color: [80, 80, 80] }); y += 4.5; }
      if (linkedClient.phone) { addText(`Telefone: ${linkedClient.phone}`, margin, y, { fontSize: 8, color: [80, 80, 80] }); y += 4.5; }
      y += 4;
    }

    for (let idx = 0; idx < scenarios.length; idx++) {
      const s = scenarios[idx];
      const r = results[idx];
      if (!r) continue;

      const isCheque = s.type === 'cheque';
      checkPage(60);

      // Cabeçalho do cenário
      doc.setFillColor(30, 30, 30);
      doc.rect(margin, y - 4, contentW, 10, 'F');
      addText(`${s.label}  —  ${isCheque ? 'Antecipação de Cheque' : 'Proposta de Crédito'}`, margin + 3, y + 2, { fontSize: 9, bold: true, color: [200, 165, 80] });
      y += 12;

      // KPIs em destaque
      const half = (contentW - 4) / 2;
      doc.setFillColor(235, 250, 240);
      doc.rect(margin, y - 4, half, 16, 'F');
      doc.setFillColor(255, 248, 225);
      doc.rect(margin + half + 4, y - 4, half, 16, 'F');
      addText(isCheque ? 'Valor Disponibilizado' : 'Crédito Liberado', margin + 2, y, { fontSize: 7.5, color: [40, 120, 70] });
      addText(formatCurrency(r.netValue), margin + 2, y + 6, { fontSize: 13, bold: true, color: [30, 110, 50] });
      addText('você recebe', margin + 2, y + 11, { fontSize: 7, color: [80, 140, 100] });
      addText(isCheque ? 'Total dos Cheques' : 'Total a Pagar', margin + half + 6, y, { fontSize: 7.5, color: [150, 90, 20] });
      addText(formatCurrency(r.totalReceivable), margin + half + 6, y + 6, { fontSize: 13, bold: true, color: [160, 100, 20] });
      addText('no vencimento', margin + half + 6, y + 11, { fontSize: 7, color: [180, 130, 50] });
      y += 22;

      // Tabela de detalhes
      const rows = [
        ['Taxa de Juros', `${s.rate}% a.m. (${s.interest_type === 'composto' ? 'Composto' : 'Simples'})`],
        ['Início da Operação', formatDateShort(s.start_date)],
        ['Vencimento', formatDateShort(s.due_date)],
        ['Prazo', `${r.days} dias`],
        ...(isCheque ? [] : parseInt(s.installments) > 1
          ? [
              ['Número de Parcelas', `${s.installments}x de ${formatCurrency(r.installmentValue)}`],
              ['Intervalo', `a cada ${s.interval_days} dias`],
            ]
          : []),
        ...(parseFloat(s.capital_cost) > 0 ? [['Custo de Capital', formatCurrency(parseFloat(s.capital_cost))]] : []),
      ];

      rows.forEach(([label, val], ri) => {
        const bg = ri % 2 === 0 ? [252, 252, 252] : [246, 246, 246];
        doc.setFillColor(...bg);
        doc.rect(margin, y - 4, contentW, 7, 'F');
        addText(label, margin + 2, y, { fontSize: 8, color: [80, 80, 80] });
        addText(val, pageW - margin - 2, y, { fontSize: 8, bold: true, align: 'right' });
        y += 7;
        checkPage(8);
      });

      // Cronograma parcelas
      if (!isCheque && r.schedule?.length > 1) {
        y += 3;
        checkPage(30);
        addText('Cronograma de Pagamentos', margin, y, { fontSize: 8, bold: true, color: [60, 60, 60] });
        y += 5;
        doc.setFillColor(40, 40, 40);
        doc.rect(margin, y - 4, contentW, 7, 'F');
        addText('#', margin + 2, y, { fontSize: 7.5, bold: true, color: [200, 165, 80] });
        addText('Vencimento', margin + 15, y, { fontSize: 7.5, bold: true, color: [200, 165, 80] });
        addText('Valor', pageW - margin - 2, y, { fontSize: 7.5, bold: true, align: 'right', color: [200, 165, 80] });
        y += 7;
        r.schedule.forEach((inst, i) => {
          checkPage(8);
          const bg = i % 2 === 0 ? [252, 252, 252] : [246, 246, 246];
          doc.setFillColor(...bg);
          doc.rect(margin, y - 4, contentW, 7, 'F');
          addText(String(inst.number), margin + 2, y, { fontSize: 7.5 });
          addText(formatDateShort(inst.due_date), margin + 15, y, { fontSize: 7.5 });
          addText(formatCurrency(inst.value), pageW - margin - 2, y, { fontSize: 7.5, bold: true, align: 'right' });
          y += 7;
        });
      }

      y += 8;
    }

    // Rodapé aviso
    checkPage(20);
    doc.setFillColor(248, 248, 248);
    doc.rect(margin, y - 3, contentW, 16, 'F');
    addText('Esta proposta é uma simulação e está sujeita a confirmação contratual.', pageW / 2, y + 3, { fontSize: 7.5, align: 'center', color: [120, 120, 120] });
    if (companyPhone) addText(`Contato: ${companyPhone}`, pageW / 2, y + 8, { fontSize: 7.5, align: 'center', color: [120, 120, 120] });
    y += 20;

    // Assinatura cliente
    checkPage(25);
    addText(`${companyCity ? companyCity + ', ' : ''}${formatDateBR(scenarios[0]?.start_date)}`, pageW / 2, y, { fontSize: 8.5, align: 'center', color: [80, 80, 80] });
    y += 12;
    const col = pageW / 2;
    doc.setDrawColor(100, 100, 100);
    doc.line(col - 45, y, col + 45, y);
    y += 4;
    addText(linkedClient?.name || 'Cliente', col, y, { fontSize: 8, bold: true, align: 'center' });
    y += 4;
    addText('Assinatura do Cliente', col, y, { fontSize: 7, align: 'center', color: [130, 130, 130] });

    // Paginação
    const pageCount = doc.internal.getNumberOfPages();
    for (let p = 1; p <= pageCount; p++) {
      doc.setPage(p);
      doc.setFontSize(7);
      doc.setTextColor(160, 160, 160);
      doc.text(`${company} — Simulação de Operação — Página ${p}/${pageCount}`, pageW / 2, 291, { align: 'center' });
    }

    const blob = doc.output('blob');
    const url = URL.createObjectURL(blob);
    const win = window.open(url, '_blank');
    if (win) setTimeout(() => win.print(), 600);
    setPrinting(false);
  };

  // ── WhatsApp ──
  const handleWhatsApp = async () => {
    const clientPhone = linkedClient?.whatsapp || linkedClient?.phone;
    const num = clientPhone?.replace(/\D/g, '');

    // Monta resumo textual para WA
    const lines = scenarios.map((s, i) => {
      const r = results[i];
      if (!r) return null;
      const isCheque = s.type === 'cheque';
      return `*${s.label}*\n💰 Você recebe: *${formatCurrency(r.netValue)}*\n📅 Vencimento: ${formatDateShort(s.due_date)} (${r.days} dias)\n📊 Taxa: ${s.rate}% a.m.\n${isCheque ? `🧾 Total cheques: ${formatCurrency(r.totalReceivable)}` : `💳 Total a pagar: ${formatCurrency(r.totalReceivable)}${parseInt(s.installments) > 1 ? ` em ${s.installments}x de ${formatCurrency(r.installmentValue)}` : ''}`}`;
    }).filter(Boolean).join('\n\n');

    const msg = encodeURIComponent(
      `Olá${linkedClient ? ` ${linkedClient.name}` : ''}! 👋\n\nSegue a proposta de operação financeira:\n\n${lines}\n\nQualquer dúvida estamos à disposição!\n_${company}_`
    );

    if (num) {
      window.open(`https://wa.me/55${num}?text=${msg}`, '_blank');
    } else {
      window.open(`https://wa.me/?text=${msg}`, '_blank');
    }
  };

  // ── Captura de tela — renderiza clone fora da tela sem scroll para capturar tudo ──
  const handleCapture = async () => {
    if (!printRef.current) return;
    setCapturing(true);

    // Clona o conteúdo em um container temporário sem overflow/altura fixos
    const clone = printRef.current.cloneNode(true);
    clone.style.position = 'fixed';
    clone.style.top = '-99999px';
    clone.style.left = '0';
    clone.style.width = printRef.current.offsetWidth + 'px';
    clone.style.height = 'auto';
    clone.style.overflow = 'visible';
    clone.style.maxHeight = 'none';
    // Remove scroll interno de cronogramas
    clone.querySelectorAll('[class*="overflow-y-auto"]').forEach(el => {
      el.style.overflow = 'visible';
      el.style.maxHeight = 'none';
    });
    document.body.appendChild(clone);

    const canvas = await html2canvas(clone, { scale: 2, backgroundColor: '#f9f9f9', useCORS: true });
    document.body.removeChild(clone);

    const link = document.createElement('a');
    link.download = `simulacao-${(linkedClient?.name || 'proposta').replace(/\s+/g, '-').toLowerCase()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
    setCapturing(false);
  };

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} />

      {/* Drawer */}
      <div className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-md bg-gray-50 shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-white shrink-0">
          <div>
            <h2 className="text-base font-bold">Resultados da Simulação</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Visão do cliente</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Actions */}
        <div className="flex gap-2 px-4 py-3 border-b border-border bg-white shrink-0">
          <button onClick={handlePrint} disabled={printing}
            className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold border border-border rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50">
            <Printer className="w-3.5 h-3.5" />
            {printing ? 'Gerando...' : 'Imprimir / PDF'}
          </button>
          <button onClick={handleWhatsApp}
            className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors">
            <MessageCircle className="w-3.5 h-3.5" />
            WhatsApp
          </button>
          <button onClick={handleCapture} disabled={capturing}
            className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold border border-border rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50">
            <Camera className="w-3.5 h-3.5" />
            {capturing ? 'Capturando...' : 'Capturar'}
          </button>
        </div>

        {/* Content — visão cliente */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4" ref={printRef}>
          {/* Company header (visível na captura/impressão) */}
          <div className="bg-gray-900 rounded-2xl px-5 py-4 text-white">
            <div className="text-[hsl(43,80%,60%)] font-bold text-lg">{company}</div>
            {companyDoc && <div className="text-xs opacity-60 mt-0.5">{companyDoc}</div>}
            <div className="text-xs opacity-50 mt-1">Proposta de Operação Financeira — {new Date().toLocaleDateString('pt-BR')}</div>
          </div>

          {/* Cliente */}
          {linkedClient && (
            <div className="bg-white border border-border rounded-xl px-4 py-3">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Cliente</div>
              <div className="text-sm font-bold">{linkedClient.name}</div>
              {linkedClient.document && <div className="text-xs text-muted-foreground">{linkedClient.document_type || 'CPF'}: {linkedClient.document}</div>}
            </div>
          )}

          {/* Cenários */}
          {validScenarios.length === 0 ? (
            <div className="text-center py-12 text-sm text-muted-foreground">
              Nenhum cenário com dados completos ainda.
            </div>
          ) : (
            scenarios.map((s, i) => (
              <CenarioClienteCard
                key={i}
                scenario={s}
                result={results[i]}
                index={i}
                company={company}
              />
            ))
          )}

          {/* Aviso legal */}
          <div className="text-center text-xs text-muted-foreground px-4 pb-4">
            Esta proposta é uma simulação e está sujeita a confirmação contratual.
            {companyPhone && <><br />{companyPhone}</>}
          </div>
        </div>
      </div>
    </>
  );
}