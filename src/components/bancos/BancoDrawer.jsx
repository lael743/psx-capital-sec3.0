import { useState } from 'react';
import { X, Pencil, Trash2, ArrowUpRight, ArrowDownLeft, CreditCard, BarChart3, CheckSquare, Settings, AlignLeft, PlusCircle, Maximize2, Minimize2 } from 'lucide-react';
import { formatCurrency } from '@/lib/finance';
import BancoExtratoTab from '@/components/bancos/BancoExtratoTab';
import BancoChequeTab from '@/components/bancos/BancoChequeTab';
import BancoVisaoGeral from '@/components/bancos/BancoVisaoGeral';
import BancoConciliacao from '@/components/bancos/BancoConciliacao';
import BancoConfiguracoes from '@/components/bancos/BancoConfiguracoes';
import LancamentoAvulsoModal from '@/components/bancos/LancamentoAvulsoModal';

const TABS = [
  { key: 'visao_geral', label: 'Visão Geral', Icon: BarChart3 },
  { key: 'movimentacoes', label: 'Movimentações', Icon: AlignLeft },
  { key: 'cheques', label: 'Cheques', Icon: CheckSquare },
  { key: 'conciliacao', label: 'Conciliação', Icon: CreditCard },
  { key: 'configuracoes', label: 'Configurações', Icon: Settings },
];

