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
const path = require("path");
const { addExtra } = require("playwright-extra");
const { chromium } = require("/home/henry/projects/jobber-quote-builder/node_modules/playwright");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");

const USER_DATA_DIR = path.join(__dirname, "../data/browser-profile");

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
    "al=1",
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

function randomDelay(min, max) {
  return new Promise(r => setTimeout(r, min + Math.random() * (max - min)));
}

async function scanCityPlaywright(conf, context) {
  const page = await context.newPage();
  try {
    const cityUrl = `https://www.redfin.com/city/${conf.cityId}/FL/${conf.slug}/filter/min-beds=4`;
    console.log(`  [playwright] Navigating to ${conf.slug} city page...`);

    await page.goto(cityUrl, { waitUntil: "domcontentloaded", timeout: 45000 });

    // Human-like: random pause after load
    await randomDelay(2500, 5000);

    if (page.url().includes("ratelimited")) {
      throw new Error("rate_limited");
    }

    // Human-like: scroll down slowly
    await page.evaluate(async () => {
      for (let y = 0; y < 600; y += 80) {
        window.scrollTo(0, y);
        await new Promise(r => setTimeout(r, 120 + Math.random() * 80));
      }
    });
    await randomDelay(800, 1800);

    // Human-like: move mouse around the map area
    await page.mouse.move(400 + Math.random() * 200, 300 + Math.random() * 150);
    await randomDelay(300, 700);
    await page.mouse.move(500 + Math.random() * 150, 400 + Math.random() * 100);
    await randomDelay(500, 1200);

    // Fetch CSV using browser session (cookies sent automatically, same origin)
    const csvUrl = buildCsvUrl(conf);
    console.log(`  [playwright] Fetching CSV...`);

    const csvText = await page.evaluate(async ({ csvUrl }) => {
      const res = await fetch(csvUrl, { credentials: "include" });
      return res.text();
    }, { csvUrl });

    const rows = csvText.split("\n").filter(l => l.trim() && !l.startsWith("SALE TYPE")).length;
    if (rows === 0) throw new Error(`no_rows: ${csvText.slice(0, 150)}`);

    return csvText;
  } finally {
    await page.close();
  }
}

async function scanCityApi(conf, context) {
  console.log(`  [api fallback] Fetching CSV directly...`);
  const cookies = await context.cookies("https://www.redfin.com");
  const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join("; ");
  const csvUrl = buildCsvUrl(conf);

  const res = await fetch(csvUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      "Cookie": cookieHeader,
      "Referer": "https://www.redfin.com/",
      "Accept": "text/csv,*/*",
    },
  });
  const csvText = await res.text();
  const rows = csvText.split("\n").filter(l => l.trim() && !l.startsWith("SALE TYPE")).length;
  if (rows === 0) throw new Error(`no_rows: ${csvText.slice(0, 150)}`);
  return csvText;
}

async function scanCity(cityKey, conf, context) {
  console.log(`\n── Scanning: ${conf.slug} (market: ${conf.market}) ──`);

  let csvText;

  // Try Playwright first (human-like), fall back to direct API
  try {
    csvText = await scanCityPlaywright(conf, context);
    console.log(`  ✓ Playwright succeeded`);
  } catch (playwrightErr) {
    console.warn(`  ⚠ Playwright failed (${playwrightErr.message.split("\n")[0]}) — falling back to API`);
    try {
      csvText = await scanCityApi(conf, context);
      console.log(`  ✓ API fallback succeeded`);
    } catch (apiErr) {
      console.error(`  ✗ Both methods failed: ${apiErr.message.split("\n")[0]}`);
      return { success: false, error: apiErr.message };
    }
  }

  // POST CSV to Vercel import API
  const rows = csvText.split("\n").filter(l => l.trim() && !l.startsWith("SALE TYPE")).length;
  const blob = new Blob([csvText], { type: "text/csv" });
  const fd = new FormData();
  fd.append("file", blob, "redfin-export.csv");
  fd.append("city_id", String(conf.appCityId));

  await fetch(`${APP_BASE}/api/import`, { method: "POST", body: fd });

  console.log(`  ✓ ${rows} listings imported`);
  return { success: true, rows };
}

async function main() {
  console.log("RAL Scout Auto-Scanner starting...\n");

  // Ensure profile dir exists
  fs.mkdirSync(USER_DATA_DIR, { recursive: true });

  const stealthChromium = addExtra(chromium);
  stealthChromium.use(StealthPlugin());

  const context = await stealthChromium.launchPersistentContext(USER_DATA_DIR, {
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    viewport: { width: 1920, height: 1080 },
  });

  try {
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

      conf.appCityId = city.id;

      const result = await scanCity(key, conf, context);
      if (result.success) totalImported += result.rows || 0;

      if (i < cities.length - 1) {
        console.log(`  Waiting 5s before next city...`);
        await new Promise((r) => setTimeout(r, 5000));
      }
    }

    console.log(`\n=== Scan complete ===`);
    console.log(`Listings sent to import: ${totalImported}`);
    console.log(`Timestamp: ${new Date().toISOString()}\n`);
  } finally {
    await context.close();
  }
}

main().catch((err) => {
  console.error("FATAL:", err.message);
  process.exit(1);
});
