/**
 * D4.1 — POLÍTICA DE AUTORIZAÇÃO DE MOVIMENTAÇÃO BANCÁRIA.
 *
 * Módulo PURO: recebe o usuário resolvido pelo token da plataforma e a ação
 * pedida, e devolve a decisão. Não lê corpo de requisição, não lê banco, não
 * tem efeito.
 *
 * ── POR QUE ASSIM ──────────────────────────────────────────────────────────
 *
 * Até a D3.2 a única barreira era a interface: a página escondia o botão e o
 * `allowed_pages` era checado no navegador. Qualquer usuário autenticado podia
 * chamar o SDK direto e movimentar saldo. Esta função é a decisão que o
 * servidor toma sozinho — nunca a que o navegador alega.
 *
 * A identidade e o papel vêm SEMPRE do token (`base44.auth.me()`), nunca do
 * corpo. Um corpo pedindo `role: 'admin'` não tem como influenciar isto: os
 * campos examinados (`role`, `allowed_pages`) são lidos do objeto do usuário
 * autenticado, e o chamador só escolhe `acao`.
 *
 * ── COMPATIBILIDADE ────────────────────────────────────────────────────────
 *
 * A política NÃO bloqueia ninguém que hoje consiga operar pela tela:
 *   · `admin` — mantém acesso total (era assim no frontend).
 *   · `user` com a página `bancos` liberada — continua podendo transferir.
 *     Antes, essa permissão só escondia menus; agora é verificada no servidor.
 *   · `user` sem a página — antes alcançava o SDK por fora da tela; agora é
 *     recusado. Este é o ganho real e não tira nada de quem era legítimo.
 *
 * Estorno, recuperação e liberação de reivindicação exigem administrador. Isso
 * não bloqueia ninguém hoje: nenhuma tela expõe essas três ações — elas
 * existiam apenas como exportação de código, sem botão.
 *
 * M6.3 — AJUSTAR_SALDO e EXCLUIR_CONTA também são administrativas. Antes, o
 * saldo era sobrescrito pelo formulário de cadastro e a conta era apagada pelo
 * navegador, por qualquer usuário com a página liberada. Corrigir o saldo
 * oficial e apagar uma conta passam a exigir administrador, decidido aqui.
 *
 * M3 — recebimento manual e baixa manual entraram como ações OPERACIONAIS: as
 * duas telas que as disparam (Operações, Cedentes e Cobrança) continuam
 * podendo registrar recebimento. O que muda é que agora a autorização é
 * verificada no servidor, e não mais apenas escondida na tela.
 *
 * ── CÓPIA DUPLICADA ────────────────────────────────────────────────────────
 *
 * Este módulo existe em dois arquivos: `src/lib/bankAuthorization.js` (testes
 * e navegador) e `base44/shared/bankAuthorization.js` (função de servidor). A
 * duplicação é obrigatória — o navegador não pode importar `base44/`, e a
 * função de servidor não pode importar `src/`. Os dois são BYTE A BYTE iguais;
 * o teste D4.1.14 falha se divergirem. Mudar a regra em um só lado é mudar a
 * autorização real de um dos lados.
 */

export const ACOES_BANCARIAS = Object.freeze({
  TRANSFERIR: 'transferir',
  ESTORNAR: 'estornar',
  RECUPERAR: 'recuperar',
  INSPECIONAR: 'inspecionar',
  LIBERAR_REIVINDICACAO: 'liberar_reivindicacao',
  // D4.2 — eventos de caixa migrados para o servidor.
  LANCAR: 'lancar',
  REMESSA: 'remessa',
  // M6.3 — correção de saldo e exclusão de conta: atos administrativos.
  AJUSTAR_SALDO: 'ajustar_saldo',
  EXCLUIR_CONTA: 'excluir_conta',
  // M1 — compensação e estorno de cheque migrados para o servidor.
  COMPENSAR_CHEQUE: 'compensar_cheque',
  ESTORNAR_CHEQUE: 'estornar_cheque',
  INSPECIONAR_CHEQUE: 'inspecionar_cheque',
  RECUPERAR_CHEQUE: 'recuperar_lancamento_cheque',
  // M2 — resolução de cheque devolvido e recebimento da taxa.
  RESOLVER_CHEQUE: 'resolver_cheque',
  RECEBER_TAXA_CHEQUE: 'receber_taxa_cheque',
  // M2 — devolução física do cheque: caminho padrão e exceção administrativa.
  DEVOLVER_CHEQUE: 'devolver_cheque',
  DEVOLVER_CHEQUE_EXCECAO: 'devolver_cheque_excecao',
  // M2 — estorno do RECEBIMENTO de uma resolução: devolve dinheiro, é reversão.
  ESTORNAR_RESOLUCAO: 'estornar_resolucao_cheque',
  // M2.1 — recuperação da taxa: pode somar valor à obrigação, é administrativa.
  RECUPERAR_TAXA_CHEQUE: 'recuperar_taxa_cheque',
  // M3 — recebimento que entra no agregado da operação. Antes era escrito
  // direto pelo navegador, sem identidade de evento e sem autorização.
  RECEBER_PAGAMENTO: 'receber_pagamento',
  REGISTRAR_BAIXA: 'registrar_baixa',
  // M6 — baixa individual de título pela Central de Contas a Receber. Ação
  // própria porque a tela é própria: exige a página da central, não a de cheques.
  BAIXAR_TITULO: 'baixar_titulo',
});

