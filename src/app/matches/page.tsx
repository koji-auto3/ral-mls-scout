"use client";

import { useEffect, useRef, useState } from "react";

interface Match {
  id: number;
  address: string;
  city: string;
  state: string;
  price: number;
  bedrooms: number;
  bathrooms: number;
  sqft: number;
  score: "HIGH" | "MEDIUM" | "LOW";
  matched_keywords: string;       // structural signals
  description_keywords: string;   // keywords found in listing text
  ai_summary: string;
  raw_description: string;
  description_text: string;
  enrich_status: "pending" | "done" | "failed" | "";
  listing_url: string;
  created_at: string;
}

type FilterScore = "ALL" | "HIGH" | "MEDIUM" | "LOW";

const SCORE_COLORS = {
  HIGH: {
    bg: "var(--primary)",
    text: "var(--primary-foreground)",
    border: "var(--primary)",
    pill: "#dc2626",
  },
  MEDIUM: {
    bg: "var(--gold-muted)",
    text: "var(--foreground)",
    border: "var(--gold-muted)",
    pill: "#ca8a04",
  },
  LOW: {
    bg: "var(--secondary)",
    text: "var(--foreground)",
    border: "var(--secondary)",
    pill: "#16a34a",
  },
};

export default function MatchesPage() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterScore>("ALL");
  const [listingSignalsOnly, setListingSignalsOnly] = useState(false);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetchMatches();
    return () => { if (pollRef.current) clearTimeout(pollRef.current); };
  }, []);

  async function fetchMatches() {
    try {
      const response = await fetch("/api/matches?limit=1000");
      if (response.ok) {
        const data: Match[] = await response.json();
        setMatches(data);
        // Keep polling while any match is still being enriched
        const hasPending = data.some((m) => m.enrich_status === "pending");
        if (hasPending) {
          pollRef.current = setTimeout(fetchMatches, 3000);
        }
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

  const hasListingSignals = (m: Match) =>
    JSON.parse(m.description_keywords || "[]").length > 0;

  const listingSignalsCount = matches.filter(hasListingSignals).length;

  const highMatches = matches.filter((m) => m.score === "HIGH");
  const mediumMatches = matches.filter((m) => m.score === "MEDIUM");
  const lowMatches = matches.filter((m) => m.score === "LOW");

  const counts: Record<FilterScore, number> = {
    ALL: matches.length,
    HIGH: highMatches.length,
    MEDIUM: mediumMatches.length,
    LOW: lowMatches.length,
  };

  const visibleMatches = matches
    .filter((m) => filter === "ALL" || m.score === filter)
    .filter((m) => !listingSignalsOnly || hasListingSignals(m));

  return (
    <div className="p-8" style={{ backgroundColor: "var(--background)" }}>
      <h1 className="text-4xl font-bold mb-6">All Matches</h1>

      {/* ── Filter bar ── */}
      <div className="flex gap-2 flex-wrap items-center mb-8">
        {(["ALL", "HIGH", "MEDIUM", "LOW"] as FilterScore[]).map((f) => {
          const active = filter === f;
          const label =
            f === "ALL"
              ? `All (${counts.ALL})`
              : f === "HIGH"
              ? `🔴 High (${counts.HIGH})`
              : f === "MEDIUM"
              ? `🟡 Medium (${counts.MEDIUM})`
              : `🟢 Low (${counts.LOW})`;

          return (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className="px-4 py-2 rounded-full text-sm font-semibold transition-all"
              style={{
                backgroundColor: active ? "var(--primary)" : "var(--card)",
                color: active ? "var(--primary-foreground)" : "var(--text-secondary)",
                border: `1px solid ${active ? "var(--primary)" : "var(--border)"}`,
                cursor: "pointer",
              }}
            >
              {label}
            </button>
          );
        })}

        {/* Divider */}
        <span style={{ color: "var(--border)", userSelect: "none" }}>|</span>

        {/* Listing signals toggle */}
        <button
          onClick={() => setListingSignalsOnly((v) => !v)}
          className="px-4 py-2 rounded-full text-sm font-semibold transition-all"
          style={{
            backgroundColor: listingSignalsOnly ? "rgba(234,179,8,0.2)" : "var(--card)",
            color: listingSignalsOnly ? "#ca8a04" : "var(--text-secondary)",
            border: `1px solid ${listingSignalsOnly ? "rgba(234,179,8,0.6)" : "var(--border)"}`,
            cursor: "pointer",
          }}
        >
          ✦ Listing Signals Only ({listingSignalsCount})
        </button>
      </div>

      {/* ── Match list ── */}
      {visibleMatches.length === 0 ? (
        <div
          className="rounded-lg p-8 text-center"
          style={{ backgroundColor: "var(--card)" }}
        >
          <p style={{ color: "var(--text-tertiary)" }}>
            {matches.length === 0
              ? "No matches yet. Configure cities and run a scan."
              : `No ${filter.toLowerCase()} priority matches.`}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {visibleMatches.map((match) => (
            <MatchCard key={match.id} match={match} />
          ))}
        </div>
      )}
    </div>
  );
}

function MatchCard({ match }: { match: Match }) {
  const structuralKeywords: string[] = JSON.parse(match.matched_keywords || "[]");
  const descriptionKeywords: string[] = JSON.parse(match.description_keywords || "[]");
  const colors = SCORE_COLORS[match.score];

  // Parse raw_description chips: "7bd/2ba | 2,100 sqft | Built 1965 | location"
  const descParts = match.raw_description
    ? match.raw_description.split("|").map((s) => s.trim()).filter(Boolean)
    : [];

  return (
    <div
      className="rounded-lg p-6 border"
      style={{ backgroundColor: "var(--card)", borderColor: "var(--border)" }}
    >
      {/* Header */}
      <div className="flex justify-between items-start mb-1">
        <div>
          <h3 className="text-lg font-bold">{match.address}</h3>
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            {match.city}, {match.state}
          </p>
        </div>
        <div
          className="px-3 py-1 rounded-full text-sm font-bold shrink-0 ml-4"
          style={{ backgroundColor: colors.bg, color: colors.text }}
        >
          {match.score}
        </div>
      </div>

      {/* Price + property chips */}
      <p className="text-lg font-semibold mb-3" style={{ color: "var(--foreground)" }}>
        ${match.price.toLocaleString()}
      </p>

      {descParts.length > 0 && (
        <div className="flex gap-2 flex-wrap mb-4">
          {descParts.map((part, idx) => (
            <span
              key={idx}
              className="text-xs px-2 py-1 rounded"
              style={{
                backgroundColor: "var(--surface-elevated)",
                color: "var(--text-secondary)",
                border: "1px solid var(--border)",
              }}
            >
              {part}
            </span>
          ))}
        </div>
      )}

      {/* ── Why it's rated this way ── */}
      <div
        className="rounded-md px-4 py-3 mb-4"
        style={{
          backgroundColor: "var(--surface-elevated)",
          borderLeft: `3px solid ${colors.pill}`,
        }}
      >
        {/* Structural signals */}
        {structuralKeywords.length > 0 && (
          <div className="mb-3">
            <p className="text-xs font-semibold uppercase mb-2" style={{ color: "var(--text-tertiary)" }}>
              Physical Match
            </p>
            <div className="flex gap-2 flex-wrap">
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
          </div>
        )}

        {/* Listing signals — the important ones */}
        {match.enrich_status === "done" && (
          <div>
            <p className="text-xs font-semibold uppercase mb-2" style={{ color: "var(--text-tertiary)" }}>
              Listing Signals
            </p>
            {descriptionKeywords.length > 0 ? (
              <div className="flex gap-2 flex-wrap">
                {descriptionKeywords.map((kw, idx) => (
                  <span
                    key={idx}
                    className="text-xs px-2 py-1 rounded font-semibold"
                    style={{
                      backgroundColor: "rgba(234,179,8,0.15)",
                      border: `1px solid rgba(234,179,8,0.5)`,
                      color: "#ca8a04",
                    }}
                  >
                    ✦ {kw}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs italic" style={{ color: "var(--text-tertiary)" }}>
                No additional RAL signals found in listing text.
              </p>
            )}
          </div>
        )}

        {match.enrich_status === "pending" && (
          <p className="text-xs italic mt-1" style={{ color: "var(--text-tertiary)" }}>
            ⏳ Scanning listing for additional signals…
          </p>
        )}

        {match.enrich_status === "failed" && (
          <p className="text-xs italic mt-1" style={{ color: "var(--text-tertiary)" }}>
            ⚠️ Could not retrieve listing description.
          </p>
        )}
      </div>

      {/* Full listing description with highlights */}
      {match.description_text && (
        <div
          className="rounded-md px-4 py-3 mb-4 text-sm"
          style={{
            backgroundColor: "var(--surface-elevated)",
            border: "1px solid var(--border)",
          }}
        >
          <p className="text-xs font-semibold uppercase mb-2" style={{ color: "var(--text-tertiary)" }}>
            Listing Description
          </p>
          <p style={{ color: "var(--text-secondary)", lineHeight: "1.7" }}>
            <HighlightedDescription
              text={match.description_text}
              keywords={descriptionKeywords}
            />
          </p>
        </div>
      )}

      <a
        href={match.listing_url}
        target="_blank"
        rel="noopener noreferrer"
        style={{ color: "var(--primary)" }}
        className="text-sm"
      >
        View Listing on Redfin →
      </a>
    </div>
  );
}

// Highlight matched keywords within description text
function HighlightedDescription({
  text,
  keywords,
}: {
  text: string;
  keywords: string[];
}) {
  if (!keywords.length) return <>{text}</>;

  // Build a regex from all keywords (structural signals like "7 bedrooms — …" won't match text, that's fine)
  const textKeywords = keywords.filter((kw) => kw.length < 60); // skip long structural signals
  if (!textKeywords.length) return <>{text}</>;

  const escaped = textKeywords.map((kw) =>
    kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  );
  const regex = new RegExp(`(${escaped.join("|")})`, "gi");
  const parts = text.split(regex);

  return (
    <>
      {parts.map((part, i) =>
        regex.test(part) ? (
          <mark
            key={i}
            style={{
              backgroundColor: "rgba(234,179,8,0.25)",
              color: "inherit",
              borderRadius: "2px",
              padding: "0 2px",
            }}
          >
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}
