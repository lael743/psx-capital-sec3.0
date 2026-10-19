import { useState, useRef, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ChevronDown, Menu, X, LogOut, Settings, Users, ShieldCheck } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import NotificationBell from '@/components/layout/NotificationBell';
import { hasPageAccess } from '@/lib/pageAccess';

const navItems = [
  { label: 'Dashboard', href: '/' },
  {
    label: 'Clientes',
    children: [
      { label: 'Todos os Clientes', href: '/clientes' },
      { label: 'Leads', href: '/leads' },
    ],
  },
  {
    label: 'Operações',
    children: [
      { label: 'Todas as Operações', href: '/operacoes' },
      { label: 'Nova Operação', href: '/operacoes/nova' },
      { label: 'Cheques', href: '/cheques' },
      { label: 'Simulador', href: '/simulador' },
    ],
  },
  {
    label: 'Financeiro',
    children: [
      { label: 'Pagamentos', href: '/pagamentos' },
      { label: 'Fluxo de Caixa', href: '/caixa' },
      { label: 'Cobrança', href: '/cobranca' },
    ],
  },
  { label: 'Documentos', href: '/documentos' },
  {
    label: 'Relatórios',
    children: [
      { label: 'Agenda', href: '/agenda' },
      { label: 'Log de Auditoria', href: '/auditoria' },
    ],
  },
];

