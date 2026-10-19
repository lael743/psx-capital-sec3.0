import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Plus, MessageCircle, Eye, Edit } from 'lucide-react';
import StatusBadge from '@/components/ui/StatusBadge';
import { formatCurrency } from '@/lib/finance';
import PageHeader from '@/components/ui/PageHeader';
import FilterBar from '@/components/ui/FilterBar';
import { DataTable, TableHead, Th, TableBody, Tr, Td, EmptyRow } from '@/components/ui/DataTable';
import { fetchAll } from '@/lib/fetchAll';

export default function Clientes() {
  const [clients, setClients] = useState([]);
  const [usedLimitMap, setUsedLimitMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  useEffect(() => {
    Promise.all([
      fetchAll('Client'),
      fetchAll('Operation'),
    ]).then(([data, ops]) => {
      setClients(data);
      // Soma o saldo devedor de operações ativas (não quitadas) por cliente
      const map = {};
      ops.forEach(op => {
        if (op.status !== 'quitado' && op.client_id) {
          map[op.client_id] = (map[op.client_id] || 0) + (op.balance_due || 0);
        }
      });
      setUsedLimitMap(map);
      setLoading(false);
    });
  }, []);

  const filtered = clients.filter(c => {
    const matchSearch = !search ||
      c.name?.toLowerCase().includes(search.toLowerCase()) ||
      c.document?.includes(search) ||
      c.phone?.includes(search);
    const matchStatus = !filterStatus || c.status === filterStatus;
    return matchSearch && matchStatus;
  });

  const waLink = (whatsapp) => `https://wa.me/55${whatsapp?.replace(/\D/g, '')}`;

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <PageHeader
        title="Cedentes"
        subtitle={`${clients.length} cedentes cadastrados`}
        action={
          <Link to="/clientes/novo" className="inline-flex items-center gap-2 px-4 py-2.5 bg-foreground text-primary-foreground text-sm font-semibold rounded-lg hover:bg-foreground/90 transition-colors shadow-sm">
            <Plus className="w-4 h-4" /> Novo Cedente
          </Link>
        }
      />

      <FilterBar
        search={search}
        onSearch={setSearch}
        placeholder="Buscar cedente por nome, CPF/CNPJ ou telefone..."
        filters={[{
          value: filterStatus,
          onChange: setFilterStatus,
          options: [
            { value: '', label: 'Todos os status' },
            { value: 'ativo', label: 'Ativo' },
            { value: 'bloqueado', label: 'Bloqueado' },
            { value: 'risco', label: 'Risco' },
          ],
        }]}
      />

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="w-6 h-6 border-2 border-border border-t-foreground rounded-full animate-spin" />
        </div>
      ) : (
        <DataTable>
          <TableHead>
            <Th>Nome</Th>
            <Th>CPF/CNPJ</Th>
            <Th className="hidden md:table-cell">WhatsApp</Th>
            <Th right className="hidden lg:table-cell">Limite Restante</Th>
            <Th right className="hidden lg:table-cell">Taxa Padrão</Th>
            <Th>Risco</Th>
            <Th>Status</Th>
            <Th className="hidden lg:table-cell">Ações</Th>
          </TableHead>
          <TableBody>
            {filtered.map(c => (
              <Tr key={c.id}>
                <Td>
                  <Link to={`/clientes/${c.id}`} className="font-semibold text-foreground hover:text-[hsl(43,65%,47%)] transition-colors">
                    {c.name}
                  </Link>
                </Td>
                <Td muted className="font-mono text-xs">{c.document}</Td>
                <Td className="hidden md:table-cell">
                  {c.whatsapp ? (
                    <a href={waLink(c.whatsapp)} target="_blank" rel="noreferrer"
                      className="inline-flex items-center gap-1.5 text-emerald-600 hover:text-emerald-700">
                      <MessageCircle className="w-3.5 h-3.5" />
                      <span className="text-xs">{c.whatsapp}</span>
                    </a>
                  ) : <span className="text-muted-foreground">—</span>}
                </Td>
                <Td right mono className="hidden lg:table-cell">
                  {c.credit_limit ? (() => {
                    const used = usedLimitMap[c.id] || 0;
                    const remaining = (c.credit_limit || 0) - used;
                    const pct = c.credit_limit > 0 ? Math.min(100, (used / c.credit_limit) * 100) : 0;
                    const color = remaining <= 0 ? 'text-red-600' : pct >= 80 ? 'text-amber-600' : 'text-emerald-600';
                    return (
                      <div className="text-right">
                        <div className={`font-semibold ${color}`}>{formatCurrency(Math.max(0, remaining))}</div>
                        <div className="text-xs text-muted-foreground">de {formatCurrency(c.credit_limit)}</div>
                      </div>
                    );
                  })() : <span className="text-muted-foreground">—</span>}
                </Td>
                <Td right className="hidden lg:table-cell font-semibold text-[hsl(43,65%,47%)]">
                  {c.default_rate ? `${c.default_rate}%` : '—'}
                </Td>
                <Td><StatusBadge status={c.risk_profile} /></Td>
                <Td><StatusBadge status={c.status} /></Td>
                <Td className="hidden lg:table-cell">
                  <div className="flex items-center gap-1">
                    <Link to={`/clientes/${c.id}`} className="p-1.5 rounded-md hover:bg-gray-100 text-muted-foreground hover:text-foreground transition-colors">
                      <Eye className="w-3.5 h-3.5" />
                    </Link>
                    <Link to={`/clientes/${c.id}/editar`} className="p-1.5 rounded-md hover:bg-gray-100 text-muted-foreground hover:text-foreground transition-colors">
                      <Edit className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                </Td>
              </Tr>
            ))}
            {filtered.length === 0 && (
              <EmptyRow colSpan={8} message={search ? 'Nenhum cedente encontrado.' : 'Nenhum cedente cadastrado.'} />
            )}
          </TableBody>
        </DataTable>
      )}
    </div>
  );
}