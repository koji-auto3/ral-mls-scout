import { NextRequest, NextResponse } from "next/server";
import { initDb, getAllCities, addMatch, getSetting, updateCityLastScanned } from "@/lib/db";
import { sendTelegramAlert } from "@/lib/notifier";
import { enrichPendingMatches } from "@/lib/enricher";

// ── Types ────────────────────────────────────────────────────────────────────

interface ParsedListing {
  address: string;
  city: string;
  state: string;
  price: number;
  bedrooms: number;
  bathrooms: number;
  sqft: number;
  url: string;
  propertyType: string;
  location: string; // Redfin neighbourhood/subdivision field
  yearBuilt: number;
}

interface ScoreResult {
  score: "HIGH" | "MEDIUM" | "LOW" | null;
  matchedKeywords: string[];
  summary: string;
}

// ── CSV Parser ───────────────────────────────────────────────────────────────

function parseRedfinCSV(csvText: string): ParsedListing[] {
  // Normalise line endings
  const lines = csvText.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");

  // Find the header row
  const headerIdx = lines.findIndex((l) => l.startsWith("SALE TYPE"));
  if (headerIdx === -1) return [];

  const headers = splitCSVLine(lines[headerIdx]).map((h) => h.trim().toUpperCase());

  const col = (row: string[], name: string) => {
    const idx = headers.indexOf(name);
    return idx >= 0 ? (row[idx] || "").trim() : "";
  };

  return lines
    .slice(headerIdx + 1)
    .filter((l) => l.trim() && !l.startsWith('"In accordance'))
    .map((line) => {
      const cols = splitCSVLine(line);
      const priceRaw = col(cols, "PRICE").replace(/[^0-9]/g, "");
      const sqftRaw = col(cols, "SQUARE FEET").replace(/[^0-9]/g, "");

      // URL column header contains a long note — match by prefix
      const urlIdx = headers.findIndex((h) => h.startsWith("URL"));
      const url = urlIdx >= 0 ? (cols[urlIdx] || "").trim() : "";

      return {
        address: col(cols, "ADDRESS"),
        city: col(cols, "CITY"),
        state: col(cols, "STATE OR PROVINCE"),
        price: parseInt(priceRaw) || 0,
        bedrooms: parseInt(col(cols, "BEDS")) || 0,
        bathrooms: parseFloat(col(cols, "BATHS")) || 0,
        sqft: parseInt(sqftRaw) || 0,
        url,
        propertyType: col(cols, "PROPERTY TYPE"),
        location: col(cols, "LOCATION"),
        yearBuilt: parseInt(col(cols, "YEAR BUILT")) || 0,
      };
    })
    .filter(
      (l) =>
        l.address &&
        l.city &&
        l.price > 0 &&
        l.bedrooms >= 4 &&
        !l.propertyType.toLowerCase().includes("condo") &&
        !l.propertyType.toLowerCase().includes("co-op")
    );
}

