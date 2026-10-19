import { useRef, useState } from 'react';
import { Paperclip, Upload, X, Loader2, FileText } from 'lucide-react';
import { base44 } from '@/api/base44Client';

/**
 * Upload e listagem de anexos/comprovantes.
 * Armazena em storage público (padrão já usado nos documentos do PSX Capital).
 */
export default function AnexosUpload({ anexos = [], onChange, label = 'Anexos e comprovantes', single = false }) {
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [erro, setErro] = useState('');

  const add = async (files) => {
    const lista = Array.from(files || []);
    if (lista.length === 0) return;
    setErro('');
    setUploading(true);
    const novos = [];
    for (const file of lista) {
      try {
        const { file_url } = await base44.integrations.Core.UploadFile({ file });
        novos.push({ nome: file.name, url: file_url });
      } catch {
        setErro(`Não foi possível enviar "${file.name}".`);
      }
    }
    onChange(single ? novos.slice(0, 1) : [...(anexos || []), ...novos]);
    setUploading(false);
    if (inputRef.current) inputRef.current.value = '';
  };

  const remover = (idx) => onChange((anexos || []).filter((_, i) => i !== idx));

  return (
    <div>
      <label className="block text-xs font-semibold text-muted-foreground mb-1.5">{label}</label>

      {(anexos || []).length > 0 && (
        <div className="space-y-1.5 mb-2">
          {anexos.map((a, i) => (
            <div key={`${a.url}-${i}`} className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-lg px-2.5 py-2">
              <FileText className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <a href={a.url} target="_blank" rel="noreferrer" className="text-xs text-emerald-800 truncate flex-1 hover:underline">
                {a.nome || 'arquivo'}
              </a>
              <button type="button" onClick={() => remover(i)} className="p-1 text-red-500 hover:bg-red-100 rounded" aria-label="Remover anexo">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {(!single || (anexos || []).length === 0) && (
        <button
          type="button"
          onClick={() => !uploading && inputRef.current?.click()}
          disabled={uploading}
          className="w-full flex items-center gap-2 px-3 py-2.5 border border-dashed border-border rounded-lg text-xs text-muted-foreground hover:bg-gray-50 hover:border-foreground/30 transition-colors disabled:opacity-50"
        >
          {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          {uploading ? 'Enviando...' : 'Enviar arquivo'}
          {!uploading && <Paperclip className="w-3.5 h-3.5 ml-auto opacity-60" />}
        </button>
      )}

      <input ref={inputRef} type="file" multiple={!single} className="hidden" onChange={e => add(e.target.files)} />
      {erro && <p className="text-[11px] text-red-600 mt-1">{erro}</p>}
    </div>
  );
}