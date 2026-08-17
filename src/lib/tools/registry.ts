import {
  ACCOUNTS,
  INTEGRATIONS,
  domainOf,
  type AccountFacts,
  type IntegrationFacts,
} from "@/lib/tools/fixtures";
import type { Tool, ToolCall } from "@/lib/types";

/**
 * The tool registry: account-specific facts the knowledge base cannot contain.
 *
 * An article can tell a customer that a 403 means a non-admin token. Only a lookup
 * can tell them that *their* integration threw a 403 at 08:14 this morning. That
 * gap is the reason support agents need tools at all.
 */

const lookupAccount: Tool = {
  name: "lookup_account",
  description: "Plan, seats, contract type and renewal date for the customer's workspace.",
  async run(input) {
    const email = typeof input.email === "string" ? input.email : "";
    const facts: AccountFacts = ACCOUNTS[domainOf(email)] ?? { found: false };
    return facts;
  },
};

const getIntegrationStatus: Tool = {
  name: "get_integration_status",
  description: "Current status and last error for the customer's connected integrations.",
  async run(input) {
    const email = typeof input.email === "string" ? input.email : "";
    const found: IntegrationFacts[] = INTEGRATIONS[domainOf(email)] ?? [];
    return found.length > 0 ? found : [{ found: false }];
  },
};

export const TOOLS: Tool[] = [lookupAccount, getIntegrationStatus];

/**
 * Which tools to run for a given ticket.
 *
 * This is a fixed policy, not the model choosing. Two honest reasons: the mock
 * provider has no tool-calling API to speak of, and a deterministic policy keeps the
 * exam reproducible — if the model picked its tools, a score change could be a
 * prompt change or a different tool call, and I would not be able to tell which.
 *
 * The `Tool` interface does not change if you move to model-driven tool calling.
 * That is the point of it being an interface. This function is what you delete.
 */
export function selectTools(ticketText: string): Tool[] {
  const selected: Tool[] = [lookupAccount];
  if (/zendesk|intercom|webhook|integration|sync|salesforce/i.test(ticketText)) {
    selected.push(getIntegrationStatus);
  }
  return selected;
}

/**
 * Run the selected tools, never throwing.
 *
 * A failing tool must degrade the answer, not the process. If the account service is
 * down, the agent should still reply from the knowledge base and the trace should
 * record that the lookup failed — that is precisely the trace a customer engineer
 * needs when someone reports "the bot stopped mentioning our plan".
 */
export async function runTools(tools: Tool[], email: string): Promise<ToolCall[]> {
  const calls: ToolCall[] = [];

  for (const tool of tools) {
    const input = { email };
    const startedAt = Date.now();
    try {
      const output = await tool.run(input);
      calls.push({ name: tool.name, input, output, durationMs: Date.now() - startedAt });
    } catch (err: unknown) {
      calls.push({
        name: tool.name,
        input,
        output: null,
        durationMs: Date.now() - startedAt,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return calls;
}
