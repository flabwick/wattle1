import { tavily } from "@tavily/core";
import type { WebExtractResponse, WebSearchResponse } from "@wattle/shared";

/**
 * The "search" CardType's web mode (registries/definitions/searchCardType.ts) —
 * backed by Tavily (https://tavily.com), a search API built for LLM/agent use.
 * `TAVILY_API_KEY` (see .env.example) is the only thing that switches this from
 * "not configured" to live: unset, `searchWeb` reports `configured: false` with no
 * results, which is what lets the UI show a plain "not set up yet" notice instead of
 * a failed-request state — see SearchCardBody.tsx.
 */

let cachedClient: ReturnType<typeof tavily> | null | undefined;

/** Built once and memoized, same "read the env once, not per request" convention
 *  providers/init.ts's own activeProviderId() uses — `undefined` means "not checked
 *  yet", `null` means "checked, no key set". */
function getClient(): ReturnType<typeof tavily> | null {
  if (cachedClient !== undefined) return cachedClient;
  const apiKey = process.env.TAVILY_API_KEY;
  cachedClient = apiKey ? tavily({ apiKey }) : null;
  return cachedClient;
}

export async function searchWeb(query: string): Promise<WebSearchResponse> {
  const client = getClient();
  if (!client) {
    return { configured: false, results: [] };
  }
  if (query.trim() === "") {
    return { configured: true, results: [] };
  }

  try {
    const response = await client.search(query, { maxResults: 8 });
    return {
      configured: true,
      results: response.results.map((r) => ({ title: r.title, url: r.url, snippet: r.content })),
    };
  } catch (err) {
    // Best-effort, same "never let a downstream failure break the request" precedent
    // generationService.ts's buildNearbyAppendix uses — a Tavily outage/rate-limit
    // shows as "no results" rather than a 500.
    console.error("[webSearchService] Tavily search failed:", err);
    return { configured: true, results: [] };
  }
}

/** The "export selected results as a Card" flow (SearchCardBody.tsx) — full,
 *  boilerplate-stripped page text for up to 20 URLs at once (Tavily's own /extract
 *  cap), returned as markdown. Unlike `searchWeb`'s `content` snippet (picked for
 *  relevance, a paragraph or so), this is the actual page. Never throws for an
 *  individual bad URL — Tavily itself separates per-URL failures into its own
 *  `failedResults` array, which this just passes through as `failed`, so one dead
 *  link in a multi-select doesn't lose the others. */
export async function extractPages(urls: string[]): Promise<WebExtractResponse> {
  const client = getClient();
  if (!client || urls.length === 0) {
    return { configured: !!client, results: [], failed: [] };
  }

  try {
    const response = await client.extract(urls, { format: "markdown" });
    return {
      configured: true,
      results: response.results.map((r) => ({ url: r.url, title: r.title, content: r.rawContent })),
      failed: response.failedResults.map((f) => ({ url: f.url, error: f.error })),
    };
  } catch (err) {
    console.error("[webSearchService] Tavily extract failed:", err);
    return {
      configured: true,
      results: [],
      failed: urls.map((url) => ({ url, error: "Extraction request failed" })),
    };
  }
}
