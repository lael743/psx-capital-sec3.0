/**
 * D3.2 — RECUPERAÇÃO SEGURA DE REIVINDICAÇÕES ÓRFÃS.
 *
 * Todos os testes aqui são UNITÁRIOS contra o simulador de plataforma
 * (`__fixtures__/memoryStore.js`), que cede o controle entre leitura e escrita
 * — é isso que permite duas execuções se intercalarem de verdade. Nenhum
 * toca em banco real, Asaas, saldo oficial ou histórico.
 *
 * Categorias deste arquivo:
 *  · SIMULAÇÃO DE CONCORRÊNCIA — testes 9 (duas recuperações simultâneas);
 *  · UNIDADES PURAS — testes 2, 3, 4, 5 (classificação e liberação guardada);
 *  · INTEGRAÇÃO COM O MOTOR — testes 6, 7, 8, 10, 11 (recuperação ponta a ponta
 *    sobre o simulador);
 *  · ASSERÇÕES DE CÓDIGO-FONTE — testes 12, 13 (o que o código de produção
 *    passou a fazer; não substituem teste de comportamento na plataforma).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  applyBankDelta,
  claimBankEvent,
  liberarReivindicacaoVerificada,
  classificarReivindicacao,
  temReivindicacao,
  metaDaReivindicacao,
  chavePerna,
  LEDGER_KEYS_FIELD,
  CLAIMS_FIELD,
  CLAIM_META_FIELD,
} from './bankLedger.js';
import { criarMotor } from './transferEngine.js';
import { criarColecao } from './__fixtures__/memoryStore.js';

const aqui = dirname(fileURLToPath(import.meta.url));

const bancoDe = (id, saldo) => ({
  id,
  name: id.toUpperCase(),
  initial_balance: 0,
  current_balance: saldo,
  [LEDGER_KEYS_FIELD]: [],
});

function cenario({ agora } = {}) {
  const bancos = criarColecao('banco');
  const diarios = criarColecao('diario');
  const cashflows = criarColecao('cf');

  const bancoStore = {
    updateWhere: (q, u) => bancos.updateWhere(q, u),
    get: async (id) => bancos.achar(id) || null,
  };
  const cashflowStore = {
    filter: (q) => cashflows.filter(q),
    create: (d) => cashflows.create(d),
  };

  const motor = criarMotor({
    bancoStore,
    diarioStore: {
      filter: (q) => diarios.filter(q),
      create: (d) => diarios.create(d),
      updateWhere: (q, u) => diarios.updateWhere(q, u),
    },
    cashflowStore,
    agora,
  });

  return { bancos, diarios, cashflows, bancoStore, cashflowStore, motor };
}

/** Aplica saldo pelo primitivo real — garante a chave de evento gravada. */
async function aplicarSaldo(bancos, bankId, delta, eventKey) {
  return applyBankDelta({
    store: { updateWhere: (q, u) => bancos.updateWhere(q, u) },
    bankId,
    delta,
    eventKey,
  });
}

// ═════════ 1. metadado da reivindicação: dono e instante, atômico ══════════
test('D3.2.1 — a reivindicação registra dono e instante na MESMA escrita, sem duplicar', async () => {
  const { bancos, bancoStore } = cenario();
  bancos.docs.push(bancoDe('b1', 0));
  const chave = chavePerna('t1', 'saida');

  const primeira = await claimBankEvent({
    store: bancoStore, bankId: 'b1', claimKey: chave,
    owner: 'ana@psx', agora: '2026-10-20T12:00:00.000Z',
  });
  const segunda = await claimBankEvent({
    store: bancoStore, bankId: 'b1', claimKey: chave,
    owner: 'bruno@psx', agora: '2026-10-20T12:05:00.000Z',
  });

  assert.equal(primeira, true, 'a primeira reivindicação vence');
  assert.equal(segunda, false, 'a segunda perde o compare-and-swap');

  const banco = bancos.achar('b1');
  assert.deepEqual(banco[CLAIMS_FIELD], [chave], 'chave única na lista');
  assert.equal(banco[CLAIM_META_FIELD].length, 1, 'metadado duplicado não sobrou');

  const meta = metaDaReivindicacao(banco, chave);
  assert.equal(meta.owner, 'ana@psx', 'dono é quem venceu, não quem tentou depois');
  assert.equal(meta.em, '2026-10-20T12:00:00.000Z');
});

