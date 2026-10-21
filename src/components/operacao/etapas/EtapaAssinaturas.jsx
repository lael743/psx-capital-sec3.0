import EtapaCabecalho from '@/components/operacao/etapas/EtapaCabecalho';
import AssinaturaColetaPanel from '@/components/operacao/AssinaturaColetaPanel';
import AssinaturaAsaasPanel from '@/components/operacao/AssinaturaAsaasPanel';
import ContratoAssinadoPanel from '@/components/operacao/ContratoAssinadoPanel';
import NotificacaoStatusCard from '@/components/operacao/NotificacaoStatusCard';

/**
 * ETAPA 5 — Assinaturas: coleta das assinaturas da operação (contrato,
 * promissórias), a assinatura recorrente do Asaas quando for o caso, e a
 * notificação de aceite do sacado.
 */
export default function EtapaAssinaturas({ operacao, client, onUpdate }) {
  const tipo = operacao.produto || operacao.type;

  return (
    <div className="space-y-3">
      <EtapaCabecalho
        numero={5}
        titulo="Assinaturas"
        descricao="Colete as assinaturas do cedente e dos sacados. Com o contrato assinado confirmado, a operação segue para o pagamento ao cedente."
      />

      {tipo === 'assinatura' && <AssinaturaAsaasPanel operacao={operacao} onUpdate={onUpdate} />}
      {operacao.needs_contract && <ContratoAssinadoPanel operacao={operacao} onUpdate={onUpdate} />}
      {tipo === 'boleto' && (operacao.sacado_name || operacao.sacado_id) && (
        <NotificacaoStatusCard operacao={operacao} client={client} onUpdate={onUpdate} />
      )}

      <AssinaturaColetaPanel operacao={operacao} client={client} onUpdate={onUpdate} />
    </div>
  );
}