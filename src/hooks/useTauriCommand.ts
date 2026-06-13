import { useEffect, useState } from "react";

/**
 * Minimal typed wrapper around `useState` + effect for invoking a Tauri
 * command once on mount. Returns `{ data, error, loading }` so callers
 * can render loading / error / success states uniformly.
 */
export function useTauriCommand<T>(
  run: () => Promise<T>,
  deps: ReadonlyArray<unknown> = [],
): {
  data: T | null;
  error: string | null;
  loading: boolean;
} {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    run()
      .then((value) => {
        if (!cancelled) setData(value);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, error, loading };
}
