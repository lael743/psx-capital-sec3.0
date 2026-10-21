/**
 * M6 — BAIXA INDIVIDUAL DE TÍTULO PELA CENTRAL DE CONTAS A RECEBER.
 *
 * ── POR QUE ESTE MÓDULO EXISTE ─────────────────────────────────────────────
 * A Central de Contas a Receber é uma LEITURA consolidada: ela mostra o título,
 * a situação e a evidência, mas não tinha como liquidar um título. Este módulo
 * é a única coisa nova da baixa — e ele NÃO movimenta dinheiro.
 *
 * O efeito financeiro continua sendo o de sempre: a compensação de cheque
 * (`chequeEventFlow.compensarCheque`), que já tem controle de concorrência
 * (compare-and-swap no status do título), chave de idempotência
 * (`compensation_token`), crédito na conta guardado por chave de evento,
 * lançamento de caixa identificado e alocação um-a-um cheque→parcela no
 * cronograma da operação. Nada disso é reimplementado aqui.
 *
 * O que este módulo acrescenta é a VALIDAÇÃO que a Central precisa antes de
 * chamar aquele núcleo: o título está em condição de baixa? A obrigação da
 * operação ainda tem saldo suficiente para receber este título? A data e a
 * conta de destino são utilizáveis?
 *
 * ── O QUE ELE NÃO FAZ ──────────────────────────────────────────────────────
 *  · Não escreve em entidade nenhuma.
 *  · Não calcula juros, mora, taxa ou lucro.
 *  · Não aceita baixa parcial: o núcleo compensa o valor de face do título.
 *    Enquanto o modelo financeiro não tiver alocação parcial confiável, a
 *    baixa é sempre pelo valor integral — ver limitação registrada em
 *    docs/PSX_M6.4_BAIXA_TITULO.md.
 *  · Não inventa saldo: `saldoDaOperacao` repete a regra única
 *    (`chequeCore.computeBalanceDue` = max(0, total − recebido)) apenas como
 *    GUARDA de entrada. Quem grava o saldo continua sendo o núcleo financeiro.
 *
 * ⚠️ DUAS CÓPIAS IDÊNTICAS (sem imports, para serem byte a byte iguais):
 *      base44/shared/baixaTitulo.js  (função de servidor `baixaTitulo`)
 *      src/lib/baixaTitulo.js        (testes e navegador)
 *    O teste M6.4.0 falha se divergirem.
 */

/** Tolerância monetária (meio centavo). */
export const TOLERANCIA = 0.01;

/** Códigos de recusa. São estáveis: a tela e os testes dependem deles. */
export const MOTIVOS_BAIXA = Object.freeze({
  TITULO_INEXISTENTE: 'titulo_inexistente',
  TITULO_NAO_PENDENTE: 'titulo_nao_pendente',
  TITULO_SEM_VALOR: 'titulo_sem_valor',
  TITULO_SEM_OPERACAO: 'titulo_sem_operacao',
  OPERACAO_INEXISTENTE: 'operacao_inexistente',
  SEM_SALDO: 'sem_saldo',
  VALOR_ACIMA_DO_SALDO: 'valor_acima_do_saldo',
  DATA_INVALIDA: 'data_invalida',
  CONTA_INVALIDA: 'conta_invalida',
});

const FORMATO_DATA = /^\d{4}-\d{2}-\d{2}$/;

export function round2(valor) {
  return Math.round((Number(valor) || 0) * 100) / 100;
}

/** Saldo em aberto da obrigação — mesma regra do núcleo, usada só como guarda. */
export function saldoDaOperacao(operacao) {
  const total = Number(operacao && operacao.total_receivable) || 0;
  const recebido = Number(operacao && operacao.amount_paid) || 0;
  return round2(Math.max(0, total - recebido));
}

/** Mensagem legível para o estado do título que impede a baixa. */
function mensagemDeEstado(status) {
  if (status === 'compensado') return 'Título já liquidado — o recebimento já foi registrado.';
  if (status === 'cancelado') return 'Título cancelado não pode ser baixado.';
  if (status === 'devolvido') {
    return 'Título devolvido é tratado no fluxo de devolução (resolução), não por baixa.';
  }
  if (status.indexOf('resolvido_') === 0) return 'Título já resolvido — não há o que baixar.';
  return `Título no estado "${status || 'desconhecido'}" não pode ser baixado.`;
}

/**
 * Decide se o título pode ser baixado AGORA, com os dados lidos pelo servidor.
 *
 * Nenhum campo de identidade, papel ou saldo vem daqui: o resultado é apenas
 * uma decisão de elegibilidade sobre o que o servidor leu.
 *
 * @returns {{elegivel:boolean, codigo:string|null, mensagem:string, http:number,
 *            valor:number, saldo_operacao:number|null}}
 */
export function avaliarBaixaTitulo({ cheque, operacao, banco, data } = {}) {
  const recusa = (codigo, mensagem, http, extra = {}) => ({
    elegivel: false,
    codigo,
    mensagem,
    http,
    valor: 0,
    saldo_operacao: null,
    ...extra,
  });

  if (!cheque || !cheque.id) {
    return recusa(MOTIVOS_BAIXA.TITULO_INEXISTENTE, 'Título não encontrado.', 404);
  }

  const status = String(cheque.status || '').toLowerCase();
  if (status !== 'pendente') {
    return recusa(MOTIVOS_BAIXA.TITULO_NAO_PENDENTE, mensagemDeEstado(status), 409);
  }

  const valor = round2(cheque.value);
  const semValor = recusa(
    MOTIVOS_BAIXA.TITULO_SEM_VALOR,
    'Título sem valor de face não pode ser baixado.',
    400,
  );
  if (!(valor > 0)) return semValor;

  if (!FORMATO_DATA.test(String(data || '').slice(0, 10))) {
    return recusa(MOTIVOS_BAIXA.DATA_INVALIDA, 'Data do recebimento inválida.', 400);
  }

  if (!banco || !banco.id || banco.active === false) {
    return recusa(
      MOTIVOS_BAIXA.CONTA_INVALIDA,
      'Conta de destino inexistente ou arquivada — escolha uma conta ativa.',
      400,
    );
  }

  if (!cheque.operation_id) {
    return recusa(
      MOTIVOS_BAIXA.TITULO_SEM_OPERACAO,
      'Título sem operação vinculada: a baixa precisa manter o vínculo com a obrigação.',
      409,
    );
  }

  if (!operacao || !operacao.id) {
    return recusa(MOTIVOS_BAIXA.OPERACAO_INEXISTENTE, 'Operação do título não encontrada.', 404);
  }

  const saldo = saldoDaOperacao(operacao);
  if (String(operacao.status || '').toLowerCase() === 'quitado' || saldo <= TOLERANCIA) {
    return recusa(
      MOTIVOS_BAIXA.SEM_SALDO,
      'A operação não tem saldo em aberto — a baixa deste título receberia valor além da obrigação.',
      409,
      { saldo_operacao: saldo },
    );
  }

  if (valor > saldo + TOLERANCIA) {
    return recusa(
      MOTIVOS_BAIXA.VALOR_ACIMA_DO_SALDO,
      `O valor do título (${valor.toFixed(2)}) é maior que o saldo em aberto da operação (${saldo.toFixed(2)}).`,
      409,
      { saldo_operacao: saldo },
    );
  }

  return {
    elegivel: true,
    codigo: null,
    mensagem: '',
    http: 200,
    valor,
    saldo_operacao: saldo,
  };
}