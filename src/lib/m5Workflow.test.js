/**
 * M5 — WORKFLOW DE OPERAÇÕES: REGRAS, AUTORIZAÇÃO, CONCORRÊNCIA E EFEITOS.
 *
 * Separação honesta do que cada bloco prova:
 *
 *  · REGRA (M5.1–M5.4, M5.8–M5.13) — executa o módulo puro de verdade com
 *    usuários, operações e títulos fabricados. Prova a DECISÃO.
 *
 *  · MECANISMO (M5.6, M5.7) — executa o mesmo encadeamento que a função de
 *    servidor faz (decisão → compare-and-swap → efeitos nos títulos) contra um
 *    armazenamento em memória que implementa o CAS. Prova que a ordem de
 *    aplicação impede etapa dupla, não que a plataforma se comporte assim.
 *
 *  · ESTRUTURA (M5.5, M5.14, M5.15) — asserções sobre o texto da função de
 *    servidor (identidade vem do token, corpo não decide papel/etapa, nenhuma
 *    chamada ao Asaas) e paridade entre a cópia do navegador e a do servidor.
 *
 * O que NÃO está aqui: chamar a função real com um usuário `user`. O ambiente
 * de build autentica como administrador; um teste assim passaria pelo caminho
 * de admin e não provaria isolamento. Fica declarado como pendente.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  ACOES,
  MOTIVO_MINIMO,
  TRANSICOES,
  STAGES,
  normalizarEtapa,
  papelDoUsuario,
  efeitosFinanceiros,
  titulosParaCancelar,
  titulosParaRestaurar,
  avaliarTransicao,
  acoesDisponiveis,
} from './operationWorkflow.js';

const AQUI = dirname(fileURLToPath(import.meta.url));
const ler = (p) => readFileSync(join(AQUI, p), 'utf8');

const admin = { email: 'admin@psx.test', role: 'admin' };
const operador = { email: 'op@psx.test', role: 'user', allowed_pages: ['operacoes'] };
const semPagina = { email: 'sp@psx.test', role: 'user', allowed_pages: ['clientes'] };

const titulo = (extra = {}) => ({ id: 't1', status: 'pendente', valor_face: 1000, ...extra });
const operacao = (extra = {}) => ({
  id: 'op1',
  etapa: 'rascunho',
  client_id: 'c1',
  produto: 'cheque',
  total_receivable: 1000,
  amount_paid: 0,
  installment_schedule: [{ id: 'p1', due_date: '2026-11-20', total_distribuido: 1000 }],
  ...extra,
});

/** Encadeamento idêntico ao da função de servidor, sobre um store em memória. */
function driver(op, titulos = [], contexto = {}) {
  const estado = {
    op: JSON.parse(JSON.stringify(op)),
    titulos: JSON.parse(JSON.stringify(titulos)),
  };
  const criados = { titulos: 0, operacoes: 0 };
  const logs = [];
  const store = {
    Operation: {
      get: async (id) => (id === estado.op.id ? { ...estado.op } : null),
      updateMany: async (filtro, upd) => {
        if (filtro.id !== estado.op.id) return { updated: 0 };
        const casam = (filtro.$or || [{}]).some((c) => {
          if (!('etapa' in c)) return true;
          if (c.etapa && c.etapa.$exists === false) return estado.op.etapa === undefined;
          return estado.op.etapa === c.etapa;
        });
        if (!casam) return { updated: 0 };
        estado.op.etapa = upd.$set.etapa;
        return { updated: 1 };
      },
      create: async () => { criados.operacoes += 1; },
    },
    Cheque: {
      filter: async () => estado.titulos.map((t) => ({ ...t })),
      updateMany: async (q, upd) => {
        const ids = (q.id && q.id.$in) || [];
        let n = 0;
        estado.titulos = estado.titulos.map((t) => {
          if (!ids.includes(t.id)) return t;
          if (q.status && t.status !== q.status) return t;
          n += 1;
          return { ...t, status: upd.$set.status };
        });
        return { updated: n };
      },
      create: async () => { criados.titulos += 1; },
    },
  };

  async function aplicar(decisao, acao, motivo = '') {
    if (!decisao.permitida) return { ok: false, status: decisao.status, erro: decisao.motivo, bloqueios: decisao.bloqueios };
    const filtro = { id: estado.op.id, $or: [{ etapa: decisao.etapaAtual }] };
    if (decisao.etapaAtual === 'rascunho') filtro.$or.push({ etapa: { $exists: false } });
    const res = await store.Operation.updateMany(filtro, { $set: { etapa: decisao.destino } });
    if (!res.updated) return { ok: false, status: 409, erro: 'A operação mudou de etapa durante a solicitação.' };
    if (decisao.cancelar.length) await store.Cheque.updateMany({ id: { $in: decisao.cancelar }, status: 'pendente' }, { $set: { status: 'cancelado' } });
    if (decisao.restaurar.length) await store.Cheque.updateMany({ id: { $in: decisao.restaurar }, status: 'cancelado' }, { $set: { status: 'pendente' } });
    logs.push({ acao, de: decisao.etapaAtual, para: decisao.destino, motivo });
    return { ok: true, etapa: decisao.destino, avisos: decisao.avisos };
  }

  async function transicionar({ usuario, acao, motivo = '' }) {
    const decisao = avaliarTransicao({ operacao: estado.op, titulos: estado.titulos, contexto, usuario, acao, motivo });
    return aplicar(decisao, acao, motivo);
  }

  return { estado, store, logs, criados, transicionar, aplicar, decidir: ({ usuario, acao, motivo = '' }) =>
    avaliarTransicao({ operacao: estado.op, titulos: estado.titulos, contexto, usuario, acao, motivo }) };
}