// ═════════ 2. classificação: idade é aviso, nunca permissão ════════════════
test('D3.2.2 — idade não decide liberação; só a ausência do efeito decide', async () => {
  const base = { reivindicada: true, lancamentoExiste: false, saldoAplicado: true };

  const antiga = classificarReivindicacao({
    ...base, adquiridaEm: '2026-01-01T00:00:00.000Z', agora: '2026-10-20T00:00:00.000Z',
  });
  const recente = classificarReivindicacao({
    ...base, adquiridaEm: '2026-10-20T00:00:00.000Z', agora: '2026-10-20T00:00:05.000Z',
  });

  assert.equal(antiga.idade_suspeita, true);
  assert.equal(recente.idade_suspeita, false);
  assert.equal(antiga.liberavel, true);
  assert.equal(recente.liberavel, true, 'recente também é candidata — mas exige confirmação');
  assert.equal(antiga.estado, 'orfã_confirmada');

  const comEfeito = classificarReivindicacao({ ...base, lancamentoExiste: true, adquiridaEm: '2026-01-01T00:00:00.000Z', agora: '2026-10-20T00:00:00.000Z' });
  assert.equal(comEfeito.estado, 'efeito_ja_presente');
  assert.equal(comEfeito.liberavel, false, 'nunca libera quando o lançamento existe');

  const semClaim = classificarReivindicacao({ reivindicada: false, lancamentoExiste: false, saldoAplicado: true });
  assert.equal(semClaim.estado, 'sem_reivindicacao');
  assert.equal(semClaim.liberavel, false);
});

// ═════════ 3. liberação recusada quando o efeito já existe ═════════════════
test('D3.2.3 — liberação é RECUSADA quando o lançamento já existe', async () => {
  const { bancos, cashflows, bancoStore, cashflowStore } = cenario();
  bancos.docs.push(bancoDe('b1', 700));
  const chave = chavePerna('t9', 'saida');

  await claimBankEvent({ store: bancoStore, bankId: 'b1', claimKey: chave, owner: 'ana@psx' });
  await cashflows.create({ source_type: 'transferencia_bancaria', source_id: chave, amount: 300, transfer_leg: 'saida' });

  const r = await liberarReivindicacaoVerificada({
    bancoStore, cashflowStore, bankId: 'b1', claimKey: chave, sourceType: 'transferencia_bancaria',
  });

  assert.equal(r.liberada, false);
  assert.equal(r.motivo, 'efeito_ja_aplicado');
  assert.ok(r.lancamento_id, 'devolve o lançamento encontrado');
  assert.equal(temReivindicacao(bancos.achar('b1'), chave), true, 'reivindicação cumprida é preservada');
});

// ═════════ 4. liberação não apaga aquisição nova ═══════════════════════════
test('D3.2.4 — liberação com metadado obsoleto é recusada e preserva a aquisição nova', async () => {
  const { bancos, bancoStore, cashflowStore } = cenario();
  bancos.docs.push(bancoDe('b1', 700));
  const chave = chavePerna('t8', 'saida');

  await claimBankEvent({ store: bancoStore, bankId: 'b1', claimKey: chave, owner: 'novo@psx', agora: '2026-10-20T10:00:00.000Z' });

  const r = await liberarReivindicacaoVerificada({
    bancoStore,
    cashflowStore,
    bankId: 'b1',
    claimKey: chave,
    sourceType: 'transferencia_bancaria',
    // Observação feita por uma execução antiga, de outra aquisição.
    observado: { chave, owner: 'antigo@psx', em: '2026-01-01T00:00:00.000Z' },
  });

  assert.equal(r.liberada, false);
  assert.equal(r.motivo, 'reivindicacao_mudou');
  assert.equal(temReivindicacao(bancos.achar('b1'), chave), true, 'aquisição nova sobrevive');
  assert.equal(metaDaReivindicacao(bancos.achar('b1'), chave).owner, 'novo@psx');
});

