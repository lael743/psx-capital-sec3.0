import { Save, Upload, X } from 'lucide-react';
import { base44 } from '@/api/base44Client';

const DOCS = [
  { key: 'doc_rg_url', label: 'RG' },
  { key: 'doc_cnh_url', label: 'CNH' },
  { key: 'doc_income_url', label: 'Comprovante de Renda' },
  { key: 'doc_address_url', label: 'Comprovante de Residência' },
];

export default function SecaoDocumentos({ form, setField, saving, saveSection, savedFlash, clientId }) {
  const handleUpload = async (docKey, file) => {
    if (!file) return;
    const result = await base44.integrations.Core.UploadFile({ file });
    setField(docKey, result.file_url);
  };

  return (
    <div className="bg-white border border-border rounded-xl p-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-base font-bold">Documentos</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Documentos do cedente (RG, CNH, renda, residência).</p>
        </div>
        <button onClick={() => saveSection('documentos')} disabled={saving} className="inline-flex items-center gap-2 px-4 py-2 bg-foreground text-primary-foreground text-sm font-semibold rounded-lg hover:bg-foreground/90 disabled:opacity-50">
          <Save className="w-3.5 h-3.5" /> {saving ? 'Salvando...' : 'Salvar'}
        </button>
      </div>

      {savedFlash?.section === 'documentos' && (
        <div className="mb-4 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">{savedFlash.message}</div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {DOCS.map(doc => (
          <div key={doc.key} className="p-4 border border-border rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">{doc.label}</span>
              {form[doc.key] && (
                <button onClick={() => setField(doc.key, '')} className="p-1 hover:bg-gray-100 rounded">
                  <X className="w-4 h-4 text-muted-foreground" />
                </button>
              )}
            </div>
            {form[doc.key] ? (
              <a href={form[doc.key]} target="_blank" rel="noreferrer" className="text-xs text-[hsl(43,65%,47%)] hover:underline">Ver documento enviado</a>
            ) : (
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="file" hidden onChange={e => handleUpload(doc.key, e.target.files?.[0])} />
                <Upload className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Selecione um arquivo</span>
              </label>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}