import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import ClienteSearchInput from '@/components/operacao/ClienteSearchInput';
import CurrencyInput from '@/components/ui/CurrencyInput';
import { formatCurrency } from '@/lib/finance';
import { Package, Loader2 } from 'lucide-react';
import { maskCpfCnpj } from '@/lib/masks';

const CALCMODE_LABEL = {
  padrao: 'Padrão',
  inverso: 'Juros Embutido',
  desconto_direto: 'Desconto Direto',
  capital_desagio: 'Capital + Deságio',
};

export default function StepCedenteProduto({ form, setForm, selectedClient, setSelectedClient, clients, clientUsedLimit, setClientUsedLimit, settings }) {
  const [touched, setTouched] = useState({});
  const [produtos, setProdutos] = useState([]);
  const [loadingProdutos, setLoadingProdutos] = useState(true);
  const [sacados, setSacados] = useState([]);

  useEffect(() => {
    base44.entities.ProdutoOperacao.filter({ ativo: true }, 'ordem', 50)
      .then(setProdutos)
      .catch(() => setProdutos([]))
      .finally(() => setLoadingProdutos(false));
    base44.entities.Sacado.list('-nome', 300).then(setSacados).catch(() => setSacados([]));
  }, []);

  const set = (field, value) => {
    setForm((f) => ({ ...f, [field]: value }));
    setTouched((t) => ({ ...t, [field]: true }));
  };

  const handleClientSelect = (c) => {
    setSelectedClient(c || null);
    setForm((f) => ({ ...f, client_id: c?.id || '', rate: c?.default_rate || f.rate }));
    if (c?.id) {
      base44.entities.Operation.filter({ client_id: c.id }, '-created_date', 100).then((ops) => {
        const used = ops.filter((op) => op.status !== 'quitado').reduce((s, op) => s + (op.balance_due || 0), 0);
        setClientUsedLimit(used);
      });
    } else {
      setClientUsedLimit(0);
    }
  };

  // Ao selecionar um produto, aplica as condições parametrizadas
  const handleProdutoSelect = (p) => {
    setForm((f) => ({
      ...f,
      produto_id: p.id,
      produto: p.nome,
      tipo: p.tipo,
      calc_mode: p.calc_mode,
      calculo_inverso: p.calc_mode === 'padrao' ? false : (p.calculo_inverso !== false),
      rate: f.rate || p.default_rate || '',
      interest_type: p.default_interest_type || f.interest_type,
      tarifa_operacao: p.default_tarifa_operacao ?? f.tarifa_operacao,
      tarifa_por_titulo: p.default_tarifa_por_titulo ?? f.tarifa_por_titulo,
      float_dias: p.default_float_dias ?? f.float_dias,
    }));
    setTouched((t) => ({ ...t, produto: true }));
  };

  const clientLimit = selectedClient?.credit_limit || 0;
  const clientRemainingLimit = clientLimit > 0 ? clientLimit - clientUsedLimit : null;

  const errors = {
    rate: touched.rate && (!form.rate || parseFloat(form.rate) <= 0) ? 'Informe uma taxa válida' : null
  };

  const selectedProduto = produtos.find((p) => p.id === form.produto_id);

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-sm font-bold mb-1">Cedente & Produto</h3>
        <p className="text-xs text-muted-foreground mb-4">Selecione o cedente e o produto. As condições parametrizadas no produto serão aplicadas automaticamente.</p>
      </div>

      {/* Cedente */}
      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1.5">
          Cedente {((form.tipo === 'emprestimo' && form.calc_mode !== 'capital_desagio' && form.produto !== 'capital_desagio') ? '' : '*')}
        </label>
        <ClienteSearchInput
          clients={clients}
          selectedClient={selectedClient}
          onSelect={handleClientSelect} />

        {(form.tipo === 'emprestimo' && form.calc_mode !== 'capital_desagio' && form.produto !== 'capital_desagio') && !selectedClient && (
          <p className="text-xs text-blue-600 mt-1.5">Empréstimo sem cedente — negociação direta com o sacado.</p>
        )}

        {selectedClient &&
        <div className="mt-2 space-y-1.5">
            <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
              <span>Taxa padrão: <strong className="text-[hsl(43,65%,47%)]">{selectedClient.default_rate || '—'}% a.m.</strong></span>
              {clientRemainingLimit !== null ?
            <span>
                   Limite restante:{' '}
                   <strong className={clientRemainingLimit <= 0 ? 'text-red-600' : clientRemainingLimit < clientLimit * 0.2 ? 'text-amber-600' : 'text-emerald-600'}>
                     {formatCurrency(Math.max(0, clientRemainingLimit))}
                   </strong>
                   <span className="text-muted-foreground"> / {formatCurrency(clientLimit)}</span>
                 </span> :

            <span>Sem limite definido</span>
            }
              <span>Risco: <strong className="capitalize">{selectedClient.risk_profile}</strong></span>
            </div>
          </div>
        }
      </div>

      {/* Sacado (apenas para boleto/empréstimo) */}
      {(form.tipo === 'boleto' || form.tipo === 'emprestimo') && form.calc_mode !== 'capital_desagio' && form.produto !== 'capital_desagio' && (
        <div className="border border-blue-200 bg-blue-50/50 rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold text-blue-900 uppercase tracking-wider">Sacado da Operação</span>
            <span className="text-xs text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full">Um sacado para todos os títulos</span>
          </div>
          <p className="text-xs text-blue-700">Todos os títulos cedidos nesta operação são de responsabilidade do sacado. O cedente fica vinculado como <strong>garantidor</strong>.</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Selecionar Existente</label>
              <select
                className="input-field"
                value={form.sacado_id || ''}
                onChange={(e) => {
                  const s = sacados.find(x => x.id === e.target.value);
                  if (s) {
                    setForm(f => ({ ...f, sacado_id: s.id, sacado_name: s.nome, sacado_doc: s.document }));
                  } else {
                    setForm(f => ({ ...f, sacado_id: '', sacado_name: '', sacado_doc: '' }));
                  }
                }}
              >
                <option value="">Novo / Digitar...</option>
                {sacados.map(s => <option key={s.id} value={s.id}>{s.nome} — {s.document}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Nome do Sacado *</label>
              <input className="input-field uppercase" value={form.sacado_name || ''} onChange={(e) => setForm(f => ({ ...f, sacado_name: e.target.value.toUpperCase(), sacado_id: '' }))} placeholder="NOME DO SACADO" />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">CPF/CNPJ do Sacado *</label>
              <input className="input-field font-mono" value={form.sacado_doc || ''} onChange={(e) => setForm(f => ({ ...f, sacado_doc: maskCpfCnpj(e.target.value), sacado_id: '' }))} placeholder="000.000.000-00" />
            </div>
          </div>
        </div>
      )}

      {/* Produto */}
      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1.5">Produto *</label>
        {loadingProdutos ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground py-3">
            <Loader2 className="w-4 h-4 animate-spin" /> Carregando produtos...
          </div>
        ) : produtos.length === 0 ? (
          <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 flex items-center gap-2">
            <Package className="w-4 h-4 shrink-0" />
            Nenhum produto ativo cadastrado.{' '}
            <a href="/produtos" className="font-semibold underline">Cadastrar produtos</a>
          </div>
        ) : (
          <div className="space-y-2">
            <select
              className="input-field"
              value={form.produto_id || ''}
              onChange={(e) => {
                const p = produtos.find((x) => x.id === e.target.value);
                if (p) handleProdutoSelect(p);
              }}
            >
              <option value="">Selecione um produto...</option>
              {produtos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome} — {CALCMODE_LABEL[p.calc_mode] || p.calc_mode} — Taxa {p.default_rate || 0}% — Float {p.default_float_dias || 0}d
                </option>
              ))}
            </select>
            {selectedProduto && (
              <div className="border border-border rounded-xl p-3.5 bg-gray-50/50">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold">{selectedProduto.nome}</div>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 font-medium text-muted-foreground">
                    {CALCMODE_LABEL[selectedProduto.calc_mode] || selectedProduto.calc_mode}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">{selectedProduto.descricao || '—'}</div>
                <div className="text-xs text-muted-foreground mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5">
                  <span>Taxa: <strong className="text-foreground">{selectedProduto.default_rate || 0}%</strong></span>
                  <span>Float: <strong className="text-foreground">{selectedProduto.default_float_dias || 0}d</strong></span>
                  <span>Tarifa Op: <strong className="text-foreground">{formatCurrency(selectedProduto.default_tarifa_operacao || 0)}</strong></span>
                  <span>Tarifa/Título: <strong className="text-foreground">{formatCurrency(selectedProduto.default_tarifa_por_titulo || 0)}</strong></span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Condições financeiras */}
      <div className="border-t border-border pt-4">
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Condições {selectedProduto ? `(aplicadas de "${selectedProduto.nome}")` : ''}</h4>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Taxa Deságio a.m. (%) *</label>
            <input
              className={`input-field ${errors.rate ? 'border-red-400' : ''}`}
              type="number"
              step="0.01"
              value={form.rate}
              onChange={(e) => set('rate', e.target.value)}
              onBlur={() => setTouched((t) => ({ ...t, rate: true }))}
              placeholder="3,00" />
            
            {errors.rate && <p className="text-xs text-red-500 mt-1">{errors.rate}</p>}
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Tarifa Operação (R$)</label>
            <CurrencyInput
              value={form.tarifa_operacao}
              onChange={(v) => set('tarifa_operacao', v)}
              placeholder="0,00" />
            
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Tarifa por Título (R$)</label>
            <CurrencyInput
              value={form.tarifa_por_titulo}
              onChange={(v) => set('tarifa_por_titulo', v)}
              placeholder="0,00" />
            
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Float (dias)</label>
            <input
              className="input-field"
              type="number"
              min="0"
              value={form.float_dias}
              onChange={(e) => set('float_dias', e.target.value)}
              placeholder="0" />
            
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Data de Início *</label>
            <input
              className="input-field"
              type="date"
              value={form.start_date}
              onChange={(e) => set('start_date', e.target.value)} />
            
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Tipo de Juros</label>
            <select className="input-field" value={form.interest_type} onChange={(e) => set('interest_type', e.target.value)}>
              <option value="simples">Simples</option>
              <option value="composto">Composto</option>
            </select>
          </div>
        </div>
      </div>

      {/* Arredondar taxa diária */}
      <label className="flex items-start gap-2.5 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={form.arredondar_taxa_diaria || false}
          onChange={(e) => set('arredondar_taxa_diaria', e.target.checked)}
          className="w-4 h-4 mt-0.5 rounded border-border text-[hsl(43,65%,47%)] focus:ring-[hsl(43,65%,47%)] shrink-0" />
        
        <span className="text-xs">
          <span className="font-semibold text-foreground">Arredondar taxa </span>
          
        </span>
      </label>
    </div>);
}