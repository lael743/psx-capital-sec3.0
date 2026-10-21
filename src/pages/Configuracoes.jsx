import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Save, Building2, Bell, Shield, FileText, Users, ShieldCheck, Plus, Eye, EyeOff, Pencil, Trash2, RefreshCw, Mail, UserPlus, ChevronDown, ChevronUp, Check, Package } from 'lucide-react';
import { logAction } from '@/lib/audit';
import { ALL_PAGES, hasPageAccess } from '@/lib/pageAccess';
import { useAuth } from '@/lib/AuthContext';
import ProdutosManager from '@/components/produtos/ProdutosManager';

const STORAGE_KEY = 'psx_company_settings';

const defaultSettings = {
  company_name: 'PSX Capital',
  contract_multa_pct: '2',
  contract_mora_pct: '1',
  contract_prazo_atraso: '3',
  company_document: '',
  company_phone: '',
  company_email: '',
  company_address: '',
  company_city: '',
  company_state: '',
  company_zip: '',
  company_pix: '',
  company_bank: '',
  company_logo_url: '',
  default_rate: '',
  default_interest_type: 'simples',
  default_installments: 1,
  show_confirm_dialogs: true,
  show_receipt_after_payment: true,
  show_operation_confirm: true,
  installment_mode_gradativo: false,
  validate_cpf_cnpj: true,
  block_over_limit: true,
  calc_mode_padrao_enabled: true,
  calc_mode_inverso_enabled: true,
  calc_mode_desconto_direto_enabled: true,
  calc_mode_juros_cedente_enabled: true,
  calc_mode_capital_desagio_enabled: true,
  arredondar_taxa_diaria: false,
  default_tarifa_operacao: 0,
  default_tarifa_por_titulo: 0,
  default_float_dias: 0,
};

// ─── Assessores ─────────────────────────────────────────────────────────────

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
    <form onSubmit={handleSubmit} className="bg-gray-50 border border-border rounded-xl p-5 space-y-4">
      <h3 className="text-sm font-bold">{initial ? 'Editar Assessor' : 'Novo Assessor'}</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">Nome completo *</label>
          <input className="input-field uppercase" value={form.name}
            onChange={e => set('name', e.target.value.toUpperCase())} placeholder="NOME DO ASSESSOR" required />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">E-mail do usuário *</label>
          <input className="input-field" type="email" value={form.user_email}
            onChange={e => set('user_email', e.target.value)} placeholder="email@empresa.com" required />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">Token de Segurança *</label>
          <div className="relative flex gap-2">
            <input className="input-field flex-1 font-mono tracking-widest"
              type={showToken ? 'text' : 'password'} value={form.token}
              onChange={e => set('token', e.target.value.toUpperCase())} required />
            <button type="button" onClick={() => setShowToken(v => !v)}
              className="px-2.5 border border-border rounded-lg hover:bg-gray-100 transition-colors">
              {showToken ? <EyeOff className="w-4 h-4 text-muted-foreground" /> : <Eye className="w-4 h-4 text-muted-foreground" />}
            </button>
            <button type="button" onClick={() => set('token', generateToken())}
              className="px-2.5 border border-border rounded-lg hover:bg-gray-100 transition-colors">
              <RefreshCw className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
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
            onChange={e => set('notes', e.target.value)} placeholder="Observações internas..." />
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