const contextoPadrao = { cliente: { status: 'ativo', credit_limit: 0 }, config: {}, exposicao: 0 };

// ── M5.1 — todas as transições válidas de avanço ────────────────────────────
test('M5.1 avança por todas as etapas válidas até finalizada', async () => {
  const d = driver(operacao({ etapa: 'rascunho', payment_executed: true }), [titulo()], contextoPadrao);
  const esperado = ['analise_credito', 'confirmacao_titulos', 'formalizacao', 'assinatura', 'pagamento', 'finalizada'];
  for (const etapa of esperado) {
    const r = await d.transicionar({ usuario: operador, acao: ACOES.AVANCAR });
    assert.equal(r.ok, true, r.erro);
    assert.equal(r.etapa, etapa);
  }
  assert.equal(d.estado.op.etapa, 'finalizada');
  assert.equal(d.logs.length, 6);
});

// ── M5.2 — transições inválidas ─────────────────────────────────────────────
test('M5.2 recusa transições inválidas e etapas fora da tabela', () => {
  const casos = [
    { op: operacao({ etapa: 'finalizada' }), acao: ACOES.AVANCAR },
    { op: operacao({ etapa: 'finalizada' }), acao: ACOES.REJEITAR },
    { op: operacao({ etapa: 'rascunho' }), acao: ACOES.REABRIR },
    { op: operacao({ etapa: 'rascunho' }), acao: ACOES.VOLTAR_RASCUNHO },
    { op: operacao({ etapa: 'analise_credito' }), acao: 'estornar_tudo' },
    { op: operacao({ etapa: 'inexistente' }), acao: ACOES.AVANCAR },
  ];
  for (const c of casos) {
    const r = avaliarTransicao({ operacao: c.op, titulos: [titulo()], contexto: contextoPadrao, usuario: operador, acao: c.acao, motivo: 'motivo valido' });
    assert.equal(r.permitida, false, `${c.acao} em ${c.op.etapa}`);
    assert.equal(r.status, 409);
  }
  assert.equal(normalizarEtapa(undefined), 'rascunho');
  assert.equal(normalizarEtapa('rascunho'), 'rascunho');
  assert.equal(normalizarEtapa('qualquer'), 'desconhecida');
});

