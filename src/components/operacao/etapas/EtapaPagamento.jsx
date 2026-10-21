import RepassePanel from '@/components/operacao/RepassePanel';

/**
 * ETAPA 6 — Pagamento: registro do repasse ao cedente. É o repasse registrado
 * que libera a finalização; o pagamento pode sair por várias contas e formas.
 */
export default function EtapaPagamento({ operacao, onUpdate }) {
  return <RepassePanel operacao={operacao} onUpdate={onUpdate} />;
}