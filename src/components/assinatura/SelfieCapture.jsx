import { useRef, useState, useCallback, useEffect } from 'react';
import { Camera, RotateCcw, CheckCircle, Loader2, Shield } from 'lucide-react';

export default function SelfieCapture({ onSave, signerName = '', signerDoc = '' }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const overlayRef = useRef(null);
  const streamRef = useRef(null);
  const [captured, setCaptured] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const startCamera = useCallback(async () => {
    setError('');
    setLoading(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
    } catch {
      setError('Não foi possível acessar a câmera. Verifique as permissões.');
    }
    setLoading(false);
  }, []);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
  }, []);

  useEffect(() => {
    startCamera();
    return () => stopCamera();
  }, []);

  useEffect(() => {
    if (streamRef.current && videoRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => {});
    }
  }, [loading]);

  const addWatermark = (dataUrl) => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');

        // Draw original image
        ctx.drawImage(img, 0, 0);

        // Watermark overlay at bottom
        const now = new Date();
        const dateStr = now.toLocaleString('pt-BR', { timeZone: 'America/Manaus', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const lines = [
          `PSX Capital — Assinatura Eletrônica`,
          signerName ? `Signatário: ${signerName}` : '',
          signerDoc ? `CPF/CNPJ: ${signerDoc}` : '',
          `Data/Hora: ${dateStr} (UTC-4)`,
          `Dispositivo: ${navigator.userAgent.substring(0, 60)}`,
        ].filter(Boolean);

        const padding = 10;
        const lineHeight = Math.max(16, img.height * 0.025);
        const fontSize = lineHeight * 0.75;
        const boxHeight = lines.length * lineHeight + padding * 2;

        // Semi-transparent dark bar
        ctx.fillStyle = 'rgba(0,0,0,0.65)';
        ctx.fillRect(0, img.height - boxHeight, img.width, boxHeight);

        // Text
        ctx.font = `bold ${fontSize}px monospace`;
        ctx.fillStyle = '#ffffff';
        lines.forEach((line, i) => {
          ctx.fillText(line, padding, img.height - boxHeight + padding + (i + 1) * lineHeight - 2);
        });

        // Gold border at top of watermark
        ctx.strokeStyle = '#c8a550';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, img.height - boxHeight);
        ctx.lineTo(img.width, img.height - boxHeight);
        ctx.stroke();

        resolve(canvas.toDataURL('image/jpeg', 0.88));
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    });
  };

  const capture = async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    // Mirror flip (selfie natural)
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0);
    const raw = canvas.toDataURL('image/jpeg', 0.9);
    stopCamera();
    const withWm = await addWatermark(raw);
    setCaptured(withWm);
  };

  const retake = () => {
    setCaptured(null);
    stopCamera();
    startCamera();
  };

  const confirm = () => {
    if (captured) onSave(captured);
  };

  return (
    <div className="space-y-3">
      {error ? (
        <div className="text-center py-4">
          <p className="text-sm text-red-500 mb-3">{error}</p>
          <button onClick={startCamera} className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-gray-50">
            <RotateCcw className="w-3.5 h-3.5 inline mr-1.5" /> Tentar novamente
          </button>
        </div>
      ) : captured ? (
        <div className="space-y-3">
          <div className="relative rounded-xl overflow-hidden border border-border">
            <img src={captured} alt="Selfie capturada" className="w-full object-cover rounded-xl" />
            <div className="absolute top-2 right-2 bg-emerald-500 text-white text-xs font-bold px-2 py-1 rounded-full flex items-center gap-1">
              <Shield className="w-3 h-3" /> Verificada
            </div>
          </div>
          <div className="flex gap-2 justify-center">
            <button onClick={retake} className="flex items-center gap-1.5 px-4 py-2 text-sm border border-border rounded-lg hover:bg-gray-50">
              <RotateCcw className="w-3.5 h-3.5" /> Refazer
            </button>
            <button onClick={confirm} className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold bg-foreground text-white rounded-lg hover:bg-foreground/90">
              <CheckCircle className="w-3.5 h-3.5" /> Confirmar e Assinar
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {loading ? (
            <div className="flex items-center justify-center h-64 bg-gray-100 rounded-xl">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="relative bg-black rounded-xl overflow-hidden" style={{ aspectRatio: '1/1' }}>
              {/* Mirror video */}
              <video
                ref={videoRef}
                className="w-full h-full object-cover"
                style={{ transform: 'scaleX(-1)' }}
                autoPlay playsInline muted
              />
              <canvas ref={canvasRef} className="hidden" />

              {/* Oval face guide overlay */}
              <svg
                className="absolute inset-0 w-full h-full pointer-events-none"
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
              >
                {/* Dark overlay with oval cutout */}
                <defs>
                  <mask id="oval-mask">
                    <rect width="100" height="100" fill="white" />
                    <ellipse cx="50" cy="46" rx="28" ry="35" fill="black" />
                  </mask>
                </defs>
                <rect width="100" height="100" fill="rgba(0,0,0,0.45)" mask="url(#oval-mask)" />
                {/* Oval border */}
                <ellipse cx="50" cy="46" rx="28" ry="35" fill="none" stroke="#c8a550" strokeWidth="0.8" />
              </svg>

              {/* Top instruction */}
              <div className="absolute top-3 left-0 right-0 text-center">
                <span className="text-xs text-white font-semibold bg-black/50 px-3 py-1 rounded-full">
                  Centralize seu rosto no oval
                </span>
              </div>
            </div>
          )}
          <button onClick={capture} disabled={loading}
            className="flex items-center justify-center gap-2 w-full px-4 py-3 bg-foreground text-white text-sm font-semibold rounded-xl hover:bg-foreground/90 disabled:opacity-40">
            <Camera className="w-4 h-4" /> Capturar Selfie
          </button>
        </div>
      )}
    </div>
  );
}