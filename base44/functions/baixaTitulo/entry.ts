/**
 * M6 — BAIXA INDIVIDUAL DE TÍTULO PELA CENTRAL DE CONTAS A RECEBER.
 *
 * ── QUAL MECANISMO ESTA FUNÇÃO USA ─────────────────────────────────────────
 * Nenhum mecanismo novo. A liquidação continua sendo a COMPENSAÇÃO DE CHEQUE
 * (`shared/chequeEventFlow.compensarCheque`), a mesma que a tela de Cheques
 * dispara e a única que a Central reconhece como recebimento comprovado
 * (crédito na conta + lançamento de caixa + alocação cheque→parcela).
 *
 * Esta função existe para ACRESCENTAR a validação que a Central precisa antes
 * de chegar àquele núcleo — validação que a tela de Cheques não faz porque lá
 * o título é o próprio objeto da ação, não um item de uma carteira:
 *   · o título está em condição de baixa (pendente, com valor, com operação)?
 *   · a obrigação da operação ainda tem saldo para receber este título?
 *   · a data e a conta de destino são utilizáveis?
 *
 * ── ORDEM OBRIGATÓRIA ──────────────────────────────────────────────────────
 *   identidade (token) → autorização (papel + página da central) → validação de
 *   entrada → leitura das entidades pelo SERVIDOR → elegibilidade → núcleo de
 *   compensação → leitura do resultado.
 * Nenhum campo de papel, conta, valor ou saldo vem do corpo: o corpo escolhe
 * apenas QUAL título, QUAL conta e QUAL data.
 *
 * ── CONCORRÊNCIA E IDEMPOTÊNCIA ────────────────────────────────────────────
 * Ambas são do núcleo: o compare-and-swap no status do título decide o único
 * vencedor, e a chave do evento (`compensation_token`) impede que o mesmo
 * recebimento entre duas vezes. Quem perde a corrida recebe 409 com a
 * orientação de recarregar — nunca um segundo crédito.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';

import { autorizarMovimentacaoBancaria, ACOES_BANCARIAS } from '../../shared/bankAuthorization.js';
import { avaliarBaixaTitulo } from '../../shared/baixaTitulo.js';
import { compensarCheque, MOTIVOS } from '../../shared/chequeEventFlow.js';
import { criarIoChequeEvento } from '../../shared/chequeEventIo.js';

const ID_REGEX = /^[a-f0-9]{24}$/i;
const DATA_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const falha = (erro: string, status = 400, extra: Record<string, unknown> = {}) =>
  Response.json({ ok: false, erro, ...extra }, { status });

const numero = (valor: unknown): number => {
  const n = Number(valor);
  return Number.isFinite(n) ? n : 0;
};

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  // 1. Identidade vem SEMPRE do token da plataforma.
  const usuario = await base44.auth.me().catch(() => null);
  if (!usuario || !usuario.email) return falha('Não autenticado.', 401);

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) || {};
  } catch (_) {
    body = {};
  }

  // 2. Autorização antes de qualquer leitura privilegiada ou escrita.
  const decisao = autorizarMovimentacaoBancaria(usuario, ACOES_BANCARIAS.BAIXAR_TITULO);
  if (!decisao.autorizado) {
    return falha(decisao.motivo || 'Não autorizado.', 403, { papel: decisao.papel });
  }

  const tituloId = String(body.tituloId || '');
  const bankId = String(body.bankId || '');
  const data = String(body.data || '').slice(0, 10);

  // 3. Formato validado antes de consultar: a plataforma recusa ids fora do
  //    padrão com erro interno, o que esconderia um erro de entrada.
  if (!ID_REGEX.test(tituloId)) return falha('Título inválido.', 400);
  if (!ID_REGEX.test(bankId)) return falha('Conta de destino inválida.', 400);
  if (!DATA_REGEX.test(data)) return falha('Data do recebimento inválida.', 400);

  // 4. Leitura pelo SERVIDOR — o navegador não informa valor, saldo nem dono.
  const servico = base44.asServiceRole;
  const cheque = await servico.entities.Cheque.get(tituloId).catch(() => null);
  if (!cheque) return falha('Título não encontrado.', 404);

  const operacao = cheque.operation_id
    ? await servico.entities.Operation.get(cheque.operation_id).catch(() => null)
    : null;
  const banco = await servico.entities.Banco.get(bankId).catch(() => null);

  // 5. Elegibilidade (a validação que a Central acrescenta ao núcleo).
  const avaliacao = avaliarBaixaTitulo({ cheque, operacao, banco, data });
  if (!avaliacao.elegivel) {
    return falha(avaliacao.mensagem, avaliacao.http || 409, {
      codigo: avaliacao.codigo,
      saldo_aberto: avaliacao.saldo_operacao,
    });
  }

  // 6. Núcleo financeiro ÚNICO — o mesmo da tela de Cheques.
  const { io } = criarIoChequeEvento(servico);
  const resultado = await compensarCheque({
    cheque,
    bankId,
    bankName: banco.name,
    data,
    io,
  });

  if (resultado.status !== 'aplicado') {
    const motivo = resultado.motivo || '';
    const mensagem =
      motivo === MOTIVOS.ESTADO_JA_ALTERADO
        ? 'Este título já foi liquidado por outra execução. Recarregue a central.'
        : 'A baixa não foi aplicada. Nenhum valor foi movimentado.';
    return falha(mensagem, 409, { motivo });
  }

  // 7. Resultado lido do banco de dados, não do que o navegador enviou.
  const tituloDepois = await servico.entities.Cheque.get(tituloId).catch(() => null);
  const operacaoDepois = cheque.operation_id
    ? await servico.entities.Operation.get(cheque.operation_id).catch(() => null)
    : null;
  const contaDepois = await servico.entities.Banco.get(bankId).catch(() => null);

  return Response.json({
    ok: true,
    titulo: {
      id: tituloId,
      status: (tituloDepois && tituloDepois.status) || '',
      compensated_at: (tituloDepois && tituloDepois.compensated_at) || '',
      conta_nome: banco.name,
    },
    operacao: operacaoDepois
      ? {
          id: operacaoDepois.id,
          numero: operacaoDepois.numero_operacao ?? null,
          status: operacaoDepois.status || '',
          saldo_aberto: Math.max(
            0,
            numero(operacaoDepois.total_receivable) - numero(operacaoDepois.amount_paid),
          ),
        }
      : null,
    saldo_conta: contaDepois ? numero(contaDepois.current_balance) : null,
    evento: resultado.event_key || '',
  });
});