import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Plus, Eye, Edit } from 'lucide-react';
import StatusBadge from '@/components/ui/StatusBadge';
import PageHeader from '@/components/ui/PageHeader';
import FilterBar from '@/components/ui/FilterBar';
import { DataTable, TableHead, Th, TableBody, Tr, Td, EmptyRow } from '@/components/ui/DataTable';

export default function Sacados() {
  const [sacados, setSacados] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  useEffect(() => {
    base44.entities.Sacado.list('-created_date', 300).then(data => {
      setSacados(data);
      setLoading(false);
    });
  }, []);

  const filtered = sacados.filter(s => {
    const matchSearch = !search ||
      s.nome?.toLowerCase().includes(search.toLowerCase()) ||
      s.document?.includes(search);
    const matchStatus = !filterStatus || s.status === filterStatus;
    return matchSearch && matchStatus;
  });

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <PageHeader
        title="Sacados"
        subtitle={`${sacados.length} sacados cadastrados`}
        action={
          <Link to="/sacados/novo" className="inline-flex items-center gap-2 px-4 py-2.5 bg-foreground text-primary-foreground text-sm font-semibold rounded-lg hover:bg-foreground/90 transition-colors shadow-sm">
            <Plus className="w-4 h-4" /> Novo Sacado
          </Link>
        }
      />

      <FilterBar
        search={search}
        onSearch={setSearch}
        placeholder="Buscar por nome ou CPF/CNPJ..."
        filters={[{
          value: filterStatus,
          onChange: setFilterStatus,
          options: [
            { value: '', label: 'Todos os status' },
            { value: 'ativo', label: 'Ativo' },
            { value: 'inativo', label: 'Inativo' },
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
            <Th className="hidden md:table-cell">Telefone</Th>
            <Th className="hidden md:table-cell">Cidade</Th>
            <Th>Origem</Th>
            <Th>Status</Th>
            <Th className="hidden lg:table-cell">Ações</Th>
          </TableHead>
          <TableBody>
            {filtered.map(s => (
              <Tr key={s.id}>
                <Td>
                  <Link to={`/sacados/${s.id}`} className="font-semibold text-foreground hover:text-[hsl(43,65%,47%)] transition-colors">
                    {s.nome}
                  </Link>
                </Td>
                <Td muted className="font-mono text-xs">{s.document}</Td>
                <Td className="hidden md:table-cell">{s.phone || '—'}</Td>
                <Td className="hidden md:table-cell">{[s.city, s.state].filter(Boolean).join(' — ') || '—'}</Td>
                <Td>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${s.origem === 'automatico' ? 'bg-blue-50 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
                    {s.origem === 'automatico' ? 'Auto' : 'Manual'}
                  </span>
                </Td>
                <Td><StatusBadge status={s.status} /></Td>
                <Td className="hidden lg:table-cell">
                  <div className="flex items-center gap-1">
                    <Link to={`/sacados/${s.id}`} className="p-1.5 rounded-md hover:bg-gray-100 text-muted-foreground hover:text-foreground transition-colors">
                      <Eye className="w-3.5 h-3.5" />
                    </Link>
                    <Link to={`/sacados/${s.id}/editar`} className="p-1.5 rounded-md hover:bg-gray-100 text-muted-foreground hover:text-foreground transition-colors">
                      <Edit className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                </Td>
              </Tr>
            ))}
            {filtered.length === 0 && (
              <EmptyRow colSpan={7} message={search ? 'Nenhum sacado encontrado.' : 'Nenhum sacado cadastrado.'} />
            )}
          </TableBody>
        </DataTable>
      )}
    </div>
  );
}