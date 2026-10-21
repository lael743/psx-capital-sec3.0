/**
 * D4.2 — EVENTOS DE CAIXA AUTORIZADOS NO SERVIDOR.
 *
 * Centraliza os lançamentos que antes eram escritos pelo navegador:
 *   · lancamento_avulso   — entrada/saída manual numa conta;
 *   · lucro_prorrogacao   — recebimento do lucro de uma prorrogação;
 *   · remessa_banco       — lote de cheques enviado ao banco (custódia);
 *   · retorno_banco       — lote devolvido pelo banco (custódia);
 *   · ajuste_saldo        — M6.3: correção do saldo oficial, ato administrativo;
 *   · excluir_conta       — M6.3: exclusão de conta SEM histórico (arquivar é a
 *                           alternativa quando há movimentação);
 *   · inspecionar         — diagnóstico de um evento (somente leitura).
 *
 * ── ORDEM OBRIGATÓRIA ──────────────────────────────────────────────────────
 *   identidade (token) → autorização (papel + página) → validação →
 *   leitura das entidades pelo SERVIDOR → aplicação.
 * O corpo da requisição escolhe apenas QUAL operação e os DADOS do negócio.
 * Nunca papel, e-mail, dono, saldo ou conta de destino de terceiros.
 *
 * ── O QUE NÃO ENTRA AQUI ───────────────────────────────────────────────────
 * Compensação/estorno de cheque e resolução de cheque devolvido continuam no
 * navegador nesta fase: eles carregam a alocação cheque↔parcela (D1.x) e a
 * taxa sobre a operação. Migrá-los exige levar `chequeCore`/`chequeWrite` para
 * `base44/shared/` — extração própria, para não duplicar a regra de alocação.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';

import { autorizarMovimentacaoBancaria, ACOES_BANCARIAS } from '../../shared/bankAuthorization.js';
import {
  registrarMovimento,
  criarLancamentoUnico,
  diagnosticarMovimento,
  chaveLancamentoAvulso,
  chaveLucroProrrogacao,
  chaveRemessa,
  chaveRetorno,
  chaveAjusteSaldo,
  validarLancamentoAvulso,
  validarLucro,
  validarLote,
  validarAjuste,
  avaliarExclusaoConta,
  idDeEventoValido,
  DESTINOS_RETORNO,
  TIPOS,
} from '../../shared/bankMovement.js';

/** Operação do corpo → ação da política. Qualquer outra coisa cai em 403. */
const ACAO_POR_OPERACAO = {
  lancamento_avulso: ACOES_BANCARIAS.LANCAR,
  lucro_prorrogacao: ACOES_BANCARIAS.LANCAR,
  remessa_banco: ACOES_BANCARIAS.REMESSA,
  retorno_banco: ACOES_BANCARIAS.REMESSA,
  ajuste_saldo: ACOES_BANCARIAS.AJUSTAR_SALDO,
  excluir_conta: ACOES_BANCARIAS.EXCLUIR_CONTA,
  inspecionar: ACOES_BANCARIAS.INSPECIONAR,
};

function ok(data) {
  return Response.json({ ok: true, ...data });
}

function falha(erro, status) {
  return Response.json({ ok: false, erro }, { status: status || 400 });
}

