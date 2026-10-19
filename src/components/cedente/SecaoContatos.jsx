import { Save, Plus, Trash2, Star } from 'lucide-react';

const TIPOS_EMAIL = ['Pessoal', 'Comercial', 'Financeiro'];
const TIPOS_TEL = ['Celular', 'Fixo', 'WhatsApp'];

export default function SecaoContatos({ form, setForm, saving, saveSection, savedFlash }) {
  const emails = Array.isArray(form.emails) ? form.emails : [];
  const telefones = Array.isArray(form.telefones) ? form.telefones : [];

  const updEmail = (idx, field, value) => setForm(f => ({ ...f, emails: (f.emails || []).map((e, i) => i === idx ? { ...e, [field]: value } : e) }));
  const addEmail = () => setForm(f => ({ ...f, emails: [...(f.emails || []), { tipo: 'Comercial', email: '', principal: (f.emails || []).length === 0 }] }));
  const rmEmail = (idx) => setForm(f => ({ ...f, emails: (f.emails || []).filter((_, i) => i !== idx) }));
  const setPrincipalEmail = (idx) => setForm(f => ({ ...f, emails: (f.emails || []).map((e, i) => ({ ...e, principal: i === idx })) }));

  const updTel = (idx, field, value) => setForm(f => ({ ...f, telefones: (f.telefones || []).map((t, i) => i === idx ? { ...t, [field]: value } : t) }));
  const addTel = () => setForm(f => ({ ...f, telefones: [...(f.telefones || []), { tipo: 'Celular', descricao: '', numero: '', principal: (f.telefones || []).length === 0 }] }));
  const rmTel = (idx) => setForm(f => ({ ...f, telefones: (f.telefones || []).filter((_, i) => i !== idx) }));
  const setPrincipalTel = (idx) => setForm(f => ({ ...f, telefones: (f.telefones || []).map((t, i) => ({ ...t, principal: i === idx })) }));

  return (
    <div className="bg-white border border-border rounded-xl p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold">Contatos</h2>
          <p className="text-xs text-muted-foreground mt-0.5">E-mails e telefones do cedente.</p>
        </div>
        <button onClick={() => saveSection('contatos')} disabled={saving} className="inline-flex items-center gap-2 px-4 py-2 bg-foreground text-primary-foreground text-sm font-semibold rounded-lg hover:bg-foreground/90 disabled:opacity-50">
          <Save className="w-3.5 h-3.5" /> {saving ? 'Salvando...' : 'Salvar'}
        </button>
      </div>

      {savedFlash?.section === 'contatos' && (
        <div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">{savedFlash.message}</div>
      )}

      {/* E-mails */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Canais de E-mail</h3>
          <button onClick={addEmail} className="inline-flex items-center gap-1 text-xs font-semibold text-[hsl(43,65%,47%)] hover:underline">
            <Plus className="w-3.5 h-3.5" /> Adicionar E-mail
          </button>
        </div>
        <div className="space-y-2">
          {emails.map((em, idx) => (
            <div key={idx} className="border border-border rounded-lg p-3 flex items-center gap-2">
              <button onClick={() => setPrincipalEmail(idx)} className="p-1" title="Principal">
                <Star className={`w-3.5 h-3.5 ${em.principal ? 'fill-amber-400 text-amber-400' : 'text-gray-300'}`} />
              </button>
              <select className="input-field w-32" value={em.tipo} onChange={e => updEmail(idx, 'tipo', e.target.value)}>
                {TIPOS_EMAIL.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <input className="input-field flex-1" type="email" value={em.email} onChange={e => updEmail(idx, 'email', e.target.value.toLowerCase())} placeholder="email@exemplo.com" />
              <button onClick={() => rmEmail(idx)} className="p-1.5 rounded-lg hover:bg-red-50 text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          ))}
          {emails.length === 0 && <p className="text-xs text-muted-foreground text-center py-3 border border-dashed border-border rounded-lg">Nenhum e-mail cadastrado.</p>}
        </div>
      </div>

      {/* Telefones */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Contatos Telefônicos</h3>
          <button onClick={addTel} className="inline-flex items-center gap-1 text-xs font-semibold text-[hsl(43,65%,47%)] hover:underline">
            <Plus className="w-3.5 h-3.5" /> Adicionar Telefone
          </button>
        </div>
        <div className="space-y-2">
          {telefones.map((tel, idx) => (
            <div key={idx} className="border border-border rounded-lg p-3 flex items-center gap-2">
              <button onClick={() => setPrincipalTel(idx)} className="p-1" title="Principal">
                <Star className={`w-3.5 h-3.5 ${tel.principal ? 'fill-amber-400 text-amber-400' : 'text-gray-300'}`} />
              </button>
              <select className="input-field w-32" value={tel.tipo} onChange={e => updTel(idx, 'tipo', e.target.value)}>
                {TIPOS_TEL.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <input className="input-field flex-1" value={tel.descricao} onChange={e => updTel(idx, 'descricao', e.target.value)} placeholder="Ex: pessoal, financeiro" />
              <input className="input-field w-40" value={tel.numero} onChange={e => updTel(idx, 'numero', e.target.value)} placeholder="(69) 90000-0000" />
              <button onClick={() => rmTel(idx)} className="p-1.5 rounded-lg hover:bg-red-50 text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          ))}
          {telefones.length === 0 && <p className="text-xs text-muted-foreground text-center py-3 border border-dashed border-border rounded-lg">Nenhum telefone cadastrado.</p>}
        </div>
      </div>
    </div>
  );
}