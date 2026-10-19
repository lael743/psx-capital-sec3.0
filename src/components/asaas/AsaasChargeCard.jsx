import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { QrCode, Copy, Check, RefreshCw, Loader2, CreditCard, ArrowUpRight, Ban, RotateCw } from 'lucide-react';
import AsaasStatusBadge from './AsaasStatusBadge';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { formatCurrency, formatDate } from '@/lib/finance';

export default function AsaasChargeCard({ operacao, onUpdate }) {
  const [loading, setLoading] = useState(false);
  const [busyIdx, setBusyIdx] = useState(null);
  const [billingType, setBillingType] = useState(operacao.asaas_billing_type || "PIX");
  const [copiedIdx, setCopiedIdx] = useState(null);
  const [confirm, setConfirm] = useState({ open: false, title: '', message: '', confirmLabel: 'Confirmar', onConfirm: null, variant: 'default' });

  if (!operacao.sacado_id) return null;

  const schedule = Array.isArray(operacao.installment_schedule) ? operacao.installment_schedule : [];
  const hasCharges = schedule.some(p => p.asaas_payment_id);
  const pendingCount = schedule.filter(p => !p.asaas_payment_id && !p.paid).length;

  const handleGenerate = () => {
    const count = pendingCount > 0 ? pendingCount : schedule.length;
    setConfirm({
      open: true,
      title: 'Gerar Cobranças',
      message: `Gerar ${count} cobrança(s) ${billingType} no Asaas para esta operação?`,
      confirmLabel: 'Gerar',
      onConfirm: () => { setConfirm(c => ({ ...c, open: false })); doGenerate(); },
      variant: 'default',
    });
  };

  const doGenerate = async () => {
    setLoading(true);
    try {
      await base44.functions.invoke("asaasCreateCharge", {
        operation_id: operacao.id,
        billing_type: billingType,
        generate_all_parcels: true,
      });
      if (onUpdate) onUpdate();
    } catch (e) {
      alert("Erro: " + (e.response?.data?.error || e.message));
    }
    setLoading(false);
  };

  const handleRefresh = async () => {
    setLoading(true);
    try {
      await base44.functions.invoke("asaasGetPaymentStatus", {
        operation_id: operacao.id,
      });
      if (onUpdate) onUpdate();
    } catch (_) { /* silent */ }
    setLoading(false);
  };

  const handleCancelParcela = (idx) => {
    setConfirm({
      open: true,
      title: 'Cancelar Cobrança',
      message: 'Cancelar esta cobrança no Asaas? O vínculo será removido e a parcela poderá ser regerada depois.',
      confirmLabel: 'Cancelar Cobrança',
      onConfirm: () => { setConfirm(c => ({ ...c, open: false })); doCancelParcela(idx); },
      variant: 'danger',
    });
  };

  const doCancelParcela = async (idx) => {
    setBusyIdx(idx);
    try {
      await base44.functions.invoke("asaasCancelCharge", {
        operation_id: operacao.id,
        parcela_index: idx,
      });
      if (onUpdate) onUpdate();
    } catch (e) {
      alert("Erro ao cancelar: " + (e.response?.data?.error || e.message));
    }
    setBusyIdx(null);
  };

  const handleRegenerateParcela = (idx) => {
    setConfirm({
      open: true,
      title: 'Gerar Cobrança',
      message: `Gerar nova cobrança ${billingType} para esta parcela no Asaas?`,
      confirmLabel: 'Gerar',
      onConfirm: () => { setConfirm(c => ({ ...c, open: false })); doRegenerateParcela(idx); },
      variant: 'default',
    });
  };

  const doRegenerateParcela = async (idx) => {
    setBusyIdx(idx);
    try {
      await base44.functions.invoke("asaasCreateCharge", {
        operation_id: operacao.id,
        billing_type: billingType,
        parcela_index: idx,
      });
      if (onUpdate) onUpdate();
    } catch (e) {
      alert("Erro ao regerar: " + (e.response?.data?.error || e.message));
    }
    setBusyIdx(null);
  };

  const copyText = (text, idx) => {
    navigator.clipboard.writeText(text);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 2000);
  };

  const isTerminal = (st) => ["deleted", "refunded"].includes(st);

  return (
    <div className="bg-white border border-border rounded-xl p-5 space-y-4">
      <ConfirmDialog open={confirm.open} title={confirm.title} message={confirm.message} confirmLabel={confirm.confirmLabel} variant={confirm.variant} onConfirm={confirm.onConfirm} onCancel={() => setConfirm(c => ({ ...c, open: false }))} />
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CreditCard className="w-4 h-4 text-muted-foreground" />
          <h3 className="text-sm font-bold">Cobrança Asaas por Parcela</h3>
        </div>
        {hasCharges && (
          <button onClick={handleRefresh} disabled={loading} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-border rounded-lg hover:bg-gray-50 disabled:opacity-50">
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Atualizar Status
          </button>
        )}
      </div>

      {!hasCharges ? (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Gere uma cobrança por parcela, espelhando valor e vencimento de cada uma das {schedule.length} parcelas da operação.
          </p>
          <div className="flex gap-2">
            <select value={billingType} onChange={(e) => setBillingType(e.target.value)} className="input-field flex-1">
              <option value="PIX">PIX</option>
              <option value="BOLETO">Boleto</option>
            </select>
            <button onClick={handleGenerate} disabled={loading || schedule.length === 0} className="inline-flex items-center gap-2 px-4 py-2 bg-foreground text-white text-xs font-semibold rounded-lg disabled:opacity-50">
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <QrCode className="w-3.5 h-3.5" />}
              Gerar {schedule.length} Cobrança{schedule.length > 1 ? 's' : ''}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {schedule.map((inst, i) => {
            const canCancel = inst.asaas_payment_id && !isTerminal(inst.asaas_payment_status) && !inst.paid;
            const canRegen = (!inst.asaas_payment_id || isTerminal(inst.asaas_payment_status)) && !inst.paid;
            return (
              <div key={i} className="border border-border rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-xs">
                    <span className="font-semibold">{inst.number}ª parcela</span>
                    <span className="text-muted-foreground ml-2">· {formatDate(inst.due_date)} · {formatCurrency(inst.value)}</span>
                  </div>
                  {inst.asaas_payment_id ? (
                    <AsaasStatusBadge status={inst.asaas_payment_status} />
                  ) : inst.paid ? (
                    <span className="text-xs font-medium text-emerald-600">Paga</span>
                  ) : (
                    <span className="text-xs text-muted-foreground">Sem cobrança</span>
                  )}
                </div>

                {inst.asaas_payment_id && !isTerminal(inst.asaas_payment_status) && (
                  <>
                    {inst.asaas_billing_type === "PIX" && inst.asaas_pix_qrcode ? (
                      <div className="flex gap-3 items-start">
                        <img src={`https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(inst.asaas_pix_qrcode)}`} alt="QR PIX" className="w-28 h-28 shrink-0" />
                        <div className="flex-1 space-y-1.5 min-w-0">
                          <p className="text-[10px] text-muted-foreground">Pix Copia e Cola</p>
                          <div className="flex gap-1.5">
                            <input readOnly value={inst.asaas_pix_qrcode} className="input-field flex-1 font-mono text-[10px] py-1 min-w-0" />
                            <button onClick={() => copyText(inst.asaas_pix_qrcode, i)} className="px-2 py-1 border border-border rounded-lg hover:bg-gray-50 shrink-0">
                              {copiedIdx === i ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                            </button>
                          </div>
                          {inst.asaas_invoice_url && (
                            <a href={inst.asaas_invoice_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[10px] text-[hsl(43,65%,47%)] font-semibold hover:underline">
                              <ArrowUpRight className="w-3 h-3" /> Ver fatura
                            </a>
                          )}
                        </div>
                      </div>
                    ) : inst.asaas_billing_type === "BOLETO" && inst.asaas_boleto_line ? (
                      <div className="space-y-1.5">
                        <div className="flex gap-1.5">
                          <input readOnly value={inst.asaas_boleto_line} className="input-field flex-1 font-mono text-[10px] py-1 min-w-0" />
                          <button onClick={() => copyText(inst.asaas_boleto_line, i)} className="px-2 py-1 border border-border rounded-lg hover:bg-gray-50 shrink-0">
                            {copiedIdx === i ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                          </button>
                        </div>
                        {inst.asaas_invoice_url && (
                          <a href={inst.asaas_invoice_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[10px] text-[hsl(43,65%,47%)] font-semibold hover:underline">
                            <ArrowUpRight className="w-3 h-3" /> Ver fatura
                          </a>
                        )}
                      </div>
                    ) : null}
                  </>
                )}

                {/* Per-parcela actions */}
                {(canCancel || canRegen) && (
                  <div className="flex items-center gap-2 pt-1 border-t border-border/60">
                    {canCancel && (
                      <button
                        onClick={() => handleCancelParcela(i)}
                        disabled={busyIdx === i}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-red-600 border border-red-200 rounded-lg hover:bg-red-50 disabled:opacity-50"
                      >
                        {busyIdx === i ? <Loader2 className="w-3 h-3 animate-spin" /> : <Ban className="w-3 h-3" />} Cancelar cobrança
                      </button>
                    )}
                    {canRegen && (
                      <button
                        onClick={() => handleRegenerateParcela(i)}
                        disabled={busyIdx === i}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-[hsl(43,65%,47%)] border border-[hsl(43,65%,47%)]/30 rounded-lg hover:bg-amber-50 disabled:opacity-50"
                      >
                        {busyIdx === i ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCw className="w-3 h-3" />} Gerar cobrança
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {pendingCount > 0 && (
            <div className="flex gap-2 pt-2 border-t border-border">
              <select value={billingType} onChange={(e) => setBillingType(e.target.value)} className="input-field flex-1 text-xs py-1.5">
                <option value="PIX">PIX</option>
                <option value="BOLETO">Boleto</option>
              </select>
              <button onClick={handleGenerate} disabled={loading} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-border rounded-lg hover:bg-gray-50 disabled:opacity-50 whitespace-nowrap">
                {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <QrCode className="w-3.5 h-3.5" />} Gerar {pendingCount} Pendente{pendingCount > 1 ? 's' : ''}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}