import { StatCard } from "@/components/stats/stat-card";

export interface TileDatum {
  label: string;
  rate: number;
  graded: number;
}

/** Two stat tiles side by side — the right form for a 2-category comparison
 *  (a 2-bar chart is the dataviz anti-pattern this avoids). */
export function StatTilePair({ a, b }: { a: TileDatum; b: TileDatum }) {
  if (a.graded === 0 && b.graded === 0) return null;
  const format = (d: TileDatum) => (d.graded > 0 ? `${Math.round(d.rate * 100)}%` : "—");
  return (
    <div className="grid grid-cols-2 gap-3">
      <StatCard label={`${a.label} (${a.graded})`} value={format(a)} />
      <StatCard label={`${b.label} (${b.graded})`} value={format(b)} />
    </div>
  );
}
