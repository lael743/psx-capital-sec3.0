import { useEffect, useMemo, useState } from 'react';
import { Banknote, Loader2, ShieldCheck, AlertTriangle } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { avaliarRepasse } from '@/lib/operationWorkflow';
import { registrarRepasseOperacao } from '@/lib/repasseOps';
import { formatCurrency } from '@/lib/finance';
import RepasseRegistrado from './RepasseRegistrado';

const hoje = () => new Date().toISOString().split('T')[0];

/**
 * M7 — registro do repasse ao cedente, na etapa "pagamento".
 *
 * Os pré-requisitos vêm de `avaliarRepasse` (a MESMA regra que o servidor
 * aplica). A tela só mostra o formulário: quem autoriza, valida a data, debita
 * a conta e grava a prova é `executeOperationDisbursement`.
 */
export default function RepassePanel({ operacao, onUpdate }) {
  const { user } = useAuth();
  const [bancos, setBancos] = useState([]);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [form, setForm] = useState({
    bancoId: operacao.disbursement_bank_id || '',
    data: hoje(),
    referencia: '',
    comprovante: '',
    forma: operacao.disbursement_method || 'pix',
    token: '',
  });

  useEffect(() => {
    base44.entities.Banco.list()
      .then((lista) => setBancos((Array.isArray(lista) ? lista : lista?.items || []).filter((b) => b.active !== false)))
      .catch(() => setBancos([]));
  }, []);

  const decisao = useMemo(() => avaliarRepasse({ operacao, usuario: user }), [operacao, user]);

  if (operacao.payment_executed === true) return <RepasseRegistrado operacao={operacao} />;

  if (!decisao.permitida) {
    const itens = decisao.bloqueios?.length ? decisao.bloqueios : [decisao.motivo];
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-start gap-3">
        <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="text-sm font-semibold text-amber-900">Repasse ainda não liberado</p>
          {itens.map((item, i) => (
            <p key={i} className="text-xs text-amber-800">{item}</p>
          ))}
        </div>
      </div>
    );
  }

  const banco = bancos.find((b) => b.id === form.bancoId);
  const temReferencia = form.referencia.trim().length >= 3 || /^https?:\/\//i.test(form.comprovante.trim());
  const podeEnviar = Boolean(banco) && form.token.trim().length > 0 && temReferencia && !salvando;
  const valor = decisao.valor || 0;

  const alterar = (campo, valorCampo) => {
    setForm((f) => ({ ...f, [campo]: valorCampo }));
    setErro('');
  };

  const enviar = async () => {
    if (!podeEnviar) return;
    setSalvando(true);
    setErro('');
    try {
      await registrarRepasseOperacao({
        operacaoId: operacao.id,
        bancoId: banco.id,
        bancoNome: banco.name,
        data: form.data,
        referencia: form.referencia.trim(),
        comprovanteUrl: form.comprovante.trim(),
        forma: form.forma,
        assessorToken: form.token.trim(),
      });
      setSalvando(false);
      onUpdate?.();
    } catch (e) {
      setSalvando(false);
      setErro(e.message || 'Não foi possível registrar o repasse.');
    }
  };

  return (
    <div className="bg-white border border-border rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center">
          <Banknote className="w-4 h-4 text-emerald-600" />
        </div>
        <div>
          <h3 className="text-sm font-bold">Registrar repasse ao cedente</h3>
          <p className="text-xs text-muted-foreground">
            Debita a conta de origem, lança no fluxo de caixa e libera a finalização da operação.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Valor (R$)</label>
          <div className="input-field bg-gray-100 font-bold tabular-nums">{formatCurrency(valor)}</div>
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Conta de origem *</label>
          <select className="input-field" value={form.bancoId} onChange={(e) => alterar('bancoId', e.target.value)}>
            <option value="">Selecione...</option>
            {bancos.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          {banco && (
            <p className="text-[10px] text-muted-foreground mt-1">
              Ag: {banco.agency || '—'} · Conta: {banco.account || '—'} · Saldo: {formatCurrency(banco.current_balance || 0)}
            </p>
          )}
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Data do repasse *</label>
          <input className="input-field" type="date" max={hoje()} value={form.data} onChange={(e) => alterar('data', e.target.value)} />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Forma</label>
          <select className="input-field" value={form.forma} onChange={(e) => alterar('forma', e.target.value)}>
            <option value="pix">PIX</option>
            <option value="ted">TED/Transferência</option>
            <option value="cheque">Cheque</option>
            <option value="dinheiro">Dinheiro</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Referência da transferência *</label>
          <input
            className="input-field"
            value={form.referencia}
            onChange={(e) => alterar('referencia', e.target.value)}
            placeholder="ID PIX/TED ou nº do comprovante"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Comprovante (link)</label>
          <input
            className="input-field"
            value={form.comprovante}
            onChange={(e) => alterar('comprovante', e.target.value)}
            placeholder="https://..."
          />
        </div>
        <div className="md:col-span-3">
          <label className="block text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
            <ShieldCheck className="w-3 h-3" /> Token de segurança do assessor *
          </label>
          <input
            className="input-field"
            type="password"
            value={form.token}
            onChange={(e) => alterar('token', e.target.value)}
            placeholder="Token cadastrado em Assessores"
          />
        </div>
      </div>

      {erro && <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{erro}</p>}

      <div className="flex justify-end pt-2 border-t border-border">
        <button
          onClick={enviar}
          disabled={!podeEnviar}
          className="inline-flex items-center gap-2 px-4 py-2 bg-foreground text-primary-foreground text-sm font-semibold rounded-lg disabled:opacity-50 hover:bg-foreground/90 transition-colors"
        >
          {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Banknote className="w-4 h-4" />}
          {salvando ? 'Registrando...' : 'Registrar repasse'}
        </button>
      </div>
    </div>
  );
}