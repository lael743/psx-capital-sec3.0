import { Search, ArrowDownUp, X } from 'lucide-react';
import { SITUACAO, SITUACAO_LABEL } from '@/lib/contasReceber';

const SELECT = 'text-sm border border-border rounded-lg px-3 py-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-ring shadow-sm';

export default function FiltrosTitulos({ filtros, onChange, opcoes, ordem, onOrdem, onLimpar }) {
  const alterar = (campo) => (evento) => onChange({ ...filtros, [campo]: evento.target.value });

  return (
    <div className="bg-white border border-border rounded-xl p-4 mb-5 space-y-3 shadow-sm">
      <div className="flex flex-col lg:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={filtros.busca}
            onChange={alterar('busca')}
            placeholder="Buscar por nº do título, cedente, sacado ou operação..."
            className="w-full pl-9 pr-4 py-2.5 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-ring shadow-sm"
          />
        </div>
        <select value={filtros.situacao} onChange={alterar('situacao')} className={SELECT}>
          <option value="">Todas as situações</option>
          {Object.entries(SITUACAO_LABEL).map(([chave, label]) => (
            <option key={chave} value={chave}>
              {chave === SITUACAO.INCONSISTENTE ? `${label} (inclui conciliação pendente)` : label}
            </option>
          ))}
        </select>
        <select value={filtros.origem} onChange={alterar('origem')} className={SELECT}>
          <option value="">Todas as origens</option>
          <option value="cheque">Título</option>
          <option value="agenda">Agenda (parcela)</option>
        </select>
        <select value={ordem} onChange={(e) => onOrdem(e.target.value)} className={SELECT}>
          <option value="asc">Vencimento: mais próximo</option>
          <option value="desc">Vencimento: mais distante</option>
        </select>
      </div>

      <div className="flex flex-col lg:flex-row lg:items-end gap-3">
        <select value={filtros.cliente} onChange={alterar('cliente')} className={`${SELECT} lg:max-w-[220px]`}>
          <option value="">Todos os cedentes</option>
          {opcoes.clientes.map((nome) => <option key={nome} value={nome}>{nome}</option>)}
        </select>
        <select value={filtros.sacado} onChange={alterar('sacado')} className={`${SELECT} lg:max-w-[220px]`}>
          <option value="">Todos os sacados</option>
          {opcoes.sacados.map((nome) => <option key={nome} value={nome}>{nome}</option>)}
        </select>
        <select value={filtros.tipo} onChange={alterar('tipo')} className={`${SELECT} lg:max-w-[160px]`}>
          <option value="">Todos os tipos</option>
          {opcoes.tipos.map((tipo) => <option key={tipo} value={tipo}>{tipo}</option>)}
        </select>
        <div className="flex items-end gap-2">
          <div>
            <label className="block text-[11px] font-medium text-muted-foreground mb-1">Vence de</label>
            <input type="date" value={filtros.de} max={filtros.ate || undefined} onChange={alterar('de')} className="input-field" />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-muted-foreground mb-1">até</label>
            <input type="date" value={filtros.ate} min={filtros.de || undefined} onChange={alterar('ate')} className="input-field" />
          </div>
        </div>
        <button
          onClick={onLimpar}
          className="inline-flex items-center gap-1.5 px-3 py-2.5 text-xs font-semibold border border-border rounded-lg hover:bg-gray-50 lg:ml-auto"
        >
          <X className="w-3.5 h-3.5" /> Limpar filtros
        </button>
        <span className="hidden lg:inline-flex items-center gap-1 text-[11px] text-muted-foreground">
          <ArrowDownUp className="w-3 h-3" /> ordenação explícita por vencimento
        </span>
      </div>
    </div>
  );
}