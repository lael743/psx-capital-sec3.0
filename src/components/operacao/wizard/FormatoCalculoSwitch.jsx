const OPCOES = [
  {
    key: 'padrao',
    nome: 'Padrão',
    hint: 'Informe o valor de face do título. O líquido sai descontando o deságio.',
  },
  {
    key: 'inverso',
    nome: 'Inverso',
    hint: 'Informe o repasse desejado. O sistema calcula a face (cheque) ou as prestações (boleto e duplicata).',
  },
];

/**
 * Escolha do formato de cálculo da digitação. Não altera fórmula: apenas diz
 * qual é o valor conhecido (face ou repasse) — a tela da etapa 2 acompanha.
 */
export default function FormatoCalculoSwitch({ formato, onChange }) {
  const atual = OPCOES.find((o) => o.key === formato) || OPCOES[0];

  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Formato de cálculo</span>
      <div className="inline-flex rounded-lg border border-border overflow-hidden">
        {OPCOES.map((o) => (
          <button
            key={o.key}
            type="button"
            onClick={() => onChange(o.key)}
            className={`px-3 py-1.5 text-xs font-semibold transition-colors ${
              o.key === atual.key
                ? 'bg-foreground text-primary-foreground'
                : 'bg-white text-muted-foreground hover:bg-gray-50'
            }`}
          >
            {o.nome}
          </button>
        ))}
      </div>
      <span className="text-xs text-muted-foreground">{atual.hint}</span>
    </div>
  );
}