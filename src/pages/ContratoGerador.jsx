import { useState, useRef, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FileText, Printer, Download, Calculator, RefreshCw, Search, X, Bell, Receipt, ScrollText } from 'lucide-react';
import ContratoPreview from '@/components/contrato/ContratoPreview';
import CessaoCreditoPreview from '@/components/contrato/CessaoCreditoPreview';
import NotaPromissoriaPreview from '@/components/contrato/NotaPromissoriaPreview';
import TermoNotificacaoPreview from '@/components/contrato/TermoNotificacaoPreview';
import ConfissaoDividaPreview from '@/components/contrato/ConfissaoDividaPreview';
import ComprovanteRepassePreview from '@/components/contrato/ComprovanteRepassePreview';
import { formatCurrency } from '@/lib/finance';
import { numPorExtenso } from '@/lib/numPorExtenso';
import { base44 } from '@/api/base44Client';
import { editarOperacaoCampos } from '@/lib/operacaoOps';

function gerarDocId() {
  return 'xxxx-xxxx-xxxx'.replace(/x/g, () => Math.random().toString(36)[2]);
}



const STORAGE_KEY = 'psx_company_settings';
function getSettings() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch { return {}; }
}

function fmtDate(str) {
  if (!str) return '';
  const [y, m, d] = str.split('-');
  return `${d}/${m}/${y}`;
}

function emptyForm(settings) {
  return {
    credor_nome: settings.company_name || '',
    credor_doc: settings.company_document || '',
    credor_rg: '',
    credor_endereco: settings.company_address || '',
    credor_cidade: settings.company_city || '',
    credor_estado: settings.company_state || '',
    devedor_nome: '',
    devedor_doc: '',
    devedor_rg: '',
    devedor_endereco: '',
    devedor_cidade: '',
    devedor_estado: '',
    cedido_nome: '',
    cedido_doc: '',
    cedido_rg: '',
    cedido_endereco: '',
    cedido_cidade: '',
    cedido_estado: '',
    valor_liberado: '',
    data_liberacao: '',
    prazo_dias: '',
    acrescimo_pct: '',
    data_vencimento: '',
    modo_calculo: 'direto',
    multa_pct: settings.contract_multa_pct || '2',
    mora_pct: settings.contract_mora_pct || '1',
    prazo_atraso: settings.contract_prazo_atraso || '3',
    foro_cidade: settings.company_city || '',
    dias_recompra: '30',
    honorario_cobranca: '10',
    test1_nome: '',
    test1_cpf: '',
    test2_nome: '',
    test2_cpf: '',
    incluir_avalista: false,
    avalista_nome: '',
    avalista_doc: '',
    avalista_rg: '',
    avalista_endereco: '',
    avalista_cidade: '',
    avalista_estado: '',
  };
}

// Busca de operação existente
function OperacaoBuscaModal({ onSelect, onClose }) {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (search.length < 2) { setResults([]); return; }
    setLoading(true);
    base44.entities.Operation.list('-created_date', 50).then(ops => {
      const q = search.toLowerCase();
      setResults(ops.filter(o =>
        o.client_name?.toLowerCase().includes(q) ||
        o.id?.toLowerCase().includes(q)
      ).slice(0, 10));
      setLoading(false);
    });
  }, [search]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-base">Buscar Operação</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100"><X className="w-4 h-4" /></button>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input autoFocus className="input-field pl-9" placeholder="Nome do cliente ou ID..." value={search}
            onChange={e => setSearch(e.target.value)} />
        </div>
        {loading && <p className="text-sm text-muted-foreground text-center py-2">Buscando...</p>}
        <div className="max-h-64 overflow-y-auto space-y-1">
          {results.map(op => (
            <button key={op.id} onClick={() => onSelect(op)}
              className="w-full text-left px-4 py-3 rounded-xl hover:bg-gray-50 border border-border transition-colors">
              <div className="font-semibold text-sm">{op.client_name}</div>
              <div className="text-xs text-muted-foreground mt-0.5 flex gap-3 flex-wrap">
                <span>#{op.id.slice(-6).toUpperCase()}</span>
                <span>{formatCurrency(op.gross_value)}</span>
                <span>Venc: {fmtDate(op.due_date)}</span>
                <span className="capitalize">{op.type}</span>
              </div>
            </button>
          ))}
          {results.length === 0 && search.length >= 2 && !loading && (
            <p className="text-sm text-muted-foreground text-center py-4">Nenhuma operação encontrada.</p>
          )}
        </div>
      </div>
    </div>
  );
}

// Componentes estáticos fora do render para não perder foco ao digitar
function Section({ id, secoes, toggleSecao, title, children }) {
  return (
    <div className="border border-border rounded-xl overflow-hidden">
      <button type="button" onClick={() => toggleSecao(id)}
        className="w-full flex items-center justify-between px-5 py-4 bg-gray-50 hover:bg-gray-100 transition-colors text-left">
        <span className="text-sm font-semibold">{title}</span>
        <span className="text-muted-foreground text-lg leading-none">{secoes[id] ? '▲' : '▼'}</span>
      </button>
      {secoes[id] && <div className="p-5">{children}</div>}
    </div>
  );
}

