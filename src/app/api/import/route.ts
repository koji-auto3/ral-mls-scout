import { NextRequest, NextResponse } from "next/server";
import { initDb, getAllCities, addMatch, getSetting } from "@/lib/db";
import { scoreDescription } from "@/lib/scorer";
import { sendTelegramAlert } from "@/lib/notifier";

// Parses a Redfin CSV export and scores each listing
// Redfin CSV columns: SALE TYPE, SOLD DATE, PROPERTY TYPE, ADDRESS, CITY,
//   STATE OR PROVINCE, ZIP OR POSTAL CODE, PRICE, BEDS, BATHS, LOCATION,
//   SQUARE FEET, ..., URL (BROWSER), SOURCE, MLS#, ...

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
}

function parseRedfinCSV(csvText: string): ParsedListing[] {
  const lines = csvText.split("\n").filter((l) => l.trim());
  
  // Skip header and disclaimer lines
  const dataLines = lines.filter(
    (line) =>
      !line.startsWith("SALE TYPE") &&
      !line.startsWith('"In accordance') &&
      line.length > 10
  );

  return dataLines
    .map((line) => {
      // Handle quoted CSV fields
      const cols: string[] = [];
      let inQuotes = false;
      let current = "";

      for (const char of line) {
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === "," && !inQuotes) {
          cols.push(current.trim());
          current = "";
        } else {
          current += char;
        }
      }
      cols.push(current.trim());

      const [
        saleType, soldDate, propertyType, address, city, state, zip,
        priceStr, bedsStr, bathsStr, location, sqftStr,
        ...rest
      ] = cols;

      // URL is at index 20 (0-indexed)
      const url = cols[20] || "";

      return {
        address: address || "",
        city: city || "",
        state: state || "",
        price: parseInt(priceStr?.replace(/[^0-9]/g, "") || "0") || 0,
        bedrooms: parseInt(bedsStr || "0") || 0,
        bathrooms: parseFloat(bathsStr || "0") || 0,
        sqft: parseInt(sqftStr?.replace(/[^0-9]/g, "") || "0") || 0,
        url: url || "",
        propertyType: propertyType || "",
      };
    })
    .filter(
      (l) =>
        l.address &&
        l.city &&
        l.state &&
        l.price > 0 &&
        l.bedrooms >= 3
    );
}

async function fetchListingDescription(url: string): Promise<string> {
  if (!url) return "";
  
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        Accept: "text/html",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) return "";

    const html = await response.text();

    // Extract listing description from Redfin page
    const match =
      html.match(/"publicRemarks"\s*:\s*"([^"]{20,})"/) ||
      html.match(/<div[^>]*class="[^"]*description[^"]*"[^>]*>(.*?)<\/div>/s) ||
      html.match(/class="remarks"[^>]*>(.*?)</s);

    if (match) {
      return match[1]
        .replace(/\\n/g, " ")
        .replace(/\\"/g, '"')
        .replace(/<[^>]+>/g, " ")
        .trim();
    }
  } catch {
    // Silently skip failed fetches
  }

  return "";
}

export async function POST(request: NextRequest) {
  try {
    initDb();

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const cityId = formData.get("city_id") ? parseInt(formData.get("city_id") as string) : null;

    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    const csvText = await file.text();
    const listings = parseRedfinCSV(csvText);

    if (listings.length === 0) {
      return NextResponse.json(
        { error: "No valid listings found in CSV. Make sure it's a Redfin export." },
        { status: 400 }
      );
    }

    const cities = getAllCities();
    let matchesFound = 0;
    const results: string[] = [];

    for (const listing of listings) {
      // Try to fetch description (with rate limiting)
      await new Promise((r) => setTimeout(r, 200));
      const description = await fetchListingDescription(listing.url);

      // If no description, build a basic one from property data
      const baseDesc =
        description ||
        `${listing.bedrooms} bedroom ${listing.propertyType} in ${listing.city}, ${listing.state}.` +
          (listing.sqft > 2500 ? " Large property suitable for multiple occupants." : "") +
          (listing.bedrooms >= 6 ? " High bedroom count ideal for group living." : "");

      const { score, matchedKeywords } = scoreDescription(baseDesc);

      if (score) {
        // Find matching city or use first city
        const matchCity =
          cities.find(
            (c) =>
              c.name.toLowerCase() === listing.city.toLowerCase() &&
              c.state.toUpperCase() === listing.state.toUpperCase()
          ) || cities[0];

        const match = addMatch({
          city_id: cityId || matchCity?.id || 0,
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
          ai_summary:
            score === "HIGH"
              ? `Direct care facility signals detected. ${matchedKeywords.length} primary keyword(s) found. Strong RAL candidate.`
              : `${matchedKeywords.length} physical RAL indicators present (${matchedKeywords.slice(0, 2).join(", ")}). Worth investigating.`,
          raw_description: baseDesc,
          viewed: 0,
        });

        matchesFound++;
        results.push(`${listing.address} → ${score}`);

        // Telegram alert for HIGH matches
        if (score === "HIGH") {
          const settings = {
            telegram_token: getSetting("telegram_token") || "",
            telegram_chat_id: getSetting("telegram_chat_id") || "",
          };
          await sendTelegramAlert(match, settings);
        }
      }
    }

    return NextResponse.json({
      success: true,
      listingsProcessed: listings.length,
      matchesFound,
      matches: results,
    });
  } catch (error) {
    console.error("Import error:", error);
    return NextResponse.json({ error: "Import failed" }, { status: 500 });
  }
}
