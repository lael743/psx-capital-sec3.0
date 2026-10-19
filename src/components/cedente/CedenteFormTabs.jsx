import { useState } from 'react';
import { Save, CheckCircle, AlertCircle, FileText } from 'lucide-react';
import SecaoDadosCadastrais from './SecaoDadosCadastrais';
import SecaoEnderecos from './SecaoEnderecos';
import SecaoContatos from './SecaoContatos';
import SecaoBancarios from './SecaoBancarios';
import SecaoDocumentos from './SecaoDocumentos';
import SecaoCondicoesComerciais from './SecaoCondicoesComerciais';
import SecaoPessoasRelacionadas from './SecaoPessoasRelacionadas';
import { base44 } from '@/api/base44Client';
import { logAction } from '@/lib/audit';

export const emptyCedente = {
  name: '', fantasy_name: '', document: '', document_type: 'CPF', phone: '', whatsapp: '', email: '',
  address: '', city: '', state: '', zip_code: '',
  inscricao_estadual: '', inscricao_municipal: '', cnae: '', regime_tributario: '', setor_segmento: '',
  grupo_economico: '', capital_social: '', data_fundacao: '', gerente_parceiro: '',
  enderecos: [], emails: [], telefones: [],
  credit_limit: '', default_rate: '', tarifa_por_titulo: '', tarifa_por_operacao: '',
  limite_sacado_geral: '', limite_sacado_pj: '', limite_sacado_pf: '',
  bloqueado: false, recuperacao_judicial: false, emissor_ccb: false,
  vencimento_cadastro: '', float_dias: '',
  multa_atraso_pct: '', juros_pos_vencimento_pct: '', multa_prorrogacao_pct: '', tarifa_recuperacao: '',
  status_cadastro: 'em_preenchimento', contrato_mae_gerado: false,
  internal_score: 500, risk_profile: 'medio', status: 'ativo',
  bank_name: '', bank_agency: '', bank_account: '', bank_account_type: 'corrente', pix_key: '',
  notes: '', doc_rg_url: '', doc_cnh_url: '', doc_income_url: '', doc_address_url: '',
};

const SECTIONS = [
  { key: 'dados', label: 'Dados Cadastrais', icon: 'FileText' },
  { key: 'enderecos', label: 'Endereços', icon: 'FileText' },
  { key: 'contatos', label: 'Contatos', icon: 'FileText' },
  { key: 'bancarios', label: 'Bancários', icon: 'FileText' },
  { key: 'documentos', label: 'Documentos', icon: 'FileText' },
  { key: 'condicoes', label: 'Condições Comerciais', icon: 'FileText' },
  { key: 'pessoas', label: 'Pessoas Relacionadas', icon: 'FileText' },
];

function isDadosComplete(form) {
  return !!(form.name && form.document);
}
function isCondicoesComplete(form) {
  return !!(parseFloat(form.credit_limit) > 0 && parseFloat(form.default_rate) > 0);
}
function calcStatusCadastro(form) {
  return (isDadosComplete(form) && isCondicoesComplete(form)) ? 'concluido' : 'em_preenchimento';
}

