import { ARTICLES } from "@/lib/kb/articles";
import { tokenize } from "@/lib/retrieval/tokenize";
import type { Article, RetrievedArticle, Retriever } from "@/lib/types";

/**
 * BM25 over 8 articles, with field weighting.
 *
 * Why BM25 rather than "count the matching words":
 *  - IDF, so a ticket that says "integration" 6 times cannot drown out the one
 *    article containing "429".
 *  - Term-frequency saturation, so the 5th occurrence of a word adds almost nothing.
 *    Without it, the longest article wins every query.
 *  - Length normalisation, same reason.
 *
 * Why field weighting: a title and a tag list were written by a human to describe
 * the article. A sentence in the body was not. Weighting them is the cheapest
 * available substitute for semantic understanding.
 *
 * What it cannot do: match "identity provider" to an article about Okta. That is a
 * vocabulary mismatch, and it is exactly the failure the eval harness labels as
 * `retrieval` rather than blaming the prompt for it. Swapping this file for an
 * embedding retriever is the intended next change; the interface is the seam.
 */

const K1 = 1.5; // term-frequency saturation point
const B = 0.75; // how strongly to normalise for document length
const TITLE_WEIGHT = 3;
const TAG_WEIGHT = 2;

/**
 * Below this, drop the result instead of returning it.
 *
 * Measured, not guessed. Across the golden set, an article that genuinely answers
 * the ticket scores 13-30; an article matching on incidental words scores 2-10.
 * Those ranges overlap, which is worth knowing rather than hiding, so the floor is
 * set low: it removes only the clearly-incidental tail and leaves the marginal cases
 * for the agent's confidence score to deal with.
 *
 * It matters because handing the model a barely-related article is worse than
 * handing it nothing. Given an article, a model will use it, and then cite it.
 *
 * The number is corpus-specific. BM25 scores are not comparable across corpora, so
 * a real deployment would set this from a score distribution, not from a constant.
 */
const MIN_RELEVANCE = 5;

interface IndexedDoc {
  article: Article;
  /** term -> weighted frequency */
  termFreq: Map<string, number>;
  length: number;
}

interface Index {
  docs: IndexedDoc[];
  /** term -> number of documents containing it */
  docFreq: Map<string, number>;
  avgDocLength: number;
}

function indexArticle(article: Article): IndexedDoc {
  const termFreq = new Map<string, number>();
  const add = (text: string, weight: number): void => {
    for (const term of tokenize(text)) {
      termFreq.set(term, (termFreq.get(term) ?? 0) + weight);
    }
  };

  add(article.title, TITLE_WEIGHT);
  add(article.tags.join(" "), TAG_WEIGHT);
  add(article.body, 1);

  let length = 0;
  for (const freq of termFreq.values()) length += freq;

  return { article, termFreq, length };
}

function buildIndex(articles: Article[]): Index {
  const docs = articles.map(indexArticle);
  const docFreq = new Map<string, number>();

  for (const doc of docs) {
    for (const term of doc.termFreq.keys()) {
      docFreq.set(term, (docFreq.get(term) ?? 0) + 1);
    }
  }

  const totalLength = docs.reduce((sum, d) => sum + d.length, 0);
  const avgDocLength = docs.length === 0 ? 0 : totalLength / docs.length;

  return { docs, docFreq, avgDocLength };
}

/** Standard BM25 IDF. The +0.5s stop a term present in every document scoring negative. */
function idf(index: Index, term: string): number {
  const df = index.docFreq.get(term) ?? 0;
  const n = index.docs.length;
  return Math.log(1 + (n - df + 0.5) / (df + 0.5));
}

function scoreDoc(index: Index, doc: IndexedDoc, queryTerms: string[]): {
  score: number;
  matchedTerms: string[];
} {
  let score = 0;
  const matchedTerms: string[] = [];

  // Deduplicated: a term repeated in the query should not be counted twice.
  for (const term of new Set(queryTerms)) {
    const tf = doc.termFreq.get(term);
    if (tf === undefined) continue;

    matchedTerms.push(term);
    const norm = 1 - B + B * (doc.length / (index.avgDocLength || 1));
    score += idf(index, term) * ((tf * (K1 + 1)) / (tf + K1 * norm));
  }

  return { score, matchedTerms };
}

export function createKeywordRetriever(articles: Article[] = ARTICLES): Retriever {
  // Built once at construction. 8 articles, so this is microseconds; a real corpus
  // would build this offline, which is another reason `search` is async.
  const index = buildIndex(articles);

  return {
    name: "keyword-bm25",
    async search(query: string, k: number): Promise<RetrievedArticle[]> {
      const queryTerms = tokenize(query);

      return index.docs
        .map((doc) => {
          const { score, matchedTerms } = scoreDoc(index, doc, queryTerms);
          return { article: doc.article, score: round(score), matchedTerms };
        })
        .filter((r) => r.score >= MIN_RELEVANCE)
        .sort((a, b) => b.score - a.score)
        .slice(0, k);
    },
  };
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}
