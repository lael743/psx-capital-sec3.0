import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Plus, Copy, Check, Link as LinkIcon, User, Building2, Clock, CheckCircle, AlertCircle } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import { DataTable, TableHead, Th, TableBody, Tr, Td, EmptyRow } from '@/components/ui/DataTable';
import { formatDate } from '@/lib/finance';

export default function OnboardingLinks() {
  const [links, setLinks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [newTipo, setNewTipo] = useState('cedente');
  const [newExpiry, setNewExpiry] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [creating, setCreating] = useState(false);
  const [copiedId, setCopiedId] = useState(null);

  const load = () => {
    base44.entities.ClienteOnboarding.list('-created_date', 200).then(data => {
      setLinks(data);
      setLoading(false);
    });
  };

  useEffect(() => { load(); }, []);

  const generateToken = () => {
    return crypto.randomUUID().replace(/-/g, '').slice(0, 24);
  };

  const createLink = async () => {
    setCreating(true);
    try {
      const token = generateToken();
      await base44.entities.ClienteOnboarding.create({
        tipo: newTipo,
        token,
        status: 'pendente',
        expires_at: newExpiry || undefined,
        notes: newNotes || undefined,
      });
      setShowModal(false);
      setNewNotes('');
      setNewExpiry('');
      load();
    } catch (e) {
      alert('Erro ao criar link: ' + e.message);
    }
    setCreating(false);
  };

  const copyLink = (token) => {
    const url = `${window.location.origin}/onboarding/${token}`;
    navigator.clipboard.writeText(url);
    setCopiedId(token);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const sendWhatsApp = (token, tipo) => {
    const url = `${window.location.origin}/onboarding/${token}`;
    const msg = encodeURIComponent(
      `Olá! Você foi convidado para se cadastrar como ${tipo === 'cedente' ? 'Cedente' : 'Sacado'} na PSX Capital.\n\nAcesse o link abaixo e preencha seus dados:\n${url}`
    );
    window.open(`https://wa.me/?text=${msg}`, '_blank');
  };

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <PageHeader
        title="Links de Cadastro"
        subtitle="Gere links para clientes preencherem seus dados"
        action={
          <button
            onClick={() => setShowModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-foreground text-primary-foreground text-sm font-semibold rounded-lg hover:bg-foreground/90 transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" /> Novo Link
          </button>
        }
      />

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="w-6 h-6 border-2 border-border border-t-foreground rounded-full animate-spin" />
        </div>
      ) : (
        <DataTable>
          <TableHead>
            <Th>Tipo</Th>
            <Th>Token</Th>
            <Th className="hidden md:table-cell">Criado em</Th>
            <Th className="hidden lg:table-cell">Expira</Th>
            <Th>Status</Th>
            <Th className="hidden md:table-cell">Cliente</Th>
            <Th>Ações</Th>
          </TableHead>
          <TableBody>
            {links.map(l => (
              <Tr key={l.id}>
                <Td>
                  <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${l.tipo === 'cedente' ? 'text-blue-700' : 'text-purple-700'}`}>
                    {l.tipo === 'cedente' ? <Building2 className="w-3.5 h-3.5" /> : <User className="w-3.5 h-3.5" />}
                    {l.tipo === 'cedente' ? 'Cedente' : 'Sacado'}
                  </span>
                </Td>
                <Td mono className="text-xs text-muted-foreground">{l.token?.slice(0, 12)}...</Td>
                <Td muted className="hidden md:table-cell text-xs">{formatDate(l.created_date)}</Td>
                <Td muted className="hidden lg:table-cell text-xs">{l.expires_at ? formatDate(l.expires_at) : '—'}</Td>
                <Td>
                  {l.status === 'pendente' && <span className="inline-flex items-center gap-1 text-xs text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full"><Clock className="w-3 h-3" /> Pendente</span>}
                  {l.status === 'preenchido' && <span className="inline-flex items-center gap-1 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full"><CheckCircle className="w-3 h-3" /> Preenchido</span>}
                  {l.status === 'expirado' && <span className="inline-flex items-center gap-1 text-xs text-red-700 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full"><AlertCircle className="w-3 h-3" /> Expirado</span>}
                </Td>
                <Td className="hidden md:table-cell text-xs">
                  {l.client_name ? (
                    <span className="font-medium text-foreground">{l.client_name}</span>
                  ) : <span className="text-muted-foreground">—</span>}
                </Td>
                <Td>
                  <div className="flex items-center gap-1">
                    {l.status === 'pendente' && (
                      <>
                        <button
                          onClick={() => copyLink(l.token)}
                          className="p-1.5 rounded-md hover:bg-gray-100 text-muted-foreground hover:text-foreground transition-colors"
                          title="Copiar link"
                        >
                          {copiedId === l.token ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                        <button
                          onClick={() => sendWhatsApp(l.token, l.tipo)}
                          className="p-1.5 rounded-md hover:bg-gray-100 text-emerald-600 transition-colors"
                          title="Enviar via WhatsApp"
                        >
                          <LinkIcon className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                </Td>
              </Tr>
            ))}
            {links.length === 0 && <EmptyRow colSpan={7} message="Nenhum link criado ainda." />}
          </TableBody>
        </DataTable>
      )}

      {/* Modal: Novo Link */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h3 className="text-sm font-bold">Gerar Link de Cadastro</h3>
              <button onClick={() => setShowModal(false)} className="p-1.5 rounded-lg hover:bg-gray-100 text-muted-foreground">✕</button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-2">Tipo de Cliente *</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setNewTipo('cedente')}
                    className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border-2 text-sm font-semibold transition-colors ${
                      newTipo === 'cedente' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-border text-muted-foreground hover:bg-gray-50'
                    }`}
                  >
                    <Building2 className="w-4 h-4" /> Cedente
                  </button>
                  <button
                    onClick={() => setNewTipo('sacado')}
                    className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border-2 text-sm font-semibold transition-colors ${
                      newTipo === 'sacado' ? 'border-purple-500 bg-purple-50 text-purple-700' : 'border-border text-muted-foreground hover:bg-gray-50'
                    }`}
                  >
                    <User className="w-4 h-4" /> Sacado
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Expiração (opcional)</label>
                <input type="date" className="input-field" value={newExpiry} onChange={e => setNewExpiry(e.target.value)} min={new Date().toISOString().split('T')[0]} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Observações (opcional)</label>
                <textarea className="input-field" rows={2} value={newNotes} onChange={e => setNewNotes(e.target.value)} placeholder="Notas internas sobre este link..." />
              </div>
              <div className="flex gap-3 pt-1">
                <button onClick={() => setShowModal(false)} className="flex-1 px-4 py-2.5 border border-border text-sm font-semibold rounded-xl hover:bg-gray-50">Cancelar</button>
                <button onClick={createLink} disabled={creating} className="flex-1 px-4 py-2.5 bg-foreground text-primary-foreground text-sm font-bold rounded-xl hover:bg-foreground/90 disabled:opacity-50">
                  {creating ? 'Gerando...' : 'Gerar Link'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}