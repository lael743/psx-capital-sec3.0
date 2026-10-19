import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Loader2, QrCode, CheckCircle2, X, AlertTriangle } from 'lucide-react';
import ConfirmDialog from '@/components/ui/ConfirmDialog';

/**
 * Modal para gerar cobranças Asaas em lote para múltiplas operações.
 * Props:
 *   operacoes  – array de operações (type boleto/empréstimo com sacado_id e installment_schedule)
 *   onClose    – callback ao fechar
 *   onDone     – callback ao concluir (para recarregar a lista)
 */
export default function AsaasBatchModal({ operacoes, onClose, onDone }) {
  const [billingType, setBillingType] = useState("PIX");
  const [processing, setProcessing] = useState(false);
  const [results, setResults] = useState([]);
  const [currentIdx, setCurrentIdx] = useState(-1);
  const [confirm, setConfirm] = useState(false);

  const eligible = operacoes.filter(o => o.sacado_id && Array.isArray(o.installment_schedule) && o.installment_schedule.length > 0);
  const skipped = operacoes.length - eligible.length;

  const handleGenerate = () => {
    setConfirm(true);
  };

  const doGenerate = async () => {
    setConfirm(false);
    setProcessing(true);
    setResults([]);
    const allResults = [];

    for (let i = 0; i < eligible.length; i++) {
      const op = eligible[i];
      setCurrentIdx(i);
      try {
        const res = await base44.functions.invoke("asaasCreateCharge", {
          operation_id: op.id,
          billing_type: billingType,
          generate_all_parcels: true,
        });
        const chargeCount = res.charges?.length || 0;
        allResults.push({
          op_id: op.id,
          numero: op.numero_operacao,
          client: op.client_name,
          sacado: op.sacado_name,
          status: 'ok',
          charges: chargeCount,
        });
      } catch (e) {
        allResults.push({
          op_id: op.id,
          numero: op.numero_operacao,
          client: op.client_name,
          sacado: op.sacado_name,
          status: 'erro',
          error: e.response?.data?.error || e.message,
        });
      }
      setResults([...allResults]);
    }

    setProcessing(false);
    setCurrentIdx(-1);
    if (onDone) onDone();
  };

  const okCount = results.filter(r => r.status === 'ok').length;
  const errCount = results.filter(r => r.status === 'erro').length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <ConfirmDialog open={confirm} title="Gerar Cobranças em Lote" message={`Gerar cobranças ${billingType} para ${eligible.length} operação(ões) no Asaas? Será gerada 1 cobrança por parcela.`} confirmLabel="Gerar Lote" onConfirm={doGenerate} onCancel={() => setConfirm(false)} />
      <div className="absolute inset-0 bg-black/40" onClick={!processing ? onClose : undefined} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div className="flex items-center gap-2.5">
            <QrCode className="w-5 h-5 text-[hsl(43,65%,47%)]" />
            <h2 className="text-base font-bold">Gerar Cobranças Asaas em Lote</h2>
          </div>
          <button onClick={onClose} disabled={processing} className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-40">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {results.length === 0 ? (
            <>
              <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 space-y-2">
                <p className="text-sm text-blue-900 font-medium">Resumo do lote</p>
                <div className="text-xs text-blue-800 space-y-1">
                  <p>• {eligible.length} operação{eligible.length > 1 ? 'ões' : ''} elegível{eligible.length > 1 ? 's' : ''} (com sacado e parcelas)</p>
                  {skipped > 0 && <p>• {skipped} operação{skipped > 1 ? 'ões' : ''} ignorada{skipped > 1 ? 's' : ''} (sem sacado ou sem parcelas)</p>}
                  <p>• Será gerada 1 cobrança por parcela, espelhando valor e vencimento</p>
                </div>
              </div>

              {eligible.length === 0 ? (
                <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  Nenhuma operação elegível. Todas precisam ter sacado vinculado e parcelas configuradas.
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">Método de cobrança</label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setBillingType("PIX")}
                      className={`flex-1 px-4 py-2.5 text-sm font-semibold rounded-lg border transition-colors ${billingType === "PIX" ? "bg-foreground text-white border-foreground" : "border-border hover:bg-gray-50"}`}
                    >
                      PIX
                    </button>
                    <button
                      onClick={() => setBillingType("BOLETO")}
                      className={`flex-1 px-4 py-2.5 text-sm font-semibold rounded-lg border transition-colors ${billingType === "BOLETO" ? "bg-foreground text-white border-foreground" : "border-border hover:bg-gray-50"}`}
                    >
                      Boleto
                    </button>
                  </div>
                </div>
              )}

              {eligible.length > 0 && (
                <div className="border border-border rounded-lg overflow-hidden max-h-48 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 border-b border-border sticky top-0">
                      <tr>
                        <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Operação</th>
                        <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Cedente</th>
                        <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Sacado</th>
                        <th className="px-3 py-2 text-right font-semibold text-muted-foreground">Parcelas</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {eligible.map(op => (
                        <tr key={op.id} className="hover:bg-gray-50/50">
                          <td className="px-3 py-1.5 font-mono">#{String(op.numero_operacao || '').padStart(4, '0')}</td>
                          <td className="px-3 py-1.5 truncate max-w-[140px]">{op.client_name || '—'}</td>
                          <td className="px-3 py-1.5 truncate max-w-[140px]">{op.sacado_name || '—'}</td>
                          <td className="px-3 py-1.5 text-right">{op.installment_schedule?.length || 0}x</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-4 text-sm">
                <span className="inline-flex items-center gap-1.5 text-emerald-700 font-semibold">
                  <CheckCircle2 className="w-4 h-4" /> {okCount} ok
                </span>
                {errCount > 0 && (
                  <span className="inline-flex items-center gap-1.5 text-red-700 font-semibold">
                    <AlertTriangle className="w-4 h-4" /> {errCount} erro{errCount > 1 ? 's' : ''}
                  </span>
                )}
              </div>

              <div className="border border-border rounded-lg overflow-hidden max-h-96 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 border-b border-border sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Operação</th>
                      <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Sacado</th>
                      <th className="px-3 py-2 text-right font-semibold text-muted-foreground">Cobranças</th>
                      <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {results.map((r, i) => (
                      <tr key={i} className="hover:bg-gray-50/50">
                        <td className="px-3 py-1.5 font-mono">#{String(r.numero || '').padStart(4, '0')}</td>
                        <td className="px-3 py-1.5 truncate max-w-[140px]">{r.sacado || '—'}</td>
                        <td className="px-3 py-1.5 text-right">{r.charges || 0}</td>
                        <td className="px-3 py-1.5">
                          {r.status === 'ok' ? (
                            <span className="text-emerald-600 font-medium">Gerado</span>
                          ) : (
                            <span className="text-red-600 font-medium" title={r.error}>Erro</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 p-5 border-t border-border">
          {processing && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              Processando {currentIdx + 1} de {eligible.length}...
            </div>
          )}
          <div className="flex items-center gap-2 ml-auto">
            <button onClick={onClose} disabled={processing} className="px-4 py-2 text-sm font-medium border border-border rounded-lg hover:bg-gray-50 disabled:opacity-40">
              {results.length > 0 ? 'Fechar' : 'Cancelar'}
            </button>
            {results.length === 0 && eligible.length > 0 && (
              <button
                onClick={handleGenerate}
                disabled={processing}
                className="inline-flex items-center gap-2 px-4 py-2 bg-foreground text-white text-sm font-semibold rounded-lg hover:bg-foreground/90 disabled:opacity-50"
              >
                {processing ? <Loader2 className="w-4 h-4 animate-spin" /> : <QrCode className="w-4 h-4" />}
                Gerar {eligible.length} Lote{eligible.length > 1 ? 's' : ''}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}