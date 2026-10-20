/**
 * D4.1 — AUTORIZAÇÃO FINANCEIRA NO SERVIDOR.
 *
 * Separação honesta do que cada teste prova:
 *
 *  · POLÍTICA (D4.1.1–D4.1.8) — executada de verdade, com usuários fabricados
 *    cobrindo os perfis reais (`admin`, operador com a página, operador sem a
 *    página, anônimo, papel desconhecido). Prova a REGRA.
 *
 *  · ESTRUTURA (D4.1.9–D4.1.11, D4.1.13) — asserções sobre o código da função
 *    e do adaptador: que a identidade sai do token, que o corpo não decide
 *    papel, que a autorização vem antes de qualquer escrita e que o navegador
 *    deixou de movimentar saldo. Prova o CAMINHO, não a execução com uma
 *    segunda identidade.
 *
 *  · PARIDADE (D4.1.12, D4.1.14) — as cópias do servidor são as mesmas do
 *    navegador (motor e política).
 *
 * O que NÃO está aqui: chamar a função como um usuário `user` de verdade. O
 * ambiente de construção autentica como administrador/service role; um teste
 * assim passaria pelo caminho de admin e não provaria isolamento nenhum. Fica
 * declarado como pendente, nunca como aprovado.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  autorizarMovimentacaoBancaria,
  ACOES_BANCARIAS,
  PAGINA_BANCOS,
} from './bankAuthorization.js';

const AQUI = dirname(fileURLToPath(import.meta.url));
const ler = (p) => readFileSync(join(AQUI, p), 'utf8');

const TODAS = Object.values(ACOES_BANCARIAS);
const ADMINISTRATIVAS = [
  ACOES_BANCARIAS.ESTORNAR,
  ACOES_BANCARIAS.RECUPERAR,
  ACOES_BANCARIAS.LIBERAR_REIVINDICACAO,
];

const ADMIN = { email: 'admin@psx.test', role: 'admin' };
const OPERADOR = { email: 'operador@psx.test', role: 'user', allowed_pages: ['bancos', 'caixa'] };
const SEM_PAGINA = { email: 'consulta@psx.test', role: 'user', allowed_pages: ['dashboard'] };
const SEM_LISTA = { email: 'recem-convidado@psx.test', role: 'user' };

// ═════════════════ 1. administrador mantém acesso total ════════════════════
test('D4.1.1 — admin é autorizado em todas as ações bancárias', () => {
  for (const acao of TODAS) {
    const d = autorizarMovimentacaoBancaria(ADMIN, acao);
    assert.equal(d.autorizado, true, `admin recusado em ${acao}`);
    assert.equal(d.papel, 'admin');
  }
});

// ═════════════════ 2. operador com a página continua operando ══════════════
test('D4.1.2 — usuário com a página liberada transfere e inspeciona', () => {
  for (const acao of [ACOES_BANCARIAS.TRANSFERIR, ACOES_BANCARIAS.INSPECIONAR]) {
    const d = autorizarMovimentacaoBancaria(OPERADOR, acao);
    assert.equal(d.autorizado, true, `operador legítimo recusado em ${acao}`);
    assert.equal(d.papel, 'user');
  }
});

// ═════════════════ 3. reversão e recuperação exigem administrador ══════════
test('D4.1.3 — estorno, recuperação e liberação exigem admin (operador recusado)', () => {
  for (const acao of ADMINISTRATIVAS) {
    const d = autorizarMovimentacaoBancaria(OPERADOR, acao);
    assert.equal(d.autorizado, false, `operador autorizado indevidamente em ${acao}`);
    assert.equal(d.exige_admin, true);
  }
});

// ═════════════════ 4. sem a página, não movimenta ══════════════════════════
test('D4.1.4 — usuário sem a página de Bancos é recusado ao transferir', () => {
  const d = autorizarMovimentacaoBancaria(SEM_PAGINA, ACOES_BANCARIAS.TRANSFERIR);
  assert.equal(d.autorizado, false);
  assert.equal(d.pagina_exigida, PAGINA_BANCOS);
});

// ═════════════════ 5. sem lista de páginas, não movimenta ══════════════════
test('D4.1.5 — usuário sem allowed_pages é recusado (nada é presumido)', () => {
  assert.equal(autorizarMovimentacaoBancaria(SEM_LISTA, ACOES_BANCARIAS.TRANSFERIR).autorizado, false);
});

// ═════════════════ 6. anônimo não movimenta ════════════════════════════════
test('D4.1.6 — sem usuário autenticado, nenhuma ação passa', () => {
  for (const u of [null, undefined, {}, { email: '' }]) {
    const d = autorizarMovimentacaoBancaria(u, ACOES_BANCARIAS.TRANSFERIR);
    assert.equal(d.autorizado, false);
    assert.equal(d.papel, 'anonimo');
  }
});

// ═════════════════ 7. papel desconhecido não movimenta ═════════════════════
test('D4.1.7 — papel não reconhecido é recusado em qualquer ação', () => {
  const estranho = { email: 'x@psx.test', role: 'financeiro', allowed_pages: ['bancos'] };
  for (const acao of TODAS) {
    assert.equal(autorizarMovimentacaoBancaria(estranho, acao).autorizado, false);
  }
});

// ═════════════════ 8. ação fora do contrato não é executada ════════════════
test('D4.1.8 — ação desconhecida é recusada, inclusive para admin', () => {
  for (const acao of ['', 'apagar_tudo', 'transferir ', undefined, null]) {
    assert.equal(autorizarMovimentacaoBancaria(ADMIN, acao).autorizado, false, `ação "${acao}" aceita`);
  }
});

// ═════════════════ 9. o corpo não decide papel ═════════════════════════════
test('D4.1.9 — a função não lê papel, permissões ou identidade do corpo', () => {
  const fonte = ler('../../base44/functions/transferenciaBancaria/entry.ts');

  for (const proibido of ['body.role', 'body.papel', 'body.permissions', 'body.allowed_pages', 'body.userEmail', 'body.email']) {
    assert.equal(fonte.includes(proibido), false, `a função lê "${proibido}" do navegador`);
  }

  assert.match(fonte, /autorizarMovimentacaoBancaria\(usuario,\s*acao\)/,
    'a decisão precisa usar o usuário do token e a ação pedida');
  assert.match(fonte, /base44\.auth\.me\(\)/, 'identidade deve vir do mecanismo da plataforma');
});

// ═════════════════ 10. identidade própria sai do token ═════════════════════
test('D4.1.10 — proprietário do evento vem do token, nunca do navegador', () => {
  const fonte = ler('../../base44/functions/transferenciaBancaria/entry.ts');
  assert.match(fonte, /const userEmail = usuario\.email;/, 'userEmail precisa ser derivado do token');
  const usos = fonte.match(/userEmail[^\n]*/g) || [];
  for (const linha of usos) {
    assert.equal(linha.includes('body'), false, `userEmail contaminado pelo corpo: ${linha.trim()}`);
  }
});

