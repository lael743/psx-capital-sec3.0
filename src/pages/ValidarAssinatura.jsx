import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Search, Shield, CheckCircle, AlertTriangle, XCircle, FileText, Hash, Loader2 } from 'lucide-react';
import { formatDate } from '@/lib/finance';

const DOC_TYPE_LABELS = {
  contrato: 'Contrato', promissoria: 'Nota Promissória', confissao_divida: 'Confissão de Dívida',
  cessao_credito: 'Cessão de Crédito', termo_garantia: 'Termo de Garantia', outro: 'Documento',
};

export default function ValidarAssinatura() {
  const [query, setQuery] = useState('');
  const [searchType, setSearchType] = useState('documento');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);

  const search = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setResults(null);
    const res = await base44.functions.invoke('validarDocumentoPublico', {
      q: query.trim(),
      type: searchType,
    });
    setResults(res.data);
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-border px-4 py-3">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center">
            <span className="text-lg font-bold">PS<span className="gold-text">X</span></span>
            <span className="text-xs text-muted-foreground ml-2">Validação de Assinaturas</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Shield className="w-3.5 h-3.5" /> Verificação Pública
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto p-4 md:p-6 space-y-6">
        <div className="text-center">
          <div className="w-16 h-16 bg-[hsl(43,65%,47%)]/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <Shield className="w-8 h-8 text-[hsl(43,65%,47%)]" />
          </div>
          <h1 className="text-xl font-bold">Validar Documento</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Verifique a autenticidade e integridade de documentos assinados eletronicamente pela PSX Capital.
          </p>
        </div>

        {/* Search */}
        <div className="bg-white border border-border rounded-xl p-5 space-y-4">
          <div className="flex gap-2">
            {[
              { value: 'documento', label: 'Nº Documento' },
              { value: 'assinatura', label: 'Cód. Assinatura' },
              { value: 'hash', label: 'Hash' },
            ].map(opt => (
              <button key={opt.value} onClick={() => setSearchType(opt.value)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                  searchType === opt.value ? 'bg-foreground text-white' : 'border border-border hover:bg-gray-50'
                }`}>
                {opt.label}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input className="w-full pl-9 pr-4 py-2.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder={
                  searchType === 'documento' ? 'Ex: DOC-000001' :
                  searchType === 'hash' ? 'Hash SHA-256...' :
                  'Código UUID da assinatura...'
                }
                value={query} onChange={e => setQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && search()} />
            </div>
            <button onClick={search} disabled={loading || !query.trim()}
              className="flex items-center gap-2 px-5 py-2.5 bg-foreground text-white text-sm font-semibold rounded-lg hover:bg-foreground/90 disabled:opacity-40">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              Buscar
            </button>
          </div>
        </div>

        {/* Results */}
        {results && (
          <div className="space-y-4">
            {!results.found ? (
              <div className="bg-white border border-border rounded-xl p-8 text-center">
                <XCircle className="w-12 h-12 mx-auto mb-3 text-red-300" />
                <p className="font-medium text-lg">Não Encontrado</p>
                <p className="text-sm text-muted-foreground mt-1">{results.message || 'Nenhum documento ou assinatura corresponde à busca.'}</p>
              </div>
            ) : (
              results.results?.map((r, i) => (
                <div key={i} className="bg-white border border-border rounded-xl p-5 space-y-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 ${
                      r.valid ? 'bg-emerald-100' : 'bg-red-100'
                    }`}>
                      {r.valid ? <CheckCircle className="w-6 h-6 text-emerald-600" /> : <AlertTriangle className="w-6 h-6 text-red-500" />}
                    </div>
                    <div>
                      <h3 className={`text-lg font-bold ${r.valid ? 'text-emerald-700' : 'text-red-700'}`}>
                        {r.valid ? 'Documento Válido' : 'Documento Inválido'}
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        {r.valid ? 'Assinatura eletrônica verificada e documento íntegro.' : 'Documento alterado ou assinatura comprometida.'}
                      </p>
                    </div>
                  </div>

                  {r.document && (
                    <div className="bg-gray-50 rounded-lg p-4 space-y-2 text-sm">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div>
                          <span className="text-muted-foreground text-xs">Documento:</span>
                          <p className="font-medium">{r.document.title}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground text-xs">Tipo:</span>
                          <p>{DOC_TYPE_LABELS[r.document.document_type] || r.document.document_type}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground text-xs">Número:</span>
                          <p className="font-mono">{r.document.document_number}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground text-xs">Status:</span>
                          <p className="font-medium">{r.document.status === 'assinado' ? 'Assinado' : r.document.status}</p>
                        </div>
                      </div>

                      {r.document.document_hash && (
                        <div className="flex items-start gap-2 pt-2 border-t border-gray-200">
                          <Hash className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                          <div>
                            <span className="text-xs text-muted-foreground">Hash SHA-256 do documento:</span>
                            <code className={`block text-xs break-all mt-0.5 ${r.valid ? 'text-emerald-700' : 'text-red-600'}`}>
                              {r.document.document_hash}
                            </code>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Signature details */}
                  {r.signature && (
                    <div className="bg-gray-50 rounded-lg p-4 space-y-2 text-sm">
                      <div className="text-xs font-semibold text-muted-foreground uppercase">Dados da Assinatura</div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {r.signer && (
                          <>
                            <div><span className="text-muted-foreground text-xs">Assinante:</span><p className="font-medium">{r.signer.name}</p></div>
                            <div><span className="text-muted-foreground text-xs">CPF/CNPJ:</span><p>{r.signer.cpf_cnpj}</p></div>
                          </>
                        )}
                        <div><span className="text-muted-foreground text-xs">Data da Assinatura:</span><p>{r.signature.signed_at ? formatDate(r.signature.signed_at.split('T')[0]) + ' ' + new Date(r.signature.signed_at).toLocaleTimeString('pt-BR') : '-'}</p></div>
                        <div><span className="text-muted-foreground text-xs">IP:</span><p>{r.signature.ip_address || '-'}</p></div>
                        <div><span className="text-muted-foreground text-xs">Dispositivo:</span><p>{r.signature.device_type || '-'} · {r.signature.browser || ''} · {r.signature.operating_system || ''}</p></div>
                        <div><span className="text-muted-foreground text-xs">Localização:</span><p>{r.signature.latitude && r.signature.longitude ? `${r.signature.latitude}, ${r.signature.longitude}` : 'Não disponível'}</p></div>
                      </div>
                      {r.signature.document_hash_at_signature && (
                        <div className="flex items-start gap-2 pt-2 border-t border-gray-200">
                          <Hash className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                          <div>
                            <span className="text-xs text-muted-foreground">Hash no momento da assinatura:</span>
                            <code className="block text-xs break-all mt-0.5">{r.signature.document_hash_at_signature}</code>
                          </div>
                        </div>
                      )}
                      {r.signature.signature_image && (
                        <div className="pt-2 border-t border-gray-200">
                          <span className="text-xs text-muted-foreground">Assinatura:</span>
                          <img src={r.signature.signature_image} alt="Assinatura" className="mt-1 max-h-20 border border-border rounded" />
                        </div>
                      )}
                      {r.signature.certificate_pdf && (
                        <div className="pt-2">
                          <a href={r.signature.certificate_pdf} target="_blank" rel="noopener"
                            className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground hover:underline">
                            <FileText className="w-3.5 h-3.5" /> Baixar Certificado de Evidências
                          </a>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </main>

      <footer className="border-t border-border py-4 mt-8">
        <div className="max-w-2xl mx-auto px-4 text-center text-xs text-muted-foreground">
          PSX Capital — Validação Pública de Assinaturas Eletrônicas
        </div>
      </footer>
    </div>
  );
}