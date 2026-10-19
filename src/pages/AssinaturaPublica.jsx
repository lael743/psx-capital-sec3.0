import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Shield, CheckCircle, AlertTriangle, Loader2, ScanFace, Lock, FileText, Eye } from 'lucide-react';
import SelfieCapture from '@/components/assinatura/SelfieCapture';
import PublicDocumentPreviewModal from '@/components/assinatura/PublicDocumentPreviewModal';
import { invokePublic } from '@/lib/publicApi';

const SETTINGS_STORAGE_KEY = 'psx_company_settings';

// Comprime imagem base64 e retorna data URL
function compressImage(dataUrl, maxWidth = 800, quality = 0.6) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let w = img.width, h = img.height;
      if (w > maxWidth) { h = h * (maxWidth / w); w = maxWidth; }
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

function detectDevice() {
  const ua = navigator.userAgent;
  if (/tablet|ipad|playbook|silk/i.test(ua)) return 'tablet';
  if (/mobi|android|iphone|ipod|blackberry|opera mini|iemobile/i.test(ua)) return 'mobile';
  return 'desktop';
}

function detectBrowser() {
  const ua = navigator.userAgent;
  if (ua.includes('Firefox')) return 'Firefox';
  if (ua.includes('Edg')) return 'Edge';
  if (ua.includes('Chrome')) return 'Chrome';
  if (ua.includes('Safari')) return 'Safari';
  return 'Desconhecido';
}

function detectOS() {
  const ua = navigator.userAgent;
  if (ua.includes('Windows')) return 'Windows';
  if (ua.includes('Mac')) return 'macOS';
  if (ua.includes('Linux')) return 'Linux';
  if (ua.includes('Android')) return 'Android';
  if (ua.includes('iPhone') || ua.includes('iPad')) return 'iOS';
  return 'Desconhecido';
}

const REDIRECT_URL = 'https://psxcapital.com.br';

