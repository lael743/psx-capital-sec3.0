import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle, XCircle, FileEdit, Send, RotateCcw, AlertTriangle } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { getNextStage, acoesDisponiveis, ACOES, MOTIVO_MINIMO } from '@/lib/operationWorkflow';
import { transicionarOperacao } from '@/lib/workflowOps';

/**
 * M5 — ações do workflow na tela.
 *
 * A tela mostra apenas o que é compatível com a etapa e o papel atuais, mas
 * quem autoriza é o servidor: cada clique é uma solicitação de transição, não
 * uma gravação direta da etapa. Recusas (pré-requisito faltando, efeito
 * financeiro já existente, etapa alterada por outra pessoa) aparecem aqui.
 */
export default function WorkflowActions({ operacao, onUpdate }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState('');
  const [avisos, setAvisos] = useState([]);
  const [rejeicao, setRejeicao] = useState(null);
  const [motivo, setMotivo] = useState('');

  const etapa = operacao?.etapa || 'nova';
  const nextStage = getNextStage(etapa);
  const disponiveis = acoesDisponiveis(operacao || {}, user);
  const podeAvancar = disponiveis.includes(ACOES.AVANCAR) && !!nextStage;
  const podeRejeitar = disponiveis.includes(ACOES.REJEITAR);
  const podeReabrir = disponiveis.includes(ACOES.REABRIR);
  const podeRascunho = disponiveis.includes(ACOES.VOLTAR_RASCUNHO);

  const executar = async (acao, motivoInformado) => {
    setLoading(true);
    setErro('');
    setAvisos([]);
    const resposta = await transicionarOperacao({ operacaoId: operacao.id, acao, motivo: motivoInformado });
    setLoading(false);
    if (!resposta.ok) {
      setErro(resposta.erro || 'Transição não permitida.');
      return;
    }
    setAvisos(Array.isArray(resposta.avisos) ? resposta.avisos : []);
    setRejeicao(null);
    setMotivo('');
    onUpdate?.();
  };

  if (!operacao || etapa === 'finalizada') {
    return avisos.length > 0 ? <Avisos itens={avisos} /> : null;
  }

  const Btn = ({ onClick, label, icon: Icon, color, title }) => (
    <button
      onClick={onClick}
      disabled={loading}
      title={title}
      className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border rounded-lg transition-colors disabled:opacity-50 ${color}`}
    >
      <Icon className="w-3.5 h-3.5" /> {label}
    </button>
  );

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {etapa === 'analise_credito' && disponiveis.length > 0 && (
          <Btn onClick={() => navigate(`/operacoes/${operacao.id}/editar`)} label="Editar" icon={FileEdit} color="border-border hover:bg-gray-50" />
        )}
        {podeAvancar && (
          <Btn
            onClick={() => executar(ACOES.AVANCAR)}
            label={`Enviar para ${nextStage.label}`}
            icon={Send}
            color="border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-100"
          />
        )}
        {podeRascunho && (
          <Btn
            onClick={() => executar(ACOES.VOLTAR_RASCUNHO)}
            label="Voltar para rascunho"
            icon={RotateCcw}
            color="border-amber-200 text-amber-700 bg-amber-50 hover:bg-amber-100"
            title="Só é permitido quando a operação não tem nenhum efeito financeiro."
          />
        )}
        {podeRejeitar && (
          <Btn
            onClick={() => { setMotivo(''); setErro(''); setRejeicao(true); }}
            label="Rejeitar"
            icon={XCircle}
            color="border-red-200 text-red-700 bg-red-50 hover:bg-red-100"
          />
        )}
        {podeReabrir && (
          <Btn
            onClick={() => executar(ACOES.REABRIR)}
            label="Reabrir"
            icon={CheckCircle}
            color="border-amber-200 text-amber-700 bg-amber-50 hover:bg-amber-100"
            title="Reabre como rascunho e devolve a pendente apenas os títulos cancelados sem efeito financeiro."
          />
        )}
      </div>

      {erro && (
        <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{erro}</p>
      )}
      <Avisos itens={avisos} />

      {rejeicao && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setRejeicao(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-red-500" />
              </div>
              <div>
                <h3 className="text-sm font-bold">Rejeitar operação</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  A rejeição cancela os títulos pendentes e fica registrada no histórico.
                  Operações com recebimento, cobrança emitida, repasse executado ou título
                  compensado não podem ser rejeitadas.
                </p>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Motivo da rejeição *</label>
              <textarea
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                rows={3}
                placeholder="Descreva o motivo da rejeição"
                className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-ring"
              />
              {motivo.trim().length > 0 && motivo.trim().length < MOTIVO_MINIMO && (
                <p className="text-xs text-red-600 mt-1">Informe ao menos {MOTIVO_MINIMO} caracteres.</p>
              )}
              {erro && <p className="text-xs text-red-700 mt-2">{erro}</p>}
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setRejeicao(null)} className="px-4 py-2 text-sm font-medium border border-border rounded-lg hover:bg-gray-50">
                Cancelar
              </button>
              <button
                onClick={() => executar(ACOES.REJEITAR, motivo)}
                disabled={loading || motivo.trim().length < MOTIVO_MINIMO}
                className="px-4 py-2 text-sm font-semibold bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                Rejeitar operação
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Avisos({ itens }) {
  if (!itens || itens.length === 0) return null;
  return (
    <ul className="space-y-1">
      {itens.map((aviso, i) => (
        <li key={i} className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex items-start gap-2">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" /> {aviso}
        </li>
      ))}
    </ul>
  );
}