import { useState, useRef, useEffect } from 'react';
import { UploadCloud, FileText, X, Loader2, Paperclip, Trash2, Download } from 'lucide-react';
import { base44 } from '@/api/base44Client';

const MAX_SIZE_MB = 10;

const DOC_CATEGORIES = [
  { category: 'Notas Fiscais', types: ['DANFE XML', 'DANFE PDF', 'NFS-e (Serviço)'] },
  { category: 'Títulos', types: ['Cheque Digitalizado', 'Duplicata Digitalizada', 'Boleto'] },
  { category: 'Documentos do Cedente', types: ['RG', 'CNH', 'Comprovante de Renda', 'Comprovante de Endereço', 'Contrato Social'] },
  { category: 'Contratos', types: ['Contrato', 'Aditivo', 'Procuração', 'Carta de Cessão'] },
  { category: 'Comprovantes', types: ['Comprovante de Pagamento', 'Recibo'] },
  { category: 'Outros', types: ['Outro'] },
];

const ALL_TYPES = DOC_CATEGORIES.flatMap((c) => c.types.map((t) => ({ category: c.category, type: t })));

function getCategoryForType(type) {
  return ALL_TYPES.find((t) => t.type === type)?.category || 'Outros';
}

function formatFileSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileIcon(fileName) {
  const ext = (fileName || '').split('.').pop()?.toLowerCase();
  if (['pdf'].includes(ext)) return '📄';
  if (['xml'].includes(ext)) return '🗂️';
  if (['jpg', 'jpeg', 'png', 'gif', 'bmp'].includes(ext)) return '🖼️';
  if (['doc', 'docx'].includes(ext)) return '📝';
  if (['xls', 'xlsx'].includes(ext)) return '📊';
  return '📎';
}

/**
 * Painel compartilhado para gerenciar documentos de uma operação.
 *
 * @param mode - "queue" (wizard) | "entity" (detail tab)
 * @param operacao - dados da operação (necessário em mode="entity")
 * @param documentos - array de documentos na fila (mode="queue")
 * @param onChange - callback quando fila muda (mode="queue")
 * @param onUpdate - callback após salvar/excluir (mode="entity")
 */