export default function AssinaturaPublica() {
  const { uuid } = useParams();
  const [step, setStep] = useState('loading'); // loading | view | preview | selfie | signing | done | error
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [signing, setSigning] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    if (!uuid) return;
    invokePublic('dadosAssinaturaPublica', { public_link: uuid })
      .then(res => {
        if (res.data.error) {
          if (res.data.already_signed) {
            setData(res.data.signature);
            setStep('done');
          } else {
            setError(res.data.error);
            setStep('error');
          }
        } else {
          setData(res.data);
          // Armazena settings da empresa no localStorage para buildDadosContrato
          if (res.data.company_settings) {
            try {
              localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(res.data.company_settings));
            } catch (_) { /* non-critical */ }
          }
          setStep('view');
        }
      })
      .catch(err => {
        setError(err.response?.data?.error || 'Erro ao carregar documento');
        setStep('error');
      });
  }, [uuid]);

  const handleSelfie = async (selfieImage) => {
    setSigning(true);
    setStep('signing');
    try {
      const isMobile = detectDevice() === 'mobile';
      const maxW = isMobile ? 400 : 600;
      const qual = isMobile ? 0.35 : 0.5;
      const compressedSelfie = await compressImage(selfieImage, maxW, qual);

      const evidence = {
        public_link: uuid,
        selfie_base64: compressedSelfie,
        ip_address: 'coletado',
        user_agent: navigator.userAgent,
        device_type: detectDevice(),
        browser: detectBrowser(),
        operating_system: detectOS(),
        screen_resolution: `${window.screen.width}x${window.screen.height}`,
        language: navigator.language,
        latitude: '',
        longitude: '',
        gps_accuracy: '',
      };

      if (navigator.geolocation) {
        try {
          const pos = await new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000, maximumAge: 60000 });
          });
          evidence.latitude = String(pos.coords.latitude);
          evidence.longitude = String(pos.coords.longitude);
          evidence.gps_accuracy = String(pos.coords.accuracy);
        } catch (_) { /* GPS não disponível */ }
      }

      const res = await invokePublic('finalizarAssinatura', evidence);
      if (res.data.success) {
        setStep('done');
        // Redirecionar após 3 segundos
        setTimeout(() => {
          window.location.href = REDIRECT_URL;
        }, 3000);
      } else {
        setError(res.data.error || 'Erro ao finalizar assinatura');
        setStep('error');
      }
    } catch (err) {
      const msg = err?.response?.data?.error || err?.message || 'Erro de conexão';
      setError(msg);
      setStep('error');
    }
    setSigning(false);
  };

  // Loading
  if (step === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-3">
          <div className="text-xl font-bold">PS<span className="gold-text">X</span></div>
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Carregando...</p>
        </div>
      </div>
    );
  }

  // Error
  if (step === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-8 h-8 text-red-500" />
          </div>
          <h1 className="text-lg font-bold mb-2">Link Indisponível</h1>
          <p className="text-sm text-muted-foreground">{error || 'Este link de assinatura não é válido ou expirou.'}</p>
        </div>
      </div>
    );
  }

  // Done
  if (step === 'done') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="text-center max-w-md bg-white border border-border rounded-2xl p-8 shadow-sm">
          <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-8 h-8 text-emerald-600" />
          </div>
          <h1 className="text-lg font-bold mb-2">Assinatura Concluída!</h1>
          <p className="text-sm text-muted-foreground">
            Sua identidade foi verificada e todos os documentos foram assinados com sucesso.
          </p>
        </div>
      </div>
    );
  }

  // Main signing flow
  const operation = data?.operation;
  const client = data?.client;
  const signer = data?.signer;
  const documents = data?.documents || [];

  const opNum = operation?.numero_operacao ? `Operação ${String(operation.numero_operacao).padStart(6, '0')}` : 'Operação';
  const valor = operation?.total_receivable || operation?.gross_value || 0;
  const motivo = `Formalização ${opNum}`;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-border px-4 py-3">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <div className="flex items-center">
            <span className="text-lg font-bold">PS<span className="gold-text">X</span></span>
            <span className="text-xs text-muted-foreground ml-2">Assinatura Eletrônica</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Shield className="w-3.5 h-3.5" /> Ambiente Seguro
          </div>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-md space-y-4">
          {/* Summary Card - like the reference image */}
          {step === 'view' && (
            <div className="bg-white border border-border rounded-2xl shadow-sm overflow-hidden">
              {/* Icon */}
              <div className="pt-8 pb-4 flex justify-center">
                <div className="w-16 h-16 rounded-2xl bg-gray-50 border border-border flex items-center justify-center">
                  <ScanFace className="w-8 h-8 text-foreground" />
                </div>
              </div>

              {/* Title */}
              <div className="text-center px-6 pb-5">
                <h1 className="text-lg font-bold">Verificação de identidade</h1>
                <p className="text-sm text-muted-foreground mt-1">
                  Confirme seus dados e realize a biometria facial para assinar todos os documentos.
                </p>
              </div>

              {/* Info Rows */}
              <div className="px-6 pb-5 space-y-0">
                <div className="flex items-center justify-between py-3 border-t border-border">
                  <span className="text-sm text-muted-foreground">Motivo</span>
                  <span className="text-sm font-semibold">{motivo}</span>
                </div>
                <div className="flex items-center justify-between py-3 border-t border-border">
                  <span className="text-sm text-muted-foreground">Valor</span>
                  <span className="text-sm font-semibold">
                    {valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </span>
                </div>
                <div className="flex items-center justify-between py-3 border-t border-border">
                  <span className="text-sm text-muted-foreground">Cedente</span>
                  <span className="text-sm font-semibold truncate ml-3">{client?.name || signer?.name || '—'}</span>
                </div>
                <div className="flex items-center justify-between py-3 border-t border-b border-border">
                  <span className="text-sm text-muted-foreground">Documentos</span>
                  <span className="text-sm font-semibold">{documents.length} documento{documents.length !== 1 ? 's' : ''}</span>
                </div>
              </div>

              {/* Documents list */}
              <div className="px-6 pb-4">
                <div className="space-y-1.5">
                  {documents.map((doc, i) => (
                    <div key={doc.id || i} className="flex items-center gap-2 text-xs text-muted-foreground">
                      <CheckCircle className="w-3.5 h-3.5 text-muted-foreground/50" />
                      <span className="truncate">{doc.title}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Preview Button */}
              <div className="px-6 pb-2">
                <button
                  onClick={() => setShowPreview(true)}
                  className="w-full px-4 py-2.5 bg-white border border-border text-foreground text-sm font-semibold rounded-xl hover:bg-gray-50 transition-colors flex items-center justify-center gap-2"
                >
                  <Eye className="w-4 h-4" /> Visualizar documentos
                </button>
              </div>

              {/* Action Button */}
              <div className="px-6 pb-3">
                <button
                  onClick={() => setStep('selfie')}
                  className="w-full px-4 py-3 bg-foreground text-white text-sm font-bold rounded-xl hover:bg-foreground/90 transition-colors flex items-center justify-center gap-2"
                >
                  <ScanFace className="w-4 h-4" /> Aceitar e assinar
                </button>
              </div>

              {/* Footer */}
              <div className="px-6 pb-4 text-center">
                <p className="text-xs text-muted-foreground">
                  Visualize todos os documentos antes de prosseguir. Ao assinar, você concorda com os termos e aceita a assinatura eletrônica de todos os documentos listados.
                </p>
              </div>
            </div>
          )}

          {/* Selfie Step */}
          {(step === 'selfie' || step === 'signing') && (
            <div className="bg-white border border-border rounded-2xl shadow-sm p-6 space-y-4">
              <div className="text-center">
                <h2 className="text-base font-bold">Verificação Biométrica</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Posicione seu rosto centralizado no oval e tire a selfie. Esta única biometria assinará todos os {documents.length} documentos.
                </p>
              </div>
              {step === 'selfie' && (
                <SelfieCapture
                  onSave={handleSelfie}
                  signerName={signer?.name || client?.name || ''}
                  signerDoc={signer?.cpf_cnpj || client?.document || ''}
                />
              )}
              {step === 'signing' && (
                <div className="flex flex-col items-center justify-center gap-3 py-8">
                  <Loader2 className="w-8 h-8 animate-spin text-foreground" />
                  <p className="text-sm font-medium">Registrando assinatura...</p>
                  <p className="text-xs text-muted-foreground">Assinando {documents.length} documentos com sua biometria</p>
                </div>
              )}
            </div>
          )}

          {/* Security footer */}
          <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <Lock className="w-3.5 h-3.5" /> Ambiente seguro · PSX Capital
          </div>
        </div>
      </main>

      {/* Preview Modal */}
      {showPreview && data && (
        <PublicDocumentPreviewModal
          documents={documents}
          operation={data.operation}
          client={data.client}
          cheques={data.cheques}
          sacado={data.sacado}
          pessoas={data.pessoas}
          onClose={() => setShowPreview(false)}
          onAccept={() => {
            setShowPreview(false);
            setStep('selfie');
          }}
        />
      )}
    </div>
  );
}