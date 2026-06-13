type CardProps = {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "ok" | "warn";
};

const toneClass: Record<NonNullable<CardProps["tone"]>, string> = {
  default: "text-slate-100",
  ok: "text-emerald-300",
  warn: "text-amber-300",
};

export function StatCard({ label, value, hint, tone = "default" }: CardProps) {
  return (
    <div className="rounded-xl border border-vault-border bg-vault-surface p-4">
      <div className="text-xs uppercase tracking-widest text-vault-muted">
        {label}
      </div>
      <div className={`mt-2 text-2xl font-semibold ${toneClass[tone]}`}>
        {value}
      </div>
      {hint && <div className="mt-1 text-xs text-vault-muted">{hint}</div>}
    </div>
  );
}
