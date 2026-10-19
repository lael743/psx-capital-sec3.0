import { useState, useMemo, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight, Plus, Trash2, Send, ChevronDown, ChevronUp,
  Search, X, PanelRight, BookmarkPlus, FolderOpen
} from 'lucide-react';
import { base44 } from '@/api/base44Client';
import {
  calcInstallmentScheduleByDates,
  generateDueDates,
  daysBetween,
  formatCurrency,
  today,
} from '@/lib/finance';
import SimuladorDrawer from '@/components/simulador/SimuladorDrawer';
import SimuladorPainelLateral from '@/components/simulador/SimuladorPainelLateral';
import SimulacaoSalvaModal from '@/components/simulador/SimulacaoSalvaModal';
import CriarOperacaoModal from '@/components/simulador/CriarOperacaoModal';

const STORAGE_KEY = 'psx_company_settings';

const DEFAULT_SCENARIO = {
  label: 'Cenário 1',
  type: 'cheque',
  gross_value: '',
  rate: '',
  interest_type: 'simples',
  start_date: today(),
  due_date: '',
  installments: 1,
  interval_days: 30,
  first_due_date: '',
  capital_cost: '',
  juros_embutido: false,
  calc_mode: 'padrao', // 'padrao' | 'inverso' | 'desconto_direto'
};

function getSettings() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch { return {}; }
}

// Resolve calc_mode levando em conta legado juros_embutido
function resolveCalcMode(s) {
  if (s.calc_mode) return s.calc_mode;
  if (s.juros_embutido) return 'inverso';
  return 'padrao';
}

export function calcScenario(s) {
  const gross = parseFloat(s.gross_value) || 0;
  const rate = parseFloat(s.rate) || 0;
  const capitalCost = parseFloat(s.capital_cost) || 0;
  if (!gross || !rate || !s.start_date || !s.due_date) return null;

  const calcMode = resolveCalcMode(s);

  if (s.type === 'cheque') {
    const days = daysBetween(s.start_date, s.due_date);
    if (days <= 0) return null;
    const taxaProporcional = (rate / 100) * (days / 30);
    let principal, interest, totalReceivable;

    if (calcMode === 'inverso') {
      // gross = valor do cheque (recebível); líquido = cheque × (1 - taxa)
      principal = Math.round(gross * (1 - taxaProporcional) * 100) / 100;
      interest = Math.round((gross - principal) * 100) / 100;
      totalReceivable = gross;
    } else if (calcMode === 'desconto_direto') {
      // gross = valor bruto (cheque); desconto = bruto × taxa; líquido = bruto - desconto
      interest = Math.round(gross * taxaProporcional * 100) / 100;
      principal = Math.round((gross - interest) * 100) / 100;
      totalReceivable = gross;
    } else {
      // padrao: gross = líquido; cheque = líquido / (1 - taxa)
      principal = gross;
      totalReceivable = Math.round((gross / (1 - taxaProporcional)) * 100) / 100;
      interest = Math.round((totalReceivable - principal) * 100) / 100;
    }
    const netValue = principal - capitalCost;
    const projectedProfit = totalReceivable - principal - capitalCost;
    const roi = netValue > 0 ? (projectedProfit / netValue) * 100 : 0;
    return { days, gross, principal, interest, totalReceivable, netValue, projectedProfit, roi, schedule: [], calcMode };
  }

  // emprestimo — cálculo por parcela conforme o calcMode
  const days = daysBetween(s.start_date, s.due_date);
  if (days <= 0) return null;
  const n = Math.max(1, parseInt(s.installments) || 1);
  const interval = Math.max(1, parseInt(s.interval_days) || 30);
  const dueDates = generateDueDates(s.start_date, n, interval, s.first_due_date || null);

  // schedule usa o novo calcInstallmentScheduleByDates com calcMode
  const schedule = calcInstallmentScheduleByDates(gross, rate, s.interest_type, s.start_date, dueDates, 'price', calcMode);
  const totalReceivable = Math.round(schedule.reduce((a, x) => a + x.value, 0) * 100) / 100;
  const principalBase = calcMode === 'inverso'
    ? Math.round(schedule.reduce((a, x) => a + x.principal, 0) * 100) / 100  // net value (sum of principals)
    : gross;

  const interest = Math.round((totalReceivable - principalBase) * 100) / 100;
  const netValue = principalBase - capitalCost;
  const projectedProfit = Math.round((totalReceivable - principalBase - capitalCost) * 100) / 100;
  const roi = netValue > 0 ? (projectedProfit / netValue) * 100 : 0;
  const installmentValue = schedule[0]?.value || (totalReceivable / n);
  return { days, gross, principal: principalBase, interest, totalReceivable, netValue, projectedProfit, roi, schedule, installmentValue, calcMode };
}

