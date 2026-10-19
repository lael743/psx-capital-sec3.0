/**
 * Gera um PDF único do documento assinado + certificado de evidências (última página).
 * Usa html2canvas + jsPDF para capturar os elementos renderizados.
 *
 * CORREÇÃO RAIZ do erro "createPattern" com canvas de dimensão 0:
 * O html2canvas cria canvas internos a partir de cada <img> no DOM.
 * Se uma imagem não carregou (naturalWidth=0), o canvas interno fica 0x0,
 * e createPattern() falha ao tentar usá-lo como padrão de preenchimento.
 *
 * A correção atua NO ELEMENTO ORIGINAL antes da captura:
 * 1. Aguarda document.fonts.ready (fontes web)
 * 2. Aguarda todas as <img> carregarem com naturalWidth > 0
 * 3. Substitui imagens quebradas por placeholder transparente 1x1
 * 4. Corrige <canvas> com dimensão 0 no DOM original
 * 5. Aguarda 2 ciclos de requestAnimationFrame (renderização estável)
 * 6. Valida dimensões do elemento principal antes de capturar
 * 7. No onclone, reaplica sanitização (clone pode ter imagens não carregadas)
 */
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;
const MARGIN_MM = 10;

const PLACEHOLDER_IMG = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

/**
 * Aguarda document.fonts.ready (fontes web carregadas).
 */
async function waitForFonts() {
  try {
    if (document.fonts && document.fonts.ready) {
      await document.fonts.ready;
    }
  } catch (e) {
    // Ignora — fontes do sistema não dependem de document.fonts
  }
}

/**
 * Aguarda todas as imagens dentro do elemento terminarem de carregar COM naturalWidth > 0.
 * Substitui imagens quebradas por placeholder transparente 1x1.
 * Timeout individual de 8s por imagem — não bloqueia indefinidamente.
 */
async function waitForImagesAndFix(element) {
  const imgs = Array.from(element.querySelectorAll('img'));
  if (imgs.length === 0) return;

  await Promise.all(imgs.map(img => {
    // Já carregou com dimensões válidas
    if (img.complete && img.naturalWidth > 0 && img.naturalHeight > 0) {
      return Promise.resolve();
    }
    // Aguarda carregamento ou erro
    return new Promise(resolve => {
      const done = () => resolve();
      img.addEventListener('load', done, { once: true });
      img.addEventListener('error', done, { once: true });
      setTimeout(done, 8000);
    });
  }));

  // Após aguardar, substitui imagens que ainda estão com dimensão 0 (quebradas)
  imgs.forEach(img => {
    if (!img.complete || img.naturalWidth === 0 || img.naturalHeight === 0) {
      console.warn('[generateSignedPdf] Imagem com dimensão 0 substituída por placeholder:', {
        src: (img.src || '').substring(0, 80),
        complete: img.complete,
        naturalWidth: img.naturalWidth,
        naturalHeight: img.naturalHeight,
      });
      img.src = PLACEHOLDER_IMG;
    }
  });
}

/**
 * Corrige <canvas> com width=0 ou height=0 no elemento original.
 * Canvas de assinatura vazios recebem dimensão 1x1 para evitar createPattern com 0.
 */
function fixZeroDimensionCanvas(element) {
  element.querySelectorAll('canvas').forEach(c => {
    if (c.width === 0 || c.height === 0) {
      console.warn('[generateSignedPdf] Canvas com dimensão 0 corrigido:', {
        width: c.width,
        height: c.height,
        className: c.className?.toString()?.substring(0, 60),
      });
      c.width = Math.max(c.width, 1);
      c.height = Math.max(c.height, 1);
    }
  });
}

/**
 * Diagnóstico: percorre o elemento e registra no console todos os elementos
 * potencialmente problemáticos (canvas, img, svg com dimensões inválidas).
 */
function diagnoseElement(element, label) {
  const canvases = Array.from(element.querySelectorAll('canvas'));
  const imgs = Array.from(element.querySelectorAll('img'));
  const svgs = Array.from(element.querySelectorAll('svg'));

  const problems = [];

  canvases.forEach((c, i) => {
    if (c.width === 0 || c.height === 0 || c.clientWidth === 0 || c.clientHeight === 0) {
      problems.push({ type: 'canvas', index: i, width: c.width, height: c.height, clientWidth: c.clientWidth, clientHeight: c.clientHeight });
    }
  });

  imgs.forEach((img, i) => {
    if (!img.complete || img.naturalWidth === 0 || img.naturalHeight === 0) {
      problems.push({ type: 'img', index: i, complete: img.complete, naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight, src: (img.src || '').substring(0, 60) });
    }
  });

  svgs.forEach((s, i) => {
    if (s.clientWidth === 0 || s.clientHeight === 0) {
      problems.push({ type: 'svg', index: i, clientWidth: s.clientWidth, clientHeight: s.clientHeight });
    }
  });

  if (problems.length > 0) {
    console.warn(`[generateSignedPdf] Problemas encontrados em "${label}":`, problems);
  }

  return problems;
}

