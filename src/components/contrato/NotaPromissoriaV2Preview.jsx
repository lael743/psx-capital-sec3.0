/**
 * Nota Promissória — modelo conforme PDF oficial (CONFIA / PSX)
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
function dateToExtenso(str) {
  if (!str) return '';
  const meses = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
  const [y, m, d] = str.split('-');
  return `${parseInt(d)} de ${meses[parseInt(m) - 1]} de ${y}`;
}

const cell = (label, value, opts = {}) => (
  <div style={{ marginBottom: opts.noMargin ? 0 : 10 }}>
    <div style={{ fontSize: 8, color: '#999', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 2 }}>{label}</div>
    <div style={{ fontSize: 11, fontWeight: 700, color: '#111', lineHeight: 1.3 }}>{value || '—'}</div>
  </div>
);

export default function NotaPromissoriaV2Preview({ dados }) {
  const s = getSettings();
  if (!dados) return null;

  const op = dados.operacao || {};
  const documentHash = dados.document_hash || '';
  const numOp = String(op.numero_operacao || op.id?.slice(-6) || '').padStart(6, '0');
  const valorFace = op.total_receivable || op.gross_value || 0;
  const vencimento = op.due_date || '';
  const emissao = op.start_date || '';

  // Beneficiário = empresa (credor)
  const benefNome = (dados.credor_nome || s.company_name || '').toUpperCase();
  const benefDoc = dados.credor_doc || s.company_document || '';
  const benefEndereco = (dados.credor_endereco || s.company_address || '').toUpperCase();
  const benefCidade = (dados.credor_cidade || s.company_city || '').toUpperCase();
  const benefEstado = (dados.credor_estado || s.company_state || '').toUpperCase();
  const benefCep = s.company_zip || '';

  // Emitente = devedor/cedente (cliente)
  const emitNome = (dados.devedor_nome || '').toUpperCase();
  const emitDoc = dados.devedor_doc || '';
  const emitEndereco = (dados.devedor_endereco || '').toUpperCase();
  const emitCidade = (dados.devedor_cidade || '').toUpperCase();
  const emitEstado = (dados.devedor_estado || '').toUpperCase();
  // CEP: tenta no cliente via op.zip_code (não existe direto) — usa a cidade como fallback
  const emitCep = op.client_zip || dados.devedor_zip || '';

  const cidadeEmissao = benefCidade || s.company_city || '';

  // Avalistas
  const avalistas = dados.avalista_nome
    ? [{ nome: dados.avalista_nome, doc: dados.avalista_doc }]
    : [];

  const border = '1px solid #e0e0e0';
  const headerBg = '#1a1a2e';
  const accentColor = '#c8a550';

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', fontSize: 11, color: '#222', maxWidth: 740, margin: '0 auto', backgroundColor: '#fff' }}>

      {/* ── CABEÇALHO ── */}
      <div style={{ background: headerBg, borderRadius: '6px 6px 0 0', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 0 }}>
        <div>
          <div style={{ fontSize: 9, color: '#aaa', fontWeight: 600, letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 4 }}>Título de Crédito</div>
          <div style={{ fontSize: 26, fontWeight: 800, color: '#fff', lineHeight: 1 }}>Nota Promissória</div>
          <div style={{ fontSize: 10, color: accentColor, marginTop: 4, fontWeight: 600 }}>Operação N.º {numOp}</div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ background: '#ffffff14', border: '1px solid #ffffff22', borderRadius: 6, padding: '8px 16px', minWidth: 90, textAlign: 'center' }}>
            <div style={{ fontSize: 8, color: '#aaa', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Nº</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#fff' }}>{numOp}</div>
          </div>
          <div style={{ background: accentColor, borderRadius: 6, padding: '8px 16px', minWidth: 140, textAlign: 'center' }}>
            <div style={{ fontSize: 8, color: '#7a5a10', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 700 }}>Valor</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#1a1a2e' }}>{fmtCur(valorFace)}</div>
          </div>
        </div>
      </div>

      {/* ── FAIXA: VENCIMENTO | PAGÁVEL EM | LOCAL DE EMISSÃO ── */}
      <div style={{ display: 'flex', border, borderTop: 'none', backgroundColor: '#fafafa' }}>
        <div style={{ flex: 1, padding: '10px 14px', borderRight: border }}>
          <div style={{ fontSize: 8, color: '#999', fontWeight: 600, textTransform: 'uppercase', marginBottom: 3 }}>Vencimento</div>
          <div style={{ fontWeight: 800, fontSize: 13, color: '#111' }}>{fmtDate(vencimento)}</div>
          <div style={{ fontSize: 9, color: '#777', marginTop: 1 }}>{dateToExtenso(vencimento)}</div>
        </div>
        <div style={{ flex: 1, padding: '10px 14px', borderRight: border }}>
          <div style={{ fontSize: 8, color: '#999', fontWeight: 600, textTransform: 'uppercase', marginBottom: 3 }}>Pagável em</div>
          <div style={{ fontWeight: 800, fontSize: 13, color: '#111' }}>{cidadeEmissao}</div>
          <div style={{ fontSize: 9, color: '#777', marginTop: 1 }}>Praça de pagamento</div>
        </div>
        <div style={{ flex: 2, padding: '10px 14px' }}>
          <div style={{ fontSize: 8, color: '#999', fontWeight: 600, textTransform: 'uppercase', marginBottom: 3 }}>Local de Emissão</div>
          <div style={{ fontWeight: 700, fontSize: 11, color: '#111' }}>{benefEndereco || cidadeEmissao}</div>
          <div style={{ fontSize: 9, color: '#777', marginTop: 1 }}>{cidadeEmissao}{benefEstado ? ` / ${benefEstado}` : ''}</div>
        </div>
      </div>

      {/* ── TEXTO PRINCIPAL ── */}
      <div style={{ border, borderTop: 'none', padding: '14px 16px', lineHeight: 1.8, backgroundColor: '#fff' }}>
        <p style={{ fontSize: 12, textAlign: 'justify', margin: 0, color: '#333' }}>
          Ao(s) <strong style={{ color: '#111' }}>{fmtDate(vencimento)}</strong>, pagarei por esta única via de{' '}
          <strong style={{ color: '#111' }}>NOTA PROMISSÓRIA</strong> a{' '}
          <strong style={{ color: '#111' }}>{benefNome}</strong>, inscrito(a) no CPF/CNPJ sob o nº{' '}
          <strong style={{ color: '#111' }}>{benefDoc}</strong>, ou à sua ordem, a quantia abaixo discriminada, em moeda corrente deste país.
        </p>
      </div>

      {/* ── VALOR POR EXTENSO ── */}
      <div style={{ border, borderTop: 'none', padding: '10px 16px', backgroundColor: '#fffef7' }}>
        <div style={{ fontSize: 8, color: '#999', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>Valor por Extenso</div>
        <div style={{ fontWeight: 700, fontSize: 12, color: '#111' }}>
          {numPorExtenso(valorFace)}{' '}
          <span style={{ color: '#bbb', letterSpacing: '-1px' }}>{'*'.repeat(Math.max(0, 90 - numPorExtenso(valorFace).length))}</span>
        </div>
      </div>

      {/* ── BENEFICIÁRIO / EMITENTE ── */}
      <div style={{ display: 'flex', border, borderTop: 'none' }}>
        {/* Beneficiário */}
        <div style={{ flex: 1, padding: '14px 16px', borderRight: border }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: headerBg, marginBottom: 10, paddingBottom: 6, borderBottom: `2px solid ${accentColor}`, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Beneficiário</div>
          {cell('Razão Social / Nome', benefNome)}
          {cell('CNPJ / CPF', benefDoc)}
          {cell('Endereço', benefEndereco)}
          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ flex: 1 }}>{cell('Cidade / UF', `${benefCidade}${benefEstado ? ' / ' + benefEstado : ''}`, { noMargin: true })}</div>
            {benefCep && <div style={{ flex: 1 }}>{cell('CEP', benefCep, { noMargin: true })}</div>}
          </div>
        </div>
        {/* Emitente */}
        <div style={{ flex: 1.5, padding: '14px 16px' }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: headerBg, marginBottom: 10, paddingBottom: 6, borderBottom: `2px solid ${accentColor}`, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Emitente</div>
          <div style={{ display: 'flex', gap: 16 }}>
            <div style={{ flex: 1.2 }}>
              {cell('Nome Completo / Razão Social', emitNome)}
              {cell('CPF / CNPJ', emitDoc)}
              {cell('Endereço', emitEndereco || '—')}
            </div>
            <div style={{ flex: 1 }}>
              {cell('Cidade / UF', `${emitCidade}${emitEstado ? ' / ' + emitEstado : ''}` || '—')}
              {emitCep && cell('CEP', emitCep)}
            </div>
          </div>
        </div>
      </div>

      {/* ── AVALISTAS ── */}
      {avalistas.length > 0 && (
        <div style={{ border, borderTop: 'none', padding: '14px 16px' }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: headerBg, marginBottom: 10, paddingBottom: 6, borderBottom: `2px solid ${accentColor}`, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Avalistas</div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {avalistas.map((av, i) => (
              <div key={i} style={{ border, borderRadius: 4, padding: '10px 14px', minWidth: 200 }}>
                <div style={{ fontWeight: 700, fontSize: 11, marginBottom: 2 }}>{av.nome}</div>
                <div style={{ fontSize: 10, color: '#666', marginBottom: 20 }}>CPF/CNPJ: {av.doc}</div>
                <div style={{ borderTop: '1px solid #bbb', paddingTop: 4 }}>
                  <span style={{ fontSize: 8, color: '#999', textTransform: 'uppercase' }}>Assinatura do Avalista</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── ASSINATURA + DATA ── */}
      <div style={{ border, borderTop: 'none', borderRadius: '0 0 6px 6px', padding: '20px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', backgroundColor: '#fafafa' }}>
        <div style={{ width: '45%' }}>
          <div style={{ borderTop: '1.5px solid #555', paddingTop: 6 }}>
            <div style={{ fontSize: 8, color: '#999', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Assinatura do Emitente</div>
            <div style={{ fontSize: 10, color: '#555', marginTop: 2 }}>{emitNome}</div>
            {emitDoc && <div style={{ fontSize: 9, color: '#888' }}>CPF/CNPJ: {emitDoc}</div>}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 10, color: '#777' }}>Emitido em {cidadeEmissao}</div>
          <div style={{ fontWeight: 700, fontSize: 12, color: '#111' }}>{dateToExtenso(emissao)}</div>
        </div>
      </div>

      {/* ── HASH ── */}
      {documentHash && (
        <div style={{ marginTop: 8, padding: '6px 8px', borderTop: '1px solid #eee', fontSize: 8, color: '#bbb', fontFamily: 'monospace', letterSpacing: '0.3px' }}>
          Hash: {documentHash.substring(0, 32)}…
        </div>
      )}
    </div>
  );
}