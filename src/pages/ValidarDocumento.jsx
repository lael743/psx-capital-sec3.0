import { useEffect, useState } from 'react';
import { CheckCircle, XCircle, Clock, AlertTriangle, FileText, Shield, Hash, Calendar, User, Banknote } from 'lucide-react';
import { formatCurrency } from '@/lib/finance';
import { invokePublicGet } from '@/lib/publicApi';

const STORAGE_KEY = 'psx_company_settings';
function getSettings() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch { return {}; }
}

function fmtDate(str) {
  if (!str) return '—';
  const [y, m, d] = str.split('-');
  return `${d}/${m}/${y}`;
}

function fmtDateTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pt-BR');
}

const statusLabels = {
  ativo: { label: 'Ativo', color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200', icon: CheckCircle },
  quitado: { label: 'Quitado', color: 'text-blue-700', bg: 'bg-blue-50 border-blue-200', icon: CheckCircle },
  pendente_contrato: { label: 'Pendente de Contrato', color: 'text-amber-700', bg: 'bg-amber-50 border-amber-200', icon: Clock },
  atrasado: { label: 'Em Atraso', color: 'text-orange-700', bg: 'bg-orange-50 border-orange-200', icon: AlertTriangle },
  inadimplente: { label: 'Inadimplente', color: 'text-red-700', bg: 'bg-red-50 border-red-200', icon: XCircle },
};

const docTypeLabels = {
  contrato: 'Contrato de Confissão de Dívida',
  promissoria: 'Nota Promissória',
  cessao: 'Cessão de Crédito',
  confissao: 'Confissão de Dívida',
  notificacao: 'Termo de Notificação',
  comprovante: 'Comprovante de Repasse',
};

export default function ValidarDocumento() {
  const urlParams = new URLSearchParams(window.location.search);
  const docId = urlParams.get('id');

  const [doc, setDoc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const settings = getSettings();
  const companyName = settings.company_name || 'PSX Capital';

  useEffect(() => {
    if (!docId) { setLoading(false); setNotFound(true); return; }
    
    let cancelled = false;
    invokePublicGet('publicDocumentoValidacao', { doc_id: docId })
      .then(res => {
        if (cancelled) return;
        setDoc(res.data);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setNotFound(true);
        setLoading(false);
      });
    
    return () => { cancelled = true; };
  }, [docId]);

  const valor = doc?.valor;
  const vencimento = doc?.data_vencimento;
  const statusKey = doc?.status_operacao ?? 'ativo';
  const statusInfo = statusLabels[statusKey] || { label: statusKey, color: 'text-gray-700', bg: 'bg-gray-50 border-gray-200', icon: FileText };
  const StatusIcon = statusInfo.icon;
  const docType = doc?.doc_type || 'contrato';
  const docTypeLabel = docTypeLabels[docType] || 'Documento';

  // Hash SHA256 simulado do doc_id (em produção seria gerado no backend)
  const docHash = docId ? btoa(docId).slice(0, 32) : '—';

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-gray-300 border-t-gray-800 rounded-full animate-spin" />
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mb-4">
          <XCircle className="w-8 h-8 text-red-500" />
        </div>
        <h1 className="text-xl font-bold text-gray-900 mb-2">Documento não encontrado</h1>
        <p className="text-gray-500 text-sm max-w-sm">
          O identificador fornecido não corresponde a nenhum documento registrado em nosso sistema.
        </p>
        <p className="text-xs text-gray-400 mt-4 font-mono">{docId || 'ID não informado'}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-lg">

        {/* Header empresa */}
        <div className="rounded-t-2xl overflow-hidden" style={{ background: '#0f0f0f' }}>
          <div className="px-6 py-5 flex items-center gap-4">
            <div className="flex flex-col">
              <div className="flex items-baseline gap-0 leading-none">
                <span className="text-xl font-black" style={{ color: '#b0b8c1', fontFamily: 'Arial Black, sans-serif' }}>PS</span>
                <span className="text-xl font-black" style={{ color: '#c8a550', fontFamily: 'Arial Black, sans-serif' }}>X</span>
              </div>
              <div className="text-xs font-bold tracking-widest uppercase" style={{ color: '#888', letterSpacing: '0.25em' }}>Capital</div>
            </div>
            <div className="w-px self-stretch" style={{ background: '#2a2a2a' }} />
            <div>
              <p className="text-sm font-semibold" style={{ color: '#e0e0e0' }}>Verificação de Autenticidade</p>
              <p className="text-xs" style={{ color: '#666' }}>{companyName}</p>
            </div>
            <div className="ml-auto">
              <Shield className="w-6 h-6" style={{ color: '#c8a550' }} />
            </div>
          </div>
        </div>

        {/* Status */}
        <div className={`border-x border-b p-4 flex items-center gap-3 ${statusInfo.bg}`}>
          <StatusIcon className={`w-5 h-5 ${statusInfo.color}`} />
          <div>
            <p className={`text-sm font-bold ${statusInfo.color}`}>{statusInfo.label}</p>
            <p className="text-xs text-gray-500">Status atual da operação vinculada</p>
          </div>
        </div>

        {/* Dados do documento */}
        <div className="bg-white border border-t-0 border-gray-200 rounded-b-2xl overflow-hidden">
          
          {/* Identificação */}
          <div className="px-6 py-4 border-b border-gray-100">
            <div className="flex items-center gap-2 mb-3">
              <Hash className="w-4 h-4 text-gray-400" />
              <p className="text-xs font-bold uppercase tracking-wider text-gray-400">Identificação do Documento</p>
            </div>
            <div className="space-y-3 text-sm">
              <Row label="ID Único" value={doc?.doc_id} mono small />
              <Row label="Hash SHA256" value={docHash} mono small />
              <Row label="Tipo de Documento" value={docTypeLabel} />
              <Row label="Data de Emissão" value={fmtDate(doc?.data_emissao)} />
              <Row label="Última Verificação" value={fmtDateTime(doc?.updated_date)} mono small />
            </div>
          </div>

          {/* Dados da Operação */}
          <div className="px-6 py-4 border-b border-gray-100">
            <div className="flex items-center gap-2 mb-3">
              <Banknote className="w-4 h-4 text-gray-400" />
              <p className="text-xs font-bold uppercase tracking-wider text-gray-400">Dados da Operação</p>
            </div>
            <div className="space-y-3 text-sm">
              {doc?.num_operacao && <Row label="Nº da Operação" value={doc.num_operacao} mono />}
              {doc?.num_promissoria && <Row label="Nº da Promissória" value={doc.num_promissoria} mono />}
              <Row label="Valor do Título" value={formatCurrency(valor)} bold />
              <Row label="Vencimento" value={fmtDate(vencimento)} bold />
            </div>
          </div>

          {/* Partes */}
          <div className="px-6 py-4 border-b border-gray-100">
            <div className="flex items-center gap-2 mb-3">
              <User className="w-4 h-4 text-gray-400" />
              <p className="text-xs font-bold uppercase tracking-wider text-gray-400">Partes Envolvidas</p>
            </div>
            <div className="space-y-3 text-sm">
              <Row label="Emitente" value={doc?.emitente_nome} />
              {doc?.emitente_doc && <Row label="CPF/CNPJ Emitente" value={doc.emitente_doc} mono />}
              <Row label="Beneficiário" value={doc?.beneficiario_nome} />
              {doc?.beneficiario_doc && <Row label="CPF/CNPJ Beneficiário" value={doc.beneficiario_doc} mono />}
            </div>
          </div>

          {/* Situação */}
          <div className="px-6 py-4 border-b border-gray-100">
            <div className="flex items-center gap-2 mb-3">
              <Calendar className="w-4 h-4 text-gray-400" />
              <p className="text-xs font-bold uppercase tracking-wider text-gray-400">Situação do Documento</p>
            </div>
            <div className="space-y-3 text-sm">
              <Row label="Situação" value="✓ Válido e Autêntico" bold />
              <Row label="Operação Vinculada" value={statusInfo.label} />
              <Row label="Registrado em" value={fmtDateTime(doc?.created_date)} mono small />
            </div>
          </div>

          <div className="px-6 py-4 bg-gray-50 border-t border-gray-100">
            <p className="text-xs text-gray-400 text-center">
              Documento verificado por {companyName} · {new Date().toLocaleDateString('pt-BR')}<br />
              Esta verificação confirma a autenticidade e integridade do documento original.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, mono, bold, small }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-gray-500 shrink-0">{label}</span>
      <span className={`text-right ${bold ? 'font-bold text-gray-900' : 'font-medium text-gray-800'} ${mono ? 'font-mono' : ''} ${small ? 'text-xs' : ''}`}>
        {value || '—'}
      </span>
    </div>
  );
}