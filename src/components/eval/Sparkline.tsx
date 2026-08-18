/**
 * A twelve-point pass-rate trend.
 *
 * Per the stat-tile contract: the line sits in the de-emphasis hue and only the
 * current point wears the accent, so the eye lands on "where we are now" and reads
 * the history as context rather than as twelve competing values.
 *
 * Deliberately not a chart with axes. The question it answers is "is this getting
 * better or worse", which is a shape, not a set of readings — the run history table
 * underneath is the exact table view for anyone who wants the numbers.
 */
export function Sparkline({
  points,
  width = 96,
  height = 24,
}: {
  /** Oldest first. Values are pass rates, 0..1. */
  points: { rate: number; label: string }[];
  width?: number;
  height?: number;
}) {
  // One point is a dot, not a trend. Two is the minimum that can slope.
  if (points.length < 2) return null;

  const series = points.slice(-12);
  const pad = 3;
  const stepX = (width - pad * 2) / (series.length - 1);
  const y = (rate: number) => pad + (1 - rate) * (height - pad * 2);

  const path = series
    .map((p, i) => `${i === 0 ? "M" : "L"}${(pad + i * stepX).toFixed(1)},${y(p.rate).toFixed(1)}`)
    .join(" ");

  const last = series[series.length - 1];
  if (last === undefined) return null;
  const lastX = pad + (series.length - 1) * stepX;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`Pass rate over the last ${series.length} runs, now ${Math.round(last.rate * 100)}%`}
      className="overflow-visible"
    >
      {/* 2px line, per the mark spec. */}
      <path
        d={path}
        fill="none"
        stroke="var(--color-line-strong)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Only the current period is accented. */}
      <circle cx={lastX} cy={y(last.rate)} r="3" fill="var(--color-accent)" />

      {/* Hover layer. A sparkline does not get a crosshair, but every point still
          names itself — native <title> costs no JavaScript. */}
      {series.map((p, i) => (
        <circle
          key={`${p.label}-${i}`}
          cx={pad + i * stepX}
          cy={y(p.rate)}
          r="7"
          fill="transparent"
        >
          <title>{`${p.label}: ${Math.round(p.rate * 100)}%`}</title>
        </circle>
      ))}
    </svg>
  );
}
