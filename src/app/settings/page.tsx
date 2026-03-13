"use client";

import { useEffect, useState } from "react";

export default function SettingsPage() {
  const [settings, setSettings] = useState({
    telegram_token: "",
    telegram_chat_id: "",
  });
  const [showToken, setShowToken] = useState(false);
  const [saving, setSaving] = useState(false);

  // Keywords state
  const [keywords, setKeywords] = useState("");
  const [keywordsSaving, setKeywordsSaving] = useState(false);
  const [keywordsSaved, setKeywordsSaved] = useState(false);
  const [reprocessing, setReprocessing] = useState(false);
  const [reprocessResult, setReprocessResult] = useState<{
    processed: number;
    signalsFound: number;
    upgraded: number;
  } | null>(null);

  useEffect(() => {
    fetchSettings();
    fetchKeywords();
  }, []);

  async function fetchSettings() {
    try {
      const response = await fetch("/api/settings");
      if (response.ok) {
        const data = await response.json();
        setSettings({
          telegram_token: data.telegram_token || "",
          telegram_chat_id: data.telegram_chat_id || "",
        });
      }
    } catch (error) {
      console.error("Failed to fetch settings:", error);
    }
  }

  async function fetchKeywords() {
    try {
      const res = await fetch("/api/keywords");
      if (res.ok) {
        const data = await res.json();
        setKeywords(data.keywords || "");
      }
    } catch (error) {
      console.error("Failed to fetch keywords:", error);
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      await Promise.all([
        fetch("/api/settings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key: "telegram_token", value: settings.telegram_token }),
        }),
        fetch("/api/settings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key: "telegram_chat_id", value: settings.telegram_chat_id }),
        }),
      ]);
      alert("Settings saved!");
    } catch (error) {
      console.error("Failed to save settings:", error);
      alert("Error saving settings");
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveKeywords() {
    setKeywordsSaving(true);
    setKeywordsSaved(false);
    try {
      const res = await fetch("/api/keywords", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keywords }),
      });
      if (res.ok) {
        setKeywordsSaved(true);
        setTimeout(() => setKeywordsSaved(false), 3000);
      }
    } catch (error) {
      console.error("Failed to save keywords:", error);
      alert("Error saving keywords");
    } finally {
      setKeywordsSaving(false);
    }
  }

  async function handleReprocess() {
    setReprocessing(true);
    setReprocessResult(null);
    try {
      const res = await fetch("/api/reprocess", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setReprocessResult({
          processed: data.processed,
          signalsFound: data.signalsFound,
          upgraded: data.upgraded,
        });
      } else {
        alert("Reprocess failed: " + (data.error || "unknown error"));
      }
    } catch (error) {
      console.error("Reprocess error:", error);
      alert("Error during reprocess");
    } finally {
      setReprocessing(false);
    }
  }

  async function handleTestNotification() {
    if (!settings.telegram_token || !settings.telegram_chat_id) {
      alert("Please configure Telegram settings first");
      return;
    }
    try {
      const response = await fetch("/api/settings/test-notification", { method: "POST" });
      if (response.ok) alert("Test message sent! Check your Telegram.");
      else alert("Failed to send test message");
    } catch (error) {
      console.error("Test notification error:", error);
      alert("Error sending test message");
    }
  }

  const keywordCount = keywords.split("\n").filter((k) => k.trim()).length;

  return (
    <div className="p-8" style={{ backgroundColor: "var(--background)" }}>
      <h1 className="text-4xl font-bold mb-8">Settings</h1>

      {/* Keywords Section */}
      <div
        className="rounded-lg p-8 border mb-8"
        style={{ backgroundColor: "var(--card)", borderColor: "var(--border)" }}
      >
        <div className="flex justify-between items-start mb-2">
          <h2 className="text-2xl font-bold">Enrichment Keywords</h2>
          <span
            className="text-sm px-2 py-1 rounded"
            style={{ backgroundColor: "var(--surface-elevated)", color: "var(--text-secondary)" }}
          >
            {keywordCount} keywords
          </span>
        </div>
        <p className="text-sm mb-5" style={{ color: "var(--text-secondary)" }}>
          One keyword per line. Listings whose descriptions contain these words get tagged as signals.
          Matches with 1 signal = LOW, 2+ = MEDIUM, any primary keyword (assisted living, group home, etc.) = HIGH.
        </p>

        <textarea
          value={keywords}
          onChange={(e) => setKeywords(e.target.value)}
          rows={16}
          className="w-full font-mono text-sm mb-5"
          style={{
            backgroundColor: "var(--surface-elevated)",
            border: "1px solid var(--border)",
            borderRadius: 6,
            padding: "0.75rem",
            color: "var(--foreground)",
            resize: "vertical",
            lineHeight: 1.6,
          }}
          placeholder="assisted living&#10;group home&#10;kitchenette&#10;..."
          spellCheck={false}
        />

        <div className="flex gap-3 flex-wrap items-center">
          <button
            onClick={handleSaveKeywords}
            disabled={keywordsSaving}
            style={{
              backgroundColor: "var(--primary)",
              color: "var(--primary-foreground)",
              opacity: keywordsSaving ? 0.7 : 1,
            }}
          >
            {keywordsSaving ? "Saving…" : keywordsSaved ? "✓ Saved" : "Save Keywords"}
          </button>

          <button
            onClick={handleReprocess}
            disabled={reprocessing}
            style={{
              backgroundColor: "var(--secondary)",
              color: "var(--foreground)",
              opacity: reprocessing ? 0.7 : 1,
            }}
          >
            {reprocessing ? "Processing…" : "Re-process Listings"}
          </button>

          {reprocessResult && (
            <span className="text-sm" style={{ color: "var(--text-secondary)" }}>
              ✓ {reprocessResult.processed} listings scanned ·{" "}
              <span style={{ color: "#ca8a04" }}>{reprocessResult.signalsFound} with signals</span>
              {reprocessResult.upgraded > 0 && (
                <span style={{ color: "var(--primary)" }}> · {reprocessResult.upgraded} score upgrades</span>
              )}
            </span>
          )}
        </div>

        <p className="text-xs mt-4" style={{ color: "var(--text-tertiary)" }}>
          Re-process rescores all listings that already have a stored description — no additional Redfin requests needed.
          Run this whenever you update keywords.
        </p>
      </div>

      {/* Telegram Section */}
      <div
        className="rounded-lg p-8 border mb-8"
        style={{ backgroundColor: "var(--card)", borderColor: "var(--border)" }}
      >
        <h2 className="text-2xl font-bold mb-6">Telegram Notifications</h2>

        <div className="mb-4">
          <label style={{ color: "var(--text-secondary)" }} className="text-sm">Bot Token</label>
          <div className="flex gap-2 mt-1">
            <input
              type={showToken ? "text" : "password"}
              placeholder="123456789:ABCDefGHIJKlmnoPqrsTuvwxyzABC"
              value={settings.telegram_token}
              onChange={(e) => setSettings({ ...settings, telegram_token: e.target.value })}
              className="flex-1"
            />
            <button
              onClick={() => setShowToken(!showToken)}
              style={{ backgroundColor: "var(--secondary)", color: "var(--foreground)", minWidth: "auto", padding: "0.75rem" }}
            >
              {showToken ? "Hide" : "Show"}
            </button>
          </div>
          <p style={{ color: "var(--text-tertiary)" }} className="text-xs mt-2">
            Create one with @BotFather on Telegram
          </p>
        </div>

        <div className="mb-6">
          <label style={{ color: "var(--text-secondary)" }} className="text-sm">Chat ID</label>
          <input
            type="text"
            placeholder="123456789"
            value={settings.telegram_chat_id}
            onChange={(e) => setSettings({ ...settings, telegram_chat_id: e.target.value })}
            className="w-full mt-1"
          />
          <p style={{ color: "var(--text-tertiary)" }} className="text-xs mt-2">
            Your personal Telegram chat ID (DM @userinfobot to get it)
          </p>
        </div>

        <button onClick={handleTestNotification} style={{ backgroundColor: "var(--secondary)" }}>
          Send Test Message
        </button>
      </div>

      {/* About Section */}
      <div
        className="rounded-lg p-8 border"
        style={{ backgroundColor: "var(--card)", borderColor: "var(--border)" }}
      >
        <h2 className="text-2xl font-bold mb-4">About</h2>
        <p style={{ color: "var(--text-secondary)" }} className="mb-2">RAL Scout v1.0</p>
        <p style={{ color: "var(--text-tertiary)" }} className="text-sm">
          Built for Brandon Turner. Find assisted living opportunities in your market.
        </p>
      </div>

      {/* Save Telegram Button */}
      <div className="mt-8">
        <button onClick={handleSave} disabled={saving} style={{ opacity: saving ? 0.7 : 1 }}>
          {saving ? "Saving..." : "Save Telegram Settings"}
        </button>
      </div>
    </div>
  );
}
