export function DataTable({ children, className = '' }) {
  return (
    <div className={`bg-white border border-border rounded-xl overflow-hidden shadow-sm ${className}`}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">{children}</table>
      </div>
    </div>
  );
}

export function TableHead({ children }) {
  return (
    <thead>
      <tr className="border-b border-border bg-gray-50/80">{children}</tr>
    </thead>
  );
}

export function Th({ children, right, className = '' }) {
  return (
    <th className={`px-5 py-3.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider ${right ? 'text-right' : 'text-left'} ${className}`}>
      {children}
    </th>
  );
}

export function TableBody({ children }) {
  return <tbody className="divide-y divide-border">{children}</tbody>;
}

export function Tr({ children, onClick }) {
  return (
    <tr onClick={onClick} className={`hover:bg-gray-50/60 transition-colors ${onClick ? 'cursor-pointer' : ''}`}>
      {children}
    </tr>
  );
}

export function Td({ children, right, muted, mono, className = '' }) {
  return (
    <td className={`px-5 py-3.5 ${right ? 'text-right' : ''} ${muted ? 'text-muted-foreground' : ''} ${mono ? 'font-mono' : ''} ${className}`}>
      {children}
    </td>
  );
}

export function EmptyRow({ colSpan, message = 'Nenhum registro encontrado.' }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-5 py-12 text-center text-muted-foreground text-sm">
        {message}
      </td>
    </tr>
  );
}