import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const dbDir = path.join(process.cwd(), "data");
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const dbPath = path.join(dbDir, "ral-scout.db");

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(dbPath);
    db.pragma("journal_mode = WAL");
  }
  return db;
}

export function initDb(): void {
  const database = getDb();

  database.exec(`
    CREATE TABLE IF NOT EXISTS cities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      state TEXT NOT NULL,
      price_min INTEGER DEFAULT 100000,
      price_max INTEGER DEFAULT 1500000,
      active INTEGER DEFAULT 1,
      last_scanned TEXT,
      listing_count INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS matches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      city_id INTEGER REFERENCES cities(id),
      address TEXT NOT NULL,
      city TEXT NOT NULL,
      state TEXT NOT NULL,
      price INTEGER,
      bedrooms INTEGER,
      bathrooms REAL,
      sqft INTEGER,
      listing_url TEXT,
      source TEXT,
      score TEXT CHECK(score IN ('HIGH','MEDIUM','LOW')),
      matched_keywords TEXT,
      ai_summary TEXT,
      raw_description TEXT,
      viewed INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS scan_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      city_id INTEGER,
      listings_scanned INTEGER DEFAULT 0,
      matches_found INTEGER DEFAULT 0,
      started_at TEXT,
      completed_at TEXT,
      error TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_matches_city ON matches(city_id);
    CREATE INDEX IF NOT EXISTS idx_matches_score ON matches(score);
    CREATE INDEX IF NOT EXISTS idx_matches_created ON matches(created_at);
  `);
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
  const database = getDb();
  return database.prepare("SELECT * FROM cities ORDER BY name ASC").all() as CityRecord[];
}

export function addCity(name: string, state: string, price_min: number, price_max: number): CityRecord {
  const database = getDb();
  const result = database
    .prepare("INSERT INTO cities (name, state, price_min, price_max) VALUES (?, ?, ?, ?)")
    .run(name, state, price_min, price_max);
  return { id: result.lastInsertRowid as number, name, state, price_min, price_max, active: 1, last_scanned: null, listing_count: 0, created_at: new Date().toISOString() };
}

export function deleteCity(id: number): void {
  const database = getDb();
  database.prepare("DELETE FROM cities WHERE id = ?").run(id);
  database.prepare("DELETE FROM matches WHERE city_id = ?").run(id);
}

export function getCityCount(): number {
  const database = getDb();
  const result = database.prepare("SELECT COUNT(*) as count FROM cities WHERE active = 1").get() as { count: number };
  return result.count;
}

export function getAllMatches(cityId?: number, score?: string, limit: number = 100): MatchRecord[] {
  const database = getDb();
  let query = "SELECT * FROM matches WHERE 1=1";
  const params: (number | string)[] = [];

  if (cityId) {
    query += " AND city_id = ?";
    params.push(cityId);
  }
  if (score) {
    query += " AND score = ?";
    params.push(score);
  }

  query += " ORDER BY created_at DESC LIMIT ?";
  params.push(limit);

  return database.prepare(query).all(...params) as MatchRecord[];
}

export function addMatch(match: Omit<MatchRecord, "id" | "created_at">): MatchRecord {
  const database = getDb();
  const result = database
    .prepare(
      `INSERT INTO matches (city_id, address, city, state, price, bedrooms, bathrooms, sqft, listing_url, source, score, matched_keywords, ai_summary, raw_description)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      match.city_id,
      match.address,
      match.city,
      match.state,
      match.price,
      match.bedrooms,
      match.bathrooms,
      match.sqft,
      match.listing_url,
      match.source,
      match.score,
      match.matched_keywords,
      match.ai_summary,
      match.raw_description
    );

  return {
    ...match,
    id: result.lastInsertRowid as number,
    created_at: new Date().toISOString(),
  };
}

export function getSetting(key: string): string | null {
  const database = getDb();
  const result = database.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined;
  return result?.value || null;
}

export function setSetting(key: string, value: string): void {
  const database = getDb();
  database.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(key, value);
}

export function getAllSettings(): Record<string, string> {
  const database = getDb();
  const rows = database.prepare("SELECT key, value FROM settings").all() as { key: string; value: string }[];
  return Object.fromEntries(rows.map((row) => [row.key, row.value]));
}

export function getMatchStats(): {
  total: number;
  high: number;
  medium: number;
  low: number;
} {
  const database = getDb();
  const result = database
    .prepare(
      `
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN score = 'HIGH' THEN 1 ELSE 0 END) as high,
      SUM(CASE WHEN score = 'MEDIUM' THEN 1 ELSE 0 END) as medium,
      SUM(CASE WHEN score = 'LOW' THEN 1 ELSE 0 END) as low
    FROM matches
  `
    )
    .get() as { total: number; high: number; medium: number; low: number };

  return {
    total: result.total || 0,
    high: result.high || 0,
    medium: result.medium || 0,
    low: result.low || 0,
  };
}
