import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Undo2, FileText } from 'lucide-react';
import GestaoModal from './GestaoModal';
import Field from './Field';
import { meioPagamentoLabel } from '@/lib/gestaoInterna';
import { formatCurrency, formatDate } from '@/lib/finance';

/** Detalhe do pagamento registrado, com estorno (restrito a administradores). */
export default function PagamentoDetalheModal({ open, onClose, pagamento, onReload, isAdmin }) {
  const [estornando, setEstornando] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [processando, setProcessando] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    if (!open) return;
    setEstornando(false);
    setMotivo('');
    setErro('');
  }, [open, pagamento?.id]);

  if (!pagamento) return null;

  const confirmarEstorno = async () => {
    setErro('');
    if (!motivo.trim()) { setErro('Informe o motivo do estorno.'); return; }
    setProcessando(true);
    try {
      const res = await base44.functions.invoke('gestaoInternaPagamento', {
        action: 'estornar',
        pagamento_id: pagamento.id,
        motivo,
      });
      if (res.data?.error) { setErro(res.data.error); setProcessando(false); return; }
      onReload();
      onClose();
    } catch (e) {
      setErro(e?.response?.data?.error || e?.message || 'Erro ao estornar.');
    }
    setProcessando(false);
  };

  return (
    <GestaoModal
      open={open}
      onClose={onClose}
      title="Detalhe do pagamento"
      subtitle={`${formatDate(pagamento.data_pagamento)} · ${formatCurrency(pagamento.valor_pago)}`}
      footer={isAdmin && !pagamento.estornado && !estornando ? (
        <button onClick={() => setEstornando(true)} className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border border-red-200 text-red-600 rounded-lg hover:bg-red-50">
          <Undo2 className="w-3.5 h-3.5" /> Estornar pagamento
        </button>
      ) : null}
    >
      <div className="space-y-4">
        {erro && <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{erro}</div>}

        {pagamento.estornado && (
          <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            Pagamento estornado{pagamento.estorno_motivo ? ` — ${pagamento.estorno_motivo}` : ''}. O histórico foi preservado.
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="bg-gray-50 border border-border rounded-lg p-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Valor</p>
            <p className="font-mono font-semibold">{formatCurrency(pagamento.valor_pago)}</p>
          </div>
          <div className="bg-gray-50 border border-border rounded-lg p-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Data</p>
            <p className="font-semibold">{formatDate(pagamento.data_pagamento)}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Conta de origem</p>
            <p>{pagamento.conta_nome || '—'}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Forma de pagamento</p>
            <p>{meioPagamentoLabel(pagamento.forma_pagamento)}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Referência</p>
            <p>{pagamento.referencia || '—'}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Efeito no caixa</p>
            <p>{pagamento.cashflow_id ? 'Lançado no fluxo central' : 'Não lançado'}</p>
          </div>
        </div>

        {pagamento.observacao && <p className="text-xs text-muted-foreground">Observação: {pagamento.observacao}</p>}

        {pagamento.comprovante_url && (
          <a href={pagamento.comprovante_url} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-xs text-foreground border border-border rounded-lg px-3 py-2 hover:bg-gray-50 w-fit">
            <FileText className="w-3.5 h-3.5" /> Ver comprovante
          </a>
        )}

        {estornando && (
          <div className="border border-border rounded-xl p-4 space-y-3 bg-gray-50/60">
            <p className="text-xs font-semibold">Motivo do estorno</p>
            <Field label="Justificativa" required>
              <input className="input-field" value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Descreva o motivo" />
            </Field>
            <div className="flex justify-end gap-2">
              <button onClick={() => { setEstornando(false); setMotivo(''); }} className="px-3 py-2 text-xs font-medium border border-border rounded-lg hover:bg-gray-50">Voltar</button>
              <button onClick={confirmarEstorno} disabled={processando} className="px-3 py-2 text-xs font-semibold bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50">
                {processando ? 'Processando...' : 'Confirmar estorno'}
              </button>
            </div>
          </div>
        )}
      </div>
    </GestaoModal>
  );
}