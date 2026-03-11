// DEMO MODE: Generates realistic mock listings.
// To enable live MLS data, replace with SimplyRETS or Zillow RapidAPI.
// See README for integration details.

import { CityRecord } from "./db";

export interface ScannedListing {
  address: string;
  city: string;
  state: string;
  price: number;
  bedrooms: number;
  bathrooms: number;
  sqft: number;
  description: string;
  listingUrl: string;
  source: string;
}

const STREET_NAMES = [
  "Oak",
  "Maple",
  "Pine",
  "Cedar",
  "Elm",
  "Birch",
  "Spruce",
  "Ash",
  "Main",
  "Central",
  "Market",
  "Commerce",
  "Park",
];

const SUFFIXES = ["Ave", "St", "Rd", "Lane", "Drive", "Circle", "Court", "Way"];

const RAL_KEYWORDS_HIGH = [
  "This well-established assisted living home features 6 spacious bedrooms, each with ADA bathrooms and grab bars installed.",
  "Commercial kitchen setup with fire suppression system. Currently operating as a care facility. 7 beds, excellent licensing.",
  "Board and care home with ADA compliant layout, nurse call system throughout, wheelchair accessible design.",
  "Memory care property with state-licensed setup, 8 bedrooms, wide doorways, commercial-grade sprinkler system.",
  "AHCA licensed adult family home. 6 spacious rooms, roll-in showers, fire suppression system already installed.",
];

const RAL_KEYWORDS_MEDIUM = [
  "Spacious home with 6 bedrooms, 2.5 bathrooms, ADA bathroom, grab bars, 36-inch doorways throughout.",
  "Well-maintained property with fire suppression system, wide hallways, zero-threshold entry, caretaker suite.",
  "Multigenerational home with 7 bedrooms, wheelchair ramps, accessible bathrooms, commercial kitchen.",
  "Property features grab bars, roll-in shower, ADA accessible design, fire suppression, 5 bedrooms.",
  "Wide doors, accessible bathrooms, caretaker suite included, commercial kitchen, suitable for group setting.",
];

const NEUTRAL_DESCRIPTIONS = [
  "Beautiful family home with 4 spacious bedrooms, updated kitchen, hardwood floors throughout.",
  "Recently renovated property with modern amenities, perfect for small family or as investment property.",
  "Cozy home featuring 3 bedrooms, 2 bathrooms, large backyard, close to schools and shopping.",
  "Charming property with character, original hardwood floors, updated utilities, move-in ready.",
  "Well-maintained home in quiet neighborhood, recently updated systems, great investment potential.",
];

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generateAddress(): string {
  const streetNum = randomInt(100, 9999);
  const streetName = STREET_NAMES[Math.floor(Math.random() * STREET_NAMES.length)];
  const suffix = SUFFIXES[Math.floor(Math.random() * SUFFIXES.length)];
  return `${streetNum} ${streetName} ${suffix}`;
}

export async function scanCity(city: CityRecord): Promise<ScannedListing[]> {
  // Generate 8-14 mock listings
  const listingCount = randomInt(8, 14);
  const listings: ScannedListing[] = [];

  for (let i = 0; i < listingCount; i++) {
    const rand = Math.random();
    let description: string;

    // Distribution: 20% HIGH, 30% MEDIUM, 20% LOW, 30% NEUTRAL (filtered out)
    if (rand < 0.2) {
      description = RAL_KEYWORDS_HIGH[Math.floor(Math.random() * RAL_KEYWORDS_HIGH.length)];
    } else if (rand < 0.5) {
      description = RAL_KEYWORDS_MEDIUM[Math.floor(Math.random() * RAL_KEYWORDS_MEDIUM.length)];
    } else if (rand < 0.7) {
      description = NEUTRAL_DESCRIPTIONS[Math.floor(Math.random() * NEUTRAL_DESCRIPTIONS.length)];
    } else {
      continue; // Skip neutral with low keyword relevance
    }

    const price = randomInt(city.price_min, city.price_max);
    const bedrooms = randomInt(3, 8);
    const bathrooms = Math.round((bedrooms / 2 + Math.random()) * 10) / 10;
    const sqft = randomInt(1400, 4200);

    listings.push({
      address: generateAddress(),
      city: city.name,
      state: city.state,
      price,
      bedrooms,
      bathrooms,
      sqft,
      description,
      listingUrl: `https://example.com/listing/${Math.random().toString(36).substring(7)}`,
      source: "demo",
    });
  }

  // Simulate network delay
  await new Promise((resolve) => setTimeout(resolve, 500));

  return listings;
}
