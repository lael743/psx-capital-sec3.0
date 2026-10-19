import { STATUS_PATRIMONIO_LABELS, STATUS_PATRIMONIO_CLASSES } from '@/lib/gestaoInterna';

/** Etiqueta discreta de status do bem. */
export default function StatusPatrimonioBadge({ status }) {
  const classe = STATUS_PATRIMONIO_CLASSES[status] || 'bg-gray-100 text-gray-600 border-gray-300';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border whitespace-nowrap ${classe}`}>
      {STATUS_PATRIMONIO_LABELS[status] || status}
    </span>
  );
}