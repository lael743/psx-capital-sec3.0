/**
 * Hook para rascunho automático de operações.
 * Salva periodicamente no localStorage e ao sair da página.
 * Permite recuperar dados em caso de travamento ou fechamento acidental.
 */
import { useEffect, useRef, useCallback } from 'react';

const DRAFT_KEY = 'psx_operacao_draft';

export function useDraft(form, cheques, enabled = true) {
  const timerRef = useRef(null);

  const saveDraft = useCallback(() => {
    if (!enabled) return;
    try {
      const draft = {
        savedAt: new Date().toISOString(),
        form,
        cheques: cheques.map(c => ({
          ...c,
          // Não salva estado transitório de upload
          _uploading: false,
          _scanning: false,
        })),
      };
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch {}
  }, [form, cheques, enabled]);

  // Salva a cada 15 segundos
  useEffect(() => {
    if (!enabled) return;
    timerRef.current = setInterval(saveDraft, 15000);
    return () => clearInterval(timerRef.current);
  }, [saveDraft, enabled]);

  // Salva ao fechar/sair da aba
  useEffect(() => {
    if (!enabled) return;
    window.addEventListener('beforeunload', saveDraft);
    return () => window.removeEventListener('beforeunload', saveDraft);
  }, [saveDraft, enabled]);

  const clearDraft = useCallback(() => {
    localStorage.removeItem(DRAFT_KEY);
  }, []);

  return { saveDraft, clearDraft };
}

export function loadDraft() {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const draft = JSON.parse(raw);
    if (!draft?.form || !draft?.cheques) return null;
    return draft;
  } catch {
    return null;
  }
}

export function hasDraft() {
  return !!localStorage.getItem(DRAFT_KEY);
}