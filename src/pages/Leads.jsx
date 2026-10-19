import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { UserPlus, Unlink, ExternalLink, MessageCircle, Search } from 'lucide-react';
import StatusBadge from '@/components/ui/StatusBadge';
import PageHeader from '@/components/ui/PageHeader';
import { DataTable, TableHead, Th, TableBody, Tr, Td, EmptyRow } from '@/components/ui/DataTable';
import { formatDate } from '@/lib/finance';
import LinkClientModal from '@/components/leads/LinkClientModal';

const statusLabels = {
  novo: 'Novo',
  contatado: 'Contatado',
  qualificado: 'Qualificado',
  convertido: 'Convertido',
  descartado: 'Descartado',
};

export default function Leads() {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [linkingLead, setLinkingLead] = useState(null);

  const load = () => {
    base44.entities.Lead.list('-created_date', 200).then(data => {
      setLeads(data);
      setLoading(false);
    });
  };

  useEffect(() => { load(); }, []);

  const handleLinkClient = async (client) => {
    if (!linkingLead) return;
    await base44.entities.Lead.update(linkingLead.id, {
      linked_client_id: client.id,
      linked_client_name: client.name,
      status: 'convertido',
    });
    setLinkingLead(null);
    load();
  };

  const handleUnlink = async (lead) => {
    await base44.entities.Lead.update(lead.id, {
      linked_client_id: '',
      linked_client_name: '',
    });
    load();
  };

  const handleChangeStatus = async (lead, newStatus) => {
    await base44.entities.Lead.update(lead.id, { status: newStatus });
    load();
  };

  const waLink = (phone) => {
    const num = phone?.replace(/\D/g, '');
    return num ? `https://wa.me/55${num}` : null;
  };

  const filtered = leads.filter(l => {
    const matchSearch = !search ||
      l.name?.toLowerCase().includes(search.toLowerCase()) ||
      l.email?.toLowerCase().includes(search.toLowerCase()) ||
      l.document?.includes(search) ||
      l.phone?.includes(search);
    const matchStatus = !filterStatus || l.status === filterStatus;
    return matchSearch && matchStatus;
  });

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      {linkingLead && (
        <LinkClientModal
          onSelect={handleLinkClient}
          onClose={() => setLinkingLead(null)}
        />
      )}

      <PageHeader
        title="Leads"
        subtitle={`${leads.length} leads recebidos do site`}
      />

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            className="input-field pl-9"
            placeholder="Buscar por nome, e-mail, telefone ou CPF..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select
          className="input-field w-full sm:w-44"
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
        >
          <option value="">Todos os status</option>
          {Object.entries(statusLabels).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="w-6 h-6 border-2 border-border border-t-foreground rounded-full animate-spin" />
        </div>
      ) : (
        <DataTable>
          <TableHead>
            <Th>Nome</Th>
            <Th>Contato</Th>
            <Th className="hidden md:table-cell">Interesse</Th>
            <Th className="hidden lg:table-cell">Data</Th>
            <Th>Status</Th>
            <Th>Cliente</Th>
            <Th className="hidden lg:table-cell">Ações</Th>
          </TableHead>
          <TableBody>
            {filtered.map(l => (
              <Tr key={l.id}>
                <Td>
                  <div className="font-semibold">{l.name}</div>
                  {l.document && (
                    <div className="text-xs text-muted-foreground font-mono">{l.document}</div>
                  )}
                </Td>
                <Td>
                  <div className="text-xs">
                    {l.email && <div className="text-blue-600">{l.email}</div>}
                    {l.phone && (
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span>{l.phone}</span>
                        {waLink(l.phone) && (
                          <a href={waLink(l.phone)} target="_blank" rel="noreferrer"
                            className="text-emerald-600 hover:text-emerald-700">
                            <MessageCircle className="w-3.5 h-3.5" />
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                </Td>
                <Td muted className="hidden md:table-cell text-xs">{l.interest || '—'}</Td>
                <Td muted className="hidden lg:table-cell text-xs">{formatDate(l.created_date)}</Td>
                <Td>
                  <select
                    className="text-xs border border-border rounded-md px-2 py-1 bg-white"
                    value={l.status}
                    onChange={e => handleChangeStatus(l, e.target.value)}
                  >
                    {Object.entries(statusLabels).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </Td>
                <Td>
                  {l.linked_client_id ? (
                    <div className="flex items-center gap-1.5">
                      <Link
                        to={`/clientes/${l.linked_client_id}`}
                        className="text-xs font-medium text-[hsl(43,65%,47%)] hover:underline flex items-center gap-1"
                      >
                        {l.linked_client_name} <ExternalLink className="w-3 h-3" />
                      </Link>
                      <button
                        onClick={() => handleUnlink(l)}
                        className="p-1 rounded hover:bg-red-50 text-muted-foreground hover:text-red-500 transition-colors"
                        title="Desvincular"
                      >
                        <Unlink className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setLinkingLead(l)}
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 px-2.5 py-1.5 rounded-lg transition-colors"
                    >
                      <UserPlus className="w-3.5 h-3.5" /> Vincular
                    </button>
                  )}
                </Td>
                <Td className="hidden lg:table-cell">
                  {l.source && (
                    <span className="text-xs text-muted-foreground bg-gray-100 px-2 py-0.5 rounded">
                      {l.source}
                    </span>
                  )}
                </Td>
              </Tr>
            ))}
            {filtered.length === 0 && (
              <EmptyRow colSpan={7} message={search ? 'Nenhum lead encontrado.' : 'Nenhum lead recebido ainda.'} />
            )}
          </TableBody>
        </DataTable>
      )}
    </div>
  );
}