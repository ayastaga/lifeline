import { randomUUID } from "node:crypto";
import type { Lang, Script } from "../i18n/detect";
import type { PartialProfile } from "../rules/engine";
import { aggregate } from "./aggregate";
import type { PendingFact, ProfileState, Store, StoredMessage, Txn } from "./types";

// Dev / demo fallback when Supabase is not configured. State lives in process
// memory, keyed by a session cookie, and is lost on restart. Never use in prod.

type Session = {
  confirmed: Record<string, unknown>;
  pending: Map<string, PendingFact>;
  language: Lang;
  script: Script | null;
  conversations: Map<string, { language: Lang; messages: StoredMessage[] }>;
  transactions: Txn[];
  feedback: unknown[];
};

const g = globalThis as unknown as { __lifelineMem?: Map<string, Session> };
const sessions = (g.__lifelineMem ??= new Map());

export class MemoryStore implements Store {
  readonly kind = "memory" as const;
  private s: Session;

  constructor(private sid: string, seed?: { profile?: PartialProfile; language?: Lang }) {
    let s = sessions.get(sid);
    if (!s) {
      s = { confirmed: {}, pending: new Map(), language: "en", script: null, conversations: new Map(), transactions: [], feedback: [] };
      sessions.set(sid, s);
    }
    if (seed?.profile) s.confirmed = { ...seed.profile };
    if (seed?.language) s.language = seed.language;
    this.s = s;
  }

  userId() { return this.sid; }

  async getProfile(): Promise<ProfileState> {
    return { confirmed: { ...this.s.confirmed } as PartialProfile, pending: [...this.s.pending.values()], language: this.s.language, script: this.s.script };
  }
  async stageFacts(facts: PendingFact[]) { for (const f of facts) this.s.pending.set(f.key, f); }
  async confirmFacts(keys: string[]) {
    for (const k of keys) {
      const p = this.s.pending.get(k);
      if (p) { this.s.confirmed[k] = p.value; this.s.pending.delete(k); }
    }
  }
  async rejectFacts(keys: string[]) { for (const k of keys) this.s.pending.delete(k); }
  async clearFacts(keys: string[]) { for (const k of keys) delete this.s.confirmed[k]; }
  async setLanguage(language: Lang, script: Script | null) { this.s.language = language; this.s.script = script; }

  async getConversation(language: Lang) {
    const latest = [...this.s.conversations.entries()].at(-1);
    if (latest) return { id: latest[0], history: latest[1].messages.slice(-12) };
    const id = randomUUID();
    this.s.conversations.set(id, { language, messages: [] });
    return { id, history: [] };
  }
  async addMessage(conversationId: string, msg: StoredMessage) {
    this.s.conversations.get(conversationId)?.messages.push({ role: msg.role, content: msg.content });
    return randomUUID();
  }

  async replaceTransactions(rows: Txn[]) { this.s.transactions = rows; }
  async aggregateTransactions(filter: { category?: string; from?: string; to?: string }) {
    if (this.s.transactions.length === 0) return null;
    return aggregate(this.s.transactions, filter);
  }
  async addFeedback(f: unknown) { this.s.feedback.push(f); }
}