// ---- Client Search ----
function ClientSearchInput({ value, onChange }) {
  const [search, setSearch] = useState('');
  const [clients, setClients] = useState([]);
  const [open, setOpen] = useState(false);
  const ref = useRef();

  useEffect(() => {
    if (!search || search.length < 2) { setClients([]); setOpen(false); return; }
    base44.entities.Client.list('-created_date', 100).then(all => {
      const filtered = all.filter(c =>
        c.name?.toLowerCase().includes(search.toLowerCase()) || c.document?.includes(search)
      );
      setClients(filtered.slice(0, 8));
      setOpen(true);
    });
  }, [search]);

  useEffect(() => {
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          className="input-field pl-9 pr-9"
          placeholder="Buscar cliente (opcional)..."
          value={value ? value.name : search}
          onChange={e => { setSearch(e.target.value); if (value) onChange(null); }}
          onFocus={() => { if (clients.length) setOpen(true); }}
        />
        {value && (
          <button className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            onClick={() => { onChange(null); setSearch(''); }}>
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      {open && clients.length > 0 && (
        <div className="absolute z-50 top-full mt-1 w-full bg-white border border-border rounded-xl shadow-lg max-h-52 overflow-y-auto">
          {clients.map(c => (
            <button key={c.id} className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 flex items-center justify-between"
              onClick={() => { onChange(c); setSearch(''); setOpen(false); }}>
              <span className="font-medium">{c.name}</span>
              <span className="text-xs text-muted-foreground">{c.document}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---- Scenario Card ----
function ScenarioCard({ scenario, index, onChange, onRemove, canRemove }) {
  const [expanded, setExpanded] = useState(true);
  const result = useMemo(() => calcScenario(scenario), [scenario]);
  const set = (k, v) => onChange({ ...scenario, [k]: v });
  const isCheque = scenario.type === 'cheque';

  return (
    <div className="bg-white border border-border rounded-xl overflow-hidden shadow-sm">
      {/* Header */}
      <div
        className="flex items-center justify-between px-5 py-3.5 border-b border-border bg-gray-50 cursor-pointer select-none"
        onClick={() => setExpanded(v => !v)}
      >
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-full bg-foreground text-primary-foreground text-xs font-bold flex items-center justify-center shrink-0">
            {index + 1}
          </div>
          <input
            className="text-sm font-semibold bg-transparent border-none outline-none"
            value={scenario.label}
            onClick={e => e.stopPropagation()}
            onChange={e => set('label', e.target.value)}
          />
          {result && (
            <span className="text-xs text-muted-foreground hidden sm:block">
              → {formatCurrency(result.totalReceivable)} · ROI {result.roi.toFixed(1)}%
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {canRemove && (
            <button onClick={e => { e.stopPropagation(); onRemove(); }}
              className="p-1.5 rounded-lg hover:bg-red-50 text-red-400 hover:text-red-600 transition-colors">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
          {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </div>
      </div>

      {expanded && (
        <div className="p-5 space-y-4">
          {/* Campos */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Tipo</label>
              <select className="input-field" value={scenario.type} onChange={e => set('type', e.target.value)}>
                <option value="cheque">Cheque</option>
                <option value="emprestimo">Empréstimo</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Tipo de Juros</label>
              <select className="input-field" value={scenario.interest_type} onChange={e => set('interest_type', e.target.value)}>
                <option value="simples">Simples</option>
                <option value="composto">Composto</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                {(() => {
                  const mode = scenario.calc_mode || (scenario.juros_embutido ? 'inverso' : 'padrao');
                  if (isCheque) {
                    if (mode === 'inverso') return 'Valor do Cheque (R$)';
                    if (mode === 'desconto_direto') return 'Valor Bruto do Cheque (R$)';
                    return 'Valor Líquido (R$)';
                  }
                  if (mode === 'inverso') return 'Total a Receber / Recebível (R$)';
                  return 'Valor Líquido (R$)';
                })()}
              </label>
              <input className="input-field" type="number" step="0.01" value={scenario.gross_value}
                onChange={e => set('gross_value', e.target.value)} placeholder="0,00" />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Taxa Mensal (%)</label>
              <input className="input-field" type="number" step="0.01" value={scenario.rate}
                onChange={e => set('rate', e.target.value)} placeholder="5,00" />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Data de Início</label>
              <input className="input-field" type="date" value={scenario.start_date}
                onChange={e => set('start_date', e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Data de Vencimento</label>
              <input className="input-field" type="date" value={scenario.due_date}
                onChange={e => set('due_date', e.target.value)} />
            </div>
            {!isCheque && (
              <>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">Nº de Parcelas</label>
                  <input className="input-field" type="number" min="1" max="120" value={scenario.installments}
                    onChange={e => set('installments', e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">Intervalo (dias)</label>
                  <input className="input-field" type="number" min="1" value={scenario.interval_days}
                    onChange={e => set('interval_days', e.target.value)} placeholder="30" />
                </div>
                {parseInt(scenario.installments) > 1 && (
                  <div className="col-span-2 sm:col-span-2">
                    <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                      Vencimento 1ª Parcela <span className="font-normal">(opcional)</span>
                    </label>
                    <input className="input-field" type="date" value={scenario.first_due_date || ''}
                      onChange={e => set('first_due_date', e.target.value)} />
                    {scenario.first_due_date && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Demais parcelas a cada {scenario.interval_days} dias a partir desta data.
                      </p>
                    )}
                  </div>
                )}
              </>
            )}
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Custo de Capital (R$)</label>
              <input className="input-field" type="number" step="0.01" value={scenario.capital_cost}
                onChange={e => set('capital_cost', e.target.value)} placeholder="0,00" />
            </div>
          </div>

          {/* Modo de cálculo */}
          {(() => {
            const mode = scenario.calc_mode || (scenario.juros_embutido ? 'inverso' : 'padrao');
            const MODES = isCheque ? [
              { value: 'padrao', label: 'Padrão', desc: 'Informe o líquido → sistema calcula o cheque: líquido ÷ (1 − taxa)' },
              { value: 'inverso', label: 'Juros embutido', desc: 'Informe o valor do cheque → sistema calcula o líquido: cheque × (1 − taxa)' },
              { value: 'desconto_direto', label: 'Desconto direto', desc: 'Informe o bruto → desconto = bruto × taxa; líquido = bruto − desconto' },
            ] : [
              { value: 'padrao', label: 'Padrão', desc: 'Informe o bruto a liberar → sistema calcula o recebível: bruto ÷ (1 − taxa)' },
              { value: 'inverso', label: 'De trás pra frente', desc: 'Informe o recebível → sistema calcula o bruto a liberar: recebível × (1 − taxa)' },
              { value: 'desconto_direto', label: 'Desconto direto', desc: 'Informe o bruto por parcela → recebível = bruto; líquido = bruto − bruto × taxa × dias/30' },
            ];
            const active = MODES.find(m => m.value === mode) || MODES[0];
            return (
              <div className="space-y-1.5">
                <div className="flex gap-2">
                  {MODES.map(m => (
                    <button
                      key={m.value}
                      type="button"
                      onClick={() => set('calc_mode', m.value)}
                      className={`flex-1 px-2 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${mode === m.value ? 'bg-foreground text-primary-foreground border-foreground' : 'bg-white text-muted-foreground border-border hover:bg-gray-50'}`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground px-0.5">{active.desc}</p>
              </div>
            );
          })()}

          {/* Resultado inline */}
          {result ? (
            <div className="bg-foreground text-primary-foreground rounded-xl p-4 grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div>
                <div className="text-xs opacity-60 mb-0.5">Prazo</div>
                <div className="font-semibold">{result.days}d</div>
              </div>
              <div>
                <div className="text-xs opacity-60 mb-0.5">Líquido ao Cliente</div>
                <div className="font-semibold">{formatCurrency(result.netValue)}</div>
              </div>
              <div>
                <div className="text-xs opacity-60 mb-0.5">Juros ({scenario.interest_type})</div>
                <div className="font-semibold text-[hsl(43,80%,60%)]">{formatCurrency(result.interest)}</div>
              </div>
              <div>
                <div className="text-xs opacity-60 mb-0.5">
                  {isCheque && resolveCalcMode(scenario) === 'inverso' ? 'Total Cheques' : 'Total a Receber'}
                </div>
                <div className="text-xl font-bold text-[hsl(43,80%,60%)]">{formatCurrency(result.totalReceivable)}</div>
              </div>
              <div>
                <div className="text-xs opacity-60 mb-0.5">Lucro Projetado</div>
                <div className="font-bold text-emerald-400">{formatCurrency(result.projectedProfit)}</div>
              </div>
              <div>
                <div className="text-xs opacity-60 mb-0.5">ROI</div>
                <div className="font-bold text-emerald-400">{result.roi.toFixed(2)}%</div>
              </div>
              {!isCheque && parseInt(scenario.installments) > 1 && (
                <div>
                  <div className="text-xs opacity-60 mb-0.5">Por Parcela</div>
                  <div className="font-semibold">{formatCurrency(result.installmentValue)} × {scenario.installments}x</div>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-gray-50 border border-border rounded-xl p-4 text-center text-xs text-muted-foreground">
              Preencha valor, taxa e datas para ver o resultado
            </div>
          )}

          {/* Cronograma parcelas emprestimo */}
          {result?.schedule?.length > 1 && (
            <div className="border border-border rounded-xl overflow-hidden">
              <div className="px-4 py-2.5 border-b border-border bg-gray-50 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Cronograma de Parcelas
              </div>
              <div className="divide-y divide-border max-h-52 overflow-y-auto">
                <div className="grid grid-cols-4 border-b border-border bg-gray-50/80">
                  {['#', 'Vencimento', 'Juros', 'Valor'].map(h => (
                    <div key={h} className="px-4 py-2 text-xs font-medium text-muted-foreground text-right first:text-left">{h}</div>
                  ))}
                </div>
                {result.schedule.map(inst => (
                  <div key={inst.number} className="grid grid-cols-4 text-sm">
                    <div className="px-4 py-2.5 text-muted-foreground">{inst.number}ª</div>
                    <div className="px-4 py-2.5 text-right">{new Date(inst.due_date + 'T00:00:00').toLocaleDateString('pt-BR')}</div>
                    <div className="px-4 py-2.5 text-right text-[hsl(43,65%,47%)]">{formatCurrency(inst.interest)}</div>
                    <div className="px-4 py-2.5 text-right font-medium">{formatCurrency(inst.value)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---- Main Page ----
export default function Simulador() {
  const navigate = useNavigate();
  const [scenarios, setScenarios] = useState([{ ...DEFAULT_SCENARIO }]);
  const [linkedClient, setLinkedClient] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [salvaModalOpen, setSalvaModalOpen] = useState(false);
  const [criarOpModalOpen, setCriarOpModalOpen] = useState(false);
  const [sendTo, setSendTo] = useState('');
  const [sendName, setSendName] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const settings = getSettings();
  const results = scenarios.map(s => calcScenario(s));
  const firstResult = results.find(Boolean);

  const addScenario = () => setScenarios(s => [...s, { ...DEFAULT_SCENARIO, label: `Cenário ${s.length + 1}` }]);
  const updateScenario = (i, val) => setScenarios(s => s.map((x, idx) => idx === i ? val : x));
  const removeScenario = (i) => setScenarios(s => s.filter((_, idx) => idx !== i));

  const canSend = sendTo && sendTo.includes('@') && firstResult;

  const sendProposal = async () => {
    if (!canSend) return;
    setSending(true);
    const clientLine = linkedClient ? `Cliente: ${linkedClient.name}\n` : '';
    const lines = scenarios.map((s, i) => {
      const r = results[i];
      if (!r) return `**${s.label}**: dados incompletos`;
      const installInfo = s.type === 'emprestimo' && parseInt(s.installments) > 1
        ? `\n- Parcelas: ${s.installments}x de ${formatCurrency(r.installmentValue)} (a cada ${s.interval_days} dias)`
        : '';
      return `**${s.label}** (${s.type === 'cheque' ? 'Cheque' : 'Empréstimo'} · Juros ${s.interest_type})\n- Valor Líquido: ${formatCurrency(r.netValue)}\n- Taxa: ${s.rate}% a.m.\n- Prazo: ${r.days} dias\n- Total a Receber: ${formatCurrency(r.totalReceivable)}${installInfo}`;
    }).join('\n\n');

    const body = `Olá${sendName || linkedClient?.name ? ` ${sendName || linkedClient?.name}` : ''}!\n\n${clientLine}Segue a proposta de operação financeira:\n\n${lines}\n\nAtenciosamente,\n${settings.company_name || 'PSX Capital'}`;
    await base44.integrations.Core.SendEmail({ to: sendTo, subject: 'Proposta de Operação Financeira', body });
    setSending(false);
    setSent(true);
    setTimeout(() => setSent(false), 3000);
  };

  return (
    <div className="p-4 md:p-6 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3 mb-5 shrink-0">
        <div>
          <h1 className="text-2xl font-bold">Simulador de Operação</h1>
          <p className="text-sm text-muted-foreground">Compare cenários antes de criar uma operação</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={addScenario}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium border border-border rounded-lg hover:bg-gray-50 transition-colors">
            <Plus className="w-4 h-4" /> Novo Cenário
          </button>
          <button onClick={() => setSalvaModalOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium border border-border rounded-lg hover:bg-gray-50 transition-colors">
            <FolderOpen className="w-4 h-4" /> Salvas
          </button>
          {firstResult && (
            <button onClick={() => setCriarOpModalOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-foreground text-primary-foreground text-sm font-medium rounded-lg hover:bg-foreground/90 transition-colors">
              Criar Operação <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Layout: formulário + painel lateral */}
      <div className="flex-1 flex gap-5 min-h-0 overflow-hidden">

        {/* Coluna principal */}
        <div className="flex-1 min-w-0 overflow-y-auto pb-6 space-y-4">

          {/* Vincular cliente */}
          <div className="bg-white border border-border rounded-xl p-4">
            <label className="block text-xs font-medium text-muted-foreground mb-2">Vincular Cliente à Simulação</label>
            <ClientSearchInput value={linkedClient} onChange={setLinkedClient} />
            {linkedClient && (
              <div className="mt-2 text-xs text-muted-foreground">
                Cliente selecionado: <span className="font-semibold text-foreground">{linkedClient.name}</span> · {linkedClient.document}
                {linkedClient.default_rate && (
                  <span className="ml-2">· Taxa padrão: <strong className="text-[hsl(43,65%,47%)]">{linkedClient.default_rate}% a.m.</strong></span>
                )}
              </div>
            )}
          </div>

          {/* Cenários */}
          {scenarios.map((s, i) => (
            <ScenarioCard key={i} scenario={s} index={i}
              onChange={val => updateScenario(i, val)}
              onRemove={() => removeScenario(i)}
              canRemove={scenarios.length > 1}
            />
          ))}

          {/* Comparativo */}
          {scenarios.length > 1 && results.some(Boolean) && (
            <div className="bg-white border border-border rounded-xl overflow-hidden shadow-sm">
              <div className="px-5 py-3.5 border-b border-border bg-gray-50">
                <h3 className="text-sm font-semibold">Comparativo de Cenários</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-gray-50/80">
                      {['Cenário', 'Prazo', 'Total a Receber', 'Juros', 'Lucro', 'ROI'].map(h => (
                        <th key={h} className="px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase text-left last:text-right">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {scenarios.map((s, i) => {
                      const r = results[i];
                      if (!r) return (
                        <tr key={i} className="opacity-40">
                          <td className="px-4 py-2.5 font-medium">{s.label}</td>
                          <td colSpan={5} className="px-4 py-2.5 text-center text-xs text-muted-foreground">Dados incompletos</td>
                        </tr>
                      );
                      const bestROI = Math.max(...results.filter(Boolean).map(r => r.roi));
                      return (
                        <tr key={i} className={r.roi === bestROI && results.filter(Boolean).length > 1 ? 'bg-emerald-50' : ''}>
                          <td className="px-4 py-2.5 font-semibold">
                            {s.label}
                            {r.roi === bestROI && results.filter(Boolean).length > 1 && (
                              <span className="ml-2 text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full font-bold">Melhor ROI</span>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-muted-foreground">{r.days}d</td>
                          <td className="px-4 py-2.5 font-bold text-[hsl(43,65%,47%)]">{formatCurrency(r.totalReceivable)}</td>
                          <td className="px-4 py-2.5 text-muted-foreground">{formatCurrency(r.interest)}</td>
                          <td className="px-4 py-2.5 font-semibold text-emerald-600">{formatCurrency(r.projectedProfit)}</td>
                          <td className="px-4 py-2.5 font-bold text-right">{r.roi.toFixed(2)}%</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Enviar proposta */}
          {firstResult && (
            <div className="bg-white border border-border rounded-xl p-5 space-y-4">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Send className="w-4 h-4 text-[hsl(43,65%,47%)]" /> Enviar Proposta por E-mail
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">Nome do Cliente</label>
                  <input className="input-field" placeholder="Nome (opcional)"
                    value={linkedClient ? linkedClient.name : sendName}
                    onChange={e => { if (!linkedClient) setSendName(e.target.value); }} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">E-mail *</label>
                  <input className="input-field" type="email" placeholder="cliente@email.com"
                    value={linkedClient?.email || sendTo}
                    onChange={e => { if (!linkedClient?.email) setSendTo(e.target.value); }} />
                </div>
              </div>
              <button onClick={sendProposal} disabled={!canSend || sending || sent}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-foreground text-primary-foreground text-sm font-semibold rounded-lg disabled:opacity-50 transition-colors hover:bg-foreground/90">
                <Send className="w-4 h-4" />
                {sent ? 'Proposta enviada!' : sending ? 'Enviando...' : 'Enviar Proposta'}
              </button>
            </div>
          )}
        </div>

        {/* Painel lateral fixo — apenas desktop */}
        <div className="w-72 shrink-0 overflow-y-auto pb-6 hidden lg:block">
          <SimuladorPainelLateral
            scenarios={scenarios}
            results={results}
            onOpenDrawer={() => setDrawerOpen(true)}
            onSave={() => setSalvaModalOpen(true)}
          />
        </div>

      </div>{/* fim layout */}

      {/* Modal salvar/abrir simulações */}
      {salvaModalOpen && (
        <SimulacaoSalvaModal
          scenarios={scenarios}
          linkedClient={linkedClient}
          onLoad={(sim) => {
            setScenarios(sim.scenarios || [{ ...DEFAULT_SCENARIO }]);
            // Tenta restaurar cliente vinculado (sem bloquear)
          }}
          onClose={() => setSalvaModalOpen(false)}
        />
      )}

      {/* Modal criar operação a partir da simulação */}
      {criarOpModalOpen && (
        <CriarOperacaoModal
          scenarios={scenarios}
          results={results}
          linkedClient={linkedClient}
          onClose={() => setCriarOpModalOpen(false)}
        />
      )}

      {/* Drawer visão cliente */}
      {drawerOpen && (
        <SimuladorDrawer
          scenarios={scenarios}
          results={results}
          linkedClient={linkedClient}
          settings={settings}
          onClose={() => setDrawerOpen(false)}
        />
      )}
    </div>
  );
}