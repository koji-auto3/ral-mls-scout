// In-memory store pinned to global so Next.js hot-reloads don't wipe it

interface Store {
  cities: Record<number, CityRecord>;
  matches: Record<number, MatchRecord>;
  settings: Record<string, string>;
  nextCityId: number;
  nextMatchId: number;
}

declare global {
  // eslint-disable-next-line no-var
  var __ralStore: Store | undefined;
}

if (!global.__ralStore) {
  global.__ralStore = {
    cities: {},
    matches: {},
    settings: {},
    nextCityId: 1,
    nextMatchId: 1,
  };
}

const store = global.__ralStore;

export function getDb(): any {
  return { prepare: () => ({}) }; // Mock for compatibility
}

export function initDb(): void {
  // In-memory, no initialization needed

  // In-memory initialization (no database tables needed)
}

export interface CityRecord {
  id?: number;
  name: string;
  state: string;
  price_min: number;
  price_max: number;
  active: number;
  last_scanned: string | null;
  listing_count: number;
  created_at: string;
}

export interface MatchRecord {
  id?: number;
  city_id: number;
  address: string;
  city: string;
  state: string;
  price: number;
  bedrooms: number;
  bathrooms: number;
  sqft: number;
  listing_url: string;
  source: string;
  score: "HIGH" | "MEDIUM" | "LOW";
  matched_keywords: string;
  ai_summary: string;
  raw_description: string;
  viewed: number;
  created_at: string;
}

export interface SettingRecord {
  key: string;
  value: string;
}

export function getAllCities(): CityRecord[] {
  return Object.values(store.cities).sort((a, b) => a.name.localeCompare(b.name));
}

export function addCity(name: string, state: string, price_min: number, price_max: number): CityRecord {
  const id = store.nextCityId++;
  const city: CityRecord = {
    id,
    name,
    state,
    price_min,
    price_max,
    active: 1,
    last_scanned: null,
    listing_count: 0,
    created_at: new Date().toISOString(),
  };
  store.cities[id] = city;
  return city;
}

export function deleteCity(id: number): void {
  delete store.cities[id];
  Object.keys(store.matches).forEach((key) => {
    if (store.matches[parseInt(key)].city_id === id) {
      delete store.matches[parseInt(key)];
    }
  });
}

export function getCityCount(): number {
  return Object.values(store.cities).filter((c) => c.active === 1).length;
}

export function getAllMatches(cityId?: number, score?: string, limit: number = 100): MatchRecord[] {
  let matches = Object.values(store.matches);

  if (cityId) {
    matches = matches.filter((m) => m.city_id === cityId);
  }
  if (score) {
    matches = matches.filter((m) => m.score === score);
  }

  return matches
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, limit);
}

export function addMatch(match: Omit<MatchRecord, "id" | "created_at">): MatchRecord {
  const id = store.nextMatchId++;
  const fullMatch: MatchRecord = {
    ...match,
    id,
    created_at: new Date().toISOString(),
  };
  store.matches[id] = fullMatch;
  return fullMatch;
}

export function getSetting(key: string): string | null {
  return store.settings[key] || null;
}

export function setSetting(key: string, value: string): void {
  store.settings[key] = value;
}

export function getAllSettings(): Record<string, string> {
  return { ...store.settings };
}

export function getMatchStats(): {
  total: number;
  high: number;
  medium: number;
  low: number;
} {
  const matches = Object.values(store.matches);
  return {
    total: matches.length,
    high: matches.filter((m) => m.score === "HIGH").length,
    medium: matches.filter((m) => m.score === "MEDIUM").length,
    low: matches.filter((m) => m.score === "LOW").length,
  };
}
