import { useState, useRef } from 'react';
import { formatCurrency, formatDate } from '@/lib/finance';
import { X, CheckCircle, User, CreditCard, Camera, Download, ChevronDown, ChevronUp } from 'lucide-react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

const STORAGE_KEY = 'psx_company_settings';
function getSettings() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch { return {}; }
}

function formatDateShort(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('pt-BR');
}

/**
 * Modal de confirmação detalhado antes de criar uma operação.
 * Inclui aba visão cliente com lista de cheques e captura como imagem/PDF.
 */
export default function OperacaoConfirmModal({ data, onConfirm, onCancel, saving }) {
  const { client, sacado, type, grossValue, rate, interestType, netValue, totalReceivable, totalInterest,
          projectedProfit, capitalCost, schedule, startDate, lastDueDate, installments, notes,
          cheques, chequeSchedule, jurosEmbutido, calcMode } = data;

  const [tab, setTab] = useState('interno');
  const [capturing, setCapturing] = useState(false);
  const clienteRef = useRef(null);

  const settings = getSettings();
  const company = settings.company_name || 'PSX CAPITAL';
  const isCheque = type === 'cheque';
  const isBoleto = type === 'boleto';
  const opIdPreview = '--------';

  const handleCaptureImage = async () => {
    if (!clienteRef.current) return;
    setCapturing(true);
    try {
      const canvas = await html2canvas(clienteRef.current, {
        scale: 2,
        backgroundColor: '#ffffff',
        useCORS: true,
      });
      const link = document.createElement('a');
      link.download = `resumo-cliente-${(client?.name || 'cliente').replace(/\s+/g, '-').toLowerCase()}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } finally {
      setCapturing(false);
    }
  };

  const handleCapturePDF = async () => {
    if (!clienteRef.current) return;
    setCapturing(true);
    try {
      const canvas = await html2canvas(clienteRef.current, {
        scale: 2,
        backgroundColor: '#ffffff',
        useCORS: true,
      });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageW = 210;
      const pageH = 297;
      const imgW = pageW;
      const imgH = (canvas.height * imgW) / canvas.width;
      let posY = 0;
      let remaining = imgH;
      while (remaining > 0) {
        pdf.addImage(imgData, 'PNG', 0, posY, imgW, imgH);
        remaining -= pageH;
        posY -= pageH;
        if (remaining > 0) pdf.addPage();
      }
      pdf.save(`comprovante-pre-${(client?.name || 'cliente').replace(/\s+/g, '-').toLowerCase()}.pdf`);
    } finally {
      setCapturing(false);
    }
  };

  const validCheques = cheques?.filter(c => c.bank_name && c.check_number && c.value && c.compensation_date) || [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-[hsl(43,65%,47%)]" />
            <h2 className="text-base font-bold">Confirmar Operação</h2>
          </div>
          <button onClick={onCancel} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border shrink-0">
          <button
            onClick={() => setTab('interno')}
            className={`flex-1 py-3 text-sm font-semibold transition-colors border-b-2 ${tab === 'interno' ? 'border-foreground text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
          >
            Resumo Interno
          </button>
          <button
            onClick={() => setTab('cliente')}
            className={`flex-1 py-3 text-sm font-semibold transition-colors border-b-2 flex items-center justify-center gap-1.5 ${tab === 'cliente' ? 'border-emerald-600 text-emerald-700' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
          >
            <User className="w-3.5 h-3.5" /> Visão Cliente
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {tab === 'interno' && (
            <div className="p-5 space-y-4">
              {/* Client & type */}
              <div className="bg-gray-50 rounded-xl p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{isBoleto ? 'Cedente' : 'Cliente'}</span>
                  <span className="font-semibold">{client?.name}</span>
                </div>
                {isBoleto && sacado && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Sacado</span>
                    <span className="font-semibold">{sacado.name}{sacado.fantasy_name ? ` (${sacado.fantasy_name})` : ''}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Tipo</span>
                  <span className="font-semibold capitalize">{type === 'emprestimo' ? 'Empréstimo' : type === 'boleto' ? 'Boleto / Fomento' : 'Cheque / Desconto'}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Juros</span>
                  <span className="font-semibold capitalize">{interestType} — {rate}% a.m.</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Início</span>
                  <span className="font-semibold">{formatDate(startDate)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Vencimento final</span>
                  <span className="font-semibold">{formatDate(lastDueDate)}</span>
                </div>
              </div>

              {/* Financials */}
              <div className="border border-border rounded-xl overflow-hidden">
                <div className="bg-gray-50 px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-border">
                  Resumo Financeiro
                </div>
                <div className="divide-y divide-border">
                  <div className="flex justify-between px-4 py-3 text-sm">
                    <span className="text-muted-foreground">{isBoleto ? 'Total dos Boletos (Recebível)' : 'Valor Bruto / Principal'}</span>
                    <span className="font-semibold">{formatCurrency(grossValue)}</span>
                  </div>
                  {capitalCost > 0 && (
                    <div className="flex justify-between px-4 py-3 text-sm">
                      <span className="text-muted-foreground">Custo de Capital</span>
                      <span className="font-semibold text-red-600">− {formatCurrency(capitalCost)}</span>
                    </div>
                  )}
                  <div className="flex justify-between px-4 py-3 text-sm">
                    <span className="text-muted-foreground">Valor Líquido a Repassar</span>
                    <span className="font-semibold text-emerald-700">{formatCurrency(netValue)}</span>
                  </div>
                  <div className="flex justify-between px-4 py-3 text-sm">
                    <span className="text-muted-foreground">Total de Juros</span>
                    <span className="font-semibold text-[hsl(43,65%,47%)]">{formatCurrency(totalInterest)}</span>
                  </div>
                  <div className="flex justify-between px-4 py-3 text-sm bg-gray-50">
                    <span className="font-bold">Total a Receber</span>
                    <span className="font-bold text-lg">{formatCurrency(totalReceivable)}</span>
                  </div>
                  <div className="flex justify-between px-4 py-3 text-sm">
                    <span className="text-muted-foreground">Lucro Projetado</span>
                    <span className={`font-semibold ${projectedProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{formatCurrency(projectedProfit)}</span>
                  </div>
                </div>
              </div>

              {/* Schedule summary */}
              {schedule && schedule.length > 0 && (
                <div className="border border-border rounded-xl overflow-hidden">
                  <div className="bg-gray-50 px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-border">
                    {schedule.length} {schedule.length === 1 ? 'Parcela' : 'Parcelas'}
                  </div>
                  <div className="divide-y divide-border max-h-48 overflow-y-auto">
                    {schedule.map((inst, i) => (
                      <div key={i} className="flex justify-between items-center px-4 py-2.5 text-sm">
                        <span className="text-muted-foreground">{i + 1}ª — {formatDate(inst.due_date)}</span>
                        <span className="font-semibold">{formatCurrency(inst.value)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {notes && (
                <div className="text-xs text-muted-foreground bg-gray-50 rounded-xl p-3 border border-border">
                  <span className="font-semibold">Obs:</span> {notes}
                </div>
              )}
            </div>
          )}

          {tab === 'cliente' && (
            <div className="p-5 space-y-4">
              {/* Capture buttons */}
              <div className="flex gap-2 justify-end">
                <button
                  onClick={handleCaptureImage}
                  disabled={capturing}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                >
                  <Camera className="w-3.5 h-3.5" />
                  {capturing ? 'Capturando...' : 'Salvar como imagem'}
                </button>
                <button
                  onClick={handleCapturePDF}
                  disabled={capturing}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-foreground text-white rounded-lg hover:bg-foreground/90 disabled:opacity-50 transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  {capturing ? 'Gerando...' : 'Salvar como PDF'}
                </button>
              </div>

              {/* Bloco visão cliente — renderizado para captura */}
              <div ref={clienteRef} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                {/* Header escuro estilo comprovante */}
                <div className="bg-[#0f0f0f] px-6 py-5 text-center">
                  <div className="text-lg font-bold" style={{ color: '#c8a550' }}>{company}</div>
                  <div className="text-xs text-gray-400 mt-1">COMPROVANTE DE ANTECIPAÇÃO DE RECEBÍVEIS</div>
                  <div className="text-xs text-gray-500 mt-0.5">Pré-visualização — {formatDateShort(startDate)}</div>
                </div>

                {/* Banner positivo */}
                <div className="bg-[#f0f8f0] border-b border-[#c8e6c9] px-6 py-4 text-center">
                  <div className="text-sm font-bold text-[#1e6e32]">✓ Antecipação de recebíveis</div>
                  <div className="text-xs text-[#3c8251] mt-0.5">Valor disponível imediatamente conforme acordado.</div>
                </div>

                <div className="px-6 py-4 space-y-5">
                  {/* Dados do cliente */}
                  <div>
                    <div className="text-xs font-bold text-[#7a5a1e] uppercase tracking-wider mb-2 pb-1 border-b border-gray-200">{isBoleto ? 'Dados do Cedente' : 'Dados do Cliente'}</div>
                    <div className="space-y-1.5 text-sm">
                      <div className="flex">
                        <span className="w-28 text-xs text-gray-500 font-medium">{isBoleto ? 'Cedente:' : 'Cliente:'}</span>
                        <span className="font-bold text-xs">{(client?.name || '').toUpperCase()}</span>
                      </div>
                      {client?.document && (
                        <div className="flex">
                          <span className="w-28 text-xs text-gray-500 font-medium">{client?.document_type || 'CPF'}:</span>
                          <span className="text-xs">{client.document}</span>
                        </div>
                      )}
                      {client?.phone && (
                        <div className="flex">
                          <span className="w-28 text-xs text-gray-500 font-medium">Telefone:</span>
                          <span className="text-xs">{client.phone}</span>
                        </div>
                      )}
                      {client?.address && (
                        <div className="flex">
                          <span className="w-28 text-xs text-gray-500 font-medium shrink-0">Endereço:</span>
                          <span className="text-xs">{client.address}{client.city ? `, ${client.city}` : ''}{client.state ? `/${client.state}` : ''}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {isBoleto && sacado && (
                    <div>
                      <div className="text-xs font-bold text-[#7a5a1e] uppercase tracking-wider mb-2 pb-1 border-b border-gray-200">Dados do Sacado</div>
                      <div className="space-y-1.5 text-sm">
                        <div className="flex">
                          <span className="w-28 text-xs text-gray-500 font-medium">Sacado:</span>
                          <span className="font-bold text-xs">{(sacado.name || '').toUpperCase()}{sacado.fantasy_name ? ` (${sacado.fantasy_name})` : ''}</span>
                        </div>
                        {sacado.document && (
                          <div className="flex">
                            <span className="w-28 text-xs text-gray-500 font-medium">{sacado.document_type || 'CPF/CNPJ'}:</span>
                            <span className="text-xs">{sacado.document}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Resumo da operação */}
                  <div>
                    <div className="text-xs font-bold text-[#7a5a1e] uppercase tracking-wider mb-2 pb-1 border-b border-gray-200">Resumo da Operação</div>
                    <div className="rounded-lg overflow-hidden border border-gray-100">
                      {[
                        ['Tipo de Operação', isCheque ? 'Antecipação de Cheques' : isBoleto ? 'Antecipação de Boletos' : 'Crédito Antecipado'],
                        ['Data da Operação', formatDateShort(startDate)],
                        ['Vencimento Final', formatDateShort(lastDueDate)],
                        ...(isCheque ? [['Quantidade de Cheques', String(validCheques.length || schedule?.length || 1)]] : []),
                        ...(!isCheque && (installments || 1) > 1 ? [['Número de Parcelas', `${installments}x`]] : []),
                      ].map(([label, value], i) => (
                        <div key={i} className={`flex justify-between px-3 py-2 text-xs ${i % 2 === 0 ? 'bg-gray-50' : 'bg-white'}`}>
                          <span className="text-gray-500">{label}:</span>
                          <span className="font-semibold">{value}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Valores em destaque */}
                  <div>
                    <div className="text-xs font-bold text-[#7a5a1e] uppercase tracking-wider mb-2 pb-1 border-b border-gray-200">Valores</div>
                    <div className="rounded-lg overflow-hidden border border-gray-100">
                      <div className="flex justify-between px-3 py-2 text-xs bg-gray-50">
                        <span className="text-gray-500">{isCheque ? 'Valor Total dos Cheques:' : isBoleto ? 'Valor Total dos Boletos:' : 'Valor do Crédito:'}</span>
                        <span className="font-semibold">{formatCurrency(totalReceivable)}</span>
                      </div>
                      <div className="flex justify-between px-3 py-2.5 text-xs bg-[#ebfaf0] border-t border-[#c8e6c9]">
                        <span className="font-bold text-[#1e6e32]">Valor Líquido Disponibilizado:</span>
                        <span className="font-bold text-[#1e6e32] text-sm">{formatCurrency(netValue)}</span>
                      </div>
                      {(calcMode === 'juros_cedente' && totalInterest > 0) && (
                        <div className="flex justify-between px-3 py-2.5 text-xs bg-[#fff9ed] border-t border-[#f0d78c]">
                          <span className="font-medium text-[#8a6d20]">Deságio (a dever ao final):</span>
                          <span className="font-bold text-[#8a6d20] text-sm">{formatCurrency(totalInterest)}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Lista de cheques */}
                  {isCheque && validCheques.length > 0 && (
                    <div>
                      <div className="text-xs font-bold text-[#7a5a1e] uppercase tracking-wider mb-2 pb-1 border-b border-gray-200">Cheques Antecipados</div>
                      <div className="rounded-lg overflow-hidden border border-gray-100">
                        {/* Header tabela */}
                        <div className="grid grid-cols-12 gap-1 px-3 py-2 bg-[#0f0f0f] text-xs font-bold" style={{ color: '#c8a550' }}>
                          <div className="col-span-1">Nº</div>
                          <div className="col-span-3">Banco</div>
                          <div className="col-span-3">Cheque</div>
                          <div className="col-span-3">Compensação</div>
                          <div className="col-span-2 text-right">Valor</div>
                        </div>
                        {validCheques.map((chq, i) => (
                          <div key={i} className={`grid grid-cols-12 gap-1 px-3 py-2 text-xs ${i % 2 === 0 ? 'bg-gray-50' : 'bg-white'}`}>
                            <div className="col-span-1 text-gray-500">{i + 1}</div>
                            <div className="col-span-3 font-medium truncate">{chq.bank_name}</div>
                            <div className="col-span-3 font-mono">{chq.check_number}</div>
                            <div className="col-span-3">{formatDateShort(chq.compensation_date)}</div>
                            <div className="col-span-2 text-right font-semibold">{formatCurrency(parseFloat(chq.value) || 0)}</div>
                          </div>
                        ))}
                        {/* Total */}
                        <div className="flex justify-between px-3 py-2 bg-[#f5f0e1] border-t border-gray-200 text-xs font-bold">
                          <span>TOTAL</span>
                          <span>{formatCurrency(totalReceivable)}</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Parcelas (empréstimo) */}
                  {!isCheque && schedule && schedule.length > 0 && (
                    <div>
                      <div className="text-xs font-bold text-[#7a5a1e] uppercase tracking-wider mb-2 pb-1 border-b border-gray-200">Cronograma de Pagamentos</div>
                      <div className="rounded-lg overflow-hidden border border-gray-100">
                        <div className="grid grid-cols-3 px-3 py-2 bg-[#0f0f0f] text-xs font-bold" style={{ color: '#c8a550' }}>
                          <div>Nº</div>
                          <div>Vencimento</div>
                          <div className="text-right">Valor</div>
                        </div>
                        {schedule.map((inst, i) => (
                          <div key={i} className={`grid grid-cols-3 px-3 py-2 text-xs ${i % 2 === 0 ? 'bg-gray-50' : 'bg-white'}`}>
                            <div className="text-gray-500">{i + 1}ª</div>
                            <div>{formatDateShort(inst.due_date)}</div>
                            <div className="text-right font-semibold">{formatCurrency(inst.value)}</div>
                          </div>
                        ))}
                        <div className="flex justify-between px-3 py-2 bg-[#f5f0e1] border-t border-gray-200 text-xs font-bold">
                          <span>TOTAL</span>
                          <span>{formatCurrency(totalReceivable)}</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Rodapé */}
                  <div className="text-center text-xs text-gray-400 pt-2 border-t border-gray-100">
                    {company} · Documento gerado em {new Date().toLocaleDateString('pt-BR')}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-3 p-5 border-t border-border shrink-0">
          <button onClick={onCancel}
            className="flex-1 py-2.5 text-sm font-medium border border-border rounded-lg hover:bg-gray-50 transition-colors">
            Voltar e Editar
          </button>
          <button onClick={onConfirm} disabled={saving}
            className="flex-1 py-2.5 bg-foreground text-primary-foreground text-sm font-semibold rounded-lg hover:bg-foreground/90 disabled:opacity-50 transition-colors">
            {saving ? 'Criando...' : 'Confirmar e Criar'}
          </button>
        </div>
      </div>
    </div>
  );
}