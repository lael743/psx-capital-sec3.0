import { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { formatCurrency } from '@/lib/finance';
import { maskCpfCnpj } from '@/lib/masks';
import { calcAntecipacaoAssinatura } from '@/lib/assinaturaCalc';
import { captureElementAsImage, captureElementAsPdf } from '@/lib/captureElement';
import { Plus, Trash2, Search, Users, AlertTriangle, ImageDown, FileDown, Loader2, Calculator } from 'lucide-react';

const CICLO_LABEL = {
  DAILY: 'Diária',
  WEEKLY: 'Semanal',
  BIWEEKLY: 'Quinzenal',
  MONTHLY: 'Mensal',
  QUARTERLY: 'Trimestral',
  SEMIANNUALLY: 'Semestral',
  YEARLY: 'Anual',
};

const BILLING_LABEL = {
  PIX: 'PIX',
  BOLETO: 'Boleto',
  CREDIT_CARD: 'Cartão de Crédito',
};

function round2(v) { return Math.round(v * 100) / 100; }

export default function StepAssinatura({ form, setForm }) {
  const [search, setSearch] = useState('');
  const [filtered, setFiltered] = useState([]);
  const [searching, setSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [capturing, setCapturing] = useState(null);
  const resumoRef = useRef(null);
  const reqToken = useRef(0);

  const assinantes = Array.isArray(form.assinatura_sacados) ? form.assinatura_sacados : [];
  const simulacao = !!form.assinatura_simulacao;
  const simQtd = parseInt(form.assinatura_sim_qtd) || 0;

  // Busca no servidor (regex case-insensitive) — localiza qualquer sacado cadastrado,
  // independentemente da quantidade de registros.
  useEffect(() => {
    const q = search.trim();
    if (!q) { setFiltered([]); setSearching(false); return; }
    const token = ++reqToken.current;
    setSearching(true);
    const digits = q.replace(/\D/g, '');
    const orClauses = [{ nome: { $regex: q, $options: 'i' } }];
    if (digits.length >= 3) orClauses.push({ document: { $regex: digits, $options: 'i' } });
    const handle = setTimeout(() => {
      base44.entities.Sacado.filter({ $or: orClauses }, 'nome', 30, 0)
        .then((res) => { if (token === reqToken.current) setFiltered(Array.isArray(res) ? res : []); })
        .catch(() => { if (token === reqToken.current) setFiltered([]); })
        .finally(() => { if (token === reqToken.current) setSearching(false); });
    }, 300);
    return () => clearTimeout(handle);
  }, [search]);

  const addSacado = (s) => {
    const exists = assinantes.find((a) => a.sacado_doc === s.document);
    if (exists) return;
    setForm((f) => ({
      ...f,
      assinatura_sacados: [
        ...(f.assinatura_sacados || []),
        { sacado_id: s.id || '', sacado_name: s.nome || '', sacado_doc: s.document || '', valor_assinatura: f.assinatura_valor || 0 },
      ],
    }));
    setSearch('');
    setShowResults(false);
  };

  const addManual = () => {
    if (!search.trim()) return;
    setForm((f) => ({
      ...f,
      assinatura_sacados: [
        ...(f.assinatura_sacados || []),
        { sacado_id: '', sacado_name: search.toUpperCase(), sacado_doc: '', valor_assinatura: f.assinatura_valor || 0 },
      ],
    }));
    setSearch('');
    setShowResults(false);
  };

  const removeSacado = (idx) => {
    setForm((f) => ({ ...f, assinatura_sacados: (f.assinatura_sacados || []).filter((_, i) => i !== idx) }));
  };

  const updateValor = (idx, valor) => {
    setForm((f) => ({
      ...f,
      assinatura_sacados: (f.assinatura_sacados || []).map((a, i) => i === idx ? { ...a, valor_assinatura: valor } : a),
    }));
  };

  const setAllValor = (valor) => {
    setForm((f) => ({
      ...f,
      assinatura_valor: valor,
      assinatura_sacados: (f.assinatura_sacados || []).map((a) => ({ ...a, valor_assinatura: valor })),
    }));
  };

  const ciclo = form.assinatura_ciclo || 'MONTHLY';
  const billingType = form.assinatura_billing_type || 'BOLETO';
  const prazoTipo = form.assinatura_prazo_tipo || 'indefinido';
  const numCiclos = parseInt(form.assinatura_num_ciclos) || 0;
  const taxa = parseFloat(form.rate) || 0;
  const tarifaOperacao = parseFloat(form.tarifa_operacao) || 0;
  const tarifaPorTitulo = parseFloat(form.tarifa_por_titulo) || 0;
  const floatDias = parseFloat(form.float_dias) || 0;

  const numAssinantes = simulacao ? simQtd : assinantes.length;
  const valorPorAssinante = parseFloat(form.assinatura_valor) || 0;
  const totalPorCiclo = simulacao
    ? round2(valorPorAssinante * simQtd)
    : assinantes.reduce((s, a) => s + (parseFloat(a.valor_assinatura) || 0), 0);

  const calc = calcAntecipacaoAssinatura({
    totalPorCiclo,
    numCiclos,
    ciclo,
    rate: taxa,
    interestType: form.interest_type || 'simples',
    arredondarTaxaDiaria: form.arredondar_taxa_diaria || false,
    tarifaOperacao,
    tarifaPorTitulo,
    numAssinantes,
    floatDias,
  });
  const valorAntecipacao = calc.valorAntecipacao;
  const totalReceivable = calc.totalReceivable;
  const totalDesagio = calc.totalDesagio;
  const totalTarifas = calc.totalTarifas;

  // Sincroniza o valor antecipado calculado no form (usado no save)
  useEffect(() => {
    setForm((f) => (f.valor_antecipacao === valorAntecipacao ? f : { ...f, valor_antecipacao: valorAntecipacao }));
  }, [valorAntecipacao]);

  const showResumo = simulacao ? (simQtd > 0 && valorPorAssinante > 0 && numCiclos > 0) : assinantes.length > 0;

  const handleCaptureImage = async () => {
    if (!resumoRef.current) return;
    setCapturing('image');
    try { await captureElementAsImage(resumoRef.current, 'estimativa-assinatura.png'); } catch (e) { console.error(e); }
    setCapturing(null);
  };
  const handleCapturePdf = async () => {
    if (!resumoRef.current) return;
    setCapturing('pdf');
    try { await captureElementAsPdf(resumoRef.current, 'estimativa-assinatura.pdf'); } catch (e) { console.error(e); }
    setCapturing(null);
  };

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-sm font-bold mb-1">Assinaturas (Asaas)</h3>
        <p className="text-xs text-muted-foreground">
          Adicione os sacados/assinantes que pagarão por assinatura recorrente. O PSX adianta o valor ao cedente e as assinaturas amortizam o saldo devedor.
        </p>
      </div>

      {/* Configuração da assinatura */}
      <div className="border border-border rounded-xl p-4 space-y-4 bg-gray-50/50">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Valor da Assinatura ({simulacao ? 'por assinante' : 'por sacado'}) *</label>
            <input type="number" step="0.01" className="input-field" value={form.assinatura_valor || ''} onChange={(e) => setAllValor(parseFloat(e.target.value) || 0)} placeholder="0,00" />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Ciclo de Cobrança *</label>
            <select className="input-field" value={ciclo} onChange={(e) => setForm((f) => ({ ...f, assinatura_ciclo: e.target.value }))}>
              {Object.entries(CICLO_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Método de Cobrança *</label>
            <select className="input-field" value={billingType} onChange={(e) => setForm((f) => ({ ...f, assinatura_billing_type: e.target.value }))}>
              {Object.entries(BILLING_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Prazo da Assinatura *</label>
            <select className="input-field" value={prazoTipo} onChange={(e) => setForm((f) => ({ ...f, assinatura_prazo_tipo: e.target.value }))}>
              <option value="indefinido">Indefinido (cancelamento manual)</option>
              <option value="definido">Definido (encerra ao atingir os ciclos)</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Período de Cálculo (ciclos) *</label>
            <input type="number" min="1" className="input-field" value={form.assinatura_num_ciclos || ''} onChange={(e) => setForm((f) => ({ ...f, assinatura_num_ciclos: parseInt(e.target.value) || 0 }))} placeholder="12" />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Valor Antecipado ao Cedente (calculado)</label>
            <div className="input-field bg-gray-50 flex items-center justify-between cursor-not-allowed">
              <span className="font-semibold tabular-nums">{formatCurrency(valorAntecipacao)}</span>
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">auto</span>
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">Deságio (taxa {taxa}% × {numCiclos || 0} ciclos) + tarifas/float descontados.</p>
          </div>
        </div>

        {billingType === 'CREDIT_CARD' && (
          <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            Cartão de crédito requer tokenização via Asaas.js. A criação da assinatura falhará até que a tokenização seja configurada.
          </div>
        )}

        {/* Toggle Simulação */}
        <label className="flex items-start gap-2.5 cursor-pointer select-none bg-amber-50/50 border border-amber-200 rounded-lg px-3 py-2.5">
          <input
            type="checkbox"
            checked={simulacao}
            onChange={(e) => setForm((f) => ({ ...f, assinatura_simulacao: e.target.checked }))}
            className="w-4 h-4 mt-0.5 rounded border-border text-[hsl(43,65%,47%)] focus:ring-[hsl(43,65%,47%)] shrink-0"
          />
          <span className="text-xs">
            <span className="font-semibold text-foreground flex items-center gap-1.5"><Calculator className="w-3.5 h-3.5" /> Simular Operação</span>
            <span className="block text-muted-foreground mt-0.5">Gere uma estimativa informando apenas a quantidade de assinantes.</span>
          </span>
        </label>

        {/* Quantidade para simulação */}
        {simulacao && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Nº de Assinantes (simulação) *</label>
              <input type="number" min="1" className="input-field" value={form.assinatura_sim_qtd || ''} onChange={(e) => setForm((f) => ({ ...f, assinatura_sim_qtd: parseInt(e.target.value) || 0 }))} placeholder="100" />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Total / Ciclo (calculado)</label>
              <div className="input-field bg-gray-50 flex items-center justify-between cursor-not-allowed">
                <span className="font-semibold tabular-nums">{formatCurrency(totalPorCiclo)}</span>
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">auto</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Busca e lista de assinantes — apenas fora da simulação */}
      {!simulacao && (
        <>
          <div className="relative">
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Adicionar Assinantes (Sacados) *</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input type="text" className="input-field pl-9" value={search} onChange={(e) => { setSearch(e.target.value); setShowResults(true); }} onFocus={() => setShowResults(true)} onBlur={() => setTimeout(() => setShowResults(false), 150)} placeholder="Buscar por nome ou CPF/CNPJ..." />
            </div>
            {showResults && search.trim() && (
              <div className="absolute z-20 mt-1 w-full bg-white border border-border rounded-lg shadow-lg max-h-60 overflow-auto">
                {searching ? (
                  <div className="px-3 py-3 text-xs text-muted-foreground flex items-center gap-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Buscando sacados...
                  </div>
                ) : filtered.length > 0 ? (
                  filtered.map((s) => (
                    <button key={s.id} type="button" onMouseDown={() => addSacado(s)} className="w-full text-left px-3 py-2 hover:bg-gray-50 text-xs border-b border-border last:border-0">
                      <div className="font-semibold uppercase">{s.nome}</div>
                      <div className="text-muted-foreground font-mono">{maskCpfCnpj(s.document)}</div>
                    </button>
                  ))
                ) : (
                  <button type="button" onMouseDown={addManual} className="w-full text-left px-3 py-2 hover:bg-gray-50 text-xs flex items-center gap-2">
                    <Plus className="w-3.5 h-3.5 text-[hsl(43,65%,47%)]" />
                    <span>Adicionar "<strong>{search}</strong>" como novo assinante</span>
                  </button>
                )}
              </div>
            )}
          </div>

          {assinantes.length > 0 ? (
            <div className="border border-border rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50 border-b border-border">
                      <th className="px-3 py-2.5 text-left font-semibold text-muted-foreground uppercase tracking-wider">#</th>
                      <th className="px-3 py-2.5 text-left font-semibold text-muted-foreground uppercase tracking-wider">Assinante</th>
                      <th className="px-3 py-2.5 text-left font-semibold text-muted-foreground uppercase tracking-wider">CPF/CNPJ</th>
                      <th className="px-3 py-2.5 text-right font-semibold text-muted-foreground uppercase tracking-wider">Valor / Ciclo</th>
                      <th className="px-3 py-2.5"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {assinantes.map((a, i) => (
                      <tr key={i} className="hover:bg-gray-50/50">
                        <td className="px-3 py-2 text-muted-foreground font-medium">{i + 1}</td>
                        <td className="px-3 py-2 font-medium uppercase">{a.sacado_name}</td>
                        <td className="px-3 py-2 font-mono text-muted-foreground">{maskCpfCnpj(a.sacado_doc) || '—'}</td>
                        <td className="px-3 py-2">
                          <input type="number" step="0.01" className="w-full px-2 py-1 text-xs text-right border border-border rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-ring" value={a.valor_assinatura || ''} onChange={(e) => updateValor(i, parseFloat(e.target.value) || 0)} />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <button onClick={() => removeSacado(i)} className="p-1 rounded text-red-400 hover:bg-red-50 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
              <Users className="w-3.5 h-3.5 shrink-0" />
              Nenhum assinante adicionado. Busque e adicione sacados acima.
            </div>
          )}
        </>
      )}

      {/* Resumo + exportação */}
      {showResumo && (
        <>
          <div ref={resumoRef} className="bg-white border border-border rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{simulacao ? 'Resumo da Estimativa' : 'Resumo'}</h4>
              {simulacao && <span className="text-[10px] font-bold bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full uppercase tracking-wider">Simulação</span>}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <div className="bg-gray-50 border border-border rounded-xl p-3">
                <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Assinantes</div>
                <div className="text-lg font-bold mt-0.5">{numAssinantes}</div>
              </div>
              <div className="bg-gray-50 border border-border rounded-xl p-3">
                <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Total a Receber</div>
                <div className="text-lg font-bold mt-0.5 tabular-nums">{formatCurrency(totalReceivable)}</div>
              </div>
              <div className="bg-gray-50 border border-border rounded-xl p-3">
                <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Deságio</div>
                <div className="text-lg font-bold mt-0.5 tabular-nums text-red-600">{formatCurrency(totalDesagio)}</div>
              </div>
              <div className="bg-gray-50 border border-border rounded-xl p-3">
                <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Tarifas</div>
                <div className="text-lg font-bold mt-0.5 tabular-nums text-red-600">{formatCurrency(totalTarifas)}</div>
              </div>
              <div className="bg-gray-50 border border-border rounded-xl p-3">
                <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Valor Antecipado</div>
                <div className="text-lg font-bold mt-0.5 tabular-nums text-emerald-600">{formatCurrency(valorAntecipacao)}</div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button onClick={handleCaptureImage} disabled={!!capturing} className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border border-border rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors">
              {capturing === 'image' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImageDown className="w-3.5 h-3.5" />}
              Exportar Imagem
            </button>
            <button onClick={handleCapturePdf} disabled={!!capturing} className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border border-border rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors">
              {capturing === 'pdf' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileDown className="w-3.5 h-3.5" />}
              Exportar PDF
            </button>
          </div>
        </>
      )}
    </div>
  );
}