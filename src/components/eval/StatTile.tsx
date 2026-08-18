import { Sparkline } from "@/components/eval/Sparkline";

/**
 * The stat-tile contract: label, value, optional delta, optional trend.
 *
 * Two rules from the spec are easy to get wrong and were both wrong here before:
 *
 *  - **Proportional figures on the value, never tabular.** Equal-width digits make
 *    a display number look loose — `tabular-nums` is for columns that must align
 *    vertically, which is the table underneath, not this.
 *  - **The same sans as everything else.** A display or mono face on a headline
 *    number reads as decoration. Mono still belongs on ids and raw output.
 */
export function StatTile({
  label,
  value,
  sub,
  delta,
  deltaLabel,
  trend,
  hero = false,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  /** Signed. Colour is direction × whether up is good — here, up is good. */
  delta?: number | null;
  deltaLabel?: string;
  trend?: { rate: number; label: string }[];
  /** Exactly one tile per view may be the hero. */
  hero?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="eyebrow">{label}</span>

      <div className="flex items-baseline gap-3">
        <span
          className={`leading-none font-semibold ${hero ? "text-5xl" : "text-2xl"}`}
        >
          {value}
        </span>

        {delta !== null && delta !== undefined && (
          <span
            className={`text-sm font-semibold ${
              delta > 0 ? "text-pass" : delta < 0 ? "text-fail" : "text-faint"
            }`}
          >
            {delta > 0 ? "+" : ""}
            {delta}
          </span>
        )}

        {trend !== undefined && trend.length > 1 && (
          <span className="ml-1">
            <Sparkline points={trend} />
          </span>
        )}
      </div>

      {(sub !== undefined || deltaLabel !== undefined) && (
        <span className="font-mono text-[11px] text-muted">{sub ?? deltaLabel}</span>
      )}
    </div>
  );
}
