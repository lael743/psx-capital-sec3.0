import { useState, useEffect } from 'react';
import { Bell, CheckCircle, Clock, Send, ExternalLink, Copy, AlertCircle, Eye, X } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { formatCurrency } from '@/lib/finance';

const STORAGE_KEY = 'psx_company_settings';
function getSettings() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch { return {}; }
}

function fmtDate(str) {
  if (!str) return '—';
  const [y, m, d] = str.split('-');
  return `${d}/${m}/${y}`;
}

export default function NotificacaoStatusCard({ operacao, client, onUpdate }) {
  const [gerando, setGerando] = useState(false);
  const [copied, setCopied] = useState(false);
  const [aceiteHash, setAceiteHash] = useState('');
  const [showPreview, setShowPreview] = useState(false);

  const settings = getSettings();
  const companyName = settings.company_name || 'PSX Capital';

  const notificacaoStatus = operacao?.notificacao_status;
  const opType = operacao?.type;

  useEffect(() => {
    if (!operacao?.id) return;
    if (notificacaoStatus === 'enviado' || notificacaoStatus === 'aceito') {
      base44.entities.NotificacaoAceite.filter({ operation_id: operacao.id }, '-created_date', 1)
        .then(results => {
          if (results?.length > 0) setAceiteHash(results[0].aceite_hash);
        }).catch(() => {});
    }
  }, [operacao?.id, notificacaoStatus]);

  // Só relevante para operações de boleto que têm sacado
  if (opType !== 'boleto' || !operacao?.sacado_name) return null;

  const numOp = operacao.numero_operacao
    ? `#${String(operacao.numero_operacao).padStart(6, '0')}`
    : `#${operacao.id?.slice(-6).toUpperCase()}`;

  const dadosTermo = {
    cedente_nome: operacao.client_name || client?.name || '',
    cedente_doc: client?.document || '',
    cedido_nome: operacao.sacado_name || '',
    valor_nominal: operacao.total_receivable || 0,
    num_operacao: numOp,
    data_emissao: new Date().toISOString().split('T')[0],
  };

  const handleGerarNotificacao = async () => {
    if (!operacao?.id) return;
    setGerando(true);
    try {
      const hash = crypto.randomUUID();
      setAceiteHash(hash);
      await base44.entities.NotificacaoAceite.create({
        operation_id: operacao.id,
        client_name: operacao.sacado_name,
        aceite_hash: hash,
        status: 'enviado',
        dados_termo: dadosTermo,
      });
      await base44.entities.Operation.update(operacao.id, { notificacao_status: 'enviado' });
      if (onUpdate) onUpdate();
    } finally {
      setGerando(false);
    }
  };

  const linkAceite = aceiteHash
    ? `${window.location.origin}/notificacao/aceite?hash=${aceiteHash}`
    : '';

  const copyLink = () => {
    navigator.clipboard.writeText(linkAceite);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <>
      <div className="bg-white border border-border rounded-xl overflow-hidden">
        {notificacaoStatus === 'aceito' ? (
          <div className="p-4 flex items-start gap-3 bg-emerald-50">
            <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-bold text-emerald-900">Notificação Aceita pelo Sacado</p>
              <p className="text-xs text-emerald-700 mt-0.5">
                O sacado confirmou o recebimento da notificação de cessão de crédito.
              </p>
            </div>
            <button onClick={() => setShowPreview(true)} className="text-xs font-semibold text-emerald-700 underline whitespace-nowrap">Ver termo</button>
          </div>
        ) : notificacaoStatus === 'enviado' ? (
          <div className="p-4 space-y-3">
            <div className="flex items-start gap-3">
              <Send className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-bold text-blue-900">Notificação Enviada</p>
                <p className="text-xs text-blue-700 mt-0.5">Aguardando o aceite do sacado.</p>
              </div>
              <button onClick={() => setShowPreview(true)} className="text-xs font-semibold text-blue-700 underline whitespace-nowrap">Ver termo</button>
            </div>
            {linkAceite && (
              <div className="flex items-center gap-2 bg-gray-50 border border-border rounded-lg px-3 py-2">
                <input readOnly value={linkAceite} className="flex-1 text-xs font-mono bg-transparent outline-none text-muted-foreground" />
                <button onClick={copyLink} className="p-1.5 rounded-md hover:bg-gray-200 transition-colors text-muted-foreground">
                  {copied ? <CheckCircle className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
                <a href={linkAceite} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded-md hover:bg-gray-200 transition-colors text-muted-foreground">
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            )}
          </div>
        ) : (
          <div className="p-4 space-y-3">
            <div className="flex items-start gap-3">
              <Bell className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-bold text-amber-900">Notificar Sacado da Operação</p>
                <p className="text-xs text-amber-700 mt-0.5">
                  Gere um link para que o sacado visualize e aceite o termo de notificação de cessão de crédito.
                </p>
              </div>
            </div>
            <div className="flex gap-2 flex-wrap">
              <button onClick={() => setShowPreview(true)} className="inline-flex items-center gap-2 px-4 py-2 border border-border text-xs font-semibold rounded-lg hover:bg-gray-50 transition-colors">
                <Eye className="w-4 h-4" /> Preview do Termo
              </button>
              <button onClick={handleGerarNotificacao} disabled={gerando} className="inline-flex items-center gap-2 px-4 py-2 bg-amber-600 text-white text-xs font-semibold rounded-lg hover:bg-amber-700 disabled:opacity-50 transition-colors">
                <Send className="w-4 h-4" /> {gerando ? 'Gerando...' : 'Gerar Notificação'}
              </button>
            </div>
          </div>
        )}
      </div>

      {showPreview && (
        <PreviewModal operacao={operacao} dadosTermo={dadosTermo} companyName={companyName} onClose={() => setShowPreview(false)} />
      )}
    </>
  );
}

function PreviewModal({ operacao, dadosTermo, companyName, onClose }) {
  const schedule = operacao?.installment_schedule || [];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-border px-5 py-3 flex items-center justify-between z-10">
          <h3 className="text-sm font-bold">Preview do Termo de Notificação</h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-5 space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
            <p className="text-sm text-amber-900 leading-relaxed">
              A <strong>{companyName}</strong> notifica que os créditos devidos a <strong>{dadosTermo.cedente_nome}</strong> foram cedidos, e todos os pagamentos devem ser realizados exclusivamente à <strong>{companyName}</strong>.
            </p>
          </div>

          <div className="space-y-2.5 text-sm">
            <Row label="Devedor Cedido (Sacado)" value={dadosTermo.cedido_nome} bold />
            <Row label="Cedente" value={dadosTermo.cedente_nome} />
            <Row label="Valor Nominal" value={formatCurrency(dadosTermo.valor_nominal)} bold />
            <Row label="Operação" value={dadosTermo.num_operacao} mono />
            <Row label="Data de Emissão" value={fmtDate(dadosTermo.data_emissao)} />
          </div>

          {schedule.length > 0 && (
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Parcelas Vinculadas</p>
              <div className="space-y-1.5">
                {schedule.map((p, i) => (
                  <div key={i} className="flex justify-between text-sm bg-gray-50 rounded-lg px-3 py-2">
                    <span className="text-muted-foreground">{p.number}ª parcela — {fmtDate(p.due_date)}</span>
                    <span className="font-semibold">{formatCurrency(p.value)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="text-xs text-muted-foreground bg-gray-50 rounded-lg p-3 border border-border">
            Este é o termo que o sacado visualizará ao acessar o link de notificação. O aceite é irreversível.
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, mono, bold }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className={`text-right ${bold ? 'font-bold' : 'font-medium'} ${mono ? 'font-mono' : ''}`}>{value || '—'}</span>
    </div>
  );
}