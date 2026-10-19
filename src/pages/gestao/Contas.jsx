import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Plus, Pencil, Download, Loader2, Landmark } from 'lucide-react';
import { logAction } from '@/lib/audit';
import ContaFormModal from '@/components/gestao/ContaFormModal';
import { tipoContaLabel } from '@/lib/gestaoInterna';
import { formatCurrency } from '@/lib/finance';

/** Contas e meios de pagamento usados nos lançamentos internos. */
export default function Contas() {
  const [contas, setContas] = useState([]);
  const [bancos, setBancos] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [modalAberto, setModalAberto] = useState(false);
  const [editando, setEditando] = useState(null);
  const [importando, setImportando] = useState(false);
  const [mensagem, setMensagem] = useState(null);

  const carregar = () => {
    setCarregando(true);
    Promise.all([
      base44.entities.ContaInterna.list({ sort: 'nome', limit: 200 }),
      base44.entities.Banco.list({ sort: 'name', limit: 200 }),
    ])
      .then(([cs, bs]) => {
        setContas(cs?.items || []);
        setBancos(bs?.items || []);
        setCarregando(false);
      })
      .catch(() => { setContas([]); setBancos([]); setCarregando(false); });
  };

  useEffect(() => { carregar(); }, []);

  const vinculados = new Set(contas.map(c => c.banco_id).filter(Boolean));
  const bancosSemConta = bancos.filter(b => !vinculados.has(b.id));

  const importarBancos = async () => {
    setImportando(true);
    setMensagem(null);
    try {
      await base44.entities.ContaInterna.bulkCreate(
        bancosSemConta.map(b => ({
          nome: b.name,
          tipo: 'conta_bancaria',
          banco_id: b.id,
          banco_nome: b.name,
          saldo_inicial: 0,
          ativo: true,
        })),
      );
      await logAction({ action: 'create', entity: 'ContaInterna', description: `${bancosSemConta.length} conta(s) bancária(s) vinculada(s) ao módulo Bancos` });
      setMensagem({ tipo: 'ok', texto: 'Contas bancárias vinculadas sem duplicar o cadastro do módulo Bancos.' });
      carregar();
    } catch (e) {
      setMensagem({ tipo: 'erro', texto: e?.message || 'Erro ao importar contas.' });
    }
    setImportando(false);
  };

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-foreground">Contas e Meios de Pagamento</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Conta de pagamento, caixa e cartões. A conta bancária reaproveita o cadastro do módulo Bancos.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {bancosSemConta.length > 0 && (
            <button onClick={importarBancos} disabled={importando} className="flex items-center gap-2 px-3 py-2.5 text-sm font-semibold border border-border rounded-lg hover:bg-gray-50 disabled:opacity-50">
              {importando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              Vincular {bancosSemConta.length} banco(s)
            </button>
          )}
          <button onClick={() => { setEditando(null); setModalAberto(true); }} className="flex items-center gap-2 px-4 py-2.5 bg-foreground text-primary-foreground text-sm font-semibold rounded-lg hover:bg-foreground/90">
            <Plus className="w-4 h-4" /> Nova conta
          </button>
        </div>
      </div>

      {mensagem && (
        <div className={`text-xs rounded-lg px-3 py-2 border ${mensagem.tipo === 'erro' ? 'text-red-700 bg-red-50 border-red-200' : 'text-emerald-700 bg-emerald-50 border-emerald-200'}`}>
          {mensagem.texto}
        </div>
      )}

      <div className="bg-white border border-border rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-gray-50/80">
                <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-left">Conta</th>
                <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-left">Tipo</th>
                <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-left">Banco vinculado</th>
                <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-right">Saldo inicial / Limite</th>
                <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-left">Situação</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {carregando ? (
                <tr><td colSpan={6} className="px-4 py-12 text-center"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground inline" /></td></tr>
              ) : contas.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-12 text-center text-sm text-muted-foreground">Nenhuma conta cadastrada.</td></tr>
              ) : contas.map(c => (
                <tr key={c.id} className={`hover:bg-gray-50/60 transition-colors ${c.ativo === false ? 'opacity-60' : ''}`}>
                  <td className="px-4 py-3 text-xs font-medium">{c.nome}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{tipoContaLabel(c.tipo)}</td>
                  <td className="px-4 py-3 text-xs">
                    {c.banco_nome ? (
                      <span className="inline-flex items-center gap-1 text-emerald-700"><Landmark className="w-3.5 h-3.5" /> {c.banco_nome}</span>
                    ) : '—'}
                  </td>
                  <td className="px-4 py-3 text-xs font-mono text-right">
                    {c.tipo === 'cartao_credito'
                      ? `Limite ${formatCurrency(c.limite || 0)}`
                      : formatCurrency(c.saldo_inicial || 0)}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium border ${c.ativo === false ? 'bg-gray-100 text-gray-500 border-gray-300' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
                      {c.ativo === false ? 'Inativa' : 'Ativa'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end">
                      <button onClick={() => { setEditando(c); setModalAberto(true); }} className="p-1.5 rounded hover:bg-gray-100 text-muted-foreground hover:text-foreground" title="Editar">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-[11px] text-muted-foreground">
        O pagamento efetuado por conta bancária movimenta o saldo do banco no fluxo de caixa central. Uma compra no cartão é registrada como obrigação parcelada — não como saída bancária imediata.
      </p>

      {modalAberto && (
        <ContaFormModal
          open={modalAberto}
          conta={editando}
          bancos={bancos}
          onClose={() => setModalAberto(false)}
          onSaved={carregar}
        />
      )}
    </div>
  );
}