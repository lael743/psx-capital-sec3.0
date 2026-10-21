import { useState } from 'react';
import { X, Building2 } from 'lucide-react';
import { montarPayloadCadastro } from '@/lib/bancoCadastro';

const COLORS = ['#1a1a1a', '#1e40af', '#15803d', '#b45309', '#7c3aed', '#be123c', '#0369a1', '#166534'];

export default function BancoFormModal({ banco, onSave, onClose }) {
  const [form, setForm] = useState({
    name: '',
    bank_code: '',
    agency: '',
    account: '',
    account_type: 'corrente',
    pix_key: '',
    initial_balance: '',
    is_default_repasse: false,
    is_default_lucro: false,
    color: '#1a1a1a',
    notes: '',
    active: true,
    ...banco,
  });

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // M6.3 — o formulário grava CADASTRO. Saldo só nasce com a conta (saldo
  // inicial) e, depois disso, só muda por ajuste de saldo no servidor.
  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(montarPayloadCadastro({ form, existente: banco }));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div className="flex items-center gap-2">
            <Building2 className="w-5 h-5" />
            <h2 className="text-lg font-bold">{banco?.id ? 'Editar Banco' : 'Novo Banco'}</h2>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Color picker */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-2">Cor de identificação</label>
            <div className="flex gap-2 flex-wrap">
              {COLORS.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => set('color', c)}
                  className={`w-7 h-7 rounded-full border-2 transition-all ${form.color === c ? 'border-foreground scale-110' : 'border-transparent'}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Nome do Banco *</label>
              <input required className="input-field uppercase" value={form.name}
                onChange={e => set('name', e.target.value.toUpperCase())} placeholder="Ex: BRADESCO" />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Código do Banco</label>
              <input className="input-field" value={form.bank_code}
                onChange={e => set('bank_code', e.target.value)} placeholder="237" />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Tipo de Conta</label>
              <select className="input-field" value={form.account_type} onChange={e => set('account_type', e.target.value)}>
                <option value="corrente">Corrente</option>
                <option value="poupanca">Poupança</option>
                <option value="pagamento">Pagamento</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Agência</label>
              <input className="input-field" value={form.agency}
                onChange={e => set('agency', e.target.value)} placeholder="0001-5" />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Conta Corrente</label>
              <input className="input-field" value={form.account}
                onChange={e => set('account', e.target.value)} placeholder="000500-9" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Chave PIX</label>
              <input className="input-field" value={form.pix_key}
                onChange={e => set('pix_key', e.target.value)} placeholder="CPF, e-mail, celular ou aleatória" />
            </div>
            {!banco?.id && (
              <div className="col-span-2">
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Saldo Inicial (R$)</label>
                <input className="input-field" type="number" step="0.01" value={form.initial_balance}
                  onChange={e => set('initial_balance', e.target.value)} placeholder="0,00" />
              </div>
            )}
          </div>

          {/* Toggles */}
          <div className="space-y-3 pt-2 border-t border-border">
            <label className="flex items-center justify-between cursor-pointer">
              <div>
                <div className="text-sm font-semibold">Banco padrão de repasse ao cliente</div>
                <div className="text-xs text-muted-foreground">Pré-selecionado ao criar operações</div>
              </div>
              <button type="button" onClick={() => set('is_default_repasse', !form.is_default_repasse)}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors shrink-0 ${form.is_default_repasse ? 'bg-foreground' : 'bg-gray-300'}`}>
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${form.is_default_repasse ? 'translate-x-4.5' : 'translate-x-0.5'}`} />
              </button>
            </label>
            <label className="flex items-center justify-between cursor-pointer">
              <div>
                <div className="text-sm font-semibold">Banco padrão de recebimento (lucro)</div>
                <div className="text-xs text-muted-foreground">Onde os pagamentos serão creditados por padrão</div>
              </div>
              <button type="button" onClick={() => set('is_default_lucro', !form.is_default_lucro)}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors shrink-0 ${form.is_default_lucro ? 'bg-foreground' : 'bg-gray-300'}`}>
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${form.is_default_lucro ? 'translate-x-4.5' : 'translate-x-0.5'}`} />
              </button>
            </label>
            <label className="flex items-center justify-between cursor-pointer">
              <div>
                <div className="text-sm font-semibold">Conta ativa</div>
              </div>
              <button type="button" onClick={() => set('active', !form.active)}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors shrink-0 ${form.active ? 'bg-foreground' : 'bg-gray-300'}`}>
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${form.active ? 'translate-x-4.5' : 'translate-x-0.5'}`} />
              </button>
            </label>
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Observações</label>
            <textarea className="input-field resize-none min-h-[60px]" value={form.notes}
              onChange={e => set('notes', e.target.value)} placeholder="Opcional..." />
          </div>

          <div className="flex gap-3 justify-end pt-2">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm font-medium border border-border rounded-lg hover:bg-gray-50 transition-colors">
              Cancelar
            </button>
            <button type="submit"
              className="px-5 py-2 bg-foreground text-primary-foreground text-sm font-semibold rounded-lg hover:bg-foreground/90 transition-colors">
              {banco?.id ? 'Salvar' : 'Cadastrar Banco'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}