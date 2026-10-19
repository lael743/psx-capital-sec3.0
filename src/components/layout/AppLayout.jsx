import { useEffect, useState } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { SidebarProvider, SidebarInset, SidebarTrigger } from '@/components/ui/sidebar';
import AppSidebar from './AppSidebar';

export default function AppLayout() {
  const [user, setUser] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    base44.auth.me().then(setUser).catch(() => {});
  }, []);

  useEffect(() => {
    const handler = (e) => {
      const tag = document.activeElement?.tagName;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return;

      if ((e.ctrlKey || e.metaKey) && e.shiftKey) {
        switch (e.key.toLowerCase()) {
          case 'n':
            e.preventDefault();
            navigate('/operacoes/nova');
            break;
          case 'c':
            e.preventDefault();
            navigate('/cheques');
            break;
          case 's':
            e.preventDefault();
            navigate('/simulador');
            break;
          case 'b':
            e.preventDefault();
            navigate('/bancos');
            break;
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [navigate]);

  return (
    <SidebarProvider defaultOpen={true}>
      <div className="flex h-screen w-full overflow-hidden bg-background font-inter">
        <AppSidebar user={user} />
        <SidebarInset className="flex flex-col">
          {/* Header bar sutil com trigger */}
          <header className="flex items-center h-12 px-4 border-b border-border shrink-0 bg-[hsl(var(--border))]">
            
          </header>
          <div className="flex-1 overflow-auto">
            <Outlet />
          </div>
        </SidebarInset>
      </div>
    </SidebarProvider>);

}