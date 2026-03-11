import { NextRequest, NextResponse } from "next/server";
import { initDb, getAllCities, addCity, getCityCount } from "@/lib/db";

export async function GET() {
  try {
    initDb();
    const cities = getAllCities();
    return NextResponse.json(cities);
  } catch (error) {
    console.error("Cities GET error:", error);
    return NextResponse.json(
      { error: "Failed to fetch cities" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    initDb();

    // Check if at max cities
    if (getCityCount() >= 5) {
      return NextResponse.json(
        { error: "Maximum 5 cities reached" },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { name, state, price_min, price_max } = body;

    if (!name || !state) {
      return NextResponse.json(
        { error: "Name and state required" },
        { status: 400 }
      );
    }

    const city = addCity(
      name,
      state,
      price_min || 100000,
      price_max || 1500000
    );

    return NextResponse.json(city, { status: 201 });
  } catch (error) {
    console.error("Cities POST error:", error);
    return NextResponse.json(
      { error: "Failed to add city" },
      { status: 500 }
    );
  }
}