export default function CedenteFormTabs({ initialForm, clientId, onSaved }) {
  const [form, setForm] = useState({ ...emptyCedente, ...initialForm });
  const [active, setActive] = useState('dados');
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(null);
  const [error, setError] = useState('');

  const setField = (field, value) => setForm(f => ({ ...f, [field]: value }));

  const sectionFilled = (key) => {
    if (key === 'dados') return isDadosComplete(form);
    if (key === 'condicoes') return isCondicoesComplete(form);
    if (key === 'enderecos') return Array.isArray(form.enderecos) && form.enderecos.length > 0;
    if (key === 'contatos') return (Array.isArray(form.emails) && form.emails.length > 0) || (Array.isArray(form.telefones) && form.telefones.length > 0);
    if (key === 'bancarios') return !!form.bank_name;
    if (key === 'documentos') return !!(form.doc_rg_url || form.doc_cnh_url || form.doc_income_url || form.doc_address_url);
    return false;
  };

  const saveSection = async (sectionKey) => {
    if (saving || !clientId) return;
    setSaving(true);
    setError('');
    try {
      const statusCadastro = calcStatusCadastro(form);
      const payload = {
        ...form,
        credit_limit: form.credit_limit === '' ? 0 : parseFloat(form.credit_limit) || 0,
        default_rate: form.default_rate === '' ? 0 : parseFloat(form.default_rate) || 0,
        capital_social: form.capital_social === '' ? 0 : parseFloat(form.capital_social) || 0,
        tarifa_por_titulo: form.tarifa_por_titulo === '' ? 0 : parseFloat(form.tarifa_por_titulo) || 0,
        tarifa_por_operacao: form.tarifa_por_operacao === '' ? 0 : parseFloat(form.tarifa_por_operacao) || 0,
        limite_sacado_geral: form.limite_sacado_geral === '' ? 0 : parseFloat(form.limite_sacado_geral) || 0,
        limite_sacado_pj: form.limite_sacado_pj === '' ? 0 : parseFloat(form.limite_sacado_pj) || 0,
        limite_sacado_pf: form.limite_sacado_pf === '' ? 0 : parseFloat(form.limite_sacado_pf) || 0,
        float_dias: form.float_dias === '' ? 0 : parseFloat(form.float_dias) || 0,
        multa_atraso_pct: form.multa_atraso_pct === '' ? 0 : parseFloat(form.multa_atraso_pct) || 0,
        juros_pos_vencimento_pct: form.juros_pos_vencimento_pct === '' ? 0 : parseFloat(form.juros_pos_vencimento_pct) || 0,
        multa_prorrogacao_pct: form.multa_prorrogacao_pct === '' ? 0 : parseFloat(form.multa_prorrogacao_pct) || 0,
        tarifa_recuperacao: form.tarifa_recuperacao === '' ? 0 : parseFloat(form.tarifa_recuperacao) || 0,
        internal_score: form.internal_score === '' ? 500 : parseInt(form.internal_score) || 500,
        status_cadastro: statusCadastro,
      };
      await base44.entities.Client.update(clientId, payload);
      setForm(f => ({ ...f, status_cadastro: statusCadastro }));
      await logAction({ action: 'update', entity: 'Client', entityId: clientId, description: `Cedente ${form.name} — seção ${sectionKey} atualizada` });

      // Workflow automático: gerar contrato mãe quando cadastro concluído
      if (statusCadastro === 'concluido' && !form.contrato_mae_gerado) {
        try {
          const res = await base44.functions.invoke('gerarContratoMae', { cedente_id: clientId });
          if (res.data?.success && !res.data.already_exists) {
            setForm(f => ({ ...f, contrato_mae_gerado: true }));
            setSavedFlash({ section: sectionKey, message: `Seção salva! Contrato Mãe gerado automaticamente (${res.data.ctr_number}).` });
          } else {
            setSavedFlash({ section: sectionKey, message: 'Seção salva com sucesso.' });
          }
        } catch (e) {
          setSavedFlash({ section: sectionKey, message: 'Seção salva, mas falha ao gerar contrato mãe: ' + (e.message || '') });
        }
      } else {
        setSavedFlash({ section: sectionKey, message: 'Seção salva com sucesso.' });
      }
      onSaved?.();
      setTimeout(() => setSavedFlash(null), 4000);
    } catch (e) {
      setError(e.message || 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  const sectionProps = { form, setField, setForm, saving, saveSection, savedFlash, error, clientId };

  return (
    <div className="flex flex-col lg:flex-row gap-6">
      {/* Sidebar nav */}
      <aside className="lg:w-64 shrink-0">
        <div className="bg-white border border-border rounded-xl p-3 lg:sticky lg:top-4">
          <div className="mb-3 px-2">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status da Ficha</div>
            <div className={`mt-1 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${form.status_cadastro === 'concluido' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
              {form.status_cadastro === 'concluido' ? <CheckCircle className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
              {form.status_cadastro === 'concluido' ? 'Concluído' : 'Em Preenchimento'}
            </div>
          </div>
          <nav className="space-y-0.5">
            {SECTIONS.map(s => {
              const isActive = active === s.key;
              const filled = sectionFilled(s.key);
              return (
                <button
                  key={s.key}
                  onClick={() => setActive(s.key)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${isActive ? 'bg-foreground text-primary-foreground' : 'text-foreground/70 hover:bg-gray-100'}`}
                >
                  <span className={`w-2 h-2 rounded-full shrink-0 ${filled ? 'bg-emerald-400' : isActive ? 'bg-amber-300' : 'bg-gray-300'}`} />
                  <span className="text-left flex-1">{s.label}</span>
                </button>
              );
            })}
          </nav>
        </div>
      </aside>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {active === 'dados' && <SecaoDadosCadastrais {...sectionProps} />}
        {active === 'enderecos' && <SecaoEnderecos {...sectionProps} />}
        {active === 'contatos' && <SecaoContatos {...sectionProps} />}
        {active === 'bancarios' && <SecaoBancarios {...sectionProps} />}
        {active === 'documentos' && <SecaoDocumentos {...sectionProps} />}
        {active === 'condicoes' && <SecaoCondicoesComerciais {...sectionProps} />}
        {active === 'pessoas' && <SecaoPessoasRelacionadas {...sectionProps} />}
      </div>
    </div>
  );
}