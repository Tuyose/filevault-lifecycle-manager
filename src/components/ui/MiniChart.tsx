import { useMemo } from "react";

type MiniChartProps = {
  /** Data points, newest last */
  data: number[];
  /** Height in px */
  height?: number;
  /** Accent colour CSS value */
  color?: string;
  /** Show fill area under the line */
  fill?: boolean;
};

/**
 * Tiny SVG sparkline chart for dashboard cards.
 * Renders a polyline with optional gradient fill.
 */
export function MiniChart({
  data,
  height = 40,
  color = "rgb(94, 234, 212)",
  fill = true,
}: MiniChartProps) {
  const width = 120;

  const path = useMemo(() => {
    if (data.length < 2) return "";
    const max = Math.max(...data, 1);
    const min = Math.min(...data, 0);
    const range = max - min || 1;
    const stepX = width / (data.length - 1);

    const points = data.map((v, i) => {
      const x = i * stepX;
      const y = height - ((v - min) / range) * (height - 4) - 2;
      return `${x},${y}`;
    });

    return points.join(" ");
  }, [data, height]);

  if (data.length < 2) return null;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="shrink-0"
      aria-hidden
    >
      {fill && (
        <>
          <defs>
            <linearGradient id="chart-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.25} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <polygon
            points={`0,${height} ${path} ${width},${height}`}
            fill="url(#chart-fill)"
          />
        </>
      )}
      <polyline
        points={path}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
