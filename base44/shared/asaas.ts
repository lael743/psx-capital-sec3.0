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
    throw new Error(`Asaas ${res.status}: ${msg}`);
  }
  return body;
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