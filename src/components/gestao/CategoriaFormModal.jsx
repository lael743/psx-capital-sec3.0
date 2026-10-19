import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { logAction } from '@/lib/audit';
import GestaoModal from './GestaoModal';
import Field from './Field';

/** Cadastro de categoria e subcategoria da Gestão Interna. */
export default function CategoriaFormModal({ open, onClose, onSaved, categoria, categorias = [] }) {
  const [form, setForm] = useState({
    nome: categoria?.nome || '',
    tipo: categoria?.tipo || 'despesa',
    parent_id: categoria?.parent_id || '',
    ordem: categoria?.ordem ?? 0,
    ativo: categoria?.ativo !== false,
  });
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const paisDisponiveis = categorias.filter(
    c => c.tipo === form.tipo && !c.parent_id && c.id !== categoria?.id,
  );

  const salvar = async () => {
    if (!form.nome.trim()) { setErro('Informe o nome da categoria.'); return; }
    setSalvando(true);
    setErro('');
    const pai = paisDisponiveis.find(c => c.id === form.parent_id);
    const payload = {
      nome: form.nome.trim(),
      tipo: form.tipo,
      parent_id: form.parent_id || '',
      parent_nome: pai?.nome || '',
      ordem: Number(form.ordem) || 0,
      ativo: form.ativo,
    };
    try {
      if (categoria?.id) {
        await base44.entities.CategoriaInterna.update(categoria.id, payload);
        await logAction({ action: 'update', entity: 'CategoriaInterna', entityId: categoria.id, description: `Categoria "${payload.nome}" atualizada`, before: categoria, after: payload });
      } else {
        const criada = await base44.entities.CategoriaInterna.create({ ...payload, sistema: false });
        await logAction({ action: 'create', entity: 'CategoriaInterna', entityId: criada?.id, description: `Categoria "${payload.nome}" criada` });
      }
      onSaved();
      onClose();
    } catch (e) {
      setErro(e?.message || 'Erro ao salvar categoria.');
    }
    setSalvando(false);
  };

  return (
    <GestaoModal
      open={open}
      onClose={onClose}
      size="sm"
      title={categoria?.id ? 'Editar categoria' : 'Nova categoria'}
      subtitle="Categorias e subcategorias organizam despesas e patrimônio."
      footer={(
        <>
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium border border-border rounded-lg hover:bg-gray-50">
            Cancelar
          </button>
          <button onClick={salvar} disabled={salvando} className="px-4 py-2 text-sm font-semibold bg-foreground text-primary-foreground rounded-lg hover:bg-foreground/90 disabled:opacity-50">
            {salvando ? 'Salvando...' : 'Salvar'}
          </button>
        </>
      )}
    >
      <div className="space-y-4">
        {erro && <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{erro}</div>}

        <Field label="Nome" required>
          <input className="input-field" value={form.nome} onChange={e => set('nome', e.target.value)} placeholder="Ex: Contabilidade" />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Aplicação" required>
            <select className="input-field" value={form.tipo} onChange={e => { set('tipo', e.target.value); set('parent_id', ''); }}>
              <option value="despesa">Despesa</option>
              <option value="patrimonio">Patrimônio</option>
            </select>
          </Field>
          <Field label="Categoria pai">
            <select className="input-field" value={form.parent_id} onChange={e => set('parent_id', e.target.value)}>
              <option value="">— Nenhuma (categoria) —</option>
              {paisDisponiveis.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Ordem de exibição">
            <input type="number" className="input-field" value={form.ordem} onChange={e => set('ordem', e.target.value)} />
          </Field>
          <Field label="Situação">
            <label className="flex items-center gap-2 h-[42px] px-3 border border-border rounded-lg bg-white cursor-pointer">
              <input type="checkbox" checked={form.ativo} onChange={e => set('ativo', e.target.checked)} className="w-4 h-4 rounded border-border" />
              <span className="text-xs font-medium">{form.ativo ? 'Ativa' : 'Inativa'}</span>
            </label>
          </Field>
        </div>
      </div>
    </GestaoModal>
  );
}