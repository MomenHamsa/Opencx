# Codebase tour

Every file, what it does, why it exists, and **the one thing in it worth being able to
defend**. Written for someone reading this codebase for the first time.

About 4,200 lines across 37 files. Read them in the order below and each one only
depends on things you have already seen.

---

## The shape of it

```
src/lib/          the whole system. No React, no framework, plain Node + TypeScript
  types.ts          every shared type
  config.ts         the knobs
  kb/               8 help-centre articles
  golden/           14 exam tickets and what each expects
  retrieval/        BM25 keyword search
  tools/            account lookups (fake backends)
  prompt/           the two system prompts + the user-turn format
  llm/              the LLM provider interface, and the mock
  agent/            the loop: retrieve → tools → model → distrust → trace
  trace/            trace persistence
  eval/             the exam: checks, judge, runner, baseline diff
src/app/          Next.js routes and pages
src/components/   the UI
scripts/          one runnable check per milestone
```

The important property: **`src/lib` knows nothing about React or Next.js.** You can
delete `src/app` and `src/components` and everything still runs from `scripts/`. The UI
is a viewer, not the system.

---

## Layer 1 — the nouns

### `src/lib/types.ts`
Every shared type: `Article`, `Ticket`, `AgentOutput`, `Trace`, `GoldenCase`,
`CheckResult`, `EvalRun`. Also the three swappable interfaces — `Retriever`,
`LLMProvider`, `Tool` — each with a one-line comment saying the customer-facing reason
it is an interface.

**Defend:** *why is `Intent` a closed union and not a string?* Because an open-ended
string intent cannot be graded deterministically, and the moment you cannot grade it,
"misclassification" stops being a measurable failure and becomes a matter of opinion.

### `src/lib/config.ts`
`TOP_K = 3`, `HANDOFF_CONFIDENCE = 0.6`, `WEAK_RETRIEVAL_SCORE = 6`, and the data paths.

**Defend:** *why is 0.6 that number?* It is the same default the AI-agent-handoff
article documents to customers. Shipping an agent that ignores our own published
default would be a bad look. And note what is deliberately *not* in this file:
`MIN_RELEVANCE` lives in the retriever, because a BM25 score threshold is meaningless
to any other implementation of `Retriever`.

---

## Layer 2 — the data

### `src/lib/kb/articles.ts`
Eight help-centre articles: connecting Zendesk, why Intercom sync stops, API rate
limits, the refund policy, seat management, AI agent handoff thresholds, Okta SSO,
webhook retries. Written with the operational details a real KB has — the non-admin
token trap, the 401 in the integration log, the 14-day window, SCIM not being supported
yet.

**Defend:** *why the deliberate gaps?* There is nothing here about DPAs,
sub-processors, discounts or the roadmap. That is not laziness — the escalation half of
the exam only means something if the knowledge base genuinely cannot answer those
questions. An agent that escalates because it has no article is behaving correctly; an
agent that escalates because I told it to escalate that exact ticket proves nothing.

### `src/lib/golden/cases.ts`
The exam. Fourteen tickets: eight answerable from the KB, five that must escalate, one
prompt injection. Each carries an `expect` block and a `note` explaining why the case
exists.

**Defend:** *why is `intent` missing from some expectations?* Because some tickets are
genuinely two things at once. T-005 is a billing complaint whose cause is a
provisioning problem; both labels are defensible. Grading it would be measuring my
opinion rather than the agent, and a score with opinion baked into it gets ignored.
Read T-005's note — it is the ticket the whole `retrieval_hit` check exists for.

---

## Layer 3 — retrieval

### `src/lib/retrieval/tokenize.ts`
Lowercase, strip punctuation, drop stopwords, trim plurals. No stemmer library.

**Defend:** *why is the stopword list ~180 words rather than the usual 70?* Because
BM25 weights *rare* terms highest, and in an eight-article corpus, filler is rare. With
the short list, ticket T-005 retrieved the Zendesk article as its top hit on the
strength of `need every look like not`. A word nobody chose as a keyword was deciding
the ranking. Words that carry real signal here are deliberately kept: `down`, `off`
(handoff), `log`, `admin`, `seat`, and every digit — `429`, `401`, `403` and `14` are
the sharpest terms in this corpus.

### `src/lib/retrieval/keyword.ts`
BM25 with field weighting (title ×3, tags ×2, body ×1) and a relevance floor.

**Defend:** *why BM25 rather than counting matching words?* Three reasons, all
observable in the output. IDF, so a ticket that says "integration" six times cannot
drown out the one article containing "429". Term-frequency saturation, so the fifth
occurrence of a word adds almost nothing — without it the longest article wins every
query. Length normalisation, same reason. Field weighting is the cheapest available
substitute for semantic understanding: a title and a tag list were written by a human
to describe the article; a sentence in the body was not.

