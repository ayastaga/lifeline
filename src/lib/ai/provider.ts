import OpenAI from "openai";

// Swappable model provider. OpenAI's chat-completions shape is the lingua
// franca: vLLM serves Qwen3 behind the same API, so phase 2 is a config change.
// An Anthropic provider can implement the same interface later.

export type ChatMessage = OpenAI.Chat.Completions.ChatCompletionMessageParam;
export type ToolSpec = OpenAI.Chat.Completions.ChatCompletionTool;
export type AssistantMessage = OpenAI.Chat.Completions.ChatCompletionMessage;

export interface ChatProvider {
  readonly name: string;
  readonly model: string;
  complete(args: { messages: ChatMessage[]; tools?: ToolSpec[]; temperature?: number }): Promise<AssistantMessage>;
}

class OpenAICompatibleProvider implements ChatProvider {
  private client: OpenAI;
  constructor(public readonly name: string, public readonly model: string, opts: { apiKey: string; baseURL?: string }) {
    this.client = new OpenAI({ apiKey: opts.apiKey, baseURL: opts.baseURL });
  }
  async complete({ messages, tools, temperature = 0 }: { messages: ChatMessage[]; tools?: ToolSpec[]; temperature?: number }) {
    const res = await this.client.chat.completions.create({
      model: this.model,
      messages,
      tools: tools?.length ? tools : undefined,
      tool_choice: tools?.length ? "auto" : undefined,
      temperature,
      seed: 7,
    });
    return res.choices[0].message;
  }
}

export function getProvider(): ChatProvider {
  const which = (process.env.AI_PROVIDER ?? "openai").toLowerCase();
  switch (which) {
    case "openai": {
      const key = process.env.OPENAI_API_KEY;
      if (!key) throw new Error("OPENAI_API_KEY is not set");
      // Pin the model id; golden tests depend on it.
      return new OpenAICompatibleProvider("openai", process.env.OPENAI_MODEL ?? "gpt-4.1-2025-04-14", { apiKey: key });
    }
    case "qwen":
      return new OpenAICompatibleProvider("qwen", process.env.QWEN_MODEL ?? "Qwen/Qwen3-30B-A3B", {
        apiKey: process.env.QWEN_API_KEY ?? "not-needed",
        baseURL: process.env.QWEN_BASE_URL ?? "http://localhost:8000/v1",
      });
    case "anthropic":
      throw new Error("AI_PROVIDER=anthropic is planned but not implemented in v1; use openai or qwen.");
    default:
      throw new Error(`Unknown AI_PROVIDER: ${which}`);
  }
}

// ---------- Embeddings (multilingual, 1024 dims to match chunks.embedding) ----------

export async function embed(texts: string[]): Promise<number[][]> {
  const which = (process.env.EMBEDDING_PROVIDER ?? "openai").toLowerCase();
  if (which === "openai") {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const res = await client.embeddings.create({ model: process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-large", input: texts, dimensions: 1024 });
    return res.data.map((d) => d.embedding);
  }
  // bge-m3 behind any OpenAI-compatible /v1/embeddings server (TEI, infinity, vLLM).
  const client = new OpenAI({ apiKey: process.env.EMBEDDING_API_KEY ?? "not-needed", baseURL: `${process.env.EMBEDDING_BASE_URL ?? "http://localhost:8001"}/v1` });
  const res = await client.embeddings.create({ model: process.env.EMBEDDING_MODEL ?? "BAAI/bge-m3", input: texts });
  return res.data.map((d) => d.embedding);
}
