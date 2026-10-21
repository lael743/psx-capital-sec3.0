import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import CurrencyInput from '@/components/ui/CurrencyInput';
import { maskCpfCnpj, maskPhone } from '@/lib/masks';
import { UserPlus, AlertTriangle } from 'lucide-react';

const VAZIO = {
  name: '',
  document: '',
  phone: '',
  whatsapp: '',
  email: '',
  credit_limit: '',
  default_rate: '',
  risk_profile: 'medio',
};

/**
 * Cadastro rápido de cedente em DRAWER, para não perder o contexto da criação
 * da operação. Grava o cadastro completo mínimo (nome e documento são os
 * obrigatórios da entidade) e devolve o registro criado para a tela selecionar.
 */
export default function NovoCedenteDrawer({ open, onOpenChange, onCreated }) {
  const [form, setForm] = useState(VAZIO);
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState('');

  const set = (campo, valor) => {
    setForm((f) => ({ ...f, [campo]: valor }));
    setErro('');
  };

  const salvar = async () => {
    if (!form.name.trim() || !form.document.trim()) {
      setErro('Informe o nome e o CPF/CNPJ do cedente.');
      return;
    }
    setSaving(true);
    try {
      const criado = await base44.entities.Client.create({
        name: form.name.trim().toUpperCase(),
        document: form.document,
        phone: form.phone,
        whatsapp: form.whatsapp || form.phone,
        email: form.email,
        credit_limit: parseFloat(form.credit_limit) || 0,
        default_rate: parseFloat(form.default_rate) || 0,
        risk_profile: form.risk_profile,
        status: 'ativo',
      });
      onCreated?.(criado);
      setForm(VAZIO);
      onOpenChange(false);
    } catch (e) {
      setErro(e?.message || 'Não foi possível cadastrar o cedente.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 text-base">
            <UserPlus className="w-4 h-4" /> Novo cedente
          </SheetTitle>
          <SheetDescription className="text-xs">
            O cadastro é criado e selecionado na operação. Você continua de onde parou.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-3 mt-4">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Nome / Razão social *</label>
            <input className="input-field w-full" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Nome do cedente" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">CPF / CNPJ *</label>
              <input className="input-field w-full" value={form.document} onChange={(e) => set('document', maskCpfCnpj(e.target.value))} placeholder="000.000.000-00" />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Telefone</label>
              <input className="input-field w-full" value={form.phone} onChange={(e) => set('phone', maskPhone(e.target.value))} placeholder="(00) 00000-0000" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">WhatsApp</label>
              <input className="input-field w-full" value={form.whatsapp} onChange={(e) => set('whatsapp', maskPhone(e.target.value))} placeholder="(00) 00000-0000" />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">E-mail</label>
              <input className="input-field w-full" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="cedente@email.com" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Limite de crédito</label>
              <CurrencyInput value={form.credit_limit} onChange={(v) => set('credit_limit', v)} className="w-full" />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Taxa padrão (% a.m.)</label>
              <input className="input-field w-full" type="number" step="0.01" value={form.default_rate} onChange={(e) => set('default_rate', e.target.value)} placeholder="0,00" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Perfil de risco</label>
            <select className="input-field w-full" value={form.risk_profile} onChange={(e) => set('risk_profile', e.target.value)}>
              <option value="baixo">Baixo</option>
              <option value="medio">Médio</option>
              <option value="alto">Alto</option>
            </select>
          </div>

          {erro && (
            <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 flex items-start gap-2">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {erro}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button onClick={() => onOpenChange(false)} className="px-4 py-2 text-sm font-medium border border-border rounded-lg hover:bg-gray-50">
              Cancelar
            </button>
            <button
              onClick={salvar}
              disabled={saving}
              className="px-4 py-2 text-sm font-semibold bg-foreground text-primary-foreground rounded-lg hover:bg-foreground/90 disabled:opacity-50"
            >
              {saving ? 'Cadastrando...' : 'Cadastrar e usar'}
            </button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}