import { NextResponse } from "next/server";
import { initDb, getAllCities, addMatch, getAllMatches, getSetting, updateCityLastScanned } from "@/lib/db";
import { sendTelegramAlert } from "@/lib/notifier";

// ── Local metadata scorer (mirrors import/route.ts logic) ────────────────────
function scoreFromMetadata(listing: { bedrooms: number; bathrooms: number; sqft: number; price: number; location: string }): { score: "HIGH" | "MEDIUM" | "LOW" | null; matchedKeywords: string[]; summary: string } {
  const { bedrooms, sqft, price, location } = listing;
  const pricePerSqft = sqft > 0 ? price / sqft : 0;
  const locationLower = location.toLowerCase();

  // HIGH: 7+ bedrooms OR 6+ beds + large sqft
  if (bedrooms >= 7) {
    return { score: "HIGH", matchedKeywords: [`${bedrooms} bedrooms — meets 6-resident RAL capacity`], summary: `Strong RAL candidate — ${bedrooms} bedrooms — meets 6-resident RAL capacity. Physical profile meets 6-resident capacity for Florida licensure.` };
  }
  if (bedrooms >= 6 && sqft >= 2500) {
    return { score: "HIGH", matchedKeywords: [`${bedrooms} bedrooms, ${sqft.toLocaleString()} sqft — strong RAL layout`], summary: `Strong RAL candidate — ${bedrooms} bedrooms with ${sqft.toLocaleString()} sqft provides ample space for 6-resident assisted living facility.` };
  }
  if (locationLower.includes("care") || locationLower.includes("assisted") || locationLower.includes("senior")) {
    return { score: "HIGH", matchedKeywords: ["location signals existing care use"], summary: "Location name suggests existing care facility use — high RAL conversion potential." };
  }

  // MEDIUM: 5-6 bedrooms OR good sqft-to-price ratio
  if (bedrooms >= 5) {
    return { score: "MEDIUM", matchedKeywords: [`${bedrooms} bedrooms — potential RAL layout`], summary: `Viable RAL candidate — ${bedrooms} bedrooms may support 4-5 resident assisted living with modifications.` };
  }
  if (bedrooms >= 4 && sqft >= 2800) {
    return { score: "MEDIUM", matchedKeywords: [`${bedrooms}bd / ${sqft.toLocaleString()} sqft — spacious layout`], summary: `Spacious 4-bedroom layout at ${sqft.toLocaleString()} sqft — potential for RAL conversion with room additions.` };
  }
  if (bedrooms >= 4 && pricePerSqft < 200 && sqft >= 2000) {
    return { score: "MEDIUM", matchedKeywords: [`$${Math.round(pricePerSqft)}/sqft — favorable acquisition cost`], summary: `Favorable price per sqft ($${Math.round(pricePerSqft)}) with adequate size — worth evaluating for RAL conversion.` };
  }

  return { score: null, matchedKeywords: [], summary: "" };
}

export const dynamic = "force-dynamic";

// ── Redfin Region Lookup ─────────────────────────────────────────────────────

const REGION_LOOKUP: Record<string, { region_id: number; market: string | null }> = {
  "tampa,fl":             { region_id: 13350, market: "tampa" },
  "saint petersburg,fl":  { region_id: 13291, market: "tampa" },
  "orlando,fl":           { region_id: 13655, market: null },  // market param breaks Orlando API
  "jacksonville,fl":      { region_id: 10752, market: "jacksonville" },
  "miami,fl":             { region_id: 10920, market: "miami" },
  "fort lauderdale,fl":   { region_id: 10560, market: "miami" },
  "phoenix,az":           { region_id: 20695, market: "phoenix" },
  "scottsdale,az":        { region_id: 20580, market: "phoenix" },
  "atlanta,ga":           { region_id: 16904, market: "atlanta" },
  "charlotte,nc":         { region_id: 21830, market: "charlotte" },
  "dallas,tx":            { region_id: 19657, market: "dallas" },
  "houston,tx":           { region_id: 19773, market: "houston" },
  "austin,tx":            { region_id: 20015, market: "austin" },
  "las vegas,nv":         { region_id: 30695, market: "las-vegas" },
  "denver,co":            { region_id: 19807, market: "denver" },
  "nashville,tn":         { region_id: 24836, market: "nashville" },
  "memphis,tn":           { region_id: 15797, market: "memphis" },
  "birmingham,al":        { region_id: 14985, market: "birmingham" },
};

function getRedfinRegion(city: string, state: string) {
  return REGION_LOOKUP[`${city.toLowerCase()},${state.toLowerCase()}`] || null;
}

// ── CSV fetch + parse ────────────────────────────────────────────────────────

const REDFIN_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Referer": "https://www.redfin.com/",
};

async function fetchRedfinCSV(city: string, state: string, priceMin: number, priceMax: number): Promise<string | null> {
  const region = getRedfinRegion(city, state);
  if (!region) return null;

  const marketParam = region.market ? `&market=${region.market}` : "";
  const url = `https://www.redfin.com/stingray/api/gis-csv?al=1${marketParam}&min_beds=4&max_price=${priceMax}&min_price=${priceMin}&num_homes=350&ord=redfin-recommended-asc&page_number=1&region_id=${region.region_id}&region_type=6&sf=1,2,3,5,6,7&status=9&uipt=1,2,3,4,5,6,7,8&v=8`;

  const res = await fetch(url, { headers: REDFIN_HEADERS });
  if (!res.ok) return null;

  const text = await res.text();
  if (!text.includes("SALE TYPE")) return null;
  return text;
}

function splitCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') { inQuotes = !inQuotes; continue; }
    if (line[i] === "," && !inQuotes) { result.push(current); current = ""; continue; }
    current += line[i];
  }
  result.push(current);
  return result;
}

function parseRedfinCSV(csvText: string) {
  const lines = csvText.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const headerIdx = lines.findIndex((l) => l.startsWith("SALE TYPE"));
  if (headerIdx === -1) return [];

  const headers = splitCSVLine(lines[headerIdx]).map((h) => h.trim().toUpperCase());
  const col = (row: string[], name: string) => {
    const idx = headers.indexOf(name);
    return idx >= 0 ? (row[idx] || "").trim() : "";
  };

  return lines.slice(headerIdx + 1)
    .filter((l) => l.trim() && !l.startsWith('"In accordance'))
    .map((line) => {
      const cols = splitCSVLine(line);
      const urlIdx = headers.findIndex((h) => h.startsWith("URL"));
      return {
        address: col(cols, "ADDRESS"),
        city: col(cols, "CITY"),
        state: col(cols, "STATE OR PROVINCE"),
        price: parseInt(col(cols, "PRICE").replace(/[^0-9]/g, "")) || 0,
        bedrooms: parseInt(col(cols, "BEDS")) || 0,
        bathrooms: parseFloat(col(cols, "BATHS")) || 0,
        sqft: parseInt(col(cols, "SQUARE FEET").replace(/[^0-9]/g, "")) || 0,
        yearBuilt: parseInt(col(cols, "YEAR BUILT")) || 0,
        location: col(cols, "LOCATION"),
        url: urlIdx >= 0 ? (cols[urlIdx] || "").trim() : "",
        propertyType: col(cols, "PROPERTY TYPE"),
      };
    })
    .filter((l) => l.address && l.bedrooms >= 4 && l.price > 0);
}

// ── Main scan handler ────────────────────────────────────────────────────────

export async function POST() {
  try {
    await initDb();

    const cities = (await getAllCities()).filter((c) => c.active === 1);
    if (cities.length === 0) {
      return NextResponse.json({ error: "No active cities configured" }, { status: 400 });
    }

    let totalListings = 0;
    let totalMatches = 0;
    const cityResults: { city: string; state: string; listings: number; matches: number; supported: boolean; error?: string }[] = [];

    for (const city of cities) {
      const region = getRedfinRegion(city.name, city.state);

      if (!region) {
        cityResults.push({ city: city.name, state: city.state, listings: 0, matches: 0, supported: false });
        continue;
      }

      try {
        const csvText = await fetchRedfinCSV(city.name, city.state, city.price_min, city.price_max);
        if (!csvText) {
          console.error(`[scan] CSV fetch returned null for ${city.name}, ${city.state} — Redfin may be blocking this IP`);
          cityResults.push({ city: city.name, state: city.state, listings: 0, matches: 0, supported: true, error: "Redfin CSV unavailable from this server — run auto-scan.js locally instead" });
          continue;
        }

        // Filter to only listings matching this city's state (Redfin can return out-of-state results)
        const allListings = parseRedfinCSV(csvText);
        const listings = allListings.filter(
          (l) => !l.state || l.state.toUpperCase() === city.state.toUpperCase()
        );
        totalListings += listings.length;

        // Dedupe against existing matches
        const existing = await getAllMatches(city.id, undefined, 1000);
        const existingUrls = new Set(existing.map((m) => m.listing_url));

        let cityMatches = 0;

        for (const listing of listings) {
          if (existingUrls.has(listing.url)) continue;

          const { score, matchedKeywords, summary } = scoreFromMetadata({
            bedrooms: listing.bedrooms,
            bathrooms: listing.bathrooms,
            sqft: listing.sqft,
            price: listing.price,
            location: listing.location,
          });

          if (score === "HIGH" || score === "MEDIUM") {
            const match = await addMatch({
              city_id: city.id || 0,
              address: listing.address,
              city: listing.city || city.name,
              state: listing.state || city.state,
              price: listing.price,
              bedrooms: listing.bedrooms,
              bathrooms: listing.bathrooms,
              sqft: listing.sqft,
              listing_url: listing.url,
              source: "redfin-scan",
              score,
              matched_keywords: JSON.stringify(matchedKeywords),
              description_keywords: "[]",
              ai_summary: summary,
              raw_description: `${listing.bedrooms}bd/${listing.bathrooms}ba | ${listing.sqft.toLocaleString()} sqft | Built ${listing.yearBuilt} | ${listing.location}`,
              description_text: "",
              enrich_status: "pending",
              viewed: 0,
            });

            cityMatches++;
            totalMatches++;

            if (score === "HIGH") {
              const telegramToken = await getSetting("telegram_token") || "";
              const telegramChatId = await getSetting("telegram_chat_id") || "";
              if (telegramToken && telegramChatId) {
                await sendTelegramAlert(match, { telegram_token: telegramToken, telegram_chat_id: telegramChatId });
              }
            }
          }
        }

        await updateCityLastScanned(city.id!, listings.length);
        cityResults.push({ city: city.name, state: city.state, listings: listings.length, matches: cityMatches, supported: true });
      } catch (err) {
        console.error(`Scan error for ${city.name}:`, err);
        cityResults.push({ city: city.name, state: city.state, listings: 0, matches: 0, supported: true });
      }
    }

    return NextResponse.json({
      success: true,
      citiesScanned: cities.length,
      totalListings,
      matchesFound: totalMatches,
      cityResults,
    });
  } catch (error) {
    console.error("Scan error:", error);
    return NextResponse.json({ error: "Scan failed" }, { status: 500 });
  }
}
