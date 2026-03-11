import { NextRequest, NextResponse } from "next/server";
import { initDb, getAllSettings, setSetting } from "@/lib/db";

export async function GET() {
  try {
    initDb();
    const settings = getAllSettings();
    return NextResponse.json(settings);
  } catch (error) {
    console.error("Settings GET error:", error);
    return NextResponse.json(
      { error: "Failed to fetch settings" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    initDb();

    const body = await request.json();
    const { key, value } = body;

    if (!key || !value) {
      return NextResponse.json(
        { error: "Key and value required" },
        { status: 400 }
      );
    }

    setSetting(key, value);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Settings POST error:", error);
    return NextResponse.json(
      { error: "Failed to save settings" },
      { status: 500 }
    );
  }
}
