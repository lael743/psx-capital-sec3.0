import { User, ArrowRight, Building2 } from 'lucide-react';
import { formatCurrency } from '@/lib/finance';

export default function CessaoVinculoPanel({ operacao, client }) {
  if (operacao?.type !== 'boleto' || !operacao?.sacado_name) return null;

  const valorNominal = operacao.total_receivable || 0;
  const valorRepasse = operacao.net_value || 0;
  const desagio = valorNominal - valorRepasse;

  return (
    <div className="bg-white border border-border rounded-xl overflow-hidden">
      <div className="bg-gray-50 px-5 py-3 border-b border-border">
        <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Vínculo de Cessão de Crédito</p>
      </div>
      <div className="p-5">
        <div className="flex flex-col md:flex-row items-stretch gap-0">
          {/* Cedente */}
          <div className="flex-1 bg-blue-50 border border-blue-200 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <User className="w-4 h-4 text-blue-600" />
              <span className="text-xs font-semibold text-blue-700 uppercase">Cedente</span>
            </div>
            <p className="text-sm font-bold text-blue-900">{operacao.client_name || '—'}</p>
            {client?.document && (
              <p className="text-xs text-blue-600 mt-0.5 font-mono">{client.document}</p>
            )}
            <div className="mt-3 pt-3 border-t border-blue-200">
              <p className="text-xs text-blue-500">Recebe (Repasse)</p>
              <p className="text-lg font-bold text-emerald-700">{formatCurrency(valorRepasse)}</p>
            </div>
          </div>

          {/* Seta */}
          <div className="flex items-center justify-center px-3 py-2 md:py-0">
            <div className="md:rotate-0 rotate-90 flex items-center gap-1 text-muted-foreground">
              <ArrowRight className="w-5 h-5" />
              <span className="text-xs font-semibold">−{formatCurrency(desagio)}</span>
            </div>
          </div>

          {/* Sacado */}
          <div className="flex-1 bg-amber-50 border border-amber-200 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Building2 className="w-4 h-4 text-amber-600" />
              <span className="text-xs font-semibold text-amber-700 uppercase">Devedor Cedido (Sacado)</span>
            </div>
            <p className="text-sm font-bold text-amber-900">{operacao.sacado_name || '—'}</p>
            <div className="mt-3 pt-3 border-t border-amber-200">
              <p className="text-xs text-amber-500">Deve (Valor Nominal)</p>
              <p className="text-lg font-bold text-amber-800">{formatCurrency(valorNominal)}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}