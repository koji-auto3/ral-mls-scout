import { NextResponse } from "next/server";
import { initDb, getAllCities, getMatchStats } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await initDb();

    const cities = await getAllCities();
    const activeCities = cities.filter((c) => c.active === 1).length;
    const stats = await getMatchStats();

    // Most recent last_scanned across all cities
    const lastScannedRaw = cities
      .map((c) => c.last_scanned)
      .filter(Boolean)
      .sort()
      .pop() ?? null;

    let lastScan = "Never";
    if (lastScannedRaw) {
      const d = new Date(lastScannedRaw);
      lastScan = d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) +
        " " + d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
    }

    return NextResponse.json({
      activeCities,
      totalMatches: stats.total,
      highMatches: stats.high,
      lastScan,
    });
  } catch (error) {
    console.error("Stats error:", error);
    return NextResponse.json({ error: "Failed to fetch stats" }, { status: 500 });
  }
}
