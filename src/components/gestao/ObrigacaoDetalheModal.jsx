import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Undo2, Ban, CreditCard, Receipt, AlertTriangle, Loader2 } from 'lucide-react';
import GestaoModal from './GestaoModal';
import Field from './Field';
import StatusObrigacaoBadge from './StatusObrigacaoBadge';
import { saldoObrigacao, meioPagamentoLabel } from '@/lib/gestaoInterna';
import { formatCurrency, formatDate } from '@/lib/finance';
import { logAction } from '@/lib/audit';

/**
 * Detalhe da parcela: dados, histórico de pagamentos, estorno e cancelamento.
 * Estorno e cancelamento exigem perfil administrador.
 */
export default function ObrigacaoDetalheModal({ open, onClose, obrigacao, onReload, onPagar, isAdmin }) {
  const [pagamentos, setPagamentos] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [acao, setAcao] = useState(null);
  const [motivo, setMotivo] = useState('');
  const [processando, setProcessando] = useState(false);
  const [erro, setErro] = useState('');

  const carregar = () => {
    if (!obrigacao?.id) return;
    setCarregando(true);
    base44.entities.PagamentoInterno.filter({ obrigacao_id: obrigacao.id }, { sort: '-data_pagamento', limit: 100 })
      .then(res => { setPagamentos(res?.items || []); setCarregando(false); })
      .catch(() => { setPagamentos([]); setCarregando(false); });
  };

  useEffect(() => {
    if (!open) return;
    setAcao(null);
    setMotivo('');
    setErro('');
    carregar();
  }, [open, obrigacao?.id]);

  const estornar = async (pagamentoId) => {
    setErro('');
    if (!motivo.trim()) { setErro('Informe o motivo do estorno.'); return; }
    setProcessando(true);
    try {
      const res = await base44.functions.invoke('gestaoInternaPagamento', {
        action: 'estornar',
        pagamento_id: pagamentoId,
        motivo,
      });
      if (res.data?.error) { setErro(res.data.error); setProcessando(false); return; }
      setAcao(null);
      setMotivo('');
      carregar();
      onReload();
    } catch (e) {
      setErro(e?.response?.data?.error || e?.message || 'Erro ao estornar.');
    }
    setProcessando(false);
  };

  const cancelar = async () => {
    setErro('');
    if (!motivo.trim()) { setErro('Informe o motivo do cancelamento.'); return; }
    setProcessando(true);
    try {
      const res = await base44.functions.invoke('gestaoInternaPagamento', {
        action: 'cancelar_parcela',
        obrigacao_id: obrigacao.id,
        motivo,
      });
      if (res.data?.error) { setErro(res.data.error); setProcessando(false); return; }
      setAcao(null);
      setMotivo('');
      await logAction({ action: 'cancel', entity: 'ObrigacaoInterna', entityId: obrigacao.id, description: `Parcela cancelada — ${motivo}` }).catch(() => {});
      carregar();
      onReload();
      onClose();
    } catch (e) {
      setErro(e?.response?.data?.error || e?.message || 'Erro ao cancelar.');
    }
    setProcessando(false);
  };

  if (!obrigacao) return null;

  const saldo = saldoObrigacao(obrigacao);
  const podePagar = obrigacao.status !== 'cancelado' && obrigacao.status !== 'pago' && saldo > 0.005;
  const podeCancelar = isAdmin && obrigacao.status === 'a_vencer' && (Number(obrigacao.valor_pago) || 0) === 0;

  return (
    <GestaoModal
      open={open}
      onClose={onClose}
      size="lg"
      title={obrigacao.descricao}
      subtitle={`Parcela ${obrigacao.numero_parcela}/${obrigacao.total_parcelas} · vencimento ${formatDate(obrigacao.vencimento)}`}
      footer={(
        <>
          {podeCancelar && (
            <button onClick={() => { setAcao('cancelar'); setMotivo(''); }} className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border border-red-200 text-red-600 rounded-lg hover:bg-red-50">
              <Ban className="w-3.5 h-3.5" /> Cancelar parcela
            </button>
          )}
          {podePagar && (
            <button onClick={() => onPagar(obrigacao)} className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold bg-foreground text-primary-foreground rounded-lg hover:bg-foreground/90">
              <CreditCard className="w-4 h-4" /> {obrigacao.vencimento > new Date().toISOString().slice(0, 10) ? 'Antecipar pagamento' : 'Registrar pagamento'}
            </button>
          )}
        </>
      )}
    >
      <div className="space-y-4">
        {erro && <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{erro}</div>}

        <div className="flex items-center gap-2 flex-wrap">
          <StatusObrigacaoBadge obrigacao={obrigacao} />
          {obrigacao.categoria_nome && (
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-muted-foreground border border-border">{obrigacao.categoria_nome}</span>
          )}
          {obrigacao.antecipada && (
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">Antecipada</span>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="bg-gray-50 border border-border rounded-lg p-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Valor devido</p>
            <p className="font-mono font-semibold">{formatCurrency(obrigacao.valor)}</p>
          </div>
          <div className="bg-gray-50 border border-border rounded-lg p-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Pago</p>
            <p className="font-mono font-semibold text-emerald-600">{formatCurrency(obrigacao.valor_pago || 0)}</p>
          </div>
          <div className="bg-gray-50 border border-border rounded-lg p-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Saldo</p>
            <p className="font-mono font-semibold text-amber-700">{formatCurrency(saldo)}</p>
          </div>
          <div className="bg-gray-50 border border-border rounded-lg p-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Parcelas restantes</p>
            <p className="font-semibold">{obrigacao.status === 'pago' || obrigacao.status === 'cancelado' ? '—' : `${Math.max(0, (Number(obrigacao.total_parcelas) || 1) - (Number(obrigacao.numero_parcela) || 1))} após esta`}</p>
          </div>
        </div>

        {(obrigacao.conta_pagamento_nome || obrigacao.forma_pagamento) && (
          <div className="text-xs text-muted-foreground">
            Último pagamento: {obrigacao.conta_pagamento_nome || 'conta não informada'} · {meioPagamentoLabel(obrigacao.forma_pagamento)}
          </div>
        )}

        {obrigacao.status === 'cancelado' && obrigacao.motivo_cancelamento && (
          <div className="flex items-start gap-2 text-xs text-gray-700 bg-gray-50 border border-border rounded-lg px-3 py-2">
            <Ban className="w-4 h-4 shrink-0 mt-0.5" />
            <span>Cancelada por {obrigacao.cancelado_por || '—'}: {obrigacao.motivo_cancelamento}</span>
          </div>
        )}

        {obrigacao.observacoes && (
          <div className="text-xs text-muted-foreground">Observações: {obrigacao.observacoes}</div>
        )}

        {/* Histórico de pagamentos */}
        <div className="border border-border rounded-xl overflow-hidden">
          <div className="px-3 py-2 bg-gray-50/80 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            <Receipt className="w-3.5 h-3.5" /> Histórico de pagamentos
          </div>
          {carregando ? (
            <div className="p-6 flex justify-center"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>
          ) : pagamentos.length === 0 ? (
            <div className="p-6 text-center text-xs text-muted-foreground">Nenhum pagamento registrado.</div>
          ) : (
            <div className="divide-y divide-border">
              {pagamentos.map(p => (
                <div key={p.id} className={`px-3 py-2.5 ${p.estornado ? 'opacity-60' : ''}`}>
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold">
                        {formatDate(p.data_pagamento)} · {p.conta_nome || 'conta não informada'} · {meioPagamentoLabel(p.forma_pagamento)}
                        {p.estornado && <span className="ml-2 text-[10px] font-bold text-red-600 uppercase">Estornado</span>}
                      </p>
                      {(p.referencia || p.observacao) && (
                        <p className="text-[11px] text-muted-foreground truncate">{[p.referencia, p.observacao].filter(Boolean).join(' · ')}</p>
                      )}
                      {p.comprovante_url && (
                        <a href={p.comprovante_url} target="_blank" rel="noreferrer" className="text-[11px] text-foreground underline">Ver comprovante</a>
                      )}
                      {p.estornado && p.estorno_motivo && (
                        <p className="text-[11px] text-red-600">Estorno: {p.estorno_motivo}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-xs font-semibold">{formatCurrency(p.valor_pago)}</span>
                      {isAdmin && !p.estornado && (
                        <button
                          onClick={() => { setAcao(`estorno:${p.id}`); setMotivo(''); setErro(''); }}
                          className="flex items-center gap-1 text-[11px] font-semibold text-muted-foreground hover:text-red-600"
                        >
                          <Undo2 className="w-3.5 h-3.5" /> Estornar
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {!isAdmin && (
          <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" /> Estorno e cancelamento de parcelas são restritos a administradores.
          </p>
        )}

        {acao && (
          <div className="border border-border rounded-xl p-4 space-y-3 bg-gray-50/60">
            <p className="text-xs font-semibold">
              {acao.startsWith('estorno') ? 'Motivo do estorno' : 'Motivo do cancelamento'}
            </p>
            <Field label="Justificativa" required>
              <input className="input-field" value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Descreva o motivo" />
            </Field>
            <div className="flex justify-end gap-2">
              <button onClick={() => { setAcao(null); setMotivo(''); }} className="px-3 py-2 text-xs font-medium border border-border rounded-lg hover:bg-gray-50">Voltar</button>
              <button
                onClick={() => (acao.startsWith('estorno') ? estornar(acao.split(':')[1]) : cancelar())}
                disabled={processando}
                className="px-3 py-2 text-xs font-semibold bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {processando ? 'Processando...' : 'Confirmar'}
              </button>
            </div>
          </div>
        )}
      </div>
    </GestaoModal>
  );
}