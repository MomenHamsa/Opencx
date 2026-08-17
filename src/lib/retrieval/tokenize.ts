/**
 * Tokenisation for the keyword retriever.
 *
 * No stemmer library. A real search stack would use one (or embeddings, which is
 * the point of the Retriever interface), but a dependency I cannot explain line by
 * line is worse here than a crude function I can. This trims plurals and stops
 * there, and the trace shows exactly which terms matched so the crudeness is visible
 * rather than hidden.
 */

/**
 * Function words and conversational filler, removed because BM25 gives *rare* terms
 * the highest weight — and in an 8-article corpus, filler is rare. Before this list
 * was extended, ticket T-005 retrieved the Zendesk article as its top hit on the
 * strength of "need every look like not". That is the failure mode: a word nobody
 * chose as a keyword decides the ranking.
 *
 * Words deliberately kept because they carry real signal in a support corpus:
 * "down", "off" (handoff), "new", "log", "send", "admin", "agent", "seat", "user",
 * "day", and every digit — "429", "401", "403" and "14" are the sharpest terms here.
 */
const STOPWORDS = new Set([
  // grammar
  "a", "an", "and", "are", "as", "at", "be", "been", "being", "but", "by", "can",
  "cannot", "could", "did", "do", "does", "doing", "done", "for", "from", "had",
  "has", "have", "having", "he", "her", "him", "his", "how", "i", "if", "in", "into",
  "is", "it", "its", "may", "me", "might", "must", "my", "of", "on", "or", "other",
  "our", "out", "over", "own", "she", "should", "since", "so", "such", "than",
  "that", "the", "their", "them", "then", "there", "these", "they", "this", "those",
  "through", "to", "under", "until", "up", "us", "was", "we", "were", "what", "when",
  "where", "which", "while", "who", "why", "will", "with", "within", "without",
  "would", "you", "your",
  // quantifiers and vague determiners
  "about", "after", "again", "all", "already", "also", "always", "another", "any",
  "anyone", "anything", "around", "because", "before", "best", "better", "between",
  "both", "each", "even", "ever", "every", "everything", "few", "first", "here",
  "however", "last", "many", "more", "most", "much", "next", "no", "none", "not",
  "now", "often", "once", "only", "same", "some", "someone", "something", "soon",
  "still", "too", "very", "yet",
  // spelled-out small numbers carry no signal; the digits do
  "one", "two", "three", "four", "five", "six", "ten", "fourteen",
  // generic verbs and support-ticket filler
  "back", "come", "get", "getting", "give", "go", "going", "gone", "good", "got",
  "happy", "just", "keep", "know", "let", "like", "look", "looking", "made", "make",
  "mean", "need", "please", "put", "rather", "really", "right", "say", "see", "seem",
  "sorry", "sure", "take", "tell", "thank", "thanks", "thing", "things", "think",
  "time", "told", "took", "use", "used", "using", "want", "wanted", "way", "well",
  "went", "work", "working", "yes",
]);

/** "tokens" -> "token", but not "access" -> "acces". */
function trimPlural(word: string): string {
  if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss")) {
    return word.slice(0, -1);
  }
  return word;
}

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    // Keep digits: "429", "401" and "403" are the highest-signal terms in this corpus.
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((w) => w.length > 1 && !STOPWORDS.has(w))
    .map(trimPlural);
}
