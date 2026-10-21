import { Check } from 'lucide-react';
import { STAGES } from '@/lib/operationWorkflow';

/** As 7 etapas da operação. "Rascunho" é o estado anterior ao fluxo, não uma etapa. */
const ETAPAS = STAGES.filter((s) => s.key !== 'rascunho');

export default function WorkflowStepper({ currentEtapa }) {
  const efetiva = currentEtapa === 'rascunho' ? 'nova' : currentEtapa;
  const currentIndex = ETAPAS.findIndex((s) => s.key === efetiva);

  return (
    <div className="bg-white border border-border rounded-xl p-4 overflow-x-auto">
      <div className="flex items-center gap-0 min-w-max">
        {ETAPAS.map((stage, i) => {
          const isCompleted = i < currentIndex;
          const isCurrent = i === currentIndex;
          const isRejected = currentEtapa === 'rejeitada' && i === currentIndex;

          return (
            <div key={stage.key} className="flex items-center shrink-0">
              <div className="flex flex-col items-center gap-1 w-24">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold border-2 transition-colors ${
                  isRejected ? 'bg-red-500 border-red-500 text-white' :
                  isCompleted ? 'bg-emerald-500 border-emerald-500 text-white' :
                  isCurrent ? 'bg-foreground border-foreground text-primary-foreground' :
                  'bg-white border-border text-muted-foreground'
                }`}>
                  {isCompleted ? <Check className="w-3.5 h-3.5" /> : i + 1}
                </div>
                <span className={`text-[10px] font-medium text-center leading-tight whitespace-normal ${
                  isCurrent ? 'text-foreground' : isCompleted ? 'text-emerald-600' : 'text-muted-foreground'
                }`}>{stage.label}</span>
              </div>
              {i < ETAPAS.length - 1 && (
                <div className={`h-0.5 w-6 ${isCompleted ? 'bg-emerald-500' : 'bg-border'}`} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}