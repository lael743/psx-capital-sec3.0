import { useState, useCallback } from 'react';
import { Save, AlertCircle, MessageCircle, Loader2 } from 'lucide-react';
import { maskPhone, unmaskPhone } from '@/lib/masks';
import { applyDocMask } from '@/lib/cedenteMasks';
import { useCnpjLookup } from '@/hooks/useCnpjLookup';

export default function SecaoDadosCadastrais({ form, setField, setForm, saving, saveSection, savedFlash, error }) {
  const isPJ = form.document_type === 'CNPJ';
  const [cnpjMsg, setCnpjMsg] = useState('');

  const handleCnpjResult = useCallback((data) => {
    setCnpjMsg(`Dados preenchidos via BrasilAPI: ${data.razao_social}`);
    setField('name', (data.razao_social || '').toUpperCase());
    if (data.nome_fantasia) setField('fantasy_name', data.nome_fantasia.toUpperCase());
    if (data.cnae_fiscal) setField('cnae', data.cnae_fiscal);
    if (data.capital_social) setField('capital_social', data.capital_social);
    if (data.data_inicio_atividade) setField('data_fundacao', data.data_inicio_atividade);
    if (data.telefone) setField('phone', data.telefone.replace(/\D/g, ''));
    if (data.email) setField('email', data.email.toLowerCase());
    // Preenche endereço principal se não houver
    if (data.logradouro || data.municipio) {
      setForm(f => {
        const enderecos = Array.isArray(f.enderecos) ? [...f.enderecos] : [];
        const idx = enderecos.findIndex(e => e.principal);
        const novoEnd = {
          tipo: 'Comercial',
          cep: data.cep || '',
          logradouro: (data.logradouro || '').toUpperCase(),
          numero: data.numero || '',
          bairro: (data.bairro || '').toUpperCase(),
          cidade: (data.municipio || '').toUpperCase(),
          uf: data.uf || '',
          complemento: data.complemento || '',
          principal: true,
        };
        if (idx >= 0) {
          enderecos[idx] = { ...enderecos[idx], ...novoEnd, tipo: enderecos[idx].tipo || 'Comercial' };
        } else {
          // garante que apenas um seja principal
          enderecos.forEach(e => { e.principal = false; });
          enderecos.push(novoEnd);
        }
        return { ...f, enderecos };
      });
    }
  }, [setField, setForm]);

  const { loading: cnpjLoading, error: cnpjError, lookup: lookupCnpj } = useCnpjLookup(handleCnpjResult);

  return (
    <div className="bg-white border border-border rounded-xl p-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-base font-bold">Dados Cadastrais</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Identificação do cedente e informações cadastrais.</p>
        </div>
        <button
          onClick={() => saveSection('dados')}
          disabled={saving}
          className="inline-flex items-center gap-2 px-4 py-2 bg-foreground text-primary-foreground text-sm font-semibold rounded-lg hover:bg-foreground/90 disabled:opacity-50"
        >
          <Save className="w-3.5 h-3.5" /> {saving ? 'Salvando...' : 'Salvar'}
        </button>
      </div>

      {savedFlash?.section === 'dados' && (
        <div className="mb-4 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">{savedFlash.message}</div>
      )}
      {error && <div className="mb-4 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">Tipo de Identificação</label>
          <select className="input-field" value={form.document_type} onChange={e => { setField('document_type', e.target.value); setField('document', ''); }}>
            <option value="CPF">Pessoa Física</option>
            <option value="CNPJ">Pessoa Jurídica</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">{isPJ ? 'CNPJ' : 'CPF'} *</label>
          <div className="relative">
            <input
              className="input-field font-mono pr-9"
              value={form.document}
              onChange={e => {
                const masked = applyDocMask(e.target.value, form.document_type);
                setField('document', masked);
                if (isPJ) lookupCnpj(masked);
              }}
              placeholder={isPJ ? '00.000.000/0001-00' : '000.000.000-00'}
            />
            {isPJ && cnpjLoading && (
              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />
            )}
          </div>
          {isPJ && cnpjError && <p className="text-xs text-amber-600 mt-1">{cnpjError}</p>}
          {isPJ && cnpjMsg && !cnpjError && <p className="text-xs text-emerald-600 mt-1">{cnpjMsg}</p>}
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">{isPJ ? 'Razão Social' : 'Nome Completo'} *</label>
          <input className="input-field uppercase" value={form.name} onChange={e => setField('name', e.target.value.toUpperCase())} placeholder={isPJ ? 'RAZÃO SOCIAL' : 'NOME COMPLETO'} />
        </div>

        {isPJ && (
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Nome Fantasia</label>
            <input className="input-field uppercase" value={form.fantasy_name} onChange={e => setField('fantasy_name', e.target.value.toUpperCase())} placeholder="NOME FANTASIA" />
          </div>
        )}
        {isPJ && (
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Inscrição Estadual</label>
            <input className="input-field" value={form.inscricao_estadual} onChange={e => setField('inscricao_estadual', e.target.value)} placeholder="000.000.000" />
          </div>
        )}
        {isPJ && (
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Inscrição Municipal</label>
            <input className="input-field" value={form.inscricao_municipal} onChange={e => setField('inscricao_municipal', e.target.value)} placeholder="000.000.000" />
          </div>
        )}
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">CNAE {isPJ ? 'Principal' : 'Ocupação'}</label>
          <input className="input-field" value={form.cnae} onChange={e => setField('cnae', e.target.value)} placeholder="0000-0/00" />
        </div>
        {isPJ && (
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Regime Tributário</label>
            <select className="input-field" value={form.regime_tributario || ''} onChange={e => setField('regime_tributario', e.target.value)}>
              <option value="">Selecione...</option>
              <option value="simples_nacional">Simples Nacional</option>
              <option value="lucro_presumido">Lucro Presumido</option>
              <option value="lucro_real">Lucro Real</option>
              <option value="mei">MEI</option>
              <option value="outro">Outro</option>
            </select>
          </div>
        )}
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">Setor / Segmento</label>
          <input className="input-field" value={form.setor_segmento} onChange={e => setField('setor_segmento', e.target.value)} placeholder="Ex: Transportes, Varejo" />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">Grupo Econômico</label>
          <input className="input-field" value={form.grupo_economico} onChange={e => setField('grupo_economico', e.target.value)} placeholder="Grupo econômico" />
        </div>
        {isPJ && (
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Capital Social (R$)</label>
            <input type="number" step="0.01" className="input-field" value={form.capital_social} onChange={e => setField('capital_social', e.target.value)} placeholder="0,00" />
          </div>
        )}
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">Data de {isPJ ? 'Fundação' : 'Nascimento'}</label>
          <input type="date" className="input-field" value={form.data_fundacao || ''} onChange={e => setField('data_fundacao', e.target.value)} />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">Gerente Parceiro</label>
          <input className="input-field" value={form.gerente_parceiro} onChange={e => setField('gerente_parceiro', e.target.value)} placeholder="Nome do gerente" />
        </div>

        <div className="border-t border-border pt-4 mt-2 sm:col-span-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Telefones e E-mail Principal</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Telefone</label>
              <input className="input-field" value={maskPhone(form.phone)} onChange={e => setField('phone', unmaskPhone(e.target.value))} placeholder="(69) 90000-0000" />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">WhatsApp</label>
              <div className="flex gap-2">
                <input className="input-field flex-1" value={maskPhone(form.whatsapp)} onChange={e => setField('whatsapp', unmaskPhone(e.target.value))} placeholder="(69) 90000-0000" />
                {form.whatsapp && (
                  <a href={`https://wa.me/55${form.whatsapp.replace(/\D/g, '')}`} target="_blank" rel="noreferrer" className="flex items-center px-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-600 hover:bg-emerald-100">
                    <MessageCircle className="w-4 h-4" />
                  </a>
                )}
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">E-mail</label>
              <input type="email" className="input-field" value={form.email} onChange={e => setField('email', e.target.value.toLowerCase())} placeholder="email@exemplo.com" />
            </div>
          </div>
        </div>

        <div className="border-t border-border pt-4 sm:col-span-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Status e Risco</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Status do Cadastro</label>
              <select className="input-field" value={form.status} onChange={e => setField('status', e.target.value)}>
                <option value="ativo">Ativo</option>
                <option value="bloqueado">Bloqueado</option>
                <option value="risco">Risco</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Perfil de Risco</label>
              <select className="input-field" value={form.risk_profile} onChange={e => setField('risk_profile', e.target.value)}>
                <option value="baixo">Baixo</option>
                <option value="medio">Médio</option>
                <option value="alto">Alto</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Score Interno (0-1000)</label>
              <input type="number" min={0} max={1000} className="input-field" value={form.internal_score} onChange={e => setField('internal_score', e.target.value)} />
            </div>
          </div>
        </div>
      </div>
      <p className="mt-4 text-xs text-muted-foreground flex items-center gap-1"><AlertCircle className="w-3 h-3" /> Campos com * são obrigatórios para concluir o cadastro.</p>
    </div>
  );
}