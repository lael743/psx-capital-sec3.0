import { cobrancaAberta, rotuloCobranca } from '@/lib/contasReceber';

export default function CobrancaBadge({ cobranca }) {
  if (!cobranca) {
    return <span className="text-xs text-muted-foreground">Sem cobrança</span>;
  }
  const aberta = cobrancaAberta(cobranca.status);
  const estilo = aberta
    ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
    : 'bg-gray-100 text-gray-600 border-gray-300';
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border whitespace-nowrap ${estilo}`}
      title={cobranca.id ? `Cobrança ${cobranca.id} (${cobranca.origem})` : undefined}
    >
      {rotuloCobranca(cobranca.status)}
    </span>
  );
}