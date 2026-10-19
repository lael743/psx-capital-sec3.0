import { useState, useEffect } from 'react';
import { User, Phone, Mail, FileText, Link2, Loader2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';

export default function SacadoInfoCard({ operacao, onUpdate }) {
  const [sacado, setSacado] = useState(null);
  const [loading, setLoading] = useState(false);
  const [linking, setLinking] = useState(false);

  useEffect(() => {
    if (!operacao?.sacado_id) { setSacado(null); return; }
    setLoading(true);
    base44.entities.Sacado.get(operacao.sacado_id)
      .then(setSacado)
      .catch(() => setSacado(null))
      .finally(() => setLoading(false));
  }, [operacao?.sacado_id]);

  if (!operacao?.sacado_name && !operacao?.sacado_id) return null;

  const needsLink = !operacao?.sacado_id && operacao?.sacado_name;

  const handleLink = async () => {
    // Buscar sacado pelo nome entre os títulos vinculados
    setLinking(true);
    try {
      const cheques = await base44.entities.Cheque.filter({ operation_id: operacao.id });
      const sacadoDoc = cheques?.[0]?.sacado_doc || '';
      if (!sacadoDoc) { alert('Documento do sacado não encontrado nos títulos.'); setLinking(false); return; }
      const existing = await base44.entities.Sacado.filter({ document: sacadoDoc });
      let sacadoId;
      if (existing && existing.length > 0) {
        sacadoId = existing[0].id;
      } else {
        const created = await base44.entities.Sacado.create({
          nome: operacao.sacado_name.toUpperCase(),
          document: sacadoDoc,
          document_type: sacadoDoc.replace(/\D/g, '').length <= 11 ? 'CPF' : 'CNPJ',
          status: 'ativo',
          origem: 'automatico',
          cedente_id: operacao.client_id,
        });
        sacadoId = created.id;
      }
      await base44.entities.Operation.update(operacao.id, { sacado_id: sacadoId });
      if (onUpdate) onUpdate();
    } catch (e) {
      alert('Erro ao vincular sacado: ' + (e.message || ''));
    }
    setLinking(false);
  };

  return (
    <div className="bg-white border border-border rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        <User className="w-4 h-4 text-[hsl(43,65%,47%)]" />
        <h3 className="text-sm font-bold">Sacado da Operação</h3>
        {sacado?.status && (
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
            sacado.status === 'ativo' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
            sacado.status === 'risco' ? 'bg-red-50 text-red-700 border border-red-200' :
            'bg-gray-100 text-gray-600 border border-gray-200'
          }`}>{sacado.status}</span>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Nome / Razão Social</p>
          <p className="text-sm font-semibold">{operacao.sacado_name || '—'}</p>
        </div>
        <div>
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">CPF / CNPJ</p>
          <p className="text-sm font-mono">{sacado?.document || (needsLink ? 'Não vinculado' : '—')}</p>
        </div>
        {sacado?.phone && (
          <div className="flex items-center gap-1.5">
            <Phone className="w-3 h-3 text-muted-foreground" />
            <p className="text-sm">{sacado.phone}</p>
          </div>
        )}
        {sacado?.email && (
          <div className="flex items-center gap-1.5">
            <Mail className="w-3 h-3 text-muted-foreground" />
            <p className="text-sm">{sacado.email}</p>
          </div>
        )}
      </div>

      {needsLink && (
        <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          <FileText className="w-3.5 h-3.5 shrink-0" />
          <span className="flex-1">Sacado sem vínculo de cadastro. A geração de cobranças Asaas e a notificação exigem o vínculo.</span>
          <button onClick={handleLink} disabled={linking} className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-amber-700 border border-amber-300 rounded-lg hover:bg-amber-100 disabled:opacity-50 whitespace-nowrap">
            {linking ? <Loader2 className="w-3 h-3 animate-spin" /> : <Link2 className="w-3 h-3" />} Vincular
          </button>
        </div>
      )}
    </div>
  );
}