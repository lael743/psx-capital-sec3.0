import { X } from 'lucide-react';

const WIDTHS = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl', xl: 'max-w-5xl' };

/**
 * Casca de diálogo do módulo Gestão Interna.
 * Mantém o padrão visual do PSX Capital (fundo claro, bordas discretas).
 */
export default function GestaoModal({ open, title, subtitle, onClose, children, footer, size = 'md' }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start md:items-center justify-center p-3 md:p-4 overflow-y-auto">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className={`relative bg-white border border-border rounded-2xl shadow-2xl w-full ${WIDTHS[size]} my-6`}>
        <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-border">
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-foreground truncate">{title}</h3>
            {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 shrink-0" aria-label="Fechar">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5">{children}</div>
        {footer && <div className="px-5 py-4 border-t border-border flex justify-end gap-2 flex-wrap">{footer}</div>}
      </div>
    </div>
  );
}