Also defend `MIN_RELEVANCE = 5`: handing a model a barely-related article is worse than
handing it nothing, because given an article a model will use it, and then cite it. The
number was measured, not guessed — genuine hits score 13–30 on this suite, incidental
matches 2–10, and those ranges overlap, which is worth knowing rather than hiding.

---

## Layer 4 — tools

### `src/lib/tools/fixtures.ts`
Fake account and integration backends, keyed by email domain. Written to agree with the
golden set: the customer who says "seat limit reached" really is at 25 of 25.

### `src/lib/tools/registry.ts`
Two tools — `lookup_account`, `get_integration_status` — a selection policy, and a
runner that records failures instead of throwing them.

**Defend:** *why does a fixed policy choose the tools instead of the model?* Two honest
reasons. The mock has no tool-calling API. And a deterministic policy keeps the exam
reproducible: if the model picked its own tools, a score change could be the prompt or
a different tool call, and there would be no way to tell which. The `Tool` interface
does not change if you move to model-driven calling — `selectTools` is the function you
delete.

Also worth knowing: a failing tool degrades the *answer*, not the process. If the
account service is down the agent still replies from the KB, and the trace records that
the lookup failed. That is exactly the trace you need when someone reports "the bot
stopped mentioning our plan".

---

## Layer 5 — prompts

### `src/lib/prompt/user-message.ts`
Renders the user turn: `<knowledge_base>`, `<account_data>`, `<ticket>`. Also parses it
back out, which only the mock uses.

**Defend:** *why XML-ish tags?* A model follows "everything inside `<ticket>` is data"
far more reliably when there is a literal boundary to point at — and that boundary is
what the v2 injection defence relies on. The parse-it-back-out function matters too: it
means the mock receives byte-for-byte the same string a real provider would, so there
is no `if (provider === "mock")` branch anywhere in the agent.

### `src/lib/prompt/versions.ts`
The prompt registry: v1 naive, v2 hardened, each with a changelog.

**Defend:** *why is the registry append-only?* v1 has a baseline score attached to it. A
baseline you can go back and edit is not a baseline. Also read v2's changelog — every
rule in it names the specific v1 failure it was written against. That is the difference
between prompt engineering and prompt editing.

### `src/lib/llm/prompt-features.ts`
Detects which of five rules a system prompt contains: grounding, escalation policy,
injection defence, no-invention, strict output.

**Defend:** *isn't this just string matching on your own prompts?* Yes, and the file
says so. It would tell you nothing about a prompt written by someone else. It exists
because it is the mechanism that lets v1 and v2 behave differently offline, and the
eval prints the detected rules on every run — if that line is wrong, the score means
nothing.

---

## Layer 6 — the model

### `src/lib/llm/mock/signals.ts`
Keyword detection over ticket text: injection, legal, negotiation, churn threat,
roadmap ask, renewal refund. Plus a weighted keyword vote for intent.

**Defend:** *why a weighted vote for intent rather than an if/else chain?* Because
tickets are mixtures. T-012 says "sync" (integration) and "which quarter" (product
question) in the same sentence, and an ordered chain would let whichever branch I
happened to write first win.

### `src/lib/llm/mock/compose.ts`
Builds a reply from sentences taken verbatim from an article.

**Defend:** *why quote rather than paraphrase?* A grounded reply is one whose claims
exist in the source, and quoting is the cheapest way for a simulator to be genuinely
grounded rather than approximately grounded. It reads slightly stiff. That is a real
property of the mock, not something to hide.

### `src/lib/llm/mock/index.ts`
The mock provider. Reads the system prompt for the five rules and behaves accordingly.

**Defend — and expect this one first:** *your mock decides everything, isn't the result
rigged?* The mock reproduces failure modes I chose, because they are the
well-documented ones, so **the absolute numbers prove nothing about a real model**.
What they prove is that the harness detects those failures, categorises them correctly,
and shows the delta between two prompts. The evidence it is not rigged is T-005 and
T-008: they fail on both versions and I left them failing.

### `src/lib/llm/factory.ts`
Maps the UI's provider selector onto a provider, and reports whether a key exists.

**Defend:** *why does `real` throw instead of falling back to the mock?* Because letting
someone believe they had just watched a real model run would be the worst possible
failure of this demo.

### `src/lib/llm/real.ts`
Claude, via the official Anthropic SDK. The only external service this project talks to.

