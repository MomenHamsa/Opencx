import { isOpenAIConfigured, listOpenAIModels, openAIModel } from "@/lib/llm/openai";
import { isRealProviderConfigured, realProviderModel } from "@/lib/llm/real";

/**
 * What each configured key can actually reach.
 *
 * Asked at runtime rather than hardcoded, because a model list goes stale and this
 * does not. A failure here is not fatal: the UI falls back to the configured
 * default, so a provider outage costs you the dropdown, not the run.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Chat-capable ids only — embeddings and audio models would just clutter the list. */
const CHAT_LIKE = /^(gpt|o\d)/i;
const NOT_CHAT = /embed|audio|image|tts|whisper|moderation|realtime|transcribe|search|codex/i;

export async function GET(): Promise<Response> {
  const models: Record<string, string[]> = { mock: ["keyword-sim-v1"] };

  if (isOpenAIConfigured()) {
    try {
      const all = await listOpenAIModels();
      const chat = all.filter((m) => CHAT_LIKE.test(m) && !NOT_CHAT.test(m));
      models.openai = chat.length > 0 ? chat : [openAIModel()];
    } catch {
      models.openai = [openAIModel()];
    }
  }

  if (isRealProviderConfigured()) {
    // No equivalent list call is wired up for Anthropic, so offer the configured
    // model plus the ones the price table knows about.
    models.anthropic = [
      ...new Set([realProviderModel(), "claude-opus-5", "claude-sonnet-5", "claude-haiku-4-5"]),
    ];
  }

  return Response.json({ models });
}
