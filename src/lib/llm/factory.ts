import { createMockProvider } from "@/lib/llm/mock";
import { createAnthropicProvider, isRealProviderConfigured, realProviderModel } from "@/lib/llm/real";
import type { LLMProvider } from "@/lib/types";

/**
 * Which provider a run uses. The UI selector maps onto this.
 *
 * `mock` is the default and always will be: a live demo that depends on someone
 * else's uptime is a demo that fails live. The real provider is an option for a room
 * that asks to see one, not the thing the demo rests on.
 */
export const PROVIDER_IDS = ["mock", "real"] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];

export function isProviderId(value: unknown): value is ProviderId {
  return typeof value === "string" && (PROVIDER_IDS as readonly string[]).includes(value);
}

export function createProvider(id: ProviderId): LLMProvider {
  // Throws with a readable message when no key is configured. Failing loudly beats
  // silently falling back to the mock and letting someone in the room believe they
  // just watched a real model run.
  return id === "real" ? createAnthropicProvider() : createMockProvider();
}

/** What the UI needs to know to render the provider selector honestly. */
export interface ProviderAvailability {
  realConfigured: boolean;
  realModel: string;
}

export function providerAvailability(): ProviderAvailability {
  return { realConfigured: isRealProviderConfigured(), realModel: realProviderModel() };
}
