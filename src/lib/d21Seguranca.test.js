/**
 * M2.1 — SEGURANÇA DAS ENTIDADES FINANCEIRAS E DAS FUNÇÕES EXPOSTAS.
 *
 * Testes NEGATIVOS: o que precisa ser RECUSADO. Nada aqui toca a plataforma,
 * a rede ou dados reais — as regras de acesso são lidas do arquivo da entidade
 * (a mesma fonte que a plataforma aplica) e avaliadas por um interpretador
 * mínimo que reproduz `$or` + `user_condition` + condição de identidade.
 *
 * O interpretador não "confia" na regra: se a regra estiver aberta (`{}`), ele
 * devolve acesso para o anônimo e o teste falha. É esse o ponto.
 *
 * ══════════════════ M6.3 FASE 0 — O QUE MUDOU, E POR QUÊ ═══════════════════
 *
 * Os testes S1.2–S1.5 falhavam porque o AUXILIAR não conhecia condição sobre
 * campo do registro: a escrita de `Operation` é fechada com
 * `{ created_by_id: "___somente_servidor___" }` e o auxiliar lançava
 * `Condição de registro não prevista no teste` — errava quem testava, não a
 * produção. Corrigido AQUI, no auxiliar; nenhuma regra de produção foi afrouxada
 * para o teste passar.
 *
 * Como o auxiliar passou a ler cada condição:
 *
 *  · `user_condition` — decide QUEM, por atributo do usuário (role/email/id).
 *  · `created_by_id` / `updated_by_id` — campos de identidade do REGISTRO:
 *      - `___somente_servidor___` → escrita exclusiva do servidor. NENHUM
 *        usuário do navegador passa, nem administrador. É RESTRIÇÃO, nunca
 *        autorização; jamais vira `true`.
 *      - template `{{user.<campo>}}` → condiciona ao dono do registro e exige
 *        usuário autenticado (anônimo resolve para nulo e não casa).
 *      - qualquer outro literal → INDETERMINADO (não identifica usuário).
 *  · condição desconhecida → INDETERMINADO, nunca `true`.
 *
 * `INDETERMINADO` é um TERCEIRO resultado, de propósito: antes o auxiliar
 * estourava (ruído) ou, se fosse tolerante, poderia devolver `true` (falsa
 * aprovação). Agora ele declara o que não sabe representar (S1.7) e nenhum
 * teste aceita indeterminação como acesso.
 *
 * LIMITAÇÃO DECLARADA (não presumida): este auxiliar modela a REGRA LIDA DO
 * ARQUIVO, não o motor da plataforma. Ele não prova que a plataforma aplica
 * `created_by_id` na criação, nem cobre regra que dependa do corpo da
 * requisição. Provar ISOLAMENTO entre identidades exige uma segunda conta real
 * — cenário que este ambiente não oferece e que segue registrado como `skip`
 * (D3.1.8, em d31Integrity.test.js), nunca como aprovado.
 *
 * ════════════════════════════════════════════════════════════════════════════
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

/** Sentinela da plataforma: registro cujo dono é o próprio servidor. */
const SENTINELA_SERVIDOR = '___somente_servidor___';

/** Resultado para o que o auxiliar NÃO consegue representar fielmente. */
const INDETERMINADO = 'indeterminado';

/** Campos de identidade do REGISTRO (gravados pela plataforma, não pelo corpo). */
const CAMPOS_IDENTIDADE = ['created_by_id', 'updated_by_id'];

const TEMPLATE_USUARIO = /^\{\{\s*user\.([A-Za-z0-9_.]+)\s*\}\}$/;

/** Lê um atributo do usuário autenticado (`role`, `email`, `id`, `data.x`). */
function atributoDoUsuario(usuario, caminho) {
  if (!usuario) return undefined;
  const trilha = String(caminho).startsWith('user.') ? String(caminho).slice(5) : String(caminho);
  return trilha.split('.').reduce((alvo, chave) => (alvo == null ? undefined : alvo[chave]), usuario);
}

/** `{{user.id}}` → valor do usuário. Literal não é template. */
function resolverTemplate(valor, usuario) {
  if (typeof valor !== 'string') return { ehTemplate: false };
  const achado = valor.match(TEMPLATE_USUARIO);
  if (!achado) return { ehTemplate: false };
  return { ehTemplate: true, valor: atributoDoUsuario(usuario, achado[1]) };
}

