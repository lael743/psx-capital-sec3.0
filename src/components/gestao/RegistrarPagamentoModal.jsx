import { useEffect, useState } from 'react';
import { CheckCircle2, Clock, AlertTriangle } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import GestaoModal from './GestaoModal';
import Field from './Field';
import AnexosUpload from './AnexosUpload';
import { MEIOS_PAGAMENTO, hojeISO, saldoObrigacao } from '@/lib/gestaoInterna';
import { formatCurrency, formatDate } from '@/lib/finance';

function novaChave() {
  try { return crypto.randomUUID(); } catch { return `${Date.now()}-${Math.random().toString(36).slice(2)}`; }
}

/**
 * Registro de pagamento (integral ou parcial) de uma parcela.
 * A chave de idempotência impede duplicidade por repetição de requisição.
 */
export default function RegistrarPagamentoModal({ open, onClose, onSaved, obrigacao, contas = [] }) {
  const saldo = saldoObrigacao(obrigacao);
  const [form, setForm] = useState({
    valor: '',
    data_pagamento: hojeISO(),
    conta_id: '',
    forma_pagamento: 'pix',
    referencia: '',
    observacao: '',
  });
  const [comprovante, setComprovante] = useState([]);
  const [chave, setChave] = useState(novaChave());
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    if (!open) return;
    setForm({
      valor: saldo > 0 ? String(saldo) : '',
      data_pagamento: hojeISO(),
      conta_id: obrigacao?.conta_pagamento_id || '',
      forma_pagamento: obrigacao?.forma_pagamento || 'pix',
      referencia: '',
      observacao: '',
    });
    setComprovante([]);
    setChave(novaChave());
    setErro('');
  }, [open, obrigacao?.id]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const valorNum = Number(form.valor) || 0;
  const parcial = valorNum > 0 && valorNum < saldo - 0.005;
  const antecipado = obrigacao?.vencimento && form.data_pagamento < obrigacao.vencimento;

  const salvar = async () => {
    setErro('');
    if (!(valorNum > 0)) { setErro('Informe o valor pago.'); return; }
    if (valorNum > saldo + 0.005) { setErro(`O valor não pode exceder o saldo de ${formatCurrency(saldo)}.`); return; }
    if (!form.data_pagamento) { setErro('Informe a data do pagamento.'); return; }

    setSalvando(true);
    try {
      const res = await base44.functions.invoke('gestaoInternaPagamento', {
        action: 'registrar',
        obrigacao_id: obrigacao.id,
        valor: valorNum,
        data_pagamento: form.data_pagamento,
        conta_id: form.conta_id,
        forma_pagamento: form.forma_pagamento,
        referencia: form.referencia,
        comprovante_url: comprovante[0]?.url || '',
        observacao: form.observacao,
        idempotency_key: chave,
      });
      if (res.data?.error) { setErro(res.data.error); setSalvando(false); return; }
      onSaved();
      onClose();
    } catch (e) {
      setErro(e?.response?.data?.error || e?.message || 'Erro ao registrar o pagamento.');
    }
    setSalvando(false);
  };

  if (!obrigacao) return null;

  return (
    <GestaoModal
      open={open}
      onClose={onClose}
      title="Registrar pagamento"
      subtitle={obrigacao.descricao}
      footer={(
        <>
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium border border-border rounded-lg hover:bg-gray-50">Cancelar</button>
          <button onClick={salvar} disabled={salvando} className="px-4 py-2 text-sm font-semibold bg-foreground text-primary-foreground rounded-lg hover:bg-foreground/90 disabled:opacity-50">
            {salvando ? 'Registrando...' : parcial ? 'Registrar parcial' : 'Registrar pagamento'}
          </button>
        </>
      )}
    >
      <div className="space-y-4">
        {erro && <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{erro}</div>}

        <div className="bg-gray-50 border border-border rounded-xl p-3 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Parcela</p>
            <p className="font-semibold">{obrigacao.numero_parcela}/{obrigacao.total_parcelas}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Vencimento</p>
            <p className="font-semibold">{formatDate(obrigacao.vencimento)}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Valor devido</p>
            <p className="font-mono font-semibold">{formatCurrency(obrigacao.valor)}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Saldo</p>
            <p className="font-mono font-semibold text-amber-700">{formatCurrency(saldo)}</p>
          </div>
        </div>

        {antecipado && (
          <div className="flex items-center gap-2 text-xs text-blue-800 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
            <Clock className="w-4 h-4 shrink-0" /> Pagamento antecipado em relação ao vencimento.
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Valor pago (R$)" required>
            <input type="number" step="0.01" className="input-field" value={form.valor} onChange={e => set('valor', e.target.value)} />
          </Field>
          <Field label="Data do pagamento" required>
            <input type="date" className="input-field" value={form.data_pagamento} onChange={e => set('data_pagamento', e.target.value)} />
          </Field>
        </div>

        <div className="flex gap-2">
          <button type="button" onClick={() => set('valor', String(saldo))} className="text-[11px] font-semibold px-2.5 py-1 rounded-md border border-border hover:bg-gray-50">
            Saldo integral ({formatCurrency(saldo)})
          </button>
          {saldo > 0 && (
            <button type="button" onClick={() => set('valor', String(Math.round((saldo / 2) * 100) / 100))} className="text-[11px] font-semibold px-2.5 py-1 rounded-md border border-border hover:bg-gray-50">
              Metade do saldo
            </button>
          )}
        </div>

        {parcial && (
          <div className="flex items-center gap-2 text-xs text-blue-800 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
            <AlertTriangle className="w-4 h-4 shrink-0" /> Pagamento parcial — a parcela ficará com saldo de {formatCurrency(saldo - valorNum)}.
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Conta de origem">
            <select className="input-field" value={form.conta_id} onChange={e => set('conta_id', e.target.value)}>
              <option value="">— Não informada —</option>
              {contas.filter(c => c.ativo !== false).map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </Field>
          <Field label="Forma de pagamento">
            <select className="input-field" value={form.forma_pagamento} onChange={e => set('forma_pagamento', e.target.value)}>
              {MEIOS_PAGAMENTO.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </Field>
        </div>

        <Field label="Identificador ou referência">
          <input className="input-field" value={form.referencia} onChange={e => set('referencia', e.target.value)} placeholder="Ex: ID da transação, nº do recibo" />
        </Field>

        <AnexosUpload anexos={comprovante} onChange={setComprovante} single label="Comprovante" />

        <Field label="Observação">
          <input className="input-field" value={form.observacao} onChange={e => set('observacao', e.target.value)} placeholder="Opcional" />
        </Field>

        <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <CheckCircle2 className="w-3.5 h-3.5" /> O pagamento gera o lançamento no fluxo de caixa central e ajusta o saldo da conta bancária, quando aplicável.
        </p>
      </div>
    </GestaoModal>
  );
}