/**
 * Aguarda a renderização estabilizar: 2 ciclos de requestAnimationFrame.
 * Garante que dimensões computadas estejam disponíveis antes da captura.
 */
async function waitForRenderStable() {
  await new Promise(resolve => requestAnimationFrame(() => resolve()));
  await new Promise(resolve => requestAnimationFrame(() => resolve()));
}

/**
 * Valida se o elemento principal possui dimensões válidas para captura.
 * Retorna true se válido, false caso contrário (e loga o erro).
 */
function validateElementDimensions(element, label) {
  const w = element.offsetWidth || element.scrollWidth;
  const h = element.offsetHeight || element.scrollHeight;
  if (w <= 0 || h <= 0) {
    console.error(`[generateSignedPdf] Elemento "${label}" com dimensões inválidas:`, { width: w, height: h, offsetWidth: element.offsetWidth, offsetHeight: element.offsetHeight });
    return false;
  }
  return true;
}

/**
 * Prepara o elemento original para captura: aguarda fontes, imagens, corrige canvas,
 * aguarda renderização estável. Retorna array de problemas encontrados.
 */
async function prepareForCapture(element, label) {
  // 1. Aguarda fontes web
  await waitForFonts();

  // 2. Diagnóstico antes da correção (loga problemas no console)
  const problemsBefore = diagnoseElement(element, `${label} (antes)`);

  // 3. Aguarda imagens carregarem e substitui as quebradas
  await waitForImagesAndFix(element);

  // 4. Corrige canvas com dimensão 0 no DOM original
  fixZeroDimensionCanvas(element);

  // 5. Aguarda renderização estabilizar (2 rAF)
  await waitForRenderStable();

  // 6. Diagnóstico depois da correção
  diagnoseElement(element, `${label} (depois)`);

  return problemsBefore;
}

/**
 * Sanitização no DOM clonado (onclone) — reaplica correções pois o clone
 * pode ter imagens que não carregaram no contexto do clone.
 */
function sanitizeClone(doc) {
  doc.querySelectorAll('img').forEach(img => {
    if (!img.complete || img.naturalWidth === 0 || img.naturalHeight === 0) {
      img.src = PLACEHOLDER_IMG;
    }
  });
  doc.querySelectorAll('canvas').forEach(c => {
    if (c.width === 0 || c.height === 0) {
      c.width = 1;
      c.height = 1;
    }
  });
}

/**
 * Desenha o rodapé com hash da assinatura em cada página do PDF.
 * @param {jsPDF} pdf - instância do jsPDF
 * @param {string|null} hash - hash SHA-256 do documento
 * @param {string|null} operationNumber - número da operação formatado
 * @param {number} pageIndex - índice da página (1-based)
 * @param {number} totalPages - total de páginas deste documento
 */
function drawPageFooter(pdf, hash, operationNumber, pageIndex, totalPages) {
  const footerY = A4_HEIGHT_MM - 4;
  pdf.setFontSize(6.5);
  pdf.setTextColor(160, 160, 160);
  const leftText = hash ? `Hash: ${hash.substring(0, 24)}...` : '';
  const rightText = `Operação ${operationNumber || ''} · Pág. ${pageIndex}/${totalPages}`;
  if (leftText) {
    pdf.text(leftText, MARGIN_MM, footerY);
  }
  pdf.text(rightText, A4_WIDTH_MM - MARGIN_MM, footerY, { align: 'right' });
  // Reset color
  pdf.setTextColor(0, 0, 0);
}

/**
 * Captura um elemento DOM e adiciona ao PDF como página(s) A4.
 * @param {jsPDF} pdf - instância do jsPDF
 * @param {HTMLElement} element - elemento a capturar
 * @param {boolean} isFirstPage - se true, não cria nova página antes
 * @param {string} label - rótulo para logs
 * @param {object} footerInfo - { hash, operationNumber } para rodapé
 */
