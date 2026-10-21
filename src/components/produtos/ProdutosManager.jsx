import { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Plus, Pencil, Trash2, X, Package, Loader2 } from 'lucide-react';
import {
  FORMATOS, FORMATO_POR_CHAVE, DESAGIO_FACE, FACE_POR_REPASSE, PRICE,
  normalizarCalcMode, labelCalcMode, isFormatoNovo,
} from '@/lib/formatosCalculo';

const TIPO_LABEL = {
  cheque: 'Cheque',
  duplicata: 'Duplicata',
  boleto: 'Boleto',
  emprestimo: 'Empréstimo (histórico)',
  assinatura: 'Assinatura',
};

const TIPOS_ANTECIPACAO = ['cheque', 'duplicata', 'boleto'];

const emptyForm = {
  nome: '',
  tipo: 'cheque',
  calc_mode: DESAGIO_FACE,
  calculo_inverso: false,
  descricao: '',
  default_rate: 0,
  default_interest_type: 'simples',
  default_tarifa_operacao: 0,
  default_tarifa_por_titulo: 0,
  default_float_dias: 0,
  ativo: true,
  ordem: 0,
};

const inputCls = 'w-full px-3 py-2 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-colors';

/**
 * Cadastro de produtos de operação. Vive em componente próprio porque é usado
 * em dois lugares: a rota histórica /produtos e a aba Configurações › Produtos.
 */
