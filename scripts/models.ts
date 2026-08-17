import { loadEnvFile } from "./_env";

loadEnvFile();

/**
 * Ask each configured key what models it can actually reach.
 *
 *   npm run models
 *
 * Exists because hardcoded model lists go stale and this does not. Also doubles as
 * the cheapest possible connectivity test: it either prints models or tells you
 * exactly why the key does not work.
 */
import { isOpenAIConfigured, listOpenAIModels, openAIModel } from "@/lib/llm/openai";
import { isRealProviderConfigured, realProviderModel } from "@/lib/llm/real";

async function main(): Promise<void> {
  console.log("");

  if (!isOpenAIConfigured()) {
    console.log("OPENAI_API_KEY  not set");
  } else {
    console.log(`OPENAI_API_KEY  set — configured model: ${openAIModel()}`);
    try {
      const models = await listOpenAIModels();
      const chat = models.filter((m) => /^(gpt|o\d|chatgpt)/i.test(m));
      console.log(`  reachable models: ${models.length} (${chat.length} chat-capable)\n`);
      for (const id of chat) console.log(`    ${id}`);
      if (chat.length === 0) {
        console.log("    (none matched the chat naming patterns — full list:)");
        for (const id of models) console.log(`    ${id}`);
      }
    } catch (err: unknown) {
      console.log(`  FAILED: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  console.log("");
  console.log(
    isRealProviderConfigured()
      ? `ANTHROPIC_API_KEY  set — configured model: ${realProviderModel()}`
      : "ANTHROPIC_API_KEY  not set",
  );
  console.log("");
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
