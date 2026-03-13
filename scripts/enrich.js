#!/usr/bin/env node
/**
 * RAL Scout — Local Enrichment Runner
 *
 * Fetches individual Redfin listing pages, extracts description text,
 * scores for RAL keywords, and updates Turso directly.
 *
 * Usage:
 *   node scripts/enrich.js           # process all unenriched (default)
 *   node scripts/enrich.js --limit 10  # process up to N listings
 *   node scripts/enrich.js --retry     # re-process failed listings too
 */

// Load .env.local manually (no dotenv dependency)
const fs = require("fs");
const envPath = require("path").join(__dirname, "../.env.local");
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, "utf8").split("\n").forEach((line) => {
    const m = line.match(/^([^#=\s]+)\s*=\s*(.*)$/);
    if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  });
}

const { createClient } = require("@libsql/client");

const DELAY_MS = 1500;
const FETCH_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
};

// ── RAL keywords — loaded from DB, fallback to defaults ─────────────────────

const PRIMARY_KEYWORDS_DEFAULT = [
  "assisted living", "memory care", "group home", "residential care",
  "board and care", "adult care", "senior care", "elder care",
  "care facility", "care home", "ral",
];

async function loadKeywords(db) {
  try {
    const r = await db.execute("SELECT value FROM settings WHERE key = 'keywords'");
    if (r.rows.length > 0 && r.rows[0].value) {
      const list = String(r.rows[0].value).split("\n").map((k) => k.trim().toLowerCase()).filter(Boolean);
      if (list.length > 0) {
        console.log(`  Loaded ${list.length} keywords from DB settings`);
        return list;
      }
    }
  } catch { /* fall through */ }
  console.log(`  Using ${PRIMARY_KEYWORDS_DEFAULT.length} default keywords`);
  return PRIMARY_KEYWORDS_DEFAULT;
}

function scoreDescription(text, keywords) {
  if (!text) return { score: null, matchedKeywords: [] };
  const lower = text.toLowerCase();
  const matched = keywords.filter((kw) => lower.includes(kw));
  const hasPrimary = matched.some((kw) => PRIMARY_KEYWORDS_DEFAULT.includes(kw));
  const score = hasPrimary ? "HIGH" : matched.length >= 2 ? "MEDIUM" : matched.length === 1 ? "LOW" : null;
  return { score, matchedKeywords: [...new Set(matched)] };
}

// ── HTML scraper ─────────────────────────────────────────────────────────────

async function scrapeDescription(url) {
  try {
    const res = await fetch(url, { headers: FETCH_HEADERS });
    if (!res.ok) return "";
    const html = await res.text();

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
      if (m?.[1]) {
        const text = m[1]
          .replace(/&amp;/g, "&").replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
          .trim();
        if (text.length > 30) return text;
      }
    }

    const remarksPatterns = [
      /"publicRemarks"\s*:\s*"((?:[^"\\]|\\.)*)"/,
      /"agentRemarks"\s*:\s*"((?:[^"\\]|\\.)*)"/,
      /"listingRemarks"\s*:\s*"((?:[^"\\]|\\.)*)"/,
    ];
    for (const pattern of remarksPatterns) {
      const m = html.match(pattern);
      if (m?.[1]) {
        return m[1].replace(/\\n/g, " ").replace(/\\t/g, " ").replace(/\\"/g, '"').trim();
      }
    }

    return "";
  } catch {
    return "";
  }
}

// ── Summary builder ───────────────────────────────────────────────────────────

function buildSummary(score, structuralSignals, descriptionKeywords) {
  const parts = [];
  if (score === "HIGH") parts.push("🔴 Strong RAL candidate.");
  else if (score === "MEDIUM") parts.push("🟡 Viable RAL candidate.");
  else parts.push("🟢 Worth a closer look.");
  if (structuralSignals.length > 0) parts.push(`Physical profile: ${structuralSignals.join("; ")}.`);
  if (descriptionKeywords.length > 0) parts.push(`Listing highlights: ${descriptionKeywords.join(", ")}.`);
  else parts.push("No additional RAL signals found in the listing description.");
  return parts.join(" ");
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const limitIdx = args.indexOf("--limit");
  const limit = limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) : Infinity;
  const retryFailed = args.includes("--retry");

  const db = createClient({
    url: process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN,
  });

  const statusFilter = retryFailed
    ? "enrich_status IN ('', 'failed')"
    : "enrich_status = ''";

  const result = await db.execute(
    `SELECT id, address, city, score, matched_keywords, listing_url
     FROM matches
     WHERE ${statusFilter} AND listing_url IS NOT NULL AND listing_url != ''
     ORDER BY score DESC, id ASC
     LIMIT ${isFinite(limit) ? limit : 9999}`
  );

  const keywords = await loadKeywords(db);
  const rows = result.rows;
  console.log(`\nRAL Scout Enricher — ${rows.length} listing(s) to process\n`);

  if (rows.length === 0) {
    console.log("Nothing to enrich. Run with --retry to re-process failed listings.");
    return;
  }

  let enriched = 0, upgraded = 0, noDesc = 0;

  for (let i = 0; i < rows.length; i++) {
    const match = rows[i];
    const progress = `[${i + 1}/${rows.length}]`;

    process.stdout.write(`${progress} ${match.address}, ${match.city} … `);

    const description = await scrapeDescription(match.listing_url);

    if (!description) {
      await db.execute({
        sql: "UPDATE matches SET enrich_status = 'failed' WHERE id = ?",
        args: [match.id],
      });
      console.log("no description found");
      noDesc++;
    } else {
      const { score: textScore, matchedKeywords } = scoreDescription(description, keywords);

      const scoreRank = { HIGH: 3, MEDIUM: 2, LOW: 1 };
      const currentRank = scoreRank[match.score] ?? 0;
      const textRank = textScore ? scoreRank[textScore] ?? 0 : 0;
      const finalScore = textRank > currentRank ? textScore : match.score;
      const wasUpgraded = finalScore !== match.score;

      const structuralSignals = JSON.parse(match.matched_keywords || "[]");
      const summary = buildSummary(finalScore, structuralSignals, matchedKeywords);

      await db.execute({
        sql: `UPDATE matches SET
                description_text = ?,
                description_keywords = ?,
                score = ?,
                ai_summary = ?,
                enrich_status = 'done'
              WHERE id = ?`,
        args: [
          description,
          JSON.stringify(matchedKeywords),
          finalScore,
          summary,
          match.id,
        ],
      });

      const signals = matchedKeywords.length > 0
        ? `✦ ${matchedKeywords.join(", ")}`
        : "no RAL signals";
      const upgrade = wasUpgraded ? ` ↑ ${match.score}→${finalScore}` : "";
      console.log(`${signals}${upgrade}`);

      enriched++;
      if (wasUpgraded) upgraded++;
    }

    if (i < rows.length - 1) await new Promise((r) => setTimeout(r, DELAY_MS));
  }

  console.log(`\n── Summary ─────────────────────`);
  console.log(`  Processed : ${rows.length}`);
  console.log(`  Enriched  : ${enriched}`);
  console.log(`  Upgraded  : ${upgraded} score upgrades`);
  console.log(`  No desc   : ${noDesc}`);
  console.log(`────────────────────────────────\n`);
}

main().catch((err) => {
  console.error("FATAL:", err.message);
  process.exit(1);
});
