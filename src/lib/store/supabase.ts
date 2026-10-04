import type { SupabaseClient } from "@supabase/supabase-js";
import type { Lang, Script } from "../i18n/detect";
import type { PartialProfile } from "../rules/engine";
import { aggregate } from "./aggregate";
import type { PendingFact, ProfileState, Store, StoredMessage, Txn } from "./types";

// All queries run as the user (anon key + session cookie), so RLS policies
// in 0001_init.sql are what keep users apart, not this code.

export class SupabaseStore implements Store {
  readonly kind = "supabase" as const;
  constructor(private db: SupabaseClient, private uid: string) {}

  userId() { return this.uid; }

  private check<T>(res: { data: T; error: { message: string } | null }): T {
    if (res.error) throw new Error(`supabase: ${res.error.message}`);
    return res.data;
  }

  async getProfile(): Promise<ProfileState> {
    await this.db.rpc("ensure_profile");
    const prof = this.check(await this.db.from("profiles").select("language, script").eq("user_id", this.uid).maybeSingle());
    const rows = this.check(
      await this.db.from("profile_facts").select("key, value, confirmed_at, pending_value, pending_source, pending_confidence").eq("user_id", this.uid),
    ) as { key: string; value: unknown; confirmed_at: string | null; pending_value: unknown; pending_source: PendingFact["source"] | null; pending_confidence: number | null }[];
    const confirmed: Record<string, unknown> = {};
    const pending: PendingFact[] = [];
    for (const r of rows) {
      if (r.confirmed_at && r.value !== null) confirmed[r.key] = r.value;
      if (r.pending_value !== null && r.pending_value !== undefined) pending.push({ key: r.key, value: r.pending_value, source: r.pending_source ?? "user", confidence: r.pending_confidence });
    }
    return {
      confirmed: confirmed as PartialProfile,
      pending,
      language: ((prof as { language?: Lang } | null)?.language ?? "en") as Lang,
      script: ((prof as { script?: Script } | null)?.script ?? null) as Script | null,
    };
  }

  async stageFacts(facts: PendingFact[]) {
    for (const f of facts) {
      const existing = this.check(await this.db.from("profile_facts").select("id").eq("user_id", this.uid).eq("key", f.key).maybeSingle());
      const patch = { pending_value: f.value as never, pending_source: f.source, pending_confidence: f.confidence ?? null, pending_at: new Date().toISOString() };
      if (existing) this.check(await this.db.from("profile_facts").update(patch).eq("user_id", this.uid).eq("key", f.key));
      else this.check(await this.db.from("profile_facts").insert({ user_id: this.uid, key: f.key, value: null as never, ...patch }));
    }
  }

  async confirmFacts(keys: string[]) {
    const rows = this.check(await this.db.from("profile_facts").select("key, pending_value, pending_source, pending_confidence").eq("user_id", this.uid).in("key", keys)) as {
      key: string; pending_value: unknown; pending_source: PendingFact["source"] | null; pending_confidence: number | null;
    }[];
    for (const r of rows) {
      if (r.pending_value === null || r.pending_value === undefined) continue;
      this.check(
        await this.db.from("profile_facts").update({
          value: r.pending_value as never, source: r.pending_source ?? "user", confidence: r.pending_confidence,
          confirmed_at: new Date().toISOString(), pending_value: null, pending_source: null, pending_confidence: null, pending_at: null,
        }).eq("user_id", this.uid).eq("key", r.key),
      );
    }
    // Keep language/province on the profiles row in sync for quick reads.
    if (keys.includes("province")) {
      const p = await this.getProfile();
      if (p.confirmed.province) await this.db.from("profiles").update({ province: p.confirmed.province }).eq("user_id", this.uid);
    }
  }

  async rejectFacts(keys: string[]) {
    this.check(await this.db.from("profile_facts").update({ pending_value: null, pending_source: null, pending_confidence: null, pending_at: null }).eq("user_id", this.uid).in("key", keys));
    // Drop rows that never had a confirmed value.
    this.check(await this.db.from("profile_facts").delete().eq("user_id", this.uid).in("key", keys).is("confirmed_at", null));
  }

  async clearFacts(keys: string[]) {
    this.check(await this.db.from("profile_facts").delete().eq("user_id", this.uid).in("key", keys));
  }

  async setLanguage(language: Lang, script: Script | null) {
    await this.db.rpc("ensure_profile");
    this.check(await this.db.from("profiles").update({ language, script, updated_at: new Date().toISOString() }).eq("user_id", this.uid));
  }

  async getConversation(language: Lang) {
    const conv = this.check(await this.db.from("conversations").select("id").eq("user_id", this.uid).order("created_at", { ascending: false }).limit(1).maybeSingle()) as { id: string } | null;
    const id = conv?.id ?? (this.check(await this.db.from("conversations").insert({ user_id: this.uid, language }).select("id").single()) as { id: string }).id;
    const msgs = this.check(await this.db.from("messages").select("role, content").eq("conversation_id", id).in("role", ["user", "assistant"]).order("created_at", { ascending: false }).limit(12)) as StoredMessage[];
    return { id, history: msgs.reverse() };
  }

  async addMessage(conversationId: string, msg: StoredMessage & { citations?: unknown }, toolCalls?: { tool: string; input: unknown; output: unknown }[]) {
    const row = this.check(await this.db.from("messages").insert({ conversation_id: conversationId, role: msg.role, content: msg.content, citations: msg.citations ?? null }).select("id").single()) as { id: string };
    if (toolCalls?.length) {
      this.check(await this.db.from("tool_calls").insert(toolCalls.map((t) => ({ message_id: row.id, tool: t.tool, input: t.input as never, output: t.output as never }))));
    }
    return row.id;
  }

  async replaceTransactions(rows: Txn[]) {
    this.check(await this.db.from("transactions").delete().eq("user_id", this.uid));
    for (let i = 0; i < rows.length; i += 500) {
      const batch = rows.slice(i, i + 500).map((r) => ({ user_id: this.uid, posted_on: r.postedOn, description: r.description, amount: r.amount, category: r.category }));
      this.check(await this.db.from("transactions").insert(batch));
    }
  }

  async aggregateTransactions(filter: { category?: string; from?: string; to?: string }) {
    const rows = this.check(await this.db.from("transactions").select("posted_on, description, amount, category").eq("user_id", this.uid).limit(20000)) as {
      posted_on: string; description: string; amount: number; category: string | null;
    }[];
    if (rows.length === 0) return null;
    return aggregate(rows.map((r) => ({ postedOn: r.posted_on, description: r.description, amount: Number(r.amount), category: r.category })), filter);
  }

  async addFeedback(f: { messageId?: string | null; programId?: string | null; kind: string; note?: string | null }) {
    this.check(await this.db.from("feedback").insert({ user_id: this.uid, message_id: f.messageId ?? null, program_id: f.programId ?? null, kind: f.kind, note: f.note ?? null }));
  }
}
