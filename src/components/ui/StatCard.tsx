export function StatCard({
  label, value, sub, accent = 'default',
}: { label: string; value: string; sub?: string; accent?: 'default' | 'good' | 'warn' | 'bad' }) {
  const accentClass = {
    default: 'text-neutral-100',
    good: 'text-emerald-400',
    warn: 'text-amber-400',
    bad: 'text-rose-400',
  }[accent];

  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
      <div className="text-xs font-medium text-neutral-500 mb-1">{label}</div>
      <div className={`text-2xl font-bold tracking-tight ${accentClass}`}>{value}</div>
      {sub && <div className="text-xs text-neutral-500 mt-1">{sub}</div>}
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 px-4 lg:px-6 pt-5 pb-4 border-b border-neutral-900">
      <div>
        <h1 className="text-lg font-bold text-neutral-100">{title}</h1>
        {description && <p className="text-sm text-neutral-500 mt-0.5">{description}</p>}
      </div>
      {actions}
    </div>
  );
}
