/**
 * Financial calculation utilities for PSX Capital
 */

/**
 * Helper interno: taxa diária proporcional arredondada para 2 casas decimais (em %).
 * Ex: 4% / 30 = 0,1333...% → arredonda para 0,14%
 */
function roundedDailyRatePercent(monthlyRate) {
  return Math.ceil((monthlyRate / 30) * 100) / 100;
}

/**
 * Calculate daily rate from monthly rate
 */
export function dailyRate(monthlyRate) {
  return monthlyRate / 100 / 30;
}

/**
 * Effective days used for the proportional rate calculation, according to the
 * "fração de mês" rounding mode.
 *
 * mode 'none'        → returns the real days (default, proportional to exact days)
 * mode 'min15_full'  → rounds the remainder of each 30-day month up:
 *                      remainder 0      → 0   (mês cheio mantido)
 *                      remainder 1..15  → 15  (meio mês / meia taxa)
 *                      remainder 16..29 → 30  (mês cheio)
 *
 * Exemplos (taxa mensal de 4%):
 *   8  dias → 15  (meia taxa = 2%)
 *   18 dias → 30  (taxa cheia = 4%)
 *   30 dias → 30  (mês cheio)
 *   48 dias → 60  (2 meses cheios)
 */
export function effectiveRateDays(days, mode) {
  if (mode !== 'min15_full' || days <= 0) return days;
  const fullMonths = Math.floor(days / 30);
  const rem = days - fullMonths * 30;
  let effRem;
  if (rem === 0) effRem = 0;
  else if (rem <= 15) effRem = 15;
  else effRem = 30;
  return fullMonths * 30 + effRem;
}

/**
 * Calculate interest (simple)
 * A taxa diária proporcional é arredondada para 2 casas decimais antes do cálculo.
 * Ex: 4%/30 = 0,14% ao dia → principal × 0,14% × dias
 */
export function simpleInterest(principal, monthlyRate, days) {
  const dailyRatePct = roundedDailyRatePercent(monthlyRate);
  const rate = dailyRatePct / 100;
  return principal * rate * days;
}

/**
 * Calculate interest (compound) — juros sobre juros, sempre maior que simples
 * A taxa diária proporcional é arredondada para 2 casas decimais antes do cálculo.
 * Ex: 4%/30 = 0,14% ao dia → principal × ((1 + 0,0014)^dias - 1)
 */
export function compoundInterest(principal, monthlyRate, days) {
  const dailyRatePct = roundedDailyRatePercent(monthlyRate);
  const dailyR = dailyRatePct / 100;
  return principal * (Math.pow(1 + dailyR, days) - 1);
}

/**
 * Calculate total receivable
 */
export function calcTotalReceivable(principal, monthlyRate, days, interestType = 'simples') {
  const interest = interestType === 'composto'
    ? compoundInterest(principal, monthlyRate, days)
    : simpleInterest(principal, monthlyRate, days);
  return principal + interest;
}

/**
 * Calculate installment schedule with individual due dates.
 *
 * Supports 3 calculation modes (calcMode):
 *   'padrao' — user enters net value; total_i = principal_i / (1 − rate × days_i/30)
 *   'inverso' — user enters total receivable; net_i = principal_i × (1 − rate × days_i/30)
 *   'desconto_direto' — user enters net value; total_i = principal_i × (1 + rate × days_i/30)
 *   'juros_cedente' — sacado paga principal sem juros; juros pertencem ao cedente
 *
 * Mode "price" (parcelas iguais): soma os totais individuais e divide igualmente.
 * Mode "gradativo": cada parcela mantém seu valor individual calculado.
 *
 * @param {number} principal — significado depende do calcMode (líquido ou recebível)
 * @param {number} monthlyRate - %
 * @param {string} interestType - 'simples' | 'composto'
 * @param {string} startDate
 * @param {string[]} dueDates
 * @param {string} [mode] - 'price' (default) | 'gradativo'
 * @param {string} [calcMode] - 'padrao' (default) | 'inverso' | 'desconto_direto'
 */
