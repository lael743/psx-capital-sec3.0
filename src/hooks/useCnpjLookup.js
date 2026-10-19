import { useState, useCallback, useRef } from 'react';
import { fetchCnpjData, isCnpjComplete } from '@/lib/brasilApi';

/**
 * Hook que gerencia a consulta de CNPJ na BrasilAPI.
 * Retorna estado de loading/erro e uma função `lookup` que,
 * ao receber um CNPJ completo, busca os dados e aplica o preenchimento.
 *
 * @param {(data: object) => void} onResult callback chamado com os dados normalizados
 * @returns {{ loading: boolean, error: string, lookup: (cnpj: string) => Promise<void> }}
 */
export function useCnpjLookup(onResult) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const lastCnpjRef = useRef('');

  const lookup = useCallback(async (cnpj) => {
    if (!isCnpjComplete(cnpj)) return;
    const clean = cnpj.replace(/\D/g, '');
    if (clean === lastCnpjRef.current) return; // evita consulta duplicada
    lastCnpjRef.current = clean;

    setLoading(true);
    setError('');
    try {
      const data = await fetchCnpjData(cnpj);
      if (!data) {
        setError('CNPJ não encontrado na BrasilAPI.');
        return;
      }
      onResult?.(data);
    } catch (e) {
      setError('Falha ao consultar CNPJ: ' + (e.message || 'erro desconhecido'));
    } finally {
      setLoading(false);
    }
  }, [onResult]);

  return { loading, error, lookup };
}