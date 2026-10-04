import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { calculate, type CalculatorName } from "../calculators";
import { lookupFact } from "../facts";
import { ProfileSchema, validateFact } from "../profile/schema";
import { searchDocs } from "../rag/search";
import { evaluate, type PartialProfile } from "../rules/engine";
import { buildRoadmap } from "../roadmap";
import { nextQuestions } from "../profile/nextQuestions";
import type { Store } from "../store/types";
import type { ToolSpec } from "./provider";

// Tool definitions for the orchestrator. Each tool is a pure function over
// profile / facts / documents. The model may ONLY state numbers, program
// names and eligibility that come back from these tools.

export const tools = {
  // Called when the user states something about themselves. The value is
  // validated against ProfileSchema and shown to the user to confirm before
  // it is saved.
  update_profile: {
    description:
      "Record a fact the user stated about themselves. Use the exact keys from the profile schema. The user must confirm before it is saved. children is an array of {age, hasResp?}. Use inferred=true when you derived the value rather than the user stating it.",
    parameters: z.object({
      facts: z.array(
        z.object({
          key: ProfileSchema.keyof(),
          value: z.any(),
          inferred: z.boolean().default(false),
        }),
      ),
    }),
  },

  // Runs the deterministic rules engine over the confirmed profile.
  check_eligibility: {
    description:
      "Evaluate which programs the user may qualify for based on their CONFIRMED profile. Returns eligible / likely / not_eligible / need_more_info with reasons and missing keys. For obligations (HST registration, CPP, instalments) 'eligible' means it applies to them.",
    parameters: z.object({
      programIds: z.array(z.string()).optional(),
    }),
  },

  // The claims behind one roadmap item: eligibility, official facts with quoted
  // sources, personal calculations, assumptions and what's still unknown.
  explain_item: {
    description:
      "Get the verified claims for one program or account for this person: eligibility, official facts with quotes, personal calculations (e.g. TFSA room, RESP grants that can still be caught up), assumptions made, and unknown facts. Use this to answer 'what am I missing', 'how much TFSA room do I have', 'what about RESP' etc. Build your answer only from these claims; mention a claim's status if it is not verified or calculated.",
    parameters: z.object({ programId: z.string() }),
  },

  // Which facts to ask for next, ranked by how much they would change the roadmap.
  next_questions: {
    description:
      "Get the most useful facts to ask the person for next (ranked by how many roadmap items they would unblock). During onboarding, ask ONE of these per turn, conversationally, in the reply language.",
    parameters: z.object({ limit: z.number().int().min(1).max(5).default(3) }),
  },

  // The ONLY place numbers come from.
  lookup_fact: {
    description:
      "Look up a key number (limit, threshold, rate, deadline) from the verified facts table. Always use this before stating any number. If you do not know the key, call with any guess and the result lists all known keys.",
    parameters: z.object({
      key: z.string(),
      year: z.number().int().optional(),
    }),
  },

  // RAG over official sources. Returns chunks with URLs; the composer attaches citations.
  search_docs: {
    description:
      "Search official government pages to explain how a program or rule works. Query in English works best (sources are English/French). Returns passages with source URLs, or abstain=true if nothing reliable was found.",
    parameters: z.object({
      query: z.string(),
      programId: z.string().optional(),
      limit: z.number().int().min(1).max(10).default(6),
    }),
  },

  // Deterministic math. Each calculator pulls its own rates from the facts table.
  calculate: {
    description:
      "Run an exact calculation. Available: cesg_grant (inputs: monthly_contribution or annual_contribution, years?, has_unused_room? 0/1), hst_registration (quarter_1..quarter_4 for the last four calendar quarters, or revenue_12m; rideshare 0/1), gig_tax_set_aside (net_income, other_income?), rent_credit_estimate (annual_rent), tfsa_room (birth_year or age, residency_start_year or always_resident 0/1, contributed_total?, withdrawn_before_this_year?), fhsa_room (has_fhsa 0/1, opened_year?, contributed_total?), resp_catch_up (child_birth_year or child_age, child_residency_start_year?, grants_received?). Prefer explain_item for roadmap items: it runs these with the confirmed profile.",
    parameters: z.object({
      calculator: z.enum(["cesg_grant", "hst_registration", "gig_tax_set_aside", "rent_credit_estimate", "tfsa_room", "fhsa_room", "resp_catch_up"]),
      inputs: z.record(z.number()),
    }),
  },

  // Only available after the user uploaded a statement.
  query_transactions: {
    description:
      "Summarize the user's uploaded transactions by category or date range (YYYY-MM-DD). Never returns raw rows, only aggregates. Categories: rent, tuition, childcare, gig_income, payroll, government_benefit, groceries, transport, utilities, other.",
    parameters: z.object({
      category: z.string().optional(),
      from: z.string().optional(),
      to: z.string().optional(),
    }),
  },
} as const;

