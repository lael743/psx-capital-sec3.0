/**
 * M7 — REPASSE AO CEDENTE (autoridade única de execução).
 *
 * ── ORDEM OBRIGATÓRIA ──────────────────────────────────────────────────────
 *   identidade (token) → autorização e pré-requisitos pela regra do workflow
 *   (`avaliarRepasse`) → idempotência (repasse já registrado?) → segunda
 *   autorização (token do assessor) → dados validados no servidor → efeitos no
 *   núcleo `disbursement.js` → auditoria → resposta.
 *
 * Nada de valor, conta, data ou permissão vem do corpo: o corpo escolhe apenas
 * a conta de origem, a data, a referência/comprovante e o token do assessor. O
 * VALOR é lido da operação (`net_value`), como sempre foi.
 *
 * ── O QUE ESTA FUNÇÃO GARANTE ──────────────────────────────────────────────
 *
 * 1. SÓ NA ETAPA "pagamento", com contrato assinado quando a modalidade exige.
 *    Antes desta correção a função aceitava execução em qualquer etapa e não
 *    consultava a regra do workflow — o botão de repasse não existia na tela e
 *    "pagamento" não tinha saída.
 *
 * 2. NENHUM REPASSE DUPLICADO, nem em tentativas simultâneas: o saldo é
 *    debitado por `applyBankDelta` com chave de evento determinística, e a
 *    prova na operação é gravada por compare-and-swap. Repetir devolve
 *    `duplicate: true` sem novo efeito.
 *
 * 3. A OPERAÇÃO NÃO FINALIZA POR AQUI. Esta função registra o repasse e grava
 *    `payment_executed`; a passagem "pagamento" → "finalizada" continua sendo
 *    uma transição do workflow, decidida por `avaliarTransicao` no servidor.
 *    Ninguém finaliza a operação trocando `status`.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

import { avaliarRepasse } from '../../shared/operationWorkflow.js';
import { registrarRepasse, valorDoRepasse, numeroCurto } from '../../shared/disbursement.js';

const falha = (erro, status = 400, extra = {}) => Response.json({ ok: false, erro, ...extra }, { status });
const hojeISO = () => new Date().toISOString().split('T')[0];

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);

    // 1. Identidade SEMPRE do token da plataforma.
    const usuario = await base44.auth.me().catch(() => null);
    if (!usuario || !usuario.email) return falha('Não autenticado.', 401);

    let body = {};
    try { body = (await req.json()) || {}; } catch (_) { body = {}; }

    const operacaoId = String(body.operation_id || body.operacaoId || '');
    const bancoId = String(body.disbursement_bank_id || '');
    const referencia = String(body.referencia || body.disbursement_reference || '').trim();
    const comprovanteUrl = String(body.comprovante_url || body.disbursement_proof_url || '').trim();
    const forma = String(body.forma || '');
    const dataInformada = String(body.data || '').trim();
    const assessorToken = String(body.assessor_token || '').trim();

    if (!operacaoId) return falha('operation_id é obrigatório.', 400);
    if (!bancoId) return falha('Conta de origem do repasse é obrigatória.', 400);

    const servico = base44.asServiceRole;
    const operacao = await servico.entities.Operation.get(operacaoId).catch(() => null);
    if (!operacao) return falha('Operação não encontrada.', 404);

    // 2. Autorização e pré-requisitos: MESMA regra que a tela consulta.
    const decisao = avaliarRepasse({ operacao, usuario });
    if (!decisao.permitida) {
      return falha(decisao.motivo || 'Repasse não permitido.', decisao.status || 409, {
        etapa: decisao.etapaAtual,
        bloqueios: decisao.bloqueios || [],
      });
    }

    // 3. Já registrado: resposta idempotente, sem nenhum efeito novo.
    if (operacao.payment_executed === true) {
      return Response.json({
        ok: true,
        duplicate: true,
        ja_registrado: true,
        valor: valorDoRepasse(operacao),
        data: operacao.payment_execution_date || null,
        conta: operacao.disbursement_bank_name || null,
        referencia: operacao.disbursement_reference || null,
        mensagem: 'O repasse desta operação já estava registrado; nada foi executado de novo.',
      });
    }

    // 4. Segunda autorização (duplo controle): token do assessor — regra já existente.
    if (!assessorToken) {
      return falha('Token de segurança do assessor é obrigatório para executar o repasse.', 403);
    }
    const assessores = await servico.entities.Assessor.filter({ active: true });
    const assessor = (assessores || []).find((a) => a.token === assessorToken);
    if (!assessor || assessor.active === false) {
      await servico.entities.AuditLog.create({
        user_email: usuario.email,
        user_name: usuario.full_name || usuario.email,
        action: 'auth_failure',
        entity: 'Operation',
        entity_id: operacaoId,
        description: `Tentativa de repasse com token inválido por ${usuario.email} — Op. ${numeroCurto(operacao)}`,
      });
      return falha('Token de segurança inválido. Acesso negado.', 403);
    }

    // 5. Dados do repasse validados no servidor.
    const banco = await servico.entities.Banco.get(bancoId).catch(() => null);
    if (!banco) return falha('Conta de origem do repasse não encontrada.', 404);

    const valor = valorDoRepasse(operacao);
    if (!(valor > 0)) return falha('Operação sem valor líquido para repasse.', 409);

    const data = dataInformada || hojeISO();
    if (Number.isNaN(Date.parse(data))) return falha('Data do repasse inválida.', 400);
    if (data > hojeISO()) return falha('A data do repasse não pode ser futura.', 400);
    if (referencia.length < 3 && !/^https?:\/\//i.test(comprovanteUrl)) {
      return falha('Informe a referência da transferência ou o comprovante do repasse.', 400);
    }

    // 6. Efeitos: saldo + lançamento no extrato + prova na operação.
    const resultado = await registrarRepasse({
      bancoStore: servico.entities.Banco,
      cashflowStore: servico.entities.CashFlow,
      operacaoStore: servico.entities.Operation,
      operacao,
      bancoId,
      bancoNome: banco.name || String(body.disbursement_bank_name || ''),
      data,
      referencia,
      comprovanteUrl,
      forma: forma || operacao.disbursement_method || '',
      autorizadoPor: assessor.name || '',
      dono: usuario.email,
    });

    if (resultado.status === 'sem_conta' || resultado.status === 'sem_efeito') {
      return falha(resultado.erro || 'Repasse não aplicado.', 409);
    }

    // 7. Auditoria: uma por efeito novo (a repetição pura não gera registro).
    if (resultado.status === 'aplicado' || resultado.operacao_atualizada) {
      await servico.entities.AuditLog.create({
        user_email: usuario.email,
        user_name: usuario.full_name || usuario.email,
        action: resultado.status === 'aplicado' ? 'execute_disbursement' : 'recuperar_disbursement',
        entity: 'Operation',
        entity_id: operacaoId,
        description: `Repasse de R$ ${valor.toFixed(2)} para ${operacao.client_name || 'cedente'} via ${banco.name} — Op. ${numeroCurto(operacao)} — Ref: ${referencia || comprovanteUrl} — Autorizado por assessor: ${assessor.name}`,
        after: {
          valor,
          data,
          conta_id: bancoId,
          conta: banco.name || null,
          referencia: referencia || null,
          comprovante_url: comprovanteUrl || null,
          assessor: assessor.name || null,
          assessor_email: assessor.user_email || null,
          lancamento_id: resultado.lancamento_id,
          evento: resultado.evento,
        },
      });
    }

    const bancoAtual = await servico.entities.Banco.get(bancoId).catch(() => null);

    return Response.json({
      ok: true,
      success: true,
      duplicate: resultado.status === 'ja_aplicado',
      valor,
      data,
      conta_id: bancoId,
      conta: banco.name || null,
      referencia: referencia || null,
      comprovante_url: comprovanteUrl || null,
      lancamento_id: resultado.lancamento_id,
      lancamento_pendente: resultado.lancamento_pendente === true,
      new_bank_balance: bancoAtual ? bancoAtual.current_balance ?? null : null,
      authorized_by: assessor.name || null,
    });
  } catch (error) {
    return Response.json({ ok: false, erro: error.message }, { status: 500 });
  }
}