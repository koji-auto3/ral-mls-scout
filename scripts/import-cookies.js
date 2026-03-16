#!/usr/bin/env node
/**
 * RAL Scout — Import cookies from browser into Playwright profile
 * Usage: node scripts/import-cookies.js "<cookie-string>"
 */

const fs = require("fs");
const path = require("path");
const { addExtra } = require("playwright-extra");
const { chromium } = require("/home/henry/projects/jobber-quote-builder/node_modules/playwright");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");

const USER_DATA_DIR = path.join(__dirname, "../data/browser-profile");

const RAW = process.argv[2] || "";
if (!RAW) {
  console.error("Usage: node import-cookies.js \"<cookie-string>\"");
  process.exit(1);
}

function parseCookieString(str) {
  return str.split(";").map(s => s.trim()).filter(Boolean).map(part => {
    const idx = part.indexOf("=");
    const name = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    return { name, value, domain: ".redfin.com", path: "/", httpOnly: false, secure: false, sameSite: "Lax" };
  });
}

async function main() {
  fs.mkdirSync(USER_DATA_DIR, { recursive: true });

  const stealthChromium = addExtra(chromium);
  stealthChromium.use(StealthPlugin());

  const context = await stealthChromium.launchPersistentContext(USER_DATA_DIR, {
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const cookies = parseCookieString(RAW);
  await context.addCookies(cookies);

  // Verify RF_AUTH is set
  const saved = await context.cookies("https://www.redfin.com");
  const auth = saved.find(c => c.name === "RF_AUTH");
  console.log(auth ? `✓ RF_AUTH saved: ${auth.value.slice(0, 10)}...` : "✗ RF_AUTH not found");
  console.log(`✓ Total Redfin cookies saved: ${saved.length}`);

  await context.close();
  console.log("Done. Run auto-scan.js to test.");
}

main().catch(err => { console.error("FATAL:", err.message); process.exit(1); });
