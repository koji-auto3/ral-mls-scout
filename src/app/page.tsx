"use client";

import { useEffect, useState } from "react";

interface StatsData {
  activeCities: number;
  totalMatches: number;
  highMatches: number;
  lastScan: string;
}

interface Match {
  id: number;
  address: string;
  city: string;
  state: string;
  price: number;
  bedrooms: number;
  bathrooms: number;
  score: "HIGH" | "MEDIUM" | "LOW";
  matched_keywords: string;
  ai_summary: string;
  listing_url: string;
  created_at: string;
}

export default function Dashboard() {
  const [stats, setStats] = useState<StatsData>({
    activeCities: 0,
    totalMatches: 0,
    highMatches: 0,
    lastScan: "Never",
  });
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    try {
      const [statsRes, matchesRes] = await Promise.all([
        fetch("/api/stats"),
        fetch("/api/matches?limit=10"),
      ]);

      if (statsRes.ok) {
        setStats(await statsRes.json());
      }
      if (matchesRes.ok) {
        setMatches(await matchesRes.json());
      }
    } catch (error) {
      console.error("Failed to fetch data:", error);
    } finally {
      setLoading(false);
    }
  }

  async function handleScan() {
    setScanning(true);
    try {
      const response = await fetch("/api/scan", { method: "POST" });
      if (response.ok) {
        await fetchData();
        alert("Scan completed!");
      }
    } catch (error) {
      console.error("Scan failed:", error);
      alert("Scan failed. Check console for details.");
    } finally {
      setScanning(false);
    }
  }

  return (
    <div className="p-8" style={{ backgroundColor: "var(--background)" }}>
      <h1 className="text-4xl font-bold mb-8">Dashboard</h1>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <StatCard label="Active Cities" value={stats.activeCities} icon="🏙️" />
        <StatCard label="Total Matches" value={stats.totalMatches} icon="🔍" />
        <StatCard label="High Priority" value={stats.highMatches} icon="⭐" />
        <StatCard label="Last Scan" value={stats.lastScan} icon="🕐" />
      </div>

      {/* Scan Button */}
      <div className="mb-8">
        <button
          onClick={handleScan}
          disabled={scanning}
          style={{
            backgroundImage: "linear-gradient(135deg, hsl(45 100% 60%), hsl(35 100% 50%))",
            opacity: scanning ? 0.7 : 1,
          }}
        >
          {scanning ? "Scanning..." : "Scan All Cities Now"}
        </button>
      </div>

      {/* Recent Matches */}
      <div>
        <h2 className="text-2xl font-bold mb-4">Recent Matches</h2>
        {matches.length === 0 ? (
          <div
            className="rounded-lg p-8 text-center"
            style={{ backgroundColor: "var(--card)" }}
          >
            <p style={{ color: "var(--text-tertiary)" }}>
              No matches yet. Add cities and run a scan to get started.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {matches.map((match) => (
              <MatchCard key={match.id} match={match} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: string | number;
  icon: string;
}) {
  return (
    <div
      className="rounded-lg p-6 border"
      style={{
        backgroundColor: "var(--card)",
        borderColor: "var(--border)",
      }}
    >
      <div className="flex items-start justify-between">
        <div>
          <p style={{ color: "var(--text-secondary)" }} className="text-sm mb-2">
            {label}
          </p>
          <p className="text-3xl font-bold" style={{ color: "var(--primary)" }}>
            {value}
          </p>
        </div>
        <span className="text-2xl">{icon}</span>
      </div>
    </div>
  );
}

function MatchCard({ match }: { match: Match }) {
  const scoreBgColor =
    match.score === "HIGH"
      ? "var(--primary)"
      : match.score === "MEDIUM"
      ? "var(--gold-muted)"
      : "var(--secondary)";

  const scoreTxColor =
    match.score === "HIGH" ? "var(--primary-foreground)" : "var(--foreground)";

  const keywords = JSON.parse(match.matched_keywords || "[]");

  return (
    <div
      className="rounded-lg p-6 border hover:border-yellow-500 transition-colors"
      style={{
        backgroundColor: "var(--card)",
        borderColor: "var(--border)",
      }}
    >
      <div className="flex justify-between items-start mb-3">
        <div>
          <h3 className="text-lg font-bold">{match.address}</h3>
          <p style={{ color: "var(--text-secondary)" }}>
            {match.city}, {match.state}
          </p>
        </div>
        <div
          className="px-3 py-1 rounded-full text-sm font-bold"
          style={{
            backgroundColor: scoreBgColor,
            color: scoreTxColor,
          }}
        >
          {match.score}
        </div>
      </div>

      <div className="flex gap-4 mb-3 text-sm" style={{ color: "var(--text-secondary)" }}>
        <span>${match.price.toLocaleString()}</span>
        <span>{match.bedrooms}bd / {match.bathrooms}ba</span>
      </div>

      <div className="flex gap-2 flex-wrap mb-3">
        {keywords.map((kw: string, idx: number) => (
          <span
            key={idx}
            className="text-xs px-2 py-1 rounded border"
            style={{
              backgroundColor: "var(--surface-elevated)",
              borderColor: "var(--primary)",
              color: "var(--primary)",
            }}
          >
            {kw}
          </span>
        ))}
      </div>

      <p style={{ color: "var(--text-tertiary)" }} className="text-sm italic mb-3">
        {match.ai_summary}
      </p>

      <a
        href={match.listing_url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-block"
        style={{ color: "var(--primary)" }}
      >
        View Listing →
      </a>
    </div>
  );
}
