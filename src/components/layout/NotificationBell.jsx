import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, AlertTriangle, Clock, CheckCircle } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { formatCurrency, formatDate, daysOverdue } from '@/lib/finance';

function getAlerts(operations, cheques) {
  const alerts = [];
  const today = new Date();

  operations.forEach(op => {
    if (op.status === 'quitado') return;
    const due = new Date(op.due_date + 'T00:00:00');
    const diffDays = Math.ceil((due - today) / (1000 * 60 * 60 * 24));
    const overdue = daysOverdue(op.due_date);

    if (overdue > 0) {
      alerts.push({
        id: `op-overdue-${op.id}`,
        type: 'danger',
        title: `${op.client_name} — ${overdue}d em atraso`,
        sub: `Saldo: ${formatCurrency((op.total_receivable || 0) - (op.amount_paid || 0))}`,
        href: `/operacoes/${op.id}`,
      });
    } else if (diffDays >= 0 && diffDays <= 5) {
      alerts.push({
        id: `op-due-${op.id}`,
        type: 'warning',
        title: `${op.client_name} — vence em ${diffDays === 0 ? 'hoje' : `${diffDays}d`}`,
        sub: `Total: ${formatCurrency(op.total_receivable)} · ${formatDate(op.due_date)}`,
        href: `/operacoes/${op.id}`,
      });
    }
  });

  cheques.forEach(c => {
    if (c.status !== 'pendente') return;
    const due = new Date(c.compensation_date + 'T00:00:00');
    const diffDays = Math.ceil((due - today) / (1000 * 60 * 60 * 24));
    if (diffDays >= 0 && diffDays <= 3) {
      alerts.push({
        id: `chq-due-${c.id}`,
        type: 'warning',
        title: `Cheque ${c.check_number} — ${c.client_name}`,
        sub: `Compensação ${diffDays === 0 ? 'hoje' : `em ${diffDays}d`} · ${formatCurrency(c.value)}`,
        href: `/cheques`,
      });
    }
    if (diffDays < 0) {
      alerts.push({
        id: `chq-overdue-${c.id}`,
        type: 'danger',
        title: `Cheque atrasado — ${c.client_name}`,
        sub: `${c.check_number} · ${formatCurrency(c.value)}`,
        href: `/cheques`,
      });
    }
  });

  return alerts;
}

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [alerts, setAlerts] = useState([]);
  const [allowed, setAllowed] = useState(false);
  const ref = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    base44.auth.me().then(user => {
      const isApproved = user?.role === 'admin' || (user?.allowed_pages && user.allowed_pages.length > 0);
      if (!isApproved) return;
      setAllowed(true);
      Promise.all([
        base44.entities.Operation.filter({ is_active: true }),
        base44.entities.Cheque.filter({ status: 'pendente' }),
      ]).then(([ops, chqs]) => {
        setAlerts(getAlerts(ops, chqs));
      });
    }).catch(() => {});
  }, []);

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const danger = alerts.filter(a => a.type === 'danger');
  const warning = alerts.filter(a => a.type === 'warning');
  const count = alerts.length;

  if (!allowed) return null;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className="relative p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
      >
        <Bell className="w-4 h-4" />
        {count > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-0.5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute top-full right-0 mt-2 w-80 bg-white border border-border rounded-xl shadow-2xl z-50 overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <span className="text-sm font-bold">Alertas</span>
            <span className="text-xs text-muted-foreground">{count} pendente{count !== 1 ? 's' : ''}</span>
          </div>

          {count === 0 ? (
            <div className="px-4 py-8 text-center">
              <CheckCircle className="w-8 h-8 mx-auto mb-2 text-emerald-400" />
              <p className="text-sm text-muted-foreground">Tudo em ordem!</p>
            </div>
          ) : (
            <div className="max-h-80 overflow-y-auto divide-y divide-border">
              {danger.length > 0 && (
                <div className="px-3 py-1.5 bg-red-50 text-xs font-semibold text-red-600 uppercase tracking-wider">
                  Crítico — {danger.length} atraso{danger.length !== 1 ? 's' : ''}
                </div>
              )}
              {danger.map(a => (
                <button
                  key={a.id}
                  onClick={() => { setOpen(false); navigate(a.href); }}
                  className="w-full text-left px-4 py-3 hover:bg-red-50 transition-colors flex items-start gap-3"
                >
                  <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                  <div>
                    <div className="text-sm font-semibold text-red-700">{a.title}</div>
                    <div className="text-xs text-red-500">{a.sub}</div>
                  </div>
                </button>
              ))}
              {warning.length > 0 && (
                <div className="px-3 py-1.5 bg-amber-50 text-xs font-semibold text-amber-600 uppercase tracking-wider">
                  Vencimento próximo — {warning.length}
                </div>
              )}
              {warning.map(a => (
                <button
                  key={a.id}
                  onClick={() => { setOpen(false); navigate(a.href); }}
                  className="w-full text-left px-4 py-3 hover:bg-amber-50 transition-colors flex items-start gap-3"
                >
                  <Clock className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                  <div>
                    <div className="text-sm font-semibold text-amber-700">{a.title}</div>
                    <div className="text-xs text-amber-500">{a.sub}</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}