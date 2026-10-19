import { useEffect, useState } from 'react';
import { useLocation, useNavigate, Outlet } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { hasPageAccess, ALL_PAGES } from '@/lib/pageAccess';

// Mapeia rotas para page keys
const routeToPageKey = (pathname) => {
  if (pathname === '/') return 'dashboard';
  const match = ALL_PAGES.find(p => p.href !== '/' && pathname.startsWith(p.href));
  return match ? match.key : null;
};

export default function RouteGuard() {
  const location = useLocation();
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    base44.auth.me().then(u => {
      setUser(u);
      setChecked(true);
    }).catch(() => setChecked(true));
  }, []);

  useEffect(() => {
    if (!checked || !user) return;
    // Admin só é bloqueado em configuracoes se não for admin
    if (location.pathname === '/configuracoes') {
      if (user.role !== 'admin') navigate('/');
      return;
    }
    if (location.pathname === '/usuarios') {
      if (user.role !== 'admin') navigate('/');
      return;
    }
    const pageKey = routeToPageKey(location.pathname);
    if (!pageKey) return; // rota desconhecida, deixa passar
    if (!hasPageAccess(user, pageKey)) {
      navigate('/acesso-negado');
    }
  }, [location.pathname, checked, user]);

  if (!checked) return (
    <div className="flex items-center justify-center h-48">
      <div className="w-6 h-6 border-2 border-border border-t-foreground rounded-full animate-spin" />
    </div>
  );

  return <Outlet />;
}