import { useNavigate } from 'react-router-dom';
import { ScrollText } from 'lucide-react';
import OperacaoDocumentosPanel from '@/components/operacao/OperacaoDocumentosPanel';
import ContratoAssinadoPanel from '@/components/operacao/ContratoAssinadoPanel';

/**
 * ETAPA 4 — Formalização: geração dos documentos da operação (contrato,
 * promissória, borderô, aditivo) e anexos assinados.
 */
export default function EtapaDocumentos({ operacao, onUpdate }) {
  const navigate = useNavigate();

  return (
    <div className="space-y-3">
      <div className="bg-white border border-border rounded-xl p-4 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-sm font-bold">Gerar documentos</h3>
          <p className="text-xs text-muted-foreground">Contrato, nota promissória, borderô de cessão e aditivo, a partir dos dados desta operação.</p>
        </div>
        <button
          onClick={() => navigate(`/contratos?operation_id=${operacao.id}`)}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border border-blue-200 text-blue-700 bg-blue-50 rounded-lg hover:bg-blue-100"
        >
          <ScrollText className="w-3.5 h-3.5" /> Abrir gerador de documentos
        </button>
      </div>

      {operacao.needs_contract && <ContratoAssinadoPanel operacao={operacao} onUpdate={onUpdate} />}

      <div className="bg-white border border-border rounded-xl p-5">
        <OperacaoDocumentosPanel mode="entity" operacao={operacao} onUpdate={onUpdate} />
      </div>
    </div>
  );
}