/**
 * M2.1 — SEGURANÇA DAS ENTIDADES FINANCEIRAS E DAS FUNÇÕES EXPOSTAS.
 *
 * Testes NEGATIVOS: o que precisa ser RECUSADO. Nada aqui toca a plataforma,
 * a rede ou dados reais — as regras de acesso são lidas do arquivo da entidade
 * (a mesma fonte que a plataforma aplica) e avaliadas por um interpretador
 * mínimo que reproduz `$or` + `user_condition`.
 *
 * O interpretador não "confia" na regra: se a regra estiver aberta (`{}`), ele
 * devolve acesso para o anônimo e o teste falha. É esse o ponto.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { autorizarMovimentacaoBancaria, ACOES_BANCARIAS } from './bankAuthorization.js';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, '..', '..');
const ler = (rel) => readFileSync(join(RAIZ, rel), 'utf8');

const ENTIDADES = ['Cheque', 'Operation', 'CashFlow', 'Banco'];
const OPERACOES = ['read', 'create', 'update', 'delete'];

const entidade = (nome) => JSON.parse(ler(`base44/entities/${nome}.jsonc`));

/* ───────────────────── interpretador mínimo de regra RLS ─────────────────── */

/** `user_condition` compara atributos do usuário; só igualdade é usada aqui. */
function casaCondicaoDeUsuario(usuario, cond) {
  if (!usuario) return FALSE_RULE();
  return Object.entries(cond).every(([campo, esperado]) => {
    const atual = campo.split('.').reduce((a, k) => (a == null ? undefined : a[k]), usuario);
    return atual === esperado;
  });
}
const FALSE_RULE = () => false;

/** Avalia a regra como a plataforma faria para o usuário informado. */
export function permite(regra, usuario) {
  if (regra === undefined || regra === null) return true; // operação sem regra = aberta
  if (regra === false) return false;
  if (regra === true) return true;
  if (typeof regra !== 'object') return false;
  if (Object.keys(regra).length === 0) return true; // `{}` = aberta

  return Object.entries(regra).every(([chave, valor]) => {
    if (chave === '$or') return valor.some((r) => permite(r, usuario));
    if (chave === '$and') return valor.every((r) => permite(r, usuario));
    if (chave === '$nor') return !valor.some((r) => permite(r, usuario));
    if (chave === 'user_condition') return casaCondicaoDeUsuario(usuario, valor);
    // Condição sobre campo do registro: não restringe QUEM, então não decide aqui.
    throw new Error(`Condição de registro não prevista no teste: ${chave}`);
  });
}

const ANONIMO = null;
const ADMIN = { id: 'u-admin', email: 'admin@psx.test', role: 'admin' };
const OPERADOR = { id: 'u-op', email: 'operador@psx.test', role: 'user', allowed_pages: ['cheques', 'bancos', 'caixa'] };
const SEM_PAPEL = { id: 'u-x', email: 'x@psx.test', role: 'convidado' };

/* ══════════════════ 1. nenhuma entidade financeira sem regra ═══════════════ */

test('S1.1 — as quatro entidades financeiras declaram rls nas quatro operações', () => {
  for (const nome of ENTIDADES) {
    const doc = entidade(nome);
    assert.ok(doc.rls && typeof doc.rls === 'object', `${nome} sem bloco rls`);
    for (const op of OPERACOES) {
      assert.ok(Object.prototype.hasOwnProperty.call(doc.rls, op), `${nome}.${op} sem regra declarada`);
      const regra = doc.rls[op];
      assert.notDeepEqual(regra, {}, `${nome}.${op} está aberta ({}): qualquer visitante passa`);
      assert.notEqual(regra, true, `${nome}.${op} está aberta (true)`);
      assert.notEqual(regra, false, `${nome}.${op} fechada para todos, inclusive administrador`);
    }
  }
});

test('S1.2 — anônimo é recusado em leitura E escrita das quatro entidades', () => {
  for (const nome of ENTIDADES) {
    const { rls } = entidade(nome);
    for (const op of OPERACOES) {
      assert.equal(permite(rls[op], ANONIMO), false, `${nome}.${op} aceitou visitante anônimo`);
    }
  }
});

test('S1.3 — papel não reconhecido é recusado (não é admin, não é operador)', () => {
  for (const nome of ENTIDADES) {
    const { rls } = entidade(nome);
    for (const op of OPERACOES) {
      assert.equal(permite(rls[op], SEM_PAPEL), false, `${nome}.${op} aceitou papel desconhecido`);
    }
  }
});

test('S1.4 — administrador e operador preservam o acesso legítimo', () => {
  for (const nome of ENTIDADES) {
    const { rls } = entidade(nome);
    for (const op of OPERACOES) {
      assert.equal(permite(rls[op], ADMIN), true, `${nome}.${op} bloqueou o administrador`);
      assert.equal(permite(rls[op], OPERADOR), true, `${nome}.${op} bloqueou o operador`);
    }
  }
});

