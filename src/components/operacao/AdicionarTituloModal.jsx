import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { X, Plus, AlertTriangle } from 'lucide-react';
import { formatCurrency, daysBetween, today } from '@/lib/finance';
import { calcTituloRow, calcTitulosTotais } from '@/components/operacao/wizard/TituloInlineTable';
import { logAction } from '@/lib/audit';
import { conflitosFinanceiros, mergeFinancialFields, mensagemConflito, salvarCondicionado } from '@/lib/scheduleWrite';

const STORAGE_KEY = 'psx_company_settings';
function getSettings() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch { return {}; }
}

export default function AdicionarTituloModal({ operacao, cheques, onClose, onSaved }) {
  const settings = getSettings();
  const [form, setForm] = useState({
    tipo: 'cheque',
    numero: '',
    nf: '',
    sacado: '',
    sacado_doc: '',
    vencimento: '',
    valor_face: '',
    outras_despesas: '',
  });
  const [saving, setSaving] = useState(false);
  const [conflito, setConflito] = useState('');

  const rate = operacao.rate || 0;
  const startDate = operacao.start_date || today();
  const interestType = operacao.interest_type || 'simples';
  const floatDias = operacao.float_dias || 0;
  const arredondar = settings.arredondar_taxa_diaria || false;

  const { dias, desagio, liquido } = calcTituloRow(form, startDate, rate, interestType, floatDias, arredondar);
  const canSave = form.vencimento && parseFloat(form.valor_face) > 0;

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);

    const valorFace = parseFloat(form.valor_face) || 0;
    const outrasDespesas = parseFloat(form.outras_despesas) || 0;

    // Create the cheque
    const novoCheque = await base44.entities.Cheque.create({
      operation_id: operacao.id,
      client_id: operacao.client_id,
      client_name: operacao.client_name,
      sacado_name: form.sacado,
      sacado_doc: form.sacado_doc,
      nf: form.nf,
      tipo: form.tipo,
      bank_name: form.tipo === 'cheque' ? 'Cheque' : 'Boleto',
      check_number: form.numero || `TIT-${Date.now()}`,
      value: valorFace,
      valor_face: valorFace,
      desagio,
      liquido,
      outras_despesas: outrasDespesas,
      dias,
      compensation_date: form.vencimento,
      status: 'pendente',
    });

    // Recalculate operation totals with all cheques (existing + new)
    const allTitulos = [
      ...cheques.map(c => ({
        tipo: c.tipo,
        vencimento: c.compensation_date,
        valor_face: String(c.valor_face || c.value || ''),
        outras_despesas: String(c.outras_despesas || 0),
      })),
      { ...form, valor_face: String(valorFace), outras_despesas: String(outrasDespesas) },
    ];

    const validTitulos = allTitulos.filter(t => t.vencimento && parseFloat(t.valor_face) > 0);
    const totals = calcTitulosTotais(validTitulos, startDate, rate, interestType, floatDias, arredondar);
    const tarifaTitulos = (operacao.tarifa_por_titulo || 0) * validTitulos.length;
    const valorLiquido = totals.totalLiquido - tarifaTitulos - (operacao.tarifa_operacao || 0);
    const lastDueDate = validTitulos.map(t => t.vencimento).sort().slice(-1)[0] || operacao.due_date;
    const totalDays = lastDueDate ? daysBetween(startDate, lastDueDate) : 0;

    const installmentSchedule = validTitulos.map((t, i) => {
      const row = calcTituloRow(t, startDate, rate, interestType, floatDias, arredondar);
      return {
        number: i + 1,
        value: parseFloat(t.valor_face) || 0,
        principal: row.liquido,
        interest: row.desagio,
        days: row.dias,
        due_date: t.vencimento,
        status: 'pendente',
        paid: false,
      };
    });

    // Relê o estado: esta tela pode ter sido aberta antes de um recebimento,
    // de uma cobrança ou de uma compensação de cheque.
    const atual = await base44.entities.Operation.get(operacao.id);
    const persistido = atual?.installment_schedule || [];

    const conflitos = conflitosFinanceiros(installmentSchedule, persistido);
    if (conflitos.length > 0) {
      // Desfaz o título recém-criado para não deixar registro órfão.
      if (novoCheque?.id) await base44.entities.Cheque.delete(novoCheque.id).catch(() => {});
      setConflito(mensagemConflito(conflitos));
      setSaving(false);
      return;
    }

    const gravado = await salvarCondicionado(base44, operacao.id, atual?.amount_paid, {
      gross_value: valorLiquido,
      net_value: valorLiquido,
      total_receivable: totals.totalFace,
      balance_due: totals.totalFace - (Number(atual?.amount_paid) || 0),
      days: totalDays,
      due_date: lastDueDate,
      installments: validTitulos.length,
      installment_value: totals.totalFace / (validTitulos.length || 1),
      installment_schedule: mergeFinancialFields(installmentSchedule, persistido),
      projected_profit: totals.totalFace - valorLiquido,
    });

    if (!gravado) {
      if (novoCheque?.id) await base44.entities.Cheque.delete(novoCheque.id).catch(() => {});
      setConflito('A operação recebeu um pagamento enquanto esta tela estava aberta. Recarregue a página e refaça a alteração.');
      setSaving(false);
      return;
    }

    await logAction({
      action: 'add_titulo',
      entity: 'Operation',
      entityId: operacao.id,
      description: `Título adicionado à operação — ${formatCurrency(valorFace)} — Sacado: ${form.sacado || '—'}`,
    });

    setSaving(false);
    onSaved();
  };

  const inputCls = 'w-full px-3 py-2.5 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-colors';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center">
              <Plus className="w-4.5 h-4.5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-base font-bold">Adicionar Título</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Informe sacado, vencimento e valor de face para simular o deságio.</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 p-5 space-y-5">
          {/* Section 01: Sacado */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xs font-bold text-blue-600">01</span>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Identificação do Sacado</h3>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Sacado (Pagador)</label>
                <input className={inputCls} value={form.sacado} onChange={e => set('sacado', e.target.value)} placeholder="Razão Social do Cliente" />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">CPF / CNPJ</label>
                <input className={inputCls} value={form.sacado_doc} onChange={e => set('sacado_doc', e.target.value)} placeholder="00.000.000/0000-00" />
              </div>
            </div>
          </section>

          {/* Section 02: Título */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xs font-bold text-blue-600">02</span>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Informações do Título</h3>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Tipo de Título</label>
                <select className={inputCls} value={form.tipo} onChange={e => set('tipo', e.target.value)}>
                  <option value="cheque">Cheque</option>
                  <option value="boleto">Boleto</option>
                  <option value="duplicata">Duplicata</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Vencimento</label>
                <input type="date" className={inputCls} value={form.vencimento} onChange={e => set('vencimento', e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Número do Título</label>
                <input className={inputCls} value={form.numero} onChange={e => set('numero', e.target.value)} placeholder="Ex: 12345" />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Número da NF</label>
                <input className={inputCls} value={form.nf} onChange={e => set('nf', e.target.value)} placeholder="Ex: 001" />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Valor de Face</label>
                <input type="number" step="0.01" className={`${inputCls} text-right`} value={form.valor_face} onChange={e => set('valor_face', e.target.value)} placeholder="0,00" />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Outras Despesas</label>
                <input type="number" step="0.01" className={`${inputCls} text-right`} value={form.outras_despesas} onChange={e => set('outras_despesas', e.target.value)} placeholder="0,00" />
              </div>
            </div>
          </section>
        </div>

        {conflito && (
          <div className="mx-5 mb-2 flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200">
            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <p className="text-xs text-red-800">{conflito}</p>
          </div>
        )}

        {/* Summary Footer */}
        <div className="border-t border-border p-5 bg-gray-50/50 shrink-0">
          <div className="flex items-end justify-between mb-4">
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Deságio</p>
              <p className="text-lg font-bold text-red-600">{formatCurrency(desagio)}</p>
              <p className="text-xs text-muted-foreground">em {dias || 0} dias</p>
            </div>
            <div className="text-right space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Valor Líquido</p>
              <p className="text-lg font-bold text-emerald-600">{formatCurrency(liquido)}</p>
              <p className="text-xs text-muted-foreground">Taxa {rate}% a.m.</p>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={onClose} className="px-4 py-2 text-sm font-medium border border-border rounded-lg hover:bg-gray-50 transition-colors">
              Cancelar
            </button>
            <button onClick={handleSave} disabled={!canSave || saving} className="inline-flex items-center gap-2 px-5 py-2 bg-foreground text-primary-foreground text-sm font-semibold rounded-lg hover:bg-foreground/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              <Plus className="w-4 h-4" /> {saving ? 'Criando...' : 'Criar Título'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}