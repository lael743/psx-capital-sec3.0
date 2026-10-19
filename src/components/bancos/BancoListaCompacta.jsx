import { MoreVertical, Pencil, Trash2, ChevronRight, Building2, ArrowUpRight, ArrowDownLeft } from 'lucide-react';
import { useState } from 'react';
import { formatCurrency } from '@/lib/finance';

export default function BancoListaCompacta({ bancos, cheques, selectedBancoId, onSelect, onEdit, onDelete, compact = false }) {
  const [openMenu, setOpenMenu] = useState(null);

  if (bancos.length === 0) return (
    <div className="py-20 text-center border border-dashed border-border rounded-xl">
      <Building2 className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
      <p className="text-muted-foreground font-medium text-sm">Nenhum banco cadastrado</p>
      <p className="text-xs text-muted-foreground mt-1">Clique em "Novo Banco" para começar</p>
    </div>
  );

  const getBancoStats = (banco) => {
    const bancoCheques = cheques.filter(c =>
      c.deposited_bank_id === banco.id || c.deposited_bank_name === banco.name
    );
    const emCompensacao = bancoCheques.filter(c => c.status === 'pendente').reduce((s, c) => s + (c.value || 0), 0);
    const countCheques = bancoCheques.length;
    return { emCompensacao, countCheques };
  };

  // ── Modo compacto (drawer aberto): apenas avatar + nome + saldo + menu ──
  if (compact) {
    return (
      <div className="bg-white border border-border rounded-xl overflow-hidden">
        <div className="divide-y divide-border">
          {bancos.map(banco => {
            const isSelected = selectedBancoId === banco.id;
            const isNegative = (banco.current_balance || 0) < 0;
            return (
              <div
                key={banco.id}
                onClick={() => onSelect(banco)}
                className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors group relative ${
                  isSelected ? 'bg-foreground text-primary-foreground' : 'hover:bg-gray-50'
                } ${banco.active === false ? 'opacity-50' : ''}`}
              >
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold shrink-0"
                  style={{ backgroundColor: banco.color || 'hsl(0 0% 15%)' }}
                >
                  {banco.name?.slice(0, 2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className={`text-xs font-semibold truncate leading-tight ${isSelected ? 'text-primary-foreground' : 'text-foreground'}`}>
                    {banco.name}
                  </div>
                  <div className={`text-xs font-mono font-bold leading-tight mt-0.5 ${
                    isSelected ? 'text-primary-foreground/80' : isNegative ? 'text-red-600' : 'text-emerald-700'
                  }`}>
                    {formatCurrency(banco.current_balance || 0)}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                  {banco.is_default_repasse && (
                    <span title="Repasse padrão"
                      className={`text-xs px-1 py-0.5 rounded font-semibold ${isSelected ? 'bg-white/20 text-primary-foreground' : 'bg-blue-50 text-blue-700'}`}>
                      <ArrowUpRight className="w-3 h-3" />
                    </span>
                  )}
                  {banco.is_default_lucro && (
                    <span title="Recebimento padrão"
                      className={`text-xs px-1 py-0.5 rounded font-semibold ${isSelected ? 'bg-white/20 text-primary-foreground' : 'bg-emerald-50 text-emerald-700'}`}>
                      <ArrowDownLeft className="w-3 h-3" />
                    </span>
                  )}
                  <div className="relative">
                    <button
                      onClick={(e) => { e.stopPropagation(); setOpenMenu(openMenu === banco.id ? null : banco.id); }}
                      className={`p-1 rounded transition-colors ${isSelected ? 'hover:bg-white/20 text-primary-foreground' : 'hover:bg-gray-100 text-muted-foreground'}`}
                    >
                      <MoreVertical className="w-3.5 h-3.5" />
                    </button>
                    {openMenu === banco.id && (
                      <>
                        <div className="fixed inset-0 z-10" onClick={() => setOpenMenu(null)} />
                        <div className="absolute right-0 mt-1 bg-white border border-border rounded-xl shadow-xl z-20 min-w-[160px] overflow-hidden">
                          <button onClick={() => { onEdit(banco); setOpenMenu(null); }}
                            className="w-full text-left flex items-center gap-2 px-3 py-2.5 text-sm hover:bg-gray-50 transition-colors">
                            <Pencil className="w-3.5 h-3.5 text-muted-foreground" /> Editar
                          </button>
                          <button onClick={() => { onDelete(banco.id); setOpenMenu(null); }}
                            className="w-full text-left flex items-center gap-2 px-3 py-2.5 text-sm hover:bg-red-50 text-red-600 transition-colors border-t border-border">
                            <Trash2 className="w-3.5 h-3.5" /> Remover
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ── Modo normal (sem drawer): tabela completa ──
  return (
    <div className="bg-white border border-border rounded-xl overflow-hidden">
      <div className="grid grid-cols-12 gap-2 px-4 py-2.5 border-b border-border bg-gray-50/70">
        <div className="col-span-4 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Banco / Conta</div>
        <div className="col-span-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide text-right">Saldo</div>
        <div className="col-span-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide text-right">Em Compens.</div>
        <div className="col-span-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide text-center">Cheques</div>
        <div className="col-span-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide text-center">Flags</div>
      </div>

      <div className="divide-y divide-border">
        {bancos.map(banco => {
          const { emCompensacao, countCheques } = getBancoStats(banco);
          const isSelected = selectedBancoId === banco.id;
          const isNegative = (banco.current_balance || 0) < 0;

          return (
            <div
              key={banco.id}
              onClick={() => onSelect(banco)}
              className={`grid grid-cols-12 gap-2 px-4 py-3 cursor-pointer transition-colors group relative ${
                isSelected ? 'bg-foreground text-primary-foreground' : 'hover:bg-gray-50'
              } ${banco.active === false ? 'opacity-50' : ''}`}
            >
              {/* Nome + Ag/Cc */}
              <div className="col-span-4 flex items-center gap-3 min-w-0">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold shrink-0"
                  style={{ backgroundColor: banco.color || 'hsl(0 0% 15%)' }}
                >
                  {banco.name?.slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className={`text-sm font-semibold truncate ${isSelected ? 'text-primary-foreground' : 'text-foreground'}`}>
                    {banco.name}
                    {banco.active === false && <span className="ml-1 text-xs font-normal opacity-60">(inativo)</span>}
                  </div>
                  <div className={`text-xs truncate ${isSelected ? 'text-primary-foreground/60' : 'text-muted-foreground'}`}>
                    {banco.agency ? `Ag ${banco.agency}` : ''}
                    {banco.agency && banco.account ? ' · ' : ''}
                    {banco.account ? `Cc ${banco.account}` : ''}
                    {!banco.agency && !banco.account && (banco.bank_code ? `Cód. ${banco.bank_code}` : '—')}
                  </div>
                </div>
              </div>

              {/* Saldo */}
              <div className="col-span-2 flex items-center justify-end">
                <span className={`text-sm font-bold font-mono ${
                  isSelected ? 'text-primary-foreground' : isNegative ? 'text-red-600' : 'text-emerald-700'
                }`}>
                  {formatCurrency(banco.current_balance || 0)}
                </span>
              </div>

              {/* Em compensação */}
              <div className="col-span-2 flex items-center justify-end">
                <span className={`text-xs font-mono ${isSelected ? 'text-primary-foreground/70' : 'text-amber-700'}`}>
                  {emCompensacao > 0 ? formatCurrency(emCompensacao) : '—'}
                </span>
              </div>

              {/* Cheques */}
              <div className="col-span-2 flex items-center justify-center">
                {countCheques > 0 ? (
                  <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                    isSelected ? 'bg-white/20 text-primary-foreground' : 'bg-gray-100 text-gray-700'
                  }`}>
                    {countCheques}
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">—</span>
                )}
              </div>

              {/* Flags + Menu */}
              <div className="col-span-2 flex items-center justify-center gap-1">
                {banco.is_default_repasse && (
                  <span title="Repasse padrão"
                    className={`text-xs px-1.5 py-0.5 rounded font-semibold flex items-center gap-0.5 ${isSelected ? 'bg-white/20 text-primary-foreground' : 'bg-blue-50 text-blue-700'}`}>
                    <ArrowUpRight className="w-3 h-3" />
                    <span>Rep</span>
                  </span>
                )}
                {banco.is_default_lucro && (
                  <span title="Recebimento padrão"
                    className={`text-xs px-1.5 py-0.5 rounded font-semibold flex items-center gap-0.5 ${isSelected ? 'bg-white/20 text-primary-foreground' : 'bg-emerald-50 text-emerald-700'}`}>
                    <ArrowDownLeft className="w-3 h-3" />
                    <span>Luc</span>
                  </span>
                )}
                <div className="relative ml-1" onClick={e => e.stopPropagation()}>
                  <button
                    onClick={(e) => { e.stopPropagation(); setOpenMenu(openMenu === banco.id ? null : banco.id); }}
                    className={`p-1 rounded transition-colors ${isSelected ? 'hover:bg-white/20 text-primary-foreground' : 'hover:bg-gray-100 text-muted-foreground'}`}
                  >
                    <MoreVertical className="w-4 h-4" />
                  </button>
                  {openMenu === banco.id && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setOpenMenu(null)} />
                      <div className="absolute right-0 mt-1 bg-white border border-border rounded-xl shadow-xl z-20 min-w-[160px] overflow-hidden">
                        <button onClick={() => { onEdit(banco); setOpenMenu(null); }}
                          className="w-full text-left flex items-center gap-2 px-3 py-2.5 text-sm hover:bg-gray-50 transition-colors">
                          <Pencil className="w-3.5 h-3.5 text-muted-foreground" /> Editar
                        </button>
                        <button onClick={() => { onDelete(banco.id); setOpenMenu(null); }}
                          className="w-full text-left flex items-center gap-2 px-3 py-2.5 text-sm hover:bg-red-50 text-red-600 transition-colors border-t border-border">
                          <Trash2 className="w-3.5 h-3.5" /> Remover
                        </button>
                      </div>
                    </>
                  )}
                </div>
                <ChevronRight className={`w-3.5 h-3.5 transition-opacity ${isSelected ? 'text-primary-foreground opacity-80' : 'text-muted-foreground opacity-0 group-hover:opacity-50'}`} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}