import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Search, X, UserPlus, Check } from 'lucide-react';

export default function LinkClientModal({ onSelect, onClose }) {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    if (search.length < 2) { setResults([]); return; }
    setLoading(true);
    const q = search.toLowerCase();
    base44.entities.Client.list('-created_date', 100).then(clients => {
      setResults(clients.filter(c =>
        c.name?.toLowerCase().includes(q) ||
        c.document?.includes(q)
      ).slice(0, 8));
      setLoading(false);
    });
  }, [search]);

  const handleConfirm = () => {
    if (selected) onSelect(selected);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-bold text-base">Vincular Cliente Existente</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Busque pelo nome ou CPF/CNPJ</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            autoFocus
            className="input-field pl-9"
            placeholder="Nome ou CPF/CNPJ do cliente..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {loading && (
          <p className="text-sm text-muted-foreground text-center py-2">Buscando...</p>
        )}

        <div className="max-h-64 overflow-y-auto space-y-1">
          {results.map(c => (
            <button
              key={c.id}
              onClick={() => setSelected(c)}
              className={`w-full text-left px-4 py-3 rounded-xl border transition-colors ${
                selected?.id === c.id
                  ? 'border-[hsl(43,65%,47%)] bg-amber-50'
                  : 'border-border hover:bg-gray-50'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="font-semibold text-sm">{c.name}</div>
                {selected?.id === c.id && <Check className="w-4 h-4 text-[hsl(43,65%,47%)]" />}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {c.document} {c.city && `· ${c.city}/${c.state}`}
              </div>
            </button>
          ))}
          {results.length === 0 && search.length >= 2 && !loading && (
            <p className="text-sm text-muted-foreground text-center py-4">
              Nenhum cliente encontrado para "{search}"
            </p>
          )}
          {search.length < 2 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              Digite pelo menos 2 caracteres para buscar
            </p>
          )}
        </div>

        <div className="flex gap-3 pt-2">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 text-sm font-medium border border-border rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={!selected}
            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-foreground text-primary-foreground text-sm font-semibold rounded-lg hover:bg-foreground/90 disabled:opacity-40 transition-colors"
          >
            <UserPlus className="w-4 h-4" /> Vincular Cliente
          </button>
        </div>
      </div>
    </div>
  );
}