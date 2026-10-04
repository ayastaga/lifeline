import type { Txn, TxnAggregate } from "./types";

export function aggregate(rows: Txn[], filter: { category?: string; from?: string; to?: string }): TxnAggregate[] {
  const scoped = rows.filter(
    (r) =>
      (!filter.category || r.category === filter.category) &&
      (!filter.from || r.postedOn >= filter.from) &&
      (!filter.to || r.postedOn <= filter.to),
  );
  const months = new Set(scoped.map((r) => r.postedOn.slice(0, 7))).size || 1;
  const by = new Map<string, { count: number; total: number }>();
  for (const r of scoped) {
    const k = r.category ?? "uncategorized";
    const cur = by.get(k) ?? { count: 0, total: 0 };
    cur.count += 1;
    cur.total += r.amount;
    by.set(k, cur);
  }
  return [...by.entries()]
    .map(([category, v]) => ({
      category,
      count: v.count,
      total: Math.round(v.total * 100) / 100,
      monthlyAverage: Math.round((v.total / months) * 100) / 100,
    }))
    .sort((a, b) => Math.abs(b.total) - Math.abs(a.total));
}