// ═════════ 5. liberação efetiva remove chave e metadado ════════════════════
test('D3.2.5 — com efeito ausente, a liberação remove chave e metadado', async () => {
  const { bancos, bancoStore, cashflowStore } = cenario();
  bancos.docs.push(bancoDe('b1', 700));
  const chave = chavePerna('t7', 'saida');
  await claimBankEvent({ store: bancoStore, bankId: 'b1', claimKey: chave, owner: 'ana@psx' });

  const r = await liberarReivindicacaoVerificada({
    bancoStore, cashflowStore, bankId: 'b1', claimKey: chave, sourceType: 'transferencia_bancaria',
  });

  assert.equal(r.liberada, true);
  const banco = bancos.achar('b1');
  assert.equal(temReivindicacao(banco, chave), false);
  assert.equal(metaDaReivindicacao(banco, chave), null);
  assert.equal(banco.current_balance, 700, 'saldo intocado pela liberação');
});

// ═════════ 6. sem confirmação a recuperação não age ════════════════════════
test('D3.2.6 — recuperação sem confirmação apenas REPORTA a órfã', async () => {
  const { bancos, diarios, cashflows, bancoStore, motor } = cenario();
  bancos.docs.push(bancoDe('b1', 1000));
  const chave = chavePerna('tr1', 'saida');

  await aplicarSaldo(bancos, 'b1', -300, chave);
  await claimBankEvent({ store: bancoStore, bankId: 'b1', claimKey: 'tr1:saida', owner: 'proc-morto', agora: '2026-01-01T00:00:00.000Z' });
  const diario = await diarios.create({
    transfer_id: 'tr1', from_bank_id: 'b1', from_bank_name: 'B1', to_bank_id: 'b2', to_bank_name: 'B2',
    amount: 300, date: '2026-10-20', description: 'teste', status: 'parcial',
    legs: { saida: { banco: 'aplicado' } },
  });

  const r = await motor.recuperarLancamentosOrfaos({ transferId: 'tr1', agora: '2026-10-20T10:00:00.000Z' });

  assert.equal(r.acoes[0].acao, 'requer_confirmacao');
  assert.equal(r.acoes[0].owner, 'proc-morto', 'dono identificado no relatório');
  assert.equal(cashflows.docs.length, 0, 'nada criado sem confirmação');
  assert.equal(bancos.achar('b1').current_balance, 700);
  assert.ok(diario.id);
});

// ═════════ 7. reivindicação recente: aguarda, não libera ══════════════════
test('D3.2.7 — reivindicação recente não é liberada nem com confirmação', async () => {
  const { bancos, diarios, cashflows, bancoStore, motor } = cenario();
  bancos.docs.push(bancoDe('b1', 700));
  const chave = chavePerna('tr2', 'saida');

  await aplicarSaldo(bancos, 'b1', -300, chave);
  await claimBankEvent({ store: bancoStore, bankId: 'b1', claimKey: 'tr2:saida', owner: 'proc-vivo', agora: '2026-10-20T10:00:00.000Z' });
  await diarios.create({
    transfer_id: 'tr2', from_bank_id: 'b1', from_bank_name: 'B1', to_bank_id: 'b2', to_bank_name: 'B2',
    amount: 300, date: '2026-10-20', description: 'teste', status: 'parcial',
    legs: { saida: { banco: 'aplicado' } },
  });

  const r = await motor.recuperarLancamentosOrfaos({
    transferId: 'tr2', confirmar: true, agora: '2026-10-20T10:00:10.000Z',
  });

  assert.equal(r.acoes[0].acao, 'aguardar_idade');
  assert.equal(cashflows.docs.length, 0);
  assert.equal(temReivindicacao(bancos.achar('b1'), 'tr2:saida'), true);
});