function TabAssessores() {
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

  if (loading) return <div className="flex items-center justify-center h-32"><div className="w-5 h-5 border-2 border-border border-t-foreground rounded-full animate-spin" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Assessores e Tokens de Segurança</p>
        {!showForm && (
          <button onClick={() => { setEditing(null); setShowForm(true); }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-foreground text-primary-foreground text-xs font-semibold rounded-lg hover:bg-foreground/90 transition-colors">
            <Plus className="w-3.5 h-3.5" /> Novo Assessor
          </button>
        )}
      </div>

      {showForm && (
        <AssessorForm initial={editing} onSave={handleSave}
          onCancel={() => { setShowForm(false); setEditing(null); }} />
      )}

      {assessores.length === 0 && !showForm && (
        <div className="py-12 text-center text-muted-foreground text-sm border border-dashed border-border rounded-xl">
          Nenhum assessor cadastrado.
        </div>
      )}

      {assessores.map(a => (
        <div key={a.id} className="flex items-center gap-4 p-4 border border-border rounded-xl bg-gray-50/50">
          <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm shrink-0 ${a.active ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
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
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div className="flex items-center gap-1.5 bg-white border border-border rounded-lg px-3 py-1.5">
              <span className="font-mono text-xs tracking-widest">{visibleTokens[a.id] ? a.token : '••••••••'}</span>
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
  );
}

// ─── Usuários ────────────────────────────────────────────────────────────────

const roleLabel = { admin: 'Admin', user: 'Usuário' };
const roleColors = { admin: 'bg-amber-100 text-amber-800', user: 'bg-gray-100 text-gray-700' };

function TabUsuarios() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);
  const [saving, setSaving] = useState(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('user');
  const [inviting, setInviting] = useState(false);
  const [inviteMsg, setInviteMsg] = useState('');
  const [currentUser, setCurrentUser] = useState(null);

  const fetchUsers = async () => {
    const res = await base44.functions.invoke('listUsers', {});
    return res.data.users || [];
  };

  useEffect(() => {
    Promise.all([fetchUsers(), base44.auth.me()]).then(([us, me]) => {
      setUsers(us);
      setCurrentUser(me);
      setLoading(false);
    });
  }, []);

  const togglePage = async (userId, pageKey, currentPages) => {
    const pages = currentPages || [];
    const newPages = pages.includes(pageKey) ? pages.filter(p => p !== pageKey) : [...pages, pageKey];
    setSaving(userId);
    await base44.entities.User.update(userId, { allowed_pages: newPages });
    setUsers(us => us.map(u => u.id === userId ? { ...u, allowed_pages: newPages } : u));
    setSaving(null);
  };

  const toggleActive = async (userId, current) => {
    setSaving(userId);
    await base44.entities.User.update(userId, { is_active: !current });
    setUsers(us => us.map(u => u.id === userId ? { ...u, is_active: !current } : u));
    setSaving(null);
  };

  const handleInvite = async () => {
    if (!inviteEmail.trim()) return;
    setInviting(true);
    setInviteMsg('');
    try {
      await base44.users.inviteUser(inviteEmail.trim(), inviteRole);
      setInviteMsg(`Convite enviado para ${inviteEmail}!`);
      setInviteEmail('');
      const us = await fetchUsers();
      setUsers(us);
    } catch {
      setInviteMsg('Erro ao enviar convite. Verifique o e-mail.');
    }
    setInviting(false);
  };

  if (loading) return <div className="flex items-center justify-center h-32"><div className="w-5 h-5 border-2 border-border border-t-foreground rounded-full animate-spin" /></div>;

  return (
    <div className="space-y-5">
      {/* Convidar */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Convidar Novo Usuário</p>
        <div className="flex flex-col sm:flex-row gap-3">
          <input type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)}
            placeholder="email@exemplo.com" className="input-field flex-1"
            onKeyDown={e => e.key === 'Enter' && handleInvite()} />
          <select value={inviteRole} onChange={e => setInviteRole(e.target.value)} className="input-field w-full sm:w-36">
            <option value="user">Usuário</option>
            <option value="admin">Admin</option>
          </select>
          <button onClick={handleInvite} disabled={inviting || !inviteEmail.trim()}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-foreground text-primary-foreground text-sm font-semibold rounded-lg hover:bg-foreground/90 transition-colors disabled:opacity-50 whitespace-nowrap">
            <Mail className="w-4 h-4" />
            {inviting ? 'Enviando...' : 'Enviar Convite'}
          </button>
        </div>
        {inviteMsg && (
          <p className={`mt-2 text-xs font-medium ${inviteMsg.includes('Erro') ? 'text-red-500' : 'text-emerald-600'}`}>{inviteMsg}</p>
        )}
      </div>

      {/* Lista */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          {users.length} usuário{users.length !== 1 ? 's' : ''} registrado{users.length !== 1 ? 's' : ''}
        </p>
        <div className="space-y-3">
          {users.map(u => {
            const isMe = u.email === currentUser?.email;
            const isExpanded = expandedId === u.id;
            const isAdmin = u.role === 'admin';
            const pages = u.allowed_pages || [];
            const isSaving = saving === u.id;

            return (
              <div key={u.id} className="border border-border rounded-xl overflow-hidden bg-gray-50/50">
                <div className="flex items-center gap-3 p-4">
                  <div className="w-9 h-9 rounded-full bg-[hsl(43,65%,47%)] flex items-center justify-center shrink-0">
                    <span className="text-sm font-bold text-black">
                      {u.full_name?.[0]?.toUpperCase() || u.email?.[0]?.toUpperCase() || 'U'}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold truncate">{u.full_name || u.email}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${roleColors[u.role]}`}>{roleLabel[u.role]}</span>
                      {!u.is_active && <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">Inativo</span>}
                      {isMe && <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">Você</span>}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">{u.email}</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {!isAdmin && !isMe && (
                      <button onClick={() => toggleActive(u.id, u.is_active !== false)} disabled={isSaving}
                        className={`text-xs px-3 py-1.5 rounded-lg font-medium border transition-colors ${u.is_active !== false ? 'border-border text-muted-foreground hover:border-red-200 hover:text-red-600 hover:bg-red-50' : 'border-emerald-200 text-emerald-600 bg-emerald-50 hover:bg-emerald-100'}`}>
                        {u.is_active !== false ? 'Desativar' : 'Ativar'}
                      </button>
                    )}
                    {!isAdmin && (
                      <button onClick={() => setExpandedId(isExpanded ? null : u.id)}
                        className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-gray-100 rounded-lg font-medium hover:bg-gray-200 transition-colors">
                        <Shield className="w-3.5 h-3.5" /> Permissões
                        {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                      </button>
                    )}
                    {isAdmin && (
                      <div className="flex items-center gap-1 text-xs text-amber-600 font-medium">
                        <Shield className="w-3.5 h-3.5" /> Acesso total
                      </div>
                    )}
                  </div>
                </div>
                {isExpanded && !isAdmin && (
                  <div className="border-t border-border px-4 py-4 bg-gray-50">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Páginas com acesso</p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {ALL_PAGES.map(page => {
                        const hasAccess = pages.includes(page.key);
                        return (
                          <button key={page.key} onClick={() => togglePage(u.id, page.key, pages)} disabled={isSaving}
                            className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-xs font-medium border transition-all ${hasAccess ? 'bg-foreground text-primary-foreground border-foreground' : 'bg-white border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground'}`}>
                            <div className={`w-4 h-4 rounded flex items-center justify-center shrink-0 border ${hasAccess ? 'bg-white/20 border-white/30' : 'border-border'}`}>
                              {hasAccess && <Check className="w-2.5 h-2.5 text-white" />}
                            </div>
                            {page.label}
                          </button>
                        );
                      })}
                    </div>
                    {isSaving && <div className="flex items-center gap-2 mt-3 text-xs text-muted-foreground"><div className="w-3 h-3 border border-border border-t-foreground rounded-full animate-spin" /> Salvando...</div>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Página Principal ────────────────────────────────────────────────────────

export default function Configuracoes() {
  const [settings, setSettings] = useState(defaultSettings);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState('empresa');
  const [configId, setConfigId] = useState(null);
  const { user } = useAuth();
  const podeVerProdutos = hasPageAccess(user, 'produtos');

  // Carrega da entidade (prioridade) e sincroniza com localStorage
  useEffect(() => {
    base44.entities.ConfiguracaoEmpresa.list('-created_date', 1).then(list => {
      if (list && list.length > 0) {
        const cfg = list[0];
        setConfigId(cfg.id);
        const merged = { ...defaultSettings, ...cfg };
        setSettings(merged);
        // Sincroniza localStorage para que outros componentes (ex: ContratoGerador) funcionem
        localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
      } else {
        // Fallback: carrega do localStorage se não há registro na entidade ainda
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
          try { setSettings({ ...defaultSettings, ...JSON.parse(stored) }); } catch {}
        }
      }
    }).catch(() => {
      // Se falhar, usa localStorage
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        try { setSettings({ ...defaultSettings, ...JSON.parse(stored) }); } catch {}
      }
    });
  }, []);

  const set = (k, v) => setSettings(s => ({ ...s, [k]: v }));

  const save = async () => {
    setSaving(true);
    const payload = { ...settings };
    // Remove campos internos da entidade que não devem ser enviados
    delete payload.id;
    delete payload.created_date;
    delete payload.updated_date;
    delete payload.created_by_id;

    if (configId) {
      await base44.entities.ConfiguracaoEmpresa.update(configId, payload);
    } else {
      const created = await base44.entities.ConfiguracaoEmpresa.create(payload);
      setConfigId(created.id);
    }
    // Sincroniza localStorage para compatibilidade com outros componentes
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const tabs = [
    { key: 'empresa', label: 'Empresa', icon: Building2 },
    { key: 'operacional', label: 'Operacional', icon: Shield },
    { key: 'preferencias', label: 'Preferências', icon: Bell },
    { key: 'contrato', label: 'Contrato', icon: FileText },
    { key: 'assessores', label: 'Assessores', icon: ShieldCheck },
    { key: 'usuarios', label: 'Usuários', icon: Users },
    // Produtos saiu do menu lateral e passa a ser acessado por aqui, com a
    // MESMA permissão de antes (chave 'produtos' em allowed_pages).
    ...(podeVerProdutos ? [{ key: 'produtos', label: 'Produtos', icon: Package }] : []),
  ];

  const showSaveButton = !['assessores', 'usuarios', 'produtos'].includes(tab);

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Configurações</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Dados da empresa, operacional e gestão de equipe</p>
      </div>

      {/* Tab switcher */}
      <div className="flex flex-wrap gap-0.5 bg-gray-100 rounded-lg p-1 w-fit mb-6">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-md transition-colors ${tab === t.key ? 'bg-white text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
            <t.icon className="w-3.5 h-3.5" />
            {t.label}
          </button>
        ))}
      </div>

      <div className="bg-white border border-border rounded-xl p-6 space-y-5">

        {/* ── Empresa ── */}
        {tab === 'empresa' && (
          <div>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">Dados da Empresa</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Nome / Razão Social</label>
                <input className="input-field uppercase" value={settings.company_name}
                  onChange={e => set('company_name', e.target.value.toUpperCase())} placeholder="NOME DA EMPRESA" />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">CNPJ / CPF</label>
                <input className="input-field" value={settings.company_document}
                  onChange={e => set('company_document', e.target.value)} placeholder="00.000.000/0001-00" />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Telefone</label>
                <input className="input-field" value={settings.company_phone}
                  onChange={e => set('company_phone', e.target.value)} placeholder="(11) 9 0000-0000" />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">E-mail</label>
                <input className="input-field" type="email" value={settings.company_email}
                  onChange={e => set('company_email', e.target.value)} placeholder="contato@empresa.com.br" />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Chave PIX</label>
                <input className="input-field" value={settings.company_pix}
                  onChange={e => set('company_pix', e.target.value)} placeholder="CPF, e-mail ou telefone" />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Endereço</label>
                <input className="input-field uppercase" value={settings.company_address}
                  onChange={e => set('company_address', e.target.value.toUpperCase())} placeholder="RUA, NÚMERO, BAIRRO" />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Cidade</label>
                <input className="input-field uppercase" value={settings.company_city}
                  onChange={e => set('company_city', e.target.value.toUpperCase())} />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Estado</label>
                <input className="input-field uppercase" value={settings.company_state}
                  onChange={e => set('company_state', e.target.value.toUpperCase())} placeholder="MT" maxLength={2} />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">CEP</label>
                <input className="input-field" value={settings.company_zip}
                  onChange={e => set('company_zip', e.target.value)} placeholder="00000-000" />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Banco</label>
                <input className="input-field uppercase" value={settings.company_bank}
                  onChange={e => set('company_bank', e.target.value.toUpperCase())} placeholder="BRADESCO, ITAÚ..." />
              </div>
            </div>
          </div>
        )}

        {/* ── Operacional ── */}
        {tab === 'operacional' && (
          <div>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">Padrões Operacionais</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Taxa Mensal Padrão (%)</label>
                <input className="input-field" type="number" step="0.01" value={settings.default_rate}
                  onChange={e => set('default_rate', e.target.value)} placeholder="5,00" />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Tipo de Juros Padrão</label>
                <select className="input-field" value={settings.default_interest_type} onChange={e => set('default_interest_type', e.target.value)}>
                  <option value="simples">Simples</option>
                  <option value="composto">Composto</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Parcelas Padrão</label>
                <input className="input-field" type="number" min="1" max="60" value={settings.default_installments}
                  onChange={e => set('default_installments', parseInt(e.target.value) || 1)} />
              </div>
            </div>

            {/* Modos de Cálculo */}
            <div className="border-t border-border pt-4 mt-4">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Modos de Cálculo Ativos</h4>
              <p className="text-xs text-muted-foreground mb-3">Ative ou desative os modos de cálculo disponíveis no wizard de nova operação.</p>
              <div className="space-y-2">
                {[
                  { key: 'calc_mode_padrao_enabled', label: 'Padrão', sub: 'Informe o líquido → recebível = líquido ÷ (1 − taxa)' },
                  { key: 'calc_mode_inverso_enabled', label: 'Inverso (Juros Embutido)', sub: 'Informe o valor de face → líquido = face × (1 − taxa)' },
                  { key: 'calc_mode_desconto_direto_enabled', label: 'Desconto Direto', sub: 'Informe o bruto → desconto = bruto × taxa; líquido = bruto − desconto' },
                  { key: 'calc_mode_juros_cedente_enabled', label: 'Juros do Cedente', sub: 'Sacado paga o principal sem juros; juros pertencem ao cedente' },
                  { key: 'calc_mode_capital_desagio_enabled', label: 'Capital + Deságio', sub: 'Capital no vencimento + deságio parcelado mensalmente' },
                ].map(({ key, label, sub }) => (
                  <label key={key} className="flex items-center justify-between p-3 border border-border rounded-lg cursor-pointer hover:bg-gray-50">
                    <div>
                      <div className="text-sm font-semibold">{label}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>
                    </div>
                    <button type="button" onClick={() => set(key, !settings[key])}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors shrink-0 ${settings[key] ? 'bg-foreground' : 'bg-gray-300'}`}>
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${settings[key] ? 'translate-x-4.5' : 'translate-x-0.5'}`} />
                    </button>
                  </label>
                ))}
              </div>

              {/* Arredondar taxa diária */}
              <label className="flex items-center justify-between p-3 border border-border rounded-lg cursor-pointer hover:bg-gray-50 mt-2">
                <div>
                  <div className="text-sm font-semibold">Arredondar taxa diária para 2 casas</div>
                  <div className="text-xs text-muted-foreground mt-0.5">Taxa diária = taxa mensal ÷ 30, arredondada para cima (ex: 4% ÷ 30 = 0,14% a.d.)</div>
                </div>
                <button type="button" onClick={() => set('arredondar_taxa_diaria', !settings.arredondar_taxa_diaria)}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors shrink-0 ${settings.arredondar_taxa_diaria ? 'bg-foreground' : 'bg-gray-300'}`}>
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${settings.arredondar_taxa_diaria ? 'translate-x-4.5' : 'translate-x-0.5'}`} />
                </button>
              </label>

              {/* Tarifas padrão */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">Tarifa Operação Padrão (R$)</label>
                  <input className="input-field" type="number" step="0.01" value={settings.default_tarifa_operacao}
                    onChange={e => set('default_tarifa_operacao', parseFloat(e.target.value) || 0)} placeholder="0,00" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">Tarifa por Título Padrão (R$)</label>
                  <input className="input-field" type="number" step="0.01" value={settings.default_tarifa_por_titulo}
                    onChange={e => set('default_tarifa_por_titulo', parseFloat(e.target.value) || 0)} placeholder="0,00" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">Float Padrão (dias)</label>
                  <input className="input-field" type="number" min="0" value={settings.default_float_dias}
                    onChange={e => set('default_float_dias', parseInt(e.target.value) || 0)} placeholder="0" />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Contrato ── */}
        {tab === 'contrato' && (
          <div>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">Padrões para Contrato de Confissão de Dívida</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Prazo de tolerância inadimplência (dias)</label>
                <input className="input-field" type="number" min="0" value={settings.contract_prazo_atraso}
                  onChange={e => set('contract_prazo_atraso', e.target.value)} placeholder="3" />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Multa compensatória padrão (%)</label>
                <input className="input-field" type="number" step="0.01" value={settings.contract_multa_pct}
                  onChange={e => set('contract_multa_pct', e.target.value)} placeholder="2" />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Juros de mora padrão (% a.m.)</label>
                <input className="input-field" type="number" step="0.01" value={settings.contract_mora_pct}
                  onChange={e => set('contract_mora_pct', e.target.value)} placeholder="1" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              Esses valores serão pré-preenchidos automaticamente ao gerar um novo contrato.
            </p>
          </div>
        )}

        {/* ── Preferências ── */}
        {tab === 'preferencias' && (
          <div className="space-y-4">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Interface e Comportamento</h3>
            {[
              { key: 'show_confirm_dialogs', label: 'Diálogos de confirmação', sub: 'Pedir confirmação antes de salvar, excluir ou alterar status' },
              { key: 'show_receipt_after_payment', label: 'Recibo após recebimento', sub: 'Exibir recibo automaticamente após registrar pagamento' },
              { key: 'show_operation_confirm', label: 'Relatório de confirmação antes de criar operação', sub: 'Exibir resumo detalhado antes de confirmar empréstimos e cheques' },
              { key: 'installment_mode_gradativo', label: 'Parcelas gradativas', sub: 'Parcelas com juros acumulativos — estilo financiamento bancário' },
              { key: 'block_over_limit', label: 'Bloquear operação com limite atingido', sub: 'Impede criar nova operação quando o cliente já atingiu seu limite de crédito' },
              { key: 'validate_cpf_cnpj', label: 'Validação de CPF/CNPJ', sub: 'Verificar se o CPF ou CNPJ é válido e checar duplicatas ao cadastrar clientes' },
            ].map(({ key, label, sub }) => (
              <label key={key} className="flex items-center justify-between p-4 border border-border rounded-xl cursor-pointer hover:bg-gray-50">
                <div>
                  <div className="text-sm font-semibold">{label}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>
                </div>
                <button type="button" onClick={() => set(key, !settings[key])}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors shrink-0 ${settings[key] ? 'bg-foreground' : 'bg-gray-300'}`}>
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${settings[key] ? 'translate-x-4.5' : 'translate-x-0.5'}`} />
                </button>
              </label>
            ))}
          </div>
        )}

        {/* ── Assessores ── */}
        {tab === 'assessores' && <TabAssessores />}

        {/* ── Usuários ── */}
        {tab === 'usuarios' && <TabUsuarios />}

        {/* ── Produtos de Operação ── */}
        {tab === 'produtos' && podeVerProdutos && (
          <div>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Produtos de Operação</h3>
            <p className="text-xs text-muted-foreground mb-3">
              Tipos de antecipação (Cheque, Duplicata, Boleto) e formatos de cálculo (Padrão, Inverso, Parcelado).
            </p>
            <ProdutosManager />
          </div>
        )}
      </div>

      {showSaveButton && (
        <div className="flex justify-end mt-5">
          <button onClick={save} disabled={saving}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-foreground text-primary-foreground text-sm font-semibold rounded-lg hover:bg-foreground/90 transition-colors shadow-sm disabled:opacity-60">
            <Save className="w-4 h-4" />
            {saving ? 'Salvando...' : saved ? 'Salvo!' : 'Salvar Configurações'}
          </button>
        </div>
      )}
    </div>
  );
}