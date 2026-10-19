export const STAGES = [
  { key: 'rascunho', label: 'Rascunho' },
  { key: 'nova', label: 'Nova' },
  { key: 'analise_credito', label: 'Análise de Crédito' },
  { key: 'confirmacao_titulos', label: 'Confirmação de Títulos' },
  { key: 'formalizacao', label: 'Formalização' },
  { key: 'assinatura', label: 'Assinatura' },
  { key: 'pagamento', label: 'Pagamento' },
  { key: 'finalizada', label: 'Finalizada' },
];

export const getNextStage = (currentEtapa) => {
  const idx = STAGES.findIndex(s => s.key === currentEtapa);
  if (idx === -1 || idx >= STAGES.length - 1) return null;
  return STAGES[idx + 1];
};

export const getStageIndex = (etapa) => STAGES.findIndex(s => s.key === etapa);