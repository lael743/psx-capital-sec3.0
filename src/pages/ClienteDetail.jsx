import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { ArrowLeft, Edit, MessageCircle, Plus, Phone, Mail, Trash2, Wallet } from 'lucide-react';
import StatusBadge from '@/components/ui/StatusBadge';
import StatCard from '@/components/ui/StatCard';
import SectionCard from '@/components/ui/SectionCard';
import { formatCurrency, formatPercent } from '@/lib/finance';
import { DollarSign, TrendingUp, AlertTriangle } from 'lucide-react';
import DocumentosCliente from '@/components/clientes/DocumentosCliente';
import ContaCorrenteTab from '@/components/clientes/ContaCorrenteTab';
import ChequesTab from '@/components/clientes/ChequesTab';
import OperacoesTab from '@/components/clientes/OperacoesTab';
import ParcelasTab from '@/components/clientes/ParcelasTab';
import HistoricoTab from '@/components/clientes/HistoricoTab';
import ContratoMaePanel from '@/components/cedente/ContratoMaePanel';

export default function ClienteDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [client, setClient] = useState(null);
  const [operations, setOperations] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [lancamentos, setLancamentos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('conta_corrente');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    Promise.all([
      base44.entities.Client.get(id),
      base44.entities.Operation.filter({ client_id: id }),
      base44.entities.ContactHistory.filter({ client_id: id }),
      base44.entities.LancamentoContaCorrente.filter({ client_id: id }, 'date', 200),
    ]).then(([cls, ops, cts, lancs]) => {
      setClient(cls);
      setOperations(ops);
      setContacts(cts);
      setLancamentos(lancs);
      setLoading(false);
    });
  }, [id]);

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-6 h-6 border-2 border-border border-t-foreground rounded-full animate-spin" />
    </div>
  );

  if (!client) return <div className="p-6 text-center text-muted-foreground">Cedente não encontrado.</div>;

  const handleDelete = async () => {
    setDeleting(true);
    await base44.entities.Client.delete(id);
    navigate('/clientes');
  };

  const waLink = client.whatsapp ? `https://wa.me/55${client.whatsapp.replace(/\D/g, '')}` : null;

  // Cálculos da conta corrente
  const totalDebito = lancamentos.filter(l => l.nature === 'debito' && l.status !== 'cancelado').reduce((s, l) => s + (l.debit_amount || l.gross_value || 0), 0);
  const totalCredito = lancamentos.filter(l => l.nature === 'credito' && l.status !== 'cancelado').reduce((s, l) => s + (l.credit_amount || l.net_value || l.gross_value || 0), 0);
  const saldoAtual = totalCredito - totalDebito;

  // Operações
  const totalBorrowed = operations.reduce((s, o) => s + (o.gross_value || 0), 0);
  const totalPaid = operations.reduce((s, o) => s + (o.amount_paid || 0), 0);
  const totalProfit = operations.reduce((s, o) => s + (o.realized_profit || o.projected_profit || 0), 0);
  const overdueOps = operations.filter(o => o.status === 'atrasado' || o.status === 'inadimplente');
  const defaultIndex = operations.length > 0 ? (overdueOps.length / operations.length) * 100 : 0;

  const tabs = [
    { key: 'conta_corrente', label: 'Conta Corrente' },
    { key: 'contrato_mae', label: 'Contrato de Securitização' },
    { key: 'dados', label: 'Dados do Cedente' },
    { key: 'cheques', label: 'Cheques' },
    { key: 'operacoes', label: 'Empréstimos / Antecipações' },
    { key: 'parcelas', label: 'Parcelas' },
    { key: 'documentos', label: 'Documentos' },
    { key: 'historico', label: 'Histórico / Auditoria' },
    { key: 'contatos', label: 'Contatos' },
  ];

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-4 md:space-y-5">
      {/* Header */}
      <div className="flex items-start gap-3">
        <button onClick={() => navigate('/clientes')} className="p-2 rounded-lg hover:bg-gray-100 transition-colors shrink-0 mt-0.5">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold">{client.name}</h1>
            <StatusBadge status={client.status} />
            <StatusBadge status={client.risk_profile} />
          </div>
          {client.fantasy_name && (
            <p className="text-sm text-muted-foreground font-medium">{client.fantasy_name}</p>
          )}
          <p className="text-sm text-muted-foreground">{client.document_type}: {client.document}</p>
          <div className="flex flex-wrap gap-2 mt-3">
            {waLink && (
              <a href={waLink} target="_blank" rel="noreferrer"
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border border-emerald-200 text-emerald-600 bg-emerald-50 rounded-lg hover:bg-emerald-100 transition-colors">
                <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
              </a>
            )}
            <Link to={`/clientes/${id}/editar`}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border border-border rounded-lg hover:bg-gray-50 transition-colors">
              <Edit className="w-3.5 h-3.5" /> Editar
            </Link>
            <button
              onClick={() => setConfirmDelete(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border border-red-200 text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-colors">
              <Trash2 className="w-3.5 h-3.5" /> Excluir
            </button>
            <Link to={`/operacoes/nova?client=${id}`}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-foreground text-primary-foreground text-xs font-semibold rounded-lg hover:bg-foreground/90 transition-colors shadow-sm">
              <Plus className="w-3.5 h-3.5" /> Nova Operação
            </Link>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Saldo Atual" value={formatCurrency(saldoAtual)} icon={Wallet} variant={saldoAtual >= 0 ? 'gold' : 'danger'} />
        <StatCard label="Total Emprestado" value={formatCurrency(totalBorrowed)} icon={DollarSign} variant="dark" />
        <StatCard label="Total Pago" value={formatCurrency(totalPaid)} icon={TrendingUp} />
        <StatCard label="Índice de Atraso" value={formatPercent(defaultIndex)} icon={AlertTriangle} variant={defaultIndex > 0 ? 'danger' : 'default'} />
      </div>

      {/* Tabs */}
      <div className="overflow-x-auto -mx-4 md:mx-0 px-4 md:px-0">
        <div className="flex gap-0.5 bg-gray-100 rounded-lg p-1 w-fit min-w-max">
          {tabs.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`px-3 md:px-4 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${tab === t.key ? 'bg-white text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      {tab === 'conta_corrente' && <ContaCorrenteTab clientId={id} client={client} />}

      {tab === 'contrato_mae' && (
        <ContratoMaePanel cedente={client} onUpdate={() => base44.entities.Client.get(id).then(setClient)} />
      )}

      {tab === 'dados' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <SectionCard title="Dados Pessoais">
            <div className="p-5 space-y-3 text-sm">
              {[
                { label: 'Telefone', value: client.phone, icon: Phone },
                { label: 'E-mail', value: client.email, icon: Mail },
                { label: 'Endereço', value: client.address },
                { label: 'Cidade / Estado', value: [client.city, client.state].filter(Boolean).join(' — ') },
              ].map(f => (
                <div key={f.label}>
                  <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-0.5">{f.label}</div>
                  <div className="font-medium">{f.value || '—'}</div>
                </div>
              ))}
            </div>
          </SectionCard>

          <SectionCard title="Configurações de Crédito">
            <div className="p-5 space-y-3 text-sm">
              {[
                { label: 'Limite de Crédito', value: formatCurrency(client.credit_limit) },
                { label: 'Taxa Padrão', value: client.default_rate ? `${client.default_rate}% a.m.` : '—' },
                { label: 'Score Interno', value: client.internal_score || '—' },
                { label: 'Chave PIX', value: client.pix_key },
              ].map(f => (
                <div key={f.label}>
                  <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-0.5">{f.label}</div>
                  <div className="font-semibold">{f.value || '—'}</div>
                </div>
              ))}
            </div>
          </SectionCard>

          <SectionCard title="Dados Bancários">
            <div className="p-5 space-y-3 text-sm">
              {[
                { label: 'Banco', value: client.bank_name },
                { label: 'Agência', value: client.bank_agency },
                { label: 'Conta', value: client.bank_account },
                { label: 'Tipo', value: client.bank_account_type },
              ].map(f => (
                <div key={f.label}>
                  <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-0.5">{f.label}</div>
                  <div className="font-medium">{f.value || '—'}</div>
                </div>
              ))}
            </div>
          </SectionCard>
        </div>
      )}

      {tab === 'cheques' && <ChequesTab clientId={id} />}

      {tab === 'operacoes' && <OperacoesTab clientId={id} clientName={client.name} />}

      {tab === 'parcelas' && <ParcelasTab clientId={id} />}

      {tab === 'documentos' && <DocumentosCliente clientId={id} clientName={client.name} />}

      {tab === 'historico' && <HistoricoTab clientId={id} />}

      {tab === 'contatos' && (
        <div className="space-y-3">
          {contacts.map(c => (
            <div key={c.id} className="bg-white border border-border rounded-xl p-4 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold px-2.5 py-0.5 bg-gray-100 rounded-full capitalize">{c.channel}</span>
                  <span className="text-xs font-semibold px-2.5 py-0.5 bg-gray-100 rounded-full capitalize">{c.type}</span>
                </div>
                <span className="text-xs text-muted-foreground">{c.contact_date}</span>
              </div>
              {c.message && <p className="text-sm">{c.message}</p>}
              {c.response && <p className="text-xs text-muted-foreground mt-1">Resposta: {c.response}</p>}
            </div>
          ))}
          {contacts.length === 0 && <div className="py-10 text-center text-muted-foreground text-sm">Nenhum contato registrado.</div>}
        </div>
      )}

      {/* Modal de exclusão */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full mx-4">
            <div className="flex items-center justify-center w-12 h-12 bg-red-100 rounded-full mx-auto mb-4">
              <Trash2 className="w-6 h-6 text-red-600" />
            </div>
            <h3 className="text-base font-bold text-center mb-1">Excluir cedente?</h3>
            <p className="text-sm text-muted-foreground text-center mb-5">
              O cadastro de <strong>{client.name}</strong> será excluído permanentemente. Esta ação não pode ser desfeita.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDelete(false)} disabled={deleting}
                className="flex-1 px-4 py-2 text-sm font-medium border border-border rounded-lg hover:bg-gray-50 transition-colors">Cancelar</button>
              <button onClick={handleDelete} disabled={deleting}
                className="flex-1 px-4 py-2 text-sm font-semibold bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors">
                {deleting ? 'Excluindo...' : 'Sim, excluir'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}