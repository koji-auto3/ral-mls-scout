import { NextResponse } from "next/server";
import { initDb, getAllCities, getMatchStats } from "@/lib/db";

export async function GET() {
  try {
    initDb();

    const cities = getAllCities();
    const activeCities = cities.filter((c) => c.active === 1).length;
    const stats = getMatchStats();

    return NextResponse.json({
      activeCities,
      totalMatches: stats.total,
      highMatches: stats.high,
      lastScan: "Never",
    });
  } catch (error) {
    console.error("Stats error:", error);
    return NextResponse.json({ error: "Failed to fetch stats" }, { status: 500 });
  }
}
