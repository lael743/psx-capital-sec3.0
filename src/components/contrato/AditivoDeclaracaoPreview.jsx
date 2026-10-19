/**
 * Aditivo — Declaração de Recebimento (modelo conforme PDF oficial)
 */
import { numPorExtenso } from '@/lib/numPorExtenso';

const STORAGE_KEY = 'psx_company_settings';
function getSettings() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch { return {}; }
}

function fmtCur(v) {
  return (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
function fmtDate(str) {
  if (!str) return '';
  const [y, m, d] = str.split('-');
  return `${d}/${m}/${y}`;
}

export default function AditivoDeclaracaoPreview({ dados }) {
  const s = getSettings();
  if (!dados) return null;

  const op = dados.operacao || {};
  const cheques = dados.cheques || [];
  const documentHash = dados.document_hash || '';
  const numOp = String(op.numero_operacao || op.id?.slice(-6) || '').padStart(6, '0');
  const contratoNum = `OP-${numOp}`;
  const totalBruto = op.gross_value || 0;
  const desagio = (totalBruto - (op.net_value || 0)) || 0;
  const tarifas = (op.tarifa_operacao || 0) + (op.tarifa_por_titulo || 0) * (cheques.length || 1);
  const netValue = op.net_value || 0;
  const dataOp = fmtDate(op.start_date);
  const cidadeOp = s.company_city || '';

  const titulos = cheques.length > 0
    ? cheques
    : (op.installment_schedule || [{ due_date: op.due_date, value: totalBruto }]);

  // Dados bancários do cliente
  const bankName = op.repasse_bank_name || s.company_bank || '';
  const pixKey = s.company_pix || '';

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', fontSize: 11, color: '#222', maxWidth: 780, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <div>
          <div style={{ color: '#1a3a6e', fontSize: 10, fontWeight: 'bold', textTransform: 'uppercase' }}>RECEBIMENTO E QUITAÇÃO</div>
          <div style={{ fontSize: 22, fontWeight: 'bold', color: '#111' }}>DECLARAÇÃO DE RECEBIMENTO</div>
          <div style={{ fontSize: 10, color: '#555', marginTop: 2 }}>
            Operação N.º {numOp} — Contrato N.º {contratoNum}
          </div>
        </div>
        <div style={{ textAlign: 'right', fontSize: 10 }}>
          <div style={{ fontWeight: 'bold', color: '#1a3a6e' }}>{(s.company_name || '').toUpperCase()}</div>
          <div style={{ color: '#555' }}>CNPJ: {s.company_document || ''}</div>
          <div style={{ color: '#555' }}>{s.company_address || ''}</div>
        </div>
      </div>

      {/* 1. Dados do Cedente */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 8 }}>
        <thead>
          <tr style={{ background: '#1a3a6e' }}>
            <th colSpan={4} style={{ color: '#fff', padding: '5px 8px', fontSize: 10, textAlign: 'left', fontWeight: 'bold' }}>
              1. DADOS DO CEDENTE
            </th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={{ padding: '6px 8px', fontWeight: 'bold', fontSize: 10, color: '#1a3a6e', width: '16%' }}>RAZÃO SOCIAL:</td>
            <td style={{ padding: '6px 8px', fontSize: 10, fontWeight: 'bold', width: '35%' }}>{dados.devedor_nome}</td>
            <td style={{ padding: '6px 8px', fontWeight: 'bold', fontSize: 10, color: '#1a3a6e', width: '10%' }}>CNPJ:</td>
            <td style={{ padding: '6px 8px', fontSize: 10 }}>{dados.devedor_doc}</td>
          </tr>
          {dados.avalista_nome && (
            <tr style={{ background: '#f0f4f8' }}>
              <td style={{ padding: '6px 8px', fontWeight: 'bold', fontSize: 10, color: '#1a3a6e' }}>REPRESENTANTE:</td>
              <td style={{ padding: '6px 8px', fontSize: 10 }}>{dados.avalista_nome}</td>
              <td style={{ padding: '6px 8px', fontWeight: 'bold', fontSize: 10, color: '#1a3a6e' }}>CPF:</td>
              <td style={{ padding: '6px 8px', fontSize: 10 }}>{dados.avalista_doc}</td>
            </tr>
          )}
        </tbody>
      </table>

      {/* 2. Cálculo da Operação */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 8 }}>
        <thead>
          <tr style={{ background: '#1a3a6e' }}>
            <th colSpan={2} style={{ color: '#fff', padding: '5px 8px', fontSize: 10, textAlign: 'left', fontWeight: 'bold' }}>
              2. CÁLCULO DA OPERAÇÃO
            </th>
          </tr>
        </thead>
        <tbody>
          <tr style={{ borderBottom: '1px solid #e8e8e8' }}>
            <td style={{ padding: '7px 8px', fontSize: 11 }}>(+) Total Bruto dos Créditos</td>
            <td style={{ padding: '7px 8px', fontSize: 11, textAlign: 'right', fontWeight: 'bold' }}>{fmtCur(totalBruto)}</td>
          </tr>
          <tr style={{ borderBottom: '1px solid #e8e8e8' }}>
            <td style={{ padding: '7px 8px', fontSize: 11 }}>(-) Deságio:</td>
            <td style={{ padding: '7px 8px', fontSize: 11, textAlign: 'right', color: '#c0392b' }}>{fmtCur(desagio)}</td>
          </tr>
          <tr style={{ borderBottom: '1px solid #e8e8e8' }}>
            <td style={{ padding: '7px 8px', fontSize: 11 }}>(-) Tarifas</td>
            <td style={{ padding: '7px 8px', fontSize: 11, textAlign: 'right', color: '#c0392b' }}>{fmtCur(tarifas)}</td>
          </tr>
          <tr style={{ background: '#f0f4f8' }}>
            <td style={{ padding: '7px 8px', fontSize: 13, fontWeight: 'bold' }}>(=) Valor Líquido</td>
            <td style={{ padding: '7px 8px', fontSize: 13, textAlign: 'right', fontWeight: 'bold' }}>{fmtCur(netValue)}</td>
          </tr>
        </tbody>
      </table>

      {/* 3. Relação dos Créditos Negociados */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 8 }}>
        <thead>
          <tr style={{ background: '#1a3a6e' }}>
            <th style={{ color: '#fff', padding: '5px 6px', fontSize: 10, textAlign: 'left' }}>#</th>
            <th style={{ color: '#fff', padding: '5px 6px', fontSize: 10, textAlign: 'left' }}>SACADO</th>
            <th style={{ color: '#fff', padding: '5px 6px', fontSize: 10, textAlign: 'center' }}>DOCUMENTO</th>
            <th style={{ color: '#fff', padding: '5px 6px', fontSize: 10, textAlign: 'center' }}>VENCIMENTO</th>
            <th style={{ color: '#fff', padding: '5px 6px', fontSize: 10, textAlign: 'right' }}>VALOR</th>
          </tr>
        </thead>
        <tbody>
          {titulos.map((t, i) => (
            <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#f9f9f9', borderBottom: '1px solid #e0e0e0' }}>
              <td style={{ padding: '5px 6px', fontSize: 10 }}>{i + 1}</td>
              <td style={{ padding: '5px 6px', fontSize: 10 }}>
                <div style={{ fontWeight: 'bold' }}>{(t.sacado_name || dados.devedor_nome || '').toUpperCase()}</div>
                <div style={{ color: '#666', fontSize: 10 }}>{t.sacado_doc || dados.devedor_doc || ''}</div>
              </td>
              <td style={{ padding: '5px 6px', fontSize: 10, textAlign: 'center' }}>{t.check_number || String(i + 1).padStart(3, '0')}</td>
              <td style={{ padding: '5px 6px', fontSize: 10, textAlign: 'center' }}>{fmtDate(t.compensation_date || t.due_date)}</td>
              <td style={{ padding: '5px 6px', fontSize: 10, textAlign: 'right', fontWeight: 'bold' }}>{fmtCur(t.value || t.valor_face || 0)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Declaração */}
      <p style={{ fontSize: 11, textAlign: 'justify', marginBottom: 12, lineHeight: 1.6 }}>
        Declaro(amos) para os devidos fins que recebi(emos) de{' '}
        <strong>{(s.company_name || '').toUpperCase()}</strong>, inscrita no CNPJ sob o n.º{' '}
        <strong>{s.company_document}</strong>, a importância líquida de{' '}
        <strong>{fmtCur(netValue)} ({numPorExtenso(netValue)})</strong>, referente à cessão dos
        créditos acima relacionados, dando plena, rasa, geral e irrevogável quitação, para nada mais
        reclamar a qualquer título, conforme Contrato de Cessão N.º {contratoNum}.
      </p>

      {/* 4. Forma de Pagamento */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16 }}>
        <thead>
          <tr style={{ background: '#1a3a6e' }}>
            <th colSpan={5} style={{ color: '#fff', padding: '5px 8px', fontSize: 10, textAlign: 'left', fontWeight: 'bold' }}>
              4. FORMA DE PAGAMENTO
            </th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={{ padding: '8px', fontSize: 10 }}>
              <div style={{ fontWeight: 'bold', color: '#1a3a6e', fontSize: 9, marginBottom: 3 }}>BANCO</div>
              <div style={{ fontSize: 11 }}>{bankName || '—'}</div>
            </td>
            <td style={{ padding: '8px', fontSize: 10 }}>
              <div style={{ fontWeight: 'bold', color: '#1a3a6e', fontSize: 9, marginBottom: 3 }}>CHAVE PIX</div>
              <div style={{ fontSize: 11 }}>{pixKey || '—'}</div>
            </td>
            <td style={{ padding: '8px', fontSize: 10 }}>
              <div style={{ fontWeight: 'bold', color: '#1a3a6e', fontSize: 9, marginBottom: 3 }}>FAVORECIDO</div>
              <div style={{ fontSize: 11, fontWeight: 'bold' }}>{(s.company_name || '').toUpperCase()}</div>
            </td>
            <td style={{ padding: '8px', fontSize: 10, textAlign: 'right' }}>
              <div style={{ fontWeight: 'bold', color: '#1a3a6e', fontSize: 9, marginBottom: 3 }}>VALOR</div>
              <div style={{ fontSize: 13, fontWeight: 'bold', color: '#1a3a6e' }}>{fmtCur(netValue)}</div>
            </td>
          </tr>
        </tbody>
      </table>

      {/* Data e assinaturas */}
      <div style={{ textAlign: 'center', fontWeight: 'bold', marginBottom: 32, fontSize: 12 }}>
        {cidadeOp}, {dataOp}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-around', marginTop: 16 }}>
        <div style={{ textAlign: 'center', width: '30%' }}>
          <div style={{ borderTop: '1px solid #333', paddingTop: 4 }}>
            <div style={{ fontWeight: 'bold', fontSize: 10 }}>{dados.devedor_nome}</div>
            <div style={{ color: '#1a3a6e', fontSize: 10 }}>CNPJ: {dados.devedor_doc}</div>
            <div style={{ color: '#1a3a6e', fontSize: 10 }}>Cedente</div>
          </div>
        </div>
        <div style={{ textAlign: 'center', width: '30%' }}>
          <div style={{ borderTop: '1px solid #333', paddingTop: 4 }}>
            <div style={{ fontWeight: 'bold', fontSize: 10 }}>{(s.company_name || '').toUpperCase()}</div>
            <div style={{ color: '#1a3a6e', fontSize: 10 }}>CNPJ: {s.company_document}</div>
            <div style={{ color: '#1a3a6e', fontSize: 10 }}>Cessionária / Securitizadora</div>
          </div>
        </div>
        {dados.avalista_nome && (
          <div style={{ textAlign: 'center', width: '30%' }}>
            <div style={{ borderTop: '1px solid #333', paddingTop: 4 }}>
              <div style={{ fontWeight: 'bold', fontSize: 10 }}>{dados.avalista_nome}</div>
              <div style={{ color: '#1a3a6e', fontSize: 10 }}>CPF: {dados.avalista_doc}</div>
              <div style={{ color: '#1a3a6e', fontSize: 10 }}>Sócio</div>
            </div>
          </div>
        )}
      </div>
      {documentHash && (
        <div style={{ marginTop: 20, paddingTop: 6, borderTop: '1px solid #eee', fontSize: 8, color: '#aaa', fontFamily: 'monospace' }}>
          Hash: {documentHash.substring(0, 32)}…
        </div>
      )}
    </div>
  );
}