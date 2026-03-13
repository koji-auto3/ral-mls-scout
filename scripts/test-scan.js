/**
 * RAL Scout Auto-Scanner — Test Script
 * Verifies city fetching and Redfin URL patterns without downloading or importing.
 *
 * Usage: node scripts/test-scan.js
 */

const APP_BASE = "https://ral-mls-scout.vercel.app";

const FALLBACK_CITIES = [
  { id: 1, name: "Tampa", state: "FL", price_min: 100000, price_max: 1500000, active: 1 },
];

function buildRedfinUrl(city) {
  const citySlug = city.name.replace(/\s+/g, "-");
  return `https://www.redfin.com/${city.state}/${citySlug}/filter/property-type=house,min-beds=4`;
}

async function main() {
  console.log("RAL Scout Test Scanner\n");

  // Step 1: Fetch cities
  let cities;
  try {
    console.log(`Fetching cities from ${APP_BASE}/api/cities ...`);
    const res = await fetch(`${APP_BASE}/api/cities`);
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    cities = await res.json();
    console.log(`\nFetched ${cities.length} cities from API:\n`);
  } catch (err) {
    console.warn(`Could not fetch cities (${err.message}), using fallback Tampa, FL\n`);
    cities = FALLBACK_CITIES;
  }

  // Step 2: Print each city and its Redfin URL
  const active = cities.filter((c) => c.active === 1 || c.active === undefined);

  for (const city of cities) {
    const isActive = city.active === 1 || city.active === undefined;
    const status = isActive ? "ACTIVE" : "inactive";
    console.log(`  [${status}] ${city.name}, ${city.state}`);
    console.log(`    ID: ${city.id}`);
    console.log(`    Price range: $${(city.price_min || 0).toLocaleString()} - $${(city.price_max || 0).toLocaleString()}`);
    console.log(`    Last scanned: ${city.last_scanned || "never"}`);
    console.log(`    Redfin URL: ${buildRedfinUrl(city)}`);
    console.log();
  }

  // Step 3: Summary
  console.log("── Summary ──");
  console.log(`Total cities: ${cities.length}`);
  console.log(`Active cities: ${active.length}`);
  console.log(`Would scan ${active.length} cities in auto-scan mode`);
  console.log();

  // Step 4: Test Redfin URL reachability for first active city
  const testCity = active[0] || FALLBACK_CITIES[0];
  const testUrl = buildRedfinUrl(testCity);
  console.log(`── Testing Redfin URL for ${testCity.name}, ${testCity.state} ──`);
  console.log(`URL: ${testUrl}`);

  try {
    const res = await fetch(testUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      },
      redirect: "follow",
    });
    console.log(`Response: ${res.status} ${res.statusText}`);
    console.log(`Final URL: ${res.url}`);
    if (res.ok) {
      console.log("Redfin URL is reachable!\n");
    } else {
      console.log(`WARNING: Got non-200 status. Page may require different URL format.\n`);
    }
  } catch (err) {
    console.log(`Could not reach Redfin: ${err.message}\n`);
  }

  console.log("Test complete. No downloads or imports were performed.");
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
