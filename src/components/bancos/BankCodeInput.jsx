import { useState, useRef, useEffect } from 'react';
import { BANCOS_BRASILEIROS } from './BancosInstituicoes';

/**
 * Input de código de banco com autocomplete.
 * - Ao digitar o código exato (3 dígitos), preenche o nome automaticamente.
 * - Ao digitar nome parcial, exibe dropdown de sugestões.
 * - onSelect({ code, name }) — chamado quando um banco é selecionado/identificado.
 */
export default function BankCodeInput({ code, name, onSelect }) {
  const [codeInput, setCodeInput] = useState(code || '');
  const [nameInput, setNameInput] = useState(name || '');
  const [suggestions, setSuggestions] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const dropdownRef = useRef(null);
  const nameRef = useRef(null);

  // Sincroniza props externas
  useEffect(() => { setCodeInput(code || ''); }, [code]);
  useEffect(() => { setNameInput(name || ''); }, [name]);

  const handleCodeChange = (val) => {
    const v = val.replace(/\D/g, '').slice(0, 3);
    setCodeInput(v);
    if (v.length === 3) {
      const found = BANCOS_BRASILEIROS.find(b => b.code === v.padStart(3, '0') || b.code === v);
      if (found) {
        setNameInput(found.name);
        onSelect({ code: found.code, name: found.name });
        setSuggestions([]);
        setShowDropdown(false);
        return;
      }
    }
    // Busca parcial por código
    if (v.length > 0) {
      const matches = BANCOS_BRASILEIROS.filter(b => b.code.startsWith(v.padStart(1, ''))).slice(0, 8);
      setSuggestions(matches);
      setShowDropdown(matches.length > 0);
    } else {
      setSuggestions([]);
      setShowDropdown(false);
    }
    // Atualiza sem resolver nome ainda
    onSelect({ code: v, name: nameInput });
    setActiveIdx(-1);
  };

  const handleNameChange = (val) => {
    const upper = val.toUpperCase();
    setNameInput(upper);
    onSelect({ code: codeInput, name: upper });

    if (upper.length >= 2) {
      const matches = BANCOS_BRASILEIROS.filter(b =>
        b.name.includes(upper) || b.code.includes(upper)
      ).slice(0, 8);
      setSuggestions(matches);
      setShowDropdown(matches.length > 0);
    } else {
      setSuggestions([]);
      setShowDropdown(false);
    }
    setActiveIdx(-1);
  };

  const selectSuggestion = (b) => {
    setCodeInput(b.code);
    setNameInput(b.name);
    onSelect({ code: b.code, name: b.name });
    setSuggestions([]);
    setShowDropdown(false);
    setActiveIdx(-1);
  };

  const handleKeyDown = (e) => {
    if (!showDropdown || suggestions.length === 0) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, suggestions.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter' && activeIdx >= 0) { e.preventDefault(); selectSuggestion(suggestions[activeIdx]); }
    else if (e.key === 'Escape') { setShowDropdown(false); }
  };

  // Fecha dropdown ao clicar fora
  useEffect(() => {
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div className="grid grid-cols-2 gap-2" ref={dropdownRef}>
      {/* Código */}
      <div className="relative">
        <label className="block text-xs font-medium text-muted-foreground mb-1">Cód. Banco</label>
        <input
          className="input-field font-mono"
          placeholder="756"
          value={codeInput}
          maxLength={3}
          onChange={e => handleCodeChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => codeInput && suggestions.length > 0 && setShowDropdown(true)}
        />
      </div>

      {/* Nome */}
      <div className="relative sm:col-span-1">
        <label className="block text-xs font-medium text-muted-foreground mb-1">Banco / Cooperativa *</label>
        <input
          ref={nameRef}
          className="input-field uppercase"
          placeholder="Ex: SICOOB, BRADESCO"
          value={nameInput}
          onChange={e => handleNameChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => nameInput.length >= 2 && suggestions.length > 0 && setShowDropdown(true)}
        />
      </div>

      {/* Dropdown de sugestões — span ambas colunas */}
      {showDropdown && suggestions.length > 0 && (
        <div className="col-span-2 relative z-50">
          <div className="absolute top-0 left-0 right-0 bg-white border border-border rounded-xl shadow-lg overflow-hidden">
            {suggestions.map((b, i) => (
              <button
                key={b.code}
                type="button"
                onMouseDown={() => selectSuggestion(b)}
                className={`w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-gray-50 transition-colors ${i === activeIdx ? 'bg-gray-100' : ''}`}
              >
                <span className="inline-flex items-center px-1.5 py-0.5 bg-foreground text-primary-foreground text-xs font-mono font-bold rounded shrink-0">
                  {b.code}
                </span>
                <span className="text-xs font-medium text-foreground truncate">{b.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}