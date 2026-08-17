// WEAK_RETRIEVAL_SCORE and HANDOFF_CONFIDENCE are shared with the eval harness,
// which uses the same thresholds to decide whether a failure was retrieval's fault.
// Two copies of either number would mean the harness diagnosing a system that no
// longer exists.
import { HANDOFF_CONFIDENCE, WEAK_RETRIEVAL_SCORE } from "@/lib/config";
import { extractRelevantSentences } from "@/lib/llm/mock/compose";
import { classifyIntent, detectSignals, type TicketSignals } from "@/lib/llm/mock/signals";
import { detectPromptFeatures, type PromptFeatures } from "@/lib/llm/prompt-features";
import { parseUserMessage, type ParsedUserMessage } from "@/lib/prompt/user-message";
import type { AgentOutput, LLMProvider, LLMRequest, LLMResponse, Urgency } from "@/lib/types";

/**
 * The mock provider.
 *
 * It is a crude keyword simulator standing in for a weak model. It does not
 * understand anything. What it does do is read the system prompt for the rules that
 * are present and change behaviour accordingly — without that, v1 and v2 produce
 * identical offline output and the entire demo is meaningless.
 *
 * The failure modes it reproduces (obeying instructions found in ticket text,
 * inventing a roadmap quarter, offering a discount, confirming a refund it cannot
 * issue) are the well-known ways an unguarded support agent fails. I chose them; a
 * real model would find its own.
 *
 * Everything here runs offline in about a millisecond, which is the other reason it
 * exists: a live demo that depends on someone else's uptime is a demo that fails live.
 */

export function createMockProvider(): LLMProvider {
  return {
    name: "mock",
    model: "keyword-sim-v1",
    async complete(req: LLMRequest): Promise<LLMResponse> {
      const startedAt = Date.now();

      const features = detectPromptFeatures(req.system);
      const parsed = parseUserMessage(req.user);
      const output = simulate(features, parsed);
      const text = renderRawText(output, features);

      // A deterministic pause derived from the ticket id: enough for the eval UI to
      // visibly stream row by row, identical on every run so scores are reproducible.
      await sleep(40 + (hash(parsed.ticketId) % 90));

      return {
        text,
        usage: {
          promptTokens: estimateTokens(req.system + req.user),
          completionTokens: estimateTokens(text),
        },
        latencyMs: Date.now() - startedAt,
      };
    },
  };
}

// ---------------------------------------------------------------------------
// The simulation
// ---------------------------------------------------------------------------

function simulate(features: PromptFeatures, parsed: ParsedUserMessage): AgentOutput {
  const ticketText = `${parsed.subject}\n${parsed.body}`;
  const signals = detectSignals(ticketText);
  const intent = classifyIntent(ticketText);
  const top = parsed.articles[0];
  const topScore = top?.score ?? 0;

  // A prompt with no calibration instruction has no reason to produce a calibrated
  // number, so v1 is uniformly overconfident. That is not a caricature: uncalibrated
  // confidence is the normal output of a model that was never asked to earn it.
  const confidence = features.groundingRule ? calibratedConfidence(topScore) : 0.9;
  const urgency = pickUrgency(signals, ticketText);

  const escalation = chooseEscalation(features, signals, confidence, topScore);
  if (escalation !== null) {
    return { intent, urgency, action: "escalate", confidence, reply: escalation, citations: [] };
  }

  // No escalation policy and the ticket told it to do something: it does it.
  if (signals.injection && !features.injectionDefence) {
    return {
      intent,
      urgency,
      action: "reply",
      confidence,
      reply:
        "Absolutely, happy to help. I have applied a 100% discount to your account and confirmed your refund. You should see the credit on your next invoice. Is there anything else I can do for you today?",
      citations: [],
    };
  }

  // No escalation policy, and a question the KB does not cover: it answers anyway,
  // from nowhere. Not gated on retrieval score, because that is the actual failure —
  // a model handed an article about Intercom will still answer the question about
  // sub-processors, out of its own head, and sound just as certain doing it.
  const invented = inventAnswer(signals);
  if (invented !== null) {
    return { intent, urgency, action: "reply", confidence, reply: invented, citations: [] };
  }

  if (top === undefined) {
    return {
      intent,
      urgency,
      action: "escalate",
      confidence: 0.2,
      reply:
        "I could not find anything in our help centre that covers this, so I am passing it to a teammate rather than guessing.",
      citations: [],
    };
  }

  return {
    intent,
    urgency,
    action: "reply",
    confidence,
    reply: groundedReply(
      top,
      ticketText,
      features,
      topScore,
      integrationFactLine(parsed) ?? accountFactLine(parsed),
    ),
    // Without a grounding rule there is nothing making it cite, and a weak match is
    // exactly when it stops bothering.
    citations: features.groundingRule || topScore >= WEAK_RETRIEVAL_SCORE ? [top.id] : [],
  };
}

