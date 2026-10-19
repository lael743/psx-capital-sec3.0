const configs = {
  // Operation status
  ativo: { label: 'Ativo', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  quitado: { label: 'Quitado', className: 'bg-blue-50 text-blue-700 border-blue-200' },
  atrasado: { label: 'Atrasado', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  inadimplente: { label: 'Inadimplente', className: 'bg-red-50 text-red-700 border-red-200' },
  pendente_contrato: { label: '⏳ Pend. Contrato', className: 'bg-amber-50 text-amber-800 border-amber-300' },
  repasse_concluido: { label: '✅ Repasse Concluído', className: 'bg-green-50 text-green-700 border-green-200' },
  // Client status
  bloqueado: { label: 'Bloqueado', className: 'bg-gray-100 text-gray-600 border-gray-300' },
  risco: { label: 'Risco', className: 'bg-red-50 text-red-700 border-red-200' },
  // Risk profile
  baixo: { label: 'Baixo', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  medio: { label: 'Médio', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  alto: { label: 'Alto', className: 'bg-red-50 text-red-700 border-red-200' },
  // Cheque status
  pendente: { label: 'Pendente', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  compensado: { label: 'Compensado', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  devolvido: { label: 'Devolvido', className: 'bg-red-50 text-red-700 border-red-200' },
  resolvido_pago: { label: 'Resolvido (Pago)', className: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
  resolvido_substituido: { label: 'Resolvido (Substituído)', className: 'bg-blue-50 text-blue-700 border-blue-200' },
  resolvido_prorrogado: { label: 'Resolvido (Prorrogado)', className: 'bg-purple-50 text-purple-700 border-purple-200' },
  cancelado: { label: 'Cancelado', className: 'bg-gray-100 text-gray-500 border-gray-300 line-through' },
  // Generic
  emprestimo: { label: 'Empréstimo', className: 'bg-blue-50 text-blue-700 border-blue-200' },
  cheque: { label: 'Cheque', className: 'bg-purple-50 text-purple-700 border-purple-200' },
  boleto: { label: 'Boleto', className: 'bg-orange-50 text-orange-700 border-orange-200' },
};

export default function StatusBadge({ status, className = '' }) {
  const config = configs[status] || { label: status, className: 'bg-gray-100 text-gray-600 border-gray-300' };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${config.className} ${className}`}>
      {config.label}
    </span>
  );
}