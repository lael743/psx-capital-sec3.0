/**
 * D4.1 — MOVIMENTAÇÕES BANCÁRIAS AUTORIZADAS NO SERVIDOR.
 *
 * Antes desta função, transferir era uma chamada do navegador direto às
 * entidades: a proteção inteira era a interface. Aqui a identidade vem do
 * token, o papel é conferido no servidor e só então o motor roda — com
 * privilégio de serviço, depois da checagem.
 *
 * ── O QUE O NAVEGADOR PODE ESCOLHER ────────────────────────────────────────
 *
 * Apenas: qual ação, qual conta de origem, qual de destino, valor, data e
 * descrição. Nada mais. Identidade, papel, permissões, saldo, nomes das contas
 * e o proprietário da reivindicação NÃO vêm do corpo — nomes são lidos do
 * banco de dados e o proprietário é o e-mail do token.
 *
 * ── O QUE NÃO MUDOU ────────────────────────────────────────────────────────
 *
 * A regra financeira é a MESMA: o motor (`shared/transferEngine.js`, cópia
 * fiel do de src/lib) continua aplicando chave de evento determinística,
 * compare-and-swap na reivindicação e recuperação sem reaplicar saldo. Esta
 * função não reimplementa nada disso — só decide quem pode chamar.
 *
 * ── IDEMPOTÊNCIA ───────────────────────────────────────────────────────────
 *
 * O `transferId` continua vindo do cliente de propósito: é o que faz repetir o
 * pedido cair no mesmo balde. Dois envios concorrentes com o mesmo id não
 * duplicam perna, saldo nem lançamento (mesmo CAS de sempre).
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import { criarMotor } from '../../shared/transferEngine.js';
import { autorizarMovimentacaoBancaria, ACOES_BANCARIAS } from '../../shared/bankAuthorization.js';

const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;
const ID_VALIDO = /^[A-Za-z0-9_:.-]{1,120}$/;

function falha(motivo, status) {
  return Response.json({ ok: false, erro: motivo }, { status: status || 400 });
}

function texto(valor, limite) {
  return typeof valor === 'string' ? valor.trim().slice(0, limite) : '';
}

function hoje() {
  return new Date().toISOString().slice(0, 10);
}

export default async function (req) {
  try {
    // 1. Identidade pelo mecanismo da plataforma — nunca pelo corpo.
    const base44 = createClientFromRequest(req);
    const usuario = await base44.auth.me().catch(() => null);
    if (!usuario) return falha('Não autenticado.', 401);

    let body = {};
    try { body = await req.json(); } catch (_) { body = {}; }
    body = body || {};

    // 2. Autorização no servidor, antes de qualquer leitura ou escrita.
    const acao = texto(body.acao, 40);
    const decisao = autorizarMovimentacaoBancaria(usuario, acao);
    if (!decisao.autorizado) return falha(decisao.motivo, 403);

    // 3. Elevação SÓ depois da checagem: a escrita é cross-user (saldo de
    //    contas da empresa), então precisa de privilégio de serviço.
    const servico = base44.asServiceRole.entities;

    const motor = criarMotor({
      bancoStore: {
        updateWhere: (query, update) => servico.Banco.updateMany(query, update),
        get: (id) => servico.Banco.get(id),
      },
      diarioStore: {
        filter: (query) => servico.TransferenciaBancaria.filter(query),
        create: (data) => servico.TransferenciaBancaria.create(data),
        updateWhere: (query, update) => servico.TransferenciaBancaria.updateMany(query, update),
      },
      cashflowStore: {
        filter: (query) => servico.CashFlow.filter(query),
        create: (data) => servico.CashFlow.create(data),
      },
    });

    // Proprietário de reivindicação e `requested_by` saem do TOKEN.
    const userEmail = usuario.email;

    // ── Inspeção (somente leitura) ───────────────────────────────────────────
    if (acao === ACOES_BANCARIAS.INSPECIONAR) {
      const transferId = texto(body.transferId, 120);
      if (!ID_VALIDO.test(transferId)) return falha('Identificador de transferência inválido.');
      const r = await motor.inspecionarTransferencia({ transferId });
      return Response.json({ ok: true, ...r });
    }

    // ── Transferência ────────────────────────────────────────────────────────
    if (acao === ACOES_BANCARIAS.TRANSFERIR) {
      const transferId = texto(body.transferId, 120);
      if (transferId && !ID_VALIDO.test(transferId)) return falha('Identificador de transferência inválido.');

      const fromBankId = texto(body.fromBankId, 60);
      const toBankId = texto(body.toBankId, 60);
      if (!fromBankId || !toBankId) return falha('Conta de origem e destino são obrigatórias.');
      if (fromBankId === toBankId) return falha('Origem e destino devem ser contas diferentes.');

      const valor = Number(body.amount);
      if (!Number.isFinite(valor) || valor <= 0) return falha('O valor deve ser positivo.');

      const data = texto(body.data, 10) || hoje();
      if (!DATA_ISO.test(data)) return falha('Data inválida.');

      // As contas são LIDAS do banco: o navegador não fornece nome nem existência.
      const [fromBank, toBank] = await Promise.all([
        servico.Banco.get(fromBankId),
        servico.Banco.get(toBankId),
      ]);
      if (!fromBank || !toBank) return falha('Conta não encontrada.', 404);

      const r = await motor.executarTransferencia({
        transferId: transferId || undefined,
        fromBank,
        toBank,
        amount: valor,
        date: data,
        description: texto(body.descricao, 500),
        userEmail,
      });
      return Response.json({ ok: true, ...r });
    }

    // ── Estorno ──────────────────────────────────────────────────────────────
    if (acao === ACOES_BANCARIAS.ESTORNAR) {
      const transferId = texto(body.transferId, 120);
      if (!ID_VALIDO.test(transferId)) return falha('Identificador de transferência inválido.');

      const data = texto(body.data, 10) || hoje();
      if (!DATA_ISO.test(data)) return falha('Data inválida.');

      const r = await motor.estornarTransferencia({
        transferId,
        date: data,
        description: texto(body.descricao, 500),
        userEmail,
      });
      return Response.json({ ok: true, ...r });
    }

    // ── Recuperação de transferência parcial (reaplica só o que falta) ───────
    if (acao === ACOES_BANCARIAS.RECUPERAR) {
      const transferId = texto(body.transferId, 120);
      if (!ID_VALIDO.test(transferId)) return falha('Identificador de transferência inválido.');

      const data = texto(body.data, 10);
      if (data && !DATA_ISO.test(data)) return falha('Data inválida.');

      const r = await motor.recuperarTransferencia({ transferId, date: data || undefined, userEmail });
      return Response.json({ ok: true, ...r });
    }

    // ── Liberação de reivindicação órfã (nunca toca em saldo) ────────────────
    if (acao === ACOES_BANCARIAS.LIBERAR_REIVINDICACAO) {
      const transferId = texto(body.transferId, 120);
      if (!ID_VALIDO.test(transferId)) return falha('Identificador de transferência inválido.');

      const r = await motor.recuperarLancamentosOrfaos({
        transferId,
        confirmar: body.confirmar === true,
        forcar: body.forcar === true,
        userEmail,
      });
      return Response.json({ ok: true, ...r });
    }

    return falha('Ação bancária desconhecida.', 400);
  } catch (error) {
    return falha(error && error.message ? error.message : 'Falha ao processar a movimentação.', 400);
  }
}