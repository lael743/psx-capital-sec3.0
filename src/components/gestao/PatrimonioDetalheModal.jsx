import { useEffect, useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { logAction } from '@/lib/audit';
import { Pencil, Info, History, FileText, Ban, Loader2 } from 'lucide-react';
import GestaoModal from './GestaoModal';
import Field from './Field';
import StatusPatrimonioBadge from './StatusPatrimonioBadge';
import { calcularDepreciacao, hojeISO } from '@/lib/gestaoInterna';
import { formatCurrency, formatDate } from '@/lib/finance';

/** Ficha do bem: aquisição, documentos, depreciação gerencial e histórico. */
export default function PatrimonioDetalheModal({ open, onClose, bem, onEdit, onReload, isAdmin }) {
  const [baixa, setBaixa] = useState(null);
  const [form, setForm] = useState({ data: hojeISO(), motivo: '', valor: '' });
  const [processando, setProcessando] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    if (!open) return;
    setBaixa(null);
    setErro('');
    setForm({ data: hojeISO(), motivo: '', valor: '' });
  }, [open, bem?.id]);

  const dep = useMemo(() => calcularDepreciacao(bem), [bem]);

  if (!bem) return null;

  const podeBaixar = isAdmin && bem.status !== 'baixado' && bem.status !== 'vendido';

  const registrarBaixa = async () => {
    setErro('');
    if (!form.data) { setErro('Informe a data.'); return; }
    if (!form.motivo.trim()) { setErro('Informe o motivo.'); return; }
    setProcessando(true);
    try {
      const tipo = baixa === 'vendido' ? 'vendido' : 'baixado';
      const historico = [
        ...(bem.historico || []),
        {
          data: new Date().toISOString(),
          usuario: '',
          acao: tipo,
          descricao: `${tipo === 'vendido' ? 'Venda' : 'Baixa'} em ${formatDate(form.data)} — ${form.motivo}${form.valor ? ` · ${formatCurrency(Number(form.valor))}` : ''}`,
        },
      ];
      await base44.entities.PatrimonioInterno.update(bem.id, {
        status: tipo,
        baixa_data: form.data,
        baixa_motivo: form.motivo,
        baixa_valor: Number(form.valor) || 0,
        historico,
      });
      await logAction({ action: tipo, entity: 'PatrimonioInterno', entityId: bem.id, description: `${bem.nome} — ${form.motivo}` });
      onReload();
      onClose();
    } catch (e) {
      setErro(e?.message || 'Erro ao registrar a baixa.');
    }
    setProcessando(false);
  };

  const baixado = bem.status === 'baixado' || bem.status === 'vendido';

  return (
    <GestaoModal
      open={open}
      onClose={onClose}
      size="lg"
      title={bem.nome}
      subtitle={bem.categoria_nome || 'Patrimônio'}
      footer={(
        <>
          {podeBaixar && (
            <>
              <button onClick={() => { setBaixa('vendido'); setErro(''); }} className="px-3 py-2 text-xs font-semibold border border-blue-200 text-blue-700 rounded-lg hover:bg-blue-50">
                Registrar venda
              </button>
              <button onClick={() => { setBaixa('baixado'); setErro(''); }} className="px-3 py-2 text-xs font-semibold border border-red-200 text-red-600 rounded-lg hover:bg-red-50">
                Registrar baixa
              </button>
            </>
          )}
          <button onClick={() => onEdit(bem)} className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold bg-foreground text-primary-foreground rounded-lg hover:bg-foreground/90">
            <Pencil className="w-4 h-4" /> Editar
          </button>
        </>
      )}
    >
      <div className="space-y-4">
        {erro && <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{erro}</div>}

        <StatusPatrimonioBadge status={bem.status} />

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="bg-gray-50 border border-border rounded-lg p-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Aquisição</p>
            <p className="font-semibold">{formatDate(bem.data_aquisicao)}</p>
          </div>
          <div className="bg-gray-50 border border-border rounded-lg p-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Quantidade</p>
            <p className="font-semibold">{bem.quantidade || 1}</p>
          </div>
          <div className="bg-gray-50 border border-border rounded-lg p-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Valor de aquisição</p>
            <p className="font-mono font-semibold">{formatCurrency(bem.valor_total || 0)}</p>
          </div>
          <div className="bg-gray-50 border border-border rounded-lg p-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Valor contábil est.</p>
            <p className="font-mono font-semibold">{formatCurrency(dep.valorContabil)}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Valor unitário</p>
            <p className="font-mono">{formatCurrency(bem.valor_unitario || 0)}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Fornecedor</p>
            <p>{bem.fornecedor || '—'}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Responsável</p>
            <p>{bem.responsavel || '—'}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Localização</p>
            <p>{bem.localizacao || '—'}</p>
          </div>
        </div>

        {/* Depreciação */}
        <div className="border border-border rounded-xl p-4 space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold">
            <Info className="w-3.5 h-3.5" /> Depreciação linear estimada
          </div>
          {dep.aplicavel ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Meses decorridos</p>
                <p className="font-semibold">{dep.mesesDecorridos} de {dep.vidaUtilMeses}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Depreciação mensal</p>
                <p className="font-mono">{formatCurrency(dep.depreciacaoMensal)}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Acumulada</p>
                <p className="font-mono">{formatCurrency(dep.depreciacaoAcumulada)}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Residual</p>
                <p className="font-mono">{formatCurrency(dep.valorResidual || 0)}</p>
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Informe a vida útil em meses e a data de aquisição para calcular a depreciação.</p>
          )}
          <p className="text-[10px] text-muted-foreground border-t border-border pt-2">
            Controle gerencial estimado. Não representa contabilização fiscal nem escrituração contábil oficial.
          </p>
        </div>

        {bem.documento_url && (
          <a href={bem.documento_url} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-xs text-foreground border border-border rounded-lg px-3 py-2 hover:bg-gray-50 w-fit">
            <FileText className="w-3.5 h-3.5" /> {bem.documento_nome || 'Documento / nota fiscal'}
          </a>
        )}

        {bem.observacoes && <p className="text-xs text-muted-foreground">Observações: {bem.observacoes}</p>}

        {baixado && bem.baixa_motivo && (
          <div className="flex items-start gap-2 text-xs text-gray-700 bg-gray-50 border border-border rounded-lg px-3 py-2">
            <Ban className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{bem.status === 'vendido' ? 'Vendido' : 'Baixado'} em {formatDate(bem.baixa_data)} — {bem.baixa_motivo}
              {bem.baixa_valor ? ` · ${formatCurrency(bem.baixa_valor)}` : ''}</span>
          </div>
        )}

        {/* Histórico */}
        <div className="border border-border rounded-xl overflow-hidden">
          <div className="px-3 py-2 bg-gray-50/80 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            <History className="w-3.5 h-3.5" /> Histórico de alterações
          </div>
          {(bem.historico || []).length === 0 ? (
            <div className="p-4 text-center text-xs text-muted-foreground">Sem registros.</div>
          ) : (
            <div className="divide-y divide-border">
              {[...(bem.historico || [])].reverse().map((h, i) => (
                <div key={i} className="px-3 py-2 text-xs">
                  <p className="font-medium">{h.descricao}</p>
                  <p className="text-[11px] text-muted-foreground">{formatDate(h.data)}{h.usuario ? ` · ${h.usuario}` : ''}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {baixa && (
          <div className="border border-border rounded-xl p-4 space-y-3 bg-gray-50/60">
            <p className="text-xs font-semibold">{baixa === 'vendido' ? 'Registrar venda do bem' : 'Registrar baixa do bem'}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Data" required>
                <input type="date" className="input-field" value={form.data} onChange={e => setForm(f => ({ ...f, data: e.target.value }))} />
              </Field>
              <Field label={baixa === 'vendido' ? 'Valor da venda (R$)' : 'Valor de baixa (R$)'}>
                <input type="number" step="0.01" className="input-field" value={form.valor} onChange={e => setForm(f => ({ ...f, valor: e.target.value }))} placeholder="Opcional" />
              </Field>
            </div>
            <Field label="Motivo" required>
              <input className="input-field" value={form.motivo} onChange={e => setForm(f => ({ ...f, motivo: e.target.value }))} placeholder="Descreva o motivo" />
            </Field>
            <div className="flex justify-end gap-2">
              <button onClick={() => setBaixa(null)} className="px-3 py-2 text-xs font-medium border border-border rounded-lg hover:bg-gray-50">Voltar</button>
              <button onClick={registrarBaixa} disabled={processando} className="px-3 py-2 text-xs font-semibold bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50">
                {processando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Confirmar'}
              </button>
            </div>
          </div>
        )}

        {!isAdmin && (
          <p className="text-[11px] text-muted-foreground">Baixa e venda do bem são restritas a administradores.</p>
        )}
      </div>
    </GestaoModal>
  );
}