**Defend three things here, because all three came from reading the current API docs
rather than from memory** — and each would have failed at runtime otherwise:

- ***Why is `temperature` not forwarded?*** Sampling parameters were removed on this
  model family; sending one returns a 400. The agent still sets `temperature: 0`
  because it belongs to the provider-neutral interface — dropping it is the adapter
  doing its job. Reproducibility comes from low effort and a tight prompt instead.
- ***Why is `max_tokens` 8000 when the reply is a paragraph?*** Thinking is on by
  default and counts against the same budget. A limit sized for the reply alone
  truncates the JSON mid-object.
- ***Why check `stop_reason` before reading content?*** A safety refusal arrives as a
  normal 200 with empty or partial content. Reading `content[0]` blindly turns that
  into a confusing crash instead of a clean degraded run.

Also defend the dependency: one SDK, for the one external service, because it owns
retries, typed errors and API versioning — the three things hardest to debug if you
hand-roll them at this boundary.

And the honest caveat, volunteered: **the error path is tested with an invalid key
(live call → 401 → safe degrade); a successful call has never been run.**

---

## Layer 7 — the agent

### `src/lib/agent/parse.ts`
Gets a JSON object out of whatever the model actually said. Three strategies: direct
parse, markdown fence, string-aware balanced-brace scan.

**Defend:** *why not `indexOf("{")` and `lastIndexOf("}")`?* Because it breaks the moment
a reply contains a brace or a quote — and support replies quote customers, who write
braces. The scanner tracks whether it is inside a JSON string and whether the previous
character was an escape. That is the difference between a parser and a heuristic.

### `src/lib/agent/validate.ts`
Hand-written schema validation, plus `checkCitationsAreReal`.

**Defend:** *why not zod?* This is seventy lines, it is the boundary between a language
model and a customer, and it is the code I most need to explain without saying "the
library does that". Swapping it for zod is a one-file change — the return type is what
the rest of the code depends on, not the mechanism.

Two more decisions here. Errors are *collected*, not thrown on the first miss: a trace
saying "intent invalid, confidence out of range, citations not an array" is debuggable;
one saying "intent invalid" is a guessing game. And confidence is **not clamped** — a
model returning `85` instead of `0.85` has misunderstood the scale, and silently
rescaling it hides that from every downstream decision.

### `src/lib/agent/run.ts`
The loop. Retrieve → tools → model → distrust in three stages → build trace → save.

**Defend:** *why is persistence inside `runAgent` rather than in the callers?* So that
"every run leaves a receipt" is enforced in one place instead of being a convention
three call sites have to remember.

And the one to be really solid on: *why does a fabricated citation degrade the run
rather than just being stripped?* Because stripping it keeps the sentence. The model
wrote "See our article on SLA credits" and cited `kb-sla-credits`; removing the citation
leaves a confident claim about a policy that does not exist, now with nothing attached
to make it checkable. The citation is the evidence the claim was grounded. Losing it
makes the reply *less* trustworthy, not more.

### `src/lib/trace/store.ts`
One pretty-printed JSON file per trace. Server-side only.

**Defend:** *why files and not a database?* The value of a trace is that a human can
open it — `cat` and `jq` beat a query when the question is "what did the agent see at
09:14". At real volume this becomes object storage keyed by trace id, with the
indexable fields in a real table. The write path keeps the same shape.

Note the `SAFE_ID` regex: trace ids arrive from URL params, so they are validated as
filenames before touching disk.

---

## Layer 8 — the exam

### `src/lib/eval/judge.ts`
The `Judge` interface and the offline specificity judge.

**Defend:** *what exactly is this, and what does it miss?* It is a specificity check,
not a model. It extracts numeric specifics — figures, percentages, dates, money,
quarters — and asks whether each appears in the evidence the agent was shown. An
invented specific is the expensive kind of ungrounded claim: "refunds take 5 to 10
business days", "targeted for Q3", "a 20% discount" are the sentences a customer acts
on and holds you to.

What it misses: an ungrounded claim with no number in it. v1's reply to the lawyer —
"we are fully GDPR compliant, all sub-processors within the EEA" — is entirely invented
and this judge passes it. Volunteer that example. It is the best argument in the repo
for why grounding needs a real model judge.

### `src/lib/eval/checks.ts`
The seven checks, the pass rule, and the failure categoriser.

**Defend:** *why is `retrieval_hit` diagnostic-only?* Because it is not a statement
about the answer, it is a statement about why the answer was wrong. If it failed
tickets it would double-count T-005 — already failing on `action` and `citation` — and
add a row that is not a separate defect. Its job is routing the fix, and that is worth
more as a label than as a score.