// ── M5.3 — pré-requisitos comerciais e documentais ──────────────────────────
test('M5.3 bloqueia avanço sem os pré-requisitos da etapa', () => {
  const semTitulo = avaliarTransicao({ operacao: operacao({ etapa: 'rascunho' }), titulos: [], contexto: contextoPadrao, usuario: operador, acao: ACOES.AVANCAR });
  assert.equal(semTitulo.permitida, false);
  assert.match(semTitulo.motivo, /título/i);

  const semRepasse = avaliarTransicao({ operacao: operacao({ etapa: 'pagamento', payment_executed: false }), titulos: [titulo()], contexto: contextoPadrao, usuario: operador, acao: ACOES.AVANCAR });
  assert.equal(semRepasse.permitida, false);
  assert.match(semRepasse.motivo, /repasse/i);

  const semContratoGerado = avaliarTransicao({ operacao: operacao({ etapa: 'formalizacao', needs_contract: true }), titulos: [titulo()], contexto: { ...contextoPadrao, temContrato: false }, usuario: operador, acao: ACOES.AVANCAR });
  assert.equal(semContratoGerado.permitida, false);
  assert.match(semContratoGerado.motivo, /contrato/i);

  const semAssinatura = avaliarTransicao({ operacao: operacao({ etapa: 'assinatura', needs_contract: true, contract_signed_confirmed: false }), titulos: [titulo()], contexto: contextoPadrao, usuario: operador, acao: ACOES.AVANCAR });
  assert.equal(semAssinatura.permitida, false);
  assert.match(semAssinatura.motivo, /assinado/i);

  const clienteBloqueado = avaliarTransicao({ operacao: operacao({ etapa: 'analise_credito' }), titulos: [titulo()], contexto: { cliente: { status: 'bloqueado', credit_limit: 0 }, config: {}, exposicao: 0 }, usuario: operador, acao: ACOES.AVANCAR });
  assert.equal(clienteBloqueado.permitida, false);

  const limite = avaliarTransicao({ operacao: operacao({ etapa: 'analise_credito', total_receivable: 800 }), titulos: [titulo()], contexto: { cliente: { status: 'ativo', credit_limit: 1000 }, config: { block_over_limit: true }, exposicao: 500 }, usuario: operador, acao: ACOES.AVANCAR });
  assert.equal(limite.permitida, false);
  assert.match(limite.motivo, /Limite/i);

  // Agenda de parcelas e documentação do cedente não travam mais a passagem.
  const semAgenda = avaliarTransicao({ operacao: operacao({ etapa: 'confirmacao_titulos', installment_schedule: [] }), titulos: [titulo()], contexto: contextoPadrao, usuario: operador, acao: ACOES.AVANCAR });
  assert.equal(semAgenda.permitida, true);

  const semDocumentos = avaliarTransicao({ operacao: operacao({ etapa: 'analise_credito' }), titulos: [titulo()], contexto: { cliente: { status: 'ativo', credit_limit: 0 }, config: { validate_cpf_cnpj: true }, exposicao: 0 }, usuario: operador, acao: ACOES.AVANCAR });
  assert.equal(semDocumentos.permitida, true);
  assert.equal(semDocumentos.avisos.length, 0);

  // Modalidade sem contrato não pode exigir assinatura.
  const semContratoExigido = avaliarTransicao({ operacao: operacao({ etapa: 'assinatura', needs_contract: false }), titulos: [titulo()], contexto: contextoPadrao, usuario: operador, acao: ACOES.AVANCAR });
  assert.equal(semContratoExigido.permitida, true);

  // Assinatura: finalizar exige cobrança/assinatura emitida no Asaas.
  const assinaturaSemCobranca = avaliarTransicao({ operacao: operacao({ etapa: 'pagamento', produto: 'assinatura' }), titulos: [titulo()], contexto: contextoPadrao, usuario: operador, acao: ACOES.AVANCAR });
  assert.equal(assinaturaSemCobranca.permitida, false);
});

