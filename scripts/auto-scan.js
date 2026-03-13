#!/usr/bin/env node
/**
 * RAL Scout Auto-Scanner
 *
 * How it works:
 *  1. Launches stealth browser, navigates to Redfin city page
 *  2. Signs in with Redfin session (cookies persist from previous login)
 *  3. Fetches CSV via Redfin's stingray API using the authenticated session
 *  4. POSTs CSV to Vercel import API using no-cors mode (bypasses CSP/CORS)
 *
 * Key discovery: Redfin's download button uses these params (not the old API):
 *   - al=3 (not al=1)
 *   - market=<redfin_market> (e.g. "centralflorida", "orlando")
 *   - num_beds=4 (not min_beds=4)
 *   - region_id=<city_page_id> (e.g. 18142 for Tampa, 13655 for Orlando)
 *
 * Requirements:
 *   - Must be signed into Redfin at least once — session cookies persist
 *   - Playwright from jobber-quote-builder + playwright-extra + stealth plugin
 */

const fs = require("fs");
const { addExtra } = require("playwright-extra");
const { chromium } = require("/home/henry/projects/jobber-quote-builder/node_modules/playwright");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");

const APP_BASE = "https://ral-mls-scout.vercel.app";

// City configuration — verified city IDs from Redfin city page URLs
// To find: navigate to redfin.com/{STATE}/{City}, read /city/{ID}/ from URL
const CITY_CONFIG = {
  "tampa,fl": {
    cityId: 18142,
    slug: "Tampa",
    market: "centralflorida",
    appCityId: 1,
  },
  "orlando,fl": {
    cityId: 13655,
    slug: "Orlando",
    market: "orlando",
    appCityId: 2,
  },
  // Add more cities as needed:
  // "jacksonville,fl": { cityId: 8907, slug: "Jacksonville", market: "jacksonville", appCityId: N },
  // "miami,fl":        { cityId: 11458, slug: "Miami", market: "miami", appCityId: N },
};

function buildCsvUrl(conf) {
  const params = [
    "al=3",
    "has_att_fiber=false", "has_deal=false", "has_dishwasher=false",
    "has_laundry_facility=false", "has_laundry_hookups=false",
    "has_parking=false", "has_pool=false", "has_short_term_lease=false",
    "include_pending_homes=false", "isRentals=false",
    "is_furnished=false", "is_income_restricted=false",
    "is_military=false", "is_senior_living=false", "is_student=false",
    `market=${conf.market}`,
    "num_beds=4",
    "num_homes=350",
    "ord=redfin-recommended-asc",
    "page_number=1",
    "pool=false",
    `region_id=${conf.cityId}`,
    "region_type=6",
    "sf=1,2,3,5,6,7",
    "status=9",
    "travel_with_traffic=false",
    "travel_within_region=false",
    "uipt=1,2,3,4,5,6,7,8",
    "utilities_included=false",
    "v=8",
  ].join("&");
  return `https://www.redfin.com/stingray/api/gis-csv?${params}`;
}

async function scanCity(cityKey, conf) {
  console.log(`\n── Scanning: ${conf.slug} (market: ${conf.market}) ──`);

  const stealthChromium = addExtra(chromium);
  stealthChromium.use(StealthPlugin());

  const browser = await stealthChromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      viewport: { width: 1920, height: 1080 },
    });

    const page = await context.newPage();

    // Navigate to the city's filtered page (establishes session + cookies)
    const cityUrl = `https://www.redfin.com/city/${conf.cityId}/FL/${conf.slug}/filter/min-beds=4`;
    console.log(`  Navigating to ${cityUrl}...`);

    await page.goto(cityUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(2000 + Math.random() * 1500);

    if (page.url().includes("ratelimited")) {
      console.warn(`  Rate limited by Redfin`);
      return { success: false, error: "rate_limited" };
    }

    // Check if we need to log in
    const isLoggedIn = await page.evaluate(() => {
      // Redfin shows account menu when logged in
      return (
        document.querySelector('[class*="accountMenu"], [class*="signIn"]') !== null ||
        document.cookie.includes("RF_AUTH")
      );
    });
    console.log(`  Session: ${isLoggedIn ? "active" : "may need login"}`);

    // Fetch CSV using the session (Redfin cookies included automatically)
    const csvUrl = buildCsvUrl(conf);
    console.log(`  Fetching CSV...`);

    const result = await page.evaluate(async ({ csvUrl, importUrl, cityId }) => {
      // Step 1: Fetch CSV from Redfin (uses browser session cookies)
      const csvRes = await fetch(csvUrl, { credentials: "include" });
      const csvText = await csvRes.text();
      const rows = csvText.split("\n").filter((l) => l.startsWith("MLS")).length;

      if (rows === 0) {
        return { success: false, error: "no_rows", csvStatus: csvRes.status, preview: csvText.slice(0, 200) };
      }

      // Step 2: POST to Vercel import API using no-cors (bypasses Redfin's CSP)
      const blob = new Blob([csvText], { type: "text/csv" });
      const fd = new FormData();
      fd.append("file", blob, "redfin-export.csv");
      fd.append("city_id", String(cityId));

      await fetch(importUrl, { method: "POST", body: fd, mode: "no-cors" });

      return { success: true, rows };
    }, { csvUrl, importUrl: `${APP_BASE}/api/import`, cityId: conf.appCityId });

    if (result.success) {
      console.log(`  ✓ Fetched ${result.rows} listings, import sent`);
    } else {
      console.warn(`  ✗ Failed: ${result.error}`, result.preview || "");
    }

    return result;
  } catch (err) {
    console.error(`  ERROR: ${err.message}`);
    return { success: false, error: err.message };
  } finally {
    await browser.close();
  }
}

async function main() {
  console.log("RAL Scout Auto-Scanner starting...\n");

  const cities = await fetch(`${APP_BASE}/api/cities`)
    .then((r) => r.json())
    .then((all) => all.filter((c) => c.active === 1));

  console.log(`Active cities: ${cities.length}\n`);

  let totalImported = 0;

  for (let i = 0; i < cities.length; i++) {
    const city = cities[i];
    const key = `${city.name.toLowerCase()},${city.state.toLowerCase()}`;
    const conf = CITY_CONFIG[key];

    if (!conf) {
      console.log(`\n── ${city.name}, ${city.state}: No config — skipping ──`);
      continue;
    }

    conf.appCityId = city.id; // Use DB ID in case it changed

    const result = await scanCity(key, conf);
    if (result.success) totalImported += result.rows || 0;

    if (i < cities.length - 1) {
      console.log(`  Waiting 5s before next city...`);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }

  console.log(`\n=== Scan complete ===`);
  console.log(`Listings sent to import: ${totalImported}`);
  console.log(`Timestamp: ${new Date().toISOString()}\n`);
}

main().catch((err) => {
  console.error("FATAL:", err.message);
  process.exit(1);
});
