import { QRCodeSVG } from 'qrcode.react';
import { formatCurrency } from '@/lib/finance';
import { numPorExtenso } from '@/lib/numPorExtenso';

const STORAGE_KEY = 'psx_company_settings';
function getSettings() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch { return {}; }
}

export default function ConfissaoDividaPreview({ dados, fmtDate }) {
  const s = getSettings();
  const {
    cedente_nome, cedente_doc, cedente_rg, cedente_endereco, cedente_cidade, cedente_estado,
    valor_nominal, valor_liquido,
    num_promissoria, num_operacao,
    multa_pct, mora_pct, prazo_atraso,
    data_vencimento,
    test1_nome, test1_cpf, test2_nome, test2_cpf,
    foro_cidade,
    validacao_url,
    document_hash,
  } = dados;

  const companyName = s.company_name || 'PSX CAPITAL';
  const companyDoc = s.company_document || '';
  const companyAddress = [s.company_address, s.company_city, s.company_state].filter(Boolean).join(', ');
  const praça = foro_cidade || s.company_city || 'CUIABÁ';
  const hoje = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
  const qrUrl = validacao_url || `${window.location.origin}/validar`;

  const P = ({ children, className = '' }) => (
    <p className={`text-sm leading-relaxed text-gray-800 mb-3 text-justify ${className}`}>{children}</p>
  );
  const Bold = ({ children }) => <strong className="font-bold">{children}</strong>;

  return (
    <div className="bg-white shadow-sm mx-auto max-w-4xl" style={{ fontFamily: 'Times New Roman, serif' }}>

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
              Confissão de Dívida
            </div>
            <div className="text-xs mt-0.5" style={{ color: '#666' }}>
              Título Executivo Extrajudicial — Art. 784, III, CPC
            </div>
            <div className="flex flex-col items-end gap-1 mt-1.5">
              {num_promissoria && (
                <div className="text-xs font-mono px-2 py-0.5 rounded inline-block"
                  style={{ color: '#c8a550', background: '#1a1500', border: '1px solid #3a2e00' }}>
                  Promissória Nº {num_promissoria}
                </div>
              )}
              {num_operacao && (
                <div className="text-xs font-mono px-2 py-0.5 rounded inline-block"
                  style={{ color: '#aaa', background: '#1a1a1a', border: '1px solid #333' }}>
                  Operação Nº {num_operacao}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="px-10 py-8 print:px-8 print:py-6 border border-t-0 border-gray-200 rounded-b-xl">

        <div className="text-center mb-8">
          <p className="text-xl font-bold text-gray-900 uppercase tracking-wide">Instrumento Particular de Confissão de Dívida</p>
        </div>

        <div className="mb-6 p-5 bg-gray-50 rounded-lg border border-gray-200">
          <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3">Qualificação do Confitente</p>
          <P>
            <Bold>CONFITENTE (DEVEDOR):</Bold> {cedente_nome || '_______________'}, portador do CPF/CNPJ nº {cedente_doc || '_______________'}{cedente_rg ? `, RG nº ${cedente_rg}` : ''}, residente e domiciliado{cedente_endereco ? ` na ${cedente_endereco}` : ''}{cedente_cidade ? `, ${cedente_cidade}` : ''}{cedente_estado ? `/${cedente_estado}` : ''}, doravante denominado simplesmente <Bold>CONFITENTE</Bold>.
          </P>
          <P className="mb-0">
            <Bold>CREDOR:</Bold> {companyName}, pessoa jurídica de direito privado, inscrita no CNPJ sob o nº {companyDoc || '_______________'}, com sede{companyAddress ? ` na ${companyAddress}` : ''}, doravante denominada simplesmente <Bold>CREDOR</Bold>.
          </P>
        </div>

        <P>
          O <Bold>CONFITENTE</Bold> reconhece, confessa e assume como líquida, certa e exigível a dívida decorrente do Instrumento Particular de Cessão de Crédito com Coobrigação celebrado com o <Bold>CREDOR</Bold>, nos seguintes termos:
        </P>

        <div className="overflow-x-auto mb-4">
          <table className="w-full text-xs border border-gray-300 rounded-lg overflow-hidden">
            <thead className="bg-gray-100">
              <tr>
                {['Descrição', 'Valor'].map(h => (
                  <th key={h} className="px-3 py-2 text-left font-bold text-gray-700 border-b border-gray-300">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="bg-white">
                <td className="px-3 py-1.5 border-b border-gray-200">Valor Nominal dos Créditos</td>
                <td className="px-3 py-1.5 border-b border-gray-200 font-semibold">{formatCurrency(valor_nominal)}</td>
              </tr>
              <tr className="bg-gray-50">
                <td className="px-3 py-1.5 border-b border-gray-200">Valor Líquido Repassado ao Confitente</td>
                <td className="px-3 py-1.5 border-b border-gray-200 font-semibold text-emerald-700">{formatCurrency(valor_liquido)}</td>
              </tr>
              <tr className="bg-white">
                <td className="px-3 py-1.5 border-b border-gray-200">Vencimento</td>
                <td className="px-3 py-1.5 border-b border-gray-200 font-semibold">{fmtDate(data_vencimento) || '—'}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <P>
          O valor confessado é devido em razão da coobrigação assumida pelo <Bold>CONFITENTE</Bold> no âmbito da operação de cessão de crédito, respondendo este solidariamente pela liquidação integral do débito em caso de inadimplemento pelo Devedor Cedido.
        </P>

        <P>
          O <Bold>CONFITENTE</Bold> declara-se ciente de que o presente instrumento constitui <Bold>título executivo extrajudicial</Bold>, nos termos do artigo 784, inciso III, do Código de Processo Civil, podendo ser executado independentemente de qualquer outro documento ou prova da relação jurídica subjacente.
        </P>

        <P>
          Em caso de inadimplemento, sobre o valor confessado incidirão:
        </P>
        <div className="pl-5 mb-3 space-y-1">
          <P className="mb-1"><Bold>a)</Bold> Multa contratual de <Bold>{multa_pct || '2'}%</Bold>;</P>
          <P className="mb-1"><Bold>b)</Bold> Juros de mora de <Bold>{mora_pct || '1'}% ao mês</Bold>, calculados pro rata die;</P>
          <P className="mb-0"><Bold>c)</Bold> Correção monetária e honorários de cobrança.</P>
        </div>

        <P>
          Para todos os fins de direito, o <Bold>CONFITENTE</Bold> elege o foro da comarca de <Bold>{praça}</Bold>, Estado de <Bold>{cedente_estado || '___'}</Bold>, para dirimir eventuais controvérsias decorrentes do presente instrumento, renunciando a qualquer outro, por mais privilegiado que seja.
        </P>

        <div className="mt-8 pt-6 border-t border-gray-300">
          <p className="text-sm text-center text-gray-700 mb-8">{praça}, {hoje}.</p>

          <div className="grid grid-cols-2 gap-8 mt-10">
            <div className="text-center">
              <div className="border-t border-gray-800 pt-2 mt-12">
                <p className="text-sm font-bold">{cedente_nome || '_______________'}</p>
                <p className="text-xs text-gray-600">CONFITENTE</p>
                <p className="text-xs text-gray-500">CPF/CNPJ: {cedente_doc || '_______________'}</p>
              </div>
            </div>
            <div className="text-center">
              <div className="border-t border-gray-800 pt-2 mt-12">
                <p className="text-sm font-bold">{companyName}</p>
                <p className="text-xs text-gray-600">CREDOR</p>
                <p className="text-xs text-gray-500">CNPJ: {companyDoc || '_______________'}</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-8 mt-10">
            <div className="text-center">
              <div className="mt-12" style={{ borderTop: '2px solid #1f2937', paddingTop: '8px', width: '100%' }}>
                <p className="text-sm font-bold">{test1_nome || '_______________'}</p>
                <p className="text-xs text-gray-600">TESTEMUNHA 1</p>
                <p className="text-xs text-gray-500">CPF: {test1_cpf || '_______________'}</p>
              </div>
            </div>
            <div className="text-center">
              <div className="mt-12" style={{ borderTop: '2px solid #1f2937', paddingTop: '8px', width: '100%' }}>
                <p className="text-sm font-bold">{test2_nome || '_______________'}</p>
                <p className="text-xs text-gray-600">TESTEMUNHA 2</p>
                <p className="text-xs text-gray-500">CPF: {test2_cpf || '_______________'}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-8 pt-4 border-t border-gray-200 flex items-center justify-between gap-4 flex-wrap">
          <div className="text-xs text-gray-400">
            <div>{companyName}{companyDoc ? ` — ${companyDoc}` : ''}</div>
            <div>Documento gerado em {hoje}</div>
            {document_hash && (
              <div className="font-mono text-[10px] mt-1 text-gray-400">Hash: {document_hash.substring(0, 32)}…</div>
            )}
          </div>
          <div className="flex flex-col items-center gap-1">
            <QRCodeSVG value={qrUrl} size={68} level="M" />
            <span className="text-xs text-gray-400 text-center">Verificar Autenticidade</span>
          </div>
        </div>
      </div>
    </div>
  );
}