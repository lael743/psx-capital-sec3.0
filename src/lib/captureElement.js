import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

const PLACEHOLDER_IMG = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

/**
 * Aguarda document.fonts.ready (fontes web carregadas).
 */
async function waitForFonts() {
  try {
    if (document.fonts && document.fonts.ready) {
      await document.fonts.ready;
    }
  } catch (e) { /* ignora */ }
}

/**
 * Aguarda todas as imagens carregarem com naturalWidth > 0.
 * Substitui imagens quebradas por placeholder transparente 1x1.
 */
async function waitForImagesAndFix(element) {
  const imgs = Array.from(element.querySelectorAll('img'));
  if (imgs.length === 0) return;
  await Promise.all(imgs.map(img => {
    if (img.complete && img.naturalWidth > 0 && img.naturalHeight > 0) return Promise.resolve();
    return new Promise(resolve => {
      const done = () => resolve();
      img.addEventListener('load', done, { once: true });
      img.addEventListener('error', done, { once: true });
      setTimeout(done, 8000);
    });
  }));
  imgs.forEach(img => {
    if (!img.complete || img.naturalWidth === 0 || img.naturalHeight === 0) {
      img.src = PLACEHOLDER_IMG;
    }
  });
}

/**
 * Corrige <canvas> com width=0 ou height=0.
 */
function fixZeroDimensionCanvas(element) {
  element.querySelectorAll('canvas').forEach(c => {
    if (c.width === 0 || c.height === 0) {
      c.width = Math.max(c.width, 1);
      c.height = Math.max(c.height, 1);
    }
  });
}

/**
 * Aguarda 2 ciclos de requestAnimationFrame para estabilizar a renderização.
 */
async function waitForRenderStable() {
  await new Promise(resolve => requestAnimationFrame(() => resolve()));
  await new Promise(resolve => requestAnimationFrame(() => resolve()));
}

/**
 * Sanitiza o DOM clonado (onclone) — substitui imagens quebradas e canvas 0.
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
 * Prepara o elemento para captura: fontes, imagens, canvas, render estável.
 */
async function prepareForCapture(element) {
  await waitForFonts();
  await waitForImagesAndFix(element);
  fixZeroDimensionCanvas(element);
  await waitForRenderStable();
  const w = element.offsetWidth || element.scrollWidth;
  const h = element.offsetHeight || element.scrollHeight;
  if (w <= 0 || h <= 0) {
    throw new Error('Conteúdo não possui dimensões válidas para gerar o PDF.');
  }
}

/**
 * Captura um elemento DOM como imagem PNG e faz o download.
 */
export async function captureElementAsImage(element, filename = 'comprovante.png') {
  await prepareForCapture(element);
  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    backgroundColor: '#ffffff',
    logging: false,
    imageTimeout: 15000,
    windowWidth: element.offsetWidth || 794,
    windowHeight: element.offsetHeight || 1123,
    onclone(doc) { sanitizeClone(doc); },
  });
  const link = document.createElement('a');
  link.download = filename;
  link.href = canvas.toDataURL('image/png');
  link.click();
}

/**
 * Captura um elemento DOM como PDF (A4) e faz o download.
 */
export async function captureElementAsPdf(element, filename = 'comprovante.pdf') {
  await prepareForCapture(element);
  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    backgroundColor: '#ffffff',
    logging: false,
    imageTimeout: 15000,
    windowWidth: element.offsetWidth || 794,
    windowHeight: element.offsetHeight || 1123,
    onclone(doc) { sanitizeClone(doc); },
  });

  const imgData = canvas.toDataURL('image/jpeg', 0.95);
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
  const pageWidth = 210;
  const pageHeight = 297;
  const margin = 10;
  const contentWidth = pageWidth - margin * 2;
  const imgRatio = canvas.height / canvas.width;
  const renderWidth = contentWidth;
  const renderHeight = renderWidth * imgRatio;

  if (renderHeight <= pageHeight - margin * 2) {
    pdf.addImage(imgData, 'JPEG', margin, margin, renderWidth, renderHeight);
  } else {
    const usableHeightPx = ((pageHeight - margin * 2) / renderWidth) * canvas.width;
    let remaining = canvas.height;
    let srcY = 0;
    let first = true;
    while (remaining > 0) {
      const sliceH = Math.min(usableHeightPx, remaining);
      const sliceCanvas = document.createElement('canvas');
      sliceCanvas.width = canvas.width;
      sliceCanvas.height = sliceH;
      const ctx = sliceCanvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, sliceH);
      ctx.drawImage(canvas, 0, srcY, canvas.width, sliceH, 0, 0, canvas.width, sliceH);
      const sliceData = sliceCanvas.toDataURL('image/jpeg', 0.95);
      const sliceHeightMm = (sliceH / canvas.width) * renderWidth;
      if (!first) pdf.addPage();
      pdf.addImage(sliceData, 'JPEG', margin, margin, renderWidth, sliceHeightMm);
      srcY += sliceH;
      remaining -= sliceH;
      first = false;
    }
  }

  pdf.save(filename);
}