import { test } from 'node:test';
import assert from 'node:assert/strict';

import { analiseCredito, ROTULO_PONTUALIDADE } from './analiseCredito.js';

const HOJE = '2026-10-21';

const cliente = (extra = {}) => ({ id: 'c1', name: 'Cedente', credit_limit: 10000, ...extra });
const titulo = (extra = {}) => ({
  id: 't1',
  status: 'pendente',
  valor_face: 1000,
  compensation_date: '2026-11-10',
  ...extra,
});
const operacao = (extra = {}) => ({
  id: 'o1',
  etapa: 'pagamento',
  status: 'ativo',
  total_receivable: 2000,
  amount_paid: 0,
  balance_due: 2000,
  ...extra,
});

test('M8.1 sem limites e sem histórico: nada de crédito, nada de pontualidade', () => {
  const a = analiseCredito({ cliente: { id: 'c1' }, operacoes: [], titulos: [], hoje: HOJE });
  assert.equal(a.limite, 0);
  assert.equal(a.utilizado, 0);
  assert.equal(a.disponivel, null);
  assert.equal(a.pontualidade.classificacao, 'sem_historico');
  assert.equal(a.pendencias.quantidade, 0);
});

test('M8.2 limite, utilizado e disponível só contam operações vivas', () => {
  const a = analiseCredito({
    cliente: cliente({ credit_limit: 10000 }),
    operacoes: [
      operacao({ id: 'viva', balance_due: 3000 }),
      operacao({ id: 'quitada', status: 'quitado', balance_due: 5000 }),
      operacao({ id: 'rascunho', etapa: 'rascunho', balance_due: 4000 }),
      operacao({ id: 'rejeitada', etapa: 'rejeitada', balance_due: 4000 }),
      operacao({ id: 'finalizada', etapa: 'finalizada', balance_due: 4000 }),
    ],
    titulos: [],
    hoje: HOJE,
  });
  assert.equal(a.limite, 10000);
  assert.equal(a.utilizado, 3000);
  assert.equal(a.disponivel, 7000);
});

test('M8.3 limite estourado não fica negativo', () => {
  const a = analiseCredito({
    cliente: cliente({ credit_limit: 1000 }),
    operacoes: [operacao({ balance_due: 5000 })],
    titulos: [],
    hoje: HOJE,
  });
  assert.equal(a.disponivel, 0);
});

test('M8.4 pendências: só título PENDENTE já vencido entra na conta', () => {
  const a = analiseCredito({
    cliente: cliente(),
    operacoes: [operacao({ status: 'atrasado' })],
    titulos: [
      titulo({ id: 'vencido', compensation_date: '2026-10-01', valor_face: 500 }),
      titulo({ id: 'futuro', compensation_date: '2026-12-01', valor_face: 900 }),
      titulo({ id: 'compensado', status: 'compensado', compensation_date: '2026-10-01', valor_face: 700 }),
    ],
    hoje: HOJE,
  });
  assert.equal(a.pendencias.quantidade, 1);
  assert.equal(a.pendencias.valor, 500);
  assert.equal(a.pendencias.operacoesEmAtraso, 1);
});

test('M8.5 pontualidade: média negativa (pagou antes) vira "antecipado"', () => {
  const a = analiseCredito({
    cliente: cliente(),
    operacoes: [],
    titulos: [
      titulo({ id: 'a', status: 'compensado', compensation_date: '2026-10-10', compensated_at: '2026-10-08' }),
      titulo({ id: 'b', status: 'compensado', compensation_date: '2026-10-10', compensated_at: '2026-10-07' }),
    ],
    hoje: HOJE,
  });
  assert.equal(a.pontualidade.classificacao, 'antecipado');
  assert.equal(a.pontualidade.antecipados, 2);
  assert.equal(a.pontualidade.mediaDias, -2.5);
  assert.equal(a.pontualidade.rotulo, ROTULO_PONTUALIDADE.antecipado);
});

test('M8.6 pontualidade: atraso médio vira "atrasado" e o mesmo dia é "no prazo"', () => {
  const atrasado = analiseCredito({
    cliente: cliente(),
    operacoes: [],
    titulos: [
      titulo({ id: 'a', status: 'compensado', compensation_date: '2026-10-10', compensated_at: '2026-10-13' }),
      titulo({ id: 'b', status: 'compensado', compensation_date: '2026-10-10', compensated_at: '2026-10-11' }),
    ],
    hoje: HOJE,
  });
  assert.equal(atrasado.pontualidade.classificacao, 'atrasado');
  assert.equal(atrasado.pontualidade.atrasados, 2);

  const noPrazo = analiseCredito({
    cliente: cliente(),
    operacoes: [],
    titulos: [titulo({ id: 'c', status: 'compensado', compensation_date: '2026-10-10', compensated_at: '2026-10-10' })],
    hoje: HOJE,
  });
  assert.equal(noPrazo.pontualidade.classificacao, 'no_prazo');
  assert.equal(noPrazo.pontualidade.noPrazo, 1);
});

test('M8.7 título compensado sem data real não entra na média', () => {
  const a = analiseCredito({
    cliente: cliente(),
    operacoes: [],
    titulos: [
      titulo({ id: 'a', status: 'compensado', compensation_date: '2026-10-10' }),
      titulo({ id: 'b', status: 'compensado', compensation_date: '2026-10-10', compensated_at: '2026-10-12' }),
    ],
    hoje: HOJE,
  });
  assert.equal(a.pontualidade.amostra, 1);
  assert.equal(a.pontualidade.mediaDias, 2);
});