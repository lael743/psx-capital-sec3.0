import { useEffect, useState, useMemo, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Lock, Plus, Send, FileText, CheckCircle, Clock, X, MessageCircle, Copy, ExternalLink, Trash2, UserPlus, Eye, Download } from 'lucide-react';
import DocumentoPreviewModal from '@/components/assinatura/DocumentoPreviewModal';
import BaixarTodosDocumentos from '@/components/assinatura/BaixarTodosDocumentos';
import BaixarDocumentoIndividual from '@/components/assinatura/BaixarDocumentoIndividual';
import { formatCurrency, formatDate } from '@/lib/finance';
import { getStageIndex } from '@/lib/operationWorkflow';
import { logAction } from '@/lib/audit';

const DOCUMENTOS_AUTO = [
  { title: 'Dados da Operação', type: 'outro' },
  { title: 'Borderô', type: 'outro' },
  { title: 'Aditivo', type: 'outro' },
  { title: 'Nota Promissória', type: 'promissoria' },
];

const STATUS_CONFIG = {
  rascunho: { label: 'Rascunho', cls: 'bg-gray-100 text-gray-600' },
  aguardando_assinatura: { label: 'Aguardando', cls: 'bg-amber-50 text-amber-700' },
  assinado: { label: 'Assinado', cls: 'bg-emerald-50 text-emerald-700' },
  cancelado: { label: 'Cancelado', cls: 'bg-red-50 text-red-700' },
  recusado: { label: 'Recusado', cls: 'bg-red-50 text-red-700' },
};

