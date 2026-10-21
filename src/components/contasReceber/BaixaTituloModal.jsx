import { useEffect, useState } from 'react';
import { X, CheckCircle2, AlertTriangle, Landmark } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { formatCurrency, formatDate } from '@/lib/finance';
import { hojeLocalISO, tituloElegivelParaBaixa } from '@/lib/contasReceber';
import { registrarBaixaTitulo } from '@/lib/baixaTituloOps';

/**
 * M6.4 — BAIXA INDIVIDUAL DE TÍTULO.
 *
 * Este modal NÃO movimenta dinheiro: ele monta o pedido (qual título, qual
 * conta, qual data) e o servidor decide o resto com o núcleo financeiro
 * existente. Repetir o envio não duplica recebimento — a identidade do evento
 * é do servidor.
 */
function Campo({ label, valor }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold truncate" title={String(valor ?? '—')}>{valor ?? '—'}</div>
    </div>
  );
}

export default function BaixaTituloModal({ linha, onClose, onSaved }) {
  const [bancos, setBancos] = useState([]);
  const [bankId, setBankId] = useState('');
  const [data, setData] = useState(hojeLocalISO());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const elegibilidade = tituloElegivelParaBaixa(linha);
  const valorTitulo = Number(linha?.valor_face) || 0;

  useEffect(() => {
    base44.entities.Banco.filter({ active: true }, 'name', 100).then((lista) => {
      setBancos(lista || []);
      const padrao = (lista || []).find((b) => b.is_default_lucro) || (lista || [])[0];
      if (padrao) setBankId(padrao.id);
    });
  }, []);

  const banco = bancos.find((b) => b.id === bankId);

  const salvar = async () => {
    if (!bankId) {
      setError('Escolha a conta de destino do recebimento.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const resultado = await registrarBaixaTitulo({
        tituloId: linha.registro_id,
        bankId,
        data,
      });
      setSaving(false);
      onSaved(resultado);
      onClose();
    } catch (e) {
      setSaving(false);
      setError(e.message || 'Não foi possível registrar a baixa.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div className="flex items-center gap-2 min-w-0">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <div className="min-w-0">
              <h2 className="text-base font-bold">Registrar baixa do título</h2>
              <p className="text-xs text-muted-foreground mt-0.5 truncate">
                Título {linha?.numero ?? 'sem número'} · {linha?.cliente_nome || 'cliente não informado'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3 bg-gray-50 border border-border rounded-xl p-3">
            <Campo label="Cliente" valor={linha?.cliente_nome} />
            <Campo
              label="Operação"
              valor={linha?.operacao_numero !== null && linha?.operacao_numero !== undefined ? `#${linha.operacao_numero}` : null}
            />
            <Campo label="Título" valor={`${linha?.numero ?? 'sem número'} · ${linha?.origem_label || ''}`} />
            <Campo label="Vencimento" valor={linha?.vencimento ? formatDate(linha.vencimento) : null} />
            <Campo label="Valor do título" valor={formatCurrency(valorTitulo)} />
            <Campo
              label="Saldo da operação"
              valor={linha?.saldo_operacao === null || linha?.saldo_operacao === undefined ? null : formatCurrency(linha.saldo_operacao)}
            />
          </div>

          {!elegibilidade.elegivel && (
            <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl p-3">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-800">{elegibilidade.motivo}</p>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Data do recebimento *</label>
            <input type="date" className="input-field" value={data} onChange={(e) => setData(e.target.value)} />
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Conta de destino *</label>
            <select className="input-field" value={bankId} onChange={(e) => setBankId(e.target.value)}>
              <option value="">Selecionar conta...</option>
              {bancos.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}{b.account ? ` — cc ${b.account}` : ''}
                </option>
              ))}
            </select>
            {banco && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1.5">
                <Landmark className="w-3 h-3" />
                Saldo atual {formatCurrency(banco.current_balance || 0)}
                {' → '}
                <span className="font-semibold text-emerald-600">
                  {formatCurrency((banco.current_balance || 0) + valorTitulo)}
                </span>
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Forma de pagamento</label>
            <div className="input-field bg-gray-50 text-muted-foreground">Cheque</div>
            <p className="text-[11px] text-muted-foreground mt-1">
              Fixada pelo mecanismo financeiro: a liquidação deste título é a compensação do cheque, que credita a conta,
              lança no caixa e quita a parcela correspondente na operação.
            </p>
          </div>

          <div className="flex items-start gap-2 bg-blue-50 border border-blue-200 rounded-xl p-3">
            <AlertTriangle className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
            <p className="text-xs text-blue-900">
              O servidor confere título, saldo em aberto da operação, concorrência e identidade do evento. Reenviar a
              mesma baixa não soma o recebimento duas vezes.
            </p>
          </div>

          {error && <p className="text-xs text-red-600 font-medium">{error}</p>}

          <div className="flex gap-3 justify-end pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium border border-border rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={salvar}
              disabled={saving || !elegibilidade.elegivel || !bankId}
              className="px-5 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Registrando...' : 'Confirmar baixa'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}