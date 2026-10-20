import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  calcularSaldosSombra,
  analisarDivergencias,
  classificarLancamento,
  TOLERANCIA,
} from './ledgerShadow.js';

const banco = (id, initial, current, nome) => ({
  id,
  name: nome || id,
  initial_balance: initial,
  current_balance: current,
});

const cf = (o) => ({
  id: o.id,
  type: o.type || 'entrada',
  amount: o.amount,
  date: o.date || '2026-01-10',
  category: o.category || 'lancamento_avulso',
  bank_id: o.bank_id,
  source_type: o.source_type,
  source_id: o.source_id,
  description: o.description || 'x',
});

// ───────────────────────── 1. saldo inicial e data-base ─────────────────────
test('D2.1 — saldo inicial sem movimentos é o saldo calculado', () => {
  const r = calcularSaldosSombra({
    bancos: [banco('b1', 1000, 1000)],
    lancamentos: [],
    dataBase: '2026-01-31',
  });
  assert.equal(r.contas[0].saldo_inicial, 1000);
  assert.equal(r.contas[0].saldo_calculado, 1000);
});

test('D2.2 — data-base é INCLUSIVA e corta o futuro', () => {
  const lanc = [
    cf({ id: 'a', amount: 100, date: '2026-01-31', bank_id: 'b1' }), // no limite, entra
    cf({ id: 'b', amount: 999, date: '2026-02-01', bank_id: 'b1' }), // depois, sai
  ];
  const r = calcularSaldosSombra({ bancos: [banco('b1', 0, 0)], lancamentos: lanc, dataBase: '2026-01-31' });
  assert.equal(r.contas[0].saldo_calculado, 100);
  assert.equal(r.fora_da_data_base, 1);
});

// ─────────────────────── 2. entradas e saídas efetivas ──────────────────────
test('D2.3 — entradas e saídas efetivas compõem o saldo', () => {
  const lanc = [
    cf({ id: 'e1', amount: 500, type: 'entrada', bank_id: 'b1' }),
    cf({ id: 's1', amount: 200, type: 'saida', bank_id: 'b1' }),
  ];
  const r = calcularSaldosSombra({ bancos: [banco('b1', 100, 0)], lancamentos: lanc, dataBase: '2026-12-31' });
  assert.equal(r.contas[0].entradas_efetivas, 500);
  assert.equal(r.contas[0].saidas_efetivas, 200);
  assert.equal(r.contas[0].saldo_calculado, 400);
});

test('D2.4 — consolidação soma as contas', () => {
  const lanc = [
    cf({ id: 'a', amount: 300, bank_id: 'b1' }),
    cf({ id: 'b', amount: 700, bank_id: 'b2' }),
  ];
  const r = calcularSaldosSombra({
    bancos: [banco('b1', 0, 0), banco('b2', 0, 0)],
    lancamentos: lanc,
    dataBase: '2026-12-31',
  });
  assert.equal(r.consolidado.saldo_calculado, 1000);
});

// ────────────── 3. previstos NÃO entram no saldo efetivo ────────────────────
test('D2.5 — boleto emitido não gera movimento: só CashFlow conta', () => {
  // A emissão vive em Operation. O módulo só recebe `lancamentos`, e não lê
  // Operation. Um boleto emitido, portanto, é invisível ao livro — como deve.
  const r = calcularSaldosSombra({
    bancos: [banco('b1', 0, 0)],
    lancamentos: [],
    dataBase: '2026-12-31',
  });
  assert.equal(r.consolidado.saldo_calculado, 0);
  assert.equal(r.contas[0].lancamentos_considerados, 0);
});

test('D2.6 — lançamento sem valor numérico é IGNORADO, não vira zero', () => {
  const lanc = [cf({ id: 'bad', amount: 0, bank_id: 'b1' })];
  const r = calcularSaldosSombra({ bancos: [banco('b1', 50, 50)], lancamentos: lanc, dataBase: '2026-12-31' });
  assert.equal(r.contas[0].saldo_calculado, 50);
  assert.equal(r.ignorados.length, 1);
  assert.ok(r.ignorados[0].motivos.includes('valor_invalido'));
});

// ────────────────────── 4. transferências internas ──────────────────────────
test('D2.7 — transferência completa não infla o consolidado', () => {
  const lanc = [
    cf({ id: 't1', amount: 400, type: 'saida', category: 'transferencia_interna', bank_id: 'b1' }),
    cf({ id: 't2', amount: 400, type: 'entrada', category: 'transferencia_interna', bank_id: 'b2' }),
  ];
  const r = calcularSaldosSombra({
    bancos: [banco('b1', 0, 0), banco('b2', 0, 0)],
    lancamentos: lanc,
    dataBase: '2026-12-31',
  });
  assert.equal(r.consolidado.transferencias_liquido, 0);
  assert.equal(r.consolidado.saldo_calculado, 0, 'consolidado não muda');
  assert.equal(r.contas[0].saldo_calculado, -400);
  assert.equal(r.contas[1].saldo_calculado, 400);
});

