/**
 * D3 — ADAPTADOR base44 do motor de transferências.
 *
 * Toda a regra (idempotência, concorrência, recuperação) vive em
 * `transferEngine.js`, que é puro quanto a transporte e testável. Este arquivo
 * só liga o motor às entidades reais.
 */
import { base44 } from '@/api/base44Client';
import { criarMotor } from '@/lib/transferEngine';

export { novoTransferId } from '@/lib/bankLedger';

const motor = criarMotor({
  bancoStore: {
    updateWhere: (query, update) => base44.entities.Banco.updateMany(query, update),
    get: (id) => base44.entities.Banco.get(id),
  },
  diarioStore: {
    filter: (query) => base44.entities.TransferenciaBancaria.filter(query),
    create: (data) => base44.entities.TransferenciaBancaria.create(data),
    updateWhere: (query, update) => base44.entities.TransferenciaBancaria.updateMany(query, update),
  },
  cashflowStore: {
    filter: (query) => base44.entities.CashFlow.filter(query),
    create: (data) => base44.entities.CashFlow.create(data),
  },
});

export const executarTransferencia = (params) => motor.executarTransferencia(params);
export const estornarTransferencia = (params) => motor.estornarTransferencia(params);
export const recuperarTransferencia = (params) => motor.recuperarTransferencia(params);

/** Diagnóstico completo por perna: saldo, lançamento, dono e idade da reivindicação. */
export const inspecionarTransferencia = (params) => motor.inspecionarTransferencia(params);

/** Recuperação de reivindicações órfãs — nunca toca em saldo. */
export const recuperarLancamentosOrfaos = (params) => motor.recuperarLancamentosOrfaos(params);

/** Lê o diário e devolve o diagnóstico (saldo aplicado × lançamento presente). */
export async function diagnosticarTransferencia(transferId) {
  const doc = await motor.diarioExistente(transferId);
  return motor.diagnosticar(doc);
}