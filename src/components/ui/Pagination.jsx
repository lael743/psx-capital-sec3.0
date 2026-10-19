import { ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * Controle de paginação reutilizável.
 * Props: page, totalPages, total, pageSize, onPageChange, onPageSizeChange, pageSizeOptions
 */
export default function Pagination({
  page,
  totalPages,
  total,
  pageSize,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 25, 50],
  itemName = 'registros',
}) {
  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  const pages = [];
  const maxButtons = 5;
  let start = Math.max(1, page - 2);
  let end = Math.min(totalPages, start + maxButtons - 1);
  start = Math.max(1, end - maxButtons + 1);
  for (let i = start; i <= end; i++) pages.push(i);

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-border bg-gray-50/40">
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span>Mostrando <strong className="text-foreground">{from}–{to}</strong> de <strong className="text-foreground">{total}</strong> {itemName}</span>
        {pageSizeOptions.length > 1 && (
          <select
            value={pageSize}
            onChange={e => onPageSizeChange(Number(e.target.value))}
            className="text-xs border border-border rounded-md px-2 py-1 bg-white text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          >
            {pageSizeOptions.map(opt => (
              <option key={opt} value={opt}>{opt} / pág</option>
            ))}
          </select>
        )}
      </div>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="p-1.5 rounded-md border border-border bg-white text-muted-foreground hover:bg-gray-50 hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        {pages.map(p => (
          <button
            key={p}
            onClick={() => onPageChange(p)}
            className={`min-w-[2rem] h-8 px-2 rounded-md text-xs font-semibold border transition-colors ${
              p === page
                ? 'bg-foreground text-primary-foreground border-foreground'
                : 'bg-white text-foreground border-border hover:bg-gray-50'
            }`}
          >
            {p}
          </button>
        ))}
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          className="p-1.5 rounded-md border border-border bg-white text-muted-foreground hover:bg-gray-50 hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}