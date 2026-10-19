import { QRCodeSVG } from 'qrcode.react';
import { formatCurrency } from '@/lib/finance';

const STORAGE_KEY = 'psx_company_settings';
function getSettings() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch { return {}; }
}

export default function ComprovanteRepassePreview({ dados, fmtDate }) {
  const s = getSettings();
  const {
    cedente_nome, cedente_doc,
    valor_nominal, valor_liquido, desagio_valor, taxa_pct,
    data_liberacao, num_operacao,
    operacao,
    validacao_url,
    document_hash,
  } = dados;

  const companyName = s.company_name || 'PSX CAPITAL';
  const companyDoc = s.company_document || '';
  const companyAddress = [s.company_address, s.company_city, s.company_state].filter(Boolean).join(', ');

  const op = operacao || {};
  const bancoRepasse = op.disbursement_bank_name || op.repasse_bank_name || '';
  const dataRepasse = op.payment_execution_date || data_liberacao || '';
  const metodoDesembolso = op.disbursement_method || '';

  const hoje = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
  const qrUrl = validacao_url || `${window.location.origin}/validar`;

  const P = ({ children, className = '' }) => (
    <p className={`text-sm leading-snug text-gray-800 mb-2 print:mb-1.5 print:text-xs ${className}`}>{children}</p>
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
              Comprovante de Repasse
            </div>
            <div className="text-xs mt-0.5" style={{ color: '#666' }}>
              Antecipação de Recebíveis
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
          <p className="text-lg font-bold text-gray-900">COMPROVANTE DE REPASSE</p>
          <p className="text-xs text-gray-400 mt-0.5">Antecipação de Recebíveis — Cessão de Crédito</p>
        </div>

        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 mb-4 text-center">
          <p className="text-emerald-900 font-bold text-base">
            {companyName} confirma o repasse ao Cedente
          </p>
        </div>

        <div className="mb-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
          <P className="mb-0.5"><Bold>Cedente:</Bold> {cedente_nome || '_______________'}</P>
          {cedente_doc && <P className="mb-0"><Bold>CPF/CNPJ:</Bold> {cedente_doc}</P>}
        </div>

        <div className="overflow-x-auto mb-3 print:mb-2">
          <table className="w-full text-xs border border-gray-300 rounded-lg overflow-hidden">
            <thead className="bg-gray-100">
              <tr>
                {['Descrição', 'Valor'].map(h => (
                  <th key={h} className="px-2 py-1.5 text-left font-bold text-gray-700 border-b border-gray-300 text-xs">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="bg-white">
                <td className="px-2 py-1 border-b border-gray-200">Valor Nominal dos Créditos</td>
                <td className="px-2 py-1 border-b border-gray-200 font-semibold">{formatCurrency(valor_nominal)}</td>
              </tr>
              <tr className="bg-gray-50">
                <td className="px-2 py-1 border-b border-gray-200">Deságio Comercial ({taxa_pct}% a.m.)</td>
                <td className="px-2 py-1 border-b border-gray-200 font-semibold text-[hsl(43,65%,47%)]">− {formatCurrency(desagio_valor)}</td>
              </tr>
              <tr className="bg-emerald-50">
                <td className="px-2 py-1.5 border-b border-emerald-200 font-bold">Valor Líquido Repassado</td>
                <td className="px-2 py-1.5 border-b border-emerald-200 font-bold text-emerald-700 text-sm">{formatCurrency(valor_liquido)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs mb-4 p-2.5 bg-gray-50 rounded-lg border border-gray-200">
          {dataRepasse && <div><span className="text-gray-500">Data do Repasse:</span> <strong>{fmtDate(dataRepasse)}</strong></div>}
          {bancoRepasse && <div><span className="text-gray-500">Banco:</span> <strong>{bancoRepasse}</strong></div>}
          {metodoDesembolso && <div><span className="text-gray-500">Método:</span> <strong>{metodoDesembolso}</strong></div>}
          <div><span className="text-gray-500">Operação:</span> <strong>{num_operacao || '—'}</strong></div>
        </div>

        <P>
          O presente comprovante atesta a efetiva entrega dos recursos ao <Bold>{cedente_nome || '_______________'}</Bold>, em cumprimento ao Instrumento Particular de Cessão de Crédito com Coobrigação celebrado entre as partes.
        </P>

        <P>
          Este documento serve como prova da quitação da obrigação de repasse por parte da <Bold>{companyName}</Bold>, não implicando quitação da coobrigação assumida pelo Cedente.
        </P>

        <div className="mt-6 pt-4 border-t border-gray-300">
          <p className="text-sm text-center text-gray-700 mb-6">{companyName}, {hoje}.</p>
          <div className="text-center">
            <div className="border-t border-gray-800 pt-2 mt-8 mx-auto max-w-xs">
              <p className="text-sm font-bold">{companyName}</p>
              <p className="text-xs text-gray-600">CESSIONÁRIA</p>
              <p className="text-xs text-gray-500">CNPJ: {companyDoc || '_______________'}</p>
            </div>
          </div>
        </div>

        <div className="mt-6 pt-3 border-t border-gray-200 flex items-center justify-between gap-4 flex-wrap">
          <div className="text-xs text-gray-400 leading-snug">
            <div>{companyName}{companyDoc ? ` — ${companyDoc}` : ''}</div>
            <div>{companyAddress}</div>
            <div>Documento gerado em {hoje}</div>
            {document_hash && (
              <div className="font-mono text-[10px] mt-1 text-gray-400">Hash: {document_hash.substring(0, 32)}…</div>
            )}
          </div>
          <div className="flex flex-col items-center gap-1">
            <QRCodeSVG value={qrUrl} size={56} level="M" />
            <span className="text-xs text-gray-400 text-center">Verificar Autenticidade</span>
          </div>
        </div>
      </div>
    </div>
  );
}