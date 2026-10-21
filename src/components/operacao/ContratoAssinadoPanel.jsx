import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { editarOperacaoCampos, registrarContratoAssinado } from '@/lib/operacaoOps';
import { Upload, CheckCircle2, FileText, Eye, X, AlertCircle } from 'lucide-react';
import { logAction } from '@/lib/audit';

export default function ContratoAssinadoPanel({ operacao, onUpdate }) {
  const [uploading, setUploading] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const isConfirmed = operacao?.contract_signed_confirmed;
  const hasFile = !!operacao?.signed_contract_url;

  const handleUpload = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      await editarOperacaoCampos(operacao.id, { signed_contract_url: file_url });
      await logAction({
        action: 'update', entity: 'Operation', entityId: operacao.id,
        description: `Contrato assinado anexado para ${operacao.client_name}`,
      });
      onUpdate();
    } finally {
      setUploading(false);
    }
  };

  const handleConfirm = async () => {
    setConfirming(true);
    try {
      // M5.1 — o status derivado da confirmação do contrato é decidido no servidor.
      await registrarContratoAssinado(operacao.id, { confirmar: true });
      await logAction({
        action: 'update', entity: 'Operation', entityId: operacao.id,
        description: `Recebimento do contrato assinado confirmado para ${operacao.client_name}`,
      });
      onUpdate();
    } finally {
      setConfirming(false);
    }
  };

  const handleRemoveFile = async () => {
    await editarOperacaoCampos(operacao.id, { signed_contract_url: '' });
    onUpdate();
  };

  const handleUnconfirm = async () => {
    await registrarContratoAssinado(operacao.id, { confirmar: false });
    onUpdate();
  };

  return (
    <div className="rounded-xl border border-border bg-white p-5 space-y-4">
      <div className="flex items-center gap-2">
        <FileText className="w-4 h-4 text-muted-foreground" />
        <h3 className="text-sm font-bold">Contrato Assinado</h3>
        {isConfirmed && (
          <span className="ml-auto text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2.5 py-0.5">
            ✅ Confirmado
          </span>
        )}
        {!isConfirmed && (
          <span className="ml-auto text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2.5 py-0.5">
            ⏳ Pendente
          </span>
        )}
      </div>

      {/* Warning if pending */}
      {!isConfirmed && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200">
          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-800">
            O repasse ao cliente está <strong>bloqueado</strong> até a confirmação do recebimento do contrato assinado.
          </p>
        </div>
      )}

      {/* File section */}
      <div>
        <div className="text-xs font-medium text-muted-foreground mb-2">Documento anexado</div>
        {hasFile ? (
          <div className="flex items-center gap-3 p-3 border border-border rounded-xl bg-gray-50">
            <FileText className="w-8 h-8 text-blue-500 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold truncate">Contrato assinado</div>
              <div className="text-xs text-muted-foreground">Documento anexado</div>
            </div>
            <div className="flex items-center gap-1">
              <a href={operacao.signed_contract_url} target="_blank" rel="noreferrer"
                className="p-1.5 rounded-lg hover:bg-gray-200 transition-colors" title="Visualizar">
                <Eye className="w-4 h-4 text-muted-foreground" />
              </a>
              {!isConfirmed && (
                <button onClick={handleRemoveFile}
                  className="p-1.5 rounded-lg hover:bg-red-50 transition-colors" title="Remover">
                  <X className="w-4 h-4 text-red-400" />
                </button>
              )}
            </div>
          </div>
        ) : (
          <label className={`flex items-center gap-3 p-4 border-2 border-dashed rounded-xl cursor-pointer transition-colors ${uploading ? 'border-blue-300 bg-blue-50' : 'border-border hover:border-foreground/30 hover:bg-gray-50'}`}>
            <input type="file" hidden accept=".pdf,.jpg,.jpeg,.png"
              onChange={e => handleUpload(e.target.files?.[0])}
              disabled={uploading} />
            <Upload className="w-5 h-5 text-muted-foreground shrink-0" />
            <div>
              <div className="text-sm font-medium">{uploading ? 'Enviando...' : 'Anexar contrato assinado'}</div>
              <div className="text-xs text-muted-foreground">PDF, JPG ou PNG</div>
            </div>
          </label>
        )}
      </div>

      {/* Confirm / Unconfirm */}
      {!isConfirmed ? (
        <button
          onClick={handleConfirm}
          disabled={confirming}
          className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-700 disabled:opacity-50 transition-colors"
        >
          <CheckCircle2 className="w-4 h-4" />
          {confirming ? 'Confirmando...' : 'Confirmar Recebimento do Contrato Assinado'}
        </button>
      ) : (
        <div className="space-y-2">
          <div className="text-xs text-center text-muted-foreground">
            Confirmado em {operacao.contract_signed_date || '—'}
          </div>
          <button onClick={handleUnconfirm}
            className="w-full px-4 py-2 border border-border text-xs font-medium rounded-xl hover:bg-gray-50 transition-colors text-muted-foreground">
            Desfazer confirmação
          </button>
        </div>
      )}
    </div>
  );
}