export default function OperacaoDocumentosPanel({ mode = 'queue', operacao, documentos = [], onChange, onUpdate }) {
  const safeDocs = Array.isArray(documentos) ? documentos : [];
  const [queue, setQueue] = useState(safeDocs);
  const [savedDocs, setSavedDocs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [selectedType, setSelectedType] = useState('');
  const [notes, setNotes] = useState('');
  const [pendingFile, setPendingFile] = useState(null);
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);

  // Entity mode: load saved documents
  useEffect(() => {
    if (mode !== 'entity' || !operacao?.id) return;
    setLoading(true);
    base44.entities.OperacaoDocumento.filter({ operation_id: operacao.id })
      .then(setSavedDocs)
      .catch(() => setSavedDocs([]))
      .finally(() => setLoading(false));
  }, [mode, operacao?.id]);

  // Sync queue with parent in wizard mode
  useEffect(() => {
    if (mode === 'queue') {
      setQueue(Array.isArray(documentos) ? documentos : []);
    }
  }, [mode, documentos]);

  const validateFile = (file) => {
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      setError(`Arquivo excede o limite de ${MAX_SIZE_MB} MB`);
      return false;
    }
    setError('');
    return true;
  };

  const handleFileSelect = (file) => {
    if (!file) return;
    if (!validateFile(file)) return;
    setPendingFile(file);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFileSelect(file);
  };

  const uploadFile = async (file) => {
    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      return file_url;
    } catch (e) {
      console.error('Upload failed:', e);
      setError('Erro ao enviar arquivo. Tente novamente.');
      return null;
    } finally {
      setUploading(false);
    }
  };

  const addToQueue = async () => {
    if (!pendingFile || !selectedType) return;
    const fileUrl = await uploadFile(pendingFile);
    if (!fileUrl) return;

    const newDoc = {
      doc_type: selectedType,
      doc_category: getCategoryForType(selectedType),
      file_url: fileUrl,
      file_name: pendingFile.name,
      file_size: pendingFile.size,
      notes: notes || '',
    };

    if (mode === 'queue') {
      const next = [...queue, newDoc];
      setQueue(next);
      onChange?.(next);
    } else {
      // Entity mode: save directly
      try {
        await base44.entities.OperacaoDocumento.create({
          operation_id: operacao.id,
          client_id: operacao.client_id,
          client_name: operacao.client_name,
          ...newDoc,
        });
        const refreshed = await base44.entities.OperacaoDocumento.filter({ operation_id: operacao.id });
        setSavedDocs(refreshed);
        onUpdate?.();
      } catch (e) {
        console.error('Erro ao salvar documento:', e);
        setError('Erro ao salvar documento.');
      }
    }

    // Reset form
    setPendingFile(null);
    setSelectedType('');
    setNotes('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const cancelPending = () => {
    setPendingFile(null);
    setSelectedType('');
    setNotes('');
    setError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeFromQueue = (index) => {
    const next = queue.filter((_, i) => i !== index);
    setQueue(next);
    onChange?.(next);
  };

  const deleteSavedDoc = async (doc) => {
    if (!doc?.id) return;
    try {
      await base44.entities.OperacaoDocumento.delete(doc.id);
      setSavedDocs((prev) => prev.filter((d) => d.id !== doc.id));
      onUpdate?.();
    } catch (e) {
      console.error('Erro ao excluir documento:', e);
    }
  };

  const displayDocs = Array.isArray(mode === 'queue' ? queue : savedDocs) ? (mode === 'queue' ? queue : savedDocs) : [];
  const queueCount = displayDocs.length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-sm font-bold mb-0.5">Documentos da Operação</h3>
          <p className="text-xs text-muted-foreground">
            Anexe documentos opcionais (contratos, procurações, comprovantes). Você pode adicionar nenhum ou vários
            {mode === 'queue' ? ' — eles serão enviados ao servidor após a confirmação da operação.' : '.'}
          </p>
        </div>
        <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground bg-gray-100 px-2.5 py-1 rounded-lg">
          <Paperclip className="w-3.5 h-3.5 text-indigo-500" />
          <span>{queueCount} documento{queueCount !== 1 ? 's' : ''} {mode === 'queue' ? 'na fila' : 'anexado' + (queueCount !== 1 ? 's' : '')}</span>
        </div>
      </div>

      {/* Upload Zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => !pendingFile && fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
          dragOver ? 'border-indigo-400 bg-indigo-50/50' : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50/50'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept=".pdf,.xml,.jpg,.jpeg,.png,.gif,.bmp,.doc,.docx,.xls,.xlsx"
          onChange={(e) => handleFileSelect(e.target.files?.[0])}
        />
        {!pendingFile ? (
          <>
            <UploadCloud className="w-8 h-8 text-gray-400 mx-auto mb-2" />
            <p className="text-sm font-medium text-foreground">Arraste um arquivo ou clique para selecionar</p>
            <p className="text-xs text-muted-foreground mt-1">PDF, Imagem, Word, Excel, XML — até {MAX_SIZE_MB} MB</p>
          </>
        ) : (
          <div className="flex items-center justify-center gap-3" onClick={(e) => e.stopPropagation()}>
            <div className="text-2xl">{getFileIcon(pendingFile.name)}</div>
            <div className="text-left">
              <p className="text-sm font-medium truncate max-w-xs">{pendingFile.name}</p>
              <p className="text-xs text-muted-foreground">{formatFileSize(pendingFile.size)}</p>
            </div>
            <button onClick={cancelPending} className="p-1 rounded-lg hover:bg-gray-100 text-muted-foreground">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      {/* Form: Type + Notes + Add button */}
      {pendingFile && (
        <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-3 items-end">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Tipo de Documento *</label>
            <select
              className="input-field"
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
            >
              <option value="">Selecione o tipo</option>
              {DOC_CATEGORIES.map((cat) => (
                <optgroup key={cat.category} label={cat.category}>
                  {cat.types.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Observação</label>
            <input
              className="input-field"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Observação opcional..."
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={cancelPending}
              className="px-3 py-2.5 text-sm font-medium border border-border rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={addToQueue}
              disabled={!selectedType || uploading}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold bg-foreground text-white rounded-lg hover:bg-foreground/90 disabled:opacity-50 transition-colors"
            >
              {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UploadCloud className="w-3.5 h-3.5" />}
              {uploading ? 'Enviando...' : mode === 'queue' ? '+ Adicionar à fila' : 'Enviar'}
            </button>
          </div>
        </div>
      )}

      {/* Document List */}
      <div className="border-t border-dashed border-border pt-4">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : displayDocs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <FileText className="w-10 h-10 text-gray-300 mb-2" />
            <p className="text-sm font-medium text-muted-foreground">
              {mode === 'queue' ? 'Nenhum documento anexado' : 'Nenhum documento anexado a esta operação'}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {mode === 'queue' ? "Clique em 'Adicionar à fila' para anexar arquivos opcionais." : "Clique na zona de upload acima para anexar."}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {displayDocs.map((doc, index) => (
              <div
                key={doc.id || index}
                className="flex items-center gap-3 p-3 border border-border rounded-lg bg-white hover:bg-gray-50/50 transition-colors"
              >
                <div className="text-xl shrink-0">{getFileIcon(doc.file_name)}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-bold px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200">
                      {doc.doc_type}
                    </span>
                    {doc.doc_category && (
                      <span className="text-[10px] text-muted-foreground">{doc.doc_category}</span>
                    )}
                  </div>
                  <p className="text-sm font-medium truncate mt-0.5">{doc.file_name}</p>
                  {doc.notes && <p className="text-xs text-muted-foreground truncate">{doc.notes}</p>}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {doc.file_url && (
                    <a
                      href={doc.file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 rounded-lg hover:bg-gray-100 text-muted-foreground hover:text-foreground"
                      title="Baixar"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </a>
                  )}
                  {mode === 'queue' ? (
                    <button
                      onClick={() => removeFromQueue(index)}
                      className="p-1.5 rounded-lg hover:bg-red-50 text-muted-foreground hover:text-red-500"
                      title="Remover"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  ) : (
                    <button
                      onClick={() => deleteSavedDoc(doc)}
                      className="p-1.5 rounded-lg hover:bg-red-50 text-muted-foreground hover:text-red-500"
                      title="Excluir"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}