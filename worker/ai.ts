// Εξωτερικοί AI providers (BYO key) + κρυπτογράφηση του API key.
const enc = new TextEncoder();

export type Provider = "gemini" | "openai";
export type LlmMessage = { role: "user" | "assistant"; content: string };
export type LlmOptions = { maxTokens: number; temperature: number };
export type Llm = (system: string, messages: LlmMessage[], opts: LlmOptions) => Promise<string>;

export const DEFAULT_MODELS: Record<Provider, string> = {
  gemini: "gemini-2.5-flash",
  openai: "gpt-4o-mini"
};

export function isProvider(value: unknown): value is Provider {
  return value === "gemini" || value === "openai";
}

/* ---------------------------- Κρυπτογράφηση key ---------------------------- */

async function aesKey(secret: string): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(`ff-chat-ai-keys:${secret}`));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}

function toB64(bytes: Uint8Array): string {
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin);
}

function fromB64(text: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(text), (ch) => ch.charCodeAt(0)) as Uint8Array<ArrayBuffer>;
}

export async function encryptSecret(plain: string, secret: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await aesKey(secret), enc.encode(plain));
  return `${toB64(iv)}.${toB64(new Uint8Array(cipher))}`;
}

export async function decryptSecret(stored: string, secret: string): Promise<string> {
  const [iv, cipher] = stored.split(".");
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64(iv) }, await aesKey(secret), fromB64(cipher));
  return new TextDecoder().decode(plain);
}

/* -------------------------------- Providers -------------------------------- */

export class ExternalAiError extends Error {
  constructor(public status: number, public provider: Provider) {
    super(`${provider} responded ${status}`);
  }
}

export function makeExternalLlm(provider: Provider, model: string, apiKey: string): Llm {
  return async (system, messages, opts) => {
    if (provider === "gemini") {
      const generationConfig: Record<string, unknown> = {
        temperature: opts.temperature,
        maxOutputTokens: opts.maxTokens
      };
      // Τα flash μοντέλα «σκέφτονται» και καταναλώνουν tokens: το κλείνουμε για σύντομες απαντήσεις.
      if (model.includes("flash")) generationConfig.thinkingConfig = { thinkingBudget: 0 };

      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: system }] },
            contents: messages.map((m) => ({
              role: m.role === "assistant" ? "model" : "user",
              parts: [{ text: m.content }]
            })),
            generationConfig
          })
        }
      );
      if (!res.ok) throw new ExternalAiError(res.status, provider);
      const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
      return (data.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("").trim();
    }

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        max_completion_tokens: opts.maxTokens,
        messages: [{ role: "system", content: system }, ...messages]
      })
    });
    if (!res.ok) throw new ExternalAiError(res.status, provider);
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    return (data.choices?.[0]?.message?.content ?? "").trim();
  };
}
