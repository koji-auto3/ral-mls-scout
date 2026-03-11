"use client";

import { useEffect, useState } from "react";

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

export default function MatchesPage() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMatches();
  }, []);

  async function fetchMatches() {
    try {
      const response = await fetch("/api/matches?limit=1000");
      if (response.ok) {
        setMatches(await response.json());
      }
    } catch (error) {
      console.error("Failed to fetch matches:", error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="p-8" style={{ backgroundColor: "var(--background)" }}>
        <p style={{ color: "var(--text-secondary)" }}>Loading...</p>
      </div>
    );
  }

  // Group by score
  const highMatches = matches.filter((m) => m.score === "HIGH");
  const mediumMatches = matches.filter((m) => m.score === "MEDIUM");
  const lowMatches = matches.filter((m) => m.score === "LOW");

  return (
    <div className="p-8" style={{ backgroundColor: "var(--background)" }}>
      <h1 className="text-4xl font-bold mb-8">All Matches</h1>

      {matches.length === 0 ? (
        <div
          className="rounded-lg p-8 text-center"
          style={{ backgroundColor: "var(--card)" }}
        >
          <p style={{ color: "var(--text-tertiary)" }}>
            No matches yet. Configure cities and run a scan.
          </p>
        </div>
      ) : (
        <>
          {highMatches.length > 0 && (
            <MatchSection title="🔴 High Priority" matches={highMatches} />
          )}
          {mediumMatches.length > 0 && (
            <MatchSection title="🟡 Medium Priority" matches={mediumMatches} />
          )}
          {lowMatches.length > 0 && (
            <MatchSection title="🟢 Low Priority" matches={lowMatches} />
          )}
        </>
      )}
    </div>
  );
}

function MatchSection({
  title,
  matches,
}: {
  title: string;
  matches: Match[];
}) {
  return (
    <div className="mb-8">
      <h2 className="text-2xl font-bold mb-4">{title}</h2>
      <div className="space-y-4">
        {matches.map((match) => {
          const keywords = JSON.parse(match.matched_keywords || "[]");
          const scoreBgColor =
            match.score === "HIGH"
              ? "var(--primary)"
              : match.score === "MEDIUM"
              ? "var(--gold-muted)"
              : "var(--secondary)";
          const scoreTxColor =
            match.score === "HIGH" ? "var(--primary-foreground)" : "var(--foreground)";

          return (
            <div
              key={match.id}
              className="rounded-lg p-6 border"
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

              <div
                className="flex gap-4 mb-3 text-sm"
                style={{ color: "var(--text-secondary)" }}
              >
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

              <p
                style={{ color: "var(--text-tertiary)" }}
                className="text-sm italic mb-3"
              >
                {match.ai_summary}
              </p>

              <a
                href={match.listing_url}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "var(--primary)" }}
              >
                View Listing →
              </a>
            </div>
          );
        })}
      </div>
    </div>
  );
}
