import { NextResponse } from "next/server";
import { initDb, getAllMatches } from "@/lib/db";
import { enrichPendingMatches } from "@/lib/enricher";

export async function POST() {
  try {
    await initDb();

    const pending = (await getAllMatches(undefined, undefined, 500)).filter(
      (m) => m.enrich_status === "pending"
    );

    if (pending.length === 0) {
      return NextResponse.json({ message: "No pending matches to enrich", enriched: 0 });
    }

    // Fire-and-forget — enrichment runs in the background
    enrichPendingMatches().catch(console.error);

    return NextResponse.json({
      message: `Enrichment started for ${pending.length} listing(s)`,
      pending: pending.length,
    });
  } catch (error) {
    return NextResponse.json(
      { error: `Enrichment failed: ${String(error)}` },
      { status: 500 }
    );
  }
}

export async function GET() {
  await initDb();
  const all = await getAllMatches(undefined, undefined, 500);
  return NextResponse.json({
    total: all.length,
    pending: all.filter((m) => m.enrich_status === "pending").length,
    done: all.filter((m) => m.enrich_status === "done").length,
    failed: all.filter((m) => m.enrich_status === "failed").length,
  });
}