export default function AssinaturaColetaPanel({ operacao, client, onUpdate }) {
  const [documents, setDocuments] = useState([]);
  const [signersMap, setSignersMap] = useState({});
  const [assinaturasMap, setAssinaturasMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [showAddSigner, setShowAddSigner] = useState(false);
  const [coletando, setColetando] = useState(false);
  const [coletaResults, setColetaResults] = useState(null);
  const [newSigner, setNewSigner] = useState({ name: '', cpf_cnpj: '', phone: '', email: '', role: '' });
  const [previewDoc, setPreviewDoc] = useState(null);

  const etapa = operacao?.etapa || 'rascunho';
  const isLocked = getStageIndex(etapa) < getStageIndex('assinatura');
  const canManage = etapa === 'assinatura';

  const load = useCallback(async () => {
    if (!operacao?.id) return;
    setLoading(true);
    try {
      let docs = await base44.entities.AssinaturaDocumento.filter({ operation_id: operacao.id });

      // Auto-create missing documents when unlocked
      if (!isLocked) {
        const existingTitles = docs.map(d => d.title);
        const toCreate = DOCUMENTOS_AUTO.filter(d => !existingTitles.includes(d.title));
        if (toCreate.length > 0) {
          for (const doc of toCreate) {
            await base44.entities.AssinaturaDocumento.create({
              title: doc.title,
              document_type: doc.type,
              operation_id: operacao.id,
              client_id: operacao.client_id,
              status: 'rascunho',
            });
          }
          docs = await base44.entities.AssinaturaDocumento.filter({ operation_id: operacao.id });
        }
      }
      setDocuments(docs);

      // Load signers and assinaturas for each document
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

      // Auto-seed cedente as first signer when no signers exist and client data is available
      if (!isLocked && docs.length > 0 && client && Object.values(sigMap).flat().length === 0) {
        const cedenteSigner = {
          name: client.name || '',
          cpf_cnpj: client.document || '',
          phone: client.whatsapp || client.phone || '',
          email: client.email || '',
          role: 'Cedente',
        };
        if (cedenteSigner.name && cedenteSigner.cpf_cnpj) {
          for (const doc of docs) {
            await base44.entities.AssinaturaSignatario.create({
              document_id: doc.id,
              document_title: doc.title,
              ...cedenteSigner,
            });
          }
          await logAction({ action: 'add_signatario', entity: 'Operation', entityId: operacao.id, description: `Cedente pré-adicionado como signatário: ${cedenteSigner.name}` });
        }
      }

      // Auto-seed sacado as signer for boleto operations (devedor cedido)
      if (!isLocked && docs.length > 0 && operacao?.type === 'boleto' && operacao?.sacado_id) {
        const allSigs = Object.values(sigMap).flat();
        const hasSacado = allSigs.some(s => s.role === 'Sacado' || s.role === 'Devedor Cedido' || (s.cpf_cnpj && operacao.sacado_name && s.name?.toUpperCase() === operacao.sacado_name?.toUpperCase()));
        if (!hasSacado) {
          try {
            const sacado = await base44.entities.Sacado.get(operacao.sacado_id);
            if (sacado?.nome && sacado?.document) {
              const sacadoSigner = {
                name: sacado.nome,
                cpf_cnpj: sacado.document,
                phone: sacado.phone || '',
                email: sacado.email || '',
                role: 'Sacado/Devedor Cedido',
              };
              for (const doc of docs) {
                await base44.entities.AssinaturaSignatario.create({
                  document_id: doc.id,
                  document_title: doc.title,
                  ...sacadoSigner,
                });
              }
              await logAction({ action: 'add_signatario', entity: 'Operation', entityId: operacao.id, description: `Sacado pré-adicionado como signatário: ${sacadoSigner.name}` });
            }
          } catch (e) {
            console.error('Erro ao auto-adicionar sacado:', e);
          }
        }
      }

      // Reload signers after auto-seeding (cedente + sacado)
      if (!isLocked && docs.length > 0) {
        for (const doc of docs) {
          sigMap[doc.id] = await base44.entities.AssinaturaSignatario.filter({ document_id: doc.id });
        }
      }

      setSignersMap(sigMap);
      setAssinaturasMap(assMap);
    } catch (e) {
      console.error('Erro ao carregar assinaturas:', e);
    }
    setLoading(false);
  }, [operacao?.id, isLocked]);

  useEffect(() => { load(); }, [load]);

  // Unique signers grouped by name+cpf
  const uniqueSigners = useMemo(() => {
    const allSigs = Object.values(signersMap).flat();
    const map = {};
    allSigs.forEach(s => {
      const key = `${s.name}|${s.cpf_cnpj}`;
      if (!map[key]) map[key] = s;
    });
    return Object.values(map);
  }, [signersMap]);

  const addSigner = async () => {
    if (!newSigner.name || !newSigner.cpf_cnpj) return;
    for (const doc of documents) {
      await base44.entities.AssinaturaSignatario.create({
        document_id: doc.id,
        document_title: doc.title,
        name: newSigner.name,
        cpf_cnpj: newSigner.cpf_cnpj,
        phone: newSigner.phone,
        email: newSigner.email,
        role: newSigner.role,
      });
    }
    await logAction({ action: 'add_signatario', entity: 'Operation', entityId: operacao.id, description: `Signatário adicionado: ${newSigner.name} (${newSigner.role || 'Sem função'})` });
    setNewSigner({ name: '', cpf_cnpj: '', phone: '', email: '', role: '' });
    setShowAddSigner(false);
    load();
  };

  const removeSigner = async (signer) => {
    for (const doc of documents) {
      const sigs = signersMap[doc.id] || [];
      for (const s of sigs) {
        if (s.name === signer.name && s.cpf_cnpj === signer.cpf_cnpj) {
          await base44.entities.AssinaturaSignatario.delete(s.id);
        }
      }
    }
    load();
  };

  const iniciarColeta = async () => {
    if (uniqueSigners.length === 0) return;
    setColetando(true);
    try {
      const res = await base44.functions.invoke('gerarLinkAssinatura', { operation_id: operacao.id });
      setColetaResults({ links: res.data.signer_links, expires_at: res.data.link_expires_at, operation_numero: res.data.operation_numero });
      await logAction({ action: 'iniciar_coleta', entity: 'Operation', entityId: operacao.id, description: 'Coleta de assinaturas iniciada (link único)' });
    } catch (e) {
      setColetaResults({ error: e.message });
    }
    setColetando(false);
    load();
  };

  // LOCKED STATE
  if (isLocked) {
    return (
      <div className="border-2 border-dashed border-gray-300 rounded-xl p-12 text-center bg-gray-50/50">
        <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
          <Lock className="w-6 h-6 text-gray-400" />
        </div>
        <h3 className="text-sm font-bold text-gray-700">Acesso Restrito</h3>
        <p className="text-sm text-gray-500 mt-1 max-w-sm mx-auto">
          As assinaturas estarão disponíveis apenas após a etapa de Formalização.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="w-6 h-6 border-2 border-border border-t-foreground rounded-full animate-spin" />
      </div>
    );
  }

  const allAssinado = documents.length > 0 && documents.every(d => d.status === 'assinado');

  return (
    <div className="space-y-5">
      {/* Preview Modal */}
      {previewDoc && (
        <DocumentoPreviewModal
          doc={previewDoc}
          assinaturas={assinaturasMap[previewDoc.id] || []}
          signatarios={signersMap[previewDoc.id] || []}
          allDocuments={documents}
          onClose={() => setPreviewDoc(null)}
        />
      )}

      {/* Header */}
      <div>
        <h2 className="text-base font-bold">Preparação da coleta de assinaturas</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Revise os signatários e valide se as informações estão corretas para iniciar a coleta.
        </p>
      </div>

      {/* Documents */}
      <div className="bg-white border border-border rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Documentos Gerados</h3>
          {documents.length > 0 && (
            <BaixarTodosDocumentos operacao={operacao} documents={documents} />
          )}
        </div>
        <div className="space-y-2">
          {documents.map(doc => {
            const sigs = signersMap[doc.id] || [];
            const asss = assinaturasMap[doc.id] || [];
            const signedCount = asss.filter(a => a.status === 'concluido').length;
            const cfg = STATUS_CONFIG[doc.status] || STATUS_CONFIG.rascunho;
            return (
              <div key={doc.id} className="flex items-center justify-between border border-border rounded-lg px-3 py-2.5">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center shrink-0">
                    <FileText className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">{doc.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {sigs.length} signatário{sigs.length !== 1 ? 's' : ''}
                      {asss.length > 0 && ` · ${signedCount}/${asss.length} assinado${signedCount !== 1 ? 's' : ''}`}
                      {doc.document_number && ` · ${doc.document_number}`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${cfg.cls}`}>{cfg.label}</span>
                  <BaixarDocumentoIndividual operacao={operacao} doc={doc} />
                  <button
                    onClick={() => setPreviewDoc(doc)}
                    className="p-1.5 rounded-lg hover:bg-gray-100 text-muted-foreground"
                    title="Visualizar documento"
                  >
                    <Eye className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
          {documents.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">Nenhum documento gerado.</p>
          )}
        </div>
      </div>

      {/* Signers */}
      <div className="bg-white border border-border rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Signatários</h3>
          {canManage && (
            <button
              onClick={() => setShowAddSigner(!showAddSigner)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> Adicionar Signatário
            </button>
          )}
        </div>

        {/* Add Signer Form */}
        {showAddSigner && (
          <div className="border border-blue-200 rounded-lg p-4 mb-3 space-y-3 bg-blue-50/30">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Nome *</label>
                <input
                  className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-ring"
                  value={newSigner.name}
                  onChange={e => setNewSigner(s => ({ ...s, name: e.target.value }))}
                  placeholder="Nome completo"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">CPF/CNPJ *</label>
                <input
                  className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-ring"
                  value={newSigner.cpf_cnpj}
                  onChange={e => setNewSigner(s => ({ ...s, cpf_cnpj: e.target.value }))}
                  placeholder="000.000.000-00"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Função</label>
                <input
                  className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-ring"
                  value={newSigner.role}
                  onChange={e => setNewSigner(s => ({ ...s, role: e.target.value }))}
                  placeholder="Ex: Sacador/Avalista"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Telefone/WhatsApp</label>
                <input
                  className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-ring"
                  value={newSigner.phone}
                  onChange={e => setNewSigner(s => ({ ...s, phone: e.target.value }))}
                  placeholder="(00) 00000-0000"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-muted-foreground mb-1">E-mail</label>
                <input
                  className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-ring"
                  value={newSigner.email}
                  onChange={e => setNewSigner(s => ({ ...s, email: e.target.value }))}
                  placeholder="email@exemplo.com"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowAddSigner(false)} className="px-3 py-2 text-xs font-medium border border-border rounded-lg hover:bg-gray-50">
                Cancelar
              </button>
              <button
                onClick={addSigner}
                disabled={!newSigner.name || !newSigner.cpf_cnpj}
                className="px-3 py-2 text-xs font-semibold bg-foreground text-white rounded-lg hover:bg-foreground/90 disabled:opacity-40"
              >
                Adicionar
              </button>
            </div>
          </div>
        )}

        {/* Signer List */}
        <div className="space-y-2">
          {uniqueSigners.map((signer, i) => {
            const allAss = documents.flatMap(d => assinaturasMap[d.id] || []);
            const signerAss = allAss.find(a => {
              const sig = Object.values(signersMap).flat().find(s => s.id === a.signer_id);
              return sig && sig.name === signer.name && sig.cpf_cnpj === signer.cpf_cnpj;
            });
            const status = signerAss?.status || 'pendente';
            return (
              <div key={i} className="border border-border rounded-lg p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
                      <span className="text-xs font-bold text-blue-600">#{i + 1}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-bold">{signer.name}</p>
                        {signer.role && (
                          <span className="text-xs font-medium text-muted-foreground">• {signer.role}</span>
                        )}
                        {status === 'concluido' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700">
                            <CheckCircle className="w-3 h-3" /> Assinado
                          </span>
                        ) : status === 'pendente' && signerAss ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700">
                            <Clock className="w-3 h-3" /> Pendente
                          </span>
                        ) : null}
                      </div>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 mt-1 text-xs text-muted-foreground">
                        {signer.cpf_cnpj && <span>CPF: {signer.cpf_cnpj}</span>}
                        {signer.phone && <span>WhatsApp: {signer.phone}</span>}
                        {signer.email && <span>E-mail: {signer.email}</span>}
                      </div>
                    </div>
                  </div>
                  {canManage && !signerAss && (
                    <button
                      onClick={() => removeSigner(signer)}
                      className="p-1.5 rounded-lg text-red-400 hover:bg-red-50 transition-colors shrink-0"
                      title="Remover signatário"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          {uniqueSigners.length === 0 && (
            <div className="text-center py-8">
              <UserPlus className="w-8 h-8 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Nenhum signatário adicionado.</p>
            </div>
          )}
        </div>
      </div>

      {/* Helper Box */}
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
        <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">Revise a operação antes de disparar a coleta</h4>
        <div className="space-y-1.5 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">Etapa atual:</span><span className="font-medium capitalize">{etapa.replace('_', ' ')}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Validade do link:</span><span className="font-medium">30 dias após a geração</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Signatários:</span><span className="font-medium">{uniqueSigners.length}</span></div>
        </div>
        {uniqueSigners.length > 0 && (
          <div className="mt-3 pt-3 border-t border-gray-200">
            <p className="text-xs text-muted-foreground">
              <strong>Fluxo unificado:</strong> Cada signatário recebe <strong>um único link</strong> que assina todos os {documents.length} documentos com <strong>uma única biometria</strong> (selfie). O cedente visualiza o resumo da operação e clica em "Tirar selfie" para assinar tudo.
            </p>
            <p className="text-xs text-muted-foreground mt-1.5">
              <strong>Importante:</strong> O link de assinatura é enviado via WhatsApp. Verifique se o número de telefone está correto.
            </p>
          </div>
        )}
      </div>

      {/* CTA Card */}
      {canManage && !allAssinado && (
        <div className="bg-blue-600 text-white rounded-xl p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-blue-100 mb-1">Ação Principal</p>
              <h3 className="text-base font-bold">Tudo pronto para iniciar</h3>
              <p className="text-sm text-blue-100 mt-1">
                {uniqueSigners.length > 0
                  ? 'Os signatários estão válidos e a ordem está definida. Você já pode disparar.'
                  : 'Adicione pelo menos um signatário para iniciar a coleta.'}
              </p>
            </div>
            <button
              onClick={iniciarColeta}
              disabled={coletando || uniqueSigners.length === 0}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-white text-blue-700 text-sm font-bold rounded-lg hover:bg-blue-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
            >
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
            <button onClick={() => setColetaResults(null)} className="p-1 rounded hover:bg-gray-100">
              <X className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
          </div>
          {coletaResults.error ? (
            <p className="text-xs text-red-600">Erro: {coletaResults.error}</p>
          ) : (
            <div className="space-y-3">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-blue-600 shrink-0" />
                <p className="text-xs text-blue-800">
                  <strong>Link único gerado!</strong> Cada signatário recebe um único link que assina todos os {documents.length} documentos com uma biometria.
                </p>
              </div>
              {coletaResults.links?.map((link, j) => {
                const signUrl = `${window.location.origin}/assinar/${link.public_link}`;
                const opNum = coletaResults.operation_numero ? String(coletaResults.operation_numero).padStart(6, '0') : '';
                const waMsg = encodeURIComponent(
                  `Olá ${link.signer_name}! Você tem documentos para assinar digitalmente.\n\n Formalização Operação ${opNum}\n Link único: ${signUrl}\n\n O link expira em 2 dias.`
                );
                return (
                  <div key={j} className="border border-border rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold">{link.signer_name}</p>
                        <p className="text-xs text-muted-foreground">{link.doc_count} documento{link.doc_count !== 1 ? 's' : ''} · 1 link · 1 biometria</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <code className="text-xs bg-gray-50 border border-border rounded px-2 py-1 flex-1 truncate">{signUrl}</code>
                      <button
                        onClick={() => navigator.clipboard.writeText(signUrl)}
                        className="p-1.5 rounded-lg hover:bg-gray-50 border border-border text-muted-foreground"
                        title="Copiar link"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      <a
                        href={`/assinar/${link.public_link}`}
                        target="_blank"
                        rel="noopener"
                        className="p-1.5 rounded-lg hover:bg-gray-50 border border-border text-muted-foreground"
                        title="Abrir link"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                    <div className="flex items-center gap-2 pt-0.5">
                      {link.signer_phone ? (
                        <a
                          href={`https://wa.me/55${link.signer_phone.replace(/\D/g, '')}?text=${waMsg}`}
                          target="_blank"
                          rel="noopener"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-colors"
                        >
                          <MessageCircle className="w-3 h-3" /> Enviar WhatsApp
                        </a>
                      ) : (
                        <span className="text-xs text-muted-foreground italic">Sem WhatsApp cadastrado</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* All Signed Banner */}
      {allAssinado && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center gap-3">
          <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-emerald-800">Todos os documentos foram assinados</p>
            <p className="text-xs text-emerald-700">A operação está pronta para avançar para a etapa de Pagamento.</p>
          </div>
        </div>
      )}
    </div>
  );
}