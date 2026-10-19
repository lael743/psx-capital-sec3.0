import { Plus, Trash2, Scan, AlertCircle, CheckCircle2, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useState, useCallback, useRef } from 'react';
import { formatCurrency, simpleInterest, compoundInterest, daysBetween } from '@/lib/finance';
import CurrencyInput from '@/components/ui/CurrencyInput';
import BankCodeInput from '@/components/bancos/BankCodeInput';

// Valida data no formato YYYY-MM-DD com ano razoável
function isValidDate(val) {
  if (!val || !/^\d{4}-\d{2}-\d{2}$/.test(val)) return false;
  const year = parseInt(val.split('-')[0]);
  if (year < 2000 || year > 2100) return false;
  const d = new Date(val + 'T00:00:00');
  return !isNaN(d.getTime());
}

// Input de data sem travar: aceita digitação livre, valida ao sair
function DateInput({ value, onChange, placeholder = 'AAAA-MM-DD', required = false, className = '' }) {
  const [raw, setRaw] = useState(value || '');
  const [touched, setTouched] = useState(false);

  // Sync se valor externo mudar (ex: scan)
  const prevValue = useRef(value);
  if (prevValue.current !== value) {
    prevValue.current = value;
    setRaw(value || '');
  }

  const handleChange = (e) => {
    setRaw(e.target.value);
    if (isValidDate(e.target.value)) {
      onChange(e.target.value);
    } else {
      onChange(''); // invalida no parent sem travar
    }
  };

  const hasError = touched && required && !isValidDate(raw) && raw !== '';
  const isEmpty = touched && required && raw === '';

  return (
    <div>
      <input
        type="date"
        className={`input-field ${hasError || isEmpty ? 'border-red-400 ring-red-200 focus:ring-red-300' : ''} ${className}`}
        value={raw}
        onChange={handleChange}
        onBlur={() => setTouched(true)}
        min="2000-01-01"
        max="2100-12-31"
      />
      {hasError && <p className="text-xs text-red-500 mt-1">Data inválida</p>}
      {isEmpty && <p className="text-xs text-red-500 mt-1">Campo obrigatório</p>}
    </div>
  );
}

export const emptyCheck = () => ({
  bank_name: '',
  bank_code: '',
  bank_agency: '',
  bank_account: '',
  check_number: '',
  value: '',
  issue_date: '',
  compensation_date: '',
  front_image_url: '',
  notes: '',
  _uploading: false,
  _scanning: false,
  _expanded: true,
});

/**
 * FIX CRÍTICO: closure stale bug.
 * Todas as atualizações de estado devem usar a forma funcional: onChange(prev => ...)
 * Isso garante que mesmo com múltiplos uploads simultâneos, cada atualização
 * parte do estado mais recente, não do snapshot no momento do clique.
 */
