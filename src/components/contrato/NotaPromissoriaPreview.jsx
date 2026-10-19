import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { formatCurrency } from '@/lib/finance';
import { numPorExtenso as defaultNumPorExtenso, dataPorExtenso } from '@/lib/numPorExtenso';

const STORAGE_KEY = 'psx_company_settings';
function getSettings() {
  try {return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');} catch {return {};}
}

// Validação dos campos obrigatórios
function validar(dados) {
  const erros = [];
  if (!dados.valorFinal || dados.valorFinal <= 0) erros.push('Valor da promissória');
  if (!dados.data_vencimento) erros.push('Data de vencimento');
  if (!dados.devedor_nome) erros.push('Nome do emitente (devedor)');
  if (!dados.credor_nome) erros.push('Nome do beneficiário (credor)');
  if (!dados.devedor_doc) erros.push('CPF/CNPJ do emitente');
  return erros;
}

export default function NotaPromissoriaPreview({ dados, fmtDate, numPorExtenso: numPorExtensoProps }) {
  const numPorExtenso = numPorExtensoProps || defaultNumPorExtenso;
  const s = getSettings();
  const [incluirTestemunhas, setIncluirTestemunhas] = useState(false);

  const {
    credor_nome, credor_doc,
    devedor_nome, devedor_doc, devedor_rg, devedor_cidade, devedor_estado,
    valorFinal, data_vencimento, num_promissoria, num_operacao, data_liberacao,
    test1_nome, test1_cpf, test2_nome, test2_cpf,
    validacao_url,
    incluir_avalista,
    avalista_nome, avalista_doc, avalista_rg, avalista_cidade, avalista_estado,
    document_hash
  } = dados;

  const praça = dados.foro_cidade || s.company_city || 'CUIABÁ';
  const hoje = new Date().toLocaleDateString('pt-BR');

  const erros = validar(dados);

  const qrData = validacao_url || `${window.location.origin}/validar`;

  if (erros.length > 0) {
    return (
      <div className="bg-white border-2 border-red-300 rounded-xl p-8 mx-auto max-w-3xl text-center">
        <p className="text-red-600 font-bold text-base mb-3">⚠️ Campos obrigatórios não preenchidos</p>
        <ul className="text-sm text-red-500 space-y-1">
          {erros.map((e) => <li key={e}>• {e}</li>)}
        </ul>
      </div>);

  }

  return (
    <div>
      {/* Controle de testemunhas — oculto na impressão */}
      <div className="mb-4 flex items-center gap-2 print:hidden">
        <input
          type="checkbox"
          id="incl-test"
          checked={incluirTestemunhas}
          onChange={(e) => setIncluirTestemunhas(e.target.checked)}
          className="w-4 h-4 rounded" />
        
        <label htmlFor="incl-test" className="text-sm font-medium cursor-pointer select-none">
          Incluir testemunhas
        </label>
      </div>

      <div className="bg-white border-2 border-gray-800 rounded-xl shadow-sm mx-auto max-w-3xl" style={{ fontFamily: 'Times New Roman, serif' }}>
        <div className="p-6 print:p-5">

          {/* ── CABEÇALHO ── */}
          <div className="flex items-start justify-between mb-4 pb-3 border-b-2 border-gray-800">
            <div>
              <h1 className="text-2xl font-bold uppercase tracking-widest text-gray-900">Nota Promissória</h1>
              <p className="text-sm text-gray-500 mt-0.5">Título de Crédito — Decreto nº 57.663/1966</p>
            </div>
            <div className="text-right space-y-2">
              <div>
                <div className="text-xs text-gray-500 mb-0.5">Nº Promissória</div>
                <div className="text-base font-bold border border-gray-800 px-3 py-1 rounded font-mono">
                  {num_promissoria || '___________'}
                </div>
              </div>
              {num_operacao &&
              <div>
                  <div className="text-xs text-gray-500 mb-0.5">Operação Nº</div>
                  <div className="text-sm font-semibold border border-gray-400 px-3 py-0.5 rounded font-mono text-gray-700">
                    {num_operacao}
                  </div>
                </div>
              }
            </div>
          </div>

          {/* ── VALOR + VENCIMENTO ── */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="border-2 border-gray-800 rounded-lg p-3 text-center bg-gray-50">
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-0.5">Valor</p>
              <p className="text-2xl font-bold text-gray-900">{formatCurrency(valorFinal)}</p>
              <p className="text-xs text-gray-600 mt-0.5">({numPorExtenso(valorFinal)})</p>
            </div>
            <div className="border-2 border-gray-800 rounded-lg p-3 text-center bg-gray-50">
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-0.5">Vencimento</p>
              <p className="text-2xl font-bold text-gray-900">{fmtDate(data_vencimento) || '___/___/______'}</p>
              <p className="text-xs text-gray-400 mt-0.5">Data de pagamento</p>
            </div>
          </div>

          {/* ── CORPO ── */}
          <div className="space-y-2 text-sm leading-relaxed text-gray-800 text-justify">
            <p>
              <strong>No dia {dataPorExtenso(data_vencimento) || '___/___/______'}</strong> ({fmtDate(data_vencimento)}), pagarei por esta única via de Nota Promissória a{' '}
              <strong>{credor_nome || '_______________'}</strong>, portador do CPF/CNPJ nº <strong>{credor_doc || '_______________'}</strong>,
              ou à sua ordem, a quantia de <strong>{formatCurrency(valorFinal)}</strong> ({numPorExtenso(valorFinal)}),
              em moeda corrente nacional, pagável em <strong>{praça}</strong>.
            </p>
            <p>
              Emitida em garantia do <strong>Contrato de Confissão de Dívida</strong> firmado entre as partes em{' '}
              <strong>{fmtDate(data_liberacao) || '___/___/______'}</strong>.
            </p>
          </div>

          {/* ── DADOS DO EMITENTE ── */}
          <div className="mt-4 p-3 border border-gray-300 rounded-lg bg-gray-50">
            <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3">Dados do Emitente (Devedor)</p>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-xs text-gray-500">Nome:</span>
                <p className="font-semibold">{devedor_nome || '_______________'}</p>
              </div>
              <div>
                <span className="text-xs text-gray-500">CPF/CNPJ:</span>
                <p className="font-semibold">{devedor_doc || '_______________'}</p>
              </div>
              {devedor_rg &&
              <div>
                  <span className="text-xs text-gray-500">RG:</span>
                  <p className="font-semibold">{devedor_rg}</p>
                </div>
              }
              <div>
                <span className="text-xs text-gray-500">Local de emissão:</span>
                <p className="font-semibold">{devedor_cidade || praça}{devedor_estado ? `/${devedor_estado}` : ''}</p>
              </div>
              <div>
                <span className="text-xs text-gray-500">Data de emissão:</span>
                <p className="font-semibold">{hoje}</p>
              </div>
            </div>
          </div>

          {/* ── AVALISTA (opcional) ── */}
          {incluir_avalista && avalista_nome &&
          <div className="mt-4 p-3 border border-amber-300 rounded-lg bg-amber-50">
              <p className="text-xs font-bold uppercase tracking-wider text-amber-800 mb-3">Avalista</p>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-xs text-amber-700">Nome:</span>
                  <p className="font-semibold">{avalista_nome}</p>
                </div>
                <div>
                  <span className="text-xs text-amber-700">CPF/CNPJ:</span>
                  <p className="font-semibold">{avalista_doc || '_______________'}</p>
                </div>
                {avalista_rg &&
              <div>
                    <span className="text-xs text-amber-700">RG:</span>
                    <p className="font-semibold">{avalista_rg}</p>
                  </div>
              }
                <div>
                  <span className="text-xs text-amber-700">Local:</span>
                  <p className="font-semibold">{avalista_cidade || praça}{avalista_estado ? `/${avalista_estado}` : ''}</p>
                </div>
              </div>
            </div>
          }

          {/* ── LOCAL, DATA E ASSINATURAS ── */}
          <div className="mt-5 pt-3">
            <p className="text-sm text-center text-gray-600 mb-1">{praça}, {hoje}.</p>

            <div className={`grid ${incluir_avalista && avalista_nome ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-2'} gap-8 mt-4`}>
              <div className="text-center">
                <div className="border-t-2 border-gray-800 pt-2 mt-10">
                  <p className="text-sm font-bold">{devedor_nome || '_______________'}</p>
                  <p className="text-xs text-gray-600 mt-0.5">EMITENTE / DEVEDOR</p>
                  <p className="text-xs text-gray-500">CPF/CNPJ: {devedor_doc || '_______________'}</p>
                </div>
              </div>
              {incluir_avalista && avalista_nome &&
              <div className="text-center">
                  <div className="border-t-2 border-gray-800 pt-2 mt-10">
                    <p className="text-sm font-bold">{avalista_nome}</p>
                    <p className="text-xs text-gray-600 mt-0.5">AVALISTA / GARANTIDOR</p>
                    <p className="text-xs text-gray-500">CPF/CNPJ: {avalista_doc || '_______________'}</p>
                  </div>
                </div>
              }
              <div className="text-center">
                <div className="border-t-2 border-dashed border-gray-400 pt-2 mt-10">
                  <p className="text-xs text-gray-400 italic">Espaço reservado para endosso</p>
                </div>
              </div>
            </div>
          </div>

          {/* ── TESTEMUNHAS (opcional) ── */}
          {incluirTestemunhas &&
          <div className="mt-6 pt-4 border-t border-gray-300">
              <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-6 text-center">Testemunhas</p>
              <div className="grid grid-cols-2 gap-12">
                <div className="flex flex-col items-center">
                  <div className="w-full mt-10 border-t-2 border-gray-800 pt-2">
                    <p className="text-sm font-bold text-center">{test1_nome || '___________________________'}</p>
                    <p className="text-xs text-gray-600 mt-0.5 text-center font-bold tracking-wide">TESTEMUNHA 1</p>
                    <p className="text-xs text-gray-500 text-center">CPF: {test1_cpf || '___.___.___-__'}</p>
                  </div>
                </div>
                <div className="flex flex-col items-center">
                  <div className="w-full mt-10 border-t-2 border-gray-800 pt-2">
                    <p className="text-sm font-bold text-center">{test2_nome || '___________________________'}</p>
                    <p className="text-xs text-gray-600 mt-0.5 text-center font-bold tracking-wide">TESTEMUNHA 2</p>
                    <p className="text-xs text-gray-500 text-center">CPF: {test2_cpf || '___.___.___-__'}</p>
                  </div>
                </div>
              </div>
            </div>
          }

          {/* ── RODAPÉ: legal + QR Code ── */}
          <div className="mt-4 pt-3 border-t border-gray-300 flex items-end justify-between gap-4">
            <div className="text-xs text-gray-400 flex-1">
              <p>
                Este título é regido pelo Decreto nº 57.663/1966 (Lei Uniforme de Genebra).
                Constitui título executivo extrajudicial.
              </p>
              {document_hash && (
                <p className="font-mono text-[10px] mt-1 text-gray-400">Hash: {document_hash.substring(0, 32)}…</p>
              )}
            </div>
            <div className="shrink-0 flex flex-col items-center gap-1">
              <QRCodeSVG value={qrData} size={72} level="M" />
              <span className="text-xs text-gray-400 font-mono text-center">Verificar Autenticidade</span>
            </div>
          </div>

        </div>
      </div>
    </div>);

}