export default function BancoDrawer({ banco, cheques, onClose, onEdit, onDelete, onReload }) {
  const [tab, setTab] = useState('visao_geral');
  const [showLancamento, setShowLancamento] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  const bancoCheques = cheques.filter(c =>
    c.deposited_bank_id === banco.id || c.deposited_bank_name === banco.name
  );
  const pendentes = bancoCheques.filter(c => c.status === 'pendente');
  const compensados = bancoCheques.filter(c => c.status === 'compensado');
  const devolvidos = bancoCheques.filter(c => c.status === 'devolvido');

  return (
    /* Drawer: modo normal = flex-1 ao lado da lista; fullscreen = overlay fixo */
    <div className={fullscreen
      ? "fixed inset-0 z-50 bg-white flex flex-col overflow-hidden shadow-2xl"
      : "flex-1 min-w-0 border-l border-border bg-white flex flex-col h-full overflow-hidden shadow-xl"
    }>

      {showLancamento && (
        <LancamentoAvulsoModal
          banco={banco}
          onClose={() => setShowLancamento(false)}
          onSaved={onReload}
        />
      )}

      {/* ── CABEÇALHO FIXO ── */}
      <div className="shrink-0 bg-white border-b border-border">

        {/* Linha do título */}
        <div className="flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="w-11 h-11 rounded-xl flex items-center justify-center text-white text-sm font-bold shrink-0 shadow-sm"
              style={{ backgroundColor: banco.color || 'hsl(0 0% 15%)' }}
            >
              {banco.name?.slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="font-bold text-lg leading-tight truncate">{banco.name}</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {[
                  banco.bank_code && `Cód. ${banco.bank_code}`,
                  banco.agency && `Ag. ${banco.agency}`,
                  banco.account && `Cc. ${banco.account}`,
                ].filter(Boolean).join(' · ') || 'Sem dados de conta'}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button onClick={() => setFullscreen(v => !v)} title={fullscreen ? 'Minimizar' : 'Expandir tela cheia'}
              className="p-2 rounded-lg hover:bg-gray-100 text-muted-foreground hover:text-foreground transition-colors">
              {fullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
            <button onClick={() => setShowLancamento(true)} title="Lançamento avulso"
              className="p-2 rounded-lg hover:bg-amber-50 text-muted-foreground hover:text-amber-600 transition-colors">
              <PlusCircle className="w-4 h-4" />
            </button>
            <button onClick={onEdit} title="Editar"
              className="p-2 rounded-lg hover:bg-gray-100 text-muted-foreground hover:text-foreground transition-colors">
              <Pencil className="w-4 h-4" />
            </button>
            <button onClick={onDelete} title="Remover"
              className="p-2 rounded-lg hover:bg-red-50 text-muted-foreground hover:text-red-500 transition-colors">
              <Trash2 className="w-4 h-4" />
            </button>
            <button onClick={onClose} title="Fechar"
              className="p-2 rounded-lg hover:bg-gray-100 text-muted-foreground hover:text-foreground transition-colors ml-1">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* KPIs do banco */}
        <div className="grid grid-cols-4 gap-0 border-t border-border divide-x divide-border">
          <div className="px-5 py-3">
            <div className="text-xs font-medium text-muted-foreground mb-1">Saldo</div>
            <div className={`text-lg font-bold leading-tight ${(banco.current_balance || 0) < 0 ? 'text-red-600' : 'text-foreground'}`}>
              {formatCurrency(banco.current_balance || 0)}
            </div>
          </div>
          <div className="px-5 py-3 bg-amber-50/60">
            <div className="text-xs font-medium text-amber-600 mb-1">Aguardando</div>
            <div className="text-lg font-bold text-amber-800 leading-tight">
              {formatCurrency(pendentes.reduce((s, c) => s + (c.value || 0), 0))}
            </div>
            <div className="text-xs text-amber-600 mt-0.5">{pendentes.length} cheque{pendentes.length !== 1 ? 's' : ''}.</div>
          </div>
          <div className="px-5 py-3 bg-emerald-50/60">
            <div className="text-xs font-medium text-emerald-600 mb-1">Compensados</div>
            <div className="text-lg font-bold text-emerald-800 leading-tight">
              {formatCurrency(compensados.reduce((s, c) => s + (c.value || 0), 0))}
            </div>
            <div className="text-xs text-emerald-600 mt-0.5">{compensados.length} cheq.</div>
          </div>
          <div className={`px-5 py-3 ${devolvidos.length > 0 ? 'bg-red-50/60' : ''}`}>
            <div className={`text-xs font-medium mb-1 ${devolvidos.length > 0 ? 'text-red-600' : 'text-muted-foreground'}`}>Devolvidos</div>
            <div className={`text-lg font-bold leading-tight ${devolvidos.length > 0 ? 'text-red-800' : 'text-foreground'}`}>
              {formatCurrency(devolvidos.reduce((s, c) => s + (c.value || 0), 0))}
            </div>
            <div className={`text-xs mt-0.5 ${devolvidos.length > 0 ? 'text-red-600' : 'text-muted-foreground'}`}>
              {devolvidos.length} cheque{devolvidos.length !== 1 ? 's' : ''}.
            </div>
          </div>
        </div>

        {/* Flags */}
        {(banco.is_default_repasse || banco.is_default_lucro || banco.pix_key || banco.active === false) && (
          <div className="flex items-center gap-2 px-6 py-2.5 border-t border-border bg-gray-50/50 flex-wrap">
            {banco.is_default_repasse && (
              <span className="flex items-center gap-1 text-xs font-semibold px-2 py-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-full">
                <ArrowUpRight className="w-3 h-3" /> Repasse padrão
              </span>
            )}
            {banco.is_default_lucro && (
              <span className="flex items-center gap-1 text-xs font-semibold px-2 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full">
                <ArrowDownLeft className="w-3 h-3" /> Recebimento padrão
              </span>
            )}
            {banco.pix_key && (
              <span className="text-xs px-2 py-1 bg-gray-100 text-gray-700 rounded-full">
                PIX: {banco.pix_key}
              </span>
            )}
            {banco.active === false && (
              <span className="text-xs px-2 py-1 bg-gray-200 text-gray-600 rounded-full font-semibold">Inativo</span>
            )}
          </div>
        )}

        {/* Tabs */}
        <div className="flex border-t border-border overflow-x-auto">
          {TABS.map(({ key, label, Icon }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex items-center gap-1.5 px-5 py-3 text-xs font-semibold whitespace-nowrap border-b-2 transition-colors ${
                tab === key
                  ? 'border-foreground text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── CONTEÚDO COM SCROLL PRÓPRIO ── */}
      <div className="flex-1 overflow-y-auto bg-gray-50/30">
        <div className="p-6">
          {tab === 'visao_geral' && (
            <BancoVisaoGeral banco={banco} cheques={cheques} onReload={onReload} />
          )}
          {tab === 'movimentacoes' && (
            <BancoExtratoTab banco={banco} key={`extrato-${banco.id}`} />
          )}
          {tab === 'cheques' && (
            <BancoChequeTab banco={banco} cheques={cheques} onReload={onReload} key={`cheques-${banco.id}`} />
          )}
          {tab === 'conciliacao' && (
            <BancoConciliacao banco={banco} />
          )}
          {tab === 'configuracoes' && (
            <BancoConfiguracoes banco={banco} onSaved={onReload} />
          )}
        </div>
      </div>
    </div>
  );
}