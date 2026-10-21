import { Trash2 } from 'lucide-react';

/** Uma forma de repassar ao cedente: conta de origem, forma, valor e prova. */
export default function RepasseLinhaForm({ linha, indice, bancos, onChange, onRemove, podeRemover }) {
  const alterar = (campo, valor) => onChange(linha.id, campo, valor);

  return (
    <div className="border border-border rounded-lg p-3 space-y-2 bg-muted/20">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          Repasse {indice + 1}
        </span>
        {podeRemover && (
          <button
            type="button"
            onClick={() => onRemove(linha.id)}
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted-foreground hover:text-red-600 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" /> Remover
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div className="md:col-span-2">
          <label className="block text-xs font-medium text-muted-foreground mb-1">Conta de origem *</label>
          <select className="input-field" value={linha.bancoId} onChange={(e) => alterar('bancoId', e.target.value)}>
            <option value="">Selecione...</option>
            {bancos.map((banco) => <option key={banco.id} value={banco.id}>{banco.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Forma</label>
          <select className="input-field" value={linha.forma} onChange={(e) => alterar('forma', e.target.value)}>
            <option value="pix">PIX</option>
            <option value="ted">TED/Transferência</option>
            <option value="cheque">Cheque</option>
            <option value="dinheiro">Dinheiro</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Valor (R$) *</label>
          <input
            className="input-field tabular-nums"
            type="number"
            min="0"
            step="0.01"
            value={linha.valor}
            onChange={(e) => alterar('valor', e.target.value)}
            placeholder="0,00"
          />
        </div>
        <div className="md:col-span-2">
          <label className="block text-xs font-medium text-muted-foreground mb-1">Referência *</label>
          <input
            className="input-field"
            value={linha.referencia}
            onChange={(e) => alterar('referencia', e.target.value)}
            placeholder="ID PIX/TED ou nº do comprovante"
          />
        </div>
        <div className="md:col-span-2">
          <label className="block text-xs font-medium text-muted-foreground mb-1">Comprovante (link)</label>
          <input
            className="input-field"
            value={linha.comprovante}
            onChange={(e) => alterar('comprovante', e.target.value)}
            placeholder="https://..."
          />
        </div>
      </div>
    </div>
  );
}