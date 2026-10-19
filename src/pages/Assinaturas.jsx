import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Plus, Send, FileText, Clock, CheckCircle, XCircle, Search, ExternalLink, Copy, Eye, Ban, MessageCircle, Mail } from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/finance';
import StatusBadge from '@/components/ui/StatusBadge';
import ConfirmDialog from '@/components/ui/ConfirmDialog';

const DOC_TYPE_LABELS = {
  contrato: 'Contrato', promissoria: 'Promissória', confissao_divida: 'Confissão de Dívida',
  cessao_credito: 'Cessão de Crédito', termo_garantia: 'Termo de Garantia', outro: 'Outro',
};

function GerarLinkModal({ document: doc, onClose, onSaved, existingLinks }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(existingLinks || null);

  const gerar = async () => {
    setLoading(true);
    const res = await base44.functions.invoke('gerarLinkAssinatura', { document_id: doc.id });
    setResult(res.data);
    setLoading(false);
    onSaved();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="px-5 py-4 border-b border-border">
          <h3 className="text-sm font-bold">{result ? 'Links de Assinatura' : 'Gerar Links de Assinatura'}</h3>
          <p className="text-xs text-muted-foreground mt-0.5">{doc.title}</p>
        </div>
        <div className="p-5 space-y-4">
          {!result ? (
            <>
              <p className="text-sm text-muted-foreground">
                Serão gerados links únicos para cada signatário deste documento. Os links expiram em 30 dias.
              </p>
              <div className="space-y-2">
                <div className="text-xs font-semibold text-muted-foreground uppercase">Documento</div>
                <div className="bg-gray-50 rounded-lg p-3 text-sm space-y-1">
                  <div><strong>Tipo:</strong> {DOC_TYPE_LABELS[doc.document_type] || doc.document_type}</div>
                  <div><strong>Título:</strong> {doc.title}</div>
                  {doc.pdf_file && <div className="text-emerald-600 text-xs">PDF anexado</div>}
                </div>
              </div>
              <button onClick={gerar} disabled={loading}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-foreground text-white text-sm font-semibold rounded-lg disabled:opacity-50 hover:bg-foreground/90">
                <Send className="w-4 h-4" /> {loading ? 'Gerando...' : 'Gerar Links'}
              </button>
            </>
          ) : (
            <div className="space-y-3">
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-sm text-emerald-700 flex items-center gap-2">
                <CheckCircle className="w-4 h-4" /> Links gerados com sucesso!
              </div>
              <div className="text-xs font-semibold text-muted-foreground uppercase">Links por signatário</div>
              {result.signer_links?.map((link, i) => {
                const signUrl = `${window.location.origin}/assinar/${link.public_link}`;
                const whatsappMsg = encodeURIComponent(
                  `Olá ${link.signer_name}! Você recebeu um documento para assinar digitalmente.\n\n📄 Documento: ${doc.title}\n🔗 Link: ${signUrl}\n\nAtenção: o link expira em 30 dias.`
                );
                return (
                  <div key={i} className="bg-gray-50 rounded-lg p-3 space-y-1.5">
                    <div className="text-sm font-medium">{link.signer_name}</div>
                    <div className="flex items-center gap-2">
                      <code className="text-xs bg-white border border-border rounded px-2 py-1 flex-1 truncate">
                        {signUrl}
                      </code>
                      <button onClick={() => navigator.clipboard.writeText(signUrl)}
                        className="p-1.5 rounded-lg hover:bg-white border border-border text-muted-foreground hover:text-foreground" title="Copiar link">
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      <a href={`/assinar/${link.public_link}`} target="_blank" rel="noopener"
                        className="p-1.5 rounded-lg hover:bg-white border border-border text-muted-foreground hover:text-foreground" title="Abrir link">
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                    <div className="flex items-center gap-2 pt-1">
                      {link.signer_phone ? (
                        <a href={`https://wa.me/55${link.signer_phone.replace(/\D/g, '')}?text=${whatsappMsg}`}
                          target="_blank" rel="noopener"
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-colors">
                          <MessageCircle className="w-3 h-3" /> Enviar WhatsApp
                        </a>
                      ) : (
                        <span className="text-xs text-muted-foreground italic">Sem WhatsApp cadastrado</span>
                      )}
                      {link.signer_email && (
                        <a href={`mailto:${link.signer_email}?subject=${encodeURIComponent('Assinatura de Documento - ' + doc.title)}&body=${encodeURIComponent(`Olá ${link.signer_name},\n\nVocê recebeu um documento para assinar digitalmente.\n\n📄 Documento: ${doc.title}\n🔗 Link: ${signUrl}\n\nO link expira em 30 dias.\n\nAtenciosamente,\nPSX Capital`)}`}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold border border-border rounded-lg hover:bg-gray-50 transition-colors">
                          <Mail className="w-3 h-3" /> E-mail
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}
              {result.document_hash && (
                <div className="text-xs text-muted-foreground bg-gray-50 rounded-lg p-2">
                  Hash SHA-256: <code className="text-foreground break-all">{result.document_hash}</code>
                </div>
              )}
              <button onClick={onClose} className="w-full px-4 py-2 text-sm border border-border rounded-lg hover:bg-gray-50">Fechar</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Assinaturas() {
  const [searchParams] = useSearchParams();
  const [documentos, setDocumentos] = useState([]);
  const [signatarios, setSignatarios] = useState({});
  const [assinaturas, setAssinaturas] = useState({});
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState(searchParams.get('status') || '');
  const [searchQuery, setSearchQuery] = useState('');
  const [gerarLinkDoc, setGerarLinkDoc] = useState(null);
  const [reenviarLinks, setReenviarLinks] = useState(null); // { doc, existingLinks }
  const [confirmCancel, setConfirmCancel] = useState(null);

  const load = async () => {
    setLoading(true);
    const docs = await base44.entities.AssinaturaDocumento.list('-created_date', 200);
    setDocumentos(docs);

    const sigMap = {};
    const assMap = {};
    for (const doc of docs) {
      const sigs = await base44.entities.AssinaturaSignatario.filter({ document_id: doc.id });
      sigMap[doc.id] = sigs;
      const asss = await base44.entities.AssinaturaDigital.filter({ document_id: doc.id });
      assMap[doc.id] = asss;
    }
    setSignatarios(sigMap);
    setAssinaturas(assMap);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleReenviar = async (doc) => {
    // Busca os links de assinatura já existentes para esse documento
    const sigs = signatarios[doc.id] || [];
    const asss = assinaturas[doc.id] || [];
    const links = sigs.map(s => {
      const ass = asss.find(a => a.signer_id === s.id);
      return {
        signer_id: s.id,
        signer_name: s.name,
        signer_phone: s.phone || '',
        signer_email: s.email || '',
        public_link: ass?.public_link || '',
      };
    }).filter(l => l.public_link);

    const result = {
      success: true,
      document_hash: doc.document_hash,
      document_number: doc.document_number,
      signer_links: links,
    };
    setReenviarLinks({ doc, existingLinks: result });
  };

  const cancelarDocumento = async () => {
    if (!confirmCancel) return;
    await base44.entities.AssinaturaDocumento.update(confirmCancel.id, { status: 'cancelado' });
    setConfirmCancel(null);
    load();
  };

  const filtered = documentos.filter(d => {
    if (filterStatus && d.status !== filterStatus) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const match = [d.title, d.document_number, d.document_type, d.description, d.notes]
        .some(v => (v || '').toLowerCase().includes(q));
      if (!match) return false;
    }
    return true;
  });

  const statusCounts = documentos.reduce((acc, d) => {
    acc[d.status] = (acc[d.status] || 0) + 1;
    acc.total = (acc.total || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <ConfirmDialog
        open={!!confirmCancel}
        title="Cancelar Documento"
        message={`Tem certeza que deseja cancelar "${confirmCancel?.title}"? Os links de assinatura serão invalidados.`}
        variant="danger"
        onConfirm={cancelarDocumento}
        onCancel={() => setConfirmCancel(null)}
      />

      {gerarLinkDoc && (
        <GerarLinkModal document={gerarLinkDoc} onClose={() => setGerarLinkDoc(null)} onSaved={load} />
      )}
      {reenviarLinks && (
        <GerarLinkModal document={reenviarLinks.doc} existingLinks={reenviarLinks.existingLinks}
          onClose={() => setReenviarLinks(null)} onSaved={load} />
      )}

      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold">Assinaturas Digitais</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {statusCounts.total || 0} documento{statusCounts.total !== 1 ? 's' : ''}
            {statusCounts.aguardando_assinatura ? ` · ${statusCounts.aguardando_assinatura} pendente${statusCounts.aguardando_assinatura !== 1 ? 's' : ''}` : ''}
          </p>
        </div>
        <Link to="/assinaturas/novo"
          className="inline-flex items-center gap-2 px-4 py-2 bg-foreground text-primary-foreground text-sm font-medium rounded-lg hover:bg-foreground/90">
          <Plus className="w-4 h-4" /> Novo Documento
        </Link>
      </div>

      {/* Cards de status */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-5">
        {[
          { label: 'Total', count: statusCounts.total || 0, key: '', cls: 'bg-gray-50 border-gray-200' },
          { label: 'Rascunhos', count: statusCounts.rascunho || 0, key: 'rascunho', cls: 'bg-slate-50 border-slate-200' },
          { label: 'Pendentes', count: statusCounts.aguardando_assinatura || 0, key: 'aguardando_assinatura', cls: 'bg-amber-50 border-amber-200 text-amber-700' },
          { label: 'Assinados', count: statusCounts.assinado || 0, key: 'assinado', cls: 'bg-emerald-50 border-emerald-200 text-emerald-700' },
          { label: 'Cancelados', count: statusCounts.cancelado || 0, key: 'cancelado', cls: 'bg-red-50 border-red-200 text-red-700' },
        ].map(card => (
          <button key={card.key} onClick={() => setFilterStatus(s => s === card.key ? '' : card.key)}
            className={`rounded-xl border p-3 text-left transition-all cursor-pointer hover:shadow-sm ${card.cls} ${filterStatus === card.key ? 'ring-2 ring-offset-1 ring-foreground' : ''}`}>
            <div className="text-xs font-medium opacity-70">{card.label}</div>
            <div className="text-xl font-bold mt-0.5">{card.count}</div>
          </button>
        ))}
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input className="w-full pl-9 pr-4 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder="Buscar por título, número, tipo..."
            value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
        </div>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          className="text-sm border border-border rounded-lg px-3 py-2">
          <option value="">Todos status</option>
          <option value="rascunho">Rascunho</option>
          <option value="aguardando_assinatura">Aguardando Assinatura</option>
          <option value="assinado">Assinado</option>
          <option value="recusado">Recusado</option>
          <option value="cancelado">Cancelado</option>
        </select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="w-6 h-6 border-2 border-border border-t-foreground rounded-full animate-spin" />
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(doc => {
            const sigs = signatarios[doc.id] || [];
            const asss = assinaturas[doc.id] || [];
            return (
              <div key={doc.id} className="bg-white border border-border rounded-xl p-4 hover:shadow-sm transition-shadow">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-bold">{doc.title}</h3>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        doc.status === 'assinado' ? 'bg-emerald-50 text-emerald-700' :
                        doc.status === 'aguardando_assinatura' ? 'bg-amber-50 text-amber-700' :
                        doc.status === 'cancelado' ? 'bg-red-50 text-red-700' :
                        'bg-gray-100 text-gray-600'
                      }`}>
                        {doc.status === 'aguardando_assinatura' ? 'Aguardando' :
                         doc.status === 'rascunho' ? 'Rascunho' :
                         doc.status === 'assinado' ? 'Assinado' :
                         doc.status === 'cancelado' ? 'Cancelado' : doc.status}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-xs text-muted-foreground">
                      <span>{DOC_TYPE_LABELS[doc.document_type] || doc.document_type}</span>
                      {doc.document_number && <span className="font-mono">{doc.document_number}</span>}
                      {doc.pdf_file && <span className="text-emerald-600">PDF anexado</span>}
                      <span>Criado {formatDate(doc.created_date?.split('T')[0])}</span>
                    </div>
                    {sigs.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {sigs.map(signer => {
                          const ass = asss.find(a => a.signer_id === signer.id);
                          return (
                            <div key={signer.id} className="flex items-center gap-1.5 bg-gray-50 border border-border rounded-lg px-2.5 py-1.5 text-xs">
                              <span className="font-medium">{signer.name}</span>
                              {ass?.status === 'concluido' ? (
                                <CheckCircle className="w-3 h-3 text-emerald-500" />
                              ) : ass?.status === 'pendente' ? (
                                <Clock className="w-3 h-3 text-amber-500" />
                              ) : (
                                <Clock className="w-3 h-3 text-gray-300" />
                              )}
                              {ass?.certificate_pdf && (
                                <a href={ass.certificate_pdf} target="_blank" rel="noopener"
                                  className="text-foreground/50 hover:text-foreground" title="Certificado">
                                  <FileText className="w-3 h-3" />
                                </a>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {doc.status === 'rascunho' && (
                      <button onClick={() => setGerarLinkDoc(doc)}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-foreground text-white rounded-lg hover:bg-foreground/90">
                        <Send className="w-3 h-3" /> Gerar e Enviar
                      </button>
                    )}
                    {doc.status === 'aguardando_assinatura' && (
                      <button onClick={() => handleReenviar(doc)}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-amber-500 text-white rounded-lg hover:bg-amber-600">
                        <Send className="w-3 h-3" /> Reenviar
                      </button>
                    )}
                    {(doc.status === 'rascunho' || doc.status === 'aguardando_assinatura') && (
                      <button onClick={() => setConfirmCancel(doc)}
                        className="p-1.5 text-muted-foreground hover:text-red-500 rounded-lg hover:bg-red-50" title="Cancelar">
                        <Ban className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <Link to={`/assinaturas/${doc.id}`}
                      className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-gray-100" title="Editar">
                      <Eye className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && (
            <div className="py-16 text-center text-muted-foreground">
              <FileText className="w-10 h-10 mx-auto mb-3 opacity-20" />
              <p className="font-medium">Nenhum documento encontrado</p>
              <p className="text-sm mt-1">Crie um novo documento para começar.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}