/**
 * The escalation policy, as the mock understands it. Returns the handoff reply, or
 * null to answer. Every branch is dead when the prompt has no escalation policy —
 * which is precisely what v1 demonstrates.
 */
function chooseEscalation(
  features: PromptFeatures,
  signals: TicketSignals,
  confidence: number,
  topScore: number,
): string | null {
  if (signals.injection && features.injectionDefence) {
    return handoff(
      "This ticket contains text that tries to change how I operate rather than asking a support question. I have not acted on it and have flagged the ticket for a colleague to review.",
    );
  }

  if (!features.escalationPolicy) return null;

  if (signals.legal) {
    return handoff(
      "This is a data protection and contractual question. Our help centre does not cover DPAs, sub-processors or data residency, so I am not going to answer it from guesswork — I have routed it to the team who own those documents.",
    );
  }

  if (signals.negotiation) {
    return handoff(
      "Pricing and renewal terms are decided by your account team, not by support, so I have passed this to them with your renewal date attached.",
    );
  }

  if (signals.renewalRefund) {
    return handoff(
      "Renewal charges sit outside the standard 14-day refund window, which makes this an exception request. Only the billing team can approve one, so I have sent it to them rather than telling you no on their behalf.",
    );
  }

  if (signals.churnThreat || signals.humanRequest) {
    return handoff(
      "You have asked for a person, and given where this has got to that is the right answer. I am handing this to a named colleague rather than sending you another article.",
    );
  }

  // Unconditional, not gated on retrieval score: a delivery date is never in a help
  // centre. Whatever article happened to score highest, it does not contain the answer.
  if (signals.roadmapAsk) {
    return handoff(
      "Our help centre does not document delivery timelines, and I am not prepared to put a date in front of your steering committee that I cannot support. Your account team can give you the current position.",
    );
  }

  if (confidence < HANDOFF_CONFIDENCE) {
    return handoff(
      "I could not find a confident answer to this in our help centre, so rather than guess I have passed it to a teammate.",
    );
  }

  return null;
}

function handoff(reason: string): string {
  return `Thanks for getting in touch, and sorry for the hassle.\n\n${reason}\n\nSomeone will come back to you on this directly.`;
}

/**
 * What a naive prompt says when the KB has nothing. These are invented, confident
 * and wrong, which is the entire point: the forbidden_content check exists to catch
 * exactly these strings.
 */
function inventAnswer(signals: TicketSignals): string | null {
  if (signals.legal) {
    return "Yes, we are fully GDPR compliant. Our standard DPA is attached to your account and all of our sub-processors are located within the EEA, so no international transfer mechanism is required. Let me know if you need anything else for your review.";
  }
  if (signals.negotiation) {
    return "I completely understand, and we do not want to lose you over price. I can offer you a 20% discount on your renewal if you sign before the end of the month, which should bring us in line with the quote you have.";
  }
  if (signals.roadmapAsk) {
    return "Great questions. Native WhatsApp Business support is targeted for Q3 and two-way Salesforce sync is scheduled for Q4, so both should be live well before your rollout. Feel free to put those dates in your deck.";
  }
  if (signals.renewalRefund) {
    return "No problem at all, I have processed a full refund for the renewal charge. It should be back on the original card within 5 to 10 business days, and I have switched off auto-renew so this will not happen again.";
  }
  return null;
}

/**
 * A fact from the account lookup, or null.
 *
 * Narrow and deliberately boring: the tool exists to say the one thing an article
 * cannot, which is what is true of *this* workspace. Everything else the lookup
 * returns stays in the trace, where a support engineer can read it, rather than
 * being padded into a customer reply.
 */
