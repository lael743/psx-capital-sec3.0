import { useEffect, useState } from 'react';
import { Save, Plus, Trash2, AlertCircle } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { applyDocMask } from '@/lib/cedenteMasks';

const FUNCOES = [
  { value: 'socio', label: 'Sócio' },
  { value: 'avalista', label: 'Avalista' },
  { value: 'responsavel', label: 'Responsável' },
  { value: 'gerente', label: 'Gerente' },
  { value: 'procurador', label: 'Procurador' },
  { value: 'outro', label: 'Outro' },
];

const emptyPessoa = { nome: '', cpf: '', funcao: 'socio', pode_assinar: false, email: '', telefone: '', cep: '', logradouro: '', cidade: '', uf: '' };

export default function SecaoPessoasRelacionadas({ clientId }) {
  const [pessoas, setPessoas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState('');

  const load = async () => {
    if (!clientId) { setLoading(false); return; }
    setLoading(true);
    const data = await base44.entities.PessoaRelacionada.filter({ cedente_id: clientId });
    setPessoas(data);
    setLoading(false);
  };

  useEffect(() => { load(); }, [clientId]);

  const add = () => setPessoas(p => [...p, { ...emptyPessoa }]);
  const remove = async (idx, pessoa) => {
    if (pessoa.id) {
      await base44.entities.PessoaRelacionada.delete(pessoa.id);
    }
    setPessoas(p => p.filter((_, i) => i !== idx));
    setFlash('Pessoa removida.');
    setTimeout(() => setFlash(''), 3000);
  };
  const update = (idx, field, value) => setPessoas(p => p.map((x, i) => i === idx ? { ...x, [field]: value } : x));

  const save = async () => {
    setSaving(true);
    try {
      for (const p of pessoas) {
        if (!p.nome || !p.cpf) continue;
        if (p.id) {
          await base44.entities.PessoaRelacionada.update(p.id, { ...p });
        } else {
          await base44.entities.PessoaRelacionada.create({ ...p, cedente_id: clientId });
        }
      }
      setFlash('Pessoas relacionadas salvas.');
      setTimeout(() => setFlash(''), 3000);
      load();
    } catch (e) {
      setFlash('Erro: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  if (!clientId) {
    return (
      <div className="bg-white border border-border rounded-xl p-6">
        <h2 className="text-base font-bold mb-2">Pessoas Relacionadas</h2>
        <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          <AlertCircle className="w-3.5 h-3.5" /> Salve os Dados Cadastrais primeiro para adicionar pessoas relacionadas.
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-border rounded-xl p-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-base font-bold">Pessoas Relacionadas</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Sócios, avalistas e responsáveis ligados à operação.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={add} className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border border-border rounded-lg hover:bg-gray-50">
            <Plus className="w-3.5 h-3.5" /> Adicionar Pessoa
          </button>
          <button onClick={save} disabled={saving} className="inline-flex items-center gap-2 px-4 py-2 bg-foreground text-primary-foreground text-sm font-semibold rounded-lg hover:bg-foreground/90 disabled:opacity-50">
            <Save className="w-3.5 h-3.5" /> {saving ? 'Salvando...' : 'Salvar Pessoas'}
          </button>
        </div>
      </div>

      {flash && <div className="mb-4 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">{flash}</div>}

      {loading ? (
        <div className="flex justify-center py-8"><div className="w-5 h-5 border-2 border-border border-t-foreground rounded-full animate-spin" /></div>
      ) : (
        <div className="space-y-4">
          {pessoas.map((p, idx) => (
            <div key={idx} className="border border-border rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-semibold">{p.nome || 'Nova Pessoa'} {p.funcao && <span className="text-xs font-normal text-muted-foreground">— {FUNCOES.find(f => f.value === p.funcao)?.label || p.funcao}</span>}</span>
                <button onClick={() => remove(idx, p)} className="p-1.5 rounded-lg hover:bg-red-50 text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">CPF</label>
                  <input className="input-field font-mono" value={p.cpf} onChange={e => update(idx, 'cpf', applyDocMask(e.target.value, 'CPF'))} placeholder="000.000.000-00" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Nome</label>
                  <input className="input-field uppercase" value={p.nome} onChange={e => update(idx, 'nome', e.target.value.toUpperCase())} placeholder="NOME COMPLETO" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Função</label>
                  <select className="input-field" value={p.funcao} onChange={e => update(idx, 'funcao', e.target.value)}>
                    {FUNCOES.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                  </select>
                </div>
                <div className="sm:col-span-3">
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Possui poderes para assinar documentos?</label>
                  <div className="inline-flex rounded-lg border border-border overflow-hidden mt-0.5">
                    <button type="button" onClick={() => update(idx, 'pode_assinar', true)} className={`px-4 py-2 text-xs font-semibold ${p.pode_assinar ? 'bg-foreground text-primary-foreground' : 'bg-white text-muted-foreground'}`}>Sim</button>
                    <button type="button" onClick={() => update(idx, 'pode_assinar', false)} className={`px-4 py-2 text-xs font-semibold ${!p.pode_assinar ? 'bg-foreground text-primary-foreground' : 'bg-white text-muted-foreground'}`}>Não</button>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">E-mail</label>
                  <input type="email" className="input-field" value={p.email} onChange={e => update(idx, 'email', e.target.value.toLowerCase())} placeholder="email@exemplo.com" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Telefone</label>
                  <input className="input-field" value={p.telefone} onChange={e => update(idx, 'telefone', e.target.value)} placeholder="(69) 90000-0000" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">CEP</label>
                  <input className="input-field" value={p.cep} onChange={e => update(idx, 'cep', e.target.value)} placeholder="00000-000" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Logradouro</label>
                  <input className="input-field uppercase" value={p.logradouro} onChange={e => update(idx, 'logradouro', e.target.value.toUpperCase())} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Cidade</label>
                  <input className="input-field uppercase" value={p.cidade} onChange={e => update(idx, 'cidade', e.target.value.toUpperCase())} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">UF</label>
                  <input className="input-field uppercase" maxLength={2} value={p.uf} onChange={e => update(idx, 'uf', e.target.value.toUpperCase())} placeholder="RO" />
                </div>
              </div>
            </div>
          ))}
          {pessoas.length === 0 && (
            <div className="text-center py-8 text-sm text-muted-foreground border-2 border-dashed border-border rounded-lg">
              Nenhuma pessoa relacionada. Clique em "Adicionar Pessoa".
            </div>
          )}
        </div>
      )}
    </div>
  );
}