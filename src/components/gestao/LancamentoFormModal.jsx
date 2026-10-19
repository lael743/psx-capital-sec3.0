import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { logAction } from '@/lib/audit';
import GestaoModal from './GestaoModal';
import Field from './Field';
import AnexosUpload from './AnexosUpload';
import { MEIOS_PAGAMENTO, hojeISO, gerarParcelas } from '@/lib/gestaoInterna';
import { formatCurrency, formatDate } from '@/lib/finance';

/** Cadastro e edição de lançamentos (despesa ou patrimônio) com parcelamento automático. */
export default function LancamentoFormModal({ open, onClose, onSaved, lancamento, categorias = [], contas = [] }) {
  const editando = !!lancamento?.id;

  const [form, setForm] = useState({
    data_lancamento: lancamento?.data_lancamento || hojeISO(),
    tipo: lancamento?.tipo || 'despesa',
    categoria_id: lancamento?.categoria_id || '',
    subcategoria_id: lancamento?.subcategoria_id || '',
    descricao: lancamento?.descricao || '',
    valor_total: lancamento?.valor_total ?? '',
    forma_pagamento: lancamento?.forma_pagamento || 'pix',
    conta_id: lancamento?.conta_id || '',
    condicao: lancamento?.condicao || 'a_vista',
    num_parcelas: lancamento?.num_parcelas || 1,
    primeiro_vencimento: lancamento?.primeiro_vencimento || lancamento?.data_lancamento || hojeISO(),
    observacoes: lancamento?.observacoes || '',
  });
  const [anexos, setAnexos] = useState(lancamento?.anexos || []);
  const [registrarBem, setRegistrarBem] = useState(!lancamento?.patrimonio_id);
  const [bem, setBem] = useState({
    quantidade: 1,
    fornecedor: '',
    vida_util_meses: '',
    valor_residual: '',
    responsavel: '',
    localizacao: '',
    documento_nome: '',
    documento_url: '',
  });
  const [temPagamento, setTemPagamento] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    if (!open) return;
    if (!lancamento?.id) { setTemPagamento(false); return; }
    let alive = true;
    base44.entities.ObrigacaoInterna.filter({ lancamento_id: lancamento.id }, { limit: 300 })
      .then(res => {
        if (!alive) return;
        setTemPagamento((res?.items || []).some(o => (Number(o.valor_pago) || 0) > 0));
      });
    return () => { alive = false; };
  }, [open, lancamento?.id]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const categoriasDoTipo = useMemo(
    () => categorias.filter(c => c.tipo === form.tipo && c.ativo !== false),
    [categorias, form.tipo],
  );
  const categoriasRaiz = categoriasDoTipo.filter(c => !c.parent_id);
  const subcategorias = categoriasDoTipo.filter(c => c.parent_id === form.categoria_id);

  const valorTotal = Number(form.valor_total) || 0;
  const numParcelas = form.condicao === 'parcelado' ? Math.max(2, Number(form.num_parcelas) || 2) : 1;
  const primeiroVenc = form.primeiro_vencimento || form.data_lancamento;

  const parcelas = useMemo(
    () => (valorTotal > 0 ? gerarParcelas(valorTotal, numParcelas, primeiroVenc) : []),
    [valorTotal, numParcelas, primeiroVenc],
  );

  const bloquearValores = editando && temPagamento;

  const salvar = async () => {
    setErro('');
    if (!form.descricao.trim()) { setErro('Informe a descrição do lançamento.'); return; }
    if (!form.data_lancamento) { setErro('Informe a data do lançamento.'); return; }
    if (!(valorTotal > 0)) { setErro('O valor total deve ser maior que zero.'); return; }
    if (!form.categoria_id) { setErro('Selecione a categoria.'); return; }
    if (!form.primeiro_vencimento && !form.data_lancamento) { setErro('Informe o primeiro vencimento.'); return; }

    setSalvando(true);
    try {
      const categoria = categorias.find(c => c.id === form.categoria_id);
      const subcategoria = categorias.find(c => c.id === form.subcategoria_id);
      const conta = contas.find(c => c.id === form.conta_id);

      const payload = {
        data_lancamento: form.data_lancamento,
        tipo: form.tipo,
        categoria_id: form.categoria_id,
        categoria_nome: categoria?.nome || '',
        subcategoria_id: form.subcategoria_id || '',
        subcategoria_nome: subcategoria?.nome || '',
        descricao: form.descricao.trim(),
        valor_total: valorTotal,
        forma_pagamento: form.forma_pagamento,
        conta_id: form.conta_id || '',
        conta_nome: conta?.nome || '',
        condicao: form.condicao,
        num_parcelas: numParcelas,
        primeiro_vencimento: primeiroVenc,
        anexos,
        observacoes: form.observacoes,
      };

      let lancId = lancamento?.id;
      if (editando) {
        await base44.entities.LancamentoInterno.update(lancId, payload);
        await logAction({ action: 'update', entity: 'LancamentoInterno', entityId: lancId, description: `Lançamento "${payload.descricao}" atualizado` });
      } else {
        const criado = await base44.entities.LancamentoInterno.create({ ...payload, status: 'ativo' });
        lancId = criado.id;
        await logAction({ action: 'create', entity: 'LancamentoInterno', entityId: lancId, description: `Lançamento "${payload.descricao}" de ${formatCurrency(valorTotal)}` });
      }

      // Parcelas: geradas na criação; regeneradas na edição apenas se não houver pagamento
      const podeRegenerar = !bloquearValores;
      if (podeRegenerar) {
        if (editando) await base44.entities.ObrigacaoInterna.deleteMany({ lancamento_id: lancId });
        const hoje = hojeISO();
        const novas = gerarParcelas(valorTotal, numParcelas, primeiroVenc).map(p => ({
          lancamento_id: lancId,
          descricao: payload.descricao,
          categoria_id: payload.categoria_id,
          categoria_nome: payload.categoria_nome,
          valor: p.valor,
          numero_parcela: p.numero,
          total_parcelas: numParcelas,
          vencimento: p.vencimento,
          valor_pago: 0,
          saldo: p.valor,
          status: p.vencimento < hoje ? 'vencido' : 'a_vencer',
          observacoes: '',
        }));
        if (novas.length > 0) await base44.entities.ObrigacaoInterna.bulkCreate(novas);
      }

      // Patrimônio: cria o bem com os mesmos dados, sem segundo cadastro
      if (form.tipo === 'patrimonio' && registrarBem && !lancamento?.patrimonio_id) {
        const quantidade = Math.max(1, Number(bem.quantidade) || 1);
        const patrim = await base44.entities.PatrimonioInterno.create({
          nome: payload.descricao,
          categoria_id: payload.categoria_id,
          categoria_nome: payload.categoria_nome,
          data_aquisicao: payload.data_lancamento,
          quantidade,
          valor_unitario: Math.round((valorTotal / quantidade) * 100) / 100,
          valor_total: valorTotal,
          fornecedor: bem.fornecedor,
          vida_util_meses: Number(bem.vida_util_meses) || 0,
          valor_residual: Number(bem.valor_residual) || 0,
          responsavel: bem.responsavel,
          localizacao: bem.localizacao,
          status: 'ativo',
          observacoes: payload.observacoes,
          documento_url: bem.documento_url,
          documento_nome: bem.documento_nome,
          lancamento_id: lancId,
          historico: [{
            data: new Date().toISOString(),
            usuario: '',
            acao: 'criacao',
            descricao: `Bem cadastrado a partir do lançamento "${payload.descricao}"`,
          }],
        });
        await base44.entities.LancamentoInterno.update(lancId, { patrimonio_id: patrim.id });
        await logAction({ action: 'create', entity: 'PatrimonioInterno', entityId: patrim.id, description: `Bem "${patrim.nome}" cadastrado` });
      }

      onSaved();
      onClose();
    } catch (e) {
      setErro(e?.message || 'Erro ao salvar o lançamento.');
    }
    setSalvando(false);
  };

  return (
    <GestaoModal
      open={open}
      onClose={onClose}
      size="lg"
      title={editando ? 'Editar lançamento' : 'Novo lançamento'}
      subtitle="Despesa ou aquisição de patrimônio — as parcelas são geradas automaticamente."
      footer={(
        <>
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium border border-border rounded-lg hover:bg-gray-50">Cancelar</button>
          <button onClick={salvar} disabled={salvando} className="px-4 py-2 text-sm font-semibold bg-foreground text-primary-foreground rounded-lg hover:bg-foreground/90 disabled:opacity-50">
            {salvando ? 'Salvando...' : editando ? 'Salvar alterações' : 'Lançar'}
          </button>
        </>
      )}
    >
      <div className="space-y-4">
        {erro && <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{erro}</div>}
        {bloquearValores && (
          <div className="flex items-start gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>Este lançamento já possui pagamento registrado. Valor, condição e parcelas ficam bloqueados para preservar o histórico.</span>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field label="Data do lançamento" required>
            <input type="date" className="input-field" value={form.data_lancamento} onChange={e => { set('data_lancamento', e.target.value); if (!editando) set('primeiro_vencimento', e.target.value); }} />
          </Field>
          <Field label="Tipo" required>
            <select className="input-field" value={form.tipo} onChange={e => { set('tipo', e.target.value); set('categoria_id', ''); set('subcategoria_id', ''); }}>
              <option value="despesa">Despesa</option>
              <option value="patrimonio">Patrimônio</option>
            </select>
          </Field>
          <Field label="Valor total (R$)" required>
            <input type="number" step="0.01" className="input-field" value={form.valor_total} onChange={e => set('valor_total', e.target.value)} disabled={bloquearValores} placeholder="0,00" />
          </Field>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Categoria" required>
            <select className="input-field" value={form.categoria_id} onChange={e => { set('categoria_id', e.target.value); set('subcategoria_id', ''); }}>
              <option value="">— Selecione —</option>
              {categoriasRaiz.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </Field>
          <Field label="Subcategoria">
            <select className="input-field" value={form.subcategoria_id} onChange={e => set('subcategoria_id', e.target.value)} disabled={subcategorias.length === 0}>
              <option value="">{subcategorias.length ? '— Nenhuma —' : 'Sem subcategorias'}</option>
              {subcategorias.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </Field>
        </div>

        <Field label="Descrição" required>
          <input className="input-field" value={form.descricao} onChange={e => set('descricao', e.target.value)} placeholder="Ex: Honorários contábeis — setembro" />
        </Field>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Forma de pagamento">
            <select className="input-field" value={form.forma_pagamento} onChange={e => set('forma_pagamento', e.target.value)}>
              {MEIOS_PAGAMENTO.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </Field>
          <Field label="Conta utilizada ou prevista">
            <select className="input-field" value={form.conta_id} onChange={e => set('conta_id', e.target.value)}>
              <option value="">— Não informada —</option>
              {contas.filter(c => c.ativo !== false).map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </Field>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field label="Condição" required>
            <select className="input-field" value={form.condicao} onChange={e => { set('condicao', e.target.value); if (e.target.value === 'a_vista') set('num_parcelas', 1); else if (Number(form.num_parcelas) < 2) set('num_parcelas', 2); }} disabled={bloquearValores}>
              <option value="a_vista">À vista</option>
              <option value="parcelado">Parcelado</option>
            </select>
          </Field>
          <Field label="Nº de parcelas">
            <input type="number" min="2" className="input-field" value={form.num_parcelas} onChange={e => set('num_parcelas', e.target.value)} disabled={form.condicao !== 'parcelado' || bloquearValores} />
          </Field>
          <Field label="Primeiro vencimento" required>
            <input type="date" className="input-field" value={form.primeiro_vencimento} onChange={e => set('primeiro_vencimento', e.target.value)} disabled={bloquearValores} />
          </Field>
        </div>

        {form.condicao === 'parcelado' && parcelas.length > 0 && (
          <div className="border border-border rounded-lg overflow-hidden">
            <div className="px-3 py-2 bg-gray-50/80 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
              Parcelas geradas ({parcelas.length})
            </div>
            <div className="max-h-40 overflow-y-auto divide-y divide-border">
              {parcelas.map(p => (
                <div key={p.numero} className="flex items-center justify-between px-3 py-1.5 text-xs">
                  <span className="text-muted-foreground">{p.numero}ª · {formatDate(p.vencimento)}</span>
                  <span className="font-mono font-semibold">{formatCurrency(p.valor)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {form.tipo === 'patrimonio' && (
          <div className="border border-border rounded-xl p-4 space-y-3 bg-gray-50/50">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={registrarBem}
                onChange={e => setRegistrarBem(e.target.checked)}
                disabled={!!lancamento?.patrimonio_id}
                className="w-4 h-4 rounded border-border"
              />
              <span className="text-xs font-semibold">
                {lancamento?.patrimonio_id ? 'Bem já cadastrado no patrimônio' : 'Cadastrar o bem no patrimônio com estes dados'}
              </span>
            </label>

            {registrarBem && !lancamento?.patrimonio_id && (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <Field label="Quantidade">
                    <input type="number" min="1" className="input-field" value={bem.quantidade} onChange={e => setBem(b => ({ ...b, quantidade: e.target.value }))} />
                  </Field>
                  <Field label="Fornecedor / origem">
                    <input className="input-field" value={bem.fornecedor} onChange={e => setBem(b => ({ ...b, fornecedor: e.target.value }))} placeholder="Opcional" />
                  </Field>
                  <Field label="Vida útil (meses)">
                    <input type="number" min="0" className="input-field" value={bem.vida_util_meses} onChange={e => setBem(b => ({ ...b, vida_util_meses: e.target.value }))} placeholder="Opcional" />
                  </Field>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <Field label="Valor residual (R$)">
                    <input type="number" step="0.01" className="input-field" value={bem.valor_residual} onChange={e => setBem(b => ({ ...b, valor_residual: e.target.value }))} placeholder="Opcional" />
                  </Field>
                  <Field label="Responsável">
                    <input className="input-field" value={bem.responsavel} onChange={e => setBem(b => ({ ...b, responsavel: e.target.value }))} placeholder="Opcional" />
                  </Field>
                  <Field label="Localização">
                    <input className="input-field" value={bem.localizacao} onChange={e => setBem(b => ({ ...b, localizacao: e.target.value }))} placeholder="Opcional" />
                  </Field>
                </div>
              </>
            )}
          </div>
        )}

        <AnexosUpload anexos={anexos} onChange={setAnexos} />

        <Field label="Observações">
          <textarea className="input-field min-h-[70px]" value={form.observacoes} onChange={e => set('observacoes', e.target.value)} placeholder="Opcional" />
        </Field>
      </div>
    </GestaoModal>
  );
}