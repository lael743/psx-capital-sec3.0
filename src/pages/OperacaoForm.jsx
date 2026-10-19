import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams, useParams } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { ViewModeProvider } from '@/lib/viewMode';
import { ArrowLeft, ArrowRight, Save, FileText, AlertTriangle, X, FileDown } from 'lucide-react';
import { formatCurrency, daysBetween, today } from '@/lib/finance';
import { logAction } from '@/lib/audit';
import { emptyTitulo, calcTitulosTotais, calcTituloRow } from '@/components/operacao/wizard/TituloInlineTable';
import WizardStepper from '@/components/operacao/wizard/WizardStepper';
import StepCedenteProduto from '@/components/operacao/wizard/StepCedenteProduto';
import StepDigitacaoTitulos from '@/components/operacao/wizard/StepDigitacaoTitulos';
import StepDocumentos from '@/components/operacao/wizard/StepDocumentos';
import StepResumo from '@/components/operacao/wizard/StepResumo';
import StepParcelas from '@/components/operacao/wizard/StepParcelas';
import StepAssinatura from '@/components/operacao/wizard/StepAssinatura';

const STORAGE_KEY = 'psx_company_settings';
const DRAFT_KEY = 'psx_operacao_wizard_draft';

const getSettings = () => { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch { return {}; } };

const PRODUTO_TO_TYPE = { cheque: 'cheque', boleto: 'boleto', capital_desagio: 'emprestimo' };
const PRODUTO_TO_CALCMODE = { cheque: 'inverso', boleto: 'inverso', capital_desagio: 'capital_desagio' };

// Map produto nome → tipo/calc_mode para compatibilidade com operações antigas
const LEGACY_PRODUTO_MAP = {
  cheque: { tipo: 'cheque', calc_mode: 'inverso' },
  boleto: { tipo: 'boleto', calc_mode: 'inverso' },
  capital_desagio: { tipo: 'emprestimo', calc_mode: 'capital_desagio' },
};

