import { X, Printer, Download } from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/finance';

const methodLabel = { pix: 'PIX', dinheiro: 'Dinheiro', transferencia: 'Transferência', cheque: 'Cheque' };

export default function ReciboModal({ open, payment, operation, client, companyName, onClose }) {
  if (!open || !payment) return null;

  const handlePrint = () => window.print();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        {/* Controls */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border print:hidden">
          <h3 className="text-sm font-bold">Recibo de Pagamento</h3>
          <div className="flex items-center gap-2">
            <button onClick={handlePrint}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-border rounded-lg hover:bg-gray-50">
              <Printer className="w-3.5 h-3.5" /> Imprimir
            </button>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Recibo content */}
        <div id="recibo-print" className="p-8 space-y-6">
          {/* Header */}
          <div className="text-center border-b-2 border-foreground pb-4">
            <div className="text-2xl font-black tracking-tight mb-0.5">
              {companyName || 'PSX SOLUÇÕES'}
            </div>
            <div className="text-xs text-muted-foreground uppercase tracking-widest">Recibo de Pagamento</div>
          </div>

          {/* Número e data */}
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Data: <strong className="text-foreground">{formatDate(payment.payment_date)}</strong></span>
            <span>Ref.: <strong className="text-foreground font-mono">#{payment.id?.slice(-8).toUpperCase()}</strong></span>
          </div>

          {/* Valor principal */}
          <div className="bg-gray-50 rounded-xl p-5 text-center">
            <div className="text-xs text-muted-foreground uppercase tracking-widest mb-1">Valor Recebido</div>
            <div className="text-4xl font-black text-foreground">{formatCurrency(payment.amount)}</div>
            <div className="text-xs text-muted-foreground mt-1">via {methodLabel[payment.method] || payment.method}</div>
          </div>

          {/* Detalhes */}
          <div className="space-y-2 text-sm">
            <div className="flex justify-between py-2 border-b border-dashed border-border">
              <span className="text-muted-foreground">Cliente</span>
              <span className="font-semibold">{payment.client_name || client?.name || '—'}</span>
            </div>
            {operation && (
              <>
                <div className="flex justify-between py-2 border-b border-dashed border-border">
                  <span className="text-muted-foreground">Operação</span>
                  <span className="font-mono text-xs font-semibold">#{operation.id?.slice(-6).toUpperCase()}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-dashed border-border">
                  <span className="text-muted-foreground">Total da Operação</span>
                  <span className="font-semibold">{formatCurrency(operation.total_receivable)}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-dashed border-border">
                  <span className="text-muted-foreground">Saldo Restante</span>
                  <span className="font-semibold text-emerald-600">
                    {formatCurrency(Math.max(0, (operation.total_receivable || 0) - (operation.amount_paid || 0)))}
                  </span>
                </div>
              </>
            )}
            {payment.notes && (
              <div className="flex justify-between py-2">
                <span className="text-muted-foreground">Observações</span>
                <span className="text-xs max-w-[60%] text-right">{payment.notes}</span>
              </div>
            )}
          </div>

          {/* Assinaturas */}
          <div className="flex justify-between pt-8 mt-4 border-t border-border">
            <div className="text-center">
              <div className="border-t border-foreground w-36 mx-auto mb-1" />
              <div className="text-xs text-muted-foreground">Pagador</div>
            </div>
            <div className="text-center">
              <div className="border-t border-foreground w-36 mx-auto mb-1" />
              <div className="text-xs text-muted-foreground">Recebedor</div>
            </div>
          </div>

          <div className="text-center text-xs text-muted-foreground pt-2">
            Documento emitido em {new Date().toLocaleDateString('pt-BR')} às {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>
      </div>
    </div>
  );
}