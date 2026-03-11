import { NextResponse } from "next/server";
import { initDb, getAllCities, addMatch, getSetting } from "@/lib/db";
import { scanCity } from "@/lib/scanner";
import { scoreDescription } from "@/lib/scorer";
import { sendTelegramAlert } from "@/lib/notifier";

export async function POST() {
  try {
    initDb();

    const cities = getAllCities().filter((c) => c.active === 1);

    if (cities.length === 0) {
      return NextResponse.json(
        { error: "No active cities configured" },
        { status: 400 }
      );
    }

    let totalListings = 0;
    let totalMatches = 0;

    for (const city of cities) {
      const startedAt = new Date().toISOString();

      try {
        const listings = await scanCity(city);
        totalListings += listings.length;

        // Score each listing
        for (const listing of listings) {
          const { score, matchedKeywords } = scoreDescription(listing.description);

          // Only save HIGH and MEDIUM matches
          if (score === "HIGH" || score === "MEDIUM") {
            const match = addMatch({
              city_id: city.id || 0,
              address: listing.address,
              city: listing.city,
              state: listing.state,
              price: listing.price,
              bedrooms: listing.bedrooms,
              bathrooms: listing.bathrooms,
              sqft: listing.sqft,
              listing_url: listing.listingUrl,
              source: listing.source,
              score,
              matched_keywords: JSON.stringify(matchedKeywords),
              ai_summary: `This property has ${matchedKeywords.length} RAL indicators. ${
                score === "HIGH"
                  ? "Strong candidate with direct care facility signals."
                  : "Good physical setup indicators for assisted living."
              }`,
              raw_description: listing.description,
              viewed: 0,
            });

            totalMatches++;

            // Send Telegram alert for HIGH matches
            if (score === "HIGH") {
              const settings = {
                telegram_token: getSetting("telegram_token") || "",
                telegram_chat_id: getSetting("telegram_chat_id") || "",
              };
              await sendTelegramAlert(match, settings);
            }
          }
        }

        // Update city last_scanned in store
        if (city.id !== undefined) {
          city.last_scanned = new Date().toISOString();
          city.listing_count = listings.length;
        }
      } catch (error) {
        console.error(`Scan error for ${city.name}:`, error);
      }
    }

    return NextResponse.json({
      success: true,
      citiesScanned: cities.length,
      totalListings,
      matchesFound: totalMatches,
    });
  } catch (error) {
    console.error("Scan error:", error);
    return NextResponse.json(
      { error: "Scan failed" },
      { status: 500 }
    );
  }
}
