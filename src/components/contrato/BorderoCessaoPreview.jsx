/**
 * Borderô de Cessão de Crédito — modelo conforme PDF oficial
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

export default function BorderoCessaoPreview({ dados }) {
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
  const taxa = op.rate || 0;
  const prazoMedio = op.days || 0;

  const tipoLabel = op.type === 'boleto' ? 'DUPLICATA' : op.type === 'cheque' ? 'CHEQUE' : 'DUPLICATA';

  // Títulos: se tem cheques usa cheques, senão usa installment_schedule ou cria 1 linha
  const titulos = cheques.length > 0
    ? cheques
    : (op.installment_schedule || [{ due_date: op.due_date, value: totalBruto }]);

  const dataOp = fmtDate(op.start_date);
  const cidadeOp = s.company_city || '';
  const today = new Date().toLocaleDateString('pt-BR');

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', fontSize: 11, color: '#222', maxWidth: 780, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <div>
          <div style={{ color: '#1a3a6e', fontSize: 10, fontWeight: 'bold', textTransform: 'uppercase' }}>DOCUMENTO DE CESSÃO</div>
          <div style={{ fontSize: 22, fontWeight: 'bold', color: '#111' }}>BORDERÔ DE CESSÃO DE CRÉDITO</div>
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

      {/* Dados da Operação */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 8 }}>
        <thead>
          <tr style={{ background: '#1a3a6e' }}>
            <th colSpan={6} style={{ color: '#fff', textAlign: 'left', padding: '5px 8px', fontSize: 10, fontWeight: 'bold' }}>
              DADOS DA OPERAÇÃO
            </th>
          </tr>
        </thead>
        <tbody>
          <tr style={{ background: '#f0f4f8' }}>
            <td style={{ padding: '5px 8px', fontWeight: 'bold', fontSize: 10, width: '14%' }}>N.º OPERAÇÃO:</td>
            <td style={{ padding: '5px 8px', fontSize: 10 }}>{numOp}</td>
            <td style={{ padding: '5px 8px', fontWeight: 'bold', fontSize: 10, width: '8%' }}>DATA:</td>
            <td style={{ padding: '5px 8px', fontSize: 10 }}>{dataOp}</td>
            <td colSpan={2}></td>
          </tr>
          <tr>
            <td style={{ padding: '5px 8px', fontWeight: 'bold', fontSize: 10 }}>CEDENTE:</td>
            <td style={{ padding: '5px 8px', fontSize: 10 }}>{dados.devedor_nome || ''}</td>
            <td style={{ padding: '5px 8px', fontWeight: 'bold', fontSize: 10 }}>CNPJ CEDENTE:</td>
            <td style={{ padding: '5px 8px', fontSize: 10 }}>{dados.devedor_doc || ''}</td>
            <td colSpan={2}></td>
          </tr>
          <tr style={{ background: '#f0f4f8' }}>
            <td style={{ padding: '5px 8px', fontWeight: 'bold', fontSize: 10 }}>TIPO:</td>
            <td style={{ padding: '5px 8px', fontSize: 10 }}>{tipoLabel}</td>
            <td style={{ padding: '5px 8px', fontWeight: 'bold', fontSize: 10 }}>TAXA DESÁGIO:</td>
            <td style={{ padding: '5px 8px', fontSize: 10 }}>{taxa.toFixed(2).replace('.', ',')}% a.m.</td>
            <td colSpan={2}></td>
          </tr>
        </tbody>
      </table>

      {/* Relação dos Créditos */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 8 }}>
        <thead>
          <tr style={{ background: '#1a3a6e' }}>
            <th style={{ color: '#fff', padding: '5px 6px', fontSize: 10, textAlign: 'left' }}>#</th>
            <th style={{ color: '#fff', padding: '5px 6px', fontSize: 10, textAlign: 'left' }}>SACADO</th>
            <th style={{ color: '#fff', padding: '5px 6px', fontSize: 10, textAlign: 'center' }}>TIPO</th>
            <th style={{ color: '#fff', padding: '5px 6px', fontSize: 10, textAlign: 'center' }}>N.º DOC</th>
            <th style={{ color: '#fff', padding: '5px 6px', fontSize: 10, textAlign: 'center' }}>VENCTO</th>
            <th style={{ color: '#fff', padding: '5px 6px', fontSize: 10, textAlign: 'center' }}>DIAS</th>
            <th style={{ color: '#fff', padding: '5px 6px', fontSize: 10, textAlign: 'right' }}>VALOR</th>
            <th style={{ color: '#fff', padding: '5px 6px', fontSize: 10, textAlign: 'center' }}>NF-E</th>
          </tr>
        </thead>
        <tbody>
          {titulos.map((t, i) => (
            <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#f9f9f9', borderBottom: '1px solid #e0e0e0' }}>
              <td style={{ padding: '5px 6px', fontSize: 10 }}>{i + 1}</td>
              <td style={{ padding: '5px 6px', fontSize: 10 }}>
                <div style={{ fontWeight: 'bold' }}>{(t.sacado_name || dados.devedor_nome || '').toUpperCase()}</div>
                <div style={{ color: '#666' }}>{t.sacado_doc || dados.devedor_doc || ''}</div>
              </td>
              <td style={{ padding: '5px 6px', fontSize: 10, textAlign: 'center' }}>
                {(t.tipo || tipoLabel).toUpperCase().substring(0, 7)}
              </td>
              <td style={{ padding: '5px 6px', fontSize: 10, textAlign: 'center' }}>{t.check_number || String(i + 1).padStart(3, '0')}</td>
              <td style={{ padding: '5px 6px', fontSize: 10, textAlign: 'center' }}>{fmtDate(t.compensation_date || t.due_date)}</td>
              <td style={{ padding: '5px 6px', fontSize: 10, textAlign: 'center' }}>{t.dias || t.days || ''}</td>
              <td style={{ padding: '5px 6px', fontSize: 10, textAlign: 'right', fontWeight: 'bold' }}>{fmtCur(t.value || t.valor_face || 0)}</td>
              <td style={{ padding: '5px 6px', fontSize: 10, textAlign: 'center', color: '#666' }}>{t.nf || ''}</td>
            </tr>
          ))}
          <tr style={{ background: '#e8ecf0', fontWeight: 'bold' }}>
            <td colSpan={6} style={{ padding: '5px 6px', fontSize: 10 }}>TOTAL — {titulos.length} título(s)</td>
            <td style={{ padding: '5px 6px', fontSize: 10, textAlign: 'right' }}>{fmtCur(totalBruto)}</td>
            <td></td>
          </tr>
        </tbody>
      </table>

      {/* Resumo Financeiro */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16 }}>
        <thead>
          <tr style={{ background: '#1a3a6e' }}>
            <th colSpan={2} style={{ color: '#fff', padding: '5px 8px', fontSize: 10, textAlign: 'left', fontWeight: 'bold' }}>
              RESUMO FINANCEIRO
            </th>
          </tr>
        </thead>
        <tbody>
          <tr style={{ borderBottom: '1px solid #e0e0e0' }}>
            <td style={{ padding: '6px 8px', fontSize: 11 }}>(+) Total Bruto dos Créditos:</td>
            <td style={{ padding: '6px 8px', fontSize: 11, textAlign: 'right', fontWeight: 'bold' }}>{fmtCur(totalBruto)}</td>
          </tr>
          <tr style={{ borderBottom: '1px solid #e0e0e0' }}>
            <td style={{ padding: '6px 8px', fontSize: 11 }}>(-) Deságio:</td>
            <td style={{ padding: '6px 8px', fontSize: 11, textAlign: 'right', color: '#c0392b' }}>{fmtCur(desagio)}</td>
          </tr>
          <tr style={{ borderBottom: '1px solid #e0e0e0' }}>
            <td style={{ padding: '6px 8px', fontSize: 11 }}>(-) Tarifas:</td>
            <td style={{ padding: '6px 8px', fontSize: 11, textAlign: 'right', color: '#c0392b' }}>{fmtCur(tarifas)}</td>
          </tr>
          <tr style={{ background: '#f0f4f8' }}>
            <td style={{ padding: '8px 8px', fontSize: 16, fontWeight: 'bold' }}>(=) Valor Líquido:</td>
            <td style={{ padding: '8px 8px', fontSize: 16, textAlign: 'right', fontWeight: 'bold' }}>{fmtCur(netValue)}</td>
          </tr>
          <tr>
            <td colSpan={2} style={{ padding: '4px 8px', fontSize: 10, color: '#555', fontStyle: 'italic' }}>
              ({numPorExtenso(netValue)})
            </td>
          </tr>
          <tr>
            <td colSpan={2} style={{ padding: '4px 8px', fontSize: 10, color: '#555' }}>
              Prazo Médio: {prazoMedio} dias | Prazo Médio Total: {prazoMedio} dias
            </td>
          </tr>
        </tbody>
      </table>

      {/* Assinaturas */}
      <div style={{ textAlign: 'center', fontWeight: 'bold', marginBottom: 24, fontSize: 12 }}>
        {cidadeOp}, {dataOp}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-around', marginTop: 32 }}>
        <div style={{ textAlign: 'center', width: '30%' }}>
          <div style={{ borderTop: '1px solid #333', paddingTop: 4 }}>
            <div style={{ fontWeight: 'bold', fontSize: 10 }}>{(s.company_name || '').toUpperCase()}</div>
            <div style={{ color: '#1a3a6e', fontSize: 10 }}>CNPJ: {s.company_document || ''}</div>
            <div style={{ color: '#1a3a6e', fontSize: 10 }}>Cessionária</div>
          </div>
        </div>
        <div style={{ textAlign: 'center', width: '30%' }}>
          <div style={{ borderTop: '1px solid #333', paddingTop: 4 }}>
            <div style={{ fontWeight: 'bold', fontSize: 10 }}>{dados.devedor_nome}</div>
            <div style={{ color: '#1a3a6e', fontSize: 10 }}>CNPJ: {dados.devedor_doc}</div>
            <div style={{ color: '#1a3a6e', fontSize: 10 }}>Cedente</div>
          </div>
        </div>
        <div style={{ textAlign: 'center', width: '30%' }}>
          <div style={{ borderTop: '1px solid #333', paddingTop: 4 }}>
            <div style={{ fontWeight: 'bold', fontSize: 10 }}>{dados.avalista_nome || ''}</div>
            {dados.avalista_doc && <div style={{ color: '#1a3a6e', fontSize: 10 }}>CPF: {dados.avalista_doc}</div>}
            {dados.avalista_nome && <div style={{ color: '#1a3a6e', fontSize: 10 }}>Sócio</div>}
          </div>
        </div>
      </div>

      {/* Rodapé */}
      <div style={{ borderTop: '1px solid #ccc', marginTop: 24, paddingTop: 6, fontSize: 9, color: '#888', textAlign: 'center' }}>
        Borderô de Cessão — Operação {numOp} — Gerado em {today} — {(s.company_name || '').toUpperCase()}
        {documentHash && (
          <div style={{ fontFamily: 'monospace', fontSize: 8, marginTop: 2 }}>Hash: {documentHash.substring(0, 32)}…</div>
        )}
      </div>
    </div>
  );
}