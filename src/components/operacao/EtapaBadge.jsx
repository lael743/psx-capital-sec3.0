const ETAPA_CONFIG = {
  rascunho: { label: 'Rascunho', className: 'bg-gray-100 text-gray-600 border-gray-300' },
  analise_credito: { label: 'Análise de Crédito', className: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  confirmacao_titulos: { label: 'Confirmação de Títulos', className: 'bg-violet-50 text-violet-700 border-violet-200' },
  formalizacao: { label: 'Formalização', className: 'bg-blue-50 text-blue-700 border-blue-200' },
  assinatura: { label: 'Assinatura', className: 'bg-sky-50 text-sky-700 border-sky-200' },
  pagamento: { label: 'Pagamento', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  finalizada: { label: 'Finalizada', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  rejeitada: { label: 'Rejeitada', className: 'bg-red-50 text-red-700 border-red-200' },
};

const PADRAO = { label: 'Em andamento', className: 'bg-gray-100 text-gray-600 border-gray-300' };

export default function EtapaBadge({ etapa, className = '' }) {
  const config = ETAPA_CONFIG[etapa] || PADRAO;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${config.className} ${className}`}>
      {config.label}
    </span>
  );
}