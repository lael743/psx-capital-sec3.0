import { Save, AlertCircle } from 'lucide-react';

function SimNao({ value, onChange }) {
  return (
    <div className="inline-flex rounded-lg border border-border overflow-hidden">
      <button type="button" onClick={() => onChange(true)} className={`px-4 py-2 text-xs font-semibold ${value ? 'bg-foreground text-primary-foreground' : 'bg-white text-muted-foreground hover:bg-gray-50'}`}>Sim</button>
      <button type="button" onClick={() => onChange(false)} className={`px-4 py-2 text-xs font-semibold ${!value ? 'bg-foreground text-primary-foreground' : 'bg-white text-muted-foreground hover:bg-gray-50'}`}>Não</button>
    </div>
  );
}

export default function SecaoCondicoesComerciais({ form, setField, saving, saveSection, savedFlash }) {
  return (
    <div className="bg-white border border-border rounded-xl p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold">Condições Comerciais</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Taxas, limites e encargos da operação.</p>
        </div>
        <button onClick={() => saveSection('condicoes')} disabled={saving} className="inline-flex items-center gap-2 px-4 py-2 bg-foreground text-primary-foreground text-sm font-semibold rounded-lg hover:bg-foreground/90 disabled:opacity-50">
          <Save className="w-3.5 h-3.5" /> {saving ? 'Salvando...' : 'Salvar'}
        </button>
      </div>

      {savedFlash?.section === 'condicoes' && (
        <div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">{savedFlash.message}</div>
      )}

      {/* Taxas e Limites */}
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Taxas e Limites</h3>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Limite de Crédito (R$) *</label>
            <input type="number" step="0.01" className="input-field" value={form.credit_limit} onChange={e => setField('credit_limit', e.target.value)} placeholder="0,00" />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Taxa Mensal (%) *</label>
            <input type="number" step="0.01" className="input-field" value={form.default_rate} onChange={e => setField('default_rate', e.target.value)} placeholder="5,00" />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Tarifa por Título (R$)</label>
            <input type="number" step="0.01" className="input-field" value={form.tarifa_por_titulo} onChange={e => setField('tarifa_por_titulo', e.target.value)} placeholder="0,00" />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Tarifa por Operação (R$)</label>
            <input type="number" step="0.01" className="input-field" value={form.tarifa_por_operacao} onChange={e => setField('tarifa_por_operacao', e.target.value)} placeholder="0,00" />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Limite por Sacado (Geral)</label>
            <input type="number" step="0.01" className="input-field" value={form.limite_sacado_geral} onChange={e => setField('limite_sacado_geral', e.target.value)} placeholder="0,00" />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Limite Sacado (PJ)</label>
            <input type="number" step="0.01" className="input-field" value={form.limite_sacado_pj} onChange={e => setField('limite_sacado_pj', e.target.value)} placeholder="0,00" />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Limite Sacado (PF)</label>
            <input type="number" step="0.01" className="input-field" value={form.limite_sacado_pf} onChange={e => setField('limite_sacado_pf', e.target.value)} placeholder="0,00" />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Float (dias)</label>
            <input type="number" className="input-field" value={form.float_dias} onChange={e => setField('float_dias', e.target.value)} placeholder="0" />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Bloqueado</label>
            <SimNao value={!!form.bloqueado} onChange={v => setField('bloqueado', v)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Recuperação Judicial</label>
            <SimNao value={!!form.recuperacao_judicial} onChange={v => setField('recuperacao_judicial', v)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Emissor CCB</label>
            <SimNao value={!!form.emissor_ccb} onChange={v => setField('emissor_ccb', v)} />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Vencimento do Cadastro</label>
            <input type="date" className="input-field" value={form.vencimento_cadastro || ''} onChange={e => setField('vencimento_cadastro', e.target.value)} />
          </div>
        </div>
      </div>

      {/* Encargos */}
      <div className="border-t border-border pt-5">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Encargos</h3>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Multa Atraso (%)</label>
            <input type="number" step="0.01" className="input-field" value={form.multa_atraso_pct} onChange={e => setField('multa_atraso_pct', e.target.value)} placeholder="2,00" />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Juros Pós Vencimento (% a.m.)</label>
            <input type="number" step="0.01" className="input-field" value={form.juros_pos_vencimento_pct} onChange={e => setField('juros_pos_vencimento_pct', e.target.value)} placeholder="1,00" />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Multa Prorrogação (%)</label>
            <input type="number" step="0.01" className="input-field" value={form.multa_prorrogacao_pct} onChange={e => setField('multa_prorrogacao_pct', e.target.value)} placeholder="2,00" />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Tarifa Recuperação (R$)</label>
            <input type="number" step="0.01" className="input-field" value={form.tarifa_recuperacao} onChange={e => setField('tarifa_recuperacao', e.target.value)} placeholder="0,00" />
          </div>
        </div>
      </div>

      <p className="text-xs text-muted-foreground flex items-center gap-1"><AlertCircle className="w-3 h-3" /> Limite de Crédito e Taxa Mensal são obrigatórios para concluir o cadastro e gerar o Contrato Mãe.</p>
    </div>
  );
}