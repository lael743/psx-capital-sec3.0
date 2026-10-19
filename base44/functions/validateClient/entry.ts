import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

function formatCPF(v) {
  return v.replace(/\D/g, '').replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
}

function formatCNPJ(v) {
  return v.replace(/\D/g, '').replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
}

function validateCPF(cpf) {
  const digits = cpf.replace(/\D/g, '');
  if (digits.length !== 11) return false;
  if (/^(\d)\1+$/.test(digits)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(digits[i]) * (10 - i);
  let r = (sum * 10) % 11;
  if (r === 10 || r === 11) r = 0;
  if (r !== parseInt(digits[9])) return false;
  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(digits[i]) * (11 - i);
  r = (sum * 10) % 11;
  if (r === 10 || r === 11) r = 0;
  return r === parseInt(digits[10]);
}

function validateCNPJ(cnpj) {
  const digits = cnpj.replace(/\D/g, '');
  if (digits.length !== 14) return false;
  if (/^(\d)\1+$/.test(digits)) return false;
  const calc = (d, weights) => {
    let sum = 0;
    for (let i = 0; i < weights.length; i++) sum += parseInt(d[i]) * weights[i];
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const w2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  return calc(digits, w1) === parseInt(digits[12]) && calc(digits, w2) === parseInt(digits[13]);
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { document, document_type, exclude_id } = await req.json();

    if (!document) return Response.json({ valid: false, error: 'Documento obrigatório' });

    const digits = document.replace(/\D/g, '');
    const errors = [];

    // Validate format and digits
    if (document_type === 'CPF') {
      if (digits.length !== 11) errors.push('CPF deve ter 11 dígitos');
      else if (!validateCPF(digits)) errors.push('CPF inválido');
    } else {
      if (digits.length !== 14) errors.push('CNPJ deve ter 14 dígitos');
      else if (!validateCNPJ(digits)) errors.push('CNPJ inválido');
    }

    if (errors.length > 0) {
      return Response.json({ valid: false, errors });
    }

    // Check for duplicate using service role
    const formatted = document_type === 'CPF' ? formatCPF(digits) : formatCNPJ(digits);
    const existing = await base44.asServiceRole.entities.Client.filter({ document: formatted });
    const duplicate = existing.find(c => !exclude_id || c.id !== exclude_id);

    if (duplicate) {
      return Response.json({
        valid: false,
        errors: [`${document_type} já cadastrado para o cliente "${duplicate.name}"`],
        duplicate_id: duplicate.id,
      });
    }

    return Response.json({ valid: true, formatted });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});