test('D2.8 — perna órfã é detectada como incompleta (sem pareamento por valor/data)', () => {
  // A D3 proíbe parear transferências históricas por valor + data. Uma perna
  // sem `transfer_id` não é pareada com nada: ela é "sem identificador" e,
  // como nunca pode ser provada completa, também conta como incompleta.
  const lanc = [
    cf({ id: 't1', amount: 400, type: 'saida', category: 'transferencia_interna', bank_id: 'b1' }),
  ];
  const rel = analisarDivergencias({
    bancos: [banco('b1', 0, -400)],
    lancamentos: lanc,
    dataBase: '2026-12-31',
  });
  assert.equal(rel.resumo.transferencias_incompletas, 1);
  assert.equal(rel.resumo.transferencias_sem_identificador, 1);
  assert.equal(rel.resumo.transferencias_completas, 0);
  assert.equal(rel.anomalias.transferencias_incompletas[0].transfer_id, null);
});

test('D2.9 — transferência sem bank_id não é atribuível a nenhuma conta', () => {
  const lanc = [
    cf({ id: 't1', amount: 400, type: 'saida', category: 'transferencia_interna' }),
    cf({ id: 't2', amount: 400, type: 'entrada', category: 'transferencia_interna' }),
  ];
  const rel = analisarDivergencias({
    bancos: [banco('b1', 0, 0)],
    lancamentos: lanc,
    dataBase: '2026-12-31',
  });
  assert.equal(rel.nao_atribuidos.quantidade, 2);
  assert.equal(rel.contas[0].classificacao, 'inconclusivo');
});

// ────────────────────────────── 5. estornos ─────────────────────────────────
test('D2.10 — estorno desfaz a movimentação anterior', () => {
  const lanc = [
    cf({ id: 'c1', amount: 1000, type: 'entrada', category: 'compensacao_cheque', bank_id: 'b1' }),
    cf({ id: 'e1', amount: 1000, type: 'saida', category: 'estorno_compensacao', bank_id: 'b1' }),
  ];
  const r = calcularSaldosSombra({ bancos: [banco('b1', 0, 0)], lancamentos: lanc, dataBase: '2026-12-31' });
  assert.equal(r.contas[0].estornos_saida, 1000);
  assert.equal(r.contas[0].saldo_calculado, 0);
});

test('D2.11 — estorno NÃO é tratado como transferência nem ignorado', () => {
  assert.equal(classificarLancamento(cf({ id: 'x', amount: 10, category: 'estorno_compensacao' })).efeito, 'estorno');
});

// ────────────────────── 6. duplicidades e origem ────────────────────────────
test('D2.12 — mesma origem lançada duas vezes é duplicidade suspeita', () => {
  const lanc = [
    cf({ id: 'a', amount: 100, bank_id: 'b1', source_type: 'cheque_compensacao', source_id: 'ch1' }),
    cf({ id: 'b', amount: 100, bank_id: 'b1', source_type: 'cheque_compensacao', source_id: 'ch1' }),
  ];
  const rel = analisarDivergencias({
    bancos: [banco('b1', 0, 200)],
    lancamentos: lanc,
    dataBase: '2026-12-31',
  });
  assert.equal(rel.resumo.duplicidades, 1);
  assert.equal(rel.anomalias.duplicidades[0].ocorrencias, 2);
  // O livro soma as duas: não cabe a ele decidir qual é a boa.
  assert.equal(rel.contas[0].saldo_calculado, 200);
});

test('D2.13 — lançamento sem origem é listado, não silenciado', () => {
  const lanc = [cf({ id: 'a', amount: 100, bank_id: 'b1' })];
  const rel = analisarDivergencias({
    bancos: [banco('b1', 0, 100)],
    lancamentos: lanc,
    dataBase: '2026-12-31',
  });
  assert.equal(rel.resumo.lancamentos_sem_origem, 1);
  assert.deepEqual(rel.anomalias.lancamentos_sem_origem, ['a']);
  assert.equal(rel.contas[0].classificacao, 'conforme');
});

// ─────────────────── 7. contas com histórico incompleto ─────────────────────
test('D2.14 — initial_balance ausente NÃO vira zero: é lacuna e inconclusivo', () => {
  const b = { id: 'b1', name: 'Sem inicial', current_balance: 500 };
  const rel = analisarDivergencias({
    bancos: [b],
    lancamentos: [cf({ id: 'a', amount: 100, bank_id: 'b1' })],
    dataBase: '2026-12-31',
  });
  assert.equal(rel.contas[0].saldo_calculado, null);
  assert.equal(rel.contas[0].classificacao, 'inconclusivo');
  assert.ok(rel.lacunas.some((l) => l.tipo === 'saldo_inicial_ausente'));
});

