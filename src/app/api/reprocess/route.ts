import { NextResponse } from "next/server";
import { initDb, getSetting, getClient } from "@/lib/db";

export const dynamic = "force-dynamic";

const PRIMARY_KEYWORDS = [
  "assisted living", "memory care", "group home", "residential care",
  "board and care", "adult care", "senior care", "elder care",
  "care facility", "care home", "ral",
];

function parseKeywords(raw: string): string[] {
  return raw
    .split("\n")
    .map((k) => k.trim().toLowerCase())
    .filter(Boolean);
}

function scoreText(text: string, keywords: string[]): { score: "HIGH" | "MEDIUM" | "LOW" | null; matched: string[] } {
  const lower = text.toLowerCase();
  const matched = keywords.filter((kw) => lower.includes(kw));
  const hasPrimary = matched.some((kw) => PRIMARY_KEYWORDS.includes(kw));
  const score: "HIGH" | "MEDIUM" | "LOW" | null = hasPrimary
    ? "HIGH"
    : matched.length >= 2
    ? "MEDIUM"
    : matched.length === 1
    ? "LOW"
    : null;
  return { score, matched: [...new Set(matched)] };
}

function buildSummary(score: string, structural: string[], descKws: string[]): string {
  const parts: string[] = [];
  if (score === "HIGH") parts.push("🔴 Strong RAL candidate.");
  else if (score === "MEDIUM") parts.push("🟡 Viable RAL candidate.");
  else parts.push("🟢 Worth a closer look.");
  if (structural.length > 0) parts.push(`Physical profile: ${structural.join("; ")}.`);
  if (descKws.length > 0) parts.push(`Listing highlights: ${descKws.join(", ")}.`);
  else parts.push("No additional RAL signals found in the listing description.");
  return parts.join(" ");
}

export async function POST() {
  await initDb();
  const db = getClient();

  // Load current keywords from settings (fall back to PRIMARY list if none saved)
  const stored = await getSetting("keywords");
  const keywords = stored ? parseKeywords(stored) : PRIMARY_KEYWORDS;

  // Fetch all matches that have a stored description
  const result = await db.execute(
    `SELECT id, score, matched_keywords, description_text FROM matches WHERE description_text IS NOT NULL AND description_text != ''`
  );

  if (result.rows.length === 0) {
    return NextResponse.json({ message: "No enriched listings to reprocess", updated: 0 });
  }

  let updated = 0;
  let upgraded = 0;
  let signalsFound = 0;

  const scoreRank: Record<string, number> = { HIGH: 3, MEDIUM: 2, LOW: 1 };

  for (const row of result.rows) {
    const description = String(row.description_text ?? "");
    const currentScore = String(row.score ?? "LOW") as "HIGH" | "MEDIUM" | "LOW";
    const structural: string[] = JSON.parse(String(row.matched_keywords ?? "[]"));

    const { score: textScore, matched } = scoreText(description, keywords);

    // Upgrade score only — never downgrade
    const currentRank = scoreRank[currentScore] ?? 0;
    const textRank = textScore ? scoreRank[textScore] ?? 0 : 0;
    const finalScore = textRank > currentRank ? textScore! : currentScore;
    const wasUpgraded = finalScore !== currentScore;

    const summary = buildSummary(finalScore, structural, matched);

    await db.execute({
      sql: `UPDATE matches SET description_keywords = ?, score = ?, ai_summary = ? WHERE id = ?`,
      args: [JSON.stringify(matched), finalScore, summary, row.id],
    });

    updated++;
    if (wasUpgraded) upgraded++;
    if (matched.length > 0) signalsFound++;
  }

  return NextResponse.json({
    ok: true,
    processed: result.rows.length,
    updated,
    upgraded,
    signalsFound,
    keywords: keywords.length,
  });
}
