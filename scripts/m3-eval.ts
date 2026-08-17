/**
 * Milestone 3: run the exam. `npm run m3 [promptVersion] [--baseline]`
 *
 * Pass `--baseline` to promote this run to the saved baseline. Everything after
 * that compares against it.
 */
import { createSpecificityJudge } from "@/lib/eval/judge";
import { evaluateStream, summarise } from "@/lib/eval/run";
import { diffAgainstBaseline, loadBaseline, saveBaseline, saveRun } from "@/lib/eval/store";
import { createProvider } from "@/lib/llm/factory";
import { FEATURE_LABELS, detectPromptFeatures } from "@/lib/llm/prompt-features";
import { findPrompt, loadWorkspace } from "@/lib/workspace/store";
import { createKeywordRetriever } from "@/lib/retrieval/keyword";
import type { EvalRow } from "@/lib/types";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const promptId = args.find((a) => !a.startsWith("--")) ?? "v1";

  // `npm run m3 -- v1 --baseline` passes the flag through in argv.
  // `npm run m3 v1 --baseline` does not — npm swallows it as one of its own flags and
  // re-exposes it as npm_config_baseline. Checking both means the obvious command
  // works instead of silently doing nothing, which is the worst way for a flag to fail.
  const promote = args.includes("--baseline") || process.env.npm_config_baseline === "true";

  const workspace = await loadWorkspace();
  const prompt = findPrompt(workspace, promptId);
  if (prompt === undefined) throw new Error(`unknown prompt version: ${promptId}`);

  // `--real` runs against the configured model instead of the mock. Needs a key, so
  // invoke it as: npm run m3 -- v2 --real --env-file=.env
  // (Next loads .env by itself; a bare tsx script does not.)
  const providerId = args.includes("--real") ? "real" : "mock";
  const provider = createProvider(providerId);
  const opts = {
    prompt,
    provider,
    retriever: createKeywordRetriever(workspace.articles),
    judge: createSpecificityJudge(),
    cases: workspace.cases,
    articles: workspace.articles,
  };

  // Which rules the prompt actually contains. Printed on every run because with the
  // mock provider these five booleans are the *entire* difference between versions —
  // if this line is wrong, the score below means nothing.
  const features = detectPromptFeatures(prompt.system);
  const active = Object.entries(features)
    .map(([k, on]) => `${on ? "+" : "-"}${FEATURE_LABELS[k as keyof typeof FEATURE_LABELS]}`)
    .join("  ");

  console.log(`\nEVAL  prompt=${prompt.id} (${prompt.label})  provider=${provider.name}/${provider.model}`);
  console.log(`      rules: ${active}\n`);
  console.log("  ticket  result  action     category    latency  failed checks");

  const rows: EvalRow[] = [];
  for await (const row of evaluateStream(opts)) {
    rows.push(row);

    const failed = row.checks
      .filter((c) => !c.diagnostic && !c.skipped && !c.passed)
      .map((c) => c.name);

    console.log(
      `  ${row.ticketId}  ${(row.passed ? "PASS" : "FAIL").padEnd(6)}  ${row.action.padEnd(9)}  ${(row.failureCategory ?? "-").padEnd(10)}  ${String(row.latencyMs).padStart(5)}ms  ${failed.join(" ") || "-"}`,
    );
  }

  const run = summarise(rows, opts);
  await saveRun(run);

  console.log(`\n  SCORE ${run.passed} / ${run.total}\n`);

  // Failure detail, so the number is never the only thing on screen.
  const failures = rows.filter((r) => !r.passed);
  if (failures.length > 0) {
    console.log("FAILURES\n");
    for (const row of failures) {
      console.log(`  ${row.ticketId} [${row.failureCategory}] ${row.subject}`);
      for (const c of row.checks) {
        if (c.skipped) continue;
        if (c.passed && !c.diagnostic) continue;
        const tag = c.diagnostic ? (c.passed ? "diag ok " : "diag !! ") : "failed  ";
        console.log(`      ${tag}${c.name.padEnd(18)} ${c.detail}`);
      }
      console.log("");
    }
  }

  const baseline = await loadBaseline();
  if (baseline !== null) {
    const diff = diffAgainstBaseline(run, baseline);
    console.log(
      `DIFF vs baseline ${diff.baselinePromptVersion} (${diff.baselinePassed}/${diff.baselineTotal})`,
    );
    console.log(`  fixed        ${diff.fixed.join(", ") || "none"}`);
    console.log(`  regressed    ${diff.regressed.join(", ") || "none"}`);
    console.log(`  still failing ${diff.stillFailing.join(", ") || "none"}\n`);
  } else {
    console.log("DIFF  no baseline saved yet. Re-run with --baseline to set one.\n");
  }

  if (promote) {
    await saveBaseline(run);
    console.log(`baseline set to ${run.runId} (${run.passed}/${run.total})\n`);
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