export function calcInstallmentScheduleByDates(principal, monthlyRate, interestType, startDate, dueDates, mode = 'price', calcMode = 'padrao', rateRoundingMode = 'none') {
  const n = dueDates.length;
  if (n === 0) return [];

  const principalPer = principal / n;

  // Calcula cada parcela individualmente conforme o modo
  const rows = dueDates.map(dueDate => {
    const days = daysBetween(startDate, dueDate);
    const rateDays = effectiveRateDays(days, rateRoundingMode);
    const taxaProp = (monthlyRate / 100) * (rateDays / 30);

    let value_i, princ_i, interest_i;

    if (calcMode === 'inverso') {
      // user entered total receivable; principal_i = total/n (gross share)
      // value = gross share (what client pays); principal = net = gross × (1 − taxa)
      value_i = principalPer;
      princ_i = Math.round(principalPer * (1 - taxaProp) * 100) / 100;
      interest_i = Math.round((value_i - princ_i) * 100) / 100;
    } else if (calcMode === 'desconto_direto') {
      // user entered net value; principal_i = net/n
      // total = net/n × (1 + taxa) = simple interest added
      princ_i = principalPer;
      interest_i = Math.round(princ_i * taxaProp * 100) / 100;
      value_i = Math.round((princ_i + interest_i) * 100) / 100;
    } else if (calcMode === 'juros_cedente') {
      // Sacado paga apenas o principal dividido igualmente (sem markup de juros)
      // Juros seguem fórmula de fomento: principal / (1 - taxa) - principal
      value_i = principalPer;
      princ_i = principalPer;
      if (interestType === 'composto') {
        const dailyR = roundedDailyRatePercent(monthlyRate) / 100;
        interest_i = Math.round(princ_i * (Math.pow(1 + dailyR, rateDays) - 1) * 100) / 100;
      } else {
        const fator = 1 - taxaProp;
        const totalComJuros = fator > 0 ? Math.round((princ_i / fator) * 100) / 100 : princ_i;
        interest_i = Math.round((totalComJuros - princ_i) * 100) / 100;
      }
    } else {
      // padrao: user entered net value; principal_i = net/n
      // total = net/n / (1 − taxa)
      princ_i = principalPer;
      if (interestType === 'composto') {
        const dailyR = roundedDailyRatePercent(monthlyRate) / 100;
        value_i = Math.round(princ_i * Math.pow(1 + dailyR, rateDays) * 100) / 100;
        interest_i = Math.round((value_i - princ_i) * 100) / 100;
      } else {
        const fator = 1 - taxaProp;
        value_i = fator > 0 ? Math.round((princ_i / fator) * 100) / 100 : princ_i;
        interest_i = Math.round((value_i - princ_i) * 100) / 100;
      }
    }

    return { princ_i, value_i, interest_i, days, due_date: dueDate };
  });

  if (mode === 'gradativo') {
    return rows.map((r, i) => ({
      number: i + 1,
      value: r.value_i,
      principal: Math.round(r.princ_i * 100) / 100,
      interest: r.interest_i,
      days: r.days,
      due_date: r.due_date,
      status: 'pendente',
      paid: false,
    }));
  }

  // price mode: soma total individual e divide igualmente
  const totalSum = rows.reduce((s, r) => s + r.value_i, 0);
  const principalSum = rows.reduce((s, r) => s + r.princ_i, 0);
  const equalValue = Math.round((totalSum / n) * 100) / 100;
  const equalPrincipal = Math.round((principalSum / n) * 100) / 100;

  return rows.map((r, i) => {
    const isLast = i === n - 1;
    const prevSum = Math.round(equalValue * (n - 1) * 100) / 100;
    const lastValue = Math.round((totalSum - prevSum) * 100) / 100;
    const val = isLast ? lastValue : equalValue;
    return {
      number: i + 1,
      value: val,
      principal: equalPrincipal,
      interest: calcMode === 'juros_cedente' ? r.interest_i : Math.round((val - equalPrincipal) * 100) / 100,
      days: r.days,
      due_date: r.due_date,
      status: 'pendente',
      paid: false,
    };
  });
}

/**
 * Calculate total receivable from installment schedule
 */
export function calcTotalFromSchedule(schedule) {
  return schedule.reduce((sum, inst) => sum + inst.value, 0);
}

/**
 * Estrutura "Capital no Vencimento + Deságio Parcelado".
 *
 * O capital (principal) é pago em parcela única no vencimento da operação
 * (último vencimento informado). O deságio (juros) é calculado pela fórmula
 * do desconto comercial (bank discount):
 *
 *   total   = capital / (1 − taxa_mensal × meses)
 *   deságio = total − capital
 *
 * onde meses = dias até o último vencimento ÷ 30.
 *
 * O deságio é dividido em N parcelas mensais iguais (a última absorve o
 * arredondamento) e o capital é somado à última parcela (vencimento).
 *
 * @param {number} capital   - valor liberado ao cliente (líquido)
 * @param {number} monthlyRate - taxa mensal em %
 * @param {string} startDate  - data de liberação (YYYY-MM-DD)
 * @param {string[]} dueDates - vencimentos das parcelas (último = vencimento)
 */
export function calcCapitalDesagioSchedule(capital, monthlyRate, startDate, dueDates) {
  const n = dueDates.length;
  if (n === 0 || capital <= 0 || monthlyRate <= 0) return [];
  const lastDays = daysBetween(startDate, dueDates[n - 1]);
  const meses = lastDays / 30;
  const fator = 1 - (monthlyRate / 100) * meses;
  if (fator <= 0) {
    return dueDates.map((due_date, i) => ({
      number: i + 1, value: 0, principal: 0, interest: 0,
      days: daysBetween(startDate, due_date), due_date, status: 'pendente', paid: false,
    }));
  }
  const total = Math.round((capital / fator) * 100) / 100;
  const desagio = Math.round((total - capital) * 100) / 100;
  const desagioPer = Math.round((desagio / n) * 100) / 100;
  return dueDates.map((due_date, i) => {
    const days = daysBetween(startDate, due_date);
    const isLast = i === n - 1;
    let interest = isLast
      ? Math.round((desagio - desagioPer * (n - 1)) * 100) / 100
      : desagioPer;
    if (interest < 0) interest = 0;
    const principal = isLast ? Math.round(capital * 100) / 100 : 0;
    const value = Math.round((interest + principal) * 100) / 100;
    return { number: i + 1, value, principal, interest, days, due_date, status: 'pendente', paid: false };
  });
}