// ═════════════════ 11. autorização antes de elevar privilégio ══════════════
test('D4.1.11 — autorização acontece antes de qualquer leitura privilegiada ou escrita', () => {
  const fonte = ler('../../base44/functions/transferenciaBancaria/entry.ts');
  const posAutorizacao = fonte.indexOf('autorizarMovimentacaoBancaria(usuario, acao)');
  const posServico = fonte.indexOf('asServiceRole');
  const posPrimeiraEscrita = fonte.indexOf('.create(');

  assert.ok(posAutorizacao > 0, 'autorização ausente');
  assert.ok(posAutorizacao < posServico, 'elevação de privilégio antes da checagem');
  assert.ok(posAutorizacao < posPrimeiraEscrita, 'escrita antes da checagem');
  assert.match(fonte, /if \(!decisao\.autorizado\) return falha\(decisao\.motivo, 403\)/,
    'recusa precisa interromper o fluxo com 403');
});

// ═════════════════ 12. motor do servidor == motor do navegador ═════════════
test('D4.1.12 — cópia do servidor do motor é idêntica à do frontend', () => {
  const front = ler('transferEngine.js');
  const back = ler('../../base44/shared/transferEngine.js');
  const normalizar = (t) => t.replace(/from '\.\/bankLedger\.ts'/, "from './bankLedger.js'");
  assert.equal(normalizar(back), front, 'as cópias do motor divergiram');
});

// ═════════════════ 13. o adaptador do navegador só chama o servidor ════════
test('D4.1.13 — o frontend não movimenta mais saldo e não tem caminho alternativo', () => {
  const fonte = ler('transferFlow.js');

  assert.match(fonte, /functions\.invoke\('transferenciaBancaria'/, 'o adaptador deve chamar a função');
  for (const proibido of [
    'criarMotor',
    'entities.Banco.updateMany',
    'entities.CashFlow.create',
    'entities.TransferenciaBancaria.create',
    'applyBankDelta',
    'transferEngine',
  ]) {
    assert.equal(fonte.includes(proibido), false, `o navegador ainda movimenta via ${proibido}`);
  }
});

// ═════════════════ 14. política do servidor == política testada ════════════
test('D4.1.14 — cópia do servidor da política é byte a byte igual à do frontend', () => {
  const front = ler('bankAuthorization.js');
  const back = ler('../../base44/shared/bankAuthorization.js');
  assert.equal(back, front, 'as cópias da política divergiram — a decisão real de um dos lados mudou');
});