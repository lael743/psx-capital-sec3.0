import { useEffect, useState, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { FileText, Send, CheckCircle, Clock, Copy, ExternalLink, MessageCircle, X, FileCheck, Sparkles, AlertTriangle, Eye } from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/finance';
import DocumentoPreviewModal from '@/components/assinatura/DocumentoPreviewModal';

const STATUS_CONFIG = {
  rascunho: { label: 'Rascunho', cls: 'bg-gray-100 text-gray-600' },
  aguardando_assinatura: { label: 'Aguardando', cls: 'bg-amber-50 text-amber-700' },
  assinado: { label: 'Assinado', cls: 'bg-emerald-50 text-emerald-700' },
  cancelado: { label: 'Cancelado', cls: 'bg-red-50 text-red-700' },
  recusado: { label: 'Recusado', cls: 'bg-red-50 text-red-700' },
};

export default function ContratoMaePanel({ cedente, onUpdate }) {
  const [documents, setDocuments] = useState([]);
  const [signersMap, setSignersMap] = useState({});
  const [assinaturasMap, setAssinaturasMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [gerando, setGerando] = useState(false);
  const [coletando, setColetando] = useState(false);
  const [coletaResults, setColetaResults] = useState(null);
  const [error, setError] = useState('');
  const [previewDoc, setPreviewDoc] = useState(null);

  const load = useCallback(async () => {
    if (!cedente?.id) return;
    setLoading(true);
    try {
      const allDocs = await base44.entities.AssinaturaDocumento.filter({ client_id: cedente.id });
      const docs = allDocs.filter(d => !d.operation_id && (d.document_type === 'contrato_mae' || d.document_type === 'promissoria_limite'));
      setDocuments(docs);

      const sigMap = {};
      const assMap = {};
      for (const doc of docs) {
        const [sigs, asss] = await Promise.all([
          base44.entities.AssinaturaSignatario.filter({ document_id: doc.id }),
          base44.entities.AssinaturaDigital.filter({ document_id: doc.id }),
        ]);
        sigMap[doc.id] = sigs;
        assMap[doc.id] = asss;
      }
      setSignersMap(sigMap);
      setAssinaturasMap(assMap);
    } catch (e) {
      console.error('Erro ao carregar contrato mãe:', e);
    }
    setLoading(false);
  }, [cedente?.id]);

  useEffect(() => { load(); }, [load]);

  const cadastroCompleto = cedente?.status_cadastro === 'concluido' || (!!cedente?.name && !!cedente?.document && parseFloat(cedente?.credit_limit) > 0 && parseFloat(cedente?.default_rate) > 0);

  const gerarContrato = async () => {
    setGerando(true);
    setError('');
    try {
      const res = await base44.functions.invoke('gerarContratoMae', { cedente_id: cedente.id });
      if (res.data?.success) {
        await load();
        onUpdate?.();
      } else {
        setError(res.data?.message || 'Erro ao gerar contrato');
      }
    } catch (e) {
      setError(e.message || 'Erro ao gerar contrato');
    }
    setGerando(false);
  };

  const iniciarColeta = async () => {
    setColetando(true);
    setError('');
    try {
      const res = await base44.functions.invoke('gerarLinkAssinaturaCedente', { cedente_id: cedente.id });
      if (res.data?.success) {
        setColetaResults({ links: res.data.signer_links, ctr_number: res.data.ctr_number, expires_at: res.data.link_expires_at });
        await load();
      } else {
        setError(res.data?.error || 'Erro ao iniciar coleta');
      }
    } catch (e) {
      setError(e.message || 'Erro ao iniciar coleta');
    }
    setColetando(false);
  };

  if (loading) {
    return <div className="flex items-center justify-center h-48"><div className="w-6 h-6 border-2 border-border border-t-foreground rounded-full animate-spin" /></div>;
  }

  const allAssinado = documents.length > 0 && documents.every(d => d.status === 'assinado');

  return (
    <div className="space-y-5">
      {error && (
        <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 flex items-center gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />{error}
        </div>
      )}

      {/* Resumo */}
      {documents.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white border border-border rounded-xl p-5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Resumo do Contrato</h3>
            <p className="text-sm font-bold">{documents[0]?.document_number || '—'}</p>
            <p className="text-xs text-muted-foreground mt-1">Emitido em {formatDate(documents[0]?.created_date)}</p>
            <div className="mt-2 flex items-center gap-2">
              <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_CONFIG[documents[0]?.status]?.cls || STATUS_CONFIG.rascunho.cls}`}>
                {STATUS_CONFIG[documents[0]?.status]?.label || 'Rascunho'}
              </span>
              <span className="text-xs text-muted-foreground">{Object.values(signersMap).flat().length} signatário(s)</span>
            </div>
          </div>
          <div className={`rounded-xl p-5 text-white ${allAssinado ? 'bg-emerald-600' : 'bg-blue-600'}`}>
            <p className="text-xs font-semibold uppercase tracking-wider opacity-80 mb-1">{allAssinado ? 'Processo Finalizado' : 'Próxima Ação'}</p>
            <h3 className="text-base font-bold">{allAssinado ? 'Todas as assinaturas coletadas' : 'Tudo pronto para iniciar'}</h3>
            <p className="text-sm opacity-90 mt-1">
              {allAssinado ? 'Contrato mãe e promissória do limite assinados.' : 'Dispare a coleta digital via WhatsApp para os signatários.'}
            </p>
          </div>
        </div>
      )}

      {/* Gerar contrato */}
      {documents.length === 0 && (
        <div className="bg-white border-2 border-dashed border-border rounded-xl p-8 text-center">
          <div className="w-14 h-14 rounded-full bg-amber-50 flex items-center justify-center mx-auto mb-4">
            <Sparkles className="w-6 h-6 text-amber-500" />
          </div>
          <h3 className="text-sm font-bold">Contrato Mãe ainda não gerado</h3>
          <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto mb-4">
            {cadastroCompleto
              ? 'O cadastro está completo. Gere o Contrato Mãe de Cessão de Crédito com Coobrigação e a Nota Promissória do Limite.'
              : 'Complete os Dados Cadastrais e Condições Comerciais (limite de crédito e taxa mensal) para gerar o contrato.'}
          </p>
          <button
            onClick={gerarContrato}
            disabled={gerando || !cadastroCompleto}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-foreground text-primary-foreground text-sm font-bold rounded-lg hover:bg-foreground/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <FileCheck className="w-4 h-4" /> {gerando ? 'Gerando...' : 'Gerar Contrato Mãe'}
          </button>
        </div>
      )}

      {/* Documentos */}
      {documents.length > 0 && (
        <div className="bg-white border border-border rounded-xl p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Documentos do Processo</h3>
          <div className="space-y-2">
            {documents.map(doc => {
              const asss = assinaturasMap[doc.id] || [];
              const signedCount = asss.filter(a => a.status === 'concluido').length;
              const cfg = STATUS_CONFIG[doc.status] || STATUS_CONFIG.rascunho;
              return (
                <div key={doc.id} className="flex items-center justify-between border border-border rounded-lg px-3 py-2.5">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center shrink-0">
                      <FileText className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate">{doc.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {doc.document_number || '—'}
                        {asss.length > 0 && ` · ${signedCount}/${asss.length} assinado(s)`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => setPreviewDoc(doc)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-border rounded-lg hover:bg-gray-50 transition-colors"
                      title="Visualizar e baixar"
                    >
                      <Eye className="w-3.5 h-3.5" /> Visualizar
                    </button>
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${cfg.cls}`}>{cfg.label}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Signatários */}
      {documents.length > 0 && (
        <div className="bg-white border border-border rounded-xl p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Participantes do Fluxo</h3>
          <div className="space-y-2">
            {Object.values(signersMap).flat().map((sig, i) => {
              const allAss = documents.flatMap(d => assinaturasMap[d.id] || []);
              const signerAss = allAss.find(a => a.signer_id === sig.id);
              const status = signerAss?.status || 'pendente';
              return (
                <div key={sig.id || i} className="border border-border rounded-lg p-3">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
                      <span className="text-xs font-bold text-blue-600">#{i + 1}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-bold">{sig.name}</p>
                        {sig.role && <span className="text-xs font-medium text-muted-foreground">• {sig.role}</span>}
                        {status === 'concluido' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700"><CheckCircle className="w-3 h-3" /> Assinado</span>
                        ) : signerAss ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700"><Clock className="w-3 h-3" /> Pendente</span>
                        ) : null}
                      </div>
                      <div className="grid grid-cols-2 gap-x-4 mt-1 text-xs text-muted-foreground">
                        {sig.cpf_cnpj && <span>CPF/CNPJ: {sig.cpf_cnpj}</span>}
                        {sig.phone && <span>WhatsApp: {sig.phone}</span>}
                        {sig.email && <span>E-mail: {sig.email}</span>}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
            {Object.values(signersMap).flat().length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">Nenhum signatário. Inicie a coleta para gerar os signatários automaticamente (cedente + pessoas relacionadas com poder de assinatura).</p>
            )}
          </div>
        </div>
      )}

      {/* Iniciar Coleta */}
      {documents.length > 0 && !allAssinado && (
        <div className="bg-blue-600 text-white rounded-xl p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-blue-100 mb-1">Ação Principal</p>
              <h3 className="text-base font-bold">Iniciar Coleta de Assinaturas</h3>
              <p className="text-sm text-blue-100 mt-1">Cada signatário receberá um link único via WhatsApp para assinar todos os documentos com uma biometria.</p>
            </div>
            <button onClick={iniciarColeta} disabled={coletando} className="inline-flex items-center gap-2 px-5 py-2.5 bg-white text-blue-700 text-sm font-bold rounded-lg hover:bg-blue-50 disabled:opacity-50 shrink-0">
              <Send className="w-4 h-4" /> {coletando ? 'Iniciando...' : 'Iniciar Coleta'}
            </button>
          </div>
        </div>
      )}

      {/* Coleta Results */}
      {coletaResults && (
        <div className="bg-white border border-border rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Links de Assinatura Gerados</h3>
            <button onClick={() => setColetaResults(null)} className="p-1 rounded hover:bg-gray-100"><X className="w-3.5 h-3.5 text-muted-foreground" /></button>
          </div>
          <div className="space-y-3">
            {coletaResults.links?.map((link, j) => {
              const signUrl = `${window.location.origin}/assinar/${link.public_link}`;
              const waMsg = encodeURIComponent(
                `Olá ${link.signer_name}! Você tem documentos para assinar digitalmente.\n\nContrato Mãe ${coletaResults.ctr_number || ''}\nLink único: ${signUrl}\n\nO link expira em 2 dias.`
              );
              return (
                <div key={j} className="border border-border rounded-lg p-3 space-y-2">
                  <div>
                    <p className="text-sm font-semibold">{link.signer_name}</p>
                    <p className="text-xs text-muted-foreground">{link.doc_count} documento(s) · 1 link · 1 biometria</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <code className="text-xs bg-gray-50 border border-border rounded px-2 py-1 flex-1 truncate">{signUrl}</code>
                    <button onClick={() => navigator.clipboard.writeText(signUrl)} className="p-1.5 rounded-lg hover:bg-gray-50 border border-border text-muted-foreground" title="Copiar"><Copy className="w-3.5 h-3.5" /></button>
                    <a href={`/assinar/${link.public_link}`} target="_blank" rel="noopener" className="p-1.5 rounded-lg hover:bg-gray-50 border border-border text-muted-foreground" title="Abrir"><ExternalLink className="w-3.5 h-3.5" /></a>
                  </div>
                  {link.signer_phone ? (
                    <a href={`https://wa.me/55${link.signer_phone.replace(/\D/g, '')}?text=${waMsg}`} target="_blank" rel="noopener" className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-emerald-500 text-white rounded-lg hover:bg-emerald-600">
                      <MessageCircle className="w-3 h-3" /> Enviar WhatsApp
                    </a>
                  ) : <span className="text-xs text-muted-foreground italic">Sem WhatsApp cadastrado</span>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {allAssinado && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center gap-3">
          <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-emerald-800">Contrato Mãe assinado</p>
            <p className="text-xs text-emerald-700">Todos os documentos foram assinados. O cedente está formalizado.</p>
          </div>
        </div>
      )}

      {previewDoc && (
        <DocumentoPreviewModal
          doc={previewDoc}
          assinaturas={assinaturasMap[previewDoc.id] || []}
          signatarios={signersMap[previewDoc.id] || []}
          allDocuments={documents}
          onClose={() => setPreviewDoc(null)}
        />
      )}
    </div>
  );
}