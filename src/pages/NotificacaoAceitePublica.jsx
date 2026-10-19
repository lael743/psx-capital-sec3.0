import { useEffect, useState } from 'react';
import { CheckCircle, Clock, XCircle, AlertCircle, Shield } from 'lucide-react';
import { formatCurrency } from '@/lib/finance';
import { invokePublic, invokePublicGet } from '@/lib/publicApi';

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

export default function NotificacaoAceitePublica() {
  const urlParams = new URLSearchParams(window.location.search);
  const aceiteHash = urlParams.get('hash');

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [aceitando, setAceitando] = useState(false);
  const [aceito, setAceito] = useState(false);
  const [erro, setErro] = useState('');

  const settings = getSettings();
  const companyName = settings.company_name || 'PSX Capital';

  useEffect(() => {
    if (!aceiteHash) { setLoading(false); setNotFound(true); return; }
    invokePublicGet('publicNotificacaoAceite', { hash: aceiteHash })
      .then(res => {
        setData(res.data);
        if (res.data.status === 'aceito') setAceito(true);
        setLoading(false);
      })
      .catch(() => { setNotFound(true); setLoading(false); });
  }, [aceiteHash]);

  const handleAceitar = async () => {
    setAceitando(true);
    setErro('');
    try {
      const res = await invokePublic('publicNotificacaoAceite', { hash: aceiteHash });
      const result = res.data;
      if (result.success) {
        setAceito(true);
        setData(d => ({ ...d, status: 'aceito', aceite_data: result.aceite_data }));
      } else {
        setErro(result.error || 'Erro ao processar aceite.');
      }
    } catch {
      setErro('Erro de conexão. Tente novamente.');
    } finally {
      setAceitando(false);
    }
  };

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
        <h1 className="text-xl font-bold text-gray-900 mb-2">Link inválido ou expirado</h1>
        <p className="text-gray-500 text-sm max-w-sm">
          O link de notificação não foi encontrado. Entre em contato com a {companyName} para mais informações.
        </p>
      </div>
    );
  }

  const op = data?.operacao;
  const dadosTermo = data?.dados_termo || {};
  const statusNotificacao = data?.status;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-lg">

        {/* Header */}
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
              <p className="text-sm font-semibold" style={{ color: '#e0e0e0' }}>Notificação de Cessão de Crédito</p>
              <p className="text-xs" style={{ color: '#666' }}>{companyName}</p>
            </div>
          </div>
        </div>

        {/* Status Banner */}
        <div className={`border-x border-b p-4 flex items-center gap-3 ${
          aceito ? 'bg-emerald-50 border-emerald-200' :
          'bg-blue-50 border-blue-200'
        }`}>
          {aceito ? (
            <>
              <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0" />
              <div>
                <p className="text-sm font-bold text-emerald-900">Termo Aceito</p>
                <p className="text-xs text-emerald-700">
                  Aceito em {data?.aceite_data ? fmtDateTime(data.aceite_data) : 'data não registrada'}
                </p>
              </div>
            </>
          ) : (
            <>
              <Clock className="w-5 h-5 text-blue-600 shrink-0" />
              <div>
                <p className="text-sm font-bold text-blue-900">Aguardando Confirmação</p>
                <p className="text-xs text-blue-700">Revise os dados abaixo e confirme o aceite</p>
              </div>
            </>
          )}
        </div>

        {/* Conteúdo */}
        <div className="bg-white border border-t-0 border-gray-200 rounded-b-2xl overflow-hidden">

          {/* Dados da Notificação */}
          <div className="px-6 py-4 border-b border-gray-100">
            <div className="flex items-center gap-2 mb-3">
              <AlertCircle className="w-4 h-4 text-gray-400" />
              <p className="text-xs font-bold uppercase tracking-wider text-gray-400">Termo de Notificação ao Devedor Cedido</p>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-3">
              <p className="text-sm text-amber-900 leading-relaxed">
                A <strong>{companyName}</strong> notifica que os créditos devidos a <strong>{dadosTermo.cedente_nome || op?.client_name || '—'}</strong> foram cedidos, e todos os pagamentos devem ser realizados exclusivamente à <strong>{companyName}</strong>.
              </p>
            </div>
            <div className="space-y-3 text-sm">
              <Row label="Devedor Cedido" value={dadosTermo.cedido_nome || op?.sacado_name || '—'} bold />
              <Row label="Valor Nominal" value={formatCurrency(dadosTermo.valor_nominal || op?.total_receivable)} bold />
              {dadosTermo.num_operacao && <Row label="Operação" value={dadosTermo.num_operacao} mono />}
              <Row label="Data de Emissão" value={fmtDate(dadosTermo.data_emissao)} />
            </div>
          </div>

          {/* Parcelas (se houver) */}
          {op?.installment_schedule?.length > 0 && (
            <div className="px-6 py-4 border-b border-gray-100">
              <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">Parcelas Vinculadas</p>
              <div className="space-y-1.5">
                {op.installment_schedule.map((p, i) => (
                  <div key={i} className="flex justify-between text-sm bg-gray-50 rounded-lg px-3 py-2">
                    <span className="text-muted-foreground">{p.number}ª parcela — {fmtDate(p.due_date)}</span>
                    <span className="font-semibold">{formatCurrency(p.value)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Botão de Aceite */}
          <div className="px-6 py-4 bg-gray-50 border-t border-gray-100">
            {aceito ? (
              <div className="text-center">
                <div className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-100 text-emerald-800 rounded-lg text-sm font-semibold">
                  <CheckCircle className="w-4 h-4" /> Este termo já foi aceito
                </div>
                <p className="text-xs text-gray-400 mt-2">
                  O aceite é irreversível e foi registrado em {data?.aceite_data ? fmtDateTime(data.aceite_data) : '—'}.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {erro && (
                  <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                    <AlertCircle className="w-4 h-4 shrink-0" /> {erro}
                  </div>
                )}
                <button onClick={handleAceitar} disabled={aceitando}
                  className="w-full inline-flex items-center justify-center gap-2 px-6 py-3 bg-foreground text-primary-foreground text-sm font-semibold rounded-xl hover:bg-foreground/90 disabled:opacity-50 transition-colors">
                  <Shield className="w-4 h-4" />
                  {aceitando ? 'Processando...' : 'Aceitar e Confirmar Notificação'}
                </button>
                <p className="text-xs text-gray-400 text-center">
                  Ao aceitar, você confirma estar ciente da cessão de crédito. Esta ação é <strong>irreversível</strong>.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, mono, bold }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-gray-500 shrink-0">{label}</span>
      <span className={`text-right ${bold ? 'font-bold text-gray-900' : 'font-medium text-gray-800'} ${mono ? 'font-mono' : ''}`}>
        {value || '—'}
      </span>
    </div>
  );
}