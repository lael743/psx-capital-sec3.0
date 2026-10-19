/**
 * ViewMode Context
 * Controla o modo de visualização: "interno" (operador) ou "cliente" (PDF/externo).
 * - Tela: sempre "interno"
 * - PDF do cliente: sempre "cliente"
 *
 * Uso:
 *   const { isInterno, isCliente } = useViewMode();
 *   if (isInterno) { ... exibe lucro, margem, indicadores ... }
 */
import { createContext, useContext, useState } from 'react';

const ViewModeContext = createContext({ mode: 'interno' });

export function ViewModeProvider({ children, initialMode = 'interno' }) {
  const [mode, setMode] = useState(initialMode);
  return (
    <ViewModeContext.Provider value={{ mode, setMode, isInterno: mode === 'interno', isCliente: mode === 'cliente' }}>
      {children}
    </ViewModeContext.Provider>
  );
}

export function useViewMode() {
  return useContext(ViewModeContext);
}

/**
 * Filtra campos de uma operação para a visão cliente.
 * Remove lucro, margens, custos de capital e indicadores internos.
 */
export function filterOperacaoParaCliente(op) {
  if (!op) return op;
  const {
    // campos INTERNOS — ocultados na visão cliente
    projected_profit: _pp,
    realized_profit: _rp,
    capital_cost: _cc,
    overdue_probability: _ovp,
    days_overdue: _do,
    internal_score: _is,
    // mantém o restante
    ...clientFields
  } = op;
  return clientFields;
}

/**
 * Campos visíveis por modo.
 * Use para decidir condicionalmente o que renderizar na UI.
 */
export const CAMPOS_INTERNOS = [
  'projected_profit',
  'realized_profit',
  'capital_cost',
  'overdue_probability',
  'days_overdue',
];