const STATUS_CONFIG = {
  pending: { label: "Pendente", className: "bg-amber-100 text-amber-700" },
  confirmed: { label: "Confirmado", className: "bg-emerald-100 text-emerald-700" },
  received: { label: "Recebido", className: "bg-emerald-100 text-emerald-700" },
  overdue: { label: "Vencido", className: "bg-red-100 text-red-700" },
  refunded: { label: "Estornado", className: "bg-gray-100 text-gray-600" },
  deleted: { label: "Cancelado", className: "bg-gray-100 text-gray-500" },
};

export default function AsaasStatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${cfg.className}`}>
      {cfg.label}
    </span>
  );
}