import { useState, useRef } from 'react';

/**
 * Input de moeda brasileiro.
 * - Enquanto focado: aceita digitação livre (números e vírgula/ponto)
 * - Ao sair do foco: formata como R$ 1.000,00
 * - value: número (ou string numérica)
 * - onChange(numericValue: string)  ex: "1500.50"
 */
export default function CurrencyInput({ value, onChange, onBlur: onBlurProp, onKeyDown, inputRef: externalRef, placeholder = 'R$ 0,00', className = '' }) {
  const [focused, setFocused] = useState(false);
  const internalRef = useRef(null);
  const inputRef = externalRef || internalRef;

  const numericValue = parseFloat(value) || 0;

  // Texto exibido enquanto focado: o que o usuário digita (sem máscara)
  const [rawText, setRawText] = useState('');

  const handleFocus = () => {
    setFocused(true);
    // Mostra o número sem formatação para facilitar edição
    setRawText(numericValue > 0 ? String(numericValue).replace('.', ',') : '');
  };

  const handleBlur = () => {
    setFocused(false);
    // Converte para número ao sair
    const cleaned = rawText.replace(/\./g, '').replace(',', '.');
    const num = parseFloat(cleaned);
    if (!isNaN(num) && num > 0) {
      onChange(String(num));
    } else if (rawText === '') {
      onChange('');
    }
    if (onBlurProp) onBlurProp();
  };

  const handleChange = (e) => {
    const val = e.target.value;
    // Permite apenas dígitos, vírgula e ponto
    if (/^[\d.,]*$/.test(val)) {
      setRawText(val);
    }
  };

  const formatted = numericValue > 0
    ? numericValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    : '';

  return (
    <input
      ref={inputRef}
      type="text"
      inputMode="decimal"
      className={`input-field ${className}`}
      placeholder={placeholder}
      value={focused ? rawText : formatted}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onChange={handleChange}
      onKeyDown={onKeyDown}
    />
  );
}