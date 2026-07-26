import OpenAI from "openai";
import { config } from "./config";

let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!client) {
    client = new OpenAI({ apiKey: config.openai.apiKey });
  }
  return client;
}

/**
 * Embed a batch of texts. OpenAI accepts arrays, so we batch to stay well
 * under request limits while keeping round-trips low during indexing.
 */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const BATCH = 96;
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += BATCH) {
    const slice = texts.slice(i, i + BATCH);
    const res = await getClient().embeddings.create({
      model: config.openai.embedModel,
      input: slice,
    });
    for (const item of res.data) out.push(item.embedding);
  }
  return out;
}

export async function embedQuery(text: string): Promise<number[]> {
  const [vec] = await embedTexts([text]);
  return vec;
}

/**
 * Stream a chat completion. Yields text deltas as they arrive so the API
 * route can forward them straight to the browser.
 */
export async function* streamChat(
  system: string,
  user: string,
): AsyncGenerator<string> {
  const stream = await getClient().chat.completions.create({
    model: config.openai.chatModel,
    temperature: 0.2,
    stream: true,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });
  for await (const part of stream) {
    const delta = part.choices[0]?.delta?.content;
    if (delta) yield delta;
  }
}
