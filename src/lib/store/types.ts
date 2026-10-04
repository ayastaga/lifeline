import type { Lang, Script } from "../i18n/detect";
import type { PartialProfile } from "../rules/engine";

export type FactSource = "user" | "inferred" | "statement" | "spoken";

export type PendingFact = { key: string; value: unknown; source: FactSource; confidence?: number | null };

export type ProfileState = {
  confirmed: PartialProfile;
  pending: PendingFact[];
  language: Lang;
  script: Script | null;
};

export type Txn = { postedOn: string; description: string; amount: number; category: string | null };

export type TxnAggregate = {
  category: string;
  count: number;
  total: number;
  monthlyAverage: number;
};

export type StoredMessage = { role: "user" | "assistant"; content: string };

export interface Store {
  readonly kind: "supabase" | "memory";
  userId(): string;
  getProfile(): Promise<ProfileState>;
  stageFacts(facts: PendingFact[]): Promise<void>;
  confirmFacts(keys: string[]): Promise<void>;
  rejectFacts(keys: string[]): Promise<void>;
  /** Remove a confirmed fact (user edits their card). */
  clearFacts(keys: string[]): Promise<void>;
  setLanguage(language: Lang, script: Script | null): Promise<void>;

  getConversation(language: Lang): Promise<{ id: string; history: StoredMessage[] }>;
  addMessage(conversationId: string, msg: StoredMessage & { citations?: unknown }, toolCalls?: { tool: string; input: unknown; output: unknown }[]): Promise<string>;

  replaceTransactions(rows: Txn[]): Promise<void>;
  aggregateTransactions(filter: { category?: string; from?: string; to?: string }): Promise<TxnAggregate[] | null>;

  addFeedback(f: { messageId?: string | null; programId?: string | null; kind: string; note?: string | null }): Promise<void>;
}
