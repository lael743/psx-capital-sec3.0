import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Save, Send, Plus, Trash2, ArrowLeft, Upload, Shield, MapPin, Monitor, Smartphone, Globe, Clock, CheckCircle, XCircle, PenLine, FileText, Ban, Download, Printer, Camera, Search, UserCircle, Briefcase, X } from 'lucide-react';
import { formatDate } from '@/lib/finance';
import ConfirmDialog from '@/components/ui/ConfirmDialog';

const DOC_TYPES = [
  { value: 'contrato', label: 'Contrato' },
  { value: 'promissoria', label: 'Nota Promissória' },
  { value: 'confissao_divida', label: 'Confissão de Dívida' },
  { value: 'cessao_credito', label: 'Cessão de Crédito' },
  { value: 'termo_garantia', label: 'Termo de Garantia' },
  { value: 'outro', label: 'Outro' },
];

export default function AssinaturaDocumentoForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = !!id;

  const [form, setForm] = useState({
    document_type: 'contrato', title: '', description: '', notes: '',
    operation_id: '', client_id: '',
  });
  const [signers, setSigners] = useState([]);
  const [newSigner, setNewSigner] = useState({ name: '', cpf_cnpj: '', phone: '', email: '' });
  const [pdfUploading, setPdfUploading] = useState(false);
  const [pdfFile, setPdfFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [assinaturas, setAssinaturas] = useState([]);
  const [documentStatus, setDocumentStatus] = useState('rascunho');
  const [documentNumber, setDocumentNumber] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);

  // Vínculos — busca de cliente e operação
  const [clients, setClients] = useState([]);
  const [operations, setOperations] = useState([]);
  const [clientQuery, setClientQuery] = useState('');
  const [clientOpen, setClientOpen] = useState(false);
  const [opQuery, setOpQuery] = useState('');
  const [opOpen, setOpOpen] = useState(false);
  const [selectedClient, setSelectedClient] = useState(null);
  const [selectedOperation, setSelectedOperation] = useState(null);

  const isReadonly = documentStatus === 'assinado' || documentStatus === 'cancelado';

  // Carrega clientes e operações para vínculo (modo criação)
  useEffect(() => {
    if (!isEdit) {
      Promise.all([
        base44.entities.Client.list('name', 200),
        base44.entities.Operation.list('-created_date', 100),
      ]).then(([cs, ops]) => {
        setClients(cs);
        setOperations(ops);
      });
    }
  }, [isEdit]);

  useEffect(() => {
    if (isEdit) {
      setLoading(true);
      Promise.all([
        base44.entities.AssinaturaDocumento.get(id),
        base44.entities.AssinaturaSignatario.filter({ document_id: id }),
        base44.entities.AssinaturaDigital.filter({ document_id: id }),
      ]).then(([doc, sigs, asss]) => {
        setForm({
          document_type: doc.document_type || 'contrato',
          title: doc.title || '',
          description: doc.description || '',
          notes: doc.notes || '',
          operation_id: doc.operation_id || '',
          client_id: doc.client_id || '',
        });
        setDocumentStatus(doc.status || 'rascunho');
        setDocumentNumber(doc.document_number || '');
        if (doc.pdf_file) setPdfFile({ url: doc.pdf_file, name: 'PDF atual' });
        setSigners(sigs);
        setAssinaturas(asss);
        setLoading(false);
      });
    }
  }, [id]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handlePdfUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPdfUploading(true);
    const result = await base44.integrations.Core.UploadFile({ file });
    setPdfFile({ url: result.file_url, name: file.name });
    setPdfUploading(false);
  };

  const addSigner = () => {
    if (!newSigner.name || !newSigner.cpf_cnpj) return;
    setSigners(s => [...s, { ...newSigner, _temp: Date.now() }]);
    setNewSigner({ name: '', cpf_cnpj: '', phone: '', email: '' });
  };

  const removeSigner = (idx) => setSigners(s => s.filter((_, i) => i !== idx));

  const handleSelectClient = (client) => {
    setSelectedClient(client);
    setClientQuery(client.name);
    setClientOpen(false);
    set('client_id', client.id);
    // Preenche o formulário do novo signatário com dados do cliente
    setNewSigner({
      name: client.name || '',
      cpf_cnpj: client.document || '',
      phone: client.whatsapp || client.phone || '',
      email: client.email || '',
      address: client.address || '',
      city: client.city || '',
      state: client.state || '',
      zip_code: client.zip_code || '',
      birth_date: '',
    });
  };

  const handleSelectOperation = (op) => {
    setSelectedOperation(op);
    setOpQuery(`${op.client_name || ''} - ${op.type || ''}`);
    setOpOpen(false);
    set('operation_id', op.id);
    // Preenche título se vazio
    if (!form.title) {
      set('title', `Documento - ${op.client_name || 'Operação'} - ${op.type || ''}`);
    }
    // Puxa PDF da operação se disponível
    if (!pdfFile) {
      const opPdf = op.contract_url || op.signed_contract_url;
      if (opPdf) {
        setPdfFile({ url: opPdf, name: `Documento_Operacao_${op.id}` });
      }
    }
  };

  const handleCancel = async () => {
    setCancelling(true);
    await base44.entities.AssinaturaDocumento.update(id, { status: 'cancelado' });
    // Atualiza todas as assinaturas pendentes para expirado
    for (const ass of assinaturas) {
      if (ass.status === 'pendente') {
        await base44.entities.AssinaturaDigital.update(ass.id, { status: 'expirado' });
      }
    }
    setDocumentStatus('cancelado');
    setCancelling(false);
    const asss = await base44.entities.AssinaturaDigital.filter({ document_id: id });
    setAssinaturas(asss);
  };

  const exportarEvidencias = () => {
    const doc = { ...form, status: documentStatus };
    const signersHtml = signers.map(s => `
      <tr>
        <td style="font-weight:bold">${s.name}</td>
        <td>${s.cpf_cnpj || ''}</td>
        <td>${s.email || ''}</td>
        <td>${s.phone || ''}</td>
      </tr>`).join('');

    const assinaturasHtml = assinaturas.map(ass => {
      const signer = signers.find(s => s.id === ass.signer_id);
      const signerName = signer?.name || ass.signer_id;
      return `
        <div style="border:1px solid #ddd;padding:12px;margin-bottom:12px;border-radius:8px">
          <h3 style="margin:0 0 8px">${signerName} — ${ass.status === 'concluido' ? 'Assinado' : ass.status}</h3>
          ${ass.signed_at ? `<p><strong>Data:</strong> ${ass.signed_at}</p>` : ''}
          ${ass.ip_address ? `<p><strong>IP:</strong> ${ass.ip_address}</p>` : ''}
          ${ass.device_type ? `<p><strong>Dispositivo:</strong> ${ass.device_type}</p>` : ''}
          ${ass.browser ? `<p><strong>Navegador:</strong> ${ass.browser}</p>` : ''}
          ${ass.operating_system ? `<p><strong>Sistema:</strong> ${ass.operating_system}</p>` : ''}
          ${ass.screen_resolution ? `<p><strong>Tela:</strong> ${ass.screen_resolution}</p>` : ''}
          ${ass.language ? `<p><strong>Idioma:</strong> ${ass.language}</p>` : ''}
          ${ass.latitude ? `<p><strong>GPS:</strong> ${ass.latitude}, ${ass.longitude} (precisão: ${ass.gps_accuracy}m)</p>` : ''}
          ${ass.otp_validated ? `<p><strong>Identidade validada via código de segurança</strong> em ${ass.otp_validated_at || ''}</p>` : ''}
          ${ass.document_hash_at_signature ? `<p><strong>Hash SHA-256:</strong> <code>${ass.document_hash_at_signature}</code></p>` : ''}
          ${ass.certificate_pdf ? `<p><strong>Certificado:</strong> <a href="${ass.certificate_pdf}">${ass.certificate_pdf}</a></p>` : ''}
          ${ass.signature_image ? `<div style="text-align:center;margin-top:8px"><img src="${ass.signature_image}" style="max-height:120px;border:1px solid #ddd" /></div>` : ''}
          ${ass.selfie_image ? `<div style="text-align:center;margin-top:8px"><strong>Selfie:</strong><br><img src="${ass.selfie_image}" style="max-height:160px;border:1px solid #ddd;border-radius:8px" /></div>` : ''}
        </div>`;
    }).join('');

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Evidências de Assinatura — ${doc.title}</title>
      <style>body{font-family:sans-serif;max-width:800px;margin:40px auto;color:#222;font-size:14px}
      h1{font-size:20px;margin-bottom:4px}h2{font-size:15px;color:#666;margin-top:0}
      h3{font-size:14px}table{width:100%;border-collapse:collapse;margin:16px 0}
      td,th{border:1px solid #ddd;padding:6px 10px;text-align:left;font-size:13px}
      code{font-size:11px;word-break:break-all}
      @media print{body{margin:20px}}</style></head><body>
      <h1>Evidências de Assinatura</h1><h2>${doc.title} — ${DOC_TYPES.find(t=>t.value===doc.document_type)?.label || doc.document_type}</h2>
      <p><strong>Número:</strong> ${documentNumber || '—'} &nbsp;|&nbsp; <strong>Status:</strong> ${doc.status} &nbsp;|&nbsp; <strong>Data exportação:</strong> ${new Date().toLocaleString('pt-BR')}</p>
      <h3>Signatários</h3><table><thead><tr><th>Nome</th><th>CPF/CNPJ</th><th>E-mail</th><th>Telefone</th></tr></thead><tbody>${signersHtml}</tbody></table>
      <h3>Registros de Assinatura</h3>${assinaturasHtml}
      </body></html>`;

    const blob = new Blob([html], { type: 'text/html;charset=UTF-8' });
    const url = URL.createObjectURL(blob);
    const w = window.open(url, '_blank');
    if (w) w.onload = () => URL.revokeObjectURL(url);
  };

  const save = async (sendAfter = false) => {
    setSaving(true);
    const payload = {
      ...form,
      pdf_file: pdfFile?.url || '',
    };

    let docId = id;
    if (isEdit) {
      await base44.entities.AssinaturaDocumento.update(id, payload);
    } else {
      const created = await base44.entities.AssinaturaDocumento.create({ ...payload, status: 'rascunho' });
      docId = created.id;
    }

    // Salvamos signatários novos (sem ID) e mantemos os existentes
    if (docId) {
      const existingSigners = signers.filter(s => s.id);
      const newSigners = signers.filter(s => !s.id);

      // Remove signers que foram deletados (no modo edição)
      if (isEdit) {
        const currentSigners = await base44.entities.AssinaturaSignatario.filter({ document_id: docId });
        const keptIds = existingSigners.map(s => s.id);
        for (const cs of currentSigners) {
          if (!keptIds.includes(cs.id)) {
            await base44.entities.AssinaturaSignatario.delete(cs.id);
          }
        }
      }

      // Cria novos signatários
      for (const ns of newSigners) {
        await base44.entities.AssinaturaSignatario.create({
          document_id: docId,
          document_title: form.title,
          name: ns.name,
          cpf_cnpj: ns.cpf_cnpj,
          phone: ns.phone || '',
          email: ns.email || '',
          birth_date: ns.birth_date || '',
          address: ns.address || '',
          city: ns.city || '',
          state: ns.state || '',
          zip_code: ns.zip_code || '',
        });
      }

      if (sendAfter) {
        await base44.functions.invoke('gerarLinkAssinatura', { document_id: docId });
      }
    }

    setSaving(false);
    if (sendAfter) {
      navigate('/assinaturas');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-border border-t-foreground rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto">
      <button onClick={() => navigate('/assinaturas')}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4">
        <ArrowLeft className="w-4 h-4" /> Voltar
      </button>

      <div className="flex flex-wrap items-center gap-3 mb-6">
        <h1 className="text-2xl font-bold">
          {!isEdit ? 'Novo Documento para Assinatura' 
            : isReadonly ? 'Visualizar Documento' 
            : 'Editar Documento'}
        </h1>
        {isEdit && (
          <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
            documentStatus === 'assinado' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
            documentStatus === 'aguardando_assinatura' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
            documentStatus === 'cancelado' ? 'bg-red-50 text-red-700 border border-red-200' :
            documentStatus === 'rascunho' ? 'bg-gray-100 text-gray-600 border border-gray-200' :
            'bg-gray-100 text-gray-600 border border-gray-200'
          }`}>
            {documentStatus === 'aguardando_assinatura' ? 'Aguardando Assinatura' :
             documentStatus === 'assinado' ? 'Assinado' :
             documentStatus === 'cancelado' ? 'Cancelado' :
             documentStatus === 'rascunho' ? 'Rascunho' : documentStatus}
          </span>
        )}
        {isEdit && documentNumber && (
          <span className="text-xs text-muted-foreground font-mono">{documentNumber}</span>
        )}
      </div>

      <div className="space-y-6">
        {/* Vínculos — Cliente e Operação */}
        {!isEdit && (
          <div className="bg-white border border-border rounded-xl p-5 space-y-4">
            <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Vínculos</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Buscar Cliente */}
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Cliente</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                  <input
                    className="input-field pl-9 pr-8"
                    placeholder="Buscar por nome ou CPF/CNPJ..."
                    value={clientQuery}
                    onChange={e => { setClientQuery(e.target.value); setClientOpen(true); if (!e.target.value) { setSelectedClient(null); set('client_id', ''); } }}
                    onFocus={() => setClientOpen(true)}
                    onBlur={() => setTimeout(() => setClientOpen(false), 200)}
                    autoComplete="off"
                  />
                  {selectedClient && (
                    <button onClick={() => { setSelectedClient(null); setClientQuery(''); set('client_id', ''); }}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
                {clientOpen && clientQuery && (
                  <div className="relative z-40">
                    <div className="absolute top-0 w-full bg-white border border-border rounded-xl shadow-lg max-h-56 overflow-y-auto">
                      {clients
                        .filter(c => c.name.toLowerCase().includes(clientQuery.toLowerCase()) || c.document?.includes(clientQuery))
                        .slice(0, 8)
                        .map(c => (
                          <button key={c.id} type="button"
                            className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-gray-50 border-b border-border/50 last:border-0"
                            onMouseDown={() => handleSelectClient(c)}>
                            <UserCircle className="w-4 h-4 text-muted-foreground shrink-0" />
                            <div className="min-w-0">
                              <div className="text-sm font-medium truncate">{c.name}</div>
                              <div className="text-xs text-muted-foreground">{c.document}{c.phone ? ` · ${c.phone}` : ''}</div>
                            </div>
                          </button>
                        ))}
                      {clientQuery && clients.filter(c => c.name.toLowerCase().includes(clientQuery.toLowerCase()) || c.document?.includes(clientQuery)).length === 0 && (
                        <div className="p-3 text-xs text-muted-foreground text-center">Nenhum cliente encontrado</div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Buscar Operação */}
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Operação</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                  <input
                    className="input-field pl-9 pr-8"
                    placeholder="Buscar por cliente ou tipo..."
                    value={opQuery}
                    onChange={e => { setOpQuery(e.target.value); setOpOpen(true); if (!e.target.value) { setSelectedOperation(null); set('operation_id', ''); } }}
                    onFocus={() => setOpOpen(true)}
                    onBlur={() => setTimeout(() => setOpOpen(false), 200)}
                    autoComplete="off"
                  />
                  {selectedOperation && (
                    <button onClick={() => { setSelectedOperation(null); setOpQuery(''); set('operation_id', ''); }}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
                {opOpen && opQuery && (
                  <div className="relative z-40">
                    <div className="absolute top-0 w-full bg-white border border-border rounded-xl shadow-lg max-h-56 overflow-y-auto">
                      {operations
                        .filter(op => (op.client_name || '').toLowerCase().includes(opQuery.toLowerCase()) || (op.type || '').toLowerCase().includes(opQuery.toLowerCase()) || op.id?.includes(opQuery))
                        .slice(0, 8)
                        .map(op => (
                          <button key={op.id} type="button"
                            className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-gray-50 border-b border-border/50 last:border-0"
                            onMouseDown={() => handleSelectOperation(op)}>
                            <Briefcase className="w-4 h-4 text-muted-foreground shrink-0" />
                            <div className="min-w-0">
                              <div className="text-sm font-medium truncate">{op.client_name || 'Sem cliente'}</div>
                              <div className="text-xs text-muted-foreground">{op.type} · R$ {(op.gross_value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                            </div>
                          </button>
                        ))}
                      {opQuery && operations.filter(op => (op.client_name || '').toLowerCase().includes(opQuery.toLowerCase()) || (op.type || '').toLowerCase().includes(opQuery.toLowerCase())).length === 0 && (
                        <div className="p-3 text-xs text-muted-foreground text-center">Nenhuma operação encontrada</div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Dados do documento */}
        <div className="bg-white border border-border rounded-xl p-5 space-y-4">
          <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Documento</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Tipo *</label>
              <select className="input-field" value={form.document_type} onChange={e => set('document_type', e.target.value)} disabled={isReadonly}>
                {DOC_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Título *</label>
              <input className="input-field" value={form.title} onChange={e => set('title', e.target.value)}
                placeholder="Ex: Contrato de Cessão de Crédito" disabled={isReadonly} />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Descrição</label>
              <textarea className="input-field" rows={2} value={form.description}
                onChange={e => set('description', e.target.value)} placeholder="Detalhes sobre o documento..." disabled={isReadonly} />
            </div>
          </div>

          {/* Upload PDF */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Arquivo PDF</label>
            {pdfFile ? (
              <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                <span className="text-sm text-emerald-700 flex-1 truncate">{pdfFile.name}</span>
                {!isReadonly && <button onClick={() => setPdfFile(null)} className="text-xs text-red-500 hover:text-red-700">Remover</button>}
              </div>
            ) : !isReadonly ? (
              <label className="flex items-center justify-center gap-2 border-2 border-dashed border-border rounded-xl p-6 cursor-pointer hover:bg-gray-50 transition-colors">
                <Upload className="w-5 h-5 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">{pdfUploading ? 'Enviando...' : 'Clique para enviar PDF'}</span>
                <input type="file" accept=".pdf" onChange={handlePdfUpload} className="hidden" disabled={pdfUploading} />
              </label>
            ) : (
              <div className="text-sm text-muted-foreground italic py-2">Nenhum PDF anexado</div>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Observações internas</label>
            <textarea className="input-field" rows={2} value={form.notes}
              onChange={e => set('notes', e.target.value)} placeholder="Anotações internas..." disabled={isReadonly} />
          </div>
        </div>

        {/* Signatários */}
        <div className="bg-white border border-border rounded-xl p-5 space-y-4">
          <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Signatários</h2>

          {signers.map((s, i) => (
            <div key={s.id || s._temp} className="flex items-center gap-3 bg-gray-50 rounded-lg px-3 py-2">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{s.name}</div>
                <div className="text-xs text-muted-foreground">{s.cpf_cnpj}{s.email ? ` · ${s.email}` : ''}{s.phone ? ` · ${s.phone}` : ''}</div>
              </div>
              {!s.id && !isReadonly && <button onClick={() => removeSigner(i)} className="text-red-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>}
            </div>
          ))}
          {signers.length === 0 && isReadonly && (
            <p className="text-sm text-muted-foreground italic">Nenhum signatário cadastrado.</p>
          )}

          {/* Adicionar novo signatário */}
          {!isReadonly && (
          <div className="border border-border rounded-lg p-4 space-y-3">
            <div className="text-xs font-semibold text-muted-foreground">Novo Signatário</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Nome *</label>
                <input className="input-field" value={newSigner.name} onChange={e => setNewSigner(s => ({ ...s, name: e.target.value }))}
                  placeholder="Nome completo" />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">CPF/CNPJ *</label>
                <input className="input-field" value={newSigner.cpf_cnpj} onChange={e => setNewSigner(s => ({ ...s, cpf_cnpj: e.target.value }))}
                  placeholder="000.000.000-00" />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">WhatsApp</label>
                <input className="input-field" value={newSigner.phone} onChange={e => setNewSigner(s => ({ ...s, phone: e.target.value }))}
                  placeholder="(00) 00000-0000" />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">E-mail</label>
                <input className="input-field" value={newSigner.email} onChange={e => setNewSigner(s => ({ ...s, email: e.target.value }))}
                  placeholder="email@exemplo.com" />
              </div>
              {newSigner.address && (
                <div className="sm:col-span-2">
                  <label className="block text-xs text-muted-foreground mb-1">Endereço</label>
                  <input className="input-field" value={newSigner.address} onChange={e => setNewSigner(s => ({ ...s, address: e.target.value }))}
                    placeholder="Endereço completo" />
                </div>
              )}
              {(newSigner.city || newSigner.state) && (
                <>
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">Cidade</label>
                    <input className="input-field" value={newSigner.city} onChange={e => setNewSigner(s => ({ ...s, city: e.target.value }))} />
                  </div>
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">Estado</label>
                    <input className="input-field" value={newSigner.state} onChange={e => setNewSigner(s => ({ ...s, state: e.target.value }))} />
                  </div>
                </>
              )}
            </div>
            <button onClick={addSigner} disabled={!newSigner.name || !newSigner.cpf_cnpj}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-border rounded-lg hover:bg-gray-50 disabled:opacity-40">
              <Plus className="w-3.5 h-3.5" /> Adicionar
            </button>
          </div>
          )}
        </div>

        {/* Registros de Assinatura */}
        {isEdit && assinaturas.length > 0 && (
          <div className="bg-white border border-border rounded-xl p-5 space-y-4">
            <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <Shield className="w-4 h-4" /> Registros de Assinatura
            </h2>
            {assinaturas.map((ass, i) => {
              const signer = signers.find(s => s.id === ass.signer_id);
              const signerName = signer?.name || ass.signer_id;
              return (
                <div key={ass.id} className="border border-border rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold">{signerName}</span>
                      {ass.status === 'concluido' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <CheckCircle className="w-3 h-3" /> Assinado
                        </span>
                      ) : ass.status === 'pendente' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
                          <Clock className="w-3 h-3" /> Pendente
                        </span>
                      ) : ass.status === 'expirado' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-700 border border-red-200">
                          <XCircle className="w-3 h-3" /> Expirado
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600 border border-gray-200">
                          {ass.status}
                        </span>
                      )}
                    </div>
                    {ass.signed_at && (
                      <span className="text-xs text-muted-foreground">{formatDate(ass.signed_at?.split('T')[0])} às {ass.signed_at?.split('T')[1]?.slice(0, 5)}</span>
                    )}
                  </div>

                  {/* Assinatura e Selfie lado a lado */}
                  <div className="flex flex-wrap gap-3">
                    {ass.signature_image && (
                      <div className="flex-1 min-w-[180px]">
                        <div className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
                          <PenLine className="w-3 h-3" /> Assinatura
                        </div>
                        <div className="bg-gray-50 border border-border rounded-lg p-3 flex justify-center">
                          <img src={ass.signature_image} alt={`Assinatura de ${signerName}`}
                            className="max-h-32 object-contain" style={{ background: 'white' }} />
                        </div>
                      </div>
                    )}
                    {ass.selfie_image && (
                      <div className="flex-1 min-w-[140px]">
                        <div className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
                          <Camera className="w-3 h-3" /> Selfie
                        </div>
                        <div className="bg-gray-50 border border-border rounded-lg p-2 flex justify-center">
                          <img src={ass.selfie_image} alt={`Selfie de ${signerName}`}
                            className="max-h-32 rounded-lg object-contain" />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Dados técnicos e evidências */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                    {ass.ip_address && (
                      <div className="bg-gray-50 rounded-lg p-2.5">
                        <div className="text-muted-foreground flex items-center gap-1 mb-0.5"><Globe className="w-3 h-3" /> IP</div>
                        <div className="font-mono font-medium">{ass.ip_address}</div>
                      </div>
                    )}
                    {ass.device_type && (
                      <div className="bg-gray-50 rounded-lg p-2.5">
                        <div className="text-muted-foreground flex items-center gap-1 mb-0.5"><Smartphone className="w-3 h-3" /> Dispositivo</div>
                        <div className="font-medium capitalize">{ass.device_type}</div>
                      </div>
                    )}
                    {ass.browser && (
                      <div className="bg-gray-50 rounded-lg p-2.5">
                        <div className="text-muted-foreground flex items-center gap-1 mb-0.5"><Monitor className="w-3 h-3" /> Navegador</div>
                        <div className="font-medium">{ass.browser}</div>
                      </div>
                    )}
                    {ass.operating_system && (
                      <div className="bg-gray-50 rounded-lg p-2.5">
                        <div className="text-muted-foreground flex items-center gap-1 mb-0.5"><Monitor className="w-3 h-3" /> Sistema</div>
                        <div className="font-medium">{ass.operating_system}</div>
                      </div>
                    )}
                    {ass.screen_resolution && (
                      <div className="bg-gray-50 rounded-lg p-2.5">
                        <div className="text-muted-foreground flex items-center gap-1 mb-0.5"><Monitor className="w-3 h-3" /> Tela</div>
                        <div className="font-medium">{ass.screen_resolution}</div>
                      </div>
                    )}
                    {ass.language && (
                      <div className="bg-gray-50 rounded-lg p-2.5">
                        <div className="text-muted-foreground flex items-center gap-1 mb-0.5"><Globe className="w-3 h-3" /> Idioma</div>
                        <div className="font-medium">{ass.language}</div>
                      </div>
                    )}
                    {(ass.latitude || ass.longitude) && (
                      <div className="bg-gray-50 rounded-lg p-2.5 sm:col-span-2">
                        <div className="text-muted-foreground flex items-center gap-1 mb-0.5"><MapPin className="w-3 h-3" /> Localização GPS</div>
                        <div className="font-mono font-medium">
                          {ass.latitude}, {ass.longitude}
                          {ass.gps_accuracy && <span className="text-muted-foreground ml-1">(precisão: {ass.gps_accuracy}m)</span>}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* OTP */}
                  {ass.otp_validated && (
                    <div className="flex items-center gap-2 text-xs text-emerald-600 bg-emerald-50 rounded-lg px-3 py-1.5">
                      <Shield className="w-3 h-3" /> Identidade validada via código de segurança
                      {ass.otp_validated_at && <span className="text-muted-foreground">em {formatDate(ass.otp_validated_at?.split('T')[0])} às {ass.otp_validated_at?.split('T')[1]?.slice(0, 5)}</span>}
                    </div>
                  )}

                  {/* Hash e Certificado */}
                  <div className="flex flex-wrap gap-2 text-xs">
                    {ass.document_hash_at_signature && (
                      <div className="bg-gray-50 rounded-lg px-3 py-1.5 flex-1 min-w-0">
                        <span className="text-muted-foreground">Hash:</span>{' '}
                        <code className="font-mono text-foreground break-all">{ass.document_hash_at_signature}</code>
                      </div>
                    )}
                    {ass.certificate_pdf && (
                      <a href={ass.certificate_pdf} target="_blank" rel="noopener"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-foreground text-white rounded-lg hover:bg-foreground/90">
                        <FileText className="w-3 h-3" /> Certificado PDF
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Ações */}
        {isReadonly ? (
          <div className="flex flex-wrap justify-between gap-3">
            <button onClick={() => navigate('/assinaturas')}
              className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-gray-50">
              <ArrowLeft className="w-3.5 h-3.5 inline mr-1.5" /> Voltar
            </button>
            <div className="flex gap-2">
              {documentStatus === 'assinado' && (
                <ConfirmDialog
                  open={confirmCancelOpen}
                  title="Cancelar Documento Assinado"
                  message={`Deseja realmente cancelar "${form.title}"? Os links de assinatura serão invalidados e as assinaturas pendentes serão marcadas como expiradas.`}
                  variant="danger"
                  confirmLabel="Sim, Cancelar Documento"
                  onConfirm={handleCancel}
                  onCancel={() => setConfirmCancelOpen(false)}
                />
              )}
              {documentStatus === 'assinado' ? (
                <button onClick={() => setConfirmCancelOpen(true)} disabled={cancelling}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-semibold border border-red-200 text-red-600 rounded-lg hover:bg-red-50 disabled:opacity-50">
                  <Ban className="w-3.5 h-3.5" /> {cancelling ? 'Cancelando...' : 'Cancelar Documento'}
                </button>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-3 py-2 text-xs text-muted-foreground bg-gray-50 rounded-lg">
                  <XCircle className="w-3.5 h-3.5" /> Documento cancelado
                </span>
              )}
              {assinaturas.some(a => a.status === 'concluido') && (
                <button onClick={exportarEvidencias}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-foreground text-white rounded-lg hover:bg-foreground/90">
                  <Download className="w-3.5 h-3.5" /> Exportar Evidências
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="flex justify-between gap-3">
            <button onClick={() => navigate('/assinaturas')}
              className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-gray-50">Cancelar</button>
            <div className="flex gap-2">
              <button onClick={() => save(false)} disabled={saving || !form.title}
                className="flex items-center gap-2 px-4 py-2 text-sm border border-border rounded-lg hover:bg-gray-50 disabled:opacity-50">
                <Save className="w-3.5 h-3.5" /> Salvar Rascunho
              </button>
              <button onClick={() => save(true)} disabled={saving || !form.title || signers.length === 0}
                className="flex items-center gap-2 px-5 py-2 bg-foreground text-white text-sm font-semibold rounded-lg hover:bg-foreground/90 disabled:opacity-50">
                <Send className="w-3.5 h-3.5" /> Salvar e Enviar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}