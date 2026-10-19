/**
 * Modal que exibe preview do documento (renderizado a partir dos modelos de contrato)
 * e, se assinado, permite baixar o certificado de evidências.
 */
import { useState, useRef, useEffect } from 'react';
import { X, Download, CheckCircle, FileText, Shield, Printer, Loader2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import CertificadoEvidencias from './CertificadoEvidencias';
import { generateSignedPdfWithCertificate, generateCertificatePdf } from '@/lib/generateSignedPdf';
import DocumentPreviewRenderer from '@/components/assinatura/DocumentPreviewRenderer';
import { buildDadosContrato, buildDadosContratoMae, getDocPreviewType } from '@/lib/buildDadosContrato';

const STORAGE_KEY = 'psx_company_settings';
function getSettings() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch { return {}; }
}

const A4_WIDTH_PX = 794; // 210mm @ 96dpi

export default function DocumentoPreviewModal({ doc, assinaturas, signatarios, allDocuments, onClose }) {
  const [tab, setTab] = useState('documento');
  const [dados, setDados] = useState(null);
  const [loadingDados, setLoadingDados] = useState(true);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const docRef = useRef(null);       // container oculto para captura PDF (documento)
  const certRef = useRef(null);      // container oculto para captura PDF (certificado)
  const s = getSettings();

  const previewType = getDocPreviewType(doc);
  const isSigned = doc?.status === 'assinado';
  const hasAssinaturas = (assinaturas?.length || 0) > 0;

  // Carrega dados da operação + settings da empresa para popular o documento
  useEffect(() => {
    if (!doc?.operation_id && !doc?.client_id) { setLoadingDados(false); return; }
    let cancelled = false;
    (async () => {
      try {
        const existing = localStorage.getItem(STORAGE_KEY);
        if (!existing || existing === '{}') {
          const configs = await base44.entities.ConfiguracaoEmpresa.list().catch(() => []);
          if (configs.length > 0) {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(configs[0]));
          }
        }
        // Contrato mãe / promissória do limite (sem operação vinculada): usa dados do cedente
        if (!doc?.operation_id && doc?.client_id) {
          const [cedente, pessoas] = await Promise.all([
            base44.entities.Client.get(doc.client_id).catch(() => null),
            base44.entities.PessoaRelacionada.filter({ cedente_id: doc.client_id }).catch(() => []),
          ]);
          if (cancelled) return;
          // Busca o número CTR no documento de Contrato Mãe (irmão deste documento)
          const ctrDoc = allDocuments?.find(d => d.document_type === 'contrato_mae' && d.client_id === doc.client_id);
          const ctrNumber = ctrDoc?.document_number || doc.document_number || '';
          const dadosMae = buildDadosContratoMae(cedente, doc.id, ctrNumber);
          if (dadosMae) {
            dadosMae.representantes = pessoas.filter(p => p.pode_assinar).map(p => ({
              nome: p.nome, cpf: p.cpf, funcao: p.funcao,
              cidade: p.cidade ? `${p.cidade}${p.uf ? '/' + p.uf : ''}` : '',
              telefone: p.telefone, email: '',
            }));
            dadosMae.avalistas = pessoas.filter(p => p.funcao === 'avalista' || p.funcao === 'responsavel').map(p => ({
              nome: p.nome, cpf: p.cpf,
            }));
          }
          setDados(dadosMae);
          if (!cancelled) setLoadingDados(false);
          return;
        }
        const op = await base44.entities.Operation.get(doc.operation_id);
        let client = null;
        let sacado = null;
        if (op?.client_id) client = await base44.entities.Client.get(op.client_id).catch(() => null);
        if (op?.type === 'boleto' && op?.sacado_id) sacado = await base44.entities.Sacado.get(op.sacado_id).catch(() => null);
        let cheques = [];
        if (op?.type === 'cheque') cheques = await base44.entities.Cheque.filter({ operation_id: op.id }, 'compensation_date', 50).catch(() => []);
        if (cancelled) return;
        const dadosContrato = buildDadosContrato(op, client, cheques, sacado);
        if (dadosContrato && doc.document_hash) {
          dadosContrato.document_hash = doc.document_hash;
        }
        setDados(dadosContrato);
      } catch (e) {
        console.error('Erro ao carregar dados do documento:', e);
      }
      if (!cancelled) setLoadingDados(false);
    })();
    return () => { cancelled = true; };
  }, [doc?.operation_id, doc?.client_id]);

  // Reset tab when doc changes
  useEffect(() => {
    if (previewType) setTab('documento');
    else if (doc?.pdf_file) setTab('pdf');
    else setTab(isSigned ? 'certificado' : 'documento');
  }, [doc?.id]);

  if (!doc) return null;

  const printFromContainer = (element, title) => {
    if (!element) return;
    const content = element.innerHTML;
    const win = window.open('', '_blank');
    if (!win) { alert('Pop-up bloqueado. Permita pop-ups para imprimir.'); return; }
    win.document.write(`
      <html><head>
        <title>${title}</title>
        <meta charset="utf-8" />
        <style>
          @page { size: A4 portrait; margin: 10mm; }
          * { box-sizing: border-box; }
          html, body { margin: 0; padding: 0; background: #fff; }
          body { font-family: Arial, sans-serif; }
          body > div { max-width: 100% !important; width: 100% !important; margin: 0 !important; }
          table { width: 100%; border-collapse: collapse; }
          img { max-width: 100%; }
        </style>
      </head><body>${content}</body></html>
    `);
    win.document.close();
    setTimeout(() => { win.focus(); win.print(); }, 400);
  };

  const printDocumento = () => printFromContainer(docRef.current, doc.title);
  const printCertificado = () => printFromContainer(certRef.current, `Certificado — ${doc.title}`);

  const baixarPdfCompleto = async () => {
    if (!docRef.current) { alert('Documento ainda carregando, aguarde e tente novamente.'); return; }
    setDownloadingPdf(true);
    try {
      const numRef = doc.document_number || (dados?.operacao?.numero_operacao ? `op-${String(dados.operacao.numero_operacao).padStart(6, '0')}` : (dados?.operacao?.id?.slice(-6) || '000000'));
      const docSlug = (doc.title || 'documento').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const filename = `${docSlug}-${numRef}.pdf`;
      const certEl = isSigned ? certRef.current : null;
      const footerInfo = {
        hash: doc.document_hash || dados?.document_hash || null,
        operationNumber: dados?.operacao?.numero_operacao ? String(dados.operacao.numero_operacao).padStart(6, '0') : (doc.document_number || ''),
      };
      await generateSignedPdfWithCertificate(docRef.current, certEl, filename, footerInfo);
    } catch (e) {
      console.error('Erro ao gerar PDF:', e);
      alert('Erro ao gerar PDF: ' + e.message);
    }
    setDownloadingPdf(false);
  };

  const baixarCertificadoPdf = async () => {
    if (!certRef.current) return;
    setDownloadingPdf(true);
    try {
      const numRef = doc.document_number || (dados?.operacao?.numero_operacao ? `op-${String(dados.operacao.numero_operacao).padStart(6, '0')}` : '000000');
      await generateCertificatePdf(certRef.current, `certificado-evidencias-${numRef}.pdf`);
    } catch (e) {
      console.error('Erro ao gerar certificado:', e);
      alert('Erro ao gerar certificado: ' + e.message);
    }
    setDownloadingPdf(false);
  };

  const renderDocumento = () => {
    if (loadingDados) {
      return (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      );
    }
    return <DocumentPreviewRenderer doc={doc} dados={dados} />;
  };

  const hasDocumentoPreview = !!previewType;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center">
              <FileText className="w-4 h-4 text-gray-600" />
            </div>
            <div>
              <h2 className="text-sm font-bold">{doc.title}</h2>
              <p className="text-xs text-muted-foreground">
                {isSigned ? (
                  <span className="text-emerald-600 font-semibold flex items-center gap-1">
                    <CheckCircle className="w-3 h-3" /> Assinado
                  </span>
                ) : doc.status === 'aguardando_assinatura' ? (
                  <span className="text-amber-600">Aguardando assinatura</span>
                ) : (
                  <span className="text-gray-500 capitalize">{doc.status}</span>
                )}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs */}
        {isSigned && hasDocumentoPreview && (
          <div className="flex gap-0.5 bg-gray-100 rounded-lg p-1 mx-5 mt-3">
            <button
              onClick={() => setTab('documento')}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-colors ${tab === 'documento' ? 'bg-white shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            >
              <FileText className="w-3 h-3 inline mr-1" />Documento
            </button>
            {doc.pdf_file && (
              <button
                onClick={() => setTab('pdf')}
                className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-colors ${tab === 'pdf' ? 'bg-white shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              >
                PDF Original
              </button>
            )}
            <button
              onClick={() => setTab('certificado')}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-colors ${tab === 'certificado' ? 'bg-white shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            >
              <Shield className="w-3 h-3 inline mr-1" />Certificado
            </button>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {tab === 'pdf' && doc.pdf_file ? (
            <iframe
              src={doc.pdf_file}
              className="w-full rounded-lg border border-border"
              style={{ height: '500px' }}
              title={doc.title}
            />
          ) : tab === 'certificado' && isSigned ? (
            <div className="print-area">
              <CertificadoEvidencias
                assinaturas={assinaturas}
                signatarios={signatarios}
                documents={allDocuments}
                companyName={s.company_name || 'PSX Capital'}
                operationNumber={dados?.operacao?.numero_operacao || doc.document_number}
              />
            </div>
          ) : hasDocumentoPreview ? (
            <div className="bg-white border border-border rounded-lg p-8 print-area" style={{ minHeight: '400px' }}>
              {renderDocumento()}
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="w-10 h-10 mx-auto mb-3 text-gray-300" />
              <p className="text-sm">Nenhuma prévia disponível para este documento.</p>
              {doc.status === 'rascunho' && (
                <p className="text-xs mt-1">O documento será gerado ao iniciar a coleta de assinaturas.</p>
              )}
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-border bg-gray-50 rounded-b-2xl">
          <div className="text-xs text-muted-foreground">
            {doc.document_number && <span>Nº {doc.document_number}</span>}
          </div>
          <div className="flex gap-2">
            {tab === 'pdf' && doc.pdf_file && (
              <a
                href={doc.pdf_file}
                target="_blank"
                rel="noopener noreferrer"
                download
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-border rounded-lg hover:bg-gray-100"
              >
                <Download className="w-3.5 h-3.5" /> Baixar PDF Original
              </a>
            )}
            {tab === 'documento' && hasDocumentoPreview && (
              <>
                <button
                  onClick={printDocumento}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-border rounded-lg hover:bg-gray-100"
                >
                  <Printer className="w-3.5 h-3.5" /> Imprimir
                </button>
                <button
                  onClick={baixarPdfCompleto}
                  disabled={downloadingPdf}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-foreground text-white rounded-lg hover:bg-foreground/90 disabled:opacity-50"
                >
                  {downloadingPdf ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                  {downloadingPdf ? 'Gerando...' : isSigned ? 'Baixar PDF (com Certificado)' : 'Baixar PDF'}
                </button>
              </>
            )}
            {tab === 'certificado' && isSigned && (
              <>
                <button
                  onClick={printCertificado}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-border rounded-lg hover:bg-gray-100"
                >
                  <Printer className="w-3.5 h-3.5" /> Imprimir
                </button>
                <button
                  onClick={baixarCertificadoPdf}
                  disabled={downloadingPdf}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-foreground text-white rounded-lg hover:bg-foreground/90 disabled:opacity-50"
                >
                  {downloadingPdf ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                  {downloadingPdf ? 'Gerando...' : 'Baixar Certificado PDF'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ========== Hidden A4 capture containers — always in DOM for PDF generation ========== */}
      <div aria-hidden style={{ position: 'absolute', left: '-99999px', top: 0, width: `${A4_WIDTH_PX}px`, overflow: 'visible', pointerEvents: 'none' }}>
        {hasDocumentoPreview && dados && !loadingDados && (
          <div ref={docRef} style={{ width: `${A4_WIDTH_PX}px`, background: '#fff' }}>
            {renderDocumento()}
          </div>
        )}
        {isSigned && hasAssinaturas && (
          <div ref={certRef} style={{ width: `${A4_WIDTH_PX}px`, background: '#fff' }}>
            <CertificadoEvidencias
              assinaturas={assinaturas}
              signatarios={signatarios}
              documents={allDocuments}
              companyName={s.company_name || 'PSX Capital'}
              operationNumber={dados?.operacao?.numero_operacao || doc.document_number}
            />
          </div>
        )}
      </div>
    </div>
  );
}