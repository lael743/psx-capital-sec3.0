import { useState, useEffect } from 'react';
import { X, AlertTriangle, DollarSign, MessageCircle } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { resolverChequeDevolvido } from '@/lib/chequeOps';
import { calcJurosResolucao, diasEntreDatas, baseTaxaCongelada } from '@/lib/chequeCore';
import { formatCurrency, today } from '@/lib/finance';

/**
 * Modal de resolução para cheques devolvidos.
 *
 * M2 — o navegador NÃO escreve mais nada: taxa, obrigação, caixa e saldo são
 * decididos e gravados pela função `chequeEvento`. Aqui só se monta o pedido.
 *
 * Fluxo:
 *  1. Taxa de devolução (percentual sobre a face original congelada) e
 *     modalidade de cobrança: incorporada à obrigação ou separada.
 *  2. Forma de resolução: novo cheque, prorrogação ou pagamento.
 *  3. Mensagem de WhatsApp de cobrança com o total atualizado.
 */
export default function ChequeDevolvidoModal({ cheque, onClose, onSaved }) {
  const [operation, setOperation] = useState(null);
  const [client, setClient] = useState(null);
  const [bancos, setBancos] = useState([]);

  const [taxaPercentual, setTaxaPercentual] = useState('');
  const [taxaIncorporada, setTaxaIncorporada] = useState(true);
  const [resolveType, setResolveType] = useState('');
  // novo cheque
  const [novoBanco, setNovoBanco] = useState('');
  const [novoNumero, setNovoNumero] = useState('');
  const [novaData, setNovaData] = useState('');
  // pagamento
  const [dataPagamento, setDataPagamento] = useState(today());
  const [bancoId, setBancoId] = useState(cheque?.deposited_bank_id || '');
  // prorrogação
  const [novaDataProrrogacao, setNovaDataProrrogacao] = useState('');
  const [taxaMensalProrrogacao, setTaxaMensalProrrogacao] = useState('');

  const [step, setStep] = useState(1); // 1 = taxa, 2 = resolução
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    const ops = [
      base44.entities.Banco.filter({ active: true }, 'name', 100).then(setBancos),
    ];
    if (cheque?.operation_id) {
      ops.push(base44.entities.Operation.get(cheque.operation_id).then(setOperation));
    }
    if (cheque?.client_id) {
      ops.push(base44.entities.Client.get(cheque.client_id).then(setClient));
    }
    Promise.all(ops);
  }, [cheque]);

  // A base da taxa é o valor de FACE original, congelado — nunca um valor
  // alterado por prorrogação anterior.
  const base = baseTaxaCongelada(cheque);
  const percentual = parseFloat(taxaPercentual) || 0;
  const taxa = Math.round(base * (percentual / 100) * 100) / 100;
  const principal = Number(cheque?.value) || 0;
  const valorTotal = Math.round((principal + taxa) * 100) / 100;
  const novoSaldo = (operation?.total_receivable || 0) + (taxaIncorporada ? taxa : 0);

  // Juros da prorrogação: MESMA fórmula do fluxo normal, contados do vencimento
  // original e nunca sobre um período já coberto.
  const inicioJuros = cheque?.juros_cobrados_ate || cheque?.compensation_date || '';
  const diasProrrogacao = novaDataProrrogacao ? diasEntreDatas(inicioJuros, novaDataProrrogacao) : 0;
  const taxaProrr = parseFloat(taxaMensalProrrogacao) || 0;
  const jurosProrrogacao = calcJurosResolucao(principal, taxaProrr, diasProrrogacao);

  const pagamento = ['pix', 'dinheiro', 'transferencia'].includes(resolveType);

  const canSave = !!resolveType && (
    resolveType === 'novo_cheque' ? (novoBanco && novoNumero && novaData) :
    resolveType === 'prorrogacao' ? (novaDataProrrogacao && novaDataProrrogacao > today() && taxaProrr > 0) :
    (!!dataPagamento && !!bancoId)
  );

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      await resolverChequeDevolvido({
        cheque,
        modalidade: pagamento ? 'pagamento' : resolveType,
        data: pagamento ? dataPagamento : today(),
        taxaPercentual: percentual,
        taxaIncorporada,
        novaData: resolveType === 'novo_cheque' ? novaData : novaDataProrrogacao,
        novoBanco,
        novoNumero,
        taxaMensal: taxaProrr,
        bankId: pagamento ? bancoId : '',
        metodo: pagamento ? resolveType : '',
        observacao: notes,
      });
      onSaved();
      onClose();
    } catch (e) {
      setError(e.message || 'Não foi possível resolver o cheque.');
      setSaving(false);
    }
  };

  const gerarMensagemWa = () => {
    if (!client) return;
    const num = (client.whatsapp || client.phone || '').replace(/\D/g, '');
    if (!num) return;
    const msg = encodeURIComponent(
      `Olá ${client.name}! Seu cheque #${cheque.check_number} no valor de *${formatCurrency(principal)}* foi devolvido pelo banco.\n\n` +
      `Será cobrada uma taxa de devolução de *${formatCurrency(taxa)}*, totalizando *${formatCurrency(valorTotal)}*.\n\n` +
      `Por favor, entre em contato para regularizar. Obrigado!`
    );
    window.open(`https://wa.me/55${num}?text=${msg}`, '_blank');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-4 h-4 text-red-500" />
            </div>
            <div>
              <h3 className="text-sm font-bold">Resolver Cheque Devolvido</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                #{cheque?.check_number} — {formatCurrency(principal)} — {cheque?.client_name}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-5">

          {/* Etapa 1: Taxa de devolução */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${step >= 1 ? 'bg-foreground text-white' : 'bg-gray-200 text-gray-500'}`}>1</div>
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Taxa de Devolução</span>
            </div>
            <div className="pl-7 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">Taxa (%) sobre a face</label>
                  <input
                    className="input-field"
                    type="number"
                    step="0.01"
                    value={taxaPercentual}
                    onChange={e => setTaxaPercentual(e.target.value)}
                    placeholder="0,00"
                  />
                  <p className="text-xs text-muted-foreground mt-1">Face congelada: {formatCurrency(base)}</p>
                </div>
                <div className="bg-red-50 border border-red-100 rounded-xl p-3 flex flex-col justify-center">
                  <div className="text-xs text-red-600 font-medium">Total a receber</div>
                  <div className="text-base font-bold text-red-700">{formatCurrency(valorTotal)}</div>
                  <div className="text-xs text-red-500">cheque + taxa</div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Modalidade da taxa</label>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => setTaxaIncorporada(true)}
                    className={`text-left p-2.5 rounded-xl border-2 transition-colors ${taxaIncorporada ? 'border-foreground bg-gray-50' : 'border-border hover:bg-gray-50'}`}>
                    <div className="text-xs font-bold">Incorporada</div>
                    <div className="text-xs text-muted-foreground mt-0.5">Entra na obrigação da operação</div>
                  </button>
                  <button type="button" onClick={() => setTaxaIncorporada(false)}
                    className={`text-left p-2.5 rounded-xl border-2 transition-colors ${!taxaIncorporada ? 'border-foreground bg-gray-50' : 'border-border hover:bg-gray-50'}`}>
                    <div className="text-xs font-bold">Separada</div>
                    <div className="text-xs text-muted-foreground mt-0.5">Cobrada à parte, com recebimento próprio</div>
                  </button>
                </div>
              </div>

              {operation && (
                <div className="text-xs text-muted-foreground bg-gray-50 rounded-lg px-3 py-2">
                  Total a receber da operação: <strong className="text-foreground">{formatCurrency(operation.total_receivable)}</strong>
                  {taxa > 0 && taxaIncorporada && <> → passará para <strong className="text-red-600">{formatCurrency(novoSaldo)}</strong></>}
                  {taxa > 0 && !taxaIncorporada && <> — a taxa <strong>não</strong> altera a operação</>}
                </div>
              )}

              <div className="flex gap-2">
                {client && (
                  <button onClick={gerarMensagemWa}
                    className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg hover:bg-emerald-100">
                    <MessageCircle className="w-3.5 h-3.5" /> Notificar WhatsApp
                  </button>
                )}
                <button onClick={() => setStep(2)}
                  className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-foreground text-white rounded-lg hover:bg-foreground/90 ml-auto">
                  Definir resolução →
                </button>
              </div>
            </div>
          </div>

          {/* Etapa 2: Forma de resolução */}
          {step >= 2 && (
            <div className="space-y-3 border-t border-border pt-5">
              <div className="flex items-center gap-2">
                <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${step >= 2 ? 'bg-foreground text-white' : 'bg-gray-200 text-gray-500'}`}>2</div>
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Forma de Resolução</span>
              </div>
              <div className="pl-7 space-y-4">
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { value: 'novo_cheque', label: '🗒️ Novo Cheque', desc: `Principal: ${formatCurrency(principal)}` },
                    { value: 'prorrogacao', label: '📅 Prorrogação', desc: 'Estender prazo + juros' },
                    { value: 'pix', label: '⚡ PIX', desc: 'Pagamento imediato' },
                    { value: 'dinheiro', label: '💵 Dinheiro', desc: 'Pagamento em espécie' },
                    { value: 'transferencia', label: '🏦 Transferência', desc: 'TED/DOC' },
                  ].map(opt => (
                    <button key={opt.value} type="button" onClick={() => setResolveType(opt.value)}
                      className={`text-left p-3 rounded-xl border-2 transition-colors ${resolveType === opt.value ? 'border-foreground bg-gray-50' : 'border-border hover:bg-gray-50'}`}>
                      <div className="text-xs font-bold">{opt.label}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">{opt.desc}</div>
                    </button>
                  ))}
                </div>

                {/* Novo cheque */}
                {resolveType === 'novo_cheque' && (
                  <div className="bg-gray-50 rounded-xl p-4 space-y-3">
                    <div className="text-xs font-semibold text-muted-foreground">Dados do novo cheque</div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1">Banco *</label>
                        <input className="input-field uppercase" placeholder="BRADESCO" value={novoBanco} onChange={e => setNovoBanco(e.target.value.toUpperCase())} />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1">Nº Cheque *</label>
                        <input className="input-field" value={novoNumero} onChange={e => setNovoNumero(e.target.value)} />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1">Valor (principal)</label>
                        <input className="input-field bg-gray-100" readOnly value={formatCurrency(principal)} />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1">Data comp. *</label>
                        <input className="input-field" type="date" value={novaData} onChange={e => setNovaData(e.target.value)} />
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      O substituto mantém o principal. A taxa {taxaIncorporada ? 'já está incorporada à obrigação' : 'é cobrada separadamente'}.
                    </p>
                  </div>
                )}

                {/* Prorrogação */}
                {resolveType === 'prorrogacao' && (
                  <div className="bg-blue-50 rounded-xl p-4 space-y-3">
                    <div className="text-xs font-semibold text-muted-foreground">Dados da prorrogação</div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1">Nova data compensação *</label>
                        <input className="input-field" type="date" min={today()} value={novaDataProrrogacao} onChange={e => setNovaDataProrrogacao(e.target.value)} />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1">Taxa mensal (%) *</label>
                        <input className="input-field" type="number" step="0.01" placeholder="4,00" value={taxaMensalProrrogacao} onChange={e => setTaxaMensalProrrogacao(e.target.value)} />
                      </div>
                    </div>
                    {diasProrrogacao > 0 && taxaProrr > 0 && (
                      <div className="bg-white border border-blue-100 rounded-lg px-3 py-2 text-xs space-y-1">
                        <div className="flex justify-between"><span className="text-muted-foreground">Período de juros</span><strong>{diasProrrogacao} dias</strong></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Juros prorrogação</span><strong>{formatCurrency(jurosProrrogacao)}</strong></div>
                        <div className="flex justify-between border-t border-blue-100 pt-1"><span className="font-semibold">Valor de face (inalterado)</span><strong className="text-blue-700">{formatCurrency(principal)}</strong></div>
                      </div>
                    )}
                  </div>
                )}

                {/* PIX / Dinheiro / Transferência */}
                {pagamento && (
                  <div className="bg-gray-50 rounded-xl p-4 space-y-3">
                    <div className="text-xs font-semibold text-muted-foreground">Dados do pagamento</div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1">Data do pagamento *</label>
                        <input className="input-field" type="date" value={dataPagamento} onChange={e => setDataPagamento(e.target.value)} />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1">Creditar no banco *</label>
                        <select className="input-field" value={bancoId} onChange={e => setBancoId(e.target.value)}>
                          <option value="">Selecionar...</option>
                          {bancos.map(b => <option key={b.id} value={b.id}>{b.name}{b.account ? ` — ${b.account}` : ''}</option>)}
                        </select>
                      </div>
                    </div>
                    <div className="text-xs font-semibold text-foreground bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2 flex justify-between">
                      <span>Total a receber</span>
                      <span className="text-emerald-700">{formatCurrency(taxaIncorporada ? valorTotal : principal)}</span>
                    </div>
                    {!taxaIncorporada && taxa > 0 && (
                      <p className="text-xs text-muted-foreground">
                        A taxa de {formatCurrency(taxa)} é cobrada em recebimento próprio.
                      </p>
                    )}
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">Observações</label>
                  <input className="input-field" placeholder="Anotações sobre a resolução..." value={notes} onChange={e => setNotes(e.target.value)} />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 pb-5 pt-3 border-t border-border shrink-0 space-y-2">
          {error && (
            <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>
          )}
          <div className="flex justify-end gap-2">
            <button onClick={onClose} className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-gray-50">Cancelar</button>
            {step >= 2 && (
              <button onClick={save} disabled={saving || !canSave}
                className="flex items-center gap-2 px-5 py-2 bg-red-600 text-white text-sm font-semibold rounded-lg disabled:opacity-50 hover:bg-red-700">
                <DollarSign className="w-3.5 h-3.5" />
                {saving ? 'Salvando...' : 'Confirmar Resolução'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}