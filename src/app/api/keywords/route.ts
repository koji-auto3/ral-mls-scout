import { NextResponse } from "next/server";
import { initDb, getSetting, setSetting } from "@/lib/db";

export const dynamic = "force-dynamic";

const DEFAULT_KEYWORDS = [
  // Primary — strong RAL indicators
  "assisted living",
  "memory care",
  "group home",
  "residential care",
  "board and care",
  "adult care",
  "senior care",
  "elder care",
  "care facility",
  "care home",
  "ral",
  // Secondary — structural / listing signals
  "efficiency unit",
  "efficiency units",
  "kitchenette",
  "kitchenettes",
  "mother-in-law suite",
  "mother in law suite",
  "in-law suite",
  "in law suite",
  "separate entrance",
  "private entrance",
  "separate living",
  "separate quarters",
  "multiple units",
  "multi-unit",
  "duplex",
  "triplex",
  "fourplex",
  "quadplex",
  "income producing",
  "income-producing",
  "currently rented",
  "tenant occupied",
  "rental income",
  "investment property",
  "multi family",
  "multifamily",
  "group living",
  "communal living",
  "shared living",
  "ada compliant",
  "ada accessible",
  "wheelchair accessible",
  "handicap accessible",
  "roll-in shower",
  "walk-in shower",
  "grab bars",
  "6 bedroom",
  "7 bedroom",
  "8 bedroom",
  "9 bedroom",
  "10 bedroom",
  "commercial kitchen",
  "institutional",
  "zoned for",
  "adu",
  "accessory dwelling",
  "casita",
  "guest house",
  "guest suite",
  "nursing",
  "caregiver",
  "live-in caregiver",
].join("\n");

export async function GET() {
  await initDb();
  const stored = await getSetting("keywords");
  return NextResponse.json({ keywords: stored ?? DEFAULT_KEYWORDS });
}

export async function POST(req: Request) {
  await initDb();
  const { keywords } = await req.json();
  if (typeof keywords !== "string") {
    return NextResponse.json({ error: "keywords must be a string" }, { status: 400 });
  }
  await setSetting("keywords", keywords.trim());
  return NextResponse.json({ ok: true });
}
