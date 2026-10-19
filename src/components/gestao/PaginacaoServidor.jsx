import { ChevronLeft, ChevronRight } from 'lucide-react';

/** Rodapé de paginação para listas paginadas no servidor. */
export default function PaginacaoServidor({ page, pageSize, total, canPrev, canNext, onPrev, onNext, carregando }) {
  const totalPaginas = Math.max(1, Math.ceil((total || 0) / (pageSize || 25)));
  const inicio = total === 0 ? 0 : page * pageSize + 1;
  const fim = Math.min((page + 1) * pageSize, total || 0);

  return (
    <div className="flex items-center justify-between gap-3 px-1 py-3 flex-wrap">
      <p className="text-xs text-muted-foreground">
        {total === 0 ? 'Nenhum registro' : `${inicio}–${fim} de ${total}`}
      </p>
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Página {page + 1} de {totalPaginas}</span>
        <button
          onClick={onPrev}
          disabled={!canPrev || carregando}
          className="p-1.5 rounded-lg border border-border hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
          aria-label="Página anterior"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <button
          onClick={onNext}
          disabled={!canNext || carregando}
          className="p-1.5 rounded-lg border border-border hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
          aria-label="Próxima página"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}