import { Save, Plus, Trash2, Star } from 'lucide-react';

const emptyEndereco = { tipo: 'Residencial', cep: '', logradouro: '', numero: '', bairro: '', cidade: '', uf: '', complemento: '', principal: false };

const TIPOS = ['Residencial', 'Comercial', 'Cobrança', 'Correspondência', 'Faturamento'];

export default function SecaoEnderecos({ form, setForm, saving, saveSection, savedFlash }) {
  const enderecos = Array.isArray(form.enderecos) ? form.enderecos : [];

  const update = (idx, field, value) => {
    const next = enderecos.map((e, i) => (i === idx ? { ...e, [field]: value } : e));
    setForm(f => ({ ...f, enderecos: next }));
  };
  const add = () => setForm(f => ({ ...f, enderecos: [...(f.enderecos || []), { ...emptyEndereco }] }));
  const remove = (idx) => setForm(f => ({ ...f, enderecos: (f.enderecos || []).filter((_, i) => i !== idx) }));
  const setPrincipal = (idx) => {
    const next = enderecos.map((e, i) => ({ ...e, principal: i === idx }));
    setForm(f => ({ ...f, enderecos: next }));
  };

  return (
    <div className="bg-white border border-border rounded-xl p-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-base font-bold">Endereços</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Cadastre os endereços do cedente para correspondência e cobrança.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={add} className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border border-border rounded-lg hover:bg-gray-50">
            <Plus className="w-3.5 h-3.5" /> Adicionar Endereço
          </button>
          <button onClick={() => saveSection('enderecos')} disabled={saving} className="inline-flex items-center gap-2 px-4 py-2 bg-foreground text-primary-foreground text-sm font-semibold rounded-lg hover:bg-foreground/90 disabled:opacity-50">
            <Save className="w-3.5 h-3.5" /> {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>

      {savedFlash?.section === 'enderecos' && (
        <div className="mb-4 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">{savedFlash.message}</div>
      )}

      <div className="space-y-4">
        {enderecos.map((end, idx) => (
          <div key={idx} className="border border-border rounded-lg p-4 relative">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                {end.principal && <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 bg-amber-50 text-amber-700 rounded-full"><Star className="w-3 h-3" /> Principal</span>}
                <span className="text-xs font-semibold text-muted-foreground">{end.tipo || 'Endereço'}</span>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => setPrincipal(idx)} className="p-1.5 rounded-lg hover:bg-gray-100 text-muted-foreground" title="Definir como principal">
                  <Star className={`w-3.5 h-3.5 ${end.principal ? 'fill-amber-400 text-amber-400' : ''}`} />
                </button>
                <button onClick={() => remove(idx)} className="p-1.5 rounded-lg hover:bg-red-50 text-red-400" title="Remover">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Tipo *</label>
                <select className="input-field" value={end.tipo} onChange={e => update(idx, 'tipo', e.target.value)}>
                  {TIPOS.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">CEP *</label>
                <input className="input-field" value={end.cep} onChange={e => update(idx, 'cep', e.target.value)} placeholder="00000-000" />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-muted-foreground mb-1">Logradouro *</label>
                <input className="input-field uppercase" value={end.logradouro} onChange={e => update(idx, 'logradouro', e.target.value.toUpperCase())} placeholder="RUA, AV..." />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Número *</label>
                <input className="input-field" value={end.numero} onChange={e => update(idx, 'numero', e.target.value)} placeholder="000" />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Bairro *</label>
                <input className="input-field uppercase" value={end.bairro} onChange={e => update(idx, 'bairro', e.target.value.toUpperCase())} />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Cidade *</label>
                <input className="input-field uppercase" value={end.cidade} onChange={e => update(idx, 'cidade', e.target.value.toUpperCase())} />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">UF *</label>
                <input className="input-field uppercase" maxLength={2} value={end.uf} onChange={e => update(idx, 'uf', e.target.value.toUpperCase())} placeholder="RO" />
              </div>
              <div className="sm:col-span-4">
                <label className="block text-xs font-medium text-muted-foreground mb-1">Complemento</label>
                <input className="input-field" value={end.complemento} onChange={e => update(idx, 'complemento', e.target.value)} placeholder="Apto, sala, etc." />
              </div>
            </div>
          </div>
        ))}
        {enderecos.length === 0 && (
          <div className="text-center py-8 text-sm text-muted-foreground border-2 border-dashed border-border rounded-lg">
            Nenhum endereço cadastrado. Clique em "Adicionar Endereço".
          </div>
        )}
      </div>
    </div>
  );
}