export default function ChequeInputList({ cheques, onChange, startDate, rate, interestType, grossValue, jurosEmbutido, calcMode: calcModeProp }) {
  const calcMode = calcModeProp || (jurosEmbutido ? 'inverso' : 'padrao');
  
  // Usa ref para sempre ter acesso ao onChange mais recente sem re-criar callbacks
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const addCheque = () => onChange([...cheques, emptyCheck()]);
  
  const removeCheque = (idx) => onChange(cheques.filter((_, i) => i !== idx));

  const updateCheque = (idx, field, value) => {
    onChange(cheques.map((c, i) => i === idx ? { ...c, [field]: value } : c));
  };

  const toggleExpand = (idx) => {
    onChange(cheques.map((c, i) => i === idx ? { ...c, _expanded: !c._expanded } : c));
  };

  // CORREÇÃO DO BUG: usa atualizações funcionais para evitar closure stale
  // Cada etapa chama onChangeRef.current com função que parte do estado ATUAL
  const handleImageUpload = useCallback(async (idx, file) => {
    if (!file) return;

    // Step 1: mark uploading - usa função para partir do estado atual
    onChangeRef.current(prev => prev.map((c, i) => i === idx ? { ...c, _uploading: true, _scanning: false } : c));

    let file_url;
    try {
      const uploaded = await base44.integrations.Core.UploadFile({ file });
      file_url = uploaded.file_url;
    } catch (err) {
      onChangeRef.current(prev => prev.map((c, i) => i === idx ? { ...c, _uploading: false } : c));
      alert('Erro ao enviar imagem: ' + (err?.message || 'tente novamente'));
      return;
    }

    // Step 2: mark scanning, save url - parte do estado atual
    onChangeRef.current(prev => prev.map((c, i) =>
      i === idx ? { ...c, _uploading: false, front_image_url: file_url, _scanning: true } : c
    ));

    let result = {};
    try {
      result = await base44.integrations.Core.InvokeLLM({
        prompt: `Analise esta imagem de um cheque bancário brasileiro e extraia os seguintes dados com precisão.
Retorne SOMENTE o JSON com os campos abaixo. Se não conseguir identificar um campo, deixe como string vazia ou null.

Campos:
- bank_name: nome completo do banco ou cooperativa emissor (ex: "SICOOB", "BRADESCO", "ITAÚ")
- bank_code: código/número do banco (campo "Banco" ou "Comp" no canto superior do cheque, geralmente 3 dígitos, ex: "756", "237", "341")
- bank_agency: número da agência ou cooperativa (campo "Agência" ou "Cooperativa" no cheque, pode ter dígito verificador após traço)
- bank_account: número da conta corrente (campo "Conta" no cheque, pode ter dígito verificador após traço)
- check_number: número do cheque (campo "Cheque Nº" ou "C3", geralmente 6 dígitos, ex: "057467")
- value: valor em número decimal sem símbolos (ex: 2000.40)
- issue_date: data de emissão escrita no cheque no formato YYYY-MM-DD`,
        file_urls: [file_url],
        response_json_schema: {
          type: 'object',
          properties: {
            bank_name: { type: 'string' },
            bank_code: { type: 'string' },
            bank_agency: { type: 'string' },
            bank_account: { type: 'string' },
            check_number: { type: 'string' },
            value: { type: 'number' },
            issue_date: { type: 'string' },
          },
        },
      });
    } catch {
      result = {};
    }

    // Step 3: aplica resultado - CRUCIAL: usa função para partir do estado ATUAL
    // Isso evita que o resultado de um scan sobrescreva dados de outros cheques
    onChangeRef.current(prev => prev.map((c, i) => {
      if (i !== idx) return c;
      return {
        ...c,
        _scanning: false,
        front_image_url: file_url,
        bank_name: result.bank_name ? result.bank_name.toUpperCase() : c.bank_name,
        bank_code: result.bank_code || c.bank_code,
        bank_agency: result.bank_agency || c.bank_agency,
        bank_account: result.bank_account || c.bank_account,
        check_number: result.check_number || c.check_number,
        value: result.value ? String(result.value) : c.value,
        issue_date: result.issue_date || c.issue_date,
      };
    }));
  }, []); // sem deps — usa ref

  const getCalc = (chq) => {
    const val = parseFloat(chq.value) || 0;
    if (!val || !chq.compensation_date || !startDate || !rate) return { interest: 0, principal: val, total: val };
    const days = daysBetween(startDate, chq.compensation_date);
    const taxaProporcional = (rate / 100) * (days / 30);
    if (calcMode === 'inverso') {
      const principal = Math.round(val * (1 - taxaProporcional) * 100) / 100;
      const interest = Math.round((val - principal) * 100) / 100;
      return { interest, principal, total: val };
    } else if (calcMode === 'desconto_direto') {
      const interest = Math.round(val * taxaProporcional * 100) / 100;
      const principal = Math.round((val - interest) * 100) / 100;
      return { interest, principal, total: val };
    } else {
      // padrao: val = líquido; total = líquido / (1 - taxa)
      const principal = val;
      const total = days > 0 ? Math.round((val / (1 - taxaProporcional)) * 100) / 100 : val;
      const interest = Math.round((total - principal) * 100) / 100;
      return { interest, principal, total };
    }
  };

  const totalCheques = cheques.reduce((s, c) => s + (parseFloat(c.value) || 0), 0);
  const validCount = cheques.filter(c => c.bank_name && c.check_number && c.value && c.compensation_date).length;
  const diff = grossValue > 0 ? grossValue - totalCheques : 0;
  const isUnder = diff > 0.005;
  const isOver = diff < -0.005;
  const hasAnyScanning = cheques.some(c => c._uploading || c._scanning);

  return (
    <div className="space-y-3">
      {/* Summary bar */}
      <div className="flex items-center justify-between bg-gray-50 border border-border rounded-xl px-4 py-3">
        <div className="flex items-center gap-4 text-sm">
          <span className="font-semibold">{cheques.length} cheque{cheques.length !== 1 ? 's' : ''}</span>
          <span className="text-muted-foreground">{validCount} preenchido{validCount !== 1 ? 's' : ''}</span>
          <span className="font-semibold text-foreground">{formatCurrency(totalCheques)}</span>
        </div>
        {hasAnyScanning && (
          <span className="flex items-center gap-1.5 text-xs text-blue-600">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Processando imagem{cheques.filter(c => c._uploading || c._scanning).length > 1 ? 's' : ''}...
          </span>
        )}
      </div>

      {grossValue > 0 && (
        <div className={`flex items-start gap-2.5 rounded-xl px-4 py-3 text-sm border ${
          isUnder ? 'bg-amber-50 border-amber-200 text-amber-800' :
          isOver  ? 'bg-blue-50 border-blue-200 text-blue-800' :
                    'bg-emerald-50 border-emerald-200 text-emerald-800'
        }`}>
          {isUnder ? <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /> : <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />}
          <div>
            {isUnder && <span>Faltam <strong>{formatCurrency(diff)}</strong> em cheques para cobrir o valor da operação.</span>}
            {isOver  && <span>Os cheques somam <strong>{formatCurrency(totalCheques)}</strong>, excedendo o valor informado. O total será calculado pelos cheques.</span>}
            {!isUnder && !isOver && <span>Cheques cobrem o valor total: <strong>{formatCurrency(totalCheques)}</strong></span>}
          </div>
        </div>
      )}

      {cheques.map((cheque, idx) => {
        const { interest, principal, total: totalWithInterest } = getCalc(cheque);
        const days = cheque.compensation_date && startDate ? daysBetween(startDate, cheque.compensation_date) : 0;
        const isValid = cheque.bank_name && cheque.check_number && cheque.value && cheque.compensation_date;
        const isExpanded = cheque._expanded !== false;

        return (
          <div key={idx} className={`border rounded-xl overflow-hidden bg-white transition-colors ${isValid ? 'border-emerald-200' : 'border-border'}`}>
            {/* Header - always visible */}
            <div
              className={`flex items-center justify-between px-4 py-3 cursor-pointer select-none ${isValid ? 'bg-emerald-50/50' : 'bg-gray-50'} border-b border-border`}
              onClick={() => toggleExpand(idx)}
            >
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  {isValid
                    ? <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                    : <div className="w-4 h-4 rounded-full border-2 border-gray-300 shrink-0" />
                  }
                  <span className="text-sm font-semibold">Cheque {idx + 1}</span>
                </div>
                {!isExpanded && isValid && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">{cheque.bank_name}</span>
                    <span>#{cheque.check_number}</span>
                    <span className="font-semibold text-foreground">{formatCurrency(parseFloat(cheque.value))}</span>
                    <span>{cheque.compensation_date}</span>
                  </div>
                )}
                {(cheque._uploading || cheque._scanning) && (
                  <span className="flex items-center gap-1.5 text-xs text-blue-600">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    {cheque._uploading ? 'Enviando...' : 'Lendo cheque...'}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {cheques.length > 1 && (
                  <button
                    type="button"
                    onClick={e => { e.stopPropagation(); removeCheque(idx); }}
                    className="p-1.5 rounded-lg hover:bg-red-50 text-red-400 hover:text-red-600 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
                {isExpanded
                  ? <ChevronUp className="w-4 h-4 text-muted-foreground" />
                  : <ChevronDown className="w-4 h-4 text-muted-foreground" />
                }
              </div>
            </div>

            {isExpanded && (
              <div className="p-4 space-y-3">
                {/* Image upload / scan */}
                <label className="cursor-pointer block">
                  <div className={`flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 border-dashed transition-colors text-sm font-medium ${
                    cheque.front_image_url
                      ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                      : 'border-border bg-gray-50 text-muted-foreground hover:bg-gray-100'
                  }`}>
                    {cheque._uploading ? (
                      <><Loader2 className="w-4 h-4 animate-spin" /> Enviando imagem...</>
                    ) : cheque._scanning ? (
                      <><Loader2 className="w-4 h-4 animate-spin" /> Extraindo dados do cheque...</>
                    ) : cheque.front_image_url ? (
                      <><CheckCircle2 className="w-4 h-4" /> Imagem escaneada — clique para trocar</>
                    ) : (
                      <><Scan className="w-4 h-4" /> Escanear cheque (preenche automaticamente)</>
                    )}
                  </div>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={cheque._uploading || cheque._scanning}
                    onChange={e => { if (e.target.files[0]) handleImageUpload(idx, e.target.files[0]); e.target.value = ''; }}
                  />
                </label>

                {/* Fields */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {/* Código + Nome integrados com autocomplete */}
                  <div className="col-span-2 sm:col-span-3">
                    <BankCodeInput
                      code={cheque.bank_code}
                      name={cheque.bank_name}
                      onSelect={({ code, name }) => {
                        onChange(cheques.map((c, i) => i === idx ? { ...c, bank_code: code, bank_name: name } : c));
                      }}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">Nº do Cheque *</label>
                    <input className="input-field" placeholder="057467" value={cheque.check_number}
                      onChange={e => updateCheque(idx, 'check_number', e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">Agência</label>
                    <input className="input-field" placeholder="3273-5" value={cheque.bank_agency}
                      onChange={e => updateCheque(idx, 'bank_agency', e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">Conta Corrente</label>
                    <input className="input-field" placeholder="0000500119-4" value={cheque.bank_account}
                      onChange={e => updateCheque(idx, 'bank_account', e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">Valor (R$) *</label>
                    <CurrencyInput value={cheque.value} onChange={v => updateCheque(idx, 'value', v)} />
                  </div>
                  <div>
                   <label className="block text-xs font-medium text-muted-foreground mb-1">Data Emissão</label>
                   <DateInput
                     value={cheque.issue_date}
                     onChange={v => updateCheque(idx, 'issue_date', v)}
                   />
                  </div>
                  <div>
                   <label className="block text-xs font-medium text-muted-foreground mb-1">Data Compensação *</label>
                   <DateInput
                     value={cheque.compensation_date}
                     onChange={v => updateCheque(idx, 'compensation_date', v)}
                     required
                   />
                  </div>
                </div>

                {parseFloat(cheque.value) > 0 && cheque.compensation_date && rate > 0 && (
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground bg-gray-50 rounded-lg px-3 py-2">
                    <span>{days}d</span>
                    {calcMode === 'inverso' ? (
                      <>
                        <span>Cheque: <strong>{formatCurrency(parseFloat(cheque.value))}</strong></span>
                        <span>Desconto: <strong className="text-[hsl(43,65%,47%)]">{formatCurrency(interest)}</strong></span>
                        <span>💰 Líquido: <strong className="text-emerald-700">{formatCurrency(principal)}</strong></span>
                      </>
                    ) : calcMode === 'desconto_direto' ? (
                      <>
                        <span>Bruto: <strong>{formatCurrency(parseFloat(cheque.value))}</strong></span>
                        <span>Desconto (bruto×taxa): <strong className="text-[hsl(43,65%,47%)]">{formatCurrency(interest)}</strong></span>
                        <span>💰 Líquido: <strong className="text-emerald-700">{formatCurrency(principal)}</strong></span>
                      </>
                    ) : (
                      <>
                        <span>💰 Líquido (cliente recebe): <strong className="text-emerald-700">{formatCurrency(principal)}</strong></span>
                        <span>Juros: <strong className="text-[hsl(43,65%,47%)]">{formatCurrency(interest)}</strong></span>
                        <span>Recebível (cheque): <strong className="text-foreground">{formatCurrency(totalWithInterest)}</strong></span>
                      </>
                    )}
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Observações</label>
                  <input className="input-field" placeholder="Opcional..." value={cheque.notes}
                    onChange={e => updateCheque(idx, 'notes', e.target.value)} />
                </div>
              </div>
            )}
          </div>
        );
      })}

      <button type="button" onClick={addCheque}
        className="flex items-center gap-2 text-sm font-medium text-foreground border border-dashed border-border rounded-xl px-4 py-3 w-full justify-center hover:bg-gray-50 transition-colors">
        <Plus className="w-4 h-4" /> Adicionar Cheque
      </button>
    </div>
  );
}