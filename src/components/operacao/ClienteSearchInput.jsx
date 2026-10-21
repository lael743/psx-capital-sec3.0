import { useState, useRef, useEffect } from 'react';
import { Search, Plus, UserCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function ClienteSearchInput({ clients, selectedClient, onSelect, nextRef, onCreateNew }) {
  // Cadastro rápido sem sair da tela: quando o pai oferece `onCreateNew`, o
  // botão abre o drawer em vez de navegar para a página de clientes.
  const abrirCadastro = () => (onCreateNew ? onCreateNew() : navigate('/clientes/novo'));
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const ref = useRef(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const navigate = useNavigate();

  const filtered = query.length < 1
    ? clients.slice(0, 8)
    : clients.filter(c =>
        c.name.toLowerCase().includes(query.toLowerCase()) ||
        c.document?.includes(query)
      ).slice(0, 10);

  useEffect(() => {
    if (selectedClient) setQuery(selectedClient.name);
  }, [selectedClient]);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Rola o item ativo para visão
  useEffect(() => {
    if (listRef.current) {
      const items = listRef.current.querySelectorAll('[data-item]');
      if (items[activeIdx]) items[activeIdx].scrollIntoView({ block: 'nearest' });
    }
  }, [activeIdx]);

  const handleSelect = (client) => {
    onSelect(client);
    setQuery(client.name);
    setOpen(false);
    setActiveIdx(0);
    // Avança foco para o próximo campo
    setTimeout(() => nextRef?.current?.focus(), 50);
  };

  const handleChange = (e) => {
    setQuery(e.target.value);
    setOpen(true);
    setActiveIdx(0);
    if (!e.target.value) onSelect(null);
  };

  const handleKeyDown = (e) => {
    if (!open || filtered.length === 0) {
      if (e.key === 'Escape') { setOpen(false); inputRef.current?.blur(); }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx(i => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered[activeIdx]) handleSelect(filtered[activeIdx]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
    }
  };

  return (
    <div ref={ref} className="relative">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <input
            ref={inputRef}
            className="input-field pl-9 relative"
            placeholder="Buscar cliente por nome ou CPF/CNPJ..."
            value={query}
            onChange={handleChange}
            onFocus={() => setOpen(true)}
            onKeyDown={handleKeyDown}
            autoComplete="off"
          />
        </div>
        <button
          type="button"
          onClick={abrirCadastro}
          className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-border rounded-lg hover:bg-gray-50 transition-colors whitespace-nowrap"
          title="Criar novo cliente"
        >
          <Plus className="w-4 h-4" />
          Novo
        </button>
      </div>

      {open && filtered.length > 0 && (
        <div ref={listRef} className="absolute z-50 mt-1 w-full bg-white border border-border rounded-xl shadow-lg overflow-hidden max-h-64 overflow-y-auto">
          {filtered.map((c, i) => (
            <button
              key={c.id}
              data-item
              type="button"
              className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors border-b border-border/50 last:border-0 ${i === activeIdx ? 'bg-gray-100' : 'hover:bg-gray-50'}`}
              onMouseDown={() => handleSelect(c)}
              onMouseEnter={() => setActiveIdx(i)}
            >
              <UserCircle className="w-4 h-4 text-muted-foreground shrink-0" />
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">{c.name}</div>
                <div className="text-xs text-muted-foreground">{c.document} · Taxa: {c.default_rate}% a.m.</div>
              </div>
            </button>
          ))}
        </div>
      )}

      {open && query.length > 1 && filtered.length === 0 && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-border rounded-xl shadow-lg p-4 text-sm text-muted-foreground text-center">
          Nenhum cliente encontrado.{' '}
          <button type="button" className="text-foreground font-medium underline" onClick={abrirCadastro}>
            Criar novo?
          </button>
        </div>
      )}
    </div>
  );
}