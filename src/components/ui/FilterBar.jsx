import { Search } from 'lucide-react';

export default function FilterBar({ search, onSearch, placeholder = 'Buscar...', filters = [], className = '' }) {
  return (
    <div className={`flex flex-col sm:flex-row gap-3 mb-5 ${className}`}>
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          type="text"
          placeholder={placeholder}
          value={search}
          onChange={e => onSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2.5 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-ring shadow-sm"
        />
      </div>
      {filters.map((f, i) => (
        <select
          key={i}
          value={f.value}
          onChange={e => f.onChange(e.target.value)}
          className="text-sm border border-border rounded-lg px-3 py-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-ring shadow-sm min-w-[140px]"
        >
          {f.options.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      ))}
    </div>
  );
}