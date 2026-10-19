import { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { formatCurrency, formatDate, today, daysBetween } from '@/lib/finance';
import { calcSaldoCorrigido } from '@/lib/limiteRotativo';
import { DataTable, TableHead, Th, TableBody, Tr, Td, EmptyRow } from '@/components/ui/DataTable';
import { RefreshCw, Calendar, Plus, Landmark, Wallet, RotateCw } from 'lucide-react';
import NovoLimiteRotativoModal from './NovoLimiteRotativoModal';
import AdicionarLimiteModal from './AdicionarLimiteModal';
import RegistrarRepasseModal from './RegistrarRepasseModal';
import RegistrarPagamentoModal from './RegistrarPagamentoModal';

export default function LimiteRotativoPanel({ client }) {
  const [limite, setLimite] = useState(null);
  const [repasses, setRepasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refDate, setRefDate] = useState(today());
  const [showNovo, setShowNovo] = useState(false);
  const [showAdicionar, setShowAdicionar] = useState(false);
  const [showRepasse, setShowRepasse] = useState(false);
  const [showPagamento, setShowPagamento] = useState(false);

  const loadData = useCallback(async () => {
    const limites = await base44.entities.LimiteRotativo.filter(
      { client_id: client.id, status: 'ativo' }, '-created_date', 5
    );
    const ativo = limites[0] || null;
    setLimite(ativo);
    if (ativo) {
      const reps = await base44.entities.RepasseLimiteRotativo.filter(
        { limite_id: ativo.id }, 'data_emissao', 200
      );
      setRepasses(reps);
    } else {
      setRepasses([]);
    }
    setLoading(false);
  }, [client.id]);

  useEffect(() => { loadData(); }, [loadData]);

  const refresh = () => { setLoading(true); loadData(); };

  if (loading) return (
    <div className="flex items-center justify-center h-24">
      <div className="w-6 h-6 border-2 border-border border-t-foreground rounded-full animate-spin" />
    </div>
  );

  if (!limite) {
    return (
      <div className="bg-white border border-border rounded-xl p-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <RotateCw className="w-4 h-4 text-muted-foreground" /> Limite Rotativo
            </h3>
            <p className="text-xs text-muted-foreground mt-1">Nenhum limite rotativo ativo para este cliente.</p>
          </div>
          <button onClick={() => setShowNovo(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-foreground text-primary-foreground text-xs font-semibold rounded-lg hover:bg-foreground/90">
            <Plus className="w-3.5 h-3.5" /> Novo Limite Rotativo
          </button>
        </div>
        {showNovo && (
          <NovoLimiteRotativoModal client={client} onClose={() => setShowNovo(false)} onSaved={refresh} />
        )}
      </div>
    );
  }

  const totalRecebido = repasses.reduce((s, r) => s + (r.valor_liquido || 0), 0);
  const saldoRemanescente = Math.max(0, (limite.valor_bruto || 0) - totalRecebido);
  const diasDesdeInicio = daysBetween(limite.data_inicio, refDate);
  const saldoCorrigido = calcSaldoCorrigido(saldoRemanescente, limite.taxa_mensal, diasDesdeInicio);
  const quitado = saldoRemanescente <= 0.01;

  return (
    <div className="space-y-4">
      {/* Card de destaque */}
      <div className="bg-gradient-to-br from-foreground to-foreground/90 text-primary-foreground rounded-xl p-5">
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="text-xs font-medium uppercase tracking-wider text-primary-foreground/60 mb-1">Limite Rotativo Ativo</div>
            <div className="text-sm font-semibold">{client.name}</div>
          </div>
          <button onClick={refresh} className="text-primary-foreground/60 hover:text-primary-foreground">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <div className="text-xs text-primary-foreground/60 uppercase tracking-wider mb-1">Taxa</div>
            <div className="text-lg font-bold">{limite.taxa_mensal}% <span className="text-xs font-normal text-primary-foreground/60">a.m.</span></div>
          </div>
          <div>
            <div className="text-xs text-primary-foreground/60 uppercase tracking-wider mb-1">Total Adiantado</div>
            <div className="text-lg font-bold">{formatCurrency(limite.valor_bruto)}</div>
          </div>
          <div>
            <div className="text-xs text-primary-foreground/60 uppercase tracking-wider mb-1">Total Recebido</div>
            <div className="text-lg font-bold text-emerald-300">{formatCurrency(totalRecebido)}</div>
          </div>
          <div>
            <div className="flex items-center gap-1 text-xs text-primary-foreground/60 uppercase tracking-wider mb-1">
              <Calendar className="w-3 h-3" /> Saldo Corrigido
            </div>
            <div className="text-lg font-bold text-amber-300">{formatCurrency(saldoCorrigido)}</div>
          </div>
        </div>
        <div className="flex items-center gap-3 mt-4 pt-4 border-t border-primary-foreground/15">
          <label className="text-xs text-primary-foreground/60">Data de referência:</label>
          <input type="date" value={refDate} onChange={e => setRefDate(e.target.value)}
            className="px-2 py-1 text-xs bg-primary-foreground/10 border border-primary-foreground/20 rounded-lg text-primary-foreground [color-scheme:dark]" />
          <span className="text-xs text-primary-foreground/50">{diasDesdeInicio} dias desde o início</span>
        </div>
      </div>

      {/* Ações */}
      <div className="flex flex-wrap gap-2">
        <button onClick={() => setShowAdicionar(true)}
          className="flex items-center gap-1.5 px-4 py-2 bg-foreground text-primary-foreground text-xs font-semibold rounded-lg hover:bg-foreground/90">
          <Plus className="w-3.5 h-3.5" /> Adicionar Limite
        </button>
        <button onClick={() => setShowRepasse(true)} disabled={quitado}
          className="flex items-center gap-1.5 px-4 py-2 border border-amber-200 text-amber-700 bg-amber-50 text-xs font-semibold rounded-lg hover:bg-amber-100 disabled:opacity-50">
          <Landmark className="w-3.5 h-3.5" /> Registrar Repasse (Cheque)
        </button>
        <button onClick={() => setShowPagamento(true)} disabled={quitado}
          className="flex items-center gap-1.5 px-4 py-2 border border-emerald-200 text-emerald-700 bg-emerald-50 text-xs font-semibold rounded-lg hover:bg-emerald-100 disabled:opacity-50">
          <Wallet className="w-3.5 h-3.5" /> Registrar Pagamento (PIX/Dinheiro)
        </button>
      </div>

      {/* Resumo rápido */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white border border-border rounded-lg px-4 py-3">
          <div className="text-xs text-muted-foreground">Saldo Remanescente</div>
          <div className="text-sm font-bold text-foreground">{formatCurrency(saldoRemanescente)}</div>
        </div>
        <div className="bg-white border border-border rounded-lg px-4 py-3">
          <div className="text-xs text-muted-foreground">Repasses</div>
          <div className="text-sm font-bold text-foreground">{repasses.length}</div>
        </div>
        <div className="bg-white border border-border rounded-lg px-4 py-3">
          <div className="text-xs text-muted-foreground">Status</div>
          <div className={`text-sm font-bold ${quitado ? 'text-emerald-600' : 'text-amber-600'}`}>
            {quitado ? 'Quitado' : 'Ativo'}
          </div>
        </div>
      </div>

      {/* Tabela de repasses */}
      <DataTable>
        <TableHead>
          <Th>Hoje (Emissão)</Th>
          <Th>Vencimento</Th>
          <Th>Tipo</Th>
          <Th right>Valor Bruto</Th>
          <Th right>Valor Líquido</Th>
          <Th right>Dias</Th>
        </TableHead>
        <TableBody>
          {repasses.map(r => (
            <Tr key={r.id}>
              <Td muted>{formatDate(r.data_emissao)}</Td>
              <Td muted>{r.data_vencimento ? formatDate(r.data_vencimento) : '—'}</Td>
              <Td><span className="text-xs font-medium px-2 py-0.5 bg-gray-100 rounded-full capitalize">{r.tipo}</span></Td>
              <Td right mono>{formatCurrency(r.valor_bruto)}</Td>
              <Td right mono className="text-emerald-600 font-semibold">{formatCurrency(r.valor_liquido)}</Td>
              <Td right muted>{r.dias_calculados || '—'}</Td>
            </Tr>
          ))}
          {repasses.length === 0 && <EmptyRow colSpan={6} message="Nenhum repasse registrado ainda." />}
        </TableBody>
      </DataTable>

      {showNovo && <NovoLimiteRotativoModal client={client} onClose={() => setShowNovo(false)} onSaved={refresh} />}
      {showAdicionar && <AdicionarLimiteModal limite={limite} client={client} onClose={() => setShowAdicionar(false)} onSaved={refresh} />}
      {showRepasse && <RegistrarRepasseModal limite={limite} client={client} onClose={() => setShowRepasse(false)} onSaved={refresh} />}
      {showPagamento && <RegistrarPagamentoModal limite={limite} client={client} onClose={() => setShowPagamento(false)} onSaved={refresh} />}
    </div>
  );
}