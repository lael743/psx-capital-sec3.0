import { FileSearch, Clock, CheckCircle2, AlertTriangle } from 'lucide-react';

export default function BancoConciliacao({ banco }) {
  return (
    <div className="space-y-5">
      {/* Banner informativo */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-3">
        <FileSearch className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
        <div>
          <div className="text-sm font-semibold text-blue-800">Conciliação Bancária</div>
          <div className="text-xs text-blue-700 mt-1">
            Este módulo permitirá reconciliar os lançamentos do sistema com o extrato bancário oficial. 
            Importe o arquivo OFX ou CSV do seu banco para iniciar o processo de conciliação.
          </div>
        </div>
      </div>

      {/* Etapas futuras */}
      <div>
        <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-3">Fluxo de Conciliação</h3>
        <div className="space-y-2">
          {[
            { step: 1, label: 'Importar extrato do banco (OFX / CSV)', status: 'future' },
            { step: 2, label: 'Matching automático por data e valor', status: 'future' },
            { step: 3, label: 'Revisão de lançamentos não identificados', status: 'future' },
            { step: 4, label: 'Confirmar conciliação e gerar relatório', status: 'future' },
          ].map(item => (
            <div key={item.step} className="flex items-center gap-3 p-3 bg-gray-50 border border-border rounded-lg">
              <div className="w-6 h-6 rounded-full border-2 border-border flex items-center justify-center shrink-0">
                <span className="text-xs font-bold text-muted-foreground">{item.step}</span>
              </div>
              <span className="text-sm text-muted-foreground">{item.label}</span>
              <span className="ml-auto text-xs px-2 py-0.5 bg-gray-200 text-gray-500 rounded-full font-medium">Em breve</span>
            </div>
          ))}
        </div>
      </div>

      {/* Placeholder de métricas */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { icon: CheckCircle2, label: 'Conciliados', value: '—', cls: 'text-emerald-600', bg: 'bg-emerald-50' },
          { icon: Clock, label: 'Pendentes', value: '—', cls: 'text-amber-600', bg: 'bg-amber-50' },
          { icon: AlertTriangle, label: 'Divergências', value: '—', cls: 'text-red-600', bg: 'bg-red-50' },
        ].map(({ icon: Icon, label, value, cls, bg }) => (
          <div key={label} className={`${bg} rounded-xl p-4 text-center border border-border`}>
            <Icon className={`w-5 h-5 ${cls} mx-auto mb-2`} />
            <div className="text-lg font-bold text-muted-foreground">{value}</div>
            <div className="text-xs text-muted-foreground">{label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}