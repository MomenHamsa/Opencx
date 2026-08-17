import { createMockProvider } from "@/lib/llm/mock";
import { createOpenAIProvider, isOpenAIConfigured, openAIModel } from "@/lib/llm/openai";
import { createAnthropicProvider, isRealProviderConfigured, realProviderModel } from "@/lib/llm/real";
import type { LLMProvider } from "@/lib/types";

/**
 * Which provider a run uses. The UI selector maps onto this.
 *
 * Three entries rather than "mock or real", because "which vendor" is a real
 * question once you have keys for more than one — and because a regression is
 * model-specific. A prompt that is safe on one model can leak on another, so
 * "it broke" always starts with "on which model?", and the trace has to be able
 * to answer.
 *
 * `mock` stays the default. It needs no key, costs nothing, and runs offline.
 */
export const PROVIDER_IDS = ["mock", "openai", "anthropic"] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];

export function isProviderId(value: unknown): value is ProviderId {
  return typeof value === "string" && (PROVIDER_IDS as readonly string[]).includes(value);
}

/**
 * `model` overrides the env default for one run, so two models can be compared on
 * the same tests without an edit-and-restart cycle.
 */
export function createProvider(id: ProviderId, model?: string): LLMProvider {
  const chosen = (model ?? "").trim();
  const withModel = (p: LLMProvider): LLMProvider =>
    chosen === "" || chosen === p.model ? p : { ...p, model: chosen };

  // Each of these throws a readable message when its key is missing. Failing loudly
  // beats silently falling back to the mock and letting someone believe they just
  // watched a real model run.
  switch (id) {
    case "openai":
      return withModel(createOpenAIProvider(chosen));
    case "anthropic":
      return withModel(createAnthropicProvider(chosen));
    default:
      return createMockProvider();
  }
}

export interface ProviderOption {
  id: ProviderId;
  /** What the selector shows. The model id when configured, the reason when not. */
  label: string;
  available: boolean;
  /** True for anything that costs money and talks to the network. */
  live: boolean;
}

/** What the UI needs to render the provider selector honestly. */
export function providerOptions(): ProviderOption[] {
  const openaiReady = isOpenAIConfigured();
  const anthropicReady = isRealProviderConfigured();

  return [
    { id: "mock", label: "mock (offline, free)", available: true, live: false },
    {
      id: "openai",
      label: openaiReady ? openAIModel() : "OpenAI — no OPENAI_API_KEY set",
      available: openaiReady,
      live: true,
    },
    {
      id: "anthropic",
      label: anthropicReady ? realProviderModel() : "Anthropic — no ANTHROPIC_API_KEY set",
      available: anthropicReady,
      live: true,
    },
  ];
}
