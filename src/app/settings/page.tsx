"use client";

import { useEffect, useState } from "react";

export default function SettingsPage() {
  const [settings, setSettings] = useState({
    telegram_token: "",
    telegram_chat_id: "",
  });
  const [showToken, setShowToken] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchSettings();
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

  async function handleSave() {
    setSaving(true);
    try {
      const promises = [
        fetch("/api/settings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            key: "telegram_token",
            value: settings.telegram_token,
          }),
        }),
        fetch("/api/settings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            key: "telegram_chat_id",
            value: settings.telegram_chat_id,
          }),
        }),
      ];

      await Promise.all(promises);
      alert("Settings saved!");
    } catch (error) {
      console.error("Failed to save settings:", error);
      alert("Error saving settings");
    } finally {
      setSaving(false);
    }
  }

  async function handleTestNotification() {
    if (!settings.telegram_token || !settings.telegram_chat_id) {
      alert("Please configure Telegram settings first");
      return;
    }

    try {
      const response = await fetch("/api/settings/test-notification", {
        method: "POST",
      });

      if (response.ok) {
        alert("Test message sent! Check your Telegram.");
      } else {
        alert("Failed to send test message");
      }
    } catch (error) {
      console.error("Test notification error:", error);
      alert("Error sending test message");
    }
  }

  return (
    <div className="p-8" style={{ backgroundColor: "var(--background)" }}>
      <h1 className="text-4xl font-bold mb-8">Settings</h1>

      {/* Telegram Section */}
      <div
        className="rounded-lg p-8 border mb-8"
        style={{
          backgroundColor: "var(--card)",
          borderColor: "var(--border)",
        }}
      >
        <h2 className="text-2xl font-bold mb-6">Telegram Notifications</h2>

        <div className="mb-4">
          <label style={{ color: "var(--text-secondary)" }} className="text-sm">
            Bot Token
          </label>
          <div className="flex gap-2 mt-1">
            <input
              type={showToken ? "text" : "password"}
              placeholder="123456789:ABCDefGHIJKlmnoPqrsTuvwxyzABC"
              value={settings.telegram_token}
              onChange={(e) =>
                setSettings({ ...settings, telegram_token: e.target.value })
              }
              className="flex-1"
            />
            <button
              onClick={() => setShowToken(!showToken)}
              style={{
                backgroundColor: "var(--secondary)",
                color: "var(--foreground)",
                minWidth: "auto",
                padding: "0.75rem",
              }}
            >
              {showToken ? "Hide" : "Show"}
            </button>
          </div>
          <p style={{ color: "var(--text-tertiary)" }} className="text-xs mt-2">
            Create one with @BotFather on Telegram
          </p>
        </div>

        <div className="mb-6">
          <label style={{ color: "var(--text-secondary)" }} className="text-sm">
            Chat ID
          </label>
          <input
            type="text"
            placeholder="123456789"
            value={settings.telegram_chat_id}
            onChange={(e) =>
              setSettings({ ...settings, telegram_chat_id: e.target.value })
            }
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
        style={{
          backgroundColor: "var(--card)",
          borderColor: "var(--border)",
        }}
      >
        <h2 className="text-2xl font-bold mb-4">About</h2>
        <p style={{ color: "var(--text-secondary)" }} className="mb-2">
          RAL Scout v1.0
        </p>
        <p style={{ color: "var(--text-tertiary)" }} className="text-sm">
          Built for Brandon Turner. Find assisted living opportunities in your market.
        </p>
      </div>

      {/* Save Button */}
      <div className="mt-8">
        <button
          onClick={handleSave}
          disabled={saving}
          style={{ opacity: saving ? 0.7 : 1 }}
        >
          {saving ? "Saving..." : "Save Settings"}
        </button>
      </div>
    </div>
  );
}