function texto(valor, limite) {
  return typeof valor === 'string' ? valor.trim().slice(0, limite || 500) : '';
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);

    // ── 1. IDENTIDADE — do token, jamais do corpo ──────────────────────────
    const usuario = await base44.auth.me().catch(() => null);
    if (!usuario || !usuario.email) return falha('Não autenticado.', 401);

    const body = await req.json().catch(() => ({}));
    const operacao = texto(body.acao, 40);
    const userEmail = usuario.email;

    // ── 2. AUTORIZAÇÃO — antes de qualquer leitura privilegiada ────────────
    const decisao = autorizarMovimentacaoBancaria(usuario, ACAO_POR_OPERACAO[operacao]);
    if (!decisao.autorizado) return falha(decisao.motivo, 403);

    const servico = base44.asServiceRole;
    // Escrita por query (compare-and-swap) e LEITURA por id: sem o `get` o
    // diagnóstico não enxerga `applied_ledger_keys` e aponta divergência falsa.
    const bancoStore = {
      updateWhere: (q, u) => servico.entities.Banco.updateMany(q, u),
      get: (id) => servico.entities.Banco.get(id),
    };
    const cashflowStore = {
      create: (d) => servico.entities.CashFlow.create(d),
      filter: (q) => servico.entities.CashFlow.filter(q),
    };

    // ── 3. LANÇAMENTO AVULSO ───────────────────────────────────────────────
    if (operacao === 'lancamento_avulso') {
      const bancoId = texto(body.bankId, 60);
      const eventId = texto(body.eventId, 120);
      const tipo = texto(body.tipo, 10);
      const valor = Number(body.valor);
      const motivo = texto(body.motivo, 300);
      const data = texto(body.data, 10);

      if (!bancoId) return falha('Conta é obrigatória.');
      if (!idDeEventoValido(eventId)) return falha('Identificador do evento inválido.');

      const erro = validarLancamentoAvulso({ tipo, valor, motivo, data });
      if (erro) return falha(erro);

      const banco = await servico.entities.Banco.get(bancoId).catch(() => null);
      if (!banco) return falha('Conta não encontrada.', 404);

      const eventKey = chaveLancamentoAvulso(eventId);
      const res = await registrarMovimento({
        bancoStore,
        cashflowStore,
        bankId: banco.id,
        delta: tipo === TIPOS.ENTRADA ? valor : -valor,
        eventKey,
        lancamento: {
          type: tipo,
          category: 'lancamento_avulso',
          amount: valor,
          date: data,
          description: `[Lançamento Avulso] ${banco.name} — ${motivo}`,
          method: 'outro',
          bank_id: banco.id,
        },
      });

      if (res.status === 'ja_aplicado') {
        return falha('Este lançamento já foi aplicado nesta conta.', 409);
      }

      return ok({ status: res.status, cashflow_id: res.cashflow_id || null, event_key: eventKey });
    }

    // ── 4. LUCRO DE PRORROGAÇÃO ────────────────────────────────────────────
    if (operacao === 'lucro_prorrogacao') {
      const chequeId = texto(body.chequeId, 60);
      const bancoId = texto(body.bankId, 60);
      const valor = Number(body.valor);
      const data = texto(body.data, 10);
      const forma = texto(body.forma, 20);

      if (!chequeId || !bancoId) return falha('Cheque e banco são obrigatórios.');

      const erro = validarLucro({ valor, data, forma });
      if (erro) return falha(erro);

      const [cheque, banco] = await Promise.all([
        servico.entities.Cheque.get(chequeId).catch(() => null),
        servico.entities.Banco.get(bancoId).catch(() => null),
      ]);
      if (!cheque) return falha('Cheque não encontrado.', 404);
      if (!banco) return falha('Conta não encontrada.', 404);

      const eventKey = chaveLucroProrrogacao(cheque.id, data, valor);
      const res = await registrarMovimento({
        bancoStore,
        cashflowStore,
        bankId: banco.id,
        delta: valor,
        eventKey,
        lancamento: {
          type: TIPOS.ENTRADA,
          category: 'lucro_prorrogacao_cheque',
          amount: valor,
          date: data,
          description: `Lucro prorrogação cheque #${cheque.check_number} — ${cheque.client_name} (Banco: ${banco.name})`,
          method: forma,
          bank_id: banco.id,
        },
      });

      if (res.status === 'ja_aplicado') {
        return falha('Este recebimento já foi registrado.', 409);
      }

      // A anotação no cheque acompanha o recebimento: só existe quando o
      // crédito de fato aconteceu.
      const nota = `[LUCRO PRORROGAÇÃO RECEBIDO em ${data}] ${valor} via ${forma.toUpperCase()} — ${banco.name}`;
      const notas = cheque.notes ? `${cheque.notes}\n${nota}` : nota;
      await servico.entities.Cheque.update(cheque.id, { notes: notas });

      return ok({ status: res.status, cashflow_id: res.cashflow_id || null, event_key: eventKey });
    }

    // ── 5. REMESSA / RETORNO DE CHEQUES (custódia, sem saldo) ──────────────
    if (operacao === 'remessa_banco' || operacao === 'retorno_banco') {
      const bancoId = texto(body.bankId, 60);
      const eventId = texto(body.eventId, 120);
      const data = texto(body.data, 10);
      const chequeIds = Array.isArray(body.chequeIds) ? body.chequeIds : [];

      if (!bancoId) return falha('Banco é obrigatório.');
      if (!idDeEventoValido(eventId)) return falha('Identificador do evento inválido.');

      const erro = validarLote({ chequeIds, data });
      if (erro) return falha(erro);

      // A plataforma RECUSA ids fora do formato de registro e devolve erro
      // interno. Recusar antes evita 500 e não vaza mensagem da infraestrutura.
      if (chequeIds.some((id) => !/^[a-f0-9]{24}$/i.test(String(id)))) {
        return falha('Lista de cheques inválida.');
      }

      const banco = await servico.entities.Banco.get(bancoId).catch(() => null);
      if (!banco) return falha('Conta não encontrada.', 404);

      const encontrados = await servico.entities.Cheque.filter({ id: { $in: chequeIds } }).catch(() => []);
      const cheques = Array.isArray(encontrados) ? encontrados : (encontrados && encontrados.items) || [];
      if (cheques.length !== chequeIds.length) return falha('Um ou mais cheques não foram encontrados.', 404);

      const total = cheques.reduce((s, c) => s + (Number(c.value) || 0), 0);
      const obs = texto(body.observacoes, 300);
      const ehRemessa = operacao === 'remessa_banco';

      let destino = '';
      if (!ehRemessa) {
        destino = texto(body.destino, 20);
        if (!DESTINOS_RETORNO.includes(destino)) return falha('Destino inválido.');
      }

      // Custódia: escrito por lote, um registro por cheque (atômico por doc).
      const patch = ehRemessa
        ? (c) => ({
            custody_status: 'financeiro',
            deposited_bank_id: banco.id,
            deposited_bank_name: banco.name || '',
            notes: `${c.notes ? c.notes + '\n' : ''}[ENVIADO AO BANCO em ${data}] Banco: ${banco.name || banco.id}${obs ? ` | Obs: ${obs}` : ''}`,
          })
        : (c) => ({
            custody_status: destino,
            status: 'devolvido',
            return_reason: obs || 'Devolvido pelo banco',
            notes: `${c.notes ? c.notes + '\n' : ''}[RETORNADO DO BANCO em ${data}] Destino: ${destino}${obs ? ` | Obs: ${obs}` : ''}`,
          });

      await servico.entities.Cheque.bulkUpdate(cheques.map((c) => ({ id: c.id, ...patch(c) })));

      // Lançamento de CONTROLE: não mexe em saldo — o saldo só muda na
      // compensação. Criado uma única vez por evento.
      const eventKey = ehRemessa ? chaveRemessa(eventId) : chaveRetorno(eventId);
      const res = await criarLancamentoUnico({
        bancoStore,
        cashflowStore,
        bankId: banco.id,
        eventKey,
        owner: userEmail,
        lancamento: ehRemessa
          ? {
              type: TIPOS.ENTRADA,
              category: 'remessa_banco',
              amount: total,
              date: data,
              description: `Remessa de ${cheques.length} cheque(s) ao banco ${banco.name} — aguardando compensação. ${obs}`.trim(),
              method: 'cheque',
            }
          : {
              type: TIPOS.SAIDA,
              category: 'cheque_devolvido',
              amount: total,
              date: data,
              description: `Devolução de ${cheques.length} cheque(s) pelo banco ${banco.name} → ${destino} (sem impacto no saldo). ${obs}`.trim(),
              method: 'cheque',
            },
      });

      return ok({ status: res.status, cashflow_id: res.cashflow_id || null, event_key: eventKey });
    }

    // ── 6. AJUSTE DE SALDO (M6.3 — ato administrativo) ─────────────────────
    if (operacao === 'ajuste_saldo') {
      const bancoId = texto(body.bankId, 60);
      const eventId = texto(body.eventId, 120);
      const tipo = texto(body.tipo, 10);
      const valor = Number(body.valor);
      const motivo = texto(body.motivo, 300);
      const data = texto(body.data, 10);

      if (!bancoId) return falha('Conta é obrigatória.');
      if (!idDeEventoValido(eventId)) return falha('Identificador do evento inválido.');

      const erro = validarAjuste({ tipo, valor, motivo, data });
      if (erro) return falha(erro);

      const banco = await servico.entities.Banco.get(bancoId).catch(() => null);
      if (!banco) return falha('Conta não encontrada.', 404);

      // Mesmo mecanismo dos demais eventos de saldo: incremento atômico com a
      // chave gravada na MESMA escrita. A chave é a identidade do AJUSTE, então
      // repetir a requisição devolve 409 e não soma de novo.
      const eventKey = chaveAjusteSaldo(eventId);
      const res = await registrarMovimento({
        bancoStore,
        cashflowStore,
        bankId: banco.id,
        delta: tipo === TIPOS.ENTRADA ? valor : -valor,
        eventKey,
        lancamento: {
          type: tipo,
          category: 'ajuste_saldo',
          amount: valor,
          date: data,
          description: `[Ajuste de Saldo] ${banco.name} — ${motivo} (por ${userEmail})`,
          method: 'outro',
          bank_id: banco.id,
        },
      });

      if (res.status === 'ja_aplicado') {
        return falha('Este ajuste já foi aplicado nesta conta.', 409);
      }

      return ok({ status: res.status, cashflow_id: res.cashflow_id || null, event_key: eventKey });
    }

    // ── 7. EXCLUSÃO DE CONTA SEM HISTÓRICO (M6.3 — administrativo) ─────────
    if (operacao === 'excluir_conta') {
      const bancoId = texto(body.bankId, 60);
      if (!bancoId) return falha('Conta é obrigatória.');

      const banco = await servico.entities.Banco.get(bancoId).catch(() => null);
      if (!banco) return falha('Conta não encontrada.', 404);

      // Histórico é conferido NO SERVIDOR: apagar a conta levaria junto a prova
      // dos eventos e deixaria lançamentos órfãos no extrato.
      const [lancamentos, cheques, transferencias] = await Promise.all([
        servico.entities.CashFlow.filter({ bank_id: banco.id }).catch(() => []),
        servico.entities.Cheque.filter({ deposited_bank_id: banco.id }).catch(() => []),
        servico.entities.TransferenciaBancaria
          .filter({ $or: [{ from_bank_id: banco.id }, { to_bank_id: banco.id }] })
          .catch(() => []),
      ]);

      const lista = (r) => (Array.isArray(r) ? r : (r && r.items) || []);
      const veredito = avaliarExclusaoConta({
        banco,
        lancamentos: lista(lancamentos),
        cheques: lista(cheques),
        transferencias: lista(transferencias),
      });

      if (!veredito.permitido) return falha(veredito.motivo, 409);

      await servico.entities.Banco.delete(banco.id);
      return ok({ conta_id: banco.id, excluida: true });
    }

    // ── 8. INSPEÇÃO (somente leitura) ──────────────────────────────────────
    if (operacao === 'inspecionar') {
      const bancoId = texto(body.bankId, 60);
      const eventKey = texto(body.eventKey, 140);
      if (!bancoId || !eventKey) return falha('Conta e chave do evento são obrigatórias.');

      const diag = await diagnosticarMovimento({ bancoStore, cashflowStore, bankId: bancoId, eventKey });
      return ok({ diagnostico: diag, event_key: eventKey });
    }

    return falha('Operação bancária desconhecida.', 403);
  } catch (error) {
    return falha(error && error.message ? error.message : 'Falha ao registrar o evento bancário.', 500);
  }
}