function combinarE(a, b) {
  if (a === false || b === false) return false;
  if (a === INDETERMINADO || b === INDETERMINADO) return INDETERMINADO;
  return true;
}

function combinarOu(resultados) {
  if (resultados.some((r) => r === true)) return true;
  if (resultados.some((r) => r === INDETERMINADO)) return INDETERMINADO;
  return false;
}

/** `user_condition` compara atributos do usuário; anônimo não satisfaz nada. */
function casaCondicaoDeUsuario(usuario, condicao) {
  if (!usuario || !condicao || typeof condicao !== 'object') return false;
  return Object.entries(condicao).every(([campo, esperado]) => {
    const resolvido = resolverTemplate(esperado, usuario);
    const alvo = resolvido.ehTemplate ? resolvido.valor : esperado;
    return atributoDoUsuario(usuario, campo) === alvo;
  });
}

/**
 * Condição sobre `created_by_id` / `updated_by_id`.
 *
 * O sentinela é a forma de dizer "só o servidor escreve". Um usuário do
 * navegador NUNCA o satisfaz — inclusive administrador, porque a plataforma
 * grava esses campos com a identidade de quem escreveu, e o servidor usa
 * credencial de serviço. Tratar isso como "autorizado" seria transformar uma
 * restrição em permissão.
 */
function avaliarIdentidadeDoRegistro(valor, usuario) {
  if (valor === SENTINELA_SERVIDOR) return false;

  const resolvido = resolverTemplate(valor, usuario);
  if (resolvido.ehTemplate) {
    if (!usuario) return false;
    return resolvido.valor != null && resolvido.valor !== '';
  }

  // Operador de query ou literal fixo: o auxiliar não sabe dizer QUEM passa.
  return INDETERMINADO;
}

/** Avalia uma chave da regra. Devolve true | false | INDETERMINADO. */
function avaliarChave(chave, valor, usuario) {
  if (chave === '$or') return combinarOu(valor.map((r) => avaliarRegra(r, usuario)));
  if (chave === '$and') return valor.reduce((acc, r) => combinarE(acc, avaliarRegra(r, usuario)), true);
  if (chave === '$nor') {
    const algum = combinarOu(valor.map((r) => avaliarRegra(r, usuario)));
    return algum === INDETERMINADO ? INDETERMINADO : !algum;
  }
  if (chave === 'user_condition') return casaCondicaoDeUsuario(usuario, valor);
  if (CAMPOS_IDENTIDADE.includes(chave)) return avaliarIdentidadeDoRegistro(valor, usuario);
  return INDETERMINADO;
}

function avaliarRegra(regra, usuario) {
  if (regra === undefined || regra === null) return true; // operação sem regra = aberta
  if (regra === false) return false;
  if (regra === true) return true;
  if (typeof regra !== 'object' || Array.isArray(regra)) return false; // malformada não autoriza
  if (Object.keys(regra).length === 0) return true; // `{}` = aberta

  return Object.entries(regra).reduce(
    (acc, [chave, valor]) => combinarE(acc, avaliarChave(chave, valor, usuario)),
    true,
  );
}

/**
 * Avalia a regra como a plataforma faria para o usuário informado.
 * @returns {true|false|'indeterminado'}
 */
export function permite(regra, usuario) {
  return avaliarRegra(regra, usuario);
}

const ANONIMO = null;
const ADMIN = { id: 'u-admin', email: 'admin@psx.test', role: 'admin' };
const OPERADOR = { id: 'u-op', email: 'operador@psx.test', role: 'user', allowed_pages: ['cheques', 'bancos', 'caixa'] };
const SEM_PAPEL = { id: 'u-x', email: 'x@psx.test', role: 'convidado' };

/**
 * CONTRATO DECLARADO de acesso — o que a produção deve entregar.
 *
 * `autenticado` = admin e operador passam.
 * `servidor`    = NINGUÉM pelo navegador passa: a operação é exclusiva do
 *                 servidor (credencial de serviço).
 *
 * As escritas de Cheque/CashFlow/Banco ainda estão abertas a `role: 'user'`:
 * fechá-las é das Fases 2–6 do M6.3, e este quadro deve ser atualizado naquele
 * momento — com o valor mudando para `servidor` ANTES da regra, nunca depois.
 */
