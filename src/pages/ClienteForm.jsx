import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { ArrowLeft, AlertCircle, Loader2 } from 'lucide-react';
import CedenteFormTabs, { emptyCedente } from '@/components/cedente/CedenteFormTabs';
import { applyDocMask } from '@/lib/cedenteMasks';
import { logAction } from '@/lib/audit';
import { useCnpjLookup } from '@/hooks/useCnpjLookup';

export default function ClienteForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = Boolean(id && id !== 'novo');

  const [loading, setLoading] = useState(isEdit);
  const [client, setClient] = useState(null);

  // Create mode state
  const [createForm, setCreateForm] = useState({ name: '', document: '', document_type: 'CPF' });
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  const handleCnpjResult = useCallback((data) => {
    setCreateForm(f => ({
      ...f,
      name: (data.razao_social || f.name || '').toUpperCase(),
    }));
  }, []);
  const { loading: cnpjLoading, error: cnpjError, lookup: lookupCnpj } = useCnpjLookup(handleCnpjResult);

  useEffect(() => {
    if (isEdit) {
      base44.entities.Client.get(id).then(data => {
        setClient(data);
        setLoading(false);
      });
    }
  }, [id]);

  const handleCreate = async () => {
    if (!createForm.name || !createForm.document) {
      setCreateError('Nome e documento são obrigatórios.');
      return;
    }
    setCreating(true);
    setCreateError('');
    try {
      const numericFields = ['credit_limit','default_rate','capital_social','tarifa_por_titulo','tarifa_por_operacao','limite_sacado_geral','limite_sacado_pj','limite_sacado_pf','float_dias','multa_atraso_pct','juros_pos_vencimento_pct','multa_prorrogacao_pct','tarifa_recuperacao'];
      const sanitized = { ...emptyCedente };
      numericFields.forEach(k => { sanitized[k] = 0; });
      const created = await base44.entities.Client.create({
        ...sanitized,
        name: createForm.name.toUpperCase(),
        document: applyDocMask(createForm.document, createForm.document_type),
        document_type: createForm.document_type,
        status_cadastro: 'em_preenchimento',
      });
      await logAction({ action: 'create', entity: 'Client', entityId: created.id, description: `Cedente ${createForm.name} criado` });
      navigate(`/clientes/${created.id}/editar`);
    } catch (e) {
      setCreateError(e.message || 'Erro ao criar cedente');
    } finally {
      setCreating(false);
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-6 h-6 border-2 border-border border-t-foreground rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate('/clientes')} className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-foreground">{isEdit ? 'Editar Cedente' : 'Novo Cedente'}</h1>
          <p className="text-sm text-muted-foreground">{isEdit ? 'Preencha os dados do cedente' : 'Crie o cedente para depois configurar todas as seções'}</p>
        </div>
      </div>

      {!isEdit ? (
        <div className="bg-white border border-border rounded-xl p-6 max-w-xl">
          <h2 className="text-base font-bold mb-1">Identificação Inicial</h2>
          <p className="text-xs text-muted-foreground mb-4">Informe o nome e documento para criar o cedente. As demais seções serão preenchidas na edição.</p>
          {createError && (
            <div className="mb-3 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{createError}</div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Tipo</label>
              <select className="input-field" value={createForm.document_type} onChange={e => setCreateForm(f => ({ ...f, document_type: e.target.value, document: '' }))}>
                <option value="CPF">Pessoa Física</option>
                <option value="CNPJ">Pessoa Jurídica</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">{createForm.document_type} *</label>
              <div className="relative">
                <input
                  className="input-field font-mono pr-9"
                  value={createForm.document}
                  onChange={e => {
                    const masked = applyDocMask(e.target.value, createForm.document_type);
                    setCreateForm(f => ({ ...f, document: masked }));
                    if (createForm.document_type === 'CNPJ') lookupCnpj(masked);
                  }}
                  placeholder={createForm.document_type === 'CPF' ? '000.000.000-00' : '00.000.000/0001-00'}
                />
                {cnpjLoading && (
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />
                )}
              </div>
              {cnpjError && <p className="text-xs text-amber-600 mt-1">{cnpjError}</p>}
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">{createForm.document_type === 'CNPJ' ? 'Razão Social' : 'Nome Completo'} *</label>
              <input className="input-field uppercase" value={createForm.name} onChange={e => setCreateForm(f => ({ ...f, name: e.target.value.toUpperCase() }))} placeholder={createForm.document_type === 'CNPJ' ? 'RAZÃO SOCIAL' : 'NOME COMPLETO'} />
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-5">
            <button onClick={() => navigate('/clientes')} className="px-4 py-2 text-sm font-medium border border-border rounded-lg hover:bg-gray-50">Cancelar</button>
            <button onClick={handleCreate} disabled={creating} className="inline-flex items-center gap-2 px-5 py-2 bg-foreground text-primary-foreground text-sm font-semibold rounded-lg hover:bg-foreground/90 disabled:opacity-50">
              {creating ? 'Criando...' : 'Criar Cedente'}
            </button>
          </div>
        </div>
      ) : (
        <CedenteFormTabs initialForm={client} clientId={id} onSaved={() => {}} />
      )}
    </div>
  );
}