/**
 * Generate default due dates for N installments with given interval (days) from start.
 * If firstDueDate is provided, the first installment uses that date and subsequent ones
 * are spaced intervalDays from it.
 */
export function generateDueDates(startDate, installments, intervalDays = 30, firstDueDate = null) {
  if (!startDate) return Array(installments).fill('');
  const start = new Date(startDate + 'T00:00:00');
  if (isNaN(start.getTime())) return Array(installments).fill('');
  const dates = [];

  if (firstDueDate && installments >= 1) {
    // First installment uses the specified date
    dates.push(firstDueDate);
    const first = new Date(firstDueDate + 'T00:00:00');
    for (let i = 1; i < installments; i++) {
      const d = new Date(first);
      d.setDate(d.getDate() + intervalDays * i);
      dates.push(d.toISOString().split('T')[0]);
    }
  } else {
    for (let i = 1; i <= installments; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + intervalDays * i);
      dates.push(d.toISOString().split('T')[0]);
    }
  }

  return dates;
}

/**
 * Calculate installment schedule (legacy - kept for compatibility)
 */
export function calcInstallmentSchedule(totalReceivable, installments, startDate, dueDate) {
  if (installments <= 1) {
    return [{
      number: 1,
      value: totalReceivable,
      due_date: dueDate,
      status: 'pendente',
      paid: false,
    }];
  }
  const schedule = [];
  const installmentValue = totalReceivable / installments;
  const start = new Date(startDate);
  const end = new Date(dueDate);
  const totalDays = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
  const intervalDays = Math.ceil(totalDays / installments);

  for (let i = 0; i < installments; i++) {
    const dDate = new Date(start);
    dDate.setDate(dDate.getDate() + intervalDays * (i + 1));
    schedule.push({
      number: i + 1,
      value: installmentValue,
      due_date: dDate.toISOString().split('T')[0],
      status: 'pendente',
      paid: false,
    });
  }
  return schedule;
}

/**
 * Days between two date strings
 */
export function daysBetween(startDate, endDate) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  return Math.max(0, Math.ceil((end - start) / (1000 * 60 * 60 * 24)));
}

/**
 * Days overdue from a reference date (default: today)
 */
export function daysOverdue(dueDate, refDate = new Date()) {
  const today = new Date(refDate);
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate);
  const diff = Math.ceil((today - due) / (1000 * 60 * 60 * 24));
  return Math.max(0, diff);
}

/**
 * Calculate late (overdue) interest from due_date to a reference date (default: today).
 * Interest is proportional to days: principal × (monthlyRate/100) × (days/30).
 * Returns { days, interest, total }.
 */
export function calcLateInterest(principal, monthlyRate, dueDate, refDate = new Date()) {
  const days = daysOverdue(dueDate, refDate);
  if (days <= 0 || !monthlyRate || monthlyRate <= 0) return { days, interest: 0, total: principal };
  const interest = principal * (monthlyRate / 100) * (days / 30);
  return { days, interest, total: principal + interest };
}

/**
 * Determine operation status based on due date and payments
 */
export function calcOperationStatus(dueDate, amountPaid, totalReceivable) {
  const overdue = daysOverdue(dueDate);
  if (amountPaid >= totalReceivable) return 'quitado';
  if (overdue === 0) return 'ativo';
  if (overdue <= 15) return 'atrasado';
  if (overdue <= 60) return 'atrasado';
  return 'inadimplente';
}

/**
 * Format currency BRL
 */
export function formatCurrency(value) {
  if (value === null || value === undefined) return 'R$ 0,00';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

/**
 * Format percentage
 */
export function formatPercent(value) {
  if (value === null || value === undefined) return '0,00%';
  return `${Number(value).toFixed(2).replace('.', ',')}%`;
}

/**
 * Format date BR
 * Suporta tanto "YYYY-MM-DD" quanto timestamps ISO completos
 */
export function formatDate(dateStr) {
  if (!dateStr) return '-';
  // Se já tem hora (ISO completo), usa direto; caso contrário força meia-noite local
  const d = dateStr.includes('T') ? new Date(dateStr) : new Date(dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('pt-BR');
}

/**
 * Today as ISO date string
 */
export function today() {
  return new Date().toISOString().split('T')[0];
}

/**
 * Classify overdue severity
 */
export function overdueClass(daysOverdue) {
  if (daysOverdue === 0) return 'em_dia';
  if (daysOverdue <= 15) return 'atrasado_leve';
  if (daysOverdue <= 60) return 'critico';
  return 'perda_provavel';
}