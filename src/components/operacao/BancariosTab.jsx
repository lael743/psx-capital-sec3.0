import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { editarOperacaoCampos } from '@/lib/operacaoOps';
import { Wallet, Zap, Save, Loader2, CheckCircle, Building2, Landmark, User } from 'lucide-react';
import { formatCurrency } from '@/lib/finance';

const STORAGE_KEY = 'psx_company_settings';
function getSettings() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch { return {}; }
}

export default function BancariosTab({ operacao, client, onUpdate }) {
  const [bancos, setBancos] = useState([]);
  const [form, setForm] = useState({
    disbursement_bank_id: operacao.disbursement_bank_id || '',
    disbursement_bank_name: operacao.disbursement_bank_name || '',
    disbursement_method: operacao.disbursement_method || 'pix',
    repasse_bank_id: operacao.repasse_bank_id || '',
    repasse_bank_name: operacao.repasse_bank_name || '',
    lucro_bank_id: operacao.lucro_bank_id || '',
    lucro_bank_name: operacao.lucro_bank_name || '',
    assessor: operacao.assessor || '',
    cheques_status: operacao.cheques_status || 'em_maos',
    cheques_notes: operacao.cheques_notes || '',
    client_pix_key: client?.pix_key || '',
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    base44.entities.Banco.list().then(setBancos).catch(() => {});
  }, []);

  const bancoSelecionado = bancos.find((b) => b.id === form.disbursement_bank_id);
  const valorDeposito = operacao.net_value || operacao.gross_value || 0;

  const handleChange = (field, value) => {
    setForm((f) => ({ ...f, [field]: value }));
    setSaved(false);
  };

  const handleBancoChange = (field, idField, nameField, value) => {
    const banco = bancos.find((b) => b.id === value);
    setForm((f) => ({
      ...f,
      [idField]: value,
      [nameField]: banco?.name || '',
    }));
    setSaved(false);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await editarOperacaoCampos(operacao.id, {
        disbursement_bank_id: form.disbursement_bank_id,
        disbursement_bank_name: form.disbursement_bank_name,
        disbursement_method: form.disbursement_method,
        repasse_bank_id: form.repasse_bank_id,
        repasse_bank_name: form.repasse_bank_name,
        lucro_bank_id: form.lucro_bank_id,
        lucro_bank_name: form.lucro_bank_name,
        assessor: form.assessor,
        cheques_status: form.cheques_status,
        cheques_notes: form.cheques_notes,
      });
      if (client?.id && form.client_pix_key !== (client.pix_key || '')) {
        await base44.entities.Client.update(client.id, { pix_key: form.client_pix_key });
      }
      setSaved(true);
      if (onUpdate) onUpdate();
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      console.error('Erro ao salvar dados bancários:', e);
    }
    setSaving(false);
  };

  const chequesStatusLabel = (s) => s === 'em_maos' ? 'Em mãos' : s === 'pendente_buscar' ? 'A buscar' : s === 'tesouraria' ? 'Tesouraria' : '—';

  return (
    <div className="space-y-4">
      {/* Contas para Desembolso - card style conforme referência */}
      <div className="bg-white border border-border rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Wallet className="w-4 h-4 text-[hsl(43,65%,47%)]" />
          <h3 className="text-sm font-bold">Contas para Desembolso</h3>
          <span className="text-xs text-muted-foreground">(1)</span>
        </div>

        {/* Status bar */}
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 flex items-center gap-3 flex-wrap">
          <CheckCircle className="w-4 h-4 text-emerald-600" />
          <span className="text-xs text-emerald-800 font-medium">Ativas: {formatCurrency(valorDeposito)}</span>
          <span className="text-xs text-emerald-800 font-medium">Líquido: {formatCurrency(valorDeposito)}</span>
          <span className="ml-auto px-2 py-0.5 bg-emerald-600 text-white text-[10px] font-bold rounded">OK</span>
        </div>

        {/* Card da conta PIX */}
        <div className="border border-[hsl(43,55%,52%)]/30 rounded-lg overflow-hidden">
          <div className="bg-[hsl(43,55%,52%)]/10 px-3 py-2 flex items-center gap-2">
            <Zap className="w-3.5 h-3.5 text-[hsl(43,65%,47%)]" />
            <span className="text-xs font-bold text-[hsl(43,65%,47%)]">PIX</span>
          </div>
          <div className="p-4 space-y-3">
            <div>
              <label className="block text-[10px] font-medium text-muted-foreground mb-1 uppercase tracking-wider">
                {client?.document_type === 'CNPJ' ? 'CNPJ' : 'CPF'} · {client?.name || 'Cedente'}
              </label>
              <input
                className="input-field"
                value={client?.document || '—'}
                disabled
              />
            </div>
            <div>
              <label className="block text-[10px] font-medium text-muted-foreground mb-1 uppercase tracking-wider">Chave PIX (Cedente)</label>
              <input
                className="input-field"
                value={form.client_pix_key}
                onChange={(e) => handleChange('client_pix_key', e.target.value)}
                placeholder="Chave PIX do cedente"
              />
            </div>
            <div>
              <label className="block text-[10px] font-medium text-muted-foreground mb-1 uppercase tracking-wider">Valor a Depositar</label>
              <div className="bg-gray-100 border border-border rounded-lg px-3 py-2.5 font-bold text-sm">
                {formatCurrency(valorDeposito)}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Dados editáveis de repasse */}
      <div className="bg-white border border-border rounded-xl p-5 space-y-4">
        <h3 className="text-sm font-bold flex items-center gap-2">
          <Landmark className="w-4 h-4 text-muted-foreground" /> Dados para Repasse ao Cedente
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Banco de Desembolso */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1 uppercase tracking-wider">Banco de Desembolso</label>
            <select
              className="input-field"
              value={form.disbursement_bank_id}
              onChange={(e) => handleBancoChange('disbursement', 'disbursement_bank_id', 'disbursement_bank_name', e.target.value)}
            >
              <option value="">Selecione...</option>
              {bancos.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            {bancoSelecionado && (
              <p className="text-[10px] text-muted-foreground mt-1">
                Ag: {bancoSelecionado.agency || '—'} · Conta: {bancoSelecionado.account || '—'}
                {bancoSelecionado.pix_key && ` · PIX: ${bancoSelecionado.pix_key}`}
              </p>
            )}
          </div>

          {/* Forma de Desembolso */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1 uppercase tracking-wider">Forma de Desembolso</label>
            <select
              className="input-field"
              value={form.disbursement_method}
              onChange={(e) => handleChange('disbursement_method', e.target.value)}
            >
              <option value="pix">PIX</option>
              <option value="ted">TED/Transferência</option>
              <option value="cheque">Cheque</option>
              <option value="dinheiro">Dinheiro</option>
            </select>
          </div>

          {/* Banco de Repasse */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1 uppercase tracking-wider">Banco de Repasse</label>
            <select
              className="input-field"
              value={form.repasse_bank_id}
              onChange={(e) => handleBancoChange('repasse', 'repasse_bank_id', 'repasse_bank_name', e.target.value)}
            >
              <option value="">Selecione...</option>
              {bancos.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>

          {/* Banco de Lucro */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1 uppercase tracking-wider">Banco de Lucro</label>
            <select
              className="input-field"
              value={form.lucro_bank_id}
              onChange={(e) => handleBancoChange('lucro', 'lucro_bank_id', 'lucro_bank_name', e.target.value)}
            >
              <option value="">Selecione...</option>
              {bancos.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>

          {/* Assessor */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1 uppercase tracking-wider flex items-center gap-1"><User className="w-3 h-3" /> Assessor</label>
            <input
              className="input-field"
              value={form.assessor}
              onChange={(e) => handleChange('assessor', e.target.value)}
              placeholder="Nome do assessor"
            />
          </div>

          {/* Status dos Cheques */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1 uppercase tracking-wider flex items-center gap-1"><Building2 className="w-3 h-3" /> Status dos Cheques</label>
            <select
              className="input-field"
              value={form.cheques_status}
              onChange={(e) => handleChange('cheques_status', e.target.value)}
            >
              <option value="em_maos">Em mãos</option>
              <option value="pendente_buscar">A buscar</option>
              <option value="tesouraria">Tesouraria</option>
            </select>
          </div>

          {/* Obs Cheques */}
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-muted-foreground mb-1 uppercase tracking-wider">Obs. Cheques</label>
            <textarea
              className="input-field"
              rows={2}
              value={form.cheques_notes}
              onChange={(e) => handleChange('cheques_notes', e.target.value)}
              placeholder="Observações sobre os cheques"
            />
          </div>
        </div>

        <div className="flex justify-end pt-2 border-t border-border">
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-2 px-4 py-2 bg-foreground text-primary-foreground text-sm font-semibold rounded-lg disabled:opacity-50 hover:bg-foreground/90 transition-colors"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <CheckCircle className="w-4 h-4 text-emerald-400" /> : <Save className="w-4 h-4" />}
            {saving ? 'Salvando...' : saved ? 'Salvo!' : 'Salvar Dados Bancários'}
          </button>
        </div>
      </div>
    </div>
  );
}