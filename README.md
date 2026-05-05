# InvestIQ — Personal Investment Portfolio Dashboard

A personal investment dashboard with live market data, multi-platform portfolio tracking,
and a 4-agent Claude AI advisor system that analyses your portfolio like a private wealth manager.

---

## What's Inside

```
Personal Investments/
├── standalone/index.html     ← Open in browser RIGHT NOW — no install needed
├── proxy/claude_proxy.py     ← CORS bridge so standalone can call Claude API
└── README.md
```

---

## Option A — Standalone HTML (Works Right Now)

1. Open `standalone/index.html` in Chrome or Edge
2. Sample data is pre-loaded — click around to explore
3. Click **Add Holding** to add your real investments
4. Click **Import CSV** to bulk-import (see `standalone/sample-portfolio.csv`)
5. For AI Agents: go to ⚙ Settings → enter your Claude API key

**Getting a Claude API key:**
- Visit https://console.anthropic.com
- Create an account → API Keys → Create Key
- Free tier gives enough tokens for ~50 portfolio analyses

**If AI Agents fail (CORS error):**
- Install Python from https://python.org
- Run: `python proxy/claude_proxy.py`
- Set Proxy URL to `http://localhost:8080` in dashboard Settings

---

## Option B — Next.js Webapp (Shareable via Vercel)

This is the full version with server-side Claude API calls, persistent portfolio storage,
and a shareable URL you can access from any device.

### Step 1 — Install Node.js
Download from https://nodejs.org (LTS version) and install.

### Step 2 — Install dependencies
```bash
cd webapp
npm install
```

### Step 3 — Configure API key
```bash
# Copy the example env file
copy .env.local.example .env.local

# Edit .env.local and add your Claude API key:
ANTHROPIC_API_KEY=sk-ant-api03-your-key-here
PORTFOLIO_NAME=My Portfolio
BASE_CURRENCY=GBP
```

### Step 4 — Run locally
```bash
npm run dev
# Open http://localhost:3000
```

### Step 5 — Deploy to Vercel (for sharing)
```bash
# Install Vercel CLI
npm install -g vercel

# Deploy (follow prompts)
vercel

# Set your API key in Vercel dashboard:
# Project → Settings → Environment Variables → ANTHROPIC_API_KEY
```

Your dashboard will be live at `https://your-project.vercel.app` — shareable with anyone.

---

## How the AI Multi-Agent System Works

When you click **Run AI Agents**, 4 specialised Claude agents analyse your portfolio:

```
Portfolio Data + Market Data
         │
         ├─→ 🏥 Portfolio Health Agent  ─────────────────┐
         │     Scores diversification, concentration,     │
         │     and overall health (0-100 score)           │
         │                                                │
         ├─→ 🎯 Opportunity Scout Agent ─────────────────┤
         │     Finds underrepresented sectors,            │  → 💼 Advisor
         │     suggests specific instruments               │     (Orchestrator)
         │                                                │     Synthesises all
         └─→ 🌍 Market Impact Agent ───────────────────→ ┘     into prioritised
               Links global macro trends to                     action plan
               your specific holdings
```

The advisor then produces a personalised action plan based on all three agents' findings.

---

## Adding Your Investments

### Manual Entry
Click **Add Holding** and fill in:
- **Symbol**: Yahoo Finance ticker (AAPL, BTC-USD, VWRL.L, TSCO.L)
- **Platform**: Where you hold it (Vanguard ISA, HSBC, Coinbase, etc.)
- **Quantity** and **Purchase Price**

### CSV Import
Format your CSV with these columns:
```
symbol,name,type,platform,quantity,currency,purchasePrice,purchaseDate,sector,country
AAPL,Apple Inc.,stock,Interactive Brokers,10,USD,145.00,2023-01-15,Technology,US
VWRL.L,Vanguard All-World,etf,Vanguard ISA,50,GBP,95.00,2022-06-01,Global,Global
BTC-USD,Bitcoin,crypto,Coinbase,0.15,USD,28000,2023-03-10,Crypto,Global
```

### Supported Asset Types
| Type | Description | Symbol format |
|------|-------------|---------------|
| stock | Individual stocks | AAPL, TSCO.L, RELIANCE.NS |
| etf | ETFs & index funds | VWRL.L, CSPX.L, QQQ |
| crypto | Cryptocurrencies | BTC-USD, ETH-USD |
| bond | Bonds & gilts | Any Yahoo Finance bond symbol |
| mutualfund | Mutual funds | Fund symbol |
| realestate | Property / REITs | VNQ, REIT ticker |
| cash | Cash savings | Manual value, no live price |
| other | Everything else | Any symbol |

### UK Stocks
Add `.L` suffix: `TSCO.L` (Tesco), `BARC.L` (Barclays), `SHEL.L` (Shell)

### Indian Stocks
Add `.NS` suffix: `RELIANCE.NS`, `TCS.NS`, `INFY.NS`

---

## Live Market Data

Prices update automatically every 5 minutes from Yahoo Finance. The dashboard shows:
- **Major indices**: S&P 500, NASDAQ, FTSE 100, Nikkei, DAX, Hang Seng
- **Commodities**: Gold, Silver, Crude Oil, Natural Gas
- **Crypto**: Bitcoin, Ethereum, BNB
- **FX rates**: USD/GBP, EUR/GBP, INR/GBP

---

## Connecting Real Bank Accounts

For fully automatic bank connectivity (no manual entry), you'll need to integrate a
financial data aggregator. Here are the options by region:

| Provider | Region | How to add |
|----------|--------|-----------|
| **Plaid** | US, UK, EU | plaid.com — requires app registration |
| **TrueLayer** | UK, EU | truelayer.com — connects to most UK banks |
| **Salt Edge** | Global | saltedge.com — 5,000+ banks |
| **Open Banking (UK)** | UK | Any FCA-authorised app |

Until then, export a CSV from your bank/broker and use **Import CSV** in the dashboard.
Most platforms support CSV export:
- **Vanguard UK**: Account → Transactions → Download
- **Hargreaves Lansdown**: Portfolio → Download Portfolio
- **Trading 212**: Account → History → Export
- **Coinbase**: Taxes → Generate Report → Download

---

## Security Notes

- The standalone version stores data in your browser's localStorage — never leaves your device
- The Next.js version stores data in `webapp/data/portfolio.json` on your server
- API keys are never sent anywhere except directly to Anthropic's servers
- If deploying to Vercel, set `DASHBOARD_PASSWORD` in environment variables to password-protect your dashboard

---

## Support & Next Steps

- Telegram alerts for significant portfolio moves: ask Claude Code to add them
- Automated daily email digest: ask Claude Code to add a cron job
- Additional data sources (Plaid, TrueLayer): ask Claude Code to integrate them
- Mobile PWA support: already works on mobile browser, ask to make it installable
