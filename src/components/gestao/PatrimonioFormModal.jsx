import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { logAction } from '@/lib/audit';
import GestaoModal from './GestaoModal';
import Field from './Field';
import AnexosUpload from './AnexosUpload';
import { STATUS_PATRIMONIO_LABELS, hojeISO } from '@/lib/gestaoInterna';

/** Cadastro e edição de bens do patrimônio. */
export default function PatrimonioFormModal({ open, onClose, onSaved, bem, categorias = [] }) {
  const editando = !!bem?.id;
  const [form, setForm] = useState({
    nome: bem?.nome || '',
    categoria_id: bem?.categoria_id || '',
    data_aquisicao: bem?.data_aquisicao || hojeISO(),
    quantidade: bem?.quantidade ?? 1,
    valor_unitario: bem?.valor_unitario ?? '',
    valor_total: bem?.valor_total ?? '',
    fornecedor: bem?.fornecedor || '',
    vida_util_meses: bem?.vida_util_meses ?? '',
    valor_residual: bem?.valor_residual ?? '',
    responsavel: bem?.responsavel || '',
    localizacao: bem?.localizacao || '',
    status: bem?.status || 'ativo',
    observacoes: bem?.observacoes || '',
  });
  const [documento, setDocumento] = useState(
    bem?.documento_url ? [{ nome: bem.documento_nome || 'documento', url: bem.documento_url }] : [],
  );
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    if (!open) return;
    setErro('');
  }, [open]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const recalcularTotal = (quantidade, unitario) => {
    const q = Number(quantidade) || 0;
    const u = Number(unitario) || 0;
    return String(Math.round(q * u * 100) / 100);
  };

  const categoriasPatrimonio = categorias.filter(c => c.tipo === 'patrimonio');

  const salvar = async () => {
    setErro('');
    if (!form.nome.trim()) { setErro('Informe o nome do bem.'); return; }
    if (!(Number(form.valor_total) > 0)) { setErro('O valor de aquisição deve ser maior que zero.'); return; }

    setSalvando(true);
    try {
      const categoria = categorias.find(c => c.id === form.categoria_id);
      const quantidade = Math.max(1, Number(form.quantidade) || 1);
      const valorTotal = Number(form.valor_total) || 0;

      const payload = {
        nome: form.nome.trim(),
        categoria_id: form.categoria_id || '',
        categoria_nome: categoria?.nome || '',
        data_aquisicao: form.data_aquisicao,
        quantidade,
        valor_unitario: Math.round((valorTotal / quantidade) * 100) / 100,
        valor_total: valorTotal,
        fornecedor: form.fornecedor,
        vida_util_meses: Number(form.vida_util_meses) || 0,
        valor_residual: Number(form.valor_residual) || 0,
        responsavel: form.responsavel,
        localizacao: form.localizacao,
        status: form.status,
        observacoes: form.observacoes,
        documento_url: documento[0]?.url || '',
        documento_nome: documento[0]?.nome || '',
      };

      if (editando) {
        const historico = [
          ...(bem.historico || []),
          { data: new Date().toISOString(), usuario: '', acao: 'edicao', descricao: 'Dados do bem atualizados' },
        ];
        await base44.entities.PatrimonioInterno.update(bem.id, { ...payload, historico });
        await logAction({ action: 'update', entity: 'PatrimonioInterno', entityId: bem.id, description: `Bem "${payload.nome}" atualizado` });
      } else {
        const criado = await base44.entities.PatrimonioInterno.create({
          ...payload,
          lancamento_id: '',
          historico: [{ data: new Date().toISOString(), usuario: '', acao: 'criacao', descricao: 'Bem cadastrado manualmente' }],
        });
        await logAction({ action: 'create', entity: 'PatrimonioInterno', entityId: criado?.id, description: `Bem "${payload.nome}" cadastrado` });
      }
      onSaved();
      onClose();
    } catch (e) {
      setErro(e?.message || 'Erro ao salvar o bem.');
    }
    setSalvando(false);
  };

  return (
    <GestaoModal
      open={open}
      onClose={onClose}
      size="lg"
      title={editando ? 'Editar bem' : 'Novo bem'}
      subtitle="Cadastro do patrimônio da empresa."
      footer={(
        <>
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium border border-border rounded-lg hover:bg-gray-50">Cancelar</button>
          <button onClick={salvar} disabled={salvando} className="px-4 py-2 text-sm font-semibold bg-foreground text-primary-foreground rounded-lg hover:bg-foreground/90 disabled:opacity-50">
            {salvando ? 'Salvando...' : 'Salvar'}
          </button>
        </>
      )}
    >
      <div className="space-y-4">
        {erro && <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{erro}</div>}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field label="Nome do bem" required className="sm:col-span-2">
            <input className="input-field" value={form.nome} onChange={e => set('nome', e.target.value)} placeholder="Ex: Notebook Dell Latitude" />
          </Field>
          <Field label="Categoria">
            <select className="input-field" value={form.categoria_id} onChange={e => set('categoria_id', e.target.value)}>
              <option value="">— Selecione —</option>
              {categoriasPatrimonio.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </Field>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Field label="Data de aquisição">
            <input type="date" className="input-field" value={form.data_aquisicao} onChange={e => set('data_aquisicao', e.target.value)} />
          </Field>
          <Field label="Quantidade">
            <input type="number" min="1" className="input-field" value={form.quantidade} onChange={e => { const v = e.target.value; set('quantidade', v); set('valor_total', recalcularTotal(v, form.valor_unitario)); }} />
          </Field>
          <Field label="Valor unitário (R$)">
            <input type="number" step="0.01" className="input-field" value={form.valor_unitario} onChange={e => { const v = e.target.value; set('valor_unitario', v); set('valor_total', recalcularTotal(form.quantidade, v)); }} placeholder="0,00" />
          </Field>
          <Field label="Valor total (R$)" required>
            <input type="number" step="0.01" className="input-field" value={form.valor_total} onChange={e => set('valor_total', e.target.value)} placeholder="0,00" />
          </Field>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Fornecedor ou origem">
            <input className="input-field" value={form.fornecedor} onChange={e => set('fornecedor', e.target.value)} placeholder="Opcional" />
          </Field>
          <Field label="Responsável">
            <input className="input-field" value={form.responsavel} onChange={e => set('responsavel', e.target.value)} placeholder="Opcional" />
          </Field>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Field label="Vida útil (meses)" hint="Usada na depreciação gerencial">
            <input type="number" min="0" className="input-field" value={form.vida_util_meses} onChange={e => set('vida_util_meses', e.target.value)} placeholder="Opcional" />
          </Field>
          <Field label="Valor residual (R$)">
            <input type="number" step="0.01" className="input-field" value={form.valor_residual} onChange={e => set('valor_residual', e.target.value)} placeholder="Opcional" />
          </Field>
          <Field label="Localização">
            <input className="input-field" value={form.localizacao} onChange={e => set('localizacao', e.target.value)} placeholder="Opcional" />
          </Field>
          <Field label="Status">
            <select className="input-field" value={form.status} onChange={e => set('status', e.target.value)}>
              {Object.entries(STATUS_PATRIMONIO_LABELS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
            </select>
          </Field>
        </div>

        <AnexosUpload anexos={documento} onChange={setDocumento} single label="Documento ou nota fiscal" />

        <Field label="Observações">
          <textarea className="input-field min-h-[70px]" value={form.observacoes} onChange={e => set('observacoes', e.target.value)} placeholder="Opcional" />
        </Field>
      </div>
    </GestaoModal>
  );
}