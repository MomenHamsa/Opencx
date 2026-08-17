import { tokenize } from "@/lib/retrieval/tokenize";

/**
 * Build a reply out of sentences taken verbatim from an article.
 *
 * Verbatim is the point. A grounded reply is one whose claims exist in the source,
 * and the cheapest way for a simulator to be genuinely grounded is to quote rather
 * than paraphrase. It reads a little stiff — that is a real property of the mock,
 * not something to hide, and it is why the `grounded` check needs a real judge to
 * be interesting.
 */
export function extractRelevantSentences(body: string, query: string, max: number): string[] {
  const queryTerms = new Set(tokenize(query));

  const sentences = body
    .split(/\n+/)
    .flatMap((paragraph) => paragraph.split(/(?<=[.!?])\s+/))
    .map(cleanMarkdown)
    .filter((s) => s.length >= 40);

  const scored = sentences.map((sentence, index) => {
    const terms = new Set(tokenize(sentence));
    let hits = 0;
    for (const term of terms) if (queryTerms.has(term)) hits += 1;
    return { sentence, index, hits };
  });

  return scored
    .filter((s) => s.hits > 0)
    .sort((a, b) => b.hits - a.hits || a.index - b.index)
    .slice(0, max)
    // Back into document order, so the answer still reads as prose.
    .sort((a, b) => a.index - b.index)
    .map((s) => s.sentence);
}

function cleanMarkdown(text: string): string {
  return text.replace(/\*\*/g, "").trim();
}
