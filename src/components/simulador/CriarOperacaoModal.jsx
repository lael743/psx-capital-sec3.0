import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, ArrowRight, CheckCircle2 } from 'lucide-react';
import { formatCurrency } from '@/lib/finance';
import { calcScenario } from '@/pages/Simulador';

export default function CriarOperacaoModal({ scenarios, results, linkedClient, onClose }) {
  const navigate = useNavigate();
  const [selectedIdx, setSelectedIdx] = useState(
    results.findIndex(Boolean) // default: primeiro cenário válido
  );

  const validScenarios = scenarios
    .map((s, i) => ({ s, r: results[i], i }))
    .filter(({ r }) => !!r);

  const handleCriar = () => {
    if (selectedIdx < 0) return;
    const s = scenarios[selectedIdx];
    // Serializa os dados do cenário como query param
    const params = new URLSearchParams();
    if (linkedClient?.id) params.set('client', linkedClient.id);
    params.set('sim', JSON.stringify({
      type: s.type,
      gross_value: s.gross_value,
      rate: s.rate,
      interest_type: s.interest_type,
      start_date: s.start_date,
      due_date: s.due_date,
      installments: s.installments,
      interval_days: s.interval_days,
      capital_cost: s.capital_cost,
      juros_embutido: s.juros_embutido,
    }));
    navigate(`/operacoes/nova?${params.toString()}`);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div>
            <h2 className="text-base font-bold">Criar Operação a partir da Simulação</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Selecione o cenário para pré-preencher o formulário</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-3">
          {validScenarios.length === 0 ? (
            <div className="text-center py-6 text-sm text-muted-foreground">
              Nenhum cenário com dados completos para criar operação.
            </div>
          ) : (
            <>
              {validScenarios.map(({ s, r, i }) => (
                <button
                  key={i}
                  onClick={() => setSelectedIdx(i)}
                  className={`w-full text-left rounded-xl border-2 p-4 transition-colors ${selectedIdx === i ? 'border-foreground bg-gray-50' : 'border-border hover:border-gray-300'}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold">{s.label}</span>
                        <span className="text-[10px] font-medium bg-gray-100 px-1.5 py-0.5 rounded-full">
                          {s.type === 'cheque' ? 'Cheque' : 'Empréstimo'}
                        </span>
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <span>Taxa: <strong className="text-foreground">{s.rate}% a.m.</strong></span>
                        <span>Prazo: <strong className="text-foreground">{r.days}d</strong></span>
                        <span>Líquido: <strong className="text-emerald-700">{formatCurrency(r.netValue)}</strong></span>
                        <span>Total: <strong className="text-[hsl(43,65%,47%)]">{formatCurrency(r.totalReceivable)}</strong></span>
                        {s.type === 'emprestimo' && parseInt(s.installments) > 1 && (
                          <span className="col-span-2">Parcelas: <strong>{s.installments}x de {formatCurrency(r.installmentValue)}</strong></span>
                        )}
                      </div>
                    </div>
                    {selectedIdx === i && (
                      <CheckCircle2 className="w-5 h-5 text-foreground shrink-0 mt-0.5" />
                    )}
                  </div>
                </button>
              ))}

              {linkedClient && (
                <div className="text-xs text-muted-foreground bg-blue-50 px-3 py-2 rounded-lg">
                  Cliente vinculado: <span className="font-semibold">{linkedClient.name}</span> — será pré-selecionado
                </div>
              )}

              <button
                onClick={handleCriar}
                disabled={selectedIdx < 0 || !results[selectedIdx]}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 bg-foreground text-primary-foreground text-sm font-bold rounded-xl disabled:opacity-50 hover:bg-foreground/90 transition-colors"
              >
                Ir para Nova Operação <ArrowRight className="w-4 h-4" />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}