export default function ProdutosManager() {
  const [produtos, setProdutos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await base44.entities.ProdutoOperacao.list('ordem', 100);
      setProdutos(list);
    } catch (e) {
      console.error('Erro ao carregar produtos:', e);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const openNew = () => { setForm(emptyForm); setEditId(null); setShowModal(true); };

  const openEdit = (p) => {
    setForm({
      nome: p.nome || '',
      tipo: p.tipo || 'cheque',
      // O produto pode estar gravado com o nome antigo: a tela mostra o formato
      // equivalente e, ao salvar, grava a chave canônica.
      calc_mode: normalizarCalcMode(p.calc_mode),
      calculo_inverso: p.calculo_inverso === true,
      descricao: p.descricao || '',
      default_rate: p.default_rate || 0,
      default_interest_type: p.default_interest_type || 'simples',
      default_tarifa_operacao: p.default_tarifa_operacao || 0,
      default_tarifa_por_titulo: p.default_tarifa_por_titulo || 0,
      default_float_dias: p.default_float_dias || 0,
      ativo: p.ativo !== false,
      ordem: p.ordem || 0,
    });
    setEditId(p.id);
    setShowModal(true);
  };

  const save = async () => {
    if (!form.nome.trim()) return;
    setSaving(true);
    try {
      const payload = {
        ...form,
        calc_mode: normalizarCalcMode(form.calc_mode),
        default_rate: parseFloat(form.default_rate) || 0,
        default_tarifa_operacao: parseFloat(form.default_tarifa_operacao) || 0,
        default_tarifa_por_titulo: parseFloat(form.default_tarifa_por_titulo) || 0,
        default_float_dias: parseFloat(form.default_float_dias) || 0,
      };
      if (editId) {
        await base44.entities.ProdutoOperacao.update(editId, payload);
      } else {
        await base44.entities.ProdutoOperacao.create(payload);
      }
      setShowModal(false);
      await load();
    } catch (e) {
      console.error('Erro ao salvar produto:', e);
      alert('Erro ao salvar: ' + e.message);
    }
    setSaving(false);
  };

  const remove = async (p) => {
    if (!confirm(`Excluir o produto "${p.nome}"?`)) return;
    try {
      await base44.entities.ProdutoOperacao.delete(p.id);
      await load();
    } catch (e) {
      alert('Erro ao excluir: ' + e.message);
    }
  };

  const formatoAtual = FORMATO_POR_CHAVE[normalizarCalcMode(form.calc_mode)];
  const tiposDisponiveis = TIPOS_ANTECIPACAO.includes(form.tipo)
    ? TIPOS_ANTECIPACAO
    : [...TIPOS_ANTECIPACAO, form.tipo];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-xs text-muted-foreground">
          O tipo identifica a natureza do título; o formato define a fórmula financeira.
        </p>
        <button
          onClick={openNew}
          className="inline-flex items-center gap-2 px-4 py-2 bg-foreground text-primary-foreground text-sm font-semibold rounded-lg hover:bg-foreground/90"
        >
          <Plus className="w-4 h-4" /> Novo Produto
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : produtos.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground border border-dashed border-border rounded-xl">
          <Package className="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <p className="text-sm">Nenhum produto cadastrado.</p>
          <p className="text-xs mt-1">Clique em "Novo Produto" para começar.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {produtos.map((p) => (
            <div
              key={p.id}
              className={`bg-white border rounded-xl p-4 flex flex-col gap-3 ${p.ativo === false ? 'opacity-60 border-dashed' : 'border-border'}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-bold truncate">{p.nome}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{p.descricao || '—'}</div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button onClick={() => openEdit(p)} className="p-1.5 rounded-lg hover:bg-gray-100 text-muted-foreground" aria-label="Editar">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => remove(p)} className="p-1.5 rounded-lg hover:bg-red-50 text-red-400" aria-label="Excluir">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <span className="text-xs px-2 py-0.5 rounded-md bg-gray-100 font-medium">{TIPO_LABEL[p.tipo] || p.tipo}</span>
                <span className="text-xs px-2 py-0.5 rounded-md bg-[hsl(43,65%,47%)]/10 text-[hsl(43,65%,37%)] font-medium">
                  {labelCalcMode(p.calc_mode)}
                </span>
                {!isFormatoNovo(p.calc_mode) && (
                  <span className="text-xs px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 font-medium">Formato legado</span>
                )}
                {p.calculo_inverso === true && normalizarCalcMode(p.calc_mode) !== DESAGIO_FACE && (
                  <span className="text-xs px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-600 font-medium">Invertido</span>
                )}
                {p.ativo === false && (
                  <span className="text-xs px-2 py-0.5 rounded-md bg-red-50 text-red-500 font-medium">Inativo</span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground border-t border-border pt-3">
                <div>Taxa: <strong className="text-foreground">{p.default_rate || 0}% a.m.</strong></div>
                <div>Juros: <strong className="text-foreground capitalize">{p.default_interest_type}</strong></div>
                <div>Tarifa op.: <strong className="text-foreground">R$ {(p.default_tarifa_operacao || 0).toFixed(2)}</strong></div>
                <div>Tarifa/título: <strong className="text-foreground">R$ {(p.default_tarifa_por_titulo || 0).toFixed(2)}</strong></div>
                <div>Float: <strong className="text-foreground">{p.default_float_dias || 0} dias</strong></div>
                <div>Ordem: <strong className="text-foreground">{p.ordem || 0}</strong></div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowModal(false)} />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border sticky top-0 bg-white">
              <h2 className="text-sm font-bold">{editId ? 'Editar Produto' : 'Novo Produto'}</h2>
              <button onClick={() => setShowModal(false)} className="p-1.5 rounded-lg hover:bg-gray-100">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Nome *</label>
                <input className={inputCls} value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} placeholder="Ex: Cheque 30 dias, Duplicata, Boleto parcelado" />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Descrição</label>
                <input className={inputCls} value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} placeholder="Texto exibido no seletor" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">Tipo *</label>
                  <select className={inputCls} value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}>
                    {tiposDisponiveis.map((t) => (
                      <option key={t} value={t}>{TIPO_LABEL[t] || t}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">Formato de Cálculo *</label>
                  <select className={inputCls} value={normalizarCalcMode(form.calc_mode)} onChange={(e) => setForm({ ...form, calc_mode: e.target.value })}>
                    {FORMATOS.map((f) => (
                      <option key={f.key} value={f.key}>{f.titulo}</option>
                    ))}
                    {!formatoAtual && (
                      <option value={normalizarCalcMode(form.calc_mode)}>{labelCalcMode(form.calc_mode)}</option>
                    )}
                  </select>
                </div>
              </div>
              <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-xs text-blue-800 space-y-1">
                <p className="font-semibold">{formatoAtual?.titulo || labelCalcMode(form.calc_mode)}</p>
                <p>{formatoAtual?.descricao || 'Formato histórico mantido apenas para reproduzir operações já formalizadas.'}</p>
              </div>
              {formatoAtual && formatoAtual.key !== DESAGIO_FACE && (
                <label className="flex items-start gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={form.calculo_inverso === true}
                    onChange={(e) => setForm({ ...form, calculo_inverso: e.target.checked })}
                    className="w-4 h-4 mt-0.5 rounded border-border text-[hsl(43,65%,47%)] focus:ring-[hsl(43,65%,47%)] shrink-0"
                  />
                  <span className="text-xs">
                    <span className="font-semibold text-foreground">Inverter a entrada por padrão</span>
                    <span className="text-muted-foreground">
                      {' '}— {formatoAtual.key === PRICE
                        ? 'informar o valor da parcela e calcular o repasse.'
                        : 'informar o repasse e calcular o valor de face.'}
                    </span>
                  </span>
                </label>
              )}
              <div className="border-t border-border pt-4">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Condições Padrão</h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1.5">Taxa a.m. (%)</label>
                    <input type="number" step="0.01" className={inputCls} value={form.default_rate} onChange={(e) => setForm({ ...form, default_rate: e.target.value })} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1.5">Tipo de Juros</label>
                    <select className={inputCls} value={form.default_interest_type} onChange={(e) => setForm({ ...form, default_interest_type: e.target.value })}>
                      <option value="simples">Simples</option>
                      <option value="composto">Composto</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1.5">Float (dias)</label>
                    <input type="number" className={inputCls} value={form.default_float_dias} onChange={(e) => setForm({ ...form, default_float_dias: e.target.value })} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1.5">Tarifa Operação (R$)</label>
                    <input type="number" step="0.01" className={inputCls} value={form.default_tarifa_operacao} onChange={(e) => setForm({ ...form, default_tarifa_operacao: e.target.value })} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1.5">Tarifa/Título (R$)</label>
                    <input type="number" step="0.01" className={inputCls} value={form.default_tarifa_por_titulo} onChange={(e) => setForm({ ...form, default_tarifa_por_titulo: e.target.value })} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1.5">Ordem</label>
                    <input type="number" className={inputCls} value={form.ordem} onChange={(e) => setForm({ ...form, ordem: e.target.value })} />
                  </div>
                </div>
                <label className="flex items-center gap-2.5 mt-4 cursor-pointer">
                  <input type="checkbox" checked={form.ativo} onChange={(e) => setForm({ ...form, ativo: e.target.checked })} className="w-4 h-4 rounded border-border text-[hsl(43,65%,47%)] focus:ring-[hsl(43,65%,47%)]" />
                  <span className="text-sm">Produto ativo para novas operações</span>
                </label>
              </div>
            </div>
            <div className="flex justify-end gap-2 px-5 py-3 border-t border-border bg-gray-50 sticky bottom-0">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm font-medium border border-border rounded-lg hover:bg-gray-100">Cancelar</button>
              <button onClick={save} disabled={saving || !form.nome.trim()} className="px-4 py-2 text-sm font-semibold bg-foreground text-primary-foreground rounded-lg hover:bg-foreground/90 disabled:opacity-50">
                {saving ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}