function splitCSVLine(line: string): string[] {
  const cols: string[] = [];
  let inQuotes = false;
  let current = "";
  for (const char of line) {
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      cols.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  cols.push(current);
  return cols;
}

// ── Metadata-Based RAL Scorer ────────────────────────────────────────────────

const LOCATION_HIGH_KEYWORDS = [
  "assisted living",
  "memory care",
  "adult care",
  "senior care",
  "elder care",
  "skilled nursing",
  "group home",
];

const LOCATION_MEDIUM_KEYWORDS = [
  "in-law suite",
  "multigenerational",
  "multi gen",
  "adult community",
  "55+",
  "age restricted",
];

function scoreFromMetadata(listing: ParsedListing): ScoreResult {
  const signals: string[] = [];
  let score: "HIGH" | "MEDIUM" | "LOW" | null = null;

  const { bedrooms, sqft, location, yearBuilt, price } = listing;
  const locationLower = location.toLowerCase();

  if (bedrooms > 10) {
    return { score: null, matchedKeywords: [], summary: "" };
  }

  if (bedrooms >= 6 && sqft >= 2000) {
    signals.push(`${bedrooms} bedrooms — meets 6-resident RAL capacity`);
    score = "HIGH";
  }

  const highLocMatch = LOCATION_HIGH_KEYWORDS.find((kw) =>
    locationLower.includes(kw)
  );
  if (highLocMatch) {
    signals.push(`Subdivision: "${location}" (care keyword)`);
    score = "HIGH";
  }

  if (score === "HIGH") {
    return {
      score,
      matchedKeywords: signals,
      summary: `Strong RAL candidate — ${signals.slice(0, 2).join("; ")}. Physical profile meets 6-resident capacity for Florida licensure.`,
    };
  }

  if (bedrooms === 5 && sqft >= 2500) {
    signals.push(`5 bed / ${sqft.toLocaleString()} sqft — 5-resident layout viable`);
    score = "MEDIUM";
  }

  if (bedrooms === 4 && sqft >= 3500) {
    signals.push(`4 bed / ${sqft.toLocaleString()} sqft — bonus room likely, could convert to 5th`);
    score = "MEDIUM";
  }

  const medLocMatch = LOCATION_MEDIUM_KEYWORDS.find((kw) =>
    locationLower.includes(kw)
  );
  if (medLocMatch) {
    signals.push(`Location keyword: "${location}"`);
    if (!score) score = "MEDIUM";
  }

  if (score === "MEDIUM") {
    return {
      score,
      matchedKeywords: signals,
      summary: `Viable RAL candidate — ${signals.slice(0, 2).join("; ")}. Verify layout and check for convertible rooms.`,
    };
  }

  if (bedrooms >= 4 && price > 0 && sqft > 0) {
    const pricePerSqft = price / sqft;
    if (pricePerSqft < 100) {
      signals.push(`$${Math.round(pricePerSqft)}/sqft — below-market, potential conversion play`);
      score = "LOW";
    }
  }

  if (score === "LOW") {
    return {
      score,
      matchedKeywords: signals,
      summary: `Worth a look — ${signals.slice(0, 2).join("; ")}. Lower priority but check floor plan.`,
    };
  }

  return { score: null, matchedKeywords: [], summary: "" };
}

// ── Route Handler ────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    await initDb();

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const cityIdRaw = formData.get("city_id");
    const cityId = cityIdRaw ? parseInt(cityIdRaw as string) : null;

    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    const csvText = await file.text();
    const listings = parseRedfinCSV(csvText);

    if (listings.length === 0) {
      return NextResponse.json(
        {
          error:
            "No valid listings found. Make sure it's a Redfin export with 4+ bed single-family homes.",
        },
        { status: 400 }
      );
    }

    const cities = await getAllCities();

    // Determine the target city for state filtering
    const targetCity = cityId
      ? cities.find((c) => c.id === cityId)
      : cities[0];

    let matchesFound = 0;
    let highCount = 0;
    let mediumCount = 0;
    let lowCount = 0;

    const telegramToken = (await getSetting("telegram_token")) || "";
    const telegramChatId = (await getSetting("telegram_chat_id")) || "";

    for (const listing of listings) {
      // Skip listings whose state doesn't match the target city's state
      if (
        targetCity &&
        listing.state &&
        listing.state.toUpperCase() !== targetCity.state.toUpperCase()
      ) {
        continue;
      }

      const { score, matchedKeywords, summary } = scoreFromMetadata(listing);

      if (!score) continue;

      // Match to city record
      const matchCity =
        cities.find(
          (c) =>
            c.name.toLowerCase() === listing.city.toLowerCase() &&
            c.state.toUpperCase() === listing.state.toUpperCase()
        ) || cities[0];

      const match = await addMatch({
        city_id: cityId ?? matchCity?.id ?? 0,
        address: listing.address,
        city: listing.city,
        state: listing.state,
        price: listing.price,
        bedrooms: listing.bedrooms,
        bathrooms: listing.bathrooms,
        sqft: listing.sqft,
        listing_url: listing.url,
        source: "redfin-csv",
        score,
        matched_keywords: JSON.stringify(matchedKeywords),
        ai_summary: summary,
        raw_description: `${listing.bedrooms}bd/${listing.bathrooms}ba | ${listing.sqft.toLocaleString()} sqft | Built ${listing.yearBuilt} | ${listing.location}`,
        description_text: "",
        description_keywords: "[]",
        enrich_status: "",
        viewed: 0,
      });

      matchesFound++;
      if (score === "HIGH") highCount++;
      else if (score === "MEDIUM") mediumCount++;
      else lowCount++;

      // Telegram alert for HIGH matches only
      if (score === "HIGH" && telegramToken && telegramChatId) {
        await sendTelegramAlert(match, {
          telegram_token: telegramToken,
          telegram_chat_id: telegramChatId,
        });
      }
    }

    // Update last_scanned timestamp for this city
    if (cityId) {
      await updateCityLastScanned(cityId, listings.length);
    }

    // Fire-and-forget: scrape listing descriptions in the background
    if (matchesFound > 0) {
      enrichPendingMatches().catch(console.error);
    }

    return NextResponse.json({
      success: true,
      listingsProcessed: listings.length,
      matchesFound,
      breakdown: { high: highCount, medium: mediumCount, low: lowCount },
      enriching: matchesFound > 0,
    });
  } catch (error) {
    console.error("Import error:", error);
    return NextResponse.json(
      { error: `Import failed: ${String(error)}` },
      { status: 500 }
    );
  }
}
