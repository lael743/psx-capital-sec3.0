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
  // M1 — compensação e estorno de cheque migrados para o servidor.
  COMPENSAR_CHEQUE: 'compensar_cheque',
  ESTORNAR_CHEQUE: 'estornar_cheque',
  INSPECIONAR_CHEQUE: 'inspecionar_cheque',
  RECUPERAR_CHEQUE: 'recuperar_lancamento_cheque',
});

/** Chave de página usada pelo controle de acesso existente (pageAccess.js). */
export const PAGINA_BANCOS = 'bancos';
/** M1 — tela de Cheques, que também dispara compensação e estorno. */
export const PAGINA_CHEQUES = 'cheques';

/**
 * M1 — ações de cheque valem com QUALQUER uma das telas que as disparam:
 * a compensação é feita tanto na página de Cheques quanto no detalhe do banco.
 */
const PAGINAS_POR_ACAO = Object.freeze({
  [ACOES_BANCARIAS.COMPENSAR_CHEQUE]: Object.freeze([PAGINA_CHEQUES, PAGINA_BANCOS]),
  [ACOES_BANCARIAS.ESTORNAR_CHEQUE]: Object.freeze([PAGINA_CHEQUES, PAGINA_BANCOS]),
  [ACOES_BANCARIAS.INSPECIONAR_CHEQUE]: Object.freeze([PAGINA_CHEQUES, PAGINA_BANCOS]),
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
]);

/** Ações de natureza administrativa (reversão e recuperação). */
const ADMINISTRATIVAS = Object.freeze([
  ACOES_BANCARIAS.ESTORNAR,
  ACOES_BANCARIAS.RECUPERAR,
  ACOES_BANCARIAS.LIBERAR_REIVINDICACAO,
  ACOES_BANCARIAS.RECUPERAR_CHEQUE,
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