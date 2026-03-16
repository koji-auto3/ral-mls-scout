#!/usr/bin/env node
/**
 * RAL Scout — One-Time Redfin Login
 *
 * Run this once to authenticate. Opens a real browser window so you can
 * log into Redfin manually. Cookies are saved to data/browser-profile and
 * reused by auto-scan.js on every subsequent run.
 *
 * Usage: node scripts/login.js
 */

const fs = require("fs");
const path = require("path");
const { addExtra } = require("playwright-extra");
const { chromium } = require("/home/henry/projects/jobber-quote-builder/node_modules/playwright");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");

const USER_DATA_DIR = path.join(__dirname, "../data/browser-profile");

async function main() {
  fs.mkdirSync(USER_DATA_DIR, { recursive: true });

  const stealthChromium = addExtra(chromium);
  stealthChromium.use(StealthPlugin());

  console.log("Opening browser — log into Redfin, then close the window when done.");
  console.log(`Profile will be saved to: ${USER_DATA_DIR}\n`);

  const context = await stealthChromium.launchPersistentContext(USER_DATA_DIR, {
    headless: false,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    viewport: { width: 1280, height: 900 },
  });

  const page = await context.newPage();
  await page.goto("https://www.redfin.com/login", { waitUntil: "domcontentloaded" });

  console.log("Waiting for you to log in and close the browser...");
  await context.waitForEvent("close").catch(() => {});
  await context.close().catch(() => {});

  console.log("\n✓ Session saved. You can now run auto-scan.js.");
}

main().catch((err) => {
  console.error("FATAL:", err.message);
  process.exit(1);
});
