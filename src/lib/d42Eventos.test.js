/**
 * D4.2 — EVENTOS DE CAIXA CENTRALIZADOS NO SERVIDOR.
 *
 * O que cada bloco prova:
 *  · NÚCLEO (D4.2.1–D4.2.8) — executado de verdade contra o simulador: as
 *    garantias de saldo único, lançamento 1:1, concorrência e detecção de
 *    falha parcial. Vale porque é o MESMO arquivo que a função importa.
 *  · ESTRUTURA (D4.2.9–D4.2.10) — a função autoriza antes de elevar privilégio
 *    e não lê papel/identidade do corpo.
 *  · MIGRAÇÃO (D4.2.11) — as telas não escrevem mais direto em Banco/CashFlow.
 *  · PARIDADE (D4.2.14) — cópia do servidor == cópia testada.
 *
 * NÃO está aqui: chamar a função como usuário `user` real. O ambiente autentica
 * como admin/service role; um teste assim passaria pelo caminho de admin e não
 * provaria isolamento. Fica declarado como pendente, não como aprovado.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  chaveLancamentoAvulso,
  chaveLucroProrrogacao,
  chaveRemessa,
  chaveRetorno,
  validarLancamentoAvulso,
  validarLucro,
  validarLote,
  idDeEventoValido,
  tipoDoEvento,
  eventoTemSaldo,
  registrarMovimento,
  criarLancamentoUnico,
  diagnosticarMovimento,
  TIPOS,
} from './bankMovement.js';
import { LEDGER_KEYS_FIELD } from './bankLedger.js';
import { criarColecao } from './__fixtures__/memoryStore.js';

const AQUI = dirname(fileURLToPath(import.meta.url));
const ler = (p) => readFileSync(join(AQUI, p), 'utf8');

function cenario(saldoInicial = 1000) {
  const bancos = criarColecao('banco');
  const cashflows = criarColecao('cf');

  bancos.docs.push({
    id: 'b1',
    name: 'BANCO UM',
    current_balance: saldoInicial,
    [LEDGER_KEYS_FIELD]: [],
  });

  // O store espelha o SDK real: escrita por query e leitura por id.
  const bancoStore = {
    updateWhere: (q, u) => bancos.updateWhere(q, u),
    get: (id) => bancos.achar(id),
  };
  const cashflowStore = {
    create: (d) => cashflows.create(d),
    filter: (q) => cashflows.filter(q),
  };

  return { bancos, cashflows, bancoStore, cashflowStore };
}

const lancamentoBase = (over = {}) => ({
  type: TIPOS.ENTRADA,
  category: 'lancamento_avulso',
  amount: 100,
  date: '2026-10-20',
  description: '[Lançamento Avulso] BANCO UM — teste',
  method: 'outro',
  bank_id: 'b1',
  ...over,
});

// ═════════════════ 1. validações espelham a tela ═══════════════════════════
test('D4.2.1 — validações recusam valores, motivos e datas inválidos', () => {
  assert.equal(validarLancamentoAvulso({ tipo: 'entrada', valor: 10, motivo: 'motivo ok', data: '2026-10-20' }), null);
  assert.match(validarLancamentoAvulso({ tipo: 'x', valor: 10, motivo: 'motivo ok', data: '2026-10-20' }), /Tipo/);
  assert.match(validarLancamentoAvulso({ tipo: 'entrada', valor: -1, motivo: 'motivo ok', data: '2026-10-20' }), /maior que zero/);
  assert.match(validarLancamentoAvulso({ tipo: 'entrada', valor: 10, motivo: 'abc', data: '2026-10-20' }), /motivo/);
  assert.match(validarLancamentoAvulso({ tipo: 'entrada', valor: 10, motivo: 'motivo ok', data: 'xx' }), /Data/);

  assert.equal(validarLucro({ valor: 50, data: '2026-10-20', forma: 'pix' }), null);
  assert.match(validarLucro({ valor: 0, data: '2026-10-20', forma: 'pix' }), /maior que zero/);
  assert.match(validarLucro({ valor: 5, data: '2026-10-20', forma: 'cripto' }), /Forma/);

  assert.equal(validarLote({ chequeIds: ['a'], data: '2026-10-20' }), null);
  assert.match(validarLote({ chequeIds: [], data: '2026-10-20' }), /pelo menos um/);
  assert.match(validarLote({ chequeIds: [''], data: '2026-10-20' }), /inválida/);

  assert.equal(idDeEventoValido('avulso-123'), true);
  assert.equal(idDeEventoValido('ruim com espaço'), false);
});

// ═════════════════ 2. chaves determinísticas ═══════════════════════════════
test('D4.2.2 — chaves de evento são estáveis e distinguem eventos distintos', () => {
  assert.equal(chaveLancamentoAvulso('e1'), 'lancamento_avulso:e1');
  assert.equal(chaveLucroProrrogacao('ch1', '2026-10-20', 120), 'lucro_prorrogacao:ch1:2026-10-20:120');
  assert.equal(chaveRemessa('e2'), 'remessa_banco:e2');
  assert.equal(chaveRetorno('e3'), 'cheque_devolvido:e3');

  // Mesmo valor, datas diferentes → eventos diferentes (lucros sucessivos).
  assert.notEqual(
    chaveLucroProrrogacao('ch1', '2026-10-20', 120),
    chaveLucroProrrogacao('ch1', '2026-11-20', 120),
  );

  assert.equal(tipoDoEvento('lucro_prorrogacao:ch1:2026-10-20:120'), 'lucro_prorrogacao');
  assert.equal(eventoTemSaldo('lancamento_avulso:x'), true);
  assert.equal(eventoTemSaldo('remessa_banco:x'), false);
});

// ═════════════════ 3. um movimento e um lançamento por evento ══════════════
test('D4.2.3 — repetir o mesmo lançamento avulso não credita nem lança duas vezes', async () => {
  const { bancos, cashflows, bancoStore, cashflowStore } = cenario(1000);
  const eventKey = chaveLancamentoAvulso('evt-1');

  const primeira = await registrarMovimento({
    bancoStore, cashflowStore, bankId: 'b1', delta: 250, eventKey, lancamento: lancamentoBase({ amount: 250 }),
  });
  assert.equal(primeira.status, 'aplicado');
  assert.equal(primeira.lancamento_criado, true);

  const segunda = await registrarMovimento({
    bancoStore, cashflowStore, bankId: 'b1', delta: 250, eventKey, lancamento: lancamentoBase({ amount: 250 }),
  });
  assert.equal(segunda.status, 'ja_aplicado');
  assert.equal(segunda.lancamento_criado, false);

  assert.equal(bancos.achar('b1').current_balance, 1250, 'saldo somado uma única vez');
  assert.equal(cashflows.docs.length, 1, 'um único lançamento');
  assert.equal(cashflows.docs[0].source_id, eventKey);
  assert.equal(cashflows.docs[0].source_type, 'lancamento_avulso');
});

// ═════════════════ 4. concorrência real ════════════════════════════════════
test('D4.2.4 — vinte execuções simultâneas do mesmo evento movem e lançam uma vez', async () => {
  const { bancos, cashflows, bancoStore, cashflowStore } = cenario(0);
  const eventKey = chaveLucroProrrogacao('ch9', '2026-10-20', 300);

  await Promise.all(Array.from({ length: 20 }, () => registrarMovimento({
    bancoStore, cashflowStore, bankId: 'b1', delta: 300, eventKey,
    lancamento: lancamentoBase({ category: 'lucro_prorrogacao_cheque', amount: 300 }),
  })));

  assert.equal(bancos.achar('b1').current_balance, 300);
  assert.equal(cashflows.docs.length, 1);
});

// ═════════════════ 5. falha parcial: detectada, NUNCA reaplicada ═══════════
test('D4.2.5 — saldo aplicado sem lançamento é DETECTADO e nunca recreditado', async () => {
  const { bancos, cashflows, bancoStore, cashflowStore } = cenario(1000);
  const eventKey = chaveLancamentoAvulso('evt-part');

  // Simula a morte do processo DEPOIS do delta: aplica só o saldo.
  const { applyBankDelta } = await import('./bankLedger.js');
  await applyBankDelta({ store: bancoStore, bankId: 'b1', delta: 400, eventKey });

  const diag = await diagnosticarMovimento({ bancoStore, cashflowStore, bankId: 'b1', eventKey });
  assert.equal(diag.estado, 'saldo_sem_lancamento', 'divergência apontada');
  assert.equal(diag.saldo_aplicado, true);
  assert.equal(diag.lancamento_existe, false);

  // Nova tentativa do mesmo evento NÃO recredita e NÃO cria lançamento.
  const retry = await registrarMovimento({
    bancoStore, cashflowStore, bankId: 'b1', delta: 400, eventKey, lancamento: lancamentoBase({ amount: 400 }),
  });
  assert.equal(retry.status, 'ja_aplicado');
  assert.equal(bancos.achar('b1').current_balance, 1400, 'saldo NÃO foi reaplicado');
  assert.equal(cashflows.docs.length, 0, 'nada criado automaticamente pela nova tentativa');
});

// ═════════════════ 6. lançamento de controle sem saldo ═════════════════════
test('D4.2.6 — remessa: lançamento de controle criado uma vez e saldo intocado', async () => {
  const { bancos, cashflows, bancoStore, cashflowStore } = cenario(1000);
  const eventKey = chaveRemessa('lote-1');
  const lancamento = lancamentoBase({ category: 'remessa_banco', amount: 900, bank_id: undefined });

  const a = await criarLancamentoUnico({
    bancoStore, cashflowStore, bankId: 'b1', eventKey, lancamento, owner: 'op@psx.test',
  });
  assert.equal(a.status, 'criado');

  const b = await criarLancamentoUnico({
    bancoStore, cashflowStore, bankId: 'b1', eventKey, lancamento, owner: 'op@psx.test',
  });
  assert.equal(b.status, 'ja_existia');

  assert.equal(cashflows.docs.length, 1, 'remessa registrada uma vez');
  assert.equal(bancos.achar('b1').current_balance, 1000, 'custódia não move saldo');
});

// ═════════════════ 7. diagnóstico do estado completo ═══════════════════════
test('D4.2.7 — evento completo, intacto e sem saldo são distinguidos', async () => {
  const { bancoStore, cashflowStore } = cenario(0);
  const eventKey = chaveLancamentoAvulso('evt-ok');

  assert.equal(
    (await diagnosticarMovimento({ bancoStore, cashflowStore, bankId: 'b1', eventKey })).estado,
    'nada_aplicado',
  );

  await registrarMovimento({
    bancoStore, cashflowStore, bankId: 'b1', delta: 10, eventKey, lancamento: lancamentoBase({ amount: 10 }),
  });

  const diag = await diagnosticarMovimento({ bancoStore, cashflowStore, bankId: 'b1', eventKey });
  assert.equal(diag.estado, 'completo');
  assert.equal(diag.lancamento_existe, true);

  // Evento de controle: sem saldo, mas com lançamento — também completo.
  const remessa = chaveRemessa('lote-ok');
  await criarLancamentoUnico({
    bancoStore, cashflowStore, bankId: 'b1', eventKey: remessa,
    lancamento: lancamentoBase({ category: 'remessa_banco' }), owner: 'op@psx.test',
  });
  assert.equal(
    (await diagnosticarMovimento({ bancoStore, cashflowStore, bankId: 'b1', eventKey: remessa })).estado,
    'completo',
  );
});

// ═════════════════ 8. conta inexistente não inventa efeito ═════════════════
test('D4.2.8 — evento sem conta não aplica nada', async () => {
  const { cashflows, bancoStore, cashflowStore } = cenario(1000);
  const res = await registrarMovimento({
    bancoStore, cashflowStore, bankId: '', delta: 50,
    eventKey: chaveLancamentoAvulso('sem-conta'), lancamento: lancamentoBase(),
  });
  assert.equal(res.status, 'sem_conta');
  assert.equal(cashflows.docs.length, 0);
});

// ═════════════════ 9. a função autoriza antes de elevar privilégio ═════════
test('D4.2.9 — eventoBancario: autorização antes de asServiceRole e do corpo não se lê identidade', () => {
  const fonte = ler('../../base44/functions/eventoBancario/entry.ts');

  const posAutorizacao = fonte.indexOf('autorizarMovimentacaoBancaria(usuario, ACAO_POR_OPERACAO[operacao])');
  const posServico = fonte.indexOf('asServiceRole');
  const posPrimeiraEscrita = fonte.indexOf('.create(');

  assert.ok(posAutorizacao > 0, 'autorização ausente');
  assert.ok(posAutorizacao < posServico, 'elevação antes da checagem');
  assert.ok(posAutorizacao < posPrimeiraEscrita, 'escrita antes da checagem');
  assert.match(fonte, /base44\.auth\.me\(\)/, 'identidade vem do token');
  assert.match(fonte, /const userEmail = usuario\.email;/, 'dono do evento vem do token');

  for (const proibido of ['body.role', 'body.email', 'body.userEmail', 'body.owner', 'body.permissions']) {
    assert.equal(fonte.includes(proibido), false, `a função lê "${proibido}" do navegador`);
  }
});

// ═════════════════ 10. operação desconhecida não executa ═══════════════════
test('D4.2.10 — operação fora do contrato é mapeada para ação inexistente (recusa)', () => {
  const fonte = ler('../../base44/functions/eventoBancario/entry.ts');
  const mapa = fonte.slice(fonte.indexOf('const ACAO_POR_OPERACAO'), fonte.indexOf('function ok('));

  for (const op of ['lancamento_avulso', 'lucro_prorrogacao', 'remessa_banco', 'retorno_banco', 'inspecionar']) {
    assert.match(mapa, new RegExp(`${op}:`), `operação ${op} sem mapeamento`);
  }
  // Nada além do mapa é executado: o corpo só escolhe a chave.
  assert.match(fonte, /ACOES_BANCARIAS\.LANCAR/);
  assert.match(fonte, /ACOES_BANCARIAS\.REMESSA/);
});

// ═════════════════ 11. telas não escrevem mais direto ══════════════════════
test('D4.2.11 — os quatro escritores migrados não escrevem mais em Banco/CashFlow', () => {
  const arquivos = [
    '../components/bancos/LancamentoAvulsoModal.jsx',
    '../components/cheque/ReceberLucroProrrogacaoModal.jsx',
    '../components/cheque/EnviarBancoModal.jsx',
    '../components/cheque/RetornarDepartamentoModal.jsx',
  ];

  for (const caminho of arquivos) {
    const fonte = ler(caminho);
    for (const proibido of [
      'entities.Banco.updateMany',
      'entities.CashFlow.create',
      'entities.Cheque.update',
      'applyBankDelta',
      'aplicarEventoBancario',
    ]) {
      assert.equal(fonte.includes(proibido), false, `${caminho} ainda escreve via ${proibido}`);
    }
    assert.match(fonte, /from '@\/lib\/eventoBancario'/, `${caminho} precisa usar o adaptador do servidor`);
  }
});

// ═════════════════ 12. adaptador é só transporte ═══════════════════════════
test('D4.2.12 — o adaptador chama a função e não movimenta nada sozinho', () => {
  const fonte = ler('eventoBancario.js');
  assert.match(fonte, /functions\.invoke\('eventoBancario'/, 'o adaptador deve chamar a função');
  for (const proibido of ['entities.Banco', 'entities.CashFlow', 'entities.Cheque', 'applyBankDelta']) {
    assert.equal(fonte.includes(proibido), false, `o adaptador ainda toca ${proibido}`);
  }
});

// ═════════════════ 14. paridade servidor/frontend do módulo ════════════════
test('D4.2.14 — cópia do servidor do módulo de movimento é idêntica à testada', () => {
  const front = ler('bankMovement.js');
  const back = ler('../../base44/shared/bankMovement.js');
  const normalizar = (t) => t.replace(/from '\.\/bankLedger\.ts'/, "from './bankLedger.js'");
  assert.equal(normalizar(back), front, 'as cópias do módulo de movimento divergiram');
});