function Field({ label, children, col2 }) {
  return (
    <div className={col2 ? 'sm:col-span-2' : ''}>
      <label className="block text-xs font-medium text-muted-foreground mb-1.5">{label}</label>
      {children}
    </div>
  );
}

function TabBtn({ view, value, label, Icon, onClick }) {
  const active = view === value;
  return (
    <button onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-lg border transition-colors ${active ? 'bg-foreground text-primary-foreground border-foreground' : 'border-border hover:bg-gray-50'}`}>
      <Icon className="w-3.5 h-3.5" /> {label}
    </button>
  );
}

export default function ContratoGerador() {
  const settings = getSettings();
  const [searchParams] = useSearchParams();
  const [form, setForm] = useState(() => emptyForm(settings));
  const [view, setView] = useState('form');
  const [showBuscaModal, setShowBuscaModal] = useState(false);
  const [operacaoVinculada, setOperacaoVinculada] = useState(null);
  const [chequesVinculados, setChequesVinculados] = useState([]);
  const printRef = useRef();

  // Promissória usa número sequencial gerado no servidor (imutável)
  const [numPromissoria, setNumPromissoria] = useState('');

  useEffect(() => {
    const gerarNum = async () => {
      const res = await base44.functions.invoke('gerarNumPromissoria', {});
      setNumPromissoria(res.data.num_promissoria);
    };
    gerarNum();
  }, []);

  // Pré-preenchimento via URL param ?operation_id=...
  useEffect(() => {
    const opId = searchParams.get('operation_id');
    if (!opId) return;
    base44.entities.Operation.get(opId).then(async (op) => {
      if (!op) return;
      let client = null;
      if (op.client_id) client = await base44.entities.Client.get(op.client_id).catch(() => null);
      await preencherDeOperacao(op, client);
      setOperacaoVinculada(op);
      if (op.type === 'cheque') {
        base44.entities.Cheque.filter({ operation_id: op.id }, 'compensation_date', 50)
          .then(setChequesVinculados).catch(() => {});
      }
    }).catch(() => {});
  }, []);

  async function preencherDeOperacao(op, client) {
    const isBoleto = op.type === 'boleto';
    // Buscar dados do sacado para operações de boleto
    let sacado = null;
    if (isBoleto && op.sacado_id) {
      sacado = await base44.entities.Client.get(op.sacado_id).catch(() => null);
    }
    setForm(f => ({
      ...f,
      devedor_nome: isBoleto ? (op.client_name || client?.name || '').toUpperCase() : (op.client_name || client?.name || '').toUpperCase(),
      devedor_doc: client?.document || '',
      devedor_rg: '',
      devedor_endereco: (client?.address || '').toUpperCase(),
      devedor_cidade: (client?.city || '').toUpperCase(),
      devedor_estado: (client?.state || '').toUpperCase(),
      cedido_nome: isBoleto ? (sacado?.name || op.sacado_name || '').toUpperCase() : '',
      cedido_doc: isBoleto ? (sacado?.document || '') : '',
      cedido_rg: '',
      cedido_endereco: isBoleto ? (sacado?.address || '').toUpperCase() : '',
      cedido_cidade: isBoleto ? (sacado?.city || '').toUpperCase() : '',
      cedido_estado: isBoleto ? (sacado?.state || '').toUpperCase() : '',
      valor_liberado: isBoleto ? String(op.total_receivable || op.net_value || '') : String(op.gross_value || ''),
      acrescimo_pct: String(op.rate || ''),
      data_liberacao: op.start_date || '',
      data_vencimento: op.due_date || '',
      prazo_dias: String(op.days || ''),
      modo_calculo: isBoleto ? 'cessao' : 'recebiveis',
    }));
  }

  const handleSelectOperacao = async (op) => {
    setShowBuscaModal(false);
    let client = null;
    if (op.client_id) client = await base44.entities.Client.get(op.client_id).catch(() => null);
    await preencherDeOperacao(op, client);
    setOperacaoVinculada(op);
    setChequesVinculados([]);
    if (op.type === 'cheque') {
      base44.entities.Cheque.filter({ operation_id: op.id }, 'compensation_date', 50)
        .then(setChequesVinculados).catch(() => {});
    }
  };

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const isCessao = operacaoVinculada?.type === 'boleto';

  // Cálculos
  const valorLiberado = parseFloat(form.valor_liberado) || 0;
  const acrescimoPct = parseFloat(form.acrescimo_pct) || 0;
  const prazoDias = parseInt(form.prazo_dias) || 0;

  let valorFinal = 0;
  let valorLiquidoCessao = 0;
  let acrescimoValor = 0;
  if (operacaoVinculada && operacaoVinculada.total_receivable > 0) {
    // Usa o total a receber real da operação vinculada — evita divergência de cálculo (rate/dias vs total real)
    valorFinal = operacaoVinculada.total_receivable;
    if (isCessao) {
      valorLiquidoCessao = operacaoVinculada.net_value || 0;
      acrescimoValor = Math.round((valorFinal - valorLiquidoCessao) * 100) / 100;
    } else {
      acrescimoValor = Math.round((valorFinal - valorLiberado) * 100) / 100;
    }
  } else if (isCessao) {
    valorFinal = valorLiberado;
    const taxaProp = (acrescimoPct / 100) * (prazoDias / 30);
    acrescimoValor = Math.round(valorLiberado * taxaProp * 100) / 100;
    valorLiquidoCessao = Math.round((valorLiberado - acrescimoValor) * 100) / 100;
  } else if (form.modo_calculo === 'direto') {
    valorFinal = Math.round((valorLiberado * (1 + acrescimoPct / 100)) * 100) / 100;
    acrescimoValor = Math.round(Math.abs(valorFinal - valorLiberado) * 100) / 100;
  } else {
    const fator = 1 - (acrescimoPct / 100) * (prazoDias / 30);
    valorFinal = fator > 0 ? Math.round((valorLiberado / fator) * 100) / 100 : valorLiberado;
    acrescimoValor = Math.round(Math.abs(valorFinal - valorLiberado) * 100) / 100;
  }

  const calcVencimento = () => {
    if (!form.data_liberacao || !prazoDias) return;
    const d = new Date(form.data_liberacao + 'T00:00:00');
    d.setDate(d.getDate() + prazoDias);
    set('data_vencimento', d.toISOString().split('T')[0]);
  };

  const canGenerate = form.credor_nome && form.devedor_nome && form.devedor_doc &&
    valorLiberado > 0 && valorFinal > 0 && form.data_vencimento &&
    (!isCessao || (form.cedido_nome && form.cedido_doc));

  const handlePrint = () => window.print();

  const handleDownloadPDF = async () => {
    const { default: jsPDF } = await import('jspdf');
    const { default: html2canvas } = await import('html2canvas');
    const el = printRef.current;
    if (!el) return;
    const fullHeight = el.scrollHeight;
    const canvas = await html2canvas(el, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff',
      height: fullHeight,
      windowHeight: fullHeight,
    });
    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
    let heightLeft = pdfHeight;
    let position = 0;
    pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, pdfHeight);
    heightLeft -= pageHeight;
    while (heightLeft > 0) {
      position -= pageHeight;
      pdf.addPage();
      pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, pdfHeight);
      heightLeft -= pageHeight;
    }
    const nomes = {
      contrato: `contrato_cessao_${form.devedor_nome.replace(/\s/g, '_')}`,
      confissao: `confissao_divida_${form.devedor_nome.replace(/\s/g, '_')}`,
      promissoria: `promissoria_${form.num_promissoria || '001'}`,
      notificacao: `notificacao_devedor_${form.cedido_nome?.replace(/\s/g, '_') || 'cedido'}`,
      comprovante: `comprovante_repasse_${form.devedor_nome.replace(/\s/g, '_')}`,
    };
    const nome = nomes[view] || `documento_${view}`;
    pdf.save(`${nome}.pdf`);
  };

  // doc_id único por sessão (gerado uma vez, persistido no state) — deve vir ANTES de validacaoUrl
  const [docId] = useState(() => gerarDocId());

  // Seções do formulário — controladas independentemente para não causar re-render global
  const [secoes, setSecoes] = useState({ credor: true, devedor: true, operacao: true, inadimplencia: false, cobranca: false, testemunhas: false, foro: false });
  const toggleSecao = (id) => setSecoes(s => ({ ...s, [id]: !s[id] }));

  // Se há operação vinculada, usar o ID real como número da operação
  const numOperacao = operacaoVinculada
    ? `#${operacaoVinculada.id.slice(-6).toUpperCase()}`
    : '';

  const validacaoUrl = `${window.location.origin}/validar?id=${docId}`;

  const dadosContrato = {
    ...form,
    valorLiberado, valorFinal, acrescimoValor, acrescimoPct, prazoDias,
    num_promissoria: numPromissoria,
    num_operacao: numOperacao,
    operacao: operacaoVinculada,
    cheques: chequesVinculados,
    validacao_url: validacaoUrl,
    // Campos para cessão de crédito
    cedente_nome: form.devedor_nome,
    cedente_doc: form.devedor_doc,
    cedente_rg: form.devedor_rg,
    cedente_endereco: form.devedor_endereco,
    cedente_cidade: form.devedor_cidade,
    cedente_estado: form.devedor_estado,
    valor_nominal: valorFinal,
    valor_liquido: isCessao ? valorLiquidoCessao : valorLiberado,
    desagio_valor: acrescimoValor,
    taxa_pct: acrescimoPct,
    dias_recompra: form.dias_recompra,
    honorario_cobranca: form.honorario_cobranca,
    incluir_avalista: form.incluir_avalista,
    avalista_nome: form.avalista_nome,
    avalista_doc: form.avalista_doc,
    avalista_rg: form.avalista_rg,
    avalista_endereco: form.avalista_endereco,
    avalista_cidade: form.avalista_cidade,
    avalista_estado: form.avalista_estado,
  };

  // Cria notificação de aceite para o devedor cedido
  const criarNotificacaoAceite = async () => {
    if (!operacaoVinculada || operacaoVinculada.type !== 'boleto' || !form.cedido_nome) return;
    // Verifica se já existe notificação para esta operação
    const existentes = await base44.entities.NotificacaoAceite.filter({ operation_id: operacaoVinculada.id }).catch(() => []);
    if (existentes && existentes.length > 0) return; // já existe
    const aceiteHash = crypto.randomUUID();
    await base44.entities.NotificacaoAceite.create({
      operation_id: operacaoVinculada.id,
      client_name: form.cedido_nome,
      aceite_hash: aceiteHash,
      status: 'enviado',
      dados_termo: {
        cedente_nome: form.devedor_nome,
        cedente_doc: form.devedor_doc,
        cedido_nome: form.cedido_nome,
        cedido_doc: form.cedido_doc,
        valor_nominal: valorFinal,
        num_operacao: numOperacao,
        data_emissao: new Date().toISOString().split('T')[0],
      },
    });
    await editarOperacaoCampos(operacaoVinculada.id, {
      notificacao_status: 'enviado',
    });
  };

  // Salva/atualiza o registro de validação ao visualizar o documento
  const salvarValidacao = async (docType) => {
    const hoje = new Date().toISOString().split('T')[0];
    await base44.entities.DocumentoValidacao.filter({ doc_id: docId }).then(async (existing) => {
      const payload = {
        doc_id: docId,
        doc_type: docType,
        num_operacao: numOperacao,
        num_promissoria: numPromissoria,
        operation_id: operacaoVinculada?.id || '',
        emitente_nome: isCessao ? form.devedor_nome : form.devedor_nome,
        emitente_doc: isCessao ? form.devedor_doc : form.devedor_doc,
        beneficiario_nome: form.credor_nome,
        beneficiario_doc: form.credor_doc,
        valor: isCessao ? valorFinal : valorFinal,
        data_emissao: hoje,
        data_vencimento: form.data_vencimento,
        status_operacao: operacaoVinculada?.status || 'ativo',
      };
      if (existing && existing.length > 0) {
        await base44.entities.DocumentoValidacao.update(existing[0].id, payload);
      } else {
        await base44.entities.DocumentoValidacao.create(payload);
      }
    }).catch(() => {});
  };

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      {showBuscaModal && (
        <OperacaoBuscaModal onSelect={handleSelectOperacao} onClose={() => setShowBuscaModal(false)} />
      )}

      <div className="flex items-start justify-between gap-4 mb-6 print:hidden">
        <div>
          <h1 className="text-2xl font-bold">{isCessao ? 'Cessão de Crédito' : 'Contrato de Confissão de Dívida'}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{isCessao ? 'Instrumento de cessão de crédito com coobrigação do cedente' : 'Geração de contrato e nota promissória vinculada'}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {view !== 'form' && (
            <>
              <button onClick={() => setView('form')}
                className="px-4 py-2 text-sm font-medium border border-border rounded-lg hover:bg-gray-50 transition-colors">
                ← Voltar ao Formulário
              </button>
              <button onClick={handlePrint}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium border border-border rounded-lg hover:bg-gray-50 transition-colors">
                <Printer className="w-4 h-4" /> Imprimir
              </button>
              <button onClick={handleDownloadPDF}
                className="inline-flex items-center gap-2 px-4 py-2 bg-foreground text-primary-foreground text-sm font-medium rounded-lg hover:bg-foreground/90 transition-colors">
                <Download className="w-4 h-4" /> Baixar PDF
              </button>
            </>
          )}
        </div>
      </div>

      {view === 'form' ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Formulário */}
          <div className="lg:col-span-2 space-y-4">

            {/* Vincular operação existente */}
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-blue-900">Pré-preencher de uma operação</p>
                {operacaoVinculada ? (
                  <p className="text-xs text-blue-700 mt-0.5">
                    Vinculada: <strong>{operacaoVinculada.client_name}</strong> — {formatCurrency(operacaoVinculada.gross_value)} · #{operacaoVinculada.id.slice(-6).toUpperCase()}
                  </p>
                ) : (
                  <p className="text-xs text-blue-700 mt-0.5">Importa dados do devedor, valor e datas automaticamente.</p>
                )}
              </div>
              <button onClick={() => setShowBuscaModal(true)}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shrink-0">
                <Search className="w-4 h-4" /> {operacaoVinculada ? 'Trocar' : 'Buscar'}
              </button>
            </div>

            <Section id="credor" title={operacaoVinculada?.type === 'boleto' ? '🏢 Cessionária (PSX Capital)' : '📋 Dados do Credor'} secoes={secoes} toggleSecao={toggleSecao}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Nome Completo *" col2>
                  <input className="input-field uppercase" value={form.credor_nome}
                    onChange={e => set('credor_nome', e.target.value.toUpperCase())} placeholder="NOME DO CREDOR" />
                </Field>
                <Field label="CPF / CNPJ *">
                  <input className="input-field" value={form.credor_doc}
                    onChange={e => set('credor_doc', e.target.value)} placeholder="000.000.000-00" />
                </Field>
                <Field label="RG">
                  <input className="input-field" value={form.credor_rg}
                    onChange={e => set('credor_rg', e.target.value)} placeholder="0000000-0" />
                </Field>
                <Field label="Endereço" col2>
                  <input className="input-field uppercase" value={form.credor_endereco}
                    onChange={e => set('credor_endereco', e.target.value.toUpperCase())} placeholder="RUA, NÚMERO, BAIRRO" />
                </Field>
                <Field label="Cidade">
                  <input className="input-field uppercase" value={form.credor_cidade}
                    onChange={e => set('credor_cidade', e.target.value.toUpperCase())} />
                </Field>
                <Field label="Estado">
                  <input className="input-field uppercase" value={form.credor_estado}
                    onChange={e => set('credor_estado', e.target.value.toUpperCase())} maxLength={2} placeholder="MT" />
                </Field>
              </div>
            </Section>

            <Section id="devedor" title={operacaoVinculada?.type === 'boleto' ? '📤 Cedente' : '👤 Dados do Devedor'} secoes={secoes} toggleSecao={toggleSecao}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Nome Completo *" col2>
                  <input className="input-field uppercase" value={form.devedor_nome}
                    onChange={e => set('devedor_nome', e.target.value.toUpperCase())} placeholder={operacaoVinculada?.type === 'boleto' ? 'NOME DO CEDENTE' : 'NOME DO DEVEDOR'} />
                </Field>
                <Field label="CPF / CNPJ *">
                  <input className="input-field" value={form.devedor_doc}
                    onChange={e => set('devedor_doc', e.target.value)} placeholder="000.000.000-00" />
                </Field>
                <Field label="RG">
                  <input className="input-field" value={form.devedor_rg}
                    onChange={e => set('devedor_rg', e.target.value)} placeholder="0000000-0" />
                </Field>
                <Field label="Endereço" col2>
                  <input className="input-field uppercase" value={form.devedor_endereco}
                    onChange={e => set('devedor_endereco', e.target.value.toUpperCase())} placeholder="RUA, NÚMERO, BAIRRO" />
                </Field>
                <Field label="Cidade">
                  <input className="input-field uppercase" value={form.devedor_cidade}
                    onChange={e => set('devedor_cidade', e.target.value.toUpperCase())} />
                </Field>
                <Field label="Estado">
                  <input className="input-field uppercase" value={form.devedor_estado}
                    onChange={e => set('devedor_estado', e.target.value.toUpperCase())} maxLength={2} placeholder="MT" />
                </Field>
              </div>
            </Section>

            {operacaoVinculada?.type === 'boleto' && (
              <Section id="cedido" title="📥 Devedor Cedido (Sacado/Pagador)" secoes={secoes} toggleSecao={toggleSecao}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="Nome Completo *" col2>
                    <input className="input-field uppercase" value={form.cedido_nome}
                      onChange={e => set('cedido_nome', e.target.value.toUpperCase())} placeholder="NOME DO DEVEDOR CEDIDO" />
                  </Field>
                  <Field label="CPF / CNPJ *">
                    <input className="input-field" value={form.cedido_doc}
                      onChange={e => set('cedido_doc', e.target.value)} placeholder="000.000.000-00" />
                  </Field>
                  <Field label="RG">
                    <input className="input-field" value={form.cedido_rg}
                      onChange={e => set('cedido_rg', e.target.value)} placeholder="0000000-0" />
                  </Field>
                  <Field label="Endereço" col2>
                    <input className="input-field uppercase" value={form.cedido_endereco}
                      onChange={e => set('cedido_endereco', e.target.value.toUpperCase())} placeholder="RUA, NÚMERO, BAIRRO" />
                  </Field>
                  <Field label="Cidade">
                    <input className="input-field uppercase" value={form.cedido_cidade}
                      onChange={e => set('cedido_cidade', e.target.value.toUpperCase())} />
                  </Field>
                  <Field label="Estado">
                    <input className="input-field uppercase" value={form.cedido_estado}
                      onChange={e => set('cedido_estado', e.target.value.toUpperCase())} maxLength={2} placeholder="MT" />
                  </Field>
                </div>
              </Section>
            )}

            <Section id="operacao" title="💰 Dados da Operação" secoes={secoes} toggleSecao={toggleSecao}>
              {operacaoVinculada?.type !== 'boleto' && (
                <div className="flex gap-2 mb-4">
                  {[{ v: 'direto', l: 'Direto (Líquido + Acréscimo %)' }, { v: 'recebiveis', l: 'Recebíveis (Bruto = Líq ÷ (1 − tx·d/30))' }].map(opt => (
                    <button key={opt.v} type="button" onClick={() => set('modo_calculo', opt.v)}
                      className={`flex-1 px-3 py-2 text-xs font-semibold rounded-lg border transition-colors ${form.modo_calculo === opt.v ? 'bg-foreground text-primary-foreground border-foreground' : 'border-border hover:bg-gray-50'}`}>
                      {opt.l}
                    </button>
                  ))}
                </div>
              )}
              {operacaoVinculada?.type === 'boleto' && (
                <div className="mb-4 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-xs text-blue-800">
                  Modo <strong>Cessão de Crédito</strong>: Valor Nominal = total dos boletos. Deságio calculado automaticamente com base na taxa e prazo.
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label={operacaoVinculada?.type === 'boleto' ? 'Valor Nominal dos Créditos (R$) *' : form.modo_calculo === 'direto' ? 'Valor Liberado (R$) *' : 'Valor Líquido Liberado (R$) *'}>
                  <input className="input-field" type="number" step="0.01" value={form.valor_liberado}
                    onChange={e => set('valor_liberado', e.target.value)} placeholder="0,00" />
                </Field>
                <Field label={operacaoVinculada?.type === 'boleto' ? 'Taxa de Deságio (% a.m.)' : form.modo_calculo === 'direto' ? 'Acréscimo Compensatório (%)' : 'Taxa Mensal (%)'}>
                  <input className="input-field" type="number" step="0.01" value={form.acrescimo_pct}
                    onChange={e => set('acrescimo_pct', e.target.value)} placeholder="5,00" />
                </Field>
                <Field label="Data da Liberação">
                  <input className="input-field" type="date" value={form.data_liberacao}
                    onChange={e => set('data_liberacao', e.target.value)} />
                </Field>
                <Field label="Prazo (dias)">
                  <div className="flex gap-2">
                    <input className="input-field flex-1" type="number" min="1" value={form.prazo_dias}
                      onChange={e => set('prazo_dias', e.target.value)} placeholder="30" />
                    <button type="button" onClick={calcVencimento} title="Calcular data de vencimento"
                      className="px-3 py-2 border border-border rounded-lg hover:bg-gray-50 text-muted-foreground hover:text-foreground transition-colors">
                      <RefreshCw className="w-4 h-4" />
                    </button>
                  </div>
                </Field>
                <Field label="Data de Vencimento *">
                  <input className="input-field" type="date" value={form.data_vencimento}
                    onChange={e => set('data_vencimento', e.target.value)} />
                </Field>
                <Field label="Nº Promissória (automático)">
                  <div className="input-field bg-gray-50 text-muted-foreground select-all font-mono text-sm">{numPromissoria}</div>
                </Field>
                <Field label="Nº Operação">
                  <div className="input-field bg-gray-50 text-muted-foreground select-all font-mono text-sm">
                    {operacaoVinculada ? `#${operacaoVinculada.id.slice(-6).toUpperCase()}` : '—'}
                  </div>
                </Field>
              </div>
            </Section>

            <Section id="inadimplencia" title="⚠️ Cláusula de Inadimplência" secoes={secoes} toggleSecao={toggleSecao}>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Field label="Prazo de tolerância (dias)">
                  <input className="input-field" type="number" min="0" value={form.prazo_atraso}
                    onChange={e => set('prazo_atraso', e.target.value)} placeholder="3" />
                </Field>
                <Field label="Multa compensatória (%)">
                  <input className="input-field" type="number" step="0.01" value={form.multa_pct}
                    onChange={e => set('multa_pct', e.target.value)} placeholder="2" />
                </Field>
                <Field label="Juros de mora (% a.m.)">
                  <input className="input-field" type="number" step="0.01" value={form.mora_pct}
                    onChange={e => set('mora_pct', e.target.value)} placeholder="1" />
                </Field>
              </div>
            </Section>

            {isCessao && (
              <Section id="cobranca" title="💰 Parâmetros de Cobrança e Recompra" secoes={secoes} toggleSecao={toggleSecao}>
                <div className="mb-4 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-xs text-amber-800">
                  Estes parâmetros integram as cláusulas de Recompra Obrigatória e Honorários de Cobrança do contrato de Cessão de Crédito.
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="Prazo para Recompra Obrigatória (dias)">
                    <input className="input-field" type="number" min="1" value={form.dias_recompra}
                      onChange={e => set('dias_recompra', e.target.value)} placeholder="30" />
                  </Field>
                  <Field label="Honorários de Cobrança (%)">
                    <input className="input-field" type="number" step="0.01" value={form.honorario_cobranca}
                      onChange={e => set('honorario_cobranca', e.target.value)} placeholder="10" />
                  </Field>
                </div>
              </Section>
            )}

            <Section id="testemunhas" title="✍️ Testemunhas" secoes={secoes} toggleSecao={toggleSecao}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Testemunha 1 — Nome">
                  <input className="input-field uppercase" value={form.test1_nome}
                    onChange={e => set('test1_nome', e.target.value.toUpperCase())} placeholder="NOME COMPLETO" />
                </Field>
                <Field label="Testemunha 1 — CPF">
                  <input className="input-field" value={form.test1_cpf}
                    onChange={e => set('test1_cpf', e.target.value)} placeholder="000.000.000-00" />
                </Field>
                <Field label="Testemunha 2 — Nome">
                  <input className="input-field uppercase" value={form.test2_nome}
                    onChange={e => set('test2_nome', e.target.value.toUpperCase())} placeholder="NOME COMPLETO" />
                </Field>
                <Field label="Testemunha 2 — CPF">
                  <input className="input-field" value={form.test2_cpf}
                    onChange={e => set('test2_cpf', e.target.value)} placeholder="000.000.000-00" />
                </Field>
              </div>
            </Section>

            <Section id="avalista" title="🛡️ Avalista (Garantidor do Pagamento)" secoes={secoes} toggleSecao={toggleSecao}>
              <div className="mb-4 flex items-center gap-3">
                <input
                  type="checkbox"
                  id="incl-avalista"
                  checked={form.incluir_avalista}
                  onChange={e => set('incluir_avalista', e.target.checked)}
                  className="w-4 h-4 rounded"
                />
                <label htmlFor="incl-avalista" className="text-sm font-medium cursor-pointer select-none">
                  Incluir avalista no contrato e na nota promissória
                </label>
              </div>
              {form.incluir_avalista && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-border">
                  <Field label="Nome Completo *" col2>
                    <input className="input-field uppercase" value={form.avalista_nome}
                      onChange={e => set('avalista_nome', e.target.value.toUpperCase())} placeholder="NOME DO AVALISTA" />
                  </Field>
                  <Field label="CPF / CNPJ *">
                    <input className="input-field" value={form.avalista_doc}
                      onChange={e => set('avalista_doc', e.target.value)} placeholder="000.000.000-00" />
                  </Field>
                  <Field label="RG">
                    <input className="input-field" value={form.avalista_rg}
                      onChange={e => set('avalista_rg', e.target.value)} placeholder="0000000-0" />
                  </Field>
                  <Field label="Endereço" col2>
                    <input className="input-field uppercase" value={form.avalista_endereco}
                      onChange={e => set('avalista_endereco', e.target.value.toUpperCase())} placeholder="RUA, NÚMERO, BAIRRO" />
                  </Field>
                  <Field label="Cidade">
                    <input className="input-field uppercase" value={form.avalista_cidade}
                      onChange={e => set('avalista_cidade', e.target.value.toUpperCase())} />
                  </Field>
                  <Field label="Estado">
                    <input className="input-field uppercase" value={form.avalista_estado}
                      onChange={e => set('avalista_estado', e.target.value.toUpperCase())} maxLength={2} placeholder="RO" />
                  </Field>
                </div>
              )}
            </Section>

            <Section id="foro" title="⚖️ Eleição de Foro" secoes={secoes} toggleSecao={toggleSecao}>
              <Field label="Cidade do Foro">
                <input className="input-field uppercase" value={form.foro_cidade}
                  onChange={e => set('foro_cidade', e.target.value.toUpperCase())} placeholder="CUIABÁ" />
              </Field>
            </Section>

          </div>

          {/* Painel lateral */}
          <div className="space-y-4">
            <div className="bg-white border border-border rounded-xl p-5 space-y-3">
              <div className="flex items-center gap-2 mb-2">
                <Calculator className="w-4 h-4 text-[hsl(43,65%,47%)]" />
                <span className="text-sm font-bold">{isCessao ? 'Preço da Cessão' : 'Resumo Financeiro'}</span>
              </div>
              <div className="space-y-2 text-sm">
                {isCessao ? (
                  <>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Valor Nominal</span>
                      <span className="font-bold">{formatCurrency(valorFinal)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Deságio ({acrescimoPct}% a.m.)</span>
                      <span className="font-semibold text-[hsl(43,65%,47%)]">− {formatCurrency(acrescimoValor)}</span>
                    </div>
                    <div className="flex justify-between pt-2 border-t border-border">
                      <span className="font-bold">Repasse ao Cedente</span>
                      <span className="font-bold text-lg text-emerald-700">{formatCurrency(valorLiquidoCessao)}</span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Valor Liberado</span>
                      <span className="font-semibold">{formatCurrency(valorLiberado)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Acréscimo Compensatório</span>
                      <span className="font-semibold text-[hsl(43,65%,47%)]">{formatCurrency(acrescimoValor)}</span>
                    </div>
                    <div className="flex justify-between pt-2 border-t border-border">
                      <span className="font-bold">Valor Final</span>
                      <span className="font-bold text-lg">{formatCurrency(valorFinal)}</span>
                    </div>
                  </>
                )}
                {prazoDias > 0 && <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Prazo</span>
                  <span>{prazoDias} dias</span>
                </div>}
                {form.data_vencimento && <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Vencimento</span>
                  <span>{fmtDate(form.data_vencimento)}</span>
                </div>}
              </div>
            </div>

            <div className="bg-white border border-border rounded-xl p-5 space-y-3">
              <span className="text-sm font-bold block mb-1">Gerar Documentos</span>
              {!canGenerate && (
                <p className="text-xs text-muted-foreground">{isCessao ? 'Preencha cedente, devedor cedido, valor e data de vencimento.' : 'Preencha credor, devedor, valor e data de vencimento.'}</p>
              )}
              <button disabled={!canGenerate} onClick={() => { setView('contrato'); salvarValidacao('contrato'); }}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-foreground text-primary-foreground text-sm font-semibold rounded-lg hover:bg-foreground/90 disabled:opacity-40 transition-colors">
                <FileText className="w-4 h-4" /> {isCessao ? 'Cessão de Crédito' : 'Ver Contrato'}
              </button>
              {isCessao && (
                <>
                  <button disabled={!canGenerate} onClick={() => { setView('confissao'); salvarValidacao('confissao'); }}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 border border-border text-sm font-semibold rounded-lg hover:bg-gray-50 disabled:opacity-40 transition-colors">
                    <ScrollText className="w-4 h-4" /> Confissão de Dívida
                  </button>
                  <button disabled={!canGenerate} onClick={() => { setView('promissoria'); salvarValidacao('promissoria'); }}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 border border-border text-sm font-semibold rounded-lg hover:bg-gray-50 disabled:opacity-40 transition-colors">
                    <FileText className="w-4 h-4" /> Nota Promissória
                  </button>
                  <button disabled={!canGenerate} onClick={() => { setView('notificacao'); salvarValidacao('notificacao'); criarNotificacaoAceite(); }}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 border border-border text-sm font-semibold rounded-lg hover:bg-gray-50 disabled:opacity-40 transition-colors">
                    <Bell className="w-4 h-4" /> Notificação ao Devedor
                  </button>
                  <button disabled={!canGenerate} onClick={() => { setView('comprovante'); salvarValidacao('comprovante'); }}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 border border-border text-sm font-semibold rounded-lg hover:bg-gray-50 disabled:opacity-40 transition-colors">
                    <Receipt className="w-4 h-4" /> Comprovante de Repasse
                  </button>
                </>
              )}
              {!isCessao && (
                <button disabled={!canGenerate} onClick={() => { setView('promissoria'); salvarValidacao('promissoria'); }}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 border border-border text-sm font-semibold rounded-lg hover:bg-gray-50 disabled:opacity-40 transition-colors">
                  <FileText className="w-4 h-4" /> Ver Nota Promissória
                </button>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div>
          {/* Tab entre documentos */}
          <div className="flex gap-2 mb-5 print:hidden flex-wrap">
            {isCessao ? (
              <>
                <TabBtn view={view} value="contrato" label="Cessão de Crédito" Icon={FileText} onClick={() => { setView('contrato'); salvarValidacao('contrato'); }} />
                <TabBtn view={view} value="confissao" label="Confissão de Dívida" Icon={ScrollText} onClick={() => { setView('confissao'); salvarValidacao('confissao'); }} />
                <TabBtn view={view} value="promissoria" label="Nota Promissória" Icon={FileText} onClick={() => { setView('promissoria'); salvarValidacao('promissoria'); }} />
                <TabBtn view={view} value="notificacao" label="Notificação ao Devedor" Icon={Bell} onClick={() => { setView('notificacao'); salvarValidacao('notificacao'); criarNotificacaoAceite(); }} />
                <TabBtn view={view} value="comprovante" label="Comprovante de Repasse" Icon={Receipt} onClick={() => { setView('comprovante'); salvarValidacao('comprovante'); }} />
              </>
            ) : (
              <>
                <TabBtn view={view} value="contrato" label="Contrato de Confissão de Dívida" Icon={FileText} onClick={() => { setView('contrato'); salvarValidacao('contrato'); }} />
                <TabBtn view={view} value="promissoria" label="Nota Promissória" Icon={FileText} onClick={() => { setView('promissoria'); salvarValidacao('promissoria'); }} />
              </>
            )}
          </div>

          <div ref={printRef} className="print-area">
            {view === 'contrato' && isCessao && (
              <CessaoCreditoPreview dados={dadosContrato} fmtDate={fmtDate} numPorExtenso={numPorExtenso} />
            )}
            {view === 'contrato' && !isCessao && (
              <ContratoPreview dados={dadosContrato} fmtDate={fmtDate} numPorExtenso={numPorExtenso} />
            )}
            {view === 'confissao' && isCessao && (
              <ConfissaoDividaPreview dados={dadosContrato} fmtDate={fmtDate} />
            )}
            {view === 'notificacao' && isCessao && (
              <TermoNotificacaoPreview dados={dadosContrato} fmtDate={fmtDate} />
            )}
            {view === 'comprovante' && isCessao && (
              <ComprovanteRepassePreview dados={dadosContrato} fmtDate={fmtDate} />
            )}
            {view === 'promissoria' && (
              <NotaPromissoriaPreview dados={dadosContrato} fmtDate={fmtDate} numPorExtenso={numPorExtenso} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}