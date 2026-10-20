/**
 * M1 — EXCERTO de `src/lib/finance.js` para o servidor.
 *
 * `chequeWrite` usa UMA função de data: `daysOverdue`. Copiar o módulo inteiro
 * (399 linhas de formatação e cálculo comercial) só para isso ampliaria a
 * superfície de divergência sem necessidade — e o cálculo comercial NÃO é
 * escopo desta fase.
 *
 * Por isso este arquivo contém apenas a função necessária, IDÊNTICA à do
 * frontend. O teste M1.2 compara o resultado das duas implementações numa
 * tabela de datas; qualquer divergência quebra o teste.
 */

export function daysOverdue(dueDate, refDate = new Date()) {
  const today = new Date(refDate);
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate);
  const diff = Math.ceil((today - due) / (1000 * 60 * 60 * 24));
  return Math.max(0, diff);
}