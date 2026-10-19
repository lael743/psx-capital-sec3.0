import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { ArrowLeft, Edit, Phone, Mail, MapPin, CheckCircle } from 'lucide-react';
import StatusBadge from '@/components/ui/StatusBadge';
import { formatCurrency } from '@/lib/finance';

export default function SacadoDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [sacado, setSacado] = useState(null);
  const [cheques, setCheques] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      base44.entities.Sacado.get(id),
      base44.entities.Cheque.list('-created_date', 500),
    ]).then(([s, chqs]) => {
      setSacado(s);
      const matched = (chqs || []).filter(c => c.sacado_doc && s.document && c.sacado_doc.replace(/\D/g, '') === s.document.replace(/\D/g, ''));
      setCheques(matched);
      setLoading(false);
    });
  }, [id]);

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-6 h-6 border-2 border-border border-t-foreground rounded-full animate-spin" />
    </div>
  );

  if (!sacado) return <div className="p-6 text-center text-muted-foreground">Sacado não encontrado.</div>;

  const totalFace = cheques.reduce((s, c) => s + (c.valor_face || c.value || 0), 0);

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-4">
      <div className="flex items-start gap-3">
        <button onClick={() => navigate('/sacados')} className="p-2 rounded-lg hover:bg-gray-100 transition-colors shrink-0 mt-0.5">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold">{sacado.nome}</h1>
            <StatusBadge status={sacado.status} />
          </div>
          <p className="text-sm text-muted-foreground">{sacado.document_type}: {sacado.document}</p>
          <div className="flex flex-wrap gap-2 mt-3">
            <Link to={`/sacados/${id}/editar`} className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border border-border rounded-lg hover:bg-gray-50 transition-colors">
              <Edit className="w-3.5 h-3.5" /> Editar
            </Link>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white border border-border rounded-xl p-5 space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Contato</h3>
          {sacado.phone && <div className="flex items-center gap-2 text-sm"><Phone className="w-3.5 h-3.5 text-muted-foreground" /> {sacado.phone}</div>}
          {sacado.email && <div className="flex items-center gap-2 text-sm"><Mail className="w-3.5 h-3.5 text-muted-foreground" /> {sacado.email}</div>}
          {(sacado.address || sacado.city) && <div className="flex items-start gap-2 text-sm"><MapPin className="w-3.5 h-3.5 text-muted-foreground mt-0.5" /> <span>{[sacado.address, sacado.city, sacado.state].filter(Boolean).join(', ')}</span></div>}
          {!sacado.phone && !sacado.email && !sacado.address && <p className="text-sm text-muted-foreground">Sem contato cadastrado.</p>}
        </div>
        <div className="bg-white border border-border rounded-xl p-5 space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Resumo</h3>
          <div className="flex justify-between text-sm"><span className="text-muted-foreground">Títulos vinculados</span><span className="font-semibold">{cheques.length}</span></div>
          <div className="flex justify-between text-sm"><span className="text-muted-foreground">Total em face</span><span className="font-semibold">{formatCurrency(totalFace)}</span></div>
          <div className="flex justify-between text-sm"><span className="text-muted-foreground">Origem</span><span className="font-semibold capitalize">{sacado.origem || 'manual'}</span></div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Asaas</span>
            {sacado.asaas_customer_id ? (
              <span className="font-semibold text-emerald-600 flex items-center gap-1">
                <CheckCircle className="w-3.5 h-3.5" /> Sincronizado
              </span>
            ) : (
              <span className="font-semibold text-muted-foreground">Pendente</span>
            )}
          </div>
          {sacado.asaas_customer_id && (
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">ID Asaas</span>
              <span className="font-mono text-muted-foreground">{sacado.asaas_customer_id}</span>
            </div>
          )}
        </div>
      </div>

      <div className="bg-white border border-border rounded-xl p-5">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Títulos Vinculados</h3>
        {cheques.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">Nenhum título vinculado a este sacado.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground uppercase tracking-wider">
                  <th className="text-left py-2 px-2">Operação</th>
                  <th className="text-left py-2 px-2">Tipo</th>
                  <th className="text-left py-2 px-2">Número</th>
                  <th className="text-right py-2 px-2">Valor Face</th>
                  <th className="text-left py-2 px-2">Vencimento</th>
                  <th className="text-left py-2 px-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {cheques.map(c => (
                  <tr key={c.id} className="hover:bg-gray-50/50">
                    <td className="py-2 px-2">{c.operation_id ? <Link to={`/operacoes/${c.operation_id}`} className="text-[hsl(43,65%,47%)] hover:underline">Ver operação</Link> : '—'}</td>
                    <td className="py-2 px-2 capitalize">{c.tipo}</td>
                    <td className="py-2 px-2 font-mono text-xs">{c.check_number}</td>
                    <td className="py-2 px-2 text-right font-semibold">{formatCurrency(c.valor_face || c.value)}</td>
                    <td className="py-2 px-2">{c.compensation_date || '—'}</td>
                    <td className="py-2 px-2"><StatusBadge status={c.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}