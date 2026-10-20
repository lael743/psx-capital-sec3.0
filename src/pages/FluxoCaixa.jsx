import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { formatCurrency, formatDate, today } from '@/lib/finance';
import { Plus, TrendingUp, TrendingDown, DollarSign, X, Download } from 'lucide-react';
import { logAction } from '@/lib/audit';
import PageHeader from '@/components/ui/PageHeader';
import StatCard from '@/components/ui/StatCard';
import { DataTable, TableHead, Th, TableBody, Tr, Td, EmptyRow } from '@/components/ui/DataTable';
import { exportToCsv } from '@/lib/exportCsv';
import { fetchAll } from '@/lib/fetchAll';

export default function FluxoCaixa() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [form, setForm] = useState({ type: 'entrada', category: '', amount: '', date: today(), description: '', method: 'pix' });

  const load = () => {
    fetchAll('CashFlow', '-date').then(data => {
      setEntries(data);
      setLoading(false);
    });
  };

  useEffect(() => { load(); }, []);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const save = async () => {
    setSaving(true);
    const totalEntradas = entries.filter(e => e.type === 'entrada').reduce((s, e) => s + (e.amount || 0), 0);
    const totalSaidas = entries.filter(e => e.type === 'saida').reduce((s, e) => s + (e.amount || 0), 0);
    const currentBalance = totalEntradas - totalSaidas;
    const newBalance = form.type === 'entrada' ? currentBalance + parseFloat(form.amount) : currentBalance - parseFloat(form.amount);
    const created = await base44.entities.CashFlow.create({ ...form, amount: parseFloat(form.amount), balance_after: newBalance });
    await logAction({
      action: 'create',
      entity: 'CashFlow',
      entityId: created.id,
      description: `Lançamento de ${form.type === 'entrada' ? 'entrada' : 'saída'}: ${form.description} — R$ ${parseFloat(form.amount).toFixed(2)} via ${form.method}`,
      after: { tipo: form.type, valor: parseFloat(form.amount), descricao: form.description, metodo: form.method, data: form.date },
    });
    setForm({ type: 'entrada', category: '', amount: '', date: today(), description: '', method: 'pix' });
    setShowForm(false);
    setSaving(false);
    load();
  };

  const filteredEntries = entries.filter(e => {
    const entryDate = (e.date || '').slice(0, 10);
    return (!dateFrom || entryDate >= dateFrom) && (!dateTo || entryDate <= dateTo);
  });
  const totalEntradas = filteredEntries.filter(e => e.type === 'entrada').reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const totalSaidas = filteredEntries.filter(e => e.type === 'saida').reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const saldoPeriodo = totalEntradas - totalSaidas;
  const saldoAtual = entries.reduce((balance, entry) => balance + (entry.type === 'entrada' ? 1 : -1) * (Number(entry.amount) || 0), 0);

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <PageHeader
        title="Fluxo de Caixa"
        subtitle="Entradas e saídas financeiras"
        action={
          <div className="flex items-center gap-2">
            <button
              onClick={() => exportToCsv(filteredEntries, [
                { key: 'date', label: 'Data' },
                { key: 'description', label: 'Descrição' },
                { key: 'category', label: 'Categoria' },
                { key: 'type', label: 'Tipo' },
                { key: 'amount', label: 'Valor (R$)' },
                { key: 'method', label: 'Método' },
                { key: 'balance_after', label: 'Saldo Após' },
              ], 'fluxo_caixa')}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border border-border rounded-lg hover:bg-gray-50"
            >
              <Download className="w-3.5 h-3.5" /> CSV
            </button>
            <button
              onClick={() => setShowForm(v => !v)}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-foreground text-primary-foreground text-sm font-semibold rounded-lg hover:bg-foreground/90 shadow-sm transition-colors"
            >
              {showForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
              {showForm ? 'Cancelar' : 'Novo Lançamento'}
            </button>
          </div>
        }
      />

      <div className="flex flex-col sm:flex-row sm:items-end gap-3 mb-5 p-4 bg-white border border-border rounded-xl">
        <div className="flex-1">
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">Data inicial</label>
          <input type="date" value={dateFrom} max={dateTo || undefined} onChange={e => setDateFrom(e.target.value)} className="w-full input-field" />
        </div>
        <div className="flex-1">
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">Data final</label>
          <input type="date" value={dateTo} min={dateFrom || undefined} onChange={e => setDateTo(e.target.value)} className="w-full input-field" />
        </div>
        <button onClick={() => { setDateFrom(''); setDateTo(''); }} className="px-3 py-2.5 text-sm border border-border rounded-lg hover:bg-gray-50">Limpar período</button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Entradas no Período" value={formatCurrency(totalEntradas)} icon={TrendingUp} />
        <StatCard label="Saídas no Período" value={formatCurrency(totalSaidas)} icon={TrendingDown} variant="danger" />
        <StatCard label="Saldo do Período" value={formatCurrency(saldoPeriodo)} icon={DollarSign} variant={saldoPeriodo >= 0 ? 'gold' : 'danger'} />
        <StatCard label="Saldo acumulado" value={formatCurrency(saldoAtual)} sub="Entradas menos saídas registradas" icon={DollarSign} variant={saldoAtual >= 0 ? 'gold' : 'danger'} />
      </div>

      {showForm && (
        <div className="bg-white border border-border rounded-xl p-6 mb-6 shadow-sm space-y-4">
          <h3 className="text-sm font-semibold">Novo Lançamento</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Tipo *</label>
              <select className="input-field" value={form.type} onChange={e => set('type', e.target.value)}>
                <option value="entrada">Entrada</option>
                <option value="saida">Saída</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Valor (R$) *</label>
              <input className="input-field" type="number" step="0.01" value={form.amount} onChange={e => set('amount', e.target.value)} placeholder="0,00" />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Data *</label>
              <input className="input-field" type="date" value={form.date} onChange={e => set('date', e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Categoria</label>
              <input className="input-field" value={form.category} onChange={e => set('category', e.target.value)} placeholder="Ex: Empréstimo, Aluguel..." />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Método</label>
              <select className="input-field" value={form.method} onChange={e => set('method', e.target.value)}>
                <option value="pix">PIX</option>
                <option value="dinheiro">Dinheiro</option>
                <option value="transferencia">Transferência</option>
                <option value="cheque">Cheque</option>
                <option value="outro">Outro</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Descrição *</label>
              <input className="input-field" value={form.description} onChange={e => set('description', e.target.value)} placeholder="Descrição do lançamento" />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2 border-t border-border">
            <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-gray-50">Cancelar</button>
            <button onClick={save} disabled={saving || !form.amount || !form.description}
              className="px-5 py-2 bg-foreground text-primary-foreground text-sm font-semibold rounded-lg disabled:opacity-50">
              {saving ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="w-6 h-6 border-2 border-border border-t-foreground rounded-full animate-spin" />
        </div>
      ) : (
        <DataTable>
          <TableHead>
            <Th>Data</Th>
            <Th>Descrição</Th>
            <Th className="hidden md:table-cell">Categoria</Th>
            <Th className="hidden lg:table-cell">Método</Th>
            <Th right>Valor</Th>
            <Th right className="hidden sm:table-cell">Saldo</Th>
          </TableHead>
          <TableBody>
            {filteredEntries.map(e => (
              <Tr key={e.id}>
                <Td muted className="whitespace-nowrap">{formatDate(e.date)}</Td>
                <Td className="font-medium max-w-[180px] truncate">{e.description}</Td>
                <Td muted className="hidden md:table-cell max-w-[120px] truncate">{e.category || '—'}</Td>
                <Td muted className="hidden lg:table-cell">
                  <span className="text-xs bg-gray-100 px-2 py-0.5 rounded-full capitalize">{e.method}</span>
                </Td>
                <Td right mono className={`font-semibold whitespace-nowrap ${e.type === 'entrada' ? 'text-emerald-600' : 'text-red-600'}`}>
                  {e.type === 'entrada' ? '+' : '−'}{formatCurrency(e.amount)}
                </Td>
                <Td right mono muted className="hidden sm:table-cell whitespace-nowrap">{e.balance_after !== undefined ? formatCurrency(e.balance_after) : '—'}</Td>
              </Tr>
            ))}
            {filteredEntries.length === 0 && <EmptyRow colSpan={6} message="Nenhum lançamento encontrado neste período." />}
          </TableBody>
        </DataTable>
      )}
    </div>
  );
}