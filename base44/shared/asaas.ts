export const ASAAS_BASE_URL = "https://api.asaas.com/v3";

export function getAsaasHeaders(apiKey) {
  if (!apiKey) throw new Error("ASAAS_API_KEY não configurado");
  return {
    "access_token": apiKey,
    "User-Agent": "PSXCapital/1.0",
    "accept": "application/json",
    "content-type": "application/json",
  };
}

export async function asaasRequest(path, options = {}, apiKey) {
  const url = `${ASAAS_BASE_URL}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: { ...getAsaasHeaders(apiKey), ...(options.headers || {}) },
  });
  const text = await res.text();
  let body;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!res.ok) {
    const msg = (body && body.errors && body.errors[0] && body.errors[0].description)
      || (body && body.message)
      || text
      || `Asaas API error ${res.status}`;
    const err = new Error(`Asaas ${res.status}: ${msg}`);
    // D1.4 — o status HTTP estruturado. Sem ele os chamadores reconheciam uma
    // cobrança removida por SUBSTRING da mensagem ("404" dentro de um texto de
    // erro 400, por exemplo), o que podia tratar um erro qualquer como prova
    // de exclusão. Agora a decisão usa `err.status`.
    err.status = res.status;
    err.asaas = body;
    throw err;
  }
  return body;
}

/**
 * D1.4 — Conciliação: consulta cobranças pela nossa referência externa.
 *
 * O Asaas NÃO oferece chave de idempotência para POST /payments (o
 * `externalReference` é documentado como "campo livre de busca", sem garantia
 * de unicidade). A recuperação de uma resposta ambígua é, portanto, por
 * CONSULTA: se a criação foi enviada e a resposta se perdeu, procuramos a
 * cobrança que já existe antes de decidir repetir.
 */
export async function findPaymentsByExternalReference(externalReference, apiKey) {
  if (!externalReference) return [];
  const q = encodeURIComponent(externalReference);
  const body = await asaasRequest(`/payments?externalReference=${q}&limit=100`, {}, apiKey);
  const lista = (body && body.data) || [];
  return lista.filter((p) => p.externalReference === externalReference);
}

// Map Asaas payment status to internal status
export function mapAsaasStatus(asaasStatus) {
  switch (asaasStatus) {
    case "PENDING": return "pending";
    case "CONFIRMED": return "confirmed";
    case "RECEIVED": return "received";
    case "OVERDUE": return "overdue";
    case "REFUNDED": return "refunded";
    case "DELETED": return "deleted";
    default: return "pending";
  }
}

// Build customer payload from Sacado data
export function buildCustomerPayload(sacado) {
  const payload = {
    name: sacado.nome,
    cpfCnpj: sacado.document,
    email: sacado.email || undefined,
    mobilePhone: sacado.phone || undefined,
    externalReference: sacado.id,
  };
  if (sacado.address) payload.address = sacado.address;
  if (sacado.zip_code) payload.postalCode = sacado.zip_code;
  if (sacado.state) payload.province = sacado.state;
  if (sacado.city) payload.municipality = sacado.city;
  Object.keys(payload).forEach(k => payload[k] === undefined && delete payload[k]);
  return payload;
}