Also defend the departure from the brief in `categorise()`. The brief defines the
retrieval category as "the expected article was not in the retrieved set". Building it
surfaced a second retrieval-caused failure: the article *was* retrieved, but so weakly
that confidence fell under the handoff threshold and the agent escalated work it should
have answered. Both are now `retrieval`. Calling the second one a prompt failure would
send someone to rewrite a prompt that is behaving correctly.

The fair challenge, and have the answer ready: *with the mock, confidence derives from
the BM25 score, so of course a retrieval fix moves it.* True — which is why the rule
requires **both** low confidence **and** a weak top score. The second condition is what
makes it a claim about the evidence rather than about the model's mood.

### `src/lib/eval/run.ts`
`evaluateStream` (async generator, one row at a time) and `runEvaluation`.

**Defend:** *where are the unit tests?* The eval suite is the test suite, and that is a
position rather than a corner cut. For an agent, the behaviour worth protecting is "does
it still escalate the DPA request", not "does `tokenize()` return an array".

### `src/lib/eval/diff.ts` and `src/lib/eval/store.ts`
The diff is a pure module; the store touches the filesystem.

**Defend:** *why is the baseline promoted by hand?* A baseline that moves on its own
cannot tell you anything — every run would compare clean and every regression would be
invisible. And promotion sends a run *id*, not a run object: the server reloads it from
disk, because the baseline is what every future score is judged against and it should
come from what actually ran.

---

## Layer 9 — the UI

### `src/app/api/eval/route.ts`
Runs the exam, streams NDJSON.

**Defend:** *why NDJSON rather than server-sent events?* One line, one JSON object,
parsed with `split("\n")`. No event framing to explain and no library to justify. Why
stream at all: the suite takes a second against the mock and would take minutes against
a real provider, and a demo where nothing moves for two minutes is a demo where someone
asks whether it has crashed.

### `src/app/page.tsx`, `src/components/eval/*`
Screen 1. `EvalScreen` holds the state and reads the stream; `ResultsTable` expands rows
in place; `DiffPanel` is the money shot.

**Defend:** *why do rows expand in place instead of linking somewhere?* The question
after "T-011 failed" is always "failed how". Making that a navigation step means it gets
skipped. The trace link is separate, for when the answer is "show me everything".

Worth mentioning as a bug you caught: changing the prompt dropdown after a run used to
leave the old rows on screen while the diff panel relabelled them with the new version
— a screenshot that says something false. Selectors now clear results. The type checker
cannot see a mislabelled number.

### `src/app/trace/[traceId]/page.tsx`
Screen 2. Server-rendered, **zero client JavaScript** — the one interactive element is a
native `<details>`.

**Defend:** *why join the trace against the golden set here?* Because the trace does not
know what was expected of it, and that join is what lets the page say "the article that
holds the answer never made it into the retrieved set". That banner is the single most
useful thing on the screen.

### `src/app/prompts/page.tsx` and `src/lib/eval/compare.ts`
Screen 3. The rules matrix, both changelogs, both system prompts, and the per-ticket
outcome table.

**Defend:** *why not a text diff?* v1 and v2 share almost no wording, so a line-level
diff renders as one deletion and one addition and tells you nothing. For a prose prompt
the reviewable unit is "which rules does it contain", which is what the matrix shows.

Also defend `runForVersion`: it reuses the most recent *mock* run for a version and only
runs the exam when there is none. Reusing keeps this screen and the eval screen from
disagreeing, and stops a page refresh from growing the trace directory. The
`provider === "mock"` condition is load-bearing — once a real provider exists, reusing
any saved run would put two different models side by side under a note claiming only
the prompt differs.

### `src/app/playground/page.tsx`, `src/components/playground/PlaygroundForm.tsx`, `src/app/api/playground/route.ts`
Screen 4. Paste a ticket, run it, land on its trace.

**Defend:** *why does it call `runAgent` directly rather than having its own path?* A
separate "quick run" path would eventually diverge from the harness, and then the
playground would be demonstrating something the exam never tested. Playground tickets
get a `PG-` id so no golden case matches them, and the trace page correctly shows no
expectations rather than inventing one.

### `src/components/ui/badges.tsx`
**Defend:** every badge carries its word, not just a colour. A red dot is unreadable on
a projector and unreadable to anyone who does not separate red from green.

---

## Layer 10 — the scripts

`scripts/m1-smoke.ts`, `m2-smoke.ts`, `m3-eval.ts` — one runnable check per milestone,
and the shape of how this wires into CI.

