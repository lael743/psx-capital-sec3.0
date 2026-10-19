/**
 * Renderiza o preview de um documento baseado no seu tipo.
 * Reutilizado pelo DocumentoPreviewModal (admin) e pela AssinaturaPublica (público).
 */
import { FileText } from 'lucide-react';
import ContratoPreview from '@/components/contrato/ContratoPreview';
import NotaPromissoriaV2Preview from '@/components/contrato/NotaPromissoriaV2Preview';
import CessaoCreditoPreview from '@/components/contrato/CessaoCreditoPreview';
import ConfissaoDividaPreview from '@/components/contrato/ConfissaoDividaPreview';
import TermoNotificacaoPreview from '@/components/contrato/TermoNotificacaoPreview';
import ComprovanteRepassePreview from '@/components/contrato/ComprovanteRepassePreview';
import BorderoCessaoPreview from '@/components/contrato/BorderoCessaoPreview';
import DadosOperacaoPreview from '@/components/contrato/DadosOperacaoPreview';
import AditivoDeclaracaoPreview from '@/components/contrato/AditivoDeclaracaoPreview';
import ContratoMaeSecuritizacaoPreview from '@/components/contrato/ContratoMaeSecuritizacaoPreview';
import { getDocPreviewType, fmtDate } from '@/lib/buildDadosContrato';
import { numPorExtenso } from '@/lib/numPorExtenso';

export { getDocPreviewType, fmtDate, numPorExtenso };

export default function DocumentPreviewRenderer({ doc, dados }) {
  if (!dados) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <FileText className="w-10 h-10 mx-auto mb-3 text-gray-300" />
        <p className="text-sm">Não foi possível carregar os dados do documento.</p>
      </div>
    );
  }
  const previewType = getDocPreviewType(doc);
  switch (previewType) {
    case 'contrato_mae':
      return <ContratoMaeSecuritizacaoPreview dados={dados} document_number={doc?.document_number} />;
    case 'promissoria':
      return <NotaPromissoriaV2Preview dados={dados} />;
    case 'bordero':
      return <BorderoCessaoPreview dados={dados} />;
    case 'dados':
      return <DadosOperacaoPreview dados={dados} />;
    case 'aditivo':
      return <AditivoDeclaracaoPreview dados={dados} />;
    case 'cessao':
      return <CessaoCreditoPreview dados={dados} fmtDate={fmtDate} numPorExtenso={numPorExtenso} />;
    case 'confissao':
      return <ConfissaoDividaPreview dados={dados} fmtDate={fmtDate} numPorExtenso={numPorExtenso} />;
    case 'notificacao':
      return <TermoNotificacaoPreview dados={dados} fmtDate={fmtDate} numPorExtenso={numPorExtenso} />;
    case 'comprovante':
      return <ComprovanteRepassePreview dados={dados} fmtDate={fmtDate} numPorExtenso={numPorExtenso} />;
    case 'contrato':
      return <ContratoPreview dados={dados} fmtDate={fmtDate} numPorExtenso={numPorExtenso} />;
    default:
      return (
        <div className="text-center py-12 text-muted-foreground">
          <FileText className="w-10 h-10 mx-auto mb-3 text-gray-300" />
          <p className="text-sm">Prévia não disponível para este tipo de documento.</p>
        </div>
      );
  }
}