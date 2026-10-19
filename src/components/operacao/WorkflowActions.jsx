import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { CheckCircle, XCircle, FileEdit, Send, RotateCcw, AlertTriangle } from 'lucide-react';
import { logAction } from '@/lib/audit';
import { getNextStage } from '@/lib/operationWorkflow';
import { formatCurrency } from '@/lib/finance';
import { syncTitulosByOperacaoStatus } from '@/lib/syncCheque';

const STORAGE_KEY = 'psx_company_settings';
function getSettings() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch { return {}; }
}

export default function WorkflowActions({ operacao, onUpdate }) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [analiseWarning, setAnaliseWarning] = useState(null);
  const etapa = operacao?.etapa || 'nova';
  const nextStage = getNextStage(etapa);
  const isFinal = etapa === 'finalizada';
  const isRejected = etapa === 'rejeitada';
  const isDraft = etapa === 'rascunho';

  const updateEtapa = async (newEtapa, description) => {
    setLoading(true);
    const updated = await base44.entities.Operation.update(operacao.id, { etapa: newEtapa });
    await syncTitulosByOperacaoStatus({ ...operacao, etapa: newEtapa, status: updated?.status || operacao.status });
    await logAction({ action: 'update', entity: 'Operation', entityId: operacao.id, description });
    setLoading(false);
    onUpdate?.();
  };

  const checkAnaliseCredito = async () => {
    setLoading(true);
    const settings = getSettings();
    try {
      const [client, ops] = await Promise.all([
        base44.entities.Client.get(operacao.client_id),
        base44.entities.Operation.filter({ client_id: operacao.client_id }, '-created_date', 200),
      ]);

      const activeOps = ops.filter(o =>
        o.id !== operacao.id &&
        o.status !== 'quitado' &&
        !['rejeitada', 'rascunho', 'finalizada'].includes(o.etapa || '')
      );
      const usedLimit = activeOps.reduce((s, o) => s + (o.balance_due || o.total_receivable || 0), 0);
      const thisOpValue = operacao.total_receivable || operacao.balance_due || 0;
      const totalExposure = usedLimit + thisOpValue;
      const creditLimit = client.credit_limit || 0;
      const overLimit = creditLimit > 0 && totalExposure > creditLimit;

      const missingDocs = [];
      if (!client.doc_rg_url) missingDocs.push('RG');
      if (!client.doc_cnh_url) missingDocs.push('CNH');
      if (!client.doc_income_url) missingDocs.push('Comprovante de Renda');
      if (!client.doc_address_url) missingDocs.push('Comprovante de Endereço');

      const issues = [];
      let blocked = false;

      if (overLimit) {
        issues.push(`Limite de crédito excedido: ${formatCurrency(totalExposure)} utilizado de ${formatCurrency(creditLimit)} disponível`);
        if (settings.block_over_limit !== false) blocked = true;
      }
      if (missingDocs.length > 0 && settings.validate_cpf_cnpj !== false) {
        issues.push(`Documentação incompleta: faltam ${missingDocs.join(', ')}`);
      }
      if (client.status === 'bloqueado') {
        issues.push('Cliente bloqueado no sistema');
        blocked = true;
      } else if (client.status === 'risco') {
        issues.push('Cliente em situação de risco');
      }

      setLoading(false);

      if (issues.length === 0) {
        updateEtapa(nextStage.key, `Operação avançou para ${nextStage.label}`);
      } else {
        setAnaliseWarning({ issues, blocked });
      }
    } catch (e) {
      setLoading(false);
      updateEtapa(nextStage.key, `Operação avançou para ${nextStage.label}`);
    }
  };

  const Btn = ({ onClick, label, icon: Icon, color }) => (
    <button
      onClick={onClick}
      disabled={loading}
      className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border rounded-lg transition-colors disabled:opacity-50 ${color}`}
    >
      <Icon className="w-3.5 h-3.5" /> {label}
    </button>
  );

  if (isFinal) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {isRejected ? (
        <Btn onClick={() => updateEtapa('rascunho', 'Operação reaberta como rascunho')} label="Reabrir" icon={RotateCcw} color="border-amber-200 text-amber-700 bg-amber-50 hover:bg-amber-100" />
      ) : (
        <>
          <Btn onClick={() => updateEtapa('rejeitada', 'Operação rejeitada')} label="Rejeitar" icon={XCircle} color="border-red-200 text-red-700 bg-red-50 hover:bg-red-100" />
          {!isDraft && (
            <Btn onClick={() => updateEtapa('rascunho', 'Operação voltou para rascunho')} label="Rascunho" icon={RotateCcw} color="border-amber-200 text-amber-700 bg-amber-50 hover:bg-amber-100" />
          )}
          {etapa === 'analise_credito' && (
            <Btn onClick={() => navigate(`/operacoes/${operacao.id}/editar`)} label="Editar" icon={FileEdit} color="border-border hover:bg-gray-50" />
          )}
          {nextStage && (
            <Btn
              onClick={etapa === 'analise_credito' ? checkAnaliseCredito : () => updateEtapa(nextStage.key, `Operação avançou para ${nextStage.label}`)}
              label={`Enviar para ${nextStage.label}`}
              icon={Send}
              color="border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-100"
            />
          )}
        </>
      )}

      {/* Análise de Crédito Warning Dialog */}
      {analiseWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setAnaliseWarning(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-amber-500" />
              </div>
              <div>
                <h3 className="text-sm font-bold">Avisos na Análise de Crédito</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  {analiseWarning.blocked
                    ? 'Corrija os itens abaixo antes de avançar:'
                    : 'Foram identificados avisos. Deseja avançar mesmo assim?'}
                </p>
              </div>
            </div>
            <ul className="space-y-2">
              {analiseWarning.issues.map((issue, i) => (
                <li key={i} className="text-sm text-amber-800 flex items-start gap-2 bg-amber-50 rounded-lg px-3 py-2">
                  <span className="text-amber-500 shrink-0">•</span> {issue}
                </li>
              ))}
            </ul>
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setAnaliseWarning(null)} className="px-4 py-2 text-sm font-medium border border-border rounded-lg hover:bg-gray-50">
                {analiseWarning.blocked ? 'Corrigir' : 'Cancelar'}
              </button>
              {!analiseWarning.blocked && (
                <button
                  onClick={() => { setAnaliseWarning(null); updateEtapa(nextStage.key, `Operação avançou para ${nextStage.label}`); }}
                  className="px-4 py-2 text-sm font-semibold bg-foreground text-white rounded-lg hover:bg-foreground/90"
                >
                  Avançar mesmo assim
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}