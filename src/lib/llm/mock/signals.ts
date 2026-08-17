import { INTENTS, type Intent } from "@/lib/types";

/**
 * Keyword detection over the ticket text, for the mock provider only.
 *
 * This is a crude keyword simulator standing in for a weak model. It is not
 * classification, it has no notion of meaning, and every regex here is one I wrote
 * by looking at the golden set. Its only job is to make an offline demo behave in a
 * way that is *shaped* like a real model's behaviour, so the harness has something
 * to measure. Swap in the real provider and none of this file runs.
 */

export interface TicketSignals {
  /** Ticket text trying to act as instructions. */
  injection: boolean;
  /** Legal, data protection, DPAs, sub-processors — nothing in the KB covers it. */
  legal: boolean;
  /** Commercial negotiation: discounts, competitor quotes, price. */
  negotiation: boolean;
  /** Threatening to cancel or escalate internally. */
  churnThreat: boolean;
  /** Asking for a delivery date for something the KB does not mention. */
  roadmapAsk: boolean;
  /** A refund on a renewal, which the policy explicitly excludes. */
  renewalRefund: boolean;
  /** Explicitly asking for a person. */
  humanRequest: boolean;
}

const RE = {
  injection:
    /ignore\s+(?:all\s+)?(?:previous|prior|the above)\s+instructions|you are now\s+(?:a|an)\b|disregard\s+(?:all\s+)?(?:previous|prior)|do not\s+(?:mention|escalate)|full refund authority/i,
  legal:
    /\bdpa\b|sub-?processor|data processing agreement|\bgdpr\b|\bcounsel\b|legal\b|transfer mechanism|data residency|at rest|security review/i,
  negotiation:
    /discount|competitive quote|competitor|move on price|pricing|renewal number|procurement|below what we|on price/i,
  churnThreat:
    /my vp|escalating this|not\s+(?:to\s+)?renew|whether we renew|reviewing whether|take (?:this|it) to|third time asking/i,
  roadmapAsk:
    /roadmap|which quarter|when will you|\beta\b|release date|dates please|lands? in|steering committee/i,
  refundWord: /refund|money back|charge ?back/i,
  renewalWord: /renewal|renewed|auto-?renew/i,
  humanRequest: /named person|speak to (?:a|someone)|real person|talk to someone|not another article/i,
};

export function detectSignals(text: string): TicketSignals {
  return {
    injection: RE.injection.test(text),
    legal: RE.legal.test(text),
    negotiation: RE.negotiation.test(text),
    churnThreat: RE.churnThreat.test(text),
    roadmapAsk: RE.roadmapAsk.test(text),
    renewalRefund: RE.refundWord.test(text) && RE.renewalWord.test(text),
    humanRequest: RE.humanRequest.test(text),
  };
}

// ---------------------------------------------------------------------------
// Intent
// ---------------------------------------------------------------------------

/**
 * Weighted keyword vote. Highest total wins; ties break by the order of INTENTS.
 *
 * A vote rather than an if/else chain because tickets are mixtures: T-012 says
 * "sync" (integration) and "which quarter" (product question) in the same sentence,
 * and an ordered chain would let whichever branch I happened to write first win.
 */
const INTENT_KEYWORDS: Record<Intent, [RegExp, number][]> = {
  legal_compliance: [
    [/\bdpa\b|sub-?processor|data processing agreement|\bgdpr\b/i, 5],
    [/\bcounsel\b|security review|data residency|transfer mechanism/i, 3],
  ],
  sales_negotiation: [
    [/discount|competitor|competitive quote|procurement/i, 5],
    [/pricing|on price|renewal number|quote/i, 3],
  ],
  // Weighted above the others on purpose: "when will you ship X" is a roadmap
  // question first and a question about X second, however technical X sounds.
  product_question: [
    [/roadmap|which quarter|when will you|release date|steering committee/i, 6],
    [/dates please|lands? in|native .* channel|two-way/i, 2],
  ],
  ai_agent_config: [
    [/ai agent|handoff|hands? off|handed off|threshold/i, 5],
    [/\bbot\b|confidence/i, 2],
  ],
  api_limits: [
    [/\b429\b|rate limit|throttl/i, 5],
    [/api key|bulk|import|requests? per/i, 2],
  ],
  integration_issue: [
    [/zendesk|intercom|webhook|salesforce/i, 4],
    [/integration|sync|401|403|endpoint|delivery|deliveries/i, 3],
  ],
  account_access: [
    [/seat|invite|teammate|new starter|provision|offboard/i, 5],
    [/\bsso\b|okta|saml|log ?in|identity provider|leaver/i, 3],
  ],
  // "billing" and "plan" are weak signals: almost every ticket mentions them in
  // passing. Only actual money movement scores highly.
  billing_refund: [
    [/refund|invoice|invoiced|charged|credit/i, 4],
    [/plan|subscription|card|renewal|billing/i, 2],
  ],
  other: [],
};

export function classifyIntent(text: string): Intent {
  let best: Intent = "other";
  let bestScore = 0;

  for (const intent of INTENTS) {
    let score = 0;
    for (const [re, weight] of INTENT_KEYWORDS[intent]) {
      if (re.test(text)) score += weight;
    }
    if (score > bestScore) {
      best = intent;
      bestScore = score;
    }
  }

  return best;
}