test('S1.5 — a regra não usa operador que a escrita não entende', () => {
  // Regra com operador inválido em escrita pode virar "sem restrição".
  const PERMITIDOS = new Set(['$or', '$and', '$nor', 'user_condition']);
  for (const nome of ENTIDADES) {
    const { rls } = entidade(nome);
    for (const op of OPERACOES) visitar(rls[op], PERMITIDOS, `${nome}.${op}`);
  }
  function visitar(regra, ok, caminho) {
    if (!regra || typeof regra !== 'object') return;
    for (const chave of Object.keys(regra)) {
      assert.ok(ok.has(chave), `${caminho} usa condição não suportada: ${chave}`);
      if (['$or', '$and', '$nor'].includes(chave)) regra[chave].forEach((r) => visitar(r, ok, caminho));
      if (chave === 'user_condition') {
        for (const campo of Object.keys(regra[chave])) {
          assert.ok(['role', 'email', 'id'].includes(campo), `${caminho} decide por campo não confiável: ${campo}`);
        }
      }
    }
  }
});

/* ═════════════ 2. função auxiliar de teste não é endpoint aberto ═══════════ */

test('S2.1 — testCashFlowHelper exige identidade ANTES de elevar privilégio', () => {
  const fonte = ler('base44/functions/testCashFlowHelper/entry.ts');
  const identidade = fonte.indexOf('base44.auth.me()');
  const privilegio = fonte.indexOf('asServiceRole');
  assert.ok(identidade > -1, 'a função não verifica identidade');
  assert.ok(privilegio > -1, 'a função deveria usar privilégio de serviço depois de autorizar');
  assert.ok(identidade < privilegio, 'a função eleva privilégio antes de verificar quem chamou');
});

test('S2.2 — testCashFlowHelper é restrita a administrador', () => {
  const fonte = ler('base44/functions/testCashFlowHelper/entry.ts');
  assert.match(fonte, /usuario\.role\s*!==\s*'admin'/, 'não há recusa explícita para não-admin');
  assert.match(fonte, /401/, 'não devolve 401 para chamada sem token');
  assert.match(fonte, /403/, 'não devolve 403 para chamada sem papel');
});

/* ═══════════ 3. identidade na devolução física vem do token ════════════════ */

test('S3.1 — devolução física registra o e-mail do token, nunca do corpo', () => {
  const fonte = ler('base44/functions/chequeEvento/entry.ts');
  assert.match(fonte, /autorizadoPor:\s*user\.email/, 'a identidade registrada não vem do usuário autenticado');
  assert.ok(!/autorizadoPor:\s*body\./.test(fonte), 'a identidade não pode vir do corpo da requisição');
  assert.ok(!/usuario\.email/.test(fonte), 'restou referência a variável inexistente na função');
});

/* ═══════════════ 4. recuperação da taxa é ato administrativo ═══════════════ */

test('S4.1 — operador não pode disparar a recuperação da taxa', () => {
  const decisao = autorizarMovimentacaoBancaria(OPERADOR, ACOES_BANCARIAS.RECUPERAR_TAXA_CHEQUE);
  assert.equal(decisao.autorizado, false);
  assert.equal(decisao.exige_admin, true);
});

test('S4.2 — administrador e anônimo na recuperação da taxa', () => {
  assert.equal(autorizarMovimentacaoBancaria(ADMIN, ACOES_BANCARIAS.RECUPERAR_TAXA_CHEQUE).autorizado, true);
  assert.equal(autorizarMovimentacaoBancaria(ANONIMO, ACOES_BANCARIAS.RECUPERAR_TAXA_CHEQUE).autorizado, false);
});

test('S4.3 — a ação existe no servidor e está mapeada para a política administrativa', () => {
  const fonte = ler('base44/functions/chequeEvento/entry.ts');
  assert.match(fonte, /recuperar_taxa:\s*ACOES_BANCARIAS\.RECUPERAR_TAXA_CHEQUE/);
  assert.match(fonte, /acao === 'recuperar_taxa'/, 'a ação não tem despacho');
});

/* ═══════════ 5. o adaptador do navegador não escreve finanças ══════════════ */

test('S5.1 — chequeOps só transporta: nenhuma escrita direta de entidade', () => {
  const fonte = ler('src/lib/chequeOps.js');
  const escritas = fonte.match(/entities\.\w+\.(create|update|delete|bulkCreate|bulkUpdate|deleteMany|updateMany)/g) || [];
  assert.deepEqual(escritas, [], `o adaptador voltou a escrever direto: ${escritas.join(', ')}`);
});

test('S5.2 — a recuperação da taxa passa pelo servidor', () => {
  const fonte = ler('src/lib/chequeOps.js');
  assert.match(fonte, /acao:\s*'recuperar_taxa'/, 'o adaptador não conhece a ação de recuperação');
});