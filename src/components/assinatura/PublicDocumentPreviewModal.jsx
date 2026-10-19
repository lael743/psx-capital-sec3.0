/**
 * Modal de preview de documentos na página pública de assinatura.
 * Mostra cada documento sequencialmente. O signatário deve visualizar todos
 * e dar o aceite para prosseguir à biometria.
 */
import { useState, useEffect } from 'react';
import { X, ChevronLeft, ChevronRight, FileText, CheckCircle, Loader2, Eye } from 'lucide-react';
import DocumentPreviewRenderer, { getDocPreviewType } from '@/components/assinatura/DocumentPreviewRenderer';
import { buildDadosContrato, buildDadosContratoMae } from '@/lib/buildDadosContrato';

const STORAGE_KEY = 'psx_company_settings';

export default function PublicDocumentPreviewModal({ documents, operation, client, cheques, sacado, pessoas, onClose, onAccept }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [dadosMap, setDadosMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [viewedAll, setViewedAll] = useState(false);

  // Constrói os dados para cada documento
  useEffect(() => {
    if (!documents?.length) { setLoading(false); return; }
    const map = {};
    for (const doc of documents) {
      if (doc.operation_id && operation) {
        const dadosContrato = buildDadosContrato(operation, client, cheques || [], sacado);
        if (dadosContrato && doc.document_hash) {
          dadosContrato.document_hash = doc.document_hash;
        }
        map[doc.id] = dadosContrato;
      } else if (doc.client_id && client) {
        // Contrato Mãe / Promissória do Limite
        const ctrDoc = documents.find(d => d.document_type === 'contrato_mae' && d.client_id === doc.client_id);
        const ctrNumber = ctrDoc?.document_number || doc.document_number || '';
        const dadosMae = buildDadosContratoMae(client, doc.id, ctrNumber);
        if (dadosMae && pessoas?.length) {
          dadosMae.representantes = pessoas.filter(p => p.pode_assinar).map(p => ({
            nome: p.nome, cpf: p.cpf, funcao: p.funcao,
            cidade: p.cidade ? `${p.cidade}${p.uf ? '/' + p.uf : ''}` : '',
            telefone: p.telefone, email: '',
          }));
          dadosMae.avalistas = pessoas.filter(p => p.funcao === 'avalista' || p.funcao === 'responsavel').map(p => ({
            nome: p.nome, cpf: p.cpf,
          }));
        }
        map[doc.id] = dadosMae;
      }
    }
    setDadosMap(map);
    setLoading(false);
  }, [documents, operation, client, cheques, sacado, pessoas]);

  // Armazena settings da empresa no localStorage (necessário para buildDadosContrato)
  useEffect(() => {
    if (documents?.length) {
      // settings já deve estar no localStorage (populado pela AssinaturaPublica)
    }
  }, [documents]);

  if (!documents?.length) return null;

  const doc = documents[currentIndex];
  const dados = dadosMap[doc.id];
  const isLast = currentIndex === documents.length - 1;
  const previewType = getDocPreviewType(doc);

  const handleNext = () => {
    if (isLast) {
      setViewedAll(true);
    } else {
      setCurrentIndex(i => i + 1);
    }
  };

  const handlePrev = () => {
    if (currentIndex > 0) setCurrentIndex(i => i - 1);
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-2 sm:p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[95vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-5 py-3 border-b border-border shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
              <FileText className="w-4 h-4 text-gray-600" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-bold truncate">{doc.title}</h2>
              <p className="text-xs text-muted-foreground">
                Documento {currentIndex + 1} de {documents.length}
                {doc.document_number && ` · Nº ${doc.document_number}`}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Progress dots */}
        <div className="flex items-center justify-center gap-1.5 py-2 border-b border-border bg-gray-50/50 shrink-0">
          {documents.map((d, i) => (
            <button
              key={d.id || i}
              onClick={() => setCurrentIndex(i)}
              className={`h-1.5 rounded-full transition-all ${
                i === currentIndex ? 'w-8 bg-foreground' : i < currentIndex ? 'w-3 bg-emerald-500' : 'w-3 bg-gray-300'
              }`}
              title={d.title}
            />
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-gray-100">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : previewType ? (
            <div className="bg-white border border-border rounded-lg p-6 sm:p-8 shadow-sm" style={{ minHeight: '400px' }}>
              <DocumentPreviewRenderer doc={doc} dados={dados} />
            </div>
          ) : doc.pdf_file ? (
            <iframe src={doc.pdf_file} className="w-full rounded-lg border border-border bg-white" style={{ height: '500px' }} title={doc.title} />
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="w-10 h-10 mx-auto mb-3 text-gray-300" />
              <p className="text-sm">Prévia não disponível para este documento.</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 sm:px-5 py-3 border-t border-border bg-white shrink-0">
          <button
            onClick={handlePrev}
            disabled={currentIndex === 0}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border border-border rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="w-4 h-4" /> Anterior
          </button>

          <div className="text-xs text-muted-foreground hidden sm:block">
            {viewedAll ? 'Você visualizou todos os documentos' : 'Revise cada documento antes de assinar'}
          </div>

          {isLast ? (
            <button
              onClick={onAccept}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold bg-foreground text-white rounded-lg hover:bg-foreground/90"
            >
              <CheckCircle className="w-4 h-4" /> Li e aceito — Assinar
            </button>
          ) : (
            <button
              onClick={handleNext}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold bg-foreground text-white rounded-lg hover:bg-foreground/90"
            >
              Próximo <ChevronRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}