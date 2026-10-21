import { useMemo } from 'react';
import { DollarSign, Download, Hash, Search, TrendingUp } from 'lucide-react';
import { DataTable, TableHead, Th, TableBody, Tr, Td, EmptyRow } from '@/components/ui/DataTable';
import { formatCurrency, formatDate } from '@/lib/finance';
import { exportToCsv } from '@/lib/exportCsv';

const methodLabel = { pix: 'PIX', dinheiro: 'Dinheiro', transferencia: 'Transferência', cheque: 'Cheque', outro: 'Outro' };
const methodStyle = {
  pix: 'bg-blue-50 text-blue-700 border border-blue-100',
  dinheiro: 'bg-green-50 text-green-700 border border-green-100',
  transferencia: 'bg-purple-50 text-purple-700 border border-purple-100',
  cheque: 'bg-amber-50 text-amber-700 border border-amber-100',
};

function MiniStat({ label, value, icon: Icon }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-white">
      <Icon className="w-3.5 h-3.5 text-muted-foreground" />
      <div>
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className="text-sm font-bold">{value}</div>
      </div>
    </div>
  );
}

/**
 * Histórico de eventos de recebimento (entidade `Payment`) — SOMENTE LEITURA.
 * Preserva exatamente a consulta que a antiga tela Pagamentos oferecia.
 */
export default function HistoricoRecebimentos({ payments = [], loading, filtros, onChange }) {
  const filtrados = useMemo(() => {
    return payments.filter((p) => {
      const termo = (filtros.busca || '').toLowerCase();
      const matchBusca = !termo || p.client_name?.toLowerCase().includes(termo) || p.notes?.toLowerCase().includes(termo);
      const matchMethod = !filtros.metodo || p.method === filtros.metodo;
      const data = (p.payment_date || '').slice(0, 10);
      const matchDe = !filtros.de || data >= filtros.de;
      const matchAte = !filtros.ate || data <= filtros.ate;
      return matchBusca && matchMethod && matchDe && matchAte;
    });
  }, [payments, filtros]);

  const total = filtrados.reduce((soma, p) => soma + (p.amount || 0), 0);
  const ticket = filtrados.length > 0 ? total / filtrados.length : 0;

  const exportar = () =>
    exportToCsv(filtrados, [
      { key: 'payment_date', label: 'Data' },
      { key: 'client_name', label: 'Cliente' },
      { key: 'amount', label: 'Valor (R$)' },
      { key: 'method', label: 'Método' },
      { key: 'notes', label: 'Observações' },
    ], 'recebimentos');

  return (
    <div>
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={filtros.busca}
            onChange={(e) => onChange({ ...filtros, busca: e.target.value })}
            placeholder="Buscar por cliente ou observação..."
            className="w-full pl-9 pr-4 py-2.5 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-ring shadow-sm"
          />
        </div>
        <div className="flex-1">
          <input
            type="date"
            value={filtros.de}
            max={filtros.ate || undefined}
            onChange={(e) => onChange({ ...filtros, de: e.target.value })}
            className="input-field"
          />
        </div>
        <div className="flex-1">
          <input
            type="date"
            value={filtros.ate}
            min={filtros.de || undefined}
            onChange={(e) => onChange({ ...filtros, ate: e.target.value })}
            className="input-field"
          />
        </div>
        <select
          value={filtros.metodo}
          onChange={(e) => onChange({ ...filtros, metodo: e.target.value })}
          className="text-sm border border-border rounded-lg px-3 py-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-ring shadow-sm"
        >
          <option value="">Todos os métodos</option>
          {Object.entries(methodLabel).map(([chave, label]) => <option key={chave} value={chave}>{label}</option>)}
        </select>
        <button
          onClick={exportar}
          className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold border border-border rounded-lg hover:bg-gray-50 whitespace-nowrap"
        >
          <Download className="w-3.5 h-3.5" /> Exportar CSV
        </button>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        <MiniStat label="Total recebido" value={formatCurrency(total)} icon={DollarSign} />
        <MiniStat label="Eventos" value={filtrados.length} icon={Hash} />
        <MiniStat label="Ticket médio" value={filtrados.length > 0 ? formatCurrency(ticket) : '—'} icon={TrendingUp} />
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40">
          <div className="w-6 h-6 border-2 border-border border-t-foreground rounded-full animate-spin" />
        </div>
      ) : (
        <DataTable>
          <TableHead>
            <Th>Data</Th>
            <Th>Cliente</Th>
            <Th right>Valor</Th>
            <Th>Método</Th>
            <Th className="hidden lg:table-cell">Observações</Th>
          </TableHead>
          <TableBody>
            {filtrados.map((p) => (
              <Tr key={p.id}>
                <Td muted className="whitespace-nowrap">{formatDate(p.payment_date)}</Td>
                <Td className="font-semibold max-w-[160px] truncate">{p.client_name || '—'}</Td>
                <Td right mono className="font-semibold text-emerald-600 whitespace-nowrap">{formatCurrency(p.amount)}</Td>
                <Td>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap ${methodStyle[p.method] || 'bg-gray-100 text-gray-600'}`}>
                    {methodLabel[p.method] || p.method}
                  </span>
                </Td>
                <Td muted className="text-xs hidden lg:table-cell max-w-[200px] truncate">{p.notes || '—'}</Td>
              </Tr>
            ))}
            {filtrados.length === 0 && <EmptyRow colSpan={5} message="Nenhum recebimento registrado no período." />}
          </TableBody>
        </DataTable>
      )}
    </div>
  );
}