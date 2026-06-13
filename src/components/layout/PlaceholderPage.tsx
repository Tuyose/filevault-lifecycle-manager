import type { ReactNode } from "react";

type PlaceholderPageProps = {
  title: string;
  description: string;
  bullets?: string[];
  actions?: ReactNode;
  children?: ReactNode;
};

/**
 * Shared skeleton for feature pages. Each feature module renders its own
 * copy with the relevant title and roadmap bullets; this keeps the visual
 * language consistent while real content is being built out.
 */
export function PlaceholderPage({
  title,
  description,
  bullets = [],
  actions,
  children,
}: PlaceholderPageProps) {
  return (
    <section className="flex h-full flex-col gap-6 p-8">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-100">{title}</h1>
          <p className="mt-1 max-w-2xl text-sm text-vault-muted">{description}</p>
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </header>

      {bullets.length > 0 && (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {bullets.map((bullet) => (
            <li
              key={bullet}
              className="rounded-lg border border-vault-border bg-vault-surface px-4 py-3 text-sm text-slate-200"
            >
              {bullet}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-auto rounded-lg border border-dashed border-vault-border bg-vault-surface/40 p-6 text-xs uppercase tracking-widest text-vault-muted">
        Placeholder — real UI lands in upcoming milestones.
      </div>

      {children}
    </section>
  );
}