function NavItem({ item, isOpen, onToggle, onClose }) {
  const ref = useRef(null);
  const location = useLocation();

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    }
    if (isOpen) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isOpen, onClose]);

  const isActive = item.children
    ? item.children.some(c => location.pathname === c.href)
    : location.pathname === item.href;

  if (!item.children) {
    return (
      <Link
        to={item.href}
        className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
          isActive
            ? 'text-[hsl(43,65%,47%)]'
            : 'text-white/70 hover:text-white'
        }`}
      >
        {item.label}
      </Link>
    );
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={onToggle}
        className={`flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
          isActive || isOpen ? 'text-[hsl(43,65%,47%)]' : 'text-white/70 hover:text-white'
        }`}
      >
        {item.label}
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      {isOpen && (
        <div className="absolute top-full left-0 mt-2 w-52 bg-white border border-border rounded-xl shadow-xl py-1.5 z-50">
          {item.children.map(child => (
            <Link
              key={child.href}
              to={child.href}
              onClick={onClose}
              className={`flex items-center px-4 py-2.5 text-sm transition-colors ${
                location.pathname === child.href
                  ? 'text-[hsl(43,65%,47%)] bg-amber-50 font-medium'
                  : 'text-foreground/70 hover:text-foreground hover:bg-gray-50'
              }`}
            >
              {child.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

// Filtra nav items baseado nas permissões do usuário
function getFilteredNavItems(user) {
  if (!user) return [];
  const isAdmin = user.role === 'admin';

  const allItems = [
    { label: 'Dashboard', href: '/', pageKey: 'dashboard' },
    {
      label: 'Clientes',
      children: [
        { label: 'Todos os Clientes', href: '/clientes', pageKey: 'clientes' },
        { label: 'Leads', href: '/leads', pageKey: 'leads' },
      ],
    },
    {
      label: 'Operações',
      children: [
        { label: 'Todas as Operações', href: '/operacoes', pageKey: 'operacoes' },
        { label: 'Nova Operação', href: '/operacoes/nova', pageKey: 'operacoes' },
        { label: 'Cheques', href: '/cheques', pageKey: 'cheques' },
        { label: 'Simulador', href: '/simulador', pageKey: 'simulador' },
      ],
    },
    {
      label: 'Financeiro',
      children: [
        { label: 'Pagamentos', href: '/pagamentos', pageKey: 'pagamentos' },
        { label: 'Fluxo de Caixa', href: '/caixa', pageKey: 'caixa' },
        { label: 'Cobrança', href: '/cobranca', pageKey: 'cobranca' },
        { label: 'Bancos', href: '/bancos', pageKey: 'bancos' },
      ],
    },
    {
      label: 'Documentos',
      children: [
        { label: 'Documentos', href: '/documentos', pageKey: 'documentos' },
        { label: 'Gerar Contrato / Promissória', href: '/contratos', pageKey: 'documentos' },
      ],
    },
    {
      label: 'Relatórios',
      children: [
        { label: 'Agenda', href: '/agenda', pageKey: 'agenda' },
        { label: 'Log de Auditoria', href: '/auditoria', pageKey: 'auditoria' },
      ],
    },
  ];

  return allItems
    .map(item => {
      if (item.children) {
        const visibleChildren = item.children.filter(c => hasPageAccess(user, c.pageKey));
        if (visibleChildren.length === 0) return null;
        return { ...item, children: visibleChildren };
      }
      return hasPageAccess(user, item.pageKey) ? item : null;
    })
    .filter(Boolean);
}

export default function Topbar({ user }) {
  const [openMenu, setOpenMenu] = useState(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef(null);

  useEffect(() => {
    function handleClick(e) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) setUserMenuOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-[#0a0a0a] border-b border-white/10 h-14 flex items-center">
      <div className="flex items-center w-full px-5 gap-6">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2 shrink-0">
          <div className="flex items-center">
            <span className="text-lg font-bold tracking-tight text-white">PS</span>
            <span className="text-lg font-bold tracking-tight text-[hsl(43,65%,55%)]">X</span>
          </div>
          <span className="text-[11px] font-medium text-white/40 tracking-widest uppercase hidden sm:block">
            CAPITAL
          </span>
        </Link>

        {/* Desktop Nav */}
        <nav className="hidden md:flex items-center gap-0.5 flex-1">
          {getFilteredNavItems(user).map((item, i) => (
            <NavItem
              key={i}
              item={item}
              isOpen={openMenu === i}
              onToggle={() => setOpenMenu(openMenu === i ? null : i)}
              onClose={() => setOpenMenu(null)}
            />
          ))}
        </nav>

        {/* Right actions */}
        <div className="flex items-center gap-2 ml-auto">
          <NotificationBell />

          <div ref={userMenuRef} className="relative">
            <button
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg hover:bg-white/10 transition-colors"
            >
              <div className="w-7 h-7 rounded-full bg-[hsl(43,65%,47%)] flex items-center justify-center shrink-0">
                <span className="text-[11px] font-bold text-black">
                  {user?.full_name?.[0]?.toUpperCase() || 'U'}
                </span>
              </div>
              <span className="text-sm font-medium text-white/80 hidden sm:block max-w-[110px] truncate">
                {user?.full_name || 'Usuário'}
              </span>
              <ChevronDown className="w-3.5 h-3.5 text-white/40" />
            </button>
            {userMenuOpen && (
              <div className="absolute top-full right-0 mt-2 w-52 bg-white border border-border rounded-xl shadow-xl py-1.5 z-50">
                <div className="px-4 py-3 border-b border-border mb-1">
                  <p className="text-sm font-semibold truncate">{user?.full_name}</p>
                  <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
                </div>
                {user?.role === 'admin' && (
                  <Link
                    to="/configuracoes"
                    onClick={() => setUserMenuOpen(false)}
                    className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-foreground/70 hover:text-foreground hover:bg-gray-50"
                  >
                    <Settings className="w-3.5 h-3.5" /> Configurações
                  </Link>
                )}
                <button
                  onClick={() => base44.auth.logout()}
                  className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-500 hover:bg-red-50 w-full text-left"
                >
                  <LogOut className="w-3.5 h-3.5" /> Sair
                </button>
              </div>
            )}
          </div>

          <button
            className="md:hidden p-2 rounded-lg text-white/50 hover:text-white hover:bg-white/10"
            onClick={() => setMobileOpen(!mobileOpen)}
          >
            {mobileOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="absolute top-14 left-0 right-0 bg-[#0a0a0a] border-b border-white/10 shadow-xl md:hidden z-40 max-h-[80vh] overflow-y-auto">
          {getFilteredNavItems(user).map((item, i) => (
            <div key={i}>
              {item.href ? (
                <Link
                  to={item.href}
                  onClick={() => setMobileOpen(false)}
                  className="block px-5 py-3.5 text-sm font-medium text-white/70 hover:text-white hover:bg-white/5 border-b border-white/5"
                >
                  {item.label}
                </Link>
              ) : (
                <>
                  <div className="px-5 py-2.5 text-xs font-semibold text-white/30 uppercase tracking-wider bg-white/5 border-b border-white/5">
                    {item.label}
                  </div>
                  {item.children?.map(child => (
                    <Link
                      key={child.href}
                      to={child.href}
                      onClick={() => setMobileOpen(false)}
                      className="block px-7 py-3 text-sm text-white/60 hover:text-white hover:bg-white/5 border-b border-white/5"
                    >
                      {child.label}
                    </Link>
                  ))}
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </header>
  );
}