**Defend `m2-smoke.ts` specifically:** it fires ten kinds of hostile model output at the
agent. "Never crashes on model output" is a claim, and a claim nobody has tried to
falsify is just a comment.

---

## If you only remember four things

1. **The trace is the most valuable artifact here.** It answers "why did the agent say
   that" without reproducing the customer's environment.
2. **`retrieval_hit` is the cleverest part.** The harness does not just say a ticket
   failed — it says which layer owns the fix.
3. **Model output is untrusted input.** Parse defensively, validate, and degrade to a
   safe escalation. Verified against ten failure modes, not asserted.
4. **The two failing tickets are the honest part.** Both are retrieval, both are
   correctly diagnosed, and both were left in.

---

## Layer 11 — the workspace (added when this became a tool)

The three things a person configures used to be `const` arrays compiled into the
binary. They are now JSON on disk, and this layer is what made that safe.

### `src/lib/seed/*.ts`
The bundled sample knowledge base, tests and prompts. Not the live data any more —
the seed a fresh workspace is created from.

**Defend:** *why keep them in code at all?* So `rm -rf data/config` always returns a
working demo, and so a fresh clone runs without setup.

### `src/lib/workspace/store.ts`
Loads and persists the workspace, seeding from the samples when a file is missing.

**Defend:** *why files rather than a database?* Single user, a host with a real
filesystem, and a JSON file you can read, diff and hand-edit is worth more here than
query support nobody needs. Note the write path: temp file then rename, so a crash
mid-write cannot leave half a knowledge base behind. And note `data/config/` is
gitignored — real customer tickets must not reach a public repo via `git add -A`.

### `src/lib/workspace/validate.ts`
Validates authored content the same way `agent/validate.ts` validates model output.

**Defend:** *why validate a form as strictly as a model?* Because a test citing an
article id that does not exist can never pass, and would read as an agent bug forever.
Catching it at save time is the difference between a typo and a mystery.

### `src/lib/workspace/mutations.ts`
Every change a person can make, with the integrity rules.

**Defend — this is the interesting file.** Three rules, and the second is the one that
matters: you cannot delete an article a test cites; **a prompt that has been evaluated
is frozen**; nothing is written unless it validates. The frozen rule is not
bureaucracy — a score is attached to that exact wording, so letting it change
afterwards would make every historical run and every baseline a lie. It is the only
reason the baseline diff can be trusted.

---

## Layer 12 — the second and third providers

### `src/lib/llm/openai.ts`
Claude has `real.ts`; this is OpenAI. Same interface, and the contrast is the argument
for having one: **this adapter forwards `temperature`, the Anthropic one must strip it
or the request 400s.**

**Defend:** *why the retry loop?* Reasoning-family models rename `max_tokens` and
reject `temperature`, and which models those are is a moving target. The adapter
attempts the expected shape and retries once on a parameter complaint, so a wrong
guess costs one retry rather than failing an eval run.

### `src/lib/cost.ts`
One table of token prices, and the estimate built from it.

**Defend:** *why is the dollar figure labelled "est." everywhere?* Because token counts
come back from the provider and are exact, while prices are a local table that drifts.
Unknown models return null rather than a number I invented.

### `src/lib/eval/judge.ts` — the model judge
`createLLMJudge` grades grounding with a real model.

**Defend — the design decision here is the failure mode.** A judge that cannot reach a
verdict marks the check **skipped**, not failed. Counting a rate-limited judge as a
grounding failure would invent a regression; counting it as a pass would hide a real
one. "I could not check this" is the only honest third answer.

---

## Layer 13 — the UI system

### `src/app/globals.css`
The palette, with **one meaning per colour**: accent = do this / you are here, warn =
costs money or your prompt owns this, info = a different layer, pass and fail =
outcomes.

**Defend:** *why is the accent split into two tokens?* Because one colour cannot be
both a readable label on a dark surface and a button background that white text passes
AA against — the first wants brightness, the second wants darkness. Measured, not
guessed: white on the bright shade was 3.86:1 and failed.

### `src/components/nav/Nav.tsx`, `WorkspaceBar.tsx`
Navigation grouped as author → run → inspect, and a bar showing
`8 articles → 14 tests → 2 prompts`.

**Defend:** *why that order?* It is the dependency order — tests cite articles, so the
knowledge base has to exist first — and the arrows make it visible. A zero renders as
a call to action rather than a number.

### `src/middleware.ts`
HTTP Basic when `APP_PASSWORD` is set, open when it is not.

**Defend:** *why constant-time comparison for a one-user tool?* Because a plain `===`
returns as soon as two characters differ, which leaks the length of the correct prefix,
and avoiding that is about six lines.
