import OperacaoDocumentosPanel from '@/components/operacao/OperacaoDocumentosPanel';

export default function StepDocumentos({ documentos, onChange }) {
  return (
    <OperacaoDocumentosPanel
      mode="queue"
      documentos={Array.isArray(documentos) ? documentos : []}
      onChange={onChange}
    />
  );
}