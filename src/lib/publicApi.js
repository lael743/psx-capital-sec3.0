import { appParams } from '@/lib/app-params';

/**
 * Invoca uma função backend pública (sem autenticação) usando o URL correto
 * com o prefixo /api/apps/{appId}/functions/{fn}.
 */
export async function invokePublic(fn, data, { method = 'POST' } = {}) {
  const appId = appParams.appId || import.meta.env.VITE_BASE44_APP_ID;
  const url = `/api/apps/${appId}/functions/${fn}`;
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: data !== undefined ? JSON.stringify(data) : undefined,
  });
  const json = await res.json();
  if (!res.ok) throw { response: { data: json, status: res.status } };
  return { data: json };
}

/**
 * Versão GET para funções que recebem parâmetros via query string.
 */
export async function invokePublicGet(fn, queryParams = {}) {
  const appId = appParams.appId || import.meta.env.VITE_BASE44_APP_ID;
  const qs = new URLSearchParams(queryParams).toString();
  const url = `/api/apps/${appId}/functions/${fn}${qs ? `?${qs}` : ''}`;
  const res = await fetch(url);
  const json = await res.json();
  if (!res.ok) throw { response: { data: json, status: res.status } };
  return { data: json };
}