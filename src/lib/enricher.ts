/**
 * Listing Description Enricher
 *
 * After a CSV import we have URLs but no description text.
 * This module fetches each Redfin listing page, extracts the
 * public remarks / listing description, then re-scores the
 * match against the full keyword list and updates the record.
 */

import { getAllMatches, updateMatch, MatchRecord } from "./db";
import { scoreDescription } from "./scorer";

// ── HTML scraper ─────────────────────────────────────────────────────────────

const FETCH_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
};

function stripTags(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export async function scrapeDescription(url: string): Promise<string> {
  try {
    const res = await fetch(url, { headers: FETCH_HEADERS });
    if (!res.ok) return "";
    const html = await res.text();

    // Strategy 1 — Redfin meta tags (most reliable for Redfin listings)
    const metaPatterns = [
      /<meta[^>]+name="twitter:text:description_simple"[^>]+content="([^"]{30,})"/i,
      /<meta[^>]+content="([^"]{30,})"[^>]+name="twitter:text:description_simple"/i,
      /<meta[^>]+name="description"[^>]+content="([^"]{30,})"/i,
      /<meta[^>]+content="([^"]{30,})"[^>]+name="description"/i,
      /<meta[^>]+property="og:description"[^>]+content="([^"]{30,})"/i,
      /<meta[^>]+content="([^"]{30,})"[^>]+property="og:description"/i,
    ];
    for (const pattern of metaPatterns) {
      const m = html.match(pattern);
      if (m && m[1]) {
        const text = m[1]
          .replace(/&amp;/g, "&")
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .trim();
        if (text.length > 30) return text;
      }
    }

    // Strategy 2 — JSON embedded in script tags (publicRemarks / agentRemarks)
    const remarksPatterns = [
      /"publicRemarks"\s*:\s*"((?:[^"\\]|\\.)*)"/,
      /"agentRemarks"\s*:\s*"((?:[^"\\]|\\.)*)"/,
      /"listingRemarks"\s*:\s*"((?:[^"\\]|\\.)*)"/,
      /"description"\s*:\s*"((?:[^"\\]|\\.){40,})"/,
    ];
    for (const pattern of remarksPatterns) {
      const m = html.match(pattern);
      if (m && m[1]) {
        return m[1]
          .replace(/\\n/g, " ")
          .replace(/\\t/g, " ")
          .replace(/\\"/g, '"')
          .replace(/\\\//g, "/")
          .trim();
      }
    }

    // Strategy 3 — HTML element with class containing "remarks"
    const remarksElem = html.match(
      /<(?:div|p|span)[^>]*class="[^"]*(?:remarks|listing-remarks|property-description)[^"]*"[^>]*>([\s\S]*?)<\/(?:div|p|span)>/i
    );
    if (remarksElem && remarksElem[1]) {
      const text = stripTags(remarksElem[1]);
      if (text.length > 30) return text;
    }

    // Strategy 4 — JSON-LD
    const ldMatch = html.match(
      /<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/i
    );
    if (ldMatch && ldMatch[1]) {
      try {
        const data = JSON.parse(ldMatch[1]);
        const desc =
          data?.description ||
          data?.["@graph"]?.find?.((n: any) => n.description)?.description;
        if (desc && desc.length > 30) return desc;
      } catch {
        // malformed JSON-LD — ignore
      }
    }

    return "";
  } catch {
    return "";
  }
}

// ── Enrichment runner ─────────────────────────────────────────────────────────

const DELAY_MS = 1500; // be polite to Redfin — 1.5s between requests

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Summary builder ───────────────────────────────────────────────────────────

function buildSummary(
  score: "HIGH" | "MEDIUM" | "LOW",
  structuralSignals: string[],
  descriptionKeywords: string[]
): string {
  const parts: string[] = [];

  // Lead with score tier
  if (score === "HIGH") parts.push("🔴 Strong RAL candidate.");
  else if (score === "MEDIUM") parts.push("🟡 Viable RAL candidate.");
  else parts.push("🟢 Worth a closer look.");

  // Physical profile (structural)
  if (structuralSignals.length > 0) {
    parts.push(`Physical profile: ${structuralSignals.join("; ")}.`);
  }

  // Listing signals — the good stuff
  if (descriptionKeywords.length > 0) {
    const highlights = descriptionKeywords.join(", ");
    parts.push(`Listing highlights: ${highlights}.`);
  } else {
    parts.push("No additional RAL signals found in the listing description.");
  }

  return parts.join(" ");
}

/**
 * Enrich all matches that are still in "pending" status.
 * Runs in the background — safe to fire-and-forget.
 */
export async function enrichPendingMatches(): Promise<void> {
  const pending = (await getAllMatches(undefined, undefined, 500)).filter(
    (m) => m.enrich_status === "pending" && m.listing_url
  );

  for (const match of pending) {
    if (!match.id) continue;

    try {
      const description = await scrapeDescription(match.listing_url);

      if (!description) {
        await updateMatch(match.id, { enrich_status: "failed" });
        await sleep(DELAY_MS);
        continue;
      }

      // Score against full keyword list now that we have real description text
      const { score: textScore, matchedKeywords: textKeywords } =
        scoreDescription(description);

      // Upgrade score only (never downgrade structural HIGH)
      const scoreRank = { HIGH: 3, MEDIUM: 2, LOW: 1 };
      const currentRank = scoreRank[match.score] ?? 0;
      const textRank = textScore ? scoreRank[textScore] ?? 0 : 0;
      const finalScore =
        textRank > currentRank ? (textScore as MatchRecord["score"]) : match.score;

      // Build an updated summary that explains BOTH why it scored and what was found
      const structuralSignals: string[] = JSON.parse(match.matched_keywords || "[]");
      const updatedSummary = buildSummary(finalScore, structuralSignals, textKeywords);

      await updateMatch(match.id, {
        description_text: description,
        description_keywords: JSON.stringify(textKeywords),
        score: finalScore,
        ai_summary: updatedSummary,
        enrich_status: "done",
      });
    } catch {
      await updateMatch(match.id, { enrich_status: "failed" });
    }

    await sleep(DELAY_MS);
  }
}