const ACESSO_ESPERADO = {
  Cheque: { read: 'autenticado', create: 'autenticado', update: 'autenticado', delete: 'autenticado' },
  Operation: { read: 'autenticado', create: 'servidor', update: 'servidor', delete: 'servidor' },
  CashFlow: { read: 'autenticado', create: 'autenticado', update: 'autenticado', delete: 'autenticado' },
  Banco: { read: 'autenticado', create: 'autenticado', update: 'autenticado', delete: 'autenticado' },
};

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

test('S1.4 — o contrato declarado de cada entidade é respeitado (leitura aberta, escrita de Operation só no servidor)', () => {
  for (const nome of ENTIDADES) {
    const { rls } = entidade(nome);
    for (const op of OPERACOES) {
      const esperado = ACESSO_ESPERADO[nome][op] === 'autenticado';
      for (const usuario of [ADMIN, OPERADOR]) {
        const obtido = permite(rls[op], usuario);
        assert.notEqual(obtido, INDETERMINADO, `${nome}.${op} caiu em indeterminado — o auxiliar não representa a regra`);
        assert.equal(
          obtido,
          esperado,
          esperado
            ? `${nome}.${op} bloqueou ${usuario.role}, que é legítimo`
            : `${nome}.${op} autorizou ${usuario.role}, mas a escrita é exclusiva do servidor`,
        );
      }
    }
  }
});

test('S1.5 — a regra não usa operador que a escrita não entende', () => {
  // Regra com operador inválido em escrita pode virar "sem restrição".
  const PERMITIDOS = new Set(['$or', '$and', '$nor', 'user_condition', ...CAMPOS_IDENTIDADE]);
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
      if (CAMPOS_IDENTIDADE.includes(chave)) {
        // Identidade do registro: ou é o sentinela do servidor, ou é o dono por
        // template. Literal fixo não identifica usuário e não pode decidir aqui.
        const valor = regra[chave];
        assert.ok(
          valor === SENTINELA_SERVIDOR || TEMPLATE_USUARIO.test(String(valor)),
          `${caminho}.${chave} usa valor que não identifica usuário: ${JSON.stringify(valor)}`,
        );
      }
    }
  }
});

test('S1.6 — o sentinela do servidor é RESTRIÇÃO: não autoriza nenhum perfil no navegador', () => {
  const { rls } = entidade('Operation');
  const textoRegra = (r) => JSON.stringify(r);

  for (const op of ['create', 'update', 'delete']) {
    assert.ok(
      textoRegra(rls[op]).includes(SENTINELA_SERVIDOR),
      `Operation.${op} deveria ser exclusiva do servidor`,
    );
    for (const usuario of [ADMIN, OPERADOR, SEM_PAPEL, ANONIMO]) {
      assert.equal(
        permite(rls[op], usuario),
        false,
        `Operation.${op} autorizou ${usuario ? usuario.role : 'anônimo'} por causa do sentinela`,
      );
    }
  }

  // E a leitura continua legítima: fechar a escrita não fecha a consulta.
  assert.equal(permite(rls.read, ADMIN), true);
  assert.equal(permite(rls.read, OPERADOR), true);
});

test('S1.7 — o auxiliar declara indeterminação em vez de presumir autorização', () => {
  // O que ele NÃO representa fielmente não vira acesso:
  assert.equal(permite({ campo_que_nao_conheco: 'x' }, ADMIN), INDETERMINADO);
  assert.equal(permite({ created_by_id: 'id-fixo-de-alguem' }, ADMIN), INDETERMINADO);
  assert.equal(permite({ created_by_id: { $ne: 'x' } }, ADMIN), INDETERMINADO);
  assert.equal(permite([{ user_condition: { role: 'admin' } }], ADMIN), false, 'regra malformada não autoriza');

  // O que ele representa: dono por template exige identidade real.
  assert.equal(permite({ created_by_id: '{{user.id}}' }, ADMIN), true);
  assert.equal(permite({ created_by_id: '{{user.id}}' }, ANONIMO), false);

  // Nenhuma regra REAL pode cair em indeterminado: se cair, é o auxiliar que
  // precisa evoluir — e o teste aponta o caso, em vez de aprovar por omissão.
  for (const nome of ENTIDADES) {
    const { rls } = entidade(nome);
    for (const op of OPERACOES) {
      assert.notEqual(
        permite(rls[op], ADMIN),
        INDETERMINADO,
        `${nome}.${op} usa condição que o auxiliar não representa`,
      );
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