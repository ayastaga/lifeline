import type { Claim } from "./index";

// Claim -> i18n template + variables. Shared by web and mobile so a claim is
// phrased the same everywhere. Pure: no facts table, no network.

export type Line = { key: string; vars?: Record<string, string | number>; money?: string[] };

export function claimLines(c: Claim): Line[] {
  const p = c.params as Record<string, number | boolean | string | null>;
  if (c.kind === "assumption") return [{ key: `assume.${c.key}`, vars: Object.fromEntries(Object.entries(p).map(([k, v]) => [k, String(v)])) }];
  if (c.status === "needs_fact") return [{ key: "status.needs_fact" }];
  switch (c.key) {
    case "tfsa_room": {
      const out: Line[] = [{ key: "calc.tfsa_room", vars: { first: String(p.first_year_with_room), room: Number(p.room_accumulated) }, money: ["room"] }];
      if (p.available_room !== null && p.available_room !== undefined) out.push({ key: "calc.tfsa_room.available", vars: { available: Number(p.available_room) }, money: ["available"] });
      return out;
    }
    case "fhsa_room":
      if (p.has_fhsa) return p.available_room === null ? [] : [{ key: "calc.fhsa_room.open", vars: { room: Number(p.available_room) }, money: ["room"] }];
      return [{ key: "calc.fhsa_room.not_open", vars: { room: Number(p.room_if_opened_this_year), lifetime: Number(p.lifetime_limit) }, money: ["room", "lifetime"] }];
    case "resp_catch_up": {
      if (p.grants_still_available === false) return [];
      const n = Number(c.id.split(":").pop()) + 1;
      const out: Line[] = [{ key: "calc.resp_catch_up", vars: { n, unused: Number(p.unused_grant_room_now), max: Number(p.max_still_recoverable), last: String(p.last_year_for_grants) }, money: ["unused", "max"] }];
      if (Number(p.room_that_would_expire_unclaimed) > 0) out.push({ key: "calc.resp_catch_up.expire", vars: { expire: Number(p.room_that_would_expire_unclaimed) }, money: ["expire"] });
      if (p.contribute_by_end_of_year_for_16_17) out.push({ key: "calc.resp_catch_up.cutoff", vars: { year: String(p.contribute_by_end_of_year_for_16_17) } });
      return out;
    }
    default:
      return [];
  }
}

/** Apply money formatting to the variables that are amounts. */
export function formatLine(l: Line, fmtMoney: (n: number) => string): Record<string, string | number> {
  const vars = { ...(l.vars ?? {}) };
  for (const k of l.money ?? []) if (typeof vars[k] === "number") vars[k] = fmtMoney(vars[k] as number);
  return vars;
}
