import { useEffect, useMemo, useState } from 'react';
import { Banknote, Loader2, ShieldCheck, AlertTriangle, Plus } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { avaliarRepasse } from '@/lib/operationWorkflow';
import { registrarRepasseOperacao } from '@/lib/repasseOps';
import { formatCurrency } from '@/lib/finance';
import RepasseRegistrado from './RepasseRegistrado';
import RepasseLinhaForm from './RepasseLinhaForm';

const hoje = () => new Date().toISOString().split('T')[0];
const chave = () => Math.random().toString(36).slice(2, 10);
const centavos = (v) => Math.round((Number(v) || 0) * 100) / 100;

const novaLinha = (valor, bancoId = '', forma = 'pix') => ({
  id: chave(),
  bancoId,
  forma,
  valor: valor === '' ? '' : String(valor),
  referencia: '',
  comprovante: '',
});

/**
 * M7 — registro do repasse ao cedente, na etapa "pagamento".
 *
 * Uma operação pode ser repassada por mais de uma conta e mais de uma forma:
 * as linhas dividem o valor líquido e o servidor exige que a soma feche.
 */
export default function RepassePanel({ operacao, onUpdate }) {
  const { user } = useAuth();
  const [bancos, setBancos] = useState([]);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [data, setData] = useState(hoje());
  const [token, setToken] = useState('');
  const [linhas, setLinhas] = useState(() => [novaLinha(
    centavos(operacao.net_value ?? operacao.gross_value ?? ''),
    operacao.disbursement_bank_id || '',
    operacao.disbursement_method || 'pix',
  )]);

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

  const valorTotal = centavos(decisao.valor);
  const distribuido = centavos(linhas.reduce((total, linha) => total + (Number(linha.valor) || 0), 0));
  const restante = centavos(valorTotal - distribuido);
  const linhasValidas = linhas.every((linha) => (
    linha.bancoId
    && Number(linha.valor) > 0
    && (linha.referencia.trim().length >= 3 || /^https?:\/\//i.test(linha.comprovante.trim()))
  ));
  const podeEnviar = linhasValidas && Math.abs(restante) < 0.01 && token.trim().length > 0 && !salvando;

  const alterarLinha = (id, campo, valor) => {
    setLinhas((lista) => lista.map((linha) => (linha.id === id ? { ...linha, [campo]: valor } : linha)));
    setErro('');
  };

  const removerLinha = (id) => {
    setLinhas((lista) => lista.filter((linha) => linha.id !== id));
    setErro('');
  };

  const adicionarLinha = () => {
    setLinhas((lista) => [...lista, novaLinha(restante > 0 ? restante : '')]);
    setErro('');
  };

  const enviar = async () => {
    if (!podeEnviar) return;
    setSalvando(true);
    setErro('');
    try {
      await registrarRepasseOperacao({
        operacaoId: operacao.id,
        data,
        linhas,
        assessorToken: token.trim(),
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
            Pode sair por várias contas e várias formas. Debita as contas, lança no fluxo de caixa e libera a finalização.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Valor a repassar</label>
          <div className="input-field bg-gray-100 font-bold tabular-nums">{formatCurrency(valorTotal)}</div>
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Distribuído</label>
          <div className="input-field bg-gray-100 font-bold tabular-nums">{formatCurrency(distribuido)}</div>
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Restante</label>
          <div className={`input-field bg-gray-100 font-bold tabular-nums ${Math.abs(restante) < 0.01 ? 'text-emerald-700' : 'text-amber-700'}`}>
            {formatCurrency(restante)}
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Data do repasse *</label>
          <input className="input-field" type="date" max={hoje()} value={data} onChange={(e) => setData(e.target.value)} />
        </div>
      </div>

      <div className="space-y-2">
        {linhas.map((linha, indice) => (
          <RepasseLinhaForm
            key={linha.id}
            linha={linha}
            indice={indice}
            bancos={bancos}
            onChange={alterarLinha}
            onRemove={removerLinha}
            podeRemover={linhas.length > 1}
          />
        ))}
      </div>

      <button
        type="button"
        onClick={adicionarLinha}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
      >
        <Plus className="w-3.5 h-3.5" /> Adicionar outra conta ou forma
      </button>

      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
          <ShieldCheck className="w-3 h-3" /> Token de segurança do assessor *
        </label>
        <input
          className="input-field"
          type="password"
          value={token}
          onChange={(e) => { setToken(e.target.value); setErro(''); }}
          placeholder="Token cadastrado em Assessores"
        />
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