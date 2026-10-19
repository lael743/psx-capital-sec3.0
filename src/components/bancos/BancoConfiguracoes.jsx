import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Save } from 'lucide-react';

const ACCOUNT_TYPES = [
  { value: 'corrente', label: 'Conta Corrente' },
  { value: 'poupanca', label: 'Poupança' },
  { value: 'pagamento', label: 'Conta Pagamento' },
];

export default function BancoConfiguracoes({ banco, onSaved }) {
  const [form, setForm] = useState({
    name: banco.name || '',
    bank_code: banco.bank_code || '',
    agency: banco.agency || '',
    account: banco.account || '',
    account_type: banco.account_type || 'corrente',
    pix_key: banco.pix_key || '',
    color: banco.color || '#0f0f0f',
    is_default_repasse: banco.is_default_repasse || false,
    is_default_lucro: banco.is_default_lucro || false,
    active: banco.active !== false,
    notes: banco.notes || '',
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = async () => {
    setSaving(true);
    await base44.entities.Banco.update(banco.id, form);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
    onSaved();
  };

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-3">Dados do Banco</h3>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-muted-foreground mb-1">Nome *</label>
              <input className="input-field" value={form.name} onChange={e => set('name', e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Código do Banco</label>
              <input className="input-field" value={form.bank_code} onChange={e => set('bank_code', e.target.value)} placeholder="Ex: 756" />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Tipo de Conta</label>
              <select className="input-field" value={form.account_type} onChange={e => set('account_type', e.target.value)}>
                {ACCOUNT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Agência</label>
              <input className="input-field" value={form.agency} onChange={e => set('agency', e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Conta</label>
              <input className="input-field" value={form.account} onChange={e => set('account', e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Chave PIX</label>
              <input className="input-field" value={form.pix_key} onChange={e => set('pix_key', e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Cor de identificação</label>
              <div className="flex items-center gap-2">
                <input type="color" value={form.color} onChange={e => set('color', e.target.value)}
                  className="w-10 h-9 rounded-lg border border-border cursor-pointer p-0.5" />
                <input className="input-field flex-1" value={form.color} onChange={e => set('color', e.target.value)} placeholder="#0f0f0f" />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-3">Configurações Padrão</h3>
        <div className="space-y-3">
          {[
            { key: 'is_default_repasse', label: 'Banco padrão para repasse ao cliente', desc: 'Será pré-selecionado ao criar operações' },
            { key: 'is_default_lucro', label: 'Banco padrão para recebimento de lucro', desc: 'Será pré-selecionado para crédito de receitas' },
            { key: 'active', label: 'Banco ativo', desc: 'Bancos inativos não aparecem nas seleções' },
          ].map(opt => (
            <label key={opt.key} className="flex items-start gap-3 p-3 border border-border rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
              <input type="checkbox" checked={form[opt.key]} onChange={e => set(opt.key, e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded border-border text-foreground" />
              <div>
                <div className="text-sm font-medium">{opt.label}</div>
                <div className="text-xs text-muted-foreground">{opt.desc}</div>
              </div>
            </label>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1">Observações internas</label>
        <textarea className="input-field" rows={3} value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Informações adicionais..." />
      </div>

      <div className="flex justify-end">
        <button onClick={handleSave} disabled={saving || !form.name}
          className="flex items-center gap-2 px-5 py-2.5 bg-foreground text-primary-foreground text-sm font-semibold rounded-lg disabled:opacity-50 hover:bg-foreground/90 transition-colors">
          <Save className="w-4 h-4" />
          {saving ? 'Salvando...' : saved ? '✓ Salvo!' : 'Salvar Alterações'}
        </button>
      </div>
    </div>
  );
}