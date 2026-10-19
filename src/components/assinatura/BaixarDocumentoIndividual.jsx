/**
 * Botão que baixa um único documento da operação como PDF.
 * Renderiza o preview off-screen, captura e gera o PDF.
 */
import { useState, useRef } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { loadDadosForOperacao } from '@/lib/loadDadosContrato';
import { renderDocPreview } from '@/lib/renderDocPreview';
import { getDocPreviewType } from '@/lib/buildDadosContrato';
import { generateMultipleDocumentsPdf } from '@/lib/generateSignedPdf';

export default function BaixarDocumentoIndividual({ operacao, doc }) {
  const [downloading, setDownloading] = useState(false);
  const containerRef = useRef(null);
  const [dados, setDados] = useState(null);

  const handleDownload = async () => {
    if (!operacao?.id || !doc) return;
    const previewType = getDocPreviewType(doc);
    if (!previewType) return;
    setDownloading(true);
    try {
      const d = await loadDadosForOperacao(operacao.id);
      setDados(d);
      await new Promise(r => setTimeout(r, 400));
      const el = containerRef.current?.firstElementChild;
      if (!el) throw new Error('Documento não renderizado');
      const numOp = d?.operacao?.numero_operacao
        ? String(d.operacao.numero_operacao).padStart(6, '0')
        : (d?.operacao?.id?.slice(-6) || '000000');
      const docSlug = (doc.title || 'documento').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const footerInfo = { hash: doc.document_hash || null, operationNumber: numOp };
      await generateMultipleDocumentsPdf([el], `${docSlug}-op-${numOp}.pdf`, [footerInfo]);
    } catch (e) {
      console.error('Erro ao gerar PDF:', e);
      alert('Erro ao gerar PDF: ' + e.message);
    }
    setDownloading(false);
  };

  if (!getDocPreviewType(doc)) return null;

  return (
    <>
      <button
        onClick={handleDownload}
        disabled={downloading}
        className="p-1.5 rounded-lg hover:bg-gray-100 text-muted-foreground disabled:opacity-50"
        title="Baixar PDF"
      >
        {downloading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
      </button>
      <div
        ref={containerRef}
        style={{ position: 'absolute', left: '-9999px', top: 0, width: '794px', background: '#fff' }}
        aria-hidden="true"
      >
        {dados && <div className="bg-white p-8" style={{ minHeight: '400px' }}>{renderDocPreview(doc, dados)}</div>}
      </div>
    </>
  );
}