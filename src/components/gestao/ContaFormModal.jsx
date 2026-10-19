import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { logAction } from '@/lib/audit';
import GestaoModal from './GestaoModal';
import Field from './Field';
import { TIPOS_CONTA } from '@/lib/gestaoInterna';

/**
 * Cadastro de contas e meios de pagamento.
 * Conta bancária reaproveita o cadastro do módulo Bancos (sem duplicar).
 */
export default function ContaFormModal({ open, onClose, onSaved, conta, bancos = [] }) {
  const [form, setForm] = useState({
    nome: conta?.nome || '',
    tipo: conta?.tipo || 'conta_bancaria',
    banco_id: conta?.banco_id || '',
    saldo_inicial: conta?.saldo_inicial ?? 0,
    limite: conta?.limite ?? '',
    dia_fechamento: conta?.dia_fechamento ?? '',
    dia_vencimento: conta?.dia_vencimento ?? '',
    ativo: conta?.ativo !== false,
    observacoes: conta?.observacoes || '',
  });
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const ehCartao = form.tipo === 'cartao_credito';
  const ehBanco = form.tipo === 'conta_bancaria';

  const salvar = async () => {
    if (!form.nome.trim()) { setErro('Informe o nome da conta.'); return; }
    if (ehBanco && !form.banco_id) { setErro('Selecione o banco vinculado.'); return; }
    setSalvando(true);
    setErro('');
    const banco = bancos.find(b => b.id === form.banco_id);
    const payload = {
      nome: form.nome.trim(),
      tipo: form.tipo,
      banco_id: ehBanco ? form.banco_id : '',
      banco_nome: ehBanco ? (banco?.name || '') : '',
      saldo_inicial: Number(form.saldo_inicial) || 0,
      limite: ehCartao ? (Number(form.limite) || 0) : 0,
      dia_fechamento: Number(form.dia_fechamento) || 0,
      dia_vencimento: Number(form.dia_vencimento) || 0,
      ativo: form.ativo,
      observacoes: form.observacoes,
    };
    try {
      if (conta?.id) {
        await base44.entities.ContaInterna.update(conta.id, payload);
        await logAction({ action: 'update', entity: 'ContaInterna', entityId: conta.id, description: `Conta "${payload.nome}" atualizada` });
      } else {
        const criada = await base44.entities.ContaInterna.create(payload);
        await logAction({ action: 'create', entity: 'ContaInterna', entityId: criada?.id, description: `Conta "${payload.nome}" criada` });
      }
      onSaved();
      onClose();
    } catch (e) {
      setErro(e?.message || 'Erro ao salvar conta.');
    }
    setSalvando(false);
  };

  return (
    <GestaoModal
      open={open}
      onClose={onClose}
      title={conta?.id ? 'Editar conta' : 'Nova conta'}
      subtitle="Conta de pagamento, caixa ou cartão usados nos lançamentos."
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

        <Field label="Nome" required>
          <input className="input-field" value={form.nome} onChange={e => set('nome', e.target.value)} placeholder="Ex: Conta corrente PSX" />
        </Field>

        <Field label="Tipo" required>
          <select className="input-field" value={form.tipo} onChange={e => set('tipo', e.target.value)}>
            {TIPOS_CONTA.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </Field>

        {ehBanco && (
          <Field label="Banco vinculado" required hint="Reutiliza o cadastro do módulo Bancos — nenhuma conta é duplicada.">
            <select className="input-field" value={form.banco_id} onChange={e => set('banco_id', e.target.value)}>
              <option value="">— Selecione o banco —</option>
              {bancos.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </Field>
        )}

        {ehCartao ? (
          <div className="grid grid-cols-3 gap-3">
            <Field label="Limite (R$)">
              <input type="number" step="0.01" className="input-field" value={form.limite} onChange={e => set('limite', e.target.value)} placeholder="0,00" />
            </Field>
            <Field label="Dia fechamento">
              <input type="number" min="1" max="31" className="input-field" value={form.dia_fechamento} onChange={e => set('dia_fechamento', e.target.value)} />
            </Field>
            <Field label="Dia vencimento">
              <input type="number" min="1" max="31" className="input-field" value={form.dia_vencimento} onChange={e => set('dia_vencimento', e.target.value)} />
            </Field>
          </div>
        ) : (
          <Field label="Saldo inicial (R$)" hint="Controle gerencial — não movimenta o saldo do banco.">
            <input type="number" step="0.01" className="input-field" value={form.saldo_inicial} onChange={e => set('saldo_inicial', e.target.value)} />
          </Field>
        )}

        <Field label="Observações">
          <input className="input-field" value={form.observacoes} onChange={e => set('observacoes', e.target.value)} placeholder="Opcional" />
        </Field>

        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={form.ativo} onChange={e => set('ativo', e.target.checked)} className="w-4 h-4 rounded border-border" />
          <span className="text-xs font-medium">Conta ativa para novos lançamentos</span>
        </label>
      </div>
    </GestaoModal>
  );
}