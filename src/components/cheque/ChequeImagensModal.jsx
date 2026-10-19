import { useState } from 'react';
import { X, Upload, Image, ZoomIn } from 'lucide-react';
import { base44 } from '@/api/base44Client';

/**
 * Modal para visualizar e/ou anexar imagens (frente/verso) de um cheque.
 */
export default function ChequeImagensModal({ cheque, onClose, onSaved }) {
  const [frontFile, setFrontFile] = useState(null);
  const [backFile, setBackFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [lightbox, setLightbox] = useState(null); // URL da imagem ampliada

  const hasImages = cheque.front_image_url || cheque.back_image_url;

  const uploadImage = async (file) => {
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    return file_url;
  };

  const save = async () => {
    if (!frontFile && !backFile) { onClose(); return; }
    setUploading(true);
    const updates = {};
    if (frontFile) updates.front_image_url = await uploadImage(frontFile);
    if (backFile) updates.back_image_url = await uploadImage(backFile);
    await base44.entities.Cheque.update(cheque.id, updates);
    setUploading(false);
    onSaved();
    onClose();
  };

  return (
    <>
      {/* Lightbox */}
      {lightbox && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4" onClick={() => setLightbox(null)}>
          <img src={lightbox} alt="cheque" className="max-w-full max-h-full rounded-xl shadow-2xl" />
          <button className="absolute top-4 right-4 p-2 bg-white/20 rounded-full text-white hover:bg-white/30">
            <X className="w-5 h-5" />
          </button>
        </div>
      )}

      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/40" onClick={onClose} />
        <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <div className="flex items-center gap-2">
              <Image className="w-4 h-4 text-purple-600" />
              <div>
                <h3 className="text-sm font-bold">Imagens do Cheque</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  #{cheque.check_number} — {cheque.client_name}
                </p>
              </div>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-5 space-y-5">
            {/* Frente */}
            <ImageSlot
              label="Frente do Cheque"
              existingUrl={cheque.front_image_url}
              file={frontFile}
              onFileChange={setFrontFile}
              onZoom={setLightbox}
            />

            {/* Verso */}
            <ImageSlot
              label="Verso do Cheque"
              existingUrl={cheque.back_image_url}
              file={backFile}
              onFileChange={setBackFile}
              onZoom={setLightbox}
            />
          </div>

          <div className="flex justify-end gap-2 px-5 pb-5">
            <button onClick={onClose} className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-gray-50">
              Fechar
            </button>
            {(frontFile || backFile) && (
              <button
                onClick={save}
                disabled={uploading}
                className="flex items-center gap-2 px-5 py-2 bg-purple-600 text-white text-sm font-semibold rounded-lg disabled:opacity-50 hover:bg-purple-700 transition-colors"
              >
                <Upload className="w-3.5 h-3.5" />
                {uploading ? 'Enviando...' : 'Salvar Imagens'}
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function ImageSlot({ label, existingUrl, file, onFileChange, onZoom }) {
  const previewUrl = file ? URL.createObjectURL(file) : existingUrl;

  return (
    <div>
      <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">{label}</label>
      {previewUrl ? (
        <div className="relative group rounded-xl overflow-hidden border border-border bg-gray-50">
          <img src={previewUrl} alt={label} className="w-full h-48 object-cover" />
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
            <button
              type="button"
              onClick={() => onZoom(previewUrl)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white text-sm font-semibold rounded-lg shadow"
            >
              <ZoomIn className="w-3.5 h-3.5" /> Ampliar
            </button>
            <label className="flex items-center gap-1.5 px-3 py-1.5 bg-white text-sm font-semibold rounded-lg shadow cursor-pointer">
              <Upload className="w-3.5 h-3.5" /> Trocar
              <input type="file" accept="image/*" className="hidden" onChange={e => onFileChange(e.target.files[0])} />
            </label>
          </div>
        </div>
      ) : (
        <label className="flex flex-col items-center justify-center w-full h-36 border-2 border-dashed border-border rounded-xl bg-gray-50 hover:bg-gray-100 cursor-pointer transition-colors">
          <Upload className="w-6 h-6 text-muted-foreground mb-2" />
          <span className="text-xs font-medium text-muted-foreground">Clique para anexar imagem</span>
          <span className="text-xs text-muted-foreground/60 mt-0.5">JPG, PNG, WEBP</span>
          <input type="file" accept="image/*" className="hidden" onChange={e => onFileChange(e.target.files[0])} />
        </label>
      )}
    </div>
  );
}