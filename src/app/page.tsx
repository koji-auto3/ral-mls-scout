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
  description_keywords: string;
  ai_summary: string;
  listing_url: string;
  enrich_status: "pending" | "done" | "failed" | "";
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
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 5;

  // Only show listings with listing signals (description_keywords) on the dashboard
  const signalMatches = matches.filter((m) => {
    try {
      return JSON.parse(m.description_keywords || "[]").length > 0;
    } catch {
      return false;
    }
  });

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    try {
      const [statsRes, matchesRes] = await Promise.all([
        fetch("/api/stats"),
        fetch("/api/matches?limit=2000"),
      ]);

      if (statsRes.ok) {
        setStats(await statsRes.json());
      }
      if (matchesRes.ok) {
        setMatches(await matchesRes.json());
        setPage(0);
      }
    } catch (error) {
      console.error("Failed to fetch data:", error);
    } finally {
      setLoading(false);
    }
  }

  // Compute next scan time: next 1:00 AM ET
  function getNextScanTime(): string {
    const now = new Date();
    // 1:00 AM ET = 06:00 UTC
    const next = new Date();
    next.setUTCHours(6, 0, 0, 0);
    if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
    return next.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: "America/New_York",
    }) + " ET tonight";
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

      {/* Scan status */}
      <div
        className="flex items-center gap-4 mb-8 p-4 rounded-lg"
        style={{ backgroundColor: "var(--card)", border: "1px solid var(--border)" }}
      >
        <div
          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
          style={{ backgroundColor: "#22c55e", boxShadow: "0 0 6px #22c55e" }}
        />
        <div>
          <p className="text-sm font-semibold">Auto-scan active</p>
          <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
            Runs nightly · Next scan: {getNextScanTime()} · Last: {stats.lastScan}
          </p>
        </div>
      </div>

      {/* Recent Matches — listings with signals only */}
      <div>
        <div className="flex justify-between items-center mb-4">
          <div>
            <h2 className="text-2xl font-bold">Listing Signal Matches</h2>
            <p className="text-sm mt-0.5" style={{ color: "var(--text-secondary)" }}>
              Properties with keywords in the listing description
            </p>
          </div>
          {signalMatches.length > 0 && (
            <span className="text-sm" style={{ color: "var(--text-secondary)" }}>
              {signalMatches.length} with signals · showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, signalMatches.length)}
            </span>
          )}
        </div>

        {signalMatches.length === 0 ? (
          <div
            className="rounded-lg p-8 text-center"
            style={{ backgroundColor: "var(--card)" }}
          >
            <p style={{ color: "var(--text-tertiary)" }}>
              {matches.length === 0
                ? "No matches yet. Add cities and run a scan to get started."
                : `${matches.length} matches scanned — none have listing signals yet. Enrichment will pick them up.`}
            </p>
          </div>
        ) : (
          <>
            <div className="space-y-4 mb-4">
              {signalMatches.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map((match) => (
                <MatchCard key={match.id} match={match} />
              ))}
            </div>

            {/* Pagination controls */}
            {signalMatches.length > PAGE_SIZE && (
              <Pagination
                page={page}
                totalPages={Math.ceil(signalMatches.length / PAGE_SIZE)}
                totalItems={signalMatches.length}
                pageSize={PAGE_SIZE}
                onPageChange={setPage}
              />
            )}
          </>
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

  const structuralKeywords: string[] = JSON.parse(match.matched_keywords || "[]");
  const descriptionKeywords: string[] = JSON.parse(match.description_keywords || "[]");

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

      {/* Physical Match tags */}
      {structuralKeywords.length > 0 && (
        <div className="flex gap-2 flex-wrap mb-3">
          {structuralKeywords.map((kw, idx) => (
            <span
              key={idx}
              className="text-xs px-2 py-1 rounded border font-medium"
              style={{
                backgroundColor: "var(--surface-elevated)",
                borderColor: "var(--border)",
                color: "var(--text-secondary)",
              }}
            >
              {kw}
            </span>
          ))}
        </div>
      )}

      {/* Listing Signals tags */}
      {descriptionKeywords.length > 0 && (
        <div className="flex gap-2 flex-wrap mb-3">
          {descriptionKeywords.map((kw, idx) => (
            <span
              key={idx}
              className="text-xs px-2 py-1 rounded font-semibold"
              style={{
                backgroundColor: "rgba(234,179,8,0.15)",
                border: "1px solid rgba(234,179,8,0.5)",
                color: "#ca8a04",
              }}
            >
              ✦ {kw}
            </span>
          ))}
        </div>
      )}

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

function Pagination({
  page,
  totalPages,
  totalItems,
  pageSize,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (p: number) => void;
}) {
  const [inputVal, setInputVal] = useState(String(page + 1));

  // Keep input in sync when page changes externally
  useEffect(() => {
    setInputVal(String(page + 1));
  }, [page]);

  function handleInputCommit() {
    const parsed = parseInt(inputVal, 10);
    if (!isNaN(parsed) && parsed >= 1 && parsed <= totalPages) {
      onPageChange(parsed - 1);
    } else {
      setInputVal(String(page + 1));
    }
  }

  const btnStyle = (disabled: boolean): React.CSSProperties => ({
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 32,
    height: 32,
    borderRadius: 4,
    border: "1px solid var(--border)",
    backgroundColor: "var(--card)",
    color: disabled ? "var(--text-tertiary)" : "var(--foreground)",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.4 : 1,
    fontSize: 14,
    fontWeight: 600,
    userSelect: "none",
  });

  const rangeStart = page * pageSize + 1;
  const rangeEnd = Math.min((page + 1) * pageSize, totalItems);

  return (
    <div
      className="flex items-center justify-center gap-2 mt-6 pt-4"
      style={{ borderTop: "1px solid var(--border)" }}
    >
      {/* First page */}
      <button style={btnStyle(page === 0)} disabled={page === 0} onClick={() => onPageChange(0)} title="First page">
        ⏮
      </button>

      {/* Prev page */}
      <button style={btnStyle(page === 0)} disabled={page === 0} onClick={() => onPageChange(page - 1)} title="Previous page">
        ‹
      </button>

      {/* Page input */}
      <div className="flex items-center gap-2" style={{ color: "var(--text-secondary)", fontSize: 14 }}>
        <input
          type="text"
          value={inputVal}
          onChange={(e) => setInputVal(e.target.value)}
          onBlur={handleInputCommit}
          onKeyDown={(e) => e.key === "Enter" && handleInputCommit()}
          style={{
            width: 52,
            textAlign: "center",
            padding: "4px 6px",
            borderRadius: 4,
            border: "1px solid var(--border)",
            backgroundColor: "var(--card)",
            color: "var(--foreground)",
            fontSize: 14,
          }}
        />
        <span>to {rangeEnd} of {totalItems}</span>
      </div>

      {/* Next page */}
      <button style={btnStyle(page >= totalPages - 1)} disabled={page >= totalPages - 1} onClick={() => onPageChange(page + 1)} title="Next page">
        ›
      </button>

      {/* Last page */}
      <button style={btnStyle(page >= totalPages - 1)} disabled={page >= totalPages - 1} onClick={() => onPageChange(totalPages - 1)} title="Last page">
        ⏭
      </button>
    </div>
  );
}
