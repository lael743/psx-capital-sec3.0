import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, LogOut, Settings } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import NotificationBell from '@/components/layout/NotificationBell';

export default function TopbarActions({ user }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <div className="flex items-center gap-1">
      {user?.role === 'admin' && (
        <Link
          to="/configuracoes"
          title="Configurações"
          aria-label="Configurações"
          className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        >
          <Settings className="w-4 h-4" />
        </Link>
      )}

      <NotificationBell />

      <div ref={ref} className="relative ml-1">
        <button
          onClick={() => setOpen(!open)}
          className="flex items-center gap-2 pl-1 pr-2 py-1 rounded-lg hover:bg-accent transition-colors"
        >
          <div className="w-7 h-7 rounded-full bg-[hsl(43,65%,47%)] flex items-center justify-center shrink-0">
            <span className="text-[11px] font-bold text-black">
              {user?.full_name?.[0]?.toUpperCase() || 'U'}
            </span>
          </div>
          <span className="text-sm font-medium hidden sm:block max-w-[120px] truncate">
            {user?.full_name || 'Usuário'}
          </span>
          <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>

        {open && (
          <div className="absolute top-full right-0 mt-2 w-52 bg-white border border-border rounded-xl shadow-xl py-1.5 z-50">
            <div className="px-4 py-3 border-b border-border mb-1">
              <p className="text-sm font-semibold truncate">{user?.full_name}</p>
              <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
            </div>
            {user?.role === 'admin' && (
              <Link
                to="/configuracoes"
                onClick={() => setOpen(false)}
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
    </div>
  );
}