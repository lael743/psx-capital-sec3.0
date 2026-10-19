import { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { Upload, FileText, Trash2, Download, Image, File, Eye } from 'lucide-react';

const CATEGORY_LABELS = {
  identidade: 'Identidade',
  comprovante_residencia: 'Comp. Residência',
  comprovante_renda: 'Comp. Renda',
  contrato: 'Contrato',
  nota_promissoria: 'Nota Promissória',
  cheque_foto: 'Foto de Cheque',
  outro: 'Outro',
};

const CATEGORY_COLORS = {
  identidade: 'bg-blue-100 text-blue-700',
  comprovante_residencia: 'bg-green-100 text-green-700',
  comprovante_renda: 'bg-purple-100 text-purple-700',
  contrato: 'bg-amber-100 text-amber-800',
  nota_promissoria: 'bg-orange-100 text-orange-700',
  cheque_foto: 'bg-teal-100 text-teal-700',
  outro: 'bg-gray-100 text-gray-600',
};

function FileIcon({ mimeType }) {
  if (mimeType?.startsWith('image/')) return <Image className="w-5 h-5 text-blue-500" />;
  if (mimeType === 'application/pdf') return <FileText className="w-5 h-5 text-red-500" />;
  return <File className="w-5 h-5 text-gray-400" />;
}

function formatBytes(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function DocumentosCliente({ clientId, clientName }) {
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [category, setCategory] = useState('outro');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  const fileRef = useRef();

  useEffect(() => {
    loadDocs();
  }, [clientId]);

  const loadDocs = () => {
    base44.entities.ClienteDocumento.filter({ client_id: clientId }, '-created_date', 50)
      .then(data => { setDocs(data); setLoading(false); });
  };

  const handleFiles = async (files) => {
    if (!files || files.length === 0) return;
    setError('');
    setUploading(true);
    try {
      const user = await base44.auth.me();
      for (const file of Array.from(files)) {
        const { file_url } = await base44.integrations.Core.UploadFile({ file });
        await base44.entities.ClienteDocumento.create({
          client_id: clientId,
          client_name: clientName,
          file_name: file.name,
          file_url,
          file_type: file.type,
          file_size: file.size,
          doc_category: category,
          description: description.trim() || undefined,
          uploaded_by: user?.email,
        });
      }
      setDescription('');
      loadDocs();
    } catch (e) {
      setError('Erro ao fazer upload. Tente novamente.');
    }
    setUploading(false);
  };

  const handleDelete = async (docId) => {
    if (!confirm('Excluir este documento?')) return;
    await base44.entities.ClienteDocumento.delete(docId);
    setDocs(ds => ds.filter(d => d.id !== docId));
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    handleFiles(e.dataTransfer.files);
  };

  return (
    <div className="space-y-4">
      {/* Upload zone */}
      <div className="bg-white border border-border rounded-xl p-4">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Enviar Documento</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Categoria</label>
            <select
              value={category}
              onChange={e => setCategory(e.target.value)}
              className="input-field text-sm"
            >
              {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Descrição (opcional)</label>
            <input
              type="text"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Ex: RG frente e verso"
              className="input-field text-sm"
            />
          </div>
        </div>

        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => !uploading && fileRef.current.click()}
          className={`relative border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${
            dragOver ? 'border-foreground bg-gray-50' : 'border-border hover:border-foreground/40 hover:bg-gray-50/50'
          } ${uploading ? 'opacity-50 cursor-wait' : ''}`}
        >
          <input
            ref={fileRef}
            type="file"
            multiple
            accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
            className="hidden"
            onChange={e => handleFiles(e.target.files)}
          />
          <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
          {uploading ? (
            <div className="flex items-center justify-center gap-2">
              <div className="w-4 h-4 border-2 border-border border-t-foreground rounded-full animate-spin" />
              <span className="text-sm text-muted-foreground">Enviando...</span>
            </div>
          ) : (
            <>
              <p className="text-sm font-medium text-foreground">Arraste arquivos aqui ou clique para selecionar</p>
              <p className="text-xs text-muted-foreground mt-1">Imagens, PDF, Word, Excel — até vários arquivos</p>
            </>
          )}
        </div>
        {error && <p className="text-xs text-red-500 mt-2">{error}</p>}
      </div>

      {/* Lista de documentos */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            {docs.length} documento{docs.length !== 1 ? 's' : ''}
          </span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-10">
            <div className="w-5 h-5 border-2 border-border border-t-foreground rounded-full animate-spin" />
          </div>
        ) : docs.length === 0 ? (
          <div className="py-10 text-center text-muted-foreground text-sm">Nenhum documento enviado ainda.</div>
        ) : (
          <div className="space-y-2">
            {docs.map(doc => (
              <div key={doc.id} className="bg-white border border-border rounded-xl p-3 flex items-center gap-3">
                <div className="shrink-0">
                  <FileIcon mimeType={doc.file_type} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium truncate">{doc.file_name}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${CATEGORY_COLORS[doc.doc_category] || CATEGORY_COLORS.outro}`}>
                      {CATEGORY_LABELS[doc.doc_category] || 'Outro'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground flex-wrap">
                    {doc.description && <span>{doc.description} ·</span>}
                    {doc.file_size && <span>{formatBytes(doc.file_size)} ·</span>}
                    <span>{new Date(doc.created_date).toLocaleDateString('pt-BR')}</span>
                    {doc.uploaded_by && <span>· {doc.uploaded_by}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <a
                    href={doc.file_url}
                    target="_blank"
                    rel="noreferrer"
                    className="p-2 rounded-lg hover:bg-gray-100 text-muted-foreground hover:text-foreground transition-colors"
                    title="Visualizar"
                  >
                    <Eye className="w-4 h-4" />
                  </a>
                  <a
                    href={doc.file_url}
                    download={doc.file_name}
                    className="p-2 rounded-lg hover:bg-gray-100 text-muted-foreground hover:text-foreground transition-colors"
                    title="Baixar"
                  >
                    <Download className="w-4 h-4" />
                  </a>
                  <button
                    onClick={() => handleDelete(doc.id)}
                    className="p-2 rounded-lg hover:bg-red-50 text-muted-foreground hover:text-red-500 transition-colors"
                    title="Excluir"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}