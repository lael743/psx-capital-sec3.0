import { Check } from 'lucide-react';

export default function WizardStepper({ currentStep, step2Label = 'Digitação de Títulos' }) {
  const STEPS = [
    { num: 1, label: 'Cedente & Produto' },
    { num: 2, label: step2Label },
    { num: 3, label: 'Documentos' },
    { num: 4, label: 'Resumo & Confirmação' },
  ];
  return (
    <div className="flex items-center w-full max-w-3xl mx-auto mb-8">
      {STEPS.map((step, i) => {
        const isCompleted = currentStep > step.num;
        const isActive = currentStep === step.num;
        const isLast = i === STEPS.length - 1;

        return (
          <div key={step.num} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center gap-1.5">
              <div
                className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold transition-all shrink-0 ${
                  isCompleted
                    ? 'bg-emerald-500 text-white'
                    : isActive
                    ? 'bg-[hsl(43,65%,47%)] text-white ring-4 ring-[hsl(43,65%,47%)]/20'
                    : 'bg-gray-200 text-gray-400'
                }`}
              >
                {isCompleted ? <Check className="w-4.5 h-4.5" /> : step.num}
              </div>
              <span
                className={`text-[10px] font-semibold uppercase tracking-wide text-center leading-tight ${
                  isActive ? 'text-foreground' : isCompleted ? 'text-emerald-600' : 'text-gray-400'
                }`}
              >
                {step.label}
              </span>
            </div>
            {!isLast && (
              <div
                className={`h-0.5 flex-1 mx-2 -mt-5 rounded-full transition-colors ${
                  currentStep > step.num ? 'bg-emerald-500' : 'bg-gray-200'
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}