test('D2.15 — ausência de ledger_start_date é registrada como lacuna estrutural', () => {
  const rel = analisarDivergencias({
    bancos: [banco('b1', 0, 0)],
    lancamentos: [],
    dataBase: '2026-12-31',
  });
  assert.ok(rel.lacunas.some((l) => l.tipo === 'sem_data_de_corte'));
});

// ─────────────────── 8. datas de corte e inconsistências ────────────────────
test('D2.16 — lançamento com data inválida não entra e é reportado', () => {
  const lanc = [
    { id: 'x', type: 'entrada', amount: 999, date: '', category: 'lancamento_avulso', bank_id: 'b1' },
  ];
  const r = calcularSaldosSombra({ bancos: [banco('b1', 10, 10)], lancamentos: lanc, dataBase: '2026-12-31' });
  assert.equal(r.contas[0].saldo_calculado, 10);
  assert.equal(r.inconsistencias_data.length, 1);
});

test('D2.17 — dataBase inválida é recusada explicitamente', () => {
  assert.throws(() => calcularSaldosSombra({ bancos: [], lancamentos: [], dataBase: '31/01/2026' }), /dataBase/);
});

// ───────── 9. concorrência e repetição: o livro é determinístico ────────────
test('D2.18 — mesma lista em ordens diferentes produz o MESMO saldo', () => {
  const base = [
    cf({ id: 'a', amount: 100, bank_id: 'b1' }),
    cf({ id: 'b', amount: 50, type: 'saida', bank_id: 'b1' }),
    cf({ id: 'c', amount: 25, bank_id: 'b1' }),
    cf({ id: 'd', amount: 10, type: 'saida', category: 'estorno_compensacao', bank_id: 'b1' }),
  ];
  const a = calcularSaldosSombra({ bancos: [banco('b1', 7, 0)], lancamentos: base, dataBase: '2026-12-31' });
  const b = calcularSaldosSombra({
    bancos: [banco('b1', 7, 0)],
    lancamentos: [...base].reverse(),
    dataBase: '2026-12-31',
  });
  assert.equal(a.contas[0].saldo_calculado, b.contas[0].saldo_calculado);
  assert.equal(a.contas[0].saldo_calculado, 7 + 100 - 50 + 25 - 0 - 10);
});

test('D2.19 — recalcular não altera a entrada (função pura)', () => {
  const bancos = [banco('b1', 100, 100)];
  const lanc = [cf({ id: 'a', amount: 50, bank_id: 'b1' })];
  const copiaBancos = JSON.stringify(bancos);
  const copiaLanc = JSON.stringify(lanc);
  calcularSaldosSombra({ bancos, lancamentos: lanc, dataBase: '2026-12-31' });
  calcularSaldosSombra({ bancos, lancamentos: lanc, dataBase: '2026-12-31' });
  assert.equal(JSON.stringify(bancos), copiaBancos);
  assert.equal(JSON.stringify(lanc), copiaLanc);
});

// ─────────── 10. comparação calculado × registrado ──────────────────────────
test('D2.20 — registrado igual ao calculado é conforme', () => {
  const rel = analisarDivergencias({
    bancos: [banco('b1', 0, 150)],
    lancamentos: [cf({ id: 'a', amount: 150, bank_id: 'b1' })],
    dataBase: '2026-12-31',
  });
  assert.equal(rel.contas[0].classificacao, 'conforme');
  assert.ok(Math.abs(rel.contas[0].diferenca) <= TOLERANCIA);
});

test('D2.21 — divergência é explicada com rastreabilidade, sem correção', () => {
  const rel = analisarDivergencias({
    bancos: [banco('b1', 0, 1500)],
    lancamentos: [cf({ id: 'a', amount: 1000, bank_id: 'b1' })],
    dataBase: '2026-12-31',
  });
  const c = rel.contas[0];
  assert.equal(c.classificacao, 'divergente');
  assert.equal(c.saldo_calculado, 1000);
  assert.equal(c.saldo_registrado, 1500);
  assert.equal(c.diferenca, 500);
  assert.ok(c.explicacoes.some((e) => e.tipo === 'diferenca_sem_lancamento'));
});

test('D2.22 — o relatório declara explicitamente que nada foi gravado', () => {
  const rel = analisarDivergencias({ bancos: [], lancamentos: [], dataBase: '2026-12-31' });
  assert.equal(rel.modo, 'sombra');
  assert.match(rel.aviso, /NÃO OFICIAL/);
  assert.equal(rel.consolidado.saldo_calculado, 0);
});

// ───────── 11. sincronia entre a cópia do frontend e a do backend ───────────
test('D2.23 — cópia do backend é byte a byte igual à do frontend', () => {
  const aqui = dirname(fileURLToPath(import.meta.url));
  const front = readFileSync(join(aqui, 'ledgerShadow.js'), 'utf8');
  const back = readFileSync(join(aqui, '../../base44/shared/ledgerShadow.ts'), 'utf8');
  assert.equal(back, front, 'as duas cópias do cálculo sombra divergiram');
});