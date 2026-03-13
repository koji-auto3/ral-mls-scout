# RAL Scout 🏠

**Assisted Living Deal Finder**

RAL Scout automatically watches real estate listings in cities you choose. When it finds a house that might already be set up for senior care, it sends you a text message alert.

---

## What You Need

- A computer (Mac, Windows, or Linux)
- Node.js installed (free download: https://nodejs.org/)
- 10 minutes

---

## Setup

### Step 1: Download the Project

Open Terminal (Mac/Linux) or Command Prompt (Windows) and run:

```bash
git clone https://github.com/YOUR_USERNAME/ral-scout.git
cd ral-scout
```

Or download the ZIP file from GitHub and extract it.

### Step 2: Install Dependencies

In the same terminal, type:

```bash
npm install
```

This downloads all the software this project needs. Wait for it to finish.

### Step 3: Start the App

Type:

```bash
npm run build && npm run start
```

You should see a message saying it's running on `http://localhost:3004`.

### Step 4: Open in Your Browser

Open your web browser and go to:

```
http://localhost:3004
```

You should see the RAL Scout dashboard. Welcome!

### Step 5: Add Target Cities

1. Click **Cities** in the left menu
2. Click **+ Add City**
3. Enter a city name (e.g., `Tampa`)
4. Enter the state (e.g., `FL`)
5. Set price range (optional, defaults to $100K–$1.5M)
6. Click **Add City**

Repeat for as many cities as you want.

### Step 6: Set Up Telegram Notifications

RAL Scout can text you on Telegram when it finds a match. Here's how:

1. **Get a Telegram Bot Token:**
   - Open Telegram (free app: https://telegram.org/)
   - Search for `@BotFather` and open it
   - Type `/newbot`
   - Follow the instructions. You'll get a long token like `123456789:ABCDefGHIJKlmnoPqrsTuvwxyzABC`
   - Copy this token

2. **Get Your Chat ID:**
   - Search for `@userinfobot` in Telegram
   - Type `/start`
   - It will show your chat ID (a number like `123456789`)
   - Copy this number

3. **Add to RAL Scout:**
   - Click **Settings** in the left menu
   - Paste your bot token in "Bot Token"
   - Paste your chat ID in "Chat ID"
   - Click **Send Test Message** to make sure it works
   - Click **Save Settings**

Done! Now you'll get text alerts for high-priority matches.

### Step 7: Run Your First Scan

1. Go back to **Dashboard**
2. Click **Scan All Cities Now**
3. Wait for the scan to finish (usually 1–2 minutes)
4. You should see matches appear on the dashboard and matches page

---

## How It Works

RAL Scout looks for specific keywords in property listings:

**High Priority Signals:**
- "Assisted living", "board and care", "memory care"
- "AHCA licensed", "state licensed care"
- "Nurse call system"

**Physical Setup Signals:**
- Fire suppression system
- ADA bathrooms
- Grab bars
- Wide doorways
- Wheelchair accessible
- Commercial kitchen

Properties with any high-priority keyword get flagged as **HIGH** and you get a text. Properties with 3+ physical setup signals get flagged as **MEDIUM**.

---

## API & Data

All data is stored in a SQLite database at `data/ral-scout.db`. Nothing is sent to the cloud unless you enable Telegram notifications. Your settings and scan history are yours.

---

## Troubleshooting

**"Module not found" error?**
Run `npm install` again and wait for it to finish.

**Telegram test message didn't work?**
Make sure your bot token and chat ID are correct. Check that you're using the right token from @BotFather.

**No matches appearing?**
- Make sure you added cities in the Cities page
- Click "Scan All Cities Now" and wait for it to finish
- If you still see nothing, check that you have active cities

---

## What's Next?

- Monitor matches on the Matches page
- Adjust price ranges per city in the Cities page
- Review AI summaries to decide which properties to investigate
- Click "View Listing" to go directly to the MLS listing

---

## Coming Soon

- **Auto-scan scheduling**: Automatically scan for new listings every 12 hours (coming soon)

---

## Support

Found a bug? Have questions? Open an issue on GitHub.

---

**Built for Brandon Turner. Find your assisted living goldmine.** 🏠
