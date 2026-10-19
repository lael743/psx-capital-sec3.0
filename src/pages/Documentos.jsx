import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { formatDate } from '@/lib/finance';
import { FileText, Download, Upload } from 'lucide-react';

const docTypeLabel = { contrato: 'Contrato', duplicata: 'Duplicata', recibo: 'Recibo', outro: 'Outro' };

export default function Documentos() {
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState('');

  useEffect(() => {
    base44.entities.Document.list('-created_date', 200).then(data => {
      setDocs(data);
      setLoading(false);
    });
  }, []);

  const filtered = docs.filter(d => !filterType || d.doc_type === filterType);

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Documentos</h1>
        <p className="text-sm text-muted-foreground">Contratos, duplicatas e recibos gerados</p>
      </div>

      <div className="flex items-center gap-2 mb-4">
        <select value={filterType} onChange={e => setFilterType(e.target.value)} className="input-field text-sm w-auto">
          <option value="">Todos os tipos</option>
          <option value="contrato">Contrato</option>
          <option value="duplicata">Duplicata</option>
          <option value="recibo">Recibo</option>
        </select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="w-6 h-6 border-2 border-border border-t-foreground rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block bg-white border border-border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-gray-50/50">
                  <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground">Nº Documento</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground">Tipo</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground">Cliente</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground">Emissão</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground">Versão</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground">Assinado</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map(d => (
                  <tr key={d.id} className="hover:bg-gray-50/50">
                    <td className="px-5 py-3 font-mono text-xs">{d.doc_number || '—'}</td>
                    <td className="px-5 py-3">
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-gray-100 rounded-full text-xs font-medium">
                        <FileText className="w-3 h-3" /> {docTypeLabel[d.doc_type] || d.doc_type}
                      </span>
                    </td>
                    <td className="px-5 py-3 font-medium">{d.client_name || '—'}</td>
                    <td className="px-5 py-3 text-muted-foreground">{formatDate(d.issue_date || d.created_date)}</td>
                    <td className="px-5 py-3 text-muted-foreground">v{d.version || 1}</td>
                    <td className="px-5 py-3">
                      {d.is_signed ? (
                        <span className="inline-flex items-center gap-1 text-xs text-emerald-600">✓ Assinado</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">Pendente</span>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      {d.file_url && (
                        <a href={d.file_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-[hsl(43,65%,47%)] hover:underline">
                          <Download className="w-3.5 h-3.5" /> PDF
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={7} className="px-5 py-10 text-center text-muted-foreground">Nenhum documento gerado.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {filtered.map(d => (
              <div key={d.id} className="bg-white border border-border rounded-xl p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-gray-100 rounded-full text-xs font-medium">
                        <FileText className="w-3 h-3" /> {docTypeLabel[d.doc_type] || d.doc_type}
                      </span>
                      {d.is_signed ? (
                        <span className="text-xs text-emerald-600 font-medium">✓ Assinado</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">Pendente</span>
                      )}
                    </div>
                    <div className="font-semibold text-sm">{d.client_name || '—'}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {d.doc_number && <span className="font-mono mr-2">{d.doc_number}</span>}
                      {formatDate(d.issue_date || d.created_date)} · v{d.version || 1}
                    </div>
                  </div>
                  {d.file_url && (
                    <a href={d.file_url} target="_blank" rel="noreferrer"
                      className="p-2 rounded-lg bg-gray-100 text-muted-foreground hover:text-foreground shrink-0">
                      <Download className="w-4 h-4" />
                    </a>
                  )}
                </div>
              </div>
            ))}
            {filtered.length === 0 && (
              <div className="py-10 text-center text-muted-foreground text-sm">Nenhum documento gerado.</div>
            )}
          </div>
        </>
      )}
    </div>
  );
}