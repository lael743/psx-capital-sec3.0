import { useEffect, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { Shield, CheckCircle, AlertTriangle, Loader2, Lock, FileText, Upload, X, MapPin, User, FileCheck } from 'lucide-react';
import { invokePublic, invokePublicGet } from '@/lib/publicApi';
import { maskCpfCnpj, maskPhone, unmaskPhone } from '@/lib/masks';

const UF_OPTIONS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA',
  'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
];

export default function OnboardingPublico() {
  const { token } = useParams();
  const [step, setStep] = useState('loading'); // loading | form | success | error
  const [linkData, setLinkData] = useState(null);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('dados');
  const [submitting, setSubmitting] = useState(false);
  const [cepLoading, setCepLoading] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const fileInputRefs = { rg: useRef(null), cnh: useRef(null), residencia: useRef(null), renda: useRef(null) };

  const [form, setForm] = useState({
    document: '',
    name: '',
    email: '',
    whatsapp: '',
    cep: '',
    logradouro: '',
    numero: '',
    complemento: '',
    bairro: '',
    cidade: '',
    uf: '',
    lgpd_accepted: false,
  });

  const [docs, setDocs] = useState({
    rg: null,
    cnh: null,
    residencia: null,
    renda: null,
  });

  useEffect(() => {
    if (!token) return;
    invokePublicGet('publicClienteOnboarding', { token })
      .then(res => {
        if (res.data.error) {
          setError(res.data.error);
          setStep('error');
        } else {
          setLinkData(res.data);
          setStep('form');
        }
      })
      .catch(err => {
        setError(err.response?.data?.error || 'Erro ao carregar formulário');
        setStep('error');
      });
  }, [token]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // CEP lookup via ViaCEP
  const handleCepChange = async (value) => {
    const digits = value.replace(/\D/g, '').slice(0, 8);
    set('cep', digits.replace(/^(\d{5})(\d{0,3})$/, '$1-$2'));
    if (digits.length === 8) {
      setCepLoading(true);
      try {
        const resp = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
        const data = await resp.json();
        if (!data.erro) {
          setForm(f => ({
            ...f,
            logradouro: data.logradouro || f.logradouro,
            bairro: data.bairro || f.bairro,
            cidade: data.localidade || f.cidade,
            uf: data.uf || f.uf,
          }));
        }
      } catch (_) { /* ViaCEP indisponível */ }
      setCepLoading(false);
    }
  };

  const handleFileChange = (key, file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setDocs(d => ({ ...d, [key]: { base64: reader.result, filename: file.name, mime: file.type } }));
    };
    reader.readAsDataURL(file);
  };

  const removeDoc = (key) => {
    setDocs(d => ({ ...d, [key]: null }));
    if (fileInputRefs[key].current) fileInputRefs[key].current.value = '';
  };

  const validateDados = () => {
    const docDigits = form.document.replace(/\D/g, '');
    if (docDigits.length !== 11 && docDigits.length !== 14) return 'CPF/CNPJ inválido';
    if (!form.name.trim()) return 'Nome/Razão Social é obrigatório';
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) return 'E-mail inválido';
    if (unmaskPhone(form.whatsapp).length < 10) return 'WhatsApp inválido';
    return null;
  };

  const validateEndereco = () => {
    if (form.cep.replace(/\D/g, '').length !== 8) return 'CEP inválido';
    if (!form.logradouro.trim()) return 'Logradouro é obrigatório';
    if (!form.numero.trim()) return 'Número é obrigatório';
    if (!form.bairro.trim()) return 'Bairro é obrigatório';
    if (!form.cidade.trim()) return 'Cidade é obrigatória';
    if (!form.uf) return 'UF é obrigatória';
    return null;
  };

  const handleSubmit = async () => {
    const errDados = validateDados();
    if (errDados) { setActiveTab('dados'); return; }
    const errEnd = validateEndereco();
    if (errEnd) { setActiveTab('endereco'); return; }
    if (!form.lgpd_accepted) { setActiveTab('dados'); return; }

    setSubmitting(true);
    try {
      // Preparar documentos
      const documents = [];
      if (docs.rg) documents.push({ ...docs.rg, type: 'rg' });
      if (docs.cnh) documents.push({ ...docs.cnh, type: 'cnh' });
      if (docs.residencia) documents.push({ ...docs.residencia, type: 'comprovante_residencia' });
      if (docs.renda) documents.push({ ...docs.renda, type: 'comprovante_renda' });

      const res = await invokePublic('publicClienteOnboarding', {
        token,
        data: { ...form, documents: documents.length > 0 ? documents : undefined },
      });

      if (res.data.success) {
        setStep('success');
      } else {
        setError(res.data.error || 'Erro ao enviar formulário');
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Erro de conexão');
    }
    setSubmitting(false);
  };

  // === Loading ===
  if (step === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-3">
          <div className="text-2xl font-bold tracking-tight">
            <span className="text-foreground">PS</span><span className="gold-text">X</span>
          </div>
          <div className="text-xs font-medium text-foreground/60 tracking-widest uppercase">Capital</div>
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground mt-2" />
        </div>
      </div>
    );
  }

  // === Error ===
  if (step === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="text-center max-w-md bg-white border border-border rounded-2xl p-8 shadow-sm">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-8 h-8 text-red-500" />
          </div>
          <h1 className="text-lg font-bold mb-2">Link Indisponível</h1>
          <p className="text-sm text-muted-foreground">{error || 'Este link não é válido ou expirou.'}</p>
        </div>
      </div>
    );
  }

  // === Success ===
  if (step === 'success') {
    setTimeout(() => { window.location.href = 'https://psxcapital.com.br'; }, 1500);
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="text-center max-w-md bg-white border border-border rounded-2xl p-8 shadow-sm">
          <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-8 h-8 text-emerald-600" />
          </div>
          <h1 className="text-lg font-bold mb-2">Enviado!</h1>
          <p className="text-sm text-muted-foreground">Redirecionando para o site...</p>
        </div>
      </div>
    );
  }

  // === Form ===
  const tipoLabel = linkData?.tipo === 'cedente' ? 'Cedente' : 'Sacado';
  const companyName = linkData?.company?.company_name || 'PSX Capital';

  const tabs = [
    { key: 'dados', label: 'Dados Principais', icon: User, required: true },
    { key: 'endereco', label: 'Endereço', icon: MapPin, required: true },
    { key: 'documentos', label: 'Documentos', icon: FileCheck, required: false },
  ];

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-border px-4 py-3 sticky top-0 z-10">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="text-lg font-bold tracking-tight">
              <span className="text-foreground">PS</span><span className="gold-text">X</span>
            </div>
            <div className="text-xs font-medium text-foreground/60 tracking-widest uppercase hidden sm:block">Capital</div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
              Cadastro · {tipoLabel}
            </span>
          </div>
        </div>
      </header>

      <main className="flex-1 px-4 py-6">
        <div className="max-w-lg mx-auto space-y-4">
          {/* Intro */}
          <div className="text-center mb-2">
            <h1 className="text-xl font-bold text-foreground">Cadastro de {tipoLabel}</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Preencha seus dados para concluir o cadastro. Campos com * são obrigatórios.
            </p>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 bg-white border border-border rounded-xl p-1">
            {tabs.map(tab => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`flex-1 flex flex-col items-center gap-1 py-2.5 px-2 rounded-lg text-xs font-semibold transition-colors ${
                    activeTab === tab.key
                      ? 'bg-foreground text-primary-foreground'
                      : 'text-muted-foreground hover:bg-gray-50'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span className="hidden sm:inline">{tab.label}</span>
                  <span className="sm:hidden">{tab.label.split(' ')[0]}</span>
                  {!tab.required && <span className="text-[9px] opacity-70">opcional</span>}
                </button>
              );
            })}
          </div>

          {/* Tab: Dados Principais */}
          {activeTab === 'dados' && (
            <div className="bg-white border border-border rounded-2xl p-5 space-y-4 shadow-sm">
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1.5">CPF/CNPJ *</label>
                <input
                  className="input-field"
                  value={form.document}
                  onChange={e => set('document', maskCpfCnpj(e.target.value))}
                  placeholder="000.000.000-00 ou 00.000.000/0000-00"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Nome / Razão Social *</label>
                <input
                  className="input-field uppercase"
                  value={form.name}
                  onChange={e => set('name', e.target.value)}
                  placeholder="Seu nome ou razão social"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1.5">E-mail</label>
                <input
                  className="input-field"
                  type="email"
                  value={form.email}
                  onChange={e => set('email', e.target.value)}
                  placeholder="seu@email.com"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1.5">WhatsApp *</label>
                <input
                  className="input-field"
                  value={form.whatsapp}
                  onChange={e => set('whatsapp', maskPhone(e.target.value))}
                  placeholder="(00) 00000-0000"
                />
              </div>

              {/* LGPD */}
              <div className="pt-2 border-t border-border">
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.lgpd_accepted}
                    onChange={e => set('lgpd_accepted', e.target.checked)}
                    className="w-4 h-4 mt-0.5 rounded border-border text-foreground focus:ring-ring shrink-0"
                  />
                  <span className="text-xs text-muted-foreground leading-relaxed">
                    Li e aceito os <button type="button" onClick={() => setShowTerms(true)} className="text-foreground font-semibold underline">termos de privacidade</button> e autorizo o tratamento dos meus dados pessoais conforme a LGPD (Lei nº 13.709/2018).
                  </span>
                </label>
              </div>

              <button
                onClick={() => setActiveTab('endereco')}
                disabled={!validateDados() && !form.lgpd_accepted}
                className="w-full px-4 py-3 bg-foreground text-primary-foreground text-sm font-bold rounded-xl hover:bg-foreground/90 transition-colors"
              >
                Continuar →
              </button>
            </div>
          )}

          {/* Tab: Endereço */}
          {activeTab === 'endereco' && (
            <div className="bg-white border border-border rounded-2xl p-5 space-y-4 shadow-sm">
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1.5">CEP *</label>
                <div className="relative">
                  <input
                    className="input-field pr-10"
                    value={form.cep}
                    onChange={e => handleCepChange(e.target.value)}
                    placeholder="00000-000"
                  />
                  {cepLoading && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground absolute right-3 top-1/2 -translate-y-1/2" />}
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Logradouro *</label>
                  <input className="input-field" value={form.logradouro} onChange={e => set('logradouro', e.target.value)} placeholder="Rua, Av..." />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Número *</label>
                  <input className="input-field" value={form.numero} onChange={e => set('numero', e.target.value)} placeholder="123" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Complemento</label>
                <input className="input-field" value={form.complemento} onChange={e => set('complemento', e.target.value)} placeholder="Apto, Sala..." />
              </div>
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Bairro *</label>
                <input className="input-field" value={form.bairro} onChange={e => set('bairro', e.target.value)} placeholder="Centro" />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Cidade *</label>
                  <input className="input-field" value={form.cidade} onChange={e => set('cidade', e.target.value)} placeholder="Cidade" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1.5">UF *</label>
                  <select className="input-field" value={form.uf} onChange={e => set('uf', e.target.value)}>
                    <option value="">Selecione</option>
                    {UF_OPTIONS.map(uf => <option key={uf} value={uf}>{uf}</option>)}
                  </select>
                </div>
              </div>
              <div className="flex gap-3 pt-1">
                <button onClick={() => setActiveTab('dados')} className="flex-1 px-4 py-3 border border-border text-foreground text-sm font-semibold rounded-xl hover:bg-gray-50 transition-colors">
                  ← Voltar
                </button>
                <button onClick={() => setActiveTab('documentos')} className="flex-1 px-4 py-3 bg-foreground text-primary-foreground text-sm font-bold rounded-xl hover:bg-foreground/90 transition-colors">
                  Continuar →
                </button>
              </div>
            </div>
          )}

          {/* Tab: Documentos (opcional) */}
          {activeTab === 'documentos' && (
            <div className="bg-white border border-border rounded-2xl p-5 space-y-4 shadow-sm">
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-3">
                <p className="text-xs text-blue-800">
                  <strong>Etapa opcional.</strong> Você pode enviar seus documentos agora para acelerar a análise ou enviar depois.
                </p>
              </div>

              {[
                { key: 'rg', label: 'Documento de Identidade (RG)', accept: 'image/*' },
                { key: 'cnh', label: 'CNH', accept: 'image/*' },
                { key: 'residencia', label: 'Comprovante de Residência', accept: 'image/*' },
                { key: 'renda', label: 'Comprovante de Renda', accept: 'image/*' },
              ].map(doc => (
                <div key={doc.key}>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1.5">{doc.label}</label>
                  {docs[doc.key] ? (
                    <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-lg p-2.5">
                      <FileCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span className="text-xs text-emerald-800 truncate flex-1">{docs[doc.key].filename}</span>
                      <button onClick={() => removeDoc(doc.key)} className="p-1 text-red-500 hover:bg-red-100 rounded">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => fileInputRefs[doc.key].current?.click()}
                      className="w-full flex items-center gap-2 px-3 py-2.5 border border-dashed border-border rounded-lg text-xs text-muted-foreground hover:bg-gray-50 hover:border-foreground/30 transition-colors"
                    >
                      <Upload className="w-4 h-4" /> Enviar arquivo
                    </button>
                  )}
                  <input
                    ref={fileInputRefs[doc.key]}
                    type="file"
                    accept={doc.accept}
                    className="hidden"
                    onChange={e => handleFileChange(doc.key, e.target.files?.[0])}
                  />
                </div>
              ))}

              <div className="flex gap-3 pt-1">
                <button onClick={() => setActiveTab('endereco')} className="flex-1 px-4 py-3 border border-border text-foreground text-sm font-semibold rounded-xl hover:bg-gray-50 transition-colors">
                  ← Voltar
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="flex-1 px-4 py-3 bg-foreground text-primary-foreground text-sm font-bold rounded-xl hover:bg-foreground/90 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                >
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                  {submitting ? 'Enviando...' : 'Concluir Cadastro'}
                </button>
              </div>
            </div>
          )}

          {/* Security footer */}
          <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground pt-2">
            <Lock className="w-3.5 h-3.5" /> Ambiente seguro · {companyName} · LGPD
          </div>
        </div>
      </main>

      {/* Terms Modal */}
      {showTerms && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={() => setShowTerms(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-foreground" />
                <h3 className="text-sm font-bold">Termos de Privacidade · LGPD</h3>
              </div>
              <button onClick={() => setShowTerms(false)} className="p-1.5 rounded-lg hover:bg-gray-100">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="overflow-y-auto p-5 space-y-3 text-xs text-muted-foreground leading-relaxed">
              <p><strong className="text-foreground">1. Coleta de Dados.</strong> A {companyName} coleta os dados pessoais fornecidos neste formulário (nome, CPF/CNPJ, contato, endereço e documentos) para fins de cadastro, análise de crédito e formalização de operações financeiras.</p>
              <p><strong className="text-foreground">2. Base Legal.</strong> O tratamento dos seus dados pessoais é fundamentado no seu consentimento e na execução de contrato, conforme a Lei nº 13.709/2018 (LGPD).</p>
              <p><strong className="text-foreground">3. Finalidade.</strong> Seus dados serão utilizados exclusivamente para: (a) cadastro como {tipoLabel.toLowerCase()}; (b) análise de crédito; (c) geração de contratos e documentos; (d) comunicação operacional.</p>
              <p><strong className="text-foreground">4. Compartilhamento.</strong> Seus dados não serão compartilhados com terceiros sem o seu consentimento, exceto quando exigido por lei ou para cumprimento de obrigações regulatórias.</p>
              <p><strong className="text-foreground">5. Segurança.</strong> Adotamos medidas técnicas e organizacionais para proteger seus dados contra acesso não autorizado, perda ou alteração indevida.</p>
              <p><strong className="text-foreground">6. Seus Direitos.</strong> Você pode solicitar a qualquer momento: acesso, correção, anonimização ou exclusão dos seus dados, conforme os artigos 17 a 22 da LGPD.</p>
              <p><strong className="text-foreground">7. Retenção.</strong> Seus dados serão mantidos pelo prazo necessário para cumprir as finalidades descritas ou conforme obrigação legal.</p>
              <p><strong className="text-foreground">8. Encarregado (DPO).</strong> Para exercer seus direitos ou tirar dúvidas sobre privacidade, entre em contato com a {companyName}.</p>
              <p className="text-[10px] pt-2 border-t border-border">Ao marcar a caixa de aceitação, você confirma que leu e concorda com estes termos. Este consentimento pode ser revogado a qualquer tempo.</p>
            </div>
            <div className="px-5 py-3 border-t border-border shrink-0">
              <button onClick={() => setShowTerms(false)} className="w-full px-4 py-2.5 bg-foreground text-primary-foreground text-sm font-semibold rounded-xl hover:bg-foreground/90">
                Entendi
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}