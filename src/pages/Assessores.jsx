import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Plus, Eye, EyeOff, Pencil, Trash2, ShieldCheck, RefreshCw } from 'lucide-react';
import { logAction } from '@/lib/audit';

function generateToken() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

function AssessorForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState({
    user_email: initial?.user_email || '',
    name: initial?.name || '',
    token: initial?.token || generateToken(),
    active: initial?.active ?? true,
    notes: initial?.notes || '',
  });
  const [showToken, setShowToken] = useState(false);
  const [saving, setSaving] = useState(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    await onSave(form);
    setSaving(false);
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white border border-border rounded-2xl p-6 space-y-4 shadow-sm">
      <h3 className="text-sm font-bold">{initial ? 'Editar Assessor' : 'Novo Assessor'}</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">Nome completo *</label>
          <input className="input-field uppercase" value={form.name}
            onChange={e => set('name', e.target.value.toUpperCase())}
            placeholder="NOME DO ASSESSOR" required />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">E-mail do usuário *</label>
          <input className="input-field" type="email" value={form.user_email}
            onChange={e => set('user_email', e.target.value)}
            placeholder="email@empresa.com" required />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">Token de Segurança *</label>
          <div className="relative flex gap-2">
            <input
              className="input-field flex-1 font-mono tracking-widest"
              type={showToken ? 'text' : 'password'}
              value={form.token}
              onChange={e => set('token', e.target.value.toUpperCase())}
              required
            />
            <button type="button" onClick={() => setShowToken(v => !v)}
              className="px-2.5 border border-border rounded-lg hover:bg-gray-50 transition-colors">
              {showToken ? <EyeOff className="w-4 h-4 text-muted-foreground" /> : <Eye className="w-4 h-4 text-muted-foreground" />}
            </button>
            <button type="button" onClick={() => set('token', generateToken())}
              title="Gerar novo token"
              className="px-2.5 border border-border rounded-lg hover:bg-gray-50 transition-colors">
              <RefreshCw className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
          <p className="text-xs text-muted-foreground mt-1">Compartilhe apenas com o assessor responsável.</p>
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">Status</label>
          <label className="flex items-center gap-3 cursor-pointer mt-2">
            <button type="button" onClick={() => set('active', !form.active)}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${form.active ? 'bg-foreground' : 'bg-gray-300'}`}>
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${form.active ? 'translate-x-4.5' : 'translate-x-0.5'}`} />
            </button>
            <span className="text-sm font-medium">{form.active ? 'Ativo' : 'Inativo'}</span>
          </label>
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">Observações</label>
          <input className="input-field" value={form.notes}
            onChange={e => set('notes', e.target.value)}
            placeholder="Observações internas..." />
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-2 border-t border-border">
        <button type="button" onClick={onCancel}
          className="px-4 py-2 text-sm font-medium border border-border rounded-lg hover:bg-gray-50 transition-colors">
          Cancelar
        </button>
        <button type="submit" disabled={saving}
          className="inline-flex items-center gap-2 px-5 py-2 bg-foreground text-primary-foreground text-sm font-semibold rounded-lg hover:bg-foreground/90 disabled:opacity-50 transition-colors">
          <ShieldCheck className="w-4 h-4" />
          {saving ? 'Salvando...' : 'Salvar Assessor'}
        </button>
      </div>
    </form>
  );
}

export default function Assessores() {
  const [assessores, setAssessores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [visibleTokens, setVisibleTokens] = useState({});

  const load = () => {
    base44.entities.Assessor.list('name', 100).then(list => {
      setAssessores(list);
      setLoading(false);
    });
  };

  useEffect(() => { load(); }, []);

  const handleSave = async (form) => {
    if (editing) {
      await base44.entities.Assessor.update(editing.id, form);
      await logAction({ action: 'update', entity: 'Assessor', entityId: editing.id, description: `Assessor ${form.name} atualizado` });
    } else {
      const created = await base44.entities.Assessor.create(form);
      await logAction({ action: 'create', entity: 'Assessor', entityId: created.id, description: `Assessor ${form.name} criado` });
    }
    setShowForm(false);
    setEditing(null);
    load();
  };

  const handleDelete = async (a) => {
    if (!confirm(`Remover assessor ${a.name}?`)) return;
    await base44.entities.Assessor.delete(a.id);
    await logAction({ action: 'delete', entity: 'Assessor', entityId: a.id, description: `Assessor ${a.name} removido` });
    load();
  };

  const toggleToken = (id) => setVisibleTokens(v => ({ ...v, [id]: !v[id] }));

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-6 h-6 border-2 border-border border-t-foreground rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-[hsl(43,65%,47%)]" />
            Assessores
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Gerencie os assessores e seus tokens de segurança para autorização de repasses.</p>
        </div>
        {!showForm && (
          <button onClick={() => { setEditing(null); setShowForm(true); }}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-foreground text-primary-foreground text-sm font-semibold rounded-lg hover:bg-foreground/90 transition-colors">
            <Plus className="w-4 h-4" /> Novo Assessor
          </button>
        )}
      </div>

      {showForm && (
        <AssessorForm
          initial={editing}
          onSave={handleSave}
          onCancel={() => { setShowForm(false); setEditing(null); }}
        />
      )}

      <div className="space-y-3">
        {assessores.length === 0 && !showForm && (
          <div className="py-16 text-center text-muted-foreground text-sm border border-dashed border-border rounded-2xl">
            Nenhum assessor cadastrado.
          </div>
        )}
        {assessores.map(a => (
          <div key={a.id} className="bg-white border border-border rounded-xl p-4 flex items-center gap-4 shadow-sm">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm shrink-0 ${a.active ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
              {a.name?.charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-sm">{a.name}</span>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${a.active ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-gray-100 text-gray-500 border-gray-200'}`}>
                  {a.active ? 'Ativo' : 'Inativo'}
                </span>
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">{a.user_email}</div>
              {a.notes && <div className="text-xs text-muted-foreground mt-0.5 italic">{a.notes}</div>}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <div className="flex items-center gap-1.5 bg-gray-50 border border-border rounded-lg px-3 py-1.5">
                <span className="font-mono text-xs tracking-widest">
                  {visibleTokens[a.id] ? a.token : '••••••••'}
                </span>
                <button onClick={() => toggleToken(a.id)} className="ml-1 hover:opacity-70 transition-opacity">
                  {visibleTokens[a.id] ? <EyeOff className="w-3.5 h-3.5 text-muted-foreground" /> : <Eye className="w-3.5 h-3.5 text-muted-foreground" />}
                </button>
              </div>
              <button onClick={() => { setEditing(a); setShowForm(true); }}
                className="p-2 rounded-lg border border-border hover:bg-gray-50 transition-colors">
                <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
              <button onClick={() => handleDelete(a)}
                className="p-2 rounded-lg border border-red-200 hover:bg-red-50 transition-colors">
                <Trash2 className="w-3.5 h-3.5 text-red-400" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}