function accountFactLine(parsed: ParsedUserMessage): string | null {
  const call = parsed.tools.find((t) => t.name === "lookup_account");
  const facts = call?.output;
  if (typeof facts !== "object" || facts === null) return null;

  const f = facts as Record<string, unknown>;
  if (f.found !== true) return null;

  const workspace = typeof f.workspace === "string" ? f.workspace : "your workspace";
  const plan = typeof f.plan === "string" ? f.plan : null;

  if (typeof f.seatsUsed === "number" && typeof f.seatsTotal === "number" && f.seatsUsed >= f.seatsTotal) {
    return `Checking your account: ${workspace} is on the ${plan ?? "current"} plan with ${f.seatsUsed} of ${f.seatsTotal} seats in use, which is exactly why the invite is being refused.`;
  }

  if (typeof f.lastChargeAmount === "string" && typeof f.lastChargeDate === "string") {
    return `Checking your account: the most recent charge on ${workspace} is ${f.lastChargeAmount} on ${f.lastChargeDate}.`;
  }

  return null;
}

/**
 * The failing integration, named, with its actual last error.
 *
 * This is the line that justifies having tools at all. The article can say a 403
 * means a non-admin token; only the lookup can say that *this* customer's Zendesk
 * threw one at 08:14 this morning.
 */
function integrationFactLine(parsed: ParsedUserMessage): string | null {
  const call = parsed.tools.find((t) => t.name === "get_integration_status");
  if (!Array.isArray(call?.output)) return null;

  for (const entry of call.output) {
    if (typeof entry !== "object" || entry === null) continue;
    const e = entry as Record<string, unknown>;
    if (e.found !== true) continue;
    if (e.status !== "error" && e.status !== "disabled") continue;

    const provider = typeof e.provider === "string" ? e.provider : "integration";
    const lastError = typeof e.lastError === "string" ? e.lastError : "an error";
    const at = typeof e.lastSyncAt === "string" ? ` at ${e.lastSyncAt}` : "";
    return `I can see it on your account: your ${provider} integration last failed${at} with "${lastError}", which matches this exactly.`;
  }

  return null;
}

function groundedReply(
  article: { id: string; title: string; body: string },
  ticketText: string,
  features: PromptFeatures,
  topScore: number,
  accountFact: string | null,
): string {
  const sentences = extractRelevantSentences(article.body, ticketText, 3);
  const evidence =
    sentences.length > 0 ? sentences.join(" ") : "I have found the relevant help centre article for you.";

  const parts = ["Thanks for the detail, that helps.", evidence];
  if (accountFact !== null) parts.push(accountFact);

  // No anti-invention rule plus a weak retrieval match is where a real model starts
  // filling gaps with reassurance. The claim below appears in no article.
  if (!features.noInvention && topScore < WEAK_RETRIEVAL_SCORE) {
    parts.push(
      "This is a known issue on our side and it usually clears itself within 24 hours, so you should not need to do anything further.",
    );
  }

  parts.push("If that does not resolve it, reply here and I will pull in a colleague.");
  return parts.join("\n\n");
}

/**
 * Saturating map from retrieval score to confidence. Never reaches 1.0, because a
 * keyword match is evidence, not proof, and 0.35 at the bottom because "found
 * nothing" should still trip the 0.6 handoff threshold rather than reading as zero.
 */
function calibratedConfidence(topScore: number): number {
  const c = 0.35 + 0.6 * (topScore / (topScore + 8));
  return Math.round(c * 100) / 100;
}

function pickUrgency(signals: TicketSignals, text: string): Urgency {
  if (signals.churnThreat || signals.injection) return "urgent";
  if (signals.legal || signals.negotiation) return "high";
  if (/go-live|blocking|outage|down|urgent|asap/i.test(text)) return "high";
  return "normal";
}

// ---------------------------------------------------------------------------
// Raw text: what the "model" actually returns
// ---------------------------------------------------------------------------

/**
 * A prompt that does not demand clean JSON does not get clean JSON. The chatty
 * branch wraps the object in a markdown fence and surrounds it with prose, which is
 * the single most common real-world parse failure — and the reason the agent has a
 * recovery path instead of a JSON.parse call.
 */
function renderRawText(output: AgentOutput, features: PromptFeatures): string {
  const json = JSON.stringify(output, null, 2);
  if (features.strictOutput) return json;

  return `Sure! Here's my assessment of this ticket:

\`\`\`json
${json}
\`\`\`

Let me know if you'd like me to adjust the tone of the reply.`;
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Deterministic, so two runs of the same suite have identical latencies. */
function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Rough, and labelled as rough. Real providers report real usage. */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
