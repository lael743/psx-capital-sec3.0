export default function EtapaCabecalho({ numero, titulo, descricao }) {
  return (
    <div className="bg-white border border-border rounded-xl px-5 py-4">
      <div className="flex items-center gap-2">
        <span className="w-6 h-6 rounded-full bg-foreground text-primary-foreground text-[11px] font-bold flex items-center justify-center shrink-0">
          {numero}
        </span>
        <h2 className="text-sm font-bold">Etapa {numero} · {titulo}</h2>
      </div>
      {descricao && <p className="text-xs text-muted-foreground mt-1.5">{descricao}</p>}
    </div>
  );
}