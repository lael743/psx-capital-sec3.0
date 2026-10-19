import { STATUS_OBRIGACAO_LABELS, STATUS_OBRIGACAO_CLASSES, statusObrigacaoExibido } from '@/lib/gestaoInterna';

/** Etiqueta discreta de status da parcela (contas a pagar). */
export default function StatusObrigacaoBadge({ obrigacao, status }) {
  const key = status || statusObrigacaoExibido(obrigacao);
  const classe = STATUS_OBRIGACAO_CLASSES[key] || 'bg-gray-100 text-gray-600 border-gray-300';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border whitespace-nowrap ${classe}`}>
      {STATUS_OBRIGACAO_LABELS[key] || key}
    </span>
  );
}