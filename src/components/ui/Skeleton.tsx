type SkeletonProps = {
  lines?: number;
  className?: string;
};

/** Minimal skeleton block for loading states. */
export function Skeleton({ lines = 3, className = "" }: SkeletonProps) {
  return (
    <div className={`flex flex-col gap-3 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className="h-4 animate-shimmer rounded-md bg-vault-border/40"
          style={{ width: `${Math.max(40, 100 - i * 15)}%` }}
        />
      ))}
    </div>
  );
}

/** Skeleton card matching the StatCard shape. */
export function SkeletonCard() {
  return (
    <div className="animate-shimmer rounded-[14px] border border-vault-border bg-vault-surface p-4">
      <div className="mb-2 h-3 w-1/2 rounded bg-vault-border/40" />
      <div className="h-7 w-1/3 rounded bg-vault-border/40" />
    </div>
  );
}
