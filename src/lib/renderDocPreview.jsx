/**
 * Renderiza o preview correto de um documento com base no seu tipo.
 * Lógica compartilhada entre BaixarTodosDocumentos, BaixarDocumentoIndividual e DocumentoPreviewModal.
 */
import ContratoPreview from '@/components/contrato/ContratoPreview';
import NotaPromissoriaV2Preview from '@/components/contrato/NotaPromissoriaV2Preview';
import CessaoCreditoPreview from '@/components/contrato/CessaoCreditoPreview';
import ConfissaoDividaPreview from '@/components/contrato/ConfissaoDividaPreview';
import TermoNotificacaoPreview from '@/components/contrato/TermoNotificacaoPreview';
import ComprovanteRepassePreview from '@/components/contrato/ComprovanteRepassePreview';
import BorderoCessaoPreview from '@/components/contrato/BorderoCessaoPreview';
import DadosOperacaoPreview from '@/components/contrato/DadosOperacaoPreview';
import AditivoDeclaracaoPreview from '@/components/contrato/AditivoDeclaracaoPreview';
import { getDocPreviewType, fmtDate } from '@/lib/buildDadosContrato';
import { numPorExtenso } from '@/lib/numPorExtenso';

export function renderDocPreview(doc, dados) {
  if (!doc || !dados) return null;
  const previewType = getDocPreviewType(doc);
  switch (previewType) {
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
      return null;
  }
}