/** Chave de página usada pelo controle de acesso existente (pageAccess.js). */
export const PAGINA_BANCOS = 'bancos';
/** M1 — tela de Cheques, que também dispara compensação e estorno. */
export const PAGINA_CHEQUES = 'cheques';
/** M3 — telas que registram recebimento de operação. */
export const PAGINA_OPERACOES = 'operacoes';
export const PAGINA_CLIENTES = 'clientes';
export const PAGINA_COBRANCA = 'cobranca';
export const PAGINAS_RECEBIMENTO = Object.freeze([PAGINA_OPERACOES, PAGINA_CLIENTES, PAGINA_COBRANCA]);
/** M6 — Central de Contas a Receber (tela /pagamentos). */
export const PAGINA_CONTAS_A_RECEBER = 'pagamentos';

/**
 * M1 — ações de cheque valem com QUALQUER uma das telas que as disparam:
 * a compensação é feita tanto na página de Cheques quanto no detalhe do banco.
 */
const PAGINAS_POR_ACAO = Object.freeze({
  [ACOES_BANCARIAS.COMPENSAR_CHEQUE]: Object.freeze([PAGINA_CHEQUES, PAGINA_BANCOS]),
  [ACOES_BANCARIAS.ESTORNAR_CHEQUE]: Object.freeze([PAGINA_CHEQUES, PAGINA_BANCOS]),
  [ACOES_BANCARIAS.INSPECIONAR_CHEQUE]: Object.freeze([PAGINA_CHEQUES, PAGINA_BANCOS]),
  // M2 — a resolução do cheque devolvido nasce na página de Cheques; o
  // recebimento da taxa pode ser registrado na tela de Cheques ou no detalhe
  // do banco (é onde a conta está aberta).
  [ACOES_BANCARIAS.RESOLVER_CHEQUE]: Object.freeze([PAGINA_CHEQUES, PAGINA_BANCOS]),
  [ACOES_BANCARIAS.RECEBER_TAXA_CHEQUE]: Object.freeze([PAGINA_CHEQUES, PAGINA_BANCOS]),
  // M2 — a devolução física padrão nasce na tela de Cheques ou no detalhe do
  // banco. A EXCEÇÃO não passa por página: é administrativa (ver ADMINISTRATIVAS).
  [ACOES_BANCARIAS.DEVOLVER_CHEQUE]: Object.freeze([PAGINA_CHEQUES, PAGINA_BANCOS]),
  // M3 — recebimento manual nasce no detalhe da operação; a baixa manual nasce
  // na conta corrente do cliente. Cobrança também exibe o saldo e registra
  // recebimento. Qualquer uma das três telas autoriza.
  [ACOES_BANCARIAS.RECEBER_PAGAMENTO]: PAGINAS_RECEBIMENTO,
  [ACOES_BANCARIAS.REGISTRAR_BAIXA]: PAGINAS_RECEBIMENTO,
  // M6 — a baixa individual de título nasce na própria Central de Contas a
  // Receber: é a página da central que a concede, nada além dela.
  [ACOES_BANCARIAS.BAIXAR_TITULO]: Object.freeze([PAGINA_CONTAS_A_RECEBER]),
});

