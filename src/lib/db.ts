import { createClient, Client } from "@libsql/client";

// ── Singleton connection (lazy to avoid build-time crash) ───────────────────

let _client: Client | null = null;

export function getClient(): Client {
  if (!_client) {
    _client = createClient({
      url: process.env.TURSO_DATABASE_URL!,
      authToken: process.env.TURSO_AUTH_TOKEN!,
    });
  }
  return _client;
}

// ── Schema ──────────────────────────────────────────────────────────────────

export async function initDb(): Promise<void> {
  await getClient().execute(`
    CREATE TABLE IF NOT EXISTS cities (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      name          TEXT    NOT NULL,
      state         TEXT    NOT NULL,
      price_min     INTEGER DEFAULT 100000,
      price_max     INTEGER DEFAULT 1500000,
      active        INTEGER DEFAULT 1,
      last_scanned  TEXT,
      listing_count INTEGER DEFAULT 0,
      created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `);

  await getClient().execute(`
    CREATE TABLE IF NOT EXISTS matches (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      city_id             INTEGER,
      address             TEXT    NOT NULL,
      city                TEXT    NOT NULL,
      state               TEXT    NOT NULL,
      price               INTEGER,
      bedrooms            INTEGER,
      bathrooms           REAL,
      sqft                INTEGER,
      listing_url         TEXT,
      source              TEXT,
      score               TEXT,
      matched_keywords    TEXT    DEFAULT '[]',
      description_keywords TEXT   DEFAULT '[]',
      ai_summary          TEXT,
      raw_description     TEXT,
      description_text    TEXT    DEFAULT '',
      enrich_status       TEXT    DEFAULT 'pending',
      viewed              INTEGER DEFAULT 0,
      created_at          TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `);

  await getClient().execute(`
    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);
}

// ── Interfaces ──────────────────────────────────────────────────────────────

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
  description_keywords: string;
  description_text: string;
  ai_summary: string;
  raw_description: string;
  enrich_status: "pending" | "done" | "failed" | "";
  viewed: number;
  created_at: string;
}

export interface SettingRecord {
  key: string;
  value: string;
}

// ── Cities ──────────────────────────────────────────────────────────────────

export async function getAllCities(): Promise<CityRecord[]> {
  const result = await getClient().execute("SELECT * FROM cities ORDER BY name ASC");
  return result.rows as unknown as CityRecord[];
}

export async function addCity(
  name: string,
  state: string,
  price_min: number,
  price_max: number
): Promise<CityRecord> {
  const result = await getClient().execute({
    sql: "INSERT INTO cities (name, state, price_min, price_max, active, listing_count) VALUES (?, ?, ?, ?, 1, 0)",
    args: [name, state, price_min, price_max],
  });
  const row = await getClient().execute({
    sql: "SELECT * FROM cities WHERE id = ?",
    args: [Number(result.lastInsertRowid)],
  });
  return row.rows[0] as unknown as CityRecord;
}

export async function deleteCity(id: number): Promise<void> {
  await getClient().execute({ sql: "DELETE FROM matches WHERE city_id = ?", args: [id] });
  await getClient().execute({ sql: "DELETE FROM cities WHERE id = ?", args: [id] });
}

export async function updateCityLastScanned(id: number, listingCount: number): Promise<void> {
  await getClient().execute({
    sql: "UPDATE cities SET last_scanned = ?, listing_count = ? WHERE id = ?",
    args: [new Date().toISOString(), listingCount, id],
  });
}

export async function getCityCount(): Promise<number> {
  const result = await getClient().execute(
    "SELECT COUNT(*) as cnt FROM cities WHERE active = 1"
  );
  return Number(result.rows[0].cnt);
}

// ── Matches ─────────────────────────────────────────────────────────────────

export async function getAllMatches(
  cityId?: number,
  score?: string,
  limit: number = 100
): Promise<MatchRecord[]> {
  let sql = "SELECT * FROM matches WHERE 1=1";
  const args: (string | number)[] = [];

  if (cityId) {
    sql += " AND city_id = ?";
    args.push(cityId);
  }
  if (score) {
    sql += " AND score = ?";
    args.push(score);
  }

  sql += " ORDER BY created_at DESC LIMIT ?";
  args.push(limit);

  const result = await getClient().execute({ sql, args });
  return result.rows as unknown as MatchRecord[];
}

export async function addMatch(
  match: Omit<MatchRecord, "id" | "created_at">
): Promise<MatchRecord> {
  const result = await getClient().execute({
    sql: `INSERT INTO matches
      (city_id, address, city, state, price, bedrooms, bathrooms, sqft,
       listing_url, source, score, matched_keywords, description_keywords,
       ai_summary, raw_description, description_text, enrich_status, viewed)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
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
      match.description_keywords ?? "[]",
      match.ai_summary,
      match.raw_description,
      match.description_text ?? "",
      match.enrich_status ?? "pending",
      match.viewed,
    ],
  });

  const row = await getClient().execute({
    sql: "SELECT * FROM matches WHERE id = ?",
    args: [Number(result.lastInsertRowid)],
  });
  return row.rows[0] as unknown as MatchRecord;
}

export async function updateMatch(
  id: number,
  patch: Partial<MatchRecord>
): Promise<MatchRecord | null> {
  const existing = await getClient().execute({
    sql: "SELECT * FROM matches WHERE id = ?",
    args: [id],
  });
  if (existing.rows.length === 0) return null;

  const fields = Object.keys(patch).filter((k) => k !== "id" && k !== "created_at");
  if (fields.length === 0) return existing.rows[0] as unknown as MatchRecord;

  const setClauses = fields.map((f) => `${f} = ?`).join(", ");
  const values = fields.map((f) => (patch as Record<string, unknown>)[f]);

  await getClient().execute({
    sql: `UPDATE matches SET ${setClauses} WHERE id = ?`,
    args: [...(values as (string | number | null)[]), id],
  });

  const updated = await getClient().execute({
    sql: "SELECT * FROM matches WHERE id = ?",
    args: [id],
  });
  return updated.rows[0] as unknown as MatchRecord;
}

// ── Settings ────────────────────────────────────────────────────────────────

export async function getSetting(key: string): Promise<string | null> {
  const result = await getClient().execute({
    sql: "SELECT value FROM settings WHERE key = ?",
    args: [key],
  });
  return result.rows.length > 0 ? String(result.rows[0].value) : null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  await getClient().execute({
    sql: "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
    args: [key, value],
  });
}

export async function getAllSettings(): Promise<Record<string, string>> {
  const result = await getClient().execute("SELECT key, value FROM settings");
  const settings: Record<string, string> = {};
  for (const row of result.rows) {
    settings[String(row.key)] = String(row.value);
  }
  return settings;
}

// ── Stats ───────────────────────────────────────────────────────────────────

export async function getMatchStats(): Promise<{
  total: number;
  high: number;
  medium: number;
  low: number;
}> {
  const total = await getClient().execute("SELECT COUNT(*) as cnt FROM matches");
  const high = await getClient().execute(
    "SELECT COUNT(*) as cnt FROM matches WHERE score = 'HIGH'"
  );
  const medium = await getClient().execute(
    "SELECT COUNT(*) as cnt FROM matches WHERE score = 'MEDIUM'"
  );
  const low = await getClient().execute(
    "SELECT COUNT(*) as cnt FROM matches WHERE score = 'LOW'"
  );

  return {
    total: Number(total.rows[0].cnt),
    high: Number(high.rows[0].cnt),
    medium: Number(medium.rows[0].cnt),
    low: Number(low.rows[0].cnt),
  };
}
