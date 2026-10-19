/**
 * Botão que gera um PDF único com todos os documentos da operação.
 * Renderiza todos os previews off-screen, captura e consolida em um único PDF.
 */
import { useState, useRef } from 'react';
import { Loader2, Files } from 'lucide-react';
import { loadDadosForOperacao } from '@/lib/loadDadosContrato';
import { renderDocPreview } from '@/lib/renderDocPreview';
import { getDocPreviewType } from '@/lib/buildDadosContrato';
import { generateMultipleDocumentsPdf } from '@/lib/generateSignedPdf';

export default function BaixarTodosDocumentos({ operacao, documents }) {
  const [downloading, setDownloading] = useState(false);
  const containerRef = useRef(null);
  const [dados, setDadosState] = useState(null);

  const handleDownload = async () => {
    if (!operacao?.id || !documents?.length) return;
    setDownloading(true);
    try {
      const d = await loadDadosForOperacao(operacao.id);
      setDadosState(d);
      await new Promise(r => setTimeout(r, 500));
      const container = containerRef.current;
      if (!container) throw new Error('Container de renderização não encontrado');
      const docElements = Array.from(container.children);
      if (docElements.length === 0) throw new Error('Nenhum documento renderizado');
      const numOp = d?.operacao?.numero_operacao
        ? String(d.operacao.numero_operacao).padStart(6, '0')
        : (d?.operacao?.id?.slice(-6) || '000000');
      // Passa hash + número da operação de cada documento para o rodapé de cada página
      const footerInfos = validDocs.map((doc) => ({
        hash: doc.document_hash || null,
        operationNumber: numOp,
      }));
      await generateMultipleDocumentsPdf(docElements, `documentos-operacao-${numOp}.pdf`, footerInfos);
    } catch (e) {
      console.error('Erro ao gerar PDF de todos os documentos:', e);
      alert('Erro ao gerar PDF: ' + e.message);
    }
    setDownloading(false);
  };

  const validDocs = documents?.filter(d => getDocPreviewType(d)) || [];
  if (validDocs.length === 0) return null;

  return (
    <>
      <button
        onClick={handleDownload}
        disabled={downloading}
        className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-bold bg-foreground text-white rounded-lg hover:bg-foreground/90 disabled:opacity-50 transition-colors"
      >
        {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Files className="w-4 h-4" />}
        {downloading ? 'Gerando PDF...' : `Baixar Todos os Documentos (${validDocs.length})`}
      </button>
      <div
        ref={containerRef}
        style={{ position: 'absolute', left: '-9999px', top: 0, width: '794px', background: '#fff' }}
        aria-hidden="true"
      >
        {dados && validDocs.map((doc, i) => (
          <div key={doc.id || i} className="bg-white p-8" style={{ minHeight: '400px' }}>
            {renderDocPreview(doc, dados)}
          </div>
        ))}
      </div>
    </>
  );
}