async function addElementToPdf(pdf, element, isFirstPage, label = 'documento', footerInfo = null) {
  // Prepara o elemento original: aguarda fontes, imagens, corrige canvas
  await prepareForCapture(element, label);

  // Valida dimensões do elemento principal
  if (!validateElementDimensions(element, label)) {
    throw new Error(`Conteúdo do ${label} não possui dimensões válidas para gerar o PDF.`);
  }

  // Renderiza em alta resolução
  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    allowTaint: false,
    backgroundColor: '#ffffff',
    logging: false,
    imageTimeout: 15000,
    windowWidth: element.offsetWidth || element.scrollWidth,
    windowHeight: element.offsetHeight || element.scrollHeight,
    onclone(doc) {
      sanitizeClone(doc);
    },
  });

  const imgData = canvas.toDataURL('image/jpeg', 0.95);
  const imgWidthPx = canvas.width;
  const imgHeightPx = canvas.height;

  // Dimensões úteis em mm
  const contentWidthMm = A4_WIDTH_MM - MARGIN_MM * 2;
  const contentHeightMm = A4_HEIGHT_MM - MARGIN_MM * 2;

  // Proporção da imagem
  const imgRatio = imgHeightPx / imgWidthPx;
  const renderWidthMm = contentWidthMm;
  const renderHeightMm = renderWidthMm * imgRatio;

  const hash = footerInfo?.hash || null;
  const opNum = footerInfo?.operationNumber || null;

  // Se a imagem cabe em uma página
  if (renderHeightMm <= contentHeightMm) {
    if (!isFirstPage) pdf.addPage();
    const offsetX = (A4_WIDTH_MM - renderWidthMm) / 2;
    const offsetY = MARGIN_MM;
    pdf.addImage(imgData, 'JPEG', offsetX, offsetY, renderWidthMm, renderHeightMm);
    drawPageFooter(pdf, hash, opNum, 1, 1);
    return;
  }

  // Imagem maior que uma página: divide em múltiplas páginas
  const usableHeightPx = (contentHeightMm / renderWidthMm) * imgWidthPx;
  let remainingHeight = imgHeightPx;
  let srcY = 0;
  let first = isFirstPage;
  let pageNum = 0;
  // Calcula total de páginas antecipadamente
  const totalPages = Math.ceil(imgHeightPx / usableHeightPx);

  while (remainingHeight > 0) {
    const sliceHeight = Math.min(usableHeightPx, remainingHeight);
    pageNum++;

    const sliceCanvas = document.createElement('canvas');
    sliceCanvas.width = imgWidthPx;
    sliceCanvas.height = sliceHeight;
    const ctx = sliceCanvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, imgWidthPx, sliceHeight);
    ctx.drawImage(canvas, 0, srcY, imgWidthPx, sliceHeight, 0, 0, imgWidthPx, sliceHeight);

    const sliceData = sliceCanvas.toDataURL('image/jpeg', 0.95);
    const sliceHeightMm = (sliceHeight / imgWidthPx) * renderWidthMm;

    if (!first) pdf.addPage();
    const offsetX = (A4_WIDTH_MM - renderWidthMm) / 2;
    pdf.addImage(sliceData, 'JPEG', offsetX, MARGIN_MM, renderWidthMm, sliceHeightMm);
    drawPageFooter(pdf, hash, opNum, pageNum, totalPages);

    srcY += sliceHeight;
    remainingHeight -= sliceHeight;
    first = false;
  }
}

/**
 * Gera e baixa um PDF contendo o documento + certificado de evidências.
 * @param {HTMLElement} docElement - elemento do documento renderizado
 * @param {HTMLElement} certElement - elemento do certificado renderizado
 * @param {string} filename - nome do arquivo
 * @param {object} footerInfo - { hash, operationNumber } para rodapé do documento
 */
export async function generateSignedPdfWithCertificate(docElement, certElement, filename = 'documento-assinado.pdf', footerInfo = null) {
  if (!docElement) throw new Error('Elemento do documento não encontrado');

  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true,
  });

  // Página(s) do documento
  await addElementToPdf(pdf, docElement, true, 'documento', footerInfo);

  // Última página: certificado de evidências
  if (certElement) {
    await addElementToPdf(pdf, certElement, false, 'certificado', null);
  }

  pdf.save(filename);
}

/**
 * Gera um PDF único contendo múltiplos documentos (cada um em sua(s) página(s)).
 * @param {Array<HTMLElement>} elements - elementos renderizados dos documentos
 * @param {string} filename - nome do arquivo
 * @param {Array<object>} footerInfos - array de { hash, operationNumber } por documento
 */
export async function generateMultipleDocumentsPdf(elements, filename = 'documentos-operacao.pdf', footerInfos = []) {
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true,
  });

  let first = true;
  for (let i = 0; i < elements.length; i++) {
    const el = elements[i];
    if (!el) continue;
    const footerInfo = footerInfos[i] || null;
    await addElementToPdf(pdf, el, first, `documento-${i + 1}`, footerInfo);
    first = false;
  }

  pdf.save(filename);
}

/**
 * Gera PDF apenas do certificado de evidências.
 */
export async function generateCertificatePdf(certElement, filename = 'certificado-evidencias.pdf') {
  if (!certElement) throw new Error('Elemento do certificado não encontrado');

  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true,
  });

  await addElementToPdf(pdf, certElement, true, 'certificado', null);
  pdf.save(filename);
}