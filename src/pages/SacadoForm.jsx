import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { ArrowLeft, Save, AlertCircle, Loader2 } from 'lucide-react';
import { applyDocMask } from '@/lib/cedenteMasks';
import { maskPhone, unmaskPhone } from '@/lib/masks';
import { logAction } from '@/lib/audit';
import { useCnpjLookup } from '@/hooks/useCnpjLookup';

const empty = { nome: '', document: '', document_type: 'CPF', phone: '', email: '', address: '', city: '', state: '', zip_code: '', status: 'ativo', notes: '' };

export default function SacadoForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = Boolean(id && id !== 'novo');
  const [form, setForm] = useState(empty);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [cnpjMsg, setCnpjMsg] = useState('');

  const handleCnpjResult = useCallback((data) => {
    setCnpjMsg(`Dados preenchidos via BrasilAPI: ${data.razao_social}`);
    setForm(f => ({
      ...f,
      nome: (data.razao_social || f.nome || '').toUpperCase(),
      address: data.endereco_completo || f.address,
      city: (data.municipio || f.city || '').toUpperCase(),
      state: data.uf || f.state,
      zip_code: data.cep || f.zip_code,
      phone: data.telefone ? data.telefone.replace(/\D/g, '') : f.phone,
      email: data.email ? data.email.toLowerCase() : f.email,
    }));
  }, []);
  const { loading: cnpjLoading, error: cnpjError, lookup: lookupCnpj } = useCnpjLookup(handleCnpjResult);

  useEffect(() => {
    if (isEdit) {
      base44.entities.Sacado.get(id).then(data => {
        if (data) setForm({ ...empty, ...data });
        setLoading(false);
      });
    }
  }, [id]);

  const set = (field, value) => setForm(f => ({ ...f, [field]: value }));

  const save = async () => {
    if (!form.nome || !form.document) { setError('Nome e documento são obrigatórios.'); return; }
    setSaving(true);
    setError('');
    try {
      const payload = { ...form, document: applyDocMask(form.document, form.document_type) };
      if (isEdit) {
        await base44.entities.Sacado.update(id, payload);
        await logAction({ action: 'update', entity: 'Sacado', entityId: id, description: `Sacado ${form.nome} atualizado` });
      } else {
        const created = await base44.entities.Sacado.create(payload);
        await logAction({ action: 'create', entity: 'Sacado', entityId: created.id, description: `Sacado ${form.nome} criado` });
      }
      navigate('/sacados');
    } catch (e) {
      setError(e.message || 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-6 h-6 border-2 border-border border-t-foreground rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate('/sacados')} className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div>
          <h1 className="text-xl font-bold">{isEdit ? 'Editar Sacado' : 'Novo Sacado'}</h1>
          <p className="text-sm text-muted-foreground">Cadastro do sacado/pagador</p>
        </div>
      </div>

      {error && <div className="mb-4 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{error}</div>}

      <div className="bg-white border border-border rounded-xl p-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Tipo</label>
            <select className="input-field" value={form.document_type} onChange={e => set('document_type', e.target.value)}>
              <option value="CPF">Pessoa Física</option>
              <option value="CNPJ">Pessoa Jurídica</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">{form.document_type} *</label>
            <div className="relative">
              <input
                className="input-field font-mono pr-9"
                value={form.document}
                onChange={e => {
                  const masked = applyDocMask(e.target.value, form.document_type);
                  set('document', masked);
                  if (form.document_type === 'CNPJ') lookupCnpj(masked);
                }}
                placeholder={form.document_type === 'CPF' ? '000.000.000-00' : '00.000.000/0001-00'}
              />
              {form.document_type === 'CNPJ' && cnpjLoading && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />
              )}
            </div>
            {form.document_type === 'CNPJ' && cnpjError && <p className="text-xs text-amber-600 mt-1">{cnpjError}</p>}
            {form.document_type === 'CNPJ' && cnpjMsg && !cnpjError && <p className="text-xs text-emerald-600 mt-1">{cnpjMsg}</p>}
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Nome / Razão Social *</label>
            <input className="input-field uppercase" value={form.nome} onChange={e => set('nome', e.target.value.toUpperCase())} placeholder="NOME / RAZÃO SOCIAL" />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Telefone</label>
            <input className="input-field" value={maskPhone(form.phone)} onChange={e => set('phone', unmaskPhone(e.target.value))} placeholder="(69) 90000-0000" />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">E-mail</label>
            <input type="email" className="input-field" value={form.email} onChange={e => set('email', e.target.value.toLowerCase())} placeholder="email@exemplo.com" />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Endereço</label>
            <input className="input-field uppercase" value={form.address} onChange={e => set('address', e.target.value.toUpperCase())} placeholder="RUA, NÚMERO, BAIRRO" />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Cidade</label>
            <input className="input-field uppercase" value={form.city} onChange={e => set('city', e.target.value.toUpperCase())} />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Estado</label>
            <input className="input-field uppercase" maxLength={2} value={form.state} onChange={e => set('state', e.target.value.toUpperCase())} placeholder="RO" />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">CEP</label>
            <input className="input-field" value={form.zip_code} onChange={e => set('zip_code', e.target.value)} placeholder="00000-000" />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Status</label>
            <select className="input-field" value={form.status} onChange={e => set('status', e.target.value)}>
              <option value="ativo">Ativo</option>
              <option value="inativo">Inativo</option>
              <option value="risco">Risco</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Observações</label>
            <textarea className="input-field min-h-[80px] resize-none" value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Observações sobre o sacado..." />
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-5">
          <button onClick={() => navigate('/sacados')} className="px-4 py-2 text-sm font-medium border border-border rounded-lg hover:bg-gray-50">Cancelar</button>
          <button onClick={save} disabled={saving} className="inline-flex items-center gap-2 px-5 py-2 bg-foreground text-primary-foreground text-sm font-semibold rounded-lg hover:bg-foreground/90 disabled:opacity-50">
            <Save className="w-4 h-4" /> {saving ? 'Salvando...' : 'Salvar Sacado'}
          </button>
        </div>
      </div>
    </div>
  );
}