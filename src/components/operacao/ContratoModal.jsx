import { useState } from 'react';
import { X, Download, MessageCircle, FileText, Printer, User } from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/finance';
import jsPDF from 'jspdf';

const STORAGE_KEY = 'psx_company_settings';
function getSettings() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch { return {}; }
}

function formatDateBR(dateStr) {
  if (!dateStr) return '___/___/______';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
}

function formatDateShort(dateStr) {
  if (!dateStr) return '__/__/____';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('pt-BR');
}

export default function ContratoModal({ operacao, client, onClose }) {
  const settings = getSettings();
  const [generating, setGenerating] = useState(false);
  const [generatingComp, setGeneratingComp] = useState(false);

  const company = {
    name: settings.company_name || 'PSX CAPITAL',
    document: settings.company_document || '',
    address: settings.company_address || '',
    city: settings.company_city || '',
    state: settings.company_state || '',
    phone: settings.company_phone || '',
    pix: settings.company_pix || '',
  };

  const isCheque = operacao?.type === 'cheque';
  const schedule = operacao?.installment_schedule || [];
  const opId = operacao?.id?.slice(-8).toUpperCase() || '--------';
  const totalInterest = (operacao?.total_receivable || 0) - (operacao?.gross_value || 0);

  const generatePDF = async () => {
    setGenerating(true);
    try {
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageW = 210;
      const margin = 20;
      const contentW = pageW - margin * 2;
      let y = 20;

      const addText = (text, x, yPos, opts = {}) => {
        const { fontSize = 10, bold = false, align = 'left', color = [30, 30, 30] } = opts;
        doc.setFontSize(fontSize);
        doc.setFont('helvetica', bold ? 'bold' : 'normal');
        doc.setTextColor(...color);
        doc.text(text, x, yPos, { align });
      };

      const addLine = (yPos, color = [200, 200, 200]) => {
        doc.setDrawColor(...color);
        doc.line(margin, yPos, pageW - margin, yPos);
      };

      const checkPage = (needed = 15) => {
        if (y + needed > 270) {
          doc.addPage();
          y = 20;
        }
      };

      // ── HEADER ──
      doc.setFillColor(15, 15, 15);
      doc.rect(0, 0, pageW, 32, 'F');
      addText(company.name, pageW / 2, 14, { fontSize: 16, bold: true, align: 'center', color: [200, 165, 80] });
      addText(isCheque ? 'CONTRATO DE DESCONTO DE CHEQUES' : 'CONTRATO DE MÚTUO / CÉDULA DE CRÉDITO', pageW / 2, 22, { fontSize: 9, align: 'center', color: [200, 200, 200] });
      addText(`Nº ${opId}`, pageW / 2, 29, { fontSize: 8, align: 'center', color: [150, 150, 150] });

      y = 44;

      // ── QUALIFICAÇÃO ──
      addText('QUALIFICAÇÃO DAS PARTES', margin, y, { fontSize: 9, bold: true, color: [120, 90, 30] });
      y += 6;
      addLine(y, [220, 220, 220]);
      y += 5;

      const partes = [
        ['CREDOR / CEDENTE', company.name, company.document ? `CPF/CNPJ: ${company.document}` : '', company.address ? `Endereço: ${company.address}${company.city ? ', ' + company.city : ''}${company.state ? '/' + company.state : ''}` : ''],
        ['DEVEDOR / CEDENTE', (client?.name || '').toUpperCase(), client?.document ? `${client?.document_type || 'CPF'}: ${client.document}` : '', client?.address ? `Endereço: ${client.address}${client.city ? ', ' + client.city : ''}${client.state ? '/' + client.state : ''}` : ''],
      ];

      partes.forEach(([role, name, doc2, addr]) => {
        addText(`${role}:`, margin, y, { fontSize: 8, bold: true, color: [80, 80, 80] });
        addText(name, margin + 32, y, { fontSize: 8, bold: true });
        y += 5;
        if (doc2) { addText(doc2, margin + 32, y, { fontSize: 8 }); y += 4.5; }
        if (addr) { addText(addr, margin + 32, y, { fontSize: 8 }); y += 4.5; }
        y += 2;
      });

      y += 2;
      checkPage();

      // ── OBJETO ──
      addText('OBJETO DO CONTRATO', margin, y, { fontSize: 9, bold: true, color: [120, 90, 30] });
      y += 6;
      addLine(y, [220, 220, 220]);
      y += 6;

      const tipoTexto = isCheque
        ? `Desconto de cheques no valor total de ${formatCurrency(operacao?.gross_value || 0)}, com prazo até ${formatDateBR(operacao?.due_date)}.`
        : `Mútuo/empréstimo no valor de ${formatCurrency(operacao?.gross_value || 0)}, liberado em ${formatDateBR(operacao?.start_date)}, com vencimento em ${formatDateBR(operacao?.due_date)}.`;
      addText(tipoTexto, margin, y, { fontSize: 9 });
      y += 8;
      checkPage();

      // ── CONDIÇÕES FINANCEIRAS ──
      addText('CONDIÇÕES FINANCEIRAS', margin, y, { fontSize: 9, bold: true, color: [120, 90, 30] });
      y += 6;
      addLine(y, [220, 220, 220]);
      y += 6;

      // Tabela de valores
      const finRows = [
        ['Valor Principal', formatCurrency(operacao?.gross_value || 0)],
        ['Taxa de Juros Mensal', `${operacao?.rate || 0}% a.m. (${operacao?.interest_type === 'composto' ? 'Composto' : 'Simples'})`],
        ['Prazo', `${operacao?.days || 0} dias`],
        ['Encargos / Juros Total', formatCurrency(totalInterest)],
        ['TOTAL A RECEBER', formatCurrency(operacao?.total_receivable || 0)],
        ...(operacao?.installments > 1 ? [['Número de Parcelas', `${operacao.installments}x de ${formatCurrency(operacao.installment_value || 0)}`]] : []),
        ...(operacao?.assessor ? [['Assessor', operacao.assessor]] : []),
        ...(operacao?.disbursement_method ? [['Forma de Desembolso', operacao.disbursement_method]] : []),
      ];

      finRows.forEach(([label, value], i) => {
        const isTotal = label === 'TOTAL A RECEBER';
        const rowBg = isTotal ? [245, 240, 225] : (i % 2 === 0 ? [250, 250, 250] : [255, 255, 255]);
        doc.setFillColor(...rowBg);
        doc.rect(margin, y - 4, contentW, 7, 'F');
        addText(label + ':', margin + 2, y, { fontSize: isTotal ? 9 : 8.5, bold: isTotal, color: [60, 60, 60] });
        addText(value, pageW - margin - 2, y, { fontSize: isTotal ? 9 : 8.5, bold: isTotal, align: 'right' });
        y += 7;
        checkPage();
      });

      y += 4;
      checkPage();

      // ── CRONOGRAMA ──
      if (schedule.length > 0) {
        addText('CRONOGRAMA DE VENCIMENTOS', margin, y, { fontSize: 9, bold: true, color: [120, 90, 30] });
        y += 6;
        addLine(y, [220, 220, 220]);
        y += 6;

        // Header da tabela
        doc.setFillColor(30, 30, 30);
        doc.rect(margin, y - 4, contentW, 7, 'F');
        addText('Nº', margin + 2, y, { fontSize: 8, bold: true, color: [200, 165, 80] });
        addText('Vencimento', margin + 15, y, { fontSize: 8, bold: true, color: [200, 165, 80] });
        addText('Principal', margin + 65, y, { fontSize: 8, bold: true, color: [200, 165, 80] });
        addText('Juros', margin + 105, y, { fontSize: 8, bold: true, color: [200, 165, 80] });
        addText('Total', pageW - margin - 2, y, { fontSize: 8, bold: true, align: 'right', color: [200, 165, 80] });
        y += 7;

        schedule.forEach((inst, i) => {
          checkPage(8);
          const bg = i % 2 === 0 ? [252, 252, 252] : [245, 245, 245];
          doc.setFillColor(...bg);
          doc.rect(margin, y - 4, contentW, 7, 'F');
          addText(String(inst.number || i + 1), margin + 2, y, { fontSize: 8 });
          addText(formatDateShort(inst.due_date), margin + 15, y, { fontSize: 8 });
          addText(formatCurrency(inst.principal || inst.value), margin + 65, y, { fontSize: 8 });
          addText(formatCurrency(inst.interest || 0), margin + 105, y, { fontSize: 8 });
          addText(formatCurrency(inst.value), pageW - margin - 2, y, { fontSize: 8, bold: true, align: 'right' });
          y += 7;
        });

        y += 4;
        checkPage();
      }

      // ── CLÁUSULAS ──
      checkPage(60);
      addText('CLÁUSULAS E CONDIÇÕES GERAIS', margin, y, { fontSize: 9, bold: true, color: [120, 90, 30] });
      y += 6;
      addLine(y, [220, 220, 220]);
      y += 6;

      const clausulas = [
        'O DEVEDOR compromete-se a pagar ao CREDOR o valor total acima especificado, nas datas de vencimento estabelecidas.',
        'O não pagamento nas datas acordadas implicará em mora automática, incidindo multa de 2% sobre o valor em aberto e juros de mora de 1% ao mês.',
        'Em caso de inadimplência, o CREDOR poderá cobrar os valores em aberto, incluindo honorários advocatícios de 20%, independentemente de notificação prévia.',
        isCheque
          ? 'Os cheques entregues são instrumentos de pagamento e serão compensados nas datas indicadas no cronograma.'
          : 'O presente contrato constitui título executivo extrajudicial, nos termos do artigo 784 do Código de Processo Civil.',
        'As partes elegem o foro da comarca de ' + (company.city || '__________') + ' para dirimir quaisquer controvérsias.',
      ];

      clausulas.forEach((cl, i) => {
        checkPage(12);
        const lines = doc.splitTextToSize(`${i + 1}. ${cl}`, contentW);
        addText(lines.join('\n'), margin, y, { fontSize: 8 });
        y += lines.length * 5 + 3;
      });

      y += 6;
      checkPage(40);

      // ── ASSINATURAS ──
      addText('ASSINATURAS', margin, y, { fontSize: 9, bold: true, color: [120, 90, 30] });
      y += 6;
      addLine(y, [220, 220, 220]);
      y += 8;

      addText(`${company.city || '_____________'}, ${formatDateBR(operacao?.start_date)}`, pageW / 2, y, { fontSize: 9, align: 'center', color: [80, 80, 80] });
      y += 14;

      // Duas colunas de assinatura
      const col1 = margin + contentW / 4;
      const col2 = margin + (contentW * 3) / 4;

      addLine(y, [100, 100, 100]);
      doc.setDrawColor(100, 100, 100);
      doc.line(col1 - 35, y, col1 + 35, y);
      doc.line(col2 - 35, y, col2 + 35, y);
      y += 4;
      addText(company.name, col1, y, { fontSize: 8, bold: true, align: 'center' });
      addText(client?.name || '', col2, y, { fontSize: 8, bold: true, align: 'center' });
      y += 4;
      addText('CREDOR', col1, y, { fontSize: 7, align: 'center', color: [120, 120, 120] });
      addText('DEVEDOR', col2, y, { fontSize: 7, align: 'center', color: [120, 120, 120] });
      if (company.document) {
        y += 4;
        addText(company.document, col1, y, { fontSize: 7, align: 'center', color: [120, 120, 120] });
      }
      if (client?.document) {
        if (!company.document) y += 4;
        addText(client.document, col2, y, { fontSize: 7, align: 'center', color: [120, 120, 120] });
      }

      // Testemunhas
      y += 16;
      checkPage(20);
      addText('Testemunhas:', margin, y, { fontSize: 8, bold: true, color: [80, 80, 80] });
      y += 8;
      doc.line(margin, y, margin + 70, y);
      doc.line(margin + 100, y, margin + 170, y);
      y += 4;
      addText('Nome / CPF', margin + 35, y, { fontSize: 7, align: 'center', color: [120, 120, 120] });
      addText('Nome / CPF', margin + 135, y, { fontSize: 7, align: 'center', color: [120, 120, 120] });

      // Rodapé
      const pageCount = doc.internal.getNumberOfPages();
      for (let p = 1; p <= pageCount; p++) {
        doc.setPage(p);
        doc.setFontSize(7);
        doc.setTextColor(160, 160, 160);
        doc.text(`${company.name} — Contrato Nº ${opId} — Página ${p}/${pageCount}`, pageW / 2, 290, { align: 'center' });
      }

      return doc;
    } finally {
      setGenerating(false);
    }
  };

  // ── COMPROVANTE DO CLIENTE (sem dados internos) ──
  const generateComprovante = async () => {
    setGeneratingComp(true);
    try {
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageW = 210;
      const margin = 20;
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
        if (y + needed > 270) { doc.addPage(); y = 20; }
      };

      // ── HEADER VERDE ──
      doc.setFillColor(15, 15, 15);
      doc.rect(0, 0, pageW, 36, 'F');
      addText(company.name, pageW / 2, 13, { fontSize: 15, bold: true, align: 'center', color: [200, 165, 80] });
      addText('COMPROVANTE DE ANTECIPAÇÃO DE RECEBÍVEIS', pageW / 2, 21, { fontSize: 8.5, align: 'center', color: [200, 200, 200] });
      addText(`Nº ${opId}`, pageW / 2, 29, { fontSize: 7.5, align: 'center', color: [150, 150, 150] });

      y = 48;

      // ── MENSAGEM POSITIVA ──
      doc.setFillColor(240, 248, 240);
      doc.rect(margin, y - 5, contentW, 16, 'F');
      addText('✓  Antecipação de recebíveis realizada com sucesso!', pageW / 2, y + 2, { fontSize: 9, bold: true, align: 'center', color: [30, 110, 50] });
      addText('Valor disponível imediatamente conforme acordado.', pageW / 2, y + 8, { fontSize: 8, align: 'center', color: [60, 130, 80] });
      y += 22;

      // ── DADOS DO CLIENTE ──
      addText('DADOS DO CLIENTE', margin, y, { fontSize: 9, bold: true, color: [120, 90, 30] });
      y += 6;
      addLine(y);
      y += 6;

      addText(`Cliente:`, margin, y, { fontSize: 8, bold: true, color: [80, 80, 80] });
      addText((client?.name || '').toUpperCase(), margin + 22, y, { fontSize: 9, bold: true });
      y += 5.5;
      if (client?.document) {
        addText(`${client?.document_type || 'CPF'}:`, margin, y, { fontSize: 8, color: [100, 100, 100] });
        addText(client.document, margin + 22, y, { fontSize: 8 });
        y += 5;
      }
      y += 4;
      checkPage();

      // ── RESUMO DA OPERAÇÃO ──
      addText('RESUMO DA OPERAÇÃO', margin, y, { fontSize: 9, bold: true, color: [120, 90, 30] });
      y += 6;
      addLine(y);
      y += 6;

      const rows = [
        ['Tipo de Operação', isCheque ? 'Antecipação de Cheques' : 'Crédito Antecipado'],
        ['Número da Operação', `#${opId}`],
        ['Data da Operação', formatDateShort(operacao?.start_date)],
        ['Vencimento Final', formatDateShort(operacao?.due_date)],
        ...(isCheque ? [['Quantidade de Cheques', String(schedule.length || 1)]] : []),
        ...(operacao?.installments > 1 ? [['Número de Parcelas', `${operacao.installments}x`]] : []),
      ];

      rows.forEach(([label, value], i) => {
        const bg = i % 2 === 0 ? [250, 250, 250] : [255, 255, 255];
        doc.setFillColor(...bg);
        doc.rect(margin, y - 4, contentW, 7, 'F');
        addText(label + ':', margin + 2, y, { fontSize: 8.5, color: [70, 70, 70] });
        addText(value, pageW - margin - 2, y, { fontSize: 8.5, bold: true, align: 'right' });
        y += 7;
      });

      y += 4;
      checkPage();

      // ── VALORES PRINCIPAIS (destaque) ──
      addText('VALORES', margin, y, { fontSize: 9, bold: true, color: [120, 90, 30] });
      y += 6;
      addLine(y);
      y += 6;

      const valorRows = [
        isCheque
          ? ['Valor Total dos Cheques', formatCurrency(operacao?.total_receivable || 0)]
          : ['Valor do Crédito Contratado', formatCurrency(operacao?.gross_value || 0)],
        ['Valor Líquido Disponibilizado', formatCurrency(operacao?.net_value || 0)],
        ...(operacao?.disbursement_method ? [['Forma de Recebimento', operacao.disbursement_method]] : []),
      ];

      valorRows.forEach(([label, value], i) => {
        const isLiquido = label === 'Valor Líquido Disponibilizado';
        const bg = isLiquido ? [235, 250, 240] : (i % 2 === 0 ? [250, 250, 250] : [255, 255, 255]);
        doc.setFillColor(...bg);
        doc.rect(margin, y - 4, contentW, 8, 'F');
        addText(label + ':', margin + 2, y, { fontSize: isLiquido ? 9 : 8.5, bold: isLiquido, color: isLiquido ? [30, 110, 50] : [70, 70, 70] });
        addText(value, pageW - margin - 2, y, { fontSize: isLiquido ? 10 : 8.5, bold: true, align: 'right', color: isLiquido ? [30, 110, 50] : [30, 30, 30] });
        y += 8;
      });

      y += 4;
      checkPage();

      // ── CRONOGRAMA DE CHEQUES / PARCELAS (sem breakdown de juros) ──
      if (schedule.length > 0) {
        const title = isCheque ? 'CHEQUES ANTECIPADOS' : 'CRONOGRAMA DE PAGAMENTOS';
        addText(title, margin, y, { fontSize: 9, bold: true, color: [120, 90, 30] });
        y += 6;
        addLine(y);
        y += 6;

        // Header tabela cheques — mais colunas se for cheque
        doc.setFillColor(30, 30, 30);
        if (isCheque) {
          doc.rect(margin, y - 4, contentW, 7, 'F');
          addText('Nº', margin + 2, y, { fontSize: 7.5, bold: true, color: [200, 165, 80] });
          addText('Banco', margin + 12, y, { fontSize: 7.5, bold: true, color: [200, 165, 80] });
          addText('Nº Cheque', margin + 60, y, { fontSize: 7.5, bold: true, color: [200, 165, 80] });
          addText('Compensação', margin + 100, y, { fontSize: 7.5, bold: true, color: [200, 165, 80] });
          addText('Valor', pageW - margin - 2, y, { fontSize: 7.5, bold: true, align: 'right', color: [200, 165, 80] });
          y += 7;
        } else {
          doc.rect(margin, y - 4, contentW, 7, 'F');
          addText('Nº', margin + 2, y, { fontSize: 8, bold: true, color: [200, 165, 80] });
          addText('Vencimento / Compensação', margin + 15, y, { fontSize: 8, bold: true, color: [200, 165, 80] });
          addText('Valor', pageW - margin - 2, y, { fontSize: 8, bold: true, align: 'right', color: [200, 165, 80] });
          y += 7;
        }

        // Buscar cheques da operação (se disponível em operacao.cheques_data, senão usa schedule)
        const chequesData = operacao?.cheques_data || [];

        schedule.forEach((inst, i) => {
          checkPage(8);
          const bg = i % 2 === 0 ? [252, 252, 252] : [245, 245, 245];
          doc.setFillColor(...bg);
          const chq = chequesData[i];
          if (isCheque && chq) {
            doc.rect(margin, y - 4, contentW, 7, 'F');
            addText(String(i + 1), margin + 2, y, { fontSize: 7.5 });
            const bankStr = (chq.bank_name || '').substring(0, 18);
            addText(bankStr, margin + 12, y, { fontSize: 7.5 });
            addText(chq.check_number || '—', margin + 60, y, { fontSize: 7.5 });
            addText(formatDateShort(chq.compensation_date || inst.due_date), margin + 100, y, { fontSize: 7.5 });
            addText(formatCurrency(inst.value), pageW - margin - 2, y, { fontSize: 7.5, bold: true, align: 'right' });
          } else {
            doc.rect(margin, y - 4, contentW, 7, 'F');
            addText(String(inst.number || i + 1), margin + 2, y, { fontSize: 8 });
            addText(formatDateShort(inst.due_date), margin + 15, y, { fontSize: 8 });
            addText(formatCurrency(inst.value), pageW - margin - 2, y, { fontSize: 8, bold: true, align: 'right' });
          }
          y += 7;
        });

        // Total
        y += 2;
        doc.setFillColor(245, 240, 225);
        doc.rect(margin, y - 4, contentW, 8, 'F');
        addText('TOTAL', margin + 2, y, { fontSize: 9, bold: true });
        addText(formatCurrency(operacao?.total_receivable || 0), pageW - margin - 2, y, { fontSize: 9, bold: true, align: 'right' });
        y += 10;
        checkPage();
      }

      // ── MENSAGEM FINAL ──
      checkPage(30);
      y += 4;
      doc.setFillColor(248, 248, 248);
      doc.rect(margin, y - 4, contentW, 28, 'F');
      const msgLines = [
        'Este documento comprova a antecipação de recebíveis realizada entre as partes.',
        `Em caso de dúvidas, entre em contato: ${company.phone || company.name}.`,
      ];
      msgLines.forEach(line => {
        addText(line, pageW / 2, y + 2, { fontSize: 8, align: 'center', color: [100, 100, 100] });
        y += 6;
      });
      y += 8;

      // ── ASSINATURA CLIENTE ──
      checkPage(30);
      addText(`${company.city || '_____________'}, ${formatDateBR(operacao?.start_date)}`, pageW / 2, y, { fontSize: 9, align: 'center', color: [80, 80, 80] });
      y += 14;
      const col = pageW / 2;
      doc.setDrawColor(100, 100, 100);
      doc.line(col - 50, y, col + 50, y);
      y += 4;
      addText(client?.name || '', col, y, { fontSize: 8, bold: true, align: 'center' });
      y += 4;
      addText('Assinatura do Cliente', col, y, { fontSize: 7, align: 'center', color: [120, 120, 120] });

      // Rodapé
      const pageCount = doc.internal.getNumberOfPages();
      for (let p = 1; p <= pageCount; p++) {
        doc.setPage(p);
        doc.setFontSize(7);
        doc.setTextColor(160, 160, 160);
        doc.text(`${company.name} — Comprovante Nº ${opId} — Página ${p}/${pageCount}`, pageW / 2, 290, { align: 'center' });
      }

      return doc;
    } finally {
      setGeneratingComp(false);
    }
  };

  const handleDownloadComprovante = async () => {
    const doc = await generateComprovante();
    doc.save(`comprovante-cliente-${opId}-${(client?.name || 'cliente').replace(/\s+/g, '-').toLowerCase()}.pdf`);
  };

  const handleWhatsAppComprovante = async () => {
    const doc = await generateComprovante();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(doc.output('blob'));
    a.target = '_blank';
    a.download = `comprovante-${opId}.pdf`;
    a.click();
    setTimeout(() => {
      const num = client?.whatsapp?.replace(/\D/g, '') || client?.phone?.replace(/\D/g, '');
      if (num) {
        const msg = encodeURIComponent(
          `Olá ${client?.name}! Segue o comprovante da sua antecipação de recebíveis Nº ${opId}. Valor disponibilizado: ${formatCurrency(operacao?.net_value || 0)}. Qualquer dúvida estamos à disposição! 😊`
        );
        window.open(`https://wa.me/55${num}?text=${msg}`, '_blank');
      }
    }, 800);
  };

  const handleDownload = async () => {
    const doc = await generatePDF();
    doc.save(`contrato-${opId}-${(client?.name || 'cliente').replace(/\s+/g, '-').toLowerCase()}.pdf`);
  };

  const handleSendWhatsApp = async () => {
    const doc = await generatePDF();
    const blob = doc.output('blob');
    const url = URL.createObjectURL(blob);

    // Open PDF in new tab so user can send manually
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.download = `contrato-${opId}.pdf`;
    a.click();

    // Open WhatsApp after slight delay
    setTimeout(() => {
      const num = client?.whatsapp?.replace(/\D/g, '') || client?.phone?.replace(/\D/g, '');
      if (num) {
        const msg = encodeURIComponent(
          `Olá ${client?.name}! Segue o contrato da sua operação Nº ${opId} no valor de ${formatCurrency(operacao?.total_receivable || 0)} com vencimento em ${formatDateShort(operacao?.due_date)}. Por favor, revise e assine.`
        );
        window.open(`https://wa.me/55${num}?text=${msg}`, '_blank');
      }
    }, 800);
  };

  const handlePrint = async () => {
    const doc = await generatePDF();
    const blob = doc.output('blob');
    const url = URL.createObjectURL(blob);
    const win = window.open(url, '_blank');
    if (win) win.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
              <FileText className="w-5 h-5 text-amber-700" />
            </div>
            <div>
              <h2 className="text-base font-bold">Gerar Contrato</h2>
              <p className="text-xs text-muted-foreground">Nº {opId}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Resumo do contrato */}
          <div className="bg-gray-50 rounded-xl border border-border p-4 space-y-2.5 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground text-xs uppercase tracking-wider font-medium">Cliente</span>
              <span className="font-semibold text-xs">{client?.name || '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground text-xs uppercase tracking-wider font-medium">Tipo</span>
              <span className="font-semibold text-xs">{isCheque ? 'Desconto de Cheques' : 'Mútuo / Empréstimo'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground text-xs uppercase tracking-wider font-medium">Valor Principal</span>
              <span className="font-semibold text-xs">{formatCurrency(operacao?.gross_value || 0)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground text-xs uppercase tracking-wider font-medium">Total a Receber</span>
              <span className="font-bold text-[hsl(43,65%,47%)] text-xs">{formatCurrency(operacao?.total_receivable || 0)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground text-xs uppercase tracking-wider font-medium">Vencimento</span>
              <span className="font-semibold text-xs">{formatDateShort(operacao?.due_date)}</span>
            </div>
            {operacao?.installments > 1 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground text-xs uppercase tracking-wider font-medium">Parcelas</span>
                <span className="font-semibold text-xs">{operacao.installments}x</span>
              </div>
            )}
            {operacao?.assessor && (
              <div className="flex justify-between">
                <span className="text-muted-foreground text-xs uppercase tracking-wider font-medium">Assessor</span>
                <span className="font-semibold text-xs">{operacao.assessor}</span>
              </div>
            )}
          </div>

          {!settings.company_name && (
            <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              ⚠️ Configure os dados da empresa em <strong>Configurações</strong> para um contrato completo.
            </div>
          )}
        </div>

        {/* Ações */}
        <div className="p-5 border-t border-border space-y-4">
          {/* Comprovante do Cliente */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <User className="w-3.5 h-3.5 text-emerald-600" />
              <span className="text-xs font-bold text-emerald-700 uppercase tracking-wide">Comprovante do Cliente</span>
            </div>
            <div className="space-y-2">
              <button
                onClick={handleDownloadComprovante}
                disabled={generatingComp}
                className="w-full inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-700 disabled:opacity-50 transition-colors"
              >
                <Download className="w-4 h-4" />
                {generatingComp ? 'Gerando...' : 'Baixar Comprovante (Cliente)'}
              </button>
              {(client?.whatsapp || client?.phone) && (
                <button
                  onClick={handleWhatsAppComprovante}
                  disabled={generatingComp}
                  className="w-full inline-flex items-center justify-center gap-2 px-5 py-2.5 border border-emerald-200 bg-emerald-50 text-emerald-700 text-sm font-semibold rounded-xl hover:bg-emerald-100 disabled:opacity-50 transition-colors"
                >
                  <MessageCircle className="w-4 h-4" />
                  {generatingComp ? 'Gerando...' : 'Comprovante + WhatsApp'}
                </button>
              )}
            </div>
          </div>

          {/* Contrato Interno */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <FileText className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Contrato Interno</span>
            </div>
            <div className="space-y-2">
              <button
                onClick={handleDownload}
                disabled={generating}
                className="w-full inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-foreground text-primary-foreground text-sm font-semibold rounded-xl hover:bg-foreground/90 disabled:opacity-50 transition-colors"
              >
                <Download className="w-4 h-4" />
                {generating ? 'Gerando PDF...' : 'Baixar Contrato Completo'}
              </button>
              {(client?.whatsapp || client?.phone) && (
                <button
                  onClick={handleSendWhatsApp}
                  disabled={generating}
                  className="w-full inline-flex items-center justify-center gap-2 px-5 py-2.5 border border-border text-sm font-semibold rounded-xl hover:bg-gray-50 disabled:opacity-50 transition-colors"
                >
                  <MessageCircle className="w-4 h-4" />
                  {generating ? 'Gerando...' : 'Contrato + WhatsApp'}
                </button>
              )}
              <button
                onClick={handlePrint}
                disabled={generating}
                className="w-full inline-flex items-center justify-center gap-2 px-5 py-2.5 border border-border text-sm font-semibold rounded-xl hover:bg-gray-50 disabled:opacity-50 transition-colors"
              >
                <Printer className="w-4 h-4" />
                Imprimir Contrato
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}