/**
 * Certificado de Evidências de Assinatura Eletrônica — PSX Capital
 * Suporta múltiplos signatários: cada um recebe uma página A4 individual com seus dados.
 * Layout A4 otimizado com marca PSX Capital (inline styles para captura PDF)
 */

const GOLD = '#c8a550';
const GOLD_LIGHT = '#e6c878';
const DARK = '#1a1a1a';

function Row({ label, value }) {
  if (!value || value === '—') return null;
  return (
    <tr>
      <td style={{ padding: '5px 0', fontSize: '10px', color: '#666', fontWeight: '600', width: '38%', verticalAlign: 'top', whiteSpace: 'nowrap' }}>{label}</td>
      <td style={{ padding: '5px 0', fontSize: '10px', color: '#1a1a1a', fontFamily: 'Courier New, monospace', wordBreak: 'break-all', lineHeight: '1.5' }}>{value}</td>
    </tr>
  );
}

function Section({ number, title, children }) {
  return (
    <div style={{ marginBottom: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', paddingBottom: '5px', borderBottom: `2px solid ${GOLD}` }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '20px', height: '20px', borderRadius: '4px', background: GOLD, color: '#fff', fontSize: '10px', fontWeight: '800', flexShrink: 0 }}>{number}</span>
        <span style={{ fontSize: '11px', fontWeight: '700', color: '#1a1a1a', textTransform: 'uppercase', letterSpacing: '0.8px' }}>{title}</span>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

/**
 * Renderiza uma página A4 completa do certificado para um signatário.
 */
function SignerPage({ assinatura, signatario, documents, companyName, operationNumber, signerIndex, totalSigners }) {
  if (!assinatura) return null;

  const signedAt = assinatura.signed_at ? new Date(assinatura.signed_at) : null;
  const dateStr = signedAt
    ? signedAt.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : '—';

  const geo = assinatura.latitude && assinatura.longitude && assinatura.latitude !== '' && assinatura.latitude !== '0'
    ? `${assinatura.latitude}, ${assinatura.longitude} (precisão: ${assinatura.gps_accuracy || '?'}m)`
    : 'Não coletada';

  const numOp = operationNumber ? String(operationNumber).padStart(6, '0') : '—';

  return (
    <div style={{ width: '794px', minHeight: '1123px', background: '#fff', fontFamily: 'Arial, Helvetica, sans-serif', color: '#1a1a1a', display: 'flex', flexDirection: 'column', boxSizing: 'border-box', pageBreakAfter: 'always', breakAfter: 'page' }}>

      {/* ========== HEADER ========== */}
      <div style={{ background: `linear-gradient(135deg, ${DARK} 0%, #2a2a2a 100%)`, color: '#fff', padding: '28px 40px', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '4px', background: `linear-gradient(90deg, ${GOLD} 0%, ${GOLD_LIGHT} 50%, ${GOLD} 100%)` }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '1px', marginBottom: '10px' }}>
              <span style={{ fontSize: '28px', fontWeight: '900', color: '#e8e8e8' }}>PS</span>
              <span style={{ fontSize: '28px', fontWeight: '900', color: GOLD }}>X</span>
              <span style={{ fontSize: '10px', fontWeight: '700', color: '#888', marginLeft: '8px', letterSpacing: '3px' }}>CAPITAL</span>
            </div>
            <h1 style={{ fontSize: '17px', fontWeight: '700', margin: '0', color: '#fff' }}>Certificado de Evidências</h1>
            <p style={{ fontSize: '10px', color: '#999', margin: '3px 0 0 0' }}>Assinatura Eletrônica com Biometria Facial</p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'rgba(16,185,129,0.15)', padding: '5px 12px', borderRadius: '16px', marginBottom: '8px' }}>
              <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#10b981' }} />
              <span style={{ fontSize: '10px', fontWeight: '700', color: '#10b981', letterSpacing: '0.5px' }}>ASSINADO</span>
            </div>
            <p style={{ fontSize: '9px', color: '#888', margin: '0' }}>Operação Nº <strong style={{ color: GOLD }}>{numOp}</strong></p>
            {totalSigners > 1 && (
              <p style={{ fontSize: '9px', color: GOLD, margin: '2px 0 0 0', fontWeight: '600' }}>Signatário {signerIndex + 1} de {totalSigners}</p>
            )}
          </div>
        </div>
      </div>

      {/* ========== CONTENT ========== */}
      <div style={{ flex: 1, padding: '24px 40px' }}>

        {/* Intro */}
        <div style={{ background: '#faf8f3', border: `1px solid ${GOLD}33`, borderRadius: '6px', padding: '12px 16px', marginBottom: '20px' }}>
          <p style={{ fontSize: '10px', color: '#555', lineHeight: '1.6', margin: 0, textAlign: 'justify' }}>
            Abaixo listamos todas as evidências coletadas no processo de assinatura eletrônica. Para comprovar a validade, capturamos dados do remetente e dos signatários, preservando a integridade e confidencialidade em ambiente seguro.
          </p>
        </div>

        {/* 1. Dados do Remetente */}
        <Section number="1" title="Dados do Remetente">
          <Row label="Empresa" value={companyName} />
          <Row label="Operação Nº" value={numOp} />
          <Row label="Data de criação" value={dateStr} />
          <Row label="IP de acesso" value={assinatura.ip_address} />
        </Section>

        {/* 2. Dados do Signatário */}
        <Section number="2" title="Dados do Signatário">
          <Row label="Nome" value={signatario?.name} />
          <Row label="CPF/CNPJ" value={signatario?.cpf_cnpj} />
          <Row label="Função / Papel" value={signatario?.role} />
          <Row label="E-mail" value={signatario?.email} />
          <Row label="Telefone" value={signatario?.phone} />
          <Row label="Tipo de assinatura" value="Biométrica (Selfie)" />
        </Section>

        {/* 3. Documentos Assinados */}
        <Section number="3" title="Documentos Assinados">
          {(documents || []).map((doc, i) => (
            <Row key={doc.id || i} label={`Documento ${i + 1}`} value={`${doc.title}${doc.document_number ? ` — Nº ${doc.document_number}` : ''}`} />
          ))}
          <Row label="Hash do documento" value={assinatura.document_hash_at_signature} />
          <Row label="Hash da assinatura" value={assinatura.id} />
        </Section>

        {/* 4. Dados do Dispositivo */}
        <Section number="4" title="Dados do Dispositivo">
          <Row label="Dispositivo" value={assinatura.device_type} />
          <Row label="Navegador" value={assinatura.browser} />
          <Row label="Sistema operacional" value={assinatura.operating_system} />
          <Row label="User Agent" value={assinatura.user_agent} />
          <Row label="Resolução de tela" value={assinatura.screen_resolution} />
          <Row label="Idioma" value={assinatura.language} />
        </Section>

        {/* 5. Localização */}
        <Section number="5" title="Localização e Acesso">
          <Row label="IP de acesso" value={assinatura.ip_address} />
          <Row label="Geolocalização" value={geo} />
        </Section>

        {/* 6. Eventos */}
        <Section number="6" title="Eventos do Processo">
          <Row label="Assinado em" value={dateStr} />
          <Row label="Status" value="Concluído" />
          <Row label="Método" value="Biometria facial (selfie com marca d'água)" />
        </Section>

        {/* 7. Biometria Facial */}
        {assinatura.selfie_image && (
          <div style={{ marginBottom: '18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px', paddingBottom: '5px', borderBottom: `2px solid ${GOLD}` }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '20px', height: '20px', borderRadius: '4px', background: GOLD, color: '#fff', fontSize: '10px', fontWeight: '800' }}>7</span>
              <span style={{ fontSize: '11px', fontWeight: '700', color: '#1a1a1a', textTransform: 'uppercase', letterSpacing: '0.8px' }}>Biometria Facial</span>
            </div>
            <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
              <img
                src={assinatura.selfie_image}
                alt="Selfie do signatário"
                style={{ width: '110px', height: '110px', objectFit: 'cover', borderRadius: '8px', border: `2px solid ${GOLD}`, flexShrink: 0 }}
              />
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: '10px', color: '#555', lineHeight: '1.5', margin: '0 0 5px 0' }}>Selfie capturada no momento da assinatura com marca d'água de autenticidade.</p>
                <p style={{ fontSize: '10px', color: '#555', lineHeight: '1.5', margin: '0 0 5px 0' }}>Inclui: nome do signatário, CPF, data/hora e informações do dispositivo.</p>
                <p style={{ fontSize: '10px', color: '#10b981', fontWeight: '700', margin: '0' }}>✓ Imagem armazenada com segurança</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ========== FOOTER ========== */}
      <div style={{ padding: '14px 40px', borderTop: `2px solid ${GOLD}`, background: `linear-gradient(135deg, ${DARK} 0%, #2a2a2a 100%)`, color: '#fff' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '1px' }}>
              <span style={{ fontSize: '14px', fontWeight: '900', color: '#e8e8e8' }}>PS</span>
              <span style={{ fontSize: '14px', fontWeight: '900', color: GOLD }}>X</span>
              <span style={{ fontSize: '8px', fontWeight: '700', color: '#888', marginLeft: '5px', letterSpacing: '2px' }}>CAPITAL</span>
            </div>
            <p style={{ fontSize: '9px', color: '#999', margin: '4px 0 0 0' }}>Certificado gerado automaticamente pelo sistema de assinatura eletrônica PSX Capital.</p>
          </div>
          <div style={{ textAlign: 'right', fontSize: '9px', color: '#999' }}>
            <p style={{ margin: '0', fontWeight: '600' }}>Validade jurídica conforme</p>
            <p style={{ margin: '0' }}>MP nº 2.200-2/2001 e Lei nº 14.063/2020</p>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Certificado de Evidências — suporta múltiplos signatários.
 * Cada signatário recebe uma página A4 individual com seus dados de evidência.
 *
 * Props:
 * - assinaturas: array de AssinaturaDigital (múltiplos signatários)
 * - signatarios: array de AssinaturaSignatario correspondentes
 * - documents: array de AssinaturaDocumento assinados
 * - companyName, operationNumber: dados da empresa/operacao
 *
 * Backward-compatible: aceita assinatura (singular) e signatario (singular) para chamadas antigas.
 */
export default function CertificadoEvidencias({ assinaturas, signatarios, documents, companyName, operationNumber, assinatura, signatario }) {
  // Backward compatibility: converte singular para array
  const assList = assinaturas || (assinatura ? [assinatura] : []);
  const sigList = signatarios || (signatario ? [signatario] : []);

  if (!assList.length) return null;

  return (
    <div style={{ width: '794px' }}>
      {assList.map((ass, idx) => {
        // Match signatário by signer_id, fallback to index
        const sig = sigList.find(s => s.id === ass.signer_id) || sigList[idx] || {};
        return (
          <SignerPage
            key={ass.id || idx}
            assinatura={ass}
            signatario={sig}
            documents={documents}
            companyName={companyName}
            operationNumber={operationNumber}
            signerIndex={idx}
            totalSigners={assList.length}
          />
        );
      })}
    </div>
  );
}