// ═════════ 8. órfã antiga: recupera o lançamento sem tocar no saldo ════════
test('D3.2.8 — órfã antiga recria só o lançamento; saldo e chaves ficam intactos', async () => {
  const { bancos, diarios, cashflows, bancoStore, motor } = cenario();
  bancos.docs.push(bancoDe('b1', 1000));
  const chave = chavePerna('tr3', 'saida');
  const evento = 'transfer:tr3:saida';

  await aplicarSaldo(bancos, 'b1', -300, evento);
  await claimBankEvent({ store: bancoStore, bankId: 'b1', claimKey: 'tr3:saida', owner: 'proc-morto', agora: '2026-01-01T00:00:00.000Z' });
  await diarios.create({
    transfer_id: 'tr3', from_bank_id: 'b1', from_bank_name: 'B1', to_bank_id: 'b2', to_bank_name: 'B2',
    amount: 300, date: '2026-10-20', description: 'teste', status: 'parcial',
    legs: { saida: { banco: 'aplicado' } },
  });

  const r = await motor.recuperarLancamentosOrfaos({
    transferId: 'tr3', confirmar: true, agora: '2026-10-20T10:00:00.000Z', userEmail: 'recuperador@psx',
  });

  assert.equal(r.acoes[0].acao, 'lancamento_recriado');
  assert.equal(cashflows.docs.length, 1, 'exatamente um lançamento');
  assert.equal(cashflows.docs[0].source_id, 'tr3:saida');

  const banco = bancos.achar('b1');
  assert.equal(banco.current_balance, 700, 'SALDO NÃO FOI REAPLICADO');
  assert.deepEqual(banco[LEDGER_KEYS_FIELD], [evento], 'nenhuma chave nova, nenhuma removida');

  // A reivindicação volta a ficar retida — agora CUMPRIDA pelo lançamento que
  // ela mesma criou. É esse marcador durável que impede um segundo lançamento.
  assert.equal(temReivindicacao(banco, 'tr3:saida'), true);
  assert.equal(metaDaReivindicacao(banco, 'tr3:saida').owner, 'recuperador@psx', 'dono da recuperação registrado');
  assert.ok(chave);
});

// ═════════ 9. duas recuperações concorrentes ══════════════════════════════
test('D3.2.9 — duas recuperações simultâneas criam UM lançamento', async () => {
  const { bancos, diarios, cashflows, motor } = cenario();
  bancos.docs.push(bancoDe('b1', 1000));
  // Perna já liberada: saldo aplicado, sem reivindicação e sem lançamento.
  await aplicarSaldo(bancos, 'b1', -300, 'transfer:tr4:saida');
  await diarios.create({
    transfer_id: 'tr4', from_bank_id: 'b1', from_bank_name: 'B1', to_bank_id: 'b2', to_bank_name: 'B2',
    amount: 300, date: '2026-10-20', description: 'teste', status: 'parcial',
    legs: { saida: { banco: 'aplicado' } },
  });

  await Promise.all([
    motor.recuperarLancamentosOrfaos({ transferId: 'tr4', confirmar: true }),
    motor.recuperarLancamentosOrfaos({ transferId: 'tr4', confirmar: true }),
  ]);

  assert.equal(cashflows.docs.length, 1, 'o compare-and-swap decide quem cria');
  assert.equal(bancos.achar('b1').current_balance, 700, 'saldo intocado');
});

