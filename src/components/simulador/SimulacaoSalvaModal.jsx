import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { X, Save, FolderOpen, Trash2, Clock } from 'lucide-react';
import { formatCurrency } from '@/lib/finance';

export default function SimulacaoSalvaModal({ scenarios, linkedClient, onLoad, onClose }) {
  const [tab, setTab] = useState('salvar'); // 'salvar' | 'abrir'
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [simulacoes, setSimulacoes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(null);

  useEffect(() => {
    if (tab === 'abrir') loadSimulacoes();
  }, [tab]);

  const loadSimulacoes = async () => {
    setLoading(true);
    const list = await base44.entities.SimulacaoSalva.list('-created_date', 50);
    setSimulacoes(list);
    setLoading(false);
  };

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    await base44.entities.SimulacaoSalva.create({
      name: name.trim(),
      scenarios,
      linked_client_id: linkedClient?.id || '',
      linked_client_name: linkedClient?.name || '',
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => { setSaved(false); setName(''); onClose(); }, 1200);
  };

  const handleLoad = (sim) => {
    onLoad(sim);
    onClose();
  };

  const handleDelete = async (id, e) => {
    e.stopPropagation();
    setDeleting(id);
    await base44.entities.SimulacaoSalva.delete(id);
    setSimulacoes(prev => prev.filter(s => s.id !== id));
    setDeleting(null);
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col max-h-[80vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border shrink-0">
          <h2 className="text-base font-bold">Simulações Salvas</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border shrink-0">
          <button
            onClick={() => setTab('salvar')}
            className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${tab === 'salvar' ? 'text-foreground border-b-2 border-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          >
            <Save className="w-3.5 h-3.5 inline mr-1.5" />Salvar Atual
          </button>
          <button
            onClick={() => setTab('abrir')}
            className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${tab === 'abrir' ? 'text-foreground border-b-2 border-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          >
            <FolderOpen className="w-3.5 h-3.5 inline mr-1.5" />Abrir Salva
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {tab === 'salvar' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Nome da Simulação *</label>
                <input
                  className="input-field"
                  placeholder="Ex: Proposta João - 5% juros"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSave()}
                  autoFocus
                />
              </div>

              {/* Preview cenários */}
              <div className="space-y-2">
                <div className="text-xs font-medium text-muted-foreground">Cenários que serão salvos ({scenarios.length}):</div>
                {scenarios.map((s, i) => (
                  <div key={i} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 text-xs">
                    <span className="font-medium">{s.label}</span>
                    <span className="text-muted-foreground">
                      {s.type === 'cheque' ? 'Cheque' : 'Empréstimo'} · {s.rate}% · {formatCurrency(parseFloat(s.gross_value) || 0)}
                    </span>
                  </div>
                ))}
              </div>

              {linkedClient && (
                <div className="text-xs text-muted-foreground bg-blue-50 px-3 py-2 rounded-lg">
                  Cliente vinculado: <span className="font-semibold">{linkedClient.name}</span>
                </div>
              )}

              <button
                onClick={handleSave}
                disabled={!name.trim() || saving || saved}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-foreground text-primary-foreground text-sm font-semibold rounded-xl disabled:opacity-50 transition-colors hover:bg-foreground/90"
              >
                <Save className="w-4 h-4" />
                {saved ? 'Salvo!' : saving ? 'Salvando...' : 'Salvar Simulação'}
              </button>
            </div>
          )}

          {tab === 'abrir' && (
            <div className="space-y-2">
              {loading ? (
                <div className="text-center py-8 text-sm text-muted-foreground">Carregando...</div>
              ) : simulacoes.length === 0 ? (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  Nenhuma simulação salva ainda.
                </div>
              ) : (
                simulacoes.map(sim => (
                  <button
                    key={sim.id}
                    onClick={() => handleLoad(sim)}
                    className="w-full text-left bg-gray-50 border border-border hover:border-foreground/30 hover:bg-gray-100 rounded-xl px-4 py-3 transition-colors group"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold truncate">{sim.name}</div>
                        {sim.linked_client_name && (
                          <div className="text-xs text-muted-foreground mt-0.5">Cliente: {sim.linked_client_name}</div>
                        )}
                        <div className="flex items-center gap-1.5 mt-1">
                          <Clock className="w-3 h-3 text-muted-foreground" />
                          <span className="text-xs text-muted-foreground">{formatDate(sim.created_date)}</span>
                        </div>
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {(sim.scenarios || []).map((s, i) => (
                            <span key={i} className="text-[10px] bg-white border border-border px-1.5 py-0.5 rounded-full font-medium">
                              {s.label} · {s.type === 'cheque' ? 'Cheque' : 'Emp.'} · {s.rate}%
                            </span>
                          ))}
                        </div>
                      </div>
                      <button
                        onClick={e => handleDelete(sim.id, e)}
                        disabled={deleting === sim.id}
                        className="p-1.5 rounded-lg text-red-400 hover:bg-red-50 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-all shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}