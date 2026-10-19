import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Users, Mail, Shield, ChevronDown, ChevronUp, Check, X, UserPlus, Trash2 } from 'lucide-react';
import { ALL_PAGES } from '@/lib/pageAccess';

const roleLabel = { admin: 'Admin', user: 'Usuário' };
const roleColors = { admin: 'bg-amber-100 text-amber-800', user: 'bg-gray-100 text-gray-700' };

export default function GerenciarUsuarios() {
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
    Promise.all([
      fetchUsers(),
      base44.auth.me(),
    ]).then(([us, me]) => {
      setUsers(us);
      setCurrentUser(me);
      setLoading(false);
    });
  }, []);

  const togglePage = async (userId, pageKey, currentPages) => {
    const pages = currentPages || [];
    const newPages = pages.includes(pageKey)
      ? pages.filter(p => p !== pageKey)
      : [...pages, pageKey];
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
      // Refresh users
      const us = await fetchUsers();
      setUsers(us);
    } catch (e) {
      setInviteMsg('Erro ao enviar convite. Verifique o e-mail.');
    }
    setInviting(false);
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-6 h-6 border-2 border-border border-t-foreground rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Gerenciar Usuários</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Convide usuários e controle o acesso às páginas</p>
      </div>

      {/* Convidar usuário */}
      <div className="bg-white border border-border rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <UserPlus className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-sm font-bold">Convidar Novo Usuário</h2>
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="email"
            value={inviteEmail}
            onChange={e => setInviteEmail(e.target.value)}
            placeholder="email@exemplo.com"
            className="input-field flex-1"
            onKeyDown={e => e.key === 'Enter' && handleInvite()}
          />
          <select
            value={inviteRole}
            onChange={e => setInviteRole(e.target.value)}
            className="input-field w-full sm:w-36"
          >
            <option value="user">Usuário</option>
            <option value="admin">Admin</option>
          </select>
          <button
            onClick={handleInvite}
            disabled={inviting || !inviteEmail.trim()}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-foreground text-primary-foreground text-sm font-semibold rounded-lg hover:bg-foreground/90 transition-colors disabled:opacity-50 whitespace-nowrap"
          >
            <Mail className="w-4 h-4" />
            {inviting ? 'Enviando...' : 'Enviar Convite'}
          </button>
        </div>
        {inviteMsg && (
          <p className={`mt-3 text-xs font-medium ${inviteMsg.includes('Erro') ? 'text-red-500' : 'text-emerald-600'}`}>
            {inviteMsg}
          </p>
        )}
      </div>

      {/* Lista de usuários */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium uppercase tracking-wider px-1">
          <Users className="w-3.5 h-3.5" />
          {users.length} usuário{users.length !== 1 ? 's' : ''} registrado{users.length !== 1 ? 's' : ''}
        </div>

        {users.map(u => {
          const isMe = u.email === currentUser?.email;
          const isExpanded = expandedId === u.id;
          const isAdmin = u.role === 'admin';
          const pages = u.allowed_pages || [];
          const isSaving = saving === u.id;

          return (
            <div key={u.id} className="bg-white border border-border rounded-xl overflow-hidden">
              <div className="flex items-center gap-3 p-4">
                <div className="w-9 h-9 rounded-full bg-[hsl(43,65%,47%)] flex items-center justify-center shrink-0">
                  <span className="text-sm font-bold text-black">
                    {u.full_name?.[0]?.toUpperCase() || u.email?.[0]?.toUpperCase() || 'U'}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold truncate">{u.full_name || u.email}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${roleColors[u.role]}`}>
                      {roleLabel[u.role]}
                    </span>
                    {!u.is_active && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">Inativo</span>
                    )}
                    {isMe && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">Você</span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">{u.email}</div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {!isAdmin && !isMe && (
                    <button
                      onClick={() => toggleActive(u.id, u.is_active !== false)}
                      disabled={isSaving}
                      className={`text-xs px-3 py-1.5 rounded-lg font-medium border transition-colors ${u.is_active !== false ? 'border-border text-muted-foreground hover:border-red-200 hover:text-red-600 hover:bg-red-50' : 'border-emerald-200 text-emerald-600 bg-emerald-50 hover:bg-emerald-100'}`}
                    >
                      {u.is_active !== false ? 'Desativar' : 'Ativar'}
                    </button>
                  )}
                  {!isAdmin && (
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : u.id)}
                      className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-gray-100 rounded-lg font-medium hover:bg-gray-200 transition-colors"
                    >
                      <Shield className="w-3.5 h-3.5" />
                      Permissões
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

              {/* Permissões expandidas */}
              {isExpanded && !isAdmin && (
                <div className="border-t border-border px-4 py-4 bg-gray-50/50">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                    Páginas com acesso
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {ALL_PAGES.map(page => {
                      const hasAccess = pages.includes(page.key);
                      return (
                        <button
                          key={page.key}
                          onClick={() => togglePage(u.id, page.key, pages)}
                          disabled={isSaving}
                          className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-xs font-medium border transition-all ${
                            hasAccess
                              ? 'bg-foreground text-primary-foreground border-foreground'
                              : 'bg-white border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground'
                          }`}
                        >
                          <div className={`w-4 h-4 rounded flex items-center justify-center shrink-0 border ${hasAccess ? 'bg-white/20 border-white/30' : 'border-border'}`}>
                            {hasAccess && <Check className="w-2.5 h-2.5 text-white" />}
                          </div>
                          {page.label}
                        </button>
                      );
                    })}
                  </div>
                  {isSaving && (
                    <div className="flex items-center gap-2 mt-3 text-xs text-muted-foreground">
                      <div className="w-3 h-3 border border-border border-t-foreground rounded-full animate-spin" />
                      Salvando...
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}