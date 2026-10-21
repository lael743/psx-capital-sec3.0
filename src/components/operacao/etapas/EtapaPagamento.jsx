import EtapaCabecalho from '@/components/operacao/etapas/EtapaCabecalho';
import RepassePanel from '@/components/operacao/RepassePanel';
import BancariosTab from '@/components/operacao/BancariosTab';

/**
 * ETAPA 6 — Pagamento: definição da conta de onde sai o repasse ao cedente e
 * registro do repasse. É o repasse registrado que libera a finalização.
 */
export default function EtapaPagamento({ operacao, client, onUpdate }) {
  return (
    <div className="space-y-3">
      <EtapaCabecalho
        numero={6}
        titulo="Pagamento ao cedente"
        descricao="Defina a conta de origem do repasse e registre a transferência. O repasse é o que comprova a entrega do valor e libera a finalização da operação."
      />

      <BancariosTab operacao={operacao} client={client} onUpdate={onUpdate} />
      <RepassePanel operacao={operacao} onUpdate={onUpdate} />
    </div>
  );
}