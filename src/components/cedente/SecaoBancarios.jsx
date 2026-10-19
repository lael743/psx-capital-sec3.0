import { Save } from 'lucide-react';

export default function SecaoBancarios({ form, setField, saving, saveSection, savedFlash }) {
  return (
    <div className="bg-white border border-border rounded-xl p-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-base font-bold">Dados Bancários</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Conta para repasse e cobrança.</p>
        </div>
        <button onClick={() => saveSection('bancarios')} disabled={saving} className="inline-flex items-center gap-2 px-4 py-2 bg-foreground text-primary-foreground text-sm font-semibold rounded-lg hover:bg-foreground/90 disabled:opacity-50">
          <Save className="w-3.5 h-3.5" /> {saving ? 'Salvando...' : 'Salvar'}
        </button>
      </div>

      {savedFlash?.section === 'bancarios' && (
        <div className="mb-4 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">{savedFlash.message}</div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">Banco</label>
          <input className="input-field uppercase" value={form.bank_name} onChange={e => setField('bank_name', e.target.value.toUpperCase())} placeholder="EX: BRADESCO, ITAÚ..." />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">Agência</label>
          <input className="input-field" value={form.bank_agency} onChange={e => setField('bank_agency', e.target.value)} placeholder="0001" />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">Conta</label>
          <input className="input-field" value={form.bank_account} onChange={e => setField('bank_account', e.target.value)} placeholder="12345-6" />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">Tipo de Conta</label>
          <select className="input-field" value={form.bank_account_type} onChange={e => setField('bank_account_type', e.target.value)}>
            <option value="corrente">Corrente</option>
            <option value="poupanca">Poupança</option>
            <option value="pagamento">Pagamento</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">Chave PIX</label>
          <input className="input-field" value={form.pix_key} onChange={e => setField('pix_key', e.target.value)} placeholder="CPF, e-mail, celular ou aleatório" />
        </div>
      </div>
    </div>
  );
}