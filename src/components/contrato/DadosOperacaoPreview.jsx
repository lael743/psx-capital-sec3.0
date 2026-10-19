/**
 * Demonstrativo / Dados da Operação — modelo conforme PDF oficial
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

export default function DadosOperacaoPreview({ dados }) {
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
  const dataOp = fmtDate(op.start_date);
  const cidadeOp = s.company_city || '';

  const tipoLabel = op.type === 'boleto' ? 'DUPLICATA' : op.type === 'cheque' ? 'CHEQUE' : 'DUPLICATA';
  const produtoLabel = op.produto === 'cheque' ? 'Cheque' : op.produto === 'boleto' ? 'Duplicata Mercantil' : 'Duplicata Mercantil';

  const titulos = cheques.length > 0
    ? cheques
    : (op.installment_schedule || [{ due_date: op.due_date, value: totalBruto }]);

  const qtdSacados = new Set(titulos.map(t => t.sacado_doc || t.sacado_name || '1')).size;

  // Cálculo dos desagios por título
  const titulosComDesagio = titulos.map((t, i) => {
    const dias = t.dias || t.days || prazoMedio;
    const val = t.value || t.valor_face || (totalBruto / titulos.length);
    const desT = Math.round(val * (taxa / 100) * (dias / 30) * 100) / 100;
    return { ...t, dias, val, desT, liq: Math.round((val - desT) * 100) / 100 };
  });

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', fontSize: 11, color: '#222', maxWidth: 800, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <div>
          <div style={{ color: '#1a3a6e', fontSize: 10, fontWeight: 'bold', textTransform: 'uppercase' }}>DADOS DA OPERAÇÃO</div>
          <div style={{ fontSize: 22, fontWeight: 'bold', color: '#111' }}>DADOS DA OPERAÇÃO</div>
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
            <th colSpan={6} style={{ color: '#fff', padding: '5px 8px', fontSize: 10, textAlign: 'left', fontWeight: 'bold' }}>
              DADOS DA OPERAÇÃO
            </th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={{ padding: '5px 8px', fontWeight: 'bold', color: '#1a3a6e', fontSize: 10, width: '15%' }}>CEDENTE</td>
            <td style={{ padding: '5px 8px', fontSize: 10, fontWeight: 'bold', width: '30%' }}>{dados.devedor_nome}</td>
            <td style={{ padding: '5px 8px', fontWeight: 'bold', color: '#1a3a6e', fontSize: 10 }}>DATA DA OPERAÇÃO</td>
            <td style={{ padding: '5px 8px', fontSize: 10, fontWeight: 'bold' }}>{dataOp}</td>
          </tr>
          <tr style={{ background: '#f0f4f8' }}>
            <td style={{ padding: '5px 8px', fontWeight: 'bold', color: '#1a3a6e', fontSize: 10 }}>CNPJ CEDENTE</td>
            <td style={{ padding: '5px 8px', fontSize: 10 }}>{dados.devedor_doc}</td>
            <td style={{ padding: '5px 8px', fontWeight: 'bold', color: '#1a3a6e', fontSize: 10 }}>ETAPA</td>
            <td style={{ padding: '5px 8px', fontSize: 10 }}>{(op.etapa || 'Nova').replace('_', ' ')}</td>
          </tr>
          <tr>
            <td style={{ padding: '5px 8px', fontWeight: 'bold', color: '#1a3a6e', fontSize: 10 }}>PRODUTO</td>
            <td style={{ padding: '5px 8px', fontSize: 10 }}>{produtoLabel}</td>
            <td style={{ padding: '5px 8px', fontWeight: 'bold', color: '#1a3a6e', fontSize: 10 }}>QTD. DE TÍTULOS</td>
            <td style={{ padding: '5px 8px', fontSize: 10, fontWeight: 'bold' }}>{titulos.length}</td>
          </tr>
          <tr style={{ background: '#f0f4f8' }}>
            <td style={{ padding: '5px 8px', fontWeight: 'bold', color: '#1a3a6e', fontSize: 10 }}>TIPO</td>
            <td style={{ padding: '5px 8px', fontSize: 10 }}>{tipoLabel}</td>
            <td style={{ padding: '5px 8px', fontWeight: 'bold', color: '#1a3a6e', fontSize: 10 }}>QTD. DE SACADOS</td>
            <td style={{ padding: '5px 8px', fontSize: 10, fontWeight: 'bold' }}>{qtdSacados}</td>
          </tr>
          <tr>
            <td style={{ padding: '5px 8px', fontWeight: 'bold', color: '#1a3a6e', fontSize: 10 }}>FORMA DE PAGAMENTO</td>
            <td style={{ padding: '5px 8px', fontSize: 10 }}>{op.disbursement_method || 'TED'}</td>
            <td style={{ padding: '5px 8px', fontWeight: 'bold', color: '#1a3a6e', fontSize: 10 }}>TAXA DE DESÁGIO</td>
            <td style={{ padding: '5px 8px', fontSize: 10, fontWeight: 'bold' }}>{taxa.toFixed(2).replace('.', ',')}% a.m.</td>
          </tr>
        </tbody>
      </table>

      {/* Resumo Financeiro 2 colunas */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 8 }}>
        <thead>
          <tr style={{ background: '#1a3a6e' }}>
            <th colSpan={4} style={{ color: '#fff', padding: '5px 8px', fontSize: 10, textAlign: 'left', fontWeight: 'bold' }}>
              RESUMO FINANCEIRO
            </th>
          </tr>
        </thead>
        <tbody>
          <tr style={{ borderBottom: '1px solid #e0e0e0' }}>
            <td style={{ padding: '5px 8px', fontSize: 11, width: '30%' }}>(+) Valor de Face</td>
            <td style={{ padding: '5px 8px', fontSize: 11, textAlign: 'right', fontWeight: 'bold', width: '20%' }}>{fmtCur(totalBruto)}</td>
            <td style={{ padding: '5px 8px', fontSize: 11, width: '30%', color: '#888' }}>(-) Recompra/Repasse</td>
            <td style={{ padding: '5px 8px', fontSize: 11, textAlign: 'right', width: '20%' }}>R$ 0,00</td>
          </tr>
          <tr style={{ borderBottom: '1px solid #e0e0e0' }}>
            <td style={{ padding: '5px 8px', fontSize: 11 }}>(-) Deságio</td>
            <td style={{ padding: '5px 8px', fontSize: 11, textAlign: 'right', color: '#c0392b' }}>{fmtCur(desagio)}</td>
            <td style={{ padding: '5px 8px', fontSize: 11, color: '#888' }}>(-) Pendências</td>
            <td style={{ padding: '5px 8px', fontSize: 11, textAlign: 'right' }}>R$ 0,00</td>
          </tr>
          <tr style={{ borderBottom: '1px solid #e0e0e0' }}>
            <td style={{ padding: '5px 8px', fontSize: 11 }}>(-) Tarifas</td>
            <td style={{ padding: '5px 8px', fontSize: 11, textAlign: 'right', color: '#c0392b' }}>{fmtCur(tarifas)}</td>
            <td style={{ padding: '5px 8px', fontSize: 11, color: '#888' }}>(+) Créd. Cedente</td>
            <td style={{ padding: '5px 8px', fontSize: 11, textAlign: 'right' }}>R$ 0,00</td>
          </tr>
          <tr style={{ borderBottom: '1px solid #e0e0e0', background: '#f0f4f8' }}>
            <td style={{ padding: '5px 8px', fontSize: 11, fontWeight: 'bold' }}>(=) Valor Líquido</td>
            <td style={{ padding: '5px 8px', fontSize: 11, textAlign: 'right', fontWeight: 'bold' }}>{fmtCur(netValue)}</td>
            <td style={{ padding: '5px 8px', fontSize: 11, fontWeight: 'bold' }}>(=) Total Débitos/Créd.</td>
            <td style={{ padding: '5px 8px', fontSize: 11, textAlign: 'right', fontWeight: 'bold' }}>R$ 0,00</td>
          </tr>
          <tr>
            <td colSpan={2} style={{ padding: '4px 8px', fontSize: 10, color: '#555', fontStyle: 'italic' }}>
              ({numPorExtenso(netValue)})
            </td>
            <td style={{ padding: '5px 8px', fontSize: 11, fontWeight: 'bold' }}>(=) Líquido Liberado</td>
            <td style={{ padding: '5px 8px', fontSize: 11, textAlign: 'right', fontWeight: 'bold' }}>{fmtCur(netValue)}</td>
          </tr>
          <tr>
            <td colSpan={2} style={{ padding: '5px 8px', fontSize: 11 }}>(-) Pagamento</td>
            <td style={{ padding: '5px 8px', fontSize: 11, textAlign: 'right' }}>{fmtCur(op.amount_paid || 0)}</td>
            <td></td>
          </tr>
          <tr style={{ background: '#f0f4f8' }}>
            <td style={{ padding: '5px 8px', fontWeight: 'bold', fontSize: 10, color: '#1a3a6e' }}>PRAZO MÉDIO</td>
            <td colSpan={1} style={{ padding: '5px 8px', fontWeight: 'bold', fontSize: 10 }}>{prazoMedio} dias</td>
            <td style={{ padding: '5px 8px', fontWeight: 'bold', fontSize: 10, color: '#1a3a6e' }}>PRAZO MÉDIO TOTAL</td>
            <td style={{ padding: '5px 8px', fontWeight: 'bold', fontSize: 10 }}>{prazoMedio} dias</td>
          </tr>
          <tr>
            <td style={{ padding: '5px 8px', fontWeight: 'bold', fontSize: 10, color: '#1a3a6e' }}>DESÁGIO PERÍODO</td>
            <td colSpan={3} style={{ padding: '5px 8px', fontWeight: 'bold', fontSize: 10 }}>{taxa.toFixed(2).replace('.', ',')}% a.m.</td>
          </tr>
        </tbody>
      </table>

      {/* Documentos da Operação */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16 }}>
        <thead>
          <tr style={{ background: '#1a3a6e' }}>
            <th style={{ color: '#fff', padding: '5px 6px', fontSize: 10, textAlign: 'left' }}>SACADO</th>
            <th style={{ color: '#fff', padding: '5px 6px', fontSize: 10 }}>CPF/CNPJ</th>
            <th style={{ color: '#fff', padding: '5px 6px', fontSize: 10 }}>TIPO</th>
            <th style={{ color: '#fff', padding: '5px 6px', fontSize: 10 }}>N.º</th>
            <th style={{ color: '#fff', padding: '5px 6px', fontSize: 10 }}>VENCTO</th>
            <th style={{ color: '#fff', padding: '5px 6px', fontSize: 10 }}>DIAS</th>
            <th style={{ color: '#fff', padding: '5px 6px', fontSize: 10, textAlign: 'right' }}>VALOR</th>
            <th style={{ color: '#fff', padding: '5px 6px', fontSize: 10, textAlign: 'right' }}>DESÁGIO</th>
            <th style={{ color: '#fff', padding: '5px 6px', fontSize: 10, textAlign: 'right' }}>OUTRAS</th>
            <th style={{ color: '#fff', padding: '5px 6px', fontSize: 10, textAlign: 'right' }}>LÍQUIDO</th>
          </tr>
        </thead>
        <tbody>
          {titulosComDesagio.map((t, i) => (
            <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#f9f9f9', borderBottom: '1px solid #e0e0e0' }}>
              <td style={{ padding: '5px 6px', fontSize: 10, fontWeight: 'bold' }}>{(t.sacado_name || dados.devedor_nome || '').toUpperCase()}</td>
              <td style={{ padding: '5px 6px', fontSize: 10 }}>{t.sacado_doc || dados.devedor_doc || ''}</td>
              <td style={{ padding: '5px 6px', fontSize: 10 }}>{(t.tipo || tipoLabel).toUpperCase().substring(0, 7)}</td>
              <td style={{ padding: '5px 6px', fontSize: 10, textAlign: 'center' }}>{t.check_number || String(i + 1).padStart(3, '0')}</td>
              <td style={{ padding: '5px 6px', fontSize: 10, textAlign: 'center' }}>{fmtDate(t.compensation_date || t.due_date)}</td>
              <td style={{ padding: '5px 6px', fontSize: 10, textAlign: 'center' }}>{t.dias}</td>
              <td style={{ padding: '5px 6px', fontSize: 10, textAlign: 'right' }}>{fmtCur(t.val)}</td>
              <td style={{ padding: '5px 6px', fontSize: 10, textAlign: 'right', color: '#c0392b' }}>{fmtCur(t.desT)}</td>
              <td style={{ padding: '5px 6px', fontSize: 10, textAlign: 'right' }}>R$ 0,00</td>
              <td style={{ padding: '5px 6px', fontSize: 10, textAlign: 'right', fontWeight: 'bold' }}>{fmtCur(t.liq)}</td>
            </tr>
          ))}
          <tr style={{ background: '#e8ecf0', fontWeight: 'bold' }}>
            <td colSpan={6} style={{ padding: '5px 6px', fontSize: 10 }}>Total ({titulos.length} título(s))</td>
            <td style={{ padding: '5px 6px', fontSize: 10, textAlign: 'right' }}>{fmtCur(totalBruto)}</td>
            <td style={{ padding: '5px 6px', fontSize: 10, textAlign: 'right', color: '#c0392b' }}>{fmtCur(desagio)}</td>
            <td style={{ padding: '5px 6px', fontSize: 10, textAlign: 'right' }}>R$ 0,00</td>
            <td style={{ padding: '5px 6px', fontSize: 10, textAlign: 'right' }}>{fmtCur(netValue + tarifas)}</td>
          </tr>
        </tbody>
      </table>

      <div style={{ fontSize: 10, color: '#555', marginBottom: 8 }}>
        {cidadeOp}, {dataOp}.
      </div>
      {documentHash && (
        <div style={{ borderTop: '1px solid #eee', paddingTop: 6, fontSize: 8, color: '#aaa', fontFamily: 'monospace' }}>
          Hash: {documentHash.substring(0, 32)}…
        </div>
      )}
    </div>
  );
}