// ═════════ 10. repetição após falha parcial ════════════════════════════════
test('D3.2.10 — repetir a recuperação não duplica nem reaplica nada', async () => {
  const { bancos, diarios, cashflows, bancoStore, motor } = cenario();
  bancos.docs.push(bancoDe('b1', 1000));
  await aplicarSaldo(bancos, 'b1', -300, 'transfer:tr5:saida');
  await claimBankEvent({ store: bancoStore, bankId: 'b1', claimKey: 'tr5:saida', owner: 'proc-morto', agora: '2026-01-01T00:00:00.000Z' });
  await diarios.create({
    transfer_id: 'tr5', from_bank_id: 'b1', from_bank_name: 'B1', to_bank_id: 'b2', to_bank_name: 'B2',
    amount: 300, date: '2026-10-20', description: 'teste', status: 'parcial',
    legs: { saida: { banco: 'aplicado' } },
  });

  const primeira = await motor.recuperarLancamentosOrfaos({ transferId: 'tr5', confirmar: true, agora: '2026-10-20T10:00:00.000Z' });
  const segunda = await motor.recuperarLancamentosOrfaos({ transferId: 'tr5', confirmar: true, agora: '2026-10-20T10:01:00.000Z' });

  assert.equal(primeira.acoes[0].acao, 'lancamento_recriado');
  assert.equal(segunda.acoes[0].acao, 'nada_a_fazer', 'já completo, nada a fazer');
  assert.equal(cashflows.docs.length, 1);
  assert.equal(bancos.achar('b1').current_balance, 700);
});

// ═════════ 11. efeito presente, marcador ausente ═══════════════════════════
test('D3.2.11 — quando o lançamento existe, a recuperação só reconhece o vínculo', async () => {
  const { bancos, diarios, cashflows, bancoStore, motor } = cenario();
  bancos.docs.push(bancoDe('b1', 1000));
  await aplicarSaldo(bancos, 'b1', -300, 'transfer:tr6:saida');
  await claimBankEvent({ store: bancoStore, bankId: 'b1', claimKey: 'tr6:saida', owner: 'ana@psx' });
  await cashflows.create({ source_type: 'transferencia_bancaria', source_id: 'tr6:saida', amount: 300, transfer_leg: 'saida' });
  const diario = await diarios.create({
    transfer_id: 'tr6', from_bank_id: 'b1', from_bank_name: 'B1', to_bank_id: 'b2', to_bank_name: 'B2',
    amount: 300, date: '2026-10-20', description: 'teste', status: 'parcial',
    legs: { saida: { banco: 'aplicado' } },
  });

  const r = await motor.recuperarLancamentosOrfaos({ transferId: 'tr6', confirmar: true, agora: '2026-10-20T10:00:00.000Z' });

  assert.equal(r.acoes[0].acao, 'marcador_reconciliado');
  assert.equal(cashflows.docs.length, 1, 'nenhum segundo lançamento');
  assert.equal(diarios.achar(diario.id).legs.saida.cashflow_id, cashflows.docs[0].id);
  assert.equal(bancos.achar('b1').current_balance, 700);
  assert.equal(temReivindicacao(bancos.achar('b1'), 'tr6:saida'), true, 'reivindicação cumprida permanece');
});

// ═════════ 12. a recuperação não pode reaplicar saldo histórico ════════════
test('D3.2.12 — o fluxo de recuperação não chama applyBankDelta', async () => {
  const fonte = readFileSync(join(aqui, 'transferEngine.js'), 'utf8');
  const inicio = fonte.indexOf('async function recuperarLancamentosOrfaos');
  const fim = fonte.indexOf('return {\n    executarTransferencia,');
  assert.ok(inicio > 0 && fim > inicio, 'bloco de recuperação localizado');

  const bloco = fonte.slice(inicio, fim);
  assert.doesNotMatch(bloco, /applyBankDelta/, 'recuperação nunca aplica delta de saldo');
  assert.doesNotMatch(bloco, /current_balance/, 'recuperação nunca escreve saldo');
  assert.match(bloco, /liberarReivindicacaoVerificada/, 'libera pelo caminho verificado');
});

