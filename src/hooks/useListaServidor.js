import { useCallback, useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';

/**
 * Lista paginada no servidor.
 *
 * A busca, os filtros e a paginação são enviados na consulta — o navegador
 * recebe apenas a página corrente. O total vem de um count() no servidor.
 *
 * @param {string} entity - nome da entidade
 * @param {object} filter - consulta (aceita operadores Mongo, ex: { $regex })
 * @param {object} [options] - { sort, limit, enabled }
 */
export default function useListaServidor(entity, filter = {}, options = {}) {
  const { sort = '-created_date', limit = 25, enabled = true } = options;
  const [state, setState] = useState({ page: 0, cursors: [null] });
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  const key = JSON.stringify(filter || {});

  // Reset da paginação quando os filtros mudam
  useEffect(() => {
    setState(s => (s.page === 0 && s.cursors.length === 1 ? s : { page: 0, cursors: [null] }));
  }, [key]);

  useEffect(() => {
    if (!enabled) { setLoading(false); return undefined; }
    let alive = true;
    setLoading(true);
    const query = JSON.parse(key);
    const cursor = state.cursors[state.page] || undefined;

    Promise.all([
      base44.entities[entity].filter(query, { sort, limit, ...(cursor ? { cursor } : {}) }),
      state.page === 0 ? base44.entities[entity].count(query) : Promise.resolve(null),
    ])
      .then(([res, cnt]) => {
        if (!alive) return;
        // Consultas paginadas devolvem { items, next_cursor, has_more }; listas simples devolvem array
        setItems(Array.isArray(res) ? res : (res?.items || []));
        setHasMore(Array.isArray(res) ? false : !!res?.has_more);
        if (cnt !== null && cnt !== undefined) setTotal(Array.isArray(cnt) ? cnt.length : cnt);
        if (!Array.isArray(res) && res?.next_cursor) {
          const nextCursor = res.next_cursor;
          setState(s => (s.cursors[s.page + 1] === nextCursor
            ? s
            : { ...s, cursors: [...s.cursors.slice(0, s.page + 1), nextCursor] }));
        }
        setLoading(false);
      })
      .catch(() => {
        if (!alive) return;
        setItems([]);
        setLoading(false);
      });

    return () => { alive = false; };
  }, [entity, key, sort, limit, enabled, state.page, state.cursors, tick]);

  const reload = useCallback(() => {
    setState({ page: 0, cursors: [null] });
    setTick(t => t + 1);
  }, []);

  const next = useCallback(() => setState(s => ({ ...s, page: s.page + 1 })), []);
  const prev = useCallback(() => setState(s => ({ ...s, page: Math.max(0, s.page - 1) })), []);

  return {
    items,
    total,
    hasMore,
    loading,
    page: state.page,
    pageSize: limit,
    reload,
    next,
    prev,
    canPrev: state.page > 0,
    canNext: hasMore,
  };
}