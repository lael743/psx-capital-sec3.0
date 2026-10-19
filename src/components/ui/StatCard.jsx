export default function StatCard({ label, value, sub, icon: Icon, variant = 'default', dark = false }) {
  const variants = {
    default: 'bg-white border border-border',
    gold: 'bg-white border border-amber-200',
    dark: 'bg-foreground text-primary-foreground border border-foreground',
    danger: 'bg-white border border-red-200',
  };

  return (
    <div className={`rounded-xl p-5 flex flex-col gap-3 shadow-sm ${variants[variant]}`}>
      <div className="flex items-center justify-between">
        <span className={`text-xs font-medium uppercase tracking-wider ${dark || variant === 'dark' ? 'text-primary-foreground/60' : 'text-muted-foreground'}`}>
          {label}
        </span>
        {Icon && (
          <div className={`p-1.5 rounded-lg ${variant === 'dark' ? 'bg-white/10' : variant === 'gold' ? 'bg-amber-50' : 'bg-gray-50'}`}>
            <Icon className={`w-4 h-4 ${variant === 'dark' ? 'text-white' : variant === 'gold' ? 'text-[hsl(43,65%,47%)]' : 'text-muted-foreground'}`} />
          </div>
        )}
      </div>
      <div>
        <div className={`text-2xl font-bold tracking-tight ${variant === 'dark' ? 'text-white' : variant === 'gold' ? 'text-[hsl(43,65%,47%)]' : 'text-foreground'}`}>
          {value}
        </div>
        {sub && (
          <div className={`text-xs mt-0.5 ${variant === 'dark' ? 'text-primary-foreground/50' : 'text-muted-foreground'}`}>
            {sub}
          </div>
        )}
      </div>
    </div>
  );
}