// ═════════ 13. obrigação: escrita por compare-and-swap ═════════════════════
test('D3.2.13 — gestão interna grava a obrigação por compare-and-swap', async () => {
  const fonte = readFileSync(join(aqui, '../../base44/functions/gestaoInternaPagamento/entry.ts'), 'utf8');

  assert.match(fonte, /async function ajustarObrigacao/, 'existe o ajuste guardado');
  assert.match(fonte, /valor_pago: lido/, 'a guarda usa o valor efetivamente lido');
  assert.match(fonte, /updateMany\(guarda, \{ \$set: patch \}\)/, 'a escrita é condicional');
  assert.match(fonte, /estornado: \{ \$ne: true \}/, 'o flag de estorno é o mutex da reversão');

  assert.doesNotMatch(fonte, /ObrigacaoInterna\.update\(obrigacao_id, \{/, 'sem sobrescrita crua na baixa');
  assert.doesNotMatch(fonte, /ObrigacaoInterna\.update\(obrigacao\.id, \{/, 'sem sobrescrita crua no estorno');
  assert.doesNotMatch(fonte, /PagamentoInterno\.update\(pagamento_id, \{\s*estornado: true/, 'estorno não é mais ler-conferir-escrever');
});

// ═════════ 15. órfã SEM saldo aplicado não vira lançamento ═════════════════
test('D3.2.15 — reivindicação sem saldo aplicado NÃO gera lançamento de caixa', async () => {
  const { bancos, diarios, cashflows, bancoStore, motor } = cenario();
  bancos.docs.push(bancoDe('b1', 1000));
  // Reivindicação retida, mas o débito nunca foi aplicado.
  await claimBankEvent({ store: bancoStore, bankId: 'b1', claimKey: 'tr7:saida', owner: 'proc-morto', agora: '2026-01-01T00:00:00.000Z' });
  await diarios.create({
    transfer_id: 'tr7', from_bank_id: 'b1', from_bank_name: 'B1', to_bank_id: 'b2', to_bank_name: 'B2',
    amount: 300, date: '2026-10-20', description: 'teste', status: 'pendente',
    legs: {},
  });

  const r = await motor.recuperarLancamentosOrfaos({
    transferId: 'tr7', confirmar: true, forcar: true, agora: '2026-10-20T10:00:00.000Z',
  });

  assert.equal(r.acoes[0].acao, 'requer_recuperacao_completa');
  assert.equal(cashflows.docs.length, 0, 'nenhum lançamento sem o saldo correspondente');
  assert.equal(bancos.achar('b1').current_balance, 1000, 'saldo intocado');
  assert.equal(temReivindicacao(bancos.achar('b1'), 'tr7:saida'), true, 'reivindicação preservada');
});

// ═════════ 14. o padrão de guarda elimina a atualização perdida ════════════
test('D3.2.14 — sem a guarda uma baixa simultânea desaparece; com a guarda, não', async () => {
  // Réplica mínima do ajuste usado na função de backend, sobre o simulador.
  async function ajustar(col, id, delta, { guarda }) {
    for (let tentativa = 0; tentativa < 3; tentativa += 1) {
      const atual = col.achar(id);
      const lido = Number(atual.valor_pago) || 0;
      const pago = Math.round((lido + delta) * 100) / 100;
      const patch = { valor_pago: pago, saldo: Math.max(0, Math.round(((Number(atual.valor) || 0) - pago) * 100) / 100) };
      const filtro = guarda ? { id, valor_pago: lido } : { id };
      const res = await col.updateWhere(filtro, { $set: patch });
      if ((Number(res.updated) || 0) > 0) return true;
    }
    return false;
  }

  const semGuarda = criarColecao('obr');
  semGuarda.docs.push({ id: 'o1', valor: 1000, valor_pago: 0, saldo: 1000 });
  await Promise.all([
    ajustar(semGuarda, 'o1', 100, { guarda: false }),
    ajustar(semGuarda, 'o1', 200, { guarda: false }),
  ]);
  assert.equal(semGuarda.achar('o1').valor_pago, 200, 'sem guarda, a primeira baixa é perdida (defeito D3.1)');

  const comGuarda = criarColecao('obr');
  comGuarda.docs.push({ id: 'o1', valor: 1000, valor_pago: 0, saldo: 1000 });
  await Promise.all([
    ajustar(comGuarda, 'o1', 100, { guarda: true }),
    ajustar(comGuarda, 'o1', 200, { guarda: true }),
  ]);
  assert.equal(comGuarda.achar('o1').valor_pago, 300, 'com guarda, as duas baixas contam');
  assert.equal(comGuarda.achar('o1').saldo, 700);
});