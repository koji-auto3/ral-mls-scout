import { NextRequest, NextResponse } from "next/server";
import { initDb, getAllMatches } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await initDb();

    const searchParams = request.nextUrl.searchParams;
    const cityId = searchParams.get("city_id")
      ? parseInt(searchParams.get("city_id") || "0")
      : undefined;
    const score = searchParams.get("score") || undefined;
    const limit = parseInt(searchParams.get("limit") || "100");

    const matches = await getAllMatches(cityId, score, limit);

    return NextResponse.json(matches);
  } catch (error) {
    console.error("Matches error:", error);
    return NextResponse.json(
      { error: "Failed to fetch matches" },
      { status: 500 }
    );
  }
}
