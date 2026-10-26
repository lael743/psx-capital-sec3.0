import { formatCurrency } from '@/lib/finance';

/**
 * Resumo do Parcelado (Tabela Price).
 * Os números vêm do MESMO cronograma exibido na tabela abaixo — nada é
 * recalculado aqui:
 *   Principal        = Σ amortização (valor presente financiado)
 *   Juros (Price)    = Σ juros do cronograma
 *   Total a Pagar    = Σ prestações (face)
 *   Lucro Projetado  = Total a Pagar − Principal (= juros)
 *   ROI              = juros ÷ principal
 *   Prestação (PMT)  = Total a Pagar ÷ nº de parcelas
 */
export default function ResumoPrice({ totais, quantidade }) {
  const principal = totais?.amortizacao || 0;
  const juros = totais?.juros || 0;
  const totalAPagar = totais?.face || 0;
  const roi = principal > 0 ? (juros / principal) * 100 : 0;
  const pmt = quantidade > 0 ? totalAPagar / quantidade : 0;

  const itens = [
    { label: 'Principal (Total)', value: formatCurrency(principal) },
    { label: 'Juros (Price)', value: formatCurrency(juros), className: 'text-red-600' },
    { label: 'Total a Pagar', value: formatCurrency(totalAPagar) },
    { label: 'Lucro Projetado', value: formatCurrency(totalAPagar - principal), className: 'text-emerald-600' },
    { label: 'ROI', value: `${roi.toFixed(2)}%` },
    { label: 'Prestação (PMT)', value: `${quantidade}x ${formatCurrency(pmt)}` },
  ];

  return (
    <div className="border border-border rounded-xl bg-gray-50/50 p-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {itens.map((i) => (
          <div key={i.label}>
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">{i.label}</p>
            <p className={`text-sm font-bold tabular-nums ${i.className || ''}`}>{i.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}