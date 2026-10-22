import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Users, TrendingUp, FileCheck, Calculator,
  CreditCard, Wallet, Bell, FileText, Calendar, Shield, Building2,
  UserPlus, PenLine, Clock, CheckCircle, FileBadge, Package, Receipt,
  Send, CalendarClock, Tag, Settings } from
'lucide-react';
import { hasPageAccess } from '@/lib/pageAccess';
import {
  Sidebar, SidebarContent, SidebarGroup,
  SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuButton,
  SidebarMenuItem, SidebarRail, SidebarTrigger } from
'@/components/ui/sidebar';

const ICON_MAP = {
  LayoutDashboard, Users, TrendingUp, FileCheck, Calculator,
  CreditCard, Wallet, Bell, FileText, Calendar, Shield, Building2, UserPlus,
  PenLine, Clock, CheckCircle, FileBadge, Settings, Package, Receipt, Send,
  CalendarClock, Tag
};

// Grupos de navegação com ícones
const NAV_GROUPS = [
{
  label: 'Principal',
  items: [
  { label: 'Dashboard', href: '/', icon: 'LayoutDashboard', pageKey: 'dashboard' }]

},
{
  label: 'Cadastros',
  items: [
  { label: 'Cedentes', href: '/clientes', icon: 'Users', pageKey: 'clientes' },
  { label: 'Sacados', href: '/sacados', icon: 'Users', pageKey: 'sacados' },
  { label: 'Leads', href: '/leads', icon: 'UserPlus', pageKey: 'leads' },
  { label: 'Links de Cadastro', href: '/onboarding-links', icon: 'Send', pageKey: 'leads' },
  { label: 'Bancos', href: '/bancos', icon: 'Building2', pageKey: 'bancos' }]

},
{
  label: 'Operações',
  items: [
  { label: 'Operações', href: '/operacoes', icon: 'TrendingUp', pageKey: 'operacoes' },
  // Produtos não tem item próprio no menu: o cadastro vive em
  // Configurações › Produtos (rota /produtos preservada).
  { label: 'Cheques', href: '/cheques', icon: 'FileCheck', pageKey: 'cheques' },
  { label: 'Boletos', href: '/boletos', icon: 'Receipt', pageKey: 'boletos' },
  { label: 'Simulador', href: '/simulador', icon: 'Calculator', pageKey: 'simulador' }]

},
{
  label: 'Financeiro',
  items: [
  { label: 'Contas a Receber', href: '/pagamentos', icon: 'CreditCard', pageKey: 'pagamentos' },
  { label: 'Fluxo de Caixa', href: '/caixa', icon: 'Wallet', pageKey: 'caixa' },
  { label: 'Cobrança', href: '/cobranca', icon: 'Bell', pageKey: 'cobranca' }]

},
{
  label: 'Documentos',
  items: [
  { label: 'Documentos', href: '/documentos', icon: 'FileText', pageKey: 'documentos' },
  { label: 'Contratos', href: '/contratos', icon: 'FileText', pageKey: 'documentos' }]

},
{
  label: 'Gestão Interna',
  items: [
  { label: 'Visão Geral', href: '/gestao', icon: 'Wallet', pageKey: 'gestao_visao_geral' },
  { label: 'Lançamentos', href: '/gestao/lancamentos', icon: 'Receipt', pageKey: 'gestao_lancamentos' },
  { label: 'Contas a Pagar', href: '/gestao/contas-a-pagar', icon: 'CalendarClock', pageKey: 'gestao_contas_pagar' },
  { label: 'Patrimônio', href: '/gestao/patrimonio', icon: 'Package', pageKey: 'gestao_patrimonio' },
  { label: 'Categorias', href: '/gestao/categorias', icon: 'Tag', pageKey: 'gestao_categorias' },
  { label: 'Contas e Meios de Pagamento', href: '/gestao/contas', icon: 'CreditCard', pageKey: 'gestao_contas' }]

},
{
  label: 'Relatórios',
  items: [
  { label: 'Agenda', href: '/agenda', icon: 'Calendar', pageKey: 'agenda' },
  { label: 'Auditoria', href: '/auditoria', icon: 'Shield', pageKey: 'auditoria' }]

},
{
  label: 'Assinaturas',
  items: [
  { label: 'Assinaturas', href: '/assinaturas', icon: 'PenLine', pageKey: 'assinaturas' },
  { label: 'Pendentes', href: '/assinaturas?status=aguardando_assinatura', icon: 'Clock', pageKey: 'assinaturas' },
  { label: 'Assinados', href: '/assinaturas?status=assinado', icon: 'CheckCircle', pageKey: 'assinaturas' },
  { label: 'Validar', href: '/validar-assinatura', icon: 'FileBadge', pageKey: 'assinaturas' }]

}];


function NavItem({ item }) {
  const location = useLocation();
  const isActive = location.pathname === item.href ||
  item.href !== '/' && location.pathname.startsWith(item.href + '/');
  const Icon = ICON_MAP[item.icon];

  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={isActive} tooltip={item.label}>
        <Link to={item.href}>
          {Icon && <Icon className="w-4 h-4" />}
          <span>{item.label}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>);

}

function NavGroup({ group }) {
  return (
    <SidebarGroup>
      <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
      <SidebarMenu>
        {group.items.map((item) =>
        <NavItem key={item.href + item.label} item={item} />
        )}
      </SidebarMenu>
    </SidebarGroup>);

}

function filterGroups(user) {
  if (!user) return [];
  const isAdmin = user.role === 'admin';

  return NAV_GROUPS.map((group) => {
    const visibleItems = group.items.filter((item) =>
    isAdmin || hasPageAccess(user, item.pageKey)
    );
    if (visibleItems.length === 0) return null;
    return { ...group, items: visibleItems };
  }).filter(Boolean);
}

export default function AppSidebar({ user }) {
  const groups = filterGroups(user);

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      {/* Logo */}
      <SidebarHeader className="py-4 bg-[#000000] px-3 rounded text-[#4e3636]">
        <div className="flex items-center gap-2 group-data-[collapsible=icon]:justify-center">
          <Link to="/" className="flex items-center shrink-0">
            <div className="flex items-center">
              <span className="text-lg font-bold tracking-tight text-sidebar-foreground">PS</span>
              <span className="text-lg font-bold tracking-tight text-[hsl(43,65%,47%)]">X</span>
            </div>
          </Link>
          <div className="flex items-center gap-2 ml-auto group-data-[collapsible=icon]:hidden">
            <SidebarTrigger className="hidden md:flex" />
          </div>
        </div>
      </SidebarHeader>

      {/* Navegação */}
      <SidebarContent>
        {groups.map((group, i) =>
        <NavGroup key={i} group={group} />
        )}
      </SidebarContent>

      <SidebarRail />
    </Sidebar>);

}