// Máscara de moeda brasileira: R$ 1.000,00
export function maskCurrency(value) {
  const digits = String(value).replace(/\D/g, '');
  if (!digits) return '';
  const num = parseInt(digits, 10) / 100;
  return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// Retorna apenas o valor numérico (sem símbolos) de uma string formatada com moeda
export function unmaskCurrency(value) {
  const digits = String(value).replace(/\D/g, '');
  return digits ? (parseInt(digits, 10) / 100).toString() : '';
}

// Máscara de telefone: (69) 9 0000-0000
export function maskPhone(value) {
  const digits = String(value).replace(/\D/g, '').slice(0, 11);
  if (!digits) return '';
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  return `(${digits.slice(0, 2)}) ${digits[2]} ${digits.slice(3, 7)}-${digits.slice(7)}`;
}

// Retorna apenas dígitos do telefone
export function unmaskPhone(value) {
  return String(value).replace(/\D/g, '');
}

// Máscara de CPF/CNPJ (detecta automaticamente pelo número de dígitos)
// CPF:  000.000.000-00      (11 dígitos)
// CNPJ: 00.000.000/0000-00  (14 dígitos)
export function maskCpfCnpj(value) {
  const digits = String(value).replace(/\D/g, '').slice(0, 14);
  if (!digits) return '';
  if (digits.length <= 11) {
    // CPF
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
    if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
  }
  // CNPJ
  if (digits.length <= 12) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8)}`;
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
}