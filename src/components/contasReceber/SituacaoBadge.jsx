import { SITUACAO, SITUACAO_LABEL } from '@/lib/contasReceber';

const ESTILOS = {
  [SITUACAO.A_VENCER]: 'bg-amber-50 text-amber-700 border-amber-200',
  [SITUACAO.VENCIDO]: 'bg-red-50 text-red-700 border-red-200',
  [SITUACAO.A_CONFIRMAR]: 'bg-sky-50 text-sky-700 border-sky-200',
  [SITUACAO.RECEBIDO]: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  [SITUACAO.CANCELADO]: 'bg-gray-100 text-gray-500 border-gray-300 line-through',
  [SITUACAO.DEVOLVIDO]: 'bg-orange-50 text-orange-700 border-orange-200',
  [SITUACAO.RESOLVIDO]: 'bg-blue-50 text-blue-700 border-blue-200',
  [SITUACAO.EM_COBRANCA]: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  [SITUACAO.INCONSISTENTE]: 'bg-foreground text-primary-foreground border-foreground',
};

export default function SituacaoBadge({ situacao, inconsistente = false }) {
  const estilo = ESTILOS[situacao] || 'bg-gray-100 text-gray-600 border-gray-300';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border whitespace-nowrap ${estilo}`}>
      {SITUACAO_LABEL[situacao] || situacao}
      {inconsistente && situacao !== SITUACAO.INCONSISTENTE && (
        <span className="ml-1 gold-text font-bold" aria-label="possui inconsistência">!</span>
      )}
    </span>
  );
}