/** Ações que um operador com a página liberada pode executar. */
const OPERACIONAIS = Object.freeze([
  ACOES_BANCARIAS.TRANSFERIR,
  ACOES_BANCARIAS.INSPECIONAR,
  ACOES_BANCARIAS.LANCAR,
  ACOES_BANCARIAS.REMESSA,
  ACOES_BANCARIAS.COMPENSAR_CHEQUE,
  ACOES_BANCARIAS.ESTORNAR_CHEQUE,
  ACOES_BANCARIAS.INSPECIONAR_CHEQUE,
  ACOES_BANCARIAS.RESOLVER_CHEQUE,
  ACOES_BANCARIAS.RECEBER_TAXA_CHEQUE,
  ACOES_BANCARIAS.DEVOLVER_CHEQUE,
  ACOES_BANCARIAS.RECEBER_PAGAMENTO,
  ACOES_BANCARIAS.REGISTRAR_BAIXA,
  ACOES_BANCARIAS.BAIXAR_TITULO,
]);

/** Ações de natureza administrativa (reversão e recuperação). */
const ADMINISTRATIVAS = Object.freeze([
  ACOES_BANCARIAS.ESTORNAR,
  ACOES_BANCARIAS.RECUPERAR,
  ACOES_BANCARIAS.LIBERAR_REIVINDICACAO,
  ACOES_BANCARIAS.RECUPERAR_CHEQUE,
  ACOES_BANCARIAS.DEVOLVER_CHEQUE_EXCECAO,
  ACOES_BANCARIAS.ESTORNAR_RESOLUCAO,
  ACOES_BANCARIAS.RECUPERAR_TAXA_CHEQUE,
  // M6.3 — corrigir o saldo oficial e excluir conta são atos administrativos:
  // não existe tela que os conceda a operador, e a decisão é do servidor.
  ACOES_BANCARIAS.AJUSTAR_SALDO,
  ACOES_BANCARIAS.EXCLUIR_CONTA,
]);

/** Ações de recebimento (M3) — mensagem própria na recusa por página. */
const RECEBIMENTOS = Object.freeze([
  ACOES_BANCARIAS.RECEBER_PAGAMENTO,
  ACOES_BANCARIAS.REGISTRAR_BAIXA,
]);

/**
 * @param {Object|null} usuario  objeto devolvido por `base44.auth.me()`
 * @param {string} acao
 * @returns {{autorizado:boolean, papel:string, motivo?:string, exige_admin?:boolean, pagina_exigida?:string}}
 */
export function autorizarMovimentacaoBancaria(usuario, acao) {
  if (!usuario || !usuario.email) {
    return { autorizado: false, papel: 'anonimo', motivo: 'Não autenticado.' };
  }

  const papel = usuario.role === 'admin'
    ? 'admin'
    : (usuario.role === 'user' ? 'user' : 'desconhecido');

  // Ação não declarada é recusada ANTES de qualquer concessão, para que o
  // administrador também não consiga executar por engano algo fora do contrato.
  if (![...OPERACIONAIS, ...ADMINISTRATIVAS].includes(acao)) {
    return { autorizado: false, papel, motivo: 'Ação bancária desconhecida.' };
  }

  if (papel === 'admin') return { autorizado: true, papel };

  if (papel === 'desconhecido') {
    return { autorizado: false, papel, motivo: 'Papel de usuário não reconhecido.' };
  }

  if (ADMINISTRATIVAS.includes(acao)) {
    return {
      autorizado: false,
      papel,
      exige_admin: true,
      motivo: 'Esta operação exige administrador.',
    };
  }

  const paginas = Array.isArray(usuario.allowed_pages) ? usuario.allowed_pages : [];
  const exigidas = PAGINAS_POR_ACAO[acao] || [PAGINA_BANCOS];
  if (!exigidas.some((pagina) => paginas.includes(pagina))) {
    if (RECEBIMENTOS.includes(acao)) {
      return {
        autorizado: false,
        papel,
        pagina_exigida: exigidas.join('|'),
        motivo: 'Nenhuma das telas de recebimento (Operações, Cedentes, Cobrança) está liberada para este usuário.',
      };
    }
    if (exigidas.length === 1) {
      return {
        autorizado: false,
        papel,
        pagina_exigida: exigidas[0],
        motivo: 'Página de Bancos não liberada para este usuário.',
      };
    }
    return {
      autorizado: false,
      papel,
      pagina_exigida: exigidas.join('|'),
      motivo: 'Página de Cheques ou Bancos não liberada para este usuário.',
    };
  }

  return { autorizado: true, papel };
}