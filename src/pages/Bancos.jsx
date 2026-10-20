import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Plus, ArrowLeftRight, Building2, TrendingUp, TrendingDown, AlertTriangle, Clock, List } from 'lucide-react';
import { formatCurrency } from '@/lib/finance';
import BancoFormModal from '@/components/bancos/BancoFormModal';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import TransferenciaBancosModal from '@/components/bancos/TransferenciaBancosModal';
import BancoListaCompacta from '@/components/bancos/BancoListaCompacta';
import BancoDrawer from '@/components/bancos/BancoDrawer';
import BancosInstituicoes from '@/components/bancos/BancosInstituicoes';
import { fetchAll } from '@/lib/fetchAll';

export default function Bancos() {
  const [tab, setTab] = useState('minhas');
  const [bancos, setBancos] = useState([]);
  const [cheques, setCheques] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState({ open: false, banco: null });
  const [confirm, setConfirm] = useState({ open: false, id: null });
  const [showTransferencia, setShowTransferencia] = useState(false);
  const [selectedBanco, setSelectedBanco] = useState(null);

  const load = async () => {
    const [bks, chqs] = await Promise.all([
      fetchAll('Banco', '-created_date'),
      fetchAll('Cheque'),
    ]);
    setBancos(bks);
    setCheques(chqs);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  // Atualiza banco selecionado quando lista recarrega
  useEffect(() => {
    if (selectedBanco) {
      const updated = bancos.find(b => b.id === selectedBanco.id);
      if (updated) setSelectedBanco(updated);
    }
  }, [bancos]);

  const handleSave = async (data) => {
    if (data.id) await base44.entities.Banco.update(data.id, data);
    else await base44.entities.Banco.create(data);
    setModal({ open: false, banco: null });
    load();
  };

  const handleDelete = async (id) => {
    await base44.entities.Banco.delete(id);
    setConfirm({ open: false, id: null });
    if (selectedBanco?.id === id) setSelectedBanco(null);
    load();
  };

  const activeBancos = bancos.filter(b => b.active !== false);
  const saldoLiquido = activeBancos.reduce((s, b) => s + (b.current_balance || 0), 0);

  // Indicadores globais calculados a partir dos cheques
  const emCompensacao = cheques
    .filter(c => c.status === 'pendente' && c.deposited_bank_id)
    .reduce((s, c) => s + (c.value || 0), 0);
  const emRisco = cheques
    .filter(c => c.status === 'devolvido')
    .reduce((s, c) => s + (c.value || 0), 0);
  const countDevolvidos = cheques.filter(c => c.status === 'devolvido').length;
  const countEmCompensacao = cheques.filter(c => c.status === 'pendente' && c.deposited_bank_id).length;
  // Saldo Total = líquido atual + cheques em compensação (projeção após compensar tudo)
  const totalSaldo = saldoLiquido + emCompensacao;

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-6 h-6 border-2 border-border border-t-foreground rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="flex h-full overflow-hidden">
      {/* Painel principal — largura mínima fixa quando drawer aberto */}
      <div className={`flex flex-col overflow-y-auto ${selectedBanco ? 'w-[320px] shrink-0' : 'flex-1 min-w-0'}`}>
        <div className="p-4 md:p-6 w-full">

          {/* Tabs */}
          <div className="flex gap-0.5 bg-gray-100 rounded-lg p-1 w-fit mb-5">
            <button
              onClick={() => setTab('minhas')}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-md transition-colors ${tab === 'minhas' ? 'bg-white text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
            >
              <Building2 className="w-3.5 h-3.5" /> Minhas Contas
            </button>
            <button
              onClick={() => setTab('lista')}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-md transition-colors ${tab === 'lista' ? 'bg-white text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
            >
              <List className="w-3.5 h-3.5" /> Tabela de Bancos
            </button>
          </div>

          {/* Aba: Tabela de Bancos Brasileiros */}
          {tab === 'lista' && <BancosInstituicoes />}

          {/* Aba: Minhas Contas */}
          {tab === 'minhas' && <>
          {/* Modais */}
          <ConfirmDialog
            open={confirm.open}
            title="Remover Banco"
            message="Tem certeza que deseja remover este banco? Esta ação não pode ser desfeita."
            confirmLabel="Remover"
            variant="danger"
            onConfirm={() => handleDelete(confirm.id)}
            onCancel={() => setConfirm({ open: false, id: null })}
          />
          {modal.open && (
            <BancoFormModal banco={modal.banco} onSave={handleSave} onClose={() => setModal({ open: false, banco: null })} />
          )}
          {showTransferencia && (
            <TransferenciaBancosModal bancos={activeBancos} onClose={() => setShowTransferencia(false)} onSaved={load} />
          )}

          {/* Header */}
          <div className="flex flex-col mb-5 gap-3">
            <div>
              <h1 className="text-xl font-bold">Centro de Controle Bancário</h1>
              <p className="text-xs text-muted-foreground mt-0.5">{activeBancos.length} conta{activeBancos.length !== 1 ? 's' : ''} ativa{activeBancos.length !== 1 ? 's' : ''} · Clique em um banco para detalhes</p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setShowTransferencia(true)}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 border border-border text-xs font-semibold rounded-lg hover:bg-gray-50 transition-colors">
                <ArrowLeftRight className="w-3.5 h-3.5" /> Transferir
              </button>
              <button onClick={() => setModal({ open: true, banco: null })}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-foreground text-primary-foreground text-xs font-semibold rounded-lg hover:bg-foreground/90 transition-colors">
                <Plus className="w-3.5 h-3.5" /> Novo Banco
              </button>
            </div>
          </div>

          {/* KPIs — ocultos quando drawer estiver aberto */}
          {!selectedBanco && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
              <div className="bg-foreground text-primary-foreground rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Building2 className="w-4 h-4 opacity-60" />
                  <span className="text-xs font-medium opacity-70">Saldo Total</span>
                </div>
                <div className="text-xl font-bold">{formatCurrency(totalSaldo)}</div>
                <div className="text-xs opacity-50 mt-0.5">{activeBancos.length} contas</div>
              </div>

              <div className="bg-white border border-border rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp className="w-4 h-4 text-emerald-500" />
                  <span className="text-xs font-medium text-muted-foreground">Disponível</span>
                </div>
                <div className="text-xl font-bold text-emerald-700">{formatCurrency(saldoLiquido)}</div>
                <div className="text-xs text-muted-foreground mt-0.5">saldo líquido atual</div>
              </div>

              <div className="bg-white border border-border rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Clock className="w-4 h-4 text-amber-500" />
                  <span className="text-xs font-medium text-muted-foreground">Em Compensação</span>
                </div>
                <div className="text-xl font-bold text-amber-700">{formatCurrency(emCompensacao)}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{countEmCompensacao} cheque{countEmCompensacao !== 1 ? 's' : ''}</div>
              </div>

              <div className={`rounded-xl p-4 border ${countDevolvidos > 0 ? 'bg-red-50 border-red-200' : 'bg-white border-border'}`}>
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className={`w-4 h-4 ${countDevolvidos > 0 ? 'text-red-500' : 'text-muted-foreground'}`} />
                  <span className={`text-xs font-medium ${countDevolvidos > 0 ? 'text-red-700' : 'text-muted-foreground'}`}>Em Risco</span>
                </div>
                <div className={`text-xl font-bold ${countDevolvidos > 0 ? 'text-red-700' : 'text-foreground'}`}>{formatCurrency(emRisco)}</div>
                <div className={`text-xs mt-0.5 ${countDevolvidos > 0 ? 'text-red-600' : 'text-muted-foreground'}`}>{countDevolvidos} cheque{countDevolvidos !== 1 ? 's' : ''} devolvido{countDevolvidos !== 1 ? 's' : ''}</div>
              </div>
            </div>
          )}

          {/* Lista de bancos */}
          <BancoListaCompacta
            bancos={bancos}
            cheques={cheques}
            selectedBancoId={selectedBanco?.id}
            onSelect={setSelectedBanco}
            onEdit={(banco) => setModal({ open: true, banco })}
            onDelete={(id) => setConfirm({ open: true, id })}
            compact={!!selectedBanco}
          />
          </>}
        </div>
      </div>

      {/* Drawer lateral do banco */}
      {selectedBanco && (
        <BancoDrawer
          banco={selectedBanco}
          cheques={cheques}
          onClose={() => setSelectedBanco(null)}
          onEdit={() => setModal({ open: true, banco: selectedBanco })}
          onDelete={() => setConfirm({ open: true, id: selectedBanco.id })}
          onReload={load}
        />
      )}
    </div>
  );
}