// ── M5.4 — perfis autorizados e não autorizados ─────────────────────────────
test('M5.4 respeita o perfil em cada transição', () => {
  assert.equal(papelDoUsuario(null), 'anonimo');
  assert.equal(papelDoUsuario(admin), 'admin');
  assert.equal(papelDoUsuario(operador), 'operacional');
  assert.equal(papelDoUsuario(semPagina), 'sem_permissao');
  assert.equal(papelDoUsuario({ email: 'x@y', role: 'financeiro' }), 'desconhecido');

  const anonimo = avaliarTransicao({ operacao: operacao(), titulos: [titulo()], usuario: null, acao: ACOES.AVANCAR });
  assert.equal(anonimo.status, 401);

  const semPaginaR = avaliarTransicao({ operacao: operacao(), titulos: [titulo()], usuario: semPagina, acao: ACOES.AVANCAR });
  assert.equal(semPaginaR.permitida, false);
  assert.equal(semPaginaR.status, 403);

  const operadorAvanca = avaliarTransicao({ operacao: operacao(), titulos: [titulo()], usuario: operador, acao: ACOES.AVANCAR });
  assert.equal(operadorAvanca.permitida, true);

  const operadorReverte = avaliarTransicao({ operacao: operacao({ etapa: 'analise_credito' }), titulos: [titulo()], usuario: operador, acao: ACOES.VOLTAR_RASCUNHO });
  assert.equal(operadorReverte.permitida, false);
  assert.equal(operadorReverte.exige_admin, true);

  const adminReverte = avaliarTransicao({ operacao: operacao({ etapa: 'analise_credito' }), titulos: [titulo()], usuario: admin, acao: ACOES.VOLTAR_RASCUNHO });
  assert.equal(adminReverte.permitida, true);

  // A interface só oferece o que o papel permite — complementar ao servidor.
  assert.deepEqual(acoesDisponiveis({ etapa: 'analise_credito' }, operador).sort(), [ACOES.AVANCAR, ACOES.REJEITAR].sort());
  assert.deepEqual(acoesDisponiveis({ etapa: 'analise_credito' }, admin).sort(), [ACOES.AVANCAR, ACOES.REJEITAR, ACOES.VOLTAR_RASCUNHO].sort());
  assert.deepEqual(acoesDisponiveis({ etapa: 'finalizada' }, admin), []);
  assert.deepEqual(acoesDisponiveis({ etapa: 'rejeitada' }, operador), [ACOES.REABRIR]);
});

