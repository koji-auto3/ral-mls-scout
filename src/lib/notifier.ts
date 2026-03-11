import { MatchRecord } from "./db";

export async function sendTelegramAlert(
  match: MatchRecord,
  settings: Record<string, string>
): Promise<void> {
  const botToken = settings["telegram_token"];
  const chatId = settings["telegram_chat_id"];

  if (!botToken || !chatId) {
    console.warn("Telegram settings not configured. Skipping notification.");
    return;
  }

  const keywords = JSON.parse(match.matched_keywords || "[]") as string[];
  const message = `
🏠 RAL OPPORTUNITY — ${match.score}
📍 ${match.address}, ${match.city} ${match.state}
💰 $${match.price.toLocaleString()} | ${match.bedrooms}bd / ${match.bathrooms}ba | ${match.sqft.toLocaleString()} sqft
⭐ Score: ${match.score}
🔑 Keywords: ${keywords.join(", ")}
🤖 ${match.ai_summary}
🔗 ${match.listing_url}
  `.trim();

  try {
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: "Markdown",
      }),
    });

    if (!response.ok) {
      console.error("Telegram send failed:", response.statusText);
    }
  } catch (error) {
    console.error("Telegram notification error:", error);
  }
}
