import { NextResponse } from "next/server";
import { initDb, getDb, getAllCities, getMatchStats, getSetting } from "@/lib/db";

export async function GET() {
  try {
    initDb();
    const db = getDb();

    const cities = getAllCities();
    const activeCities = cities.filter((c) => c.active === 1).length;

    const stats = getMatchStats();

    // Get last scan time
    const lastScan = db
      .prepare("SELECT MAX(completed_at) as last_scan FROM scan_log WHERE completed_at IS NOT NULL")
      .get() as { last_scan: string | null };

    const lastScanTime = lastScan.last_scan
      ? new Date(lastScan.last_scan).toLocaleDateString()
      : "Never";

    return NextResponse.json({
      activeCities,
      totalMatches: stats.total,
      highMatches: stats.high,
      lastScan: lastScanTime,
    });
  } catch (error) {
    console.error("Stats error:", error);
    return NextResponse.json(
      { error: "Failed to fetch stats" },
      { status: 500 }
    );
  }
}
