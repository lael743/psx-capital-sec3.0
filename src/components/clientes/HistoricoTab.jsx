import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { formatDate } from '@/lib/finance';
import { Clock, User, Edit, DollarSign, FileText, RefreshCw, AlertTriangle, Ban } from 'lucide-react';

const TYPE_ICONS = {
  antecipacao: DollarSign, emprestimo: DollarSign, cheque: FileText, boleto: FileText,
  parcela: Clock, pagamento_dinheiro: DollarSign, pagamento_pix: DollarSign,
  pagamento_transferencia: DollarSign, pagamento_cartao: DollarSign,
  baixa_manual: RefreshCw, ajuste_saldo: Edit, estorno: Ban, desconto: AlertTriangle,
  acrescimo: AlertTriangle, taxa: Clock
};

const TYPE_LABELS = {
  antecipacao: 'Antecipação', emprestimo: 'Empréstimo', cheque: 'Cheque', boleto: 'Boleto',
  parcela: 'Parcela', pagamento_dinheiro: 'Pag. Dinheiro', pagamento_pix: 'Pag. Pix',
  pagamento_transferencia: 'Pag. Transferência', pagamento_cartao: 'Pag. Cartão',
  baixa_manual: 'Baixa Manual', ajuste_saldo: 'Ajuste de Saldo', estorno: 'Estorno',
  desconto: 'Desconto', acrescimo: 'Acréscimo', taxa: 'Taxa'
};

export default function HistoricoTab({ clientId }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      base44.entities.LancamentoContaCorrente.filter({ client_id: clientId }, '-date', 50),
      base44.entities.AuditLog.filter({ entity_id: clientId }, '-id', 30),
    ]).then(([lancs, audits]) => {
      const combined = [
        ...lancs.map(l => ({ ...l, _type: 'lancamento', _date: l.date || l.created_date })),
        ...audits.map(a => ({ ...a, _type: 'audit', _date: a.created_date })),
      ].sort((a, b) => (b._date || '').localeCompare(a._date || '')).slice(0, 50);
      setItems(combined);
      setLoading(false);
    });
  }, [clientId]);

  if (loading) return (
    <div className="flex items-center justify-center h-40">
      <div className="w-6 h-6 border-2 border-border border-t-foreground rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-1">
      {items.map((item, idx) => {
        const isLanc = item._type === 'lancamento';
        const IconComponent = isLanc ? (TYPE_ICONS[item.type] || FileText) : Edit;
        return (
          <div key={item.id || idx} className="flex gap-3 py-3 border-b border-border last:border-0">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${isLanc ? 'bg-gray-100' : 'bg-blue-50'}`}>
              <IconComponent className={`w-4 h-4 ${isLanc ? 'text-muted-foreground' : 'text-blue-600'}`} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium">
                  {isLanc ? (TYPE_LABELS[item.type] || item.type) : item.action}
                </p>
                <span className="text-xs text-muted-foreground shrink-0">{formatDate(item._date)}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {isLanc ? (
                  <span>
                    {item.nature === 'debito' ? 'Débito' : 'Crédito'} de R$ {(item.gross_value || 0).toFixed(2)}
                    {item.description ? ` — ${item.description}` : ''}
                    {item.status ? ` • ${item.status}` : ''}
                  </span>
                ) : (
                  <span>{item.description}</span>
                )}
              </p>
            </div>
          </div>
        );
      })}
      {items.length === 0 && <div className="py-10 text-center text-muted-foreground text-sm">Nenhum histórico encontrado.</div>}
    </div>
  );
}