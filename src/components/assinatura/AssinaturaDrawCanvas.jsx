import { useRef, useState, useCallback, useEffect } from 'react';
import { Eraser, Check } from 'lucide-react';

export default function AssinaturaDrawCanvas({ onSave, width = 500, height = 180 }) {
  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasContent, setHasContent] = useState(false);
  const [ctx, setCtx] = useState(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    context.strokeStyle = '#000';
    context.lineWidth = 2;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    setCtx(context);
  }, []);

  const getPos = useCallback((e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
      x: (clientX - rect.left) * (canvas.width / rect.width),
      y: (clientY - rect.top) * (canvas.height / rect.height),
    };
  }, []);

  const startDraw = useCallback((e) => {
    e.preventDefault();
    if (!ctx) return;
    const { x, y } = getPos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
  }, [ctx, getPos]);

  const draw = useCallback((e) => {
    e.preventDefault();
    if (!isDrawing || !ctx) return;
    const { x, y } = getPos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    setHasContent(true);
  }, [isDrawing, ctx, getPos]);

  const stopDraw = useCallback(() => {
    if (!ctx) return;
    ctx.closePath();
    setIsDrawing(false);
  }, [ctx]);

  const clear = useCallback(() => {
    if (!ctx) return;
    ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    setHasContent(false);
  }, [ctx]);

  const confirm = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL('image/png');
    onSave(dataUrl);
  }, [onSave]);

  return (
    <div className="space-y-3">
      <div className="border-2 border-dashed border-border rounded-xl bg-white overflow-hidden">
        <canvas
          ref={canvasRef}
          width={width}
          height={height}
          className="w-full touch-none cursor-crosshair"
          onMouseDown={startDraw}
          onMouseMove={draw}
          onMouseUp={stopDraw}
          onMouseLeave={stopDraw}
          onTouchStart={startDraw}
          onTouchMove={draw}
          onTouchEnd={stopDraw}
        />
      </div>
      <div className="flex gap-2 justify-center">
        <button
          type="button"
          onClick={clear}
          className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium border border-border rounded-lg hover:bg-gray-50 text-muted-foreground"
        >
          <Eraser className="w-3.5 h-3.5" /> Limpar
        </button>
        <button
          type="button"
          onClick={confirm}
          disabled={!hasContent}
          className="flex items-center gap-1.5 px-5 py-2 text-xs font-semibold bg-foreground text-white rounded-lg hover:bg-foreground/90 disabled:opacity-40"
        >
          <Check className="w-3.5 h-3.5" /> Confirmar Assinatura
        </button>
      </div>
    </div>
  );
}