export type ToolName = keyof typeof tools;

export function toolSpecs(opts: { hasTransactions: boolean }): ToolSpec[] {
  return (Object.entries(tools) as [ToolName, (typeof tools)[ToolName]][])
    .filter(([name]) => name !== "query_transactions" || opts.hasTransactions)
    .map(([name, t]) => ({
      type: "function" as const,
      function: {
        name,
        description: t.description,
        parameters: zodToJsonSchema(t.parameters, { target: "openApi3", $refStrategy: "none" }) as Record<string, unknown>,
      },
    }));
}

export type ToolContext = { profile: PartialProfile; store: Store; inputMode?: "voice" | "text"; currentYear?: number; pendingKeys?: string[] };

/** Execute one tool call. Always returns JSON-serializable output; never throws. */
export async function runTool(name: string, rawArgs: unknown, ctx: ToolContext): Promise<unknown> {
  const def = tools[name as ToolName];
  if (!def) return { error: `unknown_tool:${name}` };
  const parsed = def.parameters.safeParse(rawArgs);
  if (!parsed.success) return { error: "invalid_arguments", issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) };
  const args = parsed.data as Record<string, unknown>;
  try {
    switch (name as ToolName) {
      case "update_profile": {
        const facts = args.facts as { key: string; value: unknown; inferred: boolean }[];
        const staged: { key: string; value: unknown }[] = [];
        const rejected: { key: string; error: string }[] = [];
        for (const f of facts) {
          const v = validateFact(f.key, f.value);
          if (v.ok) staged.push({ key: v.key, value: v.value });
          else rejected.push({ key: f.key, error: v.error });
        }
        if (staged.length) {
          // Facts heard by speech-to-text are marked "spoken": they're read back before they count.
          const source = (key: string) => (facts.find((f) => f.key === key)?.inferred ? "inferred" : ctx.inputMode === "voice" ? "spoken" : "user") as "inferred" | "spoken" | "user";
          await ctx.store.stageFacts(staged.map((s) => ({ ...s, source: source(s.key) })));
        }
        return { staged, rejected, needsUserConfirmation: staged.length > 0, note: "Shown to the user on their profile card. Not used for eligibility until confirmed." };
      }
      case "check_eligibility": {
        const results = evaluate(ctx.profile, args.programIds as string[] | undefined);
        return {
          basedOnConfirmedProfile: true,
          results: results.map((r) => ({
            programId: r.programId, name: r.name, kind: r.kind, status: r.status, reason: r.reason,
            missing: r.missing, factKeys: r.factKeys, applyUrl: r.applyUrl,
          })),
        };
      }
      case "explain_item": {
        const rm = buildRoadmap(ctx.profile, { currentYear: ctx.currentYear, programIds: [args.programId as string] });
        const item = [...rm.items, ...rm.needsFact, ...rm.notForYou][0];
        if (!item) return { error: "unknown_program", hint: "Use a programId from check_eligibility." };
        return {
          programId: item.programId, name: item.name, status: item.status, reason: item.reason, tier: item.tier,
          claims: item.claims.map((c) => ({ kind: c.kind, key: c.key, params: c.params, status: c.status, reviewedByPerson: c.reviewed, sources: c.sources.map((s) => ({ url: s.url, tier: s.tier, quote: s.quote })) })),
          youToldMe: item.why.youToldMe, unknown: item.why.unknown, applyUrl: item.applyUrl,
        };
      }
      case "next_questions": {
        const exclude = new Set([...(ctx.pendingKeys ?? [])]);
        return { questions: nextQuestions(ctx.profile, exclude, { limit: args.limit as number, currentYear: ctx.currentYear }).map((q) => ({ key: q.key, input: q.input, options: q.options, unblocks: q.unblocks })) };
      }
      case "lookup_fact":
        return lookupFact(args.key as string, args.year as number | undefined);
      case "search_docs":
        return await searchDocs(args.query as string, { programId: args.programId as string | undefined, limit: args.limit as number });
      case "calculate":
        return calculate(args.calculator as CalculatorName, args.inputs as Record<string, number>);
      case "query_transactions": {
        const agg = await ctx.store.aggregateTransactions(args as { category?: string; from?: string; to?: string });
        return agg ? { aggregates: agg } : { error: "no_statement_uploaded" };
      }
    }
  } catch (e) {
    return { error: (e as Error).message };
  }
}
