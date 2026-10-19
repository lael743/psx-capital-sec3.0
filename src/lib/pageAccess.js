// Definição de todas as páginas do sistema com labels e rotas
export const ALL_PAGES = [
  { key: 'dashboard', label: 'Dashboard', href: '/', icon: 'LayoutDashboard' },
  { key: 'clientes', label: 'Cedentes', href: '/clientes', icon: 'Users' },
  { key: 'sacados', label: 'Sacados', href: '/sacados', icon: 'Users' },
  { key: 'operacoes', label: 'Operações', href: '/operacoes', icon: 'TrendingUp' },
  { key: 'cheques', label: 'Cheques', href: '/cheques', icon: 'FileCheck' },
  { key: 'boletos', label: 'Boletos', href: '/boletos', icon: 'Receipt' },
  { key: 'simulador', label: 'Simulador', href: '/simulador', icon: 'Calculator' },
  { key: 'pagamentos', label: 'Pagamentos', href: '/pagamentos', icon: 'CreditCard' },
  { key: 'caixa', label: 'Fluxo de Caixa', href: '/caixa', icon: 'Wallet' },
  { key: 'cobranca', label: 'Cobrança', href: '/cobranca', icon: 'Bell' },
  { key: 'documentos', label: 'Documentos', href: '/documentos', icon: 'FileText' },
  { key: 'agenda', label: 'Agenda', href: '/agenda', icon: 'Calendar' },
  { key: 'auditoria', label: 'Log de Auditoria', href: '/auditoria', icon: 'Shield' },
  { key: 'bancos', label: 'Bancos', href: '/bancos', icon: 'Building2' },
  { key: 'leads', label: 'Leads', href: '/leads', icon: 'UserPlus' },
  { key: 'assinaturas', label: 'Assinaturas Digitais', href: '/assinaturas', icon: 'PenLine' },
  { key: 'produtos', label: 'Produtos', href: '/produtos', icon: 'Package' },
  { key: 'gestao_lancamentos', label: 'Lançamentos', href: '/gestao/lancamentos', icon: 'Receipt' },
  { key: 'gestao_contas_pagar', label: 'Contas a Pagar', href: '/gestao/contas-a-pagar', icon: 'CalendarClock' },
  { key: 'gestao_patrimonio', label: 'Patrimônio', href: '/gestao/patrimonio', icon: 'Package' },
  { key: 'gestao_categorias', label: 'Categorias', href: '/gestao/categorias', icon: 'Tag' },
  { key: 'gestao_contas', label: 'Contas e Meios', href: '/gestao/contas', icon: 'CreditCard' },
  { key: 'gestao_visao_geral', label: 'Visão Geral', href: '/gestao', icon: 'Wallet' },
];

// Verifica se usuário tem acesso a uma página
export function hasPageAccess(user, pageKey) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  if (!user.allowed_pages || user.allowed_pages.length === 0) return false;
  return user.allowed_pages.includes(pageKey);
}

// Retorna páginas acessíveis para um usuário
export function getAccessiblePages(user) {
  if (!user) return [];
  if (user.role === 'admin') return ALL_PAGES;
  return ALL_PAGES.filter(p => user.allowed_pages?.includes(p.key));
}