export default function OperacaoForm() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const preClientId = searchParams.get('client');
  const { id: editId } = useParams();

  const simParam = (() => {
    try {
      const raw = searchParams.get('sim');
      return raw ? JSON.parse(decodeURIComponent(raw)) : null;
    } catch { return null; }
  })();

  const [step, setStep] = useState(1);
  const [clients, setClients] = useState([]);
  const [selectedClient, setSelectedClient] = useState(null);
  const [clientUsedLimit, setClientUsedLimit] = useState(0);
  const [saving, setSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [draftBanner, setDraftBanner] = useState(false);
  const [createdId, setCreatedId] = useState(null);

  const settings = useMemo(() => getSettings(), []);

  const [form, setForm] = useState({
    client_id: preClientId || '',
    produto_id: '',
    produto: simParam?.type === 'emprestimo' ? 'capital_desagio' : simParam?.type || 'cheque',
    tipo: simParam?.type === 'emprestimo' ? 'emprestimo' : (simParam?.type || 'cheque'),
    calc_mode: simParam?.type === 'emprestimo' ? 'capital_desagio' : 'inverso',
    calculo_inverso: false,
    rate: simParam?.rate || '',
    interest_type: simParam?.interest_type || 'simples',
    start_date: simParam?.start_date || today(),
    tarifa_operacao: settings.default_tarifa_operacao || 0,
    tarifa_por_titulo: settings.default_tarifa_por_titulo || 0,
    float_dias: settings.default_float_dias || 0,
    arredondar_taxa_diaria: settings.arredondar_taxa_diaria || false,
    notes: '',
    sacado_id: '',
    sacado_name: '',
    sacado_doc: '',
    assinatura_ciclo: 'MONTHLY',
    assinatura_billing_type: 'BOLETO',
    assinatura_prazo_tipo: 'indefinido',
    assinatura_num_ciclos: 0,
    assinatura_valor: '',
    valor_antecipacao: '',
    assinatura_sacados: [],
    assinatura_simulacao: false,
    assinatura_sim_qtd: 100,
  });

  const [titulos, setTitulos] = useState([emptyTitulo()]);
  const [documentos, setDocumentos] = useState([]);

  // Load clients
  useEffect(() => {
    base44.entities.Client.list('-name', 300).then(setClients);
  }, []);

  // Load operation for editing
  useEffect(() => {
    if (!editId) return;
    Promise.all([
      base44.entities.Operation.get(editId),
      base44.entities.Cheque.filter({ operation_id: editId }),
      base44.entities.AssinaturaVinculo.filter({ operation_id: editId }),
    ]).then(([op, chqs, vinculos]) => {
      const legacy = LEGACY_PRODUTO_MAP[op.produto] || LEGACY_PRODUTO_MAP[op.type] || {};
      setForm({
        client_id: op.client_id,
        produto_id: op.produto_id || '',
        produto: op.produto || (op.type === 'emprestimo' ? 'capital_desagio' : op.type),
        tipo: op.type || legacy.tipo || 'cheque',
        calc_mode: op.calc_mode || legacy.calc_mode || 'inverso',
        calculo_inverso: op.calculo_inverso || false,
        rate: op.rate || '',
        interest_type: op.interest_type || 'simples',
        start_date: op.start_date || today(),
        tarifa_operacao: op.tarifa_operacao || 0,
        tarifa_por_titulo: op.tarifa_por_titulo || 0,
        float_dias: op.float_dias || 0,
        arredondar_taxa_diaria: false,
        notes: op.notes || '',
        sacado_id: op.sacado_id || '',
        sacado_name: op.sacado_name || '',
        sacado_doc: chqs[0]?.sacado_doc || '',
        assinatura_ciclo: op.assinatura_ciclo || 'MONTHLY',
        assinatura_billing_type: op.asaas_billing_type || 'BOLETO',
        assinatura_prazo_tipo: op.assinatura_prazo_tipo || 'indefinido',
        assinatura_num_ciclos: op.assinatura_num_ciclos || 0,
        assinatura_valor: vinculos && vinculos[0] ? vinculos[0].valor_assinatura : '',
        valor_antecipacao: op.valor_antecipacao || '',
        assinatura_sacados: (vinculos || []).map((v) => ({
          sacado_id: v.sacado_id || '',
          sacado_name: v.sacado_name || '',
          sacado_doc: v.sacado_doc || '',
          valor_assinatura: v.valor_assinatura || 0,
        })),
        assinatura_simulacao: false,
        assinatura_sim_qtd: 100,
      });
      if (chqs.length) {
        setTitulos(chqs.map(c => ({
          tipo: c.tipo || 'cheque',
          numero: c.check_number || '',
          nf: c.nf || '',
          sacado: c.sacado_name || '',
          sacado_doc: c.sacado_doc || '',
          vencimento: c.compensation_date || '',
          valor_face: String(c.valor_face || c.value || ''),
          valor_liquido: String(c.liquido || ''),
          outras_despesas: String(c.outras_despesas || 0),
        })));
      }
      if (op.client_id) {
        base44.entities.Client.get(op.client_id).then(setSelectedClient);
      }
    });
  }, [editId]);

  // Pre-select client from URL
  useEffect(() => {
    if (preClientId && clients.length) {
      const c = clients.find((c) => c.id === preClientId);
      if (c) {
        setSelectedClient(c);
        setForm((f) => ({ ...f, client_id: c.id, rate: c.default_rate || f.rate }));
        base44.entities.Operation.filter({ client_id: preClientId }, '-created_date', 100).then((ops) => {
          const used = ops.filter((op) => op.status !== 'quitado').reduce((s, op) => s + (op.balance_due || 0), 0);
          setClientUsedLimit(used);
        });
      }
    }
  }, [preClientId, clients]);

  // Draft persistence
  useEffect(() => {
    if (isDirty) {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ form, titulos, documentos }));
    }
  }, [form, titulos, documentos, isDirty]);

  useEffect(() => {
    const draft = localStorage.getItem(DRAFT_KEY);
    if (draft) setDraftBanner(true);
  }, []);

  const loadFromDraft = () => {
    try {
      const d = JSON.parse(localStorage.getItem(DRAFT_KEY));
      if (d) {
        setForm(d.form);
        setTitulos(Array.isArray(d.titulos) && d.titulos.length ? d.titulos : [emptyTitulo()]);
        setDocumentos(Array.isArray(d.documentos) ? d.documentos : []);
        if (d.form?.client_id) {
          base44.entities.Client.filter({ id: d.form.client_id }, 'name', 1).then((res) => {
            if (res[0]) setSelectedClient(res[0]);
          });
        }
        setDraftBanner(false);
        setIsDirty(true);
      }
    } catch {}
  };

  // Step validation
  const isAssinatura = form.tipo === 'assinatura';
  const isParcelamento = (form.tipo === 'boleto' || form.tipo === 'emprestimo') && form.calc_mode !== 'capital_desagio' && form.produto !== 'capital_desagio';
  const isEmprestimoSemCedente = form.tipo === 'emprestimo' && isParcelamento;
  const step1Valid = isAssinatura
    ? !!form.client_id && parseFloat(form.rate) > 0 && !!form.produto && !!form.start_date
    : (isEmprestimoSemCedente || form.client_id) && parseFloat(form.rate) > 0 && form.start_date && form.produto && (!isParcelamento || (form.sacado_name && form.sacado_doc));
  const validTitulos = titulos.filter((t) => t.vencimento && parseFloat(t.valor_face) > 0);
  const assinantesValid = (form.assinatura_sacados || []).filter((a) => a.sacado_name && a.sacado_doc && parseFloat(a.valor_assinatura) > 0);
  const step2Valid = isAssinatura ? parseFloat(form.valor_antecipacao) > 0 && assinantesValid.length > 0 : validTitulos.length > 0;
  const canNext = step === 1 ? step1Valid : step === 2 ? step2Valid : true;

  const nextStep = () => {
    if (!canNext) return;
    setIsDirty(true);
    setStep((s) => Math.min(4, s + 1));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const prevStep = () => {
    setStep((s) => Math.max(1, s - 1));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Calculations
  const rate = parseFloat(form.rate) || 0;
  const floatDias = parseFloat(form.float_dias) || 0;
  const tarifaOperacao = parseFloat(form.tarifa_operacao) || 0;
  const tarifaPorTitulo = parseFloat(form.tarifa_por_titulo) || 0;

  const isEmprestimo = form.tipo === 'emprestimo';
  const effectiveCalcMode = isEmprestimo ? 'emprestimo' : (form.calculo_inverso ? 'padrao' : form.calc_mode);
  const totals = useMemo(
    () => calcTitulosTotais(titulos, form.start_date, rate, form.interest_type, floatDias, form.arredondar_taxa_diaria, effectiveCalcMode),
    [titulos, form.start_date, rate, form.interest_type, floatDias, form.arredondar_taxa_diaria, effectiveCalcMode]
  );

  const isPadrao = form.calc_mode === 'padrao';
  const tarifaTitulos = tarifaPorTitulo * validTitulos.length;
  const totalTarifas = tarifaTitulos + tarifaOperacao;
  // Padrão: tarifas e outras despesas repassadas ao cedente (somadas ao total a receber), não descontadas do repasse
  // Empréstimo: taxas embutidas nas parcelas iguais; líquido = repasse
  const valorLiquido = (isPadrao || isEmprestimo) ? totals.totalLiquido : totals.totalLiquido - totalTarifas;
  const totalReceivable = isPadrao ? totals.totalFace + totals.totalOutras + totalTarifas : totals.totalFace;
  const projectedProfit = totalReceivable - valorLiquido;

  const lastDueDate = validTitulos
    .map((t) => t.vencimento)
    .sort()
    .slice(-1)[0] || '';

  // Safe navigation
  const safeNavigate = (target) => {
    if (isDirty) {
      setShowExitConfirm(true);
    } else {
      navigate(target);
    }
  };

  const confirmExit = () => {
    localStorage.removeItem(DRAFT_KEY);
    navigate('/operacoes');
  };

  // Save
  const saveAssinatura = async () => {
    const assinantes = (form.assinatura_sacados || []).filter((a) => a.sacado_name && a.sacado_doc);
    const numAssinantes = assinantes.length;
    const totalPorCiclo = assinantes.reduce((s, a) => s + (parseFloat(a.valor_assinatura) || 0), 0);
    const prazoTipo = form.assinatura_prazo_tipo || 'indefinido';
    const numCiclos = parseInt(form.assinatura_num_ciclos) || 0;
    const valorAntecipacao = parseFloat(form.valor_antecipacao) || 0;
    const totalReceivable = numCiclos > 0 ? Math.round(totalPorCiclo * numCiclos * 100) / 100 : 0;

    let nextNumber = 0;
    if (!editId) {
      const existingOps = await base44.entities.Operation.list('-created_date', 500);
      nextNumber = existingOps.reduce((max, o) => Math.max(max, o.numero_operacao || 0), 0) + 1;
    }

    const payload = {
      client_id: form.client_id,
      client_name: selectedClient?.name || '',
      type: 'assinatura',
      produto: 'assinatura',
      produto_id: form.produto_id || undefined,
      ...(editId ? {} : { etapa: 'rascunho', numero_operacao: nextNumber }),
      calc_mode: 'assinatura',
      rate: parseFloat(form.rate) || 0,
      interest_type: form.interest_type || 'simples',
      start_date: form.start_date,
      due_date: form.start_date,
      days: 0,
      gross_value: totalReceivable || valorAntecipacao,
      net_value: valorAntecipacao,
      valor_antecipacao: valorAntecipacao,
      total_receivable: totalReceivable,
      tarifa_operacao: 0,
      tarifa_por_titulo: 0,
      float_dias: 0,
      projected_profit: totalReceivable > 0 ? Math.round((totalReceivable - valorAntecipacao) * 100) / 100 : 0,
      realized_profit: 0,
      installments: numAssinantes,
      installment_value: totalPorCiclo,
      installment_schedule: [],
      balance_due: totalReceivable || valorAntecipacao,
      amount_paid: 0,
      status: 'ativo',
      assinatura_ciclo: form.assinatura_ciclo || 'MONTHLY',
      assinatura_prazo_tipo: prazoTipo,
      assinatura_num_ciclos: numCiclos,
      asaas_billing_type: form.assinatura_billing_type || 'BOLETO',
      notes: form.notes || '',
    };

    let operationId = editId;
    if (editId) {
      await base44.entities.Operation.update(editId, payload);
      await base44.entities.AssinaturaVinculo.deleteMany({ operation_id: editId });
      await logAction({
        action: 'update', entity: 'Operation', entityId: editId,
        description: `Operação de assinatura editada para ${selectedClient?.name} — ${numAssinantes} assinantes — ${formatCurrency(valorAntecipacao)} antecipado`
      });
    } else {
      const created = await base44.entities.Operation.create(payload);
      operationId = created.id;
      await logAction({
        action: 'create', entity: 'Operation', entityId: created.id,
        description: `Operação de assinatura criada para ${selectedClient?.name} — ${numAssinantes} assinantes — ${formatCurrency(valorAntecipacao)} antecipado`
      });
    }

    for (const a of assinantes) {
      let sacadoId = a.sacado_id;
      if (!sacadoId && a.sacado_doc) {
        try {
          const existing = await base44.entities.Sacado.filter({ document: a.sacado_doc });
          if (existing && existing.length > 0) {
            sacadoId = existing[0].id;
          } else {
            const docDigits = a.sacado_doc.replace(/\D/g, '');
            const created = await base44.entities.Sacado.create({
              nome: a.sacado_name.toUpperCase(),
              document: a.sacado_doc,
              document_type: docDigits.length <= 11 ? 'CPF' : 'CNPJ',
              status: 'ativo',
              origem: 'automatico',
              cedente_id: form.client_id,
            });
            sacadoId = created.id;
          }
        } catch (e) { console.error('Erro ao vincular sacado:', e); }
      }
      await base44.entities.AssinaturaVinculo.create({
        operation_id: operationId,
        sacado_id: sacadoId || '',
        sacado_name: a.sacado_name.toUpperCase(),
        sacado_doc: a.sacado_doc,
        valor_assinatura: parseFloat(a.valor_assinatura) || 0,
        ciclo: form.assinatura_ciclo || 'MONTHLY',
        billing_type: form.assinatura_billing_type || 'BOLETO',
        prazo_tipo: prazoTipo,
        num_ciclos: numCiclos,
        ciclos_pagos: 0,
        status: 'ativa',
      });
    }

    setSaving(false);
    localStorage.removeItem(DRAFT_KEY);
    setIsDirty(false);
    navigate(`/operacoes/${operationId}`);
  };

  const save = async () => {
    if (!step1Valid || !step2Valid) return;
    setSaving(true);

    if (isAssinatura) {
      await saveAssinatura();
      return;
    }

    const opType = form.tipo || PRODUTO_TO_TYPE[form.produto] || 'cheque';
    const calcMode = form.calc_mode || PRODUTO_TO_CALCMODE[form.produto] || 'inverso';
    const effectiveSaveCalcMode = form.tipo === 'emprestimo' ? 'emprestimo' : (form.calculo_inverso ? 'padrao' : calcMode);
    const days = lastDueDate ? daysBetween(form.start_date, lastDueDate) : 0;

    // Generate sequential operation number (only for new operations)
    let nextNumber = 0;
    if (!editId) {
      const existingOps = await base44.entities.Operation.list('-created_date', 500);
      nextNumber = existingOps.reduce((max, o) => Math.max(max, o.numero_operacao || 0), 0) + 1;
    }

    const totalTarifasSave = tarifaOperacao + (tarifaPorTitulo * validTitulos.length);
    const isPadraoSave = effectiveSaveCalcMode === 'padrao';
    const totalDistribuidoTotalSave = isPadraoSave ? (totals.totalFace || 0) + (totals.totalOutras || 0) + totalTarifasSave : (totals.totalFace || 0);
    const totalDistribuidoPerParcelSave = validTitulos.length > 0 ? totalDistribuidoTotalSave / validTitulos.length : 0;

    const installmentSchedule = validTitulos.map((t, i) => {
      const { dias, desagio, liquido, valorFace } = calcTituloRow(t, form.start_date, rate, form.interest_type, floatDias, form.arredondar_taxa_diaria, effectiveSaveCalcMode);
      const totalDistribuido = Math.round(totalDistribuidoPerParcelSave * 100) / 100;
      return {
        number: i + 1,
        value: valorFace,
        principal: liquido,
        interest: desagio,
        days: dias,
        due_date: t.vencimento,
        total_distribuido: totalDistribuido,
        status: 'pendente',
        paid: false,
      };
    });

    const payload = {
      client_id: form.client_id || undefined,
      client_name: selectedClient?.name || (isEmprestimoSemCedente ? form.sacado_name : '') || '',
      sacado_id: form.sacado_id || undefined,
      sacado_name: form.sacado_name || '',
      type: opType,
      produto: form.produto,
      produto_id: form.produto_id || undefined,
      ...(editId ? {} : { etapa: 'rascunho', numero_operacao: nextNumber }),
      calc_mode: calcMode,
      calculo_inverso: form.calculo_inverso || false,
      rate,
      interest_type: form.interest_type,
      start_date: form.start_date,
      due_date: lastDueDate,
      days,
      gross_value: valorLiquido,
      net_value: valorLiquido,
      total_receivable: totalReceivable,
      tarifa_operacao: tarifaOperacao,
      tarifa_por_titulo: tarifaPorTitulo,
      float_dias: floatDias,
      projected_profit: projectedProfit,
      realized_profit: 0,
      installments: validTitulos.length,
      installment_value: totals.totalFace / (validTitulos.length || 1),
      installment_schedule: installmentSchedule,
      balance_due: totalReceivable,
      amount_paid: 0,
      status: 'ativo',
      notes: form.notes || '',
    };

    let operationId = editId;
    if (editId) {
      await base44.entities.Operation.update(editId, payload);
      await base44.entities.Cheque.deleteMany({ operation_id: editId });
      await logAction({
        action: 'update', entity: 'Operation', entityId: editId,
        description: `Operação editada para ${selectedClient?.name} - ${formatCurrency(valorLiquido)} líquido / ${formatCurrency(totals.totalFace)} bruto`
      });
    } else {
      const created = await base44.entities.Operation.create(payload);
      operationId = created.id;
      await logAction({
        action: 'create', entity: 'Operation', entityId: created.id,
        description: `Operação criada para ${selectedClient?.name} - ${formatCurrency(valorLiquido)} líquido / ${formatCurrency(totals.totalFace)} bruto`
      });
    }

    // Create cheques from títulos
    for (const t of validTitulos) {
      const { dias, desagio, liquido, valorFace } = calcTituloRow(t, form.start_date, rate, form.interest_type, floatDias, form.arredondar_taxa_diaria, effectiveSaveCalcMode);
      await base44.entities.Cheque.create({
        operation_id: operationId,
        client_id: form.client_id || '',
        client_name: selectedClient?.name || (isEmprestimoSemCedente ? form.sacado_name : '') || '',
        sacado_name: t.sacado || '',
        sacado_doc: t.sacado_doc || '',
        nf: t.nf || '',
        tipo: t.tipo,
        bank_name: t.tipo === 'cheque' ? (t.bank_name || 'Cheque') : 'Boleto',
        check_number: t.numero || `TIT-${Date.now()}`,
        value: valorFace,
        valor_face: valorFace,
        desagio,
        liquido,
        outras_despesas: parseFloat(t.outras_despesas) || 0,
        dias,
        compensation_date: t.vencimento,
        status: 'pendente',
      });
    }

    // Vincular sacado da operação (boleto/empréstimo) — cria ou busca o cadastro e atualiza a operação
    if ((opType === 'boleto' || opType === 'emprestimo') && !form.sacado_id && form.sacado_name && form.sacado_doc) {
      try {
        const existing = await base44.entities.Sacado.filter({ document: form.sacado_doc });
        let sacadoId;
        if (existing && existing.length > 0) {
          sacadoId = existing[0].id;
        } else {
          const created = await base44.entities.Sacado.create({
            nome: form.sacado_name.toUpperCase(),
            document: form.sacado_doc,
            document_type: form.sacado_doc.replace(/\D/g, '').length <= 11 ? 'CPF' : 'CNPJ',
            status: 'ativo',
            origem: 'automatico',
            cedente_id: form.client_id,
          });
          sacadoId = created.id;
        }
        await base44.entities.Operation.update(operationId, { sacado_id: sacadoId });
      } catch (e) {
        console.error('Erro ao vincular sacado:', e);
      }
    }

    // Auto-cadastrar Sacados a partir dos títulos digitados (para sacados adicionais nos títulos)
    for (const t of validTitulos) {
      const sacadoNome = (t.sacado || '').trim();
      const sacadoDoc = (t.sacado_doc || '').replace(/\D/g, '');
      if (sacadoNome && sacadoDoc) {
        try {
          const existing = await base44.entities.Sacado.filter({ document: t.sacado_doc });
          if (!existing || existing.length === 0) {
            await base44.entities.Sacado.create({
              nome: sacadoNome.toUpperCase(),
              document: t.sacado_doc,
              document_type: sacadoDoc.length <= 11 ? 'CPF' : 'CNPJ',
              status: 'ativo',
              origem: 'automatico',
              cedente_id: form.client_id,
            });
          }
        } catch (e) {
          console.error('Erro ao auto-cadastrar sacado:', e);
        }
      }
    }

    // Save queued documents to OperacaoDocumento entity
    if (documentos.length > 0 && operationId) {
      for (const doc of documentos) {
        await base44.entities.OperacaoDocumento.create({
          operation_id: operationId,
          client_id: form.client_id,
          client_name: selectedClient?.name || '',
          doc_type: doc.doc_type,
          doc_category: doc.doc_category,
          file_url: doc.file_url,
          file_name: doc.file_name,
          file_size: doc.file_size || 0,
          notes: doc.notes || '',
        });
      }
    }

    setSaving(false);
    localStorage.removeItem(DRAFT_KEY);
    setIsDirty(false);
    navigate(`/operacoes/${operationId}`);
  };

  const isCapitalDesagio = form.calc_mode === 'capital_desagio' || form.produto === 'capital_desagio';

  return (
    <ViewModeProvider initialMode="interno">
      <div className="p-4 md:p-6 h-full flex flex-col bg-gray-50/50 min-h-screen">
        {/* Exit confirm */}
        {showExitConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40" onClick={() => setShowExitConfirm(false)} />
            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-5 h-5 text-amber-500" />
                </div>
                <div>
                  <h3 className="text-sm font-bold">Sair sem salvar?</h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    Você tem dados não salvos. Um rascunho foi guardado, mas ao sair ele será descartado.
                  </p>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button onClick={() => setShowExitConfirm(false)} className="px-4 py-2 text-sm font-medium border border-border rounded-lg hover:bg-gray-50">
                  Continuar editando
                </button>
                <button onClick={confirmExit} className="px-4 py-2 text-sm font-semibold bg-red-600 text-white rounded-lg hover:bg-red-700">
                  Sair mesmo assim
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Header */}
        <div className="flex items-center gap-3 mb-2 shrink-0">
          <button onClick={() => safeNavigate('/operacoes')} className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-xl font-bold">{editId ? 'Editar Operação' : 'Nova Operação'}</h1>
            <p className="text-sm text-muted-foreground">Antecipação de recebíveis — cessão de crédito com deságio</p>
          </div>
        </div>

        {/* Draft banner */}
        {draftBanner && (
          <div className="mb-4 shrink-0 flex items-center justify-between gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
            <div className="flex items-center gap-2 text-sm text-amber-800">
              <FileText className="w-4 h-4 shrink-0" />
              <span><strong>Rascunho encontrado.</strong> Você tem uma operação não finalizada salva.</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button onClick={loadFromDraft} className="text-xs font-semibold px-3 py-1.5 bg-amber-500 text-white rounded-lg hover:bg-amber-600">
                Recuperar
              </button>
              <button onClick={() => { localStorage.removeItem(DRAFT_KEY); setDraftBanner(false); }} className="p-1.5 rounded-lg hover:bg-amber-100 text-amber-600">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* Stepper */}
        <WizardStepper currentStep={step} step2Label={isAssinatura ? 'Assinaturas' : isParcelamento ? 'Parcelas' : 'Digitação de Títulos'} />

        {/* Content card */}
        <div className="flex-1 flex flex-col">
          <div className="bg-white border border-border rounded-xl p-6 flex-1">
            {step === 1 && (
              <StepCedenteProduto
                form={form}
                setForm={setForm}
                selectedClient={selectedClient}
                setSelectedClient={setSelectedClient}
                clients={clients}
                clientUsedLimit={clientUsedLimit}
                setClientUsedLimit={setClientUsedLimit}
                settings={settings}
              />
            )}
            {step === 2 && (
              isAssinatura ? (
                <StepAssinatura form={form} setForm={setForm} />
              ) : isParcelamento ? (
                <StepParcelas
                  form={form}
                  setForm={setForm}
                  titulos={titulos}
                  setTitulos={(v) => { setTitulos(v); setIsDirty(true); }}
                  calcMode={effectiveCalcMode}
                />
              ) : (
                <StepDigitacaoTitulos
                  titulos={titulos}
                  setTitulos={(v) => { setTitulos(v); setIsDirty(true); }}
                  form={form}
                  isCapitalDesagio={isCapitalDesagio}
                  calcMode={effectiveCalcMode}
                />
              )
            )}
            {step === 3 && (
              <StepDocumentos documentos={documentos} onChange={(v) => { setDocumentos(v); setIsDirty(true); }} />
            )}
            {step === 4 && (
              <StepResumo
                form={form}
                setForm={setForm}
                selectedClient={selectedClient}
                titulos={validTitulos}
                documentos={documentos}
                onConfirm={save}
                saving={saving}
              />
            )}
          </div>

          {/* Navigation buttons */}
          <div className="flex items-center justify-between mt-4 pb-4">
            <button
              onClick={prevStep}
              disabled={step === 1}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium border border-border rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ArrowLeft className="w-4 h-4" /> Anterior
            </button>

            <div className="flex items-center gap-3">
              {step < 4 && (
                <button
                  onClick={nextStep}
                  disabled={!canNext}
                  className="inline-flex items-center gap-2 px-5 py-2 bg-foreground text-primary-foreground text-sm font-semibold rounded-lg hover:bg-foreground/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Próximo <ArrowRight className="w-4 h-4" />
                </button>
              )}
              {step === 4 && (
                <button
                  onClick={save}
                  disabled={saving || !!form.assinatura_simulacao}
                  className="inline-flex items-center gap-2 px-5 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-700 disabled:opacity-60 transition-colors"
                >
                  <Save className="w-4 h-4" /> {form.assinatura_simulacao ? 'Simulação — não confirmável' : (saving ? 'Confirmando...' : 'Confirmar Operação')}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </ViewModeProvider>
  );
}