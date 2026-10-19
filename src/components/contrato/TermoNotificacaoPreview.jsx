import { formatCurrency } from '@/lib/finance';

const STORAGE_KEY = 'psx_company_settings';
function getSettings() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch { return {}; }
}

export default function TermoNotificacaoPreview({ dados, fmtDate }) {
  const s = getSettings();
  const {
    cedente_nome, cedente_doc,
    cedido_nome, cedido_doc, cedido_endereco, cedido_cidade, cedido_estado,
    valor_nominal, num_operacao,
    operacao,
    document_hash,
  } = dados;

  const schedule = operacao?.installment_schedule || [];
  const companyName = s.company_name || 'PSX CAPITAL';
  const companyDoc = s.company_document || '';
  const companyAddress = [s.company_address, s.company_city, s.company_state].filter(Boolean).join(', ');
  const companyPix = s.company_pix || '';

  const hoje = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });

  const P = ({ children, className = '' }) => (
    <p className={`text-sm leading-snug text-gray-800 mb-2 print:mb-1.5 print:text-xs ${className}`}>{children}</p>
  );
  const Bold = ({ children }) => <strong className="font-bold">{children}</strong>;

  return (
    <div className="bg-white shadow-sm mx-auto max-w-4xl" style={{ fontFamily: 'Times New Roman, serif' }}>

      {/* CABEÇALHO */}
      <div className="rounded-t-xl overflow-hidden" style={{ background: '#0f0f0f' }}>
        <div className="px-8 py-5 flex items-center justify-between gap-6">
          <div className="flex flex-col items-start shrink-0">
            <div className="flex items-baseline gap-0 leading-none" style={{ fontFamily: 'Arial Black, sans-serif' }}>
              <span className="text-2xl font-black tracking-tight" style={{ color: '#b0b8c1', letterSpacing: '-0.02em' }}>PS</span>
              <span className="text-2xl font-black tracking-tight" style={{ color: '#c8a550', letterSpacing: '-0.02em' }}>X</span>
            </div>
            <div className="w-full h-px my-1" style={{ background: 'linear-gradient(to right, #c8a550, transparent)' }} />
            <div className="text-xs font-bold tracking-widest uppercase" style={{ color: '#888', letterSpacing: '0.25em' }}>Capital</div>
          </div>
          <div className="text-right flex-1">
            <div className="text-sm font-bold uppercase tracking-widest" style={{ color: '#e0e0e0' }}>
              Termo de Notificação ao Devedor Cedido
            </div>
            <div className="text-xs mt-0.5" style={{ color: '#666' }}>
              Cessão de Crédito — {companyName}
            </div>
            {num_operacao && (
              <div className="text-xs font-mono mt-1 px-2 py-0.5 rounded inline-block"
                style={{ color: '#aaa', background: '#1a1a1a', border: '1px solid #333' }}>
                Operação Nº {num_operacao}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="px-8 py-5 print:px-6 print:py-3 border border-t-0 border-gray-200 rounded-b-xl">

        <div className="text-center mb-4 print:mb-3">
          <p className="text-lg font-bold text-gray-900">NOTIFICAÇÃO DE CESSÃO DE CRÉDITO</p>
          <p className="text-xs text-gray-400 mt-0.5">Art. 290 do Código Civil Brasileiro</p>
        </div>

        <div className="mb-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
          <P>Ao <Bold>DEVEDOR CEDIDO</Bold>:</P>
          <P className="font-bold text-sm mb-0">{cedido_nome || '_______________'}</P>
          {cedido_doc && <P className="text-xs">CPF/CNPJ: {cedido_doc}</P>}
          {cedido_endereco && <P className="text-xs">{cedido_endereco}{cedido_cidade ? `, ${cedido_cidade}` : ''}{cedido_estado ? `/${cedido_estado}` : ''}</P>}
        </div>

        <P>
          Informamos que os créditos originalmente devidos ao <Bold>{cedente_nome || '_______________'}</Bold>, inscrito no CPF/CNPJ nº <Bold>{cedente_doc || '_______________'}</Bold>, foram cedidos à <Bold>{companyName}</Bold>, inscrita no CNPJ nº <Bold>{companyDoc || '_______________'}</Bold>, conforme Instrumento Particular de Cessão de Crédito com Coobrigação celebrado entre as partes.
        </P>

        <P>
          Os créditos cedidos possuem o valor nominal total de <Bold>{formatCurrency(valor_nominal)}</Bold>, compreendendo <Bold>{schedule.length || 1}</Bold> parcela(s), conforme abaixo:
        </P>

        {schedule.length > 0 && (
          <div className="overflow-x-auto mb-3 print:mb-2">
            <table className="w-full text-xs border border-gray-300 rounded-lg overflow-hidden">
              <thead className="bg-gray-100">
                <tr>
                  {['Parcela', 'Vencimento', 'Valor'].map(h => (
                    <th key={h} className="px-2 py-1.5 text-left font-bold text-gray-700 border-b border-gray-300 text-xs">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {schedule.map((p, i) => (
                  <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className="px-2 py-1 border-b border-gray-200">{p.number || i + 1}ª</td>
                    <td className="px-2 py-1 border-b border-gray-200 font-semibold">{p.due_date ? fmtDate(p.due_date) : '—'}</td>
                    <td className="px-2 py-1 border-b border-gray-200 font-semibold">{formatCurrency(p.value)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-100">
                <tr>
                  <td colSpan={2} className="px-2 py-1.5 font-bold text-right text-xs">Total:</td>
                  <td className="px-2 py-1.5 font-bold text-xs">{formatCurrency(valor_nominal)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-3">
          <P className="font-bold text-amber-900 mb-1.5">⚠️ IMPORTANTE:</P>
          <P className="text-amber-900 mb-1.5">
            A partir desta data, <Bold>todos os pagamentos</Bold> referentes aos créditos acima deverão ser realizados <Bold>exclusivamente</Bold> em favor da <Bold>{companyName}</Bold>.
          </P>
          <P className="text-amber-900 mb-0">
            Pagamentos realizados ao <Bold>Cedente ({cedente_nome || '_______________'})</Bold> após o recebimento desta notificação <Bold>NÃO produzirão efeito liberatório</Bold>, permanecendo o Devedor Cedido obrigado ao pagamento à Cessionária.
          </P>
        </div>

        {companyPix && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 mb-3">
            <P className="font-bold text-emerald-900 mb-1">Dados para Pagamento:</P>
            <P className="text-emerald-900 mb-0">
              <Bold>PIX:</Bold> {companyPix}<br />
              <Bold>Beneficiário:</Bold> {companyName}<br />
              <Bold>CNPJ:</Bold> {companyDoc}
            </P>
          </div>
        )}

        <div className="border-t border-gray-300 pt-3 mt-4">
          <P className="text-xs text-gray-400 text-center leading-snug mb-0">
            {companyName} · {companyDoc || ''}<br />
            {companyAddress}<br />
            Documento gerado em {hoje}
            {document_hash && (
              <span className="block font-mono text-[10px] mt-1 text-gray-400">Hash: {document_hash.substring(0, 32)}…</span>
            )}
          </P>
        </div>

        <div className="mt-6 pt-4 border-t border-gray-300">
          <div className="grid grid-cols-2 gap-8">
            <div className="text-center">
              <div className="border-t border-gray-800 pt-2 mt-8">
                <p className="text-sm font-bold">{companyName}</p>
                <p className="text-xs text-gray-600">CESSIONÁRIA</p>
              </div>
            </div>
            <div className="text-center">
              <div className="border-t border-gray-800 pt-2 mt-8">
                <p className="text-sm font-bold">{cedido_nome || '_______________'}</p>
                <p className="text-xs text-gray-600">DEVEDOR CEDIDO</p>
                <p className="text-xs text-gray-500">CIENTE EM: ___/___/______</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}