// ── M5.5 — chamada direta sem autorização + estrutura da função ─────────────
test('M5.5 função de servidor tira identidade do token e ignora papel/etapa do corpo', () => {
  const fonte = ler('../../base44/functions/workflowOperacao/entry.ts');
  assert.match(fonte, /base44\.auth\.me\(\)/);
  assert.doesNotMatch(fonte, /body\.(role|papel|usuario|email)/);
  assert.doesNotMatch(fonte, /body\.(etapa|status)\s*\|\|/);
  assert.match(fonte, /updateMany\(filtro/);
  assert.match(fonte, /auditlog/i);
  // A decisão precisa acontecer antes de qualquer escrita.
  assert.ok(fonte.indexOf('avaliarTransicao(') > -1);
  assert.ok(fonte.indexOf('avaliarTransicao(') < fonte.indexOf('entities.Operation.updateMany'));
});

// ── M5.6 — transições concorrentes ──────────────────────────────────────────
test('M5.6 duas transições concorrentes: apenas uma vence', async () => {
  const d = driver(operacao({ etapa: 'rascunho' }), [titulo()], contextoPadrao);
  // Duas requisições simultâneas leem a MESMA etapa antes de qualquer escrita.
  const decisaoA = d.decidir({ usuario: operador, acao: ACOES.AVANCAR });
  const decisaoB = d.decidir({ usuario: operador, acao: ACOES.AVANCAR });
  assert.equal(decisaoA.etapaAtual, decisaoB.etapaAtual);
  const a = await d.aplicar(decisaoA, ACOES.AVANCAR);
  const b = await d.aplicar(decisaoB, ACOES.AVANCAR);
  const oks = [a, b].filter((r) => r.ok).length;
  assert.equal(oks, 1);
  assert.equal(d.estado.op.etapa, 'analise_credito');
  assert.equal([a, b].find((r) => !r.ok).status, 409);
});

// ── M5.7 — repetição da mesma solicitação ───────────────────────────────────
test('M5.7 repetir a mesma transição não avança duas etapas', async () => {
  const d = driver(operacao({ etapa: 'rascunho' }), [titulo()], contextoPadrao);
  const primeira = await d.transicionar({ usuario: operador, acao: ACOES.AVANCAR });
  const segunda = await d.transicionar({ usuario: operador, acao: ACOES.REJEITAR, motivo: 'cliente desistiu' });
  assert.equal(primeira.ok, true);
  assert.equal(segunda.ok, true); // rejeitar é válido em analise_credito, mas...
  assert.equal(d.estado.op.etapa, 'rejeitada');
  const repetida = await d.transicionar({ usuario: operador, acao: ACOES.REJEITAR, motivo: 'cliente desistiu' });
  assert.equal(repetida.ok, false);
  assert.equal(repetida.status, 409);
});

// ── M5.8 — rejeição sem efeitos financeiros ─────────────────────────────────
test('M5.8 rejeita operação sem efeitos cancelando apenas títulos pendentes', async () => {
  const d = driver(operacao({ etapa: 'formalizacao' }), [
    titulo({ id: 't1', status: 'pendente' }),
    titulo({ id: 't2', status: 'cancelado' }),
    titulo({ id: 't3', status: 'devolvido' }),
  ], contextoPadrao);
  const r = await d.transicionar({ usuario: operador, acao: ACOES.REJEITAR, motivo: 'documentacao irregular' });
  assert.equal(r.ok, false); // t3 devolvido é efeito financeiro
  assert.match(r.erro, /regulariza/i);

  const d2 = driver(operacao({ etapa: 'formalizacao' }), [titulo({ id: 't1', status: 'pendente' }), titulo({ id: 't2', status: 'cancelado' })], contextoPadrao);
  const r2 = await d2.transicionar({ usuario: operador, acao: ACOES.REJEITAR, motivo: 'documentacao irregular' });
  assert.equal(r2.ok, true);
  assert.equal(d2.estado.op.etapa, 'rejeitada');
  assert.equal(d2.estado.titulos.find((t) => t.id === 't1').status, 'cancelado');
  assert.equal(d2.estado.titulos.length, 2);
  assert.equal(d2.criados.titulos, 0);
  assert.equal(d2.criados.operacoes, 0);

  const semMotivo = avaliarTransicao({ operacao: operacao({ etapa: 'rascunho' }), titulos: [titulo()], usuario: operador, acao: ACOES.REJEITAR, motivo: 'nao' });
  assert.equal(semMotivo.permitida, false);
  assert.equal(semMotivo.status, 400);
  assert.equal('nao'.length < MOTIVO_MINIMO, true);
});

// ── M5.9 — rejeição com efeitos financeiros ─────────────────────────────────
test('M5.9 bloqueia rejeição quando há efeito financeiro concretizado', () => {
  const casos = [
    { op: operacao({ amount_paid: 10 }), ts: [titulo()], nome: 'recebimento' },
    { op: operacao({ receipt_keys: ['manual:abc'] }), ts: [titulo()], nome: 'chave de recebimento' },
    { op: operacao({ cheques_compensados_total: 500 }), ts: [titulo()], nome: 'cheques compensados' },
    { op: operacao({}), ts: [titulo({ status: 'compensado', compensation_token: 'tk' })], nome: 'titulo compensado' },
    { op: operacao({ asaas_payment_id: 'pay_1' }), ts: [titulo()], nome: 'cobranca asaas' },
    { op: operacao({ asaas_intents: { 0: { estado: 'criada' } } }), ts: [titulo()], nome: 'intencao asaas' },
    { op: operacao({ payment_executed: true }), ts: [titulo()], nome: 'repasse' },
    { op: operacao({ asaas_lancamentos_gerados: ['pay_1'] }), ts: [titulo()], nome: 'extrato' },
  ];
  for (const c of casos) {
    const r = avaliarTransicao({ operacao: c.op, titulos: c.ts, usuario: operador, acao: ACOES.REJEITAR, motivo: 'motivo valido' });
    assert.equal(r.permitida, false, c.nome);
    assert.equal(r.status, 409);
  }
});

// ── M5.10 — reabertura com títulos cancelados ───────────────────────────────
test('M5.10 reabre restaurando só títulos cancelados sem evidência de efeito', async () => {
  // Caso seguro: títulos cancelados sem nenhuma evidência de efeito.
  const d = driver(operacao({ etapa: 'rejeitada' }), [
    titulo({ id: 't1', status: 'cancelado' }),
    titulo({ id: 't2', status: 'cancelado' }),
  ], contextoPadrao);
  const r = await d.transicionar({ usuario: operador, acao: ACOES.REABRIR });
  assert.equal(r.ok, true, r.erro);
  assert.equal(d.estado.op.etapa, 'rascunho');
  assert.equal(d.estado.titulos.find((t) => t.id === 't1').status, 'pendente');
  assert.equal(d.estado.titulos.find((t) => t.id === 't2').status, 'pendente');
  assert.equal(d.criados.titulos, 0);

  // Caso bloqueado: algum título já teve efeito financeiro — reabrir não é seguro.
  const comEfeito = driver(operacao({ etapa: 'rejeitada' }), [
    titulo({ id: 't2', status: 'cancelado', compensation_token: 'tk' }),
  ], contextoPadrao);
  const r2 = await comEfeito.transicionar({ usuario: operador, acao: ACOES.REABRIR });
  assert.equal(r2.ok, false);
  assert.match(r2.erro, /regulariza/i);
  assert.equal(comEfeito.estado.titulos[0].status, 'cancelado');

  const reabrirComRecebimento = avaliarTransicao({ operacao: operacao({ etapa: 'rejeitada', amount_paid: 100 }), titulos: [titulo()], usuario: operador, acao: ACOES.REABRIR });
  assert.equal(reabrirComRecebimento.permitida, false);
});

// ── M5.11 — preservação de documentos e vínculos dos títulos ────────────────
test('M5.11 transições não recriam títulos nem tocam a agenda de parcelas', async () => {
  const agenda = [{ id: 'p1', due_date: '2026-11-20', total_distribuido: 600 }, { id: 'p2', due_date: '2026-12-20', total_distribuido: 400 }];
  const d = driver(operacao({ etapa: 'rascunho', installment_schedule: agenda, contract_url: 'https://doc/1' }), [titulo({ id: 't1' }), titulo({ id: 't2' })], contextoPadrao);
  const antes = JSON.stringify(d.estado.op.installment_schedule);
  await d.transicionar({ usuario: operador, acao: ACOES.AVANCAR });
  await d.transicionar({ usuario: operador, acao: ACOES.AVANCAR });
  await d.transicionar({ usuario: operador, acao: ACOES.REJEITAR, motivo: 'credito reprovado' });
  await d.transicionar({ usuario: operador, acao: ACOES.REABRIR });
  assert.equal(JSON.stringify(d.estado.op.installment_schedule), antes);
  assert.equal(d.estado.op.contract_url, 'https://doc/1');
  assert.deepEqual(d.estado.titulos.map((t) => t.id), ['t1', 't2']);
  assert.equal(d.criados.titulos, 0);
});

// ── M5.12 — compatibilidade com o M3 ────────────────────────────────────────
test('M5.12 recebimentos do M3 continuam protegidos pelo workflow', () => {
  const pago = operacao({ etapa: 'pagamento', amount_paid: 400, receipt_keys: ['manual:xyz'], balance_due: 600, status: 'ativo' });
  const r = avaliarTransicao({ operacao: pago, titulos: [titulo()], usuario: operador, acao: ACOES.REJEITAR, motivo: 'motivo valido' });
  assert.equal(r.permitida, false);
  // Avançar para finalizada não depende de amount_paid — depende do repasse real.
  const avanca = avaliarTransicao({ operacao: { ...pago, payment_executed: true }, titulos: [titulo()], usuario: operador, acao: ACOES.AVANCAR });
  assert.equal(avanca.permitida, true);
});

// ── M5.13 — compatibilidade com o M4 ────────────────────────────────────────
test('M5.13 operações do M4 (agenda com ids, etapa rascunho) seguem válidas', async () => {
  const opM4 = { id: 'op1', etapa: 'rascunho', client_id: 'c1', produto: 'cheque', total_receivable: 1000, amount_paid: 0, balance_due: 1000, installment_schedule: [{ id: 'p1' }, { id: 'p2' }] };
  const d = driver(opM4, [titulo()], contextoPadrao);
  const r = await d.transicionar({ usuario: operador, acao: ACOES.AVANCAR });
  assert.equal(r.ok, true, r.erro);

  // Registro antigo sem `etapa` é tratado como rascunho e o CAS o alcança.
  const legado = driver({ id: 'op1', client_id: 'c1', produto: 'cheque', total_receivable: 1000 }, [titulo()], contextoPadrao);
  const rl = await legado.transicionar({ usuario: operador, acao: ACOES.AVANCAR });
  assert.equal(rl.ok, true, rl.erro);
  assert.equal(legado.estado.op.etapa, 'analise_credito');
});

// ── M5.14 — nenhuma chamada real ao Asaas ───────────────────────────────────
test('M5.14 workflow não faz chamada ao Asaas', () => {
  const fonte = ler('../../base44/functions/workflowOperacao/entry.ts');
  assert.doesNotMatch(fonte, /fetch\(/);
  assert.doesNotMatch(fonte, /asaas\.com/i);
  assert.doesNotMatch(fonte, /ASAAS_API_KEY/);
});

// ── M5.15 — paridade das cópias (navegador × servidor) ──────────────────────
test('M5.15 cópia do servidor é idêntica à do navegador', () => {
  const navegador = ler('./operationWorkflow.js');
  const servidor = readFileSync(join(AQUI, '../../base44/shared/operationWorkflow.js'), 'utf8');
  assert.equal(servidor, navegador);
});

// ── Extra — tabela declarativa íntegra ──────────────────────────────────────
test('M5.16 tabela de transições cobre todas as etapas e não tem destino órfão', () => {
  const etapas = [...STAGES.map((s) => s.key), 'rejeitada'];
  for (const t of TRANSICOES) {
    assert.ok(etapas.includes(t.de), `origem desconhecida: ${t.de}`);
    assert.ok(etapas.includes(t.para), `destino desconhecido: ${t.para}`);
  }
  const avancos = TRANSICOES.filter((t) => t.acao === ACOES.AVANCAR);
  assert.equal(avancos.length, STAGES.length - 1);
  const cancelar = titulosParaCancelar([titulo({ id: 'a' }), titulo({ id: 'b', status: 'compensado' })]);
  assert.deepEqual(cancelar, ['a']);
  const restaurar = titulosParaRestaurar([titulo({ id: 'a', status: 'cancelado' }), titulo({ id: 'b', status: 'cancelado', resolucao_evento: 'r' })]);
  assert.deepEqual(restaurar, ['a']);
  assert.equal(efeitosFinanceiros({}, []).algum, false);
});