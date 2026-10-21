import RepassePanel from '@/components/operacao/RepassePanel';
import BancariosTab from '@/components/operacao/BancariosTab';

/**
 * ETAPA 6 — Pagamento: definição da conta de onde sai o repasse ao cedente e
 * registro do repasse. É o repasse registrado que libera a finalização.
 */
export default function EtapaPagamento({ operacao, client, onUpdate }) {
  return (
    <div className="space-y-3">
      <BancariosTab operacao={operacao} client={client} onUpdate={onUpdate} />
      <RepassePanel operacao={